#!/usr/bin/env node
// ================================================================
//  tune-sim.js  –  Skipo   KI-TUNING-PRÜFSTAND (nur Node)
// ----------------------------------------------------------------
//  KI gegen KI. Zwei Konfigurationen spielen dieselben Kartenver-
//  teilungen (Seed) je zweimal mit getauschten Sitzen. So heben sich
//  Kartenglück und Anfangsvorteil auf; übrig bleibt die Stärke.
//
//  Aufruf:
//    node tune-sim.js --games=500 --seed=1                      Kontrolle: A gegen A (~50 %)
//    node tune-sim.js --games=500 --set SCORE_1=0 SCORE_5=200   Herausforderer B = A + Änderungen
//    node tune-sim.js --games=300 --sweep [--from=N] [--only=KEY,KEY]   jeden KONFIG-Wert ×0, ×0.5, ×2
//    node tune-sim.js --games=500 --taktik KEY=WERT ...         KI_TAKTIK-Werte für B (A: KI_TAKTIK aus)
//    node tune-sim.js --games=500 --a=konfigA.json --b=konfigB.json
//    node tune-sim.js --games=500 --bot                         Herausforderer gegen einfachen Bot
//    Zusatz --basis: A = aktuelle KI_TAKTIK-Standardwerte (statt Taktik aus) → B misst nur den neuen Schalter
//
//  Ausgabe: Siegrate von B mit 95-%-Intervall, Stockdifferenz,
//  Züge, Dauer. Sweep-Ergebnisse werden fortlaufend in
//  tune-results.jsonl geschrieben (Abbruch/Fortsetzung möglich).
//
//  Trick: Die KI spielt im Code immer als 'ai' gegen 'human'. Für den
//  Sitz „human" werden vor dem Zug die Spielerobjekte und die Ablage-
//  Historie getauscht, KONFIG/KI_TAKTIK auf den Satz des Sitzes
//  gesetzt, dann AI.takeTurn(), danach zurückgetauscht. Kein Spiel-
//  code wird dafür verändert.
// ================================================================

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const DIR  = __dirname;
const args = process.argv.slice(2);
const opt  = (name, def) => { const a = args.find(x => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : def; };
const GAMES = parseInt(opt('games', '200'), 10);
const SEED  = parseInt(opt('seed', '1'), 10);
const OUT   = opt('out', path.join(DIR, 'tune-results.jsonl'));

const FILES = ['konfig.js', 'ki-planner.js', 'core-events.js', 'core-store.js', 'core-settings.js',
               'core-i18n.js', 'core-state.js', 'core-rules.js', 'ai-turn.js', 'ai-planner.js',
               'ai-eval.js', 'ai-analysis.js', 'core-flow.js', 'tracking.js'];
if (fs.existsSync(path.join(DIR, 'ki-taktik.js'))) FILES.splice(2, 0, 'ki-taktik.js');

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

// ── Engine laden ──
function makeEngine() {
  const sandbox = { console: { log() {}, warn() {}, error() {}, info() {} }, setTimeout, clearTimeout, Date, JSON, Math };
  const ctx = vm.createContext(sandbox);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
  vm.runInContext(`
    Settings.load(); I18n.init();
    Clock.pause = () => Promise.resolve();
    globalThis.__baseKonfig = JSON.parse(JSON.stringify(KONFIG));
    globalThis.__baseTaktik = (typeof KI_TAKTIK !== 'undefined') ? JSON.parse(JSON.stringify(KI_TAKTIK)) : null;
    globalThis.__basePlanner = JSON.parse(JSON.stringify(KI_PLANNER));
    globalThis.__moves = 0;
    Events.on('move:build', () => __moves++);
    function swap() {
      const g = State.game;
      [g.players.human, g.players.ai] = [g.players.ai, g.players.human];
      [g.history.human, g.history.ai] = [g.history.ai, g.history.human];
    }
    function useCfg(cfg) {
      KONFIG = cfg.konfig;
      if (typeof KI_TAKTIK !== 'undefined' && cfg.taktik) KI_TAKTIK = cfg.taktik;
      Object.assign(KI_PLANNER, cfg.planner || __basePlanner);
    }
    // Einfacher Bot (wie test-sim.js) für den Sitz 'human'
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
     * Ein Spiel: Sitz 'human' spielt cfgH (oder Bot), Sitz 'ai' spielt cfgA. 'human' beginnt.
     * @returns { winner: 'human'|'ai'|'draw', margin: Stockdifferenz aus Sicht von 'ai', turns }
     */
    globalThis.__play = async function (seed, cfgH, cfgA, botH, botA) {
      Rules.random = (function (s) { let a = s >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })(seed);
      Rules.newGame();
      let turns = 0, stale = 0;
      while (!Rules.winner() && turns < 300) {
        turns++;
        const before = __moves;
        // Sitz human (beginnt)
        if (botH) { botTurn(); }
        else { swap(); useCfg(cfgH); await AI.takeTurn(0); swap(); }
        if (Rules.winner()) break;
        Rules.drawToFive('human');
        // Sitz ai
        if (botA) { swap(); botTurn(); swap(); Rules.drawToFive('ai'); }
        else { useCfg(cfgA); await AI.takeTurn(0); }
        // festgefahren: keiner baut, beide Hände leer, Nachziehstapel leer
        const g = State.game;
        if (__moves === before && g.players.human.hand.length === 0 && g.players.ai.hand.length === 0 && g.drawPile.length === 0) { if (++stale >= 2) break; } else stale = 0;
      }
      const w = Rules.winner();
      const h = State.game.players.human.stock.length, a = State.game.players.ai.stock.length;
      return { winner: w ? w.winner : (h === a ? 'draw' : (a < h ? 'ai' : 'human')), margin: h - a, turns };
    };
  `, ctx, { filename: 'harness-tune' });
  return ctx;
}

// ── Konfigurationen bauen ──
function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function parseSets(list) {
  const o = {};
  for (const s of list) {
    const m = s.match(/^([A-Za-z_0-9]+)=(.+)$/);
    if (!m) continue;
    const v = m[2];
    o[m[1]] = v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v);
  }
  return o;
}

