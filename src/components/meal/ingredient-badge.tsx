"use client";

import { Beef, EggFried, Fish, Leaf, type LucideProps, X } from "lucide-react";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import { cn } from "@/lib/utils";

type IngredientType = "vegan" | "veggie" | "meat" | "fish" | "notVeggie";

type ValueProps = {
  tailwind: string;
  label: string;
  chartColor: string;
  Icon: ForwardRefExoticComponent<
    Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>
  >;
};

export const ingredientProps: Record<IngredientType, ValueProps> = {
  vegan: {
    tailwind:
      "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 border border-green-200 dark:border-green-800",
    label: "Vegan",
    chartColor: "#16a34a", // green-600
    Icon: Leaf,
  },
  veggie: {
    tailwind:
      "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800",
    label: "Vegetarisch",
    chartColor: "#ca8a04", // yellow-600
    Icon: EggFried,
  },
  meat: {
    tailwind:
      "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400 border border-red-200 dark:border-red-800",
    label: "Fleisch",
    chartColor: "#dc2626", // red-600
    Icon: Beef,
  },
  fish: {
    tailwind:
      "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400 border border-blue-200 dark:border-blue-800",
    label: "Fisch",
    chartColor: "#2563eb", // blue-600
    Icon: Fish,
  },
  notVeggie: {
    tailwind:
      "bg-gray-50 text-gray-700 dark:bg-gray-950 dark:text-gray-400 border border-gray-200 dark:border-gray-800",
    label: "Tierischer Lab",
    chartColor: "#525252", // gray-600
    Icon: Beef,
  },
};

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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold text-xs",
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

export const IngredientsSmallView = ({ flags }: { flags: MealFlags }) => {
  const { isVegan, isVeggie, containsMeat, containsFish, notVeggie } = flags;

  const ingredients: {
    type: "vegan" | "veggie" | "meat" | "fish" | "notVeggie";
    show?: boolean;
  }[] = [
    { type: "vegan", show: isVegan },
    { type: "veggie", show: isVeggie && !isVegan },
    { type: "meat", show: containsMeat },
    { type: "fish", show: containsFish },
    { type: "notVeggie", show: notVeggie && !containsMeat },
  ];

  return (
    <>
      {ingredients
        .filter((ingredient) => ingredient.show)
        .map((ingredient) => (
          <IngredientBadge key={ingredient.type} type={ingredient.type} />
        ))}
    </>
  );
};
