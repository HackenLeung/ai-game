'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const match = require('../match.js');

const SAFE13 = [0, 4, 8, 9, 13, 17, 18, 22, 26, 28, 29, 30, 31];

test('开局：庄家 14 张，其余 13 张，牌墙 83 张', () => {
  const state = match.createGame({ dealer: 2, human: -1 });
  assert.equal(state.hands[0].length, 13);
  assert.equal(state.hands[1].length, 13);
  assert.equal(state.hands[2].length, 14);
  assert.equal(state.hands[3].length, 13);
  assert.equal(state.wall.length, 136 - 53);
  assert.equal(state.turn, 2);
  assert.equal(state.phase, 'discard');
  assert.ok(state.lastDraw != null);
  assert.equal(state.hands[2][state.lastDrawIndex], state.lastDraw);
});

test('胡牌判断：四组一对可以自摸，散牌不行', () => {
  const state = match.createGame({ dealer: 0, human: -1 });
  state.hands[0] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 10, 10];
  state.turn = 0;
  state.phase = 'discard';
  state.lastDraw = 10;
  assert.equal(match.canSelfWin(state), true);

  state.hands[0] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  state.lastDraw = 13;
  assert.equal(match.canSelfWin(state), false);
});

test('有碰和杠的副露也能判断胡牌', () => {
  const state = match.createGame({ dealer: 0, human: -1 });
  state.melds[0] = [{ type: 'peng', tiles: [0, 0, 0] }];
  state.hands[0] = [1, 2, 3, 4, 5, 6, 9, 9, 9, 10, 10];
  state.turn = 0;
  state.phase = 'discard';
  state.lastDraw = 10;
  assert.equal(match.canSelfWin(state), true);

  state.melds[0] = [{ type: 'kong', tiles: [0, 0, 0, 0] }];
  assert.equal(match.canSelfWin(state), true);
});

test('打牌后可以碰：AI 自动碰，手牌少两张并亮出刻子', () => {
  const state = match.createGame({ dealer: 0, human: -1 });
  state.hands[0] = [27, 0, 4, 8, 9, 13, 17, 18, 22, 26, 28, 29, 30, 31];
  state.hands[1] = [27, 27, 0, 4, 8, 9, 13, 17, 18, 22, 26, 31, 32];
  state.hands[2] = SAFE13.slice();
  state.hands[3] = [1, 5, 10, 14, 19, 23, 28, 29, 30, 31, 32, 33, 2];
  state.turn = 0;
  state.phase = 'discard';
  state.lastDraw = 31;

  const index = state.hands[0].indexOf(27);
  assert.equal(match.discard(state, index), true);
  assert.equal(state.turn, 1);
  assert.equal(state.phase, 'discard');
  assert.equal(state.melds[1].length, 1);
  assert.equal(state.melds[1][0].type, 'peng');
  assert.deepEqual(state.melds[1][0].tiles, [27, 27, 27]);
  assert.equal(state.hands[1].length, 11);
  assert.equal(state.discards[0].length, 0, '被碰走的牌不再留在弃牌堆里');
});

test('只有下家可以吃，吃后手牌少两张', () => {
  const state = match.createGame({ dealer: 0, human: -1 });
  state.hands[0] = [0, 4, 8, 9, 13, 17, 18, 22, 26, 27, 28, 29, 30, 31];
  state.hands[1] = [1, 2, 4, 8, 9, 13, 17, 18, 22, 26, 28, 29, 30];
  state.hands[2] = [3, 5, 10, 14, 19, 23, 31, 32, 33, 6, 11, 15, 20];
  state.hands[3] = [7, 12, 16, 21, 24, 25, 27, 28, 29, 30, 31, 32, 33];
  state.turn = 0;
  state.phase = 'discard';
  state.lastDraw = 31;

  const index = state.hands[0].indexOf(0);
  assert.equal(match.discard(state, index), true);
  assert.equal(state.turn, 1);
  assert.equal(state.melds[1].length, 1);
  assert.equal(state.melds[1][0].type, 'chi');
  assert.deepEqual(state.melds[1][0].tiles, [0, 1, 2]);
  assert.equal(state.hands[1].length, 11);
});

