import { NextResponse } from "next/server";

// Modèle CSV téléchargeable depuis la page d'import.
// Généré à la volée plutôt que servi en fichier statique : les dates doivent
// rester récentes, sinon l'import de démonstration ne déclenche aucune
// détection (l'anomalie de dépense se calcule sur les 8 derniers jours).
export const dynamic = "force-dynamic";

const JOURS = 34;

function ligne(date: Date, spend: number) {
  const jour = String(date.getUTCDate()).padStart(2, "0");
  const mois = String(date.getUTCMonth() + 1).padStart(2, "0");
  const conversions = Math.max(1, Math.round(spend / 11));
  const revenu = Math.round(conversions * 46.5 * 100) / 100;
  const eur = (n: number) => n.toFixed(2).replace(".", ",");
  return `${jour}/${mois}/${date.getUTCFullYear()};${eur(
    spend
  )} €;${conversions};${eur(revenu)}`;
}

export async function GET() {
  const lignes = ["Date;Dépense;Conversions;Revenu"];
  const aujourdhui = new Date();

  for (let i = JOURS; i >= 1; i--) {
    const jour = new Date(aujourdhui);
    jour.setUTCDate(jour.getUTCDate() - i);
    const base = 115 + Math.round(Math.sin(i / 3) * 18);
    // Dernier jour volontairement à 2,4× la moyenne : le fichier d'exemple
    // doit montrer une alerte, pas une semaine sans relief.
    lignes.push(ligne(jour, i === 1 ? base * 2.4 : base));
  }

  return new NextResponse(lignes.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="exemple-reportly.csv"',
    },
  });
}
