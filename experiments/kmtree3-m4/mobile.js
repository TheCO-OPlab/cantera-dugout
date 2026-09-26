/* mob1: THE PHONE. One decision fits one screen, with no scrolling.
 *
 * Portrait (up to 700 px wide): a compact header (the score with the two
 * kit colours, the counter, the minute, a Menu button); the pitch under it;
 * the commentator as a caption over the pitch (at its bottom edge, or at
 * its top when the ball is low on the screen); the cards in a sheet at the
 * bottom, in reach of a thumb. The pitch is either
 *   crop (default): as wide as the phone, so the pieces are bigger, cut to
 *     the part of the pitch round the ball (more of the pitch ahead of the
 *     team with the ball), following the ball smoothly, with a small map of
 *     the whole pitch in its corner (all 22 and the ball, and a frame for
 *     the part on screen); or
 *   full: the whole pitch, scaled to the space.
 * ?mobpitch=full or ?mobpitch=crop picks one (the choice is remembered).
 * Landscape on a phone (up to 500 px tall): the pitch on the left, whole,
 * the commentator and the cards on the right, the cards two to a row.
 *
 * The page calls KMMobile.size() when it sizes the pitch (play.html,
 * layoutPitch, marked "mobile"), KMMobile.afterLayout(g) after, and
 * KMMobile.view() when it places the duel box (so the box is always in the
 * part of the pitch on screen). It reads the pitch through
 * window.__mobPit() and arms a card's arrows through window.__mobArm(i).
 * Nothing here reads or changes the match. */
