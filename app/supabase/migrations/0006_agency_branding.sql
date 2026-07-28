-- LOT 7 — le propriétaire peut modifier les réglages de son agence.
--
-- Une policy RLS filtre les LIGNES, jamais les COLONNES : sans la restriction
-- de colonnes ci-dessous, un propriétaire pourrait mettre à jour `plan`,
-- `subscription_status` ou `trial_ends_at` sur sa propre agence et s'offrir
-- un abonnement Pro perpétuel sans passer par Stripe.
-- Le webhook Stripe écrit en service-role : ses droits ne sont pas affectés.

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
