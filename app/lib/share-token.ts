import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

function getShareTokenSecret(): string {
  const secret = process.env.SHARE_TOKEN_SECRET || process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "SHARE_TOKEN_SECRET ou TOKEN_ENCRYPTION_KEY doit être défini pour signer les liens portail."
    );
  }
  return secret;
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

export function makeShareToken(accountId: string, version = 1): string {
  // La version 1 conserve les liens émis avant l'ajout de la révocation.
  const payload = version === 1 ? accountId : `${version}:${accountId}`;
  return createHmac("sha256", getShareTokenSecret())
    .update(payload)
    .digest("base64url")
    .slice(0, 32);
}

export function verifyShareToken(
  accountId: string,
  token: string,
  version = 1
): boolean {
  const expected = makeShareToken(accountId, version);
  const expectedBuffer = Buffer.from(expected);
  const tokenBuffer = Buffer.from(token);

  if (tokenBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(tokenBuffer, expectedBuffer);
}
