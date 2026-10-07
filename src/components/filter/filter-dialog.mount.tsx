import { mountOnce } from "@/components/on-demand";
import { $filterDialogOpen } from "@/stores/ui";
import { FilterDialog } from "./filter-dialog";

export function openFilterDialog(mensen: Mensa[]): void {
  mountOnce("filter-dialog", () => <FilterDialog mensen={mensen} />);
  $filterDialogOpen.set(true);
}
