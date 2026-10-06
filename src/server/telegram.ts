import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from "astro:env/server";
import { format } from "date-fns";

const template = (message: string) =>
  `*Speilsy Nachricht*
*T:* ${format(new Date(), "dd.MM.yyyy - HH:mm")}\n
${message}
`;

export async function sendTelegramMessage(message: string): Promise<void> {
  if (!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID)) {
    console.debug("[telegram] not configured, message:", message);
    return;
  }

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: template(message),
        parse_mode: "Markdown",
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to send telegram message: ${response.status}`);
  }
}
