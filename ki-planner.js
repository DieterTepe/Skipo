// ================================================================
//  ki-planner.js  –  Skip-Bo Mobile  (Modul 02)
//  KI-PLANER-KONFIGURATION (Zugketten-Planung, steuert Modul 11)
// ----------------------------------------------------------------
//  Liegt BEWUSST getrennt von KONFIG/konfig.js:
//   - Eine neue Tuner-Ausgabe ersetzt nur konfig.js (KONFIG).
//   - Dieser Planer bleibt beim Werte-Tausch immer erhalten.
//  Wird per <script src=...ki-planner.js> VOR dem Haupt-Script
//  geladen, daher ist KI_PLANNER im ganzen Spiel verfuegbar.
// ================================================================

// ================================================================
// MODUL 02 – KI-PLANER-KONFIGURATION (NEU v6.6.0)
// ================================================================
// Diese Werte steuern die NEUE Zugketten-Planung der KI (Modul 11).
// Sie liegen BEWUSST AUSSERHALB von KONFIG:
//   → Der Tuner-Output ersetzt nur den KONFIG-Block.
//   → Der Planer bleibt beim Werte-Tausch immer erhalten.
// Der Planer arbeitet REGELBASIERT (sucht garantierte Zugketten)
// und ergänzt die getunte Score-Heuristik – er ersetzt sie nicht.
// Alle "unklaren" Entscheidungen trifft weiterhin die getunte KI.
// ================================================================
const KI_PLANNER = {

  ENABLED: true,
  // Hauptschalter für den Zugketten-Planer.
  // true  = KI sucht vor jedem Zug nach garantierten Stockabbau-Ketten
  //         und nach Hand-leeren-Ketten (deutlich stärkere KI).
  // false = exaktes Verhalten wie v6.5.9 (nur Score-Heuristik).

  MAX_DEPTH: 14,
  // Maximale Kettenlänge (Anzahl Einzelzüge) die der Planer durchsucht.
  // 14 reicht für: 5 Handkarten + mehrere Ablage- und Stockzüge.
  // Höher = gründlicher, aber mehr Rechenzeit pro Zug.

  MAX_NODES: 6000,
  // Sicherheitslimit für die Zustandssuche (Anzahl untersuchter
  // Spielzustände). Verhindert Ruckeln auf schwachen Handys.
  // 6000 Zustände sind auf Mobilgeräten in < 50 ms durchsucht.

  MAX_JOKERS_PER_CHAIN: 2,
  // Wie viele Joker darf eine geplante Kette maximal verbrauchen?
  // Joker sind wertvoll – der Planer setzt sie nur ein wenn die
  // Kette dadurch Stockkarten spielt oder die Hand leert.

  REDRAW_ON_EMPTY_HAND: true,
  // Offizielle Skip-Bo-Regel: Wer alle 5 Handkarten in einem Zug
  // spielt, zieht sofort 5 neue und spielt weiter.
  // true  = KI nutzt diese Regel (wie der menschliche Spieler).
  // false = altes v6.5.9-Verhalten (KI zog erst am Zugende nach).

  HAND_CLEAR_ENABLED: true,
  // true = Planer sucht aktiv nach Ketten die die KOMPLETTE Hand
  // auf die Baustapel spielen (→ 5 neue Karten = großer Tempogewinn).

  RISK_CHECK: true,
  // Sicherheits-Wächter für Hand-leeren-Ketten:
  // true = Eine Hand-leeren-Kette OHNE eigenen Stockabbau wird
  // verworfen, wenn der Gegner-Stock bereits klein ist (s.u.) und
  // die Kette ihm eine direkte Folgekarte auf den Baustapeln freilegt.
  // Stockabbau-Ketten sind davon nie betroffen (Stockabbau = Spielziel).

  RISK_OPP_STOCK_LIMIT: 5,
  // Ab wie wenigen Gegner-Stockkarten der RISK_CHECK greift.

  DISCARD_KEEP_COMBO_MALUS: 400,
  // NEU: Schutz beim Pflicht-Ablegen.
  // Karten die Teil einer erkannten Hand-Kette sind (Gruppe M)
  // bekommen diesen Malus als Ablage-Kandidat → die KI wirft keine
  // Kettenglieder mehr weg. 0 = Schutz aus.

  CHAIN_MOVE_PAUSE: 1.0,
  // Pausen-Multiplikator zwischen den Einzelzügen einer geplanten
  // Kette (× Spielgeschwindigkeit). 1.0 = gleiches Tempo wie die
  // normalen KI-Züge – jeder Ketten-Zug bleibt gut sichtbar.
};
