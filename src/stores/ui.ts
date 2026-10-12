import { atom } from "nanostores";

/** Offen-Zustand der bei Bedarf geladenen Dialoge (components/on-demand.tsx) */
export const $filterDialogOpen = atom(false);
export const $calendarOpen = atom(false);
export const $ratingDialogOpen = atom(false);
export const $cookiePreferencesOpen = atom(false);
