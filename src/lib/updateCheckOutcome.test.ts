import { describe, expect, it, vi } from "vitest";
import type { Update } from "@tauri-apps/plugin-updater";
import { resolveUpdateCheckOutcome } from "./updateCheckOutcome";

function mockUpdate(version = "9.9.9"): Update {
  return {
    version,
    currentVersion: "0.0.1",
    body: "release notes",
    close: vi.fn(() => Promise.resolve()),
  } as unknown as Update;
}

describe("resolveUpdateCheckOutcome", () => {
  describe("Force update (current < policy.minimumVersion)", () => {
    it("force: blocks with installer when update handle exists", () => {
      const u = mockUpdate("1.0.0");
      const policy = { minimumVersion: "0.0.20", softUpdatePrompt: true };
      const { outcome, updateToClose } = resolveUpdateCheckOutcome({
        currentVersion: "0.0.10",
        policy,
        update: u,
      });
      expect(outcome.kind).toBe("force");
      expect(updateToClose).toBeNull();
      if (outcome.kind === "force") {
        expect(outcome.update).toBe(u);
        expect(outcome.update.version).toBe("1.0.0");
        expect(outcome.policy).toEqual(policy);
      }
    });

    it("force_blocked: no installer when check() returned null (offline / error)", () => {
      const policy = { minimumVersion: "0.0.20", forceMessage: "Please upgrade" };
      const { outcome, updateToClose } = resolveUpdateCheckOutcome({
        currentVersion: "0.0.10",
        policy,
        update: null,
      });
      expect(outcome.kind).toBe("force_blocked");
      expect(updateToClose).toBeNull();
      if (outcome.kind === "force_blocked") {
        expect(outcome.policy).toEqual(policy);
      }
    });

    it("force wins over softUpdatePrompt: false — still force when below minimum", () => {
      const u = mockUpdate();
      const { outcome, updateToClose } = resolveUpdateCheckOutcome({
        currentVersion: "0.0.5",
        policy: { minimumVersion: "0.0.20", softUpdatePrompt: false },
        update: u,
      });
      expect(outcome.kind).toBe("force");
      expect(updateToClose).toBeNull();
    });
  });

  describe("Soft update (at or above minimum, optional newer build)", () => {
    it("soft: new build available, user may dismiss (Later)", () => {
      const u = mockUpdate("0.0.30");
      const { outcome, updateToClose } = resolveUpdateCheckOutcome({
        currentVersion: "0.0.25",
        policy: { minimumVersion: "0.0.20", softUpdatePrompt: true },
        update: u,
      });
      expect(outcome.kind).toBe("soft");
      expect(updateToClose).toBeNull();
      if (outcome.kind === "soft") expect(outcome.update).toBe(u);
    });

    it("soft: default when softUpdatePrompt is omitted (treated as true)", () => {
      const u = mockUpdate();
      const { outcome } = resolveUpdateCheckOutcome({
        currentVersion: "0.0.25",
        policy: { minimumVersion: "0.0.1" },
        update: u,
      });
      expect(outcome.kind).toBe("soft");
    });

    it("soft: policy null but updater has a build — still soft (no minimum set)", () => {
      const u = mockUpdate();
      const { outcome } = resolveUpdateCheckOutcome({
        currentVersion: "0.0.25",
        policy: null,
        update: u,
      });
      expect(outcome.kind).toBe("soft");
    });

    it("soft disabled: skip dialog but caller must close update handle", () => {
      const u = mockUpdate();
      const { outcome, updateToClose } = resolveUpdateCheckOutcome({
        currentVersion: "0.0.25",
        policy: { minimumVersion: "0.0.1", softUpdatePrompt: false },
        update: u,
      });
      expect(outcome.kind).toBe("none");
      expect(updateToClose).toBe(u);
    });
  });

  describe("No prompt", () => {
    it("none: no newer build from updater", () => {
      const { outcome } = resolveUpdateCheckOutcome({
        currentVersion: "0.0.25",
        policy: { minimumVersion: "0.0.20" },
        update: null,
      });
      expect(outcome.kind).toBe("none");
    });

    it("none: version null (getVersion failed) — not treated as below minimum", () => {
      const u = mockUpdate();
      const { outcome } = resolveUpdateCheckOutcome({
        currentVersion: null,
        policy: { minimumVersion: "0.0.99" },
        update: u,
      });
      expect(outcome.kind).toBe("soft");
    });
  });
});
