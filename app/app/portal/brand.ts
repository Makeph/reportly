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

// Le branding est un jsonb : l'action serveur valide ce qu'elle écrit, mais la
// policy `agency_update` autorise le propriétaire à écrire la colonne entière
// par l'API REST, hors de ce chemin. Ce qu'on lit ici n'est donc pas typé — un
// objet ou un nombre dans `name` casserait le rendu du portail, celui que
// voient les clients de l'agence.

/** Texte de marque : une chaîne non vide, sinon rien. */
export function brandText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  return v === "" ? undefined : v;
}

/**
 * Logo : une URL https seulement. React neutralise déjà `javascript:`, mais
 * `http:` casserait l'affichage en contenu mixte, et une valeur non textuelle
 * ferait échouer le rendu.
 */
export function brandLogo(value: unknown): string | undefined {
  const v = brandText(value);
  if (!v) return undefined;
  try {
    return new URL(v).protocol === "https:" ? v : undefined;
  } catch {
    return undefined;
  }
}
