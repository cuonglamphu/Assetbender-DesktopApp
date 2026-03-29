import { VITE_FRONTEND_URL } from "@/config/env";

export interface UpdatePolicy {
  /**
   * If the installed app version is below this, the user must update (blocking dialog).
   * Same `major.minor.patch` style as `tauri.conf.json` `version`.
   */
  minimumVersion?: string;
  /** Optional body text for the force-update dialog. */
  forceMessage?: string;
  /**
   * When false, the app does not auto-show the optional (soft) update dialog when an
   * update exists and the user is already at or above `minimumVersion`.
   * Force update is unaffected.
   * @default true
   */
  softUpdatePrompt?: boolean;
}

/** URL dùng để fetch policy (log / debug). */
export function getUpdatePolicyUrl(): string {
  const override = import.meta.env.VITE_UPDATE_POLICY_URL as string | undefined;
  if (override?.trim()) return override.trim();
  return `${VITE_FRONTEND_URL.replace(/\/$/, "")}/updater/update-policy.json`;
}

function policyUrl(): string {
  return getUpdatePolicyUrl();
}

/** Fetch remote update policy; failures are silent (null). */
export async function fetchUpdatePolicy(): Promise<UpdatePolicy | null> {
  try {
    const res = await fetch(policyUrl(), {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as UpdatePolicy;
    if (!j || typeof j !== "object") return null;
    return j;
  } catch {
    return null;
  }
}
