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

## Bước 1: Tạo cặp khóa ký (một lần)

Trong thư mục dự án (đã cài `@tauri-apps/cli`):

```bash
pnpm exec tauri signer generate -w .tauri/updater.key
```

- File **private** `.tauri/updater.key` đã được liệt kê trong `.gitignore` — **không** đưa lên Git.
- CLI tạo thêm file **public** (ví dụ `.tauri/updater.key.pub`).

**Public key dán ở đâu:** trong `src-tauri/tauri.conf.json`, đường dẫn JSON là **`plugins` → `updater` → `pubkey`** (chuỗi minisign **một dòng**, thường bắt đầu bằng `RW`).

**Lấy giá trị từ đâu:** mở file `.pub`, copy **dòng thứ hai** (toàn bộ dòng — đó là public key). Dòng đầu là comment minisign, **không** dán vào `pubkey`.

Ví dụ cấu trúc (repo của bạn có thể khác `OWNER/REPO` hoặc đã sửa URL):

```json
"plugins": {
  "updater": {
    "active": true,
    "endpoints": [
      "https://github.com/OWNER/REPO/releases/latest/download/latest.json"
    ],
    "pubkey": "RWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  }
}
```

Trong repo hiện tại, khóa nằm tại:

```37:43:src-tauri/tauri.conf.json
    "updater": {
      "active": true,
      "endpoints": [
        "https://github.com/cuonglamphu/Assetbender-DesktopApp/releases/latest/download/latest.json"
      ],
      "pubkey": "RWS3gEgLSyeV6pLMQxA88qi7UJtuwcD3Atserdkh65a16xIq+drTRxrkW"
    }
```

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

## Gỡ lỗi thường gặp

| Hiện tượng | Gợi ý |
|------------|--------|
| Release fail ở bước ký | Kiểm tra secret `TAURI_SIGNING_PRIVATE_KEY`, khớp pubkey trong `tauri.conf.json`. |
| App không thấy bản mới | URL `endpoints` phải trỏ đúng repo có release + `latest.json`; version trong app phải **thấp hơn** version release. |
| `latest.json` sai asset | Xem [tauri-action](https://github.com/tauri-apps/tauri-action) và `updaterJsonPreferNsis` (Windows). |
| Monorepo | Chỉnh `projectPath`, đường dẫn `pnpm-lock.yaml`, và bước replace `tauri.conf.json` cho đúng thư mục `src-tauri`. |

## Tài liệu tham khảo

- [Tauri v2 — Updater](https://v2.tauri.app/plugin/updater/)
- [tauri-action](https://github.com/tauri-apps/tauri-action) (`tauri-apps/tauri-action@v0`)
- [Code signing](https://v2.tauri.app/distribute/sign/) (tuỳ nền tảng, thêm chứng chỉ Apple/Windows nếu phân phối rộng)
