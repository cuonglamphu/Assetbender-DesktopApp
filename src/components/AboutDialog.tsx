import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  requestUpdateCheck,
  UPDATE_CHECK_DONE,
  type UpdateCheckDoneDetail,
} from "@/lib/updateCheckEvents";

type AboutDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [upToDate, setUpToDate] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUpToDate(false);
    setChecking(false);
    void getVersion()
      .then((v) => setVersion(v.trim()))
      .catch(() => setVersion(null));
  }, [open]);

  useEffect(() => {
    const onDone = (e: Event) => {
      const ce = e as CustomEvent<UpdateCheckDoneDetail>;
      setChecking(false);
      if (ce.detail?.result === "none") setUpToDate(true);
      if (ce.detail?.result === "update") onOpenChange(false);
    };
    window.addEventListener(UPDATE_CHECK_DONE, onDone);
    return () => window.removeEventListener(UPDATE_CHECK_DONE, onDone);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px] gap-4 p-6 sm:max-w-[400px]">
        <DialogHeader className="gap-2 space-y-0 text-left">
          <DialogTitle className="font-montserrat text-lg font-bold leading-snug text-white">
            About AssetBender
          </DialogTitle>
          <DialogDescription className="text-left text-sm leading-relaxed text-ab-tertiary">
            Desktop shell for plugins and packs.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm text-ab-tertiary">
          <p>
            <span className="text-ab-tertiary/80">Version </span>
            <span className="font-mono text-ab-secondary">
              {version ?? (open ? "…" : "—")}
            </span>
          </p>
          {upToDate ? (
            <p className="text-xs text-ab-primary">You&apos;re on the latest version.</p>
          ) : null}
        </div>
        <DialogFooter className="sm:justify-start">
          <button
            type="button"
            disabled={checking}
            onClick={() => {
              setUpToDate(false);
              setChecking(true);
              requestUpdateCheck();
            }}
            className="w-full rounded-[15px] border-none bg-ab-primary py-2.5 font-sans text-[11px] font-bold text-black hover:brightness-105 disabled:opacity-50 sm:w-auto sm:min-w-[180px]"
          >
            {checking ? "Checking…" : "Check for updates"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
