interface ApiResponse<T> {
  success: boolean;
  code: string;
  message: string;
  result: T | null;
}

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface GridMapItem {
  gridId: string;
  areaM2: number;
  boundary: {
    type: 'MultiPolygon';
    coordinates: [number, number][][][];
  };
  lstC: number | null;
}

export interface GridMapData {
  datasetId: number;
  count: number;
  grids: GridMapItem[];
}

// 화면 범위와 겹치는 격자 경계와 지표면온도를 조회한다.
export async function getDatasetGrids(
  datasetId: number,
  bounds: MapBounds,
  signal?: AbortSignal,
): Promise<GridMapData> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '');

  if (!baseUrl) {
    throw new Error('API 기본 주소가 설정되지 않았습니다.');
  }

  const params = new URLSearchParams({
    west: String(bounds.west),
    south: String(bounds.south),
    east: String(bounds.east),
    north: String(bounds.north),
  });

  const response = await fetch(`${baseUrl}/v1/datasets/${datasetId}/grids?${params}`, {
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`격자 조회에 실패했습니다. HTTP ${response.status}`);
  }

  const body: ApiResponse<GridMapData> = await response.json();

  if (!body.success || !body.result) {
    throw new Error(body.message || '격자 자료를 가져오지 못했습니다.');
  }

  return body.result;
}
