interface ApiResponse<T> {
  success: boolean;
  code: string;
  message: string;
  result: T | null;
}

export interface RegionDetail {
  regionId: number;
  name: string;
  boundary: { type: 'MultiPolygon'; coordinates: [number, number][][][] };
}

export async function getRegionDetail(
  regionId: number,
  signal?: AbortSignal,
): Promise<RegionDetail> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '');

  if (!baseUrl) {
    throw new Error('API 기본 주소가 설정되지 않았습니다.');
  }

  const response = await fetch(`${baseUrl}/v1/regions/${regionId}`, {
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`지역 조회에 실패했습니다. HTTP ${response.status}`);
  }

  const body: ApiResponse<RegionDetail> = await response.json();

  if (!body.success || !body.result) {
    throw new Error(body.message || '지역 정보를 가져오지 못했습니다.');
  }

  return body.result;
}
