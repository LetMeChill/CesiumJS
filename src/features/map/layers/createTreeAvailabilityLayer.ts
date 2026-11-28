import type { Cartesian2, Cartesian3, Viewer } from 'cesium';
import type { DatasetSummary } from '../../dataset/api/datasetApi';
import type { GridMapData, GridMapItem } from '../../grid/api/gridApi';
import type { Availability } from '../../simulation/api/simulationApi';

type Runtime = typeof import('cesium');

export function treeAvailabilityGrids(
  dataset: DatasetSummary,
  data: GridMapData,
  availability: Availability,
): GridMapItem[] {
  if (
    dataset.code !== availability.datasetCode ||
    dataset.gridVersion.code !== availability.gridVersion ||
    !dataset.referenceTime.startsWith(availability.date) ||
    dataset.datasetId !== data.datasetId
  ) {
    throw new Error('현재 지도 기준에 맞는 가로수 적용 자료가 없습니다.');
  }
  const ids = new Set(Object.keys(availability.trees));
  const grids = data.grids.filter((grid) => ids.has(grid.gridId));
  if (
    grids.length !== ids.size ||
    new Set(grids.map((grid) => grid.gridId)).size !== ids.size ||
    grids.some(
      (grid) =>
        !grid.boundary.coordinates.length ||
        grid.boundary.coordinates.some(
          (polygon) =>
            !polygon.length ||
            polygon.some(
              (ring) =>
                ring.length < 4 ||
                ring.some((point) => point.length !== 2 || !point.every(Number.isFinite)),
            ),
        ),
    )
  ) {
    throw new Error('가로수 적용 격자의 위치 자료를 확인할 수 없습니다.');
  }
  return grids;
}

export function createTreeAvailabilityLayer(C: Runtime, viewer: Viewer, grids: GridMapItem[]) {
  const source = new C.CustomDataSource('street-tree-availability');
  source.show = false;
  void viewer.dataSources.add(source);
  const selectable = new Map<string, GridMapItem>();
  const centers: Cartesian3[] = [];
  const color = C.Color.fromCssColorString('#007d73');
  for (const grid of grids) {
    const points = grid.boundary.coordinates.flat(2);
    const longitude =
      (Math.min(...points.map((p) => p[0])) + Math.max(...points.map((p) => p[0]))) / 2;
    const latitude =
      (Math.min(...points.map((p) => p[1])) + Math.max(...points.map((p) => p[1]))) / 2;
    const position = C.Cartesian3.fromDegrees(longitude, latitude);
    centers.push(position);
    const id = `tree-available:${grid.gridId}`;
    selectable.set(id, grid);
    source.entities.add({
      id,
      name: '가로수 식재 가능 격자',
      position,
      point: {
        pixelSize: 12,
        color,
        outlineColor: C.Color.WHITE,
        outlineWidth: 3,
        heightReference: C.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    grid.boundary.coordinates.forEach((polygon, polygonIndex) =>
      polygon.forEach((ring, ringIndex) => {
        const boundaryId = `${id}:${polygonIndex}:${ringIndex}`;
        selectable.set(boundaryId, grid);
        source.entities.add({
          id: boundaryId,
          polyline: {
            positions: C.Cartesian3.fromDegreesArray(ring.flat()),
            width: 3,
            material: color,
            clampToGround: true,
          },
        });
      }),
    );
  }
  return {
    setVisible(visible: boolean) {
      source.show = visible;
      viewer.scene.requestRender();
    },
    pickGrid(position: Cartesian2): GridMapItem | undefined {
      if (!source.show) return;
      const picked = viewer.scene.pick(position) as { id?: { id?: string } } | undefined;
      return picked?.id?.id ? selectable.get(picked.id.id) : undefined;
    },
    focus() {
      if (!source.show || !centers.length) return;
      const sphere = C.BoundingSphere.fromPoints(centers);
      viewer.camera.cancelFlight();
      viewer.camera.flyToBoundingSphere(sphere, {
        duration: 0.7,
        offset: new C.HeadingPitchRange(0, -0.9, Math.max(1000, sphere.radius * 3)),
      });
    },
    destroy() {
      selectable.clear();
      viewer.dataSources.remove(source, true);
    },
  };
}
