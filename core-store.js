// ================================================================
//  core-store.js  –  Skipo 7.0.5   Namensraum: Store
//  EIN ZUGANG ZU localStorage
// ----------------------------------------------------------------
//  Braucht: nichts        Bietet: Store.get / set / remove / cleanup
//
//  Regel 5 der Architektur: Nirgendwo sonst wird localStorage
//  angefasst. Alle Werte liegen als JSON unter dem Präfix
//  "skipo.v1.". Ohne localStorage (Node-Tests, Privatmodus)
//  arbeitet der Store still im Speicher weiter.
//
//  Schlüssel:  name · lang · speed · bg · nameSet · level · planning · stats
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
     * Überholte Schlüssel früherer Versionen löschen (beim Start). Es wird nichts
     * mehr übernommen – nur aufgeräumt, damit keine Altdaten im Browser liegen bleiben.
     */
    cleanup() {
      const b = backend();
      if (!b) return;
      const obsolete = [PREFIX + 'tuner', 'skipbo-lang', 'skipbo-speed', 'skipbo-bg', 'skipbo-name-set',
                        'skipbo_tuner_tracking', 'skipbo_observations'];
      for (const key of obsolete) {
        try { b.removeItem(key); } catch (e) { /* ignorieren */ }
      }
    }
  };
})();
