'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cards = require('../data.js');
const world = require('../world.js');
const E = require('../engine.js');

function fresh(character = 'vanguard', seed = 20240919) {
  const state = E.newState(character, seed);
  state.pending = null;
  return state;
}
function battleOf(state, kind = 'normal', enemies = ['scout-drone']) {
  return E.startBattle(state, { kind, enemies, hpScale: 1 });
}
function give(state, cardId, upgraded = false) {
  state.deck.push({ uid: `test-${cardId}-${state.deck.length}`, id: cardId, upgraded });
  return state.deck[state.deck.length - 1];
}
function hand(state, cardId, upgraded = false) {
  const entry = give(state, cardId, upgraded);
  state.deck.pop();
  state.battle.hand.push(entry);
  return entry;
}

test('new game starts with a valid deck, relic and a 15 floor chapter map', () => {
  const state = fresh();
  assert.equal(state.deck.length, 10);
  assert.equal(state.hp, state.maxHp);
  assert.equal(state.relics.length, 1);
  assert.equal(state.map.length, 15);
  assert.equal(state.map[14].type, 'boss');
  assert.equal(state.floor, 0);
  assert.equal(world.CHAPTERS.length, 12, '共 12 章');
  assert.ok(world.CHAPTERS.every(chapter => chapter.floors === 15), '每章 15 层');
  assert.deepEqual(world.CHAPTERS.map(chapter => chapter.name), ['回响航母', '寂静墓园', '深渊核心', '熔火铸造厂', '低温冷藏库', '孢子温床', '镜像回廊', '时序钟塔', '血月祭坛', '星骸坟场', '虚无帷幕', '回响之源']);
  for (const character of cards.CHARACTERS) {
    const other = fresh(character.id);
    assert.equal(other.deck.length, 10, `${character.id} 起始牌组`);
    assert.ok(other.maxHp >= 60);
  }
});

test('每一章的敌人都完整：普通、精英与首领齐备且可生成遭遇', () => {
  for (const chapter of world.CHAPTERS) {
    const list = world.byChapter(chapter.id);
    assert.ok(list.filter(item => item.kind === 'normal').length >= 4, `第 ${chapter.id} 章普通敌人`);
    assert.ok(list.filter(item => item.kind === 'elite').length >= 2, `第 ${chapter.id} 章精英`);
    assert.ok(list.filter(item => item.kind === 'boss').length >= 1, `第 ${chapter.id} 章首领`);
    const map = world.createMap(chapter.id, E.createRng(chapter.id * 101));
    for (const node of map) {
      if (!node.battle) continue;
      assert.ok(node.battle.enemies.length > 0, `第 ${chapter.id} 章第 ${node.floor} 层有敌人`);
      for (const id of node.battle.enemies) assert.ok(world.ENEMY_MAP[id], `${id} 必须存在`);
    }
    for (const kind of ['weak', 'normal', 'elite', 'boss']) {
      const spec = world.battleFor(chapter.id, kind, E.createRng(chapter.id * 7 + kind.length));
      assert.ok(spec.enemies.length > 0, `第 ${chapter.id} 章 ${kind} 遭遇`);
      for (const id of spec.enemies) assert.equal(world.ENEMY_MAP[id].chapter, chapter.id, `${id} 应属于第 ${chapter.id} 章`);
    }
  }
});

test('每名敌人的意图与效果引用的状态都有效', () => {
  for (const enemy of world.ENEMIES) {
    assert.ok(enemy.moves.length > 0, `${enemy.name} 至少有一个行动`);
    for (const move of enemy.moves) {
      assert.ok(move.id && move.name && move.intent, `${enemy.name} 的行动字段完整`);
      for (const effect of move.effects || []) {
        if (effect.type === 'status') assert.ok(cards.STATUS[effect.status], `${enemy.name}/${move.name} 的状态 ${effect.status} 必须存在`);
      }
    }
  }
});

