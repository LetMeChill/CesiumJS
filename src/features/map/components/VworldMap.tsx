import {
  PopulationControls,
  PopulationLegend,
  PopulationDetail,
} from '../../population/PopulationPanels';
import {
  usePopulationData,
  type PopulationMonth,
  type PopulationMetric,
  type PopulationSelection,
} from '../../population/populationData';
import { useEffect, useRef, useState } from 'react';
import type { DatasetSummary } from '../../dataset/api/datasetApi';
import type { GridMapItem } from '../../grid/api/gridApi';
import { useGridDetail } from '../../grid/hooks/useGridDetail';
import { MAP_CHANNEL, type MapCommand, type MapEvent } from '../vworldProtocol';
import { LST_COLOR_STOPS, type LstColorStop } from '../utils/lstColor';
import GridSpatialDetails, { type GridSpatialValues } from './GridSpatialDetails';
import './CesiumMap.css';
import PolicyWorkspace from '../../simulation/components/PolicyWorkspace';

// 브이월드 SDK는 별도 문서에서 실행해 npm Cesium과 전역 객체·자원 경로 충돌을 막는다.
export default function VworldMap() {
  const spatialPreview =
    import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === 'grid-detail';
  const [mode, setMode] = useState<'heat' | 'population'>('heat');
  const modeRef = useRef<'heat' | 'population'>('heat');
  const [populationMonth, setPopulationMonth] = useState<PopulationMonth>('202610');
  const [populationMetric, setPopulationMetric] = useState<PopulationMetric>('share');
  const [shelters, setShelters] = useState(true);
  const [shade, setShade] = useState(true);
  const [radius, setRadius] = useState<0 | 300 | 500>(0);
  const [populationSelection, setPopulationSelection] = useState<PopulationSelection | null>(null);
  const [populationDetailOpen, setPopulationDetailOpen] = useState(true);
  const [previewCase, setPreviewCase] = useState('values');
  const previewValues: GridSpatialValues | null = spatialPreview
    ? {
        ndvi: previewCase === 'missing' ? null : previewCase === 'zero' ? 0 : 0.28,
        buildingCoverageRatio: previewCase === 'missing' ? null : previewCase === 'zero' ? 0 : 0.42,
        forestGrassRatio: previewCase === 'missing' ? null : previewCase === 'zero' ? 0 : 0.18,
        roadRatio: previewCase === 'missing' ? null : previewCase === 'zero' ? 0 : 0.31,
        waterRatio: previewCase === 'missing' ? null : 0,
        imperviousRatio: previewCase === 'missing' ? null : previewCase === 'zero' ? 0 : 0.67,
      }
    : null;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [dataset, setDataset] = useState<DatasetSummary | null>(null);
  const population = usePopulationData(mode === 'population', dataset?.region.regionId);
  const [selected, setSelected] = useState<GridMapItem | null>(null);
  const detail = useGridDetail(dataset?.datasetId, selected?.gridId ?? null, !spatialPreview);
  const [detailOpen, setDetailOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [missing, setMissing] = useState<number | null>(null);
  const [heatmapReady, setHeatmapReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heatVisible, setHeatVisible] = useState(true);
  const [buildingVisible, setBuildingVisible] = useState(true);
  const [opacity, setOpacity] = useState(60);
  const [roadOpacity, setRoadOpacity] = useState(85);
  const [heatView, setHeatView] = useState<'roads' | 'area'>('roads');
  const [vegetation, setVegetation] = useState(false);
  const [colorStops, setColorStops] = useState<readonly LstColorStop[]>(LST_COLOR_STOPS);
  const [names, setNames] = useState(false);
  const [surfaceWarning, setSurfaceWarning] = useState<string | null>(null);
  function send(command: MapCommand) {
    frameRef.current?.contentWindow?.postMessage(
      { channel: MAP_CHANNEL, command },
      location.origin,
    );
  }
  useEffect(() => {
    const receive = (message: MessageEvent) => {
      if (
        message.origin !== location.origin ||
        message.source !== frameRef.current?.contentWindow ||
        message.data?.channel !== MAP_CHANNEL
      )
        return;
      const event = message.data.event as MapEvent | undefined;
      if (event?.type === 'ready') {
        window.clearTimeout(timeoutRef.current);
        setDataset(event.dataset);
        setColorStops(event.colorStops);
        setCount(event.count);
        setMissing(event.missing);
        setHeatmapReady(true);
        setLoading(false);
        setError(null);
      } else if (event?.type === 'surface-warning') setSurfaceWarning(event.message);
      else if (event?.type === 'population-selected') {
        if (modeRef.current === 'population') {
          setPopulationSelection(event.selection);
          setPopulationDetailOpen(true);
        }
      } else if (event?.type === 'selected') {
        if (modeRef.current !== 'heat') return;
        setSelected(event.grid);
        setDetailOpen(event.grid !== null);
        setPolicyOpen(false);
      } else if (event?.type === 'error') {
        window.clearTimeout(timeoutRef.current);
        setError(event.message);
        setLoading(false);
      }
    };
    window.addEventListener('message', receive);
    const timer = window.setTimeout(() => {
      setLoading(false);
      setError(
        '지도 연결이 지연되고 있습니다. 브이월드 연결 상태와 백엔드 실행 상태를 확인해주세요.',
      );
    }, 120000);
    timeoutRef.current = timer;
    return () => {
      window.removeEventListener('message', receive);
      window.clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (heatmapReady)
      send({
        type: 'layers',
        heat: heatVisible && mode === 'heat',
        buildings: buildingVisible,
        opacity,
        roadOpacity,
        heatView,
        vegetation: vegetation && mode === 'heat',
        names,
      });
  }, [
    mode,
    heatVisible,
    buildingVisible,
    opacity,
    roadOpacity,
    heatmapReady,
    heatView,
    vegetation,
    names,
  ]);
  useEffect(() => {
    if (heatmapReady)
      send({
        type: 'population',
        visible: mode === 'population',
        month: populationMonth,
        metric: populationMetric,
        shelters,
        shade,
        radius,
        selection: populationSelection,
        data: population.data,
      });
  }, [
    mode,
    populationMonth,
    populationMetric,
    shelters,
    shade,
    radius,
    populationSelection,
    population.data,
    heatmapReady,
  ]);
  function switchMode(next: 'heat' | 'population') {
    modeRef.current = next;
    setMode(next);
    setPolicyOpen(false);
    if (next === 'population' && heatmapReady) send({ type: 'focus', target: 'whole' });
  }
  function selectPopulation(selection: PopulationSelection) {
    setPopulationSelection(selection);
    setPopulationDetailOpen(true);
    if (heatmapReady)
      send({
        type: 'focus-point',
        longitude: selection.point.longitude,
        latitude: selection.point.latitude,
        range: selection.point.source === 'dong' ? 5000 : 1200,
      });
  }
  const reference = dataset
    ? new Date(dataset.referenceTime).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    : '불러오는 중';
  return (
    <section
      className={`heat-dashboard ${(mode === 'heat' ? spatialPreview || (selected && detailOpen) : populationSelection && populationDetailOpen && population.data) ? '' : 'detail-collapsed'}`}
      aria-label="미추홀구 열환경 디지털트윈"
    >
      <header className="dashboard-header">
        <div className="brand-mark" aria-hidden="true">
          M
        </div>
        <div>
          <strong>미추홀구 열환경 디지털트윈</strong>
          <small>도시의 열환경을 확인하고 비교하는 공간</small>
        </div>
        <nav className="map-mode-tabs" aria-label="지도 조회 모드">
          <button type="button" aria-pressed={mode === 'heat'} onClick={() => switchMode('heat')}>
            열환경 조회
          </button>
          <button
            type="button"
            aria-pressed={mode === 'population'}
            onClick={() => switchMode('population')}
          >
            고령 인구와 시설
          </button>
        </nav>
        <span className="header-region">인천 미추홀구</span>
        <span className="fixed-badge">고정 기준 자료</span>
      </header>
      <aside className="dashboard-sidebar">
        <div className="sidebar-heading">
          <h2>지도 표시 설정</h2>
          <p>필요한 정보를 골라 확인하세요.</p>
        </div>
        {mode === 'population' ? (
          <PopulationControls
            data={population.data}
            error={population.error}
            loading={population.loading}
            retry={population.retry}
            month={populationMonth}
            setMonth={setPopulationMonth}
            metric={populationMetric}
            setMetric={setPopulationMetric}
            shelters={shelters}
            setShelters={setShelters}
            shade={shade}
            setShade={setShade}
            radius={radius}
            setRadius={setRadius}
            selected={populationSelection}
            onSelect={selectPopulation}
            buildings={buildingVisible}
            setBuildings={setBuildingVisible}
          />
        ) : (
          <>
            <div className="control-section">
              <h3>분석 레이어</h3>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={heatVisible}
                  onChange={(e) => setHeatVisible(e.target.checked)}
                />{' '}
                관측 지표면온도 <span className="pill">LST</span>
              </label>
              <fieldset className="temperature-view-mode">
                <legend>온도 표시 범위</legend>
                <label>
                  <input
                    type="radio"
                    name="heat-view"
                    value="roads"
                    checked={heatView === 'roads'}
                    onChange={() => setHeatView('roads')}
                  />{' '}
                  도로 온도
                </label>
                <label>
                  <input
                    type="radio"
                    name="heat-view"
                    value="area"
                    checked={heatView === 'area'}
                    onChange={() => setHeatView('area')}
                  />{' '}
                  전체 온도
                </label>
              </fieldset>
              <p className="muted">
                같은 관측일의 미추홀구 안에서 상대적으로 낮은 곳은 파랑, 높은 곳은 빨강입니다.
                위험등급이 아닙니다.
              </p>
              <label className="range-label" htmlFor="heat-opacity">
                전체 온도 불투명도 <b>{opacity}%</b>
              </label>
              <input
                id="heat-opacity"
                type="range"
                min="0"
                max="100"
                value={opacity}
                disabled={!heatVisible || heatView !== 'area'}
                onChange={(e) => setOpacity(Number(e.target.value))}
              />
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={buildingVisible}
                  disabled={!heatmapReady}
                  onChange={(e) => {
                    setBuildingVisible(e.target.checked);
                  }}
                />{' '}
                3D 건물
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={vegetation}
                  disabled={!heatmapReady || heatVisible}
                  onChange={(e) => setVegetation(e.target.checked)}
                />
                녹지 분류 참고 (온도를 끈 뒤 표시)
              </label>
              <label className="range-label" htmlFor="road-opacity">
                도로 온도 강조 <b>{roadOpacity}%</b>
              </label>
              <input
                id="road-opacity"
                type="range"
                min="0"
                max="100"
                value={roadOpacity}
                disabled={heatView !== 'roads' || !heatVisible}
                onChange={(e) => setRoadOpacity(Number(e.target.value))}
              />
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={names}
                  disabled={!heatmapReady}
                  onChange={(e) => setNames(e.target.checked)}
                />
                장소 이름 표시
              </label>
              {surfaceWarning && <p role="alert">{surfaceWarning}</p>}
              <p className="muted">
                온도 표시 중에는 녹지 분류 색을 숨깁니다. 녹지 참고 보기의 녹색은 토지피복도의
                산림·초지 분류입니다. 개별 나무 위치·높이를 뜻하지 않습니다. 브이월드가 제공하는
                외관 포함 3D 건물입니다. 건물 색상은 온도를 뜻하지 않습니다.
              </p>
            </div>
          </>
        )}
        <div className="control-section">
          <h3>지도 이동</h3>
          <button
            className="location-button"
            onClick={() => send({ type: 'focus', target: 'presentation' })}
          >
            발표 구도 도로와 건물 <span>↗</span>
          </button>
          <button
            className="location-button"
            onClick={() => send({ type: 'focus', target: 'whole' })}
          >
            미추홀구 전체 보기 <span>↗</span>
          </button>
          <button className="location-button" onClick={() => send({ type: 'focus', target: 'sk' })}>
            인하대학교 SK뷰 주변 <span>↗</span>
          </button>
        </div>
        {mode === 'heat' && (
          <div className="control-section map-dataset-info">
            <h3>기준 자료</h3>
            <dl>
              <dt>위성 관측시각 (KST)</dt>
              <dd>{reference}</dd>
              <dt>기본 격자 크기</dt>
              <dd>30m × 30m</dd>
              <dt>조회한 격자</dt>
              <dd>{count?.toLocaleString('ko-KR') ?? '—'}개</dd>
            </dl>
            <p className="data-note">
              위성 열 관측의 원 해상도는 약 100m입니다. 30m 격자는 자료를 연결하는 기준이며, 도로별
              정밀 온도를 뜻하지 않습니다.
            </p>
          </div>
        )}
        <div className="sidebar-footer">
          <span className="status-dot" /> {heatmapReady ? '기준 열환경 연결됨' : '자료 연결 중'}
        </div>
      </aside>
      <div className="map-view">
        <iframe
          ref={frameRef}
          className="map-container vworld-frame"
          title="미추홀구 실사형 3D 지도"
          src="/vworld-preview.html?embedded=1"
        />
        <div className="map-top-label">
          {mode === 'population' ? (
            <>
              65세 이상 {populationMetric === 'share' ? '인구 비율' : '인구 수'}{' '}
              <span>행정동 통계</span>
            </>
          ) : heatVisible ? (
            <>
              {heatView === 'roads' ? '도로 온도' : '전체 온도'} <span>지역 내 비교</span>
            </>
          ) : (
            <>3D 배경 지도</>
          )}
        </div>
        {mode === 'heat' && (
          <div className="temperature-legend" aria-label="지표면온도 범례">
            <div>
              <strong>지역 내 상대 온도 · 실제 값 (℃)</strong>
              <span>LST</span>
            </div>
            <div className="legend-gradient" />
            <div className="legend-ticks">
              {colorStops.map(({ temperature: n }, i) => (
                <span key={i}>{n.toFixed(1)}</span>
              ))}
            </div>
            <small>
              낮음 ← 같은 관측일의 지역 내 비교 → 높음
              <br />
              5·20·40·60·80·95백분위 기준 · 양끝 초과는 끝 색상
              <br />
              도로 색은 해당 격자의 온도이며 도로별 실측값이 아닙니다.
              <br />
              <i /> 관측값 없음 · {missing ?? '—'}개
            </small>
          </div>
        )}
        {mode === 'population' && (
          <PopulationLegend metric={populationMetric} month={populationMonth} />
        )}
        {mode === 'population' && (population.loading || population.error) && (
          <div className="population-layer-status" role={population.error ? 'alert' : 'status'}>
            {population.error ?? '인구·시설 지도를 준비하고 있습니다.'}
          </div>
        )}
        {(loading || error) && (
          <div className="map-message" role={error ? 'alert' : 'status'}>
            {error || '지도와 열환경 자료를 불러오는 중입니다.'}
          </div>
        )}
      </div>
      {mode === 'heat' && (spatialPreview || (selected && detailOpen)) && (
        <aside className="dashboard-detail">
          <div className="detail-actions">
            <h2>선택 영역 정보</h2>
            <button
              type="button"
              className="detail-dismiss"
              aria-label="선택 영역 정보 닫기"
              onClick={() => setDetailOpen(false)}
            >
              닫기
            </button>
          </div>
          {selected && dataset && (
            <button
              type="button"
              className="policy-open-button"
              onClick={() => setPolicyOpen(true)}
            >
              정책 적용 검토 <span aria-hidden="true">→</span>
            </button>
          )}
          <div className="temperature-card">
            <span>관측 지표면온도 · LST</span>
            <strong>
              {selected?.lstC != null ? selected.lstC.toFixed(1) : '—'}
              <small> ℃</small>
            </strong>
            <p>
              {selected
                ? selected.lstC === null
                  ? '이 격자는 관측값이 없습니다.'
                  : '위성 관측 자료의 지표면온도입니다.'
                : '지도에서 바닥을 클릭해 격자를 선택하세요.'}
            </p>
          </div>
          <h3>격자 정보</h3>
          <dl className="detail-list">
            <dt>격자 ID</dt>
            <dd>{selected?.gridId ?? '선택 전'}</dd>
            <dt>면적</dt>
            <dd>
              {selected
                ? `${selected.areaM2.toLocaleString('ko-KR', { maximumFractionDigits: 1 })} ㎡`
                : '—'}
            </dd>
            <dt>자료 기준</dt>
            <dd>2026. 6. 16.</dd>
          </dl>
          {spatialPreview && (
            <div className="spatial-preview-controls">
              <label>
                공간 특성 UI 미리보기
                <select
                  aria-label="공간 특성 예시 상태"
                  value={previewCase}
                  onChange={(e) => setPreviewCase(e.target.value)}
                >
                  <option value="values">일반 값 예시</option>
                  <option value="missing">결측값 예시</option>
                  <option value="zero">실제 0 값 예시</option>
                </select>
              </label>
            </div>
          )}
          <GridSpatialDetails
            selected={selected !== null}
            values={spatialPreview ? previewValues : detail.data}
            preview={spatialPreview}
            loading={detail.loading}
            error={detail.error}
            onRetry={detail.retry}
          />
          <details className="spatial-weather">
            <summary>관측 시점의 기상</summary>
            <div className="weather-cards">
              <div>
                <small>기온</small>
                <b>
                  {dataset?.weather.airTempC ?? '—'}
                  <em> ℃</em>
                </b>
              </div>
              <div>
                <small>습도</small>
                <b>
                  {dataset?.weather.relativeHumidityPct ?? '—'}
                  <em> %</em>
                </b>
              </div>
              <div>
                <small>풍속</small>
                <b>
                  {dataset?.weather.windSpeedMS ?? '—'}
                  <em> m/s</em>
                </b>
              </div>
            </div>
            <p className="muted">인천 ASOS 112 · 실시간 기상이 아닙니다.</p>
          </details>
          <details className="map-building-controls">
            <summary>건물 자료 · 품질 정보</summary>
            <p>3D 건물·지형·배경: 브이월드</p>
            <p>관측 LST·격자·기상: 자체 기준 데이터셋</p>
            <p>
              3D 배경의 제작 시점은 온도 관측일과 다를 수 있으며, 건물별 제공 범위와 상세도는 다를
              수 있습니다.
            </p>
            <p>기상 QC 공백은 정상 확인으로 간주하지 않습니다.</p>
          </details>
          <div className="detail-notice">
            현재 화면은 관측 자료 조회입니다. AI 시나리오 결과와 실제 관측값을 구분해 표시합니다.
          </div>
        </aside>
      )}
      {mode === 'heat' && selected && !detailOpen && !spatialPreview && (
        <button type="button" className="selection-open-button" onClick={() => setDetailOpen(true)}>
          선택 영역 정보 열기
        </button>
      )}
      {mode === 'population' && population.data && populationSelection && populationDetailOpen && (
        <PopulationDetail
          key={populationSelection.dongCode ?? 'no-dong'}
          data={population.data}
          month={populationMonth}
          selection={populationSelection}
          radius={radius}
          onSelect={selectPopulation}
          onClose={() => setPopulationDetailOpen(false)}
        />
      )}
      {mode === 'population' && populationSelection && !populationDetailOpen && (
        <button
          type="button"
          className="selection-open-button"
          onClick={() => setPopulationDetailOpen(true)}
        >
          인구 지역 정보 열기
        </button>
      )}
      {mode === 'heat' && policyOpen && selected && dataset && (
        <PolicyWorkspace
          key={`${dataset.datasetId}:${selected.gridId}`}
          dataset={dataset}
          selected={selected}
          onClose={() => setPolicyOpen(false)}
        />
      )}
    </section>
  );
}
