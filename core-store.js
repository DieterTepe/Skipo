// ================================================================
//  core-store.js  –  Skipo 7.0.1   Namensraum: Store
//  EIN ZUGANG ZU localStorage
// ----------------------------------------------------------------
//  Braucht: nichts        Bietet: Store.get / set / remove / migrate
//
//  Regel 5 der Architektur: Nirgendwo sonst wird localStorage
//  angefasst. Alle Werte liegen als JSON unter dem Präfix
//  "skipo.v1.". Ohne localStorage (Node-Tests, Privatmodus)
//  arbeitet der Store still im Speicher weiter.
//
//  Schlüssel:  name · lang · speed · bg · nameSet · tuner
// ================================================================

const Store = (function () {
  const PREFIX = 'skipo.v1.';
  const memory = new Map();          // Fallback ohne localStorage

  function backend() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
    } catch (e) { /* Zugriff verweigert (z. B. Privatmodus) */ }
    return null;
  }

  return {
    /** Wert lesen; fehlt er oder ist er defekt → fallback. */
    get(key, fallback = null) {
      try {
        const b   = backend();
        const raw = b ? b.getItem(PREFIX + key) : memory.get(PREFIX + key);
        if (raw === null || raw === undefined) return fallback;
        return JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },

    /** Wert schreiben (JSON). Liefert true bei Erfolg. */
    set(key, value) {
      try {
        const raw = JSON.stringify(value);
        const b   = backend();
        if (b) b.setItem(PREFIX + key, raw);
        else   memory.set(PREFIX + key, raw);
        return true;
      } catch (e) {
        console.warn('Store: Speichern fehlgeschlagen –', key, e);
        return false;
      }
    },

    /** Wert löschen. */
    remove(key) {
      try {
        const b = backend();
        if (b) b.removeItem(PREFIX + key);
        else   memory.delete(PREFIX + key);
      } catch (e) { /* ignorieren */ }
    },

    /**
     * Einmalige Übernahme der alten 7.0.0-Schlüssel (skipbo-*).
     * Nur wenn der neue Schlüssel noch fehlt; alte werden danach gelöscht.
     */
    migrate() {
      const b = backend();
      if (!b) return;
      const alt = [
        ['skipbo-lang',           'lang',    v => v],
        ['skipbo-speed',          'speed',   v => parseInt(v, 10)],
        ['skipbo-bg',             'bg',      v => JSON.parse(v)],
        ['skipbo-name-set',       'nameSet', v => v === '1'],
        ['skipbo_tuner_tracking', 'tuner',   v => JSON.parse(v)],
      ];
      for (const [oldKey, newKey, conv] of alt) {
        try {
          const raw = b.getItem(oldKey);
          if (raw !== null) {
            if (b.getItem(PREFIX + newKey) === null) {
              const val = conv(raw);
              if (val !== undefined && val !== null && !(typeof val === 'number' && isNaN(val))) {
                this.set(newKey, val);
              }
            }
            b.removeItem(oldKey);
          }
        } catch (e) { /* defekter Altwert – überspringen */ }
      }
      try { b.removeItem('skipbo_observations'); } catch (e) { /* ignorieren */ }
    }
  };
})();
