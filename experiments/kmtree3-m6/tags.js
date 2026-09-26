/* lay1: NAME TAGS THAT NEVER SIT ON A DOT.
 *
 * At a frozen moment the page names the man on the ball, the man next to
 * him, and every other man the commentator's text names. Each tag is a box
 * beside its man; this module picks where, so that no tag covers another
 * man's dot, the ball, or another tag, and no tag leaves the pitch.
 *
 * Candidates, in order of preference: right, left, above, below, then the
 * four diagonals, first touching the dot, then further out in five steps,
 * with sixteen angles round the man at each (a thin line then joins the tag
 * to its man). Each candidate is scored: a dot covered costs
 * 100, another tag 200, the ball 50, leaving the pitch 1000; the cheapest
 * wins. Pure: no DOM, no randomness, so node checks it (laycheck.js) and the
 * page draws what it returns.
 *
 *   KMTags.place({
 *     dots: [{ id, x, y }],          screen metres: x right, y DOWN (105 - pitch y)
 *     want: [{ id, text }],          in priority order (the man on the ball first)
 *     r: 1.6,                         a dot's radius, metres
 *     fs: 1.5,                        font size, metres
 *     width: function (text) {},      optional: the text's real width in metres
 *     bounds: { x0, y0, x1, y1 },     where a tag may go
 *     ball: { x, y } | null,          screen metres
 *     lift: { id: dy }                optional: a dot drawn higher than its spot (the lifted piece; both are kept clear)
 *   }) -> [{ id, text, x, y, w, h, cx, cy, lead, cost }]   (x, y: the box's top left)
 *
 *   KMTags.hits(tags, dots, r, ball) -> { dot: n, tag: n, ball: n }   what the tags cover (for the checks)
 *
 * m4: the same placement for the hover preview's labels (an icon and a
 * chance at the end of each arrow). A want may carry its own anchor and box
 * instead of a man: { id, text, at: {x, y}, w, h, r0, pref: {x, y} } (r0:
 * the anchor's radius, pref: the box's top left where the label would go
 * with nothing in the way, tried first). o.avoid: boxes already on the
 * pitch (the name tags) that a label may not cover.
 */
