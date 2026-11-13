# Deployment

Gravemarch's private playtest uses [ChatGPT Sites](https://learn.chatgpt.com/docs/sites) for the game client and same-origin account Worker. The linked Site ID is in `.openai/hosting.json`. Sites access and RGBoner player accounts are separate. For a private two-player test, both players need Site access and their own verified RGBoner accounts.

## Build and publish

Use Node 22.13 or later, run `npm ci`, `npm run check`, `npm run test:accounts`, and `npm run build:site`. The last command builds the Worker at `dist/server/index.js`, the Vite client at `dist/client`, and copies the hosting manifest. The Sites source workflow publishes this output and applies migrations from `drizzle/` to its D1 binding. See [Auth](AUTH.md) for runtime settings on both Sites.

## Match hosting

The authoritative Node process uses WebSockets and runs the shared simulation at 20 Hz. The private playtest match process on the Mac mini listens at `127.0.0.1:8788`. Tailscale Funnel forwards public TLS port 10000 to it. The WebSocket upgrade checks the Site origin and the protocol requires a short-lived RGBoner match ticket. The Mac mini must be awake and its user session running.

On the Mac mini, the LaunchAgent is `com.alexpopa.gravemarch-match`. Use `launchctl print gui/$(id -u)/com.alexpopa.gravemarch-match` to inspect it and `launchctl kickstart -k gui/$(id -u)/com.alexpopa.gravemarch-match` to reload the match process after source changes. The local runtime configuration and logs live in `~/Library/Application Support/Gravemarch/`. Rotate the match-ticket key in both runtime environments and redeploy when needed. Check `/health` on port 8788 locally and port 10000 through Funnel. Restarting the match process ends active games.

## Local play

`npm run dev:all` starts Vite on port 5173 and the guest Node match server on port 8788. If the hosted process is using 8788, run the guest server with `SERVER_PORT=8789` and start Vite with `VITE_SERVER_URL=ws://localhost:8789`. Solo play runs in the browser. The match code and state are held in process memory. Reconnect and larger team sizes remain future work.
