# Reportly — Roadmap : du code au live

> État au 2026-07-29 : **S1→S5 codées, build vert**. La boucle produit complète
> est en place : signup → source de données → audit → brief quotidien → rapport mensuel → portail.
> Code dans `C:\au2\reportly\app\`. Détails techniques : `app/README.md` + `MVP_ARCHITECTURE.md`.
>
> ✅ **Fait** : Supabase branché (région EU, tables créées, magic-link opérationnel) · portail
> sécurisé par lien signé HMAC · seed de démonstration (`npm run seed:demo`) · KPIs enrichis
> (conversions, CPA, ROAS) · emails lifecycle · **import CSV** · tests du noyau.

---

## Le chemin critique en une phrase
**L'App Review Meta n'est plus bloquante pour la bêta** : l'import CSV permet à un prospect de
vivre toute la boucle produit sans aucune API tierce. La review reste nécessaire pour l'automatisation
quotidienne à grande échelle — lance-la, mais ne l'attends plus pour prendre des clients.
En attendant, tu peux aussi tester Meta en **mode dev** (toi = testeur de ton app).

---

## Phase 0 bis — La bêta sans Meta (disponible dès maintenant)
- [x] **Import CSV** (`/dashboard/import`) : le prospect dépose un export de n'importe quelle
      plateforme et obtient détections, brief, rapport et portail. Source permanente, pas un
      dépannage — elle couvrira toujours les régies jamais intégrées (Matomo, TikTok Ads, local).
- [ ] Recruter les premières agences bêta sur ce chemin, sans attendre la review.

---

## Phase 0 — Lancer le long pole AUJOURD'HUI (en parallèle de tout le reste)
- [ ] [developers.facebook.com](https://developers.facebook.com) → créer une app **Business** + produit **Marketing API**.
- [ ] Demander l'accès au scope **`ads_read`** (App Review) — délai jours→semaines.
- [ ] **Contournement immédiat** : t'ajouter comme **testeur** de l'app (Rôles) → `ads_read` marche
      sur **tes** comptes sans attendre la review. Suffisant pour toute la bêta.
- [ ] (Plus tard, 2e connecteur) demander un **developer token Google Ads** — délai encore plus long.

---

## Phase 1 — Câbler Supabase (~20 min) → débloque login + tenant + trial
- [ ] **Région EU (Frankfurt)** : vérifier que le projet est bien en EU. Sinon recréer — c'est la base
      de la promesse « données en Europe ».
- [ ] **SQL Editor** : exécuter dans l'ordre `0001_init.sql` → `0002_meta.sql` → `0003_indexes.sql` → `0004_report.sql`
      (dossier `app/supabase/migrations/`).
- [ ] **Auth → Providers → Email** : activer, mode **magic link** (pas de mot de passe).
- [ ] **Auth → URL Configuration → Redirect URLs** : ajouter `http://localhost:3000/auth/callback`.
- [ ] **Settings → API** : copier `URL`, `anon key`, `service_role key`.

---

## Phase 2 — Lancer en local (~10 min) → voir signup + dashboard
- [ ] `cd app && npm install`
- [ ] `cp .env.example .env.local` puis remplir le bloc Supabase.
- [ ] Générer les secrets : `openssl rand -base64 32` → `TOKEN_ENCRYPTION_KEY` ; `openssl rand -hex 32` → `CRON_SECRET`.
- [ ] `npm run dev` → http://localhost:3000
- [ ] **Test** : signup par lien magique → arrivée sur `/dashboard` → statut « Essai — 14 j restants ».

---

## Phase 3 — Meta en dev (~30 min) → l'activation, le « wow »
- [ ] Dans `.env.local` : `META_APP_ID`, `META_APP_SECRET`.
- [ ] App Meta → **Valid OAuth Redirect URIs** : `http://localhost:3000/api/connect/meta/callback`.
- [ ] **Test** : bouton « Connecter Meta Ads » → import des comptes → audit initial → le brief s'affiche.
      (C'est LE moment qui doit marcher sans aide — c'est tout le modèle no-call.)

---

## Phase 4 — Compléter les intégrations (~1–2 h)
- [ ] **Stripe** (conversion essai→payant) : 3 produits récurrents (79/149/299), copier les Price IDs,
      `STRIPE_SECRET_KEY`, webhook (`stripe listen --forward-to localhost:3000/api/stripe/webhook`) → `STRIPE_WEBHOOK_SECRET`.
