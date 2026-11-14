// ================================================================
//  ui-overlays.js  –  Skipo 7.0.1   Namensraum: Overlays
//  EINSTELLUNGEN · DESIGN · SPRACHE · SPIELENDE · INFO-FENSTER
// ----------------------------------------------------------------
//  Braucht: State, Events, I18n, Settings, Tracking     Bietet: Overlays.*
//
//  Alle Overlays werden beim ersten Aufruf gebaut, danach nur noch
//  ein-/ausgeblendet. Texte kommen aus I18n; beim Sprachwechsel
//  werden sie neu gesetzt. Alle Stile stehen in style.css (keine
//  Inline-Styles, keine CSS-Injektion per JS mehr).
// ================================================================

const Overlays = {

  init() {
    Events.on('game:over',   w => this.showEnd(w));
    Events.on('lang:change', () => this.texts());
  },

  /** Alle bereits gebauten Overlays neu beschriften. */
  texts() {
    const ov = document.getElementById('overlay-container');
    if (ov) {
      ov.querySelector('#btn-uebernehmen').textContent = I18n.t('btnApply');
      ov.querySelector('#btn-schliessen').textContent  = I18n.t('btnClose');
      ov.querySelector('#input-name').placeholder      = I18n.t('phName');
      ov.querySelector('.speed-label').textContent     = I18n.t('speedLabel');
      ov.querySelector('#overlay-info').innerHTML      = I18n.t('rulesHtml');
      // 7.0.3: KI-Schwierigkeit + KI-Planung
      ov.querySelector('#ki-level-label').textContent  = I18n.t('kiLevelLabel');
      ov.querySelector('#ki-plan-label').textContent   = I18n.t('kiPlanLabel');
      ov.querySelectorAll('#ki-level button').forEach(b => { b.textContent = I18n.t('kiLevel_' + b.dataset.v); });
      ov.querySelectorAll('#ki-plan button').forEach(b => { b.textContent = I18n.t('kiPlan_' + b.dataset.v); });
      this.kiHint();
    }
    const dv = document.getElementById('design-overlay');
    if (dv) {
      dv.querySelector('h2').textContent = '🎨 ' + I18n.t('designTitle');
      const secs = dv.querySelectorAll('.design-sec');
      secs[0].textContent = I18n.t('designThemes');
      secs[1].textContent = I18n.t('designFine');
      dv.querySelector('label[for=design-lrange] span').textContent = I18n.t('designBright');
      dv.querySelector('label[for=design-hrange] span').textContent = I18n.t('designHue');
      dv.querySelector('#design-close').textContent = I18n.t('designDone');
    }
    const lo = document.getElementById('lang-overlay');
    if (lo) lo.querySelector('#lang-title').textContent = I18n.t('langTitle');
  },

  // ----------------------------------------------------------------
  // EINSTELLUNGEN (Name, Tempo, Spielregeln, KI-Schwierigkeit, KI-Planung)
  // ----------------------------------------------------------------

  showSettings() {
    let ov = document.getElementById('overlay-container');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'overlay-container';
      ov.innerHTML = `
      <div id="overlay-header">
        <button id="btn-uebernehmen"></button>
        <input type="text" id="input-name">
        <button id="btn-schliessen"></button>
      </div>
      <div id="overlay-info"></div>
      <div class="ki-control-container">
        <div class="ki-row">
          <span class="ki-label" id="ki-level-label"></span>
          <div class="ki-seg" id="ki-level" role="group">
            <button type="button" data-v="easy"></button>
            <button type="button" data-v="medium"></button>
            <button type="button" data-v="hard"></button>
          </div>
        </div>
        <div class="ki-row">
          <span class="ki-label" id="ki-plan-label"></span>
          <div class="ki-seg" id="ki-plan" role="group">
            <button type="button" data-v="super"></button>
            <button type="button" data-v="normal"></button>
          </div>
        </div>
        <div class="ki-hint" id="ki-hint"></div>
      </div>
      <div class="speed-control-container">
        <span class="speed-label"></span>
        <input type="range" class="speed-slider" id="speed-slider" min="0" max="20" step="1">
        <span class="speed-label" id="speed-value"></span>
      </div>`;
      document.body.appendChild(ov);

      ov.querySelector('#btn-uebernehmen').addEventListener('click', () => {
        const newName = ov.querySelector('#input-name').value.trim();
        if (newName && newName !== Settings.name) {
          Settings.set('name', newName);
          I18n.say('nameChanged', newName);
        }
        Settings.set('speed', parseInt(ov.querySelector('#speed-slider').value, 10));
        Settings.set('nameSet', true);
        // 7.0.3: KI-Schwierigkeit + KI-Planung (gilt ab dem nächsten KI-Zug)
        const level = this.kiChoice('ki-level'), plan = this.kiChoice('ki-plan');
        if (level !== Settings.level || plan !== Settings.planning) {
          Settings.set('level', level);
          Settings.set('planning', plan);
          I18n.say('kiChanged', I18n.t('kiLevel_' + level), I18n.t('kiPlan_' + plan));
        }
        this.hideSettings();
      });
      ov.querySelectorAll('.ki-seg').forEach(seg => seg.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        this.kiSelect(seg.id, b.dataset.v);
      }));
      ov.querySelector('#speed-slider').addEventListener('input', e => {
        ov.querySelector('#speed-value').textContent = `${e.target.value}s`;
      });
      ov.querySelector('#btn-schliessen').addEventListener('click', () => this.hideSettings());
      this.texts();
    }
    ov.querySelector('#input-name').value        = Settings.name;
    ov.querySelector('#speed-slider').value      = Settings.speed;
    ov.querySelector('#speed-value').textContent = `${Settings.speed}s`;
    this.kiSelect('ki-level', Settings.level);
    this.kiSelect('ki-plan',  Settings.planning);
    ov.style.display = 'block';
  },

  /** Auswahl in einer Schaltergruppe markieren (noch nicht gespeichert – erst „Übernehmen"). */
  kiSelect(groupId, value) {
    const seg = document.getElementById(groupId);
    if (!seg) return;
    seg.querySelectorAll('button').forEach(b => {
      const on = b.dataset.v === value;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    this.kiHint();
  },

  /** Aktuell markierter Wert einer Schaltergruppe. */
  kiChoice(groupId) {
    const b = document.querySelector('#' + groupId + ' button.active');
    return b ? b.dataset.v : null;
  },

  /** Erklärzeile unter der KI-Auswahl. */
  kiHint() {
    const el = document.getElementById('ki-hint');
    if (!el) return;
    const level = this.kiChoice('ki-level') || Settings.level;
    const plan  = this.kiChoice('ki-plan')  || Settings.planning;
    el.textContent = I18n.t('kiHintLevel_' + level) + ' ' + I18n.t('kiHintPlan_' + plan);
  },

  hideSettings() {
    const ov = document.getElementById('overlay-container');
    if (ov) ov.style.display = 'none';
  },

  // ----------------------------------------------------------------
  // DESIGN (Hintergrund-Themen + Regler, durchscheinendes Bedienfeld)
  // ----------------------------------------------------------------

  showDesign() {
    let ov = document.getElementById('design-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'design-overlay';
      ov.className = 'design-overlay';
      ov.innerHTML = `
      <div class="design-panel">
        <div class="design-handle"></div>
        <h2></h2>
        <div class="design-sec"></div>
        <div class="design-themes" id="design-themes"></div>
        <div class="design-sec"></div>
        <div class="design-ctrl">
          <label for="design-lrange"><span></span><span id="design-lval"></span></label>
          <input type="range" id="design-lrange" min="8" max="32" step="1">
        </div>
        <div class="design-ctrl">
          <label for="design-hrange"><span></span><span id="design-hval"></span></label>
          <input type="range" id="design-hrange" min="0" max="360" step="1">
        </div>
        <button class="design-close" id="design-close"></button>
      </div>`;
      document.body.appendChild(ov);

      const grid = ov.querySelector('#design-themes');
      Settings.THEMES.forEach(th => {
        const d = document.createElement('div');
        d.className = 'design-theme';
        d.innerHTML =
          `<div class="design-sw" style="background:radial-gradient(ellipse at 50% 30%,`
          + `hsl(${th.h},${th.s}%,${th.l + 8}%),hsl(${th.h},${th.s}%,${th.l}%))"></div>${th.name}`;
        d.addEventListener('click', () => {
          Settings.set('bg', { h: th.h, s: th.s, l: th.l });
          this.syncDesign(true);
        });
        grid.appendChild(d);
      });

      const hR = ov.querySelector('#design-hrange');
      const lR = ov.querySelector('#design-lrange');
      const onSlide = () => {
        Settings.set('bg', { h: parseInt(hR.value, 10), s: Settings.bg.s, l: parseInt(lR.value, 10) });
        this.syncDesign(false);
      };
      hR.addEventListener('input', onSlide);
      lR.addEventListener('input', onSlide);
      ov.querySelector('#design-close').addEventListener('click', () => ov.classList.remove('open'));
      this.texts();
    }
    this.syncDesign(true);
    ov.classList.add('open');
  },

  /** Regler/Theme-Markierung an Settings.bg angleichen. */
  syncDesign(updateSliders) {
    const ov = document.getElementById('design-overlay');
    if (!ov) return;
    const bg = Settings.bg;
    if (updateSliders) {
      ov.querySelector('#design-hrange').value = bg.h;
      ov.querySelector('#design-lrange').value = bg.l;
    }
    ov.querySelector('#design-hval').textContent = bg.h + '°';
    ov.querySelector('#design-lval').textContent = bg.l + '%';
    ov.querySelectorAll('.design-theme').forEach((el, i) => {
      const th = Settings.THEMES[i];
      el.classList.toggle('active', th.h === bg.h && th.s === bg.s && th.l === bg.l);
    });
  },

  // ----------------------------------------------------------------
  // SPRACHE
  // ----------------------------------------------------------------

  showLanguage() {
    let lo = document.getElementById('lang-overlay');
    if (!lo) {
      lo = document.createElement('div');
      lo.id = 'lang-overlay';
      lo.className = 'lang-overlay';
      const flags = { de: '🇩🇪', en: '🇬🇧', pt: '🇵🇹' };
      const btns  = I18n.LANGS.map(code =>
        `<button class="lang-btn" data-lang="${code}">${flags[code] || '🌐'} ${I18n.T.langName[code]}</button>`).join('');
      lo.innerHTML = `
      <div class="lang-box">
        <div id="lang-title" class="lang-title"></div>
        ${btns}
        <button id="lang-cancel" class="lang-cancel">✕</button>
      </div>`;
      document.body.appendChild(lo);

      lo.querySelectorAll('button[data-lang]').forEach(b => {
        const choose = e => {
          e.preventDefault();
          I18n.setLang(b.getAttribute('data-lang'));
          lo.style.display = 'none';
          I18n.say('langSet');
        };
        b.addEventListener('click', choose);
        b.addEventListener('touchstart', choose, { passive: false });
      });
      lo.querySelector('#lang-cancel').addEventListener('click', () => { lo.style.display = 'none'; });
      lo.addEventListener('click', e => { if (e.target === lo) lo.style.display = 'none'; });
      this.texts();
    }
    lo.style.display = 'flex';
  },

  // ----------------------------------------------------------------
  // SPIELENDE (Ergebnis + Tuner-Auswertung)
  // ----------------------------------------------------------------

  showEnd(result) {
    const winnerName = result.winner === 'ai' ? I18n.t('ai') : Settings.name;
    const loserName  = result.loser  === 'ai' ? I18n.t('ai') : Settings.name;
    const spiele     = Tracking.stats.spiele;
    const ready      = spiele >= 5;
    const btnLabel   = ready ? I18n.t('btnTunerReady', spiele) : I18n.t('btnTunerWait', 5 - spiele);

    const overlay = document.createElement('div');
    overlay.id = 'end-game-overlay';
    overlay.className = 'end-overlay';
    overlay.innerHTML = `
    <div class="end-box">
      <h1 class="end-title">${I18n.t('endTitle')}</h1>
      <div class="end-result">
        <div>🏆 <strong>${I18n.t('winner')}:</strong> ${winnerName} 🎉</div>
        <div>💀 <strong>${I18n.t('loser')}:</strong> ${loserName} ${I18n.t('withPoints', result.points)}</div>
      </div>
      ${this.compareHTML()}
      <div class="end-buttons">
        <button id="btn-restart" class="end-btn end-btn-restart">${I18n.t('btnNewGame')}</button>
        <button id="btn-auswertung" class="end-btn end-btn-tuner ${ready ? 'ready' : ''}">${btnLabel}</button>
      </div>
      <div id="tuner-panel" style="display:none;">
        <div class="tuner-scroll">${this.tunerAnalysisHTML()}</div>
      </div>
    </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#btn-restart').addEventListener('click', e => {
      e.preventDefault();
      overlay.remove();
      location.reload();
    });
    overlay.querySelector('#btn-auswertung').addEventListener('click', e => {
      e.preventDefault();
      if (!ready) return;
      const panel = overlay.querySelector('#tuner-panel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
  },

  /** Vergleich beider Seiten: dieses Spiel + Durchschnitt (7.0.2). */
  compareHTML() {
    const g = Tracking.last;
    if (!g) return '';
    const avg  = Tracking.averages();
    const rows = [['cmpStock', 'stock'], ['cmpHand', 'hand'], ['cmpCombo', 'combo'],
                  ['cmpMissed', 'missed'], ['cmpOpened', 'opened'], ['cmpTurns', 'turns']];
    const f = v => Number.isInteger(v) ? v : v.toFixed(1);
    const table = (h, a, title, extra) => `
      <div class="cmp-title">${title}</div>
      <table class="cmp-table">
        <tr><th></th><th>${I18n.t('cmpYou')}</th><th>${I18n.t('ai')}</th></tr>
        ${rows.map(([k, f2]) => `<tr><td>${I18n.t(k)}</td><td>${f(h[f2])}</td><td>${f(a[f2])}</td></tr>`).join('')}
        ${extra || ''}
      </table>`;
    let tips = '';
    if (g.human.missed > 0) tips += `<div class="cmp-tip">${I18n.t('tipMissed', g.human.missed)}</div>`;
    if (g.human.opened > 0) tips += `<div class="cmp-tip">${I18n.t('tipOpened', g.human.opened)}</div>`;
    if (!tips) tips = `<div class="cmp-tip">${I18n.t('tipGood')}</div>`;
    const strength = `<div class="cmp-level">${I18n.t('kiChanged', I18n.t('kiLevel_' + Settings.level), I18n.t('kiPlan_' + Settings.planning))}</div>`;
    let html = `<div class="cmp-box">${strength}${table(g.human, g.ai, I18n.t('cmpTitle'))}${tips}`;
    if (avg.games >= 2) {
      const winsRow = `<tr><td>${I18n.t('cmpWins')}</td><td>${avg.human.wins}</td><td>${avg.ai.wins}</td></tr>`;
      html += table(avg.human, avg.ai, I18n.t('cmpAvgTitle', avg.games), winsRow);
    }
    return html + '</div>';
  },

  /** 5-Spiele-Tuner-Auswertung als HTML (Schwellen 1:1 aus 6.6.0). */
  tunerAnalysisHTML() {
    const s = Tracking.stats;
    if (s.spiele < 5) {
      return `<p class="ta-wait">${I18n.t('taNeedMore', 5 - s.spiele)}<br>${I18n.t('taTotal')}: ${s.spiele}/5</p>`;
    }

    const jokerRate      = s.jokerGespielt / s.spiele;
    const jokerWasteRate = s.jokerGespielt > 0 ? s.jokerVerschwendet / s.jokerGespielt : 0;
    let jokerStatus, jokerEmoji, jokerHinweis;
    if (jokerWasteRate > 0.4) { jokerStatus = '🔴'; jokerEmoji = I18n.t('taJokerBad'); jokerHinweis = I18n.t('taJokerBadTip'); }
    else if (jokerRate < 1)   { jokerStatus = '🟡'; jokerEmoji = I18n.t('taJokerFew'); jokerHinweis = I18n.t('taJokerFewTip'); }
    else                      { jokerStatus = '🟢'; jokerEmoji = I18n.t('taJokerOk');  jokerHinweis = I18n.t('taJokerOkTip'); }

    const hilfeRate = s.gegnerhilfe / s.spiele;
    let hilfeStatus, hilfeEmoji, hilfeHinweis;
    if (hilfeRate > 3)        { hilfeStatus = '🔴'; hilfeEmoji = I18n.t('taHelpBad');  hilfeHinweis = I18n.t('taHelpBadTip'); }
    else if (hilfeRate > 1.5) { hilfeStatus = '🟡'; hilfeEmoji = I18n.t('taHelpSome'); hilfeHinweis = I18n.t('taHelpSomeTip'); }
    else                      { hilfeStatus = '🟢'; hilfeEmoji = I18n.t('taHelpOk');   hilfeHinweis = I18n.t('taHelpOkTip'); }

    const stockVerpasstRate = s.stockZuege > 0 ? s.stockVerpasst / (s.stockZuege + s.stockVerpasst) : 0;
    let stockStatus, stockEmoji, stockHinweis;
    if (stockVerpasstRate > 0.3)       { stockStatus = '🔴'; stockEmoji = I18n.t('taStockBad');  stockHinweis = I18n.t('taStockBadTip'); }
    else if (stockVerpasstRate > 0.15) { stockStatus = '🟡'; stockEmoji = I18n.t('taStockSome'); stockHinweis = I18n.t('taStockSomeTip'); }
    else                               { stockStatus = '🟢'; stockEmoji = I18n.t('taStockOk');   stockHinweis = I18n.t('taStockOkTip'); }

    const komboRate = s.komboZuege / s.spiele;
    let komboStatus, komboEmoji, komboHinweis;
    if (komboRate < 1)      { komboStatus = '🟡'; komboEmoji = I18n.t('taComboFew');  komboHinweis = I18n.t('taComboFewTip'); }
    else if (komboRate > 5) { komboStatus = '🟡'; komboEmoji = I18n.t('taComboMany'); komboHinweis = I18n.t('taComboManyTip'); }
    else                    { komboStatus = '🟢'; komboEmoji = I18n.t('taComboOk');   komboHinweis = I18n.t('taComboOkTip'); }

    const handProZug = s.handAbgebaut / s.spiele;
    let handStatus, handEmoji, handHinweis;
    if (handProZug < 8) { handStatus = '🟡'; handEmoji = I18n.t('taHandFew'); handHinweis = I18n.t('taHandFewTip'); }
    else                { handStatus = '🟢'; handEmoji = I18n.t('taHandOk');  handHinweis = I18n.t('taHandOkTip'); }

    const winRate = Math.round((s.siegerKI / s.spiele) * 100);

    const box = (status, icon, titleKey, head, body, hinweis) => `
      <div class="ta-box">
        <b>${status} ${icon} ${I18n.t(titleKey)}:</b> ${head}<br>
        ${body}<br>
        <span class="ta-hint">${hinweis}</span>
      </div>`;

    return `
    <div class="ta-wrap">
      <p class="ta-header">${I18n.t('taHeader', s.spiele, winRate)}</p>
      ${box(jokerStatus, '🃏', 'taJokerTitle', jokerEmoji, `${I18n.t('taPlayed')}: ${s.jokerGespielt}× · ${I18n.t('taWasted')}: ${s.jokerVerschwendet}×`, jokerHinweis)}
      ${box(hilfeStatus, '🛡️', 'taHelpTitle',  hilfeEmoji, `${I18n.t('taOverall')}: ${s.gegnerhilfe}× (Ø ${hilfeRate.toFixed(1)}/${I18n.t('taPerGame')})`, hilfeHinweis)}
      ${box(stockStatus, '🗃️', 'taStockTitle', stockEmoji, `${I18n.t('taLaid')}: ${s.stockZuege}× · ${I18n.t('taMissed')}: ${s.stockVerpasst}×`, stockHinweis)}
      ${box(komboStatus, '🔗', 'taComboTitle', komboEmoji, `${I18n.t('taDiscToBuild')}: ${s.komboZuege}× (Ø ${komboRate.toFixed(1)}/${I18n.t('taPerGame')})`, komboHinweis)}
      ${box(handStatus,  '✋', 'taHandTitle',  handEmoji,  `${I18n.t('taHandToBuild')}: ${s.handAbgebaut}× (Ø ${handProZug.toFixed(1)}/${I18n.t('taPerGame')})`, handHinweis)}
      <p class="ta-footer">${I18n.t('taFooter')}</p>
    </div>`;
  },

  // ----------------------------------------------------------------
  // INFO-FENSTER (Inhalt eines Ablagestapels, 5 s)
  // ----------------------------------------------------------------

  infoWindow(anchorEl, discardIndex, player) {
    const win   = document.getElementById('info-window');
    const table = document.getElementById('info-table');
    if (!win || !table) return;

    table.innerHTML = '';
    const cards = State.player(player).discards[discardIndex];
    if (!cards || cards.length === 0) return;

    [...cards].reverse().forEach(card => {
      const row  = document.createElement('tr');
      const cell = document.createElement('td');
      cell.textContent = card.type === 'joker' ? '★ ' + I18n.t('joker') : card.value;
      row.appendChild(cell);
      table.appendChild(row);
    });

    const rect = anchorEl.getBoundingClientRect();
    win.style.display = 'block';
    win.style.left    = `${rect.left + window.scrollX}px`;
    win.style.top     = `${rect.top + window.scrollY - win.offsetHeight - 10}px`;
    clearTimeout(this._infoTimer);
    this._infoTimer = setTimeout(() => { win.style.display = 'none'; }, 5000);
  }
};
