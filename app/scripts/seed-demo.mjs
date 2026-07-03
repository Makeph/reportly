import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const ENV_PATH = resolve(ROOT, ".env.local");
const DEMO_CONNECTION_EXTERNAL_ID = "demo-meta-reportly";

function parseEnvFile(content) {
  const env = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue.trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }

    env[key] = value;
  }

  return env;
}

async function loadEnv() {
  if (!existsSync(ENV_PATH)) {
    throw new Error("Fichier .env.local introuvable à la racine de l'app.");
  }

  const env = parseEnvFile(await readFile(ENV_PATH, "utf8"));
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Variables manquantes dans .env.local : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont obligatoires."
    );
  }

  return { supabaseUrl, serviceRoleKey };
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfUtcMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function previousMonthPeriod(ref = new Date()) {
  const d = startOfUtcMonth(ref);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(period) {
  const [year, month] = period.split("-").map(Number);
  const start = `${period}-01`;
  const end = isoDate(new Date(Date.UTC(year, month, 0)));
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousPeriod = `${previousYear}-${String(previousMonth).padStart(2, "0")}`;
  const previousStart = `${previousPeriod}-01`;
  const previousEnd = isoDate(new Date(Date.UTC(previousYear, previousMonth, 0)));

  return { start, end, previousStart, previousEnd };
}

function formatPeriodFr(period) {
  const months = [
    "janvier",
    "fevrier",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "aout",
    "septembre",
    "octobre",
    "novembre",
    "decembre",
  ];
  const [year, month] = period.split("-").map(Number);
  const name = months[month - 1] ?? period;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function makeMetricRows(accountsByExternalId) {
  const today = new Date();
  const end = addDays(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())), -1);
  const start = addDays(end, -44);

  const profiles = [
    {
      externalId: "demo-acme-cosmetics",
      baseSpend: 185,
      trend: 1.12,
      conversionRate: 0.052,
      cpaBase: 34,
      roasBase: 3.4,
    },
    {
      externalId: "demo-studio-verde",
      baseSpend: 96,
      trend: 0.94,
      conversionRate: 0.041,
      cpaBase: 29,
      roasBase: 4.1,
    },
    {
      externalId: "demo-maison-lutea",
      baseSpend: 138,
      trend: 1.04,
      conversionRate: 0.034,
      cpaBase: 46,
      roasBase: 2.8,
    },
  ];

  const rows = [];
  for (let i = 0; i < 45; i += 1) {
    const date = addDays(start, i);
    const dayFactor = 1 + Math.sin(i / 4) * 0.11 + (date.getUTCDay() === 0 ? -0.12 : 0);

    for (const profile of profiles) {
      const account = accountsByExternalId.get(profile.externalId);
      if (!account) continue;

      const progress = i / 44;
      const trendFactor = 1 + (profile.trend - 1) * progress;
      const spend = round(profile.baseSpend * trendFactor * dayFactor * (0.94 + ((i % 5) * 0.025)));
      const clicks = Math.max(1, Math.round(spend * (3.1 + (i % 4) * 0.22)));
      const conversions = round(Math.max(0.5, clicks * profile.conversionRate * (0.9 + (i % 6) * 0.035)), 1);
      const cpa = round(spend / conversions);
      const roas = round(profile.roasBase * (0.92 + (i % 7) * 0.035));
      const sessions = Math.round(clicks * (1.18 + (i % 3) * 0.05));
      const leads = round(conversions * (0.55 + (i % 4) * 0.04), 1);

      rows.push({
        client_account_id: account.id,
        date: isoDate(date),
        spend,
        conversions,
        cpa,
        roas,
        sessions,
        leads,
        raw: {
          demo: true,
          source: "seed-demo",
          clicks,
          ctr: round(1.1 + (i % 5) * 0.08),
        },
      });
    }
  }

  return rows;
}

function sumMetric(rows, accountId, start, end, field) {
  return rows
    .filter((row) => row.client_account_id === accountId && row.date >= start && row.date <= end)
    .reduce((total, row) => total + Number(row[field] ?? 0), 0);
}

async function requireOk(result, message) {
  if (result.error) throw new Error(`${message} : ${result.error.message}`);
  return result.data;
}

async function getFirstAgency(supabase) {
  const { data, error } = await supabase
    .from("agency")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Lecture de l'agence impossible : ${error.message}`);
  return data;
}

