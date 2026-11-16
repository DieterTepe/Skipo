#!/usr/bin/env node
// ================================================================
//  tune-sim.js  –  Skipo   STÄRKE-PRÜFSTAND (nur Node, nicht im Spiel)
// ----------------------------------------------------------------
//  KI gegen KI. Zwei Seiten A und B spielen dieselben Kartenver-
//  teilungen (Seed) je zweimal mit getauschten Sitzen. So heben sich
//  Kartenglück und Anfangsvorteil auf; übrig bleibt die Stärke.
//
//  Jede Seite = Stufe/Planung (wie in den Einstellungen) + Änderungen.
//  Standard für beide: hard/super. Änderungen gelten für B; mit dem
//  Vorsatz „A:" für A.
//      S:KEY=WERT   Wert der Stufe          (KI_STUFEN[stufe].KEY)
//      P:KEY=WERT   Wert des Planers        (KI_PLANNER.KEY)
//      K:KEY=WERT   Wert der Zugbewertung   (KONFIG.KEY)
//
//  Aufruf:
//    node tune-sim.js --games=500                       Kontrolle A = B → exakt 50 %
//    node tune-sim.js --games=2000 S:AVOID_DIST=4       Schwer mit Abstand 4 gegen Schwer
//    node tune-sim.js --games=2000 --a=medium/super     Schwer gegen Mittel
//    node tune-sim.js --games=2000 --b=hard/normal      Planung Normal gegen Superstark
//    node tune-sim.js --games=2000 K:SCORE_15=200 A:P:MAX_NODES=20000
//    node tune-sim.js --games=1000 --bot                B gegen den einfachen Bot
//    node tune-sim.js --games=300 --sweep [--from=N] [--only=KEY,KEY]
//                                                       jeden KONFIG-Wert ×0 / ×0.5 / ×2
//    Zusätze: --seed=N  --label=TEXT  --save (Ergebnis an tune-results.jsonl anhängen)
//
//  Ausgabe: Siegrate von B mit 95-%-Bereich, Stockdifferenz, Züge.
//  ▲ = B klar stärker, ▼ = B klar schwächer, · = kein klarer Unterschied.
//  Übernahmeregel: ≥ 2000 Paare, > 53 %, mit zweitem Seed bestätigt.
//
//  Trick: Die KI spielt im Code immer als 'ai' gegen 'human'. Für den
//  Sitz „human" werden vor dem Zug die Spielerobjekte und die Ablage-
//  Historie getauscht, die Einstellungen der Seite gesetzt, dann
//  AI.takeTurn(), danach zurückgetauscht. Kein Spielcode wird verändert.
// ================================================================

const fs   = require('fs');
const path = require('path');
const { makeEngine } = require('./test-sim.js');

