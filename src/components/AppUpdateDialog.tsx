import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VITE_FRONTEND_URL } from "@/config/env";
import {
  resolveUpdateCheckOutcome,
  type UpdateCheckOutcome,
} from "@/lib/updateCheckOutcome";
import { fetchUpdatePolicy } from "@/services/updatePolicy";
import { useAuth } from "@/context/AuthContext";
import { isVersionBelowMinimum } from "@/lib/versionPolicy";
import {
  UPDATE_CHECK_DONE,
  UPDATE_CHECK_REQUEST,
  type UpdateCheckDoneDetail,
} from "@/lib/updateCheckEvents";

const LOG = "[AssetBender][update]";

/** WebView console + dòng `log_update_check` trong terminal (Rust). */
function logUpdateCheck(
  phase: "check" | "retry",
  payload: {
    outcome: string;
    appVersion: string | null;
    minimumVersion: string | null;
    belowMinimum: boolean;
    forceUpdate: boolean;
    updaterTarget: string | null;
    policyOk: boolean;
    updaterCheckOk: boolean;
    updaterError: string | null;
    softPromptSkipped: boolean;
  },
): void {
  console.info(LOG, phase, payload);
  void invoke("log_update_check", {
    payload: {
      phase,
      outcome: payload.outcome,
      appVersion: payload.appVersion,
      minimumVersion: payload.minimumVersion,
      belowMinimum: payload.belowMinimum,
      forceUpdate: payload.forceUpdate,
      updaterTarget: payload.updaterTarget,
      policyOk: payload.policyOk,
    },
  }).catch(() => {
    /* dev / E2E không có Tauri */
  });
}

type CheckOutcome = UpdateCheckOutcome;

/**
 * Startup: fetch `update-policy.json` + Tauri `check()`.
 * - **Force:** current version &lt; `minimumVersion` → blocking dialog (no dismiss). If `check()` fails, Retry / website.
 * - **Soft:** newer build on the updater endpoint and not forced by policy → dialog with "Later" (unless `softUpdatePrompt: false`).
 *
 * Dialog chỉ hiện khi có **bản mới** (`check()` có) hoặc **bị chặn** (version &lt; `minimumVersion`).
 * Nếu đã là bản mới nhất và không dưới minimum → không có dialog (đúng thiết kế).
 */
