import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

// biome-ignore lint/suspicious/useAwait: revalidatePath is synchronous but route handlers should be async
export async function POST(request: NextRequest) {
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

  try {
    // Revalidate the home page
    revalidatePath("/");

    return NextResponse.json(
      {
        message: "Page revalidated successfully",
        revalidated: true,
        now: Date.now(),
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "Error revalidating page",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
