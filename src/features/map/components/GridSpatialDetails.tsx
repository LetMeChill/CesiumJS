import './GridSpatialDetails.css';

import type { GridSpatialValues } from '../../grid/types/gridDetail';
export type { GridSpatialValues } from '../../grid/types/gridDetail';

interface Props {
  selected: boolean;
  values: GridSpatialValues | null;
  preview?: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function validValue(value: number | null | undefined, min: number, max: number) {
  return value != null && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function RatioRow({ label, value, kind }: { label: string; value: number | null; kind: string }) {
  const ratio = validValue(value, 0, 1);
  return (
    <div className={`spatial-ratio spatial-ratio-${kind}`}>
      <div className="spatial-value-row">
        <span>{label}</span>
        <span>{ratio === null ? '자료 없음' : `${(ratio * 100).toFixed(1)}%`}</span>
      </div>
      {ratio !== null && (
        <div
          className="spatial-track"
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={ratio * 100}
        >
          <div className="spatial-fill" style={{ width: `${ratio * 100}%` }} />
        </div>
      )}
    </div>
  );
}

export default function GridSpatialDetails({
  selected,
  values,
  preview = false,
  loading = false,
  error = null,
  onRetry,
}: Props) {
  const ndvi = validValue(values?.ndvi, -1, 1);
  const building = validValue(values?.buildingCoverageRatio, 0, 1);
  const emptyLabel = values ? '자료 없음' : '—';
  return (
    <section className="grid-spatial-details" aria-label="선택 격자의 공간 특성">
      <div className="spatial-section-heading">
        <h3>선택 격자의 공간 특성</h3>
        {preview && <span className="spatial-preview-badge">예시 값</span>}
      </div>
      <p className="spatial-context">클릭한 지점이 속한 30m × 30m 격자 전체의 값입니다.</p>
      {!values && !error && (
        <p className="spatial-status" role="status">
          {loading
            ? '공간 특성 자료를 불러오는 중입니다.'
            : selected
              ? '상세 자료를 확인할 수 없습니다.'
              : '지도에서 격자를 선택하세요.'}
        </p>
      )}
      {error && (
        <div className="spatial-error" role="alert">
          <p>{error}</p>
          {onRetry && (
            <button type="button" onClick={onRetry}>
              다시 불러오기
            </button>
          )}
        </div>
      )}
      {preview && (
        <p className="spatial-status">
          UI 검토용 예시입니다. 선택한 격자의 실제 공간 특성이 아닙니다.
        </p>
      )}
      <section className="spatial-metric" aria-labelledby="ndvi-heading">
        <div className="spatial-value-row">
          <h4 id="ndvi-heading">
            식생 지수 <small>NDVI</small>
          </h4>
          <strong>{ndvi === null ? emptyLabel : ndvi.toFixed(2)}</strong>
        </div>
        {ndvi !== null && (
          <>
            <div
              className="spatial-track"
              role="meter"
              aria-label="식생 지수"
              aria-valuemin={-1}
              aria-valuemax={1}
              aria-valuenow={ndvi}
            >
              <div className="spatial-fill" style={{ width: `${((ndvi + 1) / 2) * 100}%` }} />
            </div>
            <div className="spatial-scale">
              <span>−1</span>
              <span>0</span>
              <span>1</span>
            </div>
          </>
        )}
        <p>위성 영상에서 계산한 식생 반응 지수로, 녹지 면적 비율과 다릅니다.</p>
      </section>
      <section className="spatial-metric" aria-labelledby="building-ratio-heading">
        <div className="spatial-value-row">
          <h4 id="building-ratio-heading">건물 면적 비율</h4>
          <strong>
            {building === null ? (
              emptyLabel
            ) : (
              <>
                {(building * 100).toFixed(1)}
                <small> %</small>
              </>
            )}
          </strong>
        </div>
        {building !== null && (
          <div
            className="spatial-track"
            role="meter"
            aria-label="건물 면적 비율"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={building * 100}
          >
            <div className="spatial-fill" style={{ width: `${building * 100}%` }} />
          </div>
        )}
        <p>격자 면적 중 건물 바닥면적이 차지하는 비율입니다.</p>
      </section>
      <section className="spatial-metric" aria-labelledby="landcover-heading">
        <div className="spatial-value-row">
          <h4 id="landcover-heading">토지피복 비율</h4>
          <span className="spatial-unit">격자 면적 기준</span>
        </div>
        {values ? (
          <>
            <RatioRow label="산림·초지" value={values.forestGrassRatio} kind="green" />
            <RatioRow label="도로" value={values.roadRatio} kind="road" />
            <RatioRow label="수역" value={values.waterRatio} kind="water" />
            <RatioRow label="불투수 피복" value={values.imperviousRatio} kind="impervious" />
          </>
        ) : (
          <p className="spatial-placeholder">산림·초지 · 도로 · 수역 · 불투수 피복 —</p>
        )}
        <p>도로와 불투수 피복 등은 중복될 수 있어 합계가 100%는 아닙니다.</p>
      </section>
    </section>
  );
}
