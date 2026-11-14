#!/usr/bin/env node
// ================================================================
//  test-sim.js  –  Skipo 7.0.1   PRÜFSTAND (nur Node, nicht im Spiel)
// ----------------------------------------------------------------
//  Aufruf:   node test-sim.js [Spiele] [Seed] [--old=ORDNER] [--new-only] [--taktik]
//            --taktik: Blockade-Taktik (ki-taktik.js) eingeschaltet lassen – dann ist
//            keine Äquivalenz zu 7.0.0 zu erwarten (nur mit --new-only sinnvoll).
//  Beispiel: node test-sim.js 300 42
//
//  Was passiert:
//    1. Die neuen Dateien (core-*, ai-*, core-flow, tracking) werden
//       in einer Node-Sandbox OHNE document/window/localStorage
//       geladen. Jeder DOM-Zugriff = sofortiger Fehler.
//    2. Ein deterministischer „Mensch-Bot" spielt gegen die KI.
//       Der Zufall (nur Mischen) kommt aus einem Seed-Generator.
//    3. Invarianten je Zug: 156 Karten, Baustapel aufsteigend, KI legt höchstens 1× ab,
//       Hand ≤ 5, Stock nur von oben.
//    4. Äquivalenz: Dieselben Spiele laufen mit demselben Seed durch
//       die 7.0.0-Engine (state/engine/ai/view/endgame.js mit
//       DOM-Attrappe). Die Zugfolgen werden Zug für Zug verglichen.
//       Bekannte 7.0.0-Eigenheit: nach dem Siegzug der KI spielte
//       7.0.0 noch Karten weiter (Siegprüfung kam erst später).
//       Deshalb wird jede Zugfolge nach dem Zug abgeschnitten, mit
//       dem ein Stock leer wurde.
//
//  Ergebnis: Zusammenfassung + Exit-Code 0 (alles gleich) / 1 (Abweichung)
// ================================================================

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const args    = process.argv.slice(2);
const GAMES   = parseInt(args.find(a => /^\d+$/.test(a)) || '100', 10);
const SEED    = parseInt(args.filter(a => /^\d+$/.test(a))[1] || '1', 10);
const NEWONLY = args.includes('--new-only');
const OLDDIR  = (args.find(a => a.startsWith('--old=')) || '').slice(6) || __dirname;
const DIR     = __dirname;

const TAKTIK  = args.includes('--taktik');       // Blockade-Taktik (7.0.2) eingeschaltet lassen
const NEW_FILES = ['konfig.js', 'ki-planner.js', 'ki-taktik.js', 'core-events.js', 'core-store.js', 'core-settings.js',
                   'core-i18n.js', 'core-state.js', 'core-rules.js', 'ai-turn.js', 'ai-planner.js',
                   'ai-eval.js', 'ai-analysis.js', 'core-flow.js', 'tracking.js'];
const OLD_FILES = ['konfig.js', 'ki-planner.js', 'state.js', 'engine.js', 'view.js', 'ai.js', 'endgame.js'];

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

const quietConsole = () => {
  const warnings = [];
  return {
    obj: { log() {}, warn: (...a) => warnings.push(a.join(' ')), error: (...a) => warnings.push('ERR ' + a.join(' ')), info() {} },
    warnings
  };
};

