// Client minimal de la Meta Marketing API (Graph API).
// Scope requis : ads_read. Tous les appels sont en lecture seule.

const GRAPH = "https://graph.facebook.com";

function apiVersion(): string {
  return process.env.META_API_VERSION || "v21.0";
}

function appId(): string {
  return process.env.META_APP_ID ?? "";
}

function appSecret(): string {
  return process.env.META_APP_SECRET ?? "";
}

type TokenResponse = { access_token: string; expires_in?: number };

async function graphGet<T>(url: URL): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message ?? `Meta API ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

// Code OAuth → token court (~1-2 h).
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<TokenResponse> {
  const url = new URL(`${GRAPH}/${apiVersion()}/oauth/access_token`);
  url.searchParams.set("client_id", appId());
  url.searchParams.set("client_secret", appSecret());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);
  return graphGet<TokenResponse>(url);
}

// Token court → token long (~60 jours).
export async function getLongLivedToken(
  shortToken: string
): Promise<TokenResponse> {
  const url = new URL(`${GRAPH}/${apiVersion()}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId());
  url.searchParams.set("client_secret", appSecret());
  url.searchParams.set("fb_exchange_token", shortToken);
  return graphGet<TokenResponse>(url);
}

export type MetaAdAccount = {
  id: string; // "act_123456"
  name?: string;
  currency?: string;
  account_status?: number;
};

export async function listAdAccounts(token: string): Promise<MetaAdAccount[]> {
  const url = new URL(`${GRAPH}/${apiVersion()}/me/adaccounts`);
  url.searchParams.set("fields", "id,name,currency,account_status");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", token);
  const data = await graphGet<{ data?: MetaAdAccount[] }>(url);
  return data.data ?? [];
}

export type MetaDailyInsight = { date: string; spend: number };

// Dépense quotidienne (time_increment=1) sur les 30 derniers jours.
export async function getDailySpend(
  token: string,
  actId: string,
  datePreset = "last_30d"
): Promise<MetaDailyInsight[]> {
  const url = new URL(`${GRAPH}/${apiVersion()}/${actId}/insights`);
  url.searchParams.set("fields", "spend");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("date_preset", datePreset);
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", token);
  const data = await graphGet<{ data?: Array<{ date_start: string; spend?: string }> }>(url);
  return (data.data ?? []).map((row) => ({
    date: row.date_start,
    spend: Number.parseFloat(row.spend ?? "0") || 0,
  }));
}
