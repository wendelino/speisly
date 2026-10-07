import { actions } from "astro:actions";
import { format } from "date-fns";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConsentProvider } from "@/components/consent/consent-provider";
import { StarRating } from "@/components/rating/star-rating";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/ui/confirm";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { labelClass } from "@/components/ui/variants";
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
 * Bewertungs-Dialog. Der Trigger ist der statische Button aus
 * rating-button.astro; die eigene Bewertung kommt von dort (wurde bereits
 * geladen, falls Consent erteilt ist).
 */
export function RatingDialog({
  mealId,
  mensaMealId,
  existing,
  onChange,
}: RatingDialogProps) {
  const open = useAtom($ratingDialogOpen);
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
    <Drawer onOpenChange={setOpen} open={open}>
      <DrawerContent returnFocus="[data-rate-button]">
        <DrawerHeader>
          <DrawerTitle>Gericht bewerten</DrawerTitle>
          <DrawerDescription>
            Wie hat’s dir geschmeckt? Deine Sterne helfen allen beim Aussuchen.
          </DrawerDescription>
        </DrawerHeader>

        <ConsentProvider>
          <DrawerBody className="space-y-4">
            <StarRating
              featured
              label="Gesamtbewertung *"
              onChange={setValue}
              value={value}
            />
            <div className="space-y-3">
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
            </div>
            <div className="space-y-2 pt-1">
              <label className={labelClass} htmlFor="comment">
                Kommentar (optional)
              </label>
              <Input
                id="comment"
                maxLength={500}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Hat super geschmeckt, aber..."
                value={comment}
              />
            </div>
          </DrawerBody>

          <DrawerFooter className="gap-3">
            {hasExistingRating ? (
              <div className="flex items-center justify-between gap-2 rounded-2xl bg-muted/60 py-1.5 pr-1.5 pl-4">
                <p className="text-muted-foreground text-sm">
                  Deine Bewertung vom {format(hasExistingRating, "dd.MM.yyyy")}
                </p>
                <Button
                  aria-label="Bewertung löschen"
                  disabled={deleting || submitting}
                  onClick={handleDelete}
                  size="icon-sm"
                  variant="destructive"
                >
                  {deleting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
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
                disabled={value === 0 || deleting}
                loading={submitting}
                loadingText="Wird gespeichert..."
                onClick={handleSubmit}
              >
                Bewertung speichern
              </LoadingButton>
            </div>
          </DrawerFooter>
        </ConsentProvider>
      </DrawerContent>
    </Drawer>
  );
}
