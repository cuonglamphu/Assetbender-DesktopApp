import { expect, test } from "@playwright/test";

test.describe("AssetBender web shell", () => {
  test("document title and login welcome", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/AssetBender/i);
    await expect(page.getByText("Welcome!")).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: /log in with browser/i }),
    ).toBeVisible();
  });
});