test('attack damage follows block, vulnerable, weak and strength rules', () => {
  const state = fresh();
  battleOf(state, 'normal', ['guard-mech']);
  const enemy = state.battle.enemies[0];
  enemy.hp = 100; enemy.maxHp = 100; enemy.block = 0;
  enemy.statuses = {};
  state.battle.statuses = {};
  state.battle.block = 0;
  const hit = (value, times = 1) => E.applyEffect(state, { type: 'damage', value, times }, { source: 'player', target: enemy });
  hit(10);
  assert.equal(enemy.hp, 90);
  enemy.block = 6;
  hit(10);
  assert.equal(enemy.hp, 86, '格挡先吸收');
  assert.equal(enemy.block, 0);
  enemy.statuses.vulnerable = 1;
  hit(10);
  assert.equal(enemy.hp, 71, '易伤提高 50% 攻击伤害');
  delete enemy.statuses.vulnerable;
  state.battle.statuses.strength = 3;
  state.battle.statuses.weak = 1;
  hit(10);
  assert.equal(enemy.hp, 62, '力量 +3 后为 13 点，再被虚弱削减 25% 向下取整');
  state.battle.statuses = { strength: 0 };
  state.battle.block = 5;
  E.damagePlayer(state, 12, { source: 'enemy', actor: null });
  assert.equal(state.battle.block, 0);
  assert.equal(state.hp, state.maxHp - 7, '格挡吸收后剩余伤害进入生命');
});

test('poison ticks for enemies and the player, then decays by one', () => {
  const state = fresh();
  battleOf(state, 'normal', ['bone-soldier']);
  const enemy = state.battle.enemies[0];
  enemy.hp = 200; enemy.maxHp = 200;
  enemy.moves = [{ id: 'idle', name: '静止', intent: 'block', effects: [{ type: 'block', value: 2, target: 'self' }] }];
  E.addStatus(state, enemy, 'poison', 5);
  assert.equal(enemy.statuses.poison, 5);
  const before = enemy.hp;
  E.endPlayerTurn(state);
  assert.equal(enemy.hp, before - 5, '中毒在敌人行动前结算');
  assert.equal(enemy.statuses.poison, 4, '中毒每回合减少 1 层');
  assert.equal(state.battle.turn, 2, '敌人行动结束后回到玩家回合');
});

test('毒伤绕过格挡，负面状态在回合结束递减', () => {
  const state = fresh();
  battleOf(state, 'normal', ['scout-drone']);
  const enemy = state.battle.enemies[0];
  enemy.block = 20;
  const before = enemy.hp;
  E.dealDamageToEnemy(state, enemy, 6, { direct: true, label: '中毒' });
  assert.equal(enemy.hp, before - 6);
  assert.equal(enemy.block, 20, '直接伤害不消耗格挡');
  E.addStatus(state, enemy, 'vulnerable', 1);
  E.addStatus(state, 'player', 'weak', 2);
  E.gainBlock(state, 0);
  state.battle.block = 0;
  E.endPlayerTurn(state);
  assert.equal(state.battle.statuses.weak, 1, '虚弱在玩家回合结束时递减');
  E.endPlayerTurn(state);
  assert.equal(state.battle.statuses.weak, undefined, '状态归零后移除');
});

test('playing a card spends energy, resolves effects and moves the card to discard', () => {
  const state = fresh();
  battleOf(state, 'normal', ['scout-drone']);
  const enemy = state.battle.enemies[0];
  enemy.hp = 60; enemy.maxHp = 60;
  const entry = hand(state, 'plasma-strike');
  const energy = state.battle.energy;
  assert.equal(E.canPlay(state, entry), true);
  assert.equal(E.playCard(state, entry.uid, enemy.uid), true);
  assert.equal(state.battle.energy, energy - 1);
  assert.equal(enemy.hp, 54);
  assert.equal(state.battle.hand.includes(entry), false);
  assert.equal(state.battle.discard.some(card => card.uid === entry.uid), true);
});

test('升级、消耗与能力牌按规则结算', () => {
  const state = fresh();
  battleOf(state, 'normal', ['guard-mech']);
  const enemy = state.battle.enemies[0];
  enemy.hp = 80; enemy.maxHp = 80; enemy.block = 0;
  const upgraded = hand(state, 'plasma-strike', true);
  assert.equal(cards.card('plasma-strike', true).effects[0].value, 9);
  E.playCard(state, upgraded.uid, enemy.uid);
  assert.equal(enemy.hp, 71, '升级后伤害为 9');
  const exhausting = hand(state, 'time-warp');
  const energy = state.battle.energy;
  E.playCard(state, exhausting.uid);
  assert.equal(state.battle.energy, energy - 2 + 2);
  assert.equal(state.battle.exhaust.some(card => card.uid === exhausting.uid), true, '消耗牌进入消耗堆');
  const power = hand(state, 'plated');
  E.playCard(state, power.uid);
  assert.equal(state.battle.statuses.plating, 3, '能力牌立即生效并持续');
  assert.equal(state.battle.exhaust.length, 2, '能力牌本身进入消耗堆');
});

