// ================================================================
//  ai.js  –  Skip-Bo Mobile  (Modul 10 + 11 + 12 + 13 + 14)
//  KOMPLETTE KI: Steuerung, Zugketten-Planer, Scoring, Analyse,
//  Joker-Strategie & Ablage-Tiefenanalyse
// ----------------------------------------------------------------
//  Modul 10: KI-Steuerung / Rundenablauf (aiTurn ...)
//  Modul 11: Zugketten-Planer (Tiefensuche, Herzstueck v6.6.0)
//  Modul 12: Bewertung & Scoring (getunte Heuristik, nutzt KONFIG)
//  Modul 13: Analyse & Gegner-Vorhersage
//  Modul 14: Joker-Strategie, Hand-Ketten, Ablage-Tiefenanalyse
//  Enthaelt den Waechter 'let aiTurnActive' (Schutz vor Geister-KI).
//  Wird per <script src=...ai.js> VOR dem Haupt-Script geladen.
// ================================================================

// ================================================================
// MODUL 10 – KI-STEUERUNG (RUNDENABLAUF DER KI)
// ================================================================
// Steuert den kompletten KI-Zug in 3 Phasen:
//   Phase 1: aiTurn_prepare()      – Ziehen, Analyse, Blockade-Overlay
//   Phase 2: aiTurn_executeMoves() – Alle Bauzüge (Planer + Heuristik)
//   Phase 3: aiTurn_finish()       – Pflicht-Ablegen, Spielerwechsel
//
// NEU v6.6.0 gegenüber v6.5.9:
//   • Zugketten-Planer (Modul 11) läuft VOR der Score-Heuristik
//   • Sofort-Nachziehen bei leerer Hand (offizielle Skip-Bo-Regel,
//     der menschliche Spieler hatte das bereits – die KI nicht!)
//   • playInDiscardPiles bewertet jetzt ALLE Handkarten × 4 Stapel
//     (v6.5.9 legte stur die LETZTE Handkarte ab)
//   • executeStockAttack: reduce-Bug repariert (gab bei 2+ Kandidaten
//     eine Zahl statt eines Karten-Objekts zurück → Crash-Risiko)
//   • missedStock wird endlich getrackt (KONFIG.DEBUG_45 existierte
//     nie → Tuner-Wert "Verpasste Stockzüge" blieb immer 0)
//   • Tote DEBUG_J3-Reste entfernt (schluckten im Original die
//     komplette Joker-Kombo-Ausführung in aiTurn_finish)
// ================================================================

/**
 * aiTurn(rekursionstiefe) – Haupteinstieg für den KI-Zug.
 * Drei Phasen: Vorbereitung → Zugschleife → Abschluss.
 * @param {number} rekursionstiefe – Schutz gegen Endlos-Rekursion (max. 15)
 */
/**
 * aiTurnActive – Wurzel-Wächter gegen parallele KI-Zugstränge.
 * FIX 11.6.2026: Schützt zusätzlich zum stockPriority-Fix (unten) davor,
 * dass je zwei aiTurn(0)-Ketten gleichzeitig laufen – egal aus welchem
 * Auslöser. Ein zweiter Wurzelstart wird ignoriert und geloggt.
 */
let aiTurnActive = false;

async function aiTurn(rekursionstiefe = 0) {
  // Sicherheitsprüfungen
  if (isGameOver) return;
  if (rekursionstiefe === 0) {
    if (aiTurnActive) {
      console.warn('⚠️ aiTurn: Zweiter Wurzelstart ignoriert (Zug läuft bereits)');
      return;
    }
    aiTurnActive = true;
  }
  try {
    if (rekursionstiefe > 15) {
      console.warn('⚠️ aiTurn: Max. Rekursionstiefe (15) erreicht – Spielerwechsel erzwungen');
      await switchPlayer();
      return;
    }

    // Phase 1: Vorbereitung
    await aiTurn_prepare();
    if (isGameOver) return;

    // Phase 2: Zugschleife (alle möglichen Züge ausführen)
    // FIX 11.6.2026 (kritisch – „Baustapel plötzlich leer"): Liefert true,
    // wenn ein Stock-Prioritätszug den Zug REKURSIV neu gestartet hat. Der
    // rekursive Lauf erledigt Abschluss & Spielerwechsel dann SELBST – der
    // alte Code lief hier trotzdem in aiTurn_finish() weiter, wodurch ZWEI
    // KI-Stränge parallel spielten: Der Spieler war scheinbar am Zug,
    // während der Geister-Strang im Hintergrund weiter Karten legte
    // (z. B. eine 12 → Baustapel wurde unter der Hand geleert).
    const restarted = await aiTurn_executeMoves(rekursionstiefe);
    if (restarted || isGameOver) return;

    // Phase 3: Abschluss (Ablegen, Nachziehen, Wechseln)
    await aiTurn_finish();
  } finally {
    if (rekursionstiefe === 0) aiTurnActive = false;
  }
}

/**
 * clearAiPredictionMarkers() – Blockade-Markierungen sicher entfernen.
 *
 * FIX 10.6.2026 (kritisch): Die Klasse 'ai-prediction-overlay' sitzt auf
 * dem BAUSTAPEL-DIV selbst (für den Glow-Rahmen). Das alte Aufräumen per
 * querySelectorAll(...).forEach(el => el.remove()) hat deshalb das ganze
 * Baustapel-FELD aus dem DOM gelöscht – nach jeder Markierung verschwand
 * ein Feld dauerhaft, bis keines mehr übrig war. In v6.5.9 blieb das
 * unsichtbar, weil die defekte Gegner-Vorhersage praktisch nie ein
 * Overlay setzte; mit der reparierten predictEnemyStock() trat der
 * latente Fehler regelmäßig auf.
 * Jetzt: strategy-tags (eigene Kind-DIVs) werden entfernt, von Trägern
 * der Overlay-Klasse wird NUR die Klasse genommen – das Feld bleibt.
 */
function clearAiPredictionMarkers() {
  document.querySelectorAll('.strategy-tag').forEach(el => el.remove());
  document.querySelectorAll('.ai-prediction-overlay').forEach(el => {
    el.classList.remove('ai-prediction-overlay');
  });
}

/**
 * aiTurn_prepare() – KI-Vorbereitung: Karten ziehen, Vorhersage, Overlays setzen.
 */
async function aiTurn_prepare() {
  // Handkarten auffüllen
  drawCardsUntilFive('ai');
  showMessage('🤖 KI bereitet Zug vor...');
  await pauseForSeconds(0.8);
  if (isGameOver) return;

  // Gegner-Vorhersage berechnen
  const enemyAnalysis = predictEnemyStock('human');
  const priorities    = calculateDynamicPriorities();

  showMessage('🔍 KI analysiert Spielfeld...');
  await pauseForSeconds(0.5);

  // Blockade-Overlays auf Baustapeln anzeigen
  // (vorher alte Marker sicher räumen – wichtig bei rekursiven aiTurn-Aufrufen)
  clearAiPredictionMarkers();
  Game.buildPiles.forEach((pile, i) => {
    const element = document.querySelector(`.build-pile:nth-child(${i + 1})`);
    if (!element) return;
    if (pile.slice(-1)[0]?.value === enemyAnalysis.nextExpected) {
      element.classList.add('ai-prediction-overlay');
      const tag       = document.createElement('div');
      tag.className   = 'strategy-tag';
      tag.textContent = `⛔ Blockade ${enemyAnalysis.nextExpected} (${Math.round(enemyAnalysis.confidence * 100)}%)`;
      element.appendChild(tag);
    }
  });

  // Gezielte Stock-Attacke wenn hohe Konfidenz
  if (enemyAnalysis.confidence > 0.6 && enemyAnalysis.nextExpected) {
    try {
      showMessage(`⚔️ KI plant Blockade gegen Wert ${enemyAnalysis.nextExpected}...`);
      await executeStockAttack(enemyAnalysis.nextExpected);
      if (isGameOver) return;
      updateView(); // Spielfeld sofort aktualisieren nach Stock-Attack
      await pauseForSeconds(0.3);
    } catch (e) {
      console.error('Stock-Attack Fehler:', e);
    }
  }
}

/**
 * aiTurn_redrawIfHandEmpty() – NEU v6.6.0: Sofort-Nachziehen-Regel.
 * Offizielle Skip-Bo-Regel: Wer alle 5 Handkarten innerhalb eines Zuges
 * auf Baustapel spielt, zieht SOFORT 5 neue und spielt weiter.
 * Der menschliche Spieler hatte diese Regel bereits (handleCardPlace),
 * die KI bekam sie nie – ein klarer Nachteil, jetzt behoben.
 * @returns {boolean} true wenn nachgezogen wurde (Hand war leer)
 */
async function aiTurn_redrawIfHandEmpty() {
  if (!KI_PLANNER.REDRAW_ON_EMPTY_HAND) return false;
  if (isGameOver) return false;
  if (Game.players.ai.hand.length > 0) return false;
  if (Game.drawPile.length === 0) return false;

  showMessage('🃏 KI hat alle Handkarten gespielt – zieht 5 neue!');
  await pauseForSeconds(0.8);
  if (isGameOver) return false;
  drawCardsUntilFive('ai');
  updateView();
  return true;
}

/**
 * aiTurn_executeMoves(rekursionstiefe) – KI-Zugschleife.
 * Führt alle möglichen Züge aus bis keine mehr möglich sind.
 * Ablauf v6.6.0:
 *   1. Joker im Stock analysieren (wie v6.5.5)
 *   2. NEU: Zugketten-Planer (garantierte Stock-/Hand-Clear-Ketten)
 *   3. Getunte Kandidatenschleife (Score-Heuristik, wie v6.5.9)
 *      – nach jedem Zug: Sofort-Nachziehen-Check, danach erneut Planer
 * Nach jedem Einzelzug: updateView() + kurze Pause (Züge sichtbar machen).
 * @param {number} rekursionstiefe – Weitergabe für möglichen Rekursionsaufruf
 */
async function aiTurn_executeMoves(rekursionstiefe) {
  // Rückgabe: true = Zug wurde rekursiv neu gestartet (kein finish mehr nötig)
  let kein_zug_mehr = 0;
  let moveCount     = 0;
  let score         = 0;

  // ── Joker im Stock zuerst analysieren (v6.5.5) ─────────────────
  // Wenn die oberste Stockkarte ein Joker ist, analysieren wir ob und wie
  // er gespielt werden soll – BEVOR die normale Kandidaten-Schleife läuft.
  // Stockabbau hat immer höchste Priorität, auch beim Joker.
  const stockTop = Game.players.ai.stock.slice(-1)[0];
  if (stockTop && stockTop.type === 'joker') {
    const jokerDecision = await joker_analyzeStockTop(stockTop);
    if (jokerDecision && jokerDecision.shouldPlay) {
      showMessage(`★ KI: Joker aus Stock → 🏗️ Bau ${jokerDecision.targetPile + 1} (${jokerDecision.reason})`);
      await pauseForSeconds(1.0);
      if (isGameOver) return;
      if (handleBuildPileDrop('ai', 'stock', 0, jokerDecision.targetPile)) {
        trackGameObservations('kiMove', {
          sourceType:     'stock',
          cardValue:      '★',
          cardType:       'joker',
          buildPileIndex: jokerDecision.targetPile,
          score:          KONFIG.JOKER_STOCK_COMBO_BONUS
        });
        moveCount++;
        updateView();
        await pauseForSeconds(0.5);
        if (checkForWinner()) return false;
      }
    } else if (jokerDecision) {
      showMessage(`★ KI: Joker im Stock wird aufgespart (${jokerDecision.reason})`);
    }
    if (isGameOver) return false;
  }
  // ── Ende Joker-im-Stock-Analyse ────────────────────────────────

  // ── NEU v6.6.0: Zugketten-Planer ───────────────────────────────
  // Sucht garantierte Zugketten (Stockabbau / Hand leeren) und führt
  // sie aus. Alles was der Planer nicht sicher lösen kann, übernimmt
  // danach wie bisher die getunte Score-Heuristik.
  moveCount += await planner_runChains();
  if (isGameOver) return false;
  // ── Ende Planer-Phase ──────────────────────────────────────────

  do {
    if (isGameOver) return false;
    showMessage('🧠 KI berechnet besten Zug...');
    await pauseForSeconds(0.5);

    const candidates = evaluateMoveCandidates('ai');

    if (candidates.length === 0) {
      const stockPlayed = await aiTurn_stockFallback(score);
      if (!stockPlayed) kein_zug_mehr = 1;
      break;
    }

    candidates.sort((a, b) => b.score - a.score);
    const best      = candidates[0];
    const stockCard = Game.players.ai.stock.length > 0
      ? Game.players.ai.stock[Game.players.ai.stock.length - 1]
      : null;

    const didStockPriority = await aiTurn_stockPriority(best, stockCard, rekursionstiefe, score);
    if (didStockPriority) return true;   // Rekursion übernimmt finish + Spielerwechsel

    const moved = await aiTurn_playBestCandidate(best, score);
    if (!moved) {
      kein_zug_mehr = 1;
      break;
    }
    moveCount++;

    updateView();
    setupTouchEvents();

    // NEU v6.6.0: Hand leer? → sofort nachziehen und erneut planen
    if (await aiTurn_redrawIfHandEmpty()) {
      moveCount += await planner_runChains();
      if (isGameOver) return false;
    }

    if (moveCount >= 2) {
      showMessage(`🔄 KI Kombinationszug #${moveCount} – ${best.card.type === 'joker' ? '★ Joker' : best.card.value}`);
      await pauseForSeconds(0.4);
    }

    await pauseForSeconds(1.0);

  } while (!kein_zug_mehr && !isGameOver);
  return false;
}

/**
 * aiTurn_stockFallback(score) – Fallback: Stockkarte direkt auf Baustapel legen.
 * Wird aufgerufen wenn evaluateMoveCandidates() keine Kandidaten liefert.
 * FIX v6.6.0: missedStock wird jetzt wirklich getrackt. Im Original stand
 * der Aufruf hinter "if (KONFIG.DEBUG_45)" – dieses Flag existiert in
 * KONFIG nicht, der Zweig war also tot und der Tuner-Wert
 * "Verpasste Stockzüge" blieb dauerhaft 0.
 * @param {number} score – Aktueller Score-Wert (für Debug)
 * @returns {boolean} true wenn Stockkarte gespielt wurde
 */
