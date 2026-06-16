// ================================================================
//  engine.js  –  Skip-Bo Mobile  (Modul 05 + 06)
//  SPIELINITIALISIERUNG + SPIELREGELN & ZUG-ENGINE
// ----------------------------------------------------------------
//  Modul 05: initGame, buildDeck, shuffleDeck, dealCards,
//            initTracking, resetGameState, loadSavedSpeed ...
//  Modul 06: isValidBuildMove, handleBuildPileDrop,
//            handleDiscardPileDrop, clearBuildPile ... (Regeln)
//  WICHTIG: Engine-Funktionen fassen NIE das DOM an. Mensch und KI
//  nutzen dieselben Funktionen. Enthaelt nur Funktionsdeklarationen,
//  nichts laeuft beim Laden. Wird per <script src=...engine.js> VOR
//  dem Haupt-Script geladen -> global verfuegbar.
// ================================================================

// ================================================================
// MODUL 05 – SPIELINITIALISIERUNG (ehem. Gruppe A, Teil 2)
// ================================================================

/**
 * initGame() – Haupteinstiegspunkt für ein neues Spiel.
 * Ruft alle Initialisierungsfunktionen in der richtigen Reihenfolge auf.
 * Setzt alle globalen Variablen zurück, baut das Deck auf und verteilt Karten.
 */
async function initGame() {
  resetGameState();
  loadSavedSpeed();
  buildDeck();
  shuffleDeck(Game.deck);
  dealCards();
  initTracking();

  // KI-Startkarten ziehen (5 Handkarten)
  drawCardsUntilFive('ai');

  // UI aufbauen und erste Anzeige
  updateView();
  showMessage('🎮 Spiel gestartet – du bist am Zug!');
  enableDraggableStatusLabel();
  // showOverlay() nur beim allerersten Start anzeigen
  // (nicht bei jedem Neustart – lästig auf Mobile)
  const istErsterStart = !localStorage.getItem('skipbo-name-set');
  if (istErsterStart) showOverlay();
  setupTouchEvents();
  // Tuner-Tracking aus localStorage laden
  loadTunerTracking();

  // ⚙️-Menü-Button Event einbinden (nach DOMContentLoaded zuverlässig)
  const menuBtn = document.getElementById('menu-btn');
  if (menuBtn) {
    // Touch UND Click beide binden für maximale Mobile-Kompatibilität
    menuBtn.addEventListener('touchstart', e => {
      e.preventDefault();
      e.stopPropagation();
      toggleQuickMenu(e);
    }, { passive: false });
    menuBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      toggleQuickMenu(e);
    });
  }

  // Alte Strategie-Overlays entfernen
  // FIX 10.6.2026: el.remove() hätte hier markierte Baustapel-Felder
  // mitgelöscht – clearAiPredictionMarkers() nimmt nur Klasse/Tags.
  clearAiPredictionMarkers();

  // Falls KI als erstes dran ist (derzeit immer 'human' zuerst)
  if (currentPlayer === 'ai') setTimeout(() => aiTurn(0), 3000);
}

/**
 * resetGameState() – Alle globalen Variablen auf Ausgangszustand zurücksetzen.
 * Wird vor jedem neuen Spiel aufgerufen.
 */
function resetGameState() {
  isGameOver       = false;
  selectedCard     = null;
  selectedSource   = null;
  selectedIndex    = null;
  Joker_auf_Ablage = false;
  currentPlayer    = 'human';
  // tunerTracking wird NICHT hier zurückgesetzt – es akkumuliert über 5 Spiele.
  // Reset von tunerTracking: nur über resetTunerTracking() im Menü.

  // Spielfeld zurücksetzen
  Game.deck       = [];
  Game.buildPiles = [[], [], [], []];
  Game.drawPile   = [];
  Game.players.human.hand     = [];
  Game.players.human.stock    = [];
  Game.players.human.discards = [[], [], [], []];
  Game.players.ai.hand        = [];
  Game.players.ai.stock       = [];
  Game.players.ai.discards    = [[], [], [], []];
  Game.stockCardIsRemovable   = true;
}

