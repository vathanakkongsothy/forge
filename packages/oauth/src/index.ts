import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Public Grok Build CLI desktop client. Not a secret. */
export const GROK_OAUTH_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
export const GROK_OAUTH_ISSUER = "https://auth.x.ai";
export const GROK_OAUTH_SCOPE =
  "openid profile email offline_access grok-cli:access api:access";
const DISCOVERY_URL = `${GROK_OAUTH_ISSUER}/.well-known/openid-configuration`;
const TOKEN_URL = `${GROK_OAUTH_ISSUER}/oauth2/token`;
const AUTHORIZE_URL = `${GROK_OAUTH_ISSUER}/oauth2/authorize`;
const USERINFO_URL = `${GROK_OAUTH_ISSUER}/oauth2/userinfo`;
const REFRESH_SKEW_MS = 5 * 60 * 1000;
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export type AuthMethod = "oauth" | "api-key";

export type AuthStatus = {
  signedIn: boolean;
  method: AuthMethod | null;
  name: string | null;
  email: string | null;
  expiresAt: string | null;
  cliPresent: boolean;
};

export type GrokSession = {
  key: string;
  auth_mode: string;
  create_time: string;
  user_id: string | null;
  email: string | null;
  first_name: string | null;
  profile_image_asset_id?: string | null;
  principal_type?: string | null;
  principal_id?: string | null;
  team_id?: string | null;
  coding_data_retention_opt_out?: boolean;
  refresh_token?: string | null;
  expires_at?: string | null;
  oidc_issuer?: string | null;
  oidc_client_id?: string | null;
};

type Discovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
};

function grokHome(): string {
  return process.env.GROK_HOME?.trim() || path.join(os.homedir(), ".grok");
}

function authFile(): string {
  return path.join(grokHome(), "auth.json");
}

function sessionKey(issuer = GROK_OAUTH_ISSUER, clientId = GROK_OAUTH_CLIENT_ID): string {
  return `${issuer}::${clientId}`;
}

export function findGrokCli(): string | null {
  const bin = process.platform === "win32" ? "grok.exe" : "grok";
  const candidates = [
    process.env.GROK_BIN,
    path.join(grokHome(), "bin", bin),
    path.join(grokHome(), bin),
  ].filter((p): p is string => Boolean(p));
  for (const file of candidates) {
    if (existsSync(file)) return file;
  }
  return null;
}

