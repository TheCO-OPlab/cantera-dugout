/* bx1: HOW A BUILD IS EXPERIENCED (the page side; browser only).
 *
 * Three ways to play a build, chosen on the Builds screen:
 *   full     the whole build at once, exactly as s0 (nothing here runs)
 *   guided   the whole build; the first time each piece is on a card you can
 *            pick, a note beside that card says what the piece is and what it
 *            does there; after the match, a review of what each piece did
 *   journey  one new piece a match, in the order journeys.js gives (the pace
 *            switch: one piece a match, or at most four matches); the team
 *            sheet introduces the new piece (what it does, what to look for,
 *            how it connects to what you have); its chips carry a gold ring
 *            and the first time it can matter a note points at it; after the
 *            match, the review and a button for the next match
 *
 * It never changes a match: it reads st.fx and the options (bviz.js), draws on
 * top of the page, and stores progress per viewer in localStorage (every read
 * and write in try/catch; without storage the journey still works from the
 * address, ?build=<id>&bx=journey&step=<n>).
 *
 * window.KMBXU. The page calls: prepare, buildsHead, rowHTML, href, sheet,
 * onMenu, onPick, review, afterReview, now. */
(function (root) {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var J = root.KMJourney, BV = root.KMBuildViz;
  /* _edge/bxedgecheck.js: ?bxbreak=place (the note always under the card, the first placement) and
   * ?bxbreak=toast (the line always beside the panel) bring back the two phone bugs it checks for;
   * ?bxbreak=anchor (the note on the last card with the chip) and ?bxbreak=again (the start screen's
   * "Play the build again" as a plain build) bring back review findings 5 and 7 */
  var BREAK = (function () { try { var m = /[?&]bxbreak=(\w+)/.exec(window.location.search || ''); return m ? m[1] : null; } catch (e) { return null; } })();
  var PARTNER_MIN = 0.5;   /* co-acts a match in test matches for the review to call two pieces partners */
  var KEY = 'cantera-bx1', MODES = { full: 1, guided: 1, journey: 1 }, PACES = { one: 1, short: 1 };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { } }
  function q(k) { var m = new RegExp('[?&]' + k + '=([A-Za-z0-9_-]+)').exec(window.location.search || ''); return m ? m[1] : null; }
  function num(x) { return String(Math.round(x * 10) / 10); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* ------------------------------------------------ the mode and progress */
  function prefs() { var s = load(); return { mode: MODES[s.mode] ? s.mode : 'full', pace: PACES[s.pace] ? s.pace : 'one' }; }
  function setPref(k, v) { var s = load(); s[k] = v; save(s); }
  function nextStep(id, pace) { var s = load(), b = (s.builds || {})[id + '|' + pace]; return b && typeof b.next === 'number' ? b.next : 0; }
  function setNext(id, pace, i) { var s = load(); s.builds = s.builds || {}; s.builds[id + '|' + pace] = { next: i, at: Date.now() }; save(s); }
  function reset(id, pace) { var s = load(); if (s.builds) delete s.builds[id + '|' + pace]; save(s); }

  /* the build to load and the bx record, from the address. null: s0's way */
  function prepare(bld) {
    var mode = q('bx');
    if (!bld || !MODES[mode] || mode === 'full' || !J) return null;
    var j = J.journeyOf(bld.id), pace = PACES[q('pace')] ? q('pace') : 'one';
    var all = J.piecesOf(bld).map(function (p) { return p.key; });
    if (mode === 'guided' || !j) {
      return { build: bld, bx: { mode: 'guided', pace: null, step: 0, of: 1, keys: all, added: j ? j.order.slice() : all, j: j, id: bld.id, full: true } };
    }
    var s = J.steps(j, pace), i = q('step') ? (+q('step') - 1) : Math.min(nextStep(bld.id, pace), s.length - 1);
    var r = J.stepBuild(bld, j, i, pace);
    var sb = r.build;
    if (!r.full) {
      /* the words on a partial build say what it is (presentation only: the engine never reads them) */
      var nm = function (k) { var p = j.pieces[k]; return p ? p.name : k; };
      sb.name = bld.name + ' (' + r.keys.length + ' of ' + all.length + ' pieces)';
      sb.engine = 'Journey match ' + (r.step + 1) + ' of ' + r.of + '. New this match: ' + r.added.map(nm).join(', ') + '.';
      sb.about = 'The build journey: this match has ' + plural(r.keys.length, 'piece', 'pieces') + ' of ' + all.length + ' (' + r.keys.map(nm).join(', ') + '). ' +
        'The full build: ' + (bld.engine || '');
    }
    return { build: sb, bx: { mode: 'journey', pace: pace, step: r.step, of: r.of, keys: r.keys, added: r.added, j: j, id: bld.id, full: r.full, orig: bld } };
  }
  function href(id) {
    var p = prefs();
    if (p.mode === 'full') return '';
    if (p.mode === 'guided') return '&bx=guided';
    var j = J && J.journeyOf(id); if (!j) return '&bx=guided';
    var s = J.steps(j, p.pace), i = nextStep(id, p.pace);
    if (i >= s.length) i = 0;   /* a finished journey starts again at match 1 */
    return '&bx=journey&pace=' + p.pace + '&step=' + (i + 1);
  }

  /* ------------------------------------------------ the Builds screen */
  var MODE_TXT = {
    journey: ['Build journey', 'Your build\'s pieces arrive one match at a time; your squad and its starred moves are there from match 1.'],
    guided: ['Guided match', 'The whole build in one match, with a note beside a card the first time each piece can be picked.'],
    full: ['Full build', 'The whole build in one match, with no notes: the page as it was.']
  };
  function buildsHead() {
    var p = prefs();
    return '<div class="bxmodes" id="bxmodes" role="radiogroup" aria-label="How to play a build">' +
      '<p class="bxmh">How to play a build</p>' +
      ['full', 'guided', 'journey'].map(function (m) {
        return '<label class="bxm' + (p.mode === m ? ' on' : '') + '"><input type="radio" name="bxmode" value="' + m + '"' + (p.mode === m ? ' checked' : '') + '>' +
          '<b>' + esc(MODE_TXT[m][0]) + '</b><span>' + esc(MODE_TXT[m][1]) + '</span></label>';
      }).join('') +
      '<p class="bxpace" id="bxpace"' + (p.mode === 'journey' ? '' : ' hidden') + '>Journey pace: ' +
        '<label><input type="radio" name="bxpace" value="one"' + (p.pace === 'one' ? ' checked' : '') + '> one new piece a match</label> ' +
        '<label><input type="radio" name="bxpace" value="short"' + (p.pace === 'short' ? ' checked' : '') + '> at most four matches (several pieces at once)</label></p></div>';
  }
  /* the journey line on a build's row: where you are */
  function rowHTML(b) {
    var p = prefs();
    if (p.mode !== 'journey' || !J) return '';
    var j = J.journeyOf(b.id); if (!j) return '';
    var s = J.steps(j, p.pace), i = nextStep(b.id, p.pace), n = j.order.length;
    if (i >= s.length) return '<p class="bxrow">Journey done: all ' + plural(n, 'piece', 'pieces') + ' played. Play starts it again at match 1.</p>';
    var first = j.pieces[j.order[0]];
    return '<p class="bxrow">Journey: match ' + (i + 1) + ' of ' + s.length + (i ? ' <button class="bxreset" data-bxreset="' + esc(b.id) + '">Restart</button>' : ', starting with ' + esc(first ? first.name : j.order[0])) + '</p>';
  }
  function wireBuilds(host, redraw) {
    Array.prototype.forEach.call(host.querySelectorAll('input[name=bxmode]'), function (el) {
      el.onchange = function () { setPref('mode', el.value); redraw(); };
    });
    Array.prototype.forEach.call(host.querySelectorAll('input[name=bxpace]'), function (el) {
      el.onchange = function () { setPref('pace', el.value); redraw(); };
    });
    Array.prototype.forEach.call(host.querySelectorAll('button[data-bxreset]'), function (el) {
      el.onclick = function (e) { if (e) e.stopPropagation(); reset(el.getAttribute('data-bxreset'), prefs().pace); redraw(); };
    });
  }

  /* ------------------------------------------------ the team sheet: the introduction */
  function pieceBlock(p, cls) {
    return '<div class="bxp ' + (cls || '') + '"><p class="bxpn">' + esc(p.name) + '</p>' +
      '<p class="bxl"><em>What it does</em> ' + esc(p.does) + '</p>' + (p.full && p.full.length > p.does.length + 3 ? '<details class="bxmore"><summary>The whole description</summary>' + esc(p.full) + '</details>' : '') +
      '<p class="bxl"><em>What to look for</em> ' + esc(p.look) + '</p>' +
      (p.link ? '<p class="bxl"><em>With what you have</em> ' + esc(p.link) + '</p>' : '') + '</div>';
  }
  /* "X, and Y which rarely acts on its own": a piece bundled in because it almost never comes up says so */
  function addedWords(j, keys) {
    var w = keys.map(function (k) { var p = j.pieces[k]; return (p ? p.name : k) + (p && p.rare ? ' which rarely acts on its own' : ''); });
    return w.length > 1 ? w.slice(0, -1).join(', ') + ', and ' + w[w.length - 1] : w[0];
  }
  function sheet(stage, run) {
    var bx = run && run.bx; if (!bx || !bx.j) return;
    var j = bx.j, h;
    if (bx.mode === 'journey') {
      var had = bx.keys.filter(function (k) { return bx.added.indexOf(k) < 0; });
      h = '<div class="card bxintro" id="bxintro"><p class="bxk">Build journey &middot; ' + esc(run.build && (bx.orig || run.build).name) + '</p>' +
        '<h2 class="bxh">Match ' + (bx.step + 1) + ' of ' + bx.of + ': ' + (bx.added.length === 1 ? 'a new piece' : 'this match adds ' + bx.added.length + ' pieces') + '</h2>' +
        (bx.added.length > 1 ? '<p class="bxl bxbundle">This match adds ' + bx.added.length + ' pieces: ' + addedWords(j, bx.added) + '.</p>' : '') +
        '<p class="bxfoot">Your build\'s pieces arrive one match at a time; your squad and its starred moves are there from match 1.</p>' +
        bx.added.map(function (k) { return j.pieces[k] ? pieceBlock(j.pieces[k], 'new') : ''; }).join('') +
        (had.length ? '<p class="bxhad"><em>Already in your team</em> ' + had.map(function (k) { return '<span class="bxchip" title="' + esc(j.pieces[k] ? j.pieces[k].does : '') + '">' + esc(j.pieces[k] ? j.pieces[k].name : k) + '</span>'; }).join('') + '</p>' : '') +
        '<p class="bxfoot">The new piece has a gold ring on its chip in the match. The numbers above come from ' + esc((root.KMJourneys && root.KMJourneys.n) || 60) + ' test matches played by the computer.</p>' +
        '<p class="row"><button class="go" id="bxkick">Kick off</button> <button class="ghost" id="bxsheet">See the team sheet</button></p></div>';
    } else {
      h = '<div class="card bxintro" id="bxintro"><p class="bxk">Guided match &middot; ' + esc(run.build.name) + '</p>' +
        '<h2 class="bxh">The whole build: ' + plural(bx.added.length, 'piece', 'pieces') + '</h2>' +
        '<p class="bxl">' + esc(run.build.engine || '') + '</p>' +
        '<p class="bxhad"><em>The pieces</em> ' + bx.added.map(function (k) { return '<span class="bxchip" title="' + esc(j.pieces[k] ? j.pieces[k].does : '') + '">' + esc(j.pieces[k] ? j.pieces[k].name : k) + '</span>'; }).join('') + '</p>' +
        '<p class="bxfoot">The first time each piece is on a card you can pick, a note beside the card says what it does there. After the match: what each piece did.</p>' +
        '<p class="row"><button class="go" id="bxkick">Kick off</button> <button class="ghost" id="bxsheet">See the team sheet</button></p></div>';
    }
    stage.insertAdjacentHTML('afterbegin', h);
    var k = document.getElementById('kick');
    document.getElementById('bxkick').onclick = function () { if (k) k.click(); };
    document.getElementById('bxsheet').onclick = function () { var t = document.getElementById('buildpanel') || document.querySelector('#stage table'); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'start' }); };
    try { window.scrollTo(0, 0); } catch (e) { }
  }

  /* ------------------------------------------------ in the match */
  var M = null;   /* this match: { run, focus{src:key}, called{src}, offered, taken, acts, lines, seen, off } */
  function startMatch(run) {
    M = null;
    closeCallout();
    var old = document.getElementById('bxtoast'); if (old && old.parentNode) old.parentNode.removeChild(old);
    var bx = run && run.bx; if (!bx || !run.st || !run.st.fx) return;
    var focus = {}, names = {};
    run.st.fx.inst.forEach(function (x) {
      if ((x.side || 'you') !== 'you') return;
      var k = J.instKey(x); names[x.name] = k;
      if (bx.mode === 'guided' || bx.added.indexOf(k) >= 0) focus[x.name] = k;
    });
    M = { run: run, st: run.st, focus: focus, names: names, called: {}, offered: {}, taken: {}, together: {}, lines: {}, seen: 0, off: false, menus: 0, toasted: {} };
    observe();
  }
  function ring() { return M && M.run.bx.mode === 'journey'; }
  /* the gold ring on the new piece's chips (cards and the panel), whenever they are drawn */
  var obs = null;
  function decorate(rootEl) {
    if (!M || !ring()) return;
    Array.prototype.forEach.call((rootEl || document).querySelectorAll('.bvp[data-src], .bvpc[data-src]'), function (el) {
      if (M.focus[el.getAttribute('data-src')] && !el.classList.contains('bxnew')) { el.classList.add('bxnew'); if (!el.getAttribute('data-bxt')) { el.setAttribute('data-bxt', '1'); el.title = 'New this match. ' + (el.title || ''); } }
    });
  }
  function observe() {
    if (obs || typeof MutationObserver === 'undefined') { decorate(); return; }
    obs = new MutationObserver(function () { decorate(); });
    obs.observe(document.body, { childList: true, subtree: true });
  }
  function firstLine(src, t, min, card) {
    if (!M || M.lines[src] || !t) return;
    t = String(t).replace(/\s*\.$/, '');
    M.lines[src] = (min != null ? min + '\': ' : '') + (card ? card.replace(/\s*\.$/, '') + ' (' + t + ')' : t);
  }
  /* lines a piece wrote since the last menu (between decisions) */
  function scanLog(toast) {
    var log = M.st.fx.log, out = [];
    for (; M.seen < log.length; M.seen++) {
      var l = log[M.seen];
      if (!M.names[l.source] || l.kind === 'expire' || l.kind === 'limit') continue;
      if (/\(it lasted this |is no longer |is over|stops: /.test(l.text)) continue;
      firstLine(l.source, l.text, l.minute);
      if (l.kind !== 'option' && M.focus[l.source]) out.push(l);
    }
    if (toast && out.length) showToast(out[0].source, out[0].text, 'between');
  }
  function cardOf(el) { return el ? (el.closest ? el.closest('.optw') || el.closest('.opt') : el) : null; }
  function onMenu(p) {
    if (!M || M.st !== (M.run && M.run.st) || !p) return;
    M.menus++;
    scanLog(true);
    var live = p.moment.options.filter(function (o) { return !o.disabled; }), here = {}, first = null;
    p.moment.options.forEach(function (o, i) {   /* i: the option's place on the menu, the card's id (#optw-i) */
      if (o.disabled) return;
      BV.pieces(o, M.st).forEach(function (s) {
        if ((s.kind !== 'bonus' && s.kind !== 'pen') || !M.names[s.source]) return;
        if (!here[s.source]) { here[s.source] = 1; M.offered[s.source] = (M.offered[s.source] || 0) + 1; }
        if (M.focus[s.source] && !M.called[s.source] && !first) first = { src: s.source, s: s, o: o, i: i };
      });
    });
    decorate();
    var OBC = root.KMObCoach;
    if (first && !M.off && !(OBC && OBC.open && OBC.open())) setTimeout(function () { if (M && M.st.pending === p) callout(first); }, 500);
  }
  function onPick(o, ev) {
    if (!M || !o) return;
    closeCallout();
    BV.pieces(o, M.st).forEach(function (s) { if ((s.kind === 'bonus' || s.kind === 'pen') && M.names[s.source]) M.taken[s.source] = (M.taken[s.source] || 0) + 1; });
    var c = ev && ev.bv; if (!c) return;
    c.pieces.forEach(function (x) {
      firstLine(x.source, x.phrase, ev.minute, String(o.label || '').replace(/<[^>]*>/g, ''));
      if (c.pieces.length >= 2) c.pieces.forEach(function (y) { if (y !== x) { M.together[x.source] = M.together[x.source] || {}; M.together[x.source][y.source] = (M.together[x.source][y.source] || 0) + 1; } });
    });
    var f = c.pieces.filter(function (x) { return M.focus[x.source]; })[0];
    if (f) showToast(f.source, f.phrase, c.pieces.length >= 2 ? 'combo:' + c.name : 'card');
    M.seen = M.st.fx.log.length;
  }
  /* the note beside a card: what this piece is, and what it does on this card */
  var cur = null;
  function closeCallout() { if (cur) { try { cur.parentNode.removeChild(cur); } catch (e) { } cur = null; } Array.prototype.forEach.call(document.querySelectorAll('.bxcall'), function (e) { e.classList.remove('bxcall'); }); }
  function callout(f) {
    if (!M) return;
    /* the card of the option the note describes (review finding 5: not the first card that carries the chip) */
    var sel = '.bvp[data-src="' + (window.CSS && CSS.escape ? CSS.escape(f.src) : f.src.replace(/"/g, '\\"')) + '"]';
    var card = document.getElementById('optw-' + f.i), chip = card ? card.querySelector(sel) : null;
    if (BREAK === 'anchor') { var all = document.querySelectorAll('#cards ' + sel); chip = all[all.length - 1] || null; card = cardOf(chip); }
    if (!card || !chip) return;
    M.called[f.src] = 1;
    closeCallout();
    var k = M.focus[f.src], jp = M.run.bx.j && M.run.bx.j.pieces[k];
    var nth = M.run.bx.mode === 'guided' ? Object.keys(M.called).length : 0;
    var b = document.createElement('div');
    b.className = 'bxcallout'; b.id = 'bxcallout'; b.setAttribute('role', 'note');
    b.setAttribute('data-card', card.id || ''); b.setAttribute('data-opt', String(f.i)); b.setAttribute('data-label', String(f.o.label || ''));
    b.innerHTML = '<p class="bxk">' + (M.run.bx.mode === 'journey' ? 'Your new piece is on this card' : 'Piece ' + nth + ' of ' + Object.keys(M.focus).length + ' is on this card') + '</p>' +
      '<p class="bxpn">' + esc(jp ? jp.name : f.src) + '</p>' +
      '<p class="bxl"><em>Here</em> ' + esc(f.s.full.join(' ')) + '</p>' +
      (jp ? '<p class="bxl"><em>In general</em> ' + esc(jp.does) + '</p>' : '') +
      '<p class="bxbtns"><button class="go sm" id="bxok">Got it</button>' + (M.run.bx.mode === 'guided' ? ' <button class="bxquiet" id="bxstop">No more notes this match</button>' : '') + '</p>';
    document.body.appendChild(b);
    if (chip) chip.classList.add('bxcall');
    place(b, card);
    cur = b;
    b.querySelector('#bxok').onclick = function () { closeCallout(); };
    if (b.querySelector('#bxstop')) b.querySelector('#bxstop').onclick = function () { M.off = true; closeCallout(); };
  }
  function place(b, card) {
    var r = card.getBoundingClientRect(), sx = window.pageXOffset || 0, sy = window.pageYOffset || 0, W = document.documentElement.clientWidth;
    var w = Math.min(320, W - 32);
    b.style.width = w + 'px';
    if (r.left - w - 14 >= 8) { b.style.left = (r.left + sx - w - 14) + 'px'; b.style.top = (r.top + sy) + 'px'; b.classList.add('left'); return; }
    /* a phone: under the card when it fits in the window, otherwise over it (the cards are at the bottom of the screen) */
    b.style.left = Math.max(16, Math.min(W - w - 16, r.left + sx)) + 'px';
    var hh = b.offsetHeight || 220, vh = window.innerHeight || 800;
    if (BREAK === 'place' || r.bottom + 10 + hh <= vh || r.top - 10 - hh < 0) { b.style.top = (r.bottom + sy + 10) + 'px'; b.classList.add('below'); }
    else { b.style.top = (r.top + sy - 10 - hh) + 'px'; b.classList.add('above'); }
  }
  /* the loud moment: a line above the build panel when a piece you are learning acts */
  var toastT = null;
  function showToast(src, text, how) {
    if (!M) return;
    if (M.run.bx.mode === 'guided' && M.toasted[src]) return;   /* guided: the first time each piece acts */
    M.toasted[src] = 1;
    var panel = document.getElementById('bvpanel'); if (!panel || !panel.parentNode) return;
    /* a phone hides the panel's column while the play runs: there the line lives on the body, fixed at the bottom */
    var narrow = (window.innerWidth || 1200) <= 640 && BREAK !== 'toast';
    var t = document.getElementById('bxtoast');
    if (t && (t.parentNode === document.body) !== narrow) { t.parentNode.removeChild(t); t = null; }
    if (!t) { t = document.createElement('div'); t.id = 'bxtoast'; t.setAttribute('aria-live', 'polite'); if (narrow) document.body.appendChild(t); else panel.parentNode.insertBefore(t, panel); }
    var nm = BV.pieceName(src), combo = /^combo:/.test(how) ? how.slice(6) : null;
    var head = M.run.bx.mode === 'journey' ? 'Your new piece acted' : 'First time this piece acted';
    t.innerHTML = '<b>' + head + (how === 'between' ? ', between decisions' : '') + '</b> ' + esc(nm) + ': ' + esc(String(text || '').replace(/\s*\.$/, '')) + '.' +
      (combo ? ' <span class="bxtc">Combination: ' + esc(combo) + '</span>' : '');
    t.className = 'on';
    if (toastT) clearTimeout(toastT);
    toastT = setTimeout(function () { var e = document.getElementById('bxtoast'); if (e) e.className = ''; }, 7000);
  }

  /* ------------------------------------------------ full time: the review */
  function review(run, r) {
    if (!M || M.run !== run || !run.bx) return '';
    closeCallout();
    var tt = document.getElementById('bxtoast'); if (tt) tt.className = '';
    scanLog(false);
    var bx = run.bx, j = bx.j, st = run.st, fires = BV.fires(st), rows = [];
    st.fx.inst.forEach(function (x) {
      if ((x.side || 'you') !== 'you') return;
      var k = J.instKey(x), jp = j && j.pieces[k];
      rows.push({ src: x.name, k: k, jp: jp, name: jp ? jp.name : x.name, isNew: bx.mode === 'journey' && bx.added.indexOf(k) >= 0,
        acts: fires[x.name] || 0, off: M.offered[x.name] || 0, took: M.taken[x.name] || 0, line: M.lines[x.name] || null, tog: M.together[x.name] || {} });
    });
    var ord = j ? j.order : [];
    rows.sort(function (a, b) { return (b.isNew - a.isNew) || (ord.indexOf(a.k) - ord.indexOf(b.k)); });
    var inMatch = {}, bySrc = {}; rows.forEach(function (w) { inMatch[w.k] = 1; bySrc[w.src] = w; });
    /* a declared partner: the journey data names the other piece as this one's partner (or the reverse) AND
     * they acted on the same decision at least 0.5 times a match in the test matches (PARTNER_MIN) */
    function declared(w, src) {
      var o = bySrc[src]; if (!o) return null;
      var a = w.jp && w.jp.partner, b = o.jp && o.jp.partner;
      if (a && a.key === o.k && a.per >= PARTNER_MIN) return a;
      if (b && b.key === w.k && b.per >= PARTNER_MIN) return b;
      return null;
    }
    function tryNext(w) {
      if (!w.acts && !w.off) return 'It never came up. ' + (w.jp ? w.jp.look : '');
      if (w.off && !w.took) return 'Its chip was on a card ' + plural(w.off, 'time', 'times') + ' and you picked another card each time. Next match, pick the card with its chip once and see what it does.';
      var tg = Object.keys(w.tog).sort(function (a, b) { return w.tog[b] - w.tog[a]; })[0];
      if (tg) return 'It acted together with ' + BV.pieceName(tg) + ' on ' + plural(w.tog[tg], 'decision', 'decisions') + '. ' +
        (declared(w, tg) ? 'These two are partners in this build (in test matches they acted on the same decision about ' + declared(w, tg).words.replace(/^about /, '') + '): look for it again.' : 'This was a combination.');
      var pt = w.jp && w.jp.partner && inMatch[w.jp.partner.key] ? w.jp.partner : null;
      if (pt) return 'It did not act together with ' + pt.name + ' this match. In test matches they acted on the same decision ' + pt.words + ': look for both in one attack.';
      return w.off ? 'You picked its card ' + plural(w.took, 'time', 'times') + ' of the ' + plural(w.off, 'time', 'times') + ' it was on a card.' : 'It acts on its own, between decisions: keep an eye on its count on the build panel.';
    }
    var ftm = BV.ftModel(st, run.picks || []);
    var h = '<div class="bxrev" id="bxreview"><p class="obe-h">' + (bx.mode === 'journey' ? 'What your pieces did (journey match ' + (bx.step + 1) + ' of ' + bx.of + ')' : 'What your pieces did') + '</p>' +
      '<div class="bxrows">' + rows.map(function (w) {
        return '<div class="bxrr' + (w.isNew ? ' new' : '') + (w.acts ? '' : ' idle') + '"><p class="bxrn">' + esc(w.name) + (w.isNew ? ' <i>new</i>' : '') + '</p>' +
          '<p class="bxrc">Acted <b>' + w.acts + '</b> ' + (w.acts === 1 ? 'time' : 'times') + ' &middot; on a card ' + plural(w.off, 'time', 'times') + ' &middot; you picked it ' + plural(w.took, 'time', 'times') + '</p>' +
          (w.line ? '<p class="bxrl">For example: ' + esc(w.line) + '.</p>' : '') +
          '<p class="bxrt"><em>Next time</em> ' + esc(tryNext(w)) + '</p></div>';
      }).join('') + '</div>' +
      (ftm && ftm.best ? '<p class="bxl"><em>Best combination, ' + esc(ftm.best.minute) + '\'</em> ' + esc(ftm.best.line) + '.</p>' : '<p class="bxl"><em>Combinations</em> No decision had two of your pieces acting at once.</p>') +
      (ftm ? '<p class="bxl bxsum">' + esc(ftm.changed) + '</p>' : '');
    /* what comes next */
    if (bx.mode === 'journey') {
      var s = J.steps(j, bx.pace), nx = bx.step + 1;
      if (nx < s.length) {
        var add = j.order.slice(s[bx.step], s[nx]);
        h += '<div class="bxnext"><p class="bxk">Next match (' + (nx + 1) + ' of ' + s.length + ') adds ' + (add.length > 1 ? add.length + ' pieces' : '') + '</p>' +
          (add.length > 1 ? '<p class="bxl">' + esc(addedWords(j, add)) + '.</p>' : '') + add.map(function (k) {
          var p = j.pieces[k]; return '<p class="bxl"><b>' + esc(p ? p.name : k) + '</b> ' + esc(p ? p.does : '') + '</p>';
        }).join('') + '<p class="row"><button class="go" id="bxnextbtn">Play match ' + (nx + 1) + ' of ' + s.length + '</button> <button class="ghost" id="bxsame">Play this match again</button></p></div>';
      } else {
        h += '<div class="bxnext"><p class="bxk">Journey done</p><p class="bxl">That was the full build, every piece in. ' + esc((bx.orig || run.build).engine || '') + '</p>' +
          '<p class="row"><button class="go" id="bxbuilds">Back to the builds</button> <button class="ghost" id="bxsame">Play the full build again</button></p></div>';
      }
    } else {
      h += '<div class="bxnext"><p class="row"><button class="go" id="bxjourney">Try it as a build journey</button> <button class="ghost" id="bxbuilds">Back to the builds</button></p></div>';
    }
    return h + '</div>';
  }
  /* after the full-time screen is up: mark the step done, wire the buttons */
  function afterReview(run, host, onSame) {
    if (!run || !run.bx) return;
    var bx = run.bx;
    /* progress: the match after the last one finished (replaying an earlier match moves it back there) */
    if (bx.mode === 'journey' && !bx.doneMarked) { bx.doneMarked = true; setNext(bx.id, bx.pace, bx.step + 1); }
    var ft = document.querySelector('#obend .ft-two'), rv = document.getElementById('bxreview');
    if (ft && rv && rv.parentNode !== ft.parentNode) ft.parentNode.insertBefore(rv, ft);
    function go(qs) { window.location.search = qs; }
    var opp = q('opp');
    var o = opp ? '&opp=' + opp : '';
    var nb = document.getElementById('bxnextbtn');
    if (nb) nb.onclick = function () { go('?build=' + encodeURIComponent(bx.id) + '&bx=journey&pace=' + bx.pace + '&step=' + (bx.step + 2) + o); };
    var sb = document.getElementById('bxsame'); if (sb) sb.onclick = function () { var a = document.getElementById('again'); if (a) a.click(); };
    var bb = document.getElementById('bxbuilds'); if (bb) bb.onclick = function () { go('?builds'); };
    var jb = document.getElementById('bxjourney'); if (jb) jb.onclick = function () { setPref('mode', 'journey'); reset(bx.id, prefs().pace); go('?build=' + encodeURIComponent(bx.id) + '&bx=journey&pace=' + prefs().pace + '&step=1' + o); };
  }
  /* "Play the build again" on the start screen (review finding 7): the address of the same mode and
   * step, so a journey step is never replayed as a plain build; null when the run had no bx */
  function againQuery(run) {
    var bx = run && run.bx; if (!bx || BREAK === 'again') return null;
    var o = q('opp') ? '&opp=' + q('opp') : '';
    if (bx.mode === 'guided') return '?build=' + encodeURIComponent(bx.id) + '&bx=guided' + o;
    return '?build=' + encodeURIComponent(bx.id) + '&bx=journey&pace=' + bx.pace + '&step=' + (bx.step + 1) + o;
  }
  /* for telemetry's match_start */
  function now(run) {
    if (!run || !run.build) return null;
    var bx = run.bx;
    if (!bx) return { mode: 'full', step: null, of: null, pace: null, pieces: null };
    return { mode: bx.mode, step: bx.mode === 'journey' ? bx.step + 1 : null, of: bx.mode === 'journey' ? bx.of : null, pace: bx.pace, pieces: bx.keys.slice(), added: bx.added.slice(), full: !!bx.full };
  }

  var CSS = [
    '.bxmodes{margin:12px 0 4px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:color-mix(in srgb,var(--gold) 5%,transparent)}',
    '.bxmh{margin:0 0 6px;font:800 11px ui-sans-serif,system-ui;letter-spacing:.09em;text-transform:uppercase;color:var(--gold)}',
    '.bxm{display:grid;grid-template-columns:auto 1fr;column-gap:8px;align-items:baseline;padding:6px 8px;border-radius:9px;cursor:pointer;border:1px solid transparent}',
    '.bxm input{grid-row:1 / 3;margin:0}',
    '.bxm b{font-size:14px;color:var(--ink)} .bxm span{grid-column:2;font-size:12.5px;line-height:1.35;color:var(--muted)}',
    '.bxm.on{border-color:color-mix(in srgb,var(--gold) 55%,transparent);background:color-mix(in srgb,var(--gold) 9%,transparent)}',
    '.bxpace{margin:6px 0 0 8px;font-size:12.5px;color:var(--muted)} .bxpace label{margin-right:10px;white-space:nowrap}',
    '.bxrow{margin:2px 0 0;font-size:12.5px;color:var(--gold)} .brow .bxrow{grid-column:2}',
    '@media (max-width:560px){.brow .bxrow{grid-column:1}}',
    '.bxreset{font:inherit;font-size:12px;background:none;border:0;color:var(--muted);text-decoration:underline;cursor:pointer;padding:0 4px}',
    '.bxintro{border:1px solid color-mix(in srgb,var(--gold) 55%,transparent);margin-bottom:12px}',
    '.bxk{margin:0;font:800 11px ui-sans-serif,system-ui;letter-spacing:.09em;text-transform:uppercase;color:var(--gold)}',
    '.bxh{margin:2px 0 8px;font-size:19px}',
    '.bxp{margin:0 0 8px;padding:8px 10px;border-radius:10px;border:1px solid var(--line)} .bxp.new{border:2px solid var(--gold)}',
    '.bxpn{margin:0 0 4px;font-weight:800;font-size:15px;color:var(--ink)}',
    '.bxl{margin:0 0 5px;font-size:13.5px;line-height:1.42} .bxl em,.bxhad em,.bxrt em{font-style:normal;font-weight:800;color:var(--gold);margin-right:4px}',
    '.bxmore{margin:-2px 0 6px;font-size:12.5px;color:var(--muted);line-height:1.4} .bxmore summary{cursor:pointer}',
    '.bxhad{margin:4px 0 6px;font-size:13px} .bxchip{display:inline-block;margin:2px 4px 2px 0;padding:1px 8px;border-radius:99px;border:1px solid color-mix(in srgb,var(--gold) 50%,transparent);font-size:12px;cursor:help}',
    '.bxfoot{margin:4px 0 8px;font-size:12px;color:var(--muted)}',
    /* the ring on the new piece: the chip itself, no new words */
    '.bvp.bxnew,.bvpc.bxnew{box-shadow:0 0 0 2px var(--gold),0 0 10px color-mix(in srgb,var(--gold) 60%,transparent);border-color:var(--gold)}',
    '.bvpc.bxnew.fired{animation:bxpulse 1.6s ease-out 2}',
    '@keyframes bxpulse{0%{box-shadow:0 0 0 2px var(--gold),0 0 0 0 color-mix(in srgb,var(--gold) 80%,transparent)}100%{box-shadow:0 0 0 2px var(--gold),0 0 0 14px transparent}}',
    '@media (prefers-reduced-motion:reduce){:root:not([data-a11y-full="on"]) .bvpc.bxnew.fired{animation:none}}',
    '.bvp.bxcall{outline:2px solid var(--gold);outline-offset:2px}',
    '.bxcallout{position:absolute;z-index:60;padding:10px 12px;border-radius:12px;background:var(--surface,#10151f);color:var(--ink);border:2px solid var(--gold);box-shadow:0 8px 28px rgba(0,0,0,.45);font-size:13px}',
    '.bxcallout.left::after{content:"";position:absolute;right:-8px;top:18px;border:8px solid transparent;border-right:0;border-left-color:var(--gold)}',
    '.bxcallout .bxbtns{margin:6px 0 0} .bxquiet{font:inherit;font-size:12px;background:none;border:0;color:var(--muted);text-decoration:underline;cursor:pointer}',
    '#bxtoast{display:none;margin:10px 0 0;padding:7px 10px;border-radius:10px;border:2px solid var(--gold);background:color-mix(in srgb,var(--gold) 14%,var(--surface,transparent));font-size:13px;line-height:1.35}',
    '#bxtoast.on{display:block;animation:bxin .35s ease-out}',
    '#bxtoast b{display:block;color:var(--gold);font-size:11px;letter-spacing:.08em;text-transform:uppercase} #bxtoast .bxtc{display:block;font-weight:800;color:var(--gold);font-size:12px;margin-top:2px}',
    '@keyframes bxin{0%{transform:scale(.96);opacity:0}100%{transform:none;opacity:1}}',
    '.obe.ft2 .bxrev{margin:10px 0;padding:10px 14px;border-radius:12px;background:rgba(0,0,0,.24);border:1px solid color-mix(in srgb,#e0b000 55%,transparent);color:#fff;text-align:left}',
    '.bxrows{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px;margin:6px 0 8px}',
    '.bxrr{padding:7px 9px;border-radius:9px;border:1px solid rgba(255,255,255,.14)} .bxrr.new{border:2px solid #e0b000} .bxrr.idle{opacity:.8}',
    '.bxrn{margin:0 0 2px;font-weight:800;font-size:13.5px} .bxrn i{font-style:normal;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#e0b000;margin-left:4px}',
    '.bxrc{margin:0 0 3px;font-size:12px;color:var(--muted,#aab)} .bxrc b{color:#fff;font-size:14px}',
    '.bxrl{margin:0 0 3px;font-size:12.5px;line-height:1.35} .bxrt{margin:0;font-size:12.5px;line-height:1.35}',
    '.bxrev .bxsum{color:var(--muted,#aab);font-size:12.5px}',
    '.bxrev .bxnext{border-top:1px solid rgba(255,255,255,.14);padding-top:8px} .bxrev .bxnext .row{margin:6px 0 0}',
    '@media (max-width:640px){.bxrows{grid-template-columns:1fr}.bxcallout{font-size:12.5px}',
    /* a phone: the build panel is off screen while the play runs, so the line sits at the bottom of the window (over the locked cards) */
    '  #bxtoast{position:fixed;left:10px;right:10px;bottom:10px;z-index:55;margin:0;box-shadow:0 6px 24px rgba(0,0,0,.5)}}'
  ].join('\n');
  function css() { if (document.getElementById('bxcss') || !document.head) return; var s = document.createElement('style'); s.id = 'bxcss'; s.textContent = CSS; document.head.appendChild(s); }
  css();

  root.KMBXU = { prepare: prepare, href: href, buildsHead: buildsHead, rowHTML: rowHTML, wireBuilds: wireBuilds, sheet: sheet,
    startMatch: startMatch, againQuery: againQuery, onMenu: onMenu, onPick: onPick, review: review, afterReview: afterReview, now: now, prefs: prefs,
    _m: function () { return M; } };
})(typeof window !== 'undefined' ? window : globalThis);
