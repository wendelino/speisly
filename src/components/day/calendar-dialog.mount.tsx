import { mountOnce } from "@/components/on-demand";
import { $calendarOpen } from "@/stores/ui";
import { CalendarDialog } from "./calendar-dialog";

export function openCalendar(trigger: HTMLElement, selected: string): void {
  mountOnce("calendar", () => (
    <CalendarDialog selected={selected} trigger={trigger} />
  ));
  $calendarOpen.set(true);
}
