import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { and, eq } from "drizzle-orm";
import { todayBerlin } from "@/lib/dates";
import { mensaMeal } from "@/lib/db/schema/schema";
import { MAX_FAVORITES } from "@/lib/favorites";
import { FEEDBACK_MESSAGE } from "@/lib/feedback";
import { invalidateTags } from "@/server/cache";
import { TAG } from "@/server/cache-tags";
import { getOwnCommentState, setCommentLike } from "@/server/comment-likes";
import { hasConsent } from "@/server/consent";
import { db } from "@/server/db";
import { saveFeedback } from "@/server/feedback";
import { logError } from "@/server/log";
import { deleteMyData, getMyData } from "@/server/my-data";
import {
  deleteSubscription,
  isPushEndpoint,
  upsertSubscription,
} from "@/server/push";
import {
  setCommentStatus,
  setErrorResolved,
  setFeedbackDone,
} from "@/server/queries/admin";
import { getFavoriteMeals } from "@/server/queries/favorites";
import {
  RATE_LIMIT_MESSAGE,
  type RateLimitName,
  takeRateLimit,
} from "@/server/rate-limit";
import {
  deleteUserRating,
  getUserRating,
  upsertRating,
} from "@/server/ratings";
import {
  clearUserCookie,
  getOrCreateUser,
  getUserId,
  ipHash,
} from "@/server/user";

/**
 * Admin-Actions: die Middleware lässt sie nur mit Session durch
 * (src/middleware.ts), hier wird zur Sicherheit noch einmal geprüft
 */
function requireAdmin(locals: App.Locals) {
  if (!locals.admin) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "Nicht angemeldet",
    });
  }
}

/** `true`, wenn die Anfrage das Rate-Limit noch nicht erreicht hat */
const withinLimit = (
  name: RateLimitName,
  context: Parameters<typeof ipHash>[0]
) => takeRateLimit(name, ipHash(context));

/** Formularwert "true"/"false" (z.coerce.boolean macht aus "false" true) */
const flag = z.enum(["true", "false"]).transform((value) => value === "true");

const NO_CONSENT = "Bewertungen sind nur mit Cookie-Consent möglich";
const id = z.string().min(1).max(64);
const stars = z.number().int().min(1).max(5);

type RatingResult = { success: boolean; message: string; updatedAt?: Date };

/**
 * Astro Actions (POST /_actions/*, nie gecacht) für Feedback, Bewertungen
 * und den Admin-Bereich.
 */
