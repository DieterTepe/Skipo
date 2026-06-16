# Projekt Skip-Bo Mobile – Projektstand & Ziele

> **Zweck dieser Datei:** Übergabe-Dokument. Wer einen neuen Chat startet, liest
> zuerst diese Datei und weiß sofort, was Stand, Entscheidungen und nächste
> Schritte sind. Bei jeder größeren Änderung aktualisieren.

**Letzte Aktualisierung:** 16.06.2026 — Schritt 1 (CSS-Auslagerung) abgeschlossen und live getestet.

---

## 1. Was ist das Projekt?

Eine vollständige **Skip-Bo-Implementierung** (Mensch gegen KI) als Browser-Spiel,
mobil-optimiert (9:16, Touch), viersprachig (DE / EN / PT / UK).

- **Referenz-Version 6.6.0** – `SkipBo_6_6_0.html`, ~6175 Zeilen, alles in EINER
  Datei. Gilt als **optimal in Ablauf und Funktion**. Bleibt als stabile
  Referenz unangetastet.
- **Aktive Version 7.0.0** – Struktur-Umbau: die Einzeldatei wird in mehrere
  Dateien aufgeteilt. Verhalten, Aussehen und Regeln bleiben **1:1 wie 6.6.0**.
- **Läuft live (funktionierender Link):**
  https://dietertepe.github.io/Skipo/SkipBo_7_0_0.html
- **Repo:** `DieterTepe/Skipo` (GitHub Pages).

**Grundregel bei allen Umbauten:** Verhalten/Aussehen/Regeln 1:1 erhalten,
solange nicht ausdrücklich eine Änderung gewünscht ist. Immer auf gute
**Erweiterbarkeit** achten (Hauptwunsch des Nutzers).

---

## 2. Wichtige Projekt-Regeln (Infrastruktur)

1. **Alles FLACH im Ordner `Skipo` – KEINE Unterordner.** Alle Pfade in
   `<link>`/`<script>` ohne Verzeichnis (z. B. `href="style.css"`,
   `src="konfig.js"`).
2. **Klassische `<script src>`-Dateien**, KEINE ES-Module (`import`/`export`),
   KEIN Bundler. Grund: gemeinsamer globaler Namensraum (`Game`, `KONFIG`, freie
   Funktionen rufen sich gegenseitig). Klassische Scripts behalten dieses
   Verhalten – fast keine Code-Änderung nötig. Passt zu GitHub Pages
   (editieren → pushen, kein Build-Schritt).
3. **Alles beim Start laden, nichts „on demand".** Aufteilen ja, bedarfsweises
   Nachladen nein.
4. **Hauptdatei heißt `SkipBo_7_0_0.html`** (Unterstriche, kein `index.html`).
5. **Beim Auslagern NICHTS inhaltlich ändern, nur verschieben** – so bleibt jeder
   Fehler sofort lokalisierbar. (Geprüft: JS-Block ist Byte-identisch zu 6.6.0.)

---

## 3. Aufbau des Codes (17 Module)

Engine-Funktionen fassen nie das DOM an, Rendering liest nur. KI und Mensch
nutzen dieselben Engine-Funktionen.

| Modul | Inhalt | Ziel-Datei (geplant) |
|-------|--------|----------------------|
| 01 | `KONFIG` – Tuner-Schnittstelle, alle `SCORE_*` (1:1 austauschbar) | `konfig.js` |
| 02 | `KI_PLANNER` – Config des Zugketten-Planers (außerhalb von KONFIG!) | `ki-planner.js` |
| 03 | Globaler Spielzustand (`Game`, Globals) | `state.js` |
| 04 | Hilfsfunktionen | `state.js` |
| 05 | Spielinitialisierung (Deck, Verteilen, Tracking) | `engine.js` |
| 06 | Spielregeln & Zug-Engine | `engine.js` |
| 07 | Rendering & View (`updateView`) | `view.js` |
| 08 | Overlay & Einstellungen | `view.js` |
| 09 | Spieler-Eingabe (Touch/Klick) | `view.js` |
| 10 | KI-Steuerung (Rundenablauf `aiTurn_*`) | `ai.js` |
| 11 | KI-Zugketten-Planer (Herzstück, Tiefensuche) | `ai.js` |
| 12 | KI-Bewertung & Scoring (getunte Heuristik) | `ai.js` |
| 13 | KI-Analyse & Gegner-Vorhersage | `ai.js` |
| 14 | Joker-Strategie, Hand-Ketten, Tiefenanalyse | `ai.js` |
| 15 | Spielende, Tracking & Tuner-Auswertung | `endgame.js` |
| 16 | Info-Fenster, Schnellmenü & Initialisierung | `endgame.js` |
| 17 | 🌐 Sprachmodul | `endgame.js` |

**Drei Stellen für Änderungen besonders beachten:**
- Modul 01 `KONFIG` – wird vom Tuner erzeugt, NUR dieser Block wird ersetzt.
- Modul 02 `KI_PLANNER` – darf beim Tuner-Tausch NICHT überschrieben werden.
- Modul 03 `Game` – gesamter veränderlicher Zustand an einem Ort.

