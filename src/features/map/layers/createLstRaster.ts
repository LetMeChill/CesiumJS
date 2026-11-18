import type { GridMapData } from '../../grid/api/gridApi';
import { getLstColor, type LstColorStop } from '../utils/lstColor';

// 28,258개 도형 대신 한 장의 지형 이미지로 표시한다. 원본 격자 수치·도형은 변경하지 않는다.
export async function createLstRaster(
  data: GridMapData,
  signal?: AbortSignal,
  colorStops?: readonly LstColorStop[],
): Promise<{ url: string; bounds: [number, number, number, number]; dispose: () => void } | null> {
  if (data.grids.length === 0) return null;
  signal?.throwIfAborted();

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const grid of data.grids) {
    for (const polygon of grid.boundary.coordinates) {
      for (const ring of polygon) {
        for (const [longitude, latitude] of ring) {
          west = Math.min(west, longitude);
          south = Math.min(south, latitude);
          east = Math.max(east, longitude);
          north = Math.max(north, latitude);
        }
      }
    }
  }
  if (![west, south, east, north].every(Number.isFinite) || west >= east || south >= north) {
    throw new Error('격자 경계 범위가 올바르지 않습니다.');
  }

  // 표시용 픽셀 해상도다. 격자 간격은 30m이며 원 열 관측 해상도는 약 100m다.
  const maxSize = 2048;
  const ratio = (east - west) / (north - south);
  const canvas = document.createElement('canvas');
  canvas.width = ratio >= 1 ? maxSize : Math.max(1, Math.round(maxSize * ratio));
  canvas.height = ratio >= 1 ? Math.max(1, Math.round(maxSize / ratio)) : maxSize;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('온도 이미지 생성에 실패했습니다.');

  // 투명 배경을 유지해 지역 밖·내부 구멍을 칠하지 않는다. 결측 격자만 회색이다.
  for (let i = 0; i < data.grids.length; i++) {
    if (i % 500 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      signal?.throwIfAborted();
    }
    const grid = data.grids[i];
    context.fillStyle = getLstColor(grid.lstC, colorStops);
    for (const polygon of grid.boundary.coordinates) {
      context.beginPath();
      for (const ring of polygon) {
        ring.forEach(([longitude, latitude], index) => {
          const x = ((longitude - west) / (east - west)) * canvas.width;
          const y = ((north - latitude) / (north - south)) * canvas.height;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.closePath();
      }
      context.fill('evenodd');
    }
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error('온도 이미지 변환에 실패했습니다.'));
    }, 'image/png');
  });
  signal?.throwIfAborted();
  const url = URL.createObjectURL(blob);
  return {
    url,
    bounds: [west, south, east, north],
    dispose() {
      URL.revokeObjectURL(url);
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
