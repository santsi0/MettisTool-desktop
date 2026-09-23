# MettisTool 2.0 — Supabase-taustapalvelu

Tämä hakemisto sisältää tietokannan, jonka varaan versio 2.0 rakentuu.

```
supabase/
├── migrations/
│   ├── 0001_init.sql        skeema, RLS-säännöt, hallintafunktiot
│   └── 0002_seed_owner.sql  omistajan asettaminen (ajetaan kerran)
└── tests/
    ├── stub.sql             Supabasen osat paikallista testausta varten
    └── rls_test.sh          67 testiä oikeuksille ja RLS:lle
```

---

## Mikä muuttuu

| | 1.0 | 2.0 |
| --- | --- | --- |
| Tietokanta | SQLite jokaisen koneella | **Supabase (Postgres), yksi jaettu** |
| Omistaja | jokainen asennus luo omansa | **vain sinä, asetetaan kerran SQL:llä** |
| Audit-loki | näkyy vain omalla koneella | **näet kaikkien tapahtumat** |
| Työkaludata | paikallinen | paikallinen (ei muutu) |
| Ilman verkkoa | 217 työkalua toimii | ei toimi — kirjautuminen vaatii yhteyden |

Paikallinen SQLite jää käyttöön vain työkalujen omalle datalle: muistiinpanot,
tehtävät, suosikit ja keskeneräiset syötteet. Ne eivät koskaan päädy Supabaseen.

---

## Käyttöönotto

### 1. Luo projekti

[supabase.com](https://supabase.com) → **New project**. Valitse alue läheltä
käyttäjiä (esim. `eu-central-1` Frankfurt tai `eu-north-1` Tukholma).

### 2. Aja skeema

**SQL Editor → New query** → liitä `migrations/0001_init.sql` kokonaisuudessaan
→ **Run**. Ajon jälkeen Table Editorissa pitäisi näkyä 9 taulua.

### 3. Kytke sähköposti

Supabasen oma sähköposti on rajoitettu muutamaan viestiin tunnissa — avoimeen
rekisteröitymiseen se ei riitä. Käytä Resendiä, joka on jo projektissa:

**Project Settings → Authentication → SMTP Settings**

| Kenttä | Arvo |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend-API-avaimesi |
| Sender email | osoite vahvistetusta domainista |

### 4. Vaihda viestit koodeiksi

Työpöytäsovelluksella ei ole palvelinta, jolle vahvistuslinkki palaisi. Käytä
kertakoodia linkin sijaan.

**Authentication → Email Templates** → korvaa jokaisessa pohjassa
`{{ .ConfirmationURL }}` merkinnällä `{{ .Token }}`. Sovellus kysyy koodin
samalla ruudulla kuin nyt.

> Varmista tämä Supabasen omasta ohjeesta ennen käyttöönottoa — pohjien
> muuttujat ovat Supabasen hallinnassa ja voivat muuttua.

### 5. Google-kirjautuminen (valinnainen)

**Authentication → Providers → Google.** Lisää sallittuihin
uudelleenohjausosoitteisiin `http://127.0.0.1:*/callback` — sovellus avaa
käyttäjän oman selaimen ja kuuntelee paikallista porttia, kuten nyt.

### 6. Aseta itsesi omistajaksi

Rekisteröidy ensin sovelluksesta tai **Authentication → Users → Add user** ja
vahvista osoite. Aja sitten `migrations/0002_seed_owner.sql` (vaihda osoite
tiedoston alkuun).

Tämä on **ainoa** tapa, jolla OWNER-rooli voi syntyä. Sovelluksesta käsin sitä ei
voi myöntää kenellekään — ei edes toinen omistaja voi, koska omistajia on yksi.

### 7. Avaimet sovellukseen

**Project Settings → API.** Sovellus tarvitsee kaksi arvoa:

| Arvo | Mihin |
| --- | --- |
| Project URL | sovelluksen mukaan käännösaikana |
| **anon** public key | sovelluksen mukaan käännösaikana |

`anon`-avain on suunniteltu julkiseksi. Se ei anna mitään oikeuksia itsessään —
kaikki suojaus on RLS-säännöissä, jotka on testattu erikseen.

> **`service_role`-avain ei mene koskaan sovellukseen, repositorioon eikä
> chattiin.** Se ohittaa kaikki RLS-säännöt ja antaa täyden pääsyn kaikkeen
> dataan. Se kuuluu vain Supabasen hallintapaneeliin.

---

## Turvallisuusmalli

Työpöytäsovellus on **epäluotettava asiakas**. Kuka tahansa voi purkaa binäärin,
lukea anon-avaimen ja kutsua rajapintaa suoraan. Siksi yksikään oikeustarkistus
ei ole sovelluksessa — ne ovat kaikki tietokannassa.

| Suoja | Toteutus |
| --- | --- |
| OWNER | `admin_set_role()` kieltää sen aina; lisäksi liipaisin estää myös suoran kirjoituksen, kun kutsujalla on istunto |
| Roolit | Vain ylöspäin ei voi myöntää: ylläpitäjä ei voi nostaa ketään omalle tasolleen eikä muokata vertaistaan |
| Rooli- ja tilasarakkeet | Ei kirjoitusoikeutta lainkaan — muutokset vain RPC-funktioiden kautta |
| Jäädytetty tili | `is_active()` on jokaisen kirjoitussäännön ehtona |
| Audit-loki | Luku vain ylläpidolle. Ei UPDATE- eikä DELETE-oikeutta kenellekään; siivous vain omistajan RPC:llä |
| Lokin väärentäminen | Käyttäjä voi kirjata vain omissa nimissään. `server_side`-lippua ei voi asettaa asiakkaasta |
| Kirjautumaton | `anon`-roolilla ei ole yhtään taulukko-oikeutta |

### Mihin voi luottaa ja mihin ei

Rivit, joissa `server_side = true`, on kirjannut tietokannan liipaisin. Niihin voi
luottaa silloinkin, kun käyttäjä on muokannut sovellusta. Rooli- ja tilamuutokset
kirjataan aina näin.

Muut rivit kirjaa sovellus. Muokattu asiakassovellus voi jättää kirjaamatta oman
toimintansa — se ei voi väärentää toisen nimissä eikä muuttaa jo kirjattua, mutta
se voi vaieta. Tämä on kaikkien paksun asiakkaan arkkitehtuurien ominaisuus, ei
tämän toteutuksen puute.

---

## Testit

Testit ajavat skeeman oikeaa PostgreSQL 16:ta vasten ja tarkistavat 67 väitettä:
kuka näkee mitä, kuka saa kirjoittaa, ja mitä tapahtuu kun sääntöä yritetään
kiertää.

```bash
initdb -D data -U postgres -A trust
pg_ctl -D data -o "-k $PWD" start
createdb -h $PWD -U postgres mt
psql -h $PWD -U postgres -d mt -f tests/stub.sql
psql -h $PWD -U postgres -d mt -f migrations/0001_init.sql
bash tests/rls_test.sh
```

Olennaista: RLS ei anna virhettä vaan **suodattaa rivit**. Siksi luvun estoa
testataan rivimäärällä eikä virheellä — muuten "ei virhettä" peittäisi
todellisen vuodon.