const DIR  = __dirname;
const args = process.argv.slice(2);
const opt  = (name, def) => { const a = args.find(x => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : def; };
const GAMES = parseInt(opt('games', '200'), 10);
const SEED  = parseInt(opt('seed', '1'), 10);
const OUT   = opt('out', path.join(DIR, 'tune-results.jsonl'));

// ── Engine laden (dieselben Skripte wie das Spiel) und Messrahmen einhängen ──
function makeTuner() {
  const eng = makeEngine(DIR);
  eng.run(`
    globalThis.__base = { konfig: { ...KONFIG }, planner: { ...KI_PLANNER },
                          stufen: JSON.parse(JSON.stringify(KI_STUFEN)) };
    globalThis.__moves = 0;
    Events.on('move:build', () => __moves++);
    function swap() {
      const g = State.game;
      [g.players.human, g.players.ai] = [g.players.ai, g.players.human];
      [g.history.human, g.history.ai] = [g.history.ai, g.history.human];
    }
    /** Einstellungen einer Seite setzen: erst alles auf Ausgangswerte, dann ihre Änderungen. */
    function useSide(side) {
      Object.assign(KONFIG, __base.konfig, side.konfig);
      Object.assign(KI_PLANNER, __base.planner, side.planner);
      for (const l of Object.keys(__base.stufen)) KI_STUFEN[l] = __base.stufen[l] && { ...__base.stufen[l] };
      if (KI_STUFEN[side.level]) Object.assign(KI_STUFEN[side.level], side.stufe);
      Settings.level    = side.level;
      Settings.planning = side.planning;
    }
    // Einfacher Bot (wie der Mensch-Bot in test-sim.js) für den Sitz 'human'
    function botTurn() {
      const me = State.game.players.human;
      for (let guard = 0; guard < 80; guard++) {
        if (Rules.winner()) return;
        let moved = false;
        const st = me.stock.slice(-1)[0];
        if (st) for (let p = 0; p < 4 && !moved; p++) if (Rules.isValidBuild(st, p)) moved = Rules.playToBuild('human', 'stock', 0, p);
        for (let d = 0; d < 4 && !moved; d++) { const t = me.discards[d].slice(-1)[0]; if (!t) continue; for (let p = 0; p < 4 && !moved; p++) if (Rules.isValidBuild(t, p)) moved = Rules.playToBuild('human', 'discard', d, p); }
        for (let h = 0; h < me.hand.length && !moved; h++) for (let p = 0; p < 4 && !moved; p++) if (Rules.isValidBuild(me.hand[h], p)) { moved = Rules.playToBuild('human', 'hand', h, p); if (moved && me.hand.length === 0) Rules.drawToFive('human'); }
        if (!moved) break;
      }
      if (Rules.winner() || me.hand.length === 0) return;
      let best = 0;
      for (let h = 1; h < me.hand.length; h++) if ((me.hand[h].type === 'joker' ? 0 : me.hand[h].value) > (me.hand[best].type === 'joker' ? 0 : me.hand[best].value)) best = h;
      let pile = 0, len = 1e9;
      for (let i = 0; i < 4; i++) { const l = me.discards[i].length; if (l < len) { len = l; pile = i; } }
      Rules.playToDiscard('human', 'hand', best, pile);
    }
    /**
     * Ein Spiel: Sitz 'human' spielt sideH (oder Bot), Sitz 'ai' spielt sideA. 'human' beginnt.
     * @returns { winner: 'human'|'ai'|'draw', margin: Stockdifferenz aus Sicht von 'ai', turns }
     */
    globalThis.__play = async function (seed, sideH, sideA, botH, botA) {
      Rules.random = (function (s) { let a = s >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })(seed);
      __log.length = 0;                       // Zugprotokoll des Regel-Prüfstands nicht anwachsen lassen
      Rules.newGame();
      let turns = 0, stale = 0;
      while (!Rules.winner() && turns < 300) {
        turns++;
        const before = __moves;
        // Sitz human (beginnt)
        if (botH) { botTurn(); }
        else { swap(); useSide(sideH); await AI.takeTurn(); swap(); }
        if (Rules.winner()) break;
        Rules.drawToFive('human');
        // Sitz ai
        if (botA) { swap(); botTurn(); swap(); Rules.drawToFive('ai'); }
        else { useSide(sideA); await AI.takeTurn(); }
        // festgefahren: keiner baut, beide Hände leer, Nachziehstapel leer
        const g = State.game;
        if (__moves === before && g.players.human.hand.length === 0 && g.players.ai.hand.length === 0 && g.drawPile.length === 0) { if (++stale >= 2) break; } else stale = 0;
      }
      const w = Rules.winner();
      const h = State.game.players.human.stock.length, a = State.game.players.ai.stock.length;
      return { winner: w ? w.winner : (h === a ? 'draw' : (a < h ? 'ai' : 'human')), margin: h - a, turns };
    };
  `);
  return { play: eng.run('__play'), base: JSON.parse(eng.run('JSON.stringify(__base)')), page: eng.page };
}

// ── Seiten aus den Argumenten bauen ──
function parseValue(v) {
  return v === 'true' ? true : v === 'false' ? false : v === 'null' ? null : isNaN(Number(v)) ? v : Number(v);
}
function makeSide(spec, sets, base) {
  const [level, planning] = String(spec).split('/');
  if (!(level in base.stufen)) throw new Error('Unbekannte Stufe: ' + level + ' (easy | medium | hard)');
  if (!['super', 'normal'].includes(planning)) throw new Error('Unbekannte Planung: ' + planning + ' (super | normal)');
  const side = { level, planning, stufe: {}, planner: {}, konfig: {} };
  for (const s of sets) {
    const m = s.match(/^([SPK]):([A-Za-z_0-9]+)=(.+)$/);
    const target = { S: 'stufe', P: 'planner', K: 'konfig' }[m[1]];
    const known  = { S: base.stufen[level] || {}, P: base.planner, K: base.konfig }[m[1]];
    if (!(m[2] in known)) throw new Error(`Unbekannter Schlüssel ${m[1]}:${m[2]}` + (m[1] === 'S' && !base.stufen[level] ? ` (Stufe ${level} hat keine Werte)` : ''));
    side[target][m[2]] = parseValue(m[3]);
  }
  return side;
}
const describe = s => `${s.level}/${s.planning}` + [['S', s.stufe], ['P', s.planner], ['K', s.konfig]]
  .flatMap(([p, o]) => Object.entries(o).map(([k, v]) => ` ${p}:${k}=${v}`)).join('');

/** Match: GAMES Paare (Seed, Sitze getauscht). @returns Statistik aus Sicht von B */
async function match(play, sideA, sideB, games, seed, useBot, label) {
  const t0 = Date.now();
  let bWins = 0, draws = 0, margin = 0, turns = 0, played = 0;
  for (let g = 0; g < games; g++) {
    const s = seed * 1000003 + g;
    // Spiel 1: B auf Sitz 'human' (beginnt), A auf 'ai'
    const r1 = await play(s, sideB, sideA, false, useBot);
    if (r1.winner === 'human') bWins++; else if (r1.winner === 'draw') draws++;
    margin += r1.margin; turns += r1.turns; played++;
    // Spiel 2: A auf 'human' (oder Bot), B auf 'ai'
    const r2 = await play(s, sideA, sideB, useBot, false);
    if (r2.winner === 'ai') bWins++; else if (r2.winner === 'draw') draws++;
    margin -= r2.margin; turns += r2.turns; played++;
  }
  const p  = bWins / played;
  const ci = 1.96 * Math.sqrt(p * (1 - p) / played);
  return { label, games: played, winB: +(p * 100).toFixed(1), ci: +(ci * 100).toFixed(1),
           draws, marginB: +(-margin / played).toFixed(2), turns: +(turns / played).toFixed(1),
           sec: +((Date.now() - t0) / 1000).toFixed(1) };
}

function fmt(r) {
  const sig = r.winB - r.ci > 50 ? '▲' : r.winB + r.ci < 50 ? '▼' : '·';
  return `${sig} ${String(r.label).padEnd(44)} B: ${String(r.winB).padStart(5)} % ±${String(r.ci).padStart(4)}  Stock ${String(r.marginB).padStart(6)}  Züge ${r.turns}  (${r.games} Sp., ${r.sec}s)`;
}

(async function main() {
  const { play, base, page } = makeTuner();
  const useBot = args.includes('--bot');
  const sets   = args.filter(a => /^(A:)?[SPK]:[A-Za-z_0-9]+=/.test(a));
  const sideA  = makeSide(opt('a', 'hard/super'), sets.filter(a => a.startsWith('A:')).map(a => a.slice(2)), base);
  const sideB  = makeSide(opt('b', 'hard/super'), sets.filter(a => !a.startsWith('A:')), base);

  if (args.includes('--sweep')) {
    const from = parseInt(opt('from', '0'), 10);
    const only = opt('only') ? opt('only').split(',') : null;
    const keys = Object.keys(base.konfig).filter(k => only ? only.includes(k) : true);
    const done = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l).label) : [];
    console.log(`Sweep (${page}): ${keys.length} Schlüssel, ${GAMES} Paare je Variante, Seed ${SEED}, Seiten ${describe(sideA)}`);
    for (let i = from; i < keys.length; i++) {
      const k = keys[i], v = base.konfig[k];
      const variants = typeof v === 'boolean' ? [[!v, String(!v)]]
                     : typeof v === 'number' ? (v === 0 ? [[1, '=1'], [10, '=10'], [100, '=100']] : [[0, '×0'], [v * 0.5, '×0.5'], [v * 2, '×2']])
                     : [];
      for (const [nv, tag] of variants) {
        const label = `${k} ${tag}`;
        if (done.includes(label)) continue;
        const b = { ...sideA, konfig: { ...sideA.konfig, [k]: nv } };
        const r = await match(play, sideA, b, GAMES, SEED, useBot, label);
        r.key = k; r.value = nv; r.base = v;
        console.log(`[${i + 1}/${keys.length}] ` + fmt(r));
        fs.appendFileSync(OUT, JSON.stringify(r) + '\n');
      }
    }
    return;
  }

  const same  = JSON.stringify(sideA) === JSON.stringify(sideB);
  const label = opt('label', useBot ? 'B gegen Bot' : (same ? 'Kontrolle A = B' : 'B gegen A'));
  console.log(`${page} – ${GAMES} Paare, Seed ${SEED}`);
  console.log(`  A: ${useBot ? 'einfacher Bot' : describe(sideA)}\n  B: ${describe(sideB)}`);
  const r = await match(play, sideA, sideB, GAMES, SEED, useBot, label);
  console.log(fmt(r));
  if (args.includes('--save')) fs.appendFileSync(OUT, JSON.stringify(r) + '\n');
})().catch(e => { console.error('Abbruch:', e.message || e); process.exit(2); });
