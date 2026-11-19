import { createHash, randomBytes } from "node:crypto";
import {
  createRemoteJWKSet,
  EncryptJWT,
  type JWTPayload,
  type JWTVerifyGetKey,
  jwtDecrypt,
  jwtVerify,
  SignJWT,
} from "jose";

/**
 * Login für /admin über den eigenen OIDC-Provider (Authorization Code mit
 * PKCE). Nach dem Login hält ein eigenes, signiertes Session-Cookie den
 * Zugang.
 *
 * Ablauf: /admin/login → Provider → /admin/callback (Code tauschen, ID-Token
 * prüfen, Gruppe prüfen) → Session-Cookie → /admin.
 *
 * Angemeldet bleiben: Gibt der Provider ein Refresh-Token (`offline_access`),
 * liegt es verschlüsselt im Refresh-Cookie und die Session ist kurz. Ist sie
 * abgelaufen, holt die Middleware mit dem Refresh-Token neue Tokens, prüft
 * die Gruppe erneut und setzt beide Cookies neu (src/middleware.ts). Wer am
 * Provider gesperrt oder aus der Gruppe genommen wird, verliert den Zugang so
 * nach spätestens einer Session-Laufzeit.
 */

export const SESSION_COOKIE = "speisly_admin";
export const REFRESH_COOKIE = "speisly_admin_refresh";
export const FLOW_COOKIE = "speisly_admin_flow";
/** Session ohne Refresh-Token: bis zum nächsten Login */
export const SESSION_TTL_SECONDS = 8 * 3600;
/** Session mit Refresh-Token: danach wird still erneuert */
export const REFRESHABLE_SESSION_TTL_SECONDS = 15 * 60;
/** Wie lange der Browser das Refresh-Cookie hält (bei jeder Erneuerung neu) */
export const REFRESH_TTL_SECONDS = 30 * 24 * 3600;
export const FLOW_TTL_SECONDS = 10 * 60;
/** Parallele Requests mit demselben Refresh-Cookie teilen sich ein Ergebnis */
const REFRESH_DEDUPE_MS = 60_000;

/** Unterscheidet Session und Login-Ablauf von anderen JWTs mit JWT_SECRET */
const SESSION_AUDIENCE = "speisly-admin-session";
const FLOW_AUDIENCE = "speisly-admin-flow";
const REFRESH_AUDIENCE = "speisly-admin-refresh";
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
  revocation_endpoint?: string;
};

type TokenResponse = {
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
};

/** Profil aus ID-Token und Userinfo des Providers */
export type AdminSession = {
  sub: string;
  name: string;
  email?: string;
  /** `preferred_username` */
  username?: string;
  /** Profilbild (`picture`), nur http(s) */
  picture?: string;
};

const MAX_PICTURE_LENGTH = 2048;

type Flow = { state: string; nonce: string; verifier: string; next: string };

/** Neue Cookies nach Login oder Erneuerung */
export type SessionCookies = {
  session: string;
  sessionTtl: number;
  /** Fehlt, wenn der Provider kein Refresh-Token ausgegeben hat */
  refresh?: string;
};

export type LoginResult =
  | ({ ok: true; next: string } & SessionCookies)
  | { ok: false; status: 400 | 403 | 502; reason: string };

export type RefreshResult =
  | ({ ok: true; profile: AdminSession } & SessionCookies)
  /**
   * `rejected`: Provider lehnt das Refresh-Token ab oder die Gruppe fehlt,
   * das Cookie ist wertlos. Sonst (Netzwerk, 5xx) später erneut versuchen.
   */
  | { ok: false; rejected: boolean };

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

const str = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/** Nur absolute http(s)-URLs; Data-URLs würden das Session-Cookie sprengen */
function pictureOf(value: unknown): string | undefined {
  const url = str(value);
  if (!url || url.length > MAX_PICTURE_LENGTH) {
    return;
  }
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:" ? url : undefined;
  } catch {
    return;
  }
}

/** Profil aus den Claims; Felder ohne Wert fehlen */
export function profileOf(
  sub: string,
  claims: Record<string, unknown>
): AdminSession {
  const profile = {
    sub,
    name:
      str(claims.name) ??
      str(claims.preferred_username) ??
      str(claims.email) ??
      sub,
    email: str(claims.email),
    username: str(claims.preferred_username) ?? str(claims.username),
    picture: pictureOf(claims.picture),
  };
  return Object.fromEntries(
    Object.entries(profile).filter(([, value]) => value !== undefined)
  ) as AdminSession;
}

