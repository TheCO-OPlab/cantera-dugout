/* d1: THE DIRECTOR (the pitch run's contract, GOALS.md).
 *
 * The engine decides the moments; this file stages the football around them.
 * For the play BEFORE a moment it writes about five seconds of events that
 * BUILD THE SCENE the moment's text describes (SCENES.md): a foul and a
 * wall before a free kick, a ball played wide and carried to the byline
 * before a cross, a long ball over the back line before "the ball is in the
 * air", a won ball before a new attack. It ends with the ball exactly where
 * the moment starts, at the feet of the man the moment's text names. For a
 * decision's result it writes the events the result's text says, literally:
 * a man gone past is left behind the ball, a ball kicked out goes over the
 * line the text says, a keeper who catches it has it; and when the play
 * stops (a throw-in, a goal kick, a free kick, the keeper's ball) the next
 * play starts with that restart.
 *
 *   event: { t, kind, team, from, to, ball: {x, y}, note }
 *   kind:  pass | carry | dribble | tackle | interception | clearance | shot |
 *          save | out | foul | kickoff
 *   team:  who did it; for `out`, the team the restart goes to; for `foul`,
 *          the team that fouled (from = the fouler, to = the man fouled)
 *   note:  what kind of pass or stoppage ('throw-in', 'goal kick',
 *          'corner', 'corner kick', 'free kick', 'cross', 'long ball',
 *          'over the top', 'switch of play', 'one-two', 'back pass',
 *          'through ball', 'cut-back', 'header', 'keeper throw', 'blocked',
 *          'wide', 'over the bar', 'goal', 'catch', 'parried', 'offside',
 *          'out for a corner', 'past' ...)
 *
 * It is SHOW ONLY. It reads the match and never changes it, and it never
 * touches the match RNG: its own generator is seeded from the match's seed
 * plus the moment's index (and decision step), so the same match stages the
 * same football every time. pitchcheck.js proves both.
 *
 * A segment also carries KEY FRAMES: the ball, who has it, and all 22
 * positions at the start and end of every event. frameAt(seg, t) blends
 * them, so the page, the checks and anything later (stats, replays) read
 * one picture of the play. */
(function (root) {
  'use strict';
  var P = root.KMPitch || require('./pitch.js');
  var TARGET = 5.0;        // seconds of play between moments, at 1x
  /* m3 (DECISIONS item 16): a plan the director could only get longer than
   * LONG_PLAN seconds (the cleared corner into a break) is no longer squeezed
   * into 5 s: it runs at its own length, up to MAX_PLAY. Every other play is
   * still exactly 5 s. */
  var LONG_PLAN = 6.0, MAX_PLAY = 7.0;
  /* a2 (helper M): THE BREAK SWITCHES of the movement checks (mvcheck2.js --break <what>, node only):
   * gap (a1's drawing: no legs, the end picture run in after the play), fast (no top speed), jerk (no
   * acceleration limit), rest (every picture starts from rest) */
  var BRK = {};
  try { var brk0 = typeof process !== 'undefined' && process.env && process.env.KM_MVBREAK; if (brk0) BRK[brk0] = true; } catch (e) { }
  var A2 = !BRK.gap;
  /* kmtree5 a3 (helper C): the six cards' pictures (positions and timing only). KM_C_ACTION=a2 or ?caction=a2: a2's. */
  var C3 = !(typeof process !== 'undefined' && process.env && process.env.KM_C_ACTION === 'a2');
  try { if (/[?&]caction=a2\b/.test((root.location && root.location.search) || '')) C3 = false; } catch (e) { }
  var C3BRK = (typeof process !== 'undefined' && process.env && process.env.KM_C_BREAK) || '';
  /* a2: a play is never squeezed (m3 fitted every plan up to 6 s into 5, so everyone ran up to 1.2 times faster
   * than planned: a carry at 12.6 m/s): a short plan is still stretched to 5 s, a longer one runs at its own
   * length (the planner aims shorter, MV.legBudget, so it lands near 5 s) */
  function playLength(natural) {
    if (A2) return natural < TARGET ? TARGET : natural;
    return natural > LONG_PLAN ? Math.min(natural, MAX_PLAY) : TARGET;
  }
  /* d1: switches for pitchcheck.js, which shows each check fails without
   * the behaviour it guards (--break) */
  var GUARD = { press: true, run: true, opening: true, variety: true, pingpong: true, scorer: true, taker: true };   /* m4: taker */
  var PASSY = { pass: 1, interception: 1, clearance: 1, shot: 1, out: 1, kickoff: 1, save: 1 };
  /* passes that travel in the air */
  var AIRY = { cross: 1, 'in the air': 1, 'long ball': 1, 'over the top': 1, 'goal kick': 1, 'corner kick': 1, 'switch of play': 1, 'header': 1, 'out for a corner': 1, 'over the bar': 1, 'keeper throw': 0 };

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* the match's own seed plus the moment, never the match RNG */
  function seedOf(st, index, step, salt) {
    return (Math.imul(((st.seed | 0) ^ 0x2c1b3c6d) >>> 0, 2654435761) + (index | 0) * 7919 + (step | 0) * 104729 + (salt | 0) * 1013) >>> 0;
  }
  function passDur(d) { return 0.3 + d / 32; }
  /* kmtree5 a4 (helper P): THE BALL AT A BALL'S SPEED (note 2 of Eduardo's a3 playtest: "1x is slow"; the last pass
   * of a play flew 2.8 times its flight time, at 10 m/s, because it waited for its man). P4 on: every wait the play
   * needs is spent before a pass is struck (touchBefore: the passer takes a touch, the ball at his feet, while his
   * man starts his run), never in the ball's flight; the waits of a play add up to MV.waitCap s at most.
   * KM_PBREAK=slowball (node) or ?pbreak=slowball: a3's waits (p_mvcheck.js --break slowball must fail). */
  var PBRK = {};
  try { var pb0 = typeof process !== 'undefined' && process.env && process.env.KM_PBREAK; if (pb0) pb0.split(',').forEach(function (x) { PBRK[x] = true; }); } catch (e) { }
  try { var pbm = /[?&]pbreak=([\w,]+)/.exec((root.location && root.location.search) || ''); if (pbm) pbm[1].split(',').forEach(function (x) { PBRK[x] = true; }); } catch (e) { }
  var P4 = !PBRK.slowball;
  /* (kmtree5 a4, round 4: helper C's own breaks, KM_C_BREAK, also switch off what of mine covers the same picture, so
   * c_check's breaks still bite: runner -> the onside guard and the runner held on the shoulder; fkspot -> the short
   * free kick's spot noted for the next decision and its nearer man) */
  try { var cb4 = typeof process !== 'undefined' && process.env && process.env.KM_C_BREAK; if (cb4 === 'runner') { PBRK.onside = PBRK.shoulder = true; } if (cb4 === 'fkspot') { PBRK.fknear = true; PBRK.fkafter = true; } } catch (e) { }
  /* kmtree5 a6 (helper T, "contact and flight"): THE RUN'S SWITCH, and my breaks. T6 on (the default): the ball has its
   * own track (tBallTrack below): it is at a man's feet, or it flies at a ball's speed between two men who are at it.
   * KM_MOVE=a5 (node) or ?move=a5 (page): a5's picture, exactly. KM_TBREAK=<a,b> or ?tbreak=<a,b> switch one part off
   * for the checks (tt_measure.js): ball (the whole track), meet (a ball played early into its man's run), roll (a
   * ball that lands and runs on), lead (the ball on the side a man is running to), shield (the ball away from an opponent in front of it), fast (a ball
   * never faster than a ball), tackle (the tackler's run).
   * kmtree5 a7 (helper T2), more breaks, each gives helper T's code of a6t back for one part (t2_fast.js --check must
   * fail under each): t2 (all of them), t2loose (a tackle's loose ball is collected when its man can be there),
   * t2cut (the pass before a tackle is cut out when the loose ball cannot be honest), t2early (a ball arrives early
   * when the one after it has too little time), t2pin (no jump of the ball where the plan pins it), t2peak (a ball's
   * top speed, not only its mean, is a ball's), t2out (a ball cleared out of play takes a ball's time to get there,
   * into the time the plan gives the dead ball), t2save (a ball that comes off the keeper leaves him at a ball's
   * speed), t2air (a picture that starts with the ball in the air beside the man who plays it: he runs onto it). */
  var T6 = true, TBRK = {};
  var T2OUT = 0.8; try { if (typeof process !== 'undefined' && process.env && process.env.KM_T2OUT != null) T2OUT = +process.env.KM_T2OUT; } catch (e) { }   /* (T2: the most a ball on its way out may run into the dead ball's time, s) */
  try { if (typeof process !== 'undefined' && process.env && process.env.KM_MOVE === 'a5') T6 = false; } catch (e) { }
  try { if (/[?&]move=a5\b/.test((root.location && root.location.search) || '')) T6 = false; } catch (e) { }
  try { var tb0 = typeof process !== 'undefined' && process.env && process.env.KM_TBREAK; if (tb0) tb0.split(',').forEach(function (x) { TBRK[x] = true; }); } catch (e) { }
  try { var tbm = /[?&]tbreak=([\w,]+)/.exec((root.location && root.location.search) || ''); if (tbm) tbm[1].split(',').forEach(function (x) { TBRK[x] = true; }); } catch (e) { }
  /* kmtree5 a6 (helper W, "the waits"; BRIEF-a6.md, Eduardo's notes 3, 5, 6 and 10: "they all wait next to the ball for
   * Porro to run from midfield"): THE PLAY NO LONGER STANDS AND WAITS FOR ONE FAR MAN. Picture only. Four parts, each
   * with its own switch, all on in a6w:
   *   support  the side with the ball brings its full-back on the ball's side and its two nearest midfielders up with
   *            the attack, in the drawn picture only (keyPos and the end pictures; pitch.js shape() is untouched);
   *   stage    a man a live card sends round the outside starts his run from behind and outside the man who holds it;
   *   stageall the man every other live card of yours names as the one who gets the ball is within W6T.reach m of where
   *            that card's own result would give it to him (the zone it moves the ball to, his own lane), never
   *            beyond their second-last man, never within 9 m of the ball;
   *   via      a card whose words pass the ball through a second man ("takes the pass from Yamal") is drawn that way;
   *   hold     the man on the ball does not stand on it while another man comes: the wait before a pass is played
   *            as football (he shields it or runs with it, the defender the words name stays with him), then the
   *            ball is played into the runner's path;
   *   cut      (off by default; KM_W_LONGRUN=cut or ?longrun=cut) a man who would still need more than W6T.cutOver
   *            seconds is cut to, arriving.
   * KM_MOVE=a5 (page ?move=a5): all off, a5's frames exactly. KM_W=<list> (page ?w=): only those on (KM_W=none: none).
   * KM_W_OFF=<list> (page ?woff=): those off. ww_same.js and ww_measure.js use them. */
  var W6 = { support: true, stage: true, stageall: true, via: true, hold: true, cut: false };
  (function () {
    var env = {}, qs = '';
    try { if (typeof process !== 'undefined' && process.env) env = process.env; } catch (e) { }
    try { qs = (root.location && root.location.search) || ''; } catch (e) { }
    function qv(k) { var m = new RegExp('[?&]' + k + '=([\\w,.-]+)').exec(qs); return m ? m[1] : ''; }
    var only = env.KM_W || qv('w'), off = env.KM_W_OFF || qv('woff'), k;
    if (only) { for (k in W6) if (k !== 'cut') W6[k] = false; only.split(',').forEach(function (x) { if (x !== 'cut' && W6.hasOwnProperty(x)) W6[x] = true; }); }
    if (off) off.split(',').forEach(function (x) { if (W6.hasOwnProperty(x)) W6[x] = false; });
    if ((env.KM_W_LONGRUN || qv('longrun')) === 'cut') W6.cut = true;
    if (env.KM_MOVE === 'a5' || qv('move') === 'a5') for (k in W6) W6[k] = false;
  })();
  /* the numbers of stream W: the ball within W6T.from m of the goal it attacks for the support (blended in over
   * W6T.blend m before that); the full-back W6T.fbBack m behind and W6T.fbOut m outside the ball (fbMid, fbFar: with
   * the ball in the middle, on the other side); the midfielders W6T.midBack to midBack2 m behind it; a wait
   * of more than W6T.holdMin s before a pass is played as football; a shield moves at W6T.vShield m/s (one touch every
   * W6T.leg s, turning W6T.turn degrees), a run with the ball into space at W6T.vCarry */
  var W6S = { played: 0, longer: 0, cuts: 0 };   /* counters, for ww_measure.js: waits played as football; made again and thrown away because the result came out longer */
  var W6T = { from: 40, blend: 10, fbBack: 12, fbOut: 8, fbMid: 20, fbFar: 27, midBack: 11, midBack2: 16, room: 4.5, supMids: 0, supFar: 0, ovlBack: 6, ovlOut: 7, holdMin: 0.9, slack: 0.35, again: 0.6, reach: 15, reachRun: 20, cutLead: 0.7, vShield: 2.6, vCarry: 3.2, lenCarry: 10, leg: 0.7, turn: 60, press: 2.4, cutOver: 3.5 };
  try { if (typeof process !== 'undefined' && process.env && process.env.KM_W6T) process.env.KM_W6T.split(',').forEach(function (kv) { var a = kv.split('='); if (W6T.hasOwnProperty(a[0])) W6T[a[0]] = +a[1]; }); } catch (e) { }   /* (node only: a number of stream W, for tuning: KM_W6T=vShield=2.6,leg=0.8) */
  /* kmtree5 a8 (helper G, "the merge"): WHERE THE BALL'S TRACK (helper T) AND THE WAITS (helper W) MEET. Picture only.
   * Each part has its own switch; KM_MOVE=a5 (page ?move=a5) turns all off with the rest of the run.
   *   early  (on)  a ball held while its man comes (W's shield or run with the ball, then the 'release' pass) may be
   *                played early into his run, as helper T's ball does inside one pass's beat: up to G8T.back s before
   *                the release beat, once the hold has been shown G8T.show s, under T's own rules (it still goes the
   *                way the plan sends it, never a through ball, a cross, a cut-back or a restart). The runner meets
   *                it on the run and runs on with it. Without it W's hold used all the wait and the ball was always
   *                struck last, with the runner far ahead of it (the eye's E9b).
   *   busy   (on)  the defender who stays on the man holding the ball (W's press6) is never a man who plays the ball
   *                later in the same result (a centre-back who must head the cross away was kept on the crosser and
   *                the header then happened with nobody at the ball: the eye's E3, matches 21, 30, 33).
   *   thru   (OFF) a ball played behind their defence ("through ball", "over the top") has its wait played as a
   *                shield too (W's open item 1), the runner holding his run as in a5; T's ball strikes it.
   *   twait  (OFF) W's hold also finds a wait on the ball's own track (helper T's) where a5's holdOf() sees none
   *                (a cross or a cut-back before a shot).
   *   playgo (on)  in a play (its length is fixed) the man a held ball is for leaves when his legs need to, as in a5,
   *                not at once (W's go6): he got to his place early and stood beyond their line (the eye's E9b).
   * KM_G8=<list> (page ?g8=): only those on (KM_G8=none: none). KM_G8_OFF=<list> (page ?g8off=): those off.
   * KM_G8_ON=<list> (page ?g8on=): those on as well. KM_G8T=back=1.0 (node): one of the numbers. */
  var G8 = { early: true, busy: true, playgo: true, thru: false, twait: false }, G8T = { back: 1.5, show: 0.45, run: 3 }, G8S = { early: 0, busy: 0, thru: 0 };
  (function () {
    var env = {}, qs = '';
    try { if (typeof process !== 'undefined' && process.env) env = process.env; } catch (e) { }
    try { qs = (root.location && root.location.search) || ''; } catch (e) { }
    function qv(k) { var m = new RegExp('[?&]' + k + '=([\\w,.-]+)').exec(qs); return m ? m[1] : ''; }
    var only = env.KM_G8 || qv('g8'), off = env.KM_G8_OFF || qv('g8off'), on = env.KM_G8_ON || qv('g8on'), k;   /* (not KM_G_OFF or ?goff: those are a4's gameplay switches, archetypes.js) */
    if (only) { for (k in G8) G8[k] = false; only.split(',').forEach(function (x) { if (G8.hasOwnProperty(x)) G8[x] = true; }); }
    if (on) on.split(',').forEach(function (x) { if (G8.hasOwnProperty(x)) G8[x] = true; });
    if (off) off.split(',').forEach(function (x) { if (G8.hasOwnProperty(x)) G8[x] = false; });
    if (env.KM_MOVE === 'a5' || qv('move') === 'a5') for (k in G8) G8[k] = false;
    if (env.KM_G8T) env.KM_G8T.split(',').forEach(function (kv) { var a = kv.split('='); if (G8T.hasOwnProperty(a[0])) G8T[a[0]] = +a[1]; });
  })();
  /* kmtree5 a8 (helper K, "possession changes are contacts"; reviewer V1's fault 2: "a ball is won with nobody at it"):
   * THE PLAN OF A PLAY KNOWS WHERE THE MEN REALLY ARE. Until a8 the Planner chose the man who wins the ball from the
   * team's ideal shape round the ball (P.shapeAll), and gave him half a second to be there. He was where the last
   * picture left him (16 m away on average at a tackle), so the ball changed sides with nobody at it. Now the Planner
   * keeps, for every man, the last place the plan needed him and when (Planner.anc; before that, where the picture
   * starts), and asks how soon his legs can be somewhere (Planner.eta). Picture only. Five parts, each a switch, all
   * ON by default:
   *   kick    after a kick-off the first seconds are a tap back, then a safe ball (back to a defender, square to a
   *           midfielder, or a touch), varied by the director's own generator; when the other side must win it, it
   *           is a pass into midfield that one of them cuts out (no header from open ground).
   *   cut     a ball that changes sides in open play (turnover()) is a pass cut out by a man who can be on its line
   *           when it gets there; when nobody can, the pass is misplaced straight into the lane of the nearest man.
   *           A header is won only by a man who can be under it. And the scenes' own cut-outs (the won ball high up,
   *           the square pass along your back line, the tired gap, the pass before the back pass to your keeper).
   *   tackle  a tackle happens where and when the two men can meet: the man who loses the ball keeps it a touch
   *           longer and carries it toward the run of the man who wins it (anticipation); the named man who wins the
   *           ball high up takes it at the END of the play, at the moment's own spot, when his legs are there.
   *   mate    when the named man is too far to win it himself in the play's time and the moment's words do not say
   *           that he won it, a nearer team-mate wins it and passes it to him. Off: the pass is misplaced into the
   *           named man's own lane and he runs on with it.
   *   foul    the man who is fouled runs with the ball toward the man who fouls him and is fouled where they meet
   *           (a8: he waited on the ball, up to 6 s, for a man 10 to 40 m away).
   *   meet    a ball the play delivers to a man who cannot be at its place in time goes to where he can be, and he
   *           runs on with it (deliver()).
   *   settle  (in settle(), with the lead's leave) the play does not wait for a man who has already run past the
   *           spot it waits at (past8).
   *   foulwait (in settle()) the whistle does not wait for a fouler who is within 2.2 m of his spot beside the man.
   *   shot    (the lead's addition, helper T2's proposal) a shot or a save takes at least a ball's time for its
   *           distance at 30 m/s (Planner.push).
   * KM_MOVE=a5 (page ?move=a5): all off. KM_K=<list> (page ?k=): only those on (KM_K=none: none, a8's frames exactly:
   * k8_same.js). KM_K_OFF=<list> (page ?koff=): those off. KM_KBREAK=<list> (page ?kbreak=): the same as KM_K_OFF, the
   * name the checks use (k8_measure.js --check must fail under each). KM_K8T=holdMax=1.2 (node): one of the numbers. */
  var K8 = { kick: true, cut: true, tackle: true, mate: true, foul: true, shot: true, settle: true, foulwait: true, meet: true }, K8S = { kick: 0, cut: 0, lane: 0, ant: 0, end: 0, mate: 0, foul: 0, head: 0, fill: 0, win: 0, meet: 0 };
  /* the numbers: a man reacts K8T.react s before his legs go; a man reads a pass K8T.read s before it is struck; the
   * man who loses the ball keeps it K8T.holdMax s at most while the other comes (K8T.antMax s in an open-play
   * turnover), running with it at K8T.vHold m/s; a cut-out is at least K8T.cutMin m from the passer; a fouled man
   * runs at K8T.vFoul m/s for K8T.foulRun m at most */
  /* (K8T.early: a man who cuts a ball out is on its line that long before it gets there, so he is not still sprinting
   * at it when it arrives: at 2X the page's chips trail a sprinting man by up to a metre; K8T.kickSafe: the safe ball
   * after a kick-off is played when the play has that much room past its budget, else the tap is followed at once
   * by the ball into midfield; K8T.vRun: what a man's legs average over a long run off the ball as the plan reckons
   * it (the legs' top speed is 9.2: measured on his 20th minute, Fabián made 7 m/s once running and 4 to 5 over the
   * first 3 s); K8T.wantFar: the man the play needs next cuts a ball out himself only within that many metres of
   * where it needs him; K8T.mateWait: a nearer team-mate wins it when the named man is more than that many seconds
   * away; K8T.vAnt, K8T.winMax: in a result the man who loses the ball runs at the man the words name at that speed,
   * that long at most.) */
  var K8T = { react: 0.3, read: 0.45, holdMax: 2.0, antMax: 1.0, vHold: 3.0, cutMin: 6, vFoul: 4.6, foulRun: 14, foulMax: 3.2, kickSafe: 0.9, early: 0.45, vRun: 6.5, wantFar: 18, mateWait: 3.2, vAnt: 4.4, winMax: 1.6 };
  (function () {
    var env = {}, qs = '';
    try { if (typeof process !== 'undefined' && process.env) env = process.env; } catch (e) { }
    try { qs = (root.location && root.location.search) || ''; } catch (e) { }
    function qv(k) { var m = new RegExp('[?&]' + k + '=([\\w,.-]+)').exec(qs); return m ? m[1] : ''; }
    var only = env.KM_K || qv('k'), off = env.KM_K_OFF || qv('koff'), brk = env.KM_KBREAK || qv('kbreak'), k;
    if (only) { for (k in K8) K8[k] = false; only.split(',').forEach(function (x) { if (K8.hasOwnProperty(x)) K8[x] = true; }); }
    [off, brk].forEach(function (l) { if (l) l.split(',').forEach(function (x) { if (x === 'all') { for (var k2 in K8) K8[k2] = false; } else if (K8.hasOwnProperty(x)) K8[x] = false; }); });
    if (env.KM_MOVE === 'a5' || qv('move') === 'a5') for (k in K8) K8[k] = false;
    if (env.KM_K8T) env.KM_K8T.split(',').forEach(function (kv) { var a = kv.split('='); if (K8T.hasOwnProperty(a[0])) K8T[a[0]] = +a[1]; });
  })();
  function k8On() { return K8.kick || K8.cut || K8.tackle || K8.mate || K8.foul || K8.meet; }   /* (not `shot`: it needs none of the Planner's book-keeping) */
  var K8DBG = false; try { K8DBG = !!(typeof process !== 'undefined' && process.env && process.env.KM_KDBG); } catch (e) { }
  function k8Log() { if (K8DBG) console.log.apply(console, ['K8'].concat([].slice.call(arguments))); }
  /* kmtree5 a9 (helper G2, "the second merge"): what the merged branches need from each other. Picture only; each part
   * has its own switch, all ON by default; KM_MOVE=a5 (page ?move=a5) turns them off with the rest of the run.
   *   keeper  a keeper moves like a man. Until a9 a keeper stepping about his goal changed his velocity at up to
   *           MV.legKeeperA (12 m/s/s; an outfield man: MV.legA, 6), chasing the director's curve, which turns at every
   *           beat while the ball is within 35 m of his goal. With helper K's plays (the ball passed about in front of
   *           him, the safe ball after a kick-off) that read as a keeper jerking at every pass (mvcheck2 V4 0.551,
   *           limit 0.5; 97% of it keepers). Now he speeds up and slows down at G9T.keepA m/s/s (a man's rate); what
   *           he cannot reach he reaches late; and he starts to set his feet for the end of a picture early enough to
   *           be still by then at that rate. NOT changed: his top speed (MV.legKeeper), his dive (the shot's and the
   *           save's beat: MV.legDiveA, legDiveGoal), and setting his feet in the 0.45 s before a shot is struck
   *           (MV.legKeeperA, so the dive starts as it did: mvcheck K1, K2).
   *   loose   where helper K's plays meet helper T2's ball: a man who runs with the ball at the man who is to take it
   *           off him (K's anticipation) and whom that man cannot reach in time. T2's ball then "gets away" from him
   *           when the tackle's beat starts, and when what follows leaves it no time it flew as fast as that needed
   *           (11 m in 0.23 s, 49 m/s: t2_fast.js). Now it may get away from him up to G9T.looseBack s earlier, while
   *           he is still running with it, so that it reaches the other man in a loose ball's own time.
   *   gapball the last ball into the keeper's short-pass picture is a5's ball (helper T left it so: the picture's
   *           words read it), and a5 eases every ball out, so it leaves at 1.6 times its mean speed. Since K's plays
   *           no longer wait at their end, a long one (42 m in 1.45 s) was drawn at 53 m/s. When a5's ball would top
   *           30 m/s it now runs the same path in the same time at a nearly even speed (as T2 did for a save's ball).
   *   rob     (OFF: a trial, DECISIONS-G9.md) the man who has just lost the ball in a tackle is let go when the tackle's
   *           beat ends when the winner's next beat is a pass (helper T keeps the two together a quarter of a second
   *           into it), so the stepping-apart in legs() moves him off the winner sooner.
   * KM_G9=<list> (page ?g9=): only those on (KM_G9=none: none). KM_G9_OFF=<list> (page ?g9off=): those off.
   * KM_G9_ON=<list> (page ?g9on=): those on as well. KM_G9T=keepA=7 (node): one of the numbers. */
  /*   kickdir (words; in helper C's kicked()) "passes it back" / "passes it forward" before a ball that is cut out is
   *           read from where the ball is when it is struck, not from the beat's first key frame. */
  var G9 = { keeper: true, loose: true, gapball: true, rob: false, kickdir: true }, G9T = { keepA: 6.0, looseBack: 1.2 }, G9S = { loose: 0, gapball: 0, kickdir: 0 };
  (function () {
    var env = {}, qs = '';
    try { if (typeof process !== 'undefined' && process.env) env = process.env; } catch (e) { }
    try { qs = (root.location && root.location.search) || ''; } catch (e) { }
    function qv(k) { var m = new RegExp('[?&]' + k + '=([\\w,.-]+)').exec(qs); return m ? m[1] : ''; }
    var only = env.KM_G9 || qv('g9'), off = env.KM_G9_OFF || qv('g9off'), on = env.KM_G9_ON || qv('g9on'), k;
    if (only) { for (k in G9) G9[k] = false; only.split(',').forEach(function (x) { if (G9.hasOwnProperty(x)) G9[x] = true; }); }
    if (on) on.split(',').forEach(function (x) { if (G9.hasOwnProperty(x)) G9[x] = true; });
    if (off) off.split(',').forEach(function (x) { if (G9.hasOwnProperty(x)) G9[x] = false; });
    if (env.KM_MOVE === 'a5' || qv('move') === 'a5') for (k in G9) G9[k] = false;
    if (env.KM_G9T) env.KM_G9T.split(',').forEach(function (kv) { var a = kv.split('='); if (G9T.hasOwnProperty(a[0])) G9T[a[0]] = +a[1]; });
  })();
  var FLIGHT = { pass: 1, kickoff: 1, interception: 1, clearance: 1, shot: 1 };
  /* can beat bi (a flight) be preceded by a touch? the man who strikes it has the ball at its start */
  function canTouch(keys, beats, bi) {
    var b = beats[bi], k = keys[bi];
    return !!(b && FLIGHT[b.kind] && b.kind !== 'kickoff' && b.kind !== 'shot' && b.from && k && k.holder === b.from);   /* (a shot is struck when it is struck: the keeper's dive is timed to it) */
  }
  /* THE Hout (kmtree5 a4, helper P, note 2): a pass whose beat is longer than the ball's flight (the play waits for the
   * man it is for, a2's rule, and a short plan stretched to 5 s) keeps the ball at the passer's feet for the difference,
   * then it flies at a ball's speed (passDur). The key frames, their times and every man's run are a3's: only the ball
   * (and the passer, who stays on it) are drawn differently inside the beat. Not for a shot or a kick-off, and not for a
   * ball nobody has at its start (struck first time: it floats as before). Returns the seconds of the hold, or 0. */
  function holdOf(seg, k) {
    if (!P4 || PBRK.hold) return 0;
    var b = seg.beats[k], a = seg.keys[k], e = seg.keys[k + 1];
    if (!b || !a || !e || !FLIGHT[b.kind] || b.kind === 'shot' || b.kind === 'kickoff' || !b.from || a.holder !== b.from) return 0;
    var nb = seg.beats[k + 1]; if (nb && nb.kind === 'shot') return 0;
    var clH = CLAIMS && CLAIMS.get(seg); if (clH && clH.gap && k === seg.beats.length - 1) return 0;   /* (the last ball into the keeper's short-pass picture keeps a3's timing: the press gap the odds use, helper C's C4) */
   /* (a ball struck at once into a shot keeps a3's timing: the keeper's dive is timed to it, mvcheck K1 and K2) */
    var aa = a.ball0 || a.ball, bb = e.ball0 || e.ball, dur = e.t - a.t, fl = Math.max(0.25, passDur(P.dist(aa, bb)) * (b.note === 'throw-in' ? 1.3 : 1));
    /* (and the passer has the time he needs after he plays it to get where the next picture has him: the man a pass
     * back goes to is often the man who just passed: the hold is shorter by what his run needs) */
    var qa = (a.pos0 || a.pos)[b.from], qe = (e.pos0 || e.pos)[b.from];
    if (!qa || P.dist(qa, aa) > P.BALL_OFF + 1.5) return 0;   /* (the plan has him on the ball when it is played, or there is no hold) */
    if (qe && passerNeeded(seg, b.from)) fl = Math.max(fl, legTime(P.dist(qa, qe)) * 1.1);
    return dur - fl > 0.08 ? dur - fl : 0;
  }
  /* the onside guard (note 10b): returns pos, or a copy with the men past the line drawn level with it (or the ball) */
  function onsideGuard(st, pos, ball, att, skip) {
    var dir = dirOf(att), def = other(att), ds = [];
    outfield(st, def).concat([keeperOf(st, def)]).forEach(function (q) { if (q && pos[q.id]) ds.push(pos[q.id].y * dir); });
    if (ds.length < 2 || !ball) return pos;
    ds.sort(function (a, b) { return b - a; });
    var line = ds[1], bd = ball.y * dir, out = null;
    outfield(st, att).forEach(function (q) {
      if (!pos[q.id] || skip.indexOf(q.id) >= 0) return;
      var d = pos[q.id].y * dir;
      if (d > line + 0.5 && d > bd + 0.5) {
        if (!out) out = copyPos(pos);
        var nd = Math.max(line - 0.3, bd);
        out[q.id] = { x: pos[q.id].x, y: nd * dir };
      }
    });
    return out || pos;
  }
  /* is the passer a man the next picture's words or cards need somewhere (the claims prepClaims keeps, the card men)? */
  function passerNeeded(seg, id) {
    var cl = CLAIMS && CLAIMS.get(seg), KE = seg.keys[seg.keys.length - 1];
    if (KE && KE.cardMen && KE.cardMen.indexOf(id) >= 0) return true;
    if (!cl) return false;
    if ((cl.back && cl.back.R === id) || (cl.near && (cl.near.N === id || cl.near.T === id)) || (cl.onside && cl.onside.R === id) || (cl.gap && cl.gap.R === id) || (cl.shot && cl.shot.H === id) || (cl.wing && cl.wing.F === id)) return true;
    return (cl.free || []).some(function (f) { return f.id === id; });
  }
  /* insert a touch (a carry of under a metre, beat bi, `dur` s) before the flight beats[bi]: a new key at bi + 1, at
   * the time of key bi, the ball a stride on toward the pass; the men on the way between the key before and the key
   * after (`pk`: which key field holds the places, 'pos' in build0, the plan's 'pos0' after the legs); every later
   * key and event moves on by dur */
  function touchBefore(keys, beats, bi, events, dur, t0, pk) {
    var b = beats[bi], ka = keys[bi], kb2 = keys[bi + 1];
    var ba = ka.ball0 || ka.ball, bb = kb2.ball0 || kb2.ball, dx = bb.x - ba.x, dy = bb.y - ba.y, dl = Math.sqrt(dx * dx + dy * dy) || 1, st = Math.min(0.8, dl * 0.1);
    var fr = dur / (dur + (kb2.t - ka.t)), pa = ka[pk] || ka.pos, pb = kb2[pk] || kb2.pos, npos = {};
    for (var id in pa) { var q0 = pa[id], q1 = pb[id] || q0; npos[id] = { x: q0.x + (q1.x - q0.x) * fr, y: q0.y + (q1.y - q0.y) * fr }; }
    var nb = { x: ba.x + dx / dl * st, y: ba.y + dy / dl * st, z: 0 };
    var dyr = b.team === 'them' ? -1 : 1;
    if (npos[b.from]) npos[b.from] = { x: nb.x, y: nb.y - dyr * P.BALL_OFF };
    var nk = { t: ka.t, ball: { x: (ka.ball.x - ba.x) + nb.x, y: (ka.ball.y - ba.y) + nb.y, z: 0 }, holder: b.from, poss: ka.poss, pos: npos };
    if (ka.ball0) nk.ball0 = nb;
    if (ka.pos0) { nk.pos0 = npos; nk.pos = copyPos(npos); }
    var tb = { kind: 'carry', touch: true, team: b.team, from: b.from, to: b.from, ball: { x: nb.x, y: nb.y }, dur: dur, holder: b.from, poss: b.team, note: 'touch' };
    keys.splice(bi + 1, 0, nk);
    beats.splice(bi, 0, tb);
    for (var j = bi + 2; j < keys.length; j++) keys[j].t += dur;
    keys[bi + 1].t = ka.t + dur;
    if (events) {
      events.splice(bi, 0, { t: +ka.t.toFixed(3), kind: 'carry', team: b.team, from: b.from, to: b.from, ball: { x: +nb.x.toFixed(2), y: +nb.y.toFixed(2) }, note: 'touch', poss: b.team });
      for (var e = bi + 1; e < events.length; e++) events[e].t = +(events[e].t + dur).toFixed(3);
    }
    return tb;
  }
  /* a2: how long a man starting from a standstill takes to run d metres (MV.legA, MV.legRecv) */
  function legTime(d) { var a = MV.legA, v = MV.legRecv, dd = v * v / (2 * a); return d <= dd ? Math.sqrt(2 * d / a) : v / a + (d - dd) / v; }
  function legReach(T) { var a = MV.legA, v = MV.legV, ta = v / a; return T <= ta ? a * T * T / 2 : v * v / (2 * a) + v * (T - ta); }
  /* a2: the same, for a man already running (velocity v): he may first have to turn round (a small simulation of his
   * legs, 1/40 s steps, straight for the spot) */
  function legTimeFrom(a, b, v) {
    var x = a.x, y = a.y, vx = v.x || 0, vy = v.y || 0, h = 0.025, A = MV.legA, V = MV.legRecv;
    for (var t = 0; t < 8; t += h) {
      var dx = b.x - x, dy = b.y - y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.8) return t;
      var wx = dx / d * V - vx, wy = dy / d * V - vy, w = Math.sqrt(wx * wx + wy * wy), lim = A * h;
      if (w > lim) { wx *= lim / w; wy *= lim / w; }
      vx += wx; vy += wy; x += vx * h; y += vy * h;
    }
    return 8;
  }
  function carryDur(d) { return Math.max(0.5, d / (A2 ? 7.5 : 10.5)); }   /* a2: a man runs with the ball at 7.5 m/s on average (a1: 10.5, up to 16 at the peak of an eased beat) */
  function copyPos(pos) { var o = {}; for (var k in pos) o[k] = { x: pos[k].x, y: pos[k].y }; return o; }
  function dirOf(team) { return team === 'you' ? 1 : -1; }
  function other(team) { return team === 'you' ? 'them' : 'you'; }
  function clampPt(pt) { return { x: P.clamp(pt.x, 2, P.W - 2), y: P.clamp(pt.y, 2, P.L - 2) }; }
  function pt(x, y) { return { x: x, y: y }; }
  /* the far end a team attacks, and its own goal line */
  function attackPt(team) { return { x: 34, y: team === 'you' ? 100 : 5 }; }
  function ownY(team, d) { return team === 'you' ? d : P.L - d; }
  /* metres up the pitch for a team: `d` metres from its own goal line */
  function upY(team, d) { return team === 'you' ? d : P.L - d; }
  function isKeeperP(st, p) { return P.isKeeper(p, st.squad) || P.isKeeper(p, st.opp); }
  function first(p) { return String((p && p.name) || '').split(' ')[0]; }

  /* ------------------------------------------------------------ positions */
  function outfield(st, team) { return (team === 'you' ? st.squad : st.opp).players; }
  function keeperOf(st, team) { return (team === 'you' ? st.squad : st.opp).keeper; }
  /* the man of `team` nearest a point, in the shape the point puts them in */
  function nearestTo(st, team, at, poss, skip) {
    var sh = P.shapeAll(st, at, poss), best = null, bd = 1e9;
    outfield(st, team).forEach(function (p) {
      if (skip && skip[p.id]) return;
      var d = P.dist(sh[p.id], at);
      if (d < bd) { bd = d; best = p; }
    });
    return best ? { p: best, pt: sh[best.id], d: bd } : null;
  }
  /* the man of `team` nearest a point among some lines */
  function pickNear(st, team, at, lines, skip) {
    var sh = P.shapeAll(st, at, team), best = null, bd = 1e9;
    outfield(st, team).forEach(function (p) {
      if ((skip && skip[p.id]) || (lines && lines.indexOf(p.line) < 0)) return;
      var d = P.dist(sh[p.id], at);
      if (d < bd) { bd = d; best = p; }
    });
    if (!best && lines) return pickNear(st, team, at, null, skip);
    return best;
  }
  function skipOf() { var s = {}; for (var i = 0; i < arguments.length; i++) { var a = arguments[i]; if (a) s[a.id || a] = 1; } return s; }

  /* KEY-FRAME POSITIONS: the teams move like teams. Both shapes slide with
   * the ball; the man on the ball is at it; the nearest of the other side
   * presses him from the goal side and the next nearest covers behind that;
   * in the other half one forward of the side on the ball runs on the last
   * defender's shoulder; now and then a full-back runs up the outside of
   * the man on the ball. `extra` pins men where a beat needs them. */
  var STAGED_P = null;   /* kmtree5 a4: the presser keyPos placed last */
  var STAGED = {};   /* mv1: the men the last keyPos call placed on purpose (the presser, the cover, the runner, the overlap) */
  function keyPos(st, ball, holderId, poss, extra, salt, still) {
    var pos = P.shapeAll(st, ball, poss), fixed = {};
    STAGED = {}; STAGED_P = null;
    var hp = holderId ? P.byId(st, holderId) : null;
    var ht = hp ? P.teamOf(st, hp) : poss;
    var hq = null;
    if (holderId && pos[holderId]) {
      hq = { x: P.clamp(ball.x, 0.6, P.W - 0.6), y: P.clamp(ball.y - dirOf(ht) * P.BALL_OFF, 0.6, P.L - 0.6) };
      pos[holderId] = hq;
      fixed[holderId] = 1;
    }
    if (extra) for (var k in extra) { pos[k] = extra[k]; fixed[k] = 1; }
    /* kmtree5 a6 (helper W): the support (the full-back on the ball's side and the nearest midfielders come up with the attack) */
    var sup6 = W6.support && ht && !still ? wwSupport(st, pos, ball, ht, fixed) : [];
    if (ht && hq && !isKeeperP(st, hp) && !still && GUARD.press) {
      var def = other(ht), dir = dirOf(ht);
      var ds = outfield(st, def).filter(function (p) { return !fixed[p.id]; })
        .sort(function (a, b) { return P.dist(pos[a.id], ball) - P.dist(pos[b.id], ball); });
      /* kmtree5 a6 (helper W): a defender the beat itself puts on the man with the ball (the man the words name, who
       * stays with him while he holds it) IS the presser: no second man is sent to the same place */
      var pin6 = null;
      if (W6.hold && extra) for (var k6 in extra) { var m6 = P.byId(st, k6); if (m6 && P.teamOf(st, m6) === def && P.dist(extra[k6], ball) < 4.5) pin6 = k6; }
      if (pin6) { STAGED[pin6] = 1; STAGED_P = pin6; }
      /* the presser: on the goal side of the ball, close */
      if (!pin6 && ds[0] && P.dist(pos[ds[0].id], ball) < 26) {
        STAGED[ds[0].id] = 1; STAGED_P = ds[0].id;
        pos[ds[0].id] = { x: P.clamp(ball.x + (34 - ball.x) * 0.06 + (P.hash01(salt, ds[0].line, ds[0].slot) - 0.5) * 2, 0.9, P.W - 0.9), y: P.clamp(ball.y + dir * 3.0, 0.9, P.L - 0.9) };
        fixed[ds[0].id] = 1;
      }
      /* the cover: further back, towards the middle */
      if (ds[1] && P.dist(pos[ds[1].id], ball) < 30) {
        var cq = pos[ds[1].id];
        STAGED[ds[1].id] = 1;
        pos[ds[1].id] = { x: P.lerp(cq.x, ball.x + (34 - ball.x) * 0.35, 0.55), y: P.lerp(cq.y, ball.y + dir * 9, 0.6) };
      }
      var bu = ht === 'you' ? ball.y : P.L - ball.y;
      /* a forward run on the last defender's shoulder */
      if (bu > 42 && GUARD.run) {
        var backs = outfield(st, def).filter(function (p) { return p.line === 0; });
        if (backs.length) {
          var lastY = backs.reduce(function (m, p) { return dir > 0 ? Math.max(m, pos[p.id].y) : Math.min(m, pos[p.id].y); }, dir > 0 ? -1 : 999);
          var fws = outfield(st, ht).filter(function (p) { return p.line === 2 && !fixed[p.id]; });
          if (fws.length) {
            var rn = fws[Math.floor(P.hash01(salt, 'run') * fws.length)], rq = pos[rn.id];
            STAGED[rn.id] = 1;
            pos[rn.id] = { x: P.lerp(rq.x, 34, 0.15), y: P.clamp(lastY - dir * 0.8, 3, P.L - 3) };
          }
        }
      }
      /* the overlap: the full-back on the ball's side runs past it, outside */
      var lane = P.laneOfX(ball.x);
      if (!W6.support && lane !== 1 && bu > 38 && bu < 88 && P.hash01(salt, 'ovl') < 0.45) {   /* (kmtree5 a6, helper W: with the support on he comes up behind the ball in every picture; this one drew him ahead of it in 45% of key pictures, a different draw at every beat) */
        var fb = outfield(st, ht).filter(function (p) { return p.line === 0 && P.laneOf(p, ht) === lane && !fixed[p.id]; })[0];
        if (fb) { pos[fb.id] = { x: P.clamp(ball.x + (lane === 0 ? -4 : 4), 2, P.W - 2), y: ball.y + dir * 4 }; STAGED[fb.id] = 1; }
      }
    }
    return P.tidy(pos, fixed);
  }
  /* kmtree5 a6 (helper W) part 1, THE SUPPORT. With the ball in the last W6T.from m, pitch.js shape() (which gameplay
   * reads, so it stays) keeps the back line 58 m from its own goal and the midfield 20 to 25 m behind the ball: the
   * full-back a card needs was always a 40 to 55 m run away. In the DRAWN picture only, the side with the ball has:
   *   its wide defender on the ball's side W6T.fbBack m behind the ball and W6T.fbOut m outside it, the one on the
   *   other side W6T.fbFar m behind it (both W6T.fbMid m behind when the ball is in the middle), never further up
   *   than the edge of the box, never pulled back;
   *   its midfielders no further behind the ball than W6T.midBack m (those in the ball's part of the pitch) to
   *   W6T.midBack2 m (those across the pitch), each in his own lane: nobody is pulled toward the ball (W1).
   * Every place is a smooth function of where the ball is (no man is picked by being the nearest: a pick that flips
   * as the ball moves makes two men swap places). `skip`: men who are placed already (the man on the ball, the men
   * the beat or the scene names). Changes `pos`, returns the ids it moved. */
  function wwSupport(st, pos, ball, team, skip) {
    var bu = team === 'you' ? ball.y : P.L - ball.y, f = Math.max(0, Math.min(1, (bu - (P.L - W6T.from - W6T.blend)) / W6T.blend));
    if (f <= 0) return [];
    var moved = [], cap = P.L - 19, opp = [];
    outfield(st, other(team)).forEach(function (o) { if (pos[o.id]) opp.push(pos[o.id]); });
    function uOf(q) { return team === 'you' ? q.y : P.L - q.y; }
    function at(x, u) { return { x: P.clamp(x, 2, P.W - 2), y: team === 'you' ? u : P.L - u }; }
    outfield(st, team).forEach(function (p) {
      var q = pos[p.id]; if (!q || (skip && skip[p.id]) || p.line > 1) return;
      var lane = P.laneOf(p, team), u1, x1 = q.x;
      if (p.line === 0 && lane !== 1 || (p.line === 1 && lane !== 1 && wideBack(st, team, lane) === p)) {
        /* a wide defender (with three at the back: the wide midfielder of that side) */
        var sgn = lane === 0 ? -1 : 1, s = Math.max(-1, Math.min(1, (ball.x - 34) * sgn / 10));   /* 1: the ball is on his side */
        if (!W6T.supFar && s <= 0) return;   /* (the narrow support: only the wide defender on the ball's side) */
        u1 = bu - (s >= 0 ? P.lerp(W6T.supFar ? W6T.fbMid : W6T.fbFar, W6T.fbBack, s) : P.lerp(W6T.fbMid, W6T.fbFar, -s));
        if (s > 0) x1 = P.lerp(q.x, P.clamp(ball.x + sgn * W6T.fbOut, 4, P.W - 4), s);
      } else if (p.line === 1) {
        if (!W6T.supMids) return;
        u1 = bu - Math.max(W6T.midBack, Math.min(W6T.midBack2, W6T.midBack + (Math.abs(q.x - ball.x) - 8) * 0.3));
      } else return;
      u1 = Math.min(u1, cap);
      if (uOf(q) >= u1 - 0.5) return;
      /* (and he does not come up to stand among their men: a place W6T.room m clear of every one of theirs, a few
       * metres deeper or higher if need be, never nearer the ball than 9 m; their forwards wait on about that line) */
      var nq = at(P.lerp(q.x, x1, f), P.lerp(uOf(q), u1, f)), best = nq, bd = -1;
      [0, -2.5, 2.5, -5, 5, -7.5].some(function (du) {
        var u2 = P.lerp(uOf(q), u1, f) + du; if (u2 > cap || u2 < uOf(q)) return false;
        var c = at(nq.x, u2); if (P.dist(c, ball) < 9) return false;
        var md = 99; opp.forEach(function (o) { md = Math.min(md, P.dist(o, c)); });
        if (md > bd) { bd = md; best = c; }
        return md >= W6T.room;
      });
      pos[p.id] = best; moved.push(p.id);
    });
    return moved;
  }
  /* kmtree5 a6 (helper W) part 1b, EVERY LIVE CARD'S MAN IS WITHIN REACH OF WHERE HIS CARD NEEDS HIM. A card of yours
   * says who gets the ball (o.to) and, in its own outcomes, the zone the ball is in afterwards (ballTo); the next
   * decision then starts in that zone, in that man's own lane (pitch.js startOf). So where each live card would need
   * its man is known when the menu is: he is drawn no further than W6T.reach m from that spot (W6T.reachRun m for a
   * card that sends him on a run: "runs", "running", "to run"), on the line from where the picture had him. All live
   * cards' men, the same rule: no card looks chosen before the user chooses. Never beyond their second-last man
   * (the picture shows no offside), never within 9 m of the ball (W1), never a keeper, never a man the scene or
   * another rule has placed. The man a pass BACK is for is not moved at all, and the support leaves him where he is
   * (returned as the list of such men). Only for your attack: a card of theirs is not on the menu. Changes endPos and `moved`. */
  var YOU_Y6 = [[21, 36], [45, 65], [74, 86], [92, 99]];
  function wwNeedSpot(st, o) {
    var man = o.to, zi = null;
    (o.outcomes || []).forEach(function (x) { if (zi == null && x && x.band === 'good' && typeof x.ballTo === 'number' && x.ballTo >= 0 && x.ballTo <= 3) zi = x.ballTo; });
    if (zi == null) (o.outcomes || []).forEach(function (x) { if (zi == null && x && x.band === 'mixed' && typeof x.ballTo === 'number' && x.ballTo >= 0 && x.ballTo <= 3) zi = x.ballTo; });
    if (zi == null || !man) return null;
    var home = P.homeOf(man, 'you', st.squad.formation), lb = P.LANES[P.laneOf(man, 'you')];
    var x = P.clamp(home.x, lb[0] + 2.5, lb[1] - 2.5);
    if (zi === 3) x = P.clamp(x, P.BOX_X[0] + 2.2, P.BOX_X[1] - 2.2);
    return { x: x, y: (YOU_Y6[zi][0] + YOU_Y6[zi][1]) / 2, zone: zi };
  }
  function wwStageAll(st, pend, S, endPos, keep, moved) {
    var who = pend.attacking || (pend.moment.sit && pend.moment.sit.who) || 'you';
    var back = [];
    if (who !== 'you' || S.team !== 'you' || S.special) return back;
    var rl = (S.scene && S.scene.roles) || {}, role = {}; for (var r in rl) if (rl[r] && rl[r].id) role[rl[r].id] = 1;
    /* their second-last man in the picture: nobody is staged beyond him */
    var ys = []; outfield(st, 'them').concat([keeperOf(st, 'them')]).forEach(function (q) { if (q && endPos[q.id]) ys.push(endPos[q.id].y); });
    ys.sort(function (a, b) { return b - a; }); var line = ys.length > 1 ? ys[1] : P.L;
    (pend.moment.options || []).forEach(function (o) {
      var man = o.to;
      if (o.disabled || !man || !man.id || man.id === S.holderId || keep[man.id] || role[man.id] || moved.indexOf(man.id) >= 0 || !endPos[man.id] || isKeeperP(st, man) || P.teamOf(st, man) !== 'you') return;
      var Q = wwNeedSpot(st, o); if (!Q) return;
      /* a pass back (the card leaves the ball a zone nearer your goal): its man stays where the shape has him, behind
       * the ball; he is not moved, and not brought up either (the words say "back") */
      if (typeof pend.zoneIndex === 'number' && Q.zone < pend.zoneIndex) { back.push(man.id); return; }
      var cur = endPos[man.id], d = P.dist(cur, Q), mx = /\brun(?:s|ning)?\b/.test(String(o.label || '')) ? W6T.reachRun : W6T.reach;
      if (d <= mx) return;
      var tg = { x: Q.x + (cur.x - Q.x) * mx / d, y: Q.y + (cur.y - Q.y) * mx / d };
      if (tg.y > line - 0.8 && tg.y > cur.y) tg.y = Math.max(cur.y, line - 0.8);   /* (not beyond their second-last man, unless the picture already had him there) */
      var db = P.dist(tg, S); if (db < 9) { var ux = (tg.x - S.x) / (db || 1), uy = (tg.y - S.y) / (db || 1); if (!db) { ux = 0; uy = -1; } tg = { x: S.x + ux * 9, y: S.y + uy * 9 }; }
      if (P.dist(tg, cur) < 2) return;
      endPos[man.id] = clampPt(tg); moved.push(man.id);
    });
    return back;
  }
  /* the deepest wide man of a side's lane (the full-back; with three at the back, the wide midfielder) */
  function wideBack(st, team, lane) {
    return outfield(st, team).filter(function (p) { return P.laneOf(p, team) === lane && p.line <= 1; }).sort(function (a, b) { return a.line - b.line; })[0] || null;
  }

  /* mv1: THE REACH LIMIT. A man away from the ball ends a key frame no
   * further from where he was at the start of the segment than he can run
   * in `secs` from a standing start (MV.reach, 4.5 m/s on average at most,
   * and no more than speeding up at 6 m/s/s and slowing down again allows,
   * plus a metre); men in
   * `keep` and anyone within 7 m of the ball are left where the director
   * put them. s0 moved the whole team to the ball's new shape in a 1.4 s
   * result (8 m/s median, 37 m/s at the top). Returns a new map. */
  function reachLimit(st, pos, from, secs, keep, ball, fast) {
    if (!from) return pos;
    var out = {}, frac = {}, group = {};
    for (var id in pos) {
      var q = pos[id], a = from[id];
      out[id] = q;
      if (!a || (keep && keep[id]) || (ball && P.dist(q, ball) < 7)) continue;
      var man = P.byId(st, id);
      /* in the next moment's picture the forwards of the side on the ball are
       * where the moment needs them (in the box for a cross): they make the run */
      if (fast && fast !== true && man && man.line === 2 && P.teamOf(st, man) === fast && !(P.MOVE && P.MOVE.m8 && (q.y - a.y) * dirOf(fast) < 0)) continue;   /* (m8: not when the run is back toward his own goal) */
      var kp = isKeeperP(st, man), max = (fast ? MV.reachPic * secs + 2 : Math.min((kp ? MV.reachK : MV.reach) * secs, MV.reachA * secs * secs / 4) + 1), d = P.dist(q, a);
      frac[id] = d > max ? max / d : 1;
      /* a back line and a midfield line move as a line: every man of it
       * goes the same share of the way (the share of the man with furthest to go) */
      if (man && !kp && !MV.noLine && (man.line === 0 || man.line === 1)) { var gk = P.teamOf(st, man) + man.line; (group[gk] = group[gk] || []).push(id); }
    }
    for (var g in group) {
      var fmin = 1; group[g].forEach(function (k) { fmin = Math.min(fmin, frac[k]); });
      group[g].forEach(function (k) { frac[k] = fmin; });
    }
    for (var id2 in frac) {
      if (frac[id2] >= 1) continue;
      var q2 = pos[id2], a2 = from[id2];
      out[id2] = { x: a2.x + (q2.x - a2.x) * frac[id2], y: a2.y + (q2.y - a2.y) * frac[id2] };
    }
    /* and a back line stands at one depth: each of its men steps up to 3 m
     * toward the line's middle depth (full-backs a stride higher, as the shape has them) */
    for (var g2 in group) {
      if (MV.noLine || g2.slice(-1) !== '0' || group[g2].length < 3) continue;
      var tm = g2.slice(0, -1), dir = tm === 'you' ? 1 : -1, my = 0, L2 = group[g2];
      L2.forEach(function (k) { my += out[k].y; }); my /= L2.length;
      L2.forEach(function (k) {
        var dy = my - out[k].y;
        out[k] = { x: out[k].x, y: out[k].y + Math.max(-3, Math.min(3, dy)) };
      });
    }
    return out;
  }

  /* ------------------------------------------------------------ the plan */
  /* A plan is a list of beats; each ends somewhere: { kind, team, from, to,
   * ball (where the ball is when it ends), dur, holder (after), poss (after),
   * note, pin (men whose position this beat pins) }. */
  function Planner(st, R, start) {
    this.st = st; this.R = R;
    this.cur = { ball: { x: start.ball.x, y: start.ball.y }, holder: start.holder, team: start.team };
    this.beats = [];
    this.backs = 0;
    /* kmtree5 a8 (helper K): where every man is when the picture starts (pos0), the last place the plan needed each
     * man and when (anc), and where each man is by now if he has drifted with his team's shape (est: build0's own
     * rule, reachLimit, run beat by beat). Read by eta() and where(); nothing else reads them. */
    this.pos0 = start.pos || null; this.anc = {}; this.est = null; this.kick = false; this.ball0 = { x: start.ball.x, y: start.ball.y };
  }
  Planner.prototype.time = function () { return this.beats.reduce(function (a, b) { return a + b.dur; }, 0); };
  Planner.prototype.push = function (b) {
    if (A2 && b.kind === 'out') b.dur = Math.max(b.dur, MV.legDead);   /* a2: the ball goes out, and the men pull up and walk to the restart before the picture cuts to it */
    /* kmtree5 a8 (helper K, for the lead; helper T2's proposal a7/t2_shot.patch.txt, switch `shot`): a shot, and a ball
     * that goes to the keeper's hands, takes at least a ball's time for its distance at 30 m/s (a saved shot always took
     * 0.45 s and a blocked one 0.35 s, whatever the distance: 26 m in 0.45 s is 58 m/s). The keeper's dive is timed to
     * the beat, so it follows. It adds time: 0.14 s a match on T2's measurement. */
    if (K8.shot && (b.kind === 'shot' || b.kind === 'save') && this.cur.ball && b.ball) b.dur = Math.max(b.dur, P.dist(this.cur.ball, b.ball) / 30);
    if (K8.foul && b.kind === 'foul') k8Foul(this, b);   /* kmtree5 a8 (helper K): the fouled man runs with the ball to where the two can meet */
    var pb8 = this.cur.ball;
    this.beats.push(b);
    this.cur = { ball: { x: b.ball.x, y: b.ball.y, z: b.ball.z || 0 }, holder: b.holder, team: b.poss };
    if (this.pos0 && k8On()) k8Note(this, b, pb8);   /* kmtree5 a8 (helper K) */
    return b;
  };
  /* kmtree5 a8 (helper K): THE EARLIEST A MAN CAN BE AT A PLACE, in seconds from the start of the picture: from the
   * last place the plan needed him (or from where the picture starts), or from where the shape has carried him by
   * now, whichever is sooner, at his legs' speed (legTime), after K8T.react s. */
  Planner.prototype.where = function (id) { return (this.est && this.est[id]) || (this.pos0 && this.pos0[id]) || null; };
  Planner.prototype.eta = function (id, at) {
    var a = this.anc[id], p0 = a ? a.p : this.pos0 && this.pos0[id], e = this.est && this.est[id];
    var t2 = p0 ? (a ? a.t : 0) + k8Time(P.dist(p0, at)) + K8T.react : 1e9, t1 = e ? this.time() + k8Time(P.dist(e, at)) + K8T.react : 1e9;
    var t = Math.min(t1, t2);
    return t > 1e8 ? 0 : t;
  };
  /* (a man's time for d metres as the plan reckons it: from a standstill, MV.legA, then K8T.vRun m/s: what the legs
   * really average over a long run off the ball, a little under their top speed) */
  function k8Time(d) { var a = MV.legA, v = K8T.vRun, dd = v * v / (2 * a); return d <= dd ? Math.sqrt(2 * d / a) : v / a + (d - dd) / v; }
  function k8Run(T) { var a = MV.legA, v = K8T.vRun, ta = v / a; return T <= 0 ? 0 : T <= ta ? a * T * T / 2 : v * v / (2 * a) + v * (T - ta); }   /* (and how far he gets in T s) */
  function k8Note(pl, b, prevBall) {
    var t1 = pl.time(), id, st = pl.st;
    try { pl.est = reachLimit(st, P.shapeAll(st, b.ball, b.poss || pl.cur.team), pl.est || pl.pos0, Math.max(0.05, b.dur), null, null); } catch (e) { pl.est = pl.est || pl.pos0; }
    pl.est = copyPos(pl.est);
    function at(i, p, t) { if (!i || !p) return; pl.anc[i] = { p: { x: p.x, y: p.y }, t: t }; if (t >= t1 - 1e-6) pl.est[i] = { x: p.x, y: p.y }; }
    if (b.from && b.from !== b.to && b.from !== b.holder) { at(b.from, prevBall, t1 - b.dur); if (pl.est[b.from]) pl.est[b.from] = { x: prevBall.x, y: prevBall.y }; }
    if (b.kind !== 'out') { at(b.to, b.ball, t1); at(b.holder, b.ball, t1); }
    if (b.pin) for (id in b.pin) at(id, b.pin[id], t1);
  }
  Planner.prototype.last = function () { return this.beats[this.beats.length - 1] || null; };
  Planner.prototype.pass = function (toP, at, kind, note, o) {
    o = o || {};
    var c = this.cur, d = P.dist(c.ball, at), tm = P.teamOf(this.st, toP);
    var b = { kind: kind || 'pass', team: o.team || c.team, from: c.holder, to: toP.id, ball: o.noClamp ? { x: at.x, y: at.y } : clampPt(at),
      dur: o.dur || passDur(d) * (o.slow || 1), holder: o.holder !== undefined ? o.holder : toP.id, poss: o.poss || tm,
      note: note || (d > 30 ? 'long ball' : null) };
    if (o.pin) b.pin = o.pin;
    return this.push(b);
  };
  Planner.prototype.carry = function (at, kind, note, past) {
    var c = this.cur, d = P.dist(c.ball, at);
    var b = { kind: kind || 'carry', team: c.team, from: c.holder, to: c.holder, ball: clampPt(at), dur: carryDur(d), holder: c.holder, poss: c.team, note: note || null };
    if (past) { b.past = past.id; b.pin = {}; }
    return this.push(b);
  };
  /* the ball is won by `winner`: a tackle where it is, or a pass cut out */
  Planner.prototype.win = function (winner, kind, at, note) {
    var c = this.cur, R = this.R, tm = P.teamOf(this.st, winner);
    if (kind === 'interception') {
      var ahead = at || clampPt({ x: c.ball.x + (R() - 0.5) * 10, y: c.ball.y + dirOf(c.team) * (7 + R() * 6) });
      return this.push({ kind: 'interception', team: tm, from: c.holder, to: winner.id, ball: clampPt(ahead), dur: passDur(P.dist(c.ball, ahead)) * 0.85,
        holder: winner.id, poss: tm, note: note || null });
    }
    var spot = at || clampPt({ x: c.ball.x + (R() - 0.5) * 2, y: c.ball.y - dirOf(c.team) * 1.2 });
    /* kmtree5 a8 (helper K): A TACKLE THE WORDS NAME, BY A MAN WHO IS NOT THERE YET (a result: "X loses it to Y" with Y
     * 6 to 17 m away, 14 of 39 on a8; the ball then ran to Y alone). The man on the ball runs with it toward Y
     * (K8T.vAnt m/s, K8T.winMax s at most) and Y takes it from him where the two meet; the tackle's place moves
     * there. Not where helper K's own stagings have already brought the two together (k8busy). */
    if (K8.tackle && this.pos0 && !this.k8busy && c.holder && !isKeeperP(this.st, P.byId(this.st, c.holder)) && winner.id !== c.holder) {
      var now8 = this.time(), e8 = this.where(winner.id);
      if (e8 && this.eta(winner.id, spot) - now8 > 0.45) {
        var d8 = P.dist(e8, c.ball), ux8 = (e8.x - c.ball.x) / (d8 || 1), uy8 = (e8.y - c.ball.y) / (d8 || 1), M8 = null, D8 = 0;
        for (D8 = 0.3; D8 <= K8T.winMax + 1e-6; D8 += 0.1) {
          M8 = clampPt({ x: c.ball.x + ux8 * Math.min(Math.max(0, d8 - 2), K8T.vAnt * D8), y: c.ball.y + uy8 * Math.min(Math.max(0, d8 - 2), K8T.vAnt * D8) });
          if (this.eta(winner.id, M8) <= now8 + D8 + 0.05) break;
        }
        if (M8 && P.dist(M8, c.ball) > 0.8) {
          this.k8busy = true;
          var cb8 = this.carry(M8); cb8.dur = Math.max(0.3, Math.min(D8, K8T.winMax)); cb8.k8 = 'ant'; K8S.ant++; K8S.win++;
          this.k8busy = false;
          c = this.cur; spot = clampPt({ x: M8.x, y: M8.y });
        }
      }
    }
    return this.push({ kind: 'tackle', team: tm, from: c.holder, to: winner.id, ball: clampPt(spot), dur: 0.5, holder: winner.id, poss: tm, note: note || null });
  };

  /* ------------------------------------------------------------ choosing a man */
  /* a team-mate to pass to, towards `toward`: each team-mate a few metres on
   * from his place in the shape, scored for how far forward it takes the
   * ball, how long the pass is, how free he is; one of the best three,
   * weighted, so the same situation does not always pick the same man.
   * Never straight back to the man who just passed it (no ping-pong). */
  function pickMate(pl, toward, o) {
    o = o || {};
    var c = pl.cur, R = pl.R, st = pl.st;
    var sh = P.shapeAll(st, c.ball, c.team), opp = outfield(st, other(c.team));
    /* kmtree5 a8 (helper K): o.real: the men where they are by now (Planner.where), not where the shape would have
     * them: for the balls helper K's own stagings play (a pass to a man 15 m from his shape place is a pass he
     * cannot be at, and everything the plan does after it is then drawn somewhere else) */
    if (o.real && pl.est) { var sh8 = {}; for (var id8 in sh) sh8[id8] = pl.est[id8] || sh[id8]; sh = sh8; }
    var tdx = toward.x - c.ball.x, tdy = toward.y - c.ball.y, td = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
    var lb = pl.last(), lastFrom = lb && (lb.kind === 'pass' || lb.kind === 'kickoff') ? lb.from : null;
    var list = [];
    outfield(st, c.team).forEach(function (p) {
      if (p.id === c.holder || (p.id === lastFrom && GUARD.pingpong) || (o.skip && o.skip[p.id])) return;
      var q = sh[p.id], rdx = toward.x - q.x, rdy = toward.y - q.y, rd = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
      var step = Math.min(o.run || 6, rd);
      var rp = clampPt({ x: q.x + rdx / rd * step, y: q.y + rdy / rd * step });
      var dx = rp.x - c.ball.x, dy = rp.y - c.ball.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < (o.min || 8) || d > (o.max || 26)) return;
      var gain = (dx * tdx + dy * tdy) / td;
      if (o.lateral) gain = Math.abs(dx) - Math.max(0, -dy * dirOf(c.team)) * 1.5;
      if (o.back) gain = -gain;
      if (!o.back && !o.lateral && gain > td - 6) return;       // never past the place the play is going to
      var marked = 99;
      opp.forEach(function (x) { marked = Math.min(marked, P.dist(sh[x.id], rp)); });
      var score = gain - Math.max(0, d - 20) * 0.6 - (marked < 3.5 ? 5 : 0);
      list.push({ p: p, pt: rp, gain: gain, score: score, d: d });
    });
    list.sort(function (a, b) { return b.score - a.score; });
    if (!list.length) return null;
    var top = list.slice(0, 3), w = [3, 2, 1.2], tot = 0, i;
    for (i = 0; i < top.length; i++) tot += w[i];
    var r = R() * tot;
    for (i = 0; i < top.length; i++) { r -= w[i]; if (r <= 0) return top[i]; }
    return top[0];
  }

  /* ------------------------------------------------------------ open play */
  /* VARIETY: one move of the side on the ball towards `to`. Short passes
   * forward, a switch of play, a one-two, a run with the ball, a man gone
   * past, a pass back, a long ball: picked by weight from what makes sense
   * where the ball is. Returns false when nothing fits. */
  function move(pl, to, o) {
    o = o || {};
    var st = pl.st, R = pl.R, c = pl.cur, team = c.team, dir = dirOf(team);
    var d = P.dist(c.ball, to);
    var wide = Math.abs(c.ball.x - 34) > 14;
    var opts = [
      ['forward', 4.2], ['carry', 1.4], ['dribble', 0.9], ['onetwo', d > 22 ? 1.0 : 0],
      ['switch', (Math.abs(to.x - c.ball.x) > 22 || !wide) && d > 20 ? 1.1 : 0.3],
      ['back', pl.backs < 1 && pl.beats.length > 0 ? 0.7 : 0], ['long', d > 38 ? 0.9 : 0]
    ];
    if (o.noBall) opts = opts.filter(function (x) { return x[0] === 'forward' || x[0] === 'carry'; });
    if (!GUARD.variety) opts = [['forward', 1]];
    var tot = opts.reduce(function (a, x) { return a + x[1]; }, 0), r = R() * tot, kind = 'forward';
    for (var i = 0; i < opts.length; i++) { r -= opts[i][1]; if (r <= 0) { kind = opts[i][0]; break; } }
    var h = P.byId(st, c.holder);
    if (isKeeperP(st, h) && (kind === 'carry' || kind === 'dribble' || kind === 'onetwo')) kind = 'forward';
    var m;
    switch (kind) {
      case 'carry': {
        var cu = Math.min(1, (7 + R() * 6) / Math.max(1, d));
        pl.carry({ x: P.lerp(c.ball.x, to.x, cu) + (R() - 0.5) * 5, y: P.lerp(c.ball.y, to.y, cu) });
        return true;
      }
      case 'dribble': {
        /* past the nearest of theirs: he is left where he was, behind */
        var sh = P.shapeAll(st, c.ball, team), foe = null, fd = 1e9;
        outfield(st, other(team)).forEach(function (p) {
          var q = sh[p.id]; if ((q.y - c.ball.y) * dir < -1) return;
          var dd = P.dist(q, c.ball); if (dd < fd) { fd = dd; foe = p; }
        });
        if (!foe || fd > 16) { pl.carry({ x: P.lerp(c.ball.x, to.x, 0.3), y: P.lerp(c.ball.y, to.y, 0.3) }); return true; }
        var fq = sh[foe.id];
        var beyond = clampPt({ x: fq.x + (fq.x < c.ball.x ? 2.5 : -2.5), y: fq.y + dir * 4 });
        if (P4 && !PBRK.dribble) {
          /* kmtree5 a4 (helper P, note 8a: "defenders step out of the way"): the man he goes past steps IN to meet him,
           * on his line to goal, a stride ahead of the ball; then the carrier goes past him, and he turns and chases,
           * a couple of metres behind (a3 walked him sideways back to his shape spot) */
          var mt = clampPt({ x: P.lerp(c.ball.x, fq.x, 0.65), y: P.lerp(c.ball.y, fq.y, 0.65) - dir * 1.2 });
          var b1 = pl.carry(mt, 'dribble'); b1.pin = {}; b1.pin[foe.id] = clampPt({ x: mt.x, y: mt.y + dir * 2.4 }); b1.meets = foe.id;
          var bx = clampPt({ x: mt.x + (fq.x < c.ball.x ? 2.5 : -2.5) + (beyond.x - fq.x) * 0.3, y: mt.y + dir * 6 });
          var b2 = pl.carry(bx, 'dribble', 'past', foe);
          b2.pin[foe.id] = clampPt({ x: P.lerp(mt.x, bx.x, 0.5), y: mt.y + dir * 2.4 });
          return true;
        }
        var b = pl.carry(beyond, 'dribble', 'past', foe);
        b.pin[foe.id] = { x: fq.x, y: fq.y - dir * 0.5 };
        return true;
      }
      case 'onetwo': {
        m = pickMate(pl, to, { max: 16, min: 7 });
        if (!m) break;
        var passer = P.byId(st, c.holder), start = { x: c.ball.x, y: c.ball.y };
        var runTo = clampPt({ x: P.lerp(start.x, to.x, 0.25) + (R() - 0.5) * 4, y: start.y + dir * (9 + R() * 4) });
        var pin1 = {}; pin1[passer.id] = { x: P.lerp(start.x, runTo.x, 0.5), y: P.lerp(start.y, runTo.y, 0.5) };
        pl.pass(m.p, m.pt, 'pass', 'one-two', { pin: pin1 });
        pl.pass(passer, runTo, 'pass', 'one-two');
        return true;
      }
      case 'switch': {
        var far = null, fbest = -1, sh2 = P.shapeAll(st, c.ball, team);
        var lb2 = pl.last(), lf2 = lb2 && (lb2.kind === 'pass' || lb2.kind === 'kickoff') && GUARD.pingpong ? lb2.from : null;
        outfield(st, team).forEach(function (p) {
          if (p.id === c.holder || p.id === lf2) return;
          var q = sh2[p.id], lat = Math.abs(q.x - c.ball.x), back = (c.ball.y - q.y) * dir;
          if (lat < 22 || back > 6 || P.dist(q, c.ball) > 48) return;
          var s = lat + R() * 8;
          if (s > fbest) { fbest = s; far = { p: p, pt: clampPt({ x: q.x, y: q.y + dir * 3 }) }; }
        });
        if (!far) break;
        pl.pass(far.p, far.pt, 'pass', 'switch of play');
        return true;
      }
      case 'back': {
        m = pickMate(pl, to, { back: true, max: 20, min: 7 });
        if (!m) break;
        pl.backs++;
        pl.pass(m.p, m.pt, 'pass', 'back pass');
        return true;
      }
      case 'long': {
        m = pickMate(pl, to, { min: 28, max: 50, run: 9 });
        if (!m) break;
        pl.pass(m.p, m.pt, 'pass', 'long ball');
        return true;
      }
    }
    m = pickMate(pl, to, {});
    if (m && m.gain > 2) { pl.pass(m.p, m.pt); return true; }
    var cu2 = Math.min(1, 9 / Math.max(1, d));
    pl.carry({ x: P.lerp(c.ball.x, to.x, cu2), y: P.lerp(c.ball.y, to.y, cu2) });
    return true;
  }

  /* THE BALL CHANGES SIDES, shown: a tackle, a pass cut out, a pass that
   * goes out for a throw-in, or a ball headed away to a team-mate */
  function turnover(pl, wins, near, want) {
    var st = pl.st, R = pl.R, c = pl.cur, loses = c.team;
    var r = R(), w = nearestTo(st, wins, near || c.ball, loses, {});
    if (!w) return;
    var nearLine = Math.min(Math.abs(c.ball.x), Math.abs(P.W - c.ball.x)) < 18;
    if (r < 0.18 && nearLine) {
      /* the pass goes out: their throw-in */
      var side = c.ball.x < 34 ? -0.9 : P.W + 0.9, outAt = { x: side, y: P.clamp(c.ball.y + dirOf(loses) * (6 + R() * 6), 6, P.L - 6) };
      var lbt = pl.last(), tgt = nearestTo(st, loses, { x: P.clamp(outAt.x, 2, P.W - 2), y: outAt.y }, loses, skipOf(c.holder, lbt && lbt.kind === 'pass' ? lbt.from : null));
      pl.pass(tgt ? tgt.p : w.p, outAt, 'pass', null, { noClamp: true, holder: null, poss: loses, dur: passDur(P.dist(c.ball, outAt)) });
      var thrower = nearestTo(st, wins, { x: P.clamp(outAt.x, 2, P.W - 2), y: outAt.y }, wins, {});
      var th = thrower ? thrower.p : w.p;
      var pin = {}; pin[th.id] = { x: P.clamp(outAt.x, 0.6, P.W - 0.6), y: outAt.y };
      pl.push({ kind: 'out', team: wins, from: null, to: th.id, ball: { x: outAt.x, y: outAt.y }, dur: 0.6, holder: th.id, poss: wins, note: 'throw-in', pin: pin });
      var mate = pickMate(pl, attackPt(wins), { max: 18, min: 7 });
      if (mate) pl.pass(mate.p, mate.pt, 'pass', 'throw-in');
      return;
    }
    if ((K8.cut || K8.tackle) && pl.pos0 && k8Win(pl, wins, near || c.ball, r, want)) return;   /* kmtree5 a8 (helper K): won by a man who can be there */
    if (r < 0.3) {
      /* a pass forward, headed away by one of theirs to a team-mate */
      var fwd = pickMate(pl, attackPt(loses), { min: 12, max: 30 });
      if (fwd) {
        var header = nearestTo(st, wins, fwd.pt, loses, {});
        if (header) {
          var hpt = clampPt({ x: fwd.pt.x, y: fwd.pt.y });
          pl.pass(fwd.p, hpt, 'pass', null, { holder: header.p.id, poss: wins });
          pl.beats[pl.beats.length - 1].kind = 'interception';
          pl.beats[pl.beats.length - 1].team = wins;
          pl.beats[pl.beats.length - 1].to = header.p.id;
          pl.beats[pl.beats.length - 1].note = 'header';
          return;
        }
      }
    }
    if (r < 0.62) pl.win(w.p, 'interception');
    else pl.win(w.p, 'tackle');
  }
  /* kmtree5 a8 (helper K): THE BALL CHANGES SIDES BY A MAN WHO CAN BE AT IT. Returns true when it staged it.
   *   a tackle (the old draw's share, r >= 0.62): the man of theirs who can soonest be at the man on the ball; when
   *     he is not there yet, the man on the ball runs with it toward him (K8T.vHold m/s, K8T.antMax s at most) and
   *     is tackled where they meet. Nobody can: a pass cut out instead.
   *   a header (r < 0.3; never in the first balls after a kick-off): a pass forward headed away by the man of
   *     theirs who can soonest be under it. Nobody can: a pass cut out.
   *   a pass cut out: the man on the ball passes toward a team-mate up the pitch; the man of theirs who can be on
   *     its line when the ball gets there cuts it out (the one with most time to spare, nearer `near`, and `want`,
   *     the man the play needs on the ball next, before the others). Nobody can: the pass is misplaced into the
   *     lane of one of them, who steps to it (k8Lane). */
  function k8Win(pl, wins, near, r, want) {
    var st = pl.st, R = pl.R, c = pl.cur, loses = c.team, now = pl.time(), hp = c.holder ? P.byId(st, c.holder) : null;
    if (K8.tackle && r >= 0.62 && hp && !isKeeperP(st, hp)) {
      var bt = null;
      outfield(st, wins).forEach(function (q) {
        var e = pl.where(q.id); if (!e || q.id === pl.endId) return;
        var d = P.dist(e, c.ball), ux = (e.x - c.ball.x) / (d || 1), uy = (e.y - c.ball.y) / (d || 1);
        for (var D = 0; D <= K8T.antMax + 1e-6; D += 0.25) {
          var run = Math.min(Math.max(0, d - 2), K8T.vHold * D), M = clampPt({ x: c.ball.x + ux * run, y: c.ball.y + uy * run });
          if (pl.eta(q.id, M) <= now + D + 0.05) { var sc = D + (want === q.id ? -0.5 : 0) + 0.02 * P.dist(M, near); if (!bt || sc < bt.sc) bt = { q: q, M: M, D: D, sc: sc }; break; }
        }
      });
      if (bt) {
        if (bt.D > 0.01) { var cb = pl.carry(bt.M); cb.dur = Math.max(bt.D, 0.3); cb.k8 = 'ant'; K8S.ant++; }
        pl.k8busy = true; pl.win(bt.q, 'tackle').k8 = 'tk'; pl.k8busy = false;
        return true;
      }
    }
    if (!K8.cut) return false;
    if (r < 0.3 && !pl.kick) {
      var fwd = pickMate(pl, attackPt(loses), { min: 12, max: 30, real: true });
      if (fwd) {
        var flh = passDur(P.dist(c.ball, fwd.pt)), hb = null;
        outfield(st, wins).forEach(function (q) { var e = pl.eta(q.id, fwd.pt); if (e <= now + flh + K8T.read && (!hb || e < hb.e)) hb = { q: q, e: e }; });
        if (hb) {
          pl.pass(fwd.p, clampPt({ x: fwd.pt.x, y: fwd.pt.y }), 'pass', null, { holder: hb.q.id, poss: wins });
          var lbh = pl.last(); lbh.kind = 'interception'; lbh.team = wins; lbh.to = hb.q.id; lbh.note = 'header'; lbh.k8 = 'head'; K8S.head++;
          return true;
        }
      }
    }
    var tgt = pickMate(pl, attackPt(loses), { min: 8, max: 28, real: true });
    var to = tgt ? tgt.pt : clampPt({ x: c.ball.x + (R() - 0.5) * 10, y: c.ball.y + dirOf(loses) * (12 + R() * 6) });
    var cs = k8CutSpot(pl, wins, to, { near: near, want: want }) || k8Lane(pl, wins, near, want);
    if (!cs) return false;
    k8Cut(pl, cs);
    return true;
  }
  /* a pass from the plan's ball toward `to`: the man of `team` who can be on its line when the ball gets there (he
   * reads it K8T.read s before it is struck), and where; null when nobody can. o: near, want, only, skip, hold */
  function k8CutSpot(pl, team, to, o) {
    o = o || {};
    var c = pl.cur, now = pl.time() + (o.hold || 0), best = null, dx = to.x - c.ball.x, dy = to.y - c.ball.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
    outfield(pl.st, team).forEach(function (q) {
      if ((o.skip && o.skip[q.id]) || (o.only && o.only !== q.id) || q.id === pl.endId) return;   /* (never the man the play ends on: he is on his run to the moment's spot, see k8NamedWin) */
      [0.45, 0.6, 0.75, 0.9, 1].forEach(function (f) {
        var d = L * f; if (d < K8T.cutMin) return;
        var X = clampPt({ x: c.ball.x + dx * f, y: c.ball.y + dy * f }), slack = now + passDur(d) * 0.85 + K8T.read - pl.eta(q.id, { x: X.x, y: X.y });
        var dn = o.near ? P.dist(X, o.near) : 0, score = Math.min(slack, 1.2) - 0.04 * dn + (o.want === q.id && dn < K8T.wantFar ? 0.6 : 0);
        if (slack >= K8T.early && (!best || score > best.score)) best = { q: q, X: X, d: d, slack: slack, score: score };
      });
    });
    return best;
  }
  /* nobody can be on the line of a pass to a team-mate: the pass is misplaced straight into the lane of one of
   * theirs, who steps toward it as far as his legs let him in the ball's time (the shortest such pass, nearer
   * `near`; `want` before the others) */
  function k8Lane(pl, team, near, want, only) {
    var c = pl.cur, now = pl.time(), best = null;
    outfield(pl.st, team).forEach(function (q) {
      if ((only && only !== q.id) || (!only && q.id === pl.endId)) return;
      var e = pl.where(q.id); if (!e) return;
      for (var g = 0.5; g >= -1e-6; g -= 0.125) {
        var X = clampPt({ x: e.x + (c.ball.x - e.x) * g, y: e.y + (c.ball.y - e.y) * g }), d = P.dist(c.ball, X);
        if (d < K8T.cutMin) continue;
        if (pl.eta(q.id, X) + K8T.early <= now + passDur(d) * 0.85 + K8T.read || g < 0.01) { var dn = near ? P.dist(X, near) : 0, sc = d + 0.5 * dn - (want === q.id && (only || dn < K8T.wantFar) ? 8 : 0); if (!best || sc < best.sc) best = { q: q, X: X, d: d, sc: sc, lane: true }; break; }
      }
    });
    return best;
  }
  /* where a pass played now toward `at` can meet `man`: `at` when his legs can have him there as it arrives, else
   * the furthest point toward it from where he is that they can */
  function k8Meet(pl, man, at) {
    var e = pl.where(man.id), c = pl.cur, now = pl.time(); if (!e) return at;
    for (var g = 1; g >= 0.05; g -= 0.1) {
      var X = clampPt({ x: e.x + (at.x - e.x) * g, y: e.y + (at.y - e.y) * g });
      if (pl.eta(man.id, X) <= now + passDur(P.dist(c.ball, X)) + K8T.read) return X;
    }
    return clampPt({ x: e.x, y: e.y });
  }
  function k8Cut(pl, cs, note) {
    var c = pl.cur, tm = P.teamOf(pl.st, cs.q);
    var b = pl.push({ kind: 'interception', team: tm, from: c.holder, to: cs.q.id, ball: { x: cs.X.x, y: cs.X.y }, dur: Math.max(0.35, passDur(P.dist(c.ball, cs.X)) * 0.85), holder: cs.q.id, poss: tm, note: note || null });
    b.k8 = cs.lane ? 'lane' : 'cut'; K8S[b.k8]++;
    return b;
  }
  /* THE NAMED MAN W WINS IT (a scene's own lead-in), ending with the ball at his feet at S, the moment's spot.
   * `cut`: where the old plan had him cut it out or tackle. Returns true when it staged it.
   *   tackle (o.tackle): the man of theirs who loses it (A: the man the moment's picture puts next to W, else the
   *     scene's own pick) gets the ball a few metres past S, runs with it toward W's run, and W takes it from him at
   *     S when his legs are there: the tackle is the LAST beat of the play (settle()'s wait for W at the end is then
   *     a wait before the tackle, not after a ball that changed sides alone).
   *   cut-out: the pass toward S is cut out by W at `cut`; when he needs longer, the passer keeps it a touch longer.
   *   too far for either in K8T.holdMax s: with K8.mate (and o.mate: the words do not say W won it) the team-mate
   *     who can soonest be there cuts it out and plays it to W; else the pass is misplaced into W's own lane, where
   *     he is, and he runs on with it to S. */
  function k8NamedWin(pl, S, W, A, cut, o) {
    var st = pl.st, R = pl.R, now = pl.time(), wT = P.teamOf(st, W), dW = dirOf(wT), spot = pt(S.x, S.y), hpW = pt(S.x, S.y - dW * P.BALL_OFF);
    /* W is still far: the side with the ball passes it about (the scene's own words: "their defenders pass it about")
     * while he comes, so the ball is not played toward S before he can be near it. With K8.mate, when he is further
     * than K8T.mateWait s away and the words allow it, a nearer team-mate wins it instead (below). */
    var lT = pl.cur.team, far0 = pl.eta(W.id, hpW) - now, mate8 = null;
    if (K8.mate && K8.cut && o.mate && lT !== wT && far0 > K8T.mateWait) {
      /* W is too far to win it himself in the play's time and the words allow it: the team-mate who can soonest be
       * there cuts the pass out, some metres short of S on the passer's side, and plays it to W as he arrives */
      var c1 = pl.cur.ball, dS = P.dist(c1, spot) || 1, mAt = clampPt(pt(spot.x + (c1.x - spot.x) / dS * Math.min(8, dS * 0.5), spot.y + (c1.y - spot.y) / dS * Math.min(8, dS * 0.5)));
      outfield(st, wT).forEach(function (q) { if (q.id === W.id) return; var e = pl.eta(q.id, mAt); if (!mate8 || e < mate8.e) mate8 = { q: q, e: e, at: mAt }; });
      k8Log('named mate', S.scene.id, 'W', W.name, 'M', mate8 && mate8.q.name, 'now', now.toFixed(2), 'etaM', mate8 && mate8.e.toFixed(2), 'far0', far0.toFixed(2));
      if (mate8 && mate8.e - now > far0 - 1.2) mate8 = null;   /* (no team-mate is clearly nearer: W wins it himself) */
    }
    var tkForm = !!(K8.tackle && o.tackle && A && A.id !== W.id), tail = tkForm ? 1.9 : 0.7;   /* (what the form still plays after the passing: the pass to A, his run and the tackle; or the one pass that is cut out) */
    if (mate8) {
      /* (their side passes it about until he can be on the line) */
      for (var gm = 0; gm < 3 && mate8.e + K8T.early - K8T.read - (pl.time() + 0.6) > 0.3; gm++) {
        var hm = o.home || clampPt(pt(S.x + (34 - S.x) * 0.4, S.y + dW * 11)), mm = pickMate(pl, hm, { lateral: true, min: 7, max: 24, real: true, run: 2 }) || pickMate(pl, hm, { back: true, min: 7, max: 22, real: true, run: 2 });
        if (!mm) break;
        pl.pass(mm.p, mm.pt, 'pass').k8 = 'fill'; K8S.fill++;
      }
      var c2 = pl.cur.ball, dS2 = P.dist(c2, spot) || 1;
      mate8.at = clampPt(pt(spot.x + (c2.x - spot.x) / dS2 * Math.min(8, dS2 * 0.5), spot.y + (c2.y - spot.y) / dS2 * Math.min(8, dS2 * 0.5)));
      k8Cut(pl, { q: mate8.q, X: mate8.at }).k8 = 'mate'; K8S.mate++;
      pl.pass(W, spot, 'pass');
      k8Log('  staged the mate: plan', pl.time().toFixed(2), 's, beats', pl.beats.map(function (x) { return x.kind + (x.k8 ? '/' + x.k8 : '') + ' ' + x.dur.toFixed(2); }).join(', '));
      return true;
    }
    if (lT !== wT) for (var gf = 0; gf < 4 && pl.eta(W.id, hpW) - (pl.time() + tail) > 0.75; gf++) {
      var home = o.home || clampPt(pt(S.x + (34 - S.x) * 0.4, S.y + dW * 11));
      var mf = pickMate(pl, home, { lateral: true, min: 7, max: 24, skip: A ? skipOf(A) : null, real: true, run: 2 }) || pickMate(pl, home, { back: true, min: 7, max: 22, real: true, run: 2 });
      if (!mf) break;
      pl.pass(mf.p, mf.pt, 'pass').k8 = 'fill'; K8S.fill++;
    }
    now = pl.time();
    if (tkForm) {
      /* A gets the ball where he is (a few metres from the spot, on his own side of it), so he is not sent running
       * away from W to receive it: the legs carry a man on past a pass he sprints to. From 3 to 9 m from the spot. */
      var jx = (R() - 0.5) * 2, tkAt = clampPt(pt(S.x + jx * 0.4, S.y + dW * 1.3)), has = pl.cur.holder === A.id, L = 4, D = 0, recv = null;
      var eA = pl.where(A.id) || pt(S.x, S.y + dW * 6), vx = eA.x - tkAt.x, vy = eA.y + (-dW) * P.BALL_OFF - tkAt.y, vd = Math.sqrt(vx * vx + vy * vy);
      if (vd < 0.5 || vy * dW < 0) { vx = jx; vy = dW * 3; vd = Math.sqrt(vx * vx + vy * vy); }   /* (never from behind W's own line: from the far side of the spot) */
      L = has ? P.dist(pl.cur.ball, tkAt) : P.clamp(P.dist(eA, tkAt), 3, 9);
      recv = has ? pl.cur.ball : clampPt(pt(tkAt.x + vx / vd * L, tkAt.y + vy / vd * L));
      var fl = has ? 0 : passDur(P.dist(pl.cur.ball, recv));
      D = Math.max(L / 4.5, pl.eta(W.id, hpW) - 0.3 - (now + fl));
      if (has && L > 9) D = 99;   /* (he already has it and is far from the spot: he would have to turn and run a long way at W: a cut-out instead) */
      k8Log('named tackle', S.scene.id, 'W', W.name, 'A', A.name, 'now', now.toFixed(2), 'D', D.toFixed(2), 'L', L.toFixed(1), 'etaW', pl.eta(W.id, hpW).toFixed(2));
      if (D <= K8T.holdMax) {
        if (!has) safePass(pl, A, recv, null);
        var cb = pl.carry(tkAt); cb.dur = Math.max(cb.dur, D); cb.k8 = 'ant';
        pl.k8busy = true; pl.win(W, 'tackle', spot).k8 = 'end'; pl.k8busy = false; K8S.end++;
        k8Log('  staged the tackle: plan', pl.time().toFixed(2), 's, beats', pl.beats.map(function (x) { return x.kind + (x.k8 ? '/' + x.k8 : '') + ' ' + x.dur.toFixed(2); }).join(', '));
        return true;
      }
    }
    if (!K8.cut) return false;
    /* the pass toward S is cut out by W AT S, the last thing in the play: he is the man the play's end waits for, so
     * his legs are running straight for S (track()'s endRun) and the ball meets him there. (A cut-out short of S and
     * a run on with the ball was tried: on that run he is ahead of or behind any spot the plan can name, and
     * settle() then waits up to 3 s for a man who has already gone past.) */
    k8Log('named cut', S.scene.id, 'W', W.name, 'now', now.toFixed(2), 'etaW', pl.eta(W.id, hpW).toFixed(2), 'tackle asked', !!o.tackle);
    /* (what is left of his run when the ball would get there: the passer keeps it a touch longer, turning away from him) */
    var gapC = pl.eta(W.id, hpW) - (now + Math.max(0.35, passDur(P.dist(pl.cur.ball, spot)) * 0.85)), hC = pl.cur.holder ? P.byId(st, pl.cur.holder) : null;
    if (lT !== wT && gapC > 0.25 && hC && !isKeeperP(st, hC)) {
      var c0 = pl.cur.ball, gC = Math.min(gapC, 1.2), hb = pl.carry(clampPt(pt(c0.x + (c0.x < S.x ? -1 : 1) * (0.8 + 1.6 * gC), c0.y + dW * (0.6 + 1.8 * gC))));
      hb.dur = Math.max(hb.dur, gC); hb.k8 = 'ant'; K8S.ant++;
    }
    k8Cut(pl, { q: W, X: spot });
    k8Log('  staged the cut-out: plan', pl.time().toFixed(2), 's, beats', pl.beats.map(function (x) { return x.kind + (x.k8 ? '/' + x.k8 : '') + ' ' + x.dur.toFixed(2); }).join(', '));
    return true;
  }

  /* move the ball to `pre` (a team, a man, a place), with `budget` seconds
   * of varied play on the way */
  function bridge(pl, pre, budget) {
    var st = pl.st, R = pl.R, guard = 0;
    if (pl.cur.team !== pre.team) {
      var n = pl.time() + 1.2 < budget ? 1 + (R() < 0.45 ? 1 : 0) : 0;
      for (var i = 0; i < n; i++) move(pl, attackPt(pl.cur.team), { noBall: false });
      turnover(pl, pre.team, pre.pt, pre.holder && pre.holder.id);   /* (kmtree5 a8, helper K: the man the play needs on the ball next cuts it out himself when he can) */
    }
    while (guard++ < 8 && pl.time() < budget - 0.7) {
      var d = P.dist(pl.cur.ball, pre.pt);
      if (d < 16 && pl.cur.holder !== pre.holder.id) break;
      if (d < 6) break;
      move(pl, pre.pt, {});
      if (pl.cur.team !== pre.team) turnover(pl, pre.team, pre.pt);
    }
    deliver(pl, pre.holder, pre.pt, pre.note, pre.meet);   /* (kmtree5 a8, helper K: pre.meet, see deliver) */
  }
  /* the ball to a man at a place: he carries it if he has it, or it is
   * passed to him; never a pass straight back to the man who just passed */
  function deliver(pl, man, at, note, meet8) {
    var c = pl.cur, lb = pl.last();
    if (c.holder === man.id) { if (P.dist(c.ball, at) > 0.6) pl.carry(at, P.dist(c.ball, at) > 6 && pl.R() < 0.4 ? 'dribble' : 'carry'); return; }
    if (lb && lb.kind === 'pass' && lb.from === man.id && GUARD.pingpong) {
      /* a third man first */
      var third = pickMate(pl, at, { skip: skipOf(man), min: 6, max: 22 });
      if (third) pl.pass(third.p, third.pt);
      else pl.carry({ x: P.lerp(c.ball.x, at.x, 0.4), y: P.lerp(c.ball.y, at.y, 0.4) });
    }
    if (pl.cur.team !== P.teamOf(pl.st, man)) turnover(pl, P.teamOf(pl.st, man), at);
    if (pl.cur.holder === man.id) { if (P.dist(pl.cur.ball, at) > 0.6) pl.carry(at); return; }
    var d = P.dist(pl.cur.ball, at);
    /* kmtree5 a8 (helper K, switch `meet`): a ball to a man who cannot be at its place when it gets there goes to where
     * his legs can have him, and he runs on with it to the place (a8: the pass was stretched while he came, up to 4 s
     * before a shot, settle()'s legWaitShot, or the ball went to him wherever he was and what the plan did next, a
     * shot, was then drawn from somewhere else: mvcheck2 V8). Not the man the play ends on (he is on his run to the
     * moment's spot: k8NamedWin), not a ball in the air to the moment, not a keeper. ONLY where the scene asks for
     * it (pre.meet: the siege's shot before a cross). Tried for every ball a play delivers: V8 95.8 to 97.2 and V7 to
     * 99.5, but a man runs with the ball slower than he runs without it, so plays grew (the 60: 83.6 to 86.0 s a
     * match, over a8's 85.90) and men ran side by side with it more (O1 2.26 to 2.48). */
    if (K8.meet && meet8 && pl.pos0 && man.id !== pl.endId && !note && !isKeeperP(pl.st, man)) {
      var m8 = k8Meet(pl, man, at);
      if (P.dist(m8, at) > 3 && P.dist(pl.cur.ball, m8) > 4) {
        pl.pass(man, m8, 'pass', P.dist(pl.cur.ball, m8) > 30 ? 'long ball' : null).k8 = 'meet'; K8S.meet++;
        pl.carry(at);
        return;
      }
    }
    pl.pass(man, at, 'pass', note || (d > 30 ? 'long ball' : null));
  }

  /* a pass to `man`, but never straight back to the man who just passed
   * it: a third man first (no ping-pong) */
  function safePass(pl, man, at, note, o) {
    var lb = pl.last();
    if (GUARD.pingpong && lb && (lb.kind === 'pass' || lb.kind === 'kickoff') && lb.from === man.id && lb.to === pl.cur.holder) {
      var third = pickMate(pl, at, { skip: skipOf(man), min: 6, max: 24 });
      if (third) pl.pass(third.p, third.pt);
      else pl.carry(clampPt({ x: pl.cur.ball.x + (pl.R() - 0.5) * 8, y: pl.cur.ball.y + dirOf(pl.cur.team) * 4 }));
    }
    return pl.pass(man, at, 'pass', note, o);
  }

  /* the man a lead wants to play it to, unless he is the man who just
   * passed it: then another of those lines near there */
  function notBack(pl, man, at, lines, skip) {
    var lb = pl.last();
    if (!man || !GUARD.pingpong || !lb || !(lb.kind === 'pass' || lb.kind === 'kickoff') || lb.from !== man.id) return man;
    var sk = skipOf(man, pl.cur.holder); if (skip) for (var k in skip) sk[k] = 1;
    return pickNear(pl.st, P.teamOf(pl.st, man), at, lines, sk) || man;
  }

  /* ------------------------------------------------------------ restarts */
  /* the play starts with the restart the last result left: a kick-off, a
   * throw-in, a goal kick, a free kick, the keeper's ball */
  function restart(pl, start, startPos) {
    var st = pl.st, R = pl.R, c = pl.cur, team = c.team, m;
    var rs = start.kickoff ? 'kickoff' : start.restart ? start.restart.type : null;
    var h = c.holder ? P.byId(st, c.holder) : null;
    if (!rs && h && isKeeperP(st, h)) rs = 'keeper';
    if (rs === 'kickoff') {
      var mids = outfield(st, team).filter(function (p) { return p.line === 1; }), bm = null, bd = 1e9;
      mids.forEach(function (p) { var d = P.dist(startPos[p.id], c.ball); var s = d + R() * 12; if (s < bd) { bd = s; bm = p; } });
      if (bm) pl.pass(bm, { x: startPos[bm.id].x, y: startPos[bm.id].y + dirOf(team) * 1.5 }, 'kickoff', 'kick-off');
      if (K8.kick && bm) pl.kick = true;   /* kmtree5 a8 (helper K): then a safe ball, when the play has the room (planSegment) */
    } else if (rs === 'throw-in') {
      m = pickMate(pl, attackPt(team), { max: 17, min: 6, run: 4 });
      if (m) pl.pass(m.p, m.pt, 'pass', 'throw-in', { slow: 1.3 });
    } else if (rs === 'goal kick') {
      if (R() < 0.55) { m = pickMate(pl, attackPt(team), { min: 30, max: 55, run: 5 }); if (m) pl.pass(m.p, m.pt, 'pass', 'goal kick'); }
      else { m = pickMate(pl, { x: c.ball.x < 34 ? 10 : 58, y: upY(team, 18) }, { min: 8, max: 26, lateral: true }); if (m) pl.pass(m.p, m.pt, 'pass', 'goal kick'); }
    } else if (rs === 'free kick') {
      m = pickMate(pl, attackPt(team), { max: 24, min: 7 });
      if (m) pl.pass(m.p, m.pt, 'pass', 'free kick');
    } else if (rs === 'keeper') {
      if (R() < 0.6) {
        var wideT = { x: R() < 0.5 ? 10 : 58, y: upY(team, 24 + R() * 10) };
        var fb = nearestTo(st, team, wideT, team, {});
        if (fb) pl.pass(fb.p, { x: P.lerp(fb.pt.x, wideT.x, 0.5), y: P.lerp(fb.pt.y, wideT.y, 0.5) }, 'pass', 'keeper throw');
      } else {
        m = pickMate(pl, attackPt(team), { min: 30, max: 55, run: 6 });
        if (m) pl.pass(m.p, m.pt, 'pass', 'long ball');
      }
    }
    return rs;
  }

  /* kmtree5 a8 (helper K): AFTER THE TAP FROM THE CENTRE, A SAFE BALL, varied by the director's own generator: back to
   * a defender (about a third of kick-offs), square to another midfielder (a third), or a touch to one side by the
   * man who got the tap (the rest, and whenever no man is at the right distance). The men are where the kick-off
   * picture has them (they have had 0.6 s), not where the open-play shape would put them. */
  function k8KickOn(pl, startPos) {
    var st = pl.st, R = pl.R, c = pl.cur, team = c.team, dir = dirOf(team), r = R(), lb = pl.last(), kicker = lb ? lb.from : null, b = null, m = null;
    var men = outfield(st, team).filter(function (p) { return p.id !== c.holder && p.id !== kicker && startPos[p.id]; });
    function pick(line, fn) {
      var best = null, bs = -1e9;
      men.forEach(function (p) { if (p.line !== line) return; var q = startPos[p.id], d = P.dist(q, c.ball); if (d < 6 || d > 26) return; var s = fn(q, d) + R() * 6; if (s > bs) { bs = s; best = p; } });
      return best;
    }
    if (r < 0.36) { m = pick(0, function (q, d) { return -Math.abs(d - 14); }); if (m) b = pl.pass(m, { x: startPos[m.id].x, y: startPos[m.id].y + dir * 1.2 }, 'pass', 'back pass'); }
    else if (r < 0.68) { m = pick(1, function (q, d) { return Math.abs(q.x - c.ball.x) - Math.abs(d - 12) * 0.5; }); if (m) b = pl.pass(m, { x: startPos[m.id].x, y: startPos[m.id].y + dir * 1.2 }, 'pass'); }
    if (!b) { b = pl.carry(clampPt({ x: c.ball.x + (R() < 0.5 ? -1 : 1) * (2.5 + R() * 2.5), y: c.ball.y - dir * R() * 1.5 })); b.dur = Math.max(b.dur, 0.6); }
    b.k8 = 'kick'; K8S.kick++;
    return b;
  }
  /* kmtree5 a8 (helper K): A FOUL IS TWO MEN MEETING. resolve() stages a foul in open play as a 0.8 m step by the man
   * fouled with the fouler pinned beside him; the fouler is whoever the words name, 10 to 40 m away, and settle()
   * then holds the man on the ball until he arrives (a8: 4 to 7 s standing). Here, as the foul's beat enters the
   * plan (Planner.push), that step becomes a run with the ball toward the fouler (K8T.vFoul m/s, K8T.foulRun m and
   * K8T.foulMax s at most), to the place where the fouler's legs can meet him; the foul and the free kick are there.
   * He stays in the same part of the pitch (in or out of a box, the same 25 m band), so the words about where the
   * free kick is do not move. Not for the scenes' own free kicks (foulAt: the foul is where the moment's kick is). */
  function k8Foul(pl, b) {
    var lb = pl.last(), n = pl.beats.length;
    if (!pl.pos0 || !lb || !lb.fouler || lb.fouler !== b.from || lb.from !== b.to || (lb.kind !== 'dribble' && lb.kind !== 'carry')) return;
    var c0 = n >= 2 ? pl.beats[n - 2].ball : pl.ball0; if (!c0 || P.dist(c0, lb.ball) > 1.5) return;
    var tA = pl.time(), t0 = tA - lb.dur, st = pl.st, vt = P.teamOf(st, P.byId(st, b.to)), dg = dirOf(vt);
    /* (where the fouler is: he has not been in this result's plan, so where the picture starts) */
    var e = pl.where(b.from); if (!e) return;
    var wasEst = pl.est, wasAnc = pl.anc[b.from];
    function etaAt(M, T) { var d = P.dist(e, M); return k8Time(Math.max(0, d - 1.0)) + K8T.react; }
    /* (the fouler is near enough already: the step is no longer than his legs need, so he comes at once. track() has a
     * man run for a pinned place only when it asks at least a jog of him, or in its last half second: given 0.8 s
     * for 2 m he drifted off with his team's shape first, came late, and settle() waited) */
    if (etaAt(lb.ball) <= lb.dur + 0.3) { var tq = P.clamp(etaAt(lb.ball) + 0.05, 0.45, lb.dur); if (tq < lb.dur - 0.05) { lb.dur = tq; lb.k8 = 'foul'; K8S.foul++; } return; }
    var D0 = P.dist(c0, e), ux = (e.x - c0.x) / (D0 || 1), uy = (e.y - c0.y) / (D0 || 1), z0 = zoneOf(c0), best = null;
    for (var T = 0.8; T <= K8T.foulMax + 1e-6; T += 0.1) {
      var run = Math.min(K8T.foulRun, K8T.vFoul * Math.max(0, T - 0.25), Math.max(0, D0 - 1.5)), M = clampPt({ x: c0.x + ux * run, y: c0.y + uy * run });
      for (var sh = 0; sh < 5 && zoneOf(M) !== z0; sh++) { run *= 0.6; M = clampPt({ x: c0.x + ux * run, y: c0.y + uy * run }); }
      best = { T: T, M: M, run: run };
      if (etaAt(M) <= T + 0.1) break;   /* (no time to spare on purpose: see above) */
    }
    if (!best || best.run < 1.5) return;
    lb.ball = { x: best.M.x, y: best.M.y }; lb.dur = Math.max(lb.dur, best.T); lb.k8 = 'foul'; K8S.foul++;
    lb.pin = lb.pin || {}; lb.pin[b.from] = clampPt({ x: best.M.x + (best.M.x < 34 ? 0.4 : -0.4), y: best.M.y + dg * 0.3 });
    b.ball = { x: best.M.x, y: best.M.y };
    pl.cur = { ball: { x: best.M.x, y: best.M.y, z: 0 }, holder: pl.cur.holder, team: pl.cur.team };
    k8Log('foul', 'run', best.run.toFixed(1), 'm in', best.T.toFixed(1), 's; the fouler was', D0.toFixed(1), 'm away');
  }

  /* ------------------------------------------------------------ key frames */
  function build(st, start, startPos, beats, endPos, endBall, salt) {
    var seg0 = build0(st, start, startPos, beats, endPos, endBall, salt);
    /* mv1: the movement layer needs to know who is who, as it is NOW (a
     * substitution later must not change how this segment is drawn) */
    if (SEGST) { var who0 = {}; P.roster(st).forEach(function (r) { who0[r.id] = { team: r.team, keeper: r.keeper, line: r.p ? r.p.line : null }; }); SEGST.set(seg0, who0); }
    if (FROMV && start) FROMV.set(seg0, start);   /* a2: the picture it starts from (its men's velocities, when the last segment left them running) */
    return seg0;
  }
  function build0(st, start, startPos, beats, endPos, endBall, salt) {
    var keys = [{ t: 0, ball: { x: start.ball.x, y: start.ball.y }, holder: start.holder, poss: start.team, pos: startPos }];
    var t = 0, waitB = 0;
    beats.forEach(function (b, i) {
      t += b.dur;
      var last = i === beats.length - 1;
      var pos = last && endPos ? endPos : (b.pos || keyPos(st, b.ball, b.holder, b.poss, b.pin || null, salt + ':' + i, b.kind === 'out' || b.kind === 'foul'));
      /* kmtree5 a4 (helper P, note 8b: "moving away from the man a pass is played to"): the man marking the receiver
       * when the pass is struck is the man who closes him when it arrives (keyPos picks the presser afresh from the
       * shape, and sent the marker back to his slot): the two swap places, so the marker stays with his man */
      if (P4 && !PBRK.marker && !(last && endPos) && !b.pos && b.kind === 'pass' && b.to && b.holder === b.to && STAGED_P && pos[STAGED_P]) {
        var pv = keys[keys.length - 1].pos, rq = pv[b.to], mk = null, md = 6;
        if (rq) outfield(st, other(P.teamOf(st, P.byId(st, b.to)) || b.poss)).forEach(function (q) { var d0 = pv[q.id] ? P.dist(pv[q.id], rq) : 99; if (d0 < md && !(b.pin && b.pin[q.id])) { md = d0; mk = q.id; } });
        if (mk && mk !== STAGED_P && pos[mk]) { pos = copyPos(pos); var sw = pos[mk]; pos[mk] = pos[STAGED_P]; pos[STAGED_P] = sw; STAGED[mk] = 1; }
      }
      /* kmtree5 a4 (helper P, note 10b: "offside-looking forwards"): a picture-only onside guard. In every key picture of
       * open play, no man of the side on the ball but the man on it (and the man a pass is played to, at its end) is
       * more than 0.5 m past the second-last man of the other side AND ahead of the ball: he is drawn level with that
       * man or with the ball. The game has no offside rule (his call); the picture just does not show one. */
      if (P4 && !PBRK.onside && !b.pos && b.kind !== 'out' && b.kind !== 'foul' && b.poss) pos = onsideGuard(st, pos, last && endBall ? endBall : b.ball, b.poss, [b.holder, b.to, b.from].concat(b.pin ? Object.keys(b.pin) : []));
      /* mv1: a man not in this beat's play cannot be further from where he
       * was at the last key frame than he could run in the time */
      if (!(last && endPos) && !b.pos && P.MOVE && P.MOVE.on && b.kind !== 'out' && b.kind !== 'foul') {   /* (while play is stopped, men walk to the restart's places: no limit) */
        var keep = {}; [b.holder, b.from, b.to, b.past].forEach(function (k) { if (k) keep[k] = 1; });
        if (b.pin) for (var pk in b.pin) keep[pk] = 1;
        if (!b.pos) for (var sk in STAGED) keep[sk] = 1;
        pos = reachLimit(st, pos, keys[keys.length - 1].pos, b.dur, keep, b.ball);
      }
      var bz = last && endBall ? (endBall.z || 0) : (b.ball.z || 0);
      keys.push({ t: t, ball: last && endBall ? { x: endBall.x, y: endBall.y, z: bz } : { x: b.ball.x, y: b.ball.y, z: bz }, holder: b.holder, poss: b.poss, pos: pos });
    });
    /* m8: THE MAN A BALL IS PLAYED TO STARTS HIS RUN EARLIER. When the plan
     * has him further from where the ball arrives than he can run in the
     * beat (MV.capRecv), his place at the key frames before is moved toward
     * it, as far back as needed (never the start picture): he reads the pass
     * and goes, instead of running 20 to 40 m/s at the end (review 1). */
    if (P.MOVE && P.MOVE.m8) for (var k8 = 1; k8 < keys.length; k8++) {
      var b8 = beats[k8 - 1], r8 = b8 && b8.to;
      if (!r8 || !(PASSY[b8.kind] || b8.kind === 'interception' || b8.kind === 'tackle') || b8.kind === 'out' || !keys[k8].pos[r8]) continue;
      var tgt8 = keys[k8].pos[r8];
      for (var j8 = k8 - 1; j8 >= 1; j8--) {
        var q8 = keys[j8].pos[r8]; if (!q8) break;
        if (keys[j8].holder === r8 || (beats[j8 - 1] && (beats[j8 - 1].to === r8 || beats[j8 - 1].from === r8 || (beats[j8 - 1].pin && beats[j8 - 1].pin[r8])))) break;   /* (never where the play needs him at that moment) */
        var allow8 = (j8 === k8 - 1 ? (A2 ? MV.legRecv : MV.capRecv) : (A2 ? MV.legRecv : MV.capOut)) * Math.max(0.05, keys[j8 + 1].t - keys[j8].t), d8 = P.dist(q8, tgt8);   /* (a2: planned at a speed his legs can run) */
        if (d8 <= allow8) break;
        if (keys[j8].pos === keys[j8 - 1].pos || keys[j8].pos === endPos) break;
        keys[j8].pos = copyPos(keys[j8].pos);
        keys[j8].pos[r8] = { x: tgt8.x + (q8.x - tgt8.x) * allow8 / d8, y: tgt8.y + (q8.y - tgt8.y) * allow8 / d8 };
        tgt8 = keys[j8].pos[r8];
      }
    }
    /* a2: A PASS WAITS FOR ITS MAN. When the man a pass (or a pass cut out) is played to still cannot get from
     * where he is to where it arrives at his legs' speed, the ball takes longer to get there (up to MV.legWait s
     * more): it is played into the space he is running into, and the rest of the play moves on by as much. a1
     * had him run 20 to 30 m/s to be on time. */
    if (A2) {
      var shift9 = 0, touchT = 0;
      for (var k9 = 1; k9 < keys.length; k9++) {
        keys[k9].t += shift9;
        var b9 = beats[k9 - 1], r9 = b9 && b9.to;
        if (!r9 || !(b9.kind === 'pass' || b9.kind === 'kickoff' || b9.kind === 'interception') || b9.holder !== r9) continue;
        var a9 = keys[k9 - 1].pos[r9], e9 = keys[k9].pos[r9]; if (!a9 || !e9) continue;
        var v9 = k9 === 1 && start && start.vel ? start.vel[r9] : null;   /* (in the first beat, the way he is running when the picture starts; later, the way the plan has him running into the pass) */
        if (k9 > 1 && keys[k9 - 2].pos[r9] && keys[k9 - 1].t - keys[k9 - 2].t > 0.05) { var pa9 = keys[k9 - 2].pos[r9], dt9 = keys[k9 - 1].t - keys[k9 - 2].t; v9 = { x: (a9.x - pa9.x) / dt9, y: (a9.y - pa9.y) / dt9 }; var vs9 = Math.sqrt(v9.x * v9.x + v9.y * v9.y); if (vs9 > MV.legV) { v9.x *= MV.legV / vs9; v9.y *= MV.legV / vs9; } }
        var need9 = (v9 ? legTimeFrom(a9, e9, v9) : legTime(P.dist(a9, e9))) + 0.25, dur9 = keys[k9].t - keys[k9 - 1].t;
        if (need9 > dur9 && (k9 === keys.length - 1 || MV.legWait > 0)) { var add9 = k9 === keys.length - 1 && endPos ? need9 - dur9 : Math.min(need9 - dur9, MV.legWait);
          /* kmtree5 a4 (helper P, note 2): the ball flies at a ball's speed (passDur); the wait is spent BEFORE the
           * strike, the passer taking a touch while his man starts his run, and it is capped (MV.waitCap s a play,
           * shared with settle's waits): a man who still cannot get there gets the ball where his legs have got him */
          if (P4 && MV.softMiss > 0) add9 = Math.min(add9, MV.waitCap);   /* (kmtree5 a4: the cap, only when it is on: ?waitcap=) */
          b9.dur += add9; keys[k9].t += add9; shift9 += add9; }   /* (into the next decision's picture he must get there: the ball waits as long as it takes) */
      }
      t += shift9 + touchT; waitB = shift9 + touchT;
    }
    /* kmtree5 a8 (helper K): THE MAN WHO WINS THE BALL STARTS HIS RUN IN TIME. For a tackle or a pass cut out, the man
     * who wins it is on a straight run from the last place the play needed him (else from where the picture starts)
     * to the place he wins it: he sets off as late as his legs allow (k8Time, 0.2 s to spare) and each key frame on
     * the way has him as far along as they carry him by then. Those places are pinned on their beats, so track()
     * anchors him on them and he runs at the speed the run needs (m8 above only moved his places: he then drifted
     * with the shape at a jog and came late, and settle()'s wait at the end pushed his start back by as much). */
    if ((K8.tackle || K8.cut) && A2 && P.MOVE && P.MOVE.m8) for (var kc8 = 1; kc8 < keys.length; kc8++) {
      var bc8 = beats[kc8 - 1], rc8 = bc8 && bc8.to;
      if (!rc8 || !(bc8.kind === 'interception' || bc8.kind === 'tackle') || !keys[kc8].pos[rc8]) continue;
      var j0 = 0, jc8;
      for (jc8 = kc8 - 1; jc8 >= 1; jc8--) { var bj8 = beats[jc8 - 1]; if (keys[jc8].holder === rc8 || bj8.to === rc8 || bj8.from === rc8 || (bj8.pin && bj8.pin[rc8]) || bj8.kind === 'out' || bj8.kind === 'foul') { j0 = jc8; break; } }
      var ps8 = keys[j0].pos[rc8], tg8 = keys[kc8].pos[rc8]; if (!ps8) continue;
      var dd8 = P.dist(ps8, tg8); if (dd8 < 3) continue;
      var ts8 = Math.max(keys[j0].t, keys[kc8].t - k8Time(dd8) - 0.2);
      for (jc8 = j0 + 1; jc8 < kc8; jc8++) {
        var f8 = Math.min(1, k8Run(keys[jc8].t - ts8) / dd8); if (f8 <= 0.02) continue;
        var q8c = { x: ps8.x + (tg8.x - ps8.x) * f8, y: ps8.y + (tg8.y - ps8.y) * f8 };
        keys[jc8].pos = copyPos(keys[jc8].pos); keys[jc8].pos[rc8] = q8c;
        beats[jc8 - 1].pin = beats[jc8 - 1].pin || {}; beats[jc8 - 1].pin[rc8] = { x: q8c.x, y: q8c.y };
      }
    }
    var events = [];
    var t0 = 0;
    beats.forEach(function (b, i) {
      var e = { t: +t0.toFixed(3), kind: b.kind, team: b.team, from: b.from || null, to: b.to || null,
        ball: { x: +keys[i + 1].ball.x.toFixed(2), y: +keys[i + 1].ball.y.toFixed(2) }, note: b.note || null };
      if (b.past) e.past = b.past;
      if (b.head) e.head = true;
      if (b.poss) e.poss = b.poss;   /* m3: the team with the ball after it (stats.js reads it; a clearance or a parried shot can land with either side) */
      events.push(e);
      t0 += b.dur;
    });
    return { keys: keys, beats: beats, events: events, duration: t, waitBuild: waitB };
  }
  function scaleTo(seg, target) {
    if (!seg.duration) return seg;
    var k = target / seg.duration;
    seg.keys.forEach(function (key) { key.t *= k; });
    seg.beats.forEach(function (b) { b.dur *= k; });
    seg.events.forEach(function (e) { e.t = +(e.t * k).toFixed(3); });
    seg.duration = target;
    seg.scale = k;
    return seg;
  }

  /* ------------------------------------------------------------ states */
  /* the match before kick-off: the user's team kicks off, from the centre spot */
  function kickoffState(st, team) {
    team = team || 'you';
    var fw = outfield(st, team).filter(function (p) { return p.line === 2; });
    if (!fw.length) fw = outfield(st, team);
    fw = fw.slice().sort(function (a, b) { return Math.abs(a.slot - 2) - Math.abs(b.slot - 2) || a.slot - b.slot; });
    var pos = P.kickoffShape(st);
    pos[fw[0].id] = { x: 34, y: team === 'you' ? 51.6 : 53.4 };
    if (A2) { var fx0 = {}; fx0[fw[0].id] = 1; P.tidy(pos, fx0, 3.0); }   /* a2: nobody half on the man kicking off */
    return { ball: { x: 34, y: 52.5 }, holder: fw[0].id, team: team, pos: pos, kickoff: true };
  }

  /* ------------------------------------------------------------ scene lead-ins */
  /* THE LAST EVENTS OF THE PLAY BUILD THE SCENE (SCENES.md). Each lead says
   * where the ball has to be first (`pre`: a team, a man, a place) and then
   * plays the beats that make the scene, ending exactly at S with the man
   * the text names. `est` is roughly how long those beats take. */
  function wing(S) { return S.x < 34 ? -1 : 1; }
  var LEADS = {
    /* you win it back high up: their defenders pass it about, one of yours takes it */
    won_high: function (st, S, R) {
      var them = 'them', a = pickNear(st, them, pt(S.x + (34 - S.x) * 0.4, S.y + 9), [0], K8.tackle ? skipOf(S.holder, S.near) : skipOf(S.holder));   /* (kmtree5 a8, helper K: not the man the moment puts next to him: he is the one who loses it, k8NamedWin) */
      var b = pickNear(st, them, pt(S.x, S.y + 2), [0, 1], skipOf(a, S.holder));
      return { est: 2.2, pre: { team: them, holder: a, pt: clampPt(pt(S.x + (34 - S.x) * 0.4 + (R() - 0.5) * 8, S.y + 10)) },
        run: function (pl) {
          var cut = clampPt(pt(S.x + (R() - 0.5) * 3, S.y + 3.5));
          /* kmtree5 a8 (helper K): the named man takes it at the end of the play, when he is there (k8NamedWin). The
           * moment says "You win the ball back": it does not say he won it himself, so a nearer team-mate may. */
          if ((K8.tackle || K8.cut) && pl.pos0) {
            var r8 = R(), near8 = S.near && P.teamOf(st, S.near) === them && !isKeeperP(st, S.near) ? S.near : null;
            if (k8NamedWin(pl, S, S.holder, near8 || b || a, cut, { tackle: r8 < 0.5, mate: true })) return;
          }
          if (b && R() < 0.5) {
            safePass(pl, b, cut, null);
            pl.win(S.holder, 'tackle', cut);
          } else {
            pl.pass(notBack(pl, b || a, pt(S.x, S.y), [0, 1], skipOf(S.holder)), clampPt(pt(S.x + (R() - 0.5) * 6, S.y - 2)), 'pass', null, { holder: S.holderId, poss: 'you' });
            var lb = pl.last(); lb.kind = 'interception'; lb.team = 'you'; lb.to = S.holderId; lb.ball = cut; lb.dur = passDur(8);
            pl.cur.ball = { x: cut.x, y: cut.y };
          }
          pl.carry(pt(S.x, S.y));
        } };
    },
    /* a long ball, headed clear by their defender, drops to your man */
    second_ball: function (st, S, R) {
      var sender = pickNear(st, 'you', pt(34, 48), [0, 1], skipOf(S.holder));
      var fw = pickNear(st, 'you', pt(S.x, 94), [2], skipOf(S.holder, sender));
      var cb = pickNear(st, 'them', pt(S.x, 93), [0], {});
      return { est: 3.2, pre: { team: 'you', holder: sender, pt: clampPt(pt(34 + (R() - 0.5) * 20, 44 + R() * 10)) },
        run: function (pl) {
          var hpt = clampPt(pt(P.clamp(S.x + (R() - 0.5) * 10, 18, 50), 93 + R() * 3));
          var pin = {}; if (fw) pin[fw.id] = { x: hpt.x + 1.5, y: hpt.y - 1.5 };
          var fw2 = notBack(pl, fw, hpt, [2, 1], skipOf(S.holder));
          if (fw2 !== fw && fw2) { pin = {}; pin[fw2.id] = { x: hpt.x + 1.5, y: hpt.y - 1.5 }; }
          pl.pass(fw2 || S.holder, hpt, 'pass', 'long ball', { holder: null, pin: pin });
          if (cb) { var h = {}; h[cb.id] = { x: hpt.x, y: hpt.y + 1 }; pl.last().pin = Object.assign(pin, h); }
          pl.push({ kind: 'clearance', team: 'them', from: cb ? cb.id : null, to: S.holderId, ball: { x: S.x, y: S.y }, dur: passDur(P.dist(hpt, S)) * 1.1,
            holder: S.holderId, poss: 'you', note: 'header' });
        } };
    },
    /* your midfield keeps it: short passes, then the pass to the man on the ball; a forward runs past their line */
    third_man: function (st, S, R) {
      var a = pickNear(st, 'you', pt(S.x + (R() - 0.5) * 14, S.y - 14), [1, 0], skipOf(S.holder));
      return { est: 1.8, pre: { team: 'you', holder: a, pt: clampPt(pt(S.x + (R() - 0.5) * 14, S.y - 14)) },
        run: function (pl) {
          var b = pickMate(pl, pt(S.x, S.y), { skip: skipOf(S.holder), max: 16, min: 6 });
          if (b) pl.pass(b.p, b.pt, 'pass');
          deliver(pl, S.holder, pt(S.x, S.y));
        } };
    },
    /* the ball goes wide to the man on the ball as the full-back runs round him */
    overlap: function (st, S, R) {
      var rl = S.scene.roles, hold = S.holder;
      var from = rl.fullback ? (rl.winger || pickNear(st, 'you', pt(S.x - wing(S) * 7, S.y - 4), [1, 2], skipOf(hold)))
        : pickNear(st, 'you', pt(34 + (S.x - 34) * 0.3, S.y - 7), [1], skipOf(hold, rl.runner));
      return { est: 1.4, pre: { team: 'you', holder: from, pt: clampPt(rl.fullback ? pt(S.x - wing(S) * 7, S.y - 3) : pt(34 + (S.x - 34) * 0.3, S.y - 8)) },
        run: function (pl) {
          var pin = {};
          if (rl.runner) pin[rl.runner.id] = { x: P.clamp(S.x + wing(S) * 3.5, 1.5, P.W - 1.5), y: S.y - 5 };
          if (pl.cur.holder === hold.id) pl.carry(pt(S.x, S.y));
          else safePass(pl, hold, pt(S.x, S.y), null, { pin: pin });
        } };
    },
    /* their corner, headed clear by one of yours to the man on the ball */
    break_from_corner: function (st, S, R) {
      var side = R() < 0.5 ? 0 : 1, fx = side ? P.W - 0.8 : 0.8;
      var taker = pickNear(st, 'them', pt(side ? 58 : 10, 20), [1, 2], {});
      var def1 = pickNear(st, 'you', pt(side ? 40 : 28, 5), [0], skipOf(S.holder));
      var def2 = pickNear(st, 'you', pt(34, 9), [0, 1], skipOf(S.holder, def1));
      var tgt = pickNear(st, 'them', pt(34, 8), [0, 2], skipOf(taker));
      return { est: 4.4, pre: { team: 'them', holder: taker, pt: pt(side ? 56 : 12, 17 + R() * 4) },
        run: function (pl) {
          /* the cross, headed behind by your defender */
          var lb0 = pl.last();
          if (lb0 && tgt && lb0.from === tgt.id) tgt = pickNear(st, 'them', pt(34, 8), [2, 1], skipOf(taker, tgt)) || tgt;
          var hp1 = pt(side ? 40 : 28, 5 + R() * 2);
          pl.pass(tgt || taker, hp1, 'pass', 'cross', { holder: null });
          var outAt = pt(side ? 44 + R() * 8 : 16 + R() * 8, -0.9);
          pl.push({ kind: 'clearance', team: 'you', from: def1 ? def1.id : null, to: null, ball: outAt, dur: 0.5, holder: null, poss: 'them', note: 'out for a corner' });
          var tp = {}; tp[taker.id] = { x: side ? P.W - 0.6 : 0.6, y: 1.8 };
          pl.push({ kind: 'out', team: 'them', from: null, to: taker.id, ball: pt(fx, 0.8), dur: 0.9, holder: taker.id, poss: 'them', note: 'corner', pin: tp });
          var hp2 = pt(34 + (R() - 0.5) * 8, 8 + R() * 3);
          pl.pass(tgt || taker, hp2, 'pass', 'corner kick', { holder: null });
          var land = clampPt(pt(S.x + (R() - 0.5) * 4, S.y - 5));
          pl.push({ kind: 'clearance', team: 'you', from: def2 ? def2.id : null, to: S.holderId, ball: land, dur: passDur(P.dist(hp2, land)), holder: S.holderId, poss: 'you', note: 'header' });
          pl.carry(pt(S.x, S.y));
        } };
    },
    /* you foul-free kick near the touchline: your man runs at them and is fouled */
    freekick_wide: function (st, S, R) {
      var at = clampPt(pt(S.x - wing(S) * (5 + R() * 5), S.y - 9 - R() * 5));
      return { est: 2.3, pre: { team: 'you', holder: S.holder, pt: at },
        run: function (pl) { foulAt(pl, S, S.holder, pl.R); } };
    },
    /* your defenders pass it square along the back, and theirs cuts it out */
    caught_square: function (st, S, R) {
      var backs = outfield(st, 'you').filter(function (p) { return p.line === 0; });
      var a = pickNear(st, 'you', pt(S.x < 34 ? 48 : 20, 17), [0], {});
      var b = pickNear(st, 'you', pt(S.x, 18), [0], skipOf(a));
      return { est: 2.0, pre: { team: 'you', holder: a, pt: pt(S.x < 34 ? 46 + R() * 6 : 16 + R() * 6, 15 + R() * 5) },
        run: function (pl) {
          var ya = pl.cur.ball.y;
          b = notBack(pl, b, pt(S.x, ya), [0], skipOf(S.holder));
          if (b) pl.pass(b, clampPt(pt(P.lerp(pl.cur.ball.x, S.x, 0.55), ya + (R() - 0.5) * 2)), 'pass');
          var cut = clampPt(pt(S.x + (R() - 0.5) * 3, S.y + 3));
          var c2 = pickNear(st, 'you', pt(S.x < 34 ? 6 : 62, ya), [0], skipOf(a, b));
          if (K8.cut && pl.pos0 && k8NamedWin(pl, S, S.holder, null, cut, { tackle: false, mate: true })) return;   /* kmtree5 a8 (helper K): "You lost the ball passing out from the back" names nobody of theirs */
          pl.pass(notBack(pl, c2 || a, cut, [0, 1], skipOf(S.holder)), cut, 'pass', null, { holder: S.holderId, poss: 'them' });
          var lb = pl.last(); lb.kind = 'interception'; lb.team = 'them'; lb.to = S.holderId; lb.dur = passDur(9);
          pl.carry(pt(S.x, S.y));
        } };
    },
    /* their players up the pitch; the ball comes back to your keeper */
    keeper_pressed: function (st, S, R) {
      var mid = pickNear(st, 'them', pt(34, 45), [1], {});
      return { est: 2.4, pre: { team: 'them', holder: mid, pt: clampPt(pt(34 + (R() - 0.5) * 24, 40 + R() * 10)) },
        run: function (pl) {
          var k = S.holder, fw = pickNear(st, 'them', pt(S.x, S.y + 8), [2], {});
          if (R() < 0.5) {
            var drop = pt(S.x + (R() - 0.5) * 3, S.y + 1);
            pl.pass(notBack(pl, fw || mid, drop, [2, 1]), drop, 'pass', 'long ball', { holder: k.id, poss: 'you' });
            var lb = pl.last(); lb.kind = 'save'; lb.team = 'you'; lb.to = k.id; lb.note = 'catch';
            pl.cur.ball = drop;
            pl.carry(pt(S.x, S.y));
          } else {
            var d1 = pickNear(st, 'you', pt(S.x + (R() - 0.5) * 20, 22), [0], {});
            var there = clampPt(pt(d1 ? P.clamp(S.x + (R() - 0.5) * 24, 10, 58) : S.x, 20 + R() * 4));
            var rc8 = notBack(pl, fw || mid, there, [2, 1]);
            if ((K8.tackle || K8.cut) && pl.pos0 && rc8) there = k8Meet(pl, rc8, there);   /* kmtree5 a8 (helper K): the pass goes where its man can be */
            pl.pass(rc8, there, 'pass');
            /* kmtree5 a8 (helper K): he is tackled by the man of yours who can be at him (after a run with the ball
             * toward that man when it needs one), else his next pass is cut out: k8Win, the tackle's draw */
            var k8w = (K8.tackle || K8.cut) && pl.pos0 && k8Win(pl, 'you', there, 0.99, null);
            if (!k8w && d1) pl.win(d1, 'tackle', there);
            /* (kmtree5 a8, helper K: won further up the pitch than the old plan had it, more than 30 m from the keeper: a
             * ball back to a defender first, so the ball to the keeper is not a 50 m one in the air for 3.8 s) */
            if (k8w && P.dist(pl.cur.ball, S) > 30) { var bk8 = pickMate(pl, pt(S.x, S.y), { real: true, run: 2, min: 8, max: 26, skip: skipOf(k) }); if (bk8 && P.dist(bk8.pt, S) < P.dist(pl.cur.ball, S) - 6) pl.pass(bk8.p, bk8.pt, 'pass', 'back pass').k8 = 'fill'; }
            pl.pass(k, pt(S.x, S.y), 'pass', 'back pass');
          }
        } };
    },
    /* a long ball over your back line, and their man runs onto it */
    over_top: function (st, S, R) {
      var from = pickNear(st, 'them', pt(34 + (R() - 0.5) * 30, 66), [0, 1], skipOf(S.holder));
      return { est: 1.9, pre: { team: 'them', holder: from, pt: clampPt(pt(34 + (R() - 0.5) * 30, 60 + R() * 12)) },
        run: function (pl) {
          for (var g = 0; g < 3 && (P.dist(pl.cur.ball, S) < 27 || (pl.last() && pl.last().kind === 'pass' && pl.last().from === S.holderId)); g++) {
            var bk = pickMate(pl, pt(34, 80), { skip: skipOf(S.holder), min: 6, max: 26, back: true });
            if (bk) pl.pass(bk.p, bk.pt, 'pass', 'back pass'); else break;
          }
          safePass(pl, S.holder, pt(S.x, S.y), 'over the top');
        } };
    },
    /* the ball to their dribbler, who runs at your back line */
    dribbler: function (st, S, R) {
      return { est: 1.5, pre: { team: 'them', holder: S.holder, pt: clampPt(pt(S.x + (R() - 0.5) * 8, S.y + 13 + R() * 4)) },
        run: function (pl) { pl.carry(pt(S.x, S.y), 'dribble'); } };
    },
    /* the ball comes to their playmaker in midfield as their runner sets off */
    playmaker: function (st, S, R) {
      var from = pickNear(st, 'them', pt(S.x + (R() - 0.5) * 20, S.y + 12), [0, 1], skipOf(S.holder));
      return { est: 1.2, pre: { team: 'them', holder: from, pt: clampPt(pt(S.x + (R() - 0.5) * 20, S.y + 11 + R() * 4)) },
        run: function (pl) { safePass(pl, S.holder, pt(S.x, S.y), null); } };
    },
    /* the ball out to their winger, who runs down the wing at your full-back */
    winger: function (st, S, R) {
      var from = pickNear(st, 'them', pt(34, S.y + 18), [1, 0], skipOf(S.holder));
      var w0 = clampPt(pt(S.x + (S.x < 34 ? 1 : -1) * 2, S.y + 10 + R() * 4));
      return { est: 2.4, pre: { team: 'them', holder: from, pt: clampPt(pt(34 + (R() - 0.5) * 12, S.y + 20)) },
        run: function (pl) {
          safePass(pl, S.holder, w0, P.dist(pl.cur.ball, w0) > 24 ? 'switch of play' : null);
          pl.carry(pt(S.x, S.y), 'dribble');
        } };
    },
    /* your attack breaks down in their half; they win it and go at your
     * midfield, who are still up the pitch */
    tired_gap: function (st, S, R) {
      var a = pickNear(st, 'you', pt(34 + (R() - 0.5) * 20, 74), [1, 2], {});
      return { est: 2.2, pre: { team: 'you', holder: a, pt: clampPt(pt(34 + (R() - 0.5) * 20, 72 + R() * 6)) },
        run: function (pl) {
          var fw = pickMate(pl, attackPt('you'), { min: 8, max: 20 });
          var cutter = pickNear(st, 'them', pt(pl.cur.ball.x, pl.cur.ball.y + 8), [0, 1], skipOf(S.holder));
          var cut = clampPt(pt(pl.cur.ball.x + (R() - 0.5) * 6, pl.cur.ball.y + 7));
          /* kmtree5 a8 (helper K): the pass forward is cut out by the man of theirs who can be on its line (else it is
           * misplaced into the lane of one of them); never by the man the play ends on (he is on his run to S) */
          var cs8 = K8.cut && pl.pos0 ? (k8CutSpot(pl, 'them', fw ? fw.pt : cut, { near: pt(S.x, S.y) }) || k8Lane(pl, 'them', pt(S.x, S.y), null)) : null;
          if (cs8) k8Cut(pl, cs8);
          else if (fw && cutter) {
            pl.pass(fw.p, cut, 'pass', null, { holder: cutter.id, poss: 'them' });
            var lb = pl.last(); lb.kind = 'interception'; lb.team = 'them'; lb.to = cutter.id; lb.dur = passDur(8);
          } else if (cutter) pl.win(cutter, 'tackle');
          deliver(pl, S.holder, pt(S.x, S.y));
        } };
    },
    /* their ball wide, carried to the byline; for a siege, a shot blocked
     * and won back first */
    cross: function (st, S, R) {
      var from = pickNear(st, 'them', pt(34, 30), [1, 2], skipOf(S.holder, S.crossTo));
      var c0 = clampPt(pt(S.x + (S.x < 34 ? 3 : -3), S.y + 13 + R() * 5));
      var siege = S.scene.siege;
      return { est: siege ? 3.4 : 2.1, pre: { team: 'them', holder: from, pt: clampPt(pt(34 + (R() - 0.5) * 16, siege ? 22 + R() * 4 : 30 + R() * 8)), meet: !!siege },   /* (kmtree5 a8, helper K: meet, the man who shoots is at the plan's spot when he shoots) */
        run: function (pl) {
          if (siege) {
            var blk = pickNear(st, 'you', pt(pl.cur.ball.x, pl.cur.ball.y - 7), [0], {});
            var bpt = clampPt(pt(pl.cur.ball.x + (R() - 0.5) * 4, pl.cur.ball.y - 6));
            pl.push({ kind: 'shot', team: 'them', from: pl.cur.holder, to: null, ball: bpt, dur: 0.35, holder: blk ? blk.id : null, poss: 'you', note: 'blocked' });
            var back = pickNear(st, 'them', pt(34 + (R() - 0.5) * 20, 31), [1], skipOf(S.holder, from));
            var land = clampPt(pt(34 + (R() - 0.5) * 20, 30 + R() * 4));
            pl.push({ kind: 'clearance', team: 'you', from: blk ? blk.id : null, to: back ? back.id : null, ball: land, dur: passDur(P.dist(bpt, land)),
              holder: back ? back.id : null, poss: 'them', note: null });
          }
          var crossTo = S.crossTo || S.scene.roles.target;
          var pin = {}; if (crossTo) pin[crossTo.id] = { x: 34 + (R() - 0.5) * 8, y: 17 };
          safePass(pl, S.holder, c0, P.dist(pl.cur.ball, c0) > 24 ? 'switch of play' : null, { pin: pin });
          pl.carry(pt(S.x, S.y), 'dribble');
        } };
    }
  };
  LEADS.cross_high = LEADS.cross; LEADS.cross_low = LEADS.cross;
  /* the man on the ball runs at them and is fouled where the free kick is:
   * the foul is the last event, and while the referee's whistle stops play
   * everyone gets into place (the wall, the box) */
  function foulAt(pl, S, fouled, R, named) {
    var st = pl.st, ft = P.teamOf(st, fouled), def = other(ft);
    /* kmtree5 a8 (helper K): the foul is where the moment's free kick is, so the man fouled cannot go to the fouler:
     * instead he starts his run at them from further out (6 to 16 m), far enough that the run lasts until the
     * fouler's legs can be at the spot, and the fouler, when the words do not name him, is the man of theirs who
     * can be there soonest (a8: the nearest in the ideal shape, who could be 20 m away; the man with the ball then
     * stood up to 6 s) */
    var k8f = K8.foul && pl.pos0 && !pl.endId && P4 && !PBRK.foul, f8 = null, L8 = 6.7;   /* (in a result only, where the words name the fouler: the plays' own free kicks were two men at the ball in a8 already, 14 of 14, and one of them came apart with this) */
    if (k8f) {
      f8 = named || null;
      if (!f8) { var be8 = 1e9; outfield(st, def).forEach(function (q) { var e = pl.eta(q.id, pt(S.x, S.y)); if (e < be8) { be8 = e; f8 = q; } }); }
      if (f8) L8 = P.clamp(K8T.vFoul * (pl.eta(f8.id, pt(S.x, S.y)) - pl.time() - 0.6), 6.7, 16);
    }
    if (pl.cur.holder !== fouled.id) deliver(pl, fouled, pt(S.x - dirOf(ft) * 3 * L8 / 6.7, S.y - dirOf(ft) * 6 * L8 / 6.7));
    if (P4 && !PBRK.foul) {
      /* kmtree5 a4 (helper P, note 11 of his a3 playtest: "a free kick near the touchline" with no foul seen; a3's fouler
       * stood 24 m away at the whistle, median): the foul is SEEN. The man on the ball runs at them for about a second;
       * the fouler (the man the text names, else the nearest of theirs) comes in from the goal side and is 1 m from him,
       * goal-side, at the whistle, where the page cuts to the free kick; the commentator says "X fouls Y" */
      var fouler4 = (k8f && f8) || named || nearestTo(st, def, pt(S.x, S.y), ft, skipOf(fouled));
      fouler4 = fouler4 && fouler4.p ? fouler4.p : fouler4;
      var dg = dirOf(ft), from4 = P.dist(pl.cur.ball, S) > 5.5 ? null : pt(S.x - dg * 0.6 * (S.x < 34 ? -1 : 1), S.y - dg * (k8f ? Math.min(10, L8 * 0.9) : 6));
      if (from4) { from4 = clampPt(from4); if (P.dist(pl.cur.ball, from4) > 0.6) pl.carry(from4, 'carry'); }   /* (a run of about 6 m at him, so the challenge is seen) */
      var cb4 = pl.carry(pt(S.x, S.y), 'dribble');
      if (k8f && fouler4) { var rem8 = pl.eta(fouler4.id, pt(S.x, S.y)) - (pl.time() - cb4.dur); cb4.dur = Math.max(cb4.dur, Math.min(rem8 + 0.3, K8T.foulMax + 1)); cb4.k8 = 'foul'; }   /* (the run lasts until the fouler can be there) */
      if (fouler4) {
        cb4.pin = cb4.pin || {};
        cb4.pin[fouler4.id] = clampPt({ x: S.x + (S.x < 34 ? 0.4 : -0.4), y: S.y + dg * 0.3 });   /* goal-side, at the ball: about 1 m between the two dots */
        cb4.fouler = fouler4.id;
      }
      pl.push({ kind: 'foul', team: def, from: fouler4 ? fouler4.id : null, to: fouled.id, ball: { x: S.x, y: S.y }, dur: 1.5,
        holder: S.holderId, poss: ft, note: 'free kick' });
      return;
    }
    if (P.dist(pl.cur.ball, S) > 1.5) pl.carry(pt(S.x, S.y), 'dribble');
    var fouler = S.near && P.teamOf(st, S.near) === def ? S.near : pickNear(st, def, pt(S.x, S.y), null, {});
    pl.push({ kind: 'foul', team: def, from: fouler ? fouler.id : null, to: fouled.id, ball: { x: S.x, y: S.y }, dur: 1.5,
      holder: S.holderId, poss: ft, note: 'free kick' });
  }

  /* ------------------------------------------------------------ a segment */
  /* d1: each match remembers how its plays opened, so the same opening is
   * not staged twice (keyed on the match object, never written onto it) */
  var OPEN = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function openingKey(seg) {
    return seg.events.slice(0, 3).map(function (e) { return e.kind + ':' + e.from + '>' + e.to; }).join('|');
  }
  /* THE PLAY BEFORE A MOMENT. `from` is where the last thing left off (the
   * kick-off, or the end of the last result). Ends at startOf(pending). */
  function segment(st, pending, from) {
    var S = P.startOf(st, pending);
    var seen = OPEN && GUARD.opening ? OPEN.get(st) : null;
    if (OPEN && !seen) { seen = {}; OPEN.set(st, seen); }
    var used = {};
    if (seen) for (var ix in seen) if (+ix < pending.index) used[seen[ix]] = 1;
    var best = null;
    for (var attempt = 0; attempt < 10; attempt++) {
      var R = mulberry(seedOf(st, pending.index, pending.step || 1, attempt));
      var seg = planSegment(st, pending, from, S, R);
      var err = Math.abs(seg.duration - TARGET), dup = !!used[openingKey(seg)];
      var score = err + (dup ? 100 : 0) + (seg.duration < 3.6 || seg.duration > 7 ? 5 : 0);
      if (!best || score < best.score) best = { seg: seg, score: score };
      if (!dup && seg.duration >= 4.3 && seg.duration <= 6.0) break;
    }
    var planned = best.seg.duration;
    var out = scaleTo(best.seg, playLength(planned));
    out.planned = planned;   /* m3: the plan's own length, before it was fitted */
    out.kind = 'play'; out.start = S; out.index = pending.index; out.scene = S.scene.id;
    out.end = endState(out, S.team);
    if (seen) seen[pending.index] = openingKey(out);
    if (A2) prepClaims(st, pending, out);
    if (A2) settle(out);   /* a2: the end picture is where the men's legs get them (see track) */
    /* kmtree5 a6 (helper W) part 2, in a play too: a wait before a pass (the man it is for is not there yet, or a short
     * plan was stretched to 5 s) is played as football, and the play made again from the same plan; its length stays */
    if (W6.hold && A2 && out.ww0) for (var hr6 = 0, trim6 = 0; hr6 < 3; hr6++) {
      var hb6 = wwHold(st, out, { opt: null, near: null, text: '', trim: trim6 });
      if (!hb6) break;
      var w6 = out.ww0, o6 = build(st, w6.start, w6.startPos, hb6, copyPos(w6.endPos), w6.endBall, w6.salt);
      if (w6.cardMen.length) o6.keys[o6.keys.length - 1].cardMen = w6.cardMen;
      o6.ww0 = w6; o6.planned = planned; o6.scale = out.scale; o6.kind = 'play'; o6.start = S; o6.index = pending.index; o6.scene = S.scene.id;
      o6.end = endState(o6, S.team);
      prepClaims(st, pending, o6); wwSpent(o6, out); settle(o6);
      var over6 = o6.duration - out.duration;
      if (over6 > 0.3) {
        if (!trim6 && over6 < 1.5) { trim6 = over6 + 0.1; continue; }
        W6S.longer++; break;
      }
      trim6 = 0; o6.ww = (out.ww || 0) + 1; W6S.played++; out = o6;
    }
    return out;
  }
  function planSegment(st, pending, from, S, R) {
    var start = from && from.ball ? from : kickoffState(st);
    var pl = new Planner(st, R, start);
    if (!pl.cur.holder) {
      var kp = keeperOf(st, pl.cur.team || S.team);
      pl.cur.holder = kp.id; pl.cur.team = P.teamOf(st, kp);
    }
    var startPos = start.pos ? copyPos(start.pos) : keyPos(st, start.ball, start.holder, start.team);
    P.roster(st).forEach(function (r) { if (!startPos[r.id]) startPos[r.id] = P.shapeAll(st, start.ball, start.team)[r.id]; });
    pl.pos0 = startPos; pl.endId = S.holderId;   /* kmtree5 a8 (helper K): the Planner knows where the men are when the play starts, and who it ends on */
    restart(pl, start, startPos);
    var lf = LEADS[S.scene.id];
    var lead = lf ? lf(st, S, R) : null;
    if (lead && !lead.pre.holder) lead = null;
    var pre = lead ? lead.pre : { team: S.team, holder: S.holder, pt: pt(S.x, S.y) };
    var budget = TARGET - (A2 ? MV.legBudget : 0) - (lead ? lead.est : 0);   /* (a2: the legs' passes wait for their men and carries are at a runner's speed, so the plan is made a little shorter to land near 5 s) */
    if (K8.kick && pl.kick && pl.time() + 0.6 <= budget + K8T.kickSafe) k8KickOn(pl, startPos);   /* kmtree5 a8 (helper K): after the tap from the centre, a safe ball */
    bridge(pl, pre, budget);
    if (lead) lead.run(pl);
    /* whatever the plan did, the ball ends with the man the moment names */
    if (pl.cur.holder !== S.holderId) deliver(pl, S.holder, pt(S.x, S.y), S.air ? 'in the air' : null);
    else if (P.dist(pl.cur.ball, S) > 0.6) pl.carry(pt(S.x, S.y));
    runIn(st, pl, S);
    /* the last picture: the moment's own */
    var base0 = P.shapeAll(st, { x: S.x, y: S.y }, S.team);
    if (P.MOVE && P.MOVE.on) base0 = reachLimit(st, base0, startPos, Math.max(0.3, playLength(pl.time())), null, S, S.team);   /* mv1 */
    var endPos = P.freeze(st, S, base0);
    var cardMen = A2 ? cardStage(st, pending, S, endPos, startPos, Math.max(0.3, playLength(pl.time()))) : [];
    var endBall = { x: S.x, y: S.y, z: S.air ? (S.scene.id === 'over_top' ? 1.0 : 0.6) : 0 };
    var w0 = W6.hold ? { start: start, startPos: startPos, endPos: copyPos(endPos), endBall: endBall, salt: seedOf(st, pending.index, 3, 0), cardMen: cardMen } : null;   /* (kmtree5 a6, helper W: what the play was built from, so a wait can be played as football and the play made again) */
    var segB = build(st, start, startPos, pl.beats, endPos, endBall, seedOf(st, pending.index, 3, 0));
    if (cardMen.length) segB.keys[segB.keys.length - 1].cardMen = cardMen;
    if (w0) segB.ww0 = w0;
    return segB;
  }
  /* the man the moment is about makes his run: he is already moving into
   * the space when the last pass is played */
  /* a2: THE MEN THE CARDS NAME ARE WHERE THE CARD'S ACTION CAN HAPPEN (review of the night, item 3: "Porro
   * crosses it low" with Porro drawn in his own half, 35 m behind the ball). For the decision this picture
   * stops at, a man a live card has crossing the ball goes wide in the final third, on his side of the pitch,
   * and a man a card sends round the outside goes wide, a little ahead of the ball; his legs run there during
   * the play and get as far as they can in the time (the end picture is where they get him; see track, endRun).
   * The man on the ball and the man the scene names next to him keep their places. Returns the ids moved. */
  var CARDMEN = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function cardStage(st, pend, S, endPos, startPos, secs6) {
    if (!pend || !pend.moment || !endPos) return [];
    var T = S.team, dir = dirOf(T), moved = [], keep = {};
    [S.holderId, S.near && S.near.id, S.crossTo && S.crossTo.id].forEach(function (x) { if (x) keep[x] = 1; });
    var RX = [[/(?:^|[ ,])([A-Z][^ .,:;]*),? who crosses it|(?:^|[ ,])([A-Z][^ .,:;]*) crosses it/, 'cross'],
      [/passes it out to ([A-Z][^ .,:;]*), who is running (?:free )?round the outside|Send ([A-Z][^ .,:;]*) running outside|([A-Z][^ .,:;]*) overlaps/, 'outside']];
    /* kmtree5 a6 (helper W) part 1b: THE MAN A LIVE CARD SENDS ROUND THE OUTSIDE starts from behind and outside the man who
     * holds the ball for him (W6T.ovlBack m behind, W6T.ovlOut m nearer the touchline): the place a full-back overlaps
     * from, not ahead of the ball (a2's words for this card changed in a3, so a2's rule below no longer saw it, and
     * Porro stood 37 m behind the ball: note 3). The card may pass it to a second man first ("Fabián gives it to
     * Yamal. Yamal holds it while Porro runs round the outside of Theo"): then it is that man he starts behind. */
    if (W6.stage) (pend.moment.options || []).forEach(function (o) {
      if (o.disabled || !(o.id === 'PAIR_OVERLAP' || o.id === 'Z_OVERLAP') || !o.to || !endPos[o.to.id] || keep[o.to.id] || isKeeperP(st, o.to) || P.teamOf(st, o.to) !== T || moved.indexOf(o.to.id) >= 0) return;
      var hm6 = /([^ .,:;]+) holds it while/.exec(String(o.label || '')), hb6 = hm6 ? P.byFirst(st, hm6[1], T) : null;
      var hq6 = hb6 && hb6.id !== S.holderId && endPos[hb6.id] ? endPos[hb6.id] : { x: S.x, y: S.y - dir * P.BALL_OFF }, ow6 = hq6.x < 34 ? -1 : 1;
      var tx6 = hq6.x + ow6 * W6T.ovlOut; if (tx6 < 3 || tx6 > P.W - 3) tx6 = P.clamp(tx6, 3, P.W - 3);
      var cur6 = endPos[o.to.id], ty6 = hq6.y - dir * W6T.ovlBack;
      if ((cur6.y - ty6) * dir >= 0) return;   /* (already up there, or ahead: a man the picture has running free round the outside is never pulled back) */
      endPos[o.to.id] = clampPt({ x: tx6, y: ty6 });
      moved.push(o.to.id);
    });
    (pend.moment.options || []).forEach(function (o) {
      if (o.disabled) return;
      var t = String(o.label || '');
      RX.forEach(function (rx) {
        var m = rx[0].exec(t); if (!m) return;
        var nm = m[1] || m[2] || m[3], man = nm ? P.byFirst(st, nm, T) : null;
        if (!man || keep[man.id] || !endPos[man.id] || isKeeperP(st, man) || moved.indexOf(man.id) >= 0) return;
        var q = endPos[man.id], side = q.x < 34 ? -1 : 1;
        var tx = side < 0 ? 6 : P.W - 6, ty;
        if (rx[1] === 'cross') ty = upY(T, 78);
        else ty = P.clamp(S.y + dir * 6, 4, P.L - 4);
        if (rx[1] === 'cross' && (S.y - ty) * dir > 0) ty = S.y;   /* (never behind the ball the cross is played from) */
        endPos[man.id] = clampPt({ x: tx, y: ty });
        moved.push(man.id);
      });
    });
    /* a3 (lead: cohcheck, a low cross "for Harvey" with Harvey left at y 68): THE MAN A CROSS OR A CUT-BACK IS FOR is
     * in the attacking area, in the box between the posts' width and a little more, greyed cards too (their words are
     * on the screen) */
    (pend.moment.options || []).forEach(function (o) {
      var rec = o.receiver || o.to, t = String(o.label || '');
      if (!rec || !rec.id || !/\b(cut[s ]?back|cross(?:es)? it|low cross)\b/i.test(t) || t.indexOf('for ' + first(rec)) < 0) return;
      if (BRK.nocrossto || keep[rec.id] || !endPos[rec.id] || isKeeperP(st, rec) || P.teamOf(st, rec) !== T || moved.indexOf(rec.id) >= 0) return;   /* (KM_MVBREAK=nocrossto: off, for the check's break) */
      var q = endPos[rec.id], up = T === 'you' ? q.y : P.L - q.y;
      if (up > 82) return;   /* (the legs may leave him short of the plan: a man planned under 82 m up is sent to 90) */
      endPos[rec.id] = clampPt({ x: P.clamp(q.x, 24, 44), y: upY(T, 90) });
      moved.push(rec.id);
    });
    if (C3) cStage(st, pend, S, endPos, keep, moved, startPos);
    var back6 = W6.stageall ? wwStageAll(st, pend, S, endPos, keep, moved) : [];
    /* kmtree5 a6 (helper W) part 1: the support in the picture the decision is read from (open play only; the men the
     * scene or a card placed keep their places) */
    if (W6.support && !S.special && !/^(freekick|corner)/.test(String(S.scene && S.scene.id))) {
      var sk6 = {}, rl6 = (S.scene && S.scene.roles) || {};
      for (var kk6 in keep) sk6[kk6] = 1;
      moved.forEach(function (id) { sk6[id] = 1; });
      back6.forEach(function (id) { sk6[id] = 1; });   /* (the man a live pass BACK is for stays back: the support does not bring him up) */
      for (var rr6 in rl6) if (rl6[rr6] && rl6[rr6].id) sk6[rl6[rr6].id] = 1;
      var sup6 = wwSupport(st, endPos, { x: S.x, y: S.y }, T, sk6);
      /* THE OTHER SIDE'S BACK LINE DOES NOT WAIT FOR A FULL-BACK CAUGHT UPFIELD. The end picture's reach limit moves a
       * back line as one line: every man the share of the way that its man with furthest to go can run. A wide
       * defender who was up with his side's attack (the support) has 30 m to come back when the ball is lost, and
       * held the centre-backs 10 m up the pitch with him (a result of theirs then waited 3 s for the centre-back the
       * words name). So when a wide defender of the side WITHOUT the ball starts more than 12 m up from the line's
       * place, each of its other defenders goes as far toward his own place as HE can in the time. */
      var Dt = other(T), shD = null, lineD = outfield(st, Dt).filter(function (q) { return q.line === 0 && endPos[q.id] && startPos && startPos[q.id]; });
      if (secs6 && lineD.length >= 3 && !/through on his own|is alone|on his own/.test(String(pend.moment.text || ''))) {   /* (not where the words say a man is through on his own: there the defenders stay off his lane, cohcheck through_on_own_goalside) */
        shD = P.shapeAll(st, { x: S.x, y: S.y }, T);
        var uD = function (q) { return Dt === 'you' ? q.y : P.L - q.y; };
        var caught = lineD.some(function (q) { return P.laneOf(q, Dt) !== 1 && uD(startPos[q.id]) - uD(shD[q.id]) > 12; });
        if (caught) {
          var mvD = [];
          lineD.forEach(function (q) {
            if (sk6[q.id] || moved.indexOf(q.id) >= 0 || sup6.indexOf(q.id) >= 0) return;
            var a = startPos[q.id], tg = shD[q.id], d = P.dist(a, tg), mx = MV.reachPic * secs6 + 2;
            endPos[q.id] = d > mx ? { x: a.x + (tg.x - a.x) * mx / d, y: a.y + (tg.y - a.y) * mx / d } : { x: tg.x, y: tg.y };
            mvD.push(q.id);
          });
          if (mvD.length) P.tidy(endPos, (function () { var f = {}; for (var id in endPos) if (mvD.indexOf(id) < 0) f[id] = 1; return f; })(), 3.0);
        }
      }
      if (sup6.length) P.tidy(endPos, (function () { var f = {}; for (var id in endPos) if (sup6.indexOf(id) < 0) f[id] = 1; return f; })(), 3.0);
    }
    if (moved.length) P.tidy(endPos, (function () { var f = {}; for (var id in endPos) if (moved.indexOf(id) < 0) f[id] = 1; return f; })(), 3.0);
    return moved;
  }
  /* kmtree5 a3 (helper C): WHERE C'S CARDS NEED THEIR MEN, for the decision this picture stops at (live cards only):
   *   FK_SHORT: the man the short free kick goes to stands 7 m from the ball, toward the middle and a little back
   *     (pitch.js startOf: the next decision starts there), and the man marking him (the card's foil) 2 m from him,
   *     goal-side;
   *   Z_RUN_BEHIND (the through ball): the runner on the shoulder of the defender with him, 1.5 m behind him and 2.5 m
   *     to his side (not yet past him: offside), so the ball can be played into the space behind;
   *   Z_RECYCLE with its +3: the receiver behind the man on the ball (the pass goes back on this picture too);
   *   Z_CUTBACK: the man it is for at the D of their box, on his way in;
   *   Z_SHOOT_FAR with their Sweeper keeper off his line: the keeper 20 m out, outside his box (3.5 m clear of it). */
  /* kmtree5 a5 (helper R) P2, a declared small branch; BRIEF-a5.md): with the receivers by geometry on (options.js
   * KM_A5_RECV / ?a5recv=on), Z_THROUGH carries the same cStage as Z_RUN_BEHIND (the runner and the defender opposite
   * him) and is drawn the same way: the runner on that defender's shoulder, the ball into the space behind him, a loss
   * won by him in that space. Without the switch Z_THROUGH has no cStage and nothing here changes. */
  function thruCard(o) { return !!o && (o.id === 'Z_RUN_BEHIND' || (o.id === 'Z_THROUGH' && !!o.cStage && !!o.cStage.through)); }
  function cStage(st, pend, S, endPos, keep, moved, startPos) {
    var T = S.team, dir = dirOf(T);
    /* KEEPER_SHORT: the man of theirs drawn at the card's gap from its receiver (pitch.js keeper_pressed) is the one
     * who can get there: of their outfield men, the nearest to that spot where this play starts; he and the man
     * pitch.js put there change places in the end picture */
    if (S.ksGap && startPos && C3BRK !== 'gap') {
      var rq = endPos[S.ksGap.id], O = other(T), onG = null, gd = 99;
      if (rq) outfield(st, O).forEach(function (q) { if (endPos[q.id]) { var dq = P.dist(endPos[q.id], rq); if (dq < gd) { gd = dq; onG = q; } } });
      if (onG) {
        var spot = endPos[onG.id], best9 = null, bd9 = 1e9;
        outfield(st, O).forEach(function (q) { var sp = startPos[q.id], ep = endPos[q.id]; if (!sp || !ep || keep[q.id]) return; if (q !== onG && P.dist(ep, S) < 8) return; var dq = P.dist(sp, spot); if (dq < bd9) { bd9 = dq; best9 = q; } });
        if (best9 && best9 !== onG) { var tmp = endPos[best9.id]; endPos[best9.id] = spot; endPos[onG.id] = tmp; moved.push(best9.id); }
      }
    }
    function place(man, at) { if (!man || !endPos[man.id] || keep[man.id] || moved.indexOf(man.id) >= 0) return; endPos[man.id] = clampPt(at); moved.push(man.id); }
    (pend.moment.options || []).forEach(function (o) {
      if (o.hide) return;   /* (a greyed card is shown too: what its words say must be drawn) */
      if (o.id === 'FK_SHORT' && o.to && (pend.mode === 'freekick' || (P4 && (pend.mode === 'fkwide' || (pend.moment.sit && pend.moment.sit.id === 'dead_ball_wide')))) && C3BRK !== 'fkman') {   /* (kmtree5 a4: and at G's touchline free kick) */
        var side = S.x < 34 ? 1 : -1, r0 = P4 && !PBRK.fknear ? { x: S.x + side * 5, y: S.y - dir * 3 } : { x: S.x + side * 6, y: S.y - dir * 3.5 };   /* (kmtree5 a4: 5.8 m, so the pass drawn stays within 10 m: c_check C3) */
        place(o.to, r0);
        if (P4 && !PBRK.fkafter && P.noteAfterSpot) P.noteAfterSpot(st, pend.index, clampPt(r0), 'FK_SHORT');   /* (kmtree5 a4: the next decision starts with him there: c_check C3) */
        if (o.foil) place(o.foil, { x: r0.x + side * 0.8, y: r0.y + dir * 1.9 });
      }
      if (P4 && /\b(cut[s ]?back|cross(?:es)? it|low cross)\b/i.test(String(o.label || '')) && (o.receiver || o.to)) {
        /* kmtree5 a4 (helper P; cohcheck card_receiver_near_ball, with G's new menu fills): the man a cross or a
         * cut-back is for is in the attacking area (a3's shape could leave him in midfield) */
        var rc9 = o.receiver || o.to, rp9 = endPos[rc9.id];
        if (rp9 && String(o.label).indexOf('for ' + first(rc9)) >= 0 && P.teamOf(st, rc9) === T && (T === 'you' ? rp9.y <= 72 : rp9.y >= 33)) place(rc9, { x: P.clamp(rp9.x, 22, 46), y: upY(T, 74) });   /* (just inside the attacking area: the least run) */
      }
      if (P4 && !PBRK.square && o.id === 'Z_SQUARE' && o.mate && !o.disabled && Math.abs(S.y - upY(T, P.L)) <= 20) {
        /* kmtree5 a4 (helper P, note 10a): the ball across the goal is to a man at the far post, mirrored across the goal
         * from the man on the ball, 6 m out (a3 left him wherever the shape had him, often 5 m straight ahead) */
        var fx = S.x < 34 ? 39.5 : 28.5, fy = upY(T, P.L - 6.5);
        place(o.mate, { x: fx, y: fy });
      }
      if (P4 && !PBRK.fkhead && o.id === 'FK_CROSS' && pend.moment.sit && pend.moment.sit.id === 'dead_ball_wide') {
        /* kmtree5 a4 (helper P, the a4 review's F9): "X floats it into the box for T to head": T waits in their box for it
         * (a3 left him wherever the shape had him, at halfway), 11 m out, on the far side of the middle */
        var fhm = /floats it into the box for ([^ .,:;]+) to head/.exec(String(o.label || '')), fhT = fhm ? P.byFirst(st, fhm[1], T) : null;
        if (fhT && endPos[fhT.id] && !isKeeperP(st, fhT)) place(fhT, { x: S.x < 34 ? 38 : 30, y: upY(T, P.L - 11) });
      }
      if (o.id === 'Z_RECYCLE' && o.to && o.cStage && o.cStage.back && C3BRK !== 'backalways') {
        /* the pass back with its +3 goes back on the picture it is read over: the receiver at least 6 m behind the man
         * on the ball and more behind him than to his side (he drops in to take it) */
        var rb0 = endPos[o.to.id], hb = { x: S.x, y: S.y };
        if (rb0) {
          var gb = (rb0.y - hb.y) * dir, sb = Math.abs(rb0.x - hb.x);
          if (!(gb <= -6 && -gb >= sb + 1)) { var sx = P.clamp(rb0.x - hb.x, -9, 9); place(o.to, { x: hb.x + sx, y: hb.y - dir * Math.max(6, Math.abs(sx) + 2) }); }
        }
      }
      if (o.id === 'Z_CUTBACK' && o.to && C3BRK !== 'nobyline') {
        /* the cut-back's man is on his way into the box: at the D of their box, in the middle (he arrives around the
         * penalty spot while the ball is carried to the byline) */
        place(o.to, { x: 34 + (S.x < 34 ? 3 : -3), y: upY(T, 84) });
      }
      if (thruCard(o) && o.cStage && o.cStage.through && C3BRK !== 'runner') {
        var q = P.byId(st, o.cStage.through), d = P.byId(st, o.cStage.past), dp = d && endPos[d.id];
        if (q && dp) place(q, { x: dp.x + (dp.x < 34 ? 2.5 : -2.5), y: dp.y - dir * 1.5 });
      } else if (P4 && o.id === 'Z_RUN_BEHIND' && o.cStage && o.cStage.through && C3BRK === 'runner') {
        /* (kmtree5 a4, round 4: c_check --break runner places the runner 3 m past his defender, so the break still bites
         * now that G's menus offer the card where a runner is usually onside anyway) */
        var qB = P.byId(st, o.cStage.through), dB = P.byId(st, o.cStage.past), dpB = dB && endPos[dB.id];
        if (qB && dpB && endPos[qB.id]) { endPos[qB.id] = clampPt({ x: dpB.x + (dpB.x < 34 ? 2.5 : -2.5), y: dpB.y + dir * 3 }); moved.push(qB.id); }
      }
      if (o.id === 'Z_SHOOT_FAR' && o.cStage && o.cStage.keeperOut && C3BRK !== 'keeperin') {
        var k = P.byId(st, o.cStage.keeperOut);
        if (k && endPos[k.id]) { endPos[k.id] = clampPt({ x: 34 + (endPos[k.id].x - 34) * 0.5, y: upY(T, 85) }); moved.push(k.id); }
      }
    });
  }
  function runIn(st, pl, S) {
    var nb = pl.beats.length;
    if (nb >= 2 && pl.beats[nb - 1].to === S.holderId && pl.beats[nb - 1].kind === 'pass') {
      var prev = pl.beats[nb - 2], shp = P.shapeAll(st, prev.ball, S.team)[S.holderId];
      if (shp && prev.holder !== S.holderId) {
        var aim = { x: S.x, y: S.y - dirOf(S.team) * 3 };
        prev.pin = prev.pin || {};
        prev.pin[S.holderId] = clampPt({ x: P.lerp(shp.x, aim.x, 0.6), y: P.lerp(shp.y, aim.y, 0.6) });
      }
    }
  }
  function endState(seg, team) {
    var k = seg.keys[seg.keys.length - 1];
    return { ball: { x: k.ball.x, y: k.ball.y, z: k.ball.z || 0 }, holder: k.holder, team: k.poss || team, pos: copyPos(k.pos) };
  }

  /* ------------------------------------------------------------ a result */
  /* WHAT THE RESULT'S TEXT SAYS HAPPENS, in a few words: how the ball
   * moves, and where the play stops. Read from the engine's text, the one
   * the user reads, so the dots and the words cannot disagree. */
  var NMX = '([^ .,:]+)';
  function findAll(text, re) { var out = [], m; re.lastIndex = 0; while ((m = re.exec(text))) out.push(m[1]); return out; }
  /* the men the text says were gone past */
  function beatenIn(st, text, defTeam) {
    var t = String(text || '');
    if (/half a (?:yard|metre) on/.test(t)) return [];
    var names = findAll(t, new RegExp('(?:goes|dribbles|gets|cuts inside|runs|plays it|passes it|puts [^ ]+ through) past ' + NMX, 'g'))
      .concat(findAll(t, new RegExp('runs clear of ' + NMX, 'g')));
    /* kmtree5 a6 (helper W): "Porro runs round the outside of Theo, takes the pass": Theo is gone past (the card's own
     * grant says he is out of position). a5 drew him goal-side of Porro, 20 m from the man he was pressing, so he
     * had to leave that man at once to be there. Now he stays on the man with the ball, turns when the runner goes by,
     * and ends behind him. */
    if (W6.hold) names = names.concat(findAll(t, new RegExp('runs round the outside of ' + NMX + ', takes the pass', 'g')));
    var out = [];
    names.forEach(function (n) { var q = P.byFirst(st, n, defTeam); if (q && !isKeeperP(st, q) && out.indexOf(q) < 0) out.push(q); });
    return out;
  }
  function outcomeOf(text) {
    var t = String(text || '');
    if (/^GOAL\.|^THEY SCORE\./.test(t)) return 'goal';
    if (/comes on\./.test(t)) return 'sub';
    if (/for (?:their|your) corner|out for a corner/.test(t)) return 'corner';
    if (/offside/.test(t)) return 'offside';
    if (/throw-in|touchline/.test(t)) return 'throw';
    if (/goes wide|go wide|over the bar|clears the bar|round the post|heads it over|header goes wide|and it goes wide|shoots wide/.test(t)) return 'wide';
    if (/out of play/.test(t)) return /across the goal|go wide|makes [^ ]+ go wide/.test(t) ? 'byline' : 'throw';
    if (/hits the wall|the free kick hits it/.test(t)) return 'wall';
    if (/pulls [^ ]+ down|trips|Free kick to/.test(t)) return 'foul';
    if (/cannot hold it|pushes the shot out|pushes it out, and|gets to the loose ball|gets to it first/.test(t)) return 'rebound';
    if (/catches it|catches the|holds on to it|throws it|Their keeper catches/.test(t)) return 'catch';
    if (/saves it|pushes it round/.test(t)) return 'save';
    if (/runs through to their keeper/.test(t)) return 'tokeeper';
    if (/kick it clear|kicks it clear|heads it as far as|pushes it away|lands outside your box|headed clear|kicks it long|only kicks it a few (?:yards|metres)/.test(t)) return 'clear';
    if (/pass it back to their own defence|has to pass it back|pass it back into/.test(t)) return 'theyback';
    if (/keeps the ball in the corner/.test(t)) return 'corner_flag';
    if (/blocks/.test(t)) return 'block';
    return 'play';
  }
  /* where the ball goes out over a touchline, near where it is */
  function touchPt(ball, R, far) {
    var x = ball.x < 34 ? -0.9 : P.W + 0.9;
    return { x: x, y: P.clamp(ball.y + (R() - 0.5) * 10 + (far || 0), 3, P.L - 3) };
  }

  /* m3: THE BALL CHANGES HANDS, where and how (d1's staging, moved here so
   * preview.js can ask the same question and its arrow ends on the spot):
   * the keeper takes it where he stands; a lost dribble is a tackle where the
   * man is (a stride ahead when it runs under his foot); a pass played
   * straight to them is cut out most of the way to the man who takes it;
   * anything else is a tackle at the ball. `ball` is the ball when it is
   * lost, `lostTeam` the team losing it, `pos` the frozen picture. Pure: it
   * draws no random number. */
  /* m3: THE MAN WHO SCORES, read from the goal's text: in the sentence
   * that says "scores", the clause just before it names him ("..., and Yamal
   * scores", "Charlie rises above Lewis to meet the cross from Vince and
   * scores" is Charlie, "Alvarez gets to the ball first and scores"); when
   * that clause names nobody ("Nathan plays it into the box, where ..., and
   * scores"), the clause before it. The first man of the scoring side in the
   * clause; never a keeper. */
  function scorerIn(st, text, team) {
    var sents = String(text || '').split(/\. /);
    for (var i = 0; i < sents.length; i++) {
      var at = sents[i].search(/\bscores\b/);
      if (at < 0) continue;
      var cl = sents[i].slice(0, at).split(/, /);
      for (var c = cl.length - 1; c >= 0; c--) {
        var toks = cl[c].match(/[^ .,]+/g) || [];
        for (var j = 0; j < toks.length; j++) {
          var q = P.byFirst(st, toks[j], team);
          if (q && P.onPitch(st, q) && !isKeeperP(st, q)) return q;
        }
      }
    }
    return null;
  }
  function lostWin(st, text, o, ball, lostTeam, pos, taker) {
    text = String(text || '');
    if (isKeeperP(st, taker)) {
      var kt = P.teamOf(st, taker), ks = pos[taker.id] || { x: 34, y: kt === 'you' ? 3 : P.L - 3 };
      return { kind: 'save', ball: { x: ks.x, y: ks.y } };
    }
    if (/loses (?:it|the ball) to|is caught by [^ .,]+\. |lets it run under his foot/.test(text)) {
      var ahead = /run under his foot/.test(text) ? 1.5 : 0;
      return { kind: 'tackle', ball: clampPt({ x: ball.x, y: ball.y + dirOf(lostTeam) * ahead }) };
    }
    if (/plays it straight to|gives it straight to|passes it across the goal, straight to|pulls it back straight to|hits the cross against|before the ball arrives|is beaten in the air/.test(text) || (o && (o.to || o.receiver) && !/loses/.test(text))) {
      var tq = pos[taker.id] || ball;
      return { kind: 'interception', ball: clampPt({ x: P.lerp(ball.x, tq.x, 0.8), y: P.lerp(ball.y, tq.y, 0.8) }), note: /beaten in the air/.test(text) ? 'header' : null };
    }
    return { kind: 'tackle', ball: clampPt({ x: ball.x, y: ball.y }) };
  }

  /* THE RESULT OF A DECISION, played out: about a second or two. `p` is the
   * moment that was decided, `o` the option, `ev` what happened, `nx` the
   * next moment (or null), `from` the frozen picture of `p`. When the same
   * play goes on, it ends exactly where `nx` starts; when the play stops, it
   * ends with the restart in place for the next play. */
  function resolve(st, p, o, ev, nx, from) {
    var R = mulberry(seedOf(st, p.index, (p.step || 1) + 50, 7));
    var start = from && from.ball ? from : kickoffState(st);
    var pl = new Planner(st, R, start);
    var startPos = start.pos ? copyPos(start.pos) : keyPos(st, start.ball, start.holder, start.team);
    var S0 = P.startOf(st, p);
    var who = p.attacking || p.moment.sit.who;
    var actor = o && o.actor && P.onPitch(st, o.actor) ? o.actor : null;
    var foil = o && o.foil && P.onPitch(st, o.foil) ? o.foil : null;
    var goesOn = !!(nx && nx.continues);
    var S = goesOn ? P.startOf(st, nx) : null;
    var text = String((ev && ev.text) || ''), kind = ev ? ev.kind : 'nothing';
    var oc = outcomeOf(text);
    var endPos = null, endBall = null, result = { kickoff: null, restart: null }, beaten = [];
    var seg8late = [];   /* m8: the defenders the text names as late, who run toward the play */
    var att = who, def = other(who), fkHeader = null;   /* (kmtree5 a4: the man who heads a floated free kick away) */
    var cur0 = pl.cur;
    if (!cur0.holder) { cur0.holder = S0.holderId; cur0.team = S0.team; }

    function man(nm, team) { return P.byFirst(st, nm, team); }
    function goalAt(team) {         // team = who scores
      var gx = 34 + (R() - 0.5) * 5;
      return { x: gx, y: team === 'you' ? P.L + 0.9 : -0.9 };
    }
    /* a shot, cross or header from the man on the ball towards `team`'s goal */
    function shotTo(to, note, dur) {
      pl.push({ kind: 'shot', team: pl.cur.team, from: pl.cur.holder, to: null, ball: to, dur: dur || passDur(P.dist(pl.cur.ball, to)) * 0.7, holder: null, poss: pl.cur.team, note: note });
    }
    function crossIn(tgt) {
      var sp = startPos[tgt.id] || { x: 34, y: 9 };
      if (A2) {   /* a2: a cross is played into the box, where the man it is for heads it (he runs there; the ball waits for him: settle) */
        var tT = P.teamOf(st, tgt), bx = { x: P.clamp(sp.x, 22, 46), y: tT === 'you' ? P.clamp(sp.y, P.L - 14, P.L - 6) : P.clamp(sp.y, 6, 14) };
        pl.pass(tgt, bx, 'pass', 'cross');
        return;
      }
      pl.pass(tgt, { x: sp.x, y: sp.y + dirOf(P.teamOf(st, tgt)) * -0.8 }, 'pass', 'cross');
    }
    function keeperSpot(team) { var k = keeperOf(st, team); return startPos[k.id] || { x: 34, y: team === 'you' ? 3 : P.L - 3 }; }
    /* kmtree5 a4 (helper P, note 18b): THE TAKE-ON. Slalom's checks (ev.dice.checks, in order: each man, its verdict),
     * or null; meetMan: the man steps into the path of the man on the ball, on his line toward `toward`, a stride ahead
     * of the ball; takeOns: for each man in turn, he meets him and goes past him with a sideways kink of 2.5 m, the man
     * turning to chase a step behind (one beat each, so one touch sound each). KM_PBREAK=slalom: a3's single run. */
    function slalomOf() {
      if (!P4 || PBRK.slalom || !o || o.pays !== 'slalom' || !ev || !ev.dice || !ev.dice.checks || !ev.dice.checks.length) return null;
      return ev.dice.checks.map(function (c) { var mm = c.foil && (P.byId(st, c.foil.id) || c.foil); return { man: mm && startPos[mm.id] ? mm : null, band: c.band }; }).filter(function (c) { return c.man; });
    }
    var kinkSide = 1;
    function unitTo(a, b) { var dx = b.x - a.x, dy = b.y - a.y, dl = Math.sqrt(dx * dx + dy * dy) || 1; return { x: dx / dl, y: dy / dl, d: dl }; }
    function meetMan(fm, toward) {
      /* he runs at the man, bending toward where he is going; the man steps across into his line, as far as his legs
       * take him in the time (he only moves sideways onto the line: the take-on is where he is) */
      var c = pl.cur.ball, fq0 = startPos[fm.id] || c, uF = unitTo(c, fq0), uS = unitTo(c, toward);
      var ub = { x: uF.x * 2 + uS.x, y: uF.y * 2 + uS.y }, ubl = Math.sqrt(ub.x * ub.x + ub.y * ub.y) || 1, u = { x: ub.x / ubl, y: ub.y / ubl };
      /* (a man behind him or far away does not make him turn back: he comes across to meet him, on his way) */
      if ((fq0.x - c.x) * uS.x + (fq0.y - c.y) * uS.y < 1 || uF.d > 12) u = { x: uS.x, y: uS.y };
      var tp = Math.max(2.6, Math.min(8, (fq0.x - c.x) * u.x + (fq0.y - c.y) * u.y)), on = clampPt({ x: c.x + u.x * tp, y: c.y + u.y * tp });
      var meet = clampPt({ x: on.x - u.x * 2.2, y: on.y - u.y * 2.2 });
      var b1 = pl.carry(meet, 'carry', 'takeon'); b1.dur = Math.max(b1.dur, 0.55, Math.min(2.2, legTime(P.dist(fq0, on)) * 1.2));
      b1.pin = {}; b1.pin[fm.id] = on; b1.meets = fm.id;
      return { meet: meet, u: u, on: on };
    }
    function takeOns(men, toward) {
      men.forEach(function (fm) {
        var mt = meetMan(fm, toward), u = mt.u, on = mt.on;
        kinkSide = -kinkSide;
        var nx9 = -u.y * kinkSide, ny9 = u.x * kinkSide;
        var go = clampPt({ x: on.x + u.x * 2.5 + nx9 * 2.0, y: on.y + u.y * 2.5 + ny9 * 2.0 });   /* (round him, 2 m to the side) */
        var b2 = pl.carry(go, 'dribble', 'past', fm);
        b2.pin[fm.id] = clampPt({ x: on.x + u.x * 1.2 + nx9 * 0.8, y: on.y + u.y * 1.2 + ny9 * 0.8 });   /* (he turns and goes with him, toward the side he went, a couple of metres behind) */
        b2.meets = fm.id; b2.slalom = true;
      });
    }
    /* the restart at the end of a result: the man taking it at the ball */
    function stopFor(type, team, ball, taker) {
      result.restart = { type: type, team: team };
      var tk = taker || (type === 'goal kick' ? keeperOf(st, team) : nearestTo(st, team, { x: P.clamp(ball.x, 2, P.W - 2), y: ball.y }, team, {}).p);
      var tpos = { x: P.clamp(ball.x, 0.6, P.W - 0.6), y: P.clamp(ball.y - dirOf(team) * (type === 'throw-in' ? 0 : 1.2), 0.6, P.L - 0.6) };
      var pin = {}; pin[tk.id] = tpos;
      pl.push({ kind: 'out', team: team, from: null, to: tk.id, ball: { x: ball.x, y: ball.y }, dur: type === 'throw-in' ? 0.6 : 0.9,
        holder: tk.id, poss: team, note: type, pin: pin });
    }
    /* the goal kick: the ball placed on the six-yard line */
    function goalKick(team, side) {
      var b = { x: side < 34 ? 28 : 40, y: team === 'you' ? 5.5 : P.L - 5.5 };
      stopFor('goal kick', team, b);
    }
    var shooter = (o && o.shotBy && P.onPitch(st, o.shotBy)) ? o.shotBy : null;
    /* mv1: A SHOT THE KEEPER GETS TO meets him 1.4 to 3 m to one side of
     * where he stood (inside his posts), and he dives across to it: the
     * shot beat pins him there (his hands at the ball, as the save beat
     * that follows has him). s0 aimed these shots at his feet, and the
     * shape pulled him back to the middle while the ball flew. `prefer`
     * forces the side (-1 left, 1 right). No random draw: a hash of the
     * match seed and the moment, so the rest of the staging is untouched. */
    var mvOn = !!(P.MOVE && P.MOVE.on);
    /* where the keeper is when the shot is struck: where he started, or,
     * after a pass or two in this result, where the last key frame's shape
     * has him */
    function keeperNow(team) {
      var k = keeperOf(st, team);
      if (!pl.beats.length || !k) return keeperSpot(team);
      /* the key frames build() will make, the same way */
      var prev = startPos, salt = seedOf(st, p.index, (p.step || 1) + 50, 9);
      pl.beats.forEach(function (lb, i) {
        var kp = keyPos(st, lb.ball, lb.holder, lb.poss, lb.pin || null, salt + ':' + i, lb.kind === 'out' || lb.kind === 'foul');
        var keep = {}; [lb.holder, lb.from, lb.to, lb.past].forEach(function (x) { if (x) keep[x] = 1; });
        if (lb.pin) for (var pk in lb.pin) keep[pk] = 1;
        for (var sk in STAGED) keep[sk] = 1;
        prev = lb.kind === 'out' || lb.kind === 'foul' ? kp : reachLimit(st, kp, prev, lb.dur, keep, lb.ball);
      });
      return prev[k.id] || keeperSpot(team);
    }
    /* m8: HOW FAR THE KEEPER GOES FOR IT, from the words: a shot straight at
     * him, one he sees all the way, a cross he comes for: a step (0.2 to 0.7 m);
     * a shot he pushes out, cannot hold, tips round: a full dive (1.6 to 2.8 m);
     * any other save: between (0.8 to 1.4 m). mv1 drew every save as a dive. */
    var DIVE = { small: [0.2, 0.5], mid: [0.8, 0.6], big: [1.6, 1.2] };
    function diveOf(t) {
      t = String(t || '');
      if (/straight at|too close to|catches it easily|sees it all the way|holds the shot|catches the (?:low )?cross|comes for the cross|catches the header|catches the ball before|takes the ball from|runs through to/.test(t)) return 'small';
      if (/pushes (?:the shot|it) (?:out|round)|cannot hold it|tips it|full stretch|at full length/.test(t)) return 'big';
      return 'mid';
    }
    function diveSpot(defTeam, salt, prefer) {
      var ks = keeperNow(defTeam), side = prefer || (P.hash01(st.seed, p.index, p.step || 1, salt) < 0.5 ? -1 : 1);
      if (ks.x + side * 3 > 37.3 || ks.x + side * 3 < 30.7) side = -side;
      var reach = 1.4 + P.hash01(st.seed, p.index, p.step || 1, salt, 'r') * 1.6;
      if (m8On()) { var dv = DIVE[diveOf(text) === 'small' ? 'small' : salt === 'parry' || salt === 'post' ? 'big' : diveOf(text)]; reach = dv[0] + P.hash01(st.seed, p.index, p.step || 1, salt, 'r') * dv[1]; }
      return { x: P.clamp(ks.x + side * reach, 30.8, 37.2), y: ks.y + dirOf(defTeam) * 0.5 };
    }
    function divePin(defTeam, at) {
      var k = keeperOf(st, defTeam), pin = {};
      if (k) pin[k.id] = { x: at.x, y: P.clamp(at.y - dirOf(defTeam) * P.BALL_OFF, 0.6, P.L - 0.6) };
      return pin;
    }
    function keeperShot(defTeam, note, dur, salt, prefer) {
      var at = diveSpot(defTeam, salt, prefer);
      shotTo(at, note, dur);
      pl.last().pin = divePin(defTeam, at);
      return at;
    }

    /* kmtree5 a3 (helper C; Eduardo 2026-09-30: the cut-back "should 'feel' like a real cut back play"): THE CUT-BACK.
     * The man on the ball first runs to the byline, 2.5 m from it at the corner of their box on his wing, and the pass
     * goes back from there along the ground (pitch.js startOf puts the man it is for around the penalty spot when it
     * comes off). */
    var cutMixed = false;
    if (C3 && o && o.id === 'Z_CUTBACK' && actor && pl.cur.holder === actor.id && kind !== 'goal' && kind !== 'conceded' && C3BRK !== 'nobyline') {
      var cbSide = pl.cur.ball.x < 34 ? -1 : 1;
      var cbB = pl.carry(pt(cbSide < 0 ? 16 : P.W - 16, upY(att, P.L - 2.5)), 'dribble');
      if (cbB && A2) cbB.dur = Math.max(cbB.dur, legTime(P.dist(start.ball, cbB.ball)) + 0.7);   /* (time for his legs, from where he stands, to get there with the ball) */
      /* the man it is for makes his run while the ball is carried to the byline, so the pass (a ball along the ground, over
       * 15 m/s) meets him as he arrives: when it comes off, 1.5 m short of where he takes it; otherwise the penalty spot */
      var cbM = o.to && P.onPitch(st, o.to) ? o.to : null;
      if (cbB && cbM && startPos[cbM.id]) {
        var cbTo = ev && ev.band === 'good' && S && S.holderId === cbM.id ? { x: S.x, y: S.y - dirOf(att) * 1.5 } : { x: 34, y: upY(att, P.L - 11) };
        cbB.pin = cbB.pin || {}; cbB.pin[cbM.id] = clampPt(cbTo);
      }
      cutMixed = !!(ev && ev.band === 'mixed' && goesOn && S && S.team === att && foil && startPos[foil.id]);
    }
    if (kind === 'rest') {
      /* a substitution: the ball does not move */
    } else if (kind === 'goal' || kind === 'conceded') {
      var scorer = kind === 'goal' ? 'you' : 'them';
      var sn = /(?:and|,) ([^ .,]+) scores/.exec(text) || /^(?:GOAL|THEY SCORE)\. ([^ .,]+) /.exec(text);
      var sman = sn ? man(sn[1], scorer) : null;
      /* m3: the real scorer, wherever the text names him (d1 missed "X rises above Y to meet it and scores", "X gets to the ball first and scores") */
      var sm3 = GUARD.scorer ? scorerIn(st, text, scorer) : null;
      if (sm3) sman = sm3;
      var crossed = /cross|across the goal|across the (?:six-yard|5\.5-metre)|across the front of/.test(text);
      /* their goal from a ball your man lost: the man who scores takes it first */
      var hTeam = P.teamOf(st, P.byId(st, pl.cur.holder));
      if (sman && hTeam && hTeam !== scorer && !isKeeperP(st, sman) && GUARD.scorer) {
        if (/loses (?:it|the ball) to|takes it from/.test(text)) pl.win(sman, 'tackle', pl.cur.ball);
        else if (C3 && o && o.id === 'KEEPER_SHORT' && o.to && startPos[o.to.id] && isKeeperP(st, P.byId(st, pl.cur.holder))) {
          /* kmtree5 a3 (helper C): the keeper's short pass cut out: on its way to the defender, 60% of the way (a pass
           * of about 10 m), so the keeper is back in his goal and set when the shot comes and can dive for it */
          var rq9 = startPos[o.to.id], kb9 = pl.cur.ball;
          pl.win(sman, 'interception', clampPt({ x: P.lerp(kb9.x, rq9.x, 0.6), y: P.lerp(kb9.y, rq9.y, 0.6) }));
          if (pl.last()) pl.last().dur = Math.max(pl.last().dur, 0.8);
          if (pl.last()) { var kid9 = pl.cur && keeperOf(st, hTeam); if (kid9 && startPos[kid9.id]) { pl.last().pin = pl.last().pin || {}; pl.last().pin[kid9.id] = { x: 34, y: hTeam === 'you' ? 2.2 : P.L - 2.2 }; } }
        }
        else pl.win(sman, 'interception', clampPt({ x: pl.cur.ball.x + (R() - 0.5) * 6, y: pl.cur.ball.y + dirOf(hTeam) * 5 }));
      }
      if (sman && sman.id !== pl.cur.holder && P.teamOf(st, sman) === scorer && crossed && P.teamOf(st, P.byId(st, pl.cur.holder)) === scorer) {
        var sp0 = startPos[sman.id] || { x: 34, y: scorer === 'you' ? P.L - 8 : 8 };
        var inSix = { x: P.clamp(sp0.x, 26, 42), y: scorer === 'you' ? P.L - 6 : 6 };
        pl.pass(sman, inSix, 'pass', /across the goal/.test(text) ? null : 'cross');
      } else if (who === 'them' && S0.crossTo && pl.cur.holder !== S0.crossTo.id && /cross|header|heads|rises|in the air/.test(text + ' ' + (S0.via || ''))) crossIn(S0.crossTo);
      /* m3: the man who scores takes the shot himself. A team-mate on the
       * ball gives it to him first: a cross for a header ("rises above X to
       * meet it"), a pull-back from the byline, a pass into the box. m2 found
       * goals shot by the wrong man; the celebration follows the shot. */
      if (GUARD.scorer && sman && pl.cur.holder !== sman.id && P.teamOf(st, P.byId(st, pl.cur.holder)) === scorer) {
        var sp1 = startPos[sman.id] || { x: 34, y: scorer === 'you' ? P.L - 10 : 10 };
        var head1 = /rises above|header|heads|to meet it/.test(text);
        var box1 = { x: P.clamp(sp1.x, 22, 46), y: scorer === 'you' ? P.clamp(sp1.y, P.L - 14, P.L - 6) : P.clamp(sp1.y, 6, 14) };
        pl.pass(sman, box1, 'pass', head1 || crossed ? 'cross' : /pulls it back|cuts it back/.test(text) ? 'cut-back' : null);
      }
      var g = goalAt(scorer);
      var kpr = keeperOf(st, other(scorer));
      /* mv1: the shot goes past him on one side, at least 3 m from where
       * he stands (inside the posts), and he dives that way, his hands
       * 0.8 m short of it (s0 put him 2.6 m from the ball on the side AWAY from it:
       * he dived the wrong way in every goal where the ball was in the middle) */
      var ksG = mvOn ? keeperNow(other(scorer)) : keeperSpot(other(scorer));
      /* the ball's line where it passes the keeper (at his distance from
       * the goal line), for a shot from `from` into the goal at x = gx */
      var from0 = { x: pl.cur.ball.x, y: pl.cur.ball.y }, tK = (ksG.y - from0.y) / ((g.y) - from0.y);
      function xAtK(gx) { return from0.x + (gx - from0.x) * tK; }
      var angled = mvOn && tK > 0.05 && tK < 1;
      if (angled) {
        var bestG = g.x, bestD = -1;
        [1, -1].forEach(function (sg0) {
          var cand = g.x, xa = xAtK(cand);
          if ((xa - ksG.x) * sg0 < 2.2) cand = (ksG.x + sg0 * 2.2 - from0.x * (1 - tK)) / tK;
          cand = P.clamp(cand, 30.9, 37.1);
          var dd = (xAtK(cand) - ksG.x) * sg0;
          /* the side the shot was going anyway first, the other side only if that side has no room */
          if (dd > bestD + (sg0 === (xAtK(g.x) >= ksG.x ? 1 : -1) ? -0.8 : 0.8)) { bestD = dd; bestG = cand; }
        });
        g.x = bestG;
      }
      shotTo(g, /rises above|header|heads/.test(text) ? 'header' : 'goal');
      pl.last().note = 'goal';
      /* the keeper dives, and does not get there */
      var xk = angled ? xAtK(g.x) : g.x;
      var dK = Math.abs(xk - ksG.x), sK = xk >= ksG.x ? 1 : -1;
      var kx = mvOn ? (dK > 1.2 ? xk - sK * Math.min(0.8, Math.max(0.2, dK - (A2 ? 1.15 : 1.05))) : ksG.x + sK * 0.5) : g.x + (g.x < 34 ? 2.6 : -2.6);   /* (a2: a dive of at least 1.15 m, so his legs' last centimetres still leave it over a metre) */
      if (m8On() && dK > 1.2) kx = ksG.x + sK * Math.min(Math.abs(kx - ksG.x), 2.8);   /* m8: a dive is at most 2.8 m: a ball far from him beats him by more */
      var pin = {}; pin[kpr.id] = { x: kx, y: mvOn ? ksG.y : scorer === 'you' ? P.L - 1.6 : 1.6 };   /* mv1: he dives across where he stands (s0 sent a keeper who had come out back to his line) */
      pl.last().pin = pin;
      result.kickoff = other(scorer);
    } else if (cutMixed) {
      /* kmtree5 a3 (helper C): a cut-back half won ("passes it, but X touches the ball away"): the pass goes back from the
       * byline toward the penalty spot, the defender gets a touch to it 6 m out, and it runs loose to the man the next
       * decision is about */
      var cbFrom = pl.cur.ball, cbAim = { x: 34, y: upY(att, P.L - 11) }, cbU = Math.min(1, 6 / (P.dist(cbFrom, cbAim) || 1));
      var cbTouch = clampPt({ x: cbFrom.x + (cbAim.x - cbFrom.x) * cbU, y: cbFrom.y + (cbAim.y - cbFrom.y) * cbU });
      var cbPin = {}; cbPin[foil.id] = { x: cbTouch.x + (cbTouch.x < 34 ? -0.8 : 0.8), y: cbTouch.y + dirOf(att) * 0.6 };
      pl.push({ kind: 'pass', team: att, from: pl.cur.holder, to: null, ball: cbTouch, dur: passDur(P.dist(cbFrom, cbTouch)), holder: null, poss: att, note: 'cut-back', pin: cbPin });
      pl.push({ kind: 'clearance', team: def, from: foil.id, to: S.holderId, ball: { x: S.x, y: S.y }, dur: passDur(P.dist(cbTouch, S)), holder: S.holderId, poss: att, note: null });
    } else if (goesOn) {
      resolveOn();
    } else {
      /* kmtree5 a4 (helper P, G's free-kick menu): a free kick floated into the box that ends the attack (headed out,
       * headed clear, caught) is first a cross INTO the box, to where the header is won or lost; then the end */
      if (P4 && o && o.id === 'FK_CROSS' && pl.cur.holder && P.teamOf(st, P.byId(st, pl.cur.holder)) === att) {
        var fkT = o.to || o.shotBy || o.mate || null, fkD = o.foil || null;
        var gyF = att === 'you' ? P.L : 0, inBox = function (q) { return q && q.x > 15 && q.x < 53 && Math.abs(q.y - gyF) < 15.5; };
        var hs = fkT && inBox(startPos[fkT.id]) ? startPos[fkT.id] : fkD && inBox(startPos[fkD.id]) ? startPos[fkD.id] : { x: 34 + (pl.cur.ball.x < 34 ? 4 : -4), y: gyF - dirOf(att) * 9 };
        hs = clampPt({ x: P.clamp(hs.x, 18, 50), y: gyF - dirOf(att) * P.clamp(Math.abs(hs.y - gyF), 5, 14) });
        var pinF = {}; if (fkT) pinF[fkT.id] = { x: hs.x - 0.8, y: hs.y - dirOf(att) * 0.8 }; if (fkD) pinF[fkD.id] = { x: hs.x + 0.8, y: hs.y + dirOf(att) * 0.6 };
        pl.push({ kind: 'pass', team: att, from: pl.cur.holder, to: fkT ? fkT.id : null, ball: hs, dur: passDur(P.dist(pl.cur.ball, hs)) + 0.2, holder: null, poss: att, note: 'cross', pin: pinF });
        var hdo = /([^ .,]+) heads it (?:out of play|clear|away)/.exec(text), hm2 = hdo ? man(hdo[1], def) : null;
        if (hm2) fkHeader = hm2;
      }
      resolveEnd();
    }

    /* ---------- the same play goes on: into the next scene */
    function resolveOn() {
      var sc = S.scene.id, T = S.team, Tdef = other(T);
      beaten = beatenIn(st, text, Tdef);
      var sameTeam = pl.cur.team === T;
      if (sc === 'corner') {
        /* a touch or a block, and the ball goes behind for the corner */
        var gl = { x: S.x < 34 ? 18 + R() * 9 : 41 + R() * 9, y: T === 'them' ? -0.9 : P.L + 0.9 };
        var toGoal = { x: 34 + (R() - 0.5) * 8, y: T === 'them' ? 5 : P.L - 5 };
        if (/pushes the shot out|keeper|round the post/.test(text) && /pushes|saves/.test(text)) {
          if (mvOn) keeperShot(Tdef, 'saved', 0.4, 'post', gl.x >= keeperSpot(Tdef).x ? 1 : -1);
          else shotTo({ x: keeperSpot(Tdef).x, y: keeperSpot(Tdef).y }, 'saved', 0.4);
          var kk = keeperOf(st, Tdef);
          pl.push({ kind: 'save', team: Tdef, from: kk.id, to: null, ball: gl, dur: 0.45, holder: null, poss: T, note: 'parried' });
        } else {
          var blk = actor && P.teamOf(st, actor) === Tdef && !isKeeperP(st, actor) ? actor : pickNear(st, Tdef, toGoal, [0], {});
          var bp = blk ? (startPos[blk.id] || toGoal) : toGoal;
          /* the cross was aimed at the man the last scene named, not at the next corner's target */
          var aimed = S0.crossTo || (S0.scene && S0.scene.roles && S0.scene.roles.target) || S.crossTo || P.byId(st, pl.cur.holder);
          if (aimed && aimed.id === pl.cur.holder) aimed = S.crossTo || aimed;
          if (/cross/.test(text)) pl.pass(aimed, { x: bp.x, y: bp.y }, 'pass', 'cross', { holder: null });
          else shotTo({ x: bp.x, y: bp.y }, 'blocked', 0.35);
          pl.push({ kind: 'clearance', team: Tdef, from: blk ? blk.id : null, to: null, ball: gl, dur: 0.5, holder: null, poss: T, note: 'out for a corner' });
        }
        var tp = {}; tp[S.holderId] = { x: S.x < 34 ? 0.6 : P.W - 0.6, y: T === 'them' ? 2 : P.L - 2 };
        pl.push({ kind: 'out', team: T, from: null, to: S.holderId, ball: { x: S.x, y: S.y }, dur: 0.9, holder: S.holderId, poss: T, note: 'corner', pin: tp });
        return;
      }
      if (sc === 'freekick_them' || sc === 'freekick_cross' || sc === 'freekick_you') {
        /* the foul the text names, where the free kick is */
        var fouled = null;
        var fm = /pulls ([^ .,]+) down/.exec(text) || /trips ([^ .,]+)/.exec(text);
        if (fm) fouled = man(fm[1], T);
        if (!fouled) fouled = P.teamOf(st, P.byId(st, pl.cur.holder)) === T ? P.byId(st, pl.cur.holder) : S.holder;
        if (pl.cur.team !== T) turnover(pl, T, S);
        var fr = /^([^ .,]+) (?:pulls|trips)/.exec(text) || /, and ([^ .,]+) trips/.exec(text);
        var frm = fr ? man(fr[1], Tdef) : null;
        foulAt(pl, S, fouled, R, frm);
        var fl = pl.last();
        if (frm) fl.from = frm.id;
        return;
      }
      var blk8 = m8On() && /([^ .,]+) pushes the shot from [^ .,]+ away/.exec(text), blkM8 = blk8 ? man(blk8[1], Tdef) : null;
      if (blkM8 && pl.cur.team === T && startPos[blkM8.id]) {
        /* m8: a defender blocks the shot and the ball runs loose to the man the text names (m7 drew a keeper's parry) */
        var bq8 = startPos[blkM8.id];
        shotTo({ x: bq8.x, y: bq8.y + dirOf(T) * -0.8 }, 'blocked', 0.35);
        pl.last().holder = null; pl.last().to = blkM8.id;
        pl.push({ kind: 'clearance', team: Tdef, from: blkM8.id, to: S.holderId, ball: { x: S.x, y: S.y }, dur: passDur(P.dist(bq8, S)), holder: S.holderId, poss: T, note: null });
        return;
      }
      if (oc === 'rebound' || (ev && ev.dice && (m8On() ? /saves it, but|pushes (?:the shot|it) (?:out|round)/ : /saves it, but|pushes/).test(text))) {   /* m8: "Cubarsí pushes Álvarez out wide" is not a save (review 1: a cross drawn as a shot and a parry) */
        /* a shot, pushed out, and the man the text names gets there first */
        var kp = keeperOf(st, Tdef), kpos = keeperSpot(Tdef);
        if (mvOn) keeperShot(Tdef, 'saved', 0.45, 'parry');
        else shotTo({ x: kpos.x, y: kpos.y + dirOf(T) * -0.8 }, 'saved', 0.45);
        pl.push({ kind: 'save', team: Tdef, from: kp.id, to: S.holderId, ball: { x: S.x, y: S.y }, dur: 0.5, holder: S.holderId, poss: T, note: 'parried' });
        return;
      }
      if (sc === 'header') {
        var hdr = S.holder;
        if (pl.cur.holder !== hdr.id) {
          var hp = { x: S.x, y: S.y - dirOf(T) * 1.3 };
          if (pl.cur.team !== T) turnover(pl, T, S);
          if (pl.cur.holder !== hdr.id) pl.pass(hdr, hp, 'pass', 'cross');
        }
        pl.push({ kind: 'shot', team: T, from: hdr.id, to: null, ball: { x: S.x, y: S.y }, dur: 0.3, holder: hdr.id, poss: T, note: 'header' });
        return;
      }
      if (!sameTeam) {
        /* the ball changes hands: the man the text names takes it */
        var tk = /([^ .,]+) (?:takes the ball|catches it)/.exec(text);
        var taker = (tk && man(tk[1], T)) || (S.scene.roles && S.scene.roles.taker) || (foil && P.teamOf(st, foil) === T ? foil : null) || nearestTo(st, T, pl.cur.ball, pl.cur.team, {}).p;
        /* kmtree5 a4 (helper P, note 18b): a Slalom lost at a later check: past the men he beat first, then the man who
         * won his check steps into his path and takes it */
        var sl9 = slalomOf();
        if (sl9 && pl.cur.team === att) {
          var dec9 = sl9.filter(function (c) { return c.band === 'bad'; })[0];
          takeOns(sl9.filter(function (c) { return c.band !== 'bad'; }).map(function (c) { return c.man; }), attackPt(att));
          if (dec9 && dec9.man) { taker = dec9.man; meetMan(dec9.man, attackPt(att)); }
        }
        /* m3: where and how is lostWin's, shared with preview.js so the hover arrow ends where the ball is won */
        var lw = lostWin(st, text, o, pl.cur.ball, pl.cur.team, startPos, taker);
        /* kmtree5 a3 (helper C): a through ball their defender gets to first is still played into the space behind him:
         * he wins it there, 6 m goal-side of where he stood */
        if (C3 && thruCard(o) && o.cStage && startPos[o.cStage.past] && lw.kind !== 'save') {
          var dq9 = startPos[o.cStage.past]; lw.kind = 'interception'; lw.ball = clampPt({ x: dq9.x, y: dq9.y + dirOf(att) * 6 });
          var tk9 = P.byId(st, o.cStage.past); if (tk9) taker = tk9;
        }
        if (lw.kind === 'save') {
          if (m8On() && /shoots|hits it|places|lifts|header|heads/.test(text)) {
            /* m8: a shot straight at him: at where he is when it is struck, and he stays there (mv1 aimed it where he started, and the shape moved him 2 m) */
            var kn8 = keeperNow(T); lw.ball = { x: kn8.x, y: kn8.y };
            shotTo({ x: kn8.x, y: kn8.y }, 'saved', 0.45); pl.last().pin = divePin(T, kn8);
          } else if (/shoots|hits it|places|lifts|header|heads/.test(text)) shotTo({ x: keeperSpot(T).x, y: keeperSpot(T).y }, 'saved', 0.45);
          pl.push({ kind: 'save', team: T, from: pl.cur.holder, to: taker.id, ball: lw.ball, dur: 0.35, holder: taker.id, poss: T, note: 'catch' });
          if (pl.cur.ball.z) pl.cur.ball.z = 0;
        } else pl.win(taker, lw.kind, lw.ball, lw.note);
        if (pl.cur.holder !== S.holderId) deliver(pl, S.holder, pt(S.x, S.y));
        else if (P.dist(pl.cur.ball, S) > 0.5) pl.carry(pt(S.x, S.y));
        return;
      }
      /* the same team keeps it: pass, run, cross, as the text says */
      var cur = pl.cur;
      if (sc === 'cross_high' || sc === 'cross_low') {
        if (cur.holder !== S.holderId) deliver(pl, S.holder, pt(S.x + (S.x < 34 ? 2 : -2), S.y + dirOf(T) * -12));
        pl.carry(pt(S.x, S.y), 'dribble');
        return;
      }
      if (S.scene.id === 'their_on_ball' && /only kicks it a few (?:yards|metres)|drops at the edge/.test(text)) {
        var kicker = actor && P.teamOf(st, actor) === Tdef ? actor : pickNear(st, Tdef, cur.ball, [0], {});
        /* kmtree5 a4 (helper P, note 14): the man who kicks it gets to it first (a3 had him kick it from 4 to 6 m away):
         * he steps in and gets a touch on it where it is, then it drops to your man */
        if (P4 && !PBRK.ghost && kicker && cur.holder && cur.holder !== kicker.id) {
          var kq0 = startPos[kicker.id];
          if (!kq0 || P.dist(kq0, cur.ball) > 2) pl.win(kicker, 'tackle', clampPt({ x: cur.ball.x, y: cur.ball.y }), 'header');
        }
        pl.push({ kind: 'clearance', team: Tdef, from: kicker ? kicker.id : null, to: S.holderId, ball: { x: S.x, y: S.y }, dur: passDur(P.dist(pl.cur.ball, S)), holder: S.holderId, poss: T, note: 'header' });
        return;
      }
      if (/wins the header above ([^ .,]+), heads it down to/.test(text) && cur.holder !== S.holderId) {
        var hm = /([^ .,]+) wins the header above/.exec(text), hman = hm ? man(hm[1], T) : null;
        if (hman && hman.id !== cur.holder) {
          var hpt = startPos[hman.id] || S;
          pl.pass(hman, hpt, 'pass', 'long ball');
        }
        pl.pass(S.holder, pt(S.x, S.y), 'pass', 'header');
        return;
      }
      if (cur.holder === S.holderId && slalomOf()) {
        /* kmtree5 a4 (helper P, note 18b): Slalom is drawn as what it is: a take-on past each man he beat, in turn */
        var won9 = slalomOf().filter(function (c) { return c.band !== 'bad'; }).map(function (c) { return c.man; });
        takeOns(won9, S);
        if (P.dist(pl.cur.ball, S) > 0.6) pl.carry(pt(S.x, S.y), 'carry');   /* (then onto the spot the next decision is read from: after a half win that is a step back) */
        return;
      }
      if (cur.holder === S.holderId) {
        var past = beaten[0] || null;
        var d = P.dist(cur.ball, S);
        if (past && startPos[past.id] && P4 && !PBRK.dribble && d > 6) {
          /* kmtree5 a4 (helper P, note 8a): he steps into his path, and is gone past (the take-on, as Slalom's) */
          takeOns([past], S);
          if (P.dist(pl.cur.ball, S) > 0.6) pl.carry(pt(S.x, S.y), 'carry');
        } else if (past && startPos[past.id]) {
          /* past him: the run goes round the man, who stays where he was */
          var fq = startPos[past.id];
          var b = pl.carry(pt(S.x, S.y), 'dribble', 'past', past);
          b.pin[past.id] = { x: fq.x, y: fq.y };
        } else pl.carry(pt(S.x, S.y), d > 5 ? 'dribble' : 'carry');
        return;
      }
      var note = /cuts it back/.test(text) ? 'cut-back' : /long pass|long ball/.test(text) ? 'long ball' : /passes it back|plays it back/.test(text) ? 'back pass'
        : /through|plays it past|passes it past|puts [^ ]+ through/.test(text) ? 'through ball' : /one-two|first time/.test(text) ? 'one-two' : S.air ? 'in the air' : null;
      if (sc === 'alone' && !note) note = 'through ball';
      if (C3 && thruCard(o)) note = 'through ball';   /* kmtree5 a3 (helper C): the through ball, into the space behind */
      if (m8On() && /crosses it|pulls it back across/.test(text) && (!note || note === 'in the air')) note = 'cross';   /* m8: the words say a cross: draw a cross */
      /* kmtree5 a4 (helper P, c_check C3): a short free kick goes to the man where the free kick's picture stood him; if the
       * next decision starts elsewhere (a long shot's spot), he then runs with it there */
      var fsp9 = P4 && !PBRK.fkafter && o && o.id === 'FK_SHORT' && P.afterSpot ? P.afterSpot(st, o.id) : null;
      if (fsp9 && fsp9.index === p.index && P.dist(fsp9, S) > 2) { pl.pass(S.holder, pt(fsp9.x, fsp9.y), 'pass', 'free kick'); pl.carry(pt(S.x, S.y), 'carry'); return; }
      /* kmtree5 a5 (helper R) P2: a through ball whose attack goes on from where it was (a half win a piece turns into "it
       * breaks loose and your team is first to it") is still played into the space behind the defender first, then the
       * ball comes back to where the next decision is read from (claimscheck card.through2 drew it going back) */
      if (C3 && o && o.id === 'Z_THROUGH' && thruCard(o) && o.cStage.past && startPos[o.cStage.past] && (S.y - cur.ball.y) * dirOf(T) <= 0) {
        var dq5 = startPos[o.cStage.past], rn5 = P.byId(st, o.cStage.through);
        if (rn5) {
          pl.pass(rn5, clampPt({ x: (cur.ball.x + dq5.x) / 2, y: cur.ball.y + dirOf(T) * 12 }), 'pass', 'through ball');   /* (12 m on: it is still in midfield) */
          if (rn5.id !== S.holderId) pl.pass(S.holder, pt(S.x, S.y), 'pass', null); else if (P.dist(pl.cur.ball, S) > 0.6) pl.carry(pt(S.x, S.y), 'carry');
          return;
        }
      }
      /* kmtree5 a6 (helper W) part 2b, THE SECOND MAN: the words pass the ball through a man who is not on it ("Fabián
       * gives it to Yamal. Yamal holds it while Porro runs round the outside of Theo" ... "Porro takes the pass from
       * Yamal"): the ball goes to him first, where he stands, and he plays it on (a5 drew one long ball from Fabián
       * to Porro, 7.6 s at his 27th minute) */
      if (W6.via) {
        var vm6 = /takes the pass from ([^ .,]+)/.exec(text), vman6 = vm6 ? man(vm6[1], T) : null, vq6 = vman6 && startPos[vman6.id];
        if (vq6 && vman6.id !== cur.holder && vman6.id !== S.holderId && !isKeeperP(st, vman6) && P.dist(vq6, cur.ball) > 4) {
          var vb6 = pl.pass(vman6, clampPt({ x: vq6.x, y: vq6.y + dirOf(T) * P.BALL_OFF }), 'pass', null); vb6.ww = 'via';
          /* (the runner sets off when the first pass is played: when it arrives he is as far along his run as his legs
           * take him in that time, so the plan does not have him start only then) */
          var rq6 = startPos[S.holderId], rd6 = rq6 ? P.dist(rq6, S) : 0;
          if (rq6 && rd6 > 4) { var rv6 = start.vel && start.vel[S.holderId], go6 = Math.min(rd6 - 2, legReach(vb6.dur) * 0.85 + (rv6 ? Math.max(0, (rv6.x * (S.x - rq6.x) + rv6.y * (S.y - rq6.y)) / rd6) * 0.4 : 0)); vb6.pin = {}; vb6.pin[S.holderId] = { x: rq6.x + (S.x - rq6.x) / rd6 * go6, y: rq6.y + (S.y - rq6.y) / rd6 * go6 }; }
          if (note === 'long ball') note = null;
        }
      }
      pl.pass(S.holder, pt(S.x, S.y), 'pass', note);
    }

    /* ---------- the play stops, or changes sides for good */
    function resolveEnd() {
      var cur = pl.cur, curMan = P.byId(st, cur.holder), T = cur.team, D = other(T);
      /* who the text says did it */
      var n1 = /^([^ .,]+) /.exec(text), subj = n1 ? P.byFirst(st, n1[1], null) : null;
      var youMan = actor && P.teamOf(st, actor) === 'you' ? actor : null;
      switch (oc) {
        case 'throw': {
          /* over the touchline, where the text says; the throw-in to the team it names */
          var far = /well away from goal/.test(text) ? dirOf(T) * (30 + R() * 12) : 0;
          var at = touchPt(cur.ball, R, far);
          if (/pushes [^ ]+ out to the touchline/.test(text)) {
            var runTo = { x: at.x < 0 ? 1.2 : P.W - 1.2, y: cur.ball.y + dirOf(T) * -3 };
            pl.carry(runTo, 'carry');
            at = { x: at.x, y: runTo.y };
          }
          var thr = /their throw-in/.test(text) ? 'them' : /your throw-in/.test(text) ? 'you' : /The pass goes out/.test(text) ? D : (who === 'them' ? 'you' : 'them');
          var kickBy = /kicks it out|kicks it clear|kick it clear|takes the short pass and kicks it out/.test(text) && subj ? subj : null;
          if (fkHeader) kickBy = fkHeader;   /* (kmtree5 a4: the header away, from where the cross came down) */
          if (kickBy && kickBy.id !== cur.holder && !fkHeader) {
            var kq = startPos[kickBy.id] || cur.ball;
            if (P.teamOf(st, kickBy) === T) pl.pass(kickBy, kq, 'pass');
            else pl.win(kickBy, /gets to the pass first|gets to the ball first/.test(text) ? 'interception' : 'tackle', kq);
          }
          pl.push({ kind: kickBy ? 'clearance' : 'pass', team: fkHeader ? def : pl.cur.team, from: fkHeader ? fkHeader.id : pl.cur.holder, to: null, ball: at, dur: passDur(P.dist(pl.cur.ball, at)), holder: null, poss: pl.cur.team, note: fkHeader ? 'header' : null });
          stopFor('throw-in', thr, at);
          return;
        }
        case 'byline': case 'wide': {
          /* over the goal line, wide of the posts (or over the bar): a goal kick */
          var shootT = who === 'you' ? 'you' : 'them', gkT = other(shootT);
          var gy = shootT === 'you' ? P.L + 0.9 : -0.9;
          var gx = 34 + (R() < 0.5 ? -1 : 1) * (5.5 + R() * 7);
          if (/over the bar|clears the bar|heads it over/.test(text)) gx = 34 + (R() - 0.5) * 6;
          if (/makes [^ ]+ go wide/.test(text)) {
            var wideAt = { x: cur.ball.x < 34 ? 12 : 56, y: shootT === 'you' ? P.L - 4 : 4 };
            pl.carry(wideAt, 'carry');
            gx = wideAt.x + (wideAt.x < 34 ? -3 : 3);
          }
          var sh = shooter;
          var wm = /([^ .,]+) (?:heads it over|who heads it over|who cannot head it cleanly|gets his head to|still gets a shot away|shoots)/.exec(text);   /* txt2: + 'who cannot head it cleanly' (BOX_MARK's half-won header, was 'who heads it over. The ball goes wide') */
          if (!sh && wm) sh = man(wm[1], shootT);
          if (/who heads it over|heads it over|who cannot head it cleanly|gets his head to/.test(text) && sh && sh.id !== pl.cur.holder && P.teamOf(st, P.byId(st, pl.cur.holder)) === shootT) {
            var hp2 = startPos[sh.id] || { x: 34, y: shootT === 'you' ? P.L - 9 : 9 };
            if (A2) hp2 = { x: P.clamp(hp2.x, 22, 46), y: shootT === 'you' ? P.clamp(hp2.y, P.L - 14, P.L - 6) : P.clamp(hp2.y, 6, 14) };   /* a2: the header is in the box (he runs there; the cross waits for him) */
            pl.pass(sh, hp2, 'pass', 'cross');
          } else if (/kicks it long/.test(text) && sh) {
            var mid = startPos[sh.id] || { x: 34, y: 55 };
            pl.push({ kind: 'clearance', team: gkT, from: pl.cur.holder, to: sh.id, ball: mid, dur: passDur(P.dist(pl.cur.ball, mid)), holder: sh.id, poss: shootT, note: 'long ball' });
          }
          var over = /over the bar|clears the bar|heads it over/.test(text);
          var wb = { x: gx, y: gy, z: over ? 1.2 : 0 };
          pl.push({ kind: 'shot', team: shootT, from: pl.cur.holder, to: null, ball: wb, dur: passDur(P.dist(pl.cur.ball, wb)) * 0.7, holder: null, poss: gkT,
            note: over ? 'over the bar' : /header|heads|head/.test(text) ? 'header' : /makes [^ ]+ go wide|out of play/.test(text) ? null : 'wide', head: /header|heads|head/.test(text) });
          goalKick(gkT, gx);
          return;
        }
        case 'wall': {
          var wT = T, gw = P.goalOf(wT), dw = P.dist(cur.ball, gw) || 1;
          var wp = { x: cur.ball.x + (gw.x - cur.ball.x) / dw * 9.15, y: cur.ball.y + (gw.y - cur.ball.y) / dw * 9.15 };
          var wallMan = pickNear(st, other(wT), wp, null, {});
          shotTo(wp, 'blocked', 0.35);
          pl.last().holder = wallMan ? wallMan.id : null; pl.last().to = wallMan ? wallMan.id : null; pl.last().poss = other(wT);
          var cl = clampPt({ x: 34 + (R() - 0.5) * 30, y: upY(other(wT), 45 + R() * 10) });
          pl.push({ kind: 'clearance', team: other(wT), from: wallMan ? wallMan.id : null, to: null, ball: cl, dur: passDur(P.dist(wp, cl)), holder: null, poss: other(wT), note: null });
          var pick = nearestTo(st, other(wT), cl, other(wT), {});
          if (pick) { pl.last().to = pick.p.id; pl.last().holder = pick.p.id; }
          return;
        }
        case 'foul': {
          /* a foul where the ball is: a free kick to the side fouled */
          var fouledT = who === 'them' ? 'them' : 'you', fT = other(fouledT);
          var fm2 = /([^ .,]+) pulls ([^ .,]+) down/.exec(text) || /([^ .,]+) catches ([^ .,]+) late/.exec(text) || /([^ .,]+) trips ([^ .,]+)/.exec(text);
          var fouler = fm2 ? man(fm2[1], fT) : youMan, vict = fm2 ? man(fm2[2], fouledT) : curMan;
          if (vict && vict.id !== pl.cur.holder && P.teamOf(st, vict) === fouledT) pl.pass(vict, startPos[vict.id] || cur.ball, 'pass');
          /* kmtree5 a4 (helper P, note 11): the foul is seen: the man fouled holds the ball for a moment while the fouler
           * comes in from the goal side, at the ball when the whistle goes */
          if (P4 && !PBRK.foul && fouler && vict && pl.cur.holder === vict.id) {
            var dgF = dirOf(fouledT), cF = pl.cur.ball, stepF = clampPt({ x: cF.x, y: cF.y + dgF * 0.8 });
            var cbF = pl.carry(stepF, 'dribble'); cbF.dur = Math.max(cbF.dur, 0.8);
            cbF.pin = cbF.pin || {}; cbF.pin[fouler.id] = clampPt({ x: stepF.x + (stepF.x < 34 ? 0.4 : -0.4), y: stepF.y + dgF * 0.3 }); cbF.fouler = fouler.id;
          }
          pl.push({ kind: 'foul', team: fT, from: fouler ? fouler.id : null, to: vict ? vict.id : null, ball: { x: pl.cur.ball.x, y: pl.cur.ball.y }, dur: 0.8, holder: vict ? vict.id : pl.cur.holder, poss: fouledT, note: 'free kick' });
          result.restart = { type: 'free kick', team: fouledT };
          return;
        }
        case 'offside': {
          var om = /([^ .,]+) is offside when ([^ .,]+) passes to him/.exec(text);
          var runner = om ? man(om[1], 'them') : null, passer = om ? man(om[2], 'them') : null;
          if (passer && passer.id !== pl.cur.holder && pl.cur.team === 'them') pl.pass(passer, startPos[passer.id] || cur.ball, 'pass');
          var rp = runner ? (startPos[runner.id] || cur.ball) : { x: cur.ball.x, y: cur.ball.y - 15 };
          if (runner) pl.pass(runner, { x: rp.x, y: rp.y - 3 }, 'pass', 'through ball');
          var yk = youMan || pickNear(st, 'you', pl.cur.ball, [0], {});
          pl.push({ kind: 'foul', team: 'them', from: runner ? runner.id : pl.cur.holder, to: null, ball: { x: pl.cur.ball.x, y: pl.cur.ball.y }, dur: 0.8,
            holder: yk ? yk.id : null, poss: 'you', note: 'offside' });
          var op = {}; if (yk) op[yk.id] = { x: pl.cur.ball.x, y: pl.cur.ball.y - 1.2 };
          pl.last().pin = op;
          result.restart = { type: 'free kick', team: 'you' };
          return;
        }
        case 'catch': case 'save': {
          /* on target, and the keeper has it; he may throw it straight out */
          var keepT = who === 'you' ? 'them' : 'you', kk2 = keeperOf(st, keepT), ks = keeperSpot(keepT);
          var saveAt = { x: ks.x + (R() - 0.5) * 2, y: ks.y + dirOf(keepT) * 0.8 };
          if (mvOn && !(/cross/.test(text) && who === 'them') && pl.cur.holder !== kk2.id) saveAt = diveSpot(keepT, 'catch');
          if (/cross/.test(text) && who === 'them') {
            var tgt2 = S0.crossTo || foil;
            if (tgt2 && tgt2.id !== pl.cur.holder) pl.pass(tgt2, { x: saveAt.x + (R() - 0.5) * 3, y: saveAt.y + dirOf(keepT) * 3 }, 'pass', 'cross', { holder: null });
            else shotTo(saveAt, 'cross');
          } else if (pl.cur.holder !== kk2.id) { shotTo(saveAt, /head/.test(text) ? 'header' : 'saved'); if (mvOn) pl.last().pin = divePin(keepT, saveAt); }
          pl.push({ kind: 'save', team: keepT, from: pl.cur.holder || (pl.last() && pl.last().from) || null, to: kk2.id, ball: saveAt, dur: 0.35, holder: kk2.id, poss: keepT, note: 'catch' });
          if (/throws it/.test(text)) {
            var tm = /throws it (?:out quickly|to) ?([^ .,]+)?/.exec(text);
            var rcv = (tm && tm[1] && man(tm[1], keepT)) || pickNear(st, keepT, { x: 34 + (R() - 0.5) * 30, y: upY(keepT, 42) }, [1], {});
            if (rcv) pl.pass(rcv, clampPt({ x: 34 + (R() - 0.5) * 34, y: upY(keepT, 38 + R() * 8) }), 'pass', 'keeper throw');
          }
          return;
        }
        case 'tokeeper': {
          /* the pass is too long and runs through to their keeper */
          var kt = who === 'you' ? 'them' : 'you', kk3 = keeperOf(st, kt), ks3 = keeperSpot(kt);
          var rcv2 = o && o.to && P.onPitch(st, o.to) ? o.to : null;
          var at3 = { x: ks3.x, y: ks3.y + dirOf(kt) * 1.5 };
          pl.push({ kind: 'pass', team: T, from: pl.cur.holder, to: rcv2 ? rcv2.id : null, ball: at3, dur: passDur(P.dist(cur.ball, at3)), holder: null, poss: T, note: /head/.test(text) ? 'header' : null });
          pl.push({ kind: 'save', team: kt, from: null, to: kk3.id, ball: { x: at3.x, y: at3.y - dirOf(kt) * 0.4 }, dur: 0.4, holder: kk3.id, poss: kt, note: 'collects' });
          return;
        }
        case 'clear': {
          /* headed or kicked away, as far as the text says */
          var clT = who === 'them' ? 'you' : 'them';
          var clr = youMan && clT === 'you' ? youMan : (subj && P.teamOf(st, subj) === clT ? subj : pickNear(st, clT, cur.ball, [0], {}));
          if (clr && isKeeperP(st, clr) && /cross/.test(text) && who === 'them') {
            var t3 = S0.crossTo || foil;
            var kq3 = keeperSpot(clT);
            if (t3 && t3.id !== pl.cur.holder) pl.pass(t3, { x: kq3.x, y: kq3.y + dirOf(clT) * 3 }, 'pass', 'cross', { holder: null });
          } else if (/cross/.test(text) && who === 'them' && S0.crossTo && pl.cur.holder !== S0.crossTo.id) {
            var cq = clr ? (startPos[clr.id] || cur.ball) : cur.ball;
            pl.pass(S0.crossTo, cq, 'pass', 'cross', { holder: null });
          }
          var toY = /as far as their midfield/.test(text) ? upY(clT, 52 + R() * 8) : /outside your box/.test(text) ? upY(clT, 22 + R() * 6) : upY(clT, 40 + R() * 16);
          var landC = clampPt({ x: P.clamp(pl.cur.ball.x + (R() - 0.5) * 30, 8, 60), y: toY });
          var getT = /Their players have to start again|their players kick it clear/.test(text) ? (who === 'them' ? 'them' : 'them') : /lands outside your box/.test(text) ? (R() < 0.5 ? 'you' : 'them') : clT;
          var getter = nearestTo(st, getT, landC, getT, {});
          pl.push({ kind: 'clearance', team: clT, from: clr ? clr.id : pl.cur.holder, to: getter ? getter.p.id : null, ball: landC, dur: passDur(P.dist(pl.cur.ball, landC)),
            holder: getter ? getter.p.id : null, poss: getT, note: /heads|head|header/.test(text) ? 'header' : null });
          return;
        }
        case 'theyback': {
          var bk = pickNear(st, 'them', { x: 34 + (R() - 0.5) * 24, y: upY('them', 22 + R() * 10) }, [0], {});
          if (bk && pl.cur.team === 'them') pl.pass(bk, clampPt({ x: 34 + (R() - 0.5) * 24, y: upY('them', 22 + R() * 10) }), 'pass', 'back pass');
          return;
        }
        case 'corner_flag': {
          var flag = { x: cur.ball.x < 34 ? 3 : P.W - 3, y: P.L - 3 };
          pl.carry(flag, 'carry');
          return;
        }
        case 'block': {
          var bT = who === 'you' ? 'them' : 'you';
          var bl = actor && P.teamOf(st, actor) === bT ? actor : (foil && P.teamOf(st, foil) === bT ? foil : pickNear(st, bT, cur.ball, [0], {}));
          var bq = bl ? (startPos[bl.id] || cur.ball) : cur.ball;
          shotTo({ x: bq.x, y: bq.y }, 'blocked', 0.35);
          pl.last().holder = bl ? bl.id : null; pl.last().to = bl ? bl.id : null; pl.last().poss = bT;
          return;
        }
        default: {
          /* kmtree5 a5 P1 (helper D, BRIEF-a5.md): A DECLARED BRANCH FOR TWO OF P1'S RESULTS ONLY (?a5def=on; the cards
           * D_STEP and D_Hout exist only then). Step in's half result: he gets a foot to the pass, and the ball runs
           * back to one of their defenders (their attack over; the default below would draw your man winning it).
           * KM_PBREAK / ?pbreak=a5 draws the default instead (d_shots' result pictures show the difference). */
          if (who === 'them' && o && o.id === 'D_STEP' && kind === 'nothing' && !PBRK.a5) {
            var a5m = youMan || actor, a5q = a5m && startPos[a5m.id] ? startPos[a5m.id] : cur.ball;
            var a5to = clampPt({ x: 34 + (R() - 0.5) * 24, y: upY('them', 24 + R() * 10) });
            var a5bk = pickNear(st, 'them', a5to, [0], {});
            if (a5bk) {
              var a5pin = {}; if (a5m) a5pin[a5m.id] = { x: P.lerp(cur.ball.x, a5q.x, 0.5), y: P.lerp(cur.ball.y, a5q.y, 0.5) };
              pl.pass(a5bk, a5to, 'pass', 'deflected', { pin: a5pin, poss: 'them' });
              return;
            }
          }
          if (who === 'them') {
            if (kind === 'stopped' || kind === 'escaped' || kind === 'nothing') {
              var wn = youMan || nearestTo(st, 'you', cur.ball, 'them', {}).p;
              if (isKeeperP(st, wn)) {
                var kq4 = keeperSpot('you');
                pl.push({ kind: 'save', team: 'you', from: pl.cur.holder, to: wn.id, ball: { x: kq4.x, y: kq4.y + 0.8 }, dur: 0.55, holder: wn.id, poss: 'you', note: 'catch' });
              } else if (/steps into the path|gets to the pass first|reads|cuts out|in front of/.test(text)) pl.win(wn, 'interception');
              else pl.win(wn, 'tackle', cur.ball);
              var thr2 = /throws it to ([^ .,]+)/.exec(text);
              if (thr2) { var r2 = man(thr2[1], 'you'); if (r2) pl.pass(r2, startPos[r2.id] || { x: 34, y: 35 }, 'pass', 'keeper throw'); }
            }
          } else {
            /* your attack: kept (a short pass, or across), or it runs out */
            var kept = /keeps the ball|keeps it|your team keeps|starts again/.test(text);
            if (kept) {
              var rm = /(?:to|across to|back to|short to|out to) ([^ .,]+)/.exec(text), rc = rm ? man(rm[1], 'you') : null;
              if (rc && rc.id !== pl.cur.holder) pl.pass(rc, clampPt(startPos[rc.id] || { x: cur.ball.x + 10, y: cur.ball.y - 5 }), 'pass', /back to/.test(text) ? 'back pass' : null);
              else pl.carry(clampPt({ x: cur.ball.x + (cur.ball.x < 34 ? 8 : -8), y: cur.ball.y - 3 }), 'carry');
            } else {
              var tk2 = foil && P.teamOf(st, foil) === 'them' && !isKeeperP(st, foil) ? foil : nearestTo(st, 'them', cur.ball, 'you', {}).p;
              pl.win(tk2, o && (o.to || o.receiver) ? 'interception' : 'tackle');
            }
          }
        }
      }
    }

    if (goesOn) {
      var bmen = beaten.filter(function (q) { return P.teamOf(st, q) !== S.team; });
      var base = P.shapeAll(st, { x: S.x, y: S.y }, S.team);
      if (P.MOVE && P.MOVE.on) base = reachLimit(st, base, startPos, Math.max(0.3, pl.time()), null, S, S.team);   /* mv1: the next moment's picture: a looser limit (7 m/s), so the shape the decision is read from is still there */
      endPos = P.freeze(st, S, base, { beaten: bmen[0] || null });
      var cardMenR = A2 ? cardStage(st, nx, S, endPos, startPos, Math.max(0.3, pl.time())) : [];
      endBall = { x: S.x, y: S.y, z: S.air ? (S.scene.id === 'over_top' ? 1.0 : 0.6) : 0 };
      /* the man gone past stays behind in every picture of the result */
      if (bmen[0]) {
        var bp0 = endPos[bmen[0].id];
        pl.beats.forEach(function (b, i) { if (i === pl.beats.length - 1) return; b.pin = b.pin || {}; if (!b.pin[bmen[0].id]) b.pin[bmen[0].id] = { x: P.lerp((startPos[bmen[0].id] || bp0).x, bp0.x, 0.5), y: P.lerp((startPos[bmen[0].id] || bp0).y, bp0.y, 0.5) }; });
      }
    }
    /* m4: a free kick from a foul in the result: the man who takes it (the
     * next decision's man on the ball) is at the ball when the whistle goes.
     * He runs in support over the beats before the foul (m3 had him walk up
     * from 9 to 14 m away during the stoppage, while the wall formed). When
     * the man fouled takes it himself he is on the ball already. */
    var lbf = pl.beats[pl.beats.length - 1], tkr = goesOn && S.holderId;
    if (GUARD.taker && endPos && tkr && endPos[tkr] && lbf && lbf.kind === 'foul' && lbf.note === 'free kick' && lbf.to !== tkr && pl.beats.length > 1) {
      var tq0 = startPos[tkr] || endPos[tkr], tq1 = endPos[tkr], nbf = pl.beats.length - 1;
      pl.beats.forEach(function (b, i) {
        if (i >= nbf || (b.from === tkr && (b.kind === 'carry' || b.kind === 'dribble'))) return;   // (a man running with the ball stays on it)
        b.pin = b.pin || {};
        if (!b.pin[tkr]) { var f = (i + 1) / nbf; b.pin[tkr] = { x: P.lerp(tq0.x, tq1.x, f), y: P.lerp(tq0.y, tq1.y, f) }; }
      });
    }
    /* m8: A DEFENDER THE TEXT NAMES AS LATE ("gets back too late", "cannot
     * get back to", "is too late to block it") runs toward the man on the
     * ball: at the shot (or the end) he is as far toward him as 7.5 m/s allows,
     * never closer than 2 m. mv1 left him standing 20 m away. */
    if (m8On()) {
      var LATE = /([^ .,]+) (?:gets back too late|cannot get back to|is too late to block it|gets there too late|is too late|is a step behind|is too slow)/g, lm;
      var used = {}; pl.beats.forEach(function (b) { [b.from, b.to, b.past].forEach(function (x) { if (x) used[x] = 1; }); if (b.pin) for (var k2 in b.pin) used[k2] = 1; });
      beaten.forEach(function (q) { used[q.id] = 1; });
      var bi8 = -1; pl.beats.forEach(function (b, i) { if (bi8 < 0 && b.kind === 'shot') bi8 = i; });
      if (bi8 < 0) bi8 = pl.beats.length - 1;
      while (bi8 >= 0 && (lm = LATE.exec(text))) {
        var lman = P.byFirst(st, lm[1], null);
        if (!lman || isKeeperP(st, lman) || used[lman.id] || !startPos[lman.id]) continue;
        var tb = pl.beats[bi8], at8 = bi8 > 0 ? pl.beats[bi8 - 1].ball : start.ball, sp8 = startPos[lman.id], T8 = 0;
        for (var j8 = 0; j8 <= bi8; j8++) T8 += pl.beats[j8].dur;
        var d8 = P.dist(sp8, at8), mv8 = Math.min(Math.max(0, d8 - 2), 7.5 * T8);   /* (a2: the plan's place; his legs get him as far toward it as they can: see track, lateRun) */
        if (mv8 < 0.5) continue;
        var q8 = { x: sp8.x + (at8.x - sp8.x) / d8 * mv8, y: sp8.y + (at8.y - sp8.y) / d8 * mv8 };
        tb.pin = tb.pin || {}; tb.pin[lman.id] = q8; used[lman.id] = 1;
        if (bi8 === pl.beats.length - 1 && endPos && endPos[lman.id]) endPos[lman.id] = q8;
        seg8late.push(lman.id);
      }
    }
    /* a2 (review of the movement, item 4): A KEEPER THE CARD SENDS OUT OF HIS GOAL comes out: through every beat he
     * runs toward where the ball is at its end (a stride short of it; for a shot, where it is struck: he came out and
     * is beaten), as far as his legs take him, and he is still out
     * there in the picture the play goes on from (a1 and a2 drew a 1 m step) */
    if (A2 && !BRK.nokeeperout && o && (o.id === 'KEEPER_SWEEPS' || /(?:runs|comes|rushes) out of his goal|leaves his goal/.test(String(o.label || '') + ' ' + String(o.read || '')))) {
      var kOut = isKeeperP(st, o.actor) ? o.actor : keeperOf(st, P.teamOf(st, o.actor) || def);
      var k0 = kOut && startPos[kOut.id];
      /* (when the next thing is the shot that beats him, the man on the ball first runs on toward goal for a second,
       * while the keeper comes out to meet him) */
      var b00 = pl.beats[0], hq0 = start.holder && P.byId(st, start.holder);
      if (k0 && b00 && b00.kind === 'shot' && hq0 && !isKeeperP(st, hq0) && b00.from === start.holder) {
        var tmA = P.teamOf(st, hq0), ap = attackPt(tmA), ux0 = ap.x - start.ball.x, uy0 = ap.y - start.ball.y, ud0 = Math.sqrt(ux0 * ux0 + uy0 * uy0) || 1, run0 = Math.min(7.5, Math.max(0, ud0 - 9));
        if (run0 > 2) pl.beats.unshift({ kind: 'carry', team: tmA, from: start.holder, to: start.holder, ball: clampPt({ x: start.ball.x + ux0 / ud0 * run0, y: start.ball.y + uy0 / ud0 * run0 }), dur: 1.6, holder: start.holder, poss: tmA, note: null });
      }
      /* a3 (lead, V9 misses: the result was one long carry, or the keeper's own clearance from where the ball was, and
       * he ran toward where that beat ends): he comes out TO THE BALL. The first time his legs can meet it (a stride
       * short) is found along the ball's path; a carry is split there (he stays where he met the man, who goes on past
       * him), and before his own clearance the man on the ball runs on toward goal until they meet. */
      var kMeet = null;
      if (k0 && b00 && b00.kind !== 'shot' && b00.kind !== 'out' && b00.kind !== 'foul') {
        var mA = start.ball, mCarry = (b00.kind === 'dribble' || b00.kind === 'carry') && b00.from !== kOut.id, mOwn = b00.from === kOut.id && hq0 && !isKeeperP(st, hq0) && P.teamOf(st, hq0) !== P.teamOf(st, kOut);
        var mB = null, mDur = b00.dur;
        if (mCarry) mB = b00.ball;
        else if (mOwn) { var tmM = P.teamOf(st, hq0), apM = attackPt(tmM), uxM = apM.x - mA.x, uyM = apM.y - mA.y, udM = Math.sqrt(uxM * uxM + uyM * uyM) || 1, runM = Math.max(0, udM - 6); mDur = runM / 6.5; mB = { x: mA.x + uxM / udM * runM, y: mA.y + uyM / udM * runM }; }
        if (mB && mDur > 0.4 && P.dist(k0, mA) > 3) for (var tM = 0.2; tM <= mDur + 1e-6; tM += 0.1) {
          var fM = tM / mDur, qM = { x: mA.x + (mB.x - mA.x) * fM, y: mA.y + (mB.y - mA.y) * fM };
          if (P.dist(k0, qM) - 1.2 <= legReach(tM) * 0.9) { kMeet = { t: tM, ball: clampPt(qM) }; break; }
        }
        if (kMeet && mCarry && kMeet.t < b00.dur - 0.3) {
          var bM1 = {}; for (var kyM in b00) bM1[kyM] = b00[kyM];
          bM1.ball = kMeet.ball; bM1.dur = kMeet.t; bM1.past = null; b00.dur = b00.dur - kMeet.t; b00.kMet = kOut.id;
          pl.beats.unshift(bM1);
        } else if (kMeet && mOwn && kMeet.t > 0.4) {
          pl.beats.unshift({ kind: 'carry', team: P.teamOf(st, hq0), from: start.holder, to: start.holder, ball: kMeet.ball, dur: kMeet.t, holder: start.holder, poss: P.teamOf(st, hq0), note: null });
        } else kMeet = null;
      }
      if (k0) {
        var tK9 = 0, prevK = k0;
        pl.beats.forEach(function (b) {
          tK9 += b.dur;
          if (b.kind === 'out' || b.kind === 'foul' || (b.from === kOut.id && b.kind === 'save')) return;
          if (b.kMet || (kMeet && b.from === kOut.id && prevK !== k0)) { b.pin = b.pin || {}; b.pin[kOut.id] = prevK; return; }   /* (a3: after meeting the ball he stays there: beaten by the man, or clearing it from there) */
          var bb = b.kind === 'shot' ? (b === pl.beats[0] ? start.ball : pl.beats[pl.beats.indexOf(b) - 1].ball) : b.ball, dx = bb.x - k0.x, dy = bb.y - k0.y, dd = Math.sqrt(dx * dx + dy * dy), go = Math.min(Math.max(0, dd - 1.5), legReach(tK9) * 0.9);
          if (go < 1) return;
          var outK = prevK;
          prevK = { x: k0.x + dx / dd * go, y: k0.y + dy / dd * go };
          if (b.kind === 'shot' && outK !== k0) prevK = outK;   /* (once the shot is struck he stops coming out) */
          if (b.kind === 'shot' && kMeet && (prevK.y - bb.y) * (b.ball.y - bb.y) <= 0) {   /* (a3: the man he came out to went past him and shoots from behind him: he turns and runs back toward his goal, as far as his legs take him) */
            var rbx = b.ball.x - prevK.x, rby = b.ball.y - prevK.y, rbd = Math.sqrt(rbx * rbx + rby * rby) || 1, rgo = Math.min(Math.max(0, rbd - 1), legReach(b.dur) * 0.9);
            prevK = { x: prevK.x + rbx / rbd * rgo, y: prevK.y + rby / rbd * rgo };
          } else if (b.kind === 'shot' && Math.abs(b.ball.y - bb.y) > 1e-6) {   /* (and at the shot he dives across, toward where it passes him) */
            var lx = bb.x + (b.ball.x - bb.x) * (prevK.y - bb.y) / (b.ball.y - bb.y), dl = lx - prevK.x;
            if (Math.abs(dl) > 0.6) prevK = { x: prevK.x + (dl > 0 ? 1 : -1) * Math.min(Math.abs(dl) - 0.5, 2.0), y: prevK.y };
          }
          b.pin = b.pin || {}; b.pin[kOut.id] = prevK;
        });
        if (endPos && endPos[kOut.id] && prevK !== k0) endPos[kOut.id] = { x: prevK.x, y: prevK.y };
      }
    }
    /* kmtree5 a4 (helper P): a through ball their defender gets to first is won where helper C puts it, 6 m goal-side of
     * him: the play waits for his legs to get him there (claimscheck card.runbehind) */
    if (P4 && thruCard(o)) pl.beats.forEach(function (b) { if (b.kind === 'interception') b.waitMan = true; });
    /* kmtree5 a4 (helper P, G's routine at the touchline free kick): "A aims at the far post": the first ball goes to the
     * far post, past the middle from where it is struck, 5 m out; a keeper who catches it catches it there, and a man
     * who heads it out heads it from there (claimscheck card.farpost) */
    if (P4 && !PBRK.farpost && o && o.id === 'PAIR_ROUTINE') {
      var fi = -1; pl.beats.forEach(function (b, i) { if (fi < 0 && FLIGHT[b.kind] && b.kind !== 'kickoff') fi = i; });
      var fb = fi >= 0 ? pl.beats[fi] : null, fs = fi > 0 ? pl.beats[fi - 1].ball : start.ball;
      if (fb && fs) {
        var gF = att === 'you' ? P.L : 0, fp = { x: fs.x > 34 ? 28 : 40, y: gF - dirOf(att) * 5 }, nb = pl.beats[fi + 1];
        fb.ball = { x: fp.x, y: fp.y }; fb.fixedBall = true;   /* (its landing spot is the words': the ball does not go to where the legs got its man) */
        if (nb && nb.kind === 'save') { nb.ball = { x: fp.x, y: fp.y }; if (nb.to) { fb.pin = fb.pin || {}; fb.pin[nb.to] = { x: fp.x, y: fp.y + dirOf(att) * 0.8 }; } }
        else if (nb && nb.kind === 'out') {
          var hm = /([^ .,]+) heads it (?:out of play|clear|away)/.exec(text), hman = hm ? man(hm[1], def) : null;
          pl.beats.splice(fi + 1, 0, { kind: 'clearance', team: def, from: hman ? hman.id : null, to: null, ball: { x: nb.ball.x, y: nb.ball.y }, dur: passDur(P.dist(fp, nb.ball)), holder: null, poss: att, note: 'header' });
          if (hman) { fb.pin = fb.pin || {}; fb.pin[hman.id] = { x: fp.x, y: fp.y + dirOf(att) * 1 }; }
        }
      }
    }
    /* kmtree5 a4 (helper P, G's square ball against the keeper, note 10a): a ball across the goal to a man who shoots
     * at once: their keeper comes across his goal toward him while it travels (a3 left him where he stood) */
    if (P4 && !PBRK.square && o && o.id === 'Z_SQUARE') pl.beats.forEach(function (b, i) {
      var nb = pl.beats[i + 1]; if (b.kind !== 'pass' || !nb || nb.kind !== 'shot') return;
      var kp = keeperOf(st, other(b.team)), kq = kp && startPos[kp.id]; if (!kq) return;
      var tx = P.clamp(kq.x + (b.ball.x - kq.x) * 0.35, 30.8, 37.2);
      b.pin = b.pin || {}; if (!b.pin[kp.id]) b.pin[kp.id] = { x: tx, y: kq.y };
    });
    /* kmtree5 a4 (helper P, notes 14 and 16): a result whose first ball is struck by a man who is not at it (a header
     * away from a ball still in the air, a clearance by a man a few metres off): the ball first comes down to him, then
     * he strikes it (a3 had it struck from 4 to 6 m away) */
    var b0g = pl.beats[0];
    if (P4 && !PBRK.ghost && b0g && FLIGHT[b0g.kind] && b0g.kind !== 'shot' && b0g.from && b0g.from !== start.holder && startPos[b0g.from]) {
      var g0 = startPos[b0g.from], gd0 = P.dist(g0, start.ball);
      if (gd0 > 2.5) {
        var gTo = clampPt({ x: g0.x + (start.ball.x - g0.x) / gd0 * 1.0, y: g0.y + (start.ball.y - g0.y) / gd0 * 1.0 });
        pl.beats.unshift({ kind: 'pass', team: start.team, from: null, to: b0g.from, ball: gTo, dur: passDur(P.dist(start.ball, gTo)) + 0.1, holder: null, poss: start.team, note: 'in the air', drop: true });
      }
    }
    /* (kmtree5 a6, helper W: the making of the segment from its beats is a function, so that a wait the legs showed
     * can be played as football and the segment made again: wwHold. With the switch off it runs once, as a5 did.) */
    function finish6(beats, endPos6, old6) {
    var seg = build(st, start, startPos, beats, endPos6, endBall, seedOf(st, p.index, (p.step || 1) + 50, 9));
    if (typeof cardMenR !== 'undefined' && cardMenR.length) seg.keys[seg.keys.length - 1].cardMen = cardMenR;
    seg.kind = 'result'; seg.late = seg8late; seg.start = S; seg.index = p.index; seg.outcome = oc;
    seg.beaten = beaten.length && goesOn ? beaten[0].id : null;
    seg.beatenAll = beaten.map(function (q) { return q.id; });
    var last = seg.keys[seg.keys.length - 1];
    seg.end = { ball: { x: last.ball.x, y: last.ball.y, z: last.ball.z || 0 }, holder: last.holder, team: last.poss || start.team, pos: copyPos(last.pos) };
    if (result.restart) seg.end.restart = result.restart;
    if (!seg.end.holder) {
      /* nobody has it: the nearest man of the side it goes to picks it up */
      var nt = seg.end.team || start.team, nn = null, nd = 1e9;
      P.roster(st).forEach(function (r) { if (r.team !== nt) return; var d = P.dist(last.pos[r.id], last.ball); if (d < nd) { nd = d; nn = r.id; } });
      seg.end.holder = nn;
    }
    if (result.kickoff) seg.end = kickoffState(st, result.kickoff);
    if (A2 && goesOn) prepClaims(st, nx, seg);
    if (old6) wwSpent(seg, old6);
    if (A2) settle(seg);   /* a2 */
    return seg;
    }
    var end6 = endPos ? copyPos(endPos) : null, seg = finish6(pl.beats, endPos);
    if (W6.hold && A2) for (var hr6 = 0, trim6 = 0; hr6 < 3; hr6++) {
      var hb6 = wwHold(st, seg, { opt: o, near: S0.near, text: text, trim: trim6 });
      if (!hb6) break;
      /* (pace must not grow: a result that comes out longer played this way is tried once more with the wait played
       * that much shorter; if it is still longer, the result keeps its wait) */
      var seg6 = finish6(hb6, end6 ? copyPos(end6) : null, seg), over6 = seg6.duration - seg.duration;
      if (over6 > 0.3) {
        if (!trim6 && over6 < 1.5) { trim6 = over6 + 0.1; continue; }
        W6S.longer++; break;
      }
      trim6 = 0; seg6.ww = (seg.ww || 0) + 1; W6S.played++; seg = seg6;
    }
    return seg;
  }

  /* ------------------------------------------------------------ playback */
  function cr(p0, p1, p2, p3, u) {
    var u2 = u * u, u3 = u2 * u;
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  }
  /* the picture at time t: the ball, who has it, and all 22 (s0's picture:
   * every man on the director's own curve through the key frames) */
  var USE0 = false;   /* a2: track() reads the director's own ball (ball0), before the legs moved it */
  function kb(k) { return USE0 && k.ball0 ? k.ball0 : k.ball; }
  function rawFrameAt(seg, t) {
    var K = seg.keys, n = K.length;
    if (n === 1 || t >= seg.duration) {
      var e = K[n - 1], eb = kb(e);
      return { t: seg.duration, ball: { x: eb.x, y: eb.y, z: eb.z || 0 }, holder: e.holder, poss: e.poss, pos: e.pos, beat: null, done: true };
    }
    if (t <= 0) return { t: 0, ball: { x: kb(K[0]).x, y: kb(K[0]).y, z: kb(K[0]).z || 0 }, holder: K[0].holder, poss: K[0].poss, pos: K[0].pos, beat: null, done: false };
    var k = 0;
    while (k < n - 2 && K[k + 1].t <= t) k++;
    var a = K[k], b = K[k + 1], beat = seg.beats[k];
    var u = (t - a.t) / Math.max(1e-6, b.t - a.t);
    u = Math.max(0, Math.min(1, u));
    var flying = PASSY[beat.kind];
    var hd = flying ? holdOf(seg, k) : 0, uB = u, held = false;   /* kmtree5 a4: the hold at the passer's feet, then the flight */
    if (hd > 0) { if (t - a.t < hd) { held = true; uB = 0; } else uB = Math.max(0, Math.min(1, (t - a.t - hd) / Math.max(1e-6, b.t - a.t - hd))); }
    var ub = flying ? 1 - Math.pow(1 - uB, 1.6) : uB;
    var ab = kb(a), bb = kb(b);
    var ball = { x: P.lerp(ab.x, bb.x, ub), y: P.lerp(ab.y, bb.y, ub), z: 0 };
    var len = P.dist(ab, bb);
    if (flying && !held && (len > 26 || AIRY[beat.note])) ball.z = Math.sin(Math.PI * uB) * Math.min(2.2, 0.6 + len / 28);
    var za = ab.z || 0, zb = bb.z || 0;
    if (za || zb) ball.z = Math.max(ball.z, P.lerp(za, zb, u));
    var K0 = K[Math.max(0, k - 1)], K3 = K[Math.min(n - 1, k + 2)];
    var pos = {};
    var us = u * u * (3 - 2 * u);
    for (var id in b.pos) {
      var p1 = a.pos[id] || b.pos[id], p2 = b.pos[id], p0 = K0.pos[id] || p1, p3 = K3.pos[id] || p2;
      /* a smooth path through the key frames, eased at the ends of a segment */
      var w = (k === 0 || k === n - 2) && !A2 ? us : u;   /* (a2: not eased to a stop at the ends: the legs make the starts and stops, and a man running when the picture changes keeps running) */
      /* (a curve can overshoot a key frame: never past the lines) */
      pos[id] = { x: P.clamp(cr(p0.x, p1.x, p2.x, p3.x, w), 0.6, P.W - 0.6), y: P.clamp(cr(p0.y, p1.y, p2.y, p3.y, w), 0.6, P.L - 0.6) };
      /* m4: play is stopped for a foul: a man with the same place at both ends of the stoppage stands still (the curve through the key before made him overshoot and run back) */
      if (GUARD.taker && beat.kind === 'foul' && p1.x === p2.x && p1.y === p2.y) pos[id] = { x: p1.x, y: p1.y };
    }
    /* the man running with the ball stays on it */
    var holder = null;
    if ((held || (!flying && (beat.kind === 'carry' || beat.kind === 'dribble'))) && beat.from && pos[beat.from]) {
      var dy = (held ? beat.team : beat.poss) === 'you' ? 1 : -1;
      pos[beat.from] = { x: P.clamp(ball.x, 0.6, P.W - 0.6), y: P.clamp(ball.y - dy * P.BALL_OFF, 0.6, P.L - 0.6) };
      holder = beat.from;
    } else if (flying) holder = uB < 0.1 ? a.holder : null;
    else holder = u < 0.5 ? a.holder : b.holder;
    return { t: t, ball: ball, holder: holder, poss: u < 0.5 ? a.poss : b.poss, pos: pos, beat: beat, to: beat.to || null, done: false, hold: held };
  }

  /* ------------------------------------------------------------ mv1: movement */
  /* mv1: THE MOVEMENT LAYER (show only). s0 drew every man on a curve
   * through the director's key frames: all 22 re-aimed at every beat, so
   * everyone sped up and slowed down together, the whole team followed
   * every pass back and forth at a sprint (median 8.6 m/s, a man's jog is
   * 2 to 4), curves overshot and came back, and dots ran through each other.
   * Now the men IN the play (the man on the ball, the passer, the man it is
   * played to, the man gone past, a man the beat places, the keeper on a
   * shot, anyone within 7 m of the ball) still follow the director's curve
   * exactly; everyone else is a follower: he reacts a moment later the
   * farther he is from the ball (a back line reacts as one), runs toward
   * where the director wants him at a speed his role allows, speeds up and
   * slows down at a footballer's rate, keeps a stride from the others, and
   * is back exactly on the director's picture when the segment ends. The
   * key frames, the end picture and every event are untouched: only the
   * paths between them change. Precomputed once per segment (40 a second)
   * and remembered beside it, never written onto it. */
  var SEGST = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var TRACK = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var FROMV = typeof WeakMap !== 'undefined' ? new WeakMap() : null;   /* a2: segment -> the state it started from */
  var SETTLED = typeof WeakMap !== 'undefined' ? new WeakMap() : null;   /* a2: segment -> its end picture as the legs last left it */
  var MV = { h: 1 / 40, look: 1.2, arrive: 0.55, settle: 0.4, reach: 4.5, reachK: 4.5, reachA: 6, reachPic: 7, actR: 7, ramp: 0.45, gap: 2.7, pushMax: 0.2,
    vKeeper: 7, vNear: 8.0, vMid: 7.0, vFar: 5.8, vBack: 7.0, acc: 5.5, dec: 8.5,
    /* m8: top speeds a drawn man may never pass (m/s): outfield, keeper, the
     * man who has just won the ball; dropping back toward his own goal
     * (forwards, midfielders, defenders); walking to a restart after the ball
     * is dead; jogging to a restart in the middle of a play */
    capOut: 9.5, capKeeper: 8.0, capHolder: 11.0, backFw: 7.0, backMid: 7.5, backDef: 8.5, vWalk: 2.2, vJog: 4.5, cutFar: 12, cutFar1: 20, capRecv: 11, capRun: 30, endRush: 1.0,
    /* a2: THE LEGS (see track): top speeds (m/s) of a man off the ball, a man with the ball at his feet, a keeper,
     * a keeper diving at a shot; how fast any of them may change his velocity (m/s per s; the keeper's dive
     * apart); how quickly a man closes the gap to where the play wants him (s); the speed the plan gives a man
     * a ball is played to when it has him start his run early */
    legV: 9.2, legBall: 8.6, legKeeper: 7.5, legDiveV: 9.0, legA: 6.0, legDiveA: 25, legTau: 0.22, legRecv: 8.0, legGap: 3.6, legRep: 14, legLook: 0.5, legHard: 2.1, legWait: 0, legDead: 1.4, legDeadA: 7.5, legLine: 2.5, legLineW: 0, legLineSpan: 99, legKeeperA: 12, legBudget: 2.0, legLagOk: 1.0, legWaitEnd: 2.5, legWaitEnd4: 3.0, legKeepT: 2.0, legKeepT4: 3.0, legKeepM: 1.0, legWaitClaims: 1.2, legWaitShot: 4.0, legWaitFoul: 6.0, legWaitOver: 1.5,
    /* kmtree5 a4 (helper P, note 2): all the waits of one play or result together (s), and what a ball with nobody on it may float */
    waitCap: 1.0, flyWait: 0.3, softMiss: 0, legWaitKick: 1.0, ghostMax: 2.5, legWaitCut: 1.5, legDiveGoal: 34 };
  if (A2) { MV.cutFar = Infinity; MV.cutFar1 = Infinity; }   /* a2: no picture is out of reach (the legs place it): only a dead ball is a cut */
  if (BRK.fast) { MV.legV = MV.legBall = MV.legKeeper = MV.legDiveV = 40; }
  /* kmtree5 a4 (helper P, note 2): THE CAP ON WAITING, OFF BY DEFAULT. The waits left are the time the man the next
   * decision is about needs to run onto the moment's spot at a footballer's speed (his ruling: the running speeds stay);
   * capping them at 1 s leaves the ball off the moment's spot (mvcheck2 V7: 70% within 2 m instead of 97%). For
   * comparison, KM_PWAITCAP=<s> (node) or ?waitcap=<s> (page) caps the waits that leave the ball within 6 m and in the
   * same part of the pitch (DECISIONS-P-picture.md, item 1). */
  try { if (typeof process !== 'undefined' && process.env && process.env.KM_PWAITCAP) { MV.waitCap = +process.env.KM_PWAITCAP; MV.softMiss = 6; } } catch (e) { }
  try { var wcm = /[?&]waitcap=([\d.]+)/.exec((root.location && root.location.search) || ''); if (wcm) { MV.waitCap = +wcm[1]; MV.softMiss = 6; } } catch (e) { }
  if (BRK.jerk) { MV.legA = MV.legDiveA = MV.legKeeperA = MV.legDeadA = 400; }
  try { if (typeof process !== 'undefined' && process.env && process.env.KM_MVWANT) MV.keepWant = true; } catch (e) { }
  if (typeof process !== 'undefined' && process.env && process.env.KM_MVTRACK === '0') MV.noTrack = true;
  /* m8: ?cut=far-off in the page: no cut for distance (men run every picture in, however far); the cut for a dead ball stays */
  try { if (/[?&]cut=far-off\b/.test((root.location && root.location.search) || '')) { MV.cutFar = 1e9; MV.cutFar1 = 1e9; } } catch (e) { }   /* checks: the key frames of mv1 without the paths */
  function moveOn() { return !!(P.MOVE && P.MOVE.on && SEGST && TRACK && !MV.noTrack); }
  function sigOf(seg) {
    var K = seg.keys, a = K[K.length - 1], s = seg.duration * 1000 + K.length;
    for (var id in a.pos) s += a.pos[id].x * 1.3 + a.pos[id].y * 0.7;
    s += a.ball.x + a.ball.y * 3;
    return s.toFixed(4);
  }
  function smooth01(u) { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); }
  function m8On() { return !!(P.MOVE && P.MOVE.m8); }
  /* m8: a segment that ends with the ball dead (out of play, a foul): the page
   * cuts to the restart picture when it ends, instead of running everyone there */
  /* m8: a play or result that ends with a foul cuts to the free-kick picture
   * at the whistle (the start of the foul), and everyone stands in it while
   * play is stopped: the taker is over the ball from the whistle (m4's rule),
   * nobody runs into the wall. Returns that time, or null. */
  function cutAt(seg) {
    if (!m8On() || !seg || !seg.beats || !seg.beats.length) return null;
    var k = seg.beats.length - 1;
    if (seg.beats[k].kind === 'foul' && k > 0) return seg.keys[k].t;
    var mk = midCut(seg); return mk ? seg.keys[mk].t : null;
  }
  /* a2: THE BALL GOES DEAD IN THE MIDDLE OF A PLAY (out for a corner or a throw-in, and the play goes on from the
   * restart): the page cuts to the restart picture when the ball is dead (the key after the stoppage), as it does
   * at the end of a play; a1 had the taker sprint 20 to 40 m to the flag. Returns that key's index, or 0. */
  function midCut(seg) {
    if (!A2 || !seg || !seg.beats) return 0;
    for (var k = 0; k < seg.beats.length - 1; k++) if (seg.beats[k].kind === 'out' || seg.beats[k].kind === 'foul' || seg.beats[k].cut6) return k + 1;   /* (kmtree5 a6, helper W: cut6, the long-run cut, see wwHold) */
    return 0;
  }
  /* kmtree5 a4 (helper P, round 4: mvcheck2 V5): a play with a stoppage in the middle (out for a throw-in) AND a foul
   * at its end has two cuts: to the restart when the ball goes dead, and to the free kick at the whistle. a3 made one,
   * at the whistle, into the throw-in's picture, and the freeze then slid all 22 men to the free kick's (10.7 m).
   * Returns { mid, end } (times), or null. KM_PBREAK=twocut: a3's single cut. */
  function twoCuts(seg) {
    if (!P4 || PBRK.twocut || !seg || !seg.beats) return null;
    var mk = midCut(seg), cT = cutAt(seg), lb = seg.beats[seg.beats.length - 1];
    if (!mk || cT == null || !lb || lb.kind !== 'foul' || seg.keys[mk].t >= cT - 1e-6) return null;
    return { mid: seg.keys[mk].t, end: cT, mk: mk };
  }
  function stopEnd(seg) {
    if (!m8On() || !seg || !seg.beats || !seg.beats.length) return false;
    var b = seg.beats[seg.beats.length - 1];
    if (b.kind === 'foul' && cutAt(seg) != null) return false;   /* (cut at the whistle instead) */
    if (b.kind === 'out' || b.kind === 'foul') return true;
    /* and a picture the men cannot run into in about a second (a keeper's
     * throw that moves the play 40 m upfield): three men more than MV.cutFar
     * away from it when the play ends, or one more than MV.cutFar1 */
    var tr = track(seg);
    if (!tr) return false;
    if (tr.buf) return false;   /* (a2: the legs' end picture is the end picture: nothing is out of reach) */
    var a = tr.frames[tr.n], e = seg.keys[seg.keys.length - 1].pos, far = 0, far1 = 0;
    for (var id in e) if (a[id]) { var d = P.dist(a[id], e[id]); if (d > MV.cutFar) far++; if (d > MV.cutFar1) far1++; }
    return far >= 3 || far1 >= 1;
  }
  function track(seg) {
    if (!moveOn() || !seg || !seg.keys || seg.keys.length < 2 || !(seg.duration > 0.2)) return null;
    var who0 = SEGST.get(seg);
    if (!who0) return null;
    var sig = sigOf(seg), c = TRACK.get(seg), oldC = c;
    if (c && c.sig === sig) return c;
    var h = MV.h, n = Math.max(1, Math.ceil(seg.duration / h)), dur = seg.duration, i, k;
    var K = seg.keys, B = seg.beats;
    var RF = [];
    USE0 = true;
    for (i = 0; i <= n; i++) RF.push(rawFrameAt(seg, Math.min(dur, i * h)));
    USE0 = false;
    var FR0 = A2 && FROMV ? FROMV.get(seg) : null, V0 = FR0 && FR0.vel && !BRK.rest ? FR0.vel : null;   /* a2: how the men were running when this picture began */
    /* m8: THE BALL IS DEAD from the start of the first stoppage beat (out of
     * play, a foul) to its end: nobody runs for the restart places before it,
     * and during it men walk (or jog, when play goes on after it in this
     * segment); what is left when the segment ends is a cut (stopEnd) */
    var M8 = m8On(), deadA = Infinity, deadB = Infinity, deadLast = false;
    if (M8) for (k = 0; k < B.length; k++) if (B[k].kind === 'out' || B[k].kind === 'foul') { deadA = K[k].t; deadB = K[k + 1] ? K[k + 1].t : dur; deadLast = k === B.length - 1; break; }
    var ids = Object.keys(RF[n].pos).filter(function (q) { return RF[0].pos[q]; });
    var who = {};
    ids.forEach(function (q) { who[q] = who0[q] || { team: null, keeper: false, line: null }; });
    /* LOCKED: the man with the ball at his feet is on the director's curve
     * exactly (the ball never leaves him) */
    var lock = {}, feet = [];   /* m8: feet[i] = the man running with the ball at his feet (never slowed: the ball stays on him) */
    ids.forEach(function (q) { lock[q] = new Array(n + 1); });
    for (i = 0; i <= n; i++) {
      var fr = RF[i], b = fr.beat || null, on = {};
      if (b && ((b.kind === 'carry' || b.kind === 'dribble') || fr.hold) && b.from) { on[b.from] = 1; feet[i] = b.from; }   /* (kmtree5 a4: and the passer holding the ball before he plays it) */
      if (b && !PASSY[b.kind] && fr.holder) on[fr.holder] = 1;
      /* a keeper with the ball near his goal is on the director's curve exactly (his dive is timed to the shot) */
      var dead8 = M8 && fr.t >= deadA - 1e-6 && fr.t <= deadB + 1e-6;
      if (!dead8) ids.forEach(function (q) { if (who[q].keeper && Math.abs(fr.ball.y - (who[q].team === 'you' ? 0 : P.L)) < 35) on[q] = 1; });
      /* while play is stopped the man who takes the restart is at the ball from the whistle (m8: he walks there like the rest) */
      if (b && (b.kind === 'foul' || (!M8 && b.kind === 'out'))) { if (b.holder) on[b.holder] = 1; if (b.to) on[b.to] = 1; if (M8 && b.kind === 'foul' && K[K.length - 1].holder) on[K[K.length - 1].holder] = 1; }   /* (m8: a free kick's taker is at the ball from the whistle, as m4 ruled; a throw-in or corner taker walks) */
      /* (m8: nobody is pulled onto the end picture in the last frame: what is left is blended in by the page, or cut to) */
      if (i === 0 || (i === n && !M8)) ids.forEach(function (q) { on[q] = 1; });
      ids.forEach(function (q) { lock[q][i] = on[q] ? 1 : 0; });
    }
    /* ANCHORS: where the play needs a man at a key frame: the man a pass is
     * played to where it arrives, the man who has the ball, a man the beat
     * places (the man gone past, a runner, the wall), the keeper at the end
     * of a shot; and everyone at the end */
    var anch = {};
    ids.forEach(function (q) { anch[q] = []; });
    for (var kk = 1; kk < K.length; kk++) {
      var bt = B[kk - 1] || {}, need = {};
      if (bt.to) need[bt.to] = 1; if (K[kk].holder) need[K[kk].holder] = 1; if (bt.past) need[bt.past] = 1;
      /* kmtree5 a4 (helper P, notes 14 and 16): the man who strikes the next ball (a clearance, a header, a first-time
       * shot) where nobody has it is where it arrives: he is anchored there (a3 left him to drift: ghost kicks) */
      if (P4 && !PBRK.ghost && B[kk] && FLIGHT[B[kk].kind] && B[kk].kind !== 'shot' && B[kk].from && !K[kk].holder) need[B[kk].from] = 1;   /* (a shot keeps a3's rule: mvcheck2 V8, the keeper's dive) */
      if (bt.pin) for (var pk in bt.pin) need[pk] = 1;
      if (bt.kind === 'shot' || bt.kind === 'save') ids.forEach(function (q) { if (who[q].keeper) need[q] = 1; });
      /* the end, and the restart after a stoppage (everyone in place for the corner, the free kick) */
      var must = {}; for (var qm in need) must[qm] = 1;   /* m8: the places the play itself needs (not just "everyone at the end") */
      if (kk === K.length - 1 || bt.kind === 'out' || bt.kind === 'foul') ids.forEach(function (q) { need[q] = 1; });
      for (var q0 in need) if (anch[q0] && K[kk].pos[q0]) anch[q0].push({ t: Math.min(dur, K[kk].t), p: K[kk].pos[q0], must: !!must[q0] });
    }
    /* a follower heads for where the play will want him over the next
     * moment (the mean of the director's places over a window ahead), not
     * for every twitch of the curve: prefix sums for the window */
    var CS = {};
    ids.forEach(function (q) {
      var sx = [0], sy = [0];
      for (var j = 0; j <= n; j++) { sx.push(sx[j] + RF[j].pos[q].x); sy.push(sy[j] + RF[j].pos[q].y); }
      CS[q] = { x: sx, y: sy };
    });
    function windowAt(q, t0, t1) {
      if (t0 < deadA - 1e-6) { t1 = Math.min(t1, deadA); t0 = Math.min(t0, deadA); }   /* m8: live play does not look past the whistle */
      var a = Math.max(0, Math.min(n, Math.round(t0 / h))), b = Math.max(a, Math.min(n, Math.round(t1 / h)));
      var cc = CS[q], m = b - a + 1;
      return { x: (cc.x[b + 1] - cc.x[a]) / m, y: (cc.y[b + 1] - cc.y[a]) / m };
    }
    function hermite(A, t) {
      var s1 = Math.max(0, Math.min(1, (t - A.t0) / A.T)), s2 = s1 * s1, s3 = s2 * s1;
      var h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s1, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
      return { x: h00 * A.p.x + h10 * A.T * A.v.x + h01 * A.e.x + h11 * A.T * A.ve.x, y: h00 * A.p.y + h10 * A.T * A.v.y + h01 * A.e.y + h11 * A.T * A.ve.y };
    }
    var p = {}, v = {}, out = [], arr = {}, nextA = {}, off = {}, run8 = {}, recvFast8 = 0, cutT8 = cutAt(seg), lateRun = {}, midK = midCut(seg), midDone = false;
    var tc2 = twoCuts(seg);   /* (kmtree5 a4: two cuts, see twoCuts) */
    var KE = K[K.length - 1], lbE = B[B.length - 1], liveEnd = A2 && lbE && lbE.kind !== 'out' && lbE.kind !== 'foul', endRun = {}, endRunOn = {};
    /* the men the next decision's words are about: the man on the ball, and the man the scene names next to him
     * (the nearest of the other side, the man a cross is for), whose places the words rely on */
    if (liveEnd && KE.holder && !(lbE.kind === 'shot' && !KE.holder)) endRun[KE.holder] = 1;
    if (liveEnd && seg.start && seg.start.near && KE.pos[seg.start.near.id]) endRun[seg.start.near.id] = 1;
    if (liveEnd && seg.start && seg.start.crossTo && KE.pos[seg.start.crossTo.id]) endRun[seg.start.crossTo.id] = 1;
    if (liveEnd && KE.cardMen) KE.cardMen.forEach(function (q) { if (KE.pos[q]) endRun[q] = 1; });   /* (the men the cards name) */
    /* kmtree5 a6 (helper W): the man of theirs who is on the man with the ball while he holds it (wwLegs) stays with
     * him: he sets off for his next place only from 0.9 s before the ball is played (a5: as soon as his legs needed
     * it, so he backed away from a man standing on the ball: note 3) */
    var stay6 = {}, go6 = {};
    if (W6.hold) B.forEach(function (bq6, j6) { if (!bq6 || !bq6.press6) return; var r6 = j6; while (B[r6] && B[r6].press6 === bq6.press6) r6++; stay6[bq6.press6] = Math.max(stay6[bq6.press6] || 0, K[r6].t - 0.9); });
    /* and the man the held ball is for, when the decision is about him, runs for his place from the moment the hold
     * is made (he reads it: he does not wait for the ball to reach the man who will play it to him) */
    if (W6.hold && !(G8.playgo && seg.kind === 'play')) B.forEach(function (bq6, j6) { if (bq6 && bq6.for6 && bq6.for6 === KE.holder && go6[bq6.for6] == null) go6[bq6.for6] = 0; });   /* (kmtree5 a8, helper G, switch playgo: not in a play, whose length is fixed: there he got to his place early and stood beyond their line while the hold was played out) */
    /* a2: men why1's or r3's staging moved in the end picture after it was settled (the man the words name as the
     * nearest, a defender put behind the man past the line): they run for the place the words need, in time */
    var settled = SETTLED && SETTLED.get(seg), staged = {};
    var stagedAt = {};
    if (liveEnd && settled) for (var qs in KE.pos) if (settled[qs] && P.dist(settled[qs], KE.pos[qs]) > 0.3) { staged[qs] = 1; endRun[qs] = 1; stagedAt[qs] = { x: KE.pos[qs].x, y: KE.pos[qs].y }; }
    if (A2 && seg.late) seg.late.forEach(function (q) {
      for (var kL = 1; kL < K.length; kL++) { var bL = B[kL - 1]; if (bL && bL.pin && bL.pin[q] && K[kL].pos[q] && K[0].pos[q]) { lateRun[q] = { a: K[0].pos[q], b: K[kL].pos[q], t: K[kL].t }; break; } }
    });
    ids.forEach(function (q) { p[q] = { x: RF[0].pos[q].x, y: RF[0].pos[q].y }; v[q] = V0 && V0[q] ? { x: V0[q].x, y: V0[q].y } : { x: 0, y: 0 }; nextA[q] = 0; off[q] = { x: 0, y: 0 }; });
    out.push(copyPos(p));
    for (i = 1; i <= n; i++) {
      var t = Math.min(dur, i * h), ball = RF[i].ball, raw = RF[i].pos;
      if (midK && cutT8 != null && t >= (tc2 ? tc2.mid : cutT8) - 1e-6 && !midDone) {
        /* a2: the cut to the restart in the middle of the play: everyone is placed in the restart picture, still */
        midDone = true; var rp9 = K[midK].pos, sh9 = {};
        ids.forEach(function (q) { var r9 = rp9[q] || p[q]; p[q] = { x: r9.x, y: r9.y }; v[q] = { x: 0, y: 0 }; off[q] = { x: 0, y: 0 }; sh9[q] = { x: r9.x, y: r9.y }; });
        out.push(sh9);
        continue;
      }
      if ((!midK || (tc2 && midDone)) && cutT8 != null && t >= cutT8 - 1e-6) {
        /* m8: after the cut at the whistle everyone stands in the free-kick picture */
        var endP = K[K.length - 1].pos, sh8 = {};
        ids.forEach(function (q) { p[q] = { x: endP[q].x, y: endP[q].y }; v[q] = { x: 0, y: 0 }; off[q] = { x: 0, y: 0 }; sh8[q] = { x: endP[q].x, y: endP[q].y }; lock[q][i] = 0; });
        out.push(sh8);
        continue;
      }
      var bto8 = RF[i].beat && RF[i].beat.to;   /* m8: the man the ball is played to runs as the plan needs (review 1: a pass to nobody is worse than a fast run) */
      /* kmtree5 a4 (helper P, note 2): while the passer takes his touch, the man the pass is for is already making his run */
      var tch8 = RF[i].beat && RF[i].beat.touch ? B[B.indexOf(RF[i].beat) + 1] : null;
      if (tch8 && tch8.to && tch8.holder === tch8.to && tch8.note !== 'through ball' && tch8.note !== 'over the top') bto8 = tch8.to; else tch8 = null;   /* (a runner for a ball over or through runs as he did in a3: onside until it is played, helper C's C5) */
      /* m8: and in the last beat, the man who has the ball in the next picture gets to it: the decision is about him */
      if (RF[i].beat && RF[i].beat.for6) bto8 = RF[i].beat.for6;   /* kmtree5 a6 (helper W): while the passer holds it, the man the ball is for is already the man it is played to (his wanted place is not held back to a jog: he brakes onto his spot as he did when the hold was inside the pass's beat) */
      var endH8 = M8 && RF[i].beat && B.indexOf(RF[i].beat) === B.length - 1 && !deadLast ? K[K.length - 1].holder : null;
      if (endH8 && feet[i] !== endH8 && !bto8) bto8 = endH8;
      /* a back line reacts as one: its delay from its mean distance to the ball */
      var lineD = {};
      ids.forEach(function (q) {
        if (who[q].line !== 0) return;
        var L0 = lineD[who[q].team] = lineD[who[q].team] || { s: 0, n: 0 };
        L0.s += P.dist(p[q], ball); L0.n++;
      });
      /* the back line of the side without the ball keeps one depth: each
       * free defender's target depth is the line's mean (the one nearest
       * the ball may step out to him) */
      var possT = RF[i].poss, lineY = {}, lineOut = {};
      ['you', 'them'].forEach(function (tm) {
        if (tm === possT) return;
        var L1 = ids.filter(function (q) { return who[q].team === tm && who[q].line === 0; });
        if (L1.length < 3) return;
        L1.sort(function (a, b) { return P.dist(p[a], ball) - P.dist(p[b], ball); });
        lineOut[L1[0]] = 1;
        var sy = 0; L1.slice(1).forEach(function (q) { sy += windowAt(q, t, t + MV.look).y; });
        lineY[tm] = sy / (L1.length - 1);
      });
      var np = {}, cv = {};
      ids.forEach(function (q) {
        var r = raw[q], A = anch[q];
        while (nextA[q] < A.length && A[nextA[q]].t < t - 1e-6) nextA[q]++;
        if (lock[q][i]) { np[q] = { x: r.x, y: r.y }; delete arr[q]; return; }
        /* a2: a defender the words call late runs for his place by the ball from the start, flat out (not drifting
         * with the shape and pulled onto it in the last 0.4 s, which no legs can follow) */
        /* a2: the man the next decision is about makes his run for his place in time: once what is left of the
         * play is about what his legs need to get there, he goes straight for it (and waits there if early) */
        if (endRun[q] && !(stay6[q] != null && t < stay6[q]) && (!lock[q][i] || (feet[i] === q && q === KE.holder && RF[i].beat === B[B.length - 1])) && (feet[i] !== q || q === KE.holder)) {   /* (a2: the man the decision is about stops on his place even when he runs there with the ball) */
          var tg9 = staged[q] ? KE.pos[q] : (KE.pos0 && KE.pos0[q]) || KE.pos[q];
          if (tg9 && (endRunOn[q] || dur - t < legTimeFrom(p[q], tg9, v[q]) + 0.5 || (go6[q] != null && t >= go6[q]))) { endRunOn[q] = true; np[q] = { x: tg9.x, y: tg9.y }; cv[q] = { x: 0, y: 0 }; arr[q] = 1; return; }
        }
        if (lateRun[q] && t <= lateRun[q].t + 1e-6) {
          np[q] = { x: lateRun[q].b.x, y: lateRun[q].b.y }; cv[q] = { x: 0, y: 0 }; arr[q] = 1;   /* (his legs run for it as hard as they can) */
          return;
        }
        /* m8: the man a pass is played to runs onto it in a straight line at an
         * even speed, from where he is when it is played to where it arrives
         * (mv1 eased him onto it in the last 0.4 s: a jump when he was far) */
        if (M8 && bto8 === q && RF[i].beat && (PASSY[RF[i].beat.kind] || q === endH8 || tch8) && RF[i].beat.kind !== 'out') {
          var bk8 = B.indexOf(RF[i].beat) + (tch8 ? 1 : 0), kb8 = K[bk8 + 1];
          if (kb8 && kb8.pos[q]) {
            if (!run8[q] || run8[q].k !== bk8) run8[q] = { k: bk8, p: { x: p[q].x, y: p[q].y }, t: t - h };
            var uu8 = Math.max(0, Math.min(1, (t - run8[q].t) / Math.max(h, kb8.t - run8[q].t)));
            uu8 = uu8 < 0.75 ? uu8 / 0.875 : (0.75 + (uu8 - 0.75) - (uu8 - 0.75) * (uu8 - 0.75) * 2) / 0.875;   /* an even run, slowing onto the ball in the last quarter (not through it) */
            np[q] = { x: run8[q].p.x + (kb8.pos[q].x - run8[q].p.x) * uu8, y: run8[q].p.y + (kb8.pos[q].y - run8[q].p.y) * uu8 };
            var rx8 = np[q].x - p[q].x, ry8 = np[q].y - p[q].y, rd8 = Math.sqrt(rx8 * rx8 + ry8 * ry8);
            if (rd8 > MV.capRun * h) np[q] = { x: p[q].x + rx8 * MV.capRun * h / rd8, y: p[q].y + ry8 * MV.capRun * h / rd8 };   /* (a plan that needs more than MV.capRun: he arrives late) */
            if (rd8 > 12 * h) recvFast8++;
            cv[q] = { x: (np[q].x - p[q].x) / h, y: (np[q].y - p[q].y) / h };
            arr[q] = 1;
            return;
          }
        }
        var wk = who[q], db = P.dist(p[q], ball);
        if (wk.line === 0 && lineD[wk.team]) db = lineD[wk.team].s / lineD[wk.team].n;
        var fd = Math.min(1, db / 45);
        var vmax = wk.keeper ? MV.vKeeper : wk.line === 0 ? MV.vBack : db < 15 ? MV.vNear : db < 30 ? MV.vMid : MV.vFar;
        var delay = wk.keeper ? 0 : 0.08 + 0.25 * fd;
        var tg = windowAt(q, t - delay, t - delay + (wk.keeper ? 0.1 : MV.look));   /* a keeper does not guess early */
        if (wk.line === 0 && lineY[wk.team] != null && !lineOut[q] && !MV.noLine) tg = { x: tg.x, y: lineY[wk.team] };
        if (MV.still) tg = p[q];   /* mvcheck --break still: nobody off the ball moves until he must */
        var tau = wk.keeper ? 0.12 : 0.3 + 0.25 * fd;
        var dx = (tg.x - p[q].x) / tau, dy = (tg.y - p[q].y) / tau, ds = Math.sqrt(dx * dx + dy * dy);
        if (ds > vmax) { dx *= vmax / ds; dy *= vmax / ds; }
        /* THE PLACES THE PLAY NEEDS HIM: the more getting to the next one on
         * time asks of him (or any later one), the more he runs for it
         * instead of drifting with the shape; in the last half second before
         * it he runs straight for it. He may go faster than his role's top
         * speed only when the director's picture asks for it. */
        var na = A[nextA[q]], alpha = 0, cap = vmax;
        var live8 = M8 && t < deadA - 1e-6, dead8 = M8 && !live8 && t <= deadB + 1e-6;
        if (live8 && na && na.t > deadA + 1e-6) na = null;   /* m8: the restart places are not run for while the ball is live */
        if (dead8) {
          /* m8: the ball is dead: walk (jog, if the play goes on after it) to the restart place */
          var nd = na || { p: RF[n].pos[q] }, wv = deadLast ? MV.vWalk : MV.vJog;
          var wx = nd.p.x - p[q].x, wy = nd.p.y - p[q].y, wd = Math.sqrt(wx * wx + wy * wy);
          dx = wd > 0.05 ? wx / wd * Math.min(wv, wd / h) : 0; dy = wd > 0.05 ? wy / wd * Math.min(wv, wd / h) : 0; ds = Math.sqrt(dx * dx + dy * dy);
          na = null;
        }
        if (na && !MV.still) {
          var left = Math.max(h, na.t - t), rx = (na.p.x - p[q].x) / left, ry = (na.p.y - p[q].y) / left, need = Math.sqrt(rx * rx + ry * ry), needMax = need;
          for (var jA = nextA[q] + 1; jA < A.length; jA++) { if (live8 && A[jA].t > deadA + 1e-6) break; needMax = Math.max(needMax, P.dist(p[q], A[jA].p) / Math.max(h, A[jA].t - t)); }
          alpha = Math.max(Math.min(1, Math.max(0, (needMax / vmax - 0.2) / 0.5)), Math.min(1, Math.max(0, 1 - left / 0.5)));
          dx = dx + (rx - dx) * alpha; dy = dy + (ry - dy) * alpha;
          cap = Math.max(vmax, need * 1.15);
          if (M8 && na.t >= dur - 1e-6 && !na.must) cap = Math.min(cap, vmax + MV.endRush);   /* m8: for the next decision's picture he runs at his role's speed, not flat out: what is left is run in after the play */
          ds = Math.sqrt(dx * dx + dy * dy);
          if (ds > cap) { dx *= cap / ds; dy *= cap / ds; }
        }
        if (alpha > 0.6) arr[q] = 1; else delete arr[q];
        var ax = dx - v[q].x, ay = dy - v[q].y, as = Math.sqrt(ax * ax + ay * ay);
        var cur = Math.sqrt(v[q].x * v[q].x + v[q].y * v[q].y), am = (ds < cur ? (dead8 ? MV.dec * 1.6 : MV.dec) : MV.acc) * h * (1 + 2 * alpha);   /* (m8: at the whistle they stop running quickly) */
        if (as > am) { ax *= am / as; ay *= am / as; }
        var fx = p[q].x + (v[q].x + ax) * h, fy = p[q].y + (v[q].y + ay) * h;
        cv[q] = { x: v[q].x + ax, y: v[q].y + ay };   /* his running speed, kept apart from the easing below */
        /* and in the last 0.4 s before it he is eased onto the place, so that
         * at the moment the play needs him there, he is there */
        if (na && !(M8 && na.t >= dur - 1e-6 && !na.must)) {   /* (m8: not onto the end picture: that is run in after the play, at a footballer's speed) */
          var wA = smooth01(1 - (na.t - t) / MV.settle);
          fx += (na.p.x - fx) * wA; fy += (na.p.y - fy) * wA;
        }
        np[q] = { x: fx, y: fy };
      });
      /* a stride between men: everyone but the man on the ball steps aside
       * a little (an offset on his path that fades again, and is gone by the
       * time he has to be somewhere) */
      var shown = {};
      ids.forEach(function (q) {
        if (lock[q][i]) { off[q] = { x: 0, y: 0 }; shown[q] = { x: np[q].x, y: np[q].y }; return; }
        var na2 = anch[q][nextA[q]], fade = na2 ? Math.min(1, Math.max(0, (na2.t - t) / 0.35)) : 1;
        if (M8 && na2 && na2.t >= dur - 1e-6 && !na2.must && !who[q].keeper) fade = 1;   /* m8: the end picture is blended in after the end, so men keep a stride apart up to it */
        off[q] = { x: off[q].x * 0.94 * fade, y: off[q].y * 0.94 * fade };
        shown[q] = { x: np[q].x + off[q].x, y: np[q].y + off[q].y };
      });
      for (var it2 = 0; it2 < 3; it2++) for (var a1 = 0; a1 < ids.length; a1++) for (var b1 = a1 + 1; b1 < ids.length; b1++) {
        var qa = ids[a1], qb = ids[b1], pa = shown[qa], pb = shown[qb];
        var ddx = pb.x - pa.x, ddy = pb.y - pa.y, dd = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dd >= MV.gap) continue;
        var fa = lock[qa][i] ? 0 : arr[qa] ? 0.5 : 1, fb = lock[qb][i] ? 0 : arr[qb] ? 0.5 : 1;
        if (!fa && !fb) continue;
        if (dd < 1e-6) { ddx = 1; ddy = 0; dd = 1; }
        var push = Math.min(MV.pushMax, MV.gap - dd), ux = ddx / dd, uy = ddy / dd;
        var sa = fa / (fa + fb), sb = fb / (fa + fb);
        off[qa].x -= ux * push * sa; off[qa].y -= uy * push * sa; off[qb].x += ux * push * sb; off[qb].y += uy * push * sb;
        pa.x -= ux * push * sa; pa.y -= uy * push * sa; pb.x += ux * push * sb; pb.y += uy * push * sb;
      }
      /* m8: THE TOP SPEED. Nobody but the man with the ball at his feet moves
       * faster than a footballer can between two samples, the picture's wishes
       * or not (review 1: single-frame jumps into the next picture); a man
       * running back toward his own goal is slower still (a forward jogs back).
       * What he does not reach by the end, the page blends in after it. */
      if (M8) ids.forEach(function (q) {
        if (feet[i] === q || bto8 === q) return;
        var wk = who[q], dir0 = wk.team === 'you' ? 1 : -1, qq0 = np[q], mx = qq0.x - p[q].x, my = qq0.y - p[q].y, md = Math.sqrt(mx * mx + my * my);
        if (md < 1e-9) return;
        var top = wk.keeper ? (Math.abs(ball.y - (wk.team === 'you' ? 0 : P.L)) < 20 ? MV.capKeeper + 2 : MV.capKeeper) : RF[i].holder === q ? MV.capHolder : MV.capOut;
        if (!wk.keeper && my * dir0 < -0.5 * md) top = Math.min(top, wk.line === 2 ? MV.backFw : wk.line === 1 ? MV.backMid : MV.backDef);
        if (md > top * h) {
          np[q] = { x: p[q].x + mx * top * h / md, y: p[q].y + my * top * h / md };
          if (cv[q]) { var cs0 = Math.sqrt(cv[q].x * cv[q].x + cv[q].y * cv[q].y); if (cs0 > top) cv[q] = { x: cv[q].x * top / cs0, y: cv[q].y * top / cs0 }; }
          if (lock[q][i]) { lock[q][i] = 0; shown[q] = { x: np[q].x, y: np[q].y }; }
          else shown[q] = { x: np[q].x + off[q].x, y: np[q].y + off[q].y };
        }
      });
      ids.forEach(function (q) {
        var qq = np[q];
        qq.x = P.clamp(qq.x, 0.6, P.W - 0.6); qq.y = P.clamp(qq.y, 0.6, P.L - 0.6);
        v[q] = cv[q] || { x: (qq.x - p[q].x) / h, y: (qq.y - p[q].y) / h };
        p[q] = qq;
        if (i === n && !M8) shown[q] = { x: qq.x, y: qq.y };   /* (m8: the last sample keeps its stride apart too: it is no longer the end picture) */
        else shown[q] = { x: P.clamp(shown[q].x, 0.6, P.W - 0.6), y: P.clamp(shown[q].y, 0.6, P.L - 0.6) };
        /* m8: the drawn dot (with its stride offset) keeps the top speed too */
        if (M8 && feet[i] !== q && !(lock[q][i] && !who[q].keeper && RF[i].holder === q)) {
          var ps = out[i - 1][q], sx = shown[q].x - ps.x, sy = shown[q].y - ps.y, sd = Math.sqrt(sx * sx + sy * sy), lim = (bto8 === q ? MV.capRun + 1 : who[q].keeper ? MV.capKeeper + 2 : MV.capHolder) * h;
          if (sd > lim) { shown[q] = { x: ps.x + sx * lim / sd, y: ps.y + sy * lim / sd }; if (lock[q][i]) lock[q][i] = 0; }
        }
      });
      out.push(shown);
    }
    c = { sig: sig, h: h, n: n, frames: out, act: lock, recvFast: recvFast8 * h };
    if (A2) legs(seg, c, RF, out, ids, who, feet, cutT8, V0);
    /* a2: a later re-run (the staging moved men in a settled end picture) changes those men only: everyone else
     * keeps the paths and the end places the words were fitted to */
    if (A2 && settled && oldC && oldC.buf && oldC.n === c.n && c.buf && Object.keys(staged).length) {
      var KL9 = K[K.length - 1];
      ids.forEach(function (q) {
        if (oldC.idx[q] == null || c.idx[q] == null) return;
        /* a man the staging moved keeps his path too, and eases from it onto the staged place over the end of the
         * play (never faster than about 5 m/s/s more than he was running) */
        var dS = staged[q] && settled[q] && stagedAt[q] ? { x: stagedAt[q].x - settled[q].x, y: stagedAt[q].y - settled[q].y } : null, dd9 = dS ? Math.sqrt(dS.x * dS.x + dS.y * dS.y) : 0;
        var Tb = Math.min(dur, Math.max(1.2, Math.sqrt(1.2 * dd9)));
        for (var i9 = 0; i9 <= c.n; i9++) {
          var o1 = (i9 * c.m + c.idx[q]) * 2, o0 = (i9 * oldC.m + oldC.idx[q]) * 2, bx9 = oldC.buf[o0], by9 = oldC.buf[o0 + 1];
          if (dS) { var t9 = Math.min(dur, i9 * c.h), u9 = Math.max(0, Math.min(1, (t9 - (dur - Tb)) / Tb)); u9 = u9 * u9 * (3 - 2 * u9); bx9 += dS.x * u9; by9 += dS.y * u9; }
          if (dS && i9 > 0) {   /* (and never faster than his legs: what is left, he is short of) */
            var o9 = ((i9 - 1) * c.m + c.idx[q]) * 2, px9 = c.buf[o9], py9 = c.buf[o9 + 1], sx9 = bx9 - px9, sy9 = by9 - py9, sd9 = Math.sqrt(sx9 * sx9 + sy9 * sy9), hh9 = Math.min(dur, i9 * c.h) - Math.min(dur, (i9 - 1) * c.h), lim9 = MV.legV * hh9;
            if (sd9 > lim9 && sd9 > 1e-9) { bx9 = px9 + sx9 * lim9 / sd9; by9 = py9 + sy9 * lim9 / sd9; }
          }
          c.buf[o1] = bx9; c.buf[o1 + 1] = by9;
        }
        if (staged[q] && stagedAt[q]) { var eo9 = (c.n * c.m + c.idx[q]) * 2; stagedAt[q] = { x: c.buf[eo9], y: c.buf[eo9 + 1] }; KL9.pos[q] = { x: stagedAt[q].x, y: stagedAt[q].y }; if (seg.end && seg.end.pos && !seg.end.kickoff) seg.end.pos[q] = { x: stagedAt[q].x, y: stagedAt[q].y }; if (oldC.vel && seg.end && seg.end.vel && oldC.vel[q]) seg.end.vel[q] = oldC.vel[q]; return; }
        if (settled[q]) { KL9.pos[q] = { x: settled[q].x, y: settled[q].y }; if (seg.end && seg.end.pos && !seg.end.kickoff) seg.end.pos[q] = { x: settled[q].x, y: settled[q].y }; }
        if (oldC.vel && seg.end && seg.end.vel && oldC.vel[q]) seg.end.vel[q] = oldC.vel[q];
      });
      K.forEach(function (k9, j9) { if (oldC.kball && oldC.kball[j9]) k9.ball = oldC.kball[j9]; });
      if (seg.end && seg.end.ball && oldC.endBall) seg.end.ball = oldC.endBall;
      c.sig = sigOf(seg);
      if (SETTLED) SETTLED.set(seg, copyPos(KL9.pos));
    }
    TRACK.set(seg, c);
    return c;
  }

  /* a2 (helper M): THE LEGS. Everything above makes the picture the play WANTS at every 1/40 s: the man on the
   * ball on the director's curve, the man a pass is played to running onto it, everyone else drifting with the
   * shape. Here every man, all 22, runs it with a body: from where he is and at the velocity he has (carried
   * over from the last picture, so a man running when a picture changes keeps running), he chases where the
   * play wants him, never faster than his top speed (MV.legV off the ball, legBall with the ball at his feet,
   * legKeeper, legDiveV for a keeper diving at a shot) and never changing his velocity by more than MV.legA
   * m/s per second (a keeper's dive legDiveA). What a man cannot reach, he reaches late. The ball goes with
   * the men: at the feet of the man running with it, and a pass flies to where its man really is when it
   * arrives (the key frames' ball is moved by his lag, so the page's own flight draws the same). And the
   * picture the segment ENDS on is where the legs got everyone (unless the ball goes dead: the page cuts to the
   * restart), written back into the last key and seg.end, with the velocities (seg.end.vel), so the next
   * picture starts from exactly what was on the screen: nobody is left with a gap to run in after the play. */
  function legs(seg, c, RF, out, ids, who, feet, cutT8, V0) {
    var midK = midCut(seg), midDone = false, tc2 = twoCuts(seg);
    var K = seg.keys, B = seg.beats, h = c.h, n = c.n, dur = seg.duration, i;
    var bp = {}, bv = {}, body = [], carryOff = {}, diveFrom = {};
    /* the words name the nearest man of the other side to the man on the ball: in the last MV.legKeepT s nobody
     * else of that side comes within that distance (plus MV.legKeepM) of where the man on the ball ends, so the
     * picture the decision is read from keeps the man the words name the nearest */
    var KE2 = K[K.length - 1], lb2 = B[B.length - 1], keep = null;
    if (seg.start && seg.start.near && KE2.holder && lb2 && lb2.kind !== 'out' && lb2.kind !== 'foul') {
      var pl0 = KE2.pos0 || KE2.pos, cN = pl0[KE2.holder], nN = pl0[seg.start.near.id], tmN = who[seg.start.near.id] && who[seg.start.near.id].team;
      if (cN && nN && tmN) keep = { c: cN, r: P.dist(cN, nN) + MV.legKeepM, team: tmN, near: seg.start.near.id };
    }
    var clW = CLAIMS && CLAIMS.get(seg), liveW = lb2 && lb2.kind !== 'out' && lb2.kind !== 'foul';
    if (!liveW) clW = null;
    if (clW && clW.near) { var pl1 = KE2.pos0 || KE2.pos; if (pl1[clW.near.T] && pl1[clW.near.N]) keep = { c: pl1[clW.near.T], tgt: clW.near.T, r: P.dist(pl1[clW.near.T], pl1[clW.near.N]) + MV.legKeepM, team: clW.near.team, near: clW.near.N }; }
    /* the back line of the side without the ball wants one depth: in the wanted picture, each of its men (but the
     * one nearest the ball and the men the beat names) is kept within MV.legLineSpan/2 of the line's middle depth */
    if (!MV.noLine) for (i = 0; i <= n; i++) {
      var btw = RF[i].beat || {}, inPw = {}; [btw.from, btw.to, btw.past].forEach(function (x) { if (x) inPw[x] = 1; }); if (btw.pin) for (var pkw in btw.pin) inPw[pkw] = 1;
      if (btw.kind === 'out' || btw.kind === 'foul') continue;
      ['you', 'them'].forEach(function (tmw) {
        if (tmw === RF[i].poss) return;
        var Lw = ids.filter(function (q) { return who[q].team === tmw && who[q].line === 0 && !who[q].keeper && !inPw[q]; });
        if (Lw.length < 3) return;
        var blw = RF[i].ball; Lw.sort(function (a, b) { return P.dist(out[i][a], blw) - P.dist(out[i][b], blw); });
        Lw = Lw.slice(1); var ys = Lw.map(function (q) { return out[i][q].y; }).sort(function (a, b) { return a - b; }), mid = (ys[0] + ys[ys.length - 1]) / 2, hw = MV.legLineSpan / 2;
        if (ys[ys.length - 1] - ys[0] <= MV.legLineSpan) return;
        Lw.forEach(function (q) { var y0 = out[i][q].y; if (y0 < mid - hw || y0 > mid + hw) { out[i][q] = { x: out[i][q].x, y: Math.max(mid - hw, Math.min(mid + hw, y0)) }; } });
      });
    }
    ids.forEach(function (q) { bp[q] = { x: out[0][q].x, y: out[0][q].y }; bv[q] = V0 && V0[q] ? { x: V0[q].x, y: V0[q].y } : { x: 0, y: 0 }; });
    body.push(copyPos(bp));
    /* kmtree5 a6 (helper T): A TACKLE IS TWO MEN AT THE BALL. a5 had the man who wins it run to the plan's spot while
     * the man who has it was where his legs had got him, short of it (6.4 m apart at the median), and then sent him
     * off to his next place; the ball was rolled from one to the other. Now the man with the ball runs on at the man
     * who is coming for it, from the tackle's beat until the two are at the ball together (or a second after the
     * beat); the ball stays with him until then (tBallPlan). Only he is moved: the man who wins it, the man the next
     * decision may be about, runs exactly as in a5, so no play gets longer. KM_TBREAK=tackle: a5's. */
    var tk6 = [];
    /* kmtree5 a7 (helper T2): A PICTURE THAT STARTS WITH THE BALL IN THE AIR BESIDE THE MAN WHO PLAYS IT (the decision's
     * picture of a ball over their defence has him 4.2 m short of it, on purpose: pitch.js freeze(); the play before
     * ends with the ball flying past him). a6t brought the ball back to him along the ground with nobody at it. When
     * his first beat is a pass he now runs onto it (the same override as the tackled man's), takes it where it
     * comes down (tAirSpot: a metre on from where the picture has it) and stays on it until the plan has him play
     * it. When his first beat is a run with the ball his legs are not touched (a detour made 23 of those results
     * 0.4 to 1.3 s longer): the ball runs on into his stride instead (tBallPlan, 'come'). */
    var air6 = null;
    if (T6 && !TBRK.t2 && !TBRK.t2air && B[0] && K[0].holder && B[0].from === K[0].holder && bp[K[0].holder] && !who[K[0].holder].keeper && PASSY[B[0].kind] && B[0].kind !== 'shot' && B[0].kind !== 'out' && B[0].kind !== 'save') {
      var sp6 = tAirSpot(seg, bp[K[0].holder]);
      c.air6sp = sp6;   /* (the ball's plan reads the same spot) */
      if (sp6) { var dp6 = P.dist(sp6, K[1].ball); air6 = { m: K[0].holder, ball: sp6, at: null, until: Math.max(0, K[1].t - tNat(dp6, tAiry(B[0], dp6), B[0].note === 'header')) }; }
    }
    if (T6 && !TBRK.tackle) B.forEach(function (b6, k6) {
      if (b6.kind !== 'tackle' || !b6.from || !b6.to || !bp[b6.from] || !bp[b6.to] || who[b6.from].keeper) return;
      var nb6 = B[k6 + 1] || null, sl6 = nb6 && (nb6.kind === 'carry' || nb6.kind === 'dribble') && nb6.from === b6.to ? Math.min(1.0, 0.6 * (K[k6 + 2].t - K[k6 + 1].t)) : (nb6 && nb6.kind !== 'shot' && nb6.kind !== 'out' && nb6.kind !== 'foul' && nb6.kind !== 'save' ? 0.25 : 0);
      if (G9.rob && nb6 && PASSY[nb6.kind] && nb6.from === b6.to) sl6 = 0;   /* (kmtree5 a9, helper G2, switch rob, OFF by default: the robbed man is let go when the tackle's beat ends) */
      tk6.push({ A: b6.from, W: b6.to, ta: K[k6].t, tb: Math.min(dur, K[k6 + 1].t + sl6), done: false });
    });
    for (i = 1; i <= n; i++) {
      var t = Math.min(dur, i * h), hh = t - Math.min(dur, (i - 1) * h);   /* (the last sample can be short) */
      if (hh < 1e-6) { body.push(copyPos(bp)); continue; }
      if (midK && cutT8 != null && t >= (tc2 ? tc2.mid : cutT8) - 1e-6 && !midDone) {   /* the cut to a restart in the middle of the play: placed, still */
        midDone = true; body.push(out[i]); ids.forEach(function (q) { bp[q] = { x: out[i][q].x, y: out[i][q].y }; bv[q] = { x: 0, y: 0 }; });
        continue;
      }
      if ((!midK || (tc2 && midDone)) && cutT8 != null && t >= cutT8 - 1e-6) {   /* the cut at the whistle: everyone stands in the free-kick picture */
        body.push(out[i]); ids.forEach(function (q) { bp[q] = { x: out[i][q].x, y: out[i][q].y }; bv[q] = { x: 0, y: 0 }; });
        continue;
      }
      var bt = RF[i].beat || null, dive = bt && (bt.kind === 'shot' || bt.kind === 'save');
      var row = {};
      /* a stride apart: men closer than MV.legGap step away from each other (not the men in a tackle, a foul, a
       * pass cut out, a save or a man gone past, nor the man on the ball with them) */
      var inC = {}, rep = {};
      if (bt && (bt.kind === 'tackle' || bt.kind === 'foul' || bt.kind === 'interception' || bt.kind === 'save')) [bt.from, bt.to, bt.past, RF[i].holder].forEach(function (x) { if (x) inC[x] = 1; });
      if (bt && bt.kMet) [bt.from, bt.kMet].forEach(function (x) { if (x) inC[x] = 1; });
      if (bt && (bt.kind === 'dribble' || bt.meets) && P4 && !PBRK.dribble) [bt.from, bt.past, bt.meets].forEach(function (x) { if (x) inC[x] = 1; });   /* (kmtree5 a4, note 8a: the man gone past is not stepped aside from him) */

      if (bt && bt.fouler && !PBRK.foul) [bt.from, bt.fouler].forEach(function (x) { if (x) inC[x] = 1; });   /* (kmtree5 a4, note 11: the man who fouls him comes right up to him) */   /* (a3: the keeper who came out to meet the man on the ball holds his spot as the man goes past him) */
      var bi9n = bt ? B.indexOf(bt) : -1, shotSoon = bi9n >= 0 && B[bi9n + 1] && B[bi9n + 1].kind === 'shot' && K[bi9n + 1].t - t < 0.45 || false;
      function keepSet(x) { return !!(who[x].keeper && (shotSoon || (dive && !diveTo[x])) && Math.abs(RF[i].ball.y - (who[x].team === 'you' ? 0 : P.L)) < 35); }
      var pastTo = null;
      if (bt && bt.kind === 'dribble' && bt.past) { var kP = K[B.indexOf(bt) + 1]; pastTo = kP && ((kP.pos0 && kP.pos0[bt.past]) || kP.pos[bt.past]) || null; }
      var ov6 = {};
      tk6.forEach(function (q6) {
        if (q6.done || t < q6.ta - 1e-6 || t > q6.tb + 1e-6) return;
        inC[q6.A] = 1; inC[q6.W] = 1;
        var dA6 = who[q6.A].team === 'them' ? -1 : 1, bl6 = { x: bp[q6.A].x, y: bp[q6.A].y + dA6 * P.BALL_OFF };
        var dx6 = bp[q6.W].x - bl6.x, dy6 = bp[q6.W].y - bl6.y, dd6 = Math.sqrt(dx6 * dx6 + dy6 * dy6);
        if (dd6 <= 2.0) { q6.done = true; return; }
        ov6[q6.A] = { p: { x: bp[q6.W].x - dx6 / dd6 * 1.3, y: bp[q6.W].y - dy6 / dd6 * 1.3 - dA6 * P.BALL_OFF }, v: bv[q6.W] };
      });
      if (air6 && !air6.done) {   /* (T2: the run onto a ball in the air, and the stay on it until it is played) */
        var ax6 = air6.ball.x - bp[air6.m].x, ay6 = air6.ball.y - bp[air6.m].y, ad6 = Math.sqrt(ax6 * ax6 + ay6 * ay6);
        if (!air6.at && ad6 <= P.BALL_OFF + 0.3) air6.at = { x: bp[air6.m].x, y: bp[air6.m].y };
        if (t > 2.0 || (air6.at && t >= air6.until)) air6.done = true;
        else ov6[air6.m] = air6.at ? { p: air6.at, v: { x: 0, y: 0 } } : { p: { x: air6.ball.x - ax6 / ad6 * P.BALL_OFF, y: air6.ball.y - ay6 / ad6 * P.BALL_OFF }, v: { x: 0, y: 0 } };
      }
      var free = {}, diveTo = {};   /* a keeper diving at a shot goes where the ball is, whoever is there */
      if (dive) { var kD = K[B.indexOf(bt) + 1]; ids.forEach(function (q) { if (who[q].keeper) { free[q] = 1; var pD = kD && ((kD.pos0 && kD.pos0[q]) || kD.pos[q]); if (pD && bt.kind === 'shot') diveTo[q] = pD; } }); }
      /* a defender the words call late closes on the man on the ball (m8's rule): he is not held off him */
      var lateTo = {}; if (seg.late && seg.late.length) seg.late.forEach(function (q) { lateTo[q] = 1; });
      var onBall = feet[i] || RF[i].holder || (bt && bt.from);
      function held(x, y) { return (lateTo[x] && y === onBall) || (lateTo[y] && x === onBall); }
      var toMan = bt && bt.to && bt.holder === bt.to && PASSY[bt.kind] ? bt.to : bt && bt.for6 ? bt.for6 /* kmtree5 a6 (helper W): the man a held ball is for keeps his line while the passer holds it, as he did when the hold was inside the pass's beat */ : bt && bt.touch && B[B.indexOf(bt) + 1] ? B[B.indexOf(bt) + 1].to : null, endMan = i > n - Math.round(0.8 / h) ? K[K.length - 1].holder : null;
      function ballMan(x) { return feet[i] === x || RF[i].holder === x || x === toMan || x === endMan; }
      var deadB = !!(bt && (bt.kind === 'out' || bt.kind === 'foul'));
      ids.forEach(function (q) { rep[q] = { x: 0, y: 0 }; });
      var cmd = {};
      /* the back line of the side without the ball holds one depth (the one nearest the ball, and any man the
       * beat names, apart): each of its men is drawn toward the line's mean depth */
      var possL = RF[i].poss, inPlayL = {}, lineM = {};
      if (bt) { [bt.from, bt.to, bt.past].forEach(function (x) { if (x) inPlayL[x] = 1; }); if (bt.pin) for (var pkL in bt.pin) inPlayL[pkL] = 1; }
      if (!MV.noLine) ['you', 'them'].forEach(function (tmL) {
        if (tmL === possL) return;
        var L = ids.filter(function (q) { return who[q].team === tmL && who[q].line === 0 && !who[q].keeper && !inPlayL[q]; });
        if (L.length < 3) return;
        var bl = RF[i].ball; L.sort(function (a, b) { return P.dist(bp[a], bl) - P.dist(bp[b], bl); });
        L = L.slice(1); var my = 0; L.forEach(function (q) { my += bp[q].y; }); my /= L.length;
        L.forEach(function (q) { lineM[q] = my; });
      });
      for (var a1 = 0; a1 < ids.length; a1++) for (var b1 = a1 + 1; b1 < ids.length; b1++) {
        var qa = ids[a1], qb = ids[b1], pa = bp[qa], pb = bp[qb], ddx = pb.x - pa.x, ddy = pb.y - pa.y, dd = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dd > 12 || (inC[qa] && inC[qb]) || free[qa] || free[qb] || held(qa, qb)) continue;
        /* where the two will be in MV.legLook s if they keep running: a man sees the other coming and steps aside in time */
        var fx = ddx + (bv[qb].x - bv[qa].x) * MV.legLook, fy = ddy + (bv[qb].y - bv[qa].y) * MV.legLook, fd = Math.sqrt(fx * fx + fy * fy);
        if (fd < dd && fd < MV.legGap) { ddx = (ddx + fx) / 2; ddy = (ddy + fy) / 2; dd = Math.min(dd, Math.max(fd, Math.sqrt(ddx * ddx + ddy * ddy))); }
        if (dd >= MV.legGap) continue;
        if (dd < 1e-6) { ddx = 1; ddy = 0; dd = 1; }
        var f1 = MV.legRep * (MV.legGap - dd) / MV.legGap, ux = ddx / dd, uy = ddy / dd;
        var ha = ballMan(qa) || keepSet(qa) || !!lateTo[qa], hb = ballMan(qb) || keepSet(qb) || !!lateTo[qb];   /* (and a man the words call late keeps his run: the other steps aside) */   /* (a keeper set for a shot holds his spot too) */   /* (the man on the ball, or the man it is on its way to, holds his line; the other steps aside) */
        var sa = ha ? 0 : hb ? 1 : 0.5, sb = hb ? 0 : ha ? 1 : 0.5;
        rep[qa].x -= ux * f1 * sa * 2; rep[qa].y -= uy * f1 * sa * 2; rep[qb].x += ux * f1 * sb * 2; rep[qb].y += uy * f1 * sb * 2;
      }
      ids.forEach(function (q) {
        var D1 = out[i][q], D0 = out[i - 1][q], w = who[q], kset9 = false;
        /* the man running with the ball runs from where he really got it: the plan's run is shifted by how far he was
         * from its start, and the shift fades out over the run, so he ends it where the plan does if he can */
        if (feet[i] === q && bt) {
          var cf = carryOff[q];
          if (!cf || cf.b !== bt) { var bi9 = B.indexOf(bt); cf = carryOff[q] = { b: bt, x: bp[q].x - D0.x, y: bp[q].y - D0.y, t0: K[bi9].t, t1: K[bi9 + 1].t }; }
          var f0 = 1 - Math.max(0, Math.min(1, (t - hh - cf.t0) / Math.max(0.05, cf.t1 - cf.t0))), f1 = 1 - Math.max(0, Math.min(1, (t - cf.t0) / Math.max(0.05, cf.t1 - cf.t0)));
          if (RF[i].hold) { f0 = 1; f1 = 1; }   /* (kmtree5 a4: holding the ball before he plays it, he stays on it where he has it) */
          D0 = { x: D0.x + cf.x * f0, y: D0.y + cf.y * f0 }; D1 = { x: D1.x + cf.x * f1, y: D1.y + cf.y * f1 };
        }
        var fvx = (D1.x - D0.x) / hh, fvy = (D1.y - D0.y) / hh;
        if (w.keeper && dive && diveTo[q]) {
          var dx9 = diveTo[q].x;
          /* a goal: from where he is when it is struck, he dives toward where the ball really passes him (the ball goes
           * with the men, so the plan's line may have moved): over a metre when it is further than that, and he ends a
           * little short of it */
          if (bt.kind === 'shot' && bt.note === 'goal') {
            var ia = B.indexOf(bt);
            if (!diveFrom[q] || diveFrom[q].b !== bt) {
              /* (the ball is struck where the shooter's legs got him, not where the plan had him: the ball goes with the men) */
              var sh9 = bt.from, pk9 = sh9 && K[ia].pos[sh9], ox9 = pk9 && bp[sh9] ? bp[sh9].x - pk9.x : 0, oy9 = pk9 && bp[sh9] ? bp[sh9].y - pk9.y : 0;
              diveFrom[q] = { b: bt, x: bp[q].x, y: bp[q].y, ox: ox9, oy: oy9, vx0: bv[q].x };
            }
            var f9 = diveFrom[q], A9 = K[ia].ball && { x: K[ia].ball.x + f9.ox, y: K[ia].ball.y + f9.oy }, Bb9 = K[ia + 1].ball;
            if (A9 && Bb9 && Math.abs(Bb9.y - A9.y) > 1e-6) {
              var lx9 = A9.x + (Bb9.x - A9.x) * (f9.y - A9.y) / (Bb9.y - A9.y), dl9 = lx9 - f9.x, ad9 = Math.abs(dl9);
              if (f9.moving == null) f9.moving = (f9.vx0 || 0) * (dl9 > 0 ? 1 : -1) > 1.5;   /* (kmtree5 a4: a keeper already running toward it dives at a3's rate; one still or going the other way dives quicker and nearer the ball, mvcheck K2) */
              if (ad9 > 1.0) dx9 = lx9 - (dl9 > 0 ? 1 : -1) * Math.max(0.2, Math.min(0.8, ad9 - 1.1));   /* (kmtree5 a4: at most 0.5 m short of it: a visible dive on a close shot, mvcheck K2) */
            }
          }
          D0 = { x: dx9, y: P4 && !PBRK.dive && bt.note === 'goal' ? bp[q].y : bp[q].y + Math.max(-0.5, Math.min(0.5, diveTo[q].y - bp[q].y)) }; fvx = 0; fvy = 0;   /* (kmtree5 a4: on a goal his dive is all across his line: mvcheck K2) */   /* (a dive is across his line, where he is) */
          /* a3: a keeper left behind the man who shoots (he came out and was gone past) does not dive across a line
           * the ball never crosses: he turns and runs back toward his goal, after the ball */
          var fB = diveFrom[q], iaB = B.indexOf(bt), AB = K[iaB] && K[iaB].ball, BB = K[iaB + 1] && K[iaB + 1].ball;
          if (bt.kind === 'shot' && fB && AB && BB && Math.abs(BB.y - AB.y) > 1e-6 && (fB.y - AB.y - (fB.oy || 0)) * (BB.y - AB.y > 0 ? 1 : -1) < -2) D0 = P4 && !PBRK.dive ? { x: BB.x, y: bp[q].y + Math.max(-3, Math.min(3, BB.y - bp[q].y)) } : { x: BB.x, y: BB.y };   /* (kmtree5 a4: he throws himself back across toward the ball's line, not only toward his goal: mvcheck K2) */   /* (more than 2 m behind where it is struck) */
        }   /* (a keeper diving goes straight for the spot the shot needs him at) */
        else if (bt && bt.kind === 'dribble' && bt.past === q && pastTo) { D0 = pastTo; fvx = 0; fvy = 0; }   /* (the man gone past is left where the plan leaves him, behind the ball: he does not keep running goal-side of it) */
        else if (w.keeper && !dive && t > dur - (G9.keeper ? Math.max(0.6, Math.sqrt(bv[q].x * bv[q].x + bv[q].y * bv[q].y) / G9T.keepA + 0.1) : 0.6) && Math.abs(RF[i].ball.y - (w.team === 'you' ? 0 : P.L)) < 30) { D0 = bp[q]; fvx = 0; fvy = 0; }   /* (kmtree5 a9, helper G2: at a man's rate of slowing he starts to set his feet in time to be still when the picture stops) */
        else if (w.keeper && !dive && shotSoon && Math.abs(RF[i].ball.y - (w.team === 'you' ? 0 : P.L)) < 35) {
          D0 = bp[q]; fvx = 0; fvy = 0; kset9 = true;   /* (kmtree5 a9, helper G2: kset9, he keeps MV.legKeeperA here) */
          /* kmtree5 a4 (helper P, mvcheck K2): before a shot that scores, in the last 0.2 s he reads it and shifts his
           * weight toward where it goes (half a metre) */
          var sb9 = B[bi9n + 1], ks9 = K[bi9n + 1], ke9 = K[bi9n + 2];
          if (P4 && !PBRK.dive && sb9 && sb9.note === 'goal' && sb9.team !== w.team && ks9 && ke9 && ks9.t - t < 0.2) {
            var sa9 = ks9.ball0 || ks9.ball, se9 = ke9.ball0 || ke9.ball, lx8 = Math.abs(se9.y - sa9.y) > 1e-6 ? sa9.x + (se9.x - sa9.x) * Math.max(0, Math.min(1, (bp[q].y - sa9.y) / (se9.y - sa9.y))) : se9.x;
            D0 = { x: bp[q].x + Math.max(-0.5, Math.min(0.5, lx8 - bp[q].x)), y: bp[q].y };
          }
        }   /* (a keeper sets his feet just before a shot is struck, then dives) */   /* (with the ball near his goal a keeper is set, still, when the picture stops for a decision) */
        if (ov6[q]) { D0 = ov6[q].p; fvx = ov6[q].v.x; fvy = ov6[q].v.y; }   /* (kmtree5 a6, helper T: the run to a tackle) */
        if (lineM[q] != null && !deadB) { D0 = { x: D0.x, y: D0.y + (lineM[q] - D0.y) * MV.legLineW }; }   /* (the line waits for its slowest man: its men aim part of the way to where the line really is) */
        var ex = D0.x - bp[q].x, ey = D0.y - bp[q].y, ed = Math.sqrt(ex * ex + ey * ey);
        var kd = w.keeper && dive, am = kd ? (P4 && !PBRK.dive && bt.kind === 'shot' && bt.note === 'goal' && diveFrom[q] && diveFrom[q].b === bt && !diveFrom[q].moving && K[B.indexOf(bt)].t >= 0.6 ? MV.legDiveGoal : MV.legDiveA) : deadB ? MV.legDeadA : w.keeper ? (G9.keeper && !kset9 ? G9T.keepA : MV.legKeeperA) : MV.legA;   /* (a keeper steps across his goal quicker than a man runs) */   /* (kmtree5 a9, helper G2, switch keeper: no, he moves like a man; only setting his feet before a shot keeps the quick rate) */   /* (the ball dead: they pull up hard) */
        /* close the gap in about legTau, but never faster than he could still stop on the spot */
        var cm = ed > 1e-9 ? Math.min(ed / (kd ? MV.legTau / 3 : MV.legTau), Math.sqrt(2 * am * ed)) / ed : 0;   /* (a keeper's dive goes straight for its spot) */
        var vx = fvx + ex * cm + rep[q].x, vy = fvy + ey * cm + rep[q].y + (lineM[q] != null && !deadB ? (lineM[q] - bp[q].y) * MV.legLine : 0), vs = Math.sqrt(vx * vx + vy * vy);
        var top = w.keeper ? (kd ? MV.legDiveV : MV.legKeeper) : (feet[i] === q || RF[i].holder === q) ? MV.legBall : MV.legV;
        /* running back toward his own goal, a man off the ball is slower (m8's rule: a forward jogs back) */
        if (!w.keeper && !(feet[i] === q || RF[i].holder === q) && vs > 1e-6 && vy * (w.team === 'you' ? 1 : -1) < -0.5 * vs) top = Math.min(top, w.line === 2 ? MV.backFw : w.line === 1 ? MV.backMid : MV.backDef);
        if (vs > top) { vx *= top / vs; vy *= top / vs; }
        cmd[q] = { x: vx, y: vy, am: am, top: top };
      });
      /* two men never run into each other: they close the gap between them no faster than they could still stop
       * MV.legHard apart (braking at most of their legs' rate); the rest of the closing is taken out, shared (the
       * man on the ball keeps his line) */
      for (var a2 = 0; a2 < ids.length; a2++) for (var b2 = a2 + 1; b2 < ids.length; b2++) {
        var qa2 = ids[a2], qb2 = ids[b2], ux2 = bp[qb2].x - bp[qa2].x, uy2 = bp[qb2].y - bp[qa2].y, d22 = Math.sqrt(ux2 * ux2 + uy2 * uy2);
        if (d22 >= 14 || d22 < 1e-6 || (inC[qa2] && inC[qb2]) || free[qa2] || free[qb2] || held(qa2, qb2)) continue;
        ux2 /= d22; uy2 /= d22;
        var cmax = Math.sqrt(2 * 0.7 * MV.legA * Math.max(0, d22 - MV.legHard));
        var close = (cmd[qb2].x - cmd[qa2].x) * ux2 + (cmd[qb2].y - cmd[qa2].y) * uy2 + cmax;
        if (close >= 0) continue;
        var ha2 = ballMan(qa2) || !!lateTo[qa2], hb2 = ballMan(qb2) || !!lateTo[qb2];
        var sa2 = ha2 ? 0 : hb2 ? 1 : 0.5, sb2 = hb2 ? 0 : ha2 ? 1 : 0.5;
        cmd[qa2].x += ux2 * close * sa2; cmd[qa2].y += uy2 * close * sa2; cmd[qb2].x -= ux2 * close * sb2; cmd[qb2].y -= uy2 * close * sb2;
      }
      if (keep && keep.tgt && bp[keep.tgt]) keep.c = bp[keep.tgt];   /* (the ring goes with the man it is round) */
      if (keep && t > dur - (P4 ? MV.legKeepT4 : MV.legKeepT)) {   /* (kmtree5 a4: the ring round the man on the ball from 3 s before the end: the plays are longer since a2) */ var rK = Math.max(keep.r, bp[keep.near] ? P.dist(bp[keep.near], keep.c) + MV.legKeepM : 0); ids.forEach(function (q) {
        if (q === keep.near || q === keep.tgt || who[q].keeper || who[q].team !== keep.team) return;
        var kx = bp[q].x - keep.c.x, ky = bp[q].y - keep.c.y, kd = Math.sqrt(kx * kx + ky * ky);
        if (kd < 1e-6 || kd > keep.r + 12) return;
        kx /= kd; ky /= kd;
        var inw = -(cmd[q].x * kx + cmd[q].y * ky), allow = Math.sqrt(2 * 0.7 * MV.legA * Math.max(0, kd - rK));
        if (kd < rK) { cmd[q].x += kx * (rK - kd) * 2; cmd[q].y += ky * (rK - kd) * 2; }   /* (inside it: out, at once) */
        else if (inw > allow) { cmd[q].x += kx * (inw - allow); cmd[q].y += ky * (inw - allow); }
      }); }
      /* "the only one of your players on that wing in front of him": the others keep off that wing ahead of him */
      if (clW && clW.wing && bp[clW.wing.H] && t > dur - MV.legKeepT) {
        var hW = bp[clW.wing.H], lnW = P.laneOfX(hW.x);
        if (lnW !== 1) ids.forEach(function (q) {
          var w9 = who[q]; if (w9.team !== 'you' || w9.keeper || q === clW.wing.F || q === clW.wing.H) return;
          var e9 = bp[q]; if ((e9.y - hW.y) * clW.wing.dir <= -1 || P.dist(e9, hW) > 36) return;
          var bx = lnW === 0 ? 22 : 46, out9 = lnW === 0 ? 1 : -1, dx9 = (e9.x - bx) * out9;   /* dx9 > 0: off the wing */
          var need = 1.2 - dx9;
          if (need > 0) cmd[q].x += out9 * need * 2.5;
          else { var towards = -cmd[q].x * out9, allow9 = Math.sqrt(2 * 0.7 * MV.legA * Math.max(0, dx9 - 1.2)); if (towards > allow9) cmd[q].x += out9 * (towards - allow9); }
        });
      }
      /* kmtree5 a4 (helper P, round 4: claimscheck card.backbonus): the man the pass back with its +3 is for drops in
       * behind the man on the ball (at least 2.5 m back) in the last seconds */
      if (P4 && !PBRK.backdrop && clW && clW.back && bp[clW.back.R] && bp[clW.back.H] && t > dur - MV.legKeepT) {
        var ahB = (bp[clW.back.R].y - bp[clW.back.H].y) * clW.back.dir;
        if (ahB > -2.5) cmd[clW.back.R].y -= clW.back.dir * Math.min(4, (ahB + 2.5) * 3);
      }
      /* kmtree5 a4 (helper P, c_check C5): the through ball's runner waits on his defender's shoulder, not past him, in
       * the last seconds (he checks his run: the legs' own rule, as the ring round the nearest man) */
      if (P4 && !PBRK.shoulder && clW && clW.onside && clW.onside.R !== KE2.holder && bp[clW.onside.R] && bp[clW.onside.D] && t > dur - MV.legKeepT) {
        var ahR = (bp[clW.onside.R].y - bp[clW.onside.D].y) * clW.onside.dir, vR = cmd[clW.onside.R].y * clW.onside.dir - bv[clW.onside.D].y * clW.onside.dir;
        var allowR = Math.sqrt(2 * 0.7 * MV.legA * Math.max(0, -0.2 - ahR));
        if (ahR > -0.2) cmd[clW.onside.R].y -= clW.onside.dir * (ahR + 0.2) * 3;
        else if (vR > allowR) cmd[clW.onside.R].y -= clW.onside.dir * (vR - allowR);
      }
      /* kmtree5 a4: "X is through on his own": the men of the other side in his lane and goal-side of him drop off it,
       * behind him or out of the lane, in the last MV.legKeepT s */
      if (clW && clW.through && bp[clW.through.id] && t > dur - MV.legKeepT) {
        var aT = bp[clW.through.id], dT = clW.through.dir;
        ids.forEach(function (q) {
          var w9 = who[q]; if (!w9 || w9.keeper || w9.team === clW.through.team) return;
          var e9 = bp[q], ah = (e9.y - aT.y) * dT, dxT = e9.x - aT.x; if (ah <= -1 || Math.abs(dxT) > 12 || P.dist(e9, aT) > 24) return;
          var sx = dxT >= 0 ? 1 : -1, needX = 11 - Math.abs(dxT);
          if (needX > 0) cmd[q].x += sx * needX * 2.0;
        });
      }
      /* "X is unmarked / free / alone": nobody of the other side within a stride and a half of him */
      if (clW && clW.free.length && t > dur - MV.legKeepT) clW.free.forEach(function (fr9) {
        var a9 = bp[fr9.id]; if (!a9) return;
        ids.forEach(function (q) {
          if (who[q].team === fr9.team) return;
          var ux = bp[q].x - a9.x, uy = bp[q].y - a9.y, ud = Math.sqrt(ux * ux + uy * uy), R9 = 4.5;
          if (ud < 1e-6 || ud > R9 + 12) return;
          ux /= ud; uy /= ud;
          var inw9 = -(cmd[q].x * ux + cmd[q].y * uy), allow8 = Math.sqrt(2 * 0.7 * MV.legA * Math.max(0, ud - R9));
          if (ud < R9) { cmd[q].x += ux * (R9 - ud) * 2; cmd[q].y += uy * (R9 - ud) * 2; }
          else if (inw9 > allow8) { cmd[q].x += ux * (inw9 - allow8); cmd[q].y += uy * (inw9 - allow8); }
        });
      });
      ids.forEach(function (q) {
        var vx = cmd[q].x, vy = cmd[q].y, am = cmd[q].am, vs2 = Math.sqrt(vx * vx + vy * vy);
        if (vs2 > cmd[q].top) { vx *= cmd[q].top / vs2; vy *= cmd[q].top / vs2; }   /* (the stepping aside never makes him faster than his legs) */
        /* the lines: he slows before a touchline or a goal line rather than hitting it */
        var wx0 = bp[q].x - 0.6, wx1 = P.W - 0.6 - bp[q].x, wy0 = bp[q].y - 0.6, wy1 = P.L - 0.6 - bp[q].y;
        if (vx < 0) vx = -Math.min(-vx, Math.sqrt(am * Math.max(0, wx0))); else vx = Math.min(vx, Math.sqrt(am * Math.max(0, wx1)));
        if (vy < 0) vy = -Math.min(-vy, Math.sqrt(am * Math.max(0, wy0))); else vy = Math.min(vy, Math.sqrt(am * Math.max(0, wy1)));
        var ax = vx - bv[q].x, ay = vy - bv[q].y, as = Math.sqrt(ax * ax + ay * ay), lim = am * hh;
        if (as > lim) { ax *= lim / as; ay *= lim / as; }
        bv[q] = { x: bv[q].x + ax, y: bv[q].y + ay };
        var nx = P.clamp(bp[q].x + bv[q].x * hh, 0.6, P.W - 0.6), ny = P.clamp(bp[q].y + bv[q].y * hh, 0.6, P.L - 0.6);
        if (nx !== bp[q].x + bv[q].x * hh) bv[q].x = (nx - bp[q].x) / hh;   /* (a touchline stops him) */
        if (ny !== bp[q].y + bv[q].y * hh) bv[q].y = (ny - bp[q].y) / hh;
        bp[q] = { x: nx, y: ny };
        row[q] = bp[q];
      });
      body.push(row);
    }
    /* the ball goes with the men: at each key frame, the man who has it is where his legs got him */
    K.forEach(function (k) { if (!k.pos0) k.pos0 = k.pos; });   /* (the plan's places, kept: the last key's are replaced below) */
    var offK = K.map(function (k, j) {
      if (j === 0) return { x: 0, y: 0 };
      var ix = Math.max(0, Math.min(n, Math.round(k.t / h))), hq = k.holder, pq = hq && k.pos0[hq];
      /* kmtree5 a4 (helper P, notes 14 and 16): a ball nobody has (a cross, a long ball, a clearance) goes to the man
       * who strikes it next, where his legs have got him, as a ball at a man's feet does */
      if (B[j - 1] && B[j - 1].fixedBall) return { x: 0, y: 0 };
      if (!hq && P4 && !PBRK.ghost && B[j] && FLIGHT[B[j].kind] && B[j].kind !== 'shot' && B[j].from && k.pos0[B[j].from] && body[ix][B[j].from]) {
        /* (at his feet or his head, where the plan's ball is from him, at most a ball's width off: never a ball struck from 4 m) */
        var gq = body[ix][B[j].from], gp = k.pos0[B[j].from], gb = k.ball0 || k.ball, gx = gb.x - gp.x, gy = gb.y - gp.y, gl = Math.sqrt(gx * gx + gy * gy), gs = gl > P.BALL_OFF ? P.BALL_OFF / gl : 1;
        var ox = gq.x + gx * gs - gb.x, oy = gq.y + gy * gs - gb.y;
        /* (the pass before it keeps its direction, as its words say it: a ball played back is not drawn going forward to
         * him, nor a ball played forward drawn going back; then he is short of it along the pitch, and waits for it) */
        var pB = B[j - 1], pK = K[j - 1], pa = pK && (pK.ball0 || pK.ball);
        if (pB && pa && FLIGHT[pB.kind] && !pB.drop) { var dP = pB.team === 'them' ? -1 : 1, gP = (gb.y - pa.y) * dP, gN = (gb.y + oy - pa.y) * dP; if ((gP <= 0 && gN > 0) || (gP > 0 && gN <= 0)) oy = 0;
          /* (a cross into the box comes down in the box: never drawn landing outside it) */
          if (pB.note === 'cross') { var gl9 = pB.team === 'them' ? 0 : P.L, inB = Math.abs(gb.y - gl9) <= 16; if (inB && Math.abs(gb.y + oy - gl9) > 16) oy = (gl9 - dP * 16) - gb.y; if (inB && (gb.x + ox < 14.3 || gb.x + ox > 53.7)) ox = P.clamp(gb.x + ox, 14.3, 53.7) - gb.x; } }
        return { x: ox, y: oy };
      }
      if (!hq || !body[ix][hq] || !pq) return { x: 0, y: 0 };
      if ((!midK || tc2) && cutT8 != null && k.t >= cutT8 - 1e-6) return { x: 0, y: 0 };
      if (midK && j === midK) return { x: 0, y: 0 };
      return { x: body[ix][hq].x - pq.x, y: body[ix][hq].y - pq.y };
    });
    /* kmtree5 a4 (helper P): a cross the plan lands in the box is drawn landing in the box, wherever the legs got its man */
    if (P4) K.forEach(function (k, j) {
      var pB = B[j - 1]; if (!pB || pB.note !== 'cross' || !offK[j]) return;
      var gb = k.ball0 || k.ball, gl9 = pB.team === 'them' ? 0 : P.L, dP = pB.team === 'them' ? -1 : 1;
      if (Math.abs(gb.y - gl9) > 16 || gb.x < 14.3 || gb.x > 53.7) return;
      var ny = gb.y + offK[j].y, nx = gb.x + offK[j].x;
      if (Math.abs(ny - gl9) > 16) offK[j].y = (gl9 - dP * 16) - gb.y;
      if (nx < 14.3 || nx > 53.7) offK[j].x = P.clamp(nx, 14.3, 53.7) - gb.x;
    });
    var lb = B[B.length - 1], dead = !!(lb && (lb.kind === 'out' || lb.kind === 'foul'));
    if (dead) offK[K.length - 1] = { x: 0, y: 0 };   /* (the restart's ball is placed, by the cut) */
    K.forEach(function (k, j) {
      if (!k.ball0) k.ball0 = { x: k.ball.x, y: k.ball.y, z: k.ball.z || 0 };
      k.ball = { x: k.ball0.x + offK[j].x, y: k.ball0.y + offK[j].y, z: k.ball0.z || 0 };
    });
    /* kept small: one Float32Array for the whole segment (the page and the checks keep many segments alive) */
    var m9 = ids.length, buf = new Float32Array((n + 1) * m9 * 2), idx = {};
    ids.forEach(function (q, j) { idx[q] = j; });
    for (i = 0; i <= n; i++) { var row9 = body[i]; for (var j9 = 0; j9 < m9; j9++) { var r9 = row9[ids[j9]]; buf[(i * m9 + j9) * 2] = r9.x; buf[(i * m9 + j9) * 2 + 1] = r9.y; } }
    c.buf = buf; c.idx = idx; c.m = m9; c.frames = null; c.act = null; c.legs = true;
    if (MV.keepWant) { c.frames = body; c.feet = feet; }
    if (MV.keepWant) c.want = out;   /* (checks and probes only: the wanted picture, beside the legs') */
    c.lag = offK.reduce(function (a, o) { return Math.max(a, Math.sqrt(o.x * o.x + o.y * o.y)); }, 0);
    /* the end picture is the one on the screen (a dead ball's restart picture stays: the page cuts to it) */
    if (!dead && (cutT8 == null || midK)) {
      var KL = K[K.length - 1], np = copyPos(KL.pos), vel = {};
      ids.forEach(function (q) { np[q] = { x: bp[q].x, y: bp[q].y }; vel[q] = { x: bv[q].x, y: bv[q].y }; });
      KL.pos = np;
      if (SETTLED) SETTLED.set(seg, copyPos(np));
      if (seg.end && seg.end.pos && !seg.end.kickoff) {
        ids.forEach(function (q) { seg.end.pos[q] = { x: bp[q].x, y: bp[q].y }; });
        seg.end.vel = vel;
        if (seg.end.ball) seg.end.ball = { x: KL.ball.x, y: KL.ball.y, z: seg.end.ball.z || 0 };
      }
    }
    c.kball = K.map(function (k) { return k.ball; }); c.endBall = seg.end && seg.end.ball; c.vel = seg.end && seg.end.vel;
    c.sig = sigOf(seg);
  }
  /* a2 (helper M): THE WORDS' CLAIMS ON THE PICTURE. The scene the decision is read from says things the picture
   * must show: "X is the nearest of their players to him", "X, your full-back, is the only one of your players on
   * that wing in front of him", "X is unmarked / free / alone". why1's and r3's staging make the PLANNED end
   * picture say them (called here, before the legs), and the legs keep them: the men they concern run for their
   * places in time, everyone else of the side stays out of the ring or the wing the words forbid in the last
   * MV.legKeepT s, and the play waits (settle) while a claim does not hold. The page's own staging afterwards then
   * finds nothing to move. */
  var CLAIMS = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function stageLibs() {
    var ws = root.KMWhyStage, r3 = root.KMR3Stage;
    try { if (!ws && typeof require === 'function') ws = require('./whystage.js'); if (!r3 && typeof require === 'function') r3 = require('./r3stage.js'); } catch (e) { }
    return { WS: ws || null, R3: r3 || null };
  }
  var FREE_RE = /([A-Z][^ .,:;]*) (?:is unmarked|is free\b|is alone|is on his own|has the ball, and nobody has gone with)|nobody has gone with ([A-Z][^ .,:;]*)/g;
  function prepClaims(st, pend, seg) {
    if (!CLAIMS || !pend || !seg || !seg.end || !seg.end.pos) return;
    var L = stageLibs(), cl = { near: null, wing: null, free: [] };
    try { if (L.WS) L.WS.apply(st, pend, seg); if (L.R3) L.R3.apply(st, pend, seg); } catch (e) { }
    if (L.R3) {
      var nc = L.R3.nearClaim(st, pend), wc = L.R3.wingClaim(st, pend);
      if (nc && seg.end.pos[nc.N.id] && seg.end.pos[nc.target.id]) cl.near = { N: nc.N.id, T: nc.target.id, team: nc.team };
      if (wc && seg.end.pos[wc.front.id] && seg.end.pos[wc.holderId]) cl.wing = { F: wc.front.id, H: wc.holderId, dir: P.teamOf(st, P.byId(st, wc.holderId)) === 'them' ? -1 : 1 };
    }
    var txt = String((pend.moment && pend.moment.text) || ''), m;
    /* kmtree5 a4 (helper P, review F8): a man the last result left unmarked ("Yamal arrives unmarked: +2 to his shot",
     * a carried grant) is drawn unmarked: nobody of the other side within 3 m of him (the same claim as the scene's "is
     * unmarked": the play waits for it and the legs keep them off him). KM_PBREAK=unmarked: a3's picture. */
    if (P4 && !PBRK.unmarked) (pend.carried || []).forEach(function (c) { if (!c || c.id !== 'unmarked') return; var nmU = /^([^ .,:;]+) arrives unmarked/.exec(String(c.text || '')), manU = nmU ? P.byFirst(st, nmU[1], null) : null; if (manU && seg.end.pos[manU.id] && !cl.free.some(function (f) { return f.id === manU.id; })) cl.free.push({ id: manU.id, team: P.teamOf(st, manU) }); });
    if (!/\bfree kick\b/i.test(txt)) { FREE_RE.lastIndex = 0; while ((m = FREE_RE.exec(txt))) { var man = P.byFirst(st, m[1] || m[2], null); if (man && seg.end.pos[man.id]) cl.free.push({ id: man.id, team: P.teamOf(st, man) }); } }
    /* kmtree5 a3 (helper C): the keeper's short pass says how far their nearest man stands from its receiver: the play
     * waits (within MV.legWaitClaims) until he is there */
    if (C3 && C3BRK !== 'gap') (pend.moment.options || []).forEach(function (o) { if (o.id === 'KEEPER_SHORT' && o.pressGap != null && o.to && seg.end.pos[o.to.id]) cl.gap = { R: o.to.id, gap: o.pressGap, team: P.teamOf(st, o.to) === 'you' ? 'them' : 'you' }; });
    /* and their Sweeper keeper is out of his box before the long shot is read (Z_SHOOT_FAR's +3) */
    if (C3 && C3BRK !== 'keeperin') (pend.moment.options || []).forEach(function (o) { if (o.id === 'Z_SHOOT_FAR' && !o.hide && o.cStage && o.cStage.keeperOut && seg.end.pos[o.cStage.keeperOut]) cl.kout = { K: o.cStage.keeperOut, dir: P.teamOf(st, P.byId(st, o.cStage.keeperOut)) === 'them' ? 1 : -1 }; });
    /* and a long shot on the menu is read with the shooter where its card says (within 4 m of its metres) */
    if (C3 && C3BRK !== 'shotspot') (pend.moment.options || []).forEach(function (o) { if ((o.id === 'Z_SHOOT_FAR' || o.id === 'Z_SHOOT_EDGE') && !o.hide && o.actor && o.cStage && o.cStage.shotMetres && seg.end.pos[o.actor.id] && !cl.shot) cl.shot = { H: o.actor.id, m: o.cStage.shotMetres, g: P.teamOf(st, o.actor) === 'them' ? { x: 34, y: 0 } : { x: 34, y: P.L } }; });
    /* and the pass back with its +3 has its receiver behind the man on the ball */
    if (C3 && C3BRK !== 'backalways') (pend.moment.options || []).forEach(function (o) { if (o.id === 'Z_RECYCLE' && !o.hide && o.to && o.actor && o.cStage && o.cStage.back && seg.end.pos[o.to.id] && seg.end.pos[o.actor.id]) cl.back = { R: o.to.id, H: o.actor.id, dir: P.teamOf(st, o.actor) === 'them' ? -1 : 1 }; });
    /* and the through ball's runner waits on his defender's shoulder, not past him */
    if (C3 && C3BRK !== 'runner') (pend.moment.options || []).forEach(function (o) { if (thruCard(o) && !o.disabled && o.cStage && seg.end.pos[o.cStage.through] && seg.end.pos[o.cStage.past]) cl.onside = { R: o.cStage.through, D: o.cStage.past, dir: P.teamOf(st, P.byId(st, o.cStage.through)) === 'them' ? -1 : 1 }; });
    /* kmtree5 a4 (helper P): "X is through on his own": nobody of the other side goal-side of him in his lane (10 m to
     * either side, within 22 m; cohcheck through_on_own_goalside) */
    if (P4 && !PBRK.through) { var thm = /([^ .,:;]+) is through on his own/.exec(txt), thM = thm ? P.byFirst(st, thm[1], null) : null; if (thM && seg.end.pos[thM.id]) cl.through = { id: thM.id, team: P.teamOf(st, thM), dir: P.teamOf(st, thM) === 'them' ? -1 : 1 }; }
    /* kmtree5 a4 (helper P): the man a live cross or cut-back card is for is in the attacking area (more than 72 m up) */
    if (P4) (pend.moment.options || []).forEach(function (o) {
      var rc = o.receiver || o.to;
      if (o.disabled || !rc || !seg.end.pos[rc.id] || !/\b(cut[s ]?back|cross(?:es)? it|low cross)\b/i.test(String(o.label || '')) || String(o.label).indexOf('for ' + first(rc)) < 0) return;
      (cl.recv = cl.recv || []).push({ id: rc.id, dir: P.teamOf(st, rc) === 'them' ? -1 : 1 });
    });
    cl.st = st; cl.pend = pend;
    CLAIMS.set(seg, cl);
  }
  /* the zone words use for where the ball is: in either box, within 25 m of either goal line, or neither */
  function zoneOf(b) { var inX = b.x >= 13.84 && b.x <= 54.16; if (b.y >= P.L - 16.5 && inX) return 'boxT'; if (b.y <= 16.5 && inX) return 'boxB'; if (b.y >= P.L - 25) return 'edgeT'; if (b.y <= 25) return 'edgeB'; return 'out'; }
  /* the stagers' own judgement, on a copy: would why1 or r3 move anyone in this end picture? */
  function stagersQuiet(cl, E, ball) {
    var L = stageLibs(); if (!cl || !cl.st || !cl.pend) return true;
    var pos = {}, kp = {}; for (var q in E) if (E[q]) { pos[q] = { x: E[q].x, y: E[q].y }; kp[q] = pos[q]; }
    var fake = { end: { pos: pos, ball: ball }, keys: [{ pos: kp }] }, moved = false;
    try {
      var w = L.WS ? L.WS.apply(cl.st, cl.pend, fake) : null, r = L.R3 ? L.R3.apply(cl.st, cl.pend, fake) : null;
      if (w && w.moved && w.moved.length) moved = true;
      if (r && (r.near === 'moved' || r.wing === 'moved')) moved = true;
    } catch (e) { }
    return !moved;
  }
  /* does the picture E (id -> {x, y}) keep the words' claims? who[] gives the teams */
  function claimsHold(cl, E, who) {
    if (!cl) return true;
    if (cl.near && E[cl.N] && E[cl.T]) {
      var dN = P.dist(E[cl.N], E[cl.T]);
      for (var q in E) { var w = who[q]; if (!w || q === cl.N || q === cl.T || w.team !== cl.near.team) continue; if (P.dist(E[q], E[cl.T]) < dN + 0.8) return false; }   /* (0.8: r3's own margin, 0.6, and a little: so the page's staging then finds nothing to move) */
    }
    if (cl.wing && E[cl.wing.H]) {
      var hq = E[cl.wing.H], ln = P.laneOfX(hq.x);
      if (ln !== 1) for (var q2 in E) { var w2 = who[q2]; if (!w2 || w2.team !== 'you' || w2.keeper || q2 === cl.wing.F) continue; var e2 = E[q2]; if (P.laneOfX(e2.x) === ln && (e2.y - hq.y) * cl.wing.dir > 0 && P.dist(e2, hq) < 30) return false; }
    }
    if (cl.shot && E[cl.shot.H] && Math.abs(P.dist(E[cl.shot.H], cl.shot.g) - cl.shot.m) > 4) return false;
    if (cl.back && E[cl.back.R] && E[cl.back.H] && (E[cl.back.R].y - E[cl.back.H].y) * cl.back.dir > -2) return false;
    if (cl.kout && E[cl.kout.K] && (cl.kout.dir > 0 ? E[cl.kout.K].y > P.L - 17 : E[cl.kout.K].y < 17)) return false;
    if (cl.onside && E[cl.onside.R] && E[cl.onside.D] && (E[cl.onside.R].y - E[cl.onside.D].y) * cl.onside.dir > 0.5) return false;
    if (cl.gap && E[cl.gap.R]) { var ng = 99; for (var qg in E) { var wg = who[qg]; if (wg && wg.team === cl.gap.team && !wg.keeper && E[qg]) ng = Math.min(ng, P.dist(E[qg], E[cl.gap.R])); } if (ng > cl.gap.gap + 1.5 || ng < cl.gap.gap - 1) return false; }
    if (cl.recv) for (var rv = 0; rv < cl.recv.length; rv++) { var er = E[cl.recv[rv].id]; if (er && (cl.recv[rv].dir > 0 ? er.y <= 71 : er.y >= 34)) return false; }
    if (cl.through && E[cl.through.id]) { var ta = E[cl.through.id]; for (var qt in E) { var wt = who[qt]; if (!wt || wt.keeper || wt.team === cl.through.team || !E[qt]) continue; var et = E[qt]; if ((et.y - ta.y) * cl.through.dir > 0 && Math.abs(et.x - ta.x) < 10.5 && P.dist(et, ta) < 22.5) return false; } }
    for (var f = 0; f < cl.free.length; f++) { var fr = cl.free[f], a = E[fr.id]; if (!a) continue; for (var q3 in E) { var w3 = who[q3]; if (w3 && w3.team !== fr.team && P.dist(E[q3], a) < 3.2) return false; } }
    return true;
  }
  /* a2: where the legs have a man at sample i of a track ({x, y}, or null) */
  function posAt(c, i, id) {
    if (!c.buf) return c.frames && c.frames[i] ? c.frames[i][id] || null : null;
    var j = c.idx[id]; if (j == null) return null;
    var o = (i * c.m + j) * 2; return { x: c.buf[o], y: c.buf[o + 1] };
  }
  /* a2: make a segment's pictures final (the legs' end picture): the page and the words can read seg.end at once.
   * AND THE PLAY WAITS FOR THE MAN THE NEXT DECISION IS ABOUT: when he is not on the ball's spot on his legs at
   * the end (more than MV.legLagOk from the plan's place), the last beat takes longer, by about what his legs
   * need (MV.legWaitEnd s at most in all), and the legs are run again (up to 6 times). Earlier in the play the
   * ball simply goes where its men are (legs(): the key frames' ball follows the man who has it). Only here, when the segment is made: a later
   * re-run (why1's or r3's staging moving a man in the end picture) never changes a time the page has read. */
  function settle(seg) {
    if (!moveOn()) return seg;
    /* kmtree5 a4 (helper P, note 2): what is left of the play's waits (MV.waitCap s, the plan's wait for its last pass included) */
    function waitLeft() { return MV.waitCap - (seg.waitBuild || 0) * (seg.scale || 1) - (seg.waitAll || 0); }
    for (var it = 0; it < 16; it++) {
      var c = track(seg); if (!c || !c.legs) break;
      var K = seg.keys, B = seg.beats, fix = -1, add = 0;
      /* A SHOT OR A HEADER IS STRUCK WHERE THE CARD AND ITS ARROW PUT IT (review of the movement, item 3: "Leon
       * crosses it for Ross to head" drawn as a header 22 m out, because the cross flew to where Ross's legs had got
       * him): the man who strikes it is on the plan's spot when the ball reaches him; the ball waits for him
       * (MV.legWaitShot s at most in a segment) */
      if (!BRK.noshotwait) for (var ks = 1; ks < K.length - 1 && fix < 0; ks++) {
        var bS9 = B[ks], hS = K[ks].holder;
        if (!bS9 || bS9.kind !== 'shot' || !hS || bS9.from !== hS || (seg.waitedShot || 0) >= MV.legWaitShot) continue;
        var ixS9 = Math.min(c.n, Math.round(K[ks].t / c.h)), bq9 = posAt(c, ixS9, hS), pq9 = K[ks].pos0 && K[ks].pos0[hS];
        if (!bq9 || !pq9) continue;
        var lagS = P.dist(bq9, pq9);
        if (lagS > MV.legLagOk) { fix = ks; add = Math.min(MV.legWaitShot - (seg.waitedShot || 0), legTime(lagS) * 0.8 + 0.1); seg.waitedShot = (seg.waitedShot || 0) + add; }
      }
      /* A FREE KICK IS TAKEN WHERE THE FOUL IS DRAWN (review of the movement, item 7): when the play ends with a foul
       * (the page cuts to the free-kick picture at the whistle), the man fouled is on the plan's spot when it happens:
       * the beat that brings him there waits for his legs (within the same MV.legWaitEnd) */
      var lbF = B[B.length - 1], kc = B.length - 1;
      if (fix < 0 && !BRK.nowait && !BRK.nowait2 && lbF && lbF.kind === 'foul' && lbF.note !== 'offside' && kc >= 1 && K[kc].holder && (seg.waitedFoul || 0) < MV.legWaitFoul) {
        var kW = kc, hF = K[kc].holder, cB = B[kc - 1];
        /* (a run with the ball before the foul: first the pass that gave it to him waits, so he starts the run on the plan) */
        if (cB && (cB.kind === 'carry' || cB.kind === 'dribble') && cB.from === hF && kc >= 2 && K[kc - 1].holder === hF && B[kc - 2] && PASSY[B[kc - 2].kind]) {
          var ixP = Math.min(c.n, Math.round(K[kc - 1].t / c.h)), bP = posAt(c, ixP, hF), pP = K[kc - 1].pos0 && K[kc - 1].pos0[hF];
          if (bP && pP && P.dist(bP, pP) > MV.legLagOk) kW = kc - 1;
        }
        var ixF = Math.min(c.n, Math.round(K[kW].t / c.h)) - (kW === kc ? 1 : 0), bF = posAt(c, Math.max(0, ixF), hF), pF = K[kW].pos0 && K[kW].pos0[hF];
        if (bF && pF && P.dist(bF, pF) > MV.legLagOk) { fix = kW; add = Math.min(MV.legWaitFoul - (seg.waitedFoul || 0), legTime(P.dist(bF, pF)) * 0.8 + 0.1); seg.waitedFoul = (seg.waitedFoul || 0) + add; }
        /* kmtree5 a4 (helper P, note 11): and the fouler is on his spot beside him at the whistle */
        var fO = P4 && !PBRK.foul && B[kc - 1] && B[kc - 1].fouler;
        if (fix < 0 && fO) {
          var ixO = Math.min(c.n, Math.round(K[kc].t / c.h)) - 1, bO = posAt(c, Math.max(0, ixO), fO), pO = K[kc].pos0 && K[kc].pos0[fO];
          /* kmtree5 a8 (helper K, switch `foulwait`): the play waits for the fouler only while he is more than 2.2 m from his
           * spot beside the man he fouls (a8: 1.0 m). track() has a man run for a pinned place only when it asks a jog of
           * him or in its last half second, so a fouler 3 m away drifted, came 1.5 to 2.5 m short, and every wait added
           * here gave him the same drift again: the man on the ball stood up to 6 s (legWaitFoul). At 2.2 m short the
           * two chips touch (a chip is 1.6 m in radius): the whistle goes then. */
          if (bO && pO && P.dist(bO, pO) > (K8.foulwait ? 2.2 : MV.legLagOk)) { fix = kc; add = Math.min(MV.legWaitFoul - (seg.waitedFoul || 0), legTime(P.dist(bO, pO)) * 0.8 + 0.1); seg.waitedFoul = (seg.waitedFoul || 0) + add; }
        }
      }
      /* kmtree5 a4 (helper P, notes 14 and 16): A BALL NOBODY HAS IS STRUCK BY A MAN WHO IS THERE. A clearance, a header
       * away or a ball struck first time, where no man had it: the man who strikes it is on his (anchored) spot when it
       * gets there; else the ball before it waits for him, before it is struck (MV.legWaitKick s at most in a segment) */
      if (P4 && !PBRK.ghost && fix < 0) for (var kg = 1; kg < K.length - 1 && fix < 0; kg++) {
        var bG = B[kg]; if (!bG || !FLIGHT[bG.kind] || bG.kind === 'shot' || !bG.from || K[kg].holder || (seg.waitedKick || 0) >= MV.legWaitKick) continue;
        var ixG = Math.min(c.n, Math.round(K[kg].t / c.h)), bqG = posAt(c, ixG, bG.from), pqG = K[kg].pos0 && K[kg].pos0[bG.from];
        if (!bqG || !pqG) continue;
        var lagG = P.dist(bqG, pqG);
        if (lagG > MV.legLagOk) { fix = kg; add = Math.min(MV.legWaitKick - (seg.waitedKick || 0), legTime(lagG) * 0.8 + 0.1); seg.waitedKick = (seg.waitedKick || 0) + add; }
      }
      /* kmtree5 a4 (helper P): a cut-back is played from where the run to the goal line ends: the run takes as long as
       * his legs need to get there (claimscheck card.cutback3, c_check C2; MV.legWaitCut s at most) */
      if (P4 && !PBRK.cutrun && fix < 0) for (var kc9 = 1; kc9 < K.length - 1 && fix < 0; kc9++) {
        var bc9 = B[kc9], br9 = B[kc9 - 1];
        if (!bc9 || bc9.note !== 'cut-back' || !br9 || (br9.kind !== 'carry' && br9.kind !== 'dribble') || br9.from !== bc9.from || (seg.waitedCut || 0) >= MV.legWaitCut) continue;
        var ixC = Math.min(c.n, Math.round(K[kc9].t / c.h)), bqC = posAt(c, ixC, bc9.from), pqC = K[kc9].pos0 && K[kc9].pos0[bc9.from];
        if (bqC && pqC && P.dist(bqC, pqC) > MV.legLagOk) { fix = kc9; add = Math.min(MV.legWaitCut - (seg.waitedCut || 0), legTime(P.dist(bqC, pqC)) * 0.8 + 0.1); seg.waitedCut = (seg.waitedCut || 0) + add; }
      }
      if (P4 && !PBRK.cutrun && fix < 0) for (var kw9 = 1; kw9 < K.length && fix < 0; kw9++) {
        var bw9 = B[kw9 - 1]; if (!bw9 || !bw9.waitMan || !K[kw9].holder || (seg.waitedCut || 0) >= MV.legWaitCut) continue;
        var ixW = Math.min(c.n, Math.round(K[kw9].t / c.h)), bqW = posAt(c, ixW, K[kw9].holder), pqW = K[kw9].pos0 && K[kw9].pos0[K[kw9].holder];
        if (bqW && pqW && P.dist(bqW, pqW) > MV.legLagOk) { fix = kw9; add = Math.min(MV.legWaitCut - (seg.waitedCut || 0), legTime(P.dist(bqW, pqW)) * 0.8 + 0.1); seg.waitedCut = (seg.waitedCut || 0) + add; }
      }
      if (fix >= 0) { shiftFrom(fix, add, false); continue; }
      /* (when the play ends with him running with the ball, it is the pass that gave it to him that waits: he then
       * runs his carry from the plan's spot) */
      var kFirst = K.length - 1, lbS = B[B.length - 1], softW = false;
      if (lbS && (lbS.kind === 'carry' || lbS.kind === 'dribble') && K.length > 2 && K[K.length - 2].holder === lbS.from && B[B.length - 2] && PASSY[B[B.length - 2].kind]) {
        var ixS = Math.min(c.n, Math.round(K[K.length - 2].t / c.h)), bS = posAt(c, ixS, lbS.from), pS = K[K.length - 2].pos0 && K[K.length - 2].pos0[lbS.from];
        if (bS && pS && P.dist(bS, pS) > MV.legLagOk && !past8(lbS.from, bS, pS)) kFirst = K.length - 2;   /* (kmtree5 a8, helper K, switch `settle`: not when he has already run past it) */
      }
      for (var k = kFirst; k < K.length; k++) {   /* (only at the end: the man the next decision is about must be on the ball the engine names; before that, the ball goes where its men are) */
        var b = B[k - 1], hq = K[k].holder;
        if (!hq || !b || b.kind === 'out' || b.kind === 'foul') continue;   /* (a shot with a man on it at the end: a header knocked down to him) */
        var ix = Math.min(c.n, Math.round(K[k].t / c.h)), bq = posAt(c, ix, hq), pq = K[k].pos0 && K[k].pos0[hq];
        if (!bq || !pq) continue;
        /* he ran past his place, toward the goal he attacks, with the ball at his feet: the run takes a little longer, so
         * he can pull up and come back to it (MV.legWaitOver s at most; a1 would have drawn him there at once) */
        var wH = SEGST.get(seg) && SEGST.get(seg)[hq], dirH = wH && wH.team === 'them' ? -1 : 1;
        if (k === K.length - 1 && (b.kind === 'carry' || b.kind === 'dribble') && (bq.y - pq.y) * dirH > MV.legLagOk && (seg.waitedOver || 0) < MV.legWaitOver) {
          fix = k; add = Math.min(MV.legWaitOver - (seg.waitedOver || 0), 0.5); seg.waitedOver = (seg.waitedOver || 0) + add; break;
        }
        if ((seg.waited || 0) - (seg.waitedClaims || 0) >= (P4 ? MV.legWaitEnd4 : MV.legWaitEnd)) continue;   /* (kmtree5 a4: 3 s, mvcheck2 V7) */
        var lag = P.dist(bq, pq);
        if (k < K.length - 1 && past8(hq, bq, pq)) continue;   /* (kmtree5 a8, helper K, switch `settle`) */
        /* and nobody of the other side nearer the man on the ball than the man the words name as the nearest */
        var Sx = seg.start, nm = Sx && Sx.near ? Sx.near.id : null, cx9 = Sx && Sx.crossTo ? Sx.crossTo.id : null;
        if (nm && bq && k === K.length - 1) {
          var dn = posAt(c, ix, nm), tmn = SEGST.get(seg) && SEGST.get(seg)[nm] ? SEGST.get(seg)[nm].team : null;
          if (dn && tmn) { var dN = P.dist(dn, bq); for (var qq in c.idx) { var wq = SEGST.get(seg)[qq]; if (!wq || qq === nm || wq.keeper || wq.team !== tmn) continue; var bo = posAt(c, ix, qq); if (bo && P.dist(bo, bq) < dN + 0.5) lag = Math.max(lag, 2 * MV.legLagOk); } }
        }
        var cl9 = CLAIMS && CLAIMS.get(seg), E9 = {}, W9 = SEGST.get(seg) || {}, forClaim = false;
        var wcl9 = MV.legWaitClaims + (cl9 && (cl9.onside || cl9.back || (P4 && !PBRK.gapwait && cl9.gap)) ? 1.3 : 0);   /* (kmtree5 a4: and the keeper's short pass, whose press gap the odds use: c_check C4) */   /* (kmtree5 a3, helper C: a through ball's runner, or a pass back's receiver, may take 1.3 s more to get where the card needs him) */
        if (k === K.length - 1 && lag <= MV.legLagOk && cl9 && (seg.waitedClaims || 0) < wcl9) { for (var q9 in c.idx) E9[q9] = posAt(c, ix, q9); if (!claimsHold(cl9, E9, W9) || !stagersQuiet(cl9, E9, K[k].ball)) { lag = 2 * MV.legLagOk; forClaim = true; } }
        /* kmtree5 a4 (helper P, note 2): a wait only for the man to get the last metres onto his spot (at most
         * MV.softMiss m short, the ball staying in the same part of the pitch, no claim of the words at stake) is
         * within the play's cap; a wait the moment's picture needs (further, or another part of the pitch) is not */
        var bb9 = K[k].ball0 || K[k].ball, eb9 = bq && pq ? { x: bb9.x + bq.x - pq.x, y: bb9.y + bq.y - pq.y } : bb9;
        softW = !forClaim && bq && pq && P.dist(bq, pq) <= MV.softMiss && lag === P.dist(bq, pq) && zoneOf(eb9) === zoneOf(bb9) && (eb9.y < P.L / 2) === (bb9.y < P.L / 2);
        if (lag > MV.legLagOk) { fix = k; add = Math.min((P4 ? MV.legWaitEnd4 : MV.legWaitEnd) - ((seg.waited || 0) - (seg.waitedClaims || 0)), forClaim ? wcl9 - (seg.waitedClaims || 0) : 9, legTime(lag) * 0.8 + 0.1); if (forClaim) seg.waitedClaims = (seg.waitedClaims || 0) + add; break; }
      }
      if (typeof process !== 'undefined' && process.env && process.env.KM_CLAIMDBG && it >= 0) {
        var clD = CLAIMS && CLAIMS.get(seg); if (clD && clD.near) { var ixD = c.n, ED = {}; for (var qD in c.idx) ED[qD] = posAt(c, ixD, qD);
          if (!claimsHold(clD, ED, SEGST.get(seg))) console.log('CLAIMDBG it', it, 'fix', fix, 'waited', (seg.waited || 0).toFixed(2), 'N', clD.near.N, 'dN', P.dist(ED[clD.near.N], ED[clD.near.T]).toFixed(1), 'plan dN', P.dist(K[K.length-1].pos0[clD.near.N], K[K.length-1].pos0[clD.near.T]).toFixed(1), Object.keys(ED).filter(function (q) { var w = SEGST.get(seg)[q]; return w && w.team === clD.near.team && !w.keeper && q !== clD.near.N; }).map(function (q) { return q + ' ' + P.dist(ED[q], ED[clD.near.T]).toFixed(1) + ' plan ' + P.dist(K[K.length-1].pos0[q], K[K.length-1].pos0[clD.near.T]).toFixed(1); }).filter(function (x) { return +x.split(' ')[1] < 14; }).join(', ')); }
      }
      if (fix < 0 || BRK.nowait) break;
      if (shiftFrom(fix, add, softW, forClaim) === false) break;
      seg.waited = (seg.waited || 0) + add;
    }
    /* kmtree5 a8 (helper K, with the lead's leave; switch `settle`): THE PLAY DOES NOT WAIT FOR A MAN WHO HAS GONE PAST.
     * When the play ends with a man running with the ball, the pass that gives it to him waited until he was on the
     * plan's spot for it. But he is the man the play ends on: track() already has him running straight for his END
     * place, so he is often beyond that spot, nearer his end place than the spot is. No wait can bring him back to
     * it: settle() added up to 3 s (legWaitEnd4) and he stayed just as far past (a8, his match, the first play: 3 s
     * of its 14.3 s). Past = nearer his end place than the plan's spot is, by 0.3 m or more: then no wait at that
     * key. The ball goes to him where he is (helper T's track), as it does everywhere before the end. */
    function past8(id, bq8, pq8) {
      if (!K8.settle) return false;
      var KL8 = seg.keys[seg.keys.length - 1], E8 = (KL8.pos0 && KL8.pos0[id]) || KL8.pos[id];
      return !!(E8 && P.dist(bq8, E8) < P.dist(pq8, E8) - 0.3);
    }
    function shiftFrom(fx, ad, capped, claim) {
      var K2 = seg.keys;
      /* kmtree5 a4 (helper P, note 2): with the cap on (?waitcap=), a wait only for the last metres is within it */
      if (P4 && capped && MV.softMiss > 0) { ad = Math.min(ad, waitLeft()); if (ad < 0.02) { seg.waitCapped = true; return false; } seg.waitAll = (seg.waitAll || 0) + ad; }
      seg.beats[fx - 1].dur += ad;
      for (var j = fx; j < K2.length; j++) K2[j].t += ad;
      seg.duration += ad;
      if (seg.events) seg.events.forEach(function (e, i) { if (i >= fx) e.t = +(e.t + ad).toFixed(3); });
      var KL = K2[K2.length - 1]; if (KL.pos0) KL.pos = KL.pos0;   /* (the plan's end picture again: the legs make the new one) */
      TRACK.delete(seg); if (SETTLED) SETTLED.delete(seg);
    }
    return seg;
  }

  /* ------------------------------------------------------------ kmtree5 a6 (helper T): THE BALL'S OWN TRACK
   * a5 drew the ball between the plan's key frames on the script's clock: eased to a stop at the end of every beat
   * (a ball that slows to 1 m/s before each touch), stretched over a beat that waits for a man (a header in the air
   * 4.75 s, a long ball 6.4 s), and sent from one man to the next in a tackle while both were metres away. Here the
   * ball is made after the legs, from where the men really are, as a list of phases:
   *   feet  it is at a man's feet (a stride ahead of him on the side he is running to; on the plan's side of him
   *         at the moments the plan pins: the end of the segment, a shot, the whistle)
   *   fly   it flies from where it is to the man who plays it next, where his legs have him WHEN IT ARRIVES, in a
   *         ball's time for the distance (tNat), nearly even on the ground and in the air (not eased to a stop)
   *   rest  nobody has it and it lies where it is
   *   tk    a tackle: it stays with the man who has it until the man who wins it is at it
   *   a5    a5's ball, unchanged (the ball dead: out of play, a foul; a save; the keeper's short-pass picture)
   * A beat longer than the ball needs: the man who has it keeps it and plays it late (a4's hold), or, when the man
   * it is for is already running ahead of the ball, plays it early into his run and he runs on with it (meet); a
   * ball nobody has at its start (a header, a first-time ball) is played at once and meets its man early, or, when
   * he cannot be there, lands short and runs on along the ground, slowing (roll).
   * Only the ball and who has it change: every man's path, every key frame and its time, seg.end and the words are
   * a5's. Sampled at the legs' rate (tr.h) and kept beside the legs' track. */
  var NOBT = false;
  function tDir(seg, id) { var w = SEGST && SEGST.get(seg); return w && w[id] && w[id].team === 'them' ? -1 : 1; }
  function tManAt(tr, id, t, dur) {
    var i0 = Math.max(0, Math.min(tr.n - 1, Math.floor(t / tr.h + 1e-9))), ta = i0 * tr.h, tb = Math.min(dur, (i0 + 1) * tr.h);
    var u = tb > ta ? Math.max(0, Math.min(1, (t - ta) / (tb - ta))) : 1, a = posAt(tr, i0, id), b = posAt(tr, i0 + 1, id);
    if (!a || !b) return a || b || null;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  }
  /* a ball's time for a distance (s): on the ground a5's passDur (10 m in 0.6 s, 25 m in 1.1 s); in the air slower
   * (30 m in 1.9 s, 60 m in 3.4 s, never over 3.45 s); a header short of 25 m slower still */
  function tNat(d, air, head) { return air ? (head && d < 25 ? 0.35 + d / 15 : Math.min(3.45, 0.5 + d / 21)) : passDur(d); }
  /* the least time a ball may take (s): never drawn faster than about 30 m/s at its quickest */
  function tFast(d, air) { return air ? 0.25 + d / 27 : 0.15 + d / 30; }
  function tAiry(b, len) { return !!(len > 26 || AIRY[b.note]); }
  function tSmooth(u) { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); }
  var T_MEET = { 'long ball': 1, 'switch of play': 1, 'keeper throw': 1, 'in the air': 1 };   /* (and a pass with no note) */
  /* kmtree5 a7 (helper T2): a picture that starts with the ball in the air, 2.1 to 5.2 m from the man who has it (q0:
   * where he is then). The way it was going (d) is the ball's own velocity at the end of the picture before (ENDB6,
   * kept when that picture's ball was made), or, when that is not known, the line from him to it (the play before
   * ends with the ball flying past him). Where it comes down: a metre on. Or null. */
  var ENDB6 = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function tAirSpot(seg, q0) {
    var K = seg.keys, st = FROMV && FROMV.get(seg), z0 = K[0].ball.z || (st && st.ball && st.ball.z) || 0;
    if (!(z0 > 0) || !q0) return null;
    var dx = K[0].ball.x - q0.x, dy = K[0].ball.y - q0.y, d0 = Math.sqrt(dx * dx + dy * dy);
    if (d0 <= P.BALL_OFF + 0.5 || d0 > 5.2) return null;
    var vE = st && ENDB6 ? ENDB6.get(st) : null, vl = vE ? Math.sqrt(vE.x * vE.x + vE.y * vE.y) : 0, ux = dx / d0, uy = dy / d0;
    if (vl >= 3) { ux = vE.x / vl; uy = vE.y / vl; }
    return { x: Math.max(0.5, Math.min(P.W - 0.5, K[0].ball.x + ux)), y: Math.max(0.5, Math.min(P.L - 0.5, K[0].ball.y + uy)), z0: z0, d: { x: ux, y: uy }, d0: d0, v: vl >= 3 ? vl : 14 };
  }
  function tBallPlan(seg, tr) {
    var K = seg.keys, B = seg.beats, dur = seg.duration, h = tr.h, ph = [], pins = [];
    var cl = CLAIMS && CLAIMS.get(seg);
    function man(id, t) { return id ? tManAt(tr, id, t, dur) : null; }
    function feetPt(id, t) { var q = man(id, t); return q ? { x: q.x, y: q.y + tDir(seg, id) * P.BALL_OFF } : null; }
    /* where the ball for key k + 1 goes when it arrives at time t: the key's ball (the legs' own: where its man is at
     * the key's time, with a4's rules for a cross and a ball played back), moved by where he is at t instead */
    function Eat(k, r, t) {
      var kbl = K[k + 1].ball, z = kbl.z || 0;
      if (!r) return { x: kbl.x, y: kbl.y, z: z };
      var a = man(r, t), e = man(r, K[k + 1].t);
      if (!a || !e) return { x: kbl.x, y: kbl.y, z: z };
      return { x: kbl.x + a.x - e.x, y: kbl.y + a.y - e.y, z: z };
    }
    /* kmtree5 a7 (helper T2): THE LATEST THE BALL MAY BE WITH THE MAN WHO STARTS EACH BEAT (lat). Some moments keep the
     * plan's clock (a shot, a whistle, the ball out, a save, the keeper's short-pass picture, the end of the play); a
     * flight before one of them needs at least a ball's time (tFast). Read backwards from those moments, this says
     * how late a ball may get to its man without the next ball being drawn faster than a ball. */
    var T2 = !TBRK.t2, lat = [];
    function fixedB(j) { var bj = B[j]; if (!bj) return false; var kj = bj.kind; return kj === 'shot' || kj === 'out' || kj === 'foul' || kj === 'save' || (!PASSY[kj] && kj !== 'carry' && kj !== 'dribble' && kj !== 'tackle') || !!(cl && cl.gap && j === B.length - 1 && PASSY[kj]); }
    /* (two of those moments give a little: the keeper's short-pass picture, whose last ball a5 draws slowly over the
     * whole beat, can take the ball over up to a third of the beat in (gapLate); a ball on its way out of play may
     * get there inside the time the plan gives the dead ball (outLate).) */
    /* needN, bound: the time the beats from here to the next such moment need at a ball's usual pace, and that moment */
    var needN = [], bound = [];
    function gapLate(j) { return cl && cl.gap && j === B.length - 1 && PASSY[B[j].kind] && B[j].kind !== 'out' && B[j].kind !== 'save' && B[j].kind !== 'shot' ? Math.min(1.2, 0.35 * (K[j + 1].t - K[j].t)) : 0; }
    function outLate(j) { return T2 && !TBRK.t2out && B[j] && B[j].kind === 'out' ? Math.max(0, Math.min(T2OUT, K[j + 1].t - K[j].t - 0.25)) : 0; }
    if (T2) {
      lat[B.length] = dur; needN[B.length] = 0; bound[B.length] = dur;
      for (var j9 = B.length - 1; j9 >= 0; j9--) {
        var b9 = B[j9], d9 = P.dist(K[j9].ball, K[j9 + 1].ball), l9 = K[j9 + 1].t - K[j9].t;
        if (fixedB(j9)) { lat[j9] = K[j9].t + gapLate(j9) + outLate(j9); needN[j9] = 0; bound[j9] = K[j9].t + outLate(j9); }
        else if (PASSY[b9.kind]) { lat[j9] = lat[j9 + 1] - tFast(d9, tAiry(b9, d9)) - 0.1; needN[j9] = needN[j9 + 1] + tNat(d9, tAiry(b9, d9), b9.note === 'header') + 0.1; bound[j9] = bound[j9 + 1]; }
        else { lat[j9] = lat[j9 + 1] - (b9.kind === 'tackle' ? 0.3 : 0.1); needN[j9] = needN[j9 + 1] + (b9.kind === 'tackle' ? 0.3 : l9); bound[j9] = bound[j9 + 1]; }
      }
    }
    /* (T2) a loose ball's time for a distance: a slow pass's when it is short (helper T's), a pass's when it is long */
    function tLoose(d) { return d > 26 ? tNat(d, true, false) : passDur(d) * (d <= 8 ? 1.5 : d >= 16 ? 1.15 : 1.5 - 0.35 * (d - 8) / 8); }
    /* (T2) the dying away of a ball's speed (c) that keeps its top speed a ball's: the top is the mean over 1 - c / 2 */
    function cTop(c, d, T) { return T2 && !TBRK.t2peak ? Math.max(0, Math.min(c, 2 * (1 - d / Math.max(1e-6, T) / 30))) : c; }
    var own = K[0].holder || null, tA = 0, loose = { x: K[0].ball.x, y: K[0].ball.y }, arrFor = null;
    /* (the picture may start with the ball a few metres from the man who has it: in the air beside him, as the
     * decision's picture has a ball he is running onto, or he was late to it. It comes to him first, gently, at up to
     * 6 m/s (tBallTrack), and he plays it once it is at his feet. Sending it to him at a ball's speed was tried: a ball
     * that starts from the frozen picture at 11 m/s reads as struck by nobody.) */
    var ready0 = 0;
    if (own) { var q0 = man(own, 0), d00 = q0 ? P.dist(q0, K[0].ball) : 99; if (d00 > 5.2) own = null; else if (d00 > P.BALL_OFF + 0.5) ready0 = (d00 - P.BALL_OFF) / 5 + 0.15; }
    function fill(to) {
      if (to > tA + 1e-6) { ph.push(own ? { type: 'feet', t0: tA, t1: to, man: own } : { type: 'rest', t0: tA, t1: to }); tA = to; }
    }
    /* kmtree5 a7 (helper T2): THE PICTURE STARTS WITH THE BALL IN THE AIR BESIDE THE MAN WHO PLAYS IT.
     *   drop  his first beat is a pass and his legs run him onto it (legs(), air6): the ball comes down a metre on and
     *         stays there until he is at it; then it is at his feet.
     *   come  his first beat is a run with the ball: the ball lands and runs on ahead of him, slowing, into his
     *         stride, and he has it when his own run has caught it up (his legs are a5's).
     * Neither found in 2 s (he is not coming, or not running that way): helper T's ball, which comes to him gently. */
    var sp0 = T2 && !TBRK.t2air && own && ready0 > 0 && B[0] && B[0].from === own ? (tr.air6sp || tAirSpot(seg, man(own, 0))) : null;
    if (sp0 && PASSY[B[0].kind] && B[0].kind !== 'shot' && B[0].kind !== 'out' && B[0].kind !== 'save') {
      for (var tR = h; tR <= Math.min(dur - 0.1, 2.0); tR += h) {
        var qR = man(own, tR); if (!qR) break;
        if (P.dist(qR, sp0) <= P.BALL_OFF + 0.35) { ph.push({ type: 'drop', t0: 0, t1: tR, z0: sp0.z0, S: { x: K[0].ball.x, y: K[0].ball.y }, E: { x: sp0.x, y: sp0.y } }); tA = tR; ready0 = 0; break; }
      }
    } else if (sp0 && (B[0].kind === 'carry' || B[0].kind === 'dribble')) {
      var G0 = { x: K[0].ball.x + sp0.d.x * 3, y: K[0].ball.y + sp0.d.y * 3 };
      for (var tC = 0.45; tC <= Math.min(dur - 0.2, 1.8); tC += h) {
        var qC = man(own, tC), qB = man(own, tC - h); if (!qC || !qB) break;
        var vcx = (qC.x - qB.x) / h, vcy = (qC.y - qB.y) / h, vc = Math.sqrt(vcx * vcx + vcy * vcy); if (vc < 1.5) continue;
        var Pc = { x: qC.x + vcx / vc * P.BALL_OFF, y: qC.y + vcy / vc * P.BALL_OFF };
        if ((Pc.x - G0.x) * sp0.d.x + (Pc.y - G0.y) * sp0.d.y < 0) continue;   /* (his run has not caught it up yet) */
        var chx = Pc.x - K[0].ball.x, chy = Pc.y - K[0].ball.y, ch = Math.sqrt(chx * chx + chy * chy), k0 = Math.min(sp0.v * tC, 2 * ch), k1 = Math.min(vc * tC, 2 * ch) / vc;
        ph.push({ type: 'come', t0: 0, t1: tC, z0: sp0.z0, S: { x: K[0].ball.x, y: K[0].ball.y }, E: Pc, m0: { x: sp0.d.x * k0, y: sp0.d.y * k0 }, m1: { x: vcx * k1, y: vcy * k1 } });
        tA = tC; ready0 = 0; break;
      }
    }
    function hasIt(id, at, t) { var q = id ? man(id, t) : null; return !!(q && P.dist(q, at) <= P.BALL_OFF + 1.5); }
    for (var k = 0; k < B.length; k++) {
      var b = B[k], t0 = K[k].t, t1 = K[k + 1].t, kd = b.kind, lastB = k === B.length - 1;
      if (t1 - t0 < 1e-6) continue;
      /* a5's ball: the ball dead, a save, the last ball into the keeper's short-pass picture (helper C's C4) */
      if (kd === 'out' || kd === 'foul' || kd === 'save' || !PASSY[kd] && kd !== 'carry' && kd !== 'dribble' && kd !== 'tackle' || (cl && cl.gap && lastB && PASSY[kd])) {
        var tS0 = Math.max(tA, t0);
        if (tS0 < t1 - 1e-6) {
          fill(tS0);
          if (own) pins.push({ t: tS0, ball: K[k].ball, w: 0.5, pre: true });
          ph.push({ type: 'a5', t0: tS0, t1: t1, late: tS0 > t0 + 0.02, kb: k }); tA = t1;
        }
        loose = { x: K[k + 1].ball.x, y: K[k + 1].ball.y };
        own = hasIt(K[k + 1].holder, loose, t1) ? K[k + 1].holder : null; arrFor = null;
        continue;
      }
      if (kd === 'carry' || kd === 'dribble') {
        if (own !== b.from) { fill(Math.max(tA, t0)); own = b.from; }
        arrFor = null;
        continue;   /* (it stays at his feet until the next beat does something with it) */
      }
      if (kd === 'tackle') {
        var A = b.from, W = b.to;
        if (own !== A) { fill(Math.max(tA, t0)); own = A; }
        var nbT = B[k + 1] || null, slackT = nbT && (nbT.kind === 'carry' || nbT.kind === 'dribble') && nbT.from === W ? Math.min(1.0, 0.6 * (K[k + 2].t - t1)) : (nbT && nbT.kind !== 'shot' && nbT.kind !== 'out' && nbT.kind !== 'foul' && nbT.kind !== 'save' ? 0.25 : 0);
        /* kmtree5 a7 (helper T2): what follows keeps the plan's clock (fixN) or the play ends soon: the ball must be the
         * winner's by then (tD), on the side of him the plan pins (pinT, pinB), so nothing after it is squeezed or jumps */
        var fixN = T2 && (!nbT || fixedB(k + 1)), tD = T2 ? Math.min(dur, fixN ? (nbT ? t1 + gapLate(k + 1) : dur) : lat[k + 1]) : dur;
        var pinB = null, pinT = 0;
        if (T2 && !TBRK.t2pin) {
          if (fixN && nbT && K[k + 1].holder === W) { pinB = K[k + 1].ball; pinT = t1; }
          else if (K[K.length - 1].holder === W && B.slice(k + 1).every(function (bq) { return (bq.kind === 'carry' || bq.kind === 'dribble') && bq.from === W; })) { pinB = K[K.length - 1].ball; pinT = dur; }
        }
        var pinAt = function (t) { if (!pinB || pinT - t > 0.5) return null; var qn = man(W, t), qp = man(W, pinT); return qn && qp ? { x: pinB.x + qn.x - qp.x, y: pinB.y + qn.y - qp.y } : null; };
        var tc = -1, tEnd = Math.min(dur - 0.25, t1 + slackT);
        if (fixN) tEnd = Math.min(tEnd, tD - 0.25);
        for (var tt = Math.max(tA, t0 - 0.4); tt <= tEnd; tt += h) { var fa = feetPt(A, tt), wq = man(W, tt); if (fa && wq && P.dist(fa, wq) <= 2.6) { tc = tt; break; } }
        if (tc < 0 && !TBRK.poke) {
          /* the two never get to the ball together (the man who wins it is too far to be there in the plan's time): the
           * ball gets away from the man who has it, at a slow pass's speed, and the other man is first to it */
          var tsP = Math.min(dur - 0.2, Math.max(tA, t0)), SP = feetPt(A, tsP), taP = -1, EP = null;
          if (T2 && !TBRK.t2loose && SP) {   /* (SP is null when the man tackled is no longer on the pitch: helper T's fallback below) */
            /* kmtree5 a7 (helper T2): THE LOOSE BALL IS COLLECTED WHEN ITS MAN CAN BE THERE. Helper T's fallback sent it to
             * him inside the tackle's beat however far he was (22 m in 0.4 s, 39 m in 0.6 s). Now it runs to where his own
             * legs have him, in a loose ball's time, as late as what follows allows (tD); the beats after it start that
             * much later and no time is added to the play. When it cannot be there by then even at a ball's top speed,
             * the pass before the tackle is cut out by the man who wins it (the ball never reaches the man tackled). */
            var endW = function (S, t) { var w0 = man(W, t); if (!w0) return null; var pa = pinAt(t); if (pa) return pa; var ax = S.x - w0.x, ay = S.y - w0.y, al = Math.sqrt(ax * ax + ay * ay), ak = al > P.BALL_OFF ? P.BALL_OFF / al : 1; return { x: w0.x + ax * ak, y: w0.y + ay * ak }; };
            for (var tp2 = tsP + 0.2; SP && tp2 <= tD + 1e-6; tp2 += h) {
              var e2 = endW(SP, tp2); if (!e2) break;
              if (tLoose(P.dist(SP, e2)) <= tp2 - tsP + 1e-6) { taP = tp2; EP = e2; break; }
            }
            if (taP < 0 && SP && tD >= tsP + 0.2) { var e3 = endW(SP, tD); if (e3 && tFast(P.dist(SP, e3), false) <= tD - tsP + 1e-6) { taP = tD; EP = e3; } }
            var pv = ph.length ? ph[ph.length - 1] : null, bpv = B[k - 1] || null;
            if (taP < 0 && !TBRK.t2cut && pv && pv.type === 'fly' && pv.k === k - 1 && pv.S0 && bpv && PASSY[bpv.kind] && bpv.kind !== 'shot' && Math.abs(pv.t1 - tA) < 1e-6) {
              var tm = -1, Em = null, hdr = bpv.note === 'header';
              for (var tq = pv.t0 + 0.15; tq <= tD + 1e-6; tq += h) {
                var e4 = endW(pv.S0, tq); if (!e4) break;
                var d4 = P.dist(pv.S0, e4); if (tNat(d4, tAiry(bpv, d4), hdr) <= tq - pv.t0 + 1e-6) { tm = tq; Em = e4; break; }
              }
              if (tm < 0 && tD >= pv.t0 + 0.15) { var e5 = endW(pv.S0, tD), d5 = e5 ? P.dist(pv.S0, e5) : 0; if (e5 && tFast(d5, tAiry(bpv, d5)) <= tD - pv.t0 + 1e-6) { tm = tD; Em = e5; } }
              if (tm >= 0) {
                var dm = P.dist(pv.S0, Em), am = tAiry(bpv, dm);
                pv.t1 = tm; pv.E = { x: Em.x, y: Em.y, z: 0 }; pv.air = am; pv.c = cTop(am ? 0.12 : 0.35, dm, tm - pv.t0); pv.roll = false; pv.mode = 'cut';
                tA = tm; loose = { x: Em.x, y: Em.y }; own = W; arrFor = null; continue;
              }
            }
            /* kmtree5 a9 (helper G2), switch loose: the man with the ball has been running with it (the beat before is his
             * own run: helper K's anticipation). The ball gets away from him EARLIER, while he runs, at the latest moment
             * from which a loose ball's own time still has it with the other man by tD. */
            if (taP < 0 && G9.loose && own === A && bpv && (bpv.kind === 'carry' || bpv.kind === 'dribble') && bpv.from === A) {
              for (var ts9 = tsP - h; taP < 0 && ts9 >= Math.max(tA + 0.3, K[k - 1].t + 0.3, tsP - G9T.looseBack) - 1e-6; ts9 -= h) {
                var S9g = feetPt(A, ts9); if (!S9g) break;
                for (var tp9 = ts9 + 0.2; tp9 <= tD + 1e-6; tp9 += h) { var e9g = endW(S9g, tp9); if (!e9g) break; if (tLoose(P.dist(S9g, e9g)) <= tp9 - ts9 + 1e-6) { tsP = ts9; SP = S9g; taP = tp9; EP = e9g; G9S.loose++; break; } }
              }
            }
            /* (neither can be honest: it is with him at the latest moment, as fast as that needs. Counted by t2_fast.js) */
            if (taP < 0) { taP = Math.min(dur, Math.max(tsP + 0.2, tD)); EP = SP ? endW(SP, taP) : null; if (!EP) EP = SP; }
            if (EP) { fill(tsP); var dP = P.dist(SP, EP); ph.push({ type: 'fly', t0: tsP, t1: taP, E: { x: EP.x, y: EP.y, z: 0 }, air: dP > 26, c: cTop(0.5, dP, taP - tsP), k: k, mode: 'poke' }); tA = taP; loose = { x: EP.x, y: EP.y }; own = W; arrFor = null; continue; }
          }
          for (var tp = tsP + 0.2; SP && tp <= Math.min(dur, t1 + Math.max(0.25, slackT)) + 1e-6; tp += h) {
            var wp = man(W, tp); if (!wp) break;
            var px = SP.x - wp.x, py = SP.y - wp.y, pl = Math.sqrt(px * px + py * py), pk = pl > P.BALL_OFF ? P.BALL_OFF / pl : 1, ep = { x: wp.x + px * pk, y: wp.y + py * pk };
            if (passDur(P.dist(SP, ep)) * 1.5 <= tp - tsP + 1e-6) { taP = tp; EP = ep; break; }
          }
          if (taP < 0) { taP = Math.min(dur, Math.max(tsP + 0.2, t1)); var wl = man(W, taP); EP = wl ? { x: wl.x, y: wl.y + tDir(seg, W) * P.BALL_OFF } : SP; }
          if (EP) { fill(tsP); ph.push({ type: 'fly', t0: tsP, t1: taP, E: { x: EP.x, y: EP.y, z: 0 }, air: false, c: 0.5, k: k, mode: 'poke' }); tA = taP; loose = { x: EP.x, y: EP.y }; own = W; arrFor = null; continue; }
        }
        if (tc < 0) tc = Math.max(tA, Math.min(dur - 0.25, t1 - 0.25));
        fill(tc);
        ph.push({ type: 'tk', t0: tc, t1: Math.min(dur, tc + 0.25), from: A, to: W, pinB: pinB && pinT - (tc + 0.25) <= 0.5 ? pinB : null, pinT: pinT }); tA = Math.min(dur, tc + 0.25); own = W; arrFor = null;
        continue;
      }
      var f = b.from, hN = K[k + 1].holder || null, nb = B[k + 1] || null;
      if (kd === 'shot') {
        /* a shot is struck when the plan strikes it (the keeper's dive is timed to it), from the plan's spot */
        var tS = Math.max(tA, t0);
        /* (a shot the plan gives too little time for its real distance, over 34 m/s: the man who has the ball strikes it
         * up to 0.35 s before the plan's time, along the same line, so it is on its way when the keeper's dive starts) */
        if (!TBRK.fast && own && own === f && tS === t0) { var needS = P.dist(K[k].ball, K[k + 1].ball) / 34 - (t1 - t0); if (needS > 0.02) tS = Math.min(t0, Math.max(tA + 0.08, t0 - Math.min(0.35, needS))); }
        fill(tS);
        if (own) pins.push({ t: tS, ball: K[k].ball, w: 0.35 });
        var Es = K[k + 1].ball;
        ph.push({ type: 'fly', t0: tS, t1: Math.max(tS + 0.05, t1), E: { x: Es.x, y: Es.y, z: Es.z || 0 }, air: tAiry(b, P.dist(K[k].ball, Es)), c: 0.1, k: k });
        tA = Math.max(tS + 0.05, t1); loose = { x: Es.x, y: Es.y }; own = hasIt(hN, loose, t1) ? hN : null; arrFor = null;
        continue;
      }
      /* a pass, a kick-off, a pass cut out, a clearance */
      var held = !!f && own === f;
      if (!held && own) { var tO = Math.max(tA, t0), qo = feetPt(own, tO); fill(tO); loose = qo || loose; own = null; }   /* (the plan has another man strike it: it leaves from where it is) */
      var r = hN || (nb && FLIGHT[nb.kind] && nb.from ? nb.from : null), rHold = !!hN, ke = k;
      /* a ball that runs through to a keeper (or a cross he catches) goes to him, where he is: one flight, not a
       * ball that stops short and is then moved into his hands */
      if (!hN && nb && nb.kind === 'save' && nb.to && K[k + 2] && K[k + 2].holder === nb.to && !(cl && cl.gap)) { r = nb.to; rHold = true; ke = k + 1; t1 = K[k + 2].t; }
      var ts = Math.min(dur - 0.05, held ? Math.max(tA, t0) : (arrFor && arrFor === f ? tA : Math.max(tA, t0))), ta = Math.min(dur, Math.max(ts + 0.1, t1));
      var Sof = function (t) { return held ? feetPt(f, t) : (loose || feetPt(f, t) || K[k].ball); };
      var natTo = function (S, E) { var d = P.dist(S, E); return tNat(d, tAiry(b, d), b.note === 'header'); };
      /* kmtree5 a7 (helper T2): A BALL ARRIVES EARLY WHEN THE ONE AFTER IT HAS TOO LITTLE TIME. The plan gives some balls
       * half a second for 30 m (a cross cleared for a corner) before a moment that keeps the plan's clock. This ball,
       * which has time to spare (its man was holding it), then gets there early, so the two share the time by what
       * each needs at a ball's usual pace; never in less than a ball's least time. */
      if (T2 && !TBRK.t2early && ke === k && nb && !fixedB(k + 1) && PASSY[nb.kind] && bound[k + 1] - needN[k + 1] < t1 - 0.02) {
        var tsL9 = Math.max(ts, held && tA === 0 && ready0 > 0 ? ready0 : 0), S9 = Sof(tsL9), E9 = Eat(ke, r, t1), dT9 = P.dist(S9, E9), nat9 = natTo(S9, E9);
        var t1e = Math.min(t1, Math.max(tsL9 + tFast(dT9, tAiry(b, dT9)), tsL9 + (bound[k + 1] - tsL9) * nat9 / (nat9 + needN[k + 1])));
        if (t1e < t1 - 0.02) { t1 = t1e; ta = Math.min(dur, Math.max(ts + 0.1, t1)); }
      }
      /* the earliest the ball, struck at tsX, can be with its man: he is where he is, the ball takes a ball's time */
      var meet = function (tsX) { var S = Sof(tsX); for (var t = tsX + 0.15; t <= t1 + 1e-6; t += h) { if (natTo(S, Eat(ke, r, t)) <= t - tsX + 1e-6) return t; } return null; };
      var dirF = b.team === 'them' ? -1 : 1, mode = 'late', fl6 = false;
      if (held) {
        if (tA === 0 && ready0 > 0) ts = Math.min(Math.max(ts, ready0), Math.max(ts, t1 - 0.15));
        var tsLo = ts;
        /* kmtree5 a8 (helper G): THE BALL HELD WHILE ITS MAN COMES MAY BE PLAYED EARLY INTO HIS RUN. Helper W plays a
         * wait as beats of their own before the pass (a shield, a run with the ball: b.ww; the pass after them is
         * 'release'), so the pass's own beat has no time to spare and the early ball below never found one: the ball
         * was always struck last, with the runner far ahead of it. Here the earliest moment it may be struck reaches
         * back into the hold: no more than G8T.back s before the release beat, never before the hold has been shown
         * G8T.show s, never before the ball is at his feet. The rules for an early ball are helper T's, below. */
        var early6 = false;
        if (G8.early && W6.hold && b.ww === 'release' && k > 0 && B[k - 1].kind === 'carry' && B[k - 1].ww && B[k - 1].ww !== 'cut' && B[k - 1].from === f) {
          var k06 = k - 1; while (k06 > 0 && B[k06 - 1].kind === 'carry' && B[k06 - 1].ww && B[k06 - 1].ww !== 'cut' && B[k06 - 1].from === f) k06--;
          var lo6 = Math.max(tA, K[k06].t + G8T.show, t0 - G8T.back, ready0 > 0 && tA === 0 ? ready0 : 0);
          if (lo6 < tsLo - 1e-6) { tsLo = lo6; early6 = true; }
        }
        for (var it = 0; it < 3; it++) ts = Math.max(tsLo, ta - natTo(Sof(ts), Eat(ke, r, ta)));
        /* played early into his run: only a plain pass or a long ball to a man who keeps it, and only when the ball
         * still goes the way the plan sends it (within 35 degrees, at least 0.6 of its length, forward stays forward) */
        if (!TBRK.meet && rHold && kd === 'pass' && (!b.note || T_MEET[b.note]) && !b.fixedBall && ts - tsLo > 0.35) {
          var Sf = Sof(ts), Ef = Eat(ke, r, ta), p0x = Ef.x - Sf.x, p0y = Ef.y - Sf.y, l0 = Math.sqrt(p0x * p0x + p0y * p0y);
          for (var tsX = tsLo + 0.12; tsX < ts - 0.2; tsX += 0.1) {
            var m = meet(tsX); if (m == null || m > t1 - 0.2) continue;
            var Sm = Sof(tsX), Em = Eat(ke, r, m), p1x = Em.x - Sm.x, p1y = Em.y - Sm.y, l1 = Math.sqrt(p1x * p1x + p1y * p1y);
            if (l1 < Math.max(0.6 * l0, Math.min(l0, 6)) || l0 < 1e-6) continue;
            if ((p0x * p1x + p0y * p1y) / (l0 * l1) < 0.82) continue;
            if ((p0y * dirF > 0) !== (p1y * dirF > 0)) continue;
            /* (kmtree5 a8, helper G: out of W's hold only to a man still on his run, with G8T.run m or more to go when the
             * ball reaches him: a man already standing on his place would get it early and stand on it) */
            if (early6 && tsX < t0 - 1e-6) { var qm6 = man(r, m), q16 = man(r, t1); if (!qm6 || !q16 || P.dist(qm6, q16) < G8T.run) continue; fl6 = true; G8S.early++; }
            ts = tsX; ta = m; mode = 'meet'; break;
          }
        }
      } else {
        var S0 = Sof(ts), E1 = Eat(ke, r, t1), m2 = null;
        if (r && rHold && !TBRK.meet) {
          m2 = meet(ts);
          if (m2 != null) { var Em2 = Eat(ke, r, m2); if (((E1.y - S0.y) * dirF > 0) !== ((Em2.y - S0.y) * dirF > 0)) m2 = null; }
        } else if (r && !rHold && !TBRK.meet && nb && nb.kind !== 'shot') {
          /* the man who strikes it next first time: only when he is already (nearly) where he strikes it */
          m2 = meet(ts);
          if (m2 != null) { var qa = man(r, m2), qe = man(r, t1); if (!qa || !qe || P.dist(qa, qe) > 3) m2 = null; }
        } else if (!r) m2 = Math.min(t1, ts + natTo(S0, E1));
        if (m2 != null && m2 < t1 - 1e-6) { ta = Math.min(dur, Math.max(ts + 0.1, m2)); mode = r ? 'meet' : 'free'; }
      }
      /* never faster than a ball: a beat too short for the real distance (the legs left its men further apart than the
       * plan). First the man who has it plays it a little before the plan's time (up to 0.6 s, once he has had it a
       * moment); what is still missing runs past the key's time, and what comes next starts that much later (the beats
       * after it have the slack). Not past the time of a shot (the keeper's dive is timed to it: mvcheck K1, K2), nor of
       * a whistle or the ball going out (the cut to the restart is from where the ball is drawn: mvcheck2 V10). */
      if (!TBRK.fast) for (var itf = 0; itf < 3; itf++) {
        var dF = P.dist(Sof(ts), Eat(ke, r, ta)), need = tFast(dF, tAiry(b, dF)) - (ta - ts);
        if (need <= 1e-6) break;
        if (held && mode === 'late') { var tsE = Math.max(Math.min(ts, tA + 0.08, tA === 0 && ready0 > 0 ? ts : 99), t0 - 0.6, ts - need); if (T2 && tA === 0 && ready0 > 0) tsE = ts;   /* (T2: never before the ball that starts away from him is at his feet) */
          need -= ts - tsE; ts = tsE; }
        if (need > 1e-6 && nb && nb.kind !== 'shot' && nb.kind !== 'out' && nb.kind !== 'foul' && nb.kind !== 'save') {
          /* (T2: when the balls after it cannot all have a ball's least time either, this one takes its share of what is left, not all it needs) */
          var tF9 = need + (ta - ts), cap9 = T2 && !TBRK.t2early && lat[k + 1] < ta + need ? Math.max(ta, ts + (bound[k + 1] - ts) * tF9 / (tF9 + (bound[k + 1] - lat[k + 1]))) : 1e9;
          ta = Math.min(dur, ta + need, cap9);
        }
        else if (need > 1e-6 && nb && nb.kind === 'out' && outLate(k + 1) > 0) ta = Math.min(dur, Math.max(ta, Math.min(K[k + 1].t + outLate(k + 1), ta + need)));   /* (T2: a ball on its way out of play gets there inside the dead ball's time) */
      }
      fill(ts);
      var E = Eat(ke, r, ta), dE = P.dist(Sof(ts), E), air = tAiry(b, dE), nat = tNat(dE, air, b.note === 'header');
      var fl = { type: 'fly', t0: ts, t1: ta, E: E, air: air, c: cTop(air ? 0.12 : 0.35, dE, ta - ts), k: k, mode: mode, S0: Sof(ts) };   /* (T2: c by the top speed; S0 for a pass cut out before a tackle) */
      if (fl6) fl.early6 = true;   /* (kmtree5 a8, helper G: struck before its own beat, out of W's hold) */
      if (!TBRK.roll && ta - ts > nat * 1.3 + 0.15) fl.roll = true;
      /* kmtree5 a7 (helper T2): the picture starts with the ball in the air and the first beat is a ball nobody has (a
       * man of the other side gets to it first): it goes on the way it was going when the picture before stopped, and
       * bends to him, one smooth path (a6t started it from rest, straight at him, with nobody near: a ball that turns
       * 110 degrees in the air by itself) */
      if (T2 && !TBRK.t2air && k === 0 && !held && ts < 1e-6) {
        var stL = FROMV && FROMV.get(seg), zL = K[0].ball.z || (stL && stL.ball && stL.ball.z) || 0, vL = stL && ENDB6 ? ENDB6.get(stL) : null, vLl = vL ? Math.sqrt(vL.x * vL.x + vL.y * vL.y) : 0;
        if (zL > 0 && vLl >= 3) { var chL = P.dist(K[0].ball, E), kL = Math.min(vLl * (ta - ts), 2 * chL) / vLl; fl = { type: 'come', t0: 0, t1: ta, z0: zL, S: { x: K[0].ball.x, y: K[0].ball.y }, E: { x: E.x, y: E.y }, m0: { x: vL.x * kL, y: vL.y * kL }, m1: { x: 0, y: 0 }, k: k, mode: 'come' }; }
      }
      ph.push(fl);
      tA = ta; loose = { x: E.x, y: E.y };
      if (rHold) { own = r; arrFor = null; } else { own = null; arrFor = r; }
      if (ke > k) k = ke;
    }
    fill(dur);
    if (own) pins.push({ t: dur, ball: K[K.length - 1].ball, w: 0.4 });
    return { ph: ph, pins: pins };
  }
  /* a ball that lands short and runs on: the share of the way it flies (fA), the time in the air (TA), the speed it
   * runs on at (u0) and ends at (w), for D metres in T seconds. The first share, from most in the air down, whose
   * run-on neither speeds up nor stops (it ends at 1.5 m/s or more). */
  function tRoll(D, T, air, head) {
    for (var fA = air ? 0.9 : 0; fA >= (air ? 0.2 : 0) - 1e-9; fA -= 0.05) {
      var dA = D * fA, TA = air ? tNat(dA, true, head) : 0, TR = T - TA, dR = D - dA;
      if (TR < 0.2) continue;
      var mean = dR / TR, top = air ? 0.78 * dA / TA : 1.25 * passDurSpeed(D);
      if (mean >= 1.5 && mean <= top) { var u0 = Math.min(top, 2 * mean - 1.5); return { fA: fA, TA: TA, TR: TR, u0: u0, w: 2 * mean - u0 }; }
      if (!air) break;
    }
    /* (no run-on fits: the time is too long for the distance. It flies in a ball's time and lies there) */
    var Tn = Math.min(T, tNat(D, air, head));
    return air ? { fA: 1, TA: Tn, TR: Math.max(1e-6, T - Tn), u0: 0, w: 0 } : { fA: 0, TA: 0, TR: Tn, u0: 2 * D / Tn - 1.5, w: 1.5, stop: true };
  }
  function passDurSpeed(d) { return d / passDur(d); }
  function tBallTrack(seg, tr) {
    var K = seg.keys, dur = seg.duration, n = tr.n, h = tr.h, plan;
    try { plan = tBallPlan(seg, tr); } catch (e) { return null; }
    var ph = plan.ph, pins = plan.pins;
    if (!ph.length) return null;
    var X = new Float32Array(n + 1), Y = new Float32Array(n + 1), Z = new Float32Array(n + 1), who = new Array(n + 1);
    var st6 = FROMV && FROMV.get(seg), z06 = K[0].ball.z || (st6 && st6.ball && st6.ball.z) || 0;   /* (the picture it starts from may have the ball in the air) */
    var pi = 0, last = { x: K[0].ball.x, y: K[0].ball.y, z: z06 }, off = null, offMan = null, endBall = last, endT = 0, prev = null, tPrev = 0;
    function man(id, t) { return tManAt(tr, id, t, dur); }
    var W6 = (SEGST && SEGST.get(seg)) || {}, opp = {}, angW = 0, offT = 0, offZ = 0;
    Object.keys(tr.idx || {}).forEach(function (a) { opp[a] = Object.keys(tr.idx).filter(function (o) { return W6[a] && W6[o] && W6[o].team !== W6[a].team && !W6[o].keeper; }); });
    for (var i = 0; i <= n; i++) {
      var t = Math.min(dur, i * h), dt = t - tPrev; tPrev = t;
      while (pi < ph.length - 1 && t >= ph[pi].t1 - 1e-9) {
        /* what the phase left behind: where the ball was at its end */
        var pe = ph[pi];
        if (pe.type === 'fly') { endBall = { x: pe.E.x, y: pe.E.y, z: 0 }; endT = pe.t1; offMan = null; }
        else if (pe.type === 'feet' && offMan === pe.man) {
          var qe = man(pe.man, pe.t1); endBall = { x: qe.x + off.x, y: qe.y + off.y, z: 0 }; endT = pe.t1;
          for (var jp = 0; jp < pins.length; jp++) if (Math.abs(pins[jp].t - pe.t1) < 1e-6) endBall = { x: pins[jp].ball.x, y: pins[jp].ball.y, z: 0 };
        }
        else { endBall = last; endT = pe.t1; if (pe.type !== 'tk') offMan = null; }
        prev = pe; pi++;
      }
      var p = ph[pi], ball = null, hd = null;
      if (p.type === 'a5') {
        /* kmtree5 a7 (helper T2): a ball that comes off the keeper (a save's beat). a5 eases every ball out, so it leaves
         * him at 1.6 times its mean speed (a parry of 5 m in 0.2 s at 40 m/s). Same path, same start and end, nearly even. */
        var t5 = t, b5 = p.kb != null ? seg.beats[p.kb] : null;
        if (!TBRK.t2 && !TBRK.t2save && b5 && b5.kind === 'save') { var a5t = K[p.kb].t, e5t = K[p.kb + 1].t, u5 = Math.max(0, Math.min(1, (t - a5t) / Math.max(1e-6, e5t - a5t))), s5 = (u5 - 0.35 * u5 * u5 / 2) / (1 - 0.35 / 2); if (u5 > 0 && u5 < 1) t5 = a5t + (1 - Math.pow(1 - s5, 1 / 1.6)) * (e5t - a5t); }
        /* kmtree5 a9 (helper G2), switch gapball: a pass that a5's ball draws (the last ball into the keeper's short-pass
         * picture) and that a5's easing would send off at over 30 m/s: the same path and end, from the moment the track
         * hands it over, at a nearly even speed (its top the mean over 1 - c / 2, as helper T2's cTop). */
        if (G9.gapball && b5 && PASSY[b5.kind] && b5.kind !== 'save' && b5.kind !== 'out' && b5.kind !== 'shot') {
          if (p.g9 === undefined) {
            var hd9 = holdOf(seg, p.kb) || 0, a9t = K[p.kb].t + hd9, e9t = K[p.kb + 1].t, f9t = Math.max(p.t0, a9t), len9 = P.dist(K[p.kb].ball, K[p.kb + 1].ball);
            p.g9 = e9t - f9t > 0.1 && 1.6 * len9 / Math.max(0.1, e9t - a9t) > 30 ? { a: a9t, t0: f9t, t1: e9t, c: Math.max(0, Math.min(0.35, 2 * (1 - len9 / (e9t - f9t) / 30))) } : null;
            if (p.g9) G9S.gapball++;
          }
          if (p.g9 && t > p.g9.t0 && t < p.g9.t1) { var u9 = (t - p.g9.t0) / (p.g9.t1 - p.g9.t0), s9 = (u9 - p.g9.c * u9 * u9 / 2) / (1 - p.g9.c / 2); t5 = p.g9.a + (1 - Math.pow(1 - s9, 1 / 1.6)) * (p.g9.t1 - p.g9.a); }
          else if (p.g9 && t <= p.g9.t0) t5 = Math.min(t, p.g9.a);
        }
        NOBT = true; var fr5; try { fr5 = frameAt(seg, t5); } finally { NOBT = false; }
        ball = { x: fr5.ball.x, y: fr5.ball.y, z: fr5.ball.z || 0 }; hd = fr5.holder || null; offMan = null;
        /* kmtree5 a7 (helper T2): a5's ball takes over from where the ball IS. When the ball got to this moment late or
         * a little off the plan's spot, a5's ball started metres away (one frame at 50 to 200 m/s). The gap dies away
         * over a quarter of a second or more (11 m/s on average at most); not across a cut, not with the ball dead. */
        if (!TBRK.t2 && !TBRK.t2pin) {
          if (p.br === undefined) {
            var bk5 = null; for (var q5 = 0; q5 < seg.beats.length && !bk5; q5++) if (K[q5 + 1].t > p.t0 + 1e-6) bk5 = seg.beats[q5];
            var dead5 = !bk5 || bk5.kind === 'foul' || (bk5.kind === 'out' && !p.late);
            var gx5 = endBall.x - ball.x, gy5 = endBall.y - ball.y, gl5 = Math.sqrt(gx5 * gx5 + gy5 * gy5);
            p.br = gl5 > 0.3 && gl5 < 30 && !fr5.cut && !dead5 && i > 0 ? { x: gx5, y: gy5, t0: t, tau: Math.max(0.25, gl5 / 11) } : null;
          }
          if (p.br && !fr5.cut) { var ub5 = 1 - tSmooth((t - p.br.t0) / p.br.tau); ball.x += p.br.x * ub5; ball.y += p.br.y * ub5; }
        }
      } else if (p.type === 'drop' || p.type === 'come') {
        /* (T2: it comes down in a third of a second. drop: it runs a metre on and dies. come: one smooth path from where
         * it is, going the way it was going, to the stride of the man running onto it, at his speed when he has it) */
        var uZ = Math.min(1, t / 0.33), uC = Math.max(0, Math.min(1, t / Math.max(1e-6, p.t1)));
        if (p.type === 'drop') { var eD = 1 - Math.exp(-t / 0.12); ball = { x: p.S.x + (p.E.x - p.S.x) * eD, y: p.S.y + (p.E.y - p.S.y) * eD, z: p.z0 * (1 - uZ * uZ) }; }
        else { var u2 = uC * uC, u3 = u2 * uC, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + uC, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
          ball = { x: h00 * p.S.x + h10 * p.m0.x + h01 * p.E.x + h11 * p.m1.x, y: h00 * p.S.y + h10 * p.m0.y + h01 * p.E.y + h11 * p.m1.y, z: p.z0 * (1 - uZ * uZ) }; }
        offMan = null;
      } else if (p.type === 'rest') {
        ball = { x: endBall.x, y: endBall.y, z: 0 }; offMan = null;
      } else if (p.type === 'feet') {
        var m = p.man, q = man(m, t);
        if (!q) { ball = { x: last.x, y: last.y, z: 0 }; }
        else {
          if (offMan !== m) { var qs = man(m, p.t0) || q; off = { x: endBall.x - qs.x, y: endBall.y - qs.y }; offMan = m; angW = 0; offT = t; offZ = endBall.z || 0; }
          else if (dt > 0) {
            /* a stride ahead of him on the side he is running to; a ball further off than a stride runs to him */
            var qb = man(m, Math.max(0, t - h)), vx = (q.x - qb.x) / h, vy = (q.y - qb.y) / h, sp = Math.sqrt(vx * vx + vy * vy);
            var L0 = Math.sqrt(off.x * off.x + off.y * off.y), cx = L0 > 1e-6 ? off.x / L0 : 0, cy = L0 > 1e-6 ? off.y / L0 : tDir(seg, m);
            /* the side the ball should be on: where he is running to; with an opponent close in front of it, round to
             * his side, away from that man (a5 kept it straight up the pitch, between the two: the opponent was drawn
             * nearer the ball than its owner) */
            var gx = cx, gy = cy;
            if (!TBRK.lead && sp > 2.5) { gx = vx / sp; gy = vy / sp; }
            if (!TBRK.shield && opp[m]) {
              var on = null, od = 4.6;
              for (var jo = 0; jo < opp[m].length; jo++) { var qo = man(opp[m][jo], t); if (!qo) continue; var d0 = Math.sqrt((qo.x - q.x) * (qo.x - q.x) + (qo.y - q.y) * (qo.y - q.y)); if (d0 < od) { od = d0; on = qo; } }
              if (on && od > 1e-6) {
                var ex = (on.x - q.x) / od, ey = (on.y - q.y) / od;
                if (gx * ex + gy * ey > 0.17) { var sd = (ex * cy - ey * cx) >= 0 ? 1 : -1; gx = -ey * sd; gy = ex * sd; }   /* (within about 80 degrees of him: at 90, on the side it already leans) */
              }
            }
            /* it swings there smoothly: an angular speed that builds up and dies away (no jump in the ball's speed) */
            var crg = cx * gy - cy * gx, ang = Math.acos(Math.max(-1, Math.min(1, cx * gx + cy * gy))) * (crg >= 0 ? 1 : -1);
            if (L0 > P.BALL_OFF + 0.3) { ang = 0; angW = 0; }   /* (a ball still coming to him comes straight: it is not swung round him) */
            var wd = Math.max(-6.5, Math.min(6.5, ang / 0.14)); angW += Math.max(-36 * dt, Math.min(36 * dt, wd - angW));
            var st = angW * dt; if (Math.abs(st) > Math.abs(ang) && st * ang > 0) { st = ang; angW = 0; }
            var cs = Math.cos(st), sn = Math.sin(st), nx = cx * cs - cy * sn, ny = cx * sn + cy * cs; cx = nx; cy = ny;
            /* (a ball further from him than a stride, as when the picture stopped with it in the air beside him, comes to
             * him: it starts gently, never with a jump in its speed) */
            var rt6 = Math.min(6, 12 * Math.max(0, t - offT)), L1 = L0 + Math.max(-rt6 * dt, Math.min(rt6 * dt, P.BALL_OFF - L0));
            off = { x: cx * L1, y: cy * L1 };
          }
          var ox = off.x, oy = off.y;
          /* the moments the plan pins (the end of the segment, a shot, the whistle): the ball where the plan has it */
          for (var j = 0; j < pins.length; j++) {
            var pn = pins[j]; if (pn.t < p.t0 - 1e-6 || pn.t > p.t1 + 1e-6 || t < pn.t - pn.w) continue;
            var qp = (pn.pre ? posAt(tr, Math.max(0, Math.ceil(pn.t / h - 1e-6) - 1), m) : man(m, pn.t)) || q, tvx = pn.ball.x - qp.x, tvy = pn.ball.y - qp.y, wE = !TBRK.t2 && !TBRK.t2pin ? Math.max(0.02, Math.min(pn.w, pn.t - Math.max(p.t0, offT))) : pn.w, wp = t >= pn.t - 1e-9 ? 1 : tSmooth(1 - (pn.t - t) / wE);   /* (T2: a ball that got to him inside the pin's window starts its swing from where it is) */
            ox = ox + (tvx - ox) * wp; oy = oy + (tvy - oy) * wp;
            if (wp >= 1) off = { x: tvx, y: tvy };
          }
          ball = { x: q.x + ox, y: q.y + oy, z: offZ > 0 ? offZ * Math.max(0, 1 - (t - offT) / 0.4) : 0 }; hd = m;
        }
      } else if (p.type === 'fly') {
        if (!p.S) { p.S = { x: endBall.x, y: endBall.y }; p.D = P.dist(p.S, p.E); p.hgt = Math.min(2.2, 0.6 + p.D / 28); if (p.roll) p.rl = tRoll(p.D, p.t1 - p.t0, p.air, seg.beats[p.k] && seg.beats[p.k].note === 'header');
          if (!TBRK.t2 && !TBRK.t2peak && seg.beats[p.k] && seg.beats[p.k].kind !== 'shot') p.c = Math.max(0, Math.min(p.c, 2 * (1 - p.D / Math.max(1e-6, p.t1 - p.t0) / 30))); }   /* (T2: the top speed a ball's, with the distance it really flies) */
        var T = Math.max(1e-6, p.t1 - p.t0), u = Math.max(0, Math.min(1, (t - p.t0) / T)), s, z = 0;
        if (p.rl) {
          var R9 = p.rl, te = t - p.t0;
          if (te <= R9.TA && R9.TA > 0) { var ua = te / R9.TA; s = R9.fA * (ua - 0.1 * ua * ua / 2) / 0.95; z = Math.sin(Math.PI * ua) * Math.min(2.2, 0.6 + p.D * R9.fA / 28); }
          else if (R9.fA >= 1) s = 1;
          else { var tr9 = Math.min(R9.TR, te - R9.TA), acc = (R9.u0 - R9.w) / R9.TR; s = p.D > 1e-6 ? R9.fA + (R9.u0 * tr9 - 0.5 * acc * tr9 * tr9) / p.D : 1; if (R9.stop && te >= R9.TR) s = 1; }
          s = Math.max(0, Math.min(1, s)); if (u >= 1) s = 1;
          hd = null;
        } else {
          s = (u - p.c * u * u / 2) / (1 - p.c / 2);
          if (p.air) z = Math.sin(Math.PI * u) * p.hgt;
        }
        if (p.E.z) z = Math.max(z, p.E.z * u);
        if (!TBRK.t2 && !TBRK.t2air && p.t0 < 1e-6 && z06 > 0) z = Math.max(z, z06 * (1 - Math.min(1, (t / 0.33) * (t / 0.33))));   /* (T2: a ball in the air when the picture starts comes down from there) */
        ball = { x: p.S.x + (p.E.x - p.S.x) * s, y: p.S.y + (p.E.y - p.S.y) * s, z: z };
        offMan = null;
      } else if (p.type === 'tk') {
        /* the man who had it keeps it until the man who wins it is at it; then it is his */
        var qa = man(p.from, t), qw = man(p.to, t);
        if (!p.offA) p.offA = offMan === p.from && off ? { x: off.x, y: off.y } : { x: endBall.x - (man(p.from, p.t0) || qa).x, y: endBall.y - (man(p.from, p.t0) || qa).y };
        var ba = { x: qa.x + p.offA.x, y: qa.y + p.offA.y }, wx = ba.x - qw.x, wy = ba.y - qw.y, wl = Math.sqrt(wx * wx + wy * wy);
        if (wl > P.BALL_OFF) { wx *= P.BALL_OFF / wl; wy *= P.BALL_OFF / wl; }
        if (p.pinB) { var qpn = man(p.to, p.pinT) || qw; wx = p.pinB.x - qpn.x; wy = p.pinB.y - qpn.y; }   /* (T2: it ends on the side of him the plan pins, when a pinned moment follows within half a second) */
        var uk = tSmooth((t - p.t0) / Math.max(1e-6, p.t1 - p.t0));
        ball = { x: ba.x + (qw.x + wx - ba.x) * uk, y: ba.y + (qw.y + wy - ba.y) * uk, z: 0 };
        hd = uk < 0.5 ? p.from : p.to; offMan = p.to; off = { x: ball.x - qw.x, y: ball.y - qw.y };
      }
      X[i] = ball.x; Y[i] = ball.y; Z[i] = ball.z || 0; who[i] = hd; last = ball;
    }
    /* (T2: the ball's velocity when this picture ends, for the picture that starts from it: tAirSpot) */
    if (ENDB6 && seg.end && n >= 1) { var dtE = Math.max(1e-6, dur - (n - 1) * h); ENDB6.set(seg.end, { x: (X[n] - X[n - 1]) / dtE, y: (Y[n] - Y[n - 1]) / dtE }); }
    return { x: X, y: Y, z: Z, who: who, ph: ph, pins: pins };
  }

  /* kmtree5 a6 (helper W) part 2, THE MAN ON THE BALL PLAYS FOOTBALL WHILE THE OTHER COMES. A settled segment is read
   * for passes the ball waits before (holdOf: the seconds it stays at the passer's feet, because the play waits for
   * the man it is for). A wait of more than W6T.holdMin s is played instead:
   *   with one of theirs on him (the man the card or the scene names, else the nearest within reach): he SHIELDS it,
   *   small touches round a ring about 3.5 m across at W6T.vShield m/s, starting away from the side the runner
   *   comes from, and that defender stays with him, W6T.press m goal-side of the ball, until the ball is about to be played
   *   (track(): he does not leave for his next place before);
   *   with nobody on him: he RUNS WITH IT into space (W6T.vCarry m/s, at most W6T.lenCarry m, never out of the part
   *   of the pitch the words name, never nearer than 9 m to where the pass goes), shielding first when the wait is
   *   longer than that run;
   * and then the ball is played, at a ball's speed, to where the runner arrives: ball and man meet on the run.
   * The times are the settled segment's: nothing is added (pace cannot grow here). Returns the new list of beats (the
   * caller makes the segment again from them), or null when there is nothing to play. Not for a restart (a throw-in,
   * a free kick, a kick-off: the ball is dead), nor a keeper. No random number is drawn. */
  var RESTART6 = { 'throw-in': 1, 'goal kick': 1, 'free kick': 1, 'corner kick': 1, 'kick-off': 1, 'keeper throw': 1 };
  function wwHold(st, seg, ctx) {
    var K = seg.keys, B = seg.beats, c = track(seg); if (!c || !c.legs || !B || !B.length) return null;
    var start = FROMV ? FROMV.get(seg) : null, conv = {}, any = false, k;
    for (k = 0; k < B.length; k++) {
      var b = B[k]; if (!b || b.kind !== 'pass' || !b.from || RESTART6[b.note] || b.drop || b.fixedBall) continue;
      /* (not a ball played behind their defence for a man to run onto: its runner must hold his run until it is played
       * and then run onto it, which is the ball's flight, helper T's "meet"; played as a shield here, the runner was
       * drawn already gone when the ball left, claimscheck card.runbehind) */
      if ((b.note === 'through ball' || b.note === 'over the top') && !G8.thru) continue;   /* (kmtree5 a8, helper G: behind the switch thru, off by default, it is played as a shield and helper T's ball strikes it) */
      if (k === 0 && start && (start.restart || start.kickoff)) continue;
      var fm = P.byId(st, b.from); if (!fm || isKeeperP(st, fm)) continue;
      var h = holdOf(seg, k);
      /* kmtree5 a8 (helper G), switch twait: with helper T's ball on the page, the wait is the one the BALL shows (the
       * seconds it is at the passer's feet in this pass's beat before it is struck: tWait6), not the one a5's ball
       * would have shown. T's ball is struck earlier than a5's when it needs more time (a ball in the air) or is
       * played early into a run, and it waits where a5's did not (a cross or a cut-back before a shot: a5 floated
       * the ball, T's stands on it). */
      if (G8.twait && T6 && !TBRK.ball) { var h6 = tWait6(seg, c, k); if (h6 != null && h6 > h) h = h6; }   /* (the longer of the two: with the ball's wait alone, fewer waits were played and more standing was left: E2 1.44 to 1.85 s a match) */
      if (h > W6T.holdMin) { conv[k] = h; any = true; }
    }
    if (!any) return null;
    /* (a second try: the first came out `trim` s longer than the segment with its wait, so the longest wait is played
     * that much shorter) */
    var trimK = -1; if (ctx && ctx.trim > 0) { for (k = 0; k < B.length; k++) if (conv[k] && (trimK < 0 || conv[k] > conv[trimK])) trimK = k; if (conv[trimK] - ctx.trim < W6T.holdMin) return null; }
    var out = [], cutOk = !midCut(seg) && cutAt(seg) == null;   /* (one cut a segment: not where the ball goes dead in it already) */
    for (k = 0; k < B.length; k++) {
      var bk = {}, src = B[k]; for (var f in src) bk[f] = src[f];
      bk.dur = K[k + 1].t - K[k].t;
      if (conv[k] && W6.cut && cutOk && bk.dur > W6T.cutOver) {
        /* kmtree5 a6 (helper W) part 3, THE LONG-RUN CUT (an option, off by default: KM_W_LONGRUN=cut, ?longrun=cut). The
         * beat would last more than W6T.cutOver s because its man is far: the man on the ball takes one touch, the
         * picture CUTS (the page's own cut, as at a restart), and it is the picture of him arriving: everyone where
         * the settled play ends, the runner as far from his spot as his legs cover in the time the ball takes, the ball
         * still at the passer's feet; then it is played. */
        var cb = wwCut(st, seg, c, k);
        if (cb) { out.push(cb.touch); bk.dur = cb.passDur; bk.ww = 'release'; out.push(bk); cutOk = false; W6S.cuts++; continue; }
      }
      if (conv[k]) {
        /* (the runner now sets off at once, where a5's rule had him wait until his legs' time plus half a second was
         * all that was left: so a long wait can be W6T.slack s shorter, and the result with it) */
        var slack6 = conv[k] > 1.6 && src.to && src.to === K[K.length - 1].holder && src.note !== 'through ball' && src.note !== 'over the top' ? W6T.slack : 0;
        if (k === trimK) slack6 += ctx.trim;
        var legs6 = wwLegs(st, seg, c, k, conv[k] - 0.12 - slack6, ctx || {}), used = 0;
        legs6.forEach(function (l) { out.push(l); used += l.dur; });
        bk.dur = Math.max(0.25, bk.dur - used - slack6); bk.ww = 'release';
        if (legs6.length) bk.from = legs6[legs6.length - 1].holder;
      }
      out.push(bk);
    }
    return out;
  }
  /* kmtree5 a8 (helper G): the seconds the ball's own track (helper T) keeps the ball at the passer's feet inside pass
   * beat k before it is struck; 0 when it is struck at once or before the beat; null when the track has no flight of
   * that beat by that man (the caller keeps a5's holdOf) */
  function tWait6(seg, c, k) {
    var tb = c.tball === undefined ? (c.tball = tBallTrack(seg, c)) : c.tball; if (!tb || !tb.ph) return null;
    var K = seg.keys, b = seg.beats[k];
    for (var i = 0; i < tb.ph.length; i++) {
      var p = tb.ph[i]; if (p.type !== 'fly' || p.k !== k || p.mode === 'cut' || p.mode === 'poke') continue;
      var pv = tb.ph[i - 1];
      if (!pv || pv.type !== 'feet' || pv.man !== b.from) return p.t0 <= K[k].t + 0.05 ? 0 : null;
      return Math.max(0, p.t0 - Math.max(pv.t0, K[k].t));
    }
    return null;
  }
  /* a segment made again starts with the waits of the first making already spent (settle's own budgets, kept on the
   * segment): the time the play waited is in its beats now, and it does not wait the same seconds twice. Of the wait
   * for the man the decision is about, W6T.again s may be waited again (a man who comes out a step late). */
  function wwSpent(seg, old) {
    ['waitedClaims', 'waitedShot', 'waitedKick', 'waitedFoul', 'waitedOver', 'waitedCut'].forEach(function (k) { if (old[k]) seg[k] = old[k]; });
    if (old.waited) seg.waited = Math.max(old.waitedClaims || 0, old.waited - W6T.again);
  }
  /* the two beats of a long-run cut before pass beat k: the touch (its end key is the picture cut to) and how long the
   * pass then takes */
  function wwCut(st, seg, c, k) {
    var K = seg.keys, b = seg.beats[k], H = b.from, team = b.team, dir = dirOf(team), R = b.to;
    var c0 = K[k].ball0 || K[k].ball, M = K[k + 1].ball0 || K[k + 1].ball;
    if (!R || R === H) return null;
    var fl = Math.max(0.25, passDur(P.dist(c0, M))), tau = fl + W6T.cutLead;
    var ixE = Math.max(0, Math.min(c.n, Math.round(K[k + 1].t / c.h))), full = {};
    for (var id in c.idx) { var q = posAt(c, ixE, id); if (q) full[id] = { x: q.x, y: q.y }; }
    /* the runner: on the path his legs ran, where what is left is what he covers from a standing start in tau */
    var rE = posAt(c, ixE, R); if (!rE) return null;
    var want = legReach(tau) * 0.85, at = null;
    for (var i = ixE; i >= Math.round(K[k].t / c.h); i--) { var q2 = posAt(c, i, R); if (q2 && P.dist(q2, rE) >= want) { at = q2; break; } }
    if (!at) return null;   /* (he was never that far: no cut) */
    full[R] = { x: at.x, y: at.y };
    var u = unit6(M.x - c0.x, M.y - c0.y), to = clampPt({ x: c0.x + u.x * 1.0, y: c0.y + u.y * 1.0 });
    full[H] = { x: P.clamp(to.x, 0.6, P.W - 0.6), y: P.clamp(to.y - dir * P.BALL_OFF, 0.6, P.L - 0.6) };
    var pin = {}; pin[R] = full[R];
    return { touch: { kind: 'carry', team: team, from: H, to: H, ball: to, dur: 0.45, holder: H, poss: team, note: null, ww: 'cut', cut6: true, pos: full, pin: pin }, passDur: tau };
  }
  function unit6(x, y) { var l = Math.sqrt(x * x + y * y) || 1; return { x: x / l, y: y / l }; }
  /* the beats of a wait of W seconds before pass beat k of a settled segment */
  function wwLegs(st, seg, c, k, W, ctx) {
    var K = seg.keys, b = seg.beats[k], H = b.from, team = b.team, dir = dirOf(team), def = other(team), start = FROMV ? FROMV.get(seg) : null;
    var c0 = K[k].ball0 || K[k].ball, M = (K[k + 1].ball0 || K[k + 1].ball), ix = Math.max(0, Math.min(c.n, Math.round(K[k].t / c.h)));
    function at(id) { return posAt(c, ix, id); }
    /* the man of theirs on him: the card's, the scene's, else the nearest; within 9 m of the ball when the wait starts */
    var cand = [];
    if (ctx.opt && ctx.opt.foil && P.teamOf(st, ctx.opt.foil) === def && !isKeeperP(st, ctx.opt.foil)) cand.push(ctx.opt.foil.id);
    if (ctx.near && P.teamOf(st, ctx.near) === def && !isKeeperP(st, ctx.near)) cand.push(ctx.near.id);
    var nearest = null, nd = 1e9, opp = [];
    outfield(st, def).forEach(function (q) { var a = at(q.id); if (!a) return; opp.push(a); var d = P.dist(a, c0); if (d < nd) { nd = d; nearest = q.id; } });
    /* kmtree5 a8 (helper G): not a man who plays the ball later in this result (he has to be where he plays it: a
     * centre-back kept on the crosser cannot head the cross away), nor the man who has it when the result ends */
    var busy6 = {};
    if (G8.busy) { for (var kb6 = k + 1; kb6 < seg.beats.length; kb6++) { var bb6 = seg.beats[kb6]; if (bb6 && bb6.from) busy6[bb6.from] = 1; if (bb6 && bb6.to) busy6[bb6.to] = 1; } if (K[K.length - 1].holder) busy6[K[K.length - 1].holder] = 1; }
    if (G8.busy && (cand.some(function (id) { return busy6[id]; }) || busy6[nearest])) {
      G8S.busy++; cand = cand.filter(function (id) { return !busy6[id]; });
      if (busy6[nearest]) { nearest = null; nd = 1e9; outfield(st, def).forEach(function (q) { var a = at(q.id); if (!a || busy6[q.id]) return; var d = P.dist(a, c0); if (d < nd) { nd = d; nearest = q.id; } }); }
    }
    var pr = null; cand.forEach(function (id) { var a = at(id); if (!pr && a && P.dist(a, c0) < 9) pr = id; });
    if (!pr && nearest && nd < 6) pr = nearest;
    var rq = b.to ? at(b.to) : null, side = rq ? (rq.x >= c0.x ? 1 : -1) : (c0.x < 34 ? -1 : 1);   /* the side the runner comes up */
    var legs = [], cur = { x: c0.x, y: c0.y }, n, i, tAt = K[k].t, thru6 = b.note === 'through ball' || b.note === 'over the top';
    function leg(to, dur, kind) {
      to = clampPt({ x: P.clamp(to.x, 3, P.W - 3), y: P.clamp(to.y, 3, P.L - 3) });
      var l = { kind: 'carry', team: team, from: H, to: H, ball: to, dur: dur, holder: H, poss: team, note: null, ww: kind, pin: {} };
      if (pr) { l.pin[pr] = clampPt({ x: to.x - side * 1.0, y: to.y + dir * W6T.press }); l.press6 = pr; }
      /* (the man the pass is for is on his run: at the end of this leg he is where his legs had him at that time in
       * the settled segment, so the plan and the legs agree and nothing waits twice) */
      tAt += dur;
      var rr = b.to && b.to !== H ? posAt(c, Math.max(0, Math.min(c.n, Math.round(tAt / c.h))), b.to) : null;
      if (rr) { l.pin[b.to] = { x: rr.x, y: rr.y }; if (!thru6) l.for6 = b.to; }   /* (the runner of a ball played behind their defence does not go early: he holds his run until it is played, as in a5) */
      /* (and everyone else is where he was at that time in the settled segment: only the man on the ball and the man
       * on him do something new, so the men the next picture's words are about get to their places as they did) */
      var ixL = Math.max(0, Math.min(c.n, Math.round(tAt / c.h))), full = {};
      for (var id6 in c.idx) { var pq6 = posAt(c, ixL, id6); if (pq6) full[id6] = { x: pq6.x, y: pq6.y }; }
      full[H] = { x: P.clamp(to.x, 0.6, P.W - 0.6), y: P.clamp(to.y - dir * P.BALL_OFF, 0.6, P.L - 0.6) };
      if (pr) full[pr] = l.pin[pr];
      l.pos = full;
      legs.push(l); cur = to;
    }
    /* the run into space, when nobody is on him: toward where the pass goes, turned away from the nearest of theirs */
    var run = null, holdWords = /\bholds it\b/.test(String((ctx.opt && ctx.opt.label) || '')) && /takes the pass from/.test(String(ctx.text || ''));   /* (a card that says he HoutS it: small touches only, never a run with it) */
    if (!pr && !holdWords && b.note !== 'through ball' && b.note !== 'over the top') {   /* (a ball played behind their defence is played from where he has it: its words give the metres it goes past the runner, claimscheck card.runbehind) */
      var dM = P.dist(c0, M), room = Math.min(W6T.lenCarry, dM - Math.max(9, dM * 0.5), W * W6T.vCarry);
      if (room > 2.5) {
        var uM = unit6(M.x - c0.x, M.y - c0.y), best = null, bs = -1;
        /* (never across the line the runner is running: where his legs had him, every quarter second from now to the end) */
        var path6 = []; if (b.to && b.to !== H) for (var tp = K[k].t; tp <= K[k + 1].t + 1e-6; tp += 0.25) { var pp = posAt(c, Math.max(0, Math.min(c.n, Math.round(tp / c.h))), b.to); if (pp) path6.push(pp); }
        function clearOf(e) { var m = 99; path6.forEach(function (q) { m = Math.min(m, P.dist(q, e), P.dist(q, { x: (c0.x + e.x) / 2, y: (c0.y + e.y) / 2 })); }); return m; }
        [0, 0.6, -0.6, 1.2, -1.2].forEach(function (a) {
          var ca = Math.cos(a), sa = Math.sin(a), u = { x: uM.x * ca - uM.y * sa, y: uM.x * sa + uM.y * ca };
          for (var L = room; L > 2.4; L *= 0.6) {
            var e = { x: c0.x + u.x * L, y: c0.y + u.y * L };
            if (e.x < 3 || e.x > P.W - 3 || e.y < 3 || e.y > P.L - 3 || zoneOf(e) !== zoneOf(c0) || (e.y < P.L / 2) !== (c0.y < P.L / 2) || clearOf(e) < 6) continue;
            var md = 99; opp.forEach(function (q) { md = Math.min(md, P.dist(q, e)); });
            var sc = Math.min(md, 8) + L * 0.3 - Math.abs(a) * 0.5;
            if (sc > bs) { bs = sc; best = { to: e, len: L }; }
            break;
          }
        });
        if (best) run = best;
      }
    }
    var tRun = run ? run.len / W6T.vCarry : 0, tSh = Math.max(0, W - tRun);
    if (run && tSh < 0.5) { tRun = W; tSh = 0; }
    /* the shield: small touches round a triangle, starting away from the side the runner comes up */
    if (tSh > 0) {
      /* (round a small ring, W6T.turn degrees a touch: first back and away from the runner's side, then forward, then out
       * again: gentle turns, so his legs never slow to a stand between two touches) */
      n = Math.max(1, Math.round(tSh / W6T.leg)); var dl = tSh / n, L1 = W6T.vShield * dl, a0 = Math.atan2(-0.5, -0.85), st6 = W6T.turn * Math.PI / 180, sg = -1;
      /* (when he arrives running, the ring starts the way he is going and turns from there: no stop to turn round) */
      var h1 = at(H), h0 = posAt(c, Math.max(0, ix - 6), H);
      if (h1 && h0 && ix >= 6) { var hvx = (h1.x - h0.x) / (6 * c.h), hvy = (h1.y - h0.y) / (6 * c.h); if (Math.sqrt(hvx * hvx + hvy * hvy) > 1.2) { a0 = Math.atan2(hvy * dir, hvx * side); sg = Math.sin(a0) >= 0 ? 1 : -1; a0 += sg * st6 * 0.6; } }   /* (turning away from the runner's side: the ring's middle is on the far side of him) */
      else if (k === 0 && start && start.vel && start.vel[H]) { var sv = start.vel[H]; if (Math.sqrt(sv.x * sv.x + sv.y * sv.y) > 1.2) { a0 = Math.atan2(sv.y * dir, sv.x * side); sg = Math.sin(a0) >= 0 ? 1 : -1; a0 += sg * st6 * 0.6; } }
      for (i = 0; i < n; i++) { var an = a0 + sg * i * st6, ux = Math.cos(an) * side, uy = Math.sin(an) * dir; leg({ x: cur.x + ux * L1, y: cur.y + uy * L1 }, dl, 'shield'); }
    }
    if (run && tRun > 0) {
      n = Math.max(1, Math.round(tRun / 1.6));
      var o0 = { x: cur.x - c0.x, y: cur.y - c0.y };
      for (i = 1; i <= n; i++) leg({ x: c0.x + o0.x * (1 - i / n) + (run.to.x - c0.x) * i / n, y: c0.y + o0.y * (1 - i / n) + (run.to.y - c0.y) * i / n }, tRun / n, 'run');
    }
    return legs;
  }

  /* the picture at time t, with the movement layer */
  function frameAt(seg, t) {
    if (m8On() && seg && t < seg.duration && t > seg.duration - 1e-9) t = seg.duration;   /* m8: the end is the end (a clock a hair short of it must not read the track's last sample) */
    if (A2 && moveOn() && seg && seg.keys && seg.keys.length > 1) track(seg);   /* a2: settled first, so even the end picture is the legs' */
    var fr = rawFrameAt(seg, t);
    /* kmtree5 a6 (helper T): a picture that starts with the ball in the air (the last one ended so) starts with it in the air */
    if (T6 && !TBRK.ball && t <= 0 && !fr.ball.z && FROMV && moveOn()) { var s6 = FROMV.get(seg); if (s6 && s6.ball && s6.ball.z) fr.ball.z = s6.ball.z; }
    if (fr.done || t <= 0 || !moveOn()) return fr;
    var tr = track(seg);
    if (!tr) return fr;
    var cT = cutAt(seg);
    var mK = midCut(seg);
    var tc = twoCuts(seg), cTw = tc ? tc.end : (!mK ? cT : null);   /* (kmtree5 a4: the whistle's time when there are two cuts) */
    if (tc && t >= tc.end) { fr.pos = seg.keys[seg.keys.length - 1].pos; fr.cut = true; fr.cutN = 2; return fr; }
    if (tc) cT = tc.mid;
    if (cT != null && t >= cT && !mK) { fr.pos = seg.keys[seg.keys.length - 1].pos; fr.cut = true; return fr; }   /* m8: after the cut at the whistle, the free-kick picture */
    if (cT != null && t >= cT && mK) fr.cut = true;   /* a2: the cut to a restart in the middle of the play (the page cuts once) */
    /* sample i is at time min(duration, i * h): the last one is AT the end */
    var i0 = Math.min(tr.n - 1, Math.floor(t / tr.h)), i1 = i0 + 1, ta = i0 * tr.h, tb = Math.min(seg.duration, i1 * tr.h);
    var u = tb > ta ? Math.max(0, Math.min(1, (t - ta) / (tb - ta))) : 1;
    if (cT != null && tb >= cT - 1e-9 && !(mK && t >= cT)) u = 0;   /* (m8: never blend toward the sample after the cut) */
    if (mK && cT != null && t >= cT && ta < cT - 1e-9) u = 1;   /* (a2: past a cut in the middle of a play: the restart picture, never a blend across it) */
    var A = tr.buf ? null : tr.frames[i0], B = tr.buf ? null : tr.frames[i1], pos = {};
    for (var id in fr.pos) {
      var a = tr.buf ? posAt(tr, i0, id) : A[id], b = tr.buf ? posAt(tr, i1, id) : B[id];
      if (!a || !b) { pos[id] = fr.pos[id]; continue; }
      /* the men fully in the play stay on the director's exact curve (the ball at the carrier's feet) */
      var w = tr.legs ? 0 : Math.min(tr.act[id] ? tr.act[id][i0] : 0, tr.act[id] ? tr.act[id][i1] : 0);   /* (a2: everyone on his legs) */
      pos[id] = w >= 0.999 ? fr.pos[id] : { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
    fr.pos = pos;
    /* kmtree5 a4 (helper P, note 2): a held pass is struck from where his legs have him at the strike (he may still be
     * slowing down from the run that brought him the ball), and flies from there at a ball's speed */
    var bt2 = fr.beat;
    if (tr.legs && bt2 && PASSY[bt2.kind] && !fr.hold && bt2.from && P4) {
      var k2 = seg.beats.indexOf(bt2), hd2 = k2 >= 0 ? holdOf(seg, k2) : 0;
      if (hd2 > 0) {
        var K2 = seg.keys, ts2 = K2[k2].t + hd2, lp2 = posAt(tr, Math.min(tr.n, Math.max(0, Math.round(ts2 / tr.h))), bt2.from);
        if (lp2 && t > ts2) {
          var sd2 = bt2.team === 'you' ? 1 : -1, sb2 = { x: lp2.x, y: lp2.y + sd2 * P.BALL_OFF }, eb2 = K2[k2 + 1].ball;
          var u2 = Math.max(0, Math.min(1, (t - ts2) / Math.max(1e-6, K2[k2 + 1].t - ts2))), w2 = 1 - Math.pow(1 - u2, 1.6);
          fr.ball = { x: sb2.x + (eb2.x - sb2.x) * w2, y: sb2.y + (eb2.y - sb2.y) * w2, z: fr.ball.z || 0 };
        }
      }
    }
    /* a2: the ball at the feet of the man running with it, where his legs have him */
    if (tr.legs && bt2 && (bt2.kind === 'carry' || bt2.kind === 'dribble' || fr.hold) && bt2.from && pos[bt2.from]) {
      var dy2 = (fr.hold ? bt2.team : bt2.poss) === 'you' ? 1 : -1, rb2 = fr.ball;
      fr.ball = { x: pos[bt2.from].x, y: pos[bt2.from].y + dy2 * P.BALL_OFF, z: 0 };
      /* kmtree5 a4 (helper P, mvcheck2 V10): in the last 0.5 s before the whistle the ball is knocked on to the spot of
       * the foul (where the free kick is taken), however far behind the man's legs left him */
      if (P4 && !PBRK.fkspot && cTw != null && t > cTw - 0.5 && t <= cTw + 1e-9 && rb2) {
        var wF = Math.min(1, (t - (cTw - 0.5)) / 0.5); wF = wF * wF * (3 - 2 * wF);
        fr.ball = { x: fr.ball.x + (rb2.x - fr.ball.x) * wF, y: fr.ball.y + (rb2.y - fr.ball.y) * wF, z: 0 };
      }
    }
    /* kmtree5 a6 (helper T): the ball's own track (tBallTrack) replaces the ball and who has it; the men are untouched */
    if (T6 && !TBRK.ball && !NOBT && tr.legs) {
      var bt6 = tr.tball;
      if (bt6 === undefined) { try { bt6 = tBallTrack(seg, tr); } catch (e6) { bt6 = null; } tr.tball = bt6; }   /* (T2: an error in the ball's track must never stop the page: a5's ball is drawn; t2_fast.js counts such plays and fails) */
      if (bt6) {
        fr.ball = { x: bt6.x[i0] + (bt6.x[i1] - bt6.x[i0]) * u, y: bt6.y[i0] + (bt6.y[i1] - bt6.y[i0]) * u, z: bt6.z[i0] + (bt6.z[i1] - bt6.z[i0]) * u };
        fr.holder = bt6.who[u < 0.5 ? i0 : i1] || null;
      }
    }
    return fr;
  }

  /* ------------------------------------------------------------ words */
  /* d1: one plain line for each event, for the commentator during play */
  /* a2 (helper T): THE WORDS FOLLOW THE PICTURE. The page and the checks call segment and resolve through these
   * two (the API exports them): they call the director's own, unchanged, then (1) note for every event of the
   * segment where its frames are, so lineOf can say what the event looks like (a "back pass" that the picture
   * draws going forward is said as the pass it is), and (2) fit the words of the menu read over the picture
   * that segment ends on (phrases.js fitMenu: a "short" pass to a man 21 m away is not called short). They read
   * the picture and change words only: no position, no time, nothing in the match. */
  var WORDS = typeof WeakMap === 'function' ? new WeakMap() : null;
  function PHS() { return root.KMPhrases || (typeof require === 'function' ? require('./phrases.js') : null); }
  function noteBeats(seg) { if (WORDS && seg && seg.beats) seg.beats.forEach(function (b, i) { if (b && typeof b === 'object') WORDS.set(b, { seg: seg, i: i }); }); }
  function endPic(seg) { var k = seg && seg.keys && seg.keys[seg.keys.length - 1]; return k ? { ball: k.ball, holder: k.holder, pos: k.pos, poss: k.poss } : null; }
  function wordsSegment(st, pending, from) {
    var seg = segment(st, pending, from);
    noteBeats(seg);
    if (PHS() && PHS().fitMenu) PHS().fitMenu(st, pending, endPic(seg));
    return seg;
  }
  function wordsResolve(st, p, o, ev, nx, from) {
    /* the director stages a result from its own words (outcomeOf, beatenIn, lostWin, scorerIn): when phrases.js
     * put a card's result in plain words, it is handed the words the engine wrote (kept on the outcome as _orig) */
    var ev0 = ev;
    if (ev && o && o.outcomes) {
      var tx = String(ev.text || ''), pre = (/^(GOAL\. |THEY SCORE\. )/.exec(tx) || [''])[0], body = tx.slice(pre.length);
      o.outcomes.forEach(function (x) { if (x && x._orig && x.text === body && x._orig !== body) ev0 = Object.assign({}, ev, { text: pre + x._orig }); });
    }
    var rs = resolve(st, p, o, ev0, nx, from);
    noteBeats(rs);
    if (PHS() && PHS().fitResult) PHS().fitResult(st, ev, rs, nx);
    if (nx && nx.continues && PHS() && PHS().fitMenu) PHS().fitMenu(st, nx, endPic(rs));
    return rs;
  }
  /* where an event's ball starts and ends on the picture (null when the event was not made here) */
  function evGeo(b) {
    var w = WORDS && WORDS.get(b);
    if (!w || !w.seg.keys || !w.seg.keys[w.i + 1]) return null;
    var k0 = w.seg.keys[w.i], k1 = w.seg.keys[w.i + 1], ph = PHS();
    if (!ph) return null;
    var ds = ph.describe(k0.ball, k1.ball, b.team === 'them' ? 'them' : 'you');
    ds.k0 = k0; ds.k1 = k1;
    return ds;
  }
  /* kmtree5 a8 (helper C, "the captions and the picture agree"): THE BEAT'S SENTENCE READS THE FRAMES, not only the two
   * key pictures. The night's other helpers changed what a beat looks like (a tackle that cannot be contact is a loose
   * ball that is collected, a kick-off "header" is a pass along the ground that is cut out, a hold is the man turning
   * with the ball) and the sentence still named the beat's kind. evPic(st, b) samples the event's own frames (frameAt,
   * every 0.1 s of the match; a tackle every 0.05 s) and says what they show:
   *   air0     the ball was in the air in the half second before the event starts (a header is a header)
   *   airC     the ball is in the air in the half second before it reaches the man it goes to (b.to)
   *   contact  a tackle: the man tackled and the man who wins it are both within 2.6 m of the ball at one moment
   *   flip     a dribble past X: he or the ball comes within 3 m of X, the ball gets from X's side to beyond him
   *            (by 0.8 s after the beat at the latest), and X is not between the ball and the goal at the beat's end
   *   ahead8   X is ahead of him within 8 m before that;  opp8: any outfield man of the other side is
   * It reads the picture and changes words only. KM_MOVE=a5 or KM_PBREAK=c8words (page: ?move=a5, ?pbreak=c8words):
   * off, the sentences of a5 to a8 exactly. */
  var C8W = (function () {
    var on = true;
    try { if (typeof process !== 'undefined' && process.env && (process.env.KM_MOVE === 'a5' || /\bc8words\b/.test(String(process.env.KM_PBREAK || '')))) on = false; } catch (e) { }
    try { var q8 = (root.location && root.location.search) || ''; if (/[?&]move=a5\b/.test(q8) || /[?&]pbreak=[\w,]*c8words\b/.test(q8)) on = false; } catch (e2) { }
    return on;
  })();
  function evPic(st, b) {
    if (!C8W || PHRASE_OFF()) return null;
    var w = WORDS && WORDS.get(b);
    if (!w || !w.seg.keys || !w.seg.keys[w.i + 1]) return null;
    if (w.pic !== undefined) return w.pic;
    w.pic = null;
    try {
      var seg = w.seg, K = seg.keys, t0 = K[w.i].t, t1 = K[w.i + 1].t, dur = seg.duration, tm = b.team === 'them' ? 'them' : 'you', dir = dirOf(tm);
      var o = { air0: false, airC: false, contact: false, flip: false, ahead8: false, opp8: false }, tt, fr, z = 0;
      for (tt = Math.max(0, t0 - 0.5); tt <= t0 + 1e-9; tt += 0.1) { fr = frameAt(seg, tt); z = Math.max(z, fr.ball.z || 0); }
      o.air0 = z > 0.12;
      if ((b.kind === 'interception' || b.kind === 'tackle') && b.to) {
        var tc = t1, hi = Math.min(dur, t1 + 1), both = b.kind === 'tackle' && b.from;
        for (tt = Math.max(0, t0 - (both ? 0.3 : 0)); tt <= hi + 1e-9; tt += 0.05) {
          fr = frameAt(seg, Math.min(tt, dur));
          var pt8 = fr.pos[b.to], near8 = pt8 && P.dist(pt8, fr.ball) <= 2.6;
          if (both && near8 && fr.pos[b.from] && P.dist(fr.pos[b.from], fr.ball) <= 2.6) o.contact = true;
          if (near8 && tt >= t0) { tc = Math.min(tt, dur); if (!both || o.contact) break; if (tt > t1 + 0.3) break; }
        }
        for (z = 0, tt = Math.max(0, tc - 0.5); tt <= tc + 1e-9; tt += 0.1) { fr = frameAt(seg, tt); z = Math.max(z, fr.ball.z || 0); }
        o.airC = z > 0.12;
      }
      if (b.kind === 'dribble' && b.from) {
        var was = false, crossed = false, mn = 1e9, opps = outfield(st, other(tm)).filter(function (q) { return !isKeeperP(st, q); });
        /* (the take-on's beat ends as he reaches the man; the ball goes beyond him in the next half second: the frames
         * are read to 0.8 s after the beat, for the man gone past only) */
        for (tt = t0; tt <= Math.min(dur, t1 + (b.past ? 0.8 : 0)) + 1e-9; tt += 0.1) {
          fr = frameAt(seg, Math.min(tt, dur));
          var pa = fr.pos[b.from]; if (!pa) continue;
          var px = b.past ? fr.pos[b.past] : null;
          if (px) {
            var s8 = (fr.ball.y - px.y) * dir, d8 = P.dist(pa, px);
            mn = Math.min(mn, d8, P.dist(fr.ball, px));
            if (s8 <= 0) was = true; else if (was && s8 > 0.5) crossed = true;
            if (tt <= t1 + 1e-9 && (px.y - pa.y) * dir > 0 && d8 <= 8) o.ahead8 = true;
          }
          if (tt > t1 + 1e-9) continue;
          for (var oi = 0; oi < opps.length && !o.opp8; oi++) { var qo = fr.pos[opps[oi].id]; if (qo && (qo.y - pa.y) * dir > 0 && P.dist(qo, pa) <= 8) o.opp8 = true; }
        }
        var ke = K[w.i + 1], endOK = !(b.past && ke.pos && ke.pos[b.past] && (ke.pos[b.past].y - ke.ball.y) * dir > 0.5);
        o.flip = crossed && mn <= 3 && endOK;
      }
      /* a long pass beat whose ball arrives early: the man it is for has it for 1.2 s or more before the beat ends
       * (he runs on with it, or stands with it): runOn = 'runs' | 'keeps' */
      var lastB = w.i === seg.beats.length - 1;   /* (the play's last beat: the man who has the ball when it stops is the man the decision is about) */
      if ((b.kind === 'pass' || b.kind === 'clearance') && b.to && (t1 - t0 >= 2.5 || lastB)) {
        for (tt = t0; tt <= t1 - (lastB ? 0.5 : 1.2) + 1e-9; tt += 0.1) {
          fr = frameAt(seg, tt);
          if (fr.holder !== b.to) continue;
          for (var zi = 1, z = 0; zi <= 5; zi++) z = Math.max(z, frameAt(seg, Math.max(0, tt - zi * 0.1)).ball.z || 0);
          o.runOn = P.dist(fr.ball, K[w.i + 1].ball) >= PHS().T.CARRY ? 'runs' : z > 0.12 && b.kind === 'clearance' ? 'drops' : 'has';
          break;
        }
      }
      w.pic = o;
    } catch (e) { w.pic = null; }
    return w.pic;
  }
  /* kmtree5 a8 (helper C): WHEN each sentence of a beat is true, for the page's caption (play.html c8CapTick). A beat's
   * clock is the plan's; the ball's own track (helper T) may strike a pass before its beat starts or deliver a ball
   * after its beat ends, so the page shows a sentence when the PICTURE reaches the thing it says:
   *   strike  who: the ball leaves him (a pass, a cross, a clearance, a shot)
   *   has     who: he has the ball (runs with it, keeps it)
   *   reach   who: the ball gets to him (he cuts it out, wins the header, takes it from x, catches it)
   *   past    who, x: he is beyond x (a dribble past a man: "runs at X" first, "goes past X" when he is past)
   *   start   the beat's own start (the whistle, the ball out of play)
   * lineOf(st, b, 'events') returns this list; lineOf(st, b) is still the one sentence of the beat. */
  /* a ball that is cut out or caught, played by a man who was running with it (the beat before is his run, or there is
   * none): the kick is its own sentence, said when the ball leaves him; without it "X runs with the ball" stayed up
   * while the ball flew to the man who stops it */
  function kicked(st, b) {
    var w = WORDS && WORDS.get(b), g = evGeo(b);
    if (!C8W || !w || !g || !b.from || b.kind === 'tackle' || g.k0.holder !== b.from) return [];
    var pv = w.i > 0 ? w.seg.beats[w.i - 1] : null;
    if (pv && !(pv.from === b.from && (pv.kind === 'carry' || pv.kind === 'dribble' || pv.touch))) return [];
    /* (forward and back are the KICKER's: the beat's team is the team that stops the ball) */
    var an = first(P.byId(st, b.from)), gn = (g.k1.ball.y - g.k0.ball.y) * dirOf(P.teamOf(st, P.byId(st, b.from)) === 'them' ? 'them' : 'you'), gd9 = g.d;
    /* kmtree5 a9 (helper G2, switch kickdir): forward or back is read from where the ball IS when he strikes it. Since
     * helper K a man about to have his pass cut out may run with the ball first inside the same beat (the wait for the
     * man who cuts it out), so the key frame's ball is not where the kick starts: the owner's 20th minute read "Ian
     * passes it back" for a ball played 8 m forward. The last frame in which he still has it is the kick's start. */
    if (G9.kickdir && w.seg && w.seg.keys[w.i + 1]) {
      var t09 = w.seg.keys[w.i].t, t19 = w.seg.keys[w.i + 1].t, sb9 = null;
      for (var tq9 = t09; tq9 < t19 - 1e-6; tq9 += 0.1) { var fq9 = frameAt(w.seg, tq9); if (fq9 && fq9.holder === b.from) sb9 = fq9.ball; else if (sb9) break; }
      if (sb9) { var gn9 = (g.k1.ball.y - sb9.y) * dirOf(P.teamOf(st, P.byId(st, b.from)) === 'them' ? 'them' : 'you'); if ((gn9 < 0) !== (gn < 0)) G9S.kickdir++; gn = gn9; gd9 = P.dist(sb9, g.k1.ball); }
    }
    return [{ on: 'strike', who: b.from, text: an + (gn < 0 ? ' passes it back.' : gd9 >= PHS().T.LONG && gn >= 15 ? ' plays a long ball forward.' : ' passes it forward.') }];
  }
  function capEvents(st, b) {
    var t = lineOf(st, b), k = b.kind;
    if (!t) return [];
    if (b.drop && b.to) return [{ on: 'reach', who: b.to, text: t }];
    if (b.touch && b.from) return [{ on: 'has', who: b.from, text: t }];
    if ((k === 'kickoff' || k === 'pass' || k === 'clearance' || k === 'shot') && b.from) {
      var evs = [{ on: 'strike', who: b.from, text: t }], pc = evPic(st, b);
      if (pc && pc.runOn && b.to) { var rn8 = first(P.byId(st, b.to)); evs.push({ on: 'has', who: b.to, text: pc.runOn === 'runs' ? rn8 + ' runs with the ball.' : pc.runOn === 'drops' ? 'The ball comes down to ' + rn8 + '.' : rn8 + ' has the ball.' }); }
      return evs;
    }
    if (k === 'carry' && b.from) return [{ on: 'has', who: b.from, text: t }];
    if (k === 'dribble' && b.from) {
      var pic = evPic(st, b);
      if (b.past && pic && pic.flip) {
        var ev = [];
        if (pic.ahead8) ev.push({ on: 'has', who: b.from, x: b.past, text: first(P.byId(st, b.from)) + ' runs at ' + first(P.byId(st, b.past)) + ' with the ball.' });
        ev.push({ on: 'past', who: b.from, x: b.past, text: t });
        return ev;
      }
      return [{ on: 'has', who: b.from, x: b.past && pic && pic.ahead8 && !pic.flip ? b.past : null, text: t }];   /* ("runs at X" is dropped once X is no longer ahead of him) */
    }
    if ((k === 'tackle' || k === 'interception') && b.to) return kicked(st, b).concat([{ on: 'reach', who: b.to, x: b.from || null, text: t }]);
    if (k === 'save') { var kw = b.note === 'parried' ? b.from : b.to; return kw ? kicked(st, b).concat([{ on: 'reach', who: kw, text: t }]) : [{ on: 'start', text: t }]; }
    return [{ on: 'start', text: t }];
  }
  function lineOf(st, b, part) {
    /* a2 (helper T): the words of an event follow what the picture draws (lineOf0 is the sentence by kind) */
    if (part === 'events') return capEvents(st, b);   /* (kmtree5 a8, helper C) */
    var g = evGeo(b), t = lineOf0(st, b);
    if (!g || PHRASE_OFF() || b.drop || b.touch) return t;
    var a = b.from ? P.byId(st, b.from) : null, r = b.to ? P.byId(st, b.to) : null, an = first(a), rn = first(r);
    /* kmtree5 a8 (helper C): the sentence says what the frames show (evPic above; null when the switch is off) */
    var pic = evPic(st, b);
    if (pic) {
      /* a header is a ball in the air; a ball along the ground is cut out, kicked away, shot */
      if (b.kind === 'interception' && r && b.note === 'header' && !pic.airC) return a && g.k0.holder === b.from ? rn + ' cuts out the pass from ' + an + '.' : rn + ' cuts it out.';
      if (b.kind === 'clearance' && a && b.note === 'header' && !pic.air0) return an + ' kicks it away.';
      if (b.kind === 'shot' && a && !pic.air0 && (b.note === 'header' || (b.note === 'over the bar' && b.head))) return an + (b.note === 'header' ? ' shoots.' : ' shoots over the bar.');
      /* a tackle is two men at the ball; a ball that leaves the one and is collected by the other is said as that */
      if (b.kind === 'tackle' && a && r && !pic.contact) return an + ' loses the ball and ' + rn + ' collects it.';
      /* a dribble: "goes past X" when the frames show him go past X; "runs at X" when X is ahead of him within 8 m;
       * "runs at their defence" when one of theirs is; otherwise he runs with the ball */
      if (b.kind === 'dribble' && a) {
        var pm8 = b.past ? first(P.byId(st, b.past)) : null;
        if (pm8 && pic.flip) return an + ' goes past ' + pm8 + ' with the ball.';
        if (pm8 && pic.ahead8) return an + ' runs at ' + pm8 + ' with the ball.';
        if (g.d < PHS().T.CARRY) return an + ' keeps the ball.';
        return pic.opp8 && g.gain > 0 ? an + ' runs at ' + (P.teamOf(st, a) === 'them' ? 'your' : 'their') + ' defence with the ball.' : an + ' runs with the ball.';
      }
    }
    if (b.kind === 'pass' && r) {
      var ph = PHS(), note = b.note;
      /* the one way a pass is named (phrases.js geoVerb), for every pass that is not a restart, a cross, a header,
       * a pass and return, or a ball over their defence (second pass: the review of night a2) */
      var KEEP = { 'throw-in': 1, 'goal kick': 1, 'free kick': 1, 'keeper throw': 1, 'corner kick': 1, 'header': 1, 'over the top': 1, 'cross': 1 };
      if (note === 'over the top' && g.gain < 10) KEEP['over the top'] = 0;   /* "over their defence" only for a ball that goes 10 m or more forward */
      if (note === 'header' && pic && !pic.air0) KEEP['header'] = 0;   /* (kmtree5 a8, helper C: "heads it down to" only for a ball that came to him in the air) */
      /* a cross comes from a wing; from the middle it is a ball into the box when it lands inside the box's width */
      var inW = g.k1.ball.x >= 13.84 && g.k1.ball.x <= 54.16;
      if (note === 'cross' && g.laneA === 1) return inW ? an + ' plays it into the box towards ' + rn + '.' : an + ' ' + ph.geoVerb(g) + ' ' + rn + '.';
      if (note === 'cross' && !inW) return an + ' ' + ph.geoVerb(g) + ' ' + rn + '.';
      if (!KEEP[note]) return g.d < 3 ? an + ' gives it to ' + rn + '.' : an + ' ' + ph.geoVerb(g) + ' ' + rn + '.';
      return t;
    }
    if (b.kind === 'carry' && g.d < PHS().T.CARRY) return an + ' keeps the ball.';
    /* "goes past Y": at the end Y is no longer between the ball and the goal; otherwise he runs at Y */
    if (b.kind === 'dribble' && b.past && g.k1.pos && g.k1.pos[b.past] && (g.k1.pos[b.past].y - g.k1.ball.y) * (b.team === 'them' ? -1 : 1) > 0.5) return an + ' runs at ' + first(P.byId(st, b.past)) + ' with the ball.';
    if (b.kind === 'dribble' && !b.past && (g.d < PHS().T.CARRY || g.gain <= 0)) return g.d < PHS().T.CARRY ? an + ' keeps the ball.' : an + ' runs with the ball.';
    return t;
  }
  function PHRASE_OFF() { var b = typeof process !== 'undefined' && process.env && process.env.T_PHRASE_BREAK; return b === 'nofit' || b === 'noline'; }
  function lineOf0(st, b) {
    var a = b.from ? P.byId(st, b.from) : null, t = b.to ? P.byId(st, b.to) : null;
    var an = first(a), tn = first(t);
    var side = function (tm) { return tm === 'you' ? 'your' : 'their'; };
    var opp = function (tm) { return tm === 'you' ? 'their' : 'your'; };
    if (b.drop && t) return 'The ball comes down to ' + tn + '.';   /* (kmtree5 a4: a ball in the air reaching the man who heads or kicks it away) */
    if (b.touch && a) return an + ' keeps the ball.';   /* (kmtree5 a4: the touch before a pass) */
    switch (b.kind) {
      case 'kickoff': return 'Kick-off. ' + an + ' plays it to ' + tn + '.';
      case 'pass':
        if (!t) return an + ' kicks it towards ' + (b.poss === b.team ? 'a team-mate' : 'nobody') + '.';
        switch (b.note) {
          case 'throw-in': return an + ' takes the throw-in, to ' + tn + '.';
          case 'goal kick': return an + ' takes the goal kick, to ' + tn + '.';
          case 'free kick': return an + ' takes the free kick, to ' + tn + '.';
          case 'keeper throw': return an + ' throws it out to ' + tn + '.';
          case 'corner kick': return an + ' takes the corner.';
          case 'cross': return an + ' crosses it towards ' + tn + '.';
          case 'over the top': return an + ' plays it over ' + opp(b.team) + ' defence for ' + tn + '.';
          case 'switch of play': return an + ' hits it across the pitch to ' + tn + '.';
          case 'one-two': return an + ' and ' + tn + ' play a one-two.';
          case 'back pass': return an + ' passes it back to ' + tn + '.';
          case 'through ball': return an + ' passes it through to ' + tn + '.';
          case 'cut-back': return an + ' pulls it back to ' + tn + '.';
          case 'header': return an + ' heads it down to ' + tn + '.';
          case 'long ball': case 'in the air': return an + ' plays a long ball to ' + tn + '.';
          default: return an + ' passes to ' + tn + '.';
        }
      case 'carry': return an + ' runs with the ball.';
      case 'dribble': {
        var pm = b.past ? first(P.byId(st, b.past)) : null;
        return pm ? an + ' goes past ' + pm + ' with the ball.' : an + ' runs at ' + (P.teamOf(st, a) === 'them' ? 'your' : 'their') + ' defence with the ball.';
      }
      case 'tackle': return tn + ' takes the ball from ' + an + '.';
      case 'interception': return b.note === 'header' ? tn + ' wins the header.' : tn + ' cuts out the pass from ' + an + '.';
      case 'clearance':
        if (b.note === 'out for a corner') return an + ' puts it behind his own goal line.';
        return an + (b.note === 'header' ? ' heads it away.' : ' kicks it away.');
      case 'shot':
        if (b.note === 'blocked') return an + ' shoots, and it is blocked.';
        if (b.note === 'header') return an + ' heads it at goal.';
        if (b.note === 'wide') return an + ' shoots wide.';
        if (b.note === 'over the bar') return an + (b.head ? ' heads it over the bar.' : ' shoots over the bar.');
        if (b.note === 'goal') return an + ' shoots.';
        return an + ' shoots.';
      case 'save':
        if (b.note === 'parried') return an + ' pushes it out.';
        if (b.note === 'catch' || b.note === 'collects') return tn + ' catches it.';
        return tn + ' has the ball.';
      case 'out':
        if (b.note === 'corner') return 'Corner to ' + (b.team === 'you' ? 'your team' : 'them') + '.';
        if (b.note === 'throw-in') return 'Out of play: a throw-in to ' + (b.team === 'you' ? 'your team' : 'them') + '.';
        if (b.note === 'goal kick') return 'Out of play: a goal kick to ' + (b.team === 'you' ? 'your team' : 'them') + '.';
        return 'The ball goes out of play.';
      case 'foul':
        if (b.note === 'offside') return an + ' is offside. Free kick to ' + (b.team === 'you' ? 'them' : 'your team') + '.';
        return an + ' fouls ' + tn + '. Free kick to ' + (b.team === 'you' ? 'them' : 'your team') + '.';
      default: return '';
    }
  }

  var API = {
    TARGET: TARGET, LONG_PLAN: LONG_PLAN, MAX_PLAY: MAX_PLAY, playLength: playLength, mulberry: mulberry, seedOf: seedOf,
    kickoffState: kickoffState, segment: wordsSegment, resolve: wordsResolve, frameAt: frameAt, keyPos: keyPos,   /* a2 (helper T): the words follow the picture, see WORDS below */
    /* d1 */
    lineOf: lineOf, outcomeOf: outcomeOf, beatenIn: beatenIn, LEADS: LEADS, GUARD: GUARD,
    /* m3 */
    lostWin: lostWin,
    /* mv1 */
    rawFrameAt: rawFrameAt, track: track, MV: MV, posAt: posAt,
    /* m8 */
    stopEnd: stopEnd, cutAt: cutAt, twoCuts: twoCuts,
    /* a2 */
    settle: settle, BRK: BRK, legReach: legReach,
    /* kmtree5 a4 (helper P) */
    holdOf: holdOf, PBRK: PBRK,
    /* kmtree5 a6 (helper T) */
    T6: T6, TBRK: TBRK, ballTrack: function (seg) { var tr = track(seg); if (!tr || !tr.legs || !T6 || TBRK.ball) return null; if (tr.tball === undefined) tr.tball = tBallTrack(seg, tr); return tr.tball; },
    /* kmtree5 a6 (helper W) */
    W6: W6, W6T: W6T, W6S: W6S,
    /* kmtree5 a8 (helper G) */
    G8: G8, G8T: G8T, G8S: G8S,
    K8: K8, K8T: K8T, K8S: K8S,   /* kmtree5 a8 (helper K) */
    G9: G9, G9T: G9T, G9S: G9S   /* kmtree5 a9 (helper G2) */
  };
  root.KMDirector = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
