import { defineConfig, devices } from "@playwright/test";

const vitePort = 4173;
/** Khớp `VITE_FRONTEND_URL` khi build E2E — policy URL (Playwright có thể `route.fulfill` không cần process lắng :3002). */
const policyOrigin = "http://localhost:3002";
const baseURL = `http://localhost:${vitePort}`;

/**
 * Shell web (`vite preview`) + build `VITE_E2E=1` (mock Tauri trong `vite.config.ts`).
 * Muốn policy thật từ Next: chạy `Assetsflow-Frontend` `pnpm run dev` (:3002) — không bắt buộc nếu test dùng `route.fulfill`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm run build && pnpm exec vite preview --port ${vitePort} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      VITE_E2E: "1",
      VITE_FRONTEND_URL: policyOrigin,
    },
  },
});
