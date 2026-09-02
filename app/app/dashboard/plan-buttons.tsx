"use client";

import { useState } from "react";

const PLANS = [
  { id: "starter", label: "Starter — 79 €", primary: false },
  { id: "growth", label: "Growth — 149 €", primary: true },
  { id: "pro", label: "Pro — 299 €", primary: false },
];

const btnStyle = {
  fontFamily: "var(--mono)",
  fontSize: "12px",
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  padding: "12px 18px",
  border: "1.5px solid",
  borderRadius: "3px",
  cursor: "pointer",
  transition: "all 0.15s",
  fontWeight: 600,
} as React.CSSProperties;

const btnPrimary = {
  ...btnStyle,
  background: "var(--ink)",
  color: "var(--paper)",
  borderColor: "var(--ink)",
  boxShadow: "2px 2px 0 rgba(35, 38, 29, 0.15)",
} as React.CSSProperties;

const btnSecondary = {
  ...btnStyle,
  background: "var(--paper)",
  color: "var(--ink)",
  borderColor: "var(--rule)",
} as React.CSSProperties;

export default function PlanButtons() {
  const [loading, setLoading] = useState<string | null>(null);

  async function choose(plan: string) {
    setLoading(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error ?? "Erreur Stripe");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
      {PLANS.map((p) => (
        <button
          key={p.id}
          style={p.primary ? btnPrimary : btnSecondary}
          disabled={loading !== null}
          onClick={() => choose(p.id)}
        >
          {loading === p.id ? "Redirection…" : p.label}
        </button>
      ))}
    </div>
  );
}
