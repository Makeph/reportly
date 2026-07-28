-- LOT 6 — déduplication des emails lifecycle.

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
