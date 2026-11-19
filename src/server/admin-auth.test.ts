import { beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  SignJWT,
} from "jose";
import {
  createAdminAuth,
  profileOf,
  REFRESHABLE_SESSION_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  safeNext,
} from "./admin-auth";

const ISSUER = "https://sso.example.test";
const CLIENT_ID = "speisly-test";
const REDIRECT = "https://speisly.de/admin/callback";
const DISCOVERY = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/jwks`,
  userinfo_endpoint: `${ISSUER}/userinfo`,
  end_session_endpoint: `${ISSUER}/end-session`,
  revocation_endpoint: `${ISSUER}/revoke`,
};

let privateKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  jwks = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" }],
  });
});

function idToken(
  claims: JWTPayload,
  { issuer = ISSUER, audience = CLIENT_ID } = {}
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

type Provider = {
  /** Claims des ID-Tokens; `nonce` kommt aus dem Login */
  claims: (nonce: string) => Promise<string>;
  userinfo?: Record<string, unknown>;
  /**
   * Antwort auf `grant_type=refresh_token`; ohne Angabe: neues ID-Token und
   * rotiertes Refresh-Token
   */
  onRefresh?: (refreshToken: string) => Promise<Response> | Response;
  /** Ohne Refresh-Token beim Login */
  noRefreshToken?: boolean;
};

/** Simulierter Provider; merkt sich, was an den Token-Endpoint ging */
function setup(provider: Provider) {
  const tokenRequests: { headers: Headers; body: URLSearchParams }[] = [];
  const revoked: URLSearchParams[] = [];
  let nonce = "";
  let rotation = 0;
  const fakeFetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = String(input);
    if (url.endsWith("/.well-known/openid-configuration")) {
      return Response.json(DISCOVERY);
    }
    if (url === DISCOVERY.token_endpoint) {
      const body = new URLSearchParams(String(init?.body));
      tokenRequests.push({ headers: new Headers(init?.headers), body });
      if (body.get("grant_type") === "refresh_token") {
        if (provider.onRefresh) {
          return provider.onRefresh(body.get("refresh_token") ?? "");
        }
        rotation += 1;
        return Response.json({
          id_token: await provider.claims(""),
          access_token: "access",
          refresh_token: `refresh-${rotation}`,
        });
      }
      return Response.json({
        id_token: await provider.claims(nonce),
        access_token: "access",
        refresh_token: provider.noRefreshToken ? undefined : "refresh-0",
      });
    }
    if (url === DISCOVERY.revocation_endpoint) {
      revoked.push(new URLSearchParams(String(init?.body)));
      return new Response(null, { status: 200 });
    }
    if (url === DISCOVERY.userinfo_endpoint && provider.userinfo) {
      return Response.json(provider.userinfo);
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;

  const auth = createAdminAuth({
    settings: {
      issuer: ISSUER,
      clientId: CLIENT_ID,
      clientSecret: "geheim",
      adminGroup: "speisly-admin",
    },
    secret: "test-secret",
    fetch: fakeFetch,
    jwks,
  });

  async function login(params: Record<string, string> = {}, next?: string) {
    const start = await auth.startLogin({ redirectUri: REDIRECT, next });
    const url = new URL(start.url);
    nonce = url.searchParams.get("nonce") ?? "";
    const result = await auth.finishLogin({
      params: new URLSearchParams({
        code: "code-123",
        state: url.searchParams.get("state") ?? "",
        iss: ISSUER,
        ...params,
      }),
      flowCookie: start.flowCookie,
      redirectUri: REDIRECT,
    });
    return { start, url, result };
  }

  return { auth, login, tokenRequests, revoked };
}

const admin = (nonce: string) =>
  idToken({
    sub: "u1",
    name: "Ada",
    email: "ada@example.test",
    nonce,
    groups: ["speisly-admin"],
  });

describe("admin login (OIDC)", () => {
  test("redirects with PKCE, state and nonce", async () => {
    const { url, start } = await setup({ claims: admin }).login();
    expect(url.origin + url.pathname).toBe(DISCOVERY.authorization_endpoint);
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe(
      "openid profile email groups offline_access"
    );
    expect(start.flowCookie.split(".")).toHaveLength(3);
  });

  test("a member of the admin group gets a session", async () => {
    const { auth, login, tokenRequests } = setup({ claims: admin });
    const { url, result } = await login({}, "/admin/errors?status=all");
    expect(result).toMatchObject({
      ok: true,
      next: "/admin/errors?status=all",
    });

    // Code-Tausch mit Client-Auth und dem Verifier zur Challenge
    const [request] = tokenRequests;
    expect(request.headers.get("authorization")).toBe(
      `Basic ${Buffer.from(`${CLIENT_ID}:geheim`).toString("base64")}`
    );
    const verifier = request.body.get("code_verifier") ?? "";
    expect(createHash("sha256").update(verifier).digest("base64url")).toBe(
      url.searchParams.get("code_challenge") ?? ""
    );
    expect(request.body.get("redirect_uri")).toBe(REDIRECT);

    if (!result.ok) {
      throw new Error("expected a session");
    }
    expect(await auth.readSession(result.session)).toEqual({
      sub: "u1",
      name: "Ada",
      email: "ada@example.test",
    });
  });

  test("groups from userinfo when the ID token has none", async () => {
    const { result } = await setup({
      claims: (nonce) => idToken({ sub: "u1", name: "Ada", nonce }),
      userinfo: { sub: "u1", groups: ["speisly-admin"] },
    }).login();
    expect(result.ok).toBe(true);
  });

  test("profile with picture, completed from userinfo", async () => {
    const { auth, login } = setup({
      claims: (nonce) =>
        idToken({ sub: "u1", nonce, groups: ["speisly-admin"] }),
      userinfo: {
        sub: "u1",
        name: "Ada Lovelace",
        preferred_username: "ada",
        email: "ada@example.test",
        picture: "https://sso.example.test/avatar/u1.png",
      },
    });
    const { result } = await login();
    if (!result.ok) {
      throw new Error("expected a session");
    }
    expect(await auth.readSession(result.session)).toEqual({
      sub: "u1",
      name: "Ada Lovelace",
      email: "ada@example.test",
      username: "ada",
      picture: "https://sso.example.test/avatar/u1.png",
    });
  });

  test("only http(s) pictures", () => {
    expect(profileOf("u1", { picture: "javascript:alert(1)" })).toEqual({
      sub: "u1",
      name: "u1",
    });
    expect(
      profileOf("u1", { picture: "data:image/png;base64,AAAA" }).picture
    ).toBeUndefined();
  });

  test("without the admin group access is denied", async () => {
    const { result } = await setup({
      claims: (nonce) => idToken({ sub: "u2", nonce, groups: ["andere"] }),
      userinfo: { sub: "u2", groups: ["andere"] },
    }).login();
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  test("userinfo of another subject does not count", async () => {
    const { result } = await setup({
      claims: (nonce) => idToken({ sub: "u2", nonce }),
      userinfo: { sub: "u1", groups: ["speisly-admin"] },
    }).login();
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  test("wrong state, nonce, issuer or audience are rejected", async () => {
    expect(
      (await setup({ claims: admin }).login({ state: "x" })).result
    ).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      (await setup({ claims: admin }).login({ iss: "https://evil.test" }))
        .result
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      (
        await setup({
          claims: () =>
            idToken({ sub: "u1", nonce: "fremd", groups: ["speisly-admin"] }),
        }).login()
      ).result
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      (
        await setup({
          claims: (nonce) =>
            idToken(
              { sub: "u1", nonce, groups: ["speisly-admin"] },
              { audience: "andere-app" }
            ),
        }).login()
      ).result
    ).toMatchObject({ ok: false, status: 502 });
  });

  test("tampered or foreign tokens are no session", async () => {
    const { auth, login } = setup({ claims: admin });
    const { start, result } = await login();
    if (!result.ok) {
      throw new Error("expected a session");
    }
    const [header, payload, signature] = result.session.split(".");
    const forged = `${header}.${payload}.${signature.slice(0, -2)}xx`;
    expect(await auth.readSession(forged)).toBeNull();
    expect(await auth.readSession(undefined)).toBeNull();
    // Das Flow-Cookie ist mit demselben Schlüssel signiert, aber keine Session
    expect(await auth.readSession(start.flowCookie)).toBeNull();
  });

  test("logout goes through the provider", async () => {
    const url = new URL(
      (await setup({ claims: admin }).auth.logoutUrl("https://speisly.de/")) ??
        ""
    );
    expect(url.origin + url.pathname).toBe(DISCOVERY.end_session_endpoint);
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe(
      "https://speisly.de/"
    );
  });
});

describe("staying signed in (refresh token)", () => {
  async function loggedIn(provider: Provider) {
    const ctx = setup(provider);
    const { result } = await ctx.login();
    if (!(result.ok && result.refresh)) {
      throw new Error("expected a refreshable session");
    }
    return { ...ctx, result, refreshCookie: result.refresh };
  }

  test("login stores the refresh token encrypted, session is short", async () => {
    const { result } = await loggedIn({ claims: admin });
    expect(result.sessionTtl).toBe(REFRESHABLE_SESSION_TTL_SECONDS);
    // JWE (5 Teile), das Refresh-Token steht nicht im Klartext darin
    expect(result.refresh?.split(".")).toHaveLength(5);
    expect(result.refresh).not.toContain("refresh-0");
  });

  test("without a refresh token the session lasts until the next login", async () => {
    const { result } = await setup({
      claims: admin,
      noRefreshToken: true,
    }).login();
    expect(result).toMatchObject({ ok: true, sessionTtl: SESSION_TTL_SECONDS });
    expect(result.ok && result.refresh).toBeUndefined();
  });

  test("refresh issues a new session and rotates the token", async () => {
    const { auth, refreshCookie, tokenRequests } = await loggedIn({
      claims: admin,
    });
    const renewed = await auth.refresh(refreshCookie);
    if (!renewed.ok) {
      throw new Error("expected a renewed session");
    }
    expect(renewed.profile).toEqual({
      sub: "u1",
      name: "Ada",
      email: "ada@example.test",
    });
    expect(await auth.readSession(renewed.session)).toEqual(renewed.profile);
    const request = tokenRequests.at(-1);
    expect(request?.body.get("grant_type")).toBe("refresh_token");
    expect(request?.body.get("refresh_token")).toBe("refresh-0");

    // das rotierte Token wird beim nächsten Mal benutzt
    await auth.refresh(renewed.refresh);
    expect(tokenRequests.at(-1)?.body.get("refresh_token")).toBe("refresh-1");
  });

  test("parallel requests share one refresh", async () => {
    const { auth, refreshCookie, tokenRequests } = await loggedIn({
      claims: admin,
    });
    const [a, b] = await Promise.all([
      auth.refresh(refreshCookie),
      auth.refresh(refreshCookie),
    ]);
    expect(a).toBe(b);
    expect(
      tokenRequests.filter((r) => r.body.get("grant_type") === "refresh_token")
    ).toHaveLength(1);
  });

  test("without an ID token on refresh, userinfo decides", async () => {
    const { auth, refreshCookie } = await loggedIn({
      claims: admin,
      userinfo: { sub: "u1", name: "Ada", groups: ["speisly-admin"] },
      onRefresh: () => Response.json({ access_token: "access-2" }),
    });
    const renewed = await auth.refresh(refreshCookie);
    expect(renewed).toMatchObject({ ok: true, profile: { sub: "u1" } });
    // ohne Rotation bleibt das bisherige Refresh-Token
    expect(renewed.ok && renewed.refresh).toBeTruthy();
  });

  test("removed from the admin group: refresh is rejected", async () => {
    let member = true;
    const { auth, refreshCookie } = await loggedIn({
      claims: (nonce) =>
        idToken({
          sub: "u1",
          name: "Ada",
          nonce,
          groups: member ? ["speisly-admin"] : ["andere"],
        }),
      userinfo: { sub: "u1", groups: ["andere"] },
    });
    member = false;
    expect(await auth.refresh(refreshCookie)).toEqual({
      ok: false,
      rejected: true,
    });
  });

  test("revoked token is rejected, provider outage is not", async () => {
    let status = 400;
    const { auth, refreshCookie } = await loggedIn({
      claims: admin,
      onRefresh: () => Response.json({ error: "invalid_grant" }, { status }),
    });
    expect(await auth.refresh(refreshCookie)).toEqual({
      ok: false,
      rejected: true,
    });

    status = 503;
    const other = await loggedIn({
      claims: admin,
      onRefresh: () => new Response(null, { status }),
    });
    expect(await other.auth.refresh(other.refreshCookie)).toEqual({
      ok: false,
      rejected: false,
    });
  });

  test("foreign or tampered refresh cookies are rejected", async () => {
    const { auth, result, refreshCookie, tokenRequests } = await loggedIn({
      claims: admin,
    });
    const before = tokenRequests.length;
    expect(await auth.refresh(result.session)).toMatchObject({
      rejected: true,
    });
    expect(await auth.refresh(`${refreshCookie.slice(0, -2)}xx`)).toMatchObject(
      { rejected: true }
    );
    expect(tokenRequests).toHaveLength(before);
  });

  test("an ID token for another subject is rejected", async () => {
    const { auth, refreshCookie } = await loggedIn({
      claims: admin,
      onRefresh: async () =>
        Response.json({
          id_token: await idToken({ sub: "u2", groups: ["speisly-admin"] }),
          access_token: "access",
        }),
    });
    expect(await auth.refresh(refreshCookie)).toMatchObject({
      ok: false,
      rejected: true,
    });
  });

  test("logout revokes the refresh token", async () => {
    const { auth, refreshCookie, revoked } = await loggedIn({ claims: admin });
    await auth.revoke(refreshCookie);
    expect(revoked).toHaveLength(1);
    expect(revoked[0].get("token")).toBe("refresh-0");
    expect(revoked[0].get("token_type_hint")).toBe("refresh_token");
  });
});

describe("safeNext", () => {
  test("only paths below /admin", () => {
    expect(safeNext("/admin/sync")).toBe("/admin/sync");
    expect(safeNext("https://evil.test")).toBe("/admin");
    expect(safeNext("//evil.test/admin")).toBe("/admin");
    expect(safeNext("/")).toBe("/admin");
    expect(safeNext("/administrator")).toBe("/admin");
    expect(safeNext(null)).toBe("/admin");
  });
});
