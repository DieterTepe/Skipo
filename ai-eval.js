// ================================================================
//  ai-eval.js  –  Skipo 7.0.1   Namensraum: AI.Eval
//  BEWERTUNG & SCORING (getunte Heuristik, nutzt KONFIG)
// ----------------------------------------------------------------
//  Braucht: AI, KONFIG, State, Rules     Bietet: AI.Eval.candidates()
//
//  Das Herz der vom Tuner optimierten KI. Alle Bauzug-Kandidaten
//  werden mit den KONFIG-SCORE-Parametern bewertet und sortiert.
//  Die Formeln sind 1:1 aus 6.6.0 übernommen – jede Änderung
//  verschiebt die getunte Balance.
//
//  Dokumentierte Eigenheiten (bewusst erhalten):
//    • SCORE_44 wird berechnet, aber nirgends verwendet.
//    • SCORE_49 hat keinen Score-Effekt (war schon im Original
//      wirkungslos; das zugehörige Flag ist entfallen).
// ================================================================

AI.Eval = {

  /**
   * Alle möglichen Bauzüge bewerten → sortierte Kandidatenliste (bester zuerst).
   * @returns {Array} [{sourceType, sourceIndex, card, buildPileIndex, score}]
   */
  candidates(player) {
    const nagel40   = KONFIG.SCORE_40;
    const nagel41   = KONFIG.SCORE_41;
    const nagel42   = KONFIG.SCORE_42;
    const me        = State.player(player);
    const stockSize = me.stock.length;
    const stockTop  = me.stock.slice(-1)[0]?.value;

    // Nagel44: berechnet, aber wie im Original ohne Wirkung
    const blockedStock = Math.max(0, 16 - State.player('human').stock.length);
    const Nagel44      = KONFIG.SCORE_44 * Math.sqrt(blockedStock);   // eslint-disable-line no-unused-vars

    let candidates = [];
    candidates = candidates.concat(this.scoreHand(player, stockSize, stockTop));
    candidates = this.dedup(candidates);
    candidates = candidates.concat(this.scoreStock(player));
    candidates = candidates.concat(this.scoreDiscard(player));
    return this.filter(candidates, player, nagel40, nagel41, nagel42);
  },

  /** Handkarten auf Baustapel bewerten. */
  scoreHand(player, stockSize, stockTop) {
    const candidates = [];
    const me         = State.player(player);
    const builds     = State.game.buildPiles;
    const comboCache = AI.Analysis.handComboCache(player);

    me.hand.forEach((card, i) => {
      builds.forEach((pile, pileIndex) => {
        if (!Rules.isValidBuild(card, pileIndex)) return;

        let score = KONFIG.SCORE_5;

        const comboBonus = comboCache[i] || 0;
        if (comboBonus > 0) score += comboBonus;

        if (KONFIG.SCORE_9 > 0) {
          const maxPileLen = Math.max(...builds.map(p => p.length));
          if (pile.length < maxPileLen) score += KONFIG.SCORE_9;
        }

        const gapSize    = this.gapSize(pile, card) || 0;
        const futureRisk = this.futureRisk(card, pileIndex) || 0;
        let riskScore    = this.blockingPotential(card, pileIndex);

        if (card.value === '★' || card.type === 'joker') riskScore += KONFIG.SCORE_4_JOKER_MOVE;

        score += gapSize * KONFIG.SCORE_12;
        score -= futureRisk;
        score -= riskScore;

        if (card.type === 'joker') {
          score = this.jokerOnBuild(score, riskScore, pile, pileIndex, stockSize, stockTop, card);
        }

        candidates.push({ sourceType: 'hand', sourceIndex: i, card, buildPileIndex: pileIndex, score });
      });
    });

    return candidates;
  },

  /** Joker-Speziallogik beim Bauzug mit Handkarte. */
  jokerOnBuild(score, riskScore, pile, pileIndex, stockSize, stockTop, card) {
    const jokerValue   = pile.length === 0 ? 1 : pile[pile.length - 1].value + 1;
    const matchesStock = stockTop && jokerValue === stockTop;
    const aggression   = KONFIG.JOKER_STOCK_AGGRESSION;
    const aiStock      = State.player('ai').stock;

    if (pile.length < 5 && stockSize > 12 && !matchesStock) {
      try {
        if (this.canRemoveStockCard()) {
          const bonus = KONFIG.SCORE_39 * aggression;
          riskScore  -= bonus;
          score      += bonus;
        } else {
          const dynamicMalus = KONFIG.SCORE_6 * (1 - (aiStock.length / 20)) * (1 - aggression * 0.5);
          score -= dynamicMalus;
        }
      } catch (error) {
        console.error('AI.Eval.jokerOnBuild Fehler:', error);
        const dynamicMalus = KONFIG.SCORE_6 * (1 - (aiStock.length / 20));
        score -= dynamicMalus;
      }
    }

    if (matchesStock && (pile.length >= 5 || stockSize <= 10)) {
      const humanStock    = State.player('human').stock;
      const topHumanStock = humanStock[humanStock.length - 1]?.value || 1;
      const aggressionMultiplier = 0.5 + aggression;
      const bonus = Math.round((KONFIG.SCORE_7 + (2000 * (12 - topHumanStock))) * aggressionMultiplier);
      score += bonus;
    }

    const futureValue = this.jokerFutureValue(card, pileIndex) || 0;
    if (futureValue > 0) score += futureValue * KONFIG.SCORE_8;

    return score;
  },

  /** Stockkarte auf Baustapel bewerten. */
  scoreStock(player) {
    const candidates = [];
    const stockCard  = State.player(player).stock.slice(-1)[0];
    if (!stockCard) return candidates;
    const builds = State.game.buildPiles;

    builds.forEach((pile, pileIndex) => {
      if (!Rules.isValidBuild(stockCard, pileIndex)) return;
      const advancedPiles = builds.filter(p => p.length > 6).length;
      const score = Math.min(KONFIG.SCORE_24, KONFIG.SCORE_10 + (KONFIG.SCORE_10_ADV * advancedPiles));
      candidates.push({ sourceType: 'stock', sourceIndex: 0, card: stockCard, buildPileIndex: pileIndex, score });
    });

    return candidates;
  },

  /** Ablagestapelkarten auf Baustapel bewerten (inkl. Tiefenanalyse). */
  scoreDiscard(player) {
    const candidates = [];
    const me         = State.player(player);
    const builds     = State.game.buildPiles;

    me.discards.forEach((pile, discardIndex) => {
      if (pile.length === 0) return;
      const card = pile[pile.length - 1];

      // Ebene 0: oberste Karte
      builds.forEach((buildPile, buildIndex) => {
        if (!Rules.isValidBuild(card, buildIndex)) return;

        let score = KONFIG.SCORE_26;
        const wert = card.value;
        try {
          if (!isNaN(wert) && isFinite(wert)) score += wert * 50;
          else                                score += KONFIG.SCORE_27;
        } catch (e) { score += KONFIG.SCORE_27; }

        if (me.stock.some(s => s.value === card.value + 1)) score += KONFIG.SCORE_23;

        if (KONFIG.SCORE_36 > 0) {
          me.discards.forEach((jokerPile, jpi) => {
            if (jpi === discardIndex) return;
            if (jokerPile.length === 0) return;
            const jokerTop = jokerPile[jokerPile.length - 1];
            if (jokerTop.type !== 'joker') return;
            const nextAfterCard = parseInt(card.value) + 1;
            if (nextAfterCard <= 12) score += KONFIG.SCORE_36;
          });
        }

        candidates.push({ sourceType: 'discard', sourceIndex: discardIndex, card, buildPileIndex: buildIndex, score });
      });

      // Ebenen 1–N: Tiefenanalyse
      if (KONFIG.DISCARD_LOOKAHEAD_DEPTH > 1 && pile.length > 1) {
        const deep = AI.Analysis.discardComboDepth(player, discardIndex);
        if (deep.length > 0) candidates.push(...deep);
      }
    });

    return candidates;
  },

  /** Besten Score je Handkarten-Index behalten. */
  dedup(candidates) {
    const unique   = [];
    const seenHand = {};
    for (const c of candidates) {
      if (c.sourceType === 'hand') {
        const key = c.sourceIndex;
        if (!seenHand.hasOwnProperty(key) || seenHand[key].score < c.score) seenHand[key] = c;
      } else {
        unique.push(c);
      }
    }
    for (const key in seenHand) unique.push(seenHand[key]);
    return unique;
  },

  /** Joker-Filter + dynamische Prioritäten + Blockade-Boni; sortiert. */
  filter(candidates, player, nagel40, nagel41, nagel42) {
    if (candidates.length === 0) return [];

    const T = AI.taktik();
    if (T && T.JOKER_HEURISTIC === false) {
      candidates = candidates.filter(m => m.card.type !== 'joker');
      if (candidates.length === 0) return [];
    }
    if (T) this.applyThreat(candidates, T);
    if (T && T.CHAIN_AVOID) this.applyChain(candidates, T);

    const avgScore         = candidates.reduce((s, m) => s + m.score, 0) / candidates.length;
    const dynamicThreshold = avgScore * nagel40;
    candidates.forEach(m => { if (m.card.type === 'joker') m.score *= nagel42; });

    const hasNonJoker = candidates.some(m => m.card.type !== 'joker' && m.score > 0);
    const filtered    = hasNonJoker
      ? candidates.filter(m => !(m.card.type === 'joker' && m.score < dynamicThreshold))
      : candidates;

    // Nur Joker-Züge und alle unter Mindestbewertung → Joker wird abgelegt
    if (!hasNonJoker && filtered.length > 0) {
      const onlyJoker      = filtered.every(m => m.card.type === 'joker');
      const bestJokerScore = Math.max(...filtered.map(m => m.score));
      if (onlyJoker && bestJokerScore < nagel41) return [];
    }

    const enemyAnalysis = AI.Analysis.enemyTarget('human');
    const priorities    = this.dynamicPriorities();
    const blockTargets  = AI.Analysis.discardPatterns();
    if (KONFIG.DEBUG_N3 && blockTargets.length > 0) {
      console.log(`📌N3 🎯 Blockade-Ziele: ${blockTargets.map(t => `${t.value}(${(t.confidence * 100).toFixed(0)}%)`).join(', ')}`);
    }

    const humanStock = State.player('human').stock;
    const series     = AI.Analysis.consecutiveDiscards('human');

    filtered.forEach(move => {
      if (move.card.value === enemyAnalysis.nextExpected) {
        const n34   = humanStock.length < 10 ? KONFIG.SCORE_34_HIGH : KONFIG.SCORE_34_LOW;
        move.score += n34 * priorities.stockAttack;
      }

      if (series.includes(move.card.value)) {
        move.score += Math.round(KONFIG.SCORE_35 * priorities.seriesDisrupt);
      }

      const blockBonus = AI.Analysis.blockScore(move.card, blockTargets);
      if (blockBonus > 0) {
        move.score += blockBonus;
        if (KONFIG.DEBUG_N4) console.log(`📌N4 🛡️ Blockade-Bonus für ${move.card.value}: +${blockBonus}`);
      }

      move.score = Math.round(move.score * priorities.riskTaking);
    });

    const result = filtered.sort((a, b) => b.score - a.score);
    return T ? result.filter(m => !m.avoid) : result;
  },

  /**
   * Blockade-Taktik (7.0.2): Kandidaten nach ihrer Wirkung auf die sichtbare
   * Gegner-Stockkarte V bewerten – öffnen (V-1) bestrafen, zudecken (V) belohnen.
   */
  applyThreat(candidates, T) {
    const th = AI.Analysis.threat();
    if (!th) return;
    const V     = th.value;
    const piles = State.game.buildPiles;
    const me    = State.player('ai');
    const w     = th.oppStock <= T.ENDGAME_LIMIT
      ? 1 + (T.ENDGAME_FACTOR - 1) * (T.ENDGAME_LIMIT + 1 - th.oppStock) / T.ENDGAME_LIMIT
      : 1;
    const canFollow = me.hand.some(c => (T.FOLLOW_JOKER && c.type === 'joker') || c.value === V) ||
                      me.discards.some(d => d.length > 0 && d[d.length - 1].value === V);

    for (const m of candidates) {
      const pile = piles[m.buildPileIndex];
      const eff  = m.card.type === 'joker' ? Rules.nextNeeded(pile) : m.card.value;
      if (eff === V - 1) {
        let pen = T.OPEN_PENALTY * w;
        if (m.sourceType === 'stock') pen *= T.OPEN_STOCKMOVE_FACTOR;
        if (canFollow)                pen *= T.OPEN_FOLLOWUP_FACTOR;
        m.score -= pen;
        // Verzicht: öffnender Zug ohne eigene Deckkarte wird gar nicht gespielt
        const stockOk = m.sourceType !== 'stock' || th.oppStock <= T.AVOID_STOCK_LIMIT;
        m.avoid = T.AVOID_OPEN && !canFollow && stockOk && th.oppStock <= T.AVOID_OPEN_LIMIT;
      } else if (eff === V) {
        m.score += T.COVER_BONUS * w;
      } else if (eff === V - 2 && th.bridge) {
        m.score -= T.SECOND_PENALTY * w;
        m.avoid = T.AVOID_SECOND && m.sourceType !== 'stock' && th.oppStock <= T.AVOID_OPEN_LIMIT;
      } else if (T.AVOID_DISCARD_TOPS && m.sourceType !== 'stock' && th.tops.includes(eff + 1)) {
        m.avoid = true;
      }
    }
  },

  /**
   * Kettenbedrohung (7.0.3): Zug verweigern, wenn der Gegner danach mit seinen
   * sichtbaren Karten eine Kette legen kann, die ohne den Zug nicht möglich wäre.
   *   CHAIN_STOCK : Stockkarte des Gegners wird erst durch den Zug erreichbar
   *   CHAIN_LIMIT : Kette ≥ Grenze UND um ≥ CHAIN_DELTA länger als vorher (0 = aus)
   */
  applyChain(candidates, T) {
    const human = State.player('human');
    if (human.stock.length > T.CHAIN_OPP_STOCK_LIMIT) return;
    const me   = State.player('ai');
    const base = AI.Analysis.chainThreat(AI.Analysis.buildNeeds());
    for (const m of candidates) {
      if (m.avoid) continue;
      if (T.CHAIN_SKIP_STOCKMOVE && m.sourceType === 'stock') continue;
      const pile = State.game.buildPiles[m.buildPileIndex];
      const eff  = m.card.type === 'joker' ? Rules.nextNeeded(pile) : parseInt(m.card.value, 10);
      const aft  = AI.Analysis.chainThreat(AI.Analysis.buildNeeds(m.buildPileIndex, eff));
      let bad = false;
      if (T.CHAIN_STOCK && aft.reach && !base.reach) bad = true;
      if (T.CHAIN_LIMIT > 0 && aft.count >= T.CHAIN_LIMIT && aft.count - base.count >= T.CHAIN_DELTA) bad = true;
      if (bad && T.CHAIN_ALLOW_COVER) {
        // eigene Deckkarte (passend zur Stockkarte des Gegners) vorhanden → trotzdem spielen
        const sTop = human.stock[human.stock.length - 1];
        const V = sTop && sTop.type !== 'joker' ? parseInt(sTop.value, 10) : -1;
        if (V > 0 && me.hand.some(c => c.type === 'joker' || parseInt(c.value, 10) === V)) bad = false;
      }
      if (bad) m.avoid = true;
    }
  },

  // ----------------------------------------------------------------
  // EINZELBEWERTUNGEN
  // ----------------------------------------------------------------

  /** Zukunftswert eines Joker-Zugs. */
  jokerFutureValue(card, buildPileIndex) {
    let futureValue = 0;
    const buildPile = State.game.buildPiles[buildPileIndex];
    let pileValue   = 1;

    if (buildPile.length > 0) {
      const topCard = buildPile[buildPile.length - 1];
      if (topCard) {
        pileValue = topCard.type === 'joker' ? buildPile.length : parseInt(topCard.value) + 1;
      } else {
        console.error('AI.Eval.jokerFutureValue: topCard undefiniert');
        pileValue = 1;
      }
    }
    if (isNaN(pileValue)) { console.error('Ungültiger pileValue:', pileValue); return 0.01; }

    const currentJokerValue = card.type === 'joker'
      ? Rules.jokerValue(buildPile, buildPile.length)
      : pileValue;

    if (this.neededForStock(currentJokerValue)) {
      futureValue += KONFIG.SCORE_25 * (12 - currentJokerValue);
    }
    for (let i = 1; i <= 5; i++) {
      if (pileValue + i <= 12) futureValue++;
    }
    if (pileValue >= 8) futureValue += KONFIG.SCORE_21A;

    return futureValue;
  },

  /** Lückengröße zwischen Kartenwert und Baustapelwert. */
  gapSize(pile, card) {
    if (!card || !card.value) return 0.01;
    const cardValue = parseInt(card.value, 10);
    if (!pile || pile.length === 0) return cardValue;
    const lastValue = parseInt(pile[pile.length - 1].value, 10);
    const gap       = cardValue - lastValue;
    return gap > 0 ? gap : 0;
  },

  /** Zukunftsrisiko einer Karte. */
  futureRisk(card, pileIndex) {
    if (!card || !card.value) return 0.01;
    const cardValue   = parseInt(card.value, 10);
    const basisFaktor = 5;
    const indexFaktor = (pileIndex !== undefined) ? pileIndex : 0;
    return (12 - cardValue) * (basisFaktor + indexFaktor);
  },

  /** Phasenabhängige Gewichtungen. */
  dynamicPriorities() {
    const g          = State.game;
    const phase      = 1 - (g.drawPile.length / 144);
    const enemyStock = g.players.human.stock.slice(-1)[0]?.value || 1;
    return {
      stockAttack:   Math.min(1.5, (12 - enemyStock) / 10 * phase),
      seriesDisrupt: 0.4 + (g.history.human.length * 0.03),
      riskTaking:    phase < 0.3 ? 0.8 : phase < 0.7 ? 1.0 : 1.3
    };
  },

  /** Wie stark hilft diese Karte dem Gegner? (höher = gefährlicher) */
  blockingPotential(card, buildPileIndex) {
    const human = State.player('human');
    const ai    = State.player('ai');
    const opponentVisible   = [...human.stock.slice(-1), ...human.discards.flat()];
    let riskScore           = 0;
    const opponentStockSize = human.stock.length;

    opponentVisible.forEach(oppCard => {
      if (oppCard.value === card.value + 1) {
        const stockFactor      = 1 - (ai.stock.length / 20);
        const humanStockImpact = 1 + (15 - human.stock.length) / 15;
        riskScore += KONFIG.SCORE_1 * stockFactor * humanStockImpact;
        if (ai.stock.length <= 5) riskScore -= KONFIG.SCORE_2 * (6 - ai.stock.length);
      }
      if (oppCard.value === card.value - 1) {
        riskScore += KONFIG.SCORE_28;
        if (opponentStockSize <= 3) riskScore += KONFIG.SCORE_29;
      }
      if (oppCard.type === 'joker' && card.value >= 5) {
        riskScore += KONFIG.SCORE_4_OPP_JOKER;
        if (opponentStockSize <= 3) riskScore += KONFIG.SCORE_30;
      }
    });

    if (KONFIG.SCORE_22 > 0 && opponentStockSize <= 5 && opponentStockSize > 3) {
      if (this.opponentCritical().includes(parseInt(card.value))) riskScore += KONFIG.SCORE_22;
    }

    opponentVisible.forEach((cardA, i) => {
      opponentVisible.slice(i + 1).forEach(cardB => {
        if (Math.abs(cardA.value - cardB.value) === 2) {
          if (card.value === (cardA.value + cardB.value) / 2) riskScore += KONFIG.SCORE_3;
        }
      });
    });

    return riskScore;
  },

  /** Ist die oberste KI-Stockkarte spielbar (Gültigkeitsprüfung)? */
  canRemoveStockCard() {
    try {
      const stock = State.player('ai').stock;
      if (!Array.isArray(stock) || stock.length === 0) return false;
      const topCard = stock[stock.length - 1];
      if (!topCard || !('value' in topCard)) return false;
      if (topCard.type === 'number') {
        const value = parseInt(topCard.value, 10);
        if (isNaN(value) || value < 1 || value > 12) return false;
      }
      return true;
    } catch (err) {
      return false;
    }
  },

  /** Wird dieser Joker-Wert im KI-Stock benötigt? */
  neededForStock(jokerValue) {
    return State.player('ai').stock.some(c => c.type === 'number' && c.value === jokerValue);
  },

  /** Kartenwerte, die dem menschlichen Gegner direkt helfen (Stock-Top+1, Ablage-Tops+1). */
  opponentCritical() {
    const human = State.player('human');
    const critical = [];
    if (human.stock.length > 0) {
      critical.push(parseInt(human.stock[human.stock.length - 1].value) + 1);
    }
    human.discards.forEach(pile => {
      if (pile.length > 0) critical.push(parseInt(pile[pile.length - 1].value) + 1);
    });
    return [...new Set(critical)];
  }
};
