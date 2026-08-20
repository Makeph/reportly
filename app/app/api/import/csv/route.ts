import { NextResponse } from "next/server";
import { maxClientAccounts, requireActiveAgency } from "@/lib/billing";
import {
  parseCsvImport,
  slugifyAccountName,
  validateImportForm,
} from "@/lib/csv-import";
import { scanAgency } from "@/lib/scan";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Importe une source CSV complète : compte, métriques, puis audit immédiat.
export async function POST(request: Request) {
  const supabase = await createClient();
  const access = await requireActiveAgency(supabase);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error, code: access.code },
      { status: access.status }
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

  const validation = validateImportForm(formData);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error },
      { status: validation.status }
    );
  }
  const { file, accountName, monthlyBudget } = validation.fields;

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

  const agencyId = access.agency.id;
  const admin = createAdminClient();

  try {
    const externalId = `csv-${slugifyAccountName(accountName)}`;
    const { data: existingAccount, error: accountReadError } = await admin
      .from("client_account")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("external_id", externalId)
      .maybeSingle<{ id: string }>();
    if (accountReadError) throw accountReadError;

    if (!existingAccount) {
      const { count, error: countError } = await admin
        .from("client_account")
        .select("id", { count: "exact", head: true })
        .eq("agency_id", agencyId);
      if (countError) throw countError;

      const current = count ?? 0;
      const max = maxClientAccounts(access.agency);
      if (current >= max) {
        return NextResponse.json(
          {
            error: `Le quota de ${max} comptes clients de votre plan est atteint. Passez à un plan supérieur pour en ajouter un.`,
            code: "client_account_quota_reached",
            current,
            max,
          },
          { status: 409 }
        );
      }
    }

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
