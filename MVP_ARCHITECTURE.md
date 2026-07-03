# Reportly — Architecture MVP self-serve (no-call)

> But : vendre et onboarder **100 % en écrit**, sans appel ni démo. Au prix 79–299 €/mois,
> on est sous le seuil du sales call → le self-serve est le bon modèle.
> **Principe directeur : on code seulement le cœur (OAuth + détection + portail). Tout le reste s'achète.**
> Le temps perdu sur l'auth/billing maison est volé à l'activation.

Statut : spec de cadrage (avant build). Landing : `index3.html` (déjà alignée no-call).

---

## 1. Stack

**Recommandé — hybride :**
- **Next.js** : shell app + portail client + intégration Stripe + marketing.
- **Supabase** : Postgres + Auth (magic-link) + storage, **région EU**.
- **Worker Python** : le cerveau (pull → détection → génération de rapport), relié à la même base Postgres.

**Alternative un seul langage :** tout en **FastAPI + HTMX + Supabase-Postgres**.
Plus lent sur l'UX portail/billing, mais zéro frontière JS/Python. Défendable vu le confort Python.
→ Décision stack à acter avant la S1.

---

## 2. Carte des composants

```
[index3.html marketing]  →  [App Next.js]  ──auth/billing──>  Supabase Auth + Stripe
                                  │
                                  ▼  (même Postgres EU)
   ┌──────────────── Supabase Postgres ────────────────┐
   │  agency · user · connection · client_account       │
   │  metric_daily · detection · registry_entry         │
   │  brief · report · subscription                     │
   └────────────────────────────────────────────────────┘
                                  ▲
                  [Worker Python] │  cron 07:30 + fin-de-mois + on-connect
                     │ pull        │ écrit détections / briefs / reports
                     ▼
   APIs externes : Meta Ads / Google Ads (OAuth lecture seule)
   sorties : Resend (email) · Playwright→PDF · Claude API (synthèse)
   portail public : rapports.getreportly.fr/<agence>  (domaine custom = plan Pro)
```

---

## 3. Modèle de données (tables cœur)

| Table | Champs clés | Rôle |
|---|---|---|
| **agency** (tenant) | branding (logo/couleurs/sous-domaine), `stripe_customer_id`, plan, `trial_ends_at` | Le compte agence |
| **user** | `agency_id`, email, rôle | Membres |
| **connection** | `agency_id`, provider, `external_account_id`, tokens **chiffrés**, scopes, status | Source OAuth |
| **client_account** | `connection_id`, nom, devise, `monthly_budget` | Le client surveillé |
| **metric_daily** | `client_account_id`, date, spend, conversions, cpa, roas… | Données brutes pull |
| **detection** | type, severity, **state** (`new\|persistent\|improving\|resolved`), `opened_at`, `resolved_at`, `last_seen` | Machine à états = évite de re-crier au loup |
| **registry_entry** | type (décision/incident/priorité), daté, `result` | Le « registre 24 mois » (se remplit dès J1) |
| **report** | période, `synthesis_md`, priorité, `pdf_url`, `published_at` | Rapport mensuel |
| **subscription** | depuis webhooks Stripe | Plan + quotas |

---

## 4. Les 5 flux critiques

1. **Signup** → magic-link → bootstrap tenant → Stripe trial créé.
2. **Connect** → consent OAuth → token chiffré → job `initial_audit` → pull 30-90 j → détections déterministes → **findings affichés en direct**.
   → *C'est l'activation, le « wow ». À soigner plus que tout : si l'agence ne touche pas un résultat en quelques minutes sans aide, le no-call meurt.*
3. **Daily 07:30** (cron) → pull veille → détections → réconciliation machine à états → brief → email Resend.
4. **Fin de mois** (cron) → extrait registre → **synthèse Claude** → rendu HTML → **PDF Playwright** → publie au portail → email du lien.
5. **Billing** → Stripe Checkout (trial, CB optionnelle) → webhook → quotas par plan (**3 / 20 / ∞** clients).

---

## 5. Build vs Buy

