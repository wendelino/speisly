import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ViewTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { IngredientsSmallView } from "./ingredient-badge";
import { MealImage, MealPrice, MealTitle } from "./meal-comp";

type MealCardProps = {
  meal: Meal;
  priority?: boolean;
};

export function MealCard({ meal, priority = false }: MealCardProps) {
  return (
    <Link
      className="group block"
      href={`/meal/${meal.id}?mmid=${meal.mensaMealId}`}
    >
      <Card className="grid grid-cols-3 gap-4 border-none p-4 shadow-sm">
        {/* Image Section */}
        <MealImage
          alt={meal.name}
          className="h-full w-full rounded-lg object-contain p-1"
          // height={100}
          priority={priority}
          // sizes="(max-width: 640px) 100px, (max-width: 1024px) 120px, 150px"
          src={meal.imgPath}
          viewId={meal.mensaMealId}
          // width={133}
        />
        {/* Content Section */}
        <CardContent className="col-span-2 flex h-full flex-col justify-between gap-3 p-0">
          {/* Ingredients Badges */}
          <div className="flex flex-wrap gap-2">
            <ViewTransition name={`meal-ingredients-${meal.mensaMealId}`}>
              <IngredientsSmallView flags={meal.flags} />
            </ViewTransition>
          </div>
          {/* Title */}
          <MealTitle
            mmid={meal.mensaMealId}
            name={meal.name}
            subtitle={meal.subtitle}
          />

          {/* Footer with Price and Arrow */}
          <div className="mt-auto flex items-center justify-between">
            <MealPrice meal={meal} viewId={meal.mensaMealId} />
            <ArrowRight className="h-5 w-5 text-primary transition-all duration-300 group-hover:translate-x-1 group-hover:text-primary" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
