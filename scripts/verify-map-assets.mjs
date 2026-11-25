import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const hash = (data) => createHash('sha256').update(data).digest('hex');
let manifest;
try {
  manifest = JSON.parse(
    await fs.readFile(path.join(root, 'public/map-data/prepared-manifest.json'), 'utf8'),
  );
} catch (e) {
  if (e.code === 'ENOENT') {
    console.log('사전 이미지 없음: 실행 시 기존 방식으로 생성');
    process.exit(0);
  }
  throw e;
}
if (manifest.schemaVersion !== 1) throw new Error('사전 이미지 버전 오류');
for (const [name, expected] of Object.entries(manifest.rendererSha256)) {
  if (hash((await fs.readFile(path.join(root, name), 'utf8')).replace(/\r\n/g, '\n')) !== expected)
    throw new Error(
      '이미지 생성 코드가 변경되었습니다. npm run map:prepare로 갱신해주세요: ' + name,
    );
}
if (
  hash(await fs.readFile(path.join(root, 'public/map-data/landcover-2025.geojson'))) !==
  manifest.landcoverSha256
)
  throw new Error('토지피복 원본과 사전 이미지가 일치하지 않습니다.');
for (const asset of Object.values(manifest.assets)) {
  if (!/^\/map-data\/prepared\/[a-f0-9]{64}\/(heat|roads|vegetation)\.png$/.test(asset.url))
    throw new Error('이미지 경로 오류');
  const bytes = await fs.readFile(path.join(root, 'public', asset.url));
  if (hash(bytes) !== asset.sha256) throw new Error('사전 이미지 무결성 오류');
}
console.log('사전 이미지·렌더러·토지피복 SHA256 검증 통과');
