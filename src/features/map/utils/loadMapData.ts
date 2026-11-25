import { getDefaultDataset } from '../../dataset/api/datasetApi';
import { getDatasetGrids } from '../../grid/api/gridApi';
import { getRegionDetail } from '../../region/api/regionApi';
import { measureMapStage } from './mapPerformance';

export async function loadMapData(signal: AbortSignal) {
  const dataset = await measureMapStage('dataset', () => getDefaultDataset(signal));
  const region = await measureMapStage('region', () =>
    getRegionDetail(dataset.region.regionId, signal),
  );
  const points = region.boundary.coordinates.flat(2);
  const data = await measureMapStage('grids', () =>
    getDatasetGrids(
      dataset.datasetId,
      {
        west: Math.min(...points.map((p) => p[0])),
        south: Math.min(...points.map((p) => p[1])),
        east: Math.max(...points.map((p) => p[0])),
        north: Math.max(...points.map((p) => p[1])),
      },
      signal,
    ),
  );
  return { dataset, region, data };
}
