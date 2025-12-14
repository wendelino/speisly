import { type ClassValue, clsx } from "clsx";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function formatPriceWithCurrency(cents: number): string {
  return `${formatPrice(cents)}€`;
}
export function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

type DateParamValidatorResult = {
  date: Date;
  dateString: string;
};

export function dateParamValidator(v: string): DateParamValidatorResult | null {
  if (!v) {
    return null;
  }
  if (v === "heute") {
    return {
      date: new Date(),
      dateString: "heute",
    };
  }
  try {
    const date = new Date(v);
    if (date.toString() === "Invalid Date") {
      return null;
    }
    return {
      date,
      dateString: format(date, "dd.MM.yyyy", { locale: de }),
    };
  } catch {
    return null;
  }
}
