import { JWT_ALGORITHM, JWT_SECRET } from "astro:env/server";
import { createHash } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

/**
 * Signierte Links zum Freigeben/Ablehnen eines Kommentars direkt aus der
 * Push-Benachrichtigung (POST /api/moderate). Ohne Admin-Session, weil die
 * nach 8 h abläuft; das Token gilt dafür nur für genau diesen Kommentartext,
 * eine Aktion und begrenzte Zeit. Ändert jemand den Kommentar, passt der
 * Hash nicht mehr und das alte Token gibt den neuen Text nicht frei.
 */

export type ModerationAction = "approved" | "rejected";

const AUDIENCE = "speisly-comment-moderation";
export const MODERATION_TOKEN_TTL = "48h";

const secret = new TextEncoder().encode(JWT_SECRET);

export function commentHash(comment: string): string {
  return createHash("sha256").update(comment).digest("base64url").slice(0, 22);
}

export function signModerationToken(
  ratingId: string,
  comment: string,
  action: ModerationAction
): Promise<string> {
  return new SignJWT({ rid: ratingId, h: commentHash(comment), act: action })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(MODERATION_TOKEN_TTL)
    .sign(secret);
}

export type ModerationClaim = {
  ratingId: string;
  hash: string;
  action: ModerationAction;
};

/** `null` bei ungültigem, abgelaufenem oder fremdem Token */
export async function verifyModerationToken(
  token: string
): Promise<ModerationClaim | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [JWT_ALGORITHM],
      audience: AUDIENCE,
    });
    const { rid, h, act } = payload;
    if (
      typeof rid !== "string" ||
      typeof h !== "string" ||
      (act !== "approved" && act !== "rejected")
    ) {
      return null;
    }
    return { ratingId: rid, hash: h, action: act };
  } catch {
    return null;
  }
}
