/* why1: DRAWING THE REASONS (why.js decides what and where; this draws it).
 *
 *   KMWhyView.svg(plan)            -> SVG markup for the page's <g id="why">, in
 *                                     screen metres (the pitch's own SVG units)
 *   KMWhyView.chipsHTML(plan, esc) -> the pills for reasons with no place on the pitch
 *   KMWhyView.oddsAfter(o, band, pct, tone, icon) -> the chance the card would have
 *                                     shown, for "You had a 58% chance of this"
 *
 * Every mark carries data-key (the reason it draws) and data-men (the men it
 * is anchored to), so whycheck.js can read the page back. */
(function (root) {
  'use strict';
  function f1(v) { return (Math.round(v * 100) / 100).toString(); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  var T = { row: false, show: false };
  /* ?whybreak=<name> in the page: the same switches, for whycheck.js's page part */
  try { var mb = /[?&]whybreak=([a-zA-Z]+)/.exec((root.location && root.location.search) || ''); if (mb && mb[1] in T) T[mb[1]] = true; } catch (e) { }
  var TONE = { g: 'var(--why-g)', r: 'var(--why-r)', n: 'var(--why-n)' };
  var GLYPH = { star: '★', card: '▮', form: '●', seen: '◎', down: '↓', behind: '↶', run: '»', rule: '!', tired: 'z' };

  function arrow(a, b, stop, col, w, dash) {
    var dx = b.x - a.x, dy = b.y - a.y, l = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / l, uy = dy / l;
    var ex = b.x - ux * stop, ey = b.y - uy * stop, ah = 1.05;
    return '<line x1="' + f1(a.x) + '" y1="' + f1(a.y) + '" x2="' + f1(ex) + '" y2="' + f1(ey) + '" stroke="' + col + '" stroke-width="' + w + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>' +
      '<path d="M' + f1(ex - ux * ah - uy * ah * 0.7) + ' ' + f1(ey - uy * ah + ux * ah * 0.7) + 'L' + f1(ex) + ' ' + f1(ey) + 'L' + f1(ex - ux * ah + uy * ah * 0.7) + ' ' + f1(ey - uy * ah - ux * ah * 0.7) +
      '" fill="none" stroke="' + col + '" stroke-width="' + w + '" stroke-linejoin="round"/>';
  }
  function ring(p, r, col, w, dash, fill) {
    return '<circle cx="' + f1(p.x) + '" cy="' + f1(p.y) + '" r="' + f1(r) + '" fill="' + (fill || 'none') + '" stroke="' + col + '" stroke-width="' + w + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
  }
  function poly(pts, col, w, dash) {
    return '<polyline points="' + pts.map(function (q) { return f1(q.x) + ',' + f1(q.y); }).join(' ') + '" fill="none" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
  }

  function shapeSVG(it) {
    var s = it.shape, col = TONE[it.tone] || TONE.n, h = '';
    switch (s.type) {
      case 'duel':
        h += '<line x1="' + f1(s.a.x) + '" y1="' + f1(s.a.y) + '" x2="' + f1(s.b.x) + '" y2="' + f1(s.b.y) + '" stroke="var(--why-n)" stroke-width=".28" opacity=".9"/>';
        h += ring(s.a, 1.75, 'var(--why-n)', 0.22) + ring(s.b, 1.75, 'var(--why-n)', 0.22);
        if (it.tired) h += '<text class="wgly" x="' + f1(s.a.x - 2.3) + '" y="' + f1(s.a.y - 1.6) + '">z</text>';
        break;
      case 'area':
        h += '<circle class="warea" cx="' + f1(s.c.x) + '" cy="' + f1(s.c.y) + '" r="' + f1(s.r) + '" fill="' + col + '" fill-opacity=".16" stroke="' + col + '" stroke-width=".28" stroke-dasharray="1 .7"/>';
        break;
      case 'ghost':
        h += '<circle cx="' + f1(s.g.x) + '" cy="' + f1(s.g.y) + '" r="1.7" fill="' + col + '" fill-opacity=".22" stroke="' + col + '" stroke-width=".42" stroke-dasharray=".7 .45"/>' + arrow(s.g, s.to, 1.9, col, 0.42) + ring(s.to, 1.9, col, 0.3);
        break;
      case 'hline':
        h += '<line x1="' + f1(s.x0) + '" y1="' + f1(s.y) + '" x2="' + f1(s.x1) + '" y2="' + f1(s.y) + '" stroke="' + col + '" stroke-width=".3" stroke-dasharray="1.4 .8"/>';
        h += ring(s.man, 1.9, col, 0.3) + ring(s.def, 1.7, col, 0.22, '.5 .4');
        break;
      case 'measure':
        h += '<line x1="' + f1(s.a.x) + '" y1="' + f1(s.a.y) + '" x2="' + f1(s.b.x) + '" y2="' + f1(s.b.y) + '" stroke="' + col + '" stroke-width=".3" stroke-dasharray=".9 .6"/>';
        h += ring(s.b, 0.5, col, 0.3);
        break;
      case 'wedge':
        h += '<path d="M' + f1(s.a.x) + ' ' + f1(s.a.y) + 'L' + f1(s.p1.x) + ' ' + f1(s.p1.y) + 'L' + f1(s.p2.x) + ' ' + f1(s.p2.y) + 'Z" fill="' + col + '" fill-opacity=".18" stroke="' + col + '" stroke-width=".22"/>';
        break;
      case 'pair':
        s.from.forEach(function (q) { h += '<line x1="' + f1(q.x) + '" y1="' + f1(q.y) + '" x2="' + f1(s.t.x) + '" y2="' + f1(s.t.y) + '" stroke="' + col + '" stroke-width=".32"/>'; h += ring(q, 1.7, col, 0.22); });
        h += ring(s.t, 1.9, col, 0.32);
        break;
      case 'guard':
        h += '<line x1="' + f1(s.a.x) + '" y1="' + f1(s.a.y) + '" x2="' + f1(s.g.x) + '" y2="' + f1(s.g.y) + '" stroke="' + col + '" stroke-width=".3" stroke-dasharray=".9 .6"/>';
        h += ring(s.d, 1.9, col, 0.32);
        break;
      case 'wall':
        h += poly(s.pts, col, 0.6) + s.pts.map(function (q) { return ring(q, 1.7, col, 0.22); }).join('');
        break;
      case 'rings':
        h += s.pts.map(function (q) { return ring(q, 1.8, col, 0.26, '.6 .4'); }).join('');
        break;
      case 'line':
        h += poly(s.pts, col, 0.34, '1.2 .7');
        break;
      case 'chase':
        s.from.forEach(function (q) {
          var t = { x: q.x + (s.to.x - q.x) * 0.55, y: q.y + (s.to.y - q.y) * 0.55 };
          h += arrow(q, t, 0, col, 0.3, '.8 .5');
        });
        h += ring(s.to, 1.9, col, 0.3);
        break;
      case 'pass':
        h += arrow(s.a, s.b, 1.9, col, 0.32, '1 .6') + ring(s.b, 1.75, col, 0.22, '.5 .4');
        break;
      case 'badge':
        h += ring(s.at, 1.95, col, 0.34);
        break;
    }
    return h;
  }
  function labelSVG(t, it, k) {
    var col = TONE[it.tone] || TONE.n;
    var lead = '';
    var ex = Math.max(t.x, Math.min(t.cx, t.x + t.w)), ey = Math.max(t.y, Math.min(t.cy, t.y + t.h));
    var ld = Math.hypot(ex - t.cx, ey - t.cy), r0 = t.r0 || 0;
    if (ld > 2.6) {
      /* from the edge of what it names (a man's ring, a line's middle) to the label */
      var st0 = r0 >= 1.8 ? Math.min(1.9, ld - 0.5) : 0, sx = t.cx + (ex - t.cx) / ld * st0, sy = t.cy + (ey - t.cy) / ld * st0;
      lead = '<line class="wlead" x1="' + f1(sx) + '" y1="' + f1(sy) + '" x2="' + f1(ex) + '" y2="' + f1(ey) + '" stroke="' + col + '"/>' +
        (r0 < 1.8 ? '<circle class="wdot" cx="' + f1(t.cx) + '" cy="' + f1(t.cy) + '" r=".45" fill="' + col + '"/>' : '');
    }
    var txt = String(t.text);
    var num = /^([+−]\d+) (.*)$/.exec(txt);
    var body = num ? '<tspan class="wn" fill="' + col + '">' + esc(num[1]) + '</tspan> ' + esc(num[2]) : esc(txt);
    return lead + '<g class="wlab" data-k="' + k + '"><rect x="' + f1(t.x) + '" y="' + f1(t.y) + '" width="' + f1(t.w) + '" height="' + f1(t.h) + '" rx="' + f1(t.h / 2) +
      '" stroke="' + col + '"/><text x="' + f1(t.x + t.w / 2) + '" y="' + f1(t.y + t.h / 2) + '" text-anchor="middle" dominant-baseline="central" style="font-size:' + f1(t.h / 1.45) + 'px">' + body + '</text></g>';
  }
  function svg(plan) {
    if (!plan || !plan.items || !plan.items.length) return '';
    var shapes = '', labs = '';
    plan.items.forEach(function (it, i) {
      shapes += '<g class="wshape" data-key="' + esc(it.key) + '" data-kind="' + esc(it.kind) + '" data-men="' + esc((it.men || []).join(',')) + '">' + shapeSVG(it) + '</g>';
      (it.labels || []).forEach(function (t, j) { labs += labelSVG(t, it, i + '.' + j); });
    });
    return '<g class="win" data-n="' + plan.items.length + '">' + shapes + labs + '</g>';
  }
  function chipsHTML(plan) {
    if (!plan || !plan.chip || !plan.chip.lines.length) return '';
    return '<span class="wchl">Also counts:</span>' + plan.chip.lines.map(function (t, i) {
      var num = /^([+−]\d+) (.*)$/.exec(t);
      return '<span class="wchip ' + (plan.chip.tones[i] || 'n') + '" data-key="' + esc(plan.chip.keys[i]) + '">' + (num ? '<b>' + esc(num[1]) + '</b> ' + esc(num[2]) : esc(t)) + '</span>';
    }).join('');
  }
  /* the card's own whole percents (the lean card's rows: results that read
   * the same are one row), and which row the dice picked */
  function oddsAfter(o, band, rowsFn) {
    var rows = rowsFn(o);
    var hit = -1;
    (o.outcomes || []).forEach(function (x) {
      var bands = x.bands || [x.band];
      if (bands.indexOf(band) < 0) return;
      /* m6: col1's lean rows key on the display kind (kind|short), not the engine icon: match the row by its icon and its line */
      var line = x.short || x.text;
      rows.forEach(function (r, i) { if (r.icon === x.icon && String(r.key).slice(String(r.key).indexOf('|') + 1) === line) hit = i; });
    });
    if (T.row && hit >= 0) hit = (hit + 1) % rows.length;
    return { rows: rows, hit: hit, pct: hit >= 0 ? rows[hit].pct : null };
  }
  var API = { tamper: T, svg: svg, chipsHTML: chipsHTML, oddsAfter: oddsAfter, GLYPH: GLYPH };
  root.KMWhyView = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
