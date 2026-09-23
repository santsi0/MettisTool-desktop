/* Moduuli: Kuvat */
(function () {
  'use strict';
  var R = MT.reg, h = MT.h;

  function loadImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { res({ img: img, url: url, file: file }); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Kuvaa ei voitu avata. Tuetut muodot: PNG, JPEG, WebP, GIF, BMP, SVG.')); };
      img.src = url;
    });
  }
  function canvasBlob(cv, mime, q) {
    return new Promise(function (res, rej) {
      cv.toBlob(function (b) { b ? res(b) : rej(new Error('Muunnos epäonnistui — selain ei tue muotoa ' + mime)); }, mime, q);
    });
  }
  function dropZone(c, onFile, accept, multi) {
    var z = h('div.drop', { tabindex: '0' }, [
      c.icon('i-upload', 'ic-lg'),
      h('b', { text: 'Pudota kuva tähän tai klikkaa valitaksesi' }),
      h('span', { text: accept || 'PNG · JPEG · WebP · GIF · BMP · SVG' })
    ]);
    z.addEventListener('click', function () { MT.pickFile(accept || 'image/*', multi).then(function (f) { if (f) onFile(f); }); });
    z.addEventListener('keydown', function (e) { if (e.key === 'Enter') z.click(); });
    ['dragenter', 'dragover'].forEach(function (e) { z.addEventListener(e, function (ev) { ev.preventDefault(); z.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (e) { z.addEventListener(e, function (ev) { ev.preventDefault(); z.classList.remove('over'); }); });
    z.addEventListener('drop', function (ev) {
      var fs = ev.dataTransfer.files;
      if (!fs.length) return;
      onFile(multi ? Array.prototype.slice.call(fs) : fs[0]);
    });
    return z;
  }

  /* Yleinen kuvatyökalun runko */
  function imgTool(cfg) {
    R({
      id: cfg.id, cat: 'kuvat', name: cfg.name, icon: cfg.icon || 'i-image', kind: 'custom',
      desc: cfg.desc, keys: cfg.keys,
      render: function (root, c) {
        var src = null, fields = cfg.opts || [];
        var optBox = fields.length ? c.fields(fields, function () { if (src) run(); }) : null;
        var info = h('div'), out = h('div', { style: { marginTop: '13px' } });
        var zone = dropZone(c, open, cfg.accept);
        function open(f) {
          loadImage(f).then(function (s) {
            src = s;
            MT.clear(info);
            info.appendChild(c.resList([
              { k: 'Tiedosto', v: f.name },
              { k: 'Mitat', v: s.img.naturalWidth + ' × ' + s.img.naturalHeight + ' px' },
              { k: 'Koko', v: MT.bytes(f.size) },
              { k: 'Tyyppi', v: f.type || 'tuntematon' },
              { k: 'Muokattu', v: f.lastModified ? new Date(f.lastModified).toLocaleString('fi-FI') : '–', copy: false }
            ]));
            if (cfg.onLoad) cfg.onLoad(s, optBox, c);
            run();
          }).catch(function (e) { MT.toast(e.message, 'err'); });
        }
        function run() {
          if (!src) return;
          var v = optBox ? c.readFields(optBox, fields) : {};
          MT.clear(out);
          var res;
          try { res = cfg.run(src, v, c); }
          catch (e) { out.appendChild(c.note(e.message, 'err')); return; }
          Promise.resolve(res).then(function (r) {
            if (!r) return;
            MT.clear(out);
            out.appendChild(r);
          }).catch(function (e) { MT.clear(out); out.appendChild(c.note(e.message, 'err')); });
        }
        root.appendChild(zone);
        root.appendChild(h('div', { style: { marginTop: '13px' } }, h('div.home-grid', null, [
          optBox ? c.panel('ASETUKSET', 'i-filter', h('div.panel-body', null, [optBox,
            h('div.btn-row', { style: { marginTop: '11px' } }, c.btn('Käsittele', { cls: 'btn-pri', icon: 'i-play', on: run }))])) : h('div'),
          c.panel('LÄHDEKUVA', 'i-info', info.childNodes.length ? info : h('div', null, info))
        ])));
        MT.clear(info); info.appendChild(c.empty('Ei kuvaa valittuna', 'Pudota kuva yläpuolelle aloittaaksesi.', 'i-image'));
        root.appendChild(out);
        root._open = open;
      }
    });
  }
  function resultPanel(c, title, blob, name, extraRows, previewURL) {
    var url = previewURL || URL.createObjectURL(blob);
    var img = h('img', { src: url, style: { maxWidth: '100%', maxHeight: '340px', display: 'block', borderRadius: '4px' } });
    return c.panel(title, 'i-image', h('div', null, [
      h('div.preview-box', null, img),
      extraRows ? c.resList(extraRows) : null,
      h('div.panel-foot', null, [
        c.btn('Lataa', { cls: 'btn-pri', icon: 'i-download', on: function () { MT.download(blob, name); } }),
        c.btn('Avaa uudessa välilehdessä', { icon: 'i-link', on: function () { window.open(url, '_blank'); } }),
        h('span.grow'),
        h('span.lbl', { text: MT.bytes(blob.size) })
      ])
    ]));
  }

  /* ---------- 1. Pakkaus ---------- */
  imgTool({
    id: 'kuvan-pakkaus', name: 'Kuvan pakkaus', desc: 'Pienennä kuvatiedoston kokoa laatua säätämällä. Kaikki tapahtuu selaimessasi.',
    keys: ['pakkaa', 'compress', 'optimoi', 'koko', 'jpeg'],
    opts: [
      { k: 'laatu', type: 'range', label: 'Laatu', def: 75, min: 10, max: 100, step: 1, suffix: ' %' },
      { k: 'muoto', type: 'select', label: 'Tallennusmuoto', def: 'image/webp', opts: [['image/webp', 'WebP (paras pakkaus)'], ['image/jpeg', 'JPEG'], ['image/png', 'PNG (häviötön)']] },
      { k: 'maxw', type: 'num', label: 'Enimmäisleveys (px, 0 = alkuperäinen)', def: '0' }
    ],
    run: function (s, o, c) {
      var w = s.img.naturalWidth, hh = s.img.naturalHeight;
      if (o.maxw > 0 && w > o.maxw) { hh = Math.round(hh * o.maxw / w); w = Math.round(o.maxw); }
      var cv = h('canvas'); cv.width = w; cv.height = hh;
      cv.getContext('2d').drawImage(s.img, 0, 0, w, hh);
      return canvasBlob(cv, o.muoto, o.laatu / 100).then(function (b) {
        var saved = 1 - b.size / s.file.size;
        return resultPanel(c, 'PAKATTU KUVA', b, s.file.name.replace(/\.\w+$/, '') + '-pakattu.' + o.muoto.split('/')[1], [
          { k: 'Alkuperäinen', v: MT.bytes(s.file.size) },
          { k: 'Pakattu', v: MT.bytes(b.size), big: true },
          { k: 'Säästö', v: (saved >= 0 ? '−' : '+') + Math.abs(saved * 100).toFixed(1).replace('.', ',') + ' %', big: true },
          { k: 'Mitat', v: w + ' × ' + hh + ' px' }
        ]);
      });
    }
  });

  /* ---------- 2. Koon muutos ---------- */
  imgTool({
    id: 'kuvan-koonmuutos', name: 'Kuvan koon muutos', desc: 'Muuta kuvan mittoja pikseleinä tai prosentteina kuvasuhde säilyttäen.',
    keys: ['koko', 'skaalaa', 'resize', 'mitat', 'pienennä'],
    opts: [
      { k: 'tapa', type: 'select', label: 'Tapa', def: 'px', opts: [['px', 'Pikselit'], ['pros', 'Prosentti'], ['sovita', 'Sovita laatikkoon']] },
      { k: 'w', type: 'num', label: 'Leveys', def: '1280' },
      { k: 'hh', type: 'num', label: 'Korkeus', def: '720' },
      { k: 'suhde', type: 'check', label: 'Säilytä kuvasuhde', def: true },
      { k: 'muoto', type: 'select', label: 'Muoto', def: 'image/png', opts: [['image/png', 'PNG'], ['image/jpeg', 'JPEG'], ['image/webp', 'WebP']] }
    ],
    onLoad: function (s, box) {
      var w = box.querySelector('[data-k="w"]'), hh = box.querySelector('[data-k="hh"]');
      if (w) w.value = s.img.naturalWidth;
      if (hh) hh.value = s.img.naturalHeight;
    },
    run: function (s, o, c) {
      var ow = s.img.naturalWidth, oh = s.img.naturalHeight, w, hgt;
      if (o.tapa === 'pros') { w = Math.round(ow * o.w / 100); hgt = Math.round(oh * o.w / 100); }
      else if (o.tapa === 'sovita') {
        var k = Math.min(o.w / ow, o.hh / oh);
        w = Math.round(ow * k); hgt = Math.round(oh * k);
      } else {
        w = Math.round(o.w) || ow;
        hgt = o.suhde ? Math.round(oh * w / ow) : (Math.round(o.hh) || oh);
      }
      if (w < 1 || hgt < 1 || w > 12000 || hgt > 12000) throw new Error('Mitat ovat sallitun välin 1–12000 px ulkopuolella');
      var cv = h('canvas'); cv.width = w; cv.height = hgt;
      var ctx = cv.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(s.img, 0, 0, w, hgt);
      return canvasBlob(cv, o.muoto, 0.92).then(function (b) {
        return resultPanel(c, 'MUUTETTU KUVA', b, s.file.name.replace(/\.\w+$/, '') + '-' + w + 'x' + hgt + '.' + o.muoto.split('/')[1], [
          { k: 'Alkuperäiset mitat', v: ow + ' × ' + oh + ' px' },
          { k: 'Uudet mitat', v: w + ' × ' + hgt + ' px', big: true },
          { k: 'Skaala', v: (w / ow * 100).toFixed(1).replace('.', ',') + ' %' },
          { k: 'Koko', v: MT.bytes(b.size) }
        ]);
      });
    }
  });

  /* ---------- 3. Rajaus ---------- */
  imgTool({
    id: 'kuvan-rajaus', name: 'Kuvan rajaus', desc: 'Rajaa kuva tarkoilla pikselikoordinaateilla tai valmiilla kuvasuhteella.',
    keys: ['rajaa', 'crop', 'leikkaa', 'kuvasuhde'],
    opts: [
      { k: 'suhde', type: 'select', label: 'Kuvasuhde', def: 'vapaa', opts: [['vapaa', 'Vapaa'], ['1', '1:1 neliö'], ['1.7778', '16:9'], ['1.3333', '4:3'], ['0.5625', '9:16 pysty'], ['0.8', '4:5 Instagram']] },
      { k: 'x', type: 'num', label: 'X-sijainti', def: '0' },
      { k: 'y', type: 'num', label: 'Y-sijainti', def: '0' },
      { k: 'w', type: 'num', label: 'Leveys', def: '800' },
      { k: 'hh', type: 'num', label: 'Korkeus', def: '600' }
    ],
    onLoad: function (s, box) {
      var m = Math.min(s.img.naturalWidth, s.img.naturalHeight);
      box.querySelector('[data-k="w"]').value = m;
      box.querySelector('[data-k="hh"]').value = m;
      box.querySelector('[data-k="x"]').value = Math.round((s.img.naturalWidth - m) / 2);
      box.querySelector('[data-k="y"]').value = Math.round((s.img.naturalHeight - m) / 2);
    },
    run: function (s, o, c) {
      var ow = s.img.naturalWidth, oh = s.img.naturalHeight;
      var x = Math.max(0, Math.round(o.x) || 0), y = Math.max(0, Math.round(o.y) || 0);
      var w = Math.round(o.w) || ow, hgt = Math.round(o.hh) || oh;
      if (o.suhde !== 'vapaa') hgt = Math.round(w / parseFloat(o.suhde));
      w = Math.min(w, ow - x); hgt = Math.min(hgt, oh - y);
      if (w < 1 || hgt < 1) throw new Error('Rajausalue on kuvan ulkopuolella');
      var cv = h('canvas'); cv.width = w; cv.height = hgt;
      cv.getContext('2d').drawImage(s.img, x, y, w, hgt, 0, 0, w, hgt);
      return canvasBlob(cv, 'image/png').then(function (b) {
        return resultPanel(c, 'RAJATTU KUVA', b, s.file.name.replace(/\.\w+$/, '') + '-rajattu.png', [
          { k: 'Rajaus', v: x + ',' + y + ' → ' + w + ' × ' + hgt + ' px', big: true },
          { k: 'Kuvasuhde', v: (w / hgt).toFixed(3).replace('.', ',') },
          { k: 'Osuus alkuperäisestä', v: ((w * hgt) / (ow * oh) * 100).toFixed(1).replace('.', ',') + ' %' }
        ]);
      });
    }
  });

  /* ---------- 4.–7. Muunnokset ---------- */
  function convTool(id, name, desc, keys, target, ext) {
    imgTool({
      id: id, name: name, desc: desc, keys: keys,
      opts: [{ k: 'laatu', type: 'range', label: 'Laatu (ei vaikuta PNG:hen)', def: 92, min: 10, max: 100, step: 1, suffix: ' %' },
        { k: 'tausta', type: 'color', label: 'Taustaväri läpinäkyvyydelle', def: '#ffffff' }],
      run: function (s, o, c) {
        var w = s.img.naturalWidth, hgt = s.img.naturalHeight;
        var cv = h('canvas'); cv.width = w; cv.height = hgt;
        var ctx = cv.getContext('2d');
        if (target === 'image/jpeg') { ctx.fillStyle = o.tausta || '#fff'; ctx.fillRect(0, 0, w, hgt); }
        ctx.drawImage(s.img, 0, 0);
        return canvasBlob(cv, target, o.laatu / 100).then(function (b) {
          return resultPanel(c, 'MUUNNETTU', b, s.file.name.replace(/\.\w+$/, '') + '.' + ext, [
            { k: 'Lähtömuoto', v: s.file.type || '–' },
            { k: 'Kohdemuoto', v: target, big: true },
            { k: 'Alkuperäinen koko', v: MT.bytes(s.file.size) },
            { k: 'Uusi koko', v: MT.bytes(b.size), big: true }
          ]);
        });
      }
    });
  }
  convTool('kuvamuunnin', 'Kuvamuunnin (WebP)', 'Muunna mikä tahansa kuva WebP-muotoon — pienin tiedostokoko verkkoon.', ['muunna', 'webp', 'convert'], 'image/webp', 'webp');
  convTool('png-jpg', 'PNG → JPG', 'Muunna PNG-kuva JPEG-muotoon ja valitse taustaväri läpinäkyville alueille.', ['png', 'jpg', 'jpeg', 'muunna'], 'image/jpeg', 'jpg');
  convTool('jpg-png', 'JPG → PNG', 'Muunna JPEG-kuva häviöttömään PNG-muotoon.', ['jpg', 'png', 'muunna', 'häviötön'], 'image/png', 'png');
  convTool('webp-muunnin', 'WebP → PNG', 'Muunna WebP-kuva laajasti tuettuun PNG-muotoon.', ['webp', 'png', 'muunna'], 'image/png', 'png');

  /* ---------- 8. SVG-optimoija ---------- */
  R({
    id: 'svg-optimoija', cat: 'kuvat', name: 'SVG-optimoija', icon: 'i-code', kind: 'io',
    desc: 'Poista SVG:stä kommentit, metatiedot ja turha tyhjätila sekä pyöristä koordinaatit.',
    keys: ['svg', 'optimoi', 'pienennä', 'vektori'],
    io: {
      inLabel: 'SVG-LÄHDE', outLabel: 'OPTIMOITU', lang: 'xml', ext: '.svg', mime: 'image/svg+xml', acceptExt: '.svg',
      sample: '<?xml version="1.0" encoding="UTF-8"?>\n<!-- Tehty piirto-ohjelmalla -->\n<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">\n  <metadata>Metatietoa</metadata>\n  <title>Ympyrä</title>\n  <circle cx="50.000000" cy="50.0000" r="40.123456789" fill="#FF0000" stroke="none"/>\n</svg>',
      opts: [{ k: 'des', type: 'num', label: 'Desimaaleja', def: '2' },
        { k: 'meta', type: 'check', label: 'Poista metadata, title ja desc', def: true },
        { k: 'tyhja', type: 'check', label: 'Tiivistä tyhjätila', def: true }],
      run: function (t, o) {
        var s = t, before = new Blob([t]).size;
        s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[^>]*\?>/g, '');
        if (o.meta) s = s.replace(/<(metadata|title|desc)[\s\S]*?<\/\1>/gi, '').replace(/\s(sodipodi|inkscape|xmlns:(sodipodi|inkscape|dc|cc|rdf))[^\s=]*="[^"]*"/g, '');
        var d = Math.max(0, Math.min(6, Math.round(o.des)));
        s = s.replace(/-?\d+\.\d+/g, function (m2) { return String(+parseFloat(m2).toFixed(d)); });
        if (o.tyhja) s = s.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').replace(/\s+\/>/g, '/>').trim();
        var after = new Blob([s]).size;
        return { out: s, status: 'OPTIMOITU', kind: 'ok',
          meta: [['ENNEN', MT.bytes(before)], ['JÄLKEEN', MT.bytes(after)], ['SÄÄSTÖ', (100 - after / before * 100).toFixed(1).replace('.', ',') + ' %']] };
      }
    }
  });

  /* ---------- 9. SVG-katselin ---------- */
  R({
    id: 'svg-katselin', cat: 'kuvat', name: 'SVG-katselin', icon: 'i-image', kind: 'custom',
    desc: 'Esikatsele SVG-koodia reaaliajassa ja lataa se PNG-kuvana.',
    keys: ['svg', 'katselin', 'esikatselu', 'vektori', 'png'],
    render: function (root, c) {
      var ed = c.editor({ label: 'SVG-KOODI', onInput: MT.debounce(upd, 250), drop: function (f) { MT.readFile(f).then(function (t) { ed.set(t); upd(); }); } });
      ed.el.style.minHeight = '360px';
      var prev = h('div.preview-box', { style: { minHeight: '300px' } });
      var box = h('div.ed', null, [
        h('div.ed-head', null, [c.lbl('ESIKATSELU'), h('span.grow'),
          c.btn('PNG ×1', { cls: 'btn-gh btn-sm', on: function () { toPng(1); } }),
          c.btn('PNG ×4', { cls: 'btn-gh btn-sm', on: function () { toPng(4); } })]),
        prev
      ]);
      box.style.minHeight = '360px';
      var sb = c.statusbar([]);
      function upd() {
        var t = ed.get();
        MT.clear(prev);
        if (!t.trim()) { prev.appendChild(c.empty('Ei sisältöä', 'Liitä SVG-koodi vasemmalle.')); sb.set([]); return; }
        var doc = new DOMParser().parseFromString(t, 'image/svg+xml');
        if (doc.querySelector('parsererror')) { prev.appendChild(c.note('SVG ei ole validi XML.', 'err')); return; }
        var svg = doc.documentElement;
        svg.style.maxWidth = '100%'; svg.style.maxHeight = '300px';
        prev.appendChild(document.importNode(svg, true));
        sb.set([{ k: '', v: 'VALIDI SVG', kind: 'ok', dot: true },
          { k: 'KOKO', v: MT.bytes(new Blob([t]).size) },
          { k: 'ELEMENTIT', v: doc.querySelectorAll('*').length },
          { k: 'VIEWBOX', v: svg.getAttribute('viewBox') || '–' }]);
      }
      function toPng(scale) {
        var t = ed.get();
        var doc = new DOMParser().parseFromString(t, 'image/svg+xml');
        var svg = doc.documentElement;
        var vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
        var w = parseFloat(svg.getAttribute('width')) || vb[2] || 512;
        var hgt = parseFloat(svg.getAttribute('height')) || vb[3] || 512;
        var blob = new Blob([t], { type: 'image/svg+xml;charset=utf-8' });
        var url = URL.createObjectURL(blob), img = new Image();
        img.onload = function () {
          var cv = h('canvas'); cv.width = w * scale; cv.height = hgt * scale;
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          cv.toBlob(function (b) { MT.download(b, 'kuva-' + cv.width + 'x' + cv.height + '.png'); URL.revokeObjectURL(url); }, 'image/png');
        };
        img.onerror = function () { MT.toast('PNG-muunnos epäonnistui', 'err'); URL.revokeObjectURL(url); };
        img.src = url;
      }
      ed.set('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">\n  <rect width="120" height="120" rx="12" fill="#101217"/>\n  <circle cx="60" cy="60" r="34" fill="none" stroke="#E8323C" stroke-width="4"/>\n  <path d="M46 60h28M60 46v28" stroke="#E8EAF0" stroke-width="4" stroke-linecap="round"/>\n</svg>');
      root.appendChild(c.split(ed.el, box));
      root.appendChild(sb);
      upd();
    }
  });

  /* ---------- 10. Kuva → Base64 ---------- */
  R({
    id: 'kuva-base64', cat: 'kuvat', name: 'Kuva → Base64', icon: 'i-code', kind: 'custom',
    desc: 'Muunna kuva data-URL-muotoon CSS:ää tai HTML:ää varten.',
    keys: ['base64', 'data-url', 'kuva', 'upota'],
    render: function (root, c) {
      var out = h('div', { style: { marginTop: '13px' } });
      root.appendChild(dropZone(c, function (f) {
        if (f.size > 4e6) { MT.toast('Kuva on suuri (yli 4 MB) — data-URL kasvaa noin kolmanneksen.', 'warn'); }
        MT.readFile(f, 'url').then(function (url) {
          MT.clear(out);
          var css = 'background-image: url("' + url + '");';
          var html2 = '<img src="' + url + '" alt="' + f.name.replace(/\.\w+$/, '') + '">';
          out.appendChild(c.panel('ESIKATSELU', 'i-image', h('div', null, [
            h('div.preview-box', null, h('img', { src: url, style: { maxWidth: '100%', maxHeight: '240px' } })),
            c.resList([
              { k: 'Tiedosto', v: f.name },
              { k: 'Alkuperäinen koko', v: MT.bytes(f.size) },
              { k: 'Data-URL:n pituus', v: MT.num(url.length) + ' merkkiä', big: true },
              { k: 'Kasvu', v: '+' + ((url.length / f.size - 1) * 100).toFixed(0) + ' %' }
            ])
          ])));
          [['DATA-URL', url], ['HTML', html2], ['CSS', css]].forEach(function (p) {
            out.appendChild(h('div', { style: { marginTop: '11px' } }, c.panel(p[0], 'i-code', h('div', null, [
              h('pre.ed-out', { text: p[1].length > 4000 ? p[1].slice(0, 4000) + '\n… (katkaistu näytöstä, kopiointi sisältää kaiken)' : p[1], style: { padding: '11px', maxHeight: '160px' } }),
              h('div.panel-foot', null, [c.btn('Kopioi', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(p[1]); } })])
            ]))));
          });
        });
      }));
      root.appendChild(out);
      MT.clear(out); out.appendChild(c.empty('Ei kuvaa', 'Pudota kuva yläpuolelle.', 'i-image'));
    }
  });

  /* ---------- 11. Base64 → kuva ---------- */
  R({
    id: 'base64-kuva', cat: 'kuvat', name: 'Base64 → kuva', icon: 'i-image', kind: 'custom',
    desc: 'Näytä ja tallenna data-URL- tai Base64-muotoinen kuva.',
    keys: ['base64', 'data-url', 'kuva', 'pura'],
    render: function (root, c) {
      var ta = h('textarea.ctl', { rows: 6, placeholder: 'data:image/png;base64,iVBORw0KGgo…', spellcheck: 'false' });
      var out = h('div', { style: { marginTop: '13px' } });
      function upd() {
        MT.clear(out);
        var t = ta.value.trim();
        if (!t) { out.appendChild(c.empty('Ei sisältöä', 'Liitä data-URL tai pelkkä Base64-merkkijono.')); return; }
        var url = /^data:/.test(t) ? t : 'data:image/png;base64,' + t.replace(/\s/g, '');
        var img = h('img', { src: url, style: { maxWidth: '100%', maxHeight: '340px' } });
        img.onerror = function () { MT.clear(out); out.appendChild(c.note('Sisältöä ei voitu tulkita kuvaksi. Tarkista että Base64 on kokonainen.', 'err')); };
        img.onload = function () {
          var mime = (/^data:([^;]+)/.exec(url) || [, 'image/png'])[1];
          MT.clear(out);
          out.appendChild(c.panel('KUVA', 'i-image', h('div', null, [
            h('div.preview-box', null, img),
            c.resList([
              { k: 'Mitat', v: img.naturalWidth + ' × ' + img.naturalHeight + ' px', big: true },
              { k: 'MIME-tyyppi', v: mime },
              { k: 'Arvioitu koko', v: MT.bytes(Math.round(url.length * 0.75)) }
            ]),
            h('div.panel-foot', null, c.btn('Lataa kuva', { cls: 'btn-pri', icon: 'i-download', on: function () {
              fetch(url).then(function (r) { return r.blob(); }).then(function (b) { MT.download(b, 'kuva.' + mime.split('/')[1]); });
            } }))
          ])));
        };
        out.appendChild(h('div', { style: { display: 'none' } }, img));
      }
      ta.addEventListener('input', MT.debounce(upd, 300));
      root.appendChild(c.panel('BASE64-SYÖTE', 'i-code', h('div.panel-body', null, ta)));
      root.appendChild(out);
      upd();
    }
  });

  /* ---------- 12. Värinvalitsin kuvasta ---------- */
  R({
    id: 'kuvan-varivalitsin', cat: 'kuvat', name: 'Värinpoiminta kuvasta', icon: 'i-palette', kind: 'custom',
    desc: 'Klikkaa kuvaa ja poimi tarkka väri HEX-, RGB- ja HSL-muodossa.',
    keys: ['väri', 'poimi', 'pipetti', 'hex', 'kuva'],
    render: function (root, c) {
      var cv = h('canvas', { style: { maxWidth: '100%', cursor: 'crosshair', borderRadius: '4px' } });
      var picked = h('div'), hist = [];
      var box = h('div.preview-box', { style: { minHeight: '200px' } });
      box.appendChild(c.empty('Ei kuvaa', 'Pudota kuva yläpuolelle.', 'i-image'));
      function open(f) {
        loadImage(f).then(function (s) {
          var w = Math.min(s.img.naturalWidth, 1400), hgt = Math.round(s.img.naturalHeight * w / s.img.naturalWidth);
          cv.width = w; cv.height = hgt;
          cv.getContext('2d').drawImage(s.img, 0, 0, w, hgt);
          MT.clear(box); box.appendChild(cv);
        }).catch(function (e) { MT.toast(e.message, 'err'); });
      }
      cv.addEventListener('click', function (e) {
        var r = cv.getBoundingClientRect();
        var x = Math.floor((e.clientX - r.left) * cv.width / r.width);
        var y = Math.floor((e.clientY - r.top) * cv.height / r.height);
        var d = cv.getContext('2d').getImageData(x, y, 1, 1).data;
        var hex = '#' + [d[0], d[1], d[2]].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
        hist.unshift({ hex: hex, rgb: d, x: x, y: y }); hist = hist.slice(0, 12);
        show();
      });
      function show() {
        MT.clear(picked);
        if (!hist.length) { picked.appendChild(c.empty('Ei poimittuja värejä', 'Klikkaa kuvaa poimiaksesi värin.', 'i-palette')); return; }
        var p = hist[0], d = p.rgb;
        var hsl = MT.rgb2hsl ? MT.rgb2hsl(d[0], d[1], d[2]) : null;
        picked.appendChild(h('div', { style: { height: '70px', background: p.hex, borderBottom: '1px solid var(--bd)' } }));
        picked.appendChild(c.resList([
          { k: 'HEX', v: p.hex.toUpperCase(), big: true },
          { k: 'RGB', v: 'rgb(' + d[0] + ', ' + d[1] + ', ' + d[2] + ')' },
          { k: 'HSL', v: hsl ? 'hsl(' + Math.round(hsl[0]) + ', ' + Math.round(hsl[1]) + '%, ' + Math.round(hsl[2]) + '%)' : '–' },
          { k: 'Läpinäkyvyys', v: (d[3] / 255 * 100).toFixed(0) + ' %' },
          { k: 'Sijainti', v: p.x + ', ' + p.y + ' px', copy: false }
        ]));
        var sw = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '5px', padding: '11px' } });
        hist.forEach(function (x) {
          sw.appendChild(h('button', { style: { width: '26px', height: '26px', background: x.hex, border: '1px solid var(--bd)', borderRadius: '3px', cursor: 'pointer' }, title: x.hex, onclick: function () { MT.copy(x.hex); } }));
        });
        picked.appendChild(sw);
      }
      root.appendChild(dropZone(c, open));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, h('div.home-grid', null, [
        c.panel('KUVA', 'i-image', box),
        c.panel('POIMITTU VÄRI', 'i-palette', picked)
      ])));
      show();
    }
  });

  /* ---------- 13. Palettigeneraattori ---------- */
  R({
    id: 'varipaletin-poiminta', cat: 'kuvat', name: 'Väripaletin poiminta', icon: 'i-palette', kind: 'custom',
    desc: 'Poimi kuvan hallitsevat värit valmiiksi paletiksi.',
    keys: ['paletti', 'värit', 'poimi', 'dominantti'],
    render: function (root, c) {
      var out = h('div', { style: { marginTop: '13px' } });
      function open(f) {
        loadImage(f).then(function (s) {
          var w = 120, hgt = Math.max(1, Math.round(s.img.naturalHeight * w / s.img.naturalWidth));
          var cv = h('canvas'); cv.width = w; cv.height = hgt;
          var ctx = cv.getContext('2d');
          ctx.drawImage(s.img, 0, 0, w, hgt);
          var data = ctx.getImageData(0, 0, w, hgt).data;
          var buckets = {};
          for (var i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 128) continue;
            var key = (data[i] >> 4) + ',' + (data[i + 1] >> 4) + ',' + (data[i + 2] >> 4);
            var b = buckets[key] || (buckets[key] = { n: 0, r: 0, g: 0, b: 0 });
            b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2];
          }
          var list = Object.keys(buckets).map(function (k) { return buckets[k]; })
            .sort(function (a, b2) { return b2.n - a.n; }).slice(0, 10)
            .map(function (b2) {
              return { n: b2.n, hex: '#' + [Math.round(b2.r / b2.n), Math.round(b2.g / b2.n), Math.round(b2.b / b2.n)].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('') };
            });
          var total = list.reduce(function (a, x) { return a + x.n; }, 0);
          MT.clear(out);
          var grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: '8px', padding: '11px' } });
          list.forEach(function (x) {
            grid.appendChild(h('button.swatch', { style: { background: x.hex, height: '72px' }, title: 'Kopioi ' + x.hex, onclick: function () { MT.copy(x.hex); } },
              h('span', { text: x.hex.toUpperCase() + '  ·  ' + (x.n / total * 100).toFixed(1).replace('.', ',') + ' %' })));
          });
          out.appendChild(c.panel('PALETTI', 'i-palette', h('div', null, [
            h('div.preview-box', { style: { padding: '11px' } }, h('img', { src: s.url, style: { maxWidth: '100%', maxHeight: '220px', borderRadius: '4px' } })),
            grid,
            h('div.panel-foot', null, [
              c.btn('Kopioi CSS-muuttujat', { cls: 'btn-sm', icon: 'i-copy', on: function () {
                MT.copy(':root {\n' + list.map(function (x, i) { return '  --vari-' + (i + 1) + ': ' + x.hex + ';'; }).join('\n') + '\n}');
              } }),
              c.btn('Kopioi lista', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(list.map(function (x) { return x.hex; }).join('\n')); } })
            ])
          ])));
        }).catch(function (e) { MT.toast(e.message, 'err'); });
      }
      root.appendChild(dropZone(c, open));
      root.appendChild(out);
      MT.clear(out); out.appendChild(c.empty('Ei kuvaa', 'Pudota kuva yläpuolelle.', 'i-image'));
    }
  });

  /* ---------- EXIF ---------- */
  function readExif(buf) {
    var dv = new DataView(buf);
    if (dv.getUint16(0) !== 0xFFD8) return null;
    var off = 2;
    while (off < dv.byteLength - 4) {
      if (dv.getUint8(off) !== 0xFF) break;
      var marker = dv.getUint8(off + 1), len = dv.getUint16(off + 2);
      if (marker === 0xE1) {
        var str = '';
        for (var i = 0; i < 4; i++) str += String.fromCharCode(dv.getUint8(off + 4 + i));
        if (str === 'Exif') return parseTiff(dv, off + 10);
      }
      if (marker === 0xDA) break;
      off += 2 + len;
    }
    return null;
  }
  var TAGS = {
    0x010F: 'Valmistaja', 0x0110: 'Kameran malli', 0x0112: 'Orientaatio', 0x011A: 'X-resoluutio', 0x011B: 'Y-resoluutio',
    0x0131: 'Ohjelmisto', 0x0132: 'Muokkausaika', 0x013B: 'Tekijä', 0x8298: 'Tekijänoikeus',
    0x829A: 'Valotusaika', 0x829D: 'Aukko (F)', 0x8822: 'Valotusohjelma', 0x8827: 'ISO-herkkyys',
    0x9003: 'Kuvausaika', 0x9004: 'Digitointiaika', 0x9201: 'Suljinaika', 0x9202: 'Aukkoarvo',
    0x9204: 'Valotuskorjaus', 0x9207: 'Mittaustapa', 0x9209: 'Salama', 0x920A: 'Polttoväli',
    0xA002: 'Leveys (px)', 0xA003: 'Korkeus (px)', 0xA405: 'Polttoväli (35 mm)', 0xA430: 'Kameran omistaja',
    0xA431: 'Sarjanumero', 0xA432: 'Objektiivi', 0xA434: 'Objektiivin malli'
  };
  var GPS_TAGS = { 1: 'Leveysaste (suunta)', 2: 'Leveysaste', 3: 'Pituusaste (suunta)', 4: 'Pituusaste', 6: 'Korkeus' };
  function parseTiff(dv, start) {
    var le = dv.getUint16(start) === 0x4949;
    if (dv.getUint16(start + 2, le) !== 42) return null;
    var out = {}, gps = {};
    function dir(offset, tags, target) {
      var n = dv.getUint16(offset, le);
      for (var i = 0; i < n; i++) {
        var e = offset + 2 + i * 12, tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le), cnt = dv.getUint32(e + 4, le);
        var sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }, sz = (sizes[type] || 1) * cnt;
        var vo = sz > 4 ? start + dv.getUint32(e + 8, le) : e + 8;
        if (vo + sz > dv.byteLength) continue;
        var val;
        if (type === 2) { val = ''; for (var k = 0; k < cnt - 1; k++) val += String.fromCharCode(dv.getUint8(vo + k)); val = val.trim(); }
        else if (type === 3) val = dv.getUint16(vo, le);
        else if (type === 4) val = dv.getUint32(vo, le);
        else if (type === 5 || type === 10) {
          var vals = [];
          for (k = 0; k < cnt; k++) {
            var nmr = type === 5 ? dv.getUint32(vo + k * 8, le) : dv.getInt32(vo + k * 8, le);
            var den = type === 5 ? dv.getUint32(vo + k * 8 + 4, le) : dv.getInt32(vo + k * 8 + 4, le);
            vals.push(den ? nmr / den : 0);
          }
          val = cnt === 1 ? vals[0] : vals;
        } else if (type === 1) val = dv.getUint8(vo);
        else continue;
        if (tag === 0x8769) { dir(start + val, TAGS, out); continue; }
        if (tag === 0x8825) { dir(start + val, GPS_TAGS, gps); continue; }
        if (tags[tag]) target[tags[tag]] = val;
      }
    }
    dir(start + dv.getUint32(start + 4, le), TAGS, out);
    return { exif: out, gps: gps };
  }
  R({
    id: 'exif-katselin', cat: 'kuvat', name: 'EXIF-katselin', icon: 'i-info', kind: 'custom',
    desc: 'Lue JPEG-kuvan EXIF-metatiedot: kamera, asetukset, aika ja sijainti.',
    keys: ['exif', 'metatiedot', 'kamera', 'gps', 'jpeg'],
    render: function (root, c) {
      var out = h('div', { style: { marginTop: '13px' } });
      function open(f) {
        MT.readFile(f, 'buf').then(function (buf) {
          MT.clear(out);
          var res;
          try { res = readExif(buf); } catch (e) { res = null; }
          out.appendChild(c.panel('TIEDOSTO', 'i-file', c.resList([
            { k: 'Nimi', v: f.name }, { k: 'Koko', v: MT.bytes(f.size) }, { k: 'Tyyppi', v: f.type || '–' },
            { k: 'Muokattu', v: new Date(f.lastModified).toLocaleString('fi-FI'), copy: false }
          ])));
          if (!res || !Object.keys(res.exif).length) {
            out.appendChild(h('div', { style: { marginTop: '11px' } },
              c.note('Kuvasta ei löytynyt EXIF-metatietoja. PNG-, WebP- ja monet muokatut JPEG-kuvat eivät sisällä niitä — myös sosiaalisen median palvelut poistavat ne yleensä.', 'info')));
            return;
          }
          var rows = Object.keys(res.exif).map(function (k) {
            var v = res.exif[k];
            if (k === 'Valotusaika' && v < 1) v = '1/' + Math.round(1 / v) + ' s';
            else if (k === 'Polttoväli') v = v + ' mm';
            else if (k === 'Aukko (F)') v = 'f/' + v;
            else if (k === 'Orientaatio') v = ['', 'normaali', 'peilattu vaaka', '180°', 'peilattu pysty', 'peilattu 90° CW', '90° CW', 'peilattu 90° CCW', '90° CCW'][v] || v;
            return { k: k, v: String(v) };
          });
          out.appendChild(h('div', { style: { marginTop: '11px' } }, c.panel('EXIF-TIEDOT', 'i-info', c.resList(rows))));
          if (Object.keys(res.gps).length) {
            var lat = res.gps['Leveysaste'], lon = res.gps['Pituusaste'];
            var dec = function (a, ref) { return Array.isArray(a) ? (a[0] + a[1] / 60 + a[2] / 3600) * (/[SW]/.test(ref) ? -1 : 1) : a; };
            var la = dec(lat, res.gps['Leveysaste (suunta)']), lo = dec(lon, res.gps['Pituusaste (suunta)']);
            out.appendChild(h('div', { style: { marginTop: '11px' } }, c.panel('SIJAINTI', 'i-globe', h('div', null, [
              c.resList([{ k: 'Koordinaatit', v: isFinite(la) ? la.toFixed(6) + ', ' + lo.toFixed(6) : '–', big: true }]),
              c.note('<b>Huomio:</b> kuva sisältää GPS-sijainnin. Poista metatiedot ennen julkaisua EXIF-poistotyökalulla.', 'warn')
            ]))));
          }
        });
      }
      root.appendChild(dropZone(c, open, 'image/jpeg,image/*'));
      root.appendChild(out);
      MT.clear(out); out.appendChild(c.empty('Ei kuvaa', 'Pudota JPEG-kuva yläpuolelle.', 'i-image'));
    }
  });

  imgTool({
    id: 'exif-poisto', name: 'EXIF-metatietojen poisto', icon: 'i-shield',
    desc: 'Poista kuvan metatiedot piirtämällä se uudelleen. Sijainti, kameratiedot ja aikaleimat katoavat.',
    keys: ['exif', 'metatiedot', 'poista', 'yksityisyys', 'gps'],
    opts: [{ k: 'muoto', type: 'select', label: 'Tallennusmuoto', def: 'image/jpeg', opts: [['image/jpeg', 'JPEG'], ['image/png', 'PNG'], ['image/webp', 'WebP']] },
      { k: 'laatu', type: 'range', label: 'Laatu', def: 92, min: 40, max: 100, step: 1, suffix: ' %' }],
    run: function (s, o, c) {
      var cv = h('canvas'); cv.width = s.img.naturalWidth; cv.height = s.img.naturalHeight;
      var ctx = cv.getContext('2d');
      if (o.muoto === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); }
      ctx.drawImage(s.img, 0, 0);
      return canvasBlob(cv, o.muoto, o.laatu / 100).then(function (b) {
        return resultPanel(c, 'PUHDISTETTU KUVA', b, s.file.name.replace(/\.\w+$/, '') + '-puhdas.' + o.muoto.split('/')[1], [
          { k: 'Metatiedot', v: 'poistettu kokonaan', big: true },
          { k: 'Mitat', v: cv.width + ' × ' + cv.height + ' px' },
          { k: 'Alkuperäinen koko', v: MT.bytes(s.file.size) },
          { k: 'Uusi koko', v: MT.bytes(b.size) }
        ]);
      });
    }
  });

  /* ---------- Favicon ---------- */
  R({
    id: 'favicon-generaattori', cat: 'kuvat', name: 'Favicon-generaattori', icon: 'i-grid', kind: 'custom',
    desc: 'Luo faviconit kaikissa tarvittavissa koissa ja valmis HTML-koodi.',
    keys: ['favicon', 'ikoni', 'sivusto', 'apple-touch'],
    render: function (root, c) {
      var SIZES = [16, 32, 48, 64, 96, 128, 180, 192, 256, 512];
      var out = h('div', { style: { marginTop: '13px' } });
      function open(f) {
        loadImage(f).then(function (s) {
          MT.clear(out);
          var grid = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '11px', padding: '13px', alignItems: 'flex-end' } });
          var blobs = [];
          SIZES.forEach(function (sz) {
            var cv = h('canvas'); cv.width = cv.height = sz;
            var ctx = cv.getContext('2d');
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(s.img, 0, 0, sz, sz);
            cv.style.width = Math.min(sz, 96) + 'px'; cv.style.height = Math.min(sz, 96) + 'px';
            cv.style.border = '1px solid var(--bd)'; cv.style.borderRadius = '3px'; cv.style.imageRendering = sz <= 48 ? 'pixelated' : 'auto';
            grid.appendChild(h('div', { style: { textAlign: 'center' } }, [cv, h('div.lbl', { text: sz + '×' + sz, style: { marginTop: '5px' } })]));
            cv.toBlob(function (b) { blobs.push({ sz: sz, b: b }); }, 'image/png');
          });
          var html2 = ['<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
            '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
            '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
            '<link rel="manifest" href="/site.webmanifest">'].join('\n');
          out.appendChild(c.panel('IKONIT', 'i-grid', h('div', null, [grid,
            h('div.panel-foot', null, [
              c.btn('Lataa kaikki', { cls: 'btn-pri', icon: 'i-download', on: function () {
                blobs.sort(function (a, b) { return a.sz - b.sz; }).forEach(function (x, i) {
                  setTimeout(function () { MT.download(x.b, 'favicon-' + x.sz + 'x' + x.sz + '.png'); }, i * 320);
                });
              } }),
              h('span.grow'), h('span.lbl', { text: SIZES.length + ' KOKOA' })
            ])])));
          out.appendChild(h('div', { style: { marginTop: '11px' } }, c.panel('HTML-KOODI', 'i-code', h('div', null, [
            h('pre.ed-out', { text: html2, style: { padding: '11px' } }),
            h('div.panel-foot', null, c.btn('Kopioi', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(html2); } }))
          ]))));
        }).catch(function (e) { MT.toast(e.message, 'err'); });
      }
      root.appendChild(dropZone(c, open, 'image/*'));
      root.appendChild(out);
      MT.clear(out); out.appendChild(c.empty('Ei kuvaa', 'Käytä mieluiten neliönmuotoista kuvaa, vähintään 512×512 px.', 'i-image'));
    }
  });

  /* ---------- QR ---------- */
  R({
    id: 'qr-generaattori', cat: 'kuvat', name: 'QR-koodin luonti', icon: 'i-grid', kind: 'custom',
    desc: 'Luo QR-koodi osoitteesta, tekstistä, wifistä tai yhteystiedosta. Lataa PNG tai SVG.',
    keys: ['qr', 'koodi', 'viivakoodi', 'wifi', 'vcard'],
    render: function (root, c) {
      var F = [
        { k: 'tyyppi', type: 'select', label: 'Koodin tyyppi', def: 'teksti', opts: [['teksti', 'Teksti tai URL'], ['wifi', 'WiFi-verkko'], ['vcard', 'Yhteystieto'], ['sposti', 'Sähköposti'], ['sms', 'Tekstiviesti'], ['geo', 'Sijainti']] },
        { k: 'data', type: 'textarea', label: 'Sisältö', def: 'https://mettistool.fi', rows: 3 },
        { k: 'taso', type: 'select', label: 'Virheenkorjaus', def: 'M', opts: [['L', 'L — 7 %'], ['M', 'M — 15 % (suositus)'], ['Q', 'Q — 25 %'], ['H', 'H — 30 % (logolle)']] },
        { k: 'koko', type: 'range', label: 'Moduulin koko', def: 8, min: 2, max: 20, step: 1, suffix: ' px' },
        { k: 'fg', type: 'color', label: 'Edusta', def: '#000000' },
        { k: 'bg', type: 'color', label: 'Tausta', def: '#ffffff' }
      ];
      var extra = h('div.fields', { style: { marginTop: '11px' } });
      var box = c.fields(F, upd), out = h('div', { style: { marginTop: '13px' } });
      var EXTRA = {
        wifi: [{ k: 'ssid', type: 'text', label: 'Verkon nimi (SSID)', def: 'Kotiverkko' },
          { k: 'salasana', type: 'text', label: 'Salasana', def: '' },
          { k: 'salaus', type: 'select', label: 'Salaus', def: 'WPA', opts: [['WPA', 'WPA/WPA2/WPA3'], ['WEP', 'WEP'], ['nopass', 'Avoin verkko']] }],
        vcard: [{ k: 'nimi', type: 'text', label: 'Nimi', def: 'Matti Meikäläinen' },
          { k: 'puh', type: 'text', label: 'Puhelin', def: '+358401234567' },
          { k: 'email', type: 'text', label: 'Sähköposti', def: 'matti@esimerkki.fi' },
          { k: 'org', type: 'text', label: 'Organisaatio', def: '' }],
        sposti: [{ k: 'email', type: 'text', label: 'Vastaanottaja', def: 'tuki@esimerkki.fi' },
          { k: 'aihe', type: 'text', label: 'Aihe', def: '' }],
        sms: [{ k: 'puh', type: 'text', label: 'Numero', def: '+358401234567' },
          { k: 'viesti', type: 'text', label: 'Viesti', def: '' }],
        geo: [{ k: 'lat', type: 'num', label: 'Leveysaste', def: '60,1699' },
          { k: 'lon', type: 'num', label: 'Pituusaste', def: '24,9384' }]
      };
      function buildExtra() {
        var t = box.querySelector('[data-k="tyyppi"]').value;
        MT.clear(extra);
        (EXTRA[t] || []).forEach(function (f) { extra.appendChild(c.field(f, upd)); });
        var dataField = box.querySelector('[data-k="data"]');
        dataField.closest('.field').style.display = t === 'teksti' ? '' : 'none';
      }
      function payload() {
        var v = c.readFields(box, F), e = {};
        (EXTRA[v.tyyppi] || []).forEach(function (f) {
          var el = extra.querySelector('[data-k="' + f.k + '"]');
          e[f.k] = el ? el.value : f.def;
        });
        if (v.tyyppi === 'wifi') return 'WIFI:T:' + e.salaus + ';S:' + (e.ssid || '') + ';P:' + (e.salasana || '') + ';;';
        if (v.tyyppi === 'vcard') return 'BEGIN:VCARD\nVERSION:3.0\nN:' + (e.nimi || '') + '\nFN:' + (e.nimi || '') +
          (e.org ? '\nORG:' + e.org : '') + (e.puh ? '\nTEL:' + e.puh : '') + (e.email ? '\nEMAIL:' + e.email : '') + '\nEND:VCARD';
        if (v.tyyppi === 'sposti') return 'mailto:' + (e.email || '') + (e.aihe ? '?subject=' + encodeURIComponent(e.aihe) : '');
        if (v.tyyppi === 'sms') return 'SMSTO:' + (e.puh || '') + ':' + (e.viesti || '');
        if (v.tyyppi === 'geo') return 'geo:' + String(e.lat).replace(',', '.') + ',' + String(e.lon).replace(',', '.');
        return v.data || '';
      }
      function upd() {
        buildExtraIfNeeded();
        var v = c.readFields(box, F), data = payload();
        MT.clear(out);
        if (!data) { out.appendChild(c.empty('Ei sisältöä', 'Syötä teksti tai osoite.')); return; }
        var qr;
        try { qr = QR.encode(data, v.taso); }
        catch (e) { out.appendChild(c.note(e.message, 'err')); return; }
        var cv = h('canvas');
        QR.draw(qr, cv, { scale: v.koko, fg: v.fg, bg: v.bg });
        cv.style.maxWidth = '100%'; cv.style.imageRendering = 'pixelated'; cv.style.borderRadius = '4px';
        var svgStr = QR.svg(qr, { fg: v.fg, bg: v.bg });
        out.appendChild(c.panel('QR-KOODI', 'i-grid', h('div', null, [
          h('div.preview-box', null, cv),
          c.resList([
            { k: 'Versio', v: qr.version + ' (' + qr.size + '×' + qr.size + ' moduulia)', copy: false },
            { k: 'Virheenkorjaus', v: qr.level, copy: false },
            { k: 'Sisällön pituus', v: new Blob([data]).size + ' tavua', copy: false },
            { k: 'Sisältö', v: data.length > 120 ? data.slice(0, 120) + '…' : data }
          ]),
          h('div.panel-foot', null, [
            c.btn('Lataa PNG', { cls: 'btn-pri', icon: 'i-download', on: function () { cv.toBlob(function (b) { MT.download(b, 'qr-koodi.png'); }); } }),
            c.btn('Lataa SVG', { icon: 'i-download', on: function () { MT.download(svgStr, 'qr-koodi.svg', 'image/svg+xml'); } }),
            c.btn('Kopioi sisältö', { icon: 'i-copy', on: function () { MT.copy(data); } })
          ])
        ])));
      }
      var built = false;
      function buildExtraIfNeeded() { if (!built) { built = true; buildExtra(); } }
      box.querySelector('[data-k="tyyppi"]').addEventListener('change', function () { buildExtra(); upd(); });
      root.appendChild(c.panel('SISÄLTÖ', 'i-grid', h('div.panel-body', null, [box, extra])));
      root.appendChild(out);
      buildExtra();
      upd();
    }
  });

  /* ---------- Kuvakaappaus ---------- */
  R({
    id: 'kuvakaappaus', cat: 'kuvat', name: 'Kuvakaappaustyökalu', icon: 'i-monitor', kind: 'custom',
    desc: 'Ota kuvakaappaus näytöstä, ikkunasta tai selainvälilehdestä ja tallenna PNG-kuvana.',
    keys: ['kuvakaappaus', 'screenshot', 'näyttö', 'tallenna'],
    render: function (root, c) {
      var out = h('div', { style: { marginTop: '13px' } });
      function shot() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          MT.toast('Selaimesi ei tue näytön jakamista', 'err'); return;
        }
        navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false }).then(function (stream) {
          var video = document.createElement('video');
          video.srcObject = stream; video.muted = true;
          video.onloadedmetadata = function () {
            video.play();
            setTimeout(function () {
              var cv = h('canvas');
              cv.width = video.videoWidth; cv.height = video.videoHeight;
              cv.getContext('2d').drawImage(video, 0, 0);
              stream.getTracks().forEach(function (t) { t.stop(); });
              cv.toBlob(function (b) {
                MT.clear(out);
                out.appendChild(resultPanel(c, 'KUVAKAAPPAUS', b, 'kuvakaappaus-' + MT.dateStr() + '.png', [
                  { k: 'Mitat', v: cv.width + ' × ' + cv.height + ' px', big: true },
                  { k: 'Koko', v: MT.bytes(b.size) },
                  { k: 'Aika', v: new Date().toLocaleString('fi-FI'), copy: false }
                ]));
              }, 'image/png');
            }, 260);
          };
        }).catch(function (e) {
          if (e.name !== 'NotAllowedError') MT.toast('Kaappaus epäonnistui: ' + e.message, 'err');
        });
      }
      root.appendChild(c.panel('KAAPPAUS', 'i-monitor', h('div.panel-body', null, [
        h('div.btn-row', null, [c.btn('Ota kuvakaappaus', { cls: 'btn-pri', icon: 'i-monitor', on: shot })]),
        h('div', { style: { marginTop: '11px' } }, c.note('Selain kysyy erikseen minkä näytön, ikkunan tai välilehden haluat jakaa. Kuva käsitellään kokonaan paikallisesti eikä sitä lähetetä mihinkään. Toiminto vaatii HTTPS-yhteyden tai paikallisen tiedoston.', 'info'))
      ])));
      root.appendChild(out);
    }
  });
})();
