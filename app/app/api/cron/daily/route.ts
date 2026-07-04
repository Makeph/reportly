import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEntitlement, type AgencyRow } from "@/lib/billing";
import { runDailyBrief } from "@/lib/brief";
import { sendLifecycleEmail } from "@/lib/email";
import {
  onboardingConnectSource,
  trialEndsSoon,
} from "@/lib/lifecycle-emails";

type DailyAgencyRow = {
  id: string;
  name: string | null;
  plan: string | null;
  trial_ends_at: string | null;
  subscription_status: string | null;
  created_at: string | null;
};

function dateOnlyUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function daysUntil(date: string): number {
  const today = dateOnlyUtc(new Date());
  const target = dateOnlyUtc(new Date(date));
  return Math.round((target - today) / 86_400_000);
}

async function getAgencyOwnerEmail(
  admin: ReturnType<typeof createAdminClient>,
  agencyId: string
): Promise<string | null> {
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

async function sendDailyLifecycleEmails(
  admin: ReturnType<typeof createAdminClient>,
  agency: DailyAgencyRow
) {
  const entitlement = getEntitlement(agency);
  if (!entitlement.trialActive || !agency.trial_ends_at) return;

  const email = await getAgencyOwnerEmail(admin, agency.id);
  if (!email) return;

  const agencyName = agency.name || "votre agence";
  if (daysUntil(agency.trial_ends_at) === 3) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://app.getreportly.fr";
    const message = trialEndsSoon({
      agencyName,
      daysLeft: 3,
      upgradeUrl: `${siteUrl}/dashboard`,
    });
    await sendLifecycleEmail({ to: email, ...message });
  }

  const { count } = await admin
    .from("connection")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agency.id);
  const createdAt = agency.created_at ? new Date(agency.created_at).getTime() : Date.now();
  const ageDays = (Date.now() - createdAt) / 86_400_000;

  if ((count ?? 0) === 0 && ageDays >= 1) {
    // TODO: ajouter une table d'événements lifecycle pour dédupliquer cet email.
    // À défaut de table existante adaptée, cet onboarding peut partir une fois par jour.
    const message = onboardingConnectSource({ agencyName });
    await sendLifecycleEmail({ to: email, ...message });
  }
}

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
    .select("id, name, plan, trial_ends_at, subscription_status, created_at");

  let processed = 0;
  let skipped = 0;
  for (const a of agencies ?? []) {
    if (!getEntitlement(a as AgencyRow).active) {
      skipped += 1;
      continue;
    }
    try {
      await runDailyBrief(a.id);
      await sendDailyLifecycleEmails(admin, a as DailyAgencyRow);
      processed += 1;
    } catch {
      // une agence en erreur ne doit pas bloquer les autres
      skipped += 1;
    }
  }

  return NextResponse.json({ processed, skipped });
}
