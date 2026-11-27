import type { GridMapItem } from '../../grid/api/gridApi';
import type { MapSnapshot } from '../../map/vworldProtocol';

export default function SelectionLocation({
  selected,
  regionName,
  mapSnapshot,
  mapSnapshotError,
}: {
  selected: GridMapItem;
  regionName?: string;
  mapSnapshot?: MapSnapshot | null;
  mapSnapshotError?: string | null;
}) {
  const image = mapSnapshot?.gridId === selected.gridId ? mapSnapshot : null;
  const points = selected.boundary.coordinates.flat(2);
  const center = points.length
    ? [
        (Math.min(...points.map((p) => p[0])) + Math.max(...points.map((p) => p[0]))) / 2,
        (Math.min(...points.map((p) => p[1])) + Math.max(...points.map((p) => p[1]))) / 2,
      ]
    : null;
  return (
    <section className="policy-location" aria-label="선택 격자 위치">
      <h3>선택 격자 위치</h3>
      {image ? (
        <figure className="policy-location-map">
          <img src={image.imageUrl} alt="열환경 지도에서 선택한 격자의 위치" />
          <span
            className="policy-location-marker"
            role="img"
            aria-label="선택 격자 표시"
            style={{ left: `${image.marker.x * 100}%`, top: `${image.marker.y * 100}%` }}
          />
        </figure>
      ) : (
        <p role="status">{mapSnapshotError ?? '열환경 지도 화면을 불러오는 중입니다.'}</p>
      )}
      <strong>{regionName ?? '인천광역시 미추홀구'}</strong>
      <code>{selected.gridId}</code>
      {center && (
        <small>
          경도 {center[0].toFixed(5)} / 위도 {center[1].toFixed(5)}
        </small>
      )}
    </section>
  );
}
