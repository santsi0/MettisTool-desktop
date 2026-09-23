/* Moduuli: Tekniikka */
(function () {
  'use strict';
  var R = MT.reg, h = MT.h, numAuto = MT.numAuto, num = MT.num;

  /* ---------- 1. Ohmin laki ---------- */
  R({
    id: 'ohmin-laki', cat: 'tekniikka', name: 'Ohmin laki', icon: 'i-bolt',
    desc: 'Laske jännite, virta, vastus ja teho — täytä kaksi arvoa, muut lasketaan.',
    keys: ['ohm', 'jännite', 'virta', 'vastus', 'teho', 'sähkö'],
    fields: [
      { k: 'u', type: 'num', label: 'Jännite U (V)', def: '230' },
      { k: 'i', type: 'num', label: 'Virta I (A)', def: '' },
      { k: 'r', type: 'num', label: 'Vastus R (Ω)', def: '46' },
      { k: 'p', type: 'num', label: 'Teho P (W)', def: '' }
    ],
    run: function (v) {
      var u = v.u, i = v.i, r = v.r, p = v.p;
      var known = [u, i, r, p].filter(isFinite).length;
      if (known < 2) return { note: { text: 'Syötä vähintään kaksi arvoa — loput lasketaan automaattisesti.', kind: 'info' } };
      if (isFinite(u) && isFinite(i)) { r = u / i; p = u * i; }
      else if (isFinite(u) && isFinite(r)) { i = u / r; p = u * i; }
      else if (isFinite(u) && isFinite(p)) { i = p / u; r = u / i; }
      else if (isFinite(i) && isFinite(r)) { u = i * r; p = u * i; }
      else if (isFinite(i) && isFinite(p)) { u = p / i; r = u / i; }
      else if (isFinite(r) && isFinite(p)) { i = Math.sqrt(p / r); u = i * r; }
      return {
        rows: [
          { k: 'Jännite U', v: numAuto(u) + ' V', big: true },
          { k: 'Virta I', v: numAuto(i) + ' A', big: true },
          { k: 'Vastus R', v: numAuto(r) + ' Ω', big: true },
          { k: 'Teho P', v: numAuto(p) + ' W', big: true },
          { k: 'Energia tunnissa', v: numAuto(p / 1000) + ' kWh', sub: true },
          { k: 'Johtimen kuormitus', v: i > 16 ? 'yli 16 A — tarkista johdinpoikkipinta ja sulake' : 'normaali kotitalouskuorma', copy: false, sub: true }
        ],
        foot: 'U = R × I  ·  P = U × I  ·  P = I² × R  ·  P = U² / R. Sähkötöitä saa Suomessa tehdä vain pätevöitynyt sähköasentaja.'
      };
    }
  });

  /* ---------- 2. Teholaskuri ---------- */
  R({
    id: 'teholaskuri', cat: 'tekniikka', name: 'Teholaskuri', icon: 'i-bolt',
    desc: 'Laske pätöteho, näennäisteho ja virta yksi- tai kolmivaihejärjestelmässä.',
    keys: ['teho', 'watti', 'kolmivaihe', 'cos', 'sähkö'],
    fields: [
      { k: 'vaihe', type: 'select', label: 'Järjestelmä', def: '1', opts: [['1', 'Yksivaihe (230 V)'], ['3', 'Kolmivaihe (400 V)']] },
      { k: 'u', type: 'num', label: 'Jännite (V)', def: '230' },
      { k: 'i', type: 'num', label: 'Virta (A)', def: '10' },
      { k: 'cos', type: 'num', label: 'Tehokerroin cos φ', def: '0,95' },
      { k: 'tunnit', type: 'num', label: 'Käyttötunnit', def: '8' },
      { k: 'hinta', type: 'num', label: 'Sähkön hinta (snt/kWh)', def: '15' }
    ],
    run: function (v) {
      if (!isFinite(v.u) || !isFinite(v.i)) return null;
      var k = v.vaihe === '3' ? Math.sqrt(3) : 1;
      var cos = isFinite(v.cos) ? v.cos : 1;
      var S = k * v.u * v.i, P = S * cos, Q = S * Math.sin(Math.acos(Math.min(1, cos)));
      var kwh = P / 1000 * (isFinite(v.tunnit) ? v.tunnit : 0);
      return {
        rows: [
          { k: 'Pätöteho P', v: numAuto(P) + ' W  (' + numAuto(P / 1000) + ' kW)', big: true },
          { k: 'Näennäisteho S', v: numAuto(S) + ' VA' },
          { k: 'Loisteho Q', v: numAuto(Q) + ' var' },
          { k: 'Tehokerroin', v: numAuto(cos) },
          { k: 'Energia käyttöaikana', v: numAuto(kwh) + ' kWh', big: true },
          { k: 'Kustannus', v: num(+(kwh * (isFinite(v.hinta) ? v.hinta : 0) / 100).toFixed(2), 2) + ' €' },
          { k: 'Sulaketarve (arvio)', v: [10, 16, 20, 25, 35, 50, 63, 80, 100].filter(function (x) { return x >= v.i * 1.25; })[0] + ' A', copy: false, sub: true }
        ],
        foot: 'Kolmivaiheteho: P = √3 × U × I × cos φ. Sulakesuositus on karkea arvio (1,25 × kuormitusvirta) — mitoituksen tekee aina sähkösuunnittelija.'
      };
    }
  });

  /* ---------- 3. Jännitteenjako ---------- */
  R({
    id: 'jannitelaskuri', cat: 'tekniikka', name: 'Jännitteenjako', icon: 'i-bolt',
    desc: 'Laske jännitteenjakajan lähtöjännite ja häviöteho.',
    keys: ['jännite', 'jakaja', 'vastus', 'divider', 'elektroniikka'],
    fields: [
      { k: 'uin', type: 'num', label: 'Tulojännite Uin (V)', def: '12' },
      { k: 'r1', type: 'num', label: 'Vastus R1 (Ω)', def: '10000' },
      { k: 'r2', type: 'num', label: 'Vastus R2 (Ω)', def: '4700' }
    ],
    run: function (v) {
      if (!isFinite(v.uin) || !isFinite(v.r1) || !isFinite(v.r2) || (v.r1 + v.r2) === 0) return null;
      var uout = v.uin * v.r2 / (v.r1 + v.r2);
      var i = v.uin / (v.r1 + v.r2);
      return {
        rows: [
          { k: 'Lähtöjännite Uout', v: numAuto(uout) + ' V', big: true },
          { k: 'Jakosuhde', v: numAuto(uout / v.uin * 100) + ' %' },
          { k: 'Virta piirissä', v: numAuto(i * 1000) + ' mA' },
          { k: 'Häviöteho yhteensä', v: numAuto(v.uin * i * 1000) + ' mW' },
          { k: 'Teho R1:ssä', v: numAuto(i * i * v.r1 * 1000) + ' mW', sub: true },
          { k: 'Teho R2:ssa', v: numAuto(i * i * v.r2 * 1000) + ' mW', sub: true },
          { k: 'Lähtöimpedanssi', v: numAuto(v.r1 * v.r2 / (v.r1 + v.r2)) + ' Ω', sub: true }
        ],
        foot: 'Uout = Uin × R2 / (R1 + R2). Kuormitus laskee lähtöjännitettä — kuorman vastuksen tulisi olla vähintään 10× lähtöimpedanssi.'
      };
    }
  });

  /* ---------- 4. Vastuslaskuri ---------- */
  var VARIT = ['musta', 'ruskea', 'punainen', 'oranssi', 'keltainen', 'vihreä', 'sininen', 'violetti', 'harmaa', 'valkoinen'];
  var VARI_HEX = ['#1a1a1a', '#6b3f1d', '#d13b28', '#e08a38', '#e8d44a', '#3fb37f', '#3b82f6', '#9061f9', '#9ca3af', '#f3f4f6'];
  R({
    id: 'vastuslaskuri', cat: 'tekniikka', name: 'Vastuslaskuri', icon: 'i-zap', kind: 'custom',
    desc: 'Sarjaan ja rinnan kytketyt vastukset sekä vastusten värikoodit.',
    keys: ['vastus', 'sarja', 'rinnan', 'väri', 'resistori', 'ohm'],
    render: function (root, c) {
      var ta = h('textarea.ctl', { rows: 5, value: '1000\n4700\n10000', placeholder: 'Yksi vastus rivillä (Ω)' });
      var out = h('div');
      function calc() {
        var vals = (ta.value.match(/[\d.,]+/g) || []).map(function (x) { return parseFloat(x.replace(',', '.')); }).filter(function (x) { return isFinite(x) && x > 0; });
        MT.clear(out);
        if (!vals.length) { out.appendChild(c.empty('Ei vastuksia', 'Syötä arvot yläpuolelle.')); return; }
        var sarja = vals.reduce(function (a, b) { return a + b; }, 0);
        var rinnan = 1 / vals.reduce(function (a, b) { return a + 1 / b; }, 0);
        out.appendChild(c.resList([
          { k: 'Sarjaan kytkettynä', v: fmtOhm(sarja), big: true },
          { k: 'Rinnan kytkettynä', v: fmtOhm(rinnan), big: true },
          { k: 'Vastuksia', v: String(vals.length), copy: false },
          { k: 'Pienin', v: fmtOhm(Math.min.apply(null, vals)), copy: false },
          { k: 'Suurin', v: fmtOhm(Math.max.apply(null, vals)), copy: false }
        ]));
      }
      function fmtOhm(x) {
        if (x >= 1e6) return numAuto(x / 1e6) + ' MΩ';
        if (x >= 1e3) return numAuto(x / 1e3) + ' kΩ';
        return numAuto(x) + ' Ω';
      }
      ta.addEventListener('input', MT.debounce(calc, 180));

      /* väriköodi */
      var F = [
        { k: 'arvo', type: 'num', label: 'Vastuksen arvo (Ω)', def: '4700' },
        { k: 'renkaat', type: 'select', label: 'Renkaita', def: '4', opts: [['4', '4 rengasta'], ['5', '5 rengasta']] }
      ];
      var box = c.fields(F, colors), cout = h('div');
      function colors() {
        var v = c.readFields(box, F);
        MT.clear(cout);
        if (!isFinite(v.arvo) || v.arvo <= 0) { cout.appendChild(c.empty('Syötä arvo')); return; }
        var digits = +v.renkaat === 5 ? 3 : 2;
        var s = Math.round(v.arvo).toString();
        var mult = s.length - digits;
        if (mult < 0) { s = s + '0'.repeat(-mult); mult = 0; }
        var sig = s.slice(0, digits);
        var bands = sig.split('').map(Number).concat([mult]);
        var row = h('div', { style: { display: 'flex', gap: '9px', padding: '16px', alignItems: 'center', justifyContent: 'center', background: 'var(--panel-3)', borderRadius: '6px', margin: '11px' } });
        bands.forEach(function (b) {
          row.appendChild(h('div', { style: { width: '26px', height: '74px', background: VARI_HEX[b] || '#000', borderRadius: '3px', border: '1px solid var(--bd)' }, title: VARIT[b] }));
        });
        row.appendChild(h('div', { style: { width: '26px', height: '74px', background: '#d4af37', borderRadius: '3px', border: '1px solid var(--bd)' }, title: 'kulta — toleranssi ±5 %' }));
        cout.appendChild(row);
        cout.appendChild(c.resList([
          { k: 'Väriraidat', v: bands.map(function (b) { return VARIT[b]; }).join(' – ') + ' – kulta', copy: false, big: true },
          { k: 'Arvo', v: fmtOhm(v.arvo), copy: false },
          { k: 'Toleranssi ±5 %', v: fmtOhm(v.arvo * 0.95) + ' … ' + fmtOhm(v.arvo * 1.05), copy: false },
          { k: 'Lähin E12-arvo', v: fmtOhm(e12(v.arvo)), copy: false }
        ]));
      }
      function e12(x) {
        var E = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
        var dec = Math.pow(10, Math.floor(Math.log10(x)));
        var norm = x / dec, best = E[0];
        E.forEach(function (e) { if (Math.abs(e - norm) < Math.abs(best - norm)) best = e; });
        return best * dec;
      }
      root.appendChild(h('div.home-grid', null, [
        c.panel('KYTKENTÄ', 'i-zap', h('div', null, [h('div.panel-body', null, ta), out])),
        c.panel('VÄRIKOODI', 'i-palette', h('div', null, [h('div.panel-body', null, box), cout]))
      ]));
      calc(); colors();
    }
  });

  /* ---------- 5. Energialaskuri ---------- */
  R({
    id: 'energialaskuri', cat: 'tekniikka', name: 'Energialaskuri', icon: 'i-bolt',
    desc: 'Muunna energiayksiköitä ja laske lämmitysenergian tarve.',
    keys: ['energia', 'joule', 'kwh', 'lämmitys', 'kalori'],
    fields: [
      { k: 'tapa', type: 'select', label: 'Laskutapa', def: 'muunnos', opts: [['muunnos', 'Yksikkömuunnos'], ['lammitys', 'Veden lämmitys'], ['liike', 'Liike-energia']] },
      { k: 'arvo', type: 'num', label: 'Energia', def: '1' },
      { k: 'yks', type: 'select', label: 'Yksikkö', def: 'kWh', opts: [['J', 'joulea'], ['kJ', 'kilojoulea'], ['Wh', 'wattituntia'], ['kWh', 'kilowattituntia'], ['cal', 'kaloria'], ['kcal', 'kilokaloria']] },
      { k: 'massa', type: 'num', label: 'Massa (kg tai litraa)', def: '100' },
      { k: 'dt', type: 'num', label: 'Lämpötilan muutos (°C)', def: '40' },
      { k: 'nopeus', type: 'num', label: 'Nopeus (km/h)', def: '100' }
    ],
    run: function (v) {
      var F = { J: 1, kJ: 1000, Wh: 3600, kWh: 3.6e6, cal: 4.184, kcal: 4184 };
      if (v.tapa === 'lammitys') {
        if (!isFinite(v.massa) || !isFinite(v.dt)) return null;
        var j = v.massa * 4186 * v.dt;
        return {
          rows: [
            { k: 'Tarvittava energia', v: numAuto(j / 3.6e6) + ' kWh', big: true },
            { k: 'Joulea', v: numAuto(j) + ' J' },
            { k: 'Kilokaloria', v: numAuto(j / 4184) + ' kcal' },
            { k: 'Kustannus (15 snt/kWh)', v: num(+(j / 3.6e6 * 0.15).toFixed(2), 2) + ' €' },
            { k: 'Aika 2 kW teholla', v: numAuto(j / 2000 / 60) + ' min', sub: true },
            { k: 'Aika 9 kW teholla', v: numAuto(j / 9000 / 60) + ' min', sub: true }
          ],
          foot: 'Veden ominaislämpökapasiteetti on 4186 J/(kg·°C). Laskelma ei huomioi lämpöhäviöitä eikä laitteen hyötysuhdetta.'
        };
      }
      if (v.tapa === 'liike') {
        if (!isFinite(v.massa) || !isFinite(v.nopeus)) return null;
        var ms = v.nopeus / 3.6, e = 0.5 * v.massa * ms * ms;
        return {
          rows: [
            { k: 'Liike-energia', v: numAuto(e) + ' J', big: true },
            { k: 'Kilowattitunteina', v: numAuto(e / 3.6e6) + ' kWh' },
            { k: 'Nopeus', v: numAuto(ms) + ' m/s' },
            { k: 'Vastaa pudotusta korkeudelta', v: numAuto(ms * ms / (2 * 9.81)) + ' m', sub: true },
            { k: 'Jarrutusmatka (µ = 0,8)', v: numAuto(ms * ms / (2 * 0.8 * 9.81)) + ' m', sub: true }
          ],
          foot: 'E = ½mv². Liike-energia nelinkertaistuu kun nopeus kaksinkertaistuu — siksi nopeus vaikuttaa törmäysvoimiin niin voimakkaasti.'
        };
      }
      if (!isFinite(v.arvo)) return null;
      var base = v.arvo * F[v.yks];
      return {
        rows: Object.keys(F).map(function (k) {
          return { k: k, v: numAuto(base / F[k]), big: k === v.yks };
        }).concat([
          { k: 'Vastaa 60 W lampun paloaikaa', v: numAuto(base / 60 / 3600) + ' h', copy: false, sub: true },
          { k: 'Sähkön hinta (15 snt/kWh)', v: num(+(base / 3.6e6 * 0.15).toFixed(3), 3) + ' €', copy: false, sub: true }
        ])
      };
    }
  });

  /* ---------- 6. Vääntömomentti ---------- */
  R({
    id: 'vaantomomentti', cat: 'tekniikka', name: 'Vääntömomentti ja teho', icon: 'i-refresh',
    desc: 'Laske momentin, tehon ja kierrosluvun suhteet sekä muunna momenttiyksiköitä.',
    keys: ['momentti', 'vääntö', 'nm', 'teho', 'kierros', 'moottori'],
    fields: [
      { k: 'momentti', type: 'num', label: 'Vääntömomentti (Nm)', def: '350' },
      { k: 'rpm', type: 'num', label: 'Kierrosluku (1/min)', def: '2000' },
      { k: 'teho', type: 'num', label: 'Teho (kW) — tai jätä tyhjäksi', def: '' },
      { k: 'sade', type: 'num', label: 'Varren pituus (m)', def: '0,3' }
    ],
    run: function (v) {
      var M = v.momentti, n = v.rpm, P = v.teho;
      if (isFinite(M) && isFinite(n)) P = M * 2 * Math.PI * n / 60 / 1000;
      else if (isFinite(P) && isFinite(n)) M = P * 1000 * 60 / (2 * Math.PI * n);
      else if (isFinite(P) && isFinite(M)) n = P * 1000 * 60 / (2 * Math.PI * M);
      else return { note: { text: 'Syötä kaksi arvoa kolmesta: momentti, kierrosluku tai teho.', kind: 'info' } };
      return {
        rows: [
          { k: 'Vääntömomentti', v: numAuto(M) + ' Nm', big: true },
          { k: 'Teho', v: numAuto(P) + ' kW  (' + numAuto(P * 1.35962) + ' hv)', big: true },
          { k: 'Kierrosluku', v: numAuto(n) + ' 1/min' },
          { k: 'Momentti kgf·m', v: numAuto(M / 9.80665) + ' kgf·m' },
          { k: 'Momentti lbf·ft', v: numAuto(M * 0.737562) + ' lbf·ft' },
          { k: 'Voima varren päässä', v: isFinite(v.sade) && v.sade > 0 ? numAuto(M / v.sade) + ' N  (' + numAuto(M / v.sade / 9.81) + ' kg)' : '–', sub: true },
          { k: 'Kulmanopeus', v: numAuto(2 * Math.PI * n / 60) + ' rad/s', sub: true }
        ],
        foot: 'P = M × ω, jossa ω = 2π × n / 60. Teho kilowatteina = momentti (Nm) × kierrosluku / 9549.'
      };
    }
  });

  /* ---------- 7. Nopeus, matka, aika ---------- */
  R({
    id: 'nopeus-matka-aika', cat: 'tekniikka', name: 'Nopeus, matka ja aika', icon: 'i-clock',
    desc: 'Laske puuttuva suure kahdesta annetusta: nopeus, matka tai aika.',
    keys: ['nopeus', 'matka', 'aika', 'kmh', 'vauhti', 'juoksu'],
    fields: [
      { k: 'matka', type: 'num', label: 'Matka (km)', def: '450' },
      { k: 'nopeus', type: 'num', label: 'Nopeus (km/h)', def: '95' },
      { k: 'aika', type: 'num', label: 'Aika (tuntia) — tai jätä tyhjäksi', def: '' }
    ],
    run: function (v) {
      var s = v.matka, vv = v.nopeus, t = v.aika;
      if (isFinite(s) && isFinite(vv) && vv > 0) t = s / vv;
      else if (isFinite(s) && isFinite(t) && t > 0) vv = s / t;
      else if (isFinite(vv) && isFinite(t)) s = vv * t;
      else return { note: { text: 'Syötä kaksi arvoa kolmesta.', kind: 'info' } };
      var min = t * 60;
      return {
        rows: [
          { k: 'Matka', v: numAuto(s) + ' km', big: true },
          { k: 'Nopeus', v: numAuto(vv) + ' km/h  (' + numAuto(vv / 3.6) + ' m/s)', big: true },
          { k: 'Aika', v: Math.floor(t) + ' h ' + Math.round(min % 60) + ' min', big: true },
          { k: 'Aika minuutteina', v: numAuto(min) + ' min' },
          { k: 'Vauhti (min/km)', v: vv > 0 ? Math.floor(60 / vv) + ':' + MT.pad(Math.round((60 / vv % 1) * 60)) + ' min/km' : '–', copy: false },
          { k: 'Nopeus solmuina', v: numAuto(vv / 1.852) + ' kn', sub: true },
          { k: 'Nopeus mailia tunnissa', v: numAuto(vv / 1.609344) + ' mph', sub: true }
        ]
      };
    }
  });

  /* ---------- 8.–14. Yksikkömuuntimet ---------- */
  function unitTool(id, name, desc, keys, catKey, icon) {
    R({
      id: id, cat: 'tekniikka', name: name, icon: icon || 'i-refresh', kind: 'custom', desc: desc, keys: keys,
      render: function (root, c) {
        var U = MT.UNITS[catKey], units = Object.keys(U.u);
        var val = h('input.ctl.mono', { value: '1', inputmode: 'decimal' });
        var from = h('select.ctl');
        units.forEach(function (u) { from.appendChild(h('option', { value: u, text: u })); });
        from.value = units[Math.min(units.length - 1, catKey === 'lampotila' ? 0 : units.indexOf(U.base) >= 0 ? units.indexOf(U.base) : 0)];
        var out = h('div');
        function conv(x, a, b) {
          if (U.temp) {
            var cc = a === '°C' ? x : a === '°F' ? (x - 32) * 5 / 9 : x - 273.15;
            return b === '°C' ? cc : b === '°F' ? cc * 9 / 5 + 32 : cc + 273.15;
          }
          return x * U.u[a] / U.u[b];
        }
        function calc() {
          var x = MT.parseNum(val.value);
          MT.clear(out);
          if (!isFinite(x)) { out.appendChild(c.empty('Syötä luku', 'Tulokset päivittyvät automaattisesti.')); return; }
          out.appendChild(c.resList(units.map(function (u) {
            return { k: u, v: numAuto(conv(x, from.value, u)), big: u === from.value };
          })));
        }
        [val, from].forEach(function (x) { x.addEventListener('input', calc); x.addEventListener('change', calc); });
        root.appendChild(c.panel('MUUNNOS', 'i-refresh', h('div.panel-body', null, [
          h('div.fields', null, [
            h('div.field', null, [h('label', { text: 'Arvo' }), val]),
            h('div.field', null, [h('label', { text: 'Yksikkö' }), from])
          ]),
          h('div.btn-row', { style: { marginTop: '11px' } }, c.btn('Kopioi kaikki', { icon: 'i-copy', on: function () {
            var x = MT.parseNum(val.value);
            MT.copy(units.map(function (u) { return u + ': ' + numAuto(conv(x, from.value, u)); }).join('\n'));
          } }))
        ])));
        root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('KAIKKI YKSIKÖT', 'i-grid', out)));
        calc();
      }
    });
  }
  unitTool('painemuunnin', 'Painemuunnin', 'Muunna paineyksiköitä: Pa, bar, psi, atm ja mmHg.', ['paine', 'bar', 'psi', 'ilmanpaine'], 'paine', 'i-zap');
  unitTool('lampotilamuunnin', 'Lämpötilamuunnin', 'Muunna celsius-, fahrenheit- ja kelvinasteita.', ['lämpötila', 'celsius', 'fahrenheit', 'kelvin'], 'lampotila', 'i-sun');
  unitTool('pituusmuunnin', 'Pituusmuunnin', 'Muunna pituusyksiköitä millimetreistä maileihin.', ['pituus', 'metri', 'tuuma', 'jalka', 'maili'], 'pituus', 'i-text');
  unitTool('pinta-alamuunnin', 'Pinta-alamuunnin', 'Muunna pinta-alayksiköitä neliömetreistä hehtaareihin.', ['pinta-ala', 'neliö', 'hehtaari', 'tontti'], 'pinta-ala', 'i-grid');
  unitTool('tilavuusmuunnin', 'Tilavuusmuunnin', 'Muunna tilavuusyksiköitä litroista gallonoihin ja ruokamitoiksi.', ['tilavuus', 'litra', 'gallona', 'desilitra', 'ruokamitta'], 'tilavuus', 'i-db');
  unitTool('painomuunnin', 'Massamuunnin', 'Muunna massayksiköitä grammoista tonneihin ja nauloihin.', ['massa', 'paino', 'kilo', 'naula', 'unssi'], 'massa', 'i-db');

  /* ---------- 14. Voimamuunnin ---------- */
  R({
    id: 'voimamuunnin', cat: 'tekniikka', name: 'Voimamuunnin', icon: 'i-zap',
    desc: 'Muunna voimayksiköitä ja laske massan aiheuttama paino.',
    keys: ['voima', 'newton', 'kilopond', 'paino', 'massa'],
    fields: [
      { k: 'arvo', type: 'num', label: 'Arvo', def: '100' },
      { k: 'yks', type: 'select', label: 'Yksikkö', def: 'N', opts: [['N', 'newtonia (N)'], ['kN', 'kilonewtonia (kN)'], ['kgf', 'kilopondia (kgf)'], ['lbf', 'naulavoimaa (lbf)'], ['dyn', 'dyneä (dyn)']] },
      { k: 'g', type: 'select', label: 'Painovoima', def: '9,80665', opts: [['9,80665', 'Maa — 9,80665 m/s²'], ['1,62', 'Kuu — 1,62 m/s²'], ['3,71', 'Mars — 3,71 m/s²'], ['24,79', 'Jupiter — 24,79 m/s²']] }
    ],
    run: function (v) {
      if (!isFinite(v.arvo)) return null;
      var F = { N: 1, kN: 1000, kgf: 9.80665, lbf: 4.4482216, dyn: 1e-5 };
      var n = v.arvo * F[v.yks], g = MT.parseNum(v.g);
      return {
        rows: Object.keys(F).map(function (k) {
          return { k: k, v: numAuto(n / F[k]), big: k === v.yks };
        }).concat([
          { k: 'Vastaava massa maapallolla', v: numAuto(n / 9.80665) + ' kg', copy: false, big: true },
          { k: 'Paino valitulla painovoimalla', v: numAuto(n / 9.80665 * g) + ' N', copy: false },
          { k: 'Paino 1 cm² alalle', v: numAuto(n / 0.0001 / 1000) + ' kPa', copy: false, sub: true }
        ]),
        foot: 'Voima = massa × kiihtyvyys (F = ma). Yhden kilon massa painaa maapallolla noin 9,81 newtonia.'
      };
    }
  });
})();