async function aiTurn_stockFallback(score) {
  const stockCard = Game.players.ai.stock.slice(-1)[0];
  if (!stockCard) return false;

  for (let j = 0; j < Game.buildPiles.length; j++) {
    if (!isValidBuildMove(stockCard, j)) continue;

    showMessage(`🗃️ KI legt Stockkarte ${stockCard.value} → 🏗️ Bau ${j + 1}`);
    await pauseForSeconds(1.2);
    if (isGameOver) return false;

    if (handleBuildPileDrop('ai', 'stock', 0, j)) {
      trackGameObservations('kiMove', {
        sourceType:     'stock',
        cardValue:      stockCard.value,
        cardType:       stockCard.type,
        buildPileIndex: j,
        score:          KONFIG.SCORE_24
      });
      updateView(); // Sofort sichtbar machen
      return true;
    }
    break;
  }

  // Stockkarte wäre spielbar gewesen, wurde aber nicht gespielt → tracken
  // (fließt in die Tuner-Auswertung "Verpasste Stockzüge" ein)
  if (Game.buildPiles.some((pile, j) => isValidBuildMove(stockCard, j))) {
    trackGameObservations('missedStock', { stockCardValue: stockCard.value });
  }
  return false;
}

/**
 * aiTurn_playBestCandidate(best, score) – Besten Kandidaten aus der Liste spielen.
 * Zeigt detaillierte Statusmeldung und führt den Zug aus.
 * @param {Object} best – Bester Kandidat aus evaluateMoveCandidates()
 * @param {number} score – Aktueller Score-Wert (für Debug)
 * @returns {boolean} true wenn Zug erfolgreich
 */
async function aiTurn_playBestCandidate(best, score) {
  const sourceLabel = best.sourceType === 'hand'    ? `✋ Hand-${best.sourceIndex + 1}`
                    : best.sourceType === 'stock'   ? '🗃️ Stock'
                    : `🗑️ Ablage-${best.sourceIndex + 1}`;
  const cardLabel   = best.card.type === 'joker' ? '★ Joker' : `${best.card.value}`;

  showMessage(`🤖 KI: ${cardLabel} von ${sourceLabel} → 🏗️ Bau ${best.buildPileIndex + 1} (Score: ${best.score})`);

  await pauseForSeconds(1.2);
  if (isGameOver) return false;

  if (handleBuildPileDrop('ai', best.sourceType, best.sourceIndex, best.buildPileIndex)) {
    trackGameObservations('kiMove', {
      sourceType:     best.sourceType,
      cardValue:      best.card.value,
      cardType:       best.card.type,
      buildPileIndex: best.buildPileIndex,
      score:          best.score
    });
    return true;
  }
  return false;
}

/**
 * aiTurn_stockPriority(best, stockCard, rekursionstiefe, score) – Stockkarte priorisieren.
 * Wenn Stockkarte denselben Wert hat wie der beste Kandidat → Stock bevorzugen.
 * Löst rekursiven aiTurn-Aufruf aus wenn Stockkarte gespielt wurde.
 * @returns {boolean} true wenn Stockkarte gespielt wurde (rekursiver Neustart)
 */
async function aiTurn_stockPriority(best, stockCard, rekursionstiefe, score) {
  if (!stockCard) return false;
  if (best.sourceType === 'stock') return false; // Schon Stockkarte geplant
  if (stockCard.type === 'joker') return false;  // Joker im Stock nicht priorisieren
  if (stockCard.value !== best.card.value) return false; // Verschiedene Werte

  // Stockkarte hat gleichen Wert → Stock bevorzugen

  showMessage(`🗃️ KI priorisiert Stockkarte ${stockCard.value} → 🏗️ Bau ${best.buildPileIndex + 1}`);
  await pauseForSeconds(1.2);
  if (isGameOver) return false;

  if (handleBuildPileDrop('ai', 'stock', 0, best.buildPileIndex)) {
    trackGameObservations('kiMove', {
      sourceType:     'stock',
      cardValue:      stockCard.value,
      cardType:       stockCard.type,
      buildPileIndex: best.buildPileIndex,
      score:          KONFIG.SCORE_32
    });
    updateView(); // Sofort sichtbar machen
  }

  // Rekursiver Neustart für Folgezüge.
  // FIX 11.6.2026: MUSS awaited werden! Ohne await lief diese Rekursion
  // als unkontrollierter Parallel-Strang weiter, während der äußere Zug
  // bereits ablegte und zum Spieler wechselte (→ „Geister-KI" legte
  // Karten in den Spielerzug hinein, Baustapel verschwanden scheinbar).
  if (!isGameOver) await aiTurn(rekursionstiefe + 1);
  return true;
}

/**
 * aiTurn_finish() – KI-Abschluss: Ablegen, Nachziehen, Spielerwechsel.
 * Joker in Hand werden via joker_analyzeHandJoker() analysiert
 * (nur wenn KONFIG.JOKER_COMBO_ENABLED=true, sonst normales Ablegen).
 * FIX v6.6.0: Im Original standen vor der Kombo-Ausführung tote
 * "if (KONFIG.DEBUG_J3)"-Zeilen (Flag existiert nicht in KONFIG) –
 * sie schluckten die nachfolgende Anweisung, sodass der buildCombo-
 * Pfad nie korrekt lief. Jetzt sauber implementiert.
 */
async function aiTurn_finish() {
  if (isGameOver) return;

  // Karte auf Ablagestapel legen (Pflichtzug wenn Handkarten vorhanden)
  if (Game.players.ai.hand.length > 0) {
    showMessage('🤖 KI legt Karte auf Ablagestapel...');
    await pauseForSeconds(1);

    // ── Joker in Hand zuerst analysieren ───────────────────────────
    // Prüfe ob ein Joker in der Hand ist und analysiere den besten Einsatz.
    const jokerInHandIdx = Game.players.ai.hand.findIndex(c => c.type === 'joker');
    if (jokerInHandIdx !== -1 && KONFIG.JOKER_COMBO_ENABLED) {
      const jokerHandDecision = await joker_analyzeHandJoker(jokerInHandIdx);
      if (jokerHandDecision) {
        if (jokerHandDecision.action === 'buildCombo') {
          // Joker kann in Kombo mit Ablagekarte für Stockabbau genutzt werden:
          // Erst die Ablagekarte spielen, dann den Joker.
          showMessage(`★ KI: Joker-Kombo! Erst Ablage ${jokerHandDecision.discardIndex + 1}, dann Joker → Bau ${jokerHandDecision.targetPile + 1}`);
          if (handleBuildPileDrop('ai', 'discard', jokerHandDecision.discardIndex, jokerHandDecision.targetPile)) {
            updateView();
            await pauseForSeconds(0.8);
            // Dann Joker spielen
            if (isGameOver) return;
            const jokerNowIdx = Game.players.ai.hand.findIndex(c => c.type === 'joker');
            if (jokerNowIdx !== -1 && handleBuildPileDrop('ai', 'hand', jokerNowIdx, jokerHandDecision.targetPile)) {
              trackGameObservations('kiMove', {
                sourceType:     'hand',
                cardValue:      '★',
                cardType:       'joker',
                buildPileIndex: jokerHandDecision.targetPile,
                score:          KONFIG.JOKER_STOCK_COMBO_BONUS
              });
              showMessage(`★ KI: Joker → Bau ${jokerHandDecision.targetPile + 1} ✅`);
              updateView();
              await pauseForSeconds(0.5);
              if (checkForWinner()) return;
            }
          }
          // Nach Kombo normales Ablegen weiterführen
          await playInDiscardPiles('ai');
        } else if (jokerHandDecision.action === 'buildDirect') {
          // Joker direkt auf Baustapel legen
          showMessage(`★ KI: Joker direkt → 🏗️ Bau ${jokerHandDecision.targetPile + 1}`);
          if (handleBuildPileDrop('ai', 'hand', jokerInHandIdx, jokerHandDecision.targetPile)) {
            trackGameObservations('kiMove', {
              sourceType:     'hand',
              cardValue:      '★',
              cardType:       'joker',
              buildPileIndex: jokerHandDecision.targetPile,
              score:          KONFIG.JOKER_STOCK_COMBO_BONUS
            });
            updateView();
            await pauseForSeconds(0.5);
            if (checkForWinner()) return;
          }
          await playInDiscardPiles('ai');
        } else {
          // Joker sicher ablegen (action === 'discard'):
          // Erst normale Karte ablegen, dann Joker auf den Schutz-Stapel.
          showMessage(`★ KI: Joker sicher → 🗑️ Ablage ${jokerHandDecision.discardIndex + 1}`);
          await playInDiscardPiles('ai');
          if (isGameOver) return;
          const jokerNowIdx = Game.players.ai.hand.findIndex(c => c.type === 'joker');
          if (jokerNowIdx !== -1) {
            if (handleDiscardPileDrop('ai', 'hand', jokerNowIdx, jokerHandDecision.discardIndex)) {
              showMessage(`★ KI: Joker gesichert auf Ablage ${jokerHandDecision.discardIndex + 1}`);
              updateView();
              await pauseForSeconds(0.8);
              if (checkForWinner()) return;
            }
          }
        }
      } else {
        // Keine Joker-Entscheidung → normales Ablegen
        await playInDiscardPiles('ai');
      }
    } else {
      // Kein Joker in Hand oder JOKER_COMBO_ENABLED=false → normales Ablegen
      await playInDiscardPiles('ai');
    }
    // ── Ende Joker-in-Hand-Analyse ─────────────────────────────────

    updateView();
  } else {
    showMessage('ℹ️ KI hat keine Handkarten mehr – kein Pflichtablegen');
  }

  if (isGameOver) return;

  // Handkarten auffüllen falls nötig
  if (Game.players.ai.hand.length < 5) {
    showMessage('🃏 KI zieht Karten nach...');
    await pauseForSeconds(0.5);
    drawCardsUntilFive('ai');
  }

  if (isGameOver) return;

  // FIX 10.6.2026: Marker sicher entfernen – das alte el.remove() hat
  // die Baustapel-DIVs selbst gelöscht (Felder verschwanden dauerhaft).
  clearAiPredictionMarkers();

  showMessage('✅ KI beendet Zug – Spielerwechsel');
  await pauseForSeconds(0.5);
  updateView();
  switchPlayer();
}

/**
 * switchPlayer() – Spielerwechsel verwalten.
 * Wechselt currentPlayer und startet den nächsten Zug.
 */
async function switchPlayer() {
  if (isGameOver || checkForWinner()) return;

  if (currentPlayer === 'human') {
    currentPlayer = 'ai';
    showMessage('🤖 KI ist am Zug...');
    await pauseForSeconds(1.2);
    if (isGameOver) return;
    aiTurn(0);
  } else {
    currentPlayer = 'human';
    showMessage('👤 Dein Zug! – Karte auswählen');
    await pauseForSeconds(0.5);
    if (isGameOver) return;
    drawCardsUntilFive('human');
    setupTouchEvents();
    showMessage('✋ Wähle eine Karte aus deiner Hand, Stock oder Ablage');
    await pauseForSeconds(1.5);
  }
}

/**
 * executeStockAttack(targetValue) – Gezielter Angriff auf Gegner-Stockwert.
 * Versucht eine Karte zu spielen die den Gegner beim Stockabbau blockiert.
 * FIX v6.6.0: Der Original-reduce hatte keinen Startwert und kombinierte
 * "||" mit Zahlen-Subtraktion – bei 2+ Kandidaten gab er eine ZAHL statt
 * eines Karten-Objekts zurück (bestCard.type → undefined → Crash-Risiko).
 * Jetzt: sauber sortieren (Nicht-Joker zuerst, dann höherer Wert) und [0].
 * @param {number} targetValue – Zielwert für den Angriff
 * @returns {boolean} true wenn Angriff erfolgreich
 */
async function executeStockAttack(targetValue) {
  if (isGameOver) return false;
  try {
    // Gültige Baustapel finden (targetValue - 1 muss oben liegen)
    const validPiles = Game.buildPiles
      .map((pile, i) => ({ index: i, current: pile.slice(-1)[0]?.value || 0 }))
      .filter(pile => targetValue === 1 ? pile.current === 0 : pile.current === targetValue - 1);

    if (validPiles.length === 0) return false;
    const bestPile = validPiles.reduce((a, b) => a.current < b.current ? a : b);

    // Passende Karte finden (exakter Wert oder Joker)
    const validCards = [
      ...Game.players.ai.hand.map((c, i) => ({ card: c, type: 'hand', index: i })),
      { card: Game.players.ai.stock.slice(-1)[0], type: 'stock', index: 0 }
    ].filter(({ card }) => card && (card.value === targetValue || card.type === 'joker'));

    if (validCards.length === 0) return false;

    // Nicht-Joker bevorzugen (Joker schützen), darunter höheren Wert zuerst
    validCards.sort((a, b) =>
      ((a.card.type === 'joker' ? 1 : 0) - (b.card.type === 'joker' ? 1 : 0)) ||
      ((b.card.value === '★' ? 0 : b.card.value) - (a.card.value === '★' ? 0 : a.card.value))
    );
    const bestCard = validCards[0];

    const result = handleBuildPileDrop('ai', bestCard.type, bestCard.index, bestPile.index);
    return result === true;
  } catch (e) {
    console.error('executeStockAttack Fehler:', e);
    return false;
  }
}

/**
 * playInDiscardPiles(player) – KI legt eine Karte auf den besten Ablagestapel.
 *
 * NEU v6.6.0 – größte Einzelverbesserung der Ablage-Logik:
 * v6.5.9 legte IMMER die LETZTE Handkarte ab und bewertete nur, auf
 * WELCHEN Stapel sie kommt. Jetzt werden ALLE Handkarten × alle 4
 * Stapel kombiniert bewertet (max. 20 Kombinationen) – die KI wählt
 * also auch WELCHE Karte sie opfert.
 *
 * Der Stapel-Term ist wörtlich aus v6.5.9 übernommen (getunte Werte
 * SCORE_13…20, Joker-Schutz). Der Karten-Term stammt aus der alten
 * Auto-Auswahl in handleDiscardPileDrop (Vorzeichen gedreht, da dort
 * minimiert wurde):
 *   • Joker behalten          → −SCORE_33
 *   • Distanz zum Stockwert   → −|wert−stockTop| × SCORE_38
 *   • hilft Gegner (wert+1)   → −SCORE_37
 *   • NEU: Karte ist Teil einer Handkette → −DISCARD_KEEP_COMBO_MALUS
 *     (verhindert dass die KI ihre eigene Kettenplanung zerlegt)
 *
 * @param {string} player – 'human' oder 'ai'
 */
