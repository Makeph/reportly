import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/crypto";
import { getDailySpend, type DailyInsight } from "@/lib/meta";
import {
  detectSpendAnomaly,
  detectBudgetPacing,
  type DetectionDraft,
} from "@/lib/detect";
import { reconcileDetections, type ExistingDetection } from "@/lib/reconcile";

// Types de détections gérés par ce scan, quelle que soit la source de données.
const MANAGED_TYPES = ["spend_anomaly", "budget_pacing"];

type ScanAccount = {
  id: string;
  name: string;
  external_id: string | null;
  monthly_budget: number | null;
  connection_id: string | null;
};

type CsvMetricRow = {
  date: string;
  spend: number | null;
  conversions: number | null;
  cpa: number | null;
  roas: number | null;
};

export type ScanResult = {
  audited: number;
  newCount: number;
  persistentCount: number;
  improvingCount: number;
  resolvedCount: number;
  openTotal: number;
};

async function fetchDaily(
  providerByConn: Map<string, string>,
  tokenByConn: Map<string, string>,
  acc: ScanAccount
): Promise<DailyInsight[] | null> {
  if (!acc.connection_id) return null;
  const provider = providerByConn.get(acc.connection_id);

  if (provider === "meta") {
    const token = tokenByConn.get(acc.connection_id);
    if (!token || !acc.external_id) return null;
    return getDailySpend(token, acc.external_id);
  }

  if (provider === "csv") {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const monthStart = `${now.getUTCFullYear()}-${String(
      now.getUTCMonth() + 1
    ).padStart(2, "0")}-01`;
    const rollingStart = thirtyDaysAgo.toISOString().slice(0, 10);
    const startDate = rollingStart < monthStart ? rollingStart : monthStart;

    const { data, error } = await createAdminClient()
      .from("metric_daily")
      .select("date, spend, conversions, cpa, roas")
      .eq("client_account_id", acc.id)
      .gte("date", startDate)
      .lte("date", now.toISOString().slice(0, 10))
      .order("date");
    if (error) throw error;

    return ((data ?? []) as CsvMetricRow[]).map((row) => ({
      date: row.date,
      spend: Number(row.spend) || 0,
      ...(row.conversions !== null
        ? { conversions: Number(row.conversions) || 0 }
        : {}),
      ...(row.cpa !== null ? { cpa: Number(row.cpa) || 0 } : {}),
      ...(row.roas !== null ? { roas: Number(row.roas) || 0 } : {}),
    }));
  }

  return null;
}

// Scan d'une agence : lecture source → metric_daily → détections → réconciliation d'état.
// Partagé par l'audit initial (S2) et le cron quotidien (S3). Écrit via service-role.
export async function scanAgency(agencyId: string): Promise<ScanResult> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const result: ScanResult = {
    audited: 0,
    newCount: 0,
    persistentCount: 0,
    improvingCount: 0,
    resolvedCount: 0,
    openTotal: 0,
  };

  const { data: accounts } = await admin
    .from("client_account")
    .select("id, name, external_id, monthly_budget, connection_id")
    .eq("agency_id", agencyId);
  if (!accounts?.length) return result;

  const { data: connections } = await admin
    .from("connection")
    .select("id, provider, access_token")
    .eq("agency_id", agencyId);

  const providerByConn = new Map<string, string>();
  const tokenByConn = new Map<string, string>();
  for (const c of connections ?? []) {
    providerByConn.set(c.id, c.provider);
    if (c.access_token) {
      try {
        tokenByConn.set(c.id, decryptToken(c.access_token));
      } catch {
        // token illisible → connexion ignorée
      }
    }
  }

  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const monthPrefix = `${now.getUTCFullYear()}-${String(
    now.getUTCMonth() + 1
  ).padStart(2, "0")}`;

  for (const acc of accounts) {
    const provider = acc.connection_id
      ? providerByConn.get(acc.connection_id)
      : undefined;
    let daily: DailyInsight[] | null = null;
    try {
      daily = await fetchDaily(
        providerByConn,
        tokenByConn,
        acc as ScanAccount
      );
    } catch {
      continue;
    }
    if (!daily) continue;
    result.audited += 1;

    if (provider === "meta" && daily.length) {
      await admin.from("metric_daily").upsert(
        daily.map((d) => ({
          client_account_id: acc.id,
          date: d.date,
          spend: d.spend,
          ...(d.conversions !== undefined ? { conversions: d.conversions } : {}),
          ...(d.cpa !== undefined ? { cpa: d.cpa } : {}),
          ...(d.roas !== undefined ? { roas: d.roas } : {}),
        })),
        { onConflict: "client_account_id,date" }
      );
    }

    const drafts: DetectionDraft[] = [];
    const anomaly = detectSpendAnomaly(acc.name, daily);
    if (anomaly) drafts.push(anomaly);
    const mtdSpend = daily
      .filter((d) => d.date.startsWith(monthPrefix))
      .reduce((s, d) => s + d.spend, 0);
    const pacing = detectBudgetPacing(
      acc.name,
      acc.monthly_budget,
      mtdSpend,
      dayOfMonth,
      daysInMonth
    );
    if (pacing) drafts.push(pacing);

    const { data: existingRows } = await admin
      .from("detection")
      .select("id, type, severity, state, opened_at")
      .eq("client_account_id", acc.id)
      .is("resolved_at", null)
      .in("type", MANAGED_TYPES);
    const existing = (existingRows ?? []) as ExistingDetection[];

    const plan = reconcileDetections(existing, drafts);

    if (plan.toInsert.length) {
      await admin.from("detection").insert(
        plan.toInsert.map((d) => ({
          client_account_id: acc.id,
          type: d.type,
          severity: d.severity,
          state: "new",
          title: d.title,
          body: d.body,
          opened_at: nowIso,
          last_seen: nowIso,
        }))
      );
      result.newCount += plan.toInsert.length;
    }

    for (const u of plan.toUpdate) {
      await admin
        .from("detection")
        .update({
          state: u.state,
          severity: u.severity,
          title: u.title,
          body: u.body,
          last_seen: nowIso,
        })
        .eq("id", u.id);
      if (u.state === "improving") result.improvingCount += 1;
      else result.persistentCount += 1;
    }

    if (plan.toResolveIds.length) {
      await admin
        .from("detection")
        .update({ state: "resolved", resolved_at: nowIso, last_seen: nowIso })
        .in("id", plan.toResolveIds);
      result.resolvedCount += plan.toResolveIds.length;
    }
  }

  const { data: openRows } = await admin
    .from("detection")
    .select("id")
    .in(
      "client_account_id",
      accounts.map((a) => a.id)
    )
    .is("resolved_at", null);
  result.openTotal = openRows?.length ?? 0;

  return result;
}
