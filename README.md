# MettisTool

**Professional Utility Suite** — asennettava Windows-työpöytäsovellus, jossa on
**221 työkalua 13 moduulissa**, oikea käyttäjähallinta ja täysi audit-loki.
Kaikki käsittely tapahtuu omalla koneellasi: tiedot tallennetaan paikalliseen
SQLite-tietokantaan eikä mitään lähetetä verkkoon, ellei jokin yksittäinen
työkalu sitä erikseen tarvitse.

---

## Sisältö

- [Valmiin sovelluksen asennus](#valmiin-sovelluksen-asennus)
- [Ensikäynnistys](#ensikäynnistys)
- [Ominaisuudet](#ominaisuudet)
- [Kääntäminen itse](#kääntäminen-itse)
- [Arkkitehtuuri](#arkkitehtuuri)
- [Turvallisuus](#turvallisuus)
- [Sähköposti, Google ja Discord](#sähköposti-google-ja-discord)
- [Tietojen sijainti ja varmuuskopiot](#tietojen-sijainti-ja-varmuuskopiot)
- [Kielet](#kielet)
- [Vianetsintä](#vianetsintä)
- [Lisenssi](#lisenssi)

---

## Valmiin sovelluksen asennus

1. Avaa repositorion **Releases**-sivu.
2. Lataa **`MettisTool-Setup.exe`** ja aja se. Asennus tehdään käyttäjäkohtaisesti,
   joten järjestelmänvalvojan oikeuksia ei tarvita.
   Vaihtoehtoisesti voit ladata **`MettisTool.exe`**, joka toimii ilman asennusta.
3. Tarkista halutessasi latauksen eheys `SHA256SUMS.txt`-tiedostosta:

   ```powershell
   Get-FileHash .\MettisTool-Setup.exe -Algorithm SHA256
   ```

**Vaatimukset:** Windows 10 (1809) tai uudempi, 64-bittinen.
Sovellus käyttää Windowsin omaa WebView2-komponenttia, joka on valmiina
Windows 11:ssä ja useimmissa Windows 10 -koneissa. Jos se puuttuu, asennusohjelma
noutaa sen automaattisesti.

> Sovellusta ei ole allekirjoitettu koodivarmenteella, joten Windows SmartScreen
> voi näyttää varoituksen ensimmäisellä käynnistyskerralla. Valitse
> *Lisätiedot → Suorita silti*, tai tarkista tarkistussumma yllä olevalla komennolla.

---

## Ensikäynnistys

Ensimmäisellä käynnistyksellä sovellus pyytää luomaan **omistajatilin (OWNER)**.

- Omistajatili voidaan luoda **vain** tässä vaiheessa. Sen jälkeen omistajan
  roolin voi myöntää ainoastaan toinen omistaja — ei rekisteröitymällä eikä
  ylläpitäjän toimesta.
- Omistaja näkee koko hallintapaneelin ja voi luoda muita käyttäjiä.

Muut käyttäjät voivat luoda tilin itse (jos rekisteröityminen on sallittu
hallintapaneelissa) tai ylläpitäjä voi luoda tilin ja lähettää kutsun.

---

## Ominaisuudet

### Työkalut

| Moduuli | Esimerkkejä |
| --- | --- |
| Laskurit | prosentit, laina, ALV, yksikkömuunnokset, tilastot |
| Kehittäjä | JSON, Base64, JWT, regex, UUID, cron, diff |
| Teksti | muunnokset, analyysi, siivous, sanalaskuri |
| Kuvat | pakkaus, muunnos, rajaus, EXIF, väripoiminta |
| Tiedostot | tiivisteet, muunnokset, tarkastelu |
| Turvallisuus | salasanat, hashit, TOTP, vuototarkistus |
| Web | URL, DNS, otsakkeet, robots.txt, sivukartta |
| Design | värit, gradientit, varjot, CSS |
| Data | CSV, JSON, taulukot, tilastot |
| Aika | aikavyöhykkeet, ajastimet, päivämäärät |
| Tuottavuus | muistiinpanot, tehtävät, pomodoro |
| Verkko | IP, portit, aliverkot, kantaluvut |
| Tekniikka | fysiikka, sähkö, mekaniikka |

Työkalut toimivat **kokonaan paikallisesti**. Neljä työkalua käyttää valinnaisesti
julkista rajapintaa (valuuttakurssit, DNS-kysely, oma IP-osoite, salasanavuotojen
tarkistus k-anonymiteetillä); ne kertovat verkkotarpeesta selkeästi ja muut
työkalut toimivat myös ilman verkkoa.

### Käyttäjähallinta

- Sähköposti + salasana, valinnainen **Google-kirjautuminen**
- **Kaksivaiheinen tunnistautuminen** (TOTP) ja palautuskoodit
- Roolit **USER · MODERATOR · ADMIN · OWNER** ja 12 tarkempaa oikeutta
- Istuntojen hallinta: näet omat istuntosi ja voit katkaista ne
- Salasanan palautus ja sähköpostin vahvistus kertakäyttöisillä koodeilla

### Hallintapaneeli

Yleiskuva tilastoineen ja 14 päivän kaavioineen, käyttäjien hallinta,
ylläpitotilit, turvallisuusasetukset, audit-loki (haku, suodatus, CSV-vienti),
sähköpostiasetukset, Discord-lokitus, järjestelmätiedot ja varmuuskopiot.

### Muuta

- Teemat: tumma, tummempi, vaalea, järjestelmän mukaan + 5 korostusväriä
- 12 käyttöliittymäkieltä
- Ilmaisinalueen kuvake, käynnistys Windowsin mukana, ilmoitukset
- Päivitystarkistus GitHub Releasesista (ei koskaan automaattista asennusta)

---

## Kääntäminen itse

### Vaihtoehto 1 — GitHub Actions (suositeltu)

Repositoriossa on valmis työnkulku, joka kääntää sovelluksen oikealla
Windows-koneella eikä vaadi sinulta mitään asennuksia.

1. Työnnä koodi omaan GitHub-repositorioosi. Työnkulku on tiedostossa
   `.github/workflows/build-windows.yml`. Jos sait projektin ilman `.github`-kansiota,
   luo se ja kopioi sisältö tiedostosta `build-windows-workflow.yml.txt`.
2. Avaa **Actions → Rakenna Windows-sovellus → Run workflow**.
3. Noin 10–15 minuutin kuluttua lataa tulokset kohdasta *Artifacts*:
   `MettisTool.exe`, `MettisTool-Setup.exe`, `SHA256SUMS.txt`.

Kun työnnät version-tagin, sama työnkulku julkaisee tiedostot automaattisesti
Release-sivulle:

```bash
git tag v1.0.0
git push origin v1.0.0
```

### Vaihtoehto 2 — oma Windows-kone

Tarvitset:

- [Node.js 20+](https://nodejs.org/)
- [Rust (stable)](https://rustup.rs/)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) —
  työkuorma *Desktop development with C++*
- WebView2 (valmiina Windows 11:ssä)

```bash
npm install
npm run start        # kehitystila, automaattinen uudelleenlataus
npm run build:win    # tuottaa .exe:n ja asennuspaketin
```

Valmiit tiedostot:

```
src-tauri/target/release/MettisTool.exe
src-tauri/target/release/bundle/nsis/MettisTool_1.0.0_x64-setup.exe
```

Muut komennot:

```bash
npm run typecheck    # TypeScript-tarkistus
cargo clippy         # Rust-lint (hakemistossa src-tauri)
```

---

## Arkkitehtuuri

```
MettisTool
├── src/                 React + TypeScript -käyttöliittymä
│   ├── api/             typoitu IPC-kerros (vastaa 1:1 Rustin komentoja)
│   ├── i18n/            käännösjärjestelmä + 12 kielitiedostoa
│   ├── screens/         kirjautuminen, etusivu, tili, asetukset, hallinta
│   ├── shell/           yläpalkki, sivupalkki, sovelluskuori
│   ├── state/           istunto, teema, reititys, ilmoitukset, työkalut
│   ├── tools/           työkalumoottorin lataus ja tyypit
│   └── ui/              käyttöliittymäpalikat ja ikonit
├── public/tools/        työkalumoottori ja 221 työkalua (vanilla JS)
└── src-tauri/           Rust-taustalogiikka
    ├── src/auth/        salasanat, istunnot, tokenit, TOTP, OAuth, rajoitukset
    ├── src/commands/    IPC-komennot (tunnistautuminen, tili, hallinta, työkalut)
    ├── src/db/          SQLite, migraatiot, tietomallit
    └── src/*.rs         RBAC, auditointi, sähköposti, Discord, varmuuskopiot
```

**Perusperiaate:** käyttöliittymässä ei ole yhtäkään turvallisuuspäätöstä.
Frontend näyttää ja piilottaa asioita käytettävyyden vuoksi, mutta jokainen
komento tarkistaa Rust-puolella istunnon, roolin, tilin tilan ja oikeudet
uudelleen tietokannasta. Frontendin manipulointi ei anna lisäoikeuksia.

Työkalumoottori on erillinen kerros: se saa käyttöönsä vain oman tallennustilansa
(`tool_state`-taulu käyttäjäkohtaisesti) eikä näe istuntoa, tokeneita eikä
salaisuuksia.

---

## Turvallisuus

| Asia | Toteutus |
| --- | --- |
| Salasanat | Argon2id (m = 19 MiB, t = 2, p = 1), satunnainen suola. Ei koskaan selkokielisenä, ei lokiin, ei Discordiin. |
| Kirjautuminen | Vakioaikainen vertailu, valeverifiointi tuntemattomalle tilille, kirjautumisyritysten rajoitus ja tilin lukitus. |
| Istunnot | Token luodaan satunnaisesti, tallennetaan tietokantaan **SHA-256-tiivisteenä**. Raakatoken ei koskaan kulje IPC:n yli käyttöliittymälle. |
| “Muista minut” | Pitkäikäinen token vain käyttöjärjestelmän salatussa avainsäilössä. |
| Koodit | Vahvistus-, palautus- ja kutsukoodit ovat kryptografisesti satunnaisia, kertakäyttöisiä, vanhenevia ja tietokannassa tiivisteinä. |
| 2FA | TOTP (RFC 6238). Avain avainsäilössä, palautuskoodit Argon2-tiivisteinä. |
| Salaisuudet | Resend-avain, Google-tunnukset ja Discord-webhook vain käyttöjärjestelmän avainsäilössä. Käyttöliittymä näyttää vain peitetyn muodon. |
| Oikeudet | Tarkistetaan aina palvelinkerroksessa. OWNER-roolia ei voi saada rekisteröitymällä; vain omistaja voi myöntää sen. Viimeistä omistajaa ei voi poistaa. |
| Tietokanta | Kaikki kyselyt parametrisoituja. Ei merkkijonojen yhdistelyä SQL:ään. |
| Auditointi | Jokainen turvallisuus- ja hallintatapahtuma kirjataan. Lokista suodatetaan automaattisesti salasanat, tiivisteet, tokenit ja avaimet. |
| Discord | Lähetys on valinnainen ja tapahtuu taustalla. Lähetettävä viesti käy saman suodatuksen läpi — salaisuuksia ei koskaan lähetetä. |
| Verkko | Sisältöturvakäytäntö (CSP) sallii vain neljä nimettyä rajapintaa. Muut yhteydet estetään selaimen tasolla. |
| Google | Authorization Code + PKCE ja paikallinen takaisinkutsu. **Sovellus ei koskaan kysy eikä tallenna Google-salasanaa.** |

Jos löydät tietoturvaongelman, ilmoita siitä repositorion Issues-sivulla —
älä liitä mukaan oikeita tunnuksia tai lokitiedostoja.

---

## Sähköposti, Google ja Discord

Kaikki kolme ovat **valinnaisia**. Ilman niitä sovellus toimii täysin, mutta:

- ilman sähköpostia vahvistus- ja palautuskoodeja ei voi lähettää
  (ylläpitäjä voi vahvistaa tilin ja asettaa salasanan käsin),
- ilman Google-tunnuksia Google-kirjautuminen ei näy kirjautumisruudussa,
- ilman webhookia Discord-lokitus on pois käytöstä.

Asetukset tehdään sovelluksen sisällä: **Hallinta → Sähköposti / Turvallisuus / Discord**.
Tiedot tallentuvat käyttöjärjestelmän avainsäilöön. `.env.example` kuvaa
vaihtoehtoiset ympäristömuuttujat kehityskäyttöä varten.

### Sähköpostikoodit, ei linkkejä

Työpöytäsovelluksessa ei ole palvelinta, jolle selain voisi palata. Siksi
vahvistus-, palautus- ja kutsuviestit sisältävät **koodin**, jonka kirjoitat
sovellukseen. Koodi on kertakäyttöinen ja vanhenee.

---

## Tietojen sijainti ja varmuuskopiot

Tietokanta ja varmuuskopiot ovat käyttäjäprofiilissasi:

```
%APPDATA%\fi.mettistool.desktop\
```

Pääset kansioon suoraan sovelluksesta: **Asetukset → Tietokansio → Avaa tietokansio**.

- Automaattinen varmuuskopio tehdään enintään kerran vuorokaudessa käynnistyksen
  yhteydessä (voi kytkeä pois hallintapaneelista).
- Manuaalisen varmuuskopion voi luoda kohdassa **Hallinta → Järjestelmä**.
- Palautus on omistajan oikeus. Ennen palautusta nykyisistä tiedoista tehdään
  turvakopio automaattisesti.
- Sovelluksen poistaminen ei poista tietokantaa. Voit poistaa kansion käsin,
  jos haluat hävittää kaiken.

---

## Kielet

Käyttöliittymä on saatavilla 12 kielellä: **suomi, englanti, ruotsi, saksa,
ranska, espanja, italia, portugali, hollanti, puola, norja ja tanska**.
Kielen voi vaihtaa kirjautumisruudussa ja kohdassa **Asetukset → Kieli**.

Käännökset ovat tiedostoissa `src/i18n/locales/*.json`. Uuden kielen lisääminen:
kopioi `fi.json`, käännä arvot ja lisää kieli `src/i18n/index.tsx`-tiedoston
`LANGUAGES`-listaan sekä Rustin `util::valid_language`-funktioon.

> Työkalujen nimet, kuvaukset ja niiden omat tekstit ovat suomeksi. Käyttöliittymän
> muut osat — kirjautuminen, kuori, tili, asetukset, hallintapaneeli ja
> työkalunäkymän ohjaimet — noudattavat valittua kieltä.

---

## Vianetsintä

**Sovellus ei käynnisty tai ikkuna jää mustaksi**
WebView2 puuttuu. Asenna se Microsoftin sivulta (“Evergreen Standalone Installer”).

**Unohdin omistajatilin salasanan eikä sähköpostia ole määritetty**
Sulje sovellus, siirrä tietokanta `%APPDATA%\fi.mettistool.desktop\mettistool.db`
talteen ja käynnistä sovellus uudelleen — ensikäynnistys alkaa alusta. Vanhat
tiedot säilyvät siirtämässäsi tiedostossa.

**Sähköpostit eivät lähde**
Tarkista **Hallinta → Sähköposti**: API-avain, lähettäjän osoite (domainin on
oltava vahvistettu Resendissä) ja viimeisin virheilmoitus.

**Google-kirjautuminen epäonnistuu**
Varmista, että OAuth-asiakas on tyyppiä *Desktop app*. Selain avautuu erikseen;
sovellus ei koskaan kysy Google-salasanaa.

**Tarkistan mitä sovellus tekee**
Käynnistä komentoriviltä lokitason kanssa:

```powershell
$env:METTISTOOL_LOG="debug"; .\MettisTool.exe
```

---

## Lisenssi

MIT. Katso [LICENSE](LICENSE).
