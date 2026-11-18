(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 控制层：接引擎、派发输入、道具、存档/读档/导出/导入、手册、楼传、帮助、结局。
  // 渲染与对话在 view.js；规则与事件在 rules.js / engine.js / events.js。
  // ---------------------------------------------------------------------------

  const SAVE_KEY = 'magic-tower-51-v1';
  const SOUND_KEY = 'magic-tower-51-sound';
  const D = () => window.MotaData || {};
  const S = () => window.MotaSprites || {};

  let game = null;
  let engineRef = null;
  let started = false;
  let aim = null;
  let logLines = [];
  let acting = false;
  let bootTimer = null;

  // ---------- 读状态的小工具 ----------

  function state() { return (game && game.state) || {}; }
  function hero() { return state().hero || {}; }
  function heroItems() { const h = hero(); return h.items || h; }
  function bag(name) {
    const items = heroItems();
    const bagValue = items[name] || hero()[name];
    return bagValue && typeof bagValue === 'object' ? bagValue : {};
  }
  function countOf(id) {
    const tool = bag('tools')[id];
    if (typeof tool === 'number') return tool;
    const constant = bag('constants')[id];
    return typeof constant === 'number' ? constant : 0;
  }
  function heroLoc() { return hero().loc || { x: 6, y: 11 }; }
  function floorCount() { const ids = ((D().floors || {}).floorIds) || []; return ids.length || 51; }

  function floorCatalog() {
    const root = (D().floors || {});
    return root.floors || {};
  }

  function currentFloor() {
    try {
      const floor = game && game.floor && game.floor();
      if (floor) return floor;
    } catch (err) { /* 引擎还没准备好时退回数据表 */ }
    const id = state().floorId || 'MT1';
    return floorCatalog()[id] || { n: 1, name: '第 1 层', ratio: 1, map: [] };
  }

  function currentMap(floor) {
    // 引擎的 visibleMap 会处理暗格（hidden），比直接读 state.floors 更准。
    if (game && typeof game.visibleMap === 'function') {
      try {
        const blocks = game.visibleMap();
        if (Array.isArray(blocks) && blocks.length) {
          return blocks.map((row) => row.map((block) => (block && block.n) || 0));
        }
      } catch (err) { /* 退回原始地图 */ }
    }
    const id = state().floorId;
    const live = state().floors && state().floors[id] && state().floors[id].map;
    if (Array.isArray(live) && live.length) return live;
    if (Array.isArray(floor.map) && floor.map.length) return floor.map;
    return [];
  }

  function tileAtCode(map, x, y) {
    const row = map[y];
    return row ? row[x] : 0;
  }

  function tileInfo(code) {
    const table = (D().tiles || {}).tiles || D().tiles || {};
    return table[code] || table[String(code)] || { kind: 'floor' };
  }

  // ---------- 提示与日志 ----------

  function pushLog(text) {
    const line = String(text == null ? '' : text).trim();
    if (!line) return;
    if (logLines[logLines.length - 1] === line) return;
    logLines.push(line);
    if (logLines.length > 20) logLines.shift();
  }

  function tip(text) {
    if (window.MotaView) window.MotaView.tip(text);
    pushLog(text);
  }

  // ---------- 渲染快照 ----------

  const FLOOR_NOTES = {
    0: '地下室。地基比塔更老。',
    1: '塔门。石门在身后合拢。',
    10: '骷髅队长守在这一层。',
    20: '吸血鬼在楼上。别急着上去。',
    23: '商人把摊子支在墙角。',
    32: '骑士队长挡在楼梯前。',
    40: '越往上，门越少，守门的越硬。',
    44: '两扇门都不通，只能走下去。',
    49: '封印的房间，空气是凉的。',
    50: '塔顶。魔王在等。'
  };

  function noteFor(floor) {
    const n = Number(floor.n) || 0;
    if (FLOOR_NOTES[n]) return FLOOR_NOTES[n];
    const ratio = Number(floor.ratio) || 1;
    return ratio > 1 ? `物资 ×${ratio}，药水与宝石都更值钱。` : '石门后的房间，没有白捡的东西。';
  }

  function heroTitle() {
    const total = (Number(hero().atk) || 0) + (Number(hero().def) || 0);
    if (total < 300) return '塔下村的剑客';
    if (total < 700) return '提着铁剑的攀爬者';
    if (total < 1400) return '开过十道门的人';
    if (total < 2600) return '塔里的常客';
    return '走到塔顶的剑客';
  }

  function riskGrid(map) {
    const grid = [];
    const readDamage = game && typeof game.damageAt === 'function';
    const canFight = game && typeof game.canBattleAt === 'function';
    const hp = Number(hero().hp) || 0;
    for (let y = 0; y < 13; y++) {
      const row = [];
      for (let x = 0; x < 13; x++) {
        const info = tileInfo(tileAtCode(map, x, y));
        if (info.kind !== 'enemy') { row.push(null); continue; }
        if (!readDamage) { row.push(null); continue; }
        let raw = null;
        try { raw = game.damageAt(x, y); } catch (err) { raw = null; }
        // engine.damageAt 返回 {damage, turn, ...}，也兼容直接返回数字。
        const damage = raw == null ? null : (typeof raw === 'number' ? raw : (typeof raw.damage === 'number' ? raw.damage : null));
        let ok = damage != null && damage < hp;
        if (canFight) {
          try { ok = !!game.canBattleAt(x, y) && damage != null && damage < hp; } catch (err) { /* 用上面的判断 */ }
        }
        row.push({ d: damage, ok, turn: raw && typeof raw === 'object' ? raw.turn : null });
      }
      grid.push(row);
    }
    return grid;
  }

  function countRemaining(map) {
    let enemies = 0;
    let items = 0;
    for (let y = 0; y < 13; y++) {
      for (let x = 0; x < 13; x++) {
        const kind = tileInfo(tileAtCode(map, x, y)).kind;
        if (kind === 'enemy') enemies += 1;
        else if (kind === 'item') items += 1;
      }
    }
    return { enemies, items };
  }

  function constantList() {
    const constants = bag('constants');
    const catalog = D().items || {};
    const rules = window.MotaRules;
    const out = [];
    Object.keys(constants).forEach((id) => {
      const count = constants[id];
      if (!count || typeof count !== 'number' || count <= 0) return;
      const item = catalog[id] || { name: id, text: '' };
      // 悬浮提示优先用规则层的说明（数字/加量会和引擎一致），没有就退回原数据里的文案
      let tip = '';
      try { tip = rules && typeof rules.toolText === 'function' ? String(rules.toolText(id, D().values) || '') : ''; } catch (err) { tip = ''; }
      out.push({ id, name: item.name || id, text: item.text || '', count, tip });
    });
    return out;
  }

  // ---------- 道具 ----------

  const TOOL_DEFS = [
    { id: 'pickaxe', name: '镐', targeted: true, key: '1', hint: '点身边的墙，或者按方向键，拆掉它' },
    { id: 'bomb', name: '炸弹', targeted: true, key: '2', hint: '点身边的怪物，炸掉它' },
    { id: 'superPotion', name: '圣水', key: '3', hint: '立刻回血' },
    { id: 'earthquake', name: '地震卷轴', hint: '拆掉这一层所有可拆的墙' },
    { id: 'bigKey', name: '魔法钥匙', hint: '打开这一层所有的黄门' },
    { id: 'centerFly', name: '瞬移', hint: '移动到本层中心对称的位置' },
    { id: 'upFly', name: '向上传送', hint: '传到上一层同样的位置' },
    { id: 'downFly', name: '向下传送', hint: '传到下一层同样的位置' },
    { id: 'jumpShoes', name: '跳跃靴', targeted: true, byDirection: true, hint: '按方向键，跳到前方两格' },
    { id: 'hammer', name: '圣锤', targeted: true, hint: '点面前的怪物，直接消灭' },
    { id: 'icePickaxe', name: '破冰镐', targeted: true, hint: '点身边的冰墙' },
    { id: 'snow', name: '冰魔法', targeted: true, hint: '点身边的岩浆，冻住它' },
    { id: 'book', name: '手册', hint: '翻一遍这一层的怪物手册' },
    { id: 'fly', name: '魔杖', hint: '打开楼传，选一层飞过去' },
    { id: 'poisonWine', name: '解毒药水', hint: '解除中毒' },
    { id: 'weakWine', name: '解衰药水', hint: '解除衰弱' },
    { id: 'curseWine', name: '解咒药水', hint: '解除诅咒' },
    { id: 'superWine', name: '万能药水', hint: '解除所有异常状态' }
  ];

  function toolDef(id) { return TOOL_DEFS.find((def) => def.id === id) || null; }

  function toolList() {
    if (!game || typeof game.useItem !== 'function') return [];
    return TOOL_DEFS
      .filter((def) => countOf(def.id) > 0)
      .map((def) => ({
        id: def.id,
        label: def.name,
        count: countOf(def.id),
        key: def.key || '',
        icon: S().itemSvg ? S().itemSvg(def.id) : '',
        active: aim === def.id,
        hint: def.hint
      }));
  }

  async function useTool(id) {
    const def = toolDef(id);
    if (!def) return;
    if (window.MotaView.busy()) return;
    if (countOf(id) <= 0) { tip(`没有${def.name}了`); return; }
    if (def.targeted) {
      if (aim === id) { cancelAim(); return; }
      aim = id;
      window.MotaView.setAim(true);
      render();
      tip(`${def.name}：${def.hint}`);
      return;
    }
    aim = null;
    window.MotaView.setAim(false);
    const result = await act(() => game.useItem(id));
    render();
    // 魔杖/手册/说明书这类道具，引擎只返回标记，弹层交给界面开。
    if (result && result.fly) { openFly(); return; }
    if (result && result.manual) { openManual(); return; }
    if (result && result.help) { openHelp(); return; }
  }

  async function useToolAt(x, y) {
    const id = aim;
    if (!id) return;
    const def = toolDef(id);
    aim = null;
    window.MotaView.setAim(false);
    // 跳跃靴这类工具看的是勇士朝向：先把朝向指向目标格。
    if (def && def.byDirection) {
      const loc = heroLoc();
      const dx = x - loc.x;
      const dy = y - loc.y;
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        const facing = dy < 0 ? 'up' : dy > 0 ? 'down' : dx < 0 ? 'left' : 'right';
        if (hero().loc) hero().loc.dir = facing;
      }
    }
    await act(() => {
      if (typeof game.useItemOn === 'function') return game.useItemOn(id, x, y);
      return game.useItem(id);
    });
    render();
    if (def && countOf(id) > 0) tip(`${def.name}还有 ${countOf(id)} 个`);
  }

  function cancelAim() {
    if (!aim) return;
    aim = null;
    window.MotaView.setAim(false);
    render();
  }

  // ---------- 一次行动 ----------

  function statSnapshot() {
    const h = hero();
    const keys = h.keys || {};
    return {
      hp: Number(h.hp) || 0,
      atk: Number(h.atk) || 0,
      def: Number(h.def) || 0,
      money: Number(h.money) || 0,
      yellow: Number(keys.yellowKey) || 0,
      blue: Number(keys.blueKey) || 0,
      red: Number(keys.redKey) || 0,
      floorId: state().floorId
    };
  }

  function emitDiffs(before) {
    const after = statSnapshot();
    const loc = heroLoc();
    if (after.hp !== before.hp) {
      const delta = after.hp - before.hp;
      window.MotaView.float(loc.x, loc.y, `${delta > 0 ? '+' : ''}${delta}`, delta > 0 ? 'heal' : 'danger');
    }
    if (after.atk > before.atk) window.MotaView.float(loc.x, loc.y, `攻击 +${after.atk - before.atk}`, 'atk');
    if (after.def > before.def) window.MotaView.float(loc.x, loc.y, `防御 +${after.def - before.def}`, 'def');
    if (after.money > before.money) window.MotaView.float(loc.x, loc.y, `+${after.money - before.money} 金币`, 'key');
    const gainedKeys = (after.yellow - before.yellow) + (after.blue - before.blue) + (after.red - before.red);
    if (gainedKeys > 0) window.MotaView.float(loc.x, loc.y, `钥匙 +${gainedKeys}`, 'key');
    if (after.floorId !== before.floorId) {
      const floor = currentFloor();
      pushLog(`来到第 ${floor.n} 层`);
      window.MotaView.announce(`来到第 ${floor.n} 层`);
    }
  }

  async function act(fn) {
    if (!started) return null;
    const before = statSnapshot();
    let result = null;
    try {
      result = await fn();
    } catch (err) {
      console.error('[mota] 行动失败', err);
      tip('引擎在这一次操作里出错了');
      return null;
    }
    emitDiffs(before);
    render();
    return result;
  }

  async function step(dx, dy) {
    if (!started || acting) return;
    if (window.MotaView.busy()) return;
    if (aim) { await useToolAt(heroLoc().x + dx, heroLoc().y + dy); return; }
    if (Number(hero().hp) <= 0) { tip('生命是 0，先用道具回血'); return; }
    acting = true;
    try {
      await act(() => (typeof game.move === 'function' ? game.move(dx, dy) : null));
    } finally {
      acting = false;
    }
  }

  // ---------- 点地图自动走路 ----------
  // 寻路核心在 route.js（纯逻辑，带钥匙状态的 Dijkstra）：楼梯只当终点、门算钥匙、
  // 陷阱绕开、怪物和空气墙不穿。这里只负责把引擎接上去，再按节奏一格一格走。

  let walkToken = 0;
  const sleep = (ms) => new Promise((resolve) => { window.setTimeout(resolve, ms); });

  function Route() { return window.MotaRoute || null; }

  function cancelWalk() { walkToken += 1; }

  function blockOf(x, y) {
    if (game && typeof game.blockAt === 'function') {
      try { return game.blockAt(x, y); } catch (err) { return null; }
    }
    return null;
  }

  function keyCount(name) {
    if (game && typeof game.countItem === 'function') {
      try {
        const total = game.countItem(name);
        if (typeof total === 'number') return total;
      } catch (err) { /* 退回勇士身上的钥匙 */ }
    }
    const keys = hero().keys || {};
    return Number(keys[name]) || 0;
  }

  function keyTuple() {
    const route = Route();
    const names = (route && route.KEY_NAMES) || ['yellowKey', 'blueKey', 'redKey'];
    const cap = (route && route.KEY_CAP) || 9;
    return names.map((name) => Math.min(cap, Math.max(0, keyCount(name))));
  }

  function isStairTile(tile) {
    const route = Route();
    if (route && typeof route.isStairTile === 'function') return route.isStairTile(tile);
    return !!tile && /^stairs?$/.test(String(tile.kind || ''));
  }

  function standable(x, y) {
    const route = Route();
    if (!route || typeof route.standable !== 'function') return false;
    return route.standable(blockOf(x, y), keyTuple());
  }

  function findRoute(startX, startY, isGoal) {
    const route = Route();
    if (!route || typeof route.findRoute !== 'function') return null;
    return route.findRoute({ blockAt: blockOf, keyTuple, startX, startY, isGoal });
  }

  async function autoWalkTo(x, y) {
    if (!started) return 'idle';
    if (acting) return 'acting';
    if (window.MotaView.busy()) return 'busy';
    if (Number(hero().hp) <= 0) { tip('生命是 0，先用道具回血'); return 'dead'; }
    const loc = heroLoc();
    const target = standable(x, y);
    const isGoal = target
      ? (gx, gy) => gx === x && gy === y
      : (gx, gy) => Math.abs(gx - x) + Math.abs(gy - y) === 1;
    const route = findRoute(loc.x, loc.y, isGoal);
    if (!route || !route.length) {
      const tile = (blockOf(x, y) || {}).tile || {};
      if (isStairTile(tile)) tip('走不到那个楼梯：路上有怪物或锁着的门');
      else tip(target ? '这一格走不过去' : '走不到它旁边');
      return 'no-route';
    }
    const token = (walkToken += 1);
    const startFloor = state().floorId;
    const pace = route.length > 8 ? 26 : 42;
    let status = 'ok';
    for (const dir of route) {
      if (token !== walkToken || !started) return 'cancelled';
      if (window.MotaView.busy()) return 'busy';
      if (state().gameOver || state().win) return 'over';
      const vector = DIRS[dir];
      const before = { x: heroLoc().x, y: heroLoc().y };
      await step(vector[0], vector[1]);
      // 换层、战斗、事件对话都会让走路停下来，交回控制权
      if (state().floorId !== startFloor) return 'floor';
      if (Number(hero().hp) <= 0) return 'dead';
      // 这一步没走成（钥匙不够、被挡住等），别再硬撞下去
      const now = heroLoc();
      if (now.x === before.x && now.y === before.y) { status = 'blocked'; break; }
      await sleep(pace);
    }
    if (target || status !== 'ok') return status;
    const now = heroLoc();
    const dx = x - now.x;
    const dy = y - now.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return 'ok';
    if (token !== walkToken || !started || window.MotaView.busy()) return 'cancelled';
    await step(dx, dy);
    return 'ok';
  }

  function manualStep(dx, dy) {
    cancelWalk();
    step(dx, dy);
  }

  // ---------- 键盘 / 触屏 ----------

  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function bindInput() {
    document.addEventListener('keydown', onKey, { passive: false });

    const pad = document.getElementById('pad');
    if (pad) {
      pad.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-dir]');
        if (!btn) return;
        const dir = DIRS[btn.dataset.dir];
        if (dir) manualStep(dir[0], dir[1]);
      });
    }

    const board = document.getElementById('mota-map');
    if (board) {
      board.addEventListener('click', (event) => {
        const cell = event.target.closest('.tile');
        if (!cell) return;
        onTile(Number(cell.dataset.x), Number(cell.dataset.y));
      });
    }

    const toolbar = document.getElementById('toolbar');
    if (toolbar) {
      toolbar.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-tool]');
        if (btn) useTool(btn.dataset.tool);
      });
    }
    bindButtons();
  }

  function onTile(x, y) {
    if (window.MotaView.busy()) return;
    const loc = heroLoc();
    const distance = Math.abs(x - loc.x) + Math.abs(y - loc.y);
    if (aim) {
      if (distance !== 1) { tip('使用道具只能点身边的一格'); return; }
      useToolAt(x, y);
      return;
    }
    if (distance === 0) { expandHeroPanel(); return; }
    if (distance === 1) { manualStep(x - loc.x, y - loc.y); return; }
    // 远处的格子：自动寻路走过去
    autoWalkTo(x, y);
  }

  function onKey(event) {
    const key = event.key;
    if (window.MotaView.captureKey(event)) return;
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && (key === 'z' || key === 'Z')) {
      event.preventDefault();
      undo();
      return;
    }
    if (event.altKey) return;

    if (key === 'Escape') {
      event.preventDefault();
      if (aim) cancelAim();
      else if (window.MotaView.isSheetOpen()) window.MotaView.closeSheet();
      return;
    }

    if (aim) {
      const vector = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], W: [0, -1], a: [-1, 0], A: [-1, 0], d: [1, 0], D: [1, 0] }[key];
      if (vector) {
        event.preventDefault();
        const loc = heroLoc();
        useToolAt(loc.x + vector[0], loc.y + vector[1]);
        return;
      }
    }

    switch (key) {
      case 'ArrowUp': event.preventDefault(); manualStep(0, -1); break;
      case 'ArrowDown': event.preventDefault(); manualStep(0, 1); break;
      case 'ArrowLeft': event.preventDefault(); manualStep(-1, 0); break;
      case 'ArrowRight': event.preventDefault(); manualStep(1, 0); break;
      case 'w': case 'W': event.preventDefault(); manualStep(0, -1); break;
      case 'a': case 'A': event.preventDefault(); manualStep(-1, 0); break;
      case 'd': case 'D': event.preventDefault(); manualStep(1, 0); break;
      case 'x': case 'X': event.preventDefault(); openManual(); break;
      case 'g': case 'G': event.preventDefault(); openFly(); break;
      case 's': case 'S': event.preventDefault(); quickSave(); break;
      case 'l': case 'L': event.preventDefault(); openSaveSheet(); break;
      case 'h': case 'H': case '?': event.preventDefault(); openHelp(); break;
      case '1': event.preventDefault(); useToolByKey('1'); break;
      case '2': event.preventDefault(); useToolByKey('2'); break;
      case '3': event.preventDefault(); useToolByKey('3'); break;
      case ' ': case 'Enter': event.preventDefault(); boardFocus(); break;
      default: break;
    }
  }

  function useToolByKey(hotkey) {
    const def = TOOL_DEFS.find((tool) => tool.key === hotkey);
    if (!def) return;
    if (countOf(def.id) <= 0) { tip(`还没有${def.name}`); return; }
    useTool(def.id);
  }

  function boardFocus() {
    const board = document.getElementById('mota-map');
    if (board && document.activeElement !== board) board.focus({ preventScroll: true });
  }

  function bindButtons() {
    const on = (id, handler) => {
      const node = document.getElementById(id);
      if (node) node.addEventListener('click', handler);
    };
    on('btn-manual', openManual);
    on('btn-fly', openFly);
    on('btn-save', quickSave);
    on('btn-load', openSaveSheet);
    on('btn-undo', undo);
    on('btn-help', openHelp);
    on('btn-restart', restart);
    on('btn-sound', () => {
      const next = document.getElementById('btn-sound').getAttribute('aria-pressed') !== 'true';
      window.MotaView.setSound(next);
      try { localStorage.setItem(SOUND_KEY, next ? '1' : '0'); } catch (err) { /* 忽略 */ }
    });
    on('ending-again', () => { window.MotaView.hideEnding(); restart(); });
  }

  // ---------- 存档 ----------

  async function quickSave() {
    if (!game || typeof game.save !== 'function') { tip('存档还没准备好'); return; }
    try {
      const saved = await game.save();
      if (saved === false) { tip('存档失败：浏览器无法写入本地存储'); return; }
      tip('已存档');
      window.MotaView.sound('get');
    } catch (err) {
      console.error(err);
      tip('存档失败');
    }
  }

  async function doLoad() {
    if (!game || typeof game.load !== 'function') { tip('读档还没准备好'); return; }
    try {
      const result = await game.load();
      if (result === false) { tip('没有找到存档'); return; }
      window.MotaView.closeSheet();
      render();
      tip('已读档');
    } catch (err) {
      console.error(err);
      tip('读档失败');
    }
  }

  async function doExport(textarea) {
    if (!game || typeof game.exportSave !== 'function') { tip('导出还不支持'); return; }
    try {
      const text = await game.exportSave();
      const value = typeof text === 'string' ? text : JSON.stringify(text);
      if (textarea) {
        textarea.value = value;
        textarea.focus();
        textarea.select();
      }
      tip('存档文本已导出，复制走它');
    } catch (err) {
      console.error(err);
      tip('导出失败');
    }
  }

  async function doImport(textarea) {
    if (!game || typeof game.importSave !== 'function') { tip('导入还不支持'); return; }
    const text = textarea ? textarea.value.trim() : '';
    if (!text) { tip('先把存档文本粘进文本框'); return; }
    try {
      const result = await game.importSave(text);
      if (result === false) { tip('这段文本读不出来'); return; }
      window.MotaView.closeSheet();
      render();
      tip('已导入存档');
    } catch (err) {
      console.error(err);
      tip('导入失败：文本可能不完整');
    }
  }

  function openSaveSheet() {
    const body = window.MotaView.saveSheet(`
      <p class="sheet-note">每次行动都会自动存档。这里可以手动读档，或者把存档导出成一段文本，换台设备再导入。</p>
      <div class="save-actions">
        <button type="button" class="btn btn-primary" data-save="load">读取存档</button>
        <button type="button" class="btn" data-save="save">存一下</button>
        <button type="button" class="btn" data-save="export">导出</button>
        <button type="button" class="btn" data-save="import">导入</button>
        <button type="button" class="btn btn-quiet" data-save="restart">重新开始</button>
      </div>
      <label class="save-label" for="save-text">存档文本</label>
      <textarea id="save-text" class="save-text" spellcheck="false" rows="6" placeholder="导出的存档会出现在这里；导入时把整段文本粘进来，再点「导入」。"></textarea>
      <p class="sheet-foot">存档键：${SAVE_KEY}</p>
    `);
    if (!body) return;
    const textarea = body.querySelector('#save-text');
    body.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-save]');
      if (!btn) return;
      const action = btn.dataset.save;
      if (action === 'load') doLoad();
      else if (action === 'save') quickSave();
      else if (action === 'export') doExport(textarea);
      else if (action === 'import') doImport(textarea);
      else if (action === 'restart') restart();
    });
  }

  async function restart() {
    const ok = await window.MotaView.confirmSheet({
      title: '重新开始？',
      text: '当前的进度会被丢掉，从第 1 层重新开始。存档也会被新的开局覆盖。',
      okText: '重新开始',
      cancelText: '再想想'
    });
    if (!ok) return;
    cancelWalk();
    try {
      window.MotaView.closeSheet();
      window.MotaView.hideEnding();
      aim = null;
      window.MotaView.setAim(false);
      logLines = [];
      if (game && typeof game.restart === 'function') {
        await game.restart();
        started = true;
        render();
      } else if (game && typeof game.start === 'function') {
        // start() 内部会 reset，并重放开局的选择。
        await game.start();
        started = true;
        render();
      } else if (engineRef) {
        await startWith(engineRef);
      }
      tip('新的一局，从塔门开始');
    } catch (err) {
      console.error(err);
      tip('重新开始失败');
    }
  }

  async function undo() {
    if (!game || typeof game.undo !== 'function') { tip('暂不支持撤销'); return; }
    if (window.MotaView.busy()) return;
    cancelWalk();
    try {
      const result = await game.undo();
      if (result === false) { tip('没有可以撤销的步骤'); return; }
      aim = null;
      window.MotaView.setAim(false);
      render();
      tip('已撤销上一步');
    } catch (err) {
      console.error(err);
      tip('撤销失败');
    }
  }

  // ---------- 手册 ----------

  function traitsFor(enemy, longTexts) {
    const specials = D().specials || {};
    const raw = enemy && enemy.special;
    const codes = (Array.isArray(raw) ? raw.slice() : (raw ? [raw] : []))
      .map((code) => Number(code))
      .filter((code) => Number.isFinite(code) && code > 0)
      .sort((a, b) => a - b);
    const texts = Array.isArray(longTexts) ? longTexts : [];
    return codes.map((code, index) => {
      const info = specials[code] || {};
      return { name: info.name || `特性 ${code}`, text: texts[index] || info.text || '' };
    });
  }

  function normalizeManualRow(row) {
    if (!row) return null;
    const catalog = D().enemys || {};
    const base = row.enemy || catalog[row.id] || (row.name ? row : null);
    if (!base) return null;
    const damage = row.damage == null ? null : Number(row.damage);
    const hp = Number(hero().hp) || 0;
    const pick = (key) => (row[key] != null ? row[key] : base[key]);
    const effective = Object.assign({}, base, {
      special: row.specialCodes != null ? row.specialCodes : base.special
    });
    return {
      enemy: {
        id: base.id || row.id,
        name: row.name || base.name || base.id || row.id || '怪物',
        hp: pick('hp'),
        atk: pick('atk'),
        def: pick('def'),
        money: pick('money')
      },
      damage: Number.isFinite(damage) ? damage : null,
      canBattle: Number.isFinite(damage) && damage < hp,
      traits: traitsFor(effective, row.special),
      criticals: Array.isArray(row.criticals) ? row.criticals : [],
      defDamage: row.defDamage != null ? row.defDamage : null,
      turn: row.turn != null ? row.turn : null
    };
  }

  function manualEntries() {
    // 优先用引擎的 manual()：h5mota 的口径（损血、临界、一防减伤都由 rules.js 算）。
    if (game && typeof game.manual === 'function') {
      try {
        const rows = game.manual();
        if (Array.isArray(rows) && rows.length) {
          const list = rows.map(normalizeManualRow).filter(Boolean);
          if (list.length) return list;
        }
      } catch (err) { console.warn('[mota] manual() 不可用，改用本层估算', err); }
    }

    // 退路：扫这一层的怪物格子，用 damageAt 自己拼一份。
    const floor = currentFloor();
    const map = currentMap(floor);
    const catalog = D().enemys || {};
    const seen = new Map();
    for (let y = 0; y < 13; y++) {
      for (let x = 0; x < 13; x++) {
        const info = tileInfo(tileAtCode(map, x, y));
        if (info.kind !== 'enemy') continue;
        const enemy = catalog[info.id] || { id: info.id, name: info.id };
        if (seen.has(enemy.id)) continue;
        let raw = null;
        if (game && typeof game.damageAt === 'function') {
          try { raw = game.damageAt(x, y); } catch (err) { raw = null; }
        }
        const damage = raw == null ? null : (typeof raw === 'number' ? raw : (typeof raw.damage === 'number' ? raw.damage : null));
        seen.set(enemy.id, normalizeManualRow({ id: enemy.id, enemy, damage, turn: raw && raw.turn }));
      }
    }
    return Array.from(seen.values()).filter(Boolean);
  }

  function openManual() {
    if (!game) return;
    aim = null;
    window.MotaView.setAim(false);
    const floor = currentFloor();
    const entries = manualEntries();
    const book = countOf('book') > 0;
    window.MotaView.manualSheet(entries, {
      kicker: '怪物手册',
      title: `第 ${floor.n} 层 · ${entries.length} 种怪物`,
      note: book
        ? '损血是这一战要付出的生命；临界是攻击达到某个数之后，损血会突然降下来。'
        : '这一份是随身的估算：损血按当前攻防算，临界要拿到 3 层老人的手册才准。'
    });
  }

  // ---------- 楼传 ----------

  function visitedNumbers() {
    const set = new Set();
    let list = [];
    try {
      if (game && typeof game.visitedFloors === 'function') list = game.visitedFloors() || [];
    } catch (err) { list = []; }
    if (!list.length) list = state().visited || [];
    list.forEach((item) => {
      if (typeof item === 'number') { set.add(item); return; }
      const text = String(item);
      const fromId = /MT(\d+)/.exec(text);
      if (fromId) { set.add(Number(fromId[1])); return; }
      const n = Number(text);
      if (!Number.isNaN(n)) set.add(n);
    });
    return set;
  }

  function floorListForFly() {
    const catalog = floorCatalog();
    const root = (D().floors || {});
    const ids = root.floorIds || Object.keys(catalog);
    const visited = visitedNumbers();
    const here = Number(currentFloor().n);
    return ids.map((id) => {
      const floor = catalog[id] || {};
      const n = Number(floor.n != null ? floor.n : (/(\d+)/.exec(id) || [])[1]) || 0;
      return {
        id,
        n,
        name: floor.name || `第 ${n} 层`,
        visited: visited.has(n),
        here: n === here,
        canFlyTo: floor.canFlyTo !== false,
        remains: ''
      };
    }).sort((a, b) => a.n - b.n);
  }

  function openFly() {
    if (!game) return;
    const hasWand = typeof game.hasItem === 'function' ? game.hasItem('fly') : true;
    const floors = floorListForFly();
    const body = window.MotaView.flySheet(floors, {
      disabled: !hasWand,
      note: hasWand
        ? '只能飞到走到过的楼层。开局送的是削弱版楼传：目的地得和当前所在地连通。'
        : '还没有魔杖。现在这份楼传只在少数几层之间连着——先去把魔杖找出来。'
    });
    if (!body) return;
    body.addEventListener('click', async (event) => {
      const cell = event.target.closest('[data-floor]');
      if (!cell || cell.disabled) return;
      const id = cell.dataset.floor;
      window.MotaView.closeSheet();
      if (typeof game.useFly !== 'function') { tip('楼传还没准备好'); return; }
      const result = await act(() => game.useFly(id));
      if (result === false) tip('这一层现在去不了');
    });
  }

  // ---------- 帮助 ----------

  function openHelp() {
    window.MotaView.helpSheet(helpHtml());
  }

  function helpHtml() {
    const inventory = TOOL_DEFS.filter((def) => countOf(def.id) > 0).map((def) => def.name);
    return `
      <h3>怎么走</h3>
      <p>方向键移一格；<b>点一下地图上能走到的格子，勇士会自己沿最短路走过去</b>：手里的钥匙够就顺手开门，路上的药水宝石也会捡起来；碰到怪物、楼梯或剧情对话就停下，交回控制权。撞向怪物就是开战，撞门用钥匙，走上楼梯就换层。敌人脚下的数字是这一战要掉的生命，灰色可以随便打，金色要掂量，朱砂色会让你重伤，<b>?</b> 是暂时破不了防。</p>
      <h3>这场战斗怎么算</h3>
      <p>没有随机数。你每回合打出的伤害是「攻击 − 怪物防御」，怪物每回合打你「怪物攻击 − 你的防御」，回合数由怪物生命决定，乘起来就是损血。手册里的「临界」是攻击涨到某个值之后损血突然下降的那一档；「一防减伤」是再加一点防御能省多少。</p>
      <h3>特性版是多出来的三件事</h3>
      <p>① 对话穿墙：和老人或商人聊完天，接下来两步可以硬穿一格墙。② 圣水复活：32 层与骑士队长的战斗把生命打到 0 也不算输，喝圣水就能站起来。③ 偷雪花：35 层魔龙后面那六格在特性版里走得过去。纯净版没有这些。</p>
      <h3>结局与 TE</h3>
      <p>打赢 50 层魔王是普通结局（NE）。真结局（TE）要多两步：先在 50 层和小偷说话，再用下楼器去 49 层，触发封印、把假魔王身上的红魔三围除十，之后从 24 层的通道回到 50 层，打赢真正的封印魔王。</p>
      <h3>快捷键</h3>
      <div class="key-table">
        <div><kbd>方向键</kbd><span>移动一格</span></div>
        <div><kbd>点地图</kbd><span>点能走到的格子，自动走过去</span></div>
        <div><kbd>鼠标悬停</kbd><span>看格子说明：血瓶加多少血、怪物多强</span></div>
        <div><kbd>W</kbd><kbd>A</kbd><kbd>D</kbd><span>移动（向下请用 ↓，S 留给存档）</span></div>
        <div><kbd>空格</kbd><kbd>回车</kbd><span>继续对话</span></div>
        <div><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><span>镐 / 炸弹 / 圣水</span></div>
        <div><kbd>X</kbd><span>怪物手册</span></div>
        <div><kbd>G</kbd><span>楼传</span></div>
        <div><kbd>S</kbd><kbd>L</kbd><span>存档 / 读档</span></div>
        <div><kbd>H</kbd><span>这一页</span></div>
        <div><kbd>Ctrl</kbd><kbd>Z</kbd><span>撤销上一步</span></div>
        <div><kbd>Esc</kbd><span>关掉弹层，或放下手里的道具</span></div>
      </div>
      <h3>存档</h3>
      <p>每次行动都会自动存一次，存在这个浏览器的本地。顶栏「读档」里可以导出成一段文本，换设备再粘回来。重新开始会把进度清掉。</p>
      <h3>你手里现在有</h3>
      <p>${inventory.length ? inventory.join('、') : '还没有可以主动使用的道具。地图上的镐、炸弹、圣水拿到后，会出现在底部的工具条里。'}</p>
      <h3>关于</h3>
      <p>玩法、地图、怪物数值、道具、商店与事件照搬 h5mota 的《50层魔塔》（作者 king，复刻自 czl 的 flash 版）。原版 50 层魔塔 © 1998–2000 Oz &amp; Kenichi。这里的画面是另一套：像素地牢，不走原作贴图。</p>
      <p class="sheet-foot">存档键：${SAVE_KEY} · 版本：${(D().version || '')}</p>
    `;
  }

  // ---------- 结局 ----------

  function truthy(value) {
    return value === true || value === 1 || value === '1' || value === 'true' || value === 'TRUE';
  }

  function endingStats(stateData) {
    let summary = null;
    if (game && typeof game.statsSummary === 'function') {
      try { summary = game.statsSummary(); } catch (err) { summary = null; }
    }
    const h = stateData.hero || hero();
    const stats = stateData.stats || {};
    const sum = summary || {};
    const keys = h.keys || {};
    const items = h.items || {};
    const constants = items.constants || h.constants || {};
    const tools = items.tools || h.tools || {};
    const countAll = (obj) => Object.keys(obj || {}).reduce((total, key) => total + (Number(obj[key]) || 0), 0);
    const shop = sum.shopTimes != null ? sum.shopTimes : firstNumber(stats, ['shopTimes', 'shop', '加点次数', 'shopCount']);
    const alive = sum.alive != null ? sum.alive : firstNumber(stats, ['aliveMonsters', 'alive', 'monsters', '存活怪物']);
    const killed = sum.killed != null ? sum.killed : firstNumber(stats, ['kills', 'killed', 'battles', '击杀']);
    const damageTaken = sum.damage != null ? sum.damage : firstNumber(stats, ['damage', 'totalDamage', '总损血']);
    const steps = sum.steps != null ? sum.steps : firstNumber(stats, ['steps', 'moveCount', '步数']);
    const visited = (stateData.visited || []).length || 0;
    const attack = sum.atk != null ? sum.atk : h.atk;
    const defend = sum.def != null ? sum.def : h.def;
    const atkDefSum = sum.sum != null ? sum.sum : ((Number(attack) || 0) + (Number(defend) || 0));
    return [
      { label: '生命', value: num(sum.hp != null ? sum.hp : h.hp) },
      { label: '攻击', value: num(attack) },
      { label: '防御', value: num(defend) },
      { label: '金币', value: num(sum.money != null ? sum.money : h.money) },
      { label: '攻防和', value: num(atkDefSum) },
      { label: '商店加点', value: shop == null ? '—' : `${shop} 次` },
      { label: '存活怪物', value: alive == null ? '—' : num(alive) },
      { label: '击杀', value: killed == null ? '—' : num(killed) },
      { label: '总损血', value: damageTaken == null ? '—' : num(damageTaken) },
      { label: '步数', value: steps == null ? '—' : num(steps) },
      { label: '黄钥匙', value: num(keys.yellowKey) },
      { label: '蓝钥匙', value: num(keys.blueKey) },
      { label: '红钥匙', value: num(keys.redKey) },
      { label: '常驻道具', value: `${countAll(constants)} 件` },
      { label: '剩余工具', value: `${countAll(tools)} 个` },
      { label: '到过楼层', value: visited ? `${visited} 层` : '—' }
    ];
  }

  function firstNumber(obj, names) {
    for (let i = 0; i < names.length; i += 1) {
      const value = obj[names[i]];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return null;
  }

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.round(n)) : '—';
  }

  function onWin(payload) {
    const data = payload || {};
    const stateData = data.state || state() || {};
    const h = stateData.hero || hero();
    const stateFlags = stateData.flags || {};
    const heroFlags = h.flags || {};
    let features = truthy(stateFlags['开启特性']) || truthy(heroFlags['开启特性']);
    let te = truthy(stateFlags.TE) || truthy(heroFlags.TE);
    const reasonText = String(data.reason || '');
    // 引擎的 reason 可能是 '特性版-NE' 这类标签，而不是一句剧情。
    const tag = /(特性版|纯净版)\s*[-－·—]?\s*(NE|TE)/i.exec(reasonText);
    if (tag) {
      features = tag[1] === '特性版';
      te = tag[2].toUpperCase() === 'TE';
    }
    const narrative = tag ? '' : reasonText;
    const gameOver = stateData.gameOver === true && !stateData.win;
    const defeat = gameOver || /败|defeat|lose|gameover|game over/i.test(narrative);
    const kind = `${features ? '特性版' : '纯净版'} · ${te ? 'TE' : 'NE'}`;
    let title;
    if (defeat) title = '倒下了';
    else if (features && te) title = '塔顶 · 真·结局';
    else if (features) title = '塔顶 · 普通结局';
    else if (te) title = '纯净版 · 封印结局';
    else title = '纯净版 · 普通通关';
    const reason = defeat
      ? (narrative || '你倒在台阶上。塔还立着，门还关着。')
      : (narrative || (te
        ? '封印解开了。塔下传来水声，像有人终于把剑放下。'
        : '公主在塔顶。你把剑收回鞘里，数字停在最后一行。'));
    window.MotaView.showEnding({ kind, title, reason, stats: endingStats(stateData) });
    window.MotaView.sound(defeat ? 'error' : 'win');
    pushLog(defeat ? '倒下了' : '通关');
    render();
  }

  // ---------- 渲染 ----------

  function render() {
    if (!game || !started) return;
    const floor = currentFloor();
    const map = currentMap(floor);
    if (!map.length) return;
    const n = Number(floor.n != null ? floor.n : 0);
    window.MotaView.render({
      n,
      total: floorCount(),
      name: floor.name || `第 ${n} 层`,
      note: noteFor(floor),
      ratio: floor.ratio,
      map,
      hero: Object.assign({}, hero(), { loc: heroLoc() }),
      risk: riskGrid(map),
      tools: toolList(),
      items: constantList(),
      statusChips: statusChips(),
      canUndo: typeof game.canUndo === 'function' ? !!game.canUndo() : true,
      remaining: countRemaining(map),
      log: logLines,
      heroTitle: heroTitle()
    });
    const undoBtn = document.getElementById('btn-undo');
    if (undoBtn) undoBtn.disabled = typeof game.canUndo === 'function' ? !game.canUndo() : true;
  }

  function statusChips() {
    const chips = [];
    const h = hero();
    const flags = h.flags || {};
    const stateFlags = state().flags || {};
    const energy = Number(state().talkEnergy) || 0;
    const featureOn = truthy(stateFlags['开启特性']);
    if (energy > 0 && featureOn) chips.push({ label: `穿墙 ×${energy}`, tone: 'good', text: '特性版对话能量：还能穿几次墙' });
    if (flags.poison || stateFlags.poison) chips.push({ label: '中毒', tone: 'warn', text: '每走一步都在掉血，找解毒药水' });
    if (flags.weak || stateFlags.weak) chips.push({ label: '衰弱', tone: 'warn', text: '攻防被压低，找解衰药水' });
    if (flags.curse || stateFlags.curse) chips.push({ label: '诅咒', tone: 'warn', text: '战斗拿不到金币和经验' });
    if (featureOn) chips.push({ label: '特性版', tone: 'brass', text: '这一局开启了 h5mota 的特性规则' });
    return chips;
  }

  function expandHeroPanel() {
    const board = document.getElementById('mota-map');
    if (board) board.focus({ preventScroll: true });
  }

  // ---------- 引擎接线 ----------

  function bindUi(target) {
    target.ui = {
      say: (payload) => window.MotaView.say(payload),
      choose: (payload) => window.MotaView.choose(payload),
      tip: (text) => { tip(text); },
      update: () => { render(); },
      battle: (payload) => window.MotaView.battle(payload),
      win: (payload) => { onWin(payload); },
      sound: (name) => { window.MotaView.sound(name); }
    };
  }

  function fail(message) {
    console.error('[mota]', message);
    window.MotaView.boot(true, typeof message === 'string' ? message : '引擎没有启动起来');
    tip('引擎没有启动起来，稍后再试一次');
  }

  async function startWith(Engine) {
    engineRef = Engine;
    try {
      game = Engine.create({ saveKey: SAVE_KEY });
    } catch (err) {
      fail(err && err.message ? err.message : String(err));
      return;
    }
    window.MotaView.setGame(game);
    bindUi(game);
    window.__mota = game;
    // 先允许渲染：开局的对话会挡住移动，但地图与状态应该已经在身后。
    started = true;
    render();
    try {
      window.MotaView.boot(false);
      // 有存档就接着玩；没存档、或者上一局已经结束，才重开。
      let resumed = false;
      if (typeof game.load === 'function') {
        try { resumed = !!game.load() && !!game.state && !game.state.gameOver; } catch (err) { resumed = false; }
      }
      if (resumed && game.state.win) {
        // 通关存档：先把结局还给玩家，别让人停在一个走不动的棋盘上。
        render();
        boardFocus();
        pushLog('这局已经通关');
        onWin({ state: game.state, reason: game.state.win.reason });
        return;
      }
      if (resumed) {
        render();
        boardFocus();
        pushLog('接着上次的存档');
        render();
        tip('接着上次的存档');
      } else {
        await game.start();
        render();
        boardFocus();
        pushLog('从塔门开始');
        render();
      }
    } catch (err) {
      fail(err && err.message ? err.message : String(err));
    }
  }

  function engineOf() {
    // 正常情况用真引擎；__MOTA_MOCK__ 只用于没有引擎时的页面自测。
    return window.__MOTA_MOCK__ || window.MotaEngine || null;
  }

  function waitForEngine(tries) {
    const Engine = engineOf();
    if (Engine) {
      window.MotaView.boot(false);
      startWith(Engine);
      return;
    }
    if (tries > 40) {
      window.MotaView.boot(true, '没有找到引擎：engine.js 还没就位');
      return;
    }
    bootTimer = setTimeout(() => waitForEngine(tries + 1), 150);
  }

  function boot() {
    window.MotaView.init({ game: null });
    try {
      const saved = localStorage.getItem(SOUND_KEY);
      if (saved === '0') window.MotaView.setSound(false);
    } catch (err) { /* 隐私模式下忽略 */ }
    bindInput();
    if (!game) window.MotaView.boot(true);
    const Engine = engineOf();
    if (Engine) startWith(Engine);
    else waitForEngine(0);
  }

  window.MotaApp = {
    render,
    get game() { return game; },
    restart,
    openManual,
    openFly,
    openHelp,
    // 点地图自动走路（也给自动化测试用）：返回 ok / no-route / busy / acting / dead / floor / blocked / cancelled
    walkTo: (x, y) => autoWalkTo(Number(x), Number(y))
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
