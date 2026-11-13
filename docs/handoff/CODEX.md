# Auth and multiplayer handoff

This brief applies to any coding agent. Start with [AGENTS.md](../../AGENTS.md) and the [roadmap](../ROADMAP.md).

The [auth guide](../AUTH.md) describes RGBoner single sign-on, the Worker routes, D1, and both Sites’ configuration. Use the shared `UserIdentity` boundary for game services.

For multiplayer, implement lobbies, per-tick command batching, snapshots, and reconnect using the shared protocol and simulation. See [architecture](../ARCHITECTURE.md) and [deployment](../DEPLOYMENT.md) for the runtime boundary.

## Status on 2026-11-13 and what is still needed

**Works today.** The solo game against the bot is complete and runs entirely in the browser (`npm run build` writes the static client to `apps/client/dist`). It needs no server and no account, so it can be published to a Site as a guest playtest right now.

**Sign-in.** The accounts Worker (`apps/accounts`) and its local contract test exist, but nothing is hosted: no Site is configured, the D1 migration has not been applied, the shared secret is not set, and the browser flow has never been verified on real origins. The game client does not call `/me` yet.

**Multiplayer.** 1v1 works with guest names on a private network: `apps/server/src/hub.ts` (lobbies by four-letter code, authoritative tick loop, autopilot for empty or abandoned seats) behind a WebSocket endpoint in `index.ts`, and the client's online mode in `apps/client/src/net.ts` and `main.ts`. It is not hosted anywhere and has no real sign-in: `auth/guest.ts` accepts any display name.

### Hosting and sign-in tasks (need the owner's ChatGPT Sites access)
1. Publish the static client: package `apps/client/dist` for a Site and confirm a guest can finish a match against the bot.
2. Stand up the accounts Site: bind D1 as `DB`, apply `apps/accounts/migrations/0001_accounts.sql`, set `CLW_ORIGIN`, `RGBONER_ORIGIN` and `RGBONER_SSO_SECRET` on both sides as described in the [auth guide](../AUTH.md), then verify sign-in, `/me` and sign-out on the hosted origins.
3. Decide where the match server runs. It is a long-lived Node process with WebSockets and a fixed 20 Hz tick. If Sites cannot host that, name the separate host and its public `wss://` origin.
4. Give the match server a way to check a player: either a server-to-server route on the accounts Worker that turns a CLW session token into a `UserIdentity`, or a short-lived signed ticket the client fetches from the accounts Site and presents in the WebSocket `hello`. The game server must not see passwords or RGBoner tokens.

### Match server contract the game side will follow
- Identity reaches the hub only as `SessionStore.resolve(token) → UserIdentity` (`apps/server/src/auth/types.ts`). Guest play passes `guest:<name>` as the token in the WebSocket `hello`; hosted sign-in replaces `guestSessions()` with a store that checks the real CLW session or ticket (item 4), and the client sends that token instead. Nothing else changes.
- One authoritative `@lw/sim` instance per match; clients send `Command`s and render the server's ticks. Empty seats are filled by `simpleAI`.