async function playInDiscardPiles(player) {
  if (isGameOver) return;
  if (Game.players[player].hand.length === 0) {
    showMessage('⚠️ Keine Handkarten zum Ablegen');
    await pauseForSeconds(1);
    return;
  }

  const opponentCritical = [
    Game.players.human.stock.slice(-1)[0]?.value,
    ...Game.players.human.discards.map(p => p[p.length - 1]?.value)
  ].filter(v => v !== undefined);

  const criticalNumbers = getOpponentCriticalNumbers();

  const stockTop    = Game.players[player].stock.length > 0
    ? Game.players[player].stock[Game.players[player].stock.length - 1].value
    : null;
  const handCards   = Game.players[player].hand;
  const discards    = Game.players[player].discards;

  // Handketten-Cache: welche Handkarten sind Teil einer spielbaren Kette?
  const comboCache = hand_cacheComboScores(player);

  let bestDiscardIndex = -1, bestHandIndex = -1, bestScore = -Infinity;
  let mainMoveSuccess  = false;

  // Jede Handkarte × jeden Ablagestapel bewerten
  for (let h = 0; h < handCards.length; h++) {
    const cardToPlay  = handCards[h];
    const isDangerous = opponentCritical.includes(cardToPlay.value);

    // ── Karten-Term (unabhängig vom Zielstapel) ──────────────────
    let cardTerm = 0;
    // Joker nicht leichtfertig opfern
    if (cardToPlay.type === 'joker') cardTerm -= KONFIG.SCORE_33;
    // Distanz zum eigenen Stockwert (nahe Karten behalten)
    if (stockTop && cardToPlay.type !== 'joker') {
      const dist = Math.abs(cardToPlay.value - stockTop) * KONFIG.SCORE_38;
      if (!isNaN(dist) && isFinite(dist)) cardTerm -= dist;
    }
    // Karte+1 ist für den Gegner kritisch → diese Karte lieber behalten?
    // Nein: im Original bestrafte SCORE_37 das ABLEGEN solcher Karten,
    // weil sie dem Gegner als Folgekarte auf Ablage sichtbar hilft.
    if (criticalNumbers.includes(cardToPlay.value + 1)) cardTerm -= KONFIG.SCORE_37;
    // NEU: Karte ist Startglied einer Handkette → behalten
    if (comboCache[h] > 0) cardTerm -= KI_PLANNER.DISCARD_KEEP_COMBO_MALUS;

    for (let i = 0; i < discards.length; i++) {
      const pile    = discards[i];
      const topCard = pile.length > 0 ? pile[pile.length - 1] : null;
      let score     = KONFIG.SCORE_13 + cardTerm;

      // Gefährliche Karten stark bestrafen
      if (isDangerous) {
        score -= KONFIG.SCORE_14;
      }

      // Leerer Stapel bevorzugen
      if (!topCard) {
        score += KONFIG.SCORE_16;
        if (stockTop && cardToPlay.value === stockTop - 1) score += 50;
      } else if (cardToPlay.value < topCard.value) {
        score += KONFIG.SCORE_17;
        if (stockTop && cardToPlay.value === stockTop - 1) score += 50;
      }

      // Sequenz-Bonus (SCORE_15)
      if (topCard && cardToPlay.value === topCard.value - 1) {
        score += KONFIG.SCORE_15;
      }

      // ── Ablage-Sequenz-Tiefe-Bonus (SCORE_18, v6.5.9) ────────────
      // Bonus wenn Karte eine bestehende Sequenz verlängert (± 1).
      // Ergänzt SCORE_15 – belohnt Sequenz-Aufbau auf Ablagestapeln
      // die später per Kombinationszug (Ablage→Bau) genutzt werden.
      if (KONFIG.SCORE_18 > 0 && topCard && cardToPlay.type !== 'joker') {
        if (cardToPlay.value === topCard.value + 1) {
          score += KONFIG.SCORE_18;
        }
      }
      // ── Ende Sequenz-Tiefe-Bonus ─────────────────────────────────

      // Stock-Folge-Bonus
      if (stockTop && cardToPlay.value === stockTop + 1) score += 300;

      // Große Stapel unattraktiv machen
      score -= pile.length * KONFIG.SCORE_19;
      // Gegnerhilfe stark bestrafen
      const helpsOpponent = pile.some(c => opponentCritical.includes(c.value));
      if (helpsOpponent) {
        const criticalPenalty = Game.players.human.stock.length <= 5 ? 3000 : 0;
        score -= KONFIG.SCORE_20 + criticalPenalty;
        if (Game.players.human.stock.length < 5) score -= KONFIG.SCORE_20;
      }

      // ── Joker-Schutz prüfen (v6.5.5) ─────────────────────────────
      // Wenn dieser Stapel einen Joker oben hat und JOKER_PROTECT_DISCARD=true,
      // bekommt er eine hohe Strafe damit die KI keine normale Karte drauflegt.
      const jokerProtect = joker_shouldProtectDiscard(i);
      if (jokerProtect.protect) {
        score -= jokerProtect.penalty;
      }
      // ── Ende Joker-Schutz ────────────────────────────────────────

      if (score > bestScore) {
        bestScore        = score;
        bestDiscardIndex = i;
        bestHandIndex    = h;
      }
    }
  }

  // Beste Ablage ausführen
  if (bestHandIndex >= 0 && bestDiscardIndex >= 0) {
    const cardToPlay  = handCards[bestHandIndex];
    const isDangerous = opponentCritical.includes(cardToPlay.value);
    const cardLabel   = cardToPlay.type === 'joker' ? '★' : cardToPlay.value;

    showMessage(`🤖 KI wählt Karte ${cardLabel} zum Ablegen`);
    await pauseForSeconds(0.5);
    if (isGameOver) return;

    if (handleDiscardPileDrop(player, 'hand', bestHandIndex, bestDiscardIndex)) {
      mainMoveSuccess = true;
      showMessage(`🤖 KI legt ${cardLabel} → 🗑️ Ablage ${bestDiscardIndex + 1}`);
      await pauseForSeconds(1);
      updateView(); // Sofort sichtbar machen
      trackGameObservations('discardStrategy', {
        cardValue:       cardToPlay.value,
        wasDangerous:    isDangerous,
        stockFollowup:   stockTop && cardToPlay.value === stockTop + 1,
        createdSequence: discards[bestDiscardIndex]?.slice(-1)[0]?.value
      });
      if (checkForWinner()) return;
    } else {
      showMessage('⚠️ Ablage fehlgeschlagen!');
      await pauseForSeconds(1);
    }
  } else {
    showMessage('⚠️ Ablage fehlgeschlagen!');
    await pauseForSeconds(1);
  }
  // Hinweis: Joker in Hand wird in aiTurn_finish() via joker_analyzeHandJoker() behandelt.
}

/**
 * evaluateAndSelectMove(player) – Besten Zug auswählen und ausführen.
 * Hilfsfunktion für direkten Aufruf (z.B. aus handleCardPlace).
 * @param {string} player – 'human' oder 'ai'
 * @returns {boolean} true wenn Zug erfolgreich
 */
async function evaluateAndSelectMove(player) {
  if (isGameOver) return false;
  const candidates = evaluateMoveCandidates(player);
  if (candidates.length === 0) return false;

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  showMessage(`🎯 ${player === 'ai' ? 'KI' : 'Spieler'}: Karte ${best.card.value} → Bau ${best.buildPileIndex + 1} (Score: ${best.score})`);
  await pauseForSeconds();
  if (isGameOver) return false;
  handleBuildPileDrop(player, best.sourceType, best.sourceIndex, best.buildPileIndex);
  updateView();
  return true;
}

// ================================================================
// MODUL 11 – KI-ZUGKETTEN-PLANER (NEU v6.6.0)
// ================================================================
// Das Herzstück der KI-Verbesserung: Eine Zustandssuche (Tiefensuche
// mit Besucht-Speicher), die GARANTIERTE Zugketten findet, bevor die
// getunte Score-Heuristik einzelne Züge bewertet.
//
// Zwei Suchziele:
//   1. STOCK-KETTE: Folge von Bauzügen die mindestens eine Stockkarte
//      spielt. Maximiert Stockabbau, spart Joker, kürzt die Kette nach
//      dem letzten Stock-Zug ab (Rest entscheidet die Heuristik).
//   2. HAND-CLEAR-KETTE: Folge die ALLE Handkarten auf Baustapel
//      spielt → KI darf sofort 5 neue ziehen (Skip-Bo-Regel).
//
// Die Heuristik (Module 12-14) bleibt vollständig erhalten und
// übernimmt alle Entscheidungen, die der Planer nicht sicher trifft.
// Konfiguration: KI_PLANNER-Block in Modul 02.
// ================================================================

/**
 * planner_snapshot() – Leichtgewichtigen Suchzustand aus dem Spiel erzeugen.
 * Joker werden als 0 codiert (Wert wird beim Spielen vom Stapel bestimmt).
 * Baustapel: effektiver Top-Wert 0-12; 12 wird beim Simulieren zu 0
 * (voller Stapel wird im echten Spiel geleert).
 * @returns {Object} { builds, hand, discs, stockLen, stockVals }
 */
function planner_snapshot() {
  const builds = Game.buildPiles.map(pile => {
    if (pile.length === 0) return 0;
    const top = pile[pile.length - 1];
    const v   = top.type === 'joker' ? getJokerValue(pile, pile.length - 1) : top.value;
    return v === 12 ? 0 : v;   // voller Stapel gilt als geleert
  });
  const hand = Game.players.ai.hand.map(c => c.type === 'joker' ? 0 : c.value);
  const discs = Game.players.ai.discards.map(pile =>
    pile.map(c => c.type === 'joker' ? 0 : c.value)
  );
  const stockVals = Game.players.ai.stock.map(c => c.type === 'joker' ? 0 : c.value);
  return { builds, hand, discs, stockLen: stockVals.length, stockVals };
}

/**
 * planner_hash(state, jokersUsed) – Eindeutiger Schlüssel für Besucht-Speicher.
 * Ablagestapel verändern sich nur durch pop() → ihre Länge genügt.
 * Stock ebenso (nur Top spielbar) → stockLen genügt.
 */
function planner_hash(st) {
  return st.builds.join(',') + '|' +
         st.hand.slice().sort((a, b) => a - b).join(',') + '|' +
         st.discs.map(d => d.length).join(',') + '|' +
         st.stockLen;
}

/**
 * planner_moves(st) – Alle legalen Bauzüge im Suchzustand erzeugen.
 * Reihenfolge = Such-Priorität: Stock → Ablage-Zahl → Hand-Zahl →
 * Hand-Joker → Ablage-Joker (Joker zuletzt = werden nur genutzt
 * wenn sie eine Kette wirklich ermöglichen).
 * @returns {Array} Zugliste [{src, val, pile, isJoker, fromStock, discIdx, ...}]
 */
function planner_moves(st) {
  const moves = [];
  const needed = st.builds.map(b => b + 1);   // 1-12 je Stapel

  // 1. Stockkarte (höchste Priorität)
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
    if (top === 0) continue;                  // Joker → Priorität 5
    for (let p = 0; p < 4; p++) {
      if (top === needed[p]) {
        moves.push({ src: 'discard', val: top, pile: p, isJoker: false, fromStock: false, discIdx: d });
      }
    }
  }
  // 3. Hand-Zahlenkarten (jeden Wert nur einmal anbieten)
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
}

/**
 * planner_apply(st, mv) – Zug auf Suchzustand anwenden (liefert NEUEN Zustand).
 */
function planner_apply(st, mv) {
  const next = {
    builds:    st.builds.slice(),
    hand:      st.hand.slice(),
    discs:     st.discs,            // wird nur bei discard-Zug kopiert
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
  } else { // discard
    next.discs = st.discs.slice();
    next.discs[mv.discIdx] = next.discs[mv.discIdx].slice(0, -1);
  }
  return next;
}

/**
 * planner_search(goal) – Tiefensuche nach der besten Zugkette.
 * @param {string} goal – 'stock' (Stockabbau maximieren) oder
 *                        'clear' (alle Handkarten spielen)
 * @returns {Object|null} { moves, stockPlays, jokers } oder null
 */
