import { $calendarOpen } from "@/stores/ui";
import { CalendarPopover } from "./calendar-popover";
import { mountOnce } from "./on-demand";

export function openCalendar(anchor: HTMLElement, selected: string): void {
  mountOnce("calendar", () => (
    <CalendarPopover anchor={anchor} selected={selected} />
  ));
  $calendarOpen.set(true);
}
