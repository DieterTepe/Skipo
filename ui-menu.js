// ================================================================
//  ui-menu.js  –  Skipo 7.0.5   Namensraum: Menu
//  ⚙️-SCHNELLMENÜ UND MENÜAKTIONEN
// ----------------------------------------------------------------
//  Braucht: Events, I18n, Tracking, Overlays     Bietet: Menu.init()
//
//  Die Menü-Buttons im HTML tragen data-action="…"; hier steht zu
//  jeder Aktion genau eine Funktion. Neuer Menüpunkt = ein Button
//  im HTML + ein Eintrag in Menu.actions + ein Text in I18n.
//
//  „Neues Spiel" lädt die Seite neu: einfachster und
//  sicherster Weg, alle laufenden Timer/KI-Züge zu beenden.
// ================================================================

const Menu = {
  el: null,
  btn: null,

  IMPRINT_URL: 'https://dietertepe.github.io/Skipo/impressum.html',
  PRIVACY_URL: 'https://dietertepe.github.io/Skipo/datenschutz.html',

  init() {
    this.el  = document.getElementById('quick-menu');
    this.btn = document.getElementById('menu-btn');
    if (!this.el || !this.btn) return;

    // Touch UND Click für maximale Mobile-Kompatibilität
    const toggle = e => { e.preventDefault(); e.stopPropagation(); this.toggle(); };
    this.btn.addEventListener('touchstart', toggle, { passive: false });
    this.btn.addEventListener('click', toggle);

    this.el.querySelectorAll('[data-action]').forEach(b => {
      b.addEventListener('click', e => {
        e.preventDefault();
        this.close();
        const fn = this.actions[b.dataset.action];
        if (fn) fn.call(this);
        else console.warn('Menu: unbekannte Aktion', b.dataset.action);
      });
    });

    // Schließen bei Tipp außerhalb
    const outside = e => {
      if (this.el.classList.contains('open') && !this.el.contains(e.target) && e.target !== this.btn) this.close();
    };
    document.addEventListener('click', outside);
    document.addEventListener('touchstart', outside, { passive: true });

    Events.on('lang:change', () => this.texts());
    this.texts();
  },

  toggle() { this.el.classList.toggle('open'); },
  close()  { this.el.classList.remove('open'); },

  /** Menütexte in der aktiven Sprache. */
  texts() {
    const map = { settings: 'qmSettings', design: 'qmDesign', rules: 'qmRules', lang: 'qmLang',
                  newgame: 'qmNewGame', 'stats-reset': 'qmStats', imprint: 'qmImprint',
                  privacy: 'qmPrivacy', close: 'qmClose' };
    this.el.querySelectorAll('[data-action]').forEach(b => {
      const key = map[b.dataset.action];
      if (key) b.textContent = I18n.t(key);
    });
  },

  actions: {
    settings()      { Overlays.showSettings(); },
    design()        { Overlays.showDesign(); },
    rules()         { Overlays.showSettings(); },          // Regeln stehen im Einstellungen-Fenster
    lang()          { Overlays.showLanguage(); },
    newgame()       { if (confirm(I18n.t('confirmNewGame'))) location.reload(); },
    'stats-reset'() { if (confirm(I18n.t('confirmStatsReset', Tracking.history.length))) Tracking.reset(); },
    imprint()       { window.open(Menu.IMPRINT_URL, '_blank'); },
    privacy()       { window.open(Menu.PRIVACY_URL, '_blank'); },
    close()         { /* bereits geschlossen */ }
  }
};
