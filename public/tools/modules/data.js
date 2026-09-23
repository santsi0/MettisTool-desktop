/* Moduuli: Data */
(function () {
  'use strict';
  var R = MT.reg, h = MT.h, num = MT.num, numAuto = MT.numAuto;
  var SAMPLE_NUM = '12,5\n18\n7,25\n22\n15\n9,5\n31\n18\n14\n26\n18\n11';

  function nums(t) {
    return (String(t).match(/-?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?/g) || [])
      .map(function (x) { return parseFloat(x.replace(',', '.')); })
      .filter(function (x) { return isFinite(x); });
  }
  function stats(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var n = a.length, sum = a.reduce(function (p, c) { return p + c; }, 0), mean = sum / n;
    var varP = a.reduce(function (p, c) { return p + Math.pow(c - mean, 2); }, 0) / n;
    var varS = n > 1 ? a.reduce(function (p, c) { return p + Math.pow(c - mean, 2); }, 0) / (n - 1) : 0;
    function q(p) {
      var i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
      return s[lo] + (s[hi] - s[lo]) * (i - lo);
    }
    var freq = {}, maxF = 0, modes = [];
    a.forEach(function (x) { freq[x] = (freq[x] || 0) + 1; if (freq[x] > maxF) maxF = freq[x]; });
    Object.keys(freq).forEach(function (k) { if (freq[k] === maxF) modes.push(parseFloat(k)); });
    return {
      n: n, sum: sum, mean: mean, min: s[0], max: s[n - 1], range: s[n - 1] - s[0],
      median: q(0.5), q1: q(0.25), q3: q(0.75), iqr: q(0.75) - q(0.25),
      varP: varP, varS: varS, sdP: Math.sqrt(varP), sdS: Math.sqrt(varS),
      cv: mean ? Math.sqrt(varS) / Math.abs(mean) * 100 : 0,
      modes: modes, maxF: maxF, sorted: s,
      geo: s[0] > 0 ? Math.exp(a.reduce(function (p, c) { return p + Math.log(c); }, 0) / n) : null,
      harm: a.every(function (x) { return x !== 0; }) ? n / a.reduce(function (p, c) { return p + 1 / c; }, 0) : null
    };
  }

  /* ---------- 1. Numeromuotoilija ---------- */
  R({
    id: 'numeromuotoilija', cat: 'data', name: 'Numeromuotoilija', icon: 'i-calc', kind: 'io',
    desc: 'Muotoile lukuja suomalaiseen tai muuhun esitystapaan: desimaalit, tuhaterottimet, valuutat.',
    keys: ['numero', 'muotoile', 'desimaali', 'valuutta', 'tuhaterotin'],
    io: {
      inLabel: 'LUVUT', outLabel: 'MUOTOILLUT', lang: 'none', sample: '1234567.891\n0.5\n-2500\n1e6\n42',
      opts: [
        { k: 'kieli', type: 'select', label: 'Muotoilu', def: 'fi-FI', opts: [['fi-FI', 'Suomi (1 234,57)'], ['en-US', 'Yhdysvallat (1,234.57)'], ['de-DE', 'Saksa (1.234,57)'], ['sv-SE', 'Ruotsi (1 234,57)']] },
        { k: 'tyyli', type: 'select', label: 'Tyyli', def: 'decimal', opts: [['decimal', 'Luku'], ['currency', 'Valuutta'], ['percent', 'Prosentti'], ['compact', 'Tiivis (1,2 milj.)']] },
        { k: 'valuutta', type: 'select', label: 'Valuutta', def: 'EUR', opts: [['EUR', 'Euro €'], ['USD', 'Dollari $'], ['SEK', 'Kruunu kr'], ['GBP', 'Punta £']] },
        { k: 'des', type: 'num', label: 'Desimaaleja', def: '2' }
      ],
      run: function (t, o) {
        var opt = { minimumFractionDigits: 0, maximumFractionDigits: Math.max(0, Math.min(20, Math.round(o.des) || 0)) };
        if (o.tyyli === 'currency') { opt.style = 'currency'; opt.currency = o.valuutta; opt.minimumFractionDigits = opt.maximumFractionDigits; }
        else if (o.tyyli === 'percent') opt.style = 'percent';
        else if (o.tyyli === 'compact') { opt.notation = 'compact'; opt.compactDisplay = 'long'; }
        var nf = new Intl.NumberFormat(o.kieli, opt);
        var out = t.split('\n').map(function (l) {
          if (!l.trim()) return '';
          var v = parseFloat(l.trim().replace(/\s/g, '').replace(',', '.'));
          if (!isFinite(v)) return l + '  ⟶ ei luku';
          return l.trim().padEnd(18) + ' → ' + nf.format(v);
        }).join('\n');
        return { out: out, status: 'MUOTOILTU', kind: 'ok' };
      }
    }
  });

  /* ---------- 2. Tilastolaskuri ---------- */
  R({
    id: 'tilastolaskuri', cat: 'data', name: 'Tilastolaskuri', icon: 'i-db', kind: 'custom',
    desc: 'Laske kattavat tunnusluvut lukujoukosta: keskiluvut, hajonta, kvartiilit ja jakauma.',
    keys: ['tilasto', 'keskiarvo', 'mediaani', 'hajonta', 'kvartiili', 'analyysi'],
    render: function (root, c) {
      var ed = c.editor({ label: 'LUVUT', placeholder: 'Yksi luku rivillä tai pilkuilla eroteltuna…', onInput: MT.debounce(upd, 220), drop: function (f) { MT.readFile(f).then(function (t) { ed.set(t); upd(); }); } });
      ed.el.style.minHeight = '380px';
      var out = h('div');
      function upd() {
        var a = nums(ed.get()), s = stats(a);
        MT.clear(out);
        if (!s) { out.appendChild(c.empty('Ei lukuja', 'Syötä numeroita vasemmalle.', 'i-db')); return; }
        out.appendChild(c.panel('TUNNUSLUVUT', 'i-db', c.resList([
          { k: 'Lukumäärä (n)', v: num(s.n), big: true },
          { k: 'Summa', v: numAuto(s.sum), big: true },
          { k: 'Keskiarvo', v: numAuto(s.mean), big: true },
          { k: 'Mediaani', v: numAuto(s.median), big: true },
          { k: 'Moodi', v: s.maxF > 1 ? s.modes.map(numAuto).join(', ') + ' (' + s.maxF + ' kertaa)' : 'ei toistuvia arvoja' },
          { k: 'Pienin', v: numAuto(s.min) },
          { k: 'Suurin', v: numAuto(s.max) },
          { k: 'Vaihteluväli', v: numAuto(s.range) },
          { k: 'Keskihajonta (otos)', v: numAuto(s.sdS), big: true },
          { k: 'Keskihajonta (perusjoukko)', v: numAuto(s.sdP) },
          { k: 'Varianssi (otos)', v: numAuto(s.varS) },
          { k: 'Variaatiokerroin', v: numAuto(s.cv) + ' %', sub: true },
          { k: 'Alakvartiili Q1', v: numAuto(s.q1) },
          { k: 'Yläkvartiili Q3', v: numAuto(s.q3) },
          { k: 'Kvartiiliväli IQR', v: numAuto(s.iqr) },
          { k: 'Geometrinen keskiarvo', v: s.geo === null ? '– (vaatii positiiviset luvut)' : numAuto(s.geo), sub: true },
          { k: 'Harmoninen keskiarvo', v: s.harm === null ? '– (nolla-arvo joukossa)' : numAuto(s.harm), sub: true }
        ])));
        var lo = s.q1 - 1.5 * s.iqr, hi = s.q3 + 1.5 * s.iqr;
        var out2 = s.sorted.filter(function (x) { return x < lo || x > hi; });
        out.appendChild(h('div', { style: { marginTop: '11px' } },
          out2.length ? c.note('<b>Mahdolliset poikkeavat arvot</b> (Tukeyn 1,5 × IQR -sääntö): ' + out2.map(numAuto).join(', '), 'warn')
            : c.note('Poikkeavia arvoja ei havaittu (Tukeyn 1,5 × IQR -sääntö).', 'ok')));
        var bins = Math.min(12, Math.max(4, Math.ceil(Math.sqrt(s.n))));
        var w = (s.range || 1) / bins, hist = new Array(bins).fill(0);
        a.forEach(function (x) { hist[Math.min(bins - 1, Math.floor((x - s.min) / w))]++; });
        var maxH = Math.max.apply(null, hist);
        var rows = hist.map(function (cnt, i) {
          return [numAuto(s.min + i * w) + ' – ' + numAuto(s.min + (i + 1) * w), cnt,
            '█'.repeat(Math.max(0, Math.round(cnt / maxH * 28)))];
        });
        out.appendChild(h('div', { style: { marginTop: '11px' } }, c.panel('JAKAUMA', 'i-grid', c.table(['Väli', 'Kpl', 'Osuus'], rows, { text: [0] }))));
      }
      ed.set(SAMPLE_NUM);
      root.appendChild(c.split(ed.el, out));
      upd();
    }
  });

  /* ---------- 3.–6. Yksittäiset tunnusluvut ---------- */
  function statTool(id, name, desc, keys, fn) {
    R({
      id: id, cat: 'data', name: name, icon: 'i-calc', kind: 'io', desc: desc, keys: keys,
      io: {
        inLabel: 'LUVUT', outLabel: 'TULOS', lang: 'none', sample: SAMPLE_NUM,
        run: function (t) {
          var a = nums(t), s = stats(a);
          if (!s) throw new Error('Syötteestä ei löytynyt lukuja');
          return { out: fn(s, a), status: s.n + ' LUKUA', kind: 'ok', meta: [['SUMMA', numAuto(s.sum)]] };
        }
      }
    });
  }
  statTool('keskiarvo', 'Keskiarvo', 'Laske lukujoukon aritmeettinen, geometrinen ja harmoninen keskiarvo.',
    ['keskiarvo', 'mean', 'average', 'summa'], function (s) {
      return ['Lukumäärä:               ' + num(s.n),
        'Summa:                   ' + numAuto(s.sum),
        'Aritmeettinen keskiarvo: ' + numAuto(s.mean),
        'Geometrinen keskiarvo:   ' + (s.geo === null ? '– (vaatii positiiviset luvut)' : numAuto(s.geo)),
        'Harmoninen keskiarvo:    ' + (s.harm === null ? '– (nolla-arvo joukossa)' : numAuto(s.harm)),
        'Painotettu keskiarvo:    käytä tilastolaskuria painoille',
        '',
        'Pienin: ' + numAuto(s.min) + '   Suurin: ' + numAuto(s.max)].join('\n');
    });
  statTool('mediaani', 'Mediaani', 'Laske keskiluku, joka jakaa aineiston kahtia.',
    ['mediaani', 'median', 'keskiluku'], function (s) {
      return ['Mediaani:      ' + numAuto(s.median),
        'Alakvartiili:  ' + numAuto(s.q1),
        'Yläkvartiili:  ' + numAuto(s.q3),
        'Kvartiiliväli: ' + numAuto(s.iqr),
        'Keskiarvo:     ' + numAuto(s.mean),
        '',
        'Mediaani on keskiarvoa luotettavampi kun aineistossa on poikkeavia arvoja.',
        '',
        'Järjestetty aineisto:',
        s.sorted.map(numAuto).join(', ')].join('\n');
    });
  statTool('moodi', 'Moodi', 'Etsi useimmin toistuvat arvot ja niiden frekvenssit.',
    ['moodi', 'mode', 'yleisin', 'frekvenssi'], function (s, a) {
      var freq = {};
      a.forEach(function (x) { freq[x] = (freq[x] || 0) + 1; });
      var keys = Object.keys(freq).sort(function (x, y) { return freq[y] - freq[x] || x - y; });
      return ['Moodi: ' + (s.maxF > 1 ? s.modes.map(numAuto).join(', ') : 'ei toistuvia arvoja'),
        'Esiintymiä: ' + s.maxF,
        '',
        'Frekvenssitaulukko:',
        keys.map(function (k) {
          return numAuto(parseFloat(k)).padStart(12) + '  ' + String(freq[k]).padStart(4) + '  ' +
            (freq[k] / a.length * 100).toFixed(1).replace('.', ',').padStart(6) + ' %  ' + '█'.repeat(freq[k]);
        }).join('\n')].join('\n');
    });
  statTool('keskihajonta', 'Keskihajonta', 'Laske hajontaluvut: keskihajonta, varianssi ja variaatiokerroin.',
    ['keskihajonta', 'hajonta', 'varianssi', 'sd'], function (s) {
      return ['Keskihajonta (otos, n−1):        ' + numAuto(s.sdS),
        'Keskihajonta (perusjoukko, n):   ' + numAuto(s.sdP),
        'Varianssi (otos):                ' + numAuto(s.varS),
        'Varianssi (perusjoukko):         ' + numAuto(s.varP),
        'Variaatiokerroin:                ' + numAuto(s.cv) + ' %',
        'Keskiarvon keskivirhe:           ' + numAuto(s.sdS / Math.sqrt(s.n)),
        '',
        'Keskiarvo ± 1 hajonta: ' + numAuto(s.mean - s.sdS) + ' … ' + numAuto(s.mean + s.sdS),
        'Keskiarvo ± 2 hajontaa: ' + numAuto(s.mean - 2 * s.sdS) + ' … ' + numAuto(s.mean + 2 * s.sdS),
        '',
        'Käytä otoshajontaa (n−1) kun aineisto on otos suuremmasta joukosta.'].join('\n');
    });

  /* ---------- 7. Prosenttimuutos ---------- */
  R({
    id: 'prosenttimuutos', cat: 'data', name: 'Prosenttimuutos', icon: 'i-zap', kind: 'io',
    desc: 'Laske peräkkäisten arvojen muutos prosentteina ja kokonaiskasvu.',
    keys: ['prosentti', 'muutos', 'kasvu', 'trendi', 'cagr'],
    io: {
      inLabel: 'ARVOT AIKAJÄRJESTYKSESSÄ', outLabel: 'MUUTOKSET', lang: 'none',
      sample: '1200\n1450\n1380\n1620\n1890\n2100',
      run: function (t) {
        var a = nums(t);
        if (a.length < 2) throw new Error('Anna vähintään kaksi lukua');
        var lines = ['Arvo          Muutos          Muutos %      Indeksi (ensimmäinen = 100)'];
        a.forEach(function (v, i) {
          if (i === 0) { lines.push(numAuto(v).padStart(10) + '            –               –           100,0'); return; }
          var d = v - a[i - 1], p = a[i - 1] ? d / Math.abs(a[i - 1]) * 100 : 0;
          lines.push(numAuto(v).padStart(10) + '  ' + ((d >= 0 ? '+' : '') + numAuto(d)).padStart(12) + '  ' +
            ((p >= 0 ? '+' : '') + numAuto(p) + ' %').padStart(12) + '  ' + numAuto(v / a[0] * 100).padStart(14));
        });
        var total = (a[a.length - 1] - a[0]) / Math.abs(a[0]) * 100;
        var cagr = a[0] > 0 && a[a.length - 1] > 0 ? (Math.pow(a[a.length - 1] / a[0], 1 / (a.length - 1)) - 1) * 100 : null;
        lines.push('');
        lines.push('Kokonaismuutos:        ' + (total >= 0 ? '+' : '') + numAuto(total) + ' %');
        lines.push('Keskimääräinen kasvu:  ' + (cagr === null ? '–' : (cagr >= 0 ? '+' : '') + numAuto(cagr) + ' % / jakso (CAGR)'));
        lines.push('Alkuarvo → loppuarvo:  ' + numAuto(a[0]) + ' → ' + numAuto(a[a.length - 1]));
        return { out: lines.join('\n'), status: 'LASKETTU', kind: 'ok', meta: [['JAKSOJA', a.length - 1]] };
      }
    }
  });

  /* ---------- 8. Datageneraattori ---------- */
  R({
    id: 'datageneraattori', cat: 'data', name: 'Datageneraattori', icon: 'i-dice',
    desc: 'Luo satunnaisia lukuja, päivämääriä, merkkijonoja tai totuusarvoja testaukseen.',
    keys: ['data', 'generoi', 'satunnainen', 'testi', 'mock'],
    fields: [
      { k: 'tyyppi', type: 'select', label: 'Tietotyyppi', def: 'kokonaisluku', opts: [
        ['kokonaisluku', 'Kokonaisluku'], ['desimaali', 'Desimaaliluku'], ['paiva', 'Päivämäärä'],
        ['aika', 'Aikaleima'], ['merkkijono', 'Satunnainen merkkijono'], ['totuus', 'Totuusarvo'],
        ['vari', 'HEX-väri'], ['ip', 'IPv4-osoite'], ['uuid', 'UUID']] },
      { k: 'kpl', type: 'num', label: 'Määrä', def: '20' },
      { k: 'min', type: 'num', label: 'Pienin arvo / pituus', def: '1' },
      { k: 'max', type: 'num', label: 'Suurin arvo', def: '1000' },
      { k: 'muoto', type: 'select', label: 'Tuloste', def: 'rivit', opts: [['rivit', 'Rivilista'], ['csv', 'Pilkuilla'], ['json', 'JSON-taulukko'], ['sql', 'SQL IN-lista']] }
    ],
    action: 'Luo data', live: false,
    run: function (v) {
      var n = Math.max(1, Math.min(10000, Math.round(v.kpl) || 1)), out = [];
      for (var i = 0; i < n; i++) {
        if (v.tyyppi === 'kokonaisluku') out.push(MT.rint(Math.round(v.min), Math.round(v.max)));
        else if (v.tyyppi === 'desimaali') out.push(+(v.min + Math.random() * (v.max - v.min)).toFixed(2));
        else if (v.tyyppi === 'paiva') out.push(MT.dateStr(new Date(Date.now() - MT.rint(0, 730) * 86400000)));
        else if (v.tyyppi === 'aika') out.push(new Date(Date.now() - MT.rint(0, 86400 * 365) * 1000).toISOString());
        else if (v.tyyppi === 'merkkijono') {
          var A = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', s = '';
          for (var j = 0; j < Math.max(1, Math.round(v.min)); j++) s += A[MT.rint(0, A.length - 1)];
          out.push(s);
        } else if (v.tyyppi === 'totuus') out.push(MT.rint(0, 1) ? 'true' : 'false');
        else if (v.tyyppi === 'vari') out.push('#' + MT.rint(0, 16777215).toString(16).padStart(6, '0'));
        else if (v.tyyppi === 'ip') out.push([MT.rint(1, 254), MT.rint(0, 255), MT.rint(0, 255), MT.rint(1, 254)].join('.'));
        else out.push(crypto.randomUUID ? crypto.randomUUID() : MT.uid(16));
      }
      var txt;
      var quote = ['merkkijono', 'paiva', 'aika', 'vari', 'ip', 'uuid'].indexOf(v.tyyppi) >= 0;
      if (v.muoto === 'csv') txt = out.join(', ');
      else if (v.muoto === 'json') txt = JSON.stringify(out, null, 2);
      else if (v.muoto === 'sql') txt = '(' + out.map(function (x) { return quote ? "'" + x + "'" : x; }).join(', ') + ')';
      else txt = out.join('\n');
      return {
        out: txt,
        html: h('pre.ed-out', { text: txt.length > 20000 ? txt.slice(0, 20000) + '\n…' : txt, style: { padding: '11px', maxHeight: '420px', border: '1px solid var(--bd)', borderRadius: '6px' } })
      };
    }
  });

  /* ---------- 9. Testiaineisto ---------- */
  var ETUNIMET = 'Matti Liisa Juho Anna Mikko Maria Timo Katri Antti Elina Ville Sanna Pekka Laura Jari Hanna Sami Tiina Olli Aino Eero Kaisa Lauri Noora Petri Riikka Markus Johanna Tuomas Emilia'.split(' ');
  var SUKUNIMET = 'Virtanen Korhonen Mäkinen Nieminen Mäkelä Hämäläinen Laine Heikkinen Koskinen Järvinen Lehtonen Lehtinen Saarinen Salminen Heinonen Niemi Heikkilä Kinnunen Salonen Turunen Salo Laitinen Tuominen Rantanen Karjalainen Jokinen Mattila Savolainen Lahtinen Ahonen'.split(' ');
  var KAUPUNGIT = 'Helsinki Espoo Tampere Vantaa Oulu Turku Jyväskylä Kuopio Lahti Pori Kouvola Joensuu Lappeenranta Hämeenlinna Vaasa Seinäjoki Rovaniemi Mikkeli Kotka Salo'.split(' ');
  var KADUT = 'Koivukuja Mäntytie Rantakatu Puistokatu Kirkkotie Keskuskatu Asematie Teollisuuskatu Kauppakatu Rautatienkatu'.split(' ');
  var OSASTOT = 'Myynti Markkinointi Tuotekehitys Talous Asiakaspalvelu Tuotanto Henkilöstö Logistiikka'.split(' ');
  R({
    id: 'testidata', cat: 'data', name: 'Testiaineiston generaattori', icon: 'i-db',
    desc: 'Luo realistista suomalaista testiaineistoa CSV-, JSON- tai SQL-muodossa.',
    keys: ['testidata', 'mock', 'fake', 'aineisto', 'demo', 'henkilöt'],
    fields: [
      { k: 'rivit', type: 'num', label: 'Rivejä', def: '25' },
      { k: 'muoto', type: 'select', label: 'Muoto', def: 'csv', opts: [['csv', 'CSV'], ['json', 'JSON'], ['sql', 'SQL INSERT'], ['taulukko', 'Markdown-taulukko']] },
      { k: 'taulu', type: 'text', label: 'Taulun nimi (SQL)', def: 'henkilot' },
      { k: 'sposti', type: 'check', label: 'Sähköposti', def: true },
      { k: 'puhelin', type: 'check', label: 'Puhelinnumero', def: true },
      { k: 'osoite', type: 'check', label: 'Osoite', def: true },
      { k: 'tyo', type: 'check', label: 'Osasto ja palkka', def: true }
    ],
    action: 'Luo aineisto', live: false,
    run: function (v) {
      var n = Math.max(1, Math.min(5000, Math.round(v.rivit) || 1));
      var cols = ['id', 'etunimi', 'sukunimi'];
      if (v.sposti) cols.push('sahkoposti');
      if (v.puhelin) cols.push('puhelin');
      if (v.osoite) cols.push('osoite', 'postinumero', 'kaupunki');
      if (v.tyo) cols.push('osasto', 'palkka', 'aloituspaiva');
      var rows = [];
      for (var i = 1; i <= n; i++) {
        var e = MT.pick(ETUNIMET), s = MT.pick(SUKUNIMET), k = MT.pick(KAUPUNGIT);
        var slug = function (x) { return x.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/å/g, 'a'); };
        var o = { id: i, etunimi: e, sukunimi: s };
        if (v.sposti) o.sahkoposti = slug(e) + '.' + slug(s) + '@esimerkki.fi';
        if (v.puhelin) o.puhelin = '+3584' + MT.rint(0, 9) + ' ' + MT.rint(100, 999) + ' ' + MT.rint(1000, 9999);
        if (v.osoite) { o.osoite = MT.pick(KADUT) + ' ' + MT.rint(1, 89); o.postinumero = String(MT.rint(100, 999) * 100).padStart(5, '0'); o.kaupunki = k; }
        if (v.tyo) {
          o.osasto = MT.pick(OSASTOT);
          o.palkka = MT.rint(2600, 7800);
          o.aloituspaiva = MT.dateStr(new Date(Date.now() - MT.rint(30, 3650) * 86400000));
        }
        rows.push(o);
      }
      var out;
      if (v.muoto === 'json') out = JSON.stringify(rows, null, 2);
      else if (v.muoto === 'sql') {
        out = rows.map(function (r) {
          return 'INSERT INTO ' + (v.taulu || 'taulu') + ' (' + cols.join(', ') + ') VALUES (' +
            cols.map(function (c2) { return typeof r[c2] === 'number' ? r[c2] : "'" + String(r[c2]).replace(/'/g, "''") + "'"; }).join(', ') + ');';
        }).join('\n');
      } else if (v.muoto === 'taulukko') {
        out = '| ' + cols.join(' | ') + ' |\n| ' + cols.map(function () { return '---'; }).join(' | ') + ' |\n' +
          rows.map(function (r) { return '| ' + cols.map(function (c2) { return r[c2]; }).join(' | ') + ' |'; }).join('\n');
      } else out = FMT.csvStringify([cols].concat(rows.map(function (r) { return cols.map(function (c2) { return r[c2]; }); })), ',');
      return {
        out: out,
        html: h('pre.ed-out', { text: out.length > 24000 ? out.slice(0, 24000) + '\n…' : out, style: { padding: '11px', maxHeight: '460px', border: '1px solid var(--bd)', borderRadius: '6px' } }),
        foot: 'Aineisto on täysin keksittyä eikä vastaa oikeita henkilöitä. Käytä sitä testaukseen ja demoihin — älä koskaan tuotantodatana.'
      };
    }
  });

  /* ---------- 10. Markdown-taulukko ---------- */
  R({
    id: 'markdown-taulukko', cat: 'data', name: 'Markdown-taulukko', icon: 'i-grid', kind: 'io',
    desc: 'Muunna CSV tai taulukkodata siistiksi Markdown-taulukoksi.',
    keys: ['markdown', 'taulukko', 'csv', 'muunna', 'dokumentaatio'],
    io: {
      inLabel: 'CSV TAI TAULUKKODATA', outLabel: 'MARKDOWN', lang: 'none', ext: '.md',
      sample: 'Moduuli;Työkaluja;Kuvaus\nKehittäjä;34;JSON, muotoilu ja koodaus\nTeksti;30;Muunna ja analysoi\nKuvat;18;Pakkaa ja muunna',
      opts: [
        { k: 'delim', type: 'select', label: 'Erotin', def: 'auto', opts: [['auto', 'Tunnista'], [',', 'Pilkku'], [';', 'Puolipiste'], ['\t', 'Sarkain']] },
        { k: 'tasaus', type: 'select', label: 'Tasaus', def: 'vasen', opts: [['vasen', 'Vasen'], ['keski', 'Keskitetty'], ['oikea', 'Oikea'], ['auto', 'Luvut oikealle']] },
        { k: 'leveys', type: 'check', label: 'Tasaa sarakkeiden leveydet', def: true }
      ],
      run: function (t, o) {
        var rows = FMT.csvParse(t, o.delim === 'auto' ? FMT.csvDetect(t) : o.delim).filter(function (r) { return r.length > 1 || r[0] !== ''; });
        if (!rows.length) throw new Error('Ei rivejä');
        var cols = Math.max.apply(null, rows.map(function (r) { return r.length; }));
        var w = [];
        for (var i = 0; i < cols; i++) {
          w[i] = Math.max.apply(null, rows.map(function (r) { return String(r[i] || '').length; }).concat([3]));
        }
        function isNum(i) { return rows.slice(1).every(function (r) { return !r[i] || /^-?[\d\s.,%€$]+$/.test(String(r[i]).trim()); }); }
        function cell(s, i) { s = String(s || ''); return o.leveys ? s.padEnd(w[i]) : s; }
        var head = '| ' + rows[0].map(function (x, i) { return cell(x, i); }).join(' | ') + ' |';
        var sep = '| ' + rows[0].map(function (_, i) {
          var a = o.tasaus === 'auto' ? (isNum(i) ? 'oikea' : 'vasen') : o.tasaus;
          var line = '-'.repeat(Math.max(3, o.leveys ? w[i] : 3));
          if (a === 'keski') return ':' + line.slice(0, -2) + ':';
          if (a === 'oikea') return line.slice(0, -1) + ':';
          return line;
        }).join(' | ') + ' |';
        var body = rows.slice(1).map(function (r) {
          return '| ' + Array.apply(null, Array(cols)).map(function (_, i) { return cell(r[i], i); }).join(' | ') + ' |';
        }).join('\n');
        return { out: [head, sep, body].join('\n') + '\n', status: rows.length - 1 + ' RIVIÄ', kind: 'ok', meta: [['SARAKKEET', cols]] };
      }
    }
  });

  /* ---------- 11. SQL INSERT ---------- */
  R({
    id: 'sql-insert', cat: 'data', name: 'SQL INSERT -generaattori', icon: 'i-db', kind: 'io',
    desc: 'Muunna CSV- tai JSON-data valmiiksi SQL-lisäyslauseiksi.',
    keys: ['sql', 'insert', 'tietokanta', 'csv', 'migraatio'],
    io: {
      inLabel: 'CSV TAI JSON', outLabel: 'SQL', lang: 'code', ext: '.sql',
      sample: 'id,nimi,hinta,aktiivinen\n1,Kahvi,12.90,true\n2,Tee,9.50,true\n3,Kaakao,11.00,false',
      opts: [
        { k: 'taulu', type: 'text', label: 'Taulun nimi', def: 'tuotteet', mono: true },
        { k: 'tyyli', type: 'select', label: 'Tyyli', def: 'rivi', opts: [['rivi', 'Yksi INSERT per rivi'], ['monirivi', 'Yksi INSERT, monta VALUES'], ['upsert', 'UPSERT (ON CONFLICT)']] },
        { k: 'lainaus', type: 'select', label: 'Tunnisteiden lainaus', def: 'ei', opts: [['ei', 'Ei lainausta'], ['"', 'Kaksoislainaus (PostgreSQL)'], ['`', 'Kenoheittomerkki (MySQL)'], ['[', 'Hakasulut (SQL Server)']] },
        { k: 'avain', type: 'text', label: 'Avainkenttä (UPSERT)', def: 'id', mono: true }
      ],
      run: function (t, o) {
        var rows, cols;
        var s = t.trim();
        if (s[0] === '[' || s[0] === '{') {
          var j = JSON.parse(s);
          if (!Array.isArray(j)) j = [j];
          cols = [];
          j.forEach(function (x) { Object.keys(x).forEach(function (k) { if (cols.indexOf(k) < 0) cols.push(k); }); });
          rows = j.map(function (x) { return cols.map(function (k) { return x[k]; }); });
        } else {
          var all = FMT.csvParse(t, FMT.csvDetect(t)).filter(function (r) { return r.length > 1 || r[0] !== ''; });
          cols = all.shift();
          rows = all;
        }
        if (!rows.length) throw new Error('Ei datariviä');
        var q = o.lainaus === 'ei' ? function (x) { return x; }
          : o.lainaus === '[' ? function (x) { return '[' + x + ']'; }
            : function (x) { return o.lainaus + x + o.lainaus; };
        function val(x) {
          if (x === null || x === undefined || x === '') return 'NULL';
          if (typeof x === 'number') return String(x);
          if (typeof x === 'boolean') return x ? 'TRUE' : 'FALSE';
          var v2 = String(x).trim();
          if (/^-?\d+(\.\d+)?$/.test(v2)) return v2;
          if (/^(true|false)$/i.test(v2)) return v2.toUpperCase();
          if (/^null$/i.test(v2)) return 'NULL';
          return "'" + v2.replace(/'/g, "''") + "'";
        }
        var tbl = q(o.taulu || 'taulu'), colList = cols.map(function (x) { return q(String(x).trim()); }).join(', ');
        var out;
        if (o.tyyli === 'monirivi') {
          out = 'INSERT INTO ' + tbl + ' (' + colList + ')\nVALUES\n' +
            rows.map(function (r) { return '  (' + r.map(val).join(', ') + ')'; }).join(',\n') + ';';
        } else if (o.tyyli === 'upsert') {
          out = rows.map(function (r) {
            return 'INSERT INTO ' + tbl + ' (' + colList + ') VALUES (' + r.map(val).join(', ') + ')\n' +
              '  ON CONFLICT (' + q(o.avain || 'id') + ') DO UPDATE SET ' +
              cols.filter(function (c2) { return c2 !== o.avain; }).map(function (c2) { return q(c2) + ' = EXCLUDED.' + q(c2); }).join(', ') + ';';
          }).join('\n\n');
        } else {
          out = rows.map(function (r) {
            return 'INSERT INTO ' + tbl + ' (' + colList + ') VALUES (' + r.map(val).join(', ') + ');';
          }).join('\n');
        }
        return { out: out, status: rows.length + ' RIVIÄ', kind: 'ok', meta: [['SARAKKEET', cols.length]] };
      },
      foot: function (c) { return c.note('Arvot lainataan yksinkertaisella heittomerkkisäännöllä. Tuotantokäytössä käytä aina parametrisoituja kyselyitä — älä koskaan rakenna SQL-lauseita käyttäjän syötteestä merkkijonoina.', 'warn'); }
    }
  });

  /* ---------- 12. Taulukkomuunnin ---------- */
  R({
    id: 'taulukkomuunnin', cat: 'data', name: 'Taulukkomuunnin', icon: 'i-refresh', kind: 'io',
    desc: 'Muunna taulukkodata HTML-, LaTeX-, JSON- tai tekstitaulukoksi.',
    keys: ['taulukko', 'html', 'latex', 'muunna', 'csv'],
    io: {
      inLabel: 'CSV', outLabel: 'TULOS', lang: 'none',
      sample: 'Tuote,Määrä,Hinta\nKahvi,120,12.90\nTee,80,9.50\nKaakao,45,11.00',
      opts: [{ k: 'kohde', type: 'select', label: 'Kohdemuoto', def: 'html', opts: [['html', 'HTML-taulukko'], ['latex', 'LaTeX'], ['json', 'JSON-objektit'], ['teksti', 'Tekstitaulukko'], ['lista', 'Luettelo']] }],
      run: function (t, o) {
        var rows = FMT.csvParse(t, FMT.csvDetect(t)).filter(function (r) { return r.length > 1 || r[0] !== ''; });
        if (!rows.length) throw new Error('Ei rivejä');
        var head = rows[0], body = rows.slice(1);
        var out;
        if (o.kohde === 'html') {
          out = '<table>\n  <thead>\n    <tr>' + head.map(function (x) { return '<th>' + FMT.xmlEsc(x) + '</th>'; }).join('') + '</tr>\n  </thead>\n  <tbody>\n' +
            body.map(function (r) { return '    <tr>' + head.map(function (_, i) { return '<td>' + FMT.xmlEsc(r[i] || '') + '</td>'; }).join('') + '</tr>'; }).join('\n') +
            '\n  </tbody>\n</table>';
        } else if (o.kohde === 'latex') {
          out = '\\begin{tabular}{' + head.map(function () { return 'l'; }).join('') + '}\n\\hline\n' +
            head.join(' & ') + ' \\\\\n\\hline\n' +
            body.map(function (r) { return head.map(function (_, i) { return (r[i] || '').replace(/([&%$#_])/g, '\\$1'); }).join(' & ') + ' \\\\'; }).join('\n') +
            '\n\\hline\n\\end{tabular}';
        } else if (o.kohde === 'json') {
          out = JSON.stringify(body.map(function (r) {
            var ob = {};
            head.forEach(function (k, i) { ob[k.trim()] = r[i] === undefined ? '' : r[i]; });
            return ob;
          }), null, 2);
        } else if (o.kohde === 'lista') {
          out = body.map(function (r) {
            return '- ' + head.map(function (k, i) { return k + ': ' + (r[i] || ''); }).join(', ');
          }).join('\n');
        } else {
          var w = head.map(function (_, i) {
            return Math.max.apply(null, rows.map(function (r) { return String(r[i] || '').length; }));
          });
          var line = '+' + w.map(function (x) { return '-'.repeat(x + 2); }).join('+') + '+';
          out = [line, '| ' + head.map(function (x, i) { return String(x).padEnd(w[i]); }).join(' | ') + ' |', line]
            .concat(body.map(function (r) { return '| ' + head.map(function (_, i) { return String(r[i] || '').padEnd(w[i]); }).join(' | ') + ' |'; }))
            .concat([line]).join('\n');
        }
        return { out: out, lang: o.kohde === 'html' ? 'xml' : o.kohde === 'json' ? 'json' : 'none', status: 'MUUNNETTU', kind: 'ok', meta: [['RIVIT', body.length]] };
      }
    }
  });

  /* ---------- 13. Datan siivous ---------- */
  R({
    id: 'datan-siivous', cat: 'data', name: 'Datan siivous', icon: 'i-filter', kind: 'io',
    desc: 'Siivoa CSV-aineisto: tyhjät rivit, kaksoiskappaleet, välilyönnit ja desimaalierottimet.',
    keys: ['siivoa', 'puhdista', 'csv', 'duplikaatti', 'data'],
    io: {
      inLabel: 'CSV', outLabel: 'SIIVOTTU CSV', lang: 'none',
      sample: 'nimi, hinta ,maara\n Kahvi , 12,90 , 5\n\nTee,9,50,3\n Kahvi , 12,90 , 5\nKaakao, , 2\n',
      opts: [
        { k: 'trim', type: 'check', label: 'Poista kenttien ylimääräiset välit', def: true },
        { k: 'tyhjat', type: 'check', label: 'Poista tyhjät rivit', def: true },
        { k: 'dupl', type: 'check', label: 'Poista kaksoiskappaleet', def: true },
        { k: 'puuttuvat', type: 'check', label: 'Poista rivit joilta puuttuu arvoja', def: false },
        { k: 'piste', type: 'check', label: 'Muunna desimaalipilkut pisteiksi', def: false }
      ],
      run: function (t, o) {
        var d = FMT.csvDetect(t);
        var rows = FMT.csvParse(t, d);
        var head = rows.shift(), before = rows.length, seen = {}, removed = { tyhja: 0, dupl: 0, puuttuva: 0 };
        var out = rows.filter(function (r) {
          if (o.tyhjat && r.every(function (x) { return !String(x).trim(); })) { removed.tyhja++; return false; }
          return true;
        }).map(function (r) {
          return r.map(function (x) {
            var s = o.trim ? String(x).trim() : String(x);
            if (o.piste && /^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
            return s;
          });
        }).filter(function (r) {
          if (o.puuttuvat && r.some(function (x) { return !String(x).trim(); })) { removed.puuttuva++; return false; }
          if (o.dupl) {
            var k = r.join('\u0001');
            if (seen[k]) { removed.dupl++; return false; }
            seen[k] = 1;
          }
          return true;
        });
        var headClean = o.trim ? head.map(function (x) { return String(x).trim(); }) : head;
        return {
          out: FMT.csvStringify([headClean].concat(out), d),
          status: 'SIIVOTTU', kind: 'ok',
          meta: [['ENNEN', before], ['JÄLKEEN', out.length], ['TYHJIÄ', removed.tyhja], ['DUPLIKAATTEJA', removed.dupl], ['PUUTTUVIA', removed.puuttuva]]
        };
      }
    }
  });

  /* ---------- 14. Ryhmittely ---------- */
  R({
    id: 'ryhmittely', cat: 'data', name: 'Ryhmittely ja yhteenveto', icon: 'i-db', kind: 'io',
    desc: 'Ryhmittele CSV-data sarakkeen mukaan ja laske summat, keskiarvot ja lukumäärät.',
    keys: ['ryhmittele', 'group by', 'yhteenveto', 'pivot', 'summa'],
    io: {
      inLabel: 'CSV', outLabel: 'YHTEENVETO', lang: 'none',
      sample: 'osasto,henkilo,palkka\nMyynti,Matti,3400\nMyynti,Liisa,3800\nTuotekehitys,Juho,4600\nTuotekehitys,Anna,5100\nTuotekehitys,Mikko,4400\nTalous,Maria,4000',
      opts: [
        { k: 'ryhma', type: 'text', label: 'Ryhmittelysarake', def: 'osasto', mono: true },
        { k: 'arvo', type: 'text', label: 'Laskettava sarake', def: 'palkka', mono: true },
        { k: 'lajittelu', type: 'select', label: 'Järjestys', def: 'summa', opts: [['summa', 'Summan mukaan'], ['nimi', 'Nimen mukaan'], ['kpl', 'Lukumäärän mukaan']] }
      ],
      run: function (t, o) {
        var d = FMT.csvDetect(t), rows = FMT.csvParse(t, d).filter(function (r) { return r.length > 1 || r[0] !== ''; });
        var head = rows.shift().map(function (x) { return String(x).trim(); });
        var gi = head.indexOf((o.ryhma || '').trim()), vi = head.indexOf((o.arvo || '').trim());
        if (gi < 0) throw new Error('Saraketta "' + o.ryhma + '" ei löydy. Sarakkeet: ' + head.join(', '));
        var g = {};
        rows.forEach(function (r) {
          var k = String(r[gi] || '(tyhjä)').trim();
          var b = g[k] || (g[k] = { n: 0, sum: 0, vals: [] });
          b.n++;
          if (vi >= 0) {
            var v = parseFloat(String(r[vi]).replace(/\s/g, '').replace(',', '.'));
            if (isFinite(v)) { b.sum += v; b.vals.push(v); }
          }
        });
        var keys = Object.keys(g);
        keys.sort(function (a, b) {
          if (o.lajittelu === 'nimi') return a.localeCompare(b, 'fi');
          if (o.lajittelu === 'kpl') return g[b].n - g[a].n;
          return g[b].sum - g[a].sum;
        });
        var total = keys.reduce(function (a, k) { return a + g[k].sum; }, 0);
        var totalN = keys.reduce(function (a, k) { return a + g[k].n; }, 0);
        var w = Math.max.apply(null, keys.map(function (k) { return k.length; }).concat([10]));
        var lines = ['Ryhmä'.padEnd(w) + '   Kpl      Summa   Keskiarvo     Min     Max    Osuus'];
        lines.push('-'.repeat(w + 58));
        keys.forEach(function (k) {
          var b = g[k], s = stats(b.vals);
          lines.push(k.padEnd(w) + ' ' + String(b.n).padStart(5) + ' ' + numAuto(b.sum).padStart(10) + ' ' +
            (s ? numAuto(s.mean) : '–').padStart(11) + ' ' + (s ? numAuto(s.min) : '–').padStart(7) + ' ' +
            (s ? numAuto(s.max) : '–').padStart(7) + ' ' + (total ? (b.sum / total * 100).toFixed(1).replace('.', ',') + ' %' : '–').padStart(8));
        });
        lines.push('-'.repeat(w + 58));
        lines.push('YHTEENSÄ'.padEnd(w) + ' ' + String(totalN).padStart(5) + ' ' + numAuto(total).padStart(10));
        return { out: lines.join('\n'), status: keys.length + ' RYHMÄÄ', kind: 'ok', meta: [['RIVEJÄ', totalN]] };
      }
    }
  });

  /* ---------- 15. Lukujono ---------- */
  R({
    id: 'lukujono', cat: 'data', name: 'Lukujonogeneraattori', icon: 'i-grid',
    desc: 'Luo lukujonoja: aritmeettinen, geometrinen, Fibonacci tai alkuluvut.',
    keys: ['lukujono', 'sarja', 'fibonacci', 'alkuluku', 'sekvenssi'],
    fields: [
      { k: 'tyyppi', type: 'select', label: 'Jonon tyyppi', def: 'aritmeettinen', opts: [
        ['aritmeettinen', 'Aritmeettinen (+ askel)'], ['geometrinen', 'Geometrinen (× kerroin)'],
        ['fibonacci', 'Fibonacci'], ['alkuluvut', 'Alkuluvut'], ['nelio', 'Neliöluvut'], ['kertoma', 'Kertomat']] },
      { k: 'alku', type: 'num', label: 'Aloitusarvo', def: '1' },
      { k: 'askel', type: 'num', label: 'Askel tai kerroin', def: '2' },
      { k: 'kpl', type: 'num', label: 'Termien määrä', def: '20' },
      { k: 'erotin', type: 'select', label: 'Erotin', def: ', ', opts: [[', ', 'Pilkku'], ['\n', 'Rivinvaihto'], [' ', 'Välilyönti'], ['; ', 'Puolipiste']] }
    ],
    run: function (v) {
      var n = Math.max(1, Math.min(2000, Math.round(v.kpl) || 1)), out = [];
      if (v.tyyppi === 'aritmeettinen') for (var i = 0; i < n; i++) out.push(v.alku + i * v.askel);
      else if (v.tyyppi === 'geometrinen') for (i = 0; i < n; i++) out.push(v.alku * Math.pow(v.askel, i));
      else if (v.tyyppi === 'fibonacci') { var a = 0, b = 1; for (i = 0; i < n; i++) { out.push(a); var t = a + b; a = b; b = t; } }
      else if (v.tyyppi === 'nelio') for (i = 1; i <= n; i++) out.push(i * i);
      else if (v.tyyppi === 'kertoma') { var f = 1; for (i = 1; i <= Math.min(n, 170); i++) { f *= i; out.push(f); } }
      else {
        var x = 2;
        while (out.length < n && x < 1e7) {
          var p = true;
          for (var j = 2; j * j <= x; j++) if (x % j === 0) { p = false; break; }
          if (p) out.push(x);
          x++;
        }
      }
      var s = stats(out.filter(isFinite));
      return {
        out: out.join(v.erotin),
        rows: [
          { k: 'Termejä', v: String(out.length), copy: false },
          { k: 'Summa', v: s ? numAuto(s.sum) : '–', copy: false },
          { k: 'Ensimmäinen', v: numAuto(out[0]), copy: false },
          { k: 'Viimeinen', v: numAuto(out[out.length - 1]), copy: false }
        ],
        html: h('pre.ed-out', { text: out.join(v.erotin), style: { padding: '11px', maxHeight: '320px', border: '1px solid var(--bd)', borderRadius: '6px', whiteSpace: 'pre-wrap' } })
      };
    }
  });

  /* ---------- 16. Satunnaisotanta ---------- */
  R({
    id: 'satunnaisotanta', cat: 'data', name: 'Satunnaisotanta', icon: 'i-dice', kind: 'io',
    desc: 'Poimi satunnainen otos riveistä tai sekoita koko lista — arvontoihin ja testaukseen.',
    keys: ['otanta', 'satunnainen', 'arvonta', 'sekoita', 'valinta'],
    io: {
      inLabel: 'RIVIT', outLabel: 'OTOS', lang: 'none',
      sample: 'Matti Virtanen\nLiisa Korhonen\nJuho Mäkinen\nAnna Nieminen\nMikko Mäkelä\nMaria Hämäläinen\nTimo Laine\nKatri Heikkinen',
      opts: [
        { k: 'tapa', type: 'select', label: 'Toiminto', def: 'otos', opts: [['otos', 'Poimi satunnainen otos'], ['sekoita', 'Sekoita kaikki rivit'], ['jaa', 'Jaa ryhmiin']] },
        { k: 'kpl', type: 'num', label: 'Otoksen koko / ryhmien määrä', def: '3' },
        { k: 'numeroi', type: 'check', label: 'Numeroi tulokset', def: true }
      ],
      run: function (t, o) {
        var lines = t.split('\n').filter(function (l) { return l.trim(); });
        if (!lines.length) throw new Error('Ei rivejä');
        var n = Math.max(1, Math.round(o.kpl) || 1);
        var sh = MT.shuffle(lines), out;
        if (o.tapa === 'otos') {
          out = sh.slice(0, Math.min(n, lines.length));
          out = out.map(function (x, i) { return o.numeroi ? (i + 1) + '. ' + x : x; });
          return { out: out.join('\n'), status: out.length + ' / ' + lines.length + ' POIMITTU', kind: 'ok' };
        }
        if (o.tapa === 'sekoita') {
          out = sh.map(function (x, i) { return o.numeroi ? (i + 1) + '. ' + x : x; });
          return { out: out.join('\n'), status: 'SEKOITETTU', kind: 'ok', meta: [['RIVIT', lines.length]] };
        }
        var groups = [];
        for (var i = 0; i < n; i++) groups.push([]);
        sh.forEach(function (x, i) { groups[i % n].push(x); });
        out = groups.map(function (g, i) {
          return 'Ryhmä ' + (i + 1) + ' (' + g.length + ')\n' + g.map(function (x, j) { return '  ' + (o.numeroi ? (j + 1) + '. ' : '') + x; }).join('\n');
        }).join('\n\n');
        return { out: out, status: n + ' RYHMÄÄ', kind: 'ok', meta: [['RIVIT', lines.length]] };
      },
      foot: function (c) { return c.note('Sekoitus käyttää Fisher–Yates-algoritmia ja selaimen kryptografista satunnaisgeneraattoria — tulos on aidosti satunnainen ja sopii myös arvontoihin.', 'info'); }
    }
  });
})();
