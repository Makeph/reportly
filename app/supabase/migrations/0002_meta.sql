-- S2 — support Meta Ads / audit initial

-- Expiration du token long (≈60 j) pour savoir quand le rafraîchir.
alter table connection
  add column if not exists token_expires_at timestamptz;

-- Idempotence de l'import des comptes (upsert sur agency_id + external_id).
alter table client_account
  drop constraint if exists client_account_agency_external_uniq;
alter table client_account
  add constraint client_account_agency_external_uniq unique (agency_id, external_id);
