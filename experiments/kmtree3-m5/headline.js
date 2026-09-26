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
 *   KMHeadline.PACE  { hold: 1000, perWord: 150, breather: 300 } (ms)
 *   KMHeadline.holdMs(hd)  m6: how long the headline is held on a still
 *          pitch: 0.25 s a word, at least 1.5 s (DECISIONS item 31)
 *   KMHeadline.wordCount(text)
 */
(function (root) {
  'use strict';

  var PACE = { hold: 1000, perWord: 150, breather: 300 };   /* 09-25: shorter after playtest (it read as a freeze); was 1500 / 250 / 600 */
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
  function duel(ev) {
    var d = ev.dice;
    if (!d) return null;
    var A = ev.actorName, F = ev.foilName;
    if (!A || !F) return null;
    if (d.diff >= GOOD_BY) return { text: A + ' beats ' + F + ' (by ' + d.diff + ').', short: A + ' beats ' + F + '.', winner: A, loser: F, band: 'clean' };
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
    function withDuel(rest, restShort) {
      var r = [].concat(rest), rs = [].concat(restShort || rest);
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
      if (kAct) {
        var kk = name(o.actor);
        var kv = SAVE[o.pays] ? ' saves and keeps the ball.' : end2 === 'held' ? ' catches it.' : ' gets the ball.';
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
      if (nx.via === 'corner') rest = ['Corner to ' + T + '.'];
      else if (nx.via === 'freekick' || nx.via === 'fkcross') rest = ['Free kick to ' + T + ' near your box.', 'Free kick to ' + T + '.'];
      else if (nx.box && (nx.via === 'cross' || nx.via === 'lowcross')) rest = [th + ' will cross it into your box.', th + ' will cross it.'];
      else if (nx.box && nx.via === 'header') rest = [th + ' heads it at your goal.'];
      else if (nx.box && nx.via === 'alone') rest = [th + ' is alone in front of your goal.', th + ' is alone.'];
      else if (nx.box && SAVE[o.pays] && kAct) rest = [th + ' has the loose ball in your box.', th + ' has the loose ball.'];
      else if (nx.box) rest = [th + ' is in your box.'];
      else rest = [th + ' has it ' + (AT[nx.zone] || 'in ' + nx.zone) + '.', th + ' has it ' + (AT_SHORT[nx.zone] || AT[nx.zone] || 'in ' + nx.zone) + '.'];
      if (nx.via === 'corner' || nx.via === 'freekick' || nx.via === 'fkcross') out.holder = null;   // a set piece: the text names nobody on the ball yet
      if (kAct && SAVE[o.pays]) {
        var ks = name(o.actor);
        cands.push([ks + ' saves.', rest[0]]);
        cands.push([ks + ' saves.', rest[rest.length - 1]]);
      }
      if (ev.booked && x.effect !== 'break' && o.actor && o.foil) {
        cands.push([name(o.actor) + ' fouls ' + name(o.foil) + ' (yellow card).', rest[0]]);
        cands.push([name(o.actor) + ' fouls ' + name(o.foil) + '.', rest[rest.length - 1]]);
      }
      withDuel([rest[0]], [rest[rest.length - 1]]);
      return finish(out, cands);
    }
    /* 9. their attack ends */
    out.form = 'they end';
    var o2 = over('them');
    if (kAct && SAVE[o.pays] && (end2 === 'stop' || end2 === 'held')) {
      var kz = name(o.actor);
      cands.push([kz + (end2 === 'held' ? ' saves and holds it.' : ' saves.'), o2[0]]);
      cands.push([kz + ' saves.', o2[1]]);
      return finish(out, cands);
    }
    if (kAct && end2 === 'held') {
      var kc = name(o.actor);
      cands.push([kc + ' catches it.', o2[0]]);
      cands.push([kc + ' catches it.', o2[1]]);
      return finish(out, cands);
    }
    /* their header or shot that your keeper catches after your man lost the duel */
    if (!kAct && end2 === 'held' && yourK) {
      var yk = name(yourK);
      if (du) cands.push([du.short, yk + ' catches it.', o2[0]]);
      if (du) cands.push([du.short, yk + ' catches it.', o2[1]]);
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
      if (wordCount(t) <= CAP) { best = cands[i]; break; }
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

  var API = { headline: headline, holdMs: holdMs, wordCount: wordCount, duel: duel, outcomeOf: outcomeOf, PACE: PACE, CAP: CAP, HARD: HARD };
  root.KMHeadline = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
