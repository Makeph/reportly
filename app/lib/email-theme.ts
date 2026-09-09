// Coquille commune à tous les emails Reportly — direction « registre ».
// Un seul endroit définit la palette et la structure : c'est ce qui manquait
// jusqu'ici, et c'est pour cela que trois chartes avaient divergé.
//
// Contraintes email : tables, styles inline, aucune police distante (Georgia et
// Courier sont présents partout), ni box-shadow ni flex — Outlook les ignore.

export const PAPER = "#F5EFE2";
export const PAPER_2 = "#FBF7EC";
export const INK = "#23261D";
export const INK_2 = "#4C4A3C";
export const FAINT = "#8B8368";
export const RULE = "#D9CEB2";
export const RULE_SOFT = "#E6DEC8";
export const RED = "#BC3A1D";
export const AMBER = "#9A6E15";
export const GREEN = "#2F5D45";

export const SERIF = "Georgia,'Times New Roman',serif";
export const MONO = "'IBM Plex Mono',Consolas,'Courier New',monospace";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Paragraphe de corps de texte. */
export function paragraph(text: string): string {
  return `<p style="margin:0 0 18px;color:${INK_2};font-family:${SERIF};font-size:16px;line-height:1.6">${escapeHtml(
    text
  )}</p>`;
}

/** Bouton d'action — en table, seul montage que Outlook rend correctement. */
export function button(cta: { href: string; label: string }): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin:26px 0 0">
              <tr>
                <td style="background:${INK};border-radius:3px">
                  <a href="${escapeHtml(cta.href)}" style="display:inline-block;padding:15px 24px;color:${PAPER};font-family:${MONO};font-size:12px;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;text-decoration:none">${escapeHtml(
                    cta.label
                  )} &rarr;</a>
                </td>
              </tr>
            </table>`;
}

/** Filet horizontal : 2px pour l'encre, 1px pour la réglure. */
export function rule(color: string = RULE, height = 1): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse">
                  <tr><td style="height:${height}px;background:${color};line-height:${height}px;font-size:0">&nbsp;</td></tr>
                </table>`;
}

/**
 * Enveloppe complète : papier, cartouche filetée, pied de page.
 * `bodyHtml` est inséré tel quel — à charge de l'appelant de l'échapper.
 */
export function shell({
  kicker,
  title,
  preheader,
  bodyHtml,
  footNote = "Reportly &middot; registre de d&eacute;cisions",
}: {
  kicker: string;
  title: string;
  /** Texte d'aperçu affiché par la boîte de réception à côté de l'objet. */
  preheader: string;
  bodyHtml: string;
  footNote?: string;
}): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light only">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${PAPER};color:${INK_2}">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;visibility:hidden">${escapeHtml(
      preheader
    )}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${PAPER};border-collapse:collapse">
      <tr>
        <td align="center" style="padding:36px 16px">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:${PAPER_2};border:1px solid ${RULE};border-collapse:collapse">
            <tr>
              <td style="padding:36px 36px 32px">

                <p style="margin:0 0 6px;color:${RED};font-family:${MONO};font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase">${escapeHtml(
                  kicker
                )}</p>
                <div style="margin:0 0 22px">${rule(INK, 2)}</div>

                <h1 style="margin:0 0 18px;color:${INK};font-family:${SERIF};font-size:26px;line-height:1.2;font-weight:700">${escapeHtml(
                  title
                )}</h1>

                ${bodyHtml}

                <div style="margin:32px 0 0">${rule()}</div>
                <p style="margin:14px 0 0;color:${FAINT};font-family:${MONO};font-size:11px;letter-spacing:0.08em">${footNote}</p>

              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Version texte — lecteurs en texte seul, et meilleure délivrabilité. */
export function plainText({
  kicker,
  title,
  lines,
  cta,
  footNote = "Reportly · registre de décisions",
}: {
  kicker: string;
  title: string;
  lines: string[];
  cta?: { href: string; label: string };
  footNote?: string;
}): string {
  return [
    kicker.toUpperCase(),
    "",
    title,
    "",
    ...lines.flatMap((l) => [l, ""]),
    ...(cta ? [`${cta.label} : ${cta.href}`, ""] : []),
    "—",
    footNote,
  ].join("\n");
}
