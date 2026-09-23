#!/bin/bash
# RLS- ja oikeustestit MettisToolin Supabase-skeemalle.
#
# Huom: RLS ei anna virhettä vaan suodattaa rivit. Siksi luvun estoa testataan
# rivimäärällä, ei virheellä — muuten "ei virhettä" peittäisi todellisen vuodon.
export PATH=/usr/lib/postgresql/16/bin:$PATH
D=/home/claude/pgtest
PSQL="psql -h $D -U postgres -d mt -qtA"
pass=0; fail=0

sup() { $PSQL -v ON_ERROR_STOP=1 -c "$*" 2>&1; }          # palvelinpuoli, ohittaa RLS:n

as() {                                                     # ajo authenticated/anon-roolissa
  local uid="$1"; shift
  local role="authenticated" setclaim=""
  [ "$uid" = "anon" ] && role="anon"
  [ "$uid" != "-" ] && [ "$uid" != "anon" ] && setclaim="set local request.jwt.claim.sub = '$uid';"
  $PSQL -v ON_ERROR_STOP=1 <<SQL 2>&1
begin;
set local role $role;
$setclaim
$*
rollback;
SQL
}

ok()  { local d="$1" u="$2"; shift 2; local o; o=$(as "$u" "$@")
        if echo "$o" | grep -qi "^ERROR\|^psql:.*ERROR"; then
          echo "  EI OK  $d"; echo "         $(echo "$o"|grep -i error|head -1)"; fail=$((fail+1))
        else echo "  ok     $d"; pass=$((pass+1)); fi; }

err() { local d="$1" u="$2"; shift 2; local o; o=$(as "$u" "$@")
        if echo "$o" | grep -qi "ERROR"; then
          echo "  ok     $d  [$(echo "$o"|grep -iom1 -E 'owner_role_cannot_be_granted|owner_cannot_be_changed|forbidden[a-z_]*|keep_days_too_small|permission denied for [a-z ]+|violates row-level security[a-z ]*|not_found')]"
          pass=$((pass+1))
        else echo "  EI OK  $d  — EI ESTETTY!"; fail=$((fail+1)); fi; }

eq()  { local d="$1" w="$2" u="$3"; shift 3; local g; g=$(as "$u" "$@"|tr -d '[:space:]')
        if [ "$g" = "$w" ]; then echo "  ok     $d  ($g)"; pass=$((pass+1))
        else echo "  EI OK  $d — odotettiin '$w', saatiin '$g'"; fail=$((fail+1)); fi; }

seq_() { local d="$1" w="$2"; local g; g=$(sup "$3"|tr -d '[:space:]')
         if [ "$g" = "$w" ]; then echo "  ok     $d  ($g)"; pass=$((pass+1))
         else echo "  EI OK  $d — odotettiin '$w', saatiin '$g'"; fail=$((fail+1)); fi; }

# rivit: UPDATE/DELETE, joka RLS:n takia ei osu mihinkään -> 0 riviä, ei virhettä
rows0() { local d="$1" u="$2"; shift 2
          local o; o=$(as "$u" "with x as ($* returning 1) select count(*) from x;")
          local n; n=$(echo "$o"|tr -d '[:space:]')
          if [ "$n" = "0" ]; then echo "  ok     $d  (0 rivia)"; pass=$((pass+1))
          elif echo "$o"|grep -qi ERROR; then echo "  ok     $d  [virhe]"; pass=$((pass+1))
          else echo "  EI OK  $d — muutti $n rivia!"; fail=$((fail+1)); fi; }

O=11111111-1111-1111-1111-111111111111
A=22222222-2222-2222-2222-222222222222
M=33333333-3333-3333-3333-333333333333
U1=44444444-4444-4444-4444-444444444444
U2=55555555-5555-5555-5555-555555555555
DIS=66666666-6666-6666-6666-666666666666

echo "=== Kayttajien luonti (liipaisin luo profiilit) ==="
sup "insert into auth.users (id,email,raw_user_meta_data) values
 ('$O','owner@test.fi','{\"username\":\"omistaja\"}'),
 ('$A','admin@test.fi','{\"username\":\"yllapitaja\"}'),
 ('$M','mod@test.fi','{\"username\":\"moderaattori\"}'),
 ('$U1','u1@test.fi','{\"username\":\"matti\"}'),
 ('$U2','u2@test.fi','{\"username\":\"matti\"}'),
 ('$DIS','dis@test.fi','{\"username\":\"jaadytetty\"}'),
 ('77777777-7777-7777-7777-777777777777','weird@test.fi','{\"username\":\"!!\"}');" >/dev/null
