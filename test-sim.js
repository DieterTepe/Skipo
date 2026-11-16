#!/usr/bin/env node
// ================================================================
//  test-sim.js  –  Skipo   REGEL-PRÜFSTAND (nur Node, nicht im Spiel)
// ----------------------------------------------------------------
//  Aufruf:   node test-sim.js [Spiele] [Seed] [--ref=ORDNER]
//                             [--stufe=easy|medium|hard] [--planung=super|normal]
//  Beispiel: node test-sim.js 300 7 --ref=../skipo-ref
//
//  Was passiert:
//    1. Die Spieldateien werden in einer Node-Sandbox OHNE document /
//       window / localStorage geladen – und zwar genau die Skripte in
//       genau der Reihenfolge, die in der aktuellen SkipBo_*.html steht
//       (ohne ui-*.js und app.js). Jeder DOM-Zugriff in core/ai/flow/
//       tracking ist damit ein sofortiger Fehler.
//    2. Ein deterministischer „Mensch-Bot" spielt gegen die KI. Der
//       Zufall (nur das Mischen) kommt aus einem Seed-Generator.
//    3. Für jede Kombination aus Schwierigkeit (Leicht/Mittel/Schwer)
//       und KI-Planung (Superstark/Normal) – ohne Angabe alle sechs:
//       Invarianten je Zug: 156 Karten, Baustapel aufsteigend, Hand ≤ 5,
//       KI legt höchstens EINE Karte je Zug ab, Spiel endet.
//    4. Mit --ref=ORDNER: Dieselben Spiele laufen zusätzlich mit dem
//       Stand in ORDNER (eine ältere Version als Maßstab). Die Zugfolgen
//       werden Zug für Zug verglichen. So wird bewiesen, dass ein Umbau
//       das Spiel nicht verändert hat.
//       Maßstab erzeugen:  git worktree add ../skipo-ref stand-7.0.4
//
//  Rückgabewert 0 = alles in Ordnung, 1 = Fehler (für Skripte).
// ================================================================

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const args  = process.argv.slice(2);
const nums  = args.filter(a => /^\d+$/.test(a));
const opt   = name => (args.find(a => a.startsWith('--' + name + '=')) || '').slice(name.length + 3);
const GAMES = parseInt(nums[0] || '100', 10);
const SEED  = parseInt(nums[1] || '1', 10);
const DIR   = __dirname;
const REF   = opt('ref') ? path.resolve(opt('ref')) : null;
const LEVELS    = opt('stufe')   ? [opt('stufe')]   : ['easy', 'medium', 'hard'];
const PLANNINGS = opt('planung') ? [opt('planung')] : ['super', 'normal'];

// ── Seed-Zufall (mulberry32) ──
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tick = () => new Promise(r => setImmediate(r));
async function waitFor(fn, maxTicks = 200000) {
  for (let i = 0; i < maxTicks; i++) { if (fn()) return true; await tick(); }
  return false;
}

