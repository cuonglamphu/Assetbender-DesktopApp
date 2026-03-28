import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listen } from "@tauri-apps/api/event";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { HomeFooter } from "../components/HomeFooter";
import {
  InstallProgressButton,
  installSecondaryButtonClass,
  SectionHeader,
} from "../components/InstallProgressButton";
import { ScrollSectionWithFade } from "../components/ScrollSectionWithFade";
import { publicBannerUrl } from "../config/assetUrls";
import { VITE_FRONTEND_URL } from "../config/env";
import { cn } from "@/lib/utils";
import { useAuth } from "../context/AuthContext";
import { useSessionSocket } from "../hooks/useSessionSocket";
import {
  fetchInstallManifest,
  hasNewerCatalogVersion,
  isItemInstalled,
  getInstalledVersion,
  type InstallManifest,
} from "../services/installManifest";
import {
  fetchPluginsAndPacks,
  type PluginsAndPacksResult,
} from "../services/catalog";
import { fetchRemoteAppVersion } from "../services/updateCheck";
import type { Pack, Plugin } from "../types/models";

type InstallProgressPayload = {
  kind: "plugin" | "pack";
  id: number;
  downloaded: number;
  total: number | null;
};

function isInstallCancelled(e: unknown): boolean {
  return String(e).toLowerCase().includes("cancelled");
}

function GradientPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-ab-accent",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-50"
        style={{
          background:
            "linear-gradient(to top, rgba(255,255,255,0.12) 0%, var(--color-ab-accent) 100%)",
        }}
        aria-hidden
      />
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

