(function (root, factory) {
  const observer = factory();
  if (typeof module === 'object' && module.exports) module.exports = observer;
  else root.AiObserver = observer;
})(globalThis, function () {
  'use strict';
  // 供命令行 AI 玩家与网页 AI 面板共用：把游戏画面读成结构，再把决定翻译成点击步骤。
  const compact = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const CRAFT_FILTERS = ['camp', 'tools', 'survival', 'food'];
  const selectorId = value => (globalThis.CSS && CSS.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&'));

  function readRecipes(document) {
    return [...document.querySelectorAll('#recipe-grid .recipe-card')].map(card => ({
      id: compact(card.querySelector('[data-action="craft"]')?.dataset.id),
      name: compact(card.querySelector('h3')?.textContent),
      costs: [...card.querySelectorAll('.cost-chip')].map(chip => `${compact(chip.textContent)}${chip.classList.contains('missing') ? '（缺）' : ''}`).join(' '),
      state: compact(card.querySelector('.recipe-reason')?.textContent),
      action: compact(card.querySelector('.small-button')?.textContent),
      locked: Boolean(card.querySelector('.small-button')?.disabled),
    }));
  }

  /** 工坊一次只显示一个分类，切换分类查看配方不会消耗游戏时间。 */
  function scanCraftRecipes(document) {
    const doc = document || globalThis.document;
    if (!doc) return [];
    if (doc.getElementById('game-dialog')?.open) return readRecipes(doc);
    const active = doc.querySelector('.filter-button.active')?.dataset.craftFilter || 'tools';
    const merged = new Map();
    for (const category of CRAFT_FILTERS) {
      const button = doc.querySelector(`[data-craft-filter="${category}"]`);
      if (!button) continue;
      button.click();
      for (const recipe of readRecipes(doc)) if (recipe.id && !merged.has(recipe.id)) merged.set(recipe.id, { ...recipe, category });
    }
    const restore = doc.querySelector(`[data-craft-filter="${active}"]`);
    if (restore) restore.click();
    return [...merged.values()];
  }

  /** 行囊里的物品。usable 只有详情区真的给出「使用」按钮时才为真，这里先留空。 */
  function readInventory(document) {
    return [...document.querySelectorAll('#inventory-grid .inventory-item')].map(item => ({
      id: item.dataset.item,
      name: compact(item.querySelector('span')?.textContent),
      count: compact(item.querySelector('b')?.textContent),
      usable: false,
      useLabel: '',
      locked: false,
    }));
  }

  /**
   * 详情区的「使用」按钮只对被选中的物品渲染，所以这里逐个试选一遍再点回原选中项。
   * 试选只改选中项，不消耗游戏时间。返回补充了 usable / useLabel 的行囊数组。
   */
  function scanUsableItems(document, inventory) {
    const doc = document || globalThis.document;
    const items = (inventory || readInventory(doc)).map(item => ({ ...item }));
    // 弹窗打开时行囊被挡住，点不动，只能照原样返回（不标注可用性）。
    if (!doc || doc.getElementById('game-dialog')?.open) return items;
    const detail = doc.getElementById('item-detail');
    const restore = doc.querySelector('#inventory-grid .inventory-item.selected')?.dataset.item || '';
    for (const item of items) {
      const button = doc.querySelector(`#inventory-grid [data-item="${selectorId(item.id)}"]`);
      if (!button) continue;
      button.click();
      const action = detail?.querySelector('[data-action="use"][data-id]');
      item.scanned = true;
      item.usable = Boolean(action);
      item.useLabel = action ? compact(action.textContent) : '';
      item.locked = Boolean(action?.disabled);
    }
    if (restore) doc.querySelector(`#inventory-grid [data-item="${selectorId(restore)}"]`)?.click();
    return items;
  }

  function readObservation(document) {
    const doc = document || globalThis.document;
    const text = selector => compact(doc.querySelector(selector)?.textContent);
    const all = selector => [...doc.querySelectorAll(selector)];
    const dialog = doc.getElementById('game-dialog');
    const blocks = selector => [...(doc.querySelector(selector)?.children || [])].map(child => compact(child.textContent)).filter(Boolean).join('｜');
    const describe = button => ({
      id: button.dataset.id || '',
      label: compact(button.querySelector('.action-title strong')?.textContent || button.getAttribute('aria-label') || button.textContent),
      reward: compact(button.querySelector('.action-reward')?.textContent),
      detail: compact(button.title),
      locked: Boolean(button.disabled),
    });
    const worldHint = text('#world-hint');
    return {
      view: doc.body.dataset.view || 'explore',
      clock: { day: text('#day-number'), time: text('#game-time'), phase: text('#phase-label'), weather: text('#clock-weather') },
      worldHint,
      stats: all('#status-grid .stat-card').map(card => ({
        name: compact(card.querySelector('.stat-name')?.textContent),
        value: compact(card.querySelector('.stat-value')?.textContent),
        label: compact(card.querySelector('.stat-label')?.textContent),
        critical: card.classList.contains('critical'),
      })),
      scene: { name: text('#location-name'), tag: text('#location-tag'), description: text('#scene-description') },
      fire: blocks('#fire-strip'),
      actions: all('#action-grid .action-card').map(describe),
      hotspots: all('#scene-hotspots [data-hotspot]').map(hotspot => ({
        action: hotspot.dataset.action, id: hotspot.dataset.id || '', label: compact(hotspot.textContent), locked: Boolean(hotspot.disabled),
      })),
      travels: all('#map-locations .map-location').map(pin => ({
        id: pin.dataset.location, label: compact(pin.textContent), here: pin.classList.contains('current'),
      })),
      travelDetail: text('#map-detail'),
      recipes: readRecipes(doc),
      craftFilter: compact(doc.querySelector('.filter-button.active')?.textContent),
      inventory: readInventory(doc),
      itemDetail: text('#item-detail'),
      guide: {
        nights: compact(doc.querySelector('.guide-eyebrow b')?.textContent),
        title: text('#guide-card h2'),
        description: compact(doc.querySelector('.guide-description')?.textContent),
        steps: all('.guide-steps li').map(step => `${step.classList.contains('done') ? '✓' : '·'} ${compact(step.textContent)}`),
      },
      journal: all('#journal-list .journal-entry').map(entry => ({
        time: [...(entry.querySelector('time')?.childNodes || [])].map(node => compact(node.textContent)).filter(Boolean).join(' '),
        title: compact(entry.querySelector('h3')?.textContent),
        text: compact(entry.querySelector('p')?.textContent),
      })),
      dialog: dialog && dialog.open ? {
        title: text('#dialog-title'),
        body: text('#dialog-content'),
        choices: all('#dialog-content [data-action], #dialog-content [data-command]').map(button => ({
          action: button.dataset.action || button.dataset.command,
          id: button.dataset.id || '',
          label: compact(button.textContent),
          locked: Boolean(button.disabled),
        })),
      } : null,
      status: worldHint.startsWith('这一次的故事已经写完') ? 'dead'
        : worldHint.startsWith('远方回应了你的光') ? 'won' : 'playing',
    };
  }

  function renderObservation(observation) {
    const lines = [];
    const { clock, stats } = observation;
    lines.push(`【时间】第 ${clock.day} 天 ${clock.time}｜${clock.phase}｜${clock.weather}`);
    lines.push(`【状态】${stats.map(stat => `${stat.name} ${stat.value}（${stat.label}）`).join('｜')}`);
    lines.push(`【营火】${observation.fire}`);
    lines.push(`【位置】${observation.scene.name}（${observation.scene.tag}）${observation.scene.description}`);
    lines.push(`【指引】${observation.guide.nights}｜${observation.guide.title}：${observation.guide.description} ${observation.guide.steps.join(' ')}`);
    if (observation.journal.length) lines.push(`【最近记录】\n${observation.journal.map(entry => `  ${entry.time} ${entry.title}：${entry.text}`).join('\n')}`);
    const actions = observation.actions.map((action, index) => `${index + 1}. gather id=${action.id} ${action.label}｜${action.reward || action.detail}${action.locked ? `｜不可用：${action.detail}` : ''}`);
    lines.push(`【当前地点的动作】\n${actions.length ? actions.map(line => `  ${line}`).join('\n') : '  （无可选动作）'}`);
    const hotspots = observation.hotspots.filter(hotspot => ['feedFire', 'sleep'].includes(hotspot.action));
    if (hotspots.length) lines.push(`【营地操作】${hotspots.map(hotspot => `${hotspot.action} ${hotspot.label}${hotspot.locked ? '（不可用）' : ''}`).join('｜')}`);
    lines.push(`【可前往】（travel id=地点）${observation.travels.map(travel => `${travel.id} ${travel.label}${travel.here ? '（当前）' : ''}`).join('｜')}`);
    const inventory = observation.inventory.map(item => {
      if (item.usable) return `${item.name}×${item.count}[use id=${item.id} ${item.useLabel}${item.locked ? '·当前不可用' : ''}]`;
      return `${item.name}×${item.count}${item.scanned ? '（只能用于制作）' : ''}`;
    });
    if (inventory.length) lines.push(`【行囊】${inventory.join('、')}${observation.itemDetail ? `｜选中项：${observation.itemDetail}` : ''}`);
    if (observation.recipes.length) {
      const available = observation.recipes.filter(recipe => !recipe.locked);
      const blocked = observation.recipes.filter(recipe => recipe.locked);
      if (available.length) lines.push(`【现在可制作/建造】${available.map(recipe => `craft id=${recipe.id} ${recipe.name}`).join('｜')}`);
      if (blocked.length) lines.push(`【还缺材料的配方】（不可点，只能用来了解还差什么）${blocked.map(recipe => `${recipe.name}：需要 ${recipe.costs}${recipe.state ? `（${recipe.state}）` : ''}`).join('｜')}`);
    }
    if (observation.dialog) {
      lines.push(`【弹窗】${observation.dialog.title}\n  ${observation.dialog.body}`);
      lines.push(`【弹窗选项】${observation.dialog.choices.map(choice => `${choice.action} id=${choice.id} ${choice.label}${choice.locked ? '（不可用）' : ''}`).join('｜')}`);
    }
    return lines.join('\n');
  }

  /* ── 候选动作：jev 引擎用它做单选 ─────────────────────────── */

  function candidateKey(option) {
    const id = option.id || '';
    if (option.action === 'gather') return `gather:${id}`;
    if (option.action === 'feedFire') return 'feedFire:';
    if (option.action === 'sleep') return 'sleep:';
    if (option.action === 'travel') return `travel:${id}`;
    if (option.action === 'craft') return `craft:${id}`;
    if (option.action === 'use') return `use:${id}`;
    if (option.action === 'choose') return `choose:${id}`;
    return 'wait:';
  }

  function describeOption(option, observation) {
    const parts = [];
    if (option.action === 'gather') {
      const recipe = observation.actions.find(item => item.id === option.id);
      parts.push(recipe?.reward || recipe?.detail || `执行 ${option.id}`);
      if (recipe?.detail && recipe.reward) parts.push(recipe.detail);
    } else if (option.action === 'feedFire') {
      parts.push('木材 ×1、10 分钟，延长营火燃烧时间');
    } else if (option.action === 'sleep') {
      parts.push('一觉睡到早晨 06:00，恢复生命与理智');
    } else if (option.action === 'travel') {
      const place = observation.travels.find(item => item.id === option.id);
      parts.push(`前往${place?.label || option.id}，会消耗赶路时间`);
    } else if (option.action === 'craft') {
      const recipe = observation.recipes.find(item => item.id === option.id);
      parts.push(`制作/建造${recipe?.name || option.id}`);
      if (recipe?.costs) parts.push(`需要 ${recipe.costs}`);
      parts.push(recipe?.state || '材料齐全');
    } else if (option.action === 'use') {
      const item = observation.inventory.find(entry => entry.id === option.id) || {};
      parts.push(`使用/食用${item.name || option.id}（还有 ${item.count} 个）：${item.useLabel || '消耗 1 个，耗时 5 分钟'}`);
    } else if (option.action === 'choose') {
      const choice = observation.dialog?.choices.find(item => item.id === option.id) || {};
      parts.push(`事件选项「${choice.label || option.id}」`);
    } else {
      parts.push('什么都不做，时间不会前进，仅在没有更好选择时使用');
    }
    if (option.locked) parts.push('当前不可用');
    return parts.filter(Boolean).join('；');
  }

  /** 枚举本回合所有可执行的关键动作，缺材料的配方也在其中（说明里标注）。 */
  function enumerateOptions(observation) {
    const options = [];
    const seen = new Set();
    const add = option => {
      const key = candidateKey(option);
      if (seen.has(key)) return;
      seen.add(key);
      options.push({ key, action: option.action, id: option.id || '', locked: Boolean(option.locked) });
    };
    if (observation.dialog) {
      for (const choice of observation.dialog.choices) add({ action: 'choose', id: choice.id, locked: choice.locked });
      return options;
    }
    for (const action of observation.actions) if (action.id) add({ action: 'gather', id: action.id, locked: action.locked });
    for (const hotspot of observation.hotspots) if (hotspot.action === 'feedFire' || hotspot.action === 'sleep') add({ action: hotspot.action, id: '', locked: hotspot.locked });
    for (const travel of observation.travels) if (!travel.here) add({ action: 'travel', id: travel.id });
    for (const recipe of observation.recipes) if (recipe.id) add({ action: 'craft', id: recipe.id, locked: recipe.locked });
    for (const item of observation.inventory) if (item.usable) add({ action: 'use', id: item.id, locked: item.locked });
    add({ action: 'wait', id: '' });
    return options;
  }

  /* ── 把决定翻译成点击步骤，命令行与网页面板执行同一份计划 ───────── */

  function planAction(action, id, observation) {
    const obs = observation || {};
    if (action === 'wait') return { steps: [], note: '这一回合只作观望' };
    if (action === 'gather') return { steps: [
      { type: 'view', view: 'explore' },
      { type: 'click', selectors: [`#action-grid [data-action="gather"][data-id="${selectorId(id)}"]`], label: `采集 ${id}` },
    ] };
    if (action === 'feedFire' || action === 'sleep') return { steps: [
      { type: 'view', view: 'explore' },
      { type: 'click', selectors: [`#scene-hotspots [data-action="${action}"]`, `[data-action="${action}"]`], label: action === 'feedFire' ? '添柴' : '入睡' },
    ] };
    if (action === 'travel') return { steps: [
      { type: 'view', view: 'map' },
      { type: 'click', selectors: [`#map-locations [data-location="${selectorId(id)}"]`], label: `地点 ${id}` },
      { type: 'click', selectors: [`#map-detail [data-action="travel"][data-id="${selectorId(id)}"]`], label: `前往 ${id}` },
    ] };
    if (action === 'craft') {
      const recipe = (obs.recipes || []).find(item => item.id === id);
      const categories = recipe && recipe.category ? [recipe.category, ...CRAFT_FILTERS.filter(item => item !== recipe.category)] : CRAFT_FILTERS;
      return { steps: [
        { type: 'view', view: 'craft' },
        { type: 'filter', categories, target: id },
        { type: 'click', selectors: [`#recipe-grid [data-action="craft"][data-id="${selectorId(id)}"]`], label: `制作 ${id}` },
      ] };
    }
    if (action === 'use') return { steps: [
      { type: 'view', view: 'explore' },
      { type: 'click', selectors: [`[data-item="${selectorId(id)}"]`], label: `物品 ${id}` },
      { type: 'click', selectors: ['#item-detail [data-action="use"]'], label: `使用 ${id}` },
    ] };
    if (action === 'choose') return { steps: [
      { type: 'click', selectors: [`#dialog-content [data-action="choose"][data-id="${selectorId(id)}"]`], label: `选项 ${id}` },
    ] };
    return null;
  }

  // 已经适配画面读取的游戏；新增游戏时在这里登记，并补上对应的选择器。
  const SUPPORTED_GAMES = ['jihuan'];
  const supports = gameId => SUPPORTED_GAMES.includes(String(gameId || ''));

  return { SUPPORTED_GAMES, supports, readObservation, renderObservation, readRecipes, readInventory, scanUsableItems, scanCraftRecipes, enumerateOptions, describeOption, candidateKey, planAction, CRAFT_FILTERS };
});