(function (root) {
  'use strict';
  var MQ_P = '(max-width: 700px)';
  var MQ_L = '(orientation: landscape) and (max-height: 500px) and (max-width: 1000px)';
  function mm(q) { try { return !!(root.matchMedia && root.matchMedia(q).matches); } catch (e) { return false; } }
  function $(id) { return document.getElementById(id); }
  function param(k) { var m = new RegExp('[?&]' + k + '=([^&]*)').exec((root.location && root.location.search) || ''); return m ? decodeURIComponent(m[1]) : null; }
  function store(k, v) { try { if (v === undefined) return root.localStorage.getItem(k); root.localStorage.setItem(k, v); } catch (e) { } return null; }

  var MODE = (function () {
    var q = param('mobpitch');
    if (q === 'crop' || q === 'full') { store('cantera-mobpitch', q); return q; }
    var s = store('cantera-mobpitch');
    return s === 'full' || s === 'crop' ? s : 'crop';
  })();
  var S = { mode: MODE, off: 0, target: 0, Hv: 0, sheet: 0, raf: 0, last: 0, capTop: false, capAt: 0, mapKey: '', kits: null, rosterRef: null, team: {} };

  function portrait() { return mm(MQ_P); }
  function landscape() { return !portrait() && mm(MQ_L); }
  function on() { return portrait() || landscape(); }
  function crop() { return portrait() && S.mode === 'crop'; }

  function classes() {
    var b = document.body;
    if (!b || !b.classList) return;
    b.classList.toggle('mob', portrait());
    b.classList.toggle('mob-land', landscape());
    b.classList.toggle('mob-crop', crop());
    b.classList.toggle('mob-full', portrait() && !crop());
  }

  /* THE SIZE OF THE PITCH on a phone. The sheet for the cards keeps a fixed
   * height for the phone (so the pitch never changes size between decisions):
   * 40% of the space under the header, between 236 and 330 px. The pitch
   * gets the rest. Returns the height and width the page's canvas pitch
   * must fit in. */
  function size() {
    classes();
    var st = $('stage'), vw = root.innerWidth || 390;
    var H = st ? st.clientHeight : (root.innerHeight || 800) - 56;
    if (landscape()) {
      S.Hv = 0; setVars(null, null);
      return { H: Math.max(200, H - 6), maxW: Math.round(vw * 0.42) };
    }
    var sheet = Math.round(Math.max(236, Math.min(330, H * 0.4)));
    var region = Math.max(200, H - sheet);
    S.sheet = sheet; S.Hv = region; S.vis = 0;
    setVars(region, sheet);
    if (crop()) return { H: 100000, maxW: vw };
    return { H: region - 6, maxW: vw - 12 };
  }
  function setVars(region, sheet) {
    var b = document.body;
    if (!b || !b.style) return;
    if (region == null) { b.style.removeProperty('--mob-ph'); b.style.removeProperty('--mob-sheet'); return; }
    b.style.setProperty('--mob-ph', region + 'px');
    b.style.setProperty('--mob-sheet', sheet + 'px');
  }
  /* after the page sized its canvas: start the crop from the ball at once */
  function afterLayout(g) {
    S.g = g || null;
    S.last = 0; S.mapKey = '';
    var pw = $('pworld');
    if (!crop()) { if (pw) pw.style.top = ''; if (on()) loop(); return; }
    var t = targetOff();
    if (t != null) { S.off = S.target = t; if (pw) pw.style.top = (-Math.round(S.off)) + 'px'; }
    loop();
  }
  /* the part of the board on screen, in the board's pixels (null: all of it) */
  function view() {
    if (!crop() || !S.Hv) return null;
    visible();
    /* the part on screen both now and where the crop is heading (it may
     * still be sliding there), 8 px in from each edge: the camera's small
     * push at a freeze can move the board a few pixels after the box is placed */
    var a = Math.min(S.off, S.target), b = Math.max(S.off, S.target);
    return { y0: b + 8, y1: a + S.vis - 8 };
  }
  /* THE PART OF THE PITCH NOT UNDER THE SHEET. The sheet keeps its height
   * for most decisions; when its cards need more (four long ones, or a card
   * opened for its details) it grows up over the pitch, and the crop, the
   * caption and the duel box work in what is left (--mob-vis). */
  function visible() {
    var c = $('cards'), st = $('stage');
    var vis = S.Hv;
    if (c && st && c.getBoundingClientRect && portrait()) {
      var top = c.getBoundingClientRect().top - st.getBoundingClientRect().top;
      if (top > 0) vis = Math.max(120, Math.min(S.Hv, Math.round(top)));
    }
    if (vis !== S.vis) { S.vis = vis; if (document.body && document.body.style) document.body.style.setProperty('--mob-vis', vis + 'px'); }
    /* the whole pitch (full): smaller, from its top, when the sheet grows over it */
    var pw = $('pwrap'), pb = $('pbox');
    if (pw && pb && portrait() && !crop()) {
      var need = pb.offsetHeight + 4, k = need > 0 && vis < need ? Math.max(0.6, vis / need) : 1;
      var tf = k < 1 ? 'scale(' + k.toFixed(3) + ')' : '';
      if (pw.style.transform !== tf) { pw.style.transformOrigin = '50% 0'; pw.style.transform = tf; }
    }
    return vis;
  }

  /* where the crop wants to be: the ball a little behind the middle, so more
   * of the pitch shows ahead of the team with the ball (at a frozen moment
   * the team the moment is for) */
  function teamOf(id, ros) {
    if (S.rosterRef !== ros) { S.rosterRef = ros; S.team = {}; (ros || []).forEach(function (r) { S.team[r.id] = r.team; }); }
    return S.team[id] || null;
  }
  function targetOff() {
    var info = root.__mobPit ? root.__mobPit() : null;
    if (!info || !info.g || !info.frame || !info.frame.ball || !S.Hv) return null;
    var g = info.g, fr = info.frame;
    var side = info.S && info.S.attacking ? info.S.attacking : fr.holder ? teamOf(fr.holder, info.roster) : null;
    var anchor = side === 'you' ? 0.6 : side === 'them' ? 0.4 : 0.5;
    var by = g.Y(Math.max(-2, Math.min(107, fr.ball.y))), vis = S.vis || S.Hv;
    return Math.max(0, Math.min(Math.max(0, g.h - vis), by - vis * anchor));
  }

  /* ------------------------------------------------ the frame loop (crop) */
  /* a frame when the browser draws one, and a timer as well, as the page's
   * own playback does, for a browser that holds frames back (a hidden tab,
   * headless Edge) */
  function now() { try { return root.performance.now(); } catch (e) { return Date.now(); } }
  function loop() {
    if (S.raf || S.to) return;
    if (root.requestAnimationFrame) S.raf = root.requestAnimationFrame(function () { tick(); });
    S.to = setTimeout(function () { S.to = 0; tick(); }, 50);
  }
  function tick() {
    if (S.raf) { try { root.cancelAnimationFrame(S.raf); } catch (e) { } S.raf = 0; }
    if (S.to) { clearTimeout(S.to); S.to = 0; }
    if (!on() || !document.body.classList.contains('inmatch')) return;
    var ts = now();
    loop();
    var info = root.__mobPit ? root.__mobPit() : null;
    if (!info) return;
    /* a new frozen moment folds the caption again */
    if (info.S !== S.lastS) { S.lastS = info.S; if (info.S) newMoment(); }
    if (portrait()) { watchSheet(); visible(); tipSpot(); }
    captionSide(info);
    if (!crop() || !info.g) return;
    var t = targetOff();
    /* while a result plays, the crop holds still (the duel box is pinned to
     * the pitch) unless the ball is about to leave what is on screen */
    var rb = $('resultbox'), boxOn = rb && rb.classList.contains('on') && !rb.classList.contains('past');
    /* ... and so does it while the duel box shows (it was placed in the part
     * on screen then; the sheet folding after a tap must not slide it away) */
    if (t != null && (info.phase === 'result' || boxOn) && info.frame && info.frame.ball) {
      var yb = info.g.Y(info.frame.ball.y) - S.target, vv = S.vis || S.Hv;
      if (yb > vv * 0.12 && yb < vv * 0.88) t = S.target;
    }
    if (t != null) {
      S.target = t;
      var dt = S.last ? Math.min(0.1, (ts - S.last) / 1000) : 1;
      var k = 1 - Math.exp(-dt * (info.phase === 'moment' ? 7 : 3.2));
      S.off += (t - S.off) * k;
      if (Math.abs(t - S.off) < 0.4) S.off = t;
    }
    S.last = ts;
    var pw = $('pworld');
    if (pw) { var top = (-Math.round(S.off)) + 'px'; if (pw.style.top !== top) pw.style.top = top; }
    drawMap(info);
  }

  /* THE SMALL MAP: the whole pitch, every player, the ball, and a frame for
   * the part of the pitch on screen */
  function kitColours() {
    if (S.kits) return S.kits;
    var cs = null; try { cs = getComputedStyle(document.body); } catch (e) { }
    var you = cs && cs.getPropertyValue('--kit-you').trim(), them = cs && cs.getPropertyValue('--kit-them').trim();
    function hex(v, d) { return /^#[0-9a-f]{3,8}$/i.test(v || '') ? v : d; }
    S.kits = { you: hex(you, '#1f5fbf'), them: hex(them, '#f0a030') };
    return S.kits;
  }
  function drawMap(info) {
    var box = $('pbox');
    if (!box) return;
    var cv = $('mobmap');
    if (!cv) {
      cv = document.createElement('canvas');
      cv.id = 'mobmap'; cv.className = 'mobmap'; cv.setAttribute('aria-hidden', 'true');
      box.appendChild(cv); S.mapKey = ''; S.kits = null;
    }
    var fr = info.frame, g = info.g;
    if (!fr || !fr.pos) return;
    var W = 54, H = Math.round(W * 105 / 68), dpr = Math.min(3, root.devicePixelRatio || 1);
    var key = Math.round(S.off) + '|' + S.vis + '|' + (fr.ball ? Math.round(fr.ball.x * 2) + ',' + Math.round(fr.ball.y * 2) : '') + '|' + (info.roster || []).map(function (r) { var q = fr.pos[r.id]; return q ? Math.round(q.x) + ',' + Math.round(q.y) : ''; }).join(';');
    if (key === S.mapKey) return;
    S.mapKey = key;
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
    var c = cv.getContext && cv.getContext('2d');
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    var sx = W / 68, sy = H / 105;
    function X(x) { return x * sx; } function Y(y) { return (105 - y) * sy; }
    c.fillStyle = 'rgba(14,52,28,.92)'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 0.8;
    c.strokeRect(0.5, 0.5, W - 1, H - 1);
    c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke();
    c.strokeRect(X(13.84), Y(105), X(40.32), 16.5 * sy);
    c.strokeRect(X(13.84), Y(16.5), X(40.32), 16.5 * sy);
    var K = kitColours();
    (info.roster || []).forEach(function (r) {
      var q = fr.pos[r.id]; if (!q) return;
      c.beginPath(); c.arc(X(q.x), Y(q.y), 1.9, 0, 6.283);
      c.fillStyle = r.team === 'you' ? K.you : K.them; c.fill();
      c.lineWidth = 0.6; c.strokeStyle = 'rgba(255,255,255,.85)'; c.stroke();
    });
    if (fr.ball) {
      c.beginPath(); c.arc(X(Math.max(0, Math.min(68, fr.ball.x))), Y(Math.max(0, Math.min(105, fr.ball.y))), 2, 0, 6.283);
      c.fillStyle = '#fff'; c.fill(); c.lineWidth = 0.8; c.strokeStyle = '#111'; c.stroke();
    }
    /* the part on screen */
    if (g && S.Hv) {
      var m0 = (S.off - g.py) / g.s, m1 = (S.off + (S.vis || S.Hv) - g.py) / g.s;   // metres from their goal line down
      var y0 = Math.max(0, m0) * sy, y1 = Math.min(105, m1) * sy;
      c.lineWidth = 1.4; c.strokeStyle = '#ffd84a';
      c.strokeRect(1, Math.max(1, y0), W - 2, Math.max(2, Math.min(H - 1, y1) - Math.max(1, y0)));
    }
  }

  /* THE CAPTION goes to the top of the pitch when the ball is in the lower
   * part of what is on screen, so it never sits on the ball (decided at a
   * frozen moment, and kept through the play so it does not jump about) */
  function captionSide(info) {
    var b = document.body;
    if (!portrait()) { b.classList.remove('cap-top'); return; }
    if (info.phase !== 'moment') return;
    var fr = info.frame, g = info.g, pw = $('pworld'), st = $('stage'), tc = document.querySelector('.inmatch .tcol');
    if (!fr || !fr.ball || !g || !pw || !st || !tc) return;
    var r = pw.getBoundingClientRect(), T = st.getBoundingClientRect().top, B = T + (S.vis || S.Hv);
    var yb = r.top + g.Y(fr.ball.y) * (r.height / g.h), ch = tc.getBoundingClientRect().height;
    /* the caption sits at the bottom of the pitch unless the ball is in that strip (with a margin) */
    var top = yb > B - 8 - ch - 22;
    if (top && yb < T + 8 + ch + 22 && (yb - T) < (B - yb)) top = false;
    if (top !== b.classList.contains('cap-top')) b.classList.toggle('cap-top', top);
  }

  /* THE TIPS (ob-coach.js) pin their bubble to the top or the bottom of a
   * narrow window; on this layout the top is the pitch, where the man on the
   * ball often is. The bubble moves to the first place that covers neither
   * him, the caption nor the first card (the tip lights all three): over the
   * other cards if it fits there, else on the pitch clear of him. */
  function rectOf(el) { if (!el || !el.getBoundingClientRect) return null; var r = el.getBoundingClientRect(); return r.width || r.height ? r : null; }
  function hits(t, h, r, pad) { return r && t < r.bottom + pad && t + h > r.top - pad; }
  function tipSpot() {
    var b = document.querySelector('.obc-bubble');
    if (!b || b.getAttribute('data-side') !== 'pinned') return;
    var key = b.style.top + '|' + b.offsetHeight;
    if (b.getAttribute('data-mob') === key) return;
    var ring = rectOf($('pring')), cap = rectOf(document.querySelector('.inmatch .tcol .comm')), card = rectOf(document.querySelector('#cards .optw'));
    var bar = rectOf(document.querySelector('.bar')), vh = root.innerHeight || 800, bh = b.offsetHeight;
    var lo = 8, hi = vh - bh - 8, t0 = parseFloat(b.style.top) || lo;
    /* first choice: over the cards under the first one (they are dimmed while the tip shows) */
    var cands = card ? [card.bottom + 10, t0, (bar ? bar.bottom : 0) + 6] : [t0, (bar ? bar.bottom : 0) + 6];
    if (ring) cands.push(ring.bottom + 14, ring.top - bh - 14);
    if (cap) cands.push(cap.top - bh - 10);
    var pick = null;
    for (var i = 0; i < cands.length && !pick; i++) {
      var t = Math.max(lo, Math.min(hi, cands[i]));
      if (!hits(t, bh, ring, 10) && !hits(t, bh, cap, 4) && !hits(t, bh, card, 4)) pick = t;
    }
    for (var j = 0; j < cands.length && pick === null; j++) { var t2 = Math.max(lo, Math.min(hi, cands[j])); if (!hits(t2, bh, ring, 10)) pick = t2; }
    if (pick !== null) b.style.top = Math.round(pick) + 'px';
    b.setAttribute('data-mob', b.style.top + '|' + b.offsetHeight);
  }

  /* ------------------------------------------------ the header's Menu */
  function menu() {
    var bar = document.querySelector('.bar'), btns = document.querySelector('.barbtns');
    if (!bar || !btns || $('mobmenu')) return;
    var mb = document.createElement('button');
    mb.id = 'mobmenu'; mb.className = 'ghost sm mobmenu'; mb.type = 'button';
    mb.setAttribute('aria-expanded', 'false'); mb.setAttribute('aria-controls', 'mobbtns');
    mb.setAttribute('aria-label', 'Menu: sound, what has happened, settings');
    mb.innerHTML = '<span class="mbars" aria-hidden="true"><i></i><i></i><i></i></span><span class="mlab">Menu</span>';
    btns.id = btns.id || 'mobbtns';
    bar.appendChild(mb);
    function set(open) { bar.classList.toggle('mob-open', open); mb.setAttribute('aria-expanded', open ? 'true' : 'false'); }
    mb.onclick = function (e) { if (e && e.stopPropagation) e.stopPropagation(); set(!bar.classList.contains('mob-open')); };
    btns.addEventListener('click', function () { set(false); });
    document.addEventListener('pointerdown', function (e) {
      if (!bar.classList.contains('mob-open')) return;
      if (e.target && e.target.closest && (e.target.closest('#mobmenu') || e.target.closest('.barbtns'))) return;
      set(false);
    }, true);
  }

  /* ------------------------------------------------ taps */
  function wireTaps() {
    /* the caption: a tap shows all of what the commentator says, another tap folds it */
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest || !on()) return;
      if (t.closest('.inmatch .tcol .comm')) { document.body.classList.toggle('cap-open'); return; }
    });
    /* a lean card's first tap on a touch screen opens its details (ob-lean.js);
     * here it also draws its arrows on the pitch, as pointing at it does with a mouse */
    document.addEventListener('click', function (e) {
      var t = e.target, el = t && t.closest ? t.closest('#cards .opt.lean') : null;
      if (!el) return;
      var w = el.parentNode, i = +el.getAttribute('data-i');
      setTimeout(function () { if (w && w.classList && w.classList.contains('open') && root.__mobArm) root.__mobArm(i); }, 0);
    }, true);
  }
  /* the sheet's height, the moment it changes (four long cards, or a card
   * opened), not a frame later */
  function watchSheet() {
    var c = $('cards');
    if (!c || c === S.obsEl || typeof ResizeObserver === 'undefined') return;
    try {
      if (S.obs) S.obs.disconnect();
      S.obs = new ResizeObserver(function () { visible(); });
      S.obs.observe(c); S.obsEl = c;
    } catch (e) { }
  }
  /* a new moment folds the caption again */
  function newMoment() { document.body.classList.remove('cap-open'); }

  function init() {
    try { classes(); menu(); wireTaps(); } catch (e) { }
    try {
      [MQ_P, MQ_L].forEach(function (q) { var m = root.matchMedia(q); if (m.addEventListener) m.addEventListener('change', classes); });
    } catch (e) { }
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  }

  root.KMMobile = { on: on, portrait: portrait, landscape: landscape, crop: crop, mode: function () { return S.mode; },
    size: size, afterLayout: afterLayout, view: view, newMoment: newMoment, state: function () { return S; } };
})(typeof window !== 'undefined' ? window : globalThis);
