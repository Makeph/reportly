import type { SupabaseClient } from "@supabase/supabase-js";

// Calcul de l'accès (entitlement) d'une agence : essai actif OU abonnement actif.
export type AgencyRow = {
  id?: string;
  name?: string | null;
  plan?: string | null;
  trial_ends_at?: string | null;
  subscription_status?: string | null;
} | null;

export type Entitlement = {
  active: boolean;
  label: string;
  trialActive: boolean;
  subActive: boolean;
};

const ACTIVE_SUB_STATUSES = ["active", "trialing", "past_due"];

export const CLIENT_ACCOUNT_QUOTAS = {
  starter: 3,
  growth: 20,
  pro: Number.POSITIVE_INFINITY,
} as const;

export function getEntitlement(agency: AgencyRow): Entitlement {
  if (!agency) {
    return { active: false, label: "Aucune agence", trialActive: false, subActive: false };
  }

  const now = Date.now();
  const trialActive =
    !!agency.trial_ends_at && new Date(agency.trial_ends_at).getTime() > now;
  const subActive = ACTIVE_SUB_STATUSES.includes(agency.subscription_status ?? "");
  const active = trialActive || subActive;

  let label = "Inactif";
  if (subActive) {
    label = `Abonné — ${agency.plan ?? "plan"}`;
  } else if (trialActive) {
    const days = Math.ceil(
      (new Date(agency.trial_ends_at!).getTime() - now) / 86_400_000
    );
    label = `Essai — ${days} j restant${days > 1 ? "s" : ""}`;
  }

  return { active, label, trialActive, subActive };
}

// Un essai sans abonnement bénéficie du quota Growth. Tout plan inconnu
// retombe sur Starter afin de ne jamais ouvrir accidentellement un quota large.
export function maxClientAccounts(agency: AgencyRow): number {
  const entitlement = getEntitlement(agency);
  if (entitlement.trialActive && !entitlement.subActive) {
    return CLIENT_ACCOUNT_QUOTAS.growth;
  }

  const plan = agency?.plan?.trim().toLowerCase();
  if (plan === "growth" || plan === "pro") {
    return CLIENT_ACCOUNT_QUOTAS[plan];
  }
  return CLIENT_ACCOUNT_QUOTAS.starter;
}

type ActiveAgency = NonNullable<AgencyRow> & { id: string };

export type ActiveAgencyResult =
  | {
      ok: true;
      agency: ActiveAgency;
      entitlement: Entitlement;
    }
  | {
      ok: false;
      status: 401 | 402 | 403 | 500;
      code:
        | "unauthenticated"
        | "subscription_required"
        | "agency_not_found"
        | "agency_lookup_failed";
      error: string;
    };

// Résout l'agence de l'utilisateur courant et bloque les accès sans abonnement
// ni essai actif. Le résultat est directement exploitable par une route HTTP.
export async function requireActiveAgency(
  supabase: SupabaseClient
): Promise<ActiveAgencyResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      status: 401,
      code: "unauthenticated",
      error: "Non authentifié.",
    };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("agency_member")
    .select("agency_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle<{ agency_id: string }>();
  if (membershipError) {
    return {
      ok: false,
      status: 500,
      code: "agency_lookup_failed",
      error: "Impossible de vérifier l’accès à l’agence.",
    };
  }
  if (!membership?.agency_id) {
    return {
      ok: false,
      status: 403,
      code: "agency_not_found",
      error: "Aucune agence associée à cet utilisateur.",
    };
  }

  const { data: agency, error: agencyError } = await supabase
    .from("agency")
    .select("id, name, plan, trial_ends_at, subscription_status")
    .eq("id", membership.agency_id)
    .maybeSingle<ActiveAgency>();
  if (agencyError) {
    return {
      ok: false,
      status: 500,
      code: "agency_lookup_failed",
      error: "Impossible de vérifier l’accès à l’agence.",
    };
  }
  if (!agency) {
    return {
      ok: false,
      status: 403,
      code: "agency_not_found",
      error: "Aucune agence associée à cet utilisateur.",
    };
  }

  const entitlement = getEntitlement(agency);
  if (!entitlement.active) {
    return {
      ok: false,
      status: 402,
      code: "subscription_required",
      error:
        "Votre essai ou abonnement n’est plus actif. Choisissez un plan pour continuer.",
    };
  }

  return { ok: true, agency, entitlement };
}
