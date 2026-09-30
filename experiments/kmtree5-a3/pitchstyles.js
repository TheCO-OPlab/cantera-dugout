/* m1: art1's renderers, adopted as the match page's pitch (Tabletop by
 * default, Broadcast in Settings). Changes from art1, all marked m1:
 *   - the man on the ball is ringed in white with a dark edge, not gold, so
 *     the ring is never the colour of a keeper's shirt or outline;
 *   - scene.label names the man on the ball at every moment of play, not
 *     only in a frozen moment, and scene.label2 = {id, text} names a second
 *     man (the one the scene names next to him); both tags go on the side of
 *     the token that covers the fewest other tokens (art1's tagX);
 *   - scene.goalEnd 'you' | 'them' lights the net the ball went into (art1
 *     lit only the top one);
 *   - the page passes kit objects, so the colours are the page's checked pair.
 *
 * art1/pitchstyles.js: four art directions for the vertical pitch, each a
 * canvas renderer that takes PITCH CONTRACT coordinates. Vanilla, no network.
 *
 *   var pitch = CanteraPitch.create(canvas, { style: 'tabletop', width: 400, theme: 'auto' });
 *   pitch.draw(scene);             // every frame
 *   pitch.setStyle('broadcast'); pitch.setTheme('dark'); pitch.resize(360);
 *   pitch.toScreen(x, y)           // metres -> CSS px on the canvas (for hit tests, tooltips)
 *
 * scene = {
 *   players: [{ id, side: 'you'|'them', name, num, keeper, kit: 'spain'|'argentina'|
 *               'spainGK'|'argentinaGK'|{primary, secondary, stripes, ink},
 *               x, y,                        // metres, contract coordinates
 *               state: 'carrier'|'actor'|'beaten'|null }],
 *   ball:    { x, y, z, spin, trail: [{x, y, z}] },     // z = height in metres
 *   freeze:  { amount 0..1, progress 0..1, ids: [player ids in the moment], focus: {x, y},
 *              label: 'Yamal', arrows: [{ kind: 'pass'|'shot'|'dribble', from: {x,y}, to: {x,y} }] },
 *   passes:  [{ a: {x,y}, b: {x,y}, age }],   // recent passes, age in s (negative = in flight)
 *   goal:    0..1 (net flash), fade: 0..1 (loop fade), t: seconds (drives pulses)
 * }
 * Every field except players and ball is optional.
 *
 * Coordinates: x 0 = left touchline as the user sees it, 68 = right; y 0 =
 * the user's goal line (bottom of the canvas), 105 = the opponent's (top).
 * Each style pre-renders its static pitch once per size and theme, so a frame
 * is one drawImage plus 22 tokens and a ball.
 */
