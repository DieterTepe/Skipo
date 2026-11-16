// ================================================================
//  ai-analysis.js  –  Skipo 7.0.4   Namensraum: AI.Analysis
//  GEGNER-VORHERSAGE, BLOCKADE-LAGE, JOKER-STRATEGIE, HAND-KETTEN
// ----------------------------------------------------------------
//  Braucht: AI, KONFIG, State, Rules     Bietet: AI.Analysis.*
//
//    • Gegner-Vorhersage: häufigster noch nicht gesehener Kartenwert
//      (Blockade-Marker, Bonus in der Heuristik) und 3er-Serien in
//      der Ablage-Historie des Gegners.
//    • Blockade-Lage: sichtbare Stockkarte des Gegners + Brückenkarte.
//    • Nützlichkeit: liegt eine Karte auf dem Weg zur eigenen Stockkarte?
//    • Joker-Strategie: Joker im Stock / in der Hand – spielen oder
//      behalten. Begründungen als {key, args} für I18n.
//    • Hand-Ketten: aufsteigende Sequenzen in der Hand (Joker als Brücke).
// ================================================================

AI.Analysis = {

  // ----------------------------------------------------------------
  // GEGNER-VORHERSAGE
  // ----------------------------------------------------------------

  /** Wahrscheinlichster nächster Stockwert des Gegners. */
  predictEnemyStock(opponent) {
    try {
      const g = State.game;
      const remaining = { joker: 12 };
      for (let v = 1; v <= 12; v++) remaining[v] = 12;

      const consume = c => {
        if (!c) return;
        const key = c.type === 'joker' ? 'joker' : c.value;
        if (remaining[key] > 0) remaining[key]--;
      };

      g.buildPiles.forEach(p => p.forEach(consume));
      g.players.human.discards.forEach(p => p.forEach(consume));
      g.players.ai.discards.forEach(p => p.forEach(consume));
      g.players.ai.hand.forEach(consume);
      consume(g.players.ai.stock.slice(-1)[0]);
      consume(g.players[opponent].stock.slice(-1)[0]);

      const totalUnseen = Object.values(remaining).reduce((s, v) => s + v, 0);
      if (totalUnseen <= 0) return { nextExpected: null, confidence: 0 };

      let best = { value: null, prob: 0 };
      for (let v = 1; v <= 12; v++) {
        const prob = remaining[v] / totalUnseen;
        if (prob > best.prob) best = { value: v, prob };
      }
      return { nextExpected: best.value, confidence: best.prob };
    } catch {
      return { nextExpected: 1, confidence: 0.5 };
    }
  },

  /**
   * Blockade-Lage aus der SICHTBAREN Stockkarte des Gegners.
   * @returns {Object|null} { value: V, bridge: liegt V-1 oben auf einer Gegner-Ablage? }
   *          null = Gegner-Stock leer oder Joker oben (keine bestimmbare Bedrohung)
   */
  threat() {
    const human = State.player('human');
    const top   = human.stock[human.stock.length - 1];
    if (!top || top.type === 'joker') return null;
    const V      = top.value;
    const bridge = human.discards.some(d => d.length > 0 && d[d.length - 1].type !== 'joker' && d[d.length - 1].value === V - 1);
    return { value: V, bridge };
  },

  /**
   * Nützlichkeit einer Karte für den EIGENEN Stockabbau (Ablage-Entscheidung „Schwer").
   * @returns {Function} useful(v) → 0..1: v liegt auf dem Weg eines Baustapels zur eigenen
   *          Stockkarte; je kürzer der Weg, desto höher. 0 = nicht auf einem Weg.
   */
  usefulForStock() {
    const me    = State.player('ai');
    const needs = State.game.buildPiles.map(p => ((Rules.nextNeeded(p) - 1) % 12) + 1);
    const sTop  = me.stock[me.stock.length - 1];
    const S     = sTop && sTop.type !== 'joker' ? parseInt(sTop.value, 10) : null;
    return v => {
      if (S === null) return 0;
      let best = 0;
      for (const n of needs) {
        const L = (S - n + 12) % 12;                       // Karten, die auf diesem Stapel bis S fehlen
        if (L === 0) continue;
        if ((v - n + 12) % 12 < L) { const u = (13 - L) / 12; if (u > best) best = u; }
      }
      return best;
    };
  },

  /** 3er-Serien in der Ablage-Historie (Mittelwerte). */
  consecutiveDiscards(player) {
    const values = State.game.history[player].filter(v => v !== 'joker' && typeof v === 'number');
    const series = [];
    for (let i = 0; i < values.length - 2; i++) {
      if (values[i + 1] === values[i] + 1 && values[i + 2] === values[i] + 2) series.push(values[i] + 1);
    }
    return [...new Set(series)];
  },

  // ----------------------------------------------------------------
  // JOKER-STRATEGIE
  // ----------------------------------------------------------------

  /** Joker oben im Stock: spielen? Wohin? Begründung als {key, args}. */
  jokerStockTop(jokerCard) {
    try {
      const g  = State.game;
      const ai = g.players.ai;
      let bestPile     = -1;
      let bestFollowUp = -1;
      let bestReason   = null;

      for (let pileIdx = 0; pileIdx < g.buildPiles.length; pileIdx++) {
        if (!Rules.isValidBuild(jokerCard, pileIdx)) continue;

        const pile       = g.buildPiles[pileIdx];
        const jokerAsVal = pile.length === 0 ? 1
                         : (pile[pile.length - 1].type === 'joker' ? pile.length + 1 : pile[pile.length - 1].value + 1);

        const opponentCritical = AI.Eval.opponentCritical();
        const helpsOpponent    = opponentCritical.includes(jokerAsVal + 1);
        if (helpsOpponent && KONFIG.JOKER_STOCK_AGGRESSION < 0.9) continue;

        const followUpCount = this.jokerFollowUps(pileIdx, jokerAsVal);
        if (followUpCount < KONFIG.JOKER_NO_FOLLOWUP_THRESHOLD && KONFIG.JOKER_STOCK_AGGRESSION < 0.8) continue;

        const ourNextStock = ai.stock.length > 1 ? ai.stock[ai.stock.length - 2]?.value : null;
        const directStockBenefit = ourNextStock && (jokerAsVal === ourNextStock - 1 || jokerAsVal === ourNextStock);

        if (bestPile === -1 || (directStockBenefit && bestFollowUp < followUpCount) || followUpCount > bestFollowUp) {
          bestPile     = pileIdx;
          bestFollowUp = followUpCount;
          bestReason   = directStockBenefit
            ? { key: 'rsnStockAdv', args: [followUpCount] }
            : { key: 'rsnFollow',   args: [followUpCount] };
        }
      }

      if (bestPile === -1) {
        return { shouldPlay: false, targetPile: -1, reason: { key: 'rsnNoPile' }, followUpCount: 0 };
      }
      return { shouldPlay: true, targetPile: bestPile, reason: bestReason, followUpCount: bestFollowUp };
    } catch (e) {
      console.error('AI.Analysis.jokerStockTop Fehler:', e);
      return null;
    }
  },

  /** Joker in der Hand am Zugende: Ablage+Joker-Kombination, direkt spielen oder (null) nichts. */
  jokerHand(jokerIndex) {
    try {
      const g  = State.game;
      const ai = g.players.ai;
      const jokerCard = ai.hand[jokerIndex];
      if (!jokerCard || jokerCard.type !== 'joker') return null;

      // Option 1: Kombination mit der obersten Karte eines eigenen Ablagestapels
      const combo = this.jokerCombo();
      if (combo && combo.score >= KONFIG.JOKER_STOCK_COMBO_BONUS) {
        return { action: 'buildCombo', targetPile: combo.targetPile, discardIndex: combo.discardIndex };
      }

      // Option 2: direkt auf Baustapel
      let bestDirectPile   = -1;
      let bestDirectFollow = -1;
      for (let pileIdx = 0; pileIdx < g.buildPiles.length; pileIdx++) {
        if (!Rules.isValidBuild(jokerCard, pileIdx)) continue;
        const pile       = g.buildPiles[pileIdx];
        const jokerAsVal = pile.length === 0 ? 1
                         : (pile[pile.length - 1].type === 'joker' ? pile.length + 1 : pile[pile.length - 1].value + 1);
        const follows    = this.jokerFollowUps(pileIdx, jokerAsVal);
        const opCrit     = AI.Eval.opponentCritical();
        const helps      = opCrit.includes(jokerAsVal + 1);
        if (helps && KONFIG.JOKER_STOCK_AGGRESSION < 0.8) continue;
        if (follows > bestDirectFollow) {
          bestDirectFollow = follows;
          bestDirectPile   = pileIdx;
        }
      }
      if (bestDirectPile !== -1 && bestDirectFollow >= KONFIG.JOKER_NO_FOLLOWUP_THRESHOLD) {
        return { action: 'buildDirect', targetPile: bestDirectPile };
      }

      // Option 3: kein Jokerzug – der Joker bleibt, abgelegt wird eine Karte nach discard()
      return null;
    } catch (e) {
      console.error('AI.Analysis.jokerHand Fehler:', e);
      return null;
    }
  },

  /** Oberste Ablagekarte + Joker auf denselben Baustapel: beste Kombination oder null. */
  jokerCombo() {
    const g  = State.game;
    const ai = g.players.ai;
    let bestCombo = null;
    let bestScore = 0;

    ai.discards.forEach((pile, discardIdx) => {
      if (pile.length === 0) return;
      const discardTop = pile[pile.length - 1];

      g.buildPiles.forEach((buildPile, pileIdx) => {
        if (!Rules.isValidBuild(discardTop, pileIdx)) return;

        const simulatedPile = [...buildPile, discardTop];
        const jokerAsVal    = simulatedPile[simulatedPile.length - 1].type === 'joker'
                            ? simulatedPile.length + 1
                            : simulatedPile[simulatedPile.length - 1].value + 1;

        if (!Rules.isValidBuild({ type: 'joker', value: '★' }, pileIdx)) return;

        const followUpCount = this.jokerFollowUps(pileIdx, jokerAsVal);
        if (followUpCount < KONFIG.JOKER_COMBO_MIN_GAIN) return;

        const aiStockTop   = ai.stock.slice(-1)[0];
        const stockBenefit = aiStockTop && (jokerAsVal === aiStockTop.value - 1);
        const comboScore   = stockBenefit
          ? (KONFIG.JOKER_STOCK_COMBO_BONUS + (followUpCount * 1000)) * KONFIG.JOKER_COMBO_STOCK_MULTIPLIER
          : (followUpCount * 1500);

        if (comboScore > bestScore) {
          bestScore = comboScore;
          bestCombo = { score: comboScore, targetPile: pileIdx, discardIndex: discardIdx };
        }
      });
    });

    return bestCombo;
  },

  /** Folgezüge zählen, die nach einem Joker mit Wert jokerValue sofort möglich wären. */
  jokerFollowUps(buildPileIndex, jokerValue) {
    const ai = State.player('ai');
    let count = 0;
    const neededNext = jokerValue + 1;

    ai.hand.forEach(card => {
      if (card.type === 'joker') { count += 0.5; return; }
      if (card.value === neededNext) count++;
    });

    const stockTop = ai.stock.slice(-1)[0];
    if (stockTop && stockTop.value === neededNext) count += 2;

    ai.discards.forEach(pile => {
      if (pile.length === 0) return;
      if (pile[pile.length - 1].value === neededNext) count++;
    });

    return count;
  },

  // ----------------------------------------------------------------
  // HAND-KETTEN
  // ----------------------------------------------------------------

  /** Startet die Handkarte eine aufsteigende Kette? → Bonus */
  handCombo(player, handCardIndex) {
    const me        = State.player(player);
    const hand      = me.hand;
    const startCard = hand[handCardIndex];
    if (startCard.type === 'joker') return 0;

    const startValue   = parseInt(startCard.value);
    let   currentValue = startValue;
    let   comboLength  = 1;
    let   jokerBridges = 0;
    let   tempHand     = [...hand];
    tempHand.splice(handCardIndex, 1);

    while (currentValue < 12) {
      const nextVal     = currentValue + 1;
      const nextCardIdx = tempHand.findIndex(c => c.type !== 'joker' && parseInt(c.value) === nextVal);
      if (nextCardIdx !== -1) {
        comboLength++;
        currentValue = nextVal;
        tempHand.splice(nextCardIdx, 1);
      } else {
        const jokerIdx = tempHand.findIndex(c => c.type === 'joker');
        if (jokerIdx !== -1) {
          comboLength++;
          jokerBridges++;
          currentValue = nextVal;
          tempHand.splice(jokerIdx, 1);
        } else {
          break;
        }
      }
    }

    if (comboLength < KONFIG.HAND_COMBO_MIN_LENGTH) return 0;

    let bonus = comboLength * KONFIG.HAND_COMBO_BONUS_PER_CARD;
    if (jokerBridges > 0) bonus += jokerBridges * KONFIG.HAND_COMBO_JOKER_BRIDGE_BONUS;

    const stockTop = me.stock.slice(-1)[0];
    if (stockTop && (currentValue + 1 === stockTop.value)) {
      bonus = Math.round(bonus * KONFIG.HAND_COMBO_STOCK_CONNECT_MULTIPLIER);
    }
    return bonus;
  },

  /** Combo-Scores aller Handkarten einmal vorab berechnen. */
  handComboCache(player) {
    const hand  = State.player(player).hand;
    const cache = new Array(hand.length).fill(0);
    hand.forEach((card, i) => { cache[i] = this.handCombo(player, i); });
    return cache;
  }
};
