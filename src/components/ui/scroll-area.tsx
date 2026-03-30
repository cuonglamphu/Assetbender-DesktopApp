import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import Lenis from "lenis";
import * as React from "react";
import { cn } from "@/lib/utils";

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else (ref as React.MutableRefObject<T | null>).current = value;
}

type ScrollAreaProps = React.ComponentPropsWithoutRef<
  typeof ScrollAreaPrimitive.Root
> & {
  /** Ref tới viewport cuộn (dùng cho overlay / đo scroll). */
  viewportRef?: React.Ref<HTMLDivElement>;
};

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(({ className, children, viewportRef, ...props }, ref) => {
  const viewportNodeRef = React.useRef<HTMLDivElement | null>(null);

  const setViewportRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      viewportNodeRef.current = node;
      assignRef(viewportRef, node);
    },
    [viewportRef],
  );

  React.useLayoutEffect(() => {
    const viewport = viewportNodeRef.current;
    if (!viewport) return;
    const content = viewport.firstElementChild as HTMLElement | null;
    if (!content) return;

    const lenis = new Lenis({
      wrapper: viewport,
      content,
      eventsTarget: viewport,
      autoRaf: true,
      smoothWheel: true,
      lerp: 0.12,
    });
    return () => {
      lenis.destroy();
    };
  }, []);

  return (
    <ScrollAreaPrimitive.Root
      ref={ref}
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={setViewportRef}
        className="h-full w-full rounded-[inherit]"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
});
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Scrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Scrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.Scrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical"
        ? "h-full w-2 border-l border-l-transparent p-px"
        : "h-2.5 flex-col border-t border-t-transparent p-px",
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-ab-tertiary/50" />
  </ScrollAreaPrimitive.Scrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.Scrollbar.displayName;

export { ScrollArea, ScrollBar };
