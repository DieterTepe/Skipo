// ================================================================
//  ai-lookahead.js  –  Skipo 7.0.5   Namensraum: AI.Look
//  VORAUSSPIELEN (Stufe „Profi")
// ----------------------------------------------------------------
//  Braucht: AI, KI_PLANNER, State, Rules, Events, Clock
//  Bietet:  AI.Look.choose(options, apply, cfg)
//
//  Für eine Entscheidung (bisher: welche Karte wohin ablegen) spielt
//  die KI jede Möglichkeit mehrmals voraus:
//    1. Spielfeld kopieren.
//    2. Alles, was die KI nicht sehen kann, zufällig neu verteilen:
//       Handkarten des Gegners, Nachziehstapel, verdeckte Stockkarten.
//       Welche Karten das insgesamt sind, ist bekannt (alle Karten
//       minus die sichtbaren) – nur wo sie liegen, nicht. Die echte
//       Gegnerhand geht dabei unter und wird nie ausgewertet.
//    3. Die Möglichkeit ausführen und die nächsten Züge beider Seiten
//       mit der normalen KI durchspielen.
//    4. Stockvorsprung am Ende bewerten.
//  Alle Möglichkeiten sehen dieselben Kartenverteilungen, damit der
//  Vergleich fair ist. Gewählt wird der beste Durchschnitt.
//
//  Während des Vorausspielens ist das Spiel „stumm": keine Ereignisse
//  (keine Anzeige, keine Statistik), keine Pausen, eigener Zufall.
//  Danach ist alles exakt wie vorher (try/finally).
//
//  Rechenzeit: cfg.ms begrenzt die Dauer; langsame Geräte spielen
//  dann weniger Verteilungen durch (mindestens zwei).
// ================================================================

AI.Look = {
  active: false,       // true = wir sind im Vorausspielen (keine Verschachtelung)
  seed:   1,

  /** Eigener Zufall (mulberry32) – der Zufall des echten Spiels bleibt unberührt. */
  rnd() {
    const a = (this.seed = (this.seed + 0x6D2B79F5) >>> 0);
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },

  /** Spielfeld kopieren (Karten sind unveränderlich → nur die Listen kopieren). */
  clone(g) {
    const cp = p => ({ hand: p.hand.slice(), stock: p.stock.slice(), discards: p.discards.map(d => d.slice()) });
    return {
      deck: [], drawPile: g.drawPile.slice(), buildPiles: g.buildPiles.map(p => p.slice()),
      players: { human: cp(g.players.human), ai: cp(g.players.ai) },
      history: { human: g.history.human.slice(), ai: g.history.ai.slice() }
    };
  },

  /**
   * Alles Verdeckte neu mischen: Gegnerhand, Nachziehstapel, verdeckte Stockkarten des
   * Gegners – und bei KI-Planung „Normal" auch die eigenen verdeckten Stockkarten.
   */
  shuffleHidden(g) {
    const fair = AI.fairStock();
    const H = g.players.human, A = g.players.ai;
    const hTop = H.stock.pop();
    const aTop = fair ? A.stock.pop() : undefined;
    const nHand = H.hand.length, nHS = H.stock.length, nAS = fair ? A.stock.length : 0;
    const pool = H.hand.concat(g.drawPile, H.stock, fair ? A.stock : []);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.rnd() * (i + 1));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    H.hand  = pool.splice(0, nHand);
    H.stock = pool.splice(0, nHS);
    if (hTop) H.stock.push(hTop);
    if (fair) { A.stock = pool.splice(0, nAS); if (aTop) A.stock.push(aTop); }
    g.drawPile = pool;
  },

  /** Seiten tauschen: Die KI spielt im Code immer als 'ai' – so spielt sie den Gegnerzug. */
  swap() {
    const g = State.game;
    [g.players.human, g.players.ai] = [g.players.ai, g.players.human];
    [g.history.human, g.history.ai] = [g.history.ai, g.history.human];
  },

  /** Ein kompletter Zug der Seite 'ai' im kopierten Spiel. */
  async turn() {
    await AI.prepare();
    if (AI.over()) return;
    await AI.executeMoves();
    if (AI.over()) return;
    await AI.finish();
  },

  /** n Halbzüge spielen: Gegner, ich, Gegner, … */
  async playTurns(n) {
    for (let i = 0; i < n; i++) {
      if (AI.over()) return;
      if (i % 2 === 0) { this.swap(); await this.turn(); this.swap(); }
      else await this.turn();
    }
  },

  /** Bewertung aus Sicht der KI: Stockvorsprung; Sieg und Niederlage zählen deutlich. */
  value() {
    const me = State.player('ai').stock.length, opp = State.player('human').stock.length;
    return (opp - me) + (me === 0 ? 10 : 0) - (opp === 0 ? 10 : 0);
  },

  /**
   * Möglichkeiten vergleichen.
   * @param {Array}    options  Möglichkeiten; options[0] ist die bisherige (heuristische) Wahl
   * @param {Function} apply    führt eine Möglichkeit im kopierten Spiel aus
   * @param {Object}   cfg      { samples, depth, ms }  ms = 0: ohne Zeitgrenze
   * @returns {number} Index der besten Möglichkeit (bei Gleichstand die frühere)
   */
  async choose(options, apply, cfg) {
    if (this.active || options.length < 2) return 0;
    const real = State.game, realRandom = Rules.random;
    // Startwert aus der sichtbaren Lage → gleicher Spielverlauf ergibt gleiche Verteilungen
    const base = (real.drawPile.length * 7919 + real.players.ai.stock.length * 104729 +
                  real.players.human.stock.length * 1299709 + real.history.ai.length * 15485863) >>> 0;
    const sums = options.map(() => 0);
    const t0   = Date.now();
    let rounds = 0;

    this.active = true; Events.muted = true; Clock.instant = true;
    try {
      for (let r = 0; r < cfg.samples; r++) {
        if (cfg.ms > 0 && r >= 2 && Date.now() - t0 > cfg.ms) break;
        for (let o = 0; o < options.length; o++) {
          State.game = this.clone(real);
          this.seed  = (base + r * 7919) >>> 0;            // dieselbe Verteilung für alle Möglichkeiten
          this.shuffleHidden(State.game);
          Rules.random = () => this.rnd();
          apply(options[o]);
          if (!AI.over()) { Rules.drawToFive('ai'); await this.playTurns(cfg.depth); }
          sums[o] += this.value();
        }
        rounds++;
      }
    } finally {
      State.game = real; Rules.random = realRandom;
      this.active = false; Events.muted = false; Clock.instant = false;
    }

    let best = 0;
    for (let o = 1; o < options.length; o++) if (sums[o] > sums[best] + 1e-9) best = o;
    this.last = { options: options.length, rounds, ms: Date.now() - t0, changed: best !== 0 };
    return best;
  }
};
