"use server";

import { db } from "@/lib/db";
import { errorLog } from "@/lib/db/schema/errorLog";
import { genId } from "@/lib/db/utils";
import { sendTelegramMessage } from "@/lib/telegram";

export async function logError({
  message,
  ctx,
  disableTelegram = false,
}: {
  message: string;
  ctx: unknown;
  disableTelegram?: boolean;
}) {
  const ctxString = JSON.stringify(ctx);
  await db.insert(errorLog).values({ id: genId(), message, ctx: ctxString });
  if (!disableTelegram) {
    await sendTelegramMessage(`[logError] ${message}`);
  }
  console.error(
    "[logError] ",
    message,
    " | ctx:",
    ctxString.slice(0, 75) + (ctxString.length > 75 ? " [...]" : "")
  );
}
