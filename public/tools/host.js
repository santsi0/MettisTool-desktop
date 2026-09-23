/*
 * MettisTool — työkalumoottori.
 *
 * Piirtää yksittäisen työkalun annettuun elementtiin. Tämä on vaiheen 1
 * renderöintimoottori sellaisenaan; kuori, reititys ja asetukset tulevat
 * React-puolelta. Tallennus ei mene selaimen localStorageen vaan
 * MT_HOST-sillan kautta Rustin SQLite-tietokantaan käyttäjäkohtaisesti.
 */
(function () {
  'use strict';

  var H = window.MT_HOST;
  var h = MT.h, icon = MT.icon, db = MT.db;
  var timers = [];
  var saveTimer = 0;

  function tr(key, vars) { return H.t(key, vars); }

  /* =============== sillan kytkentä =============== */

  // Vaiheen 1 core.js luki localStoragen — tyhjennetään se, jotta eri
  // käyttäjien tiedot eivät koskaan näy toisilleen samalla koneella.
  try { localStorage.removeItem('mettistool.v1'); } catch (e) { /* estetty on ok */ }

  /**
   * Vaihtaa sillan ja lataa käyttäjän tilan muistiin. Kutsutaan kerran
   * latauksessa ja uudelleen jokaisen kirjautumisen yhteydessä, jottei
   * edellisen käyttäjän data jää näkyviin.
   */
  MT.reseed = function (host) {
    clearTimeout(saveTimer);
    saveTimer = 0;
    H = host;
    window.MT_HOST = host;
    Object.keys(db).forEach(function (k) { delete db[k]; });
    db.fav = host.state.fav || [];
    db.recent = host.state.recent || [];
    db.usage = host.state.usage || {};
    db.log = host.state.log || {};
    db.open = host.state.open || {};
    db.data = host.state.data || {};
    db.s = host.state.s || {};
  };

  MT.reseed(H);

  MT.save = function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      H.saveState({ open: db.open, data: db.data, s: db.s, log: db.log });
    }, 260);
  };
  MT.wipe = function () { H.saveState({ open: {}, data: {}, s: db.s, log: {} }); };
  MT.toast = function (msg, kind) { H.toast(String(msg), kind || 'info'); };
  MT.go = function (hash) { H.go(String(hash)); };
  MT.openTool = function (id) { H.open(String(id)); };
  MT.route = function () { return H.route(); };

  MT.copy = function (text, label) {
    var s = String(text == null ? '' : text);
    navigator.clipboard.writeText(s).then(
      function () { H.toast(label || tr('common.copied'), 'ok'); },
      function () { H.toast(tr('err.internal'), 'err'); }
    );
  };

  MT.download = function (data, name, mime) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    H.toast(name, 'ok');
  };

  MT.toggleFav = function (id) {
    var i = db.fav.indexOf(id), on = i < 0;
    if (on) db.fav.unshift(id); else db.fav.splice(i, 1);
    H.setFav(id, on);
    return on;
  };

  MT.touch = function (id) {
    db.usage[id] = (db.usage[id] || 0) + 1;
    db.recent = db.recent.filter(function (r) { return r.id !== id; });
    db.recent.unshift({ id: id, t: Date.now() });
    if (db.recent.length > 40) db.recent.length = 40;
    var d = MT.dateStr();
    db.log[d] = (db.log[d] || 0) + 1;
    H.touch(id);
    MT.save();
  };

  /* =============== apukomponentit =============== */

  function lbl(t) { return h('span.lbl', { text: t }); }
  function sectHead(title, iconName, right) {
    return h('div.sect-head', null, [iconName ? icon(iconName) : null, lbl(title), h('span.grow'), right]);
  }
  function panel(title, iconName, body, right) {
    return h('section.panel', null, [
      title ? h('div.panel-head', null, [iconName ? icon(iconName) : null, lbl(title), h('span.grow'), right]) : null,
      body
    ]);
  }
  function btn(text, opts) {
    opts = opts || {};
    var b = h('button.btn' + (opts.cls ? '.' + opts.cls : ''), { title: opts.title || '', type: 'button' },
      [opts.icon ? icon(opts.icon) : null, text ? h('span', { text: text }) : null]);
    if (opts.on) b.addEventListener('click', opts.on);
    return b;
  }
  function note(text, kind, ic) {
    return h('div.note' + (kind ? '.' + kind : ''), null, [
      icon(ic || (kind === 'err' || kind === 'warn' ? 'i-alert' : 'i-info')),
      h('div', { html: typeof text === 'string' ? text : '' }, typeof text === 'string' ? null : text)
    ]);
  }
  function empty(title, sub, ic) {
    return h('div.empty', null, [icon(ic || 'i-grid', 'ic-lg'), h('b', { text: title }), sub ? h('span', { text: sub }) : null]);
  }

  /* =============== kentät =============== */

  function field(f, onChange) {
    var input, wrap;
    var id = 'f_' + f.k + '_' + Math.random().toString(36).slice(2, 7);
    var v = f.def;
    if (f.type === 'check') {
      input = h('input', { type: 'checkbox', id: id });
      input.checked = !!v;
      wrap = h('label.check', { for: id }, [input, h('span', { text: f.label })]);
    } else if (f.type === 'select') {
      input = h('select.ctl', { id: id });
      (f.opts || []).forEach(function (o) {
        var val = Array.isArray(o) ? o[0] : o, txt = Array.isArray(o) ? o[1] : o;
        input.appendChild(h('option', { value: val, text: txt }));
      });
      if (v != null) input.value = v;
      wrap = h('div.field', null, [h('label', { for: id, text: f.label }), input, f.hint ? h('span.hint', { text: f.hint }) : null]);
    } else if (f.type === 'textarea') {
      input = h('textarea.ctl', { id: id, rows: f.rows || 4, placeholder: f.ph || '', spellcheck: 'false' });
      input.value = v == null ? '' : v;
      wrap = h('div.field', null, [h('label', { for: id, text: f.label }), input, f.hint ? h('span.hint', { text: f.hint }) : null]);
    } else if (f.type === 'range') {
      var out = h('span.mono', { text: String(v) });
      input = h('input.ctl', { type: 'range', id: id, min: f.min, max: f.max, step: f.step || 1, value: v });
      input.addEventListener('input', function () { out.textContent = input.value + (f.suffix || ''); });
      out.textContent = v + (f.suffix || '');
      wrap = h('div.field', null, [h('label', { for: id }, [f.label, h('span.grow'), out]), input]);
      wrap.firstChild.style.display = 'flex';
    } else {
      var type = f.type === 'num' ? 'text' : (f.type || 'text');
      input = h('input.ctl' + (f.mono ? '.mono' : ''), {
        type: type, id: id, placeholder: f.ph || '', spellcheck: 'false', autocomplete: 'off',
        inputmode: f.type === 'num' ? 'decimal' : null, min: f.min, max: f.max, step: f.step
      });
      input.value = v == null ? '' : v;
      wrap = h('div.field', null, [h('label', { for: id, text: f.label }), input, f.hint ? h('span.hint', { text: f.hint }) : null]);
    }
    input.dataset.k = f.k;
    input.dataset.ftype = f.type || 'text';
    if (onChange) {
      input.addEventListener(f.type === 'check' || f.type === 'select' || f.type === 'color' ? 'change' : 'input', onChange);
      if (f.type === 'range') input.addEventListener('change', onChange);
    }
    if (f.width) wrap.style.gridColumn = 'span ' + f.width;
    return wrap;
  }
  function fieldsBox(fields, onChange, cls) {
    var box = h('div.fields' + (cls ? '.' + cls : ''));
    (fields || []).forEach(function (f) { box.appendChild(field(f, onChange)); });
    return box;
  }
  function readFields(root, fields) {
    var v = {};
    (fields || []).forEach(function (f) {
      var el = root.querySelector('[data-k="' + f.k + '"]');
      if (!el) { v[f.k] = f.def; return; }
      if (f.type === 'check') v[f.k] = el.checked;
      else if (f.type === 'num' || f.type === 'range') v[f.k] = MT.parseNum(el.value);
      else v[f.k] = el.value;
    });
    return v;
  }

  /* =============== tuloslistat =============== */

  function resRow(r) {
    return h('div.res-row' + (r.big ? '.big' : '') + (r.sub ? '.sub' : ''), null, [
      h('span.k', null, [r.icon ? icon(r.icon) : null, r.k]),
      h('span.v', { text: r.v == null ? '–' : String(r.v) }),
      r.copy === false ? null : btn('', {
        cls: 'btn-gh btn-sm copy-mini', icon: 'i-copy', title: tr('common.copy'),
        on: function () { MT.copy(r.v); }
      })
    ]);
  }
  function resList(rows) { return h('div.res', null, rows.filter(Boolean).map(resRow)); }

  function table(head, rows, opts) {
    opts = opts || {};
    var t = h('table.tbl', null, [
      h('thead', null, h('tr', null, head.map(function (x) { return h('th', { text: x }); }))),
      h('tbody', null, rows.map(function (r) {
        return h('tr', null, r.map(function (c, i) {
          return h('td' + (opts.text && opts.text.indexOf(i) >= 0 ? '.n' : ''),
            c && c.nodeType ? null : { text: c == null ? '' : String(c) }, c && c.nodeType ? c : null);
        }));
      }))
    ]);
    return h('div.tbl-wrap', null, t);
  }

  /* =============== editori =============== */

  function mkEditor(o) {
    o = o || {};
    var nums = h('div.ed-nums', { text: '1' });
    var area, drop = h('div.ed-drop', null, [icon('i-upload'), h('span', { text: ' ' + tr('tool.dropFile') })]);
    if (o.readonly) area = h('pre.ed-out', { tabindex: '0' });
    else area = h('textarea.ed-in', {
      placeholder: o.placeholder || tr('tool.inputPlaceholder'),
      spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off'
    });
    var acts = h('div.acts');
    var ed = h('div.ed' + (db.s.wrap ? '.wrap-on' : ''), null, [
      h('div.ed-head', null, [lbl(o.label || ''), o.badge || null, acts]),
      h('div.ed-area', null, [o.nums === false ? null : nums, area, o.drop ? drop : null])
    ]);
    if (o.height) ed.style.height = o.height;

    function updNums() {
      if (o.nums === false) return;
      var txt = o.readonly ? area.textContent : area.value;
      var n = txt ? txt.split('\n').length : 1;
      var cur = nums.textContent ? nums.textContent.split('\n').length : 0;
      if (n !== cur) {
        var s = '';
        for (var i = 1; i <= n; i++) s += i + (i < n ? '\n' : '');
        nums.textContent = s;
      }
      nums.scrollTop = area.scrollTop;
    }
    area.addEventListener('scroll', function () { nums.scrollTop = area.scrollTop; });
    if (!o.readonly) {
      area.addEventListener('input', function () { updNums(); if (o.onInput) o.onInput(); });
      area.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab') return;
        e.preventDefault();
        var s = area.selectionStart, en = area.selectionEnd;
        area.value = area.value.slice(0, s) + '  ' + area.value.slice(en);
        area.selectionStart = area.selectionEnd = s + 2;
        updNums();
        if (o.onInput) o.onInput();
      });
    }
    if (o.drop) {
      ['dragenter', 'dragover'].forEach(function (e) {
        ed.addEventListener(e, function (ev) { ev.preventDefault(); ed.classList.add('dragging'); });
      });
      ['dragleave', 'drop'].forEach(function (e) {
        ed.addEventListener(e, function (ev) {
          ev.preventDefault();
          if (e === 'dragleave' && ed.contains(ev.relatedTarget)) return;
          ed.classList.remove('dragging');
        });
      });
      ed.addEventListener('drop', function (ev) {
        var f = ev.dataTransfer.files && ev.dataTransfer.files[0];
        if (f) o.drop(f);
      });
    }
    return {
      el: ed, acts: acts, area: area,
      get: function () { return o.readonly ? area.textContent : area.value; },
      set: function (t, lang) {
        if (o.readonly) {
          area.classList.remove('empty-state');
          if (lang && lang !== 'none' && t.length < 200000) area.innerHTML = MT.highlight(t, lang);
          else area.textContent = t;
        } else area.value = t;
        updNums();
      },
      placeholder: function (msg) {
        if (!o.readonly) return;
        area.classList.add('empty-state');
        area.textContent = msg;
        nums.textContent = '1';
      },
      focus: function () { area.focus(); },
      wrap: function (on) { ed.classList.toggle('wrap-on', on); }
    };
  }

  function splitView(left, right) {
    var g = h('div.gutterbar');
    var box = h('div.split', null, [left, g, right]);
    var drag = false;
    g.addEventListener('pointerdown', function (e) {
      drag = true; g.setPointerCapture(e.pointerId); document.body.style.cursor = 'col-resize';
    });
    g.addEventListener('pointerup', function (e) {
      drag = false; g.releasePointerCapture(e.pointerId); document.body.style.cursor = '';
    });
    g.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var r = box.getBoundingClientRect(), p = (e.clientX - r.left) / r.width;
      p = Math.max(.18, Math.min(.82, p));
      box.style.gridTemplateColumns = (p * 100).toFixed(2) + '% 5px minmax(0,1fr)';
    });
    return box;
  }

  function statusbar(items) {
    var sb = h('div.statusbar');
    sb.set = function (list) {
      MT.clear(sb);
      list.filter(Boolean).forEach(function (it) {
        sb.appendChild(h('span.st' + (it.kind ? '.' + it.kind : ''), null, [
          it.dot ? h('i.dot' + (it.kind ? '.' + it.kind : '')) : null,
          it.k ? h('span.lbl', { text: it.k }) : null,
          h('b', { text: String(it.v) })
        ]));
      });
    };
    sb.set(items || []);
    return sb;
  }

  /* =============== syöte/tulos-työkalut =============== */

  function renderIO(t, body, ctx) {
    var o = t.io || {};
    var optFields = o.opts || [];
    var inEd = mkEditor({
      label: o.inLabel || tr('tool.input'), placeholder: o.placeholder,
      drop: o.accept !== false ? onDrop : null,
      onInput: function () { if (db.s.autorun !== false) run(); }
    });
    var outEd = mkEditor({ label: o.outLabel || tr('tool.output'), readonly: true, nums: o.outNums !== false });
    var sb = statusbar([{ k: tr('tool.state'), v: tr('tool.waiting') }]);
    var optBox = optFields.length
      ? h('div.panel', { style: { marginBottom: '11px' } }, h('div.panel-body', null, fieldsBox(optFields, function () { run(); })))
      : null;

    function onDrop(f) {
      if (f.size > 12e6) { MT.toast(tr('tool.fileTooLarge'), 'err'); return; }
      MT.readFile(f).then(function (txt) { inEd.set(txt); run(); });
    }

    inEd.acts.appendChild(btn('', {
      cls: 'btn-gh btn-sm', icon: 'i-upload', title: tr('tool.openFile'),
      on: function () { MT.pickFile(o.acceptExt || '').then(function (f) { if (f) onDrop(f); }); }
    }));
    if (o.sample) {
      inEd.acts.appendChild(btn(tr('tool.sample'), {
        cls: 'btn-gh btn-sm',
        on: function () { inEd.set(typeof o.sample === 'function' ? o.sample() : o.sample); run(); }
      }));
    }
    inEd.acts.appendChild(btn('', {
      cls: 'btn-gh btn-sm', icon: 'i-trash', title: tr('tool.clear'),
      on: function () { inEd.set(''); run(); inEd.focus(); }
    }));
    outEd.acts.appendChild(btn('', {
      cls: 'btn-gh btn-sm', icon: 'i-copy', title: tr('tool.copyResult'),
      on: function () { MT.copy(outEd.get()); }
    }));
    outEd.acts.appendChild(btn('', {
      cls: 'btn-gh btn-sm', icon: 'i-download', title: tr('tool.download'),
      on: function () {
        var txt = outEd.get();
        if (!txt) { MT.toast(tr('tool.nothingToSave'), 'warn'); return; }
        MT.download(txt, (o.file || t.id) + (o.ext || '.txt'), o.mime);
      }
    }));

    var actions = h('div.btn-row', { style: { marginBottom: '11px' } }, [
      btn(tr('tool.run'), { cls: 'btn-pri', icon: 'i-play', title: 'Ctrl+Enter', on: run }),
      btn(tr('tool.copyResult'), { icon: 'i-copy', on: function () { MT.copy(outEd.get()); } }),
      btn(tr('tool.swap'), { icon: 'i-refresh', on: function () { var v = outEd.get(); if (v) { inEd.set(v); run(); } } }),
      btn(tr('tool.clear'), { icon: 'i-trash', on: function () { inEd.set(''); run(); inEd.focus(); } }),
      h('span.grow'),
      btn(tr('tool.wrap'), {
        cls: db.s.wrap ? 'on' : '', icon: 'i-text',
        on: function (e) {
          db.s.wrap = !db.s.wrap; MT.save();
          inEd.wrap(db.s.wrap); outEd.wrap(db.s.wrap);
          e.currentTarget.classList.toggle('on', db.s.wrap);
        }
      })
    ]);

    if (optBox) body.appendChild(optBox);
    body.appendChild(actions);
    var sp = splitView(inEd.el, outEd.el);
    sp.style.minHeight = '340px';
    inEd.el.style.minHeight = outEd.el.style.minHeight = '340px';
    body.appendChild(sp);
    body.appendChild(sb);
    if (o.foot) body.appendChild(h('div', { style: { marginTop: '11px' } }, o.foot(ctx)));

    var busy = false;
    function run() {
      var text = inEd.get();
      if (!text.trim() && !o.allowEmpty) {
        outEd.placeholder(o.emptyText || tr('tool.emptyHint'));
        sb.set([{ k: tr('tool.state'), v: tr('tool.waiting') }]);
        return;
      }
      var vals = optBox ? readFields(optBox, optFields) : {};
      var t0 = performance.now();
      if (busy) return;
      busy = true;
      var res;
      try { res = o.run(text, vals, ctx); } catch (e) { busy = false; return fail(e); }
      if (res && typeof res.then === 'function') {
        sb.set([{ k: tr('tool.state'), v: tr('tool.working') }]);
        res.then(function (r) { busy = false; ok(r, t0); }, function (e) { busy = false; fail(e); });
      } else { busy = false; ok(res, t0); }
    }
    function ok(r, t0) {
      if (r == null) return;
      if (typeof r === 'string') r = { out: r };
      var ms = performance.now() - t0;
      outEd.set(r.out == null ? '' : r.out, r.lang || o.lang);
      var txt = r.out == null ? '' : String(r.out);
      var st = [
        { k: '', v: r.status || tr('tool.done'), kind: r.kind || 'ok', dot: true },
        { k: tr('tool.linesLabel'), v: MT.num(txt ? txt.split('\n').length : 0) },
        { k: tr('tool.charsLabel'), v: MT.num(txt.length) },
        { k: tr('tool.timeLabel'), v: (ms < 1 ? ms.toFixed(2) : Math.round(ms)) + ' ms' }
      ];
      (r.meta || []).forEach(function (m) { st.push({ k: m[0], v: m[1] }); });
      sb.set(st);
    }
    function fail(e) {
      outEd.placeholder('');
      outEd.set(String((e && e.message) || e), 'none');
      sb.set([
        { k: '', v: tr('common.error'), kind: 'err', dot: true },
        { k: tr('tool.reason'), v: String((e && e.message) || e).slice(0, 90) }
      ]);
    }

    outEd.placeholder(o.emptyText || tr('tool.emptyHint'));
    if (o.sample && o.auto !== false) {
      inEd.set(typeof o.sample === 'function' ? o.sample() : o.sample);
      run();
      inEd.area.setSelectionRange(0, 0);
      inEd.area.scrollTop = 0;
      inEd.area.scrollLeft = 0;
    }
    body._run = run;
    setTimeout(function () { inEd.focus(); }, 30);
  }

  /* =============== lomaketyökalut =============== */

  function renderForm(t, body, ctx) {
    var fields = t.fields || [];
    var box = fieldsBox(fields, t.live === false ? null : MT.debounce(run, 140), t.cols);
    var out = h('div', { style: { marginTop: '13px' } });
    var lastOut = '';
    var acts = h('div.btn-row', { style: { marginTop: '12px' } }, [
      btn(t.action || tr('tool.run'), { cls: 'btn-pri', icon: 'i-play', title: 'Ctrl+Enter', on: run }),
      btn(tr('tool.copyResult'), { icon: 'i-copy', on: function () { MT.copy(lastOut || ''); } }),
      btn(tr('tool.reset'), { icon: 'i-refresh', on: function () { MT.clear(body); renderForm(t, body, ctx); } })
    ]);
    body.appendChild(panel(t.inputLabel || tr('tool.input'), 'i-filter', h('div.panel-body', null, [box, t.extra ? t.extra(ctx) : null])));
    body.appendChild(acts);
    body.appendChild(out);

    function run() {
      var v = readFields(box, fields);
      MT.clear(out);
      var r;
      try { r = t.run(v, ctx); } catch (e) { out.appendChild(note(e.message, 'err')); lastOut = ''; return; }
      if (r == null) { out.appendChild(empty(tr('tool.fillInputs'), tr('tool.autoUpdates'))); return; }
      if (r.nodeType) { out.appendChild(r); return; }
      lastOut = r.out || (r.rows || []).map(function (x) { return x.k + ': ' + x.v; }).join('\n');
      if (r.note) out.appendChild(note(r.note.text || r.note, r.note.kind || 'info'));
      if (r.rows) out.appendChild(panel(r.label || tr('tool.output'), 'i-check', resList(r.rows)));
      if (r.table) out.appendChild(h('div', { style: { marginTop: '11px' } }, table(r.table.head, r.table.rows, r.table)));
      if (r.html) out.appendChild(h('div', { style: { marginTop: '11px' } }, r.html));
      if (r.foot) out.appendChild(h('div', { style: { marginTop: '11px' } }, note(r.foot, 'info')));
    }
    body._run = run;
    run();
  }

  function addTimer(fn, ms) { var id = setInterval(fn, ms); timers.push(id); return id; }

  /* =============== julkinen rajapinta =============== */

  /** Piirtää työkalun elementtiin. Palauttaa purkufunktion. */
  MT.mount = function (el, toolId) {
    var t = MT.byId[toolId];
    MT.clear(el);
    if (!t) { el.appendChild(note(tr('tool.notFound'), 'err')); return function () {}; }

    var body = h('div.tool-body');
    el.appendChild(body);

    var ctx = {
      tool: t, root: body, h: h, icon: icon, btn: btn, panel: panel, note: note, empty: empty,
      fields: fieldsBox, readFields: readFields, resList: resList, resRow: resRow, table: table,
      editor: mkEditor, split: splitView, statusbar: statusbar, sectHead: sectHead, lbl: lbl,
      toast: MT.toast, copy: MT.copy, download: MT.download, timer: addTimer, field: field
    };

    try {
      if (t.kind === 'io') renderIO(t, body, ctx);
      else if (t.kind === 'custom') t.render(body, ctx);
      else renderForm(t, body, ctx);
    } catch (e) {
      body.appendChild(note(tr('tool.loadFailed') + ' ' + e.message, 'err'));
    }

    MT.touch(t.id);

    function onKey(e) {
      if (e.ctrlKey && e.key === 'Enter' && body._run) { e.preventDefault(); body._run(); }
    }
    el.addEventListener('keydown', onKey);

    return function () {
      el.removeEventListener('keydown', onKey);
      timers.forEach(clearInterval);
      timers = [];
      MT.clear(el);
    };
  };

  // Osa työkaluista rakentaa omia painikkeitaan tämän kautta.
  MT.ui = {
    btn: btn, note: note, panel: panel, empty: empty, table: table, resList: resList,
    field: field, fieldsBox: fieldsBox, readFields: readFields, mkEditor: mkEditor,
    split: splitView, statusbar: statusbar, sectHead: sectHead, lbl: lbl
  };

  /** Työkalun otsikkotoiminnot (jos työkalu tarjoaa niitä). */
  MT.headActions = function (toolId) {
    var t = MT.byId[toolId];
    return t && t.headActions ? t.headActions() : null;
  };

  H.ready();
})();
