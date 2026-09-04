// ================================================================
//  ai-turn.js  –  Skipo 7.0.1   Namensraum: AI
//  KI-RUNDENABLAUF
// ----------------------------------------------------------------
//  Braucht: KONFIG, KI_PLANNER, State, Rules, Events, I18n, Clock
//           + AI.Planner / AI.Eval / AI.Analysis (eigene Dateien)
//  Bietet:  AI.takeTurn()  (+ Hilfen für die Unter-Namensräume)
//
//  Drei Phasen wie in 6.6.0:
//    prepare()      – Ziehen, Gegner-Vorhersage, Blockade-Marker
//    executeMoves() – Joker im Stock, Zugketten-Planer, Heuristik
//    finish()       – Pflicht-Ablegen (Joker-Analyse), Nachziehen
//
//  Kein DOM. Die KI spricht nur über Ereignisse (msg, ai:predict,
//  ai:note) und Rules-Aufrufe. Der Spielerwechsel gehört Flow.
//
//  Wächter: AI.over() ist an JEDER Stelle die Frage „darf ich noch?"
//  (Spiel beendet oder Sieger steht fest). AI.busy verhindert
//  parallele Wurzelstarts (Geister-KI). Die Stock-Prioritäts-
//  Rekursion wird awaited.
// ================================================================

