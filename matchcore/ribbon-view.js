/* rib1: THE MOMENTUM RIBBON, drawn. Returns SVG markup (a string), so it
 * runs in node for the tests as well as in the page.
 *
 *   KMRibbonView.svg(series, marks, opts) -> '<svg ...>'
 *   KMRibbonView.CSS                        -> the stylesheet (add once)
 *
 * opts: orient 'v' (beside the pitch) or 'h' (under it); length (px along
 * time, the pitch's height for 'v', its width for 'h'); thick (px across,
 * default 60); minutes (default 90); now (the match minute the clock
 * shows, or null at full time); head ({y} where the ball is now, from
 * KMRibbon.head); clock (true: minute ticks and the running clock);
 * gutter (px for the goal labels on each side; 0 hides them).
 *
 * THE READING
 *   - One row per match minute. The bar starts at the halfway line (the
 *     neutral midline) and ends where the ball was on average that minute;
 *     it takes the colour of the team that had the ball. A long bar towards
 *     their goal in your colour is you attacking; a long bar towards your
 *     goal in their colour is them attacking.
 *   - Vertical: time runs top to bottom (kick-off at the top, the newest
 *     minute at the bottom, next to the running clock), and your goal is on
 *     the left, theirs on the right: the ball's position is read left to
 *     right like a progress bar. Horizontal: time runs left to right and up
 *     is towards their goal, as on the pitch above it.
 *     A bar is drawn full strength when the team on the ball is in the
 *     other team's half, and pale when it keeps the ball in its own half,
 *     so the full-strength colour on each side says who was attacking
 *     (opts.flat draws every bar full strength).
 *   - A ring is a moment, where the ball was when the play stopped for you;
 *     a thin line from it goes to where the result left the ball. A goal is
 *     a filled dot on the goal line with the scorer and minute beside it.
 *   - Faint bands are the two penalty boxes; a dashed rule is half time.
 * Colours are CSS variables: --kit-you/--kit-them (m2's kit colours, set
 * per team on <body>) for the bars, --you/--them (m2's text colours) for
 * the goal labels, with m2's random-squad blue and orange as fallbacks.
 *
 * m4: opts.compact (the stats row under the pitch in the play build): no
 * minute ticks, the goal labels in a 10 px line above (yours) and below
 * (theirs) the ribbon, at 9 px, and the side labels shortened. The reading
 * is unchanged. m5: no side labels at all in the compact row (the word
 * ceiling at the first decision); opts.side can then be a few px.
 */
