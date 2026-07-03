-- Reportly MVP — schéma initial
-- À exécuter dans le SQL Editor Supabase (ou via `supabase db push`).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists agency (
  id                     uuid primary key default gen_random_uuid(),
  name                   text,
  slug                   text unique,
  branding               jsonb default '{}'::jsonb,
  plan                   text default 'trial',
  trial_ends_at          timestamptz default (now() + interval '14 days'),
  stripe_customer_id     text,
  stripe_subscription_id text,
  subscription_status    text,
  current_period_end     timestamptz,
  created_at             timestamptz default now()
);

create table if not exists agency_member (
  agency_id  uuid references agency(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  role       text default 'owner',
  created_at timestamptz default now(),
  primary key (agency_id, user_id)
);

create table if not exists connection (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid references agency(id) on delete cascade,
  provider            text not null,            -- 'meta' | 'google_ads' | 'ga4' ...
  external_account_id text,
  access_token        text,                     -- À CHIFFRER au repos (pgsodium/Vault ou app-level)
  refresh_token       text,                     -- idem
  scopes              text,
  status              text default 'active',
  connected_at        timestamptz default now()
);

create table if not exists client_account (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid references agency(id) on delete cascade,
  connection_id uuid references connection(id) on delete set null,
  name          text not null,
  external_id   text,
  currency      text default 'EUR',
  monthly_budget numeric,
  created_at    timestamptz default now()
);

create table if not exists metric_daily (
  id                bigint generated always as identity primary key,
  client_account_id uuid references client_account(id) on delete cascade,
  date              date not null,
  spend             numeric,
  conversions       numeric,
  cpa               numeric,
  roas              numeric,
  sessions          numeric,
  leads             numeric,
  raw               jsonb,
  unique (client_account_id, date)
);

create table if not exists detection (
  id                uuid primary key default gen_random_uuid(),
  client_account_id uuid references client_account(id) on delete cascade,
  type              text not null,             -- budget_pacing | spend_anomaly | tracking_zero | drift
  severity          text not null,             -- red | amber | green
  state             text not null default 'new', -- new | persistent | improving | resolved
  title             text,
  body              text,
  opened_at         timestamptz default now(),
  last_seen         timestamptz default now(),
  resolved_at       timestamptz
);

create table if not exists registry_entry (
  id                uuid primary key default gen_random_uuid(),
  client_account_id uuid references client_account(id) on delete cascade,
  kind              text not null,             -- decision | incident | priority
  title             text,
  body              text,
  status            text default 'open',
  result            text,
  dated_at          timestamptz default now(),
  resolved_at       timestamptz
);

create table if not exists brief (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid references agency(id) on delete cascade,
  brief_date date not null,
  counts     jsonb,
  sent_at    timestamptz,
  unique (agency_id, brief_date)
);

create table if not exists report (
  id                uuid primary key default gen_random_uuid(),
  client_account_id uuid references client_account(id) on delete cascade,
  period            text not null,             -- 'YYYY-MM'
  synthesis_md      text,
  priority          text,
  pdf_url           text,
  published_at      timestamptz,
  sent_at           timestamptz,
  unique (client_account_id, period)
);

-- ---------------------------------------------------------------------------
-- Bootstrap tenant à l'inscription : crée l'agence + le membership owner.
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_agency_id uuid;
begin
  insert into agency (name)
  values (coalesce(new.raw_user_meta_data->>'agency_name', 'Mon agence'))
  returning id into new_agency_id;

  insert into agency_member (agency_id, user_id, role)
  values (new_agency_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS — l'app (clé anon) lit/écrit via ces policies.
-- Le worker et les webhooks utilisent la clé service-role → contournent la RLS.
-- ---------------------------------------------------------------------------

create or replace function my_agency_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select agency_id from agency_member where user_id = auth.uid()
$$;

alter table agency         enable row level security;
alter table agency_member  enable row level security;
alter table connection     enable row level security;
alter table client_account enable row level security;
alter table metric_daily   enable row level security;
alter table detection      enable row level security;
alter table registry_entry enable row level security;
alter table brief          enable row level security;
alter table report         enable row level security;

create policy agency_select on agency
  for select using (id in (select my_agency_ids()));

create policy agency_member_select on agency_member
  for select using (user_id = auth.uid());

create policy connection_rw on connection
  for all using (agency_id in (select my_agency_ids()))
  with check (agency_id in (select my_agency_ids()));

create policy client_account_rw on client_account
  for all using (agency_id in (select my_agency_ids()))
  with check (agency_id in (select my_agency_ids()));

create policy metric_daily_ro on metric_daily
  for select using (
    client_account_id in (select id from client_account where agency_id in (select my_agency_ids()))
  );

create policy detection_ro on detection
  for select using (
    client_account_id in (select id from client_account where agency_id in (select my_agency_ids()))
  );

create policy registry_ro on registry_entry
  for select using (
    client_account_id in (select id from client_account where agency_id in (select my_agency_ids()))
  );

create policy brief_ro on brief
  for select using (agency_id in (select my_agency_ids()));

create policy report_ro on report
  for select using (
    client_account_id in (select id from client_account where agency_id in (select my_agency_ids()))
  );
