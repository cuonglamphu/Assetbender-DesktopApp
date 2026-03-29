import { relaunch } from "@tauri-apps/plugin-process";
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

/**
 * Sau khi đăng nhập: tự gọi `check()`; nếu có bản mới thì mở dialog tải + cài + khởi động lại.
 * Trong trình duyệt / khi updater lỗi thì bỏ qua im lặng.
 */
export function AppUpdateDialog() {
  const [open, setOpen] = useState(false);
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateRef = useRef<Update | null>(null);
  updateRef.current = update;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const u = await check();
        if (cancelled) {
          await u?.close().catch(() => {});
          return;
        }
        if (!u) return;
        setUpdate(u);
        setOpen(true);
      } catch {
        /* dev, web, hoặc chưa cấu hình updater */
      }
    })();

    return () => {
      cancelled = true;
      void updateRef.current?.close().catch(() => {});
    };
  }, []);

  const handleDismiss = useCallback(async () => {
    setOpen(false);
    const u = updateRef.current;
    setUpdate(null);
    if (u) await u.close().catch(() => {});
  }, []);

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

  if (!update) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !installing) void handleDismiss();
      }}
    >
      <DialogContent
        className="max-w-[440px] gap-4 p-6 sm:max-w-[440px]"
        onPointerDownOutside={(e) => {
          if (installing) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (installing) e.preventDefault();
        }}
      >
        <DialogHeader className="gap-2 space-y-0 text-left">
          <DialogTitle className="font-montserrat text-lg font-bold leading-snug text-white">
            Update available
          </DialogTitle>
          <DialogDescription className="text-left text-sm leading-relaxed text-ab-tertiary">
            New version{" "}
            <span className="text-ab-secondary">{update.version}</span>
            {update.currentVersion ? (
              <> (installed: {update.currentVersion})</>
            ) : null}
            .
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm text-ab-tertiary">
          {update.body ? (
            <p className="whitespace-pre-wrap text-xs text-ab-tertiary/90">{update.body}</p>
          ) : null}
          {progressLabel ? (
            <p className="text-xs text-ab-primary">{progressLabel}</p>
          ) : null}
          {error ? <p className="text-xs text-ab-error">{error}</p> : null}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <button
            type="button"
            disabled={installing}
            onClick={() => void handleInstall()}
            className="w-full rounded-[15px] border-none bg-ab-primary py-2.5 font-sans text-[11px] font-bold text-black hover:brightness-105 disabled:opacity-50"
          >
            {installing ? "Updating…" : "Download and restart"}
          </button>
          <button
            type="button"
            disabled={installing}
            onClick={() => void handleDismiss()}
            className="w-full rounded-[15px] border border-white/15 bg-transparent py-2.5 font-sans text-[11px] font-bold text-ab-tertiary hover:bg-white/5 disabled:opacity-50"
          >
            Later
          </button>
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
