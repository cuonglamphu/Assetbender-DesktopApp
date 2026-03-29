/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_FRONTEND_URL?: string;
  readonly VITE_SOCKET_URL?: string;
  readonly VITE_PUBLIC_IMAGE_BUCKET_URL?: string;
  /** Optional full URL override for `fetchUpdatePolicy()` (default: `{VITE_FRONTEND_URL}/updater/update-policy.json`). */
  readonly VITE_UPDATE_POLICY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
