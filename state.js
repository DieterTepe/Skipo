// ================================================================
//  state.js  –  Skip-Bo Mobile  (Modul 03 + 04)
//  GLOBALER SPIELZUSTAND + ZENTRALE HILFSFUNKTIONEN
// ----------------------------------------------------------------
//  Modul 03: alle veraenderlichen Zustands-Variablen + das zentrale
//            Game-Objekt. Neue Zustands-Felder IMMER hier ergaenzen.
//  Modul 04: kleine, ueberall genutzte Helfer (Kartenwerte, Stapel).
//  Enthaelt NUR Deklarationen/Funktionen - nichts wird beim Laden
//  ausgefuehrt. Wird per <script src=...state.js> VOR dem Haupt-
//  Script geladen, daher sind alle Globals/Helfer ueberall verfuegbar.
// ================================================================

// ================================================================
// MODUL 03 – GLOBALER SPIELZUSTAND (ehem. Gruppe A, Teil 1)
// ================================================================
// Alle veränderlichen Spielzustands-Daten an EINEM Ort.
// Erweiterungs-Regel: Neue Zustands-Felder immer hier ergänzen,
// nie verstreut im Code anlegen.
// ================================================================

// Ausgewählte Karte des menschlichen Spielers
let selectedCard   = null; // DOM-Element der ausgewählten Karte
let selectedSource = null; // 'hand', 'stock' oder 'discard'
let selectedIndex  = null; // Index in der Quell-Datenstruktur

// KI-Zustandsvariablen
let Joker_auf_Ablage = false; // true wenn KI einen Joker abgelegt hat

// Spielzustand
let currentPlayer        = 'human';    // 'human' oder 'ai'
let playerName           = 'Spieler';  // Name des menschlichen Spielers
let spielGeschwindigkeit = 4;          // Pausendauer in Sekunden (0-20)
let currentGameId        = Date.now(); // Eindeutige ID für aktuelles Spiel
let isGameOver           = false;      // Verhindert Einfrieren durch Background-Loops

// Geschwindigkeits-Presets (für zukünftige Verwendung)
const GESCHWINDIGKEIT = { schnell: 1, mittel: 4, langsam: 10 };

// ── 5-SPIELE-TRACKING für Tuner-Auswertung ──────────────────────
// Speichert aggregierte Statistiken über die letzten 5 Spiele.
// Wird in localStorage gesichert und nach 5 Spielen ausgewertet.
// Reset: über den Reset-Button im ⚙️-Menü oder nach 10 Spielen automatisch.
let tunerTracking = {
  spiele:             0,      // Anzahl gespeicherter Spiele (0–5)
  jokerGespielt:      0,      // KI-Joker erfolgreich auf Baustapel gelegt
  jokerVerschwendet:  0,      // KI-Joker auf niedrigem Stapel (<4) ohne Stock-Vorteil
  gegnerhilfe:        0,      // KI hat dem Gegner direkt geholfen (Folgekarte gelegt)
  stockZuege:         0,      // Stockkarten erfolgreich auf Baustapel gelegt
  stockVerpasst:      0,      // Stockkarte wäre spielbar gewesen aber wurde nicht gespielt
  komboZuege:         0,      // Ablage→Bau Kombinationszüge ausgeführt
  handAbgebaut:       0,      // Gesamte Handkarten die auf Baustapel gelegt wurden
  zugeGesamt:         0,      // Gesamtzüge der KI (für Durchschnitt)
  siegerKI:           0,      // Spiele die die KI gewonnen hat
};

