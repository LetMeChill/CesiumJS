export type Policy = 'green-roof' | 'street-trees';
export interface IndexChange {
  before: number;
  after: number;
  contributionC: number;
}
export interface PredictionGrid {
  gridId: string;
  baselinePredictedLstC: number | null;
  scenarioPredictedLstC: number | null;
  deltaLstC: number | null;
  qualityStatus: 'SAME_DAY' | 'PRIOR_SUPPORTED' | 'UNAVAILABLE';
  reason: string | null;
  sourceDates: string[];
  appliedRoofAreaM2?: number;
  newCanopyAreaM2?: number;
  explanation?: {
    method: string;
    indexSourceDate: string;
    ndvi: IndexChange;
    ndmi: IndexChange;
  } | null;
}
export interface SimulationResult {
  date: string;
  datasetCode: string;
  gridVersion: string;
  scenarioVersion: string;
  grids: PredictionGrid[];
  treeCount?: number;
  affectedGridCount?: number;
  totalNewCanopyAreaM2?: number;
}
export interface Availability {
  datasetCode: string;
  gridVersion: string;
  date: string;
  roofAreas: Record<string, number>;
  trees: Record<string, { maxTreeCount: number; maxNewCanopyAreaM2: number; status: string }>;
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function nullableNumber(value: unknown) {
  return value === null || finite(value);
}
function indexChange(value: unknown): value is IndexChange {
  return (
    object(value) && finite(value.before) && finite(value.after) && finite(value.contributionC)
  );
}
function validGrid(g: unknown): g is PredictionGrid {
  if (
    !object(g) ||
    typeof g.gridId !== 'string' ||
    !['SAME_DAY', 'PRIOR_SUPPORTED', 'UNAVAILABLE'].includes(String(g.qualityStatus)) ||
    !Array.isArray(g.sourceDates) ||
    !g.sourceDates.every((d) => typeof d === 'string') ||
    !(g.reason === null || typeof g.reason === 'string') ||
    !nullableNumber(g.baselinePredictedLstC) ||
    !nullableNumber(g.scenarioPredictedLstC) ||
    !nullableNumber(g.deltaLstC)
  )
    return false;
  if (
    g.appliedRoofAreaM2 !== undefined &&
    (!finite(g.appliedRoofAreaM2) || g.appliedRoofAreaM2 < 0)
  )
    return false;
  if (g.newCanopyAreaM2 !== undefined && (!finite(g.newCanopyAreaM2) || g.newCanopyAreaM2 < 0))
    return false;
  if (g.qualityStatus === 'UNAVAILABLE') return g.deltaLstC === null && g.explanation == null;
  return (
    finite(g.baselinePredictedLstC) &&
    finite(g.scenarioPredictedLstC) &&
    finite(g.deltaLstC) &&
    Math.abs(g.scenarioPredictedLstC - g.baselinePredictedLstC - g.deltaLstC) < 1e-5 &&
    object(g.explanation) &&
    typeof g.explanation.method === 'string' &&
    typeof g.explanation.indexSourceDate === 'string' &&
    indexChange(g.explanation.ndvi) &&
    indexChange(g.explanation.ndmi) &&
    Math.abs(g.explanation.ndvi.contributionC + g.explanation.ndmi.contributionC - g.deltaLstC) <
      1e-5
  );
}
export async function getAvailability(signal: AbortSignal): Promise<Availability> {
  const response = await fetch('/data/policy-availability-20260616.json', { signal });
  if (!response.ok) throw new Error('정책 적용 범위 자료를 불러오지 못했습니다.');
  const value: unknown = await response.json();
  if (
    !object(value) ||
    value.datasetCode !== 'mch30_platform_fixed_v2' ||
    value.gridVersion !== 'mch30_v1' ||
    value.date !== '2026-06-16' ||
    !object(value.roofAreas) ||
    !object(value.trees) ||
    !Object.values(value.roofAreas).every((n) => finite(n) && n > 0) ||
    !Object.values(value.trees).every(
      (t) =>
        object(t) &&
        Number.isInteger(t.maxTreeCount) &&
        finite(t.maxTreeCount) &&
        t.maxTreeCount > 0 &&
        finite(t.maxNewCanopyAreaM2) &&
        t.maxNewCanopyAreaM2 > 0 &&
        t.status === 'DEMO_ESTIMATE',
    )
  )
    throw new Error('정책 적용 범위 자료의 버전이나 형식을 확인할 수 없습니다.');
  return value as unknown as Availability;
}
export async function simulate(
  datasetId: number,
  gridId: string,
  policy: Policy,
  signal: AbortSignal,
): Promise<SimulationResult> {
  const base = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '');
  if (!base) throw new Error('API 기본 주소가 설정되지 않았습니다.');
  let response: Response;
  try {
    response = await fetch(`${base}/v1/datasets/${datasetId}/simulations/${policy}/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(policy === 'green-roof' ? { gridId } : { selectedGridIds: [gridId] }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(40000)]),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError')
      throw new Error('예측 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.', {
        cause: error,
      });
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('예측 서버와 통신하지 못했습니다. 네트워크 연결을 확인해주세요.', {
      cause: error,
    });
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !object(body) || body.success !== true || !object(body.result)) {
    throw new Error(
      response.status === 422
        ? '현재 선택이나 적용 조건으로 예측할 수 없습니다. 격자와 정책을 다시 확인해주세요.'
        : response.status === 503
          ? 'AI 예측 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'
          : response.status === 404
            ? '시뮬레이션 API 또는 기준 데이터셋을 찾을 수 없습니다. 백엔드 배포 상태를 확인해주세요.'
            : '예측 결과를 불러오지 못했습니다. 다시 시도해주세요.',
    );
  }
  const r = body.result;
  const grids = policy === 'green-roof' ? [r.grid] : r.grids;
  if (
    r.datasetCode !== 'mch30_platform_fixed_v2' ||
    r.gridVersion !== 'mch30_v1' ||
    r.date !== '2026-06-16' ||
    r.sceneId !== 'LC08_L2SP_116034_20260616_20260626_02_T1' ||
    typeof r.scenarioVersion !== 'string' ||
    !Array.isArray(grids) ||
    !grids.length ||
    !grids.every(validGrid) ||
    !grids.some((g) => g.gridId === gridId) ||
    new Set(grids.map((g) => g.gridId)).size !== grids.length ||
    (policy === 'green-roof' && grids.length !== 1) ||
    (policy === 'street-trees' &&
      (!Number.isInteger(r.treeCount) ||
        !finite(r.treeCount) ||
        r.treeCount < 0 ||
        r.affectedGridCount !== grids.length ||
        !finite(r.totalNewCanopyAreaM2) ||
        r.totalNewCanopyAreaM2 < 0))
  )
    throw new Error('선택한 자료와 예측 응답이 일치하지 않습니다. 결과 표시를 중단했습니다.');
  return {
    date: r.date,
    datasetCode: r.datasetCode,
    gridVersion: r.gridVersion,
    scenarioVersion: r.scenarioVersion,
    grids,
    ...(policy === 'street-trees'
      ? {
          treeCount: r.treeCount as number,
          affectedGridCount: r.affectedGridCount as number,
          totalNewCanopyAreaM2: r.totalNewCanopyAreaM2 as number,
        }
      : {}),
  };
}
