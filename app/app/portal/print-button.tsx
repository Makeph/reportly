"use client";

export default function PrintButton() {
  return (
    <button className="btn sec no-print" onClick={() => window.print()}>
      Télécharger en PDF
    </button>
  );
}
