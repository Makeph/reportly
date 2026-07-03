// Envoi du brief par email via Resend (HTTP API, pas de SDK).

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dot(sev: string): string {
  const c = sev === "red" ? "#DC2626" : sev === "amber" ? "#F59E0B" : "#16A34A";
  return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};margin-right:8px;vertical-align:middle"></span>`;
}

function renderBriefHtml(o: BriefEmailInput, dashboardUrl: string): string {
  const ras = o.alerts.length === 0;
  const rows = o.alerts
    .map(
      (a) => `<tr><td style="padding:14px 16px;border:1px solid #E2E8F0;border-radius:12px">
        ${dot(a.severity)}<b style="color:#0B2239">${escapeHtml(a.title)}</b>
        <div style="color:#3D5468;font-size:14px;margin-top:4px">${escapeHtml(a.body)}</div>
      </td></tr><tr><td style="height:10px"></td></tr>`
    )
    .join("");

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;color:#3D5468">
    <h1 style="color:#0B2239;font-size:20px;margin:0 0 4px">Brief du matin — ${escapeHtml(o.date)}</h1>
    <p style="color:#7C8FA3;font-size:13px;margin:0 0 20px">${escapeHtml(o.agencyName)} · ${o.counts.red} urgence(s) · ${o.counts.amber} vigilance(s)</p>
    ${
      ras
        ? `<p style="font-size:15px">RAS sur tous vos comptes ce matin. ✓</p>`
        : `<table style="width:100%;border-collapse:separate;border-spacing:0">${rows}</table>`
    }
    <p style="margin-top:24px"><a href="${dashboardUrl}" style="color:#1F6BFF;font-weight:600">Ouvrir le dashboard →</a></p>
    <p style="color:#94A8BE;font-size:12px;margin-top:28px">Reportly — brief interne, jamais montré à vos clients.</p>
  </div>`;
}

// Retourne true si l'email est parti. Sans RESEND_API_KEY → false (pas d'erreur).
export async function sendBriefEmail(input: BriefEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const from = process.env.BRIEF_FROM_EMAIL || "Reportly <brief@getreportly.fr>";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://app.getreportly.fr";
  const html = renderBriefHtml(input, `${siteUrl}/dashboard`);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: `Brief du matin — ${input.date}`,
      html,
    }),
  });
  return res.ok;
}
