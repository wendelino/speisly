declare type MealFlags = {
  isVegan?: boolean;
  isVeggie?: boolean;
  containsMeat?: boolean;
  containsFish?: boolean;
  notVeggie?: boolean;
  isSmall: boolean;
};

/** Gericht einer Ausgabe (Mensa + Tag) */
declare type Meal = {
  id: string;
  mensaMealId: string;
  name: string;
  subtitle: string;
  imgPath: string | null;
  ingredients: string[];
  extras: string[];
  priceStud: number;
  priceWork: number;
  priceGuest: number;
  flags: MealFlags;
};

declare type Mensa = {
  id: string;
  name: string;
  slug: string;
};
declare type MensaMealGroup = Mensa & {
  meals: Meal[];
};

declare type MealRatingStats = {
  ratingCount: number;
  avgRating: {
    value: number | null;
    value_price: number | null;
    value_quantity: number | null;
    value_taste: number | null;
  };
};

// biome-ignore lint/style/noNamespace: so erweitert Astro die Locals
declare namespace App {
  // biome-ignore lint/style/useConsistentTypeDefinitions: Declaration Merging braucht ein Interface
  interface Locals {
    /** angemeldeter Admin (src/middleware.ts), nur unter /admin gesetzt */
    admin?: import("@/server/admin-auth").AdminSession;
  }
}
