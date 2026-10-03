import test from "node:test";
import assert from "node:assert/strict";

import { INK_RED, brandColor, brandLogo, brandText } from "../app/portal/brand.ts";

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

test("brandText ne laisse passer qu'une chaîne non vide", () => {
  assert.equal(brandText("Studio Vallier"), "Studio Vallier");
  assert.equal(brandText("  Acme  "), "Acme");
  // Le jsonb peut contenir autre chose : un objet rendu par React ferait
  // échouer la page du portail, celle que voient les clients de l'agence.
  assert.equal(brandText({ nom: "x" }), undefined);
  assert.equal(brandText(42), undefined);
  assert.equal(brandText(""), undefined);
  assert.equal(brandText(null), undefined);
});

test("brandLogo n'accepte qu'une URL https", () => {
  assert.equal(brandLogo("https://cdn.exemple.test/logo.png"), "https://cdn.exemple.test/logo.png");
  assert.equal(brandLogo("http://cdn.exemple.test/logo.png"), undefined);
  assert.equal(brandLogo("javascript:alert(1)"), undefined);
  assert.equal(brandLogo("data:image/svg+xml;base64,AAAA"), undefined);
  assert.equal(brandLogo("pas une url"), undefined);
  assert.equal(brandLogo({}), undefined);
});
