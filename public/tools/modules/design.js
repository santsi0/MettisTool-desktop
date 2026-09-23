/* Moduuli: Design */
(function () {
  'use strict';
  var R = MT.reg, h = MT.h;

  /* ---------- värimuunnokset ---------- */
  function hex2rgb(hex) {
    var s = String(hex).trim().replace('#', '');
    if (s.length === 3 || s.length === 4) s = s.split('').map(function (c) { return c + c; }).join('');
    if (!/^[0-9a-fA-F]{6,8}$/.test(s)) return null;
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16),
      s.length === 8 ? parseInt(s.slice(6, 8), 16) / 255 : 1];
  }
  function rgb2hex(r, g, b) {
    return '#' + [r, g, b].map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); }).join('');
  }
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, hh = 0, s = 0, l = (max + min) / 2;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      hh = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      hh *= 60;
    }
    return [hh, s * 100, l * 100];
  }
  function hsl2rgb(hh, s, l) {
    hh = ((hh % 360) + 360) % 360; s /= 100; l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((hh / 60) % 2 - 1)), m = l - c / 2;
    var t = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
    return t.map(function (v) { return Math.round((v + m) * 255); });
  }
  function rgb2hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, hh = 0;
    if (d) hh = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [hh * 60, max ? d / max * 100 : 0, max * 100];
  }
  function hsv2rgb(hh, s, v) {
    s /= 100; v /= 100;
    var c = v * s, x = c * (1 - Math.abs((((hh % 360) + 360) % 360 / 60) % 2 - 1)), m = v - c;
    var H = ((hh % 360) + 360) % 360;
    var t = H < 60 ? [c, x, 0] : H < 120 ? [x, c, 0] : H < 180 ? [0, c, x] : H < 240 ? [0, x, c] : H < 300 ? [x, 0, c] : [c, 0, x];
    return t.map(function (z) { return Math.round((z + m) * 255); });
  }
  function rgb2cmyk(r, g, b) {
    var c = 1 - r / 255, m = 1 - g / 255, y = 1 - b / 255, k = Math.min(c, m, y);
    if (k === 1) return [0, 0, 0, 100];
    return [(c - k) / (1 - k) * 100, (m - k) / (1 - k) * 100, (y - k) / (1 - k) * 100, k * 100];
  }
  function lum(r, g, b) {
    var a = [r, g, b].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrast(c1, c2) {
    var l1 = lum(c1[0], c1[1], c1[2]), l2 = lum(c2[0], c2[1], c2[2]);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function parseColor(s) {
    s = String(s || '').trim();
    var m;
    if ((m = /^#?([0-9a-fA-F]{3,8})$/.exec(s))) return hex2rgb(m[1]);
    if ((m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.%]+))?\s*\)/i.exec(s))) {
      var a = m[4] ? (m[4].indexOf('%') >= 0 ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1;
      return [+m[1], +m[2], +m[3], a];
    }
    if ((m = /hsla?\(\s*([\d.-]+)[\s,]+([\d.]+)%?[\s,]+([\d.]+)%?(?:[\s,/]+([\d.%]+))?\s*\)/i.exec(s))) {
      var r = hsl2rgb(+m[1], +m[2], +m[3]);
      return [r[0], r[1], r[2], m[4] ? parseFloat(m[4]) : 1];
    }
    var el = document.createElement('span');
    el.style.color = ''; el.style.color = s;
    if (el.style.color) {
      document.body.appendChild(el);
      var cs = getComputedStyle(el).color;
      el.remove();
      var mm = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(cs);
      if (mm) return [+mm[1], +mm[2], +mm[3], mm[4] ? +mm[4] : 1];
    }
    return null;
  }
  MT.rgb2hsl = rgb2hsl; MT.hex2rgb = hex2rgb; MT.rgb2hex = rgb2hex; MT.hsl2rgb = hsl2rgb; MT.parseColor = parseColor;

  function fmtRow(rgb) {
    var hsl = rgb2hsl(rgb[0], rgb[1], rgb[2]), hsv = rgb2hsv(rgb[0], rgb[1], rgb[2]), cmyk = rgb2cmyk(rgb[0], rgb[1], rgb[2]);
    var r = function (x) { return Math.round(x); };
    return [
      { k: 'HEX', v: rgb2hex(rgb[0], rgb[1], rgb[2]).toUpperCase(), big: true },
      { k: 'RGB', v: 'rgb(' + r(rgb[0]) + ', ' + r(rgb[1]) + ', ' + r(rgb[2]) + ')' },
      { k: 'RGBA', v: 'rgba(' + r(rgb[0]) + ', ' + r(rgb[1]) + ', ' + r(rgb[2]) + ', ' + (rgb[3] === undefined ? 1 : +rgb[3].toFixed(2)) + ')' },
      { k: 'HSL', v: 'hsl(' + r(hsl[0]) + ', ' + r(hsl[1]) + '%, ' + r(hsl[2]) + '%)' },
      { k: 'HSV / HSB', v: 'hsv(' + r(hsv[0]) + ', ' + r(hsv[1]) + '%, ' + r(hsv[2]) + '%)' },
      { k: 'CMYK', v: 'cmyk(' + r(cmyk[0]) + '%, ' + r(cmyk[1]) + '%, ' + r(cmyk[2]) + '%, ' + r(cmyk[3]) + '%)' },
      { k: 'Suhteellinen kirkkaus', v: lum(rgb[0], rgb[1], rgb[2]).toFixed(4).replace('.', ','), copy: false },
      { k: 'Kontrasti valkoiseen', v: contrast(rgb, [255, 255, 255]).toFixed(2).replace('.', ',') + ':1', copy: false },
      { k: 'Kontrasti mustaan', v: contrast(rgb, [0, 0, 0]).toFixed(2).replace('.', ',') + ':1', copy: false }
    ];
  }

  /* ---------- 1. Värinvalitsin ---------- */
  R({
    id: 'varivalitsin', cat: 'design', name: 'Värinvalitsin', icon: 'i-palette', kind: 'custom',
    desc: 'Valitse väri ja näe se kaikissa formaateissa sekä sävyasteikolla.',
    keys: ['väri', 'picker', 'hex', 'rgb', 'hsl', 'valitse'],
    render: function (root, c) {
      var picker = h('input.ctl', { type: 'color', value: '#E8323C', style: { height: '46px' } });
      var text = h('input.ctl.mono', { value: '#E8323C' });
      var out = h('div'), shades = h('div');
      function upd(from) {
        var rgb = parseColor(from === 'text' ? text.value : picker.value);
        if (!rgb) return;
        var hex = rgb2hex(rgb[0], rgb[1], rgb[2]);
        if (from === 'text') picker.value = hex; else text.value = hex.toUpperCase();
        MT.clear(out);
        out.appendChild(h('div', { style: { height: '90px', background: 'rgba(' + rgb.slice(0, 3).join(',') + ',' + rgb[3] + ')', borderBottom: '1px solid var(--bd)' } }));
        out.appendChild(c.resList(fmtRow(rgb)));
        var hsl = rgb2hsl(rgb[0], rgb[1], rgb[2]);
        MT.clear(shades);
        var grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(74px,1fr))', gap: '6px', padding: '11px' } });
        [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95].forEach(function (l) {
          var r2 = hsl2rgb(hsl[0], hsl[1], l), hx = rgb2hex(r2[0], r2[1], r2[2]);
          grid.appendChild(h('button.swatch', { style: { background: hx, height: '58px' }, title: 'Kopioi ' + hx, onclick: function () { MT.copy(hx.toUpperCase()); } },
            h('span', { text: l + '%' })));
        });
        shades.appendChild(grid);
        shades.appendChild(h('div.panel-foot', null, c.btn('Kopioi CSS-muuttujat', { cls: 'btn-sm', icon: 'i-copy', on: function () {
          MT.copy(':root {\n' + [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95].map(function (l) {
            var r2 = hsl2rgb(hsl[0], hsl[1], l);
            return '  --vari-' + (l * 10) + ': ' + rgb2hex(r2[0], r2[1], r2[2]) + ';';
          }).join('\n') + '\n}');
        } })));
      }
      picker.addEventListener('input', function () { upd('picker'); });
      text.addEventListener('input', function () { upd('text'); });
      root.appendChild(c.panel('VÄRI', 'i-palette', h('div.panel-body', null, h('div.fields', null, [
        h('div.field', null, [h('label', { text: 'Valitsin' }), picker]),
        h('div.field', null, [h('label', { text: 'HEX, RGB, HSL tai nimi' }), text])
      ]))));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, h('div.home-grid', null, [
        c.panel('MUODOT', 'i-grid', out),
        c.panel('SÄVYASTEIKKO', 'i-zap', shades)
      ])));
      upd('picker');
    }
  });

  /* ---------- 2.–4. Muunnokset ---------- */
  function convTool(id, name, desc, keys, fn) {
    R({
      id: id, cat: 'design', name: name, icon: 'i-refresh', kind: 'io', desc: desc, keys: keys,
      io: {
        inLabel: 'VÄRIT (YKSI RIVILLÄ)', outLabel: 'MUUNNETUT', lang: 'none',
        sample: '#E8323C\nrgb(59, 130, 246)\nhsl(150, 48%, 47%)\ncrimson',
        run: function (t) {
          var out = t.split('\n').map(function (l) {
            if (!l.trim()) return '';
            var rgb = parseColor(l);
            if (!rgb) return l + '  ⟶ tuntematon väri';
            return l.trim().padEnd(26) + ' → ' + fn(rgb);
          }).join('\n');
          return { out: out, status: 'MUUNNETTU', kind: 'ok' };
        }
      }
    });
  }
  convTool('hex-rgb', 'HEX ↔ RGB', 'Muunna heksavärit RGB-muotoon ja päinvastoin.', ['hex', 'rgb', 'väri', 'muunna'],
    function (rgb) { return 'rgb(' + Math.round(rgb[0]) + ', ' + Math.round(rgb[1]) + ', ' + Math.round(rgb[2]) + ')   ' + rgb2hex(rgb[0], rgb[1], rgb[2]).toUpperCase(); });
  convTool('rgb-hsl', 'RGB ↔ HSL', 'Muunna värit HSL-muotoon, joka helpottaa sävyjen säätämistä.', ['rgb', 'hsl', 'väri', 'muunna'],
    function (rgb) { var x = rgb2hsl(rgb[0], rgb[1], rgb[2]); return 'hsl(' + Math.round(x[0]) + ', ' + Math.round(x[1]) + '%, ' + Math.round(x[2]) + '%)'; });
  convTool('hsl-hsv', 'HSL ↔ HSV', 'Muunna värit HSV/HSB-muotoon, jota kuvankäsittelyohjelmat käyttävät.', ['hsl', 'hsv', 'hsb', 'väri'],
    function (rgb) {
      var a = rgb2hsl(rgb[0], rgb[1], rgb[2]), b = rgb2hsv(rgb[0], rgb[1], rgb[2]);
      return 'hsl(' + Math.round(a[0]) + ', ' + Math.round(a[1]) + '%, ' + Math.round(a[2]) + '%)   hsv(' + Math.round(b[0]) + ', ' + Math.round(b[1]) + '%, ' + Math.round(b[2]) + '%)';
    });

  /* ---------- 5. Gradientti ---------- */
  R({
    id: 'gradientti-generaattori', cat: 'design', name: 'Gradienttigeneraattori', icon: 'i-palette', kind: 'custom',
    desc: 'Rakenna CSS-liukuvärejä esikatselun kanssa ja kopioi valmis koodi.',
    keys: ['gradientti', 'liukuväri', 'css', 'background', 'linear'],
    render: function (root, c) {
      var F = [
        { k: 'tyyppi', type: 'select', label: 'Tyyppi', def: 'linear', opts: [['linear', 'Lineaarinen'], ['radial', 'Säteittäinen'], ['conic', 'Kartiomainen']] },
        { k: 'kulma', type: 'range', label: 'Kulma', def: 135, min: 0, max: 360, step: 1, suffix: '°' },
        { k: 'v1', type: 'color', label: 'Väri 1', def: '#E8323C' },
        { k: 'p1', type: 'range', label: 'Sijainti 1', def: 0, min: 0, max: 100, step: 1, suffix: ' %' },
        { k: 'v2', type: 'color', label: 'Väri 2', def: '#8B1A6B' },
        { k: 'p2', type: 'range', label: 'Sijainti 2', def: 100, min: 0, max: 100, step: 1, suffix: ' %' },
        { k: 'v3', type: 'color', label: 'Väri 3 (valinnainen)', def: '#101217' },
        { k: 'kolmas', type: 'check', label: 'Käytä kolmatta väriä', def: false }
      ];
      var box = c.fields(F, upd), prev = h('div', { style: { height: '200px', borderRadius: '6px', border: '1px solid var(--bd)' } });
      var out = h('div');
      function css() {
        var v = c.readFields(box, F);
        var stops = [v.v1 + ' ' + v.p1 + '%'];
        if (v.kolmas) stops.push(v.v3 + ' ' + Math.round((v.p1 + v.p2) / 2) + '%');
        stops.push(v.v2 + ' ' + v.p2 + '%');
        if (v.tyyppi === 'linear') return 'linear-gradient(' + v.kulma + 'deg, ' + stops.join(', ') + ')';
        if (v.tyyppi === 'radial') return 'radial-gradient(circle at 50% 50%, ' + stops.join(', ') + ')';
        return 'conic-gradient(from ' + v.kulma + 'deg at 50% 50%, ' + stops.join(', ') + ')';
      }
      function upd() {
        var g = css();
        prev.style.background = g;
        MT.clear(out);
        out.appendChild(c.resList([
          { k: 'CSS', v: 'background: ' + g + ';', big: true },
          { k: 'Tailwind (mielivaltainen arvo)', v: 'bg-[' + g.replace(/\s+/g, '_') + ']' },
          { k: 'SVG-gradientti', v: '<linearGradient><stop offset="0%" stop-color="' + c.readFields(box, F).v1 + '"/><stop offset="100%" stop-color="' + c.readFields(box, F).v2 + '"/></linearGradient>' }
        ]));
      }
      root.appendChild(h('div.home-grid', null, [
        c.panel('ASETUKSET', 'i-filter', h('div.panel-body', null, box)),
        c.panel('ESIKATSELU', 'i-image', h('div', { style: { padding: '11px' } }, prev))
      ]));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('KOODI', 'i-code', out)));
      upd();
    }
  });

  /* ---------- 6. Varjo ---------- */
  R({
    id: 'varjo-generaattori', cat: 'design', name: 'Varjogeneraattori', icon: 'i-image', kind: 'custom',
    desc: 'Säädä box-shadow-arvot visuaalisesti ja kopioi valmis CSS.',
    keys: ['varjo', 'shadow', 'css', 'box-shadow'],
    render: function (root, c) {
      var F = [
        { k: 'x', type: 'range', label: 'Vaakasiirtymä', def: 0, min: -60, max: 60, step: 1, suffix: ' px' },
        { k: 'y', type: 'range', label: 'Pystysiirtymä', def: 12, min: -60, max: 60, step: 1, suffix: ' px' },
        { k: 'blur', type: 'range', label: 'Pehmennys', def: 32, min: 0, max: 120, step: 1, suffix: ' px' },
        { k: 'spread', type: 'range', label: 'Levitys', def: -6, min: -50, max: 50, step: 1, suffix: ' px' },
        { k: 'vari', type: 'color', label: 'Varjon väri', def: '#000000' },
        { k: 'alpha', type: 'range', label: 'Läpinäkyvyys', def: 45, min: 0, max: 100, step: 1, suffix: ' %' },
        { k: 'inset', type: 'check', label: 'Sisävarjo (inset)', def: false },
        { k: 'tausta', type: 'color', label: 'Taustaväri', def: '#14161C' },
        { k: 'laatikko', type: 'color', label: 'Laatikon väri', def: '#E8EAF0' }
      ];
      var box = c.fields(F, upd);
      var el = h('div', { style: { width: '150px', height: '110px', borderRadius: '8px' } });
      var prev = h('div', { style: { minHeight: '230px', display: 'grid', placeItems: 'center', borderRadius: '6px' } }, el);
      var out = h('div');
      function upd() {
        var v = c.readFields(box, F), rgb = hex2rgb(v.vari) || [0, 0, 0];
        var shadow = (v.inset ? 'inset ' : '') + v.x + 'px ' + v.y + 'px ' + v.blur + 'px ' + v.spread + 'px rgba(' +
          rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + (v.alpha / 100).toFixed(2) + ')';
        el.style.boxShadow = shadow; el.style.background = v.laatikko;
        prev.style.background = v.tausta;
        MT.clear(out);
        out.appendChild(c.resList([
          { k: 'CSS', v: 'box-shadow: ' + shadow + ';', big: true },
          { k: 'Tekstivarjo', v: 'text-shadow: ' + v.x + 'px ' + v.y + 'px ' + v.blur + 'px rgba(' + rgb.slice(0, 3).join(', ') + ', ' + (v.alpha / 100).toFixed(2) + ');' },
          { k: 'Suodatin (läpinäkyville)', v: 'filter: drop-shadow(' + v.x + 'px ' + v.y + 'px ' + v.blur + 'px rgba(' + rgb.slice(0, 3).join(', ') + ', ' + (v.alpha / 100).toFixed(2) + '));' }
        ]));
      }
      root.appendChild(h('div.home-grid', null, [
        c.panel('ASETUKSET', 'i-filter', h('div.panel-body', null, box)),
        c.panel('ESIKATSELU', 'i-image', h('div', { style: { padding: '11px' } }, prev))
      ]));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('KOODI', 'i-code', out)));
      upd();
    }
  });

  /* ---------- 7. Reunapyöristys ---------- */
  R({
    id: 'reunapyoristys', cat: 'design', name: 'Reunapyöristys', icon: 'i-image', kind: 'custom',
    desc: 'Säädä border-radius jokaiselle kulmalle erikseen ja kokeile orgaanisia muotoja.',
    keys: ['border-radius', 'pyöristys', 'kulma', 'css', 'muoto'],
    render: function (root, c) {
      var F = [
        { k: 'yv', type: 'range', label: 'Ylävasen', def: 16, min: 0, max: 150, step: 1, suffix: ' px' },
        { k: 'yo', type: 'range', label: 'Yläoikea', def: 16, min: 0, max: 150, step: 1, suffix: ' px' },
        { k: 'ao', type: 'range', label: 'Alaoikea', def: 16, min: 0, max: 150, step: 1, suffix: ' px' },
        { k: 'av', type: 'range', label: 'Alavasen', def: 16, min: 0, max: 150, step: 1, suffix: ' px' },
        { k: 'pros', type: 'check', label: 'Käytä prosentteja (orgaaninen muoto)', def: false },
        { k: 'vari', type: 'color', label: 'Väri', def: '#E8323C' }
      ];
      var box = c.fields(F, upd);
      var el = h('div', { style: { width: '180px', height: '180px' } });
      var out = h('div');
      function upd() {
        var v = c.readFields(box, F), u = v.pros ? '%' : 'px';
        var r = [v.yv, v.yo, v.ao, v.av].map(function (x) { return (v.pros ? Math.min(100, x) : x) + u; }).join(' ');
        el.style.borderRadius = r; el.style.background = v.vari;
        MT.clear(out);
        out.appendChild(c.resList([
          { k: 'CSS', v: 'border-radius: ' + r + ';', big: true },
          { k: 'Tailwind', v: v.yv === v.yo && v.yo === v.ao && v.ao === v.av ? 'rounded-[' + v.yv + u + ']' : 'rounded-[' + r.replace(/ /g, '_') + ']' }
        ]));
      }
      root.appendChild(h('div.home-grid', null, [
        c.panel('ASETUKSET', 'i-filter', h('div.panel-body', null, box)),
        c.panel('ESIKATSELU', 'i-image', h('div.preview-box', { style: { minHeight: '230px' } }, el))
      ]));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('KOODI', 'i-code', out)));
      upd();
    }
  });

  /* ---------- 8. CSS-generaattori ---------- */
  R({
    id: 'css-generaattori', cat: 'design', name: 'Painikkeen CSS-generaattori', icon: 'i-code', kind: 'custom',
    desc: 'Rakenna painikkeen tyyli visuaalisesti ja kopioi valmis CSS-sääntö.',
    keys: ['css', 'painike', 'button', 'tyyli', 'generaattori'],
    render: function (root, c) {
      var F = [
        { k: 'teksti', type: 'text', label: 'Painikkeen teksti', def: 'Lähetä lomake' },
        { k: 'bg', type: 'color', label: 'Taustaväri', def: '#E8323C' },
        { k: 'fg', type: 'color', label: 'Tekstin väri', def: '#FFFFFF' },
        { k: 'koko', type: 'range', label: 'Fonttikoko', def: 14, min: 10, max: 24, step: 1, suffix: ' px' },
        { k: 'pad', type: 'range', label: 'Sisäreunus', def: 12, min: 4, max: 32, step: 1, suffix: ' px' },
        { k: 'radius', type: 'range', label: 'Pyöristys', def: 6, min: 0, max: 40, step: 1, suffix: ' px' },
        { k: 'reuna', type: 'range', label: 'Reunan paksuus', def: 0, min: 0, max: 5, step: 1, suffix: ' px' },
        { k: 'varjo', type: 'check', label: 'Varjo', def: true },
        { k: 'paksu', type: 'check', label: 'Lihavoitu teksti', def: true },
        { k: 'isot', type: 'check', label: 'ISOT KIRJAIMET', def: false }
      ];
      var box = c.fields(F, upd);
      var btn = h('button', { style: { cursor: 'pointer', border: 'none', transition: 'all 160ms' } });
      var out = h('div');
      function upd() {
        var v = c.readFields(box, F), rgb = hex2rgb(v.bg) || [0, 0, 0];
        var rules = [
          'background: ' + v.bg,
          'color: ' + v.fg,
          'font-size: ' + v.koko + 'px',
          'font-weight: ' + (v.paksu ? '600' : '400'),
          'padding: ' + v.pad + 'px ' + Math.round(v.pad * 2) + 'px',
          'border-radius: ' + v.radius + 'px',
          'border: ' + (v.reuna ? v.reuna + 'px solid rgba(0,0,0,.25)' : 'none'),
          'text-transform: ' + (v.isot ? 'uppercase' : 'none'),
          v.isot ? 'letter-spacing: .06em' : 'letter-spacing: normal',
          'cursor: pointer',
          'transition: all 160ms ease',
          v.varjo ? 'box-shadow: 0 4px 14px rgba(' + rgb.slice(0, 3).join(',') + ',.35)' : 'box-shadow: none'
        ];
        btn.textContent = v.teksti || 'Painike';
        rules.forEach(function (r) {
          var i = r.indexOf(':');
          btn.style.setProperty(r.slice(0, i).trim(), r.slice(i + 1).trim());
        });
        var css = '.painike {\n  ' + rules.join(';\n  ') + ';\n}\n\n.painike:hover {\n  filter: brightness(1.1);\n  transform: translateY(-1px);\n}\n\n.painike:active {\n  transform: translateY(0);\n}';
        MT.clear(out);
        out.appendChild(h('pre.ed-out', { html: MT.highlight(css, 'css'), style: { padding: '11px' } }));
        out.appendChild(h('div.panel-foot', null, [
          c.btn('Kopioi CSS', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(css); } }),
          c.btn('Kopioi HTML', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy('<button class="painike">' + (v.teksti || 'Painike') + '</button>'); } })
        ]));
      }
      root.appendChild(h('div.home-grid', null, [
        c.panel('ASETUKSET', 'i-filter', h('div.panel-body', null, box)),
        c.panel('ESIKATSELU', 'i-image', h('div.preview-box', { style: { minHeight: '230px' } }, btn))
      ]));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('CSS', 'i-code', out)));
      upd();
    }
  });

  /* ---------- 9. Typografinen skaala ---------- */
  R({
    id: 'typografia-skaala', cat: 'design', name: 'Typografinen skaala', icon: 'i-text', kind: 'custom',
    desc: 'Laske harmoninen fonttikokoskaala ja kopioi se CSS-muuttujina.',
    keys: ['typografia', 'fontti', 'koko', 'skaala', 'otsikko'],
    render: function (root, c) {
      var F = [
        { k: 'perus', type: 'num', label: 'Peruskoko (px)', def: '16' },
        { k: 'suhde', type: 'select', label: 'Suhde', def: '1.25', opts: [['1.067', '1,067 — pieni sekunti'], ['1.125', '1,125 — suuri sekunti'], ['1.2', '1,200 — pieni terssi'], ['1.25', '1,250 — suuri terssi'], ['1.333', '1,333 — kvartti'], ['1.414', '1,414 — lisätty kvartti'], ['1.5', '1,500 — kvintti'], ['1.618', '1,618 — kultainen leikkaus']] },
        { k: 'askelia', type: 'range', label: 'Askelia ylöspäin', def: 6, min: 3, max: 10, step: 1, suffix: ' kpl' }
      ];
      var box = c.fields(F, upd), out = h('div');
      function upd() {
        var v = c.readFields(box, F), r = parseFloat(v.suhde), base = v.perus || 16;
        var steps = [];
        for (var i = -2; i <= v.askelia; i++) steps.push({ i: i, px: base * Math.pow(r, i) });
        MT.clear(out);
        var prev = h('div', { style: { padding: '13px' } });
        steps.slice().reverse().forEach(function (s) {
          prev.appendChild(h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '14px', padding: '5px 0', borderBottom: '1px solid var(--bd-soft)' } }, [
            h('span.lbl', { text: (s.i >= 0 ? '+' : '') + s.i, style: { width: '30px', flex: 'none' } }),
            h('span.mono', { text: s.px.toFixed(1).replace('.', ',') + ' px', style: { width: '76px', flex: 'none', color: 'var(--tx-3)', fontSize: '11px' } }),
            h('span', { text: 'Otsikkoteksti', style: { fontSize: s.px + 'px', lineHeight: '1.15', overflow: 'hidden', whiteSpace: 'nowrap' } })
          ]));
        });
        out.appendChild(prev);
        var css = ':root {\n' + steps.map(function (s) {
          return '  --fs-' + (s.i < 0 ? 'xs' + Math.abs(s.i) : s.i) + ': ' + (s.px / 16).toFixed(3) + 'rem; /* ' + s.px.toFixed(1) + 'px */';
        }).join('\n') + '\n}';
        out.appendChild(h('div.panel-foot', null, [
          c.btn('Kopioi CSS-muuttujat', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(css); } }),
          h('span.grow'), h('span.lbl', { text: 'SUHDE ' + v.suhde })
        ]));
      }
      root.appendChild(c.panel('ASETUKSET', 'i-filter', h('div.panel-body', null, box)));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('SKAALA', 'i-text', out)));
      upd();
    }
  });

  /* ---------- 10. Fonttiparit ---------- */
  var PAIRS = [
    ['Georgia', 'Verdana', 'Klassinen antiikva otsikoissa ja selkeä groteski leipätekstissä.'],
    ['Helvetica Neue', 'Georgia', 'Neutraali groteski otsikoissa, lämmin antiikva tekstissä.'],
    ['Segoe UI', 'Segoe UI', 'Yhden fontin ratkaisu: paksuusero riittää erottamaan tasot.'],
    ['Courier New', 'Arial', 'Tekninen konekirjoitusotsikko ja rauhallinen leipäteksti.'],
    ['Palatino Linotype', 'Trebuchet MS', 'Kirjamainen otsikko ja ystävällinen leipäteksti.'],
    ['Impact', 'Tahoma', 'Voimakas julistetyyli otsikoissa, neutraali leipäteksti.'],
    ['Times New Roman', 'Arial', 'Perinteinen ja turvallinen yhdistelmä asiakirjoihin.'],
    ['Tahoma', 'Georgia', 'Tiivis otsikkofontti ja luettava antiikva pitkiin teksteihin.']
  ];
  R({
    id: 'fonttiparit', cat: 'design', name: 'Fonttiparit', icon: 'i-text', kind: 'custom',
    desc: 'Kokeile toimivia otsikko- ja leipätekstiyhdistelmiä järjestelmäfonteilla.',
    keys: ['fontti', 'typografia', 'pari', 'otsikko', 'leipäteksti'],
    render: function (root, c) {
      var box = h('div');
      PAIRS.forEach(function (p) {
        box.appendChild(c.panel(p[0].toUpperCase() + ' + ' + p[1].toUpperCase(), 'i-text', h('div', { style: { padding: '14px 16px' } }, [
          h('div', { text: 'Ammattilaisen työkalupakki', style: { fontFamily: '"' + p[0] + '", serif', fontSize: '25px', fontWeight: '700', marginBottom: '7px' } }),
          h('div', { text: 'Tämä on esimerkki leipätekstistä. Hyvä fonttipari luo selkeän hierarkian ja pitää pitkänkin tekstin luettavana. Ääkköset toimivat: ÄÖÅ äöå.', style: { fontFamily: '"' + p[1] + '", sans-serif', fontSize: '14px', lineHeight: '1.6', color: 'var(--tx-2)' } }),
          h('div', { style: { marginTop: '11px', display: 'flex', gap: '7px' } }, [
            c.btn('Kopioi CSS', { cls: 'btn-sm', icon: 'i-copy', on: function () {
              MT.copy('h1, h2, h3 {\n  font-family: "' + p[0] + '", serif;\n}\n\nbody {\n  font-family: "' + p[1] + '", sans-serif;\n}');
            } }),
            h('span.lbl', { text: p[2], style: { alignSelf: 'center', textTransform: 'none', letterSpacing: '0', fontSize: '11px' } })
          ])
        ])));
        box.appendChild(h('div', { style: { height: '11px' } }));
      });
      root.appendChild(box);
      root.appendChild(c.note('Nämä ovat järjestelmäfontteja, jotka löytyvät lähes kaikilta laitteilta ilman latausta. Se tekee sivustosta nopean ja toimii myös ilman verkkoyhteyttä.', 'info'));
    }
  });

  /* ---------- 11. Kontrastitarkistin ---------- */
  R({
    id: 'kontrastitarkistin', cat: 'design', name: 'Kontrastitarkistin', icon: 'i-checksq', kind: 'custom',
    desc: 'Tarkista täyttääkö väriyhdistelmä WCAG-saavutettavuusvaatimukset.',
    keys: ['kontrasti', 'saavutettavuus', 'wcag', 'väri', 'luettavuus'],
    render: function (root, c) {
      var fg = h('input.ctl', { type: 'color', value: '#8B909C' }), fgT = h('input.ctl.mono', { value: '#8B909C' });
      var bg = h('input.ctl', { type: 'color', value: '#101217' }), bgT = h('input.ctl.mono', { value: '#101217' });
      var out = h('div');
      function upd(src) {
        if (src === 'fgT') fg.value = rgb2hex.apply(null, (parseColor(fgT.value) || [0, 0, 0]).slice(0, 3));
        if (src === 'bgT') bg.value = rgb2hex.apply(null, (parseColor(bgT.value) || [0, 0, 0]).slice(0, 3));
        if (src === 'fg') fgT.value = fg.value.toUpperCase();
        if (src === 'bg') bgT.value = bg.value.toUpperCase();
        var f = hex2rgb(fg.value), b = hex2rgb(bg.value);
        if (!f || !b) return;
        var ratio = contrast(f, b);
        function badge(ok) { return ok ? '✓ läpäisee' : '✗ ei läpäise'; }
        MT.clear(out);
        out.appendChild(h('div', { style: { background: bg.value, color: fg.value, padding: '22px', borderBottom: '1px solid var(--bd)' } }, [
          h('div', { text: 'Suuri otsikkoteksti', style: { fontSize: '28px', fontWeight: '700', marginBottom: '8px' } }),
          h('div', { text: 'Tavallinen leipäteksti 16 pikselin koossa. Ääkköset: ÄÖÅ.', style: { fontSize: '16px' } }),
          h('div', { text: 'Pieni aputeksti 13 pikselin koossa.', style: { fontSize: '13px', marginTop: '6px' } })
        ]));
        out.appendChild(c.resList([
          { k: 'Kontrastisuhde', v: ratio.toFixed(2).replace('.', ',') + ' : 1', big: true, copy: false },
          { k: 'AA — normaali teksti (4,5:1)', v: badge(ratio >= 4.5), copy: false },
          { k: 'AA — suuri teksti (3:1)', v: badge(ratio >= 3), copy: false },
          { k: 'AAA — normaali teksti (7:1)', v: badge(ratio >= 7), copy: false },
          { k: 'AAA — suuri teksti (4,5:1)', v: badge(ratio >= 4.5), copy: false },
          { k: 'Käyttöliittymäkomponentit (3:1)', v: badge(ratio >= 3), copy: false }
        ]));
        var kind = ratio >= 7 ? 'ok' : ratio >= 4.5 ? 'ok' : ratio >= 3 ? 'warn' : 'err';
        var msg = ratio >= 7 ? 'Erinomainen kontrasti — täyttää tiukimmankin AAA-vaatimuksen.'
          : ratio >= 4.5 ? 'Hyvä kontrasti — täyttää AA-vaatimuksen kaikelle tekstille.'
            : ratio >= 3 ? 'Riittää vain suurelle tekstille (yli 18,66 px lihavoituna tai 24 px normaalina) ja käyttöliittymäelementeille.'
              : 'Liian heikko kontrasti. Teksti on vaikealukuista monille käyttäjille.';
        out.appendChild(h('div', { style: { padding: '11px' } }, c.note(msg, kind)));
      }
      [[fg, 'fg'], [fgT, 'fgT'], [bg, 'bg'], [bgT, 'bgT']].forEach(function (p) {
        p[0].addEventListener('input', function () { upd(p[1]); });
      });
      root.appendChild(c.panel('VÄRIT', 'i-palette', h('div.panel-body', null, h('div.fields', null, [
        h('div.field', null, [h('label', { text: 'Tekstin väri' }), fg]),
        h('div.field', null, [h('label', { text: 'Tekstin väri (koodi)' }), fgT]),
        h('div.field', null, [h('label', { text: 'Taustaväri' }), bg]),
        h('div.field', null, [h('label', { text: 'Taustaväri (koodi)' }), bgT])
      ]))));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('TULOS', 'i-checksq', out)));
      upd('fg');
    }
  });

  /* ---------- 12. Palettigeneraattori ---------- */
  R({
    id: 'paletin-generaattori', cat: 'design', name: 'Väripaletin generaattori', icon: 'i-palette', kind: 'custom',
    desc: 'Luo harmoninen väripaletti väriopin sääntöjen mukaan.',
    keys: ['paletti', 'väri', 'harmonia', 'komplementti', 'triadi'],
    render: function (root, c) {
      var F = [
        { k: 'vari', type: 'color', label: 'Perusväri', def: '#E8323C' },
        { k: 'tyyppi', type: 'select', label: 'Harmonia', def: 'komplementti', opts: [
          ['komplementti', 'Komplementti (vastaväri)'], ['jaettu', 'Jaettu komplementti'], ['triadi', 'Triadi'],
          ['tetradi', 'Tetradi'], ['analoginen', 'Analoginen'], ['monokrominen', 'Monokrominen']] }
      ];
      var box = c.fields(F, upd), out = h('div');
      function upd() {
        var v = c.readFields(box, F), rgb = hex2rgb(v.vari) || [232, 50, 60];
        var hsl = rgb2hsl(rgb[0], rgb[1], rgb[2]), list = [];
        var H = hsl[0], S = hsl[1], L = hsl[2];
        var offs = { komplementti: [0, 180], jaettu: [0, 150, 210], triadi: [0, 120, 240], tetradi: [0, 90, 180, 270], analoginen: [-30, -15, 0, 15, 30] };
        if (v.tyyppi === 'monokrominen') {
          [20, 35, 50, 65, 80].forEach(function (l) { list.push(hsl2rgb(H, S, l)); });
        } else offs[v.tyyppi].forEach(function (o) { list.push(hsl2rgb(H + o, S, L)); });
        MT.clear(out);
        var grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '8px', padding: '13px' } });
        var hexes = list.map(function (r) { return rgb2hex(r[0], r[1], r[2]).toUpperCase(); });
        hexes.forEach(function (hx) {
          grid.appendChild(h('button.swatch', { style: { background: hx, height: '110px' }, title: 'Kopioi ' + hx, onclick: function () { MT.copy(hx); } },
            h('span', { text: hx })));
        });
        out.appendChild(grid);
        out.appendChild(h('div.panel-foot', null, [
          c.btn('Kopioi HEX-lista', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(hexes.join('\n')); } }),
          c.btn('Kopioi CSS', { cls: 'btn-sm', icon: 'i-copy', on: function () {
            MT.copy(':root {\n' + hexes.map(function (x, i) { return '  --vari-' + (i + 1) + ': ' + x + ';'; }).join('\n') + '\n}');
          } }),
          c.btn('Kopioi JSON', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(JSON.stringify(hexes, null, 2)); } })
        ]));
      }
      root.appendChild(c.panel('ASETUKSET', 'i-filter', h('div.panel-body', null, box)));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('PALETTI', 'i-palette', out)));
      upd();
    }
  });

  /* ---------- 13. Satunnainen väri ---------- */
  R({
    id: 'satunnainen-vari', cat: 'design', name: 'Satunnainen väri', icon: 'i-dice', kind: 'custom',
    desc: 'Arvo satunnaisia värejä tai kokonainen paletti inspiraatioksi.',
    keys: ['satunnainen', 'väri', 'arvonta', 'inspiraatio'],
    render: function (root, c) {
      var F = [
        { k: 'kpl', type: 'range', label: 'Värejä', def: 8, min: 1, max: 24, step: 1, suffix: ' kpl' },
        { k: 'tyyli', type: 'select', label: 'Tyyli', def: 'vapaa', opts: [['vapaa', 'Täysin satunnainen'], ['pastelli', 'Pastelli'], ['tumma', 'Tumma'], ['kirkas', 'Kirkas'], ['harmaa', 'Harmaasävy']] }
      ];
      var box = c.fields(F, gen), out = h('div');
      function gen() {
        var v = c.readFields(box, F), list = [];
        for (var i = 0; i < v.kpl; i++) {
          var hh = MT.rint(0, 359), s, l;
          if (v.tyyli === 'pastelli') { s = MT.rint(45, 70); l = MT.rint(78, 90); }
          else if (v.tyyli === 'tumma') { s = MT.rint(35, 75); l = MT.rint(12, 28); }
          else if (v.tyyli === 'kirkas') { s = MT.rint(80, 100); l = MT.rint(45, 58); }
          else if (v.tyyli === 'harmaa') { s = 0; l = MT.rint(10, 92); }
          else { s = MT.rint(20, 100); l = MT.rint(20, 80); }
          var r = hsl2rgb(hh, s, l);
          list.push(rgb2hex(r[0], r[1], r[2]).toUpperCase());
        }
        MT.clear(out);
        var grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: '8px', padding: '13px' } });
        list.forEach(function (hx) {
          grid.appendChild(h('button.swatch', { style: { background: hx, height: '96px' }, title: 'Kopioi ' + hx, onclick: function () { MT.copy(hx); } }, h('span', { text: hx })));
        });
        out.appendChild(grid);
        out.appendChild(h('div.panel-foot', null, [
          c.btn('Arvo uudelleen', { cls: 'btn-sm btn-pri', icon: 'i-refresh', on: gen }),
          c.btn('Kopioi kaikki', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(list.join('\n')); } })
        ]));
      }
      root.appendChild(c.panel('ASETUKSET', 'i-filter', h('div.panel-body', null, box)));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('VÄRIT', 'i-dice', out)));
      gen();
    }
  });

  /* ---------- 14. Tailwind-värit ---------- */
  var TW = {
    slate: ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a'],
    gray: ['#f9fafb', '#f3f4f6', '#e5e7eb', '#d1d5db', '#9ca3af', '#6b7280', '#4b5563', '#374151', '#1f2937', '#111827'],
    red: ['#fef2f2', '#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d'],
    orange: ['#fff7ed', '#ffedd5', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12'],
    amber: ['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f'],
    green: ['#f0fdf4', '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534', '#14532d'],
    teal: ['#f0fdfa', '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59', '#134e4a'],
    blue: ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a'],
    indigo: ['#eef2ff', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81'],
    violet: ['#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95'],
    pink: ['#fdf2f8', '#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6', '#ec4899', '#db2777', '#be185d', '#9d174d', '#831843']
  };
  var TW_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
  R({
    id: 'tailwind-varit', cat: 'design', name: 'Tailwind-värit', icon: 'i-grid', kind: 'custom',
    desc: 'Selaa Tailwindin väripaletti ja etsi lähin Tailwind-vastine omalle värillesi.',
    keys: ['tailwind', 'väri', 'paletti', 'utility', 'css'],
    render: function (root, c) {
      var inp = h('input.ctl.mono', { value: '#E8323C', placeholder: '#RRGGBB' });
      var near = h('div');
      function findNear() {
        var rgb = parseColor(inp.value);
        MT.clear(near);
        if (!rgb) { near.appendChild(c.empty('Tuntematon väri', 'Syötä HEX-, RGB- tai HSL-arvo.')); return; }
        var best = [];
        Object.keys(TW).forEach(function (name) {
          TW[name].forEach(function (hx, i) {
            var t = hex2rgb(hx);
            var d = Math.pow(t[0] - rgb[0], 2) + Math.pow(t[1] - rgb[1], 2) + Math.pow(t[2] - rgb[2], 2);
            best.push({ n: name + '-' + TW_STEPS[i], hx: hx, d: d });
          });
        });
        best.sort(function (a, b) { return a.d - b.d; });
        near.appendChild(c.resList(best.slice(0, 5).map(function (b, i) {
          return { k: (i === 0 ? '★ ' : '') + b.n, v: b.hx.toUpperCase() + '  ·  ero ' + Math.round(Math.sqrt(b.d)), big: i === 0 };
        })));
        var sw = h('div', { style: { display: 'flex', gap: '6px', padding: '11px' } });
        sw.appendChild(h('div', { style: { flex: '1', height: '44px', borderRadius: '4px', background: rgb2hex(rgb[0], rgb[1], rgb[2]), border: '1px solid var(--bd)' } }));
        sw.appendChild(h('div', { style: { flex: '1', height: '44px', borderRadius: '4px', background: best[0].hx, border: '1px solid var(--bd)' } }));
        near.appendChild(sw);
      }
      inp.addEventListener('input', MT.debounce(findNear, 160));
      var grid = h('div', { style: { padding: '11px', overflow: 'auto' } });
      Object.keys(TW).forEach(function (name) {
        var row = h('div', { style: { display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px' } });
        row.appendChild(h('span.lbl', { text: name, style: { width: '62px', flex: 'none' } }));
        TW[name].forEach(function (hx, i) {
          row.appendChild(h('button', {
            style: { flex: '1', height: '34px', background: hx, border: '1px solid var(--bd)', borderRadius: '3px', cursor: 'pointer', minWidth: '28px' },
            title: name + '-' + TW_STEPS[i] + ' · ' + hx,
            onclick: function () { MT.copy(hx.toUpperCase(), name + '-' + TW_STEPS[i] + ' kopioitu'); }
          }));
        });
        grid.appendChild(row);
      });
      root.appendChild(h('div.home-grid', null, [
        c.panel('TAILWIND-PALETTI', 'i-grid', grid),
        c.panel('LÄHIN VASTINE', 'i-search', h('div', null, [h('div.panel-body', null, h('div.field', null, [h('label', { text: 'Oma väri' }), inp])), near]))
      ]));
      findNear();
    }
  });
})();
