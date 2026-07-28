-- =============================================================
-- Migrations à appliquer dans Supabase → SQL Editor → Run.
-- Ce fichier regroupe les migrations postérieures à SETUP.sql.
-- Il est REJOUABLE : l'exécuter deux fois ne casse rien.
--
-- Pourquoi manuellement : la clé service-role passe par PostgREST,
-- qui n'exécute pas de DDL. Seuls le SQL Editor ou une connexion
-- Postgres directe peuvent créer des tables et des policies.
-- =============================================================


-- -------------------------------------------------------------
-- 0005 — Déduplication des emails lifecycle
--
-- Sans cette table, une agence en essai sans source connectée
-- reçoit l'email « connectez votre première source » CHAQUE JOUR.
-- La contrainte d'unicité (agency_id, kind) est ce qui garantit
-- qu'un email de cycle de vie ne part qu'une seule fois.
-- Aucune policy d'écriture : seul le cron, en service-role, écrit.
-- -------------------------------------------------------------

create table if not exists lifecycle_event (
  id        uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agency(id) on delete cascade,
  kind      text not null,
  sent_at   timestamptz default now(),
  unique (agency_id, kind)
);

alter table lifecycle_event enable row level security;

drop policy if exists lifecycle_event_ro on lifecycle_event;
create policy lifecycle_event_ro on lifecycle_event
  for select using (agency_id in (select my_agency_ids()));


-- =============================================================
-- Vérification rapide après exécution :
--
--   select count(*) from lifecycle_event;   -- doit renvoyer 0
--
-- =============================================================
