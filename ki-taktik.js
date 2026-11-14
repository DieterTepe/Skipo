// ================================================================
//  ki-taktik.js  –  Skipo 7.0.3   Namensraum: KI_TAKTIK
//  TAKTIK-SCHALTER DER KI (Blockade, Joker, Ablage, Quellenwahl)
// ----------------------------------------------------------------
//  Eigener Block wie KI_PLANNER: wird beim Einfügen einer Tuner-
//  Ausgabe (konfig.js) NICHT überschrieben.
//
//  Alle Werte mit tune-sim.js gemessen (KI gegen KI, gepaarte Spiele,
//  2000–4000 Paare je Messung, zwei Seeds). Stand 7.0.3:
//    gegen 7.0.2 ........ 68,9 % / 68,1 %  (±1,0)
//    gegen einfachen Bot  92,5 %           (7.0.2: 81,8 %)
//  Einzelmessungen: Projekt.md, Abschnitt 6.
//
//  SCHWIERIGKEIT (Einstellungen im Spiel, Settings.level):
//    'hard'   = die Werte unten (7.0.3)            – Standard
//    'medium' = KI_STUFEN.medium darübergelegt    – Stärke wie 7.0.2
//    'easy'   = Taktik aus                        – Stärke wie 7.0.1
//  KI-PLANUNG (Settings.planning): 'super' = Planer nutzt die verdeckten
//    eigenen Stockkarten (Standard), 'normal' = nur die sichtbare oberste.
//
//  Rückfall ohne Datei-Tausch:
//    ENABLED: false ............... KI spielt exakt wie 7.0.1/7.0.0
//    Block „NEU IN 7.0.3" auf die  KI spielt exakt wie 7.0.2
//    dort genannten Altwerte ......(Zug für Zug, mit test-sim.js geprüft)
// ================================================================

