-- S4 — rapport mensuel : snapshot des KPIs + structure de synthèse (immutable).
alter table report
  add column if not exists kpis jsonb;
