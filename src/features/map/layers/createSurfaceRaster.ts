// 도로 경계 안에는 기존 격자 LST 색을, 녹지에는 토지피복 분류 색을 표시한다.
// 경계가 세밀해져도 온도의 관측 해상도는 높아지지 않는다.
interface CoverFeature {
  properties: { kind: 'road' | 'forest' | 'grass' };
  geometry: { type: 'Polygon'; coordinates: [number, number][][] };
}
export async function createSurfaceRaster(
  heatUrl: string,
  bounds: [number, number, number, number],
  signal: AbortSignal,
): Promise<{ roads: string; vegetation: string; dispose(): void }> {
  const response = await fetch('/map-data/landcover-2025.geojson', { signal });
  if (!response.ok) throw new Error('도로·녹지 자료 조회 실패');
  const data = (await response.json()) as { features: CoverFeature[] };
  const [west, south, east, north] = bounds;
  const width = 4096,
    height = Math.round((width * (north - south)) / (east - west));
  const road = document.createElement('canvas'),
    green = document.createElement('canvas');
  road.width = green.width = width;
  road.height = green.height = height;
  const rc = road.getContext('2d')!,
    gc = green.getContext('2d')!;
  const path = (ctx: CanvasRenderingContext2D, feature: CoverFeature) => {
    ctx.beginPath();
    for (const ring of feature.geometry.coordinates) {
      ring.forEach(([lon, lat], i) => {
        const x = ((lon - west) / (east - west)) * width,
          y = ((north - lat) / (north - south)) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
  };
  for (let i = 0; i < data.features.length; i++) {
    if (i % 300 === 0) {
      await new Promise((r) => setTimeout(r, 0));
      signal.throwIfAborted();
    }
    const feature = data.features[i],
      kind = feature.properties.kind;
    const ctx = kind === 'road' ? rc : gc;
    path(ctx, feature);
    ctx.fillStyle = kind === 'road' ? 'white' : kind === 'forest' ? '#155c32' : '#4d963c';
    ctx.fill('evenodd');
  }
  const image = new Image();
  image.src = heatUrl;
  await image.decode();
  signal.throwIfAborted();
  // 원본 LST 이미지를 도로 도형으로 잘라낸다. 도로에 임의 온도를 부여하지 않는다.
  rc.globalCompositeOperation = 'source-in';
  rc.drawImage(image, 0, 0, width, height);
  const urls: string[] = [];
  const toUrl = (canvas: HTMLCanvasElement) =>
    new Promise<string>((resolve, reject) =>
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('표시 이미지 생성 실패'));
          return;
        }
        const url = URL.createObjectURL(blob);
        urls.push(url);
        resolve(url);
      }),
    );
  try {
    const roads = await toUrl(road),
      vegetation = await toUrl(green);
    return { roads, vegetation, dispose: () => urls.forEach((url) => URL.revokeObjectURL(url)) };
  } catch (error) {
    urls.forEach((url) => URL.revokeObjectURL(url));
    throw error;
  }
}
