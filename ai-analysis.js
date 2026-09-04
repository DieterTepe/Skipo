// ================================================================
//  ai-analysis.js  –  Skipo 7.0.1   Namensraum: AI.Analysis
//  GEGNER-VORHERSAGE, JOKER-STRATEGIE, HAND-KETTEN, ABLAGE-TIEFE
// ----------------------------------------------------------------
//  Braucht: AI, KONFIG, State, Rules     Bietet: AI.Analysis.*
//
//  Vier Analysen der getunten KI (1:1 aus 6.6.0):
//    • Gegner-Vorhersage: wahrscheinlichster nächster Gegner-Stockwert,
//      Serienerkennung in der Ablage-Historie, Blockade-Ziele.
//    • Joker-Strategie: Joker im Stock / in der Hand spielen, sparen
//      oder sicher ablegen. Begründungen als {key, args} für I18n.
//    • Hand-Ketten: aufsteigende Sequenzen in der Hand (Joker als Brücke).
//    • Ablage-Tiefenanalyse: N Ebenen tief in Ablagestapel schauen.
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
   * Bedrohungslage aus der SICHTBAREN Gegner-Stockkarte (7.0.2, KI_TAKTIK).
   * @returns {Object|null} { value V, open: [Baustapel, die V annehmen], bridge, oppStock }
   *          null = Gegner-Stock leer oder Joker oben (keine bestimmbare Bedrohung)
   */
  threat() {
    const human = State.player('human');
    const top   = human.stock[human.stock.length - 1];
    if (!top || top.type === 'joker') return null;
    const V    = top.value;
    const open = [];
    State.game.buildPiles.forEach((p, i) => { if (Rules.nextNeeded(p) === V) open.push(i); });
    const bridge = human.discards.some(d => d.length > 0 && d[d.length - 1].type !== 'joker' && d[d.length - 1].value === V - 1);
    const tops   = human.discards.filter(d => d.length > 0 && d[d.length - 1].type !== 'joker').map(d => d[d.length - 1].value);
    return { value: V, open, bridge, tops, oppStock: human.stock.length };
  },

  /** Gegner-Ziel: sichtbare Stockkarte (Taktik an) oder Wahrscheinlichkeitsschätzung. */
  enemyTarget(opponent) {
    const T = AI.taktik();
    if (T && T.VISIBLE_STOCK && opponent === 'human') {
      const th = this.threat();
      if (th) return { nextExpected: th.value, confidence: 1, visible: true };
    }
    return this.predictEnemyStock(opponent);
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

  /** Gegner-Ablagestapel auf Sequenzen analysieren → Blockade-Ziele. */
  discardPatterns() {
    const blockTargets = [];
    const depth        = KONFIG.OPPONENT_ANALYZE_DEPTH;
    const threshold    = KONFIG.OPPONENT_SERIES_THRESHOLD;
    const human        = State.player('human');
    const allVisible   = [];

    human.discards.forEach((pile, pileIdx) => {
      if (pile.length === 0) return;
      const effectiveDepth = Math.min(depth, pile.length);
      for (let i = 0; i < effectiveDepth; i++) {
        const card = pile[pile.length - 1 - i];
        if (card && card.type !== 'joker') {
          allVisible.push({ value: parseInt(card.value), pileIdx, tiefe: i, isStock: false });
        }
      }
    });

    const humanStock = human.stock;
    if (humanStock.length > 0) {
      const topCard = humanStock[humanStock.length - 1];
      if (topCard.type !== 'joker') {
        allVisible.push({ value: parseInt(topCard.value), pileIdx: -1, tiefe: 0, isStock: true });
      }
    }

    if (allVisible.length === 0) return blockTargets;

    const visibleValues = new Set(allVisible.map(c => c.value));

    for (let startVal = 1; startVal <= 11; startVal++) {
      let serienLaenge = 0;
      for (let v = startVal; v <= 12; v++) {
        if (visibleValues.has(v)) serienLaenge++;
        else break;
      }
      if (serienLaenge >= threshold) {
        const nextNeeded = startVal + serienLaenge;
        if (nextNeeded <= 12) {
          const confidence   = Math.min(0.95, 0.3 + (serienLaenge * 0.2));
          const stockInSerie = allVisible.some(c => c.isStock && c.value >= startVal && c.value < nextNeeded);
          const finalConf    = stockInSerie ? Math.min(0.99, confidence + 0.25) : confidence;
          blockTargets.push({
            value:      nextNeeded,
            confidence: finalConf,
            reason:     `Serie ${startVal}–${startVal + serienLaenge - 1} sichtbar (Länge ${serienLaenge})${stockInSerie ? ' + Stock' : ''}`
          });
          if (KONFIG.DEBUG_N1) {
            console.log(`📌N1 🔍 Gegner-Serie erkannt: ${startVal}→${startVal + serienLaenge - 1}, Blockade auf ${nextNeeded} (Conf: ${finalConf.toFixed(2)})`);
          }
        }
      }
    }

    if (humanStock.length > 0) {
      const stockTop = humanStock[humanStock.length - 1];
      if (stockTop.type !== 'joker') {
        const stockNext = parseInt(stockTop.value) + 1;
        const alreadyIn = blockTargets.some(t => t.value === stockNext);
        if (!alreadyIn && stockNext <= 12) {
          blockTargets.push({ value: stockNext, confidence: 0.99, reason: `Direkte Stock-Folgekarte (Stock-Top: ${stockTop.value})` });
        }
      }
    }

    blockTargets.sort((a, b) => b.confidence - a.confidence);
    return blockTargets;
  },

  /** Blockade-Score einer Karte gegen erkannte Ziele. */
  blockScore(card, blockTargets) {
    if (!blockTargets || blockTargets.length === 0) return 0;
    if (card.type === 'joker') return 0;

    const cardValue = parseInt(card.value);
    let blockScore  = 0;

    blockTargets.forEach(target => {
      if (target.value === cardValue) {
        const rawScore = KONFIG.OPPONENT_BLOCK_BONUS * target.confidence;
        blockScore    += rawScore * KONFIG.OPPONENT_BLOCK_WEIGHT;
        if (KONFIG.DEBUG_N2) {
          console.log(`📌N2 🛡️ Blockade: Karte ${cardValue} trifft Ziel ${target.value} (Conf: ${target.confidence.toFixed(2)}, Score: +${(rawScore * KONFIG.OPPONENT_BLOCK_WEIGHT).toFixed(0)})`);
          console.log(`📌N2 🛡️ Grund: ${target.reason}`);
        }
      }
    });

    return Math.round(blockScore);
  },

  // ----------------------------------------------------------------
  // JOKER-STRATEGIE
  // ----------------------------------------------------------------

  /** Joker oben im Stock: spielen? Wohin? Begründung als {key, args}. */
  async jokerStockTop(jokerCard) {
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
        const enemyProfit      = helpsOpponent ? KONFIG.JOKER_ENEMY_HELP_PENALTY : 0;

        if (enemyProfit >= KONFIG.JOKER_ENEMY_HELP_PENALTY && KONFIG.JOKER_STOCK_AGGRESSION < 0.9) continue;

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

  /** Joker in der Hand: Kombo / direkt / sicher ablegen. */
  async jokerHand(jokerIndex) {
    try {
      const g  = State.game;
      const ai = g.players.ai;
      const jokerCard = ai.hand[jokerIndex];
      if (!jokerCard || jokerCard.type !== 'joker') return null;

      // Option 1: Kombination mit Ablagekarten
      if (KONFIG.JOKER_COMBO_ENABLED) {
        const combo = this.jokerCombo(jokerCard, jokerIndex);
        if (combo && combo.score >= KONFIG.JOKER_STOCK_COMBO_BONUS) {
          return { action: 'buildCombo', targetPile: combo.targetPile, discardIndex: combo.discardIndex,
                   reason: { key: 'rsnCombo', args: [combo.score] } };
        }
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
        return { action: 'buildDirect', targetPile: bestDirectPile, discardIndex: -1,
                 reason: { key: 'rsnFollow', args: [bestDirectFollow] } };
      }

      // Option 3: sicher ablegen
      return { action: 'discard', targetPile: -1, discardIndex: this.jokerBestDiscard(),
               reason: { key: 'rsnSafe' } };
    } catch (e) {
      console.error('AI.Analysis.jokerHand Fehler:', e);
      return null;
    }
  },

  /** Ablagestapel mit Joker oben schützen? */
  jokerProtectDiscard(discardPileIndex) {
    if (!KONFIG.JOKER_PROTECT_DISCARD) return { protect: false, penalty: 0 };
    const pile = State.player('ai').discards[discardPileIndex];
    if (!pile || pile.length === 0) return { protect: false, penalty: 0 };
    const topCard = pile[pile.length - 1];
    if (!topCard || topCard.type !== 'joker') return { protect: false, penalty: 0 };
    return { protect: true, penalty: KONFIG.JOKER_PROTECT_DISCARD_PENALTY };
  },

  /** Ablagekarte + Joker → Stockabbau-Kombination bewerten. */
  jokerCombo(jokerCard, jokerHandIndex) {
    const g  = State.game;
    const ai = g.players.ai;
    let bestCombo = null;
    let bestScore = 0;

    ai.discards.forEach((pile, discardIdx) => {
      if (pile.length === 0) return;
      const reachable = this.discardLookAhead('ai', discardIdx, KONFIG.DISCARD_LOOKAHEAD_DEPTH);

      reachable.forEach((discardTop, ebene) => {
        g.buildPiles.forEach((buildPile, pileIdx) => {
          if (!Rules.isValidBuild(discardTop, pileIdx)) return;

          const simulatedPile = [...buildPile, discardTop];
          const jokerAsVal    = simulatedPile.length === 0 ? 1
                              : (simulatedPile[simulatedPile.length - 1].type === 'joker'
                                 ? simulatedPile.length + 1
                                 : simulatedPile[simulatedPile.length - 1].value + 1);

          if (!Rules.isValidBuild({ type: 'joker', value: '★' }, pileIdx)) return;

          const followUpCount = this.jokerFollowUps(pileIdx, jokerAsVal);
          if (followUpCount < KONFIG.JOKER_COMBO_MIN_GAIN) return;

          const aiStockTop   = ai.stock.slice(-1)[0];
          const stockBenefit = aiStockTop && (jokerAsVal === aiStockTop.value - 1);
          const tiefenBonus  = ebene * KONFIG.DISCARD_COMBO_DEPTH_BONUS;
          const comboScore   = stockBenefit
            ? (KONFIG.JOKER_STOCK_COMBO_BONUS + (followUpCount * 1000) + tiefenBonus) * KONFIG.DISCARD_DEPTH_STOCK_MULTIPLIER
            : (followUpCount * 1500) + tiefenBonus;

          if (comboScore > bestScore) {
            bestScore = comboScore;
            bestCombo = { score: comboScore, targetPile: pileIdx, discardIndex: discardIdx, followUpMoves: followUpCount, ebene };
          }
        });
      });
    });

    return bestCombo;
  },

  /** Bester Ablagestapel für sicheres Joker-Ablegen. */
  jokerBestDiscard() {
    const opponentCritical = AI.Eval.opponentCritical();
    let bestIdx   = 3;
    let bestScore = -Infinity;

    State.player('ai').discards.forEach((pile, idx) => {
      let score = 100;
      if (pile.length === 0) {
        score += 500;
      } else {
        const topCard = pile[pile.length - 1];
        score += (12 - (topCard.value || 6)) * 20;
        if (opponentCritical.includes(topCard.value + 1)) score -= 300;
      }
      if (pile.length > 0 && pile[pile.length - 1].type === 'joker') score -= 200;
      if (score > bestScore) { bestScore = score; bestIdx = idx; }
    });

    return bestIdx;
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
  },

  // ----------------------------------------------------------------
  // ABLAGE-TIEFENANALYSE
  // ----------------------------------------------------------------

  /** Die obersten 'depth' Karten eines Ablagestapels, oberste zuerst. */
  discardLookAhead(player, pileIndex, depth) {
    const pile = State.player(player).discards[pileIndex];
    if (!pile || pile.length === 0) return [];
    const effectiveDepth = Math.min(depth, pile.length, 6);
    return pile.slice(-effectiveDepth).reverse();
  },

  /** Tiefenkombinationen eines Ablagestapels als Zusatz-Kandidaten. */
  discardComboDepth(player, pileIndex) {
    const result = [];
    const me     = State.player(player);
    const pile   = me.discards[pileIndex];
    if (!pile || pile.length <= 1) return [];

    const allCards   = this.discardLookAhead(player, pileIndex, KONFIG.DISCARD_LOOKAHEAD_DEPTH);
    const builds     = State.game.buildPiles;
    let   addedCount = 0;

    for (let ebene = 1; ebene < allCards.length; ebene++) {
      if (addedCount >= KONFIG.DISCARD_MAX_COMBO_CANDIDATES) break;
      const tiefenKarte = allCards[ebene];
      if (!tiefenKarte) continue;

      for (let buildIdx = 0; buildIdx < builds.length; buildIdx++) {
        if (!Rules.isValidBuild(tiefenKarte, buildIdx)) continue;

        const chainResult = this.discardSimChain(player, pileIndex, ebene, buildIdx);
        if (KONFIG.DISCARD_STOCK_FOCUS && !chainResult.enablesStock) continue;

        let score = KONFIG.SCORE_26;
        if (!isNaN(tiefenKarte.value) && isFinite(tiefenKarte.value)) score += tiefenKarte.value * 50;
        score += ebene * KONFIG.DISCARD_COMBO_DEPTH_BONUS;
        if (chainResult.enablesStock) score *= KONFIG.DISCARD_DEPTH_STOCK_MULTIPLIER;
        if (chainResult.isFullChain)  score += KONFIG.DISCARD_CHAIN_BONUS;
        if (me.stock.some(s => s.value === tiefenKarte.value + 1)) score += KONFIG.SCORE_23;
        score = Math.round(score);

        result.push({
          sourceType: 'discard', sourceIndex: pileIndex, card: tiefenKarte,
          buildPileIndex: buildIdx, score, tiefenebene: ebene, isDeepCombo: true
        });
        addedCount++;
      }
    }

    return result;
  },

  /** Kette simulieren: obere Karten → Tiefenkarte → folgt Stock/Hand? */
  discardSimChain(player, pileIndex, tiefenebene, buildPileIndex) {
    try {
      const me        = State.player(player);
      const pile      = me.discards[pileIndex];
      const buildPile = State.game.buildPiles[buildPileIndex];
      const stockTop  = me.stock.slice(-1)[0];

      if (!pile || pile.length <= tiefenebene) return { enablesStock: false, isFullChain: false, chainLength: 0 };
      const tiefenKarte = pile[pile.length - 1 - tiefenebene];
      if (!tiefenKarte) return { enablesStock: false, isFullChain: false, chainLength: 0 };

      const simulatedBuild = [...buildPile, tiefenKarte];
      const nextNeeded     = simulatedBuild.length === 0 ? 1
                           : (simulatedBuild[simulatedBuild.length - 1].type === 'joker'
                              ? simulatedBuild.length + 1
                              : simulatedBuild[simulatedBuild.length - 1].value + 1);

      const enablesStock = stockTop && (stockTop.value === nextNeeded || stockTop.type === 'joker');

      let isFullChain = false;
      let chainLength = tiefenebene + 1;
      if (enablesStock) {
        isFullChain = tiefenebene >= 1;
        chainLength++;
      }
      const handCanFollow = me.hand.some(c => c.type === 'joker' || c.value === nextNeeded);
      if (handCanFollow) chainLength++;

      return { enablesStock: !!enablesStock, isFullChain, chainLength };
    } catch (e) {
      console.error('AI.Analysis.discardSimChain Fehler:', e);
      return { enablesStock: false, isFullChain: false, chainLength: 0 };
    }
  }
};
