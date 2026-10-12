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
  /* kmtree5 a7 (helper M): THE CROP THROUGH A RESULT. The dice box is pinned to the pitch, and the crop holds still
   * through a result only while the ball is between 12% and 88% of the view (tick). A box placed clear of the men at
   * the far end of the view slid off the screen when the ball ran to the other end (measured: 4 of 44 results, 0.1 to
   * 0.5 s each). Now the page gives the ball's whole path (board pixels) when it places the box: when one crop keeps
   * all of it between 14% and 86% of the view, the crop goes there once, before the result plays, and stays; the
   * part of the board returned is on screen at every crop the result will pass through (the tick's own rule, played
   * forward over the path). When that part is too short for a box, a5's answer (view()).
   * ?pbreak=m6box or ?move=a5: the page does not call this. */
  function resultView(ys) {
    var v0 = view();
    if (!v0 || !ys || !ys.length) return v0;
    var info = root.__mobPit ? root.__mobPit() : null, g = info && info.g, vis = S.vis || S.Hv;
    if (!g) return v0;
    var maxOff = Math.max(0, g.h - vis), lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    var a = Math.max(0, hi - 0.86 * vis), b = Math.min(maxOff, lo - 0.14 * vis), offs = [S.off], t = S.target;
    if (a <= b) { t = Math.max(a, Math.min(b, S.target)); S.target = t; }
    offs.push(t);
    ys.forEach(function (by) {
      var yb = by - t;
      if (yb > vis * 0.12 && yb < vis * 0.88) return;
      /* the ball leaves the band: the crop follows it, 40% to 60% down the view (targetOff's anchors: both are allowed for) */
      var t4 = Math.max(0, Math.min(maxOff, by - vis * 0.4)), t6 = Math.max(0, Math.min(maxOff, by - vis * 0.6));
      offs.push(t4, t6); t = Math.abs(t4 - t) < Math.abs(t6 - t) ? t4 : t6;
    });
    var out = { y0: Math.max.apply(null, offs) + 8, y1: Math.min.apply(null, offs) + vis - 8, held: a <= b };
    return out.y1 - out.y0 >= 150 ? out : v0;
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

  /* kmtree5 a7 (helper M, "the phone picture"): THE DECISION PICTURE. Until a5 the crop followed the ball alone and the
   * caption went to the top only when the BALL was under it, so a man a live card names could be under the caption,
   * under the small map, or off the screen (measured, 3 cup matches at 2X in his phone window: a man the cards name
   * under the text in 5 of 44 decisions, off the screen in 3, a name tag under the text or the map or off the screen
   * in 22). Now, at a frozen moment, the crop and the caption's side are chosen for the men the decision is about
   * (the page's window.__m6want(): the man on the ball, the nearest opponent the words name, the men the live cards
   * name, in that order): each side of the caption (bottom, top) leaves a free band of the pitch box; the side and the
   * crop that keep the most of those men (the first ones first) in the free band win, and of those the crop nearest
   * to where the ball alone would put it, the bottom caption on a tie. The small map goes to the left corner when one
   * of those men would be under it on the right. decision() gives the page the free band and the map's place, so the
   * name tags are placed inside what the user sees (play.html drawTags), and the page is asked to place them again
   * when the plan changes (the sheet grew, the caption's text changed).
   * ?pbreak=m6dec or ?move=a5: a5's crop, caption and tags. */
  var M6DEC = (function () { var q = (root.location && root.location.search) || ''; return !(/[?&]move=a5\b/.test(q) || /[?&]pbreak=[\w,]*m6dec\b/.test(q)); })();
  var M2PANEL = !/[?&]pbreak=[\w,]*m2panel\b/.test((root.location && root.location.search) || '');   // kmtree5 a9 (helper M2): ?pbreak=m2panel measures the text alone again (the check's break)
  function decisionPlan(info) {
    if (!M6DEC || !crop() || !info || info.phase !== 'moment' || !info.g || !info.frame || !info.frame.pos || !S.Hv || !root.__m6want) return null;
    var W = root.__m6want();
    if (W && W.hold) return S.plan || null;   // a card is played: the picture holds still until the result
    if (!W || !W.must || !W.must.length) return null;
    var g = info.g, vis = S.vis || S.Hv, pos = info.frame.pos, r = g.r, def = targetOff();
    if (def == null) return null;
    var cm = document.querySelector('.inmatch .tcol .comm'), ch = cm && cm.getBoundingClientRect ? Math.round(cm.getBoundingClientRect().height) : 0;
    if (document.body.classList.contains('cap-open') && S.plan) return S.plan;   // the caption opened by a tap: nothing moves under the user's finger
    /* kmtree5 a9 (helper M2): THE BUILD PANEL IS PART OF THE CAPTION. From the second cup match on, "YOUR BUILD" sits
     * under the moment's text in the same column, and the plan measured the text alone: with the caption at the bottom
     * the text stood in the middle of the pitch box, over the man on the ball (cup seed 4711, match 2: 3 of 10
     * decisions). The height the plan keeps clear is now the whole column's (text and panel). It is remembered for
     * each side during a moment (at the top the column is 58 px narrower, so it can be taller), so the choice of side
     * cannot flip back and forth.
     * ?pbreak=m2panel: the text alone, as before (m6_phonecheck's break for the panel). */
    var tc2 = document.querySelector('.inmatch .tcol'), th2 = tc2 && tc2.getBoundingClientRect ? Math.round(tc2.getBoundingClientRect().height) : 0;
    if (M2PANEL && th2 > ch) ch = th2;
    var nowTop2 = document.body.classList.contains('cap-top') ? 1 : 0;
    if (!S.ch2 || S.ch2.S !== info.S) S.ch2 = { S: info.S, h: [0, 0] };
    S.ch2.h[nowTop2] = ch;
    var chOf = function (top) { return S.ch2.h[top ? 1 : 0] || ch; };
    var men = [];
    /* (where the camera draws each man: the push at a frozen decision zooms up to 4% and pans toward the ball, which
     * moved a chip up to 24 px on his phone; the page gives the camera as it is now, and the plan follows it as it eases) */
    var cam = W.cam && W.cam[0] ? W.cam : [1, 0, 0];
    W.must.forEach(function (id) { if (pos[id]) men.push({ id: id, x: g.X(pos[id].x) * cam[0] + cam[1], y: g.Y(pos[id].y) * cam[0] + cam[2] }); });
    if (!men.length) return null;
    /* (helper M2) the ball stays in view with the man who has it: when it is at his feet (within 3 chips), the room he needs runs from him to the ball */
    var bl2 = info.frame.ball, by2 = bl2 && W.must[0] === men[0].id ? g.Y(Math.max(-2, Math.min(107, bl2.y))) * cam[0] + cam[2] : null;
    if (M2PANEL && by2 != null && Math.abs(by2 - men[0].y) < 3 * r) { men[0].y0 = Math.min(men[0].y, by2); men[0].y1 = Math.max(men[0].y, by2); }
    var maxOff = Math.max(0, g.h - vis), best = null, cz = 1;   // (1 px of air at both ends)
    var MAPH = Math.round(54 * 105 / 68), MAPB = 6 + MAPH;   // the small map's height, and its bottom edge when it sits in the top corner
    [false, true].forEach(function (top) {
      /* the free band for a chip's centre, in the view's own pixels: clear of the caption (8 px from its edge of the
       * view, its height, 6 px of air) and a chip's radius inside both ends */
      var ch = chOf(top);   // (helper M2: the column's height on this side, the build panel included)
      var b0 = (top ? Math.max(8 + ch, MAPB) + 3 : 2) + r + cz, b1 = (top ? vis - 2 : vis - 8 - ch - 3) - r - cz;
      var lo = Infinity, hi = -Infinity, oL = 0, oH = maxOff, n = 0, score = 0, kept = [], lost = false;
      men.forEach(function (m, i) {
        var l2 = Math.min(lo, m.y0 != null ? m.y0 : m.y), h2 = Math.max(hi, m.y1 != null ? m.y1 : m.y), a = Math.max(0, h2 - b1), b = Math.min(maxOff, l2 - b0);
        /* the man on the ball also stays between 16% and 84% of the view's height: the crop holds still through the
         * result only while the ball is between 12% and 88% (tick), and the dice box is pinned to the pitch */
        var a0 = a, bb0 = b;
        if (i === 0) { a = Math.max(a, m.y - 0.84 * vis); b = Math.min(b, m.y - 0.16 * vis); }
        else { a = Math.max(a, oL); b = Math.min(b, oH); }
        /* (helper M2) with the build panel up the free band can be 40 px tall: when the man on the ball cannot be both in
         * it and between 16% and 84% of the view, being seen comes first (the tick follows the ball if it leaves the view) */
        if (M2PANEL && i === 0 && a > b + 0.5 && a0 <= bb0 + 0.5) { a = a0; b = Math.max(a0, bb0); }
        if (a > b + 0.5) {
          if (i !== 0) return;   // he does not fit with the men before him: they come first
          a = b = Math.max(0, Math.min(maxOff, def));
          /* (helper M2) the man on the ball has no place in this side's band at all. Where the ball alone puts the crop,
           * is he (and the ball) under the column of text and panel? Then this side hides him */
          if (M2PANEL && (top ? l2 - a < b0 : h2 - a > b1)) lost = true;
        }
        lo = l2; hi = h2; oL = a; oH = Math.max(a, b); n++; score += 1000 - i; kept.push(m);
      });
      if (!n) return;
      if (lost) score -= 1e6;   // (helper M2) a side that hides the man on the ball loses to one that shows him
      var off = Math.max(oL, Math.min(oH, def));
      var cand = { off: off, capTop: top, n: n, score: score, move: Math.abs(off - def), band0: (top ? Math.max(8 + ch, MAPB) + 3 : 2), band1: (top ? vis - 2 : vis - 8 - ch - 3), kept: kept, ch: ch, vis: vis, lost: lost };
      if (!best || cand.score > best.score || (cand.score === best.score && cand.move < best.move - 0.5)) best = cand;
    });
    if (!best) return null;
    /* (helper M2) neither side shows the man on the ball clear of the text and the panel: a5's layout for this decision
     * (the caption on the side away from the ball, the crop on the ball, a5's tags and map): the tick's own else branch */
    if (best.lost) { S.m2fall = (S.m2fall || 0) + 1; return null; }
    /* the small map, 54 x 83. With the caption at the top it sits in the top right corner, in the caption's own row
     * (mobile.css keeps 66 px free there), so it covers no part of the pitch the band uses (a5 sent it to the bottom
     * right corner, over the pitch). With the caption at the bottom it is in a top corner: the right one, or the left
     * one when that covers fewer of the decision's men */
    var vw = root.innerWidth || 390, mw = 54, mh = MAPH;
    function under(x0, pad, all) { var n = 0; (all ? men : best.kept).forEach(function (m) { var vy = m.y - best.off; if (m.x > x0 - pad && m.x < x0 + mw + pad && vy > 6 - pad && vy < 6 + mh + pad) n++; }); return n; }
    /* (helper M2: when the men kept say nothing, the men left out of the band decide: with the build panel up the band is
     * short, and a man it leaves out can still be in view above it, where the map goes) */
    var uR = [under(vw - 6 - mw, 0), under(vw - 6 - mw, r)], uL = [under(6, 0), under(6, r)];
    if (M2PANEL) { uR.push(under(vw - 6 - mw, 0, 1), under(vw - 6 - mw, r, 1)); uL.push(under(6, 0, 1), under(6, r, 1)); }
    best.mapLeft = false;
    if (!best.capTop) for (var u2 = 0; u2 < uR.length; u2++) { if (uR[u2] !== uL[u2]) { best.mapLeft = uR[u2] > uL[u2]; break; } }
    best.map = { x0: best.mapLeft ? 6 : vw - 6 - mw, y0: best.off + 6, x1: (best.mapLeft ? 6 : vw - 6 - mw) + mw, y1: best.off + 6 + mh };
    best.camKey = Math.round(cam[0] * 500) + ',' + Math.round(cam[1] / 2) + ',' + Math.round(cam[2] / 2);
    return best;
  }
  function applyPlan(plan) {
    var b = document.body, mp = $('mobmap');
    if (plan.capTop !== b.classList.contains('cap-top')) b.classList.toggle('cap-top', plan.capTop);
    if (mp) {
      var l = plan.mapLeft ? '6px' : '', rt = plan.mapLeft ? 'auto' : ''; if (mp.style.left !== l) { mp.style.left = l; mp.style.right = rt; }
      if (mp.style.top !== '6px') { mp.style.top = '6px'; mp.style.transform = 'none'; }   // always a top corner (see decisionPlan)
    }
    var key = [Math.round(plan.off), plan.capTop ? 1 : 0, plan.mapLeft ? 1 : 0, plan.vis, plan.ch, plan.camKey].join('|');
    S.plan = plan;
    if (key !== S.planKey) { S.planKey = key; if (root.__m6retag) { try { root.__m6retag(); } catch (e) { } } }
  }
  /* for the page's name tags: the part of the board (its own pixels) a tag may use at this decision, and the small map */
  function decision() {
    var info = root.__mobPit ? root.__mobPit() : null, plan = decisionPlan(info);
    if (!plan) return null;
    return { y0: plan.off + plan.band0, y1: plan.off + plan.band1, map: plan.map, off: plan.off, capTop: plan.capTop };
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
    if (landscape()) fitSheet();  // m7
    var plan6 = decisionPlan(info);   // kmtree5 a7 (helper M): at a decision, the crop and the caption's side for the men it is about
    if (plan6) applyPlan(plan6); else { captionSide(info); if (info.phase === 'moment') { S.plan = null; S.planKey = ''; var mp6 = $('mobmap'); if (mp6 && (mp6.style.left || mp6.style.top)) { mp6.style.left = ''; mp6.style.right = ''; mp6.style.top = ''; mp6.style.transform = ''; } } }
    if (!crop() || !info.g) return;
    var t = plan6 ? plan6.off : targetOff();
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
      if (t.closest('.inmatch .tcol .comm') || (landscape() && t.closest('.inmatch .tcol #bvpanel'))) { document.body.classList.toggle('cap-open'); return; }  // m7: on a sideways phone the build panel opens with the caption
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
  /* m7: THE SHEET FITS (a sideways phone). At each new set of cards the sheet starts as designed; if its cards
   * need a scroll, mobile.css's mob-fit1 tightens the spacing, and if they still do, mob-fit2 lets each of the
   * two columns stack on its own, then mob-fit3 sets the cards' lines closer,
   * with a build mob-fit4 folds its panel to the name line, and last mob-fit5 shows the commentator's scene in two
   * lines, not three (a tap opens either, the page's "More"). Only added, never taken off, until the next set of cards. ?mobfit=off: as before.
   * mob8: two more steps that hide nothing, tried before the two that fold words away:
   *   mob-fit6 (pack): chips lower-profile, the chances straight after the last chip when they fit on that line,
   *     a greyed card may lie across both columns as one line (see stack)
   *   mob-fit7 (head up): the "Pick one ?" line moves into the empty middle of the header bar, when it fits there
   * ?mobpack=off: m7's steps only. */
  var FIT_OFF = param('mobfit') === 'off';
  var PACK_OFF = param('mobpack') === 'off';
  var FIT_SEQ = PACK_OFF ? [1, 2, 3, 4, 5] : [1, 2, 3, 6, 7, 4, 5];
  var FIT_ALL = ['mob-fit1', 'mob-fit2', 'mob-fit3', 'mob-fit4', 'mob-fit5', 'mob-fit6', 'mob-fit7'];
  function fitSheet() {
    var c = $('cards');
    if (!c || FIT_OFF) return;
    var list = c.lastElementChild;
    if (!list || list.classList.contains('legend') || list.classList.contains('cardshead')) list = null;
    if (S.fitList !== list) { S.fitList = list; S.fit = 0; S.stackKey = ''; c.classList.remove.apply(c.classList, FIT_ALL); headDown(c); }
    if (!list || !list.querySelector('.opt')) return;
    if (c.classList.contains('mob-fit7') && !headUp(c)) { c.classList.remove('mob-fit7'); headDown(c); }
    /* mob8: once the columns stack on their own, they are laid out again whenever a card's height changes
     * (a card opened for its details, or letters that arrive late), so no card ever sits on another */
    if (S.fit >= 2 && stackKey(list) !== S.stackKey) stack(list);
    if (list.querySelector('.lean-w.open')) return;  // an opened card's details may scroll, as before
    var build = !!($('bvpanel') && $('bvpanel').innerHTML);  // mob-fit4 only folds a build's panel
    while (S.fit < FIT_SEQ.length && c.scrollHeight > c.clientHeight + 1) {
      var step = FIT_SEQ[S.fit++];
      if (step === 4 && !build) continue;
      c.classList.add('mob-fit' + step);
      if (step === 7 && !headUp(c)) { c.classList.remove('mob-fit7'); headDown(c); continue; }
      if (c.classList.contains('mob-fit2')) stack(list);
    }
  }
  /* mob-fit7: "Pick one" and its "?" sit in the header, in the empty space between the minute and the header's
   * buttons, level with them. Only when that space is wide enough (8 px clear each side); otherwise the step is
   * skipped. Returns whether it is placed. */
  function headUp(c) {
    var h = c.querySelector('.cardshead'), bar = document.querySelector('.bar'), bb = document.querySelector('.bar .barbtns');
    if (!h || !bar || !bb) return false;
    var parts = Array.prototype.slice.call(document.querySelectorAll('.bar .scorebox > *')), left = 0;
    parts.forEach(function (p) { var r = p.getBoundingClientRect(); if (r.width) left = Math.max(left, r.right); });
    var rb = bar.getBoundingClientRect(), right = bb.getBoundingClientRect().left;
    var hw = h.getBoundingClientRect().width, hh = h.getBoundingClientRect().height;
    if (!left || right - left < hw + 16) return false;
    var x = Math.round(right - hw - 8), y = Math.round(rb.top + (rb.height - hh) / 2);
    if (h.style.left !== x + 'px') h.style.left = x + 'px';
    if (h.style.top !== y + 'px') h.style.top = y + 'px';
    var r2 = h.getBoundingClientRect();
    return Math.abs(r2.left - x) < 1.5 && Math.abs(r2.top - y) < 1.5;   // a transformed parent would move it: then the step is not used
  }
  function headDown(c) { var h = c && c.querySelector('.cardshead'); if (h) { h.style.left = ''; h.style.top = ''; } }
  function stackKey(list) {
    return Array.prototype.map.call(list.children, function (k) { return k.offsetHeight + (k.classList.contains('open') ? 'o' : ''); }).join(',');
  }
  /* mob-fit2: the cards stack in two columns, each column in the cards' order (the list's height is the taller
   * column's). m7 put each card under the shorter column in turn; mob8 tries every way of sharing the cards
   * between the two columns (at most 64 for six cards; card 1 always starts the left one) and keeps the shortest,
   * preferring m7's way on a tie.
   * mob8, with mob-fit6: the greyed cards (they cannot be played), and then also the last playable card, may
   * instead lie across both columns under them (a greyed card as one line); the page takes whichever is shortest. */
  function stack(list) {
    var kids = Array.prototype.slice.call(list.children);
    kids.forEach(function (k) { k.style.order = ''; k.style.bottom = ''; k.classList.remove('mob8-wide'); });
    list.style.paddingBottom = '';
    list.style.boxSizing = 'content-box';   // the height below is the columns' alone; the greyed cards lie in the padding under them
    function hOf(k) { var m = 0; try { m = parseFloat(getComputedStyle(k).marginTop) || 0; } catch (e) { } return k.offsetHeight + m; }
    function greedy(hs) { var col = [0, 0], n = [0, 0], mask = 0; hs.forEach(function (h, i) { var c = i < 2 ? i : (col[0] <= col[1] ? 0 : 1); if (c) mask |= 1 << i; col[c] += h + (n[c] ? 4 : 0); n[c]++; }); return mask; }
    function height(hs, mask) { var col = [0, 0], n = [0, 0]; hs.forEach(function (h, i) { var c = (mask >> i) & 1; col[c] += h + (n[c] ? 4 : 0); n[c]++; }); return Math.max(col[0], col[1]); }
    function bestMask(hs) {
      var g = greedy(hs), best = { mask: g, h: height(hs, g) };
      if (hs.length > 6) return best;
      for (var m = 0; m < (1 << hs.length); m += 2) { var hm = height(hs, m); if (hm < best.h - 0.5) best = { mask: m, h: hm }; }
      return best;
    }
    var A = bestMask(kids.map(hOf)), pick = { set: kids, mask: A.mask, h: A.h, under: 0, wide: [], hs: [] };
    /* the ways tried with mob-fit6: the greyed cards across both columns; and the greyed cards plus one
     * playable card across both columns (a card across the sheet is one or two lines shorter) */
    var dead = kids.filter(function (k) { return k.querySelector('.opt.dead') && !k.classList.contains('open'); });
    var live = kids.filter(function (k) { return dead.indexOf(k) < 0; });
    var open = !!list.querySelector('.lean-w.open'), was = S.stackPick;
    function wideH(ks) { ks.forEach(function (k) { k.classList.add('mob8-wide'); }); var hs = ks.map(function (k) { return k.offsetHeight; }); ks.forEach(function (k) { k.classList.remove('mob8-wide'); }); return hs; }
    function sum(hs) { return hs.reduce(function (a, h) { return a + h + 4; }, 0); }
    if (open && was && was.list === list) {
      /* a card opened for its details: every card stays in its place (a tapped card never jumps); the columns
       * are only measured again */
      var whs = wideH(was.wide);
      pick = { set: was.set, mask: was.mask, h: height(was.set.map(hOf), was.mask), wide: was.wide, hs: whs, under: sum(whs) };
    } else if (!open && list.parentNode && list.parentNode.classList.contains('mob-fit6') && kids.length >= 3) {
      /* the ways tried with mob-fit6: some cards across both columns, under them: the greyed cards (as one line),
       * and up to two playable cards (a card across the sheet is a line or two shorter). Every way is measured
       * (each card's height across the sheet once) and the shortest kept; on a tie, the one with fewer playable
       * cards across */
      var half = kids.map(hOf), full = wideH(kids), iD = [], iL = [];
      kids.forEach(function (k, n) { (dead.indexOf(k) >= 0 ? iD : iL).push(n); });
      var subs = [[]];
      iL.forEach(function (a) { subs.push([a]); });
      iL.forEach(function (a, x) { iL.slice(x + 1).forEach(function (b) { subs.push([a, b]); }); });
      [false, true].forEach(function (withDead) {
        if (withDead && !iD.length) return;
        subs.forEach(function (sub) {
          var wi = (withDead ? iD : []).concat(sub).sort(function (a, b) { return a - b; });
          if (!wi.length || kids.length - wi.length < 2) return;
          var rest = [], rh = [];
          kids.forEach(function (k, n) { if (wi.indexOf(n) < 0) { rest.push(k); rh.push(half[n]); } });
          var B = bestMask(rh), under = sum(wi.map(function (n) { return full[n]; }));
          var tot = B.h + under, cur = pick.h + pick.under;
          var better = tot < cur - 0.5 || (Math.abs(tot - cur) <= 0.5 && pick.wide.length && sub.length < pick.nLive);
          if (better) pick = { set: rest, mask: B.mask, h: B.h, under: under, wide: wi.map(function (n) { return kids[n]; }), hs: wi.map(function (n) { return full[n]; }), nLive: sub.length };
        });
      });
    }
    if (!open) S.stackPick = { list: list, set: pick.set, mask: pick.mask, wide: pick.wide };
    pick.set.forEach(function (k, i) { k.style.order = (pick.mask >> i) & 1 ? '3' : '1'; });
    if (pick.wide.length) {
      /* the cards across the sheet, under the columns in their own order (the last one at the bottom) */
      var at = 0;
      for (var j = pick.wide.length - 1; j >= 0; j--) { pick.wide[j].classList.add('mob8-wide'); pick.wide[j].style.bottom = at + 'px'; at += pick.hs[j] + 4; }
      list.style.paddingBottom = pick.under + 'px';
    }
    list.style.height = Math.ceil(pick.h + 1) + 'px';
    S.stackKey = stackKey(list);
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
    size: size, afterLayout: afterLayout, view: view, resultView: resultView, newMoment: newMoment, decision: decision, state: function () { return S; } };
})(typeof window !== 'undefined' ? window : globalThis);
