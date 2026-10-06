import { NextResponse } from "next/server";
import { requireActiveAgency } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import {
  generateReport,
  isFuturePeriod,
  isValidPeriod,
  prevMonthPeriod,
} from "@/lib/report";

// Génération manuelle d'un rapport (depuis le dashboard). Authentifié + vérif RLS.
export async function POST(request: Request) {
  const supabase = await createClient();
  const access = await requireActiveAgency(supabase);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error, code: access.code },
      { status: access.status }
    );
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

  // `period` vient du navigateur et descend jusqu'à une fonction service_role.
  // Mal formée, elle faisait lever une date invalide ; à venir, elle engageait
  // un appel au fournisseur d'IA pour un mois sans donnée.
  const periode = period || prevMonthPeriod();
  if (!isValidPeriod(periode)) {
    return NextResponse.json(
      { error: "période attendue au format AAAA-MM" },
      { status: 400 }
    );
  }
  if (isFuturePeriod(periode)) {
    return NextResponse.json(
      { error: "cette période n'est pas encore terminée" },
      { status: 400 }
    );
  }

  const result = await generateReport(accountId, periode);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
