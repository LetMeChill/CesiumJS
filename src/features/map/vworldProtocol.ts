import type { PopulationLayerCommand, PopulationSelection } from '../population/populationData';
import type { LstColorStop } from './utils/lstColor';
import type { DatasetSummary } from '../dataset/api/datasetApi';
import type { GridMapItem } from '../grid/api/gridApi';

export interface MapSnapshot {
  gridId: string;
  imageUrl: string;
  marker: { x: number; y: number };
  capturedAt: string;
}

// 같은 출처의 지도 프레임과 React 패널이 주고받는 메시지다.
export type MapCommand =
  | { type: 'capture-selection'; requestId: string; gridId: string }
  | PopulationLayerCommand
  | { type: 'focus-point'; longitude: number; latitude: number; range: number }
  | {
      type: 'layers';
      heat: boolean;
      buildings: boolean;
      opacity: number;
      roadOpacity: number;
      heatView: 'roads' | 'area';
      vegetation: boolean;
      names: boolean;
    }
  | { type: 'focus'; target: 'whole' | 'sk' | 'presentation' }
  | { type: 'zoom'; direction: 'in' | 'out' };
export type MapEvent =
  | { type: 'selection-snapshot'; requestId: string; gridId: string; snapshot: MapSnapshot | null }
  | { type: 'population-selected'; selection: PopulationSelection }
  | {
      type: 'ready';
      dataset: DatasetSummary;
      count: number;
      missing: number;
      colorStops: LstColorStop[];
    }
  | { type: 'selected'; grid: GridMapItem | null }
  | { type: 'error'; message: string }
  | { type: 'surface-warning'; message: string };
export const MAP_CHANNEL = 'urban-heat-vworld';