// Zentrales Spielobjekt – enthält alle Spielzustands-Daten
const Game = {
  deck:    [],                  // Gesamtes Deck (vor Verteilung)
  players: {
    human: {
      hand:     [],             // 5 Handkarten des Spielers
      stock:    [],             // 20 Stockkarten (Ziel: leer machen!)
      discards: [[], [], [], []] // 4 Ablagestapel des Spielers
    },
    ai: {
      hand:     [],             // 5 Handkarten der KI
      stock:    [],             // 20 Stockkarten der KI
      discards: [[], [], [], []] // 4 Ablagestapel der KI
    }
  },
  buildPiles: [[], [], [], []], // 4 gemeinsame Baustapel (1-12)
  drawPile:   [],               // Nachziehstapel
  tracking:   {}                // KI-Tracking-Daten (wird in initTracking() befüllt)
};

// ================================================================
// MODUL 04 – ZENTRALE HILFSFUNKTIONEN
// ================================================================
// Kleine, überall genutzte Helfer. Hier (und nur hier) liegt die
// EINE Wahrheit über Kartenwerte und Baustapel-Zustände.
// Erweiterungs-Regel: Wer neue Logik baut, nutzt diese Helfer
// statt eigene Wert-Berechnungen zu erfinden.
// ================================================================

/**
 * pauseForSeconds(multiplier) – Pausenfunktion für async KI-Züge.
 * Wartezeit = spielGeschwindigkeit × multiplier Sekunden.
 * Skaliert mit dem Geschwindigkeits-Slider (0 = keine Pausen).
 * @param {number} multiplier – Faktor (Standard: 1)
 * @returns {Promise}
 */
function pauseForSeconds(multiplier = 1) {
  return new Promise(resolve => {
    setTimeout(resolve, spielGeschwindigkeit * multiplier * 1000);
  });
}

/**
 * delayWithCallback(ms, callback) – Hilfsfunktion für verzögerte Callbacks.
 * (Aus v6.5.9 übernommen – wird für UI-Effekte genutzt.)
 */
function delayWithCallback(ms, callback) {
  setTimeout(callback, ms);
}

/**
 * cardNumericValue(card) – Numerischer Wert einer Karte.
 * Zahlenkarte → 1..12. Joker → 0 (Joker haben keinen festen Wert).
 * @param {Object} card – Kartenobjekt {type, value}
 * @returns {number}
 */
function cardNumericValue(card) {
  if (!card) return 0;
  return card.type === 'joker' ? 0 : parseInt(card.value, 10);
}

/**
 * pileTopValue(pile) – Effektiver Wert der obersten Baustapelkarte.
 * Leer → 0. Joker oben → Position im Stapel (= vertretener Wert).
 * Zahlenkarte → ihr Wert.
 * Zentrale Funktion: ersetzt verstreute Einzelberechnungen.
 * @param {Array} pile – Ein Baustapel-Array
 * @returns {number} 0..12
 */
function pileTopValue(pile) {
  if (!pile || pile.length === 0) return 0;
  const topCard = pile[pile.length - 1];
  return topCard.type === 'joker' ? pile.length : parseInt(topCard.value, 10);
}

/**
 * nextNeededOnPile(pile) – Welcher Wert wird als Nächstes auf dem
 * Baustapel benötigt? (TopWert + 1, bei leerem Stapel die 1.)
 * @param {Array} pile – Ein Baustapel-Array
 * @returns {number} 1..13 (13 = Stapel ist mit 12 voll, wird gleich geleert)
 */
function nextNeededOnPile(pile) {
  return pileTopValue(pile) + 1;
}

/**
 * getJokerValue(buildPile, jokerPosition) – Ermittelt welchen Wert ein Joker vertritt.
 * Position 0 → Wert 1. Sonst: Vorgängerkarte + 1.
 * @param {Array} buildPile – Der Baustapel-Array
 * @param {number} jokerPosition – Position des Jokers im Stapel
 * @returns {number} Effektiver Wert des Jokers
 */
function getJokerValue(buildPile, jokerPosition) {
  if (jokerPosition === 0) return 1;
  const previousCard = buildPile[jokerPosition - 1];
  return previousCard.type === 'joker'
    ? jokerPosition + 1
    : parseInt(previousCard.value) + 1;
}
