import { getDefaultDataset } from '../dataset/api/datasetApi';
import { useEffect, useState } from 'react';
export type PopulationMonth = '202610' | '202606';
export type PopulationMetric = 'share' | 'count';
export interface PopulationStats {
  totalPopulation: number;
  population65Plus: number;
  share65PlusPct: number | null;
}
export interface DongFeature {
  type: 'Feature';
  geometry: { type: 'MultiPolygon'; coordinates: [number, number][][][] };
  properties: {
    dongCode: string;
    dongName: string;
    geometryBaseDate: string;
    center: [number, number];
    statistics: Record<PopulationMonth, PopulationStats>;
  };
}
export interface ProtectionFacility {
  facilityId: string;
  type: 'heat_shelter' | 'shade';
  name: string;
  longitude: number;
  latitude: number;
  address: string | null;
  dongCodes: string[];
  capacity?: number | null;
  weekdayOpen?: string | null;
  weekdayClose?: string | null;
  weekendOpen?: string | null;
  weekendClose?: string | null;
  weekendOpeningFlag?: string | null;
  nightOpeningFlag?: string | null;
  operationFlag?: string | null;
  referenceDate?: string | null;
  sourceYear?: string | null;
}
export interface PopulationData {
  version: string;
  dongs: DongFeature[];
  facilities: ProtectionFacility[];
  facilityRetrievedDate: string;
  shadeReferenceDate: string;
}
export interface PopulationSelection {
  dongCode: string | null;
  facilityId: string | null;
  point: { longitude: number; latitude: number; source: 'map' | 'facility' | 'dong' };
}
export interface PopulationLayerCommand {
  type: 'population';
  visible: boolean;
  month: PopulationMonth;
  metric: PopulationMetric;
  shelters: boolean;
  shade: boolean;
  radius: 0 | 300 | 500;
  selection: PopulationSelection | null;
  data: PopulationData | null;
}
export const POPULATION_COLORS = ['#f1edf5', '#dfd3e9', '#c4aed6', '#a17fbc', '#7c529e', '#572d79'];
export const populationBreaks = (metric: PopulationMetric) =>
  metric === 'share' ? [15, 20, 25, 30, 35] : [1000, 2000, 3000, 4000, 5000];
export function populationColor(value: number | null, metric: PopulationMetric) {
  if (value === null) return '#cbd5db';
  let i = 0;
  for (const n of populationBreaks(metric)) if (value >= n) i++;
  return POPULATION_COLORS[i];
}
export function distanceMeters(
  a: { longitude: number; latitude: number },
  b: { longitude: number; latitude: number },
) {
  const rad = Math.PI / 180;
  const lat = (b.latitude - a.latitude) * rad,
    lon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(lon / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function inPopulationDong(x: number, y: number, feature: DongFeature) {
  function ring(points: [number, number][]) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i],
        [xj, yj] = points[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  return feature.geometry.coordinates.some((p) => ring(p[0]) && !p.slice(1).some(ring));
}
export function facilitySelection(f: ProtectionFacility): PopulationSelection {
  return {
    dongCode: f.dongCodes[0] ?? null,
    facilityId: f.facilityId,
    point: { longitude: f.longitude, latitude: f.latitude, source: 'facility' },
  };
}
export function dongSelection(d: DongFeature): PopulationSelection {
  return {
    dongCode: d.properties.dongCode,
    facilityId: null,
    point: { longitude: d.properties.center[0], latitude: d.properties.center[1], source: 'dong' },
  };
}
function validatePopulation(value: PopulationData): PopulationData {
  if (
    value.version !== 'michuhol-population-protection-20261125' ||
    !Array.isArray(value.dongs) ||
    value.dongs.length !== 21 ||
    !Array.isArray(value.facilities) ||
    new Set(value.dongs.map((d) => d.properties.dongCode)).size !== 21 ||
    new Set(value.facilities.map((f) => f.facilityId)).size !== value.facilities.length
  )
    throw new Error('인구 자료 버전이나 구성이 올바르지 않습니다.');
  for (const d of value.dongs) {
    if (d.geometry.type !== 'MultiPolygon' || !d.geometry.coordinates.length)
      throw new Error('행정동 경계 자료를 확인할 수 없습니다.');
    for (const p of d.geometry.coordinates.flat(2))
      if (
        !Array.isArray(p) ||
        p.length !== 2 ||
        !Number.isFinite(p[0]) ||
        !Number.isFinite(p[1]) ||
        p[0] < 126 ||
        p[0] > 127 ||
        p[1] < 37 ||
        p[1] > 38
      )
        throw new Error('행정동 좌표를 확인할 수 없습니다.');
    for (const month of ['202606', '202610'] as const) {
      const s = d.properties.statistics[month];
      if (
        !s ||
        ![s.totalPopulation, s.population65Plus].every(Number.isFinite) ||
        s.totalPopulation < 0 ||
        s.population65Plus < 0 ||
        s.population65Plus > s.totalPopulation ||
        (s.share65PlusPct === null
          ? s.totalPopulation !== 0
          : !Number.isFinite(s.share65PlusPct) || s.share65PlusPct < 0 || s.share65PlusPct > 100)
      )
        throw new Error('인구 통계를 확인할 수 없습니다.');
    }
  }
  for (const f of value.facilities)
    if (
      !['heat_shelter', 'shade'].includes(f.type) ||
      !Number.isFinite(f.longitude) ||
      !Number.isFinite(f.latitude) ||
      f.longitude < 126 ||
      f.longitude > 127 ||
      f.latitude < 37 ||
      f.latitude > 38
    )
      throw new Error('시설 좌표를 확인할 수 없습니다.');
  return value;
}
export function usePopulationData(enabled: boolean, regionId?: number) {
  const [state, setState] = useState<{
    key: string;
    data: PopulationData | null;
    error: string | null;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = regionId == null ? 'default' : String(regionId);
  const current = state?.key === key ? state : null;
  const data = current?.data ?? null;
  useEffect(() => {
    if (!enabled || data) return;
    const controller = new AbortController();
    async function load() {
      const id = regionId ?? (await getDefaultDataset(controller.signal)).region.regionId;
      const base = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '');
      if (!base) throw new Error('API 기본 주소가 설정되지 않았습니다.');
      const response = await fetch(`${base}/v1/regions/${id}/population`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      const body = (await response.json().catch(() => null)) as {
        success?: boolean;
        code?: string;
        result?: PopulationData;
      } | null;
      if (!response.ok || !body?.success || !body.result)
        throw new Error(
          body?.code === 'POPULATION404'
            ? '인구·시설 자료가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.'
            : response.status === 404
              ? '선택한 지역의 인구·시설 자료를 아직 제공할 수 없습니다.'
              : '인구·시설 자료를 불러오지 못했습니다. 다시 시도해주세요.',
        );
      return validatePopulation(body.result);
    }
    load().then(
      (value) => {
        if (!controller.signal.aborted) setState({ key, data: value, error: null });
      },
      (error) => {
        if (!controller.signal.aborted)
          setState({
            key,
            data: null,
            error:
              error instanceof TypeError
                ? '인구·시설 서비스에 연결하지 못했습니다. 연결 상태를 확인해주세요.'
                : error instanceof Error
                  ? error.message
                  : '인구 자료를 불러오지 못했습니다.',
          });
      },
    );
    return () => controller.abort();
  }, [enabled, data, key, regionId, attempt]);
  return {
    data: enabled ? data : null,
    error: enabled ? (current?.error ?? null) : null,
    loading: enabled && current === null,
    retry: () => {
      setState(null);
      setAttempt((n) => n + 1);
    },
  };
}