(function (root) {
  'use strict';
  var L = 105;
  var CSS = [
    '.rb{--rb-you:var(--kit-you,#1f5fbf);--rb-them:var(--kit-them,#f0a030);',
    '  --rb-you-ink:var(--you,#1f5fbf);--rb-them-ink:var(--them,#a85a06);',
    '  --rb-bg:var(--surface-2,#eef1ea);--rb-box:color-mix(in srgb,var(--ink,#12160f) 6%,transparent);',
    '  --rb-mid:color-mix(in srgb,var(--ink,#12160f) 55%,transparent);--rb-ink:var(--ink,#12160f);',
    '  --rb-muted:var(--muted,#868c7c);--rb-surface:var(--surface,#fff);display:block;overflow:visible}',
    '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .rb{--rb-you:var(--kit-you,#4c86e0);--rb-them:var(--kit-them,#d07a30);',
    '  --rb-you-ink:var(--you,#6fa3f0);--rb-them-ink:var(--them,#e39a4a)}}',
    ':root[data-theme="dark"] .rb{--rb-you:var(--kit-you,#4c86e0);--rb-them:var(--kit-them,#d07a30);--rb-you-ink:var(--you,#6fa3f0);--rb-them-ink:var(--them,#e39a4a)}',
    '.rb .bg{fill:var(--rb-bg)} .rb .box{fill:var(--rb-box)}',
    '.rb .mid{stroke:var(--rb-mid);stroke-width:1} .rb .ht{stroke:var(--rb-muted);stroke-width:1;stroke-dasharray:2 2}',
    '.rb .you{fill:var(--rb-you)} .rb .them{fill:var(--rb-them)} .rb .own{fill-opacity:.38}',
    '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .rb .own{fill-opacity:.5}} :root[data-theme="dark"] .rb .own{fill-opacity:.5}',
    '.rb text{font:600 9.5px ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif;fill:var(--rb-muted);font-variant-numeric:tabular-nums}',
    '.rb text.side{font-weight:700;font-size:9px;letter-spacing:.02em}',
    '.rb text.now{font:800 11px ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif;fill:var(--rb-ink)}',
    '.rb.rb-c text.gl{font-size:9px} .rb.rb-c text.side{font-size:8.5px}',   /* m4: the compact row */
    '.rb text.gl{font:700 10px ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif}',
    '.rb text.gl.you{fill:var(--rb-you-ink)} .rb text.gl.them{fill:var(--rb-them-ink)}',
    '.rb .ring{fill:var(--rb-surface);stroke:var(--rb-ink);stroke-width:1.4}',
    '.rb .reach{stroke:var(--rb-ink);stroke-width:1.2;opacity:.75}',
    '.rb .goal{stroke:var(--rb-ink);stroke-width:1.3}',
    '.rb .lead{stroke:var(--rb-muted);stroke-width:.8}',
    '.rb .headball{fill:#fff;stroke:var(--rb-ink);stroke-width:1.5}',
    '.rb .nowline{stroke:var(--rb-ink);stroke-width:1;opacity:.5}'
  ].join('\n');

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function f1(v) { return Math.round(v * 10) / 10; }

  /* the geometry: a point (minute, ball y) -> screen px, both orientations */
  function frame(o) {
    var V = o.orient !== 'h';
    var g = o.gutter, top = o.top, len = o.length, th = o.thick, n = o.minutes, step = len / n;
    if (V) {
      var x0 = g;
      return { V: true, step: step, t0: top, len: len, a0: x0, a1: x0 + th,
        T: function (m) { return top + m * step; },
        A: function (y) { return x0 + (y / L) * th; },
        W: g + th + g, H: top + len + (o.clock ? 12 : 4) };
    }
    var left = o.side, y0 = top;
    return { V: false, step: step, t0: left, len: len, a0: y0 + th, a1: y0,
      T: function (m) { return left + m * step; },
      A: function (y) { return y0 + (1 - y / L) * th; },
      W: left + len + 8, H: y0 + th + g + (o.below || 0) };
  }
  /* a rectangle from time t0..t1 and across a0..a1, in either orientation */
  function rect(F, t0, t1, a0, a1, cls) {
    var tl = Math.min(t0, t1), tw = Math.abs(t1 - t0), al = Math.min(a0, a1), aw = Math.abs(a1 - a0);
    return F.V ? '<rect class="' + cls + '" x="' + f1(al) + '" y="' + f1(tl) + '" width="' + f1(aw) + '" height="' + f1(tw) + '"/>'
      : '<rect class="' + cls + '" x="' + f1(tl) + '" y="' + f1(al) + '" width="' + f1(tw) + '" height="' + f1(aw) + '"/>';
  }
  function pt(F, m, y) { return F.V ? { x: F.A(y), y: F.T(m) } : { x: F.T(m), y: F.A(y) }; }
  function line(F, m0, y0, m1, y1, cls) {
    var a = pt(F, m0, y0), b = pt(F, m1, y1);
    return '<line class="' + cls + '" x1="' + f1(a.x) + '" y1="' + f1(a.y) + '" x2="' + f1(b.x) + '" y2="' + f1(b.y) + '"/>';
  }
  function text(x, y, s, cls, anchor) {
    return '<text' + (cls ? ' class="' + cls + '"' : '') + ' x="' + f1(x) + '" y="' + f1(y) + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(s) + '</text>';
  }

  function svg(series, marks, opts) {
    opts = opts || {};
    var o = {
      orient: opts.orient === 'h' ? 'h' : 'v',
      thick: opts.thick || 60,
      minutes: opts.minutes || (series && series.length) || 90,
      clock: opts.clock !== false,
      now: typeof opts.now === 'number' ? opts.now : null,
      head: opts.head || null,
      compact: !!opts.compact   // m4
    };
    if (o.compact) o.clock = false;   // m4: the clock is the header's
    o.gutter = typeof opts.gutter === 'number' ? opts.gutter : (o.orient === 'v' ? 62 : 22);
    o.length = opts.length || (o.orient === 'v' ? 540 : 400);
    o.side = o.orient === 'h' ? (typeof opts.side === 'number' ? opts.side : 56) : 0;
    /* the goal labels, placed first: under the pitch they stack in lines
     * when two would overlap, and the gutters grow to fit */
    var labels = [], lines = { you: 1, them: 1 };
    (marks || []).forEach(function (k) {
      if (k.goal && k.y !== null && k.minute < (o.minutes + 0.001)) labels.push({ m: k.minute + 0.5, goal: k.goal, s: (k.scorer ? k.scorer + ' ' : 'Goal ') + k.minute + "'", line: 0 });
    });
    if (o.orient === 'h') {
      var stp = o.length / o.minutes;
      /* m5: on a narrow ribbon (a phone: under 4.2 px a minute) a goal is
       * labelled with its minute only; the scorers are named beside the
       * score and on the tiles, and names stacked three deep there */
      if (stp < 4.2) labels.forEach(function (l) { l.s = Math.floor(l.m) + "'"; l.short = true; });
      var right = o.side + o.length + (o.compact ? 4 : 8);
      ['you', 'them'].forEach(function (team) {
        var ends = [];
        labels.filter(function (l) { return l.goal === team; }).forEach(function (l) {
          var w = l.s.length * (o.compact ? 5 : 5.6) + 6, x0 = o.side + l.m * stp - (o.compact ? -4 : w / 2), j = 0;   // m4: compact labels start right of the dot
          /* m5: a compact label that would run past the ribbon's right end sits left of its dot instead */
          if (o.compact && x0 + w > o.side + o.length + 4) { l.flip = true; x0 = o.side + l.m * stp - 4 - w; }
          /* m5: a centred label near the right end is pushed left to fit (the full-time card on a phone cut "Alvarez 86'") */
          if (!o.compact && x0 + w > right) { l.dx = right - (x0 + w); x0 = right - w; }
          while (j < ends.length && ends[j] > x0) j++;
          ends[j] = x0 + w; l.line = j;
        });
        lines[team] = Math.max(1, ends.length);
      });
    }
    var LH = o.compact ? 10 : 11;   // m4: a compact label line is 10 px
    o.top = o.orient === 'v' ? 16 : o.gutter + (lines.you - 1) * LH;
    o.below = o.orient === 'h' ? (lines.them - 1) * LH : 0;
    var F = frame(o), out = [];
    var n = o.minutes, gap = F.step > 4 ? 1 : F.step > 2.5 ? 0.5 : 0;
    var endT = F.T(n);

    /* the ground: the ribbon, the two boxes, the halfway line, half time */
    out.push(rect(F, F.T(0), endT, F.A(0), F.A(L), 'bg'));
    out.push(rect(F, F.T(0), endT, F.A(0), F.A(16.5), 'box'));
    out.push(rect(F, F.T(0), endT, F.A(88.5), F.A(L), 'box'));

    /* the bars: one per minute, from the halfway line to the ball */
    var mid = F.A(L / 2);
    (series || []).forEach(function (r) {
      if (r.y === null || r.m >= n) return;
      var t0 = F.T(r.m), t1 = t0 + Math.max(0.6, (F.step - gap) * Math.min(1, r.cover));
      var a = F.A(r.y);
      if (Math.abs(a - mid) < 1) a = mid + (r.y >= L / 2 ? 1 : -1) * (F.V ? 1 : -1);
      /* full strength when the team on the ball is in the other half (it is
       * attacking), pale when it keeps the ball in its own half */
      var tm = r.team === 'them' ? 'them' : 'you';
      var attacking = tm === 'you' ? r.y >= L / 2 : r.y < L / 2;
      out.push(rect(F, t0, t1, mid, a, tm + (attacking || opts.flat ? '' : ' own')));
    });
    out.push(line(F, 0, L / 2, n, L / 2, 'mid'));
    if (n >= 46) out.push(line(F, 45, 0, 45, L, 'ht'));

    /* where the ball is now, and the running clock */
    var nowM = o.now;
    if (nowM !== null && o.head && typeof o.head.y === 'number') {
      var hp = pt(F, Math.min(n, nowM), o.head.y);
      out.push(line(F, Math.min(n, nowM), 0, Math.min(n, nowM), L, 'nowline'));
      out.push('<circle class="headball" cx="' + f1(hp.x) + '" cy="' + f1(hp.y) + '" r="3.6"/>');
    }

    /* the moments: a ring where the play stopped, a line to where the
     * result left the ball, a filled dot and a label for a goal */
    (marks || []).forEach(function (k) {
      if (k.minute >= n + 0.001 || k.y === null) return;
      var mm = k.minute + 0.5;
      if (typeof k.endY === 'number' && Math.abs(k.endY - k.y) > 2) out.push(line(F, mm, k.y, mm, k.endY, 'reach'));
      var c = pt(F, mm, k.y);
      out.push('<circle class="ring" cx="' + f1(c.x) + '" cy="' + f1(c.y) + '" r="3.4"><title>' + esc(k.minute + "' " + (k.label || '')) + '</title></circle>');
      if (k.goal) {
        var gy = k.goal === 'you' ? L : 0, gp = pt(F, mm, gy);
        out.push('<circle class="goal ' + k.goal + '" cx="' + f1(gp.x) + '" cy="' + f1(gp.y) + '" r="4.6"/>');
      }
    });
    /* goal labels: yours beside their goal, theirs beside yours, nudged
     * apart when two are close */
    var G = o.gutter;
    ['you', 'them'].forEach(function (team) {
      var last = -1e9;
      labels.filter(function (l) { return l.goal === team; }).forEach(function (l) {
        if (G < (o.compact ? 9 : 20)) return;
        var edge = pt(F, l.m, team === 'you' ? L : 0), p;
        if (F.V) {
          var ty = Math.max(F.T(l.m) + 3.5, last + 11); last = ty;
          p = team === 'you' ? { x: edge.x + 6, y: ty, a: 'start' } : { x: edge.x - 6, y: ty, a: 'end' };
        } else {
          p = o.compact ? { x: edge.x + (l.flip ? -6 : 6), y: team === 'you' ? edge.y - 1.5 - l.line * LH : edge.y + 8.5 + l.line * LH, a: l.flip ? 'end' : 'start' }   // m4: beside the dot, not on it (m5: left of it near the end)
            : { x: edge.x + (l.dx || 0), y: team === 'you' ? edge.y - 7 - l.line * 11 : edge.y + 14 + l.line * 11, a: 'middle' };   // m5: l.dx
        }
        out.push(text(p.x, p.y, l.s, 'gl ' + team, p.a));
      });
    });

    /* the clock: quarter-hour ticks, and the minute now */
    if (o.clock) {
      /* (no 0' beside the ribbon: kick-off is its top, and the side label sits there) */
      var ticks = [0, 15, 30, 45, 60, 75, 90].filter(function (m) { return m <= n && (m > 0 || !F.V); });
      ticks.forEach(function (m) {
        if (nowM !== null && Math.abs(m - nowM) < (F.V ? 6 : 8)) return;
        var busy = labels.some(function (l) { return l.goal === 'you' && Math.abs(l.m - m) < (F.V ? 5 : 0); });
        if (busy) return;
        if (F.V) out.push(text(F.a1 + 5, F.T(m) + 3.5, m + "'", '', 'start'));
        else out.push(text(F.T(m), F.a0 + o.below + (G >= 20 ? 26 : 11), m + "'", '', 'middle'));
      });
      if (nowM !== null) {
        var nm = Math.floor(Math.min(n, nowM));
        if (F.V) out.push(text(F.a1 + 5, F.T(Math.min(n, nowM)) + 4, nm + "'", 'now', 'start'));
        else out.push(text(F.T(Math.min(n, nowM)), F.a0 + o.below + (G >= 20 ? 27 : 12), nm + "'", 'now', 'middle'));
      }
    }
    /* which side is which, said once */
    if (F.V) {
      out.push(text(F.a0 - 3, 10, 'Your goal', 'side', 'end'));
      out.push(text(F.a1 + 3, 10, 'Their goal', 'side', 'start'));
    } else {
      /* m5: the compact row under the pitch drops these two (the first decision
       * stays under 150 words on screen on every seed; the pitch above it says
       * THEIR GOAL and YOUR GOAL, and the row's tooltip says which way is up) */
      if (!o.compact) {
        out.push(text(o.side - 6, F.a1 + 8, 'Their goal', 'side', 'end'));
        out.push(text(o.side - 6, F.a0, 'Your goal', 'side', 'end'));
      }
      if (o.compact) out.push('<title>' + esc('Where the ball was, minute by minute. Up is their goal, down is yours. A bar in your colour above the line is you attacking; ' +
        'a pale bar is a team keeping the ball in its own half. Rings are the moments, a filled dot is a goal.') + '</title>');   // m4
    }
    var label = 'Where the ball was, minute by minute' + (marks && marks.length ? ', with ' + marks.length + ' moments' : '');
    return '<svg class="rb rb-' + o.orient + (o.compact ? ' rb-c' : '') + '" xmlns="http://www.w3.org/2000/svg" width="' + f1(F.W) + '" height="' + f1(F.H) +
      '" viewBox="0 0 ' + f1(F.W) + ' ' + f1(F.H) + '" role="img" aria-label="' + esc(label) + '">' + out.join('') + '</svg>';
  }

  var API = { svg: svg, CSS: CSS };
  root.KMRibbonView = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
