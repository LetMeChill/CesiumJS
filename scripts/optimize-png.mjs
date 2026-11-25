import sharp from 'sharp';

// PNG 필터 선택과 압축만 변경한다. 크기·색상 수·픽셀 값은 변경하지 않는다.
export async function optimizePng(bytes) {
  const optimized = await sharp(bytes)
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
    .toBuffer();
  const [original, result] = await Promise.all([
    sharp(bytes).raw().toBuffer({ resolveWithObject: true }),
    sharp(optimized).raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (
    original.info.width !== result.info.width ||
    original.info.height !== result.info.height ||
    original.info.channels !== result.info.channels ||
    !original.data.equals(result.data)
  )
    throw new Error('PNG 무손실 압축 픽셀 대조 실패');
  return optimized.length < bytes.length ? optimized : bytes;
}
