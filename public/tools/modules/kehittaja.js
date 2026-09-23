/* Moduuli: Kehittäjä */
(function () {
  'use strict';
  var R = MT.reg, h = MT.h;

  function indent(v) { return v === 'tab' ? '\t' : v === '0' ? '' : ' '.repeat(+v || 2); }
  var INDENT_OPT = { k: 'ind', type: 'select', label: 'Sisennys', def: '2', opts: [['2', '2 välilyöntiä'], ['4', '4 välilyöntiä'], ['tab', 'Sarkain'], ['0', 'Tiivistetty (minify)']] };
  var SAMPLE_JSON = '{"nimi":"MettisTool","versio":"1.0.0","julkaistu":true,"tyokaluja":221,"moduulit":["kehittaja","teksti","kuvat"],"tekija":{"nimi":"Arttu","maa":"FI"},"lisenssi":null}';

  function parseJSON(text) {
    try { return JSON.parse(text); }
    catch (e) {
      var m = /position (\d+)/.exec(e.message);
      if (m) {
        var pos = +m[1], before = text.slice(0, pos), line = before.split('\n').length, col = pos - before.lastIndexOf('\n');
        throw new Error('JSON-virhe rivillä ' + line + ', sarakkeessa ' + col + ': ' + e.message.replace(/ in JSON.*/, ''));
      }
      throw new Error('JSON-virhe: ' + e.message);
    }
  }
  function countJSON(o) {
    var n = { avaimet: 0, taulukot: 0, arvot: 0, syvyys: 0 };
    (function walk(v, d) {
      if (d > n.syvyys) n.syvyys = d;
      if (Array.isArray(v)) { n.taulukot++; v.forEach(function (x) { walk(x, d + 1); }); }
      else if (v && typeof v === 'object') { Object.keys(v).forEach(function (k) { n.avaimet++; walk(v[k], d + 1); }); }
      else n.arvot++;
    })(o, 1);
    return n;
  }

  /* ---------- JSON ---------- */
  R({
    id: 'json-muotoilija', cat: 'kehittaja', name: 'JSON-muotoilija', icon: 'i-code', kind: 'io',
    desc: 'Muotoile, validoi ja tiivistä JSON. Tukee avainten aakkostusta.',
    keys: ['json', 'format', 'pretty', 'muotoile', 'minify', 'tiivistä'],
    io: {
      inLabel: 'JSON-SYÖTE', outLabel: 'MUOTOILTU JSON', lang: 'json', ext: '.json', mime: 'application/json',
      sample: SAMPLE_JSON, acceptExt: '.json,.txt',
      opts: [INDENT_OPT, { k: 'sort', type: 'check', label: 'Aakkosta avaimet', def: false }],
      run: function (text, o) {
        var obj = parseJSON(text);
        if (o.sort) obj = sortKeys(obj);
        var out = JSON.stringify(obj, null, indent(o.ind));
        var st = countJSON(obj);
        return {
          out: out, status: 'VALIDI JSON', kind: 'ok',
          meta: [['AVAIMET', MT.num(st.avaimet)], ['TAULUKOT', MT.num(st.taulukot)], ['SYVYYS', st.syvyys],
            ['KOKO', MT.bytes(new Blob([out]).size)]]
        };
      }
    }
  });
  function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') {
      var o = {};
      Object.keys(v).sort().forEach(function (k) { o[k] = sortKeys(v[k]); });
      return o;
    }
    return v;
  }

  R({
    id: 'json-validoija', cat: 'kehittaja', name: 'JSON-validoija', icon: 'i-checksq', kind: 'io',
    desc: 'Tarkista JSON-rakenteen oikeellisuus ja saa tarkka virheen sijainti.',
    keys: ['json', 'validoi', 'tarkista', 'virhe'],
    io: {
      inLabel: 'JSON-SYÖTE', outLabel: 'RAPORTTI', lang: 'none', sample: SAMPLE_JSON,
      run: function (text) {
        var obj = parseJSON(text), st = countJSON(obj);
        var types = {};
        (function walk(v) {
          var t = Array.isArray(v) ? 'taulukko' : v === null ? 'null' : typeof v;
          types[t] = (types[t] || 0) + 1;
          if (Array.isArray(v)) v.forEach(walk);
          else if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { walk(v[k]); });
        })(obj);
        var lines = ['✓ JSON on validi', '', 'Juurityyppi:  ' + (Array.isArray(obj) ? 'taulukko' : obj === null ? 'null' : typeof obj),
          'Avaimia:      ' + st.avaimet, 'Taulukoita:   ' + st.taulukot, 'Alkeisarvoja: ' + st.arvot,
          'Syvyys:       ' + st.syvyys, 'Koko:         ' + MT.bytes(new Blob([text]).size), '', 'Tyyppijakauma:'];
        Object.keys(types).forEach(function (t) { lines.push('  ' + t.padEnd(12) + types[t]); });
        return { out: lines.join('\n'), status: 'VALIDI', kind: 'ok' };
      }
    }
  });

  R({
    id: 'json-katselin', cat: 'kehittaja', name: 'JSON-katselin', icon: 'i-grid', kind: 'custom',
    desc: 'Selaa JSON-rakennetta puunäkymässä ja kopioi yksittäisten solmujen polkuja.',
    keys: ['json', 'puu', 'selaa', 'viewer'],
    render: function (root, c) {
      var ta = h('textarea.ctl', { rows: 7, placeholder: 'Liitä JSON tähän…', spellcheck: 'false' });
      ta.value = SAMPLE_JSON;
      var tree = h('div', { style: { padding: '11px', fontFamily: 'var(--mono)', fontSize: '12px', overflow: 'auto', maxHeight: '520px' } });
      function node(key, val, path, depth) {
        var isObj = val && typeof val === 'object';
        var row = h('div', { style: { paddingLeft: depth * 14 + 'px', display: 'flex', gap: '7px', alignItems: 'center', minHeight: '20px', cursor: isObj ? 'pointer' : 'default' } });
        var kids = null, open = depth < 2;
        if (isObj) {
          var arrow = c.icon('i-chev-r', 'ic-sm');
          arrow.style.transition = 'transform 150ms'; arrow.style.color = 'var(--tx-3)';
          arrow.style.transform = open ? 'rotate(90deg)' : '';
          row.appendChild(arrow);
          row.onclick = function (e) {
            e.stopPropagation(); open = !open;
            arrow.style.transform = open ? 'rotate(90deg)' : '';
            if (kids) kids.style.display = open ? '' : 'none';
          };
        } else row.appendChild(h('span', { style: { width: '13px' } }));
        if (key !== null) row.appendChild(h('span.tk-key', { text: key + ':' }));
        var n = Array.isArray(val) ? val.length : isObj ? Object.keys(val).length : 0;
        row.appendChild(h('span', {
          class: isObj ? 'tk-punc' : typeof val === 'string' ? 'tk-str' : typeof val === 'number' ? 'tk-num' : val === null ? 'tk-null' : 'tk-bool',
          text: isObj ? (Array.isArray(val) ? '[' + n + ']' : '{' + n + '}') : typeof val === 'string' ? '"' + val + '"' : String(val)
        }));
        var cp = c.btn('', { cls: 'btn-gh btn-sm', icon: 'i-copy', title: 'Kopioi polku: ' + path });
        cp.style.opacity = '0';
        cp.onclick = function (e) { e.stopPropagation(); MT.copy(path, 'Polku kopioitu: ' + path); };
        row.addEventListener('mouseenter', function () { cp.style.opacity = '1'; });
        row.addEventListener('mouseleave', function () { cp.style.opacity = '0'; });
        row.appendChild(cp);
        var box = h('div', null, row);
        if (isObj) {
          kids = h('div', { style: { display: open ? '' : 'none' } });
          (Array.isArray(val) ? val.map(function (v, i) { return [i, v, path + '[' + i + ']']; })
            : Object.keys(val).map(function (k) { return [k, val[k], path + (/^[A-Za-z_]\w*$/.test(k) ? '.' + k : '["' + k + '"]')]; }))
            .forEach(function (e) { kids.appendChild(node(e[0], e[1], e[2], depth + 1)); });
          box.appendChild(kids);
        }
        return box;
      }
      function build() {
        MT.clear(tree);
        if (!ta.value.trim()) { tree.appendChild(c.empty('Ei sisältöä', 'Liitä JSON yläpuolelle.')); return; }
        try { tree.appendChild(node(null, JSON.parse(ta.value), '$', 0)); }
        catch (e) { tree.appendChild(c.note(e.message, 'err')); }
      }
      ta.addEventListener('input', MT.debounce(build, 200));
      root.appendChild(c.panel('JSON-SYÖTE', 'i-code', h('div.panel-body', null, [ta,
        h('div.btn-row', { style: { marginTop: '9px' } }, [
          c.btn('Avaa tiedosto', { icon: 'i-upload', on: function () { MT.pickFile('.json').then(function (f) { if (f) MT.readFile(f).then(function (t) { ta.value = t; build(); }); }); } }),
          c.btn('Tyhjennä', { icon: 'i-trash', on: function () { ta.value = ''; build(); } })
        ])])));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('PUUNÄKYMÄ', 'i-grid', tree)));
      build();
    }
  });

  R({
    id: 'json-yaml', cat: 'kehittaja', name: 'JSON ↔ YAML', icon: 'i-refresh', kind: 'io',
    desc: 'Muunna JSON YAML-muotoon ja takaisin.',
    keys: ['json', 'yaml', 'yml', 'muunna', 'konfiguraatio'],
    io: {
      inLabel: 'SYÖTE', outLabel: 'TULOS', lang: 'none', ext: '.yaml', sample: SAMPLE_JSON,
      opts: [{ k: 'dir', type: 'select', label: 'Suunta', def: 'j2y', opts: [['j2y', 'JSON → YAML'], ['y2j', 'YAML → JSON']] }, INDENT_OPT],
      run: function (text, o) {
        if (o.dir === 'j2y') {
          var obj = parseJSON(text);
          return { out: FMT.yamlDump(obj) + '\n', status: 'MUUNNETTU YAML:KSI', kind: 'ok', lang: 'none' };
        }
        var y = FMT.yamlParse(text);
        return { out: JSON.stringify(y, null, indent(o.ind)), status: 'MUUNNETTU JSON:KSI', kind: 'ok', lang: 'json' };
      },
      foot: function (c) { return c.note('YAML-tuki kattaa yleisimmän konfiguraatiosyntaksin: sisäkkäiset kartat ja listat, lainausmerkit, kommentit, lohkoskalaarit (| ja >) sekä inline-rakenteet. Ankkureita, tageja ja monidokumenttitiedostoja ei tueta.', 'info'); }
    }
  });

  R({
    id: 'json-xml', cat: 'kehittaja', name: 'JSON ↔ XML', icon: 'i-refresh', kind: 'io',
    desc: 'Muunna JSON XML-muotoon ja XML takaisin JSON:ksi.',
    keys: ['json', 'xml', 'muunna'],
    io: {
      inLabel: 'SYÖTE', outLabel: 'TULOS', lang: 'xml', ext: '.xml', sample: SAMPLE_JSON,
      opts: [{ k: 'dir', type: 'select', label: 'Suunta', def: 'j2x', opts: [['j2x', 'JSON → XML'], ['x2j', 'XML → JSON']] },
        { k: 'root', type: 'text', label: 'Juurielementti', def: 'root' }, INDENT_OPT],
      run: function (text, o) {
        if (o.dir === 'j2x') return { out: FMT.json2xml(parseJSON(text), o.root || 'root', indent(o.ind) || '  '), status: 'MUUNNETTU XML:KSI', kind: 'ok', lang: 'xml' };
        return { out: JSON.stringify(FMT.xml2json(text), null, indent(o.ind)), status: 'MUUNNETTU JSON:KSI', kind: 'ok', lang: 'json' };
      },
      foot: function (c) { return c.note('Attribuutit esitetään JSON:ssa etuliitteellä <b>@</b> ja elementin tekstisisältö avaimella <b>#text</b>.', 'info'); }
    }
  });

  R({
    id: 'csv-json', cat: 'kehittaja', name: 'CSV ↔ JSON', icon: 'i-refresh', kind: 'io',
    desc: 'Muunna CSV-taulukko JSON-objekteiksi ja takaisin.',
    keys: ['csv', 'json', 'taulukko', 'muunna', 'excel'],
    io: {
      inLabel: 'SYÖTE', outLabel: 'TULOS', lang: 'json', ext: '.json', acceptExt: '.csv,.json,.txt',
      sample: 'nimi;ika;kaupunki\nMatti;34;Helsinki\nLiisa;28;Tampere\nJuho;45;Oulu',
      opts: [
        { k: 'dir', type: 'select', label: 'Suunta', def: 'c2j', opts: [['c2j', 'CSV → JSON'], ['j2c', 'JSON → CSV']] },
        { k: 'delim', type: 'select', label: 'Erotin', def: 'auto', opts: [['auto', 'Tunnista automaattisesti'], [',', 'Pilkku ,'], [';', 'Puolipiste ;'], ['\t', 'Sarkain'], ['|', 'Putki |']] },
        { k: 'otsikko', type: 'check', label: 'Ensimmäinen rivi on otsikko', def: true },
        { k: 'luvut', type: 'check', label: 'Tulkitse luvut ja totuusarvot', def: true }
      ],
      run: function (text, o) {
        var d = o.delim === 'auto' ? FMT.csvDetect(text) : o.delim;
        if (o.dir === 'c2j') {
          var rows = FMT.csvParse(text, d);
          if (!rows.length) throw new Error('Tyhjä CSV');
          var head = o.otsikko ? rows.shift() : rows[0].map(function (_, i) { return 'sarake' + (i + 1); });
          var out = rows.filter(function (r) { return r.length > 1 || r[0] !== ''; }).map(function (r) {
            var obj = {};
            head.forEach(function (k, i) {
              var v = r[i] === undefined ? '' : r[i];
              if (o.luvut) {
                if (/^-?\d+(\.\d+)?$/.test(v.trim()) && v.trim() !== '') v = parseFloat(v);
                else if (/^(true|false)$/i.test(v.trim())) v = v.trim().toLowerCase() === 'true';
              }
              obj[k.trim() || 'sarake' + (i + 1)] = v;
            });
            return obj;
          });
          return { out: JSON.stringify(out, null, 2), status: 'MUUNNETTU', kind: 'ok', lang: 'json', meta: [['RIVIT', out.length], ['SARAKKEET', head.length]] };
        }
        var arr = parseJSON(text);
        if (!Array.isArray(arr)) arr = [arr];
        var cols = [];
        arr.forEach(function (o2) { Object.keys(o2 || {}).forEach(function (k) { if (cols.indexOf(k) < 0) cols.push(k); }); });
        var lines = [cols].concat(arr.map(function (o2) { return cols.map(function (k) { return o2 ? o2[k] : ''; }); }));
        return { out: FMT.csvStringify(lines, d === 'auto' ? ',' : d), status: 'MUUNNETTU', kind: 'ok', lang: 'none', meta: [['RIVIT', arr.length], ['SARAKKEET', cols.length]] };
      }
    }
  });

  /* ---------- muotoilijat ---------- */
  function fmtTool(id, name, desc, keys, lang, ext, fn, sample) {
    R({
      id: id, cat: 'kehittaja', name: name, icon: 'i-code', kind: 'io', desc: desc, keys: keys,
      io: {
        inLabel: 'SYÖTE', outLabel: 'MUOTOILTU', lang: lang, ext: ext, sample: sample,
        opts: [INDENT_OPT],
        run: function (text, o) {
          var out = fn(text, indent(o.ind) || '  ', o);
          return { out: out, status: 'MUOTOILTU', kind: 'ok', meta: [['KOKO', MT.bytes(new Blob([out]).size)]] };
        }
      }
    });
  }
  fmtTool('xml-muotoilija', 'XML-muotoilija', 'Sisennä ja siisti XML-dokumentti.', ['xml', 'muotoile', 'sisennä'], 'xml', '.xml',
    function (t, ind) {
      var doc = new DOMParser().parseFromString(t, 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('XML ei ole validi: ' + doc.querySelector('parsererror').textContent.split('\n')[0]);
      return FMT.formatHTML(new XMLSerializer().serializeToString(doc), ind);
    }, '<?xml version="1.0"?><kirjasto><kirja id="1"><nimi>Tuntematon sotilas</nimi><vuosi>1954</vuosi></kirja><kirja id="2"><nimi>Sinuhe egyptiläinen</nimi><vuosi>1945</vuosi></kirja></kirjasto>');

  fmtTool('yaml-muotoilija', 'YAML-muotoilija', 'Normalisoi YAML-tiedoston sisennys ja rakenne.', ['yaml', 'yml', 'muotoile'], 'none', '.yaml',
    function (t) { return FMT.yamlDump(FMT.yamlParse(t)) + '\n'; },
    'palvelu:\n  nimi:   mettistool\n  portti: 8080\n  ympäristöt: [dev, test, prod]\n  tagit:\n    -   web\n    -   staattinen');

  fmtTool('html-muotoilija', 'HTML-muotoilija', 'Sisennä HTML-rakenne luettavaan muotoon.', ['html', 'muotoile', 'sisennä'], 'xml', '.html',
    function (t, ind) { return FMT.formatHTML(t, ind); },
    '<!DOCTYPE html><html lang="fi"><head><meta charset="utf-8"><title>Sivu</title></head><body><main class="wrap"><h1>Otsikko</h1><p>Teksti <a href="#">linkillä</a>.</p></main></body></html>');

  fmtTool('css-muotoilija', 'CSS-muotoilija', 'Siisti ja sisennä CSS-säännöt.', ['css', 'tyyli', 'muotoile'], 'css', '.css',
    function (t, ind) { return FMT.formatCSS(t, ind); },
    ':root{--bg:#090A0D;--tx:#E8EAF0}body{margin:0;background:var(--bg);color:var(--tx);font:13px/1.45 Inter,sans-serif}.panel{border:1px solid #24272F;border-radius:6px;padding:12px}');

  fmtTool('js-muotoilija', 'JavaScript-muotoilija', 'Kevyt sisennysmuotoilija minifioidulle tai sotkuiselle JS-koodille.', ['js', 'javascript', 'muotoile', 'beautify'], 'code', '.js',
    function (t, ind) { return FMT.formatJS(t, ind); },
    'function summa(a,b){if(a>b){return a+b}else{return b-a}}const x=[1,2,3].map(n=>n*2);console.log(summa(3,5),x);');

  fmtTool('sql-muotoilija', 'SQL-muotoilija', 'Jaa SQL-kysely riveille ja sisennä avainsanat.', ['sql', 'kysely', 'muotoile', 'select'], 'code', '.sql',
    function (t, ind) { return FMT.formatSQL(t, ind); },
    'select k.id, k.nimi, count(t.id) as tilaukset from kayttajat k left join tilaukset t on t.kayttaja_id = k.id where k.aktiivinen = 1 and k.luotu > \'2024-01-01\' group by k.id, k.nimi order by tilaukset desc limit 20');

  R({
    id: 'markdown-esikatselu', cat: 'kehittaja', name: 'Markdown-muotoilija', icon: 'i-text', kind: 'custom',
    desc: 'Kirjoita Markdownia ja näe esikatselu sekä valmis HTML reaaliajassa.',
    keys: ['markdown', 'md', 'esikatselu', 'html'],
    render: function (root, c) {
      var ed = c.editor({ label: 'MARKDOWN', placeholder: '# Otsikko\n\nTekstiä **lihavoituna**…', onInput: upd, drop: function (f) { MT.readFile(f).then(function (t) { ed.set(t); upd(); }); } });
      var prev = h('div', { style: { padding: '14px 16px', overflow: 'auto', lineHeight: '1.6' } });
      var prevBox = h('div.ed', null, [h('div.ed-head', null, [c.lbl('ESIKATSELU'), h('span.grow'),
        c.btn('', { cls: 'btn-gh btn-sm', icon: 'i-copy', title: 'Kopioi HTML', on: function () { MT.copy(FMT.md2html(ed.get())); } }),
        c.btn('', { cls: 'btn-gh btn-sm', icon: 'i-download', title: 'Lataa HTML', on: function () {
          MT.download('<!DOCTYPE html>\n<html lang="fi"><head><meta charset="utf-8"><title>Dokumentti</title></head>\n<body>\n' + FMT.md2html(ed.get()) + '\n</body></html>', 'dokumentti.html', 'text/html');
        } })]), prev]);
      prevBox.style.minHeight = ed.el.style.minHeight = '400px';
      var sb = c.statusbar([]);
      function upd() {
        var t = ed.get();
        prev.innerHTML = FMT.md2html(t);
        MT.qsa('table', prev).forEach(function (x) { x.className = 'tbl'; x.style.width = '100%'; });
        MT.qsa('pre', prev).forEach(function (x) { x.style.cssText = 'background:var(--bg-2);border:1px solid var(--bd);border-radius:4px;padding:10px;overflow:auto;font-family:var(--mono);font-size:12px'; });
        MT.qsa('blockquote', prev).forEach(function (x) { x.style.cssText = 'border-left:2px solid var(--acc);margin:0;padding:2px 12px;color:var(--tx-2)'; });
        MT.qsa('code', prev).forEach(function (x) { if (x.parentNode.tagName !== 'PRE') x.style.cssText = 'background:var(--panel-3);padding:1px 5px;border-radius:3px;font-family:var(--mono);font-size:12px'; });
        var w = t.trim() ? t.trim().split(/\s+/).length : 0;
        sb.set([{ k: '', v: 'ESIKATSELU PÄIVITETTY', kind: 'ok', dot: true }, { k: 'SANAT', v: MT.num(w) },
          { k: 'MERKIT', v: MT.num(t.length) }, { k: 'LUKUAIKA', v: Math.max(1, Math.round(w / 200)) + ' min' }]);
      }
      ed.set('# MettisTool\n\n**Ammattilaisen työkalupakki** suoraan selaimessa.\n\n## Ominaisuudet\n\n- Yli 170 työkalua\n- Toimii ilman verkkoyhteyttä\n- Ei seurantaa tai mainoksia\n\n> Kaikki käsittely tapahtuu paikallisesti.\n\n| Moduuli | Työkaluja |\n| --- | --- |\n| Kehittäjä | 34 |\n| Teksti | 28 |\n\n```js\nconsole.log("Hei maailma");\n```\n\n1. Avaa työkalu\n2. Liitä sisältö\n3. Kopioi tulos\n');
      root.appendChild(c.split(ed.el, prevBox));
      root.appendChild(sb);
      upd();
    }
  });

  /* ---------- regex ---------- */
  R({
    id: 'regex-testeri', cat: 'kehittaja', name: 'Regex-testeri', icon: 'i-search', kind: 'custom',
    desc: 'Testaa säännöllisiä lausekkeita, näe osumat, ryhmät ja korvaustulos.',
    keys: ['regex', 'regexp', 'säännöllinen', 'lauseke', 'haku'],
    render: function (root, c) {
      var pat = h('input.ctl.mono', { value: '(\\w+)@(\\w+\\.\\w+)', placeholder: 'Kuvio ilman kauttaviivoja' });
      var flags = h('input.ctl.mono', { value: 'g', placeholder: 'gimsuy' });
      var repl = h('input.ctl.mono', { value: '$1 [at] $2', placeholder: 'Korvaus, esim. $1' });
      var ta = h('textarea.ctl', { rows: 7, spellcheck: 'false' });
      ta.value = 'Ota yhteyttä: matti.meikalainen@esimerkki.fi tai tuki@mettistool.fi.\nVanha osoite info@vanha.com ei ole enää käytössä.';
      var out = h('div');
      function run() {
        MT.clear(out);
        var re;
        try { re = new RegExp(pat.value, flags.value); }
        catch (e) { out.appendChild(c.note('Virheellinen kuvio: ' + e.message, 'err')); return; }
        var text = ta.value, ms = [], m, guard = 0;
        if (re.global) { re.lastIndex = 0; while ((m = re.exec(text)) !== null && guard++ < 5000) { ms.push(m); if (m[0] === '') re.lastIndex++; } }
        else { m = re.exec(text); if (m) ms.push(m); }
        var html = '', last = 0;
        ms.forEach(function (x) {
          html += MT.esc(text.slice(last, x.index)) + '<mark style="background:rgba(var(--acc-rgb),.28);color:var(--tx);border-radius:2px">' + MT.esc(x[0]) + '</mark>';
          last = x.index + x[0].length;
        });
        html += MT.esc(text.slice(last));
        out.appendChild(c.panel('OSUMAT TEKSTISSÄ', 'i-search',
          h('div', { style: { padding: '11px', fontFamily: 'var(--mono)', fontSize: '12px', whiteSpace: 'pre-wrap', lineHeight: '1.6' }, html: html || '<span style="color:var(--tx-3)">Ei sisältöä</span>' })));
        var rows = ms.slice(0, 200).map(function (x, i) {
          var groups = x.slice(1).map(function (g, gi) { return '$' + (gi + 1) + '=' + (g === undefined ? '–' : g); }).join('  ');
          if (x.groups) groups += '  ' + Object.keys(x.groups).map(function (k) { return k + '=' + x.groups[k]; }).join('  ');
          return [i + 1, x.index, x[0], groups || '–'];
        });
        out.appendChild(h('div', { style: { marginTop: '11px' } }, c.panel('OSUMALISTA (' + ms.length + ')', 'i-grid',
          ms.length ? c.table(['#', 'Kohta', 'Osuma', 'Ryhmät'], rows, { text: [] }) : c.empty('Ei osumia', 'Kuvio ei löytänyt mitään tekstistä.'))));
        if (repl.value) {
          var rep;
          try { rep = text.replace(re, repl.value); } catch (e) { rep = e.message; }
          out.appendChild(h('div', { style: { marginTop: '11px' } }, c.panel('KORVAUSTULOS', 'i-refresh',
            h('div', null, [h('pre.ed-out', { text: rep, style: { padding: '11px', maxHeight: '220px' } }),
              h('div.panel-foot', null, c.btn('Kopioi', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(rep); } }))]))));
        }
      }
      [pat, flags, repl, ta].forEach(function (x) { x.addEventListener('input', MT.debounce(run, 180)); });
      root.appendChild(c.panel('KUVIO', 'i-code', h('div.panel-body', null, [
        h('div.fields', null, [
          h('div.field', { style: { gridColumn: 'span 2' } }, [h('label', { text: 'Säännöllinen lauseke' }), pat]),
          h('div.field', null, [h('label', { text: 'Liput' }), flags]),
          h('div.field', null, [h('label', { text: 'Korvaus' }), repl])
        ]),
        h('div.field', { style: { marginTop: '11px' } }, [h('label', { text: 'Testiteksti' }), ta])
      ])));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, out));
      root.appendChild(h('div', { style: { marginTop: '11px' } }, c.note('Liput: <b>g</b> kaikki osumat · <b>i</b> kirjainkoko ohitetaan · <b>m</b> monirivinen · <b>s</b> piste vastaa rivinvaihtoa · <b>u</b> Unicode · <b>y</b> sidottu haku. Korvauksessa <b>$1</b>…<b>$9</b> viittaa ryhmiin.', 'info')));
      run();
    }
  });

  R({
    id: 'regex-generaattori', cat: 'kehittaja', name: 'Regex-generaattori', icon: 'i-zap',
    desc: 'Rakenna valmis säännöllinen lauseke yleisimpiin tarkistuksiin.',
    keys: ['regex', 'generaattori', 'kuvio', 'validointi'],
    fields: [
      { k: 'tyyppi', type: 'select', label: 'Kuvion tyyppi', def: 'email', opts: [
        ['email', 'Sähköpostiosoite'], ['url', 'URL-osoite'], ['ipv4', 'IPv4-osoite'], ['ipv6', 'IPv6-osoite'],
        ['puhelin', 'Suomalainen puhelinnumero'], ['hetu', 'Henkilötunnus (muoto)'], ['ytunnus', 'Y-tunnus'],
        ['postinumero', 'Suomalainen postinumero'], ['iban', 'IBAN-tilinumero'], ['paiva', 'Päivämäärä VVVV-KK-PP'],
        ['aika', 'Kellonaika HH:MM'], ['hex', 'HEX-väri'], ['salasana', 'Vahva salasana'], ['slug', 'URL-slug'],
        ['uuid', 'UUID'], ['luku', 'Desimaaliluku'], ['html', 'HTML-tagi'], ['kortti', 'Luottokorttinumero']] },
      { k: 'kiinnita', type: 'check', label: 'Kiinnitä alkuun ja loppuun (^ … $)', def: true },
      { k: 'testi', type: 'text', label: 'Testimerkkijono', def: 'matti.meikalainen@esimerkki.fi' }
    ],
    run: function (v, c) {
      var P = {
        email: ['[\\w.!#$%&\'*+/=?^`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+', 'Sähköpostiosoite'],
        url: ['https?://[\\w.-]+(?::\\d+)?(?:/[^\\s]*)?', 'HTTP- tai HTTPS-osoite'],
        ipv4: ['(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)', 'IPv4-osoite'],
        ipv6: ['(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}', 'Täysimittainen IPv6-osoite'],
        puhelin: ['(?:\\+358|0)\\s?(?:\\d\\s?){6,11}', 'Suomalainen puhelinnumero'],
        hetu: ['\\d{6}[-+ABCDEFYXWVU]\\d{3}[0-9A-FHJ-NPR-Y]', 'Henkilötunnuksen muoto (ei tarkistusmerkin laskentaa)'],
        ytunnus: ['\\d{7}-\\d', 'Y-tunnus'],
        postinumero: ['\\d{5}', 'Suomalainen postinumero'],
        iban: ['[A-Z]{2}\\d{2}(?:\\s?[A-Z0-9]{4}){2,7}[A-Z0-9]{1,4}', 'IBAN-tilinumero'],
        paiva: ['\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])', 'ISO-päivämäärä'],
        aika: ['(?:[01]\\d|2[0-3]):[0-5]\\d', 'Kellonaika 24 h'],
        hex: ['#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})', 'HEX-värikoodi'],
        salasana: ['(?=.*[a-zäöå])(?=.*[A-ZÄÖÅ])(?=.*\\d)(?=.*[^\\w\\s]).{12,}', 'Vähintään 12 merkkiä, iso ja pieni kirjain, numero ja erikoismerkki'],
        slug: ['[a-z0-9]+(?:-[a-z0-9]+)*', 'URL-ystävällinen slug'],
        uuid: ['[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}', 'UUID v1–v5'],
        luku: ['-?\\d+(?:[.,]\\d+)?', 'Kokonais- tai desimaaliluku'],
        html: ['<\\/?([a-zA-Z][\\w-]*)\\b[^>]*>', 'HTML-tagi'],
        kortti: ['(?:\\d{4}[ -]?){3}\\d{1,4}', 'Luottokorttinumeron muoto']
      };
      var p = P[v.tyyppi], body = v.kiinnita ? '^' + p[0] + '$' : p[0];
      var re = new RegExp(body), ok = v.testi ? re.test(v.testi) : null;
      return {
        rows: [
          { k: 'Kuvio', v: body, big: true },
          { k: 'JavaScript', v: '/' + body.replace(/\//g, '\\/') + '/' },
          { k: 'Kuvaus', v: p[1], copy: false },
          { k: 'Testitulos', v: ok === null ? 'ei testattu' : ok ? '✓ vastaa kuviota' : '✗ ei vastaa kuviota', copy: false }
        ],
        note: ok === false ? { text: 'Testimerkkijono ei vastaa kuviota.', kind: 'warn' } : null,
        out: body,
        foot: 'Säännölliset lausekkeet tarkistavat muodon, eivät todellisuutta. Esimerkiksi sähköpostin olemassaolo tai henkilötunnuksen tarkistusmerkki vaativat erillisen validoinnin.'
      };
    }
  });

  /* ---------- tunnisteet ---------- */
  R({
    id: 'jwt-dekooderi', cat: 'kehittaja', name: 'JWT-dekooderi', icon: 'i-key', kind: 'custom',
    desc: 'Pura JWT-tokenin otsake ja hyötykuorma sekä tarkista HMAC-allekirjoitus.',
    keys: ['jwt', 'token', 'bearer', 'auth'],
    render: function (root, c) {
      var ta = h('textarea.ctl', { rows: 4, spellcheck: 'false', placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…' });
      ta.value = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6Ik1hdHRpIE1laWvDpGzDpGluZW4iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3MTYyMzkwMjIsImV4cCI6MTkxNjIzOTAyMn0.8Qh0JcZ2vYqTZ5wXk1nYfP3rN6sL9tKbMxVwEgHtYsA';
      var secret = h('input.ctl.mono', { placeholder: 'HMAC-salaisuus (valinnainen)' });
      var out = h('div');
      function b64url(s) {
        s = s.replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        return decodeURIComponent(Array.prototype.map.call(atob(s), function (ch) {
          return '%' + ('00' + ch.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
      }
      function run() {
        MT.clear(out);
        var t = ta.value.trim().replace(/^Bearer\s+/i, '');
        if (!t) { out.appendChild(c.empty('Liitä JWT-token', 'Token koostuu kolmesta pisteellä erotetusta osasta.')); return; }
        var parts = t.split('.');
        if (parts.length !== 3) { out.appendChild(c.note('Token ei ole muodossa header.payload.signature (osia: ' + parts.length + ')', 'err')); return; }
        var head, body;
        try { head = JSON.parse(b64url(parts[0])); body = JSON.parse(b64url(parts[1])); }
        catch (e) { out.appendChild(c.note('Dekoodaus epäonnistui: ' + e.message, 'err')); return; }
        out.appendChild(c.panel('OTSAKE', 'i-code', h('pre.ed-out', { text: JSON.stringify(head, null, 2), style: { padding: '11px' } })));
        out.appendChild(h('div', { style: { marginTop: '11px' } }, c.panel('HYÖTYKUORMA', 'i-code',
          h('pre.ed-out', { text: JSON.stringify(body, null, 2), style: { padding: '11px' } }))));
        var rows = [];
        var CL = { iss: 'Myöntäjä', sub: 'Kohde', aud: 'Yleisö', jti: 'Token-tunniste', scope: 'Oikeudet', role: 'Rooli', name: 'Nimi', email: 'Sähköposti' };
        Object.keys(CL).forEach(function (k) { if (body[k] !== undefined) rows.push({ k: CL[k] + ' (' + k + ')', v: String(body[k]) }); });
        [['iat', 'Myönnetty'], ['exp', 'Vanhenee'], ['nbf', 'Voimassa alkaen']].forEach(function (p) {
          if (body[p[0]]) {
            var d = new Date(body[p[0]] * 1000);
            rows.push({ k: p[1] + ' (' + p[0] + ')', v: d.toLocaleString('fi-FI') + '  ·  ' + MT.timeAgo(d.getTime()) });
          }
        });
        if (body.exp) {
          var exp = body.exp * 1000 < Date.now();
          rows.push({ k: 'Voimassaolo', v: exp ? '✗ vanhentunut' : '✓ voimassa', copy: false });
        }
        if (rows.length) out.appendChild(h('div', { style: { marginTop: '11px' } }, c.panel('VAATEET', 'i-info', c.resList(rows))));
        var sigBox = h('div', { style: { marginTop: '11px' } });
        out.appendChild(sigBox);
        var alg = (head.alg || '').toUpperCase();
        if (!secret.value) {
          sigBox.appendChild(c.note('Allekirjoitusta ei ole tarkistettu. Syötä HMAC-salaisuus tarkistaaksesi HS256/HS384/HS512-tokenin. Dekoodaus ei koskaan todista tokenin aitoutta.', 'warn'));
          return;
        }
        if (alg.indexOf('HS') !== 0) { sigBox.appendChild(c.note('Algoritmi ' + alg + ' vaatii julkisen avaimen — vain HMAC (HS256/384/512) voidaan tarkistaa tällä työkalulla.', 'warn')); return; }
        var map = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' };
        HASH.hmac(map[alg], secret.value, parts[0] + '.' + parts[1]).then(function (sig) {
          var b64 = btoa(String.fromCharCode.apply(null, sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
          MT.clear(sigBox);
          sigBox.appendChild(b64 === parts[2]
            ? c.note('<b>Allekirjoitus on kelvollinen.</b> Token on allekirjoitettu tällä salaisuudella.', 'ok')
            : c.note('<b>Allekirjoitus ei täsmää.</b> Token on väärennetty tai salaisuus on väärä.', 'err'));
        }).catch(function (e) { MT.clear(sigBox); sigBox.appendChild(c.note(e.message, 'err')); });
      }
      [ta, secret].forEach(function (x) { x.addEventListener('input', MT.debounce(run, 250)); });
      root.appendChild(c.panel('TOKEN', 'i-key', h('div.panel-body', null, [ta,
        h('div.field', { style: { marginTop: '11px' } }, [h('label', { text: 'HMAC-salaisuus (vain HS-algoritmit)' }), secret])])));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, out));
      run();
    }
  });

  R({
    id: 'uuid-generaattori', cat: 'kehittaja', name: 'UUID-generaattori', icon: 'i-hash',
    desc: 'Luo satunnaisia UUID v4 -tunnisteita kryptografisella satunnaisuudella.',
    keys: ['uuid', 'guid', 'tunniste', 'id'],
    fields: [
      { k: 'kpl', type: 'num', label: 'Määrä', def: '5' },
      { k: 'muoto', type: 'select', label: 'Muoto', def: 'normaali', opts: [['normaali', 'Vakio (viivoilla)'], ['ei-viivoja', 'Ilman viivoja'], ['isot', 'ISOT KIRJAIMET'], ['aaltosulut', 'Aaltosulkeissa {…}']] }
    ],
    action: 'Luo tunnisteet', live: false,
    run: function (v) {
      var n = Math.max(1, Math.min(1000, Math.round(v.kpl) || 1)), list = [];
      for (var i = 0; i < n; i++) {
        var u = crypto.randomUUID ? crypto.randomUUID() : uuidFallback();
        if (v.muoto === 'ei-viivoja') u = u.replace(/-/g, '');
        else if (v.muoto === 'isot') u = u.toUpperCase();
        else if (v.muoto === 'aaltosulut') u = '{' + u + '}';
        list.push(u);
      }
      return {
        out: list.join('\n'),
        rows: list.slice(0, 50).map(function (u, i) { return { k: 'UUID ' + (i + 1), v: u }; }),
        foot: 'UUID v4 sisältää 122 bittiä satunnaisuutta. Törmäyksen todennäköisyys on käytännössä olematon.'
      };
    }
  });
  function uuidFallback() {
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var s = HASH.hex(b);
    return s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20);
  }

  R({
    id: 'ulid-generaattori', cat: 'kehittaja', name: 'ULID-generaattori', icon: 'i-hash',
    desc: 'Aikajärjestyksessä lajiteltavia ULID-tunnisteita (26 merkkiä, Crockford Base32).',
    keys: ['ulid', 'tunniste', 'id', 'aikaleima'],
    fields: [{ k: 'kpl', type: 'num', label: 'Määrä', def: '5' }],
    action: 'Luo tunnisteet', live: false,
    run: function (v) {
      var A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ', n = Math.max(1, Math.min(1000, Math.round(v.kpl) || 1)), list = [];
      for (var i = 0; i < n; i++) {
        var t = Date.now(), ts = '';
        for (var j = 9; j >= 0; j--) { ts = A[t % 32] + ts; t = Math.floor(t / 32); }
        var r = crypto.getRandomValues(new Uint8Array(16)), rnd = '';
        for (j = 0; j < 16; j++) rnd += A[r[j] % 32];
        list.push(ts + rnd);
      }
      return {
        out: list.join('\n'),
        rows: list.slice(0, 50).map(function (u, i) { return { k: 'ULID ' + (i + 1), v: u }; }),
        foot: 'ULID koostuu 48-bittisestä aikaleimasta ja 80 bitistä satunnaisuutta. Tunnisteet lajittuvat luontijärjestykseen myös merkkijonona.'
      };
    }
  });

  /* ---------- koodaukset ---------- */
  function b64encode(s) {
    return btoa(String.fromCharCode.apply(null, new TextEncoder().encode(s)));
  }
  function b64decode(s) {
    s = s.trim().replace(/\s/g, '');
    if (/[-_]/.test(s)) s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(arr);
  }
  R({
    id: 'base64-enkoodaus', cat: 'kehittaja', name: 'Base64-koodaus', icon: 'i-code', kind: 'io',
    desc: 'Koodaa teksti Base64-muotoon (myös URL-turvallinen variantti).',
    keys: ['base64', 'koodaus', 'encode', 'btoa'],
    io: {
      inLabel: 'TEKSTI', outLabel: 'BASE64', lang: 'none', sample: 'Hei maailma! Ääkköset toimivat: ÄÖÅ',
      opts: [{ k: 'url', type: 'check', label: 'URL-turvallinen (-_ ja ilman täytettä)', def: false },
        { k: 'rivit', type: 'check', label: 'Katkaise 76 merkin riveiksi (MIME)', def: false }],
      run: function (t, o) {
        var s = b64encode(t);
        if (o.url) s = s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        if (o.rivit) s = s.replace(/(.{76})/g, '$1\n');
        return { out: s, status: 'KOODATTU', kind: 'ok', meta: [['KASVU', '+' + Math.round((s.length / Math.max(1, new Blob([t]).size) - 1) * 100) + ' %']] };
      }
    }
  });
  R({
    id: 'base64-dekoodaus', cat: 'kehittaja', name: 'Base64-purku', icon: 'i-code', kind: 'io',
    desc: 'Pura Base64-koodattu teksti takaisin luettavaksi.',
    keys: ['base64', 'purku', 'decode', 'atob'],
    io: {
      inLabel: 'BASE64', outLabel: 'TEKSTI', lang: 'none', sample: 'SGVpIG1hYWlsbWEhIMOEw5bDhQ==',
      run: function (t) {
        var s = b64decode(t);
        var json = null;
        try { json = JSON.stringify(JSON.parse(s), null, 2); } catch (e) {}
        return { out: json || s, lang: json ? 'json' : 'none', status: json ? 'PURETTU (JSON TUNNISTETTU)' : 'PURETTU', kind: 'ok' };
      }
    }
  });
  R({
    id: 'url-enkoodaus', cat: 'kehittaja', name: 'URL-koodaus', icon: 'i-link', kind: 'io',
    desc: 'Koodaa merkkijono URL-turvalliseen muotoon (prosenttikoodaus).',
    keys: ['url', 'koodaus', 'encode', 'prosentti', 'uri'],
    io: {
      inLabel: 'TEKSTI', outLabel: 'KOODATTU', lang: 'none', sample: 'haku?nimi=Matti Meikäläinen&kaupunki=Jyväskylä',
      opts: [{ k: 'komp', type: 'check', label: 'Koodaa myös & = ? / (encodeURIComponent)', def: true }],
      run: function (t, o) { return { out: o.komp ? encodeURIComponent(t) : encodeURI(t), status: 'KOODATTU', kind: 'ok' }; }
    }
  });
  R({
    id: 'url-dekoodaus', cat: 'kehittaja', name: 'URL-purku', icon: 'i-link', kind: 'io',
    desc: 'Pura prosenttikoodattu URL-merkkijono.',
    keys: ['url', 'purku', 'decode', 'uri'],
    io: {
      inLabel: 'KOODATTU', outLabel: 'TEKSTI', lang: 'none', sample: 'haku%3Fnimi%3DMatti%20Meik%C3%A4l%C3%A4inen',
      opts: [{ k: 'plus', type: 'check', label: 'Tulkitse + välilyöntinä', def: false }],
      run: function (t, o) {
        var s = o.plus ? t.replace(/\+/g, ' ') : t;
        try { return { out: decodeURIComponent(s), status: 'PURETTU', kind: 'ok' }; }
        catch (e) { throw new Error('Virheellinen prosenttikoodaus'); }
      }
    }
  });
  var ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  R({
    id: 'html-entiteetit', cat: 'kehittaja', name: 'HTML-entiteetit', icon: 'i-code', kind: 'io',
    desc: 'Muunna erikoismerkit HTML-entiteeteiksi turvallista tulostusta varten.',
    keys: ['html', 'entiteetti', 'escape', 'merkit'],
    io: {
      inLabel: 'TEKSTI', outLabel: 'ENTITEETIT', lang: 'none', sample: '<script>alert("XSS & co");</script>',
      opts: [{ k: 'kaikki', type: 'check', label: 'Koodaa kaikki ei-ASCII-merkit', def: false }],
      run: function (t, o) {
        var s = t.replace(/[&<>"']/g, function (c) { return ENT[c]; });
        if (o.kaikki) s = s.replace(/[^\x20-\x7E]/g, function (c) { return '&#' + c.codePointAt(0) + ';'; });
        return { out: s, status: 'KOODATTU', kind: 'ok' };
      }
    }
  });
  R({
    id: 'html-entiteetit-purku', cat: 'kehittaja', name: 'HTML-entiteettien purku', icon: 'i-code', kind: 'io',
    desc: 'Pura HTML-entiteetit takaisin normaaleiksi merkeiksi.',
    keys: ['html', 'entiteetti', 'unescape', 'purku'],
    io: {
      inLabel: 'ENTITEETIT', outLabel: 'TEKSTI', lang: 'none', sample: '&lt;p&gt;Hei &amp; tervetuloa&lt;/p&gt; &#196;&#214;&#197;',
      run: function (t) {
        var d = document.createElement('textarea');
        d.innerHTML = t;
        return { out: d.value, status: 'PURETTU', kind: 'ok' };
      }
    }
  });
  R({
    id: 'escape-merkkijono', cat: 'kehittaja', name: 'Merkkijonon escape', icon: 'i-code', kind: 'io',
    desc: 'Lisää tai poista kenoviivat JSON-, JavaScript-, SQL- tai regex-merkkijonosta.',
    keys: ['escape', 'unescape', 'kenoviiva', 'merkkijono', 'lainaus'],
    io: {
      inLabel: 'SYÖTE', outLabel: 'TULOS', lang: 'none', sample: 'Rivi 1\nRivi "kaksi"\tsarkaimella \\ kenoviivalla',
      opts: [{ k: 'tyyli', type: 'select', label: 'Tyyli', def: 'json', opts: [['json', 'JSON / JavaScript'], ['sql', 'SQL (heittomerkki)'], ['regex', 'Regex-erikoismerkit'], ['csv', 'CSV-kenttä']] },
        { k: 'suunta', type: 'select', label: 'Toiminto', def: 'esc', opts: [['esc', 'Lisää escapet'], ['unesc', 'Poista escapet']] }],
      run: function (t, o) {
        var out;
        if (o.suunta === 'esc') {
          if (o.tyyli === 'json') out = JSON.stringify(t).slice(1, -1);
          else if (o.tyyli === 'sql') out = "'" + t.replace(/'/g, "''") + "'";
          else if (o.tyyli === 'regex') out = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          else out = '"' + t.replace(/"/g, '""') + '"';
        } else {
          if (o.tyyli === 'json') out = JSON.parse('"' + t.replace(/^"|"$/g, '').replace(/\n/g, '\\n') + '"');
          else if (o.tyyli === 'sql') out = t.replace(/^'|'$/g, '').replace(/''/g, "'");
          else if (o.tyyli === 'regex') out = t.replace(/\\([.*+?^${}()|[\]\\])/g, '$1');
          else out = t.replace(/^"|"$/g, '').replace(/""/g, '"');
        }
        return { out: out, status: 'VALMIS', kind: 'ok' };
      }
    }
  });

  /* ---------- aika ---------- */
  R({
    id: 'unix-aika', cat: 'kehittaja', name: 'Unix-aikaleima', icon: 'i-clock', kind: 'custom',
    desc: 'Muunna Unix-aikaleima ja päivämäärä keskenään. Näyttää myös nykyhetken.',
    keys: ['unix', 'aikaleima', 'timestamp', 'epoch', 'aika'],
    render: function (root, c) {
      var live = h('div.mono', { style: { fontSize: '30px', textAlign: 'center', padding: '16px' } });
      var tsIn = h('input.ctl.mono', { value: String(Math.floor(Date.now() / 1000)) });
      var dtIn = h('input.ctl', { type: 'datetime-local', value: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) });
      var out = h('div');
      function fromTs() {
        var n = parseFloat(tsIn.value);
        if (!isFinite(n)) return show(null);
        if (n > 1e14) n = n / 1e6; else if (n > 1e11) n = n / 1000;
        show(new Date(n * 1000));
      }
      function fromDt() { if (dtIn.value) { var d = new Date(dtIn.value); tsIn.value = Math.floor(d.getTime() / 1000); show(d); } }
      function show(d) {
        MT.clear(out);
        if (!d || isNaN(d)) { out.appendChild(c.empty('Virheellinen aikaleima', 'Syötä sekunteja, millisekunteja tai mikrosekunteja.')); return; }
        out.appendChild(c.panel('MUUNNOS', 'i-clock', c.resList([
          { k: 'Paikallinen aika', v: d.toLocaleString('fi-FI', { dateStyle: 'full', timeStyle: 'medium' }), big: true },
          { k: 'ISO 8601 (UTC)', v: d.toISOString() },
          { k: 'UTC', v: d.toUTCString() },
          { k: 'Unix (sekunnit)', v: String(Math.floor(d.getTime() / 1000)) },
          { k: 'Unix (millisekunnit)', v: String(d.getTime()) },
          { k: 'Viikonpäivä', v: d.toLocaleDateString('fi-FI', { weekday: 'long' }) },
          { k: 'Viikko', v: MT.isoWeek(d) },
          { k: 'Suhteellinen', v: MT.timeAgo(d.getTime()) },
          { k: 'Aikavyöhyke', v: Intl.DateTimeFormat().resolvedOptions().timeZone + ' (UTC' + (d.getTimezoneOffset() > 0 ? '−' : '+') + MT.pad(Math.abs(d.getTimezoneOffset() / 60)) + ':' + MT.pad(Math.abs(d.getTimezoneOffset() % 60)) + ')' }
        ])));
      }
      tsIn.addEventListener('input', fromTs);
      dtIn.addEventListener('input', fromDt);
      c.timer(function () { live.textContent = Math.floor(Date.now() / 1000); }, 1000);
      live.textContent = Math.floor(Date.now() / 1000);

      root.appendChild(c.panel('NYKYHETKI', 'i-clock', h('div', null, [live,
        h('div.panel-foot', null, [
          c.btn('Kopioi sekunnit', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(Math.floor(Date.now() / 1000)); } }),
          c.btn('Kopioi millisekunnit', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(Date.now()); } }),
          c.btn('Kopioi ISO', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(new Date().toISOString()); } }),
          h('span.grow'),
          c.btn('Käytä nykyhetkeä', { cls: 'btn-sm btn-pri', icon: 'i-refresh', on: function () { tsIn.value = Math.floor(Date.now() / 1000); fromTs(); } })
        ])])));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('MUUNNA', 'i-refresh', h('div.panel-body', null,
        h('div.fields', null, [
          h('div.field', null, [h('label', { text: 'Unix-aikaleima' }), tsIn]),
          h('div.field', null, [h('label', { text: 'Päivämäärä ja kello' }), dtIn])
        ])))));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, out));
      fromTs();
    }
  });

  R({
    id: 'iso-aika', cat: 'kehittaja', name: 'ISO-päivämäärämuunnin', icon: 'i-clock', kind: 'io',
    desc: 'Muunna päivämäärälista ISO 8601 -muotoon ja muihin esitystapoihin.',
    keys: ['iso', 'päivämäärä', '8601', 'muunna', 'aika'],
    io: {
      inLabel: 'PÄIVÄMÄÄRÄT (YKSI RIVILLÄ)', outLabel: 'TULOS', lang: 'none',
      sample: '2026-09-22T10:30:00Z\n22.9.2026\n1758537000\nSep 22 2026 12:00',
      opts: [{ k: 'muoto', type: 'select', label: 'Kohdemuoto', def: 'iso', opts: [['iso', 'ISO 8601 (UTC)'], ['fi', 'Suomalainen pp.kk.vvvv'], ['unix', 'Unix-sekunnit'], ['rfc', 'RFC 2822'], ['sql', 'SQL DATETIME'], ['kaikki', 'Kaikki muodot']] }],
      run: function (t, o) {
        var out = t.split('\n').map(function (l) {
          var s = l.trim(); if (!s) return '';
          var d;
          if (/^\d{9,14}$/.test(s)) d = new Date(s.length > 11 ? +s : +s * 1000);
          else if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(s)) {
            var p = s.split(/[.\s:]/);
            d = new Date(+p[2], +p[1] - 1, +p[0], +(p[3] || 0), +(p[4] || 0), +(p[5] || 0));
          } else d = new Date(s);
          if (isNaN(d)) return s + '  ⟶ tunnistamaton päivämäärä';
          if (o.muoto === 'iso') return d.toISOString();
          if (o.muoto === 'fi') return d.toLocaleString('fi-FI');
          if (o.muoto === 'unix') return String(Math.floor(d.getTime() / 1000));
          if (o.muoto === 'rfc') return d.toUTCString();
          if (o.muoto === 'sql') return d.toISOString().slice(0, 19).replace('T', ' ');
          return s + '\n  ISO:  ' + d.toISOString() + '\n  FI:   ' + d.toLocaleString('fi-FI') + '\n  Unix: ' + Math.floor(d.getTime() / 1000) + '\n  SQL:  ' + d.toISOString().slice(0, 19).replace('T', ' ') + '\n';
        }).join('\n');
        return { out: out, status: 'MUUNNETTU', kind: 'ok' };
      }
    }
  });

  /* ---------- tiivisteet ---------- */
  R({
    id: 'hash-generaattori', cat: 'kehittaja', name: 'Tiivistegeneraattori', icon: 'i-hash', kind: 'io',
    desc: 'Laske MD5-, SHA-1-, SHA-256-, SHA-384- ja SHA-512-tiivisteet sekä CRC32.',
    keys: ['hash', 'tiiviste', 'sha', 'md5', 'checksum', 'crc'],
    io: {
      inLabel: 'SYÖTE', outLabel: 'TIIVISTEET', lang: 'none', sample: 'MettisTool',
      opts: [{ k: 'muoto', type: 'select', label: 'Tuloste', def: 'hex', opts: [['hex', 'Heksadesimaali'], ['b64', 'Base64'], ['hexup', 'HEKSA ISOLLA']] }],
      run: function (t, o) {
        var algs = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
        return Promise.all(algs.map(function (a) { return HASH.digest(a, t); })).then(function (res) {
          var lines = res.map(function (b, i) {
            var s = o.muoto === 'b64' ? HASH.b64(b) : o.muoto === 'hexup' ? HASH.hex(b).toUpperCase() : HASH.hex(b);
            return algs[i].padEnd(9) + ' ' + s;
          });
          lines.push('CRC32'.padEnd(9) + ' ' + HASH.crc32(t).toString(16).padStart(8, '0'));
          return { out: lines.join('\n\n'), status: 'LASKETTU', kind: 'ok', meta: [['TAVUT', MT.num(new Blob([t]).size)]] };
        });
      },
      foot: function (c) { return c.note('MD5 ja SHA-1 eivät ole enää turvallisia allekirjoituksiin tai salasanoihin — käytä niitä vain eheystarkistuksiin. Salasanojen tallentamiseen kuuluu käyttää hidasta funktiota kuten bcrypt tai Argon2.', 'warn'); }
    }
  });

  /* ---------- muut ---------- */
  var LOREM = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ' +
    'enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit ' +
    'voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt ' +
    'mollit anim id est laborum').split(' ');
  var LOREM_FI = ('kissa istui aidalla ja katseli auringonlaskua kun tuuli kävi metsässä hiljaa puiden latvat huojuivat rauhallisesti ' +
    'järven pinta välkkyi kultaisena ilta oli lämmin ja pitkä kesä jatkui vielä viikkoja saaren rannalla veneet keinuivat laiturissa ' +
    'lapset juoksivat hiekalla naurua kuului kauas mökin savupiipusta nousi ohut savu taivaalle tähdet syttyivät yksi kerrallaan').split(' ');
  R({
    id: 'lorem-ipsum', cat: 'kehittaja', name: 'Lorem ipsum', icon: 'i-text',
    desc: 'Luo täytetekstiä latinaksi tai suomeksi kappaleina, lauseina tai sanoina.',
    keys: ['lorem', 'ipsum', 'täyteteksti', 'placeholder', 'mock'],
    fields: [
      { k: 'kpl', type: 'num', label: 'Määrä', def: '3' },
      { k: 'yks', type: 'select', label: 'Yksikkö', def: 'kappale', opts: [['kappale', 'kappaletta'], ['lause', 'lausetta'], ['sana', 'sanaa']] },
      { k: 'kieli', type: 'select', label: 'Kieli', def: 'lat', opts: [['lat', 'Latina (lorem ipsum)'], ['fi', 'Suomi']] },
      { k: 'alku', type: 'check', label: 'Aloita "Lorem ipsum dolor sit amet"', def: true },
      { k: 'html', type: 'check', label: 'Ympäröi <p>-tageilla', def: false }
    ],
    run: function (v) {
      var W = v.kieli === 'fi' ? LOREM_FI : LOREM;
      var n = Math.max(1, Math.min(500, Math.round(v.kpl) || 1));
      function sentence() {
        var len = MT.rint(7, 18), s = [];
        for (var i = 0; i < len; i++) s.push(MT.pick(W));
        var t = s.join(' ');
        return t[0].toUpperCase() + t.slice(1) + MT.pick(['.', '.', '.', '.', '!', '?']);
      }
      function para() {
        var c2 = MT.rint(3, 6), s = [];
        for (var i = 0; i < c2; i++) s.push(sentence());
        return s.join(' ');
      }
      var out;
      if (v.yks === 'sana') {
        var w = [];
        for (var i = 0; i < n; i++) w.push(MT.pick(W));
        out = w.join(' ');
      } else if (v.yks === 'lause') {
        var ss = [];
        for (i = 0; i < n; i++) ss.push(sentence());
        out = ss.join(' ');
      } else {
        var ps = [];
        for (i = 0; i < n; i++) ps.push(para());
        out = ps.join('\n\n');
      }
      if (v.alku && v.kieli === 'lat') out = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ' + out;
      if (v.html) out = out.split('\n\n').map(function (p) { return '<p>' + p + '</p>'; }).join('\n');
      return {
        out: out,
        html: h('div.panel', null, [h('div.panel-head', null, [c2i('i-text'), h('span.lbl', { text: 'TEKSTI' }), h('span.grow'),
          h('span.lbl', { text: out.split(/\s+/).length + ' SANAA · ' + out.length + ' MERKKIÄ' })]),
          h('div', { style: { padding: '12px', whiteSpace: 'pre-wrap', lineHeight: '1.6', maxHeight: '420px', overflow: 'auto' }, text: out })])
      };
    }
  });
  function c2i(n) { return MT.icon(n); }

  /* ---------- cron ---------- */
  var CRON_PRESET = [
    ['* * * * *', 'Joka minuutti'], ['*/5 * * * *', 'Viiden minuutin välein'], ['0 * * * *', 'Joka tunti tasalta'],
    ['0 */6 * * *', 'Kuuden tunnin välein'], ['0 3 * * *', 'Joka yö klo 03:00'], ['0 9 * * 1-5', 'Arkisin klo 09:00'],
    ['0 0 * * 0', 'Joka sunnuntai keskiyöllä'], ['0 0 1 * *', 'Kuukauden 1. päivä'], ['0 0 1 1 *', 'Vuoden ensimmäinen päivä']
  ];
  function cronParse(expr) {
    var p = expr.trim().split(/\s+/);
    if (p.length !== 5) throw new Error('Cron-lausekkeessa on oltava 5 kenttää (minuutti tunti päivä kuukausi viikonpäivä), löytyi ' + p.length);
    var lim = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
    return p.map(function (f, i) {
      var set = [];
      f.split(',').forEach(function (part) {
        var step = 1, range = part;
        var sm = /^(.+)\/(\d+)$/.exec(part);
        if (sm) { range = sm[1]; step = +sm[2]; }
        var lo = lim[i][0], hi = lim[i][1];
        if (range !== '*') {
          var rm = /^(\d+)(?:-(\d+))?$/.exec(range);
          if (!rm) throw new Error('Virheellinen kenttä: ' + part);
          lo = +rm[1]; hi = rm[2] === undefined ? (sm ? lim[i][1] : lo) : +rm[2];
        }
        if (lo < lim[i][0] || hi > lim[i][1] || lo > hi) throw new Error('Arvo ' + part + ' on sallitun välin ' + lim[i][0] + '–' + lim[i][1] + ' ulkopuolella');
        for (var v = lo; v <= hi; v += step) set.push(v);
      });
      return set.filter(function (v, idx, a) { return a.indexOf(v) === idx; }).sort(function (a, b) { return a - b; });
    });
  }
  var KK = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu', 'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu'];
  var VP = ['sunnuntai', 'maanantai', 'tiistai', 'keskiviikko', 'torstai', 'perjantai', 'lauantai'];
  function cronExplain(sets, expr) {
    var p = expr.trim().split(/\s+/);
    function listStr(a, names) {
      if (a.length > 6 && !names) return a.length + ' eri arvoa';
      return a.map(function (v) { return names ? names[v] : v; }).join(', ');
    }
    var s = [];
    s.push(p[0] === '*' ? 'joka minuutti' : 'minuutteina ' + listStr(sets[0]));
    s.push(p[1] === '*' ? 'jokaisena tuntina' : 'tunteina ' + listStr(sets[1]));
    if (p[2] !== '*') s.push('kuukauden päivinä ' + listStr(sets[2]));
    if (p[3] !== '*') s.push('kuukausina ' + listStr(sets[3], KK));
    if (p[4] !== '*') s.push('viikonpäivinä ' + listStr(sets[4], VP));
    return 'Suoritetaan ' + s.join(', ') + '.';
  }
  function cronNext(sets, n, from) {
    var out = [], d = new Date(from || Date.now());
    d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + 1);
    for (var guard = 0; guard < 500000 && out.length < n; guard++) {
      if (sets[1].indexOf(d.getHours()) < 0) { d.setHours(d.getHours() + 1, sets[0][0], 0, 0); continue; }
      if (sets[0].indexOf(d.getMinutes()) < 0) { d.setMinutes(d.getMinutes() + 1); continue; }
      if (sets[3].indexOf(d.getMonth() + 1) < 0 || sets[2].indexOf(d.getDate()) < 0 || sets[4].indexOf(d.getDay()) < 0) {
        d.setDate(d.getDate() + 1); d.setHours(sets[1][0], sets[0][0], 0, 0); continue;
      }
      out.push(new Date(d));
      d.setMinutes(d.getMinutes() + 1);
    }
    return out;
  }
  R({
    id: 'cron-generaattori', cat: 'kehittaja', name: 'Cron-generaattori', icon: 'i-clock',
    desc: 'Rakenna cron-lauseke valmiista osista ja näe seuraavat ajoajat.',
    keys: ['cron', 'ajastus', 'crontab', 'aikataulu'],
    fields: [
      { k: 'min', type: 'text', label: 'Minuutti (0–59)', def: '0', mono: true },
      { k: 'tunti', type: 'text', label: 'Tunti (0–23)', def: '3', mono: true },
      { k: 'pva', type: 'text', label: 'Päivä (1–31)', def: '*', mono: true },
      { k: 'kk', type: 'text', label: 'Kuukausi (1–12)', def: '*', mono: true },
      { k: 'vp', type: 'text', label: 'Viikonpäivä (0–6, 0=su)', def: '*', mono: true }
    ],
    extra: function (c) {
      return h('div', { style: { marginTop: '11px' } }, [
        h('div.lbl', { text: 'VALMIIT POHJAT', style: { marginBottom: '7px' } }),
        h('div.btn-row', null, CRON_PRESET.map(function (p) {
          return c.btn(p[1], { cls: 'btn-sm', title: p[0], on: function (e) {
            var box = e.target.closest('.tool-body'), f = p[0].split(' ');
            ['min', 'tunti', 'pva', 'kk', 'vp'].forEach(function (k, i) {
              var el = box.querySelector('[data-k="' + k + '"]');
              if (el) el.value = f[i];
            });
            box._run();
          } });
        }))
      ]);
    },
    run: function (v) {
      var expr = [v.min || '*', v.tunti || '*', v.pva || '*', v.kk || '*', v.vp || '*'].join(' ');
      var sets = cronParse(expr);
      var next = cronNext(sets, 8);
      return {
        rows: [
          { k: 'Cron-lauseke', v: expr, big: true },
          { k: 'Selitys', v: cronExplain(sets, expr), copy: false },
          { k: 'Ajokertoja / vrk', v: (sets[0].length * sets[1].length) + ' (jos päivä osuu)' }
        ],
        out: expr,
        table: { head: ['#', 'Seuraava ajo', 'Kuluu'], rows: next.map(function (d, i) { return [i + 1, d.toLocaleString('fi-FI'), MT.timeAgo(d.getTime()).replace(' sitten', '')]; }), text: [0] }
      };
    }
  });
  R({
    id: 'cron-selittaja', cat: 'kehittaja', name: 'Cron-selittäjä', icon: 'i-info', kind: 'io',
    desc: 'Selitä olemassa oleva cron-lauseke suomeksi ja näytä seuraavat ajoajat.',
    keys: ['cron', 'selitä', 'crontab', 'ajastus'],
    io: {
      inLabel: 'CRON-LAUSEKKEET', outLabel: 'SELITYS', lang: 'none',
      sample: '*/15 * * * *\n0 9 * * 1-5\n0 0 1 */3 *\n30 4 1,15 * *',
      run: function (t) {
        var out = t.split('\n').map(function (l) {
          var e = l.trim();
          if (!e) return '';
          if (e[0] === '#') return e;
          try {
            var sets = cronParse(e), next = cronNext(sets, 3);
            return e + '\n  ' + cronExplain(sets, e) + '\n  Seuraavat ajot:\n' +
              next.map(function (d) { return '    · ' + d.toLocaleString('fi-FI'); }).join('\n') + '\n';
          } catch (err) { return e + '\n  ⟶ virhe: ' + err.message + '\n'; }
        }).join('\n');
        return { out: out, status: 'SELITETTY', kind: 'ok' };
      }
    }
  });

  /* ---------- query string & tyypit ---------- */
  R({
    id: 'querystring-muunnin', cat: 'kehittaja', name: 'Query string ↔ JSON', icon: 'i-link', kind: 'io',
    desc: 'Muunna URL-parametrit JSON-objektiksi ja takaisin.',
    keys: ['query', 'parametrit', 'url', 'json'],
    io: {
      inLabel: 'SYÖTE', outLabel: 'TULOS', lang: 'json',
      sample: 'https://esimerkki.fi/haku?q=kahvi&sivu=2&lajittelu=hinta&suodata=uusi&suodata=tarjous',
      opts: [{ k: 'dir', type: 'select', label: 'Suunta', def: 'q2j', opts: [['q2j', 'Query → JSON'], ['j2q', 'JSON → Query']] }],
      run: function (t, o) {
        if (o.dir === 'q2j') {
          var qs = t.trim(), i = qs.indexOf('?');
          if (i >= 0) qs = qs.slice(i + 1);
          var sp = new URLSearchParams(qs), obj = {};
          sp.forEach(function (v, k) {
            if (k in obj) { if (!Array.isArray(obj[k])) obj[k] = [obj[k]]; obj[k].push(v); }
            else obj[k] = v;
          });
          return { out: JSON.stringify(obj, null, 2), status: 'MUUNNETTU', kind: 'ok', lang: 'json', meta: [['PARAMETRIT', Object.keys(obj).length]] };
        }
        var j = JSON.parse(t), p = new URLSearchParams();
        Object.keys(j).forEach(function (k) {
          if (Array.isArray(j[k])) j[k].forEach(function (x) { p.append(k, x); });
          else p.append(k, j[k] === null ? '' : j[k]);
        });
        return { out: p.toString(), status: 'MUUNNETTU', kind: 'ok', lang: 'none' };
      }
    }
  });

  R({
    id: 'json-typescript', cat: 'kehittaja', name: 'JSON → TypeScript', icon: 'i-code', kind: 'io',
    desc: 'Päättele TypeScript-rajapinnat JSON-esimerkistä.',
    keys: ['typescript', 'types', 'interface', 'json', 'tyypit'],
    io: {
      inLabel: 'JSON', outLabel: 'TYPESCRIPT', lang: 'code', ext: '.ts', sample: SAMPLE_JSON,
      opts: [{ k: 'nimi', type: 'text', label: 'Juurirajapinnan nimi', def: 'Root' },
        { k: 'tyyli', type: 'select', label: 'Tyyli', def: 'interface', opts: [['interface', 'interface'], ['type', 'type']] }],
      run: function (t, o) {
        var obj = parseJSON(t), out = [], seen = {};
        function name(k) { return k.replace(/[^\w]/g, ' ').replace(/(?:^|\s)(\w)/g, function (m, c) { return c.toUpperCase(); }).replace(/\s/g, ''); }
        function typeOf(v, key) {
          if (v === null) return 'null';
          if (Array.isArray(v)) {
            if (!v.length) return 'unknown[]';
            var ts = v.map(function (x) { return typeOf(x, key); });
            var uniq = ts.filter(function (x, i) { return ts.indexOf(x) === i; });
            return (uniq.length === 1 ? uniq[0] : '(' + uniq.join(' | ') + ')') + '[]';
          }
          if (typeof v === 'object') return build(name(key || 'Nested'), v);
          return typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string';
        }
        function build(n, obj2) {
          var base = n, i = 2;
          while (seen[n]) { n = base + i++; }
          seen[n] = true;
          var body = Object.keys(obj2).map(function (k) {
            var key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
            var ty = typeOf(obj2[k], k);
            return '  ' + key + (obj2[k] === null ? '?' : '') + ': ' + ty + ';';
          }).join('\n');
          out.push(o.tyyli === 'type' ? 'type ' + n + ' = {\n' + body + '\n};' : 'export interface ' + n + ' {\n' + body + '\n}');
          return n;
        }
        var rootName = name(o.nimi || 'Root');
        if (Array.isArray(obj)) {
          var inner = obj.length && typeof obj[0] === 'object' && obj[0] ? build(rootName + 'Item', obj[0]) : typeOf(obj[0]);
          out.push('export type ' + rootName + ' = ' + inner + '[];');
        } else if (obj && typeof obj === 'object') build(rootName, obj);
        else out.push('export type ' + rootName + ' = ' + typeOf(obj) + ';');
        return { out: out.reverse().join('\n\n') + '\n', status: 'TYYPIT LUOTU', kind: 'ok', lang: 'code', meta: [['RAJAPINNAT', out.length]] };
      }
    }
  });

  R({
    id: 'json-polku', cat: 'kehittaja', name: 'JSON-polkuhaku', icon: 'i-search', kind: 'io',
    desc: 'Poimi arvoja JSON-rakenteesta pistepolulla, esim. tekija.nimi tai moduulit[0].',
    keys: ['json', 'polku', 'path', 'poimi', 'query'],
    io: {
      inLabel: 'JSON', outLabel: 'TULOS', lang: 'json', sample: SAMPLE_JSON,
      opts: [{ k: 'polku', type: 'text', label: 'Polku', def: 'tekija.nimi', mono: true, hint: 'Esim. lista[2].nimi tai * kaikille avaimille' }],
      run: function (t, o) {
        var obj = parseJSON(t);
        var path = (o.polku || '').trim();
        if (!path || path === '$') return { out: JSON.stringify(obj, null, 2), status: 'JUURI', kind: 'ok' };
        var parts = path.replace(/^\$\.?/, '').replace(/\[(\d+|\*)\]/g, '.$1').split('.').filter(Boolean);
        var cur = [obj];
        parts.forEach(function (p) {
          var next = [];
          cur.forEach(function (v) {
            if (v == null) return;
            if (p === '*') { if (Array.isArray(v)) next = next.concat(v); else if (typeof v === 'object') Object.keys(v).forEach(function (k) { next.push(v[k]); }); }
            else if (typeof v === 'object' && p in v) next.push(v[p]);
            else if (Array.isArray(v) && /^\d+$/.test(p)) next.push(v[+p]);
          });
          cur = next;
        });
        if (!cur.length) return { out: 'Polku ei osunut mihinkään: ' + path, status: 'EI OSUMIA', kind: 'warn', lang: 'none' };
        var res = cur.length === 1 ? cur[0] : cur;
        return { out: JSON.stringify(res, null, 2), status: cur.length + ' OSUMAA', kind: 'ok', meta: [['TYYPPI', Array.isArray(res) ? 'taulukko' : res === null ? 'null' : typeof res]] };
      }
    }
  });
})();
