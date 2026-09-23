/* MettisTool — ydin: rekisteri, tila, reititys, apufunktiot */
var MT = (function () {
  'use strict';

  var VERSION = '1.0.0';
  var KEY = 'mettistool.v1';

  var CATS = [
    { id: 'laskurit',     name: 'Laskurit',            icon: 'i-calc',    desc: 'Matematiikka, talous ja yksiköt' },
    { id: 'kehittaja',    name: 'Kehittäjä',           icon: 'i-code',    desc: 'JSON, muotoilu, koodaus, API' },
    { id: 'teksti',       name: 'Teksti',              icon: 'i-text',    desc: 'Muunna, analysoi, siisti' },
    { id: 'kuvat',        name: 'Kuvat',               icon: 'i-image',   desc: 'Pakkaa, muunna, optimoi' },
    { id: 'tiedostot',    name: 'Tiedostot',           icon: 'i-file',    desc: 'Muunna, tarkastele, tiivistä' },
    { id: 'turvallisuus', name: 'Turvallisuus',        icon: 'i-shield',  desc: 'Salasanat, tiivisteet, tokenit' },
    { id: 'web',          name: 'Web',                 icon: 'i-globe',   desc: 'URL, DNS, otsakkeet, SEO' },
    { id: 'design',       name: 'Design',              icon: 'i-palette', desc: 'Värit, gradientit, CSS' },
    { id: 'data',         name: 'Data',                icon: 'i-db',      desc: 'CSV, JSON, tilastot' },
    { id: 'aika',         name: 'Aika',                icon: 'i-clock',   desc: 'Kellot, ajastimet, päivämäärät' },
    { id: 'tuottavuus',   name: 'Tuottavuus',          icon: 'i-checksq', desc: 'Muistiinpanot, tehtävät, fokus' },
    { id: 'verkko',       name: 'Verkko / Järjestelmä', icon: 'i-net',    desc: 'IP, portit, kantaluvut' },
    { id: 'tekniikka',    name: 'Tekniikka',           icon: 'i-wrench',  desc: 'Fysiikka, sähkö, yksiköt' }
  ];

  var tools = [], byId = Object.create(null);

  /* ---------- tallennus ---------- */
  var DEF = {
    fav: [], recent: [], usage: {}, log: {},
    open: {}, data: {},
    s: {
      theme: 'dark', accent: 'crimson', wrap: false, indent: 2,
      toasts: true, sidebar: true, autorun: true, confirmReset: false, monoSize: 12
    }
  };
  var db = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEF));
      var o = JSON.parse(raw);
      var d = JSON.parse(JSON.stringify(DEF));
      for (var k in o) if (k !== 's') d[k] = o[k];
      if (o.s) for (var j in o.s) d.s[j] = o.s[j];
      return d;
    } catch (e) { return JSON.parse(JSON.stringify(DEF)); }
  }
  var saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(db)); }
      catch (e) { toast('Tallennustila on täynnä', 'err'); }
    }, 220);
  }
  function wipe() { try { localStorage.removeItem(KEY); } catch (e) {} db = JSON.parse(JSON.stringify(DEF)); }

  /* ---------- DOM-apurit ---------- */
  function h(tag, attrs, kids) {
    var m = /^([a-z0-9]+)?(.*)$/i.exec(tag), node = document.createElement(m[1] || 'div');
    var cls = (m[2].match(/\.[^.#]+/g) || []).map(function (c) { return c.slice(1); });
    if (cls.length) node.className = cls.join(' ');
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') node.className += (node.className ? ' ' : '') + v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') for (var p in v) node.style[p] = v[p];
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'dataset') for (var d in v) node.dataset[d] = v[d];
      else node.setAttribute(k, v === true ? '' : v);
    }
    if (kids != null) append(node, kids);
    return node;
  }
  function append(node, kids) {
    if (kids == null || kids === false) return node;
    if (Array.isArray(kids)) { kids.forEach(function (k) { append(node, k); }); return node; }
    node.appendChild(kids.nodeType ? kids : document.createTextNode(String(kids)));
    return node;
  }
  function icon(name, cls) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    var u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    u.setAttribute('href', '#' + name);
    s.appendChild(u);
    return s;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function qs(s, r) { return (r || document).querySelector(s); }
  function qsa(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function debounce(fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms || 180); }; }

  /* ---------- numerot & muotoilu ---------- */
  var NF = new Intl.NumberFormat('fi-FI');
  function num(n, dec) {
    if (n == null || !isFinite(n)) return '–';
    if (dec == null) return NF.format(n);
    return new Intl.NumberFormat('fi-FI', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
  }
  function numAuto(n) {
    if (!isFinite(n)) return '–';
    var a = Math.abs(n);
    if (a !== 0 && (a < 1e-4 || a >= 1e15)) return n.toExponential(6).replace('.', ',');
    var d = a >= 1000 ? 2 : a >= 1 ? 4 : 6;
    return num(+n.toFixed(d));
  }
  function parseNum(v) {
    if (typeof v === 'number') return v;
    if (v == null) return NaN;
    var s = String(v).trim().replace(/\s|\u00a0/g, '').replace(/,/g, '.');
    if (!s) return NaN;
    return parseFloat(s);
  }
  function bytes(b) {
    if (!isFinite(b)) return '–';
    var u = ['B', 'kB', 'MB', 'GB', 'TB'], i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return num(+b.toFixed(i ? 2 : 0)) + ' ' + u[i];
  }
  function pad(n, l) { return String(n).padStart(l || 2, '0'); }
  function dateStr(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function timeAgo(ts) {
    var s = (Date.now() - ts) / 1000;
    if (s < 60) return 'juuri nyt';
    if (s < 3600) return Math.floor(s / 60) + ' min sitten';
    if (s < 86400) return Math.floor(s / 3600) + ' h sitten';
    if (s < 604800) return Math.floor(s / 86400) + ' pv sitten';
    return new Date(ts).toLocaleDateString('fi-FI');
  }

  /* ---------- rekisteri ---------- */
  /* hakunormalisointi: ääkköset ja kirjainkoko pois, jotta "vari" löytää "Värinvalitsin" */
  var FOLD = { 'ä': 'a', 'ö': 'o', 'å': 'a', 'é': 'e', 'è': 'e', 'ü': 'u', 'ø': 'o', 'æ': 'a', 'š': 's', 'ž': 'z' };
  function norm(s) {
    return String(s).toLowerCase().replace(/[äöåéèüøæšž]/g, function (c) { return FOLD[c]; });
  }

  function reg(t) {
    if (byId[t.id]) { console.warn('Duplikaatti-ID:', t.id); return; }
    t.kind = t.kind || 'form';
    t.icon = t.icon || (catById(t.cat) || {}).icon || 'i-zap';
    t.nameN = norm(t.name);
    t.search = norm(t.name + ' ' + t.id + ' ' + (t.desc || '') + ' ' + (t.keys || []).join(' ') + ' ' + ((catById(t.cat) || {}).name || ''));
    byId[t.id] = t; tools.push(t);
  }
  function catById(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i]; return null; }
  function byCat(id) { return tools.filter(function (t) { return t.cat === id; }); }

  /* ---------- haku ---------- */
  function score(t, q) {
    var n = t.nameN, i;
    if (n === q) return 1000;
    if (n.indexOf(q) === 0) return 800 - n.length;
    i = n.indexOf(q); if (i > 0) return 600 - i;
    i = t.search.indexOf(q); if (i >= 0) return 380 - Math.min(i, 200);
    // pehmeä osumahaku (kirjaimet järjestyksessä)
    var p = 0, sc = 0;
    for (var c = 0; c < q.length; c++) {
      var f = n.indexOf(q[c], p);
      if (f < 0) return 0;
      sc += f === p ? 6 : 2; p = f + 1;
    }
    return 120 + sc;
  }
  function search(q, limit) {
    q = norm((q || '').trim());
    if (!q) return [];
    var out = [];
    for (var i = 0; i < tools.length; i++) {
      var s = score(tools[i], q);
      if (s > 0) out.push({ t: tools[i], s: s + Math.min((db.usage[tools[i].id] || 0) * 3, 60) });
    }
    out.sort(function (a, b) { return b.s - a.s; });
    return out.slice(0, limit || 40).map(function (o) { return o.t; });
  }

  /* ---------- suosikit & historia ---------- */
  function isFav(id) { return db.fav.indexOf(id) >= 0; }
  function toggleFav(id) {
    var i = db.fav.indexOf(id);
    if (i >= 0) db.fav.splice(i, 1); else db.fav.unshift(id);
    save(); emit('fav', id);
    return i < 0;
  }
  function touch(id) {
    db.usage[id] = (db.usage[id] || 0) + 1;
    db.recent = db.recent.filter(function (r) { return r.id !== id; });
    db.recent.unshift({ id: id, t: Date.now() });
    if (db.recent.length > 40) db.recent.length = 40;
    var d = dateStr(); db.log[d] = (db.log[d] || 0) + 1;
    var keys = Object.keys(db.log);
    if (keys.length > 60) { keys.sort(); keys.slice(0, keys.length - 60).forEach(function (k) { delete db.log[k]; }); }
    save();
  }
  function recentTools() { return db.recent.map(function (r) { return byId[r.id] ? { t: byId[r.id], at: r.t } : null; }).filter(Boolean); }
  function topTools(n) {
    return Object.keys(db.usage).map(function (id) { return byId[id] ? { t: byId[id], n: db.usage[id] } : null; })
      .filter(Boolean).sort(function (a, b) { return b.n - a.n; }).slice(0, n || 6);
  }

  /* ---------- tapahtumat ---------- */
  var subs = {};
  function on(ev, fn) { (subs[ev] = subs[ev] || []).push(fn); }
  function emit(ev, a) { (subs[ev] || []).forEach(function (f) { f(a); }); }

  /* ---------- toast ---------- */
  function toast(msg, kind) {
    if (db.s.toasts === false && kind !== 'err') return;
    var box = qs('#toasts'); if (!box) return;
    var ic = kind === 'err' ? 'i-alert' : kind === 'warn' ? 'i-alert' : kind === 'ok' ? 'i-check' : 'i-info';
    var n = h('div.toast' + (kind ? '.' + kind : ''), null, [icon(ic), h('span', { text: msg })]);
    box.appendChild(n);
    setTimeout(function () { n.classList.add('out'); setTimeout(function () { n.remove(); }, 160); }, 2400);
  }

  /* ---------- leikepöytä & lataus ---------- */
  function copy(text, label) {
    text = String(text == null ? '' : text);
    var done = function () { toast(label || 'Kopioitu leikepöydälle', 'ok'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = h('textarea', { style: { position: 'fixed', opacity: '0', top: '0' } });
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Kopiointi epäonnistui', 'err'); }
      ta.remove();
    }
  }
  function download(data, name, mime) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob), a = h('a', { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast('Ladattu: ' + name, 'ok');
  }
  function readFile(file, as) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(new Error('Tiedoston luku epäonnistui')); };
      if (as === 'buf') r.readAsArrayBuffer(file);
      else if (as === 'url') r.readAsDataURL(file);
      else r.readAsText(file);
    });
  }
  function pickFile(accept, multi) {
    return new Promise(function (res) {
      var i = h('input', { type: 'file', accept: accept || '', multiple: !!multi, style: { display: 'none' } });
      i.onchange = function () { res(multi ? Array.prototype.slice.call(i.files) : i.files[0]); i.remove(); };
      document.body.appendChild(i); i.click();
    });
  }

  /* ---------- syntaksiväritys ---------- */
  var HL = {
    json: function (s) {
      return esc(s).replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
        function (m, str, colon, bool) {
          if (str) return '<span class="' + (colon ? 'tk-key' : 'tk-str') + '">' + str + '</span>' + (colon || '');
          if (bool) return '<span class="tk-bool">' + m + '</span>';
          if (m === 'null') return '<span class="tk-null">null</span>';
          return '<span class="tk-num">' + m + '</span>';
        });
    },
    xml: function (s) {
      return esc(s)
        .replace(/&lt;!--[\s\S]*?--&gt;/g, '<span class="tk-com">$&</span>')
        .replace(/(&lt;\/?)([\w:.-]+)/g, '$1<span class="tk-tag">$2</span>')
        .replace(/([\w:-]+)=(&quot;[^&]*?&quot;)/g, '<span class="tk-attr">$1</span>=<span class="tk-str">$2</span>');
    },
    code: function (s) {
      return esc(s)
        .replace(/(\/\*[\s\S]*?\*\/|\/\/[^\n]*|--[^\n]*|#[^\n]*)/g, '<span class="tk-com">$1</span>')
        .replace(/('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)/g, '<span class="tk-str">$1</span>')
        .replace(/\b(function|return|const|let|var|if|else|for|while|class|new|import|export|from|await|async|try|catch|throw|typeof|SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|JOIN|LEFT|RIGHT|INNER|GROUP|ORDER|BY|LIMIT|AND|OR|NOT|NULL|AS|ON|CREATE|TABLE)\b/g, '<span class="tk-kw">$1</span>')
        .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tk-num">$1</span>');
    },
    css: function (s) {
      return esc(s)
        .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tk-com">$1</span>')
        .replace(/([\w-]+)(\s*:)/g, '<span class="tk-key">$1</span>$2')
        .replace(/(#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(px|rem|em|%|s|ms|deg|vh|vw|fr)?\b)/g, '<span class="tk-num">$1</span>');
    },
    none: esc
  };
  function highlight(text, lang) { return (HL[lang] || HL.none)(text); }

  /* ---------- reititys ---------- */
  function go(hash) { if (location.hash === hash) emit('route', hash); else location.hash = hash; }
  function openTool(id) { go('#/t/' + id); }
  function route() {
    var p = (location.hash || '#/koti').replace(/^#\/?/, '').split('/');
    return { page: p[0] || 'koti', arg: decodeURIComponent(p[1] || '') };
  }

  /* ---------- muut ---------- */
  function uid(n) {
    var a = new Uint8Array(n || 8); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function rint(min, max) {
    var r = new Uint32Array(1), range = max - min + 1;
    if (range <= 0) return min;
    var lim = Math.floor(4294967296 / range) * range;
    do { crypto.getRandomValues(r); } while (r[0] >= lim);
    return min + (r[0] % range);
  }
  function pick(arr) { return arr[rint(0, arr.length - 1)]; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = rint(0, i), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  return {
    VERSION: VERSION, CATS: CATS, tools: tools, byId: byId, db: db,
    reg: reg, catById: catById, byCat: byCat, search: search, norm: norm,
    h: h, icon: icon, esc: esc, qs: qs, qsa: qsa, clear: clear, append: append, debounce: debounce,
    num: num, numAuto: numAuto, parseNum: parseNum, bytes: bytes, pad: pad, dateStr: dateStr, timeAgo: timeAgo,
    isFav: isFav, toggleFav: toggleFav, touch: touch, recentTools: recentTools, topTools: topTools,
    save: save, wipe: wipe, on: on, emit: emit, toast: toast, copy: copy, download: download,
    readFile: readFile, pickFile: pickFile, highlight: highlight,
    go: go, openTool: openTool, route: route,
    uid: uid, rint: rint, pick: pick, shuffle: shuffle
  };
})();