- [ ] **Resend** (email du brief) : clé API + **domaine d'envoi vérifié** → `RESEND_API_KEY`, `BRIEF_FROM_EMAIL`.
      Test : `GET /api/cron/daily?secret=<CRON_SECRET>` → le brief arrive par mail.
- [ ] **Anthropic** (synthèse du rapport) : `ANTHROPIC_API_KEY`. Test : bouton « Générer » → ouvrir le portail
      `/portal/<accountId>/<période>`. (Sans clé, un rapport « fallback » se génère quand même.)

---

## Phase 5 — Déployer sur Vercel → INDISPENSABLE pour les crons
> Les crons (`/api/cron/daily` à 07:30, `/api/cron/monthly` le 1er) ne tournent **que déployés**.
- [ ] Push le repo (ou le sous-dossier `app/`) sur GitHub → importer dans **Vercel**.
- [ ] Reporter **toutes** les variables d'env dans Vercel (les mêmes que `.env.local`).
- [ ] Mettre `NEXT_PUBLIC_SITE_URL` = URL de prod.
- [ ] Mettre à jour les **Redirect URLs** Supabase **et** Meta avec l'URL de prod.
- [ ] DNS : pointer `app.getreportly.fr` sur Vercel.
- [ ] Vérifier dans Vercel → Cron Jobs que les 2 crons sont planifiés.

➡️ **À ce stade, le produit est live et auto-suffisant** : un prospect peut s'inscrire, connecter Meta,
recevoir son brief demain matin et son rapport en fin de mois — sans que tu décroches.

---

## Phase 6 — S5 : polish + croissance (après que la boucle tourne en vrai)

### Code (par ordre d'impact)
- [ ] **KPIs enrichis** : pull conversions/CPA/ROAS depuis Meta (aujourd'hui : dépense seule).
- [ ] **Share-token portail** : sécuriser `/portal/...` par un jeton signé (aujourd'hui : URL-capability par uuid).
- [ ] **Emails lifecycle** (Resend) : onboarding « connecte une source », « essai se termine dans 3 j »,
      « ton 1er rapport est prêt » → c'est ton « follow-up » sans appeler.
- [ ] **Chat support écrit** (Crisp/Chatwoot) : câbler le token (vide sur la landing) — ton seul canal de contact.
- [ ] **Sous-domaine white-label custom** (`rapports.agence.fr`) pour le plan Pro.
- [ ] **PDF serveur** (Playwright) si tu veux joindre le PDF à l'email (aujourd'hui : impression navigateur).

### Go-to-market (no-call)
- [ ] **Cold email** : domaine d'envoi séparé + warmup + SPF/DKIM/DMARC, listes via **Pharow/Societeinfo**,
      ~30–50/j/boîte. Le mail fait **cliquer**, l'essai fait la démo.
- [ ] **Micro-outil gratuit** en lead magnet (check tracking GA4 / budget pacing) → capture email → essai.
- [ ] **Boucle « Propulsé par Reportly »** déjà dans le portail → la laisser tourner (à retirer au Pro).
- [ ] **LinkedIn écrit** (posts fondateur + DM) en complément quasi-gratuit.

---

## Checklist variables d'environnement (`.env.local` → puis Vercel)

| Variable | Phase | Source |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | 1 | Supabase → Settings → API |
| `NEXT_PUBLIC_SITE_URL` | 2/5 | `http://localhost:3000` puis URL prod |
| `TOKEN_ENCRYPTION_KEY` | 2 | `openssl rand -base64 32` |
| `CRON_SECRET` | 2 | `openssl rand -hex 32` |
| `META_APP_ID` / `META_APP_SECRET` / `META_API_VERSION` | 3 | App Meta |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_*` | 4 | Stripe |
| `RESEND_API_KEY` / `BRIEF_FROM_EMAIL` | 4 | Resend |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | 4 | Anthropic (`claude-haiku-4-5-20251001`) |

---

## Ordre recommandé
**Aujourd'hui** : Phase 0 (Meta review) + Phases 1–2 (Supabase + local, tu vois le signup tourner ce soir).
**Cette semaine** : Phase 3 (Meta dev) + Phase 4 (Stripe/Resend/Anthropic) → boucle complète en local.
**Dès que c'est vert en local** : Phase 5 (déploiement) → tu peux prendre tes premiers clients en bêta.
**Ensuite** : Phase 6, piloté par ce que disent les premières agences.
