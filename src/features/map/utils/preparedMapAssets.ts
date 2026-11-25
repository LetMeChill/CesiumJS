import { jsonSha256 } from './mapAssetHash';
import { getPreparedImage } from './preparedImageCache';
import type { DatasetSummary } from '../../dataset/api/datasetApi';
import type { GridMapData } from '../../grid/api/gridApi';
import { createLstRaster } from '../layers/createLstRaster';
import { createSurfaceRaster } from '../layers/createSurfaceRaster';
import { getRelativeLstStops, type LstColorStop } from './lstColor';
import { measureMapStage } from './mapPerformance';

export interface PreparedMapManifest {
  schemaVersion: 1;
  datasetSha256: string;
  gridSha256: string;
  count: number;
  missing: number;
  bounds: [number, number, number, number];
  colorStops: LstColorStop[];
  assets: Record<'heat' | 'roads' | 'vegetation', { url: string; sha256: string }>;
}
interface MapRasters {
  url: string;
  bounds: [number, number, number, number];
  colorStops: readonly LstColorStop[];
  surface: { roads: string; vegetation: string } | null;
  source: 'prepared' | 'generated';
  dispose(): void;
}

async function readManifest(signal: AbortSignal): Promise<PreparedMapManifest | null> {
  try {
    const response = await fetch('/map-data/prepared-manifest.json', {
      cache: 'no-cache',
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    signal.throwIfAborted();
    return null;
  }
}

async function loadPrepared(
  manifest: PreparedMapManifest | null,
  dataset: DatasetSummary,
  data: GridMapData,
  signal: AbortSignal,
): Promise<MapRasters | null> {
  if (!manifest || manifest.schemaVersion !== 1) return null;
  const urls: string[] = [];
  try {
    // 매 접속 시 실제 API의 전체 정밀도 자료와 대조해 오래된 이미지 사용을 막는다.
    const [datasetHash, gridHash] = await Promise.all([jsonSha256(dataset), jsonSha256(data)]);
    if (manifest.datasetSha256 !== datasetHash || manifest.gridSha256 !== gridHash) return null;
    const colorStops = getRelativeLstStops(data.grids.map((g) => g.lstC));
    const expectedBounds = [Infinity, Infinity, -Infinity, -Infinity];
    for (const grid of data.grids)
      for (const polygon of grid.boundary.coordinates)
        for (const ring of polygon)
          for (const [x, y] of ring) {
            expectedBounds[0] = Math.min(expectedBounds[0], x);
            expectedBounds[1] = Math.min(expectedBounds[1], y);
            expectedBounds[2] = Math.max(expectedBounds[2], x);
            expectedBounds[3] = Math.max(expectedBounds[3], y);
          }
    if (
      manifest.count !== data.count ||
      manifest.missing !== data.grids.filter((g) => g.lstC === null).length ||
      JSON.stringify(manifest.colorStops) !== JSON.stringify(colorStops) ||
      !Array.isArray(manifest.bounds) ||
      manifest.bounds.length !== 4 ||
      !manifest.bounds.every(Number.isFinite) ||
      JSON.stringify(manifest.bounds) !== JSON.stringify(expectedBounds)
    )
      return null;
    const load = async (asset: { url: string; sha256: string }) => {
      if (!/^\/map-data\/prepared\/[a-f0-9]{64}\/(heat|roads|vegetation)\.png$/.test(asset.url))
        throw new Error('사전 이미지 경로 오류');
      return getPreparedImage(asset, signal);
    };
    // 먼저 모든 파일의 검증을 끝낸 뒤 URL을 만들어 중간 실패 시 누수를 방지한다.
    const blobs = await Promise.all([
      load(manifest.assets.heat),
      load(manifest.assets.roads),
      load(manifest.assets.vegetation),
    ]);
    signal.throwIfAborted();
    const [url, roads, vegetation] = blobs.map((blob) => {
      const url = URL.createObjectURL(blob);
      urls.push(url);
      return url;
    });
    return {
      url,
      bounds: manifest.bounds,
      colorStops,
      surface: { roads, vegetation },
      source: 'prepared',
      dispose: () => urls.forEach((url) => URL.revokeObjectURL(url)),
    };
  } catch {
    urls.forEach((url) => URL.revokeObjectURL(url));
    signal.throwIfAborted();
    return null;
  }
}

function releaseOnAbort(raster: MapRasters, signal: AbortSignal): MapRasters {
  let disposed = false;
  const originalDispose = raster.dispose;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
    originalDispose();
  };
  signal.addEventListener('abort', dispose, { once: true });
  if (signal.aborted) {
    dispose();
    signal.throwIfAborted();
  }
  return { ...raster, dispose };
}

export async function loadMapRasters(
  inputs: Promise<{ dataset: DatasetSummary; data: GridMapData }>,
  signal: AbortSignal,
): Promise<MapRasters> {
  signal.throwIfAborted();
  const manifestPromise = readManifest(signal);
  void manifestPromise.catch(() => {});
  const { dataset, data } = await inputs;
  const prepared = await measureMapStage('prepared-verify', async () =>
    loadPrepared(await manifestPromise, dataset, data, signal),
  );
  if (prepared) {
    performance.mark('urban-heat:prepared-used');
    return releaseOnAbort(prepared, signal);
  }
  performance.mark('urban-heat:prepared-fallback');
  const colorStops = getRelativeLstStops(data.grids.map((g) => g.lstC));
  const raster = await measureMapStage('heat-raster', () =>
    createLstRaster(data, signal, colorStops),
  );
  if (!raster) throw new Error('표시할 격자 없음');
  let surface: Awaited<ReturnType<typeof createSurfaceRaster>> | null = null;
  try {
    surface = await measureMapStage('surface-raster', () =>
      createSurfaceRaster(raster.url, raster.bounds, signal),
    );
  } catch {
    if (signal.aborted) {
      raster.dispose();
      signal.throwIfAborted();
    }
  }
  return releaseOnAbort(
    {
      ...raster,
      colorStops,
      surface,
      source: 'generated',
      dispose() {
        surface?.dispose();
        raster.dispose();
      },
    },
    signal,
  );
}
