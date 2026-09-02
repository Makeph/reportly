import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPortalHeader,
  listReportsForAccount,
  formatPeriodFr,
} from "@/lib/report";
import {
  getPortalTokenVersion,
  makeShareToken,
  verifyShareToken,
} from "@/lib/share-token";

const INK_RED = "#BC3A1D";

export default async function PortalListPage({
  params,
  searchParams,
}: {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { account } = await params;
  const sp = await searchParams;
  const header = await getPortalHeader(account);
  if (!header) notFound();
  const portalTokenVersion = getPortalTokenVersion(header.agency?.branding);
  if (!sp.t || !verifyShareToken(account, sp.t, portalTokenVersion)) {
    notFound();
  }

  const token = makeShareToken(account, portalTokenVersion);

  const brand = (header.agency?.branding ?? {}) as Record<string, string>;
  const primary = brand.color || INK_RED;
  const agencyName = brand.name || header.agency?.name || "Agence";
  const reports = await listReportsForAccount(account);

  return (
    <div className="wrap pl-doc">
      <style>{`
        .pl-doc{max-width:760px}
        .pl-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap;
          padding:34px 0 14px;border-bottom:2px solid var(--brand)}
        .pl-head strong{font-family:var(--disp);font-size:19px;color:var(--brand);font-weight:700}
        .pl-head span{font-family:var(--mono);font-size:11px;letter-spacing:.1em;
          text-transform:uppercase;color:var(--faint)}

        .pl-title{margin:34px 0 0}
        .pl-kick{display:flex;align-items:center;gap:12px;font-family:var(--mono);font-size:11px;
          font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:var(--brand)}
        .pl-kick::before{content:"";width:30px;height:1.5px;background:var(--brand);flex:0 0 auto}
        .pl-title h1{font-size:clamp(30px,4.2vw,42px);margin:12px 0 0}

        /* la pile de rapports, en lignes de registre */
        .pl-ledger{margin-top:28px;background:var(--paper-2);border:1px solid var(--rule);
          border-radius:2px;overflow:hidden;box-shadow:0 22px 48px -34px rgba(35,38,29,.42)}
        .pl-row{display:flex;align-items:center;justify-content:space-between;gap:18px;
          padding:20px 24px;border-bottom:1px solid var(--rule-soft);text-decoration:none;
          transition:background .15s}
        .pl-row:last-child{border-bottom:none}
        .pl-row:hover{background:var(--paper);text-decoration:none}
        .pl-period{font-family:var(--disp);font-size:19px;font-weight:600;color:var(--ink)}
        .pl-meta{font-family:var(--mono);font-size:11.5px;letter-spacing:.03em;
          color:var(--faint);margin-top:5px;font-variant-numeric:tabular-nums}
        .pl-go{font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.1em;
          text-transform:uppercase;color:var(--brand);white-space:nowrap}
        .pl-row:hover .pl-arr{display:inline-block;transform:translateX(4px)}
        .pl-arr{transition:transform .2s}

        .pl-empty{margin-top:28px;background:var(--paper-2);border:1px solid var(--rule);
          border-radius:2px;padding:32px 28px}
        .pl-empty p{margin:8px 0 0;font-size:15.5px}

        .pl-foot{margin-top:48px;padding-top:16px;border-top:1px solid var(--rule);
          font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;color:var(--faint)}
        .pl-foot a{color:var(--brand)}
      `}</style>
      <style>{`.pl-doc{--brand:${primary}}`}</style>

      <header className="pl-head">
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
        <span>Espace client</span>
      </header>

      <div className="pl-title">
        <div className="pl-kick">Rapports mensuels</div>
        <h1>{header.account.name}</h1>
      </div>

      {reports.length === 0 ? (
        <div className="pl-empty">
          <h2 style={{ fontSize: 20 }}>Aucun rapport publié</h2>
          <p className="muted">
            Le premier rapport paraîtra à la fin du mois en cours. Vous
            recevrez un e-mail dès sa publication.
          </p>
        </div>
      ) : (
        <div className="pl-ledger">
          {reports.map((r) => (
            <Link
              key={r.period}
              href={`/portal/${account}/${r.period}?t=${token}`}
              className="pl-row"
            >
              <span>
                <span className="pl-period">{formatPeriodFr(r.period)}</span>
                <span className="pl-meta">
                  {r.kpis?.incidentsResolved ?? 0}/
                  {r.kpis?.incidentsDetected ?? 0} incident
                  {(r.kpis?.incidentsDetected ?? 0) > 1 ? "s" : ""} corrigé
                  {(r.kpis?.incidentsResolved ?? 0) > 1 ? "s" : ""}
                </span>
              </span>
              <span className="pl-go">
                Lire <span className="pl-arr">→</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {header.agency?.plan !== "pro" && (
        <footer className="pl-foot">
          Propulsé par <a href="https://getreportly.fr">Reportly</a>
        </footer>
      )}
    </div>
  );
}
