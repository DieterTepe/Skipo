// ================================================================
//  tracking.js  –  Skipo 7.0.1   Namensraum: Tracking
//  TUNER-TRACKING (Statistik über 5 Spiele für die Tuner-Auswertung)
// ----------------------------------------------------------------
//  Braucht: Events, Store, State, I18n     Bietet: Tracking.stats, reset()
//
//  Hört auf Ereignisse (move:discard, ai:note, game:over) und zählt
//  KI-Verhalten mit. Die Auswertungs-Texte erzeugt ui-overlays aus
//  Tracking.stats. Nur die Statistik wird gespeichert (Store 'tuner').
//
//  WICHTIG (Reihenfolge): Tracking.init() muss VOR den UI-Hörern
//  laufen, damit beim game:over die Statistik schon aktualisiert ist,
//  wenn der Endscreen sie liest.
//
//  Änderung gegenüber 7.0.0: Jeder KI-Zug wird genau EINMAL gezählt.
//  (7.0.0 zählte live UND noch einmal beim Spielende → doppelt.)
//  Die Auswertungs-Schwellen in ui-overlays sind unverändert; sie
//  beziehen sich jetzt auf korrekte Zahlen.
// ================================================================

const Tracking = {
  stats: null,
  game:  null,        // Zähler des laufenden Spiels (beide Seiten)
  last:  null,        // Datensatz des zuletzt beendeten Spiels
  history: [],        // letzte 10 Spiele (Store 'stats')

  EMPTY: {
    spiele: 0, jokerGespielt: 0, jokerVerschwendet: 0, gegnerhilfe: 0,
    stockZuege: 0, stockVerpasst: 0, komboZuege: 0, handAbgebaut: 0,
    zugeGesamt: 0, siegerKI: 0
  },

  /** Laden + Ereignisse abonnieren. */
  init() {
    this.load();
    const h = Store.get('stats', []);
    this.history = Array.isArray(h) ? h : [];
    Events.on('game:start',  () => this.newGame());
    Events.on('ai:note',     d => this.observe(d.type, d));
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

  load() {
    const saved = Store.get('tuner', null);
    this.stats = { ...this.EMPTY };
    if (saved && typeof saved === 'object') {
      for (const k of Object.keys(this.EMPTY)) this.stats[k] = saved[k] || 0;
    }
    if (this.stats.spiele >= 10) this.reset(false);   // nach 10 Spielen automatisch neu
  },

  save() { Store.set('tuner', this.stats); },

  /** Zurücksetzen (Menü oder automatisch). */
  reset(announce = true) {
    this.stats = { ...this.EMPTY };
    this.save();
    if (announce) I18n.say('tunerReset');
  },

  /** Beobachtung verbuchen. */
  observe(type, data) {
    const s = this.stats;
    switch (type) {
      case 'kiMove': {
        const human  = State.player('human');
        const helped =
          human.stock.slice(-1)[0]?.value === data.cardValue + 1 ||
          human.discards.some(p => p[p.length - 1]?.value === data.cardValue + 1);
        s.zugeGesamt++;
        if (data.sourceType === 'hand')    s.handAbgebaut++;
        if (data.sourceType === 'stock')   s.stockZuege++;
        if (data.sourceType === 'discard') s.komboZuege++;
        if (data.cardType === 'joker') {
          s.jokerGespielt++;
          if (data.buildPileIndex <= 1) s.jokerVerschwendet++;
        }
        if (helped) s.gegnerhilfe++;
        break;
      }
      case 'missedStock':
        s.stockVerpasst++;
        break;
      default:
        break;   // discardStrategy u. a.: derzeit ohne Auswertung
    }
  },

  /** Spielende: Spiel zählen, Sieg verbuchen, Vergleich sichern. */
  gameEnd(result) {
    this.stats.spiele++;
    if (result.winner === 'ai') this.stats.siegerKI++;
    this.save();

    if (this.game) {
      // Letzter Zug des Siegers ist noch nicht per turn:change gezählt
      this.game[result.winner].turns++;
      this.last = { winner: result.winner, points: result.points, human: this.game.human, ai: this.game.ai,
                    stockLeft: { human: State.player('human').stock.length, ai: State.player('ai').stock.length } };
      this.history.push(this.last);
      while (this.history.length > 10) this.history.shift();
      Store.set('stats', this.history);
    }
  },

  /** Durchschnitt je Seite über die gespeicherten Spiele. */
  averages() {
    const n = this.history.length;
    const avg = side => {
      const o = { stock: 0, hand: 0, combo: 0, missed: 0, opened: 0, turns: 0, wins: 0 };
      for (const g of this.history) {
        for (const k of ['stock', 'hand', 'combo', 'missed', 'opened', 'turns']) o[k] += g[side][k];
        if (g.winner === side) o.wins++;
      }
      for (const k of ['stock', 'hand', 'combo', 'missed', 'opened', 'turns']) o[k] = n ? o[k] / n : 0;
      return o;
    };
    return { games: n, human: avg('human'), ai: avg('ai') };
  }
};
