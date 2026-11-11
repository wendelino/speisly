/**
 * Die 14 kennzeichnungspflichtigen Allergene (EU-Verordnung 1169/2011) mit
 * den Buchstabencodes des Studentenwerks Halle. Zutaten liegen als
 * `Code:Bezeichnung` vor (src/server/sync); Untergruppen tragen eine Ziffer
 * hinter dem Buchstaben (A1 Weizengluten, G3 Walnuss, …) und zählen zur
 * Gruppe des Buchstabens. Zahlen-Codes (45 Schwein, 52 vegan, …) sind
 * keine Allergene.
 */
export type AllergenCode =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N";

export type Allergen = { code: AllergenCode; label: string; hint?: string };

export const ALLERGENS: readonly Allergen[] = [
  { code: "A", label: "Gluten", hint: "Weizen, Roggen, Gerste, Hafer, Dinkel" },
  { code: "B", label: "Krebstiere" },
  { code: "C", label: "Ei" },
  { code: "D", label: "Erdnüsse" },
  { code: "E", label: "Soja" },
  { code: "F", label: "Milch", hint: "inkl. Laktose" },
  { code: "G", label: "Schalenfrüchte", hint: "Mandeln, Walnüsse, Cashew, …" },
  { code: "H", label: "Sellerie" },
  { code: "I", label: "Senf" },
  { code: "J", label: "Sesam" },
  { code: "K", label: "Sulfite" },
  { code: "L", label: "Lupine" },
  { code: "M", label: "Weichtiere" },
  { code: "N", label: "Fisch" },
];

const CODE = /^([A-N])\d?:/;
const VALID = new Set<string>(ALLERGENS.map((a) => a.code));

export function isAllergenCode(value: string): value is AllergenCode {
  return VALID.has(value);
}

/** Allergen-Gruppen eines Gerichts (sortiert, ohne Duplikate), z. B. ["A", "F"] */
export function allergenGroups(ingredients: readonly string[]): AllergenCode[] {
  const groups = new Set<AllergenCode>();
  for (const ingredient of ingredients) {
    const match = CODE.exec(ingredient);
    if (match) {
      groups.add(match[1] as AllergenCode);
    }
  }
  return [...groups].sort();
}

/** Nur gültige Codes, sortiert und ohne Duplikate (z. B. aus einem Cookie) */
export function normalizeAllergenCodes(
  values: readonly unknown[]
): AllergenCode[] {
  const codes = new Set<AllergenCode>();
  for (const value of values) {
    if (typeof value === "string" && isAllergenCode(value)) {
      codes.add(value);
    }
  }
  return [...codes].sort();
}
