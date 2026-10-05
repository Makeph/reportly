// L'adresse publique de l'application, en un seul endroit.
//
// Trois chemins d'e-mail construisent des liens — brief quotidien, cycle de
// vie, premier rapport — et chacun portait son propre repli en dur sur
// `https://app.getreportly.fr`. Ce domaine n'est pas déclaré côté Vercel : il
// ne sert aucun certificat, donc un destinataire qui clique tombe sur un
// avertissement de sécurité. Le repli était pire que pas de repli du tout.
//
// Vercel renseigne `VERCEL_PROJECT_PRODUCTION_URL` sur chaque déploiement
// (le domaine de production, sans protocole). On s'appuie dessus : plus aucun
// réglage manuel n'est nécessaire pour que les liens soient valides, et
// `NEXT_PUBLIC_SITE_URL` reste prioritaire pour imposer un domaine propre.

function trim(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

export function siteUrl(): string {
  const explicit = trim(process.env.NEXT_PUBLIC_SITE_URL);
  if (explicit) return explicit;

  // Fourni par Vercel, sans protocole — et parfois recopié avec, à la main.
  const vercel = trim(process.env.VERCEL_PROJECT_PRODUCTION_URL).replace(
    /^https?:\/\//,
    ""
  );
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
