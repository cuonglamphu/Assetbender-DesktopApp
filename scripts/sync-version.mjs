#!/usr/bin/env node
/**
 * Đồng bộ version app giữa package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml ([package]).
 *
 * Usage:
 *   pnpm run version:sync -- 0.0.2
 *   node scripts/sync-version.mjs 0.0.2
 */

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const SEMVER_APP = /^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?$/;

function setPackageVersionInCargoToml(content, newVersion) {
  const lines = content.split(/\r?\n/);
  let inPackage = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "[package]") {
      inPackage = true;
      continue;
    }
    if (inPackage && t.startsWith("[") && t !== "[package]") {
      inPackage = false;
      continue;
    }
    if (inPackage) {
      const m = lines[i].match(/^(\s*)version\s*=\s*"[^"]*"/);
      if (m) {
        lines[i] = `${m[1]}version = "${newVersion}"`;
        return lines.join(content.includes("\r\n") ? "\r\n" : "\n");
      }
    }
  }
  throw new Error("Không tìm thấy [package].version trong Cargo.toml");
}

function main() {
  const v = process.argv[2]?.trim();
  if (!v) {
    console.error("Usage: node scripts/sync-version.mjs <version>");
    console.error("Example: node scripts/sync-version.mjs 0.0.2");
    process.exit(1);
  }
  if (!SEMVER_APP.test(v)) {
    console.error(`Version không hợp lệ (dùng semver dạng 0.0.2 hoặc 1.0.0-beta.1): ${v}`);
    process.exit(1);
  }

  const pkgPath = join(root, "package.json");
  const tauriConfPath = join(root, "src-tauri", "tauri.conf.json");
  const cargoPath = join(root, "src-tauri", "Cargo.toml");

  function replaceFirstJsonVersion(content, label) {
    const next = content.replace(
      /^(\s*"version"\s*:\s*)("[^"]*")/m,
      `$1"${v}"`,
    );
    if (next === content) {
      throw new Error(`Không thấy "version" trong ${label}`);
    }
    return next;
  }

  writeFileSync(
    pkgPath,
    replaceFirstJsonVersion(readFileSync(pkgPath, "utf8"), "package.json"),
    "utf8",
  );
  writeFileSync(
    tauriConfPath,
    replaceFirstJsonVersion(readFileSync(tauriConfPath, "utf8"), "tauri.conf.json"),
    "utf8",
  );

  const cargo = readFileSync(cargoPath, "utf8");
  writeFileSync(cargoPath, setPackageVersionInCargoToml(cargo, v), "utf8");

  console.log(`Đã đặt version = ${v} trong:`);
  console.log(`  - package.json`);
  console.log(`  - src-tauri/tauri.conf.json`);
  console.log(`  - src-tauri/Cargo.toml ([package])`);
  console.log("");
  console.log("Tag release (không có dấu v trong file):");
  console.log(`  git tag v${v}`);
  console.log(`  git push origin v${v}`);
}

main();
