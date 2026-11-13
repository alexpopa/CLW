import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../../../dist/server/index.js";

test("RGBoner sign-in requires the initiating browser and cannot be replayed after logout", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync(new URL("../../../drizzle/0000_accounts.sql", import.meta.url), "utf8"));
    const origin = "https://clw.example";
    const issuer = "https://rgboner.example";
    const secret = "a".repeat(64);
    const env = {
      CLW_ORIGIN: origin,
      RGBONER_ORIGIN: issuer,
      RGBONER_SSO_SECRET: secret,
      DB: {
        prepare(sql) {
          return {
            bind(...args) {
              return {
                first: async () => db.prepare(sql).get(...args),
                run: async () => db.prepare(sql).run(...args),
              };
            },
          };
        },
        async batch(statements) {
          db.exec("BEGIN");
          try {
            for (const statement of statements) await statement.run();
            db.exec("COMMIT");
          } catch (error) {
            db.exec("ROLLBACK");
            throw error;
          }
        },
      },
    };
    const request = (path, options) => worker.fetch(new Request(origin + path, options), env);
    const start = await request("/auth/start", { method: "POST", headers: { Origin: origin } });
    assert.equal(start.status, 303);
    const flow = start.headers.getSetCookie()[0].split(";")[0];
    const destination = new URL(start.headers.get("Location"));
    const challenge = destination.searchParams.get("challenge");
    assert.equal(destination.origin, issuer);
    assert.equal(challenge, createHash("sha256").update(flow.split("=")[1]).digest("hex"));

    function signedAssertion(overrides = {}) {
      const payload = Buffer.from(JSON.stringify({
        iss: issuer, aud: origin, sub: "rgb-player", name: "Player", challenge,
        exp: Math.floor(Date.now() / 1000) + 30, ...overrides,
      })).toString("base64url");
      return payload + "." + createHmac("sha256", secret).update(payload).digest("base64url");
    }
    const complete = (assertion, cookie = flow, requestOrigin = origin) => request("/auth/complete", {
      method: "POST", headers: { Origin: requestOrigin, Cookie: cookie }, body: JSON.stringify({ assertion }),
    });

    assert.equal((await complete(signedAssertion(), "")).status, 401);
    assert.equal((await complete(signedAssertion({ aud: issuer }))).status, 401);
    assert.equal((await complete(signedAssertion({ exp: 1 }))).status, 401);
    assert.equal((await complete(signedAssertion(), flow, issuer)).status, 403);
    const result = await complete(signedAssertion());
    assert.equal(result.status, 204);
    const session = result.headers.getSetCookie()[0].split(";")[0];
    const me = () => request("/me", { headers: { Cookie: session } });
    assert.deepEqual(await (await me()).json(), { userId: "rgboner:rgb-player", displayName: "Player", provider: "rgboner" });
    assert.equal((await request("/auth/logout", { method: "POST", headers: { Origin: origin, Cookie: session } })).status, 303);
    assert.equal((await me()).status, 401);
    assert.equal((await complete(signedAssertion())).status, 409);
  } finally {
    db.close();
  }
});
