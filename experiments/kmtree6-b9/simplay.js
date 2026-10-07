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
 *   KM_SIMHEAD / ?simhead  air (default, b6) | ground (b5): a header clearance on a loose ball (DECISIONS-PLAY P41)
 *   KM_SIMCROSS / ?simcross  on (default, b6) | off (b5): their cross moment draws the cross and the named man's header (P42)
 *   KM_SIMTOZONE / ?simtozone  firm (default, b6) | once (b5): the run to the zone the words name goes on until he is in it, up to 9 s (P43)
 *   KM_SIMHITS / ?simhits  on (default, b6) | off (b5): "X hits the target" names X as the shooter (P45)
 *   KM_SIMKFEET / ?simkfeet  on (default, b6) | off (b5): "your keeper plays it short to X before Y gets there" is his pass to X, not a tackle (P46)
 *   KM_SIMDBW / ?simdbw  on (default, b6) | off (b5): "X wins the header, but K saves it" is the cross to X, his header and K's save (P47)
 *   KM_SIMNAMES / ?simnames  wide (default, b6) | ascii (b5): "Álvarez has it" after "X gets to the ball first" is read (a name may start with an accented capital) (P48)
 *   KM_SIMFEWM / ?simfewm  on (default, b6) | off (b5): "X gets to the ball first, but only kicks it a few metres ... and Y has it" draws that (P49)
 *   KM_SIMKEEPBALL / ?simkeepball  held (default, b6) | loose (b5): under the keep (KM_SIMKEEP) a pass of the kept team that lands 2.6 to 6 m from its receiver stops for him (P44)
 *   b7 (all default on; the b6 value replays b6):
 *   KM_SIMAIR / ?simair  on (default, b7) | off (b6): the header clearance and the keeper's clearance are played on a ball in the air, the
 *       other man at a running speed (P51)
 *   KM_SIMFAR / ?simfar  past (default, b7) | b6: "heads it as far as their midfield" ends 55 to 60 m from your goal, past halfway (P52)
 *   KM_SIMHFLY / ?simhfly  on (default, b7) | off (b6): the header at your goal is on its way at the plan stop, and every header shot is struck
 *       in the air (P53)
 *   KM_SIMWBK / ?simwbk  touch (default, b7) | b6: their keeper "gets a foot to it, but your team wins it straight back": his touch knocks it
 *       on and your nearest man runs onto it (P54)
 *   KM_SIMTWOM / ?simtwom  on (default, b7) | b6: "N scores from two metres" after a low cross is struck about 2 m out (P55)
 *   KM_SIMRACE / ?simrace  on (default, b7) | b6: "X gets to the ball before Y and brings it down" is X reaching it first (P56)
 *   b8 (all default on; the b7 value replays b7):
 *   KM_SIMCTR / ?simctr  keep (default) | play | off (b7): P58.  KM_SIMDUEL / ?simduel  them (default) | both | off (b7): P59.
 *   KM_SIMWONON / ?simwonon  on (default) | off (b7): P60.  KM_SIMNEAR / ?simnear  pic (default) | engine (b7): P61.
 *   KM_SIMZDROP / ?simzdrop  on (default) | b7: P62.  KM_SIMBOUNCE / ?simbounce  phys (default) | b7: P63.
 *   KM_SIMRIVAL / ?simrival  brake (default) | b7: P64.
 *   b9 (Eduardo's b7 playtest; all default on; the b8 value replays b8):
 *   KM_SIMKICK / ?simkick  on (default) | b8: P66 (kick-offs).
 *   KM_SIMHDGO / ?simhdgo  on (default) | b8: P67 (the headline says the play goes on when the same moment goes on).
 *   KM_SIMWONKEEP / ?simwonkeep  on (default) | b8: P68 (a ball won in their attack stays won: the handoff, the engine's chain, the loose ball).
 *   KM_SIMLEADTO / ?simleadto  on (default) | b8: P69 (a pass to a running man is led to where he is running).
 *   KM_SIMLONGK / ?simlongk  on (default) | b8: P70 (the keeper's long kick goes long upfield).
 *   KM_SIMRATTLE / ?simrattle  carry (default) | b8: P71 (the rattled card of a moment's first menu goes to its first world-stop menu).
 *   KM_SIMRECV / ?simrecv  timed (default) | b8: P72 (the receiver of a planned pass times his run to meet the ball).
 *   KM_SIMPIPS / ?simpips  moment (default) | b8: P75 (ASK-0064: the pips belong to the moment; your decisions in it use them across world stops).
 *   KM_SIMPIPLAST / ?simpiplast  cards (default) | finish: P75b (with the pips on: a world stop on your last pip whose finish-only menu has one live
 *     card or misses the stop's own card gets the stop's cards; the moment still ends after that decision).
 *   KM_SIMPIPEND / ?simpipend  fresh (default) | handoff: P75c (with the pips on: the moment the pips ran out in is over and the next comes
 *     from the schedule; handoff = your attack is the next moment, from that picture).
 *   KM_SIMOVER / ?simover  sim (default) | b8: P76 (ASK-0065: the words follow the roll and the world; "over" never ends a moment against them).
 *   KM_SIM_BREAK / ?simbreak  (checks only) reb | winback | yourbox | handdrop | freeshot | shooter | punchline (b4) | nowords | noplan | nostop | opensit | staleflags | nofoul | outwon | enginecarrier | handfresh | frameowner | plan1 | plan2 | plan3 | throw | endframe | tokeeper | kclear | recvcollect | ksweep | overall | (b9) nolkeep | handframe | chainfresh | wonend | noleadto | nolongk | nopipcap | nopipcarry | pipswin | piplast | pipendhand | nooverkeep | noovercarry | nooverwords | overseg | norattle | norecv: each switches one piece off so its check must fail
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
      ott: get('KM_SIMOTT', 'simott', 'engine') === 'world' ? 'world' : 'engine',
      /* b6 (r3 M1, P41): 'air' = "X heads it away / as far as their midfield" on a loose ball is drawn as X getting to the ball first and heading
       * it 10 m or more to a team-mate (and the keeper's "kicks it clear before Y reaches it": the keeper gets there first); 'ground' = b5 (the
       * man running onto the ball takes it first, then X tackles him and keeps it where he is) */
      head: get('KM_SIMHEAD', 'simhead', 'air') === 'ground' ? 'ground' : 'air',
      /* b6 (r3 M2, P42): 'on' = their cross moment draws the cross from the crosser to the man the scene names, and his header or shot (or the
       * engine's own header decision when the words stop at "X heads it at your goal."); 'off' = b5 (shots from the crosser on the flank) */
      cross: get('KM_SIMCROSS', 'simcross', 'on') === 'off' ? 'off' : 'on',
      tozone: get('KM_SIMTOZONE', 'simtozone', 'firm') === 'once' ? 'once' : 'firm',
      keepball: get('KM_SIMKEEPBALL', 'simkeepball', 'held') === 'loose' ? 'loose' : 'held',
      hits: get('KM_SIMHITS', 'simhits', 'on') === 'off' ? 'off' : 'on',
      kfeet: get('KM_SIMKFEET', 'simkfeet', 'on') === 'off' ? 'off' : 'on',
      dbw: get('KM_SIMDBW', 'simdbw', 'on') === 'off' ? 'off' : 'on',
      names: get('KM_SIMNAMES', 'simnames', 'wide') === 'ascii' ? 'ascii' : 'wide',
      fewm: get('KM_SIMFEWM', 'simfewm', 'on') === 'off' ? 'off' : 'on',
      /* b7 (r4 M1, P51): 'on' = their ball over the top that the words give to your man first ("X climbs above Y and heads it away", "X heads it
       * as far as their midfield", "K kicks it clear before Y reaches it") is drawn with the ball still in the air: it drops, bounces and comes
       * down where X (running at his own speed) meets it at head height, while Y runs at his full speed and gets there too late; the keeper's
       * ball rolls on to where he gets to it first; 'off' = b6 (the ball lies still on the ground, Y held to a walk, the header from height 0) */
      air: get('KM_SIMAIR', 'simair', 'on') === 'off' ? 'off' : 'on',
      /* b7 (r4 M2, P52): 'past' = "X heads it as far as their midfield" goes to a team-mate 55 to 60 m from your goal line (past halfway, 52.5 m),
       * who takes it within 1.5 m of where it comes down; 'b6' = the band of "heads it away" (40 to 51 m), taken within 3 m */
      far: get('KM_SIMFAR', 'simfar', 'past') === 'b6' ? 'b6' : 'past',
      /* b7 (r4 M3, P53): 'on' = a header at goal is struck in the air: the cross comes down to the man's head (2 m) and he heads it from there
       * (no touch to his feet first); at the plan stop after "X heads it at your goal." the stop picture has his header on its way, and the next
       * card's shot is that header going on; 'off' = b6 (the cross reaches his feet; he has the ball at the stop; the header struck from the ground) */
      hfly: get('KM_SIMHFLY', 'simhfly', 'on') === 'off' ? 'off' : 'on',
      /* b7 (r4 M4, P54): 'touch' = "K gets a foot to it, but your team wins it straight back" with K their keeper: his touch knocks it on to your
       * nearest man, who runs onto it; 'b6' = the keeper cuts it out and has it, your man then tackles him (play ended as the keeper's ball first) */
      wbk: get('KM_SIMWBK', 'simwbk', 'touch') === 'b6' ? 'b6' : 'touch',
      /* b7 (r4 m1, P55): 'on' = "and N scores from two metres" after a low cross: the cross goes to 2 m from the goal line, in front of the goal;
       * 'b6' = to his own place, kept 3 to 9 m out (so the shot came from about 8 m) */
      twom: get('KM_SIMTWOM', 'simtwom', 'on') === 'b6' ? 'b6' : 'on',
      /* b7 (r4 m2, P56): 'on' = E_RACE's "X gets to the ball before Y and brings it down" on a loose ball: X reaches it first (Y arrives a moment
       * later, the adapter's reach step); 'b6' = Y took it first and X tackled him */
      race: get('KM_SIMRACE', 'simrace', 'on') === 'b6' ? 'b6' : 'on',
      /* b8 (ASK-0061, P58): their counter after your lost card. 'keep' = when the engine's chain goes on with their counter ("They are breaking"),
       * the world plays it on (no "won at a safe distance" end for their won ball) and free play does not take the ball from them until the next
       * stop (P35's keep, as for their other attacks the engine goes on with); 'play' = played on, not kept (your men can win it back in free
       * play); 'off' = b7 (the counter ends "won at a safe distance"). Also when your card lost the ball and the engine made the next moment
       * theirs ("The next moment is theirs.") */
      ctr: (function () { var v = get('KM_SIMCTR', 'simctr', 'keep'); return /^(keep|play|off)$/.test(v) ? v : 'keep'; })(),
      /* b8 (ASK-0061, P60): 'on' = every other ball they win in free play (in a lead, or in the play after any card) plays on until a stop or
       * the end of play, not kept (your men can win it back); 'off' = b7 (it ends "won at a safe distance" when they win it 45 m or more from
       * your goal) */
      wonon: get('KM_SIMWONON', 'simwonon', 'on') === 'off' ? 'off' : 'on',
      /* b8 (ASK-0061, P59): the duel stop D1. 'them' = their man on the ball (not the keeper, the ball at his feet) within duelY m of your goal
       * line with one of your outfield men within duelR m of him and goal-side of him stops play for your decision; 'both' = the same for your
       * attacks; 'off' = b7 (only the world's chances C1 to C5 stop play) */
      duel: (function () { var v = get('KM_SIMDUEL', 'simduel', 'them'); return /^(them|both|off)$/.test(v) ? v : 'them'; })(),
      /* b8 (P61): 'pic' = at a world stop on their ball the scene names the man of yours the picture has nearest to their man on the ball;
       * 'engine' = b7 (the engine's marker, wherever he stands) */
      near: get('KM_SIMNEAR', 'simnear', 'pic') === 'engine' ? 'engine' : 'pic',
      duelY: +get('KM_SIMDUELY', 'simduely', '52.5') || 52.5, duelR: +get('KM_SIMDUELR', 'simduelr', '3') || 3,
      /* b8 (r5 M1, P62): 'on' = an in-air step that falls back brings the ball down over the rest of its flight (never a height change in one
       * frame; a cross still too far for the man is aimed at his run); 'b7' = b7 (the ball to the ground in one frame) */
      zdrop: get('KM_SIMZDROP', 'simzdrop', 'on') === 'b7' ? 'b7' : 'on',
      /* b8 (r5 M3, P63): 'phys' = the dropping ball of a header clearance or a keeper's take falls and bounces under gravity (a bounce at most
       * 0.55 of the height its impact speed corresponds to) and goes on at 4 to 10 m/s; 'b7' = b7 (bounce solved from the man's time, 2.6 to
       * 6 m, 1 m/s over the ground) */
      bounce: get('KM_SIMBOUNCE', 'simbounce', 'phys') === 'b7' ? 'b7' : 'phys',
      /* b8 (r5 m1, P64): 'brake' = the beaten man of a header or "gets to the ball before" card pulls up when he could not otherwise stop
       * 1.5 m short of the loose ball (he never runs over it before X has it); 'b7' = b7 (he is only re-aimed 1.5 m off once within 1.8 m) */
      rival: get('KM_SIMRIVAL', 'simrival', 'brake') === 'b7' ? 'b7' : 'brake',
      /* b9 (Eduardo's b7 playtest, bugs 1 and 6, P66): 'on' = one kick-off routine: the first moment of the match, the first fresh moment
       * after an engine goal and the first fresh moment of the second half (and of overtime) start from the kick-off picture (ball on the
       * centre spot, each team in its own half; the side that conceded kicks off after a goal, the side that did not kick off the first half
       * kicks off the second); 'b8' = the next play starts from the world's last frame (the ball in the net, the first half's last picture) */
      kick: get('KM_SIMKICK', 'simkick', 'on') === 'b8' ? 'b8' : 'on',
      /* b9 (bug 2, P67): 'on' = when the world plays on after the card and the next decision is in the same moment, the headline says the
       * play goes on (playOn below); 'b8' = the headline is built with no next decision and says the attack is over */
      hdgo: get('KM_SIMHDGO', 'simhdgo', 'on') === 'b8' ? 'b8' : 'on',
      /* b9 (bugs 3 and 8, P68): 'on' = a ball the engine hands to your next moment stays won: after offside or a foul, or when the world's last
       * frame has their man on the ball, the director stages the engine's moment (your carrier on the ball where the engine put him) instead
       * of the world's frame; and the lead of a moment you start by winning the ball keeps the ball with your team until its first stop (the
       * keep of after(), KM_SIMKEEP), with the man who won it running onto a ball the frame drew 1.2 m or more from him first; and when the
       * world plays on after such a card and its passage ends without your outfield man on the ball, the engine's handoff stands (b8's
       * 'fresh' rule dropped it); the same when the engine's chain goes on with your attack in their moment (a12 RUL-E) and the world's play
       * ends with no chance and no outfield man of yours on the ball: the chain becomes your next moment's ball (part 2, break chainfresh);
       * and when the card's play ends with their man on a ball the engine gave you, the passage ends there and the same rules hand your next
       * moment the ball (part 3, break wonend); 'b8' = the handoff picture takes the frame's holder (theirs too), the lead has no keep,
       * 'fresh' drops the handoff and the chain, and free play goes on from their man on the ball */
      wonkeep: get('KM_SIMWONKEEP', 'simwonkeep', 'on') === 'b8' ? 'b8' : 'on',
      /* b9 (bug 9, P69): 'on' = your pass to a man who is running goes to a spot ahead of him on his run (he runs on to it, the ball is weighted
       * to meet him there); 'b8' = it goes to where he is when the ball is struck (he runs past it and turns back) */
      leadto: get('KM_SIMLEADTO', 'simleadto', 'on') === 'b8' ? 'b8' : 'on',
      /* b9 (bug 10 part a, P70): 'on' = your keeper's "kicks it long" (KEEPER_LONG) is a long ball upfield over the man pressing him, landing
       * loose near your furthest man in the band the words give (55 to 65 m from his goal; "only as far as their midfield" 35 to 45 m), for
       * free play to contest; 'b8' = it falls to the last line of their-side plans (he carries it 3 m, toward his own goal) */
      longk: get('KM_SIMLONGK', 'simlongk', 'on') === 'b8' ? 'b8' : 'on',
      /* b9 (K8 trace, P71): 'carry' = "Gets under your skin" (one card rattled at the first decision of every moment): when the world plays a
       * moment from the engine's first menu (which had the rattled card, and the feed said so) to a stop, the stop's menu, the first one you see,
       * gets the rattled card (pm.js already keeps the skin at a rebuild of the same decision, p.rattledAt); 'b8' = the stop's menu has none,
       * and the feed's "one card on this menu is rattled" was about a menu you never saw */
      rattle: get('KM_SIMRATTLE', 'simrattle', 'carry') === 'b8' ? 'b8' : 'carry',
      /* b9 (bug 9, K10, P72): 'timed' = the receiver of a planned pass times his run once it is struck, so he gets to the spot with the ball
       * (the adapter's recvTimed, world.b8.rt); 'b8' = he runs there at full speed, gets there first, runs on past it and turns back */
      recv: get('KM_SIMRECV', 'simrecv', 'timed') === 'b8' ? 'b8' : 'timed',
      /* b9 (ASK-0064, P75; his words: "each moment gets four pips. Whether you consume all four or not, the next moment will start with four
       * pips"): 'moment' = the pips count your decisions in the MOMENT: each of your decisions uses one (a free one does not), across the
       * world's stops inside the moment; a new moment starts full (the engine's cap, 4; a won ball's next moment too, where the engine gave 3);
       * at a world stop the engine's chain carries the moment's count (what the page showed at your last decision, less one), and, when the
       * man on the ball is the one the engine's chain gave it to, the one-two's pass back (prev, mode and the edge that offers it); when the
       * moment's pips are spent, a stop of yours in the same moment ends the passage and the moment there (what comes next: KM_SIMPIPEND,
       * P75c) (breaks: nopipcap, nopipcarry, pipswin). Your defending decisions use no pip (the page draws the pips on your attack only),
       * and a ball won inside a moment keeps the engine's own count when the engine plays it on (a12 RUL-E: 3); both are open questions;
       * 'b8' = every world stop starts the count from zero (the pips always showed 4 and the cap never bit) */
      pips: get('KM_SIMPIPS', 'simpips', 'moment') === 'b8' ? 'b8' : 'moment',
      /* b9 (P75b, with the pips on): 'cards' = a world stop on your last pip (the engine marks it p.lastStep and builds a finish-only menu) whose
       * menu, made by pm.js from the picture, has fewer than 2 live cards or (a stop for a runner) no ball to the runner is made again without
       * the finish-only rule, so it offers the stop's own cards; the pip count is unchanged (it is still the last decision of the moment, and
       * the page says so); 'finish' = P75 alone: the finish-only menu (in 12 Cups, 17 of 26 last-pip runner stops showed HOLD alone, sim off 0 of 104) */
      piplast: get('KM_SIMPIPLAST', 'simpiplast', 'cards') === 'finish' ? 'finish' : 'cards',
      /* b9 (P75c, with the pips on): 'fresh' = when the moment's pips are spent with your man on the ball (the world wanted another stop of
       * yours), the next moment comes from the schedule, as after the engine's own last decision; 'handoff' = P75 alone: your attack is the
       * next moment, from that picture (b8's rule for a passage the world ends with your outfield man on the ball, simend=handoff) */
      pipend: get('KM_SIMPIPEND', 'simpipend', 'fresh') === 'handoff' ? 'handoff' : 'fresh',
      /* b9 (ASK-0065, P76; his words: "what comes first is the simulation and the outcomes, and then what happens after that should reflect
       * the simulation and the outcomes, not the other way around"): 'sim' = when the engine ended an attack and the world plays on to a
       * decision in the same moment, the words say what the world does next ("Calder Vale's attack is over, and Spain are counter-attacking.",
       * or "Spain's attack goes on." with the "over" taken out of the result's words); after a clean win of yours in their attack the free play
       * keeps the ball with your team until that stop (the roll said you won it); an edge the card gave your next decision goes with the
       * ball to the world's stop (breaks: nooverkeep, noovercarry, nooverwords); 'b8' = the engine's words ("the attack is over") while the moment goes on */
      over: get('KM_SIMOVER', 'simover', 'sim') === 'b8' ? 'b8' : 'sim' };
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
  var SHOT_VERB0 = /\b(?:shoots|places it|heads it (?:at|towards|toward|into|in)\b|hits it|curls it|chips it|chips the|volleys|strikes it|lobs|drives it|blasts|fires|side-foots|tries (?:a|his) shot|takes (?:a|his) shot|has a shot|slots|taps it in|tucks it|rolls it into|lifts it over|goes for goal)/;
  /* b6 (r3 m1, P45; switch KM_SIMHITS, break off): "Yamal hits the target" names the shooter too (seed 9201 32': card "Yamal shoots from 28 m" was
   * drawn as Yamal passing to Oyarzabal, who shot) */
  var SHOT_VERB = SW.hits === 'on' ? new RegExp(SHOT_VERB0.source.replace('hits it|', 'hits it|hits the target|')) : SHOT_VERB0;
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
        /* b6 (P47; switch KM_SIMDBW, break off): "Laporte wins the header, but Elliot saves it" (your free kick into the box) was drawn as the
         * keeper catching the free kick (the save beat from the taker): the cross goes to the man who wins the header, he heads it, the keeper saves */
        var hwN = after(/\bwins the header\b|\bgets his head to it\b/), HW = SW.dbw === 'on' && k === 'cross' && hwN && team(hwN) === sd && hwN !== H && kN && (kHold || kParry) && !goal && !foul && (!(won && winner) || V.men[winner].keeper);
        var tgt = HW ? hwN : recv || (k === 'cross' ? (inBox(sd) || {}).id : null), spot = mc.spot || (/^kw:/.test(mc.kind || '') && mc.lane && mc.lane.length > 1 && hyp(mc.lane[0], Hm) > 3 ? mc.lane[mc.lane.length - 1] : null), air = k === 'cross' && !/low|cut-back|square/i.test(t + ' ' + (mc.kind || ''));
        if (/cannot find a way|does not pass|holds it up/.test(t)) Q.push(carry(H, fwd(Hm, 3), [], 0.6));
        else if (won && winner && !HW) {
          var blkO = P3 && out && /\bblocks it\b/.test(t);   /* P18: a block that goes out flies off him over the named line */
          var clear = !WB && (P2 ? /heads (?:it|the cross) away|heads it out|kicks it clear|gets a foot to it/ : /heads (?:it|the cross) away|kicks it clear|gets a foot to it/).test(t);
          Q.push(pass(H, tgt, spot, { cutBy: winner, h: air ? 3 : 0, clear: clear, note: header ? 'header' : null, then: (clear || blkO) ? 'clearAway' : null, thenOut: (clear || blkO) && out, thenLine: P3 && (clear || blkO) && out ? outLn : null }));
        } else if (!HW && (kHold || (P2 && /(?:runs through|goes straight|rolls) to (?:their|your) keeper|straight to (?:their|your) keeper/i.test(t))) && kp) {
          if (KS) { var ksT = spot || (tgt && V.men[tgt]) || null; if (ksT) { var sdx = ksT.x - kp.x, sdy = ksT.y - kp.y, sdd = Math.max(1, Math.sqrt(sdx * sdx + sdy * sdy)), sk = Math.min(10, sdd * 0.5); kq = { x: kp.x + sdx / sdd * sk, y: kp.y + sdy / sdd * sk }; } }
          Q.push(pass(H, tgt, kq || spot, { cutBy: kp.id, save: true, h: air ? 3 : 0, then: 'keeperHolds' }));
        }
        else if (tgt) {
          var rm = V.men[tgt], lead = /run onto|into (?:the )?space|plays? (?:the ball |it )?through|puts \S+ through|in behind|into the box late|run into the box/i.test(t + ' ' + (c.o.label || ''));
          var pz = attN[0] && attN[0] !== H && attN[0] !== tgt && attN.indexOf(tgt) > 0 ? attN[0] : H;
          /* b7 (P55, switch KM_SIMTWOM): your low cross "and N scores from two metres" goes to 2 m out in front of the goal (seed 9421 88': the
           * card's "into the space" put the cross 7 m ahead of where Oyarzabal stood, wide at x 61, and he scored from 28 m) */
          if (SW.twom === 'on' && k === 'cross' && !air && /\bscores from two metres\b/.test(t)) spot = { x: clamp(rm.x, 31, 37), y: sd === 'you' ? L - 2 : 2 };
          else if (!spot && (zup || lead) && !air) { if (lead || up(sd, rm) < zup - 1) spot = fwd(rm, lead ? 7 : 0); }
          else if (spot && lead && up(sd, spot) < up(sd, rm) + 5) spot = { x: spot.x, y: sd === 'you' ? rm.y + 5 : rm.y - 5 };
          /* b9 (bug 9, K10, P69; KM_SIMLEADTO=b8 as b8, break noleadto): his 27' "Yamal passes it across the pitch to Baena (44 m)": Baena was
           * running at up to 7 m/s, the card's words have no "run onto" so the pass had no spot and went to where he was, and he ran 3.2 m on
           * past where it stopped and turned back for it. A pass to a man who is running (over 2 m/s in the last frame) now goes to a spot
           * ahead of him on his run, one second of it (3 to 8 m); the world's pass step sends him to the spot and weights the ball to meet him
           * there (the passer waits while he cannot make it, as for "run onto"). Not past the offside line when he is onside. */
          if (!spot && !air && !goal && pz === H && SW.leadto !== 'b8' && SW.brk !== 'noleadto') {
            var rsp = Math.sqrt(rm.vx * rm.vx + rm.vy * rm.vy);
            if (rsp > 2) {
              var ldD = clamp(rsp, 3, 8), lq = { x: clamp(rm.x + rm.vx / rsp * ldD, 2, W - 2), y: clamp(rm.y + rm.vy / rsp * ldD, 2, L - 2) };
              var dUps = side(V, def).map(function (m) { return up(sd, m); }).sort(function (a, b) { return b - a; }), offL = Math.max(dUps.length > 1 ? dUps[1] : L, L / 2, up(sd, V.ball));
              if (up(sd, rm) <= offL && up(sd, lq) > offL - 0.5) { var uq = Math.max(up(sd, rm), offL - 0.5); lq.y = sd === 'you' ? uq : L - uq; }
              if (hyp(lq, rm) > 1.5) { spot = lq; LOG.leadTo = (LOG.leadTo || 0) + 1; }
            }
          }
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
      /* b6 (r3 M2, P42; switch KM_SIMCROSS, break off): THEIR CROSS MOMENT (the engine's box decision on a cross or a low cross; after() passes
       * c.xc = { via, target, crosser } from the scene). The crosser has the ball on the flank (b5 drew every shot from there, by him). Now the
       * cross goes to the man the scene names (the target): his header (a high cross) or his shot (a low one) is the shot the words settle, a
       * defender or the keeper who wins it cuts out that cross, a foul is on him after it arrives, and "X heads it at your goal." with nothing
       * after it is the cross to X and a stop: the engine's own next decision (your keeper against the header, via 'header') follows. */
      var XC = c.xc && c.xc.target && V.men[c.xc.target] && team(c.xc.target) === sd && c.xc.target !== H ? c.xc : null, xT = XC ? XC.target : null, xAir = !!(XC && XC.via === 'cross');
      if (XC) { tg2 = xT; cross = true; var shX = after(/\bscores\b/) || after(SHOT_VERB); shooter = shX && team(shX) === sd ? shX : xT; }
      /* the cross goes to a spot in the box near the man it is for (he runs onto it): his own place when he is already 6 to 12 m out (a low cross
       * 3 to 9 m) and within 11 m of the middle, else the nearest such place (seed 9013 87': Darren was 30 m out and headed it from there) */
      /* b7 (r4 m1, P55; switch KM_SIMTWOM, break b6): "N scores from two metres" (a low cross across the six-yard box): the cross goes to 2 m out,
       * in front of the goal (x 31 to 37), so the shot is from about 2 m (b6 kept the spot 3 to 9 m out: 4 of 4 drawn from about 8 m) */
      var x2m = SW.twom === 'on' && XC && !xAir && /\bscores from two metres\b/.test(t);
      var xSpot = function (to) { var m = V.men[to]; if (x2m && to === xT) return { x: clamp(m.x, 31, 37), y: sd === 'you' ? L - 2 : 2 };
        var dp = clamp(L - up(sd, m), xAir ? 6 : 3, xAir ? 12 : 9); return { x: clamp(m.x, 23, 45), y: sd === 'you' ? L - dp : dp }; };
      var xPass = function (to) { return pass(H, to, xSpot(to), { h: xAir ? 3 : 0, note: xAir ? 'cross' : 'low cross' }); }, hdr = XC ? xAir : header;
      var xd = (c.o.actor && team(c.o.actor.id) === def && V.men[c.o.actor.id] && !V.men[c.o.actor.id].keeper) ? c.o.actor.id : defO[0] || null;
      var xStop = XC && /\bheads it at your goal\.\s*$/.test(t) && after(/\bheads it at your goal\.\s*$/) === xT ? xT : null;
      /* b6 (r3 M1, P41; switch KM_SIMHEAD, break ground): a header clearance on a loose ball ("Laporte jumps for the header before Billy gets to
       * it": "Laporte climbs above Billy and heads it away", "Cubarsí heads it as far as their midfield") was drawn as Billy taking the ball first
       * and Laporte tackling him and keeping it where he was (32 of 62 their balls over the top in r3). Now Laporte gets to the ball first (Billy
       * arrives a moment later) and heads it 10 m or more, into the band the words make true, to a team-mate (the adapter's header step). The
       * keeper's "kicks it clear before Tyler reaches it" the same way: he gets to the ball first, then kicks it to a team-mate (P23's throw). */
      var HD = SW.head === 'air' && !cross && !V.owner && won && winner && V.men[winner] && !V.men[winner].keeper && /\bheads it (?:away|as far as)\b|\bclimbs above\b/.test(t) && !out && !goal && !foul;
      var KC = SW.head === 'air' && !cross && !V.owner && won && winner && kp && winner === kp.id && /\bkicks it clear before\b/.test(t) && !out && !goal && !foul;
      var rival = (V.H0 && team(V.H0) === sd) ? V.H0 : attN[0] || null;
      /* b7 (r4 m2, P56; switch KM_SIMRACE, break b6): E_RACE (a ball over your defence) "Cubarsí gets to the ball before Reggie and brings it down"
       * was drawn as Reggie taking the ball and Cubarsí tackling him (seed 9404 40'). Now Cubarsí gets to the loose ball first (the reach step:
       * the ball comes down in front of him, Reggie a moment behind) and keeps it */
      var RC = SW.race === 'on' && !cross && !V.owner && won && winner && V.men[winner] && !V.men[winner].keeper && team(winner) === def && /\bgets to the ball before [A-ZÀ-Þ][\wÀ-ɏ'\-]+ and brings it down\b/.test(t) && !out && !goal && !foul;
      var fmA = SW.fewm === 'on' && /\bgets to the ball first, but only kicks it a few metres\b/.test(t) ? /([A-ZÀ-Þ][\wÀ-ɏ'\-]+) has it\b/.exec(t) : null, fmBy = fmA ? after(/\bgets to the ball first, but only kicks it a few metres\b/) : null, fmTo = fmA ? named.filter(function (i) { return team(i) === sd && V.men[i].name.split(' ')[0] === fmA[1]; })[0] || null : null;
      var FM = !!(fmBy && fmTo && team(fmBy) === def && V.men[fmBy] && V.men[fmTo] && !goal && !foul);
      var kfH = V.owner || V.H0 || null, KF = SW.kfeet === 'on' && kfH && V.men[kfH] && team(kfH) === def && won && winner && winner !== kfH && V.men[winner] && !goal && !out && !foul && new RegExp('\\b' + V.men[kfH].name.split(' ')[0] + ' (?:plays|passes|rolls|throws|kicks|chips|gives) it\\b').test(t);   /* the keeper has the ball, or it is at his feet (H0: he collects it first) */
      if (goal) { if (shooter !== H) Q.push(XC ? xPass(shooter) : pass(H, shooter, null, { feet: true })); Q.push(shot(shooter, 'goal', null, null, { header: hdr })); }
      else if (offT !== undefined) { if (offT) Q.push(pass(H, offT, null, {})); Q.push({ do: 'end', why: 'offside' }); }
      else if (foul && actor) { if (XC) Q.push(xPass(xT)); Q.push({ do: 'tackle', by: actor, foul: true }); }
      /* b6 (P49; switch KM_SIMFEWM, break off): BOX_CLEAR's mixed result "Cucurella gets to the ball first, but only kicks it a few metres. The
       * ball drops at the edge of your box, and Álvarez has it" was drawn as Messi carrying on to your goal line (seed 9034 107'): Cucurella
       * gets to the ball (takes it off Messi, or reaches it first), kicks it a few metres to where Álvarez is, and Álvarez takes it */
      else if (FM) { Q.push(V.owner && V.owner !== fmBy ? { do: 'tackle', by: fmBy, foul: false } : { do: 'reach', by: fmBy, rival: H }); var fmM = V.men[fmTo], fmD = Math.max(1, hyp(fmM, V.ball)), fmK = Math.min(1, 9 / fmD); Q.push(pass(fmBy, fmTo, { x: V.ball.x + (fmM.x - V.ball.x) * fmK, y: V.ball.y + (fmM.y - V.ball.y) * fmK }, { note: 'clear' })); Q.push({ do: 'collect', who: fmTo }); }
      else if (xStop && SW.hfly === 'on') { var xP = xPass(xT); xP.headAt = true; Q.push(xP); Q.push({ do: 'hstrike', by: xT }); }   /* b7 P53: the header is on its way at the stop */
      else if (xStop) Q.push(xPass(xT));
      else if (XC && out && !kN && /cannot head it cleanly|header goes wide|goes wide|over the bar/.test(t) && !/gets his head to the cross first|gets a touch on the (?:low )?cross/.test(t)) { Q.push(xPass(shooter)); Q.push(shot(shooter, wideO, null, null, { header: xAir })); }
      else if (XC && out && xd && /gets his head to the cross first|gets a touch on the (?:low )?cross/.test(t)) Q.push(pass(H, xT, xSpot(xT), { cutBy: xd, h: xAir ? 3 : 0, clear: true, note: xAir ? 'header' : null, then: 'clearAway', thenOut: true, thenLine: P3 ? outLn : null }));
      else if (XC && kN && (kHold || kParry) && !/\bcross\b/.test(t)) { Q.push(xPass(shooter)); Q.push(shot(shooter, kHold ? (TH ? 'heldOn' : 'held') : 'parry', kp.id, reb, { header: xAir, out: out })); }
      else if (out && /aim for|shoots|hits it|header goes|goes wide|over the bar/.test(t) && !cross) Q.push(shot(H, wideO, null, null, { header: header }));
      else if (kN && /comes out/.test(t) && out) Q.push(carry(H, { x: Hm.x < 34 ? 12 : 56, y: f > 0 ? L - 4 : 4 }, [], 1.2, kp.id));
      else if (P1 && kN && /takes the ball (?:off|from)|smothers|dives at (?:his|the) feet/.test(t)) { Q.push({ do: 'tackle', by: kp.id, foul: false }); Q.push(TH ? { do: 'throw', by: kp.id, up: thUp } : { do: 'end', why: 'keeper' }); }   /* P19: and throws it out when the words say so */
      else if (kN && cross) Q.push(pass(H, tg2, null, { cutBy: kp.id, save: true, h: /low/.test(t) ? 0 : 3, then: kHold ? (TH ? 'keeperCatch' : 'keeperHolds') : (P2 && !out) ? 'parryLoose' : (P3 && outLn === 'touch') ? null : 'punchCorner', punchLine: SW.brk !== 'punchline' }));
      else if (kN && (kHold || kParry)) { if (shooter !== H) Q.push(pass(H, shooter, null, { feet: true })); Q.push(shot(shooter, kHold ? (TH ? 'heldOn' : 'held') : 'parry', kp.id, reb, { header: header, out: out })); }
      else if ((P1 ? /blocks the shot|foot to the shot|in front of the shot|the ball hits [A-Z]/ : /blocks the shot|foot to the shot/).test(t) && (winner || (P1 && defO[0]))) Q.push(shot(H, 'blocked', winner || defO[0], null, { out: P3 ? false : out }));
      /* b2 P23 (break kclear; sim_check C10 "keeper clears"): your keeper "kicks it clear before Tyler reaches it. Your team has the ball, and your
       * attack starts in your half" was drawn as the keeper winning it and carrying it out; now he wins it and kicks it to a team-mate where
       * the words put your ball (the same step as P19's throw, kicked) */
      else if (HD) { var hdFar = SW.far === 'past' && /\bheads it as far as their midfield\b/.test(t), hdS = { do: 'header', by: winner, rival: rival, lo: hdFar ? 55 : 40, hi: hdFar ? 60 : 51 };   /* P41: 40 to 51 m from your goal: in midfield by the game's zones and in your half; b7 P52: "as far as their midfield" 55 to 60 m (past halfway) */
        if (hdFar) hdS.far = true; if (SW.air === 'on') hdS.drop = true; Q.push(hdS); }   /* b7 P51: the ball in the air */
      else if (RC) { var rcS = { do: 'reach', by: winner, rival: rival }; if (SW.air === 'on') rcS.drop = true; Q.push(rcS); }
      else if (KC) { var kcS = { do: 'reach', by: kp.id, rival: rival }; if (SW.air === 'on') kcS.drop = true; Q.push(kcS); Q.push({ do: 'throw', by: kp.id, up: thUp, kick: true }); }
      else if (SW.brk !== 'kclear' && won && winner && kp && winner === kp.id && /\bkicks it clear\b/.test(t) && !out) { Q.push({ do: 'tackle', by: kp.id, foul: false }); Q.push({ do: 'throw', by: kp.id, up: thUp, kick: true }); }
      /* b4 (yourbox; C4 seed 9012): "Cubarsí reads the low cross and gets to it first. Your team has the ball" was drawn as a header on to a
       * team-mate 20 m away that never arrived (the ball rolled loose for 7 s). A defender who wins a cross without heading or clearing it keeps it. */
      else if (won && winner && cross && SW.brk !== 'yourbox' && !header && !/\bclear|\bheads\b|punch|away\b/.test(t)) Q.push(pass(H, tg2, null, { cutBy: winner, h: /low/.test(t) ? 0 : 3 }));
      else if (won && winner && cross) Q.push(pass(H, tg2, null, { cutBy: winner, h: 3, clear: /heads|clear/.test(t), note: header ? 'header' : null, then: 'headToMate', headZone: SW.brk === 'yourbox' ? null : lastZone(t), firm: SW.head === 'air' || undefined }));
      /* b6 (P46; switch KM_SIMKFEET, break off): keeper_to_feet "Simón plays it short to Cubarsí before Danny gets there" was drawn as Cubarsí
       * walking to his keeper and tackling him; it is the keeper's pass to Cubarsí */
      else if (KF) Q.push(pass(kfH, winner, null, { feet: true }));
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
      /* b9 (bug 10 part a, P70; KM_SIMLONGK=b8 as b8, break nolongk): his 40' "Simón kicks it long, over Elliot, and the danger is over." (clean
       * win by 11) fell to the last line below, a carry "forward" for THEIR attack: Simón ran 4.7 m back toward his own goal line, then free play
       * took it upfield. The keeper's long kick is now a long ball over the man pressing him, landing loose (nobody's yet: "you give the ball
       * away even when it works", the card's read) near your furthest outfield man inside the band the words give: 55 to 65 m from his goal,
       * "but only as far as their midfield" 35 to 45 m. "Kicks it against X" (the bad result) is not this (X blocks it, as before). */
      else if (SW.longk !== 'b8' && SW.brk !== 'nolongk' && H && V.men[H] && V.men[H].keeper && team(H) === def && /\bkicks it long\b/.test(t) && !goal && !foul && !out) {
        var lkMid = /only as far as/.test(t), lkLo = lkMid ? 35 : 55, lkHi = lkMid ? 45 : 65;
        var lkM = side(V, def, true).sort(function (a, b) { return up(def, b) - up(def, a); })[0] || null;
        var lkU = lkM ? clamp(up(def, lkM), lkLo, lkHi) : (lkLo + lkHi) / 2, lkX = lkM ? clamp(lkM.x, 10, W - 10) : 34;
        Q.push(pass(H, null, { x: lkX, y: def === 'you' ? lkU : L - lkU }, { h: 6, note: 'clear' }));
        LOG.longKick = (LOG.longKick || 0) + 1;
      }
      else if (cross || /crosses it|gets his head to it first/.test(t)) { if (/takes it wide/.test(t)) Q.push(carry(H, { x: Hm.x < 34 ? 6 : W - 6, y: Hm.y + f * 6 }, [], 1.2)); Q.push(pass(H, tg2, null, { h: /low/.test(t) ? 0 : 3, note: /low/.test(t) ? 'low cross' : 'cross' })); }
      else { var dq2 = fwd(Hm, c.ev.band === 'good' ? 3 : 11); Q.push(carry(H, dq2, past.length ? past : actor && /past|too late|mistimes|misses|cannot/.test(t) ? [actor] : [], carT(Hm, dq2))); }
    }
    if (sd === 'them' && TH && Q.length && (Q[Q.length - 1].outcome === 'heldOn' || Q[Q.length - 1].then === 'keeperCatch')) Q.push({ do: 'throw', by: kp.id, up: thUp });
    var hold = false;
    /* b4 (r1 item 2): the defender's touch, then the nearest of your outfield men wins it back from him where it was */
    /* b7 (r4 M4, P54; switch KM_SIMWBK, break b6): when the man who "gets a foot to it" is their keeper (seed 9417 77': "Lee gets a foot to it,
     * but your team wins it straight back"), b6 gave him the ball (the pass cut out) and the world ended play as the keeper's ball before your
     * man could win it back (C14). His touch now knocks the ball up to 6 m on toward your nearest man (to 1.5 m short of him; wrap_world.js
     * touchLoose; b8 note fix, r5 m8), who runs onto it; the keeper never has it */
    if (WB && won && winner && V.men[winner]) { var bk = nearest(V, V.men[winner], sd, side(V, sd).filter(function (m) { return m.keeper; }).map(function (m) { return m.id; }));
      var qL = Q[Q.length - 1], wbK = bk && SW.wbk === 'touch' && V.men[winner].keeper && qL && qL.do === 'pass' && qL.cutBy === winner && !qL.then;
      if (wbK) { qL.then = 'touchLoose'; qL.touchTo = bk.id; Q.push({ do: 'collect', who: bk.id, near: 1.4, secs: 4 }); hold = true; }
      else if (bk) { Q.push({ do: 'tackle', by: bk.id, foul: false }); hold = true; } }
    /* b4 (r1 item 1, break reb; sim_check C13, 42 of 45 wrong on b3): the man the words say gets to the loose ball first runs onto it, and
     * nobody else picks it up while he does (the world's collect step holds the pickup; a ball in flight is never picked up). Put right after
     * the shot it comes from, so a later step of his (a second shot) starts with him on the ball */
    var rbAt = /gets to (?:the (?:loose )?ball|it) first|has the rebound|gets his head to it first/.exec(t), rbOn = rbAt ? (SW.names === 'wide' ? /([A-ZÀ-Þ][\wÀ-ɏ'\-]+) has (?:it|the ball)\b/ : /([A-Z][\wÀ-ɏ'\-]+) has (?:it|the ball)\b/).exec(t.slice(rbAt.index)) : null;
    if (SW.brk !== 'reb' && reb && V.men[reb] && !goal && !out && !foul && !HD && !(rbOn && rbOn[1] !== V.men[reb].name.split(' ')[0])) {   /* b6: not after a header (P41: "Your team gets to the ball first" names no man; the header step gives it to one) */ var ri = -1; Q.forEach(function (q, i) { if (q.do === 'shot' && q.rebound === reb) ri = i; }); Q.splice(ri >= 0 ? ri + 1 : Q.length, 0, { do: 'collect', who: reb, near: 1.4, secs: 4 }); hold = true; }
    /* b4 (r1 items 3 and 8, break yourbox; sim_check C15 and C4E): the man on the ball when the card's steps are done runs on to the zone the
     * sentence names last ("into your box", "in midfield"), if he is not there yet: the words are what the dice settled, so the picture ends
     * there. Not when the ball goes out, a goal, a foul, offside, a keeper's catch or throw, or the clock. */
    var zl = SW.brk === 'yourbox' ? null : lastZone(t), qEnd = Q.length ? Q[Q.length - 1] : null;
    if (zl && !goal && !out && !foul && !kHold && !TK && !TH && !HD && !/\bis offside\b/i.test(t) && !(qEnd && (qEnd.do === 'end' || qEnd.do === 'throw' || qEnd.then === 'keeperHolds' || qEnd.then === 'keeperCatch'))) Q.push({ do: 'tozone', zone: zl, firm: SW.tozone === 'firm' || undefined });
    /* b6 (P42): the shot of the man who won the header at the plan stop is his header */
    if (c.xhead) Q.forEach(function (q) { if (q.do === 'shot' && q.from === c.xhead) q.header = true; });
    /* b7 (r4 M3, P53; switch KM_SIMHFLY, break off): a header at goal is struck in the air. (a) A cross in the air to a man whose next step
     * is his header at goal comes down to his head and he heads it from there (the adapter: headAt on the cross, inflight on the shot). (b)
     * After the plan stop whose picture has X's header on its way (c.xfly), X's first shot in this card is that header going on, and nobody
     * collects the ball first (noH0); when this card has no shot of his, the adapter gives him the ball where it is (counted, w.provMiss). */
    var xFly = false;
    if (SW.hfly === 'on') {
      for (var qi = 0; qi + 1 < Q.length; qi++) {   /* (your free kick into the box has a collect of his between: it goes; when the ball does not reach his head the shot step's own collect runs) */
        var qa = Q[qi], qc = Q[qi + 1] && Q[qi + 1].do === 'collect' && Q[qi + 1].who === qa.to && !Q[qi + 1].near ? 1 : 0, qb = Q[qi + 1 + qc];
        if (qa.do === 'pass' && (qa.h || 0) > 0 && !qa.cutBy && qa.to && qb && qb.do === 'shot' && qb.from === qa.to && qb.header) { qa.headAt = true; qb.inflight = true; if (qc) Q.splice(qi + 1, 1); }
      }
      if (c.xfly && c.xhead) { var qx = Q.filter(function (q) { return q.do === 'shot' && q.from === c.xhead; })[0]; if (qx && Q[0] === qx) { qx.inflight = true; xFly = true; } }
    }
    var lastQ = Q[Q.length - 1], defl = P3 && lastQ && lastQ.do === 'shot' && lastQ.outcome === 'blocked';   /* Codex r4 item 1: a block that goes out flies off him */
    if (out && !goal) Q.push(P3 ? { do: 'out', line: outLn, up: true, fast: defl || undefined } : P2 && /corner|goal kick|byline|over the bar/i.test(t) ? { do: 'out', line: 'goal' } : P2 && /throw-in/i.test(t) ? { do: 'out', line: 'touch' } : { do: 'out' });
    return { side: sd, card: { id: c.o.id, label: c.o.label || null, family: c.kind }, band: c.ev.band || null, kind: c.ev.kind || null, steps: Q,
      hold: hold || undefined, noH0: (HD || KC || RC || xFly) || undefined, stopAfter: xStop ? (SW.hfly === 'on' ? { who: xStop, why: 'header', fly: true } : { who: xStop, why: 'header' }) : undefined, xc: XC ? { via: XC.via, target: XC.target } : undefined,
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
  var DANGER_RX = [/(?::|,? and) the danger is over/gi, /\s*The danger is over\./g];   /* b9 (P76) */
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
    if (why === 'pips') return (holderName ? holderName + ' has the ball. ' : '') + 'That was the last decision of this moment.';   /* b9 (P75) */
    return 'Play stops here.';
  }

  /* ------------------------------------------------------------------ the passage */
  var STATE = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var LOG = { errs: [], passages: 0, decisions: 0, stops: 0, ends: {}, rules: {}, words: { over: 0, zone: 0, holder: 0 } };
  var CFG = null;   /* install(): { World, P (pitch), M (model), PM, O, PH, X } */
  /* KM_SIMT (node only, diagnosis): a JSON object of world switches merged over the release's defaults, e.g. '{"HURRY":1.6}' */
  var SIMT = {}; try { if (typeof process !== 'undefined' && process.env && process.env.KM_SIMT) SIMT = JSON.parse(process.env.KM_SIMT); } catch (e) { SIMT = {}; }
  function S(st) { var m = STATE.get(st); if (!m) { m = { pass: null, nextPic: null, n: 0 }; STATE.set(st, m); } return m; }
  /* b9 (ASK-0064, P75): THE PIPS BELONG TO THE MOMENT. leftOf is the page's own count (play.html decisionsLeft, PIPS-BEGIN): null on their
   * attack, 1 on the last step, else the chain's cap (a won ball's 3, else the engine's 4; Patience 6) plus extra decisions, less your
   * decisions in the chain. pipPre keeps it as the page showed it at the decision in hand (begin() runs before X.choose), pipCount turns it
   * into what is left after the card (one less unless the card was free; more if the card's result granted an extra decision), and
   * pipLeft is what is left in this moment (p.index), or null when no decision of yours has used one yet (the moment starts full). */
  function leftOf(st, p) {
    if (!st || !p || !p.moment || !p.moment.sit || p.moment.sit.who !== 'you' || !st.chainMode || !CFG || !CFG.X) return null;
    if (p.lastStep) return 1;
    var ch = st.chain && st.chain.next === 'zone' ? st.chain : null, used = ch ? ch.youSteps || 0 : 0;
    var cap = ((st.chain && st.chain.cap) || CFG.X.chainCapOf(st)) + (st.fx ? st.fx.capBonus || 0 : 0);
    return Math.max(1, cap - used);
  }
  function pipPre(st, p, m) { if (SW.pips === 'b8' || !p || typeof p.index !== 'number') return; m.pipPre = { idx: p.index, left: leftOf(st, p), bonus: st.fx ? st.fx.capBonus || 0 : 0 }; }
  function pipCount(st, p, o, who) {
    if (SW.pips === 'b8' || !p || typeof p.index !== 'number') return;
    var m = S(st), pre = m.pipPre && m.pipPre.idx === p.index ? m.pipPre : null; m.pipPre = null;
    if (!m.pip || m.pip.idx !== p.index) m.pip = { idx: p.index, left: null, n: 0 };
    if (who !== 'you' || !pre || pre.left === null) return;
    var bNow = st.fx ? st.fx.capBonus || 0 : 0;
    m.pip.left = pre.left - (o && o.fxFreeUsed ? 0 : 1) + Math.max(0, bNow - (pre.bonus || 0)); m.pip.n++;
  }
  function pipLeft(st, p) { var m = S(st); return SW.pips !== 'b8' && m.pip && p && m.pip.idx === p.index ? m.pip.left : null; }
  function pipFull(st) { return CFG.X.chainCapOf(st) + (st.fx ? st.fx.capBonus || 0 : 0); }
  /* what chainAt carries to a stop of yours: the moment's count, and the engine's chain the card left (its attack goes on), or the ball it
   * handed your next moment (a clean win of yours that ended their attack: E1.handoff with no chain) */
  function pipCx(st, p, E1) { return { left: pipLeft(st, p), full: pipFull(st), E1c: E1.chain && E1.chain.next === 'zone' ? E1.chain : (!E1.chain && E1.handoff && E1.handoff.next === 'zone' ? E1.handoff : null) }; }
  function seedOf(st, n) { var h = 2166136261 >>> 0, s = String(st.seed) + ':' + st.n + ':' + n; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  var OPEN_THEM = ['over_the_top', 'caught_square', 'their_winger', 'tired_gap', 'their_dribbler', 'their_playmaker', 'their_counter'];
  function firstName(p) { return String((p && p.name) || '').split(' ')[0]; }

  /* begin(st, p, pic): the world starts from the picture of this decision (the frozen picture the menu was made on); nothing if a passage
   * is already running. pic: { pos: {id: {x, y}}, ball: {x, y}, holder } */
  function begin(st, p, pic) {
    if (!SW.on || !CFG) return null;
    var m = S(st); pipPre(st, p, m); if (m.pass) return m.pass;
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
    /* b8 (P58, P59): what the adapter reads for the new defending stops (ctr is set per card in after() and lead()) */
    P.w.b8 = { ctr: false, duel: SW.duel === 'off' || SW.brk === 'noduel' ? null : { side: SW.duel, y: SW.duelY, r: SW.duelR, gs: 1 }, zd: SW.zdrop === 'on', bnc: SW.bounce === 'phys', yb: SW.rival === 'brake', rt: SW.recv !== 'b8' && SW.brk !== 'norecv' };
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
  function chainAt(P, pic, stop, lead, n, cx) {
    var h = pic.holder, b = pic.ball, hp = P.player[h], tm = P.teamOf[h];
    /* b9 (ASK-0064, P75; KM_SIMPIPS=b8 as b8, break nopipcarry): your stop carries the moment's count: cx.left is what the page showed at
     * your last decision in this moment less one (pipCount), so youSteps is set for the page and the engine (the last step's finish-only
     * menu, the cap) to read that many left out of the engine's cap (cx.full: 4, Patience 6, plus extra decisions); cx.left null (no
     * decision of yours has used one in this moment) starts full. When the man on the ball is the one the engine's chain gave it to
     * (cx.E1c.carrier), that chain's pass back (prev), mode (the one-two's 'onetwo') and edges (carried: the one-two's, which offers the pass
     * straight back) come too. b9 (ASK-0065, P76; KM_SIMOVER=b8 as b8, break noovercarry): with another man of yours on the ball, the edges
     * the card gave your next decision still go with the ball (cx.E1c is also the engine's handoff after a clean win of yours) */
    if (tm === 'you' && cx && SW.pips !== 'b8') {
      var c75 = { next: 'zone', zone: zoneOf(b), carrier: hp, youSteps: 0, step: n, text: lead, carried: [], prev: null, mode: null, lastSit: 'dots' };
      if (SW.brk !== 'nopipcarry' && cx.left !== null && cx.left !== undefined) { c75.youSteps = Math.max(0, cx.full - Math.max(1, cx.left)); LOG.pipCarry = (LOG.pipCarry || 0) + 1; }
      var E1c = cx.E1c || null, same = !!(E1c && E1c.carrier && hp && E1c.carrier.id === hp.id);
      /* (the mode only when it is the one-two's: any mode takes the stop's menu away from pm.js, the picture's menu, to the engine's own;
       * the first smoke run carried every mode and C16, C18 and C25 failed on those stops) */
      if (same && SW.brk !== 'nopipcarry') { c75.prev = E1c.prev || null; c75.mode = E1c.mode === 'onetwo' ? 'onetwo' : null; c75.carried = (E1c.carried || []).slice(); if (E1c.mode === 'onetwo') LOG.oneTwoCarry = (LOG.oneTwoCarry || 0) + 1; }
      else if (E1c && SW.over !== 'b8' && SW.brk !== 'noovercarry' && (E1c.carried || []).length) { c75.carried = E1c.carried.slice(); LOG.edgeCarry = (LOG.edgeCarry || 0) + 1; }
      return c75;
    }
    /* (b8, and KM_SIMPIPS=b8: every stop of yours starts the count from zero, forgets the one-two's pass back and the edges) */
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
    /* b6 (P42): their cross moment, from the scene the engine built (model.js boxMoment: cast.foil is the man the cross is for) */
    var mo = p.moment || {}, xc = null, xh = P.xhead || null, xf = !!P.xfly; P.xhead = null; P.xfly = false;
    if (SW.cross === 'on' && who === 'them' && (mo.via === 'cross' || mo.via === 'lowcross') && mo.cast && mo.cast.foil && mo.cast.foil.id && P.teamOf[mo.cast.foil.id] === 'them') xc = { via: mo.via, target: mo.cast.foil.id, crosser: mo.cast.crosser && mo.cast.crosser.id || null };
    var V = viewOf(P), plan = planFrom(V, { side: who, o: o, ev: ev, names: P.names, kind: family(o, who), xc: xc, xhead: xh, xfly: xf });
    if (SW.brk === 'noplan') plan.steps = [];
    if (SW.brk === 'outwon' || SW.brk === 'endframe') plan.brk = SW.brk;
    var rec = { dec: P.decs++, side: who, card: o.id, plan: plan, textEngine: ev.text, pre: pre || null, teamOf: P.teamOf, first: P.first };
    pipCount(st, p, o, who);   /* b9 (P75): this card is one of the moment's decisions */
    /* b5 (r2 M4, instrumentation for sim_check C23): whose attack the engine's chain goes on with after this card (null: the engine ended it) */
    rec.engOn = E1.chain ? (E1.chain.next === 'zone' ? 'you' : (E1.chain.next === 'tzone' || E1.chain.next === 'box') ? 'them' : null) : null;
    /* b8 (P58, ASK-0061; switch KM_SIMCTR, break noctr): the engine goes on with their counter after your card ("They are breaking. You have to
     * stop it."): the world plays it on instead of ending "won at a safe distance"; with 'keep' free play does not take the ball from them before
     * the next stop (the engine's dice gave it to them and its attack goes on, P35) */
    /* (also when your card lost the ball and the engine made the next moment theirs: ev.kind 'lost', st.forcedTheirs, "The next moment is
     * theirs."; b7 ended it "won at a safe distance" and stale() then dropped the forced moment, so their counter was lost both ways) */
    rec.engNext = E1.chain ? E1.chain.next || null : null;
    /* b9 (P75, sim_check C47): the engine's one-two (its next step is the pass straight back, on the man the ball went to) */
    if (E1.chain && E1.chain.next === 'zone' && E1.chain.mode) { rec.engMode = E1.chain.mode; rec.engCarrier = E1.chain.carrier ? E1.chain.carrier.id : null; }
    /* b9 (P76, sim_check C50): the edges the card gave your next decision (the engine's chain, or its handoff after a clean win of yours) */
    var E1e = E1.chain && E1.chain.next === 'zone' ? E1.chain : (!E1.chain && E1.handoff && E1.handoff.next === 'zone' ? E1.handoff : null);
    if (E1e && (E1e.carried || []).length) { rec.engCarried = E1e.carried.map(function (c) { return c.id; }); rec.engCarrierAny = E1e.carrier ? E1e.carrier.id : null; }
    rec.engLost = who === 'you' && (ev.kind === 'lost' || !!st.forcedTheirs);
    var ctrEng = (rec.engNext === 'counter' || rec.engLost) && SW.ctr !== 'off' && SW.brk !== 'noctr';
    if (w.b8) w.b8.ctr = ctrEng || (SW.wonon === 'on' && SW.brk !== 'nowonon');
    if (ctrEng && SW.ctr === 'keep' && !rec.engOn) rec.engOn = 'them';
    rec.ctr = w.b8 && w.b8.ctr ? (ctrEng ? 'counter' : 'wonon') : null;
    var t0 = w.t;
    w.apply(plan);
    var jA = w.frames.length - 1, guard = 0;
    /* b6 (P42): "X heads it at your goal." and the engine goes on with its box step: the world plays the cross to X and stops there (no tail, no
     * free play); the engine's own decision (your keeper against the header) is the next one, from that picture */
    var pStop = plan.stopAfter && E1.chain && E1.chain.next === 'box' && !scored && typeof w.stopHere === 'function' ? plan.stopAfter : null;
    /* b7 (P53): with pStop.fly the stop is made with X's header on its way (the ball in the air from him, nobody on it); X on the ball (the cross
     * reached his feet: the b6 picture) still stops, as b6 did */
    if (pStop) { while (w.phase === 'plan' && !w.ended && guard++ < 30 * 60) w.step();
      var pFly = pStop.fly && !w.owner && typeof w.flightFrom === 'function' && w.flightFrom() === pStop.who;
      if (w.ended || (w.owner !== pStop.who && !pFly)) pStop = null; else if (pStop.fly && !pFly) LOG.flyMiss = (LOG.flyMiss || 0) + 1; else if (pFly) pStop = Object.assign({}, pStop, { inAir: true }); }
    if (!pStop && typeof w.busy === 'function') while (w.busy() && !w.ended && guard++ < 30 * 60) w.step();
    /* b9 (bug 3, K7, P68 part 3; KM_SIMWONKEEP=b8 as b8, break wonend): the engine gave your team the ball in their attack (its chain goes on
     * with your attack, or it hands your next moment the ball) and the card's play ends with THEIR man on the ball (BOX_KEEP_REACT: "Simón
     * ... saves it. Your team has the ball, and your attack starts in your half.", the world drew the save and their striker on the rebound):
     * b8 then played free play from there, their man's chance was the next stop, the next decision was theirs and they scored (seeds 9412
     * 87' and 9413 60', Cups 401 to 416). Now the passage ends where the card's play ends, and the rules below hand your next moment the
     * ball (part 2 for the chain, part 1 for the handoff) with the director staging it from this frame (their man on the ball: stageN) */
    var wonT = (rec.engOn === 'you' || !!(E1.handoff && !E1.chain)) && who === 'them' && !scored && !pStop && !w.ended && w.owner && P.teamOf[w.owner] === 'them' && SW.wonkeep !== 'b8' && SW.brk !== 'wonend';
    if (wonT && w.end) { rec.wonEnd = w.owner; w.end('won (engine)'); LOG.wonEnd = (LOG.wonEnd || 0) + 1; }
    var jP = w.frames.length - 1, fP = frameNow(P, jP), possP = fP.holder ? P.teamOf[fP.holder] : (P.lastPoss || who);
    var stop = null; guard = 0;
    /* b5 (r2 M4, break undo / ?simkeep=off): the dice left team T on the ball and the engine's attack goes on with T: until the next stop (or
     * KM_SIMKEEP seconds) free play does not take the ball from T: while T has it, no dispossession (DISPK 0) and no cut-out pass (CUTK 0) */
    /* b9 (ASK-0065, P76; KM_SIMOVER=b8 as b8, break nooverkeep): his words, "If you rolled a clear win, that means that you recover the ball
     * and attack with it with an edge": the engine ended their attack by handing your next moment the ball (its roll: you won it) and the
     * card's play ends with your team on it; the free play after it keeps the ball with your team the same way, until the next stop */
    var ovK = !pStop && !rec.engOn && who === 'them' && !scored && !E1.chain && !!(E1.handoff && E1.handoff.next === 'zone') && possP === 'you' && SW.over !== 'b8' && SW.brk !== 'nooverkeep' && SW.keep !== 'off' && SW.brk !== 'undo';
    if (ovK) { rec.overKeep = true; LOG.overKeep = (LOG.overKeep || 0) + 1; }
    var keepT = !pStop && rec.engOn && possP === rec.engOn && SW.keep !== 'off' && SW.brk !== 'undo' ? rec.engOn : ovK ? 'you' : null, keepS = keepT && SW.keep !== 'stop' ? +SW.keep || 0 : Infinity, WT = w.T || {}, k0 = { DISPK: WT.DISPK, CUTK: WT.CUTK, ROLLON: WT.ROLLON }, tK = w.t, keptFl = null, kRoll = SW.keepball === 'held';
    function keepOn() {
      var hk = w.owner || null, inn = w.w || null, fl = inn && inn.ball ? inn.ball.fl : null;
      var on = !!(keepT && w.t - tK < keepS && ((hk && P.teamOf[hk] === keepT) || (!hk && fl && fl.free && P.teamOf[fl.from] === keepT)));
      WT.DISPK = on ? 0 : k0.DISPK; WT.CUTK = on ? 0 : k0.CUTK;
      /* b6 (r3 M4, P44; switch KM_SIMKEEPBALL, break loose): a kept pass that reaches its receiver 2.6 to 6 m off him stops for him (the world's
       * non-free rule) instead of rolling on loose (ROLLON); seed 9242: Yamal's 45 m pass back to Cucurella arrived 3.1 m from him, rolled on
       * to the touchline and Ashley took it, 7.8 s into the free play of an attack the dice had left with your team */
      if (kRoll) WT.ROLLON = on ? 0 : k0.ROLLON;
      if (on && fl && fl.free && !fl.icept) { fl.icept = 'kept'; keptFl = fl; }   /* the world's line touch ("a defender standing on the line of a pass touches it") skips a flight with icept set; nothing else reads it */
      else if (!on && keptFl) unKeep();   /* (Codex r1 item 2: a numeric window ends: the flight we marked is open to the line touch again) */
    }
    function unKeep() { if (keptFl && keptFl.icept === 'kept') delete keptFl.icept; keptFl = null; }
    try {
      if (pStop) { stop = w.stopHere(pStop.who); stop.plan = pStop.why; P.xhead = pStop.who; if (pStop.inAir) { stop.inAir = true; P.xfly = true; LOG.flyStops = (LOG.flyStops || 0) + 1; } LOG.planStops = (LOG.planStops || 0) + 1; }
      else while (!w.ended && guard++ < 30 * 200) { stop = SW.brk === 'nostop' ? null : w.chance(); if (stop) break; if (keepT) keepOn(); w.step(); }
    } finally { if (keepT) { WT.DISPK = k0.DISPK; WT.CUTK = k0.CUTK; WT.ROLLON = k0.ROLLON; unKeep(); } }
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
    /* b9 (ASK-0064, P75; KM_SIMPIPS=b8 as b8, break nopipcap): the moment's pips are spent (your last decision in this moment was its last
     * step: the engine's cap ended the attack) and the world stops for your man in the same moment: no decision past the last pip. The
     * passage ends there, and the next moment starts with four pips (his words: "the next moment will start with four pips"); whose moment
     * it is: P75c below (default: the schedule's; KM_SIMPIPEND=handoff: yours, from this picture) */
    if (stop && !stop.plan && !scored && SW.pips !== 'b8' && SW.brk !== 'nopipcap' && P.teamOf[stop.who] === 'you') {
      var lft = pipLeft(st, p);
      if (lft !== null && lft <= 0) { if (w.end) w.end('pips'); why = 'pips'; cap = 'pips'; rec.pipWho = stop.who; stop = null; rec.pipEnd = true; LOG.pipEnd = (LOG.pipEnd || 0) + 1; }
    }
    if (scored && stop) { if (w.end) w.end('goal (engine)'); why = 'goal (engine)'; stop = null; }   /* the engine's goal ends the passage whatever the world drew */
    /* (ASK-0065, P76: when the engine ENDED the attack with this card and the world's free play stops for a man in the same moment, the
     * decision stands; the words follow it: wordsAt below, the result words; playOn, the headline) */
    if (scored) koGoal(st, st.score.you !== pre.you ? 'them' : 'you');   /* b9 (P66): the side that conceded kicks off the next fresh moment */
    var inResult = !!(w.ended && jS === jP && !cap);   /* the world ended inside the card's own play */
    var engineEnded = !E1.chain;
    rec.ended = !stop; rec.endedBy = why; rec.stop = stop || null; rec.scored = !!scored;
    var goesOn = !rec.ended || (!inResult && jS > jP);
    var wd = wordsAt(P, ev.text, goesOn, rec.endP, who);
    /* b9 (ASK-0065, P76; KM_SIMOVER=b8 as b8, break nooverwords): the engine ended the attack, and the world's free play stops for a man of
     * the SAME side in the same moment: that attack goes on, so the result's words lose "the attack is over" and "the danger is over" (with
     * the other side's man the words stand and the headline says they are counter-attacking: playOn 'counter') */
    if (stop && !stop.plan && !E1.chain && SW.over !== 'b8' && SW.brk !== 'nooverwords' && P.teamOf[stop.who] === who) {
      var t76 = wd.text; END_RX.concat(DANGER_RX).forEach(function (rx) { t76 = t76.replace(rx, ''); });
      if (t76 !== wd.text) { wd = { text: tidy(t76), fix: wd.fix.concat(['over']) }; rec.overWords = true; LOG.overWords = (LOG.overWords || 0) + 1; }
    }
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
      st.chain = stop.plan ? E1.chain : chainAt(P, pic, stop, rec.text, P.stops, pipCx(st, p, E1));   /* b6 (P42): a plan stop keeps the engine's own next step; b9 (P75): the moment's count */
      m.nextPic = { pic: pic, stop: stop, rule: 'stop' };
      rec.nextPic = pic; rec.rule = 'stop';
    } else {
      var fE = frameNow(P, jS), hE = fE.holder || (rec.pipEnd ? rec.pipWho : null), pE = hE ? P.teamOf[hE] : null;   /* (P75: a loose ball your man was about to take) */
      var rule, engHand = !!(st.handoff && !st.chain && !scored);
      rec.engHand = engHand;   /* b9 (P68): the engine handed your next moment the ball (sim_check C42) */
      if (scored || (inResult && engineEnded)) rule = 'engine';
      else if (SW.end === 'handoff' && pE === 'you' && hE && !P.ros.filter(function (r) { return r.id === hE; })[0].keeper && why !== 'out' && why !== 'goal' && why !== 'foul' && why !== 'offside' && !(why === 'pips' && SW.pipend === 'fresh' && SW.brk !== 'pipendhand')) rule = 'handoff';
      else rule = 'fresh';
      /* b9 (ASK-0064, P75c; KM_SIMPIPEND=handoff as P75 alone, break pipendhand): the moment's pips are spent with your man on the ball: the
       * moment is over and the next one comes from the schedule ('fresh'), as after the engine's own last decision (match.js: at the cap the
       * attack ends and the next moment is the schedule's); with 'handoff' your attack was the next moment, from that picture, which took a
       * moment the schedule may have given them (their decisions 6.14 to 5.75 a match, Cups 401 to 432) */
      if (why === 'pips' && rule === 'fresh') { rec.pipFresh = true; LOG.pipFresh = (LOG.pipFresh || 0) + 1; }
      /* b9 (bug 3, K7, P68; KM_SIMWONKEEP=b8 as b8, break handfresh): the engine handed your next moment the ball ("Free kick to your team, and
       * your attack starts ...", "Simón ... saves the shot. Your team has the ball, and your attack starts in your half.") but the world played
       * on after the card and its passage ended without your outfield man on the ball (offside, a foul, your keeper, the ball out, their man
       * on it): b8's 'fresh' rule then dropped the engine's handoff (st.handoff = null, stale()), and the next moment came from the schedule,
       * often theirs (Cups 401 to 406: 17 such results in 33 matches). Now the engine's handoff stands: the 'engine' rule (below: the
       * director stages the engine's moment, or the handoff picture when your man is on the ball), and the moment's lead keeps the ball */
      /* b9 (bug 3, K7, P68 part 2; KM_SIMWONKEEP=b8 as b8, break chainfresh): the same for the engine's OTHER way of going on after a ball you
       * win in their attack: its chain goes on with your attack in this moment (match.js a12 RUL-E, "You won the ball. Your attack starts in
       * midfield: choose what happens next.", ev.r12Cont), and the world's play ended with no chance and no outfield man of yours on the ball
       * (the offside whistle in the card's own play, a foul, the ball out, your keeper). b8's 'fresh' dropped the chain and the next moment
       * came from the schedule, often theirs (the triage check N7: 9 of the 10 failing cases in Cups 401 to 404 were this). Now the chain
       * becomes your next moment's ball, as the 'handoff' rule does when the world's play ends with your outfield man on it (no chance came
       * either way, so the moment ends), and the 'engine' rule below stages it from the world's last frame */
      var engChain = !!(E1.chain && E1.chain.next === 'zone' && who === 'them' && !scored);
      if (rule === 'fresh' && engChain && !engHand && SW.wonkeep !== 'b8' && SW.brk !== 'chainfresh') {
        st.handoff = Object.assign({}, E1.chain, { youSteps: 0, step: 0 }); delete st.handoff.r12Cont; st.chain = null;
        st.n = P.nSaved + 1; st.minuteNow = Math.min(89, (typeof p.minute === 'number' ? p.minute : 0) + 1);
        engHand = true; rec.engHand = true; rec.chainFresh = why || 'none'; LOG.chainFresh = (LOG.chainFresh || 0) + 1;
      }
      if (rule === 'fresh' && engHand && SW.wonkeep !== 'b8' && SW.brk !== 'handfresh') { rule = 'engine'; rec.handFresh = why || 'none'; LOG.handFresh = (LOG.handFresh || 0) + 1; }
      if (rule === 'engine') {   /* the engine's state as choose left it; a ball the engine handed to your next moment gets its menu from the picture */
        /* b1 (sim_check C9): the engine handed the ball on to its own carrier; when the world drew it with another of your outfield men, that
         * man (the one the words name, P4) carries the next decision, from where the ball is. KM_SIM_BREAK=enginecarrier keeps the engine's. */
        if (st.handoff && !st.chain && !scored && hE && pE === 'you' && SW.brk !== 'enginecarrier' && P.player[hE] && !P.ros.filter(function (r) { return r.id === hE; })[0].keeper && (!st.handoff.carrier || st.handoff.carrier.id !== hE)) { st.handoff.carrier = P.player[hE]; st.handoff.zone = zoneOf(fE.ball); }
        /* b9 (bug 3, K7, P68; KM_SIMWONKEEP=b8 as b8): his 29' clean win on the offside trap ("Free kick to your team, and your attack starts at
         * the edge of your box."): the world drew the pass to Reece and the whistle, so its last frame has Reece (theirs) on the ball, and the
         * handoff picture took that frame's holder first: the next moment started with their man on the ball and the attack the words
         * promised never came. After offside or a foul, or whenever their man is on the ball in that frame, no handoff picture: the director
         * stages the engine's moment from the world's last frame (your carrier on the ball where the engine put him; a16's path), and the
         * moment's lead plays from there (with the keep below in lead()) */
        var hN = frameNow(P, jS).holder, stageN = SW.wonkeep !== 'b8' && SW.brk !== 'handframe' && st.handoff && !st.chain && !scored && ((hN && P.teamOf[hN] !== 'you') || why === 'offside' || why === 'foul');
        if (stageN) { rec.handStaged = why === 'offside' || why === 'foul' ? why : 'their man on the ball'; LOG.handStaged = (LOG.handStaged || 0) + 1; }
        else if (st.handoff && !st.chain && !scored) m.nextPic = { pic: { pos: frameNow(P, jS).pos, ball: frameNow(P, jS).ball, holder: frameNow(P, jS).holder || (st.handoff.carrier && st.handoff.carrier.id) || null }, stop: null, rule: 'handoff' };
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
    /* b9 (ASK-0064, P75; KM_SIMPIPS=b8 as b8, break pipswin): a ball your next moment starts with (the engine's handoff after a won ball)
     * gets the moment's four pips, not the engine's 3 (his words: "Whether you consume all four or not, the next moment will start with
     * four pips") */
    if (SW.pips !== 'b8' && SW.brk !== 'pipswin' && st.handoff && st.handoff.cap) { delete st.handoff.cap; LOG.pipFull = (LOG.pipFull || 0) + 1; }
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
    if (w.b8) w.b8.ctr = SW.wonon === 'on' && SW.brk !== 'nowonon';   /* b8 (P60): a ball they win in a lead plays on */
    if (named0 && !w.owner && w.apply) { w.apply({ side: P.teamOf[named0], steps: [{ do: 'collect', who: named0, near: 1.4, secs: 5 }] }); LOG.lead0 = (LOG.lead0 || 0) + 1; }
    /* b9 (P68, same switch and break): a moment you start by winning the ball in the world ('handoff'): when the world starts with nobody on
     * the ball (the frame drew it 1.2 m or more from the man who won it), he runs onto it first, as lead0 does for the engine's pictures
     * (seed 9414 match 2 13': Cubarsí won it 1.23 m from the ball, Owen stood 0.58 m from it and picked it up at the first tick) */
    var won0 = !named0 && from === 'handoff' && SW.wonkeep !== 'b8' && SW.brk !== 'nolkeep' && pic.holder && pic.pos[pic.holder] && P.teamOf[pic.holder] === 'you' ? pic.holder : null;
    if (won0 && !w.owner && w.apply) { w.apply({ side: 'you', steps: [{ do: 'collect', who: won0, near: 1.4, secs: 5 }] }); LOG.won0 = (LOG.won0 || 0) + 1; }
    while (!w.ended && typeof w.busy === 'function' && w.busy() && guard++ < 30 * 60) w.step();
    guard = 0; var jF = w.frames.length - 1;   /* b8 (sim_check C36): where free play starts in the lead */
    /* b9 (bug 8, K7, P68; KM_SIMWONKEEP=b8 as b8, break nolkeep): his 41' clean win in match 2 ("Your team has the ball, and your attack starts
     * in midfield."): the lead started with Cubarsí on the ball and Bobby took it from him about 1 s in, so the next decision was theirs and
     * he never played the ball he won. after()'s keep (KM_SIMKEEP) covers only a chain that goes on; a moment you start by winning the ball
     * (the engine's handoff, p.handoff, or the world's, from 'handoff') now has the same keep in its lead: until the first stop, while your
     * team has the ball (or it is in a free pass from one of yours), free play does not dispossess or cut out (DISPK 0, CUTK 0, and a pass
     * that lands 2.6 to 6 m off its man stops for him, ROLLON 0). The ball can still go out, a pass can still miss its man by more. */
    var keepL = SW.wonkeep !== 'b8' && SW.brk !== 'nolkeep' && (p.handoff || from === 'handoff') ? 'you' : null, WTL = w.T || {}, kL0 = { DISPK: WTL.DISPK, CUTK: WTL.CUTK, ROLLON: WTL.ROLLON }, keptL = null;
    function keepLOn() {
      var hk = w.owner || null, inn = w.w || null, fl = inn && inn.ball ? inn.ball.fl : null;
      var on = !!((hk && P.teamOf[hk] === keepL) || (!hk && fl && fl.free && P.teamOf[fl.from] === keepL));
      WTL.DISPK = on ? 0 : kL0.DISPK; WTL.CUTK = on ? 0 : kL0.CUTK; if (SW.keepball === 'held') WTL.ROLLON = on ? 0 : kL0.ROLLON;
      if (on && fl && fl.free && !fl.icept) { fl.icept = 'kept'; keptL = fl; }
      else if (!on && keptL) { if (keptL.icept === 'kept') delete keptL.icept; keptL = null; }
    }
    try { while (!w.ended && guard++ < 30 * 200) { stop = SW.brk === 'nostop' ? null : w.chance(); if (stop) break; if (keepL) keepLOn(); w.step(); } }
    finally { if (keepL) { WTL.DISPK = kL0.DISPK; WTL.CUTK = kL0.CUTK; WTL.ROLLON = kL0.ROLLON; if (keptL && keptL.icept === 'kept') delete keptL.icept; keptL = null; } }
    if (keepL) LOG.leadKept = (LOG.leadKept || 0) + 1;
    if (!w.ended && !stop && w.end) w.end('guard');
    var jS = w.frames.length - 1, why = w.ended || null;
    var rec = { lead: true, from: from, sit: p.moment && p.moment.sit ? p.moment.sit.id : null, who0: p.moment && p.moment.sit ? p.moment.sit.who : null, dec: P.decs,
      seg: { result: { j0: jA, j1: jA }, play: { j0: jA, j1: jS } }, stop: stop || null, teamOf: P.teamOf, first: P.first, t0: t0, minute: p.minute, jF: jF };
    if (keepL) rec.kept = keepL;   /* b9 (P68): sim_check C42 */
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
  /* b9 (Eduardo's b7 playtest, bugs 1 and 6; P66; switch KM_SIMKICK, b8 value b8): THE KICK-OFF ROUTINE. kickoff(st, p) says whether the
   * moment p starts from a kick-off and which side kicks off, or null: the first moment of the match ('you', as the page and sim_lib always
   * began), the first fresh moment of the second half ('them': the side that did not kick off the first half), the first moment of overtime
   * ('you'; a coin toss in football, P66), else the first fresh moment after an engine goal (the side that conceded; a goal just before half
   * time gives way to the second half's kick-off). The answer for a moment is kept, so the page and node may both ask (simpage's picture,
   * play.html between(), sim_lib's engine picture): the same team every time. Whoever asks puts the kick-off picture (director.js
   * kickoffState(st, team): ball on the centre spot, each team in its own half) where the moment's play starts. b8 started the next play from
   * the world's last frame: the ball in the net after a goal (53 m from the centre spot in his match), the first half's last frame after the
   * break. */
  /* b9 (Eduardo's b7 playtest, bug 2, K6, P67): THE HEADLINE NEVER SAYS THE ATTACK IS OVER WHILE THE SAME MOMENT GOES ON. b1 builds the
   * headline with no next decision whenever the world plays on after the card (the next decision is where the play stops, not where the
   * card's play ends, and the headline is up while the ball is drawn at the card's end), and headline.js with no next decision falls to
   * "<team>'s attack is over" or "keep the ball, but the attack is over". Then the same moment went on with another decision (his 28', 73'
   * and 40'). playOn says what the headline may say instead: 'same' (the side that had the card still attacks at the next decision: "<team>'s
   * attack goes on"), 'other' (the ball changed sides in the play after the card: "Play goes on"), or null (the moment really ended, or there
   * is no play after the card: as b8). The page (play.html) and sim_check C41 both call this.
   * Only where the ENGINE's attack goes on after the card (rec.engNext: its chain goes on, his 28' half win, "Michael gets to the edge of your
   * box"). Where the engine ENDED the attack and the world's free play then made a decision in the same moment (his 40' "Simón kicks it
   * long ... the danger is over", 73' "Spain keep the ball, but the attack is over"), the words and the headline are the engine's and the
   * flow was what was wrong in P67: with KM_SIMOVER=b8 playOn leaves it as b8; his ASK-0065 answer is built below (P76: the moment goes
   * on and the words follow the world). */
  /* b9 (ASK-0065, P76; KM_SIMOVER=b8 as b8): where the engine ENDED the attack and the world's free play stopped for a man in the same
   * moment, the headline says what happens next: 'same' (that side's attack goes on; after() took "over" out of the result's words) or
   * 'counter' (the other side has the ball: "<team>'s attack is over, and <other team> are counter-attacking.", his words) */
  function playOn(rec, p, nx, leadsDue) {
    if (!SW.on || SW.hdgo === 'b8' || !rec || !rec.seg || !rec.seg.play) return null;
    if (!nx || !nx.continues || leadsDue) return null;
    var a = p && p.moment && p.moment.sit && p.moment.sit.who, b = nx.attacking || (nx.moment && nx.moment.sit && nx.moment.sit.who);
    /* b9 (ASK-0065, P76; KM_SIMOVER=b8 as b8, break overseg): the card's own play has no frames (the world's stop comes in the result's segment;
     * the page then builds the headline from the next decision, which said "The attack is over." with the other side's man on the ball in the
     * same moment): with the other side next the headline says so ('counter' when the engine ended the attack, 'other' when it went on) */
    if (!(rec.seg.play.j1 > rec.seg.play.j0)) {
      if (SW.over === 'b8' || SW.brk === 'overseg' || rec.ended || !a || !b || a === b) return null;
      LOG.overSeg = (LOG.overSeg || 0) + 1;
      return rec.engNext ? 'other' : 'counter';
    }
    if (!rec.engNext && (SW.over === 'b8' || rec.ended)) return null;
    if (!rec.engNext) return a && b && a === b ? 'same' : 'counter';
    return a && b && a === b ? 'same' : 'other';
  }
  function koGoal(st, team) { if (!SW.on || SW.kick === 'b8') return; var m = S(st), k = m.ko || (m.ko = { at: {}, goal: null, half: false, ot: false }); k.goal = team; }
  function kickoff(st, p) {
    if (!SW.on || SW.kick === 'b8' || !p || p.continues || typeof p.index !== 'number') return null;
    var m = S(st), k = m.ko || (m.ko = { at: {}, goal: null, half: false, ot: false });
    if (Object.prototype.hasOwnProperty.call(k.at, p.index)) return k.at[p.index] ? k.at[p.index].team : null;
    var O = st.cupOT || null, r = null;
    if (p.index === 1) r = { team: 'you', why: 'start' };
    else if (!k.half && typeof p.minute === 'number' && p.minute > 45 && !(O && p.index > O.at)) { k.half = true; r = { team: 'them', why: 'half' }; }
    else if (O && !k.ot && p.index === O.at + 1) { k.ot = true; r = { team: 'you', why: 'overtime' }; }
    else if (k.goal) r = { team: k.goal, why: 'goal' };
    k.goal = null;   /* a goal's kick-off belongs to the next fresh moment only */
    k.at[p.index] = r;
    if (r) { LOG.kicks = LOG.kicks || {}; LOG.kicks[r.why] = (LOG.kicks[r.why] || 0) + 1; }
    return r ? r.team : null;
  }
  /* drive(st, p, o): the shared loop (node: sim_lib.js; the page: simpage.js). While the decision in hand is one the world should find
   * instead (an open-play moment, or the handoff picture of your next attack), the world leads; then the engine builds the next decision.
   * o: { next0: fn(st) the engine's own next, picOf: fn(st, p, kickFrom) the moment's picture (the director's, played from kickFrom when
   * given, b9), onLead: fn(rec, p), kickPic: fn(st, team) the kick-off picture (b9; without it no kick-off is applied here) }.
   * Returns { p: the decision to show (or null at full time), leads: [the lead records before it, in order] } */
  function drive(st, p, o) {
    var leads = [], g = 0;
    while (p && SW.on && SW.first === 'world' && g++ < 60) {
      var m = S(st), np = m.nextPic && API.pending(st, p) ? m.nextPic : null;
      if (np && np.rule === 'stop') break;
      var pic = null, from = null, kt = o.kickPic ? kickoff(st, p) : null;   /* b9 (P66): this moment starts from a kick-off */
      /* b9 (P66): a ball handed to your next moment does not cross a kick-off (the half-time break, or a goal): the director stages the
       * engine's moment from the kick-off picture (the kick-off, then your carrier on the ball where the engine put him), as for any moment */
      if (np && np.rule === 'handoff' && kt) { pic = o.picOf(st, p, o.kickPic(st, kt)); from = 'engine'; LOG.kickHand = (LOG.kickHand || 0) + 1; }
      else if (np && np.rule === 'handoff') { pic = np.pic; from = 'handoff'; }
      else if (!np && leadable(p)) { pic = o.picOf(st, p, kt ? o.kickPic(st, kt) : null); from = 'engine'; }
      else break;
      var rec = lead(st, p, pic, from);
      if (!rec) break;
      /* b9 (K8, P71): the engine's first menu of this moment had the rattled card (match.js p.rattledAt); the world played on from it to a stop:
       * the stop's menu (menu() below) carries it */
      if (SW.rattle !== 'b8' && SW.brk !== 'norattle' && p.rattledAt && rec.stop) { m.rattle = { at: p.rattledAt, index: p.index }; LOG.rattleDue = (LOG.rattleDue || 0) + 1; }
      else m.rattle = null;
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
    if (m.rattle) { if (m.rattle.index === p.index && !p.rattledAt) { try { Object.defineProperty(p, 'rattledAt', { value: m.rattle.at, enumerable: false, configurable: true, writable: true }); } catch (e) { } LOG.rattleCarry = (LOG.rattleCarry || 0) + 1; } m.rattle = null; }   /* b9 (P71) */
    var pic = np.pic, r = null, err = null;
    /* b5 (item 3, break shot28): the world's shot-stop range (max of its C1 and C3, 30 m on SIM v4) goes to pm.js with the stop, so pm.js offers a
     * shot at any stop inside the range the world stops for shots in (its own 28 m before) */
    if (np.stop && SW.brk !== 'shot28') { var WT2 = (m.pass && m.pass.w && m.pass.w.T) || (CFG.World && CFG.World.T0) || {}; var rg = Math.max(+WT2.C1 || 0, +WT2.C3 || 0); if (rg > 0) np.stop.range = rg; }
    try { Object.defineProperty(p, 'simPic', { value: pic, enumerable: false, configurable: true, writable: true }); Object.defineProperty(p, 'simStop', { value: np.stop, enumerable: false, configurable: true, writable: true }); } catch (e) { }
    /* b6 (P42): a plan stop is the engine's own box decision (its menu stays as the engine made it) */
    if (np.stop && np.stop.plan) return { pic: pic, rule: np.rule, stop: np.stop, pm: { applied: false, why: 'plan stop: the engine\'s menu', err: null, kinds: null } };
    try { r = CFG.PM.apply(CFG.O, st, p, { pos: pic.pos, ball: pic.ball, holder: pic.holder }, { refresh: CFG.X.pmRefresh, force: true }); } catch (e) { err = e && e.message; LOG.errs.push('pm: ' + err); }
    /* b9 (ASK-0064, P75b; KM_SIMPIPLAST=finish as P75 alone, break piplast): your last pip at a world stop. The engine builds the last decision
     * of an attack finish-only (options.js drops the cards that carry play on); in the engine's own zones that leaves a shot, a cross or a
     * hold, but pm.js makes a world stop's menu from its picture, and at a stop for a runner far from goal that left HOLD alone. When the
     * menu pm.js made has fewer than 2 live cards, or a runner stop's menu has no ball to the runner, it is made again with the finish-only
     * rule off for this decision. It is still the moment's last decision: the page shows 1 pip and the engine ends the attack after it */
    if (r && r.applied && SW.pips !== 'b8' && SW.piplast !== 'finish' && SW.brk !== 'piplast' && np.stop && !np.stop.plan && p.lastStep && p.moment && p.moment.sit && p.moment.sit.who === 'you') {
      var arr75 = p.moment.options, ctx75 = arr75 && arr75.pmCtx, sp75 = np.stop, kk75 = sp75.kinds || [sp75.kind];
      var live75 = (arr75 || []).filter(function (o) { return !o.disabled; }).length;
      var miss75 = kk75[0] === 'C2' && sp75.c2 && sp75.c2.length && !(arr75 || []).some(function (o) { var m2 = o.mc && o.mc.man, mid = m2 && (m2.id || m2); return mid && sp75.c2.indexOf(mid) >= 0; });
      if (ctx75 && ctx75.state && ctx75.state.finishOnly && (live75 < 2 || miss75)) {
        ctx75.state.finishOnly = false; var r75 = null;
        try { r75 = CFG.PM.apply(CFG.O, st, p, { pos: pic.pos, ball: pic.ball, holder: pic.holder }, { refresh: CFG.X.pmRefresh, force: true }); } catch (e) { LOG.errs.push('pm75b: ' + (e && e.message)); }
        if (r75 && r75.applied) { r = r75; LOG.pipLast = (LOG.pipLast || 0) + 1; try { Object.defineProperty(p, 'pipLastCards', { value: true, enumerable: false, configurable: true, writable: true }); } catch (e) { } }
        else ctx75.state.finishOnly = true;
      }
    }
    /* b9 (P75): a stop of yours that carries the one-two (mode 'onetwo') gets the engine's own one-two menu (pm.js covers no mode), so M-3
     * (his ruling "the man in the way", manway.js) is read on it from the stop's picture, as sim_lib and the page do on the engine's own
     * decisions; before fitStaged, so the words fit the cards as they now are */
    var KW = typeof globalThis !== 'undefined' ? globalThis.KMWay : null;
    if (!(r && r.applied) && SW.pips !== 'b8' && np.stop && st.chain && st.chain.mode === 'onetwo' && p.moment && p.moment.sit && p.moment.sit.who === 'you' && KW && KW.apply) {
      try { var w75 = KW.apply(CFG.O, st, p, { pos: pic.pos, ball: pic.ball, holder: pic.holder }, CFG.X); if (w75 && w75.applied) LOG.oneTwoWay = (LOG.oneTwoWay || 0) + 1; } catch (e) { LOG.errs.push('way: ' + (e && e.message)); }
    }
    if (!(r && r.applied) && CFG.PH && CFG.PH.fitStaged) { try { CFG.PH.fitStaged(st, p, { ball: pic.ball, holder: pic.holder, pos: pic.pos }); } catch (e) { LOG.errs.push('fitStaged: ' + (e && e.message)); } }
    /* b8 (P61; switch KM_SIMNEAR, break engine): at a world stop on their ball the scene's "Y is the nearest of your players to him." (and "Y is
     * the defender in front of X.") names the outfield man of yours the picture has nearest to the man on the ball; b7 kept the engine's
     * marker (model.js markerOf), so the scene of a duel could name a man 15 m away while another stood at 1 m */
    if (SW.near === 'pic' && np.stop && m.pass && p.moment && p.moment.sit && p.moment.sit.who === 'them' && pic.holder && pic.pos[pic.holder]) {
      var hq8 = pic.pos[pic.holder], nb8 = null;
      m.pass.ros.forEach(function (r8) { if (r8.team !== 'you' || r8.keeper || !pic.pos[r8.id]) return; var d8 = hyp(pic.pos[r8.id], hq8); if (!nb8 || d8 < nb8.d) nb8 = { id: r8.id, d: d8 }; });
      var nm8 = nb8 ? m.pass.first[nb8.id] : null;
      if (nm8) { var t8 = String(p.moment.text || ''), t8b = t8.replace(new RegExp('(^|[.!?] )(' + SCENE_NAME + ') is the (nearest of your players to [^.]+|defender in front of [^.]+)\\.', 'g'), function (all, pre, who, rest) { return who === nm8 ? all : pre + nm8 + ' is the ' + rest + '.'; });
        if (t8b !== t8) { p.moment.text = t8b; LOG.nearFix = (LOG.nearFix || 0) + 1; } }
    }
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
    /* b7 (P53, switch KM_SIMHFLY): at the stop where the header is on its way, the page's frozen picture (this end) keeps the ball's height,
     * so it does not drop to the ground at the freeze and jump back up when the next card plays (every other end stays at 0, as b6) */
    var fe = F[s.j1], endZ = SW.hfly === 'on' && which === 'play' && rec.stop && rec.stop.inAir ? (fe.ball.z || 0) : 0;
    var end = { pos: fe.pos, ball: { x: fe.ball.x, y: fe.ball.y, z: endZ }, holder: (fe.holder !== undefined ? fe.holder : fe.owner) || null };
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
    family: family, wordsAt: wordsAt, endLine: endLine, zoneOf: zoneOf, tzThem: tzThem, LOG: LOG, kickoff: kickoff, playOn: playOn, state: function (st) { return STATE.get(st) || null; }, active: function (st) { var m = STATE.get(st); return !!(m && m.pass); },
    pending: function (st, p) {   /* b1 (sim_check C9): the engine did not take the handoff (a fresh moment, as at half-time): its own picture, not the world's */
      var m = STATE.get(st); if (!(m && m.nextPic)) return false;
      /* b4 (r1 item 5, break handdrop): match.js sets continues = false on EVERY handoff moment, so b3 dropped every handoff picture (C9H 89 of
       * 92); the picture goes only when the engine did not take the handoff (a fresh moment, as at half-time: p.handoff unset) */
      if (p && m.nextPic.rule === 'handoff' && (SW.brk === 'handdrop' ? !p.continues : !p.handoff) && SW.brk !== 'handfresh') { m.nextPic = null; LOG.handDropped = (LOG.handDropped || 0) + 1; return false; }
      return true; }, drop: function (st) { var m = STATE.get(st); if (m) { m.pass = null; m.nextPic = null; } } };
  return API;
});
