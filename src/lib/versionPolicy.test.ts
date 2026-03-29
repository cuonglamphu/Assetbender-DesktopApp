import { describe, expect, it } from "vitest";
import { isVersionBelowMinimum, parseVersionParts } from "./versionPolicy";

describe("parseVersionParts", () => {
  it("parses dotted versions", () => {
    expect(parseVersionParts("0.0.25")).toEqual([0, 0, 25]);
    expect(parseVersionParts("1.2.3-beta")).toEqual([1, 2, 3]);
  });
});

describe("isVersionBelowMinimum", () => {
  it("returns false when minimum missing", () => {
    expect(isVersionBelowMinimum("0.0.1", undefined)).toBe(false);
  });

  it("compares numeric segments", () => {
    expect(isVersionBelowMinimum("0.0.9", "0.0.10")).toBe(true);
    expect(isVersionBelowMinimum("0.0.10", "0.0.9")).toBe(false);
    expect(isVersionBelowMinimum("0.0.10", "0.0.10")).toBe(false);
    expect(isVersionBelowMinimum("0.0.24", "0.0.25")).toBe(true);
  });
});
