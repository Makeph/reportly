"use client";

import { useState } from "react";

const PLANS = [
  { id: "starter", label: "Starter — 79 €", primary: false },
  { id: "growth", label: "Growth — 149 €", primary: true },
  { id: "pro", label: "Pro — 299 €", primary: false },
];

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
    <div className="row" style={{ marginTop: 14 }}>
      {PLANS.map((p) => (
        <button
          key={p.id}
          className={p.primary ? "btn" : "btn sec"}
          disabled={loading !== null}
          onClick={() => choose(p.id)}
        >
          {loading === p.id ? "Redirection…" : p.label}
        </button>
      ))}
    </div>
  );
}
