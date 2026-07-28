import test from "node:test";
import assert from "node:assert/strict";

import { reconcileDetections } from "../lib/reconcile.ts";
import type { DetectionDraft } from "../lib/detect.ts";
import type { ExistingDetection } from "../lib/reconcile.ts";

function draft(
  overrides: Partial<DetectionDraft> = {}
): DetectionDraft {
  return {
    type: "spend_anomaly",
    severity: "amber",
    state: "new",
    title: "Dépense inhabituelle",
    body: "Une hausse a été détectée.",
    ...overrides,
  };
}

function existing(
  overrides: Partial<ExistingDetection> = {}
): ExistingDetection {
  return {
    id: "detection-1",
    type: "spend_anomaly",
    severity: "amber",
    state: "persistent",
    opened_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

test("un draft sans correspondance est inséré comme nouveau", () => {
  const candidate = draft();

  assert.deepEqual(reconcileDetections([], [candidate]), {
    toInsert: [candidate],
    toUpdate: [],
    toResolveIds: [],
  });
});

test("une détection correspondante devient persistante", () => {
  const candidate = draft({
    severity: "red",
    title: "Nouveau titre",
    body: "Nouveau détail",
  });

  assert.deepEqual(reconcileDetections([existing()], [candidate]), {
    toInsert: [],
    toUpdate: [
      {
        id: "detection-1",
        state: "persistent",
        severity: "red",
        title: "Nouveau titre",
        body: "Nouveau détail",
      },
    ],
    toResolveIds: [],
  });
});

test("une sévérité qui baisse marque la détection en amélioration", () => {
  const candidate = draft({ severity: "amber" });

  const plan = reconcileDetections(
    [existing({ severity: "red" })],
    [candidate]
  );

  assert.equal(plan.toUpdate[0]?.state, "improving");
  assert.equal(plan.toUpdate[0]?.severity, "amber");
});

test("une détection ouverte sans draft correspondant est résolue", () => {
  const plan = reconcileDetections([existing()], []);

  assert.deepEqual(plan.toResolveIds, ["detection-1"]);
  assert.deepEqual(plan.toInsert, []);
  assert.deepEqual(plan.toUpdate, []);
});

test("la clé de correspondance est le type de détection", () => {
  const candidate = draft({
    type: "budget_pacing",
    title: "Budget en avance",
    body: "Le budget sera épuisé avant la fin du mois.",
  });
  const matchingType = existing({
    id: "budget-1",
    type: "budget_pacing",
    state: "new",
  });
  const otherType = existing({
    id: "spend-1",
    type: "spend_anomaly",
  });

  const plan = reconcileDetections([matchingType, otherType], [candidate]);

  assert.equal(plan.toInsert.length, 0);
  assert.equal(plan.toUpdate[0]?.id, "budget-1");
  assert.deepEqual(plan.toResolveIds, ["spend-1"]);
});
