import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from "astro:env/server";
import { TIME_ZONE } from "@/lib/dates";

/**
 * Escaped Sonderzeichen für Telegrams (Legacy-)Markdown. Ohne Escaping lehnt
 * die API Nachrichten mit z. B. einem einzelnen `_` oder `*` ab.
 */
const MARKDOWN_SPECIAL = /([_*`[])/g;

export function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_SPECIAL, "\\$1");
}

const timestamp = () =>
  new Date().toLocaleString("de-DE", {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  });

const template = (message: string) =>
  `*Speisly Nachricht*
*T:* ${timestamp()}\n
${escapeMarkdown(message)}
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
