// ================================================================
//  tracking.js  –  Skipo 7.0.4   Namensraum: Tracking
//  SPIELSTATISTIK BEIDER SEITEN (für den Vergleich im Endscreen)
// ----------------------------------------------------------------
//  Braucht: Events, Store, State, Rules     Bietet: Tracking.last, averages()
//
//  Hört auf Ereignisse (game:start, move:build, turn:change, game:over)
//  und zählt für Spieler UND KI je Spiel:
//    stock  – Stockkarten gelegt        missed – eigene Stockkarte am
//    hand   – Handkarten gelegt                  Zugende noch spielbar
//    combo  – Ablage → Baustapel        opened – Baustapel am Zugende offen
//    turns  – Züge                               für die Gegner-Stockkarte
//  Die letzten 10 Spiele werden gespeichert (Store 'stats').
//
//  WICHTIG (Reihenfolge): Tracking.init() muss VOR den UI-Hörern
//  laufen, damit beim game:over der Datensatz schon fertig ist,
//  wenn der Endscreen ihn liest.
// ================================================================

const Tracking = {
  FIELDS: ['stock', 'hand', 'combo', 'missed', 'opened', 'turns'],

  game:    null,      // Zähler des laufenden Spiels (beide Seiten)
  last:    null,      // Datensatz des zuletzt beendeten Spiels
  history: [],        // letzte 10 Spiele (Store 'stats')

  /** Laden + Ereignisse abonnieren. */
  init() {
    const h = Store.get('stats', []);
    this.history = Array.isArray(h) ? h : [];
    Events.on('game:start',  () => this.newGame());
    Events.on('move:build',  d => this.onBuild(d));
    Events.on('turn:change', d => this.onTurnChange(d.player));
    Events.on('game:over',   w => this.gameEnd(w));
  },

  /** Zähler beider Seiten für ein neues Spiel. */
  newGame() {
    const side = () => ({ stock: 0, hand: 0, combo: 0, missed: 0, opened: 0, turns: 0 });
    this.game = { human: side(), ai: side() };
  },

  /** Bauzug zählen (beide Seiten). */
  onBuild(d) {
    if (!this.game) return;
    const g = this.game[d.player];
    if (d.source === 'stock')   g.stock++;
    if (d.source === 'hand')    g.hand++;
    if (d.source === 'discard') g.combo++;
  },

  /**
   * Zugende des vorherigen Spielers auswerten:
   *  missed – seine Stockkarte hätte noch gelegt werden können
   *  opened – ein Baustapel steht für die Stockkarte des Gegners offen
   */
  onTurnChange(next) {
    if (!this.game || !State.game) return;
    const prev = next === 'human' ? 'ai' : 'human';
    const g    = this.game[prev];
    g.turns++;
    const own = State.player(prev).stock;
    const top = own[own.length - 1];
    if (top && [0, 1, 2, 3].some(i => Rules.isValidBuild(top, i))) g.missed++;
    const opp    = State.player(next).stock;
    const oppTop = opp[opp.length - 1];
    if (oppTop && oppTop.type !== 'joker' &&
        State.game.buildPiles.some(p => Rules.nextNeeded(p) === oppTop.value)) g.opened++;
  },

  /** Spielende: Datensatz sichern. */
  gameEnd(result) {
    if (!this.game) return;
    // Letzter Zug des Siegers ist noch nicht per turn:change gezählt
    this.game[result.winner].turns++;
    this.last = { winner: result.winner, points: result.points, human: this.game.human, ai: this.game.ai,
                  stockLeft: { human: State.player('human').stock.length, ai: State.player('ai').stock.length } };
    this.history.push(this.last);
    while (this.history.length > 10) this.history.shift();
    Store.set('stats', this.history);
  },

  /** Durchschnitt je Seite über die gespeicherten Spiele. */
  averages() {
    const n = this.history.length;
    const avg = side => {
      const o = { wins: 0 };
      for (const k of this.FIELDS) o[k] = 0;
      for (const g of this.history) {
        for (const k of this.FIELDS) o[k] += g[side][k];
        if (g.winner === side) o.wins++;
      }
      for (const k of this.FIELDS) o[k] = n ? o[k] / n : 0;
      return o;
    };
    return { games: n, human: avg('human'), ai: avg('ai') };
  }
};
