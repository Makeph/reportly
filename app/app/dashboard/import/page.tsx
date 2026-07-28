"use client";

import { useState, type FormEvent } from "react";

type ImportResponse = {
  ok?: boolean;
  rows?: number;
  findings?: number;
  error?: string;
  errors?: string[];
};

type Message = {
  kind: "ok" | "err";
  text: string;
};

const CSV_EXAMPLE = `date;depense;conversions;revenu
2026-07-01;120,50;6;480
2026-07-02;98,20;5;410
2026-07-03;145,00;7;560`;

export default function CsvImportPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/import/csv", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const data = (await response.json()) as ImportResponse;

      if (!response.ok) {
        const details = data.errors?.length ? ` ${data.errors.join(" ")}` : "";
        setMessage({
          kind: "err",
          text: `${data.error ?? "L’import a échoué."}${details}`,
        });
        return;
      }

      const ignored = data.errors?.length
        ? ` ${data.errors.length} ligne(s) ignorée(s) : ${data.errors
            .slice(0, 3)
            .join(" ")}`
        : "";
      setMessage({
        kind: "ok",
        text: `Import terminé : ${data.rows ?? 0} ligne(s) importée(s), ${
          data.findings ?? 0
        } alerte(s) ouverte(s).${ignored}`,
      });
    } catch {
      setMessage({
        kind: "err",
        text: "L’import a échoué à cause d’une erreur réseau.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="wrap">
      <a href="/dashboard">← Retour au tableau de bord</a>

      <div className="card" style={{ marginTop: 24 }}>
        <h1>Importer un fichier CSV</h1>
        <p className="muted">
          Ajoutez les métriques quotidiennes d&apos;un compte client depuis
          Matomo, TikTok Ads ou une régie locale.
        </p>

        <form onSubmit={submit}>
          <label>
            Nom du compte client
            <input
              className="input"
              name="accountName"
              placeholder="Maison Lutea"
              required
              type="text"
            />
          </label>

          <label>
            Budget mensuel (€)
            <input
              className="input"
              min="0.01"
              name="monthlyBudget"
              placeholder="5000"
              step="0.01"
              type="number"
            />
          </label>

          <label>
            Fichier CSV
            <input
              accept=".csv,text/csv"
              className="input"
              name="file"
              required
              type="file"
            />
          </label>
          <p className="muted">Taille maximale : 2 Mo.</p>

          <button className="btn" disabled={loading} type="submit">
            {loading ? "Import en cours…" : "Importer et lancer l’audit"}
          </button>
        </form>

        {message && (
          <div className={`banner ${message.kind}`} aria-live="polite">
            {message.text}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h2>Format attendu</h2>
        <p className="muted">
          L&apos;en-tête doit contenir <b>date</b>, <b>spend</b> ou{" "}
          <b>depense</b>, et <b>conversions</b>. La colonne <b>revenue</b> ou{" "}
          <b>revenu</b> est facultative. Les séparateurs « ; » et « , » ainsi
          que les dates YYYY-MM-DD et DD/MM/YYYY sont acceptés.
        </p>
        <p>Exemple copiable avec trois lignes de données :</p>
        <pre
          style={{
            background: "#f4f4f5",
            borderRadius: 8,
            fontFamily: "var(--font-code)",
            fontSize: 13,
            overflowX: "auto",
            padding: 16,
          }}
        >
          <code>{CSV_EXAMPLE}</code>
        </pre>
        <div className="banner">
          Importez <b>au moins 8 jours consécutifs</b> pour activer la détection
          d&apos;anomalie. Renseigner le <b>budget mensuel</b> active le suivi du
          rythme de dépense.
        </div>
      </div>
    </main>
  );
}
