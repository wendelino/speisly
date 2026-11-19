import { describe, expect, test } from "bun:test";
import { SignJWT } from "jose";
import {
  commentHash,
  signModerationToken,
  verifyModerationToken,
} from "./moderation-token";

describe("moderation token", () => {
  test("round trip: rating, action and comment hash", async () => {
    const token = await signModerationToken("rating-1", "Lecker!", "approved");
    expect(await verifyModerationToken(token)).toEqual({
      ratingId: "rating-1",
      hash: commentHash("Lecker!"),
      action: "approved",
    });
  });

  test("hash differs for an edited comment", () => {
    expect(commentHash("Lecker!")).not.toBe(commentHash("Lecker?"));
  });

  test("rejects tampered tokens and other JWTs with the same secret", async () => {
    const token = await signModerationToken("rating-1", "x", "rejected");
    expect(await verifyModerationToken(`${token}x`)).toBeNull();

    // z. B. das Nutzer-Cookie (lib jwt.ts): gleiches Secret, keine Audience
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET ?? "test-secret"
    );
    const other = await new SignJWT({
      rid: "rating-1",
      h: "x",
      act: "approved",
    })
      .setProtectedHeader({ alg: process.env.JWT_ALGORITHM ?? "HS256" })
      .setExpirationTime("1h")
      .sign(secret);
    expect(await verifyModerationToken(other)).toBeNull();
  });
});
