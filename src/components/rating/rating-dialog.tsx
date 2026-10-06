import { actions } from "astro:actions";
import { format } from "date-fns";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConsentProvider } from "@/lib/cookie/consent-provider";
import { confirm } from "@/lnio/components/alert";
import LoadingButton from "@/lnio/components/loading-button";
import { StarRating } from "@/lnio/components/star-rating";
import { $ratingDialogOpen } from "@/stores/ui";
import { useAtom } from "@/stores/use-atom";

export type ExistingRating = {
  value: number;
  value_price: number | null;
  value_quantity: number | null;
  value_taste: number | null;
  comment: string | null;
  updatedAt: Date;
};

export type RatingDialogProps = {
  mealId: string;
  mensaMealId: string;
  existing: ExistingRating | null;
  /** nach Speichern (neue Bewertung) bzw. Löschen (null) */
  onChange: (rating: ExistingRating | null) => void;
};

/**
 * Bewertungs-Dialog (Inhalt unverändert aus meal-rating.tsx). Der Trigger ist
 * der statische Button aus rating-button.astro; die eigene Bewertung kommt von
 * dort (wurde bereits geladen, falls Consent erteilt ist).
 */
export function RatingDialog({
  mealId,
  mensaMealId,
  existing,
  onChange,
}: RatingDialogProps) {
  const open = useAtom($ratingDialogOpen, false);
  const [submitting, setSubmitting] = useState(false);
  const [value, setValue] = useState<number>(existing?.value ?? 0);
  const [valuePrice, setValuePrice] = useState<number | undefined>(
    existing?.value_price ?? undefined
  );
  const [valueQuantity, setValueQuantity] = useState<number | undefined>(
    existing?.value_quantity ?? undefined
  );
  const [valueTaste, setValueTaste] = useState<number | undefined>(
    existing?.value_taste ?? undefined
  );
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [hasExistingRating, setHasExistingRating] = useState<Date | null>(
    existing?.updatedAt ?? null
  );
  const [deleting, setDeleting] = useState(false);

  const setOpen = (next: boolean) => $ratingDialogOpen.set(next);

  const resetForm = () => {
    setValue(0);
    setValuePrice(undefined);
    setValueQuantity(undefined);
    setValueTaste(undefined);
    setComment("");
    setHasExistingRating(null);
  };

  const handleSubmit = async () => {
    if (value === 0) {
      return;
    }

    setSubmitting(true);
    try {
      const { data: result, error } = await actions.rating.submit({
        mealId,
        mensaMealId,
        value,
        valuePrice,
        valueQuantity,
        valueTaste,
        comment,
      });

      if (result?.success) {
        const updatedAt = result.updatedAt ?? new Date();
        setHasExistingRating(updatedAt);
        setOpen(false);
        toast.success(result.message || "Bewertung gespeichert");
        onChange({
          value,
          value_price: valuePrice ?? null,
          value_quantity: valueQuantity ?? null,
          value_taste: valueTaste ?? null,
          comment,
          updatedAt,
        });
      } else {
        toast.error(
          result?.message ||
            error?.message ||
            "Fehler beim Speichern der Bewertung"
        );
      }
    } catch (error) {
      console.error("Error submitting rating:", error);
      toast.error("Fehler beim Speichern der Bewertung");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!(await confirm("Möchtest du deine Bewertung wirklich löschen?"))) {
      return;
    }

    setDeleting(true);
    try {
      const { data: result, error } = await actions.rating.delete({ mealId });

      if (result?.success) {
        resetForm();
        setOpen(false);
        toast.success(result.message || "Bewertung gelöscht");
        onChange(null);
      } else {
        toast.error(
          result?.message ||
            error?.message ||
            "Fehler beim Löschen der Bewertung"
        );
      }
    } catch (error) {
      console.error("Error deleting rating:", error);
      toast.error("Fehler beim Löschen der Bewertung");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          // kein Radix-Trigger vorhanden: Fokus zurück auf den Bewerten-Button
          event.preventDefault();
          document.querySelector<HTMLElement>("[data-rate-button]")?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Gericht bewerten</DialogTitle>
          <DialogDescription>
            Teile deine Meinung zu diesem Gericht mit uns.
          </DialogDescription>
        </DialogHeader>

        <ConsentProvider disableStyling>
          <div className="flex w-full flex-col items-center gap-2 space-y-6 py-4 sm:items-start">
            <StarRating
              label="Gesamtbewertung *"
              onChange={setValue}
              value={value}
            />

            <StarRating
              label="Preis-Leistung"
              onChange={setValuePrice}
              value={valuePrice}
            />

            <StarRating
              label="Menge"
              onChange={setValueQuantity}
              value={valueQuantity}
            />

            <StarRating
              label="Geschmack"
              onChange={setValueTaste}
              value={valueTaste}
            />

            <div className="w-full space-y-2">
              <Label htmlFor="comment">Kommentar (optional)</Label>
              <Input
                id="comment"
                maxLength={500}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Hat super geschmeckt, aber..."
                value={comment}
              />
            </div>
          </div>

          <DialogFooter className="flex-col">
            {hasExistingRating ? (
              <div className="flex items-center gap-2">
                <Button
                  className="gap-2"
                  disabled={deleting || submitting}
                  onClick={handleDelete}
                  size="icon-sm"
                  variant="destructive"
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
                <p className="text-muted-foreground text-sm">
                  Bewertung vom {format(hasExistingRating, "dd.MM.yyyy")}
                </p>
              </div>
            ) : null}
            <div className="flex w-full gap-2">
              <Button
                disabled={submitting || deleting}
                onClick={() => setOpen(false)}
                variant="outline"
              >
                Abbrechen
              </Button>
              <LoadingButton
                className="flex-1"
                disabled={submitting || value === 0 || deleting}
                loading={submitting}
                loadingText="Wird gespeichert..."
                onClick={handleSubmit}
              >
                Bewertung speichern
              </LoadingButton>
            </div>
          </DialogFooter>
        </ConsentProvider>
      </DialogContent>
    </Dialog>
  );
}
