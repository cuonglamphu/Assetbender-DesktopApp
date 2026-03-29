# E2E (Playwright) — shell web Tauri

## Không phải cửa sổ desktop

Playwright chạy **Chromium** + **`vite preview`**. Đây là **UI React** trong trình duyệt, không phải WebView Tauri đóng gói. App desktop thật: [WebDriver / tauri-driver](https://v2.tauri.app/develop/tests/webdriver/).

## Build E2E (`VITE_E2E=1`)

`playwright.config.ts` gọi `pnpm run build` với:

- `VITE_E2E=1` → `vite.config.ts` alias `@tauri-apps/*` sang `src/e2e/mocks/*`
- `VITE_FRONTEND_URL=http://localhost:3002` — cùng URL policy mà app production dùng (file `update-policy.json` trên site)

## Force update & soft update (`e2e/app-update.spec.ts`)

- `globalThis.__PLAYWRIGHT__` đặt **version app** + **gói update** (mock `getVersion` / `check`).
- `page.route('http://localhost:3002/updater/update-policy.json', …)` trả JSON policy (không cần Next chạy trên :3002).

Tùy chọn: chạy `Assetsflow-Frontend` `pnpm run dev` (:3002) để kiểm tra fetch thật tới file tĩnh.

## Login smoke (`e2e/app.spec.ts`)

Mock `invoke` → màn login với Welcome.

## Lệnh

```bash
pnpm run test:e2e
```
