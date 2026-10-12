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
import { DAY_WINDOW } from "@/lib/dates";
import { isoDayToLocalDate } from "@/lib/format";
import { $calendarOpen } from "@/stores/ui";
import { useAtom } from "@/stores/use-atom";

type Props = {
  /** ausgewählter Tag (`YYYY-MM-DD`) */
  selected: string;
};

/**
 * Kalender der Tagesauswahl als Drawer (Handy: Bottom-Sheet zum Wegziehen).
 * Kein am Button verankertes Popover: nichts springt beim Öffnen. Wird erst
 * beim ersten Öffnen geladen. Tage außerhalb von DAY_WINDOW sind 404 und
 * daher nicht wählbar.
 */
export function CalendarDialog({ selected }: Props) {
  const open = useAtom($calendarOpen);
  const selectedDate = isoDayToLocalDate(selected);
  const now = new Date();
  const first = addDays(now, -DAY_WINDOW.past);
  const last = addDays(now, DAY_WINDOW.future);

  return (
    <Drawer onOpenChange={(value) => $calendarOpen.set(value)} open={open}>
      <DrawerContent
        className="sm:max-w-sm"
        returnFocus="[data-calendar-trigger]"
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
