import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/** 0–1 easing mượt (Hermite), dùng cho opacity khi cuộn. */
function smoothstep01(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

const MIST_SCROLL_FADE_PX = 160;
/** Hai mũi tên tụ gần: chồng phần lớn chiều cao icon (px). */
const ARROW_OVERLAP_PX = 40;

/** Lớp sương + mũi tên khi còn nội dung bên dưới (giống Flutter `home_page` `_buildSectionWithOverlay`). */
export function ScrollFadeOverlay({
  scrollRef,
  showArrows = true,
  mistHeightPx = 120,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  showArrows?: boolean;
  mistHeightPx?: number;
}) {
  const [mistOpacity, setMistOpacity] = useState(0);
  const [arrowOpacity, setArrowOpacity] = useState(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function update() {
      const node = scrollRef.current;
      if (!node) return;
      const max = node.scrollHeight - node.clientHeight;
      const canScroll = max > 2;
      const y = node.scrollTop;
      if (!canScroll) {
        setMistOpacity(0);
        setArrowOpacity(0);
        return;
      }

      const distFromBottom = max - y;
      const fadeStart = Math.max(0, max - MIST_SCROLL_FADE_PX);
      let mist: number;
      if (y <= fadeStart) {
        mist = 1;
      } else {
        const t = (y - fadeStart) / MIST_SCROLL_FADE_PX;
        mist = 1 - smoothstep01(t);
      }

      const arrowBottomFadePx = 52;
      const arrowTail = smoothstep01(
        Math.min(1, distFromBottom / arrowBottomFadePx),
      );
      const arrows = showArrows ? mist * arrowTail : 0;

      setMistOpacity(mist);
      setArrowOpacity(arrows);
    }

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [scrollRef, showArrows]);

  if (mistOpacity < 0.015 && arrowOpacity < 0.015) return null;

  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] rounded-b-xl"
        style={{
          height: mistHeightPx,
          opacity: mistOpacity,
          background:
            "linear-gradient(to bottom, rgba(162,238,231,0) 0%, rgba(162,238,231,0) 18%, rgba(162,238,231,0.035) 42%, rgba(162,238,231,0.1) 68%, rgba(162,238,231,0.2) 88%, rgba(162,238,231,0.24) 100%)",
        }}
        aria-hidden
      />
      {arrowOpacity > 0.01 ? (
        <div
          className="pointer-events-none absolute bottom-4 left-1/2 z-[3] flex -translate-x-1/2 flex-col items-center justify-end animate-scroll-hint"
          style={{ opacity: arrowOpacity }}
          aria-hidden
        >
          <ChevronDown className="h-8 w-8 shrink-0 text-ab-primary" />
          <ChevronDown
            className="h-8 w-8 shrink-0 text-ab-primary"
            style={{ marginTop: -ARROW_OVERLAP_PX }}
          />
        </div>
      ) : null}
    </>
  );
}

function ChevronDown({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={style}
      aria-hidden
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Cuộn nội dung (shadcn ScrollArea) + overlay sương/mũi tên. */
export function ScrollSectionWithFade({
  children,
  className,
  contentClassName,
  showArrows = true,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  showArrows?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);

  return (
    <div className={cn("relative min-h-0 flex-1", className)}>
      <ScrollArea
        viewportRef={viewportRef}
        className={cn(
          "h-full min-h-0 overscroll-y-contain [scrollbar-gutter:stable]",
          contentClassName,
        )}
      >
        {children}
      </ScrollArea>
      <ScrollFadeOverlay scrollRef={viewportRef} showArrows={showArrows} />
    </div>
  );
}
