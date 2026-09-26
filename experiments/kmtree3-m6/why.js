/* why1: THE PITCH IS WHERE THE REASONS ARE (review round 3, change 3 and its
 * bold idea; DECISIONS item 27).
 *
 * Every number on a card has parts: the two men's stats (the duel) and the
 * bonuses the engine names ("+2 because nobody is near him", "+2 because
 * Porro is out of position"). This module finds, for one option, each of
 * those parts, and says where on the frozen pitch it is true and how to draw
 * it there:
 *
 *   space        a soft shaded area where no opponent is, "+2 space"
 *   outpos       a ghost ring where the man should be (goal-side of the man
 *                he is marking) and an arrow to where he is
 *   lastdef      a line along the last defender, with the attacker beyond it
 *   tired        a small icon by the man, "-3 tired"
 *   duel         the two men joined by a thin line, "Technique 18 v Defending 14"
 *   measure      a dashed line to the goal with its metres (close, far, a
 *                free kick, a cross)
 *   angle        the wedge from the shooter to the two posts
 *   pair         two men of one team joined to the one man they are against
 *   guard        the line from their man to the goal, with your man on it
 *   wall         a bar through the men in the wall
 *   keeperOut    a ghost ring on the goal line and an arrow to the keeper
 *   team         their back line, or the men caught up the pitch, ringed
 *   pass         the pass itself, from the man to his team-mate, with metres
 *   badge        a small icon by the man (a player trait, a yellow card, a
 *                goal or a miss earlier, "has seen this", on the ground, left behind)
 *   chip         no place on the pitch: a rule of the action ("stopping a man
 *                by fouling him is easy"), a floor ("can always get a hand to
 *                one shot in 6"). Written in one small box by the man on the ball.
 *
 * The full list of reason sentences, what each becomes and how it is drawn,
 * is REASONS.md. A reason whose picture is NOT true in the staged scene (the
 * "space" has an opponent in it, the "last defender" is level) is never
 * drawn: it goes to the chip, and `untrue` says so, so a check can count it.
 *
 * PURE: reads the match and the frozen positions, writes nothing, no
 * randomness. The page draws what plan() returns; whycheck.js checks it.
 *
 *   KMWhy.reasons(st, pend, o)                  -> [reason]  every part of the number, in card order
 *   KMWhy.plan(st, pend, o, scene, opts)        -> { reasons, items, chip }
 *     scene: { pos: {id: {x, y}} contract metres, ball: {x, y}, S: pitch.startOf }
 *     opts:  { r, fs, width(text), avoid: [boxes], lift, max: 3 }
 *   KMWhy.classify(why)                          -> { kind, sub, names, metres, rule }
 *   KMWhy.namedOnCards(st, pend)                 -> first names of every man any live card names
 *
 * All drawing coordinates are SCREEN metres (x right, y DOWN = 105 - pitch y),
 * the same as tags.js and the page's SVG. */
