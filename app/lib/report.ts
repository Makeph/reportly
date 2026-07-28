import { createAdminClient } from "@/lib/supabase/admin";
import { claudeJson } from "@/lib/anthropic";
import { sendLifecycleEmail } from "@/lib/email";
import { firstReportReady } from "@/lib/lifecycle-emails";
import { makeShareToken } from "@/lib/share-token";

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

async function getAgencyOwnerEmail(admin: Admin, agencyId: string): Promise<string | null> {
  const { data: member } = await admin
    .from("agency_member")
    .select("user_id")
    .eq("agency_id", agencyId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle<{ user_id: string }>();

  if (!member?.user_id) return null;
  const { data } = await admin.auth.admin.getUserById(member.user_id);
  return data.user?.email ?? null;
}

type MetricDailyRow = {
  spend: number | null;
  conversions: number | null;
  cpa: number | null;
  roas: number | null;
};

type MonthMetrics = {
  spend: number;
  conversions: number;
  cpa: number | null;
  roas: number | null;
  hasRows: boolean;
  hasConversions: boolean;
  hasRoas: boolean;
};

function pctDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

async function getMonthMetrics(
  admin: Admin,
  accountId: string,
  start: string,
  end: string
): Promise<MonthMetrics> {
  const { data } = await admin
    .from("metric_daily")
    .select("spend, conversions, cpa, roas")
    .eq("client_account_id", accountId)
    .gte("date", start)
    .lte("date", end);

  const rows = (data ?? []) as MetricDailyRow[];
  const spend = rows.reduce((s, r) => s + (Number(r.spend) || 0), 0);
  const conversions = rows.reduce(
    (s, r) => s + (Number(r.conversions) || 0),
    0
  );
  const roasRows = rows.filter((r) => r.roas !== null && r.roas !== undefined);
  const roasSpend = roasRows.reduce((s, r) => s + (Number(r.spend) || 0), 0);
  const roasRevenue = roasRows.reduce(
    (s, r) => s + (Number(r.spend) || 0) * (Number(r.roas) || 0),
    0
  );
  const cpa =
    conversions > 0
      ? spend / conversions
      : rows.some((r) => r.cpa !== null && r.cpa !== undefined)
        ? rows.reduce((s, r) => s + (Number(r.cpa) || 0), 0) /
          rows.filter((r) => r.cpa !== null && r.cpa !== undefined).length
        : null;

  return {
    spend,
    conversions,
    cpa: cpa !== null && Number.isFinite(cpa) ? cpa : null,
    roas: roasSpend > 0 ? roasRevenue / roasSpend : null,
    hasRows: rows.length > 0,
    hasConversions: rows.some((r) => r.conversions !== null && r.conversions !== undefined),
    hasRoas: roasRows.length > 0,
  };
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
  conversions?: number;
  conversionsPrev?: number;
  conversionsDeltaPct?: number | null;
  cpa?: number | null;
  cpaPrev?: number | null;
  cpaDeltaPct?: number | null;
  roas?: number | null;
  roasPrev?: number | null;
  roasDeltaPct?: number | null;
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
    .select("id, name, currency, agency_id")
    .eq("id", clientAccountId)
    .maybeSingle<{
      id: string;
      name: string;
      currency: string | null;
      agency_id: string;
    }>();
  if (!acc) return { ok: false, error: "compte introuvable" };

  const { count: reportsBefore } = await admin
    .from("report")
    .select("id", { count: "exact", head: true })
    .eq("client_account_id", acc.id);

  const b = monthBounds(period);
  const metrics = await getMonthMetrics(admin, acc.id, b.start, b.end);
  const prevMetrics = await getMonthMetrics(admin, acc.id, b.prevStart, b.prevEnd);
  const deltaPct = pctDelta(metrics.spend, prevMetrics.hasRows ? prevMetrics.spend : null);
  const conversions = metrics.hasConversions ? metrics.conversions : null;
  const conversionsPrev = prevMetrics.hasConversions ? prevMetrics.conversions : null;
  const cpa = metrics.hasConversions ? metrics.cpa : null;
  const cpaPrev = prevMetrics.hasConversions ? prevMetrics.cpa : null;
  const roas = metrics.hasRoas ? metrics.roas : null;
  const roasPrev = prevMetrics.hasRoas ? prevMetrics.roas : null;

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
    depense_mois: Math.round(metrics.spend),
    depense_mois_precedent: Math.round(prevMetrics.spend),
    variation_depense_pct: deltaPct,
    conversions_mois: conversions !== null ? Math.round(conversions) : null,
    conversions_mois_precedent:
      conversionsPrev !== null ? Math.round(conversionsPrev) : null,
    variation_conversions_pct: pctDelta(conversions, conversionsPrev),
    cpa_moyen: cpa !== null ? Math.round(cpa * 100) / 100 : null,
    cpa_moyen_precedent:
      cpaPrev !== null ? Math.round(cpaPrev * 100) / 100 : null,
    variation_cpa_pct: pctDelta(cpa, cpaPrev),
    roas: roas !== null ? Math.round(roas * 100) / 100 : null,
    roas_precedent: roasPrev !== null ? Math.round(roasPrev * 100) / 100 : null,
    variation_roas_pct: pctDelta(roas, roasPrev),
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
      `Sur ${formatPeriodFr(period)}, la dépense s'élève à ${Math.round(metrics.spend)} ${currency}${
        deltaPct !== null
          ? ` (${deltaPct >= 0 ? "+" : ""}${deltaPct} % vs mois précédent)`
          : ""
      }.`,
      conversions !== null
        ? `Les campagnes totalisent ${Math.round(conversions)} conversion(s)${
            cpa !== null ? `, avec un CPA moyen de ${Math.round(cpa)} ${currency}` : ""
          }${roas !== null ? ` et un ROAS de ${Math.round(roas * 100) / 100}` : ""}.`
        : "Les données de conversion ne sont pas encore disponibles sur ce rapport.",
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
    spend: Math.round(metrics.spend),
    spendPrev: Math.round(prevMetrics.spend),
    deltaPct,
    conversions: conversions !== null ? Math.round(conversions) : undefined,
    conversionsPrev: conversionsPrev !== null ? Math.round(conversionsPrev) : undefined,
    conversionsDeltaPct: pctDelta(conversions, conversionsPrev),
    cpa: cpa !== null ? Math.round(cpa * 100) / 100 : null,
    cpaPrev: cpaPrev !== null ? Math.round(cpaPrev * 100) / 100 : null,
    cpaDeltaPct: pctDelta(cpa, cpaPrev),
    roas: roas !== null ? Math.round(roas * 100) / 100 : null,
    roasPrev: roasPrev !== null ? Math.round(roasPrev * 100) / 100 : null,
    roasDeltaPct: pctDelta(roas, roasPrev),
    incidentsDetected,
    incidentsResolved,
    currency,
    synthesis: out.synthesis,
    highlights: out.highlights,
  };
  const synthesisMd = [...out.synthesis, "", ...out.highlights.map((h) => `- ${h}`)]
    .join("\n")
    .trim();

  const { error: reportError } = await admin.from("report").upsert(
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
  if (reportError) return { ok: false, error: "rapport non enregistré" };

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

  const { count: reportsAfter } = await admin
    .from("report")
    .select("id", { count: "exact", head: true })
    .eq("client_account_id", acc.id);

  if ((reportsBefore ?? 0) === 0 && reportsAfter === 1) {
    try {
      const email = await getAgencyOwnerEmail(admin, acc.agency_id);
      if (email) {
        const { data: agency } = await admin
          .from("agency")
          .select("name")
          .eq("id", acc.agency_id)
          .maybeSingle<{ name: string | null }>();
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://app.getreportly.fr";
        const token = makeShareToken(acc.id);
        const message = firstReportReady({
          agencyName: agency?.name || "votre agence",
          accountName: acc.name,
          portalUrl: `${siteUrl}/portal/${acc.id}/${period}?t=${token}`,
        });
        await sendLifecycleEmail({ to: email, ...message });
      }
    } catch (error) {
      console.log("[lifecycle-email] Premier rapport prêt non envoyé.", error);
    }
  }

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
    .select("name, branding, plan")
    .eq("id", account.agency_id)
    .maybeSingle<{
      name: string | null;
      branding: Record<string, unknown> | null;
      plan: string | null;
    }>();
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
