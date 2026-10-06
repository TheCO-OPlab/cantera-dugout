/* ob1: THE LEAN CARD (piece 3 of the first-time study), behind ?cards=lean.
 *
 * A first-timer reads one line and three icons. The card is:
 *   - one line: what your player does ("Rodri runs at Lisandro to get into
 *     the box"), with his flag;
 *   - the results as icons with their chances, in the order of the roll:
 *     clean win, half win, loss. The arrows point UP the screen for toward
 *     their goal, the way the pitch is drawn;
 *   - a thin bar under them, the same chances as lengths: green good for
 *     you, grey neither, red bad.
 * Details (each result in a few words, the two numbers in the duel, the
 * edges) open on hover with a mouse, or on the first tap on a phone (the
 * second tap plays the card).
 *
 * KMObLean.card(o, i, h) returns the markup for one option; h gives the
 * page's helpers: nm (names with flags), nmReset, icon(id), pct(list of
 * p) -> whole percents adding to 100, tone(icon id) -> 'g'|'n'|'r'.
 * KMObLean.wire(box, choose) makes the hover and tap behaviour. */
(function (root) {
  'use strict';
  /* col: the severity scale lives in icons.js */
  function IC() { return root.KMIcons || null; }
  function sevRank(sv) { var L = IC() ? IC().SEVS : []; var i = L.indexOf(sv); return i < 0 ? 2 : i; }
  function first(p) { return String((p && p.name) || '').split(' ')[0]; }
  var ATTR = { technique: 'Technique', passing: 'Passing', pace: 'Pace', physical: 'Physical', finishing: 'Finishing',
    defending: 'Defending', intelligence: 'Intelligence', reflexes: 'Reflexes', command: 'Command', distribution: 'Distribution', heading: 'Heading' };
  function attrName(a) { return ATTR[a] || (a ? String(a).charAt(0).toUpperCase() + String(a).slice(1) : ''); }

  /* kmtree5 a11 (stream PAGE, 2026-10-05; Rodrigo's playtest and Eduardo's ruling I.2 of 10-03, "words plus icons"):
   * THE OUTCOME LABELS. Rodrigo could not tell the double arrow from the single one ("the distinction between the two
   * greens is too subtle"). Each icon on the lean card keeps its shape and colour and gets a short plain label beside
   * it, from the display kind (icons.js kindOf) and whose ball it is; a few kinds read the result's short line to say
   * which of their cases it is (a save or a miss is "No goal", not "Play stops"). The wording is a decision for
   * Eduardo (DECISIONS-PAGE.md item 1); the set was written from page_kinds.js (every offered outcome of 120 matches).
   * ?pgoff=labels (or all): no labels, a11 as it was. */
  var LAB_YOU = { goal: 'Goal', fwd: 'Forward', fwdPlus: 'Better chance', stay: 'Keep the ball', backKeep: 'Back, still yours',
    lost: 'Lose the ball', counter: 'Lose the ball', conceded: 'They score', won: 'Win the ball', closer: 'They get closer', inbox: 'Into your box' };
  var LAB_THEM = { won: 'Stop them', fwd: 'Win the ball', fwdPlus: 'Win the ball', closer: 'They get closer', inbox: 'Into your box', conceded: 'They score',
    stay: 'They keep it', goal: 'Goal', lost: 'Stop them', counter: 'Stop them', backKeep: 'They keep it' };
  /* kmtree5 a12 (stream FIX2, Monday 2026-10-05; review/monday-rev1 item 3): A LABEL NEVER CONTRADICTS WHAT HAPPENS.
   *   pen    a result their Diver turns into a penalty (options.js lineOps 'penalty': x.via, the sentence "... the referee gives
   *          a penalty") is "Penalty to them", drawn with the into-your-box icon; it said "Saved, they keep it" (the short line
   *          the engine leaves as it was) on keeper and marking cards alike
   *   sense  with 6th sense due (o.sense: match.js forceTheirs gives them the ball after this decision unless it is a goal), a
   *          card of yours does not promise to keep the ball ("Better chance" becomes "They take it") and a card on their
   *          attack does not promise to win it ("Win the ball" becomes "They keep it")
   *   forced the one-line result after 6th sense took the ball (ev.forced) says so ("They take the ball"), not "Better chance"
   * ?fix2off=labels (or all): the labels as PAGE and PAGE2 left them. */
  /* kmtree5 a12 (stream PAGE7, dice; review/monday-rev2 item 4: "Oyarzabal's 18 against Chris's 16: Attack ends", 29 of 367
   * one-line results had your number higher and a bad result, 8 more a tie, and the win-by rule was never on screen): THE
   * ONE-LINE RESULT SAYS WHY WHEN IT READS BACKWARDS. The words that follow the label (play.html bannerHTML), from the
   * result's own band and dice; '' when the line reads the way it looks:
   *   half win (your number higher or level) and a bad result: "not enough (a clean win needs 4 more)"; the margin is the
   *     engine's own for this duel (ev.dice.goodBy, ENG7's field, or a build's goodBy) else resolve.js GOOD_BY
   *   a build moved the band ("a clean win, which your build counts as a half win"): that sentence
   *   a clean win and a bad result: "a clean win, and this card can do no better"
   *   their number higher and a result that is not bad: "Ross was higher, but this card cannot go worse than this"
   *   6th sense took the ball: "6th sense"
   * sev: the step the line is drawn in (icons.js sevOf of the drawn kind). ?p7off=dice: no words added. */
  var P7BAD = { lost: 1, danger: 1, conceded: 1, ground: 1 };
  /* kmtree5 a12 (stream WIRE8, Monday 2026-10-05 night): the page reads ENG7's fields. ?w8off=a,b (or all) gives each part as
   * PAGE7 left it:  dice (ev.dice.goodBy / rawBand / certain in the dice words; off: the fixed 4 of resolve.js GOOD_BY and
   * ev.band),  midback (the drop back's won rows: "Midfield back, +3" in the neutral grey; off: the amber "They get closer"),
   *  ot (the overtime break's line is st.cupOT.gainText; off: PAGE7's line from st.cupOT.gain),  sub (a substitution's dice
   * box says it always happens, ev.noRoll; off: "Nothing to roll: this one always happens"). */
  function W8ON(k) {
    try { var m = /[?&]w8off=([\w,]*)/.exec((root.location && root.location.search) || ''); if (!m) return true; var off = m[1].split(','); return off.indexOf(k) < 0 && off.indexOf('all') < 0; } catch (e) { return true; }
  }
  var W8DICE = W8ON('dice'), W8MID = W8ON('midback');
  /* kmtree5 a12 (stream PAGE8, Monday 2026-10-05 night; review/monday-rev3): ?pg8off=a,b (or all) gives each part as PAGE7 and WIRE8
   * left it:  drop (the drop back's one-line result says "Midfield back, +N", play.html), dice (the reason's arithmetic, below),
   *  chips (a repeated label on a card is not dropped, below), fk (a free kick to you is not the pause icon, below), sheet, ot, pens,
   *  graph, tiles, small, long (play.html and ob-end.js). */
  function P8ON(k) {
    try { var m = /[?&]pg8off=([\w,]*)/.exec((root.location && root.location.search) || ''); if (!m) return true; var off = m[1].split(','); return off.indexOf(k) < 0 && off.indexOf('all') < 0; } catch (e) { return true; }
  }
  /* a12 CHK9 (ENG8's asks): ?c9off=own,best,fixed,grey,menu (or all); node KM_C9_OFF. See play.html where C9 is described. Here: own, best (menu is phrases.js's). */
  function C9ON(k) {
    try {
      var off = []; var m = /[?&]c9off=([\w,]*)/.exec((root.location && root.location.search) || ''); if (m) off = m[1].split(',');
      if (typeof process !== 'undefined' && process.env && process.env.KM_C9_OFF) off = off.concat(String(process.env.KM_C9_OFF).split(','));
      return off.indexOf(k) < 0 && off.indexOf('all') < 0;
    } catch (e) { return true; }
  }
  var C9OWN = C9ON('own'), C9BEST = C9ON('best');
  var P8DICE = P8ON('dice'), P8CHIPS = P8ON('chips'), P8FK = P8ON('fk');
  function p8Poss(n) { n = String(n || ''); return /s$/i.test(n) ? n + "'" : n + "'s"; }
  function p7Need(d) {
    var n = W8DICE && d && (d.goodBy || d.needBy || d.need || d.cleanBy);
    if (typeof n === 'number' && n > 0) return n;
    var R = root.KMResolve; return (R && R.GOOD_BY) || 4;
  }
  function p7DiceWhy(ev, sev, foil) {
    if (!P7DICE || !ev || !ev.dice) return '';
    var d = ev.dice;
    if (d.checks && d.checks.length > 1) return '';   /* (a slalom lists its take-ons) */
    if (typeof d.diff !== 'number') return '';
    var bad = !!P7BAD[sev];
    if (ev.forced) return '6th sense';
    var backwards = (d.diff >= 0 && bad) || (d.diff < 0 && !bad);
    if (!backwards) return '';
    if (C9BEST && d.r12Best && d.margin && !bad) return String(d.margin);   /* a12 CHK9 (ENG8 bestroll): a clean win by the best roll, whatever the totals say */
    if (/which your build counts as/.test(String(d.margin || ''))) return String(d.margin);
    var band = (W8DICE && d.rawBand) || ev.band || (d.diff >= p7Need(d) ? 'good' : d.diff >= 0 ? 'mixed' : 'bad');
    if (W8DICE && d.certain && d.diff >= 0) return 'this card always ends this way, whatever the dice';
    if (d.diff >= 0 && band === 'good') return 'a clean win, and this card can do no better';
    /* a12 (stream PAGE8, dice; review/monday-rev3 item 3): "a clean win needs 4 more" printed the margin as if it were the shortfall
     * (21 against 19 is 2 short, not 4), and said it where a clean win gives the very same result (the engine's dice.halfSame).
     * Now: the number a clean win needs, and by how much more than the other man's. */
    if (P8DICE && d.diff >= 0 && d.halfSame) return 'a clean win would give the same result';
    if (P8DICE && d.diff >= 0 && typeof d.themTotal === 'number') {
      var gb8 = p7Need(d);
      return (d.diff === 0 ? 'level is ' : '') + 'not enough (a clean win needs ' + gb8 + ' more than ' + (foil ? (F11POSS ? String(foil).split(' ')[0] + "'s" : p8Poss(String(foil).split(' ')[0])) : 'their') + ' ' + d.themTotal + ', which is ' + (d.themTotal + gb8) + ')';
    }
    if (d.diff >= 0) return (d.diff === 0 ? 'level is ' : '') + 'not enough (a clean win needs ' + p7Need(d) + ' more)';
    return (foil ? String(foil).split(' ')[0] : 'Their player') + ' was higher, but this card cannot go worse than this';
  }
  function FIX2ON(k) {
    try { var m = /[?&]fix2off=([\w,]*)/.exec((root.location && root.location.search) || ''); if (!m) return true; var off = m[1].split(','); return off.indexOf(k) < 0 && off.indexOf('all') < 0; } catch (e) { return true; }
  }
  var FIX2LAB = FIX2ON('labels'), FIX2DROP = FIX2ON('drop');
  /* kmtree5 a12 (stream FIX11; review/monday-rev4 findings 2, 5, 7): ?fix11off=a,b (or all) gives each part as 686742ff had it.
   *   sense  a drop back's card with 6th sense due says "They keep it" (what the engine does: forceTheirs takes the "+N" away), not "Midfield back, +N"
   *   chips  the words that replace a repeated label on a chip are a whole phrase ("They win it and attack" repeated shows "they take the ball"), never the first four words
   *   poss   "Marcus's 18" in the dice line (a man's name ending in s takes 's); a team's name keeps "Ninefields'" */
  function FIX11ON(k) {
    try { var m = /[?&]fix11off=([\w,]*)/.exec((root.location && root.location.search) || ''); if (!m) return true; var off = m[1].split(','); return off.indexOf(k) < 0 && off.indexOf('all') < 0; } catch (e) { return true; }
  }
  var F11SENSE = FIX11ON('sense'), F11CHIPS = FIX11ON('chips'), F11POSS = FIX11ON('poss');
  /* kmtree5 a12 (stream FIX6): with 6th sense due, a won ball that FIX2 renames "They keep it" (or a result of yours renamed
   * "They take it") no longer carries "+N next" for you: match.js forceTheirs replaces the chain after that decision, so
   * the carried edge is gone (the green "+2" beside "They keep it" promised a bonus that never comes).
   * ?fix6off=edge (or all): the edge drawn as before. */
  function FIX6ON(k) {
    try { var m = /[?&]fix6off=([\w,]*)/.exec((root.location && root.location.search) || ''); if (!m) return true; var off = m[1].split(','); return off.indexOf(k) < 0 && off.indexOf('all') < 0; } catch (e) { return true; }
  }
  var FIX6EDGE = FIX6ON('edge');
  /* kmtree5 a12 (stream PAGE3, Monday 2026-10-05; Eduardo's ruling J5, his words: "While you're attacking, a pause, which
   * means your play ends, is a green outcome with a gray icon. It is extremely confusing. Sometimes I pick it thinking it's
   * a certain good outcome, but it's a certain bad outcome."): A GOOD-LOOKING OUTCOME IS NEVER A BAD ONE.
   *   pause   on YOUR attack, a result that ends the attack with the ball not yours (a shot wide or saved, the ball out of
   *           play, a blocked shot: the engine's effect 'nothing' drawn with the pause icon) is its own display kind 'ends':
   *           the pause icon in the "You lose the ball" colour, the label "Attack ends". Before, it was the grey "Neither"
   *           step labelled "No goal" or "Play stops", and a card whose only result it was got a full GREEN bar ("Certain").
   *           A free kick to you (the attack goes on) and a substitution keep their old look.
   *   pushed  on THEIR attack, "Pushed back: Messi at the edge of your box" (they keep the ball, further from your goal; the
   *           engine draws it with the forward arrow) was the green arrow labelled "Win the ball". It is now 'pushed': the
   *           ball-on-a-line icon in grey, "They keep it, pushed back". (Eduardo's J5: on defence a single arrow means you win
   *           the ball and counter, so an arrow there must never be their ball.)
   * Both are registered with icons.js's tables (kinds, severity, words, paths) from here, so every place that colours or
   * draws a result through KMIcons.kindOf (the cards, the one-line result, the result box, the pitch arrows, the key, full
   * time) follows. ?p3off=pause (or all): as before. p3_check.js checks it over many matches. */
  function P3ON(k) {
    try { var m = /[?&]p3off=([\w,]*)/.exec((root.location && root.location.search) || ''); if (!m) return true; var off = m[1].split(','); return off.indexOf(k) < 0 && off.indexOf('all') < 0; } catch (e) { return true; }
  }
  var P3PAUSE = P3ON('pause');
  /* kmtree5 a12 (stream PAGE7, Monday 2026-10-05 evening; review/monday-rev2): ?p7off=a,b (or all) gives each part as before.
   *   ends   J5 on the LAST decision of an attack: a result that keeps the ball but ends the attack (options.js end 'kept' or
   *          'clock' with no zone: "Olmo has it, attack over", "The clock runs down"; the engine's iconRule "end: kept") was
   *          the grey ball-on-a-line "Keep it" with a full GREEN bar ("Keep it Certain"), then the result said "Spain keep
   *          the ball, but the attack is over" (5 of the 14 last-decision menus of the review). It is now PAGE3's 'ends':
   *          the orange pause icon, "Attack ends", the bar in the lose-the-ball colour
   *   dice   the one-line result says why when it reads backwards (p7DiceWhy)
   *   sense  FIX6's leftover: with 6th sense due, "Play ends" on their attack is not what happens (match.js forceTheirs moves
   *          their attack to the edge of your box): it says "They keep it", as FIX2 made the won-ball labels say
   *   words  (play.html) repetition cut at a decision */
  function P7ON(k) {
    try { var m = /[?&]p7off=([\w,]*)/.exec((root.location && root.location.search) || ''); if (!m) return true; var off = m[1].split(','); return off.indexOf(k) < 0 && off.indexOf('all') < 0; } catch (e) { return true; }
  }
  var P7ENDS = P7ON('ends'), P7DICE = P7ON('dice'), P7SENSE = P7ON('sense');
  function p7KeptEnd(kind, who, x) {
    return P7ENDS && who === 'you' && kind === 'stay' && !!x && x.effect === 'nothing' && !x.rebound && x.mode !== 'freekick' && /^end: (kept|clock)$/.test(String(x.iconRule || ''));
  }
  function p3Kind(kind, who, x) {
    if (!x) return kind;
    if (W8MID && who === 'them' && kind === 'closer' && typeof x.midBack === 'number' && x.midBack > 0) return 'midback';   /* a12 (stream WIRE8, midback) */
    if (p7KeptEnd(kind, who, x)) return 'ends';   /* a12 (stream PAGE7, ends) */
    if (P8FK && who === 'you' && kind === 'dead' && (x.mode === 'freekick' || /^free kick to you/i.test(String(x.shortBase || x.short || '')))) return 'fkick';   /* a12 (stream PAGE8, fk): the attack goes on, so not the pause ("Free kick to them" after your own foul is the end of your attack and stays) */
    if (!P3PAUSE) return kind;
    if (who === 'you' && kind === 'dead' && x.effect !== 'ground' && x.effect !== 'rest' && x.kind !== 'ground' && x.kind !== 'rest' && x.mode !== 'freekick') return 'ends';
    if (who === 'them' && (kind === 'fwd' || kind === 'fwdPlus') && (/their attack moves/.test(String(x.iconRule || '')) || /^Pushed back/.test(String(x.shortBase || x.short || '')))) return 'pushed';
    return kind;
  }
  (function p3Register() {
    var I = IC();
    if ((!P3PAUSE && !P7ENDS) || !I || I.__p3) return;
    I.__p3 = true;
    I.SEV.ends = 'lost'; I.ENGINE.ends = 'dead'; I.PATH.ends = I.PATH.dead;
    I.KWORDS.ends = ['Attack ends', 'your attack is over and the ball is theirs: a shot wide or saved, a block, the ball out of play'];
    I.SEV.pushed = 'keep'; I.ENGINE.pushed = 'stay'; I.PATH.pushed = I.PATH.stay;
    I.KWORDS.pushed = ['Pushed back', 'they keep the ball, further from your goal'];
    var at = I.KINDS.indexOf('lost'); I.KINDS.splice(at < 0 ? I.KINDS.length : at, 0, 'ends');
    var as = I.KINDS.indexOf('backKeep'); I.KINDS.splice(as < 0 ? I.KINDS.length : as + 1, 0, 'pushed');
    var k0 = I.kindOf;
    I.kindOf = function (icon, who, x) { return p3Kind(k0(icon, who, x), who, x); };
    I.kindOf.p3 = true;
  })();
  /* a12 (stream PAGE8, fk): a free kick to you keeps the attack going: the neutral grey step with the ball icon, not the pause */
  (function p8Register() {
    var I = IC();
    if (!P8FK || !I || I.__p8) return;
    I.__p8 = true;
    I.SEV.fkick = 'keep'; I.ENGINE.fkick = 'stay'; I.PATH.fkick = I.PATH.stay;
    I.KWORDS.fkick = ['Free kick', 'the play restarts with a free kick for you and your attack goes on'];
    var af = I.KINDS.indexOf('stay'); I.KINDS.splice(af < 0 ? I.KINDS.length : af + 1, 0, 'fkick');
    if (!I.kindOf.p3) { var k2 = I.kindOf; I.kindOf = function (icon, who, x) { return p3Kind(k2(icon, who, x), who, x); }; }
  })();
  /* a12 (stream WIRE8, midback): the drop back's won rows, ENG7's x.midBack: the neutral grey step with the closer arrow */
  (function w8Register() {
    var I = IC();
    if (!W8MID || !I || I.__w8) return;
    I.__w8 = true;
    I.SEV.midback = 'keep'; I.ENGINE.midback = 'back'; I.PATH.midback = I.PATH.closer;
    I.KWORDS.midback = ['Midfield back', 'your midfield is back in front of their man (a bonus for your next card)'];
    var ac = I.KINDS.indexOf('closer'); I.KINDS.splice(ac < 0 ? I.KINDS.length : ac, 0, 'midback');
    if (!I.kindOf.p3) { var k1 = I.kindOf; I.kindOf = function (icon, who, x) { return p3Kind(k1(icon, who, x), who, x); }; }
  })();
  /* kmtree5 a12 (stream PAGE5, Monday 2026-10-05; his answers of 10-05): ?p5off=a,b (or all) gives each part as before.
   *   short   PAGE-6: "Keep it" and "Lose it" (were "Keep the ball", "Lose the ball")
   *   tutwhy  PAGE-4: the tutorial's pickable bad card (play.html o.p5TutWhy) shows why it was a bad pick in its details
   *   inbox   PAGE-3: "into your box" (the danger step) drawn between orange and red instead of purple: the palette's
   *           danger entries are replaced here and the page's colour tokens written again (icons.js tokensCSS), so the
   *           cards, the one-line result, the key, the pitch arrows and full time all follow */
  function P5ON(k) {
    try { var m = /[?&]p5off=([\w,]*)/.exec((root.location && root.location.search) || ''); if (!m) return true; var off = m[1].split(','); return off.indexOf(k) < 0 && off.indexOf('all') < 0; } catch (e) { return true; }
  }
  var P5SHORT = P5ON('short'), P5TUT = P5ON('tutwhy'), P5INBOX = P5ON('inbox');
  var P5DANGER = { light: { card: '#c8380f', ink: '#ad2f0c' }, dark: { card: '#c7432a', ink: '#ff7f5c' }, pitch: '#ff7448' };
  (function p5Inbox() {
    var I = IC();
    if (!P5INBOX || !I || !I.PALETTE || I.__p5) return;
    I.__p5 = true;
    var P = I.PALETTE;
    P.light.card.danger = P5DANGER.light.card; P.light.ink.danger = P5DANGER.light.ink;
    P.dark.card.danger = P5DANGER.dark.card; P.dark.ink.danger = P5DANGER.dark.ink;
    P.pitch.danger = P5DANGER.pitch;
    try {
      var st = root.document && root.document.getElementById('sv-tokens');
      if (st && I.tokensCSS) st.textContent = I.tokensCSS();
      if (root.document && root.document.documentElement) root.document.documentElement.classList.add('p5-inbox');
    } catch (e) { }
  })();
  function isPen(x) { return !!x && (x.via === 'penalty' || /referee gives a penalty/.test(String(x.text || ''))); }
  var SENSE_YOU = { 'Better chance': 1, 'Forward': 1, 'Keep the ball': 1, 'Keep it': 1, 'Back, still yours': 1, 'Free kick': 1, 'Corner': 1, 'Header at goal': 1, 'Saved, you keep it': 1 };
  function labelOf(kind, who, x, o) {
    if (FIX2LAB && isPen(x)) return who === 'them' ? 'Penalty to them' : 'Penalty';
    if (FIX2LAB && x && x.forced) return who === 'them' ? 'They keep the ball' : 'They take the ball';
    var b = labelOf0(kind, who, x);
    if (F11SENSE && o && o.sense && who === 'them' && x && typeof x.midBack === 'number' && /^Midfield back/.test(b)) return 'They keep it';   /* a12 FIX11 */
    if (FIX2LAB && o && o.sense && x && x.effect !== 'goal' && x.effect !== 'concede') {
      if (who === 'you' && SENSE_YOU[b]) return 'They take it';
      if (who === 'them' && (b === 'Win the ball' || b === 'Stop them' || /^Win it and attack/.test(b))) return 'They keep it';   /* (a12 FIX3: + its counter labels) */
      if (P7SENSE && who === 'them' && b === 'Play ends') return 'They keep it';   /* a12 (stream PAGE7, sense: forceTheirs) */
    }
    /* a12 CHK9 (ENG8 kball, review finding 4): your keeper's ball is not won: "Keep it and attack, +2", and a kick clear is named by its row's first words */
    if (C9OWN && x && x.ownBall && who === 'them' && !(o && o.sense)) {
      if (/^Win it and attack/.test(b)) return b.replace(/^Win it and attack/, 'Keep it and attack');
      if (b === 'Stop them' || b === 'Win the ball') { var kw = /^([^:.,]+)/.exec(String(x.shortBase || x.short || '')); return kw && kw[1].split(' ').length <= 3 ? kw[1] : 'Get rid of it'; }
    }
    return b;
  }
  /* kmtree5 a12 (stream FIX3; GAME3a's defending outcomes, Eduardo's J5): THE THREE WAYS A DEFENDING DUEL ENDS, IN WORDS.
   * On their attack a won ball starts your attack the minute after (the arrows, green): the double arrow (a clean win, an
   * edge to you) is "Win it and attack, +2" (the edge's own number), the single arrow (a half win) "Win it and attack";
   * both said "Win the ball", so the two greens Rodrigo could not tell apart had the same words too. The pause (the play
   * ends, nobody gains: out of play, wide, a save, a foul, they go back; grey) is "Play ends" ("No goal", "Free kick",
   * "Play stops", "They go back" before); a corner or a free kick their attack goes on from (x.via) keeps its name.
   * ("counter" is not used: reviews/text-audit.md item 37.) ?fix3off=labels (or all): the labels as PAGE3 left them. */
  function FIX3ON(k) {
    try { var m = /[?&]fix3off=([\w,]*)/.exec((root.location && root.location.search) || ''); if (!m) return true; var off = m[1].split(','); return off.indexOf(k) < 0 && off.indexOf('all') < 0; } catch (e) { return true; }
  }
  var FIX3LAB = FIX3ON('labels');
  function fix3Label(kind, who, x) {
    if (!FIX3LAB || who !== 'them' || !x) return null;
    if (kind === 'fwdPlus') { var n = /\+(\d+) to you next/.exec(String(x.edgeShort || x.short || '')); return 'Win it and attack' + (n ? ', +' + n[1] : ''); }
    if (kind === 'fwd') return 'Win it and attack';
    if (kind === 'dead' && !x.via && !x.goesOn) return 'Play ends';   /* (x.goesOn: the event of a corner or free kick their attack goes on from; the event has no via) */
    return null;
  }
  function labelOf0(kind, who, x) {
    var b0 = labelOf00(kind, who, x);
    if (P5SHORT && b0 === 'Keep the ball') return 'Keep it';   /* a12 (stream PAGE5, PAGE-6) */
    if (P5SHORT && b0 === 'Lose the ball') return 'Lose it';
    return b0;
  }
  function labelOf00(kind, who, x) {
    var t = String((x && (x.shortBase || x.short || x.text)) || '');
    if (kind === 'ends') return 'Attack ends';   /* a12 (stream PAGE3, J5) */
    if (kind === 'fkick') return 'Free kick';   /* a12 (stream PAGE8, fk) */
    if (kind === 'pushed') return 'They keep it, pushed back';
    if (kind === 'midback') return 'Midfield back, +' + x.midBack;   /* a12 (stream WIRE8, midback) */
    var f3 = fix3Label(kind, who, x); if (f3) return f3;   /* a12 (stream FIX3) */
    if (kind === 'dead') {
      if (/saves|goes wide|the bar|over the bar|blocked|misses/i.test(t)) return 'No goal';
      if (/^free kick/i.test(t)) return 'Free kick';
      if (/^corner/i.test(t)) return 'Corner';
      if (/go back/i.test(t)) return 'They go back';
      return 'Play stops';
    }
    if (kind === 'stay' && /^saved,/i.test(t)) return who === 'them' ? 'Saved, they keep it' : 'Saved, you keep it';
    if (kind === 'stay' && /heads at goal/i.test(t)) return 'Header at goal';
    return (who === 'them' ? LAB_THEM : LAB_YOU)[kind] || '';
  }
  function PGON(k) {
    try { var m = /[?&]pgoff=([\w,]*)/.exec((root.location && root.location.search) || ''); if (!m) return true; var off = m[1].split(','); return off.indexOf(k) < 0 && off.indexOf('all') < 0; } catch (e) { return true; }
  }
  var LABELS = PGON('labels');
  /* kmtree5 a11 (stream PAGE2, 2026-10-05): THE WORDS AT LATER DECISIONS. After PAGE's labels a later decision on the
   * phone reached 159 words (limit 150, laycheck E3's count). PAGE2's cuts take out repetition only, each turned off by
   * name with ?pg2off=a,b (or all), which gives the page as PAGE left it:
   *   grey   a card greyed because ANOTHER card is as good or better says "Another card ..." on its face instead of
   *          quoting that card's whole action line, which is on screen just above or below (its details keep the name)
   *   greygap  a card greyed because the other man is too strong says "Cannot come off: Vince is 6 stronger than Olmo."
   *          on its face, without ", more than the dice make up" ("cannot come off" already says it; its details keep it)
   *   same   a label said once per card: a second chip of the same card with the same label shows its icon and chance
   *          only ("Keep the ball 72%  [icon] 28%"); its tooltip still says that result in words
   *   greychips  a greyed card shows no chips (an edge or a piece on a card that cannot be played changes nothing);
   *          its details still list every part
   *   (play.html and mobile.css read the other names: bvrep, gshort, capcut) */
  function PG2ON(k) {
    try { var m = /[?&]pg2off=([\w,]*)/.exec((root.location && root.location.search) || ''); if (!m) return true; var off = m[1].split(','); return off.indexOf(k) < 0 && off.indexOf('all') < 0; } catch (e) { return true; }
  }
  var PG2GREY = PG2ON('grey'), PG2SAME = PG2ON('same'), PG2GCHIPS = PG2ON('greychips'), PG2GAP = PG2ON('greygap');
  var PG2BRK = (function () { try { return (/[?&]pg2brk=(\w+)/.exec((root.location && root.location.search) || '') || [])[1] || ''; } catch (e) { return ''; } })();   /* the breaks of PAGE2's checks */
  function faceGrey(o) {
    var t = greyText(o);
    if (!t) return t;
    if (PG2GAP) t = String(t).replace(/^(Cannot come off: .+ stronger than [^,]+), more than the dice make up\.$/, '$1.');
    if (!PG2GREY) return t;
    return String(t).replace(/^"[^"]+" (does at least as well on every count|comes off far more often and is no riskier)/, 'Another card $1');
  }

  /* results that read the same in a few words are one entry, chances added */
  function rows(o, h) {
    var list = o.outcomes || [];
    var shown = h.pct(list.map(function (x) { return x.p; }));
    var out = [];
    list.forEach(function (x, k) {
      /* col: the display kind (the engine icon with its side) and its severity */
      var kind = IC() ? IC().kindOf(x.icon, h.who, x) : x.icon, sev = IC() ? IC().sevOf(kind) : null;
      var pen = FIX2LAB && isPen(x);   /* a12 (stream FIX2): a Diver penalty: the into-your-box icon and its own short line */
      if (pen) { kind = 'inbox'; sev = IC() ? IC().sevOf(kind) : null; }
      var key = (kind || '') + '|' + (pen ? 'pen' : (x.short || x.text));
      if (F11SENSE && o && o.sense && h.who === 'them' && typeof x.midBack === 'number' && x.midBack > 0) key = 'f11sense|keep';   /* a12 FIX11 (sense): every won drop back row is one "They keep it" row */
      var same = out.filter(function (r) { return r.key === key; })[0];
      if (same) { same.pct += shown[k]; if (x.effect === 'break' || x.effect === 'concede') same.bad = true; return; }
      /* the edge a result carries, as a number: "+2" (to you next) or "-2" (to them) */
      var edge = null, em = /([+-]\d+) to (you|them) next/.exec(x.edgeShort || x.short || '');
      if (em) edge = { n: em[1], them: em[2] === 'them' };
      var lab0 = labelOf(kind, h.who, x, o);
      if (FIX6EDGE && edge && !edge.them && FIX2LAB && o && o.sense && (lab0 === 'They keep it' || lab0 === 'They take it')) edge = null;   /* a12 FIX6 */
      out.push({ key: key, icon: x.icon, kind: kind, sev: sev, tone: h.tone(x.icon), short: pen ? 'A penalty to them' : x.short || x.shortBase || x.text, band: x.band, pct: shown[k], edge: edge,
        lab: lab0,   /* a11 (stream PAGE): the outcome label; a12 (FIX2): with the card, for 6th sense */
        bad: x.effect === 'break' || x.effect === 'concede' });   // m6: a result that loses it (the risk line's colour)
    });
    return out;
  }

  /* a12 (stream PAGE8, chips; review/monday-rev3 item 14): a second chip with the same label (PAGE2's "same") showed a number and nothing
   * else ("Lose it 39%  3%": the ball running through to their keeper, then the real turnover). It now says its own result in the
   * first four words of the result's line, so no chip is a number alone. */
  /* a12 FIX11 (chips; review/monday-rev4 finding 5): the first four words cut "They win it and attack" to "They win it and" and "You win it: your ball
   * in midfield" to "You win it: your". Now the first clause that is not the label itself, at most 6 words, cut at a whole phrase (before and, to, in, at ...);
   * a clause that cannot be cut that way gives "Another result". */
  function f11Alt(r) {
    var raw = String(r.short || '').replace(/\s+/g, ' ').trim().replace(/^[,\s]*(then )?/i, ''), lab = String(r.lab || '').toLowerCase().replace(/[.,;:\s]+$/, '');
    var parts = raw.split(/\s*(?:[:;,.]| then )\s*/).filter(function (q) { return q && !/^[+\-\d]/.test(q); }), pick = null;
    for (var i = 0; i < parts.length; i++) { var q = parts[i].replace(/[.,;:\s]+$/, ''); if (q.toLowerCase() !== lab && lab.indexOf(q.toLowerCase()) !== 0) { pick = q; break; } }
    if (!pick) return 'Another result';
    var w = pick.split(' ');
    if (w.length > 6) {
      var cutAt = -1;
      for (var k = 5; k >= 2; k--) if (/^(and|to|in|at|into|on|from|with|but|for|toward|towards|across|past)$/i.test(w[k])) { cutAt = k; break; }
      if (cutAt < 0) return 'Another result';
      w = w.slice(0, cutAt);
    }
    return w.join(' ');
  }
  function p8Alt(r) {
    if (F11CHIPS) return f11Alt(r).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    var t = String(r.short || '').replace(/[.,;:\s]+$/, '').replace(/^[,\s]*(then )?/i, '').split(/\s+/).slice(0, 4).join(' ');
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function card(o, i, h) {
    h.nmReset();
    var rs = rows(o, h);
    /* m6 (designer ruling 2026-09-26): a risky starred card is live and says
     * so: its losing chances in the page's warning colour and one line */
    var risky = !!(o.riskStar && !o.disabled);
    var labSeen = {};   /* a11 (stream PAGE2, same): the labels this card has said */
    var chips = rs.map(function (r) {
      var lab = LABELS && r.lab ? (PG2SAME && labSeen[r.lab] ? (P8CHIPS ? p8Alt(r) : '') : r.lab) : ''; if (r.lab) labSeen[r.lab] = 1;
      /* col: coloured by severity (sv-*), the icon by display kind */
      var csev = o.rattled ? (o.rattledSev || 'conceded') : r.sev;   /* a11 G11: a rattled card is drawn in the loss colour */
      return '<span class="lo sv-' + csev + (risky && r.bad ? ' risk' : '') + '" data-sev="' + csev + '" title="' + String(r.short).replace(/"/g, '&quot;') + '">' + h.icon(r.kind || r.icon) +
        (lab ? '<span class="llab">' + lab + '</span>' : '') +   /* a11 (stream PAGE): the label beside the icon */
        '<span class="lp">' + (rs.length === 1 ? certainWord(o, r) : r.pct + '%') + '</span>' +
        /* lay1: the edge says what it means, as a tooltip; col: and "next" on the chip */
        (r.edge ? '<sup class="ledge' + (r.edge.them ? ' them' : '') + '" title="Then: ' + (r.edge.them ? 'their' : 'your') + ' player adds ' + String(r.edge.n).replace(/^[+-]/, '') +
          ' to his number in the next duel">' + (r.edge.them ? 'them ' : '') + r.edge.n + '<span class="lnx"> next</span></sup>' : '') + '</span>';   // m6: "next" in its own span (a phone held sideways drops it)
    }).join('');
    /* col: the bar is split by the severity scale, best for you on the left,
     * one segment per step (results on the same step are added) */
    var steps = [];
    rs.forEach(function (r) {
      var s = steps.filter(function (q) { return q.sev === r.sev; })[0];
      if (s) s.pct += r.pct; else steps.push({ sev: r.sev, pct: r.pct });
    });
    steps.sort(function (a, b) { return sevRank(a.sev) - sevRank(b.sev); });
    /* kmtree5 a4 (helper P, note 4): a certain card gets a full bar too: green when its one result is not a loss,
     * the loss colour when it is (a green bar on a certain loss would be false). ?pbreak=nobar: no bar (pgcheck G4) */
    var bar = rs.length > 1 ? '<span class="lbar" aria-hidden="true">' + steps.map(function (r) {
      return '<i class="sv-' + r.sev + '" data-sev="' + r.sev + '" style="flex:' + Math.max(1, r.pct) + ' 1 0"></i>';
    }).join('') + '</span>' : rs.length === 1 && PBRK() !== 'nobar' ? '<span class="lbar full" aria-hidden="true"><i class="sv-' + (o.rattled ? (o.rattledSev || 'conceded') : fullSev(rs[0])) + '" data-sev="' + (o.rattled ? (o.rattledSev || 'conceded') : fullSev(rs[0])) + '" data-full="1" style="flex:1 1 0"></i></span>' : '';
    h.nmReset();
    var label = h.nm(o.label);
    return '<div class="optw lean-w" id="optw-' + i + '">' +
      '<button class="opt lean' + (o.disabled ? ' dead' : '') + (o.unlockNote ? ' kw' : '') + (o.rattled ? ' rattled' : '') + (o.sense ? ' sense' : '') + '" data-i="' + i + '"' + (o.disabled ? ' disabled' : '') +   /* a11 (helper Q13): o.sense, "6th sense" fires after this decision */
        ' aria-describedby="ldet-' + i + '">' +
        '<span class="lact">' + (h.pre ? h.pre(o) : '') + (o.unlockNote ? '<span class="lstar" title="Only with this player">&#9733;</span>' : '') + label + (h.chips && !(o.disabled && PG2GCHIPS) ? h.chips(o) : '') + '</span>' +   /* a11 (stream PAGE2): greychips */
        /* lay1: a greyed card's reason is in its details (point at it), not a line on the card */
        (rs.length ? '<span class="louts">' + chips + '</span>' + bar : '') +
        /* kmtree5 a4 (helper P, note 5): every greyed card says why on its face, in one line (phrases.js greyLine) */
        (o.disabled && faceGrey(o) ? '<span class="lwhy0">' + h.nm(faceGrey(o)) + '</span>' : '') +   /* a11 (stream PAGE2): faceGrey */
        (risky ? '<span class="lrisk">' + riskText(o) + '</span>' : '') +
        (o.rattled ? '<span class="lrat">' + (o.rattledLine || 'Rattled: you lose the duel') + '</span>' : '') +
        /* a12 (stream FIX2; review item 2): the drop back's stamina cost on the card's face (match.js dropMark puts it in
         * o.cost; options.js says it only in o.read, which the lean card never draws). ?fix2off=drop: not drawn */
        (FIX2DROP && o.cost && o.cost.drop && o.cost.amount ? '<span class="lcost">Costs your midfield ' + o.cost.amount + ' stamina</span>' : '') +
        (o.sense ? '<span class="lsen" data-tag="' + (o.senseTag || '6th sense') + '">' + (o.senseLine || '6th sense: they take the ball after this') + '</span>' : '') +   /* a11 (helper Q13) */
      '</button>' +
      '<div class="ldet" id="ldet-' + i + '">' + details(o, rs, h) + '</div></div>';
  }

  function PBRK() {
    try { if (typeof process !== 'undefined' && process.env && process.env.P_BREAK) return process.env.P_BREAK; } catch (e) { }
    try { return (/[?&]pbreak=(\w+)/.exec((root.location && root.location.search) || '') || [])[1] || ''; } catch (e) { return ''; }
  }
  function PH() { return root.KMPhrases || null; }
  function greyText(o) { if (PBRK() === 'nogrey') return null; var P = PH(); return P && P.greyLine ? P.greyLine(o) : (o.greyWhy || null); }
  /* a loss: the ball lost or a goal against (or their man into your box); anything else is green */
  function isLoss(r) { return !!r.bad || r.sev === 'lost' || r.sev === 'danger' || r.sev === 'conceded'; }
  function fullSev(r) {
    if (isLoss(r)) return r.sev === 'lost' || r.sev === 'danger' || r.sev === 'conceded' ? r.sev : 'lost';
    return r.sev === 'goal' ? 'goal' : 'good';
  }
  /* note 20: a greyed card is never "Certain": its one row, if played, is what happens every time */
  function certainWord(o, r) { return o.disabled && PBRK() !== 'greycertain' ? 'Every time' : 'Certain'; }
  function riskText(o) { return 'Goes wrong ' + o.riskStar + ' times in ' + (o.riskOutOf || (root.KMResolve && root.KMResolve.OUTOF) || 36) + '.'; }
  function details(o, rs, h) {
    h.nmReset();
    var s = (o.disabled && o.greyWhy ? '<span class="lwhy">' + h.nm(o.greyWhy) + '</span>' : '') +
      (P5TUT && o.pgTut && o.p5TutWhy ? '<span class="lwhy p5tw">A weaker pick: ' + h.nm(String(o.p5TutWhy).replace(/^Greyed:\s*/, '')) + '</span>' : '') +   /* a12 (stream PAGE5, PAGE-4) */ '<span class="ld-rows">' + rs.map(function (r) {
      return '<span class="ld-row sv-' + r.sev + '">' + h.icon(r.kind || r.icon) + '<span class="ld-t">' + h.nm(r.short) + '</span><span class="ld-p">' +
        (rs.length === 1 ? certainWord(o, r).toLowerCase() : r.pct + '%') + '</span></span>';
    }).join('') + '</span>';
    if (o.actor && o.foil && o.mineVal != null && o.themVal != null) {
      h.nmReset();
      /* m6 (text audit item 4): the stat as the full card and the working print it, then the edges and the total,
       * so an edge is never counted twice ("Technique 14, +2 = 16", was "Technique 16" over "+2: ...") */
      var sumOf = function (ms) { return (ms || []).reduce(function (a, m) { return a + (m.n || 0); }, 0); };
      var statTxt = function (attr, val, ms) { var e = sumOf(ms); return attrName(attr) + ' ' + (e ? (val - e) + ', ' + (e > 0 ? '+' : '') + e + ' = ' + val : val); };
      s += '<span class="ld-duel">' + h.nm(first(o.actor) + ' (' + statTxt(o.mineAttr || o.attr, o.mineVal, o.mods) + ') against ' +
        first(o.foil) + ' (' + statTxt(o.themAttr, o.themVal, o.theirMods) + '). Each adds one die.') + '</span>';
    }
    /* cl1: with your build, the pieces say what they do in words (bviz.js), so their number lines are not listed twice */
    var skip = h.bvSkipMod ? function (m) { return h.bvSkipMod(m, o); } : function () { return false; };
    var myMods = (o.mods || []).filter(function (m) { return !skip(m); }), thMods = (o.theirMods || []).filter(function (m) { return !skip(m); });
    if (PG2BRK === 'nob11') { myMods = myMods.filter(function (m) { return !m.b11; }); thMods = thMods.filter(function (m) { return !m.b11; }); }   /* a11 (stream PAGE2): page2_b11.js's break */
    var mods = myMods.concat(thMods);
    if (mods.length) {
      h.nmReset();
      /* m6 (text audit item 5): every edge names whose it is, as the result box's edges line does ("Martínez +3: ...", never an unnamed "+3" that reads as yours) */
      var me = o.actor ? first(o.actor) : null, them = o.foil ? first(o.foil) : null;
      var strip = function (who, t) { t = String(t || ''); return who && t.indexOf(who + ' ') === 0 && !/^\S+ (is|was|has|had) /.test(t) ? t.slice(who.length + 1) : t; };
      var line = function (who, m) { return (who ? who + ' ' : '') + (m.n > 0 ? '+' : '') + m.n + ': ' + strip(who, m.why); };
      s += '<span class="ld-mods">' + myMods.map(function (m) { return h.nm(line(me, m)); }).concat(thMods.map(function (m) { return h.nm(line(them, m)); })).join('<br>') + '</span>';
    } else if (o.bonus && !(o.mods || []).length) {
      s += '<span class="ld-mods">' + h.nm((o.bonus > 0 ? '+' : '') + o.bonus + ': ' + (o.because || 'the safer option')) + '</span>';
    }
    if (o.unlockNote) { h.nmReset(); s += '<span class="ld-unl">&#9733; ' + h.nm(o.unlockNote) + '</span>'; }
    if (h.bvDetails) { h.nmReset(); s += h.bvDetails(o); }  // cl1
    return s;
  }

  function canHover() {
    try { return !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches); } catch (e) { return true; }
  }
  /* mouse: hover opens the details, a click plays the card. Touch: the
   * first tap opens the details and says so, the second tap plays it. */
  function wire(box, choose) {
    var hover = canHover();
    box.classList.toggle('lean-touch', !hover);
    /* one class per selector, so the page's DOM shim can run it too */
    Array.prototype.slice.call(box.querySelectorAll('.lean')).forEach(function (el) {
      var w = (el.closest && el.closest('.lean-w')) || el.parentNode;
      el.onclick = function (e) {
        if (el.disabled || el.classList.contains('dead')) return;
        if (!hover && !w.classList.contains('open')) {
          Array.prototype.slice.call(box.querySelectorAll('.lean-w')).forEach(function (x) { x.classList.remove('open'); });
          w.classList.add('open');
          if (e && e.stopPropagation) e.stopPropagation();
          return;
        }
        choose(el, e);
      };
    });
  }

  var API = { C9ON: C9ON, P8ON: P8ON, p8Poss: p8Poss, W8ON: W8ON, P7ON: P7ON, p7DiceWhy: p7DiceWhy, p7Need: p7Need, p7KeptEnd: p7KeptEnd, P5ON: P5ON, P5DANGER: P5DANGER, FIX3ON: FIX3ON, fix3Label: fix3Label, P3ON: P3ON, p3Kind: p3Kind, FIX2ON: FIX2ON, isPen: isPen, PG2ON: PG2ON, card: card, wire: wire, rows: rows, labelOf: labelOf, LABELS: LABELS, canHover: canHover, sevRank: sevRank, greyText: greyText, faceGrey: faceGrey, fullSev: fullSev, isLoss: isLoss };
  root.KMObLean = API;
})(typeof window !== 'undefined' ? window : globalThis);
