import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { feedback } from "@/lib/db/schema/feedback";
import { db } from "./db";
import { saveFeedback } from "./feedback";
import { escapeMarkdown } from "./telegram";

describe("escapeMarkdown", () => {
  test("escapes Telegram legacy Markdown characters", () => {
    expect(escapeMarkdown("a_b *c* `d` [e](f)")).toBe(
      "a\\_b \\*c\\* \\`d\\` \\[e](f)"
    );
    expect(escapeMarkdown("Ganz normaler Text.")).toBe("Ganz normaler Text.");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("saveFeedback (integration)", () => {
  test("stores the message even though Telegram is not configured", async () => {
    const message = `Test ${crypto.randomUUID()} mit _Markdown_`;
    await saveFeedback({ message, email: "test@speisly.de" });

    const rows = await db
      .select()
      .from(feedback)
      .where(eq(feedback.message, message));
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("test@speisly.de");

    await db.delete(feedback).where(eq(feedback.message, message));
  });
});
