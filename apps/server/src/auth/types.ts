import type { UserIdentity } from "@lw/protocol";

/**
 * The ONLY auth contract the rest of the server depends on.
 * The development adapter is in dev.ts. See docs/AUTH.md for the player account plan.
 */
export interface AuthProvider {
  readonly name: string;
  /** Build the URL the browser is redirected to when starting login. */
  beginLogin(opts: { redirectAfter: string }): Promise<{ redirectUrl: string; cookies?: Record<string, string> }>;
  /** Handle the callback; return the verified identity. Throw on any validation failure. */
  completeLogin(query: URLSearchParams, cookies: Record<string, string>): Promise<UserIdentity>;
}

export interface SessionStore {
  create(user: UserIdentity): Promise<string>;           // returns opaque session token
  resolve(token: string): Promise<UserIdentity | null>;
  destroy(token: string): Promise<void>;
}
