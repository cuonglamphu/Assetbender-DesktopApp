/** Minimal invoke for login + shell without real Tauri. */
export async function invoke<T>(cmd: string, _args?: unknown): Promise<T> {
  if (cmd === "session_get" || cmd === "session_refresh") return null as T;
  if (cmd === "session_logout") return undefined as T;
  if (cmd === "get_installed_manifest") return {} as T;
  return null as T;
}
