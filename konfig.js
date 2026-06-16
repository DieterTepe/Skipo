// ================================================================
//  konfig.js  –  Skip-Bo Mobile  (Modul 01)
//  ZENTRALE KI-KONFIGURATION / TUNER-SCHNITTSTELLE
// ----------------------------------------------------------------
//  DIES IST DIE DATEI ZUM ANPASSEN/TUNEN.
//  Eine neue Tuner-Ausgabe = einfach den kompletten
//  'let KONFIG = { ... };' Inhalt hier ersetzen.
//  Wird per <script src=...konfig.js> VOR dem Haupt-Script geladen,
//  daher ist KONFIG im ganzen Spiel verfuegbar.
//  (ki-planner.js / Modul 02 ist separat und bleibt unberuehrt.)
// ================================================================

// MODUL 01 – ZENTRALE KI-KONFIGURATION (TUNER-SCHNITTSTELLE)
// ================================================================
// Dieser Block wird vom Tuner v2.6 erzeugt und hier 1:1 eingefügt.
// WICHTIG: Beim Einfügen einer neuen Tuner-Ausgabe NUR diesen
// "let KONFIG = { ... };" Block ersetzen. Der KI_PLANNER-Block
// darunter (Modul 02) bleibt dabei unangetastet erhalten.
// Werte identisch zu BASE_GENES in SkipBo_Tuner_v2_6.html
// (Phase-1-Ergebnis vom 3.5.2026: Gen 70, WR 65%, Stockabbau 17.6/20).
// ================================================================
// ================================================================
// 🧬 OPTIMIERTE KONFIGURATION – Skip-Bo KI Tuner v2.7 (Engine 6.6.0)
// Generation:    188
// Spielstärke:   585.5+ (4-Faktor)
// Win-Rate:      61.7% gegen BASE_GENES (Spiegel-Gegner, Engine 6.6.0)
// Stockabbau Ø: 17.2 / 20 Karten pro Spiel
// Slider:        Ab0=40%, Ab1=41%, Ab2=50%, Ab3=50%, Ab4=80%, Ab5=70%, Ab6=50%, Ab7=80%, Ab8=60%, Ab9=45%
// Datum:         13.6.2026, 15:44:29
// ================================================================
let KONFIG = {

  // ══════════════════════════════════════════════════════════════
  // ABSCHNITT 1 – GEGNERBLOCKADE & RISIKO
  // ══════════════════════════════════════════════════════════════

  SCORE_1                             :     355,  // ← alt: 686 → neu: 355
  // Folgekarten-Risiko-Malus. Tuner: Ab1.

  SCORE_2                             :    2120,  // ← alt: 348 → neu: 2120
  // Endphase-Risikoreduzierung. Tuner: Ab1.

  SCORE_3                             :      10,  // ← alt: 22 → neu: 10
  // Sequenzlücken-Erkennung. Tuner: Ab1.

  SCORE_4_JOKER_MOVE                  :     105,  // ← alt: 118 → neu: 105
  // Joker-Vorsichts-Malus. Tuner: Ab1.

  SCORE_4_OPP_JOKER                   :      17,  // ← alt: 33 → neu: 17
  // Gegner-Joker-Risiko-Malus. Tuner: Ab1.

  // ══════════════════════════════════════════════════════════════
  // ABSCHNITT 2 – BAUSTAPEL-BEWERTUNG
  // ══════════════════════════════════════════════════════════════

  SCORE_5                             :    1918,  // ← alt: 1571 → neu: 1918
  // Grundbonus Baustapel-Zug. Tuner: Ab2.

  SCORE_6                             :      89,  // ← alt: 93 → neu: 89
  // Joker-Malus niedriger Stapel. Tuner: Ab2.

  SCORE_7                             :    1626,  // ← alt: 2196 → neu: 1626
  // Joker-Superbonus Gegner-Blockade. Tuner: Ab2.

  SCORE_8                             :       5,  // ← alt: 10 → neu: 5
  // Joker-Zukunftsmultiplikator. Tuner: Ab2.

  SCORE_9                             :       1,
  // NEU v6.5.9: Baustapel-Balance-Bonus. Tuner: Ab2.

  SCORE_10                            :    7539,  // ← alt: 8174 → neu: 7539
  // Stockabbau-Basisbonus. Tuner: Ab2.

  SCORE_10_ADV                        :    8035,  // ← alt: 16595 → neu: 8035
  // Fortgeschrittener-Stapel-Zusatzbonus. Tuner: Ab2.

  SCORE_12                            :       1,  // ← alt: 4 → neu: 1
  // Lückenbonus. Tuner: Ab2.

  // ══════════════════════════════════════════════════════════════
  // ABSCHNITT 3 – ABLAGESTAPEL-BEWERTUNG
  // ══════════════════════════════════════════════════════════════

  SCORE_13                            :      72,  // ← alt: 53 → neu: 72
  // Ablage-Basiswert. Tuner: Ab3.

  SCORE_14                            :      84,  // ← alt: 108 → neu: 84
  // Ablage-Gefahr-Malus. Tuner: Ab3.

  SCORE_15                            :      46,  // ← alt: 25 → neu: 46
  // Sequenz-Bonus Ablagestapel. Tuner: Ab3.

  SCORE_16                            :       3,  // ← alt: 5 → neu: 3
  // Leerer-Stapel-Bonus. Tuner: Ab3.

  SCORE_17                            :       3,  // ← alt: 4 → neu: 3
  // Niedrigere-Karte-Bonus. Tuner: Ab3.

  SCORE_18                            :       1,
  // NEU v6.5.9: Ablage-Sequenz-Tiefe-Bonus. Tuner: Ab3.

  SCORE_19                            :       1,
  // Stapel-Größen-Malus. Tuner: Ab3.

  SCORE_20                            :    1097,  // ← alt: 947 → neu: 1097
  // Gegnerhilfe-Blockade (Ablage). Tuner: Ab3.

  SCORE_21A                           :       1,
  // Joker-Langfrist-Bonus. Tuner: Ab3.

  SCORE_22                            :       1,
  // NEU v6.5.9: Endphase-Gegner-Aggressivitäts-Malus. Tuner: Ab3.

  SCORE_23                            :      97,  // ← alt: 526 → neu: 97
  // Discard-Stock-Synergie-Bonus. Tuner: Ab3.

  SCORE_24                            :   14862,  // ← alt: 16412 → neu: 14862
  // Stock-Maximum-Score (Obergrenze). Tuner: Ab3.

  SCORE_25                            :       5,  // ← alt: 2 → neu: 5
  // Joker-Zukunfts-Basis-Bonus. Tuner: Ab3.

  SCORE_26                            :      30,  // ← alt: 53 → neu: 30
  // Ablage→Bau Basispunkte. Tuner: Ab3.

  SCORE_27                            :      20,  // ← alt: 65 → neu: 20
  // Joker-Fallback Ablage-Bewertung. Tuner: Ab3.

  // ══════════════════════════════════════════════════════════════
  // ABSCHNITT 4 – STOCKKARTEN-PRIORISIERUNG & RISIKO
  // ══════════════════════════════════════════════════════════════

  SCORE_28                            :     350,  // ← alt: 175 → neu: 350
  // Sequenzkontrolle-Malus. Tuner: Ab4.

  SCORE_29                            :    1420,  // ← alt: 922 → neu: 1420
  // Kritischer-Stock-Malus (Gegner ≤ 3). Tuner: Ab4.

  SCORE_30                            :      24,  // ← alt: 18 → neu: 24
  // Joker-Kritisch-Malus. Tuner: Ab4.

  SCORE_32                            :   15532,  // ← alt: 9170 → neu: 15532
  // Stockabbau-Priorisierungs-Schwellenwert. Tuner: Ab4.

  SCORE_33                            :      18,  // ← alt: 39 → neu: 18
  // Joker-Schutz-Bonus Auto-Ablage. Tuner: Ab4.

  SCORE_34_HIGH                       :    3271,  // ← alt: 4630 → neu: 3271
  // Stock-Angriff Endphase. Tuner: Ab4.

  SCORE_34_LOW                        :     384,  // ← alt: 719 → neu: 384
  // Stock-Angriff Frühphase. Tuner: Ab4.

  SCORE_35                            :     142,  // ← alt: 165 → neu: 142
  // Serienunterbrechungs-Bonus. Tuner: Ab4.

  SCORE_36                            :       1,
  // NEU v6.5.9: Joker-Ablage-Synergie-Bonus. Tuner: Ab4.

  SCORE_37                            :     189,  // ← alt: 161 → neu: 189
  // Blockade-Bonus Pflichtablegen. Tuner: Ab4.

  SCORE_38                            :       1,
  // Distanz-zum-Stock-Malus. Tuner: Ab4.

  SCORE_39                            :    2151,  // ← alt: 1529 → neu: 2151
  // Stockabbau-Vorrang für Joker. Tuner: Ab4.

  SCORE_44                            :      20,  // ← alt: 46 → neu: 20
  // Adaptiver Blockade-Malus. Tuner: Ab4.

  SCORE_49                            :   16942,  // ← alt: 10537 → neu: 16942
  // Joker-auf-Ablage Prioritäts-Boost. Tuner: Ab4.

  // ══════════════════════════════════════════════════════════════
  // ABSCHNITT 5 – JOKER-FILTER & SCHWELLENWERTE
  // ══════════════════════════════════════════════════════════════

  SCORE_40                            :    0.45,  // ← alt: 0.34 → neu: 0.45
  // Joker-Schwellenwert (Anteil Durchschnitt). Tuner: Ab5.

  SCORE_41                            :      30,  // ← alt: 57 → neu: 30
  // Joker-Mindestbewertung (absolut). Tuner: Ab5.

  SCORE_42                            :    0.85,  // ← alt: 0.35 → neu: 0.85
  // Joker-Gewichtungs-Multiplikator. Tuner: Ab5.

  // ══════════════════════════════════════════════════════════════
  // ABSCHNITT 6 – JOKER-STRATEGIE
  // ══════════════════════════════════════════════════════════════

  JOKER_STOCK_AGGRESSION              :    0.20,  // ← alt: 0.12 → neu: 0.20
  // Joker-Aggressivität 0.0–1.0. Tuner: Ab6.

  JOKER_PROTECT_DISCARD               :    true,
  // Ablagestapel mit Joker schützen. Tuner: Ab6.

  JOKER_COMBO_ENABLED                 :    true,
  // Joker-Kombinationsanalyse aktiv. Tuner: Ab6.

  JOKER_COMBO_MIN_GAIN                :       1,
  // Mindest-Folgezüge Joker-Kombo. Tuner: Ab6.

  JOKER_STOCK_COMBO_BONUS             :     183,  // ← alt: 544 → neu: 183
  // Bonus Joker+Kombo→Stockabbau. Tuner: Ab6.

  JOKER_PROTECT_DISCARD_PENALTY       :    1352,  // ← alt: 1180 → neu: 1352
  // Strafe Ablegen auf Joker-Stapel. Tuner: Ab6.

  JOKER_NO_FOLLOWUP_THRESHOLD         :       1,
  // Mindest-Folgezüge nach Joker-Legen. Tuner: Ab6.

  JOKER_ENEMY_HELP_PENALTY            :     229,  // ← alt: 303 → neu: 229
  // Risiko-Grenzwert Joker-Gegnerhilfe. Tuner: Ab6.

  // ══════════════════════════════════════════════════════════════
  // ABSCHNITT 7 – TIEFENANALYSE ABLAGESTAPEL
  // ══════════════════════════════════════════════════════════════

  DISCARD_LOOKAHEAD_DEPTH             :       1,
  // Analysetiefe 1–4. Tuner: Ab7.

  DISCARD_COMBO_DEPTH_BONUS           :     284,  // ← alt: 154 → neu: 284
  // Bonus pro Tiefenebene. Tuner: Ab7.

  DISCARD_STOCK_FOCUS                 :    true,
  // Nur Stockabbau-Kombos bewerten. Tuner: Ab7.

  DISCARD_CHAIN_BONUS                 :     304,  // ← alt: 260 → neu: 304
  // Bonus vollständige 3er-Kette. Tuner: Ab7.

  DISCARD_DEPTH_STOCK_MULTIPLIER      :    1.94,  // ← alt: 1.93 → neu: 1.94
  // Stockabbau-Multiplikator. Tuner: Ab7.

  DISCARD_MAX_COMBO_CANDIDATES        :       5,
  // Max. Tiefen-Kandidaten. Tuner: Ab7.

  // ══════════════════════════════════════════════════════════════
  // ABSCHNITT 8 – HAND-KOMBINATIONEN
  // ══════════════════════════════════════════════════════════════

  HAND_COMBO_BONUS_PER_CARD           :    1137,  // ← alt: 2275 → neu: 1137
  // Bonus pro Kettenkarte. Tuner: Ab8.

  HAND_COMBO_MIN_LENGTH               :       2,
  // Mindest-Kettenlänge 2–4. Tuner: Ab8.

  HAND_COMBO_JOKER_BRIDGE_BONUS       :     229,  // ← alt: 846 → neu: 229
  // Bonus Joker als Brücke. Tuner: Ab8.

  HAND_COMBO_STOCK_CONNECT_MULTIPLIER :    1.02,  // ← alt: 1.25 → neu: 1.02
  // Multiplikator Kette→Stock. Tuner: Ab8.

  // ══════════════════════════════════════════════════════════════
  // ABSCHNITT 9 – GEGNER-ANALYSE (DEBUG_N1–N4 bleiben)
  // ══════════════════════════════════════════════════════════════

  DEBUG_N1: false,
  OPPONENT_ANALYZE_DEPTH              :       1,
  // Analysetiefe Gegner-Ablagestapel. Tuner: Ab9.

  DEBUG_N2: false,
  OPPONENT_BLOCK_WEIGHT               :    0.00,
  // Blockade-Gewichtung 0.0–1.0. Tuner: Ab9.

  DEBUG_N3: false,
  OPPONENT_SERIES_THRESHOLD           :       1,
  // Mindest-Serienlänge für Blockade. Tuner: Ab9.

  DEBUG_N4: false,
  OPPONENT_BLOCK_BONUS                :     514  // ← alt: 597 → neu: 514
  // Score-Bonus Blockade-Züge. Tuner: Ab9.
};
