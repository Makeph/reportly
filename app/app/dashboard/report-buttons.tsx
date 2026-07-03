"use client";

import { useState } from "react";

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
    <span className="row">
      <button className="btn sec" disabled={loading} onClick={generate}>
        {loading ? "Génération…" : "Générer (mois dernier)"}
      </button>
      {msg && <span className="muted">{msg}</span>}
    </span>
  );
}
