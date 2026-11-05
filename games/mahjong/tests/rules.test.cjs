'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../rules.js');

const M = (n) => n - 1;          // 一万..九万
const P = (n) => 8 + n;          // 一筒..九筒
const S = (n) => 17 + n;         // 一索..九索
const E = 27, So = 28, W = 29, N = 30, Red = 31, Green = 32, White = 33;

const baseFlags = {
  selfDraw: false, closed: false, kongBloom: false, lastTile: false, robbing: false,
  heaven: false, earth: false, dealer: false, ownFlowerFan: false,
  roundWind: 0, seatWind: 0, flowers: 0, ownFlowers: 0, ghostId: -1
};
const flags = (extra) => Object.assign({}, baseFlags, extra || {});

test('四组一对可以胡，散牌不能胡', () => {
  assert.equal(rules.isWin14([M(1), M(2), M(3), M(4), M(5), M(6), M(7), M(8), M(9), P(1), P(2), P(3), P(5), P(5)], -1), true);
  assert.equal(rules.isWin14([M(1), M(2), M(3), M(4), M(5), M(6), M(7), M(8), M(9), P(1), P(2), P(3), P(5), P(6)], -1), false);
});

test('七对与十三幺', () => {
  assert.equal(rules.isWin14([M(1), M(1), P(1), P(1), P(2), P(2), S(1), S(1), S(2), S(2), E, E, Red, Red], -1), true);
  assert.equal(rules.isWin14([M(1), M(9), P(1), P(9), S(1), S(9), E, So, W, N, Red, Green, White, M(1)], -1), true);
  assert.equal(rules.isWin14([M(1), M(9), P(1), P(9), S(1), S(9), E, So, W, N, Red, Green, White, M(2)], -1), false);
});

test('鬼牌可以补顺子和刻子', () => {
  // 123m 456m 789m 11p 2p + 红中 -> 红中补 3p
  assert.equal(rules.isWin14([M(1), M(2), M(3), M(4), M(5), M(6), M(7), M(8), M(9), P(1), P(1), P(2), Red, Red], Red), true);
  // 鬼牌补在顺子低位：7p 缺一张，用 8p 9p + 鬼补成 789p
  assert.equal(rules.isWin14([M(1), M(2), M(3), M(4), M(5), M(6), M(7), M(8), M(9), P(5), P(5), P(8), P(9), Red], Red), true);
  // 鬼牌补刻子：11m + 鬼，加 234m 567m 999p 与 55p 将
  assert.equal(rules.isWin14([M(1), M(1), M(2), M(3), M(4), M(5), M(6), M(7), P(9), P(9), P(9), P(5), P(5), Red], Red), true);
});

test('鬼牌不能做眼，也不能单独凑成一对', () => {
  // 123m 456m 789m 123p + 1s + 鬼：鬼只能补面子，不能当将
  assert.equal(rules.isWin14([M(1), M(2), M(3), M(4), M(5), M(6), M(7), M(8), M(9), P(1), P(2), P(3), S(1), Red], Red), false);
});

test('鬼牌规则下七对不成立', () => {
  assert.equal(rules.isWin14([M(1), M(1), P(1), P(1), P(2), P(2), S(1), S(1), S(2), S(2), E, E, Red, Red], Red), false);
});

test('听牌计算', () => {
  const waits = rules.waitsOf([M(1), M(2), M(3), M(4), M(5), M(6), M(7), M(8), M(9), P(1), P(1), S(1), S(2)], -1);
  assert.deepEqual(waits, [S(3)]);
  const wide = rules.waitsOf([M(1), M(1), M(1), M(2), M(3), M(4), M(5), M(6), M(7), M(8), M(9), P(1), P(1)], -1);
  assert.deepEqual(wide, [M(1), M(4), M(7), P(1)]);
});

test('清一色对对胡 = 9 番，平胡 = 1 番', () => {
  const pungs = rules.analyze([M(1), M(1), M(1), M(2), M(2), M(2), M(3), M(3), M(3), M(4), M(4), M(4), M(5), M(5)], flags());
  assert.equal(pungs.status, 'win');
  assert.equal(pungs.fan, 9);
  const names = pungs.patterns.map((p) => p.name);
  assert.ok(names.includes('清一色') && names.includes('对对胡'));

  const pinghu = rules.analyze([M(1), M(2), M(3), M(4), M(5), M(6), M(7), M(8), M(9), P(1), P(2), P(3), P(5), P(5)], flags());
  assert.equal(pinghu.fan, 1);
  assert.equal(pinghu.patterns[0].name, '平胡');
});