async function upsertConnection(supabase, agencyId) {
  const existing = await requireOk(
    await supabase
      .from("connection")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("provider", "meta")
      .eq("external_account_id", DEMO_CONNECTION_EXTERNAL_ID)
      .maybeSingle(),
    "Recherche de la connexion demo impossible"
  );

  const payload = {
    agency_id: agencyId,
    provider: "meta",
    external_account_id: DEMO_CONNECTION_EXTERNAL_ID,
    access_token: "demo-encrypted-token-placeholder",
    refresh_token: "demo-refresh-token-placeholder",
    scopes: "ads_read,read_insights",
    status: "active",
    connected_at: new Date().toISOString(),
    token_expires_at: addDays(new Date(), 60).toISOString(),
  };

  if (existing?.id) {
    const updated = await requireOk(
      await supabase.from("connection").update(payload).eq("id", existing.id).select("id").single(),
      "Mise a jour de la connexion demo impossible"
    );
    return updated;
  }

  return requireOk(
    await supabase.from("connection").insert(payload).select("id").single(),
    "Insertion de la connexion demo impossible"
  );
}

async function seedClientAccounts(supabase, agencyId, connectionId) {
  const accounts = [
    {
      agency_id: agencyId,
      connection_id: connectionId,
      name: "Acme Cosmetics",
      external_id: "demo-acme-cosmetics",
      currency: "EUR",
      monthly_budget: 6200,
    },
    {
      agency_id: agencyId,
      connection_id: connectionId,
      name: "Studio Verde",
      external_id: "demo-studio-verde",
      currency: "EUR",
      monthly_budget: 3200,
    },
    {
      agency_id: agencyId,
      connection_id: connectionId,
      name: "Maison Lutea",
      external_id: "demo-maison-lutea",
      currency: "EUR",
      monthly_budget: 4800,
    },
  ];

  const rows = await requireOk(
    await supabase
      .from("client_account")
      .upsert(accounts, { onConflict: "agency_id,external_id" })
      .select("id, name, external_id, currency"),
    "Upsert des comptes clients demo impossible"
  );

  return new Map(rows.map((row) => [row.external_id, row]));
}

async function seedDetections(supabase, accountsByExternalId) {
  const now = new Date();
  const yesterday = addDays(now, -1);
  const threeDaysAgo = addDays(now, -3);
  const eightDaysAgo = addDays(now, -8);
  const sixDaysAgo = addDays(now, -6);

  const drafts = [
    {
      account: "demo-acme-cosmetics",
      type: "budget_pacing",
      severity: "red",
      state: "new",
      title: "Acme Cosmetics - alerte budget",
      body: "Le rythme de depense projette un epuisement du budget environ 5 jours avant la fin du mois. Revoir les plafonds et les campagnes d'acquisition.",
      opened_at: yesterday.toISOString(),
      last_seen: now.toISOString(),
      resolved_at: null,
    },
    {
      account: "demo-studio-verde",
      type: "drift",
      severity: "amber",
      state: "persistent",
      title: "Studio Verde - derive CPA persistante J3",
      body: "Le CPA reste au-dessus de la moyenne cible depuis 3 jours. Les ensembles d'annonces broad et retargeting meritent une verification.",
      opened_at: threeDaysAgo.toISOString(),
      last_seen: now.toISOString(),
      resolved_at: null,
    },
    {
      account: "demo-maison-lutea",
      type: "tracking_zero",
      severity: "green",
      state: "resolved",
      title: "Maison Lutea - incident tracking resolu",
      body: "Aucune conversion n'etait remontee pendant une journee. Le pixel et les evenements serveur sont de nouveau actifs.",
      opened_at: eightDaysAgo.toISOString(),
      last_seen: sixDaysAgo.toISOString(),
      resolved_at: sixDaysAgo.toISOString(),
    },
  ];

  let written = 0;
  for (const draft of drafts) {
    const account = accountsByExternalId.get(draft.account);
    if (!account) continue;

    const existing = await requireOk(
      await supabase
        .from("detection")
        .select("id")
        .eq("client_account_id", account.id)
        .eq("title", draft.title)
        .maybeSingle(),
      `Recherche de la detection "${draft.title}" impossible`
    );

    const { account: _account, ...payload } = draft;
    const row = { ...payload, client_account_id: account.id };

    if (existing?.id) {
      await requireOk(
        await supabase.from("detection").update(row).eq("id", existing.id).select("id").single(),
        `Mise a jour de la detection "${draft.title}" impossible`
      );
    } else {
      await requireOk(
        await supabase.from("detection").insert(row).select("id").single(),
        `Insertion de la detection "${draft.title}" impossible`
      );
    }

    written += 1;
  }

  return written;
}

