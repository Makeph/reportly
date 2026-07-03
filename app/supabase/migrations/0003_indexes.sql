-- S3 — index pour le scan quotidien et le brief

create index if not exists idx_detection_account_open
  on detection (client_account_id)
  where resolved_at is null;

create index if not exists idx_metric_daily_account_date
  on metric_daily (client_account_id, date);

create index if not exists idx_agency_member_agency
  on agency_member (agency_id);

create index if not exists idx_client_account_agency
  on client_account (agency_id);
