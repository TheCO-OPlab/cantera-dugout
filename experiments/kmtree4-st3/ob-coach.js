/* ob1: THE FIRST MATCH TEACHES BY DOING (piece 1 of the first-time study).
 *
 * Three beats, each shown once, in the first match only:
 *   1. freeze  the first time play stops: everything is dimmed except the
 *              man on the ball and one card. "The match stops when it
 *              matters. Pick what Rodri does."
 *   2. dice    the first roll: the sequence holds on the dice, each die is
 *              labelled, and a ruler under them shows the rule (win by 4 or
 *              more, 0 to 3, lose) with a marker where this roll landed.
 *   3. ball    the first result: the sequence holds once the ball has
 *              moved, and a ring on the pitch points at where it went.
 * Each beat has "Got it" and "Skip the tutorial". Seen beats are remembered
 * (localStorage, in try/catch: a private window simply sees them again).
 * ?tutorial=1 forces all three, ?tutorial=0 turns them off.
 *
 * Nothing here reads or changes the match. It draws on top of the page:
 * one fixed layer with a dimmed mask that has holes cut in it, and one
 * bubble. The page asks: KMObCoach.due(beat), then KMObCoach.show(...).
 * While a beat is open, the page's sequence is held; "Got it" calls the
 * resume function the page passed in. */
