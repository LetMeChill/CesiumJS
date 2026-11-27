import { useEffect, useRef, useState } from 'react';
import type { DatasetSummary } from '../../dataset/api/datasetApi';
import type { MapSnapshot } from '../../map/vworldProtocol';
import type { GridMapItem } from '../../grid/api/gridApi';
import {
  getAvailability,
  simulate,
  type Availability,
  type Policy,
  type PredictionGrid,
  type SimulationResult,
} from '../api/simulationApi';
import { GridAnalysisPanel } from '../../grid/analysis/GridAnalysisBox';
import { useGridAnalysis } from '../../grid/analysis/useGridAnalysis';
import SelectionLocation from './SelectionLocation';
import './PolicyWorkspace.css';
import '../../../styles/resultSectionHeading.css';

const number = (value: number | null | undefined, digits = 2) =>
  value == null
    ? '—'
    : value.toLocaleString('ko-KR', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
const signed = (value: number | null | undefined, digits = 2) =>
  value == null
    ? '—'
    : `${value > 0 ? '+' : value < 0 ? '−' : ''}${number(Math.abs(value), digits)}`;
const policyName = (policy: Policy) => (policy === 'green-roof' ? '옥상녹화' : '가로수 식재');
const qualityName = (quality: PredictionGrid['qualityStatus']) =>
  ({ SAME_DAY: '당일 관측 기반', PRIOR_SUPPORTED: '과거 관측 보완', UNAVAILABLE: '계산 불가' })[
    quality
  ];
const reasonName = (reason: string | null) =>
  reason
    ? ((
        {
          HIGH_AEROSOL: '당일 위성영상의 대기 영향이 커 보완 자료가 필요합니다.',
          TOO_FEW_SCENES: '계산에 필요한 과거 관측 자료가 부족합니다.',
          MODEL_INPUT_MISSING: '필요한 모델 입력 자료가 없습니다.',
          BASELINE_UNAVAILABLE: '적용 전 예측을 계산할 수 없습니다.',
          PROXY_MIX_INFEASIBLE: '현재 공간 조건으로 입력 변화를 구성할 수 없습니다.',
          NO_ROOF: '대상 옥상 면적이 없습니다.',
        } as Record<string, string>
      )[reason] ?? '현재 자료의 품질 조건을 충족하지 못했습니다.')
    : '';

function Metric({
  label,
  value,
  delta = false,
}: {
  label: string;
  value: number | null | undefined;
  delta?: boolean;
}) {
  return (
    <article className="policy-metric">
      <span>{label}</span>
      <strong
        className={
          delta && value != null
            ? value < 0
              ? 'temperature-decrease'
              : value > 0
                ? 'temperature-increase'
                : ''
            : ''
        }
      >
        {delta ? signed(value) : number(value)}
        <small> ℃</small>
      </strong>
    </article>
  );
}

export default function PolicyWorkspace({
  dataset,
  selected,
  mapSnapshot,
  mapSnapshotError,
  onClose,
}: {
  dataset: DatasetSummary;
  selected: GridMapItem;
  mapSnapshot?: MapSnapshot | null;
  mapSnapshotError?: string | null;
  onClose: () => void;
}) {
  const gridAnalysis = useGridAnalysis(dataset.datasetId, selected.gridId);
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [policy, setPolicy] = useState<Policy>('green-roof');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      request.current?.abort();
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    getAvailability(controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) {
          setAvailability(value);
          if (!value.roofAreas[selected.gridId] && value.trees[selected.gridId])
            setPolicy('street-trees');
        }
      },
      (e) => {
        if (!controller.signal.aborted)
          setAvailabilityError(
            e instanceof TypeError
              ? '적용 범위 자료를 가져오지 못했습니다. 네트워크 연결을 확인해주세요.'
              : e instanceof Error
                ? e.message
                : '적용 범위를 확인하지 못했습니다.',
          );
      },
    );
    return () => controller.abort();
  }, [attempt, selected.gridId]);
  const compatible =
    dataset.code === 'mch30_platform_fixed_v2' &&
    dataset.gridVersion.code === 'mch30_v1' &&
    dataset.referenceTime.startsWith('2026-06-16');
  const roofArea = availability?.roofAreas[selected.gridId] ?? 0;
  const tree = availability?.trees[selected.gridId];
  const allowed = !!availability && compatible && (policy === 'green-roof' ? roofArea > 0 : !!tree);
  const grid = result?.grids.find((g) => g.gridId === selected.gridId);
  function choose(next: Policy) {
    request.current?.abort();
    setLoading(false);
    setPolicy(next);
    setResult(null);
    setError(null);
  }
  async function run() {
    if (!allowed) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setStep(3);
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const value = await simulate(dataset.datasetId, selected.gridId, policy, controller.signal);
      if (!controller.signal.aborted) setResult(value);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : '예측에 실패했습니다.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  function go(next: number) {
    if (loading) return;
    setStep(next);
  }
  const change = grid?.deltaLstC;
  const hasExplanation = grid?.explanation;
  return (
    <dialog
      ref={dialog}
      className="policy-workspace"
      aria-labelledby="policy-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="policy-header">
        <div>
          <p>미추홀구 열환경 디지털트윈</p>
          <h2 id="policy-title">정책 적용 시뮬레이션</h2>
        </div>
        <button
          type="button"
          className="policy-close"
          onClick={onClose}
          aria-label="정책 작업창 닫기"
        >
          닫기 <span aria-hidden="true">×</span>
        </button>
      </header>
      <nav className="policy-steps" aria-label="정책 적용 단계">
        {['정책 선택', '규모 가정', '결과 비교'].map((label, i) => (
          <button
            key={label}
            type="button"
            aria-current={step === i + 1 ? 'step' : undefined}
            disabled={loading || (i === 1 && !allowed) || (i === 2 && !result && !error)}
            onClick={() => go(i + 1)}
          >
            <span>{i + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      <div className="policy-body">
        <div className="policy-selection-line">
          <span>
            선택 격자 <code>{selected.gridId}</code>
          </span>
          <span>
            면적 {number(selected.areaM2, 1)}㎡{' '}
            <span className="policy-observed">관측 LST {number(selected.lstC)}℃</span>
          </span>
        </div>
        {!compatible && (
          <p className="policy-alert" role="alert">
            현재 시뮬레이션은 2026년 6월 16일 기준 데이터셋만 지원합니다.
          </p>
        )}
        {availabilityError && (
          <div className="policy-alert" role="alert">
            <p>{availabilityError}</p>
            <button
              onClick={() => {
                setAvailabilityError(null);
                setAttempt((n) => n + 1);
              }}
            >
              적용 범위 다시 불러오기
            </button>
          </div>
        )}
        {step === 1 && (
          <>
            <div className="policy-section-title">
              <h3>이 격자에 어떤 정책을 적용할까요?</h3>
              <p>공간 자료에서 확인한 범위 안에서 정책 적용을 가정합니다.</p>
            </div>
            {!availability && !availabilityError && (
              <p role="status">적용 가능한 정책을 확인하고 있습니다.</p>
            )}
            <div className="policy-options">
              <button
                type="button"
                className={'policy-option ' + (policy === 'green-roof' ? 'is-selected' : '')}
                aria-pressed={policy === 'green-roof'}
                disabled={!availability || !compatible || roofArea <= 0}
                onClick={() => choose('green-roof')}
              >
                <span className="policy-option-symbol" aria-hidden="true">
                  ▱
                </span>
                <h4>옥상녹화</h4>
                <p>대상 옥상에 식생을 조성하는 시나리오</p>
                <strong>
                  {!availability
                    ? '확인 중'
                    : roofArea > 0
                      ? `대상 옥상 ${number(roofArea, 1)}㎡`
                      : '대상 옥상 면적 없음'}
                </strong>
                <small>분석 면적 기준이며 구조 안전성은 별도 확인이 필요합니다.</small>
              </button>
              <button
                type="button"
                className={'policy-option ' + (policy === 'street-trees' ? 'is-selected' : '')}
                aria-pressed={policy === 'street-trees'}
                disabled={!availability || !compatible || !tree}
                onClick={() => choose('street-trees')}
              >
                <span className="policy-option-symbol" aria-hidden="true">
                  ♧
                </span>
                <h4>가로수 식재</h4>
                <p>수관이 생기는 공간의 입력 변화를 가정하는 시나리오</p>
                <strong>
                  {!availability
                    ? '확인 중'
                    : tree
                      ? `최대 ${tree.maxTreeCount}그루 가정 가능`
                      : '현재 시나리오 대상 격자가 아닙니다'}
                </strong>
                <small>자료상 26개 격자만 지원하며 실제 식재 위치를 확정한 것은 아닙니다.</small>
              </button>
            </div>
            <p className="policy-footnote">
              옥상 면적이 있어도 관측 품질에 따라 결과가 보류될 수 있습니다. 적용 가능 여부와 예측
              가능 여부는 구분합니다.
            </p>
          </>
        )}
        {step === 2 && (
          <>
            <div className="policy-section-title">
              <h3>{policyName(policy)} 적용 규모</h3>
              <p>현재 연결된 예측 시나리오의 적용 범위를 확인하세요.</p>
            </div>
            <div className="policy-scope-layout">
              <section className="policy-scope-card">
                <span>
                  {policy === 'green-roof' ? '대상 옥상 면적 전체' : '전달 자료의 최대 식재량'}
                </span>
                <strong>
                  {policy === 'green-roof' ? number(roofArea, 1) : tree?.maxTreeCount}
                  <small>{policy === 'green-roof' ? ' ㎡' : ' 그루'}</small>
                </strong>
                <p>
                  {policy === 'green-roof'
                    ? '선택 격자에 포함된 대상 옥상 면적의 100%에 적용합니다. 격자 전체 면적의 100%를 녹화하는 의미가 아닙니다.'
                    : `추가 수관 면적은 최대 ${number(tree?.maxNewCanopyAreaM2, 1)}㎡입니다. 수관이 걸치는 이웃 격자의 예측도 함께 반환됩니다.`}
                </p>
              </section>
              <section className="policy-assumptions">
                <h3>이번 예측의 가정</h3>
                <ul>
                  <li>기준일과 기상 조건을 동일하게 유지합니다.</li>
                  <li>정책 적용 전후를 같은 모델로 비교합니다.</li>
                  <li>
                    {policy === 'green-roof'
                      ? '옥상 구조·방수·설비와 실제 설치 허가는 확인하지 않은 분석입니다.'
                      : '식재 본수와 수관은 시연용 추정치이며 개별 식재 좌표는 제공하지 않습니다.'}
                  </li>
                  <li>면적·비율·본수를 자유롭게 조정하는 기능은 현재 지원하지 않습니다.</li>
                </ul>
                <p>
                  결과는 가정에 따른 격자 단위 지표면온도 예측이며 실제 시공 효과를 보장하지
                  않습니다.
                </p>
              </section>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <div className="policy-section-title">
              <h3 className="result-section-heading">1. {policyName(policy)} 적용 전후 비교</h3>
            </div>
            {loading && (
              <div className="policy-loading" role="status">
                <span className="policy-spinner" />
                정책 적용 결과와 지수별 기여도를 분석하고 있습니다.
              </div>
            )}
            {error && (
              <div className="policy-alert" role="alert">
                <strong>예측을 완료하지 못했습니다.</strong>
                <p>{error}</p>
                <button type="button" onClick={run}>
                  다시 예측하기
                </button>
              </div>
            )}
            {error && !grid && <GridAnalysisPanel analysis={gridAnalysis} />}
            {(result || loading) && (
              <div className="policy-metrics">
                <Metric label="적용 전 예측 LST" value={grid?.baselinePredictedLstC} />
                <Metric label="적용 후 예측 LST" value={grid?.scenarioPredictedLstC} />
                <Metric label="예측 LST 변화량" value={change} delta />
              </div>
            )}
            {grid && (
              <>
                <section className="policy-interpretation-section" aria-label="XAI 분석 결과">
                  <h3 className="result-section-heading">2. XAI 분석 결과</h3>
                  <div className="policy-interpretation">
                    {change === null ? (
                      <>
                        <h4>현재 자료로는 온도 변화량을 계산할 수 없습니다.</h4>
                        <p>{reasonName(grid.reason)} 계산 불가를 효과 없음으로 해석하지 마세요.</p>
                      </>
                    ) : (
                      <>
                        <h4>
                          {change != null && Math.abs(change) < 0.005
                            ? '분석 결과, 정책 적용 후 해당 격자의 지표면 온도 변화는 0.01℃ 미만입니다.'
                            : `분석 결과, 정책 적용 후 해당 격자의 지표면 온도는 약 ${number(Math.abs(change ?? 0))}℃ ${change != null && change < 0 ? '감소' : '증가'}합니다.`}
                        </h4>
                        {hasExplanation && (
                          <div className="policy-contributions">
                            <div>
                              <span>식생 지수 변화의 온도 기여</span>
                              <strong
                                className={
                                  hasExplanation.ndvi.contributionC < 0
                                    ? 'temperature-decrease'
                                    : hasExplanation.ndvi.contributionC > 0
                                      ? 'temperature-increase'
                                      : undefined
                                }
                              >
                                {signed(hasExplanation.ndvi.contributionC)}℃
                              </strong>
                            </div>
                            <div>
                              <span>수분 지수 변화의 온도 기여</span>
                              <strong
                                className={
                                  hasExplanation.ndmi.contributionC < 0
                                    ? 'temperature-decrease'
                                    : hasExplanation.ndmi.contributionC > 0
                                      ? 'temperature-increase'
                                      : undefined
                                }
                              >
                                {signed(hasExplanation.ndmi.contributionC)}℃
                              </strong>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {grid.qualityStatus === 'PRIOR_SUPPORTED' && (
                      <p>
                        <strong>당일 관측을 과거 관측 자료로 보완했습니다.</strong>{' '}
                        {reasonName(grid.reason)} 사용한 관측일을 함께 확인하세요.
                      </p>
                    )}
                  </div>
                </section>
                <GridAnalysisPanel analysis={gridAnalysis} />
                <div className="policy-result-bottom">
                  <section className="policy-feature-table">
                    <h3>모델 입력은 어떻게 바뀌었나요?</h3>
                    <div className="policy-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>지표</th>
                            <th>적용 전</th>
                            <th>적용 후</th>
                            <th>변화</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(
                            [
                              ['식생 지수 NDVI', hasExplanation?.ndvi],
                              ['수분 지수 NDMI', hasExplanation?.ndmi],
                            ] as const
                          ).map(([label, index]) => (
                            <tr key={label}>
                              <th>{label}</th>
                              <td>{number(index?.before, 3)}</td>
                              <td>{number(index?.after, 3)}</td>
                              <td>{signed(index ? index.after - index.before : null, 3)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p>
                      면적 비율의 변화가 아닌 모델 입력 지수의 변화입니다. 제공되지 않은 변화량은
                      표시하지 않습니다.
                    </p>
                  </section>
                  <SelectionLocation
                    regionName={dataset.region.name}
                    selected={selected}
                    mapSnapshot={mapSnapshot}
                    mapSnapshotError={mapSnapshotError}
                  />
                </div>
                {policy === 'street-trees' && result && (
                  <section className="policy-neighbors">
                    <h3>수관이 영향을 주는 격자</h3>
                    <p>
                      {result.treeCount}그루 / 추가 수관 {number(result.totalNewCanopyAreaM2, 1)}㎡
                      / 총 {result.affectedGridCount}개 격자
                    </p>
                    <div className="policy-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>격자</th>
                            <th>적용 전</th>
                            <th>적용 후</th>
                            <th>변화량</th>
                            <th>자료 상태</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.grids.map((g) => (
                            <tr key={g.gridId}>
                              <th>
                                {g.gridId}
                                {g.gridId === selected.gridId ? ' (선택)' : ''}
                              </th>
                              <td>{number(g.baselinePredictedLstC)}℃</td>
                              <td>{number(g.scenarioPredictedLstC)}℃</td>
                              <td>{signed(g.deltaLstC)}℃</td>
                              <td>{qualityName(g.qualityStatus)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
                <details className="policy-result-note">
                  <summary>자료 기준과 해석 범위</summary>
                  <p>
                    기준일 {result?.date}. 지수별 기여도의 합은 예측 LST 변화량과 같습니다. 현재
                    온도가 높은 원인의 종합 분석이나 최적 정책 추천 결과는 아닙니다.
                  </p>
                  <p>
                    30m 격자는 자료 결합 단위이며 실제 정책 효과나 모델 정확도를 이 화면에서 검증한
                    것은 아닙니다.
                  </p>
                </details>
              </>
            )}
          </>
        )}
      </div>
      <footer className="policy-footer">
        <span>2026. 6. 16. 기준 / 선택 격자 1개</span>
        <div>
          {step > 1 && (
            <button
              type="button"
              className="policy-secondary"
              disabled={loading}
              onClick={() => go(step - 1)}
            >
              이전 단계
            </button>
          )}
          {step === 1 && (
            <button className="policy-primary" disabled={!allowed} onClick={() => go(2)}>
              적용 규모 확인 <span aria-hidden="true">→</span>
            </button>
          )}
          {step === 2 && (
            <button className="policy-primary" disabled={!allowed || loading} onClick={run}>
              예측 결과 비교 <span aria-hidden="true">→</span>
            </button>
          )}
          {step === 3 && (
            <button className="policy-primary" disabled={loading} onClick={() => go(1)}>
              다른 정책 검토
            </button>
          )}
        </div>
      </footer>
    </dialog>
  );
}
