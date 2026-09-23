/* Moduuli: Web */
(function () {
  'use strict';
  var R = MT.reg, h = MT.h;

  /* ---------- 1. URL-jäsennin ---------- */
  R({
    id: 'url-jasennin', cat: 'web', name: 'URL-jäsennin', icon: 'i-link',
    desc: 'Pura osoite osiin: protokolla, verkkotunnus, polku, parametrit ja ankkuri.',
    keys: ['url', 'osoite', 'jäsennä', 'parametrit', 'domain'],
    fields: [{ k: 'url', type: 'text', label: 'Osoite', def: 'https://kayttaja:salasana@www.esimerkki.fi:8443/tuotteet/kahvi?haku=espresso&sivu=2&lajittelu=hinta#arvostelut', mono: true }],
    run: function (v, c) {
      if (!v.url || !v.url.trim()) return null;
      var u;
      try { u = new URL(v.url.trim()); }
      catch (e) {
        try { u = new URL('https://' + v.url.trim()); }
        catch (e2) { return { note: { text: 'Osoitetta ei voitu jäsentää. Tarkista muoto.', kind: 'err' } }; }
      }
      var params = [];
      u.searchParams.forEach(function (val, k) { params.push([k, val, decodeURIComponent(val)]); });
      var host = u.hostname.split('.');
      return {
        rows: [
          { k: 'Koko osoite', v: u.href, big: true },
          { k: 'Protokolla', v: u.protocol.replace(':', '') },
          { k: 'Verkkotunnus', v: u.hostname },
          { k: 'Aliverkkotunnus', v: host.length > 2 ? host.slice(0, -2).join('.') : '–' },
          { k: 'Juuridomain', v: host.slice(-2).join('.') },
          { k: 'Päätetunniste (TLD)', v: '.' + host[host.length - 1] },
          { k: 'Portti', v: u.port || (u.protocol === 'https:' ? '443 (oletus)' : u.protocol === 'http:' ? '80 (oletus)' : '–') },
          { k: 'Polku', v: u.pathname },
          { k: 'Kyselymerkkijono', v: u.search || '–' },
          { k: 'Ankkuri', v: u.hash || '–' },
          { k: 'Käyttäjätunnus', v: u.username || '–' },
          { k: 'Salasana', v: u.password ? '•'.repeat(u.password.length) + ' (' + u.password.length + ' merkkiä)' : '–', copy: false },
          { k: 'Alkuperä', v: u.origin },
          { k: 'Turvallinen (HTTPS)', v: u.protocol === 'https:' ? 'kyllä' : 'EI — tietoja voidaan salakuunnella', copy: false }
        ],
        table: params.length ? { head: ['Parametri', 'Arvo', 'Purettuna'], rows: params, text: [0, 1, 2] } : null
      };
    }
  });

  /* ---------- 2. URL-rakentaja ---------- */
  R({
    id: 'url-rakentaja', cat: 'web', name: 'URL-rakentaja', icon: 'i-link',
    desc: 'Kokoa osoite osista ja koodaa parametrit oikein.',
    keys: ['url', 'rakenna', 'parametrit', 'osoite'],
    fields: [
      { k: 'proto', type: 'select', label: 'Protokolla', def: 'https', opts: [['https', 'https'], ['http', 'http'], ['ftp', 'ftp'], ['ws', 'ws'], ['wss', 'wss']] },
      { k: 'host', type: 'text', label: 'Verkkotunnus', def: 'api.esimerkki.fi', mono: true },
      { k: 'portti', type: 'num', label: 'Portti (valinnainen)', def: '' },
      { k: 'polku', type: 'text', label: 'Polku', def: '/v1/tuotteet', mono: true },
      { k: 'params', type: 'textarea', label: 'Parametrit (avain=arvo, yksi rivillä)', def: 'haku=kahvi & tee\nsivu=2\nlajittelu=hinta-nouseva', rows: 4 },
      { k: 'anchor', type: 'text', label: 'Ankkuri', def: '', mono: true }
    ],
    run: function (v) {
      if (!v.host) return null;
      var url = v.proto + '://' + v.host.replace(/^https?:\/\//, '');
      if (v.portti && isFinite(v.portti)) url += ':' + Math.round(v.portti);
      var p = (v.polku || '').trim();
      if (p && p[0] !== '/') p = '/' + p;
      url += p;
      var sp = new URLSearchParams();
      (v.params || '').split('\n').forEach(function (line) {
        var i = line.indexOf('=');
        if (i < 0) { if (line.trim()) sp.append(line.trim(), ''); return; }
        sp.append(line.slice(0, i).trim(), line.slice(i + 1).trim());
      });
      var qs = sp.toString();
      if (qs) url += '?' + qs;
      if (v.anchor) url += '#' + encodeURIComponent(v.anchor.replace(/^#/, ''));
      return {
        rows: [
          { k: 'Valmis osoite', v: url, big: true },
          { k: 'Pituus', v: url.length + ' merkkiä', copy: false },
          { k: 'Parametreja', v: String(Array.from(sp.keys()).length), copy: false },
          { k: 'HTML-linkkinä', v: '<a href="' + url.replace(/&/g, '&amp;') + '">linkki</a>' },
          { k: 'Markdown-linkkinä', v: '[linkki](' + url + ')' }
        ],
        out: url
      };
    }
  });

  /* ---------- 3. UTM-rakentaja ---------- */
  R({
    id: 'utm-rakentaja', cat: 'web', name: 'UTM-linkkirakentaja', icon: 'i-link',
    desc: 'Rakenna seurattavia kampanjalinkkejä UTM-parametreilla.',
    keys: ['utm', 'kampanja', 'seuranta', 'analytics', 'markkinointi'],
    fields: [
      { k: 'url', type: 'text', label: 'Kohdeosoite', def: 'https://esimerkki.fi/tarjous', mono: true },
      { k: 'source', type: 'text', label: 'utm_source — lähde', def: 'uutiskirje', hint: 'esim. google, facebook, uutiskirje' },
      { k: 'medium', type: 'text', label: 'utm_medium — media', def: 'email', hint: 'esim. cpc, email, social' },
      { k: 'campaign', type: 'text', label: 'utm_campaign — kampanja', def: 'kevatale-2026' },
      { k: 'term', type: 'text', label: 'utm_term — hakusana', def: '' },
      { k: 'content', type: 'text', label: 'utm_content — sisältö', def: '' }
    ],
    run: function (v) {
      if (!v.url) return null;
      var base = v.url.trim().split('#')[0], anchor = v.url.indexOf('#') >= 0 ? v.url.slice(v.url.indexOf('#')) : '';
      var sp = new URLSearchParams(base.indexOf('?') >= 0 ? base.slice(base.indexOf('?') + 1) : '');
      base = base.split('?')[0];
      [['utm_source', v.source], ['utm_medium', v.medium], ['utm_campaign', v.campaign], ['utm_term', v.term], ['utm_content', v.content]]
        .forEach(function (p) { if (p[1] && p[1].trim()) sp.set(p[0], p[1].trim().toLowerCase().replace(/\s+/g, '-')); });
      var url = base + (sp.toString() ? '?' + sp.toString() : '') + anchor;
      return {
        rows: [
          { k: 'Kampanjalinkki', v: url, big: true },
          { k: 'Pituus', v: url.length + ' merkkiä', copy: false },
          { k: 'HTML', v: '<a href="' + url.replace(/&/g, '&amp;') + '">Lue lisää</a>' }
        ],
        out: url,
        foot: 'Käytä aina samoja kirjoitusasuja (pienet kirjaimet, väliviivat) — analytiikka erottelee "Uutiskirje" ja "uutiskirje" eri lähteiksi.'
      };
    }
  });

  /* ---------- 4. HTTP-statuskoodit ---------- */
  var STATUS = [
    [100, 'Continue', 'Palvelin on vastaanottanut otsakkeet ja asiakas voi jatkaa rungon lähettämistä.'],
    [101, 'Switching Protocols', 'Palvelin vaihtaa protokollaa pyynnön mukaisesti, esimerkiksi WebSocketiin.'],
    [200, 'OK', 'Pyyntö onnistui. Yleisin onnistumiskoodi.'],
    [201, 'Created', 'Resurssi luotiin onnistuneesti. Palautetaan yleensä POST-pyynnölle.'],
    [202, 'Accepted', 'Pyyntö otettiin käsittelyyn, mutta sitä ei ole vielä suoritettu loppuun.'],
    [204, 'No Content', 'Pyyntö onnistui, mutta vastauksessa ei ole sisältöä.'],
    [206, 'Partial Content', 'Palvelin palauttaa vain osan resurssista (Range-pyyntö).'],
    [301, 'Moved Permanently', 'Resurssi on siirtynyt pysyvästi uuteen osoitteeseen. Hakukoneet siirtävät arvon uuteen osoitteeseen.'],
    [302, 'Found', 'Väliaikainen uudelleenohjaus. Alkuperäinen osoite säilyy käytössä.'],
    [304, 'Not Modified', 'Resurssi ei ole muuttunut — selain voi käyttää välimuistia.'],
    [307, 'Temporary Redirect', 'Väliaikainen ohjaus, joka säilyttää HTTP-metodin.'],
    [308, 'Permanent Redirect', 'Pysyvä ohjaus, joka säilyttää HTTP-metodin.'],
    [400, 'Bad Request', 'Pyyntö on virheellinen, esimerkiksi viallinen JSON tai puuttuva kenttä.'],
    [401, 'Unauthorized', 'Tunnistautuminen puuttuu tai on virheellinen. Tarkista token tai kirjautuminen.'],
    [403, 'Forbidden', 'Tunnistautuminen onnistui, mutta oikeudet eivät riitä.'],
    [404, 'Not Found', 'Resurssia ei löytynyt. Tunnetuin virhekoodi.'],
    [405, 'Method Not Allowed', 'HTTP-metodia ei sallita tälle resurssille.'],
    [408, 'Request Timeout', 'Palvelin sulki yhteyden odotettuaan pyyntöä liian kauan.'],
    [409, 'Conflict', 'Pyyntö on ristiriidassa resurssin nykytilan kanssa.'],
    [410, 'Gone', 'Resurssi on poistettu pysyvästi eikä palaa.'],
    [413, 'Payload Too Large', 'Pyynnön runko on liian suuri.'],
    [415, 'Unsupported Media Type', 'Sisältötyyppiä ei tueta. Tarkista Content-Type-otsake.'],
    [418, "I'm a teapot", 'Aprillipäivän standardista jäänyt koodi. Teekannu ei osaa keittää kahvia.'],
    [422, 'Unprocessable Content', 'Pyyntö on muodollisesti oikea mutta semanttisesti virheellinen (validointivirhe).'],
    [429, 'Too Many Requests', 'Pyyntörajoitus ylittyi. Odota Retry-After-otsakkeen ilmoittama aika.'],
    [451, 'Unavailable For Legal Reasons', 'Sisältö on estetty oikeudellisista syistä.'],
    [500, 'Internal Server Error', 'Palvelimella tapahtui odottamaton virhe.'],
    [501, 'Not Implemented', 'Palvelin ei tue pyydettyä toiminnallisuutta.'],
    [502, 'Bad Gateway', 'Välityspalvelin sai virheellisen vastauksen taustapalvelimelta.'],
    [503, 'Service Unavailable', 'Palvelu on tilapäisesti pois käytöstä, usein huollon tai ylikuormituksen takia.'],
    [504, 'Gateway Timeout', 'Taustapalvelin ei vastannut ajoissa.'],
    [507, 'Insufficient Storage', 'Palvelimen tallennustila ei riitä pyynnön suorittamiseen.']
  ];
  R({
    id: 'http-statuskoodit', cat: 'web', name: 'HTTP-statuskoodit', icon: 'i-globe', kind: 'custom',
    desc: 'Hae HTTP-tilakoodin merkitys ja tyypillinen käyttötilanne.',
    keys: ['http', 'status', 'koodi', '404', '500', 'virhe'],
    render: function (root, c) {
      var q = h('input.ctl', { placeholder: 'Hae koodilla tai nimellä, esim. 404 tai timeout' });
      var box = h('div');
      function draw() {
        var s = q.value.trim().toLowerCase();
        var list = STATUS.filter(function (x) {
          return !s || String(x[0]).indexOf(s) === 0 || x[1].toLowerCase().indexOf(s) >= 0 || x[2].toLowerCase().indexOf(s) >= 0;
        });
        MT.clear(box);
        if (!list.length) { box.appendChild(c.empty('Ei osumia', 'Kokeile toista hakusanaa.')); return; }
        var rows = h('div.rows');
        list.forEach(function (x) {
          var cls = x[0] < 300 ? 'ok' : x[0] < 400 ? 'warn' : 'err';
          rows.appendChild(h('div.row-item', { onclick: function () { MT.copy(x[0] + ' ' + x[1]); } }, [
            h('span.row-ico', { style: { color: 'var(--' + cls + ')' } }, h('b', { text: String(x[0]), style: { fontSize: '11px', fontFamily: 'var(--mono)' } })),
            h('span.row-main', null, [h('div.n', { text: x[1] }), h('div.m', { text: x[2], style: { whiteSpace: 'normal', fontFamily: 'var(--sans)', fontSize: '11.5px' } })])
          ]));
        });
        box.appendChild(rows);
      }
      q.addEventListener('input', MT.debounce(draw, 120));
      root.appendChild(c.panel('HAKU', 'i-search', h('div.panel-body', null, q)));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('TILAKOODIT', 'i-globe', box)));
      root.appendChild(h('div', { style: { marginTop: '11px' } }, c.note('Koodiluokat: <b>1xx</b> tiedotus · <b>2xx</b> onnistuminen · <b>3xx</b> uudelleenohjaus · <b>4xx</b> asiakkaan virhe · <b>5xx</b> palvelimen virhe.', 'info')));
      draw();
    }
  });

  /* ---------- 5. HTTP-otsakkeet ---------- */
  var HEADERS = [
    ['Accept', 'Pyyntö', 'Kertoo mitä sisältötyyppejä asiakas hyväksyy, esim. application/json.'],
    ['Authorization', 'Pyyntö', 'Tunnistautumistiedot, yleensä "Bearer <token>" tai "Basic <base64>".'],
    ['Cache-Control', 'Molemmat', 'Ohjaa välimuistitusta: no-store, max-age=3600, public, private.'],
    ['Content-Type', 'Molemmat', 'Rungon mediatyyppi, esim. application/json; charset=utf-8.'],
    ['Content-Length', 'Molemmat', 'Rungon pituus tavuina.'],
    ['Content-Encoding', 'Vastaus', 'Käytetty pakkaus: gzip, br, deflate.'],
    ['Cookie', 'Pyyntö', 'Asiakkaan lähettämät evästeet.'],
    ['Set-Cookie', 'Vastaus', 'Asettaa evästeen. Käytä aina HttpOnly, Secure ja SameSite.'],
    ['ETag', 'Vastaus', 'Resurssin versiotunniste ehdollista välimuistitusta varten.'],
    ['Location', 'Vastaus', 'Uudelleenohjauksen kohdeosoite 3xx-vastauksissa.'],
    ['Retry-After', 'Vastaus', 'Kuinka kauan asiakkaan tulee odottaa ennen uutta yritystä.'],
    ['User-Agent', 'Pyyntö', 'Asiakasohjelman tunniste.'],
    ['Referer', 'Pyyntö', 'Edellinen sivu, jolta pyyntö tehtiin (kirjoitusvirhe on osa standardia).'],
    ['Origin', 'Pyyntö', 'Pyynnön lähteen alkuperä CORS-tarkistuksia varten.'],
    ['Access-Control-Allow-Origin', 'Vastaus', 'CORS: mikä alkuperä saa lukea vastauksen. * sallii kaikki.'],
    ['Strict-Transport-Security', 'Vastaus', 'Pakottaa selaimen käyttämään HTTPS:ää. Esim. max-age=31536000; includeSubDomains.'],
    ['Content-Security-Policy', 'Vastaus', 'Rajoittaa mitä resursseja sivu saa ladata — tehokkain suoja XSS:ää vastaan.'],
    ['X-Content-Type-Options', 'Vastaus', 'Arvolla nosniff estää selainta arvaamasta sisältötyyppiä.'],
    ['X-Frame-Options', 'Vastaus', 'Estää sivun upottamisen kehykseen (clickjacking-suojaus).'],
    ['Referrer-Policy', 'Vastaus', 'Määrittää paljonko viittaustietoa lähetetään eteenpäin.'],
    ['Permissions-Policy', 'Vastaus', 'Rajoittaa selainominaisuuksia kuten kameraa ja sijaintia.'],
    ['Accept-Encoding', 'Pyyntö', 'Mitä pakkausmenetelmiä asiakas tukee.'],
    ['If-None-Match', 'Pyyntö', 'Ehdollinen pyyntö ETagin perusteella — vastauksena usein 304.'],
    ['Range', 'Pyyntö', 'Pyytää vain osan resurssista, esim. bytes=0-1023.']
  ];
  R({
    id: 'http-otsakkeet', cat: 'web', name: 'HTTP-otsakkeet', icon: 'i-globe', kind: 'custom',
    desc: 'Hakukelpoinen viite yleisimmistä HTTP-otsakkeista ja niiden merkityksestä.',
    keys: ['http', 'otsake', 'header', 'cors', 'cache', 'csp'],
    render: function (root, c) {
      var q = h('input.ctl', { placeholder: 'Hae otsakkeella tai kuvauksella…' });
      var box = h('div');
      function draw() {
        var s = q.value.trim().toLowerCase();
        var list = HEADERS.filter(function (x) { return !s || x[0].toLowerCase().indexOf(s) >= 0 || x[2].toLowerCase().indexOf(s) >= 0; });
        MT.clear(box);
        box.appendChild(list.length ? c.table(['Otsake', 'Suunta', 'Kuvaus'], list, { text: [0, 1, 2] }) : c.empty('Ei osumia'));
      }
      q.addEventListener('input', MT.debounce(draw, 120));
      root.appendChild(c.panel('HAKU', 'i-search', h('div.panel-body', null, q)));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('OTSAKKEET', 'i-globe', box)));
      root.appendChild(h('div', { style: { marginTop: '11px' } }, c.note('Selaimessa ajettava sivu ei voi lukea toisen sivuston vastausotsakkeita ilman CORS-lupaa — siksi otsakkeiden tarkistus vaatii palvelimen tai komentorivin (esim. <span class="mono">curl -I https://esimerkki.fi</span>).', 'info')));
      draw();
    }
  });

  /* ---------- 6. DNS-haku ---------- */
  R({
    id: 'dns-haku', cat: 'web', name: 'DNS-haku', icon: 'i-net', kind: 'custom',
    net: 'Tekee DNS-kyselyn Googlen julkisen DNS-over-HTTPS-rajapinnan kautta kun painat Hae.',
    desc: 'Hae verkkotunnuksen DNS-tietueet: A, AAAA, MX, TXT, NS, CNAME ja muut.',
    keys: ['dns', 'nimipalvelu', 'mx', 'txt', 'verkkotunnus', 'a-tietue'],
    render: function (root, c) {
      var dom = h('input.ctl.mono', { value: 'mettistool.fi', placeholder: 'esimerkki.fi' });
      var type = h('select.ctl');
      ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'SRV', 'CAA', 'PTR'].forEach(function (t) { type.appendChild(h('option', { value: t, text: t })); });
      var out = h('div', { style: { marginTop: '13px' } });
      var TYPE_N = { 1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR', 15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 257: 'CAA' };
      function lookup() {
        var d = dom.value.trim().replace(/^https?:\/\//, '').split('/')[0];
        if (!d) { MT.toast('Anna verkkotunnus', 'warn'); return; }
        MT.clear(out);
        out.appendChild(h('div', { style: { padding: '14px', textAlign: 'center' } }, [h('span.spin'), h('span', { text: '  Haetaan…' })]));
        fetch('https://dns.google/resolve?name=' + encodeURIComponent(d) + '&type=' + type.value)
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (j) {
            MT.clear(out);
            var STAT = { 0: 'NOERROR — kysely onnistui', 2: 'SERVFAIL — nimipalvelin epäonnistui', 3: 'NXDOMAIN — verkkotunnusta ei ole olemassa' };
            out.appendChild(c.panel('KYSELY', 'i-net', c.resList([
              { k: 'Verkkotunnus', v: d }, { k: 'Tietuetyyppi', v: type.value, copy: false },
              { k: 'Vastauskoodi', v: STAT[j.Status] || String(j.Status), copy: false },
              { k: 'Tietueita', v: String((j.Answer || []).length), copy: false, big: true }
            ])));
            if (!j.Answer || !j.Answer.length) {
              out.appendChild(h('div', { style: { marginTop: '11px' } }, c.note('Tietueita ei löytynyt tälle tyypille. Kokeile toista tietuetyyppiä.', 'warn')));
              return;
            }
            out.appendChild(h('div', { style: { marginTop: '11px' } }, c.panel('TIETUEET', 'i-grid',
              c.table(['Nimi', 'Tyyppi', 'TTL', 'Arvo'], j.Answer.map(function (a) {
                return [a.name, TYPE_N[a.type] || a.type, a.TTL + ' s', a.data];
              }), { text: [0, 1, 2, 3] }))));
          })
          .catch(function (e) {
            MT.clear(out);
            out.appendChild(c.note('Haku epäonnistui: ' + e.message + '. Tarkista verkkoyhteys.', 'err'));
          });
      }
      dom.addEventListener('keydown', function (e) { if (e.key === 'Enter') lookup(); });
      root.appendChild(c.panel('DNS-KYSELY', 'i-net', h('div.panel-body', null, [
        h('div.fields', null, [
          h('div.field', null, [h('label', { text: 'Verkkotunnus' }), dom]),
          h('div.field', null, [h('label', { text: 'Tietuetyyppi' }), type])
        ]),
        h('div.btn-row', { style: { marginTop: '11px' } }, c.btn('Hae tietueet', { cls: 'btn-pri', icon: 'i-search', on: lookup }))
      ])));
      root.appendChild(out);
      root.appendChild(h('div', { style: { marginTop: '11px' } },
        c.note('Kysely tehdään Googlen julkisen DNS-over-HTTPS-palvelun kautta, koska selain ei voi tehdä suoria DNS-kyselyitä. Hakemasi verkkotunnus välittyy kyseiselle palvelulle.', 'info')));
      MT.clear(out); out.appendChild(c.empty('Ei hakua', 'Syötä verkkotunnus ja paina Hae tietueet.', 'i-net'));
    }
  });

  /* ---------- 7. IP-tiedot ---------- */
  R({
    id: 'ip-tiedot', cat: 'web', name: 'IP- ja yhteystiedot', icon: 'i-globe', kind: 'custom',
    net: 'Hakee julkisen IP-osoitteesi ipify-palvelusta vain kun painat hakupainiketta.',
    desc: 'Näytä selaimen yhteystiedot ja hae julkinen IP-osoitteesi.',
    keys: ['ip', 'osoite', 'yhteys', 'verkko', 'julkinen'],
    render: function (root, c) {
      var local = h('div'), pub = h('div');
      function localInfo() {
        var conn = navigator.connection || {};
        MT.clear(local);
        local.appendChild(c.resList([
          { k: 'Selain online', v: navigator.onLine ? 'kyllä' : 'ei', copy: false },
          { k: 'Yhteystyyppi', v: conn.effectiveType ? conn.effectiveType.toUpperCase() : 'ei saatavilla', copy: false },
          { k: 'Arvioitu nopeus', v: conn.downlink ? conn.downlink + ' Mbit/s' : 'ei saatavilla', copy: false },
          { k: 'Viive (RTT)', v: conn.rtt ? conn.rtt + ' ms' : 'ei saatavilla', copy: false },
          { k: 'Säästötila', v: conn.saveData ? 'käytössä' : 'ei käytössä', copy: false },
          { k: 'Aikavyöhyke', v: Intl.DateTimeFormat().resolvedOptions().timeZone, copy: false },
          { k: 'Kieli', v: navigator.languages ? navigator.languages.join(', ') : navigator.language, copy: false },
          { k: 'Alkuperä', v: location.origin || 'paikallinen tiedosto', copy: false },
          { k: 'Suojattu konteksti', v: window.isSecureContext ? 'kyllä' : 'ei', copy: false }
        ]));
      }
      function fetchIp() {
        MT.clear(pub);
        pub.appendChild(h('div', { style: { padding: '14px', textAlign: 'center' } }, [h('span.spin'), h('span', { text: '  Haetaan…' })]));
        fetch('https://api.ipify.org?format=json')
          .then(function (r) { return r.json(); })
          .then(function (j) {
            MT.clear(pub);
            pub.appendChild(c.resList([
              { k: 'Julkinen IP-osoite', v: j.ip, big: true },
              { k: 'Tyyppi', v: j.ip.indexOf(':') >= 0 ? 'IPv6' : 'IPv4', copy: false }
            ]));
          })
          .catch(function (e) {
            MT.clear(pub);
            pub.appendChild(c.note('Haku epäonnistui: ' + e.message, 'err'));
          });
      }
      root.appendChild(h('div.home-grid', null, [
        c.panel('SELAIMEN YHTEYSTIEDOT', 'i-monitor', local),
        c.panel('JULKINEN IP', 'i-globe', h('div', null, [pub,
          h('div.panel-foot', null, c.btn('Hae julkinen IP', { cls: 'btn-sm btn-pri', icon: 'i-download', on: fetchIp }))]))
      ]));
      root.appendChild(h('div', { style: { marginTop: '11px' } },
        c.note('Selaimen yhteystiedot luetaan paikallisesti. Julkisen IP-osoitteen haku ottaa yhteyden ipify-palveluun vasta kun painat painiketta — silloin IP-osoitteesi luonnollisesti näkyy kyseiselle palvelulle.', 'info')));
      MT.clear(pub); pub.appendChild(c.empty('Ei haettu', 'Paina painiketta hakeaksesi julkisen IP-osoitteesi.', 'i-globe'));
      localInfo();
    }
  });

  /* ---------- 8. User-Agent ---------- */
  R({
    id: 'user-agent', cat: 'web', name: 'User-Agent-jäsennin', icon: 'i-monitor',
    desc: 'Tulkitse selaimen tunnistemerkkijono: selain, versio, käyttöjärjestelmä ja moottori.',
    keys: ['user-agent', 'selain', 'ua', 'tunniste', 'versio'],
    fields: [{ k: 'ua', type: 'textarea', label: 'User-Agent-merkkijono', def: navigator.userAgent, rows: 3 }],
    run: function (v) {
      var ua = v.ua || '';
      var browser = 'tuntematon', ver = '', os = 'tuntematon', engine = 'tuntematon', m;
      if ((m = /Edg(?:e|A|iOS)?\/([\d.]+)/.exec(ua))) { browser = 'Microsoft Edge'; ver = m[1]; }
      else if ((m = /OPR\/([\d.]+)/.exec(ua)) || (m = /Opera[ /]([\d.]+)/.exec(ua))) { browser = 'Opera'; ver = m[1]; }
      else if ((m = /SamsungBrowser\/([\d.]+)/.exec(ua))) { browser = 'Samsung Internet'; ver = m[1]; }
      else if ((m = /Firefox\/([\d.]+)/.exec(ua))) { browser = 'Mozilla Firefox'; ver = m[1]; }
      else if ((m = /Chrome\/([\d.]+)/.exec(ua))) { browser = 'Google Chrome'; ver = m[1]; }
      else if ((m = /Version\/([\d.]+).*Safari/.exec(ua))) { browser = 'Safari'; ver = m[1]; }
      else if ((m = /curl\/([\d.]+)/.exec(ua))) { browser = 'curl'; ver = m[1]; }
      if (/Windows NT 10/.test(ua)) os = 'Windows 10 tai 11';
      else if ((m = /Windows NT ([\d.]+)/.exec(ua))) os = 'Windows NT ' + m[1];
      else if (/Android/.test(ua)) os = 'Android ' + ((/Android ([\d.]+)/.exec(ua) || [, ''])[1]);
      else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS ' + ((/OS ([\d_]+)/.exec(ua) || [, ''])[1].replace(/_/g, '.'));
      else if (/Mac OS X/.test(ua)) os = 'macOS ' + ((/Mac OS X ([\d_]+)/.exec(ua) || [, ''])[1].replace(/_/g, '.'));
      else if (/CrOS/.test(ua)) os = 'ChromeOS';
      else if (/Linux/.test(ua)) os = 'Linux';
      if (/Gecko\/\d/.test(ua)) engine = 'Gecko';
      else if (/AppleWebKit/.test(ua)) engine = /Chrome|Edg|OPR/.test(ua) ? 'Blink' : 'WebKit';
      var bot = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|duckduckbot/i.test(ua);
      var mobile = /Mobi|Android|iPhone|iPad/i.test(ua);
      return {
        rows: [
          { k: 'Selain', v: browser + (ver ? ' ' + ver.split('.')[0] : ''), big: true },
          { k: 'Täysi versio', v: ver || '–' },
          { k: 'Käyttöjärjestelmä', v: os, big: true },
          { k: 'Selainmoottori', v: engine },
          { k: 'Laitetyyppi', v: mobile ? 'mobiili tai tabletti' : 'työpöytä', copy: false },
          { k: 'Hakurobotti', v: bot ? 'kyllä' : 'ei', copy: false },
          { k: 'Kosketusnäyttö', v: navigator.maxTouchPoints > 0 ? 'kyllä (' + navigator.maxTouchPoints + ' pistettä)' : 'ei', copy: false },
          { k: 'Merkkijonon pituus', v: ua.length + ' merkkiä', copy: false }
        ],
        foot: 'User-Agent-merkkijonoa ei kannata käyttää ominaisuuksien tunnistamiseen — se on helposti väärennettävissä ja selaimet lyhentävät sitä jatkuvasti. Käytä mieluummin ominaisuustunnistusta.'
      };
    }
  });

  /* ---------- 9. Meta-generaattori ---------- */
  R({
    id: 'meta-generaattori', cat: 'web', name: 'Meta-tagien generaattori', icon: 'i-code',
    desc: 'Luo valmiit meta-, Open Graph- ja Twitter-tagit sivullesi.',
    keys: ['meta', 'og', 'seo', 'twitter', 'tagit', 'jakaminen'],
    fields: [
      { k: 'otsikko', type: 'text', label: 'Sivun otsikko', def: 'MettisTool — ammattilaisen työkalupakki' },
      { k: 'kuvaus', type: 'textarea', label: 'Kuvaus', def: 'Yli 170 työkalua kehittäjille ja tehokäyttäjille. Kaikki käsittely tapahtuu paikallisesti selaimessa.', rows: 3 },
      { k: 'url', type: 'text', label: 'Kanoninen osoite', def: 'https://mettistool.fi/', mono: true },
      { k: 'kuva', type: 'text', label: 'Jakokuvan osoite', def: 'https://mettistool.fi/og-kuva.png', mono: true },
      { k: 'sivusto', type: 'text', label: 'Sivuston nimi', def: 'MettisTool' },
      { k: 'kieli', type: 'text', label: 'Kieli', def: 'fi_FI' },
      { k: 'tyyppi', type: 'select', label: 'Sisältötyyppi', def: 'website', opts: [['website', 'Verkkosivu'], ['article', 'Artikkeli'], ['product', 'Tuote']] }
    ],
    run: function (v) {
      var e = function (s) { return String(s || '').replace(/"/g, '&quot;'); };
      var out = [
        '<!-- Perustiedot -->',
        '<title>' + e(v.otsikko) + '</title>',
        '<meta name="description" content="' + e(v.kuvaus) + '">',
        '<link rel="canonical" href="' + e(v.url) + '">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '',
        '<!-- Open Graph (Facebook, LinkedIn, WhatsApp) -->',
        '<meta property="og:type" content="' + e(v.tyyppi) + '">',
        '<meta property="og:title" content="' + e(v.otsikko) + '">',
        '<meta property="og:description" content="' + e(v.kuvaus) + '">',
        '<meta property="og:url" content="' + e(v.url) + '">',
        '<meta property="og:image" content="' + e(v.kuva) + '">',
        '<meta property="og:site_name" content="' + e(v.sivusto) + '">',
        '<meta property="og:locale" content="' + e(v.kieli) + '">',
        '',
        '<!-- Twitter / X -->',
        '<meta name="twitter:card" content="summary_large_image">',
        '<meta name="twitter:title" content="' + e(v.otsikko) + '">',
        '<meta name="twitter:description" content="' + e(v.kuvaus) + '">',
        '<meta name="twitter:image" content="' + e(v.kuva) + '">'
      ].join('\n');
      var warn = [];
      if ((v.otsikko || '').length > 60) warn.push('Otsikko on yli 60 merkkiä — Google katkaisee sen hakutuloksissa.');
      if ((v.kuvaus || '').length > 160) warn.push('Kuvaus on yli 160 merkkiä — loppuosa jää näkymättä.');
      if ((v.kuvaus || '').length < 50) warn.push('Kuvaus on lyhyt — 50–160 merkkiä toimii parhaiten.');
      return {
        out: out,
        rows: [
          { k: 'Otsikon pituus', v: (v.otsikko || '').length + ' / 60 merkkiä', copy: false },
          { k: 'Kuvauksen pituus', v: (v.kuvaus || '').length + ' / 160 merkkiä', copy: false }
        ],
        html: h('div.panel', null, [
          h('div.panel-head', null, [MT.icon('i-code'), h('span.lbl', { text: 'HTML-KOODI' })]),
          h('pre.ed-out', { html: MT.highlight(out, 'xml'), style: { padding: '11px', maxHeight: '420px' } })
        ]),
        note: warn.length ? { text: warn.join('<br>'), kind: 'warn' } : null,
        foot: 'Jakokuvan suositeltu koko on 1200 × 630 pikseliä. Käytä absoluuttista osoitetta — suhteelliset polut eivät toimi jaettaessa.'
      };
    }
  });

  /* ---------- 10. OG-esikatselu ---------- */
  R({
    id: 'og-esikatselu', cat: 'web', name: 'Jakokortin esikatselu', icon: 'i-image', kind: 'custom',
    desc: 'Liitä sivun HTML tai meta-tagit ja näe miltä linkki näyttää jaettuna.',
    keys: ['og', 'open graph', 'esikatselu', 'jako', 'kortti', 'some'],
    render: function (root, c) {
      var ta = h('textarea.ctl', { rows: 8, spellcheck: 'false', placeholder: 'Liitä sivun <head>-osa tai koko HTML…' });
      ta.value = '<title>MettisTool — ammattilaisen työkalupakki</title>\n<meta name="description" content="Yli 170 työkalua suoraan selaimessa.">\n<meta property="og:title" content="MettisTool — ammattilaisen työkalupakki">\n<meta property="og:description" content="Yli 170 työkalua kehittäjille ja tehokäyttäjille. Kaikki käsittely paikallisesti.">\n<meta property="og:url" content="https://mettistool.fi/">\n<meta property="og:image" content="https://mettistool.fi/og-kuva.png">';
      var out = h('div', { style: { marginTop: '13px' } });
      function upd() {
        MT.clear(out);
        var doc = new DOMParser().parseFromString('<html><head>' + ta.value + '</head><body></body></html>', 'text/html');
        function meta(sel) { var el = doc.querySelector(sel); return el ? el.getAttribute('content') : null; }
        var title = meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]') || (doc.querySelector('title') || {}).textContent || '';
        var desc = meta('meta[property="og:description"]') || meta('meta[name="description"]') || '';
        var img = meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]') || '';
        var url = meta('meta[property="og:url"]') || '';
        var host = '';
        try { host = new URL(url).hostname; } catch (e) { host = url; }
        var card = h('div', { style: { maxWidth: '520px', border: '1px solid var(--bd)', borderRadius: '8px', overflow: 'hidden', background: 'var(--panel-2)' } }, [
          h('div', { style: { height: '250px', background: 'var(--panel-3)', display: 'grid', placeItems: 'center', color: 'var(--tx-3)', fontSize: '12px', overflow: 'hidden' } },
            img ? h('img', { src: img, style: { width: '100%', height: '100%', objectFit: 'cover' }, onerror: function (e) { e.target.replaceWith(h('span', { text: 'Kuvaa ei voitu ladata: ' + img })); } })
              : h('span', { text: 'Ei og:image-tagia — jakokortti näkyy ilman kuvaa' })),
          h('div', { style: { padding: '11px 13px' } }, [
            h('div', { text: (host || 'esimerkki.fi').toUpperCase(), style: { fontSize: '11px', color: 'var(--tx-3)', letterSpacing: '.06em' } }),
            h('div', { text: title || 'Ei otsikkoa', style: { fontSize: '15px', fontWeight: '600', margin: '4px 0' } }),
            h('div', { text: desc || 'Ei kuvausta', style: { fontSize: '12.5px', color: 'var(--tx-2)', lineHeight: '1.45' } })
          ])
        ]);
        out.appendChild(c.panel('ESIKATSELU', 'i-image', h('div.preview-box', { style: { padding: '18px' } }, card)));
        var checks = [
          ['og:title', title, 'Otsikko puuttuu — jaettu linkki näyttää pelkän osoitteen.'],
          ['og:description', desc, 'Kuvaus puuttuu — palvelut arvaavat sisällön itse.'],
          ['og:image', img, 'Kuva puuttuu — kortti näkyy pienenä tekstilinkkinä.'],
          ['og:url', url, 'Kanoninen osoite puuttuu.']
        ];
        out.appendChild(h('div', { style: { marginTop: '11px' } }, c.panel('TARKISTUS', 'i-checksq', c.resList(
          checks.map(function (x) { return { k: x[0], v: x[1] ? '✓ ' + String(x[1]).slice(0, 70) : '✗ ' + x[2], copy: false }; })
        ))));
      }
      ta.addEventListener('input', MT.debounce(upd, 300));
      root.appendChild(c.panel('HTML-SYÖTE', 'i-code', h('div.panel-body', null, ta)));
      root.appendChild(out);
      root.appendChild(h('div', { style: { marginTop: '11px' } },
        c.note('Selain ei voi noutaa toisen sivuston HTML:ää CORS-rajoitusten takia, joten liitä sivun lähdekoodi tähän (selaimessa <b>Ctrl+U</b> näyttää sen). Kuvat ladataan suoraan niiden omasta osoitteesta.', 'info')));
      upd();
    }
  });

  /* ---------- 11. robots.txt ---------- */
  R({
    id: 'robots-generaattori', cat: 'web', name: 'robots.txt-generaattori', icon: 'i-file',
    desc: 'Luo robots.txt-tiedosto hakurobottien ohjaamiseen.',
    keys: ['robots', 'seo', 'hakurobotti', 'crawl', 'indeksointi'],
    fields: [
      { k: 'tila', type: 'select', label: 'Perussääntö', def: 'salli', opts: [['salli', 'Salli kaikki robotit'], ['esta', 'Estä kaikki robotit'], ['oma', 'Oma määrittely']] },
      { k: 'esta', type: 'textarea', label: 'Estettävät polut (yksi rivillä)', def: '/admin/\n/ostoskori\n/haku?\n/*.pdf$', rows: 4 },
      { k: 'salli', type: 'textarea', label: 'Sallittavat polut', def: '/admin/julkinen/', rows: 2 },
      { k: 'sitemap', type: 'text', label: 'Sivukartan osoite', def: 'https://esimerkki.fi/sitemap.xml', mono: true },
      { k: 'viive', type: 'num', label: 'Crawl-delay (sekuntia, 0 = ei)', def: '0' },
      { k: 'ai', type: 'check', label: 'Estä tekoälyrobotit (GPTBot, CCBot ym.)', def: false }
    ],
    run: function (v) {
      var L = [];
      L.push('# robots.txt — luotu MettisToolilla ' + new Date().toLocaleDateString('fi-FI'));
      L.push('');
      L.push('User-agent: *');
      if (v.tila === 'esta') L.push('Disallow: /');
      else {
        (v.esta || '').split('\n').filter(function (x) { return x.trim(); }).forEach(function (p) { L.push('Disallow: ' + p.trim()); });
        (v.salli || '').split('\n').filter(function (x) { return x.trim(); }).forEach(function (p) { L.push('Allow: ' + p.trim()); });
        if (v.tila === 'salli' && !(v.esta || '').trim()) L.push('Disallow:');
      }
      if (v.viive > 0) L.push('Crawl-delay: ' + Math.round(v.viive));
      if (v.ai) {
        L.push('');
        L.push('# Tekoälyrobotit');
        ['GPTBot', 'ChatGPT-User', 'CCBot', 'Google-Extended', 'anthropic-ai', 'ClaudeBot', 'PerplexityBot', 'Bytespider']
          .forEach(function (b) { L.push('User-agent: ' + b); L.push('Disallow: /'); L.push(''); });
      }
      if (v.sitemap) { L.push(''); L.push('Sitemap: ' + v.sitemap.trim()); }
      var out = L.join('\n') + '\n';
      return {
        out: out,
        html: h('div.panel', null, [h('div.panel-head', null, [MT.icon('i-file'), h('span.lbl', { text: 'ROBOTS.TXT' })]),
          h('pre.ed-out', { text: out, style: { padding: '11px', maxHeight: '420px' } }),
          h('div.panel-foot', null, [
            MT.ui.btn('Kopioi', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(out); } }),
            MT.ui.btn('Lataa', { cls: 'btn-sm', icon: 'i-download', on: function () { MT.download(out, 'robots.txt'); } })
          ])]),
        foot: 'robots.txt sijoitetaan sivuston juureen (esimerkki.fi/robots.txt). Se on ohje, ei pakote — se ei estä sisällön näkymistä eikä korvaa pääsynhallintaa. Salaiset polut kannattaa jättää mainitsematta.'
      };
    }
  });

  /* ---------- 12. Sitemap ---------- */
  R({
    id: 'sitemap-generaattori', cat: 'web', name: 'Sivukartan generaattori', icon: 'i-grid', kind: 'io',
    desc: 'Muunna osoitelista valmiiksi XML-sivukartaksi.',
    keys: ['sitemap', 'sivukartta', 'seo', 'xml', 'indeksointi'],
    io: {
      inLabel: 'OSOITTEET (YKSI RIVILLÄ)', outLabel: 'SITEMAP.XML', lang: 'xml', ext: '.xml', mime: 'application/xml', file: 'sitemap',
      sample: 'https://esimerkki.fi/\nhttps://esimerkki.fi/tuotteet\nhttps://esimerkki.fi/tuotteet/kahvi\nhttps://esimerkki.fi/yhteystiedot\nhttps://esimerkki.fi/blogi/uutinen-2026',
      opts: [
        { k: 'muutos', type: 'select', label: 'Muutostiheys', def: 'weekly', opts: [['', 'Ei määritelty'], ['always', 'Jatkuvasti'], ['hourly', 'Tunneittain'], ['daily', 'Päivittäin'], ['weekly', 'Viikoittain'], ['monthly', 'Kuukausittain'], ['yearly', 'Vuosittain']] },
        { k: 'pvm', type: 'check', label: 'Lisää tämän päivän lastmod', def: true },
        { k: 'prio', type: 'check', label: 'Laske prioriteetti polun syvyydestä', def: true }
      ],
      run: function (t, o) {
        var urls = t.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
        if (!urls.length) throw new Error('Anna vähintään yksi osoite');
        var today = MT.dateStr();
        var body = urls.map(function (u) {
          var depth = 0;
          try { depth = new URL(u).pathname.split('/').filter(Boolean).length; } catch (e) { depth = (u.split('/').length - 3) || 0; }
          var prio = Math.max(0.1, 1 - depth * 0.2).toFixed(1);
          return '  <url>\n    <loc>' + FMT.xmlEsc(u) + '</loc>' +
            (o.pvm ? '\n    <lastmod>' + today + '</lastmod>' : '') +
            (o.muutos ? '\n    <changefreq>' + o.muutos + '</changefreq>' : '') +
            (o.prio ? '\n    <priority>' + prio + '</priority>' : '') +
            '\n  </url>';
        }).join('\n');
        var out = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '\n</urlset>\n';
        return { out: out, status: urls.length + ' OSOITETTA', kind: 'ok', meta: [['KOKO', MT.bytes(new Blob([out]).size)]] };
      },
      foot: function (c) { return c.note('Yhteen sivukarttaan mahtuu 50 000 osoitetta tai 50 MB. Suuremmat sivustot jaetaan useaan karttaan ja kootaan sitemap-indeksitiedostoon.', 'info'); }
    }
  });

  /* ---------- 13. MIME-tyypit ---------- */
  var MIMES = [
    ['.html', 'text/html', 'HTML-dokumentti'], ['.css', 'text/css', 'Tyylitiedosto'], ['.js', 'text/javascript', 'JavaScript'],
    ['.json', 'application/json', 'JSON-data'], ['.xml', 'application/xml', 'XML-dokumentti'], ['.csv', 'text/csv', 'CSV-taulukko'],
    ['.txt', 'text/plain', 'Tekstitiedosto'], ['.md', 'text/markdown', 'Markdown'], ['.pdf', 'application/pdf', 'PDF-dokumentti'],
    ['.png', 'image/png', 'PNG-kuva'], ['.jpg', 'image/jpeg', 'JPEG-kuva'], ['.webp', 'image/webp', 'WebP-kuva'],
    ['.avif', 'image/avif', 'AVIF-kuva'], ['.gif', 'image/gif', 'GIF-kuva'], ['.svg', 'image/svg+xml', 'SVG-vektorikuva'],
    ['.ico', 'image/x-icon', 'Ikoni'], ['.mp3', 'audio/mpeg', 'MP3-ääni'], ['.wav', 'audio/wav', 'WAV-ääni'],
    ['.ogg', 'audio/ogg', 'OGG-ääni'], ['.mp4', 'video/mp4', 'MP4-video'], ['.webm', 'video/webm', 'WebM-video'],
    ['.zip', 'application/zip', 'ZIP-arkisto'], ['.gz', 'application/gzip', 'GZIP-pakattu'], ['.7z', 'application/x-7z-compressed', '7-Zip'],
    ['.woff2', 'font/woff2', 'Verkkofontti'], ['.ttf', 'font/ttf', 'TrueType-fontti'],
    ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Word-dokumentti'],
    ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel-taulukko'],
    ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'PowerPoint-esitys'],
    ['.wasm', 'application/wasm', 'WebAssembly'], ['.webmanifest', 'application/manifest+json', 'Web-sovellusmanifesti'],
    ['.bin', 'application/octet-stream', 'Binääridata (tuntematon)']
  ];
  R({
    id: 'mime-tyypit', cat: 'web', name: 'MIME-tyypit', icon: 'i-file', kind: 'custom',
    desc: 'Etsi tiedostopäätteen oikea MIME-tyyppi palvelinkonfiguraatiota varten.',
    keys: ['mime', 'content-type', 'tiedostopääte', 'tyyppi'],
    render: function (root, c) {
      var q = h('input.ctl', { placeholder: 'Hae päätteellä tai tyypillä, esim. webp' });
      var box = h('div');
      function draw() {
        var s = q.value.trim().toLowerCase().replace(/^\./, '');
        var list = MIMES.filter(function (x) { return !s || x[0].indexOf(s) >= 0 || x[1].indexOf(s) >= 0 || x[2].toLowerCase().indexOf(s) >= 0; });
        MT.clear(box);
        box.appendChild(list.length ? c.table(['Pääte', 'MIME-tyyppi', 'Kuvaus'], list, { text: [2] }) : c.empty('Ei osumia'));
      }
      q.addEventListener('input', MT.debounce(draw, 120));
      root.appendChild(c.panel('HAKU', 'i-search', h('div.panel-body', null, q)));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('MIME-TYYPIT', 'i-file', box)));
      root.appendChild(h('div', { style: { marginTop: '11px' } }, c.note('Tekstipohjaisiin tyyppeihin kannattaa lisätä merkistö: <span class="mono">Content-Type: text/html; charset=utf-8</span>. Väärä MIME-tyyppi estää esimerkiksi moduulien ja fonttien latautumisen.', 'info')));
      draw();
    }
  });

  /* ---------- 14. Selaintiedot ---------- */
  R({
    id: 'selaintiedot', cat: 'web', name: 'Selaimen ominaisuudet', icon: 'i-monitor', kind: 'custom',
    desc: 'Näet mitä selaimesi tukee: näyttö, syöte, tallennus ja rajapinnat.',
    keys: ['selain', 'ominaisuudet', 'tuki', 'näyttö', 'api'],
    render: function (root, c) {
      function yes(b) { return b ? '✓ tuettu' : '✗ ei tuettu'; }
      var rows1 = [
        { k: 'Näytön koko', v: screen.width + ' × ' + screen.height + ' px', copy: false },
        { k: 'Ikkunan koko', v: innerWidth + ' × ' + innerHeight + ' px', copy: false },
        { k: 'Pikselisuhde', v: String(devicePixelRatio), copy: false },
        { k: 'Värisyvyys', v: screen.colorDepth + ' bittiä', copy: false },
        { k: 'Suunta', v: (screen.orientation || {}).type || '–', copy: false },
        { k: 'Kosketuspisteitä', v: String(navigator.maxTouchPoints || 0), copy: false },
        { k: 'Suorittimen ytimiä', v: String(navigator.hardwareConcurrency || '–'), copy: false },
        { k: 'Muistia (arvio)', v: navigator.deviceMemory ? navigator.deviceMemory + ' GB' : '–', copy: false },
        { k: 'Tumma tila', v: matchMedia('(prefers-color-scheme: dark)').matches ? 'käytössä' : 'ei käytössä', copy: false },
        { k: 'Vähennetty liike', v: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'käytössä' : 'ei käytössä', copy: false }
      ];
      var rows2 = [
        { k: 'WebCrypto', v: yes(window.crypto && crypto.subtle), copy: false },
        { k: 'Service Worker', v: yes('serviceWorker' in navigator), copy: false },
        { k: 'WebAssembly', v: yes(typeof WebAssembly === 'object'), copy: false },
        { k: 'IndexedDB', v: yes('indexedDB' in window), copy: false },
        { k: 'localStorage', v: yes(function () { try { localStorage.setItem('_t', '1'); localStorage.removeItem('_t'); return true; } catch (e) { return false; } }()), copy: false },
        { k: 'Leikepöytä-API', v: yes(navigator.clipboard), copy: false },
        { k: 'Näytön jakaminen', v: yes(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia), copy: false },
        { k: 'Tiedostojärjestelmä-API', v: yes(window.showOpenFilePicker), copy: false },
        { k: 'WebGL', v: yes(function () { try { return !!document.createElement('canvas').getContext('webgl'); } catch (e) { return false; } }()), copy: false },
        { k: 'Jakamis-API', v: yes(navigator.share), copy: false },
        { k: 'Ilmoitukset', v: yes('Notification' in window), copy: false },
        { k: 'Sijainti', v: yes(navigator.geolocation), copy: false },
        { k: 'WebP-tuki', v: yes(document.createElement('canvas').toDataURL('image/webp').indexOf('image/webp') === 5), copy: false },
        { k: 'Suojattu konteksti', v: yes(window.isSecureContext), copy: false }
      ];
      root.appendChild(h('div.home-grid', null, [
        c.panel('LAITE JA NÄYTTÖ', 'i-monitor', c.resList(rows1)),
        c.panel('RAJAPINTOJEN TUKI', 'i-zap', c.resList(rows2))
      ]));
      root.appendChild(h('div', { style: { marginTop: '11px' } },
        c.note('Tiedot luetaan selaimestasi paikallisesti eikä niitä lähetetä mihinkään. Jos jokin MettisToolin työkalu ei toimi, syy löytyy usein tästä listasta — esimerkiksi WebCrypto vaatii HTTPS-yhteyden tai paikallisen tiedoston.', 'ok', 'i-shield')));
    }
  });
})();
