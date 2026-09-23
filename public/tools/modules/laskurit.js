/* Moduuli: Laskurit */
(function () {
  'use strict';
  var R = MT.reg, num = MT.num, numAuto = MT.numAuto, P = MT.parseNum;

  /* ---------- turvallinen lausekelaskin ---------- */
  var FN = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, ln: Math.log, log: function (x) { return Math.log10(x); },
    log2: Math.log2, sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp,
    round: Math.round, floor: Math.floor, ceil: Math.ceil, sign: Math.sign, trunc: Math.trunc
  };
  var CONST = { pi: Math.PI, e: Math.E, tau: Math.PI * 2, phi: (1 + Math.sqrt(5)) / 2 };

  function evalExpr(src, deg) {
    var s = String(src).replace(/\s| /g, '').replace(/,/g, '.').replace(/×/g, '*')
      .replace(/÷/g, '/').replace(/−/g, '-').replace(/\*\*/g, '^').replace(/π/g, 'pi').replace(/√/g, 'sqrt');
    if (!s) return NaN;
    var i = 0;
    function peek() { return s[i]; }
    function eat(c) { if (s[i] === c) { i++; return true; } return false; }
    function expr() {
      var v = term();
      for (;;) {
        if (eat('+')) v += term();
        else if (eat('-')) v -= term();
        else return v;
      }
    }
    function term() {
      var v = unary();
      for (;;) {
        if (eat('*')) v *= unary();
        else if (eat('/')) v /= unary();
        else if (eat('%')) v %= unary();
        else if (peek() === '(' || (/[a-z]/i).test(peek() || '')) v *= unary();
        else return v;
      }
    }
    function unary() {
      if (eat('-')) return -unary();
      if (eat('+')) return unary();
      return power();
    }
    function power() {
      var v = postfix();
      if (eat('^')) return Math.pow(v, unary());
      return v;
    }
    function postfix() {
      var v = atom();
      while (eat('!')) v = fact(v);
      return v;
    }
    function fact(n) {
      if (n < 0 || n !== Math.floor(n) || n > 170) return NaN;
      var r = 1; for (var k = 2; k <= n; k++) r *= k; return r;
    }
    function atom() {
      if (eat('(')) { var v = expr(); if (!eat(')')) throw new Error('Sulkumerkki puuttuu'); return v; }
      var m = /^[a-z][a-z0-9_]*/i.exec(s.slice(i));
      if (m) {
        var name = m[0].toLowerCase(); i += m[0].length;
        if (FN[name]) {
          var arg;
          if (eat('(')) { arg = expr(); if (!eat(')')) throw new Error('Sulkumerkki puuttuu'); }
          else arg = unary();
          if (deg && /^(sin|cos|tan)$/.test(name)) arg = arg * Math.PI / 180;
          var r = FN[name](arg);
          if (deg && /^(asin|acos|atan)$/.test(name)) r = r * 180 / Math.PI;
          return r;
        }
        if (name in CONST) return CONST[name];
        throw new Error('Tuntematon nimi: ' + name);
      }
      var n = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(s.slice(i));
      if (!n) throw new Error('Virheellinen lauseke kohdassa ' + (i + 1));
      i += n[0].length;
      return parseFloat(n[0]);
    }
    var val = expr();
    if (i < s.length) throw new Error('Ylimääräisiä merkkejä: ' + s.slice(i));
    return val;
  }
  MT.evalExpr = evalExpr;

  /* ---------- yksiköt ---------- */
  var UNITS = {
    pituus: { name: 'Pituus', base: 'm', u: { nm: 1e-9, µm: 1e-6, mm: 0.001, cm: 0.01, dm: 0.1, m: 1, km: 1000, tuuma: 0.0254, jalka: 0.3048, jaardi: 0.9144, maili: 1609.344, merimaili: 1852 } },
    massa: { name: 'Massa', base: 'kg', u: { mg: 1e-6, g: 0.001, kg: 1, t: 1000, unssi: 0.0283495, naula: 0.453592, stone: 6.35029 } },
    tilavuus: { name: 'Tilavuus', base: 'l', u: { ml: 0.001, cl: 0.01, dl: 0.1, l: 1, 'm³': 1000, tl: 0.005, rkl: 0.015, kuppi: 0.24, gallona: 3.78541, pintti: 0.473176 } },
    'pinta-ala': { name: 'Pinta-ala', base: 'm²', u: { 'mm²': 1e-6, 'cm²': 1e-4, 'm²': 1, aari: 100, hehtaari: 10000, 'km²': 1e6, 'jalka²': 0.092903, eekkeri: 4046.86 } },
    nopeus: { name: 'Nopeus', base: 'm/s', u: { 'm/s': 1, 'km/h': 1 / 3.6, 'mph': 0.44704, solmu: 0.514444, 'jalka/s': 0.3048 } },
    aika: { name: 'Aika', base: 's', u: { ms: 0.001, s: 1, min: 60, h: 3600, vrk: 86400, viikko: 604800, kuukausi: 2629746, vuosi: 31556952 } },
    data: { name: 'Datamäärä', base: 'MB', u: { bitti: 1.25e-7, tavu: 1e-6, kB: 0.001, MB: 1, GB: 1000, TB: 1e6, KiB: 0.001024, MiB: 1.048576, GiB: 1073.741824, TiB: 1099511.62778 } },
    paine: { name: 'Paine', base: 'Pa', u: { Pa: 1, hPa: 100, kPa: 1000, bar: 100000, mbar: 100, atm: 101325, psi: 6894.76, mmHg: 133.322 } },
    energia: { name: 'Energia', base: 'J', u: { J: 1, kJ: 1000, cal: 4.184, kcal: 4184, Wh: 3600, kWh: 3.6e6, MWh: 3.6e9, eV: 1.602176634e-19, BTU: 1055.06 } },
    teho: { name: 'Teho', base: 'W', u: { mW: 0.001, W: 1, kW: 1000, MW: 1e6, hv: 735.49875, 'BTU/h': 0.293071 } },
    kulma: { name: 'Kulma', base: 'aste', u: { aste: 1, radiaani: 180 / Math.PI, gradi: 0.9, kierros: 360, kaariminuutti: 1 / 60 } },
    lampotila: { name: 'Lämpötila', base: '°C', temp: true, u: { '°C': 1, '°F': 1, K: 1 } }
  };
  MT.UNITS = UNITS;

  function tempConv(v, from, to) {
    var c = from === '°C' ? v : from === '°F' ? (v - 32) * 5 / 9 : v - 273.15;
    return to === '°C' ? c : to === '°F' ? c * 9 / 5 + 32 : c + 273.15;
  }

  /* ---------- 1. Laskin ---------- */
  R({
    id: 'laskin', cat: 'laskurit', name: 'Laskin', icon: 'i-calc', kind: 'custom',
    desc: 'Peruslaskin näppäimistötuella ja laskuhistorialla.',
    keys: ['laskin', 'calculator', 'plus', 'miinus', 'kerto', 'jako'],
    render: function (root, c) {
      var expr = '', hist = MT.db.data.calcHist || [];
      var disp = c.h('div', { style: { padding: '14px 16px', textAlign: 'right', background: 'var(--bg-2)', borderBottom: '1px solid var(--bd)' } }, [
        c.h('div.mono', { text: '0', style: { fontSize: '13px', color: 'var(--tx-3)', minHeight: '18px', wordBreak: 'break-all' } }),
        c.h('div.mono', { text: '0', style: { fontSize: '30px', marginTop: '4px', wordBreak: 'break-all' } })
      ]);
      var keys = [['C', 'x'], ['←', 'x'], ['%', 'op'], ['÷', 'op'],
        ['7'], ['8'], ['9'], ['×', 'op'], ['4'], ['5'], ['6'], ['−', 'op'],
        ['1'], ['2'], ['3'], ['+', 'op'], ['0'], [','], ['(', 'op'], [')', 'op']];
      var pad = c.h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px', padding: '11px' } });
      keys.forEach(function (k) {
        pad.appendChild(c.h('button.btn', { style: { height: '42px', fontSize: '15px' }, text: k[0], onclick: function () { press(k[0]); } }));
      });
      pad.appendChild(c.h('button.btn.btn-pri', { style: { height: '42px', gridColumn: 'span 4', fontSize: '15px' }, text: '=', onclick: function () { press('='); } }));

      var histBox = c.h('div.rows');
      function renderHist() {
        MT.clear(histBox);
        if (!hist.length) { histBox.appendChild(c.empty('Ei laskuja', 'Lasketut lausekkeet tallentuvat tähän.', 'i-clock')); return; }
        hist.slice(0, 12).forEach(function (r) {
          histBox.appendChild(c.h('div.row-item', { onclick: function () { expr = String(r.v); upd(); } }, [
            c.h('span.row-main', null, [c.h('div.n.mono', { text: r.e }), c.h('div.m', { text: '= ' + r.v })])
          ]));
        });
      }
      function upd(res) {
        disp.firstChild.textContent = expr || '0';
        try { disp.lastChild.textContent = expr ? numAuto(evalExpr(expr)) : '0'; }
        catch (e) { disp.lastChild.textContent = res != null ? res : '…'; }
      }
      function press(k) {
        if (k === 'C') { expr = ''; }
        else if (k === '←') expr = expr.slice(0, -1);
        else if (k === '=') {
          try {
            var v = evalExpr(expr);
            if (!isFinite(v)) throw new Error('Määrittelemätön');
            hist.unshift({ e: expr, v: numAuto(v) }); hist = hist.slice(0, 40);
            MT.db.data.calcHist = hist; MT.save();
            expr = String(v); renderHist();
          } catch (e) { MT.toast(e.message, 'err'); }
        } else expr += k === ',' ? '.' : k;
        upd();
      }
      root.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); press('='); }
        else if (e.key === 'Backspace') { e.preventDefault(); press('←'); }
        else if (e.key === 'Escape') press('C');
        else if (/^[\d+\-*/().%^]$/.test(e.key)) press(e.key);
        else if (e.key === ',') press(',');
      });
      root.tabIndex = 0;
      setTimeout(function () { root.focus(); }, 40);

      root.appendChild(c.h('div.home-grid', null, [
        c.panel('LASKIN', 'i-calc', c.h('div', null, [disp, pad,
          c.h('div', { style: { padding: '0 11px 11px' } }, c.note('Käytä myös näppäimistöä. Enter laskee, Esc tyhjentää.', 'info'))])),
        c.panel('HISTORIA', 'i-clock', histBox, c.btn('Tyhjennä', { cls: 'btn-gh btn-sm', icon: 'i-trash', on: function () { hist = []; MT.db.data.calcHist = []; MT.save(); renderHist(); } }))
      ]));
      renderHist(); upd();
    }
  });

  /* ---------- 2. Tieteellinen laskin ---------- */
  R({
    id: 'tieteellinen-laskin', cat: 'laskurit', name: 'Tieteellinen laskin', icon: 'i-calc', kind: 'io',
    desc: 'Laske lausekkeita rivi riviltä: funktiot, vakiot, potenssit ja kertomat.',
    keys: ['tieteellinen', 'sin', 'cos', 'log', 'potenssi', 'kertoma', 'lauseke'],
    io: {
      inLabel: 'LAUSEKKEET (YKSI RIVILLÄ)', outLabel: 'TULOKSET', lang: 'none',
      sample: 'sqrt(144) + 3^2\nsin(45) * 100\nlog(1000) + ln(e)\n5! / (2! * 3!)\n(1 + 0.05)^10',
      opts: [{ k: 'deg', type: 'check', label: 'Kulmat asteina (muuten radiaaneina)', def: true }],
      run: function (text, o) {
        var lines = text.split('\n'), out = [], okn = 0, errn = 0;
        lines.forEach(function (l) {
          var t = l.trim();
          if (!t || t[0] === '#') { out.push(t ? t : ''); return; }
          try { var v = evalExpr(t, o.deg); out.push(t + ' = ' + numAuto(v)); okn++; }
          catch (e) { out.push(t + '  ⟶ virhe: ' + e.message); errn++; }
        });
        return {
          out: out.join('\n'), status: errn ? 'OSITTAIN VIRHEELLINEN' : 'OK', kind: errn ? 'warn' : 'ok',
          meta: [['LASKUT', okn], ['VIRHEET', errn]]
        };
      },
      foot: function (c) {
        return c.note('Tuetut funktiot: sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, ln, log, log2, sqrt, cbrt, abs, exp, round, floor, ceil, sign. Vakiot: pi, e, tau, phi. Operaattorit: + − * / % ^ ! ( )', 'info');
      }
    }
  });

  /* ---------- 3. Prosenttilaskuri ---------- */
  R({
    id: 'prosenttilaskuri', cat: 'laskurit', name: 'Prosenttilaskuri', icon: 'i-calc',
    desc: 'Prosenttiosuus, prosenttimuutos ja prosenttiyksiköt yhdellä kertaa.',
    keys: ['prosentti', 'osuus', 'muutos', '%'],
    fields: [
      { k: 'a', type: 'num', label: 'Arvo A', def: '150', ph: '150' },
      { k: 'b', type: 'num', label: 'Arvo B', def: '200', ph: '200' },
      { k: 'p', type: 'num', label: 'Prosentti %', def: '25', ph: '25' }
    ],
    run: function (v) {
      var a = v.a, b = v.b, p = v.p;
      var rows = [];
      if (isFinite(p) && isFinite(a)) {
        rows.push({ k: p + ' % arvosta A', v: numAuto(a * p / 100), big: true });
        rows.push({ k: 'A kasvatettuna ' + p + ' %', v: numAuto(a * (1 + p / 100)) });
        rows.push({ k: 'A vähennettynä ' + p + ' %', v: numAuto(a * (1 - p / 100)) });
        rows.push({ k: 'A on ' + p + ' % luvusta', v: numAuto(a / (p / 100)) });
      }
      if (isFinite(a) && isFinite(b) && b !== 0) {
        rows.push({ k: 'A on B:stä', v: numAuto(a / b * 100) + ' %' });
      }
      if (isFinite(a) && isFinite(b) && a !== 0) {
        var ch = (b - a) / Math.abs(a) * 100;
        rows.push({ k: 'Muutos A → B', v: (ch >= 0 ? '+' : '') + numAuto(ch) + ' %', big: true });
        rows.push({ k: 'Erotus B − A', v: numAuto(b - a), sub: true });
        rows.push({ k: 'Kerroin A → B', v: '×' + numAuto(b / a), sub: true });
      }
      if (!rows.length) return null;
      return { rows: rows, out: rows.map(function (r) { return r.k + ': ' + r.v; }).join('\n') };
    }
  });

  /* ---------- 4. Alennuslaskuri ---------- */
  R({
    id: 'alennuslaskuri', cat: 'laskurit', name: 'Alennuslaskuri', icon: 'i-calc',
    desc: 'Laske alennettu hinta, säästö ja kokonaisalennus useasta alennuksesta.',
    keys: ['alennus', 'ale', 'hinta', 'säästö'],
    fields: [
      { k: 'hinta', type: 'num', label: 'Alkuperäinen hinta (€)', def: '249,90' },
      { k: 'ale', type: 'num', label: 'Alennus %', def: '30' },
      { k: 'ale2', type: 'num', label: 'Lisäalennus % (valinnainen)', def: '' },
      { k: 'maara', type: 'num', label: 'Kappalemäärä', def: '1' }
    ],
    run: function (v) {
      if (!isFinite(v.hinta)) return null;
      var q = isFinite(v.maara) && v.maara > 0 ? v.maara : 1;
      var p1 = v.hinta * (1 - (isFinite(v.ale) ? v.ale : 0) / 100);
      var p2 = isFinite(v.ale2) ? p1 * (1 - v.ale2 / 100) : p1;
      var total = (1 - p2 / v.hinta) * 100;
      return {
        rows: [
          { k: 'Alennettu hinta', v: num(+p2.toFixed(2), 2) + ' €', big: true },
          { k: 'Säästö / kpl', v: num(+(v.hinta - p2).toFixed(2), 2) + ' €' },
          { k: 'Kokonaisalennus', v: num(+total.toFixed(2), 2) + ' %' },
          { k: 'Yhteensä (' + q + ' kpl)', v: num(+(p2 * q).toFixed(2), 2) + ' €', big: true },
          { k: 'Säästö yhteensä', v: num(+((v.hinta - p2) * q).toFixed(2), 2) + ' €', sub: true }
        ]
      };
    }
  });

  /* ---------- 5. Tippilaskuri ---------- */
  R({
    id: 'tippilaskuri', cat: 'laskurit', name: 'Tippilaskuri', icon: 'i-calc',
    desc: 'Jaa lasku ja juomaraha ryhmän kesken.',
    keys: ['tippi', 'juomaraha', 'lasku', 'jako'],
    fields: [
      { k: 'lasku', type: 'num', label: 'Laskun summa (€)', def: '86,50' },
      { k: 'tippi', type: 'range', label: 'Tippi', def: 10, min: 0, max: 30, step: 1, suffix: ' %' },
      { k: 'hlo', type: 'num', label: 'Henkilöitä', def: '4' },
      { k: 'pyorista', type: 'check', label: 'Pyöristä tasaeuroihin', def: false }
    ],
    run: function (v) {
      if (!isFinite(v.lasku)) return null;
      var n = Math.max(1, Math.round(v.hlo) || 1);
      var tip = v.lasku * v.tippi / 100, tot = v.lasku + tip;
      if (v.pyorista) { tot = Math.ceil(tot); tip = tot - v.lasku; }
      return {
        rows: [
          { k: 'Tippi', v: num(+tip.toFixed(2), 2) + ' €' },
          { k: 'Yhteensä', v: num(+tot.toFixed(2), 2) + ' €', big: true },
          { k: 'Per henkilö', v: num(+(tot / n).toFixed(2), 2) + ' €', big: true },
          { k: 'Tippi per henkilö', v: num(+(tip / n).toFixed(2), 2) + ' €', sub: true }
        ]
      };
    }
  });

  /* ---------- 6. ALV-laskuri ---------- */
  R({
    id: 'alv-laskuri', cat: 'laskurit', name: 'ALV-laskuri', icon: 'i-calc',
    desc: 'Laske arvonlisävero verottomasta tai verollisesta hinnasta.',
    keys: ['alv', 'vero', 'arvonlisävero', 'veroton', 'verollinen'],
    fields: [
      { k: 'summa', type: 'num', label: 'Summa (€)', def: '1000' },
      { k: 'kanta', type: 'select', label: 'ALV-kanta', def: '25.5', opts: [['25.5', '25,5 % — yleinen'], ['14', '14 % — elintarvikkeet, ravintolat'], ['10', '10 % — kirjat, lääkkeet, liikunta'], ['24', '24 % — vanha yleinen kanta'], ['0', '0 % — veroton'], ['oma', 'Oma kanta']] },
      { k: 'oma', type: 'num', label: 'Oma kanta %', def: '' },
      { k: 'suunta', type: 'select', label: 'Annettu summa on', def: 'veroton', opts: [['veroton', 'Veroton (ALV 0 %)'], ['verollinen', 'Verollinen (sis. ALV)']] }
    ],
    run: function (v) {
      if (!isFinite(v.summa)) return null;
      var rate = v.kanta === 'oma' ? v.oma : parseFloat(v.kanta);
      if (!isFinite(rate)) return null;
      var net, vat, gross;
      if (v.suunta === 'veroton') { net = v.summa; vat = net * rate / 100; gross = net + vat; }
      else { gross = v.summa; net = gross / (1 + rate / 100); vat = gross - net; }
      return {
        rows: [
          { k: 'Veroton hinta', v: num(+net.toFixed(2), 2) + ' €', big: true },
          { k: 'ALV ' + numAuto(rate) + ' %', v: num(+vat.toFixed(2), 2) + ' €' },
          { k: 'Verollinen hinta', v: num(+gross.toFixed(2), 2) + ' €', big: true },
          { k: 'ALV-kerroin', v: numAuto(1 + rate / 100), sub: true }
        ],
        foot: 'Suomen yleinen arvonlisäverokanta on 25,5 % (voimassa 1.9.2024 alkaen). Tarkista aina ajantasainen kanta Verohallinnolta.'
      };
    }
  });

  /* ---------- 7. Korkolaskuri ---------- */
  R({
    id: 'korkolaskuri', cat: 'laskurit', name: 'Korkoa korolle', icon: 'i-calc',
    desc: 'Koronkorkolaskuri: pääoman kasvu ajan myötä.',
    keys: ['korko', 'koronkorko', 'sijoitus', 'kasvu'],
    fields: [
      { k: 'paaoma', type: 'num', label: 'Alkupääoma (€)', def: '10000' },
      { k: 'korko', type: 'num', label: 'Vuosikorko %', def: '7' },
      { k: 'vuodet', type: 'num', label: 'Vuosia', def: '10' },
      { k: 'krt', type: 'select', label: 'Korkojaksoja vuodessa', def: '12', opts: [['1', 'Vuosittain'], ['4', 'Neljännesvuosittain'], ['12', 'Kuukausittain'], ['365', 'Päivittäin']] }
    ],
    run: function (v) {
      if (!isFinite(v.paaoma) || !isFinite(v.korko) || !isFinite(v.vuodet)) return null;
      var n = +v.krt, r = v.korko / 100, t = v.vuodet;
      var end = v.paaoma * Math.pow(1 + r / n, n * t);
      var rows = [], tbl = [];
      for (var y = 1; y <= Math.min(t, 50); y++) {
        var val = v.paaoma * Math.pow(1 + r / n, n * y);
        tbl.push([y, num(+val.toFixed(2), 2) + ' €', num(+(val - v.paaoma).toFixed(2), 2) + ' €']);
      }
      return {
        rows: [
          { k: 'Loppupääoma', v: num(+end.toFixed(2), 2) + ' €', big: true },
          { k: 'Korkotuotto', v: num(+(end - v.paaoma).toFixed(2), 2) + ' €' },
          { k: 'Kokonaistuotto', v: num(+((end / v.paaoma - 1) * 100).toFixed(2), 2) + ' %' },
          { k: 'Efektiivinen vuosikorko', v: num(+((Math.pow(1 + r / n, n) - 1) * 100).toFixed(3), 3) + ' %', sub: true }
        ],
        table: { head: ['Vuosi', 'Pääoma', 'Kertynyt korko'], rows: tbl, text: [0] }
      };
    }
  });

  /* ---------- 8. Lainalaskuri ---------- */
  function annuity(pv, rMonth, n) {
    if (rMonth === 0) return pv / n;
    return pv * rMonth / (1 - Math.pow(1 + rMonth, -n));
  }
  R({
    id: 'lainalaskuri', cat: 'laskurit', name: 'Lainalaskuri', icon: 'i-calc',
    desc: 'Annuiteettilainan kuukausierä, korkokulut ja lyhennystaulukko.',
    keys: ['laina', 'annuiteetti', 'kuukausierä', 'korko'],
    fields: [
      { k: 'summa', type: 'num', label: 'Lainasumma (€)', def: '20000' },
      { k: 'korko', type: 'num', label: 'Vuosikorko %', def: '5,5' },
      { k: 'vuodet', type: 'num', label: 'Laina-aika (vuotta)', def: '5' },
      { k: 'kulu', type: 'num', label: 'Kuukausikulu (€)', def: '0' }
    ],
    run: function (v) {
      if (!isFinite(v.summa) || !isFinite(v.korko) || !isFinite(v.vuodet) || v.vuodet <= 0) return null;
      var n = Math.round(v.vuodet * 12), r = v.korko / 100 / 12;
      var era = annuity(v.summa, r, n), kulu = isFinite(v.kulu) ? v.kulu : 0;
      var bal = v.summa, korot = 0, tbl = [];
      for (var i = 1; i <= n; i++) {
        var k = bal * r, ly = era - k; korot += k; bal -= ly;
        if (i <= 360) tbl.push([i, num(+era.toFixed(2), 2), num(+ly.toFixed(2), 2), num(+k.toFixed(2), 2), num(+Math.max(0, bal).toFixed(2), 2)]);
      }
      return {
        rows: [
          { k: 'Kuukausierä', v: num(+(era + kulu).toFixed(2), 2) + ' €', big: true },
          { k: 'Josta korkoa (1. erä)', v: num(+(v.summa * r).toFixed(2), 2) + ' €' },
          { k: 'Maksuerien määrä', v: n + ' kpl' },
          { k: 'Korot yhteensä', v: num(+korot.toFixed(2), 2) + ' €', big: true },
          { k: 'Takaisinmaksu yhteensä', v: num(+(v.summa + korot + kulu * n).toFixed(2), 2) + ' €' }
        ],
        table: { head: ['Erä', 'Maksu €', 'Lyhennys €', 'Korko €', 'Jäljellä €'], rows: tbl, text: [0] }
      };
    }
  });

  /* ---------- 9. Asuntolainalaskuri ---------- */
  R({
    id: 'asuntolainalaskuri', cat: 'laskurit', name: 'Asuntolainalaskuri', icon: 'i-calc',
    desc: 'Asuntolainan kuukausierä, korkoriski ja omarahoitusosuus.',
    keys: ['asuntolaina', 'asunto', 'euribor', 'marginaali'],
    fields: [
      { k: 'hinta', type: 'num', label: 'Asunnon hinta (€)', def: '250000' },
      { k: 'oma', type: 'num', label: 'Omarahoitus (€)', def: '50000' },
      { k: 'euribor', type: 'num', label: 'Viitekorko %', def: '2,5' },
      { k: 'marg', type: 'num', label: 'Marginaali %', def: '0,6' },
      { k: 'vuodet', type: 'num', label: 'Laina-aika (vuotta)', def: '25' },
      { k: 'hoito', type: 'num', label: 'Hoitovastike €/kk', def: '0' }
    ],
    run: function (v) {
      if (!isFinite(v.hinta)) return null;
      var laina = v.hinta - (isFinite(v.oma) ? v.oma : 0);
      if (laina <= 0) return { note: { text: 'Omarahoitus kattaa koko hinnan — lainaa ei tarvita.', kind: 'ok' } };
      var korko = (isFinite(v.euribor) ? v.euribor : 0) + (isFinite(v.marg) ? v.marg : 0);
      var n = Math.round(v.vuodet * 12), r = korko / 100 / 12;
      var era = annuity(laina, r, n);
      var hoito = isFinite(v.hoito) ? v.hoito : 0;
      var stress = [];
      [0, 2, 4, 6].forEach(function (add) {
        var rr = (korko + add) / 100 / 12;
        stress.push([(korko + add).toFixed(2).replace('.', ',') + ' %', num(+annuity(laina, rr, n).toFixed(2), 2) + ' €']);
      });
      var korot = era * n - laina;
      return {
        rows: [
          { k: 'Lainan määrä', v: num(laina) + ' €' },
          { k: 'Kokonaiskorko', v: num(+korko.toFixed(3), 2) + ' %' },
          { k: 'Kuukausierä', v: num(+era.toFixed(2), 2) + ' €', big: true },
          { k: 'Asumiskulut / kk', v: num(+(era + hoito).toFixed(2), 2) + ' €', big: true },
          { k: 'Omarahoitusosuus', v: num(+((v.oma / v.hinta) * 100).toFixed(1), 1) + ' %' },
          { k: 'Korot yhteensä', v: num(+korot.toFixed(2), 2) + ' €' }
        ],
        table: { head: ['Korkotaso', 'Kuukausierä'], rows: stress, text: [0] },
        foot: 'Korkoriskilaskelma: pankit edellyttävät yleensä maksuvaran kestävän 6 %:n korkotason 25 vuoden laina-ajalla.'
      };
    }
  });

  /* ---------- 10. Sijoituslaskuri ---------- */
  R({
    id: 'sijoituslaskuri', cat: 'laskurit', name: 'Sijoituslaskuri', icon: 'i-calc',
    desc: 'Kuukausisäästämisen tuotto korkoa korolle -periaatteella.',
    keys: ['sijoitus', 'säästäminen', 'rahasto', 'tuotto'],
    fields: [
      { k: 'alku', type: 'num', label: 'Alkupääoma (€)', def: '1000' },
      { k: 'kk', type: 'num', label: 'Kuukausisijoitus (€)', def: '200' },
      { k: 'tuotto', type: 'num', label: 'Vuosituotto %', def: '7' },
      { k: 'vuodet', type: 'num', label: 'Sijoitusaika (vuotta)', def: '20' },
      { k: 'kulu', type: 'num', label: 'Vuosikulu %', def: '0,2' },
      { k: 'vero', type: 'num', label: 'Luovutusvoittovero %', def: '30' }
    ],
    run: function (v) {
      if (!isFinite(v.vuodet) || v.vuodet <= 0) return null;
      var r = ((isFinite(v.tuotto) ? v.tuotto : 0) - (isFinite(v.kulu) ? v.kulu : 0)) / 100 / 12;
      var n = Math.round(v.vuodet * 12), bal = isFinite(v.alku) ? v.alku : 0, kk = isFinite(v.kk) ? v.kk : 0;
      var tbl = [], sijoitettu = bal;
      for (var i = 1; i <= n; i++) {
        bal = bal * (1 + r) + kk; sijoitettu += kk;
        if (i % 12 === 0) tbl.push([i / 12, num(+bal.toFixed(0)) + ' €', num(+sijoitettu.toFixed(0)) + ' €', num(+(bal - sijoitettu).toFixed(0)) + ' €']);
      }
      var voitto = bal - sijoitettu, vero = voitto > 0 ? voitto * (isFinite(v.vero) ? v.vero : 0) / 100 : 0;
      return {
        rows: [
          { k: 'Loppuarvo', v: num(+bal.toFixed(2), 2) + ' €', big: true },
          { k: 'Sijoitettu pääoma', v: num(+sijoitettu.toFixed(2), 2) + ' €' },
          { k: 'Tuotto', v: num(+voitto.toFixed(2), 2) + ' €', big: true },
          { k: 'Vero myytäessä', v: num(+vero.toFixed(2), 2) + ' €', sub: true },
          { k: 'Verojen jälkeen', v: num(+(bal - vero).toFixed(2), 2) + ' €' }
        ],
        table: { head: ['Vuosi', 'Arvo', 'Sijoitettu', 'Tuotto'], rows: tbl, text: [0] },
        foot: 'Laskelma ei ole sijoitusneuvontaa. Todellinen tuotto vaihtelee eikä mennyt tuotto ennusta tulevaa. Verotus lasketaan yksinkertaistetusti koko voitosta.'
      };
    }
  });

  /* ---------- 11. Yksikkömuunnin ---------- */
  R({
    id: 'yksikkomuunnin', cat: 'laskurit', name: 'Yksikkömuunnin', icon: 'i-refresh', kind: 'custom',
    desc: 'Muunna pituuksia, massoja, tilavuuksia, nopeuksia, painetta ja muita yksiköitä.',
    keys: ['yksikkö', 'muunnin', 'metri', 'kilo', 'litra', 'muunna'],
    render: function (root, c) {
      var catSel = c.h('select.ctl'), fromSel = c.h('select.ctl'), toSel = c.h('select.ctl');
      var inp = c.h('input.ctl.mono', { value: '1', inputmode: 'decimal' });
      var out = c.h('div');
      Object.keys(UNITS).forEach(function (k) { catSel.appendChild(c.h('option', { value: k, text: UNITS[k].name })); });

      function fillUnits() {
        var u = Object.keys(UNITS[catSel.value].u);
        [fromSel, toSel].forEach(function (s, idx) {
          MT.clear(s);
          u.forEach(function (x) { s.appendChild(c.h('option', { value: x, text: x })); });
          s.value = u[idx === 0 ? 0 : Math.min(u.length - 1, idx)];
        });
        if (catSel.value === 'pituus') { fromSel.value = 'm'; toSel.value = 'cm'; }
        calc();
      }
      function conv(v, from, to, cat) {
        if (UNITS[cat].temp) return tempConv(v, from, to);
        return v * UNITS[cat].u[from] / UNITS[cat].u[to];
      }
      function calc() {
        var v = P(inp.value), cat = catSel.value;
        MT.clear(out);
        if (!isFinite(v)) { out.appendChild(c.empty('Syötä luku', 'Tulos päivittyy automaattisesti.')); return; }
        var res = conv(v, fromSel.value, toSel.value, cat);
        out.appendChild(c.panel('TULOS', 'i-check', c.resList([
          { k: numAuto(v) + ' ' + fromSel.value, v: numAuto(res) + ' ' + toSel.value, big: true }
        ])));
        var all = Object.keys(UNITS[cat].u).map(function (u) {
          return [u, numAuto(conv(v, fromSel.value, u, cat))];
        });
        out.appendChild(c.h('div', { style: { marginTop: '11px' } },
          c.panel('KAIKKI YKSIKÖT', 'i-grid', c.table(['Yksikkö', 'Arvo'], all, { text: [0] }))));
      }
      catSel.addEventListener('change', fillUnits);
      [fromSel, toSel].forEach(function (s) { s.addEventListener('change', calc); });
      inp.addEventListener('input', calc);

      root.appendChild(c.panel('MUUNNOS', 'i-refresh', c.h('div.panel-body', null, [
        c.h('div.fields', null, [
          c.h('div.field', null, [c.h('label', { text: 'Suure' }), catSel]),
          c.h('div.field', null, [c.h('label', { text: 'Arvo' }), inp]),
          c.h('div.field', null, [c.h('label', { text: 'Lähtöyksikkö' }), fromSel]),
          c.h('div.field', null, [c.h('label', { text: 'Kohdeyksikkö' }), toSel])
        ]),
        c.h('div.btn-row', { style: { marginTop: '11px' } }, [
          c.btn('Vaihda suunta', { icon: 'i-refresh', on: function () { var t = fromSel.value; fromSel.value = toSel.value; toSel.value = t; calc(); } }),
          c.btn('Kopioi tulos', { icon: 'i-copy', on: function () { MT.copy(numAuto(conv(P(inp.value), fromSel.value, toSel.value, catSel.value))); } })
        ])
      ])));
      root.appendChild(c.h('div', { style: { marginTop: '13px' } }, out));
      fillUnits();
    }
  });

  /* ---------- 12. Valuuttamuunnin ---------- */
  R({
    id: 'valuuttamuunnin', cat: 'laskurit', name: 'Valuuttamuunnin', icon: 'i-globe', kind: 'custom',
    net: 'Hakee kurssit Frankfurter-rajapinnasta (Euroopan keskuspankin data) painettaessa Päivitä kurssit.',
    desc: 'Muunna valuuttoja Euroopan keskuspankin virallisilla kursseilla.',
    keys: ['valuutta', 'euro', 'dollari', 'kurssi', 'currency'],
    render: function (root, c) {
      var cache = MT.db.data.fx || null;
      var amt = c.h('input.ctl.mono', { value: '100', inputmode: 'decimal' });
      var from = c.h('select.ctl'), to = c.h('select.ctl');
      var out = c.h('div'), info = c.h('div.lbl', { text: 'EI KURSSEJA LADATTU' });
      var NAMES = { EUR: 'Euro', USD: 'Yhdysvaltain dollari', SEK: 'Ruotsin kruunu', NOK: 'Norjan kruunu', DKK: 'Tanskan kruunu', GBP: 'Englannin punta', CHF: 'Sveitsin frangi', JPY: 'Japanin jeni', PLN: 'Puolan zloty', CZK: 'Tšekin koruna', CAD: 'Kanadan dollari', AUD: 'Australian dollari', CNY: 'Kiinan juan', TRY: 'Turkin liira', ISK: 'Islannin kruunu' };

      function fillSel(rates) {
        var codes = Object.keys(rates).sort();
        [from, to].forEach(function (s) {
          var old = s.value; MT.clear(s);
          codes.forEach(function (x) { s.appendChild(c.h('option', { value: x, text: x + (NAMES[x] ? ' — ' + NAMES[x] : '') })); });
          s.value = old && codes.indexOf(old) >= 0 ? old : (s === from ? 'EUR' : 'USD');
        });
      }
      function calc() {
        MT.clear(out);
        if (!cache) { out.appendChild(c.empty('Kursseja ei ole ladattu', 'Paina "Päivitä kurssit" hakeaksesi tuoreet kurssit verkosta.', 'i-globe')); return; }
        var v = P(amt.value);
        if (!isFinite(v)) { out.appendChild(c.empty('Syötä summa')); return; }
        var r = v / cache.rates[from.value] * cache.rates[to.value];
        out.appendChild(c.panel('TULOS', 'i-check', c.resList([
          { k: numAuto(v) + ' ' + from.value, v: num(+r.toFixed(4), r > 100 ? 2 : 4) + ' ' + to.value, big: true },
          { k: 'Kurssi', v: '1 ' + from.value + ' = ' + num(+(cache.rates[to.value] / cache.rates[from.value]).toFixed(6), 6) + ' ' + to.value },
          { k: 'Käänteiskurssi', v: '1 ' + to.value + ' = ' + num(+(cache.rates[from.value] / cache.rates[to.value]).toFixed(6), 6) + ' ' + from.value, sub: true }
        ])));
        var list = Object.keys(cache.rates).sort().map(function (k2) {
          return [k2, num(+(v / cache.rates[from.value] * cache.rates[k2]).toFixed(2), 2), NAMES[k2] || ''];
        });
        out.appendChild(c.h('div', { style: { marginTop: '11px' } }, c.panel('KAIKKI VALUUTAT', 'i-grid', c.table(['Koodi', 'Summa', 'Valuutta'], list, { text: [0, 2] }))));
      }
      function load() {
        info.textContent = 'HAETAAN KURSSEJA…';
        fetch('https://api.frankfurter.app/latest?from=EUR')
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (d) {
            d.rates.EUR = 1;
            cache = { date: d.date, rates: d.rates, at: Date.now() };
            MT.db.data.fx = cache; MT.save();
            fillSel(cache.rates); info.textContent = 'KURSSIT ' + d.date + ' · EKP';
            calc(); MT.toast('Kurssit päivitetty', 'ok');
          })
          .catch(function (e) {
            info.textContent = 'HAKU EPÄONNISTUI';
            MT.toast('Kurssien haku epäonnistui: ' + e.message, 'err');
          });
      }
      [amt].forEach(function (x) { x.addEventListener('input', calc); });
      [from, to].forEach(function (x) { x.addEventListener('change', calc); });

      root.appendChild(c.panel('VALUUTTAMUUNNOS', 'i-globe', c.h('div.panel-body', null, [
        c.h('div.fields', null, [
          c.h('div.field', null, [c.h('label', { text: 'Summa' }), amt]),
          c.h('div.field', null, [c.h('label', { text: 'Lähtövaluutta' }), from]),
          c.h('div.field', null, [c.h('label', { text: 'Kohdevaluutta' }), to])
        ]),
        c.h('div.btn-row', { style: { marginTop: '11px' } }, [
          c.btn('Päivitä kurssit', { cls: 'btn-pri', icon: 'i-download', on: load }),
          c.btn('Vaihda suunta', { icon: 'i-refresh', on: function () { var t = from.value; from.value = to.value; to.value = t; calc(); } }),
          c.h('span.grow'), info
        ])
      ])), info);
      root.appendChild(c.h('div', { style: { marginTop: '13px' } }, out));
      root.appendChild(c.h('div', { style: { marginTop: '11px' } },
        c.note('Tämä on ainoa laskurimoduulin työkalu, joka käyttää verkkoa. Kurssit haetaan Frankfurter-rajapinnasta (EKP:n julkaisemat viitekurssit) vasta kun painat "Päivitä kurssit". Kurssit tallennetaan selaimeesi myöhempää käyttöä varten.', 'info')));

      if (cache) { fillSel(cache.rates); info.textContent = 'KURSSIT ' + cache.date + ' · VÄLIMUISTI'; }
      calc();
    }
  });

  /* ---------- 13. Aikamuunnin ---------- */
  R({
    id: 'aikamuunnin', cat: 'laskurit', name: 'Aikamuunnin', icon: 'i-clock',
    desc: 'Muunna sekunnit, minuutit, tunnit ja päivät keskenään.',
    keys: ['aika', 'sekunti', 'minuutti', 'tunti', 'kesto'],
    fields: [
      { k: 'arvo', type: 'num', label: 'Arvo', def: '90' },
      { k: 'yks', type: 'select', label: 'Yksikkö', def: 'min', opts: [['ms', 'millisekuntia'], ['s', 'sekuntia'], ['min', 'minuuttia'], ['h', 'tuntia'], ['vrk', 'vuorokautta'], ['viikko', 'viikkoa']] }
    ],
    run: function (v) {
      if (!isFinite(v.arvo)) return null;
      var f = { ms: 0.001, s: 1, min: 60, h: 3600, vrk: 86400, viikko: 604800 };
      var s = v.arvo * f[v.yks];
      var d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60;
      return {
        rows: [
          { k: 'Millisekunteja', v: num(+(s * 1000).toFixed(0)) },
          { k: 'Sekunteja', v: numAuto(s), big: true },
          { k: 'Minuutteja', v: numAuto(s / 60) },
          { k: 'Tunteja', v: numAuto(s / 3600) },
          { k: 'Vuorokausia', v: numAuto(s / 86400) },
          { k: 'Viikkoja', v: numAuto(s / 604800) },
          { k: 'Muotoiltuna', v: (d ? d + ' pv ' : '') + MT.pad(hh) + ':' + MT.pad(mm) + ':' + MT.pad(Math.floor(ss)), big: true },
          { k: 'ISO 8601 -kesto', v: 'P' + (d ? d + 'D' : '') + 'T' + hh + 'H' + mm + 'M' + (+ss.toFixed(3)) + 'S', sub: true }
        ]
      };
    }
  });

  /* ---------- 14. Päivämäärälaskuri ---------- */
  R({
    id: 'paivamaaralaskuri', cat: 'laskurit', name: 'Päivämäärälaskuri', icon: 'i-clock',
    desc: 'Lisää tai vähennä päiviä ja laske kahden päivän väli.',
    keys: ['päivämäärä', 'päivä', 'ero', 'lisää'],
    fields: [
      { k: 'alku', type: 'date', label: 'Päivämäärä', def: MT.dateStr() },
      { k: 'maara', type: 'num', label: 'Lisää päiviä (voi olla negatiivinen)', def: '30' },
      { k: 'loppu', type: 'date', label: 'Vertailupäivä', def: MT.dateStr(new Date(Date.now() + 86400000 * 30)) }
    ],
    run: function (v) {
      if (!v.alku) return null;
      var d0 = new Date(v.alku + 'T12:00:00');
      var rows = [];
      var opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      rows.push({ k: 'Lähtöpäivä', v: d0.toLocaleDateString('fi-FI', opts) });
      if (isFinite(v.maara)) {
        var d1 = new Date(d0.getTime() + v.maara * 86400000);
        rows.push({ k: (v.maara >= 0 ? '+' : '') + v.maara + ' päivää', v: d1.toLocaleDateString('fi-FI', opts), big: true });
        rows.push({ k: 'ISO-muoto', v: MT.dateStr(d1), sub: true });
      }
      if (v.loppu) {
        var d2 = new Date(v.loppu + 'T12:00:00');
        var diff = Math.round((d2 - d0) / 86400000);
        var wd = 0, cur = new Date(Math.min(d0, d2)), end = new Date(Math.max(d0, d2));
        while (cur < end) { var g = cur.getDay(); if (g !== 0 && g !== 6) wd++; cur.setDate(cur.getDate() + 1); }
        rows.push({ k: 'Päiviä välillä', v: num(diff) + ' päivää', big: true });
        rows.push({ k: 'Arkipäiviä', v: num(wd) + ' päivää' });
        rows.push({ k: 'Viikkoja', v: numAuto(diff / 7) });
        rows.push({ k: 'Kuukausia (n.)', v: numAuto(diff / 30.437), sub: true });
      }
      rows.push({ k: 'Viikonpäivä', v: d0.toLocaleDateString('fi-FI', { weekday: 'long' }), sub: true });
      rows.push({ k: 'Viikko', v: isoWeek(d0), sub: true });
      return { rows: rows };
    }
  });
  function isoWeek(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dn = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dn);
    var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil((((t - y0) / 86400000) + 1) / 7) + ' / ' + t.getUTCFullYear();
  }
  MT.isoWeek = isoWeek;

  /* ---------- 15. Ikälaskuri ---------- */
  R({
    id: 'ikalaskuri', cat: 'laskurit', name: 'Ikälaskuri', icon: 'i-clock',
    desc: 'Tarkka ikä vuosina, kuukausina ja päivinä sekä seuraava syntymäpäivä.',
    keys: ['ikä', 'syntymäpäivä', 'vuodet'],
    fields: [{ k: 'syntyma', type: 'date', label: 'Syntymäaika', def: '1990-01-01' }],
    run: function (v) {
      if (!v.syntyma) return null;
      var b = new Date(v.syntyma + 'T12:00:00'), now = new Date();
      if (b > now) return { note: { text: 'Syntymäaika on tulevaisuudessa.', kind: 'warn' } };
      var y = now.getFullYear() - b.getFullYear(), m = now.getMonth() - b.getMonth(), d = now.getDate() - b.getDate();
      if (d < 0) { m--; d += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
      if (m < 0) { y--; m += 12; }
      var days = Math.floor((now - b) / 86400000);
      var nb = new Date(now.getFullYear(), b.getMonth(), b.getDate());
      if (nb < now) nb.setFullYear(nb.getFullYear() + 1);
      return {
        rows: [
          { k: 'Ikä', v: y + ' v ' + m + ' kk ' + d + ' pv', big: true },
          { k: 'Ikä vuosina', v: numAuto(days / 365.2425) },
          { k: 'Eletyt päivät', v: num(days) },
          { k: 'Eletyt tunnit', v: num(days * 24) },
          { k: 'Sydämenlyöntejä (n. 70/min)', v: num(days * 24 * 60 * 70), sub: true },
          { k: 'Seuraava syntymäpäivä', v: nb.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), big: true },
          { k: 'Päiviä siihen', v: Math.ceil((nb - now) / 86400000) + ' päivää' }
        ]
      };
    }
  });

  /* ---------- 16. BMI ---------- */
  R({
    id: 'bmi-laskuri', cat: 'laskurit', name: 'BMI-laskuri', icon: 'i-calc',
    desc: 'Painoindeksi ja normaalipainon vaihteluväli.',
    keys: ['bmi', 'painoindeksi', 'paino', 'pituus'],
    fields: [
      { k: 'pituus', type: 'num', label: 'Pituus (cm)', def: '175' },
      { k: 'paino', type: 'num', label: 'Paino (kg)', def: '72' }
    ],
    run: function (v) {
      if (!isFinite(v.pituus) || !isFinite(v.paino) || v.pituus <= 0) return null;
      var m = v.pituus / 100, bmi = v.paino / (m * m);
      var lk = bmi < 18.5 ? 'Alipaino' : bmi < 25 ? 'Normaalipaino' : bmi < 30 ? 'Lievä lihavuus' : bmi < 35 ? 'Merkittävä lihavuus' : bmi < 40 ? 'Vaikea lihavuus' : 'Sairaalloinen lihavuus';
      return {
        rows: [
          { k: 'BMI', v: num(+bmi.toFixed(1), 1), big: true },
          { k: 'Luokitus', v: lk, big: true },
          { k: 'Normaalipainon väli', v: num(+(18.5 * m * m).toFixed(1), 1) + ' – ' + num(+(24.9 * m * m).toFixed(1), 1) + ' kg' },
          { k: 'Ero normaalipainoon', v: bmi < 18.5 ? '−' + num(+(18.5 * m * m - v.paino).toFixed(1), 1) + ' kg' : bmi > 24.9 ? '+' + num(+(v.paino - 24.9 * m * m).toFixed(1), 1) + ' kg' : '0 kg', sub: true }
        ],
        foot: 'BMI on karkea väestötason mittari: se ei huomioi lihasmassaa, kehonkoostumusta eikä ikää. Terveysarvion tekee aina terveydenhuollon ammattilainen.'
      };
    }
  });

  /* ---------- 17. Polttoainelaskuri ---------- */
  R({
    id: 'polttoainelaskuri', cat: 'laskurit', name: 'Polttoainelaskuri', icon: 'i-calc',
    desc: 'Matkan polttoainekulut, kulutus ja kustannus per kilometri.',
    keys: ['polttoaine', 'bensa', 'kulutus', 'matka', 'diesel'],
    fields: [
      { k: 'matka', type: 'num', label: 'Matka (km)', def: '450' },
      { k: 'kulutus', type: 'num', label: 'Kulutus (l/100 km)', def: '6,4' },
      { k: 'hinta', type: 'num', label: 'Polttoaineen hinta (€/l)', def: '1,85' },
      { k: 'hlo', type: 'num', label: 'Matkustajia', def: '1' }
    ],
    run: function (v) {
      if (!isFinite(v.matka) || !isFinite(v.kulutus) || !isFinite(v.hinta)) return null;
      var l = v.matka * v.kulutus / 100, e = l * v.hinta, n = Math.max(1, Math.round(v.hlo) || 1);
      return {
        rows: [
          { k: 'Polttoainetta', v: num(+l.toFixed(2), 2) + ' l', big: true },
          { k: 'Kustannus', v: num(+e.toFixed(2), 2) + ' €', big: true },
          { k: 'Per kilometri', v: num(+(e / v.matka).toFixed(3), 3) + ' €/km' },
          { k: 'Per henkilö', v: num(+(e / n).toFixed(2), 2) + ' €' },
          { k: 'Edestakainen matka', v: num(+(e * 2).toFixed(2), 2) + ' €', sub: true },
          { k: 'CO₂-päästöt (n.)', v: num(+(l * 2.35).toFixed(1), 1) + ' kg', sub: true }
        ],
        foot: 'CO₂-arvio perustuu bensiinin keskimääräiseen päästökertoimeen 2,35 kg/l. Dieselillä kerroin on noin 2,66 kg/l.'
      };
    }
  });

  /* ---------- 18. Sähkölaskuri ---------- */
  R({
    id: 'sahkolaskuri', cat: 'laskurit', name: 'Sähkökustannuslaskuri', icon: 'i-bolt',
    desc: 'Laitteen sähkönkulutus ja kustannus päivässä, kuukaudessa ja vuodessa.',
    keys: ['sähkö', 'kulutus', 'kwh', 'laite', 'energia'],
    fields: [
      { k: 'teho', type: 'num', label: 'Teho (W)', def: '150' },
      { k: 'tunnit', type: 'num', label: 'Käyttö (h/vrk)', def: '8' },
      { k: 'hinta', type: 'num', label: 'Sähkön hinta (snt/kWh)', def: '12,5' },
      { k: 'siirto', type: 'num', label: 'Siirtomaksu (snt/kWh)', def: '5,5' }
    ],
    run: function (v) {
      if (!isFinite(v.teho) || !isFinite(v.tunnit)) return null;
      var kwhD = v.teho * v.tunnit / 1000;
      var snt = (isFinite(v.hinta) ? v.hinta : 0) + (isFinite(v.siirto) ? v.siirto : 0);
      var eD = kwhD * snt / 100;
      return {
        rows: [
          { k: 'Kulutus / vrk', v: num(+kwhD.toFixed(3), 3) + ' kWh' },
          { k: 'Kulutus / vuosi', v: num(+(kwhD * 365).toFixed(1), 1) + ' kWh', big: true },
          { k: 'Kustannus / vrk', v: num(+eD.toFixed(2), 2) + ' €' },
          { k: 'Kustannus / kk', v: num(+(eD * 30.44).toFixed(2), 2) + ' €', big: true },
          { k: 'Kustannus / vuosi', v: num(+(eD * 365).toFixed(2), 2) + ' €', big: true },
          { k: 'Kokonaishinta', v: num(+snt.toFixed(2), 2) + ' snt/kWh', sub: true }
        ]
      };
    }
  });

  /* ---------- 19. Satunnaisluku ---------- */
  R({
    id: 'satunnaisluku', cat: 'laskurit', name: 'Satunnaisluku', icon: 'i-dice', kind: 'custom',
    desc: 'Kryptografisesti turvallisia satunnaislukuja valitulta väliltä.',
    keys: ['satunnainen', 'arvonta', 'random', 'numero'],
    render: function (root, c) {
      var F = [
        { k: 'min', type: 'num', label: 'Pienin arvo', def: '1' },
        { k: 'max', type: 'num', label: 'Suurin arvo', def: '100' },
        { k: 'kpl', type: 'num', label: 'Lukujen määrä', def: '1' },
        { k: 'uniq', type: 'check', label: 'Ei toistoja', def: false }
      ];
      var box = c.fields(F), out = c.h('div', { style: { marginTop: '13px' } });
      function gen() {
        var v = c.readFields(box, F);
        var lo = Math.ceil(v.min), hi = Math.floor(v.max), n = Math.max(1, Math.min(10000, Math.round(v.kpl) || 1));
        MT.clear(out);
        if (!isFinite(lo) || !isFinite(hi) || hi < lo) { out.appendChild(c.note('Tarkista väli: suurimman arvon tulee olla vähintään pienin.', 'err')); return; }
        var res = [];
        if (v.uniq) {
          if (hi - lo + 1 < n) { out.appendChild(c.note('Väliltä ei löydy ' + n + ' eri lukua.', 'err')); return; }
          var pool = [];
          for (var i = lo; i <= hi; i++) pool.push(i);
          res = MT.shuffle(pool).slice(0, n);
        } else for (var j = 0; j < n; j++) res.push(MT.rint(lo, hi));
        out.appendChild(c.panel('TULOS', 'i-dice', c.h('div', null, [
          c.h('div', { style: { padding: '18px', textAlign: 'center', fontSize: n === 1 ? '46px' : '16px', fontFamily: 'var(--mono)', wordBreak: 'break-word', lineHeight: '1.5' }, text: res.join(n === 1 ? '' : ', ') }),
          c.h('div.panel-foot', null, [
            c.btn('Kopioi', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(res.join('\n')); } }),
            c.btn('Arvo uudelleen', { cls: 'btn-sm btn-pri', icon: 'i-refresh', on: gen }),
            c.h('span.grow'),
            c.h('span.lbl', { text: res.length + ' LUKUA · SUMMA ' + num(res.reduce(function (a, b) { return a + b; }, 0)) })
          ])
        ])));
      }
      root.appendChild(c.panel('ASETUKSET', 'i-filter', c.h('div.panel-body', null, box)));
      root.appendChild(c.h('div.btn-row', { style: { marginTop: '12px' } }, [
        c.btn('Arvo luvut', { cls: 'btn-pri', icon: 'i-dice', on: gen })
      ]));
      root.appendChild(out);
      gen();
    }
  });
})();
