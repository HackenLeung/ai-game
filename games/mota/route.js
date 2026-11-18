(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MotaRoute = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 点地图自动走路的寻路核心（纯逻辑，不碰 DOM）：
  //   · 只在「站得住」的格子上走：空地、道具、楼梯、钥匙够的门；
  //   · 门要算着钥匙走：走过的门扣钥匙，路上捡到的钥匙算进后续；
  //   · 陷阱格（熔岩/中毒/衰弱/诅咒之网）当作很贵的一步，能绕就绕；
  //   · 楼梯只当终点：路过楼梯等于换层，绝不当跳板；
  //   · 怪物、空气墙、机关门（没有钥匙定义的门）一律不穿。
  // app.js 负责把它接到引擎上（blockAt / 钥匙数量 / 走路节奏）。
  // ---------------------------------------------------------------------------

  const WALK_STEPS = [[0, -1, 'up'], [0, 1, 'down'], [-1, 0, 'left'], [1, 0, 'right']];
  const BACK_STEP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const TRAP_COST = { lavaNet: 9, poisonNet: 9, weakNet: 9, curseNet: 9 };
  const DOOR_COST = 12;
  const KEY_NAMES = ['yellowKey', 'blueKey', 'redKey'];
  const KEY_CAP = 9;
  const GUARD = 20000;

  // 楼梯：数据里 kind 是 'stair'（也兼容 'stairs'）
  function isStairTile(tile) {
    return !!tile && /^stairs?$/.test(String(tile.kind || ''));
  }

  // 门：这一组钥匙够不够开（数据里 kind 是 'door'，keys 形如 {yellowKey:1}）
  function doorOpenable(tile, keys) {
    if (!tile || tile.kind !== 'door' || !tile.keys) return false;
    const held = keys || [0, 0, 0];
    return Object.keys(tile.keys).every((name) => {
      const index = KEY_NAMES.indexOf(name);
      if (index < 0) return false;
      return held[index] >= (tile.keys[name] || 1);
    });
  }

  // 走进这一格之后钥匙怎么变：开门扣钥匙，踩到钥匙 +1
  function keysAfter(tile, keys) {
    const held = keys || [0, 0, 0];
    if (!tile) return held;
    if (tile.kind === 'door' && tile.keys) {
      const next = held.slice();
      for (const name of Object.keys(tile.keys)) {
        const index = KEY_NAMES.indexOf(name);
        if (index >= 0) next[index] = Math.max(0, next[index] - (tile.keys[name] || 1));
      }
      return next;
    }
    if (tile.kind === 'item') {
      const index = KEY_NAMES.indexOf(tile.id);
      if (index >= 0) {
        const next = held.slice();
        next[index] = Math.min(KEY_CAP, next[index] + 1);
        return next;
      }
    }
    return held;
  }

  // 站上去之后还会不会再动（空地、药水、宝石、门、楼梯、钥匙都算能站）
  function standable(block, keys) {
    if (!block) return false;
    if (!block.n) return true;
    if (block.enemy) return false;
    const tile = block.tile || {};
    if (!tile.noPass) return true;
    return doorOpenable(tile, keys);
  }

  function enterCost(tile) {
    return TRAP_COST[(tile && tile.id) || ''] || 1;
  }

  function stepAllowed(blockAt, fromX, fromY, dir, dx, dy) {
    const from = blockAt(fromX, fromY) || {};
    const to = blockAt(fromX + dx, fromY + dy) || {};
    const fromTile = from.tile || {};
    const toTile = to.tile || {};
    if (Array.isArray(fromTile.cannotOut) && fromTile.cannotOut.indexOf(dir) >= 0) return false;
    if (Array.isArray(toTile.cannotIn) && toTile.cannotIn.indexOf(BACK_STEP[dir]) >= 0) return false;
    return true;
  }

  /**
   * 找一条从 (startX,startY) 到「满足 isGoal 的格子」的方向序列。
   * options: { blockAt(x,y) -> block, keyTuple() -> [yellow,blue,red], startX, startY, isGoal(x,y) }
   * 返回 ['up','left',...]，找不到返回 null。
   */
  function findRoute(options) {
    const opts = options || {};
    const blockAt = opts.blockAt;
    const keyOf = (x, y, keys) => x + ',' + y + ',' + keys.join(',');
    const startKeys = (opts.keyTuple ? opts.keyTuple() : [0, 0, 0]).map((n) => Math.min(KEY_CAP, Math.max(0, Number(n) || 0)));
    const startX = opts.startX;
    const startY = opts.startY;
    const isGoal = opts.isGoal;
    if (typeof blockAt !== 'function' || typeof isGoal !== 'function') return null;

    const startKey = keyOf(startX, startY, startKeys);
    const best = new Map([[startKey, 0]]);
    const from = new Map();
    const open = [{ cost: 0, x: startX, y: startY, keys: startKeys }];
    const closed = new Set();
    let guard = 0;
    while (open.length && guard < GUARD) {
      guard += 1;
      let pick = 0;
      for (let i = 1; i < open.length; i += 1) if (open[i].cost < open[pick].cost) pick = i;
      const node = open.splice(pick, 1)[0];
      const nodeKey = keyOf(node.x, node.y, node.keys);
      if (closed.has(nodeKey)) continue;
      closed.add(nodeKey);
      if ((node.x !== startX || node.y !== startY) && isGoal(node.x, node.y)) {
        const route = [];
        let cursor = nodeKey;
        while (from.has(cursor)) {
          const hop = from.get(cursor);
          route.unshift(hop.dir);
          cursor = hop.key;
        }
        return route;
      }
      for (const [dx, dy, dir] of WALK_STEPS) {
        const nx = node.x + dx;
        const ny = node.y + dy;
        if (nx < 0 || ny < 0 || nx > 12 || ny > 12) continue;
        const nextBlock = blockAt(nx, ny);
        if (!nextBlock) continue;
        const nextTile = nextBlock.tile || {};
        if (nextBlock.enemy) continue;
        if (nextBlock.n && nextTile.noPass && !doorOpenable(nextTile, node.keys)) continue;
        // 楼梯只当终点：路过楼梯等于换层，不能顺手走上去
        if (isStairTile(nextTile) && !isGoal(nx, ny)) continue;
        if (!stepAllowed(blockAt, node.x, node.y, dir, dx, dy)) continue;
        const nextKeys = keysAfter(nextTile, node.keys);
        const nextKey = keyOf(nx, ny, nextKeys);
        if (closed.has(nextKey)) continue;
        let cost = node.cost + enterCost(nextTile);
        if (doorOpenable(nextTile, node.keys)) cost += DOOR_COST;
        if (best.has(nextKey) && best.get(nextKey) <= cost) continue;
        best.set(nextKey, cost);
        from.set(nextKey, { key: nodeKey, dir });
        open.push({ cost, x: nx, y: ny, keys: nextKeys });
      }
    }
    return null;
  }

  return {
    WALK_STEPS,
    BACK_STEP,
    TRAP_COST,
    DOOR_COST,
    KEY_NAMES,
    KEY_CAP,
    isStairTile,
    doorOpenable,
    keysAfter,
    standable,
    enterCost,
    stepAllowed,
    findRoute
  };
});
