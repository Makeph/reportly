"use client";

import { useActionState } from "react";
import {
  revokePortalLinks,
  type SettingsState,
} from "./actions";

const INITIAL_STATE: SettingsState = { status: "idle" };

export default function RevokePortalLinksForm() {
  const [state, formAction, pending] = useActionState(
    revokePortalLinks,
    INITIAL_STATE
  );

  return (
    <div className="card" style={{ marginTop: 32 }}>
      <h2>Sécurité des liens de portail</h2>
      <p className="muted">
        Révoquez les liens partagés si l’un d’eux a été envoyé par erreur ou
        compromis. Les nouveaux liens générés depuis le tableau de bord resteront
        valides.
      </p>
      <form
        action={formAction}
        onSubmit={(event) => {
          const confirmed = window.confirm(
            "Confirmez-vous la révocation ? TOUS les liens de portail déjà envoyés aux clients cesseront immédiatement de fonctionner. Cette action est irréversible."
          );
          if (!confirmed) event.preventDefault();
        }}
      >
        <button
          className="btn"
          disabled={pending}
          style={{ background: "#DC2626" }}
        >
          {pending
            ? "Révocation…"
            : "Révoquer tous les liens de portail"}
        </button>
      </form>

      {state.status === "success" && (
        <div className="banner ok">{state.message}</div>
      )}
      {state.status === "error" && state.message && (
        <div className="banner err">{state.message}</div>
      )}
    </div>
  );
}
