(function (root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else root.MotaEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const isNode = (typeof module === 'object' && module.exports);
  const Data = isNode ? require('./data.js') : globalThis.MotaData;
  const Rules = isNode ? require('./rules.js') : globalThis.MotaRules;
  const Events = isNode ? require('./events.js') : globalThis.MotaEvents;

  const DELTA = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  const BACK = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const FLOOR_TILE = { kind: 'floor', cls: 'terrains', id: 'none', noPass: false, name: '地面' };
  const SAVE_VERSION = 1;
  const UNDO_LIMIT = 24;

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function safeStorage() {
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (err) { /* 隐私模式等 */ }
    return null;
  }

  function defaultUI() {
    return {
      async say() { },
      async choose(opts) { return 0; },
      tip() { },
      update() { },
      async battle() { },
      async win() { },
      sound() { }
    };
  }

  class Game {
    constructor(options) {
      options = options || {};
      this.data = Data;
      this.rules = Rules;
      this.saveKey = options.saveKey || 'magic-tower-51-v1';
      this.storage = options.storage !== undefined ? options.storage : safeStorage();
      this.ui = options.ui || defaultUI();
      this.tempVars = {};
      this.history = [];
      this.armed = null;
      this.busy = false;
      this.state = null;
      this.autoRunning = false;
    }

    // ---------- 状态 ----------
    hero() { return this.state.hero; }

    floorData(floorId) { return this.data.floors.floors[floorId || this.state.floorId]; }

    floorState(floorId) { return this.state.floors[floorId || this.state.floorId]; }

    floor() {
      const id = this.state.floorId;
      const data = this.floorData(id);
      return {
        id,
        n: data.n,
        name: data.name,
        title: data.title,
        ratio: data.ratio,
        map: this.floorState(id).map,
        hidden: this.floorState(id).hidden,
        events: data.events,
        data
      };
    }

    createState() {
      const start = this.data.start;
      const floors = {};
      for (const id of this.data.floors.floorIds) {
        const src = this.data.floors.floors[id];
        floors[id] = { map: src.map.map(row => row.slice()), hidden: [], dead: [] };
      }
      const hero = {
        hp: start.hp,
        atk: start.atk,
        def: start.def,
        mdef: start.mdef || 0,
        money: start.money || 0,
        exp: start.exp || 0,
        keys: Object.assign({ yellowKey: 0, blueKey: 0, redKey: 0, greenKey: 0, steelKey: 0, specialKey: 0 }, start.keys || {}),
        items: { tools: {}, constants: Object.assign({}, start.constants || {}) },
        flags: { nowWeapon: 'sword5', nowShield: 'shield5', 魔法免疫: true },
        loc: Object.assign({}, start.loc)
      };
      const state = {
        version: SAVE_VERSION,
        floorId: start.floorId,
        hero,
        floors,
        visited: [start.floorId],
        seen: [],
        overrides: {},
        flags: hero.flags,
        stats: {
          steps: 0, battles: 0, damage: 0, extraDamage: 0, money: 0, items: 0,
          shopTimes: 0, defeats: 0, zeroHp: 0, kills: 0
        },
        autoDone: [],
        talkEnergy: 0,
        gameOver: false,
        win: null
      };
      return state;
    }

    async reset(ui) {
      if (ui) this.ui = ui;
      this.state = this.createState();
      this.history = [];
      this.tempVars = {};
      this.armed = null;
      this.ui.update();
      return this.state;
    }

    async start() {
      await this.reset();
      this.markSeen(this.state.floorId);
      const floor = this.floorData();
      await Events.run(this, floor.firstArrive, { floorId: this.state.floorId, x: this.hero().loc.x, y: this.hero().loc.y });
      await this.checkAutoEvents();
      this.save();
      this.ui.update();
    }

    async restart() {
      if (this.storage) {
        try { this.storage.removeItem(this.saveKey); } catch (err) { /* 忽略 */ }
      }
      await this.start();
    }

    visitedFloors() {
      const order = this.data.floors.floorIds;
      return (this.state.visited || []).slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
    }

    // ---------- 地图读取 ----------
    tileNumber(x, y, floorId) {
      if (!this.state) return 0;
      const fs = this.floorState(floorId);
      if (!fs) return 0;
      if (Array.isArray(fs.hidden) && fs.hidden.indexOf(x + ',' + y) >= 0) return 0;
      const row = fs.map[y];
      if (!row) return 0;
      return row[x] || 0;
    }

    baseTileNumber(x, y, floorId) {
      const fs = this.state.floors[floorId || this.state.floorId];
      if (!fs) return 0;
      const src = this.data.floors.floors[floorId || this.state.floorId];
      const row = src.map[y];
      return row ? (row[x] || 0) : 0;
    }

    tileInfo(n) {
      if (!n) return FLOOR_TILE;
      return this.data.tiles.tiles[n] || FLOOR_TILE;
    }

    effectiveEnemy(id) {
      return Rules.effectiveEnemy(id, this.state.overrides, this.data.enemys);
    }

    blockAt(x, y, floorId) {
      const n = this.tileNumber(x, y, floorId);
      if (!n) return { x, y, n: 0, tile: FLOOR_TILE, empty: true, floorId: floorId || this.state.floorId };
      const tile = this.tileInfo(n);
      const block = { x, y, n, tile, floorId: floorId || this.state.floorId };
      if (tile.kind === 'enemy') block.enemy = this.effectiveEnemy(tile.id);
      if (tile.kind === 'item') block.item = this.data.items[tile.id] || { name: tile.id, cls: 'items' };
      if (tile.kind === 'stair') block.stair = tile.id;
      if (tile.kind === 'npc') block.npc = tile.id;
      return block;
    }

    setTile(x, y, number, floorId) {
      const fs = this.floorState(floorId);
      if (!fs || !fs.map[y]) return;
      fs.map[y][x] = number;
    }

    hideTile(x, y, floorId) {
      const fs = this.floorState(floorId);
      if (!fs) return;
      const loc = x + ',' + y;
      if (fs.hidden.indexOf(loc) < 0) fs.hidden.push(loc);
    }

    showTile(x, y, floorId) {
      const fs = this.floorState(floorId);
      if (!fs) return;
      const loc = x + ',' + y;
      const idx = fs.hidden.indexOf(loc);
      if (idx >= 0) fs.hidden.splice(idx, 1);
    }

    visibleMap() {
      const rows = [];
      const floor = this.floorData();
      for (let y = 0; y < floor.height; y++) {
        const cols = [];
        for (let x = 0; x < floor.width; x++) {
          const block = this.blockAt(x, y);
          cols.push(block);
        }
        rows.push(cols);
      }
      return rows;
    }

    // ---------- 战斗查询 ----------
    damageOptions() {
      const hero = this.hero();
      return {
        cross: this.countItem('cross') > 0,
        knife: this.countItem('knife') > 0,
        skill: hero.flags && hero.flags.skill ? 1 : 0,
        hatred: this.state.flags.hatred || 0,
        addHp: this.state.flags.addhp == 1 || this.state.flags.addhp === true,
        values: this.data.values
      };
    }

    damageAt(x, y) {
      const block = this.blockAt(x, y);
      if (!block.enemy) return null;
      return Rules.damage(block.enemy, this.hero(), this.damageOptions());
    }

    canBattleAt(x, y) { return this.damageAt(x, y) !== null; }

    manual() {
      const rows = [];
      const seen = {};
      const floor = this.floorData();
      for (let y = 0; y < floor.height; y++) {
        for (let x = 0; x < floor.width; x++) {
          const block = this.blockAt(x, y);
          if (!block.enemy || seen[block.enemy.id]) continue;
          seen[block.enemy.id] = true;
          const info = Rules.damage(block.enemy, this.hero(), this.damageOptions());
          rows.push({
            id: block.enemy.id,
            name: block.enemy.name,
            hp: block.enemy.hp,
            atk: block.enemy.atk,
            def: block.enemy.def,
            money: block.enemy.money,
            exp: block.enemy.exp,
            special: Rules.specialText(block.enemy),
            specialCodes: block.enemy.special,
            damage: info ? info.damage : null,
            turn: info ? info.turn : null,
            criticals: Rules.criticals(block.enemy, this.hero(), 5, this.damageOptions()),
            defDamage: Rules.defDamage(block.enemy, this.hero(), 1, this.damageOptions())
          });
        }
      }
      return rows;
    }

    // ---------- 移动 ----------
    dirOf(dx, dy) {
      for (const dir of Object.keys(DELTA)) {
        if (DELTA[dir].x === dx && DELTA[dir].y === dy) return dir;
      }
      return null;
    }

    async move(dx, dy) {
      if (this.busy || !this.state) return { ok: false, reason: 'busy' };
      if (this.state.gameOver) return { ok: false, reason: 'over' };
      if (this.state.win) return { ok: false, reason: 'win' };
      const dir = this.dirOf(dx, dy);
      if (!dir) return { ok: false, reason: 'dir' };
      const hero = this.hero();
      if (hero.hp <= 0) {
        this.ui.tip('你的生命为 0，无法移动。喝下圣水可以复活。');
        return { ok: false, reason: 'dead' };
      }
      // 箭头/单向通行
      const here = this.blockAt(hero.loc.x, hero.loc.y);
      if (here.tile && Array.isArray(here.tile.cannotOut) && here.tile.cannotOut.indexOf(dir) >= 0) {
        this.ui.tip('这个方向走不过去。');
        return { ok: false, reason: 'arrow' };
      }
      hero.loc.dir = dir;
      const nx = hero.loc.x + dx;
      const ny = hero.loc.y + dy;
      const floor = this.floorData();
      if (nx < 0 || ny < 0 || nx >= floor.width || ny >= floor.height) return { ok: false, reason: 'edge' };
      const target = this.blockAt(nx, ny);
      if (target.tile && Array.isArray(target.tile.cannotIn) && target.tile.cannotIn.indexOf(BACK[dir]) >= 0) {
        this.ui.tip('这个方向走不过去。');
        return { ok: false, reason: 'arrow' };
      }
      this.busy = true;
      const snapshot = this.snapshot();
      let result;
      try {
        result = await this.tryEnter(nx, ny, dir);
      } finally {
        this.busy = false;
      }
      if (result && result.ok) {
        this.pushUndo(snapshot);
        this.save();
      }
      this.ui.update();
      return result || { ok: false };
    }

    async tryEnter(nx, ny, dir) {
      const target = this.blockAt(nx, ny);
      const hero = this.hero();
      const tile = target.tile;

      // 图块自带的“碰触事件”（如 33、38 层的隐形花）：优先于任何系统触发
      if (Array.isArray(tile.event) && tile.event.length) {
        await Events.run(this, tile.event, { x: nx, y: ny, floorId: this.state.floorId });
        return { ok: true, kind: 'tileEvent' };
      }

      if (!target.n || target.empty) { await this.stepTo(nx, ny); return { ok: true, kind: 'move' }; }

      if (tile.kind === 'npc') {
        const floor = this.floorData();
        const hasEvent = !!(floor.events && floor.events[nx + ',' + ny]);
        if (!hasEvent && (tile.trigger === 'oldman' || tile.trigger === 'trader')) {
          await this.npcTrigger(nx, ny, tile.trigger);
        } else {
          await this.talkToNpc(nx, ny);
        }
        return { ok: true, kind: 'npc' };
      }

      if (tile.kind === 'enemy') {
        const info = this.damageAt(nx, ny);
        if (!info) {
          if (await this.tryBreakBlock(nx, ny, 'enemy')) return { ok: true, kind: 'break' };
          this.ui.tip(tile.enemy && tile.enemy.name ? tile.enemy.name + ' 的防御太高，你无法战胜它。' : '你无法战胜它。');
          return { ok: false, reason: 'unbeatable' };
        }
        if (info.damage >= hero.hp) {
          if (await this.tryBreakBlock(nx, ny, 'enemy')) return { ok: true, kind: 'break' };
          this.ui.tip('你的生命太低了，进入这里会死亡。');
          return { ok: false, reason: 'lethal' };
        }
        await this.stepTo(nx, ny);
        return { ok: true, kind: 'battle' };
      }

      if (tile.kind === 'door') {
        // 特性版：有对话能量时，可以直接把门摧毁（不消耗钥匙），与原塔一致
        if (await this.tryBreakBlock(nx, ny, 'door')) return { ok: true, kind: 'break' };
        if (await this.tryOpenDoor(nx, ny, true)) {
          await this.stepTo(nx, ny);
          return { ok: true, kind: 'door' };
        }
        return { ok: false, reason: 'door' };
      }

      if (tile.kind === 'fakeWall') {
        this.setTile(nx, ny, 0);
        this.ui.sound('door');
        await this.runAfterOpenDoor(nx, ny);
        await this.stepTo(nx, ny);
        return { ok: true, kind: 'fakeWall' };
      }

      if (tile.noPass) {
        // 机关门/铁门由事件或道具打开，直接撞无效
        if (await this.tryBreakBlock(nx, ny, 'wall')) return { ok: true, kind: 'break' };
        this.ui.tip('这里过不去。');
        return { ok: false, reason: 'wall' };
      }

      await this.stepTo(nx, ny);
      return { ok: true, kind: 'move' };
    }

    async tryBreakBlock(x, y, kind) {
      // 特性版：对话穿墙。用掉全部对话能量，直接摧毁面前的一格障碍。
      if (!((this.state.talkEnergy || 0) > 0 && this.state.flags['开启特性'])) return false;
      const block = this.blockAt(x, y);
      const tile = block.tile || {};
      const floor = this.floorData();
      const ev = floor.events && floor.events[x + ',' + y];
      const hasEvent = !!(ev && ev.enable !== false && !this.isEventDead(x, y));
      const plain = !hasEvent && !tile.trigger;
      const allowed = plain || kind === 'enemy' || (kind === 'door' && this.canOpenWithKey(x, y));
      if (!allowed) return false;
      this.state.talkEnergy = 0;
      this.setTile(x, y, 0);
      this.ui.tip('用神秘的力量摧毁了障碍！');
      this.ui.sound('break');
      await this.stepTo(x, y);
      return true;
    }

    async stepTo(x, y) {
      const hero = this.hero();
      const fromX = hero.loc.x;
      const fromY = hero.loc.y;
      hero.loc.x = x;
      hero.loc.y = y;
      this.state.stats.steps++;
      this.state.talkEnergy = (this.state.talkEnergy || 0) - 1;
      // 离开某格时，该格图块自带的 outEvent（原塔 33、38 层的隐形花）
      const fromBlock = this.blockAt(fromX, fromY);
      const fromTile = fromBlock && fromBlock.tile;
      if (fromTile && Array.isArray(fromTile.outEvent) && fromTile.outEvent.length) {
        await Events.run(this, fromTile.outEvent, { x: fromX, y: fromY, floorId: this.state.floorId });
        if (this.state.gameOver || this.state.win) return;
      }
      // 中毒
      if (hero.flags.poison) {
        const dmg = this.data.values.poisonDamage || 10;
        hero.hp -= dmg;
        this.state.stats.extraDamage += dmg;
        this.ui.tip('中毒！生命 -' + dmg);
        if (hero.hp <= 0) { await this.die('中毒'); return; }
      }
      await this.checkAutoEvents();
      if (this.state.gameOver || this.state.win) return;
      await this.checkBlockAt(x, y);
      if (this.state.gameOver || this.state.win) return;
      await this.triggerAt(x, y);
    }

    async triggerAt(x, y) {
      const floorId = this.state.floorId;
      const floor = this.floorData(floorId);
      const loc = x + ',' + y;
      const ev = floor.events && floor.events[loc];
      if (ev && ev.enable !== false && !this.isEventDead(x, y, floorId)) {
        await Events.run(this, ev.data, { x, y, floorId });
        if (this.state.gameOver || this.state.win) return;
        // 事件里换层了：不能再用旧坐标触发新楼层的图块
        if (this.state.floorId !== floorId) return;
      }
      const block = this.blockAt(x, y);
      const tile = block.tile;
      if (!block.n) return;
      if (tile.kind === 'item' && tile.trigger === 'getItem') await this.pickupAt(x, y);
      else if (tile.trigger === 'battle') await this.battleAt(x, y);
      else if (tile.trigger === 'openDoor') await this.tryOpenDoor(x, y, false);
      else if (tile.kind === 'stair' || tile.trigger === 'changeFloor') await this.useStair(x, y);
      else if (tile.trigger === 'passNet') await this.passNet(tile.id);
    }

    // 事件强制移动勇士（不触发任何事件，对应 h5mota 的 eventMoveHero）
    async moveHeroSteps(steps) {
      const scan = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      const back = { up: 'down', down: 'up', left: 'right', right: 'left' };
      for (const spec of steps || []) {
        const parts = String(spec).split(':');
        let dir = parts[0];
        let n = parseInt(parts[1] || '1', 10) || 1;
        if (dir === 'forward') dir = this.hero().loc.dir;
        else if (dir === 'backward') dir = back[this.hero().loc.dir] || 'down';
        const d = scan[dir];
        if (!d) continue;
        while (n-- > 0) {
          const hero = this.hero();
          const nx = hero.loc.x + d[0];
          const ny = hero.loc.y + d[1];
          const floor = this.floorData();
          if (nx < 0 || ny < 0 || nx >= floor.width || ny >= floor.height) break;
          hero.loc.x = nx;
          hero.loc.y = ny;
          hero.loc.dir = dir;
        }
      }
      this.markSeen(this.state.floorId);
      await this.checkAutoEvents();
    }

    async useStair(x, y) {
      const floor = this.floorData();
      const st = floor.stairs && floor.stairs[x + ',' + y];
      if (!st) return;
      await this.changeFloorById(st.to, null, null, st.stair);
    }

    async passNet(id) {
      const hero = this.hero();
      const values = this.data.values;
      if (id === 'lavaNet') {
        const dmg = values.lavaDamage || 100;
        hero.hp -= dmg;
        this.state.stats.extraDamage += dmg;
        this.ui.tip('血网！生命 -' + dmg);
        if (hero.hp <= 0) return this.die('血网');
      } else if (id === 'poisonNet') {
        hero.flags.poison = true;
        this.ui.tip('中毒了：每走一步损失 ' + (values.poisonDamage || 10) + ' 点生命');
      } else if (id === 'weakNet') {
        if (!hero.flags.weak) {
          const v = values.weakValue || 20;
          hero.atk -= v;
          hero.def -= v;
          hero.flags.weak = true;
          this.ui.tip('衰弱：攻防各 -' + v);
        } else {
          this.ui.tip('已经处于衰弱状态');
        }
      } else if (id === 'curseNet') {
        hero.flags.curse = true;
        this.ui.tip('被诅咒：战斗无法获得金币和经验');
      }
    }

    async runOutEvent(x, y, tile) {
      // 灯（165）：离开时触发该格事件（用于显形暗道等）
      const floor = this.floorData();
      const ev = floor.events && floor.events[x + ',' + y];
      if (ev && ev.enable !== false && tile.outEvent) {
        // 灯本身不触发事件，只有“离开后”的 outEvent 才触发，这里保持简单：不自动执行
      }
    }

    // 老人 / 商人：原塔用插件把这些 trigger 转成“对话”“商人”两个公共事件
    async npcTrigger(x, y, kind) {
      const floor = this.floorData();
      const n = floor.n;
      const ctx = { x, y, floorId: this.state.floorId };
      if (kind === 'oldman') {
        await this.runCommonEvent('对话', [n, x, y, 0], ctx);
        return;
      }
      const name = this.state.floorId + '@' + x + '@' + y + '@A';
      if (this.getFlag(name) == 1) await this.runCommonEvent('对话', [n, x, y, 1], ctx);
      else await this.runCommonEvent('商人', [n, x, y], ctx);
    }

    async talkToNpc(x, y) {
      const floor = this.floorData();
      const ev = floor.events && floor.events[x + ',' + y];
      if (ev && ev.enable !== false && !this.isEventDead(x, y)) {
        await Events.run(this, ev.data, { x, y, floorId: this.state.floorId });
        return;
      }
      const tile = this.tileInfo(this.tileNumber(x, y));
      if (tile.trigger === 'oldman') {
        await this.runCommonEvent('对话', [floor.n, x, y, 0], { x, y, floorId: this.state.floorId });
      } else if (tile.trigger === 'trader') {
        await this.runCommonEvent('商人', [floor.n, x, y], { x, y, floorId: this.state.floorId });
      } else {
        this.ui.tip('它没有理你。');
      }
    }

    // ---------- 战斗 ----------
    async battleAt(x, y) {
      const block = this.blockAt(x, y);
      if (!block.enemy) return false;
      const enemy = block.enemy;
      const info = Rules.damage(enemy, this.hero(), this.damageOptions());
      if (!info) {
        this.ui.tip(enemy.name + ' 的防御太高，你无法战胜它。');
        return false;
      }
      const hero = this.hero();
      if (info.damage >= hero.hp) {
        await this.die(enemy.name);
        return false;
      }
      return this.settleBattle(enemy, info, x, y, true);
    }

    async settleBattle(enemy, info, x, y, removeBlock) {
      const hero = this.hero();
      const hpBefore = hero.hp;
      hero.hp = Math.max(0, hero.hp - info.damage);
      this.state.stats.battles++;
      this.state.stats.kills = (this.state.stats.kills || 0) + 1;
      this.state.stats.damage += info.damage;
      if (removeBlock) this.setTile(x, y, 0);
      // 战利品
      let money = enemy.money || 0;
      if (hero.flags.curse) money = 0;
      else if (this.countItem('coin') > 0) money *= 2;
      if (!hero.flags.curse) {
        hero.money += money;
        hero.exp += enemy.exp || 0;
        this.state.stats.money += money;
      }
      if (money > 0) this.ui.tip(enemy.name + ' 被打败了，金币 +' + money);
      // 特殊属性战后效果
      const special = enemy.special;
      if (Rules.hasSpecial(special, 12)) hero.flags.poison = true;
      if (Rules.hasSpecial(special, 13)) {
        if (!hero.flags.weak) {
          const v = this.data.values.weakValue || 20;
          hero.atk -= v;
          hero.def -= v;
          hero.flags.weak = true;
        }
      }
      if (Rules.hasSpecial(special, 14)) hero.flags.curse = true;
      if (Rules.hasSpecial(special, 19)) hero.hp = 1;
      if (Rules.hasSpecial(special, 21)) {
        hero.atk -= enemy.atkValue || 0;
        hero.def -= enemy.defValue || 0;
      }
      if (Rules.hasSpecial(special, 17)) this.state.flags.hatred = (this.state.flags.hatred || 0) + (this.data.values.hatred || 2);
      await this.ui.battle({ enemy, info, hpBefore, hpAfter: hero.hp });
      if (hero.hp <= 0) { await this.die(enemy.name); return false; }
      if (x != null) await this.runAfterBattle(x, y);
      return true;
    }

    async runAfterBattle(x, y) {
      const floor = this.floorData();
      const ev = floor.afterBattle && floor.afterBattle[x + ',' + y];
      if (ev) await Events.run(this, ev, { x, y, floorId: this.state.floorId });
      await this.checkAutoEvents();
    }

    async scriptBattle(id, ctx) {
      const enemy = this.effectiveEnemy(id);
      if (!enemy) return false;
      const info = Rules.damage(enemy, this.hero(), this.damageOptions());
      if (!info) { this.ui.tip(enemy.name + ' 的防御太高，你无法战胜它。'); return false; }
      const hero = this.hero();
      if (info.damage >= hero.hp) {
        await this.die(enemy.name);
        return false;
      }
      return this.settleBattle(enemy, info, ctx && ctx.x, ctx && ctx.y, false);
    }

    async zeroHpBattle(enemyId, ctx) {
      const enemy = this.effectiveEnemy(enemyId);
      const hero = this.hero();
      hero.hp = 0;
      this.state.stats.zeroHp++;
      if (enemy) {
        let money = enemy.money || 0;
        if (this.countItem('coin') > 0) money *= 2;
        hero.money += money;
        hero.exp += enemy.exp || 0;
        this.state.stats.money += money;
        this.ui.tip('你倒下了……但圣水还能救你。');
      }
      await this.ui.update();
    }

    async die(reason) {
      if (this.state.gameOver) return;
      const hero = this.hero();
      hero.hp = 0;
      this.state.gameOver = true;
      this.state.stats.defeats++;
      this.ui.tip('你被 ' + (reason || '怪物') + ' 击败了');
      this.ui.sound('lose');
      this.ui.update();
      this.save();
      await this.ui.win({ reason: '你被 ' + (reason || '怪物') + ' 击败了', state: this.state });
    }

    // ---------- 阻激夹域 ----------
    buildCheckBlock(floorId) {
      const damage = {};
      const type = {};
      const repulse = {};
      const immune = !!(this.hero().flags && this.hero().flags['魔法免疫']);
      const floor = this.floorData(floorId);
      const blocks = {};
      for (let y = 0; y < floor.height; y++) {
        for (let x = 0; x < floor.width; x++) {
          const b = this.blockAt(x, y, floorId);
          if (b.n) blocks[x + ',' + y] = b;
        }
      }
      const addDamage = (loc, value, name) => {
        if (!value) return;
        damage[loc] = (damage[loc] || 0) + value;
        type[loc] = type[loc] || {};
        type[loc][name] = true;
      };
      for (const key of Object.keys(blocks)) {
        const b = blocks[key];
        const tile = b.tile;
        if (tile.id === 'lavaNet') addDamage(key, this.data.values.lavaDamage || 100, '血网伤害');
        if (!b.enemy) continue;
        const enemy = b.enemy;
        const special = enemy.special;
        // 领域
        if (Rules.hasSpecial(special, 15) && !immune) {
          const range = enemy.range || 1;
          const square = !!enemy.zoneSquare;
          for (let dy = -range; dy <= range; dy++) {
            for (let dx = -range; dx <= range; dx++) {
              if (!dx && !dy) continue;
              if (!square && Math.abs(dx) + Math.abs(dy) !== 1 && range === 1) continue;
              if (!square && Math.abs(dx) + Math.abs(dy) > range) continue;
              if (square && Math.max(Math.abs(dx), Math.abs(dy)) > range) continue;
              const nx = b.x + dx, ny = b.y + dy;
              if (nx < 0 || ny < 0 || nx >= floor.width || ny >= floor.height) continue;
              addDamage(nx + ',' + ny, enemy.value || 0, '领域伤害');
            }
          }
        }
        // 阻击
        if (Rules.hasSpecial(special, 18)) {
          for (const dir of Object.keys(DELTA)) {
            const nx = b.x + DELTA[dir].x, ny = b.y + DELTA[dir].y;
            if (nx < 0 || ny < 0 || nx >= floor.width || ny >= floor.height) continue;
            const loc = nx + ',' + ny;
            if (!immune) addDamage(loc, enemy.value || 0, '阻击伤害');
            const rdir = BACK[dir];
            const rx = b.x + DELTA[rdir].x, ry = b.y + DELTA[rdir].y;
            if (rx < 0 || ry < 0 || rx >= floor.width || ry >= floor.height) continue;
            if (blocks[rx + ',' + ry]) continue;
            (repulse[loc] = repulse[loc] || []).push([b.x, b.y, rdir]);
          }
        }
        // 夹击
        if (Rules.hasSpecial(special, 16) && !immune) {
          const check = (dx, dy) => {
            const x2 = b.x + 2 * dx, y2 = b.y + 2 * dy;
            const b2 = blocks[x2 + ',' + y2];
            if (!b2 || !b2.enemy) return;
            if (b2.enemy.id !== enemy.id) return;
            if (!Rules.hasSpecial(b2.enemy.special, 16)) return;
            const mid = (b.x + dx) + ',' + (b.y + dy);
            if (type[mid] && type[mid]['夹击伤害']) return;
            const current = damage[mid] || 0;
            const left = this.hero().hp - current;
            if (left > 1) addDamage(mid, Math.floor(left / 2), '夹击伤害');
          };
          check(1, 0);
          check(0, 1);
        }
      }
      return { damage, type, repulse };
    }

    async checkBlockAt(x, y) {
      const map = this.buildCheckBlock(this.state.floorId);
      const loc = x + ',' + y;
      const dmg = map.damage[loc] || 0;
      if (dmg > 0) {
        const hero = this.hero();
        hero.hp -= dmg;
        this.state.stats.extraDamage += dmg;
        const names = Object.keys(map.type[loc] || {}).join('，') || '伤害';
        this.ui.tip('受到' + names + dmg + '点');
        this.ui.update();
        if (hero.hp <= 0) { await this.die('领域'); return; }
      }
      const rep = map.repulse[loc];
      if (rep && rep.length) {
        for (const one of rep) {
          const [mx, my, rdir] = one;
          const nx = mx + DELTA[rdir].x, ny = my + DELTA[rdir].y;
          const moving = this.blockAt(mx, my);
          if (!moving.n) continue;
          if (this.tileNumber(nx, ny)) continue;
          this.setTile(nx, ny, moving.n);
          this.setTile(mx, my, 0);
        }
        this.ui.update();
      }
    }

    // ---------- 自动事件 ----------
    async checkAutoEvents() {
      if (this.autoRunning || !this.state) return;
      this.autoRunning = true;
      try {
        for (const floorId of this.data.floors.floorIds) {
          const floor = this.floorData(floorId);
          const group = floor.autoEvent;
          if (!group) continue;
          for (const loc of Object.keys(group)) {
            const one = group[loc];
            const keys = Object.keys(one).sort();
            for (const key of keys) {
              const auto = one[key];
              if (!auto) continue;
              if (auto.currentFloor && floorId !== this.state.floorId) continue;
              const symbol = floorId + '@' + loc + '@' + key;
              if (this.state.autoDone.indexOf(symbol) >= 0 && !auto.multiExecute) continue;
              if (this.state.autoDone.indexOf(symbol) < 0) this.state.autoDone.push(symbol);
              const [x, y] = loc.split(',').map(Number);
              let ok = false;
              try {
                ok = !!this.evaluate(auto.condition, { x, y, floorId });
              } catch (err) {
                ok = false;
              }
              if (!ok) {
                if (!auto.multiExecute) this.state.autoDone = this.state.autoDone.filter(s => s !== symbol);
                continue;
              }
              await Events.run(this, auto.data, { x, y, floorId });
              if (this.state.gameOver || this.state.win) return;
            }
          }
        }
      } finally {
        this.autoRunning = false;
      }
    }

    // ---------- 开门 / 拾取 ----------
    async tryOpenDoor(x, y, consume) {
      const block = this.blockAt(x, y);
      const tile = block.tile;
      if (tile.kind !== 'door' || !tile.keys) return false;
      const hero = this.hero();
      const keys = tile.keys;
      for (const key of Object.keys(keys)) {
        const need = keys[key] || 1;
        if ((hero.keys[key] || 0) < need) {
          if (consume) this.ui.tip(this.keyName(key) + '不足！');
          return false;
        }
        hero.keys[key] -= need;
      }
      this.setTile(x, y, 0);
      this.ui.sound('door');
      await this.runAfterOpenDoor(x, y);
      return true;
    }

    canOpenWithKey(x, y) {
      const block = this.blockAt(x, y);
      const tile = block.tile;
      if (!tile || tile.kind !== 'door' || !tile.keys) return false;
      const hero = this.hero();
      for (const key of Object.keys(tile.keys)) {
        if ((hero.keys[key] || 0) < (tile.keys[key] || 1)) return false;
      }
      return true;
    }

    keyName(key) {
      return { yellowKey: '黄钥匙', blueKey: '蓝钥匙', redKey: '红钥匙', greenKey: '绿钥匙', steelKey: '铁钥匙', specialKey: '机关钥匙' }[key] || key;
    }

    async runAfterOpenDoor(x, y) {
      const floor = this.floorData();
      const ev = floor.afterOpenDoor && floor.afterOpenDoor[x + ',' + y];
      if (ev) await Events.run(this, ev, { x, y, floorId: this.state.floorId });
      await this.checkAutoEvents();
    }

    async pickupAt(x, y) {
      const block = this.blockAt(x, y);
      if (!block.item || block.tile.kind !== 'item') return;
      const id = block.tile.id;
      const ratio = this.floorData().ratio;
      const result = Rules.itemEffect(id, {
        hero: this.hero(),
        ratio,
        values: this.data.values,
        enemys: this.data.enemys,
        state: this.state
      });
      this.setTile(x, y, 0);
      this.state.stats.items++;
      this.ui.sound('item');
      if (result && result.log && result.log.length) this.ui.tip(result.log.join('，'));
      this.ui.update();
      const floor = this.floorData();
      const ev = floor.afterGetItem && floor.afterGetItem[x + ',' + y];
      if (ev) await Events.run(this, ev, { x, y, floorId: this.state.floorId });
      await this.checkAutoEvents();
    }

    // ---------- 楼层 ----------
    markSeen(floorId) {
      if (this.state.seen.indexOf(floorId) < 0) this.state.seen.push(floorId);
    }

    async changeFloorById(floorId, loc, ctx, stair) {
      // 支持 h5mota 的特殊楼层写法：:next / :prev / :now / :back
      const ids = this.data.floors.floorIds;
      let keepLoc = false;
      if (floorId === ':next' || floorId === ':prev' || floorId === ':back') {
        const idx = ids.indexOf(this.state.floorId) + (floorId === ':next' ? 1 : -1);
        if (floorId === ':back') {
          // :back 表示回到上一层的对应楼梯，按上一层的 downFloor 处理
        }
        if (idx < 0 || idx >= ids.length) return;
        floorId = ids[idx];
        keepLoc = true;
      } else if (floorId === ':now') {
        floorId = this.state.floorId;
        keepLoc = true;
      }
      if (!floorId || !this.data.floors.floors[floorId]) return;
      const dest = this.data.floors.floors[floorId];
      let pos = null;
      if (Array.isArray(loc)) pos = { x: loc[0], y: loc[1] };
      else if (loc && typeof loc === 'object') pos = { x: loc.x, y: loc.y };
      if (!pos && keepLoc) pos = { x: this.hero().loc.x, y: this.hero().loc.y };
      if (!pos) {
        const candidate = dest[stair] || dest.downFloor || dest.upFloor;
        if (Array.isArray(candidate)) pos = { x: candidate[0], y: candidate[1] };
      }
      if (!pos) pos = { x: 6, y: 11 };
      // 特性版：楼层间移动不消耗对话能量
      this.state.floorId = floorId;
      const hero = this.hero();
      hero.loc = { x: pos.x, y: pos.y, dir: stair === 'upFloor' ? 'up' : 'down' };
      if (this.state.visited.indexOf(floorId) < 0) this.state.visited.push(floorId);
      this.state.flags.ratio = dest.ratio;
      this.ui.update();
      await this.enterFloor();
    }

    async enterFloor() {
      const floor = this.floorData();
      const ctx = { floorId: this.state.floorId, x: this.hero().loc.x, y: this.hero().loc.y };
      if (this.state.seen.indexOf(this.state.floorId) < 0) {
        this.markSeen(this.state.floorId);
        if (floor.firstArrive) await Events.run(this, floor.firstArrive, ctx);
      }
      if (floor.eachArrive) await Events.run(this, floor.eachArrive, ctx);
      await this.checkAutoEvents();
      this.ui.update();
    }

    // ---------- 存档 ----------
    snapshot() { return JSON.stringify(this.state); }

    pushUndo(snapshot) {
      this.history.push(snapshot || this.snapshot());
      while (this.history.length > UNDO_LIMIT) this.history.shift();
    }

    canUndo() { return this.history.length > 0; }

    async undo() {
      if (this.busy) return false;
      const snap = this.history.pop();
      if (!snap) return false;
      this.state = this.migrate(JSON.parse(snap));
      this.ui.update();
      this.save();
      return true;
    }

    save() {
      if (!this.storage || !this.state) return false;
      try {
        this.storage.setItem(this.saveKey, JSON.stringify(this.state));
        return true;
      } catch (err) {
        return false;
      }
    }

    load() {
      if (!this.storage) return false;
      try {
        const text = this.storage.getItem(this.saveKey);
        if (!text) return false;
        const parsed = JSON.parse(text);
        if (!this.validateState(parsed)) return false;
        this.state = this.migrate(parsed);
        this.history = [];
        this.ui.update();
        return true;
      } catch (err) {
        return false;
      }
    }

    /** 读档 / 导入前的结构校验：宁可拒绝，也不要把半截状态写回存档。 */
    validateState(state) {
      if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
      const floors = this.data.floors.floors;
      if (typeof state.floorId !== 'string' || !floors[state.floorId]) return false;
      const hero = state.hero;
      if (!hero || typeof hero !== 'object' || Array.isArray(hero)) return false;
      for (const key of ['hp', 'atk', 'def']) {
        if (typeof hero[key] !== 'number' || !Number.isFinite(hero[key])) return false;
      }
      for (const key of ['mdef', 'money', 'exp']) {
        if (hero[key] != null && (typeof hero[key] !== 'number' || !Number.isFinite(hero[key]))) return false;
      }
      const loc = hero.loc;
      if (!loc || typeof loc !== 'object' || !Number.isInteger(loc.x) || !Number.isInteger(loc.y)) return false;
      const floor = floors[state.floorId];
      if (loc.x < 0 || loc.y < 0 || loc.x >= floor.width || loc.y >= floor.height) return false;
      const isObject = (value) => value == null || (typeof value === 'object' && !Array.isArray(value));
      if (!isObject(state.flags) || !isObject(state.stats) || !isObject(state.overrides)) return false;
      if (!isObject(hero.flags) || !isObject(hero.keys) || !isObject(hero.items)) return false;
      if (hero.items) {
        if (!isObject(hero.items.tools) || !isObject(hero.items.constants)) return false;
      }
      for (const value of Object.values(hero.keys || {})) {
        if (typeof value !== 'number' || !Number.isFinite(value)) return false;
      }
      if (!state.floors || typeof state.floors !== 'object' || Array.isArray(state.floors)) return false;
      if (!state.floors[state.floorId]) return false;
      for (const [id, fs] of Object.entries(state.floors)) {
        const source = floors[id];
        if (!source || !fs || typeof fs !== 'object' || !Array.isArray(fs.map)) return false;
        if (fs.map.length !== source.height) return false;
        for (const row of fs.map) {
          if (!Array.isArray(row) || row.length !== source.width) return false;
          if (row.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return false;
        }
        if (fs.hidden != null && !Array.isArray(fs.hidden)) return false;
        if (fs.dead != null && !Array.isArray(fs.dead)) return false;
      }
      return true;
    }

    migrate(state) {
      state.flags = state.flags || {};
      if (!state.floors) state.floors = {};
      state.stats = Object.assign({ steps: 0, battles: 0, damage: 0, extraDamage: 0, money: 0, items: 0, shopTimes: 0, defeats: 0, zeroHp: 0 }, state.stats || {});
      if (state.stats.kills == null) state.stats.kills = state.stats.battles || 0;
      state.overrides = state.overrides || {};
      state.autoDone = state.autoDone || [];
      state.seen = state.seen || [];
      state.talkEnergy = state.talkEnergy || 0;
      state.hero.keys = Object.assign({ yellowKey: 0, blueKey: 0, redKey: 0, greenKey: 0, steelKey: 0, specialKey: 0 }, state.hero.keys || {});
      state.hero.items = state.hero.items || { tools: {}, constants: {} };
      state.hero.items.tools = state.hero.items.tools || {};
      state.hero.items.constants = state.hero.items.constants || {};
      // 旗标只有一份：hero.flags 与 state.flags 指向同一个对象
      const flags = Object.assign({}, state.flags, state.hero.flags || {});
      state.flags = flags;
      state.hero.flags = flags;
      for (const id of this.data.floors.floorIds) {
        if (!state.floors[id]) state.floors[id] = { map: this.data.floors.floors[id].map.map(r => r.slice()), hidden: [], dead: [] };
        if (!state.floors[id].hidden) state.floors[id].hidden = [];
        if (!state.floors[id].dead) state.floors[id].dead = [];
      }
      return state;
    }

    exportSave() {
      try { return JSON.stringify(this.state); } catch (err) { return ''; }
    }

    async importSave(text) {
      try {
        const parsed = JSON.parse(text);
        if (!this.validateState(parsed)) return false;
        this.state = this.migrate(parsed);
        this.history = [];
        this.ui.update();
        this.save();
        return true;
      } catch (err) {
        return false;
      }
    }

    // ---------- 道具 ----------
    countItem(id) {
      const hero = this.hero();
      if (id in hero.keys) return hero.keys[id] || 0;
      const cls = (this.data.items[id] || {}).cls;
      if (cls === 'constants') return (hero.items.constants[id] || 0);
      return (hero.items.tools[id] || 0);
    }

    hasItem(id) { return this.countItem(id) > 0; }

    addItem(id, n) {
      const hero = this.hero();
      n = n == null ? 1 : n;
      if (id in hero.keys) { hero.keys[id] = (hero.keys[id] || 0) + n; return; }
      const cls = (this.data.items[id] || {}).cls;
      if (cls === 'constants') hero.items.constants[id] = (hero.items.constants[id] || 0) + n;
      else hero.items.tools[id] = (hero.items.tools[id] || 0) + n;
    }

    consumeItem(id, n) {
      n = n == null ? 1 : n;
      const hero = this.hero();
      if (id in hero.keys) { hero.keys[id] = Math.max(0, (hero.keys[id] || 0) - n); return; }
      const cls = (this.data.items[id] || {}).cls;
      if (cls === 'constants') return;
      hero.items.tools[id] = Math.max(0, (hero.items.tools[id] || 0) - n);
    }

    tools() {
      const hero = this.hero();
      const list = [];
      for (const id of Object.keys(hero.items.tools)) {
        if (hero.items.tools[id] > 0) list.push({ id, count: hero.items.tools[id], name: (this.data.items[id] || {}).name || id });
      }
      return list;
    }

    async useFly(floorId) {
      if (!this.hasItem('fly')) { this.ui.tip('你没有魔杖。'); return false; }
      if (this.state.visited.indexOf(floorId) < 0) { this.ui.tip('你还没有到过这一层。'); return false; }
      const dest = this.data.floors.floors[floorId];
      if (!dest || dest.canFlyTo === false) { this.ui.tip('无法飞到这一层。'); return false; }
      // 关闭「额外功能」时，必须站在楼梯上才能使用楼传（原塔限制）
      if (!this.state.flags['额外功能开关']) {
        const hero = this.hero();
        const here = this.blockAt(hero.loc.x, hero.loc.y);
        const onStair = (here.tile && here.tile.kind === 'stair') || (this.floorData().stairs || {})[hero.loc.x + ',' + hero.loc.y];
        if (!onStair) { this.ui.tip('必须站在楼梯上才能使用楼传。'); return false; }
      }
      this.ui.sound('fly');
      // 原塔飞楼层时保留当前坐标
      const loc = [this.hero().loc.x, this.hero().loc.y];
      await this.changeFloorById(floorId, loc);
      this.ui.tip('魔杖使用成功');
      this.save();
      return true;
    }

    arm(id) {
      if (!this.hasItem(id)) return false;
      this.armed = id;
      return true;
    }

    cancelArm() { this.armed = null; }

    async useItem(id) {
      if (!this.hasItem(id)) { this.ui.tip('你没有这个道具。'); return { ok: false }; }
      const targeted = { pickaxe: 1, bomb: 1, hammer: 1, snow: 1, jumpShoes: 1 };
      if (targeted[id]) {
        this.armed = id;
        this.ui.tip('请选择要使用「' + ((this.data.items[id] || {}).name || id) + '」的方向。');
        return { ok: true, targeting: true };
      }
      const result = await this.applyTool(id, null, null);
      return result;
    }

    async useItemOn(id, x, y) {
      if (!this.hasItem(id)) return { ok: false };
      this.armed = null;
      return this.applyTool(id, x, y);
    }

    async applyTool(id, x, y) {
      const hero = this.hero();
      const values = this.data.values;
      const snapshot = this.snapshot();
      let used = true;
      let ok = true;
      // 有明确目标格时，把勇者朝向对准它（圣锤/跳跃靴按方向生效）
      const aimDir = () => {
        if (x == null || y == null) return hero.loc.dir || 'down';
        const dx = x - hero.loc.x;
        const dy = y - hero.loc.y;
        if (dx === 0 && dy === 0) return hero.loc.dir || 'down';
        if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
        return dy > 0 ? 'down' : 'up';
      };
      const near = (fn) => {
        for (const dir of Object.keys(DELTA)) {
          const nx = hero.loc.x + DELTA[dir].x, ny = hero.loc.y + DELTA[dir].y;
          if (fn(nx, ny, dir)) return true;
        }
        return false;
      };
      if (id === 'superPotion') {
        const add = Math.round(0.74 * (hero.atk + hero.def)) * 10;
        hero.hp += add;
        this.consumeItem(id, 1);
        this.ui.tip('圣水使用成功，生命 +' + add);
      } else if (id === 'pickaxe') {
        let found = false;
        near((nx, ny) => {
          const b = this.blockAt(nx, ny);
          if (b.tile && (b.tile.canBreak || b.tile.kind === 'fakeWall' || b.tile.kind === 'fakeWall')) {
            this.setTile(nx, ny, 0);
            found = true;
          }
          return found;
        });
        if (found) { this.consumeItem(id, 1); this.ui.tip('镐使用成功'); this.ui.sound('break'); }
        else { this.ui.tip('周围没有可以破坏的墙。'); ok = false; }
      } else if (id === 'bomb') {
        let killed = 0;
        near((nx, ny) => {
          const b = this.blockAt(nx, ny);
          if (b.enemy && (b.enemy.hp || 0) < 500 && !b.enemy.notBomb) {
            this.setTile(nx, ny, 0);
            hero.money += b.enemy.money || 0;
            hero.exp += b.enemy.exp || 0;
            killed++;
          }
          return false;
        });
        if (killed) {
          this.state.stats.kills = (this.state.stats.kills || 0) + killed;
          this.consumeItem(id, 1);
          this.ui.tip('炸死了 ' + killed + ' 只怪物');
          this.ui.sound('bomb');
        } else { this.ui.tip('周围没有可以炸死的怪物。'); ok = false; }
      } else if (id === 'hammer') {
        // 圣锤：只消灭勇士面前那一格里的怪物
        const dir = aimDir();
        hero.loc.dir = dir;
        const tx = hero.loc.x + DELTA[dir].x;
        const ty = hero.loc.y + DELTA[dir].y;
        const b = this.blockAt(tx, ty);
        if (b.enemy) {
          this.state.stats.kills = (this.state.stats.kills || 0) + 1;
          this.setTile(tx, ty, 0);
          hero.money += b.enemy.money || 0;
          hero.exp += b.enemy.exp || 0;
          this.consumeItem(id, 1);
          this.ui.tip('圣锤使用成功');
          this.ui.sound('bomb');
        } else { this.ui.tip('面前没有怪物。'); ok = false; }
      } else if (id === 'snow') {
        let frozen = 0;
        near((nx, ny) => {
          if (this.tileNumber(nx, ny) === 5 || (this.blockAt(nx, ny).tile || {}).id === 'lava') {
            this.setTile(nx, ny, 0);
            frozen++;
          }
          return false;
        });
        if (frozen) { this.ui.tip('冰魔法使用成功'); this.ui.sound('ice'); }
        else { this.ui.tip('周围没有熔岩。'); ok = false; }
      } else if (id === 'jumpShoes') {
        const dir = aimDir();
        hero.loc.dir = dir;
        // 目标格优先用传入坐标（必须是正前方两格），否则按朝向取前两格
        let nx = hero.loc.x + DELTA[dir].x * 2;
        let ny = hero.loc.y + DELTA[dir].y * 2;
        if (x != null && y != null && Math.abs(x - hero.loc.x) + Math.abs(y - hero.loc.y) === 2) { nx = x; ny = y; }
        if (this.tileNumber(nx, ny)) { this.ui.tip('前方两格不是空地。'); ok = false; }
        else {
          this.consumeItem(id, 1);
          hero.loc.x = nx;
          hero.loc.y = ny;
          this.ui.tip('跳跃成功');
          await this.checkAutoEvents();
          await this.checkBlockAt(nx, ny);
          await this.triggerAt(nx, ny);
        }
      } else if (id === 'centerFly') {
        const destX = this.floorData().width - 1 - hero.loc.x;
        const destY = this.floorData().height - 1 - hero.loc.y;
        const b = this.blockAt(destX, destY);
        if (b.n && b.tile.noPass) { this.ui.tip('中心位置无法降落。'); ok = false; }
        else {
          this.consumeItem(id, 1);
          hero.loc.x = destX;
          hero.loc.y = destY;
          this.ui.tip('瞬移使用成功');
          await this.checkAutoEvents();
          await this.checkBlockAt(destX, destY);
          await this.triggerAt(destX, destY);
        }
      } else if (id === 'upFly' || id === 'downFly') {
        const ids = this.data.floors.floorIds;
        const idx = ids.indexOf(this.state.floorId) + (id === 'upFly' ? 1 : -1);
        if (idx < 0 || idx >= ids.length) { this.ui.tip('这里无法传送。'); ok = false; }
        else {
          this.consumeItem(id, 1);
          await this.changeFloorById(ids[idx], [hero.loc.x, hero.loc.y]);
          this.ui.tip((id === 'upFly' ? '向上' : '向下') + '传送成功');
        }
      } else if (id === 'earthquake') {
        const floor = this.floorData();
        let count = 0;
        for (let yy = 0; yy < floor.height; yy++) {
          for (let xx = 0; xx < floor.width; xx++) {
            const b = this.blockAt(xx, yy);
            if (b.tile && b.tile.canBreak && !b.tile.unbreakable) { this.setTile(xx, yy, 0); count++; }
          }
        }
        this.consumeItem(id, 1);
        this.ui.tip('地震卷轴使用成功，破坏了 ' + count + ' 处墙');
        this.ui.sound('bomb');
      } else if (id === 'bigKey') {
        const floor = this.floorData();
        let count = 0;
        for (let yy = 0; yy < floor.height; yy++) {
          for (let xx = 0; xx < floor.width; xx++) {
            const b = this.blockAt(xx, yy);
            if (b.tile && b.tile.id === 'yellowDoor') { this.setTile(xx, yy, 0); count++; }
          }
        }
        this.consumeItem(id, 1);
        this.ui.tip('魔法钥匙使用成功，打开了 ' + count + ' 扇黄门');
      } else if (id === 'poisonWine' || id === 'weakWine' || id === 'curseWine' || id === 'superWine') {
        if (id === 'poisonWine') { hero.flags.poison = false; this.ui.tip('解毒成功'); }
        if (id === 'weakWine') {
          if (hero.flags.weak) { const v = values.weakValue || 20; hero.atk += v; hero.def += v; hero.flags.weak = false; }
          this.ui.tip('解衰成功');
        }
        if (id === 'curseWine') { hero.flags.curse = false; this.ui.tip('解咒成功'); }
        if (id === 'superWine') {
          hero.flags.poison = false; hero.flags.curse = false;
          if (hero.flags.weak) { const v = values.weakValue || 20; hero.atk += v; hero.def += v; hero.flags.weak = false; }
          this.ui.tip('万能药水使用成功');
        }
        this.consumeItem(id, 1);
      } else if (id === 'fly') {
        return { ok: true, fly: true };
      } else if (id === 'book') {
        return { ok: true, manual: true };
      } else if (id === 'I300') {
        return { ok: true, help: true };
      } else {
        used = false;
        this.ui.tip('这个道具现在无法使用。');
        ok = false;
      }
      if (used && ok) {
        this.pushUndo(snapshot);
        this.save();
        this.ui.update();
      }
      return { ok };
    }

    async useItemOnTile(id, x, y) {
      return this.useItemOn(id, x, y);
    }

    // ---------- 事件辅助 ----------
    async say(text) {
      const parsed = this.parseSpeaker(text);
      await this.ui.say(parsed);
    }

    async choose(text, options) {
      const parsed = this.parseSpeaker(text);
      parsed.choices = options;
      const index = await this.ui.choose(parsed);
      return typeof index === 'number' && index >= 0 ? index : 0;
    }

    parseSpeaker(text) {
      const str = String(text == null ? '' : text);
      const m = /^\s*\[([^,\]]+)(?:,([^\]]+))?\]\s*([\s\S]*)$/.exec(str);
      if (!m) return { speaker: '', icon: '', text: str };
      return { speaker: m[1], icon: m[2] || '', text: m[3] };
    }

    interpolate(text, ctx) {
      return String(text == null ? '' : text).replace(/\$\{([^}]*)\}/g, (all, expr) => {
        try {
          const value = this.evaluate(expr, ctx);
          return value == null ? '' : String(value);
        } catch (err) { return ''; }
      });
    }

    makeScope(ctx) {
      const game = this;
      const hero = this.hero();
      const status = {};
      for (const key of ['hp', 'atk', 'def', 'mdef', 'money', 'exp']) {
        Object.defineProperty(status, key, { get() { return hero[key]; }, enumerable: true });
      }
      Object.defineProperty(status, 'x', { get() { return hero.loc.x; }, enumerable: true });
      Object.defineProperty(status, 'y', { get() { return hero.loc.y; }, enumerable: true });
      return {
        status,
        flag(name) { return game.getFlag(name); },
        item(name) { return game.countItem(name); },
        temp(name) { return game.getTemp(name); },
        core: this.coreShim(ctx),
        main: { firstData: { title: this.data.title }, floors: this.data.floors.floors },
        ui: this.ui,
        Math, JSON, Number, String, Boolean, parseInt, parseFloat, isNaN, Object, Array
      };
    }

    coreShim(ctx) {
      const game = this;
      return {
        get status() { return game.state; },
        get values() { return game.data.values; },
        get firstData() { return { title: game.data.title }; },
        get floorId() { return game.state.floorId; },
        get floorIds() { return game.data.floors.floorIds; },
        get floors() { return game.data.floors.floors; },
        get hero() { return game.state.hero; },
        getBlockId(x, y) { const b = game.blockAt(x, y); return b.n ? (b.tile.id || null) : null; },
        getBlockCls(x, y) { const b = game.blockAt(x, y); return b.n ? (b.tile.cls || null) : null; },
        getBlock(x, y) { const b = game.blockAt(x, y); return b.n ? b : null; },
        getEnemyInfo(id) { return game.effectiveEnemy(id); },
        canBattle(id) { return Rules.damage(game.effectiveEnemy(id), game.hero(), game.damageOptions()) !== null; },
        getDamage(id) { const info = Rules.damage(game.effectiveEnemy(id), game.hero(), game.damageOptions()); return info ? info.damage : null; },
        hasItem(id) { return game.hasItem(id); },
        hasVisitedFloor(id) { return game.state.visited.indexOf(id) >= 0; },
        getFlag(name) { return game.getFlag(name); },
        setFlag(name, value) { game.state.flags[name] = value; },
        getStatus(key) { return game.hero()[key]; },
        calValue(expr) { return game.evaluate(expr, ctx); },
        nextX(n) { return game.hero().loc.x + DELTA[game.hero().loc.dir || 'down'].x * (n || 1); },
        nextY(n) { return game.hero().loc.y + DELTA[game.hero().loc.dir || 'down'].y * (n || 1); },
        material: game.data,
        utils: {}
      };
    }

    evaluate(expr, ctx) {
      if (expr == null) return null;
      if (typeof expr === 'number' || typeof expr === 'boolean') return expr;
      let code = String(expr).trim();
      if (!code) return '';
      if (code === 'true') return true;
      if (code === 'false') return false;
      code = code
        .replace(/status:([A-Za-z_][A-Za-z0-9_]*)/g, 'status.$1')
        .replace(/blockId:(\d+),(\d+)/g, 'core.getBlockId($1,$2)')
        .replace(/flag:([^\s+\-*/%<>=!&|?:,()]+)/g, "flag('$1')")
        .replace(/item:([^\s+\-*/%<>=!&|?:,()]+)/g, "item('$1')")
        .replace(/temp:([A-Za-z0-9_:]+)/g, "temp('$1')");
      const scope = this.makeScope(ctx);
      let fn;
      try {
        fn = new Function('scope', 'with (scope) { return (' + code + '); }');
      } catch (err) {
        return null;
      }
      try {
        return fn(scope);
      } catch (err) {
        return null;
      }
    }

    getFlag(name) {
      if (name == null) return null;
      const value = this.state.flags[name];
      return value === undefined ? null : value;
    }

    setTemp(name, value) {
      const key = String(name).replace(/^temp:/, '');
      this.tempVars[key] = value;
    }

    getTemp(name) {
      const key = String(name).replace(/^temp:/, '');
      return this.tempVars[key];
    }

    setValue(name, value, operator) {
      if (name == null) return;
      const hero = this.hero();
      const apply = (old) => {
        switch (operator) {
          case '+=': return (Number(old) || 0) + Number(value || 0);
          case '-=': return (Number(old) || 0) - Number(value || 0);
          case '*=': return (Number(old) || 0) * Number(value || 0);
          case '/=': return Math.floor((Number(old) || 0) / (Number(value) || 1));
          default: return value;
        }
      };
      if (name.indexOf('status:') === 0) {
        const key = name.slice(7);
        hero[key] = apply(hero[key]);
        return;
      }
      if (name.indexOf('item:') === 0) {
        const id = name.slice(5);
        if (operator === '+=' || operator === '-=') {
          if (operator === '+=') this.addItem(id, Number(value || 0));
          else this.consumeItem(id, Number(value || 0));
        } else {
          this.addItem(id, Number(value || 0));
        }
        return;
      }
      if (name.indexOf('flag:') === 0) {
        const key = name.slice(5);
        this.state.flags[key] = apply(this.state.flags[key]);
        return;
      }
      if (name.indexOf('temp:') === 0) {
        this.setTemp(name, apply(this.getTemp(name)));
        return;
      }
      if (name.indexOf('switch:') === 0) return;
    }

    async runCommonEvent(name, args, ctx) {
      const ev = this.data.commonEvents[name];
      if (!ev) return;
      if (!ctx) ctx = { x: this.hero().loc.x, y: this.hero().loc.y, floorId: this.state.floorId };
      const list = args || [];
      for (let i = 0; i < 6; i++) {
        const key = 'arg' + (i + 1);
        this.state.flags[key] = list[i] === undefined ? null : list[i];
      }
      const depth = (ctx.depth || 0) + 1;
      await Events.run(this, ev, Object.assign({}, ctx, { depth }));
    }

    recordShop(kind) {
      // 原塔：“X区购买<kind>”累加本次获得的数值，“X区购买<kind>次数”累加购买次数
      this.state.stats.shopTimes = (this.state.stats.shopTimes || 0) + 1;
      const flags = this.state.flags;
      const ratio = flags.ratio || 1;
      const times = flags.times1 || 0;
      let amount = 1;
      if (kind === 'hp') amount = 100 * (times + 1);
      else if (kind === 'atk') amount = 2 * ratio;
      else if (kind === 'def') amount = 4 * ratio;
      const key = ratio + '区购买' + kind;
      flags[key] = (flags[key] || 0) + amount;
      flags[key + '次数'] = (flags[key + '次数'] || 0) + 1;
    }

    setEnemyStat(id, name, operator, value) {
      if (!id || !name) return;
      const overrides = this.state.overrides;
      overrides[id] = overrides[id] || {};
      const old = overrides[id][name];
      const base = old === undefined ? (this.data.enemys[id] || {})[name] : old;
      let next;
      switch (operator) {
        case '+=': next = (Number(base) || 0) + Number(value || 0); break;
        case '-=': next = (Number(base) || 0) - Number(value || 0); break;
        case '*=': next = (Number(base) || 0) * Number(value || 0); break;
        case '/=': next = Math.floor((Number(base) || 0) / (Number(value) || 1)); break;
        case 'set':
        default: next = value;
      }
      overrides[id][name] = next;
    }

    // 位置列表解析：[[x,y],...] / [x,y] / 表达式数组 / 缺省当前事件坐标
    resolveLocs(loc, ctx) {
      const game = this;
      const evalNum = (v) => {
        if (typeof v === 'string') {
          try {
            const got = game.evaluate(v.trim(), ctx);
            return Number(got);
          } catch (err) { return NaN; }
        }
        if (v && typeof v === 'object') return Number(v.x != null ? v.x : NaN);
        return Number(v);
      };
      const parseOne = (one) => {
        if (typeof one === 'string') {
          const value = game.evaluate(one.trim(), ctx);
          const arr = Array.isArray(value) ? value : String(value == null ? '' : value).split(',');
          if (arr.length >= 2) return [Number(arr[0]), Number(arr[1])];
          return null;
        }
        // [x表达式, y表达式]：两个分量都可能写成 flag:arg2 这类表达式
        if (Array.isArray(one)) {
          if (one.length >= 2 && !Array.isArray(one[0]) && (one[0] == null || typeof one[0] !== 'object')) {
            const x = evalNum(one[0]);
            const y = evalNum(one[1]);
            if (Number.isNaN(x) || Number.isNaN(y)) return null;
            return [x, y];
          }
          return null;
        }
        if (one && typeof one === 'object') return [Number(one.x), Number(one.y)];
        return null;
      };
      if (loc == null) return [[ctx.x, ctx.y]];
      if (Array.isArray(loc)) {
        const one = parseOne(loc);
        if (one) return [one];
        return loc.map(parseOne).filter(Boolean);
      }
      const one = parseOne(loc);
      return one ? [one] : [];
    }

    hideBlocks(loc, ctx, floorId, remove) {
      const locs = this.resolveLocs(loc, ctx);
      for (const [x, y] of locs) {
        const tile = this.tileInfo(this.tileNumber(x, y, floorId));
        if (remove) this.setTile(x, y, 0, floorId);
        else this.hideTile(x, y, floorId);
        this.killEvent(x, y, floorId);
        // 老人(121)/商人(122) 被移除时会留下 2 点对话能量（特性版穿墙用）
        if ((tile.id === 'oldman' || tile.id === 'trader') && this.state.flags['开启特性']) this.state.talkEnergy = 2;
      }
    }

    isEventDead(x, y, floorId) {
      const fs = this.floorState(floorId);
      if (!fs || !fs.dead) return false;
      return fs.dead.indexOf(x + ',' + y) >= 0;
    }

    killEvent(x, y, floorId) {
      const fs = this.floorState(floorId);
      if (!fs) return;
      fs.dead = fs.dead || [];
      const loc = x + ',' + y;
      if (fs.dead.indexOf(loc) < 0) fs.dead.push(loc);
    }

    reviveEvent(x, y, floorId) {
      const fs = this.floorState(floorId);
      if (!fs || !fs.dead) return;
      const loc = x + ',' + y;
      const idx = fs.dead.indexOf(loc);
      if (idx >= 0) fs.dead.splice(idx, 1);
    }

    showBlocks(loc, ctx, floorId) {
      // show 只恢复可视性与可交互，不推测图块号：h5mota 的 show 不会把 hide/remove 掉的图块变回来，
      // 也不能按底图复原（会把 setBlock 0 清出的通道重新堵上）。
      const locs = this.resolveLocs(loc, ctx);
      for (const [x, y] of locs) {
        this.showTile(x, y, floorId);
        this.reviveEvent(x, y, floorId);
      }
    }

    setBlocks(loc, number, ctx, floorId) {
      // number 0 表示“清成空地”，不能当成空操作
      const n = number == null || number === '' ? 0 : Number(number);
      if (Number.isNaN(n)) return;
      for (const [x, y] of this.resolveLocs(loc, ctx)) {
        this.showTile(x, y, floorId);
        this.setTile(x, y, n, floorId);
      }
    }

    openDoorLocs(loc, ctx, floorId) {
      for (const [x, y] of this.resolveLocs(loc, ctx)) {
        if (this.tileNumber(x, y, floorId)) this.setTile(x, y, 0, floorId);
      }
    }

    closeDoorLocs(loc, number, ctx, floorId) {
      const n = Number(number);
      if (!n) return;
      for (const [x, y] of this.resolveLocs(loc, ctx)) this.setTile(x, y, n, floorId);
    }

    async doWin(reason) {
      if (this.state.win) return;
      this.state.win = { reason: reason || '', at: Date.now() };
      this.state.gameOver = false;
      this.save();
      await this.ui.win({ reason: this.state.win.reason, state: this.state });
    }

    // ---------- 统计 ----------
    statsSummary() {
      const hero = this.hero();
      let alive = 0;
      for (const floorId of this.data.floors.floorIds) {
        const fs = this.state.floors[floorId];
        for (const row of fs.map) {
          for (const n of row) {
            if (!n) continue;
            const tile = this.tileInfo(n);
            if (tile.kind === 'enemy') alive++;
          }
        }
      }
      return {
        hp: hero.hp,
        atk: hero.atk,
        def: hero.def,
        money: hero.money,
        sum: hero.atk + hero.def,
        shopTimes: this.state.stats.shopTimes || 0,
        alive,
        killed: this.state.stats.kills || 0,
        keys: (hero.keys.yellowKey || 0) + (hero.keys.blueKey || 0) + (hero.keys.redKey || 0),
        items: Object.keys(hero.items.tools).length + Object.keys(hero.items.constants).length,
        steps: this.state.stats.steps || 0,
        battles: this.state.stats.battles || 0,
        damage: this.state.stats.damage || 0
      };
    }
  }

  function create(options) { return new Game(options); }

  return { Game, create, SAVE_VERSION };
});
