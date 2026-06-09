"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { logError } from "@/actions/error";
import { handleSync } from "@/dal";

export async function GET(request: NextRequest) {
  // Validate bearer token
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.API_BEARER_TOKEN;

  if (!expectedToken) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Unauthorized: Missing or invalid authorization header" },
      { status: 401 }
    );
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix
  if (token !== expectedToken) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid bearer token" },
      { status: 401 }
    );
  }

  const refresh = request.nextUrl.searchParams.get("refresh");
  // Use Berlin timezone for date calculation — toISOString() always returns UTC
  // which causes wrong dates between UTC midnight and Berlin midnight
  const date = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Berlin",
  }); // "YYYY-MM-DD"
  const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

  if (refresh) {
    try {
      await handleSync(date);
      revalidateTag("meals", "/");
      revalidatePath("/");
      return NextResponse.json({ message: "Cache refreshed" }, { status: 200 });
    } catch (error) {
      await logError({ message: "Error syncing data", ctx: error });
      return NextResponse.json(
        { error: "Error syncing data" },
        { status: 500 }
      );
    }
  }

  const inOneWeek = new Date(Date.now() + ONE_WEEK_IN_MS).toLocaleDateString(
    "en-CA",
    { timeZone: "Europe/Berlin" }
  );
  await handleSync({ from: date, to: inOneWeek });
  revalidateTag("meals", "/");
  revalidatePath("/");
  return NextResponse.json({ message: "Data synced" }, { status: 200 });
}
