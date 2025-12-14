import { Star } from "lucide-react";
import { MealRatingDialog } from "@/app/meal/meal-rating";
import Title from "../title";
import { Badge } from "../ui/badge";

type RatingItemProps = {
  label: string;
  value: number | null;
};

function RatingItem({ label, value }: RatingItemProps) {
  if (value === null) {
    return null;
  }

  const displayValue = value.toFixed(1).replace(".", ",");
  const fullStars = Math.floor(value);
  const hasHalfStar = value % 1 >= 0.5 && value < 5;

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="font-medium text-muted-foreground text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => {
            if (star <= fullStars) {
              // Voll gefüllter Stern
              return (
                <Star
                  className="size-4 fill-yellow-400 text-yellow-400"
                  key={star}
                />
              );
            }
            if (star === fullStars + 1 && hasHalfStar) {
              // Halb gefüllter Stern
              return (
                <div className="relative size-4" key={star}>
                  {/* Hintergrund: leerer Stern */}
                  <Star className="absolute size-4 fill-background text-muted-foreground" />
                  {/* Vordergrund: halb gefüllter Stern mit Clip-Path */}
                  <div
                    className="absolute overflow-hidden"
                    style={{ width: "50%", height: "100%" }}
                  >
                    <Star className="size-4 fill-yellow-400 text-yellow-400" />
                  </div>
                </div>
              );
            }
            // Leerer Stern
            return (
              <Star
                className="size-4 fill-background text-muted-foreground"
                key={star}
              />
            );
          })}
        </div>
        <span className="font-semibold text-sm tabular-nums">
          {displayValue}
        </span>
      </div>
    </div>
  );
}

export function RatingStats({ meal, mensaMealId }: MealDetailProps) {
  const { ratingCount, avgRating } = meal;

  return (
    <>
      <Title className="flex items-center gap-2" variant="h2">
        <Star className="size-4.5 fill-yellow-400 text-yellow-400" />
        <span className="font-semibold">Bewertungsübersicht</span>
      </Title>
      <div className="relative space-y-3 rounded-lg border bg-muted p-5">
        {ratingCount === 0 ? (
          <div className="p-4 text-center">
            <p className="text-muted-foreground text-sm">
              Noch keine Bewertungen vorhanden
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <Badge className="-top-2 -right-2 absolute font-semibold">
              {ratingCount} {ratingCount === 1 ? "Bewertung" : "Bewertungen"}
            </Badge>
            {avgRating.value !== null && (
              <RatingItem label="Gesamtbewertung" value={avgRating.value} />
            )}
            {avgRating.value_price !== null && (
              <RatingItem
                label="Preis-Leistung"
                value={avgRating.value_price}
              />
            )}
            {avgRating.value_quantity !== null && (
              <RatingItem label="Menge" value={avgRating.value_quantity} />
            )}
            {avgRating.value_taste !== null && (
              <RatingItem label="Geschmack" value={avgRating.value_taste} />
            )}
          </div>
        )}

        {mensaMealId ? (
          <MealRatingDialog mealId={meal.id} mensaMealId={mensaMealId} />
        ) : null}
      </div>
    </>
  );
}
