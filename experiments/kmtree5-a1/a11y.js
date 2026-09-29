/* acc1: ACCESSIBILITY AND KEYBOARD PLAY.
 *
 * Everything here sits on top of the page; the page calls it at five points
 * (play.html, lines marked "// a11y") and exposes what it reads as
 * window.KMA11yPage. It never changes the match: the only things it asks the
 * page to do are what a mouse already does (click a card, show a card's
 * arrows, skip the play before a moment).
 *
 * 1. KEYS. Tab and the arrow keys move between the cards; Enter or Space
 *    chooses the card you are on; 1 to 4 choose a card by its number; H or ?
 *    hides or shows the arrows on the pitch for the card you are on (they
 *    show as soon as a card has the keyboard's focus, as they do when a mouse
 *    points at it); S skips to the moment; Esc closes a panel. While a
 *    result plays, any key jumps to its end (the page's own rule). The first
 *    of these keys switches the page into keyboard mode: the cards show their
 *    numbers, and the keyboard's place is never lost when the page redraws
 *    (it goes to the first card of a new moment, to "Skip to the moment"
 *    while play runs, to "Kick off" or "Play again" between matches). A
 *    mouse click leaves keyboard mode.
 * 2. THE SCREEN READER. One live region (a log, so no line replaces
 *    another): one line when the play before a moment stops ("Spain kept the
 *    ball; Baena has it at the edge of their box"), one for the moment (the
 *    counter, whose chance, the commentator's text, the pitch, each option
 *    with its chances), one for the result (both dice and totals, the
 *    verdict, the headline, a goal and the score), and full time. Nothing
 *    while the five seconds of play run. The pitch is an image whose text
 *    says, at each freeze, who has the ball, where, and the nearest man of
 *    the other team. The cards are a group of buttons, each named with its
 *    number, its action and its chances; the result box and the GOAL banner
 *    on the pitch are hidden from the reader (the log says them once).
 * 3. SETTINGS (added to the Settings panel): high contrast, text size
 *    (100, 115 or 130 percent), reduce motion (also on whenever the computer
 *    asks for it), and a short list of the keys.
 *
 * Address overrides for checks and screenshots: ?hc=1, ?text=130,
 * ?motion=reduce, ?kbd=1 (start in keyboard mode). */
