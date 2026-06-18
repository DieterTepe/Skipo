// ================================================================
//  view.js  –  Skip-Bo Mobile  (Modul 07 + 08 + 09)
//  VIEW/RENDERING + OVERLAY/EINSTELLUNGEN + SPIELER-EINGABE/TOUCH
// ----------------------------------------------------------------
//  Modul 07: zeichnet den Spielzustand ins DOM (updateView, ...).
//            Reines LESEN von Game-Daten - nie Spiellogik.
//  Modul 08: Overlay, Einstellungen, Menue.
//  Modul 09: Spieler-Eingabe, Touch/Klick, Drag&Drop.
//  Hinweis: enthaelt EINEN Top-Level-Aufruf addStockHighlightStyles()
//  (injiziert nur CSS in den <head>, idempotent, self-contained).
//  Wird per <script src=...view.js> VOR dem Haupt-Script geladen.
// ================================================================

// ================================================================
// MODUL 07 – VIEW & UI-RENDERING (ehem. Gruppe B)
// ================================================================
// Zeichnet den Spielzustand ins DOM. Reines Lesen von Game-Daten –
// hier wird NIE Spiellogik entschieden.
// Die HTML-Templates sind 1:1 aus v6.5.9 übernommen, damit alle
// CSS-Effekte (Kartenfarben, Glow, Animationen) identisch bleiben.
// ================================================================

/**
 * updateView() – Komplette UI neu zeichnen.
 * Wird nach jedem Spielzug aufgerufen um den aktuellen Spielstand anzuzeigen.
 * Auch nach jedem Einzelzug in Kombinationszügen.
 */
function updateView() {
  updateHand('human', document.getElementById('playerHand'));
  updateHand('ai',    document.getElementById('opponentHand'));
  updateStock('human', document.querySelector('.human-area    .field.stock'));
  updateStock('ai',    document.querySelector('.opponent-area .field.stock'));
  updateDrawPile(document.querySelector('.build-area .field.draw-pile'));
  updateBuildPiles();
  updateDiscardPiles();
  applyStockFieldBorders();
  // 🌐 v6.6.0: Feldbeschriftungen sprachecht UND mit LIVE-Zählern setzen.
  // FIX 11.6.2026: Die Zähler in „Stock (20)" / „Bau 1 (1)" standen seit
  // Spielstart eingefroren im HTML – jetzt werden sie bei jedem Render
  // aus dem echten Spielzustand aktualisiert.
  if (typeof refreshFieldLabels === 'function') refreshFieldLabels();
}

/**
 * cardFaceHTML(value) – Innenleben einer offenen Karte (4 Ecken + Mitte).
 * Zentrales Template damit alle Render-Funktionen identisch aussehen.
 * @param {string|number} value – Anzuzeigender Kartenwert
 * @returns {string} HTML-String
 */
function cardFaceHTML(value) {
  // Joker / Wild-Karte (value '★' oder 'SKIP-BO') -> SKIP-BO-Logo
  if (value === '\u2605' || value === 'SKIP-BO') {
    return `
        <div class="skipbo-logo mini tl">SKIP&middot;BO</div>
        <div class="skipbo-logo big-logo">SKIP&middot;<br>BO</div>
        <div class="skipbo-logo mini br">SKIP&middot;BO</div>`;
  }
  // Zahlenkarte: gerade Mittelzahl + zwei Eckzahlen (oben links / unten rechts)
  return `
        <div class="card-corner top-left">${value}</div>
        <div class="card-middle">${value}</div>
        <div class="card-corner bottom-right">${value}</div>`;
}

/**
 * cardBackHTML() – Innenleben einer verdeckten Karte (Rueckseite).
 * Symmetrisch: gruener Balken oben + unten, SKIP-BO-Logo waagerecht mittig
 * (steht dadurch nie verkehrt herum).
 * @returns {string} HTML-String
 */
function cardBackHTML() {
  return `
        <div class="back-bar"></div>
        <div class="back-logo">SKIP&middot;<br>BO</div>
        <div class="back-bar"></div>`;
}

/**
 * updateHand() – Handkarten eines Spielers rendern.
 * Spieler-Karten werden mit Werten angezeigt, KI-Karten als Rückseite.
 * @param {string} player – 'human' oder 'ai'
 * @param {HTMLElement} container – DOM-Element für die Hand
 */
