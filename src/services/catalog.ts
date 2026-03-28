import { invoke } from "@tauri-apps/api/core";
import type { Pack, Plugin } from "../types/models";
import type { TokenPayload } from "../types/models";
import { isAccessTokenExpired } from "../auth/jwt";

export type PluginsAndPacksResult = {
  plugins: Plugin[];
  packs: Pack[];
  inhousePacks: Pack[];
};

const empty: PluginsAndPacksResult = {
  plugins: [],
  packs: [],
  inhousePacks: [],
};

/** Loads tokens from Rust; refreshes if access JWT is expired (mirrors Flutter DataService). */
export async function fetchPluginsAndPacks(
  type: string,
): Promise<PluginsAndPacksResult> {
  const tok = await invoke<TokenPayload | null>("session_get");
  if (!tok?.accessToken) return empty;
  if (isAccessTokenExpired(tok.accessToken)) {
    try {
      await invoke<TokenPayload>("session_refresh");
    } catch {
      return empty;
    }
  }
  try {
    const raw = await invoke<{
      plugins: unknown[];
      packs: unknown[];
      inhousePacks: unknown[];
    }>("fetch_plugins_and_packs", { productType: type });
    return {
      plugins: (raw.plugins ?? []).map(mapPlugin),
      packs: (raw.packs ?? []).map(mapPack),
      inhousePacks: (raw.inhousePacks ?? []).map(mapPack),
    };
  } catch {
    return empty;
  }
}

function mapPlugin(p: unknown): Plugin {
  const o = p as Record<string, unknown>;
  return {
    id: Number(o.id ?? 0),
    title: String(o.title ?? ""),
    bannerImage: String(o.bannerImage ?? ""),
    imageDesc: String(o.imageDesc ?? ""),
    size: String(o.size ?? ""),
    linkDownload: String(o.linkDownload ?? ""),
    type: String(o.type ?? ""),
    version: o.version != null ? String(o.version) : undefined,
  };
}

function mapPack(p: unknown): Pack {
  const o = p as Record<string, unknown>;
  return {
    id: Number(o.id ?? 0),
    title: String(o.title ?? ""),
    bannerImage: String(o.bannerImage ?? ""),
    imageDesc: String(o.imageDesc ?? ""),
    size: String(o.size ?? ""),
    version: String(o.version ?? ""),
    linkDownload: String(o.linkDownload ?? ""),
    type: String(o.type ?? ""),
  };
}
