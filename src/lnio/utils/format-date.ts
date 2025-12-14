import { format } from "date-fns";
import { de } from "date-fns/locale";

export type FormatString = "dd.MM.yy" | "EEEE, dd.MM.yy";

export const formatDay = (
  ctx: Date | string | undefined | null,
  formatStr: FormatString = "dd.MM.yy"
) => {
  if (!ctx) {
    return "Kein Datum verfügbar";
  }
  const d = new Date(ctx);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const diffDays = Math.floor(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) {
    return "Heute";
  }
  if (diffDays === -1) {
    return "Gestern";
  }
  if (diffDays === -2) {
    return "Vorgestern";
  }
  if (diffDays === 1) {
    return "Morgen";
  }
  if (diffDays === 2) {
    return "Übermorgen";
  }
  if (diffDays < -2 && diffDays > -7) {
    return `${format(d, "EEEE", { locale: de })}`;
  }

  return format(d, formatStr, { locale: de });
};

export const naturalDate = (ctx: Date | string | undefined | null) => {
  if (!ctx) {
    return "Kein Datum verfügbar";
  }
  const d = new Date(ctx);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const diffDays = Math.floor(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  const timeStr = format(d, "HH:mm");

  if (diffDays === 0) {
    return `Heute, ${timeStr}`;
  }
  if (diffDays === -1) {
    return `Gestern, ${timeStr}`;
  }
  if (diffDays === -2) {
    return `Vorgestern, ${timeStr}`;
  }
  if (diffDays === 1) {
    return `Morgen, ${timeStr}`;
  }
  if (diffDays === 2) {
    return `Übermorgen, ${timeStr}`;
  }
  if (diffDays < -2 && diffDays > -7) {
    return `${format(d, "EEEE", { locale: de })}, ${timeStr}`;
  }

  return format(d, "dd.MM.yy, ") + timeStr;
};

export const formatTime = (ctx: Date | string | undefined | null) => {
  if (!ctx) {
    return "XX:XX";
  }
  return format(new Date(ctx), "HH:mm");
};
