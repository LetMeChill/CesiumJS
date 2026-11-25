import { useEffect, useState } from 'react';
import { getRegionDetail, type RegionDetail } from '../../region/api/regionApi';
import type { GridMapItem } from '../../grid/api/gridApi';

export default function SelectionLocation({
  regionId,
  selected,
}: {
  regionId: number;
  selected: GridMapItem;
}) {
  const [region, setRegion] = useState<RegionDetail | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    getRegionDetail(regionId, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setRegion(value);
      },
      () => {
        if (!controller.signal.aborted) setError(true);
      },
    );
    return () => controller.abort();
  }, [regionId]);
  const points = selected.boundary.coordinates.flat(2);
  const center = points.length
    ? [
        points.reduce((sum, p) => sum + p[0], 0) / points.length,
        points.reduce((sum, p) => sum + p[1], 0) / points.length,
      ]
    : null;
  const all = region?.boundary.coordinates.flat(2) ?? [];
  const west = Math.min(...all.map((p) => p[0])),
    east = Math.max(...all.map((p) => p[0]));
  const south = Math.min(...all.map((p) => p[1])),
    north = Math.max(...all.map((p) => p[1]));
  const scale = all.length
    ? Math.min(300 / ((east - west) * Math.cos((37.45 * Math.PI) / 180)), 190 / (north - south))
    : 1;
  const project = ([x, y]: number[]) => [
    180 + (x - (east + west) / 2) * Math.cos((37.45 * Math.PI) / 180) * scale,
    110 - (y - (north + south) / 2) * scale,
  ];
  const path = (coordinates: number[][][][]) =>
    coordinates
      .flatMap((poly) =>
        poly.map(
          (ring) => ring.map((p, i) => (i ? 'L' : 'M') + project(p).join(',')).join(' ') + ' Z',
        ),
      )
      .join(' ');
  return (
    <section className="policy-location" aria-label="선택 격자 위치">
      <h3>선택 격자 위치</h3>
      {region && center && all.length ? (
        <svg viewBox="0 0 360 220" role="img" aria-label="미추홀구 경계 안 선택 격자의 위치">
          <defs>
            <pattern id="location-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M20 0H0V20" fill="none" stroke="#e6ecee" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="360" height="220" fill="url(#location-grid)" />
          <path
            d={path(region.boundary.coordinates)}
            fill="#e0eeeb"
            stroke="#78998e"
            strokeWidth="1.5"
            fillRule="evenodd"
          />
          <path d={path(selected.boundary.coordinates)} fill="#153e39" />
          <circle
            cx={project(center)[0]}
            cy={project(center)[1]}
            r="10"
            fill="white"
            stroke="#153e39"
            strokeWidth="2"
          />
          <circle cx={project(center)[0]} cy={project(center)[1]} r="4" fill="#153e39" />
          <text x="326" y="25" fontSize="12" fill="#364d46">
            북 ↑
          </text>
        </svg>
      ) : (
        <p role="status">
          {error ? '위치 지도를 불러오지 못했습니다.' : '선택 위치를 불러오는 중입니다.'}
        </p>
      )}
      <strong>{region?.name ?? '미추홀구'}</strong>
      <code>{selected.gridId}</code>
      {center && (
        <small>
          경도 {center[0].toFixed(5)} / 위도 {center[1].toFixed(5)}
        </small>
      )}
      <small>지역 경계와 선택 위치를 표시한 지도입니다.</small>
    </section>
  );
}
