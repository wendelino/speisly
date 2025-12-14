import { ViewTransition } from "react";
import Title from "../title";
import { Badge } from "../ui/badge";
import { IngredientsSmallView } from "./ingredient-badge";
import { IngredientsList } from "./ingredients-list";
import { MealImage, MealPrice, MealTitle } from "./meal-comp";
import { RatingStats } from "./rating-stats";

export function MealDetail({ meal, mensaMealId }: MealDetailProps) {
  return (
    <div className="space-y-6">
      <MealTitle
        h1
        mmid={mensaMealId}
        name={meal.name}
        subtitle={meal.subtitle}
      />
      <div className="px-8 py-2">
        <MealImage
          alt={meal.name}
          className="mx-auto w-full max-w-sm"
          priority={true}
          sizes="(max-width: 768px) 100vw, 768px"
          src={meal.imgPath}
          view="detail"
          viewId={mensaMealId}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <ViewTransition name={`meal-ingredients-${mensaMealId}`}>
          <IngredientsSmallView flags={meal.flags} />
        </ViewTransition>
      </div>
      <div className="border-t pt-4">
        <MealPrice expanded={true} meal={meal} viewId={mensaMealId} />
      </div>

      <RatingStats meal={meal} mensaMealId={mensaMealId} />

      {meal.extras.length > 0 ? (
        <>
          <Title variant="h2">Beilagen</Title>
          <ul className="flex flex-wrap gap-3">
            {meal.extras.map((extra) => (
              <li key={extra}>
                <Badge
                  className="border border-primary bg-primary/10 px-4 py-1 font-medium text-sm"
                  variant="secondary"
                >
                  {extra}
                </Badge>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <Title variant="h2">Inhaltsstoffe</Title>
      <IngredientsList ingredients={meal.ingredients} />
    </div>
  );
}
