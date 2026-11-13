import {
  Content as SelectPrimitiveContent,
  Icon as SelectPrimitiveIcon,
  Item as SelectPrimitiveItem,
  ItemIndicator as SelectPrimitiveItemIndicator,
  ItemText as SelectPrimitiveItemText,
  Portal as SelectPrimitivePortal,
  Root as SelectPrimitiveRoot,
  Trigger as SelectPrimitiveTrigger,
  Value as SelectPrimitiveValue,
  Viewport as SelectPrimitiveViewport,
} from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Auswahlliste auf Basis von Radix Select (kein natives <select>): Tastatur,
 * Typeahead und ARIA kommen von Radix, das Aussehen passt zu den übrigen
 * Bedienelementen.
 */
const Select = SelectPrimitiveRoot;
const SelectValue = SelectPrimitiveValue;

function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitiveTrigger>) {
  return (
    <SelectPrimitiveTrigger
      className={cn(
        "flex w-full min-w-0 items-center justify-between gap-2 rounded-2xl bg-muted/60 px-3 py-2.5 text-left font-semibold text-sm outline-none ring-1 ring-transparent transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring data-[state=open]:bg-muted [&>span]:flex [&>span]:min-w-0 [&>span]:items-center [&>span]:gap-2 [&>span]:truncate",
        className
      )}
      data-slot="select-trigger"
      {...props}
    >
      {children}
      <SelectPrimitiveIcon asChild>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
      </SelectPrimitiveIcon>
    </SelectPrimitiveTrigger>
  );
}

function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: ComponentProps<typeof SelectPrimitiveContent>) {
  return (
    <SelectPrimitivePortal>
      <SelectPrimitiveContent
        className={cn(
          "relative z-60 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-2xl bg-popover p-1 text-popover-foreground shadow-lift ring-1 ring-border/60",
          className
        )}
        data-slot="select-content"
        position={position}
        sideOffset={6}
        {...props}
      >
        <SelectPrimitiveViewport>{children}</SelectPrimitiveViewport>
      </SelectPrimitiveContent>
    </SelectPrimitivePortal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitiveItem>) {
  return (
    <SelectPrimitiveItem
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-xl py-2.5 pr-8 pl-3 font-medium text-sm outline-none transition-colors data-disabled:pointer-events-none data-highlighted:bg-accent data-[state=checked]:font-semibold data-disabled:opacity-50",
        className
      )}
      data-slot="select-item"
      {...props}
    >
      <SelectPrimitiveItemText>
        <span className="flex items-center gap-2">{children}</span>
      </SelectPrimitiveItemText>
      <span className="absolute right-2.5 grid size-4 place-items-center">
        <SelectPrimitiveItemIndicator>
          <Check className="size-4 text-primary" />
        </SelectPrimitiveItemIndicator>
      </span>
    </SelectPrimitiveItem>
  );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
