-- MettisTool 2.0 — tietokannan perusta
--
-- Aja tämä Supabasen SQL-editorissa kerran, ylhäältä alas.
--
-- Turvallisuusperiaate: työpöytäsovellus on epäluotettava asiakas. Se saa mukaansa
-- vain julkisen anon-avaimen, joten KAIKKI oikeustarkistukset tehdään täällä
-- RLS-säännöillä ja SECURITY DEFINER -funktioilla. Muokattu asiakassovellus ei
-- pääse käsiksi mihinkään, mitä nämä säännöt eivät salli.
--
-- OWNER-rooli on rakenteellisesti mahdoton myöntää sovelluksesta käsin: sekä
-- admin_set_role() että guard_profile_write()-liipaisin kieltävät sen aina, kun
-- kutsujalla on istunto. Omistaja asetetaan kerran tiedostossa 0002_seed_owner.sql.

-- ===========================================================================
-- 1. Tyypit
-- ===========================================================================

create type public.app_role      as enum ('USER', 'MODERATOR', 'ADMIN', 'OWNER');
create type public.account_status as enum ('ACTIVE', 'DISABLED');

-- ===========================================================================
-- 2. Taulut
-- ===========================================================================

create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  username             text not null unique
                         check (char_length(username) between 3 and 32),
  role                 public.app_role      not null default 'USER',
  status               public.account_status not null default 'ACTIVE',
  language             text not null default 'fi' check (char_length(language) = 2),
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now(),
  last_seen_at         timestamptz
);
comment on table public.profiles is 'Käyttäjän julkinen profiili ja rooli. auth.users hoitaa tunnistautumisen.';

create table public.permissions (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  permission text not null,
  granted    boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (user_id, permission)
);
comment on table public.permissions is 'Roolin ylittävät käyttäjäkohtaiset poikkeukset.';

create table public.devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  device_key    text not null,
  os            text,
  os_version    text,
  arch          text,
  app_version   text,
  locale        text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (user_id, device_key)
);
comment on column public.devices.device_key is
  'Satunnainen tunnus, jonka asennus luo itselleen. Ei laitteiston sormenjälki.';

create table public.app_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  device_id    uuid references public.devices (id) on delete set null,
  started_at   timestamptz not null default now(),
  last_ping_at timestamptz not null default now(),
  ended_at     timestamptz
);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  ts          timestamptz not null default now(),
  event       text not null,
  severity    text not null default 'INFO'
                check (severity in ('INFO', 'NOTICE', 'WARNING', 'CRITICAL')),
  category    text not null default 'SYSTEM'
                check (category in ('AUTH', 'SECURITY', 'ADMIN', 'SYSTEM', 'TOOL')),
  result      text not null default 'SUCCESS'
                check (result in ('SUCCESS', 'FAILURE')),
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_name  text,
  target_id   uuid references public.profiles (id) on delete set null,
  target_name text,
  app_version text,
  os          text,
  device_id   uuid references public.devices (id) on delete set null,
  meta        jsonb,
  server_side boolean not null default false
);
comment on column public.audit_log.server_side is
  'true = kirjattu tietokannan liipaisimesta. Näihin riveihin voi luottaa myös silloin, '
  'kun asiakassovellusta on muokattu; asiakkaan itse kirjaamiin riveihin ei.';

create index audit_log_ts_idx       on public.audit_log (ts desc);
create index audit_log_actor_idx    on public.audit_log (actor_id, ts desc);
create index audit_log_event_idx    on public.audit_log (event);
create index audit_log_category_idx on public.audit_log (category, ts desc);

create table public.tool_usage (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  tool_id   text not null,
  opened_at timestamptz not null default now(),
  device_id uuid references public.devices (id) on delete set null
);
create index tool_usage_user_idx on public.tool_usage (user_id, opened_at desc);
create index tool_usage_tool_idx on public.tool_usage (tool_id, opened_at desc);

create table public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create table public.notifications (
  id      bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade, -- null = kaikille
  ts      timestamptz not null default now(),
  kind    text not null default 'INFO',
  title   text not null,
  body    text
);
create index notifications_user_idx on public.notifications (user_id, ts desc);

