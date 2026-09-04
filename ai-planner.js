// ================================================================
//  ai-planner.js  –  Skipo 7.0.1   Namensraum: AI.Planner
//  ZUGKETTEN-PLANER (Tiefensuche mit Besucht-Speicher)
// ----------------------------------------------------------------
//  Braucht: AI, KONFIG, KI_PLANNER, State, Rules, Clock
//  Bietet:  AI.Planner.runChains()  (+ Suchbausteine)
//
//  Findet GARANTIERTE Zugketten, bevor die Score-Heuristik einzelne
//  Züge bewertet:
//    1. STOCK-KETTE: Bauzüge, die mindestens eine Stockkarte spielen
//       (maximiert Stockabbau, spart Joker, schneidet nach dem
//       letzten Stock-Zug ab – der Rest bleibt der Heuristik).
//    2. HAND-CLEAR-KETTE: alle Handkarten auf Baustapel → sofort
//       5 neue ziehen (Skip-Bo-Regel).
//  Konfiguration: KI_PLANNER (ki-planner.js).
//
//  Suchzustand (leichtgewichtig): Joker = 0, Baustapel = effektiver
//  Top-Wert 0–12 (12 wird zu 0: voller Stapel gilt als geleert).
// ================================================================

AI.Planner = {

  /** Suchzustand aus dem Spiel erzeugen. */
  snapshot() {
    const g  = State.game;
    const ai = g.players.ai;
    const builds = g.buildPiles.map(pile => {
      if (pile.length === 0) return 0;
      const top = pile[pile.length - 1];
      const v   = top.type === 'joker' ? Rules.jokerValue(pile, pile.length - 1) : top.value;
      return v === 12 ? 0 : v;
    });
    const hand      = ai.hand.map(c => c.type === 'joker' ? 0 : c.value);
    const discs     = ai.discards.map(pile => pile.map(c => c.type === 'joker' ? 0 : c.value));
    const stockVals = ai.stock.map(c => c.type === 'joker' ? 0 : c.value);
    return { builds, hand, discs, stockLen: stockVals.length, stockVals };
  },

  /** Schlüssel für den Besucht-Speicher. */
  hash(st) {
    return st.builds.join(',') + '|' +
           st.hand.slice().sort((a, b) => a - b).join(',') + '|' +
           st.discs.map(d => d.length).join(',') + '|' +
           st.stockLen;
  },

  /** Alle legalen Bauzüge im Suchzustand (Reihenfolge = Such-Priorität). */
  moves(st) {
    const moves  = [];
    const needed = st.builds.map(b => b + 1);

    // 1. Stockkarte
    if (st.stockLen > 0) {
      const top = st.stockVals[st.stockLen - 1];
      for (let p = 0; p < 4; p++) {
        if (top === needed[p]) {
          moves.push({ src: 'stock', val: top, pile: p, isJoker: false, fromStock: true });
        } else if (top === 0) {
          moves.push({ src: 'stock', val: needed[p], pile: p, isJoker: true, fromStock: true });
        }
      }
    }
    // 2. Ablage-Zahlenkarten
    for (let d = 0; d < 4; d++) {
      const pile = st.discs[d];
      if (pile.length === 0) continue;
      const top = pile[pile.length - 1];
      if (top === 0) continue;
      for (let p = 0; p < 4; p++) {
        if (top === needed[p]) {
          moves.push({ src: 'discard', val: top, pile: p, isJoker: false, fromStock: false, discIdx: d });
        }
      }
    }
    // 3. Hand-Zahlenkarten (jeden Wert nur einmal)
    const seen = new Set();
    for (let h = 0; h < st.hand.length; h++) {
      const v = st.hand[h];
      if (v === 0 || seen.has(v)) continue;
      seen.add(v);
      for (let p = 0; p < 4; p++) {
        if (v === needed[p]) {
          moves.push({ src: 'hand', val: v, pile: p, isJoker: false, fromStock: false });
        }
      }
    }
    // 4. Hand-Joker
    if (st.hand.includes(0)) {
      for (let p = 0; p < 4; p++) {
        moves.push({ src: 'hand', val: needed[p], pile: p, isJoker: true, fromStock: false });
      }
    }
    // 5. Ablage-Joker
    for (let d = 0; d < 4; d++) {
      const pile = st.discs[d];
      if (pile.length === 0) continue;
      if (pile[pile.length - 1] !== 0) continue;
      for (let p = 0; p < 4; p++) {
        moves.push({ src: 'discard', val: needed[p], pile: p, isJoker: true, fromStock: false, discIdx: d });
      }
    }
    return moves;
  },

  /** Zug auf Suchzustand anwenden → NEUER Zustand. */
  apply(st, mv) {
    const next = {
      builds:    st.builds.slice(),
      hand:      st.hand.slice(),
      discs:     st.discs,
      stockLen:  st.stockLen,
      stockVals: st.stockVals
    };
    next.builds[mv.pile] = next.builds[mv.pile] + 1;
    if (next.builds[mv.pile] === 12) next.builds[mv.pile] = 0;

    if (mv.src === 'stock') {
      next.stockLen -= 1;
    } else if (mv.src === 'hand') {
      const idx = mv.isJoker ? next.hand.indexOf(0) : next.hand.indexOf(mv.val);
      next.hand.splice(idx, 1);
    } else {
      next.discs = st.discs.slice();
      next.discs[mv.discIdx] = next.discs[mv.discIdx].slice(0, -1);
    }
    return next;
  },

  /**
   * Tiefensuche nach der besten Kette.
   * @param {string} goal – 'stock' oder 'clear'
   * @returns {Object|null} { moves, stockPlays, jokers }
   */
  search(goal) {
    const start = this.snapshot();
    if (goal === 'clear' && (start.hand.length === 0 || State.game.drawPile.length === 0)) return null;

    const visited = new Map();
    let nodes = 0;
    let best  = null;

    function better(cand) {
      if (!best) return true;
      if (cand.stockPlays !== best.stockPlays) return cand.stockPlays > best.stockPlays;
      if (cand.jokers     !== best.jokers)     return cand.jokers     < best.jokers;
      return cand.moves.length < best.moves.length;
    }

    const self = this;
    function dfs(st, path, jokers, stockPlays, lastStockAt) {
      if (nodes++ > KI_PLANNER.MAX_NODES) return;
      if (path.length >= KI_PLANNER.MAX_DEPTH) return;

      const key  = self.hash(st);
      const prev = visited.get(key);
      if (prev !== undefined && prev <= jokers) return;
      visited.set(key, jokers);

      for (const mv of self.moves(st)) {
        if (mv.isJoker && jokers >= KI_PLANNER.MAX_JOKERS_PER_CHAIN) continue;

        const nJokers = jokers + (mv.isJoker ? 1 : 0);
        const nStock  = stockPlays + (mv.fromStock ? 1 : 0);
        const nPath   = path.concat([mv]);
        const nLastSt = mv.fromStock ? nPath.length : lastStockAt;
        const next    = self.apply(st, mv);

        if (goal === 'stock') {
          if (nStock > 0) {
            const cut    = nPath.slice(0, nLastSt);
            const cutJok = cut.reduce((s, m) => s + (m.isJoker ? 1 : 0), 0);
            const cand   = { moves: cut, stockPlays: nStock, jokers: cutJok };
            if (better(cand)) best = cand;
          }
        } else {
          if (next.hand.length === 0) {
            const cand = { moves: nPath, stockPlays: nStock, jokers: nJokers };
            if (better(cand)) best = cand;
          }
        }

        dfs(next, nPath, nJokers, nStock, nLastSt);
        if (nodes > KI_PLANNER.MAX_NODES) return;
      }
    }

    dfs(start, [], 0, 0, 0);
    return best;
  },

  /** Hand-Clear-Kette ohne Stockabbau verwerfen, wenn sie dem Gegner die Tür öffnet. */
  riskCheck(chain) {
    if (!KI_PLANNER.RISK_CHECK) return true;
    if (chain.stockPlays > 0)   return true;

    const humanStock = State.player('human').stock;
    if (humanStock.length > KI_PLANNER.RISK_OPP_STOCK_LIMIT) return true;
    const hTopCard = humanStock[humanStock.length - 1];
    if (!hTopCard) return true;
    const hTop = hTopCard.type === 'joker' ? null : hTopCard.value;
    if (hTop === null) return true;

    let st = this.snapshot();
    const startsOpen = st.builds.some(b => b + 1 === hTop);
    for (const mv of chain.moves) st = this.apply(st, mv);
    const endsOpen = st.builds.some(b => b + 1 === hTop);

    return !(endsOpen && !startsOpen);
  },

  /** Ketten planen und spielen, bis keine mehr existiert. @returns Anzahl Einzelzüge */
  async runChains() {
    if (!KI_PLANNER.ENABLED) return 0;
    let played = 0;
    let safety = 0;

    while (!AI.over() && safety < 12) {
      safety++;

      // Ziel 1: Stockabbau-Kette
      let chain = this.search('stock');
      if (chain && chain.moves.length > 0) {
        AI.say('aiChainStock', chain.moves.length, chain.stockPlays);
        await Clock.pause(0.8);
        if (AI.over()) return played;
        const n = await this.executeChain(chain);
        played += n;
        if (AI.over()) return played;
        if (n === 0) break;
        await AI.redrawIfHandEmpty();
        continue;
      }

      // Ziel 2: Hand komplett leeren
      if (KI_PLANNER.HAND_CLEAR_ENABLED) {
        chain = this.search('clear');
        if (chain && chain.moves.length > 0 && this.riskCheck(chain)) {
          AI.say('aiChainClear', chain.moves.length);
          await Clock.pause(0.8);
          if (AI.over()) return played;
          const n = await this.executeChain(chain);
          played += n;
          if (AI.over()) return played;
          if (n === 0) break;
          await AI.redrawIfHandEmpty();
          continue;
        }
      }

      break;
    }
    return played;
  },

  /** Geplante Kette im echten Spiel ausführen (Hand-Indizes zur Laufzeit per Wert). */
  async executeChain(chain) {
    let done = 0;
    const total = chain.moves.length;
    const ai = State.player('ai');

    for (const mv of chain.moves) {
      if (AI.over()) return done;

      let srcType, srcIdx, card;
      if (mv.src === 'stock') {
        srcType = 'stock'; srcIdx = 0;
        card = ai.stock.slice(-1)[0];
      } else if (mv.src === 'hand') {
        srcType = 'hand';
        srcIdx = mv.isJoker
          ? ai.hand.findIndex(c => c.type === 'joker')
          : ai.hand.findIndex(c => c.type !== 'joker' && c.value === mv.val);
        card = ai.hand[srcIdx];
      } else {
        srcType = 'discard'; srcIdx = mv.discIdx;
        const pile = ai.discards[mv.discIdx];
        card = pile[pile.length - 1];
      }
      if (!card || srcIdx === -1) { console.warn('Planner: Karte nicht gefunden', mv); return done; }

      const srcLabel  = srcType === 'stock' ? I18n.t('srcStock')
                      : srcType === 'hand'  ? I18n.t('srcHand')
                      : I18n.t('srcDiscardN', srcIdx + 1);
      const cardLabel = card.type === 'joker' ? I18n.t('jokerAs', mv.val) : `${card.value}`;
      AI.say('aiChainMove', done + 1, total, cardLabel, srcLabel, mv.pile + 1);
      await Clock.pause(KI_PLANNER.CHAIN_MOVE_PAUSE);
      if (AI.over()) return done;

      if (!Rules.playToBuild('ai', srcType, srcIdx, mv.pile)) {
        console.warn('Planner: Zug abgelehnt', mv);
        return done;
      }
      AI.note('kiMove', {
        sourceType:     srcType,
        cardValue:      card.type === 'joker' ? '★' : card.value,
        cardType:       card.type,
        buildPileIndex: mv.pile,
        score:          mv.fromStock ? KONFIG.SCORE_24 : KONFIG.SCORE_5
      });
      done++;
      if (AI.over()) return done;
    }
    return done;
  }
};
