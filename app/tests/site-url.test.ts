import { strict as assert } from "node:assert";
import test from "node:test";
import { siteUrl } from "../lib/site-url.ts";

function withEnv(
  vars: Record<string, string | undefined>,
  run: () => void
): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("NEXT_PUBLIC_SITE_URL l'emporte sur le domaine Vercel", () => {
  withEnv(
    {
      NEXT_PUBLIC_SITE_URL: "https://app.exemple.fr",
      VERCEL_PROJECT_PRODUCTION_URL: "projet.vercel.app",
    },
    () => assert.equal(siteUrl(), "https://app.exemple.fr")
  );
});

test("la barre oblique finale est retirée — les appelants ajoutent la leur", () => {
  withEnv({ NEXT_PUBLIC_SITE_URL: "https://app.exemple.fr/" }, () =>
    assert.equal(siteUrl(), "https://app.exemple.fr")
  );
});

test("une valeur vide ou blanche ne compte pas pour un réglage", () => {
  withEnv(
    {
      NEXT_PUBLIC_SITE_URL: "   ",
      VERCEL_PROJECT_PRODUCTION_URL: "projet.vercel.app",
    },
    () => assert.equal(siteUrl(), "https://projet.vercel.app")
  );
});

test("le domaine Vercel, fourni sans protocole, en reçoit un", () => {
  withEnv(
    {
      NEXT_PUBLIC_SITE_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: "reportly-orpin.vercel.app",
    },
    () => assert.equal(siteUrl(), "https://reportly-orpin.vercel.app")
  );
});

test("un domaine Vercel recopié avec son protocole ne le double pas", () => {
  withEnv(
    {
      NEXT_PUBLIC_SITE_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: "https://reportly-orpin.vercel.app/",
    },
    () => assert.equal(siteUrl(), "https://reportly-orpin.vercel.app")
  );
});

test("hors Vercel et sans réglage, on vise le serveur local", () => {
  withEnv(
    {
      NEXT_PUBLIC_SITE_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: undefined,
    },
    () => assert.equal(siteUrl(), "http://localhost:3000")
  );
});

test("aucun repli ne pointe vers un domaine sans certificat", () => {
  withEnv(
    {
      NEXT_PUBLIC_SITE_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: undefined,
    },
    () => assert.ok(!siteUrl().includes("app.getreportly.fr"))
  );
});

test("en local, localhost reste une adresse parfaitement valide", () => {
  withEnv(
    {
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      VERCEL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: undefined,
    },
    () => assert.equal(siteUrl(), "http://localhost:3000")
  );
});

test("sur Vercel, un localhost oublié cède au domaine de production", () => {
  withEnv(
    {
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      VERCEL: "1",
      VERCEL_PROJECT_PRODUCTION_URL: "reportly-orpin.vercel.app",
    },
    () => assert.equal(siteUrl(), "https://reportly-orpin.vercel.app")
  );
});

test("127.0.0.1 est écarté au même titre que localhost", () => {
  withEnv(
    {
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
      VERCEL: "1",
      VERCEL_PROJECT_PRODUCTION_URL: "reportly-orpin.vercel.app",
    },
    () => assert.equal(siteUrl(), "https://reportly-orpin.vercel.app")
  );
});

test("un vrai domaine n'est jamais écarté, même sur Vercel", () => {
  withEnv(
    {
      NEXT_PUBLIC_SITE_URL: "https://app.exemple.fr",
      VERCEL: "1",
      VERCEL_PROJECT_PRODUCTION_URL: "reportly-orpin.vercel.app",
    },
    () => assert.equal(siteUrl(), "https://app.exemple.fr")
  );
});

test("un nom d'hôte qui commence par « localhost » n'est pas localhost", () => {
  withEnv(
    {
      NEXT_PUBLIC_SITE_URL: "https://localhost-hub.exemple.fr",
      VERCEL: "1",
      VERCEL_PROJECT_PRODUCTION_URL: "reportly-orpin.vercel.app",
    },
    () => assert.equal(siteUrl(), "https://localhost-hub.exemple.fr")
  );
});