create table public.notification_reads (
  notification_id bigint not null references public.notifications (id) on delete cascade,
  user_id         uuid   not null references public.profiles (id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

-- ===========================================================================
-- 3. Apufunktiot
--
-- search_path = '' pakottaa skeemakohtaiset viittaukset, jolloin funktiota ei
-- voi kaapata luomalla samannimistä taulua toiseen skeemaan.
-- ===========================================================================

create or replace function public.role_rank(r public.app_role)
returns int language sql immutable parallel safe as $$
  select case r
    when 'OWNER'     then 4
    when 'ADMIN'     then 3
    when 'MODERATOR' then 2
    else 1
  end
$$;

create or replace function public.my_profile()
returns public.profiles
language sql stable security definer set search_path = '' as $$
  select * from public.profiles where id = auth.uid()
$$;

-- Aktiivinen = kirjautunut JA tili ei ole jäädytetty. Tämä on jokaisen
-- RLS-säännön perusehto: jäädytetty tili ei pääse mihinkään käsiksi.
create or replace function public.is_active()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'ACTIVE'
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'ACTIVE'
      and public.role_rank(role) >= 3
  )
$$;

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'ACTIVE' and role = 'OWNER'
  )
$$;

-- ===========================================================================
-- 4. Liipaisimet
-- ===========================================================================

-- Profiili syntyy automaattisesti rekisteröitymisen yhteydessä.
-- Käyttäjänimi tulee signup-kutsun metatiedoista; törmäys ratkaistaan liitteellä.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  base    text;
  attempt text;
  n       int := 0;
begin
  base := lower(regexp_replace(
            coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), 'kayttaja'),
            '[^a-z0-9_.-]', '', 'g'));
  if char_length(base) < 3 then
    base := 'kayttaja';
  end if;
  base := left(base, 26);
  attempt := base;

  loop
    begin
      insert into public.profiles (id, username, language)
      values (
        new.id,
        attempt,
        coalesce(nullif(new.raw_user_meta_data ->> 'language', ''), 'fi')
      );
      exit;
    exception when unique_violation then
      n := n + 1;
      if n > 50 then
        attempt := base || '_' || left(replace(new.id::text, '-', ''), 8);
        insert into public.profiles (id, username, language)
        values (new.id, attempt,
                coalesce(nullif(new.raw_user_meta_data ->> 'language', ''), 'fi'));
        exit;
      end if;
      attempt := base || n::text;
    end;
  end loop;

  insert into public.audit_log (event, category, severity, actor_id, actor_name, server_side)
  values ('ACCOUNT_CREATED', 'AUTH', 'NOTICE', new.id, attempt, true);

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Roolia ja tilaa ei saa muuttaa suoraan asiakkaasta, ja OWNERia ei saa myöntää
-- koskaan istunnon kautta. auth.uid() on null vain palvelinpuolelta (SQL-editori),
-- jossa omistaja kylvetään kerran.
create or replace function public.guard_profile_write()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;                      -- palvelinpuoli: sallitaan
  end if;

  if new.role is distinct from old.role and new.role = 'OWNER' then
    raise exception 'owner_role_cannot_be_granted';
  end if;
  if old.role = 'OWNER' and new.role is distinct from old.role then
    raise exception 'owner_role_cannot_be_removed';
  end if;

  -- Suora UPDATE saa muuttaa vain käyttäjän omia, harmittomia kenttiä.
  -- Roolit, tila ja pakotettu salasanan vaihto kulkevat RPC-funktioiden kautta,
  -- jotka ohittavat tämän liipaisimen asettamalla app.privileged-lipun.
  if coalesce(current_setting('app.privileged', true), '') <> 'on' then
    if new.role                 is distinct from old.role
    or new.status               is distinct from old.status
    or new.must_change_password is distinct from old.must_change_password
    or new.id                   is distinct from old.id then
      raise exception 'forbidden_column_write';
    end if;
  end if;

  return new;
end $$;

create trigger profiles_guard_write
  before update on public.profiles
  for each row execute function public.guard_profile_write();

