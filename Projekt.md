# Projekt Skipo (Skip-Bo Mobile) – Projektstand 7.0.3 (Zweig, noch nicht freigegeben)

> **Zweck dieser Datei:** Übergabe-Dokument. Wer einen neuen Chat startet, liest
> zuerst diese Datei und weiß sofort, was Stand, Regeln, Entscheidungen und
> nächste Schritte sind. Bei jeder größeren Änderung aktualisieren.

**Letzte Aktualisierung:** 14.11.2026 — **Live ist 7.0.2** (`main`). **7.0.3 liegt fertig
auf dem Zweig `v7.0.3`** und wartet auf Dieters Freigabe: stärkere KI (68,5 % gegen 7.0.2)
plus Einstellungen **Schwierigkeit** (Leicht / Mittel / Schwer, Standard Schwer) und
**KI-Planung** (Superstark / Normal, Standard Superstark). Geprüft: Regel-Prüfstand für
alle sechs Kombinationen, Browsertest (Fenster, Speichern, Sprachen, vier Spiele).

---

## 0. Kurzfassung für den schnellen Einstieg

- **Spiel:** `https://dietertepe.github.io/Skipo/SkipBo_7_0_2.html` – GitHub Pages,
  Repo `DieterTepe/Skipo`, alle Dateien **flach** im Ordner, absolute URLs mit `?v=7.0.2`.
- **Architektur (seit 7.0.1):** vier Schichten (core → ai → flow/tracking → ui), ein
  Namensraum je Datei, Ereignisbus, Meldungsschlüssel (DE/EN/PT), ein Speicher-Zugang.
  Kein DOM in core/ai/flow/tracking → alles läuft in Node und ist simulierbar.
- **KI 7.0.3 (Zweig `v7.0.3`):** Joker bleiben am Zugende in der Hand, Ablage behält Karten
  für die eigene Stockkarte, Sicherheitsabstand 3, Handkarte vor Ablagekarte.
  **68,5 % gegen 7.0.2**, 92,5 % gegen den Bot. Alles Schalter in `ki-taktik.js`; mit den
  dort genannten Altwerten spielt der Code Zug für Zug wie 7.0.2.
- **Stufen (7.0.3):** `Settings.level` easy / medium / hard und `Settings.planning`
  super / normal (Store `skipo.v1.level`, `skipo.v1.planning`). `AI.taktik()` legt
  `KI_STUFEN[level]` über `KI_TAKTIK`; `AI.fairStock()` steuert den Planer. Abschnitt 6.7.
- **KI (seit 7.0.2):** Blockade-Taktik in `ki-taktik.js` – die KI verweigert Züge, die
  einen Baustapel für die sichtbare Gegner-Stockkarte öffnen, und hebt Joker für
  Planer-Ketten auf. Gemessen: **59 % Siegrate gegen 7.0.1**, 80 % gegen den Bot (7.0.1: 73 %).
  `KI_TAKTIK.ENABLED = false` → Verhalten exakt wie 7.0.1/7.0.0.
- **Auswertung (seit 7.0.2):** Endscreen zeigt beide Seiten im Vergleich (Spieler vs. KI)
  plus Hinweis; darunter weiterhin die 5-Spiele-Tuner-Auswertung.
- **Zwei Prüfstände (Node):** `test-sim.js` (Regeln unverändert? Äquivalenz gegen 7.0.0)
  und `tune-sim.js` (KI stärker? KI gegen KI, gepaarte Spiele). Nach jeder Änderung laufen lassen.
