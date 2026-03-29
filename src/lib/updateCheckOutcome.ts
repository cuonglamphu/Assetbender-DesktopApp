import type { Update } from "@tauri-apps/plugin-updater";
import { isVersionBelowMinimum } from "@/lib/versionPolicy";
import type { UpdatePolicy } from "@/services/updatePolicy";

export type UpdateCheckOutcome =
  | { kind: "none" }
  | { kind: "soft"; update: Update }
  | { kind: "force"; update: Update; policy: UpdatePolicy | null }
  | { kind: "force_blocked"; policy: UpdatePolicy | null };

/**
 * Pure decision logic for startup update check (matches {@link AppUpdateDialog}).
 * When `updateToClose` is set, the caller must `await updateToClose.close()` (soft prompt disabled).
 */
export function resolveUpdateCheckOutcome(args: {
  currentVersion: string | null;
  policy: UpdatePolicy | null;
  update: Update | null;
}): { outcome: UpdateCheckOutcome; updateToClose: Update | null } {
  const { currentVersion, policy, update: u } = args;
  const belowMin =
    currentVersion != null &&
    isVersionBelowMinimum(currentVersion, policy?.minimumVersion ?? undefined);

  if (belowMin) {
    if (u) return { outcome: { kind: "force", update: u, policy }, updateToClose: null };
    return { outcome: { kind: "force_blocked", policy }, updateToClose: null };
  }

  if (u) {
    const allowSoft = policy?.softUpdatePrompt !== false;
    if (!allowSoft) {
      return { outcome: { kind: "none" }, updateToClose: u };
    }
    return { outcome: { kind: "soft", update: u }, updateToClose: null };
  }

  return { outcome: { kind: "none" }, updateToClose: null };
}
