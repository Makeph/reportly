"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Supabase répond en anglais : on ne montre pas ça à l'utilisateur. */
function frenchError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Trop de demandes coup sur coup. Patientez une minute avant de réessayer.";
  }
  if (m.includes("invalid") && m.includes("email")) {
    return "Cette adresse e-mail ne semble pas valide.";
  }
  if (m.includes("signups not allowed") || m.includes("not authorized")) {
    return "Les inscriptions sont fermées pour le moment. Écrivez-nous pour ouvrir un accès.";
  }
  if (m.includes("fetch") || m.includes("network")) {
    return "Connexion impossible. Vérifiez votre réseau puis réessayez.";
  }
  return "L’envoi a échoué. Réessayez dans un instant.";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send(address: string) {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) setError(frenchError(error.message));
    else setSent(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await send(email);
  }

  async function onResend() {
    setResent(false);
    await send(email);
    setResent(true);
  }

  return (
    <main className="lg-page">
      <style>{`
        /* margin:auto plutôt qu'align-items:center — sur un écran court, le haut
           de la carte reste atteignable au défilement. */
        .lg-page{min-height:100vh;display:flex;padding:32px 20px;background:var(--paper)}
        .lg-card{margin:auto;position:relative;width:100%;max-width:520px;background:var(--paper-2);
          border:1px solid var(--rule);border-radius:2px;padding:44px 44px 38px;
          box-shadow:0 30px 60px -34px rgba(35,38,29,.45),0 2px 0 rgba(255,255,255,.6) inset}
        @media(max-width:520px){.lg-card{padding:32px 24px 28px}}
        /* feuillet arraché du carnet, comme la dépêche du dashboard */
        .lg-card::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:12px;
          background-image:radial-gradient(circle at 8px 0,var(--paper) 5px,transparent 5.5px);
          background-size:16px 12px;background-position:0 2px}
        .lg-card > .stamp{position:absolute;top:-13px;right:26px;background:var(--paper-2)}
        @media(max-width:520px){.lg-card > .stamp{right:auto;left:22px}}

        .lg-head{text-align:center;padding-bottom:22px;border-bottom:2px solid var(--ink)}
        .lg-logo{font-family:var(--disp);font-size:34px;font-weight:700;color:var(--ink);
          letter-spacing:-.02em;margin:0}
        .lg-logo span{color:var(--red)}
        .lg-tag{font-family:var(--mono);font-size:11px;letter-spacing:.16em;
          text-transform:uppercase;color:var(--faint);margin:8px 0 0}

        .lg-form{display:flex;flex-direction:column;gap:18px;margin-top:28px}
        .lg-label{display:flex;flex-direction:column;gap:8px;font-family:var(--mono);
          font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-2);
          font-weight:600}
        .lg-form .input{margin:0}
        .lg-form .btn{width:100%;padding:15px 24px;font-size:12px}
        .lg-note{font-family:var(--mono);font-size:11px;letter-spacing:.04em;
          line-height:1.75;color:var(--faint);text-align:center;margin:0}

        .lg-sent{margin-top:28px}
        .lg-sent h2{font-size:26px;margin:0}
        .lg-sent p{font-size:15.5px;margin:12px 0 0;line-height:1.6}
        .lg-addr{display:block;font-family:var(--mono);font-size:14px;font-weight:600;
          color:var(--ink);background:var(--paper);border:1px solid var(--rule);
          border-radius:2px;padding:13px 16px;margin:16px 0 0;word-break:break-all}
        .lg-checklist{list-style:none;margin:22px 0 0;padding:0}
        .lg-checklist li{position:relative;padding:11px 0 11px 24px;
          border-top:1px solid var(--rule-soft);font-size:14.5px;line-height:1.55}
        .lg-checklist li::before{content:"";position:absolute;left:0;top:20px;
          width:12px;height:1.5px;background:var(--red)}
        .lg-again{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:24px}

        .lg-err{margin:0;padding:12px 14px;border-radius:2px;background:var(--red-t);
          border:1px solid var(--red-line);color:var(--red);font-size:14px}
        .lg-ok{font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--green)}
      `}</style>

      <div className="lg-card">
        <span
          className="stamp"
          style={{ "--tilt": "4deg" } as React.CSSProperties}
        >
          Sans mot de passe
        </span>

        <div className="lg-head">
          <h1 className="lg-logo">
            Reportly<span>.</span>
          </h1>
          <p className="lg-tag">Le registre de décisions des agences</p>
        </div>

        {sent ? (
          <div className="lg-sent">
            <h2>Le lien est parti</h2>
            <p>Ouvrez votre boîte mail et cliquez sur le lien envoyé à :</p>
            <span className="lg-addr">{email}</span>

            <ul className="lg-checklist">
              <li>
                Il arrive au nom de <b>Reportly</b> — cherchez ce mot dans votre
                boîte si rien n&apos;apparaît.
              </li>
              <li>
                Pensez aux spams et à l&apos;onglet Promotions : c&apos;est là
                qu&apos;il se cache le plus souvent.
              </li>
              <li>
                Le lien est à usage unique. Demandez-en un nouveau si celui-ci a
                déjà servi.
              </li>
            </ul>

            <div className="lg-again">
              <button
                className="btn sec sm"
                onClick={onResend}
                disabled={loading}
              >
                {loading ? "Envoi…" : "Renvoyer le lien"}
              </button>
              {resent && !loading && (
                <span className="lg-ok" role="status">
                  Nouveau lien envoyé
                </span>
              )}
              <button
                className="btn quiet sm"
                onClick={() => {
                  setSent(false);
                  setResent(false);
                }}
              >
                Changer d&apos;adresse
              </button>
            </div>

            {error && (
              <p className="lg-err" role="alert" style={{ marginTop: 16 }}>
                {error}
              </p>
            )}
          </div>
        ) : (
          <form className="lg-form" onSubmit={onSubmit}>
            <label className="lg-label">
              Votre adresse e-mail
              <input
                className="input"
                type="email"
                name="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="vous@agence.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </label>

            <button className="btn" type="submit" disabled={loading}>
              {loading ? "Envoi en cours…" : "Recevoir le lien"}
              {!loading && <span className="arr">→</span>}
            </button>

            {error && (
              <p className="lg-err" role="alert">
                {error}
              </p>
            )}

            <p className="lg-note">
              Première visite ou retour : la même adresse suffit.
              <br />
              Votre espace s’ouvre au premier lien — sans mot de passe, sans
              carte bancaire.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