**Heikle, bereits reparierte Stellen (nicht erneut kaputt machen!):**
- „Geister-KI": parallele `aiTurn`-Stränge → abgesichert durch `aiTurnActive`,
  `restarted`-Flag, awaited Rekursion.
- `clearAiPredictionMarkers` darf nur die CSS-Klasse entfernen, nicht das DIV.
- Tote `DEBUG_*`-Zweige wurden entfernt – nicht wieder einführen.

**Keine externen Assets:** Das Original hat KEINE Bilder/Schriften/Links.
Kartenfarben sind reine CSS-Verläufe, „SKIP-BO" auf der Rückseite ist
CSS `::before`. Eine korrekt geladene `style.css` stellt das volle Aussehen her.

---

## 4. Dateistruktur (Soll-Zustand)

```
Skipo/                  (Repo-Wurzel, GitHub Pages)
├── SkipBo_7_0_0.html   Hauptdatei: DOM-Gerüst + <link>/<script>-Tags
├── style.css           gesamtes CSS                          [ERLEDIGT]
├── konfig.js           Modul 01                              [offen]
├── ki-planner.js       Modul 02                              [offen]
├── state.js            Modul 03 + 04                         [offen]
├── engine.js           Modul 05 + 06                         [offen]
├── view.js             Modul 07 + 08 + 09                    [offen]
├── ai.js               Modul 10–14                           [offen]
├── endgame.js          Modul 15 + 16 + 17                    [offen]
├── Projekt.md          diese Datei
└── SkipBo_6_6_0.html   Referenz (unverändert aufbewahren)
```

**Script-Reihenfolge** (wenn JS ausgelagert wird) = Abhängigkeitsreihenfolge:
zuerst `konfig.js`, `ki-planner.js`, `state.js`, dann `engine.js`, `view.js`,
`ai.js`, `endgame.js`. Unkritisch, da fast alles in Funktionskörpern steckt; nur
die obersten `let KONFIG` / `const Game` müssen vor allem anderen geladen sein.

---

## 5. Fortschritt

1. [x] **CSS → `style.css`** — ERLEDIGT & live getestet 16.06.2026.
       `SkipBo_7_0_0.html` lädt CSS per `<link rel="stylesheet" href="style.css">`.
       JS-Block verifiziert Byte-identisch zu 6.6.0. Sichtbare Versionsangaben
       auf v7.0.0 gehoben (Titel + Schnellmenü).
2. [ ] **`konfig.js`** (Modul 01) — NÄCHSTER SCHRITT.
3. [ ] `ki-planner.js` (Modul 02)
4. [ ] `state.js` (Modul 03 + 04)
5. [ ] `engine.js` (Modul 05 + 06)
6. [ ] `view.js` (Modul 07 + 08 + 09)
7. [ ] `ai.js` (Modul 10–14)
8. [ ] `endgame.js` (Modul 15 + 16 + 17)

Pro JS-Schritt: Block aus HTML schneiden → eigene Datei → `<script src>` am
Dateiende (Reihenfolge s. o.) → live testen → Projekt.md abhaken.

---

## 6. Erkenntnisse / Stolperfallen (real aufgetreten)

- **GitHub-Upload am Handy:** Der Fehler „Etwas ist gewaltig schiefgelaufen, und
  wir können diese Datei nicht verarbeiten" ist ein bekannter GitHub-Glitch,
  KEIN Datei-Problem (trifft sogar 1-KB-Dateien). Lösung: vom **Laptop** hochladen
  oder im Web-Editor **„Add file → Create new file"** + Inhalt einfügen (umgeht
  den Upload). Half hier: Upload vom Laptop.
- **Seite erschien unstyled (Karten als nackter Text):** Ursache war, dass die
  CSS nicht geladen wurde (falscher Pfad/Upload-Mix). **Diagnose:** im Browser
  direkt `…/Skipo/style.css` öffnen — zeigt CSS-Text = Datei ok; 404 = Name/Ort
  falsch. **Pflicht:** Dateiname exakt `style.css` (Groß/klein!), flach neben der
  HTML, `<link>` ohne `css/`-Präfix. Nach Fix **hart neu laden** (Cache).
- **Cache:** Browser/GitHub Pages cachen hartnäckig. Nach Updates hart neu laden
  (Strg+F5 / Cmd+Shift+R); zur Not `style.css?v=7.0.1` als Versions-Query.

---

## 7. SPÄTERE ZIELE / Ideen (noch nicht begonnen)

- **Kartendesign mit Bildern:** Den CSS-Kartenstil (Farbverläufe + Zahlen) durch
  Bilder ersetzen, die dem **Aussehen des Original-Skip-Bo** nachempfunden sind.
  → Voraussetzung ist die ausgelagerte `style.css`; Bilder kämen ebenfalls flach
  in den `Skipo`-Ordner und würden per CSS/`<img>` referenziert.
- **„und einiges mehr"** – weitere Wünsche folgen, hier ergänzen sobald konkret.
