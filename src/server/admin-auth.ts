import { createHash, randomBytes } from "node:crypto";
import {
  createRemoteJWKSet,
  type JWTPayload,
  type JWTVerifyGetKey,
  jwtVerify,
  SignJWT,
} from "jose";

/**
 * Login für /admin über den eigenen OIDC-Provider (Authorization Code mit
 * PKCE). Nach dem Login hält ein eigenes, signiertes Session-Cookie den
 * Zugang; der Provider wird danach nicht mehr gefragt.
 *
 * Ablauf: /admin/login → Provider → /admin/callback (Code tauschen, ID-Token
 * prüfen, Gruppe prüfen) → Session-Cookie → /admin.
 */

export const SESSION_COOKIE = "speisly_admin";
export const FLOW_COOKIE = "speisly_admin_flow";
export const SESSION_TTL_SECONDS = 8 * 3600;
export const FLOW_TTL_SECONDS = 10 * 60;

/** Unterscheidet Session und Login-Ablauf von anderen JWTs mit JWT_SECRET */
const SESSION_AUDIENCE = "speisly-admin-session";
const FLOW_AUDIENCE = "speisly-admin-flow";
const ALGORITHM = "HS256";
const TRAILING_SLASH = /\/$/;

export type OidcSettings = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  adminGroup: string;
};

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
};

export type AdminSession = { sub: string; name: string; email?: string };

type Flow = { state: string; nonce: string; verifier: string; next: string };

export type LoginResult =
  | { ok: true; session: string; next: string }
  | { ok: false; status: 400 | 403 | 502; reason: string };

type Deps = {
  settings: OidcSettings;
  /** Schlüssel für Session- und Flow-Cookie (JWT_SECRET) */
  secret: string;
  fetch?: typeof fetch;
  /** Nur für Tests: JWKS ohne Netzwerk */
  jwks?: JWTVerifyGetKey;
};

const base64url = (bytes: Buffer) => bytes.toString("base64url");
const random = () => base64url(randomBytes(32));

/** Nur Pfade unter /admin als Ziel nach dem Login (kein Open Redirect) */
export function safeNext(next: string | null | undefined): string {
  return next === "/admin" ||
    next?.startsWith("/admin/") ||
    next?.startsWith("/admin?")
    ? next
    : "/admin";
}

/** Gruppen aus `groups` (Array oder einzelner String) */
function groupsOf(claims: Record<string, unknown>): string[] {
  const groups = claims.groups;
  if (Array.isArray(groups)) {
    return groups.filter((g): g is string => typeof g === "string");
  }
  return typeof groups === "string" ? [groups] : [];
}

