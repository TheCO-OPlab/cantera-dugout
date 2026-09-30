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
  var T = { SHORT: 15, LONG: 30, SWITCH: 20, RUNSAT: 15, EDGE: 25, TACKLE: 12, CARRY: 2 };
  /* claimscheck.js --break: nofit (no fitting at all), nomenu (the cards keep their template words), noresult (the
   * result keeps its words), noline (the commentator says the event's kind whatever it looks like), short20 (a
   * pass of up to 20 m is called short), noside (the side named for a receiver is not checked) */
  var BRK0 = (typeof process !== 'undefined' && process.env && process.env.T_PHRASE_BREAK) || '';
  if (BRK0 === 'short20') T.SHORT = 20;
  var VERSION = 't1';
  function Pt() { return root.KMPitch || (typeof require === 'function' ? require('./pitch.js') : null); }
  function Ct() { return root.Cantera || (typeof require === 'function' ? require('../../shared/cantera.js') : null); }

  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function laneX(x) { return x < 22 ? 0 : x < 46 ? 1 : 2; }
  function dirOf(team) { return team === 'them' ? -1 : 1; }
  var SIDE = ['left', 'middle', 'right'];

  function describe(a, b, team) {
    if (!a || !b) return null;
    var d = dist(a, b), gain = (b.y - a.y) * dirOf(team), dx = b.x - a.x, la = laneX(a.x), lb = laneX(b.x);
    return { d: d, gain: gain, dx: dx, laneA: la, laneB: lb, side: SIDE[lb],
      short: d <= T.SHORT, long: d >= T.LONG, back: gain < 0, forward: gain > 0,
      across: la !== lb, switched: la !== lb && Math.abs(dx) >= T.SWITCH };
  }
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
    if (sd >= 25 && sd >= Math.abs(ds.gain)) return 'passes it across the pitch to';
    if (ds.gain <= -5 && -ds.gain >= sd) return 'passes it back to';
    if (ds.gain >= 10 && ds.gain >= sd) return 'passes it forward to';
    if (ds.short) return 'plays it short to';
    if (ds.across) return 'passes it across to';
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
      ok: function (ds, m) { return ds.switched && (!m[4] || BRK === 'noside' || SIDE[ds.laneB] === m[4]); } },
    { id: 'across', re: new RegExp(NMR + ' ((?:passes|plays|hits) it across(?: the pitch)?) to ' + NMR, 'g'),
      ok: function (ds, m) { return / the pitch/.test(m[2]) ? ds.switched : ds.across; } },
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
    Z_CUTBACK: ['a pass back along the ground is hard to stop', 'a pass along the ground is hard to stop']
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
    [/([^ .,:;!?]+) is set for ([^ .,:;!?]+)'s ([a-z-]+(?: [a-z-]+)?)/g, "$1 expects $2's $3 again (this card is not one)"],
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
    'passes it out', 'switches it', 'passes it across the pitch', 'passes it across', 'hits it across the pitch', 'plays a long ball forward', 'plays a long ball',
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
    if (id === 'Z_THROUGH' || verb === 'plays the ball through') {
      restOut = rest.replace(/^ to run onto/, '');
      core = strongForward(ds, 10) ? A + ' plays the ball ahead of ' + R + ' (' + mt + '), for him to run onto' : A + ' ' + gv + ' ' + R + ' (' + mt + ')';
    } else if (id === 'Z_RUN_BEHIND' || (verb === 'kicks it long' || verb === 'kicks it up the pitch') && / to chase/.test(rest)) {
      restOut = rest.replace(/^ to chase/, '');
      core = strongForward(ds, 15) ? A + ' kicks it forward for ' + R + ' (' + mt + ') to run after' : A + ' ' + gv + ' ' + R + ' (' + mt + '), and ' + R + ' has to get to it before ' + (foilName(o) || 'their defender');
    } else if (verb === 'kicks it long' || verb === 'kicks it up the pitch') {
      core = A + ' ' + (ds.d >= T.LONG ? 'kicks it long to' : 'kicks it high to') + ' ' + R + ' (' + mt + ')';
      restOut = rest;
    } else if (verb === 'cuts it back' || verb === 'pulls it back from the byline') {
      var pa = pic.pos[m.Aid], team = m.team, gl = pa ? (team === 'them' ? pa.y : 105 - pa.y) : 99;
      core = gl <= 12 && ds.gain <= 0 ? A + ' passes it back from near the goal line to ' + R + ' (' + mt + ')' : A + ' ' + gv + ' ' + R + ' (' + mt + ')';
      if (/^, who is arriving in the box/.test(rest)) { var pb = pic.pos[B.id], bl = pb ? (team === 'them' ? pb.y : 105 - pb.y) : 99; if (bl > 22) restOut = rest.replace(/^, who is arriving in the box/, ''); }
    } else if (verb === 'plays the free kick short' || verb === 'plays the free kick') {
      core = A + ' plays the free kick ' + (ds.short ? 'short ' : '') + 'to ' + R + ' (' + mt + ')';
    } else {
      core = A + ' ' + gv + ' ' + R + ' (' + mt + ')';
    }
    /* what the rest of the label says about where the receiver is */
    var side = restOut.match(/^ on the (left|right)/);
    if (side && BRK !== 'noside') restOut = restOut.replace(/^ on the (left|right)/, ds.laneB !== 1 ? ' on the ' + SIDE[ds.laneB] : '');   /* --break noside: the engine's side is kept */
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
          ['plays it short to', 'passes it out to', 'passes it back to', 'passes it across to', 'switches it to', 'passes it forward to'].forEach(function (v) {
            var f = m[1] + ' ' + v + ' ' + m[4];
            if (f !== m[1] + ' ' + m[2] + ' ' + m[3] + ' ' + m[4]) cores.push({ from: f, to: pl.core, side: sideNow });
          });
          reps.push({ rule: 'pass', card: o.id, from: lab, to: newLab, d: ds.d, gain: ds.gain, dx: ds.dx, pair: A.id + '>' + B.id, verb: pl.core });
          if (BECAUSE[o.id] && (!ds.short || o.id === 'Z_CUTBACK')) cores.push({ from: BECAUSE[o.id][0], to: BECAUSE[o.id][1] });
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
  var RESULT_RE = new RegExp(NMR + ' (plays it short|passes short|passes it short|passes it back|passes it forward|passes it out|switches it|passes it across the pitch|passes it across|plays a long ball forward|plays a long ball|passes it) to ' + NMR, 'g');
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
    if (nx && nx.lead) nx.lead = fix(String(nx.lead));
    note(ev, reps);
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
  var KEEPER_BALL = { x: 34, y: 10 };
  function fkBall(squad, holder) { var b = ballAt(squad, holder, 2); return { x: clamp(b.x, 18, 50), y: 81.5 }; }
  var API = { plain: plain, PLAIN: PLAIN, geoVerb: geoVerb, zoneOfY: zoneOfY, safeMates: safeMates, fitMenu: fitMenu, fitResult: fitResult, RULES: RULES, BECAUSE: BECAUSE, KEEPER_BALL: KEEPER_BALL, fkBall: fkBall, T: T, VERSION: VERSION, describe: describe, passVerb: passVerb, spots: spots, nearMates: nearMates, ballAt: ballAt, laneX: laneX, dist: dist };
  root.KMPhrases = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