export function createAdminAuth({
  settings,
  secret,
  fetch: fetchImpl = fetch,
  jwks,
}: Deps) {
  const key = new TextEncoder().encode(secret);
  // eigener Schlüssel fürs Verschlüsseln, abgeleitet aus demselben Secret
  const refreshKey = createHash("sha256")
    .update(`speisly-admin-refresh:${secret}`)
    .digest();
  const pendingRefresh = new Map<string, Promise<RefreshResult>>();
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
      // offline_access: Refresh-Token, um angemeldet zu bleiben
      scope: "openid profile email groups offline_access",
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

  /** Das Refresh-Token ist ein Geheimnis: verschlüsselt, nicht nur signiert */
  function sealRefresh(refreshToken: string, sub: string) {
    return new EncryptJWT({ rt: refreshToken, sub })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .setAudience(REFRESH_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${REFRESH_TTL_SECONDS}s`)
      .encrypt(refreshKey);
  }

  async function openRefresh(
    cookie: string | undefined
  ): Promise<{ rt: string; sub: string } | null> {
    if (!cookie) {
      return null;
    }
    try {
      const { payload } = await jwtDecrypt(cookie, refreshKey, {
        audience: REFRESH_AUDIENCE,
      });
      return typeof payload.rt === "string" && typeof payload.sub === "string"
        ? { rt: payload.rt, sub: payload.sub }
        : null;
    } catch {
      return null;
    }
  }

  function clientAuth() {
    return `Basic ${Buffer.from(
      `${encodeURIComponent(settings.clientId)}:${encodeURIComponent(settings.clientSecret)}`
    ).toString("base64")}`;
  }

  /** POST an den Token-Endpoint; `status` bei HTTP-Fehlern */
  async function tokenRequest(
    discovered: Discovery,
    body: Record<string, string>
  ): Promise<TokenResponse> {
    const res = await fetchImpl(discovered.token_endpoint, {
      method: "POST",
      headers: {
        authorization: clientAuth(),
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams(body),
    });
    if (!res.ok) {
      throw Object.assign(new Error(`token endpoint: HTTP ${res.status}`), {
        status: res.status,
      });
    }
    return (await res.json()) as TokenResponse;
  }

  /** Session- und (falls vorhanden) Refresh-Cookie für ein Profil */
  async function issueCookies(
    profile: AdminSession,
    refreshToken: string | undefined
  ): Promise<SessionCookies> {
    const sessionTtl = refreshToken
      ? REFRESHABLE_SESSION_TTL_SECONDS
      : SESSION_TTL_SECONDS;
    return {
      session: await sign(profile, SESSION_AUDIENCE, sessionTtl),
      sessionTtl,
      refresh: refreshToken
        ? await sealRefresh(refreshToken, profile.sub)
        : undefined,
    };
  }

  /**
   * Claims vom Userinfo-Endpoint, falls dem ID-Token Gruppen oder
   * Profilangaben (Bild, Name) fehlen. Gilt nur für denselben Nutzer.
   */
  async function userinfoFor(
    discovered: Discovery,
    idClaims: JWTPayload,
    accessToken: string | undefined
  ): Promise<Record<string, unknown>> {
    const complete =
      groupsOf(idClaims).length > 0 &&
      str(idClaims.picture) &&
      str(idClaims.name);
    if (complete || !(discovered.userinfo_endpoint && accessToken)) {
      return {};
    }
    try {
      const res = await fetchImpl(discovered.userinfo_endpoint, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        return {};
      }
      const info = (await res.json()) as Record<string, unknown>;
      return info.sub === idClaims.sub ? info : {};
    } catch {
      return {};
    }
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
    let refreshToken: string | undefined;
    try {
      const tokens = await tokenRequest(discovered, {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: flow.verifier,
      });
      if (!tokens.id_token) {
        return { ok: false, status: 502, reason: "Kein ID-Token" };
      }
      accessToken = tokens.access_token;
      refreshToken = tokens.refresh_token;
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
    const profile = await adminProfile(
      discovered,
      { ...claims, sub: claims.sub },
      accessToken
    );
    if (!profile) {
      return {
        ok: false,
        status: 403,
        reason: "Kein Zugriff auf den Admin-Bereich",
      };
    }
    return {
      ok: true,
      ...(await issueCookies(profile, refreshToken)),
      next: flow.next,
    };
  }

  /** Profil, wenn der Nutzer in der Admin-Gruppe ist, sonst `null` */
  async function adminProfile(
    discovered: Discovery,
    claims: JWTPayload & { sub: string },
    accessToken: string | undefined
  ): Promise<AdminSession | null> {
    const info = await userinfoFor(discovered, claims, accessToken);
    const fromToken = groupsOf(claims);
    const groups = fromToken.length > 0 ? fromToken : groupsOf(info);
    if (!groups.includes(settings.adminGroup)) {
      return null;
    }
    // ID-Token hat Vorrang, Userinfo ergänzt
    return profileOf(claims.sub, { ...info, ...claims });
  }

  async function doRefresh(cookie: string): Promise<RefreshResult> {
    const sealed = await openRefresh(cookie);
    if (!sealed) {
      return { ok: false, rejected: true };
    }
    let tokens: TokenResponse;
    let claims: JWTPayload & { sub: string };
    let discovered: Discovery;
    try {
      discovered = await getDiscovery();
      tokens = await tokenRequest(discovered, {
        grant_type: "refresh_token",
        refresh_token: sealed.rt,
      });
      if (tokens.id_token) {
        // kein Nonce beim Refresh (OIDC Core 12.2), aber derselbe Nutzer
        const { payload } = await jwtVerify(tokens.id_token, await getJwks(), {
          issuer: discovered.issuer,
          audience: settings.clientId,
        });
        if (payload.sub !== sealed.sub) {
          return { ok: false, rejected: true };
        }
        claims = { ...payload, sub: sealed.sub };
      } else {
        claims = { sub: sealed.sub };
      }
    } catch (error) {
      const status = (error as { status?: number }).status;
      // 400/401: invalid_grant – abgelaufen, widerrufen oder schon verbraucht
      const rejected = status === 400 || status === 401;
      if (!rejected) {
        console.error("[admin-auth] refresh failed", error);
      }
      return { ok: false, rejected };
    }
    // ohne ID-Token kommen Gruppen und Profil vom Userinfo-Endpoint
    const profile = await adminProfile(discovered, claims, tokens.access_token);
    if (!profile) {
      return { ok: false, rejected: true };
    }
    return {
      ok: true,
      profile,
      // ohne Rotation bleibt das alte Refresh-Token gültig
      ...(await issueCookies(profile, tokens.refresh_token ?? sealed.rt)),
    };
  }

  /**
   * Neue Session aus dem Refresh-Cookie. Seite, Islands und Prefetch kommen
   * oft gleichzeitig mit demselben (bei Rotation nur einmal gültigen) Token:
   * sie teilen sich eine Anfrage beim Provider und dasselbe Ergebnis.
   */
  function refresh(cookie: string | undefined): Promise<RefreshResult> {
    if (!cookie) {
      return Promise.resolve({ ok: false, rejected: false });
    }
    let pending = pendingRefresh.get(cookie);
    if (!pending) {
      pending = doRefresh(cookie);
      pendingRefresh.set(cookie, pending);
      const forget = () =>
        setTimeout(
          () => pendingRefresh.delete(cookie),
          REFRESH_DEDUPE_MS
        ).unref?.();
      pending.then(forget, forget);
    }
    return pending;
  }

  /** Refresh-Token beim Provider widerrufen (beim Abmelden, best effort) */
  async function revoke(cookie: string | undefined): Promise<void> {
    const sealed = await openRefresh(cookie);
    if (!sealed) {
      return;
    }
    try {
      const { revocation_endpoint } = await getDiscovery();
      if (!revocation_endpoint) {
        return;
      }
      await fetchImpl(revocation_endpoint, {
        method: "POST",
        headers: {
          authorization: clientAuth(),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          token: sealed.rt,
          token_type_hint: "refresh_token",
        }),
      });
    } catch (error) {
      console.error("[admin-auth] revoke failed", error);
    }
  }

  async function readSession(
    cookie: string | undefined
  ): Promise<AdminSession | null> {
    const payload = await verify(cookie, SESSION_AUDIENCE);
    if (!(payload?.sub && typeof payload.name === "string")) {
      return null;
    }
    return profileOf(payload.sub, {
      ...payload,
      preferred_username: payload.username,
    });
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

  return { startLogin, finishLogin, readSession, refresh, revoke, logoutUrl };
}

export type AdminAuth = ReturnType<typeof createAdminAuth>;