async function seedRegistryEntries(supabase, accountsByExternalId, lastMonthPeriod) {
  const now = new Date();
  const entries = [
    {
      account: "demo-acme-cosmetics",
      kind: "priority",
      title: "Priorite - budget Acme Cosmetics",
      body: "Reallouer 15 % du budget prospecting vers les audiences qui gardent un CPA inferieur a 38 EUR.",
      status: "open",
      result: null,
      dated_at: addDays(now, -1).toISOString(),
      resolved_at: null,
    },
    {
      account: "demo-studio-verde",
      kind: "decision",
      title: "Decision - controle CPA Studio Verde",
      body: "Limiter les hausses d'encheres automatiques tant que le CPA reste au-dessus de la cible hebdomadaire.",
      status: "open",
      result: null,
      dated_at: addDays(now, -3).toISOString(),
      resolved_at: null,
    },
    {
      account: "demo-maison-lutea",
      kind: "incident",
      title: "Incident - tracking Maison Lutea",
      body: "Perte temporaire des evenements conversion apres modification du tag.",
      status: "resolved",
      result: "Evenements pixel et server-side verifies, donnees revenues au niveau attendu.",
      dated_at: addDays(now, -8).toISOString(),
      resolved_at: addDays(now, -6).toISOString(),
    },
    {
      account: "demo-acme-cosmetics",
      kind: "priority",
      title: `Priorite - ${lastMonthPeriod}`,
      body: "Stabiliser le pacing mensuel avant d'augmenter les budgets sur les creatives gagnantes.",
      status: "open",
      result: null,
      dated_at: addDays(now, -2).toISOString(),
      resolved_at: null,
    },
  ];

  let written = 0;
  for (const entry of entries) {
    const account = accountsByExternalId.get(entry.account);
    if (!account) continue;

    const existing = await requireOk(
      await supabase
        .from("registry_entry")
        .select("id")
        .eq("client_account_id", account.id)
        .eq("kind", entry.kind)
        .eq("title", entry.title)
        .maybeSingle(),
      `Recherche du registre "${entry.title}" impossible`
    );

    const { account: _account, ...payload } = entry;
    const row = { ...payload, client_account_id: account.id };

    if (existing?.id) {
      await requireOk(
        await supabase.from("registry_entry").update(row).eq("id", existing.id).select("id").single(),
        `Mise a jour du registre "${entry.title}" impossible`
      );
    } else {
      await requireOk(
        await supabase.from("registry_entry").insert(row).select("id").single(),
        `Insertion du registre "${entry.title}" impossible`
      );
    }

    written += 1;
  }

  return written;
}

async function seedBrief(supabase, agencyId) {
  const briefDate = isoDate(addDays(new Date(), -1));
  const payload = {
    agency_id: agencyId,
    brief_date: briefDate,
    counts: {
      demo: true,
      total: 3,
      new: 1,
      persistent: 1,
      resolved: 1,
      red: 1,
      amber: 1,
      green: 1,
    },
    sent_at: null,
  };

  await requireOk(
    await supabase.from("brief").upsert(payload, { onConflict: "agency_id,brief_date" }).select("id").single(),
    "Upsert du brief demo impossible"
  );

  return briefDate;
}

