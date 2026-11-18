(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 渲染层：地图、状态、对话框、战斗演出、手册/楼传/存档/帮助弹层、结局。
  // 引擎通过 game.ui 调用这里；app.js 负责输入与存档动作。
  // ---------------------------------------------------------------------------

  const D = () => window.MotaData || {};
  const S = () => window.MotaSprites || {};
  const $ = (id) => document.getElementById(id);
  const pad2 = (n) => String(n).padStart(2, '0');
  const esc = (text) => String(text == null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const dom = {};
  let game = null;
  let peakHp = 0;
  let soundOn = true;
  let audioCtx = null;

  // ---------- 小工具 ----------

  function tiles() {
    const raw = D().tiles || {};
    return raw.tiles || raw;
  }

  function tileOf(n) {
    const table = tiles();
    return table[n] || table[String(n)] || { kind: 'floor' };
  }

  function sprite(fn, key, cls) {
    const f = S()[fn];
    return typeof f === 'function' ? f(key, cls) : '';
  }

  function fmt(n) {
    if (n == null || Number.isNaN(n)) return '—';
    if (n >= 100000000) return `${(n / 100000000).toFixed(1)}亿`;
    if (n >= 100000) return `${(n / 10000).toFixed(1)}万`;
    if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  function riskClass(damage, hp) {
    if (damage === 0) return 'risk-free';
    if (damage >= hp) return 'risk-lethal';
    if (damage > hp * 0.5) return 'risk-high';
    if (damage > hp * 0.15) return 'risk-mid';
    return 'risk-low';
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, prefersReducedMotion() ? Math.min(ms, 90) : ms));
  }

  // ---------- 声音（无外部素材，全部现场合成） ----------

  function sound(name) {
    if (!soundOn) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!audioCtx) audioCtx = new Audio();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      const notes = {
        step: [[196, 0.03, 0.012]],
        hit: [[110, 0.1, 0.05], [82, 0.12, 0.04]],
        hurt: [[140, 0.12, 0.04]],
        get: [[660, 0.06, 0.03], [880, 0.09, 0.025]],
        door: [[180, 0.09, 0.035], [240, 0.07, 0.025]],
        levelup: [[523, 0.08, 0.03], [659, 0.08, 0.03], [784, 0.12, 0.03]],
        win: [[392, 0.12, 0.035], [523, 0.12, 0.035], [659, 0.16, 0.04], [784, 0.24, 0.04]],
        error: [[150, 0.09, 0.03]]
      };
      const list = notes[name] || notes.get;
      list.forEach(([freq, dur, gain], i) => {
        const osc = audioCtx.createOscillator();
        const amp = audioCtx.createGain();
        osc.type = name === 'hit' || name === 'hurt' ? 'square' : 'triangle';
        osc.frequency.value = freq;
        amp.gain.setValueAtTime(0.0001, now + i * 0.06);
        amp.gain.exponentialRampToValueAtTime(gain, now + i * 0.06 + 0.01);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + dur);
        osc.connect(amp).connect(audioCtx.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + dur + 0.02);
      });
    } catch (err) { /* 声音永远不是必需的 */ }
  }

  function setSound(on) {
    soundOn = !!on;
    const btn = dom.sound;
    if (!btn) return;
    btn.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    btn.setAttribute('aria-label', soundOn ? '音效开关（当前开启）' : '音效开关（当前静音）');
    const use = $('sound-use');
    if (use) use.setAttribute('href', soundOn ? '#g-sound' : '#g-mute');
  }

  // ---------- 初始化 ----------

  function init(options) {
    const ids = ['shell', 'sprite-defs', 'meter-now', 'meter-fill', 'meter-total', 'floor-numeral', 'floor-eyebrow',
      'floor-name', 'floor-note', 'board', 'float-layer', 'player', 'boot', 'battle', 'battle-foe-use',
      'battle-foe-name', 'battle-board-foe-name', 'battle-hero-hp', 'battle-hero-atk', 'battle-hero-def',
      'battle-hero-turns', 'battle-hero-bar', 'battle-foe-hp', 'battle-foe-atk', 'battle-foe-def',
      'battle-foe-money', 'battle-foe-bar', 'battle-damage', 'battle-note', 'battle-skip', 'battle-head',
      'dialog', 'dialog-face', 'dialog-face-use', 'dialog-name', 'dialog-text', 'dialog-choices', 'dialog-hint',
      'dialog-next', 'toolbar', 'pad', 'stat-hp', 'hp-fill', 'stat-atk', 'stat-def', 'stat-gold', 'key-y', 'key-b',
      'key-r', 'stat-floor', 'floor-ratio', 'floor-remains', 'item-list', 'log', 'hero-sub', 'panel-status',
      'status-chips', 'toolbar-more', 'toolbar-shell', 'sheet',
      'sheet-title', 'sheet-kicker', 'sheet-body', 'sheet-close', 'ending', 'ending-kind', 'ending-title', 'tile-tip', 'tile-tip-title', 'tile-tip-sub',
      'ending-reason', 'ending-stats', 'ending-again', 'ending-close', 'toast', 'announce', 'btn-sound',
      'btn-undo', 'btn-save', 'btn-load', 'btn-manual', 'btn-fly', 'btn-help', 'btn-restart', 'board-frame'];
    ids.forEach((id) => { dom[id] = $(id); });
    dom.board = $('mota-map');
    game = options && options.game ? options.game : null;
    setSound(true);
    bindDialogPointer();
    bindSheet();
    bindEnding();
    bindToolbarHint();
    bindTileTips();
    return api;
  }

  // ---------- 格子悬浮提示 ----------
  // 鼠标停在格子上就立刻显示说明（比浏览器自带 title 快、能排版）：
  // 道具显示这一层的真实加量（血瓶/宝石吃本层倍率），怪物显示三维与预计损血。

  function floorRatio() {
    if (!game || typeof game.floorData !== 'function') return 1;
    try {
      const ratio = game.floorData().ratio;
      const r = Number(ratio);
      return Number.isFinite(r) ? r : 1;
    } catch (err) { return 1; }
  }

  function itemTipText(id) {
    const rules = window.MotaRules;
    const data = D() || {};
    if (!rules || typeof rules.toolText !== 'function') {
      const item = (data.items || {})[id];
      return item ? String(item.text || '').replace(/^[，,]/, '') : '';
    }
    try {
      return String(rules.toolText(id, data.values, floorRatio()) || '');
    } catch (err) { return ''; }
  }

  // 地图上任何事件（滚动、换层）都要把提示收起来
  function hideTileTip() {
    const tip = dom['tile-tip'];
    if (!tip) return;
    tip.hidden = true;
    tip.dataset.for = '';
  }

  function placeTileTip(node) {
    const tip = dom['tile-tip'];
    if (!tip || !node) return;
    const title = node.dataset.tip || node.getAttribute('aria-label') || '';
    const sub = node.dataset.tipSub || '';
    if (!title && !sub) { hideTileTip(); return; }
    const titleNode = dom['tile-tip-title'];
    const subNode = dom['tile-tip-sub'];
    if (titleNode) titleNode.textContent = title;
    if (subNode) subNode.textContent = sub;
    tip.dataset.for = node.dataset.x ? `${node.dataset.x},${node.dataset.y}` : (node.id || '');
    tip.hidden = false;

    const pad = 8;
    const box = node.getBoundingClientRect();
    const rect = tip.getBoundingClientRect();
    let left = box.left + box.width / 2 - rect.width / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - rect.width - pad));
    let top = box.top - rect.height - 8;
    let placement = 'top';
    if (top < pad) { top = box.bottom + 8; placement = 'bottom'; }
    tip.dataset.placement = placement;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }

  function bindTileTips() {
    const tip = dom['tile-tip'];
    if (!tip) return;
    // 地图格子、道具条上的小方块都带 data-tip，统一委托到 document
    document.addEventListener('pointerover', (event) => {
      const node = event.target && event.target.closest ? event.target.closest('[data-tip], [data-tip-sub]') : null;
      if (!node) { hideTileTip(); return; }
      placeTileTip(node);
    });
    document.addEventListener('pointerdown', hideTileTip, true);
    // 鼠标直接移出窗口时 relatedTarget 为空，这时也要收起来
    window.addEventListener('pointerout', (event) => { if (!event.relatedTarget) hideTileTip(); });
    window.addEventListener('scroll', hideTileTip, { passive: true, capture: true });
    window.addEventListener('resize', hideTileTip);
    hideTileTip();
  }

  function bindToolbarHint() {
    if (dom['toolbar-more']) {
      dom['toolbar-more'].style.pointerEvents = 'auto';
      dom['toolbar-more'].style.cursor = 'pointer';
      dom['toolbar-more'].addEventListener('click', () => {
        if (dom.toolbar) dom.toolbar.scrollBy({ left: 180, behavior: 'smooth' });
      });
    }
    if (dom.toolbar) dom.toolbar.addEventListener('scroll', updateToolbarHint, { passive: true });
    window.addEventListener('resize', updateToolbarHint);
  }

  function setGame(next) {
    game = next;
    peakHp = 0;
  }

  // ---------- 地图 ----------

  const WALL_TERRAIN = { yellowWall2: 'wall-yellow', whiteWall2: 'wall-white', blueWall2: 'wall-blue', blockWall: 'wall-block', grayWall: 'wall-gray', white: 'wall-white' };
  const NET = { lavaNet: 'net-lava', poisonNet: 'net-poison', weakNet: 'net-weak', curseNet: 'net-curse' };
  const ARROWS = { arrowUp: 'arr-up', arrowDown: 'arr-down', arrowLeft: 'arr-left', arrowRight: 'arr-right' };

  function tileHtml(x, y, code, risk, hero) {
    const t = tileOf(code);
    // 空气墙 / 隐形花 / whiteWall2 / fire：原塔靠插件画成空气墙，这里一律当空地画，
    // 但格子本身保留（data-x/data-y 仍在），走过去照样会被挡住。
    if (t.invisible) {
      return `<div class="tile tile-floor" data-x="${x}" data-y="${y}"></div>`;
    }
    const kind = t.kind || 'floor';
    const id = t.id || '';
    const visual = t.visual || id;
    let cls = 'tile';
    let inner = '';
    let title = '';
    let tipSub = '';
    let art = '';

    if (kind === 'wall') {
      cls += ' tile-wall';
      if (visual === 'autotile1') cls += ' wall-blue';
      else if (visual === 'autotile2') cls += ' wall-block';
      else if (visual === 'autotile3') cls += ' wall-gray';
      else if (visual === 'autotile4') cls += ' wall-white';
      else cls += ' wall-yellow';
      title = '石墙';
    } else if (kind === 'fakeWall') {
      cls += ' tile-wall is-fake';
      title = t.canBreak === false ? '暗墙（地震卷轴拆不开）' : '暗墙';
    } else if (kind === 'floor') {
      cls += ' tile-floor';
    } else if (kind === 'stair') {
      cls += ` tile-stairs stair-${id === 'upFloor' ? 'up' : 'down'}`;
      inner = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><use href="#g-${id === 'upFloor' ? 'stairs-up' : 'stairs-down'}"/></svg>`;
      title = id === 'upFloor' ? '上楼' : '下楼';
    } else if (kind === 'door') {
      const color = id === 'yellowDoor' ? 'Y' : id === 'blueDoor' ? 'B' : id === 'redDoor' ? 'R'
        : id === 'greenDoor' ? 'G' : id === 'steelDoor' ? 'S' : 'X';
      cls += ` tile-door door-${color}`;
      inner = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><use href="#g-door"/></svg>`;
      title = t.name || '门';
    } else if (kind === 'item') {
      cls += ' tile-item';
      art = sprite('itemSvg', id);
      const item = (D().items || {})[id];
      title = item ? `${item.name}` : '道具';
      tipSub = itemTipText(id);
    } else if (kind === 'enemy') {
      cls += ' tile-enemy';
      art = sprite('enemySvg', id);
      const enemy = (D().enemys || {})[id] || {};
      let extra = '';
      if (risk && risk.ok === false) {
        inner += `<b class="risk risk-blocked" aria-label="这一战打不赢">?</b>`;
        cls += ' is-deadly';
        extra = ' · 这一战打不赢';
      } else if (risk && typeof risk.d === 'number') {
        inner += `<b class="risk ${riskClass(risk.d, hero.hp)}" aria-label="损血 ${risk.d}">${fmt(risk.d)}</b>`;
        extra = ` · 损血 ${risk.d}`;
      } else if (risk && risk.d === null) {
        inner += `<b class="risk risk-blocked" aria-label="破不了防">?</b>`;
        extra = ' · 破不了防';
      }
      title = `${enemy.name || '怪物'}`;
      tipSub = `生命 ${enemy.hp ?? '?'} · 攻击 ${enemy.atk ?? '?'} · 防御 ${enemy.def ?? '?'}${extra}`;
    } else if (kind === 'npc') {
      cls += ' tile-npc';
      art = sprite('npcSvg', id);
      title = id === 'king' ? '作者' : (t.name || npcName(id));
    } else if (kind === 'animate') {
      cls += ' tile-anim';
      if (id === 'lava') { cls += ' is-lava'; title = '岩浆'; }
      else if (NET[id]) { cls += ` is-net ${NET[id]}`; title = NET[id] === 'net-lava' ? '岩浆网' : NET[id] === 'net-poison' ? '毒网' : NET[id] === 'net-weak' ? '衰弱网' : '诅咒网'; }
      else if (id === 'water' || id === 'blueWater') { cls += ' is-water'; title = '水'; }
      else if (id === 'ice') { cls += ' is-ice'; title = '冰'; }
      else if (id === 'star') { cls += ' is-star'; art = sprite('tileSvg', 'star'); }
      else if (id === 'fire') { cls += ' is-fire'; art = sprite('tileSvg', 'fire'); title = '火'; }
      else if (id === 'switch') { cls += ' is-switch'; art = sprite('tileSvg', 'switch'); title = '机关'; }
      else if (/Portal/.test(id)) { cls += ' is-portal'; art = sprite('tileSvg', id); title = '传送阵'; }
      else if (/crystal/i.test(id)) { cls += ' is-crystal'; art = sprite('tileSvg', id); }
      else { cls += ' is-plain'; }
    } else if (kind === 'terrain') {
      cls += ' tile-terrain';
      if (ARROWS[id]) { cls += ` is-arrow ${ARROWS[id]}`; title = '箭头：只能顺方向走'; }
      else if (id === 'light') { cls += ' is-light'; title = '灯'; }
      else if (id === 'darkLight') { cls += ' is-dark'; title = '熄灭的灯'; }
      else if (id === 'ice') { cls += ' is-ice'; }
      else if (id === 'ski') { cls += ' is-ski'; title = '滑道'; }
      else if (id === 'flower') { cls += ' is-flower'; }
      else if (id === 'box' || id === 'boxed') { cls += ' is-box'; }
      else if (/Shop/.test(id)) { cls += ' is-shop'; title = '商店'; }
      else if (WALL_TERRAIN[id]) { cls += ` is-terrain-wall ${WALL_TERRAIN[id]}`; title = '墙'; }
      else { cls += ' is-ground'; }
    }

    const glyph = art ? `<span class="tile-art">${art}</span>` : '';
    const label = title ? ` data-tip="${esc(title)}"` : '';
    const subLabel = tipSub ? ` data-tip-sub="${esc(tipSub)}"` : '';
    const ariaText = title && tipSub ? `${title}：${tipSub}` : (title || tipSub);
    const aria = ariaText ? ` aria-label="${esc(ariaText)}"` : '';
    return `<div class="${cls}" data-x="${x}" data-y="${y}"${label}${subLabel}${aria}>${glyph}${inner}</div>`;
  }

  function npcName(id) {
    const map = {
      oldman: '老人', trader: '商人', specialTrader: '商人', thief: '小偷', king: '作者', princess: '公主',
      child: '小孩', wood: '木桩', magician: '法师', womanMagician: '女法师', blueShop: '祭坛', pinkShop: '祭坛'
    };
    return map[id] || 'NPC';
  }

  function renderBoard(snapshot) {
    const map = snapshot.map || [];
    const hero = snapshot.hero || {};
    const risk = snapshot.risk || [];
    let html = '';
    for (let y = 0; y < 13; y++) {
      const row = map[y] || [];
      for (let x = 0; x < 13; x++) {
        html += tileHtml(x, y, row[x] == null ? 0 : row[x], risk[y] && risk[y][x], hero);
      }
    }
    dom.board.innerHTML = html;
    const loc = hero.loc || { x: 6, y: 11 };
    const heroTile = dom.board.querySelector(`.tile[data-x="${loc.x}"][data-y="${loc.y}"]`);
    if (heroTile) heroTile.dataset.hero = 'true';
  }

  function setPlayer(x, y) {
    if (!dom.player) return;
    dom.player.style.setProperty('--px', x);
    dom.player.style.setProperty('--py', y);
    dom.player.dataset.x = x;
    dom.player.dataset.y = y;
    dom.player.dataset.hero = 'true';
  }

  function float(x, y, text, kind) {
    if (!dom['float-layer']) return;
    const node = document.createElement('span');
    node.className = `float ${kind ? `float-${kind}` : ''}`;
    node.style.setProperty('--fx', x);
    node.style.setProperty('--fy', y);
    node.textContent = text;
    dom['float-layer'].appendChild(node);
    setTimeout(() => node.remove(), 900);
  }

  // ---------- 状态栏 ----------

  function renderStats(snapshot) {
    const hero = snapshot.hero || {};
    const hp = Number(hero.hp) || 0;
    peakHp = Math.max(peakHp, hp, 1000);
    dom['stat-hp'].textContent = fmt(hp);
    const ratio = Math.max(0.02, Math.min(1, hp / peakHp));
    dom['hp-fill'].style.width = `${ratio * 100}%`;
    dom['hp-fill'].dataset.low = hp > 0 && hp < peakHp * 0.2 ? 'true' : 'false';
    dom['stat-atk'].textContent = fmt(hero.atk);
    dom['stat-def'].textContent = fmt(hero.def);
    dom['stat-gold'].textContent = fmt(hero.money);
    const keys = hero.keys || {};
    dom['key-y'].textContent = keys.yellowKey || 0;
    dom['key-b'].textContent = keys.blueKey || 0;
    dom['key-r'].textContent = keys.redKey || 0;

    const n = snapshot.n || 0;
    const total = snapshot.total || 51;
    dom['stat-floor'].textContent = `${n} / ${total}`;
    dom['meter-now'].textContent = pad2(n);
    if (dom['meter-total']) dom['meter-total'].textContent = `/ ${total}`;
    dom['meter-fill'].style.width = `${Math.max(2, Math.min(100, (n / total) * 100))}%`;
    dom['floor-numeral'].textContent = pad2(n);
    dom['floor-eyebrow'].textContent = `FLOOR ${pad2(n)} / ${total}`;
    dom['floor-name'].textContent = snapshot.name || `第 ${n} 层`;
    dom['floor-note'].textContent = snapshot.note || '';
    dom['floor-ratio'].textContent = `本层物资 ×${snapshot.ratio ?? 1}`;
    const remain = snapshot.remaining || {};
    dom['floor-remains'].textContent = `怪物 ${remain.enemies ?? 0} · 宝物 ${remain.items ?? 0}`;

    const items = snapshot.items || [];
    if (!items.length) {
      dom['item-list'].innerHTML = '<li class="item-empty">还没有常驻道具</li>';
    } else {
      dom['item-list'].innerHTML = items.map((item) => {
        const sub = String(item.tip || item.text || '').replace(/^[，,、\s]+/, '');
        const tipAttrs = ` data-tip="${esc(item.name)}"${sub ? ` data-tip-sub="${esc(sub)}"` : ''}`;
        return `<li class="item-chip"${tipAttrs}>${sprite('itemSvg', item.id)}<span>${esc(item.name)}</span>${item.count > 1 ? `<b>${item.count}</b>` : ''}</li>`;
      }).join('');
    }

    renderStatus(snapshot.statusChips);

    if (snapshot.canUndo != null && dom['btn-undo']) dom['btn-undo'].disabled = !snapshot.canUndo;
    if (snapshot.heroTitle && dom['hero-sub']) dom['hero-sub'].textContent = snapshot.heroTitle;
  }

  function renderStatus(chips) {
    if (!dom['panel-status']) return;
    const list = chips || [];
    dom['panel-status'].hidden = list.length === 0;
    dom['status-chips'].innerHTML = list.map((chip) => (
      `<span class="status-chip ${chip.tone ? `is-${esc(chip.tone)}` : ''}" title="${esc(chip.text || '')}">${esc(chip.label)}</span>`
    )).join('');
  }

  function renderTools(tools) {
    if (!dom.toolbar) return;
    const list = tools || [];
    dom.toolbar.hidden = list.length === 0;
    dom.toolbar.innerHTML = list.map((tool) => {
      const active = tool.active ? ' aria-pressed="true"' : ' aria-pressed="false"';
      const hotkey = tool.key ? `<kbd>${esc(tool.key)}</kbd>` : '';
      return `<button type="button" class="tool-chip" data-tool="${esc(tool.id)}"${active} aria-label="${esc(tool.label)}${tool.count > 1 ? `，${tool.count} 个` : ''}"><span class="tool-ico">${tool.icon || ''}</span><span class="tool-label">${esc(tool.label)}</span>${tool.count > 1 ? `<b>${tool.count}</b>` : ''}${hotkey}</button>`;
    }).join('');
    updateToolbarHint();
  }

  function updateToolbarHint() {
    if (!dom.toolbar || !dom['toolbar-more']) return;
    const more = dom.toolbar.scrollWidth > dom.toolbar.clientWidth + 2;
    dom['toolbar-more'].hidden = dom.toolbar.hidden || !more;
  }

  function renderLog(entries) {
    if (!dom.log) return;
    const lines = (entries || [])
      .map((entry) => (typeof entry === 'string' ? entry : (entry && entry.text) || ''))
      .map((text) => String(text).trim())
      .filter(Boolean)
      .slice(-5);
    dom.log.innerHTML = lines.map((text) => `<li>${esc(text)}</li>`).join('');
  }

  function setAim(on) {
    if (dom.board) dom.board.classList.toggle('is-aiming', !!on);
  }

  function announce(text) {
    if (!dom.announce) return;
    dom.announce.textContent = '';
    window.setTimeout(() => { dom.announce.textContent = text; }, 20);
  }

  function render(snapshot) {
    if (!dom.board) return;
    hideTileTip();
    renderBoard(snapshot);
    const loc = (snapshot.hero && snapshot.hero.loc) || { x: 6, y: 11 };
    setPlayer(loc.x, loc.y);
    renderStats(snapshot);
    renderTools(snapshot.tools);
    renderLog(snapshot.log);
  }

  // ---------- 对话框 ----------

  let dialogResolve = null;
  let dialogMode = 'idle';
  let dialogChoices = null;

  function setDialogIdle() {
    dialogMode = 'idle';
    dialogChoices = null;
    if (!dom.dialog) return;
    dom.dialog.dataset.mode = 'idle';
    dom['dialog-name'].hidden = true;
    dom['dialog-face'].hidden = true;
    dom['dialog-choices'].innerHTML = '';
    dom['dialog-choices'].hidden = true;
    dom['dialog-next'].hidden = true;
    dom['dialog-text'].textContent = '方向键 / W A D 移动（↓ 向下，S 存档）· 点地图上能走的地方会自动走过去';
    dom['dialog-hint'].textContent = '';
  }

  function renderDialogText(text) {
    const lines = String(text == null ? '' : text).split('\n');
    dom['dialog-text'].innerHTML = lines.map((line) => esc(line)).join('<br>');
    if (dom.dialog) dom.dialog.scrollTop = 0;
  }

  function speakerFace(speaker, icon) {
    const key = icon || '';
    const alias = {
      king: 'king', oldman: 'oldman', trader: 'trader', thief: 'thief', princess: 'princess',
      blueShop: 'blueShop', pinkShop: 'pinkShop', knight: 'npc4', hero: 'hero', demon: 'king'
    };
    if (alias[key]) return sprite('npcSvg', alias[key]);
    const bySpeaker = { '老人': 'oldman', '商人': 'trader', '小偷': 'thief', '作者': 'king', '公主': 'princess', '祭坛': 'blueShop' };
    if (bySpeaker[speaker]) return sprite('npcSvg', bySpeaker[speaker]);
    if (speaker === '勇者') return S().art ? S().art('hero', 'hero') : '';
    return '';
  }

  function openDialog({ speaker, text, icon, choices, onNext }) {
    dialogMode = choices && choices.length ? 'choose' : 'say';
    dialogChoices = choices || null;
    dialogResolve = onNext;
    dom.dialog.dataset.mode = dialogMode;
    const name = speaker || '';
    dom['dialog-name'].hidden = !name;
    dom['dialog-name'].textContent = name;
    renderDialogText(text);
    const face = speakerFace(name, icon);
    dom['dialog-face'].hidden = !face;
    if (face) {
      dom['dialog-face'].innerHTML = face;
    }
    if (dialogMode === 'choose') {
      dom['dialog-choices'].hidden = false;
      dom['dialog-choices'].innerHTML = choices.map((choice, index) => (
        `<button type="button" class="choice" data-index="${index}"><span class="choice-num">${index + 1}</span><span class="choice-text">${esc(choice.text || '')}</span></button>`
      )).join('');
      dom['dialog-next'].hidden = true;
      dom['dialog-hint'].textContent = '数字键 1–9 选择 · 也可以用鼠标点';
      const first = dom['dialog-choices'].querySelector('.choice');
      if (first) window.setTimeout(() => first.focus({ preventScroll: true }), 30);
    } else {
      dom['dialog-choices'].hidden = true;
      dom['dialog-choices'].innerHTML = '';
      dom['dialog-next'].hidden = false;
      dom['dialog-hint'].textContent = '空格 / 回车 / 点击继续';
      window.setTimeout(() => dom['dialog-next'].focus({ preventScroll: true }), 30);
    }
  }

  function finishDialog(value) {
    const resolve = dialogResolve;
    dialogResolve = null;
    setDialogIdle();
    if (resolve) resolve(value);
  }

  function advanceDialog() {
    if (dialogMode !== 'say') return false;
    finishDialog(undefined);
    return true;
  }

  function chooseDialog(index) {
    if (dialogMode !== 'choose' || !dialogChoices) return false;
    if (index < 0 || index >= dialogChoices.length) return false;
    finishDialog(index);
    return true;
  }

  function bindDialogPointer() {
    const dialog = dom.dialog;
    if (!dialog) return;
    dialog.addEventListener('click', (event) => {
      const choice = event.target.closest('.choice');
      if (choice) {
        chooseDialog(Number(choice.dataset.index));
        return;
      }
      if (dialogMode === 'say') advanceDialog();
    });
  }

  function say(payload) {
    const data = payload || {};
    return new Promise((resolve) => {
      openDialog({ speaker: data.speaker, text: data.text, icon: data.icon, choices: null, onNext: resolve });
    });
  }

  function choose(payload) {
    const data = payload || {};
    const choices = (data.choices || []).map((choice) => (typeof choice === 'string' ? { text: choice } : choice));
    return new Promise((resolve) => {
      openDialog({ speaker: data.speaker, text: data.text, icon: data.icon, choices, onNext: resolve });
    });
  }

  // ---------- 战斗 ----------

  let battleSkip = false;
  let battleActive = false;
  let battleWait = null;

  function battleSetText(id, value) {
    const node = $(id);
    if (node) node.textContent = value == null ? '—' : String(value);
  }

  async function battle(payload) {
    const data = payload || {};
    const enemy = data.enemy || {};
    const info = data.info || {};
    const hero = (game && game.state && game.state.hero) || {};
    const hpBefore = data.hpBefore != null ? data.hpBefore : hero.hp;
    const damage = info.damage != null ? info.damage : (data.hpAfter != null ? hpBefore - data.hpAfter : 0);
    const hpAfter = data.hpAfter != null ? data.hpAfter : Math.max(0, hpBefore - damage);

    battleActive = true;
    battleSkip = false;
    dom.battle.hidden = false;
    dom.battle.setAttribute('aria-hidden', 'false');
    dom.battle.classList.remove('is-shown', 'battle-on', 'battle-counter', 'is-down');
    dom.battle.dataset.boss = enemy.boss ? 'true' : 'false';
    dom['battle-foe-use'].setAttribute('href', `#${enemySpriteId(enemy.id)}`);
    dom['battle-board-foe-name'].textContent = enemy.name || '敌人';
    dom['battle-head'].textContent = enemy.boss ? '首领' : '交锋';
    battleSetText('battle-hero-hp', fmt(hpBefore));
    battleSetText('battle-hero-atk', fmt(hero.atk));
    battleSetText('battle-hero-def', fmt(hero.def));
    battleSetText('battle-hero-turns', info.turn != null ? `${info.turn} 回合` : '—');
    battleSetText('battle-foe-hp', fmt(enemy.hp));
    battleSetText('battle-foe-atk', fmt(enemy.atk));
    battleSetText('battle-foe-def', fmt(enemy.def));
    battleSetText('battle-foe-money', fmt(enemy.money));
    battleSetText('battle-damage', damage > 0 ? `-${fmt(damage)}` : '无损');
    if (dom['battle-damage']) dom['battle-damage'].classList.toggle('is-none', !(damage > 0));
    dom['battle-note'].textContent = damage > 0
      ? `生命 ${fmt(hpBefore)} → ${fmt(hpAfter)}`
      : '不损血';
    dom['battle-hero-bar'].style.setProperty('--v', '100%');
    dom['battle-foe-bar'].style.setProperty('--v', '100%');

    await wait(40);
    dom.battle.classList.add('is-shown');
    await wait(120);
    dom.battle.classList.add('battle-on');
    dom['battle-hero-bar'].style.setProperty('--v', `${Math.max(8, Math.min(100, (hpAfter / Math.max(1, hpBefore)) * 100))}%`);
    dom['battle-foe-bar'].style.setProperty('--v', '6%');
    await wait(260);
    if (!battleSkip) {
      dom.battle.classList.add('battle-counter');
      sound('hurt');
      await wait(240);
    }
    dom.battle.classList.add('is-down');
    await wait(battleSkip ? 40 : 380);

    battleActive = false;
    dom.battle.hidden = true;
    dom.battle.setAttribute('aria-hidden', 'true');
    dom.battle.classList.remove('is-shown', 'battle-on', 'battle-counter', 'is-down');
    if (battleWait) { battleWait(); battleWait = null; }
  }

  function enemySpriteId(id) {
    const art = (S().ENEMY_ART || {})[id];
    if (!art) return 'sp-ghost-ash';
    return `sp-${art[0]}-${art[1]}`;
  }

  function skipBattle() {
    battleSkip = true;
    if (battleActive) dom.battle.classList.add('is-down');
  }

  // ---------- 提示 ----------

  let toastTimer = null;
  function tip(text) {
    if (!dom.toast || text == null) return;
    dom.toast.textContent = String(text);
    dom.toast.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove('visible'), 2200);
  }

  function boot(show, note) {
    if (!dom.boot) return;
    dom.boot.hidden = !show;
    if (note) {
      const small = dom.boot.querySelector('small');
      if (small) small.textContent = note;
    }
  }

  // ---------- 弹层 ----------

  let sheetOpen = false;

  function bindSheet() {
    if (!dom.sheet) return;
    dom['sheet-close'].addEventListener('click', () => closeSheet());
    dom.sheet.addEventListener('close', () => {
      sheetOpen = false;
      document.body.classList.remove('sheet-on');
    });
    dom.sheet.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeSheet();
    });
  }

  function openSheet({ kicker, title, html }) {
    if (!dom.sheet) return null;
    dom['sheet-kicker'].textContent = kicker || '资料';
    dom['sheet-title'].textContent = title || '';
    dom['sheet-body'].innerHTML = html || '';
    if (!sheetOpen) {
      sheetOpen = true;
      document.body.classList.add('sheet-on');
      if (typeof dom.sheet.showModal === 'function') dom.sheet.showModal();
      else dom.sheet.setAttribute('open', '');
    }
    dom['sheet-body'].scrollTop = 0;
    window.setTimeout(() => dom['sheet-close'].focus({ preventScroll: true }), 20);
    return dom['sheet-body'];
  }

  function closeSheet() {
    if (!dom.sheet || !sheetOpen) return;
    sheetOpen = false;
    document.body.classList.remove('sheet-on');
    if (typeof dom.sheet.close === 'function' && dom.sheet.open) dom.sheet.close();
    else dom.sheet.removeAttribute('open');
  }

  function isSheetOpen() { return sheetOpen; }

  // ---------- 手册 ----------

  function manualSheet(entries, meta) {
    const list = entries || [];
    const info = meta || {};
    const rows = list.map((entry) => {
      const enemy = entry.enemy || {};
      const speed = entry.damage;
      const blocked = speed === null || entry.canBattle === false;
      const traits = (entry.traits || []).map((trait) => (
        `<span class="trait-badge" title="${esc(trait.text || '')}">${esc(trait.name)}</span>`
      )).join('');
      const now = typeof speed === 'number' ? speed : Infinity;
      const steps = (entry.criticals || [])
        .filter((pair) => Array.isArray(pair) && typeof pair[0] === 'number' && typeof pair[1] === 'number' && pair[1] < now)
        .slice(0, 2);
      const critical = steps.map((pair) => `攻击 ${fmt(pair[0])} → 损血 ${fmt(pair[1])}`).join(' · ');
      const defLess = entry.defDamage;
      const defText = typeof defLess === 'number' ? (defLess > 0 ? `加 1 点防御 少损 ${fmt(defLess)}` : '加防御 已经不省血了') : (typeof defLess === 'string' ? defLess : '—');
      const turn = entry.turn ? ` · ${entry.turn} 回合` : '';
      return `<article class="monster-card${blocked ? ' monster-danger' : ''}">
        <div class="monster-heading">
          ${sprite('enemySvg', enemy.id)}
          <div><h3>${esc(enemy.name || enemy.id || '怪物')}</h3><span>生命 ${fmt(enemy.hp)} · 金币 ${fmt(enemy.money)}</span></div>
          <span class="monster-verdict">${blocked ? '暂不可战' : `损血 ${fmt(speed)}${turn}`}</span>
        </div>
        <dl class="monster-stats">
          <div><dt>生命</dt><dd>${fmt(enemy.hp)}</dd></div>
          <div><dt>攻击</dt><dd>${fmt(enemy.atk)}</dd></div>
          <div><dt>防御</dt><dd>${fmt(enemy.def)}</dd></div>
          <div><dt>金币</dt><dd>${fmt(enemy.money)}</dd></div>
          <div><dt>损血</dt><dd>${blocked ? '—' : fmt(speed)}</dd></div>
        </dl>
        <p class="monster-traits">${traits || '<em>没有特殊属性</em>'}</p>
        <p class="monster-critical">临界：${critical || '—'} · <span>${defText}</span></p>
      </article>`;
    }).join('');
    return openSheet({
      kicker: info.kicker || '怪物手册',
      title: info.title || '本层怪物',
      html: `<p class="sheet-note">${esc(info.note || '损血是这一战要付出的生命。临界指攻击达到某个数后，损血会突然降下来。')}</p>
        <div class="bestiary">${rows || '<p class="sheet-note">这一层没有活着的怪物。</p>'}</div>`
    });
  }

  // ---------- 楼传 ----------

  function flySheet(floors, opts) {
    const list = floors || [];
    const options = opts || {};
    const cells = list.map((floor) => {
      const visited = !!floor.visited;
      const here = !!floor.here;
      const reachable = floor.canFlyTo !== false;
      const enabled = visited && !here && reachable && !options.disabled;
      const cls = `jump-cell${visited ? '' : ' is-unknown'}${here ? ' is-here' : ''}`;
      const tags = `${here ? '<i class="jump-here">当前</i>' : ''}${floor.canFlyTo === false ? '<i class="jump-lock">不可达</i>' : ''}`;
      const remains = floor.remains ? `<span class="jump-remains">${esc(floor.remains)}</span>` : '';
      return `<button type="button" class="${cls}" data-floor="${esc(floor.id)}" ${enabled ? '' : 'disabled'} aria-label="${esc(`第 ${floor.n} 层${visited ? '' : '，还没去过'}`)}">
        <b>${pad2(floor.n)}<span class="jump-tags">${tags}</span></b>
        <span>${esc(floor.name || '')}</span>${remains}
      </button>`;
    }).join('');
    return openSheet({
      kicker: '楼传',
      title: '去过的楼层',
      html: `<p class="sheet-note">${esc(options.note || '只能飞到走到过的楼层。灰掉的层还没去过。')}</p><div class="jump-grid">${cells}</div>`
    });
  }

  // ---------- 帮助 / 存档 ----------

  function helpSheet(html) {
    openSheet({ kicker: '帮助', title: '怎么爬这座塔', html });
  }

  function saveSheet(html) {
    return openSheet({ kicker: '存档', title: '存档与读档', html });
  }

  function confirmSheet({ title, text, okText, cancelText }) {
    return new Promise((resolve) => {
      const body = openSheet({
        kicker: '请确认',
        title: title || '确认',
        html: `<p class="sheet-note">${esc(text || '')}</p>
          <div class="sheet-actions">
            <button type="button" class="btn btn-primary" data-confirm="yes">${esc(okText || '确定')}</button>
            <button type="button" class="btn btn-quiet" data-confirm="no">${esc(cancelText || '算了')}</button>
          </div>`
      });
      if (!body) { resolve(false); return; }
      body.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-confirm]');
        if (!btn) return;
        closeSheet();
        resolve(btn.dataset.confirm === 'yes');
      });
    });
  }

  // ---------- 结局 ----------

  let endingOpen = false;

  function bindEnding() {
    if (!dom.ending) return;
    dom['ending-close'].addEventListener('click', () => hideEnding());
    dom.ending.addEventListener('click', (event) => {
      if (event.target === dom.ending) hideEnding();
    });
  }

  function showEnding({ kind, title, reason, stats }) {
    if (!dom.ending) return;
    closeSheet();
    if (dom.toast) dom.toast.classList.remove('visible');
    dom['ending-kind'].textContent = kind || '';
    dom['ending-title'].textContent = title || '通关';
    dom['ending-reason'].textContent = reason || '';
    dom['ending-stats'].innerHTML = (stats || []).map((row) => (
      `<div class="ending-stat"><dt>${esc(row.label)}</dt><dd>${esc(row.value)}</dd></div>`
    )).join('');
    dom.ending.hidden = false;
    endingOpen = true;
    document.body.classList.add('ending-on');
    window.setTimeout(() => $('ending-again').focus({ preventScroll: true }), 30);
  }

  function hideEnding() {
    if (!dom.ending) return;
    dom.ending.hidden = true;
    endingOpen = false;
    document.body.classList.remove('ending-on');
  }

  function isEndingOpen() { return endingOpen; }

  // ---------- 键盘：先给对话框/弹层/演出 ----------

  function captureKey(event) {
    const key = event.key;
    if (key === 'Tab') return false;
    if (endingOpen) {
      if (key === 'Escape') { hideEnding(); return true; }
      if (key === 'Enter' || key === ' ') { $('ending-again').click(); return true; }
      return true;
    }
    if (sheetOpen) {
      if (key === 'Escape') { closeSheet(); return true; }
      return true;
    }
    if (battleActive) {
      if (key === ' ' || key === 'Enter' || key === 'Escape') { skipBattle(); return true; }
      return true;
    }
    if (dialogMode === 'choose') {
      if (/^[1-9]$/.test(key)) {
        if (chooseDialog(Number(key) - 1)) return true;
      }
      if (key === 'Escape') return true;
      if (key === 'Enter' || key === ' ') {
        const first = dom['dialog-choices'].querySelector('.choice');
        if (first) first.click();
        return true;
      }
      return true;
    }
    if (dialogMode === 'say') {
      if (key === ' ' || key === 'Enter' || key === 'Escape') {
        advanceDialog();
        return true;
      }
      return true;
    }
    return false;
  }

  function busy() {
    return endingOpen || sheetOpen || battleActive || dialogMode !== 'idle';
  }

  const api = {
    init, setGame, render, setPlayer, float, tip, sound, setSound, announce,
    say, choose, battle, skipBattle, boot, setAim,
    manualSheet, flySheet, helpSheet, saveSheet, confirmSheet,
    showEnding, hideEnding, isEndingOpen, isSheetOpen, closeSheet, captureKey, busy,
    prefersReducedMotion
  };

  window.MotaView = api;
})();

