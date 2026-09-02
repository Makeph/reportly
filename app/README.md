# Reportly — application SaaS pour agences

Reportly est un SaaS français self-service pour les agences. La boucle produit est
opérationnelle : authentification par magic-link, sources Meta Ads et import CSV,
détections avec machine à états, brief quotidien, rapport mensuel, portail client
white-label signé et révocable, réglages d'agence, emails lifecycle et tests du noyau.

## Stack
- **Next.js 16** (App Router, TypeScript) — dashboard, API et portail client
- **Supabase** — Auth (magic-link) + Postgres (région **EU**) + RLS
- **Stripe** — essai, abonnements et webhooks
- **Resend + Anthropic** — emails transactionnels et synthèses mensuelles

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
2. SQL Editor → exécuter les migrations `supabase/migrations/0001_init.sql`
   à `0006_agency_branding.sql`, dans l'ordre.
3. Authentication → Providers → **Email** : activer, mode *magic link* (pas de mot de passe).
4. Authentication → URL Configuration → Redirect URLs : ajouter
   `http://localhost:3000/auth/callback` (et l'URL de prod plus tard).
5. Récupérer dans Project Settings → API :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (⚠️ serveur uniquement)
6. Authentication → Emails → Templates : coller `supabase/templates/*.html`
   dans les templates du même nom. Ces emails partent de Supabase, pas de
   l'app : sans cette étape, le premier message que reçoit un inscrit garde le
   gabarit par défaut. Régénérer après un changement de charte avec
   `npm run emails:auth` — ils partagent la coquille de `lib/email-theme.ts`
   avec les emails applicatifs.
   ⚠️ **Confirm signup** est le template du *premier* email : `signInWithOtp`
   crée le compte quand l'adresse est inconnue, et Supabase envoie alors
   celui-là. **Magic link** ne sert qu'aux connexions suivantes.
7. Project Settings → Authentication → SMTP Settings : brancher Resend
   (`smtp.resend.com`, port 465, user `resend`, mot de passe = `RESEND_API_KEY`)
   avec l'adresse d'envoi de votre domaine. Sans SMTP personnalisé, ces emails
   partent d'un domaine Supabase — délivrabilité moindre, et un expéditeur
   inconnu au moment précis où l'utilisateur attend le lien.

### 2. Stripe
1. Créer 3 produits récurrents mensuels : Starter 79 €, Growth 149 €, Pro 299 €.
2. Copier les **Price IDs** dans `STRIPE_PRICE_STARTER/GROWTH/PRO`.
3. `STRIPE_SECRET_KEY` depuis Developers → API keys.
4. Webhook → endpoint `…/api/stripe/webhook`, événements
   `customer.subscription.created|updated|deleted` → `STRIPE_WEBHOOK_SECRET`.
   En local : `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

### 3. Meta Ads
1. [developers.facebook.com](https://developers.facebook.com) → créer une app type **Business**, ajouter le produit **Marketing API**.
2. Récupérer `META_APP_ID` + `META_APP_SECRET`.
3. App settings → **Valid OAuth Redirect URIs** : `http://localhost:3000/api/connect/meta/callback`.
4. Générer la clé de chiffrement des tokens : `openssl rand -base64 32` → `TOKEN_ENCRYPTION_KEY`.
5. **Avant App Review** : ajouter ton propre compte comme *testeur* de l'app (Rôles) — le scope `ads_read` marche alors en mode dev sur tes comptes, sans review publique.

Flux : `/api/connect/meta/start` (pose un state anti-CSRF) → dialog Meta → `/api/connect/meta/callback`
(échange code → token long chiffré → import des ad accounts → **audit initial**) → retour `/dashboard?connect=meta_ok&findings=N`.

### 4. Brief quotidien
1. **Resend** : créer une clé API → `RESEND_API_KEY` ; vérifier le domaine d'envoi → `BRIEF_FROM_EMAIL`.
   Voir « DNS d'envoi » ci-dessous : la cohabitation avec le MX Plan OVH a un piège.
2. `CRON_SECRET` = `openssl rand -hex 32`.
3. **Vercel** : `vercel.json` planifie `/api/cron/daily` à **05:30 UTC** (≈ 07:30 Paris l'été ; en hiver CET = 06:30 — Vercel Cron est en UTC, ajuster si besoin). Vercel ajoute automatiquement `Authorization: Bearer <CRON_SECRET>`.
4. **Test manuel** :
   ```bash
   curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/daily
   ```

Le cron parcourt les agences à essai/abo actif → re-scan partagé (`lib/scan.ts`) avec **machine à états**
(`lib/reconcile.ts` : new → persistent → improving → resolved) → email du brief (RAS inclus) → trace dans `brief`.

#### DNS d'envoi — Resend à côté du MX Plan OVH

Le domaine reçoit via **OVH MX Plan** (offre *redirect* : des redirections, pas de
boîtes) et envoie via **Resend**. Les deux cohabitent sans conflit, à condition de
ne pas « réparer » ce qui n'est pas cassé.

| Enregistrement | Rôle |
| --- | --- |
| `getreportly.fr` MX → `mx*.mail.ovh.net` | réception OVH |
| `getreportly.fr` TXT → `v=spf1 include:mx.ovh.com ~all` | SPF **OVH seul — à laisser tel quel** |
| `resend._domainkey` TXT | signature DKIM Resend |
| `send.getreportly.fr` TXT → `v=spf1 include:amazonses.com ~all` | SPF du Return-Path Resend |
| `send.getreportly.fr` MX → `feedback-smtp.<région>.amazonses.com` | retour des bounces |

⚠️ **Ne pas ajouter Resend au SPF de la racine.** SPF s'évalue sur le domaine
d'enveloppe, que Resend place sur `send.` — déjà autorisé. L'alignement DMARC passe,
lui, par DKIM (`d=getreportly.fr`, aligné avec le `From`). Ajouter un second
enregistrement SPF le casserait (`PermError`), et modifier celui d'OVH menacerait les
redirections.

Deux points faciles à oublier :

- **Le MX de bounce sur `send.`** doit exister, avec la région du compte Resend telle
  qu'affichée dans Resend → Domains. Sans lui, les rejets ne reviennent jamais et la
  réputation d'envoi se dégrade sans signal.
- **Les adresses d'envoi doivent être redirigées côté OVH.** Le MX Plan n'a pas de
  boîtes : sans redirection, une réponse d'un client à `brief@` — ou un rapport DMARC
  envoyé à l'adresse du `rua` — n'arrive nulle part.

`_dmarc` peut rester en `p=none` le temps de lire quelques semaines de rapports, puis
passer à `p=quarantine`.

### 5. Rapport mensuel + portail
1. **Anthropic** : `ANTHROPIC_API_KEY` ; `ANTHROPIC_MODEL` par défaut `claude-haiku-4-5-20251001`.
2. **RGPD** : seuls des **agrégats anonymisés** (dépense, variations, comptes d'incidents) sont envoyés à Claude — jamais le nom du client ni de PII. Le nom n'est réinjecté qu'à l'affichage. Pour une résidence EU stricte, basculer `lib/anthropic.ts` vers un modèle hébergé EU.
3. Génération : auto le 1er du mois (`/api/cron/monthly`, mois précédent) ou manuelle depuis le dashboard (bouton « Générer »).
4. **Portail white-label partagé** : `/portal/<accountId>` (liste) et `/portal/<accountId>/<période>` (rapport). Aux couleurs de l'agence (`agency.branding` jsonb : `color`, `name`, `logo`, `portalTokenVersion`). PDF = bouton « Télécharger en PDF » → impression navigateur (styles `@media print`). Footer « Propulsé par Reportly » = boucle virale, masquée sur le plan Pro.

> Le portail exige un share-token HMAC signé et versionné par agence. Le propriétaire
> peut révoquer tous les liens déjà partagés depuis les réglages, sans changer le secret global.

## Modèle mental
- **L'essai n'utilise pas Stripe** : à l'inscription, un trigger Postgres crée l'agence
  avec `trial_ends_at = now() + 14 jours` (cohérent avec « 14 jours sans CB »).
- **Stripe sert à convertir** : `/api/stripe/checkout` crée la session, le webhook met à jour
  `subscription_status` sur l'agence. `lib/billing.ts` calcule l'accès = essai actif **ou** abonnement actif.

## Structure
```
app/
  app/
    api/                    # connexions, imports, crons, Stripe et rapports
    dashboard/              # comptes, détections, rapports et réglages
    portal/                 # portail client white-label
  lib/                      # détection, briefs, rapports, emails et sécurité
  supabase/migrations/      # schéma Postgres et policies RLS
  tests/                    # tests du noyau métier
```

## Vérification
```bash
npx --no-install tsc --noEmit
npm test
```

## Reste à faire (prochains sprints)
- Finaliser l'App Review Meta pour connecter les comptes de production à grande échelle.
- Ajouter le chat support écrit et les sous-domaines white-label personnalisés.
- Générer les PDF côté serveur si l'envoi en pièce jointe devient nécessaire ; le portail
  propose déjà l'impression PDF depuis le navigateur.
