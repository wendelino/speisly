import { mountOnce } from "@/components/on-demand";
import { AlertProvider } from "@/lnio/components/alert";
import ToastProvider from "@/lnio/components/toast/provider";
import { $ratingDialogOpen } from "@/stores/ui";
import { RatingDialog, type RatingDialogProps } from "./rating-dialog";

/** Lädt Dialog, Bestätigungsdialog und Toaster beim ersten Öffnen */
export function openRatingDialog(props: RatingDialogProps): void {
  mountOnce("rating-dialog", () => (
    <AlertProvider>
      <RatingDialog {...props} />
      <ToastProvider position="top-right" />
    </AlertProvider>
  ));
  $ratingDialogOpen.set(true);
}
