import test from "node:test";
import assert from "node:assert/strict";

import { maxClientAccounts } from "../lib/billing.ts";

test("le plan Starter autorise 3 comptes clients", () => {
  assert.equal(maxClientAccounts({ plan: "starter" }), 3);
});

test("le plan Growth autorise 20 comptes clients", () => {
  assert.equal(maxClientAccounts({ plan: "growth" }), 20);
});

test("le plan Pro autorise un nombre illimité de comptes clients", () => {
  assert.equal(maxClientAccounts({ plan: "pro" }), Number.POSITIVE_INFINITY);
});

test("un essai actif sans abonnement utilise le quota Growth", () => {
  assert.equal(
    maxClientAccounts({
      plan: null,
      trial_ends_at: new Date(Date.now() + 86_400_000).toISOString(),
      subscription_status: null,
    }),
    20
  );
});

test("un plan inconnu ou nul hors essai retombe sur le quota Starter", () => {
  assert.equal(maxClientAccounts({ plan: "inconnu" }), 3);
  assert.equal(maxClientAccounts({ plan: null }), 3);
  assert.equal(maxClientAccounts(null), 3);
});
