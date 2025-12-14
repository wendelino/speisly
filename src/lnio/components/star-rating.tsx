"use client";
import { Star } from "lucide-react";
import { Label } from "@/components/ui/label";

export const StarRating = ({
  value: ratingValue,
  onChange,
  label,
}: {
  value: number | undefined;
  onChange: (value: number) => void;
  label: string;
}) => {
  const currentValue = ratingValue || 0;
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <Label className="flex-1">{label}</Label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            className="focus:outline-none"
            key={star}
            onClick={() => onChange(star)}
            type="button"
          >
            <Star
              className={`size-6 transition-colors ${
                star <= currentValue
                  ? "fill-yellow-400 text-yellow-400"
                  : "fill-background text-muted-foreground"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
};