(function (root) {
  'use strict';
  var doc = root.document;
  var A = { log: [], errs: [], dec: 0, kbd: false, off: false, N: 4, set: { hc: false, text: 100, motion: 'os' } };
  function P() { return root.KMA11yPage || null; }
  function byId(id) { try { return doc.getElementById(id); } catch (e) { return null; } }
  function qa(sel, el) { try { return Array.prototype.slice.call((el || doc).querySelectorAll(sel)); } catch (e) { return []; } }
  function param(k) {
    var m = new RegExp('[?&]' + k + '=([^&#]*)').exec((root.location && root.location.search) || '');
    return m ? decodeURIComponent(m[1]) : null;
  }
  function load(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function save(k, v) { try { root.localStorage.setItem(k, v); } catch (e) { } }
  /* a real browser, not the headless DOM shim the node checks use */
  var REAL = !!(doc && doc.documentElement && typeof doc.createElement === 'function' && typeof root.MutationObserver === 'function' &&
    typeof root.HTMLElement === 'function');

  /* ------------------------------------------------------------ words */
  var ZONES = [[16.5, 'in your box'], [40, 'in your half'], [70, 'in midfield'], [88.5, 'at the edge of their box'], [999, 'in their box']];
  function zoneWords(y) { for (var i = 0; i < ZONES.length; i++) if (y < ZONES[i][0]) return ZONES[i][1]; return ''; }
  /* m7: the band named as the screen names it (pitch.js bandWords through the
   * page's KMA11yPage.band): "outside your box" beyond 25 m of that goal line,
   * where the commentator's raw text says "at the edge of your box".
   * `ball` defaults (in the page) to the frozen picture's ball, as renderComm's
   * honest() has it. --break a11yband (r3check B2): KMA11y.BREAK = 'band'. */
  function band(t, pg, ball) { if (A.BREAK === 'band' || !pg || !pg.band || !t) return t; return pg.band(t, ball); }
  function laneWords(x) { return x < 22 ? 'on the left' : x > 46 ? 'on the right' : 'in the centre'; }
  function plain(t) { return String(t == null ? '' : t).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
  function stop(t) { t = plain(t); return !t ? '' : /[.!?:]$/.test(t) ? t : t + '.'; }
  function first(p) { return String((p && p.name) || '').split(' ')[0]; }
  /* each result in a few words with its chance; two that read the same are one, their chances added (as the cards do) */
  function outsOf(o, pct) {
    var list = (o && o.outcomes) || [];
    if (!list.length) return '';
    var shown = pct ? pct(list.map(function (x) { return x.p; })) : list.map(function (x) { return Math.round(x.p * 100); });
    var rows = [];
    list.forEach(function (x, k) {
      var words = plain(x.short || x.shortBase || x.text), key = (x.icon || '') + '|' + words;
      var same = rows.filter(function (r) { return r.key === key; })[0];
      if (same) { same.pct += shown[k]; return; }
      rows.push({ key: key, words: words, pct: shown[k] });
    });
    if (rows.length === 1) return rows[0].words + ', certain';
    return rows.map(function (r) { return r.words + ' ' + r.pct + '%'; }).join('; ');
  }
  function liveOpts(p) { return ((p && p.moment && p.moment.options) || []).filter(function (o) { return !o.disabled; }); }
  function cardLabel(o, k, n, pct) {
    if (o.disabled) return 'Not available now: ' + plain(o.label) + (o.greyWhy ? '. ' + stop(o.greyWhy) : '.');
    return 'Option ' + k + ' of ' + n + ': ' + stop(o.label) + ' ' + stop(outsOf(o, pct));
  }
  /* the pitch in words at a freeze: who has the ball, where, the nearest man of the other team */
  function pitchText(d, pg) {
    var p = d.p, pos = d.pos || {}, S = d.S || {}, hid = S.holderId || (pg && pg.holder ? pg.holder(p) : null);
    var h = hid && pg ? pg.who(hid) : null, hp = hid ? pos[hid] : null;
    var base = 'The pitch, your goal at the bottom.';
    if (!h || !hp) return base + (d.ball && d.ball.label ? ' The ball: ' + stop(d.ball.label) : '');
    var zb = d.ball && typeof d.ball.y === 'number' ? d.ball : hp;  // m7: the zone of the ball, as the line over the pitch names it
    var t = base + ' ' + h.name + ' (' + pg.team(h.team) + ') has the ball ' + band(zoneWords(zb.y), pg, zb) + ', ' + laneWords(hp.x) + '.';
    var best = null;
    Object.keys(pos).forEach(function (id) {
      var w = pg.who(id) || (isNaN(+id) ? null : pg.who(+id));
      if (!w || w.team === h.team) return;
      var q = pos[id], dd = Math.hypot(q.x - hp.x, q.y - hp.y);
      if (!best || dd < best.d) best = { w: w, d: dd };
    });
    if (best) t += ' Nearest ' + pg.team(best.w.team) + ' player: ' + best.w.name + ', ' + Math.max(1, Math.round(best.d)) + ' metres away.';
    return t;
  }
  function momentText(d, pg) {
    var p = d.p, mine = p.moment && p.moment.sit && p.moment.sit.who === 'you';
    var parts = [stop((pg ? pg.counter(p) : 'Moment ' + p.index) + ', ' + p.minute + ' minutes'), mine ? 'Your chance.' : 'You have to stop this.'];
    if (p.announce) parts.push('Half-time: ' + stop(p.announce));
    if (p.lead) parts.push(stop(band(p.lead, pg)));  // m7: band()
    else if (p.broke) parts.push('You lost the ball going forward, so this moment is theirs to attack.');
    if (p.moment && p.moment.threat) parts.push(stop(band(p.moment.threat, pg)));
    parts.push(stop(band(p.moment && p.moment.text, pg)));
    parts.push(pitchText(d, pg).replace(/^The pitch, your goal at the bottom\. /, ''));
    var live = liveOpts(p), pct = pg && pg.pct;
    parts.push(live.length + (live.length === 1 ? ' option' : ' options') + ':');
    live.forEach(function (o, k) { parts.push((k + 1) + ', ' + stop(o.label) + ' ' + stop(outsOf(o, pct))); });
    var dead = ((p.moment && p.moment.options) || []).filter(function (o) { return o.disabled; });
    if (dead.length) parts.push('Not available: ' + dead.map(function (o) { return plain(o.label); }).join('; ') + '.');
    return parts.filter(Boolean).join(' ');
  }
  function segmentText(d, pg) {
    var seg = d.seg || {}, beats = seg.beats || [], end = seg.end || {};
    if (!pg || !beats.length) return '';
    var t0 = beats[0].team, h = end.holder ? pg.who(end.holder) : null;
    var kick = beats[0].kind === 'kickoff';
    if (!h) return (kick ? 'Kick-off. ' : '') + 'Play stops.';
    var kept = h.team === t0;
    return (kick ? 'Kick-off. ' : '') + pg.team(h.team) + (kept ? ' kept the ball; ' : ' won the ball; ') + h.name + ' has it' +
      (end.ball && typeof end.ball.y === 'number' ? ' ' + band(zoneWords(end.ball.y), pg, end.ball) : '') + '.';
  }
  function resultText(d, pg) {
    var ev = d.ev, v = d.v || {}, dd = ev.dice, s = [];
    if (dd) {
      var me = ev.actorName || 'You', them = ev.foilName || 'They';
      s.push(me + ' rolled ' + dd.mine + ': ' + (dd.mineTotal - dd.mine) + ' plus ' + dd.mine + ' is ' + dd.mineTotal + '.');
      s.push(them + ' rolled ' + dd.theirs + ': ' + (dd.themTotal - dd.theirs) + ' plus ' + dd.theirs + ' is ' + dd.themTotal + '.');
      s.push(stop(band(v.text, pg)));
    } else s.push(stop(band(ev.label, pg)) + ' Certain, nothing to roll.');  // m7: band()
    if (ev.headline) s.push(stop(band(ev.headline, pg)));
    var sc = d.score || {}, yn = pg ? pg.team('you') : 'You', tn = pg ? pg.team('them') : 'Them';
    if (ev.kind === 'goal') s.push('Goal! ' + yn + ' ' + sc.you + ', ' + tn + ' ' + sc.them + '.');
    if (ev.kind === 'conceded') s.push(tn + ' scored. ' + yn + ' ' + sc.you + ', ' + tn + ' ' + sc.them + '.');
    return s.join(' ');
  }
  function fullTimeText(d, pg) {
    var r = d.r || {}, sc = r.score || {};
    return 'Full time. ' + (r.won ? 'You won ' : r.drew ? 'It finished ' : 'You lost ') + sc.you + '-' + sc.them + '.';
  }
  A.text = { moment: momentText, segment: segmentText, result: resultText, fullTime: fullTimeText, pitch: pitchText, card: cardLabel, outs: outsOf };

  /* ------------------------------------------------------------ the live region */
  var LIVE = null;
  function live() {
    if (LIVE || !REAL) return LIVE;
    try {
      LIVE = doc.createElement('div');
      LIVE.id = 'a11ylive'; LIVE.className = 'a11y-sr';
      LIVE.setAttribute('role', 'log'); LIVE.setAttribute('aria-live', 'polite'); LIVE.setAttribute('aria-relevant', 'additions');
      doc.body.appendChild(LIVE);
    } catch (e) { LIVE = null; }
    return LIVE;
  }
  function announce(kind, msg) {
    if (!msg) return;
    A.log.push({ kind: kind, msg: msg, dec: A.dec, phase: P() ? P().phase() : null });
    if (A.log.length > 400) A.log.splice(0, A.log.length - 400);
    var L = live();
    if (!L) return;
    try {
      var el = doc.createElement('p');
      el.textContent = msg;
      L.appendChild(el);
      while (L.childNodes.length > 6) L.removeChild(L.firstChild);
    } catch (e) { }
  }
  A.announce = announce;

  /* ------------------------------------------------------------ the page's moments */
  function liveCards() {
    return qa('#cards .opt').filter(function (o) { return !o.disabled && !o.classList.contains('dead'); });
  }
  function focusEl(el) { if (!el) return false; try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) { return false; } } return doc.activeElement === el; }
  var H = {};
  H.cards = function (d) {
    if (!REAL) return;
    var p = d.p, box = d.box, opts = (p.moment && p.moment.options) || [], pg = P();
    var live = liveOpts(p), wraps = qa('.optw', box);
    var grp = wraps.length ? wraps[0].parentNode : null;
    if (grp && grp !== box) { grp.setAttribute('role', 'group'); grp.setAttribute('aria-label', 'Your options: pick one (keys 1 to ' + live.length + ')'); }
    var lb = byId('legendbtn'); if (lb) lb.setAttribute('aria-label', 'What the icons mean');
    qa('.opt', box).forEach(function (el) {
      var i = +el.getAttribute('data-i'), o = opts[i];
      if (!o) return;
      var k = live.indexOf(o) + 1;
      el.setAttribute('aria-label', A.text.card(o, k, live.length, pg && pg.pct));
      if (!o.disabled && !el.querySelector('.a11y-kn')) el.insertAdjacentHTML('afterbegin', '<span class="a11y-kn" aria-hidden="true">' + k + '</span>');
    });
    qa('.det', box).forEach(function (el) {
      var i = +el.getAttribute('data-det'), o = opts[i], k = o ? live.indexOf(o) + 1 : 0;
      if (o) el.setAttribute('aria-label', 'Details for ' + (k ? 'option ' + k + ', ' : '') + plain(o.label));
    });
  };
  H.freeze = function (d) {
    A.dec++;
    var pg = P();
    announce('moment', A.text.moment(d, pg));
    if (!REAL) return;
    var svg = byId('pitch');
    if (svg) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', A.text.pitch(d, pg)); }
    quiet();
    /* keyboard mode: the first card of a new moment, with its arrows on the pitch */
    if (A.kbd) {
      var a = doc.activeElement, cards = liveCards();
      var on = a && a.classList && a.classList.contains('opt') && cards.indexOf(a) >= 0 ? a : null;
      if (!on && cards[0]) { focusEl(cards[0]); on = cards[0]; }
      if (on && pg) pg.preview(+on.getAttribute('data-i'));
    }
  };
  H.play = function (d) {
    if (!REAL) return;
    var svg = byId('pitch');
    if (svg) svg.setAttribute('aria-label', 'The pitch, your goal at the bottom. Play goes on; your next decision comes when it stops.');
    quiet();
    if (A.kbd) restore();
  };
  H.segment = function (d) { announce('segment', A.text.segment(d, P())); };
  H.result = function (d) { announce('result', A.text.result(d, P())); };
  H.fulltime = function (d) { announce('fulltime', A.text.fullTime(d, P())); if (A.kbd) setTimeout(restore, 0); };
  /* the result box and the GOAL banner say, as they change, what the log says once */
  function quiet() {
    var rb = byId('resultbox'); if (rb) rb.setAttribute('aria-hidden', 'true');
    var gb = byId('goalban'); if (gb) { gb.setAttribute('aria-live', 'off'); gb.setAttribute('aria-hidden', 'true'); }
  }
  A.on = function (what, d) {
    if (A.off && what !== 'fulltime') return;
    try { if (H[what]) H[what](d || {}); } catch (e) { A.errs.push(what + ': ' + (e && e.message)); }
  };

  /* ------------------------------------------------------------ keyboard mode */
  function setKbd(on) {
    if (A.kbd === on) return;
    A.kbd = on;
    try { doc.documentElement.classList.toggle('a11y-kbd', on); } catch (e) { }
  }
  /* where the keyboard goes when the page drew over the thing it was on */
  var PRIMARY = ['obcok', 'obstart', 'kick', 'ftreel', 'again', 'fullmatch'];   // m5: ft2's full-time card makes "Watch all N goals" its main button when there were goals
  function lost() { var a = doc.activeElement; return !a || a === doc.body || a === doc.documentElement || !doc.body.contains(a); }
  function restore() {
    if (!A.kbd || !lost()) return;
    var pg = P(), cards = liveCards();
    if (cards.length && pg && pg.phase() === 'moment') { focusEl(cards[0]); pg.preview(+cards[0].getAttribute('data-i')); return; }
    if (byId('pskip') && !byId('pskip').disabled) { focusEl(byId('pskip')); return; }
    for (var i = 0; i < PRIMARY.length; i++) if (byId(PRIMARY[i]) && focusEl(byId(PRIMARY[i]))) return;
  }
  A.restore = restore;
  function inField(t) { var n = t && t.nodeName; return n === 'INPUT' || n === 'SELECT' || n === 'TEXTAREA'; }
  function inDrawer(t) { return !!(t && t.closest && t.closest('.drawer')); }
  var NAV = { Tab: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Enter: 1, ' ': 1, Escape: 1, s: 1, S: 1, h: 1, H: 1, '?': 1, '1': 1, '2': 1, '3': 1, '4': 1, '5': 1, '6': 1 };
  function closePanels(e) {
    /* the icon key, a card's details, a lean card opened by a tap, the two side panels; the keyboard goes back to what opened it */
    var lb = byId('legendbtn');
    if (lb && lb.getAttribute('aria-expanded') === 'true') { lb.click(); focusEl(lb); return true; }
    var det = qa('#cards .det[aria-expanded="true"]')[0];
    if (det) { det.click(); focusEl(det); return true; }
    var lw = qa('#cards .lean-w.open');
    if (lw.length) { lw.forEach(function (w) { w.classList.remove('open'); }); return true; }
    var pairs = [['setdrawer', 'setclose', 'setbtn'], ['logdrawer', 'logclose', 'logbtn']];
    for (var i = 0; i < pairs.length; i++) {
      var dr = byId(pairs[i][0]);
      if (dr && dr.classList.contains('open')) { if (byId(pairs[i][1])) byId(pairs[i][1]).click(); focusEl(byId(pairs[i][2])); return true; }
    }
    return false;
  }
  /* a key presses a card the way a mouse does, never the way a touch does
   * (a first tap on a touch screen only opens the card or shows its arrows) */
  function press(b, e) {
    var pg = P();
    /* this key is spent: the page's own rule ("any key jumps to the end of a
     * result") must not also read it, or choosing a card by key would skip
     * the result it just started */
    if (e && e.stopImmediatePropagation) e.stopImmediatePropagation();
    /* (so the sound, which starts on the first key the page sees, starts here) */
    try { if (root.KMSound && root.KMSound.available && root.KMSound.init) root.KMSound.init(); } catch (er) { }
    if (pg) pg.noTouch();
    var w = b.classList && b.classList.contains('opt') && b.closest ? b.closest('.lean-w') : null;
    if (w && !w.classList.contains('open') && w.parentNode && b.closest('#cards.lean-touch')) w.classList.add('open');
    b.click();
  }
  function onKey(e) {
    if (A.off || !e || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    var k = e.key, t = e.target, pg = P();
    if (!NAV[k]) return;
    setKbd(true);
    /* a result is playing: the page's own rule, any key jumps to its end;
     * Enter and Space must not also press whatever the keyboard lands on */
    if (pg && pg.busy()) { if (k === 'Enter' || k === ' ') e.preventDefault(); return; }
    if (k === 'Escape') { if (closePanels(e)) e.preventDefault(); return; }
    /* the keyboard had no place (the page drew over it): the first key other
     * than Tab, a number or S puts it on the obvious thing (the first card,
     * Skip, Kick off, Play again) and does nothing else, so nothing is
     * pressed unseen */
    if ((k === 'Enter' || k === ' ' || /^Arrow/.test(k) || k === 'h' || k === 'H' || k === '?') && lost()) { restore(); if (!lost()) e.preventDefault(); return; }
    if (inField(t)) return;
    var drawer = inDrawer(t), phase = pg ? pg.phase() : null;
    if (k === 'Enter' || k === ' ') {
      var b = t && t.closest ? t.closest('button') : null;
      if (b && !b.disabled) { e.preventDefault(); press(b, e); }
      return;
    }
    if (drawer) return;
    if ((k === 's' || k === 'S') && phase === 'play' && pg) { e.preventDefault(); pg.skip(); return; }
    var cards = liveCards();
    if (!cards.length || phase !== 'moment') return;
    if (/^[1-6]$/.test(k)) {
      var c = cards[+k - 1];
      if (!c) return;
      e.preventDefault();
      focusEl(c); press(c, e);
      return;
    }
    var at = cards.indexOf(t && t.closest ? t.closest('.opt') : null);
    if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowLeft') {
      var inCards = at >= 0 || lost() || (t && t.closest && t.closest('#cards'));
      if (!inCards) return;
      e.preventDefault();
      var fwd = k === 'ArrowDown' || k === 'ArrowRight';
      var nx = at < 0 ? (fwd ? 0 : cards.length - 1) : (at + (fwd ? 1 : -1) + cards.length) % cards.length;
      focusEl(cards[nx]);
      return;
    }
    if (k === 'h' || k === 'H' || k === '?') {
      var on = at >= 0 ? cards[at] : null;
      if (!on || !pg) return;
      e.preventDefault();
      var g = byId('ghost'), shown = !!(g && g.firstChild);
      pg.preview(shown ? -1 : +on.getAttribute('data-i'));
    }
  }
  A.onKey = onKey;

  /* ------------------------------------------------------------ settings */
  function apply() {
    var de = doc && doc.documentElement;
    if (!de || !de.setAttribute) return;
    de.setAttribute('data-a11y-hc', A.set.hc ? 'on' : 'off');
    de.setAttribute('data-a11y-text', String(A.set.text));
    de.setAttribute('data-a11y-motion', A.set.motion);
    if (root.CanteraJuice) root.CanteraJuice.forceReduced = A.set.motion === 'reduce';
  }
  A.reduced = function () { return A.set.motion === 'reduce'; };
  function readSettings() {
    var hc = param('hc'), tx = param('text'), mo = param('motion');
    A.set.hc = hc !== null ? hc === '1' || hc === 'on' : load('cantera-a11y-hc') === 'on';
    var t = +(tx !== null ? tx : load('cantera-a11y-text'));
    A.set.text = t === 115 || t === 130 ? t : 100;
    A.set.motion = (mo !== null ? mo : load('cantera-a11y-motion')) === 'reduce' ? 'reduce' : 'os';
    if (param('kbd') === '1') setKbd(true);
  }
  function relayout() { try { root.dispatchEvent(new Event('resize')); } catch (e) { } }
  var KEYS = [['Tab, or the arrow keys', 'move between the cards'], ['Enter or Space', 'choose the card you are on'],
    ['1 to 4', 'choose card 1 to 4 (the numbers show on the cards once you use a key)'],
    ['H or ?', 'hide or show the arrows on the pitch for the card you are on'], ['S', 'skip to the moment while play runs'],
    ['Any key', 'while a result plays: jump to its end'], ['Esc', 'close a panel']];
  function settingsHTML() {
    return '<div class="setgrp a11y-set" id="a11yset" role="group" aria-labelledby="a11yhead"><span id="a11yhead">Seeing and moving:</span>' +
      '<label><input type="checkbox" id="a11yhc"> High contrast: black text on white, stronger lines</label>' +
      '<span class="a11y-tx" role="radiogroup" aria-label="Text size">Text size: ' +
        [100, 115, 130].map(function (v) { return '<label><input type="radio" name="a11ytext" value="' + v + '" id="a11ytext' + v + '"> ' + v + '%</label>'; }).join('') + '</span>' +
      '<label><input type="checkbox" id="a11yrm"> Reduce motion: no zoom, shake or sliding, and the play before a moment jumps to its end (always on when your computer asks for less motion)</label>' +
      '</div>' +
      '<details class="a11y-keys" id="a11ykeys"><summary>Keys</summary><dl>' +
      KEYS.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>'; }).join('') + '</dl></details>';
  }
  function wireSettings() {
    var dr = byId('setdrawer'), head = dr ? dr.querySelector('.drawhead') : null;
    if (!dr || !head || byId('a11yset')) return;
    head.insertAdjacentHTML('afterend', settingsHTML());
    var hc = byId('a11yhc'), rm = byId('a11yrm');
    hc.checked = A.set.hc; rm.checked = A.set.motion === 'reduce';
    hc.onchange = function () { A.set.hc = !!this.checked; save('cantera-a11y-hc', A.set.hc ? 'on' : 'off'); apply(); relayout(); };
    rm.onchange = function () { A.set.motion = this.checked ? 'reduce' : 'os'; save('cantera-a11y-motion', A.set.motion); apply(); };
    [100, 115, 130].forEach(function (v) {
      var r = byId('a11ytext' + v);
      r.checked = A.set.text === v;
      r.onchange = function () { if (!this.checked) return; A.set.text = v; save('cantera-a11y-text', String(v)); apply(); relayout(); };
    });
  }
  function onPointer(e) { if (e && e.isTrusted !== false && e.pointerType !== undefined) setKbd(false); }

  readSettings();
  apply();
  if (REAL) {
    try {
      root.addEventListener('keydown', onKey, true);
      root.addEventListener('click', onClick2, false);
      root.addEventListener('pointerdown', onPointer, true);
      var ready = function () {
        wireSettings(); live();
        /* whenever the page redraws over the keyboard's place, put it back */
        var pend = false;
        new root.MutationObserver(function () {
          if (!A.kbd || pend) return;
          pend = true;
          setTimeout(function () { pend = false; restore(); }, 0);
        }).observe(doc.body, { childList: true, subtree: true });
      };
      if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ready); else ready();
    } catch (e) { A.errs.push('init: ' + (e && e.message)); }
  }
  /* a side panel that opens takes the keyboard to its Close button; closing it brings the keyboard back */
  function onClick2(e) {
    var t = e && e.target;
    if (!t || !t.closest) return;
    var op = t.closest('#setbtn,#logbtn'), cl = t.closest('#setclose,#logclose');
    if (op) {
      var dr = byId(op.id === 'setbtn' ? 'setdrawer' : 'logdrawer');
      if (dr && dr.classList.contains('open')) setTimeout(function () { focusEl(byId(op.id === 'setbtn' ? 'setclose' : 'logclose')); }, 0);
    } else if (cl) setTimeout(function () { focusEl(byId(cl.id === 'setclose' ? 'setbtn' : 'logbtn')); }, 0);
  }
  root.KMA11y = A;
})(typeof window !== 'undefined' ? window : globalThis);
