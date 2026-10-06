// La période du produit : un mois civil, 'YYYY-MM'.
//
// Module à part pour rester testable : report.ts tire le client Supabase
// d'administration, que le banc de tests ne peut pas résoudre.

/**
 * Une période du produit : un mois civil, 'YYYY-MM'.
 *
 * `monthBounds` suppose ce format sans le vérifier — une valeur comme "x"
 * y produit une date invalide, et `toISOString` lève. La validation vit ici
 * pour que les appelants puissent refuser avant d'engager un appel au
 * fournisseur d'IA et un upsert.
 */
export function isValidPeriod(period: unknown): period is string {
  return typeof period === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
}

/** Une période encore à venir n'a aucune donnée à résumer. */
export function isFuturePeriod(period: string, ref = new Date()): boolean {
  const courante = `${ref.getUTCFullYear()}-${String(
    ref.getUTCMonth() + 1
  ).padStart(2, "0")}`;
  return period > courante;
}