test('X 费卡按当前能量结算，卡组循环会洗回弃牌堆', () => {
  const state = fresh();
  battleOf(state, 'normal', ['guard-mech']);
  const enemy = state.battle.enemies[0];
  enemy.hp = 120; enemy.maxHp = 120;
  state.battle.energy = 3;
  const entry = hand(state, 'mind-burst');
  E.playCard(state, entry.uid, enemy.uid);
  assert.equal(state.battle.energy, 0);
  assert.equal(enemy.hp, 102, '3 点能量 × 6 点伤害');
  state.battle.hand = [];
  state.battle.draw = [];
  state.battle.discard = [{ uid: 'loop-1', id: 'plasma-strike', upgraded: false }];
  E.drawCards(state, 1);
  assert.equal(state.battle.hand.length, 1);
  assert.equal(state.battle.discard.length, 0);
});

test('战斗奖励可以按玩家选择领取，遗物立即生效', () => {
  const state = fresh();
  battleOf(state, 'elite', ['hollow-knight']);
  const enemy = state.battle.enemies[0];
  enemy.hp = 1;
  E.dealDamageToEnemy(state, enemy, 10, { source: 'player' });
  assert.equal(state.battle.finished, true);
  const rewards = state.battle.rewards;
  assert.ok(rewards.gold > 0);
  assert.ok(rewards.relic);
  assert.equal(rewards.cards.length, 3);
  const deckSize = state.deck.length;
  assert.equal(E.takeCardReward(state, rewards.cards[0]), true);
  assert.equal(state.deck.length, deckSize + 1);
  assert.equal(E.takeCardReward(state, rewards.cards[0]), false, '奖励只能领取一次');
  const relics = state.relics.length;
  assert.equal(E.takeRelicReward(state), true);
  assert.equal(state.relics.length, relics + 1);
  const gold = state.gold;
  assert.ok(E.takeGold(state) > 0);
  assert.ok(state.gold > gold);
  assert.equal(E.takeGold(state), 0, '金币不会重复领取');
});

test('每场战斗首回合触发遗物，战斗结束触发治疗类遗物', () => {
  const state = fresh();
  E.addRelic(state, 'sheath');
  E.addRelic(state, 'titan-plate');
  E.addRelic(state, 'burning-blood');
  battleOf(state, 'normal', ['scout-drone']);
  assert.equal(state.battle.block, 6, '泰坦护板在战斗开始提供格挡');
  assert.equal(state.battle.hand.length, E.DRAW_BASE + 2, '磁力刀鞘首回合额外抽 2 张');
  state.hp = 40;
  const enemy = state.battle.enemies[0];
  E.dealDamageToEnemy(state, enemy, 999, { source: 'player' });
  assert.equal(state.hp, 46, '燃烧之血在战斗结束后恢复 6 点生命');
});

test('遗物触发器在玩家回合开始时按顺序生效', () => {
  const state = fresh();
  E.addRelic(state, 'twin-battery');
  E.addRelic(state, 'data-core');
  battleOf(state, 'normal', ['scout-drone']);
  const block = state.battle.block;
  assert.equal(block, 1, '双子电池在玩家回合开始时提供 1 点格挡');
  assert.equal(state.battle.hand.length, E.DRAW_BASE + 1, '数据核心每回合额外抽 1 张牌');
  const enemy = state.battle.enemies[0];
  enemy.hp = 200; enemy.maxHp = 200; enemy.moves = [{ id: 'wait', name: '待机', intent: 'block', effects: [{ type: 'block', value: 1, target: 'self' }] }];
  E.endPlayerTurn(state);
  assert.equal(state.battle.statuses.strength, undefined);
  assert.equal(state.battle.block, 1, '每回合开始时重新获得格挡');
  assert.equal(state.battle.turn, 2);
});

test('地图推进、营火与卡牌升级改变存档内容', () => {
  const state = fresh();
  const first = E.enterNode(state);
  assert.ok(first);
  assert.equal(state.floor, 1);
  if (first.type === 'fight') {
    const enemy = state.battle.enemies[0];
    E.dealDamageToEnemy(state, enemy, 9999, { source: 'player' });
    assert.equal(state.battle.finished, true);
  }
  while (state.battle) {
    const enemy = E.aliveEnemies(state.battle)[0];
    if (!enemy) break;
    E.dealDamageToEnemy(state, enemy, 9999, { source: 'player' });
  }
  state.floor = 5;
  state.hp = 20;
  const healed = E.restAtCamp(state);
  assert.ok(healed > 0 && state.hp > 20);
  const target = state.deck[0];
  assert.equal(E.smithCard(state, target.uid), true);
  assert.equal(state.deck[0].upgraded, true);
  assert.equal(E.smithCard(state, target.uid), false, '同一张牌不能升级两次');
  assert.equal(E.removeCard(state, state.deck[1].uid), true);
});

