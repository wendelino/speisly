"use server";

import { format } from "date-fns";

const TEMPLATE = (m: string) =>
  `*Speilsy Nachricht*
*T:* ${format(new Date(), "dd.MM.yyyy - HH:mm")}\n
${m}
`;

export async function sendTelegramMessage(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN is not set");
    console.debug("sendTelegramMessage()", message);
    return;
  }
  if (!chatId) {
    console.error("TELEGRAM_CHAT_ID is not set");
    console.debug("sendTelegramMessage()", message);
    return;
  }

  const telegramMessage = TEMPLATE(message);

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: telegramMessage,
        parse_mode: "Markdown",
      }),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to send telegram message");
  }

  return response.json();
}
