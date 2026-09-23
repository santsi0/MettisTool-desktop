/* Moduuli: Verkko / Järjestelmä */
(function () {
  'use strict';
  var R = MT.reg, h = MT.h, num = MT.num, numAuto = MT.numAuto;

  function ip2int(s) {
    var p = String(s).trim().split('.');
    if (p.length !== 4) return null;
    var n = 0;
    for (var i = 0; i < 4; i++) {
      var v = parseInt(p[i], 10);
      if (!(v >= 0 && v <= 255) || !/^\d+$/.test(p[i].trim())) return null;
      n = (n * 256) + v;
    }
    return n;
  }
  function int2ip(n) {
    n = n >>> 0;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }
  function maskFromBits(b) { return b === 0 ? 0 : (0xFFFFFFFF << (32 - b)) >>> 0; }
  function bitsFromMask(m) { var b = 0; for (var i = 31; i >= 0; i--) { if ((m >>> i) & 1) b++; else break; } return b; }
  function ipBin(n) {
    return [24, 16, 8, 0].map(function (s) { return ((n >>> s) & 255).toString(2).padStart(8, '0'); }).join('.');
  }
  function ipClass(n) {
    var f = (n >>> 24) & 255;
    if (f < 128) return 'A'; if (f < 192) return 'B'; if (f < 224) return 'C'; if (f < 240) return 'D (multicast)';
    return 'E (varattu)';
  }
  function isPrivate(n) {
    return (n >>> 24 === 10) || (n >>> 20 === 0xAC1) || (n >>> 16 === 0xC0A8) ||
      (n >>> 24 === 127) || (n >>> 16 === 0xA9FE);
  }

  /* ---------- 1. IP-laskuri ---------- */
  R({
    id: 'ip-laskuri', cat: 'verkko', name: 'IP- ja aliverkkolaskuri', icon: 'i-net',
    desc: 'Laske aliverkon osoitealue, maski, broadcast ja käytettävissä olevat osoitteet.',
    keys: ['ip', 'aliverkko', 'subnet', 'maski', 'cidr', 'verkko'],
    fields: [
      { k: 'ip', type: 'text', label: 'IP-osoite', def: '192.168.10.37', mono: true },
      { k: 'bits', type: 'range', label: 'Etuliitteen pituus', def: 24, min: 0, max: 32, step: 1, suffix: ' bittiä' }
    ],
    run: function (v) {
      var n = ip2int(v.ip);
      if (n === null) return { note: { text: 'Virheellinen IPv4-osoite. Muoto: 192.168.1.1', kind: 'err' } };
      var bits = Math.round(v.bits), mask = maskFromBits(bits);
      var net = (n & mask) >>> 0, bc = (net | (~mask >>> 0)) >>> 0;
      var hosts = bits >= 31 ? (bits === 32 ? 1 : 2) : Math.pow(2, 32 - bits) - 2;
      return {
        rows: [
          { k: 'CIDR-merkintä', v: int2ip(net) + '/' + bits, big: true },
          { k: 'Verkko-osoite', v: int2ip(net) },
          { k: 'Broadcast-osoite', v: bits >= 31 ? '–' : int2ip(bc) },
          { k: 'Ensimmäinen osoite', v: bits >= 31 ? int2ip(net) : int2ip(net + 1), big: true },
          { k: 'Viimeinen osoite', v: bits >= 31 ? int2ip(bc) : int2ip(bc - 1), big: true },
          { k: 'Aliverkon peite', v: int2ip(mask) },
          { k: 'Käänteispeite (wildcard)', v: int2ip(~mask >>> 0) },
          { k: 'Käytettäviä osoitteita', v: num(hosts), big: true },
          { k: 'Osoitteita yhteensä', v: num(Math.pow(2, 32 - bits)) },
          { k: 'Osoiteluokka', v: ipClass(n), copy: false },
          { k: 'Osoitetyyppi', v: isPrivate(n) ? 'yksityinen (ei reititetä internetissä)' : 'julkinen', copy: false },
          { k: 'IP binäärinä', v: ipBin(n), sub: true },
          { k: 'Peite binäärinä', v: ipBin(mask), sub: true },
          { k: 'IP kokonaislukuna', v: String(n >>> 0), sub: true }
        ],
        foot: 'Etuliitteen pituus /31 on tarkoitettu kahden laitteen linkeille (RFC 3021) ja /32 yksittäiselle osoitteelle.'
      };
    }
  });

  /* ---------- 2. CIDR-työkalu ---------- */
  R({
    id: 'cidr-laskuri', cat: 'verkko', name: 'CIDR-työkalu', icon: 'i-net', kind: 'io',
    desc: 'Jaa verkko aliverkkoihin, tarkista kuuluuko osoite verkkoon tai listaa alueet.',
    keys: ['cidr', 'aliverkko', 'jaa', 'subnet', 'alue'],
    io: {
      inLabel: 'VERKOT TAI OSOITTEET', outLabel: 'TULOS', lang: 'none',
      sample: '10.0.0.0/22\n192.168.1.0/24\n172.16.0.0/16',
      opts: [
        { k: 'toiminto', type: 'select', label: 'Toiminto', def: 'tiedot', opts: [['tiedot', 'Näytä tiedot'], ['jaa', 'Jaa aliverkkoihin'], ['kuuluu', 'Tarkista kuuluuko osoite'], ['alue', 'Listaa osoitealue']] },
        { k: 'uusi', type: 'num', label: 'Uusi etuliitteen pituus (jaossa)', def: '24' },
        { k: 'osoite', type: 'text', label: 'Tarkistettava osoite', def: '10.0.2.15', mono: true }
      ],
      run: function (t, o) {
        var out = [];
        t.split('\n').forEach(function (line) {
          var s = line.trim();
          if (!s) return;
          var m = /^([\d.]+)(?:\/(\d+))?$/.exec(s);
          if (!m) { out.push(s + '  ⟶ virheellinen muoto'); return; }
          var n = ip2int(m[1]), bits = m[2] === undefined ? 32 : parseInt(m[2], 10);
          if (n === null || bits < 0 || bits > 32) { out.push(s + '  ⟶ virheellinen osoite tai etuliite'); return; }
          var mask = maskFromBits(bits), net = (n & mask) >>> 0, bc = (net | (~mask >>> 0)) >>> 0;
          if (o.toiminto === 'tiedot') {
            out.push(s);
            out.push('  Verkko:      ' + int2ip(net) + '/' + bits);
            out.push('  Alue:        ' + int2ip(net) + ' – ' + int2ip(bc));
            out.push('  Peite:       ' + int2ip(mask));
            out.push('  Osoitteita:  ' + num(Math.pow(2, 32 - bits)) + ' (käytettäviä ' + num(Math.max(0, Math.pow(2, 32 - bits) - 2)) + ')');
            out.push('  Tyyppi:      ' + (isPrivate(net) ? 'yksityinen' : 'julkinen') + ', luokka ' + ipClass(net));
            out.push('');
          } else if (o.toiminto === 'jaa') {
            var nb = Math.round(o.uusi);
            if (nb <= bits || nb > 32) { out.push(s + '  ⟶ uuden etuliitteen on oltava suurempi kuin ' + bits); return; }
            var count = Math.pow(2, nb - bits), step = Math.pow(2, 32 - nb);
            out.push(s + ' → ' + num(count) + ' × /' + nb + ' (' + num(Math.max(0, step - 2)) + ' käytettävää osoitetta kussakin)');
            for (var i = 0; i < Math.min(count, 256); i++) {
              var sn = (net + i * step) >>> 0;
              out.push('  ' + String(i + 1).padStart(4) + '. ' + (int2ip(sn) + '/' + nb).padEnd(20) + int2ip(sn) + ' – ' + int2ip((sn + step - 1) >>> 0));
            }
            if (count > 256) out.push('  … ja ' + num(count - 256) + ' muuta aliverkkoa');
            out.push('');
          } else if (o.toiminto === 'kuuluu') {
            var target = ip2int(o.osoite);
            if (target === null) { out.push('Tarkistettava osoite on virheellinen'); return; }
            var inside = (target & mask) >>> 0 === net;
            out.push(o.osoite + (inside ? '  ✓ kuuluu verkkoon ' : '  ✗ ei kuulu verkkoon ') + s);
          } else {
            var total = bc - net + 1;
            out.push(s + ' → ' + num(total) + ' osoitetta');
            for (var j = 0; j < Math.min(total, 512); j++) out.push('  ' + int2ip((net + j) >>> 0));
            if (total > 512) out.push('  … ja ' + num(total - 512) + ' muuta osoitetta');
            out.push('');
          }
        });
        return { out: out.join('\n'), status: 'VALMIS', kind: 'ok' };
      }
    }
  });

  /* ---------- 3. IPv6 ---------- */
  R({
    id: 'ipv6-laskuri', cat: 'verkko', name: 'IPv6-työkalu', icon: 'i-net',
    desc: 'Laajenna, tiivistä ja tulkitse IPv6-osoitteita.',
    keys: ['ipv6', 'osoite', 'tiivistä', 'laajenna'],
    fields: [{ k: 'ip', type: 'text', label: 'IPv6-osoite', def: '2001:db8::8a2e:370:7334', mono: true },
      { k: 'prefix', type: 'num', label: 'Etuliite (/n)', def: '64' }],
    run: function (v) {
      var s = (v.ip || '').trim().split('%')[0].split('/')[0];
      if (!s) return null;
      var parts;
      try { parts = expand(s); } catch (e) { return { note: { text: e.message, kind: 'err' } }; }
      var full = parts.map(function (x) { return x.toString(16).padStart(4, '0'); }).join(':');
      var compact = compress(parts);
      var pfx = Math.max(0, Math.min(128, Math.round(v.prefix) || 64));
      var netParts = parts.slice();
      for (var i = 0; i < 8; i++) {
        var lo = i * 16, hi = lo + 16;
        if (pfx <= lo) netParts[i] = 0;
        else if (pfx < hi) netParts[i] = netParts[i] & (0xFFFF << (hi - pfx)) & 0xFFFF;
      }
      var type = /^fe80/i.test(full) ? 'Link-local (fe80::/10)' :
        /^fc|^fd/i.test(full) ? 'Unique local (fc00::/7)' :
          /^ff/i.test(full) ? 'Multicast (ff00::/8)' :
            full === '0000:0000:0000:0000:0000:0000:0000:0001' ? 'Loopback (::1)' :
              /^2001:0db8/i.test(full) ? 'Dokumentaatio-osoite (2001:db8::/32)' : 'Globaali unicast';
      return {
        rows: [
          { k: 'Tiivistetty muoto', v: compact, big: true },
          { k: 'Täysi muoto', v: full, big: true },
          { k: 'Verkko-osa', v: compress(netParts) + '/' + pfx },
          { k: 'Osoitetyyppi', v: type, copy: false },
          { k: 'Osoitteita verkossa', v: pfx >= 64 ? num(Math.pow(2, Math.min(53, 128 - pfx))) + (128 - pfx > 53 ? ' (arvio)' : '') : '2^' + (128 - pfx), copy: false },
          { k: 'Ryhmät binäärinä', v: parts.map(function (x) { return x.toString(2).padStart(16, '0'); }).join(' '), sub: true }
        ]
      };
      function expand(str) {
        if (str.indexOf(':') < 0) throw new Error('IPv6-osoitteessa on oltava kaksoispisteitä');
        var halves = str.split('::');
        if (halves.length > 2) throw new Error('Osoitteessa saa olla vain yksi :: -lyhenne');
        var left = halves[0] ? halves[0].split(':') : [];
        var right = halves.length > 1 ? (halves[1] ? halves[1].split(':') : []) : [];
        if (halves.length === 1 && left.length !== 8) throw new Error('Osoitteessa on oltava 8 ryhmää tai :: -lyhenne');
        var fill = 8 - left.length - right.length;
        if (fill < 0) throw new Error('Liian monta ryhmää');
        var all = left.concat(Array.apply(null, Array(fill)).map(function () { return '0'; }), right);
        return all.map(function (x) {
          if (!/^[0-9a-fA-F]{1,4}$/.test(x)) throw new Error('Virheellinen ryhmä: ' + x);
          return parseInt(x, 16);
        });
      }
      function compress(ps) {
        var strs = ps.map(function (x) { return x.toString(16); });
        var best = -1, bestLen = 0, cur = -1, len = 0;
        for (var i2 = 0; i2 < 8; i2++) {
          if (ps[i2] === 0) { if (cur < 0) cur = i2; len++; if (len > bestLen) { bestLen = len; best = cur; } }
          else { cur = -1; len = 0; }
        }
        if (bestLen < 2) return strs.join(':');
        return (strs.slice(0, best).join(':') + '::' + strs.slice(best + bestLen).join(':')).replace(/:::+/, '::');
      }
    }
  });

  /* ---------- 4. MAC-osoite ---------- */
  R({
    id: 'mac-osoite', cat: 'verkko', name: 'MAC-osoitteen muotoilu', icon: 'i-net', kind: 'io',
    desc: 'Muunna MAC-osoitteet eri kirjoitusasuihin ja tarkista niiden tyyppi.',
    keys: ['mac', 'osoite', 'verkkokortti', 'muotoile', 'oui'],
    io: {
      inLabel: 'MAC-OSOITTEET', outLabel: 'MUOTOILLUT', lang: 'none',
      sample: '00:1A:2B:3C:4D:5E\n001a.2b3c.4d5e\n00-1A-2B-3C-4D-5E\nAABBCCDDEEFF',
      opts: [{ k: 'muoto', type: 'select', label: 'Kohdemuoto', def: 'kaksoispiste', opts: [
        ['kaksoispiste', 'AA:BB:CC:DD:EE:FF'], ['viiva', 'AA-BB-CC-DD-EE-FF'],
        ['piste', 'aabb.ccdd.eeff (Cisco)'], ['tyhja', 'AABBCCDDEEFF'], ['kaikki', 'Kaikki muodot ja tiedot']] },
        { k: 'pienet', type: 'check', label: 'Pienet kirjaimet', def: false }],
      run: function (t, o) {
        var out = t.split('\n').map(function (l) {
          var s = l.trim();
          if (!s) return '';
          var hex = s.replace(/[^0-9a-fA-F]/g, '');
          if (hex.length !== 12) return s + '  ⟶ MAC-osoitteessa on oltava 12 heksamerkkiä (nyt ' + hex.length + ')';
          var H = o.pienet ? hex.toLowerCase() : hex.toUpperCase();
          var pairs = H.match(/.{2}/g);
          var forms = {
            kaksoispiste: pairs.join(':'), viiva: pairs.join('-'),
            piste: (o.pienet ? hex.toLowerCase() : hex.toUpperCase()).match(/.{4}/g).join('.'), tyhja: H
          };
          if (o.muoto !== 'kaikki') return forms[o.muoto];
          var first = parseInt(hex.slice(0, 2), 16);
          return [s, '  Kaksoispiste: ' + forms.kaksoispiste, '  Viiva:        ' + forms.viiva,
            '  Cisco:        ' + forms.piste, '  Ilman:        ' + forms.tyhja,
            '  OUI (valmistajatunnus): ' + pairs.slice(0, 3).join(':'),
            '  Tyyppi:       ' + ((first & 1) ? 'monilähetys (multicast)' : 'yksilölähetys (unicast)') +
            ', ' + ((first & 2) ? 'paikallisesti hallittu' : 'globaalisti yksilöllinen'), ''].join('\n');
        }).join('\n');
        return { out: out, status: 'MUOTOILTU', kind: 'ok' };
      },
      foot: function (c) { return c.note('OUI on IEEE:n myöntämä valmistajatunnus (kolme ensimmäistä tavua). Valmistajan nimen selvittäminen vaatisi erillisen tietokannan, jota ei ole sisällytetty tähän offline-työkaluun.', 'info'); }
    }
  });

  /* ---------- 5. Porttiluettelo ---------- */
  var PORTS = [
    [20, 'TCP', 'FTP-data', 'Tiedostonsiirron datakanava'], [21, 'TCP', 'FTP', 'Tiedostonsiirron ohjauskanava — salaamaton'],
    [22, 'TCP', 'SSH / SFTP', 'Salattu etäyhteys ja tiedostonsiirto'], [23, 'TCP', 'Telnet', 'Salaamaton etäyhteys — vanhentunut'],
    [25, 'TCP', 'SMTP', 'Sähköpostin välitys palvelinten välillä'], [53, 'TCP/UDP', 'DNS', 'Nimipalvelu'],
    [67, 'UDP', 'DHCP-palvelin', 'Osoitteiden jakelu'], [68, 'UDP', 'DHCP-asiakas', 'Osoitteen pyyntö'],
    [69, 'UDP', 'TFTP', 'Kevyt tiedostonsiirto'], [80, 'TCP', 'HTTP', 'Salaamaton verkkoliikenne'],
    [110, 'TCP', 'POP3', 'Sähköpostin nouto'], [123, 'UDP', 'NTP', 'Kellon synkronointi'],
    [143, 'TCP', 'IMAP', 'Sähköpostin luku palvelimelta'], [161, 'UDP', 'SNMP', 'Verkkolaitteiden valvonta'],
    [389, 'TCP', 'LDAP', 'Hakemistopalvelu'], [443, 'TCP', 'HTTPS', 'Salattu verkkoliikenne'],
    [445, 'TCP', 'SMB', 'Windows-tiedostojako'], [465, 'TCP', 'SMTPS', 'Salattu sähköpostin lähetys'],
    [514, 'UDP', 'Syslog', 'Lokien keruu'], [587, 'TCP', 'SMTP (submission)', 'Sähköpostin lähetys asiakkaalta'],
    [636, 'TCP', 'LDAPS', 'Salattu hakemistopalvelu'], [993, 'TCP', 'IMAPS', 'Salattu IMAP'],
    [995, 'TCP', 'POP3S', 'Salattu POP3'], [1194, 'UDP', 'OpenVPN', 'VPN-yhteys'],
    [1433, 'TCP', 'MS SQL Server', 'Tietokanta'], [1521, 'TCP', 'Oracle DB', 'Tietokanta'],
    [3000, 'TCP', 'Kehityspalvelin', 'Node.js, React ja vastaavat'], [3306, 'TCP', 'MySQL / MariaDB', 'Tietokanta'],
    [3389, 'TCP', 'RDP', 'Windows-etätyöpöytä'], [5173, 'TCP', 'Vite', 'Kehityspalvelin'],
    [5432, 'TCP', 'PostgreSQL', 'Tietokanta'], [5900, 'TCP', 'VNC', 'Etätyöpöytä'],
    [6379, 'TCP', 'Redis', 'Muistitietokanta'], [8000, 'TCP', 'Kehityspalvelin', 'Python, Django ja vastaavat'],
    [8080, 'TCP', 'HTTP-vaihtoehto', 'Välityspalvelin tai sovelluspalvelin'], [8443, 'TCP', 'HTTPS-vaihtoehto', 'Salattu sovelluspalvelin'],
    [9000, 'TCP', 'PHP-FPM / SonarQube', 'Sovelluspalvelin'], [9200, 'TCP', 'Elasticsearch', 'Hakupalvelin'],
    [11211, 'TCP', 'Memcached', 'Välimuisti'], [27017, 'TCP', 'MongoDB', 'Tietokanta']
  ];
  R({
    id: 'porttiluettelo', cat: 'verkko', name: 'Porttiluettelo', icon: 'i-net', kind: 'custom',
    desc: 'Etsi mikä palvelu käyttää mitäkin TCP- tai UDP-porttia.',
    keys: ['portti', 'port', 'tcp', 'udp', 'palvelu'],
    render: function (root, c) {
      var q = h('input.ctl', { placeholder: 'Hae portilla tai palvelulla, esim. 443 tai mysql' });
      var box = h('div');
      function draw() {
        var s = q.value.trim().toLowerCase();
        var list = PORTS.filter(function (x) {
          return !s || String(x[0]).indexOf(s) === 0 || x[2].toLowerCase().indexOf(s) >= 0 || x[3].toLowerCase().indexOf(s) >= 0;
        });
        MT.clear(box);
        box.appendChild(list.length ? c.table(['Portti', 'Protokolla', 'Palvelu', 'Kuvaus'], list, { text: [1, 2, 3] })
          : c.empty('Ei osumia', 'Kokeile toista hakusanaa.'));
      }
      q.addEventListener('input', MT.debounce(draw, 120));
      root.appendChild(c.panel('HAKU', 'i-search', h('div.panel-body', null, q)));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('PORTIT', 'i-net', box)));
      root.appendChild(h('div', { style: { marginTop: '11px' } }, c.note('Portit 0–1023 ovat tunnettuja portteja, 1024–49151 rekisteröityjä ja 49152–65535 dynaamisia. Avaa palomuurissa vain ne portit joita todella tarvitset.', 'info')));
      draw();
    }
  });

  /* ---------- 6. Siirtoaikalaskuri ---------- */
  R({
    id: 'siirtolaskuri', cat: 'verkko', name: 'Siirtoaikalaskuri', icon: 'i-download',
    desc: 'Laske kauanko tiedoston lataaminen tai siirto kestää valitulla nopeudella.',
    keys: ['siirto', 'lataus', 'nopeus', 'aika', 'kaista'],
    fields: [
      { k: 'koko', type: 'num', label: 'Tiedoston koko', def: '4,7' },
      { k: 'yks', type: 'select', label: 'Yksikkö', def: 'GB', opts: [['MB', 'MB'], ['GB', 'GB'], ['TB', 'TB'], ['MiB', 'MiB'], ['GiB', 'GiB']] },
      { k: 'nopeus', type: 'num', label: 'Yhteysnopeus', def: '100' },
      { k: 'nyks', type: 'select', label: 'Nopeuden yksikkö', def: 'Mbit', opts: [['Mbit', 'Mbit/s'], ['Gbit', 'Gbit/s'], ['MB', 'MB/s'], ['kbit', 'kbit/s']] },
      { k: 'hyoty', type: 'range', label: 'Todellinen hyötysuhde', def: 85, min: 30, max: 100, step: 1, suffix: ' %' }
    ],
    run: function (v) {
      if (!isFinite(v.koko) || !isFinite(v.nopeus) || v.nopeus <= 0) return null;
      var B = { MB: 1e6, GB: 1e9, TB: 1e12, MiB: 1048576, GiB: 1073741824 }[v.yks] * v.koko;
      var bps = { Mbit: 1e6, Gbit: 1e9, MB: 8e6, kbit: 1e3 }[v.nyks] * v.nopeus;
      var sec = B * 8 / bps, real = sec / (v.hyoty / 100);
      function fmt(s) {
        if (s < 60) return numAuto(s) + ' s';
        if (s < 3600) return Math.floor(s / 60) + ' min ' + Math.round(s % 60) + ' s';
        if (s < 86400) return Math.floor(s / 3600) + ' h ' + Math.round(s % 3600 / 60) + ' min';
        return Math.floor(s / 86400) + ' vrk ' + Math.round(s % 86400 / 3600) + ' h';
      }
      return {
        rows: [
          { k: 'Teoreettinen aika', v: fmt(sec), big: true },
          { k: 'Realistinen aika (' + v.hyoty + ' %)', v: fmt(real), big: true },
          { k: 'Tiedoston koko', v: MT.bytes(B) + '  (' + numAuto(B * 8 / 1e6) + ' Mbit)' },
          { k: 'Nopeus', v: numAuto(bps / 1e6) + ' Mbit/s  =  ' + numAuto(bps / 8e6) + ' MB/s' },
          { k: 'Siirtyy minuutissa', v: MT.bytes(bps / 8 * 60), sub: true },
          { k: 'Siirtyy tunnissa', v: MT.bytes(bps / 8 * 3600), sub: true }
        ],
        foot: 'Yhteysnopeudet ilmoitetaan bitteinä sekunnissa (Mbit/s) ja tiedostokoot tavuina — yksi tavu on kahdeksan bittiä. Todellinen nopeus jää aina teoreettista pienemmäksi protokollien ylimääräisen liikenteen takia.'
      };
    }
  });

  /* ---------- 7. Kaistanleveys ---------- */
  R({
    id: 'kaistanleveys', cat: 'verkko', name: 'Kaistanleveyslaskuri', icon: 'i-net',
    desc: 'Arvioi tarvittava kaistanleveys käyttäjämäärän ja palvelutyypin mukaan.',
    keys: ['kaista', 'bandwidth', 'nopeus', 'käyttäjät', 'video'],
    fields: [
      { k: 'kayttajat', type: 'num', label: 'Samanaikaisia käyttäjiä', def: '25' },
      { k: 'tyyppi', type: 'select', label: 'Käyttötapa', def: 'toimisto', opts: [
        ['selailu', 'Verkkoselailu (1 Mbit/s)'], ['toimisto', 'Toimistotyö ja pilvipalvelut (3 Mbit/s)'],
        ['video', 'Videopuhelut HD (2,5 Mbit/s)'], ['video4k', 'Videostriimaus 4K (25 Mbit/s)'],
        ['tiedosto', 'Suuret tiedostosiirrot (10 Mbit/s)'], ['oma', 'Oma arvo']] },
      { k: 'oma', type: 'num', label: 'Oma tarve (Mbit/s per käyttäjä)', def: '5' },
      { k: 'samanaik', type: 'range', label: 'Samanaikaisuuskerroin', def: 70, min: 10, max: 100, step: 5, suffix: ' %' },
      { k: 'varaus', type: 'range', label: 'Kasvuvara', def: 30, min: 0, max: 100, step: 5, suffix: ' %' }
    ],
    run: function (v) {
      var per = { selailu: 1, toimisto: 3, video: 2.5, video4k: 25, tiedosto: 10, oma: v.oma }[v.tyyppi];
      if (!isFinite(per) || !isFinite(v.kayttajat)) return null;
      var aktiiviset = v.kayttajat * (v.samanaik / 100);
      var base = aktiiviset * per, total = base * (1 + v.varaus / 100);
      return {
        rows: [
          { k: 'Samanaikaisia käyttäjiä', v: numAuto(aktiiviset), copy: false },
          { k: 'Perustarve', v: numAuto(base) + ' Mbit/s' },
          { k: 'Suositus kasvuvaralla', v: numAuto(total) + ' Mbit/s', big: true },
          { k: 'Suositeltu liittymä', v: total <= 100 ? '100 Mbit/s' : total <= 250 ? '250 Mbit/s' : total <= 500 ? '500 Mbit/s' : total <= 1000 ? '1 Gbit/s' : Math.ceil(total / 1000) + ' Gbit/s', copy: false, big: true },
          { k: 'Kuukausittainen datamäärä (8 h/pv)', v: MT.bytes(total / 8 * 1e6 * 3600 * 8 * 22 * 0.3), sub: true }
        ],
        foot: 'Samanaikaisuuskerroin kuvaa kuinka moni käyttäjä kuormittaa verkkoa yhtä aikaa. Toimistoympäristössä 60–80 % on tyypillinen arvo.'
      };
    }
  });

  /* ---------- 8. Tallennuslaskuri ---------- */
  R({
    id: 'tallennuslaskuri', cat: 'verkko', name: 'Tallennustilalaskuri', icon: 'i-db',
    desc: 'Laske RAID-taulukon käytettävissä oleva tila ja varmuuskopioiden tarve.',
    keys: ['tallennus', 'levy', 'raid', 'varmuuskopio', 'kapasiteetti'],
    fields: [
      { k: 'levyt', type: 'num', label: 'Levyjen määrä', def: '4' },
      { k: 'koko', type: 'num', label: 'Yhden levyn koko (TB)', def: '8' },
      { k: 'raid', type: 'select', label: 'RAID-taso', def: '5', opts: [['0', 'RAID 0 — raidoitus'], ['1', 'RAID 1 — peilaus'], ['5', 'RAID 5 — yksi pariteetti'], ['6', 'RAID 6 — kaksi pariteettia'], ['10', 'RAID 10 — peilaus + raidoitus'], ['ei', 'Ei RAIDia (JBOD)']] },
      { k: 'tayttoaste', type: 'range', label: 'Suositeltu täyttöaste', def: 80, min: 50, max: 100, step: 5, suffix: ' %' }
    ],
    run: function (v) {
      var n = Math.round(v.levyt), koko = v.koko;
      if (!isFinite(n) || !isFinite(koko) || n < 1) return null;
      var usable, siedetty, min = 1;
      switch (v.raid) {
        case '0': usable = n * koko; siedetty = 0; min = 2; break;
        case '1': usable = koko; siedetty = n - 1; min = 2; break;
        case '5': usable = (n - 1) * koko; siedetty = 1; min = 3; break;
        case '6': usable = (n - 2) * koko; siedetty = 2; min = 4; break;
        case '10': usable = Math.floor(n / 2) * koko; siedetty = 1; min = 4; break;
        default: usable = n * koko; siedetty = 0;
      }
      var warn = n < min ? 'RAID ' + v.raid + ' vaatii vähintään ' + min + ' levyä.' : null;
      var raaka = n * koko;
      return {
        note: warn ? { text: warn, kind: 'warn' } : null,
        rows: [
          { k: 'Raakakapasiteetti', v: numAuto(raaka) + ' TB' },
          { k: 'Käytettävissä', v: numAuto(Math.max(0, usable)) + ' TB', big: true },
          { k: 'Hyötysuhde', v: numAuto(usable / raaka * 100) + ' %' },
          { k: 'Suositeltu käyttö (' + v.tayttoaste + ' %)', v: numAuto(usable * v.tayttoaste / 100) + ' TB', big: true },
          { k: 'Kestää levyrikkoja', v: siedetty === 0 ? 'ei yhtään — yksikin rikko vie kaiken datan' : siedetty + ' levyä', copy: false },
          { k: 'Pariteettiin menee', v: numAuto(raaka - usable) + ' TB', sub: true },
          { k: 'Varmuuskopiotila (3-2-1)', v: numAuto(usable * v.tayttoaste / 100 * 2) + ' TB', sub: true }
        ],
        foot: 'RAID ei ole varmuuskopio: se suojaa laiterikolta mutta ei poistoilta, kiristyshaittaohjelmilta tai tulipalolta. 3-2-1-sääntö: kolme kopiota, kahdella eri medialla, yksi eri paikassa.'
      };
    }
  });

  /* ---------- 9. Kantalukumuunnin ---------- */
  R({
    id: 'kantalukumuunnin', cat: 'verkko', name: 'Kantalukumuunnin', icon: 'i-code', kind: 'io',
    desc: 'Muunna lukuja binääri-, oktaali-, desimaali- ja heksadesimaalimuotojen välillä.',
    keys: ['binääri', 'heksa', 'oktaali', 'desimaali', 'kantaluku', 'muunna'],
    io: {
      inLabel: 'LUVUT', outLabel: 'MUUNNOKSET', lang: 'none',
      sample: '255\n1010\nFF\n0x1F4\n0b11001',
      opts: [{ k: 'kanta', type: 'select', label: 'Lähdekanta', def: 'auto', opts: [['auto', 'Tunnista etuliitteestä'], ['2', 'Binääri (2)'], ['8', 'Oktaali (8)'], ['10', 'Desimaali (10)'], ['16', 'Heksadesimaali (16)'], ['36', 'Base36']] }],
      run: function (t, o) {
        var out = t.split('\n').map(function (l) {
          var s = l.trim();
          if (!s) return '';
          var base = o.kanta === 'auto' ? null : +o.kanta, body = s;
          if (base === null) {
            if (/^0x/i.test(s)) { base = 16; body = s.slice(2); }
            else if (/^0b/i.test(s)) { base = 2; body = s.slice(2); }
            else if (/^0o/i.test(s)) { base = 8; body = s.slice(2); }
            else if (/^[01]+$/.test(s) && s.length > 3) base = 2;
            else if (/^\d+$/.test(s)) base = 10;
            else base = 16;
          } else body = s.replace(/^0[xbo]/i, '');
          var v = parseInt(body, base);
          if (!isFinite(v)) return s + '  ⟶ ei tulkittavissa kannassa ' + base;
          return s.padEnd(14) + '(kanta ' + String(base).padStart(2) + ') → ' +
            'DEC ' + v.toString(10).padEnd(14) + 'HEX 0x' + v.toString(16).toUpperCase().padEnd(12) +
            'OCT 0o' + v.toString(8).padEnd(12) + 'BIN 0b' + v.toString(2);
        }).join('\n');
        return { out: out, status: 'MUUNNETTU', kind: 'ok' };
      }
    }
  });

  /* ---------- 10. Bittioperaatiot ---------- */
  R({
    id: 'bittioperaatiot', cat: 'verkko', name: 'Bittioperaatiot', icon: 'i-zap',
    desc: 'Laske JA-, TAI-, XOR- ja siirto-operaatiot ja näe tulos binäärinä.',
    keys: ['bitti', 'and', 'or', 'xor', 'siirto', 'maski'],
    fields: [
      { k: 'a', type: 'text', label: 'Arvo A', def: '0b11001100', mono: true, hint: 'Käytä etuliitettä 0x, 0b tai 0o' },
      { k: 'b', type: 'text', label: 'Arvo B', def: '0b10101010', mono: true },
      { k: 'bitit', type: 'select', label: 'Bittileveys', def: '32', opts: [['8', '8 bittiä'], ['16', '16 bittiä'], ['32', '32 bittiä']] }
    ],
    run: function (v) {
      function p(s) {
        s = String(s || '').trim();
        if (/^0x/i.test(s)) return parseInt(s.slice(2), 16);
        if (/^0b/i.test(s)) return parseInt(s.slice(2), 2);
        if (/^0o/i.test(s)) return parseInt(s.slice(2), 8);
        return parseInt(s, 10);
      }
      var a = p(v.a), b = p(v.b), w = +v.bitit;
      if (!isFinite(a) || !isFinite(b)) return { note: { text: 'Syötä molemmat arvot.', kind: 'info' } };
      var mask = w === 32 ? 0xFFFFFFFF : (1 << w) - 1;
      function fmt(x) {
        x = (x & mask) >>> 0;
        return (x >>> 0).toString(2).padStart(w, '0').replace(/(.{4})(?=.)/g, '$1 ') + '   = ' + x + '   0x' + x.toString(16).toUpperCase();
      }
      return {
        rows: [
          { k: 'A', v: fmt(a) },
          { k: 'B', v: fmt(b) },
          { k: 'A AND B (&)', v: fmt(a & b), big: true },
          { k: 'A OR B (|)', v: fmt(a | b), big: true },
          { k: 'A XOR B (^)', v: fmt(a ^ b), big: true },
          { k: 'NOT A (~)', v: fmt(~a) },
          { k: 'A << 1', v: fmt(a << 1) },
          { k: 'A >> 1', v: fmt(a >> 1) },
          { k: 'A >>> 1 (etumerkitön)', v: fmt(a >>> 1) },
          { k: 'Ykkösbittejä A:ssa', v: String(((a & mask) >>> 0).toString(2).replace(/0/g, '').length), copy: false, sub: true },
          { k: 'Ykkösbittejä B:ssä', v: String(((b & mask) >>> 0).toString(2).replace(/0/g, '').length), copy: false, sub: true }
        ]
      };
    }
  });

  /* ---------- 11. ASCII-taulukko ---------- */
  R({
    id: 'ascii-taulukko', cat: 'verkko', name: 'ASCII-taulukko', icon: 'i-grid', kind: 'custom',
    desc: 'Selaa ASCII-merkistöä desimaali-, heksa- ja binääriarvoineen.',
    keys: ['ascii', 'merkistö', 'taulukko', 'koodi', 'merkki'],
    render: function (root, c) {
      var CTRL = ['NUL', 'SOH', 'STX', 'ETX', 'EOT', 'ENQ', 'ACK', 'BEL', 'BS', 'TAB', 'LF', 'VT', 'FF', 'CR', 'SO', 'SI',
        'DLE', 'DC1', 'DC2', 'DC3', 'DC4', 'NAK', 'SYN', 'ETB', 'CAN', 'EM', 'SUB', 'ESC', 'FS', 'GS', 'RS', 'US'];
      var q = h('input.ctl', { placeholder: 'Hae merkillä, koodilla tai nimellä…' });
      var box = h('div');
      function draw() {
        var s = q.value.trim().toLowerCase();
        var rows = [];
        for (var i = 0; i < 128; i++) {
          var name = i < 32 ? CTRL[i] : i === 32 ? 'SP (välilyönti)' : i === 127 ? 'DEL' : String.fromCharCode(i);
          var ch = i >= 33 && i < 127 ? String.fromCharCode(i) : '';
          var line = [i, '0x' + i.toString(16).toUpperCase().padStart(2, '0'), '0o' + i.toString(8), i.toString(2).padStart(8, '0'), ch, name,
            i < 32 || i === 127 ? 'ohjausmerkki' : i < 48 ? 'välimerkki' : i < 58 ? 'numero' : i < 65 ? 'välimerkki' : i < 91 ? 'iso kirjain' : i < 97 ? 'välimerkki' : i < 123 ? 'pieni kirjain' : 'välimerkki'];
          if (!s || line.join(' ').toLowerCase().indexOf(s) >= 0) rows.push(line);
        }
        MT.clear(box);
        box.appendChild(rows.length ? c.table(['Dec', 'Hex', 'Oct', 'Bin', 'Merkki', 'Nimi', 'Tyyppi'], rows, { text: [4, 5, 6] }) : c.empty('Ei osumia'));
      }
      q.addEventListener('input', MT.debounce(draw, 130));
      root.appendChild(c.panel('HAKU', 'i-search', h('div.panel-body', null, q)));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('ASCII 0–127', 'i-grid', box)));
      draw();
    }
  });

  /* ---------- 12. Merkkitutkin ---------- */
  R({
    id: 'merkkitutkin', cat: 'verkko', name: 'Unicode-merkkitutkin', icon: 'i-search', kind: 'io',
    desc: 'Tutki merkkijonon merkit yksitellen: koodipisteet, UTF-8-tavut ja näkymättömät merkit.',
    keys: ['unicode', 'merkki', 'koodipiste', 'utf-8', 'emoji', 'tavu'],
    io: {
      inLabel: 'TEKSTI', outLabel: 'MERKKIANALYYSI', lang: 'none',
      sample: 'Hei ÄÖÅ — “lainaus” … ⚠',
      run: function (t) {
        var enc = new TextEncoder();
        var lines = ['Merkki  Koodipiste  UTF-8-tavut         Nimi / kuvaus'];
        lines.push('-'.repeat(72));
        var arr = Array.from(t), invisible = 0;
        arr.slice(0, 2000).forEach(function (ch) {
          var cp = ch.codePointAt(0);
          var bytes = Array.prototype.map.call(enc.encode(ch), function (b) { return b.toString(16).toUpperCase().padStart(2, '0'); }).join(' ');
          var vis = cp === 32 ? '␣' : cp === 10 ? '⏎' : cp === 9 ? '⇥' : cp < 32 ? '·' : ch;
          var name = cp < 32 ? 'ohjausmerkki' : cp === 32 ? 'välilyönti' :
            cp === 0xA0 ? 'sitova välilyönti (NBSP) — usein tahaton!' :
              cp === 0x200B ? 'nollanlevyinen välilyönti — näkymätön!' :
                cp === 0xFEFF ? 'tavujärjestysmerkki (BOM) — näkymätön!' :
                  cp === 0xAD ? 'pehmeä tavuviiva — näkymätön!' :
                    cp >= 0x1F300 ? 'emoji tai symboli' :
                      cp > 127 ? 'ei-ASCII-merkki' : 'ASCII';
          if (/näkymätön|tahaton/.test(name)) invisible++;
          lines.push('  ' + vis.padEnd(6) + 'U+' + cp.toString(16).toUpperCase().padStart(4, '0').padEnd(10) + bytes.padEnd(20) + name);
        });
        if (arr.length > 2000) lines.push('… ja ' + (arr.length - 2000) + ' merkkiä lisää');
        lines.push('');
        lines.push('Merkkejä:        ' + arr.length + ' (JS-pituus ' + t.length + ')');
        lines.push('UTF-8-tavuja:    ' + enc.encode(t).length);
        lines.push('Näkymättömiä:    ' + invisible);
        return {
          out: lines.join('\n'), status: invisible ? 'NÄKYMÄTTÖMIÄ MERKKEJÄ LÖYTYI' : 'ANALYSOITU',
          kind: invisible ? 'warn' : 'ok', meta: [['MERKIT', arr.length], ['TAVUT', enc.encode(t).length]]
        };
      },
      foot: function (c) { return c.note('Näkymättömät merkit kuten sitova välilyönti (NBSP) ja nollanlevyinen välilyönti aiheuttavat usein selittämättömiä bugeja vertailuissa ja hauissa. Tämä työkalu paljastaa ne.', 'info'); }
    }
  });
})();