function loadInto(ctx, dir, files) {
  for (const f of files) {
    const code = fs.readFileSync(path.join(dir, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
}

// ================================================================
// NEUE ENGINE (7.0.1) – Sandbox ohne DOM
// ================================================================
function makeNew() {
  const qc = quietConsole();
  const sandbox = { console: qc.obj, setTimeout, clearTimeout, setImmediate, Date, JSON, Math };
  const ctx = vm.createContext(sandbox);
  loadInto(ctx, DIR, NEW_FILES.filter(f => f !== 'ki-taktik.js' || fs.existsSync(path.join(DIR, f))));
  vm.runInContext(`
    Settings.load(); I18n.init(); Tracking.init();
    Clock.pause = () => Promise.resolve();
    if (typeof KI_TAKTIK !== 'undefined') KI_TAKTIK.ENABLED = ${TAKTIK};
    globalThis.__log = [];
    globalThis.__humanReady = false;
    Events.on('move:build',   d => __log.push(d.player + ':' + d.source + ':' + (d.card.type === 'joker' ? 'J' : d.card.value) + '>B' + d.pile));
    Events.on('move:discard', d => __log.push(d.player + ':' + d.source + ':' + (d.card.type === 'joker' ? 'J' : d.card.value) + '>D' + d.pile));
    Events.on('pile:cleared', d => __log.push('CLEAR' + d.pile));
    Events.on('turn:change',  d => { if (d.player === 'human') __humanReady = true; });
    globalThis.__api = {
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
  `, ctx, { filename: 'harness-new' });
  return { ctx, api: ctx.__api, log: () => ctx.__log, warnings: qc.warnings,
           ready: () => ctx.__humanReady, resetReady: () => { ctx.__humanReady = false; } };
}

// ================================================================
// ALTE ENGINE (7.0.0) – Sandbox mit DOM-Attrappe
// ================================================================
function makeOld() {
  const qc = quietConsole();
  const fakeEl = () => ({
    style: { setProperty() {} }, innerHTML: '', textContent: '', className: '', dataset: {}, offsetHeight: 0, children: [], parentElement: null,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, removeChild() {}, addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0 }; }, remove() {}
  });
  const storage = new Map([['skipbo-name-set', '1']]);
  const sandbox = {
    console: qc.obj, setTimeout, clearTimeout, setImmediate, Date, JSON, Math,
    document: {
      addEventListener() {}, getElementById: () => fakeEl(), querySelector: () => null,
      querySelectorAll: () => [], createElement: () => fakeEl(), body: fakeEl(), head: fakeEl(), documentElement: fakeEl()
    },
    window: { addEventListener() {}, getComputedStyle: () => ({ top: '0' }), open() {}, scrollX: 0, scrollY: 0 },
    localStorage: {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k)
    },
    location: { reload() {} },
    confirm: () => false
  };
  const ctx = vm.createContext(sandbox);
  loadInto(ctx, OLDDIR, OLD_FILES);
  vm.runInContext(`
    pauseForSeconds = () => Promise.resolve();
    globalThis.__log = [];
    globalThis.__humanReady = false;
    const __origBuild = handleBuildPileDrop;
    handleBuildPileDrop = function (player, src, idx, pile) {
      const card = src === 'hand' ? Game.players[player].hand[idx]
                 : src === 'stock' ? Game.players[player].stock.slice(-1)[0]
                 : (Game.players[player].discards[idx] || []).slice(-1)[0];
      const at = __log.length;
      const ok = __origBuild(player, src, idx, pile);
      if (ok) __log.splice(at, 0, player + ':' + src + ':' + (card.type === 'joker' ? 'J' : card.value) + '>B' + pile);
      return ok;
    };
    const __origDiscard = handleDiscardPileDrop;
    handleDiscardPileDrop = function (player, src, idx, pile) {
      const card = src === 'hand' ? Game.players[player].hand[idx] : null;
      const ok = __origDiscard(player, src, idx, pile);
      if (ok) __log.push(player + ':' + src + ':' + (card.type === 'joker' ? 'J' : card.value) + '>D' + pile);
      return ok;
    };
    const __origClear = clearBuildPile;
    clearBuildPile = function (i) { const was = Game.buildPiles[i].length; __origClear(i); if (Game.buildPiles[i].length === 0 && was > 0) __log.push('CLEAR' + i); };
    const __origDraw = drawCardsUntilFive;
    drawCardsUntilFive = function (p) { __origDraw(p); if (p === 'human' && currentPlayer === 'human') __humanReady = true; };
    globalThis.__api = {
      async start(rng) { Math.random = rng; await initGame(); },
      over()          { return isGameOver; },
      result() {
        if (!isGameOver) return null;
        const h = Game.players.human.stock.length, a = Game.players.ai.stock.length;
        return h === 0 ? { winner: 'human', points: a * 5 } : { winner: 'ai', points: h * 5 };
      },
      hand()          { return Game.players.human.hand; },
      stockTop()      { const s = Game.players.human.stock; return s[s.length - 1] || null; },
      discardTop(i)   { const d = Game.players.human.discards[i]; return d[d.length - 1] || null; },
      isValid(c, p)   { return isValidBuildMove(c, p); },
      build(s, i, p) {
        if (isGameOver || currentPlayer !== 'human') return false;
        const wasLast = s === 'hand' && Game.players.human.hand.length === 1;
        const ok = handleBuildPileDrop('human', s, i, p);
        if (ok) { if (wasLast) __origDraw('human'); checkForWinner(); }
        return ok;
      },
      discard(i, p) {
        if (isGameOver || currentPlayer !== 'human') return false;
        const ok = handleDiscardPileDrop('human', 'hand', i, p);
        if (ok) switchPlayer();
        return ok;
      },
      pass()          { switchPlayer(); },
      humanTurn()     { return currentPlayer === 'human'; },
      game()          { return Game; }
    };
  `, ctx, { filename: 'harness-old' });
  return { ctx, api: ctx.__api, log: () => ctx.__log, warnings: qc.warnings,
           ready: () => ctx.__humanReady, resetReady: () => { ctx.__humanReady = false; } };
}

// ================================================================
// MENSCH-BOT (deterministisch, identisch für beide Engines)
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
  if (!api.humanTurn()) return 'switched';       // neue Engine: Auto-Pass bei leerer Hand
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
async function playGame(engine, seed, isNew) {
  const rng = mulberry32(seed);
  engine.log().length = 0;
  engine.resetReady();
  await engine.api.start(rng);
  await tick();
  let turns = 0;
  let invariant = null;

  while (!engine.api.over() && turns < 400) {
    turns++;
    if (isNew) { invariant = engine.api.check(); if (invariant) break; }
    engine.resetReady();
    const mark = engine.log().length;
    const r = humanPlay(engine.api);
    if (r === 'over') break;
    if (r === 'pass' && !isNew) engine.api.pass();
    if (r === 'failed') { invariant = 'Ablage fehlgeschlagen'; break; }
    // auf die KI warten: bis der Mensch wieder dran ist oder das Spiel vorbei ist
    await waitFor(() => engine.api.over() || engine.ready());
    await tick(); await tick();
    // Regel (7.0.3): Die KI legt pro Zug höchstens EINE Karte ab
    if (isNew) {
      const n = engine.log().slice(mark).filter(e => e.startsWith('ai:') && e.includes('>D')).length;
      if (n > 1) { invariant = 'KI legt ' + n + ' Karten in einem Zug ab'; break; }
    }
  }
  if (isNew && !invariant) invariant = engine.api.check();
  return { turns, result: engine.api.result(), log: engine.log().slice(), invariant, stuck: turns >= 400 };
}

