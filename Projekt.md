# Projekt Skipo (Skip-Bo Mobile) – Projektstand 7.0.1

> **Zweck dieser Datei:** Übergabe-Dokument. Wer einen neuen Chat startet, liest
> zuerst diese Datei und weiß sofort, was Stand, Regeln, Entscheidungen und
> nächste Schritte sind. Bei jeder größeren Änderung aktualisieren.

**Letzte Aktualisierung:** 04.09.2026 — **7.0.1 fertig gebaut und in der Sandbox
geprüft** (Node-Simulation, Äquivalenz gegen 7.0.0, Browser-Test mit Chrome).
Offen: Live-Test durch Dieter auf GitHub Pages.

---

## 0. Kurzfassung für den schnellen Einstieg

- **7.0.1** ist ein **kompletter Neuaufbau** mit vier Schichten, einem Namensraum je
  Datei, Ereignisbus, Meldungsschlüsseln (DE/EN/PT) und einem Speicher-Zugang.
  Regeln, Aussehen und KI-Stärke sind 1:1 wie 6.6.0/7.0.0 – **bewiesen**: 500
  simulierte Spiele mit gleichem Seed liefern Zug für Zug dieselben Züge wie 7.0.0.
- **7.0.0** (`SkipBo_7_0_0.html` + state/engine/view/ai/endgame.js) und **6.6.0**
  bleiben unangetastet im Repo als Referenz. `test-sim.js` braucht die 7.0.0-JS-Dateien
  für den Vergleich – **nicht löschen**.
- Hauptdatei: `SkipBo_7_0_1.html`. Alle Dateien flach im Ordner `Skipo`,
  absolute URLs mit `?v=7.0.1`.
- Ukrainisch ist entfallen (Entscheidung 04.09.2026). Drei Sprachen: DE, EN, PT.
- Neues Spiel = Seitenreload (wie 7.0.0); `Flow.startGame()` kann aber auch in-page.

---

## 1. Dateisatz 7.0.1 (Ladereihenfolge = Abhängigkeit)

