/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_FRONTEND_URL?: string;
  readonly VITE_SOCKET_URL?: string;
  readonly VITE_PUBLIC_IMAGE_BUCKET_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
