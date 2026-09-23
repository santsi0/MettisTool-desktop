/* Moduuli: Tiedostot */
(function () {
  'use strict';
  var R = MT.reg, h = MT.h;

  function dz(c, onFile, accept, multi, label) {
    var z = h('div.drop', { tabindex: '0' }, [
      c.icon('i-upload', 'ic-lg'),
      h('b', { text: label || (multi ? 'Pudota tiedostot tähän tai klikkaa valitaksesi' : 'Pudota tiedosto tähän tai klikkaa valitaksesi') }),
      h('span', { text: accept || 'Mikä tahansa tiedostotyyppi' })
    ]);
    z.addEventListener('click', function () { MT.pickFile(accept === 'Mikä tahansa tiedostotyyppi' ? '' : (accept || ''), multi).then(function (f) { if (f && (!multi || f.length)) onFile(f); }); });
    z.addEventListener('keydown', function (e) { if (e.key === 'Enter') z.click(); });
    ['dragenter', 'dragover'].forEach(function (e) { z.addEventListener(e, function (ev) { ev.preventDefault(); z.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (e) { z.addEventListener(e, function (ev) { ev.preventDefault(); z.classList.remove('over'); }); });
    z.addEventListener('drop', function (ev) {
      var fs = Array.prototype.slice.call(ev.dataTransfer.files);
      if (fs.length) onFile(multi ? fs : fs[0]);
    });
    return z;
  }
  function concat(chunks) {
    var len = chunks.reduce(function (a, c) { return a + c.length; }, 0), out = new Uint8Array(len), p = 0;
    chunks.forEach(function (c) { out.set(c, p); p += c.length; });
    return out;
  }
  function bin(str) {
    var a = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) a[i] = str.charCodeAt(i) & 0xFF;
    return a;
  }

  /* ---------- 1. Datamuunnin ---------- */
  R({
    id: 'tiedostomuunnin', cat: 'tiedostot', name: 'Datamuunnin', icon: 'i-refresh', kind: 'io',
    desc: 'Muunna datatiedosto muodosta toiseen: JSON, CSV, TSV, YAML ja XML.',
    keys: ['muunna', 'json', 'csv', 'yaml', 'xml', 'tsv', 'tiedosto'],
    io: {
      inLabel: 'LÄHDE', outLabel: 'TULOS', lang: 'none', acceptExt: '.json,.csv,.tsv,.yaml,.yml,.xml,.txt',
      sample: 'nimi,rooli,vuosi\nMatti,kehittäjä,2019\nLiisa,suunnittelija,2021',
      opts: [
        { k: 'lahde', type: 'select', label: 'Lähdemuoto', def: 'auto', opts: [['auto', 'Tunnista automaattisesti'], ['json', 'JSON'], ['csv', 'CSV'], ['tsv', 'TSV'], ['yaml', 'YAML'], ['xml', 'XML']] },
        { k: 'kohde', type: 'select', label: 'Kohdemuoto', def: 'json', opts: [['json', 'JSON'], ['csv', 'CSV'], ['tsv', 'TSV'], ['yaml', 'YAML'], ['xml', 'XML']] }
      ],
      run: function (t, o) {
        var src = o.lahde;
        if (src === 'auto') {
          var s = t.trim();
          src = s[0] === '{' || s[0] === '[' ? 'json' : s[0] === '<' ? 'xml' : s.indexOf('\t') >= 0 ? 'tsv' : /^[^\n]*[,;]/.test(s) ? 'csv' : 'yaml';
        }
        var data;
        if (src === 'json') data = JSON.parse(t);
        else if (src === 'yaml') data = FMT.yamlParse(t);
        else if (src === 'xml') data = FMT.xml2json(t);
        else {
          var rows = FMT.csvParse(t, src === 'tsv' ? '\t' : FMT.csvDetect(t));
          var head = rows.shift();
          data = rows.filter(function (r) { return r.length > 1 || r[0] !== ''; }).map(function (r) {
            var ob = {}; head.forEach(function (k, i) { ob[k.trim()] = r[i] === undefined ? '' : r[i]; }); return ob;
          });
        }
        var out, lang = 'none';
        if (o.kohde === 'json') { out = JSON.stringify(data, null, 2); lang = 'json'; }
        else if (o.kohde === 'yaml') out = FMT.yamlDump(data) + '\n';
        else if (o.kohde === 'xml') { out = FMT.json2xml(data, 'root'); lang = 'xml'; }
        else {
          var arr = Array.isArray(data) ? data : [data], cols = [];
          arr.forEach(function (x) { Object.keys(x || {}).forEach(function (k) { if (cols.indexOf(k) < 0) cols.push(k); }); });
          out = FMT.csvStringify([cols].concat(arr.map(function (x) { return cols.map(function (k) { return x ? x[k] : ''; }); })), o.kohde === 'tsv' ? '\t' : ',');
        }
        return { out: out, lang: lang, status: src.toUpperCase() + ' → ' + o.kohde.toUpperCase(), kind: 'ok' };
      }
    }
  });

  /* ---------- 2. Kuvat → PDF ---------- */
  function buildPDF(pages) {
    var objs = [], out = [];
    function addObj(data) { objs.push(data); return objs.length; }
    var kids = [], pageObjs = [];
    pages.forEach(function (p) {
      var imgId = addObj({ type: 'img', p: p });
      var contentStr = 'q\n' + p.w.toFixed(2) + ' 0 0 ' + p.h.toFixed(2) + ' 0 0 cm\n/Im0 Do\nQ\n';
      var contId = addObj({ type: 'raw', s: '<< /Length ' + contentStr.length + ' >>\nstream\n' + contentStr + 'endstream' });
      var pageId = addObj({ type: 'page', imgId: imgId, contId: contId, p: p });
      pageObjs.push(pageId);
    });
    var pagesId = addObj({ type: 'pages', kids: pageObjs });
    var catId = addObj({ type: 'raw', s: '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>' });
    var infoId = addObj({ type: 'raw', s: '<< /Producer (MettisTool) /CreationDate (D:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z) >>' });

    out.push(bin('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
    var offsets = [0], pos = out[0].length;
    objs.forEach(function (o, i) {
      var id = i + 1, chunks = [];
      offsets[id] = pos;
      if (o.type === 'img') {
        var d = o.p.data;
        chunks.push(bin(id + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + o.p.pw + ' /Height ' + o.p.ph +
          ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + d.length + ' >>\nstream\n'));
        chunks.push(d);
        chunks.push(bin('\nendstream\nendobj\n'));
      } else if (o.type === 'page') {
        chunks.push(bin(id + ' 0 obj\n<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + o.p.w.toFixed(2) + ' ' + o.p.h.toFixed(2) +
          '] /Resources << /XObject << /Im0 ' + o.imgId + ' 0 R >> >> /Contents ' + o.contId + ' 0 R >>\nendobj\n'));
      } else if (o.type === 'pages') {
        chunks.push(bin(id + ' 0 obj\n<< /Type /Pages /Count ' + o.kids.length + ' /Kids [' +
          o.kids.map(function (k) { return k + ' 0 R'; }).join(' ') + '] >>\nendobj\n'));
      } else {
        chunks.push(bin(id + ' 0 obj\n' + o.s + '\nendobj\n'));
      }
      chunks.forEach(function (c) { out.push(c); pos += c.length; });
    });
    var xref = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    for (var i = 1; i <= objs.length; i++) xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    xref += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catId + ' 0 R /Info ' + infoId + ' 0 R >>\nstartxref\n' + pos + '\n%%EOF\n';
    out.push(bin(xref));
    return new Blob([concat(out)], { type: 'application/pdf' });
  }
  R({
    id: 'kuvat-pdf', cat: 'tiedostot', name: 'Kuvat → PDF', icon: 'i-file', kind: 'custom',
    desc: 'Yhdistä useita kuvia yhdeksi PDF-tiedostoksi. Muodostetaan kokonaan selaimessa.',
    keys: ['pdf', 'kuvat', 'yhdistä', 'muunna', 'dokumentti'],
    render: function (root, c) {
      var files = [], list = h('div.rows');
      var F = [
        { k: 'koko', type: 'select', label: 'Sivukoko', def: 'kuva', opts: [['kuva', 'Kuvan mukaan'], ['a4', 'A4 pysty'], ['a4v', 'A4 vaaka']] },
        { k: 'laatu', type: 'range', label: 'JPEG-laatu', def: 85, min: 40, max: 100, step: 1, suffix: ' %' },
        { k: 'marg', type: 'num', label: 'Marginaali (pt)', def: '0' }
      ];
      var box = c.fields(F);
      function render() {
        MT.clear(list);
        if (!files.length) { list.appendChild(c.empty('Ei kuvia', 'Pudota kuvat yläpuolelle. Järjestys määrää sivujärjestyksen.', 'i-image')); return; }
        files.forEach(function (f, i) {
          list.appendChild(h('div.row-item', null, [
            h('span.row-ico', null, c.icon('i-image')),
            h('span.row-main', null, [h('div.n', { text: (i + 1) + '. ' + f.name }), h('div.m', { text: MT.bytes(f.size) })]),
            c.btn('', { cls: 'btn-gh btn-sm', icon: 'i-chev-d', title: 'Siirrä alas', on: function () { if (i < files.length - 1) { var t = files[i]; files[i] = files[i + 1]; files[i + 1] = t; render(); } } }),
            c.btn('', { cls: 'btn-gh btn-sm', icon: 'i-trash', title: 'Poista', on: function () { files.splice(i, 1); render(); } })
          ]));
        });
      }
      function make() {
        if (!files.length) { MT.toast('Lisää ensin kuvia', 'warn'); return; }
        var v = c.readFields(box, F), marg = isFinite(v.marg) ? v.marg : 0;
        MT.toast('Muodostetaan PDF…');
        Promise.all(files.map(function (f) {
          return new Promise(function (res, rej) {
            var img = new Image(), url = URL.createObjectURL(f);
            img.onload = function () {
              var cv = h('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
              var ctx = cv.getContext('2d');
              ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
              ctx.drawImage(img, 0, 0);
              cv.toBlob(function (b) {
                b.arrayBuffer().then(function (buf) {
                  URL.revokeObjectURL(url);
                  var pw = cv.width, ph = cv.height, w, hgt;
                  if (v.koko === 'kuva') { w = pw * 72 / 96; hgt = ph * 72 / 96; }
                  else {
                    var PW = v.koko === 'a4' ? 595.28 : 841.89, PH = v.koko === 'a4' ? 841.89 : 595.28;
                    var k = Math.min((PW - marg * 2) / pw, (PH - marg * 2) / ph);
                    w = pw * k; hgt = ph * k;
                  }
                  res({ data: new Uint8Array(buf), pw: pw, ph: ph, w: w + marg * 2, h: hgt + marg * 2 });
                });
              }, 'image/jpeg', v.laatu / 100);
            };
            img.onerror = function () { rej(new Error('Kuvaa ei voitu lukea: ' + f.name)); };
            img.src = url;
          });
        })).then(function (pages) {
          var blob = buildPDF(pages);
          MT.download(blob, 'kuvat-' + MT.dateStr() + '.pdf');
        }).catch(function (e) { MT.toast(e.message, 'err'); });
      }
      root.appendChild(dz(c, function (fs) { files = files.concat(fs.filter(function (f) { return /^image\//.test(f.type); })); render(); }, 'image/*', true));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, h('div.home-grid', null, [
        c.panel('KUVAT', 'i-image', list, c.btn('Tyhjennä', { cls: 'btn-gh btn-sm', icon: 'i-trash', on: function () { files = []; render(); } })),
        c.panel('ASETUKSET', 'i-filter', h('div.panel-body', null, [box,
          h('div.btn-row', { style: { marginTop: '11px' } }, c.btn('Luo PDF', { cls: 'btn-pri', icon: 'i-file', on: make }))]))
      ])));
      render();
    }
  });

  /* ---------- 3. PDF-tiedot ---------- */
  R({
    id: 'pdf-tiedot', cat: 'tiedostot', name: 'PDF-tiedot', icon: 'i-file', kind: 'custom',
    desc: 'Lue PDF-tiedoston versio, sivumäärä, otsikot ja suojausasetukset.',
    keys: ['pdf', 'metatiedot', 'sivut', 'tiedot'],
    render: function (root, c) {
      var out = h('div', { style: { marginTop: '13px' } });
      function open(f) {
        MT.readFile(f, 'buf').then(function (buf) {
          var bytes = new Uint8Array(buf), txt = '';
          for (var i = 0; i < bytes.length; i++) txt += String.fromCharCode(bytes[i]);
          MT.clear(out);
          if (txt.slice(0, 5) !== '%PDF-') { out.appendChild(c.note('Tiedosto ei ole PDF-muotoinen.', 'err')); return; }
          var ver = /^%PDF-([\d.]+)/.exec(txt);
          var counts = (txt.match(/\/Type\s*\/Page[^s]/g) || []).length;
          var countTag = /\/Count\s+(\d+)/.exec(txt);
          var enc = /\/Encrypt\b/.test(txt);
          function meta(k) {
            var m = new RegExp('\\/' + k + '\\s*\\(((?:\\\\.|[^)\\\\])*)\\)').exec(txt);
            return m ? m[1].replace(/\\([()\\])/g, '$1') : null;
          }
          function pdfDate(s) {
            var m = /D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/.exec(s || '');
            return m ? m[1] + '-' + m[2] + '-' + m[3] + (m[4] ? ' ' + m[4] + ':' + (m[5] || '00') : '') : s;
          }
          var rows = [
            { k: 'Tiedosto', v: f.name },
            { k: 'Koko', v: MT.bytes(f.size) },
            { k: 'PDF-versio', v: ver ? ver[1] : '–' },
            { k: 'Sivuja', v: String(countTag ? countTag[1] : counts || '–'), big: true },
            { k: 'Otsikko', v: meta('Title') || '–' },
            { k: 'Tekijä', v: meta('Author') || '–' },
            { k: 'Aihe', v: meta('Subject') || '–' },
            { k: 'Avainsanat', v: meta('Keywords') || '–' },
            { k: 'Luotu ohjelmalla', v: meta('Creator') || '–' },
            { k: 'Tuottaja', v: meta('Producer') || '–' },
            { k: 'Luontiaika', v: pdfDate(meta('CreationDate')) || '–' },
            { k: 'Muokattu', v: pdfDate(meta('ModDate')) || '–' },
            { k: 'Salattu', v: enc ? 'kyllä — sisältöä ei voi lukea ilman salasanaa' : 'ei', copy: false },
            { k: 'Lomakkeita', v: /\/AcroForm\b/.test(txt) ? 'kyllä' : 'ei', copy: false },
            { k: 'Linkkejä', v: String((txt.match(/\/Subtype\s*\/Link/g) || []).length), copy: false },
            { k: 'Upotettuja fontteja', v: String((txt.match(/\/FontFile\d?/g) || []).length), copy: false }
          ];
          out.appendChild(c.panel('PDF-TIEDOT', 'i-file', c.resList(rows)));
          out.appendChild(h('div', { style: { marginTop: '11px' } },
            c.note('Työkalu lukee PDF:n rakenteen suoraan tavuvirrasta. Sivujen sisällön purkaminen kuviksi vaatisi raskaan PDF-moottorin, jota ei ole tarkoituksella otettu mukaan — MettisTool pysyy riippuvuudettomana ja kevyenä.', 'info')));
        });
      }
      root.appendChild(dz(c, open, '.pdf'));
      root.appendChild(out);
      MT.clear(out); out.appendChild(c.empty('Ei tiedostoa', 'Pudota PDF-tiedosto yläpuolelle.', 'i-file'));
    }
  });

  /* ---------- 4. CSV-katselin ---------- */
  R({
    id: 'csv-katselin', cat: 'tiedostot', name: 'CSV-katselin', icon: 'i-grid', kind: 'custom',
    desc: 'Avaa CSV-tiedosto taulukkona, suodata rivejä ja lajittele sarakkeita.',
    keys: ['csv', 'taulukko', 'katselin', 'excel', 'data'],
    render: function (root, c) {
      var rows = [], head = [], sortI = -1, sortDir = 1;
      var filter = h('input.ctl', { placeholder: 'Suodata rivejä…' });
      var info = h('span.lbl', { text: 'EI TIEDOSTOA' });
      var tbl = h('div');
      function draw() {
        MT.clear(tbl);
        if (!head.length) { tbl.appendChild(c.empty('Ei dataa', 'Pudota CSV-tiedosto yläpuolelle.', 'i-grid')); return; }
        var q = filter.value.toLowerCase();
        var view = rows.filter(function (r) { return !q || r.join(' ').toLowerCase().indexOf(q) >= 0; });
        if (sortI >= 0) {
          view = view.slice().sort(function (a, b) {
            var x = a[sortI] || '', y = b[sortI] || '';
            var nx = parseFloat(String(x).replace(',', '.')), ny = parseFloat(String(y).replace(',', '.'));
            if (isFinite(nx) && isFinite(ny)) return (nx - ny) * sortDir;
            return String(x).localeCompare(String(y), 'fi') * sortDir;
          });
        }
        var t = h('table.tbl', null, [
          h('thead', null, h('tr', null, head.map(function (x, i) {
            return h('th', { style: { cursor: 'pointer' }, text: x + (sortI === i ? (sortDir > 0 ? ' ↑' : ' ↓') : ''),
              onclick: function () { if (sortI === i) sortDir = -sortDir; else { sortI = i; sortDir = 1; } draw(); } });
          }))),
          h('tbody', null, view.slice(0, 2000).map(function (r) {
            return h('tr', null, head.map(function (_, i) { return h('td', { text: r[i] === undefined ? '' : r[i] }); }));
          }))
        ]);
        tbl.appendChild(h('div.tbl-wrap', { style: { maxHeight: '540px' } }, t));
        info.textContent = view.length + ' / ' + rows.length + ' RIVIÄ · ' + head.length + ' SARAKETTA' + (view.length > 2000 ? ' · NÄYTETÄÄN 2000' : '');
      }
      function open(f) {
        MT.readFile(f).then(function (t) {
          var all = FMT.csvParse(t);
          head = all.shift() || [];
          rows = all.filter(function (r) { return r.length > 1 || r[0] !== ''; });
          sortI = -1; draw();
          MT.toast('Avattu: ' + f.name + ' (' + rows.length + ' riviä)', 'ok');
        });
      }
      filter.addEventListener('input', MT.debounce(draw, 160));
      root.appendChild(dz(c, open, '.csv,.tsv,.txt'));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('TAULUKKO', 'i-grid', h('div', null, [
        h('div.panel-body', { style: { paddingBottom: '0' } }, filter), tbl
      ]), info)));
      root.appendChild(h('div.btn-row', { style: { marginTop: '11px' } }, [
        c.btn('Vie JSON:ksi', { icon: 'i-download', on: function () {
          if (!head.length) return MT.toast('Ei dataa', 'warn');
          var out = rows.map(function (r) { var o = {}; head.forEach(function (k, i) { o[k] = r[i]; }); return o; });
          MT.download(JSON.stringify(out, null, 2), 'data.json', 'application/json');
        } }),
        c.btn('Vie CSV:nä', { icon: 'i-download', on: function () {
          if (!head.length) return MT.toast('Ei dataa', 'warn');
          MT.download(FMT.csvStringify([head].concat(rows)), 'data.csv', 'text/csv');
        } })
      ]));
      draw();
    }
  });

  /* ---------- 5. Datatiedoston katselin ---------- */
  R({
    id: 'datan-katselin', cat: 'tiedostot', name: 'JSON / XML / YAML -katselin', icon: 'i-file', kind: 'custom',
    desc: 'Avaa rakenteinen datatiedosto, tarkista sen oikeellisuus ja selaa sisältöä.',
    keys: ['json', 'xml', 'yaml', 'katselin', 'tiedosto', 'rakenne'],
    render: function (root, c) {
      var out = h('div', { style: { marginTop: '13px' } });
      function open(f) {
        MT.readFile(f).then(function (t) {
          MT.clear(out);
          var ext = (f.name.split('.').pop() || '').toLowerCase(), data, type;
          try {
            if (ext === 'json') { data = JSON.parse(t); type = 'JSON'; }
            else if (ext === 'xml' || ext === 'svg' || ext === 'html') { data = FMT.xml2json(t); type = 'XML'; }
            else if (ext === 'yaml' || ext === 'yml') { data = FMT.yamlParse(t); type = 'YAML'; }
            else { data = JSON.parse(t); type = 'JSON'; }
          } catch (e) {
            out.appendChild(c.note('Tiedostoa ei voitu jäsentää: ' + e.message, 'err'));
            out.appendChild(h('div', { style: { marginTop: '11px' } }, c.panel('RAAKASISÄLTÖ', 'i-file',
              h('pre.ed-out', { text: t.slice(0, 20000), style: { padding: '11px', maxHeight: '420px' } }))));
            return;
          }
          var pretty = JSON.stringify(data, null, 2);
          out.appendChild(c.panel('TIEDOT', 'i-info', c.resList([
            { k: 'Tiedosto', v: f.name }, { k: 'Muoto', v: type, copy: false },
            { k: 'Koko', v: MT.bytes(f.size) },
            { k: 'Rivejä', v: MT.num(t.split('\n').length) },
            { k: 'Juurityyppi', v: Array.isArray(data) ? 'taulukko (' + data.length + ')' : typeof data, copy: false }
          ])));
          var pre = h('pre.ed-out', { html: MT.highlight(pretty.slice(0, 200000), 'json'), style: { padding: '11px', maxHeight: '480px' } });
          out.appendChild(h('div', { style: { marginTop: '11px' } }, c.panel('SISÄLTÖ', 'i-code', h('div', null, [pre,
            h('div.panel-foot', null, [
              c.btn('Kopioi JSON', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(pretty); } }),
              c.btn('Lataa JSON', { cls: 'btn-sm', icon: 'i-download', on: function () { MT.download(pretty, f.name.replace(/\.\w+$/, '') + '.json', 'application/json'); } })
            ])]))));
        });
      }
      root.appendChild(dz(c, open, '.json,.xml,.yaml,.yml,.svg,.txt'));
      root.appendChild(out);
      MT.clear(out); out.appendChild(c.empty('Ei tiedostoa', 'Pudota JSON-, XML- tai YAML-tiedosto yläpuolelle.', 'i-file'));
    }
  });

  /* ---------- 6. Tiedoston tiiviste ---------- */
  R({
    id: 'tiedoston-tiiviste', cat: 'tiedostot', name: 'Tiedoston tiiviste', icon: 'i-hash', kind: 'custom',
    desc: 'Laske tiedoston MD5-, SHA-1-, SHA-256- ja SHA-512-tarkistussummat ja vertaa niitä.',
    keys: ['tiiviste', 'hash', 'checksum', 'sha256', 'md5', 'eheys'],
    render: function (root, c) {
      var out = h('div', { style: { marginTop: '13px' } });
      var cmp = h('input.ctl.mono', { placeholder: 'Liitä tähän odotettu tarkistussumma vertailua varten' });
      var last = null;
      function check() {
        if (!last || !cmp.value.trim()) return;
        var want = cmp.value.trim().toLowerCase().replace(/\s/g, '');
        var hit = Object.keys(last).filter(function (k) { return last[k] === want; });
        var box = MT.qs('#hash-cmp');
        if (!box) return;
        MT.clear(box);
        box.appendChild(hit.length
          ? c.note('<b>Täsmää!</b> Tiedoston ' + hit[0] + '-tiiviste vastaa annettua arvoa — tiedosto on muuttumaton.', 'ok')
          : c.note('<b>Ei täsmää.</b> Annettu arvo ei vastaa mitään lasketuista tiivisteistä.', 'err'));
      }
      function open(f) {
        MT.clear(out);
        out.appendChild(h('div', { style: { padding: '14px', textAlign: 'center' } }, [h('span.spin'), h('span', { text: '  Lasketaan tiivisteitä…' })]));
        MT.readFile(f, 'buf').then(function (buf) {
          var arr = new Uint8Array(buf);
          return Promise.all(['MD5', 'SHA-1', 'SHA-256', 'SHA-512'].map(function (a) { return HASH.digest(a, arr); }))
            .then(function (res) {
              last = { MD5: HASH.hex(res[0]), 'SHA-1': HASH.hex(res[1]), 'SHA-256': HASH.hex(res[2]), 'SHA-512': HASH.hex(res[3]) };
              MT.clear(out);
              out.appendChild(c.panel('TIEDOSTO', 'i-file', c.resList([
                { k: 'Nimi', v: f.name }, { k: 'Koko', v: MT.bytes(f.size) },
                { k: 'CRC32', v: HASH.crc32(arr).toString(16).padStart(8, '0') }
              ])));
              out.appendChild(h('div', { style: { marginTop: '11px' } }, c.panel('TIIVISTEET', 'i-hash',
                c.resList(Object.keys(last).map(function (k) { return { k: k, v: last[k] }; })))));
              out.appendChild(h('div', { id: 'hash-cmp', style: { marginTop: '11px' } }));
              check();
            });
        }).catch(function (e) { MT.clear(out); out.appendChild(c.note(e.message, 'err')); });
      }
      cmp.addEventListener('input', MT.debounce(check, 220));
      root.appendChild(dz(c, open));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('VERTAILU', 'i-checksq', h('div.panel-body', null, cmp))));
      root.appendChild(out);
      MT.clear(out); out.appendChild(c.empty('Ei tiedostoa', 'Pudota mikä tahansa tiedosto yläpuolelle.', 'i-file'));
    }
  });

  /* ---------- 7. Tiedostokoon muunnin ---------- */
  R({
    id: 'tiedostokoon-muunnin', cat: 'tiedostot', name: 'Tiedostokoon muunnin', icon: 'i-db',
    desc: 'Muunna tavut, kilotavut, megatavut ja gigatavut — sekä desimaali- että binääriyksiköt.',
    keys: ['tavu', 'megatavu', 'gigatavu', 'koko', 'kb', 'mb'],
    fields: [
      { k: 'arvo', type: 'num', label: 'Arvo', def: '1500' },
      { k: 'yks', type: 'select', label: 'Yksikkö', def: 'MB', opts: [['bitti', 'bittiä'], ['B', 'tavua (B)'], ['kB', 'kilotavua (kB, 1000)'], ['MB', 'megatavua (MB)'], ['GB', 'gigatavua (GB)'], ['TB', 'teratavua (TB)'], ['KiB', 'kibitavua (KiB, 1024)'], ['MiB', 'mebitavua (MiB)'], ['GiB', 'gibitavua (GiB)'], ['TiB', 'tebitavua (TiB)']] }
    ],
    run: function (v) {
      if (!isFinite(v.arvo)) return null;
      var F = { bitti: 0.125, B: 1, kB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1048576, GiB: 1073741824, TiB: 1099511627776 };
      var b = v.arvo * F[v.yks];
      return {
        rows: Object.keys(F).map(function (k) {
          return { k: k === 'bitti' ? 'bittiä' : k, v: MT.numAuto(b / F[k]), big: k === v.yks };
        }).concat([
          { k: 'Luettava muoto', v: MT.bytes(b), big: true },
          { k: 'Latausaika 100 Mbit/s', v: MT.numAuto(b * 8 / 1e8) + ' s', sub: true },
          { k: 'Latausaika 1 Gbit/s', v: MT.numAuto(b * 8 / 1e9) + ' s', sub: true }
        ]),
        foot: 'Desimaaliyksiköt (kB, MB) käyttävät kerrointa 1000 ja binääriyksiköt (KiB, MiB) kerrointa 1024. Käyttöjärjestelmät näyttävät usein binäärikoot desimaalinimillä, mistä syntyy tuttu ero levyn ilmoitetun ja näkyvän koon välillä.'
      };
    }
  });

  /* ---------- 8. ZIP-luonti ---------- */
  function makeZip(entries) {
    var chunks = [], central = [], offset = 0;
    var now = new Date();
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    entries.forEach(function (e) {
      var nameBytes = new TextEncoder().encode(e.name);
      var crc = HASH.crc32(e.data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, e.data.length, true); lh.setUint32(22, e.data.length, true);
      lh.setUint16(26, nameBytes.length, true); lh.setUint16(28, 0, true);
      chunks.push(new Uint8Array(lh.buffer), nameBytes, e.data);
      var cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true);
      cd.setUint16(12, dosTime, true); cd.setUint16(14, dosDate, true);
      cd.setUint32(16, crc, true); cd.setUint32(20, e.data.length, true); cd.setUint32(24, e.data.length, true);
      cd.setUint16(28, nameBytes.length, true); cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), nameBytes);
      offset += 30 + nameBytes.length + e.data.length;
    });
    var cdSize = central.reduce(function (a, c) { return a + c.length; }, 0);
    var eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(8, entries.length, true); eocd.setUint16(10, entries.length, true);
    eocd.setUint32(12, cdSize, true); eocd.setUint32(16, offset, true);
    return new Blob(chunks.concat(central, [new Uint8Array(eocd.buffer)]), { type: 'application/zip' });
  }
  R({
    id: 'zip-luonti', cat: 'tiedostot', name: 'ZIP-paketointi', icon: 'i-file', kind: 'custom',
    desc: 'Pakkaa useita tiedostoja yhdeksi ZIP-arkistoksi suoraan selaimessa.',
    keys: ['zip', 'arkisto', 'pakkaa', 'paketti'],
    render: function (root, c) {
      var files = [], list = h('div.rows'), nameIn = h('input.ctl', { value: 'arkisto.zip' });
      function render() {
        MT.clear(list);
        if (!files.length) { list.appendChild(c.empty('Ei tiedostoja', 'Pudota tiedostot yläpuolelle.', 'i-file')); return; }
        files.forEach(function (f, i) {
          list.appendChild(h('div.row-item', null, [
            h('span.row-ico', null, c.icon('i-file')),
            h('span.row-main', null, [h('div.n', { text: f.name }), h('div.m', { text: MT.bytes(f.size) + ' · ' + (f.type || 'tuntematon') })]),
            c.btn('', { cls: 'btn-gh btn-sm', icon: 'i-trash', on: function () { files.splice(i, 1); render(); } })
          ]));
        });
        list.appendChild(h('div.panel-foot', null, [
          h('span.lbl', { text: files.length + ' TIEDOSTOA · ' + MT.bytes(files.reduce(function (a, f) { return a + f.size; }, 0)) })
        ]));
      }
      function build() {
        if (!files.length) { MT.toast('Lisää ensin tiedostoja', 'warn'); return; }
        Promise.all(files.map(function (f) {
          return MT.readFile(f, 'buf').then(function (b) { return { name: f.name, data: new Uint8Array(b) }; });
        })).then(function (entries) {
          var blob = makeZip(entries);
          MT.download(blob, nameIn.value || 'arkisto.zip');
        }).catch(function (e) { MT.toast(e.message, 'err'); });
      }
      root.appendChild(dz(c, function (fs) { files = files.concat(fs); render(); }, '', true));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, h('div.home-grid', null, [
        c.panel('TIEDOSTOT', 'i-file', list, c.btn('Tyhjennä', { cls: 'btn-gh btn-sm', icon: 'i-trash', on: function () { files = []; render(); } })),
        c.panel('ARKISTO', 'i-filter', h('div.panel-body', null, [
          h('div.field', null, [h('label', { text: 'Tiedostonimi' }), nameIn]),
          h('div.btn-row', { style: { marginTop: '11px' } }, c.btn('Luo ZIP', { cls: 'btn-pri', icon: 'i-download', on: build })),
          h('div', { style: { marginTop: '11px' } }, c.note('Arkisto luodaan tallennusmenetelmällä (store) ilman pakkausta, joten koko vastaa tiedostojen yhteiskokoa. Arkisto avautuu normaalisti kaikissa ZIP-ohjelmissa.', 'info'))
        ]))
      ])));
      render();
    }
  });

  /* ---------- 9. Metatiedot ---------- */
  R({
    id: 'tiedoston-metatiedot', cat: 'tiedostot', name: 'Tiedoston metatiedot', icon: 'i-info', kind: 'custom',
    desc: 'Näytä tiedoston nimi, koko, tyyppi, aikaleima ja tunnistettu todellinen muoto.',
    keys: ['metatiedot', 'tiedot', 'tyyppi', 'koko'],
    render: function (root, c) {
      var out = h('div', { style: { marginTop: '13px' } });
      function open(fs) {
        MT.clear(out);
        fs.forEach(function (f) {
          var box = h('div', { style: { marginBottom: '11px' } });
          out.appendChild(box);
          MT.readFile(f.slice(0, 64), 'buf').then(function (buf) {
            var b = new Uint8Array(buf);
            box.appendChild(c.panel(f.name.toUpperCase(), 'i-file', c.resList([
              { k: 'Nimi', v: f.name },
              { k: 'Pääte', v: (f.name.split('.').length > 1 ? '.' + f.name.split('.').pop() : '–'), copy: false },
              { k: 'Koko', v: MT.bytes(f.size) + '  (' + MT.num(f.size) + ' tavua)' },
              { k: 'MIME-tyyppi', v: f.type || 'ei ilmoitettu' },
              { k: 'Tunnistettu muoto', v: magic(b), copy: false, big: true },
              { k: 'Muokattu', v: new Date(f.lastModified).toLocaleString('fi-FI'), copy: false },
              { k: 'Ensimmäiset tavut', v: Array.prototype.map.call(b.slice(0, 16), function (x) { return x.toString(16).padStart(2, '0'); }).join(' ') }
            ])));
          });
        });
      }
      root.appendChild(dz(c, open, '', true));
      root.appendChild(out);
      MT.clear(out); out.appendChild(c.empty('Ei tiedostoja', 'Pudota yksi tai useampi tiedosto yläpuolelle.', 'i-file'));
    }
  });
  var MAGIC = [
    [[0x89, 0x50, 0x4E, 0x47], 'PNG-kuva'], [[0xFF, 0xD8, 0xFF], 'JPEG-kuva'], [[0x47, 0x49, 0x46, 0x38], 'GIF-kuva'],
    [[0x25, 0x50, 0x44, 0x46], 'PDF-dokumentti'], [[0x50, 0x4B, 0x03, 0x04], 'ZIP-arkisto (myös docx, xlsx, pptx, odt)'],
    [[0x52, 0x61, 0x72, 0x21], 'RAR-arkisto'], [[0x1F, 0x8B], 'GZIP-pakattu tiedosto'], [[0x37, 0x7A, 0xBC, 0xAF], '7-Zip-arkisto'],
    [[0x42, 0x4D], 'BMP-kuva'], [[0x00, 0x00, 0x01, 0x00], 'ICO-ikoni'], [[0x49, 0x44, 0x33], 'MP3-äänitiedosto'],
    [[0x4F, 0x67, 0x67, 0x53], 'OGG-media'], [[0x66, 0x4C, 0x61, 0x43], 'FLAC-ääni'], [[0x7F, 0x45, 0x4C, 0x46], 'ELF-ohjelmatiedosto'],
    [[0x4D, 0x5A], 'Windows-ohjelma (EXE/DLL)'], [[0xEF, 0xBB, 0xBF], 'UTF-8-tekstitiedosto (BOM)']
  ];
  function magic(b) {
    for (var i = 0; i < MAGIC.length; i++) {
      var m = MAGIC[i][0], ok = true;
      for (var j = 0; j < m.length; j++) if (b[j] !== m[j]) { ok = false; break; }
      if (ok) return MAGIC[i][1];
    }
    if (b.length > 8) {
      var s = String.fromCharCode.apply(null, b.slice(0, 8));
      if (/^\{|^\[/.test(s.trim())) return 'JSON- tai tekstitiedosto';
      if (/^<\?xml|^<svg|^<!DO/i.test(s)) return 'XML- tai HTML-tiedosto';
    }
    return 'tunnistamaton / tekstitiedosto';
  }

  /* ---------- 10. Heksatarkastelu ---------- */
  R({
    id: 'tiedoston-tarkastelu', cat: 'tiedostot', name: 'Heksatarkastelu', icon: 'i-term', kind: 'custom',
    desc: 'Selaa tiedoston tavuja heksadesimaalina ja ASCII-esityksenä.',
    keys: ['heksa', 'hex', 'tavut', 'binääri', 'tarkastele', 'dump'],
    render: function (root, c) {
      var out = h('div', { style: { marginTop: '13px' } });
      function open(f) {
        MT.readFile(f.slice(0, 65536), 'buf').then(function (buf) {
          var b = new Uint8Array(buf), lines = [];
          for (var i = 0; i < b.length; i += 16) {
            var row = b.slice(i, i + 16);
            var hex = Array.prototype.map.call(row, function (x) { return x.toString(16).padStart(2, '0'); }).join(' ');
            var asc = Array.prototype.map.call(row, function (x) { return x >= 32 && x < 127 ? String.fromCharCode(x) : '·'; }).join('');
            lines.push(i.toString(16).padStart(8, '0') + '  ' + hex.padEnd(47) + '  |' + asc + '|');
          }
          MT.clear(out);
          out.appendChild(c.panel('TIEDOSTO', 'i-file', c.resList([
            { k: 'Nimi', v: f.name }, { k: 'Koko', v: MT.bytes(f.size) },
            { k: 'Tunnistettu muoto', v: magic(b), copy: false },
            { k: 'Näytetään', v: MT.bytes(Math.min(f.size, 65536)) + (f.size > 65536 ? ' (ensimmäiset 64 kB)' : ''), copy: false }
          ])));
          out.appendChild(h('div', { style: { marginTop: '11px' } }, c.panel('HEKSADUMP', 'i-term', h('div', null, [
            h('pre.ed-out', { text: lines.join('\n'), style: { padding: '11px', maxHeight: '520px' } }),
            h('div.panel-foot', null, c.btn('Kopioi', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(lines.join('\n')); } }))
          ]))));
        });
      }
      root.appendChild(dz(c, open));
      root.appendChild(out);
      MT.clear(out); out.appendChild(c.empty('Ei tiedostoa', 'Pudota tiedosto yläpuolelle.', 'i-term'));
    }
  });

  /* ---------- 11. Tiedoston jako ---------- */
  R({
    id: 'tiedoston-jako', cat: 'tiedostot', name: 'Tekstitiedoston jako', icon: 'i-grid', kind: 'custom',
    desc: 'Jaa suuri teksti- tai CSV-tiedosto useaan osaan rivimäärän tai koon mukaan.',
    keys: ['jaa', 'pilko', 'split', 'osat', 'csv'],
    render: function (root, c) {
      var text = '', fname = 'tiedosto.txt';
      var F = [
        { k: 'tapa', type: 'select', label: 'Jakotapa', def: 'rivit', opts: [['rivit', 'Rivimäärän mukaan'], ['osat', 'Osien lukumäärän mukaan'], ['koko', 'Enimmäiskoon mukaan (kB)']] },
        { k: 'arvo', type: 'num', label: 'Arvo', def: '1000' },
        { k: 'otsikko', type: 'check', label: 'Toista otsikkorivi jokaisessa osassa (CSV)', def: false }
      ];
      var box = c.fields(F), out = h('div', { style: { marginTop: '13px' } });
      function split() {
        if (!text) { MT.toast('Avaa ensin tiedosto', 'warn'); return; }
        var v = c.readFields(box, F), lines = text.split('\n');
        var head = v.otsikko ? lines.shift() : null;
        var parts = [], n;
        if (v.tapa === 'rivit') { n = Math.max(1, Math.round(v.arvo)); for (var i = 0; i < lines.length; i += n) parts.push(lines.slice(i, i + n)); }
        else if (v.tapa === 'osat') {
          n = Math.max(1, Math.round(v.arvo));
          var per = Math.ceil(lines.length / n);
          for (i = 0; i < lines.length; i += per) parts.push(lines.slice(i, i + per));
        } else {
          var max = Math.max(1, v.arvo) * 1024, cur = [], size = 0;
          lines.forEach(function (l) {
            if (size + l.length > max && cur.length) { parts.push(cur); cur = []; size = 0; }
            cur.push(l); size += l.length + 1;
          });
          if (cur.length) parts.push(cur);
        }
        MT.clear(out);
        var rows = h('div.rows');
        parts.forEach(function (p, i) {
          var content = (head ? head + '\n' : '') + p.join('\n');
          rows.appendChild(h('div.row-item', null, [
            h('span.row-ico', null, c.icon('i-file')),
            h('span.row-main', null, [h('div.n', { text: 'osa-' + (i + 1) + '-' + fname }), h('div.m', { text: p.length + ' riviä · ' + MT.bytes(new Blob([content]).size) })]),
            c.btn('Lataa', { cls: 'btn-sm', icon: 'i-download', on: function () { MT.download(content, 'osa-' + (i + 1) + '-' + fname); } })
          ]));
        });
        out.appendChild(c.panel('OSAT (' + parts.length + ')', 'i-grid', h('div', null, [rows,
          h('div.panel-foot', null, c.btn('Lataa kaikki ZIP:nä', { cls: 'btn-pri btn-sm', icon: 'i-download', on: function () {
            var enc = new TextEncoder();
            MT.download(makeZip(parts.map(function (p, i) {
              return { name: 'osa-' + (i + 1) + '-' + fname, data: enc.encode((head ? head + '\n' : '') + p.join('\n')) };
            })), fname.replace(/\.\w+$/, '') + '-osat.zip');
          } }))])));
      }
      root.appendChild(dz(c, function (f) {
        fname = f.name;
        MT.readFile(f).then(function (t) { text = t; MT.toast('Avattu: ' + f.name + ' (' + MT.num(t.split('\n').length) + ' riviä)', 'ok'); split(); });
      }, '.txt,.csv,.log,.json,.md'));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('ASETUKSET', 'i-filter', h('div.panel-body', null, [box,
        h('div.btn-row', { style: { marginTop: '11px' } }, c.btn('Jaa tiedosto', { cls: 'btn-pri', icon: 'i-grid', on: split }))]))));
      root.appendChild(out);
      MT.clear(out); out.appendChild(c.empty('Ei tiedostoa', 'Pudota tekstitiedosto yläpuolelle.', 'i-file'));
    }
  });

  /* ---------- 12. Tiedostojen yhdistys ---------- */
  R({
    id: 'tiedostojen-yhdistys', cat: 'tiedostot', name: 'Tekstitiedostojen yhdistys', icon: 'i-plus', kind: 'custom',
    desc: 'Yhdistä useita teksti- tai CSV-tiedostoja yhdeksi.',
    keys: ['yhdistä', 'merge', 'liitä', 'csv', 'teksti'],
    render: function (root, c) {
      var files = [], list = h('div.rows');
      var F = [
        { k: 'erotin', type: 'select', label: 'Tiedostojen väliin', def: 'nl', opts: [['nl', 'Rivinvaihto'], ['tyhja', 'Tyhjä rivi'], ['otsikko', 'Tiedoston nimi otsikkona'], ['ei', 'Ei mitään']] },
        { k: 'csv', type: 'check', label: 'CSV-tila: säilytä vain ensimmäisen tiedoston otsikkorivi', def: false }
      ];
      var box = c.fields(F);
      function render() {
        MT.clear(list);
        if (!files.length) { list.appendChild(c.empty('Ei tiedostoja', 'Pudota tiedostot yläpuolelle.', 'i-file')); return; }
        files.forEach(function (f, i) {
          list.appendChild(h('div.row-item', null, [
            h('span.row-ico', null, c.icon('i-file')),
            h('span.row-main', null, [h('div.n', { text: (i + 1) + '. ' + f.name }), h('div.m', { text: MT.bytes(f.size) })]),
            c.btn('', { cls: 'btn-gh btn-sm', icon: 'i-trash', on: function () { files.splice(i, 1); render(); } })
          ]));
        });
      }
      function merge() {
        if (!files.length) { MT.toast('Lisää tiedostoja', 'warn'); return; }
        var v = c.readFields(box, F);
        Promise.all(files.map(function (f) { return MT.readFile(f).then(function (t) { return { n: f.name, t: t }; }); }))
          .then(function (all) {
            var out = all.map(function (x, i) {
              var body = x.t;
              if (v.csv && i > 0) body = body.split('\n').slice(1).join('\n');
              if (v.erotin === 'otsikko') return '### ' + x.n + '\n' + body;
              return body;
            }).join(v.erotin === 'tyhja' ? '\n\n' : v.erotin === 'ei' ? '' : '\n');
            MT.download(out, 'yhdistetty-' + MT.dateStr() + (files[0].name.match(/\.\w+$/) || ['.txt'])[0]);
          });
      }
      root.appendChild(dz(c, function (fs) { files = files.concat(fs); render(); }, '.txt,.csv,.md,.log,.json', true));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, h('div.home-grid', null, [
        c.panel('TIEDOSTOT', 'i-file', list, c.btn('Tyhjennä', { cls: 'btn-gh btn-sm', icon: 'i-trash', on: function () { files = []; render(); } })),
        c.panel('ASETUKSET', 'i-filter', h('div.panel-body', null, [box,
          h('div.btn-row', { style: { marginTop: '11px' } }, c.btn('Yhdistä ja lataa', { cls: 'btn-pri', icon: 'i-download', on: merge }))]))
      ])));
      render();
    }
  });

  /* ---------- 13. Tiedosto ↔ Base64 ---------- */
  R({
    id: 'base64-tiedosto', cat: 'tiedostot', name: 'Tiedosto ↔ Base64', icon: 'i-code', kind: 'custom',
    desc: 'Koodaa mikä tahansa tiedosto Base64-muotoon tai palauta Base64 tiedostoksi.',
    keys: ['base64', 'tiedosto', 'koodaa', 'pura'],
    render: function (root, c) {
      var out = h('div', { style: { marginTop: '13px' } });
      var ta = h('textarea.ctl', { rows: 6, placeholder: 'Liitä Base64 tähän purkaaksesi sen tiedostoksi…', spellcheck: 'false' });
      var nameIn = h('input.ctl', { value: 'tiedosto.bin' });
      function open(f) {
        MT.readFile(f, 'buf').then(function (buf) {
          var b64 = HASH.b64(new Uint8Array(buf));
          MT.clear(out);
          out.appendChild(c.panel('BASE64', 'i-code', h('div', null, [
            c.resList([
              { k: 'Tiedosto', v: f.name }, { k: 'Alkuperäinen koko', v: MT.bytes(f.size) },
              { k: 'Base64-pituus', v: MT.num(b64.length) + ' merkkiä', big: true },
              { k: 'Kasvu', v: '+' + ((b64.length / f.size - 1) * 100).toFixed(0) + ' %' }
            ]),
            h('pre.ed-out', { text: b64.length > 6000 ? b64.slice(0, 6000) + '\n… (katkaistu näytöstä)' : b64, style: { padding: '11px', maxHeight: '220px' } }),
            h('div.panel-foot', null, [
              c.btn('Kopioi', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(b64); } }),
              c.btn('Kopioi data-URL', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy('data:' + (f.type || 'application/octet-stream') + ';base64,' + b64); } }),
              c.btn('Lataa .txt', { cls: 'btn-sm', icon: 'i-download', on: function () { MT.download(b64, f.name + '.base64.txt'); } })
            ])
          ])));
        });
      }
      function decode() {
        var s = ta.value.trim().replace(/^data:[^,]+,/, '').replace(/\s/g, '');
        if (!s) { MT.toast('Liitä ensin Base64-sisältö', 'warn'); return; }
        try {
          var binStr = atob(s), arr = new Uint8Array(binStr.length);
          for (var i = 0; i < binStr.length; i++) arr[i] = binStr.charCodeAt(i);
          MT.download(new Blob([arr]), nameIn.value || 'tiedosto.bin');
        } catch (e) { MT.toast('Virheellinen Base64-sisältö', 'err'); }
      }
      root.appendChild(dz(c, open, '', false, 'Pudota tiedosto koodataksesi sen Base64-muotoon'));
      root.appendChild(out);
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('BASE64 → TIEDOSTO', 'i-download', h('div.panel-body', null, [
        ta, h('div.fields', { style: { marginTop: '11px' } }, h('div.field', null, [h('label', { text: 'Tallennusnimi' }), nameIn])),
        h('div.btn-row', { style: { marginTop: '11px' } }, c.btn('Pura ja lataa', { cls: 'btn-pri', icon: 'i-download', on: decode }))
      ]))));
      MT.clear(out); out.appendChild(c.empty('Ei tiedostoa', 'Pudota tiedosto yläpuolelle.', 'i-file'));
    }
  });

  /* ---------- 14. Tiedostonimien siivous ---------- */
  R({
    id: 'tiedostonimien-siivous', cat: 'tiedostot', name: 'Tiedostonimien siivous', icon: 'i-text', kind: 'io',
    desc: 'Siivoa tiedostonimilista: ääkköset, välilyönnit, erikoismerkit ja kirjainkoko.',
    keys: ['tiedostonimi', 'siivoa', 'nimet', 'ääkköset', 'rename'],
    io: {
      inLabel: 'NIMET (YKSI RIVILLÄ)', outLabel: 'SIIVOTUT NIMET', lang: 'none',
      sample: 'Kesäloma 2026 (kuvat).JPG\nTärkeä dokumentti – lopullinen versio!.pdf\nÄänitys #3.mp3',
      opts: [
        { k: 'sep', type: 'select', label: 'Välilyönnit korvataan', def: '-', opts: [['-', 'Viivalla -'], ['_', 'Alaviivalla _'], ['', 'Poistetaan']] },
        { k: 'pienet', type: 'check', label: 'Muunna pieniksi kirjaimiksi', def: true },
        { k: 'aakkoset', type: 'check', label: 'Korvaa ääkköset (ä → a)', def: true },
        { k: 'numeroi', type: 'check', label: 'Lisää juokseva numerointi', def: false }
      ],
      run: function (t, o) {
        var map = { 'ä': 'a', 'ö': 'o', 'å': 'a', 'é': 'e', 'ü': 'u', 'ß': 'ss' };
        var n = 0;
        var out = t.split('\n').filter(function (l) { return l.trim(); }).map(function (l) {
          n++;
          var ext = '', m = /\.(\w+)$/.exec(l.trim());
          if (m) { ext = '.' + m[1].toLowerCase(); }
          var base = l.trim().replace(/\.\w+$/, '');
          if (o.aakkoset) base = base.replace(/[äöåéüß]/gi, function (ch) { var low = ch.toLowerCase(); return map[low] || ch; });
          if (o.pienet) base = base.toLowerCase();
          base = base.replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, o.sep).replace(/^[-_]+|[-_]+$/g, '');
          return (o.numeroi ? String(n).padStart(3, '0') + (o.sep || '-') : '') + (base || 'tiedosto') + ext;
        });
        return { out: out.join('\n'), status: out.length + ' NIMEÄ', kind: 'ok' };
      },
      foot: function (c) { return c.note('Työkalu tuottaa siivotun nimilistan, jonka voit kopioida esimerkiksi massauudelleennimeämisohjelmaan. Selain ei voi nimetä koneesi tiedostoja uudelleen.', 'info'); }
    }
  });
})();
