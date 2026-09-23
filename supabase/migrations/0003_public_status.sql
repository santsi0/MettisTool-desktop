-- Kirjautumisruutu tarvitsee muutaman tiedon ennen kuin kukaan on kirjautunut:
-- saako rekisteröityä, vaaditaanko sähköpostivahvistus, näytetäänkö Google.
--
-- app_settings ei ole anonin luettavissa eikä pidä ollakaan. Siksi julkaistaan
-- vain nämä kolme lippua erillisellä funktiolla. Funktio ei paljasta yhtään
-- riviä mistään taulusta eikä kerro, onko käyttäjiä olemassa.

create or replace function public.public_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'registrationEnabled',
      coalesce((select value from public.app_settings where key = 'app.registration_enabled'), '1') = '1',
    'requireEmailVerification',
      coalesce((select value from public.app_settings where key = 'app.require_email_verification'), '1') = '1',
    'googleLoginEnabled',
      coalesce((select value from public.app_settings where key = 'app.google_login_enabled'), '0') = '1'
  )
$$;

revoke all on function public.public_status() from public;
grant execute on function public.public_status() to anon, authenticated;