export function createAdminAuth({
  settings,
  secret,
  fetch: fetchImpl = fetch,
  jwks,
}: Deps) {
  const key = new TextEncoder().encode(secret);
  let discovery: Promise<Discovery> | undefined;
  let remoteJwks: JWTVerifyGetKey | undefined;

  function getDiscovery(): Promise<Discovery> {
    discovery ??= fetchImpl(
      `${settings.issuer.replace(TRAILING_SLASH, "")}/.well-known/openid-configuration`
    )
      .then((res) => {
        if (!res.ok) {
          throw new Error(`OIDC discovery failed: HTTP ${res.status}`);
        }
        return res.json() as Promise<Discovery>;
      })
      .catch((error: unknown) => {
        // beim nächsten Login erneut versuchen
        discovery = undefined;
        throw error;
      });
    return discovery;
  }

  async function getJwks(): Promise<JWTVerifyGetKey> {
    if (jwks) {
      return jwks;
    }
    remoteJwks ??= createRemoteJWKSet(new URL((await getDiscovery()).jwks_uri));
    return remoteJwks;
  }

  function sign(payload: JWTPayload, audience: string, ttl: number) {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: ALGORITHM })
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(key);
  }

  async function verify(token: string | undefined, audience: string) {
    if (!token) {
      return null;
    }
    try {
      const { payload } = await jwtVerify(token, key, {
        audience,
        algorithms: [ALGORITHM],
      });
      return payload;
    } catch {
      return null;
    }
  }

  /** URL zum Provider und das Flow-Cookie (state, nonce, PKCE-Verifier) */
  async function startLogin({
    redirectUri,
    next,
  }: {
    redirectUri: string;
    next?: string | null;
  }): Promise<{ url: string; flowCookie: string }> {
    const { authorization_endpoint } = await getDiscovery();
    const flow: Flow = {
      state: random(),
      nonce: random(),
      verifier: random(),
      next: safeNext(next),
    };
    const url = new URL(authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: settings.clientId,
      redirect_uri: redirectUri,
      scope: "openid profile email groups",
      state: flow.state,
      nonce: flow.nonce,
      code_challenge: base64url(
        createHash("sha256").update(flow.verifier).digest()
      ),
      code_challenge_method: "S256",
    }).toString();
    return {
      url: url.toString(),
      flowCookie: await sign(flow, FLOW_AUDIENCE, FLOW_TTL_SECONDS),
    };
  }

  async function exchangeCode(
    discovered: Discovery,
    {
      code,
      redirectUri,
      verifier,
    }: { code: string; redirectUri: string; verifier: string }
  ) {
    const basic = Buffer.from(
      `${encodeURIComponent(settings.clientId)}:${encodeURIComponent(settings.clientSecret)}`
    ).toString("base64");
    const res = await fetchImpl(discovered.token_endpoint, {
      method: "POST",
      headers: {
        authorization: `Basic ${basic}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    });
    if (!res.ok) {
      throw new Error(`token endpoint: HTTP ${res.status}`);
    }
    return (await res.json()) as { id_token?: string; access_token?: string };
  }

  /** Gruppen aus dem ID-Token, sonst vom Userinfo-Endpoint */
  async function groupsFor(
    discovered: Discovery,
    idClaims: JWTPayload,
    accessToken: string | undefined
  ): Promise<string[]> {
    const fromToken = groupsOf(idClaims);
    if (
      fromToken.length > 0 ||
      !(discovered.userinfo_endpoint && accessToken)
    ) {
      return fromToken;
    }
    const res = await fetchImpl(discovered.userinfo_endpoint, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      return [];
    }
    const info = (await res.json()) as Record<string, unknown>;
    // Userinfo gehört nur zum selben Nutzer
    return info.sub === idClaims.sub ? groupsOf(info) : [];
  }

  /** Callback des Providers: Code tauschen, Token und Gruppe prüfen */
  async function finishLogin({
    params,
    flowCookie,
    redirectUri,
  }: {
    params: URLSearchParams;
    flowCookie: string | undefined;
    redirectUri: string;
  }): Promise<LoginResult> {
    const flow = (await verify(flowCookie, FLOW_AUDIENCE)) as
      | (JWTPayload & Flow)
      | null;
    if (!flow || params.get("state") !== flow.state) {
      return {
        ok: false,
        status: 400,
        reason: "Ungültiger oder abgelaufener Login-Versuch",
      };
    }
    if (params.get("error")) {
      return {
        ok: false,
        status: 400,
        reason: `Provider: ${params.get("error")}`,
      };
    }
    const code = params.get("code");
    if (!code) {
      return { ok: false, status: 400, reason: "Kein Code vom Provider" };
    }
    const discovered = await getDiscovery();
    // RFC 9207: der Provider nennt sich in der Antwort selbst
    const iss = params.get("iss");
    if (iss && iss !== discovered.issuer) {
      return { ok: false, status: 400, reason: "Falscher Aussteller" };
    }

    let claims: JWTPayload;
    let accessToken: string | undefined;
    try {
      const tokens = await exchangeCode(discovered, {
        code,
        redirectUri,
        verifier: flow.verifier,
      });
      if (!tokens.id_token) {
        return { ok: false, status: 502, reason: "Kein ID-Token" };
      }
      accessToken = tokens.access_token;
      ({ payload: claims } = await jwtVerify(tokens.id_token, await getJwks(), {
        issuer: discovered.issuer,
        audience: settings.clientId,
      }));
    } catch (error) {
      console.error("[admin-auth] login failed", error);
      return {
        ok: false,
        status: 502,
        reason: "Anmeldung beim Provider fehlgeschlagen",
      };
    }
    if (claims.nonce !== flow.nonce || !claims.sub) {
      return { ok: false, status: 400, reason: "Ungültiges ID-Token" };
    }
    const groups = await groupsFor(discovered, claims, accessToken);
    if (!groups.includes(settings.adminGroup)) {
      return {
        ok: false,
        status: 403,
        reason: "Kein Zugriff auf den Admin-Bereich",
      };
    }
    const name =
      (typeof claims.name === "string" && claims.name) ||
      (typeof claims.email === "string" && claims.email) ||
      claims.sub;
    const session: AdminSession = {
      sub: claims.sub,
      name,
      ...(typeof claims.email === "string" ? { email: claims.email } : {}),
    };
    return {
      ok: true,
      session: await sign(session, SESSION_AUDIENCE, SESSION_TTL_SECONDS),
      next: flow.next,
    };
  }

  async function readSession(
    cookie: string | undefined
  ): Promise<AdminSession | null> {
    const payload = await verify(cookie, SESSION_AUDIENCE);
    if (!(payload?.sub && typeof payload.name === "string")) {
      return null;
    }
    return {
      sub: payload.sub,
      name: payload.name,
      ...(typeof payload.email === "string" ? { email: payload.email } : {}),
    };
  }

  /** Abmelden auch beim Provider, falls er das anbietet */
  async function logoutUrl(postLogoutRedirect: string): Promise<string | null> {
    try {
      const { end_session_endpoint } = await getDiscovery();
      if (!end_session_endpoint) {
        return null;
      }
      const url = new URL(end_session_endpoint);
      url.searchParams.set("client_id", settings.clientId);
      url.searchParams.set("post_logout_redirect_uri", postLogoutRedirect);
      return url.toString();
    } catch {
      return null;
    }
  }

  return { startLogin, finishLogin, readSession, logoutUrl };
}

export type AdminAuth = ReturnType<typeof createAdminAuth>;
