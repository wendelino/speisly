declare type MealFlags = {
  isVegan?: boolean;
  isVeggie?: boolean;
  containsMeat?: boolean;
  containsFish?: boolean;
  notVeggie?: boolean;
  isSmall: boolean;
};

declare type DB_Meal = {
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
  date: Date;
};

declare type Meal = DB_Meal & {
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

declare type DetailedMeal = Omit<Meal, "mensaMealId" | "date"> &
  MealRatingStats;

declare type MealDetailProps = {
  meal: DetailedMeal;
  mensaMealId?: string;
};