- **Referenzen bleiben im Repo:** 6.6.0 (`SkipBo_6_6_0.html`) und 7.0.0
  (`SkipBo_7_0_0.html` + state/engine/view/ai/endgame.js). Die 7.0.0-JS-Dateien braucht
  `test-sim.js` – nicht löschen. `SkipBo_7_0_1.html` ist entbehrlich (lädt dieselben
  JS-Dateien, wäre „7.0.2 ohne Taktik").
- Sprachen: DE, EN, PT. Ukrainisch entfallen (04.09.2026).

---

## 1. Dateisatz 7.0.2 / 7.0.3 (Ladereihenfolge = Abhängigkeit)

```
Skipo/  (Repo-Wurzel, GitHub Pages, flach)
│
│  ── Konfiguration ──
├── konfig.js            let KONFIG      Tuner-Werte SCORE_* – NUR dieser Block wird vom Tuner ersetzt (unverändert seit 6.6.0)
├── ki-planner.js        const KI_PLANNER Planer-Konfiguration (unverändert)
├── ki-taktik.js         let KI_TAKTIK   Taktik-Schalter (Blockade 7.0.2, Joker/Ablage/Abstand/Quelle 7.0.3) – vom Tuner nicht berührt
│
│  ── core: Fundament, KEIN DOM ──
├── core-events.js       Events    on / off / emit – Ereignisbus (Liste der Ereignisse im Dateikopf)
├── core-store.js        Store     get / set / remove / migrate – EIN Zugang zu localStorage (Präfix skipo.v1.)
├── core-settings.js     Settings  name · lang · speed · bg · nameSet · THEMES, load / set
│                        Clock     pause(mult) / after(ms, fn)
├── core-i18n.js         I18n      t(key, …) / say(key, …) / setLang, Wörterbuch T (DE/EN/PT)
├── core-state.js        State     game · turn · reset() · player(p) · opponent(p)
├── core-rules.js        Rules     Deck, shuffle (Rules.random), deal, newGame, isValidBuild, isPileComplete,
│                                  clearPile, hasAnyBuildMove, playToBuild, playToDiscard, drawToFive,
│                                  winner, winnerByStock
│
│  ── ai: KI, KEIN DOM ──
├── ai-turn.js           AI        takeTurn · prepare · executeMoves · finish · stockAttack · discard · jokerCover
│                                  + over() / taktik() / say() / note() / cardLabel / srcLabel / reasonText
├── ai-planner.js        AI.Planner  snapshot · hash · moves · apply · search · riskCheck · runChains · executeChain
├── ai-eval.js           AI.Eval     candidates · scoreHand · jokerOnBuild · scoreStock · scoreDiscard · dedup
│                                    · filter · applyThreat · jokerFutureValue · gapSize · futureRisk
│                                    · dynamicPriorities · blockingPotential · canRemoveStockCard
│                                    · neededForStock · opponentCritical
├── ai-analysis.js       AI.Analysis predictEnemyStock · threat · enemyTarget · consecutiveDiscards
│                                    · discardPatterns · blockScore · jokerStockTop · jokerHand
│                                    · jokerProtectDiscard · jokerCombo · jokerBestDiscard · jokerFollowUps
│                                    · handCombo · handComboCache · discardLookAhead · discardComboDepth
│                                    · discardSimChain
│
│  ── flow + tracking, KEIN DOM ──
├── core-flow.js         Flow      startGame · idle · checkEnd · humanCanAct · humanBuild · humanDiscard · _aiRound
├── tracking.js          Tracking  stats (Tuner) · game/last/history (Vergleich beider Seiten) · averages()
│
│  ── ui: Oberfläche (liest State/Tracking, hört Events, ruft Flow/Settings/I18n) ──
├── ui-render.js         Render    init · all · hand · stock · drawPile · buildPiles · discardPiles · borders
│                                  · labels · message · predictionMarkers · background · enable
├── ui-input.js          Input     init · onClick · toggleSelect · placeOnBuild · tapOwnDiscard · highlight
│                                  · clear · enableDraggableLabel (Long-Press → Overlays.infoWindow)
├── ui-menu.js           Menu      init · toggle · close · texts · actions{settings, design, rules, lang,
│                                  newgame, tuner-reset, imprint, privacy, close}
├── ui-overlays.js       Overlays  init · texts · showSettings · hideSettings · showDesign · syncDesign
│                                  · showLanguage · showEnd · compareHTML · tunerAnalysisHTML · infoWindow
├── app.js               App       init (Settings → I18n → Tracking → Render/Input/Menu/Overlays → Flow)
│
│  ── Werkzeuge (nur Node, nicht im HTML geladen) ──
├── test-sim.js          Invarianten + Äquivalenz gegen 7.0.0 (Abschnitt 5)
├── tune-sim.js          KI gegen KI: Konfigurationsvergleich, Sweep, Bot (Abschnitt 6)
│
├── SkipBo_7_0_3.html    (Zweig v7.0.3) wie 7_0_2, alle ?v=7.0.3
├── SkipBo_7_0_2.html    DOM-Gerüst, keine onclick=, keine Inline-Styles, Script-Tags in obiger Reihenfolge
├── style.css            CSS (Karten, Felder, Menü, Overlays, Endscreen, Vergleichstabelle)
├── impressum.html / datenschutz.html   „Zurück"-Link auf SkipBo_7_0_2.html
├── Projekt.md           diese Datei
├── SkipBo_7_0_0.html + state.js engine.js view.js ai.js endgame.js   Referenz 7.0.0 (für test-sim.js nötig)
└── SkipBo_6_6_0.html    Ur-Referenz
```

---

## 2. Die sechs Architekturregeln

1. **Nur nach unten rufen.** core kennt weder ai noch ui. ai kennt core. flow kennt
   core + ai. ui liest State/Tracking und ruft Flow/Settings/I18n. Nichts ruft nach oben.
2. **Nach oben nur per Ereignis** (`Events.emit`). Die UI hört zu.
3. **core / ai / flow / tracking fassen nie das DOM an.** Kein `document`, `window`,
   `localStorage` (außer in `Store`). Die Prüfstände laden sie in Node ohne DOM.
4. **Meldungen sind Schlüssel.** `I18n.say('aiBuild', karte, quelle, 2, 1500)`.
   Neue Meldung = ein Eintrag in `core-i18n.js` mit de/en/pt.
5. **Ein Store, ein Präfix.** Alle Werte unter `skipo.v1.*` (name, lang, speed, bg,
   nameSet, tuner, stats).
6. **Ein Render-Einstieg.** `Render.all()` nach jeder Zustandsänderung; danach Ereignis
   `render` (Input wendet die Auswahl-Markierung neu an).

---

## 3. Erweiterungs-Rezepte

| Vorhaben | Wo |
|---|---|
| Neue Statusmeldung | `core-i18n.js` Eintrag (de/en/pt) → `I18n.say('key', …)` |
| Neuer Menüpunkt | Button `data-action="x"` in HTML → `Menu.actions.x()` → Text `qmX` in I18n + `Menu.texts()` |
| Neue Einstellung (persistent) | `Settings.DEFAULTS` ergänzen → `Settings.set('key', wert)` → Hörer auf `settings:change` |
| Regeländerung | nur `core-rules.js`; danach `node test-sim.js 300 42 --new-only --taktik` (Invarianten) |
| **KI-Änderung** | Schalter/Wert in `ki-taktik.js` → Code in `ai-*.js` hinter `AI.taktik()` → `node tune-sim.js --games=1000 T:SCHALTER=true` → übernehmen nur bei > 53 % (±2) → `node test-sim.js 300 42` muss weiterhin „identisch" melden (Taktik AUS) |
| Neues Overlay | `ui-overlays.js` Methode + CSS-Klassen in `style.css` (keine Inline-Styles) |
| Sound / Statistik / Schwierigkeitsgrad | neue Datei, hört auf `move:*`, `game:over`, `turn:change`; Init in `app.js` |
| Release | alle `?v=7.0.2` in der HTML gemeinsam hochzählen; neue Version = neue HTML-Datei |

---

## 4. Abweichungen gegenüber 7.0.0 (geprüft)

**Spielverhalten ohne Taktik (Basis, identisch bewiesen bis auf):**
- KI hört **sofort** auf, wenn ein Stock leer ist (7.0.0 spielte nach dem Siegzug weiter,
  Sieger/Punkte unverändert). `test-sim.js` schneidet deshalb nach dem Siegzug ab.
- Legt der Mensch seine letzte Handkarte, zieht nur er nach (7.0.0: auch die KI).
- **Auto-Pass:** keine Handkarte und kein Bauzug → Zug geht an die KI; dreimal beidseitig
  → Notwertung `Rules.winnerByStock()` (7.0.0: Spiel hing).
- Nur Karten im eigenen Bereich wählbar; Spielername wird gespeichert.

**Mit Taktik (7.0.2, Standard):** siehe Abschnitt 6 – die KI verweigert öffnende Züge
und spielt Joker nicht mehr über die Heuristik. Sie lässt also manchmal eine passende
Karte auf der Hand – Absicht, kein Fehler.

**Tuner-Tracking:** Jeder KI-Zug wird einmal gezählt (7.0.0: doppelt). Werte der
5-Spiele-Auswertung sind daher etwa halb so groß wie früher; Schwellen unverändert.
Einzelbeobachtungen werden nicht mehr gespeichert.

**Entfernt (tot/wirkungslos):** `Joker_auf_Ablage`, `evaluateAndSelectMove`,
`delayWithCallback`, `GESCHWINDIGKEIT`, `getDiscardSequenceBonus`, `deckComposition`,
`stockPredictions`, Zeitstempel, `faceUp`, Regex-Übersetzer, CSS-Injektion per JS.

**Texte:** Regeltext korrigiert (Langes Drücken; Menü → Spielregeln). Blockade-Tag,
„Leer" und Joker-Begründungen dreisprachig.

---

## 5. Prüfstand 1: test-sim.js – „Sind die Regeln noch dieselben?"

```
cd Skipo
node test-sim.js 300 42                        # Taktik AUS: Invarianten + Äquivalenz gegen 7.0.0
node test-sim.js 300 42 --new-only --taktik    # Taktik AN: nur Invarianten
node test-sim.js 300 42 --old=../anderer-ordner
```
Lädt core/ai/flow/tracking ohne DOM, deterministischer Mensch-Bot gegen die KI, Zufall
nur beim Mischen (Seed). Invarianten je Zug: 156 Karten, Baustapel 1→12, Hand ≤ 5,
jedes Spiel endet. Äquivalenz: gleiche Spiele durch die 7.0.0-Engine, Zugfolgen-
Vergleich. Exit 0 = gleich, 1 = Abweichung mit Beispiel.

**Stand 04.09.2026:** 500 Spiele, 106.250 Züge, alle Zugfolgen identisch (Taktik AUS);
Taktik AN: 0 Invarianten-Fehler. Zusätzlich: 573 Namensraum-Verweise lösen sich auf,
alle Sprachschlüssel dreisprachig, alle IDs/Klassen/data-actions vorhanden, Browser-Test
(Chrome headless, 390×844) 61 Prüfungen bestanden, 0 Konsolenfehler.

---

## 6. Prüfstand 2: tune-sim.js – „Ist die KI stärker?"

```
node tune-sim.js --games=500                      # Kontrolle A gegen A → exakt 50 %
node tune-sim.js --games=1000 T:AVOID_OPEN=true   # B = KI_TAKTIK-Schalter (ENABLED wird gesetzt)
node tune-sim.js --games=1000 K:SCORE_42=0        # B = KONFIG-Änderung
node tune-sim.js --games=1000 P:MAX_DEPTH=20      # B = KI_PLANNER-Änderung
node tune-sim.js --games=1000 --bot               # B gegen den einfachen Bot
node tune-sim.js --games=300 --sweep              # jeden KONFIG-Wert ×0 / ×0.5 / ×2 → tune-results.jsonl
```
A = aktueller Stand mit `KI_TAKTIK.ENABLED = false`. Jedes Spiel läuft zweimal (gleiche
Karten, Sitze getauscht) → Kartenglück und Anfangsvorteil heben sich auf. ~60 Spiele/s.
Ausgabe: Siegrate von B mit 95-%-Intervall, Stockdifferenz, Züge. Für den Sitz „human"
werden Spielerobjekte und Ablage-Historie getauscht – Spielcode bleibt unberührt.
**Übernahmeregel:** ≥ 2000 Spiele, > 53 % bei ±2, mit zweitem Seed bestätigt.

### 6.1 Befund: Die Tuner-Werte entscheiden fast nichts
Sweep über alle 71 KONFIG-Werte: **54 ohne jede messbare Wirkung**, Rest ≤ ±3 Punkte
(Rauschen). Grund: Die KI spielt **jeden** gültigen Zug – Scores sortieren nur die
Reihenfolge. Der Planer macht ≈ 53 % aller Züge. KI_PLANNER-Werte: ebenfalls ohne Wirkung.
Einzige Bestätigung: SCORE_42 = 0 (52,9 % ± 2,2) → in 7.0.2 als `JOKER_HEURISTIC:false`.
Alte Blockade-Logik (`getOpponentCriticalNumbers` rechnet V+1 statt V−1; Stock-Attacke
wartet auf 60 % Konfidenz, Vorhersage erreicht max. ~12 %) war praktisch inaktiv;
bleibt aus Tuner-Kompatibilität unverändert.

### 6.2 Was wirkt: Züge verweigern
| Maßnahme (1000–2000 Spiele) | Siegrate B |
|---|---|
| Score-Malus/-Bonus, Joker-Zudecken, Planer-Bevorzugung, Gegner-Ablagekarten meiden | 50 % |
| **AVOID_OPEN** – Karte V−1 nicht spielen (immer; Limit 12: 53,7, Limit 6: 51,5) | 53–54 % |
| + **AVOID_SECOND** (V−2 nicht, wenn Brücke V−1 sichtbar) | 55–57 % |
| + **JOKER_HEURISTIC:false** | **58,6 % / 59,2 %** (zwei Seeds) |
| Gesamt gegen einfachen Bot | **80,3 %** (7.0.1: 73,0 %) |

Standardwerte in `ki-taktik.js` = diese Einstellung. Nicht wirksame Schalter stehen
dort auf 0/false, dokumentiert für spätere Versuche. Stellschraube, falls die KI zu
hart ist: `AVOID_OPEN_LIMIT` (kleiner = blockt nur im Endspiel).

### 6.4 Versuche 14.11.2026 – Dieters Spielideen (Zweig `ki-versuche`, alle Schalter aus)
Gemessen mit `--basis` (A = 7.0.2 mit Blockade), 2000 Paare je Variante, Seed 1.
Zähler-Check: Jeder Schalter greift tatsächlich (siehe Spalte „greift").

| Idee / Schalter in `ki-taktik.js` | greift | gegen 7.0.2 | gegen Bot (7.0.2: 81,8) |
|---|---|---|---|
| Kettenbedrohung: Zug meiden, der Gegner-Stock über sichtbare Ablagen erreichbar macht (`CHAIN_AVOID`, `CHAIN_STOCK`) | oft | **46,3 %** (Gegner-Stock ≤5: 49,3) | – |
| … + Kettenlänge ≥2/3/4 (`CHAIN_LIMIT`) | oft | 44–45 % | – |
| … nur Kette ≥3, +2 länger, mit eigener Deckkarte erlaubt | selten | 50,8 % | 82,5 % |
| `CHAIN_STOCK` + eigene Deckkarte erlaubt (`CHAIN_ALLOW_COVER`) | selten | 50,0 % | 81,1 % |
| Hand leeren bevorzugen (Stockkette bis Hand leer, `PLANNER_PREFER_CLEAR`) | ~1×/Spiel | 50,6 % / 50,4 % (Seed 2, 4000) | 82,5 % |
| Serienstapel: größere auf kleinere Karte bestrafen (`SERIES_BREAK_PENALTY` 100/400/1500) | 18 % der Ablagen → ⅓ | 49,5 / 49,5 / 50,0 % | 81,3 % |
| Joker nie verdecken + Joker auf Joker (`JOKER_HARD`, `JOKER_STACK`) | ~0,05×/Spiel | 50,0 % | 81,7 % |
| **Kombi** Hand leeren + milde Kette (4000 Paare) | | **51,1 % / 51,4 %** (zwei Seeds, ±1,1) | |

**Befund:** Keine Idee erreicht die Übernahmeschwelle (> 53 %). Züge zu verweigern lohnt
sich nur bei der direkten Öffnung (V−1, `AVOID_OPEN`); jede weitere Verweigerung kostet
mehr Tempo als sie blockt. Ablage-Ordnung und Jokerschutz sind schon nahe am Optimum
(Joker wird bereits fast nie verdeckt). Die Kombi bringt reproduzierbar ≈ +1 Punkt –
echt, aber im Spiel kaum spürbar. Diese Schalter bleiben aus (Stand danach: Abschnitt 6.5).
Prüfstand: neue Option `--basis` (A = aktuelle Taktik statt Taktik aus).

### 6.5 Versuchsreihe 2 (14.11.2026) → Version 7.0.3
Auftrag: „Prüfe das Gesamte, ob nicht doch noch eine Stellschraube zu finden ist."
Vorgehen: jede Stelle, an der die KI wirklich **entscheidet** (nicht nur sortiert),
als Schalter gebaut und gemessen. ~75 Messungen, 2000–4000 Paare, `--basis`.

**Was gefunden wurde (in dieser Reihenfolge zur Basis gemacht):**

| Stellschraube | Schalter (Altwert) | Gewinn |
|---|---|---|
| **Joker am Zugende behalten.** 7.0.2 spielte einen übrigen Hand-Joker am Zugende einzeln auf einen Baustapel (≈1,3 Joker je Spieler und Spiel verschenkt) oder legte ihn zusätzlich zur normalen Karte ab. | `JOKER_END:'keep'` (`'legacy'`), `JOKER_END_DIRECT:false` (`true`) | 59,9 % / 59,3 % gegen 7.0.2 |
| **Ablage: Karten für die eigene Stockkarte behalten**, Doppelte zuerst ablegen | `DISC_KEEP_USEFUL:1500` (0), `DISC_DUP:600` (0) | +4 (54,0 % allein) |
| **Sicherheitsabstand 3** zur Gegner-Stockkarte (V−2, V−3 auch ohne Brücke) | `AVOID_DIST:3` (1) | +2 (zusammen mit Ablage 57,0 %) |
| **Handkarte vor Ablagekarte**, wenn beide dieselbe Karte bieten | `PREFER_SRC:'hand'` (`''`) | 53,7 / 53,5 / 52,8 % (drei Seeds); `'discard'`: 46,7 % |
| **Gesamt 7.0.3 gegen 7.0.2** (4000 Paare) | | **68,9 % / 68,1 %** (±1,0) |
| Gesamt gegen einfachen Bot | | **92,5 %** (7.0.2: 81,8 %) |

**Zwei Befunde, die keine Spielstärke-, sondern Regelfragen sind:**
- **Doppelablage (Fehler in 7.0.2):** In ≈ jedem zweiten Spiel legte die KI zwei Karten in
  einem Zug ab (normale Karte + Joker „sichern"). Vor 7.0.2 trat das nicht auf, weil die
  Joker vorher verspielt wurden. Mit `JOKER_END:'keep'` behoben; `test-sim.js` prüft jetzt
  als Invariante „KI legt höchstens 1× je Zug ab" (36 342 Züge: immer genau 1).
- **Verdeckte eigene Stockkarten:** Der Planer (`AI.Planner.snapshot/moves`) rechnet seit
  6.6.0 mit allen Karten des eigenen Stockstapels, also auch den verdeckten. Schalter
  `PLANNER_FAIR_STOCK:true` plant nur mit der sichtbaren obersten: kostet 3,5–4 Punkte
  (65,5 % / 64,5 % statt 68,9 % / 68,1 % gegen 7.0.2; Bot 91,3 %). **Entschieden
  (Dieter, 14.11.2026): als Einstellung „KI-Planung" wählbar, Standard Superstark**
  (Abschnitt 6.7). Auf Gegnerhand und Nachziehstapel greift die KI nirgends zu (geprüft).

**Dieters Hypothese „dem Gegner das Legen verwehren → er zieht weniger nach":** direkt
gemessen und klar widerlegt. Leerlaufzüge zurückhalten: alle −13, nur Hand −21, nur
Ablage −2, nur Richtung eigener Stock −10 bis −13 Punkte. Die eigenen Karten loszuwerden
(und nachzuziehen) ist weit mehr wert, als dem Gegner Anlegestellen zu nehmen. Was vom
Gedanken trägt, ist der Sicherheitsabstand (AVOID_DIST) – er verweigert nur wenige Züge.

**Ohne Gewinn (Werte stehen in `ki-taktik.js` als Kommentar):** Joker parken / Überschuss
spielen / Joker-Budget je Kette, Hand-leeren-Ketten ohne Joker, Rundlauf 12→1, Wettlauf-
Ausnahme, Abstand 4–6 (+1 / +1 / ±0), blockierte Karten ablegen, Deckkarte behalten,
nützliche Karte nicht verdecken, bald Spielbares behalten, Serienstapel, Kettenbedrohung,
Planer: offenes Ende meiden / Risikoprüfung immer / mehr Suchknoten und Tiefe / Hand
leeren bevorzugen / Handkarten zuerst (−1,5).

**Kontrollen:** KI lässt nie eine spielbare Stockkarte liegen (0 von 36 342 Zügen).
Mit 7.0.3 endet sie in 36 % der Züge mit Joker in der Hand (3+ Joker: 1 %).
Altwerte im neuen Code = 7.0.2 Zug für Zug (62 322 Züge / 248 Siege identisch).
Browsertest (Playwright, lokaler Server): komplettes Spiel, 0 Konsolenfehler.

### 6.7 Schwierigkeit und KI-Planung (7.0.3, Einstellungen im Spiel)

| Stufe (`Settings.level`) | Was die KI tut | Technik |
|---|---|---|
| **Leicht** `easy` | spielt ohne Blockade (wie 7.0.1) | `AI.taktik()` → `null` |
| **Mittel** `medium` | blockiert die Gegner-Stockkarte (wie 7.0.2, aber regelkonform: genau eine Ablage) | `KI_TAKTIK` + `KI_STUFEN.medium` |
| **Schwer** `hard` (Standard) | zusätzlich Joker halten, Ablage nach Nützlichkeit, Abstand 3, Handkarte vor Ablage | `KI_TAKTIK` |

| KI-Planung (`Settings.planning`) | Bedeutung |
|---|---|
| **Superstark** `super` (Standard) | Planer rechnet mit den verdeckten Karten des eigenen Stocks (wie seit 6.6.0) |
| **Normal** `normal` | Planer kennt nur die oberste eigene Stockkarte – wie der Mensch. Gilt in jeder Stufe (`AI.fairStock()`) |

Gemessen (2000 Paare, Seed 1): Mittel gegen altes 7.0.2 **49,6 %** (gleich stark) ·
Mittel gegen Leicht **58,3 %** · Schwer gegen Mittel **69,8 %** · Schwer gegen Leicht
**75,3 %** · Normal gegen Superstark: Schwer 45,6 %, Mittel 46,8 %, Leicht 45,8 % ·
Schwer-Normal gegen Mittel-Superstark **65,6 %**.

Bedienung: Einstellungen (⚙️ → Einstellungen) → zwei Schaltergruppen mit Erklärzeile;
gilt erst mit „Übernehmen", dann ab dem nächsten KI-Zug (auch mitten im Spiel).
Der Endscreen zeigt die gespielte Stärke über dem Vergleich. Texte DE/EN/PT
(`kiLevel_*`, `kiPlan_*`, `kiHintLevel_*`, `kiHintPlan_*`, `kiChanged`).
Hinweis: Die 10-Spiele-Durchschnitte im Endscreen mischen Spiele verschiedener Stufen.
Für tune-sim.js erzwingt `KI_TAKTIK.PLANNER_FAIR_STOCK:true` die Planung „Normal".

### 6.6 Offene KI-Ideen (messbar)
- Ablage: **welche Karte** behalten wirkt (6.5); **wohin** ablegen bisher nicht.
- Schwierigkeitsstufen sind in 7.0.3 eingebaut (Abschnitt 6.7).
- Erkenntnis für neue Ideen: Wirkung haben nur echte Entscheidungen (Joker halten,
  Ablage, Quelle, Verweigern). Score-Verschiebungen sortieren nur.
- Zweite Stockkarte ist nicht sichtbar → keine Taktik darauf (wäre Schummeln).

---

## 7. Entscheidungen (fest)

- Namensraum-Objekte; sauberer Neuaufbau; Claude testet intern, Dieter bekommt fertige Sätze.
- Sprachen DE/EN/PT; online-only (kein PWA); kein echtes SKIP-BO-Logo; Querformat später.
- 6.6.0 und 7.0.0 bleiben als Referenz; 7.0.0-JS wird vom Prüfstand gebraucht.
- KONFIG/KI_PLANNER unverändert (Tuner-Schnittstelle). Neue KI-Werte nur in `ki-taktik.js`.
- Maßstab für KI-Änderungen ist die gemessene Siegrate in tune-sim.js, nicht die
  5-Spiele-Auswertung (die beschreibt nur, hat keinen Vergleichsmaßstab).
- Neues Spiel = Seitenreload; `Flow.startGame()` ist zusätzlich in-page-fähig.
- **GitHub-Ablauf (seit 14.11.2026):** Claude hat Schreibzugriff auf das Repo `DieterTepe/Skipo`
  (flach, Zweig `main` = GitHub Pages = live). Jede Änderung bekommt eine neue Versionsnummer
  (neue `SkipBo_x_y_z.html`, alle `?v=` gemeinsam hochzählen, `App.VERSION`, Zurück-Links in
  impressum/datenschutz). Claude testet im Prüfstand, pusht auf einen Zweig `vX.Y.Z` (nichts live),
  Dieter prüft und sagt „freigeben“, erst dann Übernahme nach `main`. Die alte Version bleibt als
  Rückfall liegen. Nie direkt auf `main` ohne Freigabe.

---

## 8. Ideenpool (Reihenfolge = Vorschlag)

1. Soundeffekte (hört auf `move:*` / `pile:cleared` / `game:over`, Aus-Schalter in Settings)
2. ~~Schwierigkeitsgrade~~ – erledigt in 7.0.3 (Abschnitt 6.7)
3. Spielerstatistik erweitern (Siegesserie, Verlauf; Basis `Tracking.history` liegt schon)
4. Farbenblind-Modus (CSS-Klasse am body)
5. Weitere Kartenrückseiten (Design-Bedienfeld)
6. Pass-and-Play (zweiter Mensch statt AI in `Flow._aiRound`)
7. Interaktives Tutorial
8. Querformat-Seitenpanel

---

## 9. Erkenntnisse / Stolperfallen

- **GitHub-Upload am Handy:** „Etwas ist gewaltig schiefgelaufen…" ist ein GitHub-Glitch;
  vom Laptop hochladen oder „Add file → Create new file".
- **Seite unstyled:** `…/Skipo/style.css` direkt öffnen; Dateiname exakt, flach.
- **Cache:** hart neu laden; `?v=`-Nummer ist der sichere Weg.
- **Geister-KI:** gelöst durch `AI.busy` + awaited Rekursion + `AI.over()` an jedem `await`.
  In-Page-Neustart nur über `Flow.startGame()` (setzt `turn.over`, wartet `AI.busy` ab).
- **Hintergrundläufe in der Claude-Sandbox** werden beendet, wenn der Aufruf endet →
  lange Sweeps in Portionen (`--from=N`, fertige Messungen werden übersprungen).
- **Playwright:** gewählte Karten schweben (Animation) → Klicks mit `force`.

---

## 10. Versionshistorie

| Version | Datum | Inhalt |
|---|---|---|
| 6.6.0 | 06/2026 | Einzeldatei, Zugketten-Planer, Tuner-Werte Gen 188 |
| 7.0.0 | 16.06.2026 | Aufteilung in HTML + CSS + 7 JS, verhaltensgleich |
| 7.0.1 | 04.09.2026 | Neuarchitektur (Schichten, Namensräume, Events, I18n-Schlüssel, Store); Äquivalenz bewiesen; live abgenommen |
| 7.0.2 | 04.09.2026 | Blockade-Taktik (59 % gegen 7.0.1), Auswertung beider Seiten, tune-sim.js; live, von Dieter ausgiebig getestet (KI-Siegrate ≈ +20 Punkte) |
| 7.0.3 | 14.11.2026 | Joker am Zugende behalten (behebt Doppelablage), Ablage nach Nützlichkeit, Abstand 3, Handkarte vor Ablage: 68,5 % gegen 7.0.2. Einstellungen Schwierigkeit (Leicht/Mittel/Schwer) und KI-Planung (Superstark/Normal). **Zweig `v7.0.3`, nicht freigegeben** |
