import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const cesiumSource = 'node_modules/cesium/Build/Cesium';
const cesiumBaseUrl = 'cesiumStatic';

export default defineConfig(({ mode }) => {
  // 프록시 대상은 Vite 개발 서버에서만 사용하며 브라우저 환경변수로 노출하지 않는다.
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget = env.API_PROXY_TARGET || 'http://localhost:8080';
  return {
    build: {
      rolldownOptions: { input: ['index.html', 'vworld-preview.html'] },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    define: {
      CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}/`),
    },
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          {
            src: `${cesiumSource}/{Workers,ThirdParty,Assets,Widgets}/**/*`,
            dest: cesiumBaseUrl,
            rename: {
              stripBase: 4,
            },
          },
        ],
      }),
    ],
  };
});