```
Skipo/  (Repo-Wurzel, GitHub Pages, flach)
│
│  ── Konfiguration (Tuner-Schnittstelle, unverändert übernommen) ──
├── konfig.js            let KONFIG      Tuner-Werte SCORE_* – NUR dieser Block wird vom Tuner ersetzt
├── ki-planner.js        const KI_PLANNER Planer-Konfiguration
│
│  ── core: Fundament, KEIN DOM, läuft in Node ──
├── core-events.js       Events    on / off / emit – Ereignisbus
├── core-store.js        Store     get / set / remove / migrate – EIN Zugang zu localStorage
├── core-settings.js     Settings  name · lang · speed · bg · nameSet · THEMES, load / set
│                        Clock     pause(mult) / after(ms, fn)
├── core-i18n.js         I18n      t(key, …) / say(key, …) / setLang, Wörterbuch T (DE/EN/PT)
├── core-state.js        State     game · turn · reset() · player(p) · opponent(p)
├── core-rules.js        Rules     Deck, shuffle (Rules.random), deal, newGame, isValidBuild,
│                                  isPileComplete, clearPile, hasAnyBuildMove, playToBuild,
│                                  playToDiscard, drawToFive, winner, winnerByStock
│
│  ── ai: KI, KEIN DOM ──
├── ai-turn.js           AI        takeTurn · prepare · executeMoves · finish · stockAttack · discard
│                                  + over() / say() / note() / cardLabel / srcLabel / reasonText
├── ai-planner.js        AI.Planner  snapshot · hash · moves · apply · search · riskCheck · runChains · executeChain
├── ai-eval.js           AI.Eval     candidates · scoreHand · jokerOnBuild · scoreStock · scoreDiscard · dedup · filter
│                                    · jokerFutureValue · gapSize · futureRisk · dynamicPriorities · blockingPotential
│                                    · canRemoveStockCard · neededForStock · opponentCritical
├── ai-analysis.js       AI.Analysis predictEnemyStock · consecutiveDiscards · discardPatterns · blockScore
│                                    · jokerStockTop · jokerHand · jokerProtectDiscard · jokerCombo · jokerBestDiscard
│                                    · jokerFollowUps · handCombo · handComboCache · discardLookAhead
│                                    · discardComboDepth · discardSimChain
│
│  ── flow + tracking, KEIN DOM ──
├── core-flow.js         Flow      startGame · idle · checkEnd · humanCanAct · humanBuild · humanDiscard · _aiRound
├── tracking.js          Tracking  stats · init · load · save · reset · observe · gameEnd
│
│  ── ui: Oberfläche (liest State, hört Events, ruft Flow/Settings) ──
├── ui-render.js         Render    init · all · hand · stock · drawPile · buildPiles · discardPiles · borders
│                                  · labels · message · predictionMarkers · background · enable
│                                  · cardFaceHTML · cardBackHTML
├── ui-input.js          Input     init · onClick · toggleSelect · placeOnBuild · tapOwnDiscard · highlight · clear
│                                  · enableDraggableLabel (Long-Press → Overlays.infoWindow)
├── ui-menu.js           Menu      init · toggle · close · texts · actions{settings, design, rules, lang,
│                                  newgame, tuner-reset, imprint, privacy, close}
├── ui-overlays.js       Overlays  init · texts · showSettings · hideSettings · showDesign · syncDesign
│                                  · showLanguage · showEnd · tunerAnalysisHTML · infoWindow
├── app.js               App       init (Reihenfolge: Settings → I18n → Tracking → Render/Input/Menu/Overlays → Flow)
│
│  ── Werkzeug ──
├── test-sim.js          Prüfstand (nur Node; nicht im HTML geladen), siehe Abschnitt 5
│
├── SkipBo_7_0_1.html    DOM-Gerüst, keine onclick=, keine Inline-Styles, Script-Tags in obiger Reihenfolge
├── style.css            CSS 7.0.0 unverändert + neuer Block am Ende (Menü, Statuszeile, Stock-Rahmen,
│                        Einstellungen, Endscreen, Sprachwahl – vorher Inline/JS-injiziert)
├── impressum.html / datenschutz.html   „Zurück"-Link auf SkipBo_7_0_1.html
├── Projekt.md           diese Datei
├── SkipBo_7_0_0.html + state.js engine.js view.js ai.js endgame.js   Referenz 7.0.0 (für test-sim.js nötig)
└── SkipBo_6_6_0.html    Ur-Referenz
```

---

## 2. Die sechs Architekturregeln

1. **Nur nach unten rufen.** core kennt weder ai noch ui. ai kennt core. flow kennt
   core + ai. ui liest State/Tracking und ruft Flow/Settings/I18n. Nichts ruft nach oben.
2. **Nach oben nur per Ereignis** (`Events.emit`). Die UI hört zu. Liste der Ereignisse
   steht im Kopf von `core-events.js`.
3. **core / ai / flow / tracking fassen nie das DOM an.** Kein `document`, `window`,
   `localStorage` (außer in `Store`). `test-sim.js` lädt sie in Node ohne DOM – jeder
   Verstoß fliegt sofort auf.
4. **Meldungen sind Schlüssel.** `I18n.say('aiBuild', karte, quelle, 2, 1500)` statt
   deutscher Satz. Neue Meldung = ein Eintrag in `core-i18n.js` mit de/en/pt.
5. **Ein Store, ein Präfix.** Alle Werte unter `skipo.v1.*` (name, lang, speed, bg,
   nameSet, tuner). Alte `skipbo-*`-Schlüssel werden beim ersten Start einmalig
   übernommen und gelöscht.
6. **Ein Render-Einstieg.** `Render.all()` nach jeder Zustandsänderung (ausgelöst durch
   Ereignisse). Danach Ereignis `render` (Input wendet die Auswahl-Markierung neu an).

---

## 3. Erweiterungs-Rezepte (so bleibt es sauber)