(function (root) {
  'use strict';
  var KEY = 'cantera-ob1-coach';
  var BEATS = ['freeze', 'dice', 'ball'];
  var mode = (function () {
    try {
      var m = /[?&]tutorial=([01])\b/.exec(window.location.search || '');
      return m ? (m[1] === '1' ? 'force' : 'off') : 'auto';
    } catch (e) { return 'auto'; }
  })();
  var seen = {};
  if (mode === 'auto') {
    try { seen = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { seen = {}; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) { } }
  function due(beat) { return mode !== 'off' && !seen[beat]; }
  function markSeen(beat) { seen[beat] = 1; save(); }
  function skipAll() { BEATS.forEach(function (b) { seen[b] = 1; }); save(); }
  function reset() { seen = {}; try { localStorage.removeItem(KEY); } catch (e) { } }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var cur = null; /* { beat, layer, bubble, targets(), place, onDone, listeners } */

  /* The dim layer: an SVG over the whole window, a mask with a hole for
   * each target. Targets are functions returning a screen rectangle (or
   * null), so the holes follow scrolling and resizing. */
  function holesSVG(rects) {
    var w = window.innerWidth, h = window.innerHeight;
    var cut = '', ring = '';
    rects.forEach(function (r) {
      if (!r) return;
      if (r.circle) {
        cut += '<circle cx="' + r.cx + '" cy="' + r.cy + '" r="' + r.r + '" fill="#000"/>';
        ring += '<circle class="obc-ring" cx="' + r.cx + '" cy="' + r.cy + '" r="' + (r.r + 3) + '"/>';
      } else {
        var p = r.pad == null ? 6 : r.pad;
        cut += '<rect x="' + (r.left - p) + '" y="' + (r.top - p) + '" width="' + (r.width + 2 * p) + '" height="' + (r.height + 2 * p) + '" rx="12" fill="#000"/>';
        ring += '<rect class="obc-ring" x="' + (r.left - p - 2) + '" y="' + (r.top - p - 2) + '" width="' + (r.width + 2 * p + 4) + '" height="' + (r.height + 2 * p + 4) + '" rx="13"/>';
      }
    });
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
      '<defs><mask id="obcmask"><rect width="' + w + '" height="' + h + '" fill="#fff"/>' + cut + '</mask></defs>' +
      '<rect class="obc-dim" width="' + w + '" height="' + h + '" mask="url(#obcmask)"/>' + ring + '</svg>';
  }

  /* where the bubble goes: beside, below or above the anchor, whichever
   * fits first in the order asked; on a narrow screen, pinned to the bottom
   * or the top of the window, away from the anchor */
  function place(b, a, order) {
    var vw = window.innerWidth, vh = window.innerHeight, m = 12;
    var bw = b.offsetWidth, bh = b.offsetHeight;
    var spots = {
      left: a && { left: a.left - bw - 18, top: a.top + Math.min(24, a.height / 2) - 18 },
      right: a && { left: a.right + 18, top: a.top + Math.min(24, a.height / 2) - 18 },
      below: a && { left: a.left + a.width / 2 - bw / 2, top: a.bottom + 16 },
      above: a && { left: a.left + a.width / 2 - bw / 2, top: a.top - bh - 16 }
    };
    var pick = null, side = null;
    if (a && vw >= 700) {
      (order || ['below', 'above', 'left', 'right']).some(function (k) {
        var s = spots[k];
        if (!s) return false;
        var l = Math.max(m, Math.min(vw - bw - m, s.left)), t = Math.max(m, Math.min(vh - bh - m, s.top));
        /* it fits when clamping moved it little and it does not cover the anchor */
        var overlaps = !(l + bw <= a.left - 4 || l >= a.right + 4 || t + bh <= a.top - 4 || t >= a.bottom + 4);
        if (!overlaps && Math.abs(l - s.left) < 60 && Math.abs(t - s.top) < 200) { pick = { left: l, top: t }; side = k; return true; }
        return false;
      });
    }
    if (!pick) {
      /* narrow, or nothing fitted: the half of the window the anchor is not in */
      var top = a && a.top + a.height / 2 > vh / 2 ? m : vh - bh - m;
      pick = { left: Math.max(m, (vw - bw) / 2), top: top };
      side = 'pinned';
    }
    b.style.left = Math.round(pick.left) + 'px';
    b.style.top = Math.round(pick.top) + 'px';
    b.setAttribute('data-side', side);
  }

  function redraw() {
    if (!cur) return;
    var rects = cur.targets().filter(function (r) { return !!r; });
    cur.layer.innerHTML = holesSVG(rects);
    var a = cur.anchor ? cur.anchor() : rects[rects.length - 1];
    place(cur.bubble, a, cur.order);
    if (cur.after) cur.after();
  }

  /* opts: beat, text (HTML allowed, built by the caller from escaped
   * parts), extra (HTML under the text), targets() -> rects, anchor() ->
   * rect, order, button label, onDone(skipped), blockClicks */
  function show(opts) {
    close(false);
    var layer = document.createElement('div');
    layer.className = 'obc-layer' + (opts.blockClicks ? ' block' : '');
    var b = document.createElement('div');
    b.className = 'obc-bubble obc-' + opts.beat;
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-live', 'polite');
    b.innerHTML = '<p class="obc-step">' + (BEATS.indexOf(opts.beat) + 1) + ' of 3</p>' +
      '<p class="obc-text">' + opts.text + '</p>' + (opts.extra || '') +
      '<p class="obc-btns"><button class="go sm obc-ok" id="obcok">' + esc(opts.button || 'Got it') + '</button>' +
      '<button class="obc-skip" id="obcskip">Skip the tutorial</button></p>';
    document.body.appendChild(layer);
    document.body.appendChild(b);
    cur = { beat: opts.beat, layer: layer, bubble: b, targets: opts.targets || function () { return []; },
      anchor: opts.anchor || null, order: opts.order, onDone: opts.onDone || null };
    var re = function () { redraw(); };
    cur.re = re;
    window.addEventListener('resize', re);
    window.addEventListener('scroll', re, true);
    b.querySelector('#obcok').onclick = function (e) {
      if (e) e.stopPropagation();
      /* a beat may take a first press for itself (on a phone: scroll to the cards) */
      if (opts.onOk && opts.onOk(b) === 'stay') return;
      close(true, false);
    };
    b.querySelector('#obcskip').onclick = function (e) { if (e) e.stopPropagation(); skipAll(); close(true, true); };
    redraw();
    /* the layout can still settle (fonts, the cards fading in): once more */
    setTimeout(redraw, 60); setTimeout(redraw, 400);
    try { b.querySelector('#obcok').focus({ preventScroll: true }); } catch (e) { }
    markSeen(opts.beat);
  }

  /* done: run the beat's onDone (which resumes the page) */
  function close(done, skipped) {
    if (!cur) return;
    var c = cur;
    cur = null;
    window.removeEventListener('resize', c.re);
    window.removeEventListener('scroll', c.re, true);
    try { c.layer.parentNode.removeChild(c.layer); c.bubble.parentNode.removeChild(c.bubble); } catch (e) { }
    (c.extras || []).forEach(function (x) { try { x.parentNode.removeChild(x); } catch (e) { } });
    if (done && c.onDone) c.onDone(!!skipped);
  }
  function open() { return cur ? cur.beat : null; }
  function inBubble(el) {
    for (var n = el; n; n = n.parentNode) if (n.classList && n.classList.contains('obc-bubble')) return true;
    return false;
  }
  /* Enter or Space is "Got it", Escape skips the tutorial */
  try {
    window.addEventListener('keydown', function (e) {
      if (!cur) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); skipAll(); close(true, true); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); close(true, false); }
    }, true);
  } catch (e) { }

  /* -------------------------------------------------- the three beats */
  function rectOf(el) { if (!el || !el.getBoundingClientRect) return null; var r = el.getBoundingClientRect(); return r.width || r.height ? r : null; }
  /* a pitch point (metres) on the screen */
  function pitchPoint(svg, x, y) {
    try {
      var m = svg.getScreenCTM(), p = svg.createSVGPoint();
      p.x = x; p.y = 105 - y;
      var q = p.matrixTransform(m);
      return { x: q.x, y: q.y, scale: m.a };
    } catch (e) { return null; }
  }

  /* Beat 1. The ring on the man with the ball is the pitch's own; the
   * card is the first one you can pick. */
  function freeze(o) {
    var name = esc(o.carrier || 'your player');
    /* the card is under the bottom of the window (a phone) */
    var below = function () {
      if (o.scrolled) return false;
      var r = rectOf(o.card && o.card());
      return !!(r && r.top > window.innerHeight - 40);
    };
    show({
      beat: 'freeze',
      text: 'The match stops when it matters. ' + (o.defending && o.theirMan
        ? esc(o.theirMan) + ' has the ball. <b>Pick how ' + name + ' stops him.</b>'
        : '<b>Pick what ' + name + ' does.</b>'),
      extra: '<p class="obc-sub">Each card is one thing ' + name + ' can try. Pick one and the match goes on.</p>',
      button: below() ? 'Show me the cards' : 'Got it',
      /* on a phone the cards are under the pitch: the first press scrolls
       * down to them, the second closes the beat */
      onOk: function (bub) {
        if (!below()) return;
        var c = o.card && o.card();
        try { c.scrollIntoView({ block: 'end', behavior: 'auto' }); } catch (e) { try { c.scrollIntoView(false); } catch (e2) { } }
        var ok = bub.querySelector('#obcok'); if (ok) ok.textContent = 'Got it';
        o.scrolled = true;
        return 'stay';
      },
      /* lay1: the bubble goes under the card (the cards' column), so it covers neither the pitch in the
       * middle nor the commentator, whose words say what the situation is: they stay lit */
      order: ['below', 'left', 'above'],
      targets: function () {
        var ring = document.getElementById('pring'), rr = rectOf(ring);
        var c = rr ? { circle: true, cx: rr.left + rr.width / 2, cy: rr.top + rr.height / 2, r: Math.max(26, rr.width * 1.4) } : null;
        return [c, rectOf(document.querySelector('#commbox .bubble')), rectOf(o.card && o.card())];
      },
      anchor: function () { return rectOf(o.card && o.card()); },
      onDone: o.onDone
    });
  }

  /* Beat 2. The two dice are labelled on the dice, and the rule is a
   * ruler of margins with a marker at this roll. d: ev.dice; names. */
  function ruler(diff) {
    var lo = -6, hi = 9, span = hi - lo;
    var at = Math.max(lo, Math.min(hi, diff));
    var pct = function (v) { return ((v - lo) / span * 100).toFixed(2) + '%'; };
    return '<div class="obc-ruler" aria-label="Win by 4 or more: a clean win. Win by 0 to 3: half a win. Lose: it goes their way.">' +
      '<div class="obc-bands"><span class="b bad" style="width:' + pct(-0.5) + '">They win</span>' +
      '<span class="b half" style="width:calc(' + pct(3.5) + ' - ' + pct(-0.5) + ')">Half win<small>by 0 to 3</small></span>' +
      '<span class="b good" style="width:calc(100% - ' + pct(3.5) + ')">Clean win<small>by 4 or more</small></span></div>' +
      '<div class="obc-mark" style="left:' + pct(at) + '"><span>' + (diff > 0 ? '+' : '') + diff + '</span></div></div>';
  }
  function dice(o) {
    var d = o.dice, me = esc(o.me), them = esc(o.them);
    var word = d.diff >= 4 ? 'a clean win' : d.diff >= 0 ? 'half a win' : 'a loss for you';
    show({
      beat: 'dice',
      text: 'Each player adds <b>one die</b> to his number. The bigger total wins.',
      extra: '<p class="obc-sum"><span class="c-you">' + me + ' ' + d.mineTotal + '</span> against <span class="c-them">' + them + ' ' + d.themTotal +
        '</span>: ' + (d.diff >= 0 ? me + ' by ' + d.diff : them + ' by ' + (-d.diff)) + ', ' + word + '.</p>' + ruler(d.diff),
      button: 'Got it, play on',
      order: ['below', 'right', 'above'],
      blockClicks: true,
      targets: function () {
        var box = document.querySelector('#result .dice');
        return [rectOf(box)];
      },
      anchor: function () { return rectOf(document.querySelector('#result .dice')); },
      onDone: o.onDone
    });
    /* the labels on the dice themselves */
    labelDice(o);
  }
  /* the labels sit in the coach layer (above the dim), one on each side of
   * the dice, each pointing at its die */
  function labelDice(o) {
    if (!cur || cur.beat !== 'dice') return;
    var dies = document.querySelectorAll('#result .die');
    if (dies.length < 2) return;
    var mk = function (side, text) {
      var t = document.createElement('span');
      t.className = 'obc-dlab ' + side;
      t.textContent = text;
      document.body.appendChild(t);
      return t;
    };
    var a = mk('you', o.me + ': ' + (o.meStat ? o.meStat + ' ' : '') + (o.dice.mineTotal - o.dice.mine) + ' + this die');
    var b = mk('them', o.them + ': ' + (o.themStat ? o.themStat + ' ' : '') + (o.dice.themTotal - o.dice.theirs) + ' + this die');
    cur.extras = [a, b];
    var pos = function () {
      var r0 = dies[0].getBoundingClientRect(), r1 = dies[1].getBoundingClientRect();
      var box = document.querySelector('#result .dice'), rb = box ? box.getBoundingClientRect() : r0;
      var vw = window.innerWidth;
      var sideways = rb.left - a.offsetWidth - 24 >= 4 && rb.right + b.offsetWidth + 24 <= vw - 4;
      if (sideways) {
        /* beside the dice: yours on the left pointing right, theirs on the right */
        a.className = 'obc-dlab you'; b.className = 'obc-dlab them';
        a.style.top = Math.round(r0.top + r0.height / 2) + 'px'; a.style.left = Math.round(rb.left - 16) + 'px';
        b.style.top = Math.round(r1.top + r1.height / 2) + 'px'; b.style.left = Math.round(rb.right + 16) + 'px';
        a.style.removeProperty('--ax'); b.style.removeProperty('--ax');
        return;
      }
      /* a narrow screen: yours above your die, theirs below theirs, kept on screen */
      [[a, r0, 'up', r0.top - 10], [b, r1, 'down', r1.bottom + 10]].forEach(function (x) {
        var el = x[0], r = x[1], cx = r.left + r.width / 2, w = el.offsetWidth;
        var l = Math.max(6, Math.min(vw - w - 6, cx - w / 2));
        el.className = 'obc-dlab ' + x[2];
        el.style.left = Math.round(l) + 'px';
        el.style.top = Math.round(x[3]) + 'px';
        el.style.setProperty('--ax', Math.round(cx - l) + 'px');
      });
    };
    cur.after = pos;
    pos();
  }

  /* Beat 3. The ring goes where the ball is now. o.ball: {x, y} in metres. */
  function ball(o) {
    show({
      beat: 'ball',
      text: 'The result moves the ball. <b>' + esc(o.where) + '</b>',
      extra: '<p class="obc-sub">' + esc(o.then || 'Then the match goes on to the next moment.') + '</p>',
      button: 'Play on',
      order: ['right', 'left', 'below', 'above'],
      targets: function () {
        var svg = document.getElementById('pitch'), q = svg && o.ball ? pitchPoint(svg, o.ball.x, o.ball.y) : null;
        return [q ? { circle: true, cx: q.x, cy: q.y, r: Math.max(24, 7 * q.scale) } : null];
      },
      anchor: function () {
        var svg = document.getElementById('pitch'), q = svg && o.ball ? pitchPoint(svg, o.ball.x, o.ball.y) : null;
        if (!q) return rectOf(svg);
        var r = Math.max(24, 7 * q.scale);
        return { left: q.x - r, right: q.x + r, top: q.y - r, bottom: q.y + r, width: 2 * r, height: 2 * r };
      },
      onDone: o.onDone
    });
  }

  var API = { due: due, show: show, close: close, open: open, inBubble: inBubble, skipAll: skipAll, reset: reset,
    freeze: freeze, dice: dice, ball: ball, ruler: ruler, mode: function () { return mode; }, BEATS: BEATS };
  root.KMObCoach = API;
})(typeof window !== 'undefined' ? window : globalThis);