function updateHand(player, container) {
  if (!container) return;
  container.innerHTML = Game.players[player].hand.map(card => `
    <div class="field card ${card.faceUp ? '' : 'backface'}"
         data-type="${card.type}" data-value="${card.value}">
      ${card.faceUp && player === 'human' ? cardFaceHTML(card.value) : cardBackHTML()}
    </div>`).join('');
}

/**
 * updateStock() – Stockstapel eines Spielers rendern.
 * Zeigt die oberste Karte und die Anzahl der verbleibenden Karten.
 * @param {string} player – 'human' oder 'ai'
 * @param {HTMLElement} container – DOM-Element für den Stock
 */
function updateStock(player, container) {
  if (!container) return;
  const stock = Game.players[player].stock;
  if (stock.length > 0) {
    const topCard = stock[stock.length - 1];
    container.innerHTML = `
      <div class="field card"
           data-type="${topCard.type}" data-value="${topCard.value}">${cardFaceHTML(topCard.value)}
        <div class="stock-count">${stock.length}</div>
      </div>`;
  } else {
    container.innerHTML = '<div class="field">🗃️ Leer</div>';
  }
}

/**
 * updateBuildPiles() – Alle 4 Baustapel rendern.
 * Zeigt die oberste Karte jedes Stapels. Joker werden mit ihrem Vertreter-Wert angezeigt.
 */
function updateBuildPiles() {
  document.querySelectorAll('.build-pile').forEach((pileEl, index) => {
    const cards = Game.buildPiles[index];
    if (cards.length > 0) {
      const topCard = cards[cards.length - 1];
      if (topCard.type === 'joker') {
        const jokerValue = getJokerValue(cards, cards.length - 1);
        pileEl.innerHTML = `
          <div class="field card"
               data-type="joker" data-value="joker"
               data-pile-index="${index}">${cardFaceHTML('\u2605')}
            <div class="joker-number">${jokerValue}</div>
          </div>`;
      } else {
        pileEl.innerHTML = `
          <div class="field card"
               data-type="${topCard.type}" data-value="${topCard.value}"
               data-pile-index="${index}">${cardFaceHTML(topCard.value)}
          </div>`;
      }
    } else {
      pileEl.innerHTML = `<div class="field" data-pile-index="${index}">Leer</div>`;
    }
  });
}

/**
 * updateDiscardPiles() – Alle Ablagestapel beider Spieler rendern.
 * Zeigt jeweils die oberste Karte jedes Ablagestapels.
 */
function updateDiscardPiles() {
  // Spieler-Ablagestapel
  document.querySelectorAll('.human-area .discard-field').forEach((pileEl, index) => {
    const cards = Game.players.human.discards[index];
    if (cards && cards.length > 0) {
      const topCard = cards[cards.length - 1];
      pileEl.innerHTML = `
        <div class="field card"
             data-type="${topCard.type}" data-value="${topCard.value}">${cardFaceHTML(topCard.value)}
        </div>`;
    } else {
      pileEl.innerHTML = '<div class="field">Leer</div>';
    }
  });

  // KI-Ablagestapel
  document.querySelectorAll('.opponent-area .discard-field').forEach((pileEl, index) => {
    const cards = Game.players.ai.discards[index];
    if (cards && cards.length > 0) {
      const topCard = cards[cards.length - 1];
      pileEl.innerHTML = `
        <div class="field card"
             data-type="${topCard.type}" data-value="${topCard.value}">${cardFaceHTML(topCard.value)}
        </div>`;
    } else {
      pileEl.innerHTML = '<div class="field">Leer</div>';
    }
  });
}

/**
 * updateDrawPile() – Nachziehstapel rendern.
 * Zeigt Rückseite wenn Karten vorhanden, sonst "Leer".
 * @param {HTMLElement} container – DOM-Element für den Nachziehstapel
 */
function updateDrawPile(container) {
  if (!container) return;
  if (Game.drawPile.length > 0) {
    container.innerHTML = `
      <div class="field card backface">${cardBackHTML()}
        <div class="stock-count">(${Game.drawPile.length})</div>
      </div>`;
  } else {
    container.innerHTML = '<div class="field">🃏 Leer</div>';
  }
}

/**
 * applyStockFieldBorders() – Animierten Regenbogen-Rahmen für den aktiven Spieler setzen.
 * Der aktive Spieler bekommt einen blinkenden Rahmen, der inaktive einen grauen.
 */
