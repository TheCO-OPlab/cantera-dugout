/* headline.js (hd1): THE RESULT HEADLINE. One short sentence (at most 12
 * words, never more than 14) that says literally what a result did, built
 * from the result's DATA: the dice, whose moment it was, the option's named
 * men, the result's row (effect, end, via, trip, rebound), the score and the
 * next moment the engine has already set up (who has the ball and where). It
 * never trims the long text; the long text stays in "What has happened".
 *
 * Why (pace1, RHYTHM.md; DECISIONS item 25): after a choice the result text
 * (53 words on average) was on screen for 0.66 s before the next play or
 * moment arrived. The fix tested here: this headline, held HOLD ms on a
 * still pitch after the dots stop, then a BREATHER ms pause, then play goes
 * on.
 *
 * The words, the same for every kind of result:
 *   clean win (by 4 or more)  "Baena beats Montiel (by 5)."
 *   half win (by 1 to 3)      "Baena just beats Montiel (by 2)."
 *   half win (level)          "Baena and Montiel are level."
 *   loss                      "Montiel beats Baena (by 3)."
 * The subject is always the man whose total was bigger, so the verb never
 * contradicts the dice shown above it. A result with a concrete event says
 * the event instead: "Oyarzabal scores.", "Simón saves.", "Tagliafico wins
 * the ball (by 3)." The second sentence says where the ball is and who has
 * it, with team names ("Argentina attack.", "Spain 1, Argentina 0.").
 *
 *   KMHeadline.headline(ev, ctx) -> { text, words, parts, has, holder,
 *                                     scorer, names, form }
 *   ctx: { st, p (the moment chosen in), o (the option chosen), nx (the
 *          next pending moment or null), holderOf (fn(st, nx) -> player,
 *          the page's man with the ball; pitch.js holderOf) }
 *   KMHeadline.PACE  { hold: 600, perWord: 150, breather: 150 } (ms; a3: was 1000 / 150 / 300)
 *   KMHeadline.holdMs(hd)  m6: how long the headline is held on a still
 *          pitch: 0.25 s a word, at least 1.5 s (DECISIONS item 31)
 *   KMHeadline.wordCount(text)
 */
