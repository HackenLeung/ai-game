// 深渊回响 · 界面交互：把引擎状态渲染到 DOM，并把玩家操作交给引擎。
(function () {
  'use strict';
  const cards = AbyssCards, world = AbyssWorld, E = AbyssEngine, U = AbyssUI, FX = AbyssFX;
  const SAVE_KEY = cards.SAVE_KEY;
  const $ = id => document.getElementById(id);
  const overlay = $('overlay');
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  FX.setReduced(reduced);
  let state = null;
  let pendingTarget = null;
  let pendingPotion = null;
  let finishedShown = false;
  let enemyTimer = 0;
  let seenEvents = 0;

  // ---------- 存档 ----------
  function save() {
    if (!state) return;
    try {
      localStorage.setItem(SAVE_KEY, E.serialize(state));
    } catch { flash('浏览器暂时无法保存，可在「存档与设置」中导出。'); }
  }
  function load() {
    try {
      return E.deserialize(localStorage.getItem(SAVE_KEY));
    } catch { return null; }
  }
  let toastTimer = 0;
  function flash(text) {
    const toast = $('toast');
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  // ---------- 动效消费者 ----------
  const enemyElement = uid => $('enemies').querySelector(`[data-enemy="${uid}"]`);
  function consumeEvents(state) {
    const battle = state.battle;
    if (!battle || !Array.isArray(battle.events)) return;
    const events = battle.events.slice(seenEvents);
    seenEvents = battle.events.length;
    for (const event of events) {
      if (event.kind === 'hit' && event.at === 'enemy') {
        const element = enemyElement(event.uid);
        FX.hit(element, { heavy: event.value >= 14 });
        FX.slash(element);
        FX.number(element, event.value, 'damage');
      } else if (event.kind === 'kill') {
        const element = enemyElement(event.uid);
        FX.burst(element);
        if (element) {
          element.classList.add('is-dead');
          setTimeout(() => element.classList.remove('is-dead'), 520);
        }
      } else if (event.kind === 'hit' && event.at === 'player') {
        $('player-status').classList.remove('chip-hit');
        void $('player-status').offsetWidth;
        $('player-status').classList.add('chip-hit');
        const hud = $('hud').querySelector('.hud-item.hp');
        hud?.classList.add('hp-hit');
        setTimeout(() => hud?.classList.remove('hp-hit'), 520);
        FX.number($('player-status'), event.value, 'damage');
        FX.screenFlash();
      }
    }
  }
  function resetEventCursor() {
    seenEvents = state && state.battle && Array.isArray(state.battle.events) ? state.battle.events.length : 0;
  }

  // ---------- 渲染 ----------
  function render() {
    if (!state) return;
    // 药水高亮只在可操作的战斗中保留：离开战斗、战斗结束或槽位变化后自动取消。
    if (pendingPotion !== null && (!state.battle || state.battle.finished || !state.potions[pendingPotion])) pendingPotion = null;
    const battle = state.battle;
    $('hud-hp').textContent = state.hp;
    $('hud-maxhp').textContent = `/${state.maxHp}`;
    $('hud-gold').textContent = state.gold;
    $('hud-place').textContent = `第 ${state.chapter} 章`;
    $('hud-floor').textContent = `${state.floor}/${state.map.length}`;
    $('hud-chapter').textContent = `· ${world.CHAPTERS[state.chapter - 1].name}`;
    if (state.result) { renderResult(); return; }
    if (state.battle && state.battle.finished) {
      const rewards = state.battle.rewards;
      const pending = rewards && (rewards.cards.length || rewards.potion || rewards.relic || !state.battle.goldTaken);
      if (pending) {
        renderBattle();
        if (overlay.hidden) openRewards();
        return;
      }
      state.battle = null;
      save();
    }
    ensureChapterProgress();
    document.body.dataset.view = state.battle ? 'battle' : 'map';
    $('view-map').hidden = !!state.battle;
    $('view-battle').hidden = !state.battle;
    if (state.battle) renderBattle(); else renderMap();
    if (state.pending) handlePending();
    // 维修站、黑市等节点在处理完之前一直挂在 state.visit 上：误关弹层或刷新页面都会重新打开。
    else if (state.visit && overlay.hidden) renderNode();
  }

  // 药水槽只重绘自身：高亮切换不重建敌人与手牌，避免打断正在播放的动画。
  function renderPotions() {
    $('potions').innerHTML = [0, 1, 2].map(index => U.potionHtml(state.potions[index], index, { selected: pendingPotion })).join('');
    const detail = $('potion-detail');
    if (!detail) return;
    detail.innerHTML = U.potionDetailHtml(pendingPotion === null ? null : state.potions[pendingPotion]);
    detail.hidden = !detail.innerHTML;
  }

  // 章节最后一层通过后自动展开下一章，避免地图上不再有可点击的节点。
  function ensureChapterProgress() {
    if (!state || state.battle || state.result) return;
    if (state.floor >= state.map.length) { E.enterNode(state); save(); }
  }

  function renderMap() {
    const chapter = world.CHAPTERS[state.chapter - 1];
    $('chapter-name').textContent = chapter.name;
    $('chapter-subtitle').textContent = chapter.subtitle;
    $('chapter-intro').textContent = chapter.intro;
    $('map-nodes').innerHTML = state.map.map((node, index) => U.mapNodeHtml(node, index, state.floor)).join('');
  }

  function renderBattle() {
    const battle = state.battle;
    const alive = E.aliveEnemies(battle);
    $('enemies').innerHTML = battle.enemies.map(enemy => U.enemyHtml(enemy, { targetable: alive.length > 1 && !!pendingTarget && !enemy.dead })).join('');
    if (battle.active) enemyElement(battle.active)?.classList.add('is-acting');
    $('player-status').innerHTML = U.playerStatusHtml(state);
    $('battle-log').innerHTML = U.logHtml(battle.log);
    $('battle-log').scrollTop = $('battle-log').scrollHeight;
    $('draw-count').textContent = battle.draw.length;
    $('discard-count').textContent = battle.discard.length;
    $('exhaust-count').textContent = battle.exhaust.length;
    $('energy-value').textContent = battle.energy;
    $('energy-max').textContent = `/${battle.maxEnergy}`;
    const playing = battle.phase === 'player' && !battle.finished;
    $('energy').classList.toggle('low', playing && battle.energy <= 0);
    renderHand(battle, playing);
    renderPotions();
    $('end-turn').disabled = !playing;
    $('end-turn').innerHTML = `${battle.phase === 'enemy' ? '敌人行动中' : '结束回合'}${playing ? '<kbd>E</kbd>' : ''}`;
    document.body.classList.toggle('cursor-target', !!pendingTarget);
    for (const card of $('hand').querySelectorAll('.card')) {
      const entry = battle.hand.find(item => item.uid === card.dataset.card);
      if (entry && !E.canPlay(state, entry)) card.classList.add('unplayable');
      else card.classList.remove('unplayable');
      card.classList.toggle('selected', card.dataset.card === pendingTarget);
      card.classList.toggle('locked', !playing);
    }
    consumeEvents(state);
  }

  // 手牌只要构成不变就原地更新，避免重建 DOM 打断悬停与出场动画。
  function renderHand(battle, playing) {
    const hand = $('hand');
    const wanted = battle.hand.map(card => card.uid).join(',');
    if (hand.dataset.order === wanted) return;
    hand.dataset.order = wanted;
    hand.innerHTML = battle.hand.map(card => U.cardHtml(card, { locked: !playing })).join('');
  }

  function renderNode() {
    const node = state.map[state.floor - 1];
    if (!node) return;
    if (node.type === 'rest') return openRest(node);
    if (node.type === 'shop') return openShop(node);
    if (node.type === 'event') return openEvent(node);
    if (node.type === 'treasure') return openTreasure(node);
  }
  // 节点处理完毕，下一次渲染不再重新打开。
  function finishNode() {
    state.visit = false;
    state.shop = null;
  }

  // ---------- 弹层 ----------
  function openOverlay(html) {
    $('overlay-body').innerHTML = html;
    overlay.hidden = false;
    overlay.querySelector('button, [tabindex]')?.focus();
  }
  function closeOverlay() {
    overlay.hidden = true;
    $('overlay-body').innerHTML = '';
  }
  // 玩家主动关闭弹层：重新渲染，让未处理的节点或奖励再次弹出。
  function dismissOverlay() {
    closeOverlay();
    render();
  }
  function handlePending() {
    const pending = state.pending;
    if (!pending) return;
    state.pending = null;
    if (pending.chapterIntro) {
      const info = world.CHAPTERS[pending.chapterIntro - 1];
      const growth = pending.growth ? `<ul class="stat-row"><li><b>+${pending.growth}</b>生命上限</li><li><b>${state.maxHp}</b>当前上限</li><li><b>${E.maxEnergyOf(state)}</b>能量上限</li><li><b>${pending.chapterIntro}</b>/${world.CHAPTERS.length} 章</li></ul>` : '';
      openOverlay(`${U.chapterBannerHtml(pending.chapterIntro)}<h2 class="panel-title">${U.escape(info.name)}</h2>${growth}<p class="panel-note stack-gap">核心适应了新的环境，地图向前延伸。选择下一个节点继续前进。</p><div class="choice-list"><button class="button primary" data-action="close">继续前进</button></div>`);
    } else if (pending.eventResult) {
      const event = world.EVENT_MAP[pending.eventResult.event];
      openOverlay(`<h2 class="panel-title">${U.escape(event.name)}</h2><p class="panel-note">${U.escape(pending.eventResult.label)}</p><div class="choice-list"><p>${U.escape(pending.eventResult.log)}</p><button class="button primary" data-action="close">离开</button></div>`);
    }
  }

  function openRest() {
    const upgraded = state.deck.filter(card => card.upgraded).length;
    const upgradeable = state.deck.filter(card => !card.upgraded && cards.CARD_MAP[card.id].u);
    openOverlay(`<h2 class="panel-title">维修站</h2><p class="panel-note">自动机械臂还在运转。你可以修补自己，或者加固一张卡牌。</p>
      <ul class="stat-row"><li><b>${state.hp}</b>当前生命</li><li><b>${state.maxHp}</b>生命上限</li><li><b>${upgraded}</b>已升级卡牌</li></ul>
      <div class="choice-list">
        <button class="choice" data-action="rest"><span>${U.icon('heart')}</span><span><strong>修补身体</strong><p>恢复 ${E.restHeal(state)} 点生命。</p></span></button>
        <button class="choice" data-action="smith"${upgradeable.length ? '' : ' disabled'}><span>${U.icon('up')}</span><span><strong>加固卡牌</strong><p>${upgradeable.length ? '选择一张卡牌永久升级。' : '没有可以升级的卡牌。'}</p></span></button>
      </div>
      <div class="grid-cards" id="rest-cards" hidden></div>`);
  }

  function openSmithPicker() {
    const list = state.deck.filter(card => !card.upgraded && cards.CARD_MAP[card.id].u);
    const container = $('rest-cards');
    if (!container) return;
    container.hidden = false;
    container.innerHTML = list.map(card => U.cardHtml(card, { small: true, tag: 'smith' })).join('');
  }

  function openEvent(node) {
    const event = world.EVENT_MAP[node.event];
    openOverlay(`<h2 class="panel-title">${U.escape(event.name)}</h2><p class="panel-note">${U.escape(event.text)}</p>
      <div class="choice-list">${event.options.map((option, index) => `<button class="choice" data-action="event" data-index="${index}"><span>${U.icon('question')}</span><span><strong>${U.escape(option.label)}</strong><p>${U.escape(option.log)}</p></span></button>`).join('')}</div>`);
  }

  function openTreasure() {
    openOverlay(`<h2 class="panel-title">补给舱</h2><p class="panel-note">舱门自动打开，里面还有能用的东西。</p>
      <ul class="stat-row"><li><b>45</b>金币</li><li><b>1</b>件遗物</li></ul>
      <div class="choice-list"><button class="choice" data-action="treasure"><span>${U.icon('chest')}</span><span><strong>打开补给舱</strong><p>获得金币与一件遗物。</p></span></button></div>`);
  }

  function openShop() {
    // 货架存进存档：刷新页面不会换一批货，也不能靠刷新重抽。
    const inventory = state.shop = state.shop || E.shopInventory(state);
    const cardItems = inventory.cards.map((entry, index) => {
      const card = { uid: `shop-c${index}`, id: entry.id, upgraded: false };
      const definition = cards.card(entry.id);
      return `<button class="shop-item" data-action="buy-card" data-index="${index}"${state.gold < entry.price ? ' disabled' : ''}>
        <span class="relic-icon">${U.icon('deck')}</span><span><strong>${U.escape(definition.name)}</strong><p>${U.escape(definition.text)}</p></span><span class="price">${entry.price} 金币</span></button>`;
    }).join('');
    const relicItems = inventory.relics.map((entry, index) => {
      const relic = world.RELIC_MAP[entry.id];
      return `<button class="shop-item" data-action="buy-relic" data-index="${index}"${state.gold < entry.price ? ' disabled' : ''}>
        <span class="relic-icon">${U.icon(relic.icon)}</span><span><strong>${U.escape(relic.name)}</strong><p>${U.escape(relic.text)}</p></span><span class="price">${entry.price} 金币</span></button>`;
    }).join('');
    const potionItems = inventory.potions.map((entry, index) => {
      const potion = world.POTION_MAP[entry.id];
      return `<button class="shop-item" data-action="buy-potion" data-index="${index}"${state.gold < entry.price ? ' disabled' : ''}>
        <span class="relic-icon">${U.icon('flask')}</span><span><strong>${U.escape(potion.name)}</strong><p>${U.escape(potion.text)}</p></span><span class="price">${entry.price} 金币</span></button>`;
    }).join('');
    openOverlay(`<h2 class="panel-title">黑市</h2><p class="panel-note">你有 ${state.gold} 金币。离开后这里的东西就再也拿不到了。</p>
      <div class="shop-grid">
        <div class="shop-section"><h3>卡牌</h3>${cardItems || '<p class="hint-line">这里已经没有卡牌了。</p>'}</div>
        <div class="shop-section"><h3>遗物</h3>${relicItems || '<p class="hint-line">这里已经没有遗物了。</p>'}</div>
        <div class="shop-section"><h3>药水与服务</h3>${potionItems}
          <button class="shop-item" data-action="buy-remove"${!inventory.removePrice || state.gold < inventory.removePrice || state.deck.length <= 5 ? ' disabled' : ''}>
            <span class="relic-icon">${U.icon('close')}</span><span><strong>移除一张卡牌</strong><p>从卡组中永久移除一张牌，每家黑市限一次。</p></span><span class="price">${inventory.removePrice ? `${inventory.removePrice} 金币` : '已使用'}</span>
          </button>
          <button class="button primary full-width" data-action="leave">离开黑市${U.icon('arrow')}</button>
        </div>
      </div>`);
  }

  function openRemovePicker() {
    openOverlay(`<h2 class="panel-title">移除卡牌</h2><p class="panel-note">选择一张要永久移除的卡牌。</p>
      <div class="grid-cards" id="remove-cards">${state.deck.map(card => U.cardHtml(card, { small: true, tag: 'remove' })).join('')}</div>`);
  }

  function openRewards() {
    const battle = state.battle;
    const rewards = battle && battle.rewards;
    if (!rewards) { closeOverlay(); return; }
    const goldClaimed = battle.goldTaken;
    const cardOptions = rewards.cards.length
      ? `<div class="grid-cards">${rewards.cards.map(id => U.cardHtml({ uid: `reward-${id}`, id, upgraded: false }, { small: true, tag: 'reward' })).join('')}</div>`
      : `<p class="hint-line">卡牌奖励已经领取。</p>`;
    openOverlay(`<h2 class="panel-title">战斗胜利</h2><p class="panel-note">敌人已经停止运转。选择你的战利品。</p>
      <ul class="stat-row">
        <li><b>${goldClaimed ? rewards.gold : 0}</b>已领取金币${goldClaimed ? '' : `（可领取 ${rewards.gold}）`}</li>
        <li><b>${battle.turn}</b>消耗回合</li>
        <li><b>${state.hp}</b>剩余生命</li>
      </ul>
      <div class="choice-list stack-gap">
        ${rewards.relic ? `<button class="choice" data-action="take-relic"><span>${U.icon('book')}</span><span><strong>遗物 · ${U.escape(world.RELIC_MAP[rewards.relic].name)}</strong><p>${U.escape(world.RELIC_MAP[rewards.relic].text)}</p></span></button>` : ''}
        ${rewards.potion ? `<button class="choice" data-action="take-potion"><span>${U.icon('flask')}</span><span><strong>药水 · ${U.escape(world.POTION_MAP[rewards.potion].name)}</strong><p>${U.escape(world.POTION_MAP[rewards.potion].text)}</p></span></button>` : ''}
        ${goldClaimed ? '' : `<button class="choice" data-action="take-gold"><span>${U.icon('coin')}</span><span><strong>金币 ${rewards.gold}</strong><p>用于黑市购买卡牌、遗物与药水。</p></span></button>`}
      </div>
      ${cardOptions}
      <div class="choice-list stack-gap"><button class="button primary" data-action="leave-rewards">继续前进${U.icon('arrow')}</button></div>`);
  }

  function openDeck() {
    const counts = {};
    for (const card of state.deck) counts[card.id] = (counts[card.id] || 0) + 1;
    openOverlay(`<h2 class="panel-title">牌组</h2><p class="panel-note">共 ${state.deck.length} 张。悬浮卡牌可以看到完整效果。</p>
      <div class="grid-cards">${state.deck.map(card => U.cardHtml(card, { small: true })).join('')}</div>
      <p class="hint-line stack-gap">类型分布：${Object.entries(counts).map(([id, count]) => `${U.escape(cards.CARD_MAP[id].name)}×${count}`).join('、')}</p>`);
  }
  function openRelics() {
    const owned = new Set(state.relics);
    openOverlay(`<h2 class="panel-title">图鉴</h2><p class="panel-note">已持有 ${owned.size} / ${world.RELICS.filter(r => !r.char).length} 件遗物。</p>
      <h3 class="section-label">遗物</h3>
      <div class="grid-relics">${world.RELICS.filter(relic => !relic.char).map(relic => U.relicHtml(relic, owned.has(relic.id))).join('')}</div>
      <h3 class="section-label">药水</h3>
      <div class="grid-relics">${world.POTIONS.map(potion => `<div class="relic"><span class="relic-icon">${U.icon('flask')}</span><div><strong>${U.escape(potion.name)}</strong><p>${U.escape(potion.text)}</p></div></div>`).join('')}</div>
      <h3 class="section-label">状态</h3>
      <div class="grid-relics">${Object.entries(cards.STATUS).map(([key, status]) => `<div class="relic"><span class="relic-icon">${U.icon(key.startsWith('poison') || cards.NEGATIVE.includes(key) ? 'skull' : 'bolt')}</span><div><strong>${U.escape(status.name)}</strong><p>${U.escape(status.text)}</p></div></div>`).join('')}</div>`);
  }
  function openPile(kind) {
    const battle = state.battle;
    if (!battle) return;
    const titles = { draw: '抽牌堆（顺序已隐藏）', discard: '弃牌堆', exhaust: '消耗堆' };
    const pile = kind === 'draw' ? [...battle.draw].sort(() => 0.5 - Math.random()) : battle[kind];
    openOverlay(`<h2 class="panel-title">${titles[kind] || '牌堆'}</h2><p class="panel-note">共 ${pile.length} 张。</p>
      <div class="grid-cards">${pile.map(card => U.cardHtml(card, { small: true })).join('') || '<p class="hint-line">这里是空的。</p>'}</div>`);
  }
  function openHelp() {
    openOverlay(`<h2 class="panel-title">玩法说明</h2>
      <ul class="stat-row"><li><b>1</b>每回合 3 点能量</li><li><b>5</b>每回合抽 5 张牌</li><li><b>12</b>章 · 每章 15 层</li><li><b>180</b>层总路线</li></ul>
      <div class="choice-list">
        <p><strong>目标</strong>：从回响航母出发，穿过十二个章节，抵达回响之源并击败它。</p>
        <p><strong>战斗</strong>：每回合获得 3 点能量并抽 5 张牌。手牌需要消耗能量打出，回合结束时未使用的牌进入弃牌堆，格挡在下个回合开始时清空。</p>
        <p><strong>意图</strong>：敌人头顶显示它们下一次行动。数字是即将造成的伤害，先看清再决定要打还是要防。</p>
        <p><strong>状态</strong>：<em>力量</em>提高攻击伤害，<em>迅捷</em>提高格挡，<em>敏锐</em>提高攻击伤害且不会消失；<em>易伤</em>使受到的攻击伤害 +50%，<em>虚弱</em>使其造成伤害 −25%，<em>中毒</em>在回合开始按层数失去生命，<em>灼烧</em>在回合结束结算，<em>荆棘</em>会反噬攻击者。</p>
        <p><strong>章节成长</strong>：每通过一章，生命上限提升并回复部分生命；每两章额外获得 1 点能量上限。深层章节进入战斗时自带少量格挡，休息恢复量、金币与卡牌质量也会随章节提高。</p>
        <p><strong>地图</strong>：每层只能前进，不能回头。精英给遗物，维修站可以治疗或升级卡牌，黑市用金币交换卡牌与遗物。</p>
        <p><strong>药水</strong>：战斗中点击药水或按 <kbd>1</kbd>–<kbd>3</kbd> 会先高亮并显示效果，再点一次（或再按同一个数字键）才会真的使用；点其他位置或按 <kbd>Esc</kbd> 取消。</p>
        <p><strong>操作</strong>：点击手牌打出，选择敌人作为目标；<kbd>E</kbd> 或按钮结束回合；<kbd>1</kbd>–<kbd>3</kbd> 使用药水；<kbd>D</kbd> 查看牌组；<kbd>R</kbd> 查看图鉴；<kbd>?</kbd> 打开本说明。</p>
        <p><strong>存档</strong>：每次选择节点或结束战斗后自动保存。可在「存档与设置」中导出或导入。</p>
      </div>`);
  }
  function openSave() {
    const stats = state.stats || {};
    openOverlay(`<h2 class="panel-title">存档与设置</h2><p class="panel-note">存档保存在这个浏览器中，可以导出为文本备份。</p>
      <ul class="stat-row"><li><b>${stats.battles || 0}</b>战斗</li><li><b>${stats.kills || 0}</b>摧毁</li><li><b>${stats.cards || 0}</b>出牌</li><li><b>${stats.damage || 0}</b>总伤害</li></ul>
      <div class="choice-list">
        <button class="choice" data-action="export"><span>${U.icon('down')}</span><span><strong>导出存档</strong><p>复制当前进度，保存到本地文本。</p></span></button>
        <button class="choice" data-action="import"><span>${U.icon('up')}</span><span><strong>导入存档</strong><p>粘贴之前导出的内容覆盖当前进度。</p></span></button>
        <button class="choice" data-action="restart"><span>${U.icon('restart')}</span><span><strong>重新攀登</strong><p>放弃当前进度，返回角色选择。此操作会覆盖当前存档。</p></span></button>
      </div>
      <textarea id="save-text" class="save-area" aria-label="存档内容" placeholder="导出的存档会显示在这里，也可以粘贴存档后点击「确认导入」。"></textarea>
      <div class="choice-list stack-gap"><button class="button" data-action="confirm-import">确认导入</button></div>`);
  }
  function openCharacter() {
    openOverlay(`<h2 class="panel-title">选择你的核心</h2><p class="panel-note">三个人，三种残缺的协议。每局的地图、敌人与奖励都会重新生成。</p>
      <div class="choice-list">${cards.CHARACTERS.map(character => `<button class="choice" data-action="start" data-character="${character.id}">
        <span>${U.icon(character.color === 'core' ? 'shield' : character.color === 'necrosis' ? 'skull' : 'power')}</span>
        <span><strong>${U.escape(character.name)} · ${U.escape(character.title)}</strong><p>${U.escape(character.text)}</p><p class="hint-line">生命 ${character.maxHp} · 能量 ${character.energy} · 起始遗物「${U.escape(world.RELIC_MAP[character.relic].name)}」</p><p class="hint-line">${U.escape(character.tip)}</p></span>
      </button>`).join('')}</div>`);
  }
  function openConfirmRestart() {
    openOverlay(`<h2 class="panel-title">重新攀登？</h2><p class="panel-note">当前进度会被覆盖，无法恢复。已导出的存档仍然可以导入。</p>
      <div class="choice-list"><button class="button danger" data-action="confirm-restart">放弃进度并重新开始</button><button class="button ghost" data-action="close">返回</button></div>`);
  }
  function renderResult() {
    document.body.dataset.view = 'map';
    $('view-map').hidden = false;
    $('view-battle').hidden = true;
    renderMap();
    if (finishedShown) return;
    finishedShown = true;
    const victory = state.result === 'victory';
    const stats = state.stats || {};
    openOverlay(`<div class="result-hero">
      <h2 class="${victory ? '' : 'danger-text'}">${victory ? '回响终于安静了' : '回响吞没了你'}</h2>
      <p>${victory ? '你走到了所有回响的起点，然后亲手把它关掉。十二个章节的残骸在身后逐一熄灭。' : '协议终止。你的核心被回响拆解，成为它新的一个声部。'}</p>
      <ul class="stat-row result-stats"><li><b>${stats.battles || 0}</b>战斗</li><li><b>${stats.kills || 0}</b>摧毁</li><li><b>${stats.cards || 0}</b>出牌</li><li><b>${stats.damage || 0}</b>总伤害</li><li><b>${state.chapter}</b>章</li><li><b>${state.deck.length}</b>张牌</li></ul>
      <div class="choice-list"><button class="button primary" data-action="restart">再来一次</button></div>
    </div>`);
  }

  // ---------- 操作 ----------
  function startRun(characterId) {
    state = E.newState(characterId, (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    pendingTarget = null;
    finishedShown = false;
    closeOverlay();
    save();
    render();
  }
  function playCard(uid, targetUid) {
    const battle = state.battle;
    if (!battle || battle.phase !== 'player' || battle.finished) return;
    const entry = battle.hand.find(card => card.uid === uid);
    if (!entry) return;
    const definition = cards.card(entry.id, entry.upgraded);
    const alive = E.aliveEnemies(battle);
    if (definition.target === 'enemy' && !targetUid) {
      if (!alive.length) return;
      if (alive.length > 1) {
        pendingTarget = pendingTarget === uid ? null : uid;
        render();
        flash(pendingTarget ? '再点击一个敌人作为目标' : '已取消选择');
        return;
      }
      targetUid = alive[0].uid;
    }
    pendingTarget = null;
    const cardElement = $('hand').querySelector(`.card[data-card="${uid}"]`);
    const targetElement = targetUid ? enemyElement(targetUid) : null;
    if (!E.playCard(state, uid, targetUid)) return;
    FX.playCard(cardElement, targetElement || $('enemies'), definition.name);
    FX.removeCardFromHand(uid);
    if (battle.energy <= 1) { $('energy').classList.remove('spend'); void $('energy').offsetWidth; $('energy').classList.add('spend'); }
    if (definition.type === 'power') FX.rise($('player-status'), 'block');
    if (definition.type === 'skill') FX.rise($('player-status'), 'block');
    save();
    render();
  }
  // 结束回合：先播玩家收牌，再由定时器逐个推进敌人动作。
  function endTurn() {
    const battle = state.battle;
    if (!battle || battle.phase !== 'player') return;
    pendingPotion = null;
    const finish = () => {
      if (!state.battle) return;
      if (state.battle.phase === 'player') {
        resetEventCursor();
        FX.floatText(`第 ${state.battle.turn} 回合`, 'good');
      }
      save();
      render();
    };
    $('hand').querySelectorAll('.card').forEach(card => card.classList.add('card-leaving'));
    $('end-turn').disabled = true;
    E.endPlayerTurn(state, { resolve: reduced });
    render();
    resetEventCursor();
    if (state.battle.finished) { setTimeout(finish, 320); return; }
    if (reduced) { finish(); return; }
    setTimeout(() => {
      FX.floatText('敌人回合', 'danger');
      runEnemySteps(finish);
    }, 240);
  }
  // 逐个敌人动作，每个动作之间有停顿，便于看清谁在攻击。
  function runEnemySteps(done) {
    clearTimeout(enemyTimer);
    const acting = () => state.battle && !state.battle.finished && state.battle.phase === 'enemy';
    const step = () => {
      if (!acting()) { done(); return; }
      const nextUid = (state.battle.enemyOrder || [])[0];
      const actor = nextUid ? enemyElement(nextUid) : null;
      const release = actor ? FX.telegraph(actor) : null;
      E.stepEnemyAction(state);
      render();
      if (release) setTimeout(release, 320);
      enemyTimer = setTimeout(acting() ? step : done, 460);
    };
    enemyTimer = setTimeout(step, 300);
  }
  function enterFloor(floor) {
    if (floor !== state.floor + 1) return;
    const node = E.enterNode(state);
    state.visit = !!(node && !state.battle);
    save();
    resetEventCursor();
    render();
  }
  // 药水需要两步：第一次点击高亮并说明效果，再点一次才真的使用。
  function selectPotion(index) {
    const potion = world.POTION_MAP[state.potions[index]];
    if (!potion) return;
    if (pendingPotion === index) { usePotion(index); return; }
    pendingPotion = index;
    renderPotions();
  }
  function usePotion(index) {
    const potion = world.POTION_MAP[state.potions[index]];
    if (!potion) { pendingPotion = null; renderPotions(); return; }
    if (!E.usePotion(state, index)) { pendingPotion = null; renderPotions(); flash('这瓶药水只能在战斗中使用'); return; }
    pendingPotion = null;
    FX.rise($('potions'), 'block');
    save(); render(); flash(`使用了${potion.name}`);
  }
  // 点击药水以外的位置取消高亮，避免误触。
  function clearPendingPotion() {
    if (pendingPotion === null) return;
    pendingPotion = null;
    if (state.battle) renderPotions();
  }

  // ---------- 事件绑定 ----------
  document.addEventListener('click', event => {
    const target = event.target;
    // 药水高亮时，点到其他位置先取消高亮，不影响本次操作本身。
    if (!target.closest('[data-potion]')) clearPendingPotion();
    const nodeButton = target.closest('[data-node]');
    if (nodeButton) { enterFloor(Number(nodeButton.dataset.node)); return; }
    const enemyButton = target.closest('[data-enemy]');
    if (enemyButton && state.battle && state.battle.phase === 'player') {
      if (!pendingTarget) { flash('先选择一张攻击牌'); return; }
      playCard(pendingTarget, enemyButton.dataset.enemy);
      return;
    }
    const cardButton = target.closest('[data-card]');
    if (cardButton) {
      const uid = cardButton.dataset.card;
      if (uid.startsWith('reward-')) { E.takeCardReward(state, uid.replace('reward-', '')); save(); openRewards(); return; }
      if (cardButton.dataset.smith) { E.smithCard(state, uid); finishNode(); save(); closeOverlay(); render(); flash('卡牌已升级'); return; }
      if (cardButton.dataset.remove) {
        if (!E.removeCard(state, uid)) return;
        state.gold -= state.shop.removePrice;
        state.shop.removePrice = 0;
        save(); openShop(); render(); flash('卡牌已移除');
        return;
      }
      playCard(uid);
      return;
    }
    const potionButton = target.closest('[data-potion]');
    if (potionButton) { selectPotion(Number(potionButton.dataset.potion)); return; }
    const action = target.closest('[data-action]');
    if (action) {
      const name = action.dataset.action;
      if (name === 'close') dismissOverlay();
      else if (name === 'rest') { E.restAtCamp(state); finishNode(); save(); closeOverlay(); render(); flash('生命已恢复'); }
      else if (name === 'smith') openSmithPicker();
      else if (name === 'treasure') { state.gold += 45; E.gainRandomRelic(state); finishNode(); save(); closeOverlay(); render(); flash('获得补给'); }
      else if (name === 'event') { E.resolveEvent(state, Number(action.dataset.index)); finishNode(); save(); render(); }
      else if (name === 'take-gold') { E.takeGold(state); save(); openRewards(); }
      else if (name === 'take-relic') { E.takeRelicReward(state); save(); openRewards(); }
      else if (name === 'take-potion') { if (E.takePotionReward(state)) { save(); openRewards(); } else flash('药水栏已满'); }
      else if (name === 'leave-rewards') { E.skipRewards(state); state.battle = null; closeOverlay(); save(); render(); }
      else if (name === 'buy-card') {
        const entry = state.shop.cards[Number(action.dataset.index)];
        if (!entry || state.gold < entry.price) return;
        state.gold -= entry.price;
        state.deck.push({ uid: E.nextUid(state, 'b'), id: entry.id, upgraded: false });
        state.shop.cards.splice(Number(action.dataset.index), 1);
        save(); openShop(); render(); flash('已购买');
      }
      else if (name === 'buy-relic') {
        const entry = state.shop.relics[Number(action.dataset.index)];
        if (!entry || state.gold < entry.price) return;
        state.gold -= entry.price;
        E.addRelic(state, entry.id);
        state.shop.relics.splice(Number(action.dataset.index), 1);
        save(); openShop(); render(); flash('已购买');
      }
      else if (name === 'buy-potion') {
        const entry = state.shop.potions[Number(action.dataset.index)];
        if (!entry || state.gold < entry.price || state.potions.length >= 3) return;
        state.gold -= entry.price;
        state.potions.push(entry.id);
        state.shop.potions.splice(Number(action.dataset.index), 1);
        save(); openShop(); render(); flash('已购买');
      }
      else if (name === 'buy-remove') openRemovePicker();
      else if (name === 'leave') { finishNode(); closeOverlay(); save(); render(); }
      else if (name === 'export') { const text = E.serialize(state); const area = $('save-text'); if (area) { area.value = text; area.select(); } try { navigator.clipboard?.writeText(text); flash('存档已复制'); } catch { flash('存档已生成，请手动复制'); } }
      else if (name === 'import') { $('save-text')?.focus(); flash('粘贴存档后点击「确认导入」'); }
      else if (name === 'confirm-import') {
        const text = $('save-text')?.value.trim();
        const next = E.deserialize(text || '');
        if (!next) { flash('存档内容无法识别'); return; }
        state = next; finishedShown = false; save(); closeOverlay(); render(); flash('存档已导入');
      }
      else if (name === 'restart') openConfirmRestart();
      else if (name === 'confirm-restart') { try { localStorage.removeItem(SAVE_KEY); } catch { /* 忽略存储错误 */ } startRun(state.character); }
      else if (name === 'start') startRun(action.dataset.character);
      return;
    }
    const panel = target.closest('[data-panel]');
    if (panel) {
      const name = panel.dataset.panel;
      if (name === 'deck') openDeck();
      else if (name === 'relics') openRelics();
      else if (name === 'help') openHelp();
      else if (name === 'save') openSave();
      else if (name.startsWith('pile-')) openPile(name.replace('pile-', ''));
      return;
    }
    const nav = target.closest('[data-view="map"]');
    if (nav) { dismissOverlay(); return; }
    if (target === overlay) dismissOverlay();
  });

  $('overlay-close').addEventListener('click', dismissOverlay);
  $('end-turn').addEventListener('click', endTurn);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !overlay.hidden) { dismissOverlay(); return; }
    if (event.key === 'Escape') { clearPendingPotion(); return; }
    if (event.target.tagName === 'TEXTAREA' || event.target.tagName === 'INPUT') return;
    if (event.key === 'e' || event.key === 'E') { event.preventDefault(); endTurn(); }
    else if (event.key === 'd' || event.key === 'D') openDeck();
    else if (event.key === 'r' || event.key === 'R') openRelics();
    else if (event.key === '?' || event.key === '/') openHelp();
    else if (/^[1-3]$/.test(event.key)) selectPotion(Number(event.key) - 1);
  });
  window.addEventListener('beforeunload', save);

  // ---------- 启动 ----------
  const restored = load();
  if (restored && !restored.result) {
    state = restored;
    render();
  } else {
    state = E.newState('vanguard', Date.now() % 2147483647);
    render();
    openCharacter();
  }
})();
