import { Star } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const MOODS = ["", "Naja …", "Geht so", "Ganz gut", "Lecker!", "Mega! 🤩"];

type StarRatingProps = {
  label: string;
  value: number | undefined;
  onChange: (value: number) => void;
  /** große Sterne mit Stimmungs-Text (für die Gesamtbewertung) */
  featured?: boolean;
};

/** Sterne-Eingabe (1–5) mit Hover-Vorschau */
export function StarRating({
  label,
  value = 0,
  onChange,
  featured = false,
}: StarRatingProps) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-3",
        featured
          ? "flex-col rounded-2xl bg-muted/60 px-4 py-4 sm:flex-row"
          : "px-1"
      )}
    >
      <div className={featured ? "text-center sm:text-left" : ""}>
        <p className={cn("font-semibold", featured ? "text-base" : "text-sm")}>
          {label}
        </p>
        {featured ? (
          <p className="h-5 text-muted-foreground text-sm">{MOODS[shown]}</p>
        ) : null}
      </div>
      <fieldset aria-label={label} className="flex">
        {[1, 2, 3, 4, 5].map((star) => {
          const on = star <= shown;
          return (
            <button
              aria-label={`${star} ${star === 1 ? "Stern" : "Sterne"}`}
              aria-pressed={star === value}
              className="rounded-full p-0.5 outline-none transition-transform duration-150 hover:scale-115 focus-visible:ring-[3px] focus-visible:ring-ring active:scale-90"
              key={star}
              onClick={() => onChange(star)}
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(0)}
              type="button"
            >
              <Star
                className={cn(
                  "transition-colors duration-150",
                  featured ? "size-8" : "size-6",
                  on ? "fill-gold text-gold" : "fill-card text-border"
                )}
              />
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