test('三元、四喜、字一色', () => {
  const big = rules.analyze([Red, Red, Red, Green, Green, Green, White, White, White, M(1), M(2), M(3), E, E], flags());
  assert.ok(big.patterns.some((p) => p.name === '大三元'));

  const small = rules.analyze([Red, Red, Red, Green, Green, Green, White, White, M(1), M(2), M(3), P(1), P(2), P(3)], flags());
  assert.ok(small.patterns.some((p) => p.name === '小三元'));

  const winds = rules.analyze([E, E, E, So, So, So, W, W, W, N, N, N, Red, Red], flags());
  assert.ok(winds.patterns.some((p) => p.name === '大四喜'));
  assert.ok(winds.patterns.some((p) => p.name === '字一色'));
});

test('情景番：自摸、门前清、花牌、番子', () => {
  const hand = [M(1), M(2), M(3), M(4), M(5), M(6), M(7), M(8), M(9), P(1), P(2), P(3), P(5), P(5)];
  const selfDraw = rules.analyze(hand, flags({ selfDraw: true, roundWind: 0, seatWind: 0 }));
  assert.ok(selfDraw.patterns.some((p) => p.name === '自摸'));

  const closed = rules.analyze(hand, flags({ closed: true }));
  assert.ok(closed.patterns.some((p) => p.name === '门前清'));

  const flowers = rules.analyze(hand, flags({ flowers: 2, ownFlowers: 1, ownFlowerFan: true }));
  assert.ok(flowers.patterns.some((p) => p.name === '花牌' && p.fan === 2));
  assert.ok(flowers.patterns.some((p) => p.name === '正花' && p.fan === 1));

  const windPung = rules.analyze([E, E, E, M(1), M(2), M(3), M(4), M(5), M(6), P(1), P(2), P(3), P(5), P(5)], flags({ roundWind: 0 }));
  assert.ok(windPung.patterns.some((p) => p.name === '番子（风）'));
});

test('十五张带杠也能算', () => {
  const hand = [M(1), M(1), M(1), M(1), M(2), M(3), M(4), M(5), M(6), M(7), P(9), P(9), P(9), P(5), P(5)];
  const result = rules.analyze(hand, flags({ roundWind: 3, seatWind: 3 }));
  assert.equal(result.status, 'win');
  assert.equal(result.kongId, M(1));
});

test('结算：自摸三家付、出铳一家付、庄家加半、封顶', () => {
  const ruleset = { minFan: 3, maxFan: 13, mode: 'add', base: 1, perFan: 1, dealerBonus: true };
  const discard = rules.settle(9, flags(), ruleset);
  assert.equal(discard.value, 10);
  assert.equal(discard.total, 10);
  assert.equal(discard.selfDraw, false);

  const selfDraw = rules.settle(9, flags({ selfDraw: true }), ruleset);
  assert.equal(selfDraw.value, 10);
  assert.equal(selfDraw.total, 30);

  const dealer = rules.settle(9, flags({ dealer: true }), ruleset);
  assert.equal(dealer.value, 15);

  const capped = rules.settle(20, flags(), { maxFan: 13, mode: 'add', base: 1, perFan: 1, dealerBonus: true });
  assert.equal(capped.capped, 13);
  assert.equal(capped.value, 14);

  const double = rules.settle(3, flags(), { maxFan: 13, mode: 'double', base: 1, perFan: 0, dealerBonus: false });
  assert.equal(double.value, 8);
});

test('掷骰开门：分大小与相加', () => {
  const bigFirst = rules.openInfo({ mode: 'bigPerson', d1: 3, d2: 5, d3: 0, dealer: 2, me: 0, stackMode: 'next' });
  assert.equal(bigFirst.persons, 5);
  assert.equal(bigFirst.stacks, 3);
  assert.equal(bigFirst.openWind, 2);
  assert.equal(bigFirst.startStack, 4);

  const smallFirst = rules.openInfo({ mode: 'smallPerson', d1: 3, d2: 5, d3: 0, dealer: 2, me: 0, stackMode: 'next' });
  assert.equal(smallFirst.persons, 3);
  assert.equal(smallFirst.stacks, 5);
  assert.equal(smallFirst.openWind, 0);
  assert.equal(smallFirst.startStack, 6);

  const sum = rules.openInfo({ mode: 'sum', d1: 3, d2: 5, d3: 0, dealer: 2, me: 0, stackMode: 'next' });
  assert.equal(sum.persons, 8);
  assert.equal(sum.openWind, 1);

  const same = rules.openInfo({ mode: 'bigPerson', d1: 3, d2: 5, d3: 0, dealer: 2, me: 0, stackMode: 'same' });
  assert.equal(same.startStack, 3);
});

