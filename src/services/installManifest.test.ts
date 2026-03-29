import { describe, expect, it } from "vitest";
import {
  getInstalledVersion,
  hasNewerCatalogVersion,
  isItemInstalled,
} from "./installManifest";

describe("installManifest", () => {
  const manifest = {
    "plugin-1": ["/a"],
    "plugin-1-version": "1.0.0",
    "pack-2": [],
  };

  it("isItemInstalled true when paths exist", () => {
    expect(isItemInstalled(manifest, "plugin", 1)).toBe(true);
  });

  it("isItemInstalled false when empty array", () => {
    expect(isItemInstalled(manifest, "pack", 2)).toBe(false);
  });

  it("getInstalledVersion reads *-version key", () => {
    expect(getInstalledVersion(manifest, "plugin", 1)).toBe("1.0.0");
    expect(getInstalledVersion(manifest, "pack", 2)).toBeNull();
  });

  it("hasNewerCatalogVersion when not installed", () => {
    expect(hasNewerCatalogVersion("2.0.0", null)).toBe(true);
    expect(hasNewerCatalogVersion("2.0.0", "")).toBe(true);
  });

  it("hasNewerCatalogVersion compares catalog vs installed", () => {
    expect(hasNewerCatalogVersion("2.0.0", "2.0.0")).toBe(false);
    expect(hasNewerCatalogVersion("2.0.0", "1.0.0")).toBe(true);
  });
});