/** Log nach dem Zug abschneiden, mit dem ein Stock leer wurde (7.0.0 spielte danach weiter). */
function truncateAtWin(log) {
  let hs = 20, as = 20;
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (e.startsWith('human:stock:')) hs--;
    if (e.startsWith('ai:stock:'))    as--;
    if (hs === 0 || as === 0) return log.slice(0, i + 1);
  }
  return log;
}

// ================================================================
// HAUPTPROGRAMM
// ================================================================
(async function main() {
  console.log(`Skipo Prüfstand – ${GAMES} Spiele, Seed ${SEED}${NEWONLY ? ' (nur neue Engine)' : ''}${TAKTIK ? ' (Taktik AN)' : ' (Taktik AUS = 7.0.1-Verhalten)'}`);
  const t0 = Date.now();

  const engNew = makeNew();
  let engOld = null;
  if (!NEWONLY) {
    const missing = OLD_FILES.filter(f => !fs.existsSync(path.join(OLDDIR, f)));
    if (missing.length) {
      console.log(`⚠️  7.0.0-Dateien fehlen in ${OLDDIR}: ${missing.join(', ')} – nur neue Engine wird getestet.`);
    } else {
      engOld = makeOld();
    }
  }

  let aiWins = 0, humanWins = 0, moves = 0, diffs = 0, invariantErrors = 0, stuck = 0;
  const diffSamples = [];

  for (let g = 0; g < GAMES; g++) {
    const seed = SEED * 1000003 + g;
    const rNew = await playGame(engNew, seed, true);
    if (rNew.invariant) { invariantErrors++; console.log(`❌ Spiel ${g}: Invariante verletzt – ${rNew.invariant}`); }
    if (rNew.stuck) stuck++;
    if (rNew.result) { if (rNew.result.winner === 'ai') aiWins++; else humanWins++; }
    moves += rNew.log.length;

    if (engOld) {
      const rOld = await playGame(engOld, seed, false);
      const a = truncateAtWin(rNew.log), b = truncateAtWin(rOld.log);
      let firstDiff = -1;
      const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i++) if (a[i] !== b[i]) { firstDiff = i; break; }
      const resSame = JSON.stringify(rNew.result && { w: rNew.result.winner, p: rNew.result.points })
                   === JSON.stringify(rOld.result && { w: rOld.result.winner, p: rOld.result.points });
      if (firstDiff >= 0 || !resSame) {
        diffs++;
        if (diffSamples.length < 5) {
          diffSamples.push({ g, seed, firstDiff, neu: a.slice(Math.max(0, firstDiff - 3), firstDiff + 4),
                             alt: b.slice(Math.max(0, firstDiff - 3), firstDiff + 4), rNew: rNew.result, rOld: rOld.result,
                             lenNew: a.length, lenOld: b.length });
        }
      }
    }
    if ((g + 1) % 50 === 0) console.log(`  … ${g + 1} Spiele`);
  }

  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('─'.repeat(64));
  console.log(`Spiele: ${GAMES}   Züge gesamt: ${moves}   Dauer: ${sec}s`);
  console.log(`KI-Siege: ${aiWins}   Bot-Siege: ${humanWins}   festgefahren: ${stuck}`);
  console.log(`Invarianten-Fehler: ${invariantErrors}`);
  if (engNew.warnings.length) console.log(`Warnungen neue Engine: ${engNew.warnings.length} (z. B. "${engNew.warnings[0]}")`);
  if (engOld) {
    console.log(`Äquivalenz gegen 7.0.0: ${diffs === 0 ? '✅ alle Zugfolgen identisch' : '❌ ' + diffs + ' Spiele weichen ab'}`);
    for (const d of diffSamples) {
      console.log(`  Spiel ${d.g} (Seed ${d.seed}) – erste Abweichung bei Zug ${d.firstDiff} (neu ${d.lenNew} / alt ${d.lenOld} Züge)`);
      console.log(`    neu: ${d.neu.join('  ')}`);
      console.log(`    alt: ${d.alt.join('  ')}`);
      console.log(`    Ergebnis neu ${JSON.stringify(d.rNew)} / alt ${JSON.stringify(d.rOld)}`);
    }
    if (engOld.warnings.length) console.log(`Warnungen alte Engine: ${engOld.warnings.length}`);
  }
  process.exit(invariantErrors || diffs ? 1 : 0);
})().catch(e => { console.error('Prüfstand abgebrochen:', e); process.exit(2); });
