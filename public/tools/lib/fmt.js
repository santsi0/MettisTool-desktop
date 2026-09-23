/* Muunnin- ja muotoilukirjasto: YAML, CSV, XML, Markdown, HTML/CSS/JS/SQL-sisennys. Ei riippuvuuksia. */
var FMT = (function () {
  'use strict';

  /* ================= YAML ================= */
  function yScalar(s) {
    s = s.trim();
    if (!s) return '';
    if ((s[0] === '"' && s.slice(-1) === '"')) { try { return JSON.parse(s); } catch (e) { return s.slice(1, -1); } }
    if (s[0] === "'" && s.slice(-1) === "'") return s.slice(1, -1).replace(/''/g, "'");
    if (s[0] === '[' || s[0] === '{') { try { return JSON.parse(yFlowToJson(s)); } catch (e) { return s; } }
    if (/^(true|yes|on)$/i.test(s)) return true;
    if (/^(false|no|off)$/i.test(s)) return false;
    if (/^(null|~)$/i.test(s)) return null;
    if (/^[+-]?\d+$/.test(s)) return parseInt(s, 10);
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return parseFloat(s);
    return s;
  }
  function yFlowToJson(s) {
    return s.replace(/([{,[]\s*)([A-Za-z_][\w .-]*)(\s*:)/g, '$1"$2"$3')
      .replace(/:\s*([A-Za-z_][\w .@/-]*)\s*(?=[,}\]])/g, function (m, w) {
        return /^(true|false|null)$/i.test(w) ? ': ' + w.toLowerCase() : ': "' + w + '"';
      });
  }
  function stripComment(s) {
    var out = '', q = null;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) { out += c; if (c === q && s[i - 1] !== '\\') q = null; continue; }
      if (c === '"' || c === "'") { q = c; out += c; continue; }
      if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) break;
      out += c;
    }
    return out;
  }
  function yamlParse(src) {
    var raw = String(src).replace(/\r\n?/g, '\n').split('\n');
    var lines = [];
    raw.forEach(function (l) {
      if (/^---\s*$/.test(l) || /^\.\.\.\s*$/.test(l)) return;
      lines.push(l);
    });
    var i = 0;
    function cur() {
      while (i < lines.length && (!lines[i].trim() || /^\s*#/.test(lines[i]))) i++;
      return i < lines.length ? lines[i] : null;
    }
    function ind(l) { return /^ */.exec(l)[0].length; }
    function block(minInd, style) {
      var base = -1, buf = [];
      while (i < lines.length) {
        var l = lines[i];
        if (l.trim() && ind(l) <= minInd) break;
        if (base < 0 && l.trim()) base = ind(l);
        buf.push(l.trim() ? l.slice(base) : ''); i++;
      }
      while (buf.length && !buf[buf.length - 1]) buf.pop();
      return style === '>' ? buf.join(' ').replace(/\s+/g, ' ').trim() : buf.join('\n');
    }
    function node(minInd) {
      var l = cur();
      if (l == null) return null;
      var n = ind(l);
      if (n < minInd) return null;
      return /^-(\s|$)/.test(l.slice(n)) ? seq(n) : map(n);
    }
    function seq(at) {
      var arr = [];
      for (;;) {
        var l = cur();
        if (l == null || ind(l) !== at || !/^-(\s|$)/.test(l.slice(at))) break;
        var rest = stripComment(l.slice(at + 1)).trim();
        i++;
        if (!rest) { var sub = node(at + 1); arr.push(sub === null ? null : sub); continue; }
        if (/^[|>]/.test(rest)) { arr.push(block(at, rest[0])); continue; }
        if (/^[\w"'][^:]*:(\s|$)/.test(rest)) {
          // rivin sisäinen map: "- key: value"
          var pseudo = ' '.repeat(at + 2) + rest;
          lines.splice(i, 0, pseudo);
          arr.push(map(at + 2));
          continue;
        }
        arr.push(yScalar(rest));
      }
      return arr;
    }
    function map(at) {
      var obj = {};
      for (;;) {
        var l = cur();
        if (l == null || ind(l) !== at) break;
        var body = l.slice(at);
        if (/^-(\s|$)/.test(body)) break;
        var m = /^((?:"[^"]*")|(?:'[^']*')|(?:[^:#]+?))\s*:(.*)$/.exec(body);
        if (!m) break;
        var key = yScalar(m[1]), rest = stripComment(m[2]).trim();
        i++;
        if (!rest) {
          var sub = node(at + 1);
          obj[key] = sub === null ? null : sub;
        } else if (/^[|>]/.test(rest)) obj[key] = block(at, rest[0]);
        else obj[key] = yScalar(rest);
      }
      return obj;
    }
    var res = node(0);
    return res === null ? {} : res;
  }
  function yKey(k) { return /^[\w.\-/]+$/.test(k) ? k : JSON.stringify(k); }
  function yVal(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'boolean' || typeof v === 'number') return String(v);
    var s = String(v);
    if (s === '') return "''";
    if (s.indexOf('\n') >= 0) return null;
    if (/^[\s]|[\s]$|^[-?:,[\]{}#&*!|>'"%@`]|:\s|\s#/.test(s) || /^(true|false|null|yes|no|on|off|~)$/i.test(s) || /^[+-]?[\d.]+([eE][+-]?\d+)?$/.test(s)) return JSON.stringify(s);
    return s;
  }
  function yamlDump(v, level) {
    level = level || 0;
    var pad = '  '.repeat(level);
    if (v === null || v === undefined) return 'null';
    if (typeof v !== 'object') {
      var s = yVal(v);
      if (s === null) return '|\n' + String(v).split('\n').map(function (l) { return pad + '  ' + l; }).join('\n');
      return s;
    }
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      return v.map(function (x) {
        if (x && typeof x === 'object' && Object.keys(x).length) {
          var body = yamlDump(x, level + 1);
          return pad + '- ' + body.replace(/^\s+/, '').replace(/\n {2}/g, '\n' + pad + '  ');
        }
        return pad + '- ' + yamlDump(x, level + 1);
      }).join('\n');
    }
    var keys = Object.keys(v);
    if (!keys.length) return '{}';
    return keys.map(function (k) {
      var val = v[k];
      if (val && typeof val === 'object' && (Array.isArray(val) ? val.length : Object.keys(val).length)) {
        return pad + yKey(k) + ':\n' + yamlDump(val, level + 1);
      }
      return pad + yKey(k) + ': ' + yamlDump(val, level + 1);
    }).join('\n');
  }

  /* ================= CSV ================= */
  function csvDetect(text) {
    var line = text.split('\n')[0] || '', best = ',', n = -1;
    [',', ';', '\t', '|'].forEach(function (d) {
      var c = line.split(d).length;
      if (c > n) { n = c; best = d; }
    });
    return best;
  }
  function csvParse(text, delim) {
    text = String(text).replace(/\r\n?/g, '\n').replace(/\n$/, '');
    delim = delim || csvDetect(text);
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    row.push(cell); rows.push(row);
    return rows;
  }
  function csvCell(v, delim) {
    var s = v === null || v === undefined ? '' : String(v);
    if (typeof v === 'object') s = JSON.stringify(v);
    return /["\n\r]|^\s|\s$/.test(s) || s.indexOf(delim) >= 0 ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvStringify(rows, delim) {
    delim = delim || ',';
    return rows.map(function (r) { return r.map(function (c) { return csvCell(c, delim); }).join(delim); }).join('\n');
  }

  /* ================= XML ================= */
  function xmlEsc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]; });
  }
  function xmlName(k) { return String(k).replace(/[^\w.-]/g, '_').replace(/^[^A-Za-z_]/, '_'); }
  function json2xml(obj, root, indent) {
    indent = indent == null ? '  ' : indent;
    function node(name, val, lvl) {
      var pad = indent.repeat(lvl);
      if (Array.isArray(val)) return val.map(function (v) { return node(name, v, lvl); }).join('\n');
      if (val === null || val === undefined) return pad + '<' + name + '/>';
      if (typeof val !== 'object') return pad + '<' + name + '>' + xmlEsc(val) + '</' + name + '>';
      var attrs = '', kids = [];
      Object.keys(val).forEach(function (k) {
        if (k[0] === '@') attrs += ' ' + xmlName(k.slice(1)) + '="' + xmlEsc(val[k]) + '"';
        else if (k === '#text') kids.push(pad + indent + xmlEsc(val[k]));
        else kids.push(node(xmlName(k), val[k], lvl + 1));
      });
      if (!kids.length) return pad + '<' + name + attrs + '/>';
      return pad + '<' + name + attrs + '>\n' + kids.join('\n') + '\n' + pad + '</' + name + '>';
    }
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + node(xmlName(root || 'root'), obj, 0);
  }
  function xml2json(text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    var err = doc.querySelector('parsererror');
    if (err) throw new Error('XML-jäsennys epäonnistui: ' + err.textContent.split('\n')[0]);
    function walk(el) {
      var o = {}, kids = 0;
      for (var i = 0; i < el.attributes.length; i++) o['@' + el.attributes[i].name] = el.attributes[i].value;
      for (var n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 1) {
          kids++;
          var v = walk(n), k = n.nodeName;
          if (k in o) { if (!Array.isArray(o[k])) o[k] = [o[k]]; o[k].push(v); }
          else o[k] = v;
        } else if (n.nodeType === 3 && n.nodeValue.trim()) {
          o['#text'] = (o['#text'] || '') + n.nodeValue.trim();
        }
      }
      if (!kids && !el.attributes.length) return o['#text'] === undefined ? null : o['#text'];
      if (!kids && Object.keys(o).length === 1 && '#text' in o) return o['#text'];
      return o;
    }
    var res = {};
    res[doc.documentElement.nodeName] = walk(doc.documentElement);
    return res;
  }

  /* ================= Markdown ================= */
  function mdInline(s) {
    return s
      .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, '<img src="$2" alt="$1" title="$3">')
      .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, '<a href="$2" title="$3" rel="noopener noreferrer" target="_blank">$1</a>')
      .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>')
      .replace(/(\*|_)(?=\S)([\s\S]*?\S)\1/g, '<em>$2</em>')
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
      .replace(/(^|[^\\])`([^`]+)`/g, '$1<code>$2</code>');
  }
  function md2html(src) {
    var lines = String(src).replace(/\r\n?/g, '\n').split('\n'), out = [], i = 0;
    function esc(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
    while (i < lines.length) {
      var l = lines[i];
      if (/^```/.test(l)) {
        var lang = l.slice(3).trim(), buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push('<pre><code' + (lang ? ' class="language-' + lang + '"' : '') + '>' + esc(buf.join('\n')) + '</code></pre>');
        continue;
      }
      if (/^\s*$/.test(l)) { i++; continue; }
      var m;
      if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { out.push('<h' + m[1].length + '>' + mdInline(esc(m[2])) + '</h' + m[1].length + '>'); i++; continue; }
      if (/^\s*([-*_])\s*\1\s*\1[\s\S]*$/.test(l) && /^[\s\-*_]+$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
        var head = l.split('|').slice(1, -1).map(function (x) { return x.trim(); });
        i += 2; var body = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { body.push(lines[i].split('|').slice(1, -1).map(function (x) { return x.trim(); })); i++; }
        out.push('<table><thead><tr>' + head.map(function (x) { return '<th>' + mdInline(esc(x)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          body.map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + mdInline(esc(x)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>');
        continue;
      }
      if (/^\s*>/.test(l)) {
        var q = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push('<blockquote>' + md2html(q.join('\n')) + '</blockquote>');
        continue;
      }
      if (/^\s*([-*+]|\d+\.)\s+/.test(l)) {
        var ord = /^\s*\d+\./.test(l), items = [];
        while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '')); i++;
        }
        out.push('<' + (ord ? 'ol' : 'ul') + '>' + items.map(function (x) {
          var t = /^\[( |x)\]\s+/i.exec(x);
          if (t) return '<li><input type="checkbox" disabled' + (t[1].toLowerCase() === 'x' ? ' checked' : '') + '> ' + mdInline(esc(x.slice(t[0].length))) + '</li>';
          return '<li>' + mdInline(esc(x)) + '</li>';
        }).join('') + '</' + (ord ? 'ol' : 'ul') + '>');
        continue;
      }
      var para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|```|\s*>|\s*([-*+]|\d+\.)\s)/.test(lines[i])) para.push(lines[i++]);
      out.push('<p>' + mdInline(esc(para.join('\n'))).replace(/\n/g, '<br>') + '</p>');
    }
    return out.join('\n');
  }

  /* ================= koodin sisennys ================= */
  var VOID = 'area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr'.split(',');
  var INLINE = 'a,abbr,b,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,s,samp,small,span,strong,sub,sup,time,u,var'.split(',');
  function formatHTML(src, ind) {
    ind = ind || '  ';
    var tokens = String(src).replace(/\r\n?/g, '\n').match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) || [];
    var out = [], lvl = 0, raw = null;
    tokens.forEach(function (t) {
      if (raw) {
        if (new RegExp('^</' + raw, 'i').test(t)) { lvl = Math.max(0, lvl - 1); out.push(ind.repeat(lvl) + t.trim()); raw = null; }
        else { var body = t.replace(/\s+$/, ''); if (body.trim()) out.push(body.split('\n').map(function (x) { return ind.repeat(lvl + 1) + x.trim(); }).filter(function (x) { return x.trim(); }).join('\n')); }
        return;
      }
      if (/^<!--/.test(t)) { out.push(ind.repeat(lvl) + t.trim()); return; }
      if (/^<\//.test(t)) { lvl = Math.max(0, lvl - 1); out.push(ind.repeat(lvl) + t.trim()); return; }
      if (/^</.test(t)) {
        var name = (/^<\s*([\w:-]+)/.exec(t) || [, ''])[1].toLowerCase();
        out.push(ind.repeat(lvl) + t.trim());
        if (/^<[?!]/.test(t) || /\/>$/.test(t) || VOID.indexOf(name) >= 0) return;
        if (name === 'script' || name === 'style' || name === 'pre' || name === 'textarea') { raw = name; lvl++; return; }
        lvl++;
        return;
      }
      var txt = t.trim();
      if (txt) out.push(txt.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).map(function (x) { return ind.repeat(lvl) + x; }).join('\n'));
    });
    return out.join('\n');
  }
  function formatCSS(src, ind) {
    ind = ind || '  ';
    var s = String(src).replace(/\s+/g, ' ').replace(/\s*([{};:,])\s*/g, '$1').replace(/;}/g, '}');
    var out = '', lvl = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '{') { out += ' {\n'; lvl++; out += ind.repeat(lvl); }
      else if (c === '}') { lvl = Math.max(0, lvl - 1); out = out.replace(/[\s]*$/, '') + '\n' + ind.repeat(lvl) + '}\n' + ind.repeat(lvl); }
      else if (c === ';') { out += ';\n' + ind.repeat(lvl); }
      else if (c === ':' && lvl > 0) out += ': ';
      else if (c === ',' && lvl === 0) out += ',\n';
      else out += c;
    }
    return out.replace(/\n\s*\n+/g, '\n\n').replace(/[ \t]+$/gm, '').trim() + '\n';
  }
  function formatJS(src, ind) {
    ind = ind || '  ';
    var s = String(src), out = '', lvl = 0, i = 0, n = s.length;
    function last() { return out.replace(/\s+$/, '').slice(-1); }
    function nl() { out = out.replace(/[ \t]+$/, '') + '\n' + ind.repeat(Math.max(0, lvl)); }
    while (i < n) {
      var c = s[i];
      if (c === '/' && s[i + 1] === '/') { var e = s.indexOf('\n', i); e = e < 0 ? n : e; out += s.slice(i, e); nl(); i = e + 1; continue; }
      if (c === '/' && s[i + 1] === '*') { var e2 = s.indexOf('*/', i); e2 = e2 < 0 ? n : e2 + 2; out += s.slice(i, e2); nl(); i = e2; continue; }
      if (c === '"' || c === "'" || c === '`') {
        var q = c, j = i + 1;
        while (j < n && (s[j] !== q || s[j - 1] === '\\')) j++;
        out += s.slice(i, j + 1); i = j + 1; continue;
      }
      if (c === '{') { out += (/[\s({[]/.test(out.slice(-1)) || !out ? '' : ' ') + '{'; lvl++; nl(); i++; continue; }
      if (c === '}') { lvl--; nl(); out += '}'; i++; if (s[i] === ';') { out += ';'; i++; } if (!/^\s*(else|catch|finally|while|\)|,|\.|;)/.test(s.slice(i))) nl(); i = skipWs(i); continue; }
      if (c === ';') { out += ';'; i++; i = skipWs(i); if (i < n && s[i] !== '}') nl(); continue; }
      if (c === '\n' || c === '\r') { i++; continue; }
      if (c === ' ' || c === '\t') { if (last() && !/[\s({[]/.test(out.slice(-1))) out += ' '; i++; continue; }
      if (c === ',') { out += ', '; i++; i = skipWs(i); continue; }
      out += c; i++;
    }
    function skipWs(k) { while (k < n && /\s/.test(s[k])) k++; return k; }
    return out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  var SQL_MAIN = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'UNION ALL', 'UNION',
    'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'WITH', 'RETURNING'];
  var SQL_JOIN = ['LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN', 'INNER JOIN', 'CROSS JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'JOIN'];
  function formatSQL(src, ind) {
    ind = ind || '  ';
    var s = String(src).replace(/\s+/g, ' ').trim();
    SQL_MAIN.forEach(function (k) { s = s.replace(new RegExp('\\s*\\b' + k.replace(/ /g, '\\s+') + '\\b\\s*', 'gi'), '\n' + k + '\n' + ind); });
    SQL_JOIN.forEach(function (k) { s = s.replace(new RegExp('\\s*\\b' + k.replace(/ /g, '\\s+') + '\\b\\s*', 'gi'), '\n' + k + ' '); });
    s = s.replace(/\s*\b(ON|AND|OR)\b\s*/gi, '\n' + ind + '$1 ');
    s = s.replace(/,\s*/g, ',\n' + ind);
    s = s.replace(/\n\s*\n/g, '\n').replace(/[ \t]+$/gm, '');
    return s.split('\n').filter(function (l) { return l.trim(); }).join('\n').trim() + ';';
  }

  return {
    yamlParse: yamlParse, yamlDump: yamlDump,
    csvParse: csvParse, csvStringify: csvStringify, csvDetect: csvDetect,
    json2xml: json2xml, xml2json: xml2json, xmlEsc: xmlEsc,
    md2html: md2html,
    formatHTML: formatHTML, formatCSS: formatCSS, formatJS: formatJS, formatSQL: formatSQL
  };
})();