async function seedReport(supabase, accountsByExternalId, metricRows, period) {
  const account = accountsByExternalId.get("demo-acme-cosmetics");
  if (!account) throw new Error("Compte Acme Cosmetics introuvable pour le rapport demo.");

  const bounds = monthBounds(period);
  const spend = Math.round(sumMetric(metricRows, account.id, bounds.start, bounds.end, "spend"));
  const spendPrev = Math.round(
    sumMetric(metricRows, account.id, bounds.previousStart, bounds.previousEnd, "spend")
  );
  const deltaPct = spendPrev > 0 ? Math.round(((spend - spendPrev) / spendPrev) * 100) : null;
  const incidentsDetected = 2;
  const incidentsResolved = 1;
  const periodLabel = formatPeriodFr(period);

  const synthesis = [
    `Sur ${periodLabel}, les campagnes ont depense ${spend.toLocaleString("fr-FR")} EUR${
      deltaPct !== null ? ` (${deltaPct >= 0 ? "+" : ""}${deltaPct} % vs mois precedent)` : ""
    }. Le volume est suffisant pour lire les tendances sans connexion Meta active.`,
    "La dynamique commerciale reste positive, mais le pacing budget demande une surveillance plus stricte sur les campagnes d'acquisition.",
    "Un incident de tracking a ete corrige pendant la periode ; les prochains arbitrages doivent se concentrer sur le CPA et la repartition budgetaire.",
  ];
  const highlights = [
    "Hausse progressive de la depense sur les 45 derniers jours.",
    "CPA global sous controle hors derive ponctuelle detectee.",
    "Suivi des incidents et priorites alimente dans le registre demo.",
  ];
  const priority =
    "Revoir le pacing deux fois par semaine et deplacer 10 a 15 % du budget vers les ensembles avec CPA stable avant toute hausse globale.";

  const kpis = {
    spend,
    spendPrev,
    deltaPct,
    incidentsDetected,
    incidentsResolved,
    currency: "EUR",
    synthesis,
    highlights,
  };

  await requireOk(
    await supabase
      .from("report")
      .upsert(
        {
          client_account_id: account.id,
          period,
          synthesis_md: [...synthesis, "", ...highlights.map((item) => `- ${item}`)].join("\n").trim(),
          priority,
          pdf_url: null,
          published_at: new Date().toISOString(),
          sent_at: null,
          kpis,
        },
        { onConflict: "client_account_id,period" }
      )
      .select("id")
      .single(),
    "Upsert du rapport demo impossible"
  );

  return { accountName: account.name, period };
}

async function main() {
  console.log("Lecture de .env.local...");
  const { supabaseUrl, serviceRoleKey } = await loadEnv();

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("Recherche de la premiere agence...");
  const agency = await getFirstAgency(supabase);
  if (!agency) {
    console.log("Connecte-toi une fois dans l'app d'abord");
    return;
  }
  console.log(`Agence cible : ${agency.name ?? agency.id}`);

  console.log("Creation ou mise a jour de la connexion Meta demo...");
  const connection = await upsertConnection(supabase, agency.id);
  console.log("Connexion demo prete.");

  console.log("Creation ou mise a jour des 3 comptes clients demo...");
  const accountsByExternalId = await seedClientAccounts(supabase, agency.id, connection.id);
  console.log(`${accountsByExternalId.size} compte(s) client(s) demo pret(s).`);

  console.log("Generation des 45 jours de metriques quotidiennes par compte...");
  const metricRows = makeMetricRows(accountsByExternalId);
  await requireOk(
    await supabase.from("metric_daily").upsert(metricRows, { onConflict: "client_account_id,date" }),
    "Upsert des metriques quotidiennes impossible"
  );
  console.log(`${metricRows.length} lignes metric_daily inserees ou mises a jour.`);

  console.log("Creation ou mise a jour des detections demo...");
  const detections = await seedDetections(supabase, accountsByExternalId);
  console.log(`${detections} detection(s) demo prete(s).`);

  const lastMonthPeriod = previousMonthPeriod();
  console.log("Creation ou mise a jour du registre demo...");
  const registryEntries = await seedRegistryEntries(supabase, accountsByExternalId, lastMonthPeriod);
  console.log(`${registryEntries} entree(s) de registre prete(s).`);

  console.log("Creation ou mise a jour du brief d'hier...");
  const briefDate = await seedBrief(supabase, agency.id);
  console.log(`Brief demo pret pour le ${briefDate}.`);

  console.log("Creation ou mise a jour du rapport du mois dernier...");
  const report = await seedReport(supabase, accountsByExternalId, metricRows, lastMonthPeriod);
  console.log(`Rapport demo pret : ${report.accountName} / ${report.period}.`);

  console.log("Seed demo termine.");
}

main().catch((error) => {
  console.error(`Erreur seed demo : ${error.message}`);
  process.exitCode = 1;
});
