import { createServer } from "node:http";
import { parse } from "node:url";
import { CronJob } from "cron";
import next from "next";

const port = Number.parseInt(process.env.PORT || "3000", 10);
const dev = false; // process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = req.url ? parse(req.url, true) : undefined;
    handle(req, res, parsedUrl);
  }).listen(port);

  console.log(
    `\n> Server listening at http://localhost:${port} as ${
      dev ? "development" : process.env.NODE_ENV
    }\n`
  );
  const baseUrl = process.env.NEXT_PUBLIC_URL;
  if (!baseUrl) {
    console.error("NEXT_PUBLIC_URL is not set");
    return;
  }
  const token = process.env.API_BEARER_TOKEN;
  if (!token) {
    console.error("API_BEARER_TOKEN is not set");
    return;
  }
  const handler = (fastRefresh?: boolean) => {
    const url = `${baseUrl}/api/sync${fastRefresh ? "?refresh=true" : ""}`;
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  };

  const revalidatePage = async () => {
    try {
      const response = await fetch(`${baseUrl}/api/revalidate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (response.ok) {
        console.log("[cron] Page revalidated successfully:", data.message);
      } else {
        console.error("[cron] Failed to revalidate page:", data.error);
      }
    } catch (error) {
      console.error("[cron] Error revalidating page:", error);
    }
  };

  console.log("[cron] Booting...");
  const TZ = "Europe/Berlin";
  new CronJob("17,47 6-16 * * 1-5", () => handler(true), null, true, TZ);
  new CronJob("17 2 * * 0-4", () => handler(), null, true, TZ, undefined); //, true); // true for immediate execution
  // Revalidate page at midnight (0:01) every day
  new CronJob("1 0 * * *", () => revalidatePage(), null, true, TZ);
});
