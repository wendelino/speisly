import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { FEEDBACK_MESSAGE } from "@/lib/feedback";
import { saveFeedback } from "@/server/feedback";
import { logError } from "@/server/log";

/**
 * Astro Actions (POST /_actions/*, nie gecacht). Ersetzen die Next Server
 * Actions; die übrigen Dateien in diesem Ordner sind Altbestand bis Phase 5.
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
};
