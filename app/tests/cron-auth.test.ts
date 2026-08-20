import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const MODULE_STUBS = new Map<string, string>([
  [
    "next/server",
    `export class NextResponse extends Response {
      static json(body, init) { return Response.json(body, init); }
    }`,
  ],
  [
    "@/lib/supabase/admin",
    `export function createAdminClient() {
      return {
        from() {
          return { async select() { return { data: [] }; } };
        }
      };
    }`,
  ],
  [
    "@/lib/billing",
    `export function getEntitlement() {
      return { active: true, trialActive: false, subActive: true };
    }`,
  ],
  ["@/lib/brief", "export async function runDailyBrief() {}"],
  ["@/lib/email", "export async function sendLifecycleEmail() { return true; }"],
  [
    "@/lib/lifecycle-emails",
    `export function onboardingConnectSource() { return { subject: "", html: "" }; }
     export function trialEndsSoon() { return { subject: "", html: "" }; }`,
  ],
  [
    "@/lib/report",
    `export async function generateReport() { return { ok: true }; }
     export function prevMonthPeriod() { return "2026-07"; }`,
  ],
]);

// Le hook natif remplace uniquement les dépendances exécutées après une auth réussie.
// Les fonctions GET testées restent les vrais handlers de production.
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = MODULE_STUBS.get(specifier);
    if (stub !== undefined) {
      return {
        url: `data:text/javascript,${encodeURIComponent(stub)}`,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const [{ GET: dailyCron }, { GET: monthlyCron }] = await Promise.all([
  import("../app/api/cron/daily/route.ts"),
  import("../app/api/cron/monthly/route.ts"),
]);

// Les deux crons renvoient des corps JSON différents ; on ne retient que le
// contrat commun (une réponse HTTP) pour pouvoir les tester dans une seule boucle.
type CronHandler = (request: Request) => Promise<Response>;

const handlers: ReadonlyArray<readonly [string, CronHandler]> = [
  ["quotidien", dailyCron],
  ["mensuel", monthlyCron],
];

async function withCronSecret<T>(
  secret: string | undefined,
  callback: () => Promise<T>
): Promise<T> {
  const previous = process.env.CRON_SECRET;
  if (secret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = secret;

  try {
    return await callback();
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
}

for (const [label, handler] of handlers) {
  test(`le cron ${label} accepte le bon Bearer`, async () => {
    const response = await withCronSecret("secret-cron-test", () =>
      handler(
        new Request("https://reportly.test/api/cron", {
          headers: { Authorization: "Bearer secret-cron-test" },
        })
      )
    );

    assert.equal(response.status, 200);
  });

  test(`le cron ${label} refuse un en-tête Authorization absent`, async () => {
    const response = await withCronSecret("secret-cron-test", () =>
      handler(new Request("https://reportly.test/api/cron"))
    );

    assert.equal(response.status, 401);
  });

  test(`le cron ${label} refuse un mauvais secret`, async () => {
    const response = await withCronSecret("secret-cron-test", () =>
      handler(
        new Request("https://reportly.test/api/cron", {
          headers: { Authorization: "Bearer mauvais-secret" },
        })
      )
    );

    assert.equal(response.status, 401);
  });

  test(`le cron ${label} refuse le secret passé dans l'URL`, async () => {
    const response = await withCronSecret("secret-cron-test", () =>
      handler(
        new Request(
          "https://reportly.test/api/cron?secret=secret-cron-test"
        )
      )
    );

    assert.equal(response.status, 401);
  });

  test(`le cron ${label} refuse l'accès si CRON_SECRET est absent`, async () => {
    const response = await withCronSecret(undefined, () =>
      handler(
        new Request("https://reportly.test/api/cron", {
          headers: { Authorization: "Bearer secret-cron-test" },
        })
      )
    );

    assert.equal(response.status, 401);
  });
}
