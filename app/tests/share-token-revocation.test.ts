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

// --- Expiration automatique ------------------------------------------------

test("un jeton frais est accepté", () => {
  const jeton = makeShareToken("compte-exp", 1);
  assert.equal(verifyShareToken("compte-exp", jeton, 1), true);
});

test("un jeton expiré est refusé", () => {
  // Une durée négative retombe volontairement sur la valeur par défaut : on ne
  // peut donc pas fabriquer un jeton périmé, il faut avancer l'horloge.
  const precedent = process.env.PORTAL_LINK_TTL_DAYS;
  process.env.PORTAL_LINK_TTL_DAYS = "1";
  const jeton = makeShareToken("compte-exp", 1);
  if (precedent === undefined) delete process.env.PORTAL_LINK_TTL_DAYS;
  else process.env.PORTAL_LINK_TTL_DAYS = precedent;

  assert.equal(verifyShareToken("compte-exp", jeton, 1), true);

  const maintenant = Date.now;
  Date.now = () => maintenant() + 2 * 86_400_000; // deux jours plus tard
  try {
    assert.equal(verifyShareToken("compte-exp", jeton, 1), false);
  } finally {
    Date.now = maintenant;
  }
});

test("rallonger l'expiration à la main invalide la signature", () => {
  const jeton = makeShareToken("compte-exp", 1);
  const signature = jeton.slice(jeton.indexOf(".") + 1);
  const plusTard = (Math.floor(Date.now() / 1000) + 10 * 365 * 86400).toString(36);

  assert.equal(verifyShareToken("compte-exp", `${plusTard}.${signature}`, 1), false);
});

test("un jeton au format hérité, sans expiration, est refusé", () => {
  assert.equal(verifyShareToken("compte-exp", "a".repeat(32), 1), false);
});

test("un format invalide est refusé sans lever d'exception", () => {
  for (const invalide of ["", ".", ".abc", "zzz", "!!.??"]) {
    assert.doesNotThrow(() => {
      assert.equal(verifyShareToken("compte-exp", invalide, 1), false);
    }, `entrée : ${JSON.stringify(invalide)}`);
  }
});

test("la durée de vie personnalisée est respectée", () => {
  const precedent = process.env.PORTAL_LINK_TTL_DAYS;
  process.env.PORTAL_LINK_TTL_DAYS = "2";
  const jeton = makeShareToken("compte-exp", 1);
  if (precedent === undefined) delete process.env.PORTAL_LINK_TTL_DAYS;
  else process.env.PORTAL_LINK_TTL_DAYS = precedent;

  const expiration = Number.parseInt(jeton.slice(0, jeton.indexOf(".")), 36);
  const restant = expiration - Math.floor(Date.now() / 1000);
  assert.ok(restant > 86_400 && restant <= 2 * 86_400, `restant = ${restant}s`);
});
