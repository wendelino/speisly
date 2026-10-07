import { de } from "date-fns/locale";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import { type ComponentProps, useEffect, useRef } from "react";
import {
  type DayButton,
  DayPicker,
  getDefaultClassNames,
} from "react-day-picker";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/variants";
import { cn } from "@/lib/utils";

const NAV_BUTTON = cn(
  buttonVariants({ variant: "ghost" }),
  "size-(--cell-size) select-none p-0 aria-disabled:opacity-50"
);

/**
 * Kalender zur Auswahl eines Tages (react-day-picker, deutsch, Woche ab
 * Montag), mit Monats-/Jahresauswahl im Kopf.
 */
function Calendar({ className, ...props }: ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      captionLayout="dropdown"
      className={cn(
        "group/calendar bg-background p-3 [--cell-size:--spacing(8)]",
        className
      )}
      classNames={{
        root: cn("w-fit", defaults.root),
        months: cn("relative flex flex-col gap-4", defaults.months),
        month: cn("flex w-full flex-col gap-4", defaults.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaults.nav
        ),
        button_previous: cn(NAV_BUTTON, defaults.button_previous),
        button_next: cn(NAV_BUTTON, defaults.button_next),
        month_caption: cn(
          "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
          defaults.month_caption
        ),
        dropdowns: cn(
          "flex h-(--cell-size) w-full items-center justify-center gap-1.5 font-medium text-sm",
          defaults.dropdowns
        ),
        dropdown_root: cn(
          "relative rounded-md border border-input shadow-xs has-focus:border-ring has-focus:ring-[3px] has-focus:ring-ring/50",
          defaults.dropdown_root
        ),
        dropdown: cn(
          "absolute inset-0 bg-popover opacity-0",
          defaults.dropdown
        ),
        caption_label: cn(
          "flex h-8 select-none items-center gap-1 rounded-md pr-1 pl-2 font-medium text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
          defaults.caption_label
        ),
        table: "w-full border-collapse",
        weekdays: cn("flex", defaults.weekdays),
        weekday: cn(
          "flex-1 select-none rounded-md font-normal text-[0.8rem] text-muted-foreground",
          defaults.weekday
        ),
        week: cn("mt-2 flex w-full", defaults.week),
        day: cn(
          "group/day relative aspect-square h-full w-full select-none p-0 text-center",
          defaults.day
        ),
        today: cn(
          "rounded-full bg-accent text-accent-foreground",
          defaults.today
        ),
        outside: cn(
          "text-muted-foreground aria-selected:text-muted-foreground",
          defaults.outside
        ),
        disabled: cn("text-muted-foreground opacity-50", defaults.disabled),
        hidden: cn("invisible", defaults.hidden),
      }}
      components={{
        Chevron: CalendarChevron,
        DayButton: CalendarDayButton,
      }}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("de", { month: "short" }),
      }}
      locale={de}
      showOutsideDays
      weekStartsOn={1}
      {...props}
    />
  );
}

type DayPickerComponents = NonNullable<
  ComponentProps<typeof DayPicker>["components"]
>;

const CalendarChevron: DayPickerComponents["Chevron"] = ({
  className,
  orientation,
  ...props
}) => {
  const Icon =
    orientation === "left"
      ? ChevronLeftIcon
      : orientation === "right"
        ? ChevronRightIcon
        : ChevronDownIcon;
  return <Icon className={cn("size-4", className)} {...props} />;
};

function CalendarDayButton({
  className,
  day: _day,
  modifiers,
  ...props
}: ComponentProps<typeof DayButton>) {
  const ref = useRef<HTMLButtonElement>(null);
  // Tastaturnavigation im Raster: der fokussierte Tag bekommt den DOM-Fokus
  useEffect(() => {
    if (modifiers.focused) {
      ref.current?.focus();
    }
  }, [modifiers.focused]);

  return (
    <Button
      className={cn(
        "flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 font-normal leading-none data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/50",
        getDefaultClassNames().day,
        className
      )}
      data-selected={modifiers.selected}
      ref={ref}
      size="icon"
      variant="ghost"
      {...props}
    />
  );
}

export { Calendar };