function applyStockFieldBorders() {
  const humanStockField = document.querySelector('.human-area    .field.stock');
  const aiStockField    = document.querySelector('.opponent-area .field.stock');
  if (!humanStockField || !aiStockField) return;

  humanStockField.classList.remove('animated-stock-border', 'static-stock-border');
  aiStockField   .classList.remove('animated-stock-border', 'static-stock-border');

  if (currentPlayer === 'human') {
    humanStockField.classList.add('animated-stock-border');
    aiStockField   .classList.add('static-stock-border');
  } else if (currentPlayer === 'ai') {
    aiStockField   .classList.add('animated-stock-border');
    humanStockField.classList.add('static-stock-border');
  }
}

/**
 * addStockHighlightStyles() – CSS für Stockrahmen einmalig in den Head injizieren.
 * Wird nur einmal ausgeführt (prüft ob Style-Tag bereits existiert).
 */
function addStockHighlightStyles() {
  if (document.getElementById('stock-highlight-style')) return;
  const style = document.createElement('style');
  style.id = 'stock-highlight-style';
  style.innerHTML = `
    .animated-stock-border {
      border:        4.5px solid;
      border-image:  linear-gradient(45deg, red, orange, yellow, green, blue, indigo, violet) 1;
      animation:     blinkActiveStock 1s linear infinite;
      border-radius: 8px;
    }
    .static-stock-border {
      border:        4.5px solid gray;
      border-radius: 8px;
    }
    @keyframes blinkActiveStock {
      0%   { filter: brightness(1);   }
      50%  { filter: brightness(1.5); }
      100% { filter: brightness(1);   }
    }
  `;
  document.head.appendChild(style);
}
// Direkt beim Laden aufrufen (nicht erst in initGame)
addStockHighlightStyles();

/**
 * showMessage(message) – Statusmeldung in der Infozeile anzeigen.
 * Schreibt in span#status-text statt in das gesamte Label,
 * damit der ⚙️-Menübutton nicht überschrieben wird.
 * @param {string} message – Anzuzeigende Nachricht (kann Emojis enthalten)
 */
function showMessage(message) {
  // 🌐 v6.6.0-Sprachmodul: Meldung in die aktive Sprache übersetzen
  if (typeof translateMessage === 'function') message = translateMessage(message);
  const statusText = document.getElementById('status-text');
  if (!statusText) {
    // Fallback: altes Verhalten falls Element nicht gefunden
    const statusLabel = document.getElementById('status-label');
    if (statusLabel) statusLabel.textContent = message;
    return;
  }
  statusText.textContent = message;
}

/**
 * enableDraggableStatusLabel() – Infozeile per Touch und Maus verschiebbar machen.
 * Bounce-Effekt beim Loslassen. Funktioniert auf Mobile und Desktop.
 * Label bleibt verschiebbar. Schriftgröße auf status-text angewendet.
 */
function enableDraggableStatusLabel() {
  const label = document.getElementById('status-label');
  if (!label) return;

  // Schrift-Styling auf den Text-Span anwenden
  const statusText = document.getElementById('status-text');
  if (statusText) {
    statusText.style.fontSize   = '1.5rem';
    statusText.style.color      = 'black';
    statusText.style.textShadow = '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff';
  }

  let isDragging = false, startY = 0, startTop = 0;

  const disableTransition = () => { label.style.transition = 'none'; };
  const enableTransition  = () => { label.style.transition = 'top 0.3s ease-out, transform 0.3s ease-out'; };
  const bounceEffect      = () => {
    label.style.transform = 'scale(1.15)';
    setTimeout(() => { label.style.transform = 'scale(1)'; }, 300);
  };

  // Maus-Events
  label.addEventListener('mousedown', e => {
    isDragging = true;
    startY     = e.clientY;
    startTop   = parseInt(window.getComputedStyle(label).top) || 0;
    disableTransition();
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    label.style.top = (startTop + (e.clientY - startY)) + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (isDragging) { enableTransition(); bounceEffect(); }
    isDragging = false;
  });

  // Touch-Events
  label.addEventListener('touchstart', e => {
    isDragging = true;
    startY     = e.touches[0].clientY;
    startTop   = parseInt(window.getComputedStyle(label).top) || 0;
    disableTransition();
    e.preventDefault();
  });
  document.addEventListener('touchmove', e => {
    if (!isDragging) return;
    label.style.top = (startTop + (e.touches[0].clientY - startY)) + 'px';
  });
  document.addEventListener('touchend', () => {
    if (isDragging) { enableTransition(); bounceEffect(); }
    isDragging = false;
  });
}


