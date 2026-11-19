import { describe, expect, test } from "bun:test";
import { findFlaggedWords, normalizeComment } from "./comment-filter";

describe("normalizeComment", () => {
  test("umlauts, leetspeak, repeated letters", () => {
    expect(normalizeComment("Schmeckt wie SCH3EEEIßE!!")).toBe(
      "schmeckt wie scheisse"
    );
  });
});

describe("findFlaggedWords", () => {
  test("vulgar words, insults and phrases are flagged", () => {
    expect(findFlaggedWords("Schmeckt wie Scheiße")).toContain("scheisse");
    expect(findFlaggedWords("Der Koch ist ein Vollidiot")).toEqual([
      "vollidiot",
    ]);
    expect(findFlaggedWords("die Kassiererin ist eine dumme Kuh")).toEqual([
      "dumme kuh",
    ]);
    expect(findFlaggedWords("what the fuck")).toEqual(["fuck"]);
  });

  test("long words also inside compounds", () => {
    expect(findFlaggedWords("Riesenarschloch an der Kasse")).toEqual([
      "arschloch",
    ]);
  });

  test("food, honest criticism and harmless compounds pass", () => {
    for (const text of [
      "Ochsenschwanzsuppe war top",
      "Die Entscheidung für Spargel war gut",
      "Hotdog mit Knacker, Kartoffelpuffer mit Apfelmus",
      "So ein Mist, kalt. Ätzend, nie wieder",
      "Das war verdammt lecker",
      "Marschverpflegung",
      "Cucumber salad, this sucks",
      "Klasse Pasta, Penne all'arrabbiata",
      "",
    ]) {
      expect(findFlaggedWords(text)).toEqual([]);
    }
  });
});
