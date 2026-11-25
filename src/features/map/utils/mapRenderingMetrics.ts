import type { Viewer } from 'cesium';

// 지형 큐가 비었다는 것은 모든 실사 건물이 로딩됐다는 뜻은 아니다. 별도 항목으로 기록한다.
export function trackMapRendering(viewer: Viewer, signal: AbortSignal) {
  const start = performance.now();
  let rendered = false;
  let queuedTerrain = false;
  let terrainIdle = false;
  const onFrame = () => {
    if (rendered) return;
    rendered = true;
    performance.measure('urban-heat:first-observed-frame', { start, end: performance.now() });
  };
  const onTerrain = (pending: number) => {
    if (pending > 0) queuedTerrain = true;
    if (!terrainIdle && queuedTerrain && pending === 0) {
      terrainIdle = true;
      performance.measure('urban-heat:terrain-idle', { start, end: performance.now() });
    }
  };
  const offFrame = viewer.scene.postRender.addEventListener(onFrame);
  const offTerrain = viewer.scene.globe.tileLoadProgressEvent.addEventListener(onTerrain);
  const cleanup = () => {
    offFrame();
    offTerrain();
    window.clearTimeout(timer);
    signal.removeEventListener('abort', cleanup);
  };
  const timer = window.setTimeout(cleanup, 90000);
  signal.addEventListener('abort', cleanup, { once: true });
}
