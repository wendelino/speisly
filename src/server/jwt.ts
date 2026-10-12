import { JWT_ALGORITHM, JWT_SECRET } from "astro:env/server";
import { type JWTPayload, jwtVerify, SignJWT } from "jose";

const secret = new TextEncoder().encode(JWT_SECRET);

export async function decodeJwt(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [JWT_ALGORITHM],
    });
    return payload;
  } catch (error) {
    console.error("Error decoding JWT:", error);
    return null;
  }
}

export function encodeJwt(payload: JWTPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime("1y")
    .sign(secret);
}