test('筹码：马按座位固定，庄家是东', () => {
  assert.deepEqual(rules.maSet(0), [0, 9, 18, 4, 13, 22, 8, 17, 26, 27, 31]);
  assert.deepEqual(rules.maSet(1), [1, 10, 19, 5, 14, 23, 28, 32]);
  assert.deepEqual(rules.maSet(2), [2, 11, 20, 6, 15, 24, 29, 33]);
  assert.deepEqual(rules.maSet(3), [3, 12, 21, 7, 16, 25, 30]);

  assert.equal(rules.windOf(0, 0), 0);
  assert.equal(rules.windOf(0, 1), 3);
  assert.equal(rules.windOf(1, 0), 1);

  const seats = rules.seatsOf(1);
  assert.equal(seats[0].windName, '北');
  assert.equal(seats[1].windName, '东');
  assert.equal(seats[2].windName, '南');
  assert.equal(seats[3].windName, '西');
});

test('筹码：自摸 + 抓马，中几只算几只', () => {
  const result = rules.settleChips({
    dealer: 0,
    winner: 1,
    selfDraw: true,
    maTiles: [1, 10, 19, 28],
    rules: { selfDraw: 2, perMa: 1 }
  });
  assert.equal(result.winnerWind, 1);
  assert.deepEqual(result.maHits, [1, 10, 19, 28]);
  assert.deepEqual(result.net, [-6, 18, -6, -6]);
  assert.equal(result.winnerGain, 18);
  assert.ok(result.transfers.some((t) => t.reason === '中马 ×4' && t.amount === 4));

  const missed = rules.settleChips({
    dealer: 0,
    winner: 1,
    selfDraw: true,
    maTiles: [27, 31, 0, 4],
    rules: { selfDraw: 2, perMa: 1 }
  });
  assert.deepEqual(missed.maHits, []);
  assert.deepEqual(missed.net, [-2, 6, -2, -2]);
});

test('筹码：出铳、公杠、暗杠、放杠各归各', () => {
  const result = rules.settleChips({
    dealer: 0,
    winner: 0,
    selfDraw: false,
    discarder: 1,
    kongs: [{ player: 0, exposed: 1 }, { player: 2, concealed: 1 }],
    feedings: [{ from: 1, to: 3, count: 1 }],
    rules: { discard: 2, exposed: 1, concealed: 2, feeding: 3 }
  });
  assert.deepEqual(result.net, [3, -8, 5, 0]);
  assert.ok(result.transfers.some((t) => t.reason === '出铳' && t.from === 1 && t.amount === 2));
  assert.ok(result.transfers.some((t) => t.reason === '放杠 ×1' && t.from === 1 && t.to === 3 && t.amount === 3));
  assert.equal(result.net.reduce((a, b) => a + b, 0), 0);

  const indexed = rules.settleChips({
    dealer: 0,
    winner: 0,
    selfDraw: false,
    discarder: 1,
    kongs: [{ exposed: 1 }, null, { concealed: 1 }, null],
    feedings: [{ from: 1, to: 3, count: 1 }],
    rules: { discard: 2, exposed: 1, concealed: 2, feeding: 3 }
  });
  assert.deepEqual(indexed.net, [3, -8, 5, 0]);

  const indexedFeeding = rules.settleChips({
    dealer: 0,
    winner: 0,
    selfDraw: false,
    discarder: 1,
    kongs: [{ exposed: 1 }, null, { concealed: 1 }, null],
    feedings: [null, { to: 3, count: 1 }, null, null],
    rules: { discard: 2, exposed: 1, concealed: 2, feeding: 3 }
  });
  assert.deepEqual(indexedFeeding.net, [3, -8, 5, 0]);
});

test('筹码：放杠没选对象或指向自己时不记账', () => {
  const base = {
    dealer: 0,
    winner: 0,
    selfDraw: true,
    rules: { selfDraw: 2, perMa: 1, exposed: 1, concealed: 2, feeding: 3 }
  };
  const noTarget = rules.settleChips(Object.assign({}, base, {
    feedings: [{ from: 0, to: -1, count: 2 }]
  }));
  assert.deepEqual(noTarget.net, [6, -2, -2, -2]);
  assert.equal(noTarget.transfers.length, 3);

  const selfTarget = rules.settleChips(Object.assign({}, base, {
    feedings: [{ from: 2, to: 2, count: 1 }]
  }));
  assert.deepEqual(selfTarget.net, [6, -2, -2, -2]);
});

test('数墩超过 17 墩会绕到下一面牌墙', () => {
  const info = rules.openInfo({ mode: 'sum', d1: 6, d2: 6, d3: 6, dealer: 0, me: 0, stackMode: 'next' });
  assert.equal(info.persons, 18);
  assert.equal(info.startStack, 19);
  assert.equal(info.wrapped, true);
  assert.equal(info.wallStack, 2);
});