export function HomePage() {
  const { user, logout, refreshSession } = useAuth();
  useSessionSocket();

  const [data, setData] = useState<PluginsAndPacksResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updateNote, setUpdateNote] = useState<string | null>(null);
  const [installProgress, setInstallProgress] =
    useState<InstallProgressPayload | null>(null);
  const [manifest, setManifest] = useState<InstallManifest>({});

  const [pluginQuery, setPluginQuery] = useState("");
  const [packQuery, setPackQuery] = useState("");
  const [inhouseQuery, setInhouseQuery] = useState("");

  const refreshManifest = useCallback(async () => {
    try {
      const m = await fetchInstallManifest();
      setManifest(m);
    } catch {
      setManifest({});
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshSession();
      const d = await fetchPluginsAndPacks("Premiere Pro");
      setData(d);
      await refreshManifest();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [refreshSession, refreshManifest]);

  useEffect(() => {
    if (!user?.id) return;
    void load();
  }, [user?.id, load]);

  useEffect(() => {
    void (async () => {
      const remote = await fetchRemoteAppVersion();
      if (remote) setUpdateNote(`Server manifest version: ${remote}`);
    })();
  }, []);

  /** Gộp event tải theo frame — tránh setState mỗi chunk 8KB làm thanh % giật. */
  const installProgressRafRef = useRef<number>(0);
  const pendingProgressRef = useRef<InstallProgressPayload | null>(null);

  useEffect(() => {
    const flush = () => {
      installProgressRafRef.current = 0;
      const next = pendingProgressRef.current;
      if (next) setInstallProgress(next);
    };

    const u = listen("install-progress", (e) => {
      const p = e.payload as {
        kind?: string;
        id?: number;
        downloaded?: number;
        total?: number | null;
      };
      if (p.kind !== "plugin" && p.kind !== "pack") return;
      if (p.id == null) return;
      pendingProgressRef.current = {
        kind: p.kind,
        id: p.id,
        downloaded: p.downloaded ?? 0,
        total: p.total ?? null,
      };
      if (installProgressRafRef.current === 0) {
        installProgressRafRef.current = requestAnimationFrame(flush);
      }
    });
    return () => {
      void u.then((f) => f());
      if (installProgressRafRef.current !== 0) {
        cancelAnimationFrame(installProgressRafRef.current);
        installProgressRafRef.current = 0;
      }
    };
  }, []);

  function clearInstallProgress() {
    setInstallProgress(null);
  }

  function onInstallActivityEnd() {
    clearInstallProgress();
    void refreshManifest();
  }

  const cancelInstallDownload = useCallback(() => {
    void invoke("cancel_install_download");
  }, []);

  const filteredPlugins = useMemo(() => {
    const list = data?.plugins ?? [];
    const q = pluginQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.title.toLowerCase().includes(q));
  }, [data?.plugins, pluginQuery]);

  const filteredPacks = useMemo(() => {
    const list = data?.packs ?? [];
    const q = packQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.title.toLowerCase().includes(q));
  }, [data?.packs, packQuery]);

  const filteredInhouse = useMemo(() => {
    const list = data?.inhousePacks ?? [];
    const q = inhouseQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.title.toLowerCase().includes(q));
  }, [data?.inhousePacks, inhouseQuery]);

  async function checkNativeUpdater() {
    try {
      const v = await invoke<string | null>("check_app_update");
      if (v) setUpdateNote(`Update available: ${v}`);
      else setUpdateNote("No native updater build (configure Tauri updater).");
    } catch {
      setUpdateNote("Updater not configured.");
    }
  }

  const base = VITE_FRONTEND_URL.replace(/\/$/, "");
  const userFirstName =
    user == null
      ? undefined
      : (user.name?.trim().split(/\s+/)[0] ??
        user.email?.split("@")[0] ??
        "User");

  return (
    <div className="box-border flex h-full min-h-0 flex-col bg-ab-bg p-1.5 font-sans">
      {updateNote ? (
        <p className="mb-1.5 flex flex-wrap items-center gap-2.5 rounded-lg border border-ab-primary/20 bg-ab-primary/10 px-3 py-2 text-sm text-ab-primary">
          {updateNote}
          <button
            type="button"
            className="ml-auto rounded-lg border border-ab-primary/35 bg-transparent px-2.5 py-1 text-xs text-ab-primary hover:bg-ab-primary/10"
            onClick={() => void checkNativeUpdater()}
          >
            Check updates
          </button>
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">
        <section className="flex min-h-0 min-h-[120px] flex-[1.1] flex-col">
          <GradientPanel>
            <SectionHeader title="Plugins" onSearch={setPluginQuery} />
            {loading ? (
              <div className="px-7 py-6 text-ab-tertiary">Loading catalog…</div>
            ) : error ? (
              <p className="px-7 py-6 text-ab-error">{error}</p>
            ) : (
              <ScrollSectionWithFade showArrows={false}>
                <div className="px-7 pb-10 pt-2 pl-[30px] pr-7">
                  {filteredPlugins.map((p) => (
                    <PluginRow
                      key={p.id}
                      plugin={p}
                      manifest={manifest}
                      progressForCard={
                        installProgress?.kind === "plugin" &&
                          installProgress.id === p.id
                          ? installProgress
                          : null
                      }
                      onCancelInstall={cancelInstallDownload}
                      onInstallFinished={onInstallActivityEnd}
                    />
                  ))}
                </div>
              </ScrollSectionWithFade>
            )}
          </GradientPanel>
        </section>

        <section className="flex min-h-0 min-h-[160px] flex-[2] flex-col">
          <GradientPanel>
            <SectionHeader title="Packs" onSearch={setPackQuery} />
            {!loading && !error ? (
              <ScrollSectionWithFade showArrows>
                <div className="grid min-w-0 grid-cols-3 gap-4 px-4 pb-12 pt-1 sm:px-6 lg:px-8 xl:grid-cols-5">
                  {filteredPacks.map((p) => (
                    <PackTile
                      key={p.id}
                      pack={p}
                      manifest={manifest}
                      progressForCard={
                        installProgress?.kind === "pack" &&
                          installProgress.id === p.id
                          ? installProgress
                          : null
                      }
                      onCancelInstall={cancelInstallDownload}
                      onInstallFinished={onInstallActivityEnd}
                    />
                  ))}
                </div>
              </ScrollSectionWithFade>
            ) : null}
          </GradientPanel>
        </section>

        {(data?.inhousePacks?.length ?? 0) > 0 && !loading && !error ? (
          <section className="flex min-h-0 min-h-[160px] flex-[1.5] flex-col">
            <GradientPanel>
              <SectionHeader
                title="In-house packs"
                onSearch={setInhouseQuery}
              />
              <ScrollSectionWithFade showArrows>
                <div className="grid min-w-0 grid-cols-1 gap-4 px-4 pb-12 pt-1 sm:px-6 lg:grid-cols-3 lg:px-8 xl:grid-cols-5">
                  {filteredInhouse.map((p) => (
                    <PackTile
                      key={`in-${p.id}`}
                      pack={p}
                      manifest={manifest}
                      progressForCard={
                        installProgress?.kind === "pack" &&
                          installProgress.id === p.id
                          ? installProgress
                          : null
                      }
                      onCancelInstall={cancelInstallDownload}
                      onInstallFinished={onInstallActivityEnd}
                    />
                  ))}
                </div>
              </ScrollSectionWithFade>
            </GradientPanel>
          </section>
        ) : null}
      </div>

      <HomeFooter
        userFirstName={userFirstName}
        onRefresh={() => void load()}
        onGetMore={() => void openUrl(`${base}/product`)}
        onMyAccount={() => void openUrl(`${base}/account`)}
        onTutorials={() => void openUrl(`${base}/tutorials`)}
        onLogout={() => void logout()}
      />
    </div>
  );
}

function PluginRow({
  plugin,
  manifest,
  progressForCard,
  onCancelInstall,
  onInstallFinished,
}: {
  plugin: Plugin;
  manifest: InstallManifest;
  progressForCard: InstallProgressPayload | null;
  onCancelInstall: () => void;
  onInstallFinished: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [uninstallBusy, setUninstallBusy] = useState(false);
  const [installErr, setInstallErr] = useState<string | null>(null);

  const installed = isItemInstalled(manifest, "plugin", plugin.id);
  const instVer = getInstalledVersion(manifest, "plugin", plugin.id);
  const catalogVer = plugin.version ?? "1.0.0";
  const hasUpdate =
    installed && hasNewerCatalogVersion(catalogVer, instVer);

  const ratio =
    progressForCard &&
      progressForCard.total != null &&
      progressForCard.total > 0
      ? Math.min(1, progressForCard.downloaded / progressForCard.total)
      : null;

  async function runInstall() {
    setBusy(true);
    setInstallErr(null);
    try {
      await invoke("install_plugin_from_url", {
        link: plugin.linkDownload,
        id: plugin.id,
        version: catalogVer,
      });
    } catch (e) {
      if (isInstallCancelled(e)) return;
      setInstallErr(String(e));
    } finally {
      setBusy(false);
      onInstallFinished();
    }
  }

  async function runUninstall() {
    setUninstallBusy(true);
    setInstallErr(null);
    try {
      await invoke("uninstall_plugin", { id: plugin.id });
      onInstallFinished();
    } catch (e) {
      setInstallErr(String(e));
    } finally {
      setUninstallBusy(false);
    }
  }

  function onPrimaryClick() {
    if (!installed) {
      void runInstall();
      return;
    }
    if (hasUpdate) {
      void runInstall();
    }
  }

  return (
    <article className="mb-4 flex min-h-20 items-center gap-4 rounded-xl border border-white/[0.04] bg-ab-accent px-6 py-3 last:mb-0">
      <div
        className="flex size-[50px] shrink-0 items-center justify-center rounded-[10px] bg-ab-primary"
        aria-hidden
      >
        <span className="text-base font-bold text-ab-accent">Pr</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-base font-semibold text-white">
            {plugin.title}
          </span>
          {plugin.version ? (
            <span className="text-base font-semibold text-white">
              V {plugin.version}
            </span>
          ) : null}
        </div>
        {installErr ? (
          <p className="mt-1.5 text-xs text-ab-error">{installErr}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end">
        {!installed ? (
          <InstallProgressButton
            label="Install"
            busy={busy}
            progress={busy ? ratio : null}
            onClick={onPrimaryClick}
            onCancel={
              busy && progressForCard != null ? onCancelInstall : undefined
            }
            className="w-[290px] max-w-[290px] shrink-0"
          />
        ) : hasUpdate ? (
          <div className="grid w-[290px] shrink-0 grid-cols-2 gap-2">
            <div className="relative min-w-0">
              <InstallProgressButton
                label="Update"
                busy={busy}
                disabled={uninstallBusy}
                progress={busy ? ratio : null}
                onClick={onPrimaryClick}
                className="w-full min-w-0 max-w-full"
                onCancel={
                  busy && progressForCard != null ? onCancelInstall : undefined
                }
              />
              {!busy ? (
                <span
                  className="absolute right-2 top-2 size-2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.65)]"
                  aria-hidden
                />
              ) : null}
            </div>
            <button
              type="button"
              disabled={busy || uninstallBusy}
              onClick={() => void runUninstall()}
              className={installSecondaryButtonClass}
            >
              {uninstallBusy ? "…" : "Uninstall"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={uninstallBusy}
            onClick={() => void runUninstall()}
            className={cn(
              installSecondaryButtonClass,
              "w-[290px] shrink-0",
            )}
          >
            {uninstallBusy ? "…" : "Uninstall"}
          </button>
        )}
      </div>
    </article>
  );
}

function PackTile({
  pack,
  manifest,
  progressForCard,
  onCancelInstall,
  onInstallFinished,
}: {
  pack: Pack;
  manifest: InstallManifest;
  progressForCard: InstallProgressPayload | null;
  onCancelInstall: () => void;
  onInstallFinished: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [uninstallBusy, setUninstallBusy] = useState(false);
  const [installErr, setInstallErr] = useState<string | null>(null);
  const img = publicBannerUrl(pack.bannerImage);

  const installed = isItemInstalled(manifest, "pack", pack.id);
  const instVer = getInstalledVersion(manifest, "pack", pack.id);
  const catalogVer = pack.version;
  const hasUpdate =
    installed && hasNewerCatalogVersion(catalogVer, instVer);

  const ratio =
    progressForCard &&
      progressForCard.total != null &&
      progressForCard.total > 0
      ? Math.min(1, progressForCard.downloaded / progressForCard.total)
      : null;

  async function runInstall() {
    setBusy(true);
    setInstallErr(null);
    try {
      await invoke("install_pack_from_url", {
        link: pack.linkDownload,
        id: pack.id,
        version: pack.version,
      });
    } catch (e) {
      if (isInstallCancelled(e)) return;
      setInstallErr(String(e));
    } finally {
      setBusy(false);
      onInstallFinished();
    }
  }

  async function runUninstall() {
    setUninstallBusy(true);
    setInstallErr(null);
    try {
      await invoke("uninstall_pack", { id: pack.id });
      onInstallFinished();
    } catch (e) {
      setInstallErr(String(e));
    } finally {
      setUninstallBusy(false);
    }
  }

  function onPrimaryClick() {
    if (!installed) {
      void runInstall();
      return;
    }
    if (hasUpdate) {
      void runInstall();
    }
  }

  return (
    <article className="@container flex min-w-0 flex-col overflow-hidden rounded-[15px] border-2 border-ab-tertiary bg-ab-accent">
      <div className="box-border w-full shrink-0 px-2 pt-2">
        {img ? (
          <div className="relative w-full overflow-hidden rounded-[15px] border-2 border-black [aspect-ratio:286/233]">
            <img
              src={img}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
          </div>
        ) : (
          <div className="w-full rounded-[15px] border-2 border-black bg-ab-bg-light [aspect-ratio:286/233]" />
        )}
      </div>
      {installErr ? (
        <p className="mx-2 mt-1.5 text-[11px] text-ab-error">{installErr}</p>
      ) : null}
      <div className="mt-auto px-2 pb-2.5 pt-1.5">
        {!installed ? (
          <InstallProgressButton
            label="Install"
            busy={busy}
            progress={busy ? ratio : null}
            onClick={onPrimaryClick}
            onCancel={
              busy && progressForCard != null ? onCancelInstall : undefined
            }
          />
        ) : hasUpdate ? (
          <div className="mx-auto grid w-full min-w-0 max-w-[290px] grid-cols-1 gap-2 @[320px]:grid-cols-2">
            <div className="relative min-w-0">
              <InstallProgressButton
                label="Update"
                narrow
                busy={busy}
                disabled={uninstallBusy}
                progress={busy ? ratio : null}
                onClick={onPrimaryClick}
                className="w-full max-w-none"
                onCancel={
                  busy && progressForCard != null ? onCancelInstall : undefined
                }
              />
              {!busy ? (
                <span
                  className="absolute right-2 top-2 size-2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.65)]"
                  aria-hidden
                />
              ) : null}
            </div>
            <button
              type="button"
              disabled={busy || uninstallBusy}
              onClick={() => void runUninstall()}
              className={cn(
                installSecondaryButtonClass,
                "w-full px-2 text-[10px] @[360px]:text-[11px]",
              )}
            >
              {uninstallBusy ? "…" : "Uninstall"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={uninstallBusy}
            onClick={() => void runUninstall()}
            className={cn(
              installSecondaryButtonClass,
              "mx-auto w-full max-w-[290px]",
            )}
          >
            {uninstallBusy ? "…" : "Uninstall"}
          </button>
        )}
      </div>
    </article>
  );
}
