import { $calendarOpen } from "@/stores/ui";
import { CalendarPopover } from "./calendar-popover";
import { mountOnce } from "./on-demand";

/** Kalender geschlossen vorrendern, damit das Öffnen sofort reagiert */
export function prepareCalendar(anchor: HTMLElement, selected: string): void {
  mountOnce("calendar", () => (
    <CalendarPopover anchor={anchor} selected={selected} />
  ));
}

export function openCalendar(anchor: HTMLElement, selected: string): void {
  prepareCalendar(anchor, selected);
  $calendarOpen.set(true);
}
