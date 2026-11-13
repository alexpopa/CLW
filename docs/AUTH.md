# Player accounts

Players use their existing verified RGBoner account. RGBoner is the Social Links project in `alexpopa/savepoint`. It owns passwords, email verification, password reset, and Resend delivery. CLW stores its own player record and session in D1. Solo play can run without an account.

## Browser flow

1. The Gravemarch home page offers Play singleplayer and an RGBoner email and password form. The form links to RGBoner registration in a new tab. The form first obtains a browser-bound challenge from `POST /auth/challenge`.
2. The browser submits the credentials and challenge directly over HTTPS to RGBoner's connector. RGBoner verifies the password, email verification and rate limit using the same code as its own sign-in. It returns a signed, one-minute assertion bound to a fresh challenge.
3. The browser submits the assertion to `POST /auth/complete`. The CLW Worker verifies it and consumes the challenge in D1 as it creates a seven-day HttpOnly session. CLW stores only the hash of the session token. CLW does not store the password or create an RGBoner browser session.
4. `GET /me` returns the player identity and unlocks the multiplayer lobby controls. `POST /auth/logout` revokes the CLW session and returns to the home page.

The earlier redirect connector still supports completing sign-ins already in progress. The old `/login` and `/account` pages redirect home.

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
