"use client";

import { format } from "date-fns";
import { Loader2, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { deleteRating, getUserRating, submitRating } from "@/actions/rating";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConsentProvider } from "@/lib/cookie/consent-provider";
import { confirm } from "@/lnio/components/alert";
import LoadingButton from "@/lnio/components/loading-button";
import { StarRating } from "@/lnio/components/star-rating";

type MealRatingDialogProps = {
  mealId: string;
  mensaMealId: string;
};

export function MealRatingDialog({
  mealId,
  mensaMealId,
}: MealRatingDialogProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<number>(0);
  const [valuePrice, setValuePrice] = useState<number | undefined>(undefined);
  const [valueQuantity, setValueQuantity] = useState<number | undefined>(
    undefined
  );
  const [valueTaste, setValueTaste] = useState<number | undefined>(undefined);
  const [comment, setComment] = useState("");
  const [hasExistingRating, setHasExistingRating] = useState<Date | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const loadExistingRating = async () => {
      setLoading(true);
      try {
        const existingRating = await getUserRating(mealId);
        if (existingRating) {
          setValue(existingRating.value);
          setValuePrice(existingRating.value_price ?? undefined);
          setValueQuantity(existingRating.value_quantity ?? undefined);
          setValueTaste(existingRating.value_taste ?? undefined);
          setComment(existingRating.comment ?? "");
          setHasExistingRating(existingRating.updatedAt);
        } else {
          // Reset form
          setValue(0);
          setValuePrice(undefined);
          setValueQuantity(undefined);
          setValueTaste(undefined);
          setComment("");
          setHasExistingRating(null);
        }
      } catch (error) {
        console.error("Error loading rating:", error);
      } finally {
        setLoading(false);
      }
    };
    loadExistingRating();
  }, [mealId]);

  const handleSubmit = async () => {
    if (value === 0) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitRating({
        mealId,
        mensaMealId,
        value,
        valuePrice,
        valueQuantity,
        valueTaste,
        comment,
      });

      if (result.success) {
        setHasExistingRating(result.updatedAt ?? null);
        setOpen(false);
        toast.success(result.message || "Bewertung gespeichert");
      } else {
        toast.error(result.message || "Fehler beim Speichern der Bewertung");
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
      const result = await deleteRating(mealId);

      if (result.success) {
        // Reset form
        setValue(0);
        setValuePrice(undefined);
        setValueQuantity(undefined);
        setValueTaste(undefined);
        setComment("");
        setHasExistingRating(null);
        setOpen(false);
        toast.success(result.message || "Bewertung gelöscht");
      } else {
        toast.error(result.message || "Fehler beim Löschen der Bewertung");
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
      <DialogTrigger asChild>
        <LoadingButton
          className="w-full flex-1 gap-2"
          loading={loading}
          variant={hasExistingRating ? "outline" : "default"}
        >
          <Star className="h-4 w-4" />
          {hasExistingRating ? "Bewertung aktualisieren" : "Jetzt bewerten"}
        </LoadingButton>
      </DialogTrigger>
      <DialogContent>
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
                  disabled={deleting || submitting || loading}
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
                disabled={submitting || value === 0 || loading || deleting}
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
