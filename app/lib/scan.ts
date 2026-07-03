import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/crypto";
import { getDailySpend } from "@/lib/meta";
import {
  detectSpendAnomaly,
  detectBudgetPacing,
  type DetectionDraft,
} from "@/lib/detect";
import { reconcileDetections, type ExistingDetection } from "@/lib/reconcile";

// Types de détections gérés par ce scan (déterministes, source unique Meta).
const MANAGED_TYPES = ["spend_anomaly", "budget_pacing"];

export type ScanResult = {
  audited: number;
  newCount: number;
  persistentCount: number;
  improvingCount: number;
  resolvedCount: number;
  openTotal: number;
};

// Scan d'une agence : pull dépense → metric_daily → détections → réconciliation d'état.
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
    .select("id, access_token")
    .eq("agency_id", agencyId);

  const tokenByConn = new Map<string, string>();
  for (const c of connections ?? []) {
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
    const token = acc.connection_id
      ? tokenByConn.get(acc.connection_id)
      : undefined;
    if (!token || !acc.external_id) continue;

    let daily: { date: string; spend: number }[] = [];
    try {
      daily = await getDailySpend(token, acc.external_id);
    } catch {
      continue;
    }
    result.audited += 1;

    if (daily.length) {
      await admin.from("metric_daily").upsert(
        daily.map((d) => ({
          client_account_id: acc.id,
          date: d.date,
          spend: d.spend,
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
