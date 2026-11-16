# Projekt Skipo (Skip-Bo Mobile) – Projektstand 7.0.5

> **Zweck dieser Datei:** Übergabe-Dokument. Wer einen neuen Chat startet, liest
> zuerst diese Datei und weiß sofort, was Stand, Regeln, Entscheidungen und
> nächste Schritte sind. Bei jeder größeren Änderung aktualisieren.

**Letzte Aktualisierung:** 16.11.2026 — **7.0.5 ist live** (von Dieter freigegeben, `main`).
Neu: vierte Stufe **Profi** (Standard) – wie Schwer, zusätzlich spielt die KI ihre Ablage
voraus (53,3 % gegen Schwer). Menüpunkt „Statistik zurücksetzen". Leicht, Mittel und
Schwer spielen Zug für Zug wie 7.0.4. Dieters Live-Test von 7.0.5 steht noch aus.

---

## 0. Kurzfassung für den schnellen Einstieg

- **Spiel:** `https://dietertepe.github.io/Skipo/SkipBo_7_0_5.html` – GitHub Pages, Repo
  `DieterTepe/Skipo`, alle Dateien **flach** im Ordner, absolute URLs mit `?v=7.0.5`.
  Die alten Adressen `SkipBo_7_0_2.html` bis `SkipBo_7_0_4.html` leiten weiter.
- **Architektur:** vier Schichten (core → ai → flow/tracking → ui), ein Namensraum je
  Datei, Ereignisbus, Meldungsschlüssel (DE/EN/PT), ein Speicher-Zugang. Kein DOM in
  core/ai/flow/tracking → alles läuft in Node und ist simulierbar.
- **KI:** vier Stufen (Leicht / Mittel / Schwer / **Profi** = Standard) und zwei Planungsarten
  (**Superstark** = Standard / Normal), wählbar in den Einstellungen. Alle Zahlen der KI
  stehen in **einer** Datei `ai-config.js`.
- **Stärke im echten Spiel (Dieter, 15.11.2026):** Schwer + Superstark gewinnt gegen einen
  sehr starken Menschen rund 70 %. Die Abstufung der Stufen passt.
- **Zwei Prüfstände (Node):** `test-sim.js` prüft die Regeln und vergleicht Zug für Zug
  gegen einen älteren Stand; `tune-sim.js` misst die Stärke (KI gegen KI). **Nach jeder
  Änderung beide laufen lassen.**
- **Ablauf für Änderungen:** Claude baut und testet auf einem Zweig `vX.Y.Z`, Dieter sagt
  „freigeben", erst dann geht es nach `main` (= live). Abschnitt 6.
- Sprachen: DE, EN, PT.

---

## 1. Dateien (Ladereihenfolge = Abhängigkeit)

