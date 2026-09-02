import Link from "next/link";
import { notFound } from "next/navigation";
import { getReportForPortal, formatPeriodFr } from "@/lib/report";
import {
  getPortalTokenVersion,
  makeShareToken,
  verifyShareToken,
} from "@/lib/share-token";
import PrintButton from "@/app/portal/print-button";

const INK_RED = "#BC3A1D";

function fmt(n: number, currency: string) {
  return `${n.toLocaleString("fr-FR")} ${currency}`;
}

function fmtNumber(n: number) {
  return n.toLocaleString("fr-FR");
}

function fmtDecimal(n: number) {
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Variation face au mois précédent — la couleur dit si c'est une bonne nouvelle. */
function Delta({
  delta,
  positiveIsGood = true,
}: {
  delta: number | null | undefined;
  positiveIsGood?: boolean;
}) {
  if (delta === null || delta === undefined) return null;
  if (delta === 0) {
    return <span className="rp-delta rp-neutral">stable vs mois précédent</span>;
  }
  const isPositive = delta > 0;
  const good = isPositive === positiveIsGood;
  return (
    <span className={`rp-delta ${good ? "rp-good" : "rp-bad"}`}>
      {isPositive ? "↑" : "↓"} {Math.abs(delta)} % vs mois précédent
    </span>
  );
}

function Kpi({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rp-kpi">
      <div className="rp-kpi-label">{label}</div>
      <div className="rp-kpi-value">{value}</div>
      {children}
    </div>
  );
}

export default async function PortalReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ account: string; period: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { account, period } = await params;
  const sp = await searchParams;
  const data = await getReportForPortal(account, period);
  if (!data) notFound();
  const portalTokenVersion = getPortalTokenVersion(data.agency?.branding);
  if (!sp.t || !verifyShareToken(account, sp.t, portalTokenVersion)) {
    notFound();
  }

  const token = makeShareToken(account, portalTokenVersion);

  const { report, account: acc, agency } = data;
  const kpis = report.kpis;
  const brand = (agency?.branding ?? {}) as Record<string, string>;
  const primary = brand.color || INK_RED;
  const agencyName = brand.name || agency?.name || "Agence";
  const currency = kpis?.currency ?? "EUR";

  const detected = kpis?.incidentsDetected ?? 0;
  const resolved = kpis?.incidentsResolved ?? 0;
  const allResolved = detected > 0 && resolved >= detected;

  return (
    <div className="wrap rp-doc">
      <style>{`
        .rp-doc{max-width:800px}
        .rp-head{display:flex;align-items:center;justify-content:space-between;gap:16px;
          flex-wrap:wrap;padding:34px 0 14px;border-bottom:2px solid var(--brand)}
        .rp-brand{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
        .rp-brand strong{font-family:var(--disp);font-size:19px;color:var(--brand);font-weight:700}
        .rp-back{font-family:var(--mono);font-size:11px;letter-spacing:.08em;
          text-transform:uppercase;color:var(--faint);text-decoration:none}
        .rp-back:hover{color:var(--ink)}

        .rp-title{margin:34px 0 0}
        .rp-kick{display:flex;align-items:center;gap:12px;font-family:var(--mono);font-size:11px;
          font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:var(--brand)}
        .rp-kick::before{content:"";width:30px;height:1.5px;background:var(--brand);flex:0 0 auto}
        .rp-title h1{font-size:clamp(30px,4.2vw,42px);margin:12px 0 0}
        .rp-title .rp-sub{font-family:var(--mono);font-size:11px;letter-spacing:.1em;
          text-transform:uppercase;color:var(--faint);margin-top:10px}

        /* cartouche de chiffres : une réglure, pas des cartes flottantes */
        .rp-cartouche{position:relative;margin-top:32px;background:var(--paper-2);
          border:1px solid var(--rule);border-radius:2px;overflow:hidden;
          display:grid;grid-template-columns:repeat(3,1fr)}
        @media(max-width:640px){.rp-cartouche{grid-template-columns:repeat(2,1fr)}}
        .rp-kpi{padding:20px 22px;border-left:1px solid var(--rule-soft);
          border-top:1px solid var(--rule-soft)}
        .rp-cartouche > .rp-kpi:nth-child(3n+1){border-left:none}
        .rp-cartouche > .rp-kpi:nth-child(-n+3){border-top:none}
        @media(max-width:640px){
          .rp-cartouche > .rp-kpi{border-left:1px solid var(--rule-soft);
            border-top:1px solid var(--rule-soft)}
          .rp-cartouche > .rp-kpi:nth-child(2n+1){border-left:none}
          .rp-cartouche > .rp-kpi:nth-child(-n+2){border-top:none}
        }
        .rp-kpi-label{font-family:var(--mono);font-size:10px;letter-spacing:.14em;
          text-transform:uppercase;color:var(--faint)}
        .rp-kpi-value{font-family:var(--disp);font-size:26px;font-weight:700;color:var(--ink);
          margin-top:8px;font-variant-numeric:tabular-nums;line-height:1.1}
        .rp-delta{display:block;margin-top:8px;font-family:var(--mono);font-size:10.5px;
          letter-spacing:.04em}
        .rp-good{color:var(--green)}
        .rp-bad{color:var(--red)}
        .rp-neutral{color:var(--faint)}

        .rp-seal{position:absolute;right:18px;top:-13px;background:var(--paper-2);z-index:2}

        .rp-section{margin-top:44px}
        .rp-section h2{font-size:24px;margin:10px 0 0}
        .rp-body{max-width:66ch;margin-top:18px}
        .rp-body p{margin:0 0 16px;font-size:16.5px;line-height:1.7}
        .rp-body p:last-child{margin-bottom:0}

        .rp-facts{list-style:none;margin:22px 0 0;padding:0;max-width:66ch}
        .rp-facts li{position:relative;padding:12px 0 12px 26px;
          border-top:1px solid var(--rule-soft);font-size:15.5px;line-height:1.6}
        .rp-facts li::before{content:"";position:absolute;left:0;top:21px;
          width:13px;height:1.5px;background:var(--brand)}

        .rp-priority{position:relative;margin-top:44px;background:var(--amber-t);
          border:1px solid var(--amber-line);border-radius:2px;padding:26px 28px}
        .rp-priority .rp-plabel{font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;
          text-transform:uppercase;color:var(--amber);font-weight:600}
        .rp-priority p{margin:10px 0 0;font-size:17px;line-height:1.6;color:var(--ink);
          max-width:62ch}

        .rp-foot{margin-top:56px;padding-top:16px;border-top:1px solid var(--rule);
          display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;
          font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;color:var(--faint)}
        .rp-foot a{color:var(--brand)}

        /* le document imprimé : fond blanc, filets conservés, rien d'orphelin */
        @media print{
          @page{margin:16mm 14mm}
          .rp-doc{max-width:none;padding:0}
          .rp-head{padding-top:0}
          .rp-cartouche,.rp-priority,.rp-section,.rp-facts li{break-inside:avoid}
          .rp-section h2,.rp-title h1{break-after:avoid}
          .rp-cartouche{background:transparent}
          .rp-seal{background:#fff}
          .rp-priority{background:transparent;border-color:var(--amber)}
          .rp-foot{margin-top:32px}
        }
      `}</style>
      <style>{`.rp-doc{--brand:${primary}}`}</style>

      {/* Le bandeau de marque reste sur la version imprimée : le client doit
          voir de qui vient la pièce. Seule la navigation disparaît. */}
      <header className="rp-head">
        <div className="rp-brand">
          {brand.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logo}
              alt={agencyName}
              style={{ maxHeight: 34, maxWidth: 180, objectFit: "contain" }}
            />
          ) : (
            <strong>{agencyName}</strong>
          )}
          <Link
            href={`/portal/${account}?t=${token}`}
            className="rp-back no-print"
          >
            ← Tous les rapports
          </Link>
        </div>
        <PrintButton />
      </header>

      <div className="rp-title">
        <div className="rp-kick">Rapport mensuel · {formatPeriodFr(period)}</div>
        <h1>{acc.name}</h1>
        <div className="rp-sub">
          Établi par {agencyName} · {detected} incident
          {detected > 1 ? "s" : ""} consigné{detected > 1 ? "s" : ""}
        </div>
      </div>

      <div className="rp-cartouche">
        {detected > 0 && (
          <span
            className={`stamp rp-seal ${allResolved ? "green" : "amber"}`}
            style={{ "--tilt": "4deg" } as React.CSSProperties}
          >
            {resolved}/{detected} corrigé{resolved > 1 ? "s" : ""}
          </span>
        )}

        <Kpi label="Dépense" value={fmt(kpis?.spend ?? 0, currency)}>
          <Delta delta={kpis?.deltaPct} />
        </Kpi>
        <Kpi
          label="Conversions"
          value={
            kpis?.conversions !== undefined ? fmtNumber(kpis.conversions) : "—"
          }
        >
          <Delta delta={kpis?.conversionsDeltaPct} />
        </Kpi>
        <Kpi
          label="CPA moyen"
          value={
            kpis?.cpa !== null && kpis?.cpa !== undefined
              ? fmt(kpis.cpa, currency)
              : "—"
          }
        >
          {/* Un CPA qui monte n'est pas une bonne nouvelle. */}
          <Delta delta={kpis?.cpaDeltaPct} positiveIsGood={false} />
        </Kpi>
        {kpis?.roas !== null && kpis?.roas !== undefined && (
          <Kpi label="ROAS" value={fmtDecimal(kpis.roas)}>
            <Delta delta={kpis.roasDeltaPct} />
          </Kpi>
        )}
        <Kpi label="Incidents détectés" value={String(detected)} />
        <Kpi label="Corrigés" value={`${resolved}/${detected}`} />
      </div>

      <section className="rp-section">
        <div className="rp-kick">Ce qui s&apos;est passé</div>
        <h2>Synthèse du mois</h2>
        <div className="rp-body">
          {(kpis?.synthesis ?? []).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        {(kpis?.highlights ?? []).length > 0 && (
          <ul className="rp-facts">
            {kpis!.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        )}
      </section>

      {report.priority && (
        <div className="rp-priority">
          <div className="rp-plabel">Priorité du mois</div>
          <p>{report.priority}</p>
        </div>
      )}

      <footer className="rp-foot">
        <span>
          {agencyName} · {acc.name} · {formatPeriodFr(period)}
        </span>
        {agency?.plan !== "pro" && (
          <span>
            Propulsé par <a href="https://getreportly.fr">Reportly</a>
          </span>
        )}
      </footer>
    </div>
  );
}
