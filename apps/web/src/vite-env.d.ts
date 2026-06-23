/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_K8S_IDE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
