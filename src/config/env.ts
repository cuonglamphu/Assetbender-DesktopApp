/** Vite env overrides; defaults match production [Master-Mouse/lib/config/app_config.dart]. */
export const VITE_API_URL =
  import.meta.env.VITE_API_URL ?? "https://api.assetbender.com";
export const VITE_FRONTEND_URL =
  import.meta.env.VITE_FRONTEND_URL ?? "https://assetbender.com";
export const VITE_SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ?? "wss://api.assetbender.com";