test('商店价格受商人印记影响，事件选项产生可见结果', () => {
  const state = fresh();
  E.addRelic(state, 'merchant-seal');
  state.floor = 9;
  const inventory = E.shopInventory(state);
  assert.equal(inventory.cards.length, 3);
  assert.equal(inventory.relics.length, 2);
  assert.ok(inventory.cards.every(item => item.price > 0));
  assert.ok(inventory.cards.every(item => item.price <= 145 * 0.8 + 1), '商人印记提供 20% 折扣');
  const eventNode = state.map.find(node => node.type === 'event');
  state.floor = eventNode.floor;
  const option = E.resolveEvent(state, 0);
  assert.ok(option);
  assert.ok(state.pending && state.pending.eventResult);
  assert.equal(state.pending.eventResult.event, eventNode.event);
  assert.equal(state.battle, null, '事件结束后不留战斗状态');
});

test('存档可以往返序列化，损坏内容不会破坏游戏', () => {
  const state = fresh('psion', 4242);
  E.addRelic(state, 'data-core');
  battleOf(state, 'normal', ['bone-soldier', 'ghost']);
  const text = E.serialize(state);
  const loaded = E.deserialize(text);
  assert.ok(loaded);
  assert.deepEqual(loaded.deck, state.deck);
  assert.deepEqual(loaded.relics, state.relics);
  assert.equal(loaded.battle.enemies.length, 2);
  assert.equal(loaded.rng, state.rng);
  assert.equal(E.deserialize('{坏掉的 json'), null);
  assert.equal(E.deserialize('null'), null);
  assert.equal(E.deserialize('[]'), null);
  assert.equal(E.deserialize('{"version":99}'), null, '更高版本存档不会被误读');
  const legacy = E.deserialize(JSON.stringify({ version: 0, character: 'vanguard', rng: 'x', deck: null, map: [] }));
  assert.ok(legacy);
  assert.equal(legacy.version, E.VERSION);
  assert.equal(legacy.hp, cards.CHAR_MAP.vanguard.maxHp);
  assert.ok(Array.isArray(legacy.deck));
});

test('章节首领通关后自动进入下一章，最终章结束即胜利', () => {
  const state = fresh();
  const growth = [];
  state.chapter = 1;
  state.floor = state.map.length;
  let guard = 0;
  while (state.chapter < world.CHAPTERS.length && guard < 20) {
    guard += 1;
    const before = state.maxHp;
    assert.equal(E.nextNode(state), null, '距离终点后没有下一个节点');
    E.enterNode(state);
    growth.push(state.maxHp - before);
    assert.equal(state.floor, 0, '进入新章节后从第 0 层开始');
    assert.equal(state.map.length, 15);
    assert.equal(state.pending.chapterIntro, state.chapter);
    assert.ok(state.pending.growth > 0, '章节推进提高生命上限');
    assert.ok(state.hp <= state.maxHp);
    state.floor = state.map.length;
  }
  assert.equal(state.chapter, world.CHAPTERS.length, '一共推进到第 12 章');
  assert.ok(growth.every(value => value > 0), '每次成长都是正向的');
  assert.ok(growth[0] < growth[growth.length - 1], '后期章节的成长更高');
  E.enterNode(state);
  assert.equal(state.result, 'victory', '第 12 章结束后通关');
  assert.equal(state.battle, null);
});

test('地图节点顺序固定：前段普通战斗，中部精英与功能节点，末层首领', () => {
  for (const chapter of world.CHAPTERS) {
    const map = world.createMap(chapter.id, E.createRng(chapter.id * 31));
    assert.equal(map.length, 15);
    assert.deepEqual(map.map(node => node.type).slice(0, 3), ['fight', 'fight', 'fight']);
    assert.equal(map[3].type, 'event');
    assert.equal(map[4].type, 'elite');
    assert.equal(map[5].type, 'rest');
    assert.equal(map[7].type, 'treasure');
    assert.equal(map[9].type, 'shop');
    assert.equal(map[10].type, 'event');
    assert.equal(map[12].type, 'elite');
    assert.equal(map[13].type, 'rest');
    assert.equal(map[14].type, 'boss');
    for (const node of map) {
      if (node.type === 'fight' || node.type === 'elite' || node.type === 'boss') {
        assert.ok(node.battle.enemies.length > 0, '战斗节点必须有敌人');
        for (const id of node.battle.enemies) assert.ok(world.ENEMY_MAP[id], `${id} 必须存在`);
      }
      if (node.type === 'event') assert.ok(world.EVENT_MAP[node.event]);
    }
  }
});

