# Muutosloki

Kaikki merkittävät muutokset kirjataan tähän tiedostoon.
Versiointi noudattaa [semanttista versiointia](https://semver.org/lang/fi/).

## [1.0.0] — 2026-09-23

Ensimmäinen julkaisu: MettisTool asennettavana Windows-työpöytäsovelluksena.

### Lisätty

**Sovellus**
- Tauri 2 -pohjainen työpöytäsovellus (Rust-taustalogiikka + React-käyttöliittymä)
- NSIS-asennuspaketti `MettisTool-Setup.exe` ja itsenäinen `MettisTool.exe`
- Ilmaisinalueen kuvake, pienennys ilmaisinalueelle, käynnistys Windowsin mukana
- Työpöytäilmoitukset ja päivitystarkistus GitHub Releasesista

**Tunnistautuminen**
- Sähköposti- ja salasanakirjautuminen, Argon2id-tiivistys
- Ensikäynnistyksen omistajatilin luonti (ainoa tapa saada OWNER-rooli)
- Rekisteröityminen, sähköpostin vahvistus ja salasanan palautus kertakäyttökoodeilla
- Google-kirjautuminen (OAuth 2.0 + PKCE, paikallinen takaisinkutsu)
- Kaksivaiheinen tunnistautuminen (TOTP) ja palautuskoodit
- Istuntojen hallinta ja "muista minut" käyttöjärjestelmän avainsäilössä
- Kirjautumisyritysten rajoitus ja tilin lukitus

**Käyttöoikeudet**
- Roolit USER, MODERATOR, ADMIN ja OWNER sekä 12 tarkempaa oikeutta
- Oikeudet tarkistetaan aina taustalogiikassa, ei käyttöliittymässä

**Hallintapaneeli**
- Yleiskuva, tilastot ja 14 päivän kaavio
- Käyttäjien hallinta: roolit, tila, lukitus, vahvistus, salasanan palautus, poisto
- Ylläpitotilit ja käyttäjäkohtaiset oikeudet
- Turvallisuusasetukset ja Google-tunnusten hallinta
- Audit-loki: haku, suodatus, CSV-vienti ja siivous
- Sähköpostiasetukset (Resend) ja testiviesti
- Discord-lokitus tasovalinnalla ja testi-ilmoituksella
- Järjestelmätiedot, tietokannan tila ja varmuuskopiot

**Työkalut**
- 221 työkalua 13 moduulissa, kaikki paikallisia
- Käyttäjäkohtaiset suosikit, käyttöhistoria ja tallennetut tilat SQLitessä
- Neljä työkalua käyttää valinnaisesti julkista rajapintaa ja ilmoittaa siitä

**Käyttöliittymä**
- 12 kieltä: fi, en, sv, de, fr, es, it, pt, nl, pl, no, da
- Teemat tumma, tummempi, vaalea ja järjestelmän mukaan + 5 korostusväriä
- Työkaluhaku, ilmoituskeskus ja käyttäjävalikko

**Muuta**
- Automaattinen varmuuskopio kerran vuorokaudessa
- Omien tietojen vienti ja tilin poisto
- GitHub Actions -työnkulku, joka kääntää asennuspaketin ja julkaisee sen
