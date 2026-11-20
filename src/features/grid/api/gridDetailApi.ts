import type { GridDetail } from '../types/gridDetail';

export async function getGridDetail(
  datasetId: number,
  gridId: string,
  signal?: AbortSignal,
): Promise<GridDetail> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('API 기본 주소가 설정되지 않았습니다.');
  const response = await fetch(
    `${baseUrl}/v1/datasets/${datasetId}/grids/${encodeURIComponent(gridId)}`,
    { headers: { Accept: 'application/json' }, signal },
  );
  const body = (await response.json().catch(() => null)) as {
    success?: boolean;
    code?: string;
    message?: string;
    result?: GridDetail;
  } | null;
  if (!response.ok || !body?.success || !body.result) {
    const message =
      body?.code === 'GRID404'
        ? '선택한 격자의 상세 자료가 없습니다.'
        : body?.code === 'DATASET404_1'
          ? '선택한 데이터셋을 조회할 수 없습니다. 지도를 새로고침해주세요.'
          : response.status === 404
            ? '상세 조회 API에 연결할 수 없습니다. 최신 백엔드 배포를 확인해주세요.'
            : '격자 상세 자료를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
    throw new Error(message);
  }
  if (body.result.datasetId !== datasetId || body.result.gridId !== gridId) {
    throw new Error('선택한 격자와 응답 자료가 일치하지 않습니다. 다시 조회해주세요.');
  }
  return body.result;
}
