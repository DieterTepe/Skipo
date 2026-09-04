// ================================================================
//  core-events.js  –  Skipo 7.0.1   Namensraum: Events
//  MINI-EREIGNISBUS
// ----------------------------------------------------------------
//  Braucht: nichts        Bietet: Events.on / off / emit
//
//  Regel 2 der Architektur: Nach oben wird nur per Ereignis
//  gesprochen. core/ai/flow senden, ui hört zu. Sender wissen
//  nicht, wer zuhört – dadurch lassen sich KI und Anzeige einzeln
//  umbauen. Hörer werden in Registrierungs-Reihenfolge und
//  synchron aufgerufen; ein Fehler in einem Hörer stoppt die
//  anderen nicht.
//
//  Ereignisse (Name → Daten → Sender):
//    game:start       –                          Flow
//    game:over        {winner, loser, points}    Flow
//    turn:change      {player}                   Flow
//    move:build       {player, source, index, card, pile}   Rules
//    move:discard     {player, source, index, card, pile}   Rules
//    move:draw        {player, count}            Rules
//    pile:cleared     {pile, count}              Rules
//    msg              {key, args}                alle (über I18n.say)
//    ai:predict       {piles, value, confidence} | null      AI
//    ai:note          {type, ...}                AI (für Tracking)
//    settings:change  {key, value}               Settings
//    lang:change      lang                       I18n
//    render           –                          Render (nach Vollrender)
// ================================================================

const Events = (function () {
  const listeners = new Map();

  return {
    /** Hörer registrieren. Gibt fn zurück (für späteres off). */
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
      return fn;
    },

    /** Hörer entfernen. */
    off(name, fn) {
      const list = listeners.get(name);
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },

    /** Ereignis senden – synchron, in Registrierungs-Reihenfolge. */
    emit(name, data) {
      const list = listeners.get(name);
      if (!list || list.length === 0) return;
      for (const fn of list.slice()) {
        try { fn(data); }
        catch (e) { console.error(`Events: Fehler im Hörer für "${name}"`, e); }
      }
    },

    /** Alle Hörer entfernen (nur für Tests). */
    clear() { listeners.clear(); }
  };
})();
