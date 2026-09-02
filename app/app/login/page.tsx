"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div style={styles.container}>
      <style>{`
        :root {
          --paper: #F5EFE2;
          --paper-2: #FBF7EC;
          --ink: #23261D;
          --ink-2: #4C4A3C;
          --faint: #8B8368;
          --rule: #D9CEB2;
          --red: #BC3A1D;
          --disp: 'Fraunces', Georgia, serif;
          --body: 'Spectral', Georgia, serif;
          --mono: 'IBM Plex Mono', ui-monospace, Consolas, monospace;
        }
        body {
          background: var(--paper);
          color: var(--ink-2);
          font-family: var(--body);
          margin: 0;
        }
      `}</style>

      <div style={styles.box}>
        <div style={styles.header}>
          <h1 style={styles.logo}>
            Reportly<span style={{ color: "var(--red)" }}>.</span>
          </h1>
          <p style={styles.tagline}>Le registre de décisions des agences</p>
          <div style={styles.rule}></div>
        </div>

        {sent ? (
          <div style={styles.message}>
            <h2 style={styles.messageTitle}>Lien envoyé</h2>
            <p style={styles.messageText}>
              Vérifiez votre boîte mail — un lien de connexion a été envoyé à :
            </p>
            <p style={styles.email}>{email}</p>
            <p style={styles.hint}>
              Le lien expire dans 24 heures. Si vous ne le trouvez pas, vérifiez vos spams.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} style={styles.form}>
            <label style={styles.label}>
              <span style={styles.labelText}>Votre adresse e-mail</span>
              <input
                type="email"
                required
                placeholder="vous@agence.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                style={styles.input}
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              style={styles.btn}
            >
              {loading ? "Envoi en cours…" : "Recevoir le lien de connexion"}
            </button>

            {error && (
              <p style={styles.error}>{error}</p>
            )}

            <p style={styles.info}>
              Vous recevrez un lien de connexion par e-mail. Aucun mot de passe requis.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    background: "var(--paper)",
  } as React.CSSProperties,
  box: {
    width: "100%",
    maxWidth: "520px",
    background: "var(--paper-2)",
    border: "1.5px solid var(--rule)",
    borderRadius: "0",
    padding: "56px 48px",
    boxShadow: "0 8px 24px -8px rgba(35, 38, 29, 0.15)",
  } as React.CSSProperties,
  header: {
    marginBottom: "44px",
    textAlign: "center" as const,
  } as React.CSSProperties,
  logo: {
    fontFamily: "var(--disp)",
    fontSize: "32px",
    fontWeight: 700,
    margin: "0 0 6px",
    color: "var(--ink)",
    letterSpacing: "-0.02em",
  } as React.CSSProperties,
  tagline: {
    fontFamily: "var(--mono)",
    fontSize: "12px",
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "var(--faint)",
    margin: "0 0 18px",
    fontWeight: 500,
  } as React.CSSProperties,
  rule: {
    height: "2px",
    background: "var(--rule)",
    margin: "24px 0 0",
  } as React.CSSProperties,
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "20px",
  } as React.CSSProperties,
  label: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
  } as React.CSSProperties,
  labelText: {
    fontFamily: "var(--mono)",
    fontSize: "11px",
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "var(--ink-2)",
    fontWeight: 600,
  } as React.CSSProperties,
  input: {
    fontFamily: "var(--body)",
    fontSize: "16px",
    padding: "14px 16px",
    border: "1.5px solid var(--rule)",
    borderRadius: "3px",
    background: "var(--paper)",
    color: "var(--ink)",
    outline: "none",
    transition: "border-color 0.2s",
  } as React.CSSProperties,
  btn: {
    fontFamily: "var(--mono)",
    fontSize: "13px",
    fontWeight: 600,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    padding: "16px 24px",
    background: "var(--ink)",
    color: "var(--paper)",
    border: "1.5px solid var(--ink)",
    borderRadius: "3px",
    cursor: "pointer",
    transition: "all 0.15s",
    boxShadow: "4px 4px 0 rgba(35, 38, 29, 0.2)",
  } as React.CSSProperties,
  message: {
    textAlign: "center" as const,
  } as React.CSSProperties,
  messageTitle: {
    fontFamily: "var(--disp)",
    fontSize: "28px",
    fontWeight: 600,
    margin: "0 0 12px",
    color: "var(--ink)",
  } as React.CSSProperties,
  messageText: {
    fontSize: "15px",
    margin: "0 0 12px",
    color: "var(--ink-2)",
  } as React.CSSProperties,
  email: {
    fontFamily: "var(--mono)",
    fontSize: "14px",
    fontWeight: 600,
    background: "var(--paper)",
    padding: "12px 16px",
    borderRadius: "3px",
    margin: "12px 0",
    color: "var(--red)",
    border: "1px solid var(--rule)",
  } as React.CSSProperties,
  hint: {
    fontSize: "13px",
    color: "var(--faint)",
    marginTop: "18px",
  } as React.CSSProperties,
  info: {
    fontSize: "13px",
    color: "var(--faint)",
    margin: "0",
    textAlign: "center" as const,
  } as React.CSSProperties,
  error: {
    color: "var(--red)",
    fontSize: "13px",
    padding: "12px 16px",
    background: "var(--paper)",
    borderRadius: "3px",
    border: "1px solid var(--red)",
    margin: "0",
  } as React.CSSProperties,
};
