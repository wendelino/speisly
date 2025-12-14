"use server";

import { db } from "@/lib/db";
import { feedback } from "@/lib/db/schema/feedback";
import { genId } from "@/lib/db/utils";
import { sendTelegramMessage } from "@/lib/telegram";

export async function submitFeedback({
  message,
  email,
}: {
  message: string;
  email?: string;
}) {
  await db.insert(feedback).values({ id: genId(), message, email });
  await sendTelegramMessage(message);
}
