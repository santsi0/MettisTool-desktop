/* Tiivistefunktiot: MD5 ja CRC32 omana toteutuksena, SHA-perhe WebCryptolla. */
var HASH = (function () {
  'use strict';

  function toBytes(x) {
    if (x instanceof Uint8Array) return x;
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    return new TextEncoder().encode(String(x));
  }
  function hex(buf) {
    var b = toBytes(buf), s = '';
    for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return s;
  }
  function b64(buf) {
    var b = toBytes(buf), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }

  /* ---- MD5 (RFC 1321) ---- */
  var MD5_S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  var MD5_K = new Int32Array(64);
  for (var i = 0; i < 64; i++) MD5_K[i] = (Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)) | 0;

  function md5(input) {
    var msg = toBytes(input), len = msg.length;
    var withOne = new Uint8Array((((len + 8) >> 6) + 1) * 64);
    withOne.set(msg); withOne[len] = 0x80;
    var bitLen = len * 8;
    var dv = new DataView(withOne.buffer);
    dv.setUint32(withOne.length - 8, bitLen >>> 0, true);
    dv.setUint32(withOne.length - 4, Math.floor(bitLen / 4294967296), true);

    var a0 = 0x67452301 | 0, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476 | 0;
    var M = new Int32Array(16);
    for (var off = 0; off < withOne.length; off += 64) {
      for (var j = 0; j < 16; j++) M[j] = dv.getInt32(off + j * 4, true);
      var A = a0, B = b0, C = c0, D = d0;
      for (var k = 0; k < 64; k++) {
        var F, g;
        if (k < 16) { F = (B & C) | (~B & D); g = k; }
        else if (k < 32) { F = (D & B) | (~D & C); g = (5 * k + 1) % 16; }
        else if (k < 48) { F = B ^ C ^ D; g = (3 * k + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * k) % 16; }
        F = (F + A + MD5_K[k] + M[g]) | 0;
        A = D; D = C; C = B;
        B = (B + ((F << MD5_S[k]) | (F >>> (32 - MD5_S[k])))) | 0;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    var out = new Uint8Array(16), o = new DataView(out.buffer);
    o.setInt32(0, a0, true); o.setInt32(4, b0, true); o.setInt32(8, c0, true); o.setInt32(12, d0, true);
    return out;
  }

  /* ---- CRC32 ---- */
  var CRC_T = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(input) {
    var b = toBytes(input), c = 0xFFFFFFFF;
    for (var i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ---- SHA WebCryptolla ---- */
  var SHA = { 'SHA-1': 'SHA-1', 'SHA-256': 'SHA-256', 'SHA-384': 'SHA-384', 'SHA-512': 'SHA-512' };
  function digest(algo, input) {
    if (algo === 'MD5') return Promise.resolve(md5(input));
    if (!SHA[algo]) return Promise.reject(new Error('Tuntematon algoritmi: ' + algo));
    if (!(crypto && crypto.subtle)) return Promise.reject(new Error('Selain ei tue WebCryptoa tässä yhteydessä (vaatii HTTPS:n tai paikallisen tiedoston)'));
    return crypto.subtle.digest(algo, toBytes(input)).then(function (b) { return new Uint8Array(b); });
  }
  function hmac(algo, key, input) {
    if (!SHA[algo]) return Promise.reject(new Error('HMAC tukee vain SHA-algoritmeja'));
    return crypto.subtle.importKey('raw', toBytes(key), { name: 'HMAC', hash: algo }, false, ['sign'])
      .then(function (k) { return crypto.subtle.sign('HMAC', k, toBytes(input)); })
      .then(function (b) { return new Uint8Array(b); });
  }

  return { md5: md5, crc32: crc32, digest: digest, hmac: hmac, hex: hex, b64: b64, toBytes: toBytes };
})();
