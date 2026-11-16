// ================================================================
//  ai-turn.js  –  Skipo 7.0.5   Namensraum: AI
//  KI-RUNDENABLAUF
// ----------------------------------------------------------------
//  Braucht: KONFIG, KI_PLANNER, KI_STUFEN, Settings, State, Rules,
//           Events, I18n, Clock + AI.Planner / AI.Eval / AI.Analysis
//  Bietet:  AI.takeTurn()  (+ Hilfen für die Unter-Namensräume)
//
//  Drei Phasen:
//    prepare()      – Ziehen, Gegner-Vorhersage, Blockade-Marker
//    executeMoves() – Joker im Stock, Zugketten-Planer, Heuristik
//    finish()       – Joker am Zugende, GENAU EINE Ablage, Nachziehen
//
//  Kein DOM. Die KI spricht nur über Ereignisse (msg, ai:predict)
//  und Rules-Aufrufe. Der Spielerwechsel gehört Flow.
//
//  Wächter: AI.over() ist an JEDER Stelle die Frage „darf ich noch?"
//  (Spiel beendet oder Sieger steht fest). AI.busy verhindert
//  parallele Starts (Geister-KI).
//
//  Stufen: AI.taktik() liefert den Wertesatz der gewählten
//  Schwierigkeit (KI_STUFEN) – null bei „Leicht" (keine Blockade).
//  In „Profi" wählt discard() die Ablage per Vorausspielen (AI.Look).
// ================================================================

