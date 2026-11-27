import type { GridMapItem } from '../../grid/api/gridApi';
import type { Viewer } from 'cesium';
import type { MapSnapshot } from '../vworldProtocol';

type Runtime = typeof import('cesium');

/** Capture the existing scene without changing its camera, layers, or rendering options. */
export function captureMapSnapshot(
  C: Runtime,
  viewer: Viewer,
  grid: GridMapItem,
): Promise<MapSnapshot> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      removeListener?.();
      reject(new Error('Map capture timed out'));
    }, 3000);
    const stop = () => {
      window.clearTimeout(timer);
      removeListener?.();
    };
    const removeListener = viewer.scene.postRender.addEventListener(() => {
      try {
        const points = grid.boundary.coordinates.flat(2);
        if (!points.length) throw new Error('Missing selected geometry');
        const longitude =
          (Math.min(...points.map((p) => p[0])) + Math.max(...points.map((p) => p[0]))) / 2;
        const latitude =
          (Math.min(...points.map((p) => p[1])) + Math.max(...points.map((p) => p[1]))) / 2;
        const height =
          viewer.scene.globe.getHeight(C.Cartographic.fromDegrees(longitude, latitude)) ?? 0;
        const center = C.Cartesian3.fromDegrees(longitude, latitude, height);
        // The VWorld SDK can bundle an older Cesium version than the npm type definitions.
        const transforms = C.SceneTransforms as typeof C.SceneTransforms & {
          wgs84ToWindowCoordinates?: typeof C.SceneTransforms.worldToWindowCoordinates;
        };
        const project = transforms.worldToWindowCoordinates ?? transforms.wgs84ToWindowCoordinates;
        const position = project?.(viewer.scene, center);
        const source = viewer.canvas;
        const x = position ? position.x / (source.clientWidth || source.width) : NaN;
        const y = position ? position.y / (source.clientHeight || source.height) : NaN;
        if (![x, y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1))
          throw new Error('Selected grid outside view');
        const scale = Math.min(1, 1600 / source.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(source.width * scale));
        canvas.height = Math.max(1, Math.round(source.height * scale));
        const context = canvas.getContext('2d');
        if (!context || source.width === 0 || source.height === 0)
          throw new Error('Map canvas unavailable');
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        const imageUrl = canvas.toDataURL('image/png');
        if (!imageUrl.startsWith('data:image/png;base64,')) throw new Error('Invalid map capture');
        stop();
        resolve({
          gridId: grid.gridId,
          imageUrl,
          marker: { x, y },
          capturedAt: new Date().toISOString(),
        });
      } catch (error) {
        stop();
        reject(error);
      }
    });
    try {
      // Read the WebGL buffer during postRender, before it is cleared. Do not enable preserveDrawingBuffer globally.
      viewer.scene.requestRender();
      viewer.render();
    } catch (error) {
      stop();
      reject(error);
    }
  });
}
