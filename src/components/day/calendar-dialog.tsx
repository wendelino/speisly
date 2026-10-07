import { addDays, format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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
 * Kalender der Tagesauswahl als Drawer (Handy: Bottom-Sheet zum Wegziehen).
 * Kein am Button verankertes Popover: nichts springt beim Öffnen. Wird erst
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
    <Drawer
      onOpenChange={(value) => {
        $calendarOpen.set(value);
        trigger.setAttribute("aria-expanded", String(value));
      }}
      open={open}
    >
      <DrawerContent
        className="sm:max-w-sm"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.focus();
        }}
      >
        <DrawerHeader>
          <DrawerTitle>Tag wählen</DrawerTitle>
          <DrawerDescription>
            Speisepläne gibt es für das letzte Jahr und die nächsten zwei
            Wochen.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <Calendar
            captionLayout="dropdown"
            className="mx-auto [--cell-size:--spacing(10)]"
            defaultMonth={selectedDate}
            disabled={[
              { dayOfWeek: [0, 6] },
              { before: first },
              { after: last },
            ]}
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
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
