'use strict';

// games/mota 自动寻路（route.js）的回归测试，全部用真实地图数据：
//   1) 去某处楼梯的路线，绝不能用别的楼梯当跳板（旧 bug：点「下楼」被顺路带上楼）；
//   2) 没有钥匙时不会规划穿过锁着的门，钥匙够才走；
//   3) 怪物格永远不会出现在路线里；
//   4) 陷阱（熔岩/中毒/衰弱/诅咒之网）能绕就绕。
// 运行：node --test games/mota/tests/route.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');

const Route = require('../route.js');
const Data = require('../data.js');

const TILES = Data.tiles.tiles;
const FLOORS = Data.floors.floors;
const FLOOR_IDS = Data.floors.floorIds;

// 和 engine.blockAt 一样的数据形状：{ n, tile, enemy }
function blockAtFor(floorId) {
  const floor = FLOORS[floorId];
  return (x, y) => {
    if (x < 0 || y < 0 || x > 12 || y > 12) return null;
    const n = floor.map[y][x];
    const tile = TILES[n] || {};
    return { n, tile, enemy: tile.kind === 'enemy' ? { id: tile.id } : null, floorId };
  };
}

function tileAt(floorId, x, y) {
  const floor = FLOORS[floorId];
  return TILES[floor.map[y][x]] || {};
}

// 把方向序列还原成坐标序列
function traceRoute(startX, startY, route) {
  const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const cells = [{ x: startX, y: startY }];
  let x = startX;
  let y = startY;
  for (const dir of route) {
    x += DELTA[dir][0];
    y += DELTA[dir][1];
    cells.push({ x, y });
  }
  return cells;
}

// 站得住、且不是敌人的中继格
function neighborsOf(floorId, x, y) {
  return [[0, 1], [0, -1], [1, 0], [-1, 0]]
    .map(([dx, dy]) => ({ x: x + dx, y: y + dy, dx, dy }))
    .filter(({ x: nx, y: ny }) => {
      if (nx < 0 || ny < 0 || nx > 12 || ny > 12) return false;
      const tile = tileAt(floorId, nx, ny);
      return tile && !tile.noPass && !['enemy', 'door', 'wall', 'npc', 'item', 'stair'].includes(tile.kind);
    });
}

test('去楼梯的路线不会把别的楼梯当跳板（MT8：上楼就在旁边，下楼要绕）', () => {
  const blockAt = blockAtFor('MT8');
  // MT8：上楼在 (6,1)，下楼在 (1,1)；勇者站在 (6,2)，手里一把黄钥匙
  const route = Route.findRoute({
    blockAt,
    keyTuple: () => [1, 0, 0],
    startX: 6,
    startY: 2,
    isGoal: (x, y) => x === 1 && y === 1
  });
  assert.ok(Array.isArray(route) && route.length > 0, '应该能找到去 (1,1) 下楼的路线');
  const cells = traceRoute(6, 2, route);
  for (const cell of cells.slice(0, -1)) {
    const tile = tileAt('MT8', cell.x, cell.y);
    assert.ok(!Route.isStairTile(tile), `路线路过楼梯 (${cell.x},${cell.y}) ${tile.id}，会提前换层`);
  }
  const last = cells[cells.length - 1];
  assert.deepEqual([last.x, last.y], [1, 1], '路线终点应该是 (1,1) 下楼');
});

test('所有楼层：去某处楼梯的路线都不经过其他楼梯', () => {
  const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const fails = [];
  let checked = 0;
  for (const id of FLOOR_IDS) {
    const floor = FLOORS[id];
    const stairs = Object.keys(floor.stairs || {});
    if (stairs.length < 2) continue;
    for (const coord of stairs) {
      const [tx, ty] = coord.split(',').map(Number);
      for (const start of Object.keys(floor.stairs || {})) {
        const [sx, sy] = start.split(',').map(Number);
        const spots = neighborsOf(id, sx, sy);
        if (!spots.length) continue;
        // 起点就在另一个楼梯旁边：这时它不该是目标
        for (const sp of spots) {
          if (sp.x === tx && sp.y === ty) continue;
          for (const keys of [[0, 0, 0], [1, 1, 1], [3, 3, 3]]) {
            const route = Route.findRoute({
              blockAt: blockAtFor(id),
              keyTuple: () => keys,
              startX: sp.x,
              startY: sp.y,
              isGoal: (x, y) => x === tx && y === ty
            });
            checked += 1;
            if (!route) continue;
            let x = sp.x;
            let y = sp.y;
            for (const dir of route.slice(0, -1)) {
              x += DELTA[dir][0];
              y += DELTA[dir][1];
              const tile = tileAt(id, x, y);
              if (Route.isStairTile(tile)) fails.push(`${id} 去 (${tx},${ty}) 的路线路过楼梯 (${x},${y}) ${tile.id}`);
            }
            const lastDir = route[route.length - 1];
            const endX = x + DELTA[lastDir][0];
            const endY = y + DELTA[lastDir][1];
            if (endX !== tx || endY !== ty) fails.push(`${id} 去 (${tx},${ty}) 的路线终点是 (${endX},${endY})`);
          }
        }
      }
    }
  }
  assert.ok(checked > 20, `至少应该检查二十多条路线，实际 ${checked}`);
  assert.deepEqual(fails, [], fails.slice(0, 8).join('\n'));
});

