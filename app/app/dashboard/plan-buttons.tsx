"use client";

import { useState } from "react";

const PLANS = [
  { id: "starter", label: "Starter — 79 €", primary: false },
  { id: "growth", label: "Growth — 149 €", primary: true },
  { id: "pro", label: "Pro — 299 €", primary: false },
];

export default function PlanButtons() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(plan: string) {
    setLoading(plan);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setError(data.error ?? "Le paiement n’a pas pu s’ouvrir.");
    } catch {
      setError("Le paiement n’a pas pu s’ouvrir. Vérifiez votre connexion.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <div className="row" style={{ marginTop: 18 }}>
        {PLANS.map((p) => (
          <button
            key={p.id}
            className={p.primary ? "btn sm" : "btn sec sm"}
            disabled={loading !== null}
            onClick={() => choose(p.id)}
          >
            {loading === p.id ? "Redirection…" : p.label}
            {p.primary && <span className="arr">→</span>}
          </button>
        ))}
      </div>
      {error && (
        <p
          className="muted"
          style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}
          role="alert"
        >
          {error}
        </p>
      )}
    </>
  );
}
