import { useEffect, useRef, useState } from 'react';
import {
  Cartesian3,
  createOsmBuildingsAsync,
  createWorldTerrainAsync,
  HeadingPitchRange,
  Ion,
  Math as CesiumMath,
  Matrix4,
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

        // 최초 화면은 미추홀구 주변을 비스듬히 바라본다.
        mapViewer.camera.lookAt(
          Cartesian3.fromDegrees(126.65, 37.45),
          new HeadingPitchRange(0, CesiumMath.toRadians(-45), 5000),
        );
        mapViewer.camera.lookAtTransform(Matrix4.IDENTITY);

        const buildings = await createOsmBuildingsAsync();

        if (disposed) {
          buildings.destroy();
          return;
        }

        mapViewer.scene.primitives.add(buildings);
      } catch (cause) {
        if (!disposed) {
          console.error('지도 초기화 실패', cause);
          setError('지도를 불러오지 못했습니다. 토큰과 네트워크를 확인해주세요.');
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
