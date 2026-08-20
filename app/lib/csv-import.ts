export type CsvImportRow = {
  date: string;
  spend: number;
  conversions: number;
  revenue?: number;
  cpa?: number;
  roas?: number;
};

export type CsvImportResult = {
  rows: CsvImportRow[];
  errors: string[];
};

type ColumnName = "date" | "spend" | "conversions" | "revenue";

const COLUMN_ALIASES: Record<string, ColumnName> = {
  date: "date",
  spend: "spend",
  depense: "spend",
  conversions: "conversions",
  revenue: "revenue",
  revenu: "revenue",
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function countSeparator(line: string, separator: string): number {
  let count = 0;
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"') {
      if (quoted && line[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (!quoted && line[i] === separator) {
      count += 1;
    }
  }

  return count;
}

function splitLine(
  line: string,
  separator: string
): { fields: string[]; valid: boolean } {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === separator && !quoted) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return { fields, valid: !quoted };
}

function parseNumber(value: string): number | null {
  let normalized = value
    .replace(/[€\s\u00a0\u202f]/g, "")
    .trim();
  if (!normalized) return null;

  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimalSeparator = comma > dot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = normalized.split(thousandsSeparator).join("");
    if (decimalSeparator === ",") normalized = normalized.replace(",", ".");
  } else if (comma >= 0) {
    normalized = normalized.replace(",", ".");
  }

  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: string): string | null {
  let year: number;
  let month: number;
  let day: number;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const french = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (french) {
    day = Number(french[1]);
    month = Number(french[2]);
    year = Number(french[3]);
  } else {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0"
  )}-${String(day).padStart(2, "0")}`;
}

// Parse et valide un export quotidien sans interrompre l'import à la première erreur.
export function parseCsvImport(input: string): CsvImportResult {
  const rows: CsvImportRow[] = [];
  const errors: string[] = [];
  const lines = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const headerIndex = lines.findIndex((line) => line.trim().length > 0);

  if (headerIndex < 0) {
    return {
      rows,
      errors: ["Ligne 1 : l’en-tête CSV est obligatoire."],
    };
  }

  const headerLine = lines[headerIndex];
  const separator =
    countSeparator(headerLine, ";") > countSeparator(headerLine, ",") ? ";" : ",";
  const parsedHeader = splitLine(headerLine, separator);
  const headerLineNumber = headerIndex + 1;
  if (!parsedHeader.valid) {
    return {
      rows,
      errors: [`Ligne ${headerLineNumber} : guillemet non fermé dans l’en-tête.`],
    };
  }

  const columnIndexes = new Map<ColumnName, number>();
  parsedHeader.fields.forEach((field, index) => {
    const column = COLUMN_ALIASES[normalizeHeader(field)];
    if (!column) return;
    if (columnIndexes.has(column)) {
      errors.push(
        `Ligne ${headerLineNumber} : la colonne « ${field.trim()} » est présente plusieurs fois.`
      );
      return;
    }
    columnIndexes.set(column, index);
  });

  for (const required of ["date", "spend", "conversions"] as const) {
    if (!columnIndexes.has(required)) {
      errors.push(
        `Ligne ${headerLineNumber} : colonne obligatoire « ${required} » manquante dans l’en-tête.`
      );
    }
  }
  if (errors.length) return { rows, errors };

  const seenDates = new Set<string>();
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;

    const lineNumber = index + 1;
    const parsedLine = splitLine(line, separator);
    if (!parsedLine.valid) {
      errors.push(`Ligne ${lineNumber} : guillemet non fermé.`);
      continue;
    }
    if (parsedLine.fields.length > parsedHeader.fields.length) {
      errors.push(
        `Ligne ${lineNumber} : le nombre de colonnes ne correspond pas à l’en-tête.`
      );
      continue;
    }

    const value = (column: ColumnName) =>
      parsedLine.fields[columnIndexes.get(column) ?? -1] ?? "";
    const date = parseDate(value("date"));
    if (!date) {
      errors.push(
        `Ligne ${lineNumber} : date invalide (formats acceptés : YYYY-MM-DD ou DD/MM/YYYY).`
      );
      continue;
    }

    const spend = parseNumber(value("spend"));
    if (spend === null || spend < 0) {
      errors.push(`Ligne ${lineNumber} : dépense invalide.`);
      continue;
    }

    const conversions = parseNumber(value("conversions"));
    if (conversions === null || conversions < 0) {
      errors.push(`Ligne ${lineNumber} : nombre de conversions invalide.`);
      continue;
    }

    const revenueValue = columnIndexes.has("revenue") ? value("revenue") : "";
    const revenue = revenueValue ? parseNumber(revenueValue) : undefined;
    if (revenue !== undefined && (revenue === null || revenue < 0)) {
      errors.push(`Ligne ${lineNumber} : revenu invalide.`);
      continue;
    }
    if (seenDates.has(date)) {
      errors.push(`Ligne ${lineNumber} : la date ${date} est présente plusieurs fois.`);
      continue;
    }
    seenDates.add(date);

    rows.push({
      date,
      spend,
      conversions,
      ...(revenue !== undefined && revenue !== null ? { revenue } : {}),
      ...(conversions > 0 ? { cpa: spend / conversions } : {}),
      ...(revenue !== undefined && revenue !== null && spend > 0
        ? { roas: revenue / spend }
        : {}),
    });
  }

  if (!rows.length && !errors.length) {
    errors.push(`Ligne ${headerLineNumber + 1} : aucune donnée à importer.`);
  }

  return { rows, errors };
}

export const parseCsv = parseCsvImport;

// --- Validation du formulaire d'import ------------------------------------
// Extraite du handler pour être testable sans client Supabase ni requête HTTP.
// Le handler reste responsable de l'authentification, qui doit précéder toute
// lecture du fichier : on ne parse pas 2 Mo d'entrée non authentifiée.

export const MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024;

export type ImportFormError = { error: string; status: number };

export type ImportFormFields = {
  file: File;
  accountName: string;
  monthlyBudget: number | null;
};

export function slugifyAccountName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function parseMonthlyBudget(
  value: FormDataEntryValue | null
): number | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return Number.NaN;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return Number.NaN;
  return parsed;
}

// Renvoie soit les champs validés, soit l'erreur à retourner telle quelle.
export function validateImportForm(
  formData: FormData
): { ok: true; fields: ImportFormFields } | { ok: false } & ImportFormError {
  const file = formData.get("file");
  const accountNameValue = formData.get("accountName");
  const accountName =
    typeof accountNameValue === "string" ? accountNameValue.trim() : "";
  const monthlyBudget = parseMonthlyBudget(formData.get("monthlyBudget"));

  if (!(file instanceof File)) {
    return { ok: false, error: "Un fichier CSV est requis.", status: 400 };
  }
  if (!accountName) {
    return {
      ok: false,
      error: "Le nom du compte client est requis.",
      status: 400,
    };
  }
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    return {
      ok: false,
      error: "Le fichier CSV ne doit pas dépasser 2 Mo.",
      status: 413,
    };
  }
  if (Number.isNaN(monthlyBudget)) {
    return {
      ok: false,
      error: "Le budget mensuel doit être un nombre positif.",
      status: 400,
    };
  }

  return { ok: true, fields: { file, accountName, monthlyBudget } };
}
