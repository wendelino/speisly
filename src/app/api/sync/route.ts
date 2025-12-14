"use server";

import { type NextRequest, NextResponse } from "next/server";
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
  const date = new Date().toISOString().split("T")[0];
  const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

  if (refresh) {
    await handleSync(date);
    return NextResponse.json({ message: "Cache refreshed" }, { status: 200 });
  }

  const inOneWeek = new Date(Date.now() + ONE_WEEK_IN_MS)
    .toISOString()
    .split("T")[0];
  await handleSync({ from: date, to: inOneWeek });
  return NextResponse.json({ message: "Data synced" }, { status: 200 });
}
