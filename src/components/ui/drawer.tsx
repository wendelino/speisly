import {
  Close as DialogClose,
  Content as DialogContent,
  Description as DialogDescription,
  Overlay as DialogOverlay,
  Portal as DialogPortal,
  Root as DialogRoot,
  Title as DialogTitle,
} from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import {
  AnimatePresence,
  animate,
  domMax,
  LazyMotion,
  m,
  type PanInfo,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Drawer: auf dem Handy ein Bottom-Sheet, das sich mit dem Finger nach unten
 * wegziehen lässt (Feder-Animation, Schwellen für Weg und Tempo), ab `sm` ein
 * zentrierter Dialog. Basis ist Radix Dialog: Fokusfalle, `aria-modal`,
 * Escape, Klick auf den Hintergrund und Scroll-Sperre bleiben erhalten; der
 * Schließen-Button ist immer da (Tastatur, Screenreader).
 *
 * Langer Inhalt gehört in <DrawerBody>: Der scrollt selbst, Kopf und Fuß
 * bleiben stehen. Gezogen wird überall außer auf Bedienelementen und in einem
 * Body, der gerade scrollen kann.
 */

/** Feder für Öffnen, Schließen und Zurückschnappen */
const SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 42,
  mass: 0.9,
} as const;
/** Schließt, wenn mehr als dieser Anteil der Höhe nach unten gezogen wurde … */
const CLOSE_DISTANCE_RATIO = 0.3;
/** … oder schneller als so viele px/s nach unten losgelassen wurde */
const CLOSE_VELOCITY = 400;
/** Widerstand beim Ziehen nach oben (0 = starr, 1 = folgt dem Finger) */
const UPWARD_ELASTICITY = 0.06;
/** Auf diesen Elementen beginnt kein Ziehen (Tippen bleibt Tippen) */
const NO_DRAG =
  "button, a, input, textarea, select, label, [role='switch'], [role='checkbox'], [role='radio'], [role='slider'], [contenteditable='true'], [data-drawer-no-drag]";
const SHEET_QUERY = "(max-width: 639px)";

type DrawerContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
const DrawerContext = createContext<DrawerContextValue | null>(null);

function useDrawer(): DrawerContextValue {
  const context = useContext(DrawerContext);
  if (!context) {
    throw new Error("Drawer components must be used within <Drawer>");
  }
  return context;
}

