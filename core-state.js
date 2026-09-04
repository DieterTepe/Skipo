// ================================================================
//  core-state.js  –  Skipo 7.0.1   Namensraum: State
//  ZENTRALER SPIELZUSTAND
// ----------------------------------------------------------------
//  Braucht: nichts        Bietet: State.game, State.turn, State.reset
//
//  Der gesamte veränderliche Spielzustand an EINEM Ort.
//  Erweiterungs-Regel: neue Zustandsfelder immer hier ergänzen,
//  nie verstreut im Code anlegen. Kein DOM, kein localStorage.
//
//  Karte:  { type: 'number', value: 1..12 }  oder  { type: 'joker', value: '★' }
//  Stapel: Arrays, letztes Element = oberste Karte.
// ================================================================

const State = {
  /** Spielfeld (wird von reset() neu erzeugt). */
  game: null,

  /** Zugsteuerung – ein Objekt pro Spiel. */
  turn: { player: 'human', gameId: 0, over: false, result: null },

  /** Alles auf Ausgangszustand (vor jedem neuen Spiel). */
  reset() {
    const gameId = (this.turn ? this.turn.gameId : 0) + 1;
    this.turn = { player: 'human', gameId, over: false, result: null };
    this.game = {
      deck:       [],                      // nur während des Austeilens befüllt
      drawPile:   [],                      // Nachziehstapel
      buildPiles: [[], [], [], []],        // 4 gemeinsame Baustapel (1–12)
      players: {
        human: { hand: [], stock: [], discards: [[], [], [], []] },
        ai:    { hand: [], stock: [], discards: [[], [], [], []] }
      },
      // Ablage-Historie beider Spieler (Werte bzw. 'joker'), für die
      // KI-Serienerkennung (AI.Analysis.consecutiveDiscards).
      history: { human: [], ai: [] }
    };
  },

  /** Kurzzugriff auf einen Spieler. */
  player(p) { return this.game.players[p]; },

  /** Gegenspieler. */
  opponent(p) { return p === 'human' ? 'ai' : 'human'; }
};