| Vorhaben | Wo |
|---|---|
| Neue Statusmeldung | `core-i18n.js` Eintrag (de/en/pt) → irgendwo `I18n.say('key', …)` |
| Neuer Menüpunkt | Button mit `data-action="x"` in HTML → `Menu.actions.x()` in `ui-menu.js` → Text `qmX` in I18n + `Menu.texts()`-Zuordnung |
| Neue Einstellung (persistent) | `Settings.DEFAULTS` ergänzen → `Settings.set('key', wert)` → Hörer auf `settings:change` |
| Regeländerung | ausschließlich `core-rules.js`; danach `node test-sim.js --new-only` (Invarianten) |
| KI-Verhalten | `ai-*.js`; danach `node test-sim.js` – erwartete Abweichung vom 7.0.0-Vergleich dann dokumentieren |
| Neues Overlay | `ui-overlays.js` Methode + CSS-Klassen in `style.css` (keine Inline-Styles) |
| Sound / Statistik / Schwierigkeitsgrad | neue Datei, hört auf `move:*`, `game:over`, `turn:change`; wird in `app.js` initialisiert |
| Release | alle `?v=7.0.1` in `SkipBo_7_0_1.html` gemeinsam hochzählen |

---

## 4. Bewusste Abweichungen zu 7.0.0 (alle geprüft)

**Spielverhalten (keine Änderung der KI-Stärke):**
- Die KI hört **sofort** auf, wenn ein Stock leer ist. 7.0.0 spielte nach einem
  Siegzug über die Stock-Priorität oder den Stock-Fallback noch weiter, bis die nächste
  Siegprüfung kam (Punkte/Sieger waren davon nie betroffen). `test-sim.js` schneidet die
  7.0.0-Zugfolge deshalb nach dem Siegzug ab; bis dahin sind alle Züge identisch.
- Legt der Mensch seine letzte Handkarte, zieht nur er nach. 7.0.0 ließ an dieser
  Stelle auch die KI nachziehen (praktisch immer wirkungslos, da ihre Hand voll war).
- **Auto-Pass:** Hat der Mensch keine Handkarte (Nachziehstapel leer) und keinen
  Bauzug, geht der Zug automatisch an die KI (7.0.0: Spiel hing). Passen beide dreimal
  hintereinander → Notwertung `Rules.winnerByStock()` (kleinerer Stock gewinnt).
- Nur Karten im eigenen Bereich sind wählbar (7.0.0 ließ KI-Handkarten „wählen" und
  spielte dann die eigene Karte am selben Index).
- Spielername wird gespeichert und beim Start wiederhergestellt.

**Tuner-Tracking:**
- Jeder KI-Zug wird **einmal** gezählt. 7.0.0 zählte live und beim Spielende noch einmal
  (doppelt). Die Schwellen der Auswertung sind unverändert – die Werte sind jetzt korrekt,
  d. h. etwa halb so groß wie bisher angezeigt. Beim Tunen berücksichtigen.
- Die Einzelbeobachtungen (`skipbo_observations`) werden nicht mehr gespeichert; nur die
  Statistik (`skipo.v1.tuner`). Die beiden Analyse-Texte, die daraus erzeugt wurden,
  hat 7.0.0 nie angezeigt.

**Entfernt (tot oder wirkungslos):** `Joker_auf_Ablage`-Flag, `evaluateAndSelectMove`,
`delayWithCallback`, `GESCHWINDIGKEIT`, `getDiscardSequenceBonus`, `deckComposition`,
`stockPredictions`, Zeitstempel in der Ablage-Historie, `faceUp`-Attribut, der
Regex-Übersetzer (`PHRASE_RULES`/`MSG_RULES`/`DUKI`), CSS-Injektion per JS.

**Texte:** Regeltext korrigiert („Langes Drücken" statt „Kurzes Drücken";
„⚙️-Menü → Spielregeln" statt „5 Sekunden drücken"). Blockade-Tag, „Leer" und die
Joker-Begründungen sind jetzt in allen drei Sprachen (waren deutsch).

---

## 5. Prüfstand – nach jeder Änderung laufen lassen

```
cd Skipo
node test-sim.js 300 42            # Simulation + Invarianten + Äquivalenz gegen 7.0.0
node test-sim.js 100 7 --new-only  # nur neue Engine (wenn 7.0.0-Dateien fehlen)
node test-sim.js 300 42 --old=../anderer-ordner
```
- Lädt core/ai/flow/tracking in Node **ohne DOM** (Regel 3 wird erzwungen).
- Deterministischer Mensch-Bot gegen die KI, Zufall nur beim Mischen (Seed).
- Invarianten je Zug: 156 Karten, Baustapel 1→12, Hand ≤ 5, jedes Spiel endet.
- Äquivalenz: gleiche Spiele durch die 7.0.0-Engine (mit DOM-Attrappe), Vergleich der
  Zugfolgen. Exit-Code 0 = alles gleich, 1 = Abweichung (mit Beispiel-Ausgabe).

