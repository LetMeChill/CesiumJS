import { sha256 } from './mapAssetHash';

// 공개된 표시용 무손실 이미지만 보관한다. API 응답·인구·관측값을 오래된 캐시로 대체하지 않는다.
export async function getPreparedImage(
  asset: { url: string; sha256: string },
  signal: AbortSignal,
): Promise<Blob> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open('urban-heat-prepared-png-v1');
  } catch {
    /* 저장 금지 환경에서는 네트워크 사용 */
  }
  const verify = async (response: Response) => {
    const bytes = await response.arrayBuffer();
    if ((await sha256(bytes)) !== asset.sha256) throw new Error('사전 이미지 검증 실패');
    const blob = new Blob([bytes], {
      type: 'image/png',
    });
    const bitmap = await createImageBitmap(blob);
    bitmap.close();
    signal.throwIfAborted();
    return blob;
  };
  if (cache) {
    try {
      const cached = await cache.match(asset.url);
      if (cached) return await verify(cached);
    } catch {
      signal.throwIfAborted();
    }
  }
  const response = await fetch(asset.url, { signal });
  if (!response.ok) throw new Error('사전 이미지 조회 실패');
  const copy = response.clone();
  const blob = await verify(response);
  try {
    await cache?.put(asset.url, copy);
  } catch {
    /* 용량 제한은 표시 실패로 처리하지 않는다. */
  }
  return blob;
}