test('死亡会立即结束冒险，之后不再推进', () => {
  const state = fresh();
  battleOf(state, 'normal', ['guard-mech']);
  E.damagePlayer(state, state.hp, { source: 'enemy' });
  assert.equal(state.hp, 0);
  assert.equal(state.result, 'defeat');
  assert.equal(state.battle.finished, true);
  assert.equal(state.battle.phase, 'lost');
  const floor = state.floor;
  E.enterNode(state);
  assert.equal(state.floor, floor, '失败后不能再前进');
});

test('目标选择、能量不足与中毒致死都能正确判定', () => {
  const state = fresh();
  battleOf(state, 'normal', ['scout-drone', 'scout-drone']);
  const [first, second] = state.battle.enemies;
  first.hp = 50; first.maxHp = 50; second.hp = 50; second.maxHp = 50;
  const entry = hand(state, 'plasma-strike');
  E.playCard(state, entry.uid, second.uid);
  assert.equal(second.hp, 44, '伤害落在指定目标上');
  assert.equal(first.hp, 50, '未指定的敌人不受影响');
  state.battle.energy = 0;
  const other = hand(state, 'plasma-strike');
  assert.equal(E.canPlay(state, other), false);
  assert.equal(E.playCard(state, other.uid), false, '能量不足无法出牌');
  state.battle.statuses.poison = 999;
  E.endPlayerTurn(state);
  assert.equal(state.result, 'defeat', '中毒可以直接导致失败');
});

test('敌人回合可以逐个推进，且结果与一次性结算一致', () => {
  const staged = fresh('vanguard', 31337);
  battleOf(staged, 'normal', ['magnet-mite', 'scout-drone']);
  staged.battle.energy = 0;
  E.endPlayerTurn(staged, { resolve: false });
  assert.equal(staged.battle.phase, 'enemy', '结束回合后进入敌人阶段');
  assert.deepEqual(staged.battle.enemyOrder.length, 2, '两名敌人都排进行动队列');
  const logAfterFirst = staged.battle.log.length;
  E.stepEnemyAction(staged);
  assert.ok(staged.battle.log.length > logAfterFirst, '第一个敌人已经行动');
  assert.equal(staged.battle.enemyOrder.length, 1, '队列逐个消耗');
  let guard = 0;
  while (staged.battle.phase === 'enemy' && !staged.battle.finished && guard < 10) { guard += 1; E.stepEnemyAction(staged); }
  assert.ok(staged.battle.phase === 'player' || staged.battle.finished, '所有敌人行动后回到玩家回合');

  const direct = fresh('vanguard', 31337);
  battleOf(direct, 'normal', ['magnet-mite', 'scout-drone']);
  direct.battle.energy = 0;
  E.endPlayerTurn(direct);
  assert.equal(staged.hp, direct.hp, '逐步推进与一次性结算结果一致');
  assert.equal(staged.battle.turn, direct.battle.turn);
});

test('战斗事件记录受击与摧毁，供界面播放动效', () => {
  const state = fresh();
  battleOf(state, 'normal', ['scout-drone', 'scout-drone']);
  const enemy = state.battle.enemies[0];
  enemy.hp = 30; enemy.maxHp = 30;
  state.battle.events.length = 0;
  const entry = hand(state, 'plasma-strike');
  E.playCard(state, entry.uid, enemy.uid);
  const hit = state.battle.events.find(event => event.kind === 'hit' && event.at === 'enemy');
  assert.ok(hit, '出牌会造成敌人受击事件');
  assert.equal(hit.uid, enemy.uid);
  assert.equal(hit.value, 6);
  state.battle.events.length = 0;
  E.dealDamageToEnemy(state, enemy, 999, { source: 'player' });
  assert.ok(state.battle.events.some(event => event.kind === 'kill' && event.uid === enemy.uid), '摧毁会记录击杀事件');
  state.battle.events.length = 0;
  E.endPlayerTurn(state, { resolve: false });
  assert.ok(state.battle.events.some(event => event.kind === 'enemyTurn'), '结束回合会记录敌人回合事件');
  assert.equal(state.battle.phase, 'enemy', '不使用逐步模式时由调用方推进');
});

