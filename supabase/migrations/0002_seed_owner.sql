-- MettisTool 2.0 — omistajan kylvö
--
-- Aja VASTA sen jälkeen, kun olet:
--   1. rekisteröinyt itsellesi tilin sovelluksesta tai Supabasen Authentication-
--      välilehdeltä (Add user), ja
--   2. vahvistanut sähköpostiosoitteen.
--
-- Vaihda osoite alle ja aja. Tämä on ainoa tapa, jolla OWNER-rooli voi syntyä:
-- sovelluksesta käsin sitä ei voi myöntää kenellekään, ei edes toiselle
-- omistajalle. Jos haluat myöhemmin siirtää omistajuuden, se tehdään täällä.

do $$
declare
  owner_email constant text := 'arttu.santakallio@gmail.com';  -- <== VAIHDA TARVITTAESSA
  owner_id    uuid;
  owner_name  text;
begin
  select id into owner_id from auth.users where lower(email) = lower(owner_email);

  if owner_id is null then
    raise exception 'Tilia % ei loydy. Rekisteroidy ensin.', owner_email;
  end if;

  if exists (select 1 from public.profiles where role = 'OWNER' and id <> owner_id) then
    raise exception 'Omistaja on jo asetettu. Poista vanha rooli ensin, jos haluat vaihtaa.';
  end if;

  -- auth.uid() on täällä null, joten guard_profile_write() päästää muutoksen läpi.
  update public.profiles
     set role = 'OWNER', status = 'ACTIVE'
   where id = owner_id
  returning username into owner_name;

  insert into public.audit_log
    (event, category, severity, actor_id, actor_name, target_id, target_name, meta, server_side)
  values ('OWNER_SEEDED', 'ADMIN', 'CRITICAL', null, 'palvelin', owner_id, owner_name,
          jsonb_build_object('email', owner_email), true);

  raise notice 'Omistajaksi asetettu: % (%)', owner_name, owner_email;
end $$;
