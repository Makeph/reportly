"use client";

import { useState } from "react";

const btnStyle = {
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
  fontWeight: 600,
} as React.CSSProperties;

const msgStyle = {
  fontSize: "12px",
  color: "var(--green)",
  fontFamily: "var(--mono)",
  marginLeft: 8,
} as React.CSSProperties;

export default function GenerateReportButton({
  accountId,
}: {
  accountId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const data = await res.json();
      setMsg(res.ok ? "Rapport généré ✓" : data.error ?? "Erreur");
    } catch {
      setMsg("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button style={btnStyle} disabled={loading} onClick={generate}>
        {loading ? "Génération…" : "Générer (mois dernier)"}
      </button>
      {msg && <span style={msgStyle}>{msg}</span>}
    </div>
  );
}
