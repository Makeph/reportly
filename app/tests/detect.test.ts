import test from "node:test";
import assert from "node:assert/strict";

import {
  detectBudgetPacing,
  detectSpendAnomaly,
} from "../lib/detect.ts";
import type { DailyPoint } from "../lib/detect.ts";

function dailySeries(lastSpend: number, length = 8): DailyPoint[] {
  return Array.from({ length }, (_, index) => ({
    date: `2026-07-${String(index + 1).padStart(2, "0")}`,
    spend: index === length - 1 ? lastSpend : 100,
  }));
}

test("l'anomalie exige exactement 8 jours d'historique pour être évaluée", () => {
  assert.equal(detectSpendAnomaly("Compte", dailySeries(200, 7)), null);
  assert.notEqual(detectSpendAnomaly("Compte", dailySeries(200, 8)), null);
});

test("un ratio de dépense de 1,5 déclenche une alerte amber", () => {
  const detection = detectSpendAnomaly("Compte", dailySeries(150));

  assert.equal(detection?.severity, "amber");
  assert.equal(detection?.type, "spend_anomaly");
});

test("un ratio de dépense de 2 déclenche une alerte red", () => {
  const detection = detectSpendAnomaly("Compte", dailySeries(200));

  assert.equal(detection?.severity, "red");
  assert.equal(detection?.type, "spend_anomaly");
});

test("un ratio de dépense normal ne déclenche rien", () => {
  assert.equal(detectSpendAnomaly("Compte", dailySeries(149)), null);
});

test("le pacing ne s'applique pas sans budget mensuel positif", () => {
  assert.equal(detectBudgetPacing("Compte", null, 500, 10, 30), null);
  assert.equal(detectBudgetPacing("Compte", 0, 500, 10, 30), null);
});

test("un dépassement de rythme budgétaire déclenche une détection", () => {
  const detection = detectBudgetPacing("Compte", 1_000, 500, 10, 30);

  assert.equal(detection?.type, "budget_pacing");
  assert.equal(detection?.severity, "red");
  assert.match(detection?.body ?? "", /jour 20 — 10 j avant/);
});
