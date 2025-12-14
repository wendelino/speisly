"use client";

import { addDays, format, startOfDay } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type * as React from "react";
import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

export default function DaySelector({ initialDate }: { initialDate?: Date }) {
  const [selectedDate, setSelectedDate] = useState<Date>(
    startOfDay(initialDate || new Date())
  );
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);

  const handleSelectDate = (date?: Date) => {
    if (!date) {
      return;
    }
    setSelectedDate(startOfDay(date));
    setOpen(false);
    if (date.getTime() === today.getTime()) {
      router.push("/#day-selector");
    } else {
      router.push(`/day/${format(date, "yyyy-MM-dd")}`);
    }
  };

  const isToday = selectedDate.getTime() === today.getTime();
  const isTomorrow = selectedDate.getTime() === tomorrow.getTime();
  const isCustomDate = !(isToday || isTomorrow);

  return (
    <section className="container mx-auto px-4 py-6" id="day-selector">
      <div className="grid grid-cols-4 items-center justify-center gap-2">
        {/* Quick date buttons */}
        <DaySelectorButton
          condition={isToday}
          date={today}
          label="Heute"
          onClick={() => handleSelectDate(today)}
        />

        <DaySelectorButton
          condition={isTomorrow}
          date={tomorrow}
          label="Morgen"
          onClick={() => handleSelectDate(tomorrow)}
        />
        {/* Calendar popover */}
        <Popover modal onOpenChange={setOpen} open={open}>
          <PopoverTrigger asChild>
            <DaySelectorButton
              className="col-span-2"
              condition={isCustomDate}
              date={new Date()}
            >
              <div
                className={cn(
                  "flex h-full items-center border-r px-3",
                  isCustomDate ? "border-r-primary-foreground/40" : "bg-muted"
                )}
              >
                <CalendarIcon
                  className={cn(
                    "size-4.5",
                    isCustomDate
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground"
                  )}
                />
              </div>
              <div className="flex flex-1 items-center pl-1">
                {isCustomDate ? (
                  <div className="flex flex-col items-start">
                    <span className="font-medium text-xs opacity-80">
                      {format(selectedDate, "EEEE", { locale: de })}
                    </span>
                    <span className="-mt-0.5 font-bold text-sm">
                      {format(selectedDate, "dd.MM", { locale: de })}
                    </span>
                  </div>
                ) : (
                  <span className="font-medium text-sm">Kalender</span>
                )}
              </div>
            </DaySelectorButton>
          </PopoverTrigger>
          <PopoverContent align="center" className="z-50 w-auto p-0">
            <Calendar
              captionLayout="dropdown"
              defaultMonth={selectedDate}
              mode="single"
              onSelect={handleSelectDate}
              selected={selectedDate}
            />
          </PopoverContent>
        </Popover>
      </div>
    </section>
  );
}

function DaySelectorButton({
  date,
  onClick,
  label,
  condition,
  className,
  children,
  ref,
}: {
  date: Date;
  condition: boolean;
  onClick?: () => void;
  label?: string;
  children?: React.ReactNode;
  className?: string;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <Button
      className={cn(
        "h-11 min-w-16 overflow-hidden p-0 transition-all",
        className,
        condition
          ? "bg-primary text-primary-foreground shadow-md"
          : "bg-background hover:bg-muted"
      )}
      onClick={onClick}
      ref={ref}
      variant={condition ? "default" : "outline"}
    >
      {children || (
        <div className="flex flex-col items-center">
          <span className="font-medium text-xs opacity-80">{label}</span>
          <span className="-mt-0.5 font-bold text-sm">
            {format(date, "dd.MM", { locale: de })}
          </span>
        </div>
      )}
    </Button>
  );
}
