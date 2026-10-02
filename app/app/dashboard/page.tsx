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
  client_account_id: string | null;
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
  date: string;
  spend: number | null;
  conversions: number | null;
};

type AccountSummary = {
  spend: number;
  conversions: number;
  cpa: number | null;
  /** CPA jour par jour, dans l'ordre chronologique — sert la sparkline. */
  series: number[];
  /** Écart du CPA des sept derniers jours face à la période précédente. */
  trend: number | null;
  lastDate: string | null;
};

const SEV_RANK: Record<string, number> = { red: 0, amber: 1, green: 2 };

const nf = new Intl.NumberFormat("fr-FR");
const nf1 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function providerLabel(provider: string): string {
  if (provider === "meta") return "Meta Ads";
  if (provider === "csv") return "Fichiers CSV";
  return provider;
}

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Sparkline du CPA : aire teintée, tracé, point final marqué. */
function Sparkline({
  values,
  tone,
  label,
}: {
  values: number[];
  tone: "red" | "amber" | "green";
  label: string;
}) {
  if (values.length < 3) return null;
  const color =
    tone === "red" ? "#BC3A1D" : tone === "amber" ? "#9A6E15" : "#2F5D45";
  const w = 104;
  const h = 26;
  const pad = 3;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / (values.length - 1);
    const y = h - pad - ((v - lo) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={label}
      style={{ display: "block", flex: "0 0 auto" }}
    >
      <polygon
        points={`${line} ${w},${h} 0,${h}`}
        fill={color}
        opacity="0.08"
      />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle cx={lx.toFixed(1)} cy={ly.toFixed(1)} r="2.2" fill={color} />
    </svg>
  );
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
  const hasMeta = connections.some((c) => c.provider === "meta");

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
  const accountName = new Map(clientAccounts.map((a) => [a.id, a.name]));

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);
  const { data: metricRows } = await supabase
    .from("metric_daily")
    .select("client_account_id, date, spend, conversions")
    .gte("date", since.toISOString().slice(0, 10))
    .order("date");

  const dailyByAccount = new Map<string, AccountMetricRow[]>();
  for (const row of (metricRows ?? []) as AccountMetricRow[]) {
    const list = dailyByAccount.get(row.client_account_id) ?? [];
    list.push(row);
    dailyByAccount.set(row.client_account_id, list);
  }

  const summaryByAccount = new Map<string, AccountSummary>();
  for (const [accountId, rows] of dailyByAccount) {
    let spend = 0;
    let conversions = 0;
    const series: number[] = [];
    for (const row of rows) {
      const s = Number(row.spend) || 0;
      const c = Number(row.conversions) || 0;
      spend += s;
      conversions += c;
      if (c > 0) series.push(s / c);
    }

    // Sept derniers jours contre la période qui précède : la dérive se lit là.
    let trend: number | null = null;
    if (series.length >= 10) {
      const recent = series.slice(-7);
      const before = series.slice(0, -7);
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      const baseline = avg(before);
      if (baseline > 0) trend = (avg(recent) - baseline) / baseline;
    }

    summaryByAccount.set(accountId, {
      spend,
      conversions,
      cpa: conversions > 0 ? spend / conversions : null,
      series,
      trend,
      lastDate: rows.length ? rows[rows.length - 1].date : null,
    });
  }

  const { data: detRows } = await supabase
    .from("detection")
    .select("id, client_account_id, type, severity, state, title, body")
    .is("resolved_at", null);
  const detections = (detRows ?? []) as Detection[];
  detections.sort(
    (a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9)
  );
  const urgentCount = detections.filter((d) => d.severity === "red").length;
  const watchCount = detections.filter((d) => d.severity === "amber").length;

  const lastImport = [...summaryByAccount.values()]
    .map((s) => s.lastDate)
    .filter((d): d is string => !!d)
    .sort()
    .pop();

  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Le tampon de l'en-tête dit l'état du matin en un coup d'œil.
  const briefStamp = urgentCount
    ? { cls: "stamp", text: `${urgentCount} urgence${urgentCount > 1 ? "s" : ""}` }
    : watchCount
      ? {
          cls: "stamp amber",
          text: `${watchCount} à surveiller`,
        }
      : { cls: "stamp green", text: "Rien à signaler" };

  const planStamp = ent.subActive
    ? { cls: "stamp green", text: "Abonné" }
    : ent.trialActive
      ? { cls: "stamp amber", text: ent.label.replace("Essai — ", "Essai · ") }
      : { cls: "stamp", text: "Inactif" };

  return (
    <div className="wrap">
      <style>{`
        .db-top{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;
          flex-wrap:wrap;padding:38px 0 20px;border-bottom:2px solid var(--ink)}
        .db-kick{display:flex;align-items:center;gap:12px;font-family:var(--mono);font-size:11px;
          font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:var(--red)}
        .db-kick::before{content:"";width:30px;height:1.5px;background:var(--red);flex:0 0 auto}
        .db-top h1{font-size:clamp(30px,4.4vw,46px);margin:12px 0 0;font-style:normal}
        .db-top h1 em{font-style:italic;color:var(--red)}
        .db-who{font-family:var(--mono);font-size:11px;letter-spacing:.08em;color:var(--faint);margin-top:10px}
        .db-subline{display:flex;align-items:center;justify-content:space-between;gap:16px;
          flex-wrap:wrap;padding:11px 0;border-bottom:1px solid var(--rule);
          font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}

        .db-brief{position:relative;margin-top:44px;background:var(--paper-2);
          border:1px solid var(--rule);border-radius:2px;padding:26px 28px 22px;
          box-shadow:0 26px 54px -34px rgba(35,38,29,.45),0 2px 0 rgba(255,255,255,.6) inset}
        .db-brief::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:12px;
          background-image:radial-gradient(circle at 8px 0,var(--paper) 5px,transparent 5.5px);
          background-size:16px 12px;background-position:0 2px}
        .db-brief > .stamp{position:absolute;right:26px;top:-14px;background:var(--paper-2)}
        @media(max-width:560px){.db-brief > .stamp{right:auto;left:22px}}
        .db-bhead{display:flex;align-items:baseline;justify-content:space-between;gap:12px;
          border-bottom:2px solid var(--ink);padding-bottom:12px}
        .db-bhead h2{font-size:20px;font-weight:700;margin:0}
        .db-bhead span{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;color:var(--faint)}

        .db-entry{display:grid;grid-template-columns:9px 1fr;gap:14px;align-items:start;
          padding:16px 0;border-bottom:1px solid var(--rule-soft)}
        .db-entry:last-of-type{border-bottom:none;padding-bottom:4px}
        .db-dot{width:9px;height:9px;border-radius:50%;margin-top:7px}
        .db-entry.red .db-dot{background:var(--red)}
        .db-entry.amber .db-dot{background:var(--amber)}
        .db-entry.green .db-dot{background:var(--green)}
        .db-eline{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
        .db-eline b{font-family:var(--mono);font-size:12.5px;color:var(--ink);font-weight:600;letter-spacing:.02em}
        .db-entry p{margin:5px 0 0;font-size:14.5px;line-height:1.5}

        .db-sechead{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;
          flex-wrap:wrap;margin:60px 0 18px}
        .db-sechead h2{font-size:27px;margin:10px 0 0}
        .db-sechead .db-note{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;
          text-transform:uppercase;color:var(--faint)}

        .db-ledger{position:relative;background:var(--paper-2);border:1px solid var(--rule);
          border-radius:2px;overflow:hidden;box-shadow:0 22px 48px -34px rgba(35,38,29,.42)}
        .db-ledger::before{content:"";position:absolute;top:0;bottom:0;left:146px;width:1px;
          background:rgba(188,58,29,.38);z-index:1}
        @media(max-width:860px){.db-ledger::before{display:none}}
        .db-lrow{display:grid;grid-template-columns:120px minmax(0,1fr) auto;gap:26px;
          align-items:center;padding:20px 26px;border-bottom:1px solid var(--rule-soft)}
        .db-lrow:last-child{border-bottom:none}
        @media(max-width:860px){.db-lrow{grid-template-columns:1fr;gap:12px;padding:18px 20px}}
        .db-lwhen{font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;
          text-transform:uppercase;color:var(--faint);line-height:1.5}
        .db-lwhen b{display:block;color:var(--ink);font-weight:600;font-size:11.5px;letter-spacing:.04em}
        .db-lname{font-family:var(--disp);font-size:19px;font-weight:600;color:var(--ink)}
        .db-lmetrics{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-top:7px;
          font-family:var(--mono);font-size:11.5px;letter-spacing:.03em;color:var(--faint);
          font-variant-numeric:tabular-nums}
        .db-lmetrics .v{color:var(--ink-2)}
        .db-up{color:var(--red);font-weight:600}
        .db-down{color:var(--green);font-weight:600}
        .db-flat{color:var(--green);font-weight:600}
        .db-lacts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}

        .db-admin{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:26px}
        @media(max-width:760px){.db-admin{grid-template-columns:1fr}}
        .db-acard{position:relative;background:var(--paper-2);border:1px solid var(--rule);
          border-radius:2px;padding:24px 24px 22px}
        .db-acard > .stamp{position:absolute;top:-13px;right:20px;background:var(--paper-2)}
        .db-acard h3{font-size:18px;margin:0}
        .db-acard .db-meta{font-family:var(--mono);font-size:11px;letter-spacing:.05em;
          color:var(--faint);margin-top:8px;font-variant-numeric:tabular-nums}
        .db-acard p{font-size:14.5px;margin:8px 0 0}
        .db-acard .row{margin-top:18px}

        .db-foot{margin-top:44px;padding-top:16px;border-top:1px solid var(--rule);
          font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;color:var(--faint);
          display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap}
      `}</style>

      <header className="db-top">
        <div>
          <div className="db-kick">{today} · 07:30</div>
          <h1>
            Le registre <em>du jour</em>
          </h1>
          <div className="db-who">
            {agency?.name ? `${agency.name} · ` : ""}
            {user.email}
          </div>
        </div>
        <div className="row">
          <a className="btn quiet" href="/dashboard/settings">
            Réglages
          </a>
          <form action={signOut}>
            <button className="btn quiet">Se déconnecter</button>
          </form>
        </div>
      </header>

      <div className="db-subline">
        <span>
          {clientAccountCount} compte{clientAccountCount > 1 ? "s" : ""} suivi
          {clientAccountCount > 1 ? "s" : ""} ·{" "}
          {detections.length} alerte{detections.length > 1 ? "s" : ""} ouverte
          {detections.length > 1 ? "s" : ""}
        </span>
        <span>
          Dernier import : {lastImport ? shortDate(lastImport) : "aucun"}
        </span>
      </div>

      {sp.connect === "meta_ok" && (
        <div className="banner ok">
          Meta Ads connecté — audit initial terminé, <b>{sp.findings ?? "0"}</b>{" "}
          alerte(s) détectée(s).
        </div>
      )}
      {sp.connect === "meta_error" && (
        <div className="banner err">
          La connexion Meta a échoué. Vérifiez l&apos;app Meta puis réessayez.
        </div>
      )}
      {sp.error === "subscription" && (
        <div className="banner err">
          Votre essai ou abonnement n&apos;est plus actif. Choisissez un plan
          pour continuer.
        </div>
      )}
      {sp.error === "quota" && (
        <div className="banner err">
          La connexion ajouterait plus de comptes clients que votre plan ne le
          permet. Passez à un plan supérieur puis réessayez.
        </div>
      )}

      {/* Ce qui doit être lu avant tout le reste. */}
      <section className="db-brief">
        <span
          className={briefStamp.cls}
          style={{ "--tilt": "5deg" } as React.CSSProperties}
        >
          {briefStamp.text}
        </span>
        <div className="db-bhead">
          <h2>Brief du matin</h2>
          <span>CONSIGNÉ 07:30</span>
        </div>

        {detections.length === 0 ? (
          <div className="db-entry green">
            <span className="db-dot" />
            <div>
              <div className="db-eline">
                <b>
                  {connections.length
                    ? "Rien à signaler"
                    : "Aucune source connectée"}
                </b>
              </div>
              <p>
                {connections.length
                  ? "Dépense, CPA et volume dans les bornes sur tous vos comptes."
                  : "Connectez Meta Ads ou importez un export CSV : la détection démarre au premier import."}
              </p>
            </div>
          </div>
        ) : (
          detections.map((d) => (
            <div key={d.id} className={`db-entry ${d.severity}`}>
              <span className="db-dot" />
              <div>
                <div className="db-eline">
                  <b>
                    {(d.client_account_id &&
                      accountName.get(d.client_account_id)) ??
                      "Compte client"}
                  </b>
                  <span
                    className={`badge ${
                      d.severity === "red"
                        ? "err"
                        : d.severity === "amber"
                          ? "warn"
                          : "ok"
                    }`}
                  >
                    {d.title ?? d.type}
                  </span>
                </div>
                {d.body && <p>{d.body}</p>}
              </div>
            </div>
          ))
        )}
      </section>

      {/* Le registre proprement dit. */}
      {clientAccounts.length > 0 && (
        <>
          <div className="db-sechead">
            <div>
              <div className="db-kick">Comptes clients</div>
              <h2>Rapports mensuels</h2>
            </div>
            <div className="db-note">
              {clientAccountCount} /{" "}
              {Number.isFinite(clientAccountLimit) ? clientAccountLimit : "∞"}{" "}
              comptes
            </div>
          </div>

          <section className="db-ledger">
            {clientAccounts.map((a) => {
              const s = summaryByAccount.get(a.id);
              const currency = a.currency ?? "EUR";
              const tone: "red" | "amber" | "green" =
                s?.trend == null
                  ? "green"
                  : s.trend > 0.2
                    ? "red"
                    : s.trend > 0.05
                      ? "amber"
                      : "green";
              return (
                <div key={a.id} className="db-lrow">
                  <div className="db-lwhen">
                    <b>{shortDate(s?.lastDate ?? null)}</b>
                    dernier import
                  </div>
                  <div>
                    <div className="db-lname">{a.name}</div>
                    <div className="db-lmetrics">
                      {s ? (
                        <>
                          <span>
                            <span className="v">
                              {nf.format(Math.round(s.conversions))}
                            </span>{" "}
                            conversions
                          </span>
                          {s.cpa !== null && (
                            <span>
                              CPA{" "}
                              <span className="v">
                                {nf1.format(s.cpa)} {currency}
                              </span>
                              {s.trend !== null && (
                                <>
                                  {" "}
                                  <span
                                    className={
                                      s.trend > 0.05
                                        ? "db-up"
                                        : s.trend < -0.05
                                          ? "db-down"
                                          : "db-flat"
                                    }
                                  >
                                    {s.trend > 0.05
                                      ? `↑ ${Math.round(s.trend * 100)} %`
                                      : s.trend < -0.05
                                        ? `↓ ${Math.abs(Math.round(s.trend * 100))} %`
                                        : "stable"}
                                  </span>
                                </>
                              )}
                            </span>
                          )}
                          <Sparkline
                            values={s.series}
                            tone={tone}
                            label={`CPA de ${a.name} sur trente jours`}
                          />
                        </>
                      ) : (
                        <span>Aucune donnée sur les trente derniers jours</span>
                      )}
                    </div>
                  </div>
                  <div className="db-lacts">
                    <GenerateReportButton accountId={a.id} />
                    <a
                      className="btn sec sm"
                      href={`/portal/${a.id}?t=${makeShareToken(a.id, portalTokenVersion)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Portail ↗
                    </a>
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}

      {/* L'administratif, à sa place : en bas. */}
      <div className="db-admin">
        <div className="db-acard">
          <span
            className={planStamp.cls}
            style={{ "--tilt": "4deg" } as React.CSSProperties}
          >
            {planStamp.text}
          </span>
          <h3>Abonnement</h3>
          <div className="db-meta">{ent.label}</div>
          <p>
            {ent.active
              ? "14 jours d’essai sans carte bancaire. Résiliable à tout moment."
              : "Votre essai est terminé — choisissez un plan pour rouvrir les briefs et les portails."}
          </p>
          <PlanButtons />
        </div>

        <div className="db-acard">
          <span
            className={
              connections.length ? "stamp green" : "stamp amber"
            }
            style={{ "--tilt": "-4deg" } as React.CSSProperties}
          >
            {connections.length ? "À jour" : "À connecter"}
          </span>
          <h3>Sources</h3>
          <div className="db-meta">
            {connections.length ? (
              <span className="row" style={{ gap: 6 }}>
                {connections.map((c) => (
                  <span
                    key={c.id}
                    className={`badge ${c.status === "active" ? "ok" : "warn"}`}
                  >
                    {providerLabel(c.provider)} ·{" "}
                    {c.status === "active" ? "actif" : "à vérifier"}
                  </span>
                ))}
              </span>
            ) : (
              "Aucune source connectée"
            )}
          </div>
          <p>
            {hasMeta
              ? "Meta Ads est synchronisé chaque nuit. Complétez avec les exports de Matomo, TikTok Ads ou vos régies locales."
              : "Connectez Meta Ads pour la synchronisation automatique, ou déposez un export CSV. Huit jours consécutifs suffisent pour armer la détection."}
          </p>
          <div className="row">
            <a
              className="btn sm"
              href={sourcesDisabled ? undefined : "/api/connect/meta/start"}
              aria-disabled={sourcesDisabled}
            >
              {hasMeta ? "Reconnecter Meta Ads" : "Connecter Meta Ads"}{" "}
              <span className="arr">→</span>
            </a>
            <a
              className="btn sec sm"
              href={sourcesDisabled ? undefined : "/dashboard/import"}
              aria-disabled={sourcesDisabled}
            >
              Importer un CSV
            </a>
          </div>
          {sourcesDisabled && (
            <p className="muted" style={{ fontSize: 13 }}>
              {ent.active
                ? "Quota de comptes clients atteint — passez à un plan supérieur pour en ajouter."
                : "Choisissez un plan pour rouvrir les imports."}
            </p>
          )}
        </div>
      </div>

      <div className="db-foot">
        <span>Reportly · registre de décisions</span>
        <span>Prochain brief demain, 07:30</span>
      </div>
    </div>
  );
}
