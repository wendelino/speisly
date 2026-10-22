import { beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  SignJWT,
} from "jose";
import { createAdminAuth, safeNext } from "./admin-auth";

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
};

/** Simulierter Provider; merkt sich, was an den Token-Endpoint ging */
function setup(provider: Provider) {
  const tokenRequests: { headers: Headers; body: URLSearchParams }[] = [];
  let nonce = "";
  const fakeFetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = String(input);
    if (url.endsWith("/.well-known/openid-configuration")) {
      return Response.json(DISCOVERY);
    }
    if (url === DISCOVERY.token_endpoint) {
      tokenRequests.push({
        headers: new Headers(init?.headers),
        body: new URLSearchParams(String(init?.body)),
      });
      return Response.json({
        id_token: await provider.claims(nonce),
        access_token: "access",
      });
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

  return { auth, login, tokenRequests };
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
    expect(url.searchParams.get("scope")).toBe("openid profile email groups");
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
