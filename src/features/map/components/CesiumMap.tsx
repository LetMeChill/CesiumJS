import { useEffect, useRef, useState } from 'react';
import { getRegionDetail } from '../../region/api/regionApi';
import {
  Cartesian3,
  Color,
  createOsmBuildingsAsync,
  createWorldTerrainAsync,
  GeoJsonDataSource,
  HeadingPitchRange,
  Ion,
  Math as CesiumMath,
  Viewer,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './CesiumMap.css';

// useRef = Cesium이 지도를 그릴 HTML
// useEffect = 화면이 나타나면 지도를 생성하고, 종료되면 정리
// useState = 로딩·실패 안내를 화면에 표시

const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim();

export default function CesiumMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || !ionToken) {
      return;
    }

    let disposed = false;
    let viewer: Viewer | undefined;
    const abortController = new AbortController();

    async function initializeMap(container: HTMLDivElement) {
      try {
        Ion.defaultAccessToken = ionToken;

        const terrainProvider = await createWorldTerrainAsync();

        // 데이터를 기다리는 동안 화면이 종료됐다면 생성하지 않는다.
        if (disposed) {
          return;
        }

        const mapViewer = new Viewer(container, {
          terrainProvider,
          animation: false,
          timeline: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          infoBox: false,
          selectionIndicator: false,
        });

        viewer = mapViewer;

        // 현재 MVP 대상 지역인 미추홀구의 ID를 사용한다.
        const region = await getRegionDetail(1, abortController.signal);

        if (disposed) {
          return;
        }

        // API의 경계 좌표를 Cesium에서 표시할 데이터로 변환한다.
        const boundarySource = await GeoJsonDataSource.load(
          {
            type: 'Feature',
            geometry: region.boundary,
            properties: {
              name: region.name,
            },
          },
          {
            fill: Color.CYAN.withAlpha(0.08),
            stroke: Color.CYAN,
            clampToGround: true,
          },
        );

        if (disposed) {
          return;
        }

        await mapViewer.dataSources.add(boundarySource);

        if (disposed) {
          return;
        }

        // 지형 위에서도 경계선이 보이도록 각 링을 선으로 표시한다.
        // 바깥 경계뿐 아니라 내부 구멍의 경계도 유지한다.
        for (const polygon of region.boundary.coordinates) {
          for (const ring of polygon) {
            mapViewer.entities.add({
              polyline: {
                positions: Cartesian3.fromDegreesArray(
                  ring.flatMap(([longitude, latitude]) => [longitude, latitude]),
                ),
                width: 3,
                material: Color.CYAN,
                clampToGround: true,
              },
            });
          }
        }

        // 고정 좌표 대신 실제 지역 경계가 들어오도록 카메라를 맞춘다.
        await mapViewer.zoomTo(
          boundarySource,
          new HeadingPitchRange(0, CesiumMath.toRadians(-45), 0),
        );

        if (disposed) {
          return;
        }

        const buildings = await createOsmBuildingsAsync();

        if (disposed) {
          buildings.destroy();
          return;
        }

        mapViewer.scene.primitives.add(buildings);
      } catch (cause) {
        if (!disposed) {
          console.error('지도 초기화 실패', cause);
          setError(
            '지도 또는 지역 경계를 불러오지 못했습니다. 서버 실행 상태와 설정을 확인해주세요.',
          );
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }

    void initializeMap(container);

    // 화면 종료·개발 중 재실행 시 WebGL 자원을 정리한다.
    return () => {
      disposed = true;
      abortController.abort();

      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
    };
  }, []);

  if (!ionToken) {
    return (
      <div className="map-message" role="alert">
        Cesium ion 토큰을 설정해주세요.
      </div>
    );
  }

  return (
    <section className="map-view" aria-label="미추홀구 3D 지도">
      <div ref={containerRef} className="map-container" />

      {loading && !error && (
        <div className="map-message" role="status">
          지형과 건물 데이터를 불러오는 중입니다.
        </div>
      )}

      {error && (
        <div className="map-message" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
