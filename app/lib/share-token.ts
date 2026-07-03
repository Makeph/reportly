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

export function makeShareToken(accountId: string): string {
  return createHmac("sha256", getShareTokenSecret())
    .update(accountId)
    .digest("base64url")
    .slice(0, 32);
}

export function verifyShareToken(accountId: string, token: string): boolean {
  const expected = makeShareToken(accountId);
  const expectedBuffer = Buffer.from(expected);
  const tokenBuffer = Buffer.from(token);

  if (tokenBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(tokenBuffer, expectedBuffer);
}