-- Rooli- ja tilamuutokset kirjataan tietokannassa, ei sovelluksessa.
create or replace function public.log_profile_change()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor text;
begin
  select username into actor from public.profiles where id = auth.uid();

  if new.role is distinct from old.role then
    insert into public.audit_log
      (event, category, severity, actor_id, actor_name, target_id, target_name, meta, server_side)
    values ('ROLE_CHANGED', 'ADMIN', 'CRITICAL', auth.uid(), actor, new.id, new.username,
            jsonb_build_object('from', old.role, 'to', new.role), true);
  end if;

  if new.status is distinct from old.status then
    insert into public.audit_log
      (event, category, severity, actor_id, actor_name, target_id, target_name, meta, server_side)
    values ('ACCOUNT_STATUS_CHANGED', 'ADMIN', 'WARNING', auth.uid(), actor, new.id, new.username,
            jsonb_build_object('from', old.status, 'to', new.status), true);
  end if;

  return new;
end $$;

create trigger profiles_log_change
  after update on public.profiles
  for each row execute function public.log_profile_change();

-- ===========================================================================
-- 5. Oikeudet ja RLS
-- ===========================================================================

alter table public.profiles           enable row level security;
alter table public.permissions        enable row level security;
alter table public.devices            enable row level security;
alter table public.app_sessions       enable row level security;
alter table public.audit_log          enable row level security;
alter table public.tool_usage         enable row level security;
alter table public.app_settings       enable row level security;
alter table public.notifications      enable row level security;
alter table public.notification_reads enable row level security;

-- Supabase antaa uusille public-tauluille oletusoikeudet sekä anon- että
-- authenticated-roolille. Otetaan ne kaikki pois ja annetaan takaisin vain se,
-- mitä RLS-säännöt tarvitsevat. RLS estäisi rivit joka tapauksessa, mutta
-- päällekkäinen suojaus tarkoittaa, ettei yksi unohtunut sääntö riitä vuotoon.
--
-- anon = kirjautumaton. Sovellus vaatii kirjautumisen, joten anon ei tarvitse
-- yhtään mitään.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

revoke all on all tables in schema public from authenticated;

-- Sarakekohtaiset oikeudet: profiilista saa päivittää vain kielen, nimen ja
-- viimeisimmän näkymisen. Roolia ei voi edes yrittää kirjoittaa.
grant select on public.profiles to authenticated;
grant update (username, language, last_seen_at) on public.profiles to authenticated;

grant select, insert         on public.audit_log          to authenticated;
grant select                 on public.app_settings       to authenticated;
grant select                 on public.permissions        to authenticated;
grant select, insert, update on public.devices            to authenticated;
grant select, insert, update on public.app_sessions       to authenticated;
grant select, insert         on public.tool_usage         to authenticated;
grant select, insert         on public.notifications      to authenticated;
grant select, insert         on public.notification_reads to authenticated;

grant usage on all sequences in schema public to authenticated;

-- --- profiles ---
create policy "profiili: oma tai yllapitajalle"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiili: paivita vain oma"
  on public.profiles for update to authenticated
  using (id = auth.uid() and public.is_active())
  with check (id = auth.uid());

-- --- permissions ---
create policy "oikeudet: oma tai yllapitajalle"
  on public.permissions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Kirjoitus vain RPC:n kautta, ei suoraa policya.

-- --- devices ---
create policy "laitteet: oma tai yllapitajalle"
  on public.devices for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "laitteet: lisaa oma"
  on public.devices for insert to authenticated
  with check (user_id = auth.uid() and public.is_active());

create policy "laitteet: paivita oma"
  on public.devices for update to authenticated
  using (user_id = auth.uid() and public.is_active())
  with check (user_id = auth.uid());

-- --- app_sessions ---
create policy "istunnot: oma tai yllapitajalle"
  on public.app_sessions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "istunnot: lisaa oma"
  on public.app_sessions for insert to authenticated
  with check (user_id = auth.uid() and public.is_active());

create policy "istunnot: paivita oma"
  on public.app_sessions for update to authenticated
  using (user_id = auth.uid() and public.is_active())
  with check (user_id = auth.uid());