export const server = {
  feedback: {
    submit: defineAction({
      input: z.object({
        message: z
          .string()
          .trim()
          .min(FEEDBACK_MESSAGE.min)
          .max(FEEDBACK_MESSAGE.max),
        email: z.email().max(255).optional(),
        type: z.enum(["contact", "feedback"]).default("feedback"),
      }),
      handler: async (input, context) => {
        if (!withinLimit("feedback", context)) {
          throw new ActionError({
            code: "TOO_MANY_REQUESTS",
            message: RATE_LIMIT_MESSAGE,
          });
        }
        try {
          await saveFeedback(input);
        } catch (error) {
          logError({
            message: "Error saving feedback",
            ctx: { error },
            source: "feedback",
          });
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Da ist etwas schiefgelaufen. Bitte versuch es noch einmal.",
          });
        }
      },
    }),
  },
  rating: {
    /** Eigene Bewertung (für Button-Beschriftung und Vorbelegung des Dialogs) */
    mine: defineAction({
      input: z.object({ mealId: id }),
      handler: async ({ mealId }, context) => {
        const userId = await getUserId(context);
        return userId ? await getUserRating(userId, mealId) : null;
      },
    }),

    submit: defineAction({
      input: z.object({
        mealId: id,
        mensaMealId: id,
        value: stars,
        valuePrice: stars.optional(),
        valueQuantity: stars.optional(),
        valueTaste: stars.optional(),
        comment: z.string().max(500).optional(),
      }),
      handler: async (input, context): Promise<RatingResult> => {
        try {
          if (!hasConsent(context.cookies)) {
            return { success: false, message: NO_CONSENT };
          }
          if (!withinLimit("rating", context)) {
            return { success: false, message: RATE_LIMIT_MESSAGE };
          }
          // Die Ausgabe muss zum Gericht gehören
          const [serving] = await db
            .select({ mensaId: mensaMeal.mensaId, date: mensaMeal.date })
            .from(mensaMeal)
            .where(
              and(
                eq(mensaMeal.id, input.mensaMealId),
                eq(mensaMeal.mealId, input.mealId)
              )
            )
            .limit(1);
          if (!serving) {
            return {
              success: false,
              message: "Fehler beim Speichern der Bewertung",
            };
          }
          const userId = await getOrCreateUser(context);
          const result = await upsertRating(userId, input, serving);
          await invalidateTags(context.cache, [TAG.ratings(input.mealId)], {
            settle: true,
          });
          return {
            success: true,
            message:
              result === "created"
                ? "Bewertung erstellt"
                : "Bewertung aktualisiert",
            updatedAt: new Date(),
          };
        } catch (error) {
          logError({
            message: "Error submitting rating",
            ctx: { mealId: input.mealId, error },
            source: "ratings",
            notify: false,
          });
          return {
            success: false,
            message: "Fehler beim Speichern der Bewertung",
          };
        }
      },
    }),

    delete: defineAction({
      input: z.object({ mealId: id }),
      handler: async ({ mealId }, context): Promise<RatingResult> => {
        try {
          if (!hasConsent(context.cookies)) {
            return { success: false, message: NO_CONSENT };
          }
          if (!withinLimit("rating", context)) {
            return { success: false, message: RATE_LIMIT_MESSAGE };
          }
          const userId = await getUserId(context);
          if (!userId) {
            return { success: false, message: "Keine Bewertung gefunden" };
          }
          if (!(await deleteUserRating(userId, mealId))) {
            return {
              success: false,
              message: "Fehler beim Löschen der Bewertung",
            };
          }
          await invalidateTags(context.cache, [TAG.ratings(mealId)], {
            settle: true,
          });
          return { success: true, message: "Bewertung gelöscht" };
        } catch (error) {
          logError({
            message: "Error deleting rating",
            ctx: { mealId, error },
            source: "ratings",
            notify: false,
          });
          return {
            success: false,
            message: "Fehler beim Löschen der Bewertung",
          };
        }
      },
    }),
  },
  comments: {
    /** Eigene Likes und eigener Kommentar eines Gerichts (Zustand der Herzen) */
    mine: defineAction({
      input: z.object({ mealId: id }),
      handler: async ({ mealId }, context) => {
        const userId = await getUserId(context);
        return userId
          ? await getOwnCommentState(userId, mealId)
          : { liked: [], own: null };
      },
    }),

    like: defineAction({
      input: z.object({ ratingId: id, liked: z.boolean() }),
      handler: async (
        { ratingId, liked },
        context
      ): Promise<{ success: boolean; message?: string; likes?: number }> => {
        if (!hasConsent(context.cookies)) {
          return {
            success: false,
            message: "Liken ist nur mit Cookie-Consent möglich",
          };
        }
        if (!withinLimit("like", context)) {
          return { success: false, message: RATE_LIMIT_MESSAGE };
        }
        try {
          const userId = await getOrCreateUser(context);
          const result = await setCommentLike(userId, ratingId, liked);
          if (!result.ok) {
            return {
              success: false,
              message:
                result.reason === "own"
                  ? "Den eigenen Kommentar kannst du nicht liken"
                  : "Kommentar nicht gefunden",
            };
          }
          await invalidateTags(context.cache, [TAG.comments(result.mealId)], {
            settle: true,
          });
          return { success: true, likes: result.likes };
        } catch (error) {
          logError({
            message: "Error liking comment",
            ctx: { ratingId, error },
            source: "ratings",
            notify: false,
          });
          return { success: false, message: "Das hat nicht geklappt" };
        }
      },
    }),
  },
  favorites: {
    /** Lieblingsgerichte mit nächstem Termin (/favoriten) */
    list: defineAction({
      input: z.object({ ids: z.array(id).max(MAX_FAVORITES) }),
      handler: ({ ids }, context) => {
        if (!withinLimit("read", context)) {
          throw new ActionError({
            code: "TOO_MANY_REQUESTS",
            message: RATE_LIMIT_MESSAGE,
          });
        }
        return getFavoriteMeals([...new Set(ids)], todayBerlin());
      },
    }),
  },
  push: {
    subscribe: defineAction({
      input: z.object({
        endpoint: z
          .url()
          .max(1000)
          .refine(isPushEndpoint, "Unbekannter Push-Dienst"),
        keys: z.object({
          p256dh: z.string().min(1).max(255),
          auth: z.string().min(1).max(255),
        }),
        favorites: z.array(id).max(MAX_FAVORITES),
        mensaIds: z.array(id).max(50),
      }),
      handler: async (input, context) => {
        if (!withinLimit("push", context)) {
          return { success: false, message: RATE_LIMIT_MESSAGE };
        }
        try {
          await upsertSubscription(input);
          return { success: true };
        } catch (error) {
          logError({
            message: "Error saving push subscription",
            ctx: { error },
            source: "push",
            notify: false,
          });
          return { success: false, message: "Das hat nicht geklappt" };
        }
      },
    }),
    unsubscribe: defineAction({
      input: z.object({ endpoint: z.url().max(1000) }),
      handler: async ({ endpoint }, context) => {
        if (!withinLimit("push", context)) {
          return { success: false };
        }
        await deleteSubscription(endpoint);
        return { success: true };
      },
    }),
  },
  me: {
    /** Alles, was unter der Kennung dieses Browsers gespeichert ist (/meine-daten) */
    data: defineAction({
      handler: async (_input, context) => {
        if (!withinLimit("read", context)) {
          throw new ActionError({
            code: "TOO_MANY_REQUESTS",
            message: RATE_LIMIT_MESSAGE,
          });
        }
        const userId = await getUserId(context);
        return userId ? await getMyData(userId) : null;
      },
    }),

    /** Löscht Nutzer, Bewertungen, Kommentare und Likes (Art. 17 DSGVO) */
    delete: defineAction({
      handler: async (
        _input,
        context
      ): Promise<{ success: boolean; message?: string }> => {
        if (!withinLimit("rating", context)) {
          return { success: false, message: RATE_LIMIT_MESSAGE };
        }
        const userId = await getUserId(context);
        if (!userId) {
          return { success: true };
        }
        try {
          const tags = await deleteMyData(userId);
          clearUserCookie(context);
          if (tags) {
            await invalidateTags(context.cache, tags, { settle: true });
          }
          return { success: true };
        } catch (error) {
          logError({
            message: "Error deleting user data",
            ctx: { error },
            source: "ratings",
            notify: false,
          });
          return {
            success: false,
            message:
              "Das hat nicht geklappt. Bitte versuch es später noch einmal.",
          };
        }
      },
    }),
  },
  admin: {
    setErrorResolved: defineAction({
      accept: "form",
      input: z.object({ id, resolved: flag }),
      handler: async ({ id: errorId, resolved }, context) => {
        requireAdmin(context.locals);
        return { updated: await setErrorResolved(errorId, resolved) };
      },
    }),
    setFeedbackDone: defineAction({
      accept: "form",
      input: z.object({ id, done: flag }),
      handler: async ({ id: feedbackId, done }, context) => {
        requireAdmin(context.locals);
        return { updated: await setFeedbackDone(feedbackId, done) };
      },
    }),
    setCommentStatus: defineAction({
      accept: "form",
      input: z.object({
        id,
        status: z.enum(["pending", "approved", "rejected"]),
      }),
      handler: async ({ id: ratingId, status }, context) => {
        requireAdmin(context.locals);
        const mealId = await setCommentStatus(ratingId, status);
        // Detailseite zeigt freigegebene Kommentare (das OG-Bild nicht)
        if (mealId) {
          await invalidateTags(context.cache, [TAG.comments(mealId)], {
            settle: true,
          });
        }
        return { updated: mealId !== null };
      },
    }),
  },
};