test('X 费卡没有能量时不能白打，收割者击杀提升上限，事件的上限奖励真正生效', () => {
  const state = fresh();
  battleOf(state, 'normal', ['guard-mech']);
  const enemy = state.battle.enemies[0];
  enemy.hp = 60; enemy.maxHp = 60; enemy.block = 0;
  state.battle.energy = 0;
  const burst = hand(state, 'mind-burst');
  assert.equal(E.playCard(state, burst.uid, enemy.uid), false, '0 能量不能打出 X 费卡');
  assert.equal(enemy.hp, 60);
  state.battle.energy = 3;
  enemy.hp = 5;
  const maxHp = state.maxHp;
  const reaper = hand(state, 'reaper');
  E.playCard(state, reaper.uid, enemy.uid);
  assert.equal(enemy.dead, true);
  assert.equal(state.maxHp, maxHp + 3, '收割者击杀最后一名敌人也会提升最大生命');
  const other = fresh();
  const node = other.map.find(item => item.type === 'event');
  node.event = 'dead-lab';
  other.floor = node.floor;
  const before = other.maxHp;
  E.resolveEvent(other, 1);
  assert.equal(other.maxHp, before + 8, '「改造身体」提高 8 点生命上限');
});

test('玩家回合内施加虚弱后，敌人意图数字立即更新', () => {
  const state = fresh();
  battleOf(state, 'normal', ['guard-mech']);
  const enemy = state.battle.enemies[0];
  const slam = enemy.moves.find(move => move.id === 'slam');
  enemy.intent = { id: slam.id, name: slam.name, intent: slam.intent, damage: E.intentDamage(state, enemy, slam) };
  assert.equal(enemy.intent.damage[0].value, 9);
  const card = hand(state, 'calibrate');
  E.playCard(state, card.uid, enemy.uid);
  assert.equal(enemy.intent.damage[0].value, 6, '虚弱后 9 × 0.75 向下取整为 6');
});

test('战斗事件数组不会无限增长', () => {
  const state = fresh();
  battleOf(state, 'normal', ['hollow-knight']);
  const enemy = state.battle.enemies[0];
  enemy.hp = 9999; enemy.maxHp = 9999;
  for (let index = 0; index < 90; index++) E.dealDamageToEnemy(state, enemy, 1, { source: 'player' });
  assert.ok(state.battle.events.length <= 60, `事件数量受控：${state.battle.events.length}`);
});

test('章节成长提供生命上限与能量，且存档可往返', () => {
  const state = fresh('vanguard', 555);
  const startMaxHp = state.maxHp;
  const startEnergy = E.maxEnergyOf(state);
  state.floor = state.map.length;
  E.enterNode(state);
  assert.equal(state.chapter, 2);
  assert.ok(state.maxHp > startMaxHp, '进入第二章提升生命上限');
  assert.ok(E.maxEnergyOf(state) > startEnergy, '每两章提升一点能量上限');
  const text = E.serialize(state);
  const loaded = E.deserialize(text);
  assert.ok(loaded);
  assert.equal(loaded.maxHp, state.maxHp);
  assert.equal(E.maxEnergyOf(loaded), E.maxEnergyOf(state), '存档保留章节成长带来的能量');
  // 逐章检查能量单调不降，并在第 12 章明显高于开局。
  let energy = E.maxEnergyOf(state);
  while (state.chapter < 12) {
    state.floor = state.map.length;
    E.enterNode(state);
    const next = E.maxEnergyOf(state);
    assert.ok(next >= energy, `第 ${state.chapter} 章能量不倒退`);
    energy = next;
  }
  assert.equal(state.chapter, 12);
  assert.ok(energy >= startEnergy + 4, `第 12 章能量上限提升：${energy}`);
  assert.ok(state.maxHp > startMaxHp + 60, `第 12 章生命上限提升：${state.maxHp}`);
});

test('荆棘会反噬攻击者，狂暴在回合结束时提供力量', () => {
  const state = fresh();
  battleOf(state, 'normal', ['mirror-shade']);
  const enemy = state.battle.enemies[0];
  enemy.hp = 200; enemy.maxHp = 200;
  E.addStatus(state, enemy, 'thorns', 5);
  const before = state.hp;
  const entry = hand(state, 'plasma-strike');
  E.playCard(state, entry.uid, enemy.uid);
  assert.equal(state.hp, before - 5, '攻击带荆棘的敌人会受伤');
  assert.equal(enemy.hp, 194);
  // 狂暴在敌人行动结束时转化为力量。
  const brute = state.battle.enemies[0];
  E.addStatus(state, brute, 'enrage', 3);
  const strengthBefore = E.statusOf(brute.statuses, 'strength');
  E.endPlayerTurn(state, { resolve: false });
  E.stepEnemyAction(state);
  assert.ok(E.statusOf(brute.statuses, 'strength') > strengthBefore, '狂暴转化为力量');
});

