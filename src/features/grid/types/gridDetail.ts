export interface GridSpatialValues {
  ndvi: number | null;
  buildingCoverageRatio: number | null;
  forestGrassRatio: number | null;
  roadRatio: number | null;
  waterRatio: number | null;
  imperviousRatio: number | null;
}

export interface GridDetail extends GridSpatialValues {
  datasetId: number;
  gridId: string;
  areaM2: number;
  lstC: number | null;
}
