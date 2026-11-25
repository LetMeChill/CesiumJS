import { optimizePng } from './optimize-png.mjs';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const apiTarget = process.env.MAP_ASSET_API_TARGET;
if (!apiTarget || !/^https?:\/\//.test(apiTarget))
  throw new Error('MAP_ASSET_API_TARGET에 검증할 백엔드 주소를 지정해주세요.');
const hash = (data) => createHash('sha256').update(data).digest('hex');
const rendererFiles = [
  'src/features/map/layers/createLstRaster.ts',
  'src/features/map/layers/createSurfaceRaster.ts',
  'src/features/map/utils/lstColor.ts',
];
const server = await createServer({
  root,
  logLevel: 'error',
  server: {
    host: '127.0.0.1',
    port: 5198,
    strictPort: true,
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
  },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    ...(process.env.MAP_BROWSER_CHANNEL
      ? { channel: process.env.MAP_BROWSER_CHANNEL }
      : process.platform === 'win32'
        ? { channel: 'msedge' }
        : {}),
    headless: true,
  });
  const page = await browser.newPage();
  await page.route('**/__prepare_map_assets__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>지도 사전 생성</title>',
    }),
  );
  await page.goto('http://localhost:5198/__prepare_map_assets__');
  const generated = await page.evaluate(async () => {
    const [
      { loadMapData },
      { createLstRaster },
      { createSurfaceRaster },
      { getRelativeLstStops },
      { jsonSha256 },
    ] = await Promise.all([
      import('/src/features/map/utils/loadMapData.ts'),
      import('/src/features/map/layers/createLstRaster.ts'),
      import('/src/features/map/layers/createSurfaceRaster.ts'),
      import('/src/features/map/utils/lstColor.ts'),
      import('/src/features/map/utils/mapAssetHash.ts'),
    ]);
    const signal = new AbortController().signal;
    const { dataset, data } = await loadMapData(signal);
    const stops = getRelativeLstStops(data.grids.map((g) => g.lstC));
    const heat = await createLstRaster(data, signal, stops);
    if (!heat) throw new Error('격자 없음');
    const surface = await createSurfaceRaster(heat.url, heat.bounds, signal);
    async function encode(url) {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      let value = '';
      for (let i = 0; i < bytes.length; i += 8192)
        value += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(value);
    }
    try {
      return {
        datasetSha256: await jsonSha256(dataset),
        gridSha256: await jsonSha256(data),
        datasetId: dataset.datasetId,
        datasetCode: dataset.code,
        referenceTime: dataset.referenceTime,
        count: data.count,
        missing: data.grids.filter((g) => g.lstC === null).length,
        bounds: heat.bounds,
        colorStops: stops,
        images: {
          heat: await encode(heat.url),
          roads: await encode(surface.roads),
          vegetation: await encode(surface.vegetation),
        },
      };
    } finally {
      surface.dispose();
      heat.dispose();
    }
  });
  const rendererSha256 = {};
  for (const name of rendererFiles)
    rendererSha256[name] = hash(
      (await fs.readFile(path.join(root, name), 'utf8')).replace(/\r\n/g, '\n'),
    );
  const landcoverSha256 = hash(
    await fs.readFile(path.join(root, 'public/map-data/landcover-2025.geojson')),
  );
  const identity = hash(
    JSON.stringify({
      encoding: 'png-adaptive-pixel-verified-v5',
      grid: generated.gridSha256,
      dataset: generated.datasetSha256,
      rendererSha256,
      landcoverSha256,
    }),
  );
  const dir = path.join(root, 'public/map-data/prepared', identity);
  await fs.mkdir(dir, { recursive: true });
  const assets = {};
  for (const [kind, encoded] of Object.entries(generated.images)) {
    const bytes = await optimizePng(Buffer.from(encoded, 'base64'));
    const extension = 'png';
    const pixelCheck = await page.evaluate(
      async ({ before, after }) => {
        async function pixels(encoded) {
          const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
          const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0);
          const hash = await crypto.subtle.digest(
            'SHA-256',
            context.getImageData(0, 0, canvas.width, canvas.height).data,
          );
          const result = {
            width: canvas.width,
            height: canvas.height,
            sha256: Array.from(new Uint8Array(hash), (x) => x.toString(16).padStart(2, '0')).join(
              '',
            ),
          };
          image.close();
          canvas.width = canvas.height = 0;
          return result;
        }
        const original = await pixels(before),
          optimized = await pixels(after);
        if (JSON.stringify(original) !== JSON.stringify(optimized))
          throw new Error('브라우저 PNG 전체 픽셀 대조 실패');
        return optimized;
      },
      { before: encoded, after: bytes.toString('base64') },
    );

    const filename = path.join(dir, kind + '.' + extension);
    // 동일 경로에 다른 내용을 덮어쓰지 않는다.
    const previous = await fs.readFile(filename).catch((e) => {
      if (e.code !== 'ENOENT') throw e;
      return null;
    });
    if (previous && !previous.equals(bytes))
      throw new Error('기존 이미지와 생성 내용 불일치: ' + kind);
    await fs.writeFile(filename, bytes);
    assets[kind] = {
      url: `/map-data/prepared/${identity}/${kind}.${extension}`,
      sha256: hash(bytes),
      bytes: bytes.length,
      pixelSha256: pixelCheck.sha256,
      width: pixelCheck.width,
      height: pixelCheck.height,
    };
  }
  const { images: _images, ...metadata } = generated;
  void _images;
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ...metadata,
    rendererSha256,
    landcoverSha256,
    assets,
  };
  const manifestPath = path.join(root, 'public/map-data/prepared-manifest.json');
  const previous = await fs.readFile(manifestPath).catch((e) => {
    if (e.code !== 'ENOENT') throw e;
    return null;
  });
  if (previous) {
    const previousManifest = JSON.parse(previous);
    const archive = path.join(root, 'public/map-data/prepared', hash(previous), 'manifest.json');
    await fs.mkdir(path.dirname(archive), { recursive: true });
    await fs.writeFile(archive, JSON.stringify(previousManifest, null, 2) + '\n');
  }
  const temp = manifestPath + '.tmp';
  await fs.writeFile(temp, JSON.stringify(manifest, null, 2) + '\n');
  await fs.rename(temp, manifestPath);
  console.log(
    JSON.stringify({ count: manifest.count, missing: manifest.missing, assets }, null, 2),
  );
} finally {
  await browser?.close();
  await server.close();
}
