import test from "node:test";
import assert from "node:assert/strict";

import { getEntitlement } from "../lib/billing.ts";

test("une agence nulle est inactive", () => {
  assert.deepEqual(getEntitlement(null), {
    active: false,
    label: "Aucune agence",
    trialActive: false,
    subActive: false,
  });
});

test("un essai futur active l'accès et affiche les jours restants", () => {
  const trialEndsAt = new Date(Date.now() + 2.5 * 86_400_000).toISOString();

  assert.deepEqual(
    getEntitlement({
      trial_ends_at: trialEndsAt,
      subscription_status: null,
    }),
    {
      active: true,
      label: "Essai — 3 j restants",
      trialActive: true,
      subActive: false,
    }
  );
});

test("un essai expiré sans abonnement est inactif", () => {
  assert.deepEqual(
    getEntitlement({
      trial_ends_at: new Date(Date.now() - 86_400_000).toISOString(),
      subscription_status: null,
    }),
    {
      active: false,
      label: "Inactif",
      trialActive: false,
      subActive: false,
    }
  );
});

for (const status of ["active", "trialing"]) {
  test(`un abonnement au statut '${status}' est actif`, () => {
    const entitlement = getEntitlement({
      plan: "Pro",
      subscription_status: status,
    });

    assert.equal(entitlement.active, true);
    assert.equal(entitlement.subActive, true);
    assert.equal(entitlement.label, "Abonné — Pro");
  });
}

test("un abonnement 'past_due' reste actif", () => {
  // Choix métier assumé : l'accès reste ouvert pendant un retard de paiement.
  const entitlement = getEntitlement({
    plan: "Agence",
    subscription_status: "past_due",
  });

  assert.equal(entitlement.active, true);
  assert.equal(entitlement.subActive, true);
  assert.equal(entitlement.label, "Abonné — Agence");
});

test("le libellé d'abonnement gagne sur celui de l'essai", () => {
  const entitlement = getEntitlement({
    plan: "Scale",
    trial_ends_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    subscription_status: "active",
  });

  assert.equal(entitlement.active, true);
  assert.equal(entitlement.trialActive, true);
  assert.equal(entitlement.subActive, true);
  assert.equal(entitlement.label, "Abonné — Scale");
});