let KI_TAKTIK = {
  ENABLED:               true,

  // ── WIRKSAM SEIT 7.0.2 ────────────────────────────────────────
  // V = sichtbare Stockkarte des Gegners.
  // Öffnende Züge verweigern: Karte V-1 aus Hand/Ablage NICHT spielen,
  // wenn die KI die Deckkarte (V oder Joker) nicht selbst nachlegen kann.
  // Grenze = Gegner-Stock ≤ AVOID_OPEN_LIMIT (20 = immer)
  AVOID_OPEN:            true,
  AVOID_OPEN_LIMIT:      20,
  // Auch V-2 verweigern, wenn die Brückenkarte V-1 beim Gegner sichtbar liegt
  AVOID_SECOND:          true,
  // Joker NICHT über die Score-Heuristik spielen – nur in Planer-Ketten und aus dem Stock
  JOKER_HEURISTIC:       false,
  // Zählt ein Hand-Joker als eigene Deckkarte?
  FOLLOW_JOKER:          true,

  // ── NEU IN 7.0.3 (Altwert 7.0.2 jeweils in Klammern) ──────────
  // 1) Joker am Zugende  (+10 Punkte gegen 7.0.2)
  //    7.0.2 spielte einen übrigen Hand-Joker am Zugende einzeln auf einen
  //    Baustapel (≈ 1,3 verschenkte Joker je Spiel) oder legte ihn ZUSÄTZLICH
  //    zur normalen Karte ab (zwei Ablagen in einem Zug = Regelverstoß).
  //    'keep' = Joker bleibt in der Hand, genau eine Ablage.
  //    Andere Werte: 'legacy' (7.0.2) | 'park' (Joker ist die Ablage) | 'single'
  JOKER_END:             'keep',    // ('legacy')
  JOKER_END_DIRECT:      false,     // (true)  Joker am Zugende einzeln auf Baustapel
  JOKER_END_COMBO:       true,      //         Ablagekarte + Joker am Zugende (ohne Wirkung)
  // 2) Ablage: Was behalten?  (+4 Punkte)
  //    Karten auf dem Weg eines Baustapels zur EIGENEN Stockkarte nicht ablegen;
  //    doppelt gehaltene Werte zuerst ablegen. Gewichte, 0 = aus.
  DISC_KEEP_USEFUL:      1500,      // (0)
  DISC_DUP:              600,       // (0)
  // 3) Sicherheitsabstand zur Gegner-Stockkarte  (+2 Punkte)
  //    1 = nur V-1 | 2 = auch V-2 ohne Brücke | 3 = auch V-3 (4: +1, 5: +1, 6: ±0)
  AVOID_DIST:            3,         // (1)
  // 4) Quellenwahl  (+3,5 Punkte; 'discard' gemessen: −3,3)
  //    Liegt dieselbe Karte in der Hand UND oben auf einer Ablage → Handkarte
  //    spielen (mehr Nachziehen). '' = aus.
  PREFER_SRC:            'hand',    // ('')

  // ── KI-PLANUNG ────────────────────────────────────────────────
  // Der Zugketten-Planer rechnet seit 6.6.0 mit den VERDECKTEN Karten des
  // eigenen Stockstapels („Superstark"). „Normal" = nur die sichtbare oberste
  // Stockkarte; kostet 3,5–4 Punkte (65 % statt 68,5 % gegen 7.0.2).
  // Gewählt wird im Spiel (Einstellungen → KI-Planung). true hier erzwingt
  // „Normal" unabhängig von der Einstellung (für Messungen mit tune-sim.js).
  PLANNER_FAIR_STOCK:    false,

  // ── GEMESSEN, OHNE GEWINN (aus/0; für spätere Versuche) ───────
  // Joker
  CLEAR_NO_JOKER:        false,   // Hand-leeren-Ketten ohne Joker (+0,9 / −0,2)
  JOKER_SURPLUS:         0,       // ab N Hand-Jokern einen frei spielen (2: −0,6; 3: ±0)
  JOKER_KEEP_MAX:        0,       // mehr als N Joker → einen parken (2: −0,5; 1: −2,5)
  JOKER_HARD:            false,   // Joker auf der Ablage nie verdecken (±0, passiert ohnehin fast nie)
  JOKER_STACK:           false,   // Joker auf Joker stapeln (±0)
  JOKER_COVER_LIMIT:     0,       // offenen Stapel mit Hand-Joker zudecken, Gegner-Stock ≤ … (+0,5)
  ATTACK_JOKER:          false,   // Stock-Attacke in der Vorbereitung darf Joker einsetzen
  // Blockade
  AVOID_WRAP:            false,   // Rundlauf 12→1 beachten (+0,2)
  AVOID_OWN_MIN:         0,       // eigener Stock ≤ … → nichts mehr verweigern (3: −0,8; 6: −1,7)
  AVOID_STOCK_LIMIT:     0,       // auch eigene Stockkarte nicht öffnend spielen, Gegner-Stock ≤ …
  AVOID_DISCARD_TOPS:    false,   // keinen Stapel für Gegner-Ablage-Oberkarten öffnen (−0,8)
  VISIBLE_STOCK:         false,   // Gegner-Ziel = sichtbare Stockkarte (Marker/Stock-Attacke)
  OPEN_PENALTY:          0,       // Score-Malus/-Bonus verschieben nur die Reihenfolge
  OPEN_STOCKMOVE_FACTOR: 0.25,
  OPEN_FOLLOWUP_FACTOR:  0.25,
  COVER_BONUS:           0,
  SECOND_PENALTY:        0,
  ENDGAME_LIMIT:         6,
  ENDGAME_FACTOR:        2.0,
  // Kettenbedrohung: Zug meiden, nach dem der Gegner mit sichtbaren Karten mehr legen kann
  CHAIN_AVOID:           false,   // Hauptschalter (−3,7; mit Deckkarten-Ausnahme ±0)
  CHAIN_STOCK:           true,
  CHAIN_LIMIT:           0,
  CHAIN_DELTA:           1,
  CHAIN_OPP_STOCK_LIMIT: 20,
  CHAIN_SKIP_STOCKMOVE:  true,
  CHAIN_ALLOW_COVER:     false,
  // Leerlaufzüge zurückhalten (dem Gegner Anlegestellen nehmen): STARK NEGATIV
  IDLE_HOLD:             '',      // 'all' −13 | 'hand' −21 | 'discard' −2
  IDLE_OWN_PATH:         0,       // nur Richtung eigener Stock (3: −13; 6: −10)
  // Ablage
  DISC_COVER_USEFUL:     0,       // nützliche Karte nicht verdecken (±0 zusätzlich)
  DISC_KEEP_PLAYABLE:    0,       // bald spielbare Karte behalten (±0 zusätzlich)
  DISC_COVER_PLAYABLE:   0,
  DISC_SAME:             0,       // gleicher Wert auf gleichen Wert (−0,5)
  DISC_OPENER:           0,       // blockierte Karte zuerst ablegen (300: +1; 1000: −3)
  DISC_KEEP_OPPV:        0,       // Deckkarte behalten (300: +0,5; 1000: −1)
  SERIES_BREAK_PENALTY:  0,       // Serienstapel: größere auf kleinere bestrafen (±0)
  SERIES_LEN_CAP:        3,
  // Planer
  PLANNER_PREFER_CLEAR:  false,   // Stockkette bis Hand leer verlängern (+0,5)
  PLANNER_HAND_FIRST:    false,   // mehr Handkarten vor kürzerer Kette (−1,5)
  PLANNER_AVOID_OPEN:    false,   // Ketten meiden, die offen enden (±0)
  RISK_ALWAYS:           false,   // Risikoprüfung unabhängig vom Gegner-Stock (±0)
  CONTINUE_AFTER_FALLBACK: false  // nach Stock-Fallback weiterspielen
};

// ── SCHWIERIGKEITSSTUFEN (7.0.3) ────────────────────────────────
// Werte, die für eine Stufe ÜBER KI_TAKTIK gelegt werden (AI.taktik()).
// 'medium' entspricht 7.0.2, aber regelkonform: JOKER_END 'single' =
// genau eine Ablage je Zug (gemessen: 49,6 % gegen das alte 7.0.2).
const KI_STUFEN = {
  easy:   { ENABLED: false },
  medium: { JOKER_END: 'single', JOKER_END_DIRECT: true, AVOID_DIST: 1,
            DISC_KEEP_USEFUL: 0, DISC_DUP: 0, PREFER_SRC: '' },
  hard:   {}
};
