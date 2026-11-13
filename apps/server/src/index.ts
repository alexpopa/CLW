import { createServer } from "node:http";
import { randomInt } from "node:crypto";
import { WebSocketServer } from "ws";
import { TICK_RATE } from "@lw/sim";
import { devAuth, memorySessions } from "./auth/dev";
import { guestSessions } from "./auth/guest";
import { rgbSessions } from "./auth/rgboner";
import { Hub } from "./hub";

/**
 * Match server: HTTP health check plus one WebSocket endpoint that carries the protocol in
 * packages/protocol. Lobbies and matches live in hub.ts.
 *
 * AUTH_PROVIDER=guest (default)  players pick a display name; for private playtests on a LAN or tailnet
 * AUTH_PROVIDER=dev              mock login via /auth/login?name=..., localhost only, NODE_ENV=development
 * CLIENT_ORIGIN                  comma-separated list of browser origins allowed to connect; unset = any
 */
const port = Number(process.env.SERVER_PORT ?? 8788);
const provider = process.env.AUTH_PROVIDER ?? "guest";
const origins = (process.env.CLIENT_ORIGIN ?? "").split(",").map(o => o.trim()).filter(Boolean);
const originOk = (o: string | undefined) => origins.length === 0 || (o !== undefined && origins.includes(o));

const dev = provider === "dev";
if (dev && process.env.NODE_ENV !== "development") throw new Error("AUTH_PROVIDER=dev requires NODE_ENV=development");
const hosted = provider === "rgboner";
if (hosted && origins.length === 0) throw new Error("CLIENT_ORIGIN is required for RGBoner sign-in");
if (!dev && !hosted && provider !== "guest") throw new Error(`Unknown AUTH_PROVIDER "${provider}"`);
const devSessions = dev ? memorySessions() : null;
const sessions = hosted
  ? rgbSessions(process.env.MATCH_TICKET_SECRET ?? "", process.env.MATCH_SERVER_URL ?? "")
  : devSessions ?? guestSessions();
const hub = new Hub(sessions, { random: n => randomInt(n) });

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (originOk(req.headers.origin)) res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  if (url.pathname === "/health") { res.end("ok"); return; }
  if (devSessions && url.pathname === "/auth/login") {
    const user = await devAuth.completeLogin(url.searchParams, {});
    const token = await devSessions.create(user);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ token, user }));
    return;
  }
  res.statusCode = 404; res.end("not found");
});

const MAX_MSGS_PER_SEC = 60;
const wss = new WebSocketServer({ server, maxPayload: 4096, verifyClient: (info: { origin: string }) => originOk(info.origin) });
wss.on("connection", ws => {
  const client = hub.connect({
    send: msg => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); },
    close: () => ws.close(),
  });
  let windowStart = Date.now(), count = 0;
  ws.on("message", (data, isBinary) => {
    const now = Date.now();
    if (now - windowStart >= 1000) { windowStart = now; count = 0; }
    if (isBinary || ++count > MAX_MSGS_PER_SEC) { ws.close(1008, "protocol"); return; }
    let msg: unknown;
    try { msg = JSON.parse(data.toString()); } catch { ws.close(1008, "protocol"); return; }
    client.onMessage(msg);
  });
  ws.on("close", () => client.onClose());
  ws.on("error", () => ws.close());
});

setInterval(() => hub.pump(), Math.floor(1000 / TICK_RATE / 2));

// Mock login never leaves this machine; guest play listens everywhere so other devices can join.
server.listen(port, dev ? "localhost" : process.env.SERVER_HOST, () => console.log(`match server on :${port} (${provider} sign-in)`));
