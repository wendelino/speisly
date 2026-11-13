import { describe, expect, test } from "bun:test";
import { buildNotifications, isPushEndpoint } from "./push";

const servings = [
  {
    mealId: "lasagne",
    mealName: "Lasagne",
    mensaId: "wb",
    mensaName: "Weinberg",
  },
  {
    mealId: "lasagne",
    mealName: "Lasagne",
    mensaId: "hs",
    mensaName: "Harzmensa",
  },
  { mealId: "curry", mealName: "Curry", mensaId: "hs", mensaName: "Harzmensa" },
  { mealId: "suppe", mealName: "Suppe", mensaId: "wb", mensaName: "Weinberg" },
];

describe("buildNotifications", () => {
  test("one notification per subscriber, listing mensen of the first match", () => {
    const [n] = buildNotifications(
      [{ id: "a", favorites: ["lasagne"], mensaIds: [] }],
      servings,
      "2026-11-14",
      "Morgen"
    );
    expect(n).toEqual({
      subscriptionId: "a",
      title: "Morgen gibt’s deinen Favoriten",
      body: "„Lasagne“ (Weinberg, Harzmensa)",
      url: "/day/2026-11-14",
    });
  });

  test("respects the mensa selection and summarizes further matches", () => {
    const result = buildNotifications(
      [
        { id: "a", favorites: ["lasagne", "curry", "suppe"], mensaIds: ["hs"] },
        { id: "b", favorites: ["lasagne", "curry", "suppe"], mensaIds: [] },
      ],
      servings,
      "2026-11-14",
      "Morgen"
    );
    expect(result[0].title).toBe("Morgen gibt’s 2 deiner Favoriten");
    expect(result[0].body).toBe("„Lasagne“ (Harzmensa) und „Curry“");
    expect(result[1].body).toBe(
      "„Lasagne“ (Weinberg, Harzmensa) und 2 weitere Favoriten"
    );
  });

  test("skips subscribers without matches", () => {
    expect(
      buildNotifications(
        [
          { id: "a", favorites: ["schnitzel"], mensaIds: [] },
          { id: "b", favorites: ["suppe"], mensaIds: ["hs"] },
        ],
        servings,
        "2026-11-14",
        "Morgen"
      )
    ).toEqual([]);
  });
});

describe("isPushEndpoint", () => {
  test("accepts the browsers' push services", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QAbc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) {
      expect(isPushEndpoint(url)).toBe(true);
    }
  });

  test("rejects everything else (no SSRF via subscriptions)", () => {
    for (const url of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://10.0.0.5/hook",
      "https://localhost/hook",
      "https://fcm.googleapis.com:8443/x",
      "https://evilgoogleapis.com/x",
      "https://googleapis.com.evil.example/x",
      "https://user:pw@fcm.googleapis.com/x",
      "not a url",
    ]) {
      expect(isPushEndpoint(url)).toBe(false);
    }
  });
});
