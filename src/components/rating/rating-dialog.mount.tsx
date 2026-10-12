import { mountOnce } from "@/components/on-demand";
import { ConfirmProvider } from "@/components/ui/confirm";
import { Toaster } from "@/components/ui/toaster";
import { $ratingDialogOpen } from "@/stores/ui";
import { RatingDialog, type RatingDialogProps } from "./rating-dialog";

/**
 * Rendert Dialog, Bestätigungsdialog und Toaster geschlossen vorab. Erst
 * aufrufen, wenn die eigene Bewertung feststeht: das Formular übernimmt
 * `existing` nur beim ersten Rendern.
 */
export function mountRatingDialog(props: RatingDialogProps): void {
  mountOnce("rating-dialog", () => (
    <ConfirmProvider>
      <RatingDialog {...props} />
      <Toaster position="top-right" />
    </ConfirmProvider>
  ));
}

export function openRatingDialog(props: RatingDialogProps): void {
  mountRatingDialog(props);
  $ratingDialogOpen.set(true);
}