-- --- audit_log ---
-- Luku vain ylläpidolle. Kirjoitus omissa nimissä; server_side-rivejä ei voi väärentää.
create policy "audit: luku yllapidolle"
  on public.audit_log for select to authenticated
  using (public.is_admin());

create policy "audit: kirjaa omissa nimissa"
  on public.audit_log for insert to authenticated
  with check (
    actor_id = auth.uid()
    and public.is_active()
    and server_side = false
  );

-- Päivitys ja poisto eivät ole sallittuja kenellekään: loki ei muutu jälkikäteen.
-- Vanhentuneiden rivien siivous tapahtuu prune_audit()-funktiolla.

-- --- tool_usage ---
create policy "tyokalut: oma tai yllapitajalle"
  on public.tool_usage for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "tyokalut: kirjaa oma"
  on public.tool_usage for insert to authenticated
  with check (user_id = auth.uid() and public.is_active());

-- --- app_settings ---
create policy "asetukset: luku kaikille kirjautuneille"
  on public.app_settings for select to authenticated
  using (true);

-- Kirjoitus vain RPC:n kautta.

-- --- notifications ---
create policy "ilmoitukset: omat ja yleiset"
  on public.notifications for select to authenticated
  using (user_id is null or user_id = auth.uid() or public.is_admin());

create policy "ilmoitukset: lisays yllapidolle"
  on public.notifications for insert to authenticated
  with check (public.is_admin());

create policy "kuittaukset: omat"
  on public.notification_reads for select to authenticated
  using (user_id = auth.uid());

create policy "kuittaukset: merkitse omat"
  on public.notification_reads for insert to authenticated
  with check (user_id = auth.uid() and public.is_active());

-- ===========================================================================
-- 6. Hallintafunktiot
--
-- Nämä ovat ainoa tie roolien, tilan ja asetusten muuttamiseen. Jokainen
-- tarkistaa kutsujan arvon erikseen — RLS ei yksin riitä arvojärjestykseen.
-- ===========================================================================

create or replace function public.admin_set_role(target uuid, new_role public.app_role)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  caller public.app_role;
  victim public.app_role;
begin
  select role into caller from public.profiles where id = auth.uid() and status = 'ACTIVE';
  select role into victim from public.profiles where id = target;

  if caller is null or victim is null then
    raise exception 'not_found';
  end if;
  if new_role = 'OWNER' then
    raise exception 'owner_role_cannot_be_granted';
  end if;
  if victim = 'OWNER' then
    raise exception 'owner_cannot_be_changed';
  end if;
  if public.role_rank(caller) < 3 then
    raise exception 'forbidden';
  end if;
  -- Vain itseä alemmas: ylläpitäjä ei voi muokata vertaistaan eikä nostaa
  -- ketään omalle tasolleen.
  if public.role_rank(caller) <= public.role_rank(victim)
  or public.role_rank(caller) <= public.role_rank(new_role) then
    raise exception 'forbidden';
  end if;

  perform set_config('app.privileged', 'on', true);
  update public.profiles set role = new_role where id = target;
  perform set_config('app.privileged', 'off', true);
end $$;

create or replace function public.admin_set_status(target uuid, new_status public.account_status)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  caller public.app_role;
  victim public.app_role;
begin
  select role into caller from public.profiles where id = auth.uid() and status = 'ACTIVE';
  select role into victim from public.profiles where id = target;

  if caller is null or victim is null then raise exception 'not_found'; end if;
  if victim = 'OWNER' then raise exception 'owner_cannot_be_changed'; end if;
  if public.role_rank(caller) < 3 then raise exception 'forbidden'; end if;
  if public.role_rank(caller) <= public.role_rank(victim) then raise exception 'forbidden'; end if;

  perform set_config('app.privileged', 'on', true);
  update public.profiles set status = new_status where id = target;
  perform set_config('app.privileged', 'off', true);
end $$;

