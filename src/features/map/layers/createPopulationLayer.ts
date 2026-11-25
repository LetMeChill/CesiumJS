import type { Viewer, Cartesian2 } from 'cesium';
import {
  inPopulationDong,
  populationColor,
  facilitySelection,
  type PopulationLayerCommand,
  type PopulationSelection,
} from '../../population/populationData';
type Runtime = typeof import('cesium');
export function createPopulationLayer(
  C: Runtime,
  viewer: Viewer,
  onSelect: (s: PopulationSelection) => void,
) {
  const source = new C.CustomDataSource('population-protection');
  source.show = false;
  void viewer.dataSources.add(source);
  let current: PopulationLayerCommand | null = null;
  function update(command: PopulationLayerCommand) {
    current = command;
    source.show = command.visible;
    const grid = viewer.entities.getById('selected-grid');
    if (grid) grid.show = !command.visible;
    if (!command.visible || !command.data) {
      viewer.scene.requestRender();
      return;
    }
    source.entities.removeAll();
    for (const d of command.data.dongs) {
      const stats = d.properties.statistics[command.month];
      const value = command.metric === 'share' ? stats.share65PlusPct : stats.population65Plus;
      const color = C.Color.fromCssColorString(populationColor(value, command.metric)).withAlpha(
        0.66,
      );
      for (const [index, polygon] of d.geometry.coordinates.entries()) {
        source.entities.add({
          id: `population-dong-${d.properties.dongCode}-${index}`,
          polygon: {
            hierarchy: new C.PolygonHierarchy(
              C.Cartesian3.fromDegreesArray(polygon[0].flat()),
              polygon
                .slice(1)
                .map((r) => new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(r.flat()))),
            ),
            material: color,
            classificationType: C.ClassificationType.TERRAIN,
          },
        });
        for (const [ringIndex, ring] of polygon.entries())
          source.entities.add({
            id: `population-boundary-${d.properties.dongCode}-${index}-${ringIndex}`,
            polyline: {
              positions: C.Cartesian3.fromDegreesArray(ring.flat()),
              clampToGround: true,
              width: command.selection?.dongCode === d.properties.dongCode ? 4 : 1.4,
              material:
                command.selection?.dongCode === d.properties.dongCode
                  ? C.Color.fromCssColorString('#41205e')
                  : C.Color.fromCssColorString('#816594').withAlpha(0.8),
            },
          });
      }
    }
    for (const f of command.data.facilities) {
      if (
        (f.type === 'heat_shelter' && !command.shelters) ||
        (f.type === 'shade' && !command.shade)
      )
        continue;
      const selected = command.selection?.facilityId === f.facilityId;
      source.entities.add({
        id: `population-facility:${f.facilityId}`,
        position: C.Cartesian3.fromDegrees(f.longitude, f.latitude),
        point: {
          pixelSize: selected ? 17 : f.type === 'heat_shelter' ? 11 : 7,
          color: C.Color.fromCssColorString(f.type === 'heat_shelter' ? '#185b8b' : '#b45b1d'),
          outlineColor: C.Color.WHITE,
          outlineWidth: selected ? 3 : 2,
          heightReference: C.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
    if (command.selection) {
      const p = command.selection.point;
      source.entities.add({
        id: 'population-location',
        position: C.Cartesian3.fromDegrees(p.longitude, p.latitude),
        point: {
          pixelSize: 7,
          color: C.Color.fromCssColorString('#402157'),
          outlineColor: C.Color.WHITE,
          outlineWidth: 2,
          heightReference: C.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      if (command.radius) {
        const ring: number[] = [];
        const lat = (p.latitude * Math.PI) / 180,
          lon = (p.longitude * Math.PI) / 180,
          angular = command.radius / 6371008.8;
        for (let i = 0; i <= 96; i++) {
          const bearing = (i / 96) * 2 * Math.PI;
          const y = Math.asin(
            Math.sin(lat) * Math.cos(angular) +
              Math.cos(lat) * Math.sin(angular) * Math.cos(bearing),
          );
          const x =
            lon +
            Math.atan2(
              Math.sin(bearing) * Math.sin(angular) * Math.cos(lat),
              Math.cos(angular) - Math.sin(lat) * Math.sin(y),
            );
          ring.push((x * 180) / Math.PI, (y * 180) / Math.PI);
        }
        source.entities.add({
          id: 'population-distance',
          polyline: {
            positions: C.Cartesian3.fromDegreesArray(ring),
            clampToGround: true,
            width: 3,
            material: C.Color.fromCssColorString('#38234a'),
          },
        });
      }
    }
    viewer.scene.requestRender();
  }
  function handleClick(position: Cartesian2) {
    if (!current?.visible || !current.data) return false;
    const picked = viewer.scene.pick(position) as { id?: { id?: string } } | undefined;
    const id = picked?.id?.id;
    if (typeof id === 'string' && id.startsWith('population-facility:')) {
      const f = current.data.facilities.find(
        (f) => f.facilityId === id.slice('population-facility:'.length),
      );
      if (f) {
        onSelect(facilitySelection(f));
        return true;
      }
    }
    const ray = viewer.camera.getPickRay(position);
    const point = ray && viewer.scene.globe.pick(ray, viewer.scene);
    if (point) {
      const p = C.Cartographic.fromCartesian(point);
      const x = C.Math.toDegrees(p.longitude),
        y = C.Math.toDegrees(p.latitude);
      const d = current.data.dongs.find((d) => inPopulationDong(x, y, d));
      onSelect({
        dongCode: d?.properties.dongCode ?? null,
        facilityId: null,
        point: { longitude: x, latitude: y, source: 'map' },
      });
    }
    return true;
  }
  return {
    update,
    handleClick,
    destroy: () => {
      if (!viewer.isDestroyed()) viewer.dataSources.remove(source, true);
    },
  };
}
