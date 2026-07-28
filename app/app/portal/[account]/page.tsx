import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPortalHeader,
  listReportsForAccount,
  formatPeriodFr,
} from "@/lib/report";
import { makeShareToken, verifyShareToken } from "@/lib/share-token";

export default async function PortalListPage({
  params,
  searchParams,
}: {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { account } = await params;
  const sp = await searchParams;
  if (!sp.t || !verifyShareToken(account, sp.t)) notFound();

  const token = makeShareToken(account);
  const header = await getPortalHeader(account);
  if (!header) notFound();

  const brand = (header.agency?.branding ?? {}) as Record<string, string>;
  const primary = brand.color || "#1F6BFF";
  const agencyName = brand.name || header.agency?.name || "Agence";
  const reports = await listReportsForAccount(account);

  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderBottom: `2px solid ${primary}`,
          paddingBottom: 16,
        }}
      >
        {brand.logo ? (
          <img
            src={brand.logo}
            alt={agencyName}
            style={{ maxHeight: 32, maxWidth: 180, objectFit: "contain" }}
          />
        ) : (
          <strong style={{ color: primary, fontSize: 18 }}>{agencyName}</strong>
        )}
        <span className="muted">· Espace client</span>
      </header>

      <h1 style={{ marginTop: 24 }}>{header.account.name}</h1>
      <p className="muted">Rapports mensuels</p>

      {reports.length === 0 ? (
        <p className="muted">Aucun rapport publié pour le moment.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {reports.map((r) => (
            <Link
              key={r.period}
              href={`/portal/${account}/${r.period}?t=${token}`}
              className="card"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                textDecoration: "none",
              }}
            >
              <span>
                <b style={{ color: "var(--navy)" }}>{formatPeriodFr(r.period)}</b>
                <span className="muted" style={{ display: "block", fontSize: 13 }}>
                  {r.kpis?.incidentsResolved ?? 0}/{r.kpis?.incidentsDetected ?? 0}{" "}
                  incident(s) corrigé(s)
                </span>
              </span>
              <span style={{ color: primary, fontWeight: 600 }}>Voir →</span>
            </Link>
          ))}
        </div>
      )}

      {header.agency?.plan !== "pro" && (
        <footer className="muted" style={{ marginTop: 40, fontSize: 12 }}>
          Propulsé par{" "}
          <a href="https://getreportly.fr" style={{ color: primary }}>
            Reportly
          </a>
        </footer>
      )}
    </div>
  );
}
