# Projekt Skip-Bo Mobile – Projektstand & Ziele

> **Zweck dieser Datei:** Übergabe-Dokument. Wer einen neuen Chat startet, liest
> zuerst diese Datei und weiß sofort, was der Stand, die Entscheidungen und die
> nächsten Schritte sind. Bitte bei jeder größeren Änderung aktualisieren.

Letzte Aktualisierung: 16.06.2026 (Schritt 1 erledigt: CSS ausgelagert)

---

## 1. Was ist das Projekt?

Eine vollständige **Skip-Bo-Implementierung** (Mensch gegen KI) als Browser-Spiel,
mobil-optimiert (9:16, Touch), viersprachig (DE / EN / PT / UK).

- **Referenz-Version:** 6.6.0 (`SkipBo_6_6_0.html`, ~6175 Zeilen, ~250 KB,
  alles in einer Datei). Gilt als **optimal in Ablauf und Funktion** und bleibt
  als stabile Referenz unangetastet erhalten.
- **In Arbeit:** Version **7.0.0** = Struktur-Umbau. Neue Hauptdatei heißt
  **`SkipBo_7_0_0.html`** (Unterstriche). Verhalten/Aussehen 1:1 wie 6.6.0.
- **Läuft live auf GitHub Pages:**
  https://dietertepe.github.io/Skipo/SkipBo_6_6_0.html
  (7.0.0 später unter `.../SkipBo_7_0_0.html`)
- **Grundregel:** Bei Umbauten Verhalten/Aussehen/Regeln 1:1 erhalten.

---

## 2. Aktueller Aufbau (17 Module in einer Datei)

Der Code ist bereits sauber in 17 kommentargetrennte Module gegliedert. Wichtig:
**Engine-Funktionen fassen nie das DOM an, Rendering liest nur** – deshalb nutzen
KI und Mensch dieselben Engine-Funktionen.

| Modul | Inhalt |
|-------|--------|
| 01 | `KONFIG` – Tuner-Schnittstelle, alle `SCORE_*`-Werte (1:1 austauschbar) |
| 02 | `KI_PLANNER` – Config des Zugketten-Planers (liegt BEWUSST außerhalb von KONFIG) |
| 03 | Globaler Spielzustand (`Game`, Globals) |
| 04 | Hilfsfunktionen |
| 05 | Spielinitialisierung (Deck, Verteilen, Tracking) |
| 06 | Spielregeln & Zug-Engine (`isValidBuildMove`, Drops) |
| 07 | Rendering & View (`updateView`) |
| 08 | Overlay & Einstellungen |
| 09 | Spieler-Eingabe (Touch/Klick) |
| 10 | KI-Steuerung (Rundenablauf `aiTurn_*`) |
| 11 | **KI-Zugketten-Planer** (Herzstück, Tiefensuche) |
| 12 | KI-Bewertung & Scoring (getunte Heuristik) |
| 13 | KI-Analyse & Gegner-Vorhersage |
| 14 | Joker-Strategie, Hand-Ketten, Tiefenanalyse |
| 15 | Spielende, Tracking & Tuner-Auswertung |
| 16 | Info-Fenster, Schnellmenü & Initialisierung |
| 17 | 🌐 Sprachmodul |

**Drei zentrale Stellen für Änderungen:**
- Modul 01 `KONFIG` – wird vom Tuner erzeugt, nur dieser Block wird ersetzt.
- Modul 02 `KI_PLANNER` – darf beim Tuner-Tausch NICHT überschrieben werden.
- Modul 03 `Game` – gesamter veränderlicher Zustand an einem Ort.

**Heikle, bereits reparierte Stellen (nicht erneut kaputt machen!):**
- „Geister-KI": parallele `aiTurn`-Stränge → abgesichert durch `aiTurnActive`-Wächter
  + `restarted`-Flag + awaited Rekursion.
- `clearAiPredictionMarkers` darf nur die CSS-Klasse entfernen, nicht das Baustapel-DIV.
- Tote `DEBUG_*`-Zweige wurden entfernt – nicht wieder einführen.

---

## 3. AKTUELLES ZIEL: Aufteilung in mehrere Dateien

**Warum:** Die Einzeldatei ist zum Editieren unhandlich. Auf dem Handy ließ sich
früher nichts nachladen; jetzt (GitHub Pages) ist das problemlos möglich.
**Wichtig:** Der Gewinn ist **Wartbarkeit/Erweiterbarkeit**, NICHT Ladezeit
(250 KB laden ohnehin sofort). Oberstes Prinzip: **gut erweiterbar bleiben.**

### Getroffene Grundsatz-Entscheidungen