```
Skipo/  (Repo-Wurzel, GitHub Pages, flach)                                         Zeilen
│
│  ── core: Fundament, KEIN DOM ──
├── core-events.js    Events    on / off / emit – Ereignisbus (Liste im Dateikopf)      61
├── core-store.js     Store     get / set / remove / cleanup – EIN Zugang zu            76
│                               localStorage (Präfix skipo.v1.)
├── core-settings.js  Settings  name · lang · speed · bg · nameSet · level · planning  107
│                               load / set / cleanSpeed, THEMES
│                     Clock     pause(mult) / after(ms, fn)
├── core-i18n.js      I18n      t(key, …) / say(key, …) / setLang, Wörterbuch T        337
├── core-state.js     State     game · turn · reset() · player(p) · opponent(p)         45
├── core-rules.js     Rules     Deck, shuffle (Rules.random), deal, newGame,           220
│                               isValidBuild, nextNeeded, clearPile, hasAnyBuildMove,
│                               playToBuild, playToDiscard, drawToFive, winner,
│                               winnerByStock
│
│  ── ai: KI, KEIN DOM ──
├── ai-config.js      KI_STUFEN · KI_PLANNER · KONFIG – alle Zahlen der KI, reine Daten 130
├── ai-turn.js        AI        takeTurn · prepare · executeMoves · moveRound ·         425
│                               stockPriority · finish · discard
│                               + over() / taktik() / fairStock() / knownStock()
├── ai-planner.js     AI.Planner  snapshot · moves · apply · search('stock'|'clear') · 307
│                               riskCheck · runChains · executeChain
├── ai-eval.js        AI.Eval     candidates · scoreHand/Stock/Discard · filter ·      422
│                               applyBlockade · Einzelbewertungen
├── ai-analysis.js    AI.Analysis predictEnemyStock · threat · usefulForStock ·        315
│                               jokerStockTop · jokerHand · jokerCombo · handCombo
├── ai-lookahead.js   AI.Look     Vorausspielen (Stufe Profi): clone · shuffleHidden ·  150
│                               playTurns · value · choose(options, apply, cfg)
│
│  ── flow + tracking, KEIN DOM ──
├── core-flow.js      Flow      startGame · humanBuild · humanDiscard · _aiRound ·     129
│                               checkEnd (Auto-Pass, Notwertung)
├── tracking.js       Tracking  Zähler beider Seiten je Spiel, last, history (10),      98
│                               averages()
│
│  ── ui: Oberfläche ──
├── ui-render.js      Render    all · hand · stock · buildPiles · discardPiles ·       255
│                               message · predictionMarkers · background
├── ui-input.js       Input     delegierter Klick, Auswahl, Long-Press, Infozeile      228
├── ui-menu.js        Menu      Schnellmenü, actions (data-action)                      77
├── ui-overlays.js    Overlays  Einstellungen (Name, Stufe, Planung, Tempo, Regeln),   366
│                               Design, Sprache, Endscreen mit Vergleich, Info-Fenster
├── app.js            App       init(), VERSION                                         41
│
│  ── Seiten ──
├── SkipBo_7_0_5.html     Startseite: DOM-Gerüst, keine onclick=, keine Inline-Styles
├── SkipBo_7_0_2.html … SkipBo_7_0_4.html   Weiterleitungen auf die Startseite (alte Adressen)
├── style.css             alle Stile                                                   958
├── impressum.html / datenschutz.html    „Zurück"-Link auf die Startseite
│
│  ── Werkzeuge (nur Node, nicht im Spiel geladen) ──
├── test-sim.js           Regel-Prüfstand                                              271
├── tune-sim.js           Stärke-Prüfstand                                             207
├── README.md
└── Projekt.md            diese Datei
```

**Gesichert, aber nicht mehr im Ordner:** Zweig `stand-7.0.3` = letzter Stand vor dem
Aufräumen (enthält auch 6.6.0, 7.0.0, den Tuner und die 56 Versuchsschalter). Dieter hat
zusätzlich eine ZIP. Wiederherstellen einer Datei: `git show stand-7.0.3:DATEI`.
Zweige `stand-7.0.4` und `stand-7.0.5` = Stände der Freigaben (Maßstab für den nächsten Umbau).

---

## 2. Die sechs Architekturregeln

1. **Nur nach unten rufen.** core kennt weder ai noch ui. ai kennt core. flow kennt
   core + ai. ui liest State/Tracking und ruft Flow/Settings/I18n. Nichts ruft nach oben.
2. **Nach oben nur per Ereignis** (`Events.emit`). Die UI hört zu.
3. **core / ai / flow / tracking fassen nie das DOM an.** Kein `document`, `window`,
   `localStorage` (außer in `Store`). Die Prüfstände laden sie in Node ohne DOM.
4. **Meldungen sind Schlüssel.** `I18n.say('aiBuild', karte, quelle, 2, 1500)`.
   Neue Meldung = ein Eintrag in `core-i18n.js` mit de/en/pt.
5. **Ein Store, ein Präfix.** Alle Werte unter `skipo.v1.*`: name, lang, speed, bg,
   nameSet, level, planning, stats.
6. **Ein Render-Einstieg.** `Render.all()` nach jeder Zustandsänderung; danach Ereignis
   `render` (Input wendet die Auswahl-Markierung neu an).

Dazu zwei KI-Regeln seit 7.0.4:

7. **Alle Zahlen der KI stehen in `ai-config.js`.** Kein Wert im Code, der eine Stufe
   ausmacht. Stufenunterschiede nur über `AI.taktik()` (liefert `KI_STUFEN[stufe]`,
   `null` bei Leicht).
8. **Eigener Stock nur über `AI.knownStock()`.** Jede Stelle, die mehr als die oberste
   eigene Stockkarte braucht, fragt dort. So gilt „Normal" (nur die oberste Karte ist
   bekannt) überall gleich. Gegnerhand und Nachziehstapel liest die KI nie.

---

## 3. Erweiterungs-Rezepte