/** Skriptliste aus der aktuellen Startseite lesen (höchste Version, keine Weiterleitung). */
function scriptList(dir) {
  const pages = fs.readdirSync(dir).filter(f => /^SkipBo_\d+_\d+_\d+\.html$/.test(f))
    .map(f => ({ f, v: f.match(/\d+/g).map(Number), html: fs.readFileSync(path.join(dir, f), 'utf8') }))
    .filter(p => !/http-equiv="refresh"/.test(p.html) && /<script\s+src=/.test(p.html))
    .sort((a, b) => (b.v[0] - a.v[0]) || (b.v[1] - a.v[1]) || (b.v[2] - a.v[2]));
  if (!pages.length) throw new Error('Keine Startseite SkipBo_x_y_z.html mit Skripten in ' + dir);
  const files = [...pages[0].html.matchAll(/<script\s+src="[^"]*\/([A-Za-z0-9_.-]+\.js)(?:\?[^"]*)?"/g)].map(m => m[1])
    .filter(f => !/^ui-/.test(f) && f !== 'app.js');
  return { page: pages[0].f, files };
}

/** Spiel-Engine aus einem Ordner laden (Sandbox ohne DOM). */
function makeEngine(dir) {
  const warnings = [];
  const sandbox = {
    console: { log() {}, info() {}, warn: (...a) => warnings.push(a.join(' ')), error: (...a) => warnings.push('ERR ' + a.join(' ')) },
    setTimeout, clearTimeout, setImmediate, Date, JSON, Math
  };
  const ctx = vm.createContext(sandbox);
  const { page, files } = scriptList(dir);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  vm.runInContext(`
    Settings.load(); I18n.init(); Tracking.init();
    Clock.pause = () => Promise.resolve();
    globalThis.__log = [];
    globalThis.__humanReady = false;
    Events.on('move:build',   d => __log.push(d.player + ':' + d.source + ':' + (d.card.type === 'joker' ? 'J' : d.card.value) + '>B' + d.pile));
    Events.on('move:discard', d => __log.push(d.player + ':' + d.source + ':' + (d.card.type === 'joker' ? 'J' : d.card.value) + '>D' + d.pile));
    Events.on('pile:cleared', d => __log.push('CLEAR' + d.pile));
    Events.on('turn:change',  d => { if (d.player === 'human') __humanReady = true; });
    globalThis.__api = {
      setup(level, planning) { Settings.level = level; Settings.planning = planning; },
      start(rng)      { Rules.random = rng; return Flow.startGame(); },
      over()          { return State.turn.over; },
      result()        { return State.turn.result; },
      hand()          { return State.game.players.human.hand; },
      stockTop()      { const s = State.game.players.human.stock; return s[s.length - 1] || null; },
      discardTop(i)   { const d = State.game.players.human.discards[i]; return d[d.length - 1] || null; },
      isValid(c, p)   { return Rules.isValidBuild(c, p); },
      build(s, i, p)  { return Flow.humanBuild(s, i, p); },
      discard(i, p)   { return Flow.humanDiscard('hand', i, p); },
      humanTurn()     { return State.turn.player === 'human'; },
      game()          { return State.game; },
      check() {
        const g = State.game;
        let total = g.drawPile.length + g.deck.length;
        g.buildPiles.forEach(p => total += p.length);
        for (const pl of ['human', 'ai']) {
          const P = g.players[pl];
          total += P.hand.length + P.stock.length;
          P.discards.forEach(d => total += d.length);
          if (P.hand.length > 5) return 'Hand > 5 (' + pl + ')';
        }
        if (total !== 156) return 'Kartenzahl ' + total + ' statt 156';
        for (let i = 0; i < 4; i++) {
          const pile = g.buildPiles[i];
          for (let k = 0; k < pile.length; k++) {
            const v = pile[k].type === 'joker' ? k + 1 : pile[k].value;
            if (v !== k + 1) return 'Baustapel ' + i + ' nicht aufsteigend an Position ' + k;
          }
          if (pile.length >= 12) return 'Baustapel ' + i + ' nicht geleert';
        }
        return null;
      }
    };
  `, ctx, { filename: 'pruefstand' });
  return { dir, page, files, api: ctx.__api, log: () => ctx.__log, warnings, run: code => vm.runInContext(code, ctx),
           ready: () => ctx.__humanReady, resetReady: () => { ctx.__humanReady = false; } };
}

// ================================================================
// MENSCH-BOT (deterministisch)
// ================================================================
function humanPlay(api) {
  // Bauzüge in fester Priorität: Stock → Ablage → Hand, jeweils erster gültiger Stapel
  for (let guard = 0; guard < 80; guard++) {
    if (api.over()) return 'over';
    let moved = false;
    const st = api.stockTop();
    if (st) {
      for (let p = 0; p < 4 && !moved; p++) if (api.isValid(st, p)) moved = api.build('stock', 0, p);
    }
    for (let d = 0; d < 4 && !moved; d++) {
      const top = api.discardTop(d);
      if (!top) continue;
      for (let p = 0; p < 4 && !moved; p++) if (api.isValid(top, p)) moved = api.build('discard', d, p);
    }
    const hand = api.hand();
    for (let h = 0; h < hand.length && !moved; h++) {
      for (let p = 0; p < 4 && !moved; p++) if (api.isValid(hand[h], p)) moved = api.build('hand', h, p);
    }
    if (!moved) break;
  }
  if (api.over()) return 'over';
  if (!api.humanTurn()) return 'switched';       // Auto-Pass bei leerer Hand
  const hand = api.hand();
  if (hand.length === 0) return 'pass';
  // Ablage: höchste Zahlenkarte (Joker = 0) auf den kleinsten Ablagestapel
  let best = 0;
  for (let h = 1; h < hand.length; h++) {
    const v  = hand[h].type === 'joker' ? 0 : hand[h].value;
    const bv = hand[best].type === 'joker' ? 0 : hand[best].value;
    if (v > bv) best = h;
  }
  let pile = 0, len = Infinity;
  const g = api.game();
  for (let i = 0; i < 4; i++) {
    const l = g.players.human.discards[i].length;
    if (l < len) { len = l; pile = i; }
  }
  return api.discard(best, pile) ? 'discarded' : 'failed';
}

// ================================================================
// EIN SPIEL SPIELEN
// ================================================================
async function playGame(engine, seed, checkRules) {
  const rng = mulberry32(seed);
  engine.log().length = 0;
  engine.resetReady();
  await engine.api.start(rng);
  await tick();
  let turns = 0;
  let invariant = null;

  while (!engine.api.over() && turns < 400) {
    turns++;
    if (checkRules) { invariant = engine.api.check(); if (invariant) break; }
    engine.resetReady();
    const mark = engine.log().length;
    const r = humanPlay(engine.api);
    if (r === 'over') break;
    if (r === 'failed') { invariant = 'Ablage fehlgeschlagen'; break; }
    // auf die KI warten: bis der Mensch wieder dran ist oder das Spiel vorbei ist
    await waitFor(() => engine.api.over() || engine.ready());
    await tick(); await tick();
    if (checkRules) {
      const n = engine.log().slice(mark).filter(e => e.startsWith('ai:') && e.includes('>D')).length;
      if (n > 1) { invariant = 'KI legt ' + n + ' Karten in einem Zug ab'; break; }
    }
  }
  if (checkRules && !invariant) invariant = engine.api.check();
  return { turns, result: engine.api.result(), log: engine.log().slice(), invariant, stuck: turns >= 400 };
}

// ================================================================
// HAUPTPROGRAMM
// ================================================================
async function main() {
  const t0 = Date.now();
  const engNew = makeEngine(DIR);
  const engRef = REF ? makeEngine(REF) : null;
  console.log(`Skipo Regel-Prüfstand – ${GAMES} Spiele je Kombination, Seed ${SEED}`);
  console.log(`  geprüft:  ${engNew.page} (${engNew.files.length} Skripte)`);
  if (engRef) console.log(`  Maßstab:  ${engRef.page} in ${REF} (${engRef.files.length} Skripte)`);

  let errors = 0, diffsTotal = 0;
  const samples = [];
  for (const level of LEVELS) {
    for (const planning of PLANNINGS) {
      engNew.api.setup(level, planning);
      if (engRef) engRef.api.setup(level, planning);
      let aiWins = 0, humanWins = 0, moves = 0, stuck = 0, bad = 0, diffs = 0;
      for (let g = 0; g < GAMES; g++) {
        const seed = SEED * 1000003 + g;
        const rNew = await playGame(engNew, seed, true);
        if (rNew.invariant) { bad++; if (bad <= 3) console.log(`  ❌ ${level}/${planning} Spiel ${g}: ${rNew.invariant}`); }
        if (rNew.stuck) stuck++;
        if (rNew.result) { if (rNew.result.winner === 'ai') aiWins++; else humanWins++; }
        moves += rNew.log.length;

        if (engRef) {
          const rRef = await playGame(engRef, seed, false);
          const a = rNew.log, b = rRef.log;
          let firstDiff = -1;
          const n = Math.max(a.length, b.length);
          for (let i = 0; i < n; i++) if (a[i] !== b[i]) { firstDiff = i; break; }
          const same = JSON.stringify(rNew.result && { w: rNew.result.winner, p: rNew.result.points })
                   === JSON.stringify(rRef.result && { w: rRef.result.winner, p: rRef.result.points });
          if (firstDiff >= 0 || !same) {
            diffs++;
            if (samples.length < 4) samples.push({ level, planning, g, seed, firstDiff,
              neu: a.slice(Math.max(0, firstDiff - 3), firstDiff + 4), ref: b.slice(Math.max(0, firstDiff - 3), firstDiff + 4) });
          }
        }
      }
      errors += bad + stuck; diffsTotal += diffs;
      const cmp = engRef ? (diffs === 0 ? '  ✅ Zug für Zug gleich' : `  ❌ ${diffs} Spiele weichen ab`) : '';
      console.log(`  ${(level + '/' + planning).padEnd(14)} Züge ${String(moves).padStart(6)}  KI-Siege ${String(aiWins).padStart(4)}  Bot ${String(humanWins).padStart(4)}` +
                  `  Regelfehler ${bad}  festgefahren ${stuck}${cmp}`);
    }
  }
  for (const d of samples) {
    console.log(`  Abweichung ${d.level}/${d.planning} Spiel ${d.g} (Seed ${d.seed}) bei Zug ${d.firstDiff}`);
    console.log(`    geprüft: ${d.neu.join('  ')}`);
    console.log(`    Maßstab: ${d.ref.join('  ')}`);
  }
  const warn = engNew.warnings.length;
  console.log('─'.repeat(72));
  console.log(`Dauer ${((Date.now() - t0) / 1000).toFixed(1)}s   Regelfehler/festgefahren: ${errors}` +
              (engRef ? `   Abweichungen zum Maßstab: ${diffsTotal}` : '') +
              (warn ? `   Warnungen: ${warn} (z. B. "${engNew.warnings[0]}")` : ''));
  console.log(errors || diffsTotal ? '❌ FEHLER' : '✅ alles in Ordnung');
  process.exit(errors || diffsTotal ? 1 : 0);
}

// Direkt gestartet → Prüfung laufen lassen; per require() → Bausteine für eigene Auswertungen
if (require.main === module) main().catch(e => { console.error('Prüfstand abgebrochen:', e); process.exit(2); });
else module.exports = { makeEngine, playGame, humanPlay, mulberry32, scriptList };