function readStore(): Record<string, GrokSession> {
  try {
    const file = authFile();
    if (!existsSync(file)) return {};
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, GrokSession>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, GrokSession>): void {
  const dir = grokHome();
  mkdirSync(dir, { recursive: true });
  writeFileSync(authFile(), `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function readGrokSession(): GrokSession | null {
  const store = readStore();
  const exact = store[sessionKey()];
  if (exact?.key) return exact;
  const fallback = Object.values(store).find((entry) => entry?.key && entry.oidc_issuer?.includes("auth.x.ai"));
  return fallback ?? null;
}

export function writeGrokSession(session: GrokSession): void {
  const store = readStore();
  store[sessionKey(session.oidc_issuer || GROK_OAUTH_ISSUER, session.oidc_client_id || GROK_OAUTH_CLIENT_ID)] =
    session;
  writeStore(store);
}

export function clearGrokSession(): void {
  const store = readStore();
  delete store[sessionKey()];
  for (const [key, entry] of Object.entries(store)) {
    if (entry?.oidc_client_id === GROK_OAUTH_CLIENT_ID || key.includes(GROK_OAUTH_CLIENT_ID)) {
      delete store[key];
    }
  }
  writeStore(store);
}

function assertXaiUrl(url: string, field: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error(`${field} must be HTTPS.`);
  const host = parsed.hostname.toLowerCase();
  if (host !== "x.ai" && !host.endsWith(".x.ai")) throw new Error(`${field} is not an xAI host.`);
  return url;
}

async function discover(): Promise<Discovery> {
  const response = await fetch(DISCOVERY_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`xAI OIDC discovery failed (${response.status}).`);
  const payload = (await response.json()) as Discovery;
  return {
    authorization_endpoint: assertXaiUrl(payload.authorization_endpoint || AUTHORIZE_URL, "authorization_endpoint"),
    token_endpoint: assertXaiUrl(payload.token_endpoint || TOKEN_URL, "token_endpoint"),
    userinfo_endpoint: payload.userinfo_endpoint
      ? assertXaiUrl(payload.userinfo_endpoint, "userinfo_endpoint")
      : USERINFO_URL,
  };
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

function expiresAtFrom(expiresIn?: unknown, fallbackMs = 30 * 24 * 60 * 60 * 1000): string {
  const seconds = typeof expiresIn === "number" && Number.isFinite(expiresIn) ? expiresIn : fallbackMs / 1000;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function isExpired(expiresAt?: string | null, skewMs = REFRESH_SKEW_MS): boolean {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return false;
  return ms - skewMs <= Date.now();
}

async function parseTokenResponse(response: Response, fallbackRefresh?: string | null): Promise<{
  access_token: string;
  refresh_token: string;
  expires_at: string;
}> {
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error("xAI token response was not JSON.");
  }
  if (!response.ok) {
    const detail = String(payload.error_description || payload.error || text || response.status);
    throw new Error(`xAI token request failed: ${detail}`);
  }
  const access = String(payload.access_token ?? "").trim();
  const refresh = String(payload.refresh_token ?? fallbackRefresh ?? "").trim();
  if (!access) throw new Error("xAI token response missing access_token.");
  return {
    access_token: access,
    refresh_token: refresh,
    expires_at: expiresAtFrom(payload.expires_in),
  };
}

async function fetchUserinfo(accessToken: string, endpoint = USERINFO_URL): Promise<{
  sub?: string;
  email?: string;
  name?: string;
  given_name?: string;
}> {
  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!response.ok) return {};
    return (await response.json()) as { sub?: string; email?: string; name?: string; given_name?: string };
  } catch {
    return {};
  }
}

function toSession(
  tokens: { access_token: string; refresh_token: string; expires_at: string },
  profile: { sub?: string; email?: string; name?: string; given_name?: string },
  previous?: GrokSession | null,
): GrokSession {
  const name = profile.given_name || profile.name || previous?.first_name || null;
  const userId = profile.sub || previous?.user_id || previous?.principal_id || null;
  return {
    key: tokens.access_token,
    auth_mode: "oidc",
    create_time: previous?.create_time || new Date().toISOString(),
    user_id: userId,
    email: profile.email ?? previous?.email ?? null,
    first_name: name,
    profile_image_asset_id: previous?.profile_image_asset_id ?? null,
    principal_type: previous?.principal_type ?? "User",
    principal_id: userId,
    team_id: previous?.team_id ?? null,
    coding_data_retention_opt_out: previous?.coding_data_retention_opt_out ?? true,
    refresh_token: tokens.refresh_token || previous?.refresh_token || null,
    expires_at: tokens.expires_at,
    oidc_issuer: GROK_OAUTH_ISSUER,
    oidc_client_id: GROK_OAUTH_CLIENT_ID,
  };
}

export async function refreshGrokSession(session = readGrokSession()): Promise<GrokSession | null> {
  if (!session?.refresh_token) return session?.key ? session : null;
  const { token_endpoint, userinfo_endpoint } = await discover();
  const response = await fetch(token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "x-grok-client-surface": "grok-build",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: GROK_OAUTH_CLIENT_ID,
      refresh_token: session.refresh_token,
    }),
  });
  const tokens = await parseTokenResponse(response, session.refresh_token);
  const profile = await fetchUserinfo(tokens.access_token, userinfo_endpoint);
  const next = toSession(tokens, profile, session);
  writeGrokSession(next);
  return next;
}

export async function resolveGrokAccessToken(): Promise<string | null> {
  const session = readGrokSession();
  if (!session?.key) return null;
  if (!isExpired(session.expires_at)) return session.key;
  try {
    const refreshed = await refreshGrokSession(session);
    return refreshed?.key ?? null;
  } catch {
    return session.key;
  }
}

export function grokAuthStatus(hasApiKey: boolean): AuthStatus {
  const session = readGrokSession();
  if (session?.key) {
    return {
      signedIn: true,
      method: "oauth",
      name: session.first_name || null,
      email: session.email || null,
      expiresAt: session.expires_at || null,
      cliPresent: Boolean(findGrokCli()),
    };
  }
  if (hasApiKey) {
    return {
      signedIn: true,
      method: "api-key",
      name: null,
      email: null,
      expiresAt: null,
      cliPresent: Boolean(findGrokCli()),
    };
  }
  return {
    signedIn: false,
    method: null,
    name: null,
    email: null,
    expiresAt: null,
    cliPresent: Boolean(findGrokCli()),
  };
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>${title}</title>
<style>
  html,body{height:100%;margin:0;background:#0c0d10;color:#eceef1;font-family:Segoe UI,sans-serif}
  main{min-height:100%;display:flex;align-items:center;justify-content:center}
  .card{width:420px;padding:28px;border:1px solid #2a2e37;border-radius:16px;background:#14161b}
  h1{margin:0 0 8px;font-size:20px}
  p{margin:0;color:#8b919c;line-height:1.5}
</style></head>
<body><main><div class="card"><h1>${title}</h1><p>${body}</p></div></main></body></html>`;
}

function readCallback(req: IncomingMessage): URL {
  return new URL(req.url || "/", "http://127.0.0.1");
}

export async function loginWithGrokOAuth(openUrl: (url: string) => Promise<void> | void): Promise<GrokSession> {
  const { authorization_endpoint, token_endpoint, userinfo_endpoint } = await discover();
  const { verifier, challenge } = pkce();
  const state = randomBytes(24).toString("hex");
  const nonce = randomBytes(24).toString("hex");

  const { port, wait, close } = await listenForCallback();
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const authorize = new URL(authorization_endpoint);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", GROK_OAUTH_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", GROK_OAUTH_SCOPE);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("nonce", nonce);
  authorize.searchParams.set("referrer", "grok-build");

  try {
    await openUrl(authorize.toString());
    const callback = await wait;
    if (callback.error) throw new Error(callback.error);
    if (callback.state !== state) throw new Error("OAuth state mismatch.");
    if (!callback.code) throw new Error("OAuth callback missing authorization code.");

    const response = await fetch(token_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "x-grok-client-surface": "grok-build",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: callback.code,
        redirect_uri: redirectUri,
        client_id: GROK_OAUTH_CLIENT_ID,
        code_verifier: verifier,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }),
    });
    const tokens = await parseTokenResponse(response);
    const profile = await fetchUserinfo(tokens.access_token, userinfo_endpoint);
    const session = toSession(tokens, profile, readGrokSession());
    writeGrokSession(session);
    return session;
  } finally {
    close();
  }
}

