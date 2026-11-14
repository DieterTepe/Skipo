// ================================================================
//  core-settings.js  –  Skipo 7.0.3   Namensräume: Settings, Clock
//  PERSISTENTE EINSTELLUNGEN + PAUSENUHR
// ----------------------------------------------------------------
//  Braucht: Store, Events     Bietet: Settings.*, Clock.pause/after
//
//  Settings hält alles, was der Spieler einstellt und was den
//  Neustart überlebt: Name, Sprache, Tempo, Hintergrund und (7.0.3)
//  KI-Schwierigkeit + KI-Planung.
//  Änderungen laufen über Settings.set() → gespeichert + Ereignis
//  "settings:change", damit die Anzeige reagieren kann.
//
//  Clock.pause(mult) ist die einzige Wartefunktion des Spiels.
//  Wartezeit = Settings.speed × mult Sekunden (Tempo 0 = keine
//  Pausen, aber weiterhin asynchron, damit der Browser zeichnen
//  kann). Tests dürfen Clock.pause ersetzen.
// ================================================================

const Settings = {
  DEFAULTS: {
    name:    'Spieler',
    lang:    'de',
    speed:   4,                          // Sekunden je Pauseneinheit (0–20)
    bg:      { h: 130, s: 60, l: 19 },   // bisheriges Grün (#1B5E20)
    nameSet: false,                      // false → Einstellungen beim ersten Start zeigen
    level:    'hard',                    // KI-Schwierigkeit: 'easy' | 'medium' | 'hard'   (7.0.3)
    planning: 'super'                    // KI-Planung: 'super' (mit verdeckten eigenen Stockkarten) | 'normal'
  },

  LEVELS:    ['easy', 'medium', 'hard'],
  PLANNINGS: ['super', 'normal'],

  /** Vorgefertigte Hintergrund-Themen (Farbton/Sättigung/Helligkeit). */
  THEMES: [
    { name: 'Grün',      h: 130, s: 60, l: 19 },
    { name: 'Blau',      h: 215, s: 55, l: 18 },
    { name: 'Türkis',    h: 182, s: 48, l: 18 },
    { name: 'Anthrazit', h: 220, s: 12, l: 15 },
    { name: 'Bordeaux',  h: 349, s: 45, l: 16 },
    { name: 'Violett',   h: 265, s: 35, l: 18 },
  ],

  name:    'Spieler',
  lang:    'de',
  speed:   4,
  bg:      { h: 130, s: 60, l: 19 },
  nameSet: false,
  level:    'hard',
  planning: 'super',

  /** Beim Start: Altwerte übernehmen, dann alle Werte laden und prüfen. */
  load() {
    Store.migrate();
    const D = this.DEFAULTS;

    const name = Store.get('name', D.name);
    this.name = (typeof name === 'string' && name.trim()) ? name.trim() : D.name;

    const lang = Store.get('lang', D.lang);
    this.lang = (typeof lang === 'string') ? lang : D.lang;

    const speed = Store.get('speed', D.speed);
    this.speed = (Number.isInteger(speed) && speed >= 0 && speed <= 20) ? speed : D.speed;

    const bg = Store.get('bg', D.bg);
    this.bg = (bg && typeof bg.h === 'number' && typeof bg.s === 'number' && typeof bg.l === 'number')
      ? { h: bg.h, s: bg.s, l: bg.l }
      : { ...D.bg };

    this.nameSet = Store.get('nameSet', D.nameSet) === true;

    const level = Store.get('level', D.level);
    this.level = this.LEVELS.includes(level) ? level : D.level;

    const planning = Store.get('planning', D.planning);
    this.planning = this.PLANNINGS.includes(planning) ? planning : D.planning;
  },

  /** Wert setzen, speichern, Ereignis senden. */
  set(key, value) {
    if (!(key in this.DEFAULTS)) { console.warn('Settings: unbekannter Schlüssel', key); return; }
    this[key] = (key === 'bg') ? { ...value } : value;
    Store.set(key, this[key]);
    Events.emit('settings:change', { key, value: this[key] });
  }
};

const Clock = {
  /** Pause von Settings.speed × mult Sekunden (Promise). */
  pause(mult = 1) {
    const ms = Settings.speed * mult * 1000;
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /** Verzögerter Aufruf (für UI-Effekte). */
  after(ms, fn) {
    return setTimeout(fn, ms);
  }
};
