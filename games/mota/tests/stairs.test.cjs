'use strict';

// games/mota 楼梯回归测试：
//   1) 每层「上楼」图标必须通往更高层，「下楼」图标必须通往更低层（图标与目的地不能对不上）；
//   2) 真的踩上去，落点必须等于 floor.stairs[coord].to（不能多上一格、少上一格）；
//   3) 楼梯只该出现在 stairs 表里登记过的坐标上。
// 运行：node --test games/mota/tests/stairs.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');

const Engine = require('../engine.js');
const Data = require('../data.js');

const TILES = Data.tiles.tiles;
const FLOORS = Data.floors.floors;
const FLOOR_IDS = Data.floors.floorIds;
const floorIndex = id => FLOOR_IDS.indexOf(id);

function makeUi() {
  return {
    async say() { },
    async choose() { return 0; },
    tip() { },
    update() { },
    async battle() { },
    async win() { },
    sound() { }
  };
}

async function freshGame() {
  const game = Engine.create({ saveKey: 'mota-stairs-test', storage: null, ui: makeUi() });
  await game.start();
  return game;
}

// 收集所有楼梯：{ floorId, x, y, tileId, to }
function allStairs() {
  const out = [];
  for (const id of FLOOR_IDS) {
    const floor = FLOORS[id];
    for (const [coord, info] of Object.entries(floor.stairs || {})) {
      const [x, y] = coord.split(',').map(Number);
      const tile = TILES[floor.map[y][x]] || {};
      out.push({ floorId: id, x, y, coord, tileId: tile.id, to: info.to });
    }
  }
  return out;
}

const STAIRS = allStairs();

test('楼梯都登记在 stairs 表里，且地图上的图标与数据一一对应', () => {
  assert.ok(STAIRS.length >= 90, `楼梯数量应该接近 100，实际 ${STAIRS.length}`);
  for (const id of FLOOR_IDS) {
    const floor = FLOORS[id];
    const registered = new Set(Object.keys(floor.stairs || {}));
    for (let y = 0; y < floor.height; y += 1) {
      for (let x = 0; x < floor.width; x += 1) {
        const tile = TILES[floor.map[y][x]] || {};
        if (!/^(up|down)Floor$/.test(tile.id || '')) continue;
        assert.ok(registered.has(`${x},${y}`), `${id} (${x},${y}) 的 ${tile.id} 没有登记在 stairs 表里`);
      }
    }
  }
});

test('上楼图标的落点一定更高，下楼图标的落点一定更低', () => {
  for (const stair of STAIRS) {
    const from = floorIndex(stair.floorId);
    const to = floorIndex(stair.to);
    assert.ok(to >= 0, `${stair.floorId} 的 ${stair.coord} 指向了不存在的楼层 ${stair.to}`);
    if (stair.tileId === 'upFloor') {
      assert.ok(to > from, `${stair.floorId}(${stair.coord}) 画的是上楼，却通向 ${stair.to}`);
    } else {
      assert.ok(to < from, `${stair.floorId}(${stair.coord}) 画的是下楼，却通向 ${stair.to}`);
    }
  }
});

test('每一处楼梯踩上去都落在 stairs 表写的楼层', async () => {
  const game = await freshGame();
  const fails = [];
  for (const stair of STAIRS) {
    const floor = FLOORS[stair.floorId];
    // 找一个能站人的邻居，然后朝楼梯迈一步
    const candidates = [[0, 1], [0, -1], [1, 0], [-1, 0]]
      .map(([dx, dy]) => ({ x: stair.x + dx, y: stair.y + dy, dx, dy }))
      .filter(({ x, y }) => {
        if (x < 0 || y < 0 || x > 12 || y > 12) return false;
        const tile = TILES[floor.map[y][x]] || {};
        return tile && !tile.noPass && !['enemy', 'door', 'wall', 'npc', 'item', 'stair'].includes(tile.kind);
      });
    if (!candidates.length) continue;
    const spot = candidates[0];
    await game.changeFloorById(stair.floorId, [spot.x, spot.y]);
    game.state.hero.loc.x = spot.x;
    game.state.hero.loc.y = spot.y;
    await game.move(-spot.dx, -spot.dy);
    if (game.state.floorId !== stair.to) {
      fails.push(`${stair.floorId} 踩 ${stair.tileId}(${stair.x},${stair.y}) → ${game.state.floorId}，期望 ${stair.to}`);
    }
    await game.changeFloorById(stair.floorId, [spot.x, spot.y]);
  }
  assert.deepEqual(fails, [], fails.join('\n'));
});
