import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

process.env.SHARE_TOKEN_SECRET = "secret-reserve-aux-tests-reportly";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        url: "data:text/javascript,export {};",
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { makeShareToken, verifyShareToken } = await import(
  "../lib/share-token.ts"
);

test("la révocation refuse l'ancien lien et accepte le lien réémis", () => {
  const accountId = "account-revoked";
  const versionBeforeRevocation = 3;
  const versionAfterRevocation = versionBeforeRevocation + 1;
  const oldToken = makeShareToken(accountId, versionBeforeRevocation);

  assert.equal(verifyShareToken(accountId, oldToken, versionAfterRevocation), false);

  const reissuedToken = makeShareToken(accountId, versionAfterRevocation);
  assert.equal(
    verifyShareToken(accountId, reissuedToken, versionAfterRevocation),
    true
  );
});
