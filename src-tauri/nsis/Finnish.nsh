; MettisToolin suomenkieliset asennusohjelman tekstit.
;
; Taurin mukana ei toimiteta suomenkielistä NSIS-käännöstä, joten ilman tätä
; tiedostoa sen omat viestit jäävät tyhjiksi: nimeämättömät valintanapit,
; nimetön valintaruutu ja tyhjä ilmoitusikkuna. NSIS:n vakiotekstit
; (painikkeet, otsikot) tulevat NSIS:n omasta Finnish.nlf-tiedostosta.
;
; Avainten nimet vastaavat Taurin English.nsh-tiedostoa sellaisenaan —
; myös kirjoitusvirheellinen "choowHowToInstall". Tiedosto on UTF-8;
; Taurin paketoija lisää tavujärjestysmerkin itse.

LangString addOrReinstall ${LANG_FINNISH} "Lisää tai asenna osat uudelleen"
LangString alreadyInstalled ${LANG_FINNISH} "Jo asennettu"
LangString alreadyInstalledLong ${LANG_FINNISH} "${PRODUCTNAME} ${VERSION} on jo asennettu. Valitse haluamasi toiminto ja jatka painamalla Seuraava."
LangString appRunning ${LANG_FINNISH} "{{product_name}} on käynnissä. Sulje se ensin ja yritä uudelleen."
LangString appRunningOkKill ${LANG_FINNISH} "{{product_name}} on käynnissä.$\nSulje se painamalla OK."
LangString chooseMaintenanceOption ${LANG_FINNISH} "Valitse suoritettava ylläpitotoiminto."
LangString choowHowToInstall ${LANG_FINNISH} "Valitse, miten ${PRODUCTNAME} asennetaan."
LangString createDesktop ${LANG_FINNISH} "Luo pikakuvake työpöydälle"
LangString dontUninstall ${LANG_FINNISH} "Älä poista asennusta"
LangString dontUninstallDowngrade ${LANG_FINNISH} "Älä poista asennusta (vanhempaan versioon siirtyminen ilman poistoa ei ole käytössä tässä asennusohjelmassa)"
LangString failedToKillApp ${LANG_FINNISH} "Sovelluksen {{product_name}} sulkeminen ei onnistunut. Sulje se itse ja yritä uudelleen."
LangString installingWebview2 ${LANG_FINNISH} "Asennetaan WebView2..."
LangString newerVersionInstalled ${LANG_FINNISH} "Ohjelmasta ${PRODUCTNAME} on jo asennettu uudempi versio. Vanhemman version asentamista ei suositella. Jos haluat silti asentaa tämän version, poista nykyinen versio ensin. Valitse toiminto ja jatka painamalla Seuraava."
LangString older ${LANG_FINNISH} "vanhempi"
LangString olderOrUnknownVersionInstalled ${LANG_FINNISH} "Järjestelmässä on $R4 versio ohjelmasta ${PRODUCTNAME}. Nykyinen versio kannattaa poistaa ennen asennusta. Valitse toiminto ja jatka painamalla Seuraava."
LangString silentDowngrades ${LANG_FINNISH} "Vanhempaan versioon siirtyminen ei ole käytössä tässä asennusohjelmassa, joten hiljainen asennus ei voi jatkua. Käytä graafista asennusohjelmaa.$\n"
LangString unableToUninstall ${LANG_FINNISH} "Asennuksen poistaminen ei onnistunut."
LangString uninstallApp ${LANG_FINNISH} "Poista ${PRODUCTNAME}"
LangString uninstallBeforeInstalling ${LANG_FINNISH} "Poista asennus ennen asentamista"
LangString unknown ${LANG_FINNISH} "tuntematon"
LangString webview2AbortError ${LANG_FINNISH} "WebView2:n asennus epäonnistui. Sovellus ei toimi ilman sitä. Kokeile käynnistää asennusohjelma uudelleen."
LangString webview2DownloadError ${LANG_FINNISH} "Virhe: WebView2:n lataus epäonnistui - $0"
LangString webview2DownloadSuccess ${LANG_FINNISH} "WebView2-asennusohjelma ladattiin onnistuneesti"
LangString webview2Downloading ${LANG_FINNISH} "Ladataan WebView2-asennusohjelmaa..."
LangString webview2InstallError ${LANG_FINNISH} "Virhe: WebView2:n asennus epäonnistui, virhekoodi $1"
LangString webview2InstallSuccess ${LANG_FINNISH} "WebView2 asennettiin onnistuneesti"
LangString deleteAppData ${LANG_FINNISH} "Poista sovelluksen tallentamat tiedot"
