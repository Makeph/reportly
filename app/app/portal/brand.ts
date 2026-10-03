// Couleur de marque white-label : elle vient de `agency.branding`, que l'agence
// modifie elle-même, et finit dans une règle CSS.
//
// React échappe le HTML dans un <style>, donc pas d'injection de balise. Mais il
// n'échappe pas le CSS : une valeur comme « red;background:url(https://…) »
// ajouterait une déclaration à la règle, exécutée chez le client qui ouvre le
// rapport. On n'accepte donc qu'une notation hexadécimale.

/** Rouge encre — le défaut quand l'agence n'a pas choisi de couleur. */
export const INK_RED = "#BC3A1D";

export function brandColor(value: unknown): string {
  if (typeof value !== "string") return INK_RED;
  const v = value.trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)
    ? v
    : INK_RED;
}
