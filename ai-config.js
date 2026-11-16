// ================================================================
//  ai-config.js  –  Skipo 7.0.4   Namensräume: KI_STUFEN, KI_PLANNER, KONFIG
//  ALLE ZAHLEN DER KI AN EINEM ORT (reine Daten, kein Code)
// ----------------------------------------------------------------
//  Braucht: nichts     Wird gelesen von: ai-turn / ai-planner /
//                                         ai-eval / ai-analysis
//
//  1. KI_STUFEN  – was die Schwierigkeit ausmacht (Einstellungen im Spiel)
//  2. KI_PLANNER – Grenzen des Zugketten-Planers
//  3. KONFIG     – Gewichte der Einzelzug-Bewertung (bewährt, unverändert)
//
//  Jede Änderung hier verändert die Spielstärke. Deshalb vorher/nachher
//  mit tune-sim.js messen (Regel: ≥ 2000 gepaarte Spiele, zwei Seeds)
//  und mit test-sim.js die Regeln prüfen. Details: Projekt.md.
// ================================================================

// ── 1. SCHWIERIGKEITSSTUFEN ─────────────────────────────────────
// V = sichtbare Stockkarte des Gegners.
//   Leicht : null = ohne Blockade; Joker werden über die Heuristik gespielt.
//   Mittel : Blockade – Karte V-1 nicht spielen (außer die KI kann selbst
//            zudecken), V-2 nicht bei sichtbarer Brücke; Joker nur in
//            Planer-Ketten, am Zugende mit Folgekarten.
//   Schwer : zusätzlich die fünf Werte unten.
// Gemessen (2000 gepaarte Spiele): Mittel gegen Leicht 58 %,
// Schwer gegen Mittel 70 %, Schwer gegen Leicht 75 %.
const KI_STUFEN = {
  easy:   null,
  medium: {
    AVOID_DIST:       1,       // Sicherheitsabstand zur Karte V: 1 = nur V-1
    JOKER_KEEP:       false,   // Joker am Zugende in der Hand behalten und nie ablegen
    DISC_KEEP_USEFUL: 0,       // Ablage: Gewicht „Karte führt zur eigenen Stockkarte → behalten"
    DISC_DUP:         0,       // Ablage: Bonus „doppelt gehaltenen Wert zuerst ablegen"
    PREFER_HAND:      false    // gleiche Karte in Hand und Ablage → Handkarte spielen
  },
  hard: {
    AVOID_DIST:       3,       // auch V-2 und V-3 nicht spielen (4/5 brachten +1, 6 ±0)
    JOKER_KEEP:       true,    // +10 Punkte gegenüber „am Zugende einzeln verspielen"
    DISC_KEEP_USEFUL: 1500,    // zusammen mit DISC_DUP +4 Punkte
    DISC_DUP:         600,
    PREFER_HAND:      true     // +3,5 Punkte (umgekehrt gemessen: −3,3)
  }
};

// ── 2. ZUGKETTEN-PLANER ─────────────────────────────────────────
const KI_PLANNER = {
  MAX_DEPTH:                14,     // längste Kette (Einzelzüge), die durchsucht wird
  MAX_NODES:                6000,   // Obergrenze untersuchter Zustände (Handy: < 50 ms)
  MAX_JOKERS_PER_CHAIN:     2,      // so viele Joker darf eine Kette verbrauchen
  RISK_OPP_STOCK_LIMIT:     5,      // Hand-leeren-Kette prüfen, wenn Gegner-Stock ≤ …
  DISCARD_KEEP_COMBO_MALUS: 400,    // Ablage: Glieder einer Hand-Kette nicht wegwerfen
  CHAIN_MOVE_PAUSE:         1.0     // Pause zwischen Kettenzügen (× Tempo)
};

