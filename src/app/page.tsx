import { Suspense } from "react";
import { getMealsForDate } from "@/actions/meals";
import DaySelector from "@/components/day-selector";
import { AppHeroVariant } from "@/components/layout/app-hero";
import { MealLoadingState } from "@/components/meal/loading-state";
import { MealsList } from "@/components/meal/meal-list";
import MensaFilter from "@/components/mensa-filter";

export const revalidate = 1800; // ISR: Regenerate every 30 minutes

export default async function Page() {
  return (
    <main className="bg-primary/5">
      <AppHeroVariant />
      <DaySelector />
      <Suspense fallback={<MealLoadingState />}>
        <Content />
      </Suspense>
      <MensaFilter />
    </main>
  );
}

async function Content() {
  const date = new Date();
  const meals = await getMealsForDate({ date });
  return <MealsList date={date} initialMeals={meals} />;
}
