import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findMeal } from "@/actions/meal";
import { MealDetail } from "@/components/meal/meal-detail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mealId: string }>;
}): Promise<Metadata> {
  const { mealId } = await params;
  const mealData = await findMeal({ mealId });

  if (!mealData) {
    return {
      title: "Gericht nicht gefunden",
    };
  }

  const ratingText = mealData.avgRating.value
    ? ` - ${mealData.avgRating.value}/5 ⭐ (${mealData.ratingCount} Bewertungen)`
    : "";

  const ingredientsText =
    mealData.ingredients.length > 0
      ? `Zutaten: ${mealData.ingredients.slice(0, 3).join(", ")}. `
      : "";

  const priceText = `Preise: Student ${(mealData.priceStud / 100).toFixed(2)}€, Mitarbeiter ${(mealData.priceWork / 100).toFixed(2)}€, Gast ${(mealData.priceGuest / 100).toFixed(2)}€.`;

  const description = `${mealData.name} in der Mensa. ${ingredientsText}${priceText}${ratingText}`;

  const imageConfig = mealData.imgPath
    ? [
        {
          url: mealData.imgPath,
          width: 1200,
          height: 630,
        },
      ]
    : [];

  return {
    title: mealData.name,
    description,
    openGraph: {
      title: mealData.name,
      description,
      images: imageConfig,
    },
    twitter: {
      title: mealData.name,
      description,
      images: imageConfig,
    },
  };
}

export const revalidate = 1800; // ISR: Regenerate every 30 minutes

export default async function MealPage({
  params,
  searchParams,
}: {
  params: Promise<{ mealId: string }>;
  searchParams: Promise<{ mmid?: string }>;
}) {
  const { mealId } = await params;
  const { mmid: mensaMealId } = await searchParams;

  const mealData = await findMeal({ mealId, mensaMealId });

  if (!mealData) {
    notFound();
  }

  return <MealDetail meal={mealData} mensaMealId={mensaMealId} />;
}