/** Bottom-Sheet (Handy) oder zentrierter Dialog (ab sm) */
function useIsSheet(): boolean {
  const [isSheet, setIsSheet] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(SHEET_QUERY).matches
  );
  useEffect(() => {
    const query = window.matchMedia(SHEET_QUERY);
    const update = () => setIsSheet(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isSheet;
}

/**
 * Markiert Bodys, die gerade scrollen können (`data-scrollable`): Dort scrollt
 * der Finger den Inhalt (touch-action: pan-y), sonst zieht er den Drawer.
 * Callback-Ref, weil Radix den Inhalt erst einen Render später ins Portal
 * hängt; beobachtet Größe und Inhalt (z. B. Consent → Formular).
 */
function useScrollableBodies(): (root: HTMLElement | null) => void {
  const cleanup = useRef<(() => void) | null>(null);
  return useCallback((root: HTMLElement | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!root) {
      return;
    }
    const bodies = () =>
      root.querySelectorAll<HTMLElement>("[data-drawer-body]");
    const update = () => {
      for (const body of bodies()) {
        body.toggleAttribute(
          "data-scrollable",
          body.scrollHeight > body.clientHeight + 1
        );
      }
    };
    const resize = new ResizeObserver(update);
    const observeAll = () => {
      resize.disconnect();
      resize.observe(root);
      for (const body of bodies()) {
        resize.observe(body);
        for (const child of body.children) {
          resize.observe(child);
        }
      }
      update();
    };
    const mutations = new MutationObserver(observeAll);
    mutations.observe(root, { childList: true, subtree: true });
    observeAll();
    cleanup.current = () => {
      resize.disconnect();
      mutations.disconnect();
    };
  }, []);
}

function offscreenY(): number {
  return typeof window === "undefined" ? 1000 : window.innerHeight;
}

type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

function Drawer({ open, onOpenChange, children }: DrawerProps) {
  // Während der Schließ-Animation ist der Drawer noch gemountet: Escape oder
  // ein Klick daneben dürfen ihn dann nicht ein zweites Mal „schließen“
  const change = (next: boolean) => {
    if (next !== open) {
      onOpenChange(next);
    }
  };
  return (
    <DrawerContext.Provider value={{ open, onOpenChange: change }}>
      <DialogRoot onOpenChange={change} open={open}>
        {children}
      </DialogRoot>
    </DrawerContext.Provider>
  );
}

type DrawerContentProps = Omit<
  ComponentProps<typeof DialogContent>,
  "asChild" | "forceMount"
> & {
  showCloseButton?: boolean;
};

function DrawerContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DrawerContentProps) {
  const { open, onOpenChange } = useDrawer();
  const isSheet = useIsSheet();
  const reduceMotion = useReducedMotion();
  const dragControls = useDragControls();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const observeBodies = useScrollableBodies();
  const setSheet = useCallback(
    (node: HTMLDivElement | null) => {
      sheetRef.current = node;
      observeBodies(node);
    },
    [observeBodies]
  );
  const y = useMotionValue(0);
  // Hintergrund wird mit dem Herunterziehen heller
  const overlayOpacity = useTransform(y, (value) => {
    const height = sheetRef.current?.offsetHeight || offscreenY();
    return 1 - Math.min(1, Math.max(0, value / height));
  });
  const transition = reduceMotion ? { duration: 0 } : SPRING;

  const startDrag = (event: ReactPointerEvent) => {
    const target = event.target as HTMLElement;
    if (
      !isSheet ||
      target.closest(NO_DRAG) ||
      target.closest("[data-drawer-body][data-scrollable]")
    ) {
      return;
    }
    dragControls.start(event);
  };

  const endDrag = (_: unknown, info: PanInfo) => {
    const height = sheetRef.current?.offsetHeight ?? offscreenY();
    if (
      info.offset.y > height * CLOSE_DISTANCE_RATIO ||
      info.velocity.y > CLOSE_VELOCITY
    ) {
      onOpenChange(false);
    } else {
      animate(y, 0, transition);
    }
  };

  const sheetMotion = {
    initial: { y: offscreenY() },
    animate: { y: 0 },
    exit: { y: offscreenY() },
  };
  const dialogMotion = {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.96 },
  };
  const contentMotion = isSheet
    ? { ...sheetMotion, style: { y } }
    : dialogMotion;

  return (
    <LazyMotion features={domMax} strict>
      <AnimatePresence>
        {open ? (
          <DialogPortal forceMount>
            <DialogOverlay asChild forceMount>
              {isSheet ? (
                <m.div
                  className="fixed inset-0 z-50 bg-foreground/35"
                  style={{ opacity: overlayOpacity }}
                />
              ) : (
                <m.div
                  animate={{ opacity: 1 }}
                  className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[2px]"
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
                  transition={
                    reduceMotion ? { duration: 0 } : { duration: 0.2 }
                  }
                />
              )}
            </DialogOverlay>
            <DialogContent asChild forceMount {...props}>
              <m.div
                className={cn(
                  "fixed z-50 flex flex-col bg-background shadow-lift outline-none",
                  // Handy: Bottom-Sheet; der Nachlauf unten verdeckt die
                  // Seite, wenn der Drawer elastisch nach oben gezogen wird
                  "inset-x-0 bottom-0 max-h-[92dvh] touch-none rounded-t-3xl after:absolute after:inset-x-0 after:top-full after:h-[30vh] after:bg-background",
                  "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[85vh] sm:w-[calc(100%-2rem)] sm:max-w-md sm:touch-auto sm:rounded-3xl sm:after:hidden",
                  className
                )}
                data-slot="drawer-content"
                drag={isSheet ? "y" : false}
                dragConstraints={{ top: 0 }}
                dragControls={dragControls}
                dragElastic={UPWARD_ELASTICITY}
                dragListener={false}
                dragMomentum={false}
                onDragEnd={endDrag}
                onPointerDown={startDrag}
                ref={setSheet}
                transition={transition}
                {...contentMotion}
              >
                <div
                  aria-hidden="true"
                  className="flex shrink-0 cursor-grab justify-center pt-3 pb-1 active:cursor-grabbing sm:hidden"
                  data-drawer-handle
                >
                  <div className="h-1.5 w-12 rounded-full bg-border" />
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-5 px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 sm:pb-6">
                  {children}
                </div>
                {showCloseButton ? (
                  <DialogClose
                    className="absolute top-4 right-4 inline-flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring sm:top-5 sm:right-5 [&_svg]:size-4"
                    data-slot="drawer-close"
                  >
                    <XIcon />
                    <span className="sr-only">Schließen</span>
                  </DialogClose>
                ) : null}
              </m.div>
            </DialogContent>
          </DialogPortal>
        ) : null}
      </AnimatePresence>
    </LazyMotion>
  );
}

function DrawerHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-1.5 pr-10 text-left",
        className
      )}
      data-slot="drawer-header"
      {...props}
    />
  );
}

/** Scrollt selbst, wenn der Inhalt höher ist als der Platz im Drawer */
function DrawerBody({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1",
        className
      )}
      data-drawer-body
      data-slot="drawer-body"
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex shrink-0 flex-col gap-2", className)}
      data-slot="drawer-footer"
      {...props}
    />
  );
}

function DrawerTitle({
  className,
  ...props
}: ComponentProps<typeof DialogTitle>) {
  return (
    <DialogTitle
      className={cn("font-bold font-display text-xl leading-tight", className)}
      data-slot="drawer-title"
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: ComponentProps<typeof DialogDescription>) {
  return (
    <DialogDescription
      className={cn("text-muted-foreground text-sm", className)}
      data-slot="drawer-description"
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
};
