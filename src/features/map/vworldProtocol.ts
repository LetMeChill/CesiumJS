import type { LstColorStop } from './utils/lstColor';
import type { DatasetSummary } from '../dataset/api/datasetApi';
import type { GridMapItem } from '../grid/api/gridApi';

// 같은 출처의 지도 프레임과 React 패널이 주고받는 메시지다.
export type MapCommand =
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
