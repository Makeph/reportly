import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { maxClientAccounts, requireActiveAgency } from "../lib/billing.ts";

const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
const APP_ROOT = path.join(PROJECT_ROOT, "app");

// Ces routes machine sont protégées par CRON_SECRET, pas par une session agence.
const EXEMPT_ROUTES = new Map([
  ["app/api/cron/daily/route.ts", "authentification machine par CRON_SECRET"],
  ["app/api/cron/monthly/route.ts", "authentification machine par CRON_SECRET"],

  // Stripe doit appeler le webhook sans session ; sa signature est vérifiée par Stripe.
  ["app/api/stripe/webhook/route.ts", "signature Stripe obligatoire"],

  // Un utilisateur expiré doit pouvoir ouvrir Checkout pour réactiver son abonnement.
  ["app/api/stripe/checkout/route.ts", "route d'acquisition authentifiée par getUser"],

  // Le callback crée précisément la session qui n'existe pas encore à son entrée.
  ["app/auth/callback/route.ts", "établissement de la session Supabase"],

  // Ce téléchargement public est en lecture seule et ne contient aucune donnée agence.
  ["app/api/import/csv/exemple/route.ts", "modèle CSV public sans mutation"],
]);

const REQUIRED_GUARDED_ROUTES = [
  "app/api/import/csv/route.ts",
  "app/api/reports/generate/route.ts",
  "app/api/connect/meta/start/route.ts",
  "app/api/connect/meta/callback/route.ts",
];

async function findRouteFiles(directory: string): Promise<string[]> {
  const routes: string[] = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      routes.push(...(await findRouteFiles(entryPath)));
    } else if (entry.name === "route.ts") {
      routes.push(entryPath);
    }
  }

  return routes;
}

function relativeRoute(file: string): string {
  return path.relative(PROJECT_ROOT, file).split(path.sep).join("/");
}

test("toute route GET ou POST non exemptée appelle requireActiveAgency", async () => {
  const handlers = new Map<string, string>();

  for (const file of await findRouteFiles(APP_ROOT)) {
    const source = await readFile(file, "utf8");
    if (/export\s+(?:async\s+)?function\s+(?:GET|POST)\b/.test(source)) {
      handlers.set(relativeRoute(file), source);
    }
  }

  for (const route of EXEMPT_ROUTES.keys()) {
    assert.ok(handlers.has(route), `La route exemptée ${route} doit exister.`);
  }

  for (const route of REQUIRED_GUARDED_ROUTES) {
    assert.ok(handlers.has(route), `La route sensible ${route} doit exister.`);
  }

  const unguarded = [...handlers]
    .filter(([route, source]) => {
      return !EXEMPT_ROUTES.has(route) && !/\brequireActiveAgency\s*\(/.test(source);
    })
    .map(([route]) => route)
    .sort();

  assert.deepEqual(
    unguarded,
    [],
    `Toute nouvelle route doit appeler requireActiveAgency ou être exemptée explicitement : ${unguarded.join(
      ", "
    )}`
  );
});

type FakeSupabaseOptions = {
  user?: { id: string } | null;
  membership?: { agency_id: string } | null;
  agency?: {
    id: string;
    name?: string | null;
    plan?: string | null;
    trial_ends_at?: string | null;
    subscription_status?: string | null;
  } | null;
};

function fakeSupabase({
  user = { id: "user-1" },
  membership = { agency_id: "agency-1" },
  agency = {
    id: "agency-1",
    plan: "starter",
    trial_ends_at: null,
    subscription_status: null,
  },
}: FakeSupabaseOptions = {}) {
  return {
    auth: {
      async getUser() {
        return { data: { user } };
      },
    },
    from(table: string) {
      const result =
        table === "agency_member"
          ? { data: membership, error: null }
          : { data: agency, error: null };
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        limit() {
          return query;
        },
        async maybeSingle() {
          return result;
        },
      };
      return query;
    },
  };
}

test("requireActiveAgency refuse un utilisateur non authentifié", async () => {
  const result = await requireActiveAgency(fakeSupabase({ user: null }) as never);

  assert.deepEqual(result, {
    ok: false,
    status: 401,
    code: "unauthenticated",
    error: "Non authentifié.",
  });
});

test("requireActiveAgency refuse un utilisateur sans agence", async () => {
  const result = await requireActiveAgency(
    fakeSupabase({ membership: null }) as never
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 403);
    assert.equal(result.code, "agency_not_found");
  }
});

test("requireActiveAgency refuse un essai expiré sans abonnement", async () => {
  const result = await requireActiveAgency(
    fakeSupabase({
      agency: {
        id: "agency-1",
        trial_ends_at: new Date(Date.now() - 86_400_000).toISOString(),
        subscription_status: null,
      },
    }) as never
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 402);
    assert.equal(result.code, "subscription_required");
  }
});

test("requireActiveAgency autorise un essai actif", async () => {
  const result = await requireActiveAgency(
    fakeSupabase({
      agency: {
        id: "agency-1",
        trial_ends_at: new Date(Date.now() + 86_400_000).toISOString(),
        subscription_status: null,
      },
    }) as never
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.agency.id, "agency-1");
    assert.equal(result.entitlement.trialActive, true);
  }
});

test("requireActiveAgency autorise un abonnement actif", async () => {
  const result = await requireActiveAgency(
    fakeSupabase({
      agency: {
        id: "agency-1",
        plan: "growth",
        subscription_status: "active",
      },
    }) as never
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.entitlement.subActive, true);
  }
});

for (const [plan, quota] of [
  ["starter", 3],
  ["growth", 20],
  ["pro", Number.POSITIVE_INFINITY],
] as const) {
  test(`maxClientAccounts applique le quota ${String(quota)} au plan ${plan}`, () => {
    assert.equal(maxClientAccounts({ plan }), quota);
  });
}

test("maxClientAccounts accorde le quota Growth pendant l'essai", () => {
  assert.equal(
    maxClientAccounts({
      plan: null,
      trial_ends_at: new Date(Date.now() + 86_400_000).toISOString(),
      subscription_status: null,
    }),
    20
  );
});

test("maxClientAccounts limite un plan inconnu au quota Starter", () => {
  assert.equal(maxClientAccounts({ plan: "enterprise-inconnu" }), 3);
});
