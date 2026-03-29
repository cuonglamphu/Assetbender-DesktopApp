import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * CI guard: one source of truth for shipped app version (Tauri + npm + Cargo).
 */
describe("Tauri app version sync", () => {
  it("package.json, tauri.conf.json, and Cargo.toml versions match", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      version: string;
    };
    const tauri = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8")) as {
      version: string;
    };
    const cargo = readFileSync(join(root, "src-tauri/Cargo.toml"), "utf8");
    const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(pkg.version).toBe(tauri.version);
    expect(cargoVersion).toBeDefined();
    expect(pkg.version).toBe(cargoVersion);
  });
});
