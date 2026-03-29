#!/usr/bin/env node
/**
 * Ghi đè `platforms.*.url` trong `latest.json` (manifest Tauri updater) để trỏ tới CDN/R2
 * thay vì URL GitHub Releases. Chữ ký (.sig) giữ nguyên — cùng một file binary đã mirror.
 *
 * Biến môi trường:
 *   R2_PUBLIC_BASE_URL — bắt buộc để chạy (vd. https://updates.example.com, không dấu / cuối)
 *   GITHUB_REF_NAME — tag (vd. v0.0.10)
 *   R2_PREFIX — optional, mặc định assetbender (khớp prefix khi upload S3)
 *   LATEST_JSON_PATH — optional, mặc định release-assets/latest.json
 *
 * Nếu không đặt R2_PUBLIC_BASE_URL: thoát 0 (không sửa file).
 */

import { readFileSync, writeFileSync } from "fs";

function main() {
  const baseRaw = process.env.R2_PUBLIC_BASE_URL?.trim();
  if (!baseRaw) {
    console.log(
      "[rewrite-updater-manifest] R2_PUBLIC_BASE_URL không set — giữ nguyên URL trong latest.json (vẫn trỏ GitHub).",
    );
    return;
  }

  const base = baseRaw.replace(/\/+$/, "");
  const prefix = (process.env.R2_PREFIX ?? "assetbender")
    .replace(/^\/+|\/+$/g, "");
  const tag = (process.env.GITHUB_REF_NAME ?? "").trim();
  if (!tag) {
    console.error("[rewrite-updater-manifest] Thiếu GITHUB_REF_NAME");
    process.exit(1);
  }

  const path = process.env.LATEST_JSON_PATH ?? "release-assets/latest.json";
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    console.error(`[rewrite-updater-manifest] Không đọc được ${path}:`, e);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error("[rewrite-updater-manifest] JSON không hợp lệ:", e);
    process.exit(1);
  }

  const platforms = data?.platforms;
  if (!platforms || typeof platforms !== "object" || Array.isArray(platforms)) {
    console.error("[rewrite-updater-manifest] Thiếu hoặc sai `platforms`");
    process.exit(1);
  }

  for (const key of Object.keys(platforms)) {
    const spec = platforms[key];
    if (!spec || typeof spec !== "object") continue;
    const oldUrl = spec.url;
    if (typeof oldUrl !== "string" || !oldUrl.trim()) continue;

    let basename;
    try {
      basename = new URL(oldUrl).pathname.split("/").filter(Boolean).pop() ?? "";
    } catch {
      console.error(`[rewrite-updater-manifest] URL không hợp lệ (${key}): ${oldUrl}`);
      process.exit(1);
    }
    if (!basename) {
      console.error(`[rewrite-updater-manifest] Không lấy được tên file từ URL (${key})`);
      process.exit(1);
    }

    const newUrl = `${base}/${prefix}/${tag}/${encodeURIComponent(basename)}`;
    console.log(`[rewrite-updater-manifest] ${key}: ${oldUrl} -> ${newUrl}`);
    spec.url = newUrl;
  }

  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log("[rewrite-updater-manifest] Đã ghi:", path);
}

main();
