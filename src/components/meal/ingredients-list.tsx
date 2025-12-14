"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";

type IngredientsListProps = {
  ingredients: string[] | null | undefined;
  maxVisible?: number;
};

export function IngredientsList({ ingredients }: IngredientsListProps) {
  // Handle null, undefined, or empty array
  if (!ingredients || ingredients.length === 0) {
    return null;
  }

  return (
    <div>
      <ul className="w-full space-y-2">
        {ingredients.map((ingredient) => {
          const [code, name] = ingredient.split(":");
          return (
            <li className="flex items-center gap-1" key={ingredient}>
              <Badge
                className="min-w-10 text-center font-mono font-semibold"
                variant="outline"
              >
                {code}
              </Badge>
              <p className="text-sm">{name}</p>
            </li>
          );
        })}
      </ul>
      <Link
        className="flex items-center gap-1 pt-4 text-primary text-sm underline"
        href="https://studentenwerk-halle.de/mensen-cafebars/kennzeichnungspflichtige-zusatzstoffe-und-allergene/#c639"
        target="_blank"
      >
        Weitere Informationen über die Inhaltsstoffe
      </Link>
    </div>
  );
}
