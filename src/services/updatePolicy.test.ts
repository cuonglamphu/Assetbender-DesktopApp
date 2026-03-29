import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchUpdatePolicy } from "./updatePolicy";

describe("fetchUpdatePolicy", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ minimumVersion: "0.0.1", softUpdatePrompt: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it("returns parsed policy on 200", async () => {
    const p = await fetchUpdatePolicy();
    expect(p).toEqual({ minimumVersion: "0.0.1", softUpdatePrompt: true });
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("returns null on non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 404 }))),
    );
    await expect(fetchUpdatePolicy()).resolves.toBeNull();
  });

  it("returns null on network error", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    await expect(fetchUpdatePolicy()).resolves.toBeNull();
  });
});
