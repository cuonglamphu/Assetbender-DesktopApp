#!/usr/bin/env node
/**
 * Đọc và so khớp version giữa package.json, tauri.conf.json, Cargo.toml [package].
 * Exit 0 nếu trùng, 1 nếu lệch.
 *
 * Usage: pnpm run version:check
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const conf = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const cargoRaw = readFileSync(join(root, "src-tauri", "Cargo.toml"), "utf8");

const m = cargoRaw.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m);
if (!m) {
  console.error("Không đọc được [package].version trong Cargo.toml");
  process.exit(1);
}
const cargoVersion = m[1];

const vPkg = pkg.version;
const vConf = conf.version;
const vCargo = cargoVersion;

console.log("[version:check]");
console.log(`  package.json              ${vPkg}`);
console.log(`  src-tauri/tauri.conf.json ${vConf}`);
console.log(`  src-tauri/Cargo.toml      ${vCargo}`);

const uniq = new Set([vPkg, vConf, vCargo]);
if (uniq.size === 1) {
  console.log("OK — cả ba file cùng version.");
  process.exit(0);
}

console.error("Lỗi — version không khớp. Chạy: pnpm run version:sync -- <version>");
process.exit(1);
