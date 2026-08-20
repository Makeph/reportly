import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEntitlement, type AgencyRow } from "@/lib/billing";
import { generateReport, prevMonthPeriod } from "@/lib/report";

// Cron mensuel (1er du mois) : génère le rapport du mois précédent pour chaque
// compte des agences actives. Sécurisé par CRON_SECRET (voir /api/cron/daily).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const secretBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);

  if (
    !secret ||
    providedBuffer.length !== secretBuffer.length ||
    !timingSafeEqual(providedBuffer, secretBuffer)
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const period = prevMonthPeriod();

  const { data: agencies } = await admin
    .from("agency")
    .select("id, plan, trial_ends_at, subscription_status");

  let reports = 0;
  for (const a of agencies ?? []) {
    if (!getEntitlement(a as AgencyRow).active) continue;
    const { data: accounts } = await admin
      .from("client_account")
      .select("id")
      .eq("agency_id", a.id);
    for (const acc of accounts ?? []) {
      try {
        await generateReport(acc.id, period);
        reports += 1;
      } catch {
        // un compte en erreur ne bloque pas les autres
      }
    }
  }

  return NextResponse.json({ period, reports });
}
