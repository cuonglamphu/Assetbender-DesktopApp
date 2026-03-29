import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

/** Playwright: `VITE_E2E=1 pnpm run build` — mock Tauri modules for browser E2E. */
const e2e = process.env.VITE_E2E === "1";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      ...(e2e
        ? {
            "@tauri-apps/api/app": path.resolve(__dirname, "./src/e2e/mocks/app.ts"),
            "@tauri-apps/api/core": path.resolve(__dirname, "./src/e2e/mocks/core.ts"),
            "@tauri-apps/api/event": path.resolve(__dirname, "./src/e2e/mocks/event.ts"),
            "@tauri-apps/plugin-updater": path.resolve(
              __dirname,
              "./src/e2e/mocks/updater.ts",
            ),
            "@tauri-apps/plugin-process": path.resolve(
              __dirname,
              "./src/e2e/mocks/process.ts",
            ),
            "@tauri-apps/plugin-opener": path.resolve(
              __dirname,
              "./src/e2e/mocks/opener.ts",
            ),
          }
        : {}),
    },
  },
  plugins: [react(), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
