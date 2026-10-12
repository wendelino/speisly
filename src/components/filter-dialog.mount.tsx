import { $filterDialogOpen } from "@/stores/ui";
import { FilterDialog } from "./filter-dialog";
import { mountOnce } from "./on-demand";

/** Dialog geschlossen vorrendern, damit das Öffnen sofort reagiert */
export function prepareFilterDialog(mensen: Mensa[]): void {
  mountOnce("filter-dialog", () => <FilterDialog mensen={mensen} />);
}

export function openFilterDialog(mensen: Mensa[]): void {
  prepareFilterDialog(mensen);
  $filterDialogOpen.set(true);
}
