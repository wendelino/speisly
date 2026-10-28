import { feedback } from "@/lib/db/schema/feedback";
import { genId } from "@/lib/db/utils";
import { db } from "./db";
import { logError } from "./log";
import { sendTelegramMessage } from "./telegram";

/**
 * Speichert Feedback bzw. eine Kontaktanfrage. Die Telegram-Benachrichtigung
 * läuft im Hintergrund: Schlägt sie fehl, ist die Nachricht trotzdem
 * gespeichert und der Nutzer bekommt keinen Fehler angezeigt.
 */
export async function saveFeedback({
  message,
  email,
  type = "feedback",
}: {
  message: string;
  email?: string;
  type?: "contact" | "feedback";
}): Promise<void> {
  await db.insert(feedback).values({ id: genId(), message, email, type });

  const label = type === "contact" ? "Kontaktanfrage" : "Feedback";
  const from = email ? ` von ${email}` : "";
  sendTelegramMessage(`${label}${from}:\n${message}`).catch(
    (error: unknown) => {
      logError({
        message: "Failed to forward feedback to Telegram",
        ctx: { error },
        source: "feedback",
        notify: false,
      });
    }
  );
}
