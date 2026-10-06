/* The match. Six moments, you choose, it resolves.
 *
 * Built for Thursday 2026-09-24: Eduardo screenshares this to Arturo and
 * Rodrigo and asks whether it is fertile ground rather than whether it is
 * finished.
 *
 * HOW A MOMENT RESOLVES. Each option is a stat check (his ruling). The margin
 * decides the spread; beat it by six and it simply works. Then:
 *
 *   YOUR moment   good  -> you score (or, for a switch or an overlap run,
 *                          the same attack goes on to a follow-up choice)
 *                 mixed -> the ball goes out of play and the attack is over
 *                 bad   -> you lose it and they break, so the next moment is
 *                          theirs and it is a dangerous one
 *
 *   THEIR moment  good  -> you stop it
 *                 mixed -> they get a shot away and it goes wide
 *                 bad   -> they score
 *
 * That is the whole outcome table. It fits in four lines on purpose: he has to
 * be able to explain it on a call in one sentence.
 */
(function (root) {
  'use strict';
  var C = root.Cantera || require('../../shared/cantera.js');
  var A = root.KMAttr || require('./attributes.js');
  var M = root.KMModel || require('./model.js');
  var R = root.KMResolve || require('./resolve.js');
  /* w0: the effects layer. Only newMatch(..., { build }) creates a runtime
   * (st.fx); every use below is behind `if (st.fx)`, so a match with no
   * build is s0's match, draw for draw. */
  var FX = root.KMEffects || require('./effects.js');

  function sgn(n) { return (n > 0 ? ' +' : ' ') + n; }
  /* "(14 +4 a short pass is easy, +2 there is space on the right)" */
  function parts(total, mods, bonus, because) {
    if (mods && mods.length) {
      var sum = mods.reduce(function (a, m) { return a + m.n; }, 0);
      return ' (' + (total - sum) + mods.map(function (m) { return sgn(m.n) + ' ' + m.why; }).join(',') + ')';
    }
    if (bonus) return ' (' + (total - bonus) + sgn(bonus) + ', ' + (because || 'the safe option') + ')';
    return '';
  }
  function O() { return root.KMOptions || require('./options.js'); }
  function first(p) { return p ? String(p.name || '').split(' ')[0] || p.name : 'him'; }
  function statName(a) { return (root.KMOptions || require('./options.js')).statOf(a); }

  var MOMENTS = 6;
  var ZONE_AT = ['in your half', 'in midfield', 'at the edge of their box', 'in their box'];
  var ZONE_GAIN = ['', 'You got the ball into midfield.', 'You got the ball to the edge of their box.', 'You got the ball into their box.'];                       // his ruling: start with six
  var MINUTES = [12, 27, 41, 58, 71, 86];

  /* After you lose the ball going forward, the next moment is their counter.
   * Only situations that ARE a counter: "they have had the ball in your half
   * for several minutes" cannot follow a turnover ten seconds ago. */
  var COUNTERS = { over_the_top: 1, their_winger: 1, caught_square: 1, tired_gap: 1 };
  /* After a switch or an overlap run comes off, the same attack goes on into
   * one of these, in the same minute. Open-play attacks only. */
  var FOLLOW_ON = { overlap: 1, third_man: 1 };

  /* Each time a situation has already happened this match, its weight is
   * multiplied by this again. His playtest, 2026-09-23, seed 34 with a high
   * press: "Ball in behind your line" five times out of six, Keith against Tom
   * every time. Nothing stopped a moment repeating, and at a high press 13.5
   * percent of matches had one situation four or more times. Style still
   * decides which moments come up most; it just cannot fill the match. */
  var REPEAT_DAMP = 0.3;

  /* One plain sentence saying how the play ended, for the top of the screen.
   * Keyed by what the match did, so it cannot disagree with the scoreline. */
  function headline(effect, who, pays, actorName) {
    switch (effect) {
      case 'goal': return 'You scored.';
      case 'concede': return 'They scored.';
      case 'break': return 'You lost the ball. They are attacking, and you have to stop it.';
      case 'ground': return 'It worked. The same attack goes on: choose what happens next.';
      case 'stopped': return 'You stopped them. Their attack is over.';
      case 'rest': return 'Fresh players are on.';
    }
    if (who === 'them') return 'They did not score. Their attack is over.';
    if (pays === 'keep') return 'You kept the ball, but this attack did not score.';
    return 'The attack is over. Nobody scored.';
  }

  /* m1: THE NEXT MOMENT OPENS WITH WHAT THE BALL DID (Eduardo's ruling,
   * dashboard q2, 2026-09-25 22:25): "the next moment's opening follows what
   * the ball did between the moments; if your team kept it, say your team
   * still has the ball; 'You win the ball back' only when you won it".
   * Before this, 47 in 1,400 matches said "You kept the ball" and then opened
   * "You win the ball back in their half", and 474 named a man with the ball
   * and opened with somebody else (cohcheck result_holder_next_scene).
   * When your attack ended with your team keeping the ball (a short, safe or
   * back pass that worked, named on the result), the next fresh moment opens:
   *   your moment    "Your team still has the ball. Yamal plays it on." (the
   *                  press trap's "You win the ball back ..." becomes where the
   *                  ball is; after their cleared corner: "Later, Yamal loses
   *                  the ball, and they win a corner.")
   *   their moment   "Later, Yamal loses the ball." ("... plays it back to
   *                  your keeper" when your keeper is pressed; "Later, Yamal
   *                  and your team lose the ball passing out from the back"
   *                  when you are caught square)
   * Words only: who has the ball, the options and every roll are the same
   * (score.js equals s0 apart from "version"). GUARD.keptOpener off is s0. */
  var TRAP_WHERE = 'You are in their half, about 27 metres from their goal.';
  var SQUARE_LOST = 'You lost the ball passing out from the back.';
  function keptOpener(sit, text, man, holder) {
    var nm = first(man), line = sit.line || '', still = 'Your team still has the ball. ';
    text = String(text || '');
    if (sit.who === 'you') {
      if (sit.id === 'counter_from_corner') return 'Later, ' + nm + ' loses the ball, and they win a corner. ' + text;
      var on = holder && holder !== man ? nm + ' plays it on. ' : '';
      if (sit.id === 'press_trap' && line && text.indexOf(line) === 0) return still + on + TRAP_WHERE + text.slice(line.length);
      return still + on + text;
    }
    if (sit.id === 'keeper_to_feet') return still + nm + ' plays it back to your keeper. ' + text;
    if (sit.id === 'caught_square' && text.indexOf(SQUARE_LOST) === 0) return 'Later, ' + nm + ' and your team lose the ball passing out from the back.' + text.slice(SQUARE_LOST.length);
    return 'Later, ' + nm + ' loses the ball. ' + text;
  }

  /* CHAINED EVENTS. Eduardo, 2026-09-23: "each event covered over a series
   * of turns ... it chains from one decision to the next until an event
   * concludes with a safe recovery, a goal, out of bounds, a save, a yellow
   * card, a foul." Still six events a match; an event is now a string of
   * decisions in the same minute:
   *
   *   your step   goal, shot wide/out, stopped, substitution  -> event ends
   *               switch or overlap comes off ('ground')      -> you go on, to
   *                                                              a chance (CHAIN_GROUND)
   *               safe pass comes off ('keep', good)          -> you still have
   *                                                              it (CHAIN_KEEP)
   *               ball lost after a gamble ('break')          -> their counter
   *   their step  anything                                    -> event ends
   *
   * At most CHAIN_CAP of your decisions in one event. On the last one no
   * option can carry the move on, so every event ends within CHAIN_CAP + 1
   * decisions (the +1 is their counter). opts.chain === false keeps the
   * six-moment rules exactly as they were (the switch on the page). */
  /* ZONES (a1): an attack now runs up the pitch zone by zone, so it needs
   * more room than three decisions: from your half to a shot is four. Five
   * of yours at most, then their counter if you lose it. On the fifth,
   * nothing on the menu can carry the attack on (options.js CONTINUES), so
   * every event still ends. */
  var CHAIN_CAP = 4;
  /* THEIR ATTACK BY ZONES (a4): a half-stop pushes them back a zone only
   * on the first T_CAP - 1 decisions of their attack; after that it ends
   * it, so their attack cannot go back and forth for ever */
  var T_CAP = 1;
  /* an attack that starts from winning the ball back in their attack is
   * quick: at most WIN_CAP decisions of yours (a4, keeps matches short) */
  var WIN_CAP = 3;

  /* x1: THE STRUCTURAL EXPERIMENT (EXPERIMENT.md). Wave A to E found about
   * 7.7 attacking decisions a match, so a build component fires 0.1 to 3
   * times. Four switches (m2: long ON by default, the others OFF; a match
   * with none is w1c's, draw for draw):
   *   cap      (a) one more decision in each of your attacks (CHAIN_CAP 5,
   *                WIN_CAP 4)
   *   m8       (a) eight moments instead of six (information only: the
   *                designer ruled six moments stay)
   *   between  (b) the play between moments is an engine event (a pass, a
   *                run, a tackle, a foul, a shot from distance) that
   *                components can act on, changing the NEXT moment's opening
   *                state through the engine: who has the ball, how high your
   *                attack starts, an edge on its first decision, a booked
   *                defender, their stamina, a state
   *   long     (c) a firing lasts longer: an edge a component gives lasts
   *                the rest of the attack, a one-decision state lasts the
   *                attack, and a window on "the first decision after a won
   *                ball" covers the whole break
   * Node: KM_X1=cap,between (environment); page: ?x1=cap,between; or
   * newMatch(..., { x1: 'cap,between' }). */
  var X1_KNOWN = { cap: 1, m8: 1, between: 1, long: 1 };
  function x1Parse(v) {
    var f = {};
    String(v || '').split(/[,+ ]/).forEach(function (k) { if (X1_KNOWN[k]) f[k] = true; });
    return Object.keys(f).length ? f : null;
  }
  /* m2: (c) "long" is ON by default (x1's recommendation, "cheap and
   * safe"); (b) "between" stays OFF until the designer rules on it; cap and
   * m8 are carried, off (x1 rejected cap; m8 breaks the six-moment ruling).
   * Asking for switches replaces the default: KM_X1=none (or ?x1=none) is
   * every switch off, KM_X1=long,between turns (b) on as well. With no build
   * no switch changes a match (only components use what long lengthens). */
  var X1_ASK = (typeof process !== 'undefined' && process.env && process.env.KM_X1) ||
    (root.location && /[?&]x1=([^&]*)/.exec(root.location.search || '') ? decodeURIComponent(/[?&]x1=([^&]*)/.exec(root.location.search)[1]) : '');
  /* m5 (designer ruling q4, 2026-09-26): "between" is ON by default too, and
   * with NO cap on how often the play between moments hands you the ball
   * (x1 recommended at most 1 or 2 a match; that cap was never built, and
   * now it is ruled out: balance later from player data, by making the
   * pieces that unlock it rarer). ?x1=none / KM_X1=none turns every switch
   * off; ?x1=long is m4's default. With no build nothing listens to the
   * between play, and it uses its own dice, so a match is the same match. */
  var X1_DEFAULT = X1_ASK ? x1Parse(X1_ASK) : { long: true, between: true };
  /* x1check.js --prove: KM_X1_BREAK breaks one thing at a time */
  var X1_BREAK = (typeof process !== 'undefined' && process.env && process.env.KM_X1_BREAK) || '';
  /* kmtree5: archcheck.js --prove (KM5_BREAK) */
  var KM5_BREAK = (typeof process !== 'undefined' && process.env && process.env.KM5_BREAK) || '';
  /* kmtree5 a3 (helper C): KM_C_ACTION=a2 (node) or ?caction=a2 (page) plays a2's cards (t_cmp.js strict pass) */
  var C_ACTION = (typeof process !== 'undefined' && process.env && process.env.KM_C_ACTION) || '';
  try { if (typeof location !== 'undefined' && /[?&]caction=a2\b/.test(location.search || '')) C_ACTION = 'a2'; } catch (e) { }
  var C3 = C_ACTION !== 'a2';
  /* kmtree5 a5 P1 (helper D, BRIEF-a5.md): the three defending shapes (options.js D_STEP, D_HOLD, D_FOUL). Here only:
   * Hold him up clears their carried edge, is used at most once in their attack (a5Hold on the chain), keeps the same
   * man on the ball and says so in the headline; Bring him down books your man. KM_A5_DEF=on / ?a5def=on; off: a4. */
  var A5_DEF = (typeof process !== 'undefined' && process.env && process.env.KM_A5_DEF === 'on');
  try { if (typeof location !== 'undefined' && /[?&]a5def=on\b/.test(location.search || '')) A5_DEF = true; } catch (e) { }
  /* kmtree5 a11 (helper G11; BRIEF-a11.md package G, DECISIONS-G11.md): the two gameplay rulings of 2026-10-02, ON by
   * default, each behind its switch (effects.js g11: KM_G11=none, KM_G11_OFF=skin|drop; the page ?g11off=skin|drop).
   *   skin: next() marks the first decision of a moment against "Gets under your skin" (options.js g11Rattle makes one
   *         offered card a rattled one); choose() settles a rattled card as a loss before any dice are rolled.
   *   drop: a won "midfield drops back" (M_DROP) marks its result for the picture (ev.dropBack) and the next moment's
   *         text says the midfield is back; the edge and the men are options.js's.
   * With both off this file plays a10's match exactly (t_cmp.js). G11_BRK (env G11_BREAK) breaks one thing for the checks. */
  var G11_SKIN = !!(FX.g11 && FX.g11('skin')), G11_DROP = !!(FX.g11 && FX.g11('drop'));
  var G11_BRK = (typeof process !== 'undefined' && process.env && process.env.G11_BREAK) || '';
  var G11_SKIN_ID = 'OP_UNDER_YOUR_SKIN';
  /* kmtree5 a4 (helper G): Eduardo's rulings of 2026-09-30 on the a3 playtest (DECISIONS-G.md). KM_G_ACTION=a3 in node
   * (or ?gaction=a3 in the page) plays a3's match, every change of stream G off (t_cmp.js strict pass). KM_G_OFF=a,b
   * (or ?goff=a,b) turns single changes off, to measure each alone: menu, slalom, carrier, mark, fkwide, square.
   * gFire(k) notes that change k made this decision differ from a3's (t_cmp.js declares those differences). */
  var G_ACTION = (typeof process !== 'undefined' && process.env && process.env.KM_G_ACTION) || '';
  var G_OFF = (typeof process !== 'undefined' && process.env && process.env.KM_G_OFF) || '';
  try { var gq0 = (typeof location !== 'undefined' && location.search) || ''; if (/[?&]gaction=a3\b/.test(gq0)) G_ACTION = 'a3'; var gm0 = /[?&]goff=([\w,]+)/.exec(gq0); if (gm0) G_OFF = gm0[1]; } catch (e) { }
  function gOn(k) { return G_ACTION !== 'a3' && (',' + G_OFF + ',').indexOf(',' + k + ',') < 0; }
  function gFire(k) { var t = root.KMGTrace || (root.KMGTrace = []); t.push(k); }
  if (X1_BREAK === 'defaultcap' || X1_BREAK === 'scorecap') X1_DEFAULT = { cap: true };
  var MINUTES8 = [10, 21, 32, 43, 55, 66, 77, 88];
  /* kmtree5: Patience (archetypes.js) makes your attacks longer: st.arch.capPlus decisions more */
  /* (review 2026-09-29, item 8: his doc's number is "up to 6", after a won ball too: st.arch.capTo = 6) */
  function capTo(st) { return (st.arch && st.arch.capTo) || 0; }
  function chainCapOf(st) { return (capTo(st) || CHAIN_CAP) + (st.x1 && st.x1.cap ? 1 : 0); }
  function winCapOf(st) { return (capTo(st) || WIN_CAP) + (st.x1 && st.x1.cap ? 1 : 0); }
  function momentsOf(st) { return st.x1 && st.x1.m8 ? 8 : MOMENTS; }
  function minutesOf(st) { return st.x1 && st.x1.m8 ? MINUTES8 : MINUTES; }

  /* kmtree5 a11 Monday (stream CLK; Eduardo's ruling of 2026-10-03, MONDAY I.4): THE MATCH CLOCK. "Each moment gets a
   * 3-minute window to start ... the moment at minute 86 would happen either at minute 85, minute 86, or minute 87.
   * Each additional duel in that moment would add 1 minute ... If you score at minute 92, it should show as having
   * happened at minute 92."
   *   - a fresh moment starts at its scheduled minute (MINUTES) -1, 0 or +1: the offsets come from the match's seed
   *     through their OWN generator (clkOffsets), drawn once at kick-off, never from the match's dice;
   *   - each further decision of the moment (your steps, their counter, their box, a rebound) is one minute later;
   *   - a moment you start by winning the ball (the handoff, a4) starts the minute after the last decision before it;
   *   - p.minute and ev.minute are this clock's minute (the chip, the feed, the goal line, the telemetry, the report
   *     and "scored at 92 minutes" all read them); the engine's own minute stays as it was (p.gameMinute), so stamina,
   *     every card's "when" and every roll are the same: only the minute shown differs (clk_same.js proves it).
   * KM_CLK=off (node) or ?clk=off (page): the old clock (every decision of a moment at the scheduled minute).
   * CLK_BREAK (env, for the checks): rng (the offsets are drawn from the match's dice), flat (no minute per decision),
   * game (the engine reads the shown minute), seed (the offsets ignore the seed), handoff (a moment you start by winning
   * the ball starts at its scheduled minute), evmin (the result keeps the engine's minute), dropfree (the drop back is
   * charged 0 while its card says the cost). */
  var CLK_ASK = (typeof process !== 'undefined' && process.env && process.env.KM_CLK) || '';
  try { if (typeof location !== 'undefined') { var clq = /[?&]clk=(\w+)/.exec(location.search || ''); if (clq) CLK_ASK = clq[1]; } } catch (e) { }
  var CLK_ON = CLK_ASK !== 'off';
  var CLK_BRK = (typeof process !== 'undefined' && process.env && process.env.CLK_BREAK) || '';
  function clkOffsets(st, n) {
    var rng = CLK_BRK === 'rng' ? st.rng : new C.RNG(((CLK_BRK === 'seed' ? 1 : (st.seed | 0)) * 6007 + 0xc10c) >>> 0), out = [];
    for (var i = 0; i < n; i++) out.push(Math.floor(rng.next() * 3) - 1);
    return out;
  }
  /* stamp the decision just built with the clock's minute (called from next(), once the decision exists) */
  function clkStamp(st, p) {
    var c = st.clk;
    if (c.n !== st.n) {
      var mm = minutesOf(st);
      c.n = st.n; c.at = st.log.length;
      /* a12 MERGE (the 7-match Cup's overtime with the clock): a moment past the kick-off's count that the cup schedules
       * by st.minuteNow (cup.js otStep: 104 and 116) starts at that minute plus its own offset; without this the clock
       * showed overtime at 77' and 88' (MINUTES8). Normal matches never reach it (st.n < c.base). */
      var cbase = st.n >= (c.base || 99) && st.minuteNow && CLK_BRK !== 'otmin' ? st.minuteNow : mm[Math.min(st.n, mm.length - 1)];
      c.start = p.handoff && c.last !== null && CLK_BRK !== 'handoff' ? c.last + 1 : cbase + (c.offs[st.n] || 0);
      /* a12 RUL-E (CLK-2, clk2; Eduardo: "if a moment ever reaches the next one's start, the next moment starts after the
       * last duel"): a fresh moment never starts at or before the previous duel's minute */
      if (r12On('clk2') && c.last !== null && c.start <= c.last) { c.start = c.last + 1; c.r12Pushed = (c.r12Pushed || 0) + 1; p.r12Pushed = true; }
      if (r12On('stoppage')) c.base0 = cbase;
    }
    p.gameMinute = p.minute;
    p.minute = c.start + (CLK_BRK === 'flat' ? 0 : st.log.length - c.at);
    if (r12On('stoppage')) p.minuteText = r12MinuteText(p.minute, c.base0);   /* a12 RUL-E (CLK-3) */
  }
  /* the engine's minute of a decision (what it was before the clock) */
  function gameMin(p) { return p.gameMinute !== undefined && CLK_BRK !== 'game' ? p.gameMinute : p.minute; }
  /* a12 stream GAME3a (minleft): the minute the clock will stamp on the decision about to be built (clkStamp's rule,
   * read without changing anything), so a card's "N minutes left" reads the minute on screen */
  function clkPeek(st, handoff) {
    var c = st.clk;
    if (!c) return null;
    if (c.n === st.n) return c.start + (CLK_BRK === 'flat' ? 0 : st.log.length - c.at);
    var mm = minutesOf(st);
    var cbase = st.n >= (c.base || 99) && st.minuteNow && CLK_BRK !== 'otmin' ? st.minuteNow : mm[Math.min(st.n, mm.length - 1)];
    var pk = handoff && c.last !== null && CLK_BRK !== 'handoff' ? c.last + 1 : cbase + (c.offs[st.n] || 0);
    if (r12On('clk2') && c.last !== null && pk <= c.last) pk = c.last + 1;   /* a12 RUL-E (CLK-2) */
    return pk;
  }
  /* a12 stream GAME3a: options.js's switch (KM_G3, ?g3=; HANDOVER-G3A.md) */
  function g3On(k) { var g = O()._g3 ? O()._g3() : null; return !!(g && g[k]); }
  function g3Brk() { var g = O()._g3 ? O()._g3() : null; return g ? g.brk || '' : ''; }
  /* a12 stream RUL-E: options.js's switch (KM_R12, ?r12=; HANDOVER-RULE.md). R12_BREAK=<part> undoes that part. */
  function r12On(k) { var g = O()._r12 ? O()._r12() : null; return !!(g && g[k] && g.brk !== k); }
  /* (CLK-3, stoppage) the minute as shown: past the end of its half, "45+2" / "90+2" (overtime: "105+1", "120+2").
   * base: the moment's scheduled minute, which says which half it belongs to */
  function r12HalfEnd(base) { return base <= 45 ? 45 : base <= 90 ? 90 : base <= 105 ? 105 : 120; }
  function r12MinuteText(m, base) {
    var e = r12HalfEnd(typeof base === 'number' ? base : m);
    return m > e ? e + '+' + (m - e) : String(m);
  }
  /* (K1-4, cont) how many times a won ball may continue the same moment before a12's rule (your attack is the next
   * moment) takes over: KM_R12_CONTMAX, default 1 (a bound, so a moment cannot pass the ball back and forth forever) */
  var R12_CONT_MAX = (function () { var v = typeof process !== 'undefined' && process.env && process.env.KM_R12_CONTMAX; return v && /^\d+$/.test(v) ? +v : 1; })();

  /* kmtree5 a11 Monday (stream CLK; Eduardo's ruling of 2026-10-02 on the drop back, MONDAY A7b: "let them really
   * sprint, costs a bit of extra stamina (and says so on the card)"): choosing "midfield drops back" (M_DROP) costs
   * your midfield line DROP_COST stamina, paid whatever the result, like every other card's cost (st.spent, the
   * stamina_spent event). Before this the card was free (a low-risk card costs nothing, options.js costOf). The card
   * says it (options.js M_DROP reads the same switch and default: clkcheck.js K6 holds the two equal).
   * KM_DROPCOST=off or a number (node), ?dropcost=off or a number (page). The amount is NOT ruled: DROP_COST_DEFAULT
   * is the proposal (HANDOVER-CLK.md, DECISIONS: half of a sprint card's RUN_COST 16, because the drop back is a run
   * the whole line makes but nobody has to win a duel). */
  var DROP_COST_DEFAULT = 8;
  var DROP_ASK = (typeof process !== 'undefined' && process.env && process.env.KM_DROPCOST) || '';
  try { if (typeof location !== 'undefined') { var dcq = /[?&]dropcost=(\w+)/.exec(location.search || ''); if (dcq) DROP_ASK = dcq[1]; } } catch (e) { }
  var DROP_COST = DROP_ASK === 'off' ? 0 : /^\d+$/.test(DROP_ASK) ? +DROP_ASK : DROP_COST_DEFAULT;
  function dropMark(p) {
    if (!DROP_COST || !p || !p.moment) return;
    (p.moment.options || []).forEach(function (o) {
      if (o.id !== 'M_DROP' || o.cost) return;
      o.cost = { line: 'mid', amount: CLK_BRK === 'dropfree' ? 0 : DROP_COST, run: true, drop: true };
    });
  }

  /* x1 (b): THE PLAY BETWEEN MOMENTS. Before a moment that starts fresh
   * (not a won ball carried on, not their counter after you lost it, not
   * the first), the engine draws what happens in the seconds of play before
   * it, from its OWN generator (seeded by the match seed and the moment),
   * so the match's dice are untouched: with no component listening, the
   * match is the same match. It announces it (effects event between_play);
   * a component may then change how the next moment opens, through the
   * engine (effects.js between helpers). What it changed is in the log and
   * on st.pending.between (the director should stage it: not done here). */
  var BETWEEN = [
    { team: 'them', kind: 'pass', w: 30, tags: ['pass', 'short pass'], text: 'they knock it about at the back' },
    { team: 'them', kind: 'carry', w: 15, tags: ['carry'], text: 'their midfielder carries it forward' },
    { team: 'you', kind: 'pass', w: 25, tags: ['pass', 'short pass'], text: 'you move it around in midfield' },
    { team: 'you', kind: 'shot', w: 8, tags: ['shot', 'long shot', 'hard shot'], text: 'a shot from distance flies over' },
    { team: 'you', kind: 'tackle', w: 10, tags: ['tackle'], text: 'a loose ball in midfield, and you go in for it' },
    { team: 'them', kind: 'foul', w: 8, tags: ['foul'], text: 'one of theirs trips one of yours' },
    { team: 'you', kind: 'foul', w: 4, tags: ['foul'], text: 'one of yours trips one of theirs' }
  ];
  function pickLine(rng, list) { return list.length ? list[Math.floor(rng.next() * list.length)] : null; }
  function betweenPlay(st) {
    var rng = X1_BREAK === 'rng' ? st.rng : new C.RNG(((st.seed | 0) * 7919 + st.n * 104729 + 0x51ed) >>> 0);
    var tot = BETWEEN.reduce(function (a, b) { return a + b.w; }, 0), r = rng.next() * tot, b = BETWEEN[BETWEEN.length - 1];
    for (var i = 0; i < BETWEEN.length; i++) { r -= BETWEEN[i].w; if (r <= 0) { b = BETWEEN[i]; break; } }
    function of(sq, lines) { return sq.players.filter(function (p) { return lines.indexOf(p.line) >= 0; }); }
    var actor, foil;
    if (b.team === 'them' && b.kind === 'pass') { foil = pickLine(rng, of(st.opp, [0])); actor = pickLine(rng, of(st.squad, [2])); }
    else if (b.kind === 'carry') { foil = pickLine(rng, of(st.opp, [1])); actor = pickLine(rng, of(st.squad, [1])); }
    else if (b.kind === 'pass') { actor = pickLine(rng, of(st.squad, [1])); foil = pickLine(rng, of(st.opp, [1])); }
    else if (b.kind === 'shot') { actor = pickLine(rng, of(st.squad, [2])); foil = st.opp.keeper; }
    else if (b.kind === 'tackle') { actor = pickLine(rng, of(st.squad, [0, 1])); foil = pickLine(rng, of(st.opp, [1, 2])); }
    else if (b.team === 'them') { foil = pickLine(rng, of(st.opp, [0, 1])); actor = pickLine(rng, of(st.squad, [1, 2])); }
    else { actor = pickLine(rng, of(st.squad, [0, 1])); foil = pickLine(rng, of(st.opp, [1, 2])); }
    st.x1Next = { yours: false, up: 0, open: [], lines: [] };
    st.between = { team: b.team, kind: b.kind, text: b.text, actor: actor ? first(actor) : null, foil: foil ? first(foil) : null };
    st.fx.emit('between_play', { side: b.team, kind: b.kind, tags: b.tags.slice(), actor: actor || null, foil: foil || null,
      to: null, band: null, zone: null, minute: minute(st), effect: null, roll: rng.next() });
  }
  var START_EDGES = false;
  var CHAIN_GROUND = { overlap: 1, second_ball: 1, third_man: 1 };
  var CHAIN_KEEP = { third_man: 1, overlap: 1 };

  /* g1: f2's COUNTERPLAY, brought onto e2 (its comments kept). */
  /* COUNTERPLAY (f1). Eduardo's a3 match: "Yamal cuts it back to Oyarzabal"
   * then "Oyarzabal shoots as hard as he can" scored two of his three goals,
   * and his decision time fell from 40-60 seconds to 3-15. A route that keeps
   * working stops being a decision. Three answers, one switch:
   *
   *   learn  the defender who was beaten learns: each time you beat the same
   *          named player with the same kind of option, he gets +2 against it
   *          next time (up to +6)
   *   fade   an option that just worked is -2 for the rest of that event and
   *          the next one, then it is back to normal
   *   adapt  at half-time they put a second player on the side you attacked
   *          most and on the player who scored or shot most; the other side
   *          has more room
   *   off    a5 exactly
   *
   * None of them reads the score. They react to what you did, never to who
   * is winning (he rejected momentum because it spirals). */
  /* f2, two changes to Learn (the default):
   *   the KEEPER does not learn. On f1 one goal with the hard shot made every
   *   later hard shot +2 for him, which is most of why goals fell. Instead he
   *   reads the last shot (from your next attack on, not on a rebound in
   *   the same one): after a hard shot he is ready for another (+2
   *   against the next hard shot, -1 against a placed one); after a placed
   *   shot, the reverse. The two shots trade off instead of both getting worse.
   *   ROOM: when an outfield defender has learned a move, he is staying close
   *   to the man who beat him, and one other option on the same menu (a
   *   different move that does not go past him) gets +1, named on both
   *   cards. It points you at something newly good, not only away from the
   *   old thing. It reads what you did, never the score. */
  var KEEP_UP = 2, KEEP_DOWN = 0, ROOM_BY = 1;
  var SHOT_KIND = { Z_SHOOT: 'hard', Z_SHOOT_FAR: 'hard', Z_SHOOT_EDGE: 'hard', Z_PLACE: 'placed' };
  var SHOT_NOUN = { hard: 'hard shot', placed: 'placed shot' };
  /* moves that go backwards are not "room": the pointer is to a way forward */
  var NOT_ROOM = { Z_KEEP_BACK: 1, Z_RECYCLE: 1 };
  /* g2: a pass backwards or across the back beats nobody, so it is not a
   * move the other team learns, fades or reacts to (round 3 review: 53 cards
   * said a defender "has seen this pass back"); they are out of NOUN */
  function learnKey(q) { return q.foil.id + '|' + q.id; }
  function isKeeper(st, p) { return !!(p && st.opp && p === st.opp.keeper); }
  var COUNTER_MODES = { learn: 1, fade: 1, adapt: 1, off: 1 };
  /* st3 (lead's default on the designer's open question, 2026-09-28): GUESSING REPLACES THE LEARN
   * COUNTER. The counterplay below (defenders who learn a move and leave room, the keeper reading the
   * last shot) is off by default; KM_LEARN=old / ?learn=old brings it back alongside Guessing (and is s0's
   * default, 'learn'). An explicit counter mode (opts.counter, KM_COUNTER, ?counter=) still wins. */
  function learnOld() {
    var m = null;
    if (typeof process !== 'undefined' && process.env && process.env.KM_LEARN) m = process.env.KM_LEARN;
    if (!m && root.location && /[?&]learn=([^&]*)/.test(root.location.search || '')) m = /[?&]learn=([^&]*)/.exec(root.location.search)[1];
    return m === 'old' || (typeof process !== 'undefined' && process.env && process.env.ST1_BREAK === 'learnon');   /* startercheck --break learnon */
  }
  var COUNTER_DEFAULT = learnOld() ? 'learn' : 'off';
  var LEARN_STEP = 2, LEARN_MAX = 3, FADE_BY = 2, ADAPT_BY = 2;
  /* the kind of option, as a noun for "has seen this ___" */
  var NOUN = {
    Z_PASS_MID: 'pass into midfield', Z_CARRY_OUT: 'run out of defence', Z_LONG_UP: 'long ball to head',
    Z_RUN_BEHIND: 'long ball to chase', Z_CARRY: 'run with the ball',
    Z_THROUGH: 'pass through', Z_SWITCH: 'switch to the other side', Z_SHOOT_FAR: 'shot from distance', Z_SHOOT_EDGE: 'shot from the edge of the box',
    Z_CROSS: 'cross to head', Z_WIDE: 'pass out wide', Z_CUTBACK: 'cut-back', Z_TAKE_ON: 'run at him',
    Z_OVERLAP: 'overlap', Z_LAYOFF: 'short pass', Z_SHOOT: 'hard shot',
    Z_PLACE: 'placed shot', Z_PULLBACK: 'pull-back', Z_CHIP: 'lifted shot', Z_SQUARE: 'pass across the goal',
    /* g1: e2's keyword and pair moves are moves too: a Dribbler who beats
     * the same man twice meets a man who has seen it (Messi's run moved the
     * final more than anything else in e1) */
    KW_Z_THROUGH_DEEP: 'long pass from deep', KW_Z_DRIBBLE_TWO: 'run at two defenders', KW_Z_DRIBBLE_BOX: 'run at two defenders',
    KW_Z_HEAD_DOWN: 'header down', KW_Z_EARLY_CROSS: 'early cross', KW_Z_LOW_CROSS: 'low cross', KW_Z_LATE_RUN: 'late run',
    PAIR_ONE_TWO: 'one-two', PAIR_OVERLAP: 'overlap', PAIR_FLICK: 'flick-on', PAIR_ROUTINE: 'far-post routine'
  };
  var TIMES = ['', 'once', 'twice', 'three times'];
  function times(k) { return TIMES[k] || k + ' times'; }
  var SIDE = ['left', 'middle', 'right'];
  function laneOf(p) { return O().lane(p); }
  function counterMode(opts) {
    var m = opts && opts.counter;
    if (!m && typeof process !== 'undefined' && process.env && process.env.KM_COUNTER) m = process.env.KM_COUNTER;
    return COUNTER_MODES[m] ? m : COUNTER_DEFAULT;
  }
  function teamName(sq) { return (sq && sq.club) || 'They'; }

  /* what the counterplay does to one of your options: parts for your number
   * (mine) and for theirs (theirs), each with the sentence for the card */
  function counterFor(st, q) {
    var out = { mine: [], theirs: [], notes: [] };
    var cm = st.cmem;
    if (!cm || st.counter === 'off' || !NOUN[q.id]) return out;
    if (st.counter === 'learn' && q.foil && isKeeper(st, q.foil)) {
      /* f2: the keeper reads the last shot instead of learning */
      var kind = SHOT_KIND[q.id], last = cm.keeper;
      /* he reads it between attacks: a second shot in the same attack (a
       * rebound) is not read, which on the harness halved the matches where
       * one route scored twice (21 to 11 in 300 as Spain) */
      if (cm.keeperN === st.n) last = null;
      if (kind && last) {
        var kn = first(q.foil);
        if (kind === last) {
          out.theirs.push({ n: KEEP_UP, why: kn + ' faced a ' + SHOT_NOUN[last] + ' last time and is ready for another' });
          out.notes.push(kn + ' faced a ' + SHOT_NOUN[last] + ' last time and is ready for another: +' + KEEP_UP + ' to him');
        } else if (KEEP_DOWN) {
          out.theirs.push({ n: -KEEP_DOWN, why: kn + ' is ready for another ' + SHOT_NOUN[last] + ', not a ' + SHOT_NOUN[kind] });
          out.notes.push(kn + ' is ready for another ' + SHOT_NOUN[last] + ', not a ' + SHOT_NOUN[kind] + ': -' + KEEP_DOWN + ' to him');
        }
      }
    } else if (st.counter === 'learn' && q.foil) {
      var k = cm.learn[learnKey(q)] || 0;
      if (k) {
        var n = LEARN_STEP * Math.min(LEARN_MAX, k);
        out.theirs.push({ n: n, why: first(q.foil) + ' has seen this ' + NOUN[q.id] + ' ' + times(k) });
        out.notes.push(first(q.foil) + ' has seen this ' + NOUN[q.id] + ' ' + times(k) + ': +' + n + ' to him');
        out.learned = { foil: q.foil, k: k, near: cm.beat[learnKey(q)] || q.actor };
      }
    }
    /* f2: the room a learned defender leaves (chosen by counterRoom) */
    var rm = st.counter === 'learn' && st.room;
    if (rm && rm.target && rm.target.id === q.id && rm.target.actor === q.actor && rm.target.foil === q.foil && rm.target.to === (q.to || null)) {
      out.mine.push({ n: ROOM_BY, why: first(rm.foil) + ' is staying close to ' + first(rm.near) });
      out.notes.push(first(rm.foil) + ' is staying close to ' + first(rm.near) + ': +' + ROOM_BY + ' to ' + first(q.actor));
    } else if (rm && rm.source && rm.source.id === q.id && rm.source.foil === q.foil && rm.source.actor === q.actor) {
      out.notes.push(first(rm.foil) + ' is staying close to ' + first(rm.near) + ', so ' + roomPhrase(rm.target) + ': +' + ROOM_BY);
    }
    if (st.counter === 'fade') {
      var f = cm.fade[q.id];
      if (f && st.n + 1 <= f.until) {
        out.mine.push({ n: -FADE_BY, why: 'they are ready for the ' + NOUN[q.id] + ' now' });
        out.notes.push('They are ready for the ' + NOUN[q.id] + ' now: -' + FADE_BY + ' to ' + first(q.actor));
      }
    }
    if (st.counter === 'adapt' && cm.adapt.set) {
      var a = cm.adapt.set, T = teamName(st.opp);
      var ln = laneOf(q.actor), lt = q.to ? laneOf(q.to) : ln;
      if (a.side !== null && (ln === a.side || lt === a.side)) {
        out.theirs.push({ n: ADAPT_BY, why: T + ' have a second player on the ' + SIDE[a.side] });
        out.notes.push(T + ' have a second player on the ' + SIDE[a.side] + ' since half-time: +' + ADAPT_BY + ' against ' + first(q.actor));
      } else if (a.side !== null && a.room !== null && ln === a.room) {
        out.mine.push({ n: ADAPT_BY, why: T + ' moved a player off the ' + SIDE[a.room] });
        out.notes.push(T + ' moved a player off the ' + SIDE[a.room] + ' at half-time: +' + ADAPT_BY + ' to ' + first(q.actor));
      }
      if (a.man && (q.actor === a.man || q.to === a.man)) {
        out.theirs.push({ n: ADAPT_BY, why: T + ' put a second player on ' + first(a.man) });
        out.notes.push(T + ' put a second player on ' + first(a.man) + ' at half-time: +' + ADAPT_BY + ' against ' + first(q.actor));
      }
    }
    /* w0: hook 'counter' (a build may cancel or add to what they learned) */
    if (st.fx) st.fx.counterHook(q, out);
    return out;
  }

  /* f2: "the pass through to Williams has more room" */
  function roomPhrase(t) {
    var nn = NOUN[t.id];
    if (t.to && t.to !== t.actor && !t.shot) return 'the ' + nn + ' to ' + first(t.to) + ' has more room';
    if (t.id === 'Z_TAKE_ON') return first(t.actor) + ' has more room to run at ' + first(t.foil);
    return first(t.actor) + ' has more room for the ' + nn;
  }

  /* f2: given the menu about to be shown (options.js offer), pick where the
   * room is. The learned defender with the most looks on this menu is the
   * one staying close; the room is the best way forward on the same menu
   * that is a different move, does not go past him, and does not involve
   * the man he is staying close to. Menu order breaks ties, so it is the
   * same every time for the same menu. Returns null when there is none. */
  function counterRoom(st, live) {
    if (st.counter !== 'learn') return null;
    var src = null, best = 0;
    live.forEach(function (o) {
      var lr = o.learned;
      /* g2: the man he is staying close to is a man on that card (the one
       * who runs or the one the ball goes to); otherwise there is no room
       * line (g1 named the last man who beat him, who was often not on the
       * card: 54 of 105 menus with a room line) */
      if (GUARD.roomOnCard && lr && !(o.actor === lr.near || o.to === lr.near || (o.label && o.label.indexOf(first(lr.near)) >= 0))) return;
      if (lr && lr.k > best) { best = lr.k; src = { o: o, lr: lr }; }
    });
    if (!src) return null;
    var D = src.lr.foil, A = src.lr.near, pick = null, pv = -99;
    live.forEach(function (o) {
      /* +1 on something that cannot fail is not a pointer */
      if (o.certain) return;
      if (o === src.o || o.disabled || !o.foil || !o.actor || !NOUN[o.id] || NOT_ROOM[o.id]) return;
      if (o.id === src.o.id || o.foil === D || o.learned) return;
      var shot = isKeeper(st, o.foil);
      if (o.actor === A || (!shot && o.to === A)) return;
      /* nor a play that goes through him (a cross FROM the man he is
       * staying close to is not room) */
      if (o.label && A && o.label.indexOf(first(A)) >= 0) return;
      var v = typeof o.edge === 'number' ? o.edge : -99;
      if (v > pv) { pv = v; pick = o; }
    });
    if (!pick) return null;
    return { foil: D, near: A,
      source: { id: src.o.id, foil: src.o.foil, actor: src.o.actor },
      target: { id: pick.id, actor: pick.actor, foil: pick.foil, to: pick.to || null, shot: isKeeper(st, pick.foil) } };
  }

  /* after one of your decisions: what the opponent remembers */
  function counterRecord(st, p, o, band, effect) {
    var cm = st.cmem;
    if (!cm || !NOUN[o.id] || p.moment.sit.who !== 'you') return;
    /* w0: hook 'learn' (a build may stop them learning from this) */
    if (st.fx && st.fx.learnHook(o)) return;
    var won = band === 'good' || effect === 'goal';
    if (st.counter === 'learn' && SHOT_KIND[o.id] && isKeeper(st, o.foil)) {
      /* f2: the keeper remembers the last shot, whatever became of it */
      cm.keeper = SHOT_KIND[o.id]; cm.keeperN = st.n;
    } else if (won && o.foil && !(st.counter === 'learn' && isKeeper(st, o.foil))) {
      var k = learnKey(o); cm.learn[k] = (cm.learn[k] || 0) + 1;
      if (o.actor) cm.beat[k] = o.actor;
    }
    if (won) cm.fade[o.id] = { until: p.index + 1 };
    if (p.index <= momentsOf(st) / 2) {
      /* the side of the pitch the move went down: where the ball went if it
       * was a pass, otherwise where the man with it is */
      var l = o.to && o.to !== o.actor ? laneOf(o.to) : laneOf(o.actor);
      cm.adapt.lanes[l]++;
      cm.adapt.total++;
      if (o.actor && /^Z_(SHOOT|PLACE|CHIP|SHOOT_FAR)$/.test(o.id)) {
        var r = cm.adapt.men[o.actor.id] || (cm.adapt.men[o.actor.id] = { p: o.actor, shots: 0, goals: 0 });
        r.shots++; if (effect === 'goal') r.goals++;
      }
    }
  }

  /* st1 (designer ruling 2026-09-28): GUESSING IS A BASE RULE, for both
   * teams, behind a switch (?guess=off, KM_GUESS=off, newMatch opts.guess).
   * "Every defence remembers the last kind of move each attacker tried; the
   * same kind again from him is +2 to the defender, any other kind +2 to the
   * attacker." It was wave E's Guessing tactic (content-e.js WE_GUESSING), for
   * your attacks only; here it is the engine's, like the counterplay above,
   * and it needs no build. The kinds: a run with the ball, a cross, a
   * cut-back, a ball in behind, a pass. Shots, balls backwards and the
   * keepers are not moves anyone remembers.
   *   Your attack: the kind is read from your card's action tags (the same
   *   list WE_GUESSING used); the memory is keyed by your man making the move.
   *   Their attack: the kind is the move of theirs your card meets (a tackle
   *   or press meets a run, an interception a pass, an offside trap or a drop
   *   a ball in behind, a man marked for the cross a cross); keyed by their
   *   attacker. So on defence, meeting him the way he came last time is +2 to
   *   your man, and anything else is +2 to him.
   * With the switch off nothing here runs, and a match is s0's match.
   * ?guess=yours / KM_GUESS=yours: your attacks only (a design option). */
  var GUESS_BY = 2;
  var ST1_BREAK_G = (typeof process !== 'undefined' && process.env && process.env.ST1_BREAK) || '';
  function guessMode(opts) {
    var m = opts && opts.guess !== undefined ? opts.guess : null;
    if (m === true) m = 'on'; if (m === false) m = 'off';
    if (!m && typeof process !== 'undefined' && process.env && process.env.KM_GUESS) m = process.env.KM_GUESS;
    if (!m && root.location && /[?&]guess=([^&]*)/.test(root.location.search || '')) m = /[?&]guess=([^&]*)/.exec(root.location.search)[1];
    /* 'yours': a design option, not the ruling: your attacks only (the reach wave E's tactic had) */
    return m === 'off' ? 'off' : m === 'yours' ? 'yours' : 'on';
  }
  function hasT(tags, list) { return list.some(function (t) { return (tags || []).indexOf(t) >= 0; }); }
  var G_BACK = ['back pass', 'recycle', 'time wasting', 'substitution', 'keeper action', 'clearance', 'all out attack'];
  /* your move, from your card's tags (content-e.js moveKind, kept word for word) */
  /* st2 (Codex review of st1, item 1): a set piece is not an open-play move: a free kick, a corner or a
   * rehearsed routine neither meets a remembered move nor overwrites one (effects.js tags: FK_CROSS,
   * FK_SHORT, PAIR_ROUTINE, KW_Z_FREE_KICK_WIDE, and every option of a free-kick decision carry 'set
   * piece'). ST1_BREAK=setpiece brings back st1's reading. */
  var G_SET = ['set piece', 'free kick', 'corner'];
  function guessKindYou(t) {
    if (ST1_BREAK_G !== 'setpiece' && hasT(t, G_SET)) return null;
    if (hasT(t, G_BACK)) return null;
    if (hasT(t, ['shot'])) return null;
    if (hasT(t, ['dribble', 'carry'])) return 'run';
    if (hasT(t, ['cross', 'low cross'])) return 'cross';
    if (hasT(t, ['cut-back', 'pull-back', 'square ball'])) return 'cut-back';
    if (hasT(t, ['through ball', 'long ball', 'run in behind', 'switch'])) return 'ball in behind';
    if (hasT(t, ['short pass', 'layoff', 'one-two', 'overlap', 'late run', 'pass'])) return 'pass';
    return null;
  }
  /* their move, from the card of yours that meets it */
  var G_DEF = {
    E_TACKLE: 'run', M_PRESS: 'run', TP_PRESS: 'run', E_DOUBLE: 'run', TD_DOUBLE: 'run', KW_STEAL: 'run', E_FOUL: 'run', M_FOUL: 'run',
    TD_FOUL: 'run', E_WIDE: 'run', TD_SHOW_WIDE: 'run', TD_DROP: 'run', BOX_COVER: 'run',
    M_CUT: 'pass', TP_CUT: 'pass', M_DROP: 'pass',
    E_OFFSIDE: 'ball in behind', TP_OFFSIDE: 'ball in behind', TP_DEEP: 'ball in behind', E_COVER: 'ball in behind', E_RACE: 'ball in behind',
    BOX_MARK: 'cross', BOX_HEADER: 'cross', HEAD_CLEAR: 'cross', BOX_SLIDE: 'cross',
    E_BLOCK: null, BOX_BLOCK: null, KW_BLOCK_BACK: null, BOX_CLEAR: null, BOX_CHARGE: null, BOX_WALL: null, T_RETREAT: null
  };
  function guessKindThem(id, t) {
    if (Object.prototype.hasOwnProperty.call(G_DEF, id)) return G_DEF[id];
    if (hasT(t, ['keeper action', 'set piece', 'block', 'wall', 'clearance'])) return null;
    if (hasT(t, ['header', 'aerial'])) return 'cross';
    if (hasT(t, ['offside trap', 'drop back', 'race'])) return 'ball in behind';
    if (hasT(t, ['interception'])) return 'pass';
    if (hasT(t, ['tackle', 'press', 'double team', 'foul'])) return 'run';
    return null;
  }
  /* st1 (coordinator's fix, 2026-09-28): ON YOUR DEFENCE THE MOVE IS THEIR ATTACKER'S, read from the
   * scene, not from the card you pick. Their man at the edge of your box with the ball runs at your
   * defence (a run); a ball over your defence is a ball in behind for the man chasing it; a cross into
   * your box is a cross by the man crossing it; in midfield their man on a counter runs at you (a run),
   * and otherwise looks for the pass (a pass). Shots, headers at goal, set pieces and a man through on
   * his own are not moves anyone remembers. (ST1_BREAK=defcard: the old reading, from your card.) */
  var G_MID_RUN = { their_counter: 1, counter: 1 };
  function theirMoveOf(path, sitId, via, man, tz) {
    if (!man) return null;
    /* st2: their set pieces are never moves either (their box via corner, fkcross, freekick already give null below) */
    if (path === 'box') return (via === 'cross' || via === 'lowcross') ? { kind: 'cross', att: man } : null;
    if (sitId === 'over_the_top') return { kind: 'ball in behind', att: man };
    if (tz === 1) return { kind: 'run', att: man };
    if (path === 'counter' || G_MID_RUN[sitId]) return { kind: 'run', att: man };
    return { kind: 'pass', att: man };
  }
  var G_NOUN = { run: 'run', cross: 'cross', 'cut-back': 'cut-back', 'ball in behind': 'ball in behind', pass: 'pass' };
  var G_PAST = { run: 'ran with the ball', cross: 'crossed', 'cut-back': 'cut it back', 'ball in behind': 'went for the ball in behind', pass: 'passed' };
  function guessOk(st, side, actor, foil) {
    if (!actor || !foil) return false;
    if (side === 'you') return foil !== st.opp.keeper && actor !== st.squad.keeper && st.opp.players.indexOf(foil) >= 0;
    return actor !== st.squad.keeper && foil !== st.opp.keeper && st.squad.players.indexOf(actor) >= 0;
  }
  /* the part one card gets: { mine: n } or { theirs: n }, the reason, and
   * the chip (n for you: +2 helps you, -2 hurts you) */
  function guessFor(st, q) {
    var g = st.guess;
    if (!g || g.mode === 'off') return null;
    var side = q.side === 'them' ? 'them' : 'you';
    if (g.mode === 'yours' && side === 'them') return null;
    if (!guessOk(st, side, q.actor, q.foil) && !(side === 'them' && ST1_BREAK_G !== 'nokeeper' && q.actor === st.squad.keeper && q.foil && q.foil !== st.opp.keeper)) return null;
    var mv = side === 'them' && ST1_BREAK_G !== 'defcard' ? st.theirMoveNow : null;
    if (side === 'them' && ST1_BREAK_G !== 'defcard' && (!mv || !mv.att || mv.att === st.opp.keeper)) return null;
    /* st3: on defence the scene's move reaches your keeper's cards too (the judges found it never did):
     * a keeper coming for the cross is as ready for it as a defender. ST1_BREAK=nokeeper: st2's rule */
    var k = side === 'you' ? guessKindYou(q.tags) : mv ? mv.kind : guessKindThem(q.id, q.tags);
    if (!k) return null;
    /* the attacker and the defender on this card (on defence: the man the scene is about) */
    var att = side === 'you' ? q.actor : mv ? mv.att : q.foil, def = side === 'you' ? q.foil : q.actor;
    var was = g[side][att.id];
    if (!was) return null;
    var past = was.kind === 'run' && was.against === def ? 'ran at him' : G_PAST[was.kind];
    if ((was.kind === k) !== (ST1_BREAK_G === 'guessflip')) {   /* st2: guessflip swaps the two cases (startercheck S6 oracle) */
      var why = first(def) + ' is ready: ' + first(att) + ' ' + past + ' last time', sh = first(def) + ' is ready', tiny = 'Guessing';
      return side === 'you' ? { theirs: GUESS_BY, why: why, short: sh, tiny: tiny, n: -GUESS_BY, same: true, kind: k } : { mine: GUESS_BY, why: why, short: sh, tiny: tiny, n: GUESS_BY, same: true, kind: k };
    }
    var why2 = first(def) + ' is set for ' + first(att) + '\'s ' + G_NOUN[was.kind], sh2 = first(def) + ' is set for a ' + G_NOUN[was.kind], tiny2 = 'Guessing';
    return side === 'you' ? { mine: GUESS_BY, why: why2, short: sh2, tiny: tiny2, n: GUESS_BY, same: false, kind: k, was: was.kind } : { theirs: GUESS_BY, why: why2, short: sh2, tiny: tiny2, n: -GUESS_BY, same: false, kind: k, was: was.kind };
  }
  /* after any decision: the defence remembers the attacker's kind of move,
   * whether it worked or not */
  function guessRecord(st, p, o) {
    var g = st.guess;
    if (!g || g.mode === 'off' || !o) return;
    var side = p.moment.sit.who === 'them' ? 'them' : 'you';
    if (g.mode === 'yours' && side === 'them') return;
    var mv = side === 'them' && ST1_BREAK_G !== 'defcard' ? p.theirMove : null;
    if (side === 'them' && ST1_BREAK_G !== 'defcard') {
      /* he tried it whatever you chose: remembered against him, even when your keeper met it */
      if (!mv || !mv.att || mv.att === st.opp.keeper) return;
      g.them[mv.att.id] = { kind: mv.kind, against: o.actor && o.actor !== st.squad.keeper ? o.actor : null, at: st.log.length };
      g.n++;
      return;
    }
    if (!guessOk(st, side, o.actor, o.foil)) return;
    var k = side === 'you' ? guessKindYou(o.tags) : guessKindThem(o.id, o.tags);
    if (!k) return;
    var att = side === 'you' ? o.actor : o.foil, def = side === 'you' ? o.foil : o.actor;
    g[side][att.id] = { kind: k, against: def, at: st.log.length };
    g.n++;
  }

  /* half-time: they change their setup to what you did most */
  function counterAdapt(st) {
    var cm = st.cmem, ad = cm.adapt;
    ad.done = true;
    if (st.counter !== 'adapt' || !ad.total) return null;
    var L = ad.lanes, side = 0;
    for (var i = 1; i < 3; i++) if (L[i] > L[side]) side = i;
    /* a side only if it was clearly where you went: most of it, and at least 3 */
    var second = L.slice().sort(function (a, b) { return b - a; })[1];
    if (L[side] < 3 || L[side] === second) side = null;
    var room = side === null ? null : side === 1 ? null : (L[0] <= L[2] ? 0 : 2);
    if (room === side) room = null;
    var man = null, best = -1;
    Object.keys(ad.men).forEach(function (id) {
      var r = ad.men[id], v = r.goals * 10 + r.shots;
      if (v > best) { best = v; man = r; }
    });
    if (side === null && !man) return null;
    ad.set = { side: side, room: room, man: man ? man.p : null };
    var T = teamName(st.opp), bits = [];
    if (side !== null) bits.push('a second player on the ' + SIDE[side] + ', where ' + L[side] + ' of your ' + ad.total + ' attacking decisions went');
    if (man) bits.push('a second player on ' + first(man.p) + ' (' + (man.goals ? man.goals + ' goal' + (man.goals > 1 ? 's' : '') + ' from ' : '') +
      man.shots + ' shot' + (man.shots > 1 ? 's' : '') + ' in the first half)');
    return 'After half-time ' + T + ' put ' + bits.join(', and ') + '.' +
      (room !== null ? ' That leaves more room on the ' + SIDE[room] + '.' : '');
  }


  function newMatch(squad, opp, seed, style, opts) {
    var st = {
      chainMode: !(opts && opts.chain === false), chain: null,
      squad: squad, opp: opp, seed: seed,
      rng: new C.RNG(seed),
      style: style || { press: 60, direct: 50, width: 50 },
      n: 0, score: { you: 0, them: 0 },
      log: [], pending: null, forcedTheirs: false, forcedYours: false, follow: null,
      /* minute each line was last refreshed by a substitution, so "stamina
       * back to 100" is a thing that happens rather than a thing it says */
      rested: { def: null, mid: null, att: null },
      subsLeft: 3, booked: {},
      spent: { def: 0, mid: 0, att: 0 }, usedSubs: {},
      /* who was in each situation already, so a repeat casts other men */
      seen: {},
      /* e1 CARRY-OVER (from c2): a shot's result stays with the man who
       * took it until his next shot; their men booked for tripping yours;
       * your Destroyer's one foul with no card */
      form: {}, oppBooked: {}, freeFouls: {},
      /* e1: THE STATE OF PLAY, one object every sentence reads from (see
       * playOf): who is attacking, where, whether the ball is in the air,
       * and which named man has it */
      play: null,
      /* g1 (f1/f2): what the opponent remembers of your attacks */
      counter: counterMode(opts),
      /* st1: Guessing, the base rule (guessFor): what each defence remembers */
      guess: { mode: guessMode(opts), you: {}, them: {}, n: 0 },
      /* st1: who presses Show them one side when no page is watching (showBotMode) */
      showBot: (opts && opts.showBot) || null,
      cmem: { learn: {}, beat: {}, keeper: null, fade: {}, adapt: { lanes: [0, 0, 0], total: 0, men: {}, set: null, done: false } }
    };
    /* x1: the experiment's switches for this match (all off by default) */
    st.x1 = opts && opts.x1 !== undefined ? (typeof opts.x1 === 'string' ? x1Parse(opts.x1) : opts.x1) : X1_DEFAULT;
    /* a11 Monday (stream CLK): the clock's start offsets, drawn once from the seed (never the match's dice) */
    if (CLK_ON && !(opts && opts.clock === false)) st.clk = { offs: clkOffsets(st, Math.max(8, momentsOf(st))), base: momentsOf(st), n: -1, at: 0, start: null, last: null };   /* a12 MERGE: 8 offsets always (the first six are the same draws as a11's), for the Cup's overtime moments */
    /* w0: a build (effects.js, EFFECTS.md) puts its players, tactics,
     * relationships and captain into this match */
    /* w0b: or the opponent's build (opts.oppBuild), or both */
    if (opts && (opts.build || opts.oppBuild)) {
      var fx = FX.attach(st, opts.build || null, opts.oppBuild || null);
      fx.minute = function () { return minute(st); };
      fx.legs = function () { return legs(st); };
    }
    return st;
  }

  /* THE STATE OF PLAY (e1). The worst bugs of the a3 review came from
   * sentences composed without it: after a failed pass the next decision
   * gave the ball to someone else, a header was offered for a ball on the
   * ground, and the man through on goal changed name. So each decision
   * carries this, the options read it (options.js: a header needs
   * play.air), and the tests check the sentences against it. */
  function playOf(side, zone, ball, opts) {
    opts = opts || {};
    return { attacking: side, zone: zone, air: !!opts.air, ball: ball || null,
      target: opts.target || null, via: opts.via || null, mode: opts.mode || null };
  }
  var AIR_VIA = { cross: 1, corner: 1, fkcross: 1, header: 1 };
  /* e1: switches for the tests, which show each check fails without the
   * rule it guards (test.js "E1") */
  var GUARD = { theirTo: true, form: true, theirBreak: true, lastOne: true, lastWin: true, roomOnCard: true, freshScene: true, caughtShot: true, diceNote: true, halfSame: true, keptOpener: true };
  /* the state of play in names, for the log (never the player objects) */
  function playNames(pl) {
    if (!pl) return null;
    return { attacking: pl.attacking, zone: pl.zone, air: pl.air, via: pl.via, mode: pl.mode,
      ball: pl.ball ? first(pl.ball) : null, target: pl.target ? first(pl.target) : null, near: pl.near ? first(pl.near) : null };
  }

  function minute(st) { var mm = minutesOf(st); return st.minuteNow || mm[Math.min(st.n, mm.length - 1)]; }
  function legs(st) {
    var now = M.legsAt(st.style, minute(st), st.squad);
    ['def', 'mid', 'att'].forEach(function (k) {
      var at = st.rested[k];
      if (at !== null) {
        var burnedBefore = 100 - M.legsAt(st.style, at, st.squad)[k];
        now[k] = Math.min(100, now[k] + burnedBefore);
      }
      /* what your own choices spent (options.js costOf), on top of the
       * clock; a substitution wipes it for that line */
      now[k] = Math.max(0, now[k] - ((st.spent && st.spent[k]) || 0));
    });
    return now;
  }
  function state(st) {
    var s = M.freshState(minute(st), legs(st), { you: st.score.you, them: st.score.them });
    /* a follow-up ends the attack: no second switch, so a play cannot chain
     * forever and the decision in front of you is how to finish it */
    if (st.follow) s.finishOnly = true;
    /* the last of your decisions in an event: nothing may carry it on */
    if (st.chainMode && st.chain && st.chain.next === 'zone' && st.chain.youSteps + 1 >= (st.chain.cap || chainCapOf(st)) + (st.fx ? st.fx.capBonus : 0)) s.finishOnly = true;
    /* your keeper's pass out can start your attack (options.js escape) */
    if (st.chainMode) s.zoneEscape = true;
    /* winning the ball back starts your attack, on the first decision of
     * their attack only (options.js winback) */
    if (st.chainMode && !st.chain) s.winBack = true;
    s.subsLeft = st.subsLeft; s.usedSubs = st.usedSubs; s.booked = st.booked;
    s.form = st.form; s.oppBooked = st.oppBooked; s.freeFouls = st.freeFouls; s.stepNo = st.log.length;
    s.kwPrev = st.kwPrev || {};
    if (gOn('slalom') && st.gSl && st.gSl.index === st.n + 1) s.gSl = st.gSl.pairs;   /* a4 (helper G): Slalom's pairs this attack */
    /* g1 (f1/f2): what the opponent has learned (options.js reads it on your
     * attack). Named counterplay, not counter: e2's state.counter is "their
     * counter-attack" */
    s.counterplay = function (q) { return counterFor(st, q); };
    s.counterRoom = function (live) { return counterRoom(st, live); };
    /* st1: Guessing, the base rule (options.js reads it on both sides' cards) */
    s.guessplay = function (q) { return guessFor(st, q); };
    s.setRoom = function (r) { st.room = r || null; };
    if (st.fx) s.fx = st.fx;
    if (G11_SKIN && st.g11Skin) s.g11Skin = st.g11Skin;   /* a11 (helper G11): this menu is the first decision of a moment (next) */
    if (g3On('defout') && st.chainMode) s.g3Last = st.n + 1 >= momentsOf(st) && !(r12On('cont') && r12On('contlast'));
    /* a12 ENG7 (contend): this moment has already been continued by a won ball as often as the bound allows, so a won ball
     * now ends it: no counter can follow, and the cards say so (GAME3a's last-moment rows) */
    if (g3On('defout') && st.chainMode && r12On('contend') && r12On('cont') && st.r12ContAt === st.n && st.r12ContN >= R12_CONT_MAX) s.g3Last = true;   /* a12 RUL-E (K1-4): with cont and contlast a won ball continues the last moment too */   /* a12 GAME3a: no moment follows this one (no counter) */
    return s;
  }

  function isOver(st) { return st.n >= momentsOf(st) && !st.pending; }

  /* st1: SHOW THEM ONE SIDE AS A BUTTON (content-a.js AD_DECOY_ROUTE). On the
   * first decision of each of your first-half attacks, until it is used, with
   * the piece in your build: canShowNow(st) is true and the page shows "Show
   * them this attack" above the cards. showAttack(st) marks this attack as
   * the one for show and rebuilds the menu from what built it (no dice are
   * rolled building a menu, so nothing else in the match moves): shots gone,
   * no stamina. It does not use up the decision.
   * Bots (showBot: newMatch opts.showBot, KM_SHOW_BOT, default 'first' in
   * node and 'never' on the page): 'first' presses on the first chance
   * (the planner's policy), 'half' presses with probability one half at each
   * chance, from its own generator (the random bot's), 'never'. */
  function CAx() { return root.KMContentA || null; }
  /* startercheck.js --break show | rebuild (ST1_BREAK) shows its checks fail */
  var ST1_BREAK = (typeof process !== 'undefined' && process.env && process.env.ST1_BREAK) || '';
  function hasShowPiece(st) {
    return !!(st.fx && st.fx.inst.some(function (x) { return x.def && x.def.id === 'AD_DECOY_ROUTE' && (x.side || 'you') === 'you'; }));
  }
  function canShowNow(st) {
    var p = st.pending, CA = CAx();
    if (!p || !CA || !hasShowPiece(st) || !CA.canShow(st)) return false;
    if (!p.moment || !p.moment.sit || p.moment.sit.who !== 'you' || typeof p.zoneIndex !== 'number' || p.continues) return false;
    if (!st.zoneBuilt || p.index > momentsOf(st) / 2) return false;
    if (ST1_BREAK === 'show') return false;
    return true;
  }
  function showMark(st, p) {
    var CA = CAx();
    p.showing = !!(CA && hasShowPiece(st) && p.moment && p.moment.sit && p.moment.sit.who === 'you' && CA.showNow(st));
    if (p.showing) showGuard(p);
  }
  /* st3: THE ATTACK FOR SHOW CANNOT END IN A GOAL. Every result of a card that would be a goal becomes
   * "for show: no goal, the attack ends here" (the card's words and icon follow); the card says so. The
   * finishing cards are not removed: removing them left some menus empty (the last decision of an attack
   * offers only finishes). ST1_BREAK=showgoal: st2's rule (goals stay). */
  function showGuard(p) {
    if (ST1_BREAK === 'showgoal') return;
    var n = 0;
    (p.moment.options || []).forEach(function (o) {
      var hit = false;
      (o.outcomes || []).forEach(function (x) {
        if (x.effect !== 'goal') return;
        hit = true; x.effect = 'nothing'; x.showSafe = true;
        x.text = 'For show: ' + first(o.actor) + ' does not go for goal, and the attack ends.';
        x.short = 'For show: the attack ends'; x.shortBase = x.short; delete x.edgeShort;
      });
      if (hit) { o.showSafe = true; n++; }
    });
    /* st4 (KM_SHOWPAY safe | firstsafe): a ball lost in the attack for show only ends it (no counter) */
    var CA = CAx(), pay = CA && CA.showPay ? CA.showPay() : null;
    if (pay && pay.safe) (p.moment.options || []).forEach(function (o) {
      (o.outcomes || []).forEach(function (x) {
        if (x.effect !== 'break') return;
        x.effect = 'nothing'; x.showSafe = true;
        x.text = 'For show: the ball is lost, and the attack ends.';
        x.short = 'For show: the attack ends'; x.shortBase = x.short; delete x.edgeShort;
        n++;
      });
    });
    if (n) { annotate(p); p.showSafeCards = n; }
  }
  function showBotMode(st) {
    var m = st.showBot;
    if (!m && typeof process !== 'undefined' && process.env && process.env.KM_SHOW_BOT) m = process.env.KM_SHOW_BOT;
    /* st2 (Codex review item 2): nobody presses unless told to. The page's player presses it; a bot
     * caller names its policy ('first', 'half' or 'never'); with none, 'never'. st1 defaulted to 'first'
     * in node, which made every unnamed caller play st1's old automatic rule. */
    if (!m) m = 'never';
    return m;
  }
  /* st4 (_show/SHOW.md): selective policies, each presses at the first chance that meets its test:
   *   'edge'   the attack starts at the edge of their box
   *   'mid'    the attack starts in midfield or your half
   *   'late'   after the first moment (the 27th minute or later)
   *   'level'  the score is level
   *   'second' the second chance of the match (never the first)
   *   'edgelast' the edge of their box, or failing that the last moment of the first half
   *   'edge1'  only the FIRST chance, and only if that attack starts at the edge of their box
   *   'edgenext' the first chance if it starts at the edge of their box, otherwise the next chance */
  function showBotPress(st, p) {
    var m = showBotMode(st);
    if (m === 'first') return true;
    if (m === 'half') return new C.RNG(((st.seed | 0) * 7907 + p.index * 131 + 0x5b0) >>> 0).next() < 0.5;
    st.showChances = (st.showChances || 0) + (st.showSeen === p ? 0 : 1); st.showSeen = p;
    if (m === 'edge') return p.zoneIndex === 2;
    if (m === 'mid') return p.zoneIndex <= 1;
    if (m === 'late') return p.index >= 2;
    if (m === 'level') return st.score.you === st.score.them;
    if (m === 'second') return st.showChances >= 2;
    if (m === 'edgelast') return p.zoneIndex === 2 || p.index >= momentsOf(st) / 2;
    if (m === 'edge1') return st.showChances === 1 && p.zoneIndex === 2;
    if (m === 'edgenext') return p.zoneIndex === 2 || st.showChances >= 2;
    return false;
  }
  /* the menu of the pending decision of your attack, built again from what
   * built it (startercheck S5: with nothing changed, the same menu and the
   * same match) */
  function rebuildZoneMenu(st) {
    var p = st.pending, b = st.zoneBuilt;
    if (!p || !b) return false;
    var keep = b.s.seen;
    if (b.seen) b.s.seen = JSON.parse(JSON.stringify(b.seen));
    var mo;
    try { mo = M.zoneMoment(b.sit, ST1_BREAK === 'rebuild' ? Math.min(3, b.zi + 1) : b.zi, b.who, st.squad, st.opp, st.style, b.s); }
    finally { b.s.seen = keep; }
    p.moment.options = mo.options;
    if (mo.cast && p.moment.cast) p.moment.cast = mo.cast;
    annotate(p);
    return true;
  }
  function showAttack(st, by) {
    if (!canShowNow(st)) return false;
    var CA = CAx(), p = st.pending, b = st.zoneBuilt;
    CA.setShow(st);
    st.fx.write('Show them one side (tactic)', 'this attack is for show: nothing in it can end in a goal, and it costs no stamina. Every attack after it has their defence stretched from its second decision', 'event', 'show');
    rebuildZoneMenu(st);
    p.showing = true;
    showGuard(p); p.shownBy = by || 'you';
    st.shows = (st.shows || 0) + 1;
    return true;
  }

  /* g1 (from p2): how many real choices the next decision of this attack
   * would have: live, and its good result more than 2 times in 36 */
  function nextLive(st) {
    var zc = st.chain, s = state(st);
    s.seen = st.seen; s.prevCarrier = zc.prev || null; s.carried = zc.carried || null; s.rebounded = !!zc.rebounded;
    s.mode = zc.mode || null; if (gOn('menu') || gOn('truth')) s.gCont = true; /* a4 (helper G): a decision that continues a play (options.js menu rule) */ s.play = playOf('you', zc.zone, zc.carrier, { mode: s.mode });
    var zmo = M.zoneMoment(M.ZONE_SITS[zc.zone], zc.zone, zc.carrier, st.squad, st.opp, st.style, s);
    return zmo.options.filter(function (o) {
      if (o.disabled) return false;
      var g = (o.outcomes || []).filter(function (x) { return (x.bands || [x.band]).indexOf('good') >= 0; })
        .reduce(function (a, x) { return a + x.p; }, 0);
      return g > NEXT_REAL;
    }).length;
  }
  /* what counts as a real choice for that test: p2 used "comes off more
   * than 2 times in 36"; g1 counts any live option, so an attack is cut
   * short only when the next menu would have one button (measured: the
   * stricter test cost 3 points of attacks reaching 3 decisions) */
  var NEXT_REAL = -1;

  /* Draw the next moment. A failed gamble hands them the next one, which is
   * the chain he asked for: a disaster is another decision, not a scoreline. */
  function next(st) {
    if (isOver(st)) return null;
    /* f1: at the first event of the second half, they may change their
     * setup (adapt), said in one line above that event */
    var announce = null;
    if (st.cmem && !st.cmem.adapt.done && st.n >= momentsOf(st) / 2 && !st.chain) {
      announce = counterAdapt(st);
      if (announce) st.announced = announce;
    }
    /* kmtree5 a11 (helper G11): "Gets under your skin", his design: THE FIRST DECISION OF EVERY MOMENT (yours or
     * theirs; the same test as the line below, read before anything changes it) has one rattled card. The mark is
     * the match's seed and the moment's number; options.js g11Rattle picks the card from them once the final menu is
     * known, and never draws from the match's dice. G11_BREAK=skinlater marks every decision; skinrng draws a number. */
    if (G11_SKIN && st.fx && st.oparch && st.oparch.ids.indexOf(G11_SKIN_ID) >= 0 && ((st.chainMode ? !st.chain : !st.follow) || G11_BRK === 'skinlater')) st.g11Skin = { seed: st.seed, moment: st.n };
    var g11Mark = st.g11Skin;
    /* w0: a new moment starts (before its first menu is built) */
    if (st.fx && (st.chainMode ? !st.chain : !st.follow)) st.fx.momentStart();
    /* x1 (b): the play between moments, before a fresh moment is drawn */
    if (st.x1 && st.x1.between && st.fx && st.chainMode && !st.chain && !st.handoff && !st.forcedTheirs && st.n > 0) betweenPlay(st);
    var p = nextMoment(st);
    /* a11 (helper G11): only the menu just built is marked (the menus choose() builds ahead are not). The mark is taken
     * off the match again, so a match against any other opponent carries nothing of this rule (t_cmp's wider fingerprint
     * reads the whole match through a card's effects record) */
    if (g11Mark) delete st.g11Skin;
    if (g11Mark && G11_BRK === 'skinrng') st.rng.next();   /* (a break for g11_onecard.js C2: the rule draws from the match's dice) */
    if (st.x1Next) {
      if (p) p.between = { play: st.between, lines: st.x1Next.lines.slice() };
      st.x1Next = null;
    }
    if (p && announce) p.announce = announce;
    if (p && st.clk) clkStamp(st, p);   /* a11 Monday (stream CLK) */
    if (p) dropMark(p);   /* a11 Monday (stream CLK): the drop back's stamina */
    if (p) annotate(p);
    /* st1: Show them one side. The page offers the button (canShowNow); a
     * match nobody watches (node) presses it by the bot policy (showBot) */
    if (p) showMark(st, p);
    if (p) p.theirMove = p.moment && p.moment.sit && p.moment.sit.who === 'them' ? st.theirMoveNow || null : null;   /* st1 */
    if (p && canShowNow(st) && showBotPress(st, p)) showAttack(st, 'bot');
    /* w0 fired possession_start here, after the first menu was built.
     * w0b: nextMoment fires it before (fxSide); this is only the old order,
     * kept for fxcheck --break possfirst */
    if (p && st.fx && !FX.GUARD.possFirst) {
      var side = p.moment.sit.who;
      if (st.fx.side !== side) { st.fx.possessionEnd(); st.fx.possessionStart(side); }
    }
    /* a11 (helper G11): the effect fired (X.runReport's count) and says so in the feed, once the menu stands */
    if (p && g11Mark && p.moment && (p.moment.options || []).some(function (o) { return o.rattled && !o.disabled; })) {
      p.rattledAt = { moment: g11Mark.moment };
      var g11Inst = st.fx.inst.filter(function (x) { return x.side === 'them' && x.def && x.def.id === G11_SKIN_ID; })[0];
      if (g11Inst) { st.fx.countFire(g11Inst); st.fx.write(g11Inst.name, 'one card on this menu is rattled: if you choose it, you lose the duel', 'event', 'counter'); }
    }
    return p;
  }
  /* w0b: a new attack by one side starts BEFORE its first menu is built, so
   * what possession_start changes (a state, an edge, stamina, an extra
   * decision) is on that first menu */
  function fxSide(st, side) {
    if (!st.fx || !FX.GUARD.possFirst) return;
    if (st.fx.side !== side) { st.fx.possessionEnd(); st.fx.possessionStart(side); }
  }
  /* call3: every result on the menu gets its icon and short form here,
   * where the ball is known (options.js iconOf: one function, from the
   * result's data and this decision's zone, never per card). Reads the
   * state, changes nothing. */
  function annotate(p) {
    var who = p.moment.sit.who, zoned = typeof p.zoneIndex === 'number';
    var info = { who: who, pos: zoned ? p.zoneIndex : (who === 'them' ? 0 : 2), zoned: zoned,
      tzone: typeof p.tzone === 'number' ? p.tzone : null, flipOk: !!p.flipOk };
    if (O().annotate) O().annotate(p.moment.options, info);
    if (who === 'you' && r12On('lastkeep')) r12EndsRows(p, zoned);   /* a12 ENG7 */
    if (r12On('kball') && p.moment.sit && p.moment.sit.id === 'keeper_to_feet') r12KeeperRows(p);   /* a12 ENG8 */
    p.iconInfo = info;
  }
  /* a12 ENG8 (kball; review/monday-rev3 finding 4, "Your keeper on the ball: the header changed, the cards and results did
   * not"): YOUR KEEPER HAS THE BALL (model.js keeper_to_feet, their press). Every card on this menu is something your
   * keeper does with a ball that is already yours, so nothing on it is "winning" the ball or "stopping" them: each card
   * and each result carries ownBall (the page's labels read it), a result that starts your attack names the man who has
   * it ("Cubarsí has it: your ball in your half"), a kick clear says what it is ("Kicked long: the danger is over" in
   * place of "You stop them"), and the scene stops saying "nobody safe to pass to" above a pass that cannot fail. Words
   * and flags only: nothing is rolled or moved. */
  var R12_KB_WON = { KEEPER_LONG: 'Kicked long: the danger is over', KEEPER_OUT: 'Kicked out: their throw-in, away from goal' };
  function r12KeeperRows(p) {
    var opts = p.moment.options || [];
    opts.forEach(function (o) {
      o.ownBall = true;
      (o.outcomes || []).forEach(function (x) {
        x.ownBall = true;
        if (x.effect === 'concede') return;
        var to = x.to || o.to || o.receiver || null;
        if (x.g3Counter || (x.icon === 'fwd' && typeof x.ballTo === 'number')) {
          var keeper = p.moment.cast && p.moment.cast.actor;
          var base = (to && to.name && (!keeper || to !== keeper) ? first(to) + ' has it' : 'You keep it') + ': your ball ' + ZONE_AT[typeof x.ballTo === 'number' ? x.ballTo : 0];
          x.short = base + String(x.short || '').slice(String(x.shortBase || '').length);
          x.shortBase = base;
        } else if (x.icon === 'won') {
          var w = R12_KB_WON[o.id] || 'Your keeper gets rid of it: the danger is over';
          x.short = w + String(x.short || '').slice(String(x.shortBase || '').length);
          x.shortBase = w;
        }
      });
    });
    var sure = opts.some(function (o) { return !o.disabled && o.chances && o.chances.good >= 0.995; });
    if (sure && /, and nobody safe to pass to|and nobody safe to pass to/.test(String(p.moment.text || ''))) {
      p.moment.text = String(p.moment.text).replace(/ and nobody safe to pass to/, ', and their forwards are pressing him');
      p.r12KbScene = true;
    }
  }
  /* a12 ENG7 (lastkeep; Eduardo's J5, "I pick it thinking it's a certain good outcome, but it's a certain bad outcome";
   * review/monday-rev2 item 3: "Keep it Certain" with a green bar on the last decision, then "Spain keep the ball, but the
   * attack is over"): on your attack every result other than a goal or a lost ball says whether choosing it ends the
   * attack (x.endsAttack), by the rule choose() uses: the attack goes on only when the ball moves or stays in play by
   * zones (x.move), and not on the last decision (p.lastStep: the cap), unless the card does not use up a decision
   * (o.fxFree) or its result grants one more (x.fxExtra). A result that ends the attack with your team keeping the ball
   * was drawn as "keep" or an arrow; it is now the pause icon ('dead': the page's "Attack ends"), x.keepsBall, its words
   * say "attack over", and it promises no edge (there is no next duel). Reads the menu only; nothing is rolled. */
  function r12EndsRows(p, zoned) {
    (p.moment.options || []).forEach(function (o) {
      (o.outcomes || []).forEach(function (x) {
        if (x.effect === 'goal' || x.effect === 'break' || x.effect === 'concede') return;
        var on = zoned && typeof x.move === 'number' && !(x.g3Conv && g3Brk() === 'nocounter') && (!p.lastStep || !!o.fxFree || !!x.fxExtra);
        x.endsAttack = !on;
        if (on) return;
        /* no next duel: an edge "to you next" on a result that ends the attack is never used (the chain ends with it) */
        if (/ to you next/.test(String(x.short || ''))) { x.short = x.shortBase; delete x.edgeNote; }
        if (['stay', 'fwd', 'backKeep'].indexOf(x.icon) < 0) return;
        var to = [x.to, o.receiver].filter(function (q) { return q && q.name; })[0] || null;
        x.icon = 'dead'; x.iconRule = 'the attack ends, your team keeps the ball (r12 lastkeep)'; x.ballTo = null; x.keepsBall = true;
        x.shortBase = x.end === 'clock' ? 'The clock runs down, attack over' : x.effect === 'ground' ? 'Saved, attack over' : to ? first(to) + ' has it, attack over' : 'You keep the ball, attack over';
        x.short = x.shortBase;
        delete x.edgeNote;
      });
    });
  }
  function nextMoment(st) {
    st.zoneBuilt = null;   /* st1: set again only where a menu of your attack's zones is built */
    st.theirMoveNow = null;   /* st1: and what their attacker does, only where their attack's menu is built */
    /* WINNING THE BALL IS THE NEXT MOMENT (a4): when you win the ball in
     * their attack, your attack from there is the next of the six moments,
     * a minute later, rather than more decisions inside theirs. It keeps a
     * match to about a dozen decisions. */
    var handoff = false;
    if (st.chainMode && st.handoff && !st.chain) { st.chain = st.handoff; st.handoff = null; handoff = true; }
    /* w0b: whose attack this decision is, known before anything is built
     * when the event goes on (a fresh moment knows it once it is drawn) */
    if (st.fx && st.chainMode && st.chain) fxSide(st, st.chain.next === 'zone' ? 'you' : 'them');
    var s = state(st);
    s.seen = st.seen;
    if (g3On('minleft') && st.clk) s.clockMinute = clkPeek(st, handoff);   /* a12 GAME3a */
    var zc = st.chainMode ? st.chain : null;
    if (zc && zc.next === 'box') {
      /* their man is in your box: the last decision of their attack (a3) */
      s.flipOk = !!zc.flipOk; s.carried = zc.carried || null; s.bounced = !!zc.bounced;
      s.theirCarried = (zc.theirCarried || []).concat(zc.counterEdge ? [zc.counterEdge] : []);
      s.crosser = zc.via === 'cross' ? zc.foil : null;
      s.play = playOf('them', -1, zc.foil, { air: !!AIR_VIA[zc.via], via: zc.via });
      st.theirMoveNow = theirMoveOf('box', null, zc.via, zc.foil);   /* st1: what their attacker does (Guessing) */
      var bmo = M.boxMoment(zc.foil, zc.via, zc.blocker, st.squad, st.opp, st.style, s);
      /* kmtree5 (Diver): the penalty says what it is */
      if (zc.via === 'penalty') bmo.text = first(bmo.cast.foil) + ' is going to take the penalty. ' + (st.squad.keeper ? first(st.squad.keeper) : 'Your keeper') + ' is in goal.';
      s.play.via = bmo.via; s.play.air = !!AIR_VIA[bmo.via]; s.play.target = bmo.cast.foil;
      st.pending = {
        moment: bmo, share: null, minute: minute(st), index: st.n + 1,
        legs: s.legs, broke: null, continues: true, lead: zc.text, step: zc.step + 1,
        zone: M.THEIR_BOX, zoneIndex: -1, attacking: 'them', flipOk: !!zc.flipOk, bounced: !!zc.bounced, counterEdge: zc.counterEdge || null,
        carried: (zc.carried || []).map(function (c) { return { id: c.id, text: O().carryText(c) }; }),
        theirCarried: s.theirCarried, theirCarry: s.theirCarried[0] || null,
        play: s.play, threat: bmo.threat || null, via: bmo.via
      };
      if (A5_DEF && zc.a5Hold) st.pending.a5Hold = true;   /* kmtree5 a5 P1 (helper D): the hold stays used in this attack */
      return st.pending;
    }
    if (zc && (zc.next === 'tzone' || zc.next === 'counter')) {
      /* THEIR ATTACK GOES ON (a4), or starts as a counter after you lost
       * the ball: the zone it is in decides how you can defend */
      var counter = zc.next === 'counter'; st.brokeFrom = null;
      var tz = counter ? zc.counterTz : zc.tz;
      s.carried = counter ? null : (zc.carried || null);
      /* a4: on their counter, the edge from how you lost the ball stays with
       * them for the whole counter, against your outfield players */
      var cEdge = counter ? zc.theirCarry || null : zc.counterEdge || null;
      s.theirCarried = (counter ? [] : (zc.theirCarried || [])).concat(cEdge ? [cEdge] : []);
      if (!s.theirCarried.length) s.theirCarried = null;
      s.flipOk = !counter && !!zc.flipOk; s.firstStep = false;
      s.tCapped = (counter ? 0 : (zc.tSteps || 0)) + 1 >= T_CAP;
      if (A5_DEF) s.a5HoldUsed = !counter && !!zc.a5Hold;   /* kmtree5 a5 P1 (helper D): once in an attack */
      var base = counter ? M.COUNTER_SIT : zc.sit;
      var tsit = { id: base.id, name: base.name, who: 'them', line: '' };
      /* your Ball winner wins it straight back only right after you lost it */
      s.counter = counter;
      s.counterTaker = counter ? zc.counterTaker || null : null;
      s.tVia = counter ? null : zc.via || null;
      s.play = playOf('them', tz === 0 ? 1 : 0, counter ? zc.counterFoil : zc.foil);
      st.theirMoveNow = theirMoveOf(counter ? 'counter' : 'zone', tsit.id, null, counter ? zc.counterFoil : zc.foil, tz);   /* st1 */
      var tmo = M.theirZoneMoment(tsit, tz, counter ? zc.counterFoil : zc.foil, st.squad, st.opp, st.style, s);
      s.play.ball = tmo.cast.foil; s.play.near = tmo.cast.actor;
      /* kmtree5 a11 (helper G11; "drops back must matter"): the decision after a won "midfield drops back" says so in
       * its scene, one short sentence, and carries the midfielders' ids for the picture (pending.dropBack) */
      var g11mb = G11_DROP && !counter ? (s.carried || []).filter(function (c) { return c.id === 'midback'; })[0] : null;
      if (g11mb && G11_BRK !== 'droptext') tmo.text = String(tmo.text || '').replace(/\s+$/, '') + ' Your midfield is back in front of ' + first(tmo.cast.foil) + '.';
      st.pending = {
        moment: tmo, share: null, minute: minute(st), index: st.n + 1,
        legs: s.legs, broke: counter ? zc.brokeFrom || null : null, continues: true, lead: zc.text, step: zc.step + 1,
        zone: M.T_ZONES[tz], zoneIndex: tz === 0 ? 1 : 0, tzone: tz, attacking: 'them',
        flipOk: s.flipOk, tSteps: counter ? 0 : (zc.tSteps || 0), via: counter ? null : zc.via || null, bounced: !counter && !!zc.bounced,
        counterEdge: cEdge, isCounter: s.counter,
        carried: (s.carried || []).map(function (c) { return { id: c.id, text: O().carryText(c) }; }),
        theirCarried: s.theirCarried || [], theirCarry: (s.theirCarried || [])[0] || null,
        play: s.play, threat: tmo.threat || null
      };
      if (A5_DEF && s.a5HoldUsed) st.pending.a5Hold = true;   /* kmtree5 a5 P1 (helper D) */
      if (g11mb) st.pending.dropBack = (g11mb.men || []).slice();   /* a11 (helper G11): only after a won drop */
      return st.pending;
    }
    if (zc && zc.next === 'zone') {
      /* the attack goes on, in the zone the last decision put the ball in */
      s.prevCarrier = zc.prev || null;
      s.rebounded = !!zc.rebounded;
      s.carried = zc.carried || null;
      s.mode = zc.mode || null; if (gOn('menu') || gOn('truth')) s.gCont = true; /* a4 (helper G): a decision that continues a play (options.js menu rule) */
      s.play = playOf('you', zc.zone, zc.carrier, { mode: s.mode });
      var zmo = M.zoneMoment(M.ZONE_SITS[zc.zone], zc.zone, zc.carrier, st.squad, st.opp, st.style, s);
      /* st1: what built this menu, so Show them one side can rebuild it */
      st.zoneBuilt = { sit: M.ZONE_SITS[zc.zone], zi: zc.zone, who: zc.carrier, s: s };
      s.play.ball = zmo.cast.actor;
      st.pending = {
        moment: zmo, share: null, minute: minute(st), index: st.n + 1,
        legs: s.legs, broke: null, continues: true, lead: zc.text, step: zc.step + 1,
        zone: M.ZONES[zc.zone], zoneIndex: zc.zone, carrier: zmo.cast.actor, mode: s.mode, play: s.play,
        /* what the last decision won, in words, for the screen (a2) */
        carried: (zc.carried || []).map(function (c) { return { id: c.id, text: O().carryText(c) }; })
      };
      if (zc.after) st.pending.after = zc.after;   /* kmtree5 a3 (helper C): only when set, so a2's pending keeps its fields */
      if (handoff) {
        st.pending.continues = false; st.pending.handoff = true;
        /* call: the attack you start by winning the ball opens with where
         * the ball is; the second time the same man has it there, it says
         * "again" (round 4 review: the same opening scene twice) */
        if (GUARD.freshScene) {
          var f0 = String(zmo.text || '').split('. ')[0];
          st.handoffSeen = st.handoffSeen || {};
          if (st.handoffSeen[f0]) zmo.text = f0 + ' again' + String(zmo.text).slice(f0.length);
          st.handoffSeen[f0] = 1;
        }
      }
      /* g1: the page says when this is the last decision of your attack
       * (the review: a kept ball then "the attack is over" with no warning) */
      st.pending.lastStep = !!s.finishOnly;
      return st.pending;
    }
    var w = M.weights(st.squad, st.opp, st.style, s);
    /* damp what has already happened (see REPEAT_DAMP); a follow-up is
     * exempt because it is chosen from a fixed pair on purpose */
    if (!st.follow && !(st.chainMode && st.chain)) {
      w.rows.forEach(function (r) {
        var n = st.seen[r.sit.id] ? st.seen[r.sit.id].count : 0;
        if (n) r.raw *= Math.pow(REPEAT_DAMP, n);
      });
    }
    var row;
    /* Pick weighted, among either every situation or only one side's. Taking
     * side[0] when a moment was forced meant a broken attack always produced
     * the SAME counter-attack, so a match that chained twice showed the same
     * scene twice with the same three options. */
    var pool = w.rows, follow = st.follow, ch = st.chainMode ? st.chain : null;
    if (ch) {
      /* the event goes on: their counter, or your move carried on */
      var want2 = ch.next === 'counter' ? COUNTERS : ch.next === 'keep' ? CHAIN_KEEP : CHAIN_GROUND;
      var on2 = w.rows.filter(function (r) { return want2[r.sit.id] && r.sit.id !== ch.lastSit; });
      if (!on2.length) on2 = w.rows.filter(function (r) { return want2[r.sit.id]; });
      if (on2.length) pool = on2;
    } else if (follow) {
      var on = w.rows.filter(function (r) { return FOLLOW_ON[r.sit.id]; });
      if (on.length) pool = on;
    } else if (st.forcedTheirs || st.forcedYours) {
      var want = st.forcedTheirs ? 'them' : 'you';
      var side = w.rows.filter(function (r) {
        return r.sit.who === want && (!st.forcedTheirs || COUNTERS[r.sit.id]);
      });
      if (!side.length) side = w.rows.filter(function (r) { return r.sit.who === want; });
      if (side.length) pool = side;
      st.forcedTheirs = false; st.forcedYours = false;
    }
    /* call: THE SAME OPENING SCENE NEVER TWICE IN ONE MATCH (round 4
     * review: 86 of 200 matches showed one twice; the damping made a repeat
     * rarer, not impossible). A new moment is picked from the situations not
     * yet seen this match, while there are any on that side. */
    if (GUARD.freshScene && !ch && !follow) {
      var fresh = pool.filter(function (r) { return !(st.seen[r.sit.id] && st.seen[r.sit.id].count); });
      if (fresh.length) pool = fresh;
    }
    var total = pool.reduce(function (a, r) { return a + r.raw; }, 0);
    var roll = st.rng.next() * total, acc = 0;
    row = pool[pool.length - 1];
    for (var i = 0; i < pool.length; i++) {
      acc += pool[i].raw;
      if (roll <= acc) { row = pool[i]; break; }
    }
    var mo, zi = null, tzi = null, startVia = null;
    /* w0b: the moment is drawn and nothing is built yet */
    if (st.fx) fxSide(st, row.sit.who);
    s.theirCarry = ch && ch.next === 'counter' && ch.theirCarry ? ch.theirCarry : null;
    if (st.chainMode && row.sit.who === 'you' && M.START_ZONE[row.sit.id] !== undefined) {
      /* your attack starts where the situation puts the ball, with the man
       * the situation is about on it */
      zi = M.START_ZONE[row.sit.id];
      /* x1 (b): the play between moments may start your attack higher, and
       * give its first decision an edge (effects.js between helpers) */
      var x1n = st.x1Next && st.x1Next.yours ? st.x1Next : null;
      if (x1n && x1n.up) zi = Math.min(2, zi + x1n.up);
      if (x1n && x1n.open.length) s.carried = x1n.open.slice();
      var who = M.castFor(row.sit, st.squad, st.opp, s).actor;
      /* kmtree5 a4 (helper G; Eduardo 2026-09-30, note 12, "real free-kick menu"): the touchline free kick's first
       * decision is a set piece (options.js mode 'fkwide': short, a cross into the box, a shot where the distance
       * allows), with no dribbles and no runs to the goal line. a3: an open-play menu (KM_G_OFF=fkwide). */
      if (gOn('fkwide') && row.sit.id === 'dead_ball_wide') { s.mode = 'fkwide'; gFire('fkwide'); }
      s.play = playOf('you', zi, who);
      /* the man the situation is about has it (the midfielder who won it
       * back in a press trap, the full-back on the overlap). If he is not
       * the best man for the zone, giving it to someone better is one of
       * the choices (options.js Z_LAYOFF). */
      /* st1: what the menu was built from, for Show them one side's rebuild; st.seen
       * changes once the moment is drawn (below), so the rebuild gets it as it was */
      var seen0 = JSON.parse(JSON.stringify(st.seen));
      mo = M.zoneMoment(row.sit, zi, who, st.squad, st.opp, st.style, s);
      st.zoneBuilt = { sit: row.sit, zi: zi, who: who, s: s, seen: seen0 };
    } else if (st.chainMode && row.sit.who === 'them' && row.sit.id !== 'keeper_to_feet' && !ch) {
      /* their attack starts in a zone (a4): midfield, or already at the
       * edge of your box for a ball over the top, their winger one against
       * one or a siege. The man the situation is about has the ball. */
      tzi = M.T_START[row.sit.id] !== undefined ? M.T_START[row.sit.id] : 1;
      s.flipOk = true; s.firstStep = true; s.tCapped = 1 >= T_CAP; s.carried = null; s.theirCarried = null;
      /* at the edge of your box the man the situation is about has it (their
       * winger, the forward running onto the ball over the top); e1: their
       * keyword moment is about the man with the keyword */
      var tf = row.sit.threat && row.sit.id !== 'their_cross' ? M.threatFoil(row.sit.id, st.opp, st.seen[row.sit.id])
        : row.sit.id === 'their_winger' ? M.theirWinger(st.opp, st.seen[row.sit.id])
        : tzi >= 1 ? M.castFor(row.sit, st.squad, st.opp, s).foil : M.theirCarrier(tzi, st.opp, st.seen);
      if (START_EDGES && M.T_START_EDGE[row.sit.id]) s.theirCarried = [M.T_START_EDGE[row.sit.id](tf)];
      if (tzi === 2) {
        /* a siege is already in your box: the ball is crossed in again. e1:
         * their cross (their keyword moment) is high to their Target man or
         * low from their Crosser */
        var plan = row.sit.id === 'their_cross' || row.sit.id === 'siege' ? M.crossPlan(st.opp) : null;
        if (plan) { s.crossTarget = plan.target; s.crosser = plan.crosser; tf = plan.crosser; startVia = plan.high ? 'cross' : 'lowcross'; }
        else { s.crossTarget = tf; s.crosser = null; startVia = 'cross'; }
        s.play = playOf('them', -1, tf, { air: startVia === 'cross', via: startVia, target: s.crossTarget });
        st.theirMoveNow = theirMoveOf('box', row.sit.id, startVia, tf);   /* st1 */
        mo = M.boxMoment(tf, startVia, null, st.squad, st.opp, st.style, s);
        mo.sit = row.sit; mo.text = (row.sit.id === 'their_cross' ? '' : row.sit.line + ' ') + mo.text;
      } else {
        /* a ball over your defence is in the air when it arrives: nobody
         * has it, and tf is running onto it */
        var inAir = row.sit.id === 'over_the_top';
        s.play = playOf('them', tzi === 0 ? 1 : 0, inAir ? null : tf, { air: inAir, target: inAir ? tf : null });
        s.tVia = row.sit.id === 'their_winger' ? 'cross' : null;
        st.theirMoveNow = theirMoveOf('zone', row.sit.id, null, tf, tzi);   /* st1 */
        mo = M.theirZoneMoment(row.sit, tzi, tf, st.squad, st.opp, st.style, s);
      }
      mo.cast.foil = mo.cast.foil || tf;
    } else {
      s.play = playOf(row.sit.who, row.sit.id === 'keeper_to_feet' ? -1 : 0, row.sit.id === 'keeper_to_feet' ? st.squad.keeper : null);
      mo = M.moment(row.sit, st.squad, st.opp, st.style, s);
    }
    /* m1: the opener follows the ball (keptOpener above) */
    if (GUARD.keptOpener && st.keptBall && !ch && !follow) mo.text = keptOpener(row.sit, mo.text, st.keptBall, mo.cast && mo.cast.actor);
    st.keptBall = null;
    var seen = st.seen[row.sit.id] || (st.seen[row.sit.id] = { count: 0, actors: {}, foils: {} });
    if (!follow && !ch) seen.count++;
    if (mo.cast.actor) seen.actors[mo.cast.actor.id] = 1;
    if (mo.cast.foil) seen.foils[mo.cast.foil.id] = 1;
    st.pending = {
      moment: mo, share: row.pct, minute: minute(st), index: st.n + 1,
      legs: s.legs, broke: st.brokeFrom || null,
      continues: !!follow || !!ch,
      lead: follow ? follow.text : (ch && ch.next !== 'counter' ? ch.text : null),
      step: ch ? ch.step + 1 : 1,
      play: s.play || null, threat: mo.threat || null
    };
    if (s.play && tzi === null && zi !== null) s.play.ball = mo.cast.actor;
    if (st.chainMode) {
      /* where the ball is. Their attacks are always in your half. */
      st.pending.zoneIndex = zi === null ? 0 : zi;
      st.pending.zone = M.ZONES[st.pending.zoneIndex];
      if (tzi === 2) {
        st.pending.zoneIndex = -1; st.pending.zone = M.THEIR_BOX; st.pending.flipOk = true; st.pending.via = mo.via || startVia;
        if (s.play) { s.play.via = mo.via || startVia; s.play.air = !!AIR_VIA[s.play.via]; s.play.target = mo.cast.foil; }
      } else if (tzi !== null) {
        st.pending.tzone = tzi; st.pending.zoneIndex = tzi === 0 ? 1 : 0; st.pending.zone = M.T_ZONES[tzi];
        st.pending.flipOk = true; st.pending.tSteps = 0;
        if (s.theirCarried) { st.pending.theirCarried = s.theirCarried; st.pending.theirCarry = s.theirCarried[0]; }
        st.pending.via = row.sit.id === 'their_winger' ? 'cross' : null;
      }
      st.pending.attacking = row.sit.who;
      if (s.theirCarry) { st.pending.theirCarry = s.theirCarry; st.pending.theirCarried = [s.theirCarry]; }
      st.pending.carried = [];
      if (zi !== null && s.carried && s.carried.length) {
        st.pending.carried = s.carried.map(function (c) { return { id: c.id, text: O().carryText(c) }; });
        st.pending.x1Open = s.carried.slice();
      }
      if (zi !== null) st.pending.carrier = mo.cast.actor;
    }
    st.brokeFrom = null;
    st.follow = null;
    return st.pending;
  }

  /* Resolve a choice. Returns what happened, in the same plain words the
   * option promised, so nothing arrives that was not on the card. */
  function choose(st, index) {
    var lastOneEnd = false;   /* a12 BAL2: set by the "last one" rule below */
    var p = st.pending;
    if (!p) return null;
    /* e1: the keyword options this menu showed (options.js: not two running) */
    st.kwPrev = {};
    p.moment.options.forEach(function (o) { if (o.unlock && !o.disabled) st.kwPrev[o.unlock] = 1; });
    var live = p.moment.options.filter(function (o) { return !o.disabled; });
    var o = live[index];
    if (!o) return null;
    /* w0: the effects runtime, if a build is loaded */
    var fx = st.fx || null, tierFrom = null;
    if (fx) { fx.inChoose = true; fx.chooseAt = fx.stamp(); }

    /* Roll the dice the card promised. The screen says "Pace 13 + roll(1 to 6)
     * against Pace 11 + roll(1 to 6)", so that is literally what happens here,
     * and the feed prints both numbers. Before this it drew one number against
     * the odds, which gave the same distribution but nothing to show him. */
    var ch = o.chances, band, dice = null;
    /* kmtree5 a11 (helper G11): A RATTLED CARD LOSES THE DUEL, settled here before anything is rolled: no dice, and
     * no number drawn from the match's generator (the dice that follow are the ones that would have come next).
     * Its result is the card's own losing row (options.js g11Rattle left that row alone on the card).
     * G11_BREAK=skinroll: not settled here (the card's own path draws one number; g11_onecard.js C2 must fail);
     * G11_BREAK=skinface: the card is only marked, and is rolled like any card (archcheck O08b must fail). */
    var g11Rat = !!(G11_SKIN && o.rattled && G11_BRK !== 'skinroll' && G11_BRK !== 'skinface');
    if (g11Rat) band = 'bad';
    /* a12 ENG7 (subnoroll): a substitution is not a duel: it happens, and nothing is drawn from the match's dice */
    else if (o.noRoll && r12On('subnoroll')) band = 'good';
    /* kmtree5: A DUEL OF SEVERAL CHECKS (Slalom): each check is its own roll against its own man, in
     * order, and it stops at the first one lost. All clean: a clean win; one lost: a loss; otherwise a
     * half win. The card's chances were counted from the same rule (effects.js multiOdds). Every check is
     * a duel event of its own (fxAfter). */
    else if (fx && o.multi && o.multi.length > 1 && o.mineVal !== null && o.themVal !== null) {
      var mrule = o.duel || null, checks = [], agg = 'good';
      for (var ci = 0; ci < o.multi.length; ci++) {
        var mc = o.multi[ci], a1 = R.roll(st.rng), a2 = R.roll(st.rng), mrolls = null;
        if (mrule && mrule.dice > 1) {
          mrolls = [a1];
          for (var mk = 1; mk < mrule.dice; mk++) { var ax = R.roll(st.rng); mrolls.push(ax); if (ax > a1) a1 = ax; }
        }
        var mt = o.mineVal + a1, tt = mc.themVal + a2, mdf = mt - tt;
        var mb = mrule ? FX.band(mdf, mrule, R) : (mdf >= R.GOOD_BY ? 'good' : (mdf >= 0 ? 'mixed' : 'bad'));
        if (mrule && mrule.tier && mrule.tier[mb]) mb = mrule.tier[mb];
        checks.push({ foil: mc.foil, mine: a1, theirs: a2, mineTotal: mt, themTotal: tt, diff: mdf, band: mb, rolls: mrolls,
          line: first(o.actor) + ' ' + statName(o.mineAttr) + ' ' + o.mineVal + ' + ' + a1 + ' = ' + mt + '   against   ' + first(mc.foil) + ' ' +
            statName(o.themAttr) + ' ' + mc.themVal + ' + ' + a2 + ' = ' + tt + ' (' + FX.BAND_WORD[mb] + ')' });
        if (mb === 'bad') { agg = 'bad'; break; }
        if (mb === 'mixed') agg = 'mixed';
      }
      band = agg;
      var lastC = checks[checks.length - 1];
      dice = { mine: lastC.mine, theirs: lastC.theirs, mineTotal: lastC.mineTotal, themTotal: lastC.themTotal, diff: lastC.diff,
        checks: checks, multi: o.multi.length,
        margin: 'check ' + checks.length + ' of ' + o.multi.length + (agg === 'bad' ? ': lost, so the ball is lost' : agg === 'good' ? ': all clean wins' : ': all won, not all cleanly'),
        line: checks.map(function (c, i) { return 'Check ' + (i + 1) + ': ' + c.line; }).join('. ') };
    } else if (o.mineVal !== null && o.themVal !== null) {
      /* kmtree5: on the match's die (resolve.js DICE: 6 unless the d20 switch is on; the same draws) */
      var d1 = KM5_BREAK === 'd20roll' ? 1 + Math.floor(st.rng.next() * 6) : R.roll(st.rng);
      var d2 = KM5_BREAK === 'd20roll' ? 1 + Math.floor(st.rng.next() * 6) : R.roll(st.rng);
      /* w0: hook 'duel': a build may roll you several dice and keep the
       * highest (drawn after the two plain dice, so without a rule the draws
       * are s0's), move the clean-win margin, or turn one result into another.
       * The card's odds were counted from this same rule (effects.js odds). */
      var rule = fx && o.duel ? o.duel : null, rolls = null, gb = (rule && rule.goodBy) || R.GOOD_BY;
      if (rule && rule.dice > 1) {
        rolls = [d1];
        for (var dk = 1; dk < rule.dice; dk++) { var dx = R.roll(st.rng); rolls.push(dx); if (dx > d1) d1 = dx; }
      }
      var mineTotal = o.mineVal + d1, themTotal = o.themVal + d2;
      var diff = mineTotal - themTotal;
      band = rule ? FX.band(diff, rule, R) : (diff >= R.GOOD_BY ? 'good' : (diff >= 0 ? 'mixed' : 'bad'));
      /* a12 ENG8 (bestroll): your best roll (the top face against a 1) always comes off; the card's odds counted it
       * (options.js r12BestOdds), before a build's tier, as there */
      var r12BestNow = !!(o.r12Best && r12On('bestroll') && d1 === (R.DICE || 6) && d2 === 1 && band !== 'good');
      if (r12BestNow) band = 'good';
      if (rule && rule.tier && rule.tier[band]) { tierFrom = band; band = rule.tier[band]; }
      dice = {
        mine: d1, theirs: d2, mineTotal: mineTotal, themTotal: themTotal, diff: diff,
        /* call: a win by 1 to 3 is not a clean result, and the banner says
         * so under the totals (round 4 review: "you win the roll and it goes
         * wrong", with nothing on screen saying a clean result needs 4) */
        margin: tierFrom ? 'a ' + FX.BAND_WORD[tierFrom] + ', which your build counts as a ' + FX.BAND_WORD[band]
          : GUARD.diceNote && diff >= 1 && diff < gb ? 'edged it by ' + diff + ': half a win (' + gb + ' or more is a clean win)' : null,
        rolls: rolls,
        /* o.mineVal already carries the bonus, so the feed has to say where it
         * came from or the number will not match the player's card. */
        /* every part of the number, named: base, then each bonus with where
         * it came from (a2: carried advantage adds parts) */
        line: first(o.actor) + ' ' + statName(o.mineAttr) + ' ' + o.mineVal + parts(o.mineVal, o.mods, o.bonus, o.because) +
          ' + ' + d1 + ' = ' + mineTotal + '   against   ' + first(o.foil) + ' ' +
          statName(o.themAttr) + ' ' + o.themVal + parts(o.themVal, o.theirMods) + ' + ' + d2 + ' = ' + themTotal
      };
      /* a12 ENG7 (dicemargin; review/monday-rev2 item 4, "the win-by-4 rule is never on screen"): the margin a clean win
       * needed on this roll (a build's duel rule may move it), the band the margin alone gave (before a build's tier),
       * and whether the card was certain whatever the dice (one result), for the page's words */
      if (r12On('dicemargin')) {
        dice.goodBy = gb; dice.rawBand = diff >= gb ? 'good' : diff >= 0 ? 'mixed' : 'bad'; dice.certain = !!ch.certain;
        if (tierFrom) dice.tierFrom = tierFrom;
      }
      if (r12BestNow) { dice.r12Best = true; dice.margin = 'a ' + (R.DICE || 6) + ' against a 1: your best roll always comes off'; }   /* a12 ENG8 */
    } else {
      var r = st.rng.next();
      band = r < ch.good ? 'good' : (r < ch.good + ch.mixed ? 'mixed' : 'bad');
    }

    /* The words and the scoreline come from the same row of the same table. */
    var picked = null;
    /* st3 (Codex review of st3, item 1): a card of an attack for show (its goal results turned harmless,
     * showGuard) is not a shot: no shot in the log, the stats or the report, no shot event, no "missed a
     * chance" carried to his next shot. ST1_BREAK=showshot: st3's first version (it counted). */
    var showNoShot = !!o.showSafe && ST1_BREAK !== 'showshot';
    /* g1 (from p2): a line can stand for two dice results when they end the
     * same way (options.js GUARD.merge, `bands`) */
    (o.outcomes || []).forEach(function (x) { if ((x.bands || [x.band]).indexOf(band) >= 0) picked = x; });
    if (!picked) picked = { band: band, text: o.label + '.', effect: band === 'bad' ? 'nothing' : 'nothing' };
    /* call3: when a half win and a clean win end the same way (one line on
     * the card covers both), the banner does not talk about half and clean
     * wins: "Yamal won by 2" (Eduardo: "edged it by 2: half a win" over a
     * safe pass that simply kept the ball) */
    if (dice && GUARD.halfSame && band === 'mixed' && (picked.bands || [picked.band]).indexOf('good') >= 0 && !dice.multi) {
      dice.margin = null; dice.halfSame = true;
    }
    /* kmtree5: Second chance kept a lost ball (its record fires only then) */
    if (fx && picked.fxRetain) o.fxRetainedNow = true;

    var ev = {
      minute: CLK_BRK === 'evmin' ? gameMin(p) : p.minute, index: p.index, label: o.label, band: band,
      certain: !!ch.certain, check: o.check, sit: p.moment.sit,
      dice: dice, effect: picked.effect, text: picked.text,
      cont: !!p.continues, pays: o.pays, optionId: o.id,
      headline: headline(picked.effect, p.moment.sit.who, o.pays === 'superbend' && picked.end === 'kept' ? 'keep' : o.pays),   /* kmtree5: Superb effort's clean win on the last decision kept the ball */
      /* call3: the icon and short form of the result that happened */
      icon: picked.icon || (O().iconOf && p.iconInfo ? O().iconOf(picked, o, p.iconInfo).icon : null),
      iconRule: picked.iconRule || null, short: picked.short || null, fromZone: typeof p.zoneIndex === 'number' ? p.zoneIndex : null,
      /* e1: whose keyword made this option, and which of theirs shaped it */
      unlock: o.unlock || null, threat: o.threat || null, play: playNames(p.play),
      /* p3: who was in it, for the report at full time */
      actorName: o.actor ? first(o.actor) : null, foilName: o.foil ? first(o.foil) : null, shot: !!o.shotBy && !showNoShot, showSafe: !!o.showSafe,
      uses: (o.uses || []).filter(function (u) { return u.n && !u.part; }).map(function (u) { return { name: u.name, n: u.n }; }),
      /* call2: what the page's verdict line needs: every edge that applied
       * to this roll, on both sides, and which stat each man rolled */
      mods: (o.mods || []).map(function (m) { return { n: m.n, why: m.why }; }),
      theirMods: (o.theirMods || []).map(function (m) { return { n: m.n, why: m.why }; }),
      bonus: o.bonus || 0, because: o.because || null,
      mineStat: o.mineAttr ? statName(o.mineAttr) : null, themStat: o.themAttr ? statName(o.themAttr) : null
    };
    /* a11 (helper G11): the result of a rattled card says so (the dice box: no dice, "Rattled: you lose the duel");
     * the field exists only on such a result, so every other log entry keeps a10's fields */
    if (g11Rat) { ev.rattled = true; ev.noRoll = o.rattledLine || 'Rattled: you lose the duel'; }
    if (o.noRoll && r12On('subnoroll') && !g11Rat) ev.noRoll = 'A substitution: no duel, it always happens';   /* a12 ENG7 */
    if (r12On('lastkeep') && picked.endsAttack) ev.endsAttack = true;   /* a12 ENG7 (lastkeep) */
    /* a12 ENG8 (fixedline; review/monday-rev3 finding 12, "the result never says what happened"): a card with fixed
     * chances and no duel (Step forward's long ball: 1 in 2) rolls no dice, so the dice box had only "No duel: a fixed
     * chance (50 in 100)". ev.fixedLine is the card's own rule and what came of it this time, for that box; and when the
     * attack ends there, the headline says how */
    if (r12On('fixedline') && !dice && !g11Rat && !ev.noRoll && !ch.certain && (o.fixedOdds || ch.fixed)) {
      var fxw = String(picked.shortBase || picked.short || '').replace(/, then \+\d+ to (you|them) next$/, '');
      var fxl = /^(Their|They|Into|You|Your|It|Out|Over|Back|The|Saved|Blocked|Runs|To|Free|Corner|Goal|Kicked)\b/.test(fxw) ? fxw.charAt(0).toLowerCase() + fxw.slice(1) : fxw;   /* (a name keeps its capital) */
      ev.fixedLine = String(o.check || 'No duel: a fixed chance.').replace(/\s*$/, '') + (fxw ? ' This time: ' + fxl + '.' : '');
      if (o.pays === 'launch' && picked.end === 'keeper' && fxw) ev.headline = fxw + '. The attack is over.';
    }
    /* a11 (helper G11; "drops back must matter"): THE MARKER FOR THE PICTURE. A won "midfield drops back" (a clean win
     * or a half win of M_DROP) puts the ids of your midfielders who dropped on its result, the man the card named
     * first: ev.dropBack. director.js resolve() (helper P) reads it to draw them running back. Only on such a result. */
    if (G11_DROP && o.id === 'M_DROP' && band !== 'bad') {
      var g11g = ((o.grants && o.grants[band]) || []).filter(function (c) { return c.id === 'midback'; })[0];
      if (g11g && G11_BRK !== 'dropmark') ev.dropBack = (g11g.men || []).slice();
    }

    /* kmtree5 a4 (helper G; Eduardo 2026-09-30, Slalom notes 18 and 19): the take-on that decided it is the one the
     * result names: the man he lost it to, or the last man he went past. The dice shown are that check's (they were
     * already), and the man and his number are too (they were the first man's). Every check keeps its own roll, man and
     * verdict (dice.checks, with .name), for the page to show one after the other. Words and names only: the roll and
     * the result are the same. */
    if (gOn('slalom') && dice && dice.checks && dice.checks.length) {
      var dk = dice.checks, dec = dk[dk.length - 1], won = dk.filter(function (c) { return c.band !== 'bad'; });
      dk.forEach(function (c) { c.name = first(c.foil); });
      dice.decider = dk.length - 1;
      ev.foilName = first(dec.foil);
      if (band === 'bad') {
        dice.verdict = (won.length ? 'Won ' + won.length + ' of ' + dice.multi + ': lost' : 'Lost') + ' to ' + first(dec.foil) + ' (by ' + (-dec.diff) + ')';
        var passed = won.map(function (c) { return first(c.foil); });
        ev.text = first(o.actor) + (passed.length ? ' gets past ' + passed.join(' and ') + ', then loses it to ' : ' loses it to ') + first(dec.foil) + '. ' +
          first(dec.foil) + ' takes the ball and their team attacks.';
      } else if (band === 'mixed') dice.verdict = 'Past both, not both cleanly';
      /* (the a4 review, F4: a half win keeps him where he is, and the next card offered Slalom against the same two men
       * again, three times in one attack. The pair he has taken on is remembered for this moment's attack; options are
       * built without Slalom against it: archetypes.js) */
      if (band !== 'bad') {
        var slKey = dk.map(function (c) { return c.foil.id; }).sort().join('|');
        if (!st.gSl || st.gSl.index !== p.index) st.gSl = { index: p.index, pairs: [] };
        if (st.gSl.pairs.indexOf(slKey) < 0) st.gSl.pairs.push(slKey);
      }
      else dice.verdict = 'Past both cleanly';
      dice.margin = dice.verdict;
    }

    switch (picked.effect) {
      case 'goal':
        st.score.you++; ev.kind = 'goal'; ev.text = 'GOAL. ' + picked.text; break;
      case 'concede':
        st.score.them++; ev.kind = 'conceded'; ev.text = 'THEY SCORE. ' + picked.text; break;
      case 'break':
        /* e1: only YOUR gamble loses the ball. On their attack 'break' is
         * their man getting past yours (the zone code below says where to);
         * a5 counted it as you losing the ball, which forced the next event
         * to be theirs and printed "You lost the ball going forward" over it */
        if (p.moment.sit.who !== 'you' && GUARD.theirBreak) { ev.kind = 'past'; break; }
        ev.kind = 'lost'; st.forcedTheirs = true; st.brokeFrom = o.label;
        ev.chains = 'The next moment is theirs.'; break;
      case 'ground':
        /* the play is not over: the same attack continues, same minute, and
         * it does not use up one of the six moments */
        ev.kind = 'ground';
        st.follow = { text: picked.text };
        ev.chains = 'The same attack goes on.'; break;
      case 'rest':
        ev.kind = 'rest';
        /* the line the option names (restLine), since the man coming on is
         * a bench player with no line; before this, nothing was restored */
        var rl = o.restLine || (o.actor && typeof o.actor.line === 'number' ? ['def', 'mid', 'att'][o.actor.line] : null);
        if (rl) { st.rested[rl] = gameMin(p); st.spent[rl] = 0; ev.restLine = rl; }
        if (o.actor) st.usedSubs[o.actor.id] = 1;
        st.subsLeft = Math.max(0, st.subsLeft - 1);
        break;
      case 'stopped': ev.kind = 'stopped'; break;
      default: ev.kind = 'nothing';
    }

    /* w0b: a real substitution (the build asked for them): he takes the
     * named man's place and that man goes off (effects.js substitute),
     * whatever the roll, because every result line of the card says he comes
     * on; the line's stamina still follows s0's table (only a clean result
     * gets it back) */
    if (fx && o.subOff && o.actor && fx.realSubs('you') && fx.substitute('you', o.subOff, o.actor, gameMin(p))) {
      ev.subOff = first(o.subOff); ev.subOn = first(o.actor);
      if (picked.effect !== 'rest') { st.usedSubs[o.actor.id] = 1; st.subsLeft = Math.max(0, st.subsLeft - 1); }
    }

    /* f1: what the opponent remembers of this decision */
    if (!showNoShot) counterRecord(st, p, o, band, picked.effect);   /* st3: a card for show is not a shot their keeper reads */
    /* st1: and what each defence remembers (Guessing, the base rule) */
    guessRecord(st, p, o);

    /* the running is paid whatever happened */
    if (o.cost && picked.effect !== 'rest') {
      st.spent[o.cost.line] += o.cost.amount;
      ev.cost = o.cost;
    }

    /* a booking sticks for the rest of the match */
    if ((o.id === 'FOUL' || o.id === 'M_FOUL' || ((o.id === 'E_FOUL' || o.id === 'TD_FOUL' || (A5_DEF && o.id === 'D_FOUL')) && band !== 'bad')) && o.actor) {
      if (!st.booked[o.actor.id]) ev.booked = first(o.actor) + ' is on a yellow card: Defending -2 for the rest of the match.';
      st.booked[o.actor.id] = true;
    }
    /* e1: your Destroyer's one foul with no card is used up */
    if (o.freeFoul && o.actor) st.freeFouls[o.actor.id] = true;
    /* e1: their man who tripped your Dribbler is booked, and your players
     * run at him at +2 for the rest of the match (c2) */
    if (picked.trip && !st.oppBooked[picked.trip.id]) {
      st.oppBooked[picked.trip.id] = p.minute;
      ev.booked = first(picked.trip) + ' is on a yellow card: +2 to your players running at ' + first(picked.trip) + ' for the rest of the match.';
    }
    /* e1 CARRY-OVER (from c2): a shot is remembered by the man who took it,
     * until his next shot; the one he takes now spends what he carried */
    if (o.formUse && o.actor) delete st.form[o.actor.id];
    if (o.shotBy && GUARD.form && !showNoShot) {
      var sn = first(o.shotBy);
      if (picked.effect === 'goal') {
        st.form[o.shotBy.id] = { n: 1, why: sn + ' scored at ' + (p.minuteText && /\+/.test(p.minuteText) ? p.minuteText : p.minute + ' minutes') };
        ev.carry = sn + ' scored: +1 the next time ' + sn + ' shoots.';
      } else {
        st.form[o.shotBy.id] = { n: -2, why: sn + ' missed a chance at ' + (p.minuteText && /\+/.test(p.minuteText) ? p.minuteText : p.minute + ' minutes') };
        ev.carry = sn + ' missed the chance: -2 the next time ' + sn + ' shoots.';
      }
    }

    if (st.chainMode && typeof p.tzone === 'number') {
      /* THEIR ATTACK BY ZONES (a4) */
      ev.step = p.step || 1; ev.zone = p.zone; ev.zoneIndex = p.zoneIndex;
      var tSteps = (p.tSteps || 0) + 1;
      var yourGot = ((o.grants && o.grants[band]) || []).slice();
      /* m2 (long): a component's edge says where it lands: the whole attack
       * when you win the ball, the next stop when their attack goes on */
      if (fx && st.x1 && st.x1.long) {
        var wonIt = picked.effect !== 'concede' && picked.win && (p.flipOk || o.counterWin);
        yourGot.forEach(function (c) { FX.lastingText(c, !!wonIt); });
      }
      /* their edge: from a duel they won, or (a4) from your keeper coming
       * out and only getting a touch */
      var theirGot = o.theirGrant && (band === 'bad' || (o.pays === 'tsweep' && band === 'mixed')) ? [o.theirGrant] : [];
      st.chain = null;
      /* kmtree5 a5 P1 (helper D): Hold him up clears their carried edge (the counter's too) and is used up for this attack */
      var a5held = A5_DEF && o.pays === 'd5delay', a5used = A5_DEF && (a5held || !!p.a5Hold);
      if (a5held) theirGot = [];
      if (a5held && typeof process !== 'undefined' && process.env && process.env.KM_A5_BREAK === 'edge') a5held = false;   /* d_measure.js --break edge */
      var g3c = !!picked.g3Counter && g3On('defout') && g3Brk() !== 'nocounter';   /* a12 GAME3a (J5): a won defending duel is your counter */
      var g3x = !!picked.g3Conv && g3Brk() === 'nocounter';   /* (g3a_check.js --break nocounter: the card says counter, the match ends the play) */
      if (picked.effect !== 'concede' && picked.win && !g3x && (p.flipOk || o.counterWin || g3c)) {
        /* you won the ball: your attack starts from there, higher up the
         * earlier you won it */
        var wz = typeof o.winZone === 'number' ? o.winZone : 0;
        /* w0b: a build may move where the won ball starts, and who has it */
        if (fx && typeof picked.fxWinZone === 'number') wz = picked.fxWinZone;
        if (g3c && typeof picked.g3Zone === 'number') wz = picked.g3Zone;
        /* a defender who wins it gives it to a midfielder when the attack
         * starts in midfield or higher */
        var starter = fx && picked.fxTo ? picked.fxTo : o.counterWin && o.to ? o.to : wz >= 1 && o.actor && o.actor.line === 0 ? M.carrierFor(wz, st.squad, legs(st), o.actor) : o.actor;
        st.chain = { next: 'zone', text: picked.text, youSteps: 0, step: ev.step, lastSit: p.moment.sit.id,
          zone: wz, carrier: starter, carried: yourGot, prev: null, cap: winCapOf(st) };
        ev.kind = 'escaped'; ev.carried = yourGot.map(function (c) { return O().carryText(c); });
        ev.toZone = M.ZONES[wz]; ev.toZoneIndex = wz;
        ev.headline = 'You won the ball. Your attack starts ' + ZONE_AT[wz] + ': choose what happens next.';
        ev.chains = first(starter) + ' has the ball ' + ZONE_AT[wz] + '. Your attack starts.';
      } else if (picked.effect !== 'concede' && typeof picked.tmove === 'number') {
        var ntz = p.tzone + picked.tmove;
        var carrierT = (GUARD.theirTo && picked.theirTo) || (picked.tmove > 0 ? (o.theirTo || o.foil) : M.theirCarrier(0, st.opp, st.seen));
        if (ntz >= 2) {
          var via2 = picked.via || o.via || p.via || 'box';
          st.chain = { next: 'box', text: picked.text, youSteps: 0, step: ev.step, lastSit: p.moment.sit.id,
            foil: carrierT, via: via2, blocker: o.actor && o.actor.line === 0 ? o.actor : null,
            flipOk: !!p.flipOk, carried: yourGot, theirCarried: theirGot, bounced: !!p.bounced, counterEdge: p.counterEdge || null };
          if (a5held) st.chain.counterEdge = null;
          if (a5used) st.chain.a5Hold = true;
          ev.kind = 'inbox';
          ev.headline = via2 === 'cross' || via2 === 'lowcross' ? first(carrierT) + ' is going to cross it into your box. One last chance to stop it.'
            : via2 === 'corner' ? 'They have a corner. One last chance to stop it.'
              : via2 === 'freekick' || via2 === 'fkcross' ? 'They have a free kick near your box. One last chance to stop it.'
                : via2 === 'alone' ? first(carrierT) + ' is through on your goal. One last chance to stop ' + first(carrierT) + '.'
                : first(carrierT) + ' is in your box. One last chance to stop ' + first(carrierT) + '.';
          ev.chains = 'Their attack goes on, into your box.';
        } else {
          st.chain = { next: 'tzone', text: picked.text, youSteps: 0, step: ev.step, lastSit: p.moment.sit.id,
            tz: ntz, foil: carrierT, sit: p.moment.sit, tSteps: tSteps, flipOk: !!p.flipOk, via: p.via || null,
            carried: yourGot, theirCarried: theirGot, counterEdge: p.counterEdge || null, isCounter: !!p.isCounter };
          if (a5held) st.chain.counterEdge = null;
          if (a5used) st.chain.a5Hold = true;
          if (a5held && picked.tmove === 0) {
            /* kmtree5 a5 P1 (helper D): held up, still in the same zone, the same man on the ball */
            ev.kind = 'heldup';
            ev.headline = first(carrierT) + ' is held up ' + (ntz === 0 ? 'in midfield' : 'at the edge of your box') + '. Their attack goes on: choose how to stop him.';
            ev.chains = 'Their attack goes on, ' + (ntz === 0 ? 'in midfield.' : 'at the edge of your box.');
          } else if (picked.tmove > 0) {
            ev.kind = 'theyadvance';
            ev.headline = first(carrierT) + ' is at the edge of your box. Choose how to stop him.';
            ev.chains = 'Their attack goes on, at the edge of your box.';
          } else {
            ev.kind = 'pushedback';
            ev.headline = 'You pushed them back into midfield. Their attack goes on: choose how to stop it there.';
            ev.chains = 'Their attack goes on, in midfield.';
          }
        }
        ev.carried = yourGot.map(function (c) { return O().carryText(c); });
        if (theirGot.length) ev.theirCarry = theirGot[0].text;
      } else if (picked.effect === 'nothing') {
        ev.headline = 'They did not get through. Their attack is over.';
      }
      ev.goesOn = !!st.chain;
    } else if (st.chainMode) {
      /* does the event go on? (see CHAIN_CAP) */
      var mine = p.moment.sit.who === 'you';
      var wasReb = !!(st.chain && st.chain.rebounded);
      /* x1 (c): what this decision carried, so a component's edge can last
       * the rest of the attack */
      var prevCar = st.chain && st.chain.next === 'zone' ? (st.chain.carried || []) : (p.x1Open || (X1_BREAK === 'leaklong' ? st.x1Last || [] : []));
      /* w0: hook 'cost', freeDecision: this one does not use up a decision */
      var freeNow = !!(fx && mine && o.fxFree && FX.GUARD.free && fx.freeUsed < FX.LIMIT.FREE_MAX);
      if (freeNow) { fx.freeUsed++; o.fxFreeUsed = true; }
      var youSteps = ((st.chain && st.chain.youSteps) || 0) + (mine && !freeNow ? 1 : 0);
      var goOn = null, nz = null;
      var zoned = typeof p.zoneIndex === 'number';
      if (mine && picked.effect === 'break') goOn = 'counter';
      else if (zoned && typeof picked.move === 'number' && picked.effect !== 'concede' && picked.effect !== 'goal' && !(picked.g3Conv && g3Brk() === 'nocounter')) {
        /* ZONES: the ball moves (or stays, or goes back) and the attack goes
         * on. On their moment this is your keeper playing it out. */
        goOn = 'zone';
        nz = mine ? Math.max(0, Math.min(3, p.zoneIndex + picked.move)) : Math.max(0, Math.min(3, picked.move));
        if (!mine) youSteps = 0;
      }
      /* w0: hook 'outcome', extraDecision: this result gives the attack one
       * more decision (bounded: effects.js LIMIT.EXTRA_MAX an attack) */
      if (fx && mine && picked.fxExtra && FX.GUARD.extra) {
        var xr = (o.fx || []).filter(function (r) { return r.field === 'continuation' && r.source === picked.fxExtra; })[0];
        fx.grantExtra(picked.fxExtra, xr ? xr.text : null, xr);  /* m3: xr, so its limit is used up */
      }
      var capBase = mine && st.chain && st.chain.cap ? st.chain.cap : chainCapOf(st);
      var capNow = capBase + (fx ? fx.capBonus : 0);
      if (goOn === 'zone' && youSteps >= capNow) goOn = null;
      /* a half clearance in your box (a4): the ball is back at the edge of
       * your box with one of their players, once */
      if (!mine && p.zoneIndex === -1 && picked.tmove === -1 && picked.effect !== 'concede') {
        goOn = 'tback';
      }
      /* a block in your box that goes out for a corner (a4), once */
      if (!mine && p.zoneIndex === -1 && picked.tmove === 0 && picked.via && picked.effect !== 'concede') goOn = 'tcorner';
      /* THEIR ATTACK COMES UP THE PITCH (a3): their man gets into your box */
      if (!mine && !goOn && picked.into && p.zoneIndex !== -1) goOn = 'box';
      st.follow = null; st.forcedTheirs = false; st.forcedYours = false;
      ev.step = p.step || 1;
      ev.zone = p.zone; ev.zoneIndex = p.zoneIndex;
      if (goOn) {
        st.chain = { next: goOn, text: picked.text, youSteps: youSteps, step: ev.step, lastSit: p.moment.sit.id };
        if (goOn === 'tcorner') {
          /* a corner, or (a5) a rebound after your keeper pushed it out */
          var rb = picked.via === 'box', hd = picked.via === 'header', pen = picked.via === 'penalty';
          st.chain = { next: 'box', text: picked.text, youSteps: 0, step: ev.step, lastSit: p.moment.sit.id,
            foil: fx && picked.fxTheirTo ? picked.fxTheirTo : rb ? (GUARD.theirTo && picked.theirTo) || o.theirTo || o.foil : o.foil, via: picked.via, blocker: rb ? null : null, flipOk: !!p.flipOk, carried: [], theirCarried: [], bounced: true };
          if (A5_DEF && p.a5Hold) st.chain.a5Hold = true;   /* kmtree5 a5 P1 (helper D) */
          ev.kind = 'inbox';
          ev.headline = rb ? first(st.chain.foil) + ' has the rebound in your box. One last chance to stop ' + first(st.chain.foil) + '.'
            : hd ? first(st.chain.foil) + ' heads it at your goal. Your keeper has one chance to stop it.'
              : pen ? 'Penalty to them. ' + first(st.chain.foil) + ' takes it. Your keeper has one chance to stop it.'
              : 'They have a corner. One last chance to stop it.';
          ev.chains = rb ? 'Their attack goes on: a rebound in your box.' : hd ? 'Their attack goes on: a header on your goal.' : pen ? 'Their attack goes on: a penalty.' : 'Their attack goes on: a corner.';
        } else if (goOn === 'tback') {
          st.chain = { next: 'tzone', text: picked.text, youSteps: 0, step: ev.step, lastSit: p.moment.sit.id,
            tz: 1, foil: (fx && picked.fxTheirTo) || o.theirTo || o.foil, sit: M.BOX_SIT, tSteps: 1, flipOk: !!p.flipOk, via: null,
            carried: [], theirCarried: [], bounced: true };
          if (A5_DEF && p.a5Hold) st.chain.a5Hold = true;   /* kmtree5 a5 P1 (helper D) */
          ev.kind = 'pushedback';
          ev.headline = first(st.chain.foil) + ' has the ball at the edge of your box. Choose how to stop him.';
          ev.chains = 'Their attack goes on, at the edge of your box.';
        } else if (goOn === 'box') {
          var via = p.moment.sit.id === 'their_winger' ? 'cross' : 'box';
          var cameFrom = st.chainPrev || null;
          st.chain.next = 'box'; st.chain.foil = o.foil; st.chain.via = via; st.chain.blocker = o.actor;
          /* the keeper holding it starts your attack only if their attack
           * started this event (not a counter after you lost it) */
          st.chain.flipOk = !p.continues;
          st.chain.carried = ((o.grants && o.grants[band]) || []).slice();
          /* their counter's edge stays with them into your box */
          st.chain.theirCarried = (p.theirCarried || []).slice();
          ev.carried = st.chain.carried.map(function (c) { return O().carryText(c); });
          ev.kind = 'inbox';
          ev.headline = via === 'cross' ? first(o.foil) + ' is going to cross it into your box. One last chance to stop it.'
            : first(o.foil) + ' is in your box. One last chance to stop ' + first(o.foil) + '.';
          ev.chains = 'Their attack goes on, into your box.';
        } else if (goOn === 'counter') {
          st.brokeFrom = o.label; ev.chains = 'They are breaking. You have to stop it.';
          /* and losing it hands THEM an edge on the counter: worse the
           * further back you lost it, because more of your players are
           * ahead of the ball (a2) */
          var zAt = typeof p.zoneIndex === 'number' ? p.zoneIndex : 1;
          var amt = [3, 2, 1, 1][zAt];
          st.chain.theirCarry = { amount: amt, why: 'your team lost the ball ' + ZONE_AT[zAt] + ' going forward', outfield: true,
            text: 'You lost the ball ' + ZONE_AT[zAt] + ', with your players going forward: +' + amt + ' to them in this attack' };
          ev.theirCarry = st.chain.theirCarry.text;
          /* a4: their counter starts in a zone: at the edge of your box if
           * you lost it in your half, otherwise in midfield; the man who
           * took the ball runs with it if he can */
          st.chain.counterTz = zAt <= 1 ? 1 : 0;
          st.chain.counterFoil = o.foil && o.foil.line >= (st.chain.counterTz === 1 ? 2 : 1) ? o.foil : M.theirCarrier(st.chain.counterTz, st.opp, st.seen);
          st.chain.brokeFrom = o.label;
          st.chain.counterTaker = o.foil || null;
        }
        else {
          /* e1: who has the ball comes from the result, not the option: a
           * pass that did not get through stays with the passer */
          st.chain.zone = nz; st.chain.carrier = picked.to || o.to || o.actor;
          /* kmtree5 a3 (helper C): which card and band put the ball where the next decision starts, and that
           * decision's own moment (index, step), so the picture can start the next decision where this card left the
           * ball: a cut-back's man around the penalty spot, a short free kick's man next to where it was taken
           * (pitch.js startOf). Positions only: nothing in the engine reads it. */
          delete st.chain.after;
          if (C3 && mine) {
            st.chain.after = { id: o.id, band: band, index: p.index, step: p.step || 1, taker: o.actor ? o.actor.id : null, cs: o.cStage || null };
            /* (the decision it came from, for pitch.js to find where that one's ball was; not enumerable, so nothing
             * that copies or saves the match walks back through the attack) */
            Object.defineProperty(st.chain.after, 'prev', { value: p, enumerable: false });
          }
          /* g2: the free kick is taken by the man who stands over it */
          if (mine && picked.mode === 'freekick' && O().fkTaker) st.chain.carrier = O().fkTaker(st.squad) || st.chain.carrier;
          st.chain.mode = mine ? picked.mode || null : null;
          st.chain.rebounded = mine && (wasReb || !!picked.rebound);
          if (mine && capBase !== chainCapOf(st)) st.chain.cap = capBase;
          /* CARRIED ADVANTAGE (a2): what this decision won goes into the
           * next one: the option's own grants for the band it landed in, and
           * any defender it beat clearly is out of position */
          /* e1: every edge a result carries is declared by the option
           * (options.js), so the card can say it before the choice; the
           * beaten defender, the players up the pitch after their attack and
           * after your keeper's catch are no longer added here unseen */
          var got = ((o.grants && o.grants[band]) || []).slice();
          /* x1 (c): an edge a component gave lasts the rest of this attack */
          if (st.x1 && st.x1.long && mine && X1_BREAK !== 'shortlong') prevCar.forEach(function (c) { if (c.id === 'fx' && !c.theirs && got.indexOf(c) < 0) got.push(c); });
          /* m2: every component edge going on in your attack says it lasts the attack */
          if (st.x1 && st.x1.long && mine) got.forEach(function (c) { FX.lastingText(c, true); });
          if (X1_BREAK === 'leaklong') st.x1Last = got;
          st.chain.carried = got;
          ev.carried = got.map(function (c) { return O().carryText(c); });
          st.chain.prev = st.chain.carrier !== o.actor && mine ? p.carrier || null : null;
          ev.toZone = M.ZONES[nz]; ev.toZoneIndex = nz;
          var carrierName = first(st.chain.carrier);
          if (!mine) {
            ev.kind = 'escaped';
            ev.headline = (/^winback/.test(o.pays) || (picked.g3Conv && g3On('defout')) ? 'You won the ball.' : /^box.*hold$/.test(o.pays) ? 'Your keeper has it.' : 'Your keeper got it out.') +
              ' Now it is your attack, from ' + (nz === 1 ? 'midfield' : 'your half') + ': choose what happens next.';
          } else if (picked.mode === 'freekick') {
            ev.kind = 'ground';
            ev.headline = 'Free kick to you at the edge of their box. Choose what happens next.';
          } else if (nz > p.zoneIndex) {
            ev.kind = 'ground';
            ev.headline = ZONE_GAIN[nz] + ' Choose what happens next.';
          } else if (picked.rebound) {
            ev.kind = 'kept';
            ev.headline = 'The rebound fell to ' + carrierName + ', in their box. Choose what happens next.';
          } else if (nz === p.zoneIndex) {
            ev.kind = 'kept';
            ev.headline = 'You kept the ball ' + ZONE_AT[nz] + '. Choose what happens next.';
          } else {
            ev.kind = 'kept';
            ev.headline = 'You went back, and still have the ball ' + ZONE_AT[nz] + '. Choose what happens next.';
          }
          ev.chains = carrierName + ' has the ball ' + ZONE_AT[nz] + '. The same attack goes on.';
          /* g1 (from p2): the last decision of a long attack could leave one
           * button ("plays a short, safe pass"), which is not a decision.
           * Then the attack ends here, with the ball kept, and says why.
           * (A rebound is always played: it is the reward for the shot.) */
          if (mine && GUARD.lastOne && youSteps + 1 >= capNow && !picked.rebound && picked.mode !== 'freekick' && nextLive(st) < 2) {
            st.chain = null; goOn = null;
            ev.kind = 'kept'; ev.carried = [];
            lastOneEnd = true;   /* a12 BAL2: the kept-ball opener follows it (below) */
            if (r12On('lastkeep')) { ev.endsAttack = true; ev.r12LastOne = true; }   /* a12 ENG7: the menu could not know (the next menu decides it) */
            ev.headline = 'You kept the ball ' + ZONE_AT[nz] + ', but their players are all back now. The attack is over.';
            ev.chains = null;
          }
        }
      } else {
        st.chain = null;
        if (picked.effect === 'break') ev.chains = null;
      }
      ev.goesOn = !!goOn;
    }

    /* kmtree5: a piece may act once the result is known (Game manager takes the ball: forceTheirs) */
    if (fx && fx.afterResolve && fx.afterResolve.length && st.chainMode) fx.afterResolve.forEach(function (f) { f(st, p, o, ev, picked, band); });
    /* a12 RUL-E (K1-4, cont): a won ball in their attack continues THIS moment as your attack (Eduardo: "you get to
     * continue playing that moment. The moment does not end."), at most R12_CONT_MAX times a moment; with contlast on
     * the last moment too. Otherwise a12's rules below (the end of the match on the last moment; else your attack is
     * the next moment). */
    if (r12On('cont') && st.r12ContAt !== st.n) { st.r12ContAt = st.n; st.r12ContN = 0; }   /* (only with the part on: the off side keeps a12's state, t_cmp's wider fingerprint) */
    var r12Cont = r12On('cont') && st.chainMode && st.chain && st.chain.next === 'zone' && p.moment.sit.who === 'them' &&
      st.r12ContN < R12_CONT_MAX && (st.n + 1 < momentsOf(st) || r12On('contlast'));
    if (r12Cont) {
      st.r12ContN++;
      st.chain.cap = winCapOf(st); st.chain.youSteps = 0; st.chain.step = 0; st.chain.r12Cont = true;
      /* a12 ENG7 (contstep; review/monday-rev2 item 10, "a won ball also restarts decision 1 inside the same moment"):
       * the moment goes on, so its decisions are counted on: the next one is this one's number plus one */
      if (r12On('contstep')) st.chain.step = ev.step || p.step || 1;
      ev.goesOn = true; ev.r12Cont = true;
      ev.chains = 'Your attack starts.';
    }
    /* a12 ENG7 (contend; review/monday-rev2 item 10, desk 009: a second won ball in moment 1 became "Moment 2 of 6" at
     * 15', and the 28' moment was never played): past the bound a won ball ENDS this moment; it no longer becomes the
     * next moment, which took the next scheduled moment's place. The menu said so (state(): g3Last, "You win the ball",
     * no counter, no edge). The next moment is the next one on the schedule. */
    if (!r12Cont && r12On('contend') && r12On('cont') && st.chainMode && st.chain && st.chain.next === 'zone' && p.moment.sit.who === 'them' &&
      st.r12ContAt === st.n && st.r12ContN >= R12_CONT_MAX && st.n + 1 < momentsOf(st)) {
      st.chain = null; ev.carried = []; ev.goesOn = false; ev.chains = null; ev.r12End = true;
      ev.headline = 'You won the ball, and this moment is over.';
    }
    if (!r12Cont && GUARD.lastWin && st.chainMode && st.chain && st.chain.next === 'zone' && p.moment.sit.who === 'them' && st.n + 1 >= momentsOf(st)) {
      /* g1 (from p3): won in the last moment of the match. The headline
       * said "Your attack is the next moment" and then the match ended. */
      st.chain = null; ev.carried = []; ev.goesOn = false; ev.chains = null; ev.lastWin = true;
      ev.headline = 'You won the ball, and that is the end of the match.';
    }
    if (!r12Cont && st.chainMode && st.chain && st.chain.next === 'zone' && p.moment.sit.who === 'them') {
      /* you won the ball: your attack is the next moment (see next) */
      st.chain.cap = winCapOf(st); st.chain.youSteps = 0; st.chain.step = 0;
      st.handoff = st.chain; st.chain = null; ev.handoff = true; ev.goesOn = true;
      ev.chains = 'Your attack is the next moment.';
    }
    /* a12 ENG8 (kball): your keeper had the ball, so the result never says you won it or stopped them */
    if (r12On('kball') && o.ownBall) {
      ev.ownBall = true;
      var kbTo = st.chain && st.chain.carrier ? st.chain.carrier : st.handoff && st.handoff.carrier ? st.handoff.carrier : picked.to || o.to || null;
      if (ev.goesOn && /^(You won the ball\.|Your keeper got it out\.|Your keeper has it\.)/.test(String(ev.headline || '')))
        ev.headline = String(ev.headline).replace(/^(You won the ball\.|Your keeper got it out\.|Your keeper has it\.)/, kbTo && kbTo.name ? first(kbTo) + ' has it.' : 'Your team has it.');
      else if (picked.effect === 'stopped' && /^You stopped them\./.test(String(ev.headline || ''))) ev.headline = 'Your keeper got rid of it, and the danger is over.';
    }
    /* w0: what the build did, and the events it listens to */
    if (fx) fxAfter(st, p, o, ev, picked, band, tierFrom, dice);
    st.log.push(ev);
    if (st.clk) st.clk.last = p.minute;   /* a11 Monday (stream CLK): a moment you start by winning the ball starts a minute after this */
    if (p.minuteText) ev.minuteText = p.minuteText;   /* a12 RUL-E (CLK-3): "90+2" for the page and the telemetry */
    st.pending = null;
    /* m1: your attack ended with your team keeping the ball, with the man
     * the result names (see keptOpener); nothing else is remembered */
    st.keptBall = null;
    var keptTxt = String(picked.text || ''), keptTo = null;
    /* a12 stream BAL2 (HANDOVER-BAL2.md; cohcheck result_holder_next_scene and result_next_scene with abc36 on): an attack
     * the "last one" rule ends with the ball kept (g1: "You kept the ball ..., but their players are all back now. The
     * attack is over.") is a kept ball whatever the card's kind (a carry, a one-two), so m1's ruling applies and the
     * next moment opens with what the ball did. Before, only keep/back/hold/probe cards got the opener, so the next
     * scene named another man with no word between. Behind abc36's switch (KM_B11=none: a11's words exactly);
     * KM_B11_BREAK=nokeptlast puts it back (cohcheck must then fail). Words only: no roll, menu or holder changes. */
    var b11sw = O()._b11 ? O()._b11() : null;
    var keptLast = lastOneEnd && b11sw && b11sw.on && b11sw.brk !== 'nokeptlast';
    if (st.chainMode && !st.chain && !st.handoff && p.moment.sit.who === 'you' && (ev.kind === 'nothing' || ev.kind === 'kept') &&
      (['keep', 'back', 'hold', 'probe'].indexOf(o.pays) >= 0 || keptLast) && /keeps? (it|the ball)|starts again|has the ball/.test(keptTxt)) {
      /* the man the result leaves with the ball: the one it names, of the pass's receiver, or the man who could not get past and still has it */
      keptTo = [o.to, o.receiver, o.mate, o.actor].filter(function (q) {
        return q && st.squad.players.indexOf(q) >= 0 &&
          new RegExp('(^|[^A-Za-z\u00c0-\u024f])' + first(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z\u00c0-\u024f]|$)').test(keptTxt);
      })[0] || null;
    }
    st.keptBall = keptTo;
    if (st.chainMode ? !st.chain : !st.follow) {
      st.n++;
      st.minuteNow = st.handoff ? Math.min(89, gameMin(p) + 1) : null;
      /* a12 ENG8 (otrest): what each line's own choices had spent when the first half ended, for the overtime rest (J2) */
      if (r12On('otrest') && st.n === 3 && st.spent && !st.r12Half) st.r12Half = { def: st.spent.def || 0, mid: st.spent.mid || 0, att: st.spent.att || 0 };
    }
    return ev;
  }

  /* w0: after a decision with a build loaded: the records on the chosen
   * option that happened go into the log, then the match announces what
   * happened (effects.js EVENTS), then the scopes that ended close (their
   * states run out, their activation limits reset). ev.fx is every log line
   * written since the last decision, for the page's feed. */
  function fxAfter(st, p, o, ev, picked, band, tierFrom, dice) {
    var fx = st.fx, who = p.moment.sit.who, mine = who === 'you';
    fx.fired(o, tierFrom, picked.bands || [picked.band]);
    /* w0b: what a defending result or an opponent's component set going */
    if (!mine && picked.fxExtra && FX.GUARD.defExtra && (ev.handoff || ev.kind === 'escaped')) {
      var xr = (o.fx || []).filter(function (r) { return r.field === 'continuation' && r.source === picked.fxExtra; })[0];
      fx.grantExtraNext(picked.fxExtra, xr ? xr.text : null, xr);  /* m3: xr, so its limit is used up */
    }
    if (picked.fxProlong) fx.prolonged++;
    if (picked.fxOppEdge && FX.GUARD.oppEdge && ev.goesOn) {
      var oe = {}; Object.keys(picked.fxOppEdge).forEach(function (k) { oe[k] = picked.fxOppEdge[k]; });
      oe.until = fx.scope.decision + 1;
      fx.oppEdges.push(oe);
    }
    var base = { side: who, id: o.id, tags: o.tags || [], actor: o.actor || null, foil: o.foil || null,
      to: picked.to || o.to || null, band: band, zone: typeof p.zoneIndex === 'number' ? p.zoneIndex : null,
      minute: p.minute, effect: picked.effect, kind: ev.kind,
      /* kmtree5: where the result left the ball (zones it moved, your attack), the card's endings, and whether it was a duel */
      move: typeof picked.move === 'number' ? picked.move : null, pays: o.pays || null, duel: !!dice || !!o.sureDuel };
    function E(name, extra) {
      var e = {};
      Object.keys(base).forEach(function (k) { e[k] = base[k]; });
      Object.keys(extra || {}).forEach(function (k) { e[k] = extra[k]; });
      fx.emit(name, e);
    }
    /* kmtree5: every check of a several-check duel is a duel event of its own, with its own man; a card
     * with no dice that a piece says is a sure win (or a sure loss) counts as one duel */
    function bandEv(b) { return b === 'good' ? 'clean_win' : b === 'mixed' ? 'half_win' : 'loss'; }
    if (dice && dice.checks && KM5_BREAK !== 'multievents') dice.checks.forEach(function (c, i) { E(bandEv(c.band), { foil: c.foil, check: i + 1, of: dice.multi }); });
    else if (dice) E(bandEv(band));
    else if (o.sureDuel) E(o.sureDuel, { sure: true });
    if (o.cost && picked.effect !== 'rest') E('stamina_spent', { line: o.cost.line, amount: o.cost.amount });
    if (picked.effect === 'rest' || ev.subOff) {
      /* w0b: with a real substitution, sub_out names the man who left */
      var offP = ev.subOff ? o.subOff : null;
      E('sub_in', { player: o.actor || null, off: offP, line: ev.restLine || null });
      E('sub_out', { player: offP, on: offP ? o.actor : null, line: ev.restLine || null });
    }
    if (o.shotBy && !(o.showSafe && ST1_BREAK !== 'showshot')) E('shot', { actor: o.shotBy });   /* st3: a card for show is not a shot */
    if (mine && picked.mode === 'freekick') E('set_piece_awarded', { kind: 'free kick', side: 'you' });
    if (!mine && (picked.via === 'freekick' || picked.via === 'fkcross' || picked.via === 'corner')) {
      E('set_piece_awarded', { kind: picked.via === 'corner' ? 'corner' : 'free kick', side: 'them' });
    }
    /* w1f: the man who fouled travels as `fouler` too (the effects layer
     * overwrites `by` with the effect that made an event) */
    if (mine && (picked.trip || picked.mode === 'freekick')) E('foul_won', { by: picked.trip || null, fouler: picked.trip || null });
    if (picked.effect === 'goal') E('goal');
    if (picked.effect === 'concede') E('conceded');
    if (!mine && (ev.handoff || ev.kind === 'escaped')) E('recovery');
    E('decision_end');
    /* kmtree5: a piece that greyed a card on this menu (No quick shots) fired, once a decision */
    var greyers = {};
    (p.moment.available || []).forEach(function (x) {
      if (!x.hardGrey || !x.fxRec || !x.fxRec.greyBy) return;
      var gi = fx.inst.filter(function (q) { return q.name === x.fxRec.greyBy.source; })[0];
      if (gi && !greyers[gi.i]) { greyers[gi.i] = 1; fx.countFire(gi); }
    });
    if (st.chainMode ? !st.chain : !st.follow) fx.momentEnd();
    fx.expire('decision');
    fx.oppEdgesEnd();   /* w0b: their edges for this decision are used up */
    fx.scope.decision++;
    fx.inChoose = false;
    fx.fires = 0; fx.runaway = false;
    ev.fx = fx.evLines.map(function (l) { return l.line; });
    fx.evLines = [];
  }

  /* kmtree5 (Game manager, opponents.js): THEY TAKE THE BALL AND COME ONE ZONE CLOSER. Called once the
   * result of a decision is known (fx.afterResolve). A goal (either way) is left alone. Their attack going
   * on moves one zone closer to your goal (midfield to the edge of your box, the edge into your box); any
   * other result (your attack going on or over, their attack over, a ball you won) becomes their attack
   * at the edge of your box, one zone closer than where their attacks start. */
  function forceTheirs(st, p, ev, why) {
    var ch = st.chain;
    if (ev.kind === 'goal' || ev.kind === 'conceded') return false;
    if (ch && ch.next === 'box') return false;
    if (ch && ch.next === 'tzone') {
      if (ch.tz >= 1) st.chain = { next: 'box', text: ch.text, youSteps: 0, step: ch.step, lastSit: ch.lastSit, foil: ch.foil, via: 'box', blocker: null,
        flipOk: !!ch.flipOk, carried: [], theirCarried: ch.theirCarried || [], bounced: !!ch.bounced, counterEdge: ch.counterEdge || null };
      else ch.tz = 1;
    } else if (ch && ch.next === 'counter') {
      ch.counterTz = 1; ch.counterFoil = ch.counterFoil && ch.counterFoil.line >= 2 ? ch.counterFoil : M.theirCarrier(1, st.opp, st.seen);
    } else {
      st.handoff = null;
      st.chain = { next: 'counter', text: why, youSteps: 0, step: ev.step || 1, lastSit: p.moment.sit.id, counterTz: 1,
        counterFoil: M.theirCarrier(1, st.opp, st.seen), brokeFrom: null, counterTaker: null, theirCarry: null };
    }
    st.forcedTheirs = false; st.forcedYours = false; st.keptBall = null;
    ev.forced = why; ev.goesOn = true; ev.handoff = false; ev.lastWin = false;
    ev.headline = why + ' Their attack goes on' + (st.chain.next === 'box' ? ', into your box.' : ', at the edge of your box.');
    ev.chains = st.chain.next === 'box' ? 'Their attack goes on, into your box.' : 'Their attack goes on, at the edge of your box.';
    return true;
  }

  /* kmtree5: X.runReport(match), for the run (Helper R's cup.js): who started, who played the whole
   * match, who went off, each man's Momentum at the end, the score, and how often each of your pieces
   * fired (an event of it ran, or a record of it on a chosen card happened). */
  function runReport(st) {
    var fx = st.fx || null, A = st.arch || null, sq = st.squad;
    var offs = fx ? (fx.subLog || []).filter(function (e) { return e.side === 'you'; }) : [];
    var cameOn = offs.map(function (e) { return e.on; });
    var now = sq.players.concat(sq.keeper ? [sq.keeper] : []);
    var started = now.filter(function (p) { return cameOn.indexOf(p) < 0; }).concat(offs.map(function (e) { return e.off; }));
    var players = {};
    function rec(p) {
      var n = first(p);
      var off = KM5_BREAK !== 'report' && offs.some(function (e) { return e.off === p; }), st0 = started.indexOf(p) >= 0;
      players[n] = { started: st0, fullMatch: st0 && !off, subbedOff: off, cameOn: cameOn.indexOf(p) >= 0,
        momentum: A && A.momentum && typeof A.momentum[n] === 'number' ? A.momentum[n] : 0 };
    }
    started.concat(cameOn).forEach(rec);
    (sq.bench || []).forEach(function (p) { if (!players[first(p)]) players[first(p)] = { started: false, fullMatch: false, subbedOff: false, cameOn: false, momentum: A && A.momentum && typeof A.momentum[first(p)] === 'number' ? A.momentum[first(p)] : 0 }; });
    return { players: players, lost: st.score.you < st.score.them, drew: st.score.you === st.score.them, won: st.score.you > st.score.them,
      conceded: st.score.them, scored: st.score.you, pieces: fx && fx.firesYou ? JSON.parse(JSON.stringify(fx.firesYou)) : {},
      theirPieces: fx && fx.firesThem ? JSON.parse(JSON.stringify(fx.firesThem)) : {} };
  }
  /* kmtree5: the counters the page shows (Belief, Build-up, pockets, streaks, their effects), from
   * archetypes.js and opponents.js; an empty list without them */
  function counters(st) {
    var out = [];
    if (root.KMArchetypes && root.KMArchetypes.counters) out = out.concat(root.KMArchetypes.counters(st));
    if (root.KMOpponents && root.KMOpponents.counters) out = out.concat(root.KMOpponents.counters(st));
    return out;
  }

  /* The report. p3: at most three lines, each about what happened in THIS
   * match, read off the log: where you lost the ball, which of their
   * players did the most against you, the edge you used most, your shots,
   * their attacks into your box, a tired line. p2 printed the same
   * "Finishing problem" line in most matches, because its lines were keyed
   * on the score and gave advice rather than facts. Each candidate line
   * carries a weight for how much it mattered in this match; the three
   * heaviest are shown. */
  var SHOTS = { shot: 1, shotreb: 1, placed: 1, longshot: 1, header: 1, square: 1, pullback: 1 };
  /* (times() is f2's, above: once, twice, three times) */
  /* g1: "all 2 of them" reads as a machine; "both" */
  function allOf(n, what) { return n === 2 ? 'both ' + what : 'all ' + n + ' ' + what; }
  function listCounts(obj, fmt) {
    var ks = Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; });
    var parts = ks.map(function (k) { return fmt(k, obj[k]); });
    return parts.length <= 1 ? parts.join('') : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  }
  function report(st) {
    var won = st.score.you > st.score.them, drew = st.score.you === st.score.them;
    var log = st.log;
    var yours = log.filter(function (e) { return e.sit.who === 'you' && !e.cont; });
    var theirs = log.filter(function (e) { return e.sit.who === 'them'; });
    var events = log.filter(function (e) { return !e.cont; }).length;
    var conceded = theirs.filter(function (e) { return e.kind === 'conceded'; }).length;
    var cands = [];

    /* 1. where you lost the ball going forward, and what it cost */
    var lostEv = [], lostAt = {}, fromLoss = 0, counter = false;
    log.forEach(function (e) {
      if (!e.cont) counter = false;
      if (e.sit.who === 'you' && e.kind === 'lost') {
        lostEv.push(e); counter = true;
        var where = typeof e.zoneIndex === 'number' && ZONE_AT[e.zoneIndex] ? ZONE_AT[e.zoneIndex] : 'going forward';
        lostAt[where] = (lostAt[where] || 0) + 1;
      } else if (counter && e.sit.who === 'them' && e.kind === 'conceded') { fromLoss++; counter = false; }
    });
    if (lostEv.length) {
      var takers = {}, caught = {};
      /* call: a shot their keeper catches is not the ball "taken from you"
       * (round 4 review: "Simon took it from you" for a caught shot) */
      lostEv.forEach(function (e) {
        if (!e.foilName) return;
        if (GUARD.caughtShot && e.shot) caught[e.foilName] = (caught[e.foilName] || 0) + 1;
        else takers[e.foilName] = (takers[e.foilName] || 0) + 1;
      });
      var topT = Object.keys(takers).sort(function (a, b) { return takers[b] - takers[a]; })[0];
      var topC = Object.keys(caught).sort(function (a, b) { return caught[b] - caught[a]; })[0];
      var one = lostEv.length === 1;
      cands.push({ w: 2 * lostEv.length + 3 * fromLoss, good: false,
        head: 'You lost the ball ' + times(lostEv.length) + ' going forward' + (lostAt['going forward'] ? '.'
          : one ? ', ' + Object.keys(lostAt)[0] + '.' : Object.keys(lostAt).length === 1 ? ', ' + (lostEv.length === 2 ? 'both ' : 'all ') + Object.keys(lostAt)[0] + '.'
            : ': ' + listCounts(lostAt, function (k, n) { return n + ' ' + k; }) + '.'),
        why: (topT ? topT + ' took it ' + (one ? 'from you' : times(takers[topT])) + '. ' : '') +
          (topC ? topC + ' caught ' + (caught[topC] === 1 ? (one ? 'your shot' : 'one of your shots') : caught[topC] + ' of your shots') + ', and their team attacked. ' : '') +
          (one ? (fromLoss ? 'They scored from the counter.' : 'They did not score from the counter.')
            : fromLoss ? 'They scored from ' + (fromLoss === lostEv.length ? allOf(fromLoss, 'of those counters') : fromLoss + ' of those counters') + '.'
              : 'They did not score from any of those counters.') });
    }

    /* 2. which of their players did the most against you */
    var foe = {};
    function F(n) { return foe[n] || (foe[n] = { goals: 0, duels: 0, won: 0, took: 0, faced: {} }); }
    log.forEach(function (e) {
      if (e.sit.who === 'them' && e.foilName) {
        if (e.kind === 'conceded') F(e.foilName).goals++;
        if (e.dice) {
          var f = F(e.foilName); f.duels++; if (e.band === 'bad') f.won++;
          if (e.actorName) f.faced[e.actorName] = (f.faced[e.actorName] || 0) + 1;
        }
      }
      if (e.sit.who === 'you' && e.kind === 'lost' && e.foilName) { if (GUARD.caughtShot && e.shot) F(e.foilName).caught = (F(e.foilName).caught || 0) + 1; else F(e.foilName).took++; }
    });
    var foeName = null, foeW = 0;
    Object.keys(foe).forEach(function (n) {
      var f = foe[n], w = 2 * f.goals + f.won + f.took + (f.caught || 0);
      if (w > foeW) { foeW = w; foeName = n; }
    });
    if (foeName && foeW >= 2) {
      var f = foe[foeName], bits = [];
      if (f.goals) bits.push('scored ' + (f.goals === 1 ? 'once' : f.goals + ' goals'));
      if (f.duels) bits.push(f.duels === 1 ? (f.won ? 'won his one duel with your players' : 'lost his one duel with your players')
        : f.won === f.duels ? (f.duels === 2 ? 'won both his duels with your players' : 'won all ' + f.duels + ' of his duels with your players')
          : 'won ' + f.won + ' of his ' + f.duels + ' duels with your players');
      if (f.took) bits.push('took the ball from you ' + times(f.took));
      if (f.caught) bits.push(f.caught === 1 ? 'caught one of your shots' : 'caught ' + f.caught + ' of your shots');
      var fk = Object.keys(f.faced).sort(function (a, b) { return f.faced[b] - f.faced[a]; });
      var facedBy = fk[0];
      cands.push({ w: foeW, good: false,
        head: 'Of their players, ' + foeName + ' did the most against you: he ' +
          (bits.length > 1 ? bits.slice(0, -1).join(', ') + ' and ' + bits[bits.length - 1] : bits[0]) + '.',
        why: !facedBy ? foeName + ' was never in a duel with one of your players.'
          : f.faced[facedBy] >= 2 ? facedBy + ' faced ' + foeName + ' most often (' + f.faced[facedBy] + ' of those duels).'
            : fk.length === 1 ? facedBy + ' was the one who faced ' + foeName + '.'
              : fk.slice(0, -1).join(', ') + ' and ' + fk[fk.length - 1] + ' each faced ' + foeName + ' once.' });
    }

    /* 3. the edge you used most (carried advantage, a2) */
    var edges = {};
    log.forEach(function (e) {
      if (e.sit.who !== 'you' || !e.uses) return;
      e.uses.forEach(function (u) {
        var g = edges[u.name] || (edges[u.name] = { n: 0, amount: u.n, won: 0 });
        g.n++; if (e.dice && e.dice.diff >= 0) g.won++;
      });
    });
    /* kmtree5 a2 (helper M): the edges' names in plain words (phrases.js plain), as the cards say them */
    var PLN = (root.KMPhrases && root.KMPhrases.plain) || (function () { try { return require('./phrases.js').plain; } catch (e) { return null; } })() || function (t) { return t; };
    var edges0 = edges; edges = {}; Object.keys(edges0).forEach(function (k) { edges[PLN(k)] = edges0[k]; });
    var edgeName = Object.keys(edges).sort(function (a, b) { return edges[b].n - edges[a].n; })[0];
    if (edgeName) {
      var eg = edges[edgeName], allE = 0, allW = 0;
      Object.keys(edges).forEach(function (k) { allE += edges[k].n; allW += edges[k].won; });
      var wonOf = function (w, n, what) {
        return n === 1 ? 'You ' + (w ? 'won' : 'lost') + ' the check ' + what + '.'
          : w === n ? 'You won ' + (n === 2 ? 'both' : 'all ' + n) + ' of the checks ' + what + '.'
            : 'You won ' + w + ' of the ' + n + ' checks ' + what + '.';
      };
      var spread = allE > eg.n && eg.n === 1;
      cands.push({ w: 2 + eg.n, good: (spread ? allW * 2 >= allE : eg.won * 2 >= eg.n),
        head: spread ? 'You used ' + allE + ' different edges from earlier decisions: ' +
            (function (ks) { var q = ks.slice(0, 3).map(function (k) { return '"' + k + '"'; });
              if (ks.length > 3) q.push(ks.length - 3 + ' more');
              return q.slice(0, -1).join(', ') + ' and ' + q[q.length - 1]; })(Object.keys(edges)) + '.'
          : allE > eg.n ? 'You used an edge from an earlier decision ' + times(allE) + ', most often "' + edgeName + '" (+' + eg.amount + ', ' + times(eg.n) + ').'
            : 'You used the edge "' + edgeName + '" (+' + eg.amount + ') ' + times(eg.n) + '.',
        why: spread ? wonOf(allW, allE, 'they helped') : wonOf(eg.won, eg.n, 'it helped') });
    }

    /* 4. your shots */
    var shots = log.filter(function (e) { return e.sit.who === 'you' && !e.showSafe && (e.shot || SHOTS[e.pays]); });
    if (shots.length) {
      var sc = shots.filter(function (e) { return e.kind === 'goal'; }).length, by = {};
      shots.forEach(function (e) { if (e.actorName) by[e.actorName] = (by[e.actorName] || 0) + 1; });
      var shooter = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; })[0];
      cands.push({ w: 1 + shots.length / 2 + (sc === 0 && shots.length >= 2 ? 4 : 0), good: sc > 0,
        head: 'You had ' + shots.length + ' shot' + (shots.length === 1 ? '' : 's') + ' and scored ' +
          (sc === 0 ? (shots.length === 1 ? 'with none' : 'with none of them') : sc) + '.',
        why: shooter + ' took ' + (by[shooter] === shots.length ? (shots.length === 1 ? 'it' : 'all of them') : by[shooter] + ' of them') + '.' });
    }

    /* 5. their attacks that reached your box */
    var boxEv = theirs.filter(function (e) { return e.zoneIndex === -1; });
    if (boxEv.length >= 2) {
      var boxGoals = boxEv.filter(function (e) { return e.kind === 'conceded'; }).length;
      var kn = st.squad.keeper ? first(st.squad.keeper) : null;
      var kFaced = boxEv.filter(function (e) { return kn && e.actorName === kn; }).length;
      var kSaves = boxEv.filter(function (e) { return e.kind !== 'conceded' && kn && e.actorName === kn; }).length;
      cands.push({ w: boxEv.length + boxGoals, good: boxGoals === 0,
        head: 'They got into your box ' + times(boxEv.length) + (boxGoals ? ' and scored ' + times(boxGoals) + '.' : ' and did not score.'),
        why: !kn ? '' : !kFaced ? kn + ' did not have to face any of them himself: your defenders did.'
          : kFaced === 1 ? kn + ' faced one of them himself and ' + (kSaves ? 'stopped it.' : 'did not stop it.')
          : kn + ' faced ' + (kFaced === boxEv.length ? 'every one of them' : kFaced + ' of them') + ' himself and stopped ' +
            (kSaves === kFaced ? (kFaced === 2 ? 'both' : 'all of them') : kSaves === 0 ? 'none' : kSaves) + '.' });
    }

    /* 6. a tired line (the style cards promise it, so the report says
     * whether it happened) */
    var end = legs(st), lo = 'def';
    ['mid', 'att'].forEach(function (k) { if (end[k] < end[lo]) lo = k; });
    if (end[lo] < 55) {
      var word = { def: 'defence', mid: 'midfield', att: 'attack' }[lo];
      cands.push({ w: 1 + (55 - end[lo]) / 4, good: false, head: 'Your ' + word + ' finished with ' + Math.round(end[lo]) + ' out of 100 stamina.',
        /* st4: the cup's Fresh legs gives 4 (st.subsMax); 3 otherwise, as always */
        why: 'A tired line plays below its numbers. ' + (st.subsLeft === (st.subsMax || 3) ? 'You did not use any of your ' + (st.subsMax || 3) + ' substitutions.'
          : st.subsLeft > 0 ? 'You used ' + ((st.subsMax || 3) - st.subsLeft) + ' of your ' + (st.subsMax || 3) + ' substitutions.' : 'You used all ' + (st.subsMax || 3) + ' substitutions.') });
    }

    /* 7. g1: the keyword and pair options you chose (e2 printed this as a
     * fourth line under the report) */
    var usedKw = log.filter(function (e) { return e.sit.who === 'you' && e.unlock; });
    if (usedKw.length) {
      var kwGoals = usedKw.filter(function (e) { return e.kind === 'goal'; }).length;
      /* each one with its minute and what came of it, so the line is about
       * this match ("Messi (Dribbler) at 27 minutes: the attack went on") */
      var came = function (e) {
        return e.kind === 'goal' ? 'a goal' : e.kind === 'lost' ? 'you lost the ball' : e.goesOn ? 'the attack went on'
          : e.kind === 'stopped' || e.kind === 'escaped' ? 'you stopped them' : 'no goal';
      };
      cands.push({ kw: true, w: 1 + usedKw.length / 2 + 3 * kwGoals, good: kwGoals > 0,
        head: 'You chose ' + usedKw.length + ' option' + (usedKw.length === 1 ? '' : 's') + ' only your players unlock, and ' +
          (kwGoals === 0 ? (usedKw.length === 1 ? 'it did not score.' : 'none of them scored.') : kwGoals + ' of them scored.'),
        why: usedKw.slice(0, 4).map(function (e) { return e.unlock.replace(/: (.*)$/, ' ($1)') + ' at ' + (e.minuteText && /\+/.test(e.minuteText) ? e.minuteText : e.minute + ' minutes') + ': ' + came(e); }).join('; ') +
          (usedKw.length > 4 ? '; and ' + (usedKw.length - 4) + ' more' : '') + '.' });
    }

    /* the heaviest three, in the order they were weighed */
    var ranked = cands.map(function (c, i) { c.i = i; return c; })
      .sort(function (a, b) { return b.w - a.w || a.i - b.i; });
    var top = ranked.slice(0, 3);
    /* g1: the options only your players unlock are always one of the three
     * when you chose any (what a keyword is worth is something you saw) */
    var kwc = ranked.filter(function (c) { return c.kw; })[0];
    if (kwc && top.indexOf(kwc) < 0) top[top.length === 3 ? 2 : top.length] = kwc;
    var lines = top.map(function (c) { return { good: c.good, head: c.head, why: c.why }; });
    if (!lines.length) {
      lines.push({ good: drew, head: 'You had no shots and never lost the ball going forward.',
        why: 'Nothing else in this match stood out either way.' });
    }

    return {
      won: won, drew: drew, score: st.score,
      lines: lines,
      counts: { yours: yours.length, theirs: theirs.length, scored: st.score.you, conceded: conceded, lost: lostEv.length,
        /* events they started, not counting counters inside your events */
        theirsStarted: theirs.filter(function (e) { return !e.cont; }).length, events: events }
    };
  }

  /* headless play, for the tests */
  function auto(squad, opp, seed, style, policy, opts) {
    var st = newMatch(squad, opp, seed, style, opts);
    var guard = 0;
    while (!isOver(st) && guard++ < 40) {
      var p = next(st);
      if (!p) break;
      var live = p.moment.options.filter(function (o) { return !o.disabled; });
      choose(st, policy ? policy(st, live) : 0);
    }
    return { state: st, report: report(st) };
  }

  /* a12 RUL-E (OT-3; Eduardo: "Just say what actually happens: your players recovered X amount of stamina"): what the
   * overtime rest gave back to each line, the legs with st.rested now against the legs with restedBefore (cup.js otStep
   * sets the rest; call this with a copy of st.rested taken just before). { def, mid, att, avg } in stamina points. */
  function otRestGain(st, restedBefore, spentBefore) {
    var now = legs(st), saved = st.rested, savedSp = st.spent;
    st.rested = restedBefore || { def: null, mid: null, att: null };
    if (spentBefore) st.spent = spentBefore;   /* a12 ENG8 (otrest): the rest also gave back the first half's own spending */
    var was = legs(st);
    st.rested = saved; st.spent = savedSp;
    var g = { def: Math.round(now.def - was.def), mid: Math.round(now.mid - was.mid), att: Math.round(now.att - was.att) };
    g.avg = Math.round((g.def + g.mid + g.att) / 3);
    if (!r12On('otgain')) g = { def: 0, mid: 0, att: 0, avg: 0 };   /* (R12_BREAK=otgain: rule_check.js R11 must fail) */
    return g;
  }
  var API = {
    otRestGain: otRestGain, r12MinuteText: r12MinuteText,
    MOMENTS: MOMENTS, MINUTES: MINUTES, x1Parse: x1Parse, chainCapOf: chainCapOf, winCapOf: winCapOf, momentsOf: momentsOf, BETWEEN: BETWEEN, COUNTER_MODES: COUNTER_MODES, COUNTER_DEFAULT: COUNTER_DEFAULT, NOUN: NOUN, COUNTERS: COUNTERS, CHAIN_CAP: CHAIN_CAP, GUARD: GUARD, playNames: playNames,
    CHAIN_GROUND: CHAIN_GROUND, T_CAP: T_CAP, WIN_CAP: WIN_CAP, CHAIN_KEEP: CHAIN_KEEP, REPEAT_DAMP: REPEAT_DAMP, FOLLOW_ON: FOLLOW_ON, headline: headline,
    newMatch: newMatch, next: next, choose: choose, isOver: isOver,
    /* for the harness sweeps (g1 node.json) */
    setCounterSizes: function (v) { if (v.up !== undefined) KEEP_UP = v.up; if (v.down !== undefined) KEEP_DOWN = v.down; if (v.room !== undefined) ROOM_BY = v.room; if (v.step !== undefined) LEARN_STEP = v.step; },
    report: report, auto: auto, minute: minute, legs: legs,
    canShowNow: canShowNow, showAttack: showAttack, showBotMode: showBotMode, rebuildZoneMenu: rebuildZoneMenu,
    /* st1 */
    guessMode: guessMode, guessKindYou: guessKindYou, guessKindThem: guessKindThem, GUESS_BY: GUESS_BY,
    /* kmtree5 */
    runReport: runReport, counters: counters, forceTheirs: forceTheirs
  };
  root.KMMatch = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
