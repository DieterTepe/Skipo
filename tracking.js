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

  EMPTY: {
    spiele: 0, jokerGespielt: 0, jokerVerschwendet: 0, gegnerhilfe: 0,
    stockZuege: 0, stockVerpasst: 0, komboZuege: 0, handAbgebaut: 0,
    zugeGesamt: 0, siegerKI: 0
  },

  /** Laden + Ereignisse abonnieren. */
  init() {
    this.load();
    Events.on('ai:note',   d => this.observe(d.type, d));
    Events.on('game:over', w => this.gameEnd(w));
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

  /** Spielende: Spiel zählen, Sieg verbuchen, speichern. */
  gameEnd(result) {
    this.stats.spiele++;
    if (result.winner === 'ai') this.stats.siegerKI++;
    this.save();
  }
};
