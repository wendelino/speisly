import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import { meal, mealRating } from "@/lib/db/schema/schema";
import { notifyAdmins } from "./admin-notify";
import { invalidateTags } from "./cache";
import { TAG } from "./cache-tags";
import { db } from "./db";
import { logError } from "./log";
import {
  commentHash,
  type ModerationAction,
  signModerationToken,
  verifyModerationToken,
} from "./moderation-token";
import { type CommentStatus, setCommentStatus } from "./queries/admin";

/**
 * Kommentare, die der Wortfilter zurückhält (src/server/comment-filter.ts):
 * Admins bekommen sofort eine Benachrichtigung (Telegram + Push) mit
 * „Freigeben“/„Ablehnen“, die der Service Worker per POST /api/moderate
 * ausführt. Unauffällige Kommentare sind sofort öffentlich und melden nichts.
 */

const PREVIEW_LENGTH = 160;

/** Fire-and-forget nach dem Speichern einer Bewertung */
export function notifyHeldComment(input: {
  ratingId: string;
  mealId: string;
  comment: string;
  stars: number;
  /** Treffer im Wortfilter */
  words: string[];
}): void {
  send(input).catch((error: unknown) => {
    logError({
      message: "Comment notification failed",
      ctx: { ratingId: input.ratingId, error },
      source: "ratings",
      notify: false,
    });
  });
}

async function send({
  ratingId,
  mealId,
  comment,
  stars,
  words,
}: Parameters<typeof notifyHeldComment>[0]): Promise<void> {
  const [row] = await db
    .select({ name: meal.name })
    .from(meal)
    .where(eq(meal.id, mealId))
    .limit(1);
  const [approve, reject] = await Promise.all([
    signModerationToken(ratingId, comment, "approved"),
    signModerationToken(ratingId, comment, "rejected"),
  ]);
  const preview =
    comment.length > PREVIEW_LENGTH
      ? `${comment.slice(0, PREVIEW_LENGTH - 1)}…`
      : comment;
  await notifyAdmins({
    title: `Kommentar prüfen${row ? `: „${row.name}“` : ""} (${stars}★)`,
    body: `${preview}\nWortfilter: ${words.join(", ")}`,
    url: "/admin/comments",
    tag: `comment-${ratingId}`,
    actions: [
      { action: "approved", title: "Freigeben", token: approve },
      { action: "rejected", title: "Ablehnen", token: reject },
    ],
  });
}

/** Status setzen und die Detailseite des Gerichts neu rendern lassen */
export async function moderateComment(
  cache: APIContext["cache"],
  ratingId: string,
  status: CommentStatus
): Promise<boolean> {
  const mealId = await setCommentStatus(ratingId, status);
  // Detailseite zeigt freigegebene Kommentare (das OG-Bild nicht)
  if (mealId) {
    await invalidateTags(cache, [TAG.comments(mealId)], { settle: true });
  }
  return mealId !== null;
}

export type ModerateByTokenResult =
  | { ok: true; action: ModerationAction }
  | { ok: false; reason: "invalid" | "changed" | "gone" };

/** Aktion aus der Benachrichtigung: nur, solange der Text derselbe ist */
export async function moderateByToken(
  cache: APIContext["cache"],
  token: string
): Promise<ModerateByTokenResult> {
  const claim = await verifyModerationToken(token);
  if (!claim) {
    return { ok: false, reason: "invalid" };
  }
  const [row] = await db
    .select({ comment: mealRating.comment })
    .from(mealRating)
    .where(eq(mealRating.id, claim.ratingId))
    .limit(1);
  if (!row?.comment) {
    return { ok: false, reason: "gone" };
  }
  if (commentHash(row.comment) !== claim.hash) {
    return { ok: false, reason: "changed" };
  }
  const updated = await moderateComment(cache, claim.ratingId, claim.action);
  return updated
    ? { ok: true, action: claim.action }
    : { ok: false, reason: "gone" };
}
