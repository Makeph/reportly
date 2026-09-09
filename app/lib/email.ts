// Envoi via Resend (HTTP API, pas de SDK). La charte des emails est dans
// email-theme.ts — ce fichier ne fait que composer le brief et transporter.

import {
  AMBER,
  FAINT,
  GREEN,
  INK,
  INK_2,
  MONO,
  RED,
  RULE_SOFT,
  SERIF,
  escapeHtml,
  paragraph,
  plainText,
  shell,
} from "./email-theme.ts";

export type BriefAlert = {
  severity: "red" | "amber" | "green";
  title: string;
  body: string;
};

type BriefEmailInput = {
  to: string;
  agencyName: string;
  date: string;
  counts: { red: number; amber: number };
  alerts: BriefAlert[];
};

type LifecycleEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

function severityColor(sev: string): string {
  return sev === "red" ? RED : sev === "amber" ? AMBER : GREEN;
}

/** Une alerte = une entrée de registre : pastille, intitulé, constat. */
function alertRow(a: BriefAlert): string {
  const color = severityColor(a.severity);
  return `<tr>
                    <td style="padding:16px 0;border-top:1px solid ${RULE_SOFT}">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse">
                        <tr>
                          <td width="20" valign="top" style="padding:6px 12px 0 0">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse">
                              <tr><td width="9" height="9" style="width:9px;height:9px;background:${color};border-radius:50%;font-size:0;line-height:9px">&nbsp;</td></tr>
                            </table>
                          </td>
                          <td valign="top">
                            <div style="color:${INK};font-family:${MONO};font-size:13px;font-weight:600;letter-spacing:0.02em">${escapeHtml(
                              a.title
                            )}</div>
                            <div style="margin-top:5px;color:${INK_2};font-family:${SERIF};font-size:15px;line-height:1.55">${escapeHtml(
                              a.body
                            )}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>`;
}

function renderBrief(
  o: BriefEmailInput,
  dashboardUrl: string
): { html: string; text: string } {
  const ras = o.alerts.length === 0;
  const tally = `${o.counts.red} urgence${o.counts.red > 1 ? "s" : ""} · ${
    o.counts.amber
  } vigilance${o.counts.amber > 1 ? "s" : ""}`;

  const tallyLine = `<p style="margin:0 0 8px;color:${FAINT};font-family:${MONO};font-size:11px;letter-spacing:0.1em;text-transform:uppercase">${escapeHtml(
    o.agencyName
  )} &middot; ${escapeHtml(tally)}</p>`;

  const bodyHtml = ras
    ? tallyLine +
      paragraph(
        "Rien à signaler ce matin : dépense, CPA et volume dans les bornes sur tous vos comptes."
      )
    : tallyLine +
      `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin:18px 0 0">
                    ${o.alerts.map(alertRow).join("")}
                  </table>` +
      `<p style="margin:26px 0 0"><a href="${escapeHtml(
        dashboardUrl
      )}" style="color:${RED};font-family:${MONO};font-size:12px;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;text-decoration:none">Ouvrir le registre &rarr;</a></p>`;

  const html = shell({
    kicker: `Brief du matin · ${o.date}`,
    title: ras ? "Rien à signaler ce matin" : `${tally}`,
    preheader: ras
      ? "Tous vos comptes sont dans les bornes."
      : o.alerts.map((a) => a.title).join(" · "),
    bodyHtml,
    footNote: "Reportly &middot; brief interne, jamais montr&eacute; &agrave; vos clients",
  });

  const text = plainText({
    kicker: `Brief du matin · ${o.date}`,
    title: ras ? "Rien à signaler ce matin" : tally,
    lines: ras
      ? [
          `${o.agencyName} · ${tally}`,
          "Dépense, CPA et volume dans les bornes sur tous vos comptes.",
        ]
      : [
          `${o.agencyName} · ${tally}`,
          ...o.alerts.map((a) => `- ${a.title} — ${a.body}`),
        ],
    cta: ras ? undefined : { href: dashboardUrl, label: "Ouvrir le registre" },
    footNote: "Reportly · brief interne, jamais montré à vos clients",
  });

  return { html, text };
}

async function postToResend(payload: {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
}): Promise<Response> {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

// Retourne true si l'email est parti. Sans RESEND_API_KEY → false (pas d'erreur).
export async function sendBriefEmail(input: BriefEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const from = process.env.BRIEF_FROM_EMAIL || "Reportly <brief@getreportly.fr>";
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://app.getreportly.fr";
  const { html, text } = renderBrief(input, `${siteUrl}/dashboard`);

  const res = await postToResend({
    from,
    to: [input.to],
    subject: `Brief du matin — ${input.date}`,
    html,
    text,
  });
  return res.ok;
}

// Envoi lifecycle via le même canal Resend que le brief. Non bloquant par design.
export async function sendLifecycleEmail(
  input: LifecycleEmailInput
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("[lifecycle-email] RESEND_API_KEY absente, envoi ignoré.");
    return false;
  }
  const from = process.env.BRIEF_FROM_EMAIL || "Reportly <brief@getreportly.fr>";

  try {
    const res = await postToResend({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    if (!res.ok) {
      console.log("[lifecycle-email] Resend a refusé l'envoi.", {
        status: res.status,
      });
    }
    return res.ok;
  } catch (error) {
    console.log("[lifecycle-email] Envoi ignoré après erreur Resend.", error);
    return false;
  }
}
