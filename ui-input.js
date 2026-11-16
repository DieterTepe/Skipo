// ================================================================
//  ui-input.js  –  Skipo 7.0.5   Namensraum: Input
//  SPIELER-EINGABE: Auswahl, Ablegen, Long-Press, verschiebbare Infozeile
// ----------------------------------------------------------------
//  Braucht: State, Flow, Events, I18n, Overlays     Bietet: Input.init()
//
//  Ein einziger delegierter Klick-Hörer auf dem Spielfeld (keine
//  Neu-Bindung nach jedem Zug). Die Auswahl ist ein Datensatz
//  {source, index}, kein DOM-Element – sie überlebt jedes Neuzeichnen.
//
//  Bedienregeln:
//    • Karte in Hand / Stock / eigener Ablage antippen → wählen,
//      nochmals antippen → abwählen.
//    • Baustapel antippen (mit Auswahl) → legen.
//    • Eigener Ablagestapel antippen: gleiche Karte gewählt → abwählen;
//      andere Auswahl → dort ablegen; nichts gewählt → oberste Karte wählen.
//    • Nachziehstapel: ohne Funktion.
//    • Langes Drücken (1 s) auf Ablagestapel (beide Seiten) → Inhalt.
//  Nur Karten im EIGENEN Bereich sind wählbar.
// ================================================================

