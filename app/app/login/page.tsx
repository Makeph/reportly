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
    <div className="card auth">
      <h1>Reportly</h1>
      {sent ? (
        <p>
          Lien de connexion envoyé à <b>{email}</b>. Ouvrez votre boîte mail
          pour continuer — aucun mot de passe nécessaire.
        </p>
      ) : (
        <form onSubmit={onSubmit}>
          <p className="muted">
            Connectez-vous par lien magique. Pas d&apos;appel, pas de mot de
            passe.
          </p>
          <input
            className="input"
            type="email"
            required
            placeholder="vous@agence.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn" disabled={loading}>
            {loading ? "Envoi…" : "Recevoir le lien"}
          </button>
          {error && (
            <p style={{ color: "var(--red)", marginTop: 12 }}>{error}</p>
          )}
        </form>
      )}
    </div>
  );
}
