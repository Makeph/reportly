import { createAdminClient } from "@/lib/supabase/admin";
import { scanAgency } from "@/lib/scan";
import { sendBriefEmail, type BriefAlert } from "@/lib/email";

const SEV_RANK: Record<string, number> = { red: 0, amber: 1, green: 2 };

export type DailyBriefResult = {
  counts: { red: number; amber: number };
  emailed: boolean;
};

// Brief quotidien d'une agence : (re)scan → compose le brief → email → trace.
export async function runDailyBrief(agencyId: string): Promise<DailyBriefResult> {
  const admin = createAdminClient();

  await scanAgency(agencyId);

  const { data: accounts } = await admin
    .from("client_account")
    .select("id")
    .eq("agency_id", agencyId);
  const accIds = (accounts ?? []).map((a) => a.id);

  let alerts: BriefAlert[] = [];
  if (accIds.length) {
    const { data } = await admin
      .from("detection")
      .select("severity, title, body")
      .in("client_account_id", accIds)
      .is("resolved_at", null);
    alerts = ((data ?? []) as BriefAlert[]).sort(
      (a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9)
    );
  }

  const counts = {
    red: alerts.filter((a) => a.severity === "red").length,
    amber: alerts.filter((a) => a.severity === "amber").length,
  };

  // Destinataire = owner de l'agence.
  const { data: agencyRow } = await admin
    .from("agency")
    .select("name")
    .eq("id", agencyId)
    .maybeSingle<{ name: string | null }>();
  const agencyName = agencyRow?.name || "votre agence";

  const { data: member } = await admin
    .from("agency_member")
    .select("user_id")
    .eq("agency_id", agencyId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle<{ user_id: string }>();

  let email: string | null = null;
  if (member?.user_id) {
    const { data } = await admin.auth.admin.getUserById(member.user_id);
    email = data.user?.email ?? null;
  }

  const today = new Date().toISOString().slice(0, 10);
  let emailed = false;
  if (email) {
    // Brief envoyé chaque jour, RAS inclus — c'est la boucle d'habitude.
    emailed = await sendBriefEmail({
      to: email,
      agencyName,
      date: today,
      counts,
      alerts: alerts.slice(0, 10),
    });
  }

  await admin.from("brief").upsert(
    {
      agency_id: agencyId,
      brief_date: today,
      counts,
      sent_at: emailed ? new Date().toISOString() : null,
    },
    { onConflict: "agency_id,brief_date" }
  );

  return { counts, emailed };
}
