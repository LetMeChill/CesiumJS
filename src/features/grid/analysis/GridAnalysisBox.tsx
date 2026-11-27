import type { GridAnalysis } from './gridAnalysisApi';
import { useGridAnalysis, type GridAnalysisState } from './useGridAnalysis';
import './GridAnalysisBox.css';
import '../../../styles/resultSectionHeading.css';

const messages: Record<GridAnalysis['status'], string> = {
  READY: '관측 자료를 바탕으로 분석하고 있습니다.',
  NOT_CONFIGURED: '분석 기능을 연결 중입니다. 아래에서 관측 자료의 비교값을 확인할 수 있습니다.',
  INSUFFICIENT_DATA: '선택 격자의 관측 온도 또는 비교 자료가 부족해 분석할 수 없습니다.',
  COMPLETE: '',
  BUSY: '다른 분석을 처리하고 있습니다. 잠시 후 다시 시도해주세요.',
  LIMIT_REACHED: '분석 생성 한도에 도달했습니다. 나중에 다시 시도해주세요.',
  UNAVAILABLE: '분석하지 못했습니다. 관측값과 기존 예측 결과는 계속 확인할 수 있습니다.',
};
const fmt = (n: number | null) => (n === null ? '자료 없음' : `${n.toFixed(1)}℃`);

function AnalysisSummary({ summary }: { summary: string }) {
  const text = summary
    .replaceAll('온도 차이와 함께 살펴볼 단서이며 원인으로 단정할 수 없습니다.', '')
    .trim();
  const pattern = /평균보다 약 \d+(?:\.\d+)?℃|상대적으로 .*?(?=이 확인됩니다\.)/g;
  const parts = [];
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    parts.push(text.slice(start, match.index));
    parts.push(<u key={match.index}>{match[0]}</u>);
    start = match.index + match[0].length;
  }
  parts.push(text.slice(start));
  return <p className="grid-analysis-summary">{parts}</p>;
}

export default function GridAnalysisBox({
  datasetId,
  gridId,
}: {
  datasetId: number;
  gridId: string;
}) {
  const analysis = useGridAnalysis(datasetId, gridId);
  return <GridAnalysisPanel analysis={analysis} />;
}

export function GridAnalysisPanel({ analysis }: { analysis: GridAnalysisState }) {
  const { data, loading, error, retry } = analysis;
  const retryable = error || (data && ['BUSY', 'UNAVAILABLE'].includes(data.status));
  return (
    <section
      className="grid-analysis-section"
      aria-label="선택한 격자 지표면 온도 원인 분석"
      aria-busy={loading}
    >
      <h3 className="result-section-heading">3. 선택한 격자 지표면 온도 원인 분석</h3>
      <div className="grid-analysis-box">
        <div aria-live="polite">
          {loading ? (
            <p>관측 자료를 바탕으로 분석하고 있습니다.</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : data?.status === 'COMPLETE' && data.summary ? (
            <AnalysisSummary summary={data.summary} />
          ) : data ? (
            <p>{messages[data.status]}</p>
          ) : null}
        </div>
        {data && (
          <section className="grid-analysis-evidence" aria-label="비교 근거 확인">
            <h4>비교 근거 확인</h4>
            <dl>
              <div>
                <dt>선택 격자 관측 온도</dt>
                <dd>{fmt(data.evidence.selected.lstC)}</dd>
              </div>
              <div>
                <dt>비교 격자 평균</dt>
                <dd>{fmt(data.evidence.meanLstC)}</dd>
              </div>
              <div>
                <dt>비교 격자 수</dt>
                <dd>{data.evidence.comparedGridCount.toLocaleString('ko-KR')}개</dd>
              </div>
              <div>
                <dt>온도 관측 시각</dt>
                <dd>
                  {new Date(data.evidence.observedAt).toLocaleString('ko-KR', {
                    timeZone: 'Asia/Seoul',
                  })}
                </dd>
              </div>
            </dl>
          </section>
        )}
        {retryable && (
          <button type="button" disabled={loading} onClick={retry}>
            다시 시도
          </button>
        )}
      </div>
    </section>
  );
}