| Brique | Décision |
|---|---|
| Auth (magic-link), DB, storage | **Buy** — Supabase (EU) |
| Billing, trial, annulation self-serve | **Buy** — Stripe Billing + Customer Portal |
| Email transactionnel | **Buy** — Resend / Postmark |
| Cron + orchestration de jobs | **Buy** — Inngest / Trigger.dev (zéro infra) |
| Synthèse rapport | **Buy (API)** — Claude (Haiku pour le coût) |
| Support écrit | **Buy** — Crisp / Chatwoot |
| **Connecteurs OAuth** | **Build — cœur** |
| **Moteur de détection** | **Build — cœur** |
| **Portail white-label + PDF** | **Build — cœur** |

---

## 6. ⚠️ Le long pole n'est pas le code : c'est la validation API

- **Meta** : Marketing API + **App Review** pour `ads_read` (screencast + business verification) → jours/semaines.
- **Google Ads** : **Developer Token** (via compte MCC) + vérification OAuth (CASA pour scopes restreints) → potentiellement plus long/coûteux.
- **À lancer en S0 (aujourd'hui), en parallèle du code.**
- **Mitigation bêta** : en attendant la review, ajouter les 5-10 agences pilotes comme **testeurs de l'app** (mode dev, pas de review publique requise) → bêta no-call possible **sans attendre la validation**.
- **Connecteur #1 = Meta Ads** (douleur « budget cramé vendredi » nette, review souvent plus rapide).
  #2 = Google Ads. #3 = GA4 (débloque la détection tracking-à-zéro cross-source).

---

## 7. ⚠️ Point RGPD à trancher (avant S4)

Le site promet *« données en Europe »*, mais la **synthèse passe par l'API Claude (US)** avec des métriques clients dedans. Options :
- (a) DPA + déclaration du sous-traitant ;
- (b) modèle **hébergé EU** (Mistral EU, ou Claude via Vertex/Bedrock région EU) ;
- (c) n'envoyer que des **agrégats non-PII**.

---

## 8. Ordre de sprints

| Sprint | Contenu |
|---|---|
| **S0** (auj., non-code, //) | App Review Meta + dev token Google ; projet Supabase EU ; compte Stripe |
| **S1** | Shell : auth magic-link + tenant + trial Stripe + déploiement |
| **S2** | OAuth Meta + coffre tokens + pull spend/budget + audit auto + écran findings **(activation)** |
| **S3** | Cron 07:30 + détections budget-pacing & anomalie + machine à états + email brief |
| **S4** | Rapport mensuel (Claude) + portail + PDF + email |
| **S5** | Emails lifecycle + chat + sous-domaine white-label + polish |

**Défère explicitement :** GA4/Search Console/Matomo/LinkedIn, Slack, dérive statistique, domaine custom (sous-domaine d'abord), profondeur « 24 mois » (s'accumule avec le temps).

---

## 9. Le copy = la spec (cahier de recette)

Les promesses de `index3.html` deviennent les critères d'acceptation :
- **« Configuration en 12 minutes »** → onboarding chronométrable, OAuth en 2 clics, zéro humain.
- **« Premier brief demain matin 07:30 »** → cron + email opérationnels dès J+1.
- **« L'analyse initiale trouve presque toujours quelque chose »** → l'audit auto (flux #2) doit produire ≥1 finding crédible sur un compte réel.
- **« Lecture seule / données en Europe / export + suppression »** → scopes read-only, Supabase EU, endpoints export + hard delete.
- **« Annulable à tout moment depuis votre compte »** → Stripe Customer Portal câblé.

---

## 10. Go-to-market no-call (rappel)

- **Le mail ne persuade pas, il fait cliquer.** L'essai gratuit fait la démo tout seul.
- **Cold email** = levier principal des 20-50 premiers clients (domaine d'envoi séparé, warmup, SPF/DKIM/DMARC, ~30-50/j/boîte, Pharow/Societeinfo pour la data FR ; RGPD B2B : adresses de rôle, opt-out clair).
- **Boucles qui composent** (à ajouter) :
  - **« powered by Reportly »** sur le portail white-label → boucle virale agence→agence (réserver le sans-marque au Pro).
  - **Micro-outil gratuit** en lead magnet (check tracking GA4 / budget pacing) → capture email → essai.
- **LinkedIn écrit** (posts fondateur + DM) en complément quasi-gratuit.
