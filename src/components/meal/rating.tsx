import { Star } from "lucide-react";

type RatingProps = {
  avgRating: number | null;
  ratingCount: number;
};
export function Rating({ avgRating, ratingCount }: RatingProps) {
  if (ratingCount === 0 || avgRating === null) {
    return null;
  }
  return (
    <div className="inline-flex h-9 items-center rounded-md border border-yellow-400 bg-yellow-50 px-2.5 py-1 font-semibold text-yellow-700">
      <Star className="relative mr-1.5 size-5 fill-yellow-400 text-yellow-400 drop-shadow-sm" />
      <div className="flex items-start">
        <span className="mr-1 font-bold text-lg">
          {avgRating.toFixed(1).replace(".", ",")}
        </span>
        <span className="text-sm text-yellow-700/70">({ratingCount})</span>
      </div>
    </div>
  );
}
