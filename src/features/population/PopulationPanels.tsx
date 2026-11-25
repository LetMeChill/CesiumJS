import { useState } from 'react';
import {
  distanceMeters,
  dongSelection,
  facilitySelection,
  POPULATION_COLORS,
  populationBreaks,
  type PopulationData,
  type PopulationMetric,
  type PopulationMonth,
  type PopulationSelection,
} from './populationData';
import './PopulationPanels.css';
const count = (n: number) => n.toLocaleString('ko-KR');
const monthName = (m: PopulationMonth) => (m === '202610' ? '2026년 10월' : '2026년 6월');
const time = (t: string | null | undefined) =>
  t && /^\d{4}$/.test(t) ? `${t.slice(0, 2)}:${t.slice(2)}` : '정보 없음';
export function PopulationControls({
  data,
  error,
  loading,
  retry,
  month,
  setMonth,
  metric,
  setMetric,
  shelters,
  setShelters,
  shade,
  setShade,
  radius,
  setRadius,
  selected,
  onSelect,
  buildings,
  setBuildings,
}: {
  data: PopulationData | null;
  error: string | null;
  loading: boolean;
  retry: () => void;
  month: PopulationMonth;
  setMonth: (m: PopulationMonth) => void;
  metric: PopulationMetric;
  setMetric: (m: PopulationMetric) => void;
  shelters: boolean;
  setShelters: (b: boolean) => void;
  shade: boolean;
  setShade: (b: boolean) => void;
  radius: 0 | 300 | 500;
  setRadius: (r: 0 | 300 | 500) => void;
  selected: PopulationSelection | null;
  onSelect: (s: PopulationSelection) => void;
  buildings: boolean;
  setBuildings: (b: boolean) => void;
}) {
  const total =
    data?.dongs.reduce((s, d) => s + d.properties.statistics[month].totalPopulation, 0) ?? 0;
  const older =
    data?.dongs.reduce((s, d) => s + d.properties.statistics[month].population65Plus, 0) ?? 0;
  const [search, setSearch] = useState('');
  return (
    <div className="population-controls">
      {loading && <p role="status">인구·시설 자료를 불러오는 중입니다.</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={retry}>
            다시 불러오기
          </button>
        </div>
      )}
      <section className="population-overview">
        <span>미추홀구 65세 이상 인구</span>
        <strong>
          {data ? count(older) : '—'}
          <small> 명</small>
        </strong>
        <p>
          전체 인구 대비 {total ? ((older / total) * 100).toFixed(1) : '—'}% / {monthName(month)}
        </p>
      </section>
      <section className="control-section">
        <h3>인구 표시</h3>
        <label className="population-label" htmlFor="population-month">
          인구 기준월
        </label>
        <select
          id="population-month"
          value={month}
          onChange={(e) => setMonth(e.target.value as PopulationMonth)}
        >
          <option value="202610">2026년 10월</option>
          <option value="202606">2026년 6월 (열관측과 같은 달)</option>
        </select>
        <fieldset className="population-fieldset">
          <legend>지도 색상 기준</legend>
          <label>
            <input
              type="radio"
              name="population-metric"
              checked={metric === 'share'}
              onChange={() => setMetric('share')}
            />
            65세 이상 비율
          </label>
          <label>
            <input
              type="radio"
              name="population-metric"
              checked={metric === 'count'}
              onChange={() => setMetric('count')}
            />
            65세 이상 인구 수
          </label>
        </fieldset>
        <p className="population-note">
          크기가 서로 다른 행정동의 통계입니다. 30m 격자별 인구나 현재 머무는 인구를 뜻하지
          않습니다.
        </p>
      </section>
      <section className="control-section">
        <h3>기존 폭염 보호시설</h3>
        <label className="check-row">
          <input
            type="checkbox"
            checked={shelters}
            onChange={(e) => setShelters(e.target.checked)}
          />
          <i className="facility-key shelter-key" />
          무더위쉼터{' '}
          <b>
            {data ? count(data.facilities.filter((f) => f.type === 'heat_shelter').length) : '—'}
          </b>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={shade} onChange={(e) => setShade(e.target.checked)} />
          <i className="facility-key shade-key" />
          그늘막{' '}
          <b>{data ? count(data.facilities.filter((f) => f.type === 'shade').length) : '—'}</b>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={buildings}
            onChange={(e) => setBuildings(e.target.checked)}
          />
          3D 건물
        </label>
        <label className="population-label" htmlFor="population-radius">
          선택 지점 주변 거리
        </label>
        <select
          id="population-radius"
          disabled={!selected}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value) as 0 | 300 | 500)}
        >
          <option value="0">표시 안 함</option>
          <option value="300">직선거리 300m</option>
          <option value="500">직선거리 500m</option>
        </select>
        <p className="population-note">
          지도나 시설을 선택한 뒤 확인하세요. 실제 보행 경로·시간이 아닙니다.
        </p>
      </section>
      <section className="control-section population-dong-list">
        <h3>행정동 선택</h3>
        <label className="population-label" htmlFor="dong-search">
          행정동 찾기
        </label>
        <input
          id="dong-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="예: 주안1동"
        />
        <p className="population-note">
          동 이름순 / {metric === 'share' ? '65세 이상 비율' : '65세 이상 인구 수'}
        </p>
        {data?.dongs
          .filter((d) =>
            d.properties.dongName.replace(/[·.]/g, '').includes(search.replace(/[·.]/g, '')),
          )
          .sort((a, b) => a.properties.dongName.localeCompare(b.properties.dongName, 'ko'))
          .map((d) => (
            <button
              type="button"
              key={d.properties.dongCode}
              aria-pressed={selected?.dongCode === d.properties.dongCode}
              onClick={() => onSelect(dongSelection(d))}
            >
              <span>{d.properties.dongName.replaceAll('·', '.')}</span>
              <strong>
                {metric === 'share'
                  ? d.properties.statistics[month].share65PlusPct === null
                    ? '정보 없음'
                    : `${d.properties.statistics[month].share65PlusPct?.toFixed(1)}%`
                  : `${count(d.properties.statistics[month].population65Plus)}명`}
              </strong>
            </button>
          ))}
      </section>
      <details className="population-sources">
        <summary>자료 출처와 기준일</summary>
        <p>인구: 미추홀구청 주민등록인구통계, {monthName(month)}.</p>
        <p>경계: 내부 기준 2023. 7. 1., 배포 2024. 5. 31. 최신 경계 일치 여부는 미확인입니다.</p>
        <p>쉼터: 국민안전24, 조회 {data?.facilityRetrievedDate ?? '2026-11-25'}.</p>
        <p>그늘막: 전국그늘막쉼터표준데이터, 기준 {data?.shadeReferenceDate ?? '2026-10-01'}.</p>
        <a
          href="https://www.michuhol.go.kr/main/board/list.do?board_code=board_51"
          target="_blank"
          rel="noreferrer"
        >
          인구 원본
        </a>{' '}
        <a href="https://www.data.go.kr/data/15128317/fileData.do" target="_blank" rel="noreferrer">
          경계 원본
        </a>
        <p>인구 통계만으로 건강 위험이나 정책 우선순위를 확정하지 않습니다.</p>
      </details>
    </div>
  );
}
export function PopulationLegend({
  metric,
  month,
}: {
  metric: PopulationMetric;
  month: PopulationMonth;
}) {
  const breaks = populationBreaks(metric);
  return (
    <div className="temperature-legend population-legend" aria-label="고령 인구 범례">
      <strong>{metric === 'share' ? '65세 이상 인구 비율 (%)' : '65세 이상 인구 수 (명)'}</strong>
      <div className="population-color-scale">
        {POPULATION_COLORS.map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
      </div>
      <div className="legend-ticks">
        <span>{count(breaks[0])} 미만</span>
        {breaks.map((n) => (
          <span key={n}>{count(n)}</span>
        ))}
      </div>
      <small>
        {monthName(month)} / 행정동 단위
        <br />
        경계 기준 2023. 7. / 위험등급이 아닙니다.
      </small>
    </div>
  );
}
export function PopulationDetail({
  data,
  month,
  selection,
  radius,
  onSelect,
  onClose,
}: {
  data: PopulationData;
  month: PopulationMonth;
  selection: PopulationSelection;
  radius: 0 | 300 | 500;
  onSelect: (s: PopulationSelection) => void;
  onClose: () => void;
}) {
  const dong = data.dongs.find((d) => d.properties.dongCode === selection.dongCode);
  const stats = dong?.properties.statistics[month];
  const selectedFacility = data.facilities.find((f) => f.facilityId === selection.facilityId);
  const facilities = data.facilities.filter(
    (f) => selection.dongCode && f.dongCodes.includes(selection.dongCode),
  );
  const nearby = radius
    ? data.facilities.filter((f) => distanceMeters(selection.point, f) <= radius)
    : [];
  const [filter, setFilter] = useState<'all' | 'heat_shelter' | 'shade'>('all');
  return (
    <aside className="dashboard-detail population-detail">
      <div className="detail-actions">
        <h2>{dong?.properties.dongName.replaceAll('·', '.') ?? '선택 지점 정보'}</h2>
        <button
          type="button"
          className="detail-dismiss"
          aria-label="인구 지역 정보 닫기"
          onClick={onClose}
        >
          닫기
        </button>
      </div>
      <p className="population-note">{monthName(month)} 주민등록 인구</p>
      {stats && (
        <>
          <div className="population-selected-metric">
            <span>65세 이상 인구 비율</span>
            <strong>
              {stats.share65PlusPct === null ? '정보 없음' : stats.share65PlusPct.toFixed(1)}
              {stats.share65PlusPct !== null && <small>%</small>}
            </strong>
          </div>
          <dl className="detail-list">
            <dt>65세 이상 인구</dt>
            <dd>{count(stats.population65Plus)}명</dd>
            <dt>전체 인구</dt>
            <dd>{count(stats.totalPopulation)}명</dd>
            <dt>행정동 내 쉼터</dt>
            <dd>{facilities.filter((f) => f.type === 'heat_shelter').length}곳</dd>
            <dt>행정동 내 그늘막</dt>
            <dd>{facilities.filter((f) => f.type === 'shade').length}곳</dd>
          </dl>
        </>
      )}
      {!dong && (
        <p className="population-note">
          선택 지점이 확보한 행정동 경계 안에 포함되지 않아 인구를 배정하지 않았습니다.
        </p>
      )}
      {selectedFacility && (
        <section className="population-facility-card">
          <span>{selectedFacility.type === 'heat_shelter' ? '무더위쉼터' : '그늘막'}</span>
          <h3>{selectedFacility.name}</h3>
          <p>{selectedFacility.address ?? '주소 정보 없음'}</p>
          {selectedFacility.type === 'heat_shelter' ? (
            <dl>
              <dt>수용인원</dt>
              <dd>
                {selectedFacility.capacity == null
                  ? '정보 없음'
                  : `${count(selectedFacility.capacity)}명`}
              </dd>
              <dt>기본 시간</dt>
              <dd>
                {time(selectedFacility.weekdayOpen)} ~ {time(selectedFacility.weekdayClose)}
              </dd>
              <dt>주말 시간</dt>
              <dd>
                {time(selectedFacility.weekendOpen)} ~ {time(selectedFacility.weekendClose)}
              </dd>
            </dl>
          ) : (
            <p>자료 기준일 {selectedFacility.referenceDate}</p>
          )}
          <small>운영요일·계절별 조건과 현재 개방 여부는 방문 전 시설에 확인해야 합니다.</small>
        </section>
      )}
      {radius > 0 && (
        <section className="population-nearby">
          <h3>기준점에서 {radius}m 이내</h3>
          <p>
            {selection.point.source === 'dong'
              ? '행정동 내부 기준점'
              : selection.point.source === 'facility'
                ? '선택 시설'
                : '지도에서 선택한 지점'}{' '}
            기준 직선거리
          </p>
          <div>
            <strong>쉼터 {nearby.filter((f) => f.type === 'heat_shelter').length}곳</strong>
            <strong>그늘막 {nearby.filter((f) => f.type === 'shade').length}곳</strong>
          </div>
          <small>
            경계 밖 인접 지역의 시설은 현재 자료에 포함되지 않습니다. 원 안의 거주 인구나 시설 수용
            능력을 뜻하지 않습니다.
          </small>
        </section>
      )}
      <section className="population-facility-list">
        <h3>{radius ? '거리 범위 안 시설' : '행정동 내 기존 시설'}</h3>
        <label className="population-label" htmlFor="facility-type">
          시설 종류
        </label>
        <select
          id="facility-type"
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
        >
          <option value="all">전체 시설</option>
          <option value="heat_shelter">무더위쉼터</option>
          <option value="shade">그늘막</option>
        </select>
        {(radius ? nearby : facilities)
          .filter((f) => filter === 'all' || f.type === filter)
          .sort((a, b) => distanceMeters(selection.point, a) - distanceMeters(selection.point, b))
          .map((f) => (
            <button
              key={f.facilityId}
              type="button"
              aria-pressed={selection.facilityId === f.facilityId}
              onClick={() => onSelect(facilitySelection(f))}
            >
              <i
                className={`facility-key ${f.type === 'heat_shelter' ? 'shelter-key' : 'shade-key'}`}
              />
              <span>
                {f.name}
                <small>
                  {f.type === 'heat_shelter' ? '무더위쉼터' : '그늘막'} / 직선 약{' '}
                  {Math.round(distanceMeters(selection.point, f))}m
                </small>
              </span>
            </button>
          ))}
        {!(radius ? nearby : facilities).some((f) => filter === 'all' || f.type === filter) && (
          <p className="population-note">
            현재 조건에 해당하는 시설이 없습니다. 전체 시설이 없다는 뜻은 아닙니다.
          </p>
        )}
      </section>
      <p className="data-note">
        정책 검토에는 고령 인구 수·비율과 시설 운영시간·접근성을 함께 고려해야 합니다. 현재 화면은
        통계와 기존 시설을 보여주며 추천 순위는 제공하지 않습니다.
      </p>
    </aside>
  );
}
