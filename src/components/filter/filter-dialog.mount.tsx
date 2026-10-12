import { mountOnce } from "@/components/on-demand";
import { $filterDialogOpen } from "@/stores/ui";
import { FilterDialog } from "./filter-dialog";

/** Rendert den Filter-Dialog geschlossen vorab, damit das erste Öffnen sofort geht */
export function mountFilterDialog(mensen: Mensa[]): void {
  mountOnce("filter-dialog", () => <FilterDialog mensen={mensen} />);
}

export function openFilterDialog(mensen: Mensa[]): void {
  mountFilterDialog(mensen);
  $filterDialogOpen.set(true);
}
