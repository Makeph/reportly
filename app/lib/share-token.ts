import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Jeton de partage du portail client.
//
// Deux garde-fous indépendants :
//   1. une VERSION par agence (stockée dans agency.branding.portalTokenVersion),
//      incrémentée depuis les réglages pour révoquer tous les liens d'un coup ;
//   2. une DATE D'EXPIRATION portée par le jeton lui-même, couverte par la
//      signature — on ne peut donc pas la rallonger sans invalider le jeton.
//
// Format : "<expiration en base36>.<hmac tronqué>".
// Les jetons émis avant l'ajout de l'expiration ne portent pas de point : ils
// sont refusés. Aucun lien n'ayant encore été envoyé à un client réel, il n'y a
// pas de compatibilité ascendante à préserver.

const LONGUEUR_SIGNATURE = 32;
const SEPARATEUR = ".";
const DUREE_PAR_DEFAUT_JOURS = 180;

function getShareTokenSecret(): string {
  const secret = process.env.SHARE_TOKEN_SECRET || process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "SHARE_TOKEN_SECRET ou TOKEN_ENCRYPTION_KEY doit être défini pour signer les liens portail."
    );
  }
  return secret;
}

// Le client d'une agence doit pouvoir revenir consulter son rapport mensuel
// plusieurs mois durant : une durée courte casserait l'usage du portail.
function dureeVieSecondes(): number {
  const brut = Number(process.env.PORTAL_LINK_TTL_DAYS);
  const jours =
    Number.isFinite(brut) && brut > 0 ? brut : DUREE_PAR_DEFAUT_JOURS;
  return Math.floor(jours * 86_400);
}

export function getPortalTokenVersion(branding: unknown): number {
  if (!branding || typeof branding !== "object" || Array.isArray(branding)) {
    return 1;
  }

  const version = (branding as Record<string, unknown>).portalTokenVersion;
  return Number.isSafeInteger(version) && Number(version) >= 1
    ? Number(version)
    : 1;
}

function signer(accountId: string, version: number, expiration: number): string {
  return createHmac("sha256", getShareTokenSecret())
    .update(`${version}:${accountId}:${expiration}`)
    .digest("base64url")
    .slice(0, LONGUEUR_SIGNATURE);
}

export function makeShareToken(accountId: string, version = 1): string {
  const expiration = Math.floor(Date.now() / 1000) + dureeVieSecondes();
  return `${expiration.toString(36)}${SEPARATEUR}${signer(
    accountId,
    version,
    expiration
  )}`;
}

export function verifyShareToken(
  accountId: string,
  token: string,
  version = 1
): boolean {
  if (typeof token !== "string") return false;

  const separateur = token.indexOf(SEPARATEUR);
  if (separateur <= 0) return false; // format hérité ou malformé

  const expiration = Number.parseInt(token.slice(0, separateur), 36);
  if (!Number.isSafeInteger(expiration)) return false;
  if (expiration <= Math.floor(Date.now() / 1000)) return false; // expiré

  const signature = token.slice(separateur + 1);
  const attendue = signer(accountId, version, expiration);

  const recue = Buffer.from(signature);
  const reference = Buffer.from(attendue);
  // timingSafeEqual exige des longueurs égales : on garde le test avant.
  if (recue.length !== reference.length) return false;
  return timingSafeEqual(recue, reference);
}
