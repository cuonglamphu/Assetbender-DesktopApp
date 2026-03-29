#!/usr/bin/env node
/**
 * Kiểm tra static JSON của Tauri updater (GitHub `latest.json`).
 * @see https://v2.tauri.app/plugin/updater/
 *
 * Usage:
 *   pnpm test:updater
 *   pnpm test:updater -- --probe
 *   UPDATER_MANIFEST_URL=https://github.com/owner/repo/releases/latest/download/latest.json node scripts/verify-updater-manifest.mjs --probe
 *
 * Exit 1 nếu JSON không hợp lệ hoặc (với --probe) URL asset trả lỗi.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const SEMVER_LOOSE = /^(v?\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?(\+[0-9A-Za-z-.]+)?)$/;

function readEndpointFromTauriConf() {
  try {
    const conf = JSON.parse(
      readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"),
    );
    return conf?.plugins?.updater?.endpoints?.[0] ?? "";
  } catch {
    return "";
  }
}

function readLocalAppVersion() {
  try {
    const conf = JSON.parse(
      readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"),
    );
    return String(conf?.version ?? "").trim();
  } catch {
    return "";
  }
}

function parseArgs(argv) {
  let url = process.env.UPDATER_MANIFEST_URL || "";
  let probe = false;
  let tag = process.env.UPDATER_MANIFEST_TAG || "";
  const only = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url" && argv[i + 1]) {
      url = argv[++i];
      continue;
    }
    if (a === "--tag" && argv[i + 1]) {
      tag = argv[++i];
      continue;
    }
    if (a === "--probe") {
      probe = true;
      continue;
    }
    if (a === "--platform" && argv[i + 1]) {
      only.push(argv[++i]);
      continue;
    }
  }
  if (!url) url = readEndpointFromTauriConf();
  url = applyGitHubTagToUrl(url, tag);
  return { url, probe, only };
}

/**
 * .../releases/latest/download/foo → .../releases/download/<tag>/foo
 */
function applyGitHubTagToUrl(url, tag) {
  if (!tag || !url) return url;
  const m = url.match(
    /^(https:\/\/github\.com\/[^/]+\/[^/]+)\/releases\/latest\/download\/(.+)$/,
  );
  if (!m) return url;
  return `${m[1]}/releases/download/${tag}/${m[2]}`;
}

const GH_API_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "assetbender-mac/verify-updater-manifest",
};

function githubAuthHeaders() {
  const t = process.env.GITHUB_TOKEN?.trim();
  if (!t) return {};
  return { Authorization: `Bearer ${t}` };
}

/**
 * Khi /releases/latest/download/ trả 404: lấy tag từ GitHub API rồi dùng /releases/download/<tag>/...
 */
async function resolveGitHubLatestDownloadUrl(failedUrl) {
  const m = failedUrl.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/latest\/download\/(.+)$/,
  );
  if (!m) return null;
  const [, owner, repo, filename] = m;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const res = await fetch(apiUrl, {
    headers: { ...GH_API_HEADERS, ...githubAuthHeaders() },
  });
  if (!res.ok) return null;
  const release = await res.json();
  const tag = release.tag_name;
  if (!tag) return null;
  return `https://github.com/${owner}/${repo}/releases/download/${tag}/${filename}`;
}

/**
 * Lấy nội dung latest.json qua API (đúng asset browser_download_url), hữu ích khi URL /latest/download/ lỗi CDN.
 */
async function fetchLatestJsonBodyViaGitHubApi(manifestUrl) {
  const m = manifestUrl.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\//,
  );
  if (!m) return null;
  const [, owner, repo] = m;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const res = await fetch(apiUrl, {
    headers: { ...GH_API_HEADERS, ...githubAuthHeaders() },
  });
  if (!res.ok) return null;
  const release = await res.json();
  const asset = release.assets?.find((a) => a.name === "latest.json");
  if (!asset?.browser_download_url) return null;
  const r2 = await fetch(asset.browser_download_url, {
    redirect: "follow",
    headers: githubAuthHeaders(),
  });
  if (!r2.ok) return null;
  const raw = await r2.text();
  return { raw, resolvedUrl: asset.browser_download_url };
}

function githubReleasesPage(manifestUrl) {
  const m = manifestUrl.match(/^(https:\/\/github\.com\/[^/]+\/[^/]+)/);
  return m ? `${m[1]}/releases` : manifestUrl;
}

function print404Hints(manifestUrl) {
  console.error("");
  console.error("404 — không tải được manifest. Các nguyên nhân thường gặp:");
  console.error(
    "  • Release đang Draft → phải bấm Publish (chỉ release public mới có /latest/).",
  );
  console.error(
    '  • Chưa có asset "latest.json" trên release (bật createUpdaterArtifacts + tauri-action includeUpdaterJson).',
  );
  console.error(
    "  • Repo private → export GITHUB_TOKEN=ghp_... rồi chạy lại (quyền đọc repo).",
  );
  console.error("  • Thử: pnpm test:updater -- --tag v0.0.1");
  console.error("");
  console.error("Trang Releases:", githubReleasesPage(manifestUrl));
}