/** Match: GAMES Paare (Seed, Sitze getauscht). @returns Statistik aus Sicht von B */
async function match(ctx, cfgA, cfgB, games, seed, useBot, label) {
  const t0 = Date.now();
  let bWins = 0, draws = 0, margin = 0, turns = 0, played = 0;
  for (let g = 0; g < games; g++) {
    const s = seed * 1000003 + g;
    // Spiel 1: B auf Sitz 'human' (beginnt), A auf 'ai'
    const r1 = await ctx.__play(s, cfgB, cfgA, false, useBot);
    if (r1.winner === 'human') bWins++; else if (r1.winner === 'draw') draws++;
    margin += r1.margin; turns += r1.turns; played++;
    // Spiel 2: A auf 'human' (oder Bot), B auf 'ai'
    const r2 = await ctx.__play(s, cfgA, cfgB, useBot, false);
    if (r2.winner === 'ai') bWins++; else if (r2.winner === 'draw') draws++;
    margin -= r2.margin; turns += r2.turns; played++;
  }
  const p   = bWins / played;
  const ci  = 1.96 * Math.sqrt(p * (1 - p) / played);
  const res = { label, games: played, winB: +(p * 100).toFixed(1), ci: +(ci * 100).toFixed(1),
                draws, marginB: +(-margin / played).toFixed(2), turns: +(turns / played).toFixed(1),
                sec: +((Date.now() - t0) / 1000).toFixed(1) };
  return res;
}

function fmt(r) {
  const sig = r.winB - r.ci > 50 ? '▲' : r.winB + r.ci < 50 ? '▼' : '·';
  return `${sig} ${String(r.label).padEnd(44)} B: ${String(r.winB).padStart(5)} % ±${String(r.ci).padStart(4)}  Stock ${String(r.marginB).padStart(6)}  Züge ${r.turns}  (${r.games} Sp., ${r.sec}s)`;
}

