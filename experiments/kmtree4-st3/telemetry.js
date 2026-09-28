/* Match-core playtest telemetry.
 *
 * Records what a player is shown and what they decide, so a match can be read
 * back move by move afterwards (tel_read.py). Same Supabase table and the same
 * client behaviour as the public Dugout build (docs/playtest-telemetry.md):
 * anonymous random session id, one run id per match, batched POSTs, a
 * keepalive flush when the tab hides or closes, and every failure silent.
 *
 * It needs no edits to play.html beyond loading this file LAST: it wraps
 * window.KMMatch.newMatch / next / choose in place. play.html calls them as
 * X.newMatch(...) on the same object, so the wrappers are what it runs.
 *
 * Sends nothing when: the URL has notel=1, the browser is automated
 * (navigator.webdriver), fetch is missing, or KMMatch is not on the page.
 * Under node (the tests) it does nothing at all.
 *
 * ?teltest=1 tags every event with build "matchcore-test" (and allows an
 * automated browser), so verification runs are kept out of real data.
 *
 * The URL and anon key below are public by design: the anon key can only
 * INSERT into tel_events (row level security); reading needs the service key,
 * which never goes in this repo.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  /* playcheck.js runs the real page under node with a DOM shim, window set to
   * global and node's own fetch available: without this line every test run
   * would post a fake match to the live table. */
  if (typeof process !== 'undefined' && process.versions && process.versions.node) return;

  var CFG = {
    url: 'https://zirfwbjwvnjuzrqmfsbs.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppcmZ3Ymp3dm5qdXpycW1mc2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNTU2MTQsImV4cCI6MjEwMzgzMTYxNH0.htae7NLTMV7NF7dsJHrSxK2b0Eem-eQ5tS_43iCgLRA',
    build: 'matchcore-kmtree4-st3'
  };

  try {
    var q = String((window.location && window.location.search) || '');
    var test = /[?&]teltest=1(&|$)/.test(q);
    if (/[?&]notel=1(&|$)/.test(q)) return;
    if (!test && window.navigator && window.navigator.webdriver) return;
    if (typeof window.fetch !== 'function') return;
    var X = window.KMMatch;
    if (!X || X.__tel) return;
    if (test) CFG.build = 'matchcore-test';
  } catch (e) { return; }

  var sid;
  try {
    sid = window.localStorage.getItem('cantera-mc-sid');
    if (!sid) {
      sid = Math.random().toString(36).slice(2, 12);
      window.localStorage.setItem('cantera-mc-sid', sid);
    }
  } catch (e) { sid = 's' + Math.random().toString(36).slice(2, 10); }

  var runId = null, seq = 0, t0 = 0, buf = [], timer = null;
  var now = function () {
    try { return window.performance.now(); } catch (e) { return Date.now(); }
  };

  function post(rows, keepalive) {
    try {
      window.fetch(CFG.url + '/rest/v1/tel_events', {
        method: 'POST', keepalive: !!keepalive,
        headers: { 'Content-Type': 'application/json', apikey: CFG.key,
                   Authorization: 'Bearer ' + CFG.key,
                   Prefer: 'return=minimal' },
        body: JSON.stringify(rows)
      }).catch(function () {});
    } catch (e) {}
  }
  function flush(keepalive) {
    try {
      if (!buf.length) return;
      var rows = buf; buf = [];
      clearTimeout(timer); timer = null;
      post(rows, keepalive);
    } catch (e) {}
  }
  function log(type, data) {
    try {
      if (!runId) return;
      var d = data || {};
      d.t = Date.now() - t0;
      buf.push({ session_id: sid, run_id: runId, build: CFG.build,
                 seq: seq++, type: type, data: d });
      if (buf.length >= 5) flush();
      else if (!timer) timer = setTimeout(function () { flush(); }, 3000);
    } catch (e) {}
  }

  /* ---- compact snapshots ------------------------------------------- */

  function num(v) { return typeof v === 'number' ? Math.round(v * 1000) / 1000 : v; }
  function nm(p) { return p ? (p.name || p.id || null) : null; }

  function player(p, bench) {
    var r = { id: p.id, name: p.name, role: p.role };
    if (p.pos !== undefined) r.pos = p.pos;
    if (p.short !== undefined) r.short = p.short;
    if (p.line !== undefined) r.line = p.line;
    if (p.slot !== undefined) r.slot = p.slot;
    if (p.attr) r.attr = p.attr;
    if (p.heightM !== undefined) r.heightM = p.heightM;
    if (p.height !== undefined) r.height = p.height;
    if (p.isKeeper) r.keeper = true;
    if (bench) r.bench = true;
    return r;
  }
  function squad(s) {
    if (!s) return null;
    var out = { club: s.club && (s.club.name || s.club), formation: s.formation, players: [] };
    try {
      if (s.keeper) out.players.push(player(s.keeper));
      (s.players || []).forEach(function (p) { out.players.push(player(p)); });
      (s.bench || []).forEach(function (p) { out.players.push(player(p, true)); });
    } catch (e) {}
    return out;
  }
  /* st3 (Codex review of st3, item 2): what the card said beyond its odds, so a match can be read back */
  function first(p) { return p ? String(p.name || '').split(' ')[0] : null; }
  function recs(o) {
    return (o.fx || []).filter(function (r) { return !r.idle; }).map(function (r) { return { source: r.source, field: r.field, band: r.band || null, text: r.text }; });
  }
  function guessOf(o, st, p) {
    var g = o.guess; if (!g) return null;
    var you = !p || !p.moment || p.moment.sit.who !== 'them';
    var att = you ? o.actor : (p.theirMove && p.theirMove.att) || null, def = you ? o.foil : o.actor;
    return { n: g.n, kind: g.kind, same: !!g.same, why: g.why, defender: first(def), attacker: first(att) };
  }
  function rules(st) {
    var CA = window.KMContentA;
    return { guess: st && st.guess ? st.guess.mode : null, counter: st ? st.counter || null : null,
      learn: st && st.counter === 'learn' ? 'old' : 'off', show: CA && CA.SHOW_MODE ? CA.SHOW_MODE : null };
  }
  /* the rattled, booked and watched (marked) badges on screen, from bviz.js (the page's own reading) */
  function badges(st) {
    try {
      var BV = window.KMBuildViz; if (!BV || !st) return [];
      return BV.badges(st).filter(function (b) { return /^(rattled|booked|marked)$/.test(b.state); })
        .map(function (b) { return { state: b.state, who: first(b.p), side: b.side, label: b.label, sources: b.sources || [] }; });
    } catch (e) { return []; }
  }
  function option(o, i, st, p) {
    var c = o.chances || {};
    var r = {
      pos: i, id: o.id, label: o.label, disabled: !!o.disabled,
      odds: { good: num(c.good), mixed: num(c.mixed), bad: num(c.bad) },
      certain: !!(o.certain || c.certain),
      mineVal: o.mineVal, themVal: o.themVal,
      mineAttr: o.mineAttr, themAttr: o.themAttr,
      bonus: o.bonus || 0, actor: nm(o.actor), foil: nm(o.foil)
    };
    if (o.because) r.because = o.because;
    if (o.family) r.family = o.family;
    /* st3 */
    if (o.showSafe) r.showSafe = true;
    var g = guessOf(o, st, p); if (g) r.guess = g;
    var fx = recs(o); if (fx.length) r.fx = fx;
    r.outcomes = (o.outcomes || []).map(function (x) { return { effect: x.effect, text: x.text, p: num(x.p) }; });
    return r;
  }

  /* ---- the wrappers ------------------------------------------------ */

  var shown = null;          // the pending object last logged as a moment
  var shownAt = 0;           // when it was logged (the render follows at once)
  var stepNo = 0;            // decisions shown this match, follow-ups included
  var ended = false;

  function logMoment(p, st, why) {
    try {
      if (!p || (p === shown && !why)) return;
      shown = p; shownAt = now(); stepNo++;
      var mo = p.moment || {}, sit = mo.sit || {};
      var d = {
        step: stepNo, index: p.index, minute: p.minute,
        sit: sit.id, sitName: sit.name, who: sit.who,
        text: mo.text,
        options: (mo.options || []).map(function (o, i) { return option(o, i, st, p); })
      };
      /* st3: the attack for show, the rule switches, the badges on screen, and why this was logged again */
      d.showing = !!p.showing; if (p.shownBy) d.shownBy = p.shownBy;
      d.canShow = !!(st && X.canShowNow && orig.canShowNow ? orig.canShowNow.call(X, st) : false);
      d.rules = rules(st); d.badges = badges(st);
      if (why) d.relogged = why;
      if (p.lead !== undefined) d.lead = p.lead;
      if (p.continues !== undefined) d.continues = p.continues;
      if (p.broke) d.broke = p.broke;
      if (p.share !== undefined) d.share = num(p.share);
      if (p.legs) d.legs = { def: Math.round(p.legs.def), mid: Math.round(p.legs.mid), att: Math.round(p.legs.att) };
      log('moment', d);
    } catch (e) {}
  }

  var orig = { newMatch: X.newMatch, next: X.next, choose: X.choose, report: X.report, isOver: X.isOver, showAttack: X.showAttack, canShowNow: X.canShowNow };

  X.newMatch = function (sq, opp, seed, style, mopts) {
    var st = orig.newMatch.apply(this, arguments);
    try {
      flush();
      runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      seq = 0; t0 = Date.now(); shown = null; stepNo = 0; ended = false;
      /* m6: which build was loaded (yours and theirs), and the x1 and payoff
       * switches, so a match can be told apart without guessing from the
       * pieces that fired */
      var b = (mopts && mopts.build) || null, ob = (mopts && mopts.oppBuild) || null;
      var fxm = window.KMEffects;
      log('match_start', {
        seed: seed, style: st && st.style, moments: X.MOMENTS,
        page: String(window.location && window.location.pathname || '').split('/').pop(),
        you: squad(sq), them: squad(opp),
        buildId: b ? (b.id || null) : null, buildName: b ? (b.name || null) : null,
        oppBuildId: ob ? (ob.id || null) : null,
        x1: st && st.x1 ? st.x1 : null,
        rules: rules(st),   /* st3 */
        payoff: fxm && typeof fxm.payoffOn === 'function' ? !!fxm.payoffOn() : null,
        /* bx1: how the build was played: 'full' (s0's way), 'guided' or
         * 'journey', the journey's match (1-based) of how many, its pace, the
         * piece keys loaded and the ones new this match; null with no build */
        bxMode: window.__bxNow ? window.__bxNow.mode : null,
        bxStep: window.__bxNow ? window.__bxNow.step : null,
        bxOf: window.__bxNow ? window.__bxNow.of : null,
        bxPace: window.__bxNow ? window.__bxNow.pace : null,
        bxPieces: window.__bxNow ? window.__bxNow.pieces : null,
        bxAdded: window.__bxNow ? window.__bxNow.added || null : null
      });
      flush();
    } catch (e) {}
    return st;
  };

  X.next = function (st) {
    var p = orig.next.apply(this, arguments);
    logMoment(p, st);
    return p;
  };
  /* st3: pressing Show them one side rebuilds the menu without next(): log the press and the new menu */
  /* _edge/st1edge.js --break telshow (?stbreak=telshow): st3's first version (no wrap) */
  if (orig.showAttack && !/[?&]stbreak=telshow/.test(String(window.location.search || ''))) X.showAttack = function (st, by) {
    var ok = orig.showAttack.apply(this, arguments);
    try { if (ok && st && st.pending) { log('show_pressed', { step: stepNo, index: st.pending.index, by: by || 'you' }); logMoment(st.pending, st, 'show'); } } catch (e) {}
    return ok;
  };

  X.choose = function (st, index) {
    var p = st && st.pending, ms = null, pos = null, o = null;
    try {
      ms = p === shown ? Math.round(now() - shownAt) : null;
      if (p) {
        var live = p.moment.options.filter(function (x) { return !x.disabled; });
        o = live[index] || null;
        pos = o ? p.moment.options.indexOf(o) : null;
      }
    } catch (e) {}
    var ev = orig.choose.apply(this, arguments);
    try {
      if (ev) {
        var d = {
          step: stepNo, index: ev.index, minute: ev.minute,
          sit: ev.sit && ev.sit.id,
          option: o ? o.id : null, label: ev.label, pos: pos, liveIndex: index,
          ms: ms, dice: ev.dice ? {
            mine: ev.dice.mine, theirs: ev.dice.theirs, mineTotal: ev.dice.mineTotal,
            themTotal: ev.dice.themTotal, diff: ev.dice.diff, line: ev.dice.line
          } : null,
          certain: !!ev.certain, band: ev.band, effect: ev.effect, kind: ev.kind,
          text: ev.text, score: st && st.score ? { you: st.score.you, them: st.score.them } : null
        };
        /* st3: the chosen card's pieces and Guessing, and whether it was a card for show */
        if (o) { var cf = recs(o); if (cf.length) d.fx = cf; var cg = guessOf(o, st, p); if (cg) d.guess = cg; if (o.showSafe) d.showSafe = true; }
        d.shot = !!ev.shot;
        if (ev.fx && ev.fx.length) d.fxLines = ev.fx;
        if (ev.headline !== undefined) d.headline = ev.headline;
        if (ev.chains) d.chains = ev.chains;
        log('choice', d);
      }
      /* a play that continues sets the follow-up decision without next() */
      if (st && st.pending && st.pending !== p) logMoment(st.pending, st);
      if (st && !ended && orig.isOver.call(X, st)) {
        ended = true;
        var r = orig.report.call(X, st);
        log('match_end', {
          score: r.score ? { you: r.score.you, them: r.score.them } : null,
          won: r.won, drew: r.drew, counts: r.counts,
          lines: (r.lines || []).map(function (l) { return { good: l.good, head: l.head, why: l.why }; })
        });
        flush();
      }
    } catch (e) {}
    return ev;
  };

  X.__tel = { build: CFG.build, flush: flush, runId: function () { return runId; } };

  try {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { log('visibility', { state: 'hidden' }); flush(true); }
      else log('visibility', { state: 'visible' });
    });
    window.addEventListener('pagehide', function () { log('visibility', { state: 'leave' }); flush(true); });
  } catch (e) {}
})();
