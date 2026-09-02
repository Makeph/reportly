"use client";

import { useState, type FormEvent } from "react";
import GenerateReportButton from "../report-buttons";

type ImportResponse = {
  ok?: boolean;
  rows?: number;
  findings?: number;
  error?: string;
  errors?: string[];
  code?: string;
  current?: number;
  max?: number;
};

type Message = {
  kind: "ok" | "err";
  text: string;
};

const CSV_EXAMPLE = `date;depense;conversions;revenu
2026-07-01;120,50;6;480
2026-07-02;98,20;5;410
2026-07-03;145,00;7;560`;

const styles = {
  container: {
    minHeight: "100vh",
    background: "var(--paper)",
    color: "var(--ink-2)",
    fontFamily: "var(--body)",
    padding: "40px 28px",
  } as React.CSSProperties,
  backLink: {
    color: "var(--red)",
    fontFamily: "var(--mono)",
    fontSize: "12px",
    letterSpacing: "0.05em",
    textDecoration: "none",
    transition: "0.15s",
  } as React.CSSProperties,
  section: {
    background: "var(--paper-2)",
    border: "1.5px solid var(--rule)",
    borderRadius: "3px",
    padding: "28px",
    marginTop: 24,
    boxShadow: "0 4px 12px -6px rgba(35, 38, 29, 0.12)",
  } as React.CSSProperties,
  h1: {
    fontFamily: "var(--disp)",
    fontSize: "28px",
    fontWeight: 600,
    margin: "0 0 12px",
    color: "var(--ink)",
  } as React.CSSProperties,
  h2: {
    fontFamily: "var(--disp)",
    fontSize: "21px",
    fontWeight: 600,
    margin: "0 0 14px",
    color: "var(--ink)",
  } as React.CSSProperties,
  p: {
    margin: "0 0 12px",
    fontSize: "15px",
    color: "var(--ink-2)",
  } as React.CSSProperties,
  muted: {
    margin: "0 0 12px",
    fontSize: "13px",
    color: "var(--faint)",
  } as React.CSSProperties,
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 20,
    marginTop: 20,
  } as React.CSSProperties,
  label: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    fontFamily: "var(--mono)",
    fontSize: "11px",
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "var(--ink-2)",
    fontWeight: 600,
  } as React.CSSProperties,
  input: {
    fontFamily: "var(--body)",
    fontSize: "15px",
    padding: "12px 14px",
    border: "1.5px solid var(--rule)",
    borderRadius: "3px",
    background: "var(--paper)",
    color: "var(--ink)",
    outline: "none",
    transition: "border-color 0.2s",
  } as React.CSSProperties,
  btn: {
    fontFamily: "var(--mono)",
    fontSize: "12px",
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    padding: "12px 18px",
    background: "var(--ink)",
    color: "var(--paper)",
    border: "1.5px solid var(--ink)",
    borderRadius: "3px",
    cursor: "pointer",
    transition: "all 0.15s",
    fontWeight: 600,
    boxShadow: "2px 2px 0 rgba(35, 38, 29, 0.15)",
    alignSelf: "flex-start" as const,
  } as React.CSSProperties,
  btnLink: {
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
    textDecoration: "none",
    display: "inline-block",
  } as React.CSSProperties,
  banner: {
    padding: "14px 16px",
    borderRadius: "3px",
    fontSize: "13px",
    marginTop: 16,
    fontFamily: "var(--mono)",
    letterSpacing: "0.05em",
  } as React.CSSProperties,
  bannerOk: {
    background: "#DFE7DB",
    color: "#2F5D45",
    border: "1px solid #BBE5C8",
  } as React.CSSProperties,
  bannerErr: {
    background: "#F1DDD1",
    color: "#BC3A1D",
    border: "1px solid #DCA489",
  } as React.CSSProperties,
  bannerInfo: {
    background: "var(--paper)",
    color: "var(--ink-2)",
    border: "1px solid var(--rule)",
  } as React.CSSProperties,
  pre: {
    background: "var(--paper)",
    borderRadius: "3px",
    fontFamily: "var(--mono)",
    fontSize: "12px",
    overflowX: "auto" as const,
    padding: 16,
    border: "1px solid var(--rule)",
  } as React.CSSProperties,
};