(function (root) {
  'use strict';
  function boxCircle(b, cx, cy, rr) {
    var nx = Math.max(b.x, Math.min(cx, b.x + b.w)), ny = Math.max(b.y, Math.min(cy, b.y + b.h));
    var dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < rr * rr;
  }
  function boxBox(a, b, m) {
    return a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
  }
  var DIRS = [['E', 0], ['W', 0.4], ['N', 0.8], ['S', 1.2], ['NE', 1.6], ['NW', 1.8], ['SE', 2.0], ['SW', 2.2]];
  function spot(dir, cx, cy, r, d, w, h) {
    var k = 0.72;
    switch (dir) {
      case 'E': return { x: cx + r + d, y: cy - h / 2 };
      case 'W': return { x: cx - r - d - w, y: cy - h / 2 };
      case 'N': return { x: cx - w / 2, y: cy - r - d - h };
      case 'S': return { x: cx - w / 2, y: cy + r + d };
      case 'NE': return { x: cx + (r + d) * k, y: cy - (r + d) * k - h };
      case 'NW': return { x: cx - (r + d) * k - w, y: cy - (r + d) * k - h };
      case 'SE': return { x: cx + (r + d) * k, y: cy + (r + d) * k };
      default: return { x: cx - (r + d) * k - w, y: cy + (r + d) * k };
    }
  }
  function place(o) {
    var r0 = o.r || 1.6, fs = o.fs || 1.5, pad = fs * 0.45, h0 = fs * 1.5, r = r0;
    var W = o.width || function (t) { return String(t).length * fs * 0.6; };
    var B = o.bounds || { x0: -2, y0: -4, x1: 70, y1: 109 };
    var lift = o.lift || {};
    var dots = (o.dots || []).map(function (d) { return { id: d.id, x: d.x, y: d.y }; });
    var byId = {}; dots.forEach(function (d) { byId[d.id] = d; });
    /* a lifted piece covers its spot and the place it is drawn, both */
    (o.dots || []).forEach(function (d) { if (lift[d.id]) dots.push({ id: d.id + '~lift', x: d.x, y: d.y - lift[d.id] }); });
    var rr = r * 1.08, placed = (o.avoid || []).map(function (b) { return { x: b.x, y: b.y, w: b.w, h: b.h }; }), out = [];   // m4: avoid
    /* m4: two more rings further out (a crowded box on a small board left the
     * fourth name nowhere clear within 9 radii) */
    var rings = [r * 0.35, r * 1.4, r * 2.8, r * 4.4, r * 6.4, r * 9, r * 12, r * 16];
    /* m6: and rings in between, tried after the others at the same cost, so a
     * crowd close to the board's edge (a zoomed replay) still finds a gap
     * before a label is put on a man (replaycheck E5, 2 of 1,714 pills) */
    if (o.fine) rings = rings.concat([r * 0.9, r * 2.1, r * 3.6, r * 5.4, r * 7.7]);
    (o.want || []).forEach(function (t) {
      var me = t.at ? { x: t.at.x, y: t.at.y } : byId[t.id];   // m4: a label with its own anchor
      if (!me || !t.text) return;
      var w = t.w || W(t.text) + 2 * pad, best = null, h = t.h || h0, r = t.at ? (t.r0 || r0) : r0;
      /* the eight named sides, then (further out) sixteen angles round the man */
      var cands = [];
      if (t.pref) cands.push({ x: t.pref.x, y: t.pref.y, base: -1, ri: 0, dir: 'pref' });   // m4
      rings.forEach(function (d, ri) {
        var na = ri > 5 ? 24 : o.fine ? 32 : 16;
        DIRS.forEach(function (dd) { var p = spot(dd[0], me.x, me.y, r, d, w, h); cands.push({ x: p.x, y: p.y, base: ri * 6 + dd[1], ri: ri, dir: dd[0] }); });
        if (ri > 0) for (var a = 0; a < na; a++) {
          var th = a * 2 * Math.PI / na, ux = Math.cos(th), uy = Math.sin(th);
          cands.push({ x: me.x + ux * (r + d + w / 2) - w / 2, y: me.y + uy * (r + d + h / 2) - h / 2, base: ri * 6 + 2.5, ri: ri, dir: 'a' + a });
        }
      });
      cands.forEach(function (c) {
        (function (d, ri, dd) {
          var p = c, b = { x: p.x, y: p.y, w: w, h: h };
          var cost = c.base;
          if (b.x < B.x0 || b.x + w > B.x1 || b.y < B.y0 || b.y + h > B.y1) cost += 1000;
          for (var i = 0; i < dots.length; i++) if (boxCircle(b, dots[i].x, dots[i].y, rr)) cost += 100;
          if (o.ball && boxCircle(b, o.ball.x, o.ball.y, r0 * 0.7)) cost += 50;
          for (var j = 0; j < placed.length; j++) if (boxBox(b, placed[j], fs * 0.2)) cost += 200;
          if (!best || cost < best.cost) best = { id: t.id, text: t.text, x: b.x, y: b.y, w: w, h: h, cx: me.x, cy: me.y, lead: ri > 1, cost: cost, dir: dd };
        })(0, c.ri, c.dir);
      });
      if (best) { placed.push(best); out.push(best); }
    });
    return out;
  }
  function hits(tags, dots, r, ball) {
    var n = { dot: 0, tag: 0, ball: 0 }, rr = r;
    tags.forEach(function (t, i) {
      dots.forEach(function (d) { if (boxCircle(t, d.x, d.y, rr)) n.dot++; });
      if (ball && boxCircle(t, ball.x, ball.y, r * 0.5)) n.ball++;
      for (var j = i + 1; j < tags.length; j++) if (boxBox(t, tags[j], 0)) n.tag++;
    });
    return n;
  }
  var API = { place: place, hits: hits };
  root.KMTags = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