create or replace function public.admin_set_permission(
  target uuid, perm text, value boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  caller public.app_role;
  victim public.app_role;
begin
  select role into caller from public.profiles where id = auth.uid() and status = 'ACTIVE';
  select role into victim from public.profiles where id = target;

  if caller is null or victim is null then raise exception 'not_found'; end if;
  if public.role_rank(caller) < 3 then raise exception 'forbidden'; end if;
  if public.role_rank(caller) <= public.role_rank(victim) then raise exception 'forbidden'; end if;

  insert into public.permissions (user_id, permission, granted, updated_by)
  values (target, perm, value, auth.uid())
  on conflict (user_id, permission)
    do update set granted = excluded.granted,
                  updated_at = now(),
                  updated_by = excluded.updated_by;

  insert into public.audit_log
    (event, category, severity, actor_id, target_id, meta, server_side)
  values ('PERMISSION_CHANGED', 'ADMIN', 'WARNING', auth.uid(), target,
          jsonb_build_object('permission', perm, 'granted', value), true);
end $$;

create or replace function public.owner_set_setting(k text, v text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'forbidden'; end if;

  insert into public.app_settings (key, value, updated_by)
  values (k, v, auth.uid())
  on conflict (key) do update
    set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;

  insert into public.audit_log (event, category, severity, actor_id, meta, server_side)
  values ('SETTINGS_CHANGED', 'ADMIN', 'NOTICE', auth.uid(),
          jsonb_build_object('key', k), true);
end $$;

create or replace function public.prune_audit(keep_days int)
returns int
language plpgsql security definer set search_path = '' as $$
declare removed int;
begin
  if not public.is_owner() then raise exception 'forbidden'; end if;
  if keep_days < 7 then raise exception 'keep_days_too_small'; end if;

  delete from public.audit_log where ts < now() - make_interval(days => keep_days);
  get diagnostics removed = row_count;

  insert into public.audit_log (event, category, severity, actor_id, meta, server_side)
  values ('AUDIT_PRUNED', 'ADMIN', 'NOTICE', auth.uid(),
          jsonb_build_object('keep_days', keep_days, 'removed', removed), true);
  return removed;
end $$;

-- Sovelluksen aloitusnäkymä yhdellä kutsulla: kuka olen, mitä saan tehdä.
create or replace function public.me()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',        p.id,
    'username',  p.username,
    'email',     u.email,
    'role',      p.role,
    'status',    p.status,
    'language',  p.language,
    'mustChangePassword', p.must_change_password,
    'createdAt', p.created_at,
    'permissions', coalesce(
      (select jsonb_object_agg(permission, granted)
         from public.permissions where user_id = p.id), '{}'::jsonb)
  )
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = auth.uid()
$$;

-- Yleiskuvan tilastot yhdellä kyselyllä, vain ylläpidolle.
create or replace function public.admin_stats()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.is_admin() then null else jsonb_build_object(
    'users',          (select count(*) from public.profiles),
    'active',         (select count(*) from public.profiles where status = 'ACTIVE'),
    'admins',         (select count(*) from public.profiles where public.role_rank(role) >= 3),
    'devices',        (select count(*) from public.devices),
    'sessions7d',     (select count(*) from public.app_sessions where started_at > now() - interval '7 days'),
    'auditTotal',     (select count(*) from public.audit_log),
    'audit24h',       (select count(*) from public.audit_log where ts > now() - interval '24 hours'),
    'failedLogins24h',(select count(*) from public.audit_log
                        where ts > now() - interval '24 hours' and result = 'FAILURE' and category = 'AUTH'),
    'toolOpens7d',    (select count(*) from public.tool_usage where opened_at > now() - interval '7 days')
  ) end
$$;

grant execute on function
  public.me(), public.admin_stats(), public.admin_set_role(uuid, public.app_role),
  public.admin_set_status(uuid, public.account_status),
  public.admin_set_permission(uuid, text, boolean),
  public.owner_set_setting(text, text), public.prune_audit(int)
to authenticated;

-- ===========================================================================
-- 7. Oletusasetukset
-- ===========================================================================

insert into public.app_settings (key, value) values
  ('app.registration_enabled',       '1'),
  ('app.require_email_verification', '1'),
  ('app.google_login_enabled',       '0'),
  ('app.audit_keep_days',            '365'),
  ('app.telemetry_notice_version',   '1')
on conflict (key) do nothing;
