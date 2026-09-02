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

// Attention au partage des rôles : avec signInWithOtp, Supabase crée le compte
// quand l'adresse est inconnue et envoie alors « Confirm signup ». C'est donc
// confirm-signup.html — et non magic-link.html — que reçoit un nouvel inscrit.
const templates = {
  "confirm-signup.html": {
    kicker: "Bienvenue",
    title: "Votre espace Reportly vous attend",
    preheader:
      "Un clic ouvre votre espace et démarre l'essai. Aucun mot de passe, aucune carte.",
    lines: [
      "Ce lien ouvre votre espace et démarre vos 14 jours d'essai — sans mot de passe à choisir et sans carte bancaire.",
      "Ensuite, une seule chose à faire : connecter une source, Meta Ads ou un export CSV. Le premier brief tombe le lendemain à 07:30, avec les urgences, les points de vigilance et les comptes sans anomalie.",
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : sans clic, aucun compte n'est ouvert.",
    ],
    cta: { href: CONFIRMATION_URL, label: "Ouvrir mon espace" },
  },
  "magic-link.html": {
    kicker: "Connexion",
    title: "Votre lien de connexion",
    preheader: "Un seul clic, aucun mot de passe. Le lien est à usage unique.",
    lines: [
      "Cliquez sur le bouton ci-dessous pour retrouver votre registre Reportly. Le lien est à usage unique et ne fonctionne que depuis cet e-mail.",
      "Si vous n'avez pas demandé cette connexion, ignorez ce message : sans clic, rien ne se passe.",
    ],
    cta: { href: CONFIRMATION_URL, label: "Ouvrir mon registre" },
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
