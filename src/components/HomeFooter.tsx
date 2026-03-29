import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AboutDialog } from "@/components/AboutDialog";
import { cn } from "@/lib/utils";

const MENU_PAD = 8; /* p-2 */
const MENU_ITEM_H = 50;
const MENU_GAP = 4; /* h-1 spacer */
const MENU_WIDTH = 200 + MENU_PAD * 2;
const MENU_HEIGHT =
  MENU_PAD * 2 + MENU_ITEM_H * 4 + MENU_GAP * 3;
const GAP_ABOVE = 8;
const OFFSET_X = 5;

/** Khớp Flutter `footer.dart` + `user_welcome_button.dart` (kích thước, spacing, menu). */
export function HomeFooter({
  userFirstName,
  onRefresh,
  onGetMore,
  onMyAccount,
  onTutorials,
  onLogout,
}: {
  userFirstName: string | undefined;
  onRefresh: () => void;
  onGetMore: () => void;
  onMyAccount: () => void;
  onTutorials: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuEntered, setMenuEntered] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(
    null,
  );

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenuTimeoutRef = useRef(0);

  const updateMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = rect.right - MENU_WIDTH - OFFSET_X;
    const minLeft = MENU_PAD;
    const maxLeft = window.innerWidth - MENU_WIDTH - MENU_PAD;
    left = Math.min(Math.max(left, minLeft), maxLeft);

    let top = rect.top - GAP_ABOVE - MENU_HEIGHT;
    top = Math.max(MENU_PAD, top);

    setMenuPos({ left, top });
  }, []);

  useEffect(() => {
    if (open) {
      if (closeMenuTimeoutRef.current) {
        window.clearTimeout(closeMenuTimeoutRef.current);
        closeMenuTimeoutRef.current = 0;
      }
      setMenuMounted(true);
      setMenuEntered(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open && menuMounted) {
      setMenuEntered(false);
      closeMenuTimeoutRef.current = window.setTimeout(() => {
        setMenuMounted(false);
        closeMenuTimeoutRef.current = 0;
      }, 220);
      return () => {
        window.clearTimeout(closeMenuTimeoutRef.current);
      };
    }
  }, [open, menuMounted]);

  useLayoutEffect(() => {
    if (!menuMounted) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
    if (!open) return;
    setMenuEntered(false);
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setMenuEntered(true)),
    );
    return () => cancelAnimationFrame(id);
  }, [menuMounted, open, updateMenuPosition]);

  useEffect(() => {
    if (!menuMounted) return;
    function onResizeOrScroll() {
      updateMenuPosition();
    }
    window.addEventListener("resize", onResizeOrScroll);
    window.addEventListener("scroll", onResizeOrScroll, true);
    return () => {
      window.removeEventListener("resize", onResizeOrScroll);
      window.removeEventListener("scroll", onResizeOrScroll, true);
    };
  }, [menuMounted, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const menuPortal =
    menuMounted && menuPos != null
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              left: menuPos.left,
              top: menuPos.top,
              width: MENU_WIDTH,
              zIndex: 200,
            }}
            className={cn(
              "origin-bottom-right rounded-[15px] bg-ab-accent p-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)]",
              "transition duration-200 ease-out motion-reduce:transition-none",
              menuEntered
                ? "translate-y-0 scale-100 opacity-100"
                : "pointer-events-none translate-y-1 scale-[0.98] opacity-0",
            )}
          >
            <button
              type="button"
              role="menuitem"
              className={secondaryMenuRowClass}
              onClick={() => {
                setOpen(false);
                onMyAccount();
              }}
            >
              Account
            </button>
            <div className="h-1" aria-hidden />
            <button
              type="button"
              role="menuitem"
              className={secondaryMenuRowClass}
              onClick={() => {
                setOpen(false);
                onTutorials();
              }}
            >
              Tutorial
            </button>
            <div className="h-1" aria-hidden />
            <button
              type="button"
              role="menuitem"
              className={secondaryMenuRowClass}
              onClick={() => {
                setOpen(false);
                setAboutOpen(true);
              }}
            >
              About
            </button>
            <div className="h-1" aria-hidden />
            <button
              type="button"
              role="menuitem"
              className={secondaryMenuRowClass}
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              Logout
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <footer
      className={cn(
        "relative flex h-[83px] w-full shrink-0 items-center justify-between rounded-[15px] px-4",
        "bg-ab-accent",
      )}
    >
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      {menuPortal}

      <div className="relative z-[1] flex min-w-0 items-center gap-[18px]">
        <div
          className="flex size-[50px] shrink-0 items-center justify-center rounded-[10px] bg-ab-primary p-1"
          aria-hidden
        >
          <img
            src="/AssetBender-logo.png"
            alt=""
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        </div>
        <div className="flex min-w-0 items-baseline font-montserrat text-base leading-none text-white">
          <span className="font-bold">ASSET</span>
          <span className="font-normal">BENDER</span>
        </div>
      </div>

      {userFirstName ? (
        <div className="relative z-[1] flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onGetMore}
            className="h-10 w-[120px] shrink-0 rounded-[15px] border-none bg-ab-primary font-sans text-[11px] font-bold text-black hover:brightness-105"
          >
            Get more
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="h-10 w-[120px] shrink-0 rounded-[15px] border-none bg-ab-input font-sans text-[11px] font-bold text-white hover:brightness-110"
          >
            Refresh
          </button>
          <div className="relative shrink-0">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-haspopup="menu"
              className={cn(
                "inline-flex h-[41.4px] max-w-[min(100vw-2rem,320px)] min-w-0 items-center gap-1 rounded-[15px] bg-ab-input px-6 text-left",
                "font-sans text-[11px] tracking-[0.3px]",
              )}
            >
              <span className="shrink-0 font-normal text-white">Hey </span>
              <span className="min-w-0 max-w-[200px] shrink truncate font-semibold text-ab-primary">
                {userFirstName}
              </span>
              <span className="shrink-0 text-ab-primary" aria-hidden>
                <PersonOutlineIcon className="size-[22px]" />
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </footer>
  );
}

const secondaryMenuRowClass = cn(
  "flex h-[50px] w-[200px] max-w-[calc(100vw-3rem)] cursor-pointer items-center justify-center rounded-[15px] border-none",
  "bg-ab-input font-sans text-[11px] font-bold text-white hover:brightness-110",
);

function PersonOutlineIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  );
}
