import { mountOnce } from "@/components/on-demand";
import { $calendarOpen } from "@/stores/ui";
import { CalendarDialog } from "./calendar-dialog";

/** Rendert den Kalender geschlossen vorab, damit das erste Öffnen sofort geht */
export function mountCalendar(selected: string): void {
  mountOnce("calendar", () => <CalendarDialog selected={selected} />);
}

export function openCalendar(selected: string): void {
  mountCalendar(selected);
  $calendarOpen.set(true);
}
