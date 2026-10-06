// Date range types
export type DateRange = {
  from: string;
  to: string;
};

export type DateInput = string | DateRange;

// Meal data types
export type MealAvailability = {
  src_mensaId: string;
  mensaSlug: string;
  mensaName: string;
  date: string;
  ingredients: string[];
  extras: string[];
};

export type MealData = {
  src_id: string;
  name: string;
  subtitle: string;
  imgPath: string | null;
  priceStud: number;
  priceWork: number;
  priceGuest: number;
  availability: MealAvailability[];
};

// Database record types
export type MealRecord = {
  id: string;
  name: string;
  imgPath: string | null;
  priceStud: number;
  priceWork: number;
  priceGuest: number;
  subtitle: string;
};

export type MensaRecord = {
  id: string;
  slug: string;
  name: string;
};

export type MensaMealRecord = {
  id: string;
  mensaId: string;
  mealId: string;
  date: Date;
  ingredients: string[];
  extras: string[];
};

export type DataSourceRecord = {
  slug: string;
};

// API types (Meine Mensa API)
export type MeineMensaFoodData = {
  id: number;
  name: string;
  name_2: string | null;
  ingredients: string[];
  price_1: number;
  price_2: number;
  price_3: number;
  extra_1: string;
  extra_2: string;
  extra_3: string;
  extra_4: string;
  image_url: string | null;
};

export type MeineMensaResponseMeta = {
  ingredients: Record<string, string>;
  markers: Record<string, string>;
};

export type MeineMensaFoodPlanItem = {
  id: number;
  date: string;
  counter_id: number;
  location_id: number;
  is_sprint: boolean;
  food: MeineMensaFoodData;
};

export type MeineMensaResponse = {
  data: MeineMensaFoodPlanItem[];
  meta: MeineMensaResponseMeta;
};

export type Location = {
  id: number;
  name: string;
};

// Function parameter types
export type GetMealDataParams = {
  date: DateInput;
  locationId?: string;
};

export type GetOrCreateMealParams = {
  mealData: MealData;
  dataSourceSlug: string;
  initialMeal?: MealRecord;
};

export type GetOrCreateMensaMealParams = {
  mensaRecord: { id: string };
  mealRecord: { id: string };
  availability: {
    date: string;
    ingredients: string[];
    extras: string[];
  };
  existing?: MensaMealRecord;
};

export type GetExistingMensaMealsParams = {
  date: DateInput;
};

// Function return types
export type GetMealDataResult = {
  data: MealData[];
  length: number;
};

export type MealUpdateLog = {
  prev: string;
  new: string;
  key: string;
};

// Constants
export const MEAL_SRC_ID_MAPPINGS: Record<number, string> = {
  835: "apfel_strudel",
  1883: "apfel_strudel",
  1522: "pp_burger",
  1492: "pp_burger",
  1614: "k_suppe",
  1641: "k_suppe",
} as const;

export const MEINE_MENSA_BASE_URL = "https://meine-mensa.de/api" as const;
export const DATA_SOURCE_NAME = "Meine Mensa API" as const;