function listenForCallback(): Promise<{
  port: number;
  wait: Promise<{ code?: string; state?: string; error?: string }>;
  close: () => void;
}> {
  return new Promise((resolveListen, rejectListen) => {
    const server = createServer();
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const close = () => {
      if (timer) clearTimeout(timer);
      server.close();
    };

    const wait = new Promise<{ code?: string; state?: string; error?: string }>((resolve, reject) => {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        close();
        reject(new Error("Grok sign-in timed out. Try again."));
      }, LOGIN_TIMEOUT_MS);

      server.on("request", (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end();
          return;
        }
        const url = readCallback(req);
        if (url.pathname !== "/callback" && url.pathname !== "/") {
          res.statusCode = 404;
          res.end();
          return;
        }
        const error = url.searchParams.get("error_description") || url.searchParams.get("error");
        const payload = {
          code: url.searchParams.get("code") ?? undefined,
          state: url.searchParams.get("state") ?? undefined,
          error: error ?? undefined,
        };
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          htmlPage(
            error ? "Sign-in failed" : "Signed in to Forge",
            error ? escapeHtml(error) : "You can close this tab and return to Forge.",
          ),
        );
        if (!settled) {
          settled = true;
          if (timer) clearTimeout(timer);
          resolve(payload);
        }
      });
    });

    server.on("error", (err) => {
      if (!settled) rejectListen(err);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        rejectListen(new Error("Could not bind OAuth callback port."));
        return;
      }
      resolveListen({ port: address.port, wait, close });
    });
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

export const EMPTY_AUTH: AuthStatus = {
  signedIn: false,
  method: null,
  name: null,
  email: null,
  expiresAt: null,
  cliPresent: false,
};
