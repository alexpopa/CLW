import { createHmac, timingSafeEqual } from "node:crypto";
import type { UserIdentity } from "@lw/protocol";
import type { SessionStore } from "./types";

export function rgbSessions(secret: string, audience: string): Pick<SessionStore, "resolve"> {
  if (!/^[a-f0-9]{64}$/.test(secret) || new URL(audience).protocol !== "wss:") {
    throw new Error("RGBoner match authentication requires MATCH_TICKET_SECRET and a wss: MATCH_SERVER_URL");
  }
  const redeemed = new Map<string, number>();
  return {
    async resolve(token): Promise<UserIdentity | null> {
      const match = /^([\w-]{1,2048})\.([\w-]{43})$/.exec(token);
      if (!match) return null;
      const [, payload, signature] = match as unknown as [string, string, string];
      const expected = createHmac("sha256", secret).update(payload).digest();
      const actual = Buffer.from(signature, "base64url");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
      try {
        const { userId, displayName, aud, exp, nonce } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        if (aud !== audience || !Number.isInteger(exp) || exp <= now || exp > now + 30 ||
            typeof nonce !== "string" || !/^[a-f0-9]{64}$/.test(nonce) ||
            typeof userId !== "string" || !/^rgboner:[\w:-]{1,128}$/.test(userId) ||
            typeof displayName !== "string" || !displayName.trim() || displayName.length > 128) return null;
        for (const [used, expiry] of redeemed) if (expiry <= now) redeemed.delete(used);
        if (redeemed.has(nonce)) return null;
        redeemed.set(nonce, exp);
        return { userId, displayName, provider: "rgboner" };
      } catch {
        return null;
      }
    },
  };
}
