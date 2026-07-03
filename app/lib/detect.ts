// Moteur de détection — fonctions PURES (aucune I/O).
// Volontairement portable : le worker Python (S3) pourra mirroir cette logique.

export type Severity = "red" | "amber" | "green";

export type DetectionDraft = {
  type: "spend_anomaly" | "budget_pacing";
  severity: Severity;
  state: "new";
  title: string;
  body: string;
};

export type DailyPoint = { date: string; spend: number };

// Anomalie de dépense : dernier jour vs moyenne mobile 7 j.
// Déterministe sur les chiffres réels — pas de faux positif au mois.
export function detectSpendAnomaly(
  accountName: string,
  daily: DailyPoint[]
): DetectionDraft | null {
  if (daily.length < 8) return null; // historique insuffisant
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  const trailing = sorted.slice(-8, -1); // 7 jours précédant le dernier
  const avg = trailing.reduce((s, p) => s + p.spend, 0) / trailing.length;
  if (avg <= 0) return null;

  const ratio = last.spend / avg;
  if (ratio < 1.5) return null;

  const pct = Math.round((ratio - 1) * 100);
  const severity: Severity = ratio >= 2 ? "red" : "amber";
  return {
    type: "spend_anomaly",
    severity,
    state: "new",
    title: `${accountName} — dépense inhabituelle`,
    body: `Dépense du ${last.date} à ${last.spend.toFixed(0)} (+${pct} % vs moyenne 7 j de ${avg.toFixed(0)}). À vérifier.`,
  };
}

// Pacing budget : projette l'épuisement du budget mensuel au rythme actuel.
// Ne se déclenche que si un budget mensuel est défini sur le compte.
export function detectBudgetPacing(
  accountName: string,
  monthlyBudget: number | null,
  monthToDateSpend: number,
  dayOfMonth: number,
  daysInMonth: number
): DetectionDraft | null {
  if (!monthlyBudget || monthlyBudget <= 0 || dayOfMonth < 1) return null;
  const runRate = monthToDateSpend / dayOfMonth;
  if (runRate <= 0) return null;

  const projectedExhaustionDay = monthlyBudget / runRate;
  if (projectedExhaustionDay >= daysInMonth) return null; // tient le mois

  const exhaustionDay = Math.ceil(projectedExhaustionDay);
  const daysEarly = Math.floor(daysInMonth - projectedExhaustionDay);
  const severity: Severity = daysEarly >= 5 ? "red" : "amber";
  return {
    type: "budget_pacing",
    severity,
    state: "new",
    title: `${accountName} — budget en avance`,
    body: `Au rythme actuel (${runRate.toFixed(0)}/j), le budget mensuel de ${monthlyBudget.toFixed(0)} sera épuisé vers le jour ${exhaustionDay} — ${daysEarly} j avant la fin du mois.`,
  };
}
