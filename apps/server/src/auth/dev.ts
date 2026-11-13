import { randomUUID } from "node:crypto";
import type { UserIdentity } from "@lw/protocol";
import type { AuthProvider, SessionStore } from "./types";

/** DEV ONLY. Lets anyone log in with a name via /auth/login?name=Foo. Refuse to run in production. */
export const devAuth: AuthProvider = {
  name: "dev",
  async beginLogin({ redirectAfter }) {
    return { redirectUrl: redirectAfter };
  },
  async completeLogin(query) {
    const name = (query.get("name") ?? "Player").slice(0, 24);
    return { userId: `dev:${name.toLowerCase()}`, displayName: name, provider: "dev" };
  },
};

/** In-memory sessions. Replace with DB-backed store before real deployment. */
export function memorySessions(): SessionStore {
  const m = new Map<string, UserIdentity>();
  return {
    async create(u) { const t = randomUUID(); m.set(t, u); return t; },
    async resolve(t) { return m.get(t) ?? null; },
    async destroy(t) { m.delete(t); },
  };
}
