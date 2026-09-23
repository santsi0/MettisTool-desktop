/* Moduuli: Teksti */
(function () {
  'use strict';
  var R = MT.reg, h = MT.h;
  var SAMPLE = 'MettisTool on ammattilaisen työkalupakki selaimeen.\nSe sisältää yli 170 työkalua kehittäjille ja tehokäyttäjille.\nKaikki käsittely tapahtuu paikallisesti — mitään ei lähetetä palvelimelle.\nMettisTool on ammattilaisen työkalupakki selaimeen.';

  function words(s) {
    return String(s)
      .replace(/([a-zäöå0-9])([A-ZÄÖÅ])/g, '$1 $2')
      .replace(/([A-ZÄÖÅ]+)([A-ZÄÖÅ][a-zäöå])/g, '$1 $2')
      .split(/[\s_\-./\\]+/).filter(Boolean);
  }
  function stats(t) {
    var chars = t.length, noSpace = t.replace(/\s/g, '').length;
    var w = t.trim() ? t.trim().split(/\s+/).length : 0;
    var lines = t ? t.split('\n').length : 0;
    var sentences = (t.match(/[^.!?…]+[.!?…]+(\s|$)/g) || []).length || (t.trim() ? 1 : 0);
    var paras = t.split(/\n\s*\n/).filter(function (p) { return p.trim(); }).length;
    return { chars: chars, noSpace: noSpace, words: w, lines: lines, sentences: sentences, paras: paras,
      bytes: new Blob([t]).size, unique: new Set(t.toLowerCase().match(/[\wäöå]+/g) || []).size };
  }
  function ioTool(o) {
    R({
      id: o.id, cat: 'teksti', name: o.name, icon: o.icon || 'i-text', kind: 'io', desc: o.desc, keys: o.keys,
      io: {
        inLabel: o.inLabel || 'TEKSTI', outLabel: o.outLabel || 'TULOS', lang: 'none',
        sample: o.sample === undefined ? SAMPLE : o.sample, opts: o.opts,
        run: function (t, v) {
          var out = o.run(t, v);
          if (typeof out === 'string') {
            var s = stats(out);
            return { out: out, status: o.status || 'VALMIS', kind: 'ok', meta: [['SANAT', MT.num(s.words)], ['RIVIT', MT.num(s.lines)]] };
          }
          return out;
        },
        foot: o.foot
      }
    });
  }

  /* ---------- analyysi ---------- */
  R({
    id: 'sanalaskuri', cat: 'teksti', name: 'Tekstianalyysi', icon: 'i-text', kind: 'custom',
    desc: 'Sanat, merkit, lauseet, kappaleet, lukuaika ja yleisimmät sanat yhdellä silmäyksellä.',
    keys: ['sanalaskuri', 'merkit', 'laske', 'tilasto', 'analyysi', 'lukuaika'],
    render: function (root, c) {
      var ed = c.editor({ label: 'TEKSTI', onInput: upd, drop: function (f) { MT.readFile(f).then(function (t) { ed.set(t); upd(); }); } });
      ed.el.style.minHeight = '320px';
      var out = h('div');
      function upd() {
        var t = ed.get(), s = stats(t);
        MT.clear(out);
        out.appendChild(c.panel('YLEISKATSAUS', 'i-grid', c.resList([
          { k: 'Sanoja', v: MT.num(s.words), big: true },
          { k: 'Merkkejä', v: MT.num(s.chars), big: true },
          { k: 'Merkkejä ilman välilyöntejä', v: MT.num(s.noSpace) },
          { k: 'Lauseita', v: MT.num(s.sentences) },
          { k: 'Kappaleita', v: MT.num(s.paras) },
          { k: 'Rivejä', v: MT.num(s.lines) },
          { k: 'Uniikkeja sanoja', v: MT.num(s.unique) },
          { k: 'Koko (UTF-8)', v: MT.bytes(s.bytes) },
          { k: 'Lukuaika (200 sanaa/min)', v: Math.max(1, Math.round(s.words / 200)) + ' min', sub: true },
          { k: 'Puheaika (130 sanaa/min)', v: Math.max(1, Math.round(s.words / 130)) + ' min', sub: true },
          { k: 'Sanan keskipituus', v: s.words ? (s.noSpace / s.words).toFixed(1).replace('.', ',') + ' merkkiä' : '–', sub: true },
          { k: 'Lauseen keskipituus', v: s.sentences ? (s.words / s.sentences).toFixed(1).replace('.', ',') + ' sanaa' : '–', sub: true }
        ])));
        var freq = {};
        (t.toLowerCase().match(/[\wäöå]{2,}/g) || []).forEach(function (w) { freq[w] = (freq[w] || 0) + 1; });
        var top = Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a] || a.localeCompare(b); }).slice(0, 25);
        if (top.length) {
          out.appendChild(h('div', { style: { marginTop: '11px' } }, c.panel('YLEISIMMÄT SANAT', 'i-zap',
            c.table(['Sana', 'Kpl', 'Osuus'], top.map(function (w) {
              return [w, freq[w], (freq[w] / s.words * 100).toFixed(1).replace('.', ',') + ' %'];
            }), { text: [0] }))));
        }
      }
      ed.set(SAMPLE);
      root.appendChild(c.split(ed.el, out));
      upd();
    }
  });

  ioTool({
    id: 'merkkilaskuri', name: 'Merkkilaskuri', desc: 'Laske merkit riveittäin — hyödyllinen pituusrajoitusten kanssa.',
    keys: ['merkit', 'pituus', 'laske', 'twitter', 'rajoitus'], outLabel: 'MERKIT RIVEITTÄIN',
    opts: [{ k: 'raja', type: 'num', label: 'Merkkiraja (0 = ei rajaa)', def: '280' }],
    run: function (t, o) {
      var lines = t.split('\n'), raja = o.raja;
      var out = lines.map(function (l, i) {
        var n = Array.from(l).length;
        var flag = raja > 0 ? (n > raja ? '  ⚠ ylittää ' + (n - raja) + ' merkillä' : '  ✓') : '';
        return String(i + 1).padStart(4) + ' │ ' + String(n).padStart(5) + ' merkkiä' + flag + '  │ ' + l.slice(0, 40) + (l.length > 40 ? '…' : '');
      });
      var s = stats(t);
      out.push('', 'Yhteensä: ' + MT.num(s.chars) + ' merkkiä, ' + MT.num(s.noSpace) + ' ilman välilyöntejä, ' + MT.num(s.words) + ' sanaa.');
      return { out: out.join('\n'), status: 'LASKETTU', kind: 'ok', meta: [['MERKIT', MT.num(s.chars)], ['RIVIT', MT.num(s.lines)]] };
    }
  });
  ioTool({
    id: 'lauselaskuri', name: 'Lauselaskuri', desc: 'Erottele lauseet ja näe niiden pituudet.',
    keys: ['lause', 'laske', 'pituus'], outLabel: 'LAUSEET',
    run: function (t) {
      var sent = t.match(/[^.!?…]+[.!?…]+|\S[^.!?…]*$/g) || [];
      var out = sent.map(function (s, i) {
        var w = s.trim().split(/\s+/).length;
        return (i + 1) + '. (' + w + ' sanaa, ' + s.trim().length + ' merkkiä)\n   ' + s.trim();
      });
      var avg = sent.length ? sent.reduce(function (a, s) { return a + s.trim().split(/\s+/).length; }, 0) / sent.length : 0;
      return { out: out.join('\n\n') + '\n\nLauseita: ' + sent.length + ', keskipituus ' + avg.toFixed(1).replace('.', ',') + ' sanaa.', status: sent.length + ' LAUSETTA', kind: 'ok' };
    }
  });
  ioTool({
    id: 'rivilaskuri', name: 'Rivilaskuri', desc: 'Numeroi rivit ja näe tyhjien sekä uniikkien rivien määrä.',
    keys: ['rivi', 'laske', 'numeroi'], outLabel: 'NUMEROIDUT RIVIT',
    opts: [{ k: 'tyhjat', type: 'check', label: 'Ohita tyhjät rivit numeroinnissa', def: false }],
    run: function (t, o) {
      var lines = t.split('\n'), n = 0;
      var out = lines.map(function (l) {
        if (o.tyhjat && !l.trim()) return '     │ ' + l;
        n++;
        return String(n).padStart(5) + ' │ ' + l;
      });
      var empty = lines.filter(function (l) { return !l.trim(); }).length;
      var uniq = new Set(lines).size;
      return { out: out.join('\n'), status: lines.length + ' RIVIÄ', kind: 'ok',
        meta: [['TYHJIÄ', empty], ['UNIIKKEJA', uniq], ['DUPLIKAATTEJA', lines.length - uniq]] };
    }
  });
  R({
    id: 'lukuaika', cat: 'teksti', name: 'Lukuaika-arvio', icon: 'i-clock',
    desc: 'Arvioi tekstin luku-, silmäily- ja puheaika.',
    keys: ['lukuaika', 'puheaika', 'kesto', 'arvio'],
    fields: [
      { k: 'teksti', type: 'textarea', label: 'Teksti', def: SAMPLE, rows: 8 },
      { k: 'nopeus', type: 'range', label: 'Lukunopeus', def: 200, min: 80, max: 400, step: 10, suffix: ' sanaa/min' }
    ],
    run: function (v) {
      var s = stats(v.teksti || '');
      function fmt(min) {
        if (min < 1) return Math.round(min * 60) + ' s';
        var m = Math.floor(min), sec = Math.round((min - m) * 60);
        return (m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min') + (m < 60 && sec ? ' ' + sec + ' s' : '');
      }
      return {
        rows: [
          { k: 'Lukuaika (' + v.nopeus + ' sanaa/min)', v: fmt(s.words / v.nopeus), big: true },
          { k: 'Silmäily (450 sanaa/min)', v: fmt(s.words / 450) },
          { k: 'Ääneen luku (130 sanaa/min)', v: fmt(s.words / 130) },
          { k: 'Esitysaika kalvoilla (~40 sanaa/kalvo)', v: Math.ceil(s.words / 40) + ' kalvoa', sub: true },
          { k: 'Sanoja', v: MT.num(s.words) },
          { k: 'Merkkejä', v: MT.num(s.chars) }
        ]
      };
    }
  });

  /* ---------- kirjainkoko ---------- */
  var SMALL = ['ja', 'tai', 'sekä', 'että', 'on', 'ei', 'de', 'of', 'the', 'and', 'in', 'a', 'an'];
  function toTitle(s) {
    return s.toLowerCase().replace(/([^\s\-–—]+)/g, function (w, _, i) {
      if (i > 0 && SMALL.indexOf(w) >= 0) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    });
  }
  R({
    id: 'kirjainkoko', cat: 'teksti', name: 'Kirjainkoon muunnin', icon: 'i-text', kind: 'custom',
    desc: 'Muunna teksti kaikkiin yleisiin kirjainkokomuotoihin kerralla.',
    keys: ['kirjainkoko', 'case', 'camel', 'snake', 'kebab', 'isot', 'pienet'],
    render: function (root, c) {
      var ta = h('textarea.ctl', { rows: 4, spellcheck: 'false' });
      ta.value = 'MettisTool on ammattilaisen työkalupakki';
      var out = h('div');
      var forms = [
        ['ISOT KIRJAIMET', function (s) { return s.toUpperCase(); }],
        ['pienet kirjaimet', function (s) { return s.toLowerCase(); }],
        ['Otsikkokirjoitus', toTitle],
        ['Virkkeen alku isolla', function (s) { return s.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, function (m) { return m.toUpperCase(); }); }],
        ['camelCase', function (s) { return words(s).map(function (w, i) { return i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase(); }).join(''); }],
        ['PascalCase', function (s) { return words(s).map(function (w) { return w[0].toUpperCase() + w.slice(1).toLowerCase(); }).join(''); }],
        ['snake_case', function (s) { return words(s).map(function (w) { return w.toLowerCase(); }).join('_'); }],
        ['SCREAMING_SNAKE', function (s) { return words(s).map(function (w) { return w.toUpperCase(); }).join('_'); }],
        ['kebab-case', function (s) { return words(s).map(function (w) { return w.toLowerCase(); }).join('-'); }],
        ['dot.case', function (s) { return words(s).map(function (w) { return w.toLowerCase(); }).join('.'); }],
        ['path/case', function (s) { return words(s).map(function (w) { return w.toLowerCase(); }).join('/'); }],
        ['vAIHDETTU kOKO', function (s) { return s.replace(/./g, function (ch) { return ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase(); }); }]
      ];
      function upd() {
        MT.clear(out);
        var t = ta.value;
        out.appendChild(c.panel('MUODOT', 'i-grid', c.resList(forms.map(function (f) {
          var v = '';
          try { v = t.trim() ? f[1](t) : ''; } catch (e) { v = ''; }
          return { k: f[0], v: v || '–' };
        }))));
      }
      ta.addEventListener('input', MT.debounce(upd, 120));
      root.appendChild(c.panel('TEKSTI', 'i-text', h('div.panel-body', null, ta)));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, out));
      upd();
    }
  });
  [['isot-kirjaimet', 'ISOT KIRJAIMET', 'Muunna koko teksti isoiksi kirjaimiksi.', function (s) { return s.toUpperCase(); }],
   ['pienet-kirjaimet', 'pienet kirjaimet', 'Muunna koko teksti pieniksi kirjaimiksi.', function (s) { return s.toLowerCase(); }],
   ['otsikkokirjoitus', 'Otsikkokirjoitus', 'Muunna teksti otsikkomuotoon (Title Case).', toTitle],
   ['camelcase', 'camelCase', 'Muunna teksti camelCase-muotoon.', function (s) { return s.split('\n').map(function (l) { return words(l).map(function (w, i) { return i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase(); }).join(''); }).join('\n'); }],
   ['snake-case', 'snake_case', 'Muunna teksti snake_case-muotoon.', function (s) { return s.split('\n').map(function (l) { return words(l).map(function (w) { return w.toLowerCase(); }).join('_'); }).join('\n'); }],
   ['kebab-case', 'kebab-case', 'Muunna teksti kebab-case-muotoon.', function (s) { return s.split('\n').map(function (l) { return words(l).map(function (w) { return w.toLowerCase(); }).join('-'); }).join('\n'); }]
  ].forEach(function (x) {
    ioTool({ id: x[0], name: x[1], desc: x[2], keys: ['kirjainkoko', 'case', x[1].toLowerCase()], run: x[3] });
  });

  /* ---------- rivityökalut ---------- */
  ioTool({
    id: 'poista-duplikaatit', name: 'Poista toistuvat rivit', desc: 'Poista kaksoiskappaleet ja näe montako riviä karsiutui.',
    keys: ['duplikaatti', 'toisto', 'uniikki', 'rivit'],
    opts: [{ k: 'koko', type: 'check', label: 'Ohita kirjainkoko', def: false },
      { k: 'trim', type: 'check', label: 'Ohita rivin alku- ja loppuvälit', def: true },
      { k: 'tyhjat', type: 'check', label: 'Poista tyhjät rivit', def: false }],
    run: function (t, o) {
      var seen = Object.create(null), out = [], dup = 0;
      t.split('\n').forEach(function (l) {
        var key = o.trim ? l.trim() : l;
        if (o.tyhjat && !key) return;
        if (o.koko) key = key.toLowerCase();
        if (seen[key]) { dup++; return; }
        seen[key] = 1; out.push(l);
      });
      return { out: out.join('\n'), status: 'POISTETTU ' + dup + ' RIVIÄ', kind: 'ok', meta: [['JÄLJELLÄ', out.length], ['POISTETTU', dup]] };
    }
  });
  ioTool({
    id: 'jarjesta-rivit', name: 'Järjestä rivit', desc: 'Lajittele rivit aakkosittain, numeerisesti tai pituuden mukaan.',
    keys: ['järjestä', 'lajittele', 'sort', 'aakkoset'],
    opts: [{ k: 'tapa', type: 'select', label: 'Järjestys', def: 'aak', opts: [['aak', 'Aakkosjärjestys (fi)'], ['num', 'Numeerinen'], ['pituus', 'Rivin pituus'], ['satunnainen', 'Satunnainen']] },
      { k: 'kaanna', type: 'check', label: 'Käänteinen järjestys', def: false },
      { k: 'koko', type: 'check', label: 'Ohita kirjainkoko', def: true }],
    run: function (t, o) {
      var lines = t.split('\n');
      if (o.tapa === 'satunnainen') lines = MT.shuffle(lines);
      else lines.sort(function (a, b) {
        if (o.tapa === 'num') return (parseFloat(a) || 0) - (parseFloat(b) || 0);
        if (o.tapa === 'pituus') return a.length - b.length;
        return (o.koko ? a.toLowerCase() : a).localeCompare(o.koko ? b.toLowerCase() : b, 'fi');
      });
      if (o.kaanna) lines.reverse();
      return { out: lines.join('\n'), status: 'JÄRJESTETTY', kind: 'ok', meta: [['RIVIT', lines.length]] };
    }
  });
  ioTool({
    id: 'kaanna-rivit', name: 'Käännä rivit', desc: 'Käännä rivijärjestys tai jokaisen rivin merkkijärjestys.',
    keys: ['käännä', 'reverse', 'rivit', 'peilaa'],
    opts: [{ k: 'tapa', type: 'select', label: 'Tapa', def: 'rivit', opts: [['rivit', 'Käännä rivijärjestys'], ['merkit', 'Käännä merkit rivillä'], ['sanat', 'Käännä sanajärjestys rivillä'], ['kaikki', 'Käännä koko teksti']] }],
    run: function (t, o) {
      if (o.tapa === 'rivit') return t.split('\n').reverse().join('\n');
      if (o.tapa === 'merkit') return t.split('\n').map(function (l) { return Array.from(l).reverse().join(''); }).join('\n');
      if (o.tapa === 'sanat') return t.split('\n').map(function (l) { return l.split(/\s+/).reverse().join(' '); }).join('\n');
      return Array.from(t).reverse().join('');
    }
  });
  ioTool({
    id: 'etsi-korvaa', name: 'Etsi ja korvaa', desc: 'Korvaa tekstiä tavallisella haulla tai säännöllisellä lausekkeella.',
    keys: ['etsi', 'korvaa', 'replace', 'haku'],
    opts: [{ k: 'etsi', type: 'text', label: 'Etsi', def: 'työkalupakki', mono: true },
      { k: 'korvaa', type: 'text', label: 'Korvaa tällä', def: 'apuväline', mono: true },
      { k: 'regex', type: 'check', label: 'Tulkitse säännöllisenä lausekkeena', def: false },
      { k: 'koko', type: 'check', label: 'Ohita kirjainkoko', def: false }],
    run: function (t, o) {
      if (!o.etsi) return { out: t, status: 'EI HAKUSANAA', kind: 'warn' };
      var pat = o.regex ? o.etsi : o.etsi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp(pat, 'g' + (o.koko ? 'i' : ''));
      var n = (t.match(re) || []).length;
      return { out: t.replace(re, o.korvaa), status: n + ' KORVAUSTA', kind: n ? 'ok' : 'warn', meta: [['OSUMAT', n]] };
    }
  });

  /* ---------- diff ---------- */
  R({
    id: 'teksti-diff', cat: 'teksti', name: 'Tekstivertailu', icon: 'i-grid', kind: 'custom',
    desc: 'Vertaa kahta tekstiä rivi riviltä ja näe lisäykset, poistot ja muutokset.',
    keys: ['diff', 'vertaa', 'ero', 'muutokset', 'vertailu'],
    render: function (root, c) {
      var a = c.editor({ label: 'ALKUPERÄINEN', onInput: MT.debounce(upd, 250), drop: function (f) { MT.readFile(f).then(function (t) { a.set(t); upd(); }); } });
      var b = c.editor({ label: 'MUUTETTU', onInput: MT.debounce(upd, 250), drop: function (f) { MT.readFile(f).then(function (t) { b.set(t); upd(); }); } });
      a.el.style.minHeight = b.el.style.minHeight = '220px';
      var out = h('div', { style: { marginTop: '13px' } });
      var sb = c.statusbar([]);
      function lcs(x, y) {
        var n = x.length, m = y.length;
        if (n * m > 4e6) throw new Error('Tekstit ovat liian pitkiä vertailtavaksi (yli 2000 riviä).');
        var d = [];
        for (var i = 0; i <= n; i++) d.push(new Uint32Array(m + 1));
        for (i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--)
          d[i][j] = x[i] === y[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
        var res = [], i2 = 0, j2 = 0;
        while (i2 < n && j2 < m) {
          if (x[i2] === y[j2]) { res.push(['=', x[i2]]); i2++; j2++; }
          else if (d[i2 + 1][j2] >= d[i2][j2 + 1]) { res.push(['-', x[i2++]]); }
          else res.push(['+', y[j2++]]);
        }
        while (i2 < n) res.push(['-', x[i2++]]);
        while (j2 < m) res.push(['+', y[j2++]]);
        return res;
      }
      function upd() {
        MT.clear(out);
        var x = a.get().split('\n'), y = b.get().split('\n');
        var res;
        try { res = lcs(x, y); } catch (e) { out.appendChild(c.note(e.message, 'err')); return; }
        var add = 0, del = 0, box = h('div', { style: { fontFamily: 'var(--mono)', fontSize: '12px', overflow: 'auto', maxHeight: '520px' } });
        var la = 0, lb = 0;
        res.forEach(function (r) {
          var col = r[0] === '+' ? 'rgba(63,179,127,.12)' : r[0] === '-' ? 'rgba(224,82,96,.12)' : 'transparent';
          var mark = r[0] === '=' ? ' ' : r[0];
          if (r[0] === '+') { add++; lb++; } else if (r[0] === '-') { del++; la++; } else { la++; lb++; }
          box.appendChild(h('div', { style: { display: 'flex', gap: '10px', padding: '1px 10px', background: col, whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }, [
            h('span', { text: r[0] === '+' ? '' : String(la), style: { width: '34px', color: 'var(--tx-3)', textAlign: 'right', flex: 'none' } }),
            h('span', { text: r[0] === '-' ? '' : String(lb), style: { width: '34px', color: 'var(--tx-3)', textAlign: 'right', flex: 'none' } }),
            h('span', { text: mark, style: { width: '10px', flex: 'none', color: r[0] === '+' ? 'var(--ok)' : r[0] === '-' ? 'var(--err)' : 'var(--tx-3)' } }),
            h('span', { text: r[1], style: { flex: '1' } })
          ]));
        });
        out.appendChild(c.panel('EROT', 'i-grid', box, h('span.lbl', { text: '+' + add + ' / −' + del })));
        sb.set([{ k: '', v: add + del ? 'EROJA LÖYTYI' : 'TEKSTIT OVAT SAMAT', kind: add + del ? 'warn' : 'ok', dot: true },
          { k: 'LISÄTTY', v: add }, { k: 'POISTETTU', v: del }, { k: 'SAMAT', v: res.length - add - del }]);
      }
      a.set(SAMPLE);
      b.set(SAMPLE.replace('yli 170 työkalua', 'yli 200 työkalua').replace('tehokäyttäjille', 'tehokäyttäjille ja suunnittelijoille'));
      root.appendChild(c.split(a.el, b.el));
      root.appendChild(sb);
      root.appendChild(out);
      upd();
    }
  });

  /* ---------- siivous ---------- */
  ioTool({
    id: 'tyhjatilan-siivous', name: 'Tyhjätilan siivous', desc: 'Poista ylimääräiset välilyönnit, sarkaimet ja rivinloppujen tyhjät merkit.',
    keys: ['tyhjä', 'välilyönti', 'siivoa', 'trim', 'sarkain'],
    sample: '   Liikaa    välilyöntejä   rivillä.   \n\n\n\tSarkainsisennys ja   loppuvälit.   \n   ',
    opts: [{ k: 'trim', type: 'check', label: 'Poista rivien alku- ja loppuvälit', def: true },
      { k: 'moni', type: 'check', label: 'Tiivistä peräkkäiset välilyönnit yhdeksi', def: true },
      { k: 'sarkain', type: 'check', label: 'Muunna sarkaimet välilyönneiksi', def: true },
      { k: 'tyhjat', type: 'check', label: 'Poista tyhjät rivit', def: false },
      { k: 'nayt', type: 'check', label: 'Poista näkymättömät ohjausmerkit', def: true }],
    run: function (t, o) {
      var s = t;
      if (o.nayt) s = s.replace(/[​-‍﻿­]/g, '').replace(/ /g, ' ');
      if (o.sarkain) s = s.replace(/\t/g, '  ');
      if (o.moni) s = s.replace(/ {2,}/g, ' ');
      if (o.trim) s = s.split('\n').map(function (l) { return l.trim(); }).join('\n');
      if (o.tyhjat) s = s.split('\n').filter(function (l) { return l.trim(); }).join('\n');
      return { out: s, status: 'SIIVOTTU', kind: 'ok', meta: [['POISTETTU', MT.num(t.length - s.length) + ' merkkiä']] };
    }
  });
  ioTool({
    id: 'rivinvaihtojen-siivous', name: 'Rivinvaihtojen siivous', desc: 'Yhdistä rivit, poista ylimääräiset tyhjät rivit tai vaihda rivinvaihtotyyli.',
    keys: ['rivinvaihto', 'newline', 'crlf', 'yhdistä'],
    opts: [{ k: 'tapa', type: 'select', label: 'Toiminto', def: 'tiivista', opts: [
      ['tiivista', 'Tiivistä useat tyhjät rivit yhdeksi'], ['poista', 'Poista kaikki rivinvaihdot'],
      ['kappale', 'Yhdistä kappaleen rivit yhdeksi'], ['crlf', 'Muunna CRLF → LF'], ['lf', 'Muunna LF → CRLF']] }],
    run: function (t, o) {
      if (o.tapa === 'tiivista') return t.replace(/\n{3,}/g, '\n\n');
      if (o.tapa === 'poista') return t.replace(/\s*\n\s*/g, ' ').trim();
      if (o.tapa === 'kappale') return t.split(/\n\s*\n/).map(function (p) { return p.replace(/\s*\n\s*/g, ' ').trim(); }).join('\n\n');
      if (o.tapa === 'crlf') return t.replace(/\r\n/g, '\n');
      return t.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    }
  });

  /* ---------- slug & url ---------- */
  function slugify(s, sep, lower) {
    var map = { 'ä': 'a', 'ö': 'o', 'å': 'a', 'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', 'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i', 'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ø': 'o', 'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ñ': 'n', 'ç': 'c', 'ß': 'ss', 'š': 's', 'ž': 'z', 'ð': 'd', 'þ': 'th' };
    var t = (lower ? s.toLowerCase() : s).replace(/[äöåàáâãèéêëìíîïòóôõøùúûüñçߚžðþ]/gi, function (c) {
      var low = c.toLowerCase(), r = map[low] || c;
      return c === low ? r : r.toUpperCase();
    });
    return t.replace(/[^\w\s-]/g, ' ').trim().replace(/[\s_-]+/g, sep || '-').replace(new RegExp('^' + (sep || '-') + '+|' + (sep || '-') + '+$', 'g'), '');
  }
  ioTool({
    id: 'teksti-slug', name: 'Teksti → slug', desc: 'Muunna otsikot URL-ystävällisiksi slugeiksi ääkköset korvaten.',
    keys: ['slug', 'url', 'osoite', 'seo', 'ääkköset'],
    sample: 'Näin teet ammattimaisen käyttöliittymän\nÄäkköset & erikoismerkit: hyvä käytäntö!\n  Useita   välilyöntejä  ',
    opts: [{ k: 'sep', type: 'select', label: 'Erotin', def: '-', opts: [['-', 'Viiva -'], ['_', 'Alaviiva _'], ['.', 'Piste .'], ['', 'Ei erotinta']] },
      { k: 'lower', type: 'check', label: 'Muunna pieniksi kirjaimiksi', def: true }],
    run: function (t, o) {
      return t.split('\n').map(function (l) { return l.trim() ? slugify(l, o.sep, o.lower) : ''; }).join('\n');
    }
  });
  ioTool({
    id: 'teksti-url', name: 'Teksti → URL-osoite', desc: 'Rakenna valmiita URL-osoitteita riveistä valitulla pohjalla.',
    keys: ['url', 'osoite', 'linkki', 'slug'],
    sample: 'Näin teet ammattimaisen käyttöliittymän\nParhaat kehitystyökalut 2026\nUsein kysytyt kysymykset',
    opts: [{ k: 'pohja', type: 'text', label: 'Osoitteen alku', def: 'https://esimerkki.fi/artikkelit/', mono: true },
      { k: 'paate', type: 'text', label: 'Pääte', def: '', mono: true, ph: 'esim. .html' }],
    run: function (t, o) {
      return t.split('\n').filter(function (l) { return l.trim(); })
        .map(function (l) { return (o.pohja || '') + slugify(l, '-', true) + (o.paate || ''); }).join('\n');
    }
  });

  /* ---------- poiminta ---------- */
  function extractTool(id, name, desc, keys, re, post) {
    ioTool({
      id: id, name: name, desc: desc, keys: keys, outLabel: 'LÖYDETYT',
      sample: 'Ota yhteyttä: myynti@esimerkki.fi tai tuki@mettistool.fi (p. 040 123 4567).\nLisätietoja: https://mettistool.fi/ohjeet ja http://esimerkki.fi/tuotteet?id=42\nHinnat: 249,90 € ja 1 299 €, alennus 30 %.',
      opts: [{ k: 'uniq', type: 'check', label: 'Poista kaksoiskappaleet', def: true },
        { k: 'jarj', type: 'check', label: 'Järjestä aakkosittain', def: false }],
      run: function (t, o) {
        var found = t.match(re) || [];
        if (post) found = found.map(post);
        if (o.uniq) found = found.filter(function (x, i, a) { return a.indexOf(x) === i; });
        if (o.jarj) found.sort(function (a, b) { return a.localeCompare(b, 'fi', { numeric: true }); });
        return { out: found.join('\n'), status: found.length + ' OSUMAA', kind: found.length ? 'ok' : 'warn', meta: [['LÖYTYI', found.length]] };
      }
    });
  }
  extractTool('sahkopostien-poiminta', 'Sähköpostien poiminta', 'Poimi kaikki sähköpostiosoitteet tekstistä.',
    ['sähköposti', 'email', 'poimi', 'osoite'], /[\w.!#$%&'*+/=?^`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+/g);
  extractTool('url-poiminta', 'URL-osoitteiden poiminta', 'Poimi kaikki linkit tekstistä.',
    ['url', 'linkki', 'poimi', 'osoite'], /https?:\/\/[^\s<>"'()]+/g);
  extractTool('numeroiden-poiminta', 'Numeroiden poiminta', 'Poimi luvut tekstistä, myös desimaalit ja tuhaterottimet.',
    ['numero', 'luku', 'poimi'], /-?\d{1,3}(?:[  ]\d{3})*(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/g);

  R({
    id: 'sanojen-frekvenssi', cat: 'teksti', name: 'Sanojen frekvenssi', icon: 'i-zap', kind: 'io',
    desc: 'Laske sanojen esiintymismäärät ja tunnista toistot.',
    keys: ['frekvenssi', 'sanat', 'toisto', 'tilasto', 'laske'],
    io: {
      inLabel: 'TEKSTI', outLabel: 'FREKVENSSI', lang: 'none', sample: SAMPLE,
      opts: [{ k: 'min', type: 'num', label: 'Sanan vähimmäispituus', def: '3' },
        { k: 'kpl', type: 'num', label: 'Näytä enintään', def: '50' },
        { k: 'stop', type: 'check', label: 'Ohita yleiset apusanat', def: true }],
      run: function (t, o) {
        var STOP = 'ja on ei se että kun tai niin kuin mutta hän ne voi jos vain myös sitä siitä tämä nämä joka mikä olla ovat oli';
        var stop = o.stop ? STOP.split(' ') : [];
        var freq = {}, total = 0;
        (t.toLowerCase().match(/[\wäöå'-]+/g) || []).forEach(function (w) {
          if (w.length < (o.min || 1)) return;
          if (stop.indexOf(w) >= 0) return;
          freq[w] = (freq[w] || 0) + 1; total++;
        });
        var keys = Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a] || a.localeCompare(b, 'fi'); });
        var lim = Math.max(1, Math.round(o.kpl) || 50);
        var max = keys.length ? freq[keys[0]] : 1;
        var out = keys.slice(0, lim).map(function (w, i) {
          var bar = '█'.repeat(Math.max(1, Math.round(freq[w] / max * 24)));
          return String(i + 1).padStart(3) + '. ' + w.padEnd(22) + String(freq[w]).padStart(5) + '  ' +
            (freq[w] / total * 100).toFixed(1).padStart(5) + ' %  ' + bar;
        }).join('\n');
        return { out: out, status: keys.length + ' UNIIKKIA SANAA', kind: 'ok', meta: [['SANOJA', total], ['UNIIKKEJA', keys.length]] };
      }
    }
  });
  ioTool({
    id: 'tekstin-kaanto', name: 'Käännä teksti', desc: 'Käännä merkkijono takaperin — myös yhdistetyt merkit oikein.',
    keys: ['käännä', 'takaperin', 'peili', 'reverse'],
    sample: 'MettisTool — työkalupakki',
    run: function (t) { return Array.from(t).reverse().join(''); }
  });

  /* ---------- koodaukset ---------- */
  var MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 'Ä': '.-.-', 'Ö': '---.', 'Å': '.--.-', '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', '@': '.--.-.' };
  var MORSE_REV = {};
  Object.keys(MORSE).forEach(function (k) { MORSE_REV[MORSE[k]] = k; });
  ioTool({
    id: 'morse', name: 'Morse-koodi', desc: 'Muunna teksti morseksi ja takaisin. Tukee myös ääkkösiä.',
    keys: ['morse', 'koodi', 'sos', 'viesti'],
    sample: 'MettisTool on valmis',
    opts: [{ k: 'dir', type: 'select', label: 'Suunta', def: 'enc', opts: [['enc', 'Teksti → morse'], ['dec', 'Morse → teksti']] }],
    run: function (t, o) {
      if (o.dir === 'enc') {
        return t.toUpperCase().split('\n').map(function (l) {
          return l.split(' ').map(function (w) {
            return Array.from(w).map(function (ch) { return MORSE[ch] || (ch === ' ' ? '' : '?'); }).join(' ');
          }).join(' / ');
        }).join('\n');
      }
      return t.split('\n').map(function (l) {
        return l.split(/\s*\/\s*/).map(function (w) {
          return w.trim().split(/\s+/).map(function (c) { return MORSE_REV[c] || ''; }).join('');
        }).join(' ');
      }).join('\n');
    },
    foot: function (c) { return c.note('Kirjainten välissä on yksi välilyönti ja sanojen välissä kauttaviiva ( / ).', 'info'); }
  });
  ioTool({
    id: 'rot13', name: 'ROT13 / Caesar', desc: 'Siirrä kirjaimia aakkostossa — ROT13 on oma käänteisoperaationsa.',
    keys: ['rot13', 'caesar', 'salaus', 'siirto'],
    sample: 'MettisTool on ammattilaisen työkalupakki',
    opts: [{ k: 'n', type: 'range', label: 'Siirto', def: 13, min: 1, max: 25, step: 1, suffix: ' merkkiä' }],
    run: function (t, o) {
      var n = o.n || 13;
      return t.replace(/[a-zA-Z]/g, function (ch) {
        var base = ch <= 'Z' ? 65 : 97;
        return String.fromCharCode((ch.charCodeAt(0) - base + n) % 26 + base);
      });
    },
    foot: function (c) { return c.note('ROT13 ja Caesar-siirto eivät ole salausta vaan hämäystä. Älä käytä niitä arkaluontoisen tiedon suojaamiseen.', 'warn'); }
  });
  ioTool({
    id: 'binaarimuunnin', name: 'Teksti ↔ binääri', desc: 'Muunna teksti binäärimuotoon ja takaisin.',
    keys: ['binääri', 'bitti', 'muunna', 'koodaus'],
    sample: 'MettisTool',
    opts: [{ k: 'dir', type: 'select', label: 'Suunta', def: 'enc', opts: [['enc', 'Teksti → binääri'], ['dec', 'Binääri → teksti']] },
      { k: 'sep', type: 'text', label: 'Erotin', def: ' ' }],
    run: function (t, o) {
      if (o.dir === 'enc') {
        var b = new TextEncoder().encode(t);
        return Array.prototype.map.call(b, function (x) { return x.toString(2).padStart(8, '0'); }).join(o.sep === undefined ? ' ' : o.sep);
      }
      var bits = t.replace(/[^01]/g, '');
      if (bits.length % 8) throw new Error('Bittien määrän on oltava kahdeksan monikerta (nyt ' + bits.length + ')');
      var arr = new Uint8Array(bits.length / 8);
      for (var i = 0; i < arr.length; i++) arr[i] = parseInt(bits.substr(i * 8, 8), 2);
      return new TextDecoder().decode(arr);
    }
  });
  ioTool({
    id: 'ascii-muunnin', name: 'Teksti ↔ merkkikoodit', desc: 'Muunna teksti ASCII-/Unicode-koodipisteiksi ja takaisin.',
    keys: ['ascii', 'unicode', 'koodipiste', 'merkki'],
    sample: 'MettisTool ÄÖÅ',
    opts: [{ k: 'dir', type: 'select', label: 'Suunta', def: 'enc', opts: [['enc', 'Teksti → koodit'], ['dec', 'Koodit → teksti']] },
      { k: 'kanta', type: 'select', label: 'Kantaluku', def: '10', opts: [['10', 'Desimaali'], ['16', 'Heksadesimaali'], ['8', 'Oktaali']] }],
    run: function (t, o) {
      var base = +o.kanta;
      if (o.dir === 'enc') {
        return Array.from(t).map(function (ch) {
          var v = ch.codePointAt(0).toString(base);
          return base === 16 ? '0x' + v.toUpperCase() : v;
        }).join(' ');
      }
      return (t.match(/(0x)?[0-9A-Fa-f]+/g) || []).map(function (x) {
        return String.fromCodePoint(parseInt(x.replace(/^0x/i, ''), base));
      }).join('');
    }
  });
})();
