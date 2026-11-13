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
  /** Durchschnitt aller Bewertungen des Gerichts (null: noch keine) */
  rating?: { value: number; count: number } | null;
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

/** Freigegebener Kommentar zu einer Bewertung (anonym) */
declare type MealComment = {
  id: string;
  value: number;
  comment: string;
  updatedAt: Date;
  /** Anzahl „Gefällt mir“ */
  likes: number;
};

/** Durchschnitt und Anzahl einer Gruppe von Bewertungen */
declare type RatingGroup = { value: number; count: number };

/** Bewertungen eines Gerichts nach Mensa und nach Ausgabe */
declare type MealRatingBreakdown = {
  byMensa: (RatingGroup & { mensaName: string })[];
  /** neueste Ausgaben zuerst (begrenzt) */
  byServing: (RatingGroup & { mensaName: string; date: string })[];
  /** Ausgaben mit Bewertungen insgesamt */
  servingCount: number;
};

// biome-ignore lint/style/noNamespace: so erweitert Astro die Locals
declare namespace App {
  // biome-ignore lint/style/useConsistentTypeDefinitions: Declaration Merging braucht ein Interface
  interface Locals {
    /** angemeldeter Admin (src/middleware.ts), nur unter /admin gesetzt */
    admin?: import("@/server/admin-auth").AdminSession;
  }
}

/** Von @astrojs/react injizierte Fast-Refresh-Preamble (lib/react-dev-preamble.ts) */
declare module "astro:scripts/before-hydration.js";
