/* phrases.js (kmtree5 a2, helper T): WORDS THAT MATCH THE PICTURE.
 *
 * One place that says, from positions on the pitch, what a pass, a carry or a run looks like, so every sentence
 * that names one reads from here instead of from a fixed template written before the picture existed.
 *
 * The thresholds (claimscheck.js measures the page's sentences against the same numbers):
 *   short    a pass of SHORT m or less (15)
 *   long     a pass of LONG m or more (30)
 *   across   the ball changes channel: left x < 22, centre 22 to 46, right x > 46 (the user's view)
 *   switch   across, and at least SWITCH m sideways (20)
 *   back     the ball (or the receiver) ends behind where it started, toward the passer's own goal (gain < 0)
 *   forward  gain > 0
 *   carry    the ball moves CARRY m or more with the man (2)
 *
 *   KMPhrases.T                       the thresholds
 *   KMPhrases.describe(a, b, team)    a and b are points ({x, y}); team 'you' | 'them' (whose attack)
 *        -> { d, gain, dx, laneA, laneB, short, long, back, forward, across, switched, side }
 *   KMPhrases.passVerb(desc)          the words for a pass that looks like desc, e.g. 'plays it short to',
 *        'passes it back to', 'passes it across to', 'passes it forward to', 'plays a long ball to', 'passes it to'
 *   KMPhrases.spots(squad, holder, zone)
 *        the places the pitch will draw your men at a decision of your attack in `zone` (0 your half, 1 midfield,
 *        2 the edge of their box, 3 their box), with `holder` on the ball: pitch.js's own startOf (without the
 *        seeded jitter of a few metres) and shape. The engine reads it only where a card's own words state a
 *        distance (a short pass): see options.js receiverFor. It draws no random number and changes nothing.
 *   KMPhrases.nearMates(squad, holder, zone, max)  your men (not the holder, not the keeper, not off) within
 *        `max` metres of the holder on those spots, nearest first, each { p, d, at }
 *   KMPhrases.fitMenu(st, p, pic)     the words of a menu's cards fitted to the picture they are read over
 *   KMPhrases.fitResult(st, ev, rs, nx)  a result's words fitted to the pass the result draws
 *        (director.js calls both, from segment and resolve: see "THE WORDS FOLLOW THE PICTURE" there, where the
 *        commentator's lineOf also reads describe/passVerb for every event)
 *
 * The verbs passVerb gives, in order: 'plays a long ball to' (30 m or more, forward), 'passes it back to' (more
 * than 3 m back), 'switches it to' (across, 20 m or more sideways), 'plays it short to' (15 m or less), 'passes
 * it across to' (another channel), 'passes it forward to' (5 m or more forward), 'passes it to' (none of these).
 *
 * Runs in a browser as a classic script (window.KMPhrases) and under node. */
