// ================================================================
//  core-flow.js  –  Skipo 7.0.4   Namensraum: Flow
//  SPIELSCHLEIFE: Start, Spielerwechsel, Spielende
// ----------------------------------------------------------------
//  Braucht: State, Rules, Events, I18n, Clock, AI     Bietet: Flow.*
//
//  Flow besitzt den Zug. Die Eingabe (ui-input) ruft Flow.humanBuild /
//  Flow.humanDiscard; Flow prüft „ist der Mensch dran?", führt über
//  Rules aus, prüft das Spielende und übergibt an die KI. Nach dem
//  KI-Zug wechselt Flow zurück zum Menschen.
//
//  Kein DOM. Nach oben nur Ereignisse:
//    game:start · turn:change · game:over
//
//  Geister-KI: Flow startet die KI genau einmal je Wechsel und wartet
//  sie ab (await). Ein Neustart über startGame() setzt turn.over,
//  wartet AI.busy ab und baut erst dann ein neues Spiel.
// ================================================================

const Flow = {

  /** Neues Spiel (auch mitten im laufenden Spiel möglich). */
  async startGame() {
    if (State.turn) State.turn.over = true;      // laufende KI anhalten
    await this.idle();
    Rules.newGame();
    Events.emit('game:start');
    Events.emit('turn:change', { player: 'human' });
    I18n.say('gameStart');
  },

  /** Warten, bis keine KI mehr läuft. */
  async idle() {
    while (AI.busy) await new Promise(r => setTimeout(r, 20));
  },

  /** Spielende prüfen und ggf. auslösen. @returns true wenn vorbei */
  checkEnd() {
    if (State.turn.over) return true;
    const w = Rules.winner();
    if (!w) return false;
    State.turn.over   = true;
    State.turn.result = w;
    Events.emit('game:over', w);
    return true;
  },

  /** Ist der Mensch gerade am Zug? */
  humanCanAct() {
    return !State.turn.over && State.turn.player === 'human';
  },

  /**
   * Mensch legt auf Baustapel.
   * @returns {boolean} true wenn gelegt
   */
  humanBuild(source, index, pile) {
    if (!this.humanCanAct()) return false;
    const human   = State.player('human');
    const wasLast = source === 'hand' && human.hand.length === 1;

    if (!Rules.playToBuild('human', source, index, pile)) return false;

    if (wasLast) Rules.drawToFive('human');       // Hand leer → sofort 5 neue
    if (this.checkEnd()) return true;

    // Sonderfall: keine Handkarte mehr (Nachziehstapel leer) und kein
    // weiterer Bauzug → der Zug kann nicht per Ablage beendet werden.
    if (human.hand.length === 0 && !Rules.hasAnyBuildMove('human')) {
      I18n.say('noMoveAuto');
      this._aiRound();
    }
    return true;
  },

  /**
   * Mensch legt auf Ablagestapel → beendet den Zug.
   * @returns {boolean} true wenn gelegt
   */
  humanDiscard(source, index, pile) {
    if (!this.humanCanAct()) return false;
    if (!Rules.playToDiscard('human', source, index, pile)) return false;
    this._aiRound();
    return true;
  },

  /** KI-Runde: Wechsel → KI spielt → Wechsel zurück. Läuft asynchron. */
  async _aiRound() {
    if (this.checkEnd()) return;

    State.turn.player = 'ai';
    Events.emit('turn:change', { player: 'ai' });
    I18n.say('aiTurn');
    await Clock.pause(1.2);
    if (State.turn.over) return;

    await AI.takeTurn();
    if (this.checkEnd()) return;

    State.turn.player = 'human';
    Events.emit('turn:change', { player: 'human' });
    I18n.say('yourTurn');
    await Clock.pause(0.5);
    if (State.turn.over) return;

    Rules.drawToFive('human');

    // Sonderfall: Hand leer (Nachziehstapel leer) und kein Bauzug möglich → weiter zur KI.
    // Notbremse: Passen beide Seiten dreimal hintereinander, ist das Spiel
    // festgefahren (alle Karten liegen fest) → Wertung nach Stockgröße.
    const human = State.player('human');
    if (human.hand.length === 0 && !Rules.hasAnyBuildMove('human')) {
      State.turn.autoPasses = (State.turn.autoPasses || 0) + 1;
      if (State.turn.autoPasses >= 3) {
        State.turn.over   = true;
        State.turn.result = Rules.winnerByStock();
        Events.emit('game:over', State.turn.result);
        return;
      }
      I18n.say('noMoveAuto');
      await Clock.pause(1.0);
      return this._aiRound();
    }
    State.turn.autoPasses = 0;

    I18n.say('chooseCard');
    await Clock.pause(1.5);
  }
};