1. **Klassische `<script src>`-Dateien** verwenden – KEINE ES-Module
   (`import`/`export`) und KEIN Bundler (Webpack o. ä.).
   Grund: Der Code teilt einen gemeinsamen globalen Namensraum (`Game`, `KONFIG`,
   freie Funktionen rufen sich gegenseitig). Klassische Scripts behalten genau
   dieses Verhalten – es muss fast nichts am Code geändert werden. Passt perfekt
   zu GitHub Pages („editieren → pushen", kein Build-Schritt).

2. **Alles beim Start laden, nichts „on demand".** Bei einem Spiel wird die ganze
   Logik sofort gebraucht; echtes Lazy-Loading bringt nichts und kostet nur
   Komplexität. Also: aufteilen ja, bedarfsweises Nachladen nein.

3. **`SkipBo_7_0_0.html` wird zum schlanken „Inhaltsverzeichnis"** – nur
   DOM-Gerüst + Liste der CSS-/JS-Dateien.

### Vorgeschlagene Dateistruktur (acht gruppierte JS-Dateien)

**WICHTIG: ALLES flach im Ordner `Skipo`, KEINE Unterordner** (Wunsch des Nutzers).
Alle Pfade in `<link>`/`<script>` daher OHNE Verzeichnis (z. B. `href="style.css"`, `src="konfig.js"`).

```
SkipBo_7_0_0.html     → nur DOM-Gerüst + <link>/<script>-Tags  [Hauptdatei]
style.css         → der gesamte <style>-Block (431 Zeilen)  [ERLEDIGT]
konfig.js          → Modul 01 (Tuner-Ziel, 1:1 tauschbar)
ki-planner.js      → Modul 02
state.js           → Modul 03 + 04 (Globals, Game, Hilfsfunktionen)
engine.js          → Modul 05 + 06 (Init, Regeln)
view.js            → Modul 07 + 08 + 09 (Rendering, Overlay, Eingabe)
ai.js              → Modul 10–14 (komplette KI)
endgame.js         → Modul 15 + 16 + 17 (Tracking, Menü, Sprache, Init)
```

**Größter Einzelvorteil:** Liegt `KONFIG` in `konfig.js`, überschreibt der
Tuner künftig nur diese eine kleine Datei statt eines Blocks im Riesen-HTML.

### Wichtige Regeln beim Aufteilen

- **Reihenfolge der Script-Tags = Abhängigkeitsreihenfolge.** Zuerst
  `konfig`, `ki-planner`, `state`; zuletzt die Init. (Unkritisch, da fast alles
  in Funktionskörpern steckt; nur `let KONFIG` / `const Game` müssen zuerst stehen.)
- **Beim Auslagern NICHTS inhaltlich ändern, nur verschieben** – so bleibt jeder
  Fehler sofort lokalisierbar.
- **Cache-Falle:** Browser cachen JS/CSS hartnäckig. Nach Updates ggf.
  `style.css?v=6.6.1` (Versions-Query) zum Cache-Brechen oder hart neu laden.

### Umsetzungsreihenfolge (Fortschritt)

1. [x] **CSS rausziehen (`style.css`)** – ERLEDIGT 16.06.2026.
       `SkipBo_7_0_0.html` lädt CSS jetzt per `<link>`. Inhalt 1:1, nur verschoben.
       Sichtbare Versions-Strings (Titel, Schnellmenü) auf v7.0.0 gehoben.
2. [ ] `konfig.js` auslagern (Modul 01) – NÄCHSTER SCHRITT.
3. [ ] `ki-planner.js` (Modul 02).
4. [ ] `state.js` (Modul 03 + 04).
5. [ ] `engine.js` (Modul 05 + 06).
6. [ ] `view.js` (Modul 07 + 08 + 09).
7. [ ] `ai.js` (Modul 10–14).
8. [ ] `endgame.js` (Modul 15 + 16 + 17).

Jeder JS-Schritt: Block aus der HTML schneiden → in eigene Datei → `<script src>`
am Dateiende in Abhängigkeitsreihenfolge eintragen → testen.

### ENTSCHIEDENE Fragen

- [x] **Acht gruppierte Dateien** (nicht ein Modul pro Datei). Beschlossen.
- [x] Hauptdatei heißt **`SkipBo_7_0_0.html`** (kein `index.html`; eigener Name
      ist auf GitHub Pages problemlos).

---

## 4. SPÄTERE ZIELE / Ideen (noch nicht begonnen)

- **Kartendesign mit Bildern:** Den aktuellen CSS-Kartenstil (Farbverläufe +
  Zahlen) durch Bilder ersetzen, die dem **Aussehen des Original-Skip-Bo**
  nachempfunden sind. → Hierfür ist die ausgelagerte `style.css` plus ein
  eigener `img/`-Ordner ideal; die Auslagerung (Ziel 3) ist die Voraussetzung.
- **„und einiges mehr"** – weitere Wünsche des Nutzers folgen, hier ergänzen,
  sobald konkret.

---

## 5. Arbeitsprinzipien für dieses Projekt

- Version 6.6.0 ist die stabile Referenz – Verhalten, Aussehen und Regeln bleiben
  beim Umbau **1:1 erhalten**, solange nicht ausdrücklich eine Änderung gewünscht ist.
- Immer auf **gute Erweiterbarkeit** achten (Wunsch des Nutzers).
- Änderungen klein und nachvollziehbar halten.
