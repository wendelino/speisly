import { $filterDialogOpen } from "@/stores/ui";
import { FilterDialog } from "./filter-dialog";
import { mountOnce } from "./on-demand";

export function openFilterDialog(mensen: Mensa[]): void {
  mountOnce("filter-dialog", () => <FilterDialog mensen={mensen} />);
  $filterDialogOpen.set(true);
}