const Input = {
  selection: null,        // { source: 'hand'|'stock'|'discard', index }
  pressTimer: null,

  init() {
    const container = document.querySelector('.game-container');
    if (!container) return;

    container.addEventListener('click', e => this.onClick(e));

    // Long-Press auf Ablagestapel (beide Seiten)
    const startPress = e => {
      const field = e.target.closest('.discard-field');
      if (!field) return;
      const area   = field.closest('.human-area') ? 'human' : field.closest('.opponent-area') ? 'ai' : null;
      if (!area) return;
      const fields = Array.from(field.parentElement.querySelectorAll('.discard-field'));
      const idx    = fields.indexOf(field);
      clearTimeout(this.pressTimer);
      this.pressTimer = setTimeout(() => Overlays.infoWindow(field, idx, area), 1000);
    };
    const endPress = () => clearTimeout(this.pressTimer);
    container.addEventListener('touchstart', startPress, { passive: true });
    container.addEventListener('mousedown',  startPress);
    container.addEventListener('touchend',   endPress);
    container.addEventListener('touchmove',  endPress, { passive: true });
    container.addEventListener('mouseup',    endPress);
    container.addEventListener('mouseleave', endPress);

    Events.on('render',      () => this.highlight());
    Events.on('turn:change', () => this.clear());
    Events.on('game:start',  () => this.clear());
    Events.on('game:over',   () => this.clear());

    this.enableDraggableLabel();
  },

  // ----------------------------------------------------------------
  // KLICK-VERARBEITUNG
  // ----------------------------------------------------------------

  onClick(e) {
    if (State.turn.over) return;
    const t = e.target;

    if (t.closest('.draw-pile')) return;                       // ohne Funktion

    const buildPile = t.closest('.build-pile');
    if (buildPile) { this.placeOnBuild(buildPile); return; }

    const ownDiscard = t.closest('.human-area .discard-field');
    if (ownDiscard) { this.tapOwnDiscard(ownDiscard); return; }

    const card = t.closest('.card');
    if (!card) return;
    if (card.closest('#playerHand'))              { this.toggleSelect('hand', this.indexIn(card, '#playerHand'), card); return; }
    if (card.closest('.human-area .field.stock')) { this.toggleSelect('stock', 0, card); return; }
    // Karten im Gegnerbereich: nicht wählbar
  },

  /** Index einer Karte innerhalb eines Containers. */
  indexIn(card, selector) {
    const parent = card.closest(selector);
    return Array.from(parent.children).indexOf(card);
  },

  /** Auswahl setzen / aufheben. */
  toggleSelect(source, index, cardEl) {
    if (!Flow.humanCanAct()) return;
    if (this.isSelected(source, index)) {
      this.clear();
      I18n.say('deselected');
      return;
    }
    this.selection = { source, index };
    this.highlight();
    const label = source === 'hand'  ? I18n.t('srcHand')
                : source === 'stock' ? I18n.t('srcStock')
                :                      I18n.t('srcDiscard');
    I18n.say('selected', cardEl.dataset.value, label);
  },

  isSelected(source, index) {
    return !!this.selection && this.selection.source === source && this.selection.index === index;
  },

  /** Ziel: Baustapel. */
  placeOnBuild(pileEl) {
    if (!this.selection) { I18n.say('selectFirst'); return; }
    if (!Flow.humanCanAct()) { I18n.say('waitAi'); return; }
    const piles = Array.from(document.querySelectorAll('.build-area .build-pile'));
    const pile  = piles.indexOf(pileEl);
    const value = this.selectedValue();
    const sel   = this.selection;
    if (Flow.humanBuild(sel.source, sel.index, pile)) {
      this.clear();
      I18n.say('cardToBuild', value, pile + 1);
    } else {
      I18n.say('notAllowed');
    }
  },

  /** Ziel oder Quelle: eigener Ablagestapel. */
  tapOwnDiscard(fieldEl) {
    const fields = Array.from(document.querySelectorAll('.human-area .discard-field'));
    const idx    = fields.indexOf(fieldEl);
    const hasCard = !!fieldEl.querySelector('.card');

    // a) dieselbe Ablagekarte erneut angetippt → abwählen
    if (this.isSelected('discard', idx)) {
      this.clear();
      I18n.say('deselected');
      return;
    }
    // b) andere Karte gewählt → hier ablegen
    if (this.selection) {
      if (!Flow.humanCanAct()) { I18n.say('waitAi'); return; }
      const value = this.selectedValue();
      const sel   = this.selection;
      if (Flow.humanDiscard(sel.source, sel.index, idx)) {
        this.clear();
        I18n.say('cardToDiscard', value, idx + 1);
      }
      return;
    }
    // c) nichts gewählt → oberste Ablagekarte als Quelle wählen
    if (hasCard) this.toggleSelect('discard', idx, fieldEl.querySelector('.card'));
    else I18n.say('selectFirst');
  },

  /** Anzeigewert der gewählten Karte (für Meldungen). */
  selectedValue() {
    const el = this.selectedElement();
    return el ? el.dataset.value : '';
  },

  /** DOM-Element der Auswahl (nach jedem Render neu ermittelt). */
  selectedElement() {
    const s = this.selection;
    if (!s) return null;
    if (s.source === 'hand') {
      const hand = document.getElementById('playerHand');
      return hand ? hand.children[s.index] || null : null;
    }
    if (s.source === 'stock') return document.querySelector('.human-area .field.stock .card');
    const fields = document.querySelectorAll('.human-area .discard-field');
    return fields[s.index] ? fields[s.index].querySelector('.card') : null;
  },

  /** Markierung auf das gewählte Element anwenden. */
  highlight() {
    document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
    const el = this.selectedElement();
    if (el) el.classList.add('selected');
    else if (this.selection) this.selection = null;      // Karte existiert nicht mehr
  },

  clear() {
    this.selection = null;
    document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
  },

  // ----------------------------------------------------------------
  // VERSCHIEBBARE INFOZEILE
  // ----------------------------------------------------------------

  enableDraggableLabel() {
    const label = document.getElementById('status-label');
    if (!label) return;
    let dragging = false, startY = 0, startTop = 0;

    const off    = () => { label.style.transition = 'none'; };
    const on     = () => { label.style.transition = 'top 0.3s ease-out, transform 0.3s ease-out'; };
    const bounce = () => {
      label.style.transform = 'scale(1.15)';
      setTimeout(() => { label.style.transform = 'scale(1)'; }, 300);
    };

    label.addEventListener('mousedown', e => {
      dragging = true; startY = e.clientY;
      startTop = parseInt(window.getComputedStyle(label).top) || 0;
      off(); e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      label.style.top = (startTop + (e.clientY - startY)) + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (dragging) { on(); bounce(); }
      dragging = false;
    });

    label.addEventListener('touchstart', e => {
      dragging = true; startY = e.touches[0].clientY;
      startTop = parseInt(window.getComputedStyle(label).top) || 0;
      off(); e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchmove', e => {
      if (!dragging) return;
      label.style.top = (startTop + (e.touches[0].clientY - startY)) + 'px';
    }, { passive: true });
    document.addEventListener('touchend', () => {
      if (dragging) { on(); bounce(); }
      dragging = false;
    });
  }
};
