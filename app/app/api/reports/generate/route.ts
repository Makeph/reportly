import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateReport, prevMonthPeriod } from "@/lib/report";

// Génération manuelle d'un rapport (depuis le dashboard). Authentifié + vérif RLS.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { accountId, period } = (await request.json()) as {
    accountId?: string;
    period?: string;
  };
  if (!accountId) {
    return NextResponse.json({ error: "accountId requis" }, { status: 400 });
  }

  // La RLS garantit que l'utilisateur ne voit que les comptes de son agence.
  const { data: acc } = await supabase
    .from("client_account")
    .select("id")
    .eq("id", accountId)
    .maybeSingle();
  if (!acc) {
    return NextResponse.json({ error: "compte introuvable" }, { status: 404 });
  }

  const result = await generateReport(accountId, period || prevMonthPeriod());
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
