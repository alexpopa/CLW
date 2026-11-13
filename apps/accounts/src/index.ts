interface Statement {
  bind(...values: (string | number)[]): Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface Env {
  DB: {
    prepare(sql: string): Statement;
    batch(statements: Statement[]): Promise<unknown>;
  };
  RGBONER_ORIGIN: string;
  CLW_ORIGIN: string;
  RGBONER_SSO_SECRET: string;
  MATCH_SERVER_URL?: string;
  MATCH_TICKET_SECRET?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

type Assertion = { aud: string; iss: string; sub: string; name: string; challenge: string; exp: number };

const encoder = new TextEncoder();
const sessionSeconds = 7 * 24 * 60 * 60;
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const tokenPattern = /^[a-f0-9]{64}$/;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

async function digest(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
}

async function verify(assertion: string, verifier: string, env: Env): Promise<Assertion | null> {
  if (!/^[\w-]{1,2048}\.[\w-]{43}$/.test(assertion)) return null;
  try {
    const [payload, signature] = assertion.split(".") as [string, string];
    const key = await crypto.subtle.importKey("raw", encoder.encode(env.RGBONER_SSO_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("HMAC", key, fromBase64Url(signature), encoder.encode(payload))) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as Assertion;
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== env.RGBONER_ORIGIN || claims.aud !== env.CLW_ORIGIN ||
        !Number.isInteger(claims.exp) || claims.exp <= now || claims.exp > now + 60 ||
        claims.challenge !== await digest(verifier) ||
        typeof claims.sub !== "string" || !/^[\w:-]{1,128}$/.test(claims.sub) ||
        typeof claims.name !== "string" || !claims.name.trim() || claims.name.length > 128) return null;
    return claims;
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string): string | null {
  const matches = (request.headers.get("Cookie") ?? "").split(";").map(value => value.trim())
    .filter(value => value.startsWith(name + "="));
  const token = matches.length === 1 ? matches[0]!.slice(name.length + 1) : "";
  return tokenPattern.test(token) ? token : null;
}

function cookie(name: string, value: string, age: number): string {
  return `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
}

function redirect(path: string, cookies: string[] = []): Response {
  const response = new Response(null, { status: 303, headers: { ...headers, Location: path } });
  for (const value of cookies) response.headers.append("Set-Cookie", value);
  return response;
}

function html(title: string, body: string): Response {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><main><h1>${title}</h1>${body}</main></html>`, {
    headers: { ...headers, "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; form-action 'self' https:; base-uri 'none'; frame-ancestors 'none'" },
  });
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createSession(claims: Assertion, env: Env): Promise<Response> {
  const used = await env.DB.prepare("SELECT 1 FROM consumed_sign_ins WHERE challenge = ? AND expires_at > ?")
    .bind(claims.challenge, Math.floor(Date.now() / 1000)).first();
  if (used) return new Response("Sign-in already used.", { status: 409, headers });

  const userId = `rgboner:${claims.sub}`;
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(Date.now()),
    env.DB.prepare("DELETE FROM consumed_sign_ins WHERE expires_at <= ?").bind(Math.floor(Date.now() / 1000)),
    env.DB.prepare("INSERT INTO consumed_sign_ins (challenge, expires_at) VALUES (?, ?)").bind(claims.challenge, claims.exp),
    env.DB.prepare("INSERT INTO players (id, display_name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name").bind(userId, claims.name),
    env.DB.prepare("INSERT INTO sessions (token_hash, player_id, expires_at) VALUES (?, ?, ?)")
      .bind(await digest(token), userId, Date.now() + sessionSeconds * 1000),
  ]);
  const response = new Response(null, { status: 204, headers });
  response.headers.append("Set-Cookie", cookie("__Host-clw-session", token, sessionSeconds));
  response.headers.append("Set-Cookie", cookie("__Host-clw-flow", "", 0));
  return response;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname, origin } = new URL(request.url);
    const route = `${request.method} ${pathname}`;
    if (request.method === "GET" && env.ASSETS && (pathname === "/" || pathname.startsWith("/assets/"))) {
      return env.ASSETS.fetch(request);
    }
    if (route === "GET /login" || route === "GET /account") return redirect("/");
    if (route === "GET /auth/callback") {
      return html("Finishing sign-in", '<p id="status" role="status">Connecting to RGBoner…</p><p><a href="/login">Back to sign-in</a></p><script src="/auth/callback.js" defer></script>');
    }
    if (route === "GET /auth/callback.js") {
      return new Response(`
        const assertion = new URLSearchParams(location.hash.slice(1)).get("assertion");
        history.replaceState(null, "", location.pathname);
        (async () => {
          if (!assertion) throw new Error();
          const response = await fetch("/auth/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assertion }),
          });
          if (!response.ok) throw new Error();
          location.replace("/");
        })().catch(() => {
          document.querySelector("#status").textContent = "Sign-in could not be completed. Please start again.";
        });
      `, { headers: { ...headers, "Content-Type": "text/javascript; charset=utf-8" } });
    }
    if (env.CLW_ORIGIN !== origin || !origin.startsWith("https://") || !env.RGBONER_ORIGIN ||
        !/^[a-f0-9]{64}$/.test(env.RGBONER_SSO_SECRET ?? "") || !env.DB) {
      return new Response("Account service is not configured.", { status: 503, headers });
    }
    if (request.method === "POST" && request.headers.get("Origin") !== env.CLW_ORIGIN) {
      return new Response("Invalid request origin.", { status: 403, headers });
    }
    try {
      if (route === "POST /auth/start") {
        const verifier = randomToken();
        const destination = new URL("/connect/line-wars", env.RGBONER_ORIGIN);
        if (destination.origin !== env.RGBONER_ORIGIN || destination.protocol !== "https:") {
          return new Response("Account service is not configured.", { status: 503, headers });
        }
        destination.searchParams.set("challenge", await digest(verifier));
        return redirect(destination.href, [cookie("__Host-clw-flow", verifier, 900)]);
      }
      if (route === "POST /auth/complete") {
        const verifier = readCookie(request, "__Host-clw-flow");
        const raw = await request.text();
        if (raw.length > 4096) return new Response("Invalid sign-in.", { status: 400, headers });
        let body: unknown;
        try { body = JSON.parse(raw); } catch { body = null; }
        const assertion = body && typeof body === "object" && "assertion" in body ? body.assertion : null;
        const claims = verifier && typeof assertion === "string" ? await verify(assertion, verifier, env) : null;
        if (!claims) return new Response("Invalid sign-in.", { status: 401, headers });

        return createSession(claims, env);
      }
      if (route === "POST /auth/challenge") {
        const verifier = randomToken();
        return Response.json({
          challenge: await digest(verifier),
          endpoint: new URL("/connect/line-wars", env.RGBONER_ORIGIN).href,
        }, { headers: { ...headers, "Set-Cookie": cookie("__Host-clw-flow", verifier, 900) } });
      }
      if (route === "POST /auth/logout") {
        const token = readCookie(request, "__Host-clw-session");
        if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await digest(token)).run();
        return redirect("/", [cookie("__Host-clw-session", "", 0), cookie("__Host-clw-flow", "", 0)]);
      }
      if (route === "GET /me" || route === "POST /auth/match-ticket") {
        const token = readCookie(request, "__Host-clw-session");
        const user = token ? await env.DB.prepare(
          "SELECT players.id AS userId, players.display_name AS displayName FROM sessions JOIN players ON players.id = sessions.player_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
        ).bind(await digest(token), Date.now()).first<{ userId: string; displayName: string }>() : null;
        if (route === "POST /auth/match-ticket") {
          if (!user) return new Response(null, { status: 401, headers });
          const secret = env.MATCH_TICKET_SECRET ?? "";
          const serverUrl = env.MATCH_SERVER_URL;
          if (!serverUrl || new URL(serverUrl).protocol !== "wss:" || !tokenPattern.test(secret)) {
            return new Response(null, { status: 503, headers });
          }
          const payload = base64Url(encoder.encode(JSON.stringify({
            ...user, aud: serverUrl, exp: Math.floor(Date.now() / 1000) + 30, nonce: randomToken(),
          })));
          const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
          const signature = base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
          return Response.json({ serverUrl, token: payload + "." + signature }, { headers });
        }
        return Response.json(user ? { ...user, provider: "rgboner" } : { error: "Sign-in required." }, { status: user ? 200 : 401, headers });
      }
      return new Response("Not found.", { status: 404, headers });
    } catch {
      return new Response("Account service is temporarily unavailable.", { status: 503, headers });
    }
  },
};
