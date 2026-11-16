// ================================================================
//  ai-eval.js  –  Skipo 7.0.4   Namensraum: AI.Eval
//  BEWERTUNG DER EINZELZÜGE (Heuristik, nutzt KONFIG)
// ----------------------------------------------------------------
//  Braucht: AI, KONFIG, State, Rules     Bietet: AI.Eval.candidates()
//
//  Alle Bauzug-Kandidaten, die der Planer übrig lässt, werden mit den
//  KONFIG-Werten bewertet und sortiert. Die KI spielt jeden Kandidaten,
//  der übrig bleibt – die Bewertung bestimmt nur die Reihenfolge und
//  (in „Leicht") den Joker-Einsatz. Die Formeln sind bewährt und
//  bleiben unverändert, damit die Stufen ihre Stärke behalten.
//
//  Was eine Stufe ausmacht, passiert in filter():
//    Mittel/Schwer – Joker nie über die Heuristik; Blockade
//                    (applyBlockade: Züge verweigern, die dem Gegner
//                    die Stockkarte öffnen).
//    Schwer        – zusätzlich größerer Sicherheitsabstand und
//                    Handkarte vor Ablagekarte.
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

  /** Oberste Ablagestapelkarten auf Baustapel bewerten. */
  scoreDiscard(player) {
    const candidates = [];
    const me         = State.player(player);
    const builds     = State.game.buildPiles;

    me.discards.forEach((pile, discardIndex) => {
      if (pile.length === 0) return;
      const card = pile[pile.length - 1];

      builds.forEach((buildPile, buildIndex) => {
        if (!Rules.isValidBuild(card, buildIndex)) return;

        let score = KONFIG.SCORE_26;
        const wert = card.value;
        try {
          if (!isNaN(wert) && isFinite(wert)) score += wert * 50;
          else                                score += KONFIG.SCORE_27;
        } catch (e) { score += KONFIG.SCORE_27; }

        if (AI.knownStock().some(s => s.value === card.value + 1)) score += KONFIG.SCORE_23;

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

  /** Stufen-Regeln (Joker, Blockade), Joker-Schwelle, dynamische Prioritäten; sortiert. */
  filter(candidates, player, nagel40, nagel41, nagel42) {
    if (candidates.length === 0) return [];

    // Mittel/Schwer: Joker nie über die Heuristik (nur Planer-Ketten und Stock), dann Blockade
    const T = AI.taktik();
    if (T) {
      candidates = candidates.filter(m => m.card.type !== 'joker');
      if (candidates.length === 0) return [];
      this.applyBlockade(candidates, T);
    }

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

    const enemyAnalysis = AI.Analysis.predictEnemyStock('human');
    const priorities    = this.dynamicPriorities();

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

      move.score = Math.round(move.score * priorities.riskTaking);
    });

    if (T && T.PREFER_HAND) {
      // Schwer: dieselbe Karte liegt in der Hand UND oben auf einer Ablage → Handkarte zuerst (mehr Nachziehen)
      for (const m of filtered) {
        if (m.sourceType !== 'hand') continue;
        const twin = filtered.find(o => o !== m && o.sourceType === 'discard' &&
                                        o.buildPileIndex === m.buildPileIndex && o.card.value === m.card.value);
        if (twin && twin.score >= m.score) m.score = twin.score + 1;
      }
    }
    const result = filtered.sort((a, b) => b.score - a.score);
    return result.filter(m => !m.avoid);
  },

  /**
   * Blockade (Mittel/Schwer): Züge verweigern, die dem Gegner den Weg zu seiner
   * SICHTBAREN Stockkarte V öffnen. Eigene Stockzüge werden nie verweigert.
   *   Abstand 1 (Karte V-1): verweigern, außer die KI kann selbst mit V oder Joker zudecken
   *   Abstand 2 (Karte V-2): verweigern, wenn die Brücke V-1 beim Gegner sichtbar liegt
   *                          oder der Sicherheitsabstand T.AVOID_DIST ≥ 2 ist
   *   Abstand 3..AVOID_DIST: verweigern
   */
  applyBlockade(candidates, T) {
    const th = AI.Analysis.threat();
    if (!th) return;
    const V  = th.value;
    const me = State.player('ai');
    const canCover = me.hand.some(c => c.type === 'joker' || c.value === V) ||
                     me.discards.some(d => d.length > 0 && d[d.length - 1].value === V);

    for (const m of candidates) {
      if (m.sourceType === 'stock') continue;
      const gap = V - m.card.value;                  // Joker sind hier schon aussortiert
      if (gap === 1)                           m.avoid = !canCover;
      else if (gap === 2)                      m.avoid = th.bridge || T.AVOID_DIST >= 2;
      else if (gap >= 3 && gap <= T.AVOID_DIST) m.avoid = true;
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
    return AI.knownStock().some(c => c.type === 'number' && c.value === jokerValue);
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
