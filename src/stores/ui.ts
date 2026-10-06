import { atom } from "nanostores";

/** Offen-Zustand der bei Bedarf geladenen React-Teile (Filter-Dialog, Kalender) */
export const $filterDialogOpen = atom(false);
export const $calendarOpen = atom(false);
export const $ratingDialogOpen = atom(false);