seq_ "7 profiilia syntyi automaattisesti" "7" "select count(*) from public.profiles;"
seq_ "nimitormays sai liitteen" "matti1" "select username from public.profiles where id='$U2';"
seq_ "kelvoton nimi korvattiin" "kayttaja" "select username from public.profiles where id='77777777-7777-7777-7777-777777777777';"

echo
echo "=== Omistajan kylvo ==="
sed "s/arttu.santakallio@gmail.com/owner@test.fi/" $D/0002_seed_owner.sql > $D/seed_test.sql
$PSQL -v ON_ERROR_STOP=1 -f $D/seed_test.sql 2>&1 | grep -i "notice" | head -1
seq_ "omistaja asetettu" "OWNER" "select role from public.profiles where id='$O';"
sup "update public.profiles set role='ADMIN' where id='$A';
     update public.profiles set role='MODERATOR' where id='$M';
     update public.profiles set status='DISABLED' where id='$DIS';" >/dev/null
seq_ "roolit paikallaan" "ADMIN" "select role from public.profiles where id='$A';"
$PSQL -f $D/seed_test.sql >/dev/null 2>&1
if sed "s/owner@test.fi/admin@test.fi/" $D/seed_test.sql | $PSQL 2>&1 | grep -qi "Omistaja on jo asetettu"; then
  echo "  ok     toista omistajaa ei voi kylvaa"; pass=$((pass+1))
else echo "  EI OK  toista omistajaa ei voi kylvaa"; fail=$((fail+1)); fi

echo
echo "=== Profiilien nakyvyys (rivimaarat) ==="
eq "kayttaja nakee vain itsensa"     "1" $U1 "select count(*) from public.profiles;"
eq "moderaattori nakee vain itsensa" "1" $M  "select count(*) from public.profiles;"
eq "yllapitaja nakee kaikki"         "7" $A  "select count(*) from public.profiles;"
eq "omistaja nakee kaikki"           "7" $O  "select count(*) from public.profiles;"
eq "kayttaja ei nae toisen sahkopostia" "0" $U1 "select count(*) from public.profiles where id='$U2';"

echo
echo "=== Roolin ja tilan kirjoitussuojaus ==="
err   "kayttaja ei voi korottaa itseaan"  $U1 "update public.profiles set role='ADMIN' where id='$U1';"
err   "kayttaja ei voi avata jaadytettya" $U1 "update public.profiles set status='ACTIVE' where id='$U1';"
ok    "kayttaja saa vaihtaa kielen"       $U1 "update public.profiles set language='en' where id='$U1';"
rows0 "kayttaja ei voi muokata toista"    $U1 "update public.profiles set language='sv' where id='$U2'"
rows0 "jaadytetty ei voi muuttaa mitaan"  $DIS "update public.profiles set language='en' where id='$DIS'"

echo
echo "=== OWNER on rakenteellisesti mahdoton myontaa ==="
err "omistaja ei voi myontaa OWNERia"       $O  "select public.admin_set_role('$U1','OWNER');"
err "yllapitaja ei voi myontaa OWNERia"     $A  "select public.admin_set_role('$U1','OWNER');"
err "yllapitaja ei voi muuttaa omistajaa"   $A  "select public.admin_set_role('$O','USER');"
err "yllapitaja ei voi jaadyttaa omistajaa" $A  "select public.admin_set_status('$O','DISABLED');"
err "yllapitaja ei voi nostaa vertaiseksi"  $A  "select public.admin_set_role('$U1','ADMIN');"
err "moderaattori ei voi muuttaa rooleja"   $M  "select public.admin_set_role('$U1','MODERATOR');"
err "kayttaja ei voi muuttaa rooleja"       $U1 "select public.admin_set_role('$U2','ADMIN');"
err "jaadytetty yllapitaja ei toimi"        $DIS "select public.admin_set_role('$U1','MODERATOR');"
ok  "yllapitaja voi nostaa moderaattoriksi" $A  "select public.admin_set_role('$U1','MODERATOR');"

echo
echo "=== Audit-loki ==="
eq  "kayttaja ei nae yhtaan lokirivia"   "0" $U1 "select count(*) from public.audit_log;"
eq  "moderaattori ei nae lokirivia"      "0" $M  "select count(*) from public.audit_log;"
ok  "yllapitaja nakee lokin"             $A  "select count(*) from public.audit_log;"
ok  "kayttaja saa kirjata omissa nimissaan" $U1 \
    "insert into public.audit_log (event,category,actor_id) values ('TEST','SYSTEM','$U1');"
err "kayttaja ei voi kirjata toisen nimissa" $U1 \
    "insert into public.audit_log (event,category,actor_id) values ('TEST','SYSTEM','$U2');"
err "server_side-lippua ei voi vaarentaa" $U1 \
    "insert into public.audit_log (event,category,actor_id,server_side) values ('T','SYSTEM','$U1',true);"
