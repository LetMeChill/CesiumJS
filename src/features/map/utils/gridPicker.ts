import type { GridMapData, GridMapItem } from '../../grid/api/gridApi';

function inRing(x: number, y: number, ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// 경계를 단순화하거나 반올림하지 않는다. 버킷은 후보만 줄이고 최종 판정은 원본 도형으로 한다.
export function createGridPicker(
  data: GridMapData,
): (x: number, y: number) => GridMapItem | undefined {
  const start = performance.now();
  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity;
  const indexed = data.grids.map((grid) => {
    let w = Infinity,
      s = Infinity,
      e = -Infinity,
      n = -Infinity;
    for (const polygon of grid.boundary.coordinates)
      for (const ring of polygon)
        for (const [x, y] of ring) {
          w = Math.min(w, x);
          s = Math.min(s, y);
          e = Math.max(e, x);
          n = Math.max(n, y);
        }
    west = Math.min(west, w);
    south = Math.min(south, s);
    east = Math.max(east, e);
    north = Math.max(north, n);
    return { grid, w, s, e, n };
  });
  const size = 64;
  const column = (x: number) =>
    Math.max(0, Math.min(size - 1, Math.floor(((x - west) / (east - west || 1)) * size)));
  const row = (y: number) =>
    Math.max(0, Math.min(size - 1, Math.floor(((y - south) / (north - south || 1)) * size)));
  const buckets = new Map<number, number[]>();
  indexed.forEach((item, index) => {
    for (let r = row(item.s); r <= row(item.n); r++)
      for (let c = column(item.w); c <= column(item.e); c++) {
        const key = r * size + c;
        const bucket = buckets.get(key);
        if (bucket) bucket.push(index);
        else buckets.set(key, [index]);
      }
  });
  performance.measure('urban-heat:click-index', { start, end: performance.now() });
  return (x, y) => {
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < west ||
      x > east ||
      y < south ||
      y > north
    )
      return undefined;
    for (const index of buckets.get(row(y) * size + column(x)) ?? []) {
      const item = indexed[index];
      if (x < item.w || x > item.e || y < item.s || y > item.n) continue;
      if (
        item.grid.boundary.coordinates.some(
          (p) => inRing(x, y, p[0]) && !p.slice(1).some((hole) => inRing(x, y, hole)),
        )
      )
        return item.grid;
    }
    return undefined;
  };
}
