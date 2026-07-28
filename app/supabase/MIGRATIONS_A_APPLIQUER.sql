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


-- -------------------------------------------------------------
-- 0006 — Le propriétaire peut modifier les réglages de son agence
--
-- Sans ceci, agency.branding est en lecture seule : aucune agence
-- ne peut choisir sa couleur ni son logo, et tous les portails
-- clients affichent le bleu par défaut de Reportly.
--
-- Une policy RLS filtre les LIGNES, jamais les COLONNES. Le grant
-- restreint donc explicitement l'écriture à (name, branding) :
-- sans lui, un propriétaire pourrait passer son agence en plan Pro
-- et repousser trial_ends_at sans jamais payer.
-- Le webhook Stripe écrit en service-role, il n'est pas concerné.
-- -------------------------------------------------------------

revoke update on agency from authenticated, anon;
grant update (name, branding) on agency to authenticated;

drop policy if exists agency_update on agency;
create policy agency_update on agency
  for update using (
    id in (select my_agency_ids())
    and id in (
      select agency_id
      from agency_member
      where user_id = auth.uid() and role = 'owner'
    )
  )
  with check (
    id in (select my_agency_ids())
    and id in (
      select agency_id
      from agency_member
      where user_id = auth.uid() and role = 'owner'
    )
  );


-- =============================================================
-- Vérifications rapides après exécution :
--
--   select count(*) from lifecycle_event;   -- doit renvoyer 0
--
--   select grantee, privilege_type, column_name
--   from information_schema.column_privileges
--   where table_name = 'agency' and grantee = 'authenticated'
--     and privilege_type = 'UPDATE';
--   -- doit renvoyer exactement 2 lignes : name et branding
--
-- =============================================================