// ================================================================
// MODUL 08 – OVERLAY & EINSTELLUNGEN (ehem. Gruppe C)
// ================================================================

/**
 * addOverlayStyles() – CSS für das Einstellungs-Overlay einmalig injizieren.
 * Wird nur einmal ausgeführt (prüft ob Style-Tag bereits existiert).
 */
function addOverlayStyles() {
  if (document.getElementById('overlay-main-styles')) return;
  const style = document.createElement('style');
  style.id = 'overlay-main-styles';
  style.innerHTML = `
    #overlay-container {
      position:      fixed;
      top:           20%;
      left:          50%;
      transform:     translateX(-50%);
      width:         80%;
      height:        65%;
      background:    linear-gradient(to bottom, #000, #777);
      border-radius: 15px;
      z-index:       2000;
      display:       none;
      padding:       10px;
      border:        3px solid;
      border-image:  linear-gradient(45deg, red, orange, yellow, green, blue, indigo, violet) 1;
      animation:     flashBorder 5s linear infinite;
    }
    @keyframes flashBorder {
      0%   { filter: hue-rotate(  0deg); }
      100% { filter: hue-rotate(360deg); }
    }
    #overlay-header {
      position:      relative;
      height:        40px;
      margin-bottom: 10px;
    }
    #btn-uebernehmen {
      position:      absolute;
      top:           20px;
      left:          20px;
      width:         90px;
      height:        30px;
      background:    blue;
      color:         white;
      border:        none;
      border-radius: 5px;
      box-shadow:    0 4px 6px rgba(0, 0, 0, 0.3);
      cursor:        pointer;
      transition:    transform 0.2s;
    }
    #btn-uebernehmen:active { transform: scale(0.95); }
    #btn-schliessen {
      position:      absolute;
      top:           20px;
      right:         20px;
      height:        30px;
      width:         auto;
      background:    grey;
      color:         white;
      border:        none;
      border-radius: 5px;
      cursor:        pointer;
    }
    #input-name {
      position:      absolute;
      top:           20px;
      left:          calc(20px + 90px + 10px);
      right:         calc(20px + 70px + 10px);
      height:        20px;
      border-radius: 5px;
      border:        1px solid #ccc;
      padding:       5px;
    }
    #overlay-info {
      position:      absolute;
      top:           80px;
      left:          50%;
      transform:     translateX(-50%);
      width:         70%;
      bottom:        90px;
      background:    #eee;
      color:         black;
      overflow-y:    auto;
      padding:       10px;
      border-radius: 10px;
    }
    #overlay-info h1, #overlay-info h2, #overlay-info h3 { color: darkred; }
    #overlay-info p   { color: darkblack; margin-bottom: 10px; }
    #overlay-info li  { color: blue; }
    .speed-control-container {
      position:      absolute;
      bottom:        20px;
      left:          5%;
      right:         5%;
      display:       flex;
      align-items:   center;
      gap:           10px;
      padding:       10px;
      background:    rgba(0, 0, 0, 0.3);
      border-radius: 8px;
    }
    #speed-value {
      width:        110px;
      text-align:   center;
      margin-right: 10px;
      transform:    translateX(-10px);
    }
    .speed-label {
      font-size:  0.9rem;
      color:      #fff;
      width:      110px;
      text-align: center;
    }
    .speed-slider {
      flex:               1;
      max-width:          180px;
      margin:             0 10px;
      -webkit-appearance: none;
      height:             6px;
      background:         #ddd;
      border-radius:      3px;
      outline:            none;
    }
    .speed-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width:              18px;
      height:             18px;
      background:         #ffd700;
      border-radius:      50%;
      cursor:             pointer;
      transition:         transform 0.2s;
    }
  `;
  document.head.appendChild(style);
}

/**
 * showOverlay() – Einstellungs-Overlay anzeigen.
 * Erstellt das Overlay beim ersten Aufruf, danach nur anzeigen.
 */
