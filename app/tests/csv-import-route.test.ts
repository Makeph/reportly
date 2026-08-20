import test from "node:test";
import assert from "node:assert/strict";

import { parseCsvImport } from "../lib/csv-import.ts";

import { validateImportForm } from "../lib/csv-import.ts";

// La validation du formulaire est extraite du handler dans lib/csv-import.ts :
// elle est pure, donc testable sans client Supabase ni requête HTTP. Le handler
// authentifie toujours AVANT d'appeler ces vérifications — on ne lit pas un
// fichier de 2 Mo fourni par un visiteur non authentifié.

function formulaire(champs: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) fd.append(cle, valeur);
  return fd;
}

function fichierCsv(contenu: string, nom = "metriques.csv"): File {
  return new File([contenu], nom, { type: "text/csv" });
}

const CSV_VALIDE = `date;spend;conversions
2026-07-01;100;10`;

test("refuse un formulaire sans fichier", () => {
  const r = validateImportForm(formulaire({ accountName: "Acme" }));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.status, 400);
  assert.match(r.error, /fichier CSV est requis/i);
});

test("refuse un fichier de plus de 2 Mo", () => {
  const trop = fichierCsv("x".repeat(2 * 1024 * 1024 + 1));
  const r = validateImportForm(
    formulaire({ accountName: "Acme", file: trop })
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.status, 413);
});

test("refuse un nom de compte vide ou fait d'espaces", () => {
  for (const nom of ["", "   "]) {
    const r = validateImportForm(
      formulaire({ accountName: nom, file: fichierCsv(CSV_VALIDE) })
    );
    assert.equal(r.ok, false, `nom rejeté attendu pour ${JSON.stringify(nom)}`);
  }
});

test("refuse un budget mensuel non numérique ou négatif", () => {
  for (const budget of ["abc", "-5", "0"]) {
    const r = validateImportForm(
      formulaire({
        accountName: "Acme",
        file: fichierCsv(CSV_VALIDE),
        monthlyBudget: budget,
      })
    );
    assert.equal(r.ok, false, `budget rejeté attendu pour ${budget}`);
  }
});

test("accepte un formulaire valide, budget absent ou à virgule", () => {
  const sansBudget = validateImportForm(
    formulaire({ accountName: "  Acme  ", file: fichierCsv(CSV_VALIDE) })
  );
  assert.equal(sansBudget.ok, true);
  if (!sansBudget.ok) return;
  assert.equal(sansBudget.fields.accountName, "Acme");
  assert.equal(sansBudget.fields.monthlyBudget, null);

  const virgule = validateImportForm(
    formulaire({
      accountName: "Acme",
      file: fichierCsv(CSV_VALIDE),
      monthlyBudget: "1500,50",
    })
  );
  assert.equal(virgule.ok, true);
  if (!virgule.ok) return;
  assert.equal(virgule.fields.monthlyBudget, 1500.5);
});