test('暗杠：三家各付 2 个筹码，杠后补一张', () => {
  const state = match.createGame({ dealer: 0, human: -1 });
  state.hands[0] = [27, 27, 27, 27, 0, 4, 8, 9, 13, 17, 18, 22, 26, 31];
  state.turn = 0;
  state.phase = 'discard';
  state.lastDraw = 31;
  const options = match.selfKongOptions(state);
  const kong = options.find((option) => option.type === 'concealed' && option.tile === 27);
  assert.ok(kong);
  assert.equal(match.applySelfKong(state, kong), true);
  assert.deepEqual(state.chips, [6, -2, -2, -2]);
  assert.equal(state.chips.reduce((a, b) => a + b, 0), 0);
  assert.equal(state.melds[0][0].type, 'kong');
  assert.equal(state.melds[0][0].concealed, true);
  assert.equal(state.hands[0].length, 11);
});

test('出铳胡牌：放炮那家付 2 个筹码', () => {
  const state = match.createGame({ dealer: 0, human: -1 });
  state.hands[0] = [8, 4, 0, 1, 2, 3, 5, 6, 7, 9, 10, 11, 12, 13];
  state.hands[1] = [0, 1, 2, 3, 4, 5, 6, 7, 9, 9, 9, 10, 10];
  state.hands[2] = SAFE13.slice();
  state.hands[3] = [1, 5, 10, 14, 19, 23, 28, 29, 30, 31, 32, 33, 2];
  state.turn = 0;
  state.phase = 'discard';
  state.lastDraw = 8;

  const index = state.hands[0].indexOf(8);
  assert.equal(match.discard(state, index), true);
  assert.equal(state.phase, 'over');
  assert.equal(state.winner, 1);
  assert.equal(state.winInfo.selfDraw, false);
  assert.equal(state.winInfo.discarder, 0);
  assert.deepEqual(state.chips, [-2, 2, 0, 0]);
});

test('自摸胡牌：三家各付 2 个筹码', () => {
  const state = match.createGame({ dealer: 0, human: -1 });
  state.hands[0] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 10, 10];
  state.turn = 0;
  state.phase = 'discard';
  state.lastDraw = 10;
  assert.equal(match.declareSelfWin(state), true);
  assert.equal(state.phase, 'over');
  assert.equal(state.winner, 0);
  assert.equal(state.winInfo.selfDraw, true);
  assert.deepEqual(state.chips, [6, -2, -2, -2]);
});

test('加杠：三家各付 1 个筹码，杠后补一张', () => {
  const state = match.createGame({ dealer: 0, human: -1 });
  state.hands[0] = [27, 0, 4, 8, 9, 13, 17, 18, 22, 26, 31];
  state.melds[0] = [{ type: 'pong', tiles: [27, 27, 27], from: 1 }];
  state.turn = 0;
  state.phase = 'discard';
  state.lastDraw = 31;
  const options = match.selfKongOptions(state);
  const kong = options.find((option) => option.type === 'added' && option.tile === 27);
  assert.ok(kong);
  assert.equal(match.applySelfKong(state, kong), true);
  assert.deepEqual(state.chips, [3, -1, -1, -1]);
  assert.equal(state.melds[0][0].type, 'kong');
  assert.equal(state.melds[0][0].tiles.length, 4);
  assert.equal(state.chips.reduce((a, b) => a + b, 0), 0);
});

