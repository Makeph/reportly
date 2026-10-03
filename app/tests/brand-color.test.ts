import test from "node:test";
import assert from "node:assert/strict";

import { INK_RED, brandColor } from "../app/portal/brand.ts";

test("une couleur hexadécimale valide est conservée", () => {
  assert.equal(brandColor("#1F6BFF"), "#1F6BFF");
  assert.equal(brandColor("#abc"), "#abc");
  assert.equal(brandColor("  #AABBCCDD  "), "#AABBCCDD");
});

test("une valeur qui ajouterait une déclaration CSS est refusée", () => {
  // Le cas qui motive la fonction : l'agence modifie son propre branding, et
  // la valeur finit dans une règle CSS servie à ses clients.
  assert.equal(brandColor("red;background:url(https://exemple.test/x)"), INK_RED);
  assert.equal(brandColor("#fff;}body{display:none"), INK_RED);
  assert.equal(brandColor("</style><script>alert(1)</script>"), INK_RED);
});

test("les notations non hexadécimales retombent sur le défaut", () => {
  assert.equal(brandColor("red"), INK_RED);
  assert.equal(brandColor("rgb(1,2,3)"), INK_RED);
  assert.equal(brandColor("#12345"), INK_RED);
});

test("une valeur absente ou d'un autre type retombe sur le défaut", () => {
  assert.equal(brandColor(undefined), INK_RED);
  assert.equal(brandColor(null), INK_RED);
  assert.equal(brandColor(""), INK_RED);
  assert.equal(brandColor(123), INK_RED);
});
