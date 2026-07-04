type EmailTemplate = {
  subject: string;
  html: string;
};

type OnboardingConnectSourceInput = {
  agencyName: string;
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderEmail({
  title,
  intro,
  paragraphs,
  cta,
}: {
  title: string;
  intro: string;
  paragraphs: string[];
  cta?: { href: string; label: string };
}): string {
  const body = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;color:#3F3F46;font-size:15px;line-height:1.55">${escapeHtml(
          p
        )}</p>`
    )
    .join("");
  const button = cta
    ? `<tr><td style="padding-top:8px"><a href="${escapeHtml(
        cta.href
      )}" style="display:inline-block;background:#2563EB;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;line-height:1;padding:14px 18px;border-radius:8px">${escapeHtml(
        cta.label
      )}</a></td></tr>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FAFAFA;border-collapse:collapse">
      <tr>
        <td align="center" style="padding:32px 16px">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;background:#FFFFFF;border-collapse:separate;border-spacing:0;border-radius:8px">
            <tr>
              <td style="padding:32px">
                <h1 style="margin:0 0 12px;color:#18181B;font-size:22px;line-height:1.25;font-weight:700">${escapeHtml(
                  title
                )}</h1>
                <p style="margin:0 0 20px;color:#3F3F46;font-size:15px;line-height:1.55">${escapeHtml(
                  intro
                )}</p>
                ${body}
                <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse">${button}</table>
                <p style="margin:28px 0 0;color:#71717A;font-size:12px;line-height:1.5">Reportly</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function onboardingConnectSource({
  agencyName,
}: OnboardingConnectSourceInput): EmailTemplate {
  const name = agencyName || "votre agence";
  return {
    subject: "Connectez votre première source",
    html: renderEmail({
      title: "Votre premier brief tombe demain à 07:30",
      intro: `${name}, il reste une étape pour lancer Reportly : connecter une première source de données.`,
      paragraphs: [
        "Une fois la source connectée, Reportly commence à surveiller vos comptes et prépare le brief quotidien pour votre équipe.",
        "Le premier brief arrive demain à 07:30. Il vous donne les urgences, les points de vigilance et les comptes sans anomalie.",
      ],
      cta: {
        href: "https://app.getreportly.fr/dashboard",
        label: "Connecter une source",
      },
    }),
  };
}

export function trialEndsSoon({
  agencyName,
  daysLeft,
  upgradeUrl,
}: TrialEndsSoonInput): EmailTemplate {
  const plural = daysLeft > 1 ? "s" : "";
  return {
    subject: `Votre essai Reportly se termine dans ${daysLeft} jour${plural}`,
    html: renderEmail({
      title: `Votre essai se termine dans ${daysLeft} jour${plural}`,
      intro: `${agencyName || "Votre agence"} arrive à la fin de son essai Reportly.`,
      paragraphs: [
        "Depuis le dashboard, vous gardez le registre des incidents, le brief quotidien à 07:30 et les rapports mensuels white-label pour vos clients.",
        "Passez sur un plan actif pour conserver l'historique, continuer les briefs et publier les prochains rapports sans interruption.",
      ],
      cta: { href: upgradeUrl, label: "Choisir un plan" },
    }),
  };
}

export function firstReportReady({
  agencyName,
  accountName,
  portalUrl,
}: FirstReportReadyInput): EmailTemplate {
  return {
    subject: `Premier rapport prêt — ${accountName}`,
    html: renderEmail({
      title: "Votre premier rapport mensuel est prêt",
      intro: `${agencyName || "Votre agence"}, le premier rapport mensuel de ${accountName} est publié dans le portail client.`,
      paragraphs: [
        "Le rapport reprend les indicateurs du mois, la synthèse, les faits marquants et la priorité recommandée.",
        "Le lien est signé et peut être partagé avec votre client pour consulter le portail white-label.",
      ],
      cta: { href: portalUrl, label: "Ouvrir le rapport" },
    }),
  };
}
