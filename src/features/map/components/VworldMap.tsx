import { useEffect, useRef, useState } from 'react';
import type { DatasetSummary } from '../../dataset/api/datasetApi';
import type { GridMapItem } from '../../grid/api/gridApi';
import { MAP_CHANNEL, type MapCommand, type MapEvent } from '../vworldProtocol';
import { LST_COLOR_STOPS, type LstColorStop } from '../utils/lstColor';
import './CesiumMap.css';

// 브이월드 SDK는 별도 문서에서 실행해 npm Cesium과 전역 객체·자원 경로 충돌을 막는다.
export default function VworldMap() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [dataset, setDataset] = useState<DatasetSummary | null>(null);
  const [selected, setSelected] = useState<GridMapItem | null>(null);
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
      else if (event?.type === 'selected') setSelected(event.grid);
      else if (event?.type === 'error') {
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
        heat: heatVisible,
        buildings: buildingVisible,
        opacity,
        roadOpacity,
        heatView,
        vegetation,
        names,
      });
  }, [
    heatVisible,
    buildingVisible,
    opacity,
    roadOpacity,
    heatmapReady,
    heatView,
    vegetation,
    names,
  ]);
  const reference = dataset
    ? new Date(dataset.referenceTime).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    : '불러오는 중';
  return (
    <section className="heat-dashboard" aria-label="미추홀구 열환경 디지털트윈">
      <header className="dashboard-header">
        <div className="brand-mark" aria-hidden="true">
          M
        </div>
        <div>
          <strong>미추홀구 열환경 디지털트윈</strong>
          <small>도시의 열환경을 확인하고 비교하는 공간</small>
        </div>
        <span className="active-tab">열환경 조회</span>
        <span className="header-region">인천 · 미추홀구</span>
        <span className="fixed-badge">고정 기준 자료</span>
      </header>
      <aside className="dashboard-sidebar">
        <div className="sidebar-heading">
          <span className="eyebrow">MAP LAYERS</span>
          <h2>지도 표시 설정</h2>
          <p>필요한 정보를 골라 확인하세요.</p>
        </div>
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
            온도 표시 중에는 녹지 분류 색을 숨깁니다. 녹지 참고 보기의 녹색은 토지피복도의 산림·초지
            분류입니다. 개별 나무 위치·높이를 뜻하지 않습니다. 브이월드가 제공하는 외관 포함 3D
            건물입니다. 건물 색상은 온도를 뜻하지 않습니다.
          </p>
        </div>
        <div className="control-section">
          <h3>지도 이동</h3>
          <button
            className="location-button"
            onClick={() => send({ type: 'focus', target: 'presentation' })}
          >
            발표 구도 · 도로와 건물 <span>↗</span>
          </button>
          <button
            className="location-button"
            onClick={() => send({ type: 'focus', target: 'whole' })}
          >
            미추홀구 전체 보기 <span>↗</span>
          </button>
          <button className="location-button" onClick={() => send({ type: 'focus', target: 'sk' })}>
            인하대학교 · SK뷰 주변 <span>↗</span>
          </button>
        </div>
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
          {heatVisible ? (
            <>
              {heatView === 'roads' ? '도로 온도' : '전체 온도'} <span>지역 내 비교</span>
            </>
          ) : (
            <>3D 배경 지도</>
          )}
        </div>
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
        {(loading || error) && (
          <div className="map-message" role={error ? 'alert' : 'status'}>
            {error || '지도와 열환경 자료를 불러오는 중입니다.'}
          </div>
        )}
      </div>
      <aside className="dashboard-detail">
        <span className="eyebrow">GRID INSPECTOR</span>
        <h2>선택 영역 정보</h2>
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
        <h3>관측 시점의 기상</h3>
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
        <details className="map-building-controls">
          <summary>건물 자료 · 품질 정보</summary>
          <p>3D 건물·지형·배경: 브이월드</p>
          <p>관측 LST·격자·기상: 자체 기준 데이터셋</p>
          <p>
            3D 배경의 제작 시점은 온도 관측일과 다를 수 있으며, 건물별 제공 범위와 상세도는 다를 수
            있습니다.
          </p>
          <p>기상 QC 공백은 정상 확인으로 간주하지 않습니다.</p>
        </details>
        <div className="detail-notice">
          현재 화면은 관측 자료 조회입니다. AI 시나리오 결과와 실제 관측값을 구분해 표시합니다.
        </div>
      </aside>
    </section>
  );
}
