// ================================================================
//  ui-render.js  –  Skipo 7.0.1   Namensraum: Render
//  ANZEIGE: Karten, Felder, Stapel, Meldung, KI-Marker, Hintergrund
// ----------------------------------------------------------------
//  Braucht: State, Rules, Events, I18n, Settings     Bietet: Render.*
//
//  Reines LESEN von State – hier wird nie Spiellogik entschieden.
//  Render hört auf Ereignisse und zeichnet. Die HTML-Vorlagen sind
//  1:1 aus 7.0.0 (Kartenfarben, Glow, Animationen bleiben identisch).
//
//  Regel 6: Render.all() ist der eine Einstieg nach Zustandsänderung.
//  Nach jedem Vollrender wird das Ereignis "render" gesendet (Input
//  wendet darauf die Auswahl-Markierung erneut an).
// ================================================================

const Render = {
  el: {},

  /** Elemente cachen und Ereignisse abonnieren. */
  init() {
    this.el = {
      playerHand:   document.getElementById('playerHand'),
      opponentHand: document.getElementById('opponentHand'),
      humanStock:   document.querySelector('.human-area .field.stock'),
      aiStock:      document.querySelector('.opponent-area .field.stock'),
      drawPile:     document.querySelector('.build-area .field.draw-pile'),
      buildPiles:   Array.from(document.querySelectorAll('.build-area .build-pile')),
      humanDiscards:Array.from(document.querySelectorAll('.human-area .discard-field')),
      aiDiscards:   Array.from(document.querySelectorAll('.opponent-area .discard-field')),
      statusText:   document.getElementById('status-text'),
      statusLabel:  document.getElementById('status-label'),
      container:    document.querySelector('.game-container')
    };

    Events.on('game:start',   () => { this.enable(true); this.predictionMarkers(null); this.all(); });
    Events.on('move:build',   () => this.all());
    Events.on('move:discard', () => this.all());
    Events.on('move:draw',    () => this.all());
    Events.on('pile:cleared', () => this.all());
    Events.on('turn:change',  () => this.borders());
    Events.on('game:over',    () => this.enable(false));
    Events.on('msg',          m  => this.message(I18n.t(m.key, ...m.args)));
    Events.on('ai:predict',   d  => this.predictionMarkers(d));
    Events.on('lang:change',  () => { this.labels(); this.all(); });
    Events.on('settings:change', d => {
      if (d.key === 'bg')   this.background();
      if (d.key === 'name') this.labels();
    });
  },

  // ----------------------------------------------------------------
  // VOLLRENDER
  // ----------------------------------------------------------------

  all() {
    if (!State.game) return;
    this.hand('human', this.el.playerHand);
    this.hand('ai',    this.el.opponentHand);
    this.stock('human', this.el.humanStock);
    this.stock('ai',    this.el.aiStock);
    this.drawPile();
    this.buildPiles();
    this.discardPiles();
    this.borders();
    this.labels();
    this.predictionMarkers(this._predict);   // Marker überleben das Neuzeichnen
    Events.emit('render');
  },

  // ----------------------------------------------------------------
  // KARTEN-VORLAGEN (1:1 aus 7.0.0)
  // ----------------------------------------------------------------

  /** Innenleben einer offenen Karte (Joker → SKIP·BO-Logo). */
  cardFaceHTML(value) {
    if (value === '\u2605' || value === 'SKIP-BO') {
      return `
        <div class="skipbo-logo mini tl">SKIP&middot;BO</div>
        <div class="skipbo-logo big-logo">SKIP&middot;<br>BO</div>
        <div class="skipbo-logo mini br">SKIP&middot;BO</div>`;
    }
    return `
        <div class="card-corner top-left">${value}</div>
        <div class="card-middle">${value}</div>
        <div class="card-corner bottom-right">${value}</div>`;
  },

  /** Innenleben einer verdeckten Karte. */
  cardBackHTML() {
    return `
        <div class="back-bar"></div>
        <div class="back-logo">SKIP&middot;<br>BO</div>
        <div class="back-bar"></div>`;
  },

  // ----------------------------------------------------------------
  // TEILRENDERINGS
  // ----------------------------------------------------------------

  hand(player, container) {
    if (!container) return;
    const faceUp = player === 'human';
    container.innerHTML = State.player(player).hand.map(card => `
    <div class="field card ${faceUp ? '' : 'backface'}"
         data-type="${card.type}" data-value="${card.value}">
      ${faceUp ? this.cardFaceHTML(card.value) : this.cardBackHTML()}
    </div>`).join('');
  },

  stock(player, container) {
    if (!container) return;
    const stock = State.player(player).stock;
    if (stock.length > 0) {
      const top = stock[stock.length - 1];
      container.innerHTML = `
      <div class="field card"
           data-type="${top.type}" data-value="${top.value}">${this.cardFaceHTML(top.value)}
        <div class="stock-count">${stock.length}</div>
      </div>`;
    } else {
      container.innerHTML = `<div class="field">🗃️ ${I18n.t('empty')}</div>`;
    }
  },

  drawPile() {
    const c = this.el.drawPile;
    if (!c) return;
    const n = State.game.drawPile.length;
    if (n > 0) {
      c.innerHTML = `
      <div class="field card backface">${this.cardBackHTML()}
        <div class="stock-count">(${n})</div>
      </div>`;
    } else {
      c.innerHTML = `<div class="field">🃏 ${I18n.t('empty')}</div>`;
    }
  },

  buildPiles() {
    this.el.buildPiles.forEach((pileEl, index) => {
      const cards = State.game.buildPiles[index];
      if (cards.length > 0) {
        const top = cards[cards.length - 1];
        if (top.type === 'joker') {
          const jv = Rules.jokerValue(cards, cards.length - 1);
          pileEl.innerHTML = `
          <div class="field card"
               data-type="joker" data-value="joker"
               data-pile-index="${index}">${this.cardFaceHTML('\u2605')}
            <div class="joker-number">${jv}</div>
          </div>`;
        } else {
          pileEl.innerHTML = `
          <div class="field card"
               data-type="${top.type}" data-value="${top.value}"
               data-pile-index="${index}">${this.cardFaceHTML(top.value)}
          </div>`;
        }
      } else {
        pileEl.innerHTML = `<div class="field" data-pile-index="${index}">${I18n.t('empty')}</div>`;
      }
    });
  },

  discardPiles() {
    const draw = (els, discards) => els.forEach((pileEl, index) => {
      const cards = discards[index];
      if (cards && cards.length > 0) {
        const top = cards[cards.length - 1];
        pileEl.innerHTML = `
        <div class="field card"
             data-type="${top.type}" data-value="${top.value}">${this.cardFaceHTML(top.value)}
        </div>`;
      } else {
        pileEl.innerHTML = `<div class="field">${I18n.t('empty')}</div>`;
      }
    });
    draw(this.el.humanDiscards, State.player('human').discards);
    draw(this.el.aiDiscards,    State.player('ai').discards);
  },

  /** Animierter Regenbogen-Rahmen für den aktiven Spieler, grau für den anderen. */
  borders() {
    const h = this.el.humanStock, a = this.el.aiStock;
    if (!h || !a) return;
    h.classList.remove('animated-stock-border', 'static-stock-border');
    a.classList.remove('animated-stock-border', 'static-stock-border');
    if (State.turn.player === 'human') {
      h.classList.add('animated-stock-border');
      a.classList.add('static-stock-border');
    } else {
      a.classList.add('animated-stock-border');
      h.classList.add('static-stock-border');
    }
  },

  /** Feldbeschriftungen sprachecht und mit Live-Zählern. */
  labels() {
    if (!State.game) return;
    const g   = State.game;
    const set = (el, txt) => { if (el) el.setAttribute('data-label', txt); };
    const nextNeeded = pile => {
      if (!pile || pile.length === 0) return 1;
      const top = pile[pile.length - 1];
      const v = top.type === 'joker' ? pile.length : top.value;
      return v >= 12 ? 1 : v + 1;
    };
    set(this.el.aiStock,    I18n.t('lblStockOpp',  g.players.ai.stock.length));
    set(this.el.humanStock, I18n.t('lblStockSelf', g.players.human.stock.length));
    this.el.aiDiscards.forEach((el, i)    => set(el, I18n.t('lblAblage', i + 1)));
    this.el.humanDiscards.forEach((el, i) => set(el, I18n.t('lblAblage', i + 1)));
    set(this.el.drawPile, I18n.t('lblNachzieh', g.drawPile.length));
    this.el.buildPiles.forEach((el, i) => set(el, I18n.t('lblBau', i + 1, nextNeeded(g.buildPiles[i]))));
  },

  /** Statusmeldung in der Infozeile. */
  message(text) {
    if (this.el.statusText) this.el.statusText.textContent = text;
    else if (this.el.statusLabel) this.el.statusLabel.textContent = text;
  },

  /** Blockade-Marker auf Baustapeln setzen (null = alle entfernen). */
  _predict: null,
  predictionMarkers(d) {
    this._predict = d || null;
    this.el.buildPiles.forEach(el => {
      el.classList.remove('ai-prediction-overlay');
      el.querySelectorAll('.strategy-tag').forEach(t => t.remove());
    });
    if (!d || !d.piles || d.piles.length === 0) return;
    d.piles.forEach(i => {
      const el = this.el.buildPiles[i];
      if (!el) return;
      el.classList.add('ai-prediction-overlay');
      const tag       = document.createElement('div');
      tag.className   = 'strategy-tag';
      tag.textContent = I18n.t('tagBlock', d.value, Math.round(d.confidence * 100));
      el.appendChild(tag);
    });
  },

  /** Hintergrund-Variablen aus Settings.bg auf :root setzen. */
  background() {
    const r  = document.documentElement;
    const bg = Settings.bg;
    r.style.setProperty('--bg-h', bg.h);
    r.style.setProperty('--bg-s', bg.s + '%');
    r.style.setProperty('--bg-l', bg.l + '%');
  },

  /** Spielfeld bedienbar / gesperrt (Spielende). */
  enable(on) {
    if (this.el.container) this.el.container.style.pointerEvents = on ? '' : 'none';
  }
};