(function (root) {
  'use strict';
  var PW = 68, PL = 105;

  var KITS = {
    spain: { primary: '#c8102e', ink: '#ffd23f', chalk: '#ff8a7a', marker: '#c8102e' },
    spainGK: { primary: '#1d7a58', ink: '#ffffff', chalk: '#8fe0b8', marker: '#1d7a58' },
    argentina: { primary: '#6cace4', secondary: '#ffffff', stripes: true, ink: '#0b1f3a', chalk: '#9fd0ff', marker: '#2a6fb5' },
    argentinaGK: { primary: '#e9b308', ink: '#1a1a1a', chalk: '#ffe27a', marker: '#b98a00' }
  };

  /* ---------- small helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) {
    var A = hex(a), B = hex(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' +
      Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }
  function mixHex(a, b, t) {
    var A = hex(a), B = hex(b), o = '#';
    for (var i = 0; i < 3; i++) o += ('0' + Math.round(A[i] + (B[i] - A[i]) * t).toString(16)).slice(-2);
    return o;
  }
  function rgba(h, a) { var c = hex(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function kitOf(p) { return typeof p.kit === 'string' ? (KITS[p.kit] || KITS.spain) : (p.kit || KITS.spain); }
  function plain(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function mkCanvas(w, h) {
    var c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (c) { c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); }
    return c;
  }
  function ellipse(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }

  /* ---------- geometry ---------- */
  function geometry(w) {
    var px = Math.max(10, Math.round(w * 0.045));
    var s = (w - 2 * px) / PW;
    var py = Math.round(px + 2.4 * s);
    return {
      w: w, h: Math.round(PL * s + 2 * py), s: s, px: px, py: py,
      r: clamp(s * 1.6, 7, 13.5),              /* token radius in CSS px (m1: up to 13.5, was 11, so a full-height pitch has readable numbers) */
      X: function (x) { return px + x * s; },
      Y: function (y) { return py + (PL - y) * s; }
    };
  }

  /* the markings in metres: polylines and spots, shared by every style */
  var MARK = (function () {
    var L = [], S = [], i, a;
    function arc(cx, cy, r, a0, a1, n) {
      var pts = []; for (var k = 0; k <= n; k++) { var th = a0 + (a1 - a0) * k / n; pts.push([cx + r * Math.cos(th), cy + r * Math.sin(th)]); }
      return pts;
    }
    L.push([[0, 0], [68, 0], [68, 105], [0, 105], [0, 0]]);
    L.push([[0, 52.5], [68, 52.5]]);
    L.push(arc(34, 52.5, 9.15, 0, Math.PI * 2, 56));
    [[0, 1], [105, -1]].forEach(function (e) {
      var y0 = e[0], d = e[1], cy = y0 + d * 11, lim = Math.acos(5.5 / 9.15), pts = [];
      L.push([[13.84, y0], [13.84, y0 + d * 16.5], [54.16, y0 + d * 16.5], [54.16, y0]]);
      L.push([[24.84, y0], [24.84, y0 + d * 5.5], [43.16, y0 + d * 5.5], [43.16, y0]]);
      for (i = 0; i <= 18; i++) { a = -lim + 2 * lim * i / 18; pts.push([34 + 9.15 * Math.sin(a), cy + d * 9.15 * Math.cos(a)]); }
      L.push(pts);
      S.push([34, cy]);
    });
    L.push(arc(0, 0, 1, 0, Math.PI / 2, 6)); L.push(arc(68, 0, 1, Math.PI / 2, Math.PI, 6));
    L.push(arc(0, 105, 1, -Math.PI / 2, 0, 6)); L.push(arc(68, 105, 1, Math.PI, Math.PI * 1.5, 6));
    S.push([34, 52.5]);
    return { lines: L, spots: S, goals: [{ y0: 0, d: -1 }, { y0: 105, d: 1 }] };
  })();

  function tracePolys(ctx, g, jitter, rnd) {
    ctx.beginPath();
    MARK.lines.forEach(function (pl) {
      pl.forEach(function (p, i) {
        var x = g.X(p[0]), y = g.Y(p[1]);
        if (jitter) { x += (rnd() - 0.5) * jitter; y += (rnd() - 0.5) * jitter; }
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
    });
  }
  function goalRect(g, goal) {
    var x0 = g.X(30.34), x1 = g.X(37.66), ya = g.Y(goal.y0), yb = g.Y(goal.y0 + goal.d * 2.2);
    return { x: x0, y: Math.min(ya, yb), w: x1 - x0, h: Math.abs(yb - ya) };
  }

  /* who is in the moment, sorted, with screen positions */
  function prep(g, sc) {
    var fa = sc.freeze ? sc.freeze.amount || 0 : 0, ids = {}, back = [], front = [];
    if (fa > 0 && sc.freeze.ids) sc.freeze.ids.forEach(function (id) { ids[id] = 1; });
    sc.players.forEach(function (p) {
      var q = { p: p, k: kitOf(p), sx: g.X(p.x), sy: g.Y(p.y), st: p.state };
      if (ids[p.id] || p.state === 'carrier') front.push(q); else back.push(q);
    });
    function byY(a, b) { return a.sy - b.sy; }
    back.sort(byY); front.sort(byY);
    return { fa: fa, back: back, front: front, carrier: front.filter(function (q) { return q.st === 'carrier'; })[0] };
  }

  /* a dim layer with soft holes over the players in the moment */
  function dimLayer(ctx, g, cache, P, sc, color, alpha, holeR) {
    if (P.fa <= 0) return;
    var c = cache.dim || (cache.dim = mkCanvas(g.w * cache.dpr, g.h * cache.dpr)), d = c.getContext('2d');
    d.setTransform(cache.dpr, 0, 0, cache.dpr, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, g.w, g.h);
    d.fillStyle = color; d.fillRect(0, 0, g.w, g.h);
    d.globalCompositeOperation = 'destination-out';
    var spots = P.front.map(function (q) { return [q.sx, q.sy]; });
    spots.push([g.X(sc.ball.x), g.Y(sc.ball.y)]);
    spots.forEach(function (s) {
      var gr = d.createRadialGradient(s[0], s[1], holeR * 0.35, s[0], s[1], holeR);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = gr; d.fillRect(s[0] - holeR, s[1] - holeR, holeR * 2, holeR * 2);
    });
    ctx.save(); ctx.globalAlpha = alpha * P.fa; ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(c, 0, 0); ctx.restore();
  }

  /* a filled kit disc: plain or Argentina's stripes */
  function kitDisc(ctx, x, y, r, k, grey) {
    var prim = grey ? mix(k.primary, '#9a9a96', 0.7) : k.primary;
    if (!k.stripes) { circle(ctx, x, y, r); ctx.fillStyle = prim; ctx.fill(); return; }
    ctx.save(); circle(ctx, x, y, r); ctx.clip();
    ctx.fillStyle = grey ? mix(k.secondary, '#9a9a96', 0.6) : k.secondary; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = prim; var bw = r * 2 / 5;
    for (var i = 0; i < 5; i += 2) ctx.fillRect(x - r + i * bw, y - r, bw, r * 2);
    ctx.restore();
  }
  function number(ctx, x, y, r, num, color, family, weight) {
    var two = String(num).length > 1, fs = Math.round(r * (two ? 1.08 : 1.25));
    ctx.font = (weight || 800) + ' ' + fs + 'px ' + (family || 'ui-sans-serif, system-ui, "Segoe UI", sans-serif');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
    ctx.fillText(String(num), x, y + fs * 0.07);
  }
  function pill(ctx, g, x, y, text, bg, fg, border, font) {
    ctx.font = font || '700 11px ui-sans-serif, system-ui, "Segoe UI", sans-serif';
    var w = ctx.measureText(text).width + 12, h = 17;
    x = clamp(x - w / 2, 2, g.w - w - 2); y = Math.max(2, y - h);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8.5); else ctx.rect(x, y, w, h);
    ctx.fillStyle = bg; ctx.fill();
    if (border) { ctx.lineWidth = 1; ctx.strokeStyle = border; ctx.stroke(); }
    ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 6, y + h / 2 + 0.5);
  }
  /* the carrier's name, beside his token (the ball sits above him) */
  /* right of the token unless that covers more players than the left does */
  function tagX(cx, cy, r, w, h, pts, W, tr) {
    function hits(x) {
      if (x < 2 || x + w > W - 2) return 99;
      var n = 0; pts.forEach(function (p) { if (p[0] + tr > x && p[0] - tr < x + w && p[1] + tr > cy - h / 2 && p[1] - tr < cy + h / 2) n++; });
      return n;
    }
    var R = cx + r + 5, L = cx - r - 5 - w;
    return hits(L) < hits(R) ? L : R;
  }
  function others(g, sc, skipId) {
    var o = [];
    sc.players.forEach(function (p) { if (skipId !== undefined ? p.id !== skipId : p.state !== 'carrier') o.push([g.X(p.x), g.Y(p.y)]); });
    return o;
  }
  /* m1: the name tags. scene.label on the man on the ball (or the frozen
   * moment's label, as in art1), scene.label2 = {id, text} on a second man */
  function tags(ctx, g, sc, P, lift, draw) {
    var lab = sc.label || (P.fa > 0.3 && sc.freeze && sc.freeze.label) || null;
    if (sc.label2 && sc.label2.id != null && sc.label2.text) {
      var q2 = null;
      P.front.concat(P.back).forEach(function (q) { if (q.p.id === sc.label2.id) q2 = q; });
      if (q2) { ctx.save(); draw(q2, sc.label2.text, true); ctx.restore(); }
    }
    if (lab && P.carrier) {
      ctx.save(); ctx.globalAlpha = sc.label ? 1 : clamp((P.fa - 0.3) / 0.5, 0, 1);
      draw(P.carrier, lab, false); ctx.restore();
    }
  }
  function sideTag(ctx, g, cx, cy, r, text, bg, fg, border, font, pts) {
    ctx.font = font || '700 11px ui-sans-serif, system-ui, "Segoe UI", sans-serif';
    var w = ctx.measureText(text).width + 12, h = 17, x = tagX(cx, cy, r, w, h, pts || [], g.w, g.r);
    var y = cy - h / 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8.5); else ctx.rect(x, y, w, h);
    ctx.fillStyle = bg; ctx.fill();
    if (border) { ctx.lineWidth = 1; ctx.strokeStyle = border; ctx.stroke(); }
    ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 6, y + h / 2 + 0.5);
  }
  function ballAir(g, b) { return { gx: g.X(b.x), gy: g.Y(b.y), bx: g.X(b.x), by: g.Y(b.y) - (b.z || 0) * g.s * 0.85 }; }
  /* the ball at the carrier's feet: pushed out to touch the edge of his
   * token, so it never sits on top of his number at small sizes */
  function ballAt(g, sc, br, extra) {
    var A = ballAir(g, sc.ball), c = null;
    sc.players.forEach(function (p) { if (p.state === 'carrier') c = p; });
    if (!c || (sc.ball.z || 0) > 0.5) return A;
    var cx = g.X(c.x), cy = g.Y(c.y), dx = A.gx - cx, dy = A.gy - cy, d = Math.hypot(dx, dy), need = g.r + br + 1.5 + (extra || 0);
    if (d >= need) return A;
    if (d < 0.01) { dx = 0; dy = c.side === 'them' ? 1 : -1; d = 1; }
    var mx = cx + dx / d * need - A.gx, my = cy + dy / d * need - A.gy;
    return { gx: A.gx + mx, gy: A.gy + my, bx: A.bx + mx, by: A.by + my };
  }
  function trail(ctx, g, b, color, width) {
    var T = b.trail || []; if (!T.length) return;
    var prev = ballAir(g, b);
    for (var i = 0; i < T.length; i++) {
      var q = ballAir(g, T[i]), f = 1 - i / T.length;
      ctx.beginPath(); ctx.moveTo(prev.bx, prev.by); ctx.lineTo(q.bx, q.by);
      ctx.strokeStyle = rgba(color, 0.55 * f); ctx.lineWidth = width * f; ctx.lineCap = 'round'; ctx.stroke();
      prev = q;
    }
  }
  function netFlash(ctx, g, amt, color, end) {
    if (!(amt > 0)) return;
    var bottom = end === 'them';                 /* m1: they scored, in your net at the bottom */
    var n = goalRect(g, MARK.goals[bottom ? 0 : 1]);
    ctx.save(); ctx.globalAlpha = amt;
    var cy0 = bottom ? n.y : n.y + n.h;
    var gr = ctx.createRadialGradient(n.x + n.w / 2, cy0, 2, n.x + n.w / 2, cy0, n.w * 1.6);
    gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(n.x - n.w, cy0 - n.w * 1.3, n.w * 3, n.w * 2.6);
    ctx.restore();
  }

  /* ================= 1. BROADCAST: day, and floodlit night in dark mode ============ */
  var broadcast = {
    id: 'broadcast', name: 'Broadcast', blurb: 'Mown stripes, crisp chalk, TV vignette. Dark mode is a night match under four floodlights.',
    bg: function (th) { return th === 'dark' ? '#0c1f13' : '#2c7a3d'; },
    prepare: function (g, th, cache) {
      var night = th === 'dark', c = mkCanvas(g.w * cache.dpr, g.h * cache.dpr), x = c.getContext('2d'), i;
      x.scale(cache.dpr, cache.dpr);
      x.fillStyle = night ? '#07120a' : '#2f7d3f'; x.fillRect(0, 0, g.w, g.h);
      var bands = 14, bh = PL / bands;
      for (i = 0; i < bands; i++) {
        x.fillStyle = night ? (i % 2 ? '#1a5530' : '#1e5f35') : (i % 2 ? '#3d944b' : '#46a053');
        x.fillRect(g.X(0) - g.px * 0.6, g.Y((i + 1) * bh), PW * g.s + g.px * 1.2, bh * g.s + 0.5);
      }
      if (night) {
        /* four floodlight towers just off the corners: a glow at each and a pool on the grass */
        x.globalCompositeOperation = 'lighter';
        [[-4, -5], [72, -5], [-4, 110], [72, 110]].forEach(function (L) {
          var lx = g.X(L[0]), ly = g.Y(L[1]), R = g.w * 0.75;
          var gr = x.createRadialGradient(lx, ly, 0, lx, ly, R);
          gr.addColorStop(0, 'rgba(255,248,215,0.16)'); gr.addColorStop(0.45, 'rgba(255,248,215,0.05)'); gr.addColorStop(1, 'rgba(255,248,215,0)');
          x.fillStyle = gr; x.fillRect(0, 0, g.w, g.h);
          var gl2 = x.createRadialGradient(lx, ly, 0, lx, ly, g.px * 1.6);
          gl2.addColorStop(0, 'rgba(255,252,230,0.9)'); gl2.addColorStop(0.25, 'rgba(255,250,220,0.35)'); gl2.addColorStop(1, 'rgba(255,250,220,0)');
          x.fillStyle = gl2; x.fillRect(lx - g.px * 1.6, ly - g.px * 1.6, g.px * 3.2, g.px * 3.2);
        });
        x.globalCompositeOperation = 'source-over';
      }
      x.strokeStyle = night ? 'rgba(240,248,240,0.82)' : 'rgba(255,255,255,0.93)';
      x.lineWidth = Math.max(1.2, g.s * 0.13); x.lineJoin = 'round'; x.lineCap = 'round';
      tracePolys(x, g); x.stroke();
      x.fillStyle = x.strokeStyle;
      MARK.spots.forEach(function (s) { circle(x, g.X(s[0]), g.Y(s[1]), Math.max(1.3, g.s * 0.22)); x.fill(); });
      MARK.goals.forEach(function (gl) {
        var n = goalRect(g, gl); x.save(); x.beginPath(); x.rect(n.x, n.y, n.w, n.h); x.clip();
        x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(n.x, n.y, n.w, n.h);
        x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 0.7;
        for (var k = -n.h; k < n.w; k += 3) { x.beginPath(); x.moveTo(n.x + k, n.y); x.lineTo(n.x + k + n.h, n.y + n.h); x.stroke(); }
        x.restore(); x.strokeStyle = '#fff'; x.lineWidth = Math.max(1.5, g.s * 0.2); x.strokeRect(n.x, n.y, n.w, n.h);
      });
      var vg = x.createRadialGradient(g.w / 2, g.h / 2, g.h * 0.28, g.w / 2, g.h / 2, g.h * 0.72);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, night ? 'rgba(0,0,0,0.42)' : 'rgba(0,20,0,0.26)');
      x.fillStyle = vg; x.fillRect(0, 0, g.w, g.h);
      cache.pitch = c;
    },
    token: function (ctx, g, q, night, t, fa) {
      var r = g.r, x = q.sx, y = q.sy, k = q.k, beaten = q.st === 'beaten', i;
      ctx.globalAlpha = beaten ? 0.55 : 1;
      if (night) {
        ctx.fillStyle = 'rgba(0,0,0,0.17)';
        for (i = 0; i < 4; i++) { ellipse(ctx, x + (i % 2 ? 1 : -1) * r * 0.42, y + (i < 2 ? 1 : -1) * r * 0.42, r, r * 0.9); ctx.fill(); }
      } else { ctx.fillStyle = 'rgba(0,30,0,0.28)'; ellipse(ctx, x + r * 0.22, y + r * 0.3, r, r * 0.92); ctx.fill(); }
      kitDisc(ctx, x, y, r, k, beaten);
      circle(ctx, x, y, r); ctx.lineWidth = Math.max(1, r * 0.17); ctx.strokeStyle = beaten ? 'rgba(255,255,255,0.6)' : '#ffffff'; ctx.stroke();
      number(ctx, x, y, r, q.p.num, beaten ? '#f4f4f0' : k.ink);
      ctx.globalAlpha = 1;
      if (q.st === 'carrier') {
        var ph = (t % 1.1) / 1.1;
        circle(ctx, x, y, r + 2.6); ctx.lineWidth = 3.6; ctx.strokeStyle = 'rgba(10,20,12,0.55)'; ctx.stroke();
        circle(ctx, x, y, r + 2.6); ctx.lineWidth = 2.2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        circle(ctx, x, y, r + 2.6 + ph * r * 1.3); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,' + (0.7 * (1 - ph)) + ')'; ctx.stroke();
      } else if (q.st === 'actor' && fa > 0) {
        circle(ctx, x, y, r + 2.3); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * fa) + ')'; ctx.stroke();
      } else if (beaten) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
        for (i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + r * 1.3, y + i * r * 0.5); ctx.lineTo(x + r * 2.1, y + i * r * 0.5 + 1); ctx.stroke(); }
      }
    },
    ball: function (ctx, g, b, sc) {
      var br = Math.max(2.8, g.r * 0.42), A = ballAt(g, sc, br), z = b.z || 0, rr = br * (1 + z * 0.05);
      ctx.fillStyle = 'rgba(0,0,0,' + clamp(0.4 - z * 0.03, 0.15, 0.4) + ')';
      ellipse(ctx, A.gx + z * g.s * 0.3, A.gy + 1, br * (1 - z * 0.03), br * 0.7 * (1 - z * 0.03)); ctx.fill();
      circle(ctx, A.bx, A.by, rr); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.lineWidth = 0.9; ctx.strokeStyle = '#1a1a1a'; ctx.stroke();
      ctx.fillStyle = '#1a1a1a';
      for (var i = 0; i < 3; i++) { var a = (b.spin || 0) + i * 2.094; circle(ctx, A.bx + Math.cos(a) * rr * 0.48, A.by + Math.sin(a) * rr * 0.48, rr * 0.26); ctx.fill(); }
    },
    frame: function (ctx, g, sc, th, cache) {
      var night = th === 'dark', P = prep(g, sc), t = sc.t || 0, self = this;
      ctx.drawImage(cache.pitch, 0, 0, g.w, g.h);
      netFlash(ctx, g, sc.goal, 'rgba(255,255,255,0.8)', sc.goalEnd);
      P.back.forEach(function (q) { self.token(ctx, g, q, night, t, P.fa); });
      dimLayer(ctx, g, cache, P, sc, night ? 'rgba(0,0,0,0.62)' : 'rgba(5,25,10,0.5)', 1, g.r * 3.2);
      trail(ctx, g, sc.ball, '#ffffff', Math.max(3, g.r * 0.7));
      P.front.forEach(function (q) { self.token(ctx, g, q, night, t, P.fa); });
      this.ball(ctx, g, sc.ball, sc);
      tags(ctx, g, sc, P, 0, function (q, text, second) {
        sideTag(ctx, g, q.sx, q.sy, g.r + 3, text, second ? 'rgba(16,22,15,0.72)' : (night ? '#ffffff' : '#10160f'), second ? '#ffffff' : (night ? '#10160f' : '#ffffff'), null, null, others(g, sc, q.p.id));
      });
    }
  };

  /* ================= 2. TABLETOP: a printed board and thick game pieces ============ */
  var tabletop = {
    id: 'tabletop', name: 'Tabletop', blurb: 'A printed game board: felt, cream ink, the engine\'s zones as a faint grid, thick pieces with real shadows. The moment lifts its pieces off the board.',
    bg: function (th) { return th === 'dark' ? '#2a2119' : '#d8c29a'; },
    prepare: function (g, th, cache) {
      var dark = th === 'dark', c = mkCanvas(g.w * cache.dpr, g.h * cache.dpr), x = c.getContext('2d'), R = rng(7), i;
      x.scale(cache.dpr, cache.dpr);
      /* the board: card stock with a bevelled edge */
      x.fillStyle = dark ? '#2e241b' : '#dcc7a0'; x.fillRect(0, 0, g.w, g.h);
      x.strokeStyle = dark ? 'rgba(0,0,0,0.5)' : 'rgba(90,60,20,0.35)'; x.lineWidth = 2; x.strokeRect(1, 1, g.w - 2, g.h - 2);
      var fx = g.X(0) - g.px * 0.55, fy = g.Y(PL) - g.py * 0.55, fw = PW * g.s + g.px * 1.1, fh = PL * g.s + g.py * 1.1;
      x.fillStyle = dark ? '#325e38' : '#5f9e58';
      x.beginPath(); if (x.roundRect) x.roundRect(fx, fy, fw, fh, 6); else x.rect(fx, fy, fw, fh); x.fill();
      /* printed stripes, very soft */
      for (i = 0; i < 10; i++) if (i % 2) { x.fillStyle = dark ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.05)'; x.fillRect(fx, g.Y((i + 1) * 10.5), fw, 10.5 * g.s); }
      /* paper grain: one 96 px noise tile, repeated */
      var tile = mkCanvas(96, 96), tx = tile.getContext('2d');
      for (i = 0; i < 1100; i++) {
        tx.fillStyle = R() < 0.5 ? 'rgba(255,255,255,' + (0.05 + R() * 0.05) + ')' : 'rgba(0,0,0,' + (0.05 + R() * 0.06) + ')';
        tx.fillRect(Math.floor(R() * 96), Math.floor(R() * 96), 1, 1);
      }
      x.save(); x.beginPath(); if (x.roundRect) x.roundRect(fx, fy, fw, fh, 6); else x.rect(fx, fy, fw, fh); x.clip();
      x.fillStyle = x.createPattern(tile, 'repeat'); x.fillRect(fx, fy, fw, fh); x.restore();
      /* the engine's zones and lanes, printed faintly */
      x.save(); x.setLineDash([2, 4]); x.lineWidth = 1; x.strokeStyle = dark ? 'rgba(230,220,190,0.14)' : 'rgba(255,250,230,0.3)';
      [40, 70].forEach(function (y) { x.beginPath(); x.moveTo(g.X(0), g.Y(y)); x.lineTo(g.X(PW), g.Y(y)); x.stroke(); });
      [22, 46].forEach(function (xx) { x.beginPath(); x.moveTo(g.X(xx), g.Y(0)); x.lineTo(g.X(xx), g.Y(PL)); x.stroke(); });
      x.restore();
      x.strokeStyle = dark ? 'rgba(232,224,200,0.72)' : 'rgba(255,250,232,0.94)';
      x.lineWidth = Math.max(1.3, g.s * 0.16); x.lineJoin = 'round'; x.lineCap = 'round';
      tracePolys(x, g); x.stroke();
      x.fillStyle = x.strokeStyle;
      MARK.spots.forEach(function (s) { circle(x, g.X(s[0]), g.Y(s[1]), Math.max(1.4, g.s * 0.24)); x.fill(); });
      MARK.goals.forEach(function (gl) {
        var n = goalRect(g, gl); x.fillStyle = dark ? 'rgba(0,0,0,0.3)' : 'rgba(40,30,10,0.18)'; x.fillRect(n.x, n.y, n.w, n.h);
        x.strokeStyle = dark ? 'rgba(232,224,200,0.72)' : 'rgba(255,250,232,0.94)'; x.lineWidth = Math.max(1.3, g.s * 0.16); x.strokeRect(n.x, n.y, n.w, n.h);
      });
      if (dark) { /* a warm lamp over the middle of the table */
        var gr = x.createRadialGradient(g.w * 0.5, g.h * 0.42, 0, g.w * 0.5, g.h * 0.42, g.h * 0.7);
        gr.addColorStop(0, 'rgba(255,214,150,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.28)');
        x.fillStyle = gr; x.fillRect(0, 0, g.w, g.h);
      }
      cache.pitch = c;
    },
    piece: function (ctx, g, q, dark, lift, fa, dimmed) {
      var r = g.r, x = q.sx, y = q.sy, k = q.k, th = r * 0.34, beaten = q.st === 'beaten';
      var top = beaten ? mix(k.primary, '#8b8a82', 0.55) : k.primary;
      var side = mixHex(k.primary, '#000000', 0.42);
      if (dimmed) ctx.globalAlpha = 1 - 0.25 * fa;              /* m1: was 0.38; the rest of the pitch stays readable */
      /* shadow grows and softens as the piece lifts */
      var so = th * 0.6 + lift * 0.7, sa = 0.34 - lift / r * 0.1;
      ctx.fillStyle = 'rgba(20,12,0,' + sa + ')'; ellipse(ctx, x + so * 0.55, y + so * 0.55 + th * 0.4, r * 1.04 + lift * 0.12, r * 0.94 + lift * 0.1); ctx.fill();
      if (lift > 1) { ctx.fillStyle = 'rgba(20,12,0,0.12)'; ellipse(ctx, x + so * 0.6, y + so * 0.6 + th * 0.4, r * 1.3, r * 1.18); ctx.fill(); }
      if (q.st === 'carrier') {
        /* a gold ring printed on the board under the lifted piece */
        ellipse(ctx, x, y + th * 0.5, r * 1.5, r * 1.1); ctx.lineWidth = 4.4; ctx.strokeStyle = 'rgba(30,20,5,0.55)'; ctx.stroke();
        ellipse(ctx, x, y + th * 0.5, r * 1.5, r * 1.1); ctx.lineWidth = 2.6; ctx.strokeStyle = '#fffdf6'; ctx.stroke();
      }
      if (beaten) {
        /* m1: art1 laid the beaten piece on its edge, which read as a smudge
         * at match size; it stays upright, greyed, with its number */
        ctx.globalAlpha = Math.min(ctx.globalAlpha, 0.8);
        ctx.fillStyle = mixHex(side, '#8b8a82', 0.5); circle(ctx, x, y + th * 0.5, r); ctx.fill(); ctx.fillRect(x - r, y - th * 0.5, r * 2, th);
        kitDisc(ctx, x, y - th * 0.5, r, k, true);
        number(ctx, x, y - th * 0.5, r, q.p.num, '#ffffff');
        ctx.globalAlpha = 1; return;
      }
      var cy = y - lift;
      /* the edge of the piece */
      ctx.fillStyle = side; circle(ctx, x, cy + th * 0.5, r); ctx.fill(); ctx.fillRect(x - r, cy - th * 0.5, r * 2, th);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - r, cy + th * 0.1, r * 2, 0.8);
      kitDisc(ctx, x, cy - th * 0.5, r, k);
      /* printed ring and number */
      circle(ctx, x, cy - th * 0.5, r * 0.8); ctx.lineWidth = 1; ctx.strokeStyle = k.stripes ? 'rgba(11,31,58,0.35)' : 'rgba(255,255,255,0.4)'; ctx.stroke();
      circle(ctx, x, cy - th * 0.5, r - 0.5); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
      number(ctx, x, cy - th * 0.5, r, q.p.num, k.ink);
      ctx.globalAlpha = 1;
    },
    ball: function (ctx, g, b, dark, sc) {
      var br = Math.max(2.8, g.r * 0.4), A = ballAt(g, sc, br, g.r * 0.9), z = b.z || 0, rr = br * (1 + z * 0.05);
      ctx.fillStyle = 'rgba(20,12,0,' + clamp(0.38 - z * 0.03, 0.14, 0.38) + ')';
      ellipse(ctx, A.gx + 1 + z * g.s * 0.35, A.gy + 1.5, br * 1.05, br * 0.8); ctx.fill();
      var gr = ctx.createRadialGradient(A.bx - rr * 0.35, A.by - rr * 0.4, rr * 0.1, A.bx, A.by, rr);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#d9d4c4');
      circle(ctx, A.bx, A.by, rr); ctx.fillStyle = gr; ctx.fill(); ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(60,40,10,0.7)'; ctx.stroke();
      ctx.strokeStyle = 'rgba(60,40,10,0.55)'; ctx.lineWidth = 0.8;
      var a = b.spin || 0; ctx.beginPath(); ctx.moveTo(A.bx + Math.cos(a) * rr * 0.9, A.by + Math.sin(a) * rr * 0.9); ctx.lineTo(A.bx - Math.cos(a) * rr * 0.9, A.by - Math.sin(a) * rr * 0.9); ctx.stroke();
    },
    frame: function (ctx, g, sc, th, cache) {
      var dark = th === 'dark', P = prep(g, sc), self = this, t = sc.t || 0;
      ctx.drawImage(cache.pitch, 0, 0, g.w, g.h);
      netFlash(ctx, g, sc.goal, 'rgba(255,236,170,0.85)', sc.goalEnd);
      /* the last passes stay printed on the board as fading dotted lines */
      (sc.passes || []).forEach(function (ps) {
        var al = ps.age < 0 ? 0.6 : 0.6 * (1 - ps.age / 2.2); if (al <= 0) return;
        ctx.save(); ctx.globalAlpha = al; ctx.setLineDash([1.5, 4]); ctx.lineCap = 'round'; ctx.lineWidth = 2;
        ctx.strokeStyle = dark ? '#e8dfc4' : '#fffaf0';
        ctx.beginPath(); ctx.moveTo(g.X(ps.a.x), g.Y(ps.a.y)); ctx.lineTo(g.X(ps.b.x), g.Y(ps.b.y)); ctx.stroke(); ctx.restore();
      });
      P.back.forEach(function (q) { self.piece(ctx, g, q, dark, 0, P.fa, true); });
      if (P.fa > 0) dimLayer(ctx, g, cache, P, sc, dark ? 'rgba(10,6,0,0.5)' : 'rgba(30,22,8,0.42)', 0.55, g.r * 3.6);   /* m1: 0.55, was 0.8 */
      /* ball path: little printed dots */
      var T = sc.ball.trail || [];
      for (var i = 0; i < T.length; i += 2) { var q = ballAir(g, T[i]); ctx.fillStyle = 'rgba(255,250,232,' + (0.7 * (1 - i / T.length)) + ')'; circle(ctx, q.bx, q.by, 1.4); ctx.fill(); }
      P.front.forEach(function (q) {
        var lift = q.st === 'carrier' ? g.r * (0.55 + 0.25 * P.fa + 0.06 * Math.sin(t * 5)) : q.st === 'actor' ? g.r * 0.35 * P.fa : 0;
        self.piece(ctx, g, q, dark, lift, P.fa, false);
      });
      this.ball(ctx, g, sc.ball, dark, sc);
      tags(ctx, g, sc, P, g.r * 0.9, function (q, text, second) {
        sideTag(ctx, g, q.sx, q.sy - (q.st === 'carrier' ? g.r * 0.9 : 0), g.r + 3, text, second ? 'rgba(251,245,227,0.86)' : '#fbf5e3', '#3a2a12',
          second ? 'rgba(90,60,20,0.35)' : 'rgba(90,60,20,0.6)', (second ? '600 11px' : '700 12px') + ' Georgia, "Times New Roman", serif', others(g, sc, q.p.id));
      });
    }
  };

  /* ================= 3. PIXEL: Sensible Soccer, drawn at half resolution ============ */
  var GLYPH = {
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
    '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
    F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
    K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
    P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
    Z: '111001010100111', ' ': '000000000000000'
  };
  var DISC9 = [2, 1, 0, 0, 0, 0, 0, 1, 2]; /* inset per row of a 9 px disc */
  function pxText(x, cx, cy, text, color) {
    text = plain(text).toUpperCase(); x.fillStyle = color;
    for (var i = 0; i < text.length; i++) {
      var gl = GLYPH[text[i]] || GLYPH[' '];
      for (var b = 0; b < 15; b++) if (gl[b] === '1') x.fillRect(cx + i * 4 + (b % 3), cy + Math.floor(b / 3), 1, 1);
    }
  }
  function pxLine(x, x0, y0, x1, y1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy;
    for (var n = 0; n < 2000; n++) {
      x.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  var pixel = {
    id: 'pixel', name: 'Pixel', blurb: 'Sensible Soccer at half resolution: two-tone mown bands, 1-pixel chalk, advertising boards, 9-pixel shirts with a pixel font.',
    SCALE: 2,
    bg: function (th) { return th === 'dark' ? '#0d2414' : '#2f8a2f'; },
    geo: function (w) {
      var gl = geometry(Math.floor(w / 2)); gl.r = 4.5;
      var g = { w: gl.w * 2, h: gl.h * 2, s: gl.s * 2, px: gl.px * 2, py: gl.py * 2, r: 9, low: gl,
        X: function (x) { return gl.X(x) * 2; }, Y: function (y) { return gl.Y(y) * 2; } };
      return g;
    },
    pal: function (th) {
      return th === 'dark' ? { sur: '#0b2216', a: '#184a2c', b: '#1c5532', line: '#b9ccc0', net: '#6f8a7a', out: '#000000' }
        : { sur: '#2a7a2a', a: '#3f9f35', b: '#4aae3d', line: '#ffffff', net: '#d0d0d0', out: '#0b1a0b' };
    },
    prepare: function (g, th, cache) {
      var gl = g.low, P = this.pal(th), c = mkCanvas(gl.w, gl.h), x = c.getContext('2d'), i;
      x.fillStyle = P.sur; x.fillRect(0, 0, gl.w, gl.h);
      for (i = 0; i < 10; i++) { x.fillStyle = i % 2 ? P.a : P.b; x.fillRect(Math.round(gl.X(0)) - 3, Math.round(gl.Y((i + 1) * 10.5)), Math.round(PW * gl.s) + 7, Math.ceil(10.5 * gl.s)); }
      /* advertising boards along both touchlines */
      var ads = ['#e8423a', '#ffd23f', '#3a7be8', '#ffffff', '#1a1a1a'];
      for (i = 0; i * 7 < gl.h; i++) {
        x.fillStyle = ads[i % 5]; x.fillRect(Math.round(gl.X(0)) - 6, i * 7 + 2, 2, 6);
        x.fillStyle = ads[(i + 2) % 5]; x.fillRect(Math.round(gl.X(PW)) + 5, i * 7 + 2, 2, 6);
      }
      x.fillStyle = P.line;
      MARK.lines.forEach(function (pl) { for (var k = 1; k < pl.length; k++) pxLine(x, gl.X(pl[k - 1][0]), gl.Y(pl[k - 1][1]), gl.X(pl[k][0]), gl.Y(pl[k][1])); });
      MARK.spots.forEach(function (s) { x.fillRect(Math.round(gl.X(s[0])), Math.round(gl.Y(s[1])), 1, 1); });
      MARK.goals.forEach(function (go) {
        var n = goalRect(gl, go), x0 = Math.round(n.x), y0 = Math.round(n.y), w = Math.round(n.w), h = Math.round(n.h);
        x.fillStyle = P.net; for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) if ((xx + yy) % 2 === 0) x.fillRect(x0 + xx, y0 + yy, 1, 1);
        x.fillStyle = P.line; x.fillRect(x0, y0, w + 1, 1); x.fillRect(x0, y0 + h, w + 1, 1); x.fillRect(x0, y0, 1, h); x.fillRect(x0 + w, y0, 1, h);
      });
      cache.pitch = c;
      cache.low = mkCanvas(gl.w, gl.h);
    },
    sprite: function (x, cx, cy, q, P, t) {
      var k = q.k, beaten = q.st === 'beaten', i, row, prim = beaten ? '#8c8c8c' : k.primary, sec = beaten ? '#bcbcbc' : (k.secondary || k.primary);
      var outline = P.out, blink = Math.floor(t * 6) % 2;
      if (q.st === 'carrier') outline = blink ? '#ffe14d' : '#ffffff';
      else if (q.st === 'actor') outline = '#ffffff';
      /* outline ring: the 9 px disc grown by one */
      x.fillStyle = outline;
      for (row = -1; row <= 9; row++) {
        var ins = row < 0 || row > 8 ? 3 : DISC9[row] - 1;
        x.fillRect(cx - 4 + ins, cy - 4 + row, 9 - 2 * ins, 1);
      }
      for (row = 0; row < 9; row++) {
        var a = DISC9[row];
        if (k.stripes && !beaten) { for (i = a; i < 9 - a; i++) { x.fillStyle = (i === 1 || i === 7 || ((row < 2 || row > 6) && i === 4)) ? sec : prim; x.fillRect(cx - 4 + i, cy - 4 + row, 1, 1); } }
        else { x.fillStyle = prim; x.fillRect(cx - 4 + a, cy - 4 + row, 9 - 2 * a, 1); }
      }
      var s = String(q.p.num), ink = beaten ? '#ffffff' : k.ink;
      pxText(x, cx - (s.length > 1 ? 3 : 1), cy - 2, s, ink);
      if (q.st === 'carrier') { var bob = Math.floor(t * 4) % 2; x.fillStyle = '#ffe14d'; x.fillRect(cx - 2, cy - 10 - bob, 5, 1); x.fillRect(cx - 1, cy - 9 - bob, 3, 1); x.fillRect(cx, cy - 8 - bob, 1, 1); }
      if (beaten) { var a2 = t * 5; x.fillStyle = '#ffe14d'; x.fillRect(Math.round(cx + Math.cos(a2) * 5), Math.round(cy - 6 + Math.sin(a2) * 1.5), 1, 1); x.fillRect(Math.round(cx - Math.cos(a2) * 5), Math.round(cy - 6 - Math.sin(a2) * 1.5), 1, 1); }
    },
    frame: function (ctx, g, sc, th, cache) {
      var gl = g.low, x = cache.low.getContext('2d'), P = this.pal(th), t = sc.t || 0, self = this;
      var fa = sc.freeze ? sc.freeze.amount || 0 : 0, ids = {};
      if (fa > 0) (sc.freeze.ids || []).forEach(function (id) { ids[id] = 1; });
      x.drawImage(cache.pitch, 0, 0);
      if (sc.goal > 0 && Math.floor(t * 8) % 2) { var n = goalRect(gl, MARK.goals[1]); x.fillStyle = '#ffe14d'; x.fillRect(Math.round(n.x), Math.round(n.y), Math.round(n.w) + 1, Math.round(n.h) + 1); }
      var Q = sc.players.map(function (p) { return { p: p, k: kitOf(p), st: p.state, cx: Math.round(gl.X(p.x)), cy: Math.round(gl.Y(p.y)), f: !!ids[p.id] || p.state === 'carrier' }; });
      Q.sort(function (a, b) { return a.cy - b.cy; });
      Q.forEach(function (q) { if (!q.f) self.sprite(x, q.cx, q.cy, q, P, t); });
      if (fa > 0) {
        /* the lights go down in three hard steps, like an old palette fade */
        x.fillStyle = 'rgba(0,0,0,' + (Math.ceil(fa * 3) / 3 * 0.5) + ')'; x.fillRect(0, 0, gl.w, gl.h);
        var fr = Q.filter(function (q) { return q.f; }), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        fr.forEach(function (q) { x0 = Math.min(x0, q.cx); y0 = Math.min(y0, q.cy); x1 = Math.max(x1, q.cx); y1 = Math.max(y1, q.cy); });
        x0 -= 8; y0 -= 8; x1 += 8; y1 += 8;
        x.fillStyle = Math.floor(t * 3) % 2 ? '#ffe14d' : '#ffffff';
        [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(function (c) {
          for (var i = 0; i < 4; i++) { x.fillRect(c[0] + c[2] * i, c[1], 1, 1); x.fillRect(c[0], c[1] + c[3] * i, 1, 1); }
        });
      }
      /* ball: trail dots, shadow, then the ball lifted by its height */
      var b = sc.ball, T = b.trail || [];
      for (var i = 1; i < T.length; i += 2) { x.fillStyle = 'rgba(255,255,255,' + (0.8 - i / T.length * 0.7) + ')'; x.fillRect(Math.round(gl.X(T[i].x)), Math.round(gl.Y(T[i].y) - (T[i].z || 0) * gl.s * 0.85), 1, 1); }
      Q.forEach(function (q) { if (q.f) self.sprite(x, q.cx, q.cy, q, P, t); });
      var BA = ballAt(gl, sc, 1.5), bx = Math.round(BA.gx), by = Math.round(BA.gy), lift = Math.round((b.z || 0) * gl.s * 0.85), big = (b.z || 0) > 3;
      x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(bx - 1 + Math.round(lift * 0.3), by + 1, 3, 1);
      x.fillStyle = '#000'; x.fillRect(bx - 1, by - lift - 1, big ? 4 : 3, big ? 4 : 3);
      x.fillStyle = '#fff'; x.fillRect(bx - 1, by - lift - 1, big ? 3 : 2, big ? 3 : 2);
      if (fa > 0.3 && sc.freeze.label) {
        var car = Q.filter(function (q) { return q.st === 'carrier'; })[0];
        if (car) {
          var lab = plain(sc.freeze.label).toUpperCase(), w = lab.length * 4 + 3, ly = car.cy - 4;
          var lx = Math.round(tagX(car.cx, car.cy, 6, w, 9, others(gl, sc), gl.w, 5.5));
          x.fillStyle = '#000'; x.fillRect(lx, ly, w, 9); pxText(x, lx + 2, ly + 2, lab, '#ffe14d');
        }
      }
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(cache.low, 0, 0, g.w, g.h); ctx.restore();
    }
  };

  /* ================= 4. TACTICS BOARD: chalk at night, whiteboard by day ============ */
  var HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
  function wobblyPath(ctx, pts, rnd, j) {
    ctx.beginPath();
    pts.forEach(function (p, i) { var x = p[0] + (rnd() - 0.5) * j, y = p[1] + (rnd() - 0.5) * j; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  }
  var tactics = {
    id: 'tactics', name: 'Tactics board', blurb: 'The coach\'s board: chalk on slate in dark mode, marker on a whiteboard in light. Players are magnets; the moment gets drawn on.',
    bg: function (th) { return th === 'dark' ? '#1d2a23' : '#f4f4f0'; },
    ink: function (th) { return th === 'dark' ? { line: '#e8efe6', dim: 'rgba(232,239,230,', mark: '#f7e58a', board: '#1f2d25' } : { line: '#2f6b4f', dim: 'rgba(47,107,79,', mark: '#d0402f', board: '#f6f6f2' }; },
    prepare: function (g, th, cache) {
      var dark = th === 'dark', I = this.ink(th), c = mkCanvas(g.w * cache.dpr, g.h * cache.dpr), x = c.getContext('2d'), R = rng(11), i;
      x.scale(cache.dpr, cache.dpr);
      x.fillStyle = dark ? '#6b4f33' : '#b8bdc3'; x.fillRect(0, 0, g.w, g.h); /* frame: wood or aluminium */
      var f = 5; x.fillStyle = I.board; x.fillRect(f, f, g.w - 2 * f, g.h - 2 * f);
      if (!dark) { x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(f, f, g.w - 2 * f, 1.5); }
      /* smudges: rubbed-out chalk, or ghost marker */
      for (i = 0; i < 26; i++) {
        var sx = f + R() * (g.w - 2 * f), sy = f + R() * (g.h - 2 * f), sr = 12 + R() * 40;
        var gr = x.createRadialGradient(sx, sy, 0, sx, sy, sr);
        gr.addColorStop(0, dark ? 'rgba(255,255,255,0.045)' : 'rgba(60,90,80,0.03)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = gr; x.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
      }
      /* zones and lanes: faint dashed, like a coach's grid */
      x.save(); x.setLineDash([3, 5]); x.lineWidth = 1; x.strokeStyle = I.dim + (dark ? '0.16)' : '0.18)');
      [40, 70].forEach(function (y) { x.beginPath(); x.moveTo(g.X(0), g.Y(y)); x.lineTo(g.X(PW), g.Y(y)); x.stroke(); });
      [22, 46].forEach(function (xx) { x.beginPath(); x.moveTo(g.X(xx), g.Y(0)); x.lineTo(g.X(xx), g.Y(PL)); x.stroke(); });
      x.restore();
      /* the lines, drawn by hand: several light passes for chalk, two for marker */
      x.lineJoin = 'round'; x.lineCap = 'round';
      var passes = dark ? 3 : 2;
      for (i = 0; i < passes; i++) {
        x.strokeStyle = dark ? 'rgba(236,242,232,' + (0.34 + R() * 0.12) + ')' : rgba(I.line, 0.72);
        x.lineWidth = dark ? 1.3 + R() * 0.8 : 1.5;
        MARK.lines.forEach(function (pl) { wobblyPath(x, pl.map(function (p) { return [g.X(p[0]), g.Y(p[1])]; }), R, dark ? 1.2 : 0.7); x.stroke(); });
      }
      if (dark) for (i = 0; i < g.w * 2; i++) { /* chalk dust along the lines */
        var pl = MARK.lines[Math.floor(R() * MARK.lines.length)], k = Math.floor(R() * (pl.length - 1)), u = R();
        x.fillStyle = 'rgba(240,245,236,' + (0.1 + R() * 0.2) + ')';
        x.fillRect(g.X(pl[k][0] + (pl[k + 1][0] - pl[k][0]) * u) + (R() - 0.5) * 4, g.Y(pl[k][1] + (pl[k + 1][1] - pl[k][1]) * u) + (R() - 0.5) * 4, 1, 1);
      }
      x.fillStyle = dark ? 'rgba(236,242,232,0.7)' : I.line;
      MARK.spots.forEach(function (s) { circle(x, g.X(s[0]), g.Y(s[1]), 1.6); x.fill(); });
      MARK.goals.forEach(function (gl) {
        var n = goalRect(g, gl); x.strokeStyle = dark ? 'rgba(236,242,232,0.75)' : I.line; x.lineWidth = 1.4;
        x.strokeRect(n.x, n.y, n.w, n.h);
        x.lineWidth = 0.6; for (var k2 = n.x + 3; k2 < n.x + n.w; k2 += 3) { x.beginPath(); x.moveTo(k2, n.y); x.lineTo(k2, n.y + n.h); x.stroke(); }
      });
      cache.pitch = c;
    },
    magnet: function (ctx, g, q, dark, fa, dimmed) {
      var r = g.r, x = q.sx, y = q.sy, k = q.k, beaten = q.st === 'beaten';
      ctx.globalAlpha = dimmed ? 1 - 0.55 * fa : beaten ? 0.6 : 1;
      ctx.fillStyle = dark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.22)'; circle(ctx, x + 0.8, y + 1.4, r); ctx.fill();
      kitDisc(ctx, x, y, r, k, beaten);
      var gr = ctx.createRadialGradient(x - r * 0.4, y - r * 0.5, 0, x - r * 0.2, y - r * 0.3, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.38)'); gr.addColorStop(0.6, 'rgba(255,255,255,0)');
      circle(ctx, x, y, r); ctx.fillStyle = gr; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
      number(ctx, x, y, r, q.p.num, beaten ? '#ffffff' : k.ink);
      ctx.globalAlpha = 1;
    },
    ring: function (ctx, x, y, r, color, width, rnd, frac, dashed) {
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
      if (dashed) ctx.setLineDash([2.5, 3]);
      var pts = [], n = 22, end = Math.max(0.02, frac) * (Math.PI * 2 + 0.5);
      for (var i = 0; i <= n; i++) { var a = -1.9 + end * i / n, rr = r * (1 + 0.06 * Math.sin(i * 1.7)); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
      wobblyPath(ctx, pts, rnd, 0.8); ctx.stroke(); ctx.restore();
    },
    arrow: function (ctx, g, a, color, frac, rnd, dark) {
      var x0 = g.X(a.from.x), y0 = g.Y(a.from.y), x1 = g.X(a.to.x), y1 = g.Y(a.to.y);
      var dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy); if (L < 1) return;
      var ux = dx / L, uy = dy / L; x0 += ux * g.r * 1.4; y0 += uy * g.r * 1.4; x1 -= ux * g.r * 1.2; y1 -= uy * g.r * 1.2;
      L = Math.hypot(x1 - x0, y1 - y0) * frac; x1 = x0 + ux * L; y1 = y0 + uy * L;
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = dark ? 1.8 : 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      var pts = [], n = Math.max(2, Math.round(L / 4));
      for (var i = 0; i <= n; i++) {
        var u = i / n, wv = a.kind === 'dribble' ? Math.sin(u * Math.PI * 4) * 2.2 : 0, bow = a.kind === 'pass' ? Math.sin(u * Math.PI) * L * 0.08 : 0;
        pts.push([x0 + ux * L * u - uy * (wv + bow), y0 + uy * L * u + ux * (wv + bow)]);
      }
      if (a.kind === 'pass') ctx.setLineDash([4, 3.5]);
      wobblyPath(ctx, pts, rnd, 0.6); ctx.stroke(); ctx.setLineDash([]);
      if (frac > 0.95) {
        var e = pts[pts.length - 1], p = pts[pts.length - 2], ax = e[0] - p[0], ay = e[1] - p[1], al = Math.hypot(ax, ay) || 1, h = 5.5;
        ax /= al; ay /= al;
        ctx.beginPath(); ctx.moveTo(e[0] - ax * h - ay * h * 0.6, e[1] - ay * h + ax * h * 0.6); ctx.lineTo(e[0], e[1]);
        ctx.lineTo(e[0] - ax * h + ay * h * 0.6, e[1] - ay * h - ax * h * 0.6); ctx.stroke();
      }
      ctx.restore();
    },
    frame: function (ctx, g, sc, th, cache) {
      var dark = th === 'dark', I = this.ink(th), P = prep(g, sc), self = this, t = sc.t || 0;
      var R = rng(Math.floor(t * 12)); /* chalk shimmers a little, 12 times a second */
      ctx.drawImage(cache.pitch, 0, 0, g.w, g.h);
      netFlash(ctx, g, sc.goal, dark ? 'rgba(247,229,138,0.9)' : 'rgba(208,64,47,0.55)');
      /* recent passes stay drawn on the board for two seconds */
      (sc.passes || []).forEach(function (ps) {
        var al = ps.age < 0 ? 0.85 : 0.85 * (1 - ps.age / 2.2); if (al <= 0) return;
        ctx.save(); ctx.globalAlpha = al; ctx.setLineDash([3, 4]); ctx.lineCap = 'round';
        ctx.strokeStyle = dark ? '#e8efe6' : '#555c58'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(g.X(ps.a.x), g.Y(ps.a.y)); ctx.lineTo(g.X(ps.b.x), g.Y(ps.b.y)); ctx.stroke(); ctx.restore();
      });
      P.back.forEach(function (q) { self.magnet(ctx, g, q, dark, P.fa, true); });
      P.front.forEach(function (q) { self.magnet(ctx, g, q, dark, P.fa, false); });
      /* the ball: a small white magnet */
      var br = Math.max(2.8, g.r * 0.42), A = ballAt(g, sc, br), z = sc.ball.z || 0;
      if (z > 0.2) { ctx.fillStyle = dark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.2)'; ellipse(ctx, A.gx, A.gy + 1, br, br * 0.7); ctx.fill(); }
      circle(ctx, A.bx, A.by, br * (1 + z * 0.05)); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = '#111'; ctx.stroke();
      /* chalk marks for the moment, drawn on over its first second */
      P.front.forEach(function (q) {
        if (q.st === 'carrier') self.ring(ctx, q.sx, q.sy, g.r + 3.5, I.mark, 2, R, P.fa > 0 ? clamp(sc.freeze.progress * 5, 0.15, 1) : 1, false);
        else if (q.st === 'actor') self.ring(ctx, q.sx, q.sy, g.r + 2.6, dark ? 'rgba(232,239,230,0.85)' : 'rgba(47,107,79,0.85)', 1.3, R, clamp(sc.freeze.progress * 5 - 0.3, 0, 1), true);
        else if (q.st === 'beaten') {
          ctx.save(); ctx.strokeStyle = I.mark; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
          var cx = q.sx + g.r * 1.1, cy = q.sy + g.r * 0.9, h = g.r * 0.45;
          ctx.beginPath(); ctx.moveTo(cx - h, cy - h); ctx.lineTo(cx + h, cy + h); ctx.moveTo(cx + h, cy - h); ctx.lineTo(cx - h, cy + h); ctx.stroke(); ctx.restore();
        }
      });
      if (P.fa > 0 && sc.freeze.arrows) {
        ctx.globalAlpha = P.fa;
        sc.freeze.arrows.forEach(function (a, i) { var f = clamp(sc.freeze.progress * 4 - 0.4 - i * 0.35, 0, 1); if (f > 0) self.arrow(ctx, g, a, I.mark, f, R, dark); });
        ctx.globalAlpha = 1;
      }
      /* art2: m1's name tags (scene.label on the man on the ball at every
       * moment, scene.label2 on a second man), written on the board in the
       * same hand as art1's frozen-moment label, on a board-coloured patch
       * so the chalk stays readable over the lines */
      tags(ctx, g, sc, P, 0, function (q, text, second) {
        sideTag(ctx, g, q.sx, q.sy, g.r + 3, text, dark ? 'rgba(31,45,37,0.9)' : 'rgba(246,246,242,0.92)',
          second ? (dark ? '#e8efe6' : '#2f3a36') : I.mark, second ? null : I.mark, '700 13px ' + HAND, others(g, sc, q.p.id));
      });
    }
  };

  var STYLES = { broadcast: broadcast, tabletop: tabletop, pixel: pixel, tactics: tactics };

  function systemTheme() {
    try { return root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; }
  }

  function create(canvas, opts) {
    opts = opts || {};
    var st = STYLES[opts.style] || broadcast, theme = opts.theme || 'auto', width = opts.width || 360, g, cache, ctx = canvas.getContext('2d');
    var dpr = Math.max(1, Math.min(2, root.devicePixelRatio || 1));
    function th() { return theme === 'auto' ? systemTheme() : theme; }
    function layout() {
      g = st.geo ? st.geo(width) : geometry(width);
      canvas.width = Math.round(g.w * dpr); canvas.height = Math.round(g.h * dpr);
      canvas.style.width = g.w + 'px'; canvas.style.height = g.h + 'px';
      cache = null;
    }
    layout();
    var api = {
      draw: function (scene) {
        var T = th();
        if (!cache || cache.theme !== T) { cache = { theme: T, dpr: dpr }; st.prepare(g, T, cache); }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        st.frame(ctx, g, scene, T, cache);
        if (scene.fade > 0) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = clamp(scene.fade, 0, 1); ctx.fillStyle = st.bg(T); ctx.fillRect(0, 0, g.w, g.h); ctx.globalAlpha = 1; }
      },
      resize: function (w) { width = w; layout(); },
      setStyle: function (id) { st = STYLES[id] || st; layout(); },
      setTheme: function (t) { theme = t; cache = null; },
      toScreen: function (x, y) { return { x: g.X(x), y: g.Y(y) }; },
      geometry: function () { return g; },
      style: function () { return st.id; }
    };
    return api;
  }

  var api = {
    create: create, geometry: geometry, KITS: KITS, MARKINGS: MARK,
    styles: Object.keys(STYLES).map(function (k) { return { id: k, name: STYLES[k].name, blurb: STYLES[k].blurb }; })
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CanteraPitch = api;
})(typeof window !== 'undefined' ? window : globalThis);