const AI = {
  busy: false,

  /** Zug beendet? (Spiel vorbei oder Sieger steht fest) */
  over() {
    return State.turn.over || Rules.winner() !== null;
  },

  /** Taktik-Werte der gewählten Schwierigkeit; null = „Leicht" (ohne Blockade). */
  taktik() {
    const t = KI_STUFEN[Settings.level];
    return t === undefined ? KI_STUFEN.hard : t;
  },

  /** KI-Planung „Normal": Die KI kennt vom eigenen Stock nur die oberste Karte. */
  fairStock() {
    return Settings.planning === 'normal';
  },

  /**
   * Karten des eigenen Stocks, mit denen die KI rechnen darf:
   * „Superstark" alle (auch die verdeckten), „Normal" nur die oberste.
   * JEDE Stelle der KI, die mehr als die oberste Stockkarte braucht, fragt hier.
   */
  knownStock() {
    const stock = State.player('ai').stock;
    return this.fairStock() ? stock.slice(-1) : stock;
  },

  /** Statusmeldung (Schlüssel + Werte). */
  say(key, ...args) { I18n.say(key, ...args); },

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

  /** Kompletter KI-Zug. Kehrt zurück, wenn die KI fertig ist; den Wechsel zum Spieler macht Flow. */
  async takeTurn() {
    if (this.over()) return;
    if (this.busy) { console.warn('AI: zweiter Start ignoriert'); return; }
    this.busy = true;
    try {
      await this.prepare();
      if (this.over()) return;

      await this.executeMoves();
      if (this.over()) return;

      await this.finish();
    } finally {
      this.busy = false;
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

    const enemy = AI.Analysis.predictEnemyStock('human');

    this.say('aiAnalyze');
    await Clock.pause(0.5);

    // Blockade-Marker: Baustapel, deren oberste Karte dem erwarteten Gegnerwert entspricht
    const piles = [];
    State.game.buildPiles.forEach((pile, i) => {
      if (pile.slice(-1)[0]?.value === enemy.nextExpected) piles.push(i);
    });
    Events.emit('ai:predict', { piles, value: enemy.nextExpected, confidence: enemy.confidence });
  },

  /** Sofort-Nachziehen-Regel: Hand leer → 5 neue Karten, weiterspielen. */
  async redrawIfHandEmpty() {
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
   * Alle möglichen Bauzüge ausführen. Spielt die Stock-Priorität eine
   * Stockkarte, beginnt die Runde von vorn (neue Stockkarte → neu planen),
   * OHNE nachzuziehen. Höchstens 16 Runden als Sicherheitsgrenze.
   */
  async executeMoves() {
    for (let i = 0; i < 16; i++) {
      const again = await this.moveRound();
      if (!again || this.over()) return;
    }
  },

  /** Eine Runde: Stock-Joker → Planer → Kandidatenschleife. @returns true = Runde neu beginnen */
  async moveRound() {
    let moveCount = 0;
    const ai      = State.player('ai');

    // ── Joker oben im Stock zuerst analysieren ────────────────────
    const stockTop = ai.stock.slice(-1)[0];
    if (stockTop && stockTop.type === 'joker') {
      const d = AI.Analysis.jokerStockTop(stockTop);
      if (d && d.shouldPlay) {
        this.say('aiJokerStock', d.targetPile + 1, this.reasonText(d.reason));
        await Clock.pause(1.0);
        if (this.over()) return false;
        if (Rules.playToBuild('ai', 'stock', 0, d.targetPile)) {
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

    // ── Kandidatenschleife: jeden weiteren erlaubten Zug spielen ──
    while (!this.over()) {
      this.say('aiCompute');
      await Clock.pause(0.5);

      const candidates = AI.Eval.candidates('ai');     // sortiert, bester zuerst
      if (candidates.length === 0) {
        await this.stockFallback();
        return false;
      }
      const best = candidates[0];

      if (await this.stockPriority(best)) return true;

      if (!(await this.playBest(best))) return false;
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
    }
    return false;
  },

  /** Kein Kandidat mehr: Stockkarte direkt legen, falls sie doch passt (seltener Rest des Planers). */
  async stockFallback() {
    const stockCard = State.player('ai').stock.slice(-1)[0];
    if (!stockCard) return;
    const pile = State.game.buildPiles.findIndex((p, j) => Rules.isValidBuild(stockCard, j));
    if (pile === -1) return;

    this.say('aiStockPlay', stockCard.value, pile + 1);
    await Clock.pause(1.2);
    if (this.over()) return;
    Rules.playToBuild('ai', 'stock', 0, pile);
  },

  /** Besten Kandidaten spielen. */
  async playBest(best) {
    this.say('aiBuild', this.cardLabel(best.card), this.srcLabel(best.sourceType, best.sourceIndex),
             best.buildPileIndex + 1, best.score);
    await Clock.pause(1.2);
    if (this.over()) return false;
    return Rules.playToBuild('ai', best.sourceType, best.sourceIndex, best.buildPileIndex) === true;
  },

  /**
   * Stockkarte bevorzugen, wenn sie denselben Wert wie der beste Kandidat hat.
   * @returns {boolean} true = Stockkarte gespielt → Runde neu beginnen
   */
  async stockPriority(best) {
    const stock     = State.player('ai').stock;
    const stockCard = stock.length > 0 ? stock[stock.length - 1] : null;
    if (!stockCard) return false;
    if (best.sourceType === 'stock') return false;
    if (stockCard.type === 'joker') return false;
    if (stockCard.value !== best.card.value) return false;

    this.say('aiStockPrio', stockCard.value, best.buildPileIndex + 1);
    await Clock.pause(1.2);
    if (this.over()) return false;

    Rules.playToBuild('ai', 'stock', 0, best.buildPileIndex);
    return true;
  },

  // ----------------------------------------------------------------
  // PHASE 3 – ABSCHLUSS
  // ----------------------------------------------------------------

  /**
   * Zugende. Hat die KI noch einen Joker in der Hand:
   *   Schwer        – Joker bleibt in der Hand (nur Ablage+Joker-Kombination wird gespielt)
   *   Mittel/Leicht – Joker wird gespielt, wenn Folgekarten bereitliegen
   * Danach in JEDER Stufe genau eine Ablage, dann Nachziehen.
   */
  async finish() {
    if (this.over()) return;
    const ai = State.player('ai');

    if (ai.hand.length > 0) {
      this.say('aiDiscarding');
      await Clock.pause(1);

      const T        = this.taktik();
      const jokerIdx = ai.hand.findIndex(c => c.type === 'joker');
      let d = jokerIdx !== -1 ? AI.Analysis.jokerHand(jokerIdx) : null;
      if (d && d.action === 'buildDirect' && T && T.JOKER_KEEP) d = null;

      if (d && d.action === 'buildCombo') {
        // Erst die Ablagekarte spielen, dann den Joker
        this.say('aiJokerCombo', d.discardIndex + 1, d.targetPile + 1);
        if (Rules.playToBuild('ai', 'discard', d.discardIndex, d.targetPile)) {
          await Clock.pause(0.8);
          if (this.over()) return;
          const jNow = ai.hand.findIndex(c => c.type === 'joker');
          if (jNow !== -1 && Rules.playToBuild('ai', 'hand', jNow, d.targetPile)) {
            this.say('aiJokerDone', d.targetPile + 1);
            await Clock.pause(0.5);
            if (this.over()) return;
          }
        }
      } else if (d && d.action === 'buildDirect') {
        this.say('aiJokerDirect', d.targetPile + 1);
        if (Rules.playToBuild('ai', 'hand', jokerIdx, d.targetPile)) {
          await Clock.pause(0.5);
          if (this.over()) return;
        }
      }
      await this.discard();
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
  // ABLEGEN
  // ----------------------------------------------------------------

  /**
   * Beste Handkarte auf den besten Ablagestapel legen (genau eine Karte).
   * Bewertet alle Handkarten × 4 Stapel: Karten-Term (welche Karte) + Stapel-Term (wohin).
   */
  async discard() {
    if (this.over()) return;
    const me = State.player('ai');
    if (me.hand.length === 0) {
      this.say('aiNoHandToDiscard');
      await Clock.pause(1);
      return;
    }

    const human = State.player('human');
    const opponentVisible = [
      human.stock.slice(-1)[0]?.value,
      ...human.discards.map(p => p[p.length - 1]?.value)
    ].filter(v => v !== undefined);
    const criticalNumbers = AI.Eval.opponentCritical();

    const stockTop   = me.stock.length > 0 ? me.stock[me.stock.length - 1].value : null;
    const handCards  = me.hand;
    const discards   = me.discards;
    const comboCache = AI.Analysis.handComboCache('ai');

    const T         = this.taktik();
    const useful    = (T && T.DISC_KEEP_USEFUL) ? AI.Analysis.usefulForStock() : null;
    const keepJoker = !!(T && T.JOKER_KEEP) && handCards.some(c => c.type !== 'joker');

    let bestDiscardIndex = -1, bestHandIndex = -1, bestScore = -Infinity;
    const options = [];                      // alle Möglichkeiten (für das Vorausspielen in „Profi")

    for (let h = 0; h < handCards.length; h++) {
      const card        = handCards[h];
      const isDangerous = opponentVisible.includes(card.value);

      // ── Karten-Term (unabhängig vom Zielstapel) ──
      let cardTerm = 0;
      if (card.type === 'joker') cardTerm -= KONFIG.SCORE_33;
      if (stockTop && card.type !== 'joker') {
        const dist = Math.abs(card.value - stockTop) * KONFIG.SCORE_38;
        if (!isNaN(dist) && isFinite(dist)) cardTerm -= dist;
      }
      if (criticalNumbers.includes(card.value + 1)) cardTerm -= KONFIG.SCORE_37;
      if (comboCache[h] > 0) cardTerm -= KI_PLANNER.DISCARD_KEEP_COMBO_MALUS;
      if (keepJoker && card.type === 'joker') continue;                 // Schwer: Joker nie ablegen
      if (T && card.type !== 'joker') {
        // Schwer: Karte auf dem Weg zur eigenen Stockkarte behalten, doppelte zuerst ablegen
        if (useful) cardTerm -= T.DISC_KEEP_USEFUL * useful(parseInt(card.value, 10));
        if (T.DISC_DUP && handCards.filter(c => c.type !== 'joker' && c.value === card.value).length >= 2) cardTerm += T.DISC_DUP;
      }

      // ── Stapel-Term ──
      for (let i = 0; i < discards.length; i++) {
        const pile    = discards[i];
        const topCard = pile.length > 0 ? pile[pile.length - 1] : null;
        let score     = cardTerm;

        if (isDangerous) score -= KONFIG.SCORE_14;

        if (!topCard) {
          score += KONFIG.SCORE_16;
          if (stockTop && card.value === stockTop - 1) score += 50;
        } else if (card.value < topCard.value) {
          score += KONFIG.SCORE_17;
          if (stockTop && card.value === stockTop - 1) score += 50;
        }

        if (topCard && card.value === topCard.value - 1) score += KONFIG.SCORE_15;

        if (KONFIG.SCORE_18 > 0 && topCard && card.type !== 'joker') {
          if (card.value === topCard.value + 1) score += KONFIG.SCORE_18;
        }

        if (stockTop && card.value === stockTop + 1) score += 300;

        score -= pile.length * KONFIG.SCORE_19;

        const helpsOpponent = pile.some(c => opponentVisible.includes(c.value));
        if (helpsOpponent) {
          const criticalPenalty = human.stock.length <= 5 ? 3000 : 0;
          score -= KONFIG.SCORE_20 + criticalPenalty;
          if (human.stock.length < 5) score -= KONFIG.SCORE_20;
        }

        // Joker oben auf der Ablage nicht verdecken
        if (topCard && topCard.type === 'joker') score -= KONFIG.JOKER_PROTECT_DISCARD_PENALTY;

        options.push({ h, i, score, key: (card.type === 'joker' ? 'J' : card.value) + '>' +
                       (topCard ? (topCard.type === 'joker' ? 'J' : topCard.value) + ':' + pile.length : 'leer') });
        if (score > bestScore) {
          bestScore        = score;
          bestDiscardIndex = i;
          bestHandIndex    = h;
        }
      }
    }

    // Profi: die besten Möglichkeiten vorausspielen und die mit dem besten Durchschnitt nehmen
    if (T && T.LOOK_OPTIONS > 1 && !AI.Look.active && options.length > 1) {
      options.sort((a, b) => b.score - a.score);          // stabil: die heuristische Wahl bleibt vorn
      const seen = new Set(), top = [];
      for (const o of options) {
        if (seen.has(o.key)) continue;                    // gleiche Karte auf gleichartigen Stapel nur einmal
        seen.add(o.key); top.push(o);
        if (top.length >= T.LOOK_OPTIONS) break;
      }
      const k = await AI.Look.choose(top, o => Rules.playToDiscard('ai', 'hand', o.h, o.i),
                                     { samples: T.LOOK_SAMPLES, depth: T.LOOK_DEPTH, ms: T.LOOK_MS });
      if (this.over()) return;
      bestHandIndex = top[k].h; bestDiscardIndex = top[k].i;
    }

    if (bestHandIndex >= 0 && bestDiscardIndex >= 0) {
      const card      = handCards[bestHandIndex];
      const cardLabel = card.type === 'joker' ? '★' : card.value;

      this.say('aiPickDiscard', cardLabel);
      await Clock.pause(0.5);
      if (this.over()) return;

      if (Rules.playToDiscard('ai', 'hand', bestHandIndex, bestDiscardIndex)) {
        this.say('aiDiscard', cardLabel, bestDiscardIndex + 1);
        await Clock.pause(1);
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
