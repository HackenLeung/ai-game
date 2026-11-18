'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../rules.js');

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// 手动摆一个已知雷区，便于验证翻开、插旗和快速展开。
function manual(rows, cols, mineIndexes) {
  const game = rules.createGame({ rows, cols, mines: mineIndexes.length });
  game.cells.forEach(cell => { cell.mine = false; cell.adjacent = 0; });
  for (const index of mineIndexes) game.cells[index].mine = true;
  game.cells.forEach((cell, index) => {
    if (!cell.mine) cell.adjacent = rules.neighbors(game, index).filter(near => game.cells[near].mine).length;
  });
  game.seeded = true;
  game.status = 'playing';
  return game;
}

test('三档预设与自定义尺寸都有合法雷数', () => {
  assert.deepEqual(rules.PRESETS.map(item => item.id), ['beginner', 'intermediate', 'expert']);
  for (const item of rules.PRESETS) {
    const game = rules.createGame(item);
    assert.equal(game.cells.length, item.rows * item.cols);
    assert.equal(game.status, 'ready');
  }
  assert.throws(() => rules.normalizeConfig({ rows: 4, cols: 9, mines: 10 }), /行数/);
  assert.throws(() => rules.normalizeConfig({ rows: 9, cols: 41, mines: 10 }), /列数/);
  assert.throws(() => rules.normalizeConfig({ rows: 9, cols: 9, mines: 0 }), /雷数/);
  assert.throws(() => rules.normalizeConfig({ rows: 9, cols: 9, mines: 73 }), /雷数/);
  assert.equal(rules.maxMines(9, 9), 72);
  assert.equal(rules.normalizeConfig({ rows: 9, cols: 9, mines: 72 }).mines, 72);
});

test('首次点击的九宫格内没有雷，且点击格必定是空地', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const game = rules.createGame({ rows: 9, cols: 9, mines: 10 });
    const safe = (seed * 17) % 81;
    rules.seed(game, safe, seededRandom(seed));
    assert.equal(game.cells[safe].mine, false);
    assert.equal(game.cells[safe].adjacent, 0, `seed ${seed} 首点应为零空地`);
    for (const near of rules.neighbors(game, safe)) assert.equal(game.cells[near].mine, false);
    assert.equal(game.cells.filter(cell => cell.mine).length, 10);
  }
});

test('翻开空地会连锁展开，已插旗的格子保持关闭', () => {
  const game = manual(6, 6, [0, 1, 2, 3, 4, 5]);
  assert.equal(rules.toggleFlag(game, 20), true);
  const result = rules.reveal(game, 35);
  assert.equal(result.hit, false);
  assert.equal(game.status, 'playing');
  assert.equal(game.cells[35].revealed, true);
  assert.equal(game.cells[20].revealed, false, '旗子不会被连锁翻开');
  assert.equal(game.opened, 29);
  assert.equal(game.flags, 1);
});

test('踩雷后标出所有地雷，游戏只结算一次', () => {
  const game = manual(5, 5, [0, 24]);
  const result = rules.reveal(game, 0);
  assert.equal(result.hit, 0);
  assert.equal(game.status, 'lost');
  assert.equal(game.exploded, 0);
  assert.equal(game.cells[24].revealed, true);
  assert.equal(rules.reveal(game, 12).changed.length, 0);
});

test('插旗数量不超过雷数，可以取消', () => {
  const game = rules.createGame({ rows: 5, cols: 5, mines: 1 });
  assert.equal(rules.toggleFlag(game, 3), true);
  assert.equal(rules.toggleFlag(game, 4), false);
  assert.equal(game.flags, 1);
  assert.equal(rules.remainingMines(game), 0);
  assert.equal(rules.toggleFlag(game, 3), true);
  assert.equal(game.flags, 0);
  assert.equal(rules.toggleFlag(game, 3), true);
  assert.equal(rules.reveal(game, 3).changed.length, 0, '插旗格不会被打开');
});

