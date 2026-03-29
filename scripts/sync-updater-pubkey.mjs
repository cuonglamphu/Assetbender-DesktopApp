#!/usr/bin/env node
/**
 * Đồng bộ `plugins.updater.pubkey` trong `src-tauri/tauri.conf.json`
 * từ `.tauri/updater.key.pub` (minisign).
 *
 * Hỗ trợ đọc `.pub`:
 * - Hai dòng minisign chuẩn (comment + dòng RW…)
 * - Một dòng base64 = toàn bộ nội dung file .pub (UTF-8) đã encode
 *
 * Ghi vào JSON: Tauri 2 kỳ vọng `plugins.updater.pubkey` là **base64** của nội dung
 * file public key (UTF-8), không phải chỉ dòng RW… (xem lỗi decode khi build).
 *
 * Usage:
 *   pnpm run pubkey:sync
 *   node scripts/sync-updater-pubkey.mjs [đường-dẫn-tới.updater.key.pub]
 */

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/**
 * @param {string} raw — nội dung file .pub (text hoặc một dòng base64 của file)
 * @returns {string} nội dung minisign chuẩn (2 dòng + newline cuối)
 */
export function normalizeMinisignPubFileContents(raw) {
  let text = raw.trim();
  const oneLine = !text.includes("\n") && text.length > 0;

  if (oneLine && /^[A-Za-z0-9+/=\s]+$/s.test(text.replace(/\s/g, ""))) {
    const compact = text.replace(/\s/g, "");
    if (compact.length > 60) {
      try {
        const decoded = Buffer.from(compact, "base64").toString("utf8");
        if (decoded.includes("minisign") || decoded.includes("RW")) {
          text = decoded;
        }
      } catch {
        /* giữ nguyên */
      }
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length >= 2 && lines[1].startsWith("RW")) {
    return `${lines[0]}\n${lines[1]}\n`;
  }
  if (lines.length === 1 && lines[0].startsWith("RW")) {
    return `${lines[0]}\n`;
  }

  throw new Error(
    "Không đọc được public key từ .pub (cần dòng RW… hoặc file base64 hợp lệ).",
  );
}

/** Giá trị `pubkey` trong tauri.conf.json: base64(UTF-8) của file .pub — đúng với Tauri CLI/build. */
export function pubkeyFieldFromPubFileContents(raw) {
  return Buffer.from(normalizeMinisignPubFileContents(raw), "utf8").toString(
    "base64",
  );
}

function main() {
  const pubArg = process.argv[2];
  const pubPath = pubArg
    ? join(root, pubArg)
    : join(root, ".tauri", "updater.key.pub");
  const confPath = join(root, "src-tauri", "tauri.conf.json");

  const rawPub = readFileSync(pubPath, "utf8");
  const pubkey = pubkeyFieldFromPubFileContents(rawPub);
  const data = JSON.parse(readFileSync(confPath, "utf8"));

  if (!data.plugins?.updater) {
    throw new Error("Thiếu plugins.updater trong tauri.conf.json");
  }

  data.plugins.updater.pubkey = pubkey;
  writeFileSync(confPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  console.log("Đã cập nhật pubkey từ:", pubPath);
  console.log("Ghi vào:", confPath);
}

main();
