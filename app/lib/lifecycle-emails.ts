// Emails de cycle de vie — onboarding, fin d'essai, premier rapport.
// La charte et la coquille vivent dans email-theme.ts.

import { button, paragraph, plainText, shell } from "./email-theme.ts";

export type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

type OnboardingConnectSourceInput = {
  agencyName: string;
  dashboardUrl: string;
};

type TrialEndsSoonInput = {
  agencyName: string;
  daysLeft: number;
  upgradeUrl: string;
};

type FirstReportReadyInput = {
  agencyName: string;
  accountName: string;
  portalUrl: string;
};

function compose({
  subject,
  kicker,
  title,
  preheader,
  lines,
  cta,
}: {
  subject: string;
  kicker: string;
  title: string;
  preheader: string;
  lines: string[];
  cta?: { href: string; label: string };
}): EmailTemplate {
  return {
    subject,
    html: shell({
      kicker,
      title,
      preheader,
      bodyHtml: lines.map(paragraph).join("") + (cta ? button(cta) : ""),
    }),
    text: plainText({ kicker, title, lines, cta }),
  };
}

export function onboardingConnectSource({
  agencyName,
  dashboardUrl,
}: OnboardingConnectSourceInput): EmailTemplate {
  const name = agencyName || "votre agence";
  return compose({
    subject: "Il manque une source pour ouvrir votre registre",
    kicker: "Première étape",
    title: "Votre premier brief tombe demain à 07:30",
    preheader:
      "Une source connectée suffit pour lancer la surveillance de vos comptes.",
    lines: [
      `${name}, il reste une étape avant que Reportly commence à tenir votre registre : connecter une première source.`,
      "Connectez Meta Ads pour une synchronisation automatique, ou déposez un export CSV — huit jours consécutifs suffisent pour armer la détection.",
      "Dès le lendemain, le brief de 07:30 vous donne les urgences, les points de vigilance et les comptes sans anomalie.",
    ],
    cta: { href: dashboardUrl, label: "Connecter une source" },
  });
}

export function trialEndsSoon({
  agencyName,
  daysLeft,
  upgradeUrl,
}: TrialEndsSoonInput): EmailTemplate {
  const plural = daysLeft > 1 ? "s" : "";
  const name = agencyName || "Votre agence";
  return compose({
    subject: `Votre essai Reportly se termine dans ${daysLeft} jour${plural}`,
    kicker: `Essai · ${daysLeft} jour${plural}`,
    title: `Votre essai se termine dans ${daysLeft} jour${plural}`,
    preheader:
      "Conservez le registre, le brief quotidien et les portails clients.",
    lines: [
      `${name} arrive au terme de son essai Reportly.`,
      "Votre registre garde la trace de chaque incident détecté et corrigé : c'est cette continuité qui fait la valeur du rapport mensuel remis à vos clients.",
      "Choisissez un plan pour conserver l'historique, poursuivre les briefs de 07:30 et publier les prochains rapports sans interruption.",
    ],
    cta: { href: upgradeUrl, label: "Choisir un plan" },
  });
}

export function firstReportReady({
  agencyName,
  accountName,
  portalUrl,
}: FirstReportReadyInput): EmailTemplate {
  const name = agencyName || "Votre agence";
  return compose({
    subject: `Premier rapport prêt — ${accountName}`,
    kicker: "Rapport publié",
    title: "Votre premier rapport mensuel est prêt",
    preheader: `${accountName} · synthèse, faits marquants et priorité du mois.`,
    lines: [
      `${name}, le rapport mensuel de ${accountName} est publié dans le portail client.`,
      "Il reprend les indicateurs du mois face au précédent, la synthèse rédigée, les faits marquants et la priorité recommandée.",
      "Relisez-le avant de transmettre le lien : il est signé, à vos couleurs, et ne demande aucun compte à votre client.",
    ],
    cta: { href: portalUrl, label: "Ouvrir le rapport" },
  });
}