test('自动试跑：12 章流程在数万次操作内保持状态自洽', () => {
  const state = fresh('necrotic', 777);
  let actions = 0;
  while (state.result === null && actions < 4000) {
    actions += 1;
    if (state.pending) { state.pending = null; continue; }
    if (state.battle && !state.battle.finished) {
      const battle = state.battle;
      if (battle.phase === 'player') {
        if (state.hp < state.maxHp * 0.35 && state.potions.length) E.usePotion(state, 0);
        let played = true;
        while (played) {
          played = false;
          for (const card of [...battle.hand]) {
            if (E.canPlay(state, card)) {
              const target = E.aliveEnemies(battle)[0];
              E.playCard(state, card.uid, target && target.uid);
              played = true;
              break;
            }
          }
          if (battle.finished) break;
        }
        if (!battle.finished) E.endPlayerTurn(state);
      }
      continue;
    }
    if (state.battle && state.battle.finished) {
      const rewards = state.battle.rewards;
      if (rewards) {
        E.takeGold(state);
        if (rewards.relic) E.takeRelicReward(state);
        if (rewards.potion) E.takePotionReward(state);
        if (rewards.cards.length) E.takeCardReward(state, rewards.cards[0]);
      }
      if (state.result) break;
      E.enterNode(state);
      continue;
    }
    const node = E.nextNode(state);
    if (!node) { E.enterNode(state); continue; }
    if (node.type === 'rest') {
      if (state.hp < state.maxHp * 0.7) E.restAtCamp(state);
      else if (state.deck.some(card => !card.upgraded && cards.CARD_MAP[card.id].u)) E.smithCard(state, state.deck.find(card => !card.upgraded && cards.CARD_MAP[card.id].u).uid);
    } else if (node.type === 'shop') {
      for (const entry of E.shopInventory(state).cards) {
        if (state.gold >= entry.price) { state.gold -= entry.price; state.deck.push({ uid: `shop-${state.deck.length}`, id: entry.id, upgraded: false }); break; }
      }
    } else if (node.type === 'event') {
      E.resolveEvent(state, 0);
      state.pending = null;
    } else if (node.type === 'treasure') {
      state.gold += 45;
      E.addRelic(state, world.RELIC_POOL.find(id => !state.relics.includes(id)));
    }
    E.enterNode(state);
    assert.ok(state.hp >= 0 && state.hp <= state.maxHp, '生命值始终在合法范围内');
    assert.ok(Number.isFinite(state.gold));
    if (state.battle) {
      for (const enemy of state.battle.enemies) {
        assert.ok(enemy.hp <= enemy.maxHp);
        assert.ok(Number.isFinite(enemy.hp));
      }
    }
  }
  assert.ok(actions < 4000, '试跑没有陷入死循环');
  assert.ok(state.result === 'victory' || state.result === 'defeat');
  assert.ok(state.stats.battles > 0);
  const roundTrip = E.deserialize(E.serialize(state));
  assert.ok(roundTrip);
  assert.equal(roundTrip.result, state.result);
});

