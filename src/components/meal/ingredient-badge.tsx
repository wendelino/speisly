"use client";

import { Beef, EggFried, Fish, Leaf, type LucideProps, X } from "lucide-react";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import {
  INGREDIENT_BADGE_BASE,
  INGREDIENT_STYLES,
  type IngredientType,
  visibleIngredientTypes,
} from "@/lib/ingredients";
import { cn } from "@/lib/utils";

const ICONS: Record<
  IngredientType,
  ForwardRefExoticComponent<
    Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>
  >
> = {
  vegan: Leaf,
  veggie: EggFried,
  meat: Beef,
  fish: Fish,
  notVeggie: Beef,
};

export const ingredientProps = Object.fromEntries(
  Object.entries(INGREDIENT_STYLES).map(([type, style]) => [
    type,
    { ...style, Icon: ICONS[type as IngredientType] },
  ])
) as Record<
  IngredientType,
  (typeof INGREDIENT_STYLES)[IngredientType] & {
    Icon: (typeof ICONS)[IngredientType];
  }
>;

type IngredientBadgeProps = {
  type: IngredientType;
  variant?: "default" | "filter";
  onClick?: () => void;
};

export function IngredientBadge({
  type,
  variant = "default",
  onClick,
}: IngredientBadgeProps) {
  const props = ingredientProps[type];
  const { Icon, label, tailwind } = props;

  const f = variant === "filter";

  return (
    <button
      className={cn(
        INGREDIENT_BADGE_BASE,
        tailwind,
        variant === "filter" &&
          "cursor-pointer border px-3 py-2 font-bold shadow-lg hover:bg-accent hover:text-accent-foreground"
      )}
      onClick={onClick}
      type="button"
    >
      {!f && <Icon className="size-3.5" />} {f ? "Nur " : null} {label}{" "}
      {f ? <X className="ml-1 size-4" /> : null}
    </button>
  );
}

export const IngredientsSmallView = ({ flags }: { flags: MealFlags }) => (
  <>
    {visibleIngredientTypes(flags).map((type) => (
      <IngredientBadge key={type} type={type} />
    ))}
  </>
);