(function (root) {
  'use strict';

  var PACE = { hold: 600, perWord: 150, breather: 150 };   /* a3 (helper W; Eduardo 09-30: "Shorten pauses after results"): was 1000 / 150 / 300; 0.15 s a word kept, so every headline keeps its reading time; ?restpace=old (KM_RESTPACE=old in node) gives the old numbers */
  try { if ((typeof process !== 'undefined' && process.env && process.env.KM_RESTPACE === 'old') || (root.location && /[?&]restpace=old\b/.test(root.location.search || ''))) PACE = { hold: 1000, perWord: 150, breather: 300 }; } catch (e) { }   /* 09-25: shorter after playtest (it read as a freeze); was 1500 / 250 / 600 */
  function holdMs(hd) { var w = hd && hd.words != null ? hd.words : wordCount(hd && hd.text); return Math.max(PACE.hold, Math.round(PACE.perWord * w)); }
  var CAP = 12, HARD = 14;
  var GOOD_BY = 4;

  function first(p) { return p && p.name ? String(p.name).split(' ')[0] : null; }
  /* words as a reader counts them: a name joined by a no-break space
   * ("De Paul") counts as two */
  function wordCount(t) { return String(t || '').split(/[\s ]+/).filter(function (w) { return /[A-Za-z0-9À-ɏ]/.test(w); }).length; }
  function teamOf(st, side) { var sq = side === 'you' ? st.squad : st.opp; return (sq && sq.club) || (side === 'you' ? 'You' : 'They'); }
  function poss(name) { return /s$/.test(name) ? name + "'" : name + "'s"; }
  function sameMan(a, b) { return !!(a && b && (a === b || (a.id != null && a.id === b.id))); }
  function isKeeper(st, pl) { return !!(pl && ((st.squad && sameMan(st.squad.keeper, pl)) || (st.opp && sameMan(st.opp.keeper, pl)))); }
  function keeperOf(st, side) { var sq = side === 'you' ? st.squad : st.opp; return sq ? sq.keeper : null; }

  /* the result's row, chosen exactly as match.js choose() chooses it */
  function outcomeOf(o, band) {
    var picked = null;
    (o && o.outcomes || []).forEach(function (x) { if ((x.bands || [x.band]).indexOf(band) >= 0) picked = x; });
    return picked || {};
  }

  /* the duel, in the three words: beats / just beats / are level / beats */
  var HBRK = (typeof process !== 'undefined' && process.env && process.env.T_PHRASE_BREAK) || (function () { try { return (/[?&]pbreak=(\w+)/.exec((root.location && root.location.search) || '') || [])[1] || ''; } catch (e) { return ''; } })();
  function duel(ev) {
    var d = ev.dice;
    if (!d) return null;
    var A = ev.actorName, F = ev.foilName;
    if (!A || !F) return null;
    /* kmtree5 a4 (helper P, notes 18 and 19): a duel of several take-ons (Slalom) names the one that decided it, and
     * says how the others went (match.js keeps each check's roll and man in dice.checks; G names the decider) */
    if (d.checks && d.checks.length > 1 && HBRK !== 'slalomone') {
      var ck = d.checks, nmOf = function (c) { return c.name || String((c.foil && c.foil.name) || '').split(' ')[0]; };
      var lost = ck.filter(function (c) { return c.band === 'bad'; })[0], past = ck.filter(function (c) { return c.band !== 'bad'; }).map(nmOf);
      var clean = ck.every(function (c) { return c.band === 'good'; });
      if (lost) return { text: (past.length ? A + ' gets past ' + past.join(' and ') + ', then ' : '') + nmOf(lost) + ' stops ' + (past.length ? 'him' : A) + ' (by ' + (-lost.diff) + ').',
        short: nmOf(lost) + ' stops ' + A + '.', winner: nmOf(lost), loser: A, band: 'loss' };
      if (clean) return { text: A + ' gets past ' + past.join(' and ') + ', both cleanly.', short: A + ' gets past ' + past.join(' and ') + '.', winner: A, loser: F, band: 'clean' };
      return { text: A + ' gets past ' + past.join(' and ') + ', not both cleanly.', short: A + ' just gets past ' + past.join(' and ') + '.', winner: A, loser: F, band: 'half' };
    }
    if (d.diff >= ((root.KMResolve && root.KMResolve.GOOD_BY) || GOOD_BY)) return { text: A + ' beats ' + F + ' (by ' + d.diff + ').', short: A + ' beats ' + F + '.', winner: A, loser: F, band: 'clean' };
    if (d.diff > 0) return { text: A + ' just beats ' + F + ' (by ' + d.diff + ').', short: A + ' just beats ' + F + '.', winner: A, loser: F, band: 'half' };
    if (d.diff === 0) return { text: A + ' and ' + F + ' are level.', short: A + ' and ' + F + ' are level.', winner: null, loser: null, band: 'level' };
    return { text: F + ' beats ' + A + ' (by ' + (-d.diff) + ').', short: F + ' beats ' + A + '.', winner: F, loser: A, band: 'loss' };
  }
  /* "(by 3)" when the man named won the roll */
  function byIf(ev, name) {
    var d = ev.dice;
    if (!d || !name) return '';
    if (d.diff > 0 && name === ev.actorName) return ' (by ' + d.diff + ')';
    if (d.diff < 0 && name === ev.foilName) return ' (by ' + (-d.diff) + ')';
    return '';
  }

  /* where the ball is, in the page's own zone words */
  var AT = {
    'your half': 'in your half', 'midfield': 'in midfield', 'the edge of their box': 'at the edge of their box',
    'their box': 'in their box', 'the edge of your box': 'at the edge of your box', 'your box': 'in your box'
  };
  var AT_SHORT = { 'the edge of their box': 'outside their box', 'the edge of your box': 'outside your box' };

  /* who scored: from the option's named men (and, for a low cross into your
   * box, the man it was aimed at) */
  function scorerOf(ev, ctx, x) {
    var o = ctx.o || {}, p = ctx.p || {};
    if (ev.kind === 'goal') return o.shotBy || o.mate || x.to || o.actor || null;
    var pl = p.play || {};
    /* m6: a keeper who comes for the cross (or dives at it) and misses: the
     * man it was aimed at scores, as the long text says ("{tgt} gets to it
     * first, and scores"); the duel was against the man crossing it. Seen
     * once m6 left the Cross catcher's card live (hdcheck H7). */
    if (o.tgtMan) return o.tgtMan;
    /* your man misses the low cross: the man waiting in the box scores */
    if (pl.target && o.foil && sameMan(pl.ball, o.foil) && (pl.via === 'lowcross' || pl.via === 'cross')) return pl.target;
    return o.foil || null;
  }

  /* the next moment, when the same play goes on */
  function nextOf(ctx) {
    var nx = ctx.nx;
    if (!nx || !nx.continues) return null;
    var who = nx.attacking || (nx.moment && nx.moment.sit && nx.moment.sit.who);
    var h = ctx.holderOf ? ctx.holderOf(ctx.st, nx) : (nx.carrier || null);
    var via = (nx.play && nx.play.via) || nx.via || (nx.moment && nx.moment.via) || null;
    return { who: who, holder: h, zone: nx.zone, via: via, box: nx.zoneIndex === -1 || nx.zone === 'your box' };
  }

  /* kmtree5 a6 (stream X; Eduardo's match mupymxvwft3c, minute 58): THE HEADLINE AGREES WITH THE RESULT SENTENCE ON
   * THE LAST BALL. The card was "Baena floats it into the box for Rodri to head", the result "Rodri is beaten in the
   * air by Warren. Warren heads it out of play, and the attack is over.", and this headline said "Rodri's header goes
   * wide.": it was built from the card's data alone (a header card that ends wide, over or out names the card's man
   * and says "goes wide"), and the card's man never touched the ball. Now the result sentence is read for the last
   * ball: when another man played it (he "heads it out of play", "blocks it", "saves it", "catches it", "gets a foot
   * to it"), the headline says what HE did; a man the sentence has "beaten" to the ball is never given a header or a
   * shot; "wide", "over the bar" and "out of play" come from the sentence; and a keeper "saves" only when the
   * sentence has a save (a cross he catches is "catches it"). hdcheck.js HX checks it over plain matches and cup
   * runs, on both dice. ON by default; KM_X_HEAD=a5 (node) or ?xhead=a5 (page) gives a5's headline back exactly. */
  var C9OWN = (function () { try { var off = []; var m = /[?&]c9off=([\w,]*)/.exec((root.location && root.location.search) || ''); if (m) off = m[1].split(','); if (typeof process !== 'undefined' && process.env && process.env.KM_C9_OFF) off = off.concat(String(process.env.KM_C9_OFF).split(',')); return off.indexOf('own') < 0 && off.indexOf('all') < 0; } catch (e) { return true; } })();   /* a12 CHK9: ?c9off=own */
  var X_HEAD = !(typeof process !== 'undefined' && process.env && process.env.KM_X_HEAD === 'a5');
  try { if (/[?&]xhead=a5\b/.test((root.location && root.location.search) || '')) X_HEAD = false; } catch (e) { }
  var SAVE_WORDS = /\bsaves (?:it|the)\b|\bpushes (?:it|the)\b|\bgets down\b|\bgets a fingertip\b|\bholds the shot\b|\bpunches\b/;
  var CATCH_WORDS = /\bcatches\b|\bholds on to it\b/;
  /* the man on the pitch with this first name (either team) */
  function manNamed(st, n) {
    var found = null;
    [st.squad, st.opp].forEach(function (sq) {
      if (!sq) return;
      (sq.players || []).concat(sq.keeper ? [sq.keeper] : []).forEach(function (q) { if (!found && first(q) === n) found = q; });
    });
    return found;
  }
  /* the last man the result sentence has playing the ball away from the card's man: { man, verb }, or null when the
   * sentence has no such man (the name stands straight before the verb in every result sentence: resolve.js) */
  function lastBall(st, text, not) {
    /* (a first name of two words is joined by a no-break space, "De Paul", so only a plain space ends the name) */
    var re = /([^ .,\n]+) (?:gets back and )?(heads it out of play|blocks it|saves it|catches it|gets a (?:foot|hand) to it)/g, m, last = null;
    while ((m = re.exec(String(text || '')))) { var q = manNamed(st, m[1]); if (q && !sameMan(q, not)) last = { man: q, verb: m[2] }; }
    return last;
  }

  /* kmtree5 a11 (helper Q; Eduardo's cup on a9, semi-final, minute 12: "I think I win the duel but they still keep the ball.
   * Confusing." The result was a half win: "Cucurella gets to the ball first, but only kicks it a few metres. The ball drops at the
   * edge of your box, and Robbie has it." The headline was "Cucurella just beats Robbie (by 2). Robbie has it outside your box.").
   * A HALF WIN'S HEADLINE SAYS WHAT THE MAN DID, NOT THAT HE BEAT SOMEBODY. When the result's band is the half win, the sentence
   * about the dice ("X just beats Y (by 2).") is not used. In its place: the first clause of the result sentence, as written
   * ("Cucurella gets to the ball first"), and then what the headline already said about where the ball is. When the other team
   * still has the ball the two are joined by "but": "Cucurella gets to the ball first, but Robbie has it outside your box."
   * The clause is used only when it starts with a man on the pitch, is at most 9 words and has none of the words the headline
   * may not use (hdcheck H3); otherwise the headline is the second part alone. A level roll keeps "X and Y are level." as a
   * fallback. Nothing is invented: every word of the first part is the result sentence's. hdcheck.js HX (c) and (d) check it.
   * ON by default; KM_MOVE=a5 or KM_PBREAK=q11half (node), ?move=a5 or ?pbreak=q11half (page): a10's headline exactly. */
  var Q11_HALF = true;
  try { if (typeof process !== 'undefined' && process.env && (process.env.KM_MOVE === 'a5' || /(^|,)q11half(,|$)/.test(process.env.KM_PBREAK || ''))) Q11_HALF = false; } catch (e) { }
  try { var q11q = (root.location && root.location.search) || ''; if (/[?&]move=a5\b/.test(q11q) || /[?&]pbreak=[\w,]*q11half\b/.test(q11q)) Q11_HALF = false; } catch (e) { }
  /* A choice for Eduardo, built and OFF (DECISIONS-Q11.md item 5): KM_Q11_HALF=long (node) or ?q11half=long (page) lets a half
   * win's headline run to 20 words, so it can carry the result sentence's whole first sentence with its own "but" ("Sam takes the
   * long pass, but Bobby is already there. Sam has it in midfield."). It costs a taller dice box and a longer hold. */
  var Q11_LONG = false;
  try { if (typeof process !== 'undefined' && process.env && process.env.KM_Q11_HALF === 'long') Q11_LONG = true; } catch (e) { }
  try { if (/[?&]q11half=long\b/.test((root.location && root.location.search) || '')) Q11_LONG = true; } catch (e) { }
  /* a half win: the result's band is the half win, on one roll, and a half win is not the same result as a clean one */
  function halfWin(ev) { var d = ev && ev.dice; return !!(ev && ev.band === 'mixed' && d && !d.halfSame && !(d.checks && d.checks.length > 1)); }
  /* the words a headline may not use (hdcheck.js H3: reviews/text-audit.md); a clause of the result sentence that has one is not taken */
  var NOT_IN_HEADLINE = [/through on (goal|his own|your goal)/i, /keeper to beat/i, /half a win|clean win|\bedged\b/i,
    /gets a foot to|half a metre on|a step (late|behind|ahead)|hits the target|gets a touch on/i, /the danger is over|cannot jump/i, /comes off|come off/i,
    /get a hand to/i, /into feet|easy ball/i, /\bcut-back|pull-back|one-two|overlap/i, /off his line|leaves the line/i, /back line|loses [A-Z]/, /\bcounter\b/i, /\bzone\b/i,
    /onside|offside/i, /\bsiege\b|keeps coming back/i, /got it out/i, /\bis on\b/i, /fresh legs/i, /slices/i, /play on|go long/i, /opened by|\buses:/i, /\bcheck\b/i, /5\.5-metre/i,
    /in behind|closed down|turned over/i, /nothing comes of it/i, /[—–]/, /\bbeats\b|\bbeaten\b|wins the ball/];
  var GOT_MAX = 9;
  var FIX3_HD = true;   /* a12 (stream FIX3): GAME3a's counters in branch 7 below */
  try { if (typeof process !== 'undefined' && process.env && /(^|,)(hd|all)(,|$)/.test(process.env.KM_FIX3OFF || '')) FIX3_HD = false; } catch (e) { }
  try { if (/[?&]fix3off=[\w,]*\b(hd|all)\b/.test((root.location && root.location.search) || '')) FIX3_HD = false; } catch (e) { }
  var FIX2_HDPEN = true;   /* a12 (stream FIX2): the Diver penalty's headline (branch 8 below) */
  try { if (typeof process !== 'undefined' && process.env && /(^|,)(hdpen|all)(,|$)/.test(process.env.KM_FIX2OFF || '')) FIX2_HDPEN = false; } catch (e) { }
  try { if (/[?&]fix2off=[\w,]*\b(hdpen|all)\b/.test((root.location && root.location.search) || '')) FIX2_HDPEN = false; } catch (e) { }
  /* what the man did, in the result sentence's own words: its first sentence up to the first comma (or " and your team"), when
   * that starts with a man on the pitch. Returns the clause without a full stop, or null. */
  function gotOf(st, ev) {
    var t = String((ev && ev.text) || '').replace(/^(GOAL|THEY SCORE)\. /, '');
    var m = /^([\s\S]*?)[.!?](?=\s|$)/.exec(t), s1 = m ? m[1] : t;
    var c = s1.split(/, | and your team /)[0].trim();
    var who = /^([^ .,\n]+) /.exec(c);
    if (!c || !who || !manNamed(st, who[1])) return null;
    if (wordCount(c) > GOT_MAX) return null;
    for (var i = 0; i < NOT_IN_HEADLINE.length; i++) if (NOT_IN_HEADLINE[i].test(c)) return null;
    return c;
  }

  /* the end of a play, in plain words (resolve.js END codes) */
  var END_YOU = { wide: 'The ball goes wide.', over: 'The ball goes over the bar.', out: 'The ball goes out of play.',
    'throw': 'The ball goes out for a throw-in.', blocked: 'The ball is blocked and goes out.', time: 'Time is added back on.',
    clock: 'The clock runs down.', fresh: 'The substitute changes nothing.' };
  var END_THEM = { wide: 'The ball goes wide.', over: 'The ball goes over the bar.', out: 'The ball goes out of play.',
    'throw': 'The ball goes out for a throw-in.', time: 'Time is added back on.', clock: 'The clock runs down.',
    fresh: 'The substitute changes nothing.', back: 'They have to pass it back.' };
  /* your keeper's options where the duel is a shot at him */
  var SAVE = { boxsave: 1, boxsavehold: 1, boxsavec: 1, boxsavechold: 1, boxhold: 1, keepreact: 1, keepcatch: 1, keepcatch0: 1, tdrop: 1 };

  /* Build the candidates, longest (most said) first; the first that fits
   * CAP words is used, else the shortest. */
  function headline(ev, ctx) {
    var out = headline0(ev, ctx);
    /* a12 CHK9 (ENG8 kball, review finding 4): your keeper had the ball and passes it to a man: the page said "Simon gets the ball. Spain attack, +2 next."
     * (the keeper already had it). The first sentence is the engine's ("Cubarsi has it."), the rest the page's own words, so the page's length and idiom
     * rules (hdcheck H2, H3) still hold. ?c9off=own / KM_C9_OFF=own: as before. */
    if (C9OWN && ev && ev.ownBall && ev.goesOn && out && out.text && ev.kind !== 'goal' && ev.kind !== 'conceded') {
      var em = /^([^.!?]+ has it\.)/.exec(String(ev.headline || '')), pm = /^[^.!?]*[.!?]\s*([\s\S]*)$/.exec(out.text);
      if (em && pm && /gets the ball|wins the ball|gets it/.test(out.text.slice(0, out.text.indexOf('.') + 1))) {
        out.text = em[1] + (pm[1] ? ' ' + pm[1] : ''); out.parts = [em[1]].concat(pm[1] ? [pm[1]] : []); out.words = wordCount(out.text);
        var hm = /^(\S+) has it\.$/.exec(em[1]); if (hm) { out.holder = hm[1]; if (out.names.indexOf(hm[1]) < 0) out.names.push(hm[1]); }
      }
    }
    return out;
  }
  function headline0(ev, ctx) {
    ctx = ctx || {};
    var st = ctx.st || {}, o = ctx.o || {}, p = ctx.p || {};
    var mine = (ev.sit && ev.sit.who) === 'you';
    var U = teamOf(st, 'you'), T = teamOf(st, 'them');
    var x = outcomeOf(o, ev.band);
    var du = duel(ev);
    var nx = nextOf(ctx);
    var out = { has: null, holder: null, scorer: null, names: [], form: null };
    var cands = [];   // arrays of sentences
    function name(pl) { var n = first(pl); if (n && out.names.indexOf(n) < 0) out.names.push(n); return n; }
    function over(side) { return [poss(side === 'you' ? U : T) + ' attack is over.', 'The attack is over.']; }
    /* kmtree5 a11 (helper Q): a half win takes its first part from the result sentence (gotOf above), never from the dice.
     * but: the other team has the ball after it, and the second part starts with their man, so the two are one sentence. */
    var hw = Q11_HALF && halfWin(ev), got = hw && st.squad ? gotOf(st, ev) : null;
    function withDuel(rest, restShort, but) {
      var r = [].concat(rest), rs = [].concat(restShort || rest);
      if (hw) {
        if (got) {
          [st.squad, st.opp].forEach(function (sq) { if (sq) (sq.players || []).concat(sq.keeper ? [sq.keeper] : []).forEach(function (q) { var n = first(q); if (n && got.indexOf(n) >= 0) name(q); }); });
          out.got = got;
          /* (the "but" form may run to HARD words, 14: his own case is 13, "Cucurella gets to the ball first, but Robbie has it outside your box.") */
          var g1 = but ? [got + ', but ' + r[0]].concat(r.slice(1)) : [got + '.'].concat(r), g2 = but ? [got + ', but ' + rs[0]].concat(rs.slice(1)) : [got + '.'].concat(rs);
          cands.push(g1.slice()); cands.push(g2.slice());   /* (first within CAP, 12; only then, and only when the other team still has the ball, the same two up to HARD) */
          if (but) { g1.cap = HARD; g2.cap = HARD; }
          if (Q11_LONG) {
            var tx0 = String(ev.text || ''), m0 = /^([\s\S]*?)[.!?](?=\s|$)/.exec(tx0), s0 = m0 ? m0[1] : '';
            if (s0.indexOf(got) === 0 && /, but /.test(s0) && !NOT_IN_HEADLINE.some(function (re) { return re.test(s0); })) { var g0 = [s0 + '.'].concat(r), g00 = [s0 + '.'].concat(rs); g0.cap = 20; g00.cap = 20; cands.push(g0); cands.push(g00); }
          }
          cands.push(g1); cands.push(g2);
        }
        if (du && du.band === 'level') { cands.push([du.text].concat(r)); cands.push([du.short].concat(rs)); }
        cands.push(r); cands.push(rs);
        return;
      }
      if (du) { cands.push([du.text].concat(r)); cands.push([du.short].concat(r)); cands.push([du.short].concat(rs)); }
      cands.push(r); cands.push(rs);
    }

    /* 1. a goal, either way */
    if (ev.kind === 'goal' || ev.kind === 'conceded') {
      var sc = scorerOf(ev, ctx, x), s = st.score || { you: 0, them: 0 };
      var sn = name(sc) || (ev.kind === 'goal' ? U : T);
      out.scorer = first(sc); out.form = 'goal';
      var line = U + ' ' + s.you + ', ' + T + ' ' + s.them + '.';
      cands.push([sn + ' scores.', line]);
      cands.push([sn + ' scores.']);
      return finish(out, cands);
    }

    /* 2. a substitution */
    if (ev.kind === 'rest') {
      out.form = 'sub';
      var on = name(o.actor);
      cands.push([(on || 'A substitute') + ' comes on as a substitute.']);
      cands.push([(on || 'A substitute') + ' comes on.']);
      return finish(out, cands);
    }

    if (mine) {
      var shot = !!o.shotBy || /^(shot|placed|longshot|header|shotreb|fkshot|rebshot|square|pullback|lowcross)$/.test(o.pays || '');
      var theirK = keeperOf(st, 'them');
      /* 3. you lost the ball */
      if (ev.effect === 'break') {
        out.has = 'them'; out.form = 'lost';
        var taker = o.foil;
        if (taker && isKeeper(st, taker)) {
          var kn = name(taker);
          cands.push([kn + ' catches it' + byIf(ev, kn) + '.', T + ' attack.']);
          cands.push([kn + ' catches it.', T + ' attack.']);
        } else if (ev.dice && taker) {
          var tn = name(taker);
          cands.push([tn + ' wins the ball' + byIf(ev, tn) + '.', T + ' attack.']);
          cands.push([tn + ' wins the ball.', T + ' attack.']);
        } else {
          var gv = name(o.actor);
          cands.push([(gv || U) + ' gives the ball away.', T + ' attack.']);
        }
        return finish(out, cands);
      }
      /* 4. a shot saved, and the loose ball */
      if (nx && nx.who === 'you' && (x.rebound || (shot && ev.fromZone === 3 && nx.zone === 'their box' && isKeeper(st, o.foil)))) {
        out.form = 'rebound'; out.has = 'you';
        var k1 = name(isKeeper(st, o.foil) ? o.foil : theirK), h1 = name(nx.holder);
        out.holder = h1;
        cands.push([k1 + ' saves.', h1 + ' gets the loose ball.']);
        cands.push([k1 + ' saves.', h1 + ' has it.']);
        return finish(out, cands);
      }
      /* 5. the same attack goes on */
      if (nx && nx.who === 'you') {
        out.has = 'you'; out.holder = first(nx.holder);
        var hn = name(nx.holder), at = AT[nx.zone] || ('in ' + nx.zone), ats = AT_SHORT[nx.zone] || at;
        if (x.mode === 'freekick') {
          out.form = 'freekick';
          var tripper = x.trip || null;
          var fouled = o.actor;
          var fk = 'Free kick to ' + U + ' ' + at + '.', fkm = 'Free kick to ' + U + ' ' + ats + '.', fks = 'Free kick to ' + U + '.';
          if (tripper) {
            var trn = name(tripper), fdn = name(fouled);
            cands.push([trn + ' trips ' + fdn + '.', fk]);
            cands.push([trn + ' trips ' + fdn + '.', fkm]);
            cands.push([trn + ' trips ' + fdn + '.', fks]);
          }
          withDuel([fk], [fks]);
          return finish(out, cands);
        }
        out.form = 'goes on';
        withDuel([hn + ' has it ' + at + '.'], [hn + ' has it ' + ats + '.']);
        cands.push([U + ' have it ' + ats + '.']);
        return finish(out, cands);
      }
      /* 6. your attack ends */
      out.form = 'ends';
      var end = x.end || null;
      if (shot && (end === 'saved' || end === 'caught')) {
        var k2 = name(isKeeper(st, o.foil) ? o.foil : theirK);
        cands.push([k2 + (end === 'caught' ? ' catches it.' : ' saves.'), over('you')[0]]);
        cands.push([k2 + (end === 'caught' ? ' catches it.' : ' saves.'), over('you')[1]]);
        return finish(out, cands);
      }
      if (shot && (end === 'wide' || end === 'over' || end === 'out')) {
        var sh = name(o.shotBy || o.actor);
        var what = o.pays === 'header' ? 'header' : 'shot';
        var where = end === 'wide' ? 'goes wide' : end === 'over' ? 'goes over the bar' : 'goes out of play';
        if (X_HEAD) {
          /* a6 (stream X): the result sentence decides who played the last ball and how it left play */
          var txt = String(ev.text || ''), lb = lastBall(st, txt, o.shotBy || o.actor);
          if (lb) {
            var ln = name(lb.man);
            var did = lb.verb === 'heads it out of play' ? ln + ' heads it out of play.' : lb.verb === 'saves it' ? ln + ' saves.' :
              lb.verb === 'catches it' ? ln + ' catches it.' : ln + ' blocks ' + poss(sh) + ' ' + what + '.';
            cands.push([did, over('you')[0]]);
            cands.push([did, over('you')[1]]);
            return finish(out, cands);
          }
          var tw = /over the bar|clears the bar/.test(txt) ? 'over' : /goes wide|just wide|shoots wide|goal kick/.test(txt) ? 'wide' : /out of play/.test(txt) ? 'out' : end;
          /* (the card's man was beaten to the ball and the sentence names nobody else on it: say only where it went) */
          if (new RegExp('(^|[^A-Za-z\u00c0-\u024f])' + String(sh).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' is beaten ').test(txt)) {
            cands.push([END_YOU[tw], over('you')[0]]);
            cands.push([END_YOU[tw], over('you')[1]]);
            return finish(out, cands);
          }
          where = tw === 'wide' ? 'goes wide' : tw === 'over' ? 'goes over the bar' : 'goes out of play';
        }
        cands.push([poss(sh) + ' ' + what + ' ' + where + '.', over('you')[0]]);
        cands.push([poss(sh) + ' ' + what + ' ' + where + '.', over('you')[1]]);
        return finish(out, cands);
      }
      if (end === 'cleared') { cands.push([T + ' kick it clear.', over('you')[0]]); cands.push([T + ' kick it clear.', over('you')[1]]); return finish(out, cands); }
      if (end === 'keeper') { withDuel([poss(T) + ' keeper gets the ball.', over('you')[1]], [poss(T) + ' keeper gets it.']); return finish(out, cands); }
      if (end === 'kept' || ev.kind === 'kept') {
        out.has = 'you';
        withDuel([U + ' keep the ball, but the attack is over.'], [U + ' keep it. The attack is over.']);
        return finish(out, cands);
      }
      if (END_YOU[end]) { withDuel([END_YOU[end], over('you')[0]], [END_YOU[end], over('you')[1]]); return finish(out, cands); }
      withDuel([over('you')[0]], [over('you')[1]]);
      return finish(out, cands);
    }

    /* THEIR ATTACK */
    var yourK = keeperOf(st, 'you');
    var kAct = o.actor && isKeeper(st, o.actor);
    var end2 = x.end || null;
    /* 7. you won the ball (your attack is next, or the match ends) */
    if (ev.kind === 'escaped' || ev.handoff || ev.lastWin) {
      out.form = 'won';
      var then = ev.lastWin ? 'That is the end of the match.' : U + ' attack.';
      if (!ev.lastWin) out.has = 'you';
      /* kmtree5 a12 (stream FIX3; GAME3a's defending outcomes, Eduardo's J5): A WON DEFENDING DUEL IS YOUR ATTACK, AND
       * THE HEADLINE SAYS WHICH OF THE TWO. A clean win (the result carries an edge to you, "then +2 to you next") says
       * the edge: "Rodri wins the ball (by 5). Spain attack, +2 next." A half win (no edge) says the man won it and no
       * edge, never the clean win's "wins the ball (by 2)": "Rodri wins it. Spain attack." (a keeper: "Callum gets the
       * ball. ..."). A pause (the play ends) is branch 9 ("Spain's attack is over."). hdcheck HX (c) and (f).
       * KM_FIX3OFF=hd (node), ?fix3off=hd (page): as before. */
      var g3x = !ev.lastWin && FIX3_HD ? outcomeOf(o, ev.band) : null, g3n = g3x && /\+(\d+) to you next/.exec(String(g3x.short || ''));
      if (g3x && g3x.g3Counter) {
        var tailC = g3n ? U + ' attack, +' + g3n[1] + ' next.' : U + ' attack.';
        out.form = g3n ? 'won, +' : 'won';
        if (kAct) {
          var kc3 = name(o.actor);
          var kv3 = !g3n ? ' gets the ball.' : SAVE[o.pays] ? ' saves and keeps the ball.' : end2 === 'held' ? ' catches it.' : ' gets the ball.';
          if (g3n && X_HEAD && SAVE[o.pays] && !SAVE_WORDS.test(String(ev.text || ''))) kv3 = CATCH_WORDS.test(String(ev.text || '')) ? ' catches it.' : ' gets the ball.';
          cands.push([kc3 + kv3, tailC]);
          cands.push([kc3 + ' has the ball.', tailC]);
        } else if (o.actor) {
          var wc3 = name(o.actor);
          if (g3n) { cands.push([wc3 + ' wins the ball' + byIf(ev, wc3) + '.', tailC]); cands.push([wc3 + ' wins the ball.', tailC]); }
          else cands.push([wc3 + ' wins it.', tailC]);
        } else cands.push([U + (g3n ? ' win the ball.' : ' win it.'), tailC]);
        return finish(out, cands);
      }
      if (kAct) {
        var kk = name(o.actor);
        var kv = SAVE[o.pays] ? ' saves and keeps the ball.' : end2 === 'held' ? ' catches it.' : ' gets the ball.';
        /* a6 (stream X): "saves" only when the result sentence has a save; a cross or a header he catches is "catches it" */
        if (X_HEAD && SAVE[o.pays] && !SAVE_WORDS.test(String(ev.text || ''))) kv = CATCH_WORDS.test(String(ev.text || '')) ? ' catches it.' : ' gets the ball.';
        cands.push([kk + kv, then]);
        cands.push([kk + ' has the ball.', then]);
      } else if (o.actor) {
        var wn = name(o.actor);
        cands.push([wn + ' wins the ball' + byIf(ev, wn) + '.', then]);
        cands.push([wn + ' wins the ball.', then]);
      } else cands.push([U + ' win the ball.', then]);
      return finish(out, cands);
    }
    /* 8. their attack goes on */
    if (nx && nx.who === 'them') {
      out.form = 'they go on'; out.has = 'them'; out.holder = first(nx.holder);
      var th = name(nx.holder), rest;
      /* kmtree5 a12 (stream FIX2; review item 3): THEIR DIVER'S PENALTY. The result sentence is "Craig falls over in your box,
       * and the referee gives a penalty." and the next decision is the penalty (via 'penalty'); this branch said "Craig falls
       * over in your box, but Craig is in your box." Now: "Craig falls over in your box. Penalty to Thistledown." (the taker
       * is the penalty moment's cast). ?fix2off=hdpen (page) or KM_FIX2OFF=hdpen (node): as before */
      if (nx.via === 'penalty' && FIX2_HDPEN) {
        var tk = name(nx.holder || (ctx.nx && ctx.nx.moment && ctx.nx.moment.cast && ctx.nx.moment.cast.foil));
        out.holder = tk || null;
        withDuel(['Penalty to ' + T + '.' + (tk ? ' ' + tk + ' takes it.' : '')], ['Penalty to ' + T + '.'], false);
        return finish(out, cands);
      }
      if (nx.via === 'corner') rest = ['Corner to ' + T + '.'];
      else if (nx.via === 'freekick' || nx.via === 'fkcross') rest = ['Free kick to ' + T + ' near your box.', 'Free kick to ' + T + '.'];
      else if (nx.box && (nx.via === 'cross' || nx.via === 'lowcross')) rest = [th + ' will cross it into your box.', th + ' will cross it.'];
      else if (nx.box && nx.via === 'header') rest = [th + ' heads it at your goal.'];
      else if (nx.box && nx.via === 'alone') rest = [th + ' is alone in front of your goal.', th + ' is alone.'];
      else if (nx.box && SAVE[o.pays] && kAct && (!X_HEAD || SAVE_WORDS.test(String(ev.text || '')))) rest = [th + ' has the loose ball in your box.', th + ' has the loose ball.'];   /* a6 (stream X): a loose ball only after a save the sentence has */
      else if (nx.box) rest = [th + ' is in your box.'];
      else rest = [th + ' has it ' + (AT[nx.zone] || 'in ' + nx.zone) + '.', th + ' has it ' + (AT_SHORT[nx.zone] || AT[nx.zone] || 'in ' + nx.zone) + '.'];
      if (nx.via === 'corner' || nx.via === 'freekick' || nx.via === 'fkcross') out.holder = null;   // a set piece: the text names nobody on the ball yet
      if (kAct && SAVE[o.pays] && (!X_HEAD || SAVE_WORDS.test(String(ev.text || '')))) {   /* a6 (stream X): only when the sentence has the save */
        var ks = name(o.actor);
        cands.push([ks + ' saves.', rest[0]]);
        cands.push([ks + ' saves.', rest[rest.length - 1]]);
      }
      if (ev.booked && x.effect !== 'break' && o.actor && o.foil) {
        cands.push([name(o.actor) + ' fouls ' + name(o.foil) + ' (yellow card).', rest[0]]);
        cands.push([name(o.actor) + ' fouls ' + name(o.foil) + '.', rest[rest.length - 1]]);
      }
      withDuel([rest[0]], [rest[rest.length - 1]], !!th && rest[0].indexOf(th + ' ') === 0 && rest[rest.length - 1].indexOf(th + ' ') === 0);   /* a11 (helper Q): "..., but <their man> has it" */
      return finish(out, cands);
    }
    /* 9. their attack ends */
    out.form = 'they end';
    var o2 = over('them');
    if (kAct && SAVE[o.pays] && (end2 === 'stop' || end2 === 'held') && (!X_HEAD || SAVE_WORDS.test(String(ev.text || '')))) {   /* a6 (stream X) */
      var kz = name(o.actor);
      cands.push([kz + (end2 === 'held' ? ' saves and holds it.' : ' saves.'), o2[0]]);
      cands.push([kz + ' saves.', o2[1]]);
      return finish(out, cands);
    }
    if (kAct && end2 === 'held' && (!X_HEAD || CATCH_WORDS.test(String(ev.text || '')) || !SAVE[o.pays])) {   /* a6 (stream X): "catches" from the sentence */
      var kc = name(o.actor);
      cands.push([kc + ' catches it.', o2[0]]);
      cands.push([kc + ' catches it.', o2[1]]);
      return finish(out, cands);
    }
    /* their header or shot that your keeper catches after your man lost the duel */
    if (!kAct && end2 === 'held' && yourK) {
      var yk = name(yourK);
      if (du && !(hw && du.band !== 'level')) cands.push([du.short, yk + ' catches it.', o2[0]]);   /* a11 (helper Q): not "just beats" on a half win */
      if (du && !(hw && du.band !== 'level')) cands.push([du.short, yk + ' catches it.', o2[1]]);
      cands.push([yk + ' catches it.', o2[0]]);
    }
    if (end2 === 'foul' && o.actor && o.foil) {
      /* the card comes from the option's data: tcardfree is the one free foul */
      var card = /free$/.test(o.pays || '') ? ' (no card)' : o.pays === 'tcard' || o.pays === 'card' ? ' (yellow card)' : '';
      cands.push([name(o.actor) + ' fouls ' + name(o.foil) + card + '.', o2[0]]);
      cands.push([name(o.actor) + ' fouls ' + name(o.foil) + '.', o2[1]]);
      return finish(out, cands);
    }
    if (END_THEM[end2] && !du) { cands.push([END_THEM[end2], o2[0]]); cands.push([END_THEM[end2], o2[1]]); return finish(out, cands); }
    withDuel([o2[0]], [o2[1]]);
    return finish(out, cands);
  }

  function finish(out, cands) {
    var best = null;
    for (var i = 0; i < cands.length; i++) {
      var t = cands[i].join(' ');
      if (wordCount(t) <= (cands[i].cap || CAP)) { best = cands[i]; break; }   /* (a11, helper Q: a half win's own candidates may run to HARD words) */
    }
    if (!best) best = cands.slice().sort(function (a, b) { return wordCount(a.join(' ')) - wordCount(b.join(' ')); })[0] || ['The play is over.'];
    out.parts = best;
    out.text = best.join(' ');
    out.words = wordCount(out.text);
    /* only the names actually in the chosen sentence */
    out.names = out.names.filter(function (n) { return out.text.indexOf(n) >= 0; });
    if (out.holder && out.text.indexOf(out.holder) < 0) out.holder = null;
    return out;
  }

  var API = { FIX3_HD: FIX3_HD, X_HEAD: X_HEAD, Q11_HALF: Q11_HALF, halfWin: halfWin, gotOf: gotOf, headline: headline, holdMs: holdMs, wordCount: wordCount, duel: duel, outcomeOf: outcomeOf, PACE: PACE, CAP: CAP, HARD: HARD };
  root.KMHeadline = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