| Vorhaben | Wo |
|---|---|
| Neue Statusmeldung | `core-i18n.js` Eintrag (de/en/pt) → `I18n.say('key', …)` |
| Neuer Menüpunkt | Button `data-action="x"` in der Startseite → `Menu.actions.x()` → Text `qmX` in I18n + `Menu.texts()` |
| Neue Einstellung (persistent) | `Settings.DEFAULTS` + Prüfung in `Settings.load()` → `Settings.set('key', wert)` → Hörer auf `settings:change` |
| Regeländerung | nur `core-rules.js`; danach `node test-sim.js 300 42` |
| **KI-Wert ändern** | `ai-config.js` → `node tune-sim.js --games=2000 S:KEY=WERT` (bzw. `P:` / `K:`) → übernehmen nur bei > 53 % mit zweitem Seed → `node test-sim.js 300 42` |
| **Neue KI-Idee** | Wert in `KI_STUFEN.hard` (und `medium` mit dem „Aus"-Wert) → Code in `ai-*.js` hinter `AI.taktik()` → messen wie oben. Wirkungslose Ideen wieder **entfernen**, nicht als toten Schalter liegen lassen; Ergebnis in Abschnitt 5 notieren |
| Umbau ohne Verhaltensänderung | vorher Maßstab anlegen (`git worktree add ../skipo-ref stand-7.0.4`), danach `node test-sim.js 2000 41 --ref=../skipo-ref` → muss „Zug für Zug gleich" melden |
| Neues Overlay | `ui-overlays.js` Methode + CSS-Klassen in `style.css` (keine Inline-Styles) |
| Sound o. ä. | neue Datei, hört auf `move:*`, `game:over`, `turn:change`; Init in `app.js`; Script-Tag in der Startseite (die Prüfstände lesen die Skriptliste von dort) |
| **Release** | Abschnitt 6 |

---

## 4. Die KI

### 4.1 Ablauf eines KI-Zugs (`ai-turn.js`)
1. `prepare()` – auf 5 Karten ziehen, Blockade-Marker setzen.
2. `executeMoves()` – Runden aus: Joker oben im Stock → **Planer** (`runChains`: erst
   Stock-Ketten, dann Hand-leeren-Ketten) → **Kandidatenschleife** (jeder weitere
   erlaubte Einzelzug, bester zuerst). Spielt die Stock-Priorität eine Stockkarte,
   beginnt die Runde neu – ohne nachzuziehen.
3. `finish()` – Joker am Zugende behandeln, **genau eine Ablage**, nachziehen.

Die KI spielt jeden Zug, der nach `AI.Eval.filter()` übrig bleibt. Die Bewertung
(KONFIG) bestimmt nur Reihenfolge, Ablage und in „Leicht" den Joker-Einsatz. Stärke
entsteht durch **echte Entscheidungen**: Zug verweigern, Joker halten, was ablegen,
welche Quelle.

### 4.2 Stufen (`KI_STUFEN` in `ai-config.js`, Einstellung `Settings.level`)

| Stufe | Was die KI tut |
|---|---|
| **Leicht** `easy` | keine Blockade; Joker werden über die Heuristik gespielt |
| **Mittel** `medium` | Blockade: Karte V−1 nicht spielen (V = sichtbare Stockkarte des Gegners), außer die KI kann selbst mit V oder Joker zudecken; V−2 nicht bei sichtbarer Brücke. Joker nur in Planer-Ketten, am Zugende nur mit Folgekarten |
| **Schwer** `hard` | zusätzlich: Joker am Zugende behalten und nie ablegen (`JOKER_KEEP`), Ablage behält Karten für die eigene Stockkarte und legt Doppelte zuerst ab (`DISC_KEEP_USEFUL`, `DISC_DUP`), Sicherheitsabstand 3 (`AVOID_DIST`), Handkarte vor Ablagekarte (`PREFER_HAND`) |
| **Profi** `pro` (Standard) | wie Schwer; vor dem Ablegen spielt die KI die 6 besten Möglichkeiten je 8-mal 4 Halbzüge voraus (`LOOK_*`, `ai-lookahead.js`) und nimmt den besten Durchschnitt. Rund 50 ms je Zug am Rechner, Obergrenze 400 ms |

**Vorausspielen (AI.Look):** Spielfeld kopieren → alles Verdeckte (Gegnerhand,
Nachziehstapel, verdeckte Stockkarten) zufällig neu verteilen – das ist Kartenzählen: Verteilt
werden genau die Karten, die nicht sichtbar sind → Möglichkeit ausführen → mit der normalen
KI weiterspielen → Stockvorsprung bewerten. Währenddessen ist das Spiel stumm
(`Events.muted`, `Clock.instant`, eigener Zufall); danach ist alles wie vorher.

**KI-Planung** (`Settings.planning`): **Superstark** `super` (Standard) rechnet mit allen
Karten des eigenen Stocks, auch den verdeckten. **Normal** `normal` kennt nur die oberste –
wie der Mensch. Gilt in jeder Stufe und seit 7.0.4 an jeder Stelle der KI.

Bedienung: Einstellungen → zwei Schaltergruppen mit Erklärzeile; gilt erst mit
„Übernehmen", dann ab dem nächsten KI-Zug. Der Endscreen zeigt die gespielte Stärke.
Die 10-Spiele-Durchschnitte im Endscreen mischen Spiele verschiedener Stufen.

### 4.3 Gemessene Stärke (tune-sim.js, 2000 gepaarte Spiele, Seed 1, Stand 7.0.4)

| Vergleich | Siegrate |
|---|---|
| Mittel gegen Leicht | 58,3 % |
| Schwer gegen Mittel | 69,8 % |
| Schwer gegen Leicht | 75,3 % |
| Normal gegen Superstark (Schwer) | 45,6 % |
| **Profi gegen Schwer** (2 × 1000 Paare) | **53,5 % / 53,1 %** |
| Schwer + Superstark gegen den einfachen Bot | 92,5 % |
| **Schwer + Superstark gegen sehr starken Menschen (Dieter, echt)** | **≈ 70 %** |

---

## 5. Was gemessen wurde (damit nichts doppelt probiert wird)

Wirkung haben nur echte Entscheidungen. Verschobene Bewertungszahlen sortieren nur.

**Wirksam (alles in „Schwer" enthalten; Punkte = Siegrate über 50 %):**

| Entscheidung | Gewinn |
|---|---|
| Karte V−1 nicht spielen, V−2 nicht bei sichtbarer Brücke, Joker nicht über die Heuristik (= Mittel) | +9 gegen Leicht |
| Joker am Zugende in der Hand behalten (statt einzeln verspielen oder zusätzlich ablegen) | +10 |
| Ablage: Karten für die eigene Stockkarte behalten, Doppelte zuerst | +4 |
| Handkarte statt Ablagekarte, wenn beide dieselbe Karte bieten (umgekehrt −3,3) | +3,5 |
| Sicherheitsabstand 3 statt 1 (4 und 5: +1, 6: ±0) | +2 |
| Planer rechnet mit verdeckten eigenen Stockkarten (= Superstark) | +4 |
| Ablage vorausspielen, Tiefe 4 (= Profi). Tiefe 2: +1, Tiefe 6: gleich, Tiefe 8: weniger | +3,3 |

**Ohne Gewinn oder schädlich (wieder entfernt):**

| Idee | Ergebnis |
|---|---|
| **Karten zurückhalten, damit der Gegner weniger anlegen kann** (alle Leerlaufzüge −13, nur Hand −21, nur Ablage −2, nur Richtung eigener Stock −10 bis −13) | stark negativ: eigene Karten loswerden und nachziehen ist viel mehr wert |
| Kettenbedrohung: Zug meiden, nach dem der Gegner über seine sichtbaren Ablagen an die Stockkarte kommt | −4; mit Deckkarten-Ausnahme ±0 |
| Joker auf die Ablage parken / ab N Jokern einen frei spielen / Joker-Budget je Kette 1, 3, 5 | −2,5 bis ±0 |
| Offenen Stapel mit Joker zudecken; Joker zählt nicht als Deckkarte; Hand-leeren-Ketten ohne Joker | ±0 bis +0,9 |
| Joker auf der Ablage nie verdecken, Joker auf Joker (passiert ohnehin nur 1× in 20 Spielen) | ±0 |
| Serienstapel (größere auf kleinere Karte bestrafen) – greift bei 18 % der Ablagen | ±0 |
| Nützliche oder bald spielbare Karte nicht verdecken; bald Spielbares behalten; gleiche Werte stapeln | ±0 |
| Blockierte Karte zuerst ablegen (300: +1; 1000: −3); Deckkarte behalten | ±0 |
| Rundlauf 12→1 beachten; Wettlauf-Ausnahme bei kleinem eigenem Stock (−0,8 / −1,7) | ±0 / negativ |
| Planer: offenes Kettenende meiden, Risikoprüfung immer, mehr Suchknoten/Tiefe, Hand leeren bevorzugen, Handkarten zuerst (−1,5) | ±0 |
| **Blockade nach Wahrscheinlichkeit** (Dieters Idee). Orakel-Test: KI kennt die Gegnerhand und blockiert nur, wenn er die Lücke wirklich schließen kann | 50,5 %; zusätzlich zur Abstandsregel 51,4 % → Obergrenze ≈ +1. Der feste Abstand schützt über mehrere Züge, nicht nur für den nächsten |
| Rückschluss „was der Gegner nicht gelegt hat" beim Verteilen der Karten im Vorausspielen | 51,3 % statt ≈ 53–55 % ohne → kein Gewinn |
| 71 Tuner-Werte einzeln ×0 / ×0,5 / ×2 | 54 ohne jede Wirkung, Rest Rauschen |

**Obergrenze der Ablage:** Eine KI, die beim Ablegen die echte Zukunft kennt, gewinnt 95 %.
Fast alles davon ist Wissen über künftige Karten; faires Vorausspielen holt davon ≈ 3 Punkte.
Rechenaufwand der Messung: 300 Paare mit Profi ≈ 20 Minuten.

**Aufräumen 7.0.4 – was dabei belegt wurde:**
- 31 der 71 KONFIG-Werte änderten in keiner Stufe einen Zug; 20 davon waren im Code
  nachweislich tot und sind entfernt (Tiefenanalyse der Ablage, alte Blockade-Muster mit
  Gewicht 0, Debug-Schalter, ein Grundwert, der allen Möglichkeiten gleich zugeschlagen
  wurde, unbenutzte Werte). 51 bleiben.
- In 9000 gezählten Spielen griffen nie: Stock-Attacke (braucht 60 % Vorhersage, erreicht
  ~12 %), doppelte Ablage in Leicht. Die Stock-Priorität griff 1×; ihr Neustart zog dabei
  regelwidrig mitten im Zug nach → jetzt ohne Nachziehen.
- Die KI lässt nie eine spielbare Stockkarte liegen (0 von 36 000 Zügen).

---

## 6. Prüfstände und Release

### 6.1 test-sim.js – „Stimmen die Regeln? Hat der Umbau etwas verändert?"
```
node test-sim.js 300 7                          # alle acht Kombinationen, je 300 Spiele (Profi: 30)
node test-sim.js 2000 41 --ref=../skipo-ref     # zusätzlich Zug für Zug gegen einen Maßstab
node test-sim.js 300 7 --stufe=hard --planung=super
```
Lädt genau die Skripte der Startseite (ohne ui-*.js, app.js) in eine Sandbox ohne DOM.
Deterministischer Mensch-Bot gegen die KI, Zufall nur beim Mischen (Seed). Invarianten:
156 Karten, Baustapel aufsteigend, Hand ≤ 5, **KI legt höchstens eine Karte je Zug ab**,
Spiel endet. Mit `--ref` läuft dasselbe Spiel mit einem älteren Stand; jede Abweichung
wird mit Zugnummer gezeigt. Rückgabewert 1 bei Fehler.
Per `require('./test-sim.js')` liefert die Datei `makeEngine`, `playGame` für eigene
Auswertungen (so arbeitet auch tune-sim.js).

**Nachweis 7.0.4:** 12 000 Spiele (2,5 Mio. Züge) Zug für Zug gleich mit 7.0.3 in allen
sechs Kombinationen. Danach eine gewollte Änderung: „Normal" gilt auch in der Zugbewertung
(Regel 8). Neu gegen alt gemessen: Schwer 50,0 %, Mittel 50,0 %, Leicht 51,6 %.
„Superstark" ist weiterhin Zug für Zug gleich mit 7.0.3 (4500 Spiele).

### 6.2 tune-sim.js – „Ist die KI stärker?"
```
node tune-sim.js --games=500                       # Kontrolle A = B → exakt 50 %
node tune-sim.js --games=2000 S:AVOID_DIST=4       # Schwer mit Abstand 4 gegen Schwer
node tune-sim.js --games=2000 --a=medium/super     # Schwer gegen Mittel
node tune-sim.js --games=2000 --b=hard/normal      # Normal gegen Superstark
node tune-sim.js --games=2000 K:SCORE_15=200 A:P:MAX_NODES=20000
node tune-sim.js --games=1000 --bot                # gegen den einfachen Bot
node tune-sim.js --games=300 --sweep               # jeden KONFIG-Wert ×0 / ×0.5 / ×2
```
Zwei Seiten A und B, jede = Stufe/Planung + Änderungen (`S:` Stufenwert, `P:` Planer,
`K:` KONFIG; Vorsatz `A:` für Seite A). Jedes Spiel läuft zweimal mit getauschten Sitzen →
Kartenglück und Anfangsvorteil heben sich auf. ~65 Spiele/s.
**Übernahmeregel:** ≥ 2000 Paare, > 53 %, mit zweitem Seed bestätigt.
**Grenze:** KI gegen KI. Was ein Mensch anders ausnutzt, zeigt nur das echte Spiel.

### 6.3 Release-Ablauf (GitHub)
Claude hat Schreibzugriff auf `DieterTepe/Skipo`. `main` = GitHub Pages = live.
Marken (Tags) lässt die Verbindung nicht zu → Stände werden als Zweig `stand-x.y.z` gesichert.

1. Zweig `vX.Y.Z` von `main`. Neue Startseite `SkipBo_X_Y_Z.html`, alle `?v=` gemeinsam
   hochzählen, `App.VERSION`, Zurück-Links in impressum/datenschutz, README.
2. Die bisherige Startseite durch eine Weiterleitung ersetzen (Kopie von
   `SkipBo_7_0_3.html`), in **allen** Weiterleitungen das Ziel neu setzen. Grund: Alle
   Startseiten laden dieselben JS-Dateien; eine alte Seite zeigte sonst die neue KI mit
   altem Titel.
3. Prüfen: `test-sim.js`, `tune-sim.js`, Browsertest (Playwright mit lokalem Server,
   URLs auf `http://127.0.0.1:PORT/Skipo/` umgeschrieben).
4. Zweig pushen (nichts ist live). Dieter um Freigabe fragen.
5. Nach „freigeben": Fast-Forward nach `main`, pushen, Zweig `stand-X.Y.Z` anlegen.
6. Projektordner (claude.ai-Projekt) mit denselben Dateien aktualisieren.

**Grenzen:** Ein Zweig lässt sich nicht im Browser vorab testen (Pages zeigt nur `main`).
Ob Pages ausliefert, kann Claude nicht abfragen → Dieter öffnet die Adresse einmal.

---

## 7. Nächste Schritte

**Erledigt in 7.0.5:** Beide Ideen vom 15.11.2026 sind gemessen (Abschnitt 5). Übrig als Idee:
Vorausspielen auch für das Zugverhalten (Versuchscode lag vor, nicht gemessen), mehr
Verteilungen oder frühes Aussortieren schwacher Möglichkeiten.

**Ursprünglicher Plan (zur Einordnung):**
1. **Wahrscheinlichkeiten (Dieters Idee).** Fertige Baustapel werden sofort
   zurückgemischt, die unbekannten Karten sind also immer „alle minus die sichtbaren" –
   die KI muss sich nichts merken. Erwartung: 1–3 Punkte. Das Zählen allein verschiebt
   wenig (Grundwahrscheinlichkeit, dass der Gegner eine bestimmte Karte oder einen Joker
   hält: grob 57 %). Wertvoller: **was der Gegner nicht gelegt hat**, obwohl er konnte.
   Beste Anwendung: Blockade nur verweigern, wenn das Risiko wirklich hoch ist, statt
   starr drei Karten Abstand.
2. **Vorausspielen (Claudes Idee).** Unbekannte Karten viele Male zufällig austeilen, die
   nächsten Züge durchspielen, das im Schnitt Beste wählen. Größter möglicher Hebel,
   größter Aufwand, Rechenzeit auf dem Handy. Erst im Prüfstand messen, nur bei klarem
   Gewinn fürs Spiel bauen.
3. Bei 70 % gegen einen sehr starken Menschen ist ein großer Teil des Rests Kartenglück.
   Entschieden (16.11.2026): vierte Stufe „Profi", sie ist der neue Standard.

**Ideenpool (Reihenfolge = Vorschlag):** Soundeffekte · Spielerstatistik erweitern
(Siegesserie, Verlauf; Basis `Tracking.history`) · Farbenblind-Modus · weitere
Kartenrückseiten · Pass-and-Play · interaktives Tutorial · Querformat-Seitenpanel.

---

## 8. Entscheidungen (fest)

- Namensraum-Objekte; Claude testet, Dieter gibt frei. Jede Änderung bekommt eine neue
  Versionsnummer und eine neue Startseite (keine feste Adresse – Dieter verwaltet externe
  Kopien nach Versionsnummer).
- Der Ordner enthält nur die aktuelle Version (seit 7.0.4). Vorversionen werden nicht
  mehr unterstützt; gespeicherte Altdaten werden beim Start gelöscht, nicht übernommen.
- Der externe Tuner wird nicht mehr benutzt; die Tuner-Auswertung im Spiel ist entfernt.
  Maßstab für KI-Änderungen ist allein die gemessene Siegrate.
- Stufen Leicht / Mittel / Schwer / Profi und Planung Superstark / Normal; Standard Profi +
  Superstark (Dieter, 16.11.2026). Wer schon eine Stufe gespeichert hat, behält sie.
- Tempo 0–2 s in 0,1-Schritten, Standard 0 (mehr nur zum Nachvollziehen oder für Laien).
- Aufräumen und KI-Stärke nie in derselben Version (sonst ist unklar, woher eine
  Änderung der Stärke kommt).
- Sprachen DE/EN/PT; online-only (kein PWA); kein echtes SKIP-BO-Logo.
- Neues Spiel = Seitenreload; `Flow.startGame()` ist zusätzlich in-page-fähig.

---

## 9. Erkenntnisse / Stolperfallen

- **Cache:** hart neu laden; die `?v=`-Nummer ist der sichere Weg.
- **Seite unstyled:** `…/Skipo/style.css` direkt öffnen; Dateiname exakt, flach.
- **Geister-KI:** `AI.busy` + `AI.over()` nach jedem `await`. In-Page-Neustart nur über
  `Flow.startGame()` (setzt `turn.over`, wartet `AI.busy` ab).
- **Farbwechsel im Einstellungsfenster** (`hue-rotate` auf dem ganzen Fenster) färbt alle
  Farben darin um → für Markierungen nur Weiß/Schwarz verwenden.
- **Tempo 0** heißt: keine Pausen, aber jeder Schritt bleibt asynchron (Browser zeichnet).
- **Hintergrundläufe in der Claude-Sandbox** enden mit dem Aufruf → lange Messungen in
  Portionen, zwei Läufe parallel (2 Kerne).
- **Playwright:** gewählte Karten schweben (Animation) → Klicks mit `force`, oder das
  Spiel über `Flow.humanBuild` / `Flow.humanDiscard` steuern.
- **Python-Heredocs mit „deutschen" Anführungszeichen:** Das schließende `"` beendet die
  Zeichenkette → dreifache Anführungszeichen benutzen.

---

## 10. Versionshistorie

| Version | Datum | Inhalt |
|---|---|---|
| 6.6.0 | 06/2026 | Einzeldatei, Zugketten-Planer, Tuner |
| 7.0.0 | 16.06.2026 | Aufteilung in HTML + CSS + 7 JS |
| 7.0.1 | 04.09.2026 | Neuarchitektur (Schichten, Namensräume, Ereignisse, Meldungsschlüssel, Store) |
| 7.0.2 | 04.09.2026 | Blockade-Taktik (59 % gegen 7.0.1), Vergleich beider Seiten im Endscreen, tune-sim.js |
| 7.0.3 | 14.11.2026 | Joker am Zugende behalten, Ablage nach Nützlichkeit, Abstand 3, Handkarte vor Ablage: 68,5 % gegen 7.0.2. Stufen und KI-Planung in den Einstellungen. Echt: ≈ 70 % gegen sehr starken Menschen |
| 7.0.4 | 15.11.2026 | Aufräumen: nur noch diese Version im Ordner (19 000 → 5 700 Zeilen, KI 2 570 → 1 600), Tuner-Auswertung entfernt, eine KI-Konfigurationsdatei, Tempo 0–2 s (Standard 0), „Normal" gilt überall. KI gleich stark wie 7.0.3. Live seit 16.11.2026 (Freigabe Dieter) |
| 7.0.5 | 16.11.2026 | Stufe Profi (Standard): Ablage vorausspielen, 53,3 % gegen Schwer. Menüpunkt „Statistik zurücksetzen". Einstellungsfenster als Spalte. Wahrscheinlichkeits-Blockade gemessen und verworfen. Live seit 16.11.2026 (Freigabe Dieter) |
