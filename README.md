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

Implementation files live under [`scripts/`](./scripts/).

## CI/CD và auto-update

Hướng dẫn đầy đủ: GitHub Actions (CI + release), ký bản build, cấu hình Tauri updater và secrets — xem **[docs/CI_CD_AUTO_UPDATE.md](./docs/CI_CD_AUTO_UPDATE.md)**.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
