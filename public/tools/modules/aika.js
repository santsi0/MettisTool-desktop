/* Moduuli: Aika */
(function () {
  'use strict';
  var R = MT.reg, h = MT.h, pad = MT.pad;

  function hhmmss(ms, showMs) {
    var neg = ms < 0; ms = Math.abs(ms);
    var t = Math.floor(ms / 1000), hh = Math.floor(t / 3600), mm = Math.floor(t % 3600 / 60), ss = t % 60;
    return (neg ? '−' : '') + pad(hh) + ':' + pad(mm) + ':' + pad(ss) + (showMs ? '.' + pad(Math.floor(ms % 1000 / 10)) : '');
  }
  function bigDisplay(text) {
    return h('div.mono', { text: text, style: { fontSize: 'clamp(38px,8vw,64px)', textAlign: 'center', padding: '22px 12px', letterSpacing: '.02em', lineHeight: '1' } });
  }
  function beep(freq, dur) {
    try {
      var ac = new (window.AudioContext || window.webkitAudioContext)();
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = freq || 880;
      o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + (dur || 0.5));
      o.start(); o.stop(ac.currentTime + (dur || 0.5) + 0.05);
      setTimeout(function () { ac.close(); }, ((dur || 0.5) + 0.2) * 1000);
    } catch (e) {}
  }

  /* ---------- 1. Sekuntikello ---------- */
  R({
    id: 'sekuntikello', cat: 'aika', name: 'Sekuntikello', icon: 'i-clock', kind: 'custom',
    desc: 'Tarkka sekuntikello kierrosaikojen tallennuksella.',
    keys: ['sekuntikello', 'stopwatch', 'ajanotto', 'kierros'],
    render: function (root, c) {
      var t0 = 0, acc = 0, running = false, laps = [];
      var disp = bigDisplay('00:00:00.00');
      var lapBox = h('div.rows');
      var bStart = c.btn('Käynnistä', { cls: 'btn-pri', icon: 'i-play', on: toggle });
      var bLap = c.btn('Kierros', { icon: 'i-plus', on: lap });
      var bReset = c.btn('Nollaa', { icon: 'i-refresh', on: reset });
      function cur() { return acc + (running ? Date.now() - t0 : 0); }
      function toggle() {
        if (running) { acc = cur(); running = false; bStart.querySelector('span').textContent = 'Jatka'; bStart.classList.remove('btn-pri'); }
        else { t0 = Date.now(); running = true; bStart.querySelector('span').textContent = 'Pysäytä'; bStart.classList.add('btn-pri'); }
      }
      function lap() {
        if (!running && !acc) return;
        var t = cur(), prev = laps.length ? laps[laps.length - 1].t : 0;
        laps.push({ t: t, d: t - prev });
        drawLaps();
      }
      function reset() { acc = 0; running = false; laps = []; bStart.querySelector('span').textContent = 'Käynnistä'; bStart.classList.add('btn-pri'); drawLaps(); }
      function drawLaps() {
        MT.clear(lapBox);
        if (!laps.length) { lapBox.appendChild(c.empty('Ei kierroksia', 'Paina Kierros tallentaaksesi väliajan.', 'i-clock')); return; }
        var best = Math.min.apply(null, laps.map(function (l) { return l.d; }));
        var worst = Math.max.apply(null, laps.map(function (l) { return l.d; }));
        laps.slice().reverse().forEach(function (l, i) {
          var n = laps.length - i;
          lapBox.appendChild(h('div.row-item', null, [
            h('span.lbl', { text: 'KIERROS ' + n, style: { width: '86px' } }),
            h('span.row-main', null, h('div.n.mono', { text: hhmmss(l.d, true),
              style: { color: laps.length > 1 && l.d === best ? 'var(--ok)' : laps.length > 1 && l.d === worst ? 'var(--err)' : '' } })),
            h('span.mono', { text: hhmmss(l.t, true), style: { color: 'var(--tx-3)', fontSize: '11px' } })
          ]));
        });
      }
      c.timer(function () { disp.textContent = hhmmss(cur(), true); }, 31);
      root.appendChild(c.panel('SEKUNTIKELLO', 'i-clock', h('div', null, [disp,
        h('div.panel-foot', null, [bStart, bLap, bReset, h('span.grow'),
          c.btn('Kopioi kierrokset', { cls: 'btn-sm', icon: 'i-copy', on: function () {
            MT.copy(laps.map(function (l, i) { return 'Kierros ' + (i + 1) + ': ' + hhmmss(l.d, true) + ' (kokonaisaika ' + hhmmss(l.t, true) + ')'; }).join('\n'));
          } })])])));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('KIERROSAJAT', 'i-grid', lapBox)));
      drawLaps();
    }
  });

  /* ---------- 2. Ajastin ---------- */
  R({
    id: 'ajastin', cat: 'aika', name: 'Ajastin', icon: 'i-clock', kind: 'custom',
    desc: 'Aseta ajastin minuuteissa ja sekunneissa — hälyttää äänimerkillä.',
    keys: ['ajastin', 'timer', 'hälytys', 'muna'],
    render: function (root, c) {
      var total = 5 * 60000, left = total, running = false, end = 0, done = false;
      var disp = bigDisplay(hhmmss(left));
      var bar = h('div.bar', { style: { margin: '0 16px 16px' } }, h('i', { style: { width: '100%' } }));
      var F = [
        { k: 'h', type: 'num', label: 'Tuntia', def: '0' },
        { k: 'm', type: 'num', label: 'Minuuttia', def: '5' },
        { k: 's', type: 'num', label: 'Sekuntia', def: '0' }
      ];
      var box = c.fields(F, setFromFields);
      var bStart = c.btn('Käynnistä', { cls: 'btn-pri', icon: 'i-play', on: toggle });
      function setFromFields() {
        if (running) return;
        var v = c.readFields(box, F);
        total = ((v.h || 0) * 3600 + (v.m || 0) * 60 + (v.s || 0)) * 1000;
        left = total; done = false; upd();
      }
      function toggle() {
        if (running) { left = end - Date.now(); running = false; bStart.querySelector('span').textContent = 'Jatka'; }
        else {
          if (left <= 0) setFromFields();
          if (left <= 0) return MT.toast('Aseta ensin aika', 'warn');
          end = Date.now() + left; running = true; done = false;
          bStart.querySelector('span').textContent = 'Pysäytä';
        }
      }
      function upd() {
        var ms = running ? end - Date.now() : left;
        if (running && ms <= 0) {
          running = false; left = 0; ms = 0;
          if (!done) { done = true; beep(880, 0.4); setTimeout(function () { beep(1100, 0.6); }, 500); MT.toast('Aika loppui!', 'warn'); }
          bStart.querySelector('span').textContent = 'Käynnistä';
        }
        disp.textContent = hhmmss(Math.max(0, ms));
        disp.style.color = ms <= 10000 && ms > 0 ? 'var(--err)' : ms === 0 && done ? 'var(--err)' : '';
        bar.firstChild.style.width = total ? Math.max(0, ms / total * 100) + '%' : '0%';
        bar.firstChild.style.background = ms / total < 0.2 ? 'var(--err)' : 'var(--acc)';
      }
      c.timer(upd, 100);
      root.appendChild(c.panel('AJASTIN', 'i-clock', h('div', null, [disp, bar,
        h('div.panel-foot', null, [bStart,
          c.btn('Nollaa', { icon: 'i-refresh', on: function () { running = false; done = false; setFromFields(); bStart.querySelector('span').textContent = 'Käynnistä'; } }),
          h('span.grow'),
          c.btn('Testaa ääni', { cls: 'btn-sm btn-gh', icon: 'i-zap', on: function () { beep(880, 0.3); } })])])));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('KESTO', 'i-filter', h('div.panel-body', null, [box,
        h('div.btn-row', { style: { marginTop: '11px' } }, [1, 3, 5, 10, 15, 25, 45, 60].map(function (m) {
          return c.btn(m + ' min', { cls: 'btn-sm', on: function () {
            box.querySelector('[data-k="h"]').value = Math.floor(m / 60);
            box.querySelector('[data-k="m"]').value = m % 60;
            box.querySelector('[data-k="s"]').value = 0;
            running = false; bStart.querySelector('span').textContent = 'Käynnistä';
            setFromFields();
          } });
        }))]))));
      setFromFields();
    }
  });

  /* ---------- 3. Lähtölaskenta ---------- */
  R({
    id: 'lahtolaskenta', cat: 'aika', name: 'Lähtölaskenta', icon: 'i-clock', kind: 'custom',
    desc: 'Laske päivät, tunnit ja minuutit tiettyyn päivämäärään.',
    keys: ['lähtölaskenta', 'countdown', 'päivämäärä', 'tapahtuma'],
    render: function (root, c) {
      var dt = h('input.ctl', { type: 'datetime-local' });
      var nimi = h('input.ctl', { value: 'Tapahtuma' });
      var d = new Date(); d.setDate(d.getDate() + 30); d.setHours(12, 0, 0, 0);
      dt.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      var disp = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', padding: '16px' } });
      var sub = h('div', { style: { textAlign: 'center', paddingBottom: '14px', color: 'var(--tx-2)', fontSize: '12.5px' } });
      function unit(v, l) {
        return h('div', { style: { textAlign: 'center', background: 'var(--bg-2)', border: '1px solid var(--bd)', borderRadius: '6px', padding: '14px 6px' } }, [
          h('div.mono', { text: String(v), style: { fontSize: 'clamp(24px,4vw,38px)', lineHeight: '1' } }),
          h('div.lbl', { text: l, style: { marginTop: '7px' } })
        ]);
      }
      function upd() {
        if (!dt.value) return;
        var target = new Date(dt.value), diff = target - Date.now();
        var past = diff < 0; diff = Math.abs(diff);
        var dd = Math.floor(diff / 86400000), hh = Math.floor(diff % 86400000 / 3600000);
        var mm = Math.floor(diff % 3600000 / 60000), ss = Math.floor(diff % 60000 / 1000);
        MT.clear(disp);
        disp.appendChild(unit(dd, 'PÄIVÄÄ')); disp.appendChild(unit(pad(hh), 'TUNTIA'));
        disp.appendChild(unit(pad(mm), 'MINUUTTIA')); disp.appendChild(unit(pad(ss), 'SEKUNTIA'));
        sub.textContent = (nimi.value || 'Tapahtuma') + ' · ' + target.toLocaleString('fi-FI', { dateStyle: 'full', timeStyle: 'short' }) +
          (past ? ' — tapahtuma on jo mennyt' : '');
      }
      [dt, nimi].forEach(function (x) { x.addEventListener('input', upd); });
      c.timer(upd, 500);
      root.appendChild(c.panel('LÄHTÖLASKENTA', 'i-clock', h('div', null, [disp, sub])));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('TAPAHTUMA', 'i-filter', h('div.panel-body', null,
        h('div.fields', null, [
          h('div.field', null, [h('label', { text: 'Nimi' }), nimi]),
          h('div.field', null, [h('label', { text: 'Ajankohta' }), dt])
        ])))));
      upd();
    }
  });

  /* ---------- 4. Pomodoro ---------- */
  R({
    id: 'pomodoro', cat: 'aika', name: 'Pomodoro-ajastin', icon: 'i-zap', kind: 'custom',
    desc: 'Työskentele 25 minuutin jaksoissa ja pidä säännölliset tauot.',
    keys: ['pomodoro', 'fokus', 'tauko', 'työskentely', 'keskittyminen'],
    render: function (root, c) {
      var st = MT.db.data.pomo || { done: 0, date: MT.dateStr() };
      if (st.date !== MT.dateStr()) st = { done: 0, date: MT.dateStr() };
      var phase = 'tyo', left = 25 * 60000, running = false, end = 0, cycle = 0;
      var LEN = { tyo: 25, tauko: 5, pitka: 15 };
      var disp = bigDisplay('25:00');
      var label = h('div', { style: { textAlign: 'center', paddingBottom: '10px' } }, h('span.chip.acc', { text: 'TYÖJAKSO' }));
      var bar = h('div.bar', { style: { margin: '0 16px 16px' } }, h('i', { style: { width: '100%' } }));
      var bStart = c.btn('Käynnistä', { cls: 'btn-pri', icon: 'i-play', on: toggle });
      var stats = h('div');
      function setPhase(p) {
        phase = p; left = LEN[p] * 60000; running = false;
        end = 0;
        bStart.querySelector('span').textContent = 'Käynnistä';
        MT.clear(label);
        label.appendChild(h('span.chip' + (p === 'tyo' ? '.acc' : ''), { text: p === 'tyo' ? 'TYÖJAKSO · 25 MIN' : p === 'tauko' ? 'LYHYT TAUKO · 5 MIN' : 'PITKÄ TAUKO · 15 MIN' }));
        upd();
      }
      function toggle() {
        if (running) { left = end - Date.now(); running = false; bStart.querySelector('span').textContent = 'Jatka'; }
        else { end = Date.now() + left; running = true; bStart.querySelector('span').textContent = 'Pysäytä'; }
      }
      function finish() {
        beep(880, 0.35); setTimeout(function () { beep(1100, 0.5); }, 420);
        if (phase === 'tyo') {
          st.done++; cycle++;
          MT.db.data.pomo = st; MT.save();
          MT.toast('Työjakso valmis! Pidä tauko.', 'ok');
          setPhase(cycle % 4 === 0 ? 'pitka' : 'tauko');
        } else {
          MT.toast('Tauko ohi — takaisin töihin.', 'ok');
          setPhase('tyo');
        }
        drawStats();
      }
      function upd() {
        var ms = running ? end - Date.now() : left;
        if (running && ms <= 0) { running = false; left = 0; finish(); return; }
        var t = Math.max(0, ms);
        disp.textContent = pad(Math.floor(t / 60000)) + ':' + pad(Math.floor(t % 60000 / 1000));
        var tot = LEN[phase] * 60000;
        bar.firstChild.style.width = (t / tot * 100) + '%';
        bar.firstChild.style.background = phase === 'tyo' ? 'var(--acc)' : 'var(--ok)';
      }
      function drawStats() {
        MT.clear(stats);
        stats.appendChild(c.resList([
          { k: 'Valmiita jaksoja tänään', v: String(st.done), copy: false, big: true },
          { k: 'Työaikaa tänään', v: (st.done * 25) + ' min', copy: false },
          { k: 'Seuraava pitkä tauko', v: (4 - (cycle % 4)) + ' jakson päästä', copy: false }
        ]));
      }
      c.timer(upd, 250);
      root.appendChild(c.panel('POMODORO', 'i-zap', h('div', null, [label, disp, bar,
        h('div.panel-foot', null, [bStart,
          c.btn('Ohita', { icon: 'i-chev-r', on: function () { running = false; left = 0; finish(); } }),
          h('span.grow'),
          c.btn('Työ', { cls: 'btn-sm', on: function () { setPhase('tyo'); } }),
          c.btn('Tauko', { cls: 'btn-sm', on: function () { setPhase('tauko'); } }),
          c.btn('Pitkä tauko', { cls: 'btn-sm', on: function () { setPhase('pitka'); } })])])));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('TILASTO', 'i-grid', stats)));
      root.appendChild(h('div', { style: { marginTop: '11px' } },
        c.note('Pomodoro-tekniikka: 25 minuuttia keskittynyttä työtä, 5 minuutin tauko, ja joka neljännen jakson jälkeen 15 minuutin pitkä tauko. Tilasto tallentuu vain tähän selaimeen ja nollautuu päivittäin.', 'info')));
      setPhase('tyo'); drawStats();
    }
  });

  /* ---------- 5. Maailmankello ---------- */
  var ZONES = [
    ['Europe/Helsinki', 'Helsinki'], ['Europe/Stockholm', 'Tukholma'], ['Europe/Oslo', 'Oslo'],
    ['Europe/London', 'Lontoo'], ['Europe/Berlin', 'Berliini'], ['Europe/Paris', 'Pariisi'],
    ['Europe/Madrid', 'Madrid'], ['Europe/Moscow', 'Moskova'], ['America/New_York', 'New York'],
    ['America/Chicago', 'Chicago'], ['America/Denver', 'Denver'], ['America/Los_Angeles', 'Los Angeles'],
    ['America/Sao_Paulo', 'São Paulo'], ['Africa/Cairo', 'Kairo'], ['Africa/Johannesburg', 'Johannesburg'],
    ['Asia/Dubai', 'Dubai'], ['Asia/Kolkata', 'Mumbai'], ['Asia/Bangkok', 'Bangkok'],
    ['Asia/Shanghai', 'Shanghai'], ['Asia/Tokyo', 'Tokio'], ['Asia/Seoul', 'Soul'],
    ['Australia/Sydney', 'Sydney'], ['Pacific/Auckland', 'Auckland'], ['UTC', 'UTC']
  ];
  R({
    id: 'maailmankello', cat: 'aika', name: 'Maailmankello', icon: 'i-globe', kind: 'custom',
    desc: 'Näe kellonajat eri puolilla maailmaa reaaliajassa.',
    keys: ['kello', 'aikavyöhyke', 'maailma', 'aika', 'utc'],
    render: function (root, c) {
      var box = h('div');
      var mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
      function upd() {
        var now = new Date();
        MT.clear(box);
        var rows = h('div.rows');
        ZONES.forEach(function (z) {
          var time, date, off;
          try {
            time = now.toLocaleTimeString('fi-FI', { timeZone: z[0], hour: '2-digit', minute: '2-digit', second: '2-digit' });
            date = now.toLocaleDateString('fi-FI', { timeZone: z[0], weekday: 'short', day: 'numeric', month: 'short' });
            var f = new Intl.DateTimeFormat('en-US', { timeZone: z[0], timeZoneName: 'shortOffset' }).formatToParts(now);
            off = (f.find(function (p) { return p.type === 'timeZoneName'; }) || {}).value || '';
          } catch (e) { time = '–'; date = ''; off = ''; }
          var hour = parseInt(time, 10);
          var night = hour < 7 || hour >= 22;
          rows.appendChild(h('div.row-item', { onclick: function () { MT.copy(z[1] + ': ' + time + ' (' + off + ')'); } }, [
            h('span.row-ico', null, c.icon(night ? 'i-moon' : 'i-sun')),
            h('span.row-main', null, [
              h('div.n', null, [z[1], z[0] === mine ? h('span.chip.acc', { text: 'OMA', style: { marginLeft: '8px' } }) : null]),
              h('div.m', { text: date + ' · ' + off })
            ]),
            h('span.mono', { text: time, style: { fontSize: '17px' } })
          ]));
        });
        box.appendChild(rows);
      }
      c.timer(upd, 1000);
      root.appendChild(c.panel('MAAILMANKELLO', 'i-globe', box, h('span.lbl', { text: 'OMA VYÖHYKE: ' + mine })));
      upd();
    }
  });

  /* ---------- 6. Aikavyöhykemuunnin ---------- */
  R({
    id: 'aikavyohykemuunnin', cat: 'aika', name: 'Aikavyöhykemuunnin', icon: 'i-refresh', kind: 'custom',
    desc: 'Muunna kellonaika vyöhykkeeltä toiselle — kokousten sopimiseen.',
    keys: ['aikavyöhyke', 'muunna', 'utc', 'kokous', 'timezone'],
    render: function (root, c) {
      var dt = h('input.ctl', { type: 'datetime-local' });
      var from = h('select.ctl');
      var now = new Date();
      dt.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      var mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
      var all = ZONES.slice();
      if (!all.some(function (z) { return z[0] === mine; })) all.unshift([mine, mine + ' (oma)']);
      all.forEach(function (z) { from.appendChild(h('option', { value: z[0], text: z[1] + ' — ' + z[0] })); });
      from.value = all.some(function (z) { return z[0] === mine; }) ? mine : 'Europe/Helsinki';
      var out = h('div');
      function upd() {
        if (!dt.value) return;
        // tulkitaan annettu paikallinen aika valitulla vyöhykkeellä
        var parts = dt.value.split(/[-T:]/).map(Number);
        var guess = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4]);
        var offset = tzOffset(from.value, new Date(guess));
        var utc = guess - offset * 60000;
        var d = new Date(utc);
        MT.clear(out);
        var rows = h('div.rows');
        all.forEach(function (z) {
          var time = d.toLocaleString('fi-FI', { timeZone: z[0], weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
          rows.appendChild(h('div.row-item', { onclick: function () { MT.copy(z[1] + ': ' + time); } }, [
            h('span.row-main', null, h('div.n', { text: z[1] })),
            h('span.mono', { text: time, style: { fontSize: '13px' } })
          ]));
        });
        out.appendChild(rows);
        out.appendChild(h('div.panel-foot', null, [
          h('span.lbl', { text: 'ISO 8601 (UTC): ' + d.toISOString() }),
          h('span.grow'),
          c.btn('Kopioi ISO', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(d.toISOString()); } })
        ]));
      }
      function tzOffset(tz, date) {
        var f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        var p = {};
        f.formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
        var asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
        return (asUTC - date.getTime()) / 60000;
      }
      [dt, from].forEach(function (x) { x.addEventListener('input', upd); x.addEventListener('change', upd); });
      root.appendChild(c.panel('LÄHTÖAIKA', 'i-clock', h('div.panel-body', null, h('div.fields', null, [
        h('div.field', null, [h('label', { text: 'Päivä ja kellonaika' }), dt]),
        h('div.field', null, [h('label', { text: 'Aikavyöhyke' }), from])
      ]))));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('MUUNNETUT AJAT', 'i-globe', out)));
      upd();
    }
  });

  /* ---------- 7. Päivien ero ---------- */
  R({
    id: 'paivien-ero', cat: 'aika', name: 'Päivien ero', icon: 'i-calc',
    desc: 'Laske kahden päivämäärän välinen tarkka ero eri yksiköissä.',
    keys: ['päivä', 'ero', 'laske', 'väli', 'kesto'],
    fields: [
      { k: 'a', type: 'date', label: 'Alkupäivä', def: MT.dateStr() },
      { k: 'b', type: 'date', label: 'Loppupäivä', def: MT.dateStr(new Date(Date.now() + 86400000 * 100)) },
      { k: 'mukaan', type: 'check', label: 'Laske molemmat päivät mukaan', def: false }
    ],
    run: function (v) {
      if (!v.a || !v.b) return null;
      var a = new Date(v.a + 'T00:00:00'), b = new Date(v.b + 'T00:00:00');
      var days = Math.round((b - a) / 86400000) + (v.mukaan ? (b >= a ? 1 : -1) : 0);
      var abs = Math.abs(days);
      var y = b.getFullYear() - a.getFullYear(), m = b.getMonth() - a.getMonth(), d = b.getDate() - a.getDate();
      if (d < 0) { m--; d += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
      if (m < 0) { y--; m += 12; }
      var wd = 0, we = 0, cur = new Date(Math.min(a, b)), end = new Date(Math.max(a, b));
      while (cur < end) { var g = cur.getDay(); if (g === 0 || g === 6) we++; else wd++; cur.setDate(cur.getDate() + 1); }
      return {
        rows: [
          { k: 'Päiviä', v: MT.num(days), big: true },
          { k: 'Tarkka ero', v: y + ' v ' + m + ' kk ' + d + ' pv', big: true },
          { k: 'Viikkoja', v: MT.numAuto(abs / 7) },
          { k: 'Arkipäiviä', v: MT.num(wd) },
          { k: 'Viikonloppupäiviä', v: MT.num(we) },
          { k: 'Kuukausia (n.)', v: MT.numAuto(abs / 30.437) },
          { k: 'Vuosia (n.)', v: MT.numAuto(abs / 365.2425) },
          { k: 'Tunteja', v: MT.num(abs * 24) },
          { k: 'Minuutteja', v: MT.num(abs * 1440), sub: true },
          { k: 'Sekunteja', v: MT.num(abs * 86400), sub: true },
          { k: 'Alkupäivä', v: a.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), copy: false },
          { k: 'Loppupäivä', v: b.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), copy: false }
        ]
      };
    }
  });

  /* ---------- 8. Työpäivälaskuri ---------- */
  var PYHAT = function (y) {
    // liikkuvat juhlapyhät pääsiäisen mukaan (Gaussin algoritmi)
    var a = y % 19, b = Math.floor(y / 100), c2 = y % 100;
    var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c2 / 4), k = c2 % 4;
    var l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
    var month = Math.floor((hh + l - 7 * m + 114) / 31), day = ((hh + l - 7 * m + 114) % 31) + 1;
    var easter = new Date(y, month - 1, day);
    function off(n) { var x = new Date(easter); x.setDate(x.getDate() + n); return MT.dateStr(x); }
    // juhannus: lauantai 20.–26.6., pyhäinpäivä: lauantai 31.10.–6.11.
    function satBetween(mo, d1, d2) {
      for (var dd = d1; dd <= d2; dd++) { var x = new Date(y, mo, dd); if (x.getDay() === 6) return MT.dateStr(x); }
      return null;
    }
    return {
      [y + '-01-01']: 'Uudenvuodenpäivä', [y + '-01-06']: 'Loppiainen',
      [off(-2)]: 'Pitkäperjantai', [off(0)]: 'Pääsiäispäivä', [off(1)]: '2. pääsiäispäivä',
      [y + '-05-01']: 'Vappu', [off(39)]: 'Helatorstai', [off(49)]: 'Helluntai',
      [satBetween(5, 20, 26)]: 'Juhannuspäivä', [satBetween(9, 31, 31)]: 'Pyhäinpäivä',
      [satBetween(10, 1, 6)]: 'Pyhäinpäivä',
      [y + '-12-06']: 'Itsenäisyyspäivä', [y + '-12-25']: 'Joulupäivä', [y + '-12-26']: 'Tapaninpäivä'
    };
  };
  R({
    id: 'tyopaivalaskuri', cat: 'aika', name: 'Työpäivälaskuri', icon: 'i-calc',
    desc: 'Laske arkipäivät kahden päivän väliltä suomalaiset pyhäpäivät huomioiden.',
    keys: ['työpäivä', 'arkipäivä', 'pyhä', 'loma', 'laske'],
    fields: [
      { k: 'a', type: 'date', label: 'Alkupäivä', def: MT.dateStr() },
      { k: 'b', type: 'date', label: 'Loppupäivä', def: MT.dateStr(new Date(Date.now() + 86400000 * 60)) },
      { k: 'pyhat', type: 'check', label: 'Huomioi suomalaiset juhlapyhät', def: true },
      { k: 'tunnit', type: 'num', label: 'Työtunteja päivässä', def: '7,5' }
    ],
    run: function (v) {
      if (!v.a || !v.b) return null;
      var a = new Date(v.a + 'T00:00:00'), b = new Date(v.b + 'T00:00:00');
      if (b < a) { var t = a; a = b; b = t; }
      var hol = {};
      for (var y = a.getFullYear(); y <= b.getFullYear(); y++) {
        var hs = PYHAT(y);
        Object.keys(hs).forEach(function (k) { if (k && k !== 'null') hol[k] = hs[k]; });
      }
      var wd = 0, we = 0, ph = 0, phList = [];
      var cur = new Date(a);
      while (cur <= b) {
        var ds = MT.dateStr(cur), g = cur.getDay();
        if (g === 0 || g === 6) we++;
        else if (v.pyhat && hol[ds]) { ph++; phList.push([ds, hol[ds], cur.toLocaleDateString('fi-FI', { weekday: 'long' })]); }
        else wd++;
        cur.setDate(cur.getDate() + 1);
      }
      var hpd = isFinite(v.tunnit) ? v.tunnit : 7.5;
      return {
        rows: [
          { k: 'Työpäiviä', v: MT.num(wd), big: true },
          { k: 'Työtunteja', v: MT.numAuto(wd * hpd) + ' h', big: true },
          { k: 'Viikonloppupäiviä', v: MT.num(we) },
          { k: 'Arkipyhiä', v: MT.num(ph) },
          { k: 'Kalenteripäiviä yhteensä', v: MT.num(wd + we + ph) },
          { k: 'Työviikkoja', v: MT.numAuto(wd / 5), sub: true }
        ],
        table: phList.length ? { head: ['Päivä', 'Juhlapyhä', 'Viikonpäivä'], rows: phList, text: [0, 1, 2] } : null,
        foot: 'Laskuri huomioi kiinteät ja pääsiäisen mukaan liikkuvat suomalaiset juhlapyhät. Se ei huomioi lyhennettyjä päiviä (esim. jouluaatto ja juhannusaatto), jotka ovat monilla aloilla vapaita työehtosopimuksen perusteella.'
      };
    }
  });

  /* ---------- 9. Kalenteri ---------- */
  R({
    id: 'kalenterigeneraattori', cat: 'aika', name: 'Kalenteri', icon: 'i-grid', kind: 'custom',
    desc: 'Näytä minkä tahansa kuukauden kalenteri viikkonumeroineen ja juhlapyhineen.',
    keys: ['kalenteri', 'kuukausi', 'viikko', 'päivämäärä', 'pyhä'],
    render: function (root, c) {
      var cur = new Date(), y = cur.getFullYear(), m = cur.getMonth();
      var box = h('div'), title = h('span.lbl', { text: '' });
      function draw() {
        MT.clear(box);
        var first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
        var start = (first.getDay() + 6) % 7;
        var hol = PYHAT(y);
        title.textContent = first.toLocaleDateString('fi-FI', { month: 'long', year: 'numeric' }).toUpperCase();
        var grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'auto repeat(7,1fr)', gap: '3px', padding: '13px' } });
        grid.appendChild(h('div.lbl', { text: 'VK', style: { padding: '6px', textAlign: 'center' } }));
        ['MA', 'TI', 'KE', 'TO', 'PE', 'LA', 'SU'].forEach(function (d) {
          grid.appendChild(h('div.lbl', { text: d, style: { padding: '6px', textAlign: 'center' } }));
        });
        var day = 1 - start;
        for (var w = 0; w < 6 && day <= days; w++) {
          var wd = new Date(y, m, Math.max(1, day));
          grid.appendChild(h('div.mono', { text: MT.isoWeek(new Date(y, m, day < 1 ? 1 : day)).split(' /')[0],
            style: { padding: '9px 4px', textAlign: 'center', color: 'var(--tx-3)', fontSize: '11px', background: 'var(--panel-2)', borderRadius: '3px' } }));
          for (var i = 0; i < 7; i++, day++) {
            if (day < 1 || day > days) { grid.appendChild(h('div')); continue; }
            var ds = y + '-' + pad(m + 1) + '-' + pad(day);
            var isToday = ds === MT.dateStr();
            var isHol = hol[ds];
            var weekend = i >= 5;
            var cell = h('div', {
              title: isHol || '',
              style: {
                padding: '9px 4px', textAlign: 'center', borderRadius: '3px', fontSize: '13px',
                fontFamily: 'var(--mono)', cursor: 'default',
                background: isToday ? 'rgba(var(--acc-rgb),.18)' : isHol ? 'rgba(var(--acc-rgb),.07)' : 'var(--panel-2)',
                color: isToday ? 'var(--acc-2)' : isHol || weekend ? 'var(--acc)' : 'var(--tx)',
                border: '1px solid ' + (isToday ? 'rgba(var(--acc-rgb),.5)' : 'transparent'),
                fontWeight: isToday ? '600' : '400'
              }, text: String(day)
            });
            grid.appendChild(cell);
          }
        }
        box.appendChild(grid);
        var list = Object.keys(hol).filter(function (k) { return k && k.indexOf(y + '-' + pad(m + 1)) === 0; });
        if (list.length) {
          box.appendChild(h('div', { style: { padding: '0 13px 13px' } },
            c.resList(list.sort().map(function (k) { return { k: hol[k], v: new Date(k + 'T12:00:00').toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' }), copy: false }; }))));
        }
      }
      root.appendChild(c.panel('KALENTERI', 'i-grid', h('div', null, [box,
        h('div.panel-foot', null, [
          c.btn('', { icon: 'i-chev-l', title: 'Edellinen', on: function () { m--; if (m < 0) { m = 11; y--; } draw(); } }),
          c.btn('Tänään', { cls: 'btn-sm', on: function () { y = new Date().getFullYear(); m = new Date().getMonth(); draw(); } }),
          c.btn('', { icon: 'i-chev-r', title: 'Seuraava', on: function () { m++; if (m > 11) { m = 0; y++; } draw(); } }),
          h('span.grow'), title
        ])])));
      draw();
    }
  });

  /* ---------- 10. Viikkonumerot ---------- */
  R({
    id: 'viikkonumero', cat: 'aika', name: 'Viikkonumero', icon: 'i-clock',
    desc: 'Selvitä päivämäärän ISO-viikkonumero tai viikon alku- ja loppupäivä.',
    keys: ['viikko', 'viikkonumero', 'iso', 'päivämäärä'],
    fields: [
      { k: 'pvm', type: 'date', label: 'Päivämäärä', def: MT.dateStr() },
      { k: 'vk', type: 'num', label: 'Tai viikkonumero', def: '' },
      { k: 'vuosi', type: 'num', label: 'Vuosi (viikkohaulle)', def: String(new Date().getFullYear()) }
    ],
    run: function (v) {
      var rows = [];
      if (v.pvm) {
        var d = new Date(v.pvm + 'T12:00:00');
        var wk = MT.isoWeek(d);
        var mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        var y0 = new Date(d.getFullYear(), 0, 1);
        rows.push({ k: 'Viikkonumero', v: wk, big: true });
        rows.push({ k: 'Viikonpäivä', v: d.toLocaleDateString('fi-FI', { weekday: 'long' }) });
        rows.push({ k: 'Viikon maanantai', v: mon.toLocaleDateString('fi-FI', { day: 'numeric', month: 'long', year: 'numeric' }) });
        rows.push({ k: 'Viikon sunnuntai', v: sun.toLocaleDateString('fi-FI', { day: 'numeric', month: 'long', year: 'numeric' }) });
        rows.push({ k: 'Vuoden päivä', v: Math.ceil((d - y0) / 86400000) + 1 + ' / ' + (isLeap(d.getFullYear()) ? 366 : 365) });
        rows.push({ k: 'Karkausvuosi', v: isLeap(d.getFullYear()) ? 'kyllä' : 'ei', copy: false });
        rows.push({ k: 'Vuosineljännes', v: 'Q' + (Math.floor(d.getMonth() / 3) + 1), sub: true });
      }
      if (isFinite(v.vk) && v.vk >= 1 && v.vk <= 53 && isFinite(v.vuosi)) {
        var jan4 = new Date(v.vuosi, 0, 4);
        var week1Mon = new Date(jan4); week1Mon.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
        var mon2 = new Date(week1Mon); mon2.setDate(week1Mon.getDate() + (v.vk - 1) * 7);
        var sun2 = new Date(mon2); sun2.setDate(mon2.getDate() + 6);
        rows.push({ k: 'Viikko ' + Math.round(v.vk) + '/' + Math.round(v.vuosi), v: mon2.toLocaleDateString('fi-FI') + ' – ' + sun2.toLocaleDateString('fi-FI'), big: true });
      }
      return rows.length ? { rows: rows } : null;
    }
  });
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
})();