test('没有钥匙就不规划穿门：用一张小手绘地图验证', () => {
  // 一条竖直走廊：(6,11) 起点 → (6,10) 空地 → (6,9) 黄门 → (6,8) 空地
  const WALL = { kind: 'wall', noPass: true };
  const FLOOR = { kind: 'floor', noPass: false };
  const DOOR = { kind: 'door', noPass: true, keys: { yellowKey: 1 } };
  const grid = new Map();
  for (let y = 0; y < 13; y += 1) for (let x = 0; x < 13; x += 1) grid.set(`${x},${y}`, WALL);
  grid.set('6,11', FLOOR);
  grid.set('6,10', FLOOR);
  grid.set('6,9', DOOR);
  grid.set('6,8', FLOOR);
  const blockAt = (x, y) => {
    const tile = grid.get(`${x},${y}`);
    if (!tile) return null;
    return { n: tile === WALL ? 1 : 2, tile, enemy: null };
  };
  const goal = (x, y) => x === 6 && y === 8;

  const without = Route.findRoute({ blockAt, keyTuple: () => [0, 0, 0], startX: 6, startY: 11, isGoal: goal });
  assert.equal(without, null, '没有黄钥匙时不该规划穿门路线');

  const withKey = Route.findRoute({ blockAt, keyTuple: () => [1, 0, 0], startX: 6, startY: 11, isGoal: goal });
  assert.deepEqual(withKey, ['up', 'up', 'up'], '有钥匙时应该一步不差地穿过黄门（11 → 10 → 门 9 → 8）');
});

test('路上能捡到钥匙时会先捡钥匙再开门（MT1：黄门旁边就是黄钥匙）', () => {
  const blockAt = blockAtFor('MT1');
  const goal = { x: 6, y: 8 };
  const route = Route.findRoute({
    blockAt,
    keyTuple: () => [0, 0, 0],
    startX: 6,
    startY: 11,
    isGoal: (x, y) => x === goal.x && y === goal.y
  });
  assert.ok(Array.isArray(route) && route.length > 0, '应该能绕去捡钥匙再开门');
  const cells = traceRoute(6, 11, route);
  assert.deepEqual([cells[cells.length - 1].x, cells[cells.length - 1].y], [goal.x, goal.y]);
  const keyIndex = cells.findIndex(c => tileAt('MT1', c.x, c.y).id === 'yellowKey');
  const doorIndex = cells.findIndex(c => tileAt('MT1', c.x, c.y).id === 'yellowDoor');
  assert.ok(keyIndex > 0, '路线里应该先捡到黄钥匙');
  assert.ok(doorIndex > keyIndex, '捡到钥匙之后才能过黄门');
});

test('怪物格永远不进路线，陷阱能绕就绕', () => {
  // 先在几层里找「有怪物 + 有陷阱」的楼层做检查
  let checked = 0;
  for (const id of FLOOR_IDS) {
    const floor = FLOORS[id];
    const blockAt = blockAtFor(id);
    const stairs = Object.entries(floor.stairs || {});
    if (stairs.length < 2) continue;
    const [[startCoord], [targetCoord]] = stairs;
    const [sx, sy] = startCoord.split(',').map(Number);
    const [tx, ty] = targetCoord.split(',').map(Number);
    // 从目标附近找一块空地作为起点，往 (sx,sy) 反着走，只为覆盖更多路线
    const spot = neighborsOf(id, sx, sy)[0] || neighborsOf(id, tx, ty)[0];
    if (!spot) continue;
    const route = Route.findRoute({
      blockAt,
      keyTuple: () => [3, 3, 3],
      startX: spot.x,
      startY: spot.y,
      isGoal: (x, y) => x === tx && y === ty
    });
    if (!route) continue;
    checked += 1;
    for (const cell of traceRoute(spot.x, spot.y, route)) {
      if (cell.x === spot.x && cell.y === spot.y) continue;
      const tile = tileAt(id, cell.x, cell.y);
      assert.notEqual(tile.kind, 'enemy', `${id} 的路线不该穿过怪物 (${cell.x},${cell.y}) ${tile.id}`);
    }
  }
  assert.ok(checked > 0, '至少应该跑到一条路线');
});
