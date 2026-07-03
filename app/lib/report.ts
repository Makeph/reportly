import { createAdminClient } from "@/lib/supabase/admin";
import { claudeJson } from "@/lib/anthropic";

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export function formatPeriodFr(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  const name = MONTHS_FR[m - 1] ?? "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

export function prevMonthPeriod(ref = new Date()): string {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(period: string) {
  const [y, m] = period.split("-").map(Number);
  const start = `${period}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const prevPeriod = `${prevY}-${String(prevM).padStart(2, "0")}`;
  const prevStart = `${prevPeriod}-01`;
  const prevEnd = new Date(Date.UTC(prevY, prevM, 0)).toISOString().slice(0, 10);
  return { start, end, prevStart, prevEnd };
}

type Admin = ReturnType<typeof createAdminClient>;

async function sumSpend(
  admin: Admin,
  accountId: string,
  start: string,
  end: string
): Promise<number> {
  const { data } = await admin
    .from("metric_daily")
    .select("spend")
    .eq("client_account_id", accountId)
    .gte("date", start)
    .lte("date", end);
  return (data ?? []).reduce(
    (s: number, r: { spend: number | null }) => s + (Number(r.spend) || 0),
    0
  );
}

async function countDetections(
  admin: Admin,
  accountId: string,
  field: "opened_at" | "resolved_at",
  start: string,
  end: string
): Promise<number> {
  const { count } = await admin
    .from("detection")
    .select("id", { count: "exact", head: true })
    .eq("client_account_id", accountId)
    .gte(field, `${start}T00:00:00Z`)
    .lte(field, `${end}T23:59:59Z`);
  return count ?? 0;
}

export type ReportKpis = {
  spend: number;
  spendPrev: number;
  deltaPct: number | null;
  incidentsDetected: number;
  incidentsResolved: number;
  currency: string;
  synthesis: string[];
  highlights: string[];
};

// Génère (ou régénère) le rapport mensuel d'un compte.
// IMPORTANT RGPD : seuls des AGRÉGATS ANONYMISÉS sont envoyés à Claude — jamais le
// nom du client ni de donnée personnelle. Le nom n'est réinjecté qu'à l'affichage.
export async function generateReport(
  clientAccountId: string,
  period: string
): Promise<{ ok: boolean; generated?: "ai" | "fallback"; error?: string }> {
  const admin = createAdminClient();

  const { data: acc } = await admin
    .from("client_account")
    .select("id, currency, agency_id")
    .eq("id", clientAccountId)
    .maybeSingle<{ id: string; currency: string | null; agency_id: string }>();
  if (!acc) return { ok: false, error: "compte introuvable" };

  const b = monthBounds(period);
  const spend = await sumSpend(admin, acc.id, b.start, b.end);
  const spendPrev = await sumSpend(admin, acc.id, b.prevStart, b.prevEnd);
  const deltaPct =
    spendPrev > 0 ? Math.round(((spend - spendPrev) / spendPrev) * 100) : null;

  const incidentsDetected = await countDetections(admin, acc.id, "opened_at", b.start, b.end);
  const incidentsResolved = await countDetections(admin, acc.id, "resolved_at", b.start, b.end);

  const { data: incRows } = await admin
    .from("detection")
    .select("type")
    .eq("client_account_id", acc.id)
    .gte("opened_at", `${b.start}T00:00:00Z`)
    .lte("opened_at", `${b.end}T23:59:59Z`);
  const types = Array.from(new Set((incRows ?? []).map((r: { type: string }) => r.type)));

  const currency = acc.currency ?? "EUR";
  const facts = {
    periode: period,
    devise: currency,
    depense_mois: Math.round(spend),
    depense_mois_precedent: Math.round(spendPrev),
    variation_depense_pct: deltaPct,
    incidents_detectes: incidentsDetected,
    incidents_resolus: incidentsResolved,
    types_incidents: types,
  };

  const system =
    "Tu es analyste senior en marketing digital dans une agence. Tu rédiges en français clair et factuel, sans superlatifs creux ni promesses. Tu ne reçois que des agrégats anonymisés (jamais de nom de client ni de donnée personnelle). Réponds UNIQUEMENT en JSON valide.";
  const user = `À partir de ces agrégats du mois, rédige le rapport mensuel d'un compte publicitaire. Parle de « le compte » / « les campagnes », jamais d'un nom.

Données:
${JSON.stringify(facts, null, 2)}

Réponds avec ce JSON exact:
{
  "synthesis": ["2 à 3 paragraphes courts"],
  "highlights": ["3 puces factuelles maximum"],
  "priority": "UNE recommandation prioritaire, chiffrée si possible, actionnable"
}`;

  type Out = { synthesis: string[]; highlights: string[]; priority: string };
  const ai = await claudeJson<Out>({ system, user, maxTokens: 900 });

  const fallback: Out = {
    synthesis: [
      `Sur ${formatPeriodFr(period)}, la dépense s'élève à ${Math.round(spend)} ${currency}${
        deltaPct !== null
          ? ` (${deltaPct >= 0 ? "+" : ""}${deltaPct} % vs mois précédent)`
          : ""
      }.`,
      `${incidentsDetected} incident(s) détecté(s), ${incidentsResolved} corrigé(s) au cours du mois.`,
    ],
    highlights: [],
    priority:
      incidentsDetected > 0
        ? "Traiter en priorité les comptes ayant déclenché une alerte ce mois-ci."
        : "Maintenir la surveillance — aucun incident majeur ce mois-ci.",
  };
  const out = ai ?? fallback;

  const kpis: ReportKpis = {
    spend: Math.round(spend),
    spendPrev: Math.round(spendPrev),
    deltaPct,
    incidentsDetected,
    incidentsResolved,
    currency,
    synthesis: out.synthesis,
    highlights: out.highlights,
  };
  const synthesisMd = [...out.synthesis, "", ...out.highlights.map((h) => `- ${h}`)]
    .join("\n")
    .trim();

  await admin.from("report").upsert(
    {
      client_account_id: acc.id,
      period,
      synthesis_md: synthesisMd,
      priority: out.priority,
      kpis,
      published_at: new Date().toISOString(),
    },
    { onConflict: "client_account_id,period" }
  );

  // Alimente le registre avec la priorité du mois (idempotent).
  await admin
    .from("registry_entry")
    .delete()
    .eq("client_account_id", acc.id)
    .eq("kind", "priority")
    .eq("title", `Priorité — ${period}`);
  await admin.from("registry_entry").insert({
    client_account_id: acc.id,
    kind: "priority",
    title: `Priorité — ${period}`,
    body: out.priority,
    status: "open",
    dated_at: `${b.end}T12:00:00Z`,
  });

  return { ok: true, generated: ai ? "ai" : "fallback" };
}

export async function getPortalHeader(clientAccountId: string) {
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("client_account")
    .select("name, agency_id")
    .eq("id", clientAccountId)
    .maybeSingle<{ name: string; agency_id: string }>();
  if (!account) return null;
  const { data: agency } = await admin
    .from("agency")
    .select("name, branding")
    .eq("id", account.agency_id)
    .maybeSingle<{ name: string | null; branding: Record<string, unknown> | null }>();
  return { account, agency: agency ?? null };
}

export async function getReportForPortal(clientAccountId: string, period: string) {
  const admin = createAdminClient();
  const { data: report } = await admin
    .from("report")
    .select("period, synthesis_md, priority, kpis, published_at")
    .eq("client_account_id", clientAccountId)
    .eq("period", period)
    .maybeSingle<{
      period: string;
      synthesis_md: string | null;
      priority: string | null;
      kpis: ReportKpis | null;
      published_at: string | null;
    }>();
  if (!report) return null;
  const header = await getPortalHeader(clientAccountId);
  if (!header) return null;
  return { report, ...header };
}

export async function listReportsForAccount(clientAccountId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("report")
    .select("period, published_at, kpis")
    .eq("client_account_id", clientAccountId)
    .order("period", { ascending: false });
  return (data ?? []) as Array<{
    period: string;
    published_at: string | null;
    kpis: ReportKpis | null;
  }>;
}
