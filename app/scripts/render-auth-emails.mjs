// Génère les gabarits d'email d'authentification à coller dans Supabase.
//
// Ces emails-là ne partent pas de notre code : c'est Supabase qui les envoie
// (Authentication → Emails → Templates). Les générer depuis la même coquille
// que les emails applicatifs évite qu'ils divergent — c'est exactement ce qui
// s'était produit avec les trois palettes précédentes.
//
//   npm run emails:auth
//
// Puis coller le contenu de supabase/templates/*.html dans le template
// correspondant du dashboard Supabase.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { button, paragraph, shell } from "../lib/email-theme.ts";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(appDir, "supabase", "templates");

// Variables Go de Supabase — laissées telles quelles dans le HTML.
const CONFIRMATION_URL = "{{ .ConfirmationURL }}";

const templates = {
  "magic-link.html": {
    kicker: "Connexion",
    title: "Votre lien de connexion",
    preheader: "Un seul clic, aucun mot de passe. Le lien est à usage unique.",
    lines: [
      "Cliquez sur le bouton ci-dessous pour ouvrir votre registre Reportly. Le lien est à usage unique et ne fonctionne que depuis cet e-mail.",
      "Si vous n'avez pas demandé cette connexion, ignorez ce message : sans clic, rien ne se passe.",
    ],
    cta: { href: CONFIRMATION_URL, label: "Ouvrir mon registre" },
  },
  "confirm-signup.html": {
    kicker: "Bienvenue",
    title: "Confirmez votre adresse",
    preheader: "Une confirmation, et votre registre s'ouvre.",
    lines: [
      "Confirmez cette adresse pour ouvrir votre espace Reportly et démarrer vos 14 jours d'essai — sans carte bancaire.",
      "Ensuite, une source connectée suffit : le premier brief tombe le lendemain à 07:30.",
    ],
    cta: { href: CONFIRMATION_URL, label: "Confirmer mon adresse" },
  },
};

mkdirSync(outDir, { recursive: true });

for (const [file, { kicker, title, preheader, lines, cta }] of Object.entries(
  templates
)) {
  const html = shell({
    kicker,
    title,
    preheader,
    bodyHtml: lines.map(paragraph).join("") + button(cta),
  });
  writeFileSync(join(outDir, file), html, "utf8");
  console.log("écrit :", join("supabase", "templates", file));
}