function showOverlay() {
  addOverlayStyles();
  let overlay = document.getElementById('overlay-container');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'overlay-container';
    overlay.innerHTML = `
      <div id="overlay-header">
        <button id="btn-uebernehmen">${t('btnApply')}</button>
        <input
          type="text"
          id="input-name"
          placeholder="${t('phName')}"
          value="${playerName}"
        >
        <button id="btn-schliessen">${t('btnClose')}</button>
      </div>
      <div id="overlay-info">${createInfoText()}</div>
      <div class="speed-control-container">
        <span class="speed-label">${t('speedLabel')}</span>
        <input
          type="range"
          class="speed-slider"
          id="speed-slider"
          min="0" max="20"
          value="${spielGeschwindigkeit}"
          step="1"
        >
        <span class="speed-label" id="speed-value">${spielGeschwindigkeit}s</span>
      </div>
    `;
    document.body.appendChild(overlay);

    // "Übernehmen"-Button: Name und Geschwindigkeit speichern
    document.getElementById('btn-uebernehmen').addEventListener('click', function () {
      const newName = document.getElementById('input-name').value.trim();
      if (newName) {
        playerName = newName;
        const stockField = document.querySelector('.human-area .field.stock');
        if (stockField) stockField.setAttribute('data-label', ` ${newName} Stock (20)`);
        showMessage(`✅ Spielername geändert: ${newName}`);
      }
      spielGeschwindigkeit = parseInt(document.getElementById('speed-slider').value);
      try {
        localStorage.setItem('skipbo-speed', spielGeschwindigkeit);
        localStorage.setItem('skipbo-name-set', '1'); // Overlay nicht mehr beim Start zeigen
      } catch (e) {
        console.warn('⚠️ LocalStorage nicht verfügbar');
      }
      hideOverlay();
    });

    // Geschwindigkeits-Slider: Live-Anzeige des aktuellen Werts
    document.getElementById('speed-slider').addEventListener('input', function (e) {
      document.getElementById('speed-value').textContent = `${e.target.value}s`;
    });

    document.getElementById('btn-schliessen').addEventListener('click', hideOverlay);
  }

  // Aktuelle Werte ins Overlay einsetzen
  document.getElementById('input-name') .value        = playerName;
  document.getElementById('speed-slider').value       = spielGeschwindigkeit;
  document.getElementById('speed-value') .textContent = `${spielGeschwindigkeit}s`;
  overlay.style.display = 'block';
}

/**
 * hideOverlay() – Einstellungs-Overlay ausblenden.
 */
function hideOverlay() {
  const overlay = document.getElementById('overlay-container');
  if (overlay) overlay.style.display = 'none';
}

/**
 * createInfoText() – Spielregeln und Benutzerhinweise als HTML-String erzeugen.
 * @returns {string} HTML-formatierter Regeltext
 */
function createInfoText() {
  // 🌐 v6.6.0: Regeltext kommt aus dem Sprachmodul (DE/EN/PT/UK identisch strukturiert)
  if (typeof t === 'function') return t('rulesHtml');
  return `
    <h2>Spielregeln und Benutzerinformationen</h2>

    <p><strong>1. Ziel des Spiels:</strong><br>
    - Das Hauptziel ist es, alle Karten aus deinem Stockstapel abzulegen, um das Spiel zu gewinnen.<br>
    - Du kannst Karten auf die Baukartenstapel in aufsteigender Reihenfolge von 1 bis 12 ablegen.<br>
    - Joker können jede Karte ersetzen und haben keinen festen Wert.</p>

    <p><strong>2. Kartentypen:</strong><br>
    - Zahlenkarten: Karten mit Werten von 1 bis 12.<br>
    - Joker (★): Kann jede Karte ersetzen und wird flexibel verwendet.</p>

    <p><strong>3. Kartenmengen:</strong><br>
    - 144 Zahlenkarten (12 Sätze × 12 Karten) + 12 Joker = 156 Karten gesamt.</p>

    <p><strong>4. Spielstart:</strong><br>
    - Jeder Spieler erhält 5 Handkarten und 20 Stockkarten.<br>
    - Die restlichen Karten bilden den Nachziehstapel.</p>

    <p><strong>5. Spielverlauf:</strong><br>
    - Spieler legen abwechselnd Karten auf Baustapel oder Ablagestapel.<br>
    - Baustapel: aufsteigende Reihenfolge 1–12. Joker ersetzt jeden Wert.<br>
    - Vollständiger Baustapel (1–12) wird geleert und gemischt.<br>
    - Nachziehen bis 5 Handkarten vorhanden.<br>
    - Kein legaler Zug möglich → Karte auf Ablagestapel legen (Pflichtzug).<br>
    - Kurzes Drücken auf Ablagestapel: Karteninhalt anzeigen.</p>

    <p><strong>6. Spieleraktionen:</strong><br>
    - Karte antippen = Karte auswählen (leuchtet auf).<br>
    - Nochmals antippen = Auswahl aufheben.<br>
    - Zielstapel antippen = Karte dorthin legen.<br>
    - Infoleiste verschieben für optimale Sicht.</p>

    <p><strong>7. Spielgeschwindigkeit:</strong><br>
    - Schieberegler: 0s (sehr schnell) bis 20s (sehr langsam).<br>
    - Standard: 4s. Für KI-Analyse empfehlen sich 6–10s.</p>

    <p><strong>8. Spielende:</strong><br>
    - Wer zuerst seinen Stock leer hat, gewinnt.<br>
    - Verlierer erhält 5 Punkte pro verbleibender Stockkarte.</p>

    <p><strong>9. Hinweise:</strong><br>
    - 5 Sekunden drücken: Dieses Info-Fenster erneut öffnen.<br>
    - Infoleiste nach unten schieben für mehr Platz.</p>
  `;
}

