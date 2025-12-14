import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getMealsForDate } from "@/actions/meals";
import DaySelector from "@/components/day-selector";
import { MealLoadingState } from "@/components/meal/loading-state";
import { MealsList } from "@/components/meal/meal-list";
import MensaFilter from "@/components/mensa-filter";
import { dateParamValidator } from "@/lib/utils";

export const revalidate = 1800;

export default async function DayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const p = await params;
  const date = dateParamValidator(p.date);

  if (!date) {
    return notFound();
  }

  return (
    <main className="bg-primary/5">
      <DaySelector initialDate={date.date} />
      <Suspense fallback={<MealLoadingState />}>
        <DayContent date={date.date} />
      </Suspense>
      <MensaFilter />
    </main>
  );
}

async function DayContent({ date }: { date: Date }) {
  const meals = await getMealsForDate({ date });
  return <MealsList date={date} initialMeals={meals} />;
}
