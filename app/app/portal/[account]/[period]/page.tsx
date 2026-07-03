import Link from "next/link";
import { notFound } from "next/navigation";
import { getReportForPortal, formatPeriodFr } from "@/lib/report";
import { makeShareToken, verifyShareToken } from "@/lib/share-token";
import PrintButton from "@/app/portal/print-button";

function fmt(n: number, currency: string) {
  return `${n.toLocaleString("fr-FR")} ${currency}`;
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
  if (!sp.t || !verifyShareToken(account, sp.t)) notFound();

  const token = makeShareToken(account);
  const data = await getReportForPortal(account, period);
  if (!data) notFound();

  const { report, account: acc, agency } = data;
  const kpis = report.kpis;
  const brand = (agency?.branding ?? {}) as Record<string, string>;
  const primary = brand.color || "#1F6BFF";
  const agencyName = brand.name || agency?.name || "Agence";
  const currency = kpis?.currency ?? "EUR";
  const delta = kpis?.deltaPct ?? null;

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <header
        className="no-print"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          borderBottom: `2px solid ${primary}`,
          paddingBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <strong style={{ color: primary, fontSize: 18 }}>{agencyName}</strong>
          <Link href={`/portal/${account}?t=${token}`} className="muted">
            ← Tous les rapports
          </Link>
        </div>
        <PrintButton />
      </header>

      <h1 style={{ marginTop: 24 }}>{acc.name}</h1>
      <p className="muted">Rapport mensuel — {formatPeriodFr(period)}</p>

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          margin: "20px 0",
        }}
      >
        <div className="card" style={{ padding: 18 }}>
          <div className="muted" style={{ fontSize: 12, textTransform: "uppercase" }}>
            Dépense
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)" }}>
            {fmt(kpis?.spend ?? 0, currency)}
          </div>
          {delta !== null && (
            <div style={{ fontSize: 13, color: delta >= 0 ? "#16A34A" : "#DC2626" }}>
              {delta >= 0 ? "▲ +" : "▼ "}
              {delta} % vs mois précédent
            </div>
          )}
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="muted" style={{ fontSize: 12, textTransform: "uppercase" }}>
            Incidents détectés
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)" }}>
            {kpis?.incidentsDetected ?? 0}
          </div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="muted" style={{ fontSize: 12, textTransform: "uppercase" }}>
            Corrigés
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#16A34A" }}>
            {kpis?.incidentsResolved ?? 0}/{kpis?.incidentsDetected ?? 0}
          </div>
        </div>
      </div>

      {/* Synthèse */}
      <div className="card">
        <h2 style={{ fontSize: 18 }}>Synthèse du mois</h2>
        {(kpis?.synthesis ?? []).map((p, i) => (
          <p key={i} style={{ lineHeight: 1.7 }}>
            {p}
          </p>
        ))}
        {(kpis?.highlights ?? []).length > 0 && (
          <ul style={{ lineHeight: 1.7 }}>
            {kpis!.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Priorité */}
      {report.priority && (
        <div
          className="card"
          style={{
            marginTop: 16,
            borderColor: "#F3D9A4",
            background: "#FEF3DF",
          }}
        >
          <div
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: ".06em",
              color: "#B45309",
              fontWeight: 600,
            }}
          >
            Priorité du mois
          </div>
          <p style={{ margin: "8px 0 0", color: "#5C4A22", lineHeight: 1.6 }}>
            {report.priority}
          </p>
        </div>
      )}

      <footer className="muted" style={{ marginTop: 40, fontSize: 12 }}>
        Propulsé par{" "}
        <a href="https://getreportly.fr" style={{ color: primary }}>
          Reportly
        </a>
      </footer>
    </div>
  );
}