// ================================================================
// MODUL 09 – SPIELER-EINGABE & TOUCH (ehem. Gruppe D)
// ================================================================
// Verbindet Klick/Touch des menschlichen Spielers mit der Engine.
// ================================================================

/**
 * setupTouchEvents() – Karten-Klick und Ablage-Events binden.
 * Wird nach jedem Spielzug erneut aufgerufen da die DOM-Elemente
 * durch innerHTML-Erneuerung ihre Event-Listener verlieren.
 * Wird nicht ausgeführt wenn das Spiel bereits beendet ist.
 */
function setupTouchEvents() {
  if (isGameOver) return;

  // Alle Karten: Klick zum Auswählen
  document.querySelectorAll('.card').forEach(card => {
    card.onclick = handleCardSelect;
  });

  // Baustapel und Spieler-Ablagestapel: Klick zum Ablegen
  document.querySelectorAll('.build-pile, .human-area .discard-field').forEach(field => {
    field.onclick = handleCardPlace;
  });
}

/**
 * handleCardSelect(event) – Karte des Spielers auswählen oder Auswahl aufheben.
 * Verhindert Auswahl von Baustapel-Karten (diese werden direkt als Ziel behandelt).
 * @param {Event} event – Click oder Touch-Event
 */
function handleCardSelect(event) {
  if (isGameOver) return;

  // Nachziehstapel hat keine Funktion → Klick komplett ignorieren (keine Auswahl)
  if (event.currentTarget.closest('.draw-pile')) return;

  // Klick auf Baustapel-Karte → als Ablege-Ziel behandeln wenn Karte ausgewählt
  if (event.currentTarget.closest('.build-pile')) {
    if (selectedCard) handleCardPlace(event);
    return;
  }

  // Klick auf Karte im EIGENEN Ablagestapel:
  if (event.currentTarget.closest('.human-area .discard-field')) {
    // a) Dieselbe bereits gewählte Ablagekarte erneut antippen → Auswahl aufheben
    //    (genau wie bei Hand- und Stockkarten).
    if (selectedCard === event.currentTarget) {
      event.currentTarget.classList.remove('selected');
      selectedCard   = null;
      selectedSource = null;
      selectedIndex  = null;
      showMessage('❌ Auswahl aufgehoben');
      return;
    }
    // b) Eine ANDERE Karte ist gewählt (z. B. Handkarte) → hier ablegen. So wird
    //    der Stapel auch erkannt, wenn schon Karten darin liegen.
    if (selectedCard) {
      handleCardPlace(event);
      return;
    }
    // c) Nichts gewählt → unten normal weiter (oberste Ablagekarte als Quelle wählen).
  }

  event.preventDefault();
  if (currentPlayer !== 'human') return;

  // Alle Markierungen entfernen
  document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));

  const cardElement = event.currentTarget;

  // Gleiche Karte nochmals antippen → Auswahl aufheben
  if (selectedCard === cardElement) {
    selectedCard  = null;
    selectedSource = null;
    selectedIndex  = null;
    showMessage('❌ Auswahl aufgehoben');
    return;
  }

  // Karte markieren und Quelle ermitteln
  cardElement.classList.add('selected');
  selectedCard   = cardElement;
  selectedSource = getSourceType(cardElement);
  selectedIndex  = getSourceIndex(cardElement);

  const sourceLabel = selectedSource === 'hand'    ? '✋ Hand'
                    : selectedSource === 'stock'   ? '🗃️ Stock'
                    : selectedSource === 'discard' ? '🗑️ Ablage'
                    : selectedSource;
  showMessage(`✅ ${cardElement.dataset.value} aus ${sourceLabel} gewählt – Ziel antippen`);
}