function validateManifest(data) {
  /** @type {string[]} */
  const errors = [];

  const v = data?.version;
  if (v == null || String(v).trim() === "") {
    errors.push("missing version");
  } else if (!SEMVER_LOOSE.test(String(v).trim())) {
    errors.push(`version not semver-like: ${v}`);
  }

  const platforms = data?.platforms;
  if (!platforms || typeof platforms !== "object" || Array.isArray(platforms)) {
    errors.push("missing or invalid platforms");
    return errors;
  }

  const keys = Object.keys(platforms);
  if (keys.length === 0) {
    errors.push("platforms is empty");
  }

  for (const key of keys) {
    const spec = platforms[key];
    if (!spec || typeof spec !== "object") {
      errors.push(`platforms.${key}: invalid`);
      continue;
    }
    if (!spec.url || typeof spec.url !== "string") {
      errors.push(`platforms.${key}: missing url`);
    } else {
      try {
        const u = new URL(spec.url);
        if (u.protocol !== "https:") {
          errors.push(`platforms.${key}: url must use https in production`);
        }
      } catch {
        errors.push(`platforms.${key}: invalid url`);
      }
    }
    if (!spec.signature || typeof spec.signature !== "string") {
      errors.push(`platforms.${key}: missing signature (content of .sig file)`);
    } else if (spec.signature.trim().length < 10) {
      errors.push(`platforms.${key}: signature looks too short`);
    }
  }

  if (data.pub_date != null && typeof data.pub_date !== "string") {
    errors.push("pub_date should be a string (RFC 3339) if present");
  }

  return errors;
}

/**
 * @param {string} url
 */
async function headOk(url) {
  const res = await fetch(url, {
    method: "HEAD",
    redirect: "follow",
  });
  if (res.ok) return { ok: true, status: res.status, len: res.headers.get("content-length") };
  // Một số host không hỗ trợ HEAD — thử GET nhỏ
  const get = await fetch(url, { method: "GET", redirect: "follow" });
  return {
    ok: get.ok,
    status: get.status,
    len: get.headers.get("content-length"),
    fallback: "GET",
  };
}

async function main() {
  const { url, probe, only } = parseArgs(process.argv.slice(2));
  if (!url) {
    console.error(
      "Thiếu URL: đặt UPDATER_MANIFEST_URL hoặc --url, hoặc cấu hình plugins.updater.endpoints[0] trong src-tauri/tauri.conf.json",
    );
    process.exit(1);
  }

  console.log("Manifest:", url);
  let res = await fetch(url, {
    redirect: "follow",
    headers: url.includes("github.com") ? githubAuthHeaders() : {},
  });
  let raw;

  if (!res.ok && res.status === 404 && url.includes("/releases/latest/download/")) {
    const alt = await resolveGitHubLatestDownloadUrl(url);
    if (alt && alt !== url) {
      console.log("Thử URL theo tag từ API:", alt);
      url = alt;
      res = await fetch(url, {
        redirect: "follow",
        headers: githubAuthHeaders(),
      });
    }
  }

  if (!res.ok && res.status === 404) {
    const viaApi = await fetchLatestJsonBodyViaGitHubApi(url);
    if (viaApi) {
      console.log("Đã lấy manifest qua GitHub API:", viaApi.resolvedUrl);
      raw = viaApi.raw;
    }
  }

  if (raw === undefined) {
    if (!res.ok) {
      console.error(`HTTP ${res.status} ${res.statusText}`);
      if (res.status === 404) print404Hints(readEndpointFromTauriConf() || url);
      process.exit(1);
    }
    raw = await res.text();
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error("Không parse được JSON:", e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const errors = validateManifest(data);
  if (errors.length) {
    console.error("Lỗi cấu trúc latest.json:");
    for (const line of errors) console.error(" ", line);
    process.exit(1);
  }

  const local = readLocalAppVersion();
  if (local) {
    console.log("Version trên manifest (remote):", data.version);
    console.log("Version app trong repo (tauri.conf):", local);
  } else {
    console.log("Version trên manifest:", data.version);
  }

  console.log("Platforms:", Object.keys(data.platforms).join(", "));
  console.log("Cấu trúc latest.json: OK");

  if (probe) {
    let keys = Object.keys(data.platforms);
    if (only.length) {
      keys = keys.filter((k) => only.includes(k));
      if (keys.length === 0) {
        console.error("--platform không khớp key nào trong manifest:", only.join(", "));
        process.exit(1);
      }
    }
    for (const key of keys) {
      const assetUrl = data.platforms[key].url;
      const out = await headOk(assetUrl);
      if (!out.ok) {
        console.error(`PROBE FAIL ${key}: ${assetUrl} HTTP ${out.status}`);
        process.exit(1);
      }
      const via = out.fallback ? ` (${out.fallback})` : "";
      console.log(`  asset OK ${key}: HTTP ${out.status}${via} length=${out.len ?? "?"}`);
    }
  }

  console.log("Hoàn tất kiểm tra.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
