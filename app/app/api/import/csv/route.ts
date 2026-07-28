import { NextResponse } from "next/server";
import { parseCsvImport } from "@/lib/csv-import";
import { scanAgency } from "@/lib/scan";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 2 * 1024 * 1024;

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "compte"
  );
}

function parseBudget(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value
    .replace(/[€\s\u00a0\u202f]/g, "")
    .replace(",", ".");
  const budget = Number(normalized);
  return Number.isFinite(budget) && budget > 0 ? budget : Number.NaN;
}

// Importe une source CSV complète : compte, métriques, puis audit immédiat.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("agency_member")
    .select("agency_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle<{ agency_id: string }>();
  if (!membership?.agency_id) {
    return NextResponse.json(
      { error: "Aucune agence associée à cet utilisateur." },
      { status: 403 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Le formulaire d’import est invalide." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  const accountNameValue = formData.get("accountName");
  const accountName =
    typeof accountNameValue === "string" ? accountNameValue.trim() : "";
  const monthlyBudget = parseBudget(formData.get("monthlyBudget"));

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Un fichier CSV est requis." },
      { status: 400 }
    );
  }
  if (!accountName) {
    return NextResponse.json(
      { error: "Le nom du compte client est requis." },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "Le fichier CSV ne doit pas dépasser 2 Mo." },
      { status: 413 }
    );
  }
  if (Number.isNaN(monthlyBudget)) {
    return NextResponse.json(
      { error: "Le budget mensuel doit être un nombre positif." },
      { status: 400 }
    );
  }

  const parsed = parseCsvImport(await file.text());
  if (!parsed.rows.length) {
    return NextResponse.json(
      {
        error: "Aucune ligne valide à importer.",
        errors: parsed.errors,
      },
      { status: 400 }
    );
  }

  const agencyId = membership.agency_id;
  const admin = createAdminClient();

  try {
    const { data: existingConnection, error: connectionReadError } = await admin
      .from("connection")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("provider", "csv")
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (connectionReadError) throw connectionReadError;

    let connectionId = existingConnection?.id;
    if (!connectionId) {
      const { data: connection, error: connectionError } = await admin
        .from("connection")
        .insert({
          agency_id: agencyId,
          provider: "csv",
          status: "active",
        })
        .select("id")
        .single<{ id: string }>();
      if (connectionError || !connection) {
        throw connectionError ?? new Error("Connexion CSV introuvable");
      }
      connectionId = connection.id;
    }

    const externalId = `csv-${slugify(accountName)}`;
    const { data: account, error: accountError } = await admin
      .from("client_account")
      .upsert(
        {
          agency_id: agencyId,
          connection_id: connectionId,
          name: accountName,
          external_id: externalId,
          currency: "EUR",
          monthly_budget: monthlyBudget,
        },
        { onConflict: "agency_id,external_id" }
      )
      .select("id")
      .single<{ id: string }>();
    if (accountError || !account) {
      throw accountError ?? new Error("Compte client introuvable");
    }

    const importedAt = new Date().toISOString();
    const { error: metricError } = await admin.from("metric_daily").upsert(
      parsed.rows.map((row) => ({
        client_account_id: account.id,
        date: row.date,
        spend: row.spend,
        conversions: row.conversions,
        cpa: row.cpa ?? null,
        roas: row.roas ?? null,
        raw: {
          source: "csv",
          fichier: file.name,
          importe_le: importedAt,
          ...(row.revenue !== undefined ? { revenu: row.revenue } : {}),
        },
      })),
      { onConflict: "client_account_id,date" }
    );
    if (metricError) throw metricError;

    const scan = await scanAgency(agencyId);
    return NextResponse.json({
      ok: true,
      accountId: account.id,
      rows: parsed.rows.length,
      findings: scan.openTotal,
      errors: parsed.errors,
    });
  } catch {
    return NextResponse.json(
      { error: "L’import CSV n’a pas pu être enregistré." },
      { status: 500 }
    );
  }
}
