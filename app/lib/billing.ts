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
