/* simplay.js (kmtree6 b1, stream PLAY, 2026-10-07): THE SIM MODE. The match is the simulation: from the picture of a moment's first
 * decision a world (the pinned release, simpin.js) plays on. After each card the engine has settled (its dice, its odds, its rulings), the
 * card's result becomes a PLAN (who passes, carries or shoots, who wins it, where the keeper goes), the world plays the plan, then plays on
 * by itself until the next real chance (the world's chance()) or until the passage ends (the world's `ended`, or a cap here). At a chance
 * the engine builds the menu for the side on the ball at the place the world stopped (st.chain set from the world, X.next, then pm.js makes
 * the cards from where the men stand). The page and node both use this file; it never touches the DOM.
 *
 * SWITCHES (node: environment; page: ?flag). Each is a design call, written in kmtree6/DECISIONS-PLAY.md with its cost.
 *   KM_SIM / ?sim          on (default) | off (a16's match exactly: nothing here runs)
 *   KM_SIM_END / ?simend   handoff (default) | fresh   what follows a passage the world ended in free play: a ball your team won is your
 *                          next moment from where it was won (a16's "winning the ball is the next moment"), or always a fresh moment
 *   KM_SIM_STOPS / ?simstops  10 (default): decisions a passage at most (sd_run.js's ten stops)
 *   KM_SIM_WON / ?simwon   3 (default): the side on the ball may change this many times in a passage; one more ends it (a16's cont3 rule)
 *   KM_SIM_WORDS / ?simwords  real (default) | engine   the result's zone and holder words rewritten from where the world left the ball, or
 *                          the engine's words untouched (the check then counts what the picture contradicts)
 *   KM_SIMSTOPS / ?simstops   world (default, b4) | engine (b3: a moment's first decision is the engine's staged one). ?simstops=<number> is
 *                          still the cap of stops a passage; any non-number other than 'engine' means world
 *   KM_SIM_BREAK / ?simbreak  (checks only) reb | winback | yourbox | handdrop | freeshot | shooter | punchline (b4) | nowords | noplan | nostop | opensit | staleflags | nofoul | outwon | enginecarrier | handfresh | frameowner | plan1 | plan2 | plan3 | throw | endframe | tokeeper | kclear | recvcollect | ksweep | overall: each switches one piece off so its check must fail
 *
 * THE ENGINE'S STATE across a passage (sd_run.js, PREREG-SIMDOTS): after every card the match's moment counter and minute are put back
 * as they were at the passage's first decision, so every stop is a decision inside the same moment. When the passage ends:
 *   - the world ended during the card's own play and the engine also ended the attack: the engine's state stays as the engine left it
 *     (a goal, a free kick, a ball won into your next moment: the words and the engine agree, the world only drew it);
 *   - otherwise (the world ended in free play, or a cap, or the engine said play goes on and the world ended): the moment is over and the
 *     next one is fresh, or (simend=handoff) your attack from where your team won the ball.
 *   - a goal the engine scored always ends the passage, whatever the world drew (and the check counts the picture that missed it). */