export function AppUpdateDialog() {
  const { loading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<CheckOutcome>({ kind: "none" });
  const [installing, setInstalling] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateRef = useRef<Update | null>(null);
  updateRef.current =
    outcome.kind === "soft" || outcome.kind === "force" ? outcome.update : null;

  const runCheck = useCallback(async (phase: "check" | "retry" = "check"): Promise<CheckOutcome> => {
    const [policy, rawVersion] = await Promise.all([
      fetchUpdatePolicy(),
      getVersion().catch(() => null),
    ]);

    const version = rawVersion?.trim() || null;

    let u: Update | null = null;
    let checkError: string | null = null;
    try {
      u = await check();
    } catch (e) {
      checkError = String(e);
      u = null;
    }

    const belowMin =
      version != null &&
      isVersionBelowMinimum(version, policy?.minimumVersion ?? undefined);

    const { outcome, updateToClose } = resolveUpdateCheckOutcome({
      currentVersion: version,
      policy,
      update: u,
    });
    if (updateToClose) {
      await updateToClose.close().catch(() => { });
    }

    logUpdateCheck(phase, {
      outcome: outcome.kind,
      appVersion: version,
      minimumVersion: policy?.minimumVersion ?? null,
      belowMinimum: belowMin,
      forceUpdate: outcome.kind === "force" || outcome.kind === "force_blocked",
      updaterTarget: u?.version ?? null,
      policyOk: policy != null,
      updaterCheckOk: checkError == null,
      updaterError: checkError,
      softPromptSkipped: updateToClose != null,
    });

    return outcome;
  }, []);

  useEffect(() => {
    const onRequest = () => {
      void (async () => {
        const next = await runCheck("check");
        if (next.kind === "none") {
          window.dispatchEvent(
            new CustomEvent<UpdateCheckDoneDetail>(UPDATE_CHECK_DONE, {
              detail: { result: "none" },
            }),
          );
        } else {
          setOutcome(next);
          setOpen(true);
          window.dispatchEvent(
            new CustomEvent<UpdateCheckDoneDetail>(UPDATE_CHECK_DONE, {
              detail: { result: "update" },
            }),
          );
        }
      })();
    };
    window.addEventListener(UPDATE_CHECK_REQUEST, onRequest);
    return () => window.removeEventListener(UPDATE_CHECK_REQUEST, onRequest);
  }, [runCheck]);

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    void (async () => {
      const next = await runCheck();
      if (cancelled) {
        if (next.kind === "soft" || next.kind === "force") {
          await next.update.close().catch(() => { });
        }
        return;
      }
      if (next.kind === "none") return;
      setOutcome(next);
      setOpen(true);
    })();

    return () => {
      cancelled = true;
      void updateRef.current?.close().catch(() => { });
    };
  }, [runCheck, authLoading]);

  const handleDismiss = useCallback(async () => {
    setOpen(false);
    const u = updateRef.current;
    setOutcome({ kind: "none" });
    if (u) await u.close().catch(() => { });
  }, []);

  const handleRetry = useCallback(async () => {
    setError(null);
    const prev = updateRef.current;
    if (prev) await prev.close().catch(() => { });
    setOutcome({ kind: "none" });

    const next = await runCheck("retry");
    if (next.kind === "none") {
      setError("Still no update package. Check your connection or download from the website.");
      setOutcome({ kind: "force_blocked", policy: (await fetchUpdatePolicy()) ?? null });
      setOpen(true);
      return;
    }
    setOutcome(next);
    setOpen(true);
  }, [runCheck]);

  const handleInstall = useCallback(async () => {
    const u = updateRef.current;
    if (!u) return;
    setError(null);
    setInstalling(true);
    setProgressLabel("Preparing…");
    try {
      let downloaded = 0;
      let totalBytes: number | undefined;
      await u.downloadAndInstall((ev: DownloadEvent) => {
        if (ev.event === "Started") {
          totalBytes = ev.data.contentLength;
          if (totalBytes != null) {
            setProgressLabel(`Downloading… 0 / ${formatBytes(totalBytes)}`);
          } else {
            setProgressLabel("Downloading…");
          }
          return;
        }
        if (ev.event === "Progress") {
          downloaded += ev.data.chunkLength;
          if (totalBytes != null && totalBytes > 0) {
            const pct = Math.min(100, Math.round((downloaded / totalBytes) * 100));
            setProgressLabel(
              `Downloading… ${pct}% (${formatBytes(downloaded)} / ${formatBytes(totalBytes)})`,
            );
          } else {
            setProgressLabel(`Downloading… ${formatBytes(downloaded)}`);
          }
          return;
        }
        if (ev.event === "Finished") {
          setProgressLabel("Installing…");
        }
      });
      await relaunch();
    } catch (e) {
      setError(String(e));
      setInstalling(false);
      setProgressLabel(null);
    }
  }, []);

  const forceUpdate = outcome.kind === "force" || outcome.kind === "force_blocked";
  const update =
    outcome.kind === "soft" || outcome.kind === "force" ? outcome.update : null;
  const policy = outcome.kind === "force" || outcome.kind === "force_blocked" ? outcome.policy : null;

  if (!open || outcome.kind === "none") return null;

  const title =
    outcome.kind === "force_blocked" || outcome.kind === "force"
      ? "Update required"
      : "Update available";

  const description =
    outcome.kind === "force_blocked" ? (
      <>
        This version is below the minimum required (
        <span className="text-ab-secondary">{policy?.minimumVersion ?? "—"}</span>
        ). Connect to the internet and retry, or download the app from the website.
      </>
    ) : update ? (
      <>
        {forceUpdate ? (
          <>You must install this update to continue. New version </>
        ) : (
          <>New version </>
        )}
        <span className="text-ab-secondary">{update.version}</span>
        {update.currentVersion ? (
          <> (installed: {update.currentVersion})</>
        ) : null}
        .
      </>
    ) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          if (installing) return;
          if (forceUpdate) return;
          void handleDismiss();
        }
      }}
    >
      <DialogContent
        className="max-w-[440px] gap-4 p-6 sm:max-w-[440px]"
        onPointerDownOutside={(e) => {
          if (installing || forceUpdate) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (installing || forceUpdate) e.preventDefault();
        }}
      >
        <DialogHeader className="gap-2 space-y-0 text-left">
          <DialogTitle className="font-montserrat text-lg font-bold leading-snug text-white">
            {title}
          </DialogTitle>
          <DialogDescription className="text-left text-sm leading-relaxed text-ab-tertiary">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm text-ab-tertiary">
          {outcome.kind === "force_blocked" && policy?.forceMessage ? (
            <p className="whitespace-pre-wrap text-xs text-ab-tertiary/90">{policy.forceMessage}</p>
          ) : null}
          {/* {update?.body ? (
            <p className="whitespace-pre-wrap text-xs text-ab-tertiary/90">{update.body}</p>
          ) : null} */}
          {progressLabel ? (
            <p className="text-xs text-ab-primary">{progressLabel}</p>
          ) : null}
          {error ? <p className="text-xs text-ab-error">{error}</p> : null}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {outcome.kind === "force_blocked" ? (
            <>
              <button
                type="button"
                disabled={installing}
                onClick={() => void handleRetry()}
                className="w-full rounded-[15px] border-none bg-ab-primary py-2.5 font-sans text-[11px] font-bold text-black hover:brightness-105 disabled:opacity-50"
              >
                Retry
              </button>
              <button
                type="button"
                disabled={installing}
                onClick={() =>
                  void openUrl(`${VITE_FRONTEND_URL.replace(/\/$/, "")}/`)
                }
                className="w-full rounded-[15px] border border-white/15 bg-transparent py-2.5 font-sans text-[11px] font-bold text-ab-tertiary hover:bg-white/5 disabled:opacity-50"
              >
                Open website
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={installing || !update}
                onClick={() => void handleInstall()}
                className="w-full rounded-[15px] border-none bg-ab-primary py-2.5 font-sans text-[11px] font-bold text-black hover:brightness-105 disabled:opacity-50"
              >
                {installing ? "Updating…" : "Download and restart"}
              </button>
              {!forceUpdate ? (
                <button
                  type="button"
                  disabled={installing}
                  onClick={() => void handleDismiss()}
                  className="w-full rounded-[15px] border border-white/15 bg-transparent py-2.5 font-sans text-[11px] font-bold text-ab-tertiary hover:bg-white/5 disabled:opacity-50"
                >
                  Later
                </button>
              ) : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