(function (root) {
  'use strict';
  var T = { SHORT: 15, LONG: 30, SWITCH: 20, RUNSAT: 15, EDGE: 25, TACKLE: 12, CARRY: 2, EARLY: 25 };   /* EARLY (a3, helper W): an early cross, from 25 m or more from the goal line */
  /* claimscheck.js --break: nofit (no fitting at all), nomenu (the cards keep their template words), noresult (the
   * result keeps its words), noline (the commentator says the event's kind whatever it looks like), short20 (a
   * pass of up to 20 m is called short), noside (the side named for a receiver is not checked) */
  var BRK0 = (typeof process !== 'undefined' && process.env && process.env.T_PHRASE_BREAK) || '';
  if (BRK0 === 'short20') T.SHORT = 20;
  var VERSION = 'w3';
  /* a3 (helper W): helper C's cards are on (KM_C_ACTION=a2 in node, ?caction=a2 in the page, switch them off) */
  function C3ON() {
    try { if (typeof process !== 'undefined' && process.env && process.env.KM_C_ACTION === 'a2') return false; } catch (e) { }
    try { if (/[?&]caction=a2\b/.test((root.location && root.location.search) || '')) return false; } catch (e) { }
    return true;
  }
  function Pt() { return root.KMPitch || (typeof require === 'function' ? require('./pitch.js') : null); }
  function Ct() { return root.Cantera || (typeof require === 'function' ? require('../../shared/cantera.js') : null); }

  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function laneX(x) { return x < 22 ? 0 : x < 46 ? 1 : 2; }
  function dirOf(team) { return team === 'them' ? -1 : 1; }
  var SIDE = ['left', 'middle', 'right'];

  /* kmtree5 a4 (helper P, note 9, Eduardo: "passes it across to Yamal" when both are on the right). ACROSS means over
   * the middle of the pitch, or across the goal mouth near their box: acrossOK(a, b, team) is true when the ball
   * goes from one side of the middle line (x 34) to the other with at least 6 m sideways, or, with both ends within
   * 22 m of the goal line attacked, when it goes at least 6 m sideways into or over the goal mouth (between the posts,
   * x 30.3 to 37.7). Otherwise a sideways ball is "out wide" (the receiver wider), "inside" (more central) or
   * "sideways". T_PHRASE_BREAK=oldacross: a3's rule (any change of third) comes back. */
  var POSTS = [30.34, 37.66];
  function acrossOK(a, b, team) {
    if (BRK0 === 'oldacross') return laneX(a.x) !== laneX(b.x);
    var dx = b.x - a.x;
    if (Math.abs(dx) < 6) return false;
    if ((a.x - 34) * (b.x - 34) < 0) return true;
    var gl = function (p) { return team === 'them' ? p.y : 105 - p.y; };
    var lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
    return gl(a) <= 22 && gl(b) <= 22 && hi >= POSTS[0] && lo <= POSTS[1];
  }
  function describe(a, b, team) {
    if (!a || !b) return null;
    var d = dist(a, b), gain = (b.y - a.y) * dirOf(team), dx = b.x - a.x, la = laneX(a.x), lb = laneX(b.x);
    return { d: d, gain: gain, dx: dx, laneA: la, laneB: lb, side: SIDE[lb], ax: a.x, bx: b.x,
      short: d <= T.SHORT, long: d >= T.LONG, back: gain < 0, forward: gain > 0,
      across: la !== lb, switched: la !== lb && Math.abs(dx) >= T.SWITCH,
      over: acrossOK(a, b, team) };
  }
  /* a sideways ball that does not cross the middle: out wide, inside, or sideways */
  function lateral(ds) {
    var wa = Math.abs(ds.ax - 34), wb = Math.abs(ds.bx - 34);
    return wb > wa + 2 ? 'passes it out wide to' : wb < wa - 2 ? 'passes it inside to' : 'passes it sideways to';
  }
  function overOK(ds) { return ds.over === undefined || typeof ds.ax !== 'number' ? ds.across : ds.over; }
  /* THE ONE WAY A PASS IS NAMED (second pass, the review of night a2): every card, result and commentator line
   * that names a pass takes its direction word from here, so two cards on one menu never name one ball two ways.
   * In order: a long ball forward (30 m or more, at least 15 m forward, more forward than sideways); across the
   * pitch (at least 25 m sideways, more sideways than forward or back); back (at least 5 m back, more back than
   * sideways); forward (at least 10 m forward, more forward than sideways); short (15 m or less); across (into
   * another channel); otherwise no direction word. The distance goes in brackets beside the name on a card. */
  function geoVerb(ds) {
    if (!ds) return 'passes it to';
    var sd = Math.abs(ds.dx);
    if (ds.d >= T.LONG && ds.gain >= 15 && ds.gain >= sd) return 'plays a long ball forward to';
    if (sd >= 25 && sd >= Math.abs(ds.gain)) return overOK(ds) ? 'passes it across the pitch to' : lateral(ds);   /* (never 'passes it back to': options.js recycleBack reads that one word) */
    if (ds.gain <= -5 && -ds.gain >= sd) return 'passes it back to';
    if (ds.gain >= 10 && ds.gain >= sd) return 'passes it forward to';
    if (ds.short) return 'plays it short to';
    if (ds.across) return overOK(ds) ? 'passes it across to' : lateral(ds);
    return 'passes it to';
  }
  var passVerb = geoVerb;
  function strongForward(ds, min) { return ds.gain >= (min || 10) && ds.gain >= Math.abs(ds.dx); }

  /* ------------------------------------------- the places the pitch will draw (engine time) */
  /* pitch.js startOf, for your attack in a zone, without the jitter: the ball in the holder's lane at his home x
   * (kept 2.5 m inside the lane), at the middle of the zone's depth; in their box inside the box's width */
  var YOU_Y = [[21, 36], [45, 65], [74, 86], [92, 99]];
  var LANES = [[0, 22], [22, 46], [46, 68]];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ballAt(squad, holder, zone) {
    var P = Pt(), C = Ct();
    var z = clamp(typeof zone === 'number' ? zone : 1, 0, 3);
    var home = P.homeOf(holder, 'you', squad.formation);
    var lane = holder && typeof holder.slot === 'number' ? C.CHANNEL_OF[holder.slot] : 1, lb = LANES[lane];
    var x = clamp(home.x, lb[0] + 2.5, lb[1] - 2.5), y = (YOU_Y[z][0] + YOU_Y[z][1]) / 2;
    if (z === 3) x = clamp(x, P.BOX_X[0] + 2.2, P.BOX_X[1] - 2.2);
    return { x: x, y: y };
  }
  function spots(squad, holder, zone, at) {
    var P = Pt();
    var ball = at || ballAt(squad, holder, zone);
    var pos = P.shape('you', squad, ball, 'you');
    if (holder) pos[holder.id] = { x: ball.x, y: ball.y - (P.BALL_OFF || 1.6) };
    return pos;
  }
  function nearMates(squad, holder, zone, max, at) {
    var pos = spots(squad, holder, zone, at), h = holder ? pos[holder.id] : null, out = [];
    if (!h) return out;
    squad.players.forEach(function (p) {
      if (p === holder || p.off || !pos[p.id]) return;
      var d = dist(pos[p.id], h);
      if (max == null || d <= max) out.push({ p: p, d: d, at: pos[p.id] });
    });
    out.sort(function (a, b) { return a.d - b.d; });
    return out;
  }


  /* ------------------------------------------- FITTING A MENU'S WORDS TO ITS PICTURE (page time) */
  /* fitMenu(st, p, pic): once the picture the cards are read over exists (director.js calls it for the moment a
   * play stops at, and for the next moment of the same play after a result), every pass a card names is looked
   * at on that picture. When the card's word for it does not hold (a "short" pass to a man 21 m away, "back" to a
   * man ahead, "out to X on the right" when X is in the middle), the words become the ones the picture shows,
   * from passVerb, in every string of every card of the moment (label, description, results, the working, a
   * greyed card's quote of another card), so a card and its results say the same thing. The card, its odds and
   * its results are untouched: only words. Returns the list of changes made. T_PHRASE_BREAK=nofit turns it off
   * (claimscheck.js --break nofit). */
  var BRK = (typeof process !== 'undefined' && process.env && process.env.T_PHRASE_BREAK) || '';
  var NMR = "([^ .,:;!?]+)";
  /* each rule: the words (re: 1 the passer, 2 the verb, 3 the receiver, 4 a side when named), whether they hold on
   * the picture (ok), and what to say instead (make; default: passVerb). `join` is the word before the receiver. */
  function inBoxX(b) { return b.x >= 13.84 && b.x <= 54.16; }
  var RULES = [
    { id: 'short', re: new RegExp(NMR + ' (plays it short|passes short|plays the free kick short|passes it short) to ' + NMR, 'g'),
      ok: function (ds) { return ds.short; },
      make: function (ds, m) { return m[1] + ' ' + (/free kick/.test(m[2]) ? 'plays the free kick to' : passVerb(ds)) + ' ' + m[3]; } },
    { id: 'back', re: new RegExp(NMR + ' (passes it back) to ' + NMR, 'g'), ok: function (ds) { return ds.back; } },
    { id: 'forward', re: new RegExp(NMR + ' (passes it forward) to ' + NMR, 'g'), ok: function (ds) { return ds.forward; } },
    { id: 'out', re: new RegExp(NMR + ' (passes it out) to ' + NMR + '(?: on the (left|right))?', 'g'), side: true,
      ok: function (ds, m) { return ds.laneB !== 1 && Math.abs(ds.bx - 34) > Math.abs(ds.ax - 34) && (!m[4] || BRK === 'noside' || SIDE[ds.laneB] === m[4]); } },
    { id: 'switch', re: new RegExp(NMR + ' (switches it) to ' + NMR + '(?: on the (left|right))?', 'g'), side: true,
      ok: function (ds, m) { return ds.switched && overOK(ds) && (!m[4] || BRK === 'noside' || SIDE[ds.laneB] === m[4]); } },
    { id: 'across', re: new RegExp(NMR + ' ((?:passes|plays|hits) it across(?: the pitch)?) to ' + NMR, 'g'),
      ok: function (ds, m) { return (/ the pitch/.test(m[2]) ? ds.switched : ds.across) && overOK(ds); } },
    { id: 'longball', re: new RegExp(NMR + ' (plays a long ball) to ' + NMR, 'g'), ok: function (ds) { return ds.long; } },
    /* a cut-back goes back (or square) from near the byline: from where the man on the ball stands, the receiver
     * is level with him or behind him */
    { id: 'cutback', re: new RegExp(NMR + ' ((?:cuts|pulls) it back(?: from the byline)?(?: past [^ .,:;!?]+)? (?:to|for)) ' + NMR, 'g'), join: '',
      ok: function (ds) { return ds.gain <= 0; },
      make: function (ds, m) { return m[1] + ' ' + (inBoxX({ x: ds.bx }) && ds.gain > 0 ? 'passes it into the box to' : passVerb(ds)) + ' ' + m[3]; } },
    /* a ball played through goes forward: the receiver is ahead of the passer */
    { id: 'through', re: new RegExp(NMR + ' (plays the ball through) for ' + NMR, 'g'),
      ok: function (ds) { return ds.gain > 0; },
      make: function (ds, m) { return m[1] + ' plays the ball for ' + m[3]; }, join: 'for' },
    /* kicked long: 30 m or more to the man it is for; nearer, it is kicked up to him */
    { id: 'kicklong', re: new RegExp(NMR + ' (kicks it long) for ' + NMR, 'g'),
      ok: function (ds) { return ds.long; },
      make: function (ds, m) { return m[1] + ' kicks it up the pitch for ' + m[3]; }, join: 'for' }
  ];

  /* the words about where the man a card is up against stands (the duel's opponent) */
  var MEN_RULES = [
    /* "X runs at Y" (X on the ball): Y stands between X and the goal, within RUNSAT m. Otherwise X tries to beat Y. */
    { id: 'runsat', re: new RegExp(NMR + ' runs at ' + NMR + '(?! the ball)', 'g'),
      ok: function (st, A, B, a, b, pic) {
        var tA = Pt().teamOf(st, A), tB = Pt().teamOf(st, B);
        if (!tA || !tB || tA === tB || pic.holder !== A.id) return true;   /* only the man on the ball "runs at" a defender */
        return dist(a, b) <= T.RUNSAT && (b.y - a.y) * dirOf(tA) > 0;
      },
      make: function (m) { return m[1] + ' tries to beat ' + m[2]; } },
    /* "X goes to tackle Y": Y within TACKLE m (12). Further away, X runs at Y to tackle him. */
    { id: 'tackle', re: new RegExp(NMR + ' goes to tackle ' + NMR, 'g'),
      ok: function (st, A, B, a, b) { return dist(a, b) <= T.TACKLE; },
      make: function (m) { return m[1] + ' runs at ' + m[2] + ' to tackle him'; } },
    /* "X chases back after Y": Y is nearer X's goal than X (level within 1 m). Otherwise X goes after Y. */
    { id: 'chaseback', re: new RegExp(NMR + ' chases back after ' + NMR, 'g'),
      ok: function (st, A, B, a, b) { var tA = Pt().teamOf(st, A), og = { x: 34, y: tA === 'them' ? 105 : 0 }; return dist(b, og) < dist(a, og) + 1; },
      make: function (m) { return m[1] + ' goes after ' + m[2]; } }
  ];
  /* what a card gives as the reason for its bonus, when it names the distance (card id: [words, words without it]) */
  var BECAUSE = {
    HOLD: ['a short pass into feet is an easy ball', 'a pass into feet is an easy ball'],
    Z_KEEP_BACK: ['a short pass across the back is an easy ball', 'a pass across the back is an easy ball'],
    FK_SHORT: ['a short free kick is an easy ball', 'a free kick played to a team-mate is an easy ball'],
    Z_LAYOFF: ['it is a short pass to a teammate nearby', 'it is a pass to a teammate'],
    PAIR_PLAY_OUT: ['takes the short pass', 'takes the pass'],
    Z_CUTBACK: ['a pass back along the ground is hard to stop', 'a pass along the ground is hard to stop'],
    KEEPER_SHORT: ['a short pass from the keeper is an easy ball', 'a pass from the keeper to a team-mate is an easy ball']   /* a3 (helper W): helper C's new part */
  };
  function manByName(st, nm, team) {
    var P = Pt(); if (!P || !st) return null;
    return (team && P.byFirst(st, nm, team)) || P.byFirst(st, nm, null);
  }
  /* THE WORDS OF A CARD, and nothing else: only these display strings are changed (a card also carries the
   * engine's own words, its action tags, grant and state ids, which effects.js reads: t_cmp.js --page caught the
   * first version of this walking into them and changing matches) */
  var CARD_TEXT = ['label', 'read', 'check', 'greyWhy', 'because', 'threatNote', 'unlockNote', 'stamina', 'fxNote'];
  var OUT_TEXT = ['text', 'short', 'shortBase', 'edgeNote', 'edgeShort', 'theirEdgeNote'];
  function walk(o, fn) {
    if (!o) return;
    CARD_TEXT.forEach(function (k) { if (typeof o[k] === 'string') o[k] = fn(o[k]); });
    if (Array.isArray(o.counterNotes)) o.counterNotes = o.counterNotes.map(function (t) { return typeof t === 'string' ? fn(t) : t; });
    (o.outcomes || []).forEach(function (x) { if (x) OUT_TEXT.forEach(function (k) { if (typeof x[k] === 'string') x[k] = fn(x[k]); }); });
    (o.mods || []).concat(o.theirMods || []).forEach(function (m) { if (m && typeof m.why === 'string') m.why = fn(m.why); });
    /* Guessing's chip on a card (match.js guessFor: why, short) */
    if (o.guess && typeof o.guess === 'object') ['why', 'short'].forEach(function (k) { if (typeof o.guess[k] === 'string') o.guess[k] = fn(o.guess[k]); });
    (o.uses || []).forEach(function (u) { if (u && typeof u.why === 'string') u.why = fn(u.why); });
  }
  /* what was changed, kept on the object for the checks and the page, not enumerable (a match's records and
   * saves never see it) */
  function note(o, reps) {
    var prev = o.fitted || [];
    try { Object.defineProperty(o, 'fitted', { value: prev.concat(reps), enumerable: false, configurable: true, writable: true }); } catch (e) { }
  }
  function goalDist(pt, team) { return dist(pt, { x: 34, y: team === 'them' ? 0 : 105 }); }
  /* ------------------------------------------- PLAIN ENGLISH (second pass; Eduardo's rule: say literally what
   * happens). Football idiom on the page, in the words that replace it. Applied at page time to every string of
   * every card, the carried edges, the first line of a moment and the result (never to the scene, which pitch.js
   * and r3stage.js read for their own words; the director is handed a result's own words to stage it, see
   * director.js wordsResolve). Names of pieces and keywords stay as names. idiomcheck.js fails on what is left. */
  var PLAIN = [
    [/([^ .,:;!?]+) is set for ([^ .,:;!?]+)'s ball in behind/g, BRK === 'oldguess' ? "$1 expects $2's ball behind the defence again (this card is not one)" : "$1 is waiting for $2's ball behind the defence again, and this is a different move"],   /* a4 (helper P, note 7): no "(this card is not one)" */   /* a3 (helper W): was "expects X's ball in again (this card is not one) behind" */
    [/([^ .,:;!?]+) is set for ([^ .,:;!?]+)'s ([a-z-]+(?: [a-z-]+)?)/g, BRK === 'oldguess' ? "$1 expects $2's $3 again (this card is not one)" : "$1 is waiting for $2's $3 again, and this is a different move"],
    [/([^ .,:;!?]+) is set for a ([a-z-]+(?: [a-z-]+)?)/g, '$1 expects a $2 again'],
    [/\bis set for (a hard shot|his shot|the [a-z-]+(?: [a-z-]+)?)/g, 'expects $1'],
    [/\bhad set himself for\b/g, 'was ready for'],
    [/([^ .,:;!?]+) is ready: /g, '$1 expects it: '],
    [/\bcut-backs and pull-backs\b/g, 'passes back from near the goal line'],
    [/\bcut-backs or pull-backs\b/g, 'passes back from near the goal line'],
    [/\bthrough balls\b/g, 'forward passes'],
    [/\bsquare balls\b/g, 'passes across the goal'],
    [/\bputs ([^ .,:;!?]+) through on goal\b/g, 'leaves $1 with only the keeper to beat'],
    [/\bcut it back\b/g, 'pass it back from near the goal line'],
    [/\btrying to hold it up\b/g, 'trying to keep the ball'],
    [/\bhold it up\b/g, 'keep the ball'],
    [/\bcut it back last time\b/g, 'passed it back from near the goal line last time'],
    [/\bcuts it back past (\S+) to\b/g, 'gets it past $1 to'],
    [/\bcuts it back straight to\b/g, 'passes it straight to'],
    [/\bpulls it back straight to\b/g, 'passes it straight to'],
    [/\bcuts it back, but\b/g, 'passes it, but'],
    [/\bpulls it back from the byline past\b/g, 'passes it back from near the goal line past'],
    [/\bpulls it back from the byline\b/g, 'passes it back from near the goal line'],
    [/\bcuts it back\b/g, 'passes it back from near the goal line'],
    [/\bcut-backs?\b/g, 'pass back from near the goal line'],
    [/\bpull-backs?\b/g, 'pass back from near the goal line'],
    [/\bgets a foot in\b/g, 'touches the ball away'],
    [/\bputs ([^ .,:;!?]+) through past ([^ .,:;!?]+)/g, 'gets the ball past $2 to $1'],
    [/\bplays the ball through\b/g, 'plays the ball forward'],
    [/\bthrough ball\b/g, 'forward pass'],
    [/\bruns clear of\b/g, 'gets away from'],
    [/\blets it run under his foot to (\S+)/g, 'does not control it, and $1 takes it'],
    [/\blets it run under his foot\b/g, 'does not control it'],
    [/\btakes the long pass before (\S+) is across\b/g, 'controls the pass before $1 gets to him'],
    [/\btakes the long pass\b/g, 'controls the pass'],
    [/\bbefore (\S+) is across\b/g, 'before $1 gets to him'],
    [/\bswitches it to\b/g, 'passes it across the pitch to'],
    [/\bswitch(?:es)? of play\b/g, 'pass across the pitch'],
    [/\ba ball in behind\b/g, 'a ball behind their defence'],
    [/\bin behind\b/g, 'behind their defence'],
    [/\bplay one-twos\b/g, 'pass and get it straight back'],
    [/\bfor a one-two\b/g, 'and gets it straight back'],
    [/\ba one-two\b/g, 'a pass and return'],
    [/\bone-twos?\b/g, 'pass and return'],
    [/\ba player short\b/g, 'one defender fewer'],
    [/\bshort of players\b/g, 'without enough defenders'],
    [/\bthe 5\.5-metre box\b/g, 'the goal area (within 5.5 metres of the goal)'],
    [/\byour 5\.5-metre box\b/g, 'your goal area (within 5.5 metres of the goal)'],
    [/\bcrosses it early from midfield\b/g, 'crosses it from midfield'],
    [/\bsqueezes it past\b/g, 'just gets it past'],
    [/\bsqueezes past\b/g, 'just gets past'],
    [/\breads it well\b/g, 'may see it coming'],
    [/\breads the pass\b/g, 'sees the pass coming'],
    [/\bto lay off for\b/g, 'to pass on to'],
    [/\blays it off first time to\b/g, 'passes it on at once to'],
    [/\blays it off to\b/g, 'passes it on to'],
    [/\blays it off\b/g, 'passes it on'],
    [/\bthe layoff\b/g, 'his pass on'],
    [/\ba clean layoff\b/g, 'a clean pass on'],
    [/\blayoffs?\b/g, 'pass on'],
    [/\bholds it up and\b/g, 'keeps the ball and'],
    [/\bholds it up\b/g, 'keeps the ball'],
    [/\bfirst time\b/g, 'without stopping it'],
    [/\bfull-backs\b/g, 'wide defenders'],
    [/\bfull-back\b/g, 'wide defender'],
    [/\boverlaps\b/g, 'runs past him, nearer the touchline'],
    [/\boverlap\b/g, 'run past nearer the touchline'],
    [/\bon the outside\b/g, 'nearer the touchline'],
    [/\bdefence is stretched\b/g, 'defenders are spread out'],
    [/\bis stretched\b/g, 'is spread out'],
    [/\bstretched\b/g, 'spread out'],
    [/\bbacking off\b/g, 'stepping back'],
    [/\bkicks it long for (\S+) to chase\b/g, 'kicks it long for $1 to run after'],
    [/\bto chase\b/g, 'to run after'],
    [/\bcurls it\b/g, 'bends it'],
    [/\bchips it\b/g, 'lifts it'],
    [/\bnutmegs?\b/g, 'plays it between his legs']
  ];
  function plain(t) {
    if (BRK === 'noplain' || typeof t !== 'string' || !t) return t;
    var lo = 0, hi = PLAIN.length;
    if (typeof process !== 'undefined' && process.env && process.env.T_PLAIN_RANGE) { var rg = process.env.T_PLAIN_RANGE.split('-'); lo = +rg[0]; hi = +rg[1]; }
    for (var i = lo; i < hi; i++) t = t.replace(PLAIN[i][0], PLAIN[i][1]);
    return t;
  }
  /* the original words, kept (not enumerable) where plain() changed an outcome, for the director */
  function keepOrig(x) {
    if (!x || typeof x.text !== 'string' || x._orig) return;
    try { Object.defineProperty(x, '_orig', { value: x.text, enumerable: false, configurable: true, writable: true }); } catch (e) { }
  }

  /* ------------------------------------------- THE PASS A CARD NAMES */
  var VERBS = ['plays the free kick short', 'plays the free kick', 'plays it short', 'passes short', 'passes it short', 'passes it back', 'passes it forward',
    'passes it across the goal', 'passes it out wide', 'passes it inside', 'passes it sideways', 'passes it out', 'switches it', 'passes it across the pitch', 'passes it across', 'hits it across the pitch', 'plays a long ball forward', 'plays a long ball',
    'plays the ball through', 'kicks it long', 'kicks it up the pitch', 'cuts it back', 'pulls it back from the byline', 'gives it', 'passes it into the box',
    'passes it', 'rolls it out'];
  var PASS_RE = new RegExp('^' + NMR + ' (' + VERBS.join('|') + ') (to|for) ' + NMR + '(.*)$');
  function zoneOfY(y, team) {
    var u = team === 'them' ? 105 - y : y;
    return u >= 88.5 ? 'their box' : u >= 70 ? 'edge' : u >= 40 ? 'midfield' : u >= 16.5 ? 'your half' : 'your box';
  }
  var ZONE_TAIL = { ' in midfield': 'midfield', ' at the edge of their box': 'edge', ' in your half': 'your half', ' in their box': 'their box' };
  function foilName(o) { var f = o && (o.foil || (o.test && o.test.theirs)); return f ? String(f.name || '').split(' ')[0] : null; }
  /* the new label of a pass card: the card's kind words where the picture bears them out, else the one way a
   * pass is named (geoVerb), the distance in brackets, and the rest of the card's label where it still holds */
  function passLabel(o, m, ds, st, pic, B) {
    var A = m[1], verb = m[2], join = m[3], R = m[4], rest = m[5] || '', id = o.id, mt = Math.round(ds.d) + ' m';
    var core = null, restOut = rest, gv = geoVerb(ds);
    if (id === 'Z_RUN_BEHIND' && C3ON()) {
      /* a3 (helper W, with helper C's through ball): the ball is played into the space behind the defender, ahead of
       * the runner, who runs onto it; claimscheck card.runbehind checks it on the result's drawing */
      var dm = /, past ([^ .,:;!?]+)/.exec(rest), Dn = dm ? dm[1] : foilName(o);
      core = A + ' plays it behind ' + (Dn || 'their defender') + ' for ' + R + ' to run onto';
      restOut = rest.replace(/^ to run onto/, '').replace(/^, past [^ .,:;!?]+/, '');
    } else if (id === 'Z_THROUGH' || verb === 'plays the ball through') {
      restOut = rest.replace(/^ to run onto/, '');
      core = strongForward(ds, 10) ? A + ' plays the ball ahead of ' + R + ' (' + mt + '), for him to run onto' : A + ' ' + gv + ' ' + R + ' (' + mt + ')';
    } else if (id === 'Z_RUN_BEHIND' || (verb === 'kicks it long' || verb === 'kicks it up the pitch') && / to chase/.test(rest)) {
      restOut = rest.replace(/^ to chase/, '');
      core = strongForward(ds, 15) ? A + ' kicks it forward for ' + R + ' (' + mt + ') to run after' : A + ' ' + gv + ' ' + R + ' (' + mt + '), and ' + R + ' has to get to it before ' + (foilName(o) || 'their defender');
    } else if (verb === 'kicks it long' || verb === 'kicks it up the pitch') {
      core = A + ' ' + (ds.d >= T.LONG ? 'kicks it long to' : 'kicks it high to') + ' ' + R + ' (' + mt + ')';
      restOut = rest;
    } else if (id === 'Z_CUTBACK' && C3ON()) {
      /* a3 (helper W, with helper C's real cut-back): the result draws the passer carrying the ball to within a few metres
       * of the goal line and then passing it back along the ground to the man arriving: the words say what the result
       * does (claimscheck card.cutback3 checks it on the result's drawing), not the menu picture */
      core = A + ' runs to the goal line and passes it back to ' + R;
      /* a4 (helper P, note 7, the triage's words): with the ball, back along the ground, to a man running in towards
       * the penalty spot (claimscheck card.cutback3 checks the carry, the pass and where the receiver runs) */
      if (BRK !== 'oldcut') {
        core = A + ' runs with the ball to the goal line and passes it back along the ground to ' + R;
        restOut = rest.replace(/^, who is arriving in the box/, ', who is running in towards the penalty spot');
      }
    } else if (verb === 'cuts it back' || verb === 'pulls it back from the byline') {
      var pa = pic.pos[m.Aid], team = m.team, gl = pa ? (team === 'them' ? pa.y : 105 - pa.y) : 99;
      core = gl <= 12 && ds.gain <= 0 ? A + ' passes it back from near the goal line to ' + R + ' (' + mt + ')' : A + ' ' + gv + ' ' + R + ' (' + mt + ')';
      if (/^, who is arriving in the box/.test(rest)) { var pb = pic.pos[B.id], bl = pb ? (team === 'them' ? pb.y : 105 - pb.y) : 99; if (bl > 22) restOut = rest.replace(/^, who is arriving in the box/, ''); }
    } else if (verb === 'passes it across the goal') {
      /* a4 (helper P, note 10a, Rodri "across the goal" to a man 5 m in front of him): the words fitted to the
       * picture. Across the goal only when the ball goes across the goal mouth near the goal (acrossOK, both within
       * 22 m of the goal line); otherwise the one way a pass is named, and "in front of goal" when the receiver stands
       * within the box's width. claimscheck card.acrossgoal checks it. T_PHRASE_BREAK=nosquare keeps the fixed words. */
      var pB = pic.pos[B.id], tmS = m.team, glB = pB ? (tmS === 'them' ? pB.y : 105 - pB.y) : 99, glA = pic.pos[m.Aid] ? (tmS === 'them' ? pic.pos[m.Aid].y : 105 - pic.pos[m.Aid].y) : 99;
      if (BRK === 'nosquare' || (ds.over && glA <= 22 && glB <= 22)) core = A + ' passes it across the goal to ' + R + ' (' + mt + ')';
      else core = A + ' ' + gv + ' ' + R + ' (' + mt + ')' + (pB && inBoxX(pB) && glB <= 16.5 ? ', in front of goal' : '');
      restOut = rest;
    } else if (verb === 'plays the free kick short' || verb === 'plays the free kick') {
      core = A + ' plays the free kick ' + (ds.short ? 'short ' : '') + 'to ' + R + ' (' + mt + ')';
    } else {
      core = A + ' ' + gv + ' ' + R + ' (' + mt + ')';
    }
    /* what the rest of the label says about where the receiver is */
    var side = restOut.match(/^ on the (left|right)/);
    if (side && BRK !== 'noside' && BRK !== 'nosides') restOut = restOut.replace(/^ on the (left|right)/, ds.laneB !== 1 ? ' on the ' + SIDE[ds.laneB] : '');   /* --break noside: the engine's side is kept */
    var zt = null;
    Object.keys(ZONE_TAIL).forEach(function (k) { if (restOut.indexOf(k) === 0) zt = k; });
    if (zt) {
      if (id === 'Z_RECYCLE') restOut = restOut.replace(zt, ', and your team starts again' + zt);
      else if (zoneOfY(pic.pos[B.id].y, m.team) !== ZONE_TAIL[zt]) restOut = restOut.replace(zt, '');
    }
    return { label: core + restOut, core: core.replace(/ \(\d+ m\)/, '') };
  }
  /* "who runs at A and B": both of them stand ahead of him (between him and the goal), within 20 m */
  function runsAtBoth(st, pic, H, A, B, team) {
    var h = pic.pos[H.id], a = pic.pos[A.id], b = pic.pos[B.id];
    if (!h || !a || !b) return true;
    function ahead(q) { return (q.y - h.y) * dirOf(team) > 0 && dist(q, h) <= 20; }
    return ahead(a) && ahead(b);
  }
  function fitMenu(st, p, pic) {
    if (BRK === 'nofit' || BRK === 'nomenu' || !st || !p || !p.moment || !pic || !pic.pos) return [];
    var opts = p.moment.options || [], reps = [], seen = {}, labels = [];
    var P = Pt();
    opts.forEach(function (o) {
      var lab = String(o.label || ''), newLab = lab, cores = [];
      var m = PASS_RE.exec(lab);
      if (m) {
        var A = manByName(st, m[1], 'you') || manByName(st, m[1], null), team = A ? P.teamOf(st, A) || 'you' : 'you';
        var B = manByName(st, m[4], team);
        if (A && B && pic.pos[A.id] && pic.pos[B.id]) {
          m.Aid = A.id; m.team = team;
          var ds = describe(pic.pos[A.id], pic.pos[B.id], team); ds.ax = pic.pos[A.id].x; ds.bx = pic.pos[B.id].x;
          var pl = passLabel(o, m, ds, st, pic, B);
          newLab = pl.label;
          var sideNow = BRK === 'noside' ? undefined : ds.laneB !== 1 ? ' on the ' + SIDE[ds.laneB] : '';
          cores.push({ from: m[1] + ' ' + m[2] + ' ' + m[3] + ' ' + m[4], to: pl.core, side: sideNow });
          /* the card's results say the pass in their own words ("plays it short to X", "passes it out to X"): the same */
          ['plays it short to', 'passes it out to', 'passes it back to', 'passes it across to', 'switches it to', 'passes it forward to', 'passes it out wide to', 'passes it inside to', 'passes it sideways to'].forEach(function (v) {
            var f = m[1] + ' ' + v + ' ' + m[4];
            if (f !== m[1] + ' ' + m[2] + ' ' + m[3] + ' ' + m[4]) cores.push({ from: f, to: pl.core, side: sideNow });
          });
          reps.push({ rule: 'pass', card: o.id, from: lab, to: newLab, d: ds.d, gain: ds.gain, dx: ds.dx, pair: A.id + '>' + B.id, verb: pl.core });
          if (BECAUSE[o.id] && (!ds.short || (o.id === 'Z_CUTBACK' && !C3ON()))) cores.push({ from: BECAUSE[o.id][0], to: BECAUSE[o.id][1] });
          /* who runs at A and B */
          var mr = new RegExp(', who runs at ' + NMR + ' and ' + NMR).exec(newLab);
          if (mr) {
            var DA = manByName(st, mr[1], null), DB = manByName(st, mr[2], null);
            if (DA && DB && !runsAtBoth(st, pic, B, DA, DB, team)) { newLab = newLab.replace(mr[0], ', who tries to beat ' + mr[1] + ' and ' + mr[2]); reps.push({ rule: 'runsat2', card: o.id }); }
          }
        }
      }
      /* the men a card is up against: "runs at", "chases back after" */
      MEN_RULES.forEach(function (R) {
        R.re.lastIndex = 0;
        var mm;
        while ((mm = R.re.exec(newLab))) {
          var A2 = manByName(st, mm[1], null), B2 = manByName(st, mm[2], null);
          if (!A2 || !B2 || !pic.pos[A2.id] || !pic.pos[B2.id]) continue;
          if (R.ok(st, A2, B2, pic.pos[A2.id], pic.pos[B2.id], pic)) continue;
          cores.push({ from: mm[0], to: R.make(mm) });
          reps.push({ rule: R.id, card: o.id });
        }
      });
      /* a long shot names its distance from goal: the picture's */
      var ms = new RegExp('^' + NMR + ' shoots from (\\d+) metres').exec(lab);
      if (ms) {
        var S0 = manByName(st, ms[1], 'you'), sp = S0 && pic.pos[S0.id];
        if (sp) {
          var gd = goalDist(sp, P.teamOf(st, S0) || 'you'), n5 = Math.round(gd / 5) * 5;
          if (Math.abs(gd - (+ms[2])) > 5) {
            cores.push({ from: ms[1] + ' shoots from ' + ms[2] + ' metres', to: ms[1] + ' shoots from about ' + n5 + ' metres' });
            cores.push({ from: 'he is shooting from ' + ms[2] + ' metres', to: 'he is shooting from about ' + n5 + ' metres' });
            reps.push({ rule: 'shotdist', card: o.id });
          }
        }
      }
      /* "the cross comes from N metres": the crosser's distance from goal on the picture */
      var cr = /the cross comes from (\d+) metres/.exec(JSON.stringify(o.mods || []) + ' ' + String(o.check || '') + ' ' + String(o.because || ''));
      var cm = new RegExp('(?:^|, who |^' + NMR + ' )crosses it').exec(newLab), crosser = null;
      var cw = new RegExp(NMR + '(?: \\(\\d+ m\\))?, who crosses it').exec(newLab) || new RegExp('^' + NMR + ' crosses it').exec(newLab);
      if (cw) crosser = manByName(st, cw[1], 'you');
      if (cr && crosser && pic.pos[crosser.id]) {
        var cd = goalDist(pic.pos[crosser.id], P.teamOf(st, crosser) || 'you');
        if (Math.abs(cd - (+cr[1])) > 5) { cores.push({ from: 'the cross comes from ' + cr[1] + ' metres', to: 'the cross comes from about ' + Math.round(cd / 5) * 5 + ' metres' }); reps.push({ rule: 'crossdist', card: o.id }); }
      }
      /* "with B next to A": within 8 m of each other */
      var nx0 = new RegExp('with ' + NMR + ' next to ' + NMR).exec(String(o.read || ''));
      if (nx0) {
        var NA = manByName(st, nx0[1], null), NB = manByName(st, nx0[2], null);
        if (NA && NB && pic.pos[NA.id] && pic.pos[NB.id] && dist(pic.pos[NA.id], pic.pos[NB.id]) > 8) {
          cores.push({ from: nx0[0], to: 'with ' + nx0[1] + ' ' + Math.round(dist(pic.pos[NA.id], pic.pos[NB.id])) + ' m from ' + nx0[2] });
          reps.push({ rule: 'nextto', card: o.id });
        }
      }
      o.__new = newLab; o.__cores = cores; o.__lab = lab;
      labels.push(o);
    });
    /* two live cards with the same words are told apart by the man each is up against */
    var byLab = {};
    labels.forEach(function (o) { if (!o.disabled) { var k0 = o.__new.replace(/ on the (?:left|right)/, ''); (byLab[k0] = byLab[k0] || []).push(o); } });
    Object.keys(byLab).forEach(function (k) {
      if (byLab[k].length < 2) return;
      byLab[k].forEach(function (o) { var f = foilName(o); if (f) o.__new = o.__new + ', with ' + f + ' trying to stop it'; });
    });
    function esc(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    /* a card's old label (quoted by a greyed card) becomes its new label; every card's old pass words become the new */
    var subs = [];
    labels.forEach(function (o) { if (o.__new !== o.label) subs.push({ re: new RegExp('"' + esc(o.label) + '"', 'g'), to: '"' + o.__new + '"' }); });
    labels.forEach(function (o) { o.__cores.forEach(function (c) {
      if (c.from === c.to) return;
      /* a side is said only where the words said one, and then it is the picture's */
      if (c.side !== undefined) subs.push({ re: new RegExp(esc(c.from) + '( on the (?:left|right))?', 'g'), to: function (all, sd) { return c.to + (sd ? c.side : ''); } });
      else subs.push({ re: new RegExp(esc(c.from), 'g'), to: c.to });
    }); });
    function sub(t) { subs.forEach(function (sb) { t = t.replace(sb.re, sb.to); }); return plain(t); }
    opts.forEach(function (o) {
      var nl = o.__new, ol = o.__lab;
      delete o.__new; delete o.__cores; delete o.__lab;
      (o.outcomes || []).forEach(keepOrig);
      walk(o, sub);
      /* a4 (helper P, note 7): Guessing's chip in plain words (guessWords), once */
      if (o.guess && typeof o.guess === 'object') { var gw0 = guessWords(o.guess); if (gw0) { o.guess.why = gw0.why; o.guess.short = gw0.short; try { Object.defineProperty(o.guess, '__p', { value: 1, enumerable: false, configurable: true }); } catch (e) { } } }
      /* the label: its own new words, then the other cards' changes (a quote), and plain English */
      if (nl !== ol) o.label = plain(nl);
    });
    (p.carried || []).forEach(function (c) { if (c && typeof c.text === 'string') c.text = plain(c.text); });
    (p.theirCarried || []).forEach(function (c) { if (c && typeof c.text === 'string') c.text = plain(c.text); });
    if (p.lead) p.lead = plain(p.lead);
    /* the scene: "nobody has gone with X" while one of theirs is right beside him (3 m) */
    var ng = new RegExp('nobody has gone with ' + NMR).exec(String(p.moment.text || ''));
    if (ng && BRK !== 'noscene') {
      var X = manByName(st, ng[1], null);
      if (X && pic.pos[X.id]) {
        var tX = P.teamOf(st, X), other = tX === 'you' ? st.opp : st.squad, near = null;
        other.players.forEach(function (q) { var pq = pic.pos[q.id]; if (pq && P.onPitch(st, q) && dist(pq, pic.pos[X.id]) <= 3 && (!near || dist(pq, pic.pos[X.id]) < near.d)) near = { q: q, d: dist(pq, pic.pos[X.id]) }; });
        if (near) { p.moment.text = p.moment.text.replace(ng[0], String(near.q.name).split(' ')[0] + ' is right beside ' + ng[1] + ' (' + near.d.toFixed(0) + ' m)'); reps.push({ rule: 'nobody' }); }
      }
    }
    note(p, reps);
    return reps;
  }

  /* fitResult(st, ev, rs, nx): the result's words against the pass the result draws (rs, the result's segment),
   * with the one way a pass is named (geoVerb), in the result text and in the next moment's first line (nx.lead),
   * which repeats it; then plain English. Words only. */
  var RESULT_RE = new RegExp(NMR + ' (plays it short|passes short|passes it short|passes it back|passes it forward|passes it out wide|passes it inside|passes it sideways|passes it out|switches it|passes it across the pitch|passes it across|plays a long ball forward|plays a long ball|passes it) to ' + NMR, 'g');
  function fitResult(st, ev, rs, nx) {
    if (BRK === 'nofit' || BRK === 'noresult' || !st || !ev || !rs || !rs.beats) return [];
    var tx = String(ev.text || ''), reps = [], seen = {}, m;
    RESULT_RE.lastIndex = 0;
    while ((m = RESULT_RE.exec(tx))) {
      var A = manByName(st, m[1], 'you'), B = manByName(st, m[3], A ? Pt().teamOf(st, A) : 'you');
      if (!A || !B) continue;
      var i, dr = null;
      for (i = 0; i < rs.beats.length; i++) {
        var b = rs.beats[i];
        if (b.kind === 'pass' && b.from === A.id && b.to === B.id && rs.keys[i + 1]) { dr = { k0: rs.keys[i], k1: rs.keys[i + 1], team: b.team }; break; }
      }
      if (!dr) continue;
      var ds = describe(dr.k0.ball, dr.k1.ball, dr.team === 'them' ? 'them' : 'you');
      /* the one way a pass is named, for the pass the result draws */
      var gv = geoVerb(ds), oldCore = m[1] + ' ' + m[2] + ' to ' + m[3], nw = m[1] + ' ' + gv + ' ' + m[3];
      if (nw === oldCore || seen[oldCore]) continue; seen[oldCore] = 1;
      reps.push({ rule: 'result', from: oldCore, to: nw, side: ds.laneB !== 1 ? ' on the ' + SIDE[ds.laneB] : '', d: ds.d, gain: ds.gain });
    }
    function esc(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function fix(t) { reps.forEach(function (r) { t = t.replace(new RegExp(esc(r.from) + '( on the (?:left|right))?', 'g'), function (all, sd) { return r.to + (sd ? r.side : ''); }); }); return plain(t); }
    ev.text = fix(String(ev.text));
    var zoneless = false;
    /* a4 (helper P): a build's effect that takes a zone off the run ("the run goes one zone less far", components-w0b)
     * is said after the words of the full run: the ball ends a zone short, so not "into the box" nor "in their box" */
    if (/one zone less far/.test(ev.text) && BRK !== 'nozone') {
      ev.text = ev.text.replace(/ into the box and your team has the ball in their box/g, ' and your team has the ball at the edge of their box')
        .replace(/your team has the ball in their box/g, 'your team has the ball at the edge of their box');
      zoneless = true;
    }
    if (nx && nx.lead) nx.lead = fix(String(nx.lead));
    note(ev, reps);
    return reps;
  }

  /* fitStaged(st, p, pic) (kmtree5 a3, helper W): the last word on a menu, on the picture as it is finally drawn.
   * fitMenu runs when the director makes the picture; the stagings (whystage.js, r3stage.js) then move the men the
   * words need, and a few claims still end up false on the final picture (a2's last 13: the nearest man, the ball
   * in the box or at its edge, "runs at A and B", "B next to A"). The page calls this after the stagings (play.html,
   * every place it stages); it reads the final picture and changes words only, never a position. The scene is
   * changed here and only here (fitMenu leaves it to its readers, which have run by now).
   *   "X is the nearest of their players to him"  -> "X is N m from him"          when one of X's side is nearer
   *   "X has the ball in their box" / "is in ..."  -> "at the edge of their box"   when the ball is outside the box
   *                                                   (within EDGE m), else "outside their box"
   *   "X has the ball at the edge of their box"   -> "in their box"               when the ball is in the box
   *   ", who runs at A and B"                      -> ", who tries to beat A and B" (the fitMenu rule, again)
   *   "with B next to A"                           -> "with B N m from A"          (the fitMenu rule, again)
   * claimscheck --break nostaged switches it off. */
  /* the pass words that carry a distance in brackets (claimscheck.js card.metres reads the same) */
  var METRES_RE = new RegExp(NMR + ' (?:plays it short|passes it (?:back|forward|across(?: the pitch| the goal)?|out wide|inside|sideways|to)|plays a long ball forward|plays the ball ahead of|kicks it (?:forward|long|high)(?: for| to)?|passes it back from near the goal line to|plays the free kick(?: short)?) (?:to |for )?' + NMR + ' \\((\\d+) m\\)', 'g');
  function fitStaged(st, p, pic) {
    if (BRK === 'nofit' || BRK === 'nostaged' || !st || !p || !p.moment || !pic || !pic.pos) return [];
    var P = Pt(), reps = [];
    function esc(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function inBoxOf(pt, which) { return P.inBox(pt, which === 'their' ? 'you' : 'them'); }
    function lineDist(pt, which) { return which === 'their' ? 105 - pt.y : pt.y; }
    var tx = String(p.moment.text || ''), t0 = tx, m, re;
    /* the nearest man */
    re = new RegExp(NMR + ' is the nearest of (your|their) players to (him|' + NMR.slice(1, -1) + ')', 'g');
    tx = tx.replace(re, function (all, xn, side, yn) {
      var X = manByName(st, xn, side === 'your' ? 'you' : 'them'), Y = yn === 'him' ? (pic.holder ? P.byId(st, pic.holder) : null) : manByName(st, yn, null);
      if (!X || !Y || !pic.pos[X.id] || !pic.pos[Y.id]) return all;
      var y = pic.pos[Y.id], dx = dist(pic.pos[X.id], y), sq = P.teamOf(st, X) === 'you' ? st.squad : st.opp, nearer = false;
      sq.players.forEach(function (q) { var pq = pic.pos[q.id]; if (q !== X && pq && P.onPitch(st, q) && dist(pq, y) < dx - 0.05) nearer = true; });
      if (!nearer) return all;
      reps.push({ rule: 'staged.nearest' });
      return xn + ' is ' + Math.max(1, Math.round(dx)) + ' m from ' + yn;
    });
    /* the ball in the box, or at its edge */
    if (pic.ball) {
      var b = pic.ball;
      re = new RegExp(NMR + ' (has the ball|is) in (their|your) box', 'g');
      tx = tx.replace(re, function (all, xn, verb, which) {
        if (inBoxOf(b, which)) return all;
        reps.push({ rule: 'staged.box' });
        return xn + ' ' + verb + (lineDist(b, which) <= T.EDGE ? ' at the edge of ' : ' outside ') + which + ' box';
      });
      re = new RegExp(NMR + ' has the ball at the edge of (their|your) box', 'g');
      tx = tx.replace(re, function (all, xn, which) {
        if (inBoxOf(b, which)) { reps.push({ rule: 'staged.edge' }); return xn + ' has the ball in ' + which + ' box'; }
        if (lineDist(b, which) > T.EDGE) { reps.push({ rule: 'staged.edge' }); return xn + ' has the ball outside ' + which + ' box'; }
        return all;
      });
    }
    /* a4 (helper P, note 11: "a free kick near the touchline" with no foul seen): the scene says who fouled whom: the
     * nearest of theirs to the man on the ball on the final picture (the director pins him there, goal-side), within
     * 6 m; and, with helper G's set-piece menu (FK_ cards, no quick open play), not "you take it quickly". claimscheck
     * scene.fouls checks it. T_PHRASE_BREAK=nofoul keeps the engine's words. */
    var FKW = 'You have a free kick near the touchline, level with the edge of their penalty area.';
    /* a4 (helper P): "X has run past Y ..., on the right wing" / "X is running up the right wing", with X drawn just inside
     * the middle third on the final picture: "towards the right wing" (the side still holds, the wing does not) */
    if (BRK !== 'nowing') tx = tx.replace(new RegExp(NMR + '( is running up the| has run past [^ .,:;!?]+(?: on the outside|, nearer the touchline), on the) (left|right) wing', 'g'), function (all, xn, mid, sd) {
      var XM = manByName(st, xn, null), xp = XM && pic.pos[XM.id];
      if (!xp || SIDE[laneX(xp.x)] === sd) return all;
      reps.push({ rule: 'staged.wing' });
      return xn + mid.replace(/ is running up the$/, ' is running forward').replace(/, on the$/, ',') + ' towards the ' + sd + ' wing';
    });
    var fkAt = tx.indexOf(FKW);
    if (fkAt >= 0 && (pic.holder || pic.ball) && BRK !== 'nofoul') {
      var Hh = pic.holder ? P.byId(st, pic.holder) : null, fo = null;
      if (!Hh && pic.ball) st.squad.players.forEach(function (q) { var pq = pic.pos[q.id]; if (pq && P.onPitch(st, q) && (!Hh || dist(pq, pic.ball) < dist(pic.pos[Hh.id], pic.ball))) Hh = q; });   /* the ball dead at the spot: your man nearest it */
      var hp = Hh && pic.pos[Hh.id];
      if (hp) {
        var oth = P.teamOf(st, Hh) === 'you' ? st.opp : st.squad;
        oth.players.forEach(function (q) { var pq = pic.pos[q.id]; if (pq && P.onPitch(st, q)) { var dq = dist(pq, hp); if (!fo || dq < fo.d) fo = { q: q, d: dq }; } });
        var setp = (p.moment.options || []).some(function (o) { return /^FK_|ROUTINE/.test(o.id); });
        var hn = String(Hh.name).split(' ')[0];
        var lead = fo && fo.d <= 6 ? String(fo.q.name).split(' ')[0] + ' fouls ' + hn + ' near the touchline, level with the edge of their box. You have a free kick.'
          : hn + ' was fouled near the touchline, level with the edge of their box. You have a free kick.';
        var rest = tx.slice(fkAt + FKW.length).replace(/^ You take it quickly, before they can set a wall\./, setp ? '' : ' You take it quickly, before they can set a wall.');
        tx = tx.slice(0, fkAt) + lead + rest;
        reps.push({ rule: 'staged.foul' });
      }
    }
    if (tx !== t0) p.moment.text = tx;
    /* the cards: "runs at A and B" and "B next to A", on the final picture */
    (p.moment.options || []).forEach(function (o) {
      var subs = [], lab = String(o.label || '');
      var mr = new RegExp('to ' + NMR + '(?: \\(\\d+ m\\))?, who runs at ' + NMR + ' and ' + NMR).exec(lab);
      if (mr) {
        var H = manByName(st, mr[1], null), team = H ? P.teamOf(st, H) || 'you' : 'you', DA = manByName(st, mr[2], null), DB = manByName(st, mr[3], null);
        if (H && DA && DB && !runsAtBoth(st, pic, H, DA, DB, team)) { subs.push([', who runs at ' + mr[2] + ' and ' + mr[3], ', who tries to beat ' + mr[2] + ' and ' + mr[3]]); reps.push({ rule: 'staged.runsat2', card: o.id }); }
      }
      var nx0 = new RegExp('with ' + NMR + ' next to ' + NMR).exec(String(o.read || ''));
      if (nx0) {
        var NA = manByName(st, nx0[1], null), NB = manByName(st, nx0[2], null);
        if (NA && NB && pic.pos[NA.id] && pic.pos[NB.id] && dist(pic.pos[NA.id], pic.pos[NB.id]) > 8) { subs.push([nx0[0], 'with ' + nx0[1] + ' ' + Math.round(dist(pic.pos[NA.id], pic.pos[NB.id])) + ' m from ' + nx0[2]]); reps.push({ rule: 'staged.nextto', card: o.id }); }
      }
      /* "X runs at Y", "goes to tackle", "chases back after" (fitMenu's MEN_RULES), on the final picture */
      [lab, String(o.read || '')].forEach(function (str) {
        MEN_RULES.forEach(function (R) {
          R.re.lastIndex = 0;
          var mm;
          while ((mm = R.re.exec(str))) {
            var A2 = manByName(st, mm[1], null), B2 = manByName(st, mm[2], null);
            if (!A2 || !B2 || !pic.pos[A2.id] || !pic.pos[B2.id] || R.ok(st, A2, B2, pic.pos[A2.id], pic.pos[B2.id], pic)) continue;
            if (/^(the|their|your|a|his)$/i.test(mm[2])) continue;
            subs.push([mm[0], R.make(mm)]); reps.push({ rule: 'staged.' + R.id, card: o.id });
          }
        });
      });
      /* the distance in brackets, "to X (N m)": the passer to the receiver on the final picture */
      METRES_RE.lastIndex = 0;
      var mt;
      while ((mt = METRES_RE.exec(lab))) {
        var MA = manByName(st, mt[1], null), MB = MA ? manByName(st, mt[2], P.teamOf(st, MA)) : null;
        if (!MA || !MB || !pic.pos[MA.id] || !pic.pos[MB.id]) continue;
        var dm = dist(pic.pos[MA.id], pic.pos[MB.id]);
        if (Math.abs(dm - (+mt[3])) <= 1 && !(dm > T.SHORT && / plays it short /.test(mt[0]))) continue;
        subs.push([mt[2] + ' (' + mt[3] + ' m)', mt[2] + ' (' + Math.round(dm) + ' m)']); reps.push({ rule: 'staged.metres', card: o.id });
        /* a4 (helper P): "short" said of a pass the final picture draws longer than SHORT: the one way a pass is named */
        if (dm > T.SHORT && / plays it short /.test(mt[0])) {
          var dsS = describe(pic.pos[MA.id], pic.pos[MB.id], P.teamOf(st, MA) || 'you');
          subs.push([mt[1] + ' plays it short to ' + mt[2], mt[1] + ' ' + geoVerb(dsS) + ' ' + mt[2]]);
          if (BECAUSE[o.id]) subs.push([BECAUSE[o.id][0], BECAUSE[o.id][1]]);
          reps.push({ rule: 'staged.short', card: o.id });
        }
      }
      /* a3 (helper W): the keeper's short pass says how much room its man has (helper C's parts "their midfield does
       * not press hard, so X has room", "their press leaves X a little room"): the metres to the nearest of theirs on
       * the final picture, in brackets */
      var rm = new RegExp('(?:so ' + NMR + ' has room|leaves ' + NMR + ' a little room)(?! \\()').exec(JSON.stringify((o.mods || []).map(function (q) { return q.why; })) + ' ' + String(o.check || ''));
      if (rm && BRK !== 'noroom') {
        var RX = manByName(st, rm[1] || rm[2], null), rx = RX && pic.pos[RX.id];
        if (rx) {
          var oth = P.teamOf(st, RX) === 'you' ? st.opp : st.squad, nb = 99;
          oth.players.concat([oth.keeper]).forEach(function (q) { var pq = q && pic.pos[q.id]; if (pq && P.onPitch(st, q)) nb = Math.min(nb, dist(pq, rx)); });
          if (nb < 99) {
            var nm0 = rm[1] || rm[2], tagM = ' (their nearest: ' + Math.round(nb) + ' m)';
            subs.push(['so ' + nm0 + ' has room', 'so ' + nm0 + ' has room' + tagM]);
            subs.push(['leaves ' + nm0 + ' a little room', 'leaves ' + nm0 + ' a little room' + tagM]);
            reps.push({ rule: 'staged.room', card: o.id, d: nb });
          }
        }
      }
      /* a3 (helper W, Eduardo: "Early cross or from deep makes sense as long as it's a cross into the box"): a man who
       * crosses from EARLY m or more from the goal line "crosses early" (the cross is for a man to head in the box;
       * claimscheck card.early.lands checks where the result draws it). Nearer the goal line the card keeps its words. */
      var cw = new RegExp(NMR + '(?: \\(\\d+ m\\))?, who crosses it').exec(lab) || new RegExp('^' + NMR + ' crosses it').exec(lab);
      var CX = cw ? manByName(st, cw[1], 'you') : null;
      if (CX && pic.pos[CX.id] && BRK !== 'noearly') {
        var cp0 = pic.pos[CX.id], cteam = P.teamOf(st, CX) || 'you', fromLine = cteam === 'them' ? cp0.y : 105 - cp0.y;
        if (fromLine >= T.EARLY) {
          /* (as few words as the card had: the first decision's words are capped at 150, laycheck E9) */
          subs.push(['crosses it from midfield for', 'crosses early for']);
          subs.push(['crosses it low across', 'crosses early and low across']);
          subs.push(['crosses it for', 'crosses early for']);
          reps.push({ rule: 'staged.early', card: o.id, line: fromLine });
        } else if (/crosses it from midfield/.test(lab)) {
          subs.push(['crosses it from midfield for', 'crosses it for']);   /* "from midfield", said of a man drawn near the goal line */
          reps.push({ rule: 'staged.midfield', card: o.id, line: fromLine });
        }
      }
      /* a4 (helper P, found by helper R in a5): "Y on the left/right" said of a man the picture draws elsewhere. A
       * retarget (Outlet, setRecipient in options.js) swaps the receiver's name and keeps the old man's side; any
       * card string that puts a named man on a side now says the side the final picture draws him in, or none when he
       * is in the middle third. claimscheck card.side.any checks it; T_PHRASE_BREAK=noside2 switches it off. */
      if (BRK !== 'noside2' && BRK !== 'nosides' && BRK !== 'noside') {
        var sideRe = new RegExp(NMR + ' on the (left|right)(?! wing| touchline| side| of| flank)', 'g'), sd;
        var sideTxt = [lab, String(o.read || '')].concat((o.outcomes || []).map(function (x) { return String((x && x.text) || ''); })).join(' | ');
        var seenS = {};
        while ((sd = sideRe.exec(sideTxt))) {
          var SM = manByName(st, sd[1], null), sp = SM && pic.pos[SM.id];
          if (!sp || seenS[sd[0]]) continue; seenS[sd[0]] = 1;
          var laneS = laneX(sp.x);
          if (SIDE[laneS] === sd[2]) continue;
          subs.push([sd[0], sd[1] + (laneS === 1 ? '' : ' on the ' + SIDE[laneS])]);
          reps.push({ rule: 'staged.side', card: o.id });
        }
      }
      if (!subs.length) return;
      walk(o, function (t) { subs.forEach(function (sb) { t = t.replace(new RegExp(esc(sb[0]) + (sb[0].slice(-4) === 'left' || sb[0].slice(-5) === 'right' ? '(?! wing| touchline| side| of| flank)' : ''), 'g'), sb[1]); }); return t; });
    });
    if (reps.length) note(p, reps);
    return reps;
  }

  /* safeMates(squad, opp, holder, zone, max): your men within `max` of the holder on pitch.js's places, each with
   * how far forward of him he stands (gain) and how open he is (open: metres to the nearest of theirs, their places
   * from pitch.js's shape with your team on the ball), nearest first */
  function safeMates(squad, opp, holder, zone, max, at) {
    var P = Pt(), ball = at || ballAt(squad, holder, zone);
    var mine = nearMates(squad, holder, zone, max, at), theirs = opp ? P.shape('them', opp, ball, 'you') : {};
    var h = spots(squad, holder, zone, at)[holder.id];
    mine.forEach(function (c) {
      c.gain = c.at.y - h.y;
      var o = 99; for (var k in theirs) o = Math.min(o, dist(theirs[k], c.at));
      c.open = o;
    });
    return mine;
  }
  /* greyLine(o) (kmtree5 a4, helper P, notes 5 and 20): THE ONE-LINE REASON A GREYED CARD SHOWS ON ITS FACE. The
   * engine says why in the card's working (o.check), and in o.greyWhy for some rules; 84% of greyed cards had no
   * greyWhy, so the face said nothing. Words only: it reads the card, it changes nothing. Returns null for a live card.
   *   the stat gap:      "Cannot come off: Yamal is 7 stronger than González (19 against 12), more than the dice make up."
   *   too risky:         "Goes wrong 33 times in 36."
   *   another card:      'Greyed: "X" does at least as well on every count.' (the engine's own greyWhy)
   *   its name:          "What it says cannot happen from here."
   * T_PHRASE_BREAK=nogrey returns null for every card (the page check pgcheck.js G5 must fail). */
  /* guessWords(g) (kmtree5 a4, helper P, note 7): GUESSING'S CHIP, SAID PLAINLY. match.js guessFor builds
   * "Montiel is set for Baena's ball in behind" (a different kind of move: +2 to the attacker) or "Montiel is ready:
   * Baena ran at him last time" (the same kind: +2 to the defender); a3's words then read "Montiel expects Baena's
   * ball behind the defence again (this card is not one)". The chip now says who gets the +2 and why:
   *   other kind: why   "to Baena: last time he played the ball behind the defence, and Montiel is waiting for that
   *                      again. This is a different move, so Montiel is caught out"
   *               short "Montiel is waiting for the ball behind the defence"
   *   same kind:  why   "to Montiel: last time Baena ran at him, and he is waiting for that again"
   *               short "Montiel is waiting for it"
   * The page prints "+2 " before it. Words only: g.n, g.same, g.kind are untouched. T_PHRASE_BREAK=oldguess keeps a3's. */
  var G_PAST_P = { run: 'ran with the ball', cross: 'crossed', 'cut-back': 'passed it back from near the goal line', 'ball in behind': 'played the ball behind the defence', pass: 'passed' };
  var G_THAT = { run: 'the run', cross: 'the cross', 'cut-back': 'the pass back from near the goal line', 'ball in behind': 'the ball behind the defence', pass: 'the pass' };
  function guessWords(g) {
    if (!g || typeof g.why !== 'string' || BRK === 'oldguess' || g.__p) return null;
    var w = g.why, m, def, att, past;
    if (g.same) {
      m = /^([^ .,:;!?]+) (?:is ready|expects it): ([^ .,:;!?]+) (.+?) last time$/.exec(w);
      if (!m) return null;
      def = m[1]; att = m[2]; past = plain(m[3]);
      return { why: 'to ' + def + ': last time ' + att + ' ' + past + ', and he is waiting for that again', short: 'to ' + def + ': he is waiting for it' };   /* (the a4 review: the short form says who gets the +2 too) */
    }
    m = /^([^ .,:;!?]+) (?:is set for|expects) ([^ .,:;!?]+)'s /.exec(w);
    if (!m) return null;
    def = m[1]; att = m[2];
    var was = g.was || null;
    if (!was || !G_PAST_P[was]) return null;
    return { why: 'to ' + att + ': last time he ' + G_PAST_P[was] + ', and ' + def + ' is waiting for that again. This is a different move, so ' + def + ' is caught out',
      short: 'to ' + att + ': ' + def + ' is waiting for ' + G_THAT[was] };
  }
  function first0(p) { return p ? String(p.name || '').split(' ')[0] : ''; }
  function greyLine(o) {
    if (!o || !o.disabled || BRK0 === 'nogrey' || BRK === 'nogrey') return null;
    var chk = String(o.check || ''), m;
    var gw = o.greyWhy ? String(o.greyWhy).replace(/^Greyed: /, '') : '';
    if (gw) return gw.charAt(0).toUpperCase() + gw.slice(1);
    m = /(-?\d+) beats (-?\d+) by (\d+), which is more than the \d+ the dice can swing, so this cannot come off/.exec(chk);
    if (m) {
      var who = o.foil && o.actor ? first0(o.foil) + ' is ' + m[3] + ' stronger than ' + first0(o.actor) : 'it is ' + m[3] + ' short';
      return 'Cannot come off: ' + who + ', more than the dice make up.';
    }
    m = /This goes wrong (\d+) times in (\d+), so it is shown greyed out/.exec(chk);
    if (m) return 'Goes wrong ' + m[1] + ' times in ' + m[2] + '.';
    if (/What its name says cannot happen here/.test(chk)) return 'What it says cannot happen from here.';
    m = /This cannot come off: ([^.]+), so it is shown greyed out/.exec(chk);
    if (m) return 'Cannot come off: ' + m[1] + '.';
    m = /("[^"]+") (comes off far more often and is no riskier|does at least as well on every count here), so this one is shown greyed out/.exec(chk);
    if (m) return m[1] + ' ' + m[2].replace(/ here$/, '') + '.';
    if (/It almost never comes off/.test(chk)) return 'It almost never comes off.';
    m = /([^.]*), so (?:it|this one) is shown greyed out/.exec(chk);
    if (m) { var t = m[1].trim(); return t.charAt(0).toUpperCase() + t.slice(1) + '.'; }
    if (o.chances && o.chances.impossible) return 'Cannot come off here.';
    return 'Not possible here.';
  }
  var KEEPER_BALL = { x: 34, y: 10 };
  function fkBall(squad, holder) { var b = ballAt(squad, holder, 2); return { x: clamp(b.x, 18, 50), y: 81.5 }; }
  var API = { acrossOK: acrossOK, lateral: lateral, guessWords: guessWords, greyLine: greyLine, plain: plain, PLAIN: PLAIN, geoVerb: geoVerb, zoneOfY: zoneOfY, safeMates: safeMates, fitMenu: fitMenu, fitResult: fitResult, fitStaged: fitStaged, RULES: RULES, BECAUSE: BECAUSE, KEEPER_BALL: KEEPER_BALL, fkBall: fkBall, T: T, VERSION: VERSION, describe: describe, passVerb: passVerb, spots: spots, nearMates: nearMates, ballAt: ballAt, laneX: laneX, dist: dist };
  root.KMPhrases = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