export default function CsvImportPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [lastAccountId, setLastAccountId] = useState<string | null>(null);

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
        if (response.status === 402) {
          setMessage({
            kind: "err",
            text:
              "Votre essai ou abonnement n’est plus actif. Retournez au tableau de bord pour choisir un plan avant d’importer.",
          });
          return;
        }
        if (data.code === "client_account_quota_reached") {
          const usage =
            data.current !== undefined && data.max !== undefined
              ? ` Vous utilisez ${data.current} / ${data.max} comptes clients.`
              : "";
          setMessage({
            kind: "err",
            text: `Le quota de comptes clients de votre plan est atteint.${usage} Passez à un plan supérieur pour ajouter ce compte.`,
          });
          return;
        }
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
      // Get the account ID from the form to enable generate button
      const form = event.currentTarget;
      const formData = new FormData(form);
      // The API returns the account ID in the response, but we don’t have it here
      // For now, we’ll just mark that import succeeded
      setLastAccountId("just_imported");
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
    <main style={styles.container}>
      <a style={styles.backLink} href="/dashboard">
        ← Retour au tableau de bord
      </a>

      <div style={styles.section}>
        <h1 style={styles.h1}>Importer un fichier CSV</h1>
        <p style={styles.muted}>
          Ajoutez les métriques quotidiennes d&apos;un compte client depuis
          Matomo, TikTok Ads ou une régie locale.
        </p>

        <form style={styles.form} onSubmit={submit}>
          <label style={styles.label}>
            Nom du compte client
            <input
              style={styles.input}
              name="accountName"
              placeholder="Maison Lutea"
              required
              type="text"
            />
          </label>

          <label style={styles.label}>
            Budget mensuel (€)
            <input
              style={styles.input}
              min="0.01"
              name="monthlyBudget"
              placeholder="5000"
              step="0.01"
              type="number"
            />
          </label>

          <label style={styles.label}>
            Fichier CSV
            <input
              style={styles.input}
              accept=".csv,text/csv"
              name="file"
              required
              type="file"
            />
          </label>
          <p style={styles.muted}>Taille maximale : 2 Mo.</p>

          <button style={styles.btn} disabled={loading} type="submit">
            {loading ? "Import en cours…" : "Importer et lancer l’audit"}
          </button>
        </form>

        {message && (
          <div
            style={{
              ...styles.banner,
              ...(message.kind === "ok"
                ? styles.bannerOk
                : message.kind === "err"
                  ? styles.bannerErr
                  : styles.bannerInfo),
            }}
            aria-live="polite"
          >
            {message.text}
          </div>
        )}
      </div>

      <div style={styles.section}>
        <h2 style={styles.h2}>Format attendu</h2>
        <p style={styles.muted}>
          L&apos;en-tête doit contenir <b>date</b>, <b>spend</b> ou{" "}
          <b>depense</b>, et <b>conversions</b>. La colonne <b>revenue</b> ou{" "}
          <b>revenu</b> est facultative. Les séparateurs « ; » et « , » ainsi
          que les dates YYYY-MM-DD et DD/MM/YYYY sont acceptés.
        </p>
        <a style={styles.btnLink} href="/api/import/csv/exemple">
          Télécharger un fichier d&apos;exemple
        </a>
        <p style={styles.muted}>
          Trente-quatre jours de données réalistes, prêtes à importer — de quoi
          voir immédiatement à quoi ressemble une alerte.
        </p>
        <p style={styles.p}>Exemple copiable avec trois lignes de données :</p>
        <pre style={styles.pre}>
          <code>{CSV_EXAMPLE}</code>
        </pre>
        <div
          style={{
            ...styles.banner,
            ...styles.bannerInfo,
          }}
        >
          Importez <b>au moins 8 jours consécutifs</b> pour activer la détection
          d&apos;anomalie. Renseigner le <b>budget mensuel</b> active le suivi du
          rythme de dépense.
        </div>
      </div>

      {message?.kind === "ok" && (
        <div style={styles.section}>
          <h2 style={styles.h2}>Étape suivante</h2>
          <p style={styles.p}>
            L&apos;import est terminé. Vous pouvez maintenant générer un rapport
            et voir le compte client dans votre tableau de bord.
          </p>
          <a style={{ ...styles.btnLink, ...{ marginRight: 12 } }} href="/dashboard">
            Retour au tableau de bord
          </a>
        </div>
      )}
    </main>
  );
}
