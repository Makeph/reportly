import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const { data: agency } = await supabase
    .from("agency")
    .select("id")
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (!agency) return dash("connect=meta_error&reason=agency");

  try {
    const redirectUri = `${origin}/api/connect/meta/callback`;
    const short = await exchangeCodeForToken(code, redirectUri);
    const long = await getLongLivedToken(short.access_token);
    const token = long.access_token;
    const expiresAt = long.expires_in
      ? new Date(Date.now() + long.expires_in * 1000).toISOString()
      : null;

    const admin = createAdminClient();

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

    const accounts = await listAdAccounts(token);
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
