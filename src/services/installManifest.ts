import { invoke } from "@tauri-apps/api/core";

export type InstallManifest = Record<string, unknown>;

export async function fetchInstallManifest(): Promise<InstallManifest> {
  return invoke<InstallManifest>("get_installed_manifest");
}

export function getInstalledVersion(
  manifest: InstallManifest,
  kind: "plugin" | "pack",
  id: number,
): string | null {
  const k = `${kind}-${id}-version`;
  const v = manifest[k];
  return typeof v === "string" ? v : null;
}

export function isItemInstalled(
  manifest: InstallManifest,
  kind: "plugin" | "pack",
  id: number,
): boolean {
  const k = `${kind}-${id}`;
  const v = manifest[k];
  return Array.isArray(v) && v.length > 0;
}

/** Giống Flutter `checkUpdate`: catalog version khác version đã cài → có bản mới. */
export function hasNewerCatalogVersion(
  catalogVersion: string,
  installedVersion: string | null,
): boolean {
  if (installedVersion == null || installedVersion === "") return true;
  return catalogVersion !== installedVersion;
}