(function (root, factory) {
  var api = factory(root);
  root.KMSimPlay = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var W = 68, L = 105, BOX_X = [13.84, 54.16];

  /* ------------------------------------------------------------------ switches */
  function readSw() {
    var env = {}; try { if (typeof process !== 'undefined' && process.env) env = process.env; } catch (e) { }
    var q = ''; try { q = (root.location && root.location.search) || ''; } catch (e) { }
    function get(en, qn, def) { var v = env[en], m = new RegExp('[?&]' + qn + '=([\\w.-]+)').exec(q); if (m) v = m[1]; return v === undefined || v === null || v === '' ? def : String(v); }
    return { on: !/^(off|none|0)$/.test(get('KM_SIM', 'sim', 'on')), end: get('KM_SIM_END', 'simend', 'handoff'), stops: +get('KM_SIM_STOPS', 'simstops', '10') || 10,
      won: +get('KM_SIM_WON', 'simwon', '3'), words: get('KM_SIM_WORDS', 'simwords', 'real'), brk: get('KM_SIM_BREAK', 'simbreak', ''),
      /* b4 (r1 item 6, lead ruling): 'world' = every open-play decision is a world stop (the engine's moment only sets who starts with the ball
       * and where; the world plays from there to its first chance); 'engine' = b3 (a moment's first decision is the engine's staged one) */
      first: (function () { var v = get('KM_SIMSTOPS', 'simstops', 'world'); return v === 'engine' ? 'engine' : 'world'; })(),
      /* b5 (r2 M4): how long free play may not take the ball from the team the dice left on it while the engine's attack goes on: 'stop' (until
       * the next stop or the end of play; the lead's wording), a number of seconds, or 'off' (b4; also KM_SIM_BREAK=undo) */
      keep: get('KM_SIMKEEP', 'simkeep', 'stop'),
      /* b5 (r2 B1, the lead's fallback): 'engine' = their ball over the top stays the engine's decision (the world cannot start a ball in the air,
       * so "the ball is in the air, dropping ... X is running onto it" would be drawn on the ground); 'world' = the world leads it (X runs onto
       * the still ball first, no flight) */
      ott: get('KM_SIMOTT', 'simott', 'engine') === 'world' ? 'world' : 'engine' };
  }
  var SW = readSw();

  /* ------------------------------------------------------------------ geometry and the view of the world PLAY reads */
  function hyp(a, b) { return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  /* the view: the men as the last frame has them (team, keeper, first name and running speed from the roster), the man on the ball (or the
   * man the stop named for a loose ball), the ball. Built from frames and the roster only, so any release that writes frames works. */
  function viewOf(P) {
    var w = P.w, f = w.frames[w.frames.length - 1], f0 = w.frames.length > 1 ? w.frames[w.frames.length - 2] : f, men = {}, ids = [];
    P.ros.forEach(function (r) {
      var q = f.pos[r.id]; if (!q) return;
      var q0 = (f0.pos && f0.pos[r.id]) || q, a = (r.p && r.p.attr) || {};
      men[r.id] = { id: r.id, team: r.team, keeper: !!r.keeper, name: P.first[r.id], x: q.x, y: q.y, vx: (q.x - q0.x) * 30, vy: (q.y - q0.y) * 30, v: 5.2 + 0.13 * (a.pace != null ? a.pace : 10) };
      ids.push(r.id);
    });
    /* b2 (sim_check C2, sim v1 seed 9013): the world can give the ball after the frame is written, so the live owner comes first */
    var holder = (SW.brk === 'frameowner' ? null : w.owner) || (f.holder !== undefined ? f.holder : f.owner) || null;
    return { men: men, ids: ids, owner: holder, H0: holder ? null : P.H0 || w.H0 || null, ball: { x: f.ball.x, y: f.ball.y } };
  }
  function V_team(V, id) { return id && V.men[id] ? V.men[id].team : null; }
  function other(t) { return t === 'you' ? 'them' : 'you'; }
  function dir(t) { return t === 'you' ? 1 : -1; }
  function goalOf(t) { return { x: 34, y: t === 'you' ? L : 0 }; }
  function up(t, q) { return t === 'you' ? q.y : L - q.y; }
  function side(V, t, outfield) { return V.ids.map(function (i) { return V.men[i]; }).filter(function (m) { return m.team === t && (!outfield || !m.keeper); }); }
  function keeperOf(V, t) { return side(V, t).filter(function (m) { return m.keeper; })[0] || null; }
  function nearest(V, q, t, not) { var b = null, bd = 1e9; V.ids.forEach(function (i) { var m = V.men[i]; if ((t && m.team !== t) || (not && not.indexOf(i) >= 0)) return; var d = hyp(m, q); if (d < bd) { bd = d; b = m; } }); return b; }
  function goalDist(m) { return hyp(m, goalOf(m.team)); }

  /* ------------------------------------------------------------------ the card's family (sd_run.js family(), word for word) */
  function family(o, who) {
    if (who !== 'you') return 'def';
    var id = o.id || '', k = (o.mc && o.mc.kind) || '', lab = o.label || '';
    if (/^Z_(SHOOT|SHOOT_EDGE|PLACE|CHIP)$/.test(id) || /^(shot|placed shot|chip)$/.test(k) || /\bshoots\b|places it|lifts it over/.test(lab)) return 'shot';
    if (/CROSS|SQUARE|CUT_?BACK/.test(id) || /cross|cut-back|square/.test(k) || /\bcrosses\b|cuts it back|across the goal/.test(lab)) return 'cross';
    if (/DRIBBLE|CARRY|TAKE_ON/.test(id) || /dribble|run with/.test(k) || /dribbles|runs with|runs at/.test(lab)) return 'carry';
    if (/PASS|THROUGH|SWITCH|LAYOFF|RECYCLE|HOLD|LATE_RUN|OVERLAP/.test(id) || /pass|switch|through/.test(k) || /passes|plays|gives it|switches|waits for|runs round/.test(lab)) return 'pass';
    return 'other';
  }

  /* ------------------------------------------------------------------ THE PLAN: the result sentence -> what the world plays.
   * A port of sd_world.planOf (kmtree5/review/simdots/v2) that writes DATA steps instead of the dots' closures, so any release can play it.
   * Every branch is planOf's, in planOf's order; the step's fields are planOf's arguments by name (b1/HANDOVER-PLAY.md, "The plan"). */
  var OUT_RX = /out of play|goes out\b|goes wide|for (?:a|their|your) corner|throw-in|goal kick|out for\b|wide, and/i;
  var OUT_RX2 = /out of play|goes out\b|goes wide|over the bar|for (?:a|their|your) corner|throw-in|goal kick|out for\b|wide, and/i;   /* b2: "goes over the bar" (sim_check C10; break plan1) */
  /* b4: the last zone phrase of a sentence (the same phrases the words use; "wide of" is never a place to run to) */
  var ZPH = ['into their box', 'in their box', 'at the edge of their box', 'to the edge of their box', 'outside their box', 'into your box', 'in your box', 'at the edge of your box', 'to the edge of your box', 'outside your box', 'in your half', 'into your half', 'in midfield', 'into midfield', 'wide of their box', 'wide of your box'];
  function lastZone(t) { var best = null, at = -1; ZPH.forEach(function (z) { var i = String(t).lastIndexOf(z); if (i > at || (i === at && best && z.length > best.length)) { at = i; best = z; } }); return at >= 0 && !/^wide of/.test(best) ? best : null; }
  var SHOT_VERB = /\b(?:shoots|places it|heads it (?:at|towards|toward|into|in)\b|hits it|curls it|chips it|chips the|volleys|strikes it|lobs|drives it|blasts|fires|side-foots|tries (?:a|his) shot|takes (?:a|his) shot|has a shot|slots|taps it in|tucks it|rolls it into|lifts it over|goes for goal)/;
  function planFrom(V, c) {
    var t = String(c.ev.text || ''), sd = c.side, def = other(sd), H = V.owner || V.H0 || (SW.brk === 'frameowner' ? null : (nearest(V, V.ball, sd) || {}).id) || null, named = c.names(t), mc = c.o.mc || {};
    var team = function (id) { return V_team(V, id); };
    var attN = named.filter(function (i) { return team(i) === sd; }), defN = named.filter(function (i) { return team(i) === def; });
    var P2 = SW.brk !== 'plan2', kp = keeperOf(V, def), kN = kp && (defN.indexOf(kp.id) >= 0 || (P2 && new RegExp('\\b' + (def === 'them' ? 'their' : 'your') + ' keeper\\b', 'i').test(t))), defO = defN.filter(function (i) { return !V.men[i].keeper; });
    var after = function (rx) { var m = rx.exec(t); if (!m) return null; var q = named.filter(function (i) { return t.indexOf(V.men[i].name.split(' ')[0]) < m.index; }); return q.length ? q[q.length - 1] : null; };
    var P1 = SW.brk !== 'plan1', goal = /\bGOAL\b|THEY SCORE|\bscores\b/.test(t), out = (P1 ? OUT_RX2 : OUT_RX).test(t), cross = /\bcross/i.test(t) || c.kind === 'cross', header = /\bhead(?:s|ed|er)?\b|in the air/i.test(t);
    var reb = after(/gets to (?:the (?:loose )?ball|it) first|has the rebound|gets his head to it first/), kHold = kN && /\b(holds|saves|catches|claims|collects|throws it out)\b/.test(t) && !/cannot hold|pushes|punches|palms|tips/.test(t);
    var kParry = kN && /pushes|punches|palms|tips|cannot hold|dives and/.test(t), foul = (P2 ? /\bfouls\b|free kick to|penalty to|gives a penalty/i : /\bfouls\b|free kick to|penalty to/i).test(t) && !/misses/.test(t);
    var won = (sd === 'you' && c.ev.kind === 'lost') || (sd === 'them' && c.ev.kind === 'escaped') || (P2 ? /\b(?:takes the ball|cuts out|reads the|heads (?:it|the cross) away|heads it out|kicks it clear|times the tackle|wins (?:it|the ball)|plays it straight to|blocks the|gets a (?:foot|hand) to)/ : /\b(?:takes the ball|cuts out|reads the|heads (?:it|the cross) away|kicks it clear|times the tackle|wins (?:it|the ball)|plays it straight to|blocks the|gets a (?:foot|hand) to)/).test(t);
    var winner = defO.length ? (after(P2 ? /\b(?:takes the ball|cuts out|reads the|heads (?:it|the cross) away|heads it out|kicks it clear|times the tackle|blocks the|gets a foot to)/ : /\b(?:takes the ball|cuts out|reads the|heads (?:it|the cross) away|kicks it clear|times the tackle|blocks the|gets a foot to)/) || defO[0]) : (kN ? kp.id : null);
    if (SW.brk !== 'plan3' && /\bblocks it\b/.test(t) && defN.length) { var bW = after(/\bblocks it\b/); if (bW && team(bW) === def) { won = true; winner = bW; } }   /* b2 P18: "Michael gets back and blocks it" (their keeper too) */
    if (winner && team(winner) !== def) winner = defO[0] || null;
    if (!winner && won) { var cand = (c.o.foil && team(c.o.foil.id) === def) ? c.o.foil.id : (c.o.actor && team(c.o.actor.id) === def) ? c.o.actor.id : null; winner = cand || (nearest(V, V.ball, def, kp ? [kp.id] : []) || {}).id; }
    var past = [], pr = /(?:gets|goes|squeezes|slips|runs) past ([A-Z][\wÀ-ɏ]+)|(?:metre|metres) (?:on|ahead of) ([A-Z][\wÀ-ɏ]+)|then past ([A-Z][\wÀ-ɏ]+)/g, pm;
    while ((pm = pr.exec(t))) { var nm = pm[1] || pm[2] || pm[3], id = defN.filter(function (i) { return V.men[i].name.split(' ')[0] === nm; })[0]; if (id && past.indexOf(id) < 0) past.push(id); }
    /* b2 P22 (break tokeeper; sim_check C10 "keeper takes", 5 of 305 on 16 Cups): "The ball runs through to their keeper" is drawn as the ball
     * running on to the keeper: the pass goes to a spot 3 m in front of him (not the receiver's run, 25 m out, where an outfield man got there
     * first), and a header or carry that "runs through to their keeper" is drawn that way too (it was a carry) */
    var TK = SW.brk !== 'tokeeper' && P2 && kp && /(?:runs through|goes straight|rolls) to (?:their|your) keeper|straight to (?:their|your) keeper/i.test(t), kq = null;
    /* b3 P25 (break ksweep; sim_check C10, seed 9029 of Cups 17 to 48): "Toby leaves his line and catches the ball before Rodri can get to it"
     * from midfield was a pass to Rodri's feet with the keeper 40 m away, who never reached it (play went on). The keeper who leaves his line
     * takes it where he can: the ball is aimed 10 m (at most half the way) out from him toward the man it was meant for */
    var KS = SW.brk !== 'ksweep' && kp && kHold && !TK && /\bleaves his line\b|\bcomes off his line\b/.test(t) && !/\bshoots|\bshot\b|heads it at/.test(t);
    if (TK && V.men[H]) { var kdx = V.men[H].x - kp.x, kdy = V.men[H].y - kp.y, kdd = Math.max(1, Math.sqrt(kdx * kdx + kdy * kdy)); kq = { x: kp.x + kdx / kdd * 3, y: kp.y + kdy / kdd * 3 }; }
    /* b4 (r1 item 2, break winback): "Luke gets a foot to it, but your team wins it straight back and keeps the ball" (the Second chance piece) */
    var WB = SW.brk !== 'winback' && sd === 'you' && /your team wins it straight back/.test(t);
    /* b4 (r1 item 3, break yourbox): their "gets past X, into your box" is aimed at your box (it read only "edge of your box") */
    var f = dir(sd), Hm = V.men[H], zup = sd === 'you' ? (/(?:in|into) their box/.test(t) ? 91 : /edge of their box/.test(t) ? 72 : /(?:in|into) midfield/.test(t) ? 42 : 0) : (SW.brk !== 'yourbox' && /(?:in|into) your box/.test(t) ? 91 : /edge of your box/.test(t) ? 67 : 0);
    var fwd = function (m, d) { var u = Math.max(up(sd, m) + d, zup); if (P1) u = Math.min(u, L - 4); var x = clamp(m.x + (34 - m.x) * (zup >= 91 ? 0.6 : 0.15), 4, W - 4); return { x: r3(x), y: r3(sd === 'you' ? u : L - u) }; };
    var carT = function (m, q) { return clamp(hyp(m, q) / (0.85 * m.v) + 0.4, 1.5, 5); };
    var inBox = function (tm) { return side(V, tm, true).filter(function (m) { return m.id !== H && up(tm, m) > L - 18 && Math.abs(m.x - 34) < 20; }).sort(function (a, b) { return goalDist(a) - goalDist(b); })[0] || side(V, tm, true).filter(function (m) { return m.id !== H; }).sort(function (a, b) { return goalDist(a) - goalDist(b); })[0]; };
    var Q = [], recv = (mc.man && team(mc.man.id || mc.man) === sd ? (mc.man.id || mc.man) : null) || attN.filter(function (i) { return i !== H; })[0] || null;
    var shooter = attN.filter(function (i) { return i !== H; })[0] && (c.kind === 'shot' || sd === 'them') ? attN.filter(function (i) { return i !== H; })[0] : H;
    /* b4 (break shooter; sim_check C19): the man named right before the shot's verb strikes it ("Yamal places it ... Oyarzabal gets to the
     * loose ball first" was drawn as Oyarzabal shooting, the first named man who is not on the ball) */
    if (SW.brk !== 'shooter') { var shN = after(SHOT_VERB); if (shN && team(shN) === sd) shooter = shN; }
    var over = P2 && /over the bar/i.test(t), wideO = over ? 'over' : 'wide';   /* b2 (Codex round 3 item 7): a shot over the bar crosses between the posts, high (adapter) */
    /* b2 P18 (break plan3): the line the ball goes out over follows a16's own reading of the sentence (director.js outcomeOf): a corner, a goal
     * kick, the byline, over the bar or across the goal is the goal line; a throw-in, the touchline or a plain "out of play" is a touchline */
    var P3 = SW.brk !== 'plan3', outLn = /corner|goal kick|byline|over the bar|across the goal|go(?:es)? wide|wide, and/i.test(t) ? 'goal' : 'touch';
    /* P18: a blocked shot that goes out is blocked first (the blocker has it), then put out over the named line (the out step below) */
    var shotOut = goal ? 'goal' : kHold ? 'held' : kParry ? 'parry' : (won && winner && !V.men[winner].keeper) ? 'blocked' : out ? wideO : 'parry';
    var pass = function (from, to, spot, o) { var s = { do: 'pass', from: from, to: to || null, spot: spot ? { x: r3(spot.x), y: r3(spot.y) } : null }; for (var k in (o || {})) if (o[k] !== undefined && o[k] !== null && o[k] !== false && o[k] !== 0) s[k] = o[k]; return s; };
    var carry = function (who, to, pst, secs, chaser) { return { do: 'carry', who: who, to: { x: r3(to.x), y: r3(to.y) }, past: (pst || []).slice(), secs: r3(secs || 3), chaser: chaser || null }; };
    var shot = function (from, outcome, by, rebound, o) { o = o || {}; return { do: 'shot', from: from, outcome: outcome, by: by || null, rebound: rebound || null, header: !!o.header, out: !!o.out }; };
    if (sd === 'you') {
      var k = c.kind, fm = foul && !goal && !/offside/i.test(t) && SW.brk !== 'nofoul' ? /\b(?:trips|brings|pulls|fouls|clips|bundles|catches)\b/.exec(t) : null;
      var offs = P2 && /\bis offside\b/i.test(t) ? (named.filter(function (i) { return team(i) === sd && i !== H; })[0] || null) : undefined;   /* b2 (Codex round 3 item 1): offside is a pass to the man and the whistle, not a foul */
      if (offs !== undefined) { if (offs) Q.push(pass(H, offs, null, {})); Q.push({ do: 'end', why: 'offside' }); }
      else if (fm) {   /* a foul on your man ("Lee trips Yamal. Free kick to your team"): the named defender fouls the named attacker (sim_check C10) */
        var fdr = named.filter(function (i) { return team(i) === def && !V.men[i].keeper && t.indexOf(V.men[i].name.split(' ')[0]) < fm.index; }).pop() || ((c.o.foil && team(c.o.foil.id) === def) ? c.o.foil.id : null);
        var fdd = named.filter(function (i) { return team(i) === sd && t.indexOf(V.men[i].name.split(' ')[0], fm.index) > fm.index; })[0] || H;
        if (!fdr) fdr = (nearest(V, V.men[fdd], def, kp ? [kp.id] : []) || {}).id;
        if (fdd !== H) Q.push(pass(H, fdd, null, { feet: true }));
        var pst2 = past.filter(function (i) { return i !== fdr; });
        if (pst2.length) { var fq = fwd(V.men[fdd], 4); Q.push(carry(fdd, fq, pst2, carT(V.men[fdd], fq))); }
        Q.push({ do: 'tackle', by: fdr, foul: true });
      } else if (k === 'shot' || (k === 'other' && goal)) {
        if (shooter !== H) Q.push(pass(H, shooter, null, { feet: true }));
        Q.push(shot(shooter, shotOut, shotOut === 'blocked' ? winner : kp && kp.id, reb, { header: header, out: out && shotOut !== 'wide' && shotOut !== 'over' && !(P3 && shotOut === 'blocked') }));
      } else if (k === 'cross' || k === 'pass') {
        var tgt = recv || (k === 'cross' ? (inBox(sd) || {}).id : null), spot = mc.spot || (/^kw:/.test(mc.kind || '') && mc.lane && mc.lane.length > 1 && hyp(mc.lane[0], Hm) > 3 ? mc.lane[mc.lane.length - 1] : null), air = k === 'cross' && !/low|cut-back|square/i.test(t + ' ' + (mc.kind || ''));
        if (/cannot find a way|does not pass|holds it up/.test(t)) Q.push(carry(H, fwd(Hm, 3), [], 0.6));
        else if (won && winner) {
          var blkO = P3 && out && /\bblocks it\b/.test(t);   /* P18: a block that goes out flies off him over the named line */
          var clear = !WB && (P2 ? /heads (?:it|the cross) away|heads it out|kicks it clear|gets a foot to it/ : /heads (?:it|the cross) away|kicks it clear|gets a foot to it/).test(t);
          Q.push(pass(H, tgt, spot, { cutBy: winner, h: air ? 3 : 0, clear: clear, note: header ? 'header' : null, then: (clear || blkO) ? 'clearAway' : null, thenOut: (clear || blkO) && out, thenLine: P3 && (clear || blkO) && out ? outLn : null }));
        } else if ((kHold || (P2 && /(?:runs through|goes straight|rolls) to (?:their|your) keeper|straight to (?:their|your) keeper/i.test(t))) && kp) {
          if (KS) { var ksT = spot || (tgt && V.men[tgt]) || null; if (ksT) { var sdx = ksT.x - kp.x, sdy = ksT.y - kp.y, sdd = Math.max(1, Math.sqrt(sdx * sdx + sdy * sdy)), sk = Math.min(10, sdd * 0.5); kq = { x: kp.x + sdx / sdd * sk, y: kp.y + sdy / sdd * sk }; } }
          Q.push(pass(H, tgt, kq || spot, { cutBy: kp.id, save: true, h: air ? 3 : 0, then: 'keeperHolds' }));
        }
        else if (tgt) {
          var rm = V.men[tgt], lead = /run onto|into (?:the )?space|plays? (?:the ball |it )?through|puts \S+ through|in behind|into the box late|run into the box/i.test(t + ' ' + (c.o.label || ''));
          var pz = attN[0] && attN[0] !== H && attN[0] !== tgt && attN.indexOf(tgt) > 0 ? attN[0] : H;
          if (!spot && (zup || lead) && !air) { if (lead || up(sd, rm) < zup - 1) spot = fwd(rm, lead ? 7 : 0); }
          else if (spot && lead && up(sd, spot) < up(sd, rm) + 5) spot = { x: spot.x, y: sd === 'you' ? rm.y + 5 : rm.y - 5 };
          if (pz !== H) Q.push(pass(H, pz, null, { feet: true }));
          Q.push(pass(pz, tgt, spot, { h: air ? 3 : 0, wait: true, note: k === 'cross' ? (air ? 'cross' : 'low cross') : null }));
          if (SW.brk !== 'recvcollect' && !goal) Q.push({ do: 'collect', who: tgt });   /* b3 P24: he runs onto a pass that stopped short of him (C3) */
          var land = spot || rm;
          if (zup && !goal && !air && up(sd, land) < zup - 1) { var zq = fwd(land, 0); Q.push(carry(tgt, zq, [], clamp(hyp(land, zq) / (0.85 * rm.v) + 0.4, 1.5, 5))); }
          if (goal) Q.push(shot(tgt, 'goal', null, null, { header: header }));
          else if (/header goes wide|goes wide|over the bar/.test(t) && k === 'cross') Q.push(shot(tgt, wideO, null, null, { header: header }));
          else if (SW.brk !== 'reb' && kN && kParry && !out) Q.push(shot(tgt, 'parry', kp.id, reb, { header: header }));   /* b4 (r1 item 1): "pushes it out, and X gets to it first" after a cross */
          else if (kN && /saves|catches|holds/.test(t)) Q.push(shot(tgt, 'held', kp.id, null, { header: header }));
        } else Q.push(carry(H, fwd(Hm, 5), [], 1.5));
      } else if (k === 'carry' || k === 'other') {
        var dr = attN[0] && attN[0] !== H ? attN[0] : H;
        if (dr !== H) Q.push(pass(H, dr, null, { feet: true }));
        if (TK && kq && !(won && winner)) Q.push(pass(dr, null, kq, { cutBy: kp.id, save: true, h: header ? 3 : 0, then: 'keeperHolds' }));   /* P22 */
        else if (won && winner) Q.push({ do: 'tackle', by: winner, foul: false });
        else if (/waste time|corner flag|clock runs down/i.test(t + ' ' + c.o.label)) { Q.push(carry(dr, { x: Hm.x < 34 ? 1 : W - 1, y: L - 1 }, [], 4)); Q.push({ do: 'end', why: 'clock' }); }
        else if (goal) Q.push(shot(dr, 'goal', null, null, {}));
        else { var dq = fwd(V.men[dr], c.ev.band === 'good' ? 11 : 5); Q.push(carry(dr, dq, past.length ? past : (c.o.foil && team(c.o.foil.id) === def ? [c.o.foil.id] : []), carT(V.men[dr], dq))); }
      }
    } else {
      var mine = defN.filter(function (i) { return team(i) === def; }), actor = (c.o.actor && team(c.o.actor.id) === def) ? c.o.actor.id : mine[0] || null;
      var tg2 = attN.filter(function (i) { return i !== H; })[0] || (inBox(sd) || {}).id;
      /* b2 P19 (break throw): your keeper "throws it out quickly, and your team has the ball {to}": a catch that does not end play, then the throw */
      var TH = SW.brk !== 'throw' && kN && kHold && /throws it out quickly/.test(t), thUp = /in midfield/.test(t) ? 45 : /in their half/.test(t) ? 60 : /in your half/.test(t) ? 30 : 35;
      var offT = P2 && /\bis offside\b/i.test(t) ? (named.filter(function (i) { return team(i) === sd && i !== H; })[0] || null) : undefined;
      if (goal) { if (shooter !== H) Q.push(pass(H, shooter, null, { feet: true })); Q.push(shot(shooter, 'goal', null, null, { header: header })); }
      else if (offT !== undefined) { if (offT) Q.push(pass(H, offT, null, {})); Q.push({ do: 'end', why: 'offside' }); }
      else if (foul && actor) Q.push({ do: 'tackle', by: actor, foul: true });
      else if (out && /aim for|shoots|hits it|header goes|goes wide|over the bar/.test(t) && !cross) Q.push(shot(H, wideO, null, null, { header: header }));
      else if (kN && /comes out/.test(t) && out) Q.push(carry(H, { x: Hm.x < 34 ? 12 : 56, y: f > 0 ? L - 4 : 4 }, [], 1.2, kp.id));
      else if (P1 && kN && /takes the ball (?:off|from)|smothers|dives at (?:his|the) feet/.test(t)) { Q.push({ do: 'tackle', by: kp.id, foul: false }); Q.push(TH ? { do: 'throw', by: kp.id, up: thUp } : { do: 'end', why: 'keeper' }); }   /* P19: and throws it out when the words say so */
      else if (kN && cross) Q.push(pass(H, tg2, null, { cutBy: kp.id, save: true, h: /low/.test(t) ? 0 : 3, then: kHold ? (TH ? 'keeperCatch' : 'keeperHolds') : (P2 && !out) ? 'parryLoose' : (P3 && outLn === 'touch') ? null : 'punchCorner', punchLine: SW.brk !== 'punchline' }));
      else if (kN && (kHold || kParry)) { if (shooter !== H) Q.push(pass(H, shooter, null, { feet: true })); Q.push(shot(shooter, kHold ? (TH ? 'heldOn' : 'held') : 'parry', kp.id, reb, { header: header, out: out })); }
      else if ((P1 ? /blocks the shot|foot to the shot|in front of the shot|the ball hits [A-Z]/ : /blocks the shot|foot to the shot/).test(t) && (winner || (P1 && defO[0]))) Q.push(shot(H, 'blocked', winner || defO[0], null, { out: P3 ? false : out }));
      /* b2 P23 (break kclear; sim_check C10 "keeper clears"): your keeper "kicks it clear before Tyler reaches it. Your team has the ball, and your
       * attack starts in your half" was drawn as the keeper winning it and carrying it out; now he wins it and kicks it to a team-mate where
       * the words put your ball (the same step as P19's throw, kicked) */
      else if (SW.brk !== 'kclear' && won && winner && kp && winner === kp.id && /\bkicks it clear\b/.test(t) && !out) { Q.push({ do: 'tackle', by: kp.id, foul: false }); Q.push({ do: 'throw', by: kp.id, up: thUp, kick: true }); }
      /* b4 (yourbox; C4 seed 9012): "Cubarsí reads the low cross and gets to it first. Your team has the ball" was drawn as a header on to a
       * team-mate 20 m away that never arrived (the ball rolled loose for 7 s). A defender who wins a cross without heading or clearing it keeps it. */
      else if (won && winner && cross && SW.brk !== 'yourbox' && !header && !/\bclear|\bheads\b|punch|away\b/.test(t)) Q.push(pass(H, tg2, null, { cutBy: winner, h: /low/.test(t) ? 0 : 3 }));
      else if (won && winner && cross) Q.push(pass(H, tg2, null, { cutBy: winner, h: 3, clear: /heads|clear/.test(t), note: header ? 'header' : null, then: 'headToMate', headZone: SW.brk === 'yourbox' ? null : lastZone(t) }));
      else if (won && winner && /cuts out|reads the pass|steps across/.test(t)) Q.push(pass(H, tg2, null, { cutBy: winner }));
      else if (won && winner) Q.push({ do: 'tackle', by: winner, foul: false });
      else if (/pass(?:es)? it back|back to their own|back into their own/.test(t)) { var back = side(V, sd, true).filter(function (m) { return m.id !== H; }).sort(function (a, b) { return up(sd, a) - up(sd, b); })[0]; Q.push(pass(H, back.id, null, { feet: true })); Q.push({ do: 'end', why: 'their ball back' }); }
      /* b5 (b4 open problem 3, break through; sim_check C13): "X gets his head to it first and is through on your goal" was drawn as a cross to
       * another man (tg2), so X's collect did nothing and he never had it. The ball goes to X (crossed to him when a man has it, else he runs
       * onto the loose ball), then he carries it 10 m at the goal he attacks */
      else if (SW.brk !== 'through' && reb && V.men[reb] && /gets his head to it first and is through on (?:your|their) goal/.test(t)) {
        if (V.owner && V.owner !== reb) Q.push(pass(H, reb, null, { h: 3, note: 'cross' }));
        else if (V.owner !== reb) Q.push({ do: 'collect', who: reb, near: 1.4, secs: 4 });
        var rbm = V.men[reb], dq4 = fwd(rbm, 10); Q.push(carry(reb, dq4, [], carT(rbm, dq4)));
      }
      else if (cross || /crosses it|gets his head to it first/.test(t)) { if (/takes it wide/.test(t)) Q.push(carry(H, { x: Hm.x < 34 ? 6 : W - 6, y: Hm.y + f * 6 }, [], 1.2)); Q.push(pass(H, tg2, null, { h: /low/.test(t) ? 0 : 3, note: /low/.test(t) ? 'low cross' : 'cross' })); }
      else { var dq2 = fwd(Hm, c.ev.band === 'good' ? 3 : 11); Q.push(carry(H, dq2, past.length ? past : actor && /past|too late|mistimes|misses|cannot/.test(t) ? [actor] : [], carT(Hm, dq2))); }
    }
    if (sd === 'them' && TH && Q.length && (Q[Q.length - 1].outcome === 'heldOn' || Q[Q.length - 1].then === 'keeperCatch')) Q.push({ do: 'throw', by: kp.id, up: thUp });
    var hold = false;
    /* b4 (r1 item 2): the defender's touch, then the nearest of your outfield men wins it back from him where it was */
    if (WB && won && winner && V.men[winner]) { var bk = nearest(V, V.men[winner], sd, side(V, sd).filter(function (m) { return m.keeper; }).map(function (m) { return m.id; })); if (bk) { Q.push({ do: 'tackle', by: bk.id, foul: false }); hold = true; } }
    /* b4 (r1 item 1, break reb; sim_check C13, 42 of 45 wrong on b3): the man the words say gets to the loose ball first runs onto it, and
     * nobody else picks it up while he does (the world's collect step holds the pickup; a ball in flight is never picked up). Put right after
     * the shot it comes from, so a later step of his (a second shot) starts with him on the ball */
    var rbAt = /gets to (?:the (?:loose )?ball|it) first|has the rebound|gets his head to it first/.exec(t), rbOn = rbAt ? /([A-Z][\wÀ-ɏ'\-]+) has (?:it|the ball)\b/.exec(t.slice(rbAt.index)) : null;
    if (SW.brk !== 'reb' && reb && V.men[reb] && !goal && !out && !foul && !(rbOn && rbOn[1] !== V.men[reb].name.split(' ')[0])) { var ri = -1; Q.forEach(function (q, i) { if (q.do === 'shot' && q.rebound === reb) ri = i; }); Q.splice(ri >= 0 ? ri + 1 : Q.length, 0, { do: 'collect', who: reb, near: 1.4, secs: 4 }); hold = true; }
    /* b4 (r1 items 3 and 8, break yourbox; sim_check C15 and C4E): the man on the ball when the card's steps are done runs on to the zone the
     * sentence names last ("into your box", "in midfield"), if he is not there yet: the words are what the dice settled, so the picture ends
     * there. Not when the ball goes out, a goal, a foul, offside, a keeper's catch or throw, or the clock. */
    var zl = SW.brk === 'yourbox' ? null : lastZone(t), qEnd = Q.length ? Q[Q.length - 1] : null;
    if (zl && !goal && !out && !foul && !kHold && !TK && !TH && !/\bis offside\b/i.test(t) && !(qEnd && (qEnd.do === 'end' || qEnd.do === 'throw' || qEnd.then === 'keeperHolds' || qEnd.then === 'keeperCatch'))) Q.push({ do: 'tozone', zone: zl });
    var lastQ = Q[Q.length - 1], defl = P3 && lastQ && lastQ.do === 'shot' && lastQ.outcome === 'blocked';   /* Codex r4 item 1: a block that goes out flies off him */
    if (out && !goal) Q.push(P3 ? { do: 'out', line: outLn, up: true, fast: defl || undefined } : P2 && /corner|goal kick|byline|over the bar/i.test(t) ? { do: 'out', line: 'goal' } : P2 && /throw-in/i.test(t) ? { do: 'out', line: 'touch' } : { do: 'out' });
    return { side: sd, card: { id: c.o.id, label: c.o.label || null, family: c.kind }, band: c.ev.band || null, kind: c.ev.kind || null, steps: Q,
      hold: hold || undefined,
      says: { goal: goal, out: out, won: !!(won && winner), winner: won ? winner || null : null, keeperHolds: !!kHold, keeperParries: !!kParry, foul: !!foul, header: header, past: past, winBack: !!WB, rebound: reb || null } };
  }

  /* ------------------------------------------------------------------ the words, as the world drew them */
  var AT_YOU = ['in your half', 'in midfield', 'at the edge of their box', 'in their box'], TO_YOU = ['into your half', 'into midfield', 'to the edge of their box', 'into their box'];
  /* b1 (sim_check C4, 34 of 689 on 16 Cups: "Luke gets past Cucurella, into your box" with the ball drawn 27.6 m up): their attack's words
   * have a third zone, your box, so a sentence that puts their ball in your box is rewritten when the world did not take it there (and the
   * other way round). KM_SIM_WORDS=two keeps sd_run.js's two zones. */
  var AT_T = ['in midfield', 'at the edge of your box', 'in your box', 'wide of your box'], TO_T = ['into midfield', 'to the edge of your box', 'into your box', 'wide of your box'];
  /* b2 (sim_check C4 and sim_edge S5: "to the edge of your box" with the ball 4 to 14 m up, wide of the box): a box is named only inside
   * the drawn box; level with a box but wide of it is "wide of your box" / "wide of their box". KM_SIM_WORDS=nowide: b1's words. */
  AT_YOU.push('wide of their box'); TO_YOU.push('wide of their box');
  function wideOf(q, nearY) { return SW.words !== 'nowide' && SW.words !== 'two' && nearY && (q.x < BOX_X[0] || q.x > BOX_X[1]); }
  var END_RX = [/,? and (?:the|their|your|this) attack is over/gi, /\s*(?:The|This|Their|Your) attack is over\./g, /,? but their players are all back(?: now| in position)?/gi];
  function zoneYou(q) { return q.y >= 88.5 && q.x >= BOX_X[0] && q.x <= BOX_X[1] ? 3 : q.y >= 70 ? 2 : q.y >= 40 ? 1 : 0; }
  function zoneOf(b) { return b.y >= 88.5 ? 3 : zoneYou(b); }   /* sd_run.js: from 88.5 m up it is "in their box" even wide of it */
  function tzThem(q) { return q.y < 40 ? 1 : 0; }
  function tzWords(q) { return wideOf(q, q.y <= 16.5) ? 3 : SW.words !== 'two' && q.y <= 16.5 && q.x >= BOX_X[0] && q.x <= BOX_X[1] ? 2 : tzThem(q); }
  function zoneWords(q) { return wideOf(q, q.y >= 88.5) ? 4 : zoneOf(q); }
  function rezone(text, from, to, AT, TO) {
    if (!text || from === to || from < 0 || to < 0) return text;
    var t = String(text).split(AT[from]).join('\u0001').split(TO[from]).join('\u0002');
    return t.split('\u0001').join(AT[to]).split('\u0002').join(TO[to]);
  }
  function tidy(s) { return s.replace(/\s+\./g, '.').replace(/\s+,/g, ',').replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim(); }
  var LETTER = 'A-Za-z\\u00c0-\\u024f';
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /* the result's words where the card's play ended (jP): "attack is over" out when play goes on; the zone words from where the ball is;
   * the man the words leave with the ball ("X has the ball", "The ball is with X") from who has it, when he is of the same side.
   * Nothing moves a man: only words change. fix: what was changed, for the check. */
  /* b2 (Codex 2b item 10): "the attack is over" goes only when the attackers still have the ball where the card's play ended; when the
   * other side has it, the attack is over in the picture too (sim_check C11; break overall) */
  function wordsAt(P, text, goesOn, end, side) {
    var s = String(text || ''), fix = [];
    if (goesOn && (SW.brk === 'overall' || !side || !end.poss || end.poss === side)) END_RX.forEach(function (rx) { var s2 = s.replace(rx, ''); if (s2 !== s) { fix.push('over'); s = s2; } });
    if (SW.words === 'engine' || SW.brk === 'nowords') return { text: tidy(s), fix: fix };
    var sideP = end.poss || 'you', AT = sideP === 'you' ? AT_YOU : AT_T, TO = sideP === 'you' ? TO_YOU : TO_T, z1 = sideP === 'you' ? zoneWords(end.ball) : tzWords(end.ball);
    if (sideP !== 'you' && SW.words === 'two') { AT = AT.slice(0, 2); TO = TO.slice(0, 2); }
    else if (SW.words === 'nowide') { AT = AT.slice(0, sideP === 'you' ? 4 : 3); TO = TO.slice(0, sideP === 'you' ? 4 : 3); }
    for (var z0 = AT.length - 1; z0 >= 0; z0--) if (s.indexOf(AT[z0]) >= 0 || s.indexOf(TO[z0]) >= 0) { if (z0 !== z1) { s = rezone(s, z0, z1, AT, TO); fix.push('zone ' + z0 + '>' + z1); } break; }
    if (end.holder && P.first[end.holder]) {
      var hn = P.first[end.holder], ht = P.teamOf[end.holder];
      var rx = new RegExp('(^|[^' + LETTER + '])([A-Z][' + LETTER + '\\-\']+)( has the ball| has it\\b| keeps it\\b)|(The ball is with )([A-Z][' + LETTER + '\\-\']+)', 'g');
      s = s.replace(rx, function (all, pre, n1, verb, pre2, n2) {
        var nmx = n1 || n2, id = P.byFirst[nmx];
        if (!id || id === end.holder || P.teamOf[id] !== ht) return all;
        fix.push('holder ' + nmx + '>' + hn);
        return n1 ? pre + hn + verb : pre2 + hn;
      });
    }
    return { text: tidy(s), fix: fix };
  }
  /* what ended a passage in free play, said plainly (shown after the play that ended it) */
  function endLine(why, poss, holderName) {
    if (why === 'out') return 'The ball goes out of play.';
    /* b5 (r2 m1, break endline): the winners are far from the goal they attack (your team: their goal; theirs: yours); b4 said the opposite */
    if (why === 'won at a safe distance' && SW.brk === 'endline') return poss === 'you' ? (holderName ? holderName + ' has the ball for your team, far from your goal.' : 'Your team has the ball, far from your goal.') : 'They have the ball, far from their goal.';
    if (why === 'won at a safe distance') return poss === 'you' ? (holderName ? holderName + ' has the ball for your team, far from their goal.' : 'Your team has the ball, far from their goal.') : 'They have the ball, far from your goal.';
    if (why === 'keeper') return poss === 'you' ? 'Your keeper has the ball.' : 'Their keeper has the ball.';
    if (why === 'foul') return 'The referee stops play for a foul.';
    if (why === 'offside') return 'The referee stops play for offside.';
    return 'Play stops here.';
  }

  /* ------------------------------------------------------------------ the passage */
  var STATE = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var LOG = { errs: [], passages: 0, decisions: 0, stops: 0, ends: {}, rules: {}, words: { over: 0, zone: 0, holder: 0 } };
  var CFG = null;   /* install(): { World, P (pitch), M (model), PM, O, PH, X } */
  /* KM_SIMT (node only, diagnosis): a JSON object of world switches merged over the release's defaults, e.g. '{"HURRY":1.6}' */
  var SIMT = {}; try { if (typeof process !== 'undefined' && process.env && process.env.KM_SIMT) SIMT = JSON.parse(process.env.KM_SIMT); } catch (e) { SIMT = {}; }
  function S(st) { var m = STATE.get(st); if (!m) { m = { pass: null, nextPic: null, n: 0 }; STATE.set(st, m); } return m; }
  function seedOf(st, n) { var h = 2166136261 >>> 0, s = String(st.seed) + ':' + st.n + ':' + n; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  var OPEN_THEM = ['over_the_top', 'caught_square', 'their_winger', 'tired_gap', 'their_dribbler', 'their_playmaker', 'their_counter'];
  function firstName(p) { return String((p && p.name) || '').split(' ')[0]; }

  /* begin(st, p, pic): the world starts from the picture of this decision (the frozen picture the menu was made on); nothing if a passage
   * is already running. pic: { pos: {id: {x, y}}, ball: {x, y}, holder } */
  function begin(st, p, pic) {
    if (!SW.on || !CFG) return null;
    var m = S(st); if (m.pass) return m.pass;
    if (!pic || !pic.pos || !pic.ball) return null;
    var ros = CFG.P.roster(st).filter(function (r) { return pic.pos[r.id]; });
    if (ros.length < 2) return null;
    var P = { ros: ros, first: {}, teamOf: {}, byFirst: {}, player: {}, nSaved: st.n, minSaved: st.minuteNow, p0: p, stops: 0, flips: 0, decs: 0, H0: null, lastPoss: null, recs: [] };
    ros.forEach(function (r) { var fn = firstName(r.p); P.first[r.id] = fn; P.teamOf[r.id] = r.team; P.player[r.id] = r.p; if (!(fn in P.byFirst)) P.byFirst[fn] = r.id; else P.byFirst[fn] = null; });
    P.names = function (t) {
      var hits = [];
      ros.forEach(function (r) { var n = P.first[r.id]; if (!n) return; var mm = new RegExp('(^|[^' + LETTER + '])' + esc(n) + '(?=[^' + LETTER + ']|$)').exec(t); if (mm) hits.push({ id: r.id, at: mm.index + mm[1].length }); });
      return hits.sort(function (a, b) { return a.at - b.at; }).map(function (h) { return h.id; });
    };
    var holder = pic.holder && pic.pos[pic.holder] ? pic.holder : null;
    P.w = new CFG.World({ men: ros.map(function (r) { return { id: r.id, team: r.team, keeper: !!r.keeper, p: r.p, name: P.first[r.id], x: pic.pos[r.id].x, y: pic.pos[r.id].y }; }),
      ball: { x: pic.ball.x, y: pic.ball.y }, owner: holder, seed: seedOf(st, m.n++), shapeAll: function (ball, poss) { return CFG.P.shapeAll(st, ball, poss); },
      /* b4 (r1 item 11, break freeshot): the world never shoots on its own in free play (a goal the engine never scored); shots are the cards' */
      T: Object.assign(SW.brk === 'freeshot' ? {} : { FREESHOT: 0 }, SIMT) });
    var sit = p.moment && p.moment.sit;
    /* their attack's situation for the menus the world makes: the moment's own when it is open play (sd_run.js), else their counter.
     * b1 (bug found in the first bot Cups: a tzone menu with no live card): keeper_to_feet (your keeper has the ball), siege and their_cross
     * are not open play either, so they are never carried into a stop's menu */
    P.theirSit = sit && sit.who === 'them' && p.attacking !== 'you' && !/box/.test(sit.id) && (OPEN_THEM.indexOf(sit.id) >= 0 || SW.brk === 'opensit') ? sit : CFG.M.COUNTER_SIT;
    P.lastPoss = holder ? P.teamOf[holder] : null;
    var f0 = P.w.frames[P.w.frames.length - 1];
    if (holder && !((f0.holder !== undefined ? f0.holder : f0.owner))) P.H0 = holder;   /* the man the picture names is not at the ball yet: he runs onto it first */
    m.pass = P; LOG.passages++;
    return P;
  }
  function frameNow(P, j) { var f = P.w.frames[j === undefined ? P.w.frames.length - 1 : j]; return { pos: f.pos, ball: { x: f.ball.x, y: f.ball.y, z: f.ball.z || 0 }, holder: (f.holder !== undefined ? f.holder : f.owner) || null }; }

  /* the chain the engine builds the next menu from, at the place the world stopped (sd_run.js nextDecision, word for word) */
  function chainAt(P, pic, stop, lead, n) {
    var h = pic.holder, b = pic.ball, hp = P.player[h], tm = P.teamOf[h];
    if (tm === 'you') return { next: 'zone', zone: zoneOf(b), carrier: hp, youSteps: 0, step: n, text: lead, carried: [], prev: null, mode: null, lastSit: 'dots' };
    if ((b.y <= 16.5 && b.x >= BOX_X[0] && b.x <= BOX_X[1]) || b.y < 10.5) {
      var hq = pic.pos[h], bl = P.ros.filter(function (r) { return r.team === 'you' && !r.keeper; }).map(function (r) { return { r: r, d: hyp(pic.pos[r.id], hq) }; }).sort(function (a, c) { return a.d - c.d; })[0];
      return { next: 'box', foil: hp, via: stop && stop.kinds && stop.kinds.indexOf('C1') >= 0 ? 'alone' : 'box', blocker: bl && bl.d < 8 ? bl.r.p : null, flipOk: true, carried: [], theirCarried: [], text: lead, step: n, youSteps: 0, lastSit: 'dots' };
    }
    return { next: 'tzone', tz: tzThem(b), foil: hp, sit: P.theirSit, tSteps: 0, flipOk: true, via: null, carried: [], theirCarried: [], text: lead, step: n, youSteps: 0, lastSit: 'dots' };
  }

  /* after(st, p, o, ev, pre): called right after X.choose settled card o of decision p (pre: the engine's score before it). Plays the card's
   * result and the play after it in the world, then sets the engine's state for what comes next. Returns the record the page draws:
   *   { seg: { result: {j0, j1}, play: {j0, j1} }, frames, beats, plan, stop, ended, endedBy, text, endLine, nextPic, ... } */
  /* b1 (Codex round 1, verified in match.js 1195/1296/1395/1728/1965): the card's result can leave the engine's flags for the NEXT fresh
   * moment (forcedTheirs / forcedYours: their counter or your attack is forced; brokeFrom: "they are breaking from <card>"). When the world
   * played on past the card (a stop, or an end the engine did not make), those flags describe a ball the world has since moved on from, so
   * they go. KM_SIM_BREAK=staleflags keeps them (sim_check.js C6 must then fail). */
  function stale(st) { if (SW.brk === 'staleflags') return; st.brokeFrom = null; st.forcedTheirs = false; st.forcedYours = false; }
  function after(st, p, o, ev, pre) {
    var m = S(st), P = m.pass; if (!P || !ev || !o) return null;
    var w = P.w, who = p.moment.sit.who === 'you' ? 'you' : 'them';
    var E1 = { n: st.n, minuteNow: st.minuteNow, chain: st.chain, handoff: st.handoff, follow: st.follow, keptBall: st.keptBall };
    var scored = pre && st.score && (st.score.you !== pre.you || st.score.them !== pre.them);
    var V = viewOf(P), plan = planFrom(V, { side: who, o: o, ev: ev, names: P.names, kind: family(o, who) });
    if (SW.brk === 'noplan') plan.steps = [];
    if (SW.brk === 'outwon' || SW.brk === 'endframe') plan.brk = SW.brk;
    var rec = { dec: P.decs++, side: who, card: o.id, plan: plan, textEngine: ev.text, pre: pre || null, teamOf: P.teamOf, first: P.first };
    /* b5 (r2 M4, instrumentation for sim_check C23): whose attack the engine's chain goes on with after this card (null: the engine ended it) */
    rec.engOn = E1.chain ? (E1.chain.next === 'zone' ? 'you' : (E1.chain.next === 'tzone' || E1.chain.next === 'box') ? 'them' : null) : null;
    var t0 = w.t;
    w.apply(plan);
    var jA = w.frames.length - 1, guard = 0;
    if (typeof w.busy === 'function') while (w.busy() && !w.ended && guard++ < 30 * 60) w.step();
    var jP = w.frames.length - 1, fP = frameNow(P, jP), possP = fP.holder ? P.teamOf[fP.holder] : (P.lastPoss || who);
    var stop = null; guard = 0;
    /* b5 (r2 M4, break undo / ?simkeep=off): the dice left team T on the ball and the engine's attack goes on with T: until the next stop (or
     * KM_SIMKEEP seconds) free play does not take the ball from T: while T has it, no dispossession (DISPK 0) and no cut-out pass (CUTK 0) */
    var keepT = rec.engOn && possP === rec.engOn && SW.keep !== 'off' && SW.brk !== 'undo' ? rec.engOn : null, keepS = keepT && SW.keep !== 'stop' ? +SW.keep || 0 : Infinity, WT = w.T || {}, k0 = { DISPK: WT.DISPK, CUTK: WT.CUTK }, tK = w.t, keptFl = null;
    function keepOn() {
      var hk = w.owner || null, inn = w.w || null, fl = inn && inn.ball ? inn.ball.fl : null;
      var on = !!(keepT && w.t - tK < keepS && ((hk && P.teamOf[hk] === keepT) || (!hk && fl && fl.free && P.teamOf[fl.from] === keepT)));
      WT.DISPK = on ? 0 : k0.DISPK; WT.CUTK = on ? 0 : k0.CUTK;
      if (on && fl && fl.free && !fl.icept) { fl.icept = 'kept'; keptFl = fl; }   /* the world's line touch ("a defender standing on the line of a pass touches it") skips a flight with icept set; nothing else reads it */
      else if (!on && keptFl) unKeep();   /* (Codex r1 item 2: a numeric window ends: the flight we marked is open to the line touch again) */
    }
    function unKeep() { if (keptFl && keptFl.icept === 'kept') delete keptFl.icept; keptFl = null; }
    try {
      while (!w.ended && guard++ < 30 * 200) { stop = SW.brk === 'nostop' ? null : w.chance(); if (stop) break; if (keepT) keepOn(); w.step(); }
    } finally { if (keepT) { WT.DISPK = k0.DISPK; WT.CUTK = k0.CUTK; unKeep(); } }
    if (keepT) { rec.kept = keepT; LOG.kept = (LOG.kept || 0) + 1; }
    if (!w.ended && !stop && w.end) w.end('guard');
    var jS = w.frames.length - 1;
    rec.seg = { result: { j0: jA, j1: jP }, play: { j0: jP, j1: jS } };
    rec.endP = { holder: fP.holder, poss: possP, ball: { x: r3(fP.ball.x), y: r3(fP.ball.y) } };
    /* the caps of the passage */
    var why = w.ended || null, cap = null;
    if (stop) {
      P.stops++;
      var tNew = P.teamOf[stop.who];
      if (P.lastPoss && tNew && tNew !== P.lastPoss) P.flips++;
      if (tNew) P.lastPoss = tNew;
      if (P.stops >= SW.stops) cap = 'ten stops';
      else if (P.flips > SW.won) cap = 'won balls';
      if (cap) { if (w.end) w.end(cap); why = cap; stop = null; }
    }
    if (scored && stop) { if (w.end) w.end('goal (engine)'); why = 'goal (engine)'; stop = null; }   /* the engine's goal ends the passage whatever the world drew */
    var inResult = !!(w.ended && jS === jP && !cap);   /* the world ended inside the card's own play */
    var engineEnded = !E1.chain;
    rec.ended = !stop; rec.endedBy = why; rec.stop = stop || null; rec.scored = !!scored;
    var goesOn = !rec.ended || (!inResult && jS > jP);
    var wd = wordsAt(P, ev.text, goesOn, rec.endP, who);
    rec.text = wd.text; rec.fix = wd.fix;
    wd.fix.forEach(function (x) { var k = x.split(' ')[0]; LOG.words[k] = (LOG.words[k] || 0) + 1; });
    if (rec.text !== String(ev.text || '')) { try { Object.defineProperty(ev, 'textEngine', { value: ev.text, enumerable: false, configurable: true, writable: true }); } catch (e) { } ev.text = rec.text; }
    LOG.decisions++;
    if (!rec.ended) {
      /* the passage goes on: a decision inside the same moment, at the place the world stopped */
      LOG.stops++;
      var pic = frameNow(P, jS); pic.holder = stop.who;
      if (stop.loose) P.H0 = stop.who; else P.H0 = null;
      st.n = P.nSaved; st.minuteNow = P.minSaved; st.handoff = null; st.follow = null; st.pending = null; st.keptBall = null;
      stale(st);
      st.chain = chainAt(P, pic, stop, rec.text, P.stops);
      m.nextPic = { pic: pic, stop: stop, rule: 'stop' };
      rec.nextPic = pic; rec.rule = 'stop';
    } else {
      var fE = frameNow(P, jS), hE = fE.holder, pE = hE ? P.teamOf[hE] : null;
      var rule;
      if (scored || (inResult && engineEnded)) rule = 'engine';
      else if (SW.end === 'handoff' && pE === 'you' && hE && !P.ros.filter(function (r) { return r.id === hE; })[0].keeper && why !== 'out' && why !== 'goal' && why !== 'foul' && why !== 'offside') rule = 'handoff';
      else rule = 'fresh';
      if (rule === 'engine') {   /* the engine's state as choose left it; a ball the engine handed to your next moment gets its menu from the picture */
        /* b1 (sim_check C9): the engine handed the ball on to its own carrier; when the world drew it with another of your outfield men, that
         * man (the one the words name, P4) carries the next decision, from where the ball is. KM_SIM_BREAK=enginecarrier keeps the engine's. */
        if (st.handoff && !st.chain && !scored && hE && pE === 'you' && SW.brk !== 'enginecarrier' && P.player[hE] && !P.ros.filter(function (r) { return r.id === hE; })[0].keeper && (!st.handoff.carrier || st.handoff.carrier.id !== hE)) { st.handoff.carrier = P.player[hE]; st.handoff.zone = zoneOf(fE.ball); }
        if (st.handoff && !st.chain && !scored) m.nextPic = { pic: { pos: frameNow(P, jS).pos, ball: frameNow(P, jS).ball, holder: frameNow(P, jS).holder || (st.handoff.carrier && st.handoff.carrier.id) || null }, stop: null, rule: 'handoff' };
      }
      else {
        st.chain = null; st.follow = null; st.pending = null; st.keptBall = null; st.handoff = null;
        stale(st);
        st.n = P.nSaved + 1;
        st.minuteNow = null;
        if (rule === 'handoff') {
          st.handoff = { next: 'zone', zone: zoneOf(fE.ball), carrier: P.player[hE], youSteps: 0, step: 0, text: rec.text, carried: [], prev: null, mode: null, lastSit: 'dots' };
          st.minuteNow = Math.min(89, (typeof p.minute === 'number' ? p.minute : 0) + 1);
          m.nextPic = { pic: { pos: fE.pos, ball: fE.ball, holder: hE }, stop: null, rule: 'handoff' };
        }
      }
      if (!inResult && jS > jP) rec.endLine = endLine(why, pE, hE ? P.first[hE] : null);
      rec.rule = rule; rec.endPic = fE;
      LOG.ends[why || 'none'] = (LOG.ends[why || 'none'] || 0) + 1; LOG.rules[rule] = (LOG.rules[rule] || 0) + 1;
      m.pass = null;
    }
    var sg = w.staged || 0; rec.staged = sg - (P.staged0 || 0); P.staged0 = sg;   /* steps the world refused to draw (SIM v2 NOSTAGE; sim_check reports it) */
    rec.frames = w.frames; rec.beats = w.beats || null; rec.t0 = t0; rec.release = w.release || (CFG.World && CFG.World.release) || null;
    P.recs.push(rec);
    try { Object.defineProperty(ev, 'sim', { value: rec, enumerable: false, configurable: true, writable: true }); } catch (e) { }
    return rec;
  }

  /* ------------------------------------------------------------------ b4: world stops only (r1 item 6, lead ruling; KM_SIMSTOPS=world)
   * The engine's open-play moment no longer offers its own staged decision: its picture (the director's) is where the world starts, and the
   * world plays from there to its first chance. At that stop the engine builds the menu for the chain there (chainAt, as after a card) and
   * pm.js makes the cards from the picture. A moment where the world finds no chance before play ends (out, a keeper's ball, won far from
   * goal, 90 s) passes with no decision; the engine's next moment follows (your ball: the handoff, played from the world's picture too).
   * Set pieces, the box steps and keeper restarts stay the engine's decisions (LEAD_YOU / OPEN_THEM below are the open-play moments). */
  var LEAD_YOU = ['press_trap', 'second_ball', 'third_man', 'overlap'];
  function leadable(p, any) {   /* any: whatever KM_SIMSTOPS says (sim_check C20) */
    if (!SW.on || (!any && SW.first !== 'world') || !p || !p.moment || !p.moment.sit || p.continues) return false;
    var sit = p.moment.sit, id = String(sit.id || '');
    if (sit.who === 'you') return /^zone_/.test(id) || LEAD_YOU.indexOf(id) >= 0;
    if (id === 'over_the_top' && SW.ott === 'engine' && !any) return false;   /* b5 (KM_SIMOTT): the lead's fallback for the ball in the air */
    return OPEN_THEM.indexOf(id) >= 0;
  }
  /* b5 (r2 B1): the man the moment's scene names on the ball, of the moment's own team: "X has the ball", "X, their winger, has the ball",
   * "The ball is with X", "X is running onto it" (the first of these in the text); null when the scene names nobody or the name is not one man */
  var SCENE_NAME = '[A-Z][' + LETTER + '\\-\']+';
  var SCENE_RXS = [new RegExp('(' + SCENE_NAME + ')(?:, [^,.]{1,40},)? has the ball'), new RegExp('The ball is with (' + SCENE_NAME + ')'), new RegExp('(' + SCENE_NAME + ') is running onto it')];
  function sceneHolder(st, p, pic) {
    var t = String((p.moment && p.moment.text) || ''), sit = p.moment && p.moment.sit, team = sit && sit.who === 'you' ? 'you' : 'them', best = null;
    SCENE_RXS.forEach(function (rx) { var mm = rx.exec(t); if (mm && (!best || mm.index < best.at)) best = { at: mm.index, n: mm[1] }; });
    if (!best) return null;
    var ids = CFG.P.roster(st).filter(function (r) { return r.team === team && pic.pos[r.id] && firstName(r.p) === best.n; }).map(function (r) { return r.id; });
    return ids.length === 1 ? ids[0] : null;
  }
  function leadLine(P, stop) { var n = P.first[stop.who]; return n ? n + ' has the ball.' : 'Play goes on.'; }
  /* lead(st, p, pic, from): the world plays from pic to its first chance. Returns the lead's record (as after's: seg.play is the film), or
   * null when the world cannot start (the caller keeps the engine's decision). from: 'engine' (a moment's picture) | 'handoff' */
  function lead(st, p, pic, from) {
    if (!SW.on || !CFG || !pic || !pic.pos || !pic.ball) return null;
    var m = S(st); if (m.pass) return null;
    var np = m.nextPic; m.nextPic = null;
    /* b5 (r2 B1, break lead0): a moment's picture with nobody on the ball: the man the scene names on the ball (of the moment's team) runs onto
     * it first and takes it (the adapter's collect steps, which no other man may pick the ball up during), before free play and any stop */
    /* (the picture may name a holder who is more than 1.2 m from the ball: the world then starts with nobody on it, r2's probe) */
    var named0 = from === 'engine' && SW.brk !== 'lead0' ? sceneHolder(st, p, pic) || (pic.holder && pic.pos[pic.holder] ? pic.holder : null) : null;
    if (named0 && pic.holder !== named0) pic = { pos: pic.pos, ball: pic.ball, holder: named0 };
    var P = begin(st, p, pic); if (!P) { m.nextPic = np; return null; }
    var w = P.w, t0 = w.t, jA = w.frames.length - 1, stop = null, guard = 0;
    if (named0 && !w.owner && w.apply) { w.apply({ side: P.teamOf[named0], steps: [{ do: 'collect', who: named0, near: 1.4, secs: 5 }] }); LOG.lead0 = (LOG.lead0 || 0) + 1; }
    while (!w.ended && typeof w.busy === 'function' && w.busy() && guard++ < 30 * 60) w.step();
    guard = 0;
    while (!w.ended && guard++ < 30 * 200) { stop = SW.brk === 'nostop' ? null : w.chance(); if (stop) break; w.step(); }
    if (!w.ended && !stop && w.end) w.end('guard');
    var jS = w.frames.length - 1, why = w.ended || null;
    var rec = { lead: true, from: from, sit: p.moment && p.moment.sit ? p.moment.sit.id : null, who0: p.moment && p.moment.sit ? p.moment.sit.who : null, dec: P.decs,
      seg: { result: { j0: jA, j1: jA }, play: { j0: jA, j1: jS } }, stop: stop || null, teamOf: P.teamOf, first: P.first, t0: t0, minute: p.minute };
    if (stop) {
      P.stops++;
      var tNew = P.teamOf[stop.who]; if (P.lastPoss && tNew && tNew !== P.lastPoss) P.flips++; if (tNew) P.lastPoss = tNew;
      var pic2 = frameNow(P, jS); pic2.holder = stop.who; P.H0 = stop.loose ? stop.who : null;
      st.n = P.nSaved; st.minuteNow = P.minSaved; st.handoff = null; st.follow = null; st.pending = null; st.keptBall = null;
      stale(st);
      rec.text = leadLine(P, stop);
      st.chain = chainAt(P, pic2, stop, rec.text, P.stops);
      m.nextPic = { pic: pic2, stop: stop, rule: 'stop' };
      rec.ended = false; rec.nextPic = pic2; rec.rule = 'stop';
      LOG.leadStops = (LOG.leadStops || 0) + 1;
    } else {
      var fE = frameNow(P, jS), hE = fE.holder, pE = hE ? P.teamOf[hE] : null, kE = hE && P.ros.filter(function (r) { return r.id === hE; })[0];
      var rule = SW.end === 'handoff' && pE === 'you' && hE && kE && !kE.keeper && why !== 'out' && why !== 'goal' && why !== 'foul' && why !== 'offside' ? 'handoff' : 'fresh';
      st.chain = null; st.follow = null; st.pending = null; st.keptBall = null; st.handoff = null;
      stale(st);
      st.n = P.nSaved + 1; st.minuteNow = null;
      rec.endLine = endLine(why, pE, hE ? P.first[hE] : null);
      if (rule === 'handoff') {
        st.handoff = { next: 'zone', zone: zoneOf(fE.ball), carrier: P.player[hE], youSteps: 0, step: 0, text: rec.endLine, carried: [], prev: null, mode: null, lastSit: 'dots' };
        st.minuteNow = Math.min(89, (typeof p.minute === 'number' ? p.minute : 0) + 1);
        m.nextPic = { pic: { pos: fE.pos, ball: fE.ball, holder: hE }, stop: null, rule: 'handoff' };
      }
      rec.ended = true; rec.endedBy = why; rec.rule = rule; rec.endPic = fE;
      LOG.leadNone = (LOG.leadNone || 0) + 1; LOG.ends[why || 'none'] = (LOG.ends[why || 'none'] || 0) + 1;
      m.pass = null;
    }
    rec.frames = w.frames; rec.beats = w.beats || null; rec.release = w.release || (CFG.World && CFG.World.release) || null;
    rec.secs = w.frames[jS].t - w.frames[jA].t;
    P.recs.push(rec); LOG.leads = (LOG.leads || 0) + 1;
    return rec;
  }
  /* drive(st, p, o): the shared loop (node: sim_lib.js; the page: simpage.js). While the decision in hand is one the world should find
   * instead (an open-play moment, or the handoff picture of your next attack), the world leads; then the engine builds the next decision.
   * o: { next0: fn(st) the engine's own next, picOf: fn(st, p) the moment's picture (the director's), onLead: fn(rec, p) }.
   * Returns { p: the decision to show (or null at full time), leads: [the lead records before it, in order] } */
  function drive(st, p, o) {
    var leads = [], g = 0;
    while (p && SW.on && SW.first === 'world' && g++ < 60) {
      var m = S(st), np = m.nextPic && API.pending(st, p) ? m.nextPic : null;
      if (np && np.rule === 'stop') break;
      var pic = null, from = null;
      if (np && np.rule === 'handoff') { pic = np.pic; from = 'handoff'; }
      else if (!np && leadable(p)) { pic = o.picOf(st, p); from = 'engine'; }
      else break;
      var rec = lead(st, p, pic, from);
      if (!rec) break;
      leads.push(rec); if (o.onLead) o.onLead(rec, p);
      p = o.next0(st);
    }
    return { p: p, leads: leads };
  }

  /* menu(st, p): X.next just built the menu of a decision the world made (a stop, or your attack from a ball your team won): pm.js makes
   * the cards from the picture (forced, as sd_run.js), else phrases.js fits today's menu to it. Returns { pic, pm } or null. */
  function menu(st, p) {
    var m = S(st), np = m.nextPic; if (!np || !p) return null;
    m.nextPic = null;
    var pic = np.pic, r = null, err = null;
    /* b5 (item 3, break shot28): the world's shot-stop range (max of its C1 and C3, 30 m on SIM v4) goes to pm.js with the stop, so pm.js offers a
     * shot at any stop inside the range the world stops for shots in (its own 28 m before) */
    if (np.stop && SW.brk !== 'shot28') { var WT2 = (m.pass && m.pass.w && m.pass.w.T) || (CFG.World && CFG.World.T0) || {}; var rg = Math.max(+WT2.C1 || 0, +WT2.C3 || 0); if (rg > 0) np.stop.range = rg; }
    try { Object.defineProperty(p, 'simPic', { value: pic, enumerable: false, configurable: true, writable: true }); Object.defineProperty(p, 'simStop', { value: np.stop, enumerable: false, configurable: true, writable: true }); } catch (e) { }
    try { r = CFG.PM.apply(CFG.O, st, p, { pos: pic.pos, ball: pic.ball, holder: pic.holder }, { refresh: CFG.X.pmRefresh, force: true }); } catch (e) { err = e && e.message; LOG.errs.push('pm: ' + err); }
    if (!(r && r.applied) && CFG.PH && CFG.PH.fitStaged) { try { CFG.PH.fitStaged(st, p, { ball: pic.ball, holder: pic.holder, pos: pic.pos }); } catch (e) { LOG.errs.push('fitStaged: ' + (e && e.message)); } }
    var res = { pic: pic, rule: np.rule, stop: np.stop, pm: { applied: !!(r && r.applied), why: r ? r.why || null : null, err: err, kinds: r && r.cands ? r.cands.map(function (c) { return c && c.kind; }) : null } };   /* b5: kinds, the candidate kinds pm.js tried to build (not the final menu; sim_check C25 reads the menu itself for what is shown) */
    if (!p.moment.options.some(function (o) { return !o.disabled; })) LOG.errs.push('no live card at a ' + np.rule + ' (' + (p.moment.sit && p.moment.sit.id) + ')');
    LOG.pm = LOG.pm || { applied: 0, not: {} };
    if (res.pm.applied) LOG.pm.applied++; else LOG.pm.not[res.pm.why || err || '?'] = (LOG.pm.not[res.pm.why || err || '?'] || 0) + 1;
    return res;
  }

  /* ------------------------------------------------------------------ frames for the page */
  /* a segment of the world's film for the page's player: { sim: true, kind, duration, j0, j1, frames, beats (match times from 0), keys, end, beaten } */
  function segment(rec, which) {
    var s = rec.seg[which], F = rec.frames, t0 = F[s.j0].t, t1 = F[s.j1].t, bs = [];
    (rec.beats || []).forEach(function (b) {
      var bt1 = b.t1 === undefined ? t1 : b.t1;
      if (bt1 < t0 + 1e-6 || b.t0 > t1 - 1e-6) return;
      bs.push({ kind: b.kind, team: b.team, from: b.from || null, to: b.to || null, past: b.past || null, note: b.note || null, t: r3(Math.max(0, b.t0 - t0)), dur: r3(Math.min(bt1, t1) - Math.max(b.t0, t0)),
        ball: b.ball ? { x: r3(b.ball.x), y: r3(b.ball.y), z: r3(b.ball.z || 0) } : null, holder: b.holder || null, poss: b.poss || null });
    });
    var fe = F[s.j1], end = { pos: fe.pos, ball: { x: fe.ball.x, y: fe.ball.y, z: 0 }, holder: (fe.holder !== undefined ? fe.holder : fe.owner) || null };
    end.poss = end.holder ? (rec.teamOf ? rec.teamOf[end.holder] : null) : null;
    /* b1 (Codex round 2b, verified: play.html passesOf and replay.js beatsOf read keys[k] / keys[k + 1] as beat k's start and end, the
     * director's convention): keys are the beats' starts plus the end, so keys.length = beats.length + 1; events as the director writes them
     * (one a beat, the ball where the beat ends, poss after it) for the stats feed and the ribbon */
    var dur = Math.max(0, t1 - t0), seg0 = { frames: F, j0: s.j0, j1: s.j1, duration: dur, beats: [] }, keys = [], events = [];
    bs.forEach(function (b) { var f = frameAt(seg0, b.t); keys.push({ t: b.t, holder: f.holder, ball: { x: f.ball.x, y: f.ball.y, z: f.ball.z || 0 }, pos: f.pos }); });
    keys.push({ t: r3(dur), holder: end.holder, ball: { x: fe.ball.x, y: fe.ball.y, z: fe.ball.z || 0 }, pos: fe.pos });
    if (keys.length === 1) keys.unshift({ t: 0, holder: (F[s.j0].holder !== undefined ? F[s.j0].holder : F[s.j0].owner) || null, ball: { x: F[s.j0].ball.x, y: F[s.j0].ball.y, z: F[s.j0].ball.z || 0 }, pos: F[s.j0].pos });
    bs.forEach(function (b, i) { var e = { t: b.t, kind: b.kind, team: b.team, from: b.from, to: b.to, ball: { x: +keys[i + 1].ball.x.toFixed(2), y: +keys[i + 1].ball.y.toFixed(2) }, note: b.note }; if (b.past) e.past = b.past; if (b.poss) e.poss = b.poss; events.push(e); });
    var past = bs.filter(function (b) { return b.past; })[0];
    return { sim: true, kind: which === 'result' ? 'result' : 'play', duration: dur, j0: s.j0, j1: s.j1, frames: F, beats: bs, keys: keys, events: events, end: end, beaten: past ? past.past : null };
  }
  /* the picture at match time t (seconds from the segment's start), interpolated between the world's frames (30 a second) */
  function frameAt(seg, t) {
    var F = seg.frames, t0 = F[seg.j0].t, tt = t0 + clamp(t, 0, seg.duration), j = seg.j0;
    var lo = seg.j0, hi = seg.j1;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (F[mid].t <= tt + 1e-9) lo = mid; else hi = mid - 1; }
    j = lo;
    var a = F[j], b = F[Math.min(j + 1, seg.j1)], k = b.t > a.t ? clamp((tt - a.t) / (b.t - a.t), 0, 1) : 0, pos = {};
    for (var id in a.pos) { var p = a.pos[id], q = b.pos[id] || p; pos[id] = { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k }; }
    var ball = { x: a.ball.x + (b.ball.x - a.ball.x) * k, y: a.ball.y + (b.ball.y - a.ball.y) * k, z: (a.ball.z || 0) + ((b.ball.z || 0) - (a.ball.z || 0)) * k };
    var holder = (a.holder !== undefined ? a.holder : a.owner) || null, beat = null;
    for (var i = 0; i < seg.beats.length; i++) if (t >= seg.beats[i].t - 1e-6) beat = seg.beats[i];   /* the beat object, as the director's frames carry it (the page reads seg.beats.indexOf(fr.beat)) */
    return { pos: pos, ball: ball, holder: holder, to: holder ? null : a.to || null, beat: beat, sim: true };
  }

  function install(cfg) { CFG = cfg; return API; }
  var API = { SW: SW, readSw: readSw, install: install, begin: begin, after: after, menu: menu, lead: lead, drive: drive, leadable: leadable, segment: segment, frameAt: frameAt, planFrom: planFrom, viewOf: viewOf,
    family: family, wordsAt: wordsAt, endLine: endLine, zoneOf: zoneOf, tzThem: tzThem, LOG: LOG, state: function (st) { return STATE.get(st) || null; }, active: function (st) { var m = STATE.get(st); return !!(m && m.pass); },
    pending: function (st, p) {   /* b1 (sim_check C9): the engine did not take the handoff (a fresh moment, as at half-time): its own picture, not the world's */
      var m = STATE.get(st); if (!(m && m.nextPic)) return false;
      /* b4 (r1 item 5, break handdrop): match.js sets continues = false on EVERY handoff moment, so b3 dropped every handoff picture (C9H 89 of
       * 92); the picture goes only when the engine did not take the handoff (a fresh moment, as at half-time: p.handoff unset) */
      if (p && m.nextPic.rule === 'handoff' && (SW.brk === 'handdrop' ? !p.continues : !p.handoff) && SW.brk !== 'handfresh') { m.nextPic = null; LOG.handDropped = (LOG.handDropped || 0) + 1; return false; }
      return true; }, drop: function (st) { var m = STATE.get(st); if (m) { m.pass = null; m.nextPic = null; } } };
  return API;
});
