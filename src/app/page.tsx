import { Suspense } from "react";
import { getMealsForDate } from "@/actions/meals";
import DaySelector from "@/components/day-selector";
import { AppHeroVariant } from "@/components/layout/app-hero";
import { MealLoadingState } from "@/components/meal/loading-state";
import { MealsList } from "@/components/meal/meal-list";
import MensaFilter from "@/components/mensa-filter";

// Render per request so "today" is always the current date. A time-based
// static cache (ISR) would bake the generation-time date into the page and
// serve a stale day after the cache crosses midnight. Meal data itself is
// still cached via unstable_cache in getMealsForDate (keyed by date).
export const dynamic = "force-dynamic";

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
  // Use Berlin timezone to determine the correct local date, regardless of server TZ
  const now = new Date();
  const berlinDateStr = now.toLocaleDateString("en-CA", {
    timeZone: "Europe/Berlin",
  }); // "YYYY-MM-DD"
  const [year, month, day] = berlinDateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const meals = await getMealsForDate({ date });
  return <MealsList date={date} initialMeals={meals} />;
}
