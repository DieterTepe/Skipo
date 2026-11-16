// ================================================================
//  app.js  –  Skipo 7.0.4   Namensraum: App
//  START: Einstellungen laden, Module verdrahten, Spiel beginnen
// ----------------------------------------------------------------
//  Braucht: alles     Bietet: App.init()
//
//  Reihenfolge ist wichtig:
//    1. Settings.load()  – Name, Sprache, Tempo, Hintergrund, KI-Stärke
//    2. I18n.init()      – aktive Sprache
//    3. Tracking.init()  – VOR den UI-Hörern (liest beim Spielende
//                          die Statistik, bevor der Endscreen sie zeigt)
//    4. Render / Input / Menu / Overlays
//    5. Flow.startGame()
// ================================================================

const App = {
  VERSION: '7.0.5',

  init() {
    Settings.load();
    I18n.init();
    Tracking.init();

    Render.init();
    Input.init();
    Menu.init();
    Overlays.init();

    Render.background();
    Render.message(I18n.t('shuffling'));
    const v = document.getElementById('app-version');
    if (v) v.textContent = `Skipo v${this.VERSION}`;

    Flow.startGame();

    // Einstellungen nur beim allerersten Start zeigen (nicht bei jedem Neustart)
    if (!Settings.nameSet) Overlays.showSettings();
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