test('完整 12 章自动试跑：状态在长流程中始终合法', () => {
  const incoming = battle => E.aliveEnemies(battle).reduce((total, enemy) => {
    const parts = (enemy.intent && enemy.intent.damage) || [];
    return total + parts.reduce((sum, part) => sum + part.value * part.times, 0);
  }, 0);
  // 稳健打法：先补格挡再输出，能斩杀时优先斩杀。
  function pilot(seed) {
    const state = fresh('vanguard', seed);
    let actions = 0;
    let maxChapter = 1;
    while (state.result === null && actions < 40000) {
      actions += 1;
      maxChapter = Math.max(maxChapter, state.chapter);
      if (state.pending) { state.pending = null; continue; }
      if (state.battle && !state.battle.finished) {
        const battle = state.battle;
        if (battle.phase === 'player') {
          if (state.hp < state.maxHp * 0.5 && state.potions.length) E.usePotion(state, 0);
          let safety = 0;
          while (!battle.finished && safety < 60) {
            safety += 1;
            const need = Math.max(0, incoming(battle) - battle.block);
            const usable = battle.hand.filter(card => E.canPlay(state, card));
            if (!usable.length) break;
            const score = card => {
              const definition = cards.card(card.id, card.upgraded);
              const effects = definition.effects || [];
              const damage = effects.filter(effect => effect.type === 'damage').reduce((total, effect) => total + effect.value * (effect.times || 1), 0);
              const block = effects.filter(effect => effect.type === 'block').reduce((total, effect) => total + effect.value, 0);
              if (definition.type === 'power') return 14;
              return need > 0 ? block * 1.8 + damage : damage;
            };
            const pick = usable.slice().sort((a, b) => score(b) - score(a))[0];
            const target = E.aliveEnemies(battle)[0];
            if (!E.playCard(state, pick.uid, target && target.uid)) break;
          }
          if (!battle.finished) E.endPlayerTurn(state);
        } else E.resolveEnemyTurn(state);
        assert.ok(state.hp >= 0 && state.hp <= state.maxHp, `生命值合法（第 ${state.chapter} 章）`);
        assert.ok(state.chapter >= 1 && state.chapter <= world.CHAPTERS.length, '章节在范围内');
        assert.equal(state.map.length, 15, '每章地图均为 15 层');
        for (const enemy of battle.enemies) {
          assert.ok(Number.isFinite(enemy.hp), '敌人生命是数值');
          assert.ok(enemy.hp <= enemy.maxHp);
        }
        continue;
      }
      if (state.battle && state.battle.finished) {
        const rewards = state.battle.rewards;
        if (rewards) {
          E.takeGold(state);
          if (rewards.relic) E.takeRelicReward(state);
          if (rewards.potion) E.takePotionReward(state);
          if (rewards.cards.length) E.takeCardReward(state, rewards.cards[0]);
        }
        if (state.result) break;
        E.enterNode(state);
        continue;
      }
      const node = E.nextNode(state);
      if (!node) { E.enterNode(state); continue; }
      if (node.type === 'rest') {
        if (state.hp < state.maxHp * 0.7) E.restAtCamp(state);
        else { const card = state.deck.find(item => !item.upgraded && cards.CARD_MAP[item.id].u); if (card) E.smithCard(state, card.uid); }
      } else if (node.type === 'shop') {
        for (const entry of E.shopInventory(state).cards) {
          if (state.gold >= entry.price) { state.gold -= entry.price; state.deck.push({ uid: `shop-${state.deck.length}`, id: entry.id, upgraded: false }); break; }
        }
      } else if (node.type === 'event') {
        E.resolveEvent(state, 0);
        state.pending = null;
      } else if (node.type === 'treasure') {
        state.gold += 60;
        E.gainRandomRelic(state);
      }
      E.enterNode(state);
    }
    return { state, actions, maxChapter };
  }
  const seeds = [7919 + 13, 2 * 7919 + 13, 5 * 7919 + 13, 7 * 7919 + 13, 11 * 7919 + 13];
  const results = seeds.map(pilot);
  for (const { state, actions } of results) {
    assert.ok(actions < 40000, '试跑没有陷入死循环');
    assert.ok(state.stats.battles >= 6, `试跑产生了实际战斗：${state.stats.battles}`);
    assert.ok(state.deck.length >= 10, '牌组保持完整');
    assert.ok(E.maxEnergyOf(state) > 3 || state.chapter <= 1, '能量上限随章节成长');
    assert.ok(state.chapter >= 1 && state.chapter <= 12);
  }
  // 多次候选中至少有一次推进到第 12 章，并且至少有一次通关，说明流程是可达的。
  const farthest = results.reduce((top, item) => (item.maxChapter > top.maxChapter ? item : top));
  assert.equal(farthest.maxChapter, 12, '存在推进到第 12 章的试跑');
  const deep = results.filter(({ maxChapter }) => maxChapter >= 6);
  assert.ok(deep.length >= 1, `存在深入中期的试跑：${results.map(r => r.maxChapter).join('/')}`);
  const wins = results.filter(({ state }) => state.result === 'victory').length;
  assert.ok(wins >= 1, `稳健打法在多次试跑中至少通关一次，实际 ${wins}/${results.length}`);
  // 成长与收集在长流程里确实发生。
  const grown = results.filter(({ state }) => state.deck.length > 12 && state.relics.length > 3);
  assert.ok(grown.length >= 1, '流程中牌组与遗物都在成长');
});
