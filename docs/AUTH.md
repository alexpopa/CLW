# Player accounts

Players use their existing verified RGBoner account. RGBoner is the Social Links project in `alexpopa/savepoint`. It owns passwords, email verification, password reset, and Resend delivery. CLW stores its own player record and session in D1. Solo play can run without an account.

## Browser flow

1. CLW serves a plain sign-in page at `/login`. Its same-origin `POST /auth/start` sets a short-lived browser cookie and redirects to RGBoner's `/connect/line-wars` with a SHA-256 challenge.
2. RGBoner checks its existing verified account session. It uses its regular login page if needed. The connector signs the account ID, display name, challenge, issuer, audience, and expiration, then returns to the configured CLW callback.
3. The CLW callback strips the assertion from the URL fragment and submits it to `POST /auth/complete`. The Worker verifies the signature, configured origins, one-minute expiration, and initiating browser cookie. A D1 transaction consumes the challenge and creates a seven-day session. The database stores only the hash of the session token.
4. `GET /me` returns `{ userId, displayName, provider }` or HTTP 401. `POST /auth/logout` revokes the CLW session. RGBoner's account session has its own lifetime and sign-out.

The provider is `rgboner` and the stable ID is `rgboner:<RGBoner user ID>`. Game code should depend on the shared `UserIdentity` contract. The handoff contains no password, email address, RGBoner session token, or account role. CLW sign-in refreshes the local display name. Changes to an RGBoner account do not revoke already-issued CLW sessions before their own expiry.

## Online matches

The hosted game requests a match ticket from same-origin `POST /auth/match-ticket`. The Worker resolves the HttpOnly account session in D1, then returns a signed ticket scoped to the configured WebSocket URL. The ticket carries the stable player ID and display name, expires after 30 seconds, and can be redeemed once on the match process. The browser sends it in the WebSocket hello message. The account cookie remains on the Site. Signing out prevents new tickets. Existing connections continue until closed.

Local Vite builds use guest names by default. Run `NODE_ENV=development AUTH_PROVIDER=dev npm run dev:server` to enable the local mock login endpoint.

## Deployment configuration

- CLW Site: set `CLW_ORIGIN` and `RGBONER_ORIGIN` to the canonical HTTPS origins. Sites provisions the `DB` binding and applies `drizzle/0000_accounts.sql`.
- RGBoner Site: set `CLW_ORIGIN` and keep `AUTH_PUBLIC_URL` equal to the canonical RGBoner HTTPS origin. Deploy the RGBoner connector at `/connect/line-wars`.
- Both Sites use the same dedicated secret `RGBONER_SSO_SECRET`. Generate 32 random bytes encoded as 64 lowercase hex characters. CLW uses RGBoner's existing Resend flow for account emails.
- CLW Site and match process use the same `MATCH_SERVER_URL` and a separate `MATCH_TICKET_SECRET` with the same encoding. Set `AUTH_PROVIDER=rgboner` and `CLIENT_ORIGIN` on the match process.
- Run `npm run test:accounts` on Node 22.13 or later. For hosted verification, sign in through RGBoner in two separate browser profiles, verify `/me`, start a match using a lobby code, and verify sign-out.
