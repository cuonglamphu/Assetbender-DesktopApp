# CI/CD và auto-update (Tauri + GitHub Actions)

Tài liệu này mô tả cách pipeline **build**, **ký bản phát hành**, và **cập nhật trong app** (Tauri [updater plugin](https://v2.tauri.app/plugin/updater/)) cho dự án `assetbender-mac`.

## Tổng quan

| Thành phần | Vai trò |
|------------|---------|
| `.github/workflows/ci.yml` | Mỗi push/PR: build frontend (`pnpm build`), `cargo clippy`, `cargo test`. |
| `.github/workflows/release.yml` | Khi push **tag** `v*`: build **macOS (arm64 + x64)**, **Linux**, **Windows**, tạo **GitHub Release**, upload installer + **`latest.json`** cho updater. |
| `src-tauri/tauri.conf.json` → `plugins.updater` | URL manifest cập nhật + **public key** minisign (khớp private key trên CI). |
| Rust `check_app_update` + `tauri-plugin-updater` | App gọi API updater để so sánh version và tải bản đã ký. |

Workflow release dùng [`tauri-apps/tauri-action@v0`](https://github.com/tauri-apps/tauri-action): khi bật `includeUpdaterJson: true`, artifact `latest.json` trỏ tới asset trên release hiện tại.

## Điều kiện trước khi bật release có ký

1. Repo trên GitHub (quyền **Actions** và **Contents: write** cho `GITHUB_TOKEN` khi release).
2. **Cặp khóa ký** Tauri (minisign): public key nằm trong `tauri.conf.json`, private key chỉ lưu trong **GitHub Secrets** (không commit).

### Bảng tra cứu: key lấy đâu, đặt đâu

Trên GitHub repo: **Settings → Secrets and variables → Actions**.

#### Secrets (bắt buộc cho release có ký)

| Secret | Lấy giá trị ở đâu | Ghi chú |
|--------|-------------------|---------|
| `TAURI_SIGNING_PRIVATE_KEY` | File **private** local `.tauri/updater.key` (toàn bộ nội dung, hoặc đúng định dạng base64 mà Tauri dùng). Tạo bằng `pnpm exec tauri signer generate -w .tauri/updater.key`. | **Repository secrets**. Khớp với `plugins.updater.pubkey` trong `tauri.conf.json` (đồng bộ bằng `pnpm run pubkey:sync`). Không commit file `.key`. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Mật khẩu bạn gõ khi tạo key **có** password. | Chỉ tạo secret nếu key **có** mật khẩu; nếu generate **không** password thì **không** cần secret này (hoặc để trống). |

#### Secrets (tuỳ chọn — job **upload-r2** lên Cloudflare R2)

Tạo bucket và API token trong [Cloudflare Dashboard](https://dash.cloudflare.com/) → **R2** → bucket của bạn → **Manage R2 API Tokens** (hoặc **Overview** để xem **Account ID**).

| Secret | Lấy giá trị ở đâu | Ghi chú |
|--------|-------------------|---------|
| `R2_ACCOUNT_ID` | Cloudflare: trang **Overview** tài khoản (hoặc URL R2), cột **Account ID**. | Dùng trong endpoint S3: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. |
| `R2_ACCESS_KEY_ID` | Khi tạo **R2 API token** (quyền đọc/ghi object trên bucket đích). | Giống “Access Key ID” của token. |
| `R2_SECRET_ACCESS_KEY` | Cùng lúc tạo API token (chỉ hiện một lần — lưu ngay). | Giống “Secret Access Key”. |
| `R2_BUCKET` | Tên bucket bạn tạo trong R2 (ví dụ `assetbender-updates`). | Chỉ tên bucket, không có `s3://`. |

Job **upload-r2** luôn chạy sau verify; nếu **thiếu** một trong các secret R2 ở trên, workflow **bỏ qua** bước mirror và vẫn **success** (notice trong log).

#### Variables (tuỳ chọn — R2 rewrite manifest)

Cùng trang **Secrets and variables → Actions** → tab **Variables**.

| Variable | Giá trị | Ghi chú |
|----------|---------|---------|
| `R2_PUBLIC_BASE_URL` | URL HTTPS **công khai** trỏ vào bucket (Custom Domain / `*.r2.dev`). Ví dụ `https://updates.yourdomain.com` (không `/` cuối). | Chỉ dùng khi đã cấu hình secrets R2; bước rewrite `latest.json`. |
| `R2_PREFIX` | Chuỗi prefix, mặc định trong workflow là `assetbender` nếu không đặt. | Path trên bucket và URL CDN: `…/assetbender/v1.0.0/…`. |

#### Trong code (không phải GitHub Secret)

| Nội dung | File | Ghi chú |
|----------|------|---------|
| Public key minisign (base64 của file `.pub`) | `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` | `pnpm run pubkey:sync` từ `.tauri/updater.key.pub`. |
| URL manifest updater (GitHub hoặc CDN) | `src-tauri/tauri.conf.json` → `plugins.updater.endpoints` | Ví dụ GitHub `…/releases/latest/download/latest.json` hoặc CDN `https://…/assetbender/latest.json` nếu dùng R2 + rewrite. |

#### Token mặc định của GitHub Actions

`GITHUB_TOKEN` do GitHub inject sẵn cho workflow — **không** cần tạo trong Secrets (trừ khi bạn override bằng PAT cho use-case đặc biệt).

## Bước 1: Tạo cặp khóa ký (một lần)

Trong thư mục dự án (đã cài `@tauri-apps/cli`):

```bash
pnpm exec tauri signer generate -w .tauri/updater.key
```

- File **private** `.tauri/updater.key` đã được liệt kê trong `.gitignore` — **không** đưa lên Git.
- CLI tạo thêm file **public** (ví dụ `.tauri/updater.key.pub`).

**Public key dán ở đâu:** trong `src-tauri/tauri.conf.json`, đường dẫn JSON là **`plugins` → `updater` → `pubkey`**. Tauri 2 build/updater **kỳ vọng giá trị là base64** của toàn bộ file `.pub` (UTF-8, hai dòng minisign), **không** phải chỉ dòng bắt đầu bằng `RW` — nếu chỉ dán dòng `RW`, build có thể báo lỗi kiểu `failed to decode base64 pubkey`.

**Lấy giá trị đúng:** dùng `pnpm run pubkey:sync` (khuyến nghị), hoặc base64 hóa toàn bộ nội dung file `.pub` (cả comment + dòng public key).

**Tự động:** sau khi generate hoặc đổi file `.tauri/updater.key.pub`, chạy:

```bash
pnpm run pubkey:sync
```

Script `scripts/sync-updater-pubkey.mjs` đọc `.pub` (hai dòng minisign hoặc một dòng base64 của file đó) và ghi `plugins.updater.pubkey` dưới dạng **base64** chuẩn Tauri.

Ví dụ cấu trúc (repo của bạn có thể khác `OWNER/REPO` hoặc đã sửa URL):

```json
"plugins": {
  "updater": {
    "active": true,
    "endpoints": [
      "https://github.com/OWNER/REPO/releases/latest/download/latest.json"
    ],
    "pubkey": "<một chuỗi base64 dài — toàn bộ file .pub dạng UTF-8>"
  }
}
```

Trong repo hiện tại, `pubkey` nằm trong `src-tauri/tauri.conf.json` dưới `plugins.updater` (đồng bộ bằng `pnpm run pubkey:sync` khi cần).

**Lưu ý:** `pubkey` phải **cùng cặp** với private key dùng khi ký (`TAURI_SIGNING_PRIVATE_KEY` / file `.tauri/updater.key`). Đổi một trong hai thì phải đổi cả hai cho khớp.

- Thay `OWNER/REPO` bằng repo thật (ví dụ `myorg/assetbender-mac`) **hoặc** để placeholder `OWNER/REPO` — workflow **Release** sẽ tự thay bằng `${{ github.repository }}` lúc build trên CI.
- Local build cần URL đúng repo nếu bạn test updater; có thể sửa tay cho khớp repo GitHub của bạn.

**Private key** cho GitHub:

- Mở `.tauri/updater.key`, copy **toàn bộ** nội dung file (hoặc dùng đúng định dạng mà Tauri docs khuyến nghị cho `TAURI_SIGNING_PRIVATE_KEY`).
- Vào repo GitHub → **Settings → Secrets and variables → Actions → New repository secret**:
  - `TAURI_SIGNING_PRIVATE_KEY` — nội dung private key.
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — chỉ khi bạn đặt mật khẩu khi generate (thường để trống nếu generate không password).

Public key trong `tauri.conf.json` **phải** khớp với private key trong secret — nếu không, build release vẫn chạy nhưng client sẽ **không** tin cậy bản cập nhật.

## Bước 2: Đồng bộ version

Trước mỗi release, cập nhật version **cùng một giá trị** ở:

- `package.json` (`version`)
- `src-tauri/tauri.conf.json` (`version`)
- `src-tauri/Cargo.toml` (`version`)

Tag Git nên phản ánh version (ví dụ app `0.2.0` → tag `v0.2.0`).

Một lệnh để ghi cùng version vào cả ba file:

```bash
pnpm run version:sync -- 0.2.0
```

Commit, push nhánh hiện tại, tạo tag `v*` và push tag (kích hoạt workflow **Release**):

```bash
pnpm run release -- 0.2.0
```

Luồng này gọi `version:sync` rồi **`pubkey:sync`** (đồng bộ `plugins.updater.pubkey` từ `.tauri/updater.key.pub` vào `tauri.conf.json`) trước khi commit. Trên **GitHub Actions**, workflow **Release** chạy cùng bước `pubkey:sync` trước build **nếu** repo có file `.tauri/updater.key.pub` (nếu không có, dùng `pubkey` đã commit trong JSON).

Tuỳ chọn: `--dry-run` (chỉ in lệnh), `--skip-push` (commit + tag local, tự push sau), `--all` (`git add -A` thay vì chỉ 3 file version).

## Bước 3: Chạy CI

Push lên nhánh `main` / `master` / `develop` hoặc mở PR — workflow **CI** chạy tự động. Monorepo: đặt file workflow ở **root repo** và thêm `defaults.run.working-directory: assetbender-mac` (hoặc tương đương) nếu `package.json` không nằm ở root.

## Bước 4: Tạo bản phát hành (auto-update)

1. Commit version và thay đổi cần thiết.
2. Tạo và đẩy tag:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. Vào tab **Actions** trên GitHub, theo dõi workflow **Release** (matrix 4 job).
4. Khi xong, trong **Releases** sẽ có bản **draft** (theo `releaseDraft: true` trong workflow). Kiểm tra asset (`.msi` / `.dmg` / `.AppImage` / …) và file **`latest.json`**.
5. Chỉnh `releaseDraft: false` trong `release.yml` nếu muốn publish release ngay không cần duyệt draft.

Client đã cài app cũ sẽ lấy `latest.json` từ URL trong `tauri.conf.json` (sau khi CI đã thay đúng `OWNER/REPO`).

### Tuỳ chọn: repo code private + manifest công khai (Cloudflare R2)

Phù hợp khi **repo GitHub private** (CI vẫn build và ký bằng secret) nhưng updater cần URL **HTTPS công khai** ổn định, không phụ thuộc `github.com/.../releases/latest/download/latest.json` (draft, quyền asset, hoặc muốn CDN).

Workflow **Release** (`.github/workflows/release.yml`) có job **`upload-r2`** (chạy sau khi verify có `latest.json`): nếu đủ secrets R2, tải asset release bằng `gh release download`, rồi đẩy lên R2 bằng **AWS CLI**; nếu thiếu secret R2, job vẫn **success** và bỏ qua upload.

**Secrets R2:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` — ý nghĩa giống bảng tra cứu ở trên.

**Variables:** `R2_PUBLIC_BASE_URL` (URL công khai, rewrite `latest.json`), `R2_PREFIX` (mặc định `assetbender`).

**Đường dẫn trên R2 sau mỗi tag `v1.2.3`:**

- `s3://<bucket>/<R2_PREFIX>/v1.2.3/` — toàn bộ file đã tải từ release (installer, `.sig`, …).
- `s3://<bucket>/<R2_PREFIX>/latest.json` — manifest (sau bước rewrite nếu có `R2_PUBLIC_BASE_URL`), ghi đè mỗi release.

**Nội dung `latest.json`:** job chạy script `scripts/rewrite-updater-manifest-for-r2.mjs` khi **variable** `R2_PUBLIC_BASE_URL` không rỗng. Script chỉ thay **URL tải** cho từng nền tải; `version`, `notes`, `pub_date`, `signature` giữ như bản Tauri tạo. Bạn cần cấu hình DNS / R2 public access sao cho URL dạng  
`https://<R2_PUBLIC_BASE_URL>/<R2_PREFIX>/<tag>/<filename>`  
trả đúng object đã upload (trùng tên file với asset trên GitHub).

Trong `tauri.conf.json`, `plugins.updater.endpoints` nên trỏ tới manifest công khai, ví dụ  
`https://updates.example.com/assetbender/latest.json`  
(khớp `R2_PUBLIC_BASE_URL` + `R2_PREFIX` + `/latest.json`).

Giữ **cùng cặp khóa ký** (minisign) giữa CI và `pubkey` trong app. R2 không thay GitHub Actions — vẫn build trên CI; R2 là **bản phục vụ công khai** tuỳ chọn.

## Gỡ lỗi thường gặp

| Hiện tượng | Gợi ý |
|------------|--------|
| Release fail ở bước ký | Kiểm tra secret `TAURI_SIGNING_PRIVATE_KEY`, khớp pubkey trong `tauri.conf.json`. |
| `incorrect updater private key password` / `Wrong password for that key` | Khóa minisign **có mật khẩu** khi tạo nhưng secret **`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`** trên GitHub sai hoặc thiếu — sửa đúng mật khẩu, hoặc tạo lại key **không mật khẩu** (`tauri signer generate` không `-p`) và cập nhật cả private secret + `pubkey` trong `tauri.conf.json`. Nếu key **không** có mật khẩu: xóa secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` hoặc để giá trị rỗng (đừng đặt mật khẩu giả). |
| App không thấy bản mới | URL `endpoints` phải trỏ đúng repo có release + `latest.json`; version trong app phải **thấp hơn** version release. |
| `latest.json` sai asset | Xem [tauri-action](https://github.com/tauri-apps/tauri-action) và `updaterJsonPreferNsis` (Windows). |
| Monorepo | Chỉnh `projectPath`, đường dẫn `pnpm-lock.yaml`, và bước replace `tauri.conf.json` cho đúng thư mục `src-tauri`. |

## Test auto-update

### Đồng bộ version (tránh lệch tag / installer / manifest)

Trước mỗi release, cùng một số version ở `package.json`, `src-tauri/tauri.conf.json` (`version`), `src-tauri/Cargo.toml` (`version`), và tag Git (ví dụ app `0.2.0` → `v0.2.0`). Nếu tag là `v0.0.1` mà file cài đặt ghi `0.1.0`, updater và người dùng sẽ khó đối chiếu — giữ một nguồn version.

Trong `src-tauri/tauri.conf.json`, bật artifact updater khi build release:

```json
"bundle": {
  "createUpdaterArtifacts": true
}
```

(không bật thì có thể thiếu `.sig` / bundle dùng cho updater.)

### Test thủ công trong app

1. Cài bản **cũ** (version thấp hơn), ví dụ `0.0.1`.
2. Trên GitHub đã có release **mới hơn** (ví dụ `0.0.2`) với `latest.json` công khai (**không** draft — `releases/latest/download/latest.json` sẽ 404 nếu chỉ có draft).
3. Mở app → nút **Check updates** (gọi `check_app_update`) hoặc tích hợp [plugin updater](https://v2.tauri.app/plugin/updater/) để tải và cài.

Updater chỉ báo có bản mới khi **semver** trên manifest **lớn hơn** version app đang chạy.

### Kiểm tra tự động `latest.json`

Trong thư mục `assetbender-mac`:

```bash
pnpm test:updater
pnpm test:updater -- --probe
```

- Không cờ: tải manifest, kiểm tra `version`, `platforms.*.url`, `platforms.*.signature`.
- `--probe`: thêm kiểm tra HTTP (HEAD/G fallback) từng URL asset.

URL mặc định lấy từ `plugins.updater.endpoints[0]` trong `tauri.conf.json`, hoặc:

`UPDATER_MANIFEST_URL=https://github.com/OWNER/REPO/releases/latest/download/latest.json pnpm test:updater -- --probe`

Workflow **Verify updater manifest** (`.github/workflows/verify-updater.yml`) chạy `node scripts/verify-updater-manifest.mjs --probe` theo lịch và khi sửa file liên quan.

Nếu `pnpm test:updater` báo **404**: thường là release còn **Draft**, **chưa có asset tên đúng `latest.json`** (trên tab Release phải thấy file đó cạnh `.exe`/`.dmg`), hoặc repo **private** (cần `GITHUB_TOKEN`). Nếu đã Publish mà vẫn không có `latest.json` trong danh sách assets, build CI **không** sinh/up upload updater — kiểm tra `bundle.createUpdaterArtifacts: true`, secret `TAURI_SIGNING_PRIVATE_KEY`, và job **Verify release has latest.json** trong workflow Release (sẽ fail nếu thiếu file).

## Tài liệu tham khảo

- [Tauri v2 — Updater](https://v2.tauri.app/plugin/updater/)
- [tauri-action](https://github.com/tauri-apps/tauri-action) (`tauri-apps/tauri-action@v0`)
- [Code signing](https://v2.tauri.app/distribute/sign/) (tuỳ nền tảng, thêm chứng chỉ Apple/Windows nếu phân phối rộng)