function planner_search(goal) {
  const start = planner_snapshot();
  if (goal === 'clear' && (start.hand.length === 0 || Game.drawPile.length === 0)) return null;

  const visited = new Map();     // hash → minimale jokersUsed
  let nodes = 0;
  let best  = null;              // { moves, stockPlays, jokers }

  function better(cand) {
    if (!best) return true;
    if (cand.stockPlays !== best.stockPlays) return cand.stockPlays > best.stockPlays;
    if (cand.jokers     !== best.jokers)     return cand.jokers     < best.jokers;
    return cand.moves.length < best.moves.length;
  }

  function dfs(st, path, jokers, stockPlays, lastStockAt) {
    if (nodes++ > KI_PLANNER.MAX_NODES) return;
    if (path.length >= KI_PLANNER.MAX_DEPTH) return;

    const key  = planner_hash(st);
    const prev = visited.get(key);
    if (prev !== undefined && prev <= jokers) return;
    visited.set(key, jokers);

    for (const mv of planner_moves(st)) {
      if (mv.isJoker && jokers >= KI_PLANNER.MAX_JOKERS_PER_CHAIN) continue;

      const nJokers = jokers + (mv.isJoker ? 1 : 0);
      const nStock  = stockPlays + (mv.fromStock ? 1 : 0);
      const nPath   = path.concat([mv]);
      const nLastSt = mv.fromStock ? nPath.length : lastStockAt;
      const next    = planner_apply(st, mv);

      if (goal === 'stock') {
        if (nStock > 0) {
          // Kette bis zum letzten Stock-Zug abschneiden – nur dieser
          // Teil ist garantiert sinnvoll, den Rest macht die Heuristik.
          const cut    = nPath.slice(0, nLastSt);
          const cutJok = cut.reduce((s, m) => s + (m.isJoker ? 1 : 0), 0);
          const cand   = { moves: cut, stockPlays: nStock, jokers: cutJok };
          if (better(cand)) best = cand;
        }
      } else { // goal === 'clear'
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
}

/**
 * planner_riskCheck(chain) – NEU: Hand-Clear-Kette auf Gegner-Risiko prüfen.
 * Eine Kette OHNE eigenen Stockabbau wird verworfen, wenn sie dem
 * Gegner (Stock ≤ RISK_OPP_STOCK_LIMIT) einen Baustapel freilegt,
 * auf den seine Stockkarte direkt passt – und dieser Stapel-Stand
 * VOR der Kette noch nicht existierte.
 * @returns {boolean} true = Kette ist sicher, false = verwerfen
 */
function planner_riskCheck(chain) {
  if (!KI_PLANNER.RISK_CHECK) return true;
  if (chain.stockPlays > 0)   return true;   // eigener Stockabbau wiegt Risiko auf

  const humanStock = Game.players.human.stock;
  if (humanStock.length > KI_PLANNER.RISK_OPP_STOCK_LIMIT) return true;
  const hTopCard = humanStock[humanStock.length - 1];
  if (!hTopCard) return true;
  const hTop = hTopCard.type === 'joker' ? null : hTopCard.value;
  if (hTop === null) return true;            // Gegner-Joker passt immer → Check sinnlos

  // Endzustand der Kette simulieren
  let st = planner_snapshot();
  const startsOpen = st.builds.some(b => b + 1 === hTop);
  for (const mv of chain.moves) st = planner_apply(st, mv);
  const endsOpen = st.builds.some(b => b + 1 === hTop);

  // Nur verwerfen wenn die Kette die Tür ERST aufmacht
  return !(endsOpen && !startsOpen);
}

/**
 * planner_runChains() – Plant und spielt Zugketten bis keine mehr existiert.
 * Reihenfolge je Durchlauf: erst Stock-Kette, dann Hand-Clear-Kette.
 * Nach jeder Kette: ggf. Sofort-Nachziehen → neue Hand → erneut planen.
 * @returns {number} Anzahl ausgeführter Einzelzüge
 */
async function planner_runChains() {
  if (!KI_PLANNER.ENABLED) return 0;
  let played = 0;
  let safety = 0;

  while (!isGameOver && safety < 12) {
    safety++;

    // Ziel 1: Stockabbau-Kette
    let chain = planner_search('stock');
    if (chain && chain.moves.length > 0) {
      showMessage(`🧠 KI plant Kettenzug: ${chain.moves.length} Züge, ${chain.stockPlays}× Stockabbau`);
      await pauseForSeconds(0.8);
      if (isGameOver) return played;
      const n = await planner_executeChain(chain);
      played += n;
      if (isGameOver) return played;
      if (n === 0) break;                    // Ausführung scheiterte → Heuristik übernimmt
      await aiTurn_redrawIfHandEmpty();
      continue;                              // erneut planen (neue Lage)
    }

    // Ziel 2: Hand komplett leeren (nur wenn Nachziehen möglich)
    if (KI_PLANNER.HAND_CLEAR_ENABLED) {
      chain = planner_search('clear');
      if (chain && chain.moves.length > 0 && planner_riskCheck(chain)) {
        showMessage(`🧠 KI plant Kettenzug: ${chain.moves.length} Züge – komplette Hand wird gespielt!`);
        await pauseForSeconds(0.8);
        if (isGameOver) return played;
        const n = await planner_executeChain(chain);
        played += n;
        if (isGameOver) return played;
        if (n === 0) break;
        await aiTurn_redrawIfHandEmpty();
        continue;
      }
    }

    break;                                   // keine Kette mehr gefunden
  }
  return played;
}

/**
 * planner_executeChain(chain) – Geplante Kette im echten Spiel ausführen.
 * Hand-Indizes werden zur LAUFZEIT per Wert gesucht (robust gegen
 * splice-Verschiebungen). Jeder Zug: Meldung, handleBuildPileDrop,
 * Tracking, updateView, Pause, Gewinn-Check.
 * @returns {number} Anzahl erfolgreich ausgeführter Züge
 */
async function planner_executeChain(chain) {
  let done = 0;
  const total = chain.moves.length;

  for (const mv of chain.moves) {
    if (isGameOver) return done;

    let srcType, srcIdx, card;
    if (mv.src === 'stock') {
      srcType = 'stock'; srcIdx = 0;
      card = Game.players.ai.stock.slice(-1)[0];
    } else if (mv.src === 'hand') {
      srcType = 'hand';
      srcIdx = mv.isJoker
        ? Game.players.ai.hand.findIndex(c => c.type === 'joker')
        : Game.players.ai.hand.findIndex(c => c.type !== 'joker' && c.value === mv.val);
      card = Game.players.ai.hand[srcIdx];
    } else {
      srcType = 'discard'; srcIdx = mv.discIdx;
      const pile = Game.players.ai.discards[mv.discIdx];
      card = pile[pile.length - 1];
    }
    if (!card || srcIdx === -1) { console.warn('Planner: Karte nicht gefunden', mv); return done; }

    const srcLabel  = srcType === 'stock' ? '🗃️ Stock'
                    : srcType === 'hand'  ? '✋ Hand'
                    : `🗑️ Ablage-${srcIdx + 1}`;
    const cardLabel = card.type === 'joker' ? `★ Joker (als ${mv.val})` : `${card.value}`;
    showMessage(`🤖 KI (Kette ${done + 1}/${total}): ${cardLabel} von ${srcLabel} → 🏗️ Bau ${mv.pile + 1}`);
    await pauseForSeconds(KI_PLANNER.CHAIN_MOVE_PAUSE);
    if (isGameOver) return done;

    if (!handleBuildPileDrop('ai', srcType, srcIdx, mv.pile)) {
      console.warn('Planner: Zug abgelehnt', mv);
      return done;
    }
    trackGameObservations('kiMove', {
      sourceType:     srcType,
      cardValue:      card.type === 'joker' ? '★' : card.value,
      cardType:       card.type,
      buildPileIndex: mv.pile,
      score:          mv.fromStock ? KONFIG.SCORE_24 : KONFIG.SCORE_5
    });
    done++;
    updateView();
    if (checkForWinner()) return done;
  }
  return done;
}

// ================================================================
// MODUL 12 – KI-BEWERTUNG & SCORING (GETUNTE HEURISTIK)
// ================================================================
// Das Herz der vom Tuner optimierten KI: Alle Bauzug-Kandidaten
// werden mit den KONFIG-SCORE-Parametern bewertet und sortiert.
// Die Formeln sind 1:1 aus v6.5.9 übernommen – jede Änderung würde
// die getunte Balance (Tuner-Phase 1, WR 65%) zerstören.
//
// Bereinigt in v6.6.0 (ohne Verhaltensänderung):
//   • Tote "if (KONFIG.DEBUG_40/41/42)"-Logs entfernt – diese Flags
//     existieren in KONFIG nicht, die Zweige liefen nie.
//   • SCORE_44 ("Nagel44"): wird wie im Original berechnet, aber
//     nirgends verwendet → ehrlich als wirkungslos dokumentiert.
//     (Der Tuner hat SCORE_44 mit-optimiert, der Wert hat aber
//     keinerlei Spieleinfluss. Bewusst NICHT "aktiviert", um die
//     getunte Balance nicht zu verschieben.)
//   • SCORE_49: Im Original feuerte der Abzug 10 ms NACH dem return
//     auf eine längst zurückgegebene lokale Variable → wirkungslos.
//     v6.6.0 bildet exakt dieses Verhalten ab: Flag-Reset ja,
//     Score-Effekt nein (dokumentiert in getOpponentBlockingPotential).
// ================================================================

/**
 * evaluateMoveCandidates(player) – Alle möglichen Züge bewerten und sortieren.
 * Hauptfunktion der KI-Scoring-Engine.
 * Bewertet: Handkarten, Stockkarte, Ablagestapelkarten.
 * Gibt sortierte Liste von Kandidaten zurück (bester zuerst).
 * @param {string} player – 'ai' oder 'human'
 * @returns {Array} Sortierte Kandidatenliste [{sourceType, sourceIndex, card, buildPileIndex, score}]
 */
function evaluateMoveCandidates(player) {
  // Globale Spielzustand-Parameter
  const nagel40    = KONFIG.SCORE_40;  // Joker-Schwellenwert
  const nagel41    = KONFIG.SCORE_41;  // Joker-Mindestbewertung
  const nagel42    = KONFIG.SCORE_42;  // Joker-Gewichtung
  const stockSize  = Game.players[player].stock.length;
  const stockTop   = Game.players[player].stock.slice(-1)[0]?.value;

  // Adaptiver Blockade-Parameter (Nagel44)
  // HINWEIS: Wird berechnet, aber – wie schon in v6.5.9 – nirgends
  // verwendet. Bleibt bewusst wirkungslos (getunte Balance erhalten).
  const blockedStock = Math.max(0, 16 - Game.players.human.stock.length);
  const Nagel44      = KONFIG.SCORE_44 * Math.sqrt(blockedStock);

  let candidates = [];

  // --- Handkarten bewerten ---
  candidates = candidates.concat(evalScore_hand(player, stockSize, stockTop));

  // --- Duplikate entfernen (besten Score pro Handkarten-Index behalten) ---
  candidates = evalScore_dedup(candidates);

  // --- Stockkarte bewerten ---
  candidates = candidates.concat(evalScore_stock(player));

  // --- Ablagestapelkarten bewerten ---
  candidates = candidates.concat(evalScore_discard(player));

  // --- Joker-Filter und dynamische Prioritäten anwenden ---
  return evalScore_filter(candidates, player, nagel40, nagel41, nagel42);
}

/**
 * evalScore_hand(player, stockSize, stockTop) – Handkarten auf Baustapel bewerten.
 * Vor der Haupt-Schleife werden Hand-Combo-Scores gecacht (v6.5.7):
 * Jede Handkarte bekommt einmalig ihren Combo-Score (nicht 4× neu berechnet).
 * @returns {Array} Kandidatenliste für Handkarten
 */
function evalScore_hand(player, stockSize, stockTop) {
  const candidates = [];

  // ── Hand-Combo-Scores vorab cachen (v6.5.7) ─────────────────────
  // hand_cacheComboScores() berechnet den Combo-Score für jede Handkarte
  // genau einmal. Ohne Cache würde hand_evaluateCombo() für jede Karte
  // × jeden Baustapel erneut aufgerufen (bis zu 5×4=20 Mal pro Zug).
  // Mit Cache: nur 5 Berechnungen, Ergebnis wird 4× wiederverwendet.
  const comboCache = hand_cacheComboScores(player);
  // ── Ende Cache-Vorbereitung ──────────────────────────────────────

  Game.players[player].hand.forEach((card, i) => {
    Game.buildPiles.forEach((pile, pileIndex) => {
      if (!isValidBuildMove(card, pileIndex)) return;

      let score = KONFIG.SCORE_5; // Grundbonus

      // ── Hand-Combo-Bonus aus Cache addieren (v6.5.7) ─────────────
      // Jede Karte bekommt den vorab berechneten Bonus für ihre Kettenposition.
      // Karten die eine lange Sequenz starten werden stark bevorzugt.
      const comboBonus = comboCache[i] || 0;
      if (comboBonus > 0) {
        score += comboBonus;
      }
      // ── Ende Hand-Combo-Bonus ────────────────────────────────────

      // ── Baustapel-Balance-Bonus (SCORE_9, v6.5.9) ────────────────
      // Bonus wenn dieser Baustapel NICHT der am weitesten fortgeschrittene ist.
      // Fördert gleichmäßige Verteilung über alle 4 Stapel.
      // Verhindert dass ein Stapel weit voraus läuft während andere leer bleiben.
      if (KONFIG.SCORE_9 > 0) {
        const maxPileLen = Math.max(...Game.buildPiles.map(p => p.length));
        if (pile.length < maxPileLen) {
          score += KONFIG.SCORE_9;
        }
      }
      // ── Ende Balance-Bonus ────────────────────────────────────────

      const gapSize    = calculateGapSize(pile, card) || 0;
      const futureRisk = calculateFutureRisk(card, pileIndex) || 0;
      let riskScore    = getOpponentBlockingPotential(card, pileIndex);

      // Joker-Sonderbewertung wenn Karte ein Joker ist
      if (card.value === '★' || card.type === 'joker') {
        riskScore += KONFIG.SCORE_4_JOKER_MOVE;
      }

      // Lückenbonus
      score += gapSize * KONFIG.SCORE_12;

      // Risiken abziehen
      score -= futureRisk;
      score -= riskScore;
      // Joker-Speziallogik
      if (card.type === 'joker') {
        score = evalScore_jokerOnBuild(score, riskScore, pile, pileIndex, stockSize, stockTop, card);
      }

      candidates.push({ sourceType: 'hand', sourceIndex: i, card, buildPileIndex: pileIndex, score });
    });
  });

  return candidates;
}

/**
 * evalScore_jokerOnBuild(score, riskScore, pile, pileIndex, stockSize, stockTop, card)
 * Joker-Speziallogik beim Bewerten eines Baustapel-Zugs mit Handkarte.
 * Aggressivitätsfaktor JOKER_STOCK_AGGRESSION steuert Risikobereitschaft.
 * Berücksichtigt: Stockabbau-Vorrang, Gegner-Blockade, Zukunftswert, Aggressivität.
 * @returns {number} Angepasster Score
 */
function evalScore_jokerOnBuild(score, riskScore, pile, pileIndex, stockSize, stockTop, card) {
  const jokerValue   = pile.length === 0 ? 1 : pile[pile.length - 1].value + 1;
  const matchesStock = stockTop && jokerValue === stockTop;
  const aggression   = KONFIG.JOKER_STOCK_AGGRESSION; // 0.0–1.0

  // Joker auf niedrigem Stapel ohne Stockabbau-Vorteil: Aggressivität entscheidet
  if (pile.length < 5 && stockSize > 12 && !matchesStock) {
    try {
      if (canRemoveStockCard()) {
        // Stockabbau möglich → Joker darf gespielt werden, skaliert mit Aggressivität
        const bonus = KONFIG.SCORE_39 * aggression;
        riskScore  -= bonus;
        score      += bonus;
      } else {
        // Kein Stockabbau: Malus skaliert invers zur Aggressivität
        // Hohe Aggressivität → kleiner Malus. Niedrige Aggressivität → großer Malus.
        const dynamicMalus = KONFIG.SCORE_6 * (1 - (Game.players.ai.stock.length / 20)) * (1 - aggression * 0.5);
        score -= dynamicMalus;
      }
    } catch (error) {
      console.error('evalScore_jokerOnBuild Fehler:', error);
      const dynamicMalus = KONFIG.SCORE_6 * (1 - (Game.players.ai.stock.length / 20));
      score -= dynamicMalus;
    }
  }

  // Joker trifft exakten Gegner-Stockwert: Superbonus (skaliert mit Aggressivität)
  if (matchesStock && (pile.length >= 5 || stockSize <= 10)) {
    const topHumanStock = Game.players.human.stock[Game.players.human.stock.length - 1]?.value || 1;
    // Bonus wächst mit Aggressivität: defensiv = 50% des Bonus, maximal = 150%
    const aggressionMultiplier = 0.5 + aggression;
    const bonus                = Math.round((KONFIG.SCORE_7 + (2000 * (12 - topHumanStock))) * aggressionMultiplier);
    score += bonus;
  }

  // Zukunftswert des Jokers
  const futureValue = calculateJokerFutureValue(card, pileIndex) || 0;
  if (futureValue > 0) {
    score += futureValue * KONFIG.SCORE_8;
  }

  return score;
}

/**
 * evalScore_stock(player) – Stockkarte auf Baustapel bewerten.
 * Stockkarten haben grundsätzlich höhere Priorität da Stockabbau das Spielziel ist.
 * @returns {Array} Kandidatenliste für Stockkarte
 */
function evalScore_stock(player) {
  const candidates = [];
  const stockCard  = Game.players[player].stock.slice(-1)[0];
  if (!stockCard) return candidates;

  Game.buildPiles.forEach((pile, pileIndex) => {
    if (!isValidBuildMove(stockCard, pileIndex)) return;

    const advancedPiles = Game.buildPiles.filter(p => p.length > 6).length;
    let score           = Math.min(KONFIG.SCORE_24, KONFIG.SCORE_10 + (KONFIG.SCORE_10_ADV * advancedPiles));

    candidates.push({
      sourceType:     'stock',
      sourceIndex:    0,
      card:           stockCard,
      buildPileIndex: pileIndex,
      score
    });
  });

  return candidates;
}

/**
 * evalScore_discard(player) – Ablagestapelkarten auf Baustapel bewerten.
 * Zusätzlich zur obersten Karte werden per Tiefenanalyse (v6.5.6,
 * discard_evaluateComboDepth) auch tiefer liegende Karten als Kandidaten
 * bewertet wenn sie durch das Spielen der oberen Karten erreichbar werden.
 * Tiefe wird durch KONFIG.DISCARD_LOOKAHEAD_DEPTH gesteuert (1–6).
 * DISCARD_LOOKAHEAD_DEPTH=1 entspricht exakt dem alten Verhalten (kompatibel).
 * @returns {Array} Kandidatenliste für Ablagestapelkarten (inkl. Tiefenkandidaten)
 */
function evalScore_discard(player) {
  const candidates = [];

  Game.players[player].discards.forEach((pile, discardIndex) => {
    if (pile.length === 0) return;
    const card = pile[pile.length - 1];

    // ── Ebene 0: Oberste Karte (bisheriges Verhalten, immer aktiv) ──
    Game.buildPiles.forEach((buildPile, buildIndex) => {
      if (!isValidBuildMove(card, buildIndex)) return;

      let score = KONFIG.SCORE_26;
      // Kartenwert-Bonus
      const wert = card.value;
      try {
        if (!isNaN(wert) && isFinite(wert)) {
          score += wert * 50;
        } else {
          score += KONFIG.SCORE_27; // Joker-Fallback
        }
      } catch (e) { score += KONFIG.SCORE_27; }

      // Stock-Synergie-Bonus
      if (Game.players[player].stock.some(s => s.value === card.value + 1)) {
        score += KONFIG.SCORE_23;
      }

      // ── Joker-Ablage-Synergie-Bonus (SCORE_36, v6.5.9) ───────────
      // Bonus wenn ein Joker auf einem EIGENEN Ablagestapel liegt
      // UND die geplante Karte danach direkt mit dem Joker kombinierbar wäre.
      // Fördert vorausschauendes Spielen mit Joker-Reserven.
      if (KONFIG.SCORE_36 > 0) {
        Game.players[player].discards.forEach((jokerPile, jpi) => {
          if (jpi === discardIndex) return; // Nicht denselben Stapel prüfen
          if (jokerPile.length === 0) return;
          const jokerTop = jokerPile[jokerPile.length - 1];
          if (jokerTop.type !== 'joker') return;
          // Joker oben auf anderem Stapel → prüfe ob unsere Karte passt
          // Joker würde den nächsten Baustapelwert nach card abdecken
          const nextAfterCard = parseInt(card.value) + 1;
          if (nextAfterCard <= 12) {
            score += KONFIG.SCORE_36;
          }
        });
      }
      // ── Ende Joker-Ablage-Synergie ────────────────────────────────

      candidates.push({
        sourceType:     'discard',
        sourceIndex:    discardIndex,
        card,
        buildPileIndex: buildIndex,
        score
      });
    });

    // ── Tiefenanalyse für Ebenen 1–N (v6.5.6) ───────────────────────
    // Nur wenn Tiefe > 1 konfiguriert ist (Tiefe 1 = nur oberste Karte = altes Verhalten)
    if (KONFIG.DISCARD_LOOKAHEAD_DEPTH > 1 && pile.length > 1) {
      const tiefenKandidaten = discard_evaluateComboDepth(player, discardIndex);
      if (tiefenKandidaten.length > 0) {
        candidates.push(...tiefenKandidaten);
      }
    }
    // ── Ende Tiefenanalyse ──────────────────────────────────────────
  });

  return candidates;
}

/**
 * evalScore_dedup(candidates) – Duplikate entfernen: besten Score pro Handkarten-Index.
 * Verhindert dass dieselbe Handkarte mehrfach mit demselben Baustapel bewertet wird.
 * @param {Array} candidates – Rohe Kandidatenliste
 * @returns {Array} Deduplizierte Kandidatenliste
 */
function evalScore_dedup(candidates) {
  const unique    = [];
  const seenHand  = {};

  for (const c of candidates) {
    if (c.sourceType === 'hand') {
      const key = c.sourceIndex;
      if (!seenHand.hasOwnProperty(key) || seenHand[key].score < c.score) {
        seenHand[key] = c;
      }
    } else {
      unique.push(c);
    }
  }

  for (const key in seenHand) unique.push(seenHand[key]);
  return unique;
}

/**
 * evalScore_filter(candidates, player, nagel40, nagel41, nagel42) – Joker-Filter anwenden.
 * Filtert Joker-Züge mit zu niedrigem Score heraus.
 * Wendet dynamische Prioritäten (Stockangriff, Serienunterbrechung) an.
 * @returns {Array} Gefilterte und sortierte Kandidatenliste
 */
function evalScore_filter(candidates, player, nagel40, nagel41, nagel42) {
  if (candidates.length === 0) return [];

  // Joker-Gewichtung anwenden
  const avgScore         = candidates.reduce((s, m) => s + m.score, 0) / candidates.length;
  const dynamicThreshold = avgScore * nagel40;
  candidates.forEach(m => { if (m.card.type === 'joker') m.score *= nagel42; });

  // Joker-Züge unter Schwellenwert filtern
  const hasNonJoker      = candidates.some(m => m.card.type !== 'joker' && m.score > 0);
  const filtered         = hasNonJoker
    ? candidates.filter(m => {
        if (m.card.type === 'joker' && m.score < dynamicThreshold) {
          return false;
        }
        return true;
      })
    : candidates;

  // Wenn nur Joker-Züge und alle unter Mindestbewertung → Joker soll abgelegt werden
  // Joker_auf_Ablage Flag wird gesetzt, joker_analyzeHandJoker()
  // entscheidet in aiTurn_finish() wo und wie der Joker abgelegt wird.
  if (!hasNonJoker && filtered.length > 0) {
    const onlyJoker      = filtered.every(m => m.card.type === 'joker');
    const bestJokerScore = Math.max(...filtered.map(m => m.score));
    if (onlyJoker && bestJokerScore < nagel41) {
      Joker_auf_Ablage = true;
      return [];
    }
  }

  // Dynamische Prioritäten anwenden
  const enemyAnalysis = predictEnemyStock('human');
  const priorities    = calculateDynamicPriorities();

  // ── Gegner-Ablagestapel-Analyse (v6.5.8) ─────────────────────────
  // Analysiere welche Karten der Gegner gerade sammelt und berechne
  // Blockade-Ziele. Score-Bonus nur wenn eigener Zug nicht leidet.
  const blockTargets = opponent_analyzeDiscardPatterns();
  if (KONFIG.DEBUG_N3 && blockTargets.length > 0) {
    console.log(`📌N3 🎯 Blockade-Ziele: ${blockTargets.map(t => `${t.value}(${(t.confidence*100).toFixed(0)}%)`).join(', ')}`);
  }
  // ── Ende Gegner-Analyse ────────────────────────────────────────────

  filtered.forEach(move => {
    // Stock-Angriff Bonus (bestehend)
    if (move.card.value === enemyAnalysis.nextExpected) {
      const n34    = Game.players.human.stock.length < 10 ? KONFIG.SCORE_34_HIGH : KONFIG.SCORE_34_LOW;
      move.score  += n34 * priorities.stockAttack;
    }

    // Serienunterbrechung Bonus (bestehend)
    if (detectConsecutiveDiscards('human').includes(move.card.value)) {
      move.score += Math.round(KONFIG.SCORE_35 * priorities.seriesDisrupt);
    }

    // ── Blockade-Bonus aus Gegner-Ablagestapel-Analyse (v6.5.8) ──────
    // Bonus wenn geplante Karte eine erkannte Gegner-Serie blockiert.
    // Gewichtet mit OPPONENT_BLOCK_WEIGHT damit eigene Züge Vorrang behalten.
    const blockBonus = opponent_getBlockScore(move.card, blockTargets);
    if (blockBonus > 0) {
      move.score += blockBonus;
      if (KONFIG.DEBUG_N4) {
        console.log(`📌N4 🛡️ Blockade-Bonus für ${move.card.value}: +${blockBonus}`);
      }
    }
    // ── Ende Blockade-Bonus ────────────────────────────────────────

    // Risiko-Gewichtung nach Spielphase (bestehend)
    move.score = Math.round(move.score * priorities.riskTaking);
  });

  return filtered.sort((a, b) => b.score - a.score);
}

/**
 * calculateJokerFutureValue(card, buildPileIndex) – Zukunftswert eines Joker-Zugs.
 * Bewertet wie viele zukünftige Züge durch diesen Joker ermöglicht werden.
 * @returns {number} Zukunftswert
 */
function calculateJokerFutureValue(card, buildPileIndex) {
  let futureValue = 0;
  const buildPile = Game.buildPiles[buildPileIndex];
  let pileValue   = 1;

  if (buildPile.length > 0) {
    const topCard = buildPile[buildPile.length - 1];
    if (topCard) {
      pileValue = topCard.type === 'joker' ? buildPile.length : parseInt(topCard.value) + 1;
    } else {
      console.error('calculateJokerFutureValue: topCard undefiniert');
      pileValue = 1;
    }
  }

  if (isNaN(pileValue)) { console.error('Ungültiger pileValue:', pileValue); return 0.01; }

  const currentJokerValue = card.type === 'joker'
    ? getJokerValue(buildPile, buildPile.length)
    : pileValue;

  // Progressiver Bonus wenn Joker-Wert im KI-Stock benötigt wird
  if (neededForStock(currentJokerValue)) {
    const progressiveBonus = KONFIG.SCORE_25 * (12 - currentJokerValue);
    futureValue += progressiveBonus;
  }

  // Zukunftszüge zählen
  for (let i = 1; i <= 5; i++) {
    if (pileValue + i <= 12) futureValue++;
  }

  // Bonus für fortgeschrittene Stapelposition
  if (pileValue >= 8) {
    futureValue += KONFIG.SCORE_21A;
  }

  return futureValue;
}

/**
 * calculateGapSize(pile, card) – Lückengröße auf einem Baustapel berechnen.
 * Lücke = Abstand zwischen Kartenwert und aktuellem Baustapelwert.
 * @returns {number} Lückengröße (0 wenn keine Lücke oder ungültig)
 */
function calculateGapSize(pile, card) {
  if (!card || !card.value) return 0.01;
  const cardValue = parseInt(card.value, 10);
  if (!pile || pile.length === 0) return cardValue;
  const lastCard  = pile[pile.length - 1];
  const lastValue = parseInt(lastCard.value, 10);
  const gap       = cardValue - lastValue;
  return gap > 0 ? gap : 0;
}

/**
 * calculateFutureRisk(card, pileIndex) – Zukunftsrisiko einer Karte berechnen.
 * Höhere Karten haben mehr Zukunftspotenzial → niedrigeres Risiko-Gefühl.
 * @returns {number} Risikobewertung
 */
function calculateFutureRisk(card, pileIndex) {
  if (!card || !card.value) return 0.01;
  const cardValue   = parseInt(card.value, 10);
  const basisFaktor = 5;
  const indexFaktor = (pileIndex !== undefined) ? pileIndex : 0;
  return (12 - cardValue) * (basisFaktor + indexFaktor);
}

/**
 * calculateDynamicPriorities() – Phasenabhängige KI-Gewichtungen berechnen.
 * Frühe Phase: vorsichtig. Mittlere Phase: ausgewogen. Späte Phase: risikofreudig.
 * @returns {Object} {stockAttack, seriesDisrupt, riskTaking}
 */
function calculateDynamicPriorities() {
  const phase      = 1 - (Game.drawPile.length / 144); // 0 = Anfang, 1 = Ende
  const enemyStock = Game.players.human.stock.slice(-1)[0]?.value || 1;
  return {
    stockAttack:   Math.min(1.5, (12 - enemyStock) / 10 * phase),
    seriesDisrupt: 0.4 + (Game.tracking.discardHistory.human.values.length * 0.03),
    riskTaking:    phase < 0.3 ? 0.8 : phase < 0.7 ? 1.0 : 1.3
  };
}

/**
 * getOpponentBlockingPotential(card, buildPileIndex) – Blockadepotenzial berechnen.
 * Wie stark hilft diese Karte dem menschlichen Gegner wenn wir sie legen?
 * Berücksichtigt: Folgekarten, Sequenzkontrolle, Joker-Risiko.
 * @returns {number} riskScore (höher = gefährlicher für uns)
 */
function getOpponentBlockingPotential(card, buildPileIndex) {
  const opponentVisible   = [
    ...Game.players.human.stock.slice(-1),
    ...Game.players.human.discards.flat()
  ];
  let riskScore           = 0;
  const opponentStockSize = Game.players.human.stock.length;

  opponentVisible.forEach(oppCard => {
    // Direkte Folgekarte: wir legen vor, Gegner kann danach legen
    if (oppCard.value === card.value + 1) {
      const stockFactor      = 1 - (Game.players.ai.stock.length / 20);
      const humanStockImpact = 1 + (15 - Game.players.human.stock.length) / 15;
      riskScore += KONFIG.SCORE_1 * stockFactor * humanStockImpact;
      // Wenn unser Stock fast leer ist: weniger Risiko (wir gewinnen sowieso bald)
      if (Game.players.ai.stock.length <= 5) {
        riskScore -= KONFIG.SCORE_2 * (6 - Game.players.ai.stock.length);
      }
    }

    // Sequenzkontrolle: Gegner hat Vorgängerkarte
    if (oppCard.value === card.value - 1) {
      riskScore += KONFIG.SCORE_28;
      if (opponentStockSize <= 3) {
        riskScore += KONFIG.SCORE_29;
      }
    }

    // Gegner hat Joker: flexibler Gegenzug möglich
    if (oppCard.type === 'joker' && card.value >= 5) {
      riskScore += KONFIG.SCORE_4_OPP_JOKER;
      if (opponentStockSize <= 3) {
        riskScore += KONFIG.SCORE_30;
      }
    }
  });

  // ── Endphase-Gegner-Aggressivitäts-Malus (SCORE_22, v6.5.9) ──────
  // Erhöhter Zusatz-Malus wenn Gegner-Stock <= 5 UND wir eine
  // direkt helfende Karte legen. Ergänzt SCORE_29 (greift bei <= 3).
  // Macht die KI in der kritischen Endphase deutlich vorsichtiger.
  if (KONFIG.SCORE_22 > 0 && opponentStockSize <= 5 && opponentStockSize > 3) {
    const opponentCritical = getOpponentCriticalNumbers();
    if (opponentCritical.includes(parseInt(card.value))) {
      riskScore += KONFIG.SCORE_22;
    }
  }
  // ── Ende Endphase-Malus ────────────────────────────────────────

  // Lückenfüller-Erkennung: unsere Karte füllt eine Gegner-Sequenzlücke
  opponentVisible.forEach((cardA, i) => {
    opponentVisible.slice(i + 1).forEach(cardB => {
      if (Math.abs(cardA.value - cardB.value) === 2) {
        if (card.value === (cardA.value + cardB.value) / 2) {
          riskScore += KONFIG.SCORE_3;
        }
      }
    });
  });

  // Joker-auf-Ablage-Flag zurücksetzen.
  // HINWEIS (SCORE_49): Im Original wurde der Abzug "riskScore -= SCORE_49"
  // in einen 10-ms-Timer gelegt – er feuerte erst NACH dem return auf eine
  // bereits zurückgegebene lokale Variable und hatte daher NIE einen
  // Score-Effekt. v6.6.0 bildet genau dieses (getunte) Verhalten ab:
  // Das Flag wird zurückgesetzt, der Score bleibt unverändert.
  if (Joker_auf_Ablage === true) {
    Joker_auf_Ablage = false;
  }

  return riskScore;
}

/**
 * canRemoveStockCard() – Prüft ob die KI ihre Stockkarte spielen kann.
 * Sicherheitsfunktion mit mehreren Validierungen.
 * @returns {boolean} true wenn Stockkarte spielbar
 */
function canRemoveStockCard() {
  try {
    if (!Game?.players?.ai) return false;
    const stock = Game.players.ai.stock;
    if (!Array.isArray(stock) || stock.length === 0) return false;
    const topCard = stock[stock.length - 1];
    if (!topCard || !('value' in topCard)) return false;
    if (typeof topCard.removable === 'boolean' && !topCard.removable) return false;
    if (topCard.type === 'number') {
      const value = parseInt(topCard.value, 10);
      if (isNaN(value) || value < 1 || value > 12) return false;
    }
    // stockCardIsRemovable wird in initGame() auf true gesetzt
    if (typeof Game.stockCardIsRemovable === 'boolean' && Game.stockCardIsRemovable !== true) return false;
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * neededForStock(jokerValue) – Prüft ob ein Joker-Wert im KI-Stock benötigt wird.
 * @param {number} jokerValue – Der Wert den der Joker vertreten würde
 * @returns {boolean}
 */
function neededForStock(jokerValue) {
  return Game.players.ai.stock.some(
    card => card.type === 'number' && card.value === jokerValue
  );
}

// ================================================================
// MODUL 13 – KI-ANALYSE & GEGNER-VORHERSAGE
// ================================================================

/**
 * predictEnemyStock(opponent) – Gegner-Stockwert wahrscheinlichkeitsbasiert vorhersagen.
 *
 * NEU v6.6.0 – sauber implementiert: Die v6.5.9-Version subtrahierte
 * sichtbare Karten doppelt (deckComposition wurde beim Ablegen bereits
 * dekrementiert UND die sichtbaren Karten wurden erneut abgezogen) und
 * rechnete mit falscher Deckgröße (144 statt 156). Jetzt: frische Zählung
 * pro Aufruf – Start bei 12 Exemplaren je Wert (+12 Joker, 156 Karten),
 * alle für die KI sichtbaren Karten abziehen, Wahrscheinlichkeit je Wert
 * = verbleibend / unbekannt.
 *
 * Die maximale Einzelwert-Wahrscheinlichkeit liegt damit bei ~0.12 –
 * die Schwelle 0.6 in aiTurn_prepare() (Stock-Attacke) wird wie bisher
 * praktisch nie erreicht. Das getunte Spielverhalten bleibt erhalten,
 * nur die Blockade-Overlays zeigen jetzt korrekte Prozentwerte.
 *
 * @param {string} opponent – 'human' oder 'ai'
 * @returns {Object} {nextExpected, confidence}
 */
function predictEnemyStock(opponent) {
  try {
    // Frische Zählung: 12 Exemplare je Wert 1-12 + 12 Joker (156 Karten)
    const remaining = { joker: 12 };
    for (let v = 1; v <= 12; v++) remaining[v] = 12;

    const consume = c => {
      if (!c) return;
      const key = c.type === 'joker' ? 'joker' : c.value;
      if (remaining[key] > 0) remaining[key]--;
    };

    // Alle für die KI sichtbaren Karten abziehen
    Game.buildPiles.forEach(p => p.forEach(consume));
    Game.players.human.discards.forEach(p => p.forEach(consume));
    Game.players.ai.discards.forEach(p => p.forEach(consume));
    Game.players.ai.hand.forEach(consume);
    consume(Game.players.ai.stock.slice(-1)[0]);
    consume(Game.players[opponent].stock.slice(-1)[0]);

    const totalUnseen = Object.values(remaining).reduce((s, v) => s + v, 0);
    if (totalUnseen <= 0) return { nextExpected: null, confidence: 0 };

    // Wahrscheinlichsten Zahlenwert finden (Joker zählt nicht als Ziel)
    let best = { value: null, prob: 0 };
    for (let v = 1; v <= 12; v++) {
      const prob = remaining[v] / totalUnseen;
      if (prob > best.prob) best = { value: v, prob };
    }
    return { nextExpected: best.value, confidence: best.prob };
  } catch {
    return { nextExpected: 1, confidence: 0.5 };
  }
}

/**
 * detectConsecutiveDiscards(player) – Erkennt aufeinanderfolgende Ablegesequenzen.
 * Findet 3er-Serien in der Ablage-Historie (z.B. 3,4,5 abgelegt).
 * @param {string} player – 'human' oder 'ai'
 * @returns {number[]} Array der Mittelpunktwerte erkannter Serien
 */
function detectConsecutiveDiscards(player) {
  const values = Game.tracking.discardHistory[player].values
    .filter(v => v !== 'joker' && typeof v === 'number');
  const series = [];
  for (let i = 0; i < values.length - 2; i++) {
    if (values[i + 1] === values[i] + 1 && values[i + 2] === values[i] + 2) {
      series.push(values[i] + 1);
    }
  }
  return [...new Set(series)];
}

/**
 * opponent_analyzeDiscardPatterns() – Gegner-Ablagestapel auf Sequenzen analysieren.
 * Schaut OPPONENT_ANALYZE_DEPTH Karten tief in jeden Gegner-Ablagestapel.
 * Erkennt aufeinanderfolgende Zahlenserien (z.B. 5,6 → Blockade auf 7).
 * Berücksichtigt auch Verbindungen zwischen verschiedenen Ablagestapeln.
 * Stockabbau der KI hat immer Vorrang – Blockade nur wenn eigener Zug
 * dadurch nicht schlechter wird (gesteuert über OPPONENT_BLOCK_WEIGHT).
 *
 * @returns {Array} Liste erkannter Blockade-Ziele [{value, confidence, reason}]
 *   value      = Kartenwert der blockiert werden sollte
 *   confidence = Wahrscheinlichkeit 0.0–1.0 dass Gegner diese Karte braucht
 *   reason     = Erklärung der Erkennung (für Debugging)
 */
function opponent_analyzeDiscardPatterns() {
  const blockTargets = [];
  const depth        = KONFIG.OPPONENT_ANALYZE_DEPTH;
  const threshold    = KONFIG.OPPONENT_SERIES_THRESHOLD;

  // Alle sichtbaren Gegner-Karten sammeln (Ablagestapel + Stock-Oberseite)
  const allVisible = [];

  // Ablagestapel des Gegners: oberste OPPONENT_ANALYZE_DEPTH Karten
  Game.players.human.discards.forEach((pile, pileIdx) => {
    if (pile.length === 0) return;
    const effectiveDepth = Math.min(depth, pile.length);
    // Karten von oben nach unten lesen
    for (let i = 0; i < effectiveDepth; i++) {
      const card = pile[pile.length - 1 - i];
      if (card && card.type !== 'joker') {
        allVisible.push({
          value:    parseInt(card.value),
          pileIdx,
          tiefe:    i,
          isStock:  false
        });
      }
    }
  });

  // Stock-Oberseite des Gegners
  const humanStock = Game.players.human.stock;
  if (humanStock.length > 0) {
    const topCard = humanStock[humanStock.length - 1];
    if (topCard.type !== 'joker') {
      allVisible.push({
        value:   parseInt(topCard.value),
        pileIdx: -1,  // -1 = Stock
        tiefe:   0,
        isStock: true
      });
    }
  }

  if (allVisible.length === 0) return blockTargets;

  // Alle sichtbaren Werte als Set für schnelles Nachschlagen
  const visibleValues = new Set(allVisible.map(c => c.value));

  // Sequenz-Erkennung: Suche nach aufsteigenden Serien
  // Eine Serie bedeutet: Gegner hat diese Karten und braucht die Nächste
  for (let startVal = 1; startVal <= 11; startVal++) {
    // Wie viele aufeinanderfolgende Werte sehen wir beim Gegner?
    let serienLaenge = 0;
    for (let v = startVal; v <= 12; v++) {
      if (visibleValues.has(v)) serienLaenge++;
      else break;
    }

    // Mindest-Serienlänge prüfen
    if (serienLaenge >= threshold) {
      const nextNeeded = startVal + serienLaenge; // Nächster benötigter Wert
      if (nextNeeded <= 12) {
        // Confidence berechnen: höher wenn Serie länger ist
        const confidence = Math.min(0.95, 0.3 + (serienLaenge * 0.2));
        // Zusatz-Confidence wenn Stock-Top Teil der Serie ist
        const stockInSerie = allVisible.some(c => c.isStock && c.value >= startVal && c.value < nextNeeded);
        const finalConf    = stockInSerie ? Math.min(0.99, confidence + 0.25) : confidence;

        blockTargets.push({
          value:      nextNeeded,
          confidence: finalConf,
          reason:     `Serie ${startVal}–${startVal + serienLaenge - 1} sichtbar (Länge ${serienLaenge})${stockInSerie ? ' + Stock' : ''}`
        });

        if (KONFIG.DEBUG_N1) {
          console.log(`📌N1 🔍 Gegner-Serie erkannt: ${startVal}→${startVal+serienLaenge-1}, Blockade auf ${nextNeeded} (Conf: ${finalConf.toFixed(2)})`);
        }
      }
    }
  }

  // Auch direkte Stock-Folgekarte als Blockade-Ziel (höchste Priorität)
  if (humanStock.length > 0) {
    const stockTop = humanStock[humanStock.length - 1];
    if (stockTop.type !== 'joker') {
      const stockNext  = parseInt(stockTop.value) + 1;
      const alreadyIn  = blockTargets.some(t => t.value === stockNext);
      if (!alreadyIn && stockNext <= 12) {
        blockTargets.push({
          value:      stockNext,
          confidence: 0.99, // Stock-Folgekarte ist immer kritisch
          reason:     `Direkte Stock-Folgekarte (Stock-Top: ${stockTop.value})`
        });
      }
    }
  }

  // Nach Confidence sortieren (höchste zuerst)
  blockTargets.sort((a, b) => b.confidence - a.confidence);

  return blockTargets;
}

/**
 * opponent_getBlockScore(card, blockTargets) – Blockade-Score für eine Karte berechnen.
 * Prüft ob die geplante Karte ein erkanntes Blockade-Ziel trifft.
 * Der Score wird mit OPPONENT_BLOCK_WEIGHT skaliert damit eigene Züge Vorrang haben.
 *
 * @param {Object} card         – Die zu bewertende Karte {type, value}
 * @param {Array}  blockTargets – Ausgabe von opponent_analyzeDiscardPatterns()
 * @returns {number} Blockade-Score (positiv = Blockade-Vorteil, 0 = kein Vorteil)
 */
function opponent_getBlockScore(card, blockTargets) {
  if (!blockTargets || blockTargets.length === 0) return 0;
  if (card.type === 'joker') return 0; // Joker nicht für Blockade "verschwenden"

  const cardValue = parseInt(card.value);
  let   blockScore = 0;

  blockTargets.forEach(target => {
    if (target.value === cardValue) {
      // Blockade-Score skaliert mit Confidence und OPPONENT_BLOCK_WEIGHT
      const rawScore   = KONFIG.OPPONENT_BLOCK_BONUS * target.confidence;
      blockScore      += rawScore * KONFIG.OPPONENT_BLOCK_WEIGHT;

      if (KONFIG.DEBUG_N2) {
        console.log(`📌N2 🛡️ Blockade: Karte ${cardValue} trifft Ziel ${target.value} (Conf: ${target.confidence.toFixed(2)}, Score: +${(rawScore * KONFIG.OPPONENT_BLOCK_WEIGHT).toFixed(0)})`);
        console.log(`📌N2 🛡️ Grund: ${target.reason}`);
      }
    }
  });

  return Math.round(blockScore);
}

// ================================================================
// MODUL 14 – JOKER-STRATEGIE, HAND-KETTEN & ABLAGE-TIEFENANALYSE
// ================================================================
// Drei Spezial-Analysen der getunten KI:
//   • Joker-Strategie (v6.5.5): Wann und wo Joker spielen/schützen?
//   • Hand-Kombinationen (v6.5.7): Aufsteigende Ketten in der Hand
//     erkennen, Joker als Brücken, Stock-Anschluss-Multiplikator.
//   • Ablage-Tiefenanalyse (v6.5.6): N Ebenen tief in Ablagestapel
//     schauen und mehrstufige Züge vorausplanen.
//
// FIX v6.6.0 in joker_analyzeHandJoker(): Im Original standen vor
// allen drei return-Anweisungen tote "if (KONFIG.DEBUG_J3)"-Prüfungen.
// Das Flag existiert in KONFIG nicht → die returns wurden verschluckt
// und die Funktion gab IMMER undefined zurück. Da JOKER_COMBO_ENABLED
// vom Tuner auf false steht, war der Pfad inaktiv – jetzt ist er
// korrekt implementiert, falls der Tuner ihn künftig aktiviert.
// ================================================================

/**
 * joker_analyzeStockTop(jokerCard) – Joker im Stock intelligent spielen.
 * Prüft ob und wie ein Joker der oben im KI-Stock liegt gespielt werden soll.
 *
 * PRIORITÄTEN:
 *   1. Direkt spielbar UND kein Gegner-Nachteil UND Folgezüge entstehen → spielen
 *   2. Direkt spielbar ABER Gegner profitiert stark → nicht spielen (Ausnahme: Aggressivität >= 0.9)
 *   3. Nicht direkt spielbar → nicht spielen (Stockkarten können nur direkt auf Bau)
 *   4. Direkt spielbar ABER keine Folgezüge → nur spielen wenn Aggressivität >= 0.8
 *
 * @param {Object} jokerCard – Die Joker-Karte im Stock
 * @returns {Object|null} {shouldPlay, targetPile, reason, followUpCount} oder null bei Fehler
 */
async function joker_analyzeStockTop(jokerCard) {
  try {
    // Stockkarten können nur direkt auf Baustapel – keine Kombination mit Ablage möglich
    // Prüfe jeden Baustapel ob der Joker legbar ist
    let bestPile       = -1;
    let bestFollowUp   = -1;
    let bestReason     = '';

    for (let pileIdx = 0; pileIdx < Game.buildPiles.length; pileIdx++) {
      if (!isValidBuildMove(jokerCard, pileIdx)) continue;

      // Joker-Wert auf diesem Stapel ermitteln
      const pile       = Game.buildPiles[pileIdx];
      const jokerAsVal = pile.length === 0 ? 1 : (pile[pile.length - 1].type === 'joker' ? pile.length + 1 : pile[pile.length - 1].value + 1);

      // Gegner-Profit prüfen: Hilft dieser Zug dem Gegner?
      const opponentCritical = getOpponentCriticalNumbers();
      const helpsOpponent    = opponentCritical.includes(jokerAsVal + 1);
      const enemyProfit      = helpsOpponent ? KONFIG.JOKER_ENEMY_HELP_PENALTY : 0;

      // Gegner profitiert stark und Aggressivität zu niedrig → überspringen
      if (enemyProfit >= KONFIG.JOKER_ENEMY_HELP_PENALTY && KONFIG.JOKER_STOCK_AGGRESSION < 0.9) {
        continue;
      }

      // Folgezüge zählen die nach diesem Joker-Zug entstehen
      const followUpCount = joker_countFollowUpMoves(pileIdx, jokerAsVal);
      // Folgezüge zu wenig und Aggressivität zu niedrig → überspringen
      if (followUpCount < KONFIG.JOKER_NO_FOLLOWUP_THRESHOLD && KONFIG.JOKER_STOCK_AGGRESSION < 0.8) {
        continue;
      }

      // Direkter Stockabbau-Vorteil: Joker-Wert passt zu unserer nächsten Stockkarte
      const ourNextStock = Game.players.ai.stock.length > 1
        ? Game.players.ai.stock[Game.players.ai.stock.length - 2]?.value
        : null;
      const directStockBenefit = ourNextStock && (jokerAsVal === ourNextStock - 1 || jokerAsVal === ourNextStock);

      // Besten Stapel auswählen (Stockvorteil > Folgezüge > erste legbare Option)
      if (bestPile === -1 || (directStockBenefit && bestFollowUp < followUpCount) || followUpCount > bestFollowUp) {
        bestPile     = pileIdx;
        bestFollowUp = followUpCount;
        bestReason   = directStockBenefit
          ? `direkter Stockvorteil (${followUpCount} Folgezüge)`
          : `${followUpCount} Folgezüge möglich`;
      }
    }

    // Kein spielbarer Stapel gefunden
    if (bestPile === -1) {
      return { shouldPlay: false, targetPile: -1, reason: 'kein geeigneter Baustapel', followUpCount: 0 };
    }

    return { shouldPlay: true, targetPile: bestPile, reason: bestReason, followUpCount: bestFollowUp };

  } catch (e) {
    console.error('joker_analyzeStockTop Fehler:', e);
    return null;
  }
}

/**
 * joker_analyzeHandJoker(jokerIndex) – Joker in Hand optimal einsetzen.
 * Analysiert den besten Einsatz eines Jokers der sich in der KI-Hand befindet.
 *
 * ENTSCHEIDUNGSBAUM:
 *   1. JOKER_COMBO_ENABLED=true → prüfe Kombo mit Ablagekarten für Stockabbau
 *      → Ablagekarte + Joker ermöglicht Stockabbau-Sequenz? → action: 'buildCombo'
 *   2. Joker direkt auf Baustapel spielbar und sinnvoll? → action: 'buildDirect'
 *   3. Joker sicher auf besten Schutzstapel ablegen → action: 'discard'
 *
 * @param {number} jokerIndex – Index des Jokers in Game.players.ai.hand
 * @returns {Object|null} {action, targetPile, discardIndex, reason} oder null bei Fehler
 */
async function joker_analyzeHandJoker(jokerIndex) {
  try {
    const jokerCard = Game.players.ai.hand[jokerIndex];
    if (!jokerCard || jokerCard.type !== 'joker') return null;

    // ── Option 1: Kombination mit Ablagekarten prüfen ──────────────
    if (KONFIG.JOKER_COMBO_ENABLED) {
      const comboResult = joker_evaluateCombo(jokerCard, jokerIndex);
      if (comboResult && comboResult.score >= KONFIG.JOKER_STOCK_COMBO_BONUS) {
        return {
          action:       'buildCombo',
          targetPile:   comboResult.targetPile,
          discardIndex: comboResult.discardIndex,
          reason:       `Kombo Score ${comboResult.score}`
        };
      }
    }

    // ── Option 2: Direktes Spielen auf Baustapel ───────────────────
    // Nur wenn es wirklich Sinn macht (Folgezüge oder direkter Stockvorteil)
    let bestDirectPile   = -1;
    let bestDirectFollow = -1;
    for (let pileIdx = 0; pileIdx < Game.buildPiles.length; pileIdx++) {
      if (!isValidBuildMove(jokerCard, pileIdx)) continue;
      const pile       = Game.buildPiles[pileIdx];
      const jokerAsVal = pile.length === 0 ? 1 : (pile[pile.length - 1].type === 'joker' ? pile.length + 1 : pile[pile.length - 1].value + 1);
      const follows    = joker_countFollowUpMoves(pileIdx, jokerAsVal);
      const opCrit     = getOpponentCriticalNumbers();
      const helps      = opCrit.includes(jokerAsVal + 1);
      // Nicht direkt spielen wenn Gegner profitiert
      if (helps && KONFIG.JOKER_STOCK_AGGRESSION < 0.8) continue;
      if (follows > bestDirectFollow) {
        bestDirectFollow = follows;
        bestDirectPile   = pileIdx;
      }
    }
    if (bestDirectPile !== -1 && bestDirectFollow >= KONFIG.JOKER_NO_FOLLOWUP_THRESHOLD) {
      return {
        action:       'buildDirect',
        targetPile:   bestDirectPile,
        discardIndex: -1,
        reason:       `${bestDirectFollow} Folgezüge möglich`
      };
    }

    // ── Option 3: Joker sicher ablegen ────────────────────────────
    const bestDiscardIdx = joker_findBestDiscardForJoker();
    return {
      action:       'discard',
      targetPile:   -1,
      discardIndex: bestDiscardIdx,
      reason:       'kein direkter Vorteil – sicheres Ablegen'
    };

  } catch (e) {
    console.error('joker_analyzeHandJoker Fehler:', e);
    return null;
  }
}

/**
 * joker_shouldProtectDiscard(discardPileIndex) – Joker-Ablagestapel schützen.
 * Prüft ob ein Ablagestapel einen Joker oben hat und ob er geschützt werden soll.
 * Gibt Schutzstatus und Strafe zurück.
 *
 * @param {number} discardPileIndex – Index des Ablagestapels (0-3)
 * @returns {Object} {protect: boolean, penalty: number}
 */
function joker_shouldProtectDiscard(discardPileIndex) {
  // Schutz nur aktiv wenn KONFIG-Flag gesetzt
  if (!KONFIG.JOKER_PROTECT_DISCARD) return { protect: false, penalty: 0 };

  const pile = Game.players.ai.discards[discardPileIndex];
  if (!pile || pile.length === 0) return { protect: false, penalty: 0 };

  const topCard = pile[pile.length - 1];
  if (!topCard || topCard.type !== 'joker') return { protect: false, penalty: 0 };

  // Joker liegt oben → Schutz aktivieren
  return { protect: true, penalty: KONFIG.JOKER_PROTECT_DISCARD_PENALTY };
}

/**
 * joker_evaluateCombo(jokerCard, jokerHandIndex) – Joker-Kombination bewerten.
 * Prüft ob eine Ablagekarte + Joker zusammen einen Stockabbau-Zug ermöglichen.
 * Ziel: Ablagekarte spielen → Joker spielen → Stockkarte spielen (3er-Sequenz).
 *
 * @param {Object} jokerCard – Die Joker-Karte
 * @param {number} jokerHandIndex – Index des Jokers in der Hand
 * @returns {Object|null} {score, targetPile, discardIndex, followUpMoves} oder null
 */
function joker_evaluateCombo(jokerCard, jokerHandIndex) {
  let bestCombo = null;
  let bestScore = 0;

  // Für jeden Ablagestapel prüfen – auch tiefere Ebenen via discard_lookAhead (v6.5.6)
  Game.players.ai.discards.forEach((pile, discardIdx) => {
    if (pile.length === 0) return;

    // Alle erreichbaren Karten sammeln (Ebene 0 = oben, Ebene N = tiefer)
    // discard_lookAhead gibt Karten von oben nach unten zurück
    const reachableCards = discard_lookAhead('ai', discardIdx, KONFIG.DISCARD_LOOKAHEAD_DEPTH);

    reachableCards.forEach((discardTop, ebene) => {
      // Für jeden Baustapel prüfen ob Ablagekarte + dann Joker spielbar
      Game.buildPiles.forEach((buildPile, pileIdx) => {
        if (!isValidBuildMove(discardTop, pileIdx)) return;

        // Nach dem Ablegen der Ablagekarte: welchen Wert würde der Joker vertreten?
        const simulatedPile = [...buildPile, discardTop];
        const jokerAsVal    = simulatedPile.length === 0 ? 1
                            : (simulatedPile[simulatedPile.length - 1].type === 'joker'
                               ? simulatedPile.length + 1
                               : simulatedPile[simulatedPile.length - 1].value + 1);

        // Joker nach der Ablagekarte spielbar?
        const jokerValidAfter = isValidBuildMove({ type: 'joker', value: '★' }, pileIdx);
        if (!jokerValidAfter) return;

        // Folgezüge zählen die nach Ablagekarte + Joker entstehen
        const followUpCount = joker_countFollowUpMoves(pileIdx, jokerAsVal);
        if (followUpCount < KONFIG.JOKER_COMBO_MIN_GAIN) {
          return;
        }

        // Stockabbau direkt durch Kombo möglich?
        const aiStockTop   = Game.players.ai.stock.slice(-1)[0];
        const stockBenefit = aiStockTop && (jokerAsVal === aiStockTop.value - 1);

        // Tiefen-Bonus: tiefere Karten brauchen mehr Vorarbeit → höherer Bonus
        const tiefenBonus = ebene * KONFIG.DISCARD_COMBO_DEPTH_BONUS;
        const comboScore  = stockBenefit
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
}

/**
 * joker_findBestDiscardForJoker() – Besten Ablagestapel für sicheres Joker-Ablegen finden.
 * Wählt den Stapel der den Joker am besten schützt und dem Gegner am wenigsten nützt.
 * Bevorzugt: leere Stapel, Stapel ohne Gegnerhilfe, Stapel mit kleinen Karten oben.
 *
 * @returns {number} Index des besten Ablagestapels (0-3)
 */
function joker_findBestDiscardForJoker() {
  const opponentCritical = getOpponentCriticalNumbers();
  let bestIdx   = 3; // Fallback: Ablage 4
  let bestScore = -Infinity;

  Game.players.ai.discards.forEach((pile, idx) => {
    let score = 100; // Basiswert

    // Leerer Stapel bevorzugen (Joker ist dann allein und gut geschützt)
    if (pile.length === 0) {
      score += 500;
    } else {
      const topCard = pile[pile.length - 1];
      // Kleiner Wert oben: Joker wird durch viele Karten schwer erreichbar
      score += (12 - (topCard.value || 6)) * 20;
      // Gegner sollte nicht profitieren
      if (opponentCritical.includes(topCard.value + 1)) score -= 300;
    }

    // Joker-Schutz: Stapel der bereits einen Joker hat → nicht doppeln
    if (pile.length > 0 && pile[pile.length - 1].type === 'joker') score -= 200;

    if (score > bestScore) { bestScore = score; bestIdx = idx; }
  });

  return bestIdx;
}

/**
 * joker_countFollowUpMoves(buildPileIndex, jokerValue) – Folgezüge zählen.
 * Zählt wie viele Züge nach dem Legen des Jokers (mit Wert jokerValue)
 * sofort möglich wären (aus Hand, Stock und Ablage der KI).
 *
 * @param {number} buildPileIndex – Baustapel auf den Joker gelegt wird
 * @param {number} jokerValue – Effektiver Wert des Jokers
 * @returns {number} Anzahl möglicher Folgezüge
 */
function joker_countFollowUpMoves(buildPileIndex, jokerValue) {
  let count = 0;
  const neededNext = jokerValue + 1; // Nächster benötigter Wert nach dem Joker

  // Handkarten prüfen
  Game.players.ai.hand.forEach(card => {
    if (card.type === 'joker') { count += 0.5; return; } // Joker immer spielbar, aber halber Wert
    if (card.value === neededNext) count++;
  });

  // Stockkarte prüfen
  const stockTop = Game.players.ai.stock.slice(-1)[0];
  if (stockTop && stockTop.value === neededNext) count += 2; // Stockabbau zählt doppelt!

  // Ablagestapel prüfen (nur oberste Karte)
  Game.players.ai.discards.forEach(pile => {
    if (pile.length === 0) return;
    const top = pile[pile.length - 1];
    if (top.value === neededNext) count++;
  });

  return count;
}

// ----------------------------------------------------------------
// HAND-KOMBINATIONEN (v6.5.7)
// Erkennt aufeinanderfolgende Karten in der KI-Hand und bewertet
// sie mit einem massiven Bonus. Joker können Lücken überbrücken.
// Kettenende das zur Stockkarte führt bekommt einen Multiplikator.
// Performance: hand_cacheComboScores() berechnet alle Scores einmal
// vorab statt sie für jede Karte × jeden Baustapel neu zu berechnen.
// ----------------------------------------------------------------

/**
 * hand_evaluateCombo(player, handCardIndex) – Kette in der Hand erkennen.
 * Prüft ob eine Handkarte eine aufsteigende Sequenz in der Hand startet.
 * Joker können als Brückenkarten Lücken in der Kette schließen.
 * Wenn die Kette direkt zur Stockkarte führt → Multiplikator.
 *
 * ALGORITHMUS:
 *   1. Startkarte aus virtueller Handkopie entfernen.
 *   2. Nächsten Wert (currentValue+1) in restlicher Hand suchen.
 *   3. Gefunden → comboLength++, weitersuchen.
 *   4. Nicht gefunden → Joker als Brücke? → jokerBridgeCount++, weitersuchen.
 *   5. Kein Joker → Kette reißt ab.
 *   6. comboLength >= HAND_COMBO_MIN_LENGTH → Bonus berechnen.
 *   7. Kettenende == stockTop - 1 → Multiplikator anwenden.
 *
 * @param {string} player        – 'ai' (nur für KI-Hand)
 * @param {number} handCardIndex – Index der Startkarte in der Hand (0-4)
 * @returns {number} Berechneter Bonus-Score (0 wenn keine Kette erkannt)
 */
function hand_evaluateCombo(player, handCardIndex) {
  const hand      = Game.players[player].hand;
  const startCard = hand[handCardIndex];

  // Joker starten keine festen Ketten (unbekannter Startwert)
  // Sie werden aber als Brücken innerhalb der Kette genutzt
  if (startCard.type === 'joker') return 0;

  const startValue   = parseInt(startCard.value);
  let   currentValue = startValue;
  let   comboLength  = 1;          // Startkarte zählt mit
  let   jokerBridges = 0;          // Anzahl genutzter Joker als Brücke
  let   tempHand     = [...hand];  // Virtuelle Handkopie für Simulation

  // Startkarte aus der virtuellen Hand entfernen
  tempHand.splice(handCardIndex, 1);

  // Kette vorwärts aufbauen (max. bis Wert 12)
  while (currentValue < 12) {
    const nextVal      = currentValue + 1;
    const nextCardIdx  = tempHand.findIndex(
      c => c.type !== 'joker' && parseInt(c.value) === nextVal
    );

    if (nextCardIdx !== -1) {
      // Nächste Karte gefunden → Kette verlängern
      comboLength++;
      currentValue = nextVal;
      tempHand.splice(nextCardIdx, 1);
    } else {
      // Kein direkter Treffer → Joker als Brücke versuchen
      const jokerIdx = tempHand.findIndex(c => c.type === 'joker');
      if (jokerIdx !== -1) {
        comboLength++;
        jokerBridges++;
        currentValue = nextVal;
        tempHand.splice(jokerIdx, 1);
      } else {
        // Kette reißt ab – kein weiterer Joker verfügbar
        break;
      }
    }
  }

  // Mindest-Kettenlänge nicht erreicht → kein Bonus
  if (comboLength < KONFIG.HAND_COMBO_MIN_LENGTH) {
    return 0;
  }

  // Basis-Bonus: Kettenlänge × Bonus pro Karte
  let bonus = comboLength * KONFIG.HAND_COMBO_BONUS_PER_CARD;

  // Joker-Brücken-Bonus: Bonus für jeden genutzten Joker als Brücke
  if (jokerBridges > 0) {
    bonus += jokerBridges * KONFIG.HAND_COMBO_JOKER_BRIDGE_BONUS;
  }

  // Stock-Anschluss prüfen: führt die Kette direkt zur Stockkarte?
  // Kettenende currentValue + 1 muss der Wert der Stockkarte sein
  const aiStockTop = Game.players[player].stock.slice(-1)[0];
  if (aiStockTop && (currentValue + 1 === aiStockTop.value)) {
    bonus = Math.round(bonus * KONFIG.HAND_COMBO_STOCK_CONNECT_MULTIPLIER);
  }

  return bonus;
}

/**
 * hand_cacheComboScores(player) – Combo-Scores aller Handkarten vorab cachen.
 * Berechnet hand_evaluateCombo() für jede Handkarte genau EINMAL und
 * speichert die Ergebnisse in einem Array das in evalScore_hand() genutzt wird.
 *
 * WARUM CACHING?
 * evalScore_hand() iteriert: 5 Handkarten × 4 Baustapel = 20 Durchläufe.
 * Ohne Cache: hand_evaluateCombo() 20× aufgerufen (unnötig, Ergebnis gleich).
 * Mit Cache: hand_evaluateCombo() nur 5× aufgerufen, Ergebnis 4× verwendet.
 * Bei Kettenlänge 5 und vielen Joker-Checks ist das spürbar schneller.
 *
 * @param {string} player – 'ai'
 * @returns {number[]} Array mit Combo-Score je Handkarten-Index [0..hand.length-1]
 */
function hand_cacheComboScores(player) {
  const hand  = Game.players[player].hand;
  const cache = new Array(hand.length).fill(0);

  hand.forEach((card, i) => {
    // Joker haben keinen Ketten-Score als Startkarte (hand_evaluateCombo gibt 0)
    // → trotzdem aufrufen damit das Verhalten konsistent bleibt
    cache[i] = hand_evaluateCombo(player, i);
  });

  return cache;
}

// ----------------------------------------------------------------
// TIEFENANALYSE ABLAGESTAPEL (v6.5.6)
// Die KI schaut N Ebenen tief in die Ablagestapel und plant
// mehrstufige Züge voraus. Stockabbau hat höchste Priorität.
// ----------------------------------------------------------------

/**
 * discard_lookAhead(player, pileIndex, depth) – N Ebenen tief schauen.
 * Gibt die obersten 'depth' Karten eines Ablagestapels zurück.
 * Karte[0] = oberste (sofort spielbar), Karte[1] = darunter (nach 1 Zug), usw.
 *
 * DISCARD_LOOKAHEAD_DEPTH=1 → nur Karte[0] → identisch mit v6.5.5.
 * DISCARD_LOOKAHEAD_DEPTH=2 → Karte[0] und Karte[1] → Standard v6.5.6.
 *
 * @param {string} player     – 'ai' oder 'human'
 * @param {number} pileIndex  – Index des Ablagestapels (0-3)
 * @param {number} depth      – Wie tief schauen (1-6, aus KONFIG)
 * @returns {Array} Kartenobjekte von oben nach unten, max. 'depth' Stück
 */
function discard_lookAhead(player, pileIndex, depth) {
  const pile = Game.players[player].discards[pileIndex];
  if (!pile || pile.length === 0) return [];

  // Tiefe auf verfügbare Karten und konfigurierten Maximalwert begrenzen
  const effectiveDepth = Math.min(depth, pile.length, 6);

  // Aus dem Array (unten = Index 0, oben = letzter Index) die obersten
  // 'effectiveDepth' Karten nehmen und als "von oben nach unten" zurückgeben.
  // pile.slice(-effectiveDepth) = die letzten N Elemente (oberste Karten)
  // .reverse() = oberste Karte zuerst im Ergebnis-Array
  const result = pile.slice(-effectiveDepth).reverse();

  return result;
}

/**
 * discard_evaluateComboDepth(player, pileIndex) – Tiefenkombinationen bewerten.
 * Simuliert für jede erreichbare Tiefenkarte ob sie in Kombination mit
 * Hand- und Stockkarten einen sinnvollen Zug ermöglicht.
 *
 * ALGORITHMUS je Tiefenkarte (Ebene E):
 *   1. Simuliere: Karten der Ebenen 0..E-1 wurden gespielt → Ebene E ist jetzt oben.
 *   2. Prüfe: Ist die Tiefenkarte auf einen Baustapel legbar?
 *   3. Prüfe: Entsteht dadurch eine Chain mit Hand/Stock (discard_buildSimChain)?
 *   4. Berechne Score mit Tiefenbonus und Stockabbau-Multiplikator.
 *   5. Wenn DISCARD_STOCK_FOCUS=true: nur Chain-Züge die Stockabbau ermöglichen.
 *
 * @param {string} player      – 'ai' (Tiefenanalyse nur für KI-Ablagestapel)
 * @param {number} pileIndex   – Index des Ablagestapels (0-3)
 * @returns {Array} Zusätzliche Kandidaten-Objekte aus der Tiefenanalyse
 */
function discard_evaluateComboDepth(player, pileIndex) {
  const tiefenKandidaten = [];
  const pile             = Game.players[player].discards[pileIndex];
  if (!pile || pile.length <= 1) return []; // Min. 2 Karten nötig für Tiefe > 0

  // Alle erreichbaren Karten von Ebene 1 bis DISCARD_LOOKAHEAD_DEPTH
  // Ebene 0 = oberste Karte (bereits in evalScore_discard normal bewertet)
  // Ebene 1 = zweite Karte von oben, wird nach Ebene-0-Zug erreichbar
  const allCards    = discard_lookAhead(player, pileIndex, KONFIG.DISCARD_LOOKAHEAD_DEPTH);
  const aiStockTop  = Game.players[player].stock.slice(-1)[0];
  let   addedCount  = 0; // Anzahl hinzugefügter Kandidaten (Limit: DISCARD_MAX_COMBO_CANDIDATES)

  // Ab Ebene 1 beginnen (Ebene 0 ist normale evalScore_discard-Bewertung)
  for (let ebene = 1; ebene < allCards.length; ebene++) {
    if (addedCount >= KONFIG.DISCARD_MAX_COMBO_CANDIDATES) {
      break;
    }

    const tiefenKarte = allCards[ebene]; // Diese Karte liegt 'ebene' Züge tief
    if (!tiefenKarte) continue;

    // Für jeden Baustapel prüfen ob die Tiefenkarte direkt spielbar wäre
    for (let buildIdx = 0; buildIdx < Game.buildPiles.length; buildIdx++) {
      if (!isValidBuildMove(tiefenKarte, buildIdx)) continue;

      // Chain-Analyse: Was folgt nach dem Legen der Tiefenkarte?
      const chainResult = discard_buildSimChain(player, pileIndex, ebene, buildIdx);

      // DISCARD_STOCK_FOCUS: nur Tiefenkombos bewerten die Stockabbau ermöglichen
      if (KONFIG.DISCARD_STOCK_FOCUS && !chainResult.enablesStock) {
        continue;
      }

      // Score berechnen
      let score = KONFIG.SCORE_26; // Basis wie normaler Ablagestapelzug

      // Kartenwert-Bonus der Tiefenkarte
      if (!isNaN(tiefenKarte.value) && isFinite(tiefenKarte.value)) {
        score += tiefenKarte.value * 50;
      }

      // Tiefen-Bonus: je tiefer, desto mehr Vorarbeit → höherer Bonus
      score += ebene * KONFIG.DISCARD_COMBO_DEPTH_BONUS;
      // Stockabbau-Multiplikator wenn Tiefenkombo Stockabbau ermöglicht
      if (chainResult.enablesStock) {
        score *= KONFIG.DISCARD_DEPTH_STOCK_MULTIPLIER;
      }

      // Chain-Bonus wenn vollständige 3er-Kette möglich (Ablage→Tief→Stock)
      if (chainResult.isFullChain) {
        score += KONFIG.DISCARD_CHAIN_BONUS;
      }

      // Stock-Synergie der Tiefenkarte
      if (Game.players[player].stock.some(s => s.value === tiefenKarte.value + 1)) {
        score += KONFIG.SCORE_23;
      }

      score = Math.round(score);

      tiefenKandidaten.push({
        sourceType:     'discard',
        sourceIndex:    pileIndex,
        card:           tiefenKarte,
        buildPileIndex: buildIdx,
        score,
        // Zusatz-Metadaten für Debug und spätere Verarbeitung
        tiefenebene:    ebene,
        isDeepCombo:    true
      });
      addedCount++;
    }
  }

  return tiefenKandidaten;
}

/**
 * discard_buildSimChain(player, pileIndex, tiefenebene, buildPileIndex)
 * Simuliert eine Sequenzkette: Erst die oberen Karten spielen,
 * dann die Tiefenkarte, dann prüfen ob Hand/Stock-Züge folgen.
 *
 * Prüft insbesondere ob nach der Tiefenkarte:
 *   a) Eine Stockkarte gespielt werden kann (enablesStock = true)
 *   b) Eine vollständige 3er-Kette möglich ist (isFullChain = true):
 *      Ablagekarte → Tiefenkarte → Stockkarte (alle in einer Runde)
 *
 * @param {string} player         – Spieler ('ai')
 * @param {number} pileIndex      – Ablagestapel-Index (0-3)
 * @param {number} tiefenebene    – Wie tief die Zielkarte liegt (1-5)
 * @param {number} buildPileIndex – Baustapel-Index auf den gelegt wird (0-3)
 * @returns {Object} {enablesStock: boolean, isFullChain: boolean, chainLength: number}
 */
function discard_buildSimChain(player, pileIndex, tiefenebene, buildPileIndex) {
  try {
    const pile       = Game.players[player].discards[pileIndex];
    const buildPile  = Game.buildPiles[buildPileIndex];
    const stockTop   = Game.players[player].stock.slice(-1)[0];

    if (!pile || pile.length <= tiefenebene) {
      return { enablesStock: false, isFullChain: false, chainLength: 0 };
    }

    // Die Tiefenkarte (Ziel der Simulation)
    const tiefenKarte = pile[pile.length - 1 - tiefenebene];
    if (!tiefenKarte) return { enablesStock: false, isFullChain: false, chainLength: 0 };

    // Simulierter Baustapelzustand nach dem Legen der Tiefenkarte
    const simulatedBuild = [...buildPile, tiefenKarte];
    const nextNeeded     = simulatedBuild.length === 0 ? 1
                         : (simulatedBuild[simulatedBuild.length - 1].type === 'joker'
                            ? simulatedBuild.length + 1
                            : simulatedBuild[simulatedBuild.length - 1].value + 1);

    // Kann die Stockkarte nach der Tiefenkarte gespielt werden?
    const enablesStock = stockTop && (stockTop.value === nextNeeded || stockTop.type === 'joker');

    // Vollständige Kette: Obere Ablage-Karte → Tiefenkarte → Stockkarte
    // (3 Züge in einer Runde aus einem Ablagestapel + Stockabbau)
    let isFullChain  = false;
    let chainLength  = tiefenebene + 1; // Mindestlänge: alle oberen + Tiefenkarte

    if (enablesStock) {
      isFullChain = tiefenebene >= 1; // Mind. 2 Züge aus Ablage + 1 Stockzug = echte Kette
      chainLength++;
    }

    // Handkarten prüfen die nach der Tiefenkarte passen
    const handCanFollow = Game.players[player].hand.some(
      c => c.type === 'joker' || c.value === nextNeeded
    );
    if (handCanFollow) chainLength++;

    return { enablesStock: !!enablesStock, isFullChain, chainLength };

  } catch (e) {
    console.error('discard_buildSimChain Fehler:', e);
    return { enablesStock: false, isFullChain: false, chainLength: 0 };
  }
}
