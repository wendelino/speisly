import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { and, eq } from "drizzle-orm";
import { mensaMeal } from "@/lib/db/schema/schema";
import { FEEDBACK_MESSAGE } from "@/lib/feedback";
import { invalidateTags } from "@/server/cache";
import { TAG } from "@/server/cache-tags";
import { hasConsent } from "@/server/consent";
import { db } from "@/server/db";
import { saveFeedback } from "@/server/feedback";
import { logError } from "@/server/log";
import {
  deleteUserRating,
  getUserRating,
  upsertRating,
} from "@/server/ratings";
import { getOrCreateUser, getUserId } from "@/server/user";

const NO_CONSENT = "Bewertungen sind nur mit Cookie-Consent möglich";
const id = z.string().min(1).max(64);
const stars = z.number().int().min(1).max(5);

type RatingResult = { success: boolean; message: string; updatedAt?: Date };

/**
 * Astro Actions (POST /_actions/*, nie gecacht). Ersetzen die Next Server
 * Actions. Rückgabeformate und Meldungen der Bewertungen wie bisher.
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
      }),
      handler: async (input) => {
        try {
          await saveFeedback(input);
        } catch (error) {
          logError({ message: "Error saving feedback", ctx: { error } });
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Ups, da ist etwas schiefgelaufen. Versuch's doch bitte nochmal! 😅",
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
          // Die Ausgabe muss zum Gericht gehören
          const [serving] = await db
            .select({ id: mensaMeal.id })
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
          const result = await upsertRating(userId, input);
          await invalidateTags(context.cache, [TAG.ratings(input.mealId)]);
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
            disableTelegram: true,
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
          await invalidateTags(context.cache, [TAG.ratings(mealId)]);
          return { success: true, message: "Bewertung gelöscht" };
        } catch (error) {
          logError({
            message: "Error deleting rating",
            ctx: { mealId, error },
            disableTelegram: true,
          });
          return {
            success: false,
            message: "Fehler beim Löschen der Bewertung",
          };
        }
      },
    }),
  },
};
