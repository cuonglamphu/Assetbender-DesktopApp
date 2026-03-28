import { cn } from "@/lib/utils";

/** Nút phụ (Uninstall, v.v.) — dùng chung plugin + pack. */
export const installSecondaryButtonClass =
  "flex h-[35px] min-h-[35px] min-w-0 items-center justify-center rounded-[15px] border border-white/[0.1] bg-[#2d2d2d] px-3 font-sans text-[11px] font-bold leading-tight text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_1px_2px_rgba(0,0,0,0.45)] transition-[border-color,background-color,box-shadow,filter,opacity] hover:enabled:border-white/[0.16] hover:enabled:bg-[#353535] hover:enabled:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_6px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:opacity-45";

type Props = {
  label: string;
  progress: number | null;
  busy: boolean;
  disabled?: boolean;
  narrow?: boolean;
  onClick: () => void;
  /** Hủy tải (Tauri `cancel_install_download`) — chỉ hiện khi `busy`. */
  onCancel?: () => void;
  className?: string;
};

export function InstallProgressButton({
  label,
  progress,
  busy,
  disabled,
  narrow,
  onClick,
  onCancel,
  className,
}: Props) {
  const pct =
    progress != null && progress >= 0
      ? Math.min(100, Math.round(progress * 1000) / 10)
      : null;

  const fillScale = pct != null ? Math.min(1, Math.max(0, pct / 100)) : null;

  return (
    <div
      className={cn("w-full max-w-[290px]", narrow && "max-w-[145px]", className)}
    >
      <button
        type="button"
        disabled={disabled || busy}
        onClick={onClick}
        aria-busy={busy}
        className={cn(
          "relative flex h-[35px] w-full min-w-0 items-center justify-center overflow-hidden rounded-[15px] border border-ab-primary/50 bg-gradient-to-b from-[#d2fcf7] to-ab-primary px-0 font-sans text-[11px] font-bold tracking-wide text-black/90",
          "shadow-[0_2px_0_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.55)]",
          "transition-[transform,filter,box-shadow,border-color] duration-150",
          "hover:enabled:-translate-y-px hover:enabled:brightness-[1.03] hover:enabled:shadow-[0_4px_14px_rgba(162,238,231,0.35),inset_0_1px_0_rgba(255,255,255,0.6)]",
          "active:enabled:translate-y-0",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ab-primary/55 focus-visible:ring-offset-2 focus-visible:ring-offset-ab-accent",
          "disabled:cursor-not-allowed disabled:opacity-90 disabled:hover:translate-y-0",
          busy &&
            "translate-y-0 border-transparent bg-[#1a1a1a] shadow-none [background-image:none] hover:translate-y-0",
        )}
      >
        {!busy ? (
          <span className="relative z-[2] flex min-h-[35px] w-full min-w-0 items-center justify-center whitespace-nowrap px-1.5 text-center leading-none">
            {label}
          </span>
        ) : (
          <>
            {/* Track full width — cùng chiều rộng với nút */}
            <span
              className="absolute inset-0 z-0 rounded-[15px] bg-[#2a2a2a]"
              aria-hidden
            />
            {fillScale != null ? (
              <div className="absolute inset-y-0 left-0 z-[1] w-full overflow-hidden rounded-[15px]">
                <div
                  className="h-full w-full origin-left rounded-[15px] bg-gradient-to-r from-[rgba(23,195,106,0.55)] via-ab-progress to-[rgba(23,195,106,0.55)] will-change-transform"
                  style={{
                    transform: `scaleX(${fillScale})`,
                    transition:
                      "transform 0.28s cubic-bezier(0.33, 1, 0.68, 1)",
                  }}
                />
              </div>
            ) : (
              <span
                className="absolute bottom-0 left-0 top-0 z-[1] rounded-[15px] bg-gradient-to-r from-[rgba(23,195,106,0.55)] via-ab-progress to-[rgba(23,195,106,0.55)]"
                style={{
                  width: "45%",
                  animation:
                    "install-indeterminate 1.2s ease-in-out infinite",
                }}
              />
            )}
            <span className="relative z-[2] flex w-full min-w-0 items-center justify-center px-1 text-sm font-bold tabular-nums text-white drop-shadow-[0_0_6px_rgba(0,0,0,0.6)]">
              {pct != null ? `${pct.toFixed(1)} %` : "…"}
            </span>
          </>
        )}
      </button>
      {busy && onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="mt-1.5 w-full rounded-[15px] border border-ab-primary/25 bg-ab-primary/[0.07] py-1.5 text-center font-sans text-[10px] font-bold uppercase tracking-wide text-ab-primary/90 transition-[border-color,background-color,color] hover:border-ab-primary/40 hover:bg-ab-primary/12 hover:text-ab-primary"
        >
          Cancel download
        </button>
      ) : null}
    </div>
  );
}

export function SectionHeader({
  title,
  onSearch,
  className,
}: {
  title: string;
  onSearch: (q: string) => void;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex min-h-[75px] shrink-0 items-center justify-between gap-4 border-b border-white/5 bg-ab-accent/95 px-4 py-4 backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className="size-4 shrink-0 rounded-full bg-ab-primary"
          aria-hidden
        />
        <span className="text-base font-black text-white">{title}</span>
      </div>
      <label className="flex h-[35px] max-w-full items-center rounded-[18px] bg-ab-input px-3 sm:w-[210px]">
        <span className="sr-only">Search</span>
        <span className="mr-1.5 text-ab-primary opacity-90" aria-hidden>
          ⌕
        </span>
        <input
          type="search"
          placeholder=" Search"
          autoComplete="off"
          onChange={(e) => onSearch(e.target.value)}
          className="min-w-0 flex-1 border-none bg-transparent text-xs font-bold text-white placeholder:font-bold placeholder:text-ab-text-gray outline-none"
        />
      </label>
    </header>
  );
}
