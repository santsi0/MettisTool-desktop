/* Moduuli: Turvallisuus */
(function () {
  'use strict';
  var R = MT.reg, h = MT.h;

  var SETS = {
    pienet: 'abcdefghijklmnopqrstuvwxyz',
    isot: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    numerot: '0123456789',
    merkit: '!#$%&()*+-:;<=>?@[]^_{|}~',
    lisa: '.,/\\\'"`'
  };
  var SEKAVAT = 'Il1O0o';

  var SANAT = ('aamu ahven aitta ankka anturi apila arkki armas aalto asema aura autio avain eloisa entinen erilainen esine halava halko hanka harju hauki heinä helmi herkku hiekka hieno hilla hirvi hohde hopea humala huurre hyrrä hyvä höyry ihana ilta into iskuri jalava jano jousi juhla jyvä jäkälä kaarna kahvi kaisla kalastus kallio kanerva kannel kaarre karhu karpalo kastike katiska kaunis kehrä keidas kelkka kenttä kerma keto kihara kiiltävä kilpi kinos kirkas kivi koivu kolme kompassi konsti korento koski kuisti kulta kumpu kuohu kuori kurki kuusi kyyhky lahti laine lakka lampi lanka lapio lasi lastu latu lehmus leija lempi lentää lieju liesi liito lilja linna lohi lumi luola luoto lyhty lähde maja makea mansikka marja matala meri metsä mieli mylly myrsky mäki mänty nauris niitty nokka nosto notkea nuotio nurmi näkinkenkä ohdake oksa olki omena onkalo orava otava paju palo pato peippo pelto penkki peura pihka piila pilvi pinta pirtti pisara pohja poiju polku porras puro pyrstö pähkinä päivä raita rakko ranta rauha revontuli riihi rinne ripaus routa ruoho ruska ruusu saari sade saha salama sammal sarvi satama seinä selkä sieni siika silmu sini sipuli sisu soihtu soutu suisto sula summa suo sydän syli sähkö säde taika taimi taival talvi tammi tanner tarha tasku tervas tie tikka tila tuhka tuli tulva tunturi tuohi tuuli tähkä tähti töyräs ukkonen umpi unelma urho usva utu vaahtera vaara valo vanne varjo varpu vasta vedos veneet vesi vihreä viiri viita villa vilja virta vuono vuori välke yrtti äyskäri öljy').split(/\s+/);

  function pickChars(pool, n) {
    var out = '';
    for (var i = 0; i < n; i++) out += pool[MT.rint(0, pool.length - 1)];
    return out;
  }
  function entropyBits(len, poolSize) { return len * Math.log2(poolSize); }
  function crackTime(bits, guessesPerSec) {
    var sec = Math.pow(2, bits - 1) / (guessesPerSec || 1e11);
    var U = [[1, 'sekuntia'], [60, 'minuuttia'], [3600, 'tuntia'], [86400, 'päivää'], [2629746, 'kuukautta'], [31556952, 'vuotta'],
      [31556952e3, 'tuhatta vuotta'], [31556952e6, 'miljoonaa vuotta'], [31556952e9, 'miljardia vuotta']];
    for (var i = U.length - 1; i >= 0; i--) if (sec >= U[i][0]) return MT.numAuto(sec / U[i][0]) + ' ' + U[i][1];
    return 'alle sekunnin';
  }
  function strength(pw) {
    if (!pw) return { score: 0, bits: 0, label: 'tyhjä' };
    var pool = 0;
    if (/[a-z]/.test(pw)) pool += 26;
    if (/[A-Z]/.test(pw)) pool += 26;
    if (/\d/.test(pw)) pool += 10;
    if (/[^\w]/.test(pw)) pool += 33;
    if (/[\u0080-￿]/.test(pw)) pool += 100;
    var bits = entropyBits(pw.length, Math.max(pool, 2));
    // rangaistukset toistoista ja jonoista
    var uniq = new Set(pw.split('')).size;
    if (uniq < pw.length / 2) bits *= 0.7;
    if (/^(.)\1+$/.test(pw)) bits *= 0.3;
    if (/1234|abcd|qwer|asdf|password|salasana|admin/i.test(pw)) bits *= 0.5;
    var score = bits < 28 ? 1 : bits < 40 ? 2 : bits < 60 ? 3 : bits < 90 ? 4 : 5;
    var label = ['', 'erittäin heikko', 'heikko', 'kohtalainen', 'vahva', 'erittäin vahva'][score];
    return { score: score, bits: bits, label: label, pool: pool };
  }
  function meter(c, st) {
    var col = ['var(--err)', 'var(--err)', 'var(--warn)', 'var(--warn)', 'var(--ok)', 'var(--ok)'][st.score];
    var bar = h('div.bar', { style: { height: '6px' } }, h('i', { style: { width: (st.score / 5 * 100) + '%', background: col } }));
    return h('div', { style: { padding: '11px' } }, [
      h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' } }, [
        h('span.lbl', { text: 'VAHVUUS' }), h('span', { text: st.label.toUpperCase(), style: { color: col, fontSize: '11px', fontWeight: '600', letterSpacing: '.08em' } })
      ]), bar
    ]);
  }

  /* ---------- 1. Salasanageneraattori ---------- */
  R({
    id: 'salasanageneraattori', cat: 'turvallisuus', name: 'Salasanageneraattori', icon: 'i-shield', kind: 'custom',
    desc: 'Luo vahvoja satunnaisia salasanoja. Satunnaisuus tulee selaimen kryptografisesta lähteestä.',
    keys: ['salasana', 'password', 'generoi', 'satunnainen', 'turva'],
    render: function (root, c) {
      var F = [
        { k: 'pituus', type: 'range', label: 'Pituus', def: 20, min: 6, max: 128, step: 1, suffix: ' merkkiä' },
        { k: 'kpl', type: 'num', label: 'Montako salasanaa', def: '5' },
        { k: 'pienet', type: 'check', label: 'Pienet kirjaimet (a–z)', def: true },
        { k: 'isot', type: 'check', label: 'Isot kirjaimet (A–Z)', def: true },
        { k: 'numerot', type: 'check', label: 'Numerot (0–9)', def: true },
        { k: 'merkit', type: 'check', label: 'Erikoismerkit (!#$%…)', def: true },
        { k: 'selkeat', type: 'check', label: 'Jätä pois sekoittuvat merkit (Il1O0o)', def: false },
        { k: 'kaikki', type: 'check', label: 'Varmista vähintään yksi merkki jokaisesta ryhmästä', def: true }
      ];
      var box = c.fields(F, gen), out = h('div', { style: { marginTop: '13px' } });
      function gen() {
        var v = c.readFields(box, F);
        var pool = '';
        ['pienet', 'isot', 'numerot', 'merkit'].forEach(function (k) { if (v[k]) pool += SETS[k]; });
        if (v.selkeat) pool = pool.split('').filter(function (ch) { return SEKAVAT.indexOf(ch) < 0; }).join('');
        MT.clear(out);
        if (!pool) { out.appendChild(c.note('Valitse vähintään yksi merkkiryhmä.', 'err')); return; }
        var len = Math.round(v.pituus), n = Math.max(1, Math.min(100, Math.round(v.kpl) || 1)), list = [];
        for (var i = 0; i < n; i++) {
          var pw = pickChars(pool, len);
          if (v.kaikki) {
            var req = ['pienet', 'isot', 'numerot', 'merkit'].filter(function (k) { return v[k]; });
            req.forEach(function (k, idx) {
              var s = v.selkeat ? SETS[k].split('').filter(function (ch) { return SEKAVAT.indexOf(ch) < 0; }).join('') : SETS[k];
              if (idx < len) pw = pw.slice(0, idx) + s[MT.rint(0, s.length - 1)] + pw.slice(idx + 1);
            });
            pw = MT.shuffle(pw.split('')).join('');
          }
          list.push(pw);
        }
        var st = strength(list[0]);
        var rows = h('div.rows');
        list.forEach(function (pw) {
          rows.appendChild(h('div.row-item', { onclick: function () { MT.copy(pw, 'Salasana kopioitu'); } }, [
            h('span.row-main', null, h('div.n.mono', { text: pw, style: { fontSize: '14px', wordBreak: 'break-all' } })),
            c.btn('', { cls: 'btn-gh btn-sm', icon: 'i-copy', title: 'Kopioi' })
          ]));
        });
        out.appendChild(c.panel('SALASANAT', 'i-key', h('div', null, [rows, meter(c, st),
          h('div.panel-foot', null, [
            c.btn('Luo uudet', { cls: 'btn-sm btn-pri', icon: 'i-refresh', on: gen }),
            c.btn('Kopioi kaikki', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(list.join('\n')); } }),
            h('span.grow'),
            h('span.lbl', { text: Math.round(st.bits) + ' BITTIÄ ENTROPIAA · MERKISTÖ ' + pool.length })
          ])])));
        out.appendChild(h('div', { style: { marginTop: '11px' } }, c.resList([
          { k: 'Entropia', v: Math.round(st.bits) + ' bittiä', copy: false },
          { k: 'Mahdollisia yhdistelmiä', v: pool.length + '^' + len + ' ≈ 10^' + Math.round(len * Math.log10(pool.length)), copy: false },
          { k: 'Murtoaika (10¹¹ arvausta/s)', v: crackTime(st.bits), copy: false, big: true }
        ])));
      }
      root.appendChild(c.panel('ASETUKSET', 'i-filter', h('div.panel-body', null, box)));
      root.appendChild(out);
      root.appendChild(h('div', { style: { marginTop: '11px' } },
        c.note('Salasanat luodaan selaimesi <b>crypto.getRandomValues</b>-funktiolla eikä niitä lähetetä minnekään. Mitään ei myöskään tallenneta — sulje välilehti ja salasanat katoavat.', 'ok', 'i-shield')));
      gen();
    }
  });

  /* ---------- 2. Salalause ---------- */
  R({
    id: 'salalausegeneraattori', cat: 'turvallisuus', name: 'Salalausegeneraattori', icon: 'i-key', kind: 'custom',
    desc: 'Luo muistettavia mutta vahvoja salalauseita suomalaisista sanoista.',
    keys: ['salalause', 'passphrase', 'diceware', 'muistettava'],
    render: function (root, c) {
      var F = [
        { k: 'sanoja', type: 'range', label: 'Sanoja', def: 4, min: 3, max: 10, step: 1, suffix: ' kpl' },
        { k: 'kpl', type: 'num', label: 'Montako lausetta', def: '5' },
        { k: 'erotin', type: 'select', label: 'Erotin', def: '-', opts: [['-', 'Viiva -'], ['.', 'Piste .'], ['_', 'Alaviiva _'], [' ', 'Välilyönti'], ['', 'Ei erotinta']] },
        { k: 'isot', type: 'check', label: 'Iso alkukirjain jokaiseen sanaan', def: true },
        { k: 'numero', type: 'check', label: 'Lisää numero loppuun', def: true },
        { k: 'merkki', type: 'check', label: 'Lisää erikoismerkki loppuun', def: false }
      ];
      var box = c.fields(F, gen), out = h('div', { style: { marginTop: '13px' } });
      function gen() {
        var v = c.readFields(box, F);
        var n = Math.max(1, Math.min(50, Math.round(v.kpl) || 1)), w = Math.round(v.sanoja), list = [];
        for (var i = 0; i < n; i++) {
          var ws = [];
          for (var j = 0; j < w; j++) {
            var s = SANAT[MT.rint(0, SANAT.length - 1)];
            ws.push(v.isot ? s[0].toUpperCase() + s.slice(1) : s);
          }
          var p = ws.join(v.erotin);
          if (v.numero) p += MT.rint(10, 99);
          if (v.merkki) p += SETS.merkit[MT.rint(0, SETS.merkit.length - 1)];
          list.push(p);
        }
        var bits = w * Math.log2(SANAT.length) + (v.numero ? Math.log2(90) : 0) + (v.merkki ? Math.log2(SETS.merkit.length) : 0);
        MT.clear(out);
        var rows = h('div.rows');
        list.forEach(function (p) {
          rows.appendChild(h('div.row-item', { onclick: function () { MT.copy(p, 'Salalause kopioitu'); } }, [
            h('span.row-main', null, h('div.n.mono', { text: p, style: { fontSize: '14px', wordBreak: 'break-all' } })),
            c.btn('', { cls: 'btn-gh btn-sm', icon: 'i-copy' })
          ]));
        });
        out.appendChild(c.panel('SALALAUSEET', 'i-key', h('div', null, [rows,
          h('div.panel-foot', null, [
            c.btn('Luo uudet', { cls: 'btn-sm btn-pri', icon: 'i-refresh', on: gen }),
            c.btn('Kopioi kaikki', { cls: 'btn-sm', icon: 'i-copy', on: function () { MT.copy(list.join('\n')); } }),
            h('span.grow'), h('span.lbl', { text: Math.round(bits) + ' BITTIÄ · SANASTO ' + SANAT.length })
          ])])));
        out.appendChild(h('div', { style: { marginTop: '11px' } }, c.resList([
          { k: 'Entropia', v: Math.round(bits) + ' bittiä', copy: false, big: true },
          { k: 'Murtoaika (10¹¹ arvausta/s)', v: crackTime(bits), copy: false, big: true },
          { k: 'Sanaston koko', v: SANAT.length + ' suomalaista sanaa', copy: false }
        ])));
      }
      root.appendChild(c.panel('ASETUKSET', 'i-filter', h('div.panel-body', null, box)));
      root.appendChild(out);
      root.appendChild(h('div', { style: { marginTop: '11px' } },
        c.note('Salalause on helpompi muistaa kuin satunnainen merkkijono ja silti erittäin vahva, koska pituus kasvaa nopeasti. Neljä sanaa tästä sanastosta vastaa noin ' + Math.round(4 * Math.log2(SANAT.length)) + ' bitin entropiaa.', 'info')));
      gen();
    }
  });

  /* ---------- 3. Salasanan vahvuus ---------- */
  R({
    id: 'salasanan-vahvuus', cat: 'turvallisuus', name: 'Salasanan vahvuus', icon: 'i-shield', kind: 'custom',
    desc: 'Arvioi salasanan entropia ja murtoaika. Salasanaa ei lähetetä mihinkään.',
    keys: ['salasana', 'vahvuus', 'entropia', 'testaa', 'murto'],
    render: function (root, c) {
      var inp = h('input.ctl.mono', { type: 'password', placeholder: 'Kirjoita salasana…', style: { fontSize: '16px', height: '38px' } });
      var show = c.btn('Näytä', { icon: 'i-eye', on: function (e) {
        inp.type = inp.type === 'password' ? 'text' : 'password';
        e.currentTarget.classList.toggle('on', inp.type === 'text');
      } });
      var out = h('div', { style: { marginTop: '13px' } });
      function upd() {
        var pw = inp.value, st = strength(pw);
        MT.clear(out);
        if (!pw) { out.appendChild(c.empty('Ei salasanaa', 'Kirjoita salasana arvioitavaksi. Se ei poistu selaimestasi.', 'i-shield')); return; }
        var issues = [];
        if (pw.length < 12) issues.push('Salasana on lyhyt — suositus on vähintään 12–16 merkkiä.');
        if (!/[A-ZÄÖÅ]/.test(pw)) issues.push('Ei isoja kirjaimia.');
        if (!/\d/.test(pw)) issues.push('Ei numeroita.');
        if (!/[^\w]/.test(pw)) issues.push('Ei erikoismerkkejä.');
        if (/^(.)\1+$/.test(pw)) issues.push('Salasana koostuu samasta merkistä.');
        if (/1234|abcd|qwer|asdf|password|salasana|admin|123456/i.test(pw)) issues.push('Sisältää yleisen kuvion tai sanan.');
        if (/^\d+$/.test(pw)) issues.push('Pelkät numerot murretaan sekunneissa.');
        out.appendChild(c.panel('ARVIO', 'i-shield', h('div', null, [
          meter(c, st),
          c.resList([
            { k: 'Pituus', v: pw.length + ' merkkiä', copy: false },
            { k: 'Merkistön koko', v: st.pool + ' merkkiä', copy: false },
            { k: 'Entropia', v: Math.round(st.bits) + ' bittiä', copy: false, big: true },
            { k: 'Murtoaika (offline, 10¹¹/s)', v: crackTime(st.bits, 1e11), copy: false, big: true },
            { k: 'Murtoaika (verkossa, 1000/s)', v: crackTime(st.bits, 1000), copy: false },
            { k: 'Uniikkeja merkkejä', v: new Set(pw.split('')).size + ' / ' + pw.length, copy: false }
          ])
        ])));
        out.appendChild(h('div', { style: { marginTop: '11px' } },
          issues.length ? c.note('<b>Havaitut heikkoudet:</b><br>· ' + issues.join('<br>· '), 'warn')
            : c.note('Salasanassa ei havaittu tyypillisiä heikkouksia.', 'ok')));
      }
      inp.addEventListener('input', MT.debounce(upd, 120));
      root.appendChild(c.panel('SALASANA', 'i-key', h('div.panel-body', null, [
        h('div', { style: { display: 'flex', gap: '8px' } }, [inp, show])])));
      root.appendChild(out);
      root.appendChild(h('div', { style: { marginTop: '11px' } },
        c.note('Arvio lasketaan kokonaan selaimessasi. Salasanaa ei tallenneta eikä lähetetä verkkoon. Murtoaika-arviot olettavat hyökkääjän saaneen tiivistetiedoston haltuunsa.', 'ok', 'i-shield')));
      upd();
    }
  });

  /* ---------- 4. Satunnainen token ---------- */
  R({
    id: 'satunnainen-token', cat: 'turvallisuus', name: 'Satunnainen token', icon: 'i-key',
    desc: 'Luo satunnaisia tokeneita heksana, Base64:nä tai URL-turvallisena merkkijonona.',
    keys: ['token', 'satunnainen', 'avain', 'nonce', 'secret'],
    fields: [
      { k: 'tavut', type: 'select', label: 'Pituus', def: '32', opts: [['16', '16 tavua (128 bittiä)'], ['24', '24 tavua (192 bittiä)'], ['32', '32 tavua (256 bittiä)'], ['48', '48 tavua (384 bittiä)'], ['64', '64 tavua (512 bittiä)']] },
      { k: 'muoto', type: 'select', label: 'Muoto', def: 'hex', opts: [['hex', 'Heksadesimaali'], ['b64', 'Base64'], ['b64url', 'Base64 URL-turvallinen'], ['alnum', 'Kirjaimet ja numerot']] },
      { k: 'kpl', type: 'num', label: 'Määrä', def: '5' }
    ],
    action: 'Luo tokenit', live: false,
    run: function (v) {
      var n = Math.max(1, Math.min(200, Math.round(v.kpl) || 1)), list = [];
      for (var i = 0; i < n; i++) {
        var b = crypto.getRandomValues(new Uint8Array(+v.tavut));
        var s;
        if (v.muoto === 'hex') s = HASH.hex(b);
        else if (v.muoto === 'b64') s = HASH.b64(b);
        else if (v.muoto === 'b64url') s = HASH.b64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        else {
          var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
          s = Array.prototype.map.call(b, function (x) { return A[x % A.length]; }).join('');
        }
        list.push(s);
      }
      return {
        out: list.join('\n'),
        rows: list.map(function (s, i) { return { k: 'Token ' + (i + 1), v: s }; }),
        foot: 'Tokenit luodaan selaimen kryptografisella satunnaisgeneraattorilla. ' + (+v.tavut * 8) + ' bittiä on riittävä istuntotunnisteille, API-avaimille ja nonce-arvoille.'
      };
    }
  });

  /* ---------- 5. Avain- ja salaisuusgeneraattori ---------- */
  R({
    id: 'avaingeneraattori', cat: 'turvallisuus', name: 'API-avain ja salaisuus', icon: 'i-key',
    desc: 'Luo valmiita API-avaimia, JWT-salaisuuksia ja ympäristömuuttujia.',
    keys: ['api', 'avain', 'secret', 'jwt', 'env', 'salaisuus'],
    fields: [
      { k: 'etuliite', type: 'text', label: 'Etuliite', def: 'mt_live', hint: 'Esim. sk_live, api_' },
      { k: 'tavut', type: 'select', label: 'Satunnaisuus', def: '32', opts: [['16', '128 bittiä'], ['24', '192 bittiä'], ['32', '256 bittiä'], ['64', '512 bittiä']] },
      { k: 'muoto', type: 'select', label: 'Tuloste', def: 'avain', opts: [['avain', 'Yksittäinen avain'], ['env', '.env-tiedosto'], ['json', 'JSON-objekti']] }
    ],
    action: 'Luo avaimet', live: false,
    run: function (v) {
      function tok(nb) {
        return HASH.b64(crypto.getRandomValues(new Uint8Array(nb || +v.tavut))).replace(/\+/g, '').replace(/\//g, '').replace(/=+$/, '');
      }
      var key = (v.etuliite ? v.etuliite + '_' : '') + tok();
      if (v.muoto === 'avain') {
        return { rows: [{ k: 'API-avain', v: key, big: true }, { k: 'Pituus', v: key.length + ' merkkiä', copy: false }], out: key,
          foot: 'Säilytä avain salaisuuksien hallinnassa (esim. ympäristömuuttujissa). Älä koskaan tallenna avainta versionhallintaan.' };
      }
      var vals = {
        API_KEY: key,
        JWT_SECRET: tok(48),
        SESSION_SECRET: tok(32),
        ENCRYPTION_KEY: HASH.hex(crypto.getRandomValues(new Uint8Array(32))),
        WEBHOOK_SECRET: 'whsec_' + tok(24)
      };
      var out = v.muoto === 'env'
        ? Object.keys(vals).map(function (k) { return k + '=' + vals[k]; }).join('\n')
        : JSON.stringify(vals, null, 2);
      return {
        out: out,
        rows: Object.keys(vals).map(function (k) { return { k: k, v: vals[k] }; }),
        foot: 'Jokainen arvo on erillinen satunnainen salaisuus. Kierrätä avaimet säännöllisesti ja peruuta vanhat heti vuodon jälkeen.'
      };
    }
  });

  /* ---------- 6.–9. Yksittäiset tiivisteet ---------- */
  function hashTool(id, name, algo, desc, warn) {
    R({
      id: id, cat: 'turvallisuus', name: name, icon: 'i-hash', kind: 'io', desc: desc,
      keys: [algo.toLowerCase(), 'tiiviste', 'hash', 'checksum'],
      io: {
        inLabel: 'SYÖTE', outLabel: algo + '-TIIVISTE', lang: 'none', sample: 'MettisTool',
        opts: [{ k: 'muoto', type: 'select', label: 'Tuloste', def: 'hex', opts: [['hex', 'Heksadesimaali'], ['HEX', 'HEKSA ISOLLA'], ['b64', 'Base64']] },
          { k: 'rivi', type: 'check', label: 'Laske jokaiselle riville erikseen', def: false }],
        run: function (t, o) {
          var items = o.rivi ? t.split('\n') : [t];
          return Promise.all(items.map(function (x) { return HASH.digest(algo, x); })).then(function (res) {
            var out = res.map(function (b, i) {
              var s = o.muoto === 'b64' ? HASH.b64(b) : o.muoto === 'HEX' ? HASH.hex(b).toUpperCase() : HASH.hex(b);
              return o.rivi ? items[i].slice(0, 30).padEnd(32) + ' ' + s : s;
            }).join('\n');
            return { out: out, status: algo + ' LASKETTU', kind: 'ok', meta: [['BITTEJÄ', res[0].length * 8]] };
          });
        },
        foot: warn ? function (c) { return c.note(warn, 'warn'); } : function (c) {
          return c.note('Tiiviste lasketaan selaimen WebCrypto-rajapinnalla paikallisesti. Syötettä ei lähetetä mihinkään.', 'ok', 'i-shield');
        }
      }
    });
  }
  hashTool('sha256', 'SHA-256', 'SHA-256', 'Laske SHA-256-tiiviste — nykyaikainen standardi eheystarkistuksiin.');
  hashTool('sha512', 'SHA-512', 'SHA-512', 'Laske SHA-512-tiiviste pidemmällä 512 bitin tulosteella.');
  hashTool('sha1', 'SHA-1', 'SHA-1', 'Laske SHA-1-tiiviste vanhojen järjestelmien yhteensopivuutta varten.',
    'SHA-1 on murrettu: törmäyksiä voidaan tuottaa tarkoituksella. Älä käytä sitä allekirjoituksiin tai salasanoihin — vain vanhojen järjestelmien yhteensopivuuteen.');
  hashTool('md5', 'MD5', 'MD5', 'Laske MD5-tarkistussumma tiedostojen eheyden vertailuun.',
    'MD5 on murrettu eikä sovi turvallisuustarkoituksiin. Käytä sitä vain tiedostojen eheysvertailuun luotetussa ympäristössä.');

  /* ---------- 10. HMAC ---------- */
  R({
    id: 'hmac-generaattori', cat: 'turvallisuus', name: 'HMAC-generaattori', icon: 'i-key', kind: 'io',
    desc: 'Laske viestin todennuskoodi (HMAC) salaisella avaimella — webhook-allekirjoituksiin.',
    keys: ['hmac', 'allekirjoitus', 'webhook', 'avain', 'sha'],
    io: {
      inLabel: 'VIESTI', outLabel: 'HMAC', lang: 'none', sample: '{"tapahtuma":"tilaus.luotu","id":12345}',
      opts: [{ k: 'avain', type: 'text', label: 'Salainen avain', def: 'salainen-avain', mono: true },
        { k: 'algo', type: 'select', label: 'Algoritmi', def: 'SHA-256', opts: [['SHA-256', 'HMAC-SHA-256'], ['SHA-1', 'HMAC-SHA-1'], ['SHA-384', 'HMAC-SHA-384'], ['SHA-512', 'HMAC-SHA-512']] },
        { k: 'muoto', type: 'select', label: 'Tuloste', def: 'hex', opts: [['hex', 'Heksadesimaali'], ['b64', 'Base64']] }],
      run: function (t, o) {
        if (!o.avain) throw new Error('Anna salainen avain');
        return HASH.hmac(o.algo, o.avain, t).then(function (b) {
          var s = o.muoto === 'b64' ? HASH.b64(b) : HASH.hex(b);
          return { out: s + '\n\nOtsakemuodossa:\nX-Signature: ' + (o.algo === 'SHA-256' ? 'sha256=' : '') + s,
            status: 'ALLEKIRJOITETTU', kind: 'ok', meta: [['ALGORITMI', 'HMAC-' + o.algo]] };
        });
      }
    }
  });

  /* ---------- 11. Tiivisteiden vertailu ---------- */
  R({
    id: 'tiivisteiden-vertailu', cat: 'turvallisuus', name: 'Tiivisteiden vertailu', icon: 'i-checksq',
    desc: 'Vertaa kahta tarkistussummaa turvallisesti merkki merkiltä.',
    keys: ['vertaa', 'tiiviste', 'checksum', 'eheys', 'sama'],
    fields: [
      { k: 'a', type: 'textarea', label: 'Tiiviste A (odotettu)', def: '', rows: 3 },
      { k: 'b', type: 'textarea', label: 'Tiiviste B (laskettu)', def: '', rows: 3 }
    ],
    run: function (v, c) {
      var a = (v.a || '').trim().toLowerCase().replace(/\s/g, ''), b = (v.b || '').trim().toLowerCase().replace(/\s/g, '');
      if (!a || !b) return { note: { text: 'Syötä molemmat tiivisteet vertailtavaksi.', kind: 'info' } };
      var same = a.length === b.length && a === b;
      var diff = 0;
      for (var i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) diff++;
      var type = { 32: 'MD5', 40: 'SHA-1', 64: 'SHA-256', 96: 'SHA-384', 128: 'SHA-512' };
      return {
        note: { text: same ? '<b>Tiivisteet täsmäävät.</b> Tiedosto on muuttumaton ja eheä.' : '<b>Tiivisteet eivät täsmää.</b> Tiedosto on eri, vioittunut tai muokattu.', kind: same ? 'ok' : 'err' },
        rows: [
          { k: 'Tulos', v: same ? 'TÄSMÄÄ' : 'EI TÄSMÄÄ', copy: false, big: true },
          { k: 'Eroavia merkkejä', v: String(diff), copy: false },
          { k: 'Pituus A', v: a.length + ' merkkiä' + (type[a.length] ? ' (' + type[a.length] + ')' : ''), copy: false },
          { k: 'Pituus B', v: b.length + ' merkkiä' + (type[b.length] ? ' (' + type[b.length] + ')' : ''), copy: false }
        ]
      };
    }
  });

  /* ---------- 12. Vuotaneet salasanat ---------- */
  R({
    id: 'vuotaneet-salasanat', cat: 'turvallisuus', name: 'Vuototarkistus', icon: 'i-alert', kind: 'custom',
    net: 'Lähettää vain salasanan SHA-1-tiivisteen viisi ensimmäistä merkkiä Have I Been Pwned -palveluun (k-anonymiteetti).',
    desc: 'Tarkista onko salasana esiintynyt tietovuodoissa — itse salasanaa ei lähetetä verkkoon.',
    keys: ['vuoto', 'pwned', 'tietomurto', 'salasana', 'hibp'],
    render: function (root, c) {
      var inp = h('input.ctl.mono', { type: 'password', placeholder: 'Salasana tarkistettavaksi…', style: { fontSize: '15px', height: '36px' } });
      var out = h('div', { style: { marginTop: '13px' } });
      function check() {
        var pw = inp.value;
        if (!pw) { MT.toast('Syötä salasana', 'warn'); return; }
        MT.clear(out);
        out.appendChild(h('div', { style: { padding: '14px', textAlign: 'center' } }, [h('span.spin'), h('span', { text: '  Tarkistetaan…' })]));
        HASH.digest('SHA-1', pw).then(function (b) {
          var hex = HASH.hex(b).toUpperCase(), prefix = hex.slice(0, 5), suffix = hex.slice(5);
          return fetch('https://api.pwnedpasswords.com/range/' + prefix).then(function (r) {
            if (!r.ok) throw new Error('Palvelu vastasi: HTTP ' + r.status);
            return r.text();
          }).then(function (txt) {
            var hit = 0;
            txt.split('\n').forEach(function (line) {
              var p = line.trim().split(':');
              if (p[0] === suffix) hit = parseInt(p[1], 10);
            });
            MT.clear(out);
            out.appendChild(hit
              ? c.note('<b>Tämä salasana on vuotanut.</b> Se esiintyy ' + MT.num(hit) + ' kertaa tunnetuissa tietovuodoissa. Vaihda se heti kaikissa palveluissa joissa käytät sitä.', 'err')
              : c.note('<b>Ei osumia.</b> Salasanaa ei löytynyt Have I Been Pwned -tietokannasta. Tämä ei silti takaa, että se olisi vahva.', 'ok'));
            out.appendChild(h('div', { style: { marginTop: '11px' } }, c.resList([
              { k: 'Lähetetty palvelulle', v: prefix + ' (5 merkkiä tiivisteestä)', copy: false },
              { k: 'Vastauksia vertailtu', v: txt.split('\n').length + ' kpl paikallisesti', copy: false },
              { k: 'Osumia', v: hit ? MT.num(hit) : '0', copy: false, big: true }
            ])));
          });
        }).catch(function (e) {
          MT.clear(out);
          out.appendChild(c.note('Tarkistus epäonnistui: ' + e.message + '. Tarkista verkkoyhteys.', 'err'));
        });
      }
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') check(); });
      root.appendChild(c.panel('TARKISTUS', 'i-shield', h('div.panel-body', null, [
        h('div', { style: { display: 'flex', gap: '8px' } }, [inp, c.btn('Tarkista', { cls: 'btn-pri', icon: 'i-search', on: check })])])));
      root.appendChild(out);
      root.appendChild(h('div', { style: { marginTop: '11px' } },
        c.note('<b>Näin se toimii:</b> salasanasta lasketaan SHA-1-tiiviste selaimessasi. Palveluun lähetetään vain tiivisteen <b>viisi ensimmäistä merkkiä</b>, ja se palauttaa sadat samalla alulla olevat tiivisteet. Vertailu tehdään paikallisesti. Palvelu ei siis koskaan näe salasanaasi eikä edes sen koko tiivistettä. Tätä kutsutaan k-anonymiteetiksi.', 'info')));
      MT.clear(out); out.appendChild(c.empty('Ei tarkistusta', 'Syötä salasana ja paina Tarkista.', 'i-shield'));
    }
  });

  /* ---------- 13. Entropialaskuri ---------- */
  R({
    id: 'entropia-laskuri', cat: 'turvallisuus', name: 'Entropialaskuri', icon: 'i-zap',
    desc: 'Laske merkkijonon tai salasanapolitiikan entropia ja arvioitu murtoaika.',
    keys: ['entropia', 'bitit', 'satunnaisuus', 'shannon', 'vahvuus'],
    fields: [
      { k: 'tapa', type: 'select', label: 'Laskutapa', def: 'merkisto', opts: [['merkisto', 'Merkistön koon mukaan'], ['shannon', 'Shannon-entropia merkkijonosta']] },
      { k: 'teksti', type: 'text', label: 'Merkkijono', def: 'Korkea-Jalava-Routa-42', mono: true },
      { k: 'pituus', type: 'num', label: 'Pituus (politiikkalaskenta)', def: '16' },
      { k: 'pool', type: 'num', label: 'Merkistön koko', def: '94' }
    ],
    run: function (v) {
      var rows = [];
      if (v.tapa === 'shannon') {
        var s = v.teksti || '', f = {};
        Array.from(s).forEach(function (ch) { f[ch] = (f[ch] || 0) + 1; });
        var H = 0;
        Object.keys(f).forEach(function (k) { var p = f[k] / s.length; H -= p * Math.log2(p); });
        var total = H * s.length;
        rows = [
          { k: 'Shannon-entropia / merkki', v: H.toFixed(3).replace('.', ',') + ' bittiä', copy: false },
          { k: 'Kokonaisentropia', v: Math.round(total) + ' bittiä', copy: false, big: true },
          { k: 'Uniikkeja merkkejä', v: Object.keys(f).length + ' / ' + s.length, copy: false },
          { k: 'Murtoaika (10¹¹/s)', v: crackTime(total), copy: false, big: true }
        ];
      } else {
        var bits = entropyBits(v.pituus, Math.max(2, v.pool));
        rows = [
          { k: 'Entropia', v: Math.round(bits) + ' bittiä', copy: false, big: true },
          { k: 'Yhdistelmiä', v: '≈ 10^' + Math.round(v.pituus * Math.log10(Math.max(2, v.pool))), copy: false },
          { k: 'Murtoaika (10¹¹/s, offline)', v: crackTime(bits, 1e11), copy: false, big: true },
          { k: 'Murtoaika (10⁶/s)', v: crackTime(bits, 1e6), copy: false },
          { k: 'Murtoaika (1000/s, verkossa)', v: crackTime(bits, 1000), copy: false }
        ];
      }
      return {
        rows: rows,
        table: { head: ['Merkistö', 'Koko', 'Esimerkki'], rows: [
          ['Numerot', '10', '0–9'], ['Pienet kirjaimet', '26', 'a–z'], ['Kirjaimet', '52', 'a–z A–Z'],
          ['Kirjaimet + numerot', '62', 'a–z A–Z 0–9'], ['Täysi ASCII', '94', 'kaikki näppäimistön merkit'],
          ['Sanasto (salalause)', String(SANAT.length), 'sanoja per valinta']
        ], text: [0, 2] },
        foot: 'Nyrkkisääntö: alle 50 bittiä on heikko, 60–80 bittiä riittää useimpiin käyttötarkoituksiin ja yli 100 bittiä on erittäin vahva.'
      };
    }
  });

  /* ---------- 14. TOTP ---------- */
  function b32decode(s) {
    var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    s = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
    var bits = 0, val = 0, out = [];
    for (var i = 0; i < s.length; i++) {
      var idx = A.indexOf(s[i]);
      if (idx < 0) continue;
      val = (val << 5) | idx; bits += 5;
      if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xFF); bits -= 8; }
    }
    return new Uint8Array(out);
  }
  R({
    id: 'totp-koodi', cat: 'turvallisuus', name: 'TOTP-koodi', icon: 'i-clock', kind: 'custom',
    desc: 'Laske kaksivaiheisen tunnistautumisen kertakäyttökoodi Base32-salaisuudesta.',
    keys: ['totp', '2fa', 'mfa', 'kertakäyttö', 'authenticator', 'koodi'],
    render: function (root, c) {
      var secret = h('input.ctl.mono', { placeholder: 'JBSWY3DPEHPK3PXP', value: 'JBSWY3DPEHPK3PXP' });
      var digits = h('select.ctl');
      [['6', '6 numeroa'], ['8', '8 numeroa']].forEach(function (o) { digits.appendChild(h('option', { value: o[0], text: o[1] })); });
      var period = h('select.ctl');
      [['30', '30 sekuntia'], ['60', '60 sekuntia']].forEach(function (o) { period.appendChild(h('option', { value: o[0], text: o[1] })); });
      var code = h('div.mono', { text: '––– –––', style: { fontSize: '38px', textAlign: 'center', padding: '16px', letterSpacing: '.08em' } });
      var bar = h('div.bar', { style: { margin: '0 16px 14px' } }, h('i', { style: { width: '100%' } }));
      var info = h('div');
      function calc() {
        var sec = secret.value.trim();
        if (!sec) { code.textContent = '––– –––'; return; }
        var key;
        try { key = b32decode(sec); } catch (e) { code.textContent = 'virhe'; return; }
        if (!key.length) { code.textContent = '––– –––'; return; }
        var per = +period.value, dig = +digits.value;
        var counter = Math.floor(Date.now() / 1000 / per);
        var buf = new Uint8Array(8), dv = new DataView(buf.buffer);
        dv.setUint32(4, counter >>> 0, false);
        dv.setUint32(0, Math.floor(counter / 4294967296), false);
        HASH.hmac('SHA-1', key, buf).then(function (hm) {
          var off = hm[hm.length - 1] & 0x0F;
          var val = ((hm[off] & 0x7F) << 24) | (hm[off + 1] << 16) | (hm[off + 2] << 8) | hm[off + 3];
          var otp = String(val % Math.pow(10, dig)).padStart(dig, '0');
          code.textContent = dig === 6 ? otp.slice(0, 3) + ' ' + otp.slice(3) : otp.slice(0, 4) + ' ' + otp.slice(4);
          code.dataset.otp = otp;
          MT.clear(info);
          info.appendChild(c.resList([
            { k: 'Aikaikkuna', v: '#' + counter, copy: false },
            { k: 'Voimassa', v: (per - Math.floor(Date.now() / 1000) % per) + ' sekuntia', copy: false },
            { k: 'Algoritmi', v: 'HMAC-SHA-1, ' + dig + ' numeroa, ' + per + ' s', copy: false }
          ]));
        }).catch(function () { code.textContent = 'virhe'; });
      }
      function tick() {
        var per = +period.value, left = per - Math.floor(Date.now() / 1000) % per;
        bar.firstChild.style.width = (left / per * 100) + '%';
        bar.firstChild.style.background = left <= 5 ? 'var(--err)' : 'var(--acc)';
        if (left === per || !code.dataset.otp) calc();
        if (left % 5 === 0) calc();
      }
      [secret, digits, period].forEach(function (x) { x.addEventListener('input', calc); x.addEventListener('change', calc); });
      c.timer(tick, 1000);
      root.appendChild(c.panel('KERTAKÄYTTÖKOODI', 'i-clock', h('div', null, [code, bar,
        h('div.panel-foot', null, [c.btn('Kopioi koodi', { cls: 'btn-sm btn-pri', icon: 'i-copy', on: function () { MT.copy(code.dataset.otp || ''); } })])])));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.panel('ASETUKSET', 'i-filter', h('div.panel-body', null,
        h('div.fields', null, [
          h('div.field', null, [h('label', { text: 'Base32-salaisuus' }), secret]),
          h('div.field', null, [h('label', { text: 'Numeroita' }), digits]),
          h('div.field', null, [h('label', { text: 'Aikaikkuna' }), period])
        ])))));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, info));
      root.appendChild(h('div', { style: { marginTop: '11px' } },
        c.note('Koodi lasketaan selaimessasi RFC 6238:n mukaisesti eikä salaisuutta tallenneta tai lähetetä mihinkään. Tämä työkalu on tarkoitettu testaukseen ja varakoodiksi — päivittäiseen käyttöön kannattaa käyttää erillistä tunnistussovellusta eri laitteella.', 'warn')));
      calc(); tick();
    }
  });

  /* ---------- 15. Tekstin salaus ---------- */
  R({
    id: 'teksti-salaus', cat: 'turvallisuus', name: 'Tekstin salaus', icon: 'i-shield', kind: 'custom',
    desc: 'Salaa ja pura tekstiä AES-256-GCM-salauksella ja salasanalla. Kaikki tapahtuu selaimessa.',
    keys: ['salaus', 'aes', 'encrypt', 'purku', 'salasana', 'suojaa'],
    render: function (root, c) {
      var pw = h('input.ctl.mono', { type: 'password', placeholder: 'Salasana' });
      var inEd = c.editor({ label: 'TEKSTI', placeholder: 'Kirjoita salattava teksti tai liitä salattu sisältö…' });
      var outEd = c.editor({ label: 'TULOS', readonly: true });
      inEd.el.style.minHeight = outEd.el.style.minHeight = '240px';
      var sb = c.statusbar([{ k: 'TILA', v: 'valmis' }]);
      function deriveKey(salt) {
        return crypto.subtle.importKey('raw', new TextEncoder().encode(pw.value), 'PBKDF2', false, ['deriveKey'])
          .then(function (km) {
            return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: 250000, hash: 'SHA-256' },
              km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
          });
      }
      function enc() {
        if (!pw.value) return MT.toast('Anna salasana', 'warn');
        var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
        sb.set([{ k: 'TILA', v: 'salataan…' }]);
        deriveKey(salt).then(function (key) {
          return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(inEd.get()));
        }).then(function (ct) {
          var all = new Uint8Array(16 + 12 + ct.byteLength);
          all.set(salt, 0); all.set(iv, 16); all.set(new Uint8Array(ct), 28);
          outEd.set('MT1:' + HASH.b64(all));
          sb.set([{ k: '', v: 'SALATTU', kind: 'ok', dot: true }, { k: 'ALGORITMI', v: 'AES-256-GCM' }, { k: 'KIERROKSIA', v: '250 000 (PBKDF2)' }]);
        }).catch(function (e) { sb.set([{ k: '', v: 'VIRHE: ' + e.message, kind: 'err', dot: true }]); });
      }
      function dec() {
        if (!pw.value) return MT.toast('Anna salasana', 'warn');
        var t = inEd.get().trim().replace(/^MT1:/, '');
        sb.set([{ k: 'TILA', v: 'puretaan…' }]);
        try {
          var raw = atob(t), all = new Uint8Array(raw.length);
          for (var i = 0; i < raw.length; i++) all[i] = raw.charCodeAt(i);
          if (all.length < 29) throw new Error('Sisältö on liian lyhyt');
          deriveKey(all.slice(0, 16)).then(function (key) {
            return crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(16, 28) }, key, all.slice(28));
          }).then(function (pt) {
            outEd.set(new TextDecoder().decode(pt));
            sb.set([{ k: '', v: 'PURETTU', kind: 'ok', dot: true }]);
          }).catch(function () {
            sb.set([{ k: '', v: 'PURKU EPÄONNISTUI — VÄÄRÄ SALASANA TAI VIOITTUNUT SISÄLTÖ', kind: 'err', dot: true }]);
          });
        } catch (e) { sb.set([{ k: '', v: 'VIRHE: sisältö ei ole kelvollista Base64:ää', kind: 'err', dot: true }]); }
      }
      root.appendChild(c.panel('SALASANA', 'i-key', h('div.panel-body', null, [
        h('div.fields', null, h('div.field', null, [h('label', { text: 'Salasana (sama salaukseen ja purkuun)' }), pw])),
        h('div.btn-row', { style: { marginTop: '11px' } }, [
          c.btn('Salaa', { cls: 'btn-pri', icon: 'i-shield', on: enc }),
          c.btn('Pura', { icon: 'i-key', on: dec }),
          c.btn('Kopioi tulos', { icon: 'i-copy', on: function () { MT.copy(outEd.get()); } }),
          c.btn('Siirrä tulos syötteeksi', { icon: 'i-refresh', on: function () { inEd.set(outEd.get()); } })
        ])
      ])));
      root.appendChild(h('div', { style: { marginTop: '13px' } }, c.split(inEd.el, outEd.el)));
      root.appendChild(sb);
      root.appendChild(h('div', { style: { marginTop: '11px' } },
        c.note('Salaus käyttää selaimen WebCrypto-rajapintaa: avain johdetaan salasanasta PBKDF2:lla (250 000 kierrosta, SHA-256) ja teksti salataan AES-256-GCM:llä. Satunnainen suola ja alustusvektori tallennetaan tulokseen. <b>Salasanaa ei voi palauttaa</b> — jos unohdat sen, sisältö on lopullisesti menetetty.', 'warn')));
      outEd.placeholder('Salattu tai purettu tulos näkyy tässä.');
    }
  });
})();
