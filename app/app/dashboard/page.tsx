import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getEntitlement,
  maxClientAccounts,
  type AgencyRow,
} from "@/lib/billing";
import { getPortalTokenVersion, makeShareToken } from "@/lib/share-token";
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

type DashboardAgency = Exclude<AgencyRow, null> & {
  branding: Record<string, unknown> | null;
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
  red: "#BC3A1D",
  amber: "#9A6E15",
  green: "#2F5D45",
};

function providerLabel(provider: string): string {
  if (provider === "meta") return "Meta Ads";
  if (provider === "csv") return "Fichiers CSV";
  return provider;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    connect?: string;
    error?: string;
    findings?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: agency } = await supabase
    .from("agency")
    .select("id, name, plan, trial_ends_at, subscription_status, branding")
    .limit(1)
    .maybeSingle<DashboardAgency>();
  const ent = getEntitlement(agency);
  const portalTokenVersion = getPortalTokenVersion(agency?.branding);

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
  const clientAccountCount = accountCount ?? 0;
  const clientAccountLimit = maxClientAccounts(agency);
  const sourcesDisabled =
    !ent.active || clientAccountCount >= clientAccountLimit;

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
    <div style={styles.container}>
      <style>{`
        :root {
          --paper: #F5EFE2;
          --paper-2: #FBF7EC;
          --ink: #23261D;
          --ink-2: #4C4A3C;
          --faint: #8B8368;
          --rule: #D9CEB2;
          --rule-soft: #E6DEC8;
          --red: #BC3A1D;
          --amber: #9A6E15;
          --green: #2F5D45;
          --disp: 'Fraunces', Georgia, serif;
          --body: 'Spectral', Georgia, serif;
          --mono: 'IBM Plex Mono', ui-monospace, Consolas, monospace;
        }
        body {
          background: var(--paper);
          color: var(--ink-2);
          font-family: var(--body);
        }
      `}</style>

      <div style={styles.masthead}>
        <h1 style={styles.h1}>Tableau de bord</h1>
        <div style={styles.headerButtons}>
          <a style={styles.btnLink} href="/dashboard/settings">
            Réglages
          </a>
          <form action={signOut} style={{ display: "inline" }}>
            <button style={styles.btnLink}>Se déconnecter</button>
          </form>
        </div>
      </div>

      <div style={styles.userInfo}>
        <span style={styles.userEmail}>{user.email}</span>
        {agency?.name && <span style={styles.divider}>·</span>}
        {agency?.name && <span style={styles.agencyName}>{agency.name}</span>}
      </div>

      {sp.connect === "meta_ok" && (
        <div style={{ ...styles.banner, ...styles.bannerOk }}>
          Meta Ads connecté ✓ — audit initial terminé,{" "}
          <b>{sp.findings ?? "0"}</b> alerte(s) détectée(s).
        </div>
      )}
      {sp.connect === "meta_error" && (
        <div style={{ ...styles.banner, ...styles.bannerErr }}>
          La connexion Meta a échoué. Vérifiez l&apos;app Meta puis réessayez.
        </div>
      )}
      {sp.error === "subscription" && (
        <div style={{ ...styles.banner, ...styles.bannerErr }}>
          Votre essai ou abonnement n&apos;est plus actif. Choisissez un plan
          pour continuer.
        </div>
      )}
      {sp.error === "quota" && (
        <div style={{ ...styles.banner, ...styles.bannerErr }}>
          La connexion ajouterait plus de comptes clients que votre plan ne
          le permet. Passez à un plan supérieur puis réessayez.
        </div>
      )}

      <div style={styles.section}>
        <h2 style={styles.h2}>Abonnement</h2>
        <p style={styles.p}>
          Statut : <b>{ent.label}</b>
        </p>
        {!ent.active && (
          <p style={{ ...styles.p, color: "var(--red)" }}>
            Votre essai est terminé — choisissez un plan pour continuer.
          </p>
        )}
        <PlanButtons />
        <p style={{ ...styles.muted, marginTop: 12 }}>
          14 jours d&apos;essai sans carte bancaire. Résiliable à tout moment.
        </p>
      </div>

      <div style={styles.section}>
        <h2 style={styles.h2}>Sources</h2>
        {connections.length ? (
          <div style={styles.badges}>
            {connections.map((connection) => {
              const active = connection.status === "active";
              return (
                <span
                  key={connection.id}
                  style={{
                    ...styles.badge,
                    ...(active ? styles.badgeOk : styles.badgeWarn),
                  }}
                >
                  {providerLabel(connection.provider)} ·{" "}
                  {active ? "actif" : "à vérifier"}
                </span>
              );
            })}
          </div>
        ) : (
          <p style={styles.muted}>
            Ajoutez votre première source pour lancer les détections et les
            rapports.
          </p>
        )}
        <p style={styles.muted}>
          <b>{clientAccountCount}</b> / {Number.isFinite(clientAccountLimit)
            ? clientAccountLimit
            : "∞"}{" "}
          comptes clients
        </p>
        <p style={styles.muted}>
          Connectez Meta Ads ou importez les exports de Matomo, TikTok Ads et
          vos régies locales.
        </p>
        <div style={styles.buttonGroup}>
          {sourcesDisabled ? (
            <>
              <span style={{ ...styles.btn, opacity: 0.4, cursor: "not-allowed" }}>
                Connecter Meta Ads
              </span>
              <span style={{ ...styles.btn, opacity: 0.4, cursor: "not-allowed" }}>
                Importer un fichier
              </span>
            </>
          ) : (
            <>
              <a style={styles.btn} href="/api/connect/meta/start">
                Connecter Meta Ads
              </a>
              <a style={styles.btn} href="/dashboard/import">
                Importer un fichier
              </a>
            </>
          )}
        </div>
      </div>

      {clientAccounts.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.h2}>Rapports mensuels</h2>
          <p style={styles.muted}>
            Génère le rapport du mois dernier, puis partage le portail à vos
            couleurs avec le client.
          </p>
          <div style={styles.list}>
            {clientAccounts.map((a) => (
              <div key={a.id} style={styles.listItem}>
                <div>
                  <b style={styles.itemName}>{a.name}</b>
                  {summaryByAccount.has(a.id) && (
                    <p style={styles.itemMeta}>
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
                <div style={styles.buttonGroup}>
                  <GenerateReportButton accountId={a.id} />
                  <a
                    style={styles.btnSec}
                    href={`/portal/${a.id}?t=${makeShareToken(a.id, portalTokenVersion)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Voir le portail ↗
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={styles.section}>
        <h2 style={styles.h2}>
          Brief — {detections.length} alerte{detections.length > 1 ? "s" : ""}
        </h2>
        {detections.length === 0 ? (
          <p style={styles.muted}>
            Aucune alerte ouverte.{" "}
            {connections.length
              ? "RAS sur vos comptes."
              : "Connectez une source pour démarrer."}
          </p>
        ) : (
          <div style={styles.list}>
            {detections.map((d) => (
              <div key={d.id} style={styles.detection}>
                <span
                  style={{
                    ...styles.detectionDot,
                    background: SEV_COLOR[d.severity] ?? "var(--faint)",
                  }}
                />
                <div>
                  <b style={styles.itemName}>{d.title}</b>
                  <p style={styles.itemMeta}>{d.body}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    background: "var(--paper)",
    color: "var(--ink-2)",
    fontFamily: "var(--body)",
    padding: "40px 28px",
  } as React.CSSProperties,
  masthead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    borderBottom: "1px solid var(--rule)",
    paddingBottom: 18,
    marginBottom: 24,
    flexWrap: "wrap",
  } as React.CSSProperties,
  h1: {
    fontFamily: "var(--disp)",
    fontSize: "32px",
    fontWeight: 600,
    margin: 0,
    color: "var(--ink)",
  } as React.CSSProperties,
  headerButtons: {
    display: "flex",
    gap: 8,
    fontFamily: "var(--mono)",
    fontSize: "12px",
  } as React.CSSProperties,
  btnLink: {
    fontFamily: "var(--mono)",
    fontSize: "12px",
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "var(--ink-2)",
    padding: "9px 12px",
    borderBottom: "2px solid transparent",
    background: "none",
    border: "none",
    cursor: "pointer",
    transition: "0.15s",
  } as React.CSSProperties,
  userInfo: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    fontSize: "13px",
    color: "var(--faint)",
    marginBottom: 32,
  } as React.CSSProperties,
  userEmail: {
    fontFamily: "var(--mono)",
    fontWeight: 500,
  } as React.CSSProperties,
  divider: {
    color: "var(--rule)",
  } as React.CSSProperties,
  agencyName: {
    color: "var(--ink-2)",
    fontWeight: 500,
  } as React.CSSProperties,
  banner: {
    padding: "14px 16px",
    borderRadius: "3px",
    fontSize: "13px",
    marginBottom: 20,
    fontFamily: "var(--mono)",
    letterSpacing: "0.05em",
  } as React.CSSProperties,
  bannerOk: {
    background: "#DFE7DB",
    color: "#2F5D45",
    border: "1px solid #BBE5C8",
  } as React.CSSProperties,
  bannerErr: {
    background: "#F1DDD1",
    color: "#BC3A1D",
    border: "1px solid #DCA489",
  } as React.CSSProperties,
  section: {
    background: "var(--paper-2)",
    border: "1.5px solid var(--rule)",
    borderRadius: "3px",
    padding: "28px",
    marginBottom: 24,
    boxShadow: "0 4px 12px -6px rgba(35, 38, 29, 0.12)",
  } as React.CSSProperties,
  h2: {
    fontFamily: "var(--disp)",
    fontSize: "21px",
    fontWeight: 600,
    margin: "0 0 14px",
    color: "var(--ink)",
  } as React.CSSProperties,
  p: {
    margin: "0 0 12px",
    fontSize: "15px",
    color: "var(--ink-2)",
  } as React.CSSProperties,
  muted: {
    margin: "0 0 12px",
    fontSize: "13px",
    color: "var(--faint)",
  } as React.CSSProperties,
  badges: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap",
  } as React.CSSProperties,
  badge: {
    fontFamily: "var(--mono)",
    fontSize: "11px",
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    padding: "6px 12px",
    borderRadius: "3px",
    border: "1px solid",
  } as React.CSSProperties,
  badgeOk: {
    background: "#DFE7DB",
    color: "#2F5D45",
    borderColor: "#BBE5C8",
  } as React.CSSProperties,
  badgeWarn: {
    background: "#EFE3C2",
    color: "#9A6E15",
    borderColor: "#DFCC8B",
  } as React.CSSProperties,
  buttonGroup: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  } as React.CSSProperties,
  btn: {
    fontFamily: "var(--mono)",
    fontSize: "12px",
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    padding: "12px 18px",
    background: "var(--ink)",
    color: "var(--paper)",
    border: "1.5px solid var(--ink)",
    borderRadius: "3px",
    cursor: "pointer",
    transition: "all 0.15s",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    boxShadow: "2px 2px 0 rgba(35, 38, 29, 0.15)",
  } as React.CSSProperties,
  btnSec: {
    fontFamily: "var(--mono)",
    fontSize: "12px",
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    padding: "12px 18px",
    background: "var(--paper)",
    color: "var(--ink)",
    border: "1.5px solid var(--rule)",
    borderRadius: "3px",
    cursor: "pointer",
    transition: "all 0.15s",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  } as React.CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
    marginTop: 8,
  } as React.CSSProperties,
  listItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    border: "1.5px solid var(--rule)",
    borderRadius: "3px",
    padding: "14px 16px",
    flexWrap: "wrap" as const,
  } as React.CSSProperties,
  itemName: {
    color: "var(--ink)",
    fontSize: "14px",
    fontWeight: 600,
  } as React.CSSProperties,
  itemMeta: {
    margin: "6px 0 0",
    fontSize: "12px",
    color: "var(--faint)",
    fontFamily: "var(--mono)",
  } as React.CSSProperties,
  detection: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    border: "1.5px solid var(--rule)",
    borderRadius: "3px",
    padding: "14px 16px",
  } as React.CSSProperties,
  detectionDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    marginTop: 6,
    flex: "0 0 auto",
  } as React.CSSProperties,
};
