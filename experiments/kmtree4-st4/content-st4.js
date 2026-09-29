/* CONTENT st4 (kmtree4, 2026-09-29): the designer's rulings of that day that need a component.
 *
 *   Tactical fouler (a trait)  replaces the tactic "Takes one for the team". His words: "tactical foul
 *                              should be a player ability, not something anyone can do". When their
 *                              attack is in midfield or at the edge of your box and he is in the line
 *                              that defends it (a midfielder: both; a defender: the edge of your box),
 *                              a card only he offers: "<name> pulls <their man> down: their attack
 *                              stops, <name> is booked". No duel: it always works. The booking keeps
 *                              the old tactic's consequence only ("leave booked and red card stuff for
 *                              later"): a booked man is not offered the card again, and his tackles are
 *                              -1 for the rest of the match. No red cards, no second yellow.
 *
 * Rules of the file (EFFECTS.md): every change goes through an effects-layer helper; the new card is a
 * pool entry, built by the same code as every other card. Plain English, no dashes.
 * ST4_BREAK=fouleranyone (tactical check) lets any defender offer the card: startercheck S18 fails.
 * ST4_BREAK=foulerbook: the card no longer books him: S18 fails.
 */
(function (root) {
  'use strict';
  var FX = root.KMEffects || require('./effects.js');
  var BREAK = (typeof process !== 'undefined' && process.env && process.env.ST4_BREAK) || '';
  function first(p) { return p ? String(p.name || '').split(' ')[0] : ''; }
  function has(tags, list) { return list.some(function (t) { return (tags || []).indexOf(t) >= 0; }); }
  var TACKLES = ['tackle', 'press', 'interception', 'double team'];
  var CARD_ID = 'FXS_TACTICAL_FOUL';
  /* the zones of their attack he defends: tzone 0 is midfield, 1 the edge of your box */
  function involved(man, tzone) {
    if (!man || typeof man.line !== 'number') return false;
    if (man.line === 1) return tzone === 0 || tzone === 1;
    if (man.line === 0) return tzone === 1;
    return false;
  }

  FX.define({
    id: 'WS_TACTICAL_FOULER', name: 'Tactical fouler', kind: 'trait', system: 'st4 designer ruling',
    changes: ['option availability'],
    text: 'When their attack is in midfield or at the edge of your box and he is there to defend it, he can pull their man down: their attack stops and he is booked. It always works. Once booked, he cannot do it again, and his tackles, presses, interceptions and double teams are -1 for the rest of the match.',
    effects: [
      { name: 'book', on: 'decision_end',
        when: function (e) { return BREAK !== 'foulerbook' && e.side === 'them' && e.id === CARD_ID && !e.hasState('booked', e.owner); },
        run: function (e) { e.addState('booked', e.owner, { duration: 'match' }, first(e.owner) + ' is booked for the tactical foul: he cannot do it again, and his tackles, presses, interceptions and double teams are -1 for the rest of the match'); } },
      { name: 'careful', hook: 'stat',
        when: function (q) { return q.side === 'them' && q.actor === q.owner && has(q.tags, TACKLES) && q.hasState('booked', q.owner); },
        apply: function (q) { q.stat(-1, first(q.owner) + ' is booked and cannot go in hard'); } }
    ],
    pool: [{
      id: CARD_ID, side: 'them', tzones: [0, 1], family: 'stop', tags: ['foul', 'tackle'], ground: true, answer: true,
      text: 'he can pull their man down: their attack stops and he is booked',
      when: function (x, q) {
        var h = q.owner;
        if (!h || !x.foil || (q.squad.players || []).indexOf(h) < 0) return false;
        if (q.hasState('booked', h)) return false;
        return BREAK === 'fouleranyone' ? true : involved(h, x.tzone);
      },
      build: function (x, q) {
        var h = q.owner, f = x.foil;
        var line = first(h) + ' pulls ' + first(f) + ' down: their attack stops, ' + first(h) + ' is booked';
        return {
          test: {}, risk: 'low', bonus: 0, pays: 'stop', fouler: h,
          fixedText: first(h) + ' pulls ' + first(f) + ' down before he can get going. The referee stops play, their attack is over, and ' + first(h) + ' is booked.',
          label: line,
          read: 'No duel: it always works. ' + first(h) + ' is booked for it: he cannot do it again, and his tackles, presses, interceptions and double teams are -1 for the rest of the match.'
        };
      }
    }]
  });

  /* startercheck --break foulerwords: the sentences as they were before the Codex review (tackles only) */
  if (BREAK === 'foulerwords') {
    var D = FX.get('WS_TACTICAL_FOULER');
    D.text = D.text.replace('his tackles, presses, interceptions and double teams are -1', 'his tackles are -1');
  }
  var API = { IDS: ['WS_TACTICAL_FOULER'], CARD_ID: CARD_ID, involved: involved };
  root.KMContentST4 = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
