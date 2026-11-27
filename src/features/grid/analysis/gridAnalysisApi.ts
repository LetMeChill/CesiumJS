export interface GridAnalysis {
  datasetId: number;
  gridId: string;
  status:
    | 'READY'
    | 'NOT_CONFIGURED'
    | 'INSUFFICIENT_DATA'
    | 'COMPLETE'
    | 'BUSY'
    | 'LIMIT_REACHED'
    | 'UNAVAILABLE';
  summary: string | null;
  cached: boolean;
  factorIds: string[];
  model: string | null;
  generatedAt: string | null;
  evidence: {
    observedAt: string;
    selected: { datasetId: number; gridId: string; lstC: number | null };
    comparedGridCount: number;
    meanLstC: number | null;
    medianLstC: number | null;
    percentile: number | null;
    differenceFromMeanC: number | null;
    limitation: string;
    comparisonScope: string;
  };
}

const statuses = [
  'READY',
  'NOT_CONFIGURED',
  'INSUFFICIENT_DATA',
  'COMPLETE',
  'BUSY',
  'LIMIT_REACHED',
  'UNAVAILABLE',
];
const finiteOrNull = (value: unknown) =>
  value === null || (typeof value === 'number' && Number.isFinite(value));

export async function getGridAnalysis(
  datasetId: number,
  gridId: string,
  generate: boolean,
  signal: AbortSignal,
): Promise<GridAnalysis> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('API 기본 주소가 설정되지 않았습니다.');
  const response = await fetch(
    `${baseUrl}/v1/datasets/${datasetId}/grids/${encodeURIComponent(gridId)}/analysis`,
    {
      method: generate ? 'POST' : 'GET',
      headers: { Accept: 'application/json' },
      signal,
    },
  );
  const body = (await response.json().catch(() => null)) as {
    success?: boolean;
    result?: GridAnalysis;
  } | null;
  if (!response.ok || !body?.success || !body.result)
    throw new Error('열환경 설명을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
  const data = body.result;
  const e = data.evidence;
  if (
    data.datasetId !== datasetId ||
    data.gridId !== gridId ||
    !statuses.includes(data.status) ||
    !e ||
    e.selected?.datasetId !== datasetId ||
    e.selected?.gridId !== gridId ||
    !Number.isInteger(e.comparedGridCount) ||
    e.comparedGridCount < 0 ||
    ![e.meanLstC, e.medianLstC, e.percentile, e.differenceFromMeanC, e.selected.lstC].every(
      finiteOrNull,
    ) ||
    !Number.isFinite(Date.parse(e.observedAt)) ||
    typeof e.limitation !== 'string' ||
    typeof e.comparisonScope !== 'string' ||
    typeof data.cached !== 'boolean' ||
    (data.status === 'COMPLETE' &&
      (typeof data.summary !== 'string' || data.summary.length > 600 || !data.summary.trim())) ||
    (data.status !== 'COMPLETE' && data.summary !== null)
  )
    throw new Error('선택한 격자와 설명 자료가 일치하지 않습니다. 다시 조회해주세요.');
  return data;
}
