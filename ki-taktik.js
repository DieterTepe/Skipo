// ================================================================
//  ki-taktik.js  –  Skipo 7.0.2   Namensraum: KI_TAKTIK
//  BLOCKADE-TAKTIK GEGEN DIE SICHTBARE GEGNER-STOCKKARTE
// ----------------------------------------------------------------
//  Eigener Block wie KI_PLANNER: wird beim Einfügen einer Tuner-
//  Ausgabe (konfig.js) NICHT überschrieben.
//
//  Kernidee: Die oberste Stockkarte des Gegners ist sichtbar (Wert V).
//  Ein Baustapel, dessen nächster benötigter Wert V ist, steht
//  „offen" – der Gegner legt seine Stockkarte sofort ab. Die KI
//  konnte bisher nie einen Zug verweigern; jetzt kann sie es.
//
//  Alle Werte mit tune-sim.js gemessen (KI gegen KI, gepaarte Spiele,
//  2000 je Messung). Ergebnis der Gesamt-Einstellung gegen 7.0.1:
//  59 % Siegrate (±2), gegen den einfachen Bot 80 % statt 73 %.
//  Details in Projekt.md, Abschnitt 10.
//
//  ENABLED: false → KI verhält sich exakt wie 7.0.1/7.0.0
//  (test-sim.js nutzt das für den Äquivalenzbeweis).
// ================================================================

let KI_TAKTIK = {
  ENABLED:               true,

  // ── WIRKSAM (gemessen) ────────────────────────────────────────
  // Öffnende Züge verweigern: Karte V-1 aus Hand/Ablage NICHT spielen,
  // wenn die KI die Deckkarte (V oder Joker) nicht selbst nachlegen kann.
  // Grenze = Gegner-Stock ≤ AVOID_OPEN_LIMIT (20 = immer; 12 → +3,7, 6 → +1,5, 20 → +7 Punkte)
  AVOID_OPEN:            true,
  AVOID_OPEN_LIMIT:      20,
  // Auch Züge auf V-2 verweigern, wenn die Brückenkarte V-1 beim Gegner
  // sichtbar auf einem Ablagestapel liegt (+1,5 Punkte)
  AVOID_SECOND:          true,
  // Joker NICHT über die Score-Heuristik spielen – nur in Planer-Ketten
  // (garantierter Nutzen) und aus dem Stock. Entspricht SCORE_42 = 0 (+3 Punkte)
  JOKER_HEURISTIC:       false,
  // Zählt ein Hand-Joker als eigene Deckkarte? (false gemessen: −0,6 → true)
  FOLLOW_JOKER:          true,

  // ── OHNE MESSBARE WIRKUNG (deshalb aus/0; für spätere Versuche) ──
  // Gegner-Ziel = sichtbare Stockkarte statt Wahrscheinlichkeit (Marker/Stock-Attacke)
  VISIBLE_STOCK:         false,
  // Score-Malus für öffnende Züge / Bonus für zudeckende Züge / Malus V-2 mit Brücke
  // (verschieben nur die Reihenfolge – die KI spielt jeden Zug ohnehin)
  OPEN_PENALTY:          0,
  OPEN_STOCKMOVE_FACTOR: 0.25,
  OPEN_FOLLOWUP_FACTOR:  0.25,
  COVER_BONUS:           0,
  SECOND_PENALTY:        0,
  ENDGAME_LIMIT:         6,
  ENDGAME_FACTOR:        2.0,
  // Offenen Stapel am Zugende mit Hand-Joker zudecken, wenn Gegner-Stock ≤ … (0 = nie)
  JOKER_COVER_LIMIT:     0,
  // Auch die eigene Stockkarte nicht öffnend spielen, wenn Gegner-Stock ≤ … (0 = nie)
  AVOID_STOCK_LIMIT:     0,
  // Auch keinen Stapel für die Ablage-Oberkarten des Gegners öffnen (−0,8)
  AVOID_DISCARD_TOPS:    false,
  // Planer: bei gleichem Stockabbau Ketten bevorzugen, die nicht offen enden
  PLANNER_AVOID_OPEN:    false,
  // Planer-Risikoprüfung unabhängig vom Gegner-Stock
  RISK_ALWAYS:           false,
  // Stock-Attacke in der Vorbereitung darf Joker einsetzen
  ATTACK_JOKER:          false,
  // Nach einem Stock-Fallback-Zug weiterspielen statt abzulegen
  CONTINUE_AFTER_FALLBACK: false
};