test('人可以碰、吃、过，操作后轮到自己出牌', () => {
  const pengState = match.createGame({ dealer: 1, human: 0 });
  pengState.hands[0] = [27, 27].concat(SAFE13.slice(0, 11));
  pengState.hands[1] = [27, 0, 4, 8, 9, 13, 17, 18, 22, 26, 28, 29, 30, 31];
  pengState.hands[2] = [1, 5, 10, 14, 19, 23, 28, 29, 30, 31, 32, 33, 2];
  pengState.hands[3] = [2, 6, 11, 15, 20, 24, 27, 28, 29, 30, 31, 32, 3];
  pengState.turn = 1;
  pengState.phase = 'discard';
  pengState.lastDraw = 31;
  match.discard(pengState, pengState.hands[1].indexOf(27));
  assert.equal(pengState.phase, 'claim-human');
  assert.ok(pengState.pending.some((claim) => claim.type === 'peng'));
  assert.equal(match.humanClaim(pengState, 'peng'), true);
  assert.equal(pengState.turn, 0);
  assert.equal(pengState.phase, 'discard');
  assert.equal(pengState.melds[0][0].type, 'peng');
  assert.equal(pengState.hands[0].length, 11);

  const chiState = match.createGame({ dealer: 3, human: 0 });
  chiState.hands[3] = [0, 4, 8, 9, 13, 17, 18, 22, 26, 27, 28, 29, 30, 31];
  chiState.hands[0] = [1, 2].concat([4, 8, 9, 13, 17, 18, 22, 26, 28, 29, 30]);
  chiState.hands[1] = [3, 5, 10, 14, 19, 23, 31, 32, 33, 6, 11, 15, 20];
  chiState.hands[2] = [7, 12, 16, 21, 24, 25, 27, 28, 29, 30, 31, 32, 33];
  chiState.turn = 3;
  chiState.phase = 'discard';
  chiState.lastDraw = 31;
  match.discard(chiState, chiState.hands[3].indexOf(0));
  assert.equal(chiState.phase, 'claim-human');
  assert.ok(chiState.pending.some((claim) => claim.type === 'chi'));
  assert.equal(match.humanClaim(chiState, 'chi', [0, 1, 2]), true);
  assert.equal(chiState.melds[0][0].type, 'chi');
  assert.deepEqual(chiState.melds[0][0].tiles, [0, 1, 2]);
  assert.equal(chiState.discards[3].length, 0, '被吃走的牌不再留在弃牌堆里');

  const passState = match.createGame({ dealer: 3, human: 0 });
  passState.hands[3] = [0, 4, 8, 9, 13, 17, 18, 22, 26, 27, 28, 29, 30, 31];
  passState.hands[0] = [1, 2].concat([4, 8, 9, 13, 17, 18, 22, 26, 28, 29, 30]);
  passState.hands[1] = [3, 5, 10, 14, 19, 23, 31, 32, 33, 6, 11, 15, 20];
  passState.hands[2] = [7, 12, 16, 21, 24, 25, 27, 28, 29, 30, 31, 32, 33];
  passState.turn = 3;
  passState.phase = 'discard';
  passState.lastDraw = 31;
  match.discard(passState, passState.hands[3].indexOf(0));
  assert.equal(passState.phase, 'claim-human');
  assert.equal(match.humanPass(passState), true);
  assert.equal(passState.turn, 0);
  assert.equal(passState.phase, 'discard');
  assert.equal(passState.hands[0].length, 14);
});

test('AI 自动对局能正常结束，筹码守恒', () => {
  for (let game = 0; game < 4; game++) {
    const state = match.createGame({ dealer: game % 4, human: -1 });
    let steps = 0;
    while (state.phase !== 'over' && steps < 1200) {
      steps++;
      if (state.phase === 'claim-human') {
        match.humanPass(state);
        continue;
      }
      assert.equal(state.phase, 'discard');
      if (match.canSelfWin(state)) {
        match.declareSelfWin(state);
        break;
      }
      const kong = match.aiKong(state);
      if (kong) {
        match.applySelfKong(state, kong);
        continue;
      }
      const before = state.hands[state.turn].length;
      const index = match.chooseDiscardIndex(state);
      assert.ok(index >= 0 && index < before);
      match.discard(state, index);
    }
    assert.equal(state.phase, 'over', '第 ' + game + ' 局应在步数内结束');
    assert.equal(state.chips.reduce((a, b) => a + b, 0), 0);
    assert.ok(state.winner === null || (state.winner >= 0 && state.winner < 4));
    assert.ok(state.log.length > 0);
  }
});

test('牌墙摸完流局', () => {
  const state = match.createGame({ dealer: 0, human: -1 });
  state.wall = [];
  state.hands[0] = [33, 0, 4, 8, 9, 13, 17, 18, 22, 26, 28, 29, 30, 31];
  state.hands[1] = SAFE13.slice();
  state.hands[2] = [1, 5, 10, 14, 19, 23, 27, 28, 29, 30, 31, 32, 2];
  state.hands[3] = [2, 6, 11, 15, 20, 24, 27, 28, 29, 30, 31, 32, 3];
  state.turn = 0;
  state.phase = 'discard';
  state.lastDraw = 33;

  assert.equal(match.discard(state, state.hands[0].indexOf(33)), true);
  assert.equal(state.phase, 'over');
  assert.equal(state.winner, null);
  assert.equal(state.winInfo.draw, true);
});
