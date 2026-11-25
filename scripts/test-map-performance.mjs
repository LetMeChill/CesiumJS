import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({
  root,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 5199, strictPort: true },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
  });
  const page = await browser.newPage();
  await page.route('**/__map_test__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>지도 회귀 검사</title>',
    }),
  );
  await page.goto('http://localhost:5199/__map_test__');
  const result = await page.evaluate(async () => {
    const [
      { createGridPicker },
      { createLstRaster },
      { createSurfaceRaster },
      { getRelativeLstStops },
      { loadMapRasters },
      { jsonSha256, sha256 },
    ] = await Promise.all([
      import('/src/features/map/utils/gridPicker.ts'),
      import('/src/features/map/layers/createLstRaster.ts'),
      import('/src/features/map/layers/createSurfaceRaster.ts'),
      import('/src/features/map/utils/lstColor.ts'),
      import('/src/features/map/utils/preparedMapAssets.ts'),
      import('/src/features/map/utils/mapAssetHash.ts'),
    ]);
    const square = (w, s, e, n) => [
      [w, s],
      [e, s],
      [e, n],
      [w, n],
      [w, s],
    ];
    const data = {
      datasetId: 99,
      count: 3,
      grids: [
        {
          gridId: 'hole',
          areaM2: 900,
          lstC: 30,
          boundary: {
            type: 'MultiPolygon',
            coordinates: [[square(0, 0, 1, 1), square(0.2, 0.2, 0.4, 0.4)]],
          },
        },
        {
          gridId: 'adjacent',
          areaM2: 900,
          lstC: 40,
          boundary: { type: 'MultiPolygon', coordinates: [[square(1, 0, 2, 1)]] },
        },
        {
          gridId: 'islands',
          areaM2: 900,
          lstC: null,
          boundary: {
            type: 'MultiPolygon',
            coordinates: [[square(2, 0, 2.5, 1)], [square(3, 0, 3.5, 1)]],
          },
        },
      ],
    };
    const dataset = { datasetId: 99, code: 'test-only' };
    const checks = [];
    const ensure = (ok, message) => {
      if (!ok) throw new Error(message);
      checks.push(message);
    };
    const pick = createGridPicker(data);
    ensure(pick(0.1, 0.1)?.gridId === 'hole', '원본 폴리곤 내부 선택');
    ensure(!pick(0.3, 0.3), '폴리곤 구멍 제외');
    ensure(pick(1.5, 0.5)?.gridId === 'adjacent', '인접 격자 선택');
    ensure(pick(3.25, 0.5)?.gridId === 'islands', '다중 폴리곤 섬 선택');
    ensure(!pick(2.75, 0.5) && !pick(NaN, 0.5) && !pick(100, 100), '외부·비정상 좌표 제외');
    ensure(
      createGridPicker({ datasetId: 99, count: 0, grids: [] })(0, 0) === undefined,
      '빈 자료 처리',
    );
    const colorStops = getRelativeLstStops(data.grids.map((g) => g.lstC));
    const signal = new AbortController().signal;
    const heat = await createLstRaster(data, signal, colorStops);
    const cover = {
      features: [
        {
          properties: { kind: 'road' },
          geometry: { type: 'Polygon', coordinates: [square(0, 0, 3.5, 1)] },
        },
      ],
    };
    const surface = await createSurfaceRaster(
      heat.url,
      heat.bounds,
      signal,
      Promise.resolve(cover),
    );
    const assets = {};
    const responses = new Map();
    for (const [kind, url] of Object.entries({
      heat: heat.url,
      roads: surface.roads,
      vegetation: surface.vegetation,
    })) {
      const bytes = await (await fetch(url)).arrayBuffer();
      const assetUrl = '/map-data/prepared/' + 'a'.repeat(64) + '/' + kind + '.png';
      assets[kind] = { url: assetUrl, sha256: await sha256(bytes) };
      responses.set(assetUrl, bytes);
    }
    const manifest = {
      schemaVersion: 1,
      datasetSha256: await jsonSha256(dataset),
      gridSha256: await jsonSha256(data),
      count: 3,
      missing: 1,
      bounds: heat.bounds,
      colorStops,
      assets,
    };
    const originalFetch = window.fetch;
    const originalOpen = caches.open.bind(caches);
    let networkImages = 0,
      coverRequests = 0,
      corruption = false,
      missingManifest = false,
      coverFailure = false;
    let activeManifest = structuredClone(manifest);
    const cache = new Map();
    caches.open = async () => ({
      match: async (url) => cache.get(url)?.clone(),
      put: async (url, response) => {
        cache.set(url, response.clone());
      },
    });
    window.fetch = async (url, options) => {
      const key = String(url);
      if (options?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      if (key === '/map-data/prepared-manifest.json')
        return new Response(JSON.stringify(activeManifest), {
          status: missingManifest ? 404 : 200,
        });
      if (responses.has(key)) {
        networkImages++;
        return new Response(corruption ? new Uint8Array([1, 2, 3]) : responses.get(key));
      }
      if (key === '/map-data/landcover-2025.geojson') {
        coverRequests++;
        return new Response(JSON.stringify(cover), { status: coverFailure ? 503 : 200 });
      }
      return originalFetch(url, options);
    };
    const load = () => loadMapRasters(Promise.resolve({ dataset, data }), signal);
    try {
      let raster = await load();
      ensure(
        raster.source === 'prepared' && coverRequests === 0,
        '사전 이미지 사용 시 토지피복 재생성 없음',
      );
      raster.dispose();
      const previous = networkImages;
      raster = await load();
      ensure(
        raster.source === 'prepared' && previous === networkImages,
        '재접속 시 검증된 이미지 캐시 재사용',
      );
      raster.dispose();
      cache.set(assets.heat.url, new Response('corrupted-cache'));
      raster = await load();
      ensure(
        raster.source === 'prepared' && networkImages > previous,
        '손상 캐시를 네트워크의 검증된 이미지로 복구',
      );
      raster.dispose();
      cache.clear();
      corruption = true;
      raster = await load();
      ensure(
        raster.source === 'generated' && raster.surface,
        '손상 이미지일 때 기존 생성 방식으로 복귀',
      );
      raster.dispose();
      corruption = false;
      activeManifest.gridSha256 = '0'.repeat(64);
      raster = await load();
      ensure(raster.source === 'generated', '관측 자료가 다르면 오래된 사전 이미지 거부');
      raster.dispose();
      activeManifest = structuredClone(manifest);
      activeManifest.bounds[0] = -1;
      raster = await load();
      ensure(raster.source === 'generated', '잘못된 이미지 범위 거부');
      raster.dispose();
      missingManifest = true;
      raster = await load();
      ensure(raster.source === 'generated', 'manifest가 없으면 기존 방식으로 복귀');
      raster.dispose();
      const abort = new AbortController();
      abort.abort();
      let aborted = false;
      try {
        await loadMapRasters(Promise.resolve({ dataset, data }), abort.signal);
      } catch (e) {
        aborted = e.name === 'AbortError';
      }
      ensure(aborted, '페이지 종료 시 요청 취소');
      missingManifest = false;
      activeManifest = structuredClone(manifest);
      const lateAbort = new AbortController();
      raster = await loadMapRasters(Promise.resolve({ dataset, data }), lateAbort.signal);
      lateAbort.abort();
      let released = false;
      try {
        await originalFetch(raster.url);
      } catch {
        released = true;
      }
      raster.dispose();
      ensure(released, '이미지 준비 후 페이지 종료 시 객체 URL 해제');
      let rejected = false;
      try {
        await loadMapRasters(Promise.reject(new Error('fixture-api-failure')), signal);
      } catch (error) {
        rejected = error.message === 'fixture-api-failure';
      }
      ensure(rejected, '기준 API 실패를 숨기지 않고 전달');
      missingManifest = true;
      coverFailure = true;
      raster = await load();
      ensure(
        raster.source === 'generated' && raster.surface === null,
        '토지피복 조회 실패 시 기본 온도 이미지 유지',
      );
      raster.dispose();

      return { passed: checks.length, checks };
    } finally {
      window.fetch = originalFetch;
      caches.open = originalOpen;
      surface.dispose();
      heat.dispose();
    }
  });
  assert(result.passed >= 17);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