**Ergebnis 04.09.2026:** 300 Spiele (Seed 42) + 200 Spiele (Seed 7) → 106.250 Züge,
**alle Zugfolgen identisch**, 0 Invarianten-Fehler. Zusätzlich statisch geprüft:
531 Namensraum-Verweise lösen sich auf; alle 121 benutzten Sprachschlüssel existieren in
de/en/pt; alle IDs/Klassen/data-actions vorhanden. Browser-Test (Chrome headless,
390×844): 55 Prüfungen – Rendern, Auswahl, gültige/ungültige Züge, Stock→Ablage-Verbot,
KI-Zug, Long-Press, Menü, Einstellungen, Sprache, Design, komplettes Spiel bis
Endscreen, Migration alter Schlüssel, Erststart – alle bestanden, 0 Konsolenfehler.

---

## 6. Nächste Schritte

1. **Dieter:** kompletten Dateisatz hochladen (alle 7.0.1-Dateien, `style.css` und die
   Rechtsseiten überschreiben), dann live testen:
   `https://dietertepe.github.io/Skipo/SkipBo_7_0_1.html` – Touch, Menüs, Sprachen,
   Design, ein Spiel bis zum Ende. Hart neu laden (Cache).
2. Danach Ideenpool (Abschnitt 8) – jetzt jeweils Einzeldatei-Änderungen.

---

## 7. Entscheidungen (fest)

- Namensraum-Objekte statt freier Funktionen (04.09.2026).
- Direkt sauber neu aufbauen, Claude testet intern, Dieter bekommt einen fertigen Satz.
- Ukrainisch entfernt; Sprachen DE/EN/PT.
- Online-only über GitHub Pages; Offline/PWA kein Ziel.
- Kein echtes SKIP-BO-Logo (CSS-Text bleibt). Querformat-Seitenpanel: später.
- 6.6.0 und 7.0.0 bleiben als Referenz im Repo (7.0.0-JS wird vom Prüfstand gebraucht).
- KONFIG/KI_PLANNER unverändert (Tuner-Schnittstelle).

---

## 8. Ideenpool (Reihenfolge = Vorschlag)

1. Soundeffekte (Karte legen, Stapel voll, Sieg) – hört auf `move:*`/`pile:cleared`/`game:over`, Aus-Schalter in Settings
2. KI-Schwierigkeitsgrade (KONFIG-Sätze leicht/mittel/stark, Auswahl in Settings)
3. Statistik-Anzeige für den Spieler (eigene Datei, hört `game:over`, Store-Schlüssel `stats`)
4. Farbenblind-Modus (CSS-Klasse am body, Muster zusätzlich zu Farbe)
5. Weitere Kartenrückseiten (Design-Bedienfeld, `Settings.cardBack`)
6. Pass-and-Play (zweiter Mensch statt AI in `Flow._aiRound`)
7. Interaktives Tutorial
8. Querformat-Seitenpanel

---

## 9. Erkenntnisse / Stolperfallen

- **GitHub-Upload am Handy:** „Etwas ist gewaltig schiefgelaufen…" ist ein GitHub-Glitch.
  Vom Laptop hochladen oder „Add file → Create new file" + Inhalt einfügen.
- **Seite unstyled:** `…/Skipo/style.css` direkt im Browser öffnen; Dateiname exakt, flach.
- **Cache:** Hart neu laden (Strg+F5 / Cmd+Shift+R); `?v=`-Nummer ist der sichere Weg.
- **Geister-KI:** in 7.0.1 durch `AI.busy` + awaited Rekursion + `AI.over()` an jedem
  `await` gelöst. Wer einen In-Page-Neustart baut: `Flow.startGame()` setzt `turn.over`
  und wartet `AI.busy` ab – nichts anderes benutzen.
- **Playwright-Test:** gewählte Karten schweben (Animation) → Klicks mit `force`.
