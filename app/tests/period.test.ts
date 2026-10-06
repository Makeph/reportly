import { strict as assert } from "node:assert";
import test from "node:test";
import { isFuturePeriod, isValidPeriod } from "../lib/period.ts";

test("un mois civil bien formé est accepté", () => {
  for (const p of ["2026-01", "2026-09", "2026-12", "1999-07"]) {
    assert.equal(isValidPeriod(p), true, p);
  }
});

test("un mois hors plage est refusé", () => {
  for (const p of ["2026-00", "2026-13", "2026-99"]) {
    assert.equal(isValidPeriod(p), false, p);
  }
});

test("ce qui n'a pas la forme d'une période est refusé", () => {
  for (const p of ["x", "", "2026", "2026-1", "26-01", "2026-01-15", " 2026-01"]) {
    assert.equal(isValidPeriod(p), false, JSON.stringify(p));
  }
});

test("ce qui n'est pas une chaîne est refusé", () => {
  for (const p of [null, undefined, 202601, {}, ["2026-01"]]) {
    assert.equal(isValidPeriod(p), false, JSON.stringify(p));
  }
});

// La route passait la valeur brute à monthBounds, qui faisait lever
// toISOString sur une date invalide — une réponse 500 sur une entrée client.
test("la valeur qui faisait lever une date invalide est refusée en amont", () => {
  assert.equal(isValidPeriod("x"), false);
});

test("le mois en cours n'est pas à venir", () => {
  const ref = new Date(Date.UTC(2026, 9, 6)); // octobre 2026
  assert.equal(isFuturePeriod("2026-10", ref), false);
});

test("un mois passé n'est pas à venir", () => {
  const ref = new Date(Date.UTC(2026, 9, 6));
  assert.equal(isFuturePeriod("2026-09", ref), false);
  assert.equal(isFuturePeriod("2019-12", ref), false);
});

test("le mois suivant est à venir", () => {
  const ref = new Date(Date.UTC(2026, 9, 6));
  assert.equal(isFuturePeriod("2026-11", ref), true);
});

// La comparaison est lexicographique : décembre face à janvier suivant est
// le cas où un mois non rempli à deux chiffres trahirait l'ordre.
test("le passage d'année est comparé correctement", () => {
  const ref = new Date(Date.UTC(2026, 11, 31)); // décembre 2026
  assert.equal(isFuturePeriod("2026-12", ref), false);
  assert.equal(isFuturePeriod("2027-01", ref), true);
  const janvier = new Date(Date.UTC(2027, 0, 2));
  assert.equal(isFuturePeriod("2026-12", janvier), false);
});
