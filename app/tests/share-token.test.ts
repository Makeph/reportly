import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

process.env.SHARE_TOKEN_SECRET = "secret-reserve-aux-tests-reportly";

// `server-only` est un marqueur Next.js sans effet d'exécution. Le hook le
// remplace uniquement dans ce processus de test, sans modifier le module métier.
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

test("un token généré se vérifie", () => {
  const token = makeShareToken("account-1");

  assert.equal(verifyShareToken("account-1", token), true);
});

test("un token falsifié d'un caractère échoue", () => {
  const token = makeShareToken("account-1");
  const lastCharacter = token.at(-1);
  const forged = `${token.slice(0, -1)}${lastCharacter === "A" ? "B" : "A"}`;

  assert.equal(verifyShareToken("account-1", forged), false);
});

test("un token de longueur différente échoue sans jeter", () => {
  const token = `${makeShareToken("account-1")}A`;

  assert.doesNotThrow(() => {
    assert.equal(verifyShareToken("account-1", token), false);
  });
});

test("deux comptes différents n'ont pas le même token", () => {
  assert.notEqual(makeShareToken("account-1"), makeShareToken("account-2"));
});

test("la version 1 reste la version par défaut", () => {
  assert.equal(makeShareToken("account-1"), makeShareToken("account-1", 1));
});

test("un token émis en version N est refusé en version N+1", () => {
  const token = makeShareToken("account-1", 4);

  assert.equal(verifyShareToken("account-1", token, 4), true);
  assert.equal(verifyShareToken("account-1", token, 5), false);
});