(async function main() {
  const ctx  = makeEngine();
  const base = ctx.__baseKonfig;
  const baseT = ctx.__baseTaktik;
  // --basis: A = aktuelle KI_TAKTIK-Standardwerte (z. B. 7.0.2 mit Blockade), sonst A = Taktik aus (7.0.1)
  const aTaktik = baseT ? (args.includes('--basis') ? { ...baseT } : { ...baseT, ENABLED: false }) : null;
  const cfgA = opt('a') ? { konfig: loadJson(opt('a')).konfig || loadJson(opt('a')), taktik: baseT && loadJson(opt('a')).taktik || aTaktik }
                        : { konfig: base, taktik: aTaktik };
  const useBot = args.includes('--bot');

  if (args.includes('--sweep')) {
    const from = parseInt(opt('from', '0'), 10);
    const only = opt('only') ? opt('only').split(',') : null;
    const keys = Object.keys(base).filter(k => only ? only.includes(k) : true);
    const done = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l).label) : [];
    console.log(`Sweep: ${keys.length} Schlüssel, ${GAMES} Paare je Variante, Seed ${SEED}`);
    for (let i = from; i < keys.length; i++) {
      const k = keys[i];
      const v = base[k];
      const variants = typeof v === 'boolean' ? [[!v, String(!v)]]
                     : typeof v === 'number' ? (v === 0 ? [[1, '=1'], [10, '=10'], [100, '=100']] : [[0, '×0'], [v * 0.5, '×0.5'], [v * 2, '×2']])
                     : [];
      for (const [nv, tag] of variants) {
        const label = `${k} ${tag}`;
        if (done.includes(label)) continue;
        const cfgB = { konfig: { ...base, [k]: nv }, taktik: cfgA.taktik };
        const r = await match(ctx, cfgA, cfgB, GAMES, SEED, useBot, label);
        r.key = k; r.value = nv; r.base = v;
        console.log(`[${i + 1}/${keys.length}] ` + fmt(r));
        fs.appendFileSync(OUT, JSON.stringify(r) + '\n');
      }
    }
    return;
  }

  let cfgB;
  if (opt('b')) { const j = loadJson(opt('b')); cfgB = { konfig: j.konfig || j, taktik: j.taktik || cfgA.taktik, planner: j.planner || null }; }
  else {
    // Präfixe: K:KEY=V (KONFIG), T:KEY=V (KI_TAKTIK, schaltet ENABLED ein), P:KEY=V (KI_PLANNER)
    // ohne Präfix: KONFIG; mit --taktik: alle als KI_TAKTIK
    const raw = args.filter(a => /^([KTP]:)?[A-Za-z_0-9]+=/.test(a));
    const k = parseSets(raw.filter(a => a.startsWith('K:')).map(a => a.slice(2)));
    const t = parseSets(raw.filter(a => a.startsWith('T:')).map(a => a.slice(2)));
    const pl = parseSets(raw.filter(a => a.startsWith('P:')).map(a => a.slice(2)));
    const plain = parseSets(raw.filter(a => !/^[KTP]:/.test(a)));
    if (args.includes('--taktik')) Object.assign(t, plain); else Object.assign(k, plain);
    cfgB = { konfig: { ...base, ...k },
             taktik: Object.keys(t).length ? { ...baseT, ENABLED: true, ...t } : cfgA.taktik,
             planner: Object.keys(pl).length ? { ...ctx.__basePlanner, ...pl } : null };
  }
  const label = opt('label', useBot ? 'B gegen Bot' : (JSON.stringify(cfgB) === JSON.stringify(cfgA) ? 'Kontrolle A gegen A' : 'B gegen A'));
  console.log(`${label}: ${GAMES} Paare, Seed ${SEED}`);
  const r = await match(ctx, cfgA, cfgB, GAMES, SEED, useBot, label);
  console.log(fmt(r));
  if (args.includes('--save')) fs.appendFileSync(OUT, JSON.stringify(r) + '\n');
})().catch(e => { console.error('Abbruch:', e); process.exit(2); });
