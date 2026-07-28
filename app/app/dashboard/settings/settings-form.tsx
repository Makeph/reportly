"use client";

import { useActionState, useState } from "react";
import { saveSettings, type SettingsState } from "./actions";

const INITIAL_STATE: SettingsState = { status: "idle" };
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export default function SettingsForm({
  initialName,
  initialColor,
  initialLogo,
}: {
  initialName: string;
  initialColor: string;
  initialLogo: string;
}) {
  const [state, formAction, pending] = useActionState(
    saveSettings,
    INITIAL_STATE
  );
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [colorPicker, setColorPicker] = useState(initialColor);
  const [logo, setLogo] = useState(initialLogo);

  function updateColor(value: string) {
    setColor(value);
    if (HEX_COLOR.test(value)) setColorPicker(value);
  }

  return (
    <form action={formAction} noValidate>
      <div className="card" style={{ marginBottom: 24 }}>
        <h2>Identité du portail</h2>
        <p className="muted">
          Ces éléments apparaissent dans l’espace partagé avec vos clients.
        </p>

        <label style={{ display: "block", marginTop: 18 }}>
          <b>Nom affiché sur le portail</b>
          <input
            className="input"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            style={{ display: "block", marginTop: 8 }}
          />
        </label>
        {state.errors?.name && (
          <p style={{ color: "var(--red)", margin: "6px 0 0" }}>
            {state.errors.name}
          </p>
        )}

        <label style={{ display: "block", marginTop: 18 }}>
          <b>Couleur de marque</b>
          <span className="row" style={{ marginTop: 8 }}>
            <input
              aria-label="Sélecteur de couleur"
              type="color"
              value={colorPicker}
              onChange={(event) => {
                setColorPicker(event.target.value);
                setColor(event.target.value.toUpperCase());
              }}
              style={{ width: 48, height: 42, padding: 2 }}
            />
            <input
              className="input"
              name="color"
              value={color}
              onChange={(event) => updateColor(event.target.value)}
              placeholder="#1F6BFF"
              style={{ maxWidth: 180 }}
            />
          </span>
        </label>
        {state.errors?.color && (
          <p style={{ color: "var(--red)", margin: "6px 0 0" }}>
            {state.errors.color}
          </p>
        )}

        <label style={{ display: "block", marginTop: 18 }}>
          <b>URL du logo</b>
          <input
            className="input"
            name="logo"
            type="url"
            value={logo}
            onChange={(event) => setLogo(event.target.value)}
            placeholder="https://exemple.fr/logo.svg"
            style={{ display: "block", marginTop: 8 }}
          />
        </label>
        {state.errors?.logo && (
          <p style={{ color: "var(--red)", margin: "6px 0 0" }}>
            {state.errors.logo}
          </p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2>Aperçu</h2>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            borderBottom: `2px solid ${colorPicker}`,
            padding: "12px 0 16px",
          }}
        >
          {logo ? (
            <img
              key={logo}
              src={logo}
              alt={name || "Agence"}
              style={{ maxHeight: 32, maxWidth: 180, objectFit: "contain" }}
            />
          ) : (
            <strong style={{ color: colorPicker, fontSize: 18 }}>
              {name || "Agence"}
            </strong>
          )}
          <span className="muted">· Espace client</span>
        </div>
      </div>

      <button className="btn" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer les réglages"}
      </button>

      {state.status === "success" && (
        <div className="banner ok">{state.message}</div>
      )}
      {state.status === "error" && state.message && (
        <div className="banner err">{state.message}</div>
      )}
    </form>
  );
}
