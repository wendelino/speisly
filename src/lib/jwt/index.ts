"use server";
import { type JWTPayload, jwtVerify, SignJWT } from "jose";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set");
}

const JWT_ALGORITHM = process.env.JWT_ALGORITHM || "HS256";

export async function decodeJwt(token: string): Promise<JWTPayload | null> {
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [JWT_ALGORITHM!],
    });
    return payload;
  } catch (error) {
    console.error("Error decoding JWT:", error);
    return null;
  }
}

export async function encodeJwt(payload: JWTPayload): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALGORITHM! })
    .setIssuedAt()
    .setExpirationTime("1y")
    .sign(secret);
  return token;
}
