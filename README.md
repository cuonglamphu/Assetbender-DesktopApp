# AssetBender (Tauri + React + TypeScript)

Desktop app for macOS and Windows. Data paths are shared with the MotionBender Premiere CEP panel when both are installed on the same machine.

## Data paths (cross-platform)

The Rust layer uses [`dirs::config_dir()`](https://docs.rs/dirs/latest/dirs/fn.config_dir.html) as the root for user data. That path matches Adobe CEP **userData** (`csi.getSystemPath("userData")` in the panel), so the app and the extension read the same files.

| Purpose | Location (under config / userData root) |
|--------|----------------------------------------|
| Auth token, install manifest | `AssetsFlow/auth_token.json`, `AssetsFlow/installed_plugins.json` |
| Installed packs | `AssetsFlowData/` |
| CEP extensions (plugin ZIP extract) | See below (not under config root on every OS) |

**macOS — CEP extensions:** `~/Library/Application Support/Adobe/CEP/extensions` (created on first install if needed; matches Adobe’s per-user CEP location).

**Windows — CEP extensions:** `%APPDATA%\Adobe\CEP\extensions` (no admin rights required).

**Override (macOS or Windows):** set `ASSETBENDER_CEP_DIR` to force where plugin ZIPs are extracted. The folder must still be one Adobe CEP loads (or used only for testing).

**Inspect paths at runtime:** call the Tauri command `get_data_paths` (returns `appDataRoot`, `assetsFlowDir`, `packInstallDir`, `cepExtensionsDir`, `cepExtensionId`) to verify alignment with the MotionBender panel on the same machine.

**Optional — open app from CEP panel:** the MotionBender panel can launch the desktop app via **“soft login.”** Set `ASSETBENDER_APP_PATH` to the full path of the app bundle (macOS, e.g. `/Applications/AssetBender.app`) or `.exe` (Windows) if the default lookup fails.

Implementation: [`src-tauri/src/paths.rs`](./src-tauri/src/paths.rs). Folder and file **names** are `pub const` there and duplicated in MotionBender [`src/constants/assetbenderPaths.ts`](../MotionBender/src/constants/assetbenderPaths.ts) — update both when renaming.

## Biến môi trường (`.env`)

1. **Tạo file:** copy mẫu rồi chỉnh theo môi trường của bạn (file `.env` đã được [`.gitignore`](./.gitignore) — không commit).

   ```bash
   cp .env.example .env
   ```

2. **Frontend (Vite)** — các biến `VITE_*` được **nhúng lúc build** (`pnpm dev` / `pnpm build`). Mặc định trong code: [`src/config/env.ts`](./src/config/env.ts) (trùng production nếu bạn không set).

   | Biến | Ý nghĩa |
   |------|---------|
   | `VITE_API_URL` | Base URL API backend (REST). |
   | `VITE_FRONTEND_URL` | Origin web/marketing (link trong app, `update-policy.json`, v.v.). |
   | `VITE_SOCKET_URL` | URL Socket.IO (thường `wss://…`). |
   | `VITE_PUBLIC_IMAGE_BUCKET_URL` | (Tuỳ chọn) CDN ảnh — xem [`src/config/assetUrls.ts`](./src/config/assetUrls.ts). |
   | `VITE_UPDATE_POLICY_URL` | (Tuỳ chọn) URL đầy đủ tới `update-policy.json`; mặc định là `{VITE_FRONTEND_URL}/updater/update-policy.json`. |

3. **Rust / Tauri** — (tuỳ chọn) đặt khi cần URL khác mặc định trong native layer: `ASSETBENDER_API_URL`, `ASSETBENDER_FRONTEND_URL`, `ASSETBENDER_SOCKET_URL` (đọc trong [`src-tauri/src/lib.rs`](./src-tauri/src/lib.rs)). Override thư mục CEP: `ASSETBENDER_CEP_DIR` (xem mục Data paths phía trên).

4. **Ký bản build updater (local)** — khi build release có artifact updater: `TAURI_SIGNING_PRIVATE_KEY` (đường dẫn tới file, ví dụ `.tauri/updater.key`, **hoặc** nội dung key), và `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` nếu key có mật khẩu. Tạo cặp key: `pnpm exec tauri signer generate -w .tauri/updater.key`, đồng bộ public key: `pnpm run pubkey:sync`. Trên **GitHub Actions** dùng **Secrets** repo, không dùng `.env` — chi tiết: [docs/CI_CD_AUTO_UPDATE.md](./docs/CI_CD_AUTO_UPDATE.md).

5. **Apple `.p12` → secret `APPLE_CERTIFICATE` (CI):** copy file `.p12` (export từ Mac) sang máy Windows, rồi tạo base64 **một dòng** bằng OpenSSL (tránh Notepad / BOM / CRLF):
   - **Git Bash hoặc WSL:** `bash scripts/encode-p12-for-github.sh path/to/cert.p12` → ra file `cert.github-b64.txt`.
   - **PowerShell (thường cần [Git for Windows](https://git-scm.com/download/win) để có `openssl`):** `pwsh -File scripts/encode-p12-for-github.ps1 path\to\cert.p12`
   Dán **một dòng** vào GitHub → Secrets → `APPLE_CERTIFICATE`, hoặc: `gh secret set APPLE_CERTIFICATE < cert.github-b64.txt`. Mật khẩu export `.p12` đặt riêng secret `APPLE_CERTIFICATE_PASSWORD`.

6. **E2E:** Playwright có thể cần `VITE_E2E=1` khi build cho test (xem [`playwright.config.ts`](./playwright.config.ts), [`vite.config.ts`](./vite.config.ts)).

## Tests

- **Unit / component (Vitest + Testing Library):** `pnpm test` — `pnpm test:watch` khi dev.
- **E2E (Playwright, Chromium, bundle production):** `pnpm test:e2e` (build + chạy). Khi đã có `dist/`: `pnpm test:e2e:quick`.

## Scripts (version, release, icons, updater)

| Command | What it does |
|--------|----------------|
| `pnpm run version:sync -- <semver>` | Writes the same app version to `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` (`[package]`). Example: `pnpm run version:sync -- 0.1.2` |
| `pnpm run version:check` | Prints the three versions above; exits `0` if they match, `1` if not. |
| `pnpm run pubkey:sync` | Copies the minisign public key into `plugins.updater.pubkey` in `tauri.conf.json` (from `.tauri/updater.key.pub` by default). Run after rotating keys or before release. |
| `pnpm run release -- <semver>` | Runs `version:sync`, `pubkey:sync`, commits, pushes the current branch, creates tag `v<semver>`, pushes the tag (triggers the GitHub Release workflow). Flags: `--dry-run` (no git writes), `--skip-push` (no push), `--all` (`git add -A`). Requires `git`, remote `origin`, and push rights. |
| `pnpm run icons` | Regenerates app icons: `scripts/prepare-app-icon.py` → `tauri icon …` → `scripts/sync-web-icons.mjs`. |
| `pnpm test:updater` | Validates the updater `latest.json` shape (and optional `--probe` to hit the endpoint). See script header for `UPDATER_MANIFEST_URL`. |
| `bash scripts/encode-p12-for-github.sh <file.p12>` | Base64 một dòng (`openssl -A`) cho secret `APPLE_CERTIFICATE` — Git Bash / WSL / macOS. |
| `pwsh -File scripts/encode-p12-for-github.ps1 <file.p12>` | Cùng mục đích trên Windows (dùng OpenSSL từ Git for Windows nếu có). |

Implementation files live under [`scripts/`](./scripts/).

## CI/CD và auto-update

Hướng dẫn đầy đủ: GitHub Actions (CI + release), ký bản build, cấu hình Tauri updater và secrets — xem **[docs/CI_CD_AUTO_UPDATE.md](./docs/CI_CD_AUTO_UPDATE.md)**.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
