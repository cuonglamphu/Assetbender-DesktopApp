import { VITE_FRONTEND_URL } from "../config/env";

/** Best-effort check against Flutter-style manifest URL (may differ from Tauri updater format). */
export async function fetchRemoteAppVersion(): Promise<string | null> {
  try {
    const url = `${VITE_FRONTEND_URL.replace(/\/$/, "")}/updater/app-archive.json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { version?: string; latest?: string };
    return j.version ?? j.latest ?? null;
  } catch {
    return null;
  }
}