/**
 * loadSavedSpeed() – Gespeicherte Spielgeschwindigkeit aus localStorage laden.
 */
function loadSavedSpeed() {
  try {
    const savedSpeed = localStorage.getItem('skipbo-speed');
    if (savedSpeed) spielGeschwindigkeit = parseInt(savedSpeed);
  } catch (e) {
    console.error('⚠️ Fehler beim Laden der Spielgeschwindigkeit:', e);
  }
}

/**
 * buildDeck() – Deck aufbauen: 12 Sätze × 12 Zahlenkarten + 12 Joker.
 * Gesamtkarten: 144 + 12 = 156 Karten.
 */
function buildDeck() {
  Game.deck = [];
  // 12 Sätze mit je den Werten 1-12
  for (let s = 0; s < 12; s++) {
    for (let n = 1; n <= 12; n++) {
      Game.deck.push({ type: 'number', value: n });
    }
  }
  // 12 Joker-Karten
  for (let j = 0; j < 12; j++) {
    Game.deck.push({ type: 'joker', value: '★' });
  }
}

/**
 * shuffleDeck(arr) – Fisher-Yates Algorithmus für zuverlässiges Mischen.
 * Mischt das übergebene Array in-place.
 * @param {Array} arr – Das zu mischende Array
 */
function shuffleDeck(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * dealCards() – Karten an Spieler verteilen.
 * Spieler: 5 Handkarten + 20 Stockkarten.
 * KI: 5 Handkarten + 20 Stockkarten.
 * Rest: Nachziehstapel.
 */
function dealCards() {
  Game.players.human.hand  = Game.deck.splice(0,  5);
  Game.players.ai.hand     = Game.deck.splice(0,  5);
  Game.players.human.stock = Game.deck.splice(0, 20);
  Game.players.ai.stock    = Game.deck.splice(0, 20);
  Game.drawPile            = Game.deck; // Rest = Nachziehstapel

  // Sichtbarkeit: Spieler sieht seine Karten, KI-Karten sind verdeckt
  Game.players.human.hand.forEach(card => card.faceUp = true);
  Game.players.ai.hand.forEach(card   => card.faceUp = false);
}

/**
 * initTracking() – KI-Tracking-Struktur initialisieren.
 * Verfolgt Deck-Zusammensetzung und Ablage-Historie für KI-Vorhersagen.
 * REPARIERT v6.6.0: deckComposition ist jetzt ein sauberes Objekt
 * { 1:12, 2:12, ..., 12:12, joker:12 } statt eines fehlerhaften
 * Misch-Arrays (in v6.5.9 liefen Wert-12- und Joker-Zugriffe ins Leere).
 */
function initTracking() {
  const composition = { joker: 12 };
  for (let v = 1; v <= 12; v++) composition[v] = 12;

  Game.tracking = {
    // Verbleibende Karten je Wert (Wahrscheinlichkeitsrechnung)
    deckComposition: composition,
    // Ablage-Historie beider Spieler (für detectConsecutiveDiscards)
    discardHistory: {
      human: { values: [], timestamps: [] },
      ai:    { values: [], timestamps: [] }
    },
    // Stock-Vorhersagen (für predictEnemyStock)
    stockPredictions: {
      human: { nextExpected: 1, confidence: 0 },
      ai:    { nextExpected: 1, confidence: 0 }
    }
  };
}


// ================================================================
// MODUL 06 – SPIELREGELN & ZUG-ENGINE (ehem. Gruppe E)
// ================================================================
// Die reinen Skip-Bo-Regeln. Diese Funktionen verändern NUR Daten
// (Game-Objekt) und fassen nie das DOM an. Sie werden von Spieler-
// Eingaben UND von der KI gleichermaßen benutzt.
// Erweiterungs-Regel: Regeländerungen passieren ausschließlich hier.
// ================================================================

/**
 * isValidBuildMove(card, buildPileIndex) – Prüft ob eine Karte auf einen Baustapel darf.
 * Regeln: Leerer Stapel → nur 1 oder Joker. Sonst: Karte = topCard + 1 oder Joker.
 * @param {Object} card – Kartenobjekt {type, value}
 * @param {number} buildPileIndex – Index des Ziel-Baustapels (0-3)
 * @returns {boolean}
 */
function isValidBuildMove(card, buildPileIndex) {
  const buildPile = Game.buildPiles[buildPileIndex];
  if (buildPile.length === 0) {
    return card.type === 'joker' || parseInt(card.value) === 1;
  }
  const topValue  = pileTopValue(buildPile);
  const cardValue = parseInt(card.value);
  return card.type === 'joker' || cardValue === (topValue + 1);
}

/**
 * isBuildPileComplete(buildPileIndex) – Prüft ob ein Baustapel vollständig ist (1-12).
 * @param {number} buildPileIndex – Index des Baustapels (0-3)
 * @returns {boolean}
 */
function isBuildPileComplete(buildPileIndex) {
  const buildPile = Game.buildPiles[buildPileIndex];
  if (buildPile.length === 0) return false;
  const topCard = buildPile[buildPile.length - 1];
  return topCard.value === 12 || (topCard.type === 'joker' && buildPile.length === 12);
}

/**
 * clearBuildPile(buildPileIndex) – Vollständigen Baustapel leeren und Karten mischen.
 * Die geleerten Karten werden dem Nachziehstapel hinzugefügt und neu gemischt.
 * @param {number} buildPileIndex – Index des Baustapels (0-3)
 */
function clearBuildPile(buildPileIndex) {
  if (isBuildPileComplete(buildPileIndex)) {
    const clearedCards = Game.buildPiles[buildPileIndex];
    Game.buildPiles[buildPileIndex] = [];
    Game.drawPile = Game.drawPile.concat(clearedCards);
    shuffleDrawPile();
  }
}

/**
 * shuffleDrawPile() – Nachziehstapel neu mischen (Fisher-Yates).
 */
function shuffleDrawPile() {
  shuffleDeck(Game.drawPile);
}

/**
 * handleBuildPileDrop(player, sourceType, sourceIndex, buildPileIndex)
 * Legt eine Karte auf einen Baustapel (Datenlogik, kein UI-Update).
 * Prüft Gültigkeit und entfernt Karte aus der Quelle.
 * @returns {boolean} true wenn erfolgreich
 */
function handleBuildPileDrop(player, sourceType, sourceIndex, buildPileIndex) {
  let card, sourceArray;

  // Quelle ermitteln
  switch (sourceType) {
    case 'hand':
      sourceArray = Game.players[player].hand;
      card        = sourceArray[sourceIndex];
      break;
    case 'stock':
      sourceArray = Game.players[player].stock;
      card        = sourceArray[sourceArray.length - 1]; // Immer oberste Stockkarte
      break;
    case 'discard':
      sourceArray = Game.players[player].discards[sourceIndex];
      if (sourceArray?.length > 0) {
        card = sourceArray[sourceArray.length - 1]; // Immer oberste Ablagekarte
      } else {
        return false;
      }
      break;
    default:
      return false;
  }

  if (!card) return false;

  // Gültigkeit prüfen und Karte legen
  if (isValidBuildMove(card, buildPileIndex)) {
    Game.buildPiles[buildPileIndex].push(card);
    if (sourceType === 'hand') sourceArray.splice(sourceIndex, 1);
    else sourceArray.pop();

    // Baustapel voll? → leeren und mischen
    if (isBuildPileComplete(buildPileIndex)) clearBuildPile(buildPileIndex);
    return true;
  }
  return false;
}

/**
 * handleDiscardPileDrop(player, sourceType, sourceIndex, discardPileIndex)
 * Legt eine Karte auf einen Ablagestapel (Datenlogik, kein UI-Update).
 * v6.6.0: Die alte KI-"Auto-Auswahl" wurde entfernt – die KI wählt
 * Karte UND Stapel jetzt vorab in playInDiscardPiles() (Modul 10)
 * und übergibt hier immer einen expliziten sourceIndex.
 * @returns {boolean} true wenn erfolgreich
 */
function handleDiscardPileDrop(player, sourceType, sourceIndex, discardPileIndex) {
  let card, sourceArray;
  switch (sourceType) {
    case 'hand':
      sourceArray = Game.players[player].hand;
      card        = sourceArray[sourceIndex];
      break;
    case 'stock':
      // Stockkarten dürfen NICHT auf Ablagestapel gelegt werden (Spielregel!)
      showMessage(`❌ ${player === 'human' ? 'Du' : 'KI'}: Stockkarten darf nicht abgelegt werden!`);
      return false;
    default:
      return false;
  }

  if (!card) return false;

  // Karte ablegen
  if (!Game.players[player].discards[discardPileIndex]) {
    Game.players[player].discards[discardPileIndex] = [];
  }
  Game.players[player].discards[discardPileIndex].push(card);
  sourceArray.splice(sourceIndex, 1);

  // Spieler-Ablage tracken (für KI-Analyse)
  if (player === 'human') {
    trackGameObservations('opponentDiscard', { cardValue: card.value });
  }

  // Deck-Komposition aktualisieren
  try {
    if (card?.value || card?.type === 'joker') {
      const key = card.type === 'joker' ? 'joker' : card.value;
      if (Game.tracking.deckComposition[key] > 0) Game.tracking.deckComposition[key]--;
      Game.tracking.discardHistory[player].values.push(key);
      Game.tracking.discardHistory[player].timestamps.push(Date.now());
    }
  } catch (e) { console.error('Tracking-Fehler:', e); }

  return true;
}

/**
 * drawCardsUntilFive(player) – Karten nachziehen bis die Hand 5 Karten hat.
 * Spieler-Karten werden face-up, KI-Karten face-down gezogen.
 * @param {string} player – 'human' oder 'ai'
 */
function drawCardsUntilFive(player) {
  while (Game.players[player].hand.length < 5 && Game.drawPile.length > 0) {
    const card  = Game.drawPile.pop();
    card.faceUp = (player === 'human');
    Game.players[player].hand.push(card);
  }
  updateView();
}

/**
 * getOpponentCriticalNumbers() – Welche Kartenwerte dem menschlichen Gegner direkt helfen.
 * Gibt die direkten Folgekarten des Gegner-Stocks und der Gegner-Ablagestapel zurück.
 * @returns {number[]} Array von kritischen Kartenwerten
 */
function getOpponentCriticalNumbers() {
  const criticalNumbers = [];
  const humanStock = Game.players.human.stock;

  // Stock-Top: die Karte direkt über dem Stock hilft dem Gegner
  if (humanStock.length > 0) {
    criticalNumbers.push(parseInt(humanStock[humanStock.length - 1].value) + 1);
  }

  // Ablagestapel-Tops: Folgekarten der obersten Ablagekarten
  Game.players.human.discards.forEach(pile => {
    if (pile.length > 0) {
      criticalNumbers.push(parseInt(pile[pile.length - 1].value) + 1);
    }
  });

  return [...new Set(criticalNumbers)]; // Duplikate entfernen
}

/**
 * getDiscardSequenceBonus(player, discardIndex, newCard) – Bonus für Sequenz auf Ablage.
 * +100 wenn neue Karte direkt unter die oberste Ablagekarte passt.
 * @returns {number} Bonus-Score
 */
function getDiscardSequenceBonus(player, discardIndex, newCard) {
  const pile = Game.players[player].discards[discardIndex];
  if (pile.length === 0) return 0.01;
  const topValue = pile[pile.length - 1].value;
  return (newCard.value === topValue - 1) ? 100 : 0;
}
