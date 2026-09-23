/* Moduuli: Tuottavuus */
(function () {
  'use strict';
  var R = MT.reg, h = MT.h;
  function store(k, def) { if (MT.db.data[k] === undefined) MT.db.data[k] = def; return MT.db.data[k]; }

  /* ---------- 1. Tehtävälista ---------- */
  R({
    id: 'tehtavalista', cat: 'tuottavuus', name: 'Tehtävälista', icon: 'i-checksq', kind: 'custom',
    desc: 'Tehtävät prioriteeteilla. Tallentuu automaattisesti tähän selaimeen.',
    keys: ['tehtävä', 'todo', 'lista', 'muistilista', 'prioriteetti'],
    render: function (root, c) {
      var items = store('todos', []);
      var inp = h('input.ctl', { placeholder: 'Uusi tehtävä… (Enter lisää)' });
      var prio = h('select.ctl', { style: { maxWidth: '150px' } });
      [['normaali', 'Normaali'], ['korkea', 'Korkea'], ['matala', 'Matala']].forEach(function (o) { prio.appendChild(h('option', { value: o[0], text: o[1] })); });
      var list = h('div.rows'), filt = 'kaikki';
      function save() { MT.db.data.todos = items; MT.save(); draw(); }
      function add() {
        var t = inp.value.trim();
        if (!t) return;
        items.unshift({ id: MT.uid(4), t: t, p: prio.value, done: false, at: Date.now() });
        inp.value = ''; save();
      }
      function draw() {
        MT.clear(list);
        var view = items.filter(function (x) { return filt === 'kaikki' || (filt === 'avoimet' ? !x.done : x.done); });
        if (!view.length) { list.appendChild(c.empty('Ei tehtäviä', filt === 'kaikki' ? 'Lisää ensimmäinen tehtävä yläpuolelta.' : 'Ei tehtäviä tässä näkymässä.', 'i-checksq')); return; }
        var order = { korkea: 0, normaali: 1, matala: 2 };
        view.slice().sort(function (a, b) { return (a.done - b.done) || (order[a.p] - order[b.p]) || (b.at - a.at); }).forEach(function (x) {
          var cb = h('input', { type: 'checkbox' });
          cb.checked = x.done;
          cb.addEventListener('change', function () { x.done = cb.checked; save(); });
          list.appendChild(h('div.row-item', null, [
            h('label.check', { style: { height: 'auto' } }, cb),
            h('span.row-main', null, [
              h('div.n', { text: x.t, style: x.done ? { textDecoration: 'line-through', color: 'var(--tx-3)' } : {} }),
              h('div.m', { text: MT.timeAgo(x.at) })
            ]),
            h('span.chip' + (x.p === 'korkea' ? '.acc' : ''), { text: x.p }),
            c.btn('', { cls: 'btn-gh btn-sm', icon: 'i-trash', title: 'Poista', on: function () { items = items.filter(function (y) { return y.id !== x.id; }); save(); } })
          ]));
        });
      }
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
      var tabs = h('div.seg-ctl', { style: { maxWidth: '300px' } });
      [['kaikki', 'Kaikki'], ['avoimet', 'Avoimet'], ['valmiit', 'Valmiit']].forEach(function (t) {
        var b = h('button' + (t[0] === filt ? '.on' : ''), { text: t[1], onclick: function () {
          filt = t[0];
          MT.qsa('button', tabs).forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on'); draw();
        } });
        tabs.appendChild(b);
      });
      root.appendChild(c.panel('UUSI TEHTÄVÄ', 'i-plus', h('div.panel-body', null, [
        h('div', { style: { display: 'flex', gap: '8px' } }, [inp, prio, c.btn('Lisää', { cls: 'btn-pri', icon: 'i-plus', on: add })]),
        h('div', { style: { marginTop: '11px' } }, tabs)
      ])));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('TEHTÄVÄT', 'i-checksq', h('div', null, [list,
        h('div.panel-foot', null, [
          c.btn('Poista valmiit', { cls: 'btn-sm', icon: 'i-trash', on: function () { items = items.filter(function (x) { return !x.done; }); save(); } }),
          c.btn('Vie tekstinä', { cls: 'btn-sm', icon: 'i-download', on: function () {
            MT.download(items.map(function (x) { return (x.done ? '[x] ' : '[ ] ') + x.t + ' (' + x.p + ')'; }).join('\n'), 'tehtavat.txt');
          } }),
          h('span.grow'),
          h('span.lbl', { text: items.filter(function (x) { return !x.done; }).length + ' AVOINTA · ' + items.length + ' YHTEENSÄ' })
        ])]))));
      draw();
    }
  });

  /* ---------- 2. Muistiinpanot ---------- */
  R({
    id: 'muistiinpanot', cat: 'tuottavuus', name: 'Muistiinpanot', icon: 'i-text', kind: 'custom',
    desc: 'Useita muistiinpanoja, jotka tallentuvat automaattisesti selaimeen.',
    keys: ['muistiinpano', 'notes', 'kirjoita', 'muistio'],
    render: function (root, c) {
      var notes = store('notes', [{ id: MT.uid(4), t: 'Ensimmäinen muistiinpano', b: '', at: Date.now() }]);
      var curId = notes[0] ? notes[0].id : null;
      var list = h('div.rows'), titleIn = h('input.ctl', { placeholder: 'Otsikko' });
      var body = h('textarea.ctl', { rows: 18, placeholder: 'Kirjoita tähän…', style: { minHeight: '380px' } });
      var info = h('span.lbl', { text: '' });
      function cur() { return notes.filter(function (n) { return n.id === curId; })[0]; }
      function save() { MT.db.data.notes = notes; MT.save(); }
      function draw() {
        MT.clear(list);
        if (!notes.length) { list.appendChild(c.empty('Ei muistiinpanoja', 'Luo uusi alta.', 'i-text')); return; }
        notes.forEach(function (n) {
          list.appendChild(h('div.row-item' + (n.id === curId ? '' : ''), {
            style: n.id === curId ? { background: 'rgba(var(--acc-rgb),.08)' } : {},
            onclick: function () { curId = n.id; load(); draw(); }
          }, [
            h('span.row-ico', null, c.icon('i-text')),
            h('span.row-main', null, [h('div.n', { text: n.t || 'Nimetön' }),
              h('div.m', { text: MT.timeAgo(n.at) + ' · ' + (n.b || '').length + ' merkkiä' })]),
            c.btn('', { cls: 'btn-gh btn-sm', icon: 'i-trash', on: function (e) {
              e.stopPropagation();
              notes = notes.filter(function (x) { return x.id !== n.id; });
              if (curId === n.id) curId = notes.length ? notes[0].id : null;
              save(); load(); draw();
            } })
          ]));
        });
      }
      function load() {
        var n = cur();
        titleIn.value = n ? n.t : '';
        body.value = n ? n.b : '';
        upd();
      }
      function upd() {
        var t = body.value;
        info.textContent = t.trim() ? (t.trim().split(/\s+/).length + ' SANAA · ' + t.length + ' MERKKIÄ') : 'TYHJÄ';
      }
      var persist = MT.debounce(function () {
        var n = cur();
        if (!n) return;
        n.t = titleIn.value; n.b = body.value; n.at = Date.now();
        save(); draw();
      }, 400);
      [titleIn, body].forEach(function (x) { x.addEventListener('input', function () { upd(); persist(); }); });
      root.appendChild(h('div.home-grid', null, [
        c.panel('MUISTIINPANO', 'i-text', h('div.panel-body', null, [titleIn, h('div', { style: { height: '9px' } }), body]),
          h('span.grow')),
        c.panel('LISTA', 'i-grid', h('div', null, [list,
          h('div.panel-foot', null, [
            c.btn('Uusi', { cls: 'btn-sm btn-pri', icon: 'i-plus', on: function () {
              var n = { id: MT.uid(4), t: 'Uusi muistiinpano', b: '', at: Date.now() };
              notes.unshift(n); curId = n.id; save(); load(); draw();
            } }),
            c.btn('Lataa .md', { cls: 'btn-sm', icon: 'i-download', on: function () {
              var n = cur(); if (!n) return;
              MT.download('# ' + n.t + '\n\n' + n.b, (n.t || 'muistiinpano').replace(/[^\w]/g, '-').toLowerCase() + '.md');
            } })
          ])]))
      ]));
      root.appendChild(h('div', { style: { marginTop: '11px', display: 'flex', justifyContent: 'space-between' } }, [
        info, h('span.lbl', { text: 'TALLENNETAAN AUTOMAATTISESTI TÄHÄN SELAIMEEN' })
      ]));
      load(); draw();
    }
  });

  /* ---------- 3. Tarkistuslista ---------- */
  R({
    id: 'tarkistuslista', cat: 'tuottavuus', name: 'Tarkistuslista', icon: 'i-checksq', kind: 'custom',
    desc: 'Luo tarkistuslista tekstistä, merkitse kohdat tehdyiksi ja seuraa edistymistä.',
    keys: ['tarkistuslista', 'checklist', 'lista', 'vaiheet'],
    render: function (root, c) {
      var st = store('checklist', { src: 'Varmuuskopio otettu\nTestit ajettu läpi\nVersionumero päivitetty\nMuutosloki kirjoitettu\nJulkaisu merkitty kalenteriin\nTiedote lähetetty', done: {} });
      var ta = h('textarea.ctl', { rows: 8, value: st.src });
      var box = h('div'), bar = h('div.bar', { style: { margin: '11px' } }, h('i', { style: { width: '0%' } }));
      function save() { MT.db.data.checklist = st; MT.save(); }
      function draw() {
        var items = st.src.split('\n').filter(function (l) { return l.trim(); });
        MT.clear(box);
        if (!items.length) { box.appendChild(c.empty('Ei kohtia', 'Kirjoita kohdat vasemmalle, yksi rivillä.')); return; }
        var done = 0;
        items.forEach(function (t, i) {
          var key = i + ':' + t;
          if (st.done[key]) done++;
          var cb = h('input', { type: 'checkbox' });
          cb.checked = !!st.done[key];
          cb.addEventListener('change', function () { st.done[key] = cb.checked; save(); draw(); });
          box.appendChild(h('div.row-item', null, [
            h('label.check', { style: { height: 'auto' } }, cb),
            h('span.row-main', null, h('div.n', { text: t, style: st.done[key] ? { textDecoration: 'line-through', color: 'var(--tx-3)' } : {} }))
          ]));
        });
        box.appendChild(bar);
        bar.firstChild.style.width = (done / items.length * 100) + '%';
        bar.firstChild.style.background = done === items.length ? 'var(--ok)' : 'var(--acc)';
        box.appendChild(h('div.panel-foot', null, [
          c.btn('Nollaa merkinnät', { cls: 'btn-sm', icon: 'i-refresh', on: function () { st.done = {}; save(); draw(); } }),
          h('span.grow'),
          h('span.lbl', { text: done + ' / ' + items.length + ' VALMIS (' + Math.round(done / items.length * 100) + ' %)' })
        ]));
      }
      ta.addEventListener('input', MT.debounce(function () { st.src = ta.value; save(); draw(); }, 300));
      root.appendChild(h('div.home-grid', null, [
        c.panel('KOHDAT', 'i-text', h('div.panel-body', null, ta)),
        c.panel('TARKISTUSLISTA', 'i-checksq', box)
      ]));
      draw();
    }
  });

  /* ---------- 4. Muistilappu ---------- */
  R({
    id: 'muistilappu', cat: 'tuottavuus', name: 'Pikamuistio', icon: 'i-text', kind: 'custom',
    desc: 'Nopea raapustusalue väliaikaiselle tekstille — tallentuu automaattisesti.',
    keys: ['muistilappu', 'scratchpad', 'raapustus', 'väliaikainen', 'leikepöytä'],
    render: function (root, c) {
      var ed = c.editor({ label: 'PIKAMUISTIO', placeholder: 'Liitä tai kirjoita mitä tahansa…', onInput: onInput });
      ed.el.style.minHeight = '460px';
      var sb = c.statusbar([]);
      ed.set(store('scratch', ''));
      function onInput() {
        var t = ed.get();
        MT.db.data.scratch = t; MT.save();
        sb.set([{ k: '', v: 'TALLENNETTU', kind: 'ok', dot: true },
          { k: 'SANAT', v: t.trim() ? t.trim().split(/\s+/).length : 0 },
          { k: 'MERKIT', v: t.length }, { k: 'RIVIT', v: t ? t.split('\n').length : 0 }]);
      }
      ed.acts.appendChild(c.btn('', { cls: 'btn-gh btn-sm', icon: 'i-copy', title: 'Kopioi kaikki', on: function () { MT.copy(ed.get()); } }));
      ed.acts.appendChild(c.btn('', { cls: 'btn-gh btn-sm', icon: 'i-download', title: 'Lataa', on: function () { MT.download(ed.get(), 'muistio.txt'); } }));
      ed.acts.appendChild(c.btn('', { cls: 'btn-gh btn-sm', icon: 'i-trash', title: 'Tyhjennä', on: function () { ed.set(''); onInput(); } }));
      root.appendChild(ed.el);
      root.appendChild(sb);
      onInput();
    }
  });

  /* ---------- 5. Satunnainen valitsija ---------- */
  R({
    id: 'satunnainen-valitsija', cat: 'tuottavuus', name: 'Satunnainen valitsija', icon: 'i-dice', kind: 'custom',
    desc: 'Valitse satunnaisesti yksi tai useampi vaihtoehto listasta.',
    keys: ['arvonta', 'valitse', 'satunnainen', 'päätös', 'lista'],
    render: function (root, c) {
      var ta = h('textarea.ctl', { rows: 9, value: 'Pizza\nSushi\nBurgeri\nSalaatti\nPasta\nThai\nKebab' });
      var kpl = h('input.ctl', { type: 'number', value: '1', min: '1' });
      var out = h('div', { style: { marginTop: '13px' } });
      function pick() {
        var items = ta.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        MT.clear(out);
        if (!items.length) { out.appendChild(c.note('Lisää vaihtoehtoja listaan.', 'warn')); return; }
        var n = Math.max(1, Math.min(items.length, parseInt(kpl.value, 10) || 1));
        var res = MT.shuffle(items).slice(0, n);
        out.appendChild(c.panel('VALINTA', 'i-dice', h('div', null, [
          h('div', { style: { padding: '26px 16px', textAlign: 'center' } },
            res.map(function (r) { return h('div', { text: r, style: { fontSize: n === 1 ? '32px' : '18px', fontWeight: '600', padding: '5px 0' } }); })),
          h('div.panel-foot', null, [
            c.btn('Arvo uudelleen', { cls: 'btn-sm btn-pri', icon: 'i-refresh', on: pick }),
            c.btn('Kopioi', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(res.join('\n')); } }),
            h('span.grow'), h('span.lbl', { text: items.length + ' VAIHTOEHDOSTA' })
          ])
        ])));
      }
      root.appendChild(c.panel('VAIHTOEHDOT', 'i-text', h('div.panel-body', null, [ta,
        h('div.fields', { style: { marginTop: '11px' } }, h('div.field', null, [h('label', { text: 'Montako valitaan' }), kpl])),
        h('div.btn-row', { style: { marginTop: '11px' } }, c.btn('Arvo', { cls: 'btn-pri', icon: 'i-dice', on: pick }))])));
      root.appendChild(out);
      pick();
    }
  });

  /* ---------- 6. Onnenpyörä ---------- */
  R({
    id: 'onnenpyora', cat: 'tuottavuus', name: 'Onnenpyörä', icon: 'i-refresh', kind: 'custom',
    desc: 'Pyöritä pyörää ja anna sattuman päättää.',
    keys: ['pyörä', 'arvonta', 'päätös', 'wheel', 'onni'],
    render: function (root, c) {
      var ta = h('textarea.ctl', { rows: 7, value: 'Kyllä\nEi\nEhkä\nKysy uudestaan\nEhdottomasti\nEi missään nimessä' });
      var cv = h('canvas', { width: 420, height: 420, style: { maxWidth: '100%', display: 'block', margin: '0 auto' } });
      var res = h('div', { style: { textAlign: 'center', padding: '11px', fontSize: '19px', fontWeight: '600', minHeight: '30px' } });
      var angle = 0, spinning = false;
      function items() { return ta.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }
      function draw() {
        var it = items(), ctx = cv.getContext('2d'), n = it.length;
        ctx.clearRect(0, 0, 420, 420);
        if (!n) return;
        var cx = 210, cy = 210, r = 180;
        for (var i = 0; i < n; i++) {
          var a0 = angle + i * 2 * Math.PI / n, a1 = angle + (i + 1) * 2 * Math.PI / n;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0, a1); ctx.closePath();
          ctx.fillStyle = 'hsl(' + (i * 360 / n) + ', 62%, ' + (i % 2 ? 46 : 54) + '%)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.save();
          ctx.translate(cx, cy); ctx.rotate((a0 + a1) / 2);
          ctx.fillStyle = '#fff'; ctx.font = '600 14px Inter, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          ctx.fillText(it[i].slice(0, 18), r - 14, 0);
          ctx.restore();
        }
        ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 7); ctx.fillStyle = '#14161C'; ctx.fill();
        ctx.strokeStyle = '#E8323C'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + r - 4, cy); ctx.lineTo(cx + r + 22, cy - 13); ctx.lineTo(cx + r + 22, cy + 13);
        ctx.closePath(); ctx.fillStyle = '#E8323C'; ctx.fill();
      }
      function spin() {
        var it = items();
        if (!it.length || spinning) return;
        spinning = true; res.textContent = '';
        var target = angle + Math.PI * 2 * (4 + Math.random() * 3), start = angle, t0 = performance.now(), dur = 3600;
        (function step(now) {
          var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4);
          angle = start + (target - start) * e;
          draw();
          if (p < 1) requestAnimationFrame(step);
          else {
            spinning = false;
            var n = it.length, per = 2 * Math.PI / n;
            var norm = ((-angle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            var idx = Math.floor(norm / per) % n;
            res.textContent = '→ ' + it[idx];
            MT.toast('Tulos: ' + it[idx], 'ok');
          }
        })(performance.now());
      }
      ta.addEventListener('input', MT.debounce(draw, 200));
      cv.addEventListener('click', spin);
      root.appendChild(h('div.home-grid', null, [
        c.panel('PYÖRÄ', 'i-refresh', h('div', null, [h('div', { style: { padding: '13px' } }, cv), res,
          h('div.panel-foot', null, [c.btn('Pyöritä', { cls: 'btn-pri', icon: 'i-refresh', on: spin }), h('span.grow'), h('span.lbl', { text: 'VOIT MYÖS KLIKATA PYÖRÄÄ' })])])),
        c.panel('VAIHTOEHDOT', 'i-text', h('div.panel-body', null, ta))
      ]));
      draw();
    }
  });

  /* ---------- 7. Noppa ---------- */
  R({
    id: 'noppa', cat: 'tuottavuus', name: 'Nopanheitto', icon: 'i-dice', kind: 'custom',
    desc: 'Heitä noppia: D4, D6, D8, D10, D12, D20 tai oma sivumäärä.',
    keys: ['noppa', 'dice', 'd20', 'heitä', 'peli'],
    render: function (root, c) {
      var F = [
        { k: 'sivut', type: 'select', label: 'Nopan tyyppi', def: '6', opts: [['4', 'D4'], ['6', 'D6'], ['8', 'D8'], ['10', 'D10'], ['12', 'D12'], ['20', 'D20'], ['100', 'D100'], ['oma', 'Oma']] },
        { k: 'oma', type: 'num', label: 'Oma sivumäärä', def: '6' },
        { k: 'kpl', type: 'num', label: 'Noppien määrä', def: '2' },
        { k: 'mod', type: 'num', label: 'Lisäys tulokseen', def: '0' }
      ];
      var box = c.fields(F), out = h('div', { style: { marginTop: '13px' } }), hist = [];
      function roll() {
        var v = c.readFields(box, F);
        var sides = v.sivut === 'oma' ? Math.max(2, Math.round(v.oma) || 6) : +v.sivut;
        var n = Math.max(1, Math.min(100, Math.round(v.kpl) || 1));
        var rolls = [];
        for (var i = 0; i < n; i++) rolls.push(MT.rint(1, sides));
        var sum = rolls.reduce(function (a, b) { return a + b; }, 0) + (isFinite(v.mod) ? v.mod : 0);
        hist.unshift({ d: n + 'd' + sides + (v.mod ? (v.mod > 0 ? '+' + v.mod : v.mod) : ''), r: rolls, s: sum });
        hist = hist.slice(0, 15);
        MT.clear(out);
        out.appendChild(c.panel('TULOS', 'i-dice', h('div', null, [
          h('div', { style: { textAlign: 'center', padding: '20px' } }, [
            h('div.mono', { text: String(sum), style: { fontSize: '52px', lineHeight: '1' } }),
            h('div', { style: { marginTop: '11px', display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' } },
              rolls.map(function (r) {
                return h('span.mono', { text: String(r), style: { width: '34px', height: '34px', display: 'grid', placeItems: 'center',
                  background: r === sides ? 'rgba(63,179,127,.18)' : r === 1 ? 'rgba(224,82,96,.18)' : 'var(--panel-3)',
                  border: '1px solid var(--bd)', borderRadius: '4px', fontSize: '15px' } });
              }))
          ]),
          h('div.panel-foot', null, [
            c.btn('Heitä uudelleen', { cls: 'btn-sm btn-pri', icon: 'i-refresh', on: roll }),
            h('span.grow'),
            h('span.lbl', { text: n + 'D' + sides + ' · SUMMA ' + sum + ' · KESKIARVO ' + (sum / n).toFixed(1).replace('.', ',') })
          ])
        ])));
        var rows = h('div.rows');
        hist.forEach(function (x) {
          rows.appendChild(h('div.row-item', null, [
            h('span.chip', { text: x.d }),
            h('span.row-main', null, h('div.m', { text: x.r.join(' · ') })),
            h('span.mono', { text: String(x.s), style: { fontSize: '15px' } })
          ]));
        });
        out.appendChild(h('div', { style: { marginTop: '11px' } }, c.panel('HISTORIA', 'i-clock', rows)));
      }
      root.appendChild(c.panel('NOPAT', 'i-dice', h('div.panel-body', null, [box,
        h('div.btn-row', { style: { marginTop: '11px' } }, c.btn('Heitä', { cls: 'btn-pri', icon: 'i-dice', on: roll }))])));
      root.appendChild(out);
      roll();
    }
  });

  /* ---------- 8. Kolikko ---------- */
  R({
    id: 'kolikko', cat: 'tuottavuus', name: 'Kolikonheitto', icon: 'i-refresh', kind: 'custom',
    desc: 'Heitä kolikkoa kerran tai tuhat kertaa ja näe jakauma.',
    keys: ['kolikko', 'kruuna', 'klaava', 'arvonta', 'coin'],
    render: function (root, c) {
      var kpl = h('input.ctl', { type: 'number', value: '1', min: '1', max: '100000' });
      var out = h('div', { style: { marginTop: '13px' } });
      function flip() {
        var n = Math.max(1, Math.min(100000, parseInt(kpl.value, 10) || 1));
        var kruuna = 0, seq = [];
        for (var i = 0; i < n; i++) {
          var r = MT.rint(0, 1);
          if (r) kruuna++;
          if (i < 200) seq.push(r ? 'K' : 'L');
        }
        MT.clear(out);
        out.appendChild(c.panel('TULOS', 'i-refresh', h('div', null, [
          n === 1
            ? h('div', { style: { textAlign: 'center', padding: '28px' } }, [
              h('div', { text: kruuna ? 'KRUUNA' : 'KLAAVA', style: { fontSize: '38px', fontWeight: '700', letterSpacing: '.04em', color: 'var(--acc-2)' } })
            ])
            : h('div', { style: { padding: '16px' } }, [
              c.resList([
                { k: 'Kruunaa', v: MT.num(kruuna) + '  (' + (kruuna / n * 100).toFixed(2).replace('.', ',') + ' %)', copy: false, big: true },
                { k: 'Klaavaa', v: MT.num(n - kruuna) + '  (' + ((n - kruuna) / n * 100).toFixed(2).replace('.', ',') + ' %)', copy: false, big: true },
                { k: 'Heittoja', v: MT.num(n), copy: false },
                { k: 'Poikkeama odotusarvosta', v: (kruuna - n / 2 >= 0 ? '+' : '') + MT.num(kruuna - n / 2), copy: false }
              ]),
              seq.length ? h('div.mono', { text: seq.join(' ') + (n > 200 ? ' …' : ''), style: { marginTop: '11px', fontSize: '11px', color: 'var(--tx-3)', wordBreak: 'break-all', lineHeight: '1.7' } }) : null
            ]),
          h('div.panel-foot', null, [c.btn('Heitä uudelleen', { cls: 'btn-sm btn-pri', icon: 'i-refresh', on: flip })])
        ])));
      }
      root.appendChild(c.panel('HEITTO', 'i-refresh', h('div.panel-body', null, [
        h('div.fields', null, h('div.field', null, [h('label', { text: 'Heittojen määrä' }), kpl])),
        h('div.btn-row', { style: { marginTop: '11px' } }, c.btn('Heitä kolikkoa', { cls: 'btn-pri', icon: 'i-refresh', on: flip }))])));
      root.appendChild(out);
      flip();
    }
  });

  /* ---------- 9. Päätösmatriisi ---------- */
  R({
    id: 'paatosmatriisi', cat: 'tuottavuus', name: 'Päätösmatriisi', icon: 'i-grid', kind: 'io',
    desc: 'Vertaa vaihtoehtoja painotetuilla kriteereillä ja löydä paras valinta.',
    keys: ['päätös', 'vertailu', 'matriisi', 'painotus', 'valinta'],
    io: {
      inLabel: 'MATRIISI (CSV)', outLabel: 'TULOS', lang: 'none',
      sample: 'kriteeri;painoarvo;Vaihtoehto A;Vaihtoehto B;Vaihtoehto C\nHinta;3;4;2;5\nLaatu;5;5;4;3\nToimitusaika;2;3;5;4\nTuki;4;4;3;2',
      opts: [{ k: 'asteikko', type: 'num', label: 'Pisteasteikon maksimi', def: '5' }],
      run: function (t, o) {
        var d = FMT.csvDetect(t), rows = FMT.csvParse(t, d).filter(function (r) { return r.length > 1 || r[0] !== ''; });
        var head = rows.shift();
        if (head.length < 3) throw new Error('Tarvitaan vähintään sarakkeet: kriteeri, painoarvo ja yksi vaihtoehto');
        var opts = head.slice(2).map(function (x) { return String(x).trim(); });
        var totals = opts.map(function () { return 0; }), wsum = 0;
        var lines = [], maxW = Math.max.apply(null, rows.map(function (r) { return String(r[0]).length; }).concat([10]));
        lines.push('Kriteeri'.padEnd(maxW) + '  Paino ' + opts.map(function (x) { return x.slice(0, 14).padStart(16); }).join(''));
        lines.push('-'.repeat(maxW + 8 + opts.length * 16));
        rows.forEach(function (r) {
          var w = parseFloat(String(r[1]).replace(',', '.')) || 0;
          wsum += w;
          var cells = opts.map(function (_, i) {
            var s = parseFloat(String(r[i + 2]).replace(',', '.')) || 0;
            totals[i] += s * w;
            return (MT.numAuto(s) + ' → ' + MT.numAuto(s * w)).padStart(16);
          });
          lines.push(String(r[0]).padEnd(maxW) + '  ' + String(w).padStart(5) + ' ' + cells.join(''));
        });
        lines.push('-'.repeat(maxW + 8 + opts.length * 16));
        lines.push('PISTEET'.padEnd(maxW) + '  ' + String(wsum).padStart(5) + ' ' + totals.map(function (x) { return MT.numAuto(x).padStart(16); }).join(''));
        var max = Math.max.apply(null, totals);
        lines.push('NORMALISOITU'.padEnd(maxW) + '        ' + totals.map(function (x) {
          return ((x / (wsum * (o.asteikko || 5)) * 100).toFixed(1).replace('.', ',') + ' %').padStart(16);
        }).join(''));
        lines.push('');
        var winners = opts.filter(function (_, i) { return totals[i] === max; });
        lines.push('★ Paras vaihtoehto: ' + winners.join(' / ') + '  (' + MT.numAuto(max) + ' pistettä)');
        var sorted = opts.map(function (o2, i) { return { n: o2, p: totals[i] }; }).sort(function (a, b) { return b.p - a.p; });
        lines.push('');
        lines.push('Järjestys:');
        sorted.forEach(function (x, i) { lines.push('  ' + (i + 1) + '. ' + x.n + ' — ' + MT.numAuto(x.p) + ' pistettä'); });
        return { out: lines.join('\n'), status: 'LASKETTU', kind: 'ok', meta: [['VAIHTOEHTOJA', opts.length], ['KRITEEREJÄ', rows.length]] };
      },
      foot: function (c) { return c.note('Anna jokaiselle kriteerille painoarvo (esim. 1–5) ja pisteytä jokainen vaihtoehto samalla asteikolla. Työkalu laskee painotetut pisteet ja järjestyksen.', 'info'); }
    }
  });

  /* ---------- 10. Tapaseuranta ---------- */
  R({
    id: 'tapaseuranta', cat: 'tuottavuus', name: 'Tapaseuranta', icon: 'i-checksq', kind: 'custom',
    desc: 'Seuraa päivittäisiä tapoja ja putkia. Tiedot tallentuvat tähän selaimeen.',
    keys: ['tapa', 'habit', 'seuranta', 'putki', 'rutiini'],
    render: function (root, c) {
      var st = store('habits', { list: ['Liikunta', 'Lukeminen', 'Vesi 2 l'], log: {} });
      var inp = h('input.ctl', { placeholder: 'Uusi tapa…' });
      var box = h('div');
      function save() { MT.db.data.habits = st; MT.save(); draw(); }
      function key(hb, d) { return hb + '|' + d; }
      function draw() {
        MT.clear(box);
        if (!st.list.length) { box.appendChild(c.empty('Ei seurattavia tapoja', 'Lisää ensimmäinen tapa yläpuolelta.', 'i-checksq')); return; }
        var days = [];
        for (var i = 13; i >= 0; i--) { var d = new Date(); d.setDate(d.getDate() - i); days.push(MT.dateStr(d)); }
        var grid = h('div', { style: { padding: '13px', overflowX: 'auto' } });
        var headRow = h('div', { style: { display: 'flex', gap: '3px', marginBottom: '5px', alignItems: 'center' } });
        headRow.appendChild(h('span.lbl', { text: 'TAPA', style: { width: '130px', flex: 'none' } }));
        days.forEach(function (d) {
          headRow.appendChild(h('span.lbl', { text: d.slice(8), style: { width: '26px', flex: 'none', textAlign: 'center' } }));
        });
        headRow.appendChild(h('span.lbl', { text: 'PUTKI', style: { width: '54px', flex: 'none', textAlign: 'right' } }));
        grid.appendChild(headRow);
        st.list.forEach(function (hb) {
          var row = h('div', { style: { display: 'flex', gap: '3px', marginBottom: '4px', alignItems: 'center' } });
          row.appendChild(h('span.trunc', { text: hb, style: { width: '130px', flex: 'none', fontSize: '12.5px' } }));
          var streak = 0, broken = false;
          days.slice().reverse().forEach(function (d) {
            if (!broken && st.log[key(hb, d)]) streak++;
            else if (d !== MT.dateStr()) broken = true;
          });
          days.forEach(function (d) {
            var on = !!st.log[key(hb, d)];
            row.appendChild(h('button', {
              title: d, style: {
                width: '26px', height: '26px', flex: 'none', borderRadius: '3px', cursor: 'pointer',
                border: '1px solid ' + (d === MT.dateStr() ? 'var(--acc)' : 'var(--bd)'),
                background: on ? 'var(--acc)' : 'var(--panel-3)'
              },
              onclick: function () { st.log[key(hb, d)] = !on; save(); }
            }));
          });
          row.appendChild(h('span.mono', { text: String(streak), style: { width: '54px', flex: 'none', textAlign: 'right', color: streak > 2 ? 'var(--ok)' : 'var(--tx-3)' } }));
          row.appendChild(c.btn('', { cls: 'btn-gh btn-sm', icon: 'i-trash', on: function () {
            st.list = st.list.filter(function (x) { return x !== hb; }); save();
          } }));
          grid.appendChild(row);
        });
        box.appendChild(grid);
      }
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && inp.value.trim()) { st.list.push(inp.value.trim()); inp.value = ''; save(); }
      });
      root.appendChild(c.panel('UUSI TAPA', 'i-plus', h('div.panel-body', null,
        h('div', { style: { display: 'flex', gap: '8px' } }, [inp, c.btn('Lisää', { cls: 'btn-pri', icon: 'i-plus', on: function () {
          if (inp.value.trim()) { st.list.push(inp.value.trim()); inp.value = ''; save(); }
        } })]))));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('VIIMEISET 14 PÄIVÄÄ', 'i-grid', box)));
      draw();
    }
  });

  /* ---------- 11. Kokouskustannus ---------- */
  R({
    id: 'kokouskustannus', cat: 'tuottavuus', name: 'Kokouksen hinta', icon: 'i-calc',
    desc: 'Laske mitä kokous maksaa osallistujien työajassa — ja mitä se maksaa vuodessa.',
    keys: ['kokous', 'kustannus', 'palaveri', 'aika', 'raha'],
    fields: [
      { k: 'hlo', type: 'num', label: 'Osallistujia', def: '8' },
      { k: 'kesto', type: 'num', label: 'Kesto (minuuttia)', def: '60' },
      { k: 'palkka', type: 'num', label: 'Keskipalkka (€/kk)', def: '4200' },
      { k: 'sivukulut', type: 'num', label: 'Sivukulut %', def: '25' },
      { k: 'toistuu', type: 'select', label: 'Toistuvuus', def: 'viikko', opts: [['kerta', 'Kertaluontoinen'], ['viikko', 'Viikoittain'], ['2viikko', 'Joka toinen viikko'], ['kk', 'Kuukausittain'], ['paiva', 'Päivittäin']] }
    ],
    run: function (v) {
      if (!isFinite(v.hlo) || !isFinite(v.kesto) || !isFinite(v.palkka)) return null;
      var tunnit = 12 * 158 / 12;
      var tuntipalkka = v.palkka * 12 / (158 * 12) * (1 + (isFinite(v.sivukulut) ? v.sivukulut : 0) / 100);
      var hinta = tuntipalkka * (v.kesto / 60) * v.hlo;
      var kerrat = { kerta: 1, viikko: 47, '2viikko': 23, kk: 11, paiva: 235 }[v.toistuu];
      var vuosi = hinta * kerrat;
      var tyopaivat = (v.kesto / 60) * v.hlo * kerrat / 7.5;
      return {
        rows: [
          { k: 'Tuntikustannus / henkilö', v: MT.num(+tuntipalkka.toFixed(2), 2) + ' €', copy: false },
          { k: 'Kokouksen hinta', v: MT.num(+hinta.toFixed(2), 2) + ' €', big: true },
          { k: 'Hinta per minuutti', v: MT.num(+(hinta / v.kesto).toFixed(2), 2) + ' €' },
          { k: 'Työaikaa yhteensä', v: MT.numAuto(v.kesto * v.hlo / 60) + ' henkilötyötuntia' },
          { k: 'Vuosikustannus', v: MT.num(+vuosi.toFixed(0)) + ' €', big: true },
          { k: 'Vastaa työpäiviä vuodessa', v: MT.numAuto(tyopaivat) + ' työpäivää' },
          { k: 'Jos kesto puolittuu', v: 'säästö ' + MT.num(+(vuosi / 2).toFixed(0)) + ' € vuodessa', copy: false, sub: true }
        ],
        foot: 'Laskelma käyttää 158 työtunnin kuukausikeskiarvoa ja lisää sivukulut palkan päälle. Luku on suuntaa antava — sen tarkoitus on tehdä kokousten hinta näkyväksi.'
      };
    }
  });
})();
