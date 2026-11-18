interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_CESIUM_ION_TOKEN: string;
  readonly VITE_VWORLD_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