(function (root) {
  'use strict';
  var P = root.KMPitch || require('./pitch.js');
  var TG = root.KMTags || require('./tags.js');
  var O = root.KMOptions || require('./options.js');
  var L = 105, W = 68;
  /* whycheck.js --break only: each switch breaks one promise */
  var T = { drop: false, twice: false, anchor: false, noTag: false, overlap: false, max: false, who: false, trust: false };
  /* ?whybreak=<name> in the page: the same switches, for whycheck.js's page part */
  try { var mb = /[?&]whybreak=([a-zA-Z]+)/.exec((root.location && root.location.search) || ''); if (mb && mb[1] in T) T[mb[1]] = true; } catch (e) { }


  var NM = "([^ .,:;]+)";   /* a first name, as pitch.js reads them (a no-break space stays inside) */
  function re(s) { return new RegExp('^' + s.replace(/X/g, NM) + '$'); }
  /* THE RULES, in order; the first that matches wins. `men` lists the roles
   * of the captured names; 'he' is the man doing it (the option's actor). */
  var RULES = [
    /* ---- space: nobody near */
    [re('there is space on the (left|middle|right)'), 'space', 'lane', { lab: 'space' }],
    [re('nobody is (?:near|closing) him(?: down)? on that side yet'), 'space', 'actor', { lab: 'space' }],
    [re('the pass goes away from their defenders'), 'space', 'to', { lab: 'space' }],
    [re('nobody has gone with X, so the pass only has to get past X'), 'space', 'named0', { lab: 'unmarked' }],
    [re('X arrives unmarked'), 'space', 'named0', { lab: 'unmarked' }],
    [re('nobody got in front of X'), 'space', 'named0', { lab: 'nobody in front' }],
    /* ---- out of position */
    [re('X is out of position'), 'outpos', 'named0', { lab: 'out of position' }],
    [re('X is round the outside of X'), 'outpos', 'named1', { lab: 'round the outside' }],
    /* ---- past the last defender */
    [re('X is past the last defender'), 'lastdef', 'named0', { lab: 'past the last defender' }],
    [re('X is through on his own'), 'lastdef', 'named0', { lab: 'through on his own' }],
    /* ---- the distance to goal */
    [re('(?:he|X) is inside (?:the|your) box, close to goal'), 'measure', 'shooter', { lab: 'close to goal', m: 'goal' }],
    [re('he is shooting from outside the box'), 'measure', 'shooter', { lab: 'outside the box', m: 'goal' }],
    [re('he is shooting from (\\d+) metres'), 'measure', 'shooter', { lab: 'far out', m: 'goal' }],
    [re('a shot from (\\d+) metres rarely goes in'), 'measure', 'shooter', { lab: 'far out', m: 'goal' }],
    [re('from (\\d+) metres the ball has to get round five men and dip under the bar'), 'measure', 'ball', { lab: 'far out', m: 'goal' }],
    [re('from (\\d+) metres X sees the ball the whole way'), 'measure', 'ball', { lab: 'far out', m: 'goal' }],
    [re('the free kick is (\\d+) metres out'), 'measure', 'ball', { lab: 'far out', m: 'goal' }],
    [re('the cross comes from (\\d+) metres, so their defenders see it coming'), 'measure', 'ball', { lab: 'long cross', m: 'actor' }],
    /* ---- the angle */
    [re('X is shooting from a narrow angle'), 'angle', 'named0', { lab: 'narrow angle' }],
    [re('the angle from the side is tight'), 'angle', 'shooter', { lab: 'tight angle' }],
    /* ---- the wall */
    [re('the wall covers part of the goal, and from (\\d+) metres X sees the ball the whole way'), 'wall', 'ball', { lab: 'the wall' }],
    [re('the wall is in the way, and from (\\d+) metres X sees the ball the whole way'), 'wall', 'ball', { lab: 'the wall' }],
    /* ---- two against one, and men close together */
    [re('there are two of them against one'), 'pair', 'foil', { lab: 'two against one' }],
    [re('there are two of them against X'), 'pair', 'named0', { lab: 'two against one' }],
    [re('two of your players went to X'), 'pair', 'named0', { lab: 'two went to him' }],
    [re('X comes at X from the other side'), 'pair', 'named1', { lab: 'from both sides', with: 'named0', task: true }],
    [re('X is right next to X'), 'pair', 'named1', { lab: 'right next to him', with: 'named0', one: true }],
    [re('X is staying close to X'), 'pair', 'named1', { lab: 'stays close', with: 'named0', one: true, near: 8 }],
    [re('X can hold on to X before the ball arrives'), 'pair', 'named1', { lab: 'holds on to him', with: 'named0', one: true, task: true, near: 10 }],
    [re('(\\S+) put a second player on X'), 'pair', 'named0', { lab: 'second man on him' }],
    /* ---- goal-side */
    [re('X only has to stay between X and your goal'), 'guard', 'named1', { lab: 'goal-side', with: 'named0', task: true }],
    [re('X is still between X and your goal'), 'guard', 'named1', { lab: 'goal-side', with: 'named0' }],
    [re('he only has to stay on the inside of X'), 'guard', 'named0', { lab: 'on the inside', with: 'actor', task: true }],
    [re('he only has to stay in front, not win the ball'), 'guard', 'foil', { lab: 'stay in front', with: 'actor', task: true }],
    [re('your defence was back in place before X got there'), 'team', 'line', { lab: 'back in place' }],
    [re('your defenders only have to get back, not win the ball'), 'team', 'line', { lab: 'get back' }],
    [re('X has to shoot before your defenders get back'), 'team', 'chasers', { lab: 'defenders coming back' }],
    /* ---- keepers off their line */
    [re('your keeper is out of his goal'), 'keeperOut', 'yourKeeper', { lab: 'keeper off his line' }],
    [re('X coming a few steps out leaves X less of the goal to aim at'), 'keeperOut', 'named0', { lab: 'keeper off his line' }],
    [re('their keeper is on the ground'), 'badge', 'theirKeeper', { lab: 'keeper on the ground', g: 'down' }],
    /* ---- team shape */
    [re('their defence is stretched'), 'team', 'line', { lab: 'stretched' }],
    [re('their defenders stepped up'), 'team', 'line', { lab: 'they stepped up' }],
    [re('their defence is backing off'), 'team', 'line', { lab: 'backing off' }],
    [re('their defence is short of players'), 'team', 'upfield', { lab: 'short at the back' }],
    [re('their players were going forward'), 'team', 'upfield', { lab: 'caught going forward' }],
    [re('they have players up the pitch'), 'team', 'upfield', { lab: 'men up the pitch' }],
    [re('their team was going forward when X won it back'), 'team', 'upfield', { lab: 'caught going forward' }],
    [re('your team lost the ball (?:in|at) (?:their box|the edge of their box|midfield|your half|your box) going forward'), 'team', 'upfield', { lab: 'lost it going forward' }],
    /* ---- the pass itself */
    [re('a pass backwards is easier than a pass forward'), 'pass', 'to', { lab: 'pass back' }],
    [re('a short pass into feet is an easy ball'), 'pass', 'to', { lab: 'short pass' }],
    [re('it is a short pass to a teammate nearby'), 'pass', 'to', { lab: 'short pass' }],
    [re('a pass back along the ground is hard to stop'), 'pass', 'to', { lab: 'pass back' }],
    [re('a short pass across the back is an easy ball'), 'pass', 'to', { lab: 'short pass' }],
    [re('a pass into midfield is a normal ball'), 'pass', 'to', { lab: 'pass' }],
    [re('a short free kick is an easy ball'), 'pass', 'to', { lab: 'short free kick' }],
    [re('the pass went past X'), 'badge', 'named0', { lab: 'the pass went past him', g: 'behind' }],
    /* ---- one man: a trait, a card, earlier in the match, what they have seen */
    [re('X is a (Dribbler|Shot blocker|Ball winner|Crosser|Free-kick taker)\\b.*'), 'badge', 'named0', { lab: '{T}', g: 'star' }],
    [re('X and X have played this one-two together many times'), 'badge', 'named0', { lab: 'one-two pair', g: 'star', with: 'named1' }],
    [re('the routine puts X at the far post, away from his marker'), 'badge', 'named0', { lab: 'far post', g: 'star' }],
    [re('X knows where the cross is going and X does not'), 'badge', 'named0', { lab: 'knows the cross', g: 'star' }],
    [re('a keeper who is not a Cross catcher does not often leave his line'), 'badge', 'actor', { lab: 'not a Cross catcher', g: 'rule' }],
    [re('X is on a yellow card and cannot (?:go in fully|risk a tackle)'), 'badge', 'named0', { lab: 'yellow card', g: 'card' }],
    [re('X scored at (\\d+) minutes'), 'badge', 'named0', { lab: 'scored earlier', g: 'form' }],
    [re('X missed a chance at (\\d+) minutes'), 'badge', 'named0', { lab: 'missed earlier', g: 'form' }],
    [re('X has seen this .* (?:once|twice|\\S+ times)'), 'badge', 'named0', { lab: 'has seen this', g: 'seen' }],
    [re('X faced a (?:hard|placed) shot last time and is ready for another'), 'badge', 'named0', { lab: 'ready for it', g: 'seen' }],
    [re('X is ready for another .*'), 'badge', 'named0', { lab: 'ready for it', g: 'seen' }],
    [re('X was left behind'), 'badge', 'named0', { lab: 'left behind', g: 'behind' }],
    [re('X got past two of their players'), 'badge', 'named0', { lab: 'beat two', g: 'run' }],
    [re('X is running at their goal'), 'badge', 'named0', { lab: 'running at goal', g: 'run' }],
    [re('X is already running past X'), 'badge', 'named0', { lab: 'already running', g: 'run' }],
    [re('X only has to get in the way of the kick'), 'badge', 'named0', { lab: 'only has to block', g: 'rule' }],
    /* ---- no place on the pitch: rules of the action and floors */
    [re('X can always get a hand to at least one shot in (\\d+)'), 'chip', null, { lab: 'always 1 in {N}' }],
    [re('X always has at least one chance in (\\d+) to get something on it'), 'chip', null, { lab: 'always 1 in {N}' }],
    [re('X can always find the touchline: it goes wrong at most (\\d+) times in (\\d+)'), 'chip', null, { lab: 'touchline is safe' }],
    [re('stopping a man by fouling him is easy'), 'chip', null, { lab: 'a foul is easy' }],
    [re('nobody has to win a tackle'), 'chip', null, { lab: 'no tackle needed' }],
    [re('he is not committing to a tackle he can lose'), 'chip', null, { lab: 'no tackle' }],
    [re('a header is slower than a shot(?:, but catching it is harder than pushing it away)?'), 'chip', null, { lab: 'a header is slow' }],
    [re('holding the ball by the corner flag is easy'), 'chip', null, { lab: 'easy to hold' }],
    [re('the touchline is a big target'), 'chip', null, { lab: 'big target' }],
    [re('a long kick only has to clear the forward in front of him'), 'chip', null, { lab: 'long kick' }],
    [re('this is the safe option'), 'chip', null, { lab: 'safe option' }],
    [re('they are ready for the .* now'), 'chip', null, { lab: 'they are ready' }],
    [re('(\\S+) have a second player on the (?:left|middle|right)'), 'chip', null, { lab: 'second man there' }],
    [re('(\\S+) moved a player off the (?:left|middle|right)'), 'chip', null, { lab: 'a man moved off' }]
  ];

  function first(p) { return p ? String(p.name || '').split(' ')[0] : ''; }
  function classify(why) {
    var s = String(why || '');
    for (var i = 0; i < RULES.length; i++) {
      var m = RULES[i][0].exec(s);
      if (!m) continue;
      var names = [], metres = null;
      for (var k = 1; k < m.length; k++) {
        if (m[k] === undefined) continue;
        if (/^\d+$/.test(m[k])) { if (metres === null) metres = +m[k]; continue; }
        names.push(m[k]);
      }
      return { kind: RULES[i][1], role: RULES[i][2], spec: RULES[i][3], names: names, metres: metres, rule: i };
    }
    return { kind: 'chip', role: null, spec: { lab: null }, names: [], metres: null, rule: -1, unknown: true };
  }

  var ATTR = { technique: 'Technique', passing: 'Passing', pace: 'Pace', physical: 'Physical', finishing: 'Finishing',
    defending: 'Defending', intelligence: 'Intelligence', reflexes: 'Reflexes', command: 'Command', distribution: 'Distribution',
    heading: 'Heading', reach: 'In the air', physique: 'Physique' };
  function attrName(a) { return ATTR[a] || (O.statOf ? O.statOf(a) : a); }

  /* -------------------------------------------------------- the reasons */
  function sum(l) { return (l || []).reduce(function (a, m) { return a + (m.n || 0); }, 0); }
  function reasons(st, pend, o) {
    var out = [];
    if (!o) return out;
    var duel = !!(o.actor && o.foil && o.mineVal != null && o.themVal != null);
    if (duel) {
      var mb = o.mineVal - sum(o.mods), tb = o.themVal - sum(o.theirMods);
      out.push({ key: 'duel', kind: 'duel', side: 'both', n: 0, why: attrName(o.mineAttr || o.attr) + ' ' + mb + ' v ' + attrName(o.themAttr) + ' ' + tb,
        mine: mb, theirs: tb, cls: { kind: 'duel', names: [], spec: { lab: null } } });
    }
    /* stamina: the number on the card is already his tired number; say so */
    if (o.stamina) {
      var sm = /Stamina (\d+) out of 100 in that line, so .*'s .* (\d+) is playing as (\d+)\./.exec(o.stamina);
      if (sm && +sm[3] !== +sm[2]) out.push({ key: 'tired', kind: 'tired', side: 'you', n: +sm[3] - +sm[2], why: o.stamina.replace(/\.$/, ''),
        stamina: +sm[1], cls: { kind: 'tired', names: [], spec: { lab: 'tired' } } });
    }
    (o.mods || []).forEach(function (m, i) {
      var c = classify(m.why);
      out.push({ key: 'm' + i, kind: c.kind, side: 'you', n: m.n, why: m.why, cls: c });
    });
    (o.theirMods || []).forEach(function (m, i) {
      var c = classify(m.why);
      out.push({ key: 't' + i, kind: c.kind, side: 'them', n: m.n, why: m.why, cls: c });
    });
    return out;
  }

  /* -------------------------------------------------------- geometry */
  function scr(q) { return q ? { x: q.x, y: L - q.y } : null; }
  function d2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function r1(v) { return Math.round(v * 10) / 10; }

  function ctxOf(st, pend, o, scene) {
    var S = scene.S || P.startOf(st, pend);
    var attacking = S.attacking || (pend.moment && pend.moment.sit && pend.moment.sit.who) || 'you';
    var def = attacking === 'you' ? 'them' : 'you';
    var ros = P.roster(st), byId = {}, men = [];
    ros.forEach(function (r) {
      var q = scene.pos && scene.pos[r.id];
      if (!q) return;
      var e = { id: r.id, p: r.p, team: r.team, keeper: r.keeper, at: scr(q) };
      byId[r.id] = e; men.push(e);
    });
    /* the goal each team DEFENDS, on screen: yours at the bottom, theirs at the top */
    function goalOf(team) { return { x: 34, y: team === 'you' ? L : 0 }; }
    function find(p) { return p ? byId[p.id] || null : null; }
    function name(nm, pref) {
      var p = pref ? P.byFirst(st, nm, pref) : null;
      if (!p) p = P.byFirst(st, nm, null);
      return find(p);
    }
    var ball = scene.ball ? scr(scene.ball) : { x: S.x, y: L - S.y };
    return { st: st, pend: pend, o: o, S: S, att: attacking, def: def, men: men, byId: byId, find: find, name: name, goalOf: goalOf, ball: ball };
  }
  function others(c, team, not) {
    return c.men.filter(function (m) { return m.team === team && !m.keeper && (!not || not.indexOf(m.id) < 0); });
  }
  function nearestOf(list, pt) {
    var b = null, bd = 1e9;
    list.forEach(function (m) { var d = d2(m.at, pt); if (d < bd) { bd = d; b = m; } });
    return { man: b, d: bd };
  }
  function teamOfMan(c, man) { return man ? man.team : null; }
  function opp(team) { return team === 'you' ? 'them' : 'you'; }

  /* who a role names */
  function roleMan(c, role, cls, side) {
    var o = c.o;
    switch (role) {
      case 'actor': return c.find(o.actor);
      case 'foil': return c.find(o.foil);
      case 'to': return c.find(o.to || o.receiver || o.mate);
      case 'shooter': return c.find(o.actor && c.find(o.actor) && c.find(o.actor).team === c.att ? o.actor : o.foil);
      case 'theirs': return c.find(o.foil);
      case 'yourKeeper': return c.find(c.st.squad.keeper);
      case 'theirKeeper': return c.find(c.st.opp.keeper);
      case 'named0': return T.who ? c.find(o.actor) : cls.names[0] ? c.name(cls.names[0]) : null;
      case 'named1': return cls.names[1] ? c.name(cls.names[1]) : null;
      default: return null;
    }
  }

  /* -------------------------------------------------------- one reason's picture */
  /* returns { shape, at (label anchor), r0, men: [ids], true: bool, why } or null (no place) */
  function picture(c, rs) {
    var o = c.o, cls = rs.cls, spec = cls.spec || {};
    var man = roleMan(c, cls.role, cls, rs.side);
    var actor = c.find(o.actor), foil = c.find(o.foil);
    function sh(shape, at, men, ok, r0, note) { return { shape: shape, at: at, men: men.filter(Boolean), ok: ok !== false, r0: r0 || 1.8, note: note || null }; }
    switch (rs.kind) {
      case 'duel': {
        if (!actor || !foil) return null;
        return sh({ type: 'duel', a: actor.at, b: foil.at }, { x: (actor.at.x + foil.at.x) / 2, y: (actor.at.y + foil.at.y) / 2 }, [actor.id, foil.id], true, 0.6);
      }
      case 'tired': {
        if (!actor) return null;
        return sh({ type: 'badge', g: 'tired', at: actor.at }, actor.at, [actor.id], true, 2.2);
      }
      case 'space': {
        var foes = null, centre = null, rr = 0, anchor = null;
        if (cls.role === 'lane') {
          if (!actor) return null;
          foes = others(c, opp(actor.team)).concat(c.men.filter(function (m) { return m.team === opp(actor.team) && m.keeper; }));
          var lw = { left: [0, 22], middle: [22, 46], right: [46, 68] }[cls.names[0]] || [0, 68];
          var up = c.goalOf(opp(actor.team)).y < 50 ? -1 : 1, best = null;
          for (var dy = 3; dy <= 22; dy += 1.5) for (var x = lw[0] + 3; x <= lw[1] - 3; x += 1.5) {
            var pt = { x: x, y: actor.at.y + up * dy };
            if (pt.y < 2 || pt.y > L - 2) continue;
            var nd = nearestOf(foes, pt).d - dy * 0.05;
            if (!best || nd > best.d) best = { pt: pt, d: nd };
          }
          if (!best) return null;
          centre = best.pt; rr = clamp(best.d - 1.5, 3, 9);
          return sh({ type: 'area', c: centre, r: rr }, centre, [], best.d >= 5, rr * 0.6, 'nearest opponent ' + r1(best.d) + ' m');   /* a place, not a man */
        }
        anchor = man || actor;
        if (!anchor) return null;
        foes = c.men.filter(function (m) { return m.team === opp(anchor.team); });
        var nn = nearestOf(foes, anchor.at);
        rr = clamp(nn.d - 1.2, 2.6, 9);
        return sh({ type: 'area', c: anchor.at, r: rr }, anchor.at, [anchor.id], nn.d >= 4, 2.2, 'nearest opponent ' + r1(nn.d) + ' m');
      }
      case 'outpos': {
        /* the man out of position, and the man he should be goal-side of */
        /* he should be goal-side of the man on the ball (the man who got past him) */
        var hold0 = c.find(c.S.holder);
        var mm = man, att = cls.role === 'named1' ? c.name(cls.names[0]) : (hold0 && mm && hold0.team !== mm.team ? hold0 : actor);
        if (!mm || !att || mm.team === att.team) return null;
        var g = c.goalOf(mm.team), gd = d2(att.at, g) || 1;
        var ux0 = (g.x - att.at.x) / gd, uy0 = (g.y - att.at.y) / gd, ghost = null, gBest = -1;
        /* goal-side of him, 5 to 7 m, turned up to 40 degrees: the spot clearest of other men */
        [0, -15, 15, -30, 30, -40, 40].forEach(function (deg) {
          var a0 = deg * Math.PI / 180, ux = ux0 * Math.cos(a0) - uy0 * Math.sin(a0), uy = ux0 * Math.sin(a0) + uy0 * Math.cos(a0);
          [6, 5, 7].forEach(function (dd) {
            var q = { x: att.at.x + ux * dd, y: att.at.y + uy * dd };
            if (q.x < 1 || q.x > 67 || q.y < 1 || q.y > L - 1) return;
            var cl = c.men.reduce(function (m, o2) { return o2 === mm ? m : Math.min(m, d2(o2.at, q)); }, 99);
            if (cl > gBest + 0.4) { gBest = cl; ghost = q; }
          });
        });
        if (!ghost) return null;
        var off = d2(ghost, mm.at);
        return sh({ type: 'ghost', g: ghost, to: mm.at }, ghost, [mm.id], off >= 2.5, 1.6, r1(off) + ' m from goal-side');
      }
      case 'lastdef': {
        var a0 = man || actor;
        if (!a0) return null;
        var dteam = opp(a0.team), g2 = c.goalOf(dteam), defs = others(c, dteam);
        if (!defs.length) return null;
        /* the last defender: their outfield man nearest their own goal line */
        var last = defs.slice().sort(function (p, q) { return Math.abs(p.at.y - g2.y) - Math.abs(q.at.y - g2.y); })[0];
        var beyond = Math.abs(a0.at.y - g2.y) < Math.abs(last.at.y - g2.y) - 0.3;
        /* the label sits on the line, at the end with fewer men near it */
        var crowd = function (x) { return c.men.filter(function (m) { return Math.abs(m.at.x - x) < 14 && Math.abs(m.at.y - last.at.y) < 7; }).length; };
        var endX = crowd(8) <= crowd(60) ? 5 : 63;
        return sh({ type: 'hline', y: last.at.y, x0: 2, x1: 66, man: a0.at, def: last.at }, { x: endX, y: last.at.y }, [a0.id, last.id], beyond, 0.6,
          r1(Math.abs(last.at.y - g2.y) - Math.abs(a0.at.y - g2.y)) + ' m beyond');
      }
      case 'measure': {
        var from = cls.role === 'ball' ? { at: c.ball, id: null } : man || actor;
        if (!from) return null;
        var tteam = spec.m === 'actor' ? null : (man && cls.role !== 'ball' ? opp(man.team) : c.def);
        var to = spec.m === 'actor' ? (actor ? actor.at : null) : c.goalOf(tteam);
        if (!to) return null;
        var mm2 = d2(from.at, to);
        var ok = cls.metres === null || Math.abs(mm2 - cls.metres) <= 8;
        return sh({ type: 'measure', a: from.at, b: to, m: Math.round(mm2), said: cls.metres }, { x: (from.at.x + to.x) / 2, y: (from.at.y + to.y) / 2 },
          [from.id, spec.m === 'actor' && actor ? actor.id : null], ok, 0.6);
      }
      case 'angle': {
        var s0 = man || actor;
        if (!s0) return null;
        var gy = c.goalOf(opp(s0.team)).y;
        var wide = Math.abs(s0.at.x - 34) > 9;
        return sh({ type: 'wedge', a: s0.at, p1: { x: 30.34, y: gy }, p2: { x: 37.66, y: gy } }, { x: (s0.at.x + 34) / 2, y: (s0.at.y + gy) / 2 }, [s0.id], wide, 0.6);
      }
      case 'wall': {
        var wteam = c.def, wg = c.goalOf(wteam);
        var wm = others(c, wteam).filter(function (m) {
          return d2(m.at, c.ball) < 14 && d2(m.at, wg) < d2(c.ball, wg);
        }).sort(function (p, q) { return p.at.x - q.at.x; });
        if (wm.length < 2) return sh(null, null, [], false);
        var wc = { x: wm.reduce(function (a, m) { return a + m.at.x; }, 0) / wm.length, y: wm.reduce(function (a, m) { return a + m.at.y; }, 0) / wm.length };
        return sh({ type: 'wall', pts: wm.map(function (m) { return m.at; }), ball: c.ball, m: Math.round(d2(c.ball, wg)) }, wc, wm.map(function (m) { return m.id; }), true, 2.4);
      }
      case 'pair': {
        var tgt = man;
        if (!tgt) return null;
        var mates = [];
        if (spec.with) { var w1 = roleMan(c, spec.with, cls); if (w1) mates.push(w1); }
        if (!spec.one) {
          var pool = others(c, opp(tgt.team), mates.map(function (m) { return m.id; }));
          if (!mates.length && actor && actor.team !== tgt.team) mates.push(actor);
          pool = pool.filter(function (m) { return mates.indexOf(m) < 0; });
          while (mates.length < 2 && pool.length) {
            var nb = nearestOf(pool, tgt.at).man; mates.push(nb); pool = pool.filter(function (m) { return m !== nb; });
          }
        }
        if (!mates.length) return null;
        var near = spec.task || mates.every(function (m) { return d2(m.at, tgt.at) <= (spec.near || (spec.one ? 6 : 15)); });
        return sh({ type: 'pair', t: tgt.at, from: mates.map(function (m) { return m.at; }) }, tgt.at, [tgt.id].concat(mates.map(function (m) { return m.id; })), near, 2.2);
      }
      case 'guard': {
        var at0 = man, dm = spec.with ? roleMan(c, spec.with, cls) : actor;
        if (!at0 || !dm || at0.team === dm.team) return null;
        var gg = c.goalOf(dm.team), L0 = d2(at0.at, gg) || 1;
        var t0 = ((dm.at.x - at0.at.x) * (gg.x - at0.at.x) + (dm.at.y - at0.at.y) * (gg.y - at0.at.y)) / (L0 * L0);
        var px = at0.at.x + (gg.x - at0.at.x) * t0, py = at0.at.y + (gg.y - at0.at.y) * t0;
        var between = !!spec.task || (t0 > 0 && t0 < 1 && d2({ x: px, y: py }, dm.at) < 7);
        return sh({ type: 'guard', a: at0.at, g: gg, d: dm.at }, dm.at, [at0.id, dm.id], between, 2.2);
      }
      case 'keeperOut': {
        var k = man;
        if (!k) return null;
        var line = c.goalOf(k.team), gl = { x: 34, y: line.y === 0 ? 0.8 : L - 0.8 };
        var out = d2(gl, k.at);
        return sh({ type: 'ghost', g: gl, to: k.at, keeper: true }, gl, [k.id], out >= 2.5, 1.6, r1(out) + ' m off his line');
      }
      case 'team': {
        var tt = cls.role === 'chasers' ? c.def : (rs.side === 'you' ? opp(actor ? actor.team : c.att) : (actor ? actor.team : c.def));
        /* a reason of theirs on your moment is about YOUR team (your defence, your players up the pitch) */
        if (rs.side === 'them') tt = foil ? opp(foil.team) : c.def;
        if (/^your defen/.test(rs.why)) tt = 'you';
        var tg = c.goalOf(tt), mem = others(c, tt);
        if (!mem.length) return null;
        if (cls.role === 'upfield') {
          /* their men further from their own goal than the ball: caught up the pitch */
          var bd = Math.abs(c.ball.y - tg.y);
          var up2 = mem.filter(function (m) { return Math.abs(m.at.y - tg.y) > bd + 1; });
          var ac = up2.length ? { x: up2.reduce(function (a, m) { return a + m.at.x; }, 0) / up2.length, y: up2.reduce(function (a, m) { return a + m.at.y; }, 0) / up2.length } : c.ball;
          return sh({ type: 'rings', pts: up2.map(function (m) { return m.at; }), count: up2.length }, ac, up2.map(function (m) { return m.id; }), up2.length >= 2, 2.4, up2.length + ' past the ball');
        }
        if (cls.role === 'chasers') {
          /* your defenders goal-side of nobody yet: the nearest three, arrows toward the man */
          var shooter = foil || c.find(c.S.holder);
          if (!shooter) return null;
          var ch = others(c, tt).sort(function (p, q) { return d2(p.at, shooter.at) - d2(q.at, shooter.at); }).slice(0, 2);
          return sh({ type: 'chase', to: shooter.at, from: ch.map(function (m) { return m.at; }) }, shooter.at, [shooter.id].concat(ch.map(function (m) { return m.id; })), ch.length > 0, 2.2);
        }
        /* the back line: the four outfield men nearest their own goal, left to right */
        var bl = mem.slice().sort(function (p, q) { return Math.abs(p.at.y - tg.y) - Math.abs(q.at.y - tg.y); }).slice(0, 4)
          .sort(function (p, q) { return p.at.x - q.at.x; });
        var bc = { x: bl.reduce(function (a, m) { return a + m.at.x; }, 0) / bl.length, y: bl.reduce(function (a, m) { return a + m.at.y; }, 0) / bl.length };
        var spread = bl[bl.length - 1].at.x - bl[0].at.x;
        return sh({ type: 'line', pts: bl.map(function (m) { return m.at; }), spread: Math.round(spread) }, bc, bl.map(function (m) { return m.id; }), true, 1.8);
      }
      case 'pass': {
        var rc = c.find(o.to || o.receiver || o.mate), pa = actor;
        if (!rc || !pa || rc === pa) return null;
        /* where the hover arrow gives him the ball (preview.js), so the two never disagree */
        var gets = rc.at, pv = c.preview;
        if (pv && pv.outcomes) pv.outcomes.forEach(function (q) { if (q.holder && q.holder.id === rc.id && q.likely) gets = { x: q.dest.x, y: L - q.dest.y }; });
        return sh({ type: 'pass', a: pa.at, b: gets, m: Math.round(d2(pa.at, gets)) }, { x: (pa.at.x + gets.x) / 2, y: (pa.at.y + gets.y) / 2 }, gets === rc.at ? [pa.id, rc.id] : [pa.id], true, 0.6);
      }
      case 'badge': {
        var bm = man || actor;
        if (!bm) return null;
        return sh({ type: 'badge', g: spec.g || 'star', at: bm.at }, bm.at, [bm.id], true, 2.2);
      }
      default: return null;
    }
  }

  /* the label's words: the number first, then a few words */
  function sgn(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n); }
  function labelOf(rs, pic) {
    if (rs.kind === 'duel') return rs.why;
    var cls = rs.cls, lab = (cls.spec && cls.spec.lab) || shortWhy(rs.why);
    lab = lab.replace('{0}', cls.names[0] || '').replace('{1}', cls.names[1] || '').replace('{N}', cls.metres || '')
      .replace('{T}', cls.names[1] || 'trait');
    if (pic && pic.shape) {
      var s = pic.shape;
      if (s.type === 'measure') lab = (s.said ? s.said : s.m) + ' m ' + (rs.cls.spec.m === 'actor' ? 'cross' : 'to goal');
      if (s.type === 'pass') lab = lab + ', ' + s.m + ' m';
      if (s.type === 'wall') lab = 'the wall, ' + s.m + ' m';
    }
    if (rs.kind === 'tired') lab = 'z tired, stamina ' + rs.stamina;
    if (rs.kind === 'badge' && GLY[cls.spec.g]) lab = GLY[cls.spec.g] + ' ' + lab;
    return sgn(rs.n) + ' ' + lab;
  }
  /* a chip has room: the engine's own reason, whole ("+3 Simón can always get a hand to at least one shot in 4") */
  function chipOf(rs) {
    if (rs.kind === 'duel') return rs.why;
    var w = String(rs.why || '');
    return sgn(rs.n) + ' ' + w.charAt(0).toUpperCase() + w.slice(1);
  }
  function shortWhy(w) {
    var s = String(w || '');
    return s.length > 26 ? s.slice(0, 24).replace(/\s+\S*$/, '') + '…' : s;
  }
  /* green: good for you; red: good for them */
  function toneOf(rs) {
    if (rs.kind === 'duel') return 'n';
    var good = rs.side === 'you' ? rs.n > 0 : rs.n < 0;
    return good ? 'g' : 'r';
  }

  /* -------------------------------------------------------- the plan */
  var MAX = 3;
  var GLY = { star: '\u2605', card: '\u25AE', form: '\u25CF', seen: '\u25CE', down: '\u2193', behind: '\u21B6', run: '\u00BB', rule: '!' };
  /* shapes first by size of the bonus; the duel keeps its place when at most
   * two bonuses have one; the rest, and every reason with no place or not
   * true in the picture, go in the one chip */
  function plan(st, pend, o, scene, opts) {
    opts = opts || {};
    var max = T.max ? 9 : (opts.max || MAX);
    var c = ctxOf(st, pend, o, scene || {});
    c.preview = opts.preview || null;
    var rsn = reasons(st, pend, o);
    var cands = [], chipList = [];
    rsn.forEach(function (rs) {
      var pic = rs.cls.kind === 'chip' ? null : picture(c, rs);
      rs.tone = toneOf(rs);
      if (pic && pic.shape && T.trust) pic.ok = true;
      if (pic && pic.shape && pic.ok) { rs.pic = pic; rs.label = labelOf(rs, pic); cands.push(rs); }
      else {
        rs.untrue = !!(pic && pic.shape && !pic.ok); rs.untrueNote = pic && pic.note;
        rs.drawn = 'chip'; rs.label = chipOf(rs); chipList.push(rs);
      }
    });
    var duel = cands.filter(function (r) { return r.kind === 'duel'; })[0] || null;
    /* tired is part of the duel's own number: drawn as the duel's icon by
     * his dot, and said in the duel's label ("Pace 12 (\u22123 tired)") */
    var tired = cands.filter(function (r) { return r.kind === 'tired'; })[0] || null;
    if (tired && duel) {
      cands = cands.filter(function (r) { return r !== tired; });
      duel.tired = tired; tired.via = 'duel';
      duel.label = duel.why.replace(/^(\S+(?: \S+)*? \d+)( v )/, '$1 (' + sgn(tired.n) + ' tired)$2');
    }
    var rest = cands.filter(function (r) { return r !== duel; }).sort(function (a, b) { return Math.abs(b.n) - Math.abs(a.n); });
    var order = rest.slice(0, 1); if (duel) order.push(duel); order = order.concat(rest.slice(1));
    /* at most `max` pictures on the pitch; the rest join the chip line */
    var keep = max;
    if (order.length > keep) {
      order.slice(keep).forEach(function (rs) { rs.drawn = 'chip'; rs.overflow = true; rs.label = chipOf(rs); chipList.push(rs); if (rs.tired) { rs.tired.drawn = 'chip'; chipList.push(rs.tired); } });
      order = order.slice(0, keep);
    }
    order.forEach(function (rs) { rs.drawn = 'shape'; if (rs.tired) rs.tired.drawn = rs.tired.drawn || 'shape'; });
    rsn.forEach(function (rs) { if (rs.via === 'duel' && !rs.drawn) { rs.drawn = 'chip'; rs.label = chipOf(rs); chipList.push(rs); } });
    if (T.drop && order.length) { order[0].drawn = null; order = order.slice(1); }
    /* the labels, placed by tags.js: clear of every dot, the ball, the name tags and each other */
    var dots = c.men.map(function (m) { return { id: m.id, x: m.at.x, y: m.at.y }; });
    /* the ghosts drawn are dots too, so no label covers them */
    order.forEach(function (rs, i) { var s = rs.pic.shape; if (s.type === 'ghost') dots.push({ id: 'wg' + i, x: s.g.x, y: s.g.y }); });
    var fs = opts.fs || 1.9;
    function wOf(t) { return (opts.width ? opts.width(t) : String(t).length * fs * 0.56) + fs * 0.9; }
    /* one label per item, and the duel two: each man's number by his own dot */
    var want = [];
    order.forEach(function (rs, i) {
      if (rs.kind === 'duel') {
        var s0 = rs.pic.shape, o0 = c.o;
        var mt = attrName(o0.mineAttr || o0.attr) + ' ' + rs.mine + (rs.tired ? ' (' + sgn(rs.tired.n) + ' tired)' : '');
        var tt = attrName(o0.themAttr) + ' ' + rs.theirs;
        var gap = d2(s0.a, s0.b);
        if (gap < 12) {
          /* close together: one label beside the pair */
          var both = mt + ' v ' + tt;
          rs.labels = [both];
          want.push({ id: 'why' + i + 'a', text: both, at: { x: (s0.a.x + s0.b.x) / 2, y: (s0.a.y + s0.b.y) / 2 }, r0: Math.max(1.9, gap / 2 + 1.2), w: wOf(both), h: fs * 1.45 });
        } else {
          rs.labels = [mt, tt];
          want.push({ id: 'why' + i + 'a', text: mt, at: s0.a, r0: 1.9, w: wOf(mt), h: fs * 1.45 });
          want.push({ id: 'why' + i + 'b', text: tt, at: s0.b, r0: 1.9, w: wOf(tt), h: fs * 1.45 });
        }
      } else {
        rs.labels = [rs.label];
        want.push({ id: 'why' + i + 'a', text: rs.label, at: rs.pic.at, r0: rs.pic.r0, w: wOf(rs.label), h: fs * 1.45 });
      }
    });
    /* the chip is not on the pitch: a line of small pills above it (the page's
     * .whychips), so it never covers a man */
    var chip = chipList.length ? { lines: chipList.map(function (rs) { return rs.label; }), tones: chipList.map(function (rs) { return rs.tone; }),
      keys: chipList.map(function (rs) { return rs.key; }) } : null;
    var placed = TG.place({ dots: dots, want: want, r: opts.r || 1.3, fs: fs, ball: c.ball, lift: opts.lift || {}, avoid: opts.avoid || [],
      bounds: opts.bounds || { x0: 0.2, y0: 0.2, x1: 67.8, y1: 104.8 } });
    var byId = {}; placed.forEach(function (t) { byId[t.id] = t; });
    want.forEach(function (w) { if (byId[w.id]) byId[w.id].r0 = w.r0; });
    if (T.overlap && placed.length && dots.length) { var t0 = placed[0]; t0.x = dots[0].x - t0.w / 2; t0.y = dots[0].y - t0.h / 2; }
    var items = order.map(function (rs, i) {
      var labs = [byId['why' + i + 'a'], byId['why' + i + 'b']].filter(Boolean);
      var s = rs.pic.shape;
      if (T.anchor && i === 0) { s = JSON.parse(JSON.stringify(s)); shiftShape(s, 9); }
      return { key: rs.key, kind: rs.kind, tone: rs.tone, n: rs.n, why: rs.why, labels: labs, shape: s, men: rs.pic.men, text: rs.labels.join(' v '),
        tired: rs.tired ? { key: rs.tired.key, n: rs.tired.n, at: rs.pic.shape.a } : null };
    });
    if (T.twice && items.length) items.push(items[0]);
    return { reasons: rsn, items: items, chip: chip, dots: dots };
  }
  function shiftShape(s, d) {
    ['a', 'b', 'c', 'g', 'to', 'at', 't', 'man', 'def', 'd'].forEach(function (k) { if (s[k] && typeof s[k].x === 'number') s[k] = { x: s[k].x + d, y: s[k].y }; });
    ['pts', 'from'].forEach(function (k) { if (s[k]) s[k] = s[k].map(function (q) { return { x: q.x + d, y: q.y }; }); });
    if (typeof s.y === 'number') s.y += d;
  }

  /* -------------------------------------------------------- names on the cards */
  /* every man a live card names: its actor, the man he is up against, the
   * man he passes to, and every first name in its words and its reasons */
  function namedOnCards(st, pend) {
    var ids = [], seen = {};
    function add(p) { if (p && p.id && !seen[p.id] && P.onPitch(st, p)) { seen[p.id] = 1; ids.push(p.id); } }
    var ros = P.roster(st);
    (pend.moment.options || []).forEach(function (o) {
      if (o.disabled) return;
      add(o.actor); add(o.foil); add(o.to || o.receiver || o.mate);
      var txt = [o.label].concat((o.mods || []).map(function (m) { return m.why; }), (o.theirMods || []).map(function (m) { return m.why; })).join(' ');
      ros.forEach(function (r) {
        var fn = first(r.p);
        if (fn.length < 2) return;
        if (new RegExp('(^|[^\\p{L}])' + fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}])', 'u').test(txt)) add(r.p);
      });
    });
    return T.noTag ? [] : ids;
  }

  var API = { tamper: T, RULES: RULES, classify: classify, reasons: reasons, plan: plan, namedOnCards: namedOnCards, MAX: MAX, attrName: attrName };
  root.KMWhy = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