err "lokirivia ei voi muuttaa"  $A "update public.audit_log set event='X' where id=(select min(id) from public.audit_log);"
err "lokirivia ei voi poistaa"  $O "delete from public.audit_log where id=(select min(id) from public.audit_log);"
err "yllapitaja ei voi siivota" $A "select public.prune_audit(30);"
ok  "omistaja voi siivota"      $O "select public.prune_audit(30);"
err "liian lyhyt sailytysaika"  $O "select public.prune_audit(3);"
seq_ "roolimuutos kirjattiin palvelinpuolelta" "t" \
  "select server_side from public.audit_log where event='ROLE_CHANGED' order by id desc limit 1;"

echo
echo "=== Jaadytetty tili ==="
eq  "jaadytetty nakee oman profiilinsa"   "1" $DIS "select count(*) from public.profiles;"
err "jaadytetty ei voi kirjata lokiin"    $DIS "insert into public.audit_log (event,category,actor_id) values ('T','SYSTEM','$DIS');"
err "jaadytetty ei voi kirjata tyokaluja" $DIS "insert into public.tool_usage (user_id,tool_id) values ('$DIS','x');"

echo
echo "=== Tyokalukaytto ==="
ok  "kayttaja kirjaa oman tyokalunsa"        $U1 "insert into public.tool_usage (user_id,tool_id) values ('$U1','json');"
err "kayttaja ei voi kirjata toisen nimissa" $U1 "insert into public.tool_usage (user_id,tool_id) values ('$U2','json');"
sup "insert into public.tool_usage (user_id,tool_id) values ('$U2','salainen');" >/dev/null
eq  "kayttaja ei nae toisen tyokaluja"   "0" $U1 "select count(*) from public.tool_usage where user_id='$U2';"
ok  "yllapitaja nakee kaikkien tyokalut"     $A  "select count(*) from public.tool_usage;"

echo
echo "=== Asetukset ==="
ok  "kirjautuneet lukevat asetukset"      $U1 "select count(*) from public.app_settings;"
err "kayttaja ei kirjoita asetuksia"      $U1 "update public.app_settings set value='0' where key='app.registration_enabled';"
err "yllapitaja ei kirjoita asetuksia"    $A  "select public.owner_set_setting('app.registration_enabled','0');"
ok  "omistaja kirjoittaa asetuksia"       $O  "select public.owner_set_setting('app.registration_enabled','0');"

echo
echo "=== me() ja tilastot ==="
eq "me() palauttaa roolin"        "USER"       $U1 "select public.me()->>'role';"
eq "me() palauttaa sahkopostin"   "u1@test.fi" $U1 "select public.me()->>'email';"
eq "me() omistajalle"             "OWNER"      $O  "select public.me()->>'role';"
eq "admin_stats yllapitajalle"    "7"          $A  "select public.admin_stats()->>'users';"
eq "admin_stats kayttajalle tyhja" ""          $U1 "select coalesce(public.admin_stats()::text,'');"

echo
echo "=== Kirjautumaton (anon-rooli) ==="
err "anon ei paase profiileihin"  anon "select count(*) from public.profiles;"
err "anon ei paase audit-lokiin"  anon "select count(*) from public.audit_log;"
err "anon ei paase asetuksiin"    anon "select count(*) from public.app_settings;"
err "anon ei paase tyokaluihin"   anon "select count(*) from public.tool_usage;"
err "anon ei paase laitteisiin"   anon "select count(*) from public.devices;"
err "anon ei paase istuntoihin"   anon "select count(*) from public.app_sessions;"
err "anon ei paase oikeuksiin"    anon "select count(*) from public.permissions;"
err "anon ei paase ilmoituksiin"  anon "select count(*) from public.notifications;"
err "anon ei voi kirjoittaa"      anon "insert into public.tool_usage (user_id,tool_id) values ('$U1','x');"
seq_ "anonilla ei ole yhtaan taulukko-oikeutta" "0" \
  "select count(*) from information_schema.role_table_grants where grantee='anon' and table_schema='public';"
seq_ "authenticated ei voi tyhjentaa tauluja" "0" \
  "select count(*) from information_schema.role_table_grants where grantee='authenticated' and table_schema='public' and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER');"
seq_ "authenticated ei voi poistaa rivaja" "0" \
  "select count(*) from information_schema.role_table_grants where grantee='authenticated' and table_schema='public' and privilege_type='DELETE';"

echo
echo "=== Istunto ilman JWT:ta (authenticated, ei sub-claimia) ==="
eq "ei nae profiileja"  "0" - "select count(*) from public.profiles;"
eq "ei nae lokia"       "0" - "select count(*) from public.audit_log;"

echo
echo "==================================="
echo "  lapi: $pass    epaonnistui: $fail"
echo "==================================="
[ $fail -eq 0 ]
