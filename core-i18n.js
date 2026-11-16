// ================================================================
//  core-i18n.js  –  Skipo 7.0.4   Namensraum: I18n
//  SPRACHMODUL – drei Sprachen: Deutsch (Quelle), English, Português
// ----------------------------------------------------------------
//  Braucht: Events, Settings     Bietet: I18n.t / say / setLang
//
//  Regel 4 der Architektur: Meldungen sind SCHLÜSSEL, keine Sätze.
//    I18n.t('aiBuild', karte, quelle, 2, 1500)  → fertiger Text
//    I18n.say('aiBuild', ...)                    → Ereignis "msg"
//  Platzhalter {0}, {1}, … werden der Reihe nach ersetzt.
//  Spiellogik ruft nur say(); die Anzeige (Render) übersetzt beim
//  Anzeigen mit t(). Es gibt keinen Regex-Übersetzer mehr.
//
//  Neue Meldung ergänzen = hier EIN Eintrag mit de/en/pt.
// ================================================================

const I18n = {
  LANGS: ['de', 'en', 'pt'],
  lang:  'de',

  /** Sprache aus Settings übernehmen (beim Start). */
  init() {
    this.lang = this.LANGS.includes(Settings.lang) ? Settings.lang : 'de';
  },

  /** Text zum Schlüssel in der aktiven Sprache; Platzhalter {n} füllen. */
  t(key, ...args) {
    const entry = this.T[key];
    let s = entry ? (entry[this.lang] ?? entry.de) : key;
    return s.replace(/\{(\d)\}/g, (_, i) => args[i] !== undefined ? args[i] : '');
  },

  /** Meldung als Ereignis senden (die Anzeige übersetzt). */
  say(key, ...args) {
    Events.emit('msg', { key, args });
  },

  /** Sprache wechseln, speichern, Ereignis senden. */
  setLang(lang) {
    if (!this.LANGS.includes(lang)) return false;
    this.lang = lang;
    Settings.set('lang', lang);
    Events.emit('lang:change', lang);
    return true;
  },

  // ----------------------------------------------------------------
  // WÖRTERBUCH
  // ----------------------------------------------------------------
  T: {
    // ── Allgemein ──
    joker:        { de:'Joker', en:'Joker', pt:'Coringa' },
    you:          { de:'Du', en:'You', pt:'Tu' },
    ai:           { de:'KI', en:'AI', pt:'IA' },
    empty:        { de:'Leer', en:'Empty', pt:'Vazio' },
    langName:     { de:'Deutsch', en:'English', pt:'Português' },
    langSet:      { de:'🌐 Sprache: Deutsch', en:'🌐 Language: English', pt:'🌐 Idioma: Português' },
    langTitle:    { de:'🌐 Sprache wählen', en:'🌐 Choose language', pt:'🌐 Escolher idioma' },

    // ── Schnellmenü ──
    qmSettings:   { de:'⚙️ Einstellungen', en:'⚙️ Settings', pt:'⚙️ Definições' },
    qmDesign:     { de:'🎨 Design', en:'🎨 Design', pt:'🎨 Design' },
    qmRules:      { de:'📖 Spielregeln', en:'📖 Game rules', pt:'📖 Regras do jogo' },
    qmLang:       { de:'🌐 Sprache / Language', en:'🌐 Language', pt:'🌐 Idioma' },
    qmNewGame:    { de:'🔄 Neues Spiel', en:'🔄 New game', pt:'🔄 Novo jogo' },
    qmImprint:    { de:'📄 Impressum', en:'📄 Legal notice', pt:'📄 Aviso legal' },
    qmPrivacy:    { de:'🔒 Datenschutz', en:'🔒 Privacy', pt:'🔒 Privacidade' },
    qmClose:      { de:'✕ Schließen', en:'✕ Close', pt:'✕ Fechar' },

    // ── Design-Bedienfeld ──
    designTitle:  { de:'Hintergrund-Design', en:'Background design', pt:'Design de fundo' },
    designThemes: { de:'Themen', en:'Themes', pt:'Temas' },
    designFine:   { de:'Feinjustierung', en:'Fine-tuning', pt:'Ajuste fino' },
    designBright: { de:'Helligkeit', en:'Brightness', pt:'Brilho' },
    designHue:    { de:'Farbton', en:'Hue', pt:'Matiz' },
    designDone:   { de:'Fertig', en:'Done', pt:'Concluído' },

    // ── Einstellungen ──
    btnApply:     { de:'Übernehmen', en:'Apply', pt:'Aplicar' },
    btnClose:     { de:'Schließen', en:'Close', pt:'Fechar' },
    phName:       { de:'Spielername', en:'Player name', pt:'Nome do jogador' },
    speedLabel:   { de:'Pause je Schritt (0–2 s)', en:'Pause per step (0–2 s)', pt:'Pausa por passo (0–2 s)' },
    // ── KI-Schwierigkeit + KI-Planung ──
    kiLevelLabel: { de:'Schwierigkeit', en:'Difficulty', pt:'Dificuldade' },
    kiLevel_easy: { de:'Leicht', en:'Easy', pt:'Fácil' },
    kiLevel_medium:{ de:'Mittel', en:'Medium', pt:'Médio' },
    kiLevel_hard: { de:'Schwer', en:'Hard', pt:'Difícil' },
    kiPlanLabel:  { de:'KI-Planung', en:'AI planning', pt:'Planeamento da IA' },
    kiPlan_super: { de:'Superstark', en:'Super strong', pt:'Superforte' },
    kiPlan_normal:{ de:'Normal', en:'Normal', pt:'Normal' },
    kiHintLevel_easy:  { de:'Leicht: Die KI spielt ohne Blockade.', en:'Easy: the AI plays without blocking.', pt:'Fácil: a IA joga sem bloquear.' },
    kiHintLevel_medium:{ de:'Mittel: Die KI blockiert deine Stockkarte.', en:'Medium: the AI blocks your stock card.', pt:'Médio: a IA bloqueia a tua carta de reserva.' },
    kiHintLevel_hard:  { de:'Schwer: Die KI blockiert, spart Joker und legt klug ab.', en:'Hard: the AI blocks, saves jokers and discards wisely.', pt:'Difícil: a IA bloqueia, poupa coringas e descarta com cuidado.' },
    kiHintPlan_super:  { de:'Superstark: Sie plant mit den verdeckten Karten ihres eigenen Stocks.', en:'Super strong: it plans with the face-down cards of its own stock.', pt:'Superforte: planeia com as cartas viradas para baixo da sua própria reserva.' },
    kiHintPlan_normal: { de:'Normal: Sie kennt nur ihre oberste Stockkarte – wie du.', en:'Normal: it only knows its top stock card – just like you.', pt:'Normal: só conhece a carta de cima da sua reserva – tal como tu.' },
    kiChanged:    { de:'🤖 KI-Stärke: {0} · {1}', en:'🤖 AI strength: {0} · {1}', pt:'🤖 Força da IA: {0} · {1}' },

    // ── Bestätigungen ──
    confirmNewGame:    { de:'Neues Spiel starten? Das aktuelle Spiel wird beendet.',
                         en:'Start a new game? The current game will end.',
                         pt:'Iniciar um novo jogo? O jogo atual será terminado.' },

    // ── Spielende ──
    endTitle:     { de:'🏁 Spiel beendet!', en:'🏁 Game over!', pt:'🏁 Fim do jogo!' },
    winner:       { de:'Gewinner', en:'Winner', pt:'Vencedor' },
    loser:        { de:'Verlierer', en:'Loser', pt:'Perdedor' },
    withPoints:   { de:'mit <strong>{0} Punkten</strong>', en:'with <strong>{0} points</strong>', pt:'com <strong>{0} pontos</strong>' },
    btnNewGame:   { de:'🔄 Neues Spiel', en:'🔄 New game', pt:'🔄 Novo jogo' },

    // ── Vergleich beider Seiten (Endscreen) ──
    cmpTitle:     { de:'Vergleich dieses Spiels', en:'This game compared', pt:'Comparação deste jogo' },
    cmpAvgTitle:  { de:'Durchschnitt der letzten {0} Spiele', en:'Average of the last {0} games', pt:'Média dos últimos {0} jogos' },
    cmpYou:       { de:'Du', en:'You', pt:'Tu' },
    cmpStock:     { de:'Stockkarten gelegt', en:'Stock cards played', pt:'Cartas de reserva jogadas' },
    cmpHand:      { de:'Handkarten gelegt', en:'Hand cards played', pt:'Cartas da mão jogadas' },
    cmpCombo:     { de:'Ablage→Bau', en:'Discard→Build', pt:'Descarte→Construção' },
    cmpMissed:    { de:'Stockkarte liegen gelassen', en:'Stock card left unplayed', pt:'Carta de reserva não jogada' },
    cmpOpened:    { de:'Stapel für Gegner geöffnet', en:'Pile opened for opponent', pt:'Pilha aberta ao adversário' },
    cmpTurns:     { de:'Züge', en:'Turns', pt:'Jogadas' },
    cmpWins:      { de:'Siege', en:'Wins', pt:'Vitórias' },
    tipMissed:    { de:'💡 Lege deine Stockkarte, sobald sie passt – {0}× hast du sie liegen gelassen.',
                    en:'💡 Play your stock card as soon as it fits – you left it {0} times.',
                    pt:'💡 Joga a tua carta de reserva assim que encaixar – deixaste-a {0} vezes.' },
    tipOpened:    { de:'💡 Achte auf die Stockkarte der KI: {0}× stand am Zugende ein Stapel für sie offen.',
                    en:'💡 Watch the AI’s stock card: {0} times a pile was open for it at the end of your turn.',
                    pt:'💡 Atenção à carta de reserva da IA: {0} vezes ficou uma pilha aberta para ela.' },
    tipGood:      { de:'👍 Stockkarte nie liegen gelassen und keinen Stapel geöffnet – stark gespielt!',
                    en:'👍 Never left your stock card and never opened a pile – well played!',
                    pt:'👍 Nunca deixaste a carta de reserva nem abriste uma pilha – bem jogado!' },

    // ── Feldbeschriftungen (Live-Zähler) ──
    lblStockOpp:  { de:'🗃️ Gegner Stock ({0})', en:'🗃️ Opponent stock ({0})', pt:'🗃️ Reserva do adversário ({0})' },
    lblStockSelf: { de:' Spieler Stock ({0})', en:' Your stock ({0})', pt:' A tua reserva ({0})' },
    lblAblage:    { de:'🗑️ Ablage {0}', en:'🗑️ Discard {0}', pt:'🗑️ Descarte {0}' },
    lblBau:       { de:'▲ Bau {0} ({1})', en:'▲ Build {0} ({1})', pt:'▲ Construção {0} ({1})' },
    lblNachzieh:  { de:'🃏 Nachziehstapel ({0})', en:'🃏 Draw pile ({0})', pt:'🃏 Pilha de compra ({0})' },
    tagBlock:     { de:'⛔ Blockade {0} ({1}%)', en:'⛔ Block {0} ({1}%)', pt:'⛔ Bloqueio {0} ({1}%)' },

    // ── Quellen- und Kartenbezeichnungen (Bausteine für Meldungen) ──
    srcHandN:     { de:'✋ Hand-{0}', en:'✋ Hand {0}', pt:'✋ Mão {0}' },
    srcHand:      { de:'✋ Hand', en:'✋ hand', pt:'✋ mão' },
    srcStock:     { de:'🗃️ Stock', en:'🗃️ stock', pt:'🗃️ reserva' },
    srcDiscardN:  { de:'🗑️ Ablage-{0}', en:'🗑️ Discard {0}', pt:'🗑️ Descarte {0}' },
    srcDiscard:   { de:'🗑️ Ablage', en:'🗑️ discard', pt:'🗑️ descarte' },
    jokerLabel:   { de:'★ Joker', en:'★ Joker', pt:'★ Coringa' },
    jokerAs:      { de:'★ Joker (als {0})', en:'★ Joker (as {0})', pt:'★ Coringa (como {0})' },

    // ── KI-Begründungen (Joker) ──
    rsnStockAdv:  { de:'direkter Stockvorteil ({0} Folgezüge)', en:'direct stock advantage ({0} follow-up moves)', pt:'vantagem direta na reserva ({0} jogadas seguintes)' },
    rsnFollow:    { de:'{0} Folgezüge möglich', en:'{0} follow-up moves possible', pt:'{0} jogadas seguintes possíveis' },
    rsnNoPile:    { de:'kein geeigneter Baustapel', en:'no suitable build pile', pt:'nenhuma construção adequada' },

    // ── Statusmeldungen: Spielablauf ──
    shuffling:    { de:'🎮 Spielstart: Karten werden gemischt...', en:'🎮 Game start: shuffling cards...', pt:'🎮 Início do jogo: a baralhar cartas...' },
    gameStart:    { de:'🎮 Spiel gestartet – du bist am Zug!', en:'🎮 Game started – your turn!', pt:'🎮 Jogo iniciado – é a tua vez!' },
    yourTurn:     { de:'👤 Dein Zug! – Karte auswählen', en:'👤 Your turn! – Select a card', pt:'👤 É a tua vez! – Escolhe uma carta' },
    chooseCard:   { de:'✋ Wähle eine Karte aus deiner Hand, Stock oder Ablage', en:'✋ Choose a card from your hand, stock or discard', pt:'✋ Escolhe uma carta da mão, da reserva ou do descarte' },
    waitAi:       { de:'⏳ Warte – KI ist am Zug!', en:'⏳ Wait – it\u2019s the AI\u2019s turn!', pt:'⏳ Espera – é a vez da IA!' },
    aiTurn:       { de:'🤖 KI ist am Zug...', en:'🤖 AI is taking its turn...', pt:'🤖 A IA está a jogar...' },
    noMoveAuto:   { de:'ℹ️ Keine Handkarte und kein Bauzug möglich – KI ist am Zug', en:'ℹ️ No hand card and no build move possible – AI\u2019s turn', pt:'ℹ️ Sem carta na mão e sem jogada possível – vez da IA' },

    // ── Statusmeldungen: Spieler ──
    selected:     { de:'✅ {0} aus {1} gewählt – Ziel antippen', en:'✅ {0} selected from {1} – tap a target', pt:'✅ {0} escolhida de {1} – toca no destino' },
    deselected:   { de:'❌ Auswahl aufgehoben', en:'❌ Selection cancelled', pt:'❌ Seleção cancelada' },
    cardToBuild:  { de:'✅ Karte {0} → 🏗️ Bau {1}', en:'✅ Card {0} → 🏗️ Build {1}', pt:'✅ Carta {0} → 🏗️ Construção {1}' },
    cardToDiscard:{ de:'✅ Karte {0} → 🗑️ Ablage {1} – KI am Zug', en:'✅ Card {0} → 🗑️ Discard {1} – AI\u2019s turn', pt:'✅ Carta {0} → 🗑️ Descarte {1} – vez da IA' },
    notAllowed:   { de:'❌ Dieser Zug ist nicht erlaubt', en:'❌ This move is not allowed', pt:'❌ Esta jogada não é permitida' },
    stockNoDiscard:{ de:'❌ {0}: Stockkarten dürfen nicht abgelegt werden!', en:'❌ {0}: stock cards must not be discarded!', pt:'❌ {0}: cartas de reserva não podem ir para o descarte!' },
    selectFirst:  { de:'⚠️ Bitte zuerst eine Karte auswählen', en:'⚠️ Please select a card first', pt:'⚠️ Primeiro escolhe uma carta' },
    nameChanged:  { de:'✅ Spielername geändert: {0}', en:'✅ Player name changed: {0}', pt:'✅ Nome do jogador alterado: {0}' },

    // ── Statusmeldungen: KI ──
    aiPrepare:    { de:'🤖 KI bereitet Zug vor...', en:'🤖 AI is preparing its move...', pt:'🤖 A IA prepara a jogada...' },
    aiAnalyze:    { de:'🔍 KI analysiert Spielfeld...', en:'🔍 AI is analyzing the board...', pt:'🔍 A IA analisa o tabuleiro...' },
    aiCompute:    { de:'🧠 KI berechnet besten Zug...', en:'🧠 AI is computing the best move...', pt:'🧠 A IA calcula a melhor jogada...' },
    aiChainStock: { de:'🧠 KI plant Kettenzug: {0} Züge, {1}× Stockabbau', en:'🧠 AI plans a chain: {0} moves, {1}× stock reduction', pt:'🧠 A IA planeia uma cadeia: {0} jogadas, {1}× redução da reserva' },
    aiChainClear: { de:'🧠 KI plant Kettenzug: {0} Züge – komplette Hand wird gespielt!', en:'🧠 AI plans a chain: {0} moves – playing the entire hand!', pt:'🧠 A IA planeia uma cadeia: {0} jogadas – joga a mão inteira!' },
    aiChainMove:  { de:'🤖 KI (Kette {0}/{1}): {2} von {3} → 🏗️ Bau {4}', en:'🤖 AI (chain {0}/{1}): {2} from {3} → 🏗️ Build {4}', pt:'🤖 IA (cadeia {0}/{1}): {2} de {3} → 🏗️ Construção {4}' },
    aiBuild:      { de:'🤖 KI: {0} von {1} → 🏗️ Bau {2} (Score: {3})', en:'🤖 AI: {0} from {1} → 🏗️ Build {2} (score: {3})', pt:'🤖 IA: {0} de {1} → 🏗️ Construção {2} (pontuação: {3})' },
    aiCombo:      { de:'🔄 KI Kombinationszug #{0} – {1}', en:'🔄 AI combo move #{0} – {1}', pt:'🔄 Jogada combinada da IA #{0} – {1}' },
    aiStockPlay:  { de:'🗃️ KI legt Stockkarte {0} → 🏗️ Bau {1}', en:'🗃️ AI plays stock card {0} → 🏗️ Build {1}', pt:'🗃️ A IA joga a carta de reserva {0} → 🏗️ Construção {1}' },
    aiStockPrio:  { de:'🗃️ KI priorisiert Stockkarte {0} → 🏗️ Bau {1}', en:'🗃️ AI prioritizes stock card {0} → 🏗️ Build {1}', pt:'🗃️ A IA dá prioridade à carta de reserva {0} → 🏗️ Construção {1}' },
    aiJokerStock: { de:'★ KI: Joker aus Stock → 🏗️ Bau {0} ({1})', en:'★ AI: joker from stock → 🏗️ Build {0} ({1})', pt:'★ IA: coringa da reserva → 🏗️ Construção {0} ({1})' },
    aiJokerKeep:  { de:'★ KI: Joker im Stock wird aufgespart ({0})', en:'★ AI: keeping the joker in the stock ({0})', pt:'★ IA: guarda o coringa na reserva ({0})' },
    aiJokerCombo: { de:'★ KI: Joker-Kombo! Erst Ablage {0}, dann Joker → Bau {1}', en:'★ AI: joker combo! First discard {0}, then joker → Build {1}', pt:'★ IA: combinação de coringa! Primeiro descarte {0}, depois coringa → Construção {1}' },
    aiJokerDone:  { de:'★ KI: Joker → Bau {0} ✅', en:'★ AI: joker → Build {0} ✅', pt:'★ IA: coringa → Construção {0} ✅' },
    aiJokerDirect:{ de:'★ KI: Joker direkt → 🏗️ Bau {0}', en:'★ AI: joker directly → 🏗️ Build {0}', pt:'★ IA: coringa diretamente → 🏗️ Construção {0}' },
    aiPickDiscard:{ de:'🤖 KI wählt Karte {0} zum Ablegen', en:'🤖 AI picks card {0} to discard', pt:'🤖 A IA escolhe a carta {0} para descartar' },
    aiDiscard:    { de:'🤖 KI legt {0} → 🗑️ Ablage {1}', en:'🤖 AI plays {0} → 🗑️ Discard {1}', pt:'🤖 A IA joga {0} → 🗑️ Descarte {1}' },
    aiDiscarding: { de:'🤖 KI legt Karte auf Ablagestapel...', en:'🤖 AI is placing a card on a discard pile...', pt:'🤖 A IA coloca uma carta num descarte...' },
    aiRedraw:     { de:'🃏 KI hat alle Handkarten gespielt – zieht 5 neue!', en:'🃏 AI played all hand cards – drawing 5 new ones!', pt:'🃏 A IA jogou todas as cartas da mão – compra 5 novas!' },
    aiDraw:       { de:'🃏 KI zieht Karten nach...', en:'🃏 AI is drawing cards...', pt:'🃏 A IA compra cartas...' },
    aiNoHand:     { de:'ℹ️ KI hat keine Handkarten mehr – kein Pflichtablegen', en:'ℹ️ AI has no hand cards left – no mandatory discard', pt:'ℹ️ A IA não tem cartas na mão – sem descarte obrigatório' },
    aiNoHandToDiscard:{ de:'⚠️ Keine Handkarten zum Ablegen', en:'⚠️ No hand cards to discard', pt:'⚠️ Sem cartas na mão para descartar' },
    aiDiscardFailed:{ de:'⚠️ Ablage fehlgeschlagen!', en:'⚠️ Discard failed!', pt:'⚠️ Falha no descarte!' },
    aiEnd:        { de:'✅ KI beendet Zug – Spielerwechsel', en:'✅ AI ends its turn – switching players', pt:'✅ A IA termina a jogada – troca de jogador' },

    // ── Spielregeln (Einstellungen-Fenster) ──
    rulesHtml: {
de: `
    <h2>Spielregeln und Benutzerinformationen</h2>

    <p><strong>1. Ziel des Spiels:</strong><br>
    - Das Hauptziel ist es, alle Karten aus deinem Stockstapel abzulegen, um das Spiel zu gewinnen.<br>
    - Du kannst Karten auf die Baukartenstapel in aufsteigender Reihenfolge von 1 bis 12 ablegen.<br>
    - Joker können jede Karte ersetzen und haben keinen festen Wert.</p>

    <p><strong>2. Kartentypen:</strong><br>
    - Zahlenkarten: Karten mit Werten von 1 bis 12.<br>
    - Joker (★): Kann jede Karte ersetzen und wird flexibel verwendet.</p>

    <p><strong>3. Kartenmengen:</strong><br>
    - 144 Zahlenkarten (12 Sätze × 12 Karten) + 12 Joker = 156 Karten gesamt.</p>

    <p><strong>4. Spielstart:</strong><br>
    - Jeder Spieler erhält 5 Handkarten und 20 Stockkarten.<br>
    - Die restlichen Karten bilden den Nachziehstapel.</p>

    <p><strong>5. Spielverlauf:</strong><br>
    - Spieler legen abwechselnd Karten auf Baustapel oder Ablagestapel.<br>
    - Baustapel: aufsteigende Reihenfolge 1–12. Joker ersetzt jeden Wert.<br>
    - Vollständiger Baustapel (1–12) wird geleert und gemischt.<br>
    - Nachziehen bis 5 Handkarten vorhanden.<br>
    - Kein legaler Zug möglich → Karte auf Ablagestapel legen (Pflichtzug).<br>
    - Langes Drücken auf Ablagestapel: Karteninhalt anzeigen.</p>

    <p><strong>6. Spieleraktionen:</strong><br>
    - Karte antippen = Karte auswählen (leuchtet auf).<br>
    - Nochmals antippen = Auswahl aufheben.<br>
    - Zielstapel antippen = Karte dorthin legen.<br>
    - Infoleiste verschieben für optimale Sicht.</p>

    <p><strong>7. Spielgeschwindigkeit:</strong><br>
    - Schieberegler: 0 s (ohne Pause, Standard) bis 2 s (sehr langsam), in Schritten von 0,1 s.<br>
    - Mehr Pause hilft, die Züge der KI nachzuvollziehen.</p>

    <p><strong>8. Spielende:</strong><br>
    - Wer zuerst seinen Stock leer hat, gewinnt.<br>
    - Verlierer erhält 5 Punkte pro verbleibender Stockkarte.</p>

    <p><strong>9. Hinweise:</strong><br>
    - ⚙️-Menü → Spielregeln: Dieses Fenster erneut öffnen.<br>
    - Infoleiste nach unten schieben für mehr Platz.</p>
  `,
en: `
    <h2>Game Rules and User Information</h2>

    <p><strong>1. Goal of the game:</strong><br>
    - The main goal is to play all cards from your stock pile to win the game.<br>
    - You can play cards onto the build piles in ascending order from 1 to 12.<br>
    - Jokers can replace any card and have no fixed value.</p>

    <p><strong>2. Card types:</strong><br>
    - Number cards: cards with values from 1 to 12.<br>
    - Joker (★): can replace any card and is used flexibly.</p>

    <p><strong>3. Card counts:</strong><br>
    - 144 number cards (12 sets × 12 cards) + 12 jokers = 156 cards in total.</p>

    <p><strong>4. Game start:</strong><br>
    - Each player receives 5 hand cards and 20 stock cards.<br>
    - The remaining cards form the draw pile.</p>

    <p><strong>5. Gameplay:</strong><br>
    - Players take turns playing cards onto build piles or discard piles.<br>
    - Build piles: ascending order 1–12. A joker replaces any value.<br>
    - A completed build pile (1–12) is cleared and shuffled back in.<br>
    - Draw back up to 5 hand cards.<br>
    - No legal move possible → place a card on a discard pile (mandatory).<br>
    - Long press on a discard pile: show its contents.</p>

    <p><strong>6. Player actions:</strong><br>
    - Tap a card = select it (it lights up).<br>
    - Tap again = deselect.<br>
    - Tap a target pile = play the card there.<br>
    - Move the info bar for the best view.</p>

    <p><strong>7. Game speed:</strong><br>
    - Slider: 0 s (no pause, default) to 2 s (very slow), in steps of 0.1 s.<br>
    - A longer pause makes the AI's moves easier to follow.</p>

    <p><strong>8. End of game:</strong><br>
    - Whoever empties their stock first wins.<br>
    - The loser scores 5 points per remaining stock card.</p>

    <p><strong>9. Notes:</strong><br>
    - ⚙️ menu → Game rules: reopen this window.<br>
    - Slide the info bar down for more space.</p>
  `,
pt: `
    <h2>Regras do Jogo e Informações</h2>

    <p><strong>1. Objetivo do jogo:</strong><br>
    - O objetivo principal é jogar todas as cartas da tua pilha de reserva para vencer.<br>
    - Podes jogar cartas nas pilhas de construção em ordem crescente, de 1 a 12.<br>
    - Os coringas substituem qualquer carta e não têm valor fixo.</p>

    <p><strong>2. Tipos de cartas:</strong><br>
    - Cartas numéricas: valores de 1 a 12.<br>
    - Coringa (★): substitui qualquer carta, de forma flexível.</p>

    <p><strong>3. Quantidade de cartas:</strong><br>
    - 144 cartas numéricas (12 conjuntos × 12 cartas) + 12 coringas = 156 cartas no total.</p>

    <p><strong>4. Início do jogo:</strong><br>
    - Cada jogador recebe 5 cartas na mão e 20 cartas de reserva.<br>
    - As restantes formam a pilha de compra.</p>

    <p><strong>5. Decurso do jogo:</strong><br>
    - Os jogadores jogam alternadamente nas construções ou nos descartes.<br>
    - Construções: ordem crescente 1–12. O coringa substitui qualquer valor.<br>
    - Uma construção completa (1–12) é esvaziada e baralhada de volta.<br>
    - Compra-se até ter 5 cartas na mão.<br>
    - Sem jogada legal → colocar uma carta num descarte (obrigatório).<br>
    - Toque longo num descarte: mostrar o conteúdo.</p>

    <p><strong>6. Ações do jogador:</strong><br>
    - Tocar numa carta = selecionar (acende).<br>
    - Tocar de novo = cancelar a seleção.<br>
    - Tocar na pilha de destino = jogar a carta.<br>
    - Move a barra de informação para melhor visão.</p>

    <p><strong>7. Velocidade do jogo:</strong><br>
    - Controlo: 0 s (sem pausa, predefinição) a 2 s (muito lento), em passos de 0,1 s.<br>
    - Uma pausa maior ajuda a acompanhar as jogadas da IA.</p>

    <p><strong>8. Fim do jogo:</strong><br>
    - Vence quem esvaziar primeiro a sua reserva.<br>
    - O perdedor recebe 5 pontos por carta de reserva restante.</p>

    <p><strong>9. Dicas:</strong><br>
    - Menu ⚙️ → Regras do jogo: reabrir esta janela.<br>
    - Desliza a barra de informação para baixo para mais espaço.</p>
  `
    }
  }
};