// ── 3. BEWERTUNG DER EINZELZÜGE ─────────────────────────────────
// Die Namen SCORE_n stammen aus dem früheren Tuner und bleiben, damit
// Messreihen vergleichbar sind. Die KI spielt jeden Zug, der übrig
// bleibt; diese Werte bestimmen die Reihenfolge, die Ablage und in
// „Leicht" den Joker-Einsatz.
const KONFIG = {

  // Handkarte → Baustapel (AI.Eval.scoreHand)
  SCORE_5:            1918,   // Grundwert
  SCORE_9:            1,      // Bonus: Stapel ist kürzer als der längste
  SCORE_12:           1,      // × Lücke zwischen Kartenwert und Stapelwert

  // … Abzug „hilft dem Gegner" (AI.Eval.blockingPotential)
  SCORE_1:            355,    // Gegner zeigt die Folgekarte (Wert+1)
  SCORE_2:            2120,   // … weniger streng, wenn der eigene Stock ≤ 5 ist
  SCORE_28:           350,    // Gegner zeigt die Vorgängerkarte (Wert-1)
  SCORE_29:           1420,   // … zusätzlich bei Gegner-Stock ≤ 3
  SCORE_4_OPP_JOKER:  17,     // Gegner zeigt einen Joker, Karte ≥ 5
  SCORE_30:           24,     // … zusätzlich bei Gegner-Stock ≤ 3
  SCORE_22:           1,      // Gegner-Stock 4–5 und Karte ist für ihn kritisch
  SCORE_3:            10,     // Karte füllt die Lücke zwischen zwei Gegnerkarten
  SCORE_4_JOKER_MOVE: 105,    // Zuschlag für jeden Joker-Zug

  // … Joker aus der Hand (AI.Eval.jokerOnBuild, nur „Leicht" spielt so)
  JOKER_STOCK_AGGRESSION: 0.20,   // 0..1 – wie bereitwillig Joker eingesetzt werden
  SCORE_39:           2151,   // früher Joker, Stockkarte spielbar
  SCORE_6:            89,     // früher Joker ohne Nutzen
  SCORE_7:            1626,   // Joker steht für den Wert der eigenen Stockkarte
  SCORE_8:            5,      // × Zukunftswert des Jokers
  SCORE_25:           5,      // Zukunftswert: Joker-Wert liegt im eigenen Stock
  SCORE_21A:          1,      // Zukunftswert: Stapel steht bei 8 oder höher
  SCORE_40:           0.45,   // Joker nur über diesem Anteil des Durchschnitts
  SCORE_41:           30,     // Mindestwert, wenn nur Joker-Züge übrig sind
  SCORE_42:           0.85,   // Faktor auf jeden Joker-Zug

  // Stockkarte → Baustapel (AI.Eval.scoreStock)
  SCORE_10:           7539,   // Grundwert
  SCORE_10_ADV:       8035,   // je Baustapel mit mehr als 6 Karten
  SCORE_24:           14862,  // Obergrenze

  // Oberste Ablagekarte → Baustapel (AI.Eval.scoreDiscard)
  SCORE_26:           30,     // Grundwert (+ Kartenwert × 50)
  SCORE_27:           20,     // Ersatz, falls der Kartenwert keine Zahl ist
  SCORE_23:           97,     // der eigene Stock enthält die Folgekarte
  SCORE_36:           1,      // auf einer anderen eigenen Ablage liegt ein Joker oben

  // Zuschläge nach Spiellage (AI.Eval.filter)
  SCORE_34_HIGH:      3271,   // Karte = erwarteter Gegnerwert, Gegner-Stock < 10
  SCORE_34_LOW:       384,    // … Gegner-Stock ≥ 10
  SCORE_35:           142,    // Karte unterbricht eine Ablage-Serie des Gegners

  // Pflicht-Ablage: welche Karte (AI.discard, Karten-Term)
  SCORE_33:           18,     // Joker ablegen
  SCORE_38:           1,      // × Abstand zur eigenen Stockkarte
  SCORE_37:           189,    // die Folgekarte ist für den Gegner kritisch
  // Pflicht-Ablage: auf welchen Stapel (Stapel-Term)
  SCORE_14:           84,     // Karte entspricht einer sichtbaren Gegnerkarte
  SCORE_16:           3,      // leerer Ablagestapel
  SCORE_17:           3,      // Karte kleiner als die Oberkarte
  SCORE_15:           46,     // Karte genau eins kleiner (absteigende Serie)
  SCORE_18:           1,      // Karte genau eins größer
  SCORE_19:           1,      // × Stapelhöhe (Abzug)
  SCORE_20:           1097,   // Stapel enthält Werte, die der Gegner sichtbar hat
  JOKER_PROTECT_DISCARD_PENALTY: 1352,   // Joker oben auf der Ablage nicht verdecken

  // Joker im Stock und am Zugende (AI.Analysis.jokerStockTop / jokerHand / jokerCombo)
  JOKER_NO_FOLLOWUP_THRESHOLD:  1,      // Mindestzahl eigener Folgekarten
  JOKER_COMBO_MIN_GAIN:         1,      // Mindest-Folgekarten für Ablage+Joker
  JOKER_STOCK_COMBO_BONUS:      183,    // Wert einer Kombination, die zur Stockkarte führt
  JOKER_COMBO_STOCK_MULTIPLIER: 1.94,   // … Faktor darauf

  // Ketten in der Hand (AI.Analysis.handCombo)
  HAND_COMBO_MIN_LENGTH:               2,      // ab so vielen Karten zählt eine Kette
  HAND_COMBO_BONUS_PER_CARD:           1137,   // Bonus je Kettenkarte
  HAND_COMBO_JOKER_BRIDGE_BONUS:       229,    // je Joker als Brücke
  HAND_COMBO_STOCK_CONNECT_MULTIPLIER: 1.02    // Kette endet direkt vor der Stockkarte
};
