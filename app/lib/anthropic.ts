// Appel minimal à l'API Messages d'Anthropic (fetch, pas de SDK).
// Modèle par défaut : Haiku 4.5 (rapide, bon marché) — adapté à la synthèse de masse.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export function anthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
}

// Demande une réponse JSON et la parse. Renvoie null sans clé API ou en cas d'échec
// (l'appelant doit prévoir un fallback).
export async function claudeJson<T>(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<T | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: anthropicModel(),
        max_tokens: opts.maxTokens ?? 1024,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = await res.json();
  const text: string = data?.content?.[0]?.text ?? "";
  try {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}
