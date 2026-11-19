import { createSurfaceRaster } from './layers/createSurfaceRaster';
import { MAP_CHANNEL, type MapCommand, type MapEvent } from './vworldProtocol';
import { getDefaultDataset } from '../dataset/api/datasetApi';
import { getDatasetGrids, type GridMapData, type GridMapItem } from '../grid/api/gridApi';
import { getRegionDetail } from '../region/api/regionApi';
import { getRelativeLstStops } from './utils/lstColor';
import { createLstRaster } from './layers/createLstRaster';
import type { Viewer, ImageryLayer, Cartesian2 } from 'cesium';
import './VworldPreview.css';

type CesiumRuntime = typeof import('cesium');
interface VworldRuntime {
  Map: new () => {
    setOption(options: object): void;
    start(): void;
    getLayerElement(id: string): { show(): void; hide(): void } | undefined;
  };
  CameraPosition: new (coordinate: unknown, direction: unknown) => unknown;
  CoordZ: new (longitude: number, latitude: number, height: number) => unknown;
  Direction: new (heading: number, pitch: number, roll: number) => unknown;
  ws3dInitCallBack?: () => void;
}
declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
    WS3D_BASE_URL?: string;
    vw?: VworldRuntime;
    ws3d?: { viewer: Viewer };
    Cesium?: CesiumRuntime;
  }
}
const embedded = new URLSearchParams(location.search).get('embedded') === '1';
if (embedded) document.body.classList.add('embedded-map');
function notify(event: MapEvent) {
  if (embedded) window.parent.postMessage({ channel: MAP_CHANNEL, event }, location.origin);
}
const status = document.querySelector<HTMLParagraphElement>('#preview-status')!;
const heatToggle = document.querySelector<HTMLInputElement>('#heat-toggle')!;
const opacity = document.querySelector<HTMLInputElement>('#preview-opacity')!;
const controller = new AbortController();
let viewer: Viewer | undefined;
let heatLayer: ImageryLayer | undefined;
let roadLayer: ImageryLayer | undefined;
let greenLayer: ImageryLayer | undefined;
let stopClick: (() => void) | undefined;
window.addEventListener(
  'pagehide',
  () => {
    controller.abort();
    stopClick?.();
    if (viewer && !viewer.isDestroyed()) viewer.destroy();
  },
  { once: true },
);