test('数字周围旗数正确时可以快速展开，旗子错位会踩雷', () => {
  const checker = (size) => {
    const mines = [];
    for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) if ((row + col) % 2 === 0) mines.push(row * size + col);
    return mines;
  };
  const good = manual(6, 6, checker(6));
  for (const index of [0, 2, 7]) assert.equal(rules.toggleFlag(good, index), true);
  rules.reveal(good, 1);
  assert.equal(good.cells[1].adjacent, 3);
  const opened = rules.chord(good, 1);
  assert.equal(opened.matched, true);
  assert.equal(opened.hit, false);
  assert.deepEqual(opened.changed.sort((a, b) => a - b), [6, 8]);
  assert.equal(good.status, 'playing');
  assert.equal(good.cells[6].revealed, true);

  const bad = manual(6, 6, checker(6));
  for (const index of [0, 2, 6]) assert.equal(rules.toggleFlag(bad, index), true);
  rules.reveal(bad, 1);
  const hit = rules.chord(bad, 1);
  assert.equal(hit.matched, true);
  assert.equal(hit.hit, 7);
  assert.equal(bad.status, 'lost');

  const wrongCount = manual(6, 6, checker(6));
  rules.toggleFlag(wrongCount, 0);
  rules.reveal(wrongCount, 1);
  assert.deepEqual(rules.chord(wrongCount, 1), { changed: [], hit: false, matched: false });
});

test('翻开全部安全格即胜利，剩余地雷自动插旗', () => {
  const game = manual(5, 5, [0]);
  const result = rules.reveal(game, 24);
  assert.equal(game.status, 'won');
  assert.equal(game.opened, 24);
  assert.equal(game.cells[0].flagged, true);
  assert.equal(rules.remainingMines(game), 0);
  assert.ok(result.changed.includes(0));
  assert.equal(rules.metrics(game).progress, 1);
});

test('存档能恢复进行中的棋盘，并拒绝被篡改的数据', () => {
  const mines = [];
  for (let row = 0; row < 6; row++) for (let col = 0; col < 6; col++) if ((row + col) % 2 === 0) mines.push(row * 6 + col);
  const game = manual(6, 6, mines);
  rules.reveal(game, 1);
  rules.toggleFlag(game, 0);
  assert.equal(game.status, 'playing');
  const restored = rules.deserialize(rules.serialize(game));
  assert.ok(restored);
  assert.equal(restored.status, 'playing');
  assert.equal(restored.opened, 1);
  assert.equal(restored.flags, 1);
  assert.equal(restored.cells[0].flagged, true);
  assert.equal(restored.cells[0].mine, true);
  assert.equal(restored.cells[1].adjacent, game.cells[1].adjacent);

  const raw = rules.serialize(game);
  assert.equal(rules.deserialize({ ...raw, v: 99 }), null);
  assert.equal(rules.deserialize({ ...raw, cells: raw.cells.slice(0, 5) }), null);
  assert.equal(rules.deserialize({ ...raw, status: 'unknown' }), null);
  assert.equal(rules.deserialize({ ...raw, cells: raw.cells.map((code, index) => index === 1 ? '0910' : code) }), null);
  const tampered = rules.serialize(game);
  tampered.cells[1] = '0210';
  assert.equal(rules.deserialize(tampered), null, '相邻雷数必须与雷区一致');
});

test('刷新后可以继续未完成的对局', () => {
  const game = rules.createGame(rules.PRESETS[0]);
  rules.seed(game, 40, seededRandom(7));
  game.status = 'playing';
  rules.reveal(game, 40);
  const restored = rules.deserialize(rules.serialize(game));
  assert.ok(restored);
  assert.equal(restored.seeded, true);
  assert.equal(restored.rows, 9);
  assert.equal(restored.opened, game.opened);
});

test('开局先插旗也能保存，刷新后保留旗帜', () => {
  const game = rules.createGame({ rows: 5, cols: 5, mines: 1 });
  assert.equal(rules.toggleFlag(game, 12), true);
  const restored = rules.deserialize(rules.serialize(game));
  assert.ok(restored);
  assert.equal(restored.status, 'ready');
  assert.equal(restored.flags, 1);
  assert.equal(restored.cells[12].flagged, true);
  assert.equal(restored.seeded, false);
});
