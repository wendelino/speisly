import { mountOnce } from "@/components/on-demand";
import { $calendarOpen } from "@/stores/ui";
import { CalendarPopover } from "./calendar-popover";

export function openCalendar(anchor: HTMLElement, selected: string): void {
  mountOnce("calendar", () => (
    <CalendarPopover anchor={anchor} selected={selected} />
  ));
  $calendarOpen.set(true);
}
