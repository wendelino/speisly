import { errorLog } from "@/lib/db/schema/errorLog";
import { genId } from "@/lib/db/utils";
import { db } from "./db";
import { sendTelegramMessage } from "./telegram";

type LogErrorProps = {
  message: string;
  ctx: unknown;
  disableTelegram?: boolean;
};

/** `JSON.stringify(new Error())` ergibt `{}` – Errors lesbar serialisieren. */
function serialize(ctx: unknown): string {
  return JSON.stringify(ctx, (_key, value) =>
    value instanceof Error
      ? { name: value.name, message: value.message, stack: value.stack }
      : value
  );
}

/**
 * Loggt einen Fehler in die DB und optional per Telegram.
 * Fire-and-forget: blockiert den Request nicht und wirft nie.
 */
export function logError({
  message,
  ctx,
  disableTelegram = false,
}: LogErrorProps): void {
  const ctxString = serialize(ctx) ?? "null";
  console.error(
    "[logError]",
    message,
    "| ctx:",
    ctxString.slice(0, 75) + (ctxString.length > 75 ? " [...]" : "")
  );

  const tasks: Promise<unknown>[] = [
    db.insert(errorLog).values({ id: genId(), message, ctx: ctxString }),
  ];
  if (!disableTelegram) {
    tasks.push(sendTelegramMessage(`[logError] ${message}`));
  }
  Promise.allSettled(tasks).then((results) => {
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[logError] failed to persist error", result.reason);
      }
    }
  });
}
