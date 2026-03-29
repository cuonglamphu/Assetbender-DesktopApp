import { expect, test, type Route } from "@playwright/test";

/**
 * E2E cho UI cập nhật (force / soft) của **shell web** Tauri:
 * - Build: `VITE_E2E=1` + alias mock trong `vite.config.ts`
 * - Policy: `VITE_FRONTEND_URL=http://localhost:3002` → fetch `.../updater/update-policy.json`
 * - `globalThis.__PLAYWRIGHT__` điều khiển version app + gói update (mock plugin-updater)
 *
 * Next chạy :3002 (Assetsflow-Frontend) — route có thể fulfill JSON để không phụ thuộc file tĩnh.
 */

const POLICY_URL = "http://localhost:3002/updater/update-policy.json";

async function fulfillPolicy(route: Route, body: Record<string, unknown>) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test.describe("Force update dialog", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(POLICY_URL, (route) =>
      fulfillPolicy(route, {
        minimumVersion: "0.0.50",
        softUpdatePrompt: true,
        forceMessage: "E2E force",
      }),
    );
    await page.addInitScript(() => {
      (globalThis as unknown as { __PLAYWRIGHT__?: unknown }).__PLAYWRIGHT__ = {
        appVersion: "0.0.10",
        update: {
          version: "0.0.99",
          currentVersion: "0.0.10",
          body: "E2E",
        },
      };
    });
  });

  test("shows Update required and no Later", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Update required/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: /Download and restart/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Later$/i })).toHaveCount(0);
  });
});

test.describe("Soft update dialog", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(POLICY_URL, (route) =>
      fulfillPolicy(route, {
        minimumVersion: "0.0.50",
        softUpdatePrompt: true,
      }),
    );
    await page.addInitScript(() => {
      (globalThis as unknown as { __PLAYWRIGHT__?: unknown }).__PLAYWRIGHT__ = {
        appVersion: "0.0.60",
        update: {
          version: "1.0.0",
          currentVersion: "0.0.60",
          body: "Soft E2E",
        },
      };
    });
  });

  test("shows Update available and Later", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Update available/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: /Download and restart/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Later$/i })).toBeVisible();
  });
});
