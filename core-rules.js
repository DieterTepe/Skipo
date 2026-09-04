// ================================================================
//  core-rules.js  –  Skipo 7.0.1   Namensraum: Rules
//  SPIELREGELN, DECK, VERTEILEN, ZUGAUSFÜHRUNG
// ----------------------------------------------------------------
//  Braucht: State, Events, I18n     Bietet: Rules.*
//
//  Die reinen Skip-Bo-Regeln. Diese Funktionen verändern NUR
//  State.game und fassen nie das DOM an. Mensch und KI benutzen
//  dieselben Funktionen. Jede Zustandsänderung sendet ein Ereignis
//  (move:build / move:discard / move:draw / pile:cleared), auf das
//  die Anzeige reagiert.
//
//  Regeländerungen passieren ausschließlich hier.
//  Zufall: nur Rules.shuffle() nutzt Rules.random (ersetzbar für
//  reproduzierbare Tests).
// ================================================================

const Rules = {
  /** Zufallsquelle – Tests setzen hier einen Seed-Generator ein. */
  random: Math.random,

  // ----------------------------------------------------------------
  // KARTEN- UND STAPELWERTE (die EINE Wahrheit über Werte)
  // ----------------------------------------------------------------

  /** Numerischer Wert: Zahlenkarte 1..12, Joker 0, keine Karte 0. */
  cardValue(card) {
    if (!card) return 0;
    return card.type === 'joker' ? 0 : parseInt(card.value, 10);
  },

  /** Effektiver Wert der obersten Baustapelkarte (leer → 0, Joker → Position). */
  pileTop(pile) {
    if (!pile || pile.length === 0) return 0;
    const top = pile[pile.length - 1];
    return top.type === 'joker' ? pile.length : parseInt(top.value, 10);
  },

  /** Nächster benötigter Wert auf einem Baustapel (1..13). */
  nextNeeded(pile) {
    return this.pileTop(pile) + 1;
  },

  /** Welchen Wert vertritt ein Joker an Position pos im Baustapel? */
  jokerValue(pile, pos) {
    if (pos === 0) return 1;
    const prev = pile[pos - 1];
    return prev.type === 'joker' ? pos + 1 : parseInt(prev.value) + 1;
  },

  // ----------------------------------------------------------------
  // DECK & VERTEILEN
  // ----------------------------------------------------------------

  /** 12 Sätze × 1..12 + 12 Joker = 156 Karten. */
  buildDeck() {
    const deck = [];
    for (let s = 0; s < 12; s++) {
      for (let n = 1; n <= 12; n++) deck.push({ type: 'number', value: n });
    }
    for (let j = 0; j < 12; j++) deck.push({ type: 'joker', value: '★' });
    return deck;
  },

  /** Fisher-Yates, in-place, mit Rules.random. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  /** Je 5 Handkarten + 20 Stockkarten; Rest = Nachziehstapel. */
  deal() {
    const g = State.game;
    g.players.human.hand  = g.deck.splice(0, 5);
    g.players.ai.hand     = g.deck.splice(0, 5);
    g.players.human.stock = g.deck.splice(0, 20);
    g.players.ai.stock    = g.deck.splice(0, 20);
    g.drawPile            = g.deck;
    g.deck                = [];
  },

  /** Komplettes neues Spiel aufbauen (Zustand, Deck, Mischen, Verteilen). */
  newGame() {
    State.reset();
    State.game.deck = this.buildDeck();
    this.shuffle(State.game.deck);
    this.deal();
  },

  // ----------------------------------------------------------------
  // REGELN
  // ----------------------------------------------------------------

  /** Darf die Karte auf Baustapel pileIdx? Leer: 1 oder Joker; sonst Top+1 oder Joker. */
  isValidBuild(card, pileIdx) {
    const pile = State.game.buildPiles[pileIdx];
    if (pile.length === 0) return card.type === 'joker' || parseInt(card.value) === 1;
    return card.type === 'joker' || parseInt(card.value) === this.pileTop(pile) + 1;
  },

  /** Baustapel vollständig (1–12)? */
  isPileComplete(pileIdx) {
    const pile = State.game.buildPiles[pileIdx];
    if (pile.length === 0) return false;
    const top = pile[pile.length - 1];
    return top.value === 12 || (top.type === 'joker' && pile.length === 12);
  },

  /** Vollen Baustapel leeren → Karten in den Nachziehstapel, neu mischen. */
  clearPile(pileIdx) {
    const g = State.game;
    const cleared = g.buildPiles[pileIdx];
    g.buildPiles[pileIdx] = [];
    g.drawPile = g.drawPile.concat(cleared);
    this.shuffle(g.drawPile);
    Events.emit('pile:cleared', { pile: pileIdx, count: cleared.length });
  },

  /** Gibt es für den Spieler irgendeinen legalen Bauzug? */
  hasAnyBuildMove(player) {
    const p = State.player(player);
    const cards = [...p.hand];
    if (p.stock.length) cards.push(p.stock[p.stock.length - 1]);
    p.discards.forEach(d => { if (d.length) cards.push(d[d.length - 1]); });
    return cards.some(c => [0, 1, 2, 3].some(i => this.isValidBuild(c, i)));
  },

  // ----------------------------------------------------------------
  // ZUGAUSFÜHRUNG
  // ----------------------------------------------------------------

  /** Quelle auflösen: { card, arr } oder null. Stock/Ablage: immer oberste Karte. */
  _source(player, source, index) {
    const p = State.player(player);
    switch (source) {
      case 'hand':    return { card: p.hand[index], arr: p.hand };
      case 'stock':   return { card: p.stock[p.stock.length - 1], arr: p.stock };
      case 'discard': {
        const arr = p.discards[index];
        if (!arr || arr.length === 0) return null;
        return { card: arr[arr.length - 1], arr };
      }
      default: return null;
    }
  },

  /**
   * Karte aus Quelle auf Baustapel legen.
   * @returns {boolean} true wenn gelegt
   */
  playToBuild(player, source, index, pileIdx) {
    const src = this._source(player, source, index);
    if (!src || !src.card) return false;
    if (!this.isValidBuild(src.card, pileIdx)) return false;

    State.game.buildPiles[pileIdx].push(src.card);
    if (source === 'hand') src.arr.splice(index, 1);
    else                   src.arr.pop();

    Events.emit('move:build', { player, source, index, card: src.card, pile: pileIdx });
    if (this.isPileComplete(pileIdx)) this.clearPile(pileIdx);
    return true;
  },

  /**
   * Handkarte auf Ablagestapel legen (nur aus der Hand erlaubt).
   * @returns {boolean} true wenn gelegt
   */
  playToDiscard(player, source, index, pileIdx) {
    if (source === 'stock') {
      I18n.say('stockNoDiscard', I18n.t(player === 'human' ? 'you' : 'ai'));
      return false;
    }
    if (source !== 'hand') return false;

    const p    = State.player(player);
    const card = p.hand[index];
    if (!card) return false;

    p.discards[pileIdx].push(card);
    p.hand.splice(index, 1);
    State.game.history[player].push(card.type === 'joker' ? 'joker' : card.value);

    Events.emit('move:discard', { player, source, index, card, pile: pileIdx });
    return true;
  },

  /** Nachziehen bis 5 Handkarten (oder Nachziehstapel leer). @returns Anzahl gezogen */
  drawToFive(player) {
    const p = State.player(player);
    const g = State.game;
    let n = 0;
    while (p.hand.length < 5 && g.drawPile.length > 0) {
      p.hand.push(g.drawPile.pop());
      n++;
    }
    if (n > 0) Events.emit('move:draw', { player, count: n });
    return n;
  },

  /** Sieger ermitteln: wer zuerst den Stock leer hat. null = läuft noch. */
  winner() {
    const h = State.game.players.human.stock.length;
    const a = State.game.players.ai.stock.length;
    if (h === 0) return { winner: 'human', loser: 'ai',    points: a * 5 };
    if (a === 0) return { winner: 'ai',    loser: 'human', points: h * 5 };
    return null;
  },

  /** Notwertung bei festgefahrenem Spiel: kleinerer Stock gewinnt (Gleichstand → Mensch). */
  winnerByStock() {
    const h = State.game.players.human.stock.length;
    const a = State.game.players.ai.stock.length;
    if (a < h) return { winner: 'ai',    loser: 'human', points: h * 5, stalemate: true };
    return       { winner: 'human', loser: 'ai',    points: a * 5, stalemate: true };
  }
};