// 브이월드가 제공한 Cesium 런타임만 사용한다. npm Cesium 엔진을 중복 생성하지 않는다.
function inRing(x: number, y: number, ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function connectGridClick(C: CesiumRuntime, mapViewer: Viewer, data: GridMapData) {
  const indexed = data.grids.map((grid) => {
    const points = grid.boundary.coordinates.flat(2);
    return {
      grid,
      west: Math.min(...points.map((p) => p[0])),
      east: Math.max(...points.map((p) => p[0])),
      south: Math.min(...points.map((p) => p[1])),
      north: Math.max(...points.map((p) => p[1])),
    };
  });
  const handler = new C.ScreenSpaceEventHandler(mapViewer.canvas);
  handler.setInputAction((event: { position: Cartesian2 }) => {
    const ray = mapViewer.camera.getPickRay(event.position);
    const point = ray && mapViewer.scene.globe.pick(ray, mapViewer.scene);
    if (!point) return;
    const c = C.Cartographic.fromCartesian(point),
      x = C.Math.toDegrees(c.longitude),
      y = C.Math.toDegrees(c.latitude);
    const grid: GridMapItem | undefined = indexed.find(
      (item) =>
        x >= item.west &&
        x <= item.east &&
        y >= item.south &&
        y <= item.north &&
        item.grid.boundary.coordinates.some(
          (p) => inRing(x, y, p[0]) && !p.slice(1).some((hole) => inRing(x, y, hole)),
        ),
    )?.grid;
    notify({ type: 'selected', grid: grid ?? null });
    mapViewer.entities.removeById('selected-grid');
    if (grid) {
      mapViewer.entities.add({
        id: 'selected-grid',
        polyline: {
          positions: C.Cartesian3.fromDegreesArray(grid.boundary.coordinates[0][0].flat()),
          clampToGround: true,
          width: 4,
          material: C.Color.CYAN,
        },
      });
    }
    mapViewer.scene.requestRender();
    document.querySelector('#grid-info')!.textContent = grid
      ? `${grid.gridId} · ${grid.areaM2.toFixed(1)} ㎡ · LST ${grid.lstC === null ? '관측값 없음' : grid.lstC.toFixed(1) + ' ℃'}`
      : '미추홀구 격자 바닥을 클릭해주세요.';
  }, C.ScreenSpaceEventType.LEFT_CLICK);
  stopClick = () => handler.destroy();
}
async function main() {
  if (!import.meta.env.VITE_VWORLD_API_KEY?.trim()) throw new Error('키 설정 없음');
  const vw = window.vw;
  if (!vw || !window.Cesium) throw new Error('SDK 준비 실패');
  // Vite 기본 화면의 npm Cesium 자원 경로 대신 SDK와 같은 버전의 자원을 사용한다.
  const sdkBase = window.WS3D_BASE_URL;
  if (!sdkBase) throw new Error('SDK 자원 경로 없음');
  window.CESIUM_BASE_URL = sdkBase;
  (
    window.Cesium.buildModuleUrl as ((url: string) => string) & { setBaseUrl(url: string): void }
  ).setBaseUrl(sdkBase);
  status.textContent = '브이월드 3D 지도 초기화 중…';
  let sdkMap: InstanceType<VworldRuntime['Map']> | undefined;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('지도 초기화 시간 초과')), 60000);
    vw.ws3dInitCallBack = () => {
      window.clearTimeout(timer);
      resolve();
    };
    const map = new vw.Map();
    sdkMap = map;
    map.setOption({
      mapId: 'vworld-map',
      initPosition: new vw.CameraPosition(
        new vw.CoordZ(126.646, 37.4474, 2500),
        new vw.Direction(0, -55, 0),
      ),
      logo: true,
      navigation: true,
    });
    map.start();
  });
  controller.signal.throwIfAborted();
  const C = window.Cesium!,
    mapViewer = window.ws3d?.viewer;
  if (!mapViewer) throw new Error('브이월드 뷰어 없음');
  viewer = mapViewer;
  // 홈페이지에서 확인한 LoD3·LoD4를 공식 SDK 레이어로 함께 표시한다.
  for (const id of ['facility_build_lod3', 'facility_build']) {
    const layer = sdkMap?.getLayerElement(id);
    if (!layer) throw new Error('건물 레이어 없음');
    layer.show();
  }
  const nameIds = ['POI_GROUP', 'poi_base', 'poi_eng', 'poi_road', 'poi_bound'];
  // 이름·업체명은 기본적으로 숨기고 공식 로고와 출처는 유지한다.
  nameIds.forEach((id) => sdkMap?.getLayerElement(id)?.hide());
  sdkMap?.getLayerElement('bill_tree')?.hide();
  const focus = (lon: number, lat: number, range: number) => {
    mapViewer.camera.lookAt(
      C.Cartesian3.fromDegrees(lon, lat, 10),
      new C.HeadingPitchRange(0, -0.9, range),
    );
    mapViewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
    mapViewer.scene.requestRender();
  };
  for (const [id, lon, lat, range] of [
    ['sk-view', 126.646, 37.4474, 1800],
    ['north-view', 126.679, 37.465, 2300],
    ['whole-view', 126.665, 37.451, 12500],
  ] as const) {
    const button = document.getElementById(id) as HTMLButtonElement;
    button.disabled = false;
    button.onclick = () => focus(lon, lat, range);
  }
  if (embedded) focus(126.665, 37.451, 12500);
  else focus(126.646, 37.4474, 1800);
  status.textContent = '3D 지도 연결됨 · 기준 온도 자료를 읽는 중…';
  const dataset = await getDefaultDataset(controller.signal);
  const region = await getRegionDetail(dataset.region.regionId, controller.signal);
  for (const polygon of region.boundary.coordinates) {
    for (const ring of polygon) {
      mapViewer.entities.add({
        polyline: {
          positions: C.Cartesian3.fromDegreesArray(ring.flat()),
          width: 2,
          material: C.Color.CYAN,
          clampToGround: true,
        },
      });
    }
  }
  const points = region.boundary.coordinates.flat(2);
  const data = await getDatasetGrids(
    dataset.datasetId,
    {
      west: Math.min(...points.map((p) => p[0])),
      south: Math.min(...points.map((p) => p[1])),
      east: Math.max(...points.map((p) => p[0])),
      north: Math.max(...points.map((p) => p[1])),
    },
    controller.signal,
  );
  const colorStops = getRelativeLstStops(data.grids.map((g) => g.lstC));
  const ticks = document.querySelectorAll('.preview-ticks span');
  colorStops.forEach((stop, i) => {
    if (ticks[i]) ticks[i].textContent = stop.temperature.toFixed(1);
  });
  const previewTitle = document.querySelector('#preview-legend b');
  if (previewTitle) previewTitle.textContent = '지역 내 상대 온도 (℃)';
  const raster = await createLstRaster(data, controller.signal, colorStops);
  if (!raster) throw new Error('표시할 격자 없음');
  try {
    const rectangle = C.Rectangle.fromDegrees(...raster.bounds);
    const provider =
      typeof C.SingleTileImageryProvider.fromUrl === 'function'
        ? await C.SingleTileImageryProvider.fromUrl(raster.url, { rectangle })
        : new C.SingleTileImageryProvider({ url: raster.url, rectangle } as ConstructorParameters<
            typeof C.SingleTileImageryProvider
          >[0]);
    const legacyReady = (provider as typeof provider & { readyPromise?: Promise<boolean> })
      .readyPromise;
    if (legacyReady) await legacyReady;
    controller.signal.throwIfAborted();
    heatLayer = new C.ImageryLayer(provider, { alpha: embedded ? 0.6 : 0.45 });
    mapViewer.imageryLayers.add(heatLayer);
    try {
      const surface = await createSurfaceRaster(raster.url, raster.bounds, controller.signal);
      try {
        const makeLayer = async (url: string, alpha: number) => {
          const p =
            typeof C.SingleTileImageryProvider.fromUrl === 'function'
              ? await C.SingleTileImageryProvider.fromUrl(url, { rectangle })
              : new C.SingleTileImageryProvider({ url, rectangle } as ConstructorParameters<
                  typeof C.SingleTileImageryProvider
                >[0]);
          const ready = (p as typeof p & { readyPromise?: Promise<boolean> }).readyPromise;
          if (ready) await ready;
          controller.signal.throwIfAborted();
          const layer = new C.ImageryLayer(p, { alpha });
          mapViewer.imageryLayers.add(layer);
          return layer;
        };
        greenLayer = await makeLayer(surface.vegetation, 0.65);
        roadLayer = await makeLayer(surface.roads, 0.85);
        greenLayer.show = false;
        heatLayer.show = !embedded;
        roadLayer.show = embedded;
      } finally {
        surface.dispose();
      }
    } catch {
      notify({
        type: 'surface-warning',
        message: '도로·녹지 강조 자료를 읽지 못했습니다. 기본 LST는 계속 표시합니다.',
      });
    }
  } finally {
    raster.dispose();
  }
  heatToggle.disabled = false;
  heatToggle.checked = true;
  opacity.disabled = false;
  heatToggle.onchange = () => {
    if (heatLayer) heatLayer.show = heatToggle.checked;
    mapViewer.scene.requestRender();
  };
  opacity.oninput = () => {
    const value = Number(opacity.value);
    document.querySelector('#opacity-value')!.textContent = value + '%';
    if (heatLayer) heatLayer.alpha = value / 100;
    mapViewer.scene.requestRender();
  };
  connectGridClick(C, mapViewer, data);
  // 외부 사이트의 메시지는 받지 않고, 현재 부모 화면의 명령만 처리한다.
  const onCommand = (message: MessageEvent) => {
    if (
      !embedded ||
      message.origin !== location.origin ||
      message.source !== window.parent ||
      message.data?.channel !== MAP_CHANNEL
    )
      return;
    const command = message.data.command as MapCommand | undefined;
    if (!command) return;
    if (command.type === 'layers') {
      if (heatLayer) {
        heatLayer.show = command.heat && (command.heatView === 'area' || !roadLayer);
        heatLayer.alpha = Math.max(0, Math.min(100, command.opacity)) / 100;
      }
      if (roadLayer) {
        roadLayer.show = command.heatView === 'roads' && command.heat;
        roadLayer.alpha = Math.max(0, Math.min(100, command.roadOpacity)) / 100;
      }
      if (greenLayer) greenLayer.show = command.vegetation && !command.heat;
      for (const id of nameIds) {
        const layer = sdkMap?.getLayerElement(id);
        if (command.names) layer?.show();
        else layer?.hide();
      }
      for (const id of ['facility_build_lod3', 'facility_build']) {
        const layer = sdkMap?.getLayerElement(id);
        if (command.buildings) layer?.show();
        else layer?.hide();
      }
    } else if (command.type === 'focus') {
      if (command.target === 'whole') focus(126.665, 37.451, 12500);
      else if (command.target === 'presentation') focus(126.65, 37.449, 1000);
      else focus(126.646, 37.4474, 1800);
    } else if (command.type === 'zoom') {
      if (command.direction === 'in') mapViewer.camera.zoomIn();
      else mapViewer.camera.zoomOut();
    }
    mapViewer.scene.requestRender();
  };
  window.addEventListener('message', onCommand);
  window.addEventListener('pagehide', () => window.removeEventListener('message', onCommand), {
    once: true,
  });
  notify({
    type: 'ready',
    dataset,
    count: data.count,
    colorStops,
    missing: data.grids.filter((g) => g.lstC === null).length,
  });
  if (embedded) focus(126.665, 37.451, 12500);
  else focus(126.646, 37.4474, 1800);
  status.textContent = `연결 완료 · ${data.count.toLocaleString('ko-KR')}개 격자 · 브이월드 외관 표시 확인 필요`;
  mapViewer.scene.requestRender();
}
void main().catch(() => {
  const message = '지도 연결에 실패했습니다. 브이월드 인증 설정과 백엔드 실행 상태를 확인해주세요.';
  status.textContent = message;
  notify({ type: 'error', message });
});
