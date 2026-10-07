import { addDays, format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isoDayToLocalDate } from "@/lib/format-day";
import { $calendarOpen } from "@/stores/ui";
import { useAtom } from "@/stores/use-atom";

type Props = {
  /** der Kalender-Button aus day-selector.astro (bekommt den Fokus zurück) */
  trigger: HTMLElement;
  /** ausgewählter Tag (`YYYY-MM-DD`) */
  selected: string;
};

/**
 * Kalender der Tagesauswahl als Dialog (Handy: Bottom-Sheet). Ein Dialog statt
 * eines am Button verankerten Popovers: nichts springt beim Öffnen. Wird erst
 * beim ersten Öffnen geladen.
 */
// wie DAY_WINDOW in server/dates.ts: ältere/spätere Tage sind 404
const PAST_DAYS = 365;
const FUTURE_DAYS = 14;

export function CalendarDialog({ trigger, selected }: Props) {
  const open = useAtom($calendarOpen, false);
  const selectedDate = isoDayToLocalDate(selected);
  const now = new Date();
  const first = addDays(now, -PAST_DAYS);
  const last = addDays(now, FUTURE_DAYS);

  return (
    <Dialog
      onOpenChange={(value) => {
        $calendarOpen.set(value);
        trigger.setAttribute("aria-expanded", String(value));
      }}
      open={open}
    >
      <DialogContent
        className="sm:max-w-sm"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Tag wählen</DialogTitle>
          <DialogDescription>
            Speisepläne gibt es für das letzte Jahr und die nächsten zwei
            Wochen.
          </DialogDescription>
        </DialogHeader>
        <Calendar
          captionLayout="dropdown"
          className="mx-auto [--cell-size:--spacing(10)]"
          defaultMonth={selectedDate}
          disabled={[{ dayOfWeek: [0, 6] }, { before: first }, { after: last }]}
          endMonth={last}
          mode="single"
          onSelect={(date) => {
            if (!date) {
              return;
            }
            $calendarOpen.set(false);
            window.location.assign(`/day/${format(date, "yyyy-MM-dd")}`);
          }}
          selected={selectedDate}
          startMonth={first}
        />
      </DialogContent>
    </Dialog>
  );
}
