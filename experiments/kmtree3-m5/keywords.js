/* Player keywords (kmtree branch b1) and chemistry pairs (b2).
 *
 * Eduardo, 2026-09-23: "putting certain players on your team unlocks
 * potential outcomes that just wouldn't show up if you don't have them ...
 * chemistry between players, affinities, or keywords".
 *
 * A keyword is printed on the player and does one thing: it ADDS an option
 * (or a new outcome to an option) that no squad without him gets. It never
 * adds a number to a stat. That is the Isaac lesson from docs/isaac-study.md
 * 2.9 and 2.11: a few rule-changers beat many stat bonuses, and the ones
 * people remember change what you can do, not how well you do it.
 *
 * Every keyword needs the player to be standing somewhere it makes sense
 * (a Crosser on a wing, a Shot blocker in defence). Put him elsewhere and
 * the sheet says his keyword does nothing there. That is what makes picking
 * the eleven a decision about keywords as well as numbers.
 *
 * WRITING RULE (his): plain English, name the player, no idiom, no dashes.
 * The blurbs below are templates: {p} is replaced by the player's name.
 *
 * Browser: window.KMKeywords. Node: module.exports.
 */
(function (root) {
  'use strict';
  var C = root.Cantera || require('../../shared/cantera.js');

  function first(p) { return p ? String(p.name || '').split(' ')[0] : ''; }
  function wide(p) { return typeof p.slot === 'number' && C.CHANNEL_OF[p.slot] !== 1; }
  function at(p) { return p && p.attr ? p.attr : {}; }
  function roleLine(p) {
    if (!p) return null;
    if (p.isKeeper || p.role === 'keeper') return 'keeper';
    var r = C.ROLES[p.role];
    return r ? r.line : (typeof p.homeLine === 'number' ? p.homeLine : null);
  }

  /* lines: where he must stand for it to work (0 defence, 1 midfield,
   *        2 attack, 'keeper'). needsWide: a wing position as well.
   * adds:  what it adds, one short phrase, for the swap message.
   * blurb: the full sentence for the sheet.
   * can:   who may be drawn with it in a random squad (numbers first, so a
   *        keyword never contradicts the sheet next to it). */
  var KW = {
    DRIBBLER: {
      name: 'Dribbler', lines: [1, 2],
      adds: 'runs at two of their players at once',
      blurb: '{p} can run at two of their players at once, in midfield or at the edge of their box. Past both and {p} is a zone on with an edge (+3 in midfield). Past one and the other trips {p}: a free kick at the edge of their box, and the man who tripped {p} is booked.',
      can: function (p) { return at(p).technique >= 14 && [1, 2].indexOf(roleLine(p)) >= 0; }
    },
    PLAYMAKER: {
      name: 'Playmaker', lines: [0, 1],
      adds: 'a pass from your half to the edge of their box',
      blurb: 'From your half, {p} can pass the ball past their midfield to your fastest forward at the edge of their box, skipping midfield.',
      can: function (p) { return at(p).passing >= 14 && [0, 1].indexOf(roleLine(p)) >= 0; }
    },
    TARGET: {
      name: 'Target man', lines: [1, 2],
      adds: 'heads a high ball down for a teammate',
      blurb: 'At the edge of their box, {p} can win a high ball and head it down to a teammate running into the box, who arrives unmarked (+2 to his shot).',
      can: function (p) { return (p.heightM || 0) >= 1.85 && at(p).physical >= 13 && [1, 2].indexOf(roleLine(p)) >= 0; }
    },
    POACHER: {
      name: 'Poacher', lines: [2],
      adds: 'a saved shot drops to him for a second go',
      blurb: 'When their keeper pushes one of your shots out, {p} is first to the loose ball and can shoot at once, while their keeper is still on the ground (+2).',
      can: function (p) { return at(p).finishing >= 14 && roleLine(p) === 2; }
    },
    CROSSER: {
      name: 'Crosser', lines: [0, 1, 2], needsWide: true,
      adds: 'crosses from midfield, and a low cross from the edge of their box',
      blurb: '{p} can cross from as far back as midfield for a header, and hit a low cross across the 5.5-metre box from the edge of their box. It only works from a wing position.',
      can: function (p) { return at(p).passing >= 12 && (['full-back', 'wing-back', 'winger'].indexOf(p.role) >= 0); }
    },
    FREEKICK: {
      name: 'Free-kick taker', lines: [0, 1, 2],
      adds: 'shoots straight from free kicks',
      blurb: '{p} can shoot straight at goal from a free kick, even from a wide one.',
      can: function (p) { return at(p).technique >= 14 && at(p).passing >= 13 && roleLine(p) !== 'keeper'; }
    },
    LATE_RUN: {
      name: 'Late runner', lines: [1],
      adds: 'runs into the box late from midfield for a shot',
      blurb: '{p} can run into the box from midfield after their defenders have picked up your forwards, for a first-time shot.',
      can: function (p) { return at(p).finishing >= 12 && roleLine(p) === 1; }
    },
    BALL_WINNER: {
      name: 'Ball winner', lines: [0, 1],
      adds: 'wins the ball straight back when they break',
      blurb: 'When you lose the ball and they break, {p} can win it straight back, and your attack starts again with +2 because their players are going forward. Against a Dribbler, {p} waits for the ball to be pushed ahead and steps in.',
      can: function (p) { return at(p).defending >= 14 && [0, 1].indexOf(roleLine(p)) >= 0; }
    },
    DESTROYER: {
      name: 'Destroyer', lines: [0, 1],
      adds: 'one foul a match with no yellow card',
      blurb: 'Once a match, {p} can stop their attack with a foul and the referee shows no card. Near your box it is still a free kick.',
      can: function (p) { return at(p).physical >= 14 && at(p).defending >= 13 && [0, 1].indexOf(roleLine(p)) >= 0; }
    },
    BLOCKER: {
      name: 'Shot blocker', lines: [0],
      adds: 'gets back to block a shot when only your keeper is left',
      blurb: 'When one of their players is through on your goal, or first to a ball your keeper pushed out, {p} can still get back and throw himself in front of the shot. Without {p}, only your keeper can act there.',
      can: function (p) { return at(p).defending >= 13 && at(p).physical >= 13 && roleLine(p) === 0; }
    },
    SWEEPER_KEEPER: {
      name: 'Sweeper keeper', lines: ['keeper'],
      adds: 'the keeper comes off his line for balls behind your defence',
      blurb: '{p} can run out of his goal for a ball over your defence or for their Playmaker\'s pass, and can run out of the penalty area with the ball when they press him.',
      can: function (p) { return at(p).distribution >= 12; }
    },
    CATCHER: {
      name: 'Cross catcher', lines: ['keeper'],
      adds: 'the keeper catches their crosses and throws it out',
      blurb: '{p} can leave the goal line to catch their cross, then throw it out so your team attacks at once.',
      can: function (p) { return at(p).physique >= 13 && (p.heightM || 0) >= 1.86; }
    }
  };
  var ORDER = Object.keys(KW);

  function has(p, id) { return !!(p && p.kw && p.kw.indexOf(id) >= 0); }

  /* Why his keyword does nothing where he stands, or null when it works. */
  function idleReason(p, id) {
    var k = KW[id];
    if (!k || !p) return 'unknown keyword';
    var keeper = p.isKeeper;
    if (k.lines.indexOf('keeper') >= 0) return keeper ? null : 'only a keeper can use it';
    if (keeper) return 'a keeper cannot use it';
    if (typeof p.line !== 'number') return 'he is on the bench';
    if (k.lines.indexOf(p.line) < 0) {
      var w = ['defence', 'midfield', 'attack'];
      return 'it only works in ' + k.lines.map(function (l) { return w[l]; }).join(' or ');
    }
    if (k.needsWide && !wide(p)) return 'it only works from a wing position';
    return null;
  }
  function active(p, id) { return has(p, id) && !idleReason(p, id); }

  /* Everyone on the pitch for this squad who can use the keyword right now. */
  function holders(sq, id) {
    var list = sq.players.slice();
    if (sq.keeper) list.push(sq.keeper);
    return list.filter(function (p) { return active(p, id); });
  }

  function unlockName(p, id) { return first(p) + ': ' + KW[id].name; }
  function blurb(p, id) { return KW[id].blurb.replace(/\{p\}/g, first(p)); }

  /* Random squads draw keywords from the seed with their own rng, after the
   * numbers, so no number on the sheet moves for any seed. Of the outfield
   * players whose numbers allow a keyword, about four in ten get one and one
   * in thirteen gets two; a keeper gets one four times in ten. Sized so a
   * squad has a handful, not one on every man (the Isaac lesson: a few strong
   * ones you can name, not many small ones you forget). */
  /* e1: a random squad draws keywords more often than d2's (0.38 of the
   * men whose numbers allow one, and half the pairs completed), because
   * e1 gives a keyword option its own place on only some menus: at 0.38 a
   * random eleven had 5.6 working keywords to the final's 9 to 12, and a
   * keyword option on 22 percent of decisions. At 0.7 it has about 7.5. */
  var OUTFIELD_KW = 0.7, KEEPER_KW = 0.6, PAIR_FILL = 0.9;
  function setDensity(o, k, p) { OUTFIELD_KW = o; if (k !== undefined) KEEPER_KW = k; if (p !== undefined) PAIR_FILL = p; }
  function assign(squad, seed) {
    if (!squad || squad.kwDone) return squad;
    var rng = new C.RNG((((seed || 1) ^ 0x4b455957) >>> 0) || 7);
    var all = squad.players.concat(squad.bench || []);
    if (squad.keeper) all.unshift(squad.keeper);
    all.forEach(function (p) {
      if (p.kw) return;
      p.kw = [];
      if (!p.attr) return;
      var ok = ORDER.filter(function (id) {
        var keeperKw = KW[id].lines.indexOf('keeper') >= 0;
        if (!!p.isKeeper !== keeperKw) return false;
        try { return KW[id].can(p); } catch (e) { return false; }
      });
      if (!ok.length) return;
      if (rng.next() < (p.isKeeper ? KEEPER_KW : OUTFIELD_KW)) {
        var a = ok[Math.floor(rng.next() * ok.length)];
        p.kw.push(a);
        var rest = ok.filter(function (x) { return x !== a; });
        if (rest.length && rng.next() < 0.2) p.kw.push(rest[Math.floor(rng.next() * rest.length)]);
      }
    });
    squad.kwDone = true;
    if (typeof completePair === 'function') completePair(squad, rng);
    return squad;
  }

  /* What swapping `out` for `inn` does to the options you can have, in words.
   * Called with the squad as it will be AFTER the swap for `inn`, and as it
   * was before for `out`. */
  function listActive(p) { return (p.kw || []).filter(function (id) { return active(p, id); }); }
  function describe(p) {
    return (p.kw || []).map(function (id) {
      var why = idleReason(p, id);
      return { id: id, name: KW[id].name, active: !why, why: why, adds: KW[id].adds };
    });
  }

  /* ======================================================== PAIRS (b2) */
  /* Two keywords that make something together that neither makes alone
   * (Isaac: 1 + 1 is a third thing, not 2). A pair needs both men on the
   * pitch, each keyword working where he stands, AND the two standing where
   * the combination is possible: side by side, one behind the other on the
   * same wing, both in attack. The sheet draws each pair that is on, and
   * names the half that is missing for each pair that is not. */
  function near(a, b) {
    if (typeof a.line !== 'number' || typeof b.line !== 'number') return false;
    var dl = Math.abs(a.line - b.line), ds = Math.abs(a.slot - b.slot);
    return (dl === 0 && ds <= 2) || (dl === 1 && ds <= 1);
  }
  function sameWing(a, b) {
    return typeof a.slot === 'number' && typeof b.slot === 'number' && C.CHANNEL_OF[a.slot] !== 1 &&
      C.CHANNEL_OF[a.slot] === C.CHANNEL_OF[b.slot] && a.line < b.line;
  }
  var PAIRS = {
    ONE_TWO: {
      name: 'One-two', a: 'PLAYMAKER', b: 'DRIBBLER', where: 'next to each other, the Playmaker in midfield',
      fits: function (a, b) { return a.line >= 1 && near(a, b); },
      blurb: '{a} passes to {b} and runs, and {b} passes it straight back first time. Two checks: if both passes get through, the ball goes two zones on.'
    },
    OVERLAP: {
      name: 'Overlap partners', a: 'CROSSER', b: 'DRIBBLER', where: 'on the same wing, the Crosser behind',
      fits: sameWing,
      blurb: '{b} holds the ball on the wing while {a} runs round the outside of their full-back. If {a} gets clear, {a} has the ball one zone on with +3 to his cross, cut-back or pull-back.'
    },
    ROUTINE: {
      name: 'Practised routine', a: 'FREEKICK', b: 'TARGET', where: 'both on the pitch',
      fits: function () { return true; },
      blurb: 'At a free kick or a corner, {a} aims at the far post where {b} arrives unmarked, as they practised.'
    },
    PLAY_OUT: {
      name: 'Playing out together', a: 'SWEEPER_KEEPER', b: 'PLAYMAKER', where: 'with the Playmaker in defence',
      fits: function (k, d) { return d.line === 0; },
      blurb: 'When they press your keeper, {a} passes short to {b} and {b} passes it past their forwards, so your attack starts in midfield.'
    },
    PRESS_PAIR: {
      name: 'Pressing pair', a: 'BALL_WINNER', b: 'DESTROYER', where: 'next to each other',
      fits: near,
      blurb: 'When they break after you lose the ball, {b} goes at their man from one side and {a} takes the ball from the other (+3). Won, your attack starts again at the edge of their box with +3.'
    },
    STRIKE_PAIR: {
      name: 'Strike partners', a: 'TARGET', b: 'POACHER', where: 'both in attack',
      fits: function (t, q) { return t.line === 2 && q.line === 2; },
      blurb: '{a} flicks a long ball on with his head, and {b} is already running onto it, two zones further on.'
    }
  };
  var PAIR_ORDER = Object.keys(PAIRS);

  /* Every pair that is on in this eleven: [{ id, a, b }] with a and b the men. */
  function pairs(sq) {
    var out = [];
    PAIR_ORDER.forEach(function (id) {
      var P = PAIRS[id];
      holders(sq, P.a).forEach(function (a) {
        holders(sq, P.b).forEach(function (b) {
          if (a !== b && P.fits(a, b)) out.push({ id: id, a: a, b: b });
        });
      });
    });
    return out;
  }
  /* Random squads: about half the time, when a squad has one half of a pair
   * and a man whose numbers allow the other half is standing in the right
   * place, he gets it, so pairs turn up often enough to be seen. Same rng
   * as the draw, so a seed replays it. Squads that already have a pair keep
   * what they drew. */
  function completePair(sq, rng) {
    if (!sq.players || pairs(sq).length || rng.next() >= PAIR_FILL) return;
    var tries = [];
    PAIR_ORDER.forEach(function (id) {
      var P = PAIRS[id];
      [[P.a, P.b], [P.b, P.a]].forEach(function (ab) {
        holders(sq, ab[0]).forEach(function (h) {
          sq.players.concat(sq.keeper ? [sq.keeper] : []).forEach(function (q) {
            if (q === h || (q.kw || []).length >= 2 || has(q, ab[1])) return;
            var ok = false;
            try { ok = KW[ab[1]].can(q) && !idleReason(q, ab[1]) && (ab[0] === P.a ? P.fits(h, q) : P.fits(q, h)); } catch (e) { ok = false; }
            if (ok) tries.push({ q: q, kw: ab[1] });
          });
        });
      });
    });
    if (!tries.length) return;
    var t = tries[Math.floor(rng.next() * tries.length)];
    (t.q.kw = t.q.kw || []).push(t.kw);
  }
  function pairOf(sq, id) { return pairs(sq).filter(function (x) { return x.id === id; }); }
  function pairName(pr) { return first(pr.a) + ' and ' + first(pr.b) + ': ' + PAIRS[pr.id].name; }
  function pairBlurb(pr) { return PAIRS[pr.id].blurb.replace(/\{a\}/g, first(pr.a)).replace(/\{b\}/g, first(pr.b)); }
  /* Pairs one man short: one half is on the pitch and working, the other is
   * not (absent, or standing in the wrong place). For the sheet. */
  function halfPairs(sq) {
    var on = {}; pairs(sq).forEach(function (x) { on[x.id] = 1; });
    var out = [];
    PAIR_ORDER.forEach(function (id) {
      if (on[id]) return;
      var P = PAIRS[id], ha = holders(sq, P.a), hb = holders(sq, P.b);
      if (ha.length && !hb.length) out.push({ id: id, have: ha[0], haveKw: P.a, need: P.b });
      else if (hb.length && !ha.length) out.push({ id: id, have: hb[0], haveKw: P.b, need: P.a });
      else if (ha.length && hb.length) out.push({ id: id, have: ha[0], haveKw: P.a, need: P.b, placed: true });
    });
    return out;
  }

  /* ================================================ THREATS (d2, from b3) */
  /* The opponent's keywords, read from YOUR side. Each one changes a moment
   * you have to defend (Messi's Dribbler makes "Messi runs at your back
   * line" possible), and most have an ANSWER: one of your keywords that adds
   * an option made for it (a Ball winner against a Dribbler). The sheet lists
   * each threat with your answer, or the keyword you would need, so picking
   * the eleven becomes a response to the opponent.
   *
   * t: the threat's man, p: your man. `sit` is the moment it creates (or
   * 'outcome' when it changes how an existing moment can end). */
  var THREATS = {
    DRIBBLER: {
      sit: 'their_dribbler',
      says: '{t} can run at your back line with the ball, at the edge of your box.',
      answers: [
        { kw: 'BALL_WINNER', text: '{p} (Ball winner) can wait for {t} to push the ball ahead and take it. Then only Pace helps {t}, not Technique.' },
        { kw: 'DESTROYER', text: '{p} (Destroyer) can foul {t} once without a yellow card.' }
      ],
      need: 'A Ball winner in defence or midfield would give you an answer.'
    },
    PLAYMAKER: {
      sit: 'their_playmaker',
      says: '{t} can pass the ball from midfield between your defenders for their fastest forward.',
      answers: [
        { kw: 'SWEEPER_KEEPER', text: '{p} (Sweeper keeper) can come out for the pass before their forward reaches it.' },
        { kw: 'BALL_WINNER', lines: [1], text: '{p} (Ball winner, in midfield) can take the ball off {t} before the pass.' }
      ],
      need: 'A Sweeper keeper, or a Ball winner in midfield, would give you an answer.'
    },
    TARGET: {
      sit: 'their_cross',
      says: 'Their crosses are aimed at {t}, who waits in your box for a header.',
      answers: [{ kw: 'CATCHER', text: '{p} (Cross catcher) can leave the line and catch the cross before {t} can head it.' }],
      need: 'A Cross catcher in goal would give you an answer.'
    },
    CROSSER: {
      sit: 'their_cross',
      says: '{t} can hit a low cross across your 5.5-metre box, where a header is no use.',
      answers: [{ kw: 'CATCHER', text: '{p} (Cross catcher) can leave the line and take the cross.' }],
      need: 'A Cross catcher in goal would give you an answer.'
    },
    POACHER: {
      sit: 'outcome',
      says: 'When your keeper pushes a shot out, {t} is first to the ball. Without a Poacher, it goes out for a corner.',
      answers: [{ kw: 'BLOCKER', text: '{p} (Shot blocker) can get back and throw himself in front of the second shot.' }],
      need: 'A Shot blocker in defence would give you an answer.'
    },
    FREEKICK: {
      sit: 'outcome',
      says: 'A foul near your box gives {t} a free kick 25 metres out, and {t} shoots. Without a Free-kick taker, their free kicks are crossed in.',
      answers: [],
      need: 'No keyword stops it. Fouling near your box is what gives it to {t}.'
    },
    CATCHER: {
      sit: 'outcome',
      says: '{t} catches any high ball into their box that your player does not win cleanly.',
      answers: [{ kw: 'CROSSER', text: '{p} (Crosser) crosses low, where {t} cannot catch it.' }],
      need: 'A Crosser on a wing would give you a cross {t} cannot catch.'
    }
  };
  var THREAT_ORDER = Object.keys(THREATS);
  /* the pair that changes a moment you defend */
  var PAIR_THREATS = {
    ONE_TWO: {
      says: '{a} and {b} play one-twos. If you send a second man at {b}, {a} is free to give {b} the ball back.',
      need: 'No keyword stops it. When {b} runs at you, one man stays with {a} instead.'
    }
  };
  function fill2(t, map) {
    var s = String(t);
    for (var k in map) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), map[k]);
    return s;
  }
  /* your men who answer one threat: the keyword, working where he stands,
   * and in the line the answer names */
  function answerers(sq, threatKw) {
    var T = THREATS[threatKw];
    if (!T) return [];
    var out = [];
    T.answers.forEach(function (a) {
      holders(sq, a.kw).forEach(function (p) {
        if (a.lines && a.lines.indexOf(p.line) < 0) return;
        out.push({ p: p, kw: a.kw, text: a.text });
      });
    });
    return out;
  }
  function answers(sq, threatKw, yourKw) {
    return answerers(sq, threatKw).some(function (a) { return a.kw === yourKw; });
  }
  /* Everything of theirs that acts on you, with your answer, for the sheet.
   * [{ kw, men: [their men], says, answers: [{p, kw, line}], need }] */
  function threats(opp, sq) {
    var out = [];
    THREAT_ORDER.forEach(function (id) {
      var men = holders(opp, id);
      if (!men.length) return;
      var T = THREATS[id], t = first(men[0]);
      var names = men.map(first);
      var tName = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : t;
      var ans = answerers(sq, id).map(function (a) {
        return { p: a.p, kw: a.kw, line: fill2(a.text, { p: first(a.p), t: tName }) };
      });
      out.push({ kw: id, name: KW[id].name, men: men, says: fill2(T.says, { t: tName }), answers: ans,
        need: fill2(T.need, { t: tName }) });
    });
    pairs(opp).forEach(function (pr) {
      var PT = PAIR_THREATS[pr.id];
      if (!PT) return;
      var m = { a: first(pr.a), b: first(pr.b) };
      out.push({ pair: pr.id, name: PAIRS[pr.id].name, men: [pr.a, pr.b], says: fill2(PT.says, m), answers: [],
        need: fill2(PT.need, m) });
    });
    return out;
  }
  /* "Because Messi is a Dribbler", for the screen */
  function because(p, id) {
    var n = KW[id].name;
    return 'Because ' + first(p) + ' is a' + (/^[AEIOU]/.test(n) ? 'n ' : ' ') + n;
  }
  /* their keywords that change nothing for you in this version, for honesty on the sheet */
  function inertTheirs(opp) {
    var out = [];
    opp.players.concat(opp.keeper ? [opp.keeper] : []).forEach(function (p) {
      (p.kw || []).forEach(function (id) { if (!THREATS[id] && active(p, id)) out.push(first(p) + ' (' + KW[id].name + ')'); });
    });
    return out;
  }

  var API = { setDensity: setDensity, KW: KW, ORDER: ORDER, PAIRS: PAIRS, PAIR_ORDER: PAIR_ORDER, pairs: pairs, pairOf: pairOf,
    pairName: pairName, pairBlurb: pairBlurb, halfPairs: halfPairs, near: near, has: has, active: active, idleReason: idleReason, holders: holders,
    unlockName: unlockName, blurb: blurb, assign: assign, listActive: listActive, describe: describe,
    roleLine: roleLine, first: first,
    THREATS: THREATS, THREAT_ORDER: THREAT_ORDER, PAIR_THREATS: PAIR_THREATS, threats: threats, answerers: answerers, answers: answers,
    because: because, inertTheirs: inertTheirs, fill2: fill2 };
  root.KMKeywords = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
