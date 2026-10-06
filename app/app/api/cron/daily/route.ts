import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEntitlement, type Entitlement } from "@/lib/billing";
import { runDailyBrief } from "@/lib/brief";
import { sendLifecycleEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import {
  onboardingConnectSource,
  trialEndsSoon,
  type EmailTemplate,
} from "@/lib/lifecycle-emails";

type DailyAgencyRow = {
  id: string;
  name: string | null;
  plan: string | null;
  trial_ends_at: string | null;
  subscription_status: string | null;
  created_at: string | null;
};

type LifecycleEventKind =
  | "onboarding_connect_source"
  | "trial_ends_soon"
  | "first_report_ready";

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

// La trace est écrite AVANT l'envoi, pas après.
//
// La table porte une contrainte d'unicité (agency_id, kind) : l'insertion
// est donc elle-même le verrou, atomique côté base. Lire puis écrire
// laissait deux trous — un échec d'écriture après un envoi réussi, et deux
// exécutions simultanées passant toutes deux la lecture — qui se soldaient
// l'un comme l'autre par un second e-mail chez l'agence.
//
// Si l'envoi échoue, on rend la réservation pour que le lendemain réessaie.
async function sendLifecycleEmailOnce(
  admin: ReturnType<typeof createAdminClient>,
  agencyId: string,
  kind: LifecycleEventKind,
  message: EmailTemplate,
  email: string
) {
  const { error: claimError } = await admin
    .from("lifecycle_event")
    .insert({ agency_id: agencyId, kind });

  // 23505 : violation d'unicité — l'e-mail est déjà parti, rien à faire.
  if (claimError) {
    if (claimError.code === "23505") return;
    throw claimError;
  }

  let sent = false;
  try {
    sent = await sendLifecycleEmail({ to: email, ...message });
  } finally {
    if (!sent) {
      await admin
        .from("lifecycle_event")
        .delete()
        .eq("agency_id", agencyId)
        .eq("kind", kind);
    }
  }

  if (!sent) {
    throw new Error(`Échec de l'envoi lifecycle "${kind}".`);
  }
}

async function sendDailyLifecycleEmails(
  admin: ReturnType<typeof createAdminClient>,
  agency: DailyAgencyRow,
  entitlement: Entitlement
) {
  if (!entitlement.trialActive || !agency.trial_ends_at) return;

  const email = await getAgencyOwnerEmail(admin, agency.id);
  if (!email) return;

  const agencyName = agency.name || "Votre agence";
  const dashboardUrl = `${siteUrl()}/dashboard`;
  const trialDaysLeft = daysUntil(agency.trial_ends_at);
  if (trialDaysLeft <= 3 && trialDaysLeft > 0) {
    const message = trialEndsSoon({
      agencyName,
      daysLeft: trialDaysLeft,
      upgradeUrl: dashboardUrl,
    });
    await sendLifecycleEmailOnce(
      admin,
      agency.id,
      "trial_ends_soon",
      message,
      email
    );
  }

  const { count } = await admin
    .from("connection")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agency.id);
  const createdAt = agency.created_at ? new Date(agency.created_at).getTime() : Date.now();
  const ageDays = (Date.now() - createdAt) / 86_400_000;

  if ((count ?? 0) === 0 && ageDays >= 1) {
    const message = onboardingConnectSource({ agencyName, dashboardUrl });
    await sendLifecycleEmailOnce(
      admin,
      agency.id,
      "onboarding_connect_source",
      message,
      email
    );
  }
}

// Cron quotidien (07:30 Paris ≈ 05:30 UTC, voir vercel.json).
// Sécurisé par CRON_SECRET : Vercel Cron envoie `Authorization: Bearer <CRON_SECRET>`.
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
  const { data: agencies } = await admin
    .from("agency")
    .select("id, name, plan, trial_ends_at, subscription_status, created_at");

  let processed = 0;
  let skipped = 0;
  for (const agency of (agencies ?? []) as DailyAgencyRow[]) {
    const entitlement = getEntitlement(agency);
    if (!entitlement.active) {
      skipped += 1;
      continue;
    }

    try {
      await runDailyBrief(agency.id);
      processed += 1;
    } catch (error) {
      // une agence en erreur ne doit pas bloquer les autres
      skipped += 1;
      console.error("[cron-daily] Échec du brief quotidien.", {
        agencyId: agency.id,
        error,
      });
    }

    try {
      await sendDailyLifecycleEmails(admin, agency, entitlement);
    } catch (error) {
      console.error("[cron-daily] Échec des emails lifecycle.", {
        agencyId: agency.id,
        error,
      });
    }
  }

  return NextResponse.json({ processed, skipped });
}
