import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { isoDayToLocalDate } from "@/lib/format-day";
import { $calendarOpen } from "@/stores/ui";
import { useAtom } from "@/stores/use-atom";

type Props = {
  /** der statische Kalender-Button aus day-selector.astro */
  anchor: HTMLElement;
  /** ausgewählter Tag (`YYYY-MM-DD`) */
  selected: string;
};

/**
 * Kalender-Popover des Day-Selectors (wie bisher react-day-picker in einem
 * modalen Radix-Popover). Wird erst beim ersten Öffnen geladen.
 */
export function CalendarPopover({ anchor, selected }: Props) {
  const open = useAtom($calendarOpen, false);
  const selectedDate = isoDayToLocalDate(selected);

  return (
    <Popover
      modal
      onOpenChange={(value) => {
        $calendarOpen.set(value);
        anchor.setAttribute("aria-expanded", String(value));
      }}
      open={open}
    >
      <PopoverAnchor virtualRef={{ current: anchor }} />
      <PopoverContent
        align="center"
        className="z-50 w-auto p-0"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          anchor.focus();
        }}
      >
        <Calendar
          captionLayout="dropdown"
          defaultMonth={selectedDate}
          mode="single"
          onSelect={(date) => {
            if (!date) {
              return;
            }
            $calendarOpen.set(false);
            window.location.assign(`/day/${format(date, "yyyy-MM-dd")}`);
          }}
          selected={selectedDate}
        />
      </PopoverContent>
    </Popover>
  );
}
