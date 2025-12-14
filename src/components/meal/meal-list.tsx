"use client";

import { MealCard } from "@/components/meal/meal-card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useFilters } from "@/contexts/filter-context";
import { InfoCard } from "../info-card";
import { EmptyState } from "./empty-state";
import { MensaHeader } from "./mensa-header";

type MealsListProps = {
  initialMeals: MensaMealGroup[];
  date?: Date;
};

export function MealsList({ initialMeals, date }: MealsListProps) {
  const { selectedMensen, showVeggie, showVegan } = useFilters();
  const dietFilterActive = showVeggie || showVegan;

  // Filter meals based on selected filters
  let filtered = initialMeals;

  // Filter by selected mensas
  if (selectedMensen.length > 0) {
    filtered = filtered.filter((mensaGroup) =>
      selectedMensen.includes(mensaGroup.id)
    );
  }

  // Remove mensa groups with no meals before applying diet filters
  // filtered = filtered.filter((mensaGroup) => mensaGroup.meals.length > 0);

  let filteredMeals: MensaMealGroup[] = [];
  let hiddenMealsByMensa: Record<string, number>;

  if (dietFilterActive) {
    hiddenMealsByMensa = {};

    filteredMeals = filtered.map((mensaGroup) => {
      const mealsAfterDiet = mensaGroup.meals.filter((meal) => {
        if (showVegan) {
          return meal.flags.isVegan;
        }
        if (showVeggie) {
          return meal.flags.isVeggie;
        }
        return true;
      });

      const hiddenMeals = mensaGroup.meals.length - mealsAfterDiet.length;

      if (hiddenMeals > 0) {
        hiddenMealsByMensa[mensaGroup.id] = hiddenMeals;
      }

      return {
        ...mensaGroup,
        meals: mealsAfterDiet,
      };
    });
  } else {
    filteredMeals = filtered;
    hiddenMealsByMensa = {};
  }

  if (initialMeals.length === 0) {
    return <EmptyState date={date} type="date" />;
  }
  if (filteredMeals.length === 0) {
    return <EmptyState type="filter" />;
  }

  return (
    <section className="container mx-auto pb-8" id="mealslist">
      {filteredMeals.map((mensaGroup) => {
        // Separate regular meals from 100g meals
        const regularMeals = mensaGroup.meals.filter((m) => !m.flags.isSmall);
        const portionMeals = mensaGroup.meals.filter((m) => m.flags.isSmall);
        const hiddenMealsForMensa = hiddenMealsByMensa[mensaGroup.id];
        const hasNoMeals = mensaGroup.meals.length === 0;

        return (
          <div key={mensaGroup.id}>
            <MensaHeader mensa={mensaGroup} />
            {hasNoMeals ? (
              <div className="py-4 pb-8">
                <InfoCard
                  className="mx-4 mt-4"
                  description={`${
                    hiddenMealsForMensa === 1
                      ? "1 Gericht wurde"
                      : `${hiddenMealsForMensa} Gerichte wurden`
                  } durch den Filter ausgeblendet.`}
                  icon="info"
                  size="sm"
                  title="Veggie/Vegan-Filter"
                />
              </div>
            ) : (
              <>
                {hiddenMealsForMensa > 0 ? (
                  <InfoCard
                    className="mx-4 mt-4"
                    description={`${
                      hiddenMealsForMensa === 1
                        ? "1 Gericht wurde"
                        : `${hiddenMealsForMensa} Gerichte wurden`
                    } durch den Filter ausgeblendet.`}
                    icon="info"
                    size="sm"
                    title="Veggie/Vegan-Filter"
                  />
                ) : null}
                <div className="space-y-4 pt-4 pb-4 sm:pb-16">
                  {regularMeals.length > 0 && (
                    <div className="grid gap-4 px-4 md:grid-cols-2 lg:grid-cols-3">
                      {regularMeals
                        .sort((b, a) => a.priceStud - b.priceStud)
                        .map((meal, index) => (
                          <MealCard
                            key={meal.id}
                            meal={meal}
                            priority={index < 3}
                          />
                        ))}
                    </div>
                  )}

                  {portionMeals.length > 0 && (
                    <div className=" ">
                      <Accordion className="w-full" collapsible type="single">
                        <AccordionItem
                          className="border-none"
                          value={`portion-meals-${mensaGroup.id}`}
                        >
                          <AccordionTrigger className="group rounded-lg px-4 py-3 transition-all duration-200 hover:no-underline">
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-base text-foreground">
                                Weitere Gerichte
                              </span>
                              <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-sm">
                                {portionMeals.length}
                              </span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-4 py-2">
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                              {portionMeals.map((meal) => (
                                <MealCard
                                  key={meal.id}
                                  meal={meal}
                                  priority={false}
                                />
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
