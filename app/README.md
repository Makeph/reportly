# Reportly — app (shell self-serve, S1)

Shell Next.js + Supabase + Stripe pour le MVP no-call de Reportly.
Couvre la **S1** du plan (`../MVP_ARCHITECTURE.md`) : auth magic-link, tenant agence,
gate d'essai/abonnement. Les sources/détections/rapports (S2+) ne sont pas encore branchés.

## Stack
- **Next.js 15** (App Router, TypeScript) — shell + portail + Stripe
- **Supabase** — Auth (magic-link) + Postgres (région **EU**) + RLS
- Worker Python (S3+) écrira via la clé service-role (hors de ce dossier)

## Prérequis
- Node.js ≥ 20
- Un projet Supabase (région EU) et un compte Stripe

## Mise en route
```bash
cd app
npm install
cp .env.example .env.local   # puis remplir les valeurs
npm run dev                  # http://localhost:3000
```

### 1. Supabase
1. Créer un projet **en région EU** (Frankfurt).
2. SQL Editor → coller `supabase/migrations/0001_init.sql` → Run.
3. Authentication → Providers → **Email** : activer, mode *magic link* (pas de mot de passe).
4. Authentication → URL Configuration → Redirect URLs : ajouter
   `http://localhost:3000/auth/callback` (et l'URL de prod plus tard).
5. Récupérer dans Project Settings → API :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (⚠️ serveur uniquement)

### 2. Stripe
1. Créer 3 produits récurrents mensuels : Starter 79 €, Growth 149 €, Pro 299 €.
2. Copier les **Price IDs** dans `STRIPE_PRICE_STARTER/GROWTH/PRO`.
3. `STRIPE_SECRET_KEY` depuis Developers → API keys.
4. Webhook → endpoint `…/api/stripe/webhook`, événements
   `customer.subscription.created|updated|deleted` → `STRIPE_WEBHOOK_SECRET`.
   En local : `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

### 3. Meta Ads (S2)
1. [developers.facebook.com](https://developers.facebook.com) → créer une app type **Business**, ajouter le produit **Marketing API**.
2. Récupérer `META_APP_ID` + `META_APP_SECRET`.
3. App settings → **Valid OAuth Redirect URIs** : `http://localhost:3000/api/connect/meta/callback`.
4. Générer la clé de chiffrement des tokens : `openssl rand -base64 32` → `TOKEN_ENCRYPTION_KEY`.
5. Lancer `0002_meta.sql` dans le SQL Editor Supabase.
6. **Avant App Review** : ajouter ton propre compte comme *testeur* de l'app (Rôles) — le scope `ads_read` marche alors en mode dev sur tes comptes, sans review publique.

Flux : `/api/connect/meta/start` (pose un state anti-CSRF) → dialog Meta → `/api/connect/meta/callback`
(échange code → token long chiffré → import des ad accounts → **audit initial**) → retour `/dashboard?connect=meta_ok&findings=N`.

### 4. Brief quotidien (S3)
1. **Resend** : créer une clé API → `RESEND_API_KEY` ; vérifier le domaine d'envoi → `BRIEF_FROM_EMAIL`.
2. `CRON_SECRET` = `openssl rand -hex 32`.
3. **Vercel** : `vercel.json` planifie `/api/cron/daily` à **05:30 UTC** (≈ 07:30 Paris l'été ; en hiver CET = 06:30 — Vercel Cron est en UTC, ajuster si besoin). Vercel ajoute automatiquement `Authorization: Bearer <CRON_SECRET>`.
4. **Test manuel** : `GET /api/cron/daily?secret=<CRON_SECRET>`.

Le cron parcourt les agences à essai/abo actif → re-scan partagé (`lib/scan.ts`) avec **machine à états**
(`lib/reconcile.ts` : new → persistent → improving → resolved) → email du brief (RAS inclus) → trace dans `brief`.

### 5. Rapport mensuel + portail (S4)
1. **Anthropic** : `ANTHROPIC_API_KEY` ; `ANTHROPIC_MODEL` par défaut `claude-haiku-4-5-20251001`.
2. Lancer `0004_report.sql`.
3. **RGPD** : seuls des **agrégats anonymisés** (dépense, variations, comptes d'incidents) sont envoyés à Claude — jamais le nom du client ni de PII. Le nom n'est réinjecté qu'à l'affichage. Pour une résidence EU stricte, basculer `lib/anthropic.ts` vers un modèle hébergé EU.
4. Génération : auto le 1er du mois (`/api/cron/monthly`, mois précédent) ou manuelle depuis le dashboard (bouton « Générer »).
5. **Portail white-label public** : `/portal/<accountId>` (liste) et `/portal/<accountId>/<période>` (rapport). Aux couleurs de l'agence (`agency.branding` jsonb : `color`, `name`, `logo`). PDF = bouton « Télécharger en PDF » → impression navigateur (styles `@media print`). Footer « Propulsé par Reportly » = boucle virale (à retirer au plan Pro).

> Note sécurité MVP : le portail est public par URL (capability URL avec uuid). Un share-token signé est un durcissement à prévoir.

## Modèle mental
- **L'essai n'utilise pas Stripe** : à l'inscription, un trigger Postgres crée l'agence
  avec `trial_ends_at = now() + 14 jours` (cohérent avec « 14 jours sans CB »).
- **Stripe sert à convertir** : `/api/stripe/checkout` crée la session, le webhook met à jour
  `subscription_status` sur l'agence. `lib/billing.ts` calcule l'accès = essai actif **ou** abonnement actif.

## Structure
```
app/
  middleware.ts            # refresh session + protège /dashboard
  lib/
    supabase/{server,client,middleware,admin}.ts
    billing.ts             # getEntitlement()
    stripe.ts
  app/
    page.tsx               # → /login ou /dashboard
    login/page.tsx         # magic-link (client)
    auth/callback/route.ts # exchangeCodeForSession
    dashboard/             # page protégée + plan-buttons + signOut
    api/stripe/{checkout,webhook}/route.ts
  supabase/migrations/0001_init.sql
```

## Reste à faire (prochains sprints)
- ~~**S2** : OAuth Meta Ads + coffre tokens + audit initial → écran findings.~~ ✅ fait
- ~~**S3** : cron 07:30 + machine à états (new/persistent/improving/resolved) + email brief (Resend).~~ ✅ fait
- ~~**S4** : rapport mensuel (synthèse Claude) + portail white-label + PDF (print).~~ ✅ fait
- **S5** : emails lifecycle + chat support + sous-domaine custom + share-token portail + KPIs enrichis (conversions/CPA/ROAS).
