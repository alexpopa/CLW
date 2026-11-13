import { randomUUID } from "node:crypto";
import type { UserIdentity } from "@lw/protocol";
import type { SessionStore } from "./types";

/**
 * Guest play: no accounts. The "session token" is `guest:<display name>` and every connection gets a
 * fresh throwaway identity. For private playtests (LAN, tailnet) until hosted sign-in exists (docs/AUTH.md).
 * Game code still sees only UserIdentity, so swapping this for real sessions changes nothing else.
 */
export function guestSessions(): Pick<SessionStore, "resolve"> {
  return {
    async resolve(token: string): Promise<UserIdentity | null> {
      if (!token.startsWith("guest:")) return null;
      // Letters, digits, spaces and a little punctuation only: the name is shown to other players.
      const name = token.slice(6).replace(/[^\p{L}\p{N} _.'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 20) || "Wanderer";
      return { userId: `guest:${randomUUID()}`, displayName: name, provider: "guest" };
    },
  };
}