const AI = {
  busy: false,

  /** Zug beendet? (Spiel vorbei oder Sieger steht fest) */
  over() {
    return State.turn.over || Rules.winner() !== null;
  },

  /** Blockade-Taktik (ki-taktik.js) aktiv? → Objekt, sonst null. */
  taktik() {
    return (typeof KI_TAKTIK !== 'undefined' && KI_TAKTIK && KI_TAKTIK.ENABLED) ? KI_TAKTIK : null;
  },

  /** Statusmeldung (Schlüssel + Werte). */
  say(key, ...args) { I18n.say(key, ...args); },

  /** Beobachtung für das Tuner-Tracking. */
  note(type, data) { Events.emit('ai:note', Object.assign({ type }, data)); },

  /** Anzeige-Bausteine (nur für Meldungen). */
  cardLabel(card) { return card.type === 'joker' ? I18n.t('jokerLabel') : `${card.value}`; },
  srcLabel(type, idx) {
    return type === 'hand'  ? I18n.t('srcHandN', idx + 1)
         : type === 'stock' ? I18n.t('srcStock')
         :                    I18n.t('srcDiscardN', idx + 1);
  },
  reasonText(r) { return r ? I18n.t(r.key, ...(r.args || [])) : ''; },

  // ----------------------------------------------------------------
  // HAUPTEINSTIEG
  // ----------------------------------------------------------------

  /**
   * takeTurn(depth) – kompletter KI-Zug. Kehrt zurück, wenn die KI
   * fertig ist; den Wechsel zum Spieler macht Flow.
   * @param {number} depth – Rekursionstiefe (Stock-Priorität), max. 15
   */
  async takeTurn(depth = 0) {
    if (this.over()) return;
    if (depth === 0) {
      if (this.busy) { console.warn('AI: zweiter Wurzelstart ignoriert'); return; }
      this.busy = true;
    }
    try {
      if (depth > 15) { console.warn('AI: max. Rekursionstiefe erreicht'); return; }

      await this.prepare();
      if (this.over()) return;

      const restarted = await this.executeMoves(depth);
      if (restarted || this.over()) return;

      await this.finish();
    } finally {
      if (depth === 0) this.busy = false;
    }
  },

  // ----------------------------------------------------------------
  // PHASE 1 – VORBEREITUNG
  // ----------------------------------------------------------------

  async prepare() {
    Rules.drawToFive('ai');
    this.say('aiPrepare');
    await Clock.pause(0.8);
    if (this.over()) return;

    const enemy = AI.Analysis.enemyTarget('human');

    this.say('aiAnalyze');
    await Clock.pause(0.5);

    // Blockade-Marker: Baustapel, deren oberste Karte dem erwarteten Gegnerwert entspricht
    const piles = [];
    State.game.buildPiles.forEach((pile, i) => {
      if (pile.slice(-1)[0]?.value === enemy.nextExpected) piles.push(i);
    });
    Events.emit('ai:predict', { piles, value: enemy.nextExpected, confidence: enemy.confidence });

    // Gezielte Stock-Attacke bei hoher Konfidenz
    if (enemy.confidence > 0.6 && enemy.nextExpected) {
      try {
        this.say('aiBlockPlan', enemy.nextExpected);
        await this.stockAttack(enemy.nextExpected);
        if (this.over()) return;
        await Clock.pause(0.3);
      } catch (e) {
        console.error('AI.stockAttack Fehler:', e);
      }
    }
  },

  /** Sofort-Nachziehen-Regel: Hand leer → 5 neue Karten, weiterspielen. */
  async redrawIfHandEmpty() {
    if (!KI_PLANNER.REDRAW_ON_EMPTY_HAND) return false;
    if (this.over()) return false;
    if (State.player('ai').hand.length > 0) return false;
    if (State.game.drawPile.length === 0) return false;

    this.say('aiRedraw');
    await Clock.pause(0.8);
    if (this.over()) return false;
    Rules.drawToFive('ai');
    return true;
  },

  // ----------------------------------------------------------------
  // PHASE 2 – ZUGSCHLEIFE
  // ----------------------------------------------------------------

  /**
   * executeMoves(depth) – alle möglichen Bauzüge ausführen.
   * @returns {boolean} true = Zug wurde rekursiv neu gestartet (kein finish nötig)
   */
  async executeMoves(depth) {
    let noMoreMoves = false;
    let moveCount   = 0;
    const ai        = State.player('ai');

    // ── Joker im Stock zuerst analysieren ─────────────────────────
    const stockTop = ai.stock.slice(-1)[0];
    if (stockTop && stockTop.type === 'joker') {
      const d = await AI.Analysis.jokerStockTop(stockTop);
      if (d && d.shouldPlay) {
        this.say('aiJokerStock', d.targetPile + 1, this.reasonText(d.reason));
        await Clock.pause(1.0);
        if (this.over()) return false;
        if (Rules.playToBuild('ai', 'stock', 0, d.targetPile)) {
          this.note('kiMove', { sourceType: 'stock', cardValue: '★', cardType: 'joker',
                                buildPileIndex: d.targetPile, score: KONFIG.JOKER_STOCK_COMBO_BONUS });
          moveCount++;
          await Clock.pause(0.5);
          if (this.over()) return false;
        }
      } else if (d) {
        this.say('aiJokerKeep', this.reasonText(d.reason));
      }
      if (this.over()) return false;
    }

    // ── Zugketten-Planer ──────────────────────────────────────────
    moveCount += await AI.Planner.runChains();
    if (this.over()) return false;

    // ── Getunte Kandidatenschleife ────────────────────────────────
    const T = this.taktik();
    for (let round = 0; round < 4; round++) {
    do {
      if (this.over()) return false;
      this.say('aiCompute');
      await Clock.pause(0.5);

      const candidates = AI.Eval.candidates('ai');

      if (candidates.length === 0) {
        const stockPlayed = await this.stockFallback();
        if (!stockPlayed) noMoreMoves = true;
        else if (T && T.CONTINUE_AFTER_FALLBACK) { moveCount++; if (this.over()) return false; continue; }
        break;
      }

      candidates.sort((a, b) => b.score - a.score);
      const best      = candidates[0];
      const stockCard = ai.stock.length > 0 ? ai.stock[ai.stock.length - 1] : null;

      const didStockPriority = await this.stockPriority(best, stockCard, depth);
      if (didStockPriority) return true;      // Rekursion erledigt finish

      const moved = await this.playBest(best);
      if (!moved) { noMoreMoves = true; break; }
      moveCount++;

      // Hand leer? → sofort nachziehen und erneut planen
      if (await this.redrawIfHandEmpty()) {
        moveCount += await AI.Planner.runChains();
        if (this.over()) return false;
      }

      if (moveCount >= 2) {
        this.say('aiCombo', moveCount, this.cardLabel(best.card));
        await Clock.pause(0.4);
      }

      await Clock.pause(1.0);
    } while (!noMoreMoves && !this.over());

    // Taktik: offenen Stapel notfalls mit Joker zudecken, dann ggf. weiterspielen
    if (this.over() || !T || !(await this.jokerCover(T))) break;
    moveCount++;
    noMoreMoves = false;
    if (await this.redrawIfHandEmpty()) {
      moveCount += await AI.Planner.runChains();
      if (this.over()) return false;
    }
    }
    return false;
  },

  /** Taktik: einen für die Gegner-Stockkarte offenen Stapel mit einem Hand-Joker zudecken. */
  async jokerCover(T) {
    if (!T.JOKER_COVER_LIMIT) return false;
    const th = AI.Analysis.threat();
    if (!th || th.open.length === 0 || th.oppStock > T.JOKER_COVER_LIMIT) return false;
    const ai = State.player('ai');
    const j  = ai.hand.findIndex(c => c.type === 'joker');
    if (j === -1) return false;
    const pile = th.open[0];
    this.say('aiJokerCover', th.value, pile + 1);
    await Clock.pause(1.0);
    if (this.over()) return false;
    if (Rules.playToBuild('ai', 'hand', j, pile)) {
      this.note('kiMove', { sourceType: 'hand', cardValue: '★', cardType: 'joker', buildPileIndex: pile, score: T.COVER_BONUS });
      await Clock.pause(0.5);
      return true;
    }
    return false;
  },

  /** Fallback ohne Kandidaten: Stockkarte direkt auf einen Baustapel. */
  async stockFallback() {
    const stockCard = State.player('ai').stock.slice(-1)[0];
    if (!stockCard) return false;
    const piles = State.game.buildPiles;

    for (let j = 0; j < piles.length; j++) {
      if (!Rules.isValidBuild(stockCard, j)) continue;

      this.say('aiStockPlay', stockCard.value, j + 1);
      await Clock.pause(1.2);
      if (this.over()) return false;

      if (Rules.playToBuild('ai', 'stock', 0, j)) {
        this.note('kiMove', { sourceType: 'stock', cardValue: stockCard.value, cardType: stockCard.type,
                              buildPileIndex: j, score: KONFIG.SCORE_24 });
        return true;
      }
      break;
    }

    // Stockkarte wäre spielbar gewesen → für den Tuner „verpasst" zählen
    if (piles.some((pile, j) => Rules.isValidBuild(stockCard, j))) {
      this.note('missedStock', { stockCardValue: stockCard.value });
    }
    return false;
  },

  /** Besten Kandidaten spielen. */
  async playBest(best) {
    this.say('aiBuild', this.cardLabel(best.card), this.srcLabel(best.sourceType, best.sourceIndex),
             best.buildPileIndex + 1, best.score);
    await Clock.pause(1.2);
    if (this.over()) return false;

    if (Rules.playToBuild('ai', best.sourceType, best.sourceIndex, best.buildPileIndex)) {
      this.note('kiMove', { sourceType: best.sourceType, cardValue: best.card.value, cardType: best.card.type,
                            buildPileIndex: best.buildPileIndex, score: best.score });
      return true;
    }
    return false;
  },

  /**
   * Stockkarte bevorzugen, wenn sie denselben Wert wie der beste Kandidat hat.
   * Startet den Zug danach rekursiv (awaited!) neu.
   * @returns {boolean} true = gespielt und rekursiv fortgesetzt
   */
  async stockPriority(best, stockCard, depth) {
    if (!stockCard) return false;
    if (best.sourceType === 'stock') return false;
    if (stockCard.type === 'joker') return false;
    if (stockCard.value !== best.card.value) return false;

    this.say('aiStockPrio', stockCard.value, best.buildPileIndex + 1);
    await Clock.pause(1.2);
    if (this.over()) return false;

    if (Rules.playToBuild('ai', 'stock', 0, best.buildPileIndex)) {
      this.note('kiMove', { sourceType: 'stock', cardValue: stockCard.value, cardType: stockCard.type,
                            buildPileIndex: best.buildPileIndex, score: KONFIG.SCORE_32 });
    }

    if (!this.over()) await this.takeTurn(depth + 1);
    return true;
  },

  // ----------------------------------------------------------------
  // PHASE 3 – ABSCHLUSS
  // ----------------------------------------------------------------

  async finish() {
    if (this.over()) return;
    const ai = State.player('ai');

    if (ai.hand.length > 0) {
      this.say('aiDiscarding');
      await Clock.pause(1);

      const jokerIdx = ai.hand.findIndex(c => c.type === 'joker');
      if (jokerIdx !== -1 && KONFIG.JOKER_COMBO_ENABLED) {
        const d = await AI.Analysis.jokerHand(jokerIdx);
        if (d) {
          if (d.action === 'buildCombo') {
            // Erst die Ablagekarte spielen, dann den Joker
            this.say('aiJokerCombo', d.discardIndex + 1, d.targetPile + 1);
            if (Rules.playToBuild('ai', 'discard', d.discardIndex, d.targetPile)) {
              await Clock.pause(0.8);
              if (this.over()) return;
              const jNow = ai.hand.findIndex(c => c.type === 'joker');
              if (jNow !== -1 && Rules.playToBuild('ai', 'hand', jNow, d.targetPile)) {
                this.note('kiMove', { sourceType: 'hand', cardValue: '★', cardType: 'joker',
                                      buildPileIndex: d.targetPile, score: KONFIG.JOKER_STOCK_COMBO_BONUS });
                this.say('aiJokerDone', d.targetPile + 1);
                await Clock.pause(0.5);
                if (this.over()) return;
              }
            }
            await this.discard('ai');
          } else if (d.action === 'buildDirect') {
            this.say('aiJokerDirect', d.targetPile + 1);
            if (Rules.playToBuild('ai', 'hand', jokerIdx, d.targetPile)) {
              this.note('kiMove', { sourceType: 'hand', cardValue: '★', cardType: 'joker',
                                    buildPileIndex: d.targetPile, score: KONFIG.JOKER_STOCK_COMBO_BONUS });
              await Clock.pause(0.5);
              if (this.over()) return;
            }
            await this.discard('ai');
          } else {
            // Joker sicher ablegen: erst normale Karte, dann Joker auf den Schutzstapel
            this.say('aiJokerSafe', d.discardIndex + 1);
            await this.discard('ai');
            if (this.over()) return;
            const jNow = ai.hand.findIndex(c => c.type === 'joker');
            if (jNow !== -1 && Rules.playToDiscard('ai', 'hand', jNow, d.discardIndex)) {
              this.say('aiJokerSecured', d.discardIndex + 1);
              await Clock.pause(0.8);
              if (this.over()) return;
            }
          }
        } else {
          await this.discard('ai');
        }
      } else {
        await this.discard('ai');
      }
    } else {
      this.say('aiNoHand');
    }

    if (this.over()) return;

    if (ai.hand.length < 5) {
      this.say('aiDraw');
      await Clock.pause(0.5);
      Rules.drawToFive('ai');
    }

    if (this.over()) return;

    Events.emit('ai:predict', null);       // Blockade-Marker entfernen
    this.say('aiEnd');
    await Clock.pause(0.5);
  },

  // ----------------------------------------------------------------
  // STOCK-ATTACKE & ABLEGEN
  // ----------------------------------------------------------------

  /** Gezielter Angriff: Karte legen, die den Gegner beim Stockabbau blockiert. */
  async stockAttack(targetValue) {
    if (this.over()) return false;
    try {
      const ai = State.player('ai');
      const validPiles = State.game.buildPiles
        .map((pile, i) => ({ index: i, current: pile.slice(-1)[0]?.value || 0 }))
        .filter(p => targetValue === 1 ? p.current === 0 : p.current === targetValue - 1);
      if (validPiles.length === 0) return false;
      const bestPile = validPiles.reduce((a, b) => a.current < b.current ? a : b);

      const validCards = [
        ...ai.hand.map((c, i) => ({ card: c, type: 'hand', index: i })),
        { card: ai.stock.slice(-1)[0], type: 'stock', index: 0 }
      ].filter(({ card }) => card && (card.value === targetValue || card.type === 'joker'));
      const T = this.taktik();
      const usable = (T && !T.ATTACK_JOKER) ? validCards.filter(c => c.card.type !== 'joker') : validCards;
      if (usable.length === 0) return false;
      validCards.length = 0; validCards.push(...usable);

      // Nicht-Joker bevorzugen, darunter höheren Wert zuerst
      validCards.sort((a, b) =>
        ((a.card.type === 'joker' ? 1 : 0) - (b.card.type === 'joker' ? 1 : 0)) ||
        ((b.card.value === '★' ? 0 : b.card.value) - (a.card.value === '★' ? 0 : a.card.value))
      );
      const bestCard = validCards[0];
      return Rules.playToBuild('ai', bestCard.type, bestCard.index, bestPile.index) === true;
    } catch (e) {
      console.error('AI.stockAttack Fehler:', e);
      return false;
    }
  },

  /**
   * discard(player) – beste Handkarte auf den besten Ablagestapel legen.
   * Bewertet alle Handkarten × 4 Stapel (Karten-Term + Stapel-Term, SCORE_13…20).
   */
  async discard(player) {
    if (this.over()) return;
    const me = State.player(player);
    if (me.hand.length === 0) {
      this.say('aiNoHandToDiscard');
      await Clock.pause(1);
      return;
    }

    const human = State.player('human');
    const opponentCritical = [
      human.stock.slice(-1)[0]?.value,
      ...human.discards.map(p => p[p.length - 1]?.value)
    ].filter(v => v !== undefined);

    const criticalNumbers = AI.Eval.opponentCritical();

    const stockTop  = me.stock.length > 0 ? me.stock[me.stock.length - 1].value : null;
    const handCards = me.hand;
    const discards  = me.discards;

    const comboCache = AI.Analysis.handComboCache(player);

    let bestDiscardIndex = -1, bestHandIndex = -1, bestScore = -Infinity;

    for (let h = 0; h < handCards.length; h++) {
      const cardToPlay  = handCards[h];
      const isDangerous = opponentCritical.includes(cardToPlay.value);

      // ── Karten-Term (unabhängig vom Zielstapel) ──
      let cardTerm = 0;
      if (cardToPlay.type === 'joker') cardTerm -= KONFIG.SCORE_33;
      if (stockTop && cardToPlay.type !== 'joker') {
        const dist = Math.abs(cardToPlay.value - stockTop) * KONFIG.SCORE_38;
        if (!isNaN(dist) && isFinite(dist)) cardTerm -= dist;
      }
      if (criticalNumbers.includes(cardToPlay.value + 1)) cardTerm -= KONFIG.SCORE_37;
      if (comboCache[h] > 0) cardTerm -= KI_PLANNER.DISCARD_KEEP_COMBO_MALUS;

      for (let i = 0; i < discards.length; i++) {
        const pile    = discards[i];
        const topCard = pile.length > 0 ? pile[pile.length - 1] : null;
        let score     = KONFIG.SCORE_13 + cardTerm;

        if (isDangerous) score -= KONFIG.SCORE_14;

        if (!topCard) {
          score += KONFIG.SCORE_16;
          if (stockTop && cardToPlay.value === stockTop - 1) score += 50;
        } else if (cardToPlay.value < topCard.value) {
          score += KONFIG.SCORE_17;
          if (stockTop && cardToPlay.value === stockTop - 1) score += 50;
        }

        if (topCard && cardToPlay.value === topCard.value - 1) score += KONFIG.SCORE_15;

        if (KONFIG.SCORE_18 > 0 && topCard && cardToPlay.type !== 'joker') {
          if (cardToPlay.value === topCard.value + 1) score += KONFIG.SCORE_18;
        }

        if (stockTop && cardToPlay.value === stockTop + 1) score += 300;

        score -= pile.length * KONFIG.SCORE_19;

        const helpsOpponent = pile.some(c => opponentCritical.includes(c.value));
        if (helpsOpponent) {
          const criticalPenalty = human.stock.length <= 5 ? 3000 : 0;
          score -= KONFIG.SCORE_20 + criticalPenalty;
          if (human.stock.length < 5) score -= KONFIG.SCORE_20;
        }

        const jokerProtect = AI.Analysis.jokerProtectDiscard(i);
        if (jokerProtect.protect) score -= jokerProtect.penalty;

        if (score > bestScore) {
          bestScore        = score;
          bestDiscardIndex = i;
          bestHandIndex    = h;
        }
      }
    }

    if (bestHandIndex >= 0 && bestDiscardIndex >= 0) {
      const cardToPlay  = handCards[bestHandIndex];
      const isDangerous = opponentCritical.includes(cardToPlay.value);
      const cardLabel   = cardToPlay.type === 'joker' ? '★' : cardToPlay.value;

      this.say('aiPickDiscard', cardLabel);
      await Clock.pause(0.5);
      if (this.over()) return;

      if (Rules.playToDiscard(player, 'hand', bestHandIndex, bestDiscardIndex)) {
        this.say('aiDiscard', cardLabel, bestDiscardIndex + 1);
        await Clock.pause(1);
        this.note('discardStrategy', {
          cardValue:       cardToPlay.value,
          wasDangerous:    isDangerous,
          stockFollowup:   stockTop && cardToPlay.value === stockTop + 1,
          createdSequence: discards[bestDiscardIndex]?.slice(-1)[0]?.value
        });
        if (this.over()) return;
      } else {
        this.say('aiDiscardFailed');
        await Clock.pause(1);
      }
    } else {
      this.say('aiDiscardFailed');
      await Clock.pause(1);
    }
  }
};
