/* Kevyt QR-koodigeneraattori (ISO/IEC 18004, tavutila, versiot 1–40). Ei riippuvuuksia. */
var QR = (function () {
  'use strict';

  var ECC_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  ];
  var NUM_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 5, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  ];
  var LEVELS = { L: 0, M: 1, Q: 2, H: 3 }, FMT = [1, 0, 3, 2];

  var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    for (var x = 1, i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
    for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  function gmul(a, b) { return (a && b) ? EXP[LOG[a] + LOG[b]] : 0; }

  function rsGen(deg) {
    var poly = [1];
    for (var i = 0; i < deg; i++) {
      var next = new Array(poly.length + 1);
      for (var k = 0; k < next.length; k++) next[k] = 0;
      for (var j = 0; j < poly.length; j++) { next[j] ^= poly[j]; next[j + 1] ^= gmul(poly[j], EXP[i]); }
      poly = next;
    }
    return poly;
  }
  function rsEnc(data, ecLen) {
    var gen = rsGen(ecLen), res = new Uint8Array(data.length + ecLen);
    res.set(data);
    for (var i = 0; i < data.length; i++) {
      var f = res[i]; if (!f) continue;
      for (var j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], f);
    }
    return res.subarray(data.length);
  }

  function rawModules(v) {
    var r = (16 * v + 128) * v + 64;
    if (v >= 2) { var a = Math.floor(v / 7) + 2; r -= (25 * a - 10) * a - 55; if (v >= 7) r -= 36; }
    return r;
  }
  function dataCodewords(v, ecl) {
    return Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[ecl][v] * NUM_BLOCKS[ecl][v];
  }
  function alignPos(v) {
    if (v === 1) return [];
    var n = Math.floor(v / 7) + 2, step = (v === 32) ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
    var res = [6];
    for (var pos = v * 4 + 10; res.length < n; pos -= step) res.splice(1, 0, pos);
    res.sort(function (a, b) { return a - b; });
    return res;
  }
  function utf8(s) {
    var out = [], i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | c >> 6, 0x80 | c & 63);
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
        var c2 = s.charCodeAt(++i), cp = 0x10000 + ((c & 0x3FF) << 10) + (c2 & 0x3FF);
        out.push(0xF0 | cp >> 18, 0x80 | cp >> 12 & 63, 0x80 | cp >> 6 & 63, 0x80 | cp & 63);
      } else out.push(0xE0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    }
    return out;
  }

  function encode(text, eclName, minVer) {
    var ecl = LEVELS[(eclName || 'M').toUpperCase()];
    if (ecl == null) ecl = 1;
    var bytes = utf8(String(text));
    var ver = Math.max(1, minVer || 1), cap;
    for (; ver <= 40; ver++) {
      cap = dataCodewords(ver, ecl) * 8;
      if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= cap) break;
    }
    if (ver > 40) throw new Error('Sisältö on liian pitkä QR-koodiksi (max ~2900 tavua)');

    /* bitit */
    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16);
    for (var i = 0; i < bytes.length; i++) put(bytes[i], 8);
    var total = dataCodewords(ver, ecl) * 8;
    put(0, Math.min(4, total - bits.length));
    while (bits.length % 8) bits.push(0);
    for (var pad = 0xEC; bits.length < total; pad ^= 0xEC ^ 0x11) put(pad, 8);

    var dat = new Uint8Array(bits.length / 8);
    for (i = 0; i < bits.length; i++) dat[i >>> 3] |= bits[i] << (7 - (i & 7));

    /* lohkot + virheenkorjaus */
    var nb = NUM_BLOCKS[ecl][ver], ecLen = ECC_PER_BLOCK[ecl][ver];
    var totalCw = Math.floor(rawModules(ver) / 8);
    var shortLen = Math.floor(totalCw / nb) - ecLen, numLong = totalCw % nb;
    var blocks = [], eccs = [], off = 0;
    for (i = 0; i < nb; i++) {
      var len = shortLen + (i >= nb - numLong ? 1 : 0);
      var b = dat.subarray(off, off + len); off += len;
      blocks.push(b); eccs.push(rsEnc(b, ecLen));
    }
    var out = new Uint8Array(totalCw), p = 0;
    for (i = 0; i < shortLen + 1; i++) for (var j = 0; j < nb; j++) if (i < blocks[j].length) out[p++] = blocks[j][i];
    for (i = 0; i < ecLen; i++) for (j = 0; j < nb; j++) out[p++] = eccs[j][i];

    /* matriisi */
    var size = ver * 4 + 17, mod = [], fn = [];
    for (i = 0; i < size; i++) { mod.push(new Uint8Array(size)); fn.push(new Uint8Array(size)); }
    function setFn(x, y, v) { if (x >= 0 && y >= 0 && x < size && y < size) { mod[y][x] = v ? 1 : 0; fn[y][x] = 1; } }
    function finder(x, y) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(x + dx, y + dy, d !== 2 && d !== 4);
      }
    }
    for (i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var ap = alignPos(ver);
    for (i = 0; i < ap.length; i++) for (j = 0; j < ap.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) continue;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++)
        setFn(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    if (ver >= 7) {
      var rem = ver;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vbits = (ver << 12) | rem;
      for (i = 0; i < 18; i++) {
        var bit = (vbits >>> i) & 1, a = size - 11 + i % 3, b = Math.floor(i / 3);
        setFn(a, b, bit); setFn(b, a, bit);
      }
    }
    function fmtBits(mask) {
      var d = (FMT[ecl] << 3) | mask, r = d;
      for (var k = 0; k < 10; k++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      var bs = ((d << 10) | r) ^ 0x5412;
      function g(k) { return (bs >>> k) & 1; }
      for (k = 0; k <= 5; k++) setFn(8, k, g(k));
      setFn(8, 7, g(6)); setFn(8, 8, g(7)); setFn(7, 8, g(8));
      for (k = 9; k < 15; k++) setFn(14 - k, 8, g(k));
      for (k = 0; k < 8; k++) setFn(size - 1 - k, 8, g(k));
      for (k = 8; k < 15; k++) setFn(8, size - 15 + k, g(k));
      setFn(8, size - 8, 1);
    }
    fmtBits(0);

    /* datan sijoitus */
    var bi = 0, len8 = out.length * 8;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (j = 0; j < 2; j++) {
          var x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
          if (!fn[y][x] && bi < len8) { mod[y][x] = (out[bi >>> 3] >>> (7 - (bi & 7))) & 1; bi++; }
        }
      }
    }

    function maskFn(m, x, y) {
      switch (m) {
        case 0: return (x + y) % 2 === 0;
        case 1: return y % 2 === 0;
        case 2: return x % 3 === 0;
        case 3: return (x + y) % 3 === 0;
        case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
        case 5: return (x * y) % 2 + (x * y) % 3 === 0;
        case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
        default: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
      }
    }
    function applyMask(m) {
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++)
        if (!fn[y][x] && maskFn(m, x, y)) mod[y][x] ^= 1;
    }
    function penalty() {
      var s = 0, x, y, run, cur, dark = 0;
      for (y = 0; y < size; y++) {
        run = 1; cur = mod[y][0];
        for (x = 1; x < size; x++) {
          if (mod[y][x] === cur) { run++; if (run === 5) s += 3; else if (run > 5) s++; }
          else { cur = mod[y][x]; run = 1; }
        }
      }
      for (x = 0; x < size; x++) {
        run = 1; cur = mod[0][x];
        for (y = 1; y < size; y++) {
          if (mod[y][x] === cur) { run++; if (run === 5) s += 3; else if (run > 5) s++; }
          else { cur = mod[y][x]; run = 1; }
        }
      }
      for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) {
        var c = mod[y][x];
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) s += 3;
      }
      var pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
      function match(get, n) {
        var cnt = 0;
        for (var i = 0; i + 11 <= n; i++) {
          var a = true, b = true;
          for (var k = 0; k < 11; k++) { var v = get(i + k); if (v !== pat1[k]) a = false; if (v !== pat2[k]) b = false; }
          if (a || b) cnt++;
        }
        return cnt;
      }
      for (y = 0; y < size; y++) s += 40 * match(function (i) { return mod[y][i]; }, size);
      for (x = 0; x < size; x++) s += 40 * match(function (i) { return mod[i][x]; }, size);
      for (y = 0; y < size; y++) for (x = 0; x < size; x++) dark += mod[y][x];
      s += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
      return s;
    }

    var best = 0, bestScore = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m); fmtBits(m);
      var sc = penalty();
      if (sc < bestScore) { bestScore = sc; best = m; }
      applyMask(m);
    }
    applyMask(best); fmtBits(best);

    return {
      size: size, version: ver, level: (eclName || 'M').toUpperCase(), mask: best,
      get: function (x, y) { return !!mod[y][x]; },
      modules: mod
    };
  }

  /* SVG-tuloste */
  function svg(qr, opt) {
    opt = opt || {};
    var q = opt.quiet == null ? 4 : opt.quiet, s = qr.size + q * 2, d = '';
    for (var y = 0; y < qr.size; y++) for (var x = 0; x < qr.size; x++)
      if (qr.get(x, y)) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + ' ' + s + '" shape-rendering="crispEdges">' +
      '<rect width="' + s + '" height="' + s + '" fill="' + (opt.bg || '#ffffff') + '"/>' +
      '<path d="' + d + '" fill="' + (opt.fg || '#000000') + '"/></svg>';
  }

  /* Canvas-tuloste */
  function draw(qr, canvas, opt) {
    opt = opt || {};
    var q = opt.quiet == null ? 4 : opt.quiet, scale = opt.scale || 8, s = (qr.size + q * 2) * scale;
    canvas.width = s; canvas.height = s;
    var c = canvas.getContext('2d');
    c.fillStyle = opt.bg || '#ffffff'; c.fillRect(0, 0, s, s);
    c.fillStyle = opt.fg || '#000000';
    for (var y = 0; y < qr.size; y++) for (var x = 0; x < qr.size; x++)
      if (qr.get(x, y)) c.fillRect((x + q) * scale, (y + q) * scale, scale, scale);
    return canvas;
  }

  return { encode: encode, svg: svg, draw: draw };
})();