/**
 * handleCardPlace(event) – Ausgewählte Karte auf Bau- oder Ablagestapel legen.
 * Enthält alle Validierungen (Spieler am Zug, gültiger Zug, etc.).
 * @param {Event} event – Click oder Touch-Event
 */
function handleCardPlace(event) {
  if (isGameOver) return;
  event.preventDefault();

  if (!selectedCard) {
    showMessage('⚠️ Bitte zuerst eine Karte auswählen');
    return;
  }

  const el     = event.currentTarget || event.target;
  const target = el.closest('.build-pile') || el.closest('.discard-field');
  if (!target) return;

  if (currentPlayer !== 'human') {
    showMessage('⏳ Warte – KI ist am Zug!');
    return;
  }

  let success = false;
  const wasLastHandCard = selectedSource === 'hand' && Game.players.human.hand.length === 1;

  // Ziel: Baustapel
  if (target.classList.contains('build-pile') || target.closest('.build-pile')) {
    const buildPiles     = document.querySelectorAll('.build-pile');
    const actualPile     = target.classList.contains('build-pile') ? target : target.closest('.build-pile');
    const buildPileIndex = Array.from(buildPiles).indexOf(actualPile);

    if (handleBuildPileDrop(currentPlayer, selectedSource, selectedIndex, buildPileIndex)) {
      success = true;
      showMessage(`✅ Karte ${selectedCard.dataset.value} → 🏗️ Bau ${buildPileIndex + 1}`);
      // Nach letzter Handkarte: beide Spieler nachziehen
      if (wasLastHandCard) {
        drawCardsUntilFive('human');
        drawCardsUntilFive('ai');
      }
    } else {
      showMessage('❌ Dieser Zug ist nicht erlaubt');
    }

  // Ziel: Ablagestapel
  } else if (target.matches('.discard-field') || target.closest('.discard-field')) {
    const actualDiscard    = target.matches('.discard-field') ? target : target.closest('.discard-field');
    const discardPiles     = document.querySelectorAll('.human-area .discard-field');
    const discardPileIndex = Array.from(discardPiles).indexOf(actualDiscard);

    if (handleDiscardPileDrop(currentPlayer, selectedSource, selectedIndex, discardPileIndex)) {
      success = true;
      showMessage(`✅ Karte ${selectedCard.dataset.value} → 🗑️ Ablage ${discardPileIndex + 1} – KI am Zug`);
      switchPlayer();
    }
  }

  // Aufräumen nach erfolgreichem Zug
  if (success) {
    selectedCard   = null;
    selectedSource = null;
    selectedIndex  = null;
    document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    updateView();
    if (checkForWinner()) return;
    setupTouchEvents();
  }
}

/**
 * getSourceType(element) – Ermittelt woher eine Karte kommt.
 * @param {HTMLElement} element – DOM-Element der Karte
 * @returns {string|null} 'hand', 'stock', 'discard' oder null
 */
function getSourceType(element) {
  if (element.closest('.hand'))                  return 'hand';
  if (element.closest('.stock'))                 return 'stock';
  if (element.closest('.discard-field')) return 'discard';
  return null;
}

/**
 * getSourceIndex(element) – Index der Quelle in der Datenstruktur ermitteln.
 * Für Hand: Position in der Hand-Reihe.
 * Für Ablage: Index des Ablagestapels (0-3).
 * Für Stock: Immer 0.01 (Spezialwert für Stockkarte).
 * @param {HTMLElement} element – DOM-Element der Karte
 * @returns {number} Index
 */
function getSourceIndex(element) {
  if (element.closest('.hand')) {
    return Array.from(element.parentElement.children).indexOf(element);
  }
  if (element.closest('.discard-field')) {
    const discardPiles = document.querySelectorAll('.human-area .discard-field');
    return Array.from(discardPiles).indexOf(element.closest('.discard-field'));
  }
  return 0.01; // Sonderfall: Stockkarte (Wert 0.01 als Markierung)
}
