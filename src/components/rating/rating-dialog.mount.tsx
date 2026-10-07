import { mountOnce } from "@/components/on-demand";
import { ConfirmProvider } from "@/components/ui/confirm";
import { Toaster } from "@/components/ui/toaster";
import { $ratingDialogOpen } from "@/stores/ui";
import { RatingDialog, type RatingDialogProps } from "./rating-dialog";

/** Lädt Dialog, Bestätigungsdialog und Toaster beim ersten Öffnen */
export function openRatingDialog(props: RatingDialogProps): void {
  mountOnce("rating-dialog", () => (
    <ConfirmProvider>
      <RatingDialog {...props} />
      <Toaster position="top-right" />
    </ConfirmProvider>
  ));
  $ratingDialogOpen.set(true);
}
