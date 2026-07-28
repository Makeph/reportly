import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEntitlement, type AgencyRow } from "@/lib/billing";
import { makeShareToken } from "@/lib/share-token";
import { signOut } from "./actions";
import PlanButtons from "./plan-buttons";
import GenerateReportButton from "./report-buttons";

type Detection = {
  id: string;
  type: string;
  severity: "red" | "amber" | "green";
  state: string;
  title: string | null;
  body: string | null;
};

type ClientAccount = {
  id: string;
  name: string;
  currency: string | null;
};

type SourceConnection = {
  id: string;
  provider: string;
  status: string | null;
  connected_at: string | null;
};

type AccountMetricRow = {
  client_account_id: string;
  spend: number | null;
  conversions: number | null;
};

type AccountSummary = {
  spend: number;
  conversions: number;
  cpa: number | null;
};

const SEV_RANK: Record<string, number> = { red: 0, amber: 1, green: 2 };
const SEV_COLOR: Record<string, string> = {
  red: "#DC2626",
  amber: "#F59E0B",
  green: "#16A34A",
};

function providerLabel(provider: string): string {
  if (provider === "meta") return "Meta Ads";
  if (provider === "csv") return "Fichiers CSV";
  return provider;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string; findings?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: agency } = await supabase
    .from("agency")
    .select("id, name, plan, trial_ends_at, subscription_status")
    .limit(1)
    .maybeSingle<AgencyRow>();
  const ent = getEntitlement(agency);

  let connections: SourceConnection[] = [];
  if (agency) {
    const { data } = await supabase
      .from("connection")
      .select("id, provider, status, connected_at")
      .eq("agency_id", agency.id)
      .order("connected_at");
    connections = (data ?? []) as SourceConnection[];
  }

  const { count: accountCount } = await supabase
    .from("client_account")
    .select("id", { count: "exact", head: true });

  const { data: accounts } = await supabase
    .from("client_account")
    .select("id, name, currency")
    .order("name");
  const clientAccounts = (accounts ?? []) as ClientAccount[];

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);
  const { data: metricRows } = await supabase
    .from("metric_daily")
    .select("client_account_id, spend, conversions")
    .gte("date", since.toISOString().slice(0, 10));
  const summaryByAccount = new Map<string, AccountSummary>();
  for (const row of (metricRows ?? []) as AccountMetricRow[]) {
    const current = summaryByAccount.get(row.client_account_id) ?? {
      conversions: 0,
      spend: 0,
    };
    current.conversions += Number(row.conversions) || 0;
    current.spend += Number(row.spend) || 0;
    summaryByAccount.set(row.client_account_id, {
      ...current,
      cpa: current.conversions > 0 ? current.spend / current.conversions : null,
    });
  }

  const { data: detRows } = await supabase
    .from("detection")
    .select("id, type, severity, state, title, body")
    .is("resolved_at", null);
  const detections = (detRows ?? []) as Detection[];
  detections.sort(
    (a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9)
  );

  return (
    <div className="wrap">
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1>Tableau de bord</h1>
        <form action={signOut}>
          <button className="btn sec">Se déconnecter</button>
        </form>
      </header>

      <p className="muted">
        Connecté : <b>{user.email}</b>
        {agency?.name ? ` · ${agency.name}` : ""}
      </p>

      {sp.connect === "meta_ok" && (
        <div className="banner ok">
          Meta Ads connecté ✓ — audit initial terminé,{" "}
          <b>{sp.findings ?? "0"}</b> alerte(s) détectée(s).
        </div>
      )}
      {sp.connect === "meta_error" && (
        <div className="banner err">
          La connexion Meta a échoué. Vérifiez l&apos;app Meta puis réessayez.
        </div>
      )}

      <div className="card" style={{ margin: "24px 0" }}>
        <h2>Abonnement</h2>
        <p>
          Statut : <b>{ent.label}</b>
        </p>
        {!ent.active && (
          <p style={{ color: "var(--amber-d)" }}>
            Votre essai est terminé — choisissez un plan pour continuer.
          </p>
        )}
        <PlanButtons />
        <p className="muted" style={{ marginTop: 12 }}>
          14 jours d&apos;essai sans carte bancaire. Résiliable à tout moment.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2>Sources</h2>
        {connections.length ? (
          <div className="row" style={{ marginBottom: 12 }}>
            {connections.map((connection) => {
              const active = connection.status === "active";
              return (
                <span
                  className={`badge ${active ? "ok" : "warn"}`}
                  key={connection.id}
                >
                  {providerLabel(connection.provider)} ·{" "}
                  {active ? "active" : "à vérifier"}
                </span>
              );
            })}
            <span className="muted">
              <b>{accountCount ?? 0}</b> compte(s) client(s)
            </span>
          </div>
        ) : (
          <p className="muted">
            Ajoutez votre première source pour lancer les détections et les
            rapports.
          </p>
        )}
        <p className="muted">
          Connectez Meta Ads ou importez les exports de Matomo, TikTok Ads et
          vos régies locales.
        </p>
        <div className="row">
          <a className="btn" href="/api/connect/meta/start">
            Connecter Meta Ads
          </a>
          <a className="btn" href="/dashboard/import">
            Importer un fichier
          </a>
        </div>
      </div>

      {clientAccounts.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h2>Rapports mensuels</h2>
          <p className="muted">
            Génère le rapport du mois dernier, puis partage le portail à vos
            couleurs avec le client.
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 8,
            }}
          >
            {clientAccounts.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  padding: "12px 16px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <b style={{ color: "var(--navy)" }}>{a.name}</b>
                  {summaryByAccount.has(a.id) && (
                    <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                      30 jours :{" "}
                      {Math.round(summaryByAccount.get(a.id)?.conversions ?? 0).toLocaleString(
                        "fr-FR"
                      )}{" "}
                      conv.
                      {summaryByAccount.get(a.id)?.cpa !== null
                        ? ` · CPA ${Math.round(summaryByAccount.get(a.id)!.cpa!)} ${
                            a.currency ?? "EUR"
                          }`
                        : ""}
                    </p>
                  )}
                </div>
                <span className="row">
                  <GenerateReportButton accountId={a.id} />
                  <a
                    className="btn sec"
                    href={`/portal/${a.id}?t=${makeShareToken(a.id)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Voir le portail ↗
                  </a>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>
          Brief — {detections.length} alerte{detections.length > 1 ? "s" : ""}
        </h2>
        {detections.length === 0 ? (
          <p className="muted">
            Aucune alerte ouverte.{" "}
            {connections.length
              ? "RAS sur vos comptes."
              : "Connectez une source pour démarrer."}
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 8,
            }}
          >
            {detections.map((d) => (
              <div
                key={d.id}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  padding: "14px 16px",
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    marginTop: 6,
                    flex: "0 0 auto",
                    background: SEV_COLOR[d.severity] ?? "#7C8FA3",
                  }}
                />
                <div>
                  <b style={{ color: "var(--navy)" }}>{d.title}</b>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {d.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
