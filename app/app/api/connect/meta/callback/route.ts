import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { maxClientAccounts, requireActiveAgency } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken } from "@/lib/crypto";
import {
  exchangeCodeForToken,
  getLongLivedToken,
  listAdAccounts,
} from "@/lib/meta";
import { scanAgency } from "@/lib/scan";

// Callback OAuth : échange le code, chiffre le token, importe les comptes,
// lance l'audit initial, puis renvoie au dashboard.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("meta_oauth_state")?.value;
  cookieStore.delete("meta_oauth_state");

  const dash = (q: string) => NextResponse.redirect(`${origin}/dashboard?${q}`);

  if (!code || !state || state !== savedState) {
    return dash("connect=meta_error&reason=state");
  }

  const supabase = await createClient();
  const access = await requireActiveAgency(supabase);
  if (!access.ok) {
    if (access.code === "unauthenticated") {
      return NextResponse.redirect(`${origin}/login`);
    }
    if (access.code === "subscription_required") {
      return dash("error=subscription");
    }
    return dash("connect=meta_error&reason=agency");
  }
  const { agency } = access;

  try {
    const redirectUri = `${origin}/api/connect/meta/callback`;
    const short = await exchangeCodeForToken(code, redirectUri);
    const long = await getLongLivedToken(short.access_token);
    const token = long.access_token;
    const expiresAt = long.expires_in
      ? new Date(Date.now() + long.expires_in * 1000).toISOString()
      : null;

    const admin = createAdminClient();
    const accounts = [
      ...new Map(
        (await listAdAccounts(token)).map((account) => [account.id, account])
      ).values(),
    ];

    if (accounts.length) {
      const externalIds = accounts.map((account) => account.id);
      const { data: existingAccounts, error: existingAccountsError } = await admin
        .from("client_account")
        .select("external_id")
        .eq("agency_id", agency.id)
        .in("external_id", externalIds);
      if (existingAccountsError) throw existingAccountsError;

      const { count, error: countError } = await admin
        .from("client_account")
        .select("id", { count: "exact", head: true })
        .eq("agency_id", agency.id);
      if (countError) throw countError;

      const existingIds = new Set(
        (existingAccounts ?? []).map((account) => account.external_id)
      );
      const newAccounts = externalIds.filter((id) => !existingIds.has(id)).length;
      const available = Math.max(
        0,
        maxClientAccounts(agency) - (count ?? 0)
      );
      if (newAccounts > available) {
        return dash("error=quota");
      }
    }

    // Une seule connexion Meta par agence pour le MVP : on repart propre.
    await admin
      .from("connection")
      .delete()
      .eq("agency_id", agency.id)
      .eq("provider", "meta");

    const { data: conn } = await admin
      .from("connection")
      .insert({
        agency_id: agency.id,
        provider: "meta",
        access_token: encryptToken(token),
        scopes: "ads_read",
        status: "active",
        token_expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (accounts.length && conn) {
      await admin.from("client_account").upsert(
        accounts.map((a) => ({
          agency_id: agency.id,
          connection_id: conn.id,
          name: a.name || a.id,
          external_id: a.id,
          currency: a.currency || "EUR",
        })),
        { onConflict: "agency_id,external_id" }
      );
    }

    const result = await scanAgency(agency.id);
    return dash(`connect=meta_ok&findings=${result.openTotal}`);
  } catch {
    return dash("connect=meta_error&reason=api");
  }
}
