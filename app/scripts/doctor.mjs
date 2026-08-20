// Diagnostic des intégrations : lit .env.local et teste réellement chaque service.
// Objectif : savoir en une commande ce qui est prêt et ce qui bloque, sans
// avoir à dérouler un parcours complet dans le navigateur.
//   node scripts/doctor.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const racine = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cheminEnv = path.join(racine, ".env.local");

if (!fs.existsSync(cheminEnv)) {
  console.error("Aucun .env.local trouvé. Copie .env.example et remplis-le.");
  process.exit(1);
}

const env = Object.fromEntries(
  fs
    .readFileSync(cheminEnv, "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const OK = "  OK   ";
const ABSENT = " ABSENT";
const ECHEC = " ECHEC ";
let bloquants = 0;

function ligne(etat, service, detail) {
  console.log(`[${etat}] ${service.padEnd(22)} ${detail}`);
}

// Un service absent n'est pas une erreur : il est simplement pas encore branché.
// Un service configuré mais qui répond mal, si.
async function sonde({ nom, cles, essai, facultatif = false }) {
  const manquantes = cles.filter((c) => !env[c]);
  if (manquantes.length) {
    ligne(ABSENT, nom, `à configurer : ${manquantes.join(", ")}`);
    if (!facultatif) bloquants += 1;
    return;
  }
  try {
    ligne(OK, nom, await essai());
  } catch (e) {
    ligne(ECHEC, nom, e.message);
    bloquants += 1;
  }
}

async function json(url, options) {
  const r = await fetch(url, options);
  const corps = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${corps.slice(0, 120)}`);
  try {
    return JSON.parse(corps);
  } catch {
    return corps;
  }
}

console.log("\nDiagnostic Reportly — intégrations\n");

await sonde({
  nom: "Supabase",
  cles: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  async essai() {
    const base = env.NEXT_PUBLIC_SUPABASE_URL;
    const entetes = {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    };
    const agences = await json(`${base}/rest/v1/agency?select=id&limit=1`, { headers: entetes });
    // La table lifecycle_event n'existe que si la migration 0005 a été appliquée.
    let migrations = "migrations 0005/0006 appliquées";
    const r = await fetch(`${base}/rest/v1/lifecycle_event?select=id&limit=1`, { headers: entetes });
    if (!r.ok) migrations = "MIGRATIONS 0005/0006 NON APPLIQUÉES (SQL Editor)";
    return `joignable · ${agences.length} agence(s) · ${migrations}`;
  },
});

await sonde({
  nom: "Stripe",
  cles: ["STRIPE_SECRET_KEY", "STRIPE_PRICE_STARTER", "STRIPE_PRICE_GROWTH", "STRIPE_PRICE_PRO"],
  async essai() {
    const auth = { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` };
    const compte = await json("https://api.stripe.com/v1/account", { headers: auth });
    const prix = [];
    for (const cle of ["STRIPE_PRICE_STARTER", "STRIPE_PRICE_GROWTH", "STRIPE_PRICE_PRO"]) {
      const p = await json(`https://api.stripe.com/v1/prices/${env[cle]}`, { headers: auth });
      prix.push(`${(p.unit_amount ?? 0) / 100}${p.currency === "eur" ? "€" : p.currency}`);
    }
    const mode = env.STRIPE_SECRET_KEY.startsWith("sk_live") ? "LIVE" : "test";
    const webhook = env.STRIPE_WEBHOOK_SECRET ? "webhook configuré" : "WEBHOOK MANQUANT";
    return `${compte.id} (${mode}) · prix ${prix.join(" / ")} · ${webhook}`;
  },
});

await sonde({
  nom: "Resend",
  cles: ["RESEND_API_KEY"],
  async essai() {
    const d = await json("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
    });
    const domaines = d.data ?? [];
    const verifies = domaines.filter((x) => x.status === "verified");
    if (!verifies.length) {
      throw new Error(
        `aucun domaine vérifié (${domaines.length} déclaré(s)) — les emails partiraient en échec`
      );
    }
    return `${verifies.map((x) => x.name).join(", ")} vérifié(s)`;
  },
});

await sonde({
  nom: "Meta Ads",
  cles: ["META_APP_ID", "META_APP_SECRET"],
  facultatif: true, // l'import CSV couvre la bêta sans Meta
  async essai() {
    const v = env.META_API_VERSION || "v21.0";
    const t = await json(
      `https://graph.facebook.com/${v}/oauth/access_token?client_id=${env.META_APP_ID}` +
        `&client_secret=${env.META_APP_SECRET}&grant_type=client_credentials`
    );
    return t.access_token ? `app ${env.META_APP_ID} authentifiée (${v})` : "réponse inattendue";
  },
});

await sonde({
  nom: "Anthropic",
  cles: ["ANTHROPIC_API_KEY"],
  facultatif: true, // sans clé, un rapport de repli est généré
  async essai() {
    await json("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    });
    return `clé valide · modèle ${env.ANTHROPIC_MODEL || "par défaut"}`;
  },
});

await sonde({
  nom: "Secrets internes",
  cles: ["TOKEN_ENCRYPTION_KEY", "CRON_SECRET", "SHARE_TOKEN_SECRET"],
  async essai() {
    const cle = Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64");
    if (cle.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY doit faire 32 octets en base64");
    const distinct = env.SHARE_TOKEN_SECRET !== env.TOKEN_ENCRYPTION_KEY;
    return `clé de chiffrement valide · secret portail ${distinct ? "distinct" : "IDENTIQUE au chiffrement (à séparer)"}`;
  },
});

console.log(
  bloquants === 0
    ? "\nTout est prêt.\n"
    : `\n${bloquants} point(s) à traiter avant la mise en production.\n`
);
process.exitCode = bloquants === 0 ? 0 : 1;
