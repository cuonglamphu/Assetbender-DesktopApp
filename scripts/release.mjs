#!/usr/bin/env node
/**
 * Đồng bộ version → đồng bộ pubkey từ .pub → commit → push nhánh hiện tại → tag v* → push tag (kích hoạt workflow Release).
 *
 * Usage:
 *   pnpm run release -- 0.0.3
 *   pnpm run release -- 0.0.3 --dry-run
 *   pnpm run release -- 0.0.3 --all
 *
 * Cần: git, remote `origin`, quyền push branch + tag.
 */

import { execFileSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const SEMVER_APP = /^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?$/;

function parseArgs(argv) {
  let version = "";
  let dryRun = false;
  let skipPush = false;
  let addAll = false;
  for (const a of argv) {
    if (a === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (a === "--skip-push") {
      skipPush = true;
      continue;
    }
    if (a === "--all") {
      addAll = true;
      continue;
    }
    if (!a.startsWith("-") && !version) {
      version = a.trim();
    }
  }
  return { version, dryRun, skipPush, addAll };
}

function getBranch() {
  return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

function tryGetBranch() {
  try {
    return getBranch();
  } catch {
    return "(branch)";
  }
}

/** true nếu có thay đổi đã stage */
function hasStagedChanges(dryRun) {
  if (dryRun) return true;
  try {
    execFileSync("git", ["diff", "--cached", "--quiet"], { cwd: root });
    return false;
  } catch {
    return true;
  }
}

function gitThrow(args, dryRun) {
  if (dryRun) {
    console.log("[dry-run] git", args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" "));
    return;
  }
  execFileSync("git", args, { cwd: root, stdio: "inherit" });
}

function tagExists(tag, dryRun) {
  if (dryRun) return false;
  try {
    execFileSync("git", ["rev-parse", `refs/tags/${tag}`], {
      cwd: root,
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const { version, dryRun, skipPush, addAll } = parseArgs(process.argv.slice(2));
  if (!version) {
    console.error("Usage: pnpm run release -- <version> [--dry-run] [--skip-push] [--all]");
    console.error("Example: pnpm run release -- 0.0.3");
    process.exit(1);
  }
  if (!SEMVER_APP.test(version)) {
    console.error(`Version không hợp lệ: ${version}`);
    process.exit(1);
  }

  const tag = `v${version}`;

  if (tagExists(tag, dryRun)) {
    console.error(`Tag ${tag} đã tồn tại. Dùng version khác hoặc xóa tag: git tag -d ${tag}`);
    process.exit(1);
  }

  console.log(`→ sync version → ${version}`);
  if (!dryRun) {
    execFileSync(process.execPath, [join(root, "scripts", "sync-version.mjs"), version], {
      cwd: root,
      stdio: "inherit",
    });
  } else {
    console.log(`[dry-run] node scripts/sync-version.mjs ${version}`);
  }

  console.log("→ sync updater pubkey");
  if (!dryRun) {
    execFileSync(process.execPath, [join(root, "scripts", "sync-updater-pubkey.mjs")], {
      cwd: root,
      stdio: "inherit",
    });
  } else {
    console.log("[dry-run] node scripts/sync-updater-pubkey.mjs");
  }

  const files = [
    "package.json",
    "src-tauri/tauri.conf.json",
    "src-tauri/Cargo.toml",
  ];

  if (addAll) {
    gitThrow(["add", "-A"], dryRun);
  } else {
    gitThrow(["add", ...files], dryRun);
  }

  if (!hasStagedChanges(dryRun)) {
    console.error(
      "Không có thay đổi để commit (version trong repo đã trùng?). Hủy.",
    );
    process.exit(1);
  }

  const msg = `chore(release): ${tag}`;
  gitThrow(["commit", "-m", msg], dryRun);

  if (skipPush) {
    gitThrow(["tag", tag], dryRun);
    console.log("");
    console.log("Đã commit + tag local (--skip-push). Khi sẵn sàng:");
    console.log(`  git push origin HEAD`);
    console.log(`  git push origin ${tag}`);
    return;
  }

  const branch = tryGetBranch();
  console.log(`→ push nhánh ${branch}`);
  gitThrow(["push", "origin", branch], dryRun);

  gitThrow(["tag", tag], dryRun);
  console.log(`→ push tag ${tag} (trigger GitHub Actions Release)`);
  gitThrow(["push", "origin", tag], dryRun);

  console.log("");
  console.log("Xong. Xem tab Actions trên repo GitHub.");
}

main();
