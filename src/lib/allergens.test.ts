import { describe, expect, test } from "bun:test";
import {
  ALLERGENS,
  allergenGroups,
  isAllergenCode,
  normalizeAllergenCodes,
} from "./allergens";

describe("allergenGroups", () => {
  test("maps sub codes to their group and dedupes", () => {
    expect(
      allergenGroups([
        "A1:enthält Weizengluten",
        "A3:enthält Hafergluten",
        "F:enthält Milch (einschließlich Laktose)",
        "G2:enthält Mandeln",
        "G3:enthält Wallnuss",
      ])
    ).toEqual(["A", "F", "G"]);
  });

  test("ignores numeric markers and unknown codes", () => {
    expect(
      allergenGroups(["45:Schwein", "52:vegan", "X:irgendwas", "Z1:nix"])
    ).toEqual([]);
  });

  test("returns sorted codes", () => {
    expect(allergenGroups(["N:enthält Fisch", "C:enthält Ei"])).toEqual([
      "C",
      "N",
    ]);
  });

  test("empty input", () => {
    expect(allergenGroups([])).toEqual([]);
  });
});

describe("normalizeAllergenCodes", () => {
  test("drops invalid values and duplicates", () => {
    expect(normalizeAllergenCodes(["F", 1, "A", "F", "x", null, "Z"])).toEqual([
      "A",
      "F",
    ]);
  });
});

describe("ALLERGENS", () => {
  test("covers A to N exactly once", () => {
    const codes = ALLERGENS.map((a) => a.code);
    expect(codes.join("")).toBe("ABCDEFGHIJKLMN");
    for (const code of codes) {
      expect(isAllergenCode(code)).toBe(true);
    }
    expect(isAllergenCode("O")).toBe(false);
  });
});
