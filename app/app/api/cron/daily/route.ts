import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEntitlement, type AgencyRow } from "@/lib/billing";
import { runDailyBrief } from "@/lib/brief";

// Cron quotidien (07:30 Paris ≈ 05:30 UTC, voir vercel.json).
// Sécurisé par CRON_SECRET : Vercel Cron envoie `Authorization: Bearer <CRON_SECRET>`.
// Déclenchement manuel possible via ?secret=<CRON_SECRET>.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const url = new URL(request.url);
  const provided =
    request.headers.get("authorization")?.replace("Bearer ", "") ??
    url.searchParams.get("secret") ??
    "";

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: agencies } = await admin
    .from("agency")
    .select("id, plan, trial_ends_at, subscription_status");

  let processed = 0;
  let skipped = 0;
  for (const a of agencies ?? []) {
    if (!getEntitlement(a as AgencyRow).active) {
      skipped += 1;
      continue;
    }
    try {
      await runDailyBrief(a.id);
      processed += 1;
    } catch {
      // une agence en erreur ne doit pas bloquer les autres
      skipped += 1;
    }
  }

  return NextResponse.json({ processed, skipped });
}
