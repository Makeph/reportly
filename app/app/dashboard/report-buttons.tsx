"use client";

import { useState } from "react";

export default function GenerateReportButton({
  accountId,
}: {
  accountId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
      setMsg(
        res.ok
          ? { ok: true, text: "Rapport généré" }
          : { ok: false, text: data.error ?? "La génération a échoué." }
      );
    } catch {
      setMsg({
        ok: false,
        text: "La génération a échoué. Vérifiez votre connexion.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="row" style={{ gap: 8 }}>
      <button className="btn sm" disabled={loading} onClick={generate}>
        {loading ? "Génération…" : "Générer"}
        {!loading && <span className="arr">→</span>}
      </button>
      {msg && (
        <span
          className="badge"
          style={{
            color: msg.ok ? "var(--green)" : "var(--red)",
            background: msg.ok ? "var(--green-t)" : "var(--red-t)",
          }}
          aria-live="polite"
        >
          {msg.text}
        </span>
      )}
    </span>
  );
}
