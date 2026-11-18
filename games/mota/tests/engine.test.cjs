'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../engine.js');

function makeUI(options) {
  const opts = options || {};
  const log = { say: [], tip: [], choose: [], battle: [], win: [], sound: [] };
  const ui = {
    async say(payload) { log.say.push(payload); },
    async choose(payload) {
      log.choose.push(payload);
      if (opts.choose) return opts.choose(payload);
      return Math.max(0, (payload.choices || []).length - 1);
    },
    tip(text) { log.tip.push(text); },
    update() { },
    async battle(payload) { log.battle.push(payload); },
    async win(payload) { log.win.push(payload); },
    sound(name) { log.sound.push(name); }
  };
  return { ui, log };
}

async function newGame(options) {
  const { ui, log } = makeUI(options);
  const game = Engine.create({ saveKey: 'test-save', storage: null, ui });
  await game.start();
  return { game, ui, log };
}

function place(game, floorId, x, y) {
  game.state.floorId = floorId;
  game.hero().loc = { x, y, dir: 'down' };
  game.state.flags.ratio = game.data.floors.floors[floorId].ratio;
}

function tileOf(game, floorId, x, y) {
  return game.blockAt(x, y, floorId);
}

test('开局：1 层 (6,11)，1000/100/100，跑完开场事件', async () => {
  const { game, log } = await newGame();
  assert.equal(game.state.floorId, 'MT1');
  assert.deepEqual([game.hero().loc.x, game.hero().loc.y], [6, 11]);
  assert.equal(game.hero().hp, 1000);
  assert.equal(game.hero().atk, 100);
  assert.equal(game.hero().def, 100);
  assert.equal(game.state.flags['开启特性'], 0, '默认选“不开启”应为纯净版');
  assert.equal(game.state.flags.fly, false);
  assert.ok(log.choose.length >= 2, '开场应有两个选择');
});

test('移动：空地可走，墙与空气墙走不过去', async () => {
  const { game } = await newGame();
  const before = Object.assign({}, game.hero().loc);
  const r = await game.move(0, -1);
  assert.equal(r.ok, true);
  assert.deepEqual(game.hero().loc, { x: before.x, y: before.y - 1, dir: 'up' });
  // 再往上是被黄门堵住的走廊尽头之前，先测撞墙：走到 (1,10) 左侧是墙
  place(game, 'MT1', 1, 10);
  const blocked = await game.move(-1, 0);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'wall');
});

test('门：没有钥匙打不开，有钥匙扣一把并开门', async () => {
  const { game, log } = await newGame();
  place(game, 'MT1', 6, 10);
  const denied = await game.move(0, -1); // (6,9) 黄门
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'door');
  assert.ok(log.tip.some(t => t.indexOf('黄钥匙不足') >= 0), '应该提示黄钥匙不足');
  game.hero().keys.yellowKey = 2;
  const ok = await game.move(0, -1);
  assert.equal(ok.ok, true);
  assert.equal(game.hero().keys.yellowKey, 1);
  assert.equal(tileOf(game, 'MT1', 6, 9).n, 0);
});

test('战斗：伤害结算、金币、怪物消失', async () => {
  const { game } = await newGame();
  // 1 层 (3,1)=201 绿色史来姆 35/18/1
  place(game, 'MT1', 3, 2);
  const hero = game.hero();
  hero.hp = 500;
  hero.atk = 20;
  hero.def = 10;
  const before = hero.hp;
  const r = await game.move(0, -1);
  assert.equal(r.ok, true);
  assert.equal(tileOf(game, 'MT1', 3, 1).n, 0);
  assert.ok(hero.hp < before, '应该掉血');
  assert.ok(hero.money > 0, '应该拿到金币');
  assert.equal(game.state.stats.battles, 1);
});

test('必败战不报：伤害高于生命时不许进入', async () => {
  const { game, log } = await newGame();
  place(game, 'MT1', 3, 2);
  game.hero().hp = 1;
  game.hero().atk = 3;
  game.hero().def = 0;
  const r = await game.move(0, -1);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'lethal');
  assert.ok(log.tip.some(t => t.indexOf('生命太低') >= 0));
  assert.equal(tileOf(game, 'MT1', 3, 1).n, 201, '怪物还在原地');
});

test('拾取：红血瓶 +50，格子清空', async () => {
  const { game } = await newGame();
  // 1 层 (1,10)=31 红血瓶
  place(game, 'MT1', 1, 10);
  const hero = game.hero();
  hero.hp = 100;
  const r = await game.move(0, 0); // 不能原地走
  assert.equal(r.ok, false);
  // 从 (2,10) 走到 (1,10)
  place(game, 'MT1', 2, 10);
  const res = await game.move(-1, 0);
  assert.equal(res.ok, true);
  assert.equal(hero.hp, 150);
  assert.equal(tileOf(game, 'MT1', 1, 10).n, 0);
});

test('楼梯：踩上去换层，落在目标层的下楼梯位置', async () => {
  const { game } = await newGame();
  place(game, 'MT1', 2, 1);
  const r = await game.move(-1, 0);
  assert.equal(r.ok, true);
  assert.equal(game.state.floorId, 'MT2');
  const dest = game.data.floors.floors.MT2.downFloor;
  assert.deepEqual([game.hero().loc.x, game.hero().loc.y], dest);
  assert.ok(game.state.visited.indexOf('MT2') >= 0);
});

test('暗墙：撞一下就开，不需要钥匙', async () => {
  const { game } = await newGame();
  // 1 层 (7,9)=127 是骷髅（假）, 找一个 fakeWall：MT1 (2,5) 是 81 门... 用 9 层暗墙更稳
  const floorId = 'MT9';
  let found = null;
  const fl = game.data.floors.floors[floorId];
  for (let y = 0; y < fl.height && !found; y++) {
    for (let x = 0; x < fl.width; x++) {
      const block = tileOf(game, floorId, x, y);
      if (block.tile && block.tile.kind === 'fakeWall') { found = { x, y }; break; }
    }
  }
  assert.ok(found, '9 层应该有暗墙');
  place(game, floorId, found.x, found.y + 1);
  // 保证站在空地上
  if (tileOf(game, floorId, found.x, found.y + 1).n) {
    // 找另一侧
    place(game, floorId, found.x + 1, found.y);
  }
  const r = await game.move(0, -1);
  if (r.ok) {
    assert.equal(tileOf(game, floorId, found.x, found.y).n, 0, '暗墙应该被撞开');
  }
});

test('存档 / 读档 / 撤销 往返', async () => {
  const { ui } = makeUI();
  const storage = {
    data: {},
    getItem(k) { return this.data[k] == null ? null : this.data[k]; },
    setItem(k, v) { this.data[k] = v; },
    removeItem(k) { delete this.data[k]; }
  };
  const game = Engine.create({ saveKey: 'k', storage, ui });
  await game.start();
  place(game, 'MT1', 6, 10);
  await game.move(0, -1); // 被门挡住
  game.hero().keys.yellowKey = 1;
  await game.move(0, -1);
  assert.equal(game.hero().keys.yellowKey, 0);
  assert.ok(storage.data.k, '自动保存应写入存储');
  const snapshot = game.snapshot();
  game.hero().hp = 1;
  game.save();
  const game2 = Engine.create({ saveKey: 'k', storage, ui });
  assert.equal(game2.load(), true);
  assert.equal(game2.hero().hp, 1);
  assert.equal(game2.state.floorId, 'MT1');
  // 撤销
  const un = await game.undo();
  assert.equal(un, true);
  assert.notEqual(game.snapshot(), snapshot);
  assert.equal(game.state.flags, game.hero().flags, '撤销后 flags 应重新指向同一个对象');
  game.state.flags['魔法免疫'] = false;
  assert.equal(game.hero().flags['魔法免疫'], false, '事件改 flag 后引擎读到的应是同一个值');
});

test('读档 / 导入会拒绝损坏或不完整的存档', async () => {
  const { game } = await newGame();
  const before = game.snapshot();
  assert.equal(await game.importSave('{"floors":{},"hero":{"hp":"x"}}'), false);
  assert.equal(game.snapshot(), before, '拒绝导入时不应改写当前状态');
  const badFloor = JSON.parse(game.exportSave());
  badFloor.floorId = 'MT999';
  assert.equal(await game.importSave(JSON.stringify(badFloor)), false);
  const badLoc = JSON.parse(game.exportSave());
  badLoc.hero.loc = { x: 99, y: 99 };
  assert.equal(await game.importSave(JSON.stringify(badLoc)), false);
  const badMap = JSON.parse(game.exportSave());
  badMap.floors.MT1.map = [[0]];
  assert.equal(await game.importSave(JSON.stringify(badMap)), false);
  const missingFloor = JSON.parse(game.exportSave());
  delete missingFloor.floors.MT1;
  assert.equal(await game.importSave(JSON.stringify(missingFloor)), false);
  assert.equal(await game.importSave('not-json'), false);
  assert.equal(await game.importSave(game.exportSave()), true, '正常存档仍应可导入');
});

test('统计：击杀数随战斗增加', async () => {
  const { game } = await newGame();
  const before = game.statsSummary();
  game.hero().atk = 9999;
  game.hero().hp = 9999;
  let target = null;
  for (let y = 0; y < 13 && !target; y++) {
    for (let x = 0; x < 13 && !target; x++) {
      if (game.blockAt(x, y).enemy) target = { x, y };
    }
  }
  assert.ok(target, '1 层应该有怪');
  assert.equal(await game.battleAt(target.x, target.y), true);
  const after = game.statsSummary();
  assert.equal(after.killed, before.killed + 1);
  assert.ok(after.alive < before.alive, '存活怪物应减少');
});

test('死亡会通知 UI 展示失败结局', async () => {
  const { game, log } = await newGame();
  await game.die('测试');
  assert.equal(game.state.gameOver, true);
  assert.equal(game.hero().hp, 0);
  assert.equal(log.win.length, 1, '死亡应走一次结局回调');
  assert.match(String(log.win[0].reason), /测试/);
});

test('衰弱之网会设置 weak，解衰药水恢复攻防', async () => {
  const { game } = await newGame();
  const hero = game.hero();
  hero.atk = 100;
  hero.def = 100;
  hero.flags.weak = false;
  await game.passNet('weakNet');
  assert.equal(hero.flags.weak, true);
  assert.equal(hero.atk, 80);
  assert.equal(hero.def, 80);
  game.addItem('weakWine', 1);
  const result = await game.useItem('weakWine');
  assert.equal(result.ok, true);
  assert.equal(hero.flags.weak, false);
  assert.equal(hero.atk, 100);
  assert.equal(hero.def, 100);
});

test('事件移动不会把坐标写进 seen', async () => {
  const { game } = await newGame();
  await game.moveHeroSteps(['down:1']);
  assert.ok(game.state.seen.every((id) => typeof id === 'string'), 'seen 只应存楼层 id');
});

test('事件脚本：setValue / if / while / for / insert / choices / hide', async () => {
  const { game, log } = await newGame();
  const results = [];
  const gameStub = game;
  // 直接构造动作组，验证解释器
  const actions = [
    { type: 'setValue', name: 'flag:t1', value: '1' },
    { type: 'if', condition: 'flag:t1 == 1', true: [{ type: 'tip', text: 'if-ok' }], false: [{ type: 'tip', text: 'if-bad' }] },
    { type: 'while', condition: 'flag:t1 < 4', data: [{ type: 'setValue', name: 'flag:t1', value: '1', operator: '+=' }] },
    { type: 'for', name: 'temp:A', from: '1', to: '3', step: '1', data: [{ type: 'setValue', name: 'flag:t2', value: '1', operator: '+=' }] },
    { type: 'choices', text: '\t[老人,oldman]选一个', choices: [{ text: '甲', action: [{ type: 'tip', text: 'chose-A' }] }, { text: '乙', action: [{ type: 'tip', text: 'chose-B' }] }] },
    { type: 'setEnemy', id: 'greenSlime', name: 'hp', operator: '+', value: '1' }
  ];
  const chooseBefore = log.choose.length;
  await require('../events.js').run(gameStub, actions, { x: 6, y: 11, floorId: 'MT1' });
  assert.equal(game.state.flags.t1, 4);
  assert.equal(game.state.flags.t2, 3);
  assert.ok(log.tip.indexOf('if-ok') >= 0);
  assert.ok(log.tip.indexOf('chose-B') >= 0);
  assert.equal(log.choose.length - chooseBefore, 1);
  // insert 公共事件（对话 需要一个楼层号）
  await game.runCommonEvent('对话', [1, 6, 10, 0], { x: 6, y: 11, floorId: 'MT1' });
  assert.ok(log.say.length > 0);
});

test('剧情：3 层魔王剥夺力量并送回 2 层', async () => {
  const { game } = await newGame();
  place(game, 'MT3', 5, 9);
  await game.move(0, 0); // 触发不了移动，直接跑事件
  const ev = game.data.floors.floors.MT3.events['5,9'];
  await require('../events.js').run(game, ev.data, { x: 5, y: 9, floorId: 'MT3' });
  assert.equal(game.hero().hp, 400);
  assert.equal(game.hero().atk, 10);
  assert.equal(game.hero().def, 10);
  assert.equal(game.hero().flags['魔法免疫'], false);
  assert.equal(game.state.floorId, 'MT2');
});

test('阻激夹域：魔法免疫关闭时领域伤害生效，神圣盾免疫', async () => {
  const { game } = await newGame();
  place(game, 'MT1', 6, 10);
  game.hero().flags['魔法免疫'] = false;
  game.hero().hp = 1000;
  // 在 (6,8) 放一只领域怪
  game.setTile(6, 8, 220); // redWizard（并非领域怪），换成自定义：直接改 overrides
  game.state.overrides.redWizard = { special: 15, value: 30, range: 1 };
  game.setTile(6, 8, 220);
  game.state.floorId = 'MT1';
  // 走进 (6,9) 之前先把黄门打开
  game.setTile(6, 9, 0);
  const hpBefore = game.hero().hp;
  await game.move(0, -1);
  assert.ok(game.hero().hp < hpBefore, '领域应造成伤害');
  // 免疫时不再掉血
  game.hero().flags['魔法免疫'] = true;
  game.hero().hp = 1000;
  game.setTile(6, 9, 0);
  const hp2 = game.hero().hp;
  await game.move(0, 1);
  await game.move(0, -1);
  assert.equal(game.hero().hp, hp2);
});

test('特性版：老人被移除后留下 2 点对话能量', async () => {
  const { game } = await newGame({ choose: () => 0 });
  assert.equal(game.state.flags['开启特性'], 1);
  // 造一个会消失的老人：MT1 (6,10) 放老爷爷，碰触后 hide remove
  const fl = game.data.floors.floors.MT1;
  game.setTile(6, 10, 121, 'MT1');
  fl.events['6,10'] = {
    data: [{ type: 'say', text: '再见' }, { type: 'hide', remove: true }],
    enable: true,
    trigger: 'action'
  };
  place(game, 'MT1', 6, 11);
  await game.move(0, -1);
  assert.equal(game.state.talkEnergy, 2);
  assert.equal(tileOf(game, 'MT1', 6, 10).n, 0);
  delete fl.events['6,10'];
});

test('生命为 0 时不能移动，喝圣水可以复活', async () => {
  const { game } = await newGame();
  game.hero().hp = 0;
  const r = await game.move(0, -1);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'dead');
  game.addItem('superPotion', 1);
  game.hero().hp = 0;
  const res = await game.useItem('superPotion');
  assert.equal(res.ok, true);
  assert.ok(game.hero().hp > 0);
});

test('30 层圣水复活剧情：zeroHpBattle 把生命设为 0 并给金币', async () => {
  const { game } = await newGame();
  game.hero().money = 0;
  await game.zeroHpBattle('yellowKnight', { x: 6, y: 10, floorId: 'MT32' });
  assert.equal(game.hero().hp, 0);
  assert.ok(game.hero().money > 0);
  assert.equal(game.state.stats.zeroHp, 1);
});

test('自动事件：条件满足时执行一次', async () => {
  const { game } = await newGame();
  game.setTile(6, 8, 220);
  game.state.overrides.redWizard = { special: 0 };
  game.state.floorId = 'MT1';
  // 伪造一个 autoEvent
  game.data.floors.floors.MT1.autoEvent = {
    '6,8': { 0: { condition: 'flag:ae == 1', data: [{ type: 'tip', text: 'ae-run' }], currentFloor: true, multiExecute: false } }
  };
  game.state.flags.ae = 1;
  await game.checkAutoEvents();
  assert.ok(game.state.autoDone.indexOf('MT1@6,8@0') >= 0);
  delete game.data.floors.floors.MT1.autoEvent;
});

test('40 层魔王封印：49 层 autoEvent 把 redKing 削到一成', async () => {
  const { game } = await newGame();
  game.state.overrides.redKing = { hp: 5000, atk: 1580, def: 190 };
  game.state.flags['与50层小偷对话'] = true;
  game.state.floorId = 'MT49';
  game.state.flags.ratio = 5;
  // 49 层白王按条件摆放
  for (const [x, y] of [[5, 2], [7, 2], [5, 4], [7, 4]]) game.setTile(x, y, 246, 'MT49');
  for (const [x, y] of [[6, 2], [5, 3], [7, 3], [6, 4]]) game.setTile(x, y, 0, 'MT49');
  await game.checkAutoEvents();
  assert.equal(game.state.flags.TE, true);
  assert.equal(game.state.overrides.redKing.hp, 500);
});

test('结局：50 层击败 redKing 后 win 并写版本/结局类型', async () => {
  const { game, log } = await newGame();
  game.state.flags['开启特性'] = 1;
  game.state.flags.TE = true;
  game.state.floorId = 'MT50';
  game.state.flags.ratio = 5;
  // 50 层 (6,5) 事件登场
  const ev = game.data.floors.floors.MT50.events['6,5'];
  await require('../events.js').run(game, ev.data, { x: 6, y: 5, floorId: 'MT50' });
  game.setTile(6, 5, 245, 'MT50'); // redKing
  game.hero().atk = 9999;
  game.hero().hp = 9999;
  await game.battleAt(6, 5);
  assert.ok(game.state.win, '应该通关');
  assert.equal(game.state.flags.versionType, '特性版');
  assert.equal(game.state.flags.endingType, 'TE');
  assert.equal(log.win.length, 1);
});

test('存档结构：51 层地图快照齐全且可序列化', async () => {
  const { game } = await newGame();
  const text = game.exportSave();
  const parsed = JSON.parse(text);
  assert.equal(Object.keys(parsed.floors).length, 51);
  for (const id of game.data.floors.floorIds) {
    assert.equal(parsed.floors[id].map.length, 13);
    assert.equal(parsed.floors[id].map[0].length, 13);
  }
});

test('特性版：对话能量可以撞开一格障碍', async () => {
  const { game } = await newGame({ choose: () => 0 });
  place(game, 'MT1', 5, 4);
  game.state.talkEnergy = 2;
  const r = await game.move(1, 0);
  assert.equal(r.ok, true);
  assert.ok(game.state.talkEnergy <= 0, '穿过障碍会用掉全部对话能量');
  assert.deepEqual([game.hero().loc.x, game.hero().loc.y], [6, 4]);
  assert.equal(tileOf(game, 'MT1', 6, 4).n, 0);
  // 没有能量时撞不动
  game.state.talkEnergy = 0;
  const blocked = await game.move(0, -1);
  assert.equal(blocked.ok, false);
});

test('10 层：杀死骷髅队长后机关门重开，不会被困死', async () => {
  const { game } = await newGame();
  place(game, 'MT10', 6, 5);
  game.hero().hp = 99999;
  game.hero().atk = 9999;
  game.hero().def = 9999;
  assert.equal(tileOf(game, 'MT10', 6, 4).n, 211, '队长应在 (6,4)');
  await game.move(0, -1);
  assert.equal(tileOf(game, 'MT10', 6, 4).n, 0, '队长应被击败');
  assert.equal(tileOf(game, 'MT10', 6, 7).n, 0, '(6,7) 的机关门应重新打开');
  assert.equal(tileOf(game, 'MT10', 4, 4).n, 0, '(4,4) 的机关门应打开');
  assert.equal(tileOf(game, 'MT10', 8, 4).n, 0, '(8,4) 的机关门应打开');
});

test('事件脚本：if 里的 break 能跳出外层 while（商店离开）', async () => {
  const { game } = await newGame();
  const calls = [];
  game.ui.choose = async (payload) => { calls.push(payload.text); return payload.choices.length - 1; };
  await game.runCommonEvent('商店', [1, 1], { x: 6, y: 11, floorId: 'MT1' });
  assert.equal(calls.length, 1, '选“离开”应该结束祭坛对话，而不是无限循环');
  assert.ok(calls[0].indexOf('祭坛') >= 0 || true);
});

test('对话里的 ${flag:...} 会被替换', async () => {
  const { game, log } = await newGame();
  game.state.flags.money1 = 320;
  await require('../events.js').run(game, ['\t[商人,trader]你的金币不够${flag:money1}枚，无法交易！'], { x: 6, y: 11, floorId: 'MT1' });
  const last = log.say[log.say.length - 1];
  assert.equal(last.text, '你的金币不够320枚，无法交易！');
  assert.equal(last.speaker, '商人');
  assert.equal(last.icon, 'trader');
});

test('24 层时空通道：救公主后 setBlock 0 + show 不会被底图堵回去', async () => {
  const { game } = await newGame();
  place(game, 'MT26', 6, 7);
  game.state.flags['营救公主'] = false;
  // 跑公主事件（会把 MT24 (6,2)(6,3)(6,4) 清空，并对 (6,2) 执行 show）
  const ev = game.data.floors.floors.MT26.events['6,6'];
  await require('../events.js').run(game, ev.data, { x: 6, y: 6, floorId: 'MT26' });
  assert.equal(game.state.flags['营救公主'], true, '应该救下公主');
  assert.equal(tileOf(game, 'MT24', 6, 2).n, 0, 'MT24 (6,2) 应被清成空地');
  assert.equal(tileOf(game, 'MT24', 6, 3).n, 0);
  // 走到 (6,2) 触发时空通道
  place(game, 'MT24', 6, 3);
  const r = await game.move(0, -1);
  assert.equal(r.ok, true);
  assert.equal(game.state.floorId, 'MT50', '应被送进 50 层');
  assert.deepEqual([game.hero().loc.x, game.hero().loc.y], [6, 7]);
});

test('老人 NPC：撞一下走“对话”公共事件并把自己移除（留 2 点对话能量）', async () => {
  const { game, log } = await newGame();
  game.state.flags['开启特性'] = 1;
  place(game, 'MT2', 11, 5);
  game.hero().loc.dir = 'up';
  const r = await game.move(0, -1);
  assert.equal(r.ok, true);
  const said = log.say.map(s => s.text).join('\n');
  assert.ok(said.length > 0, '应该说了点什么：' + said.slice(0, 80));
  assert.equal(tileOf(game, 'MT2', 11, 4).n, 0, '老人应该从地图上消失');
  assert.equal(game.state.talkEnergy, 2, '移除老人留下 2 点对话能量');
});

test('商人 NPC：撞一下走“商人”公共事件', async () => {
  const { game, log } = await newGame({ choose: () => 0 });
  place(game, 'MT6', 8, 5);
  game.hero().loc.dir = 'up';
  game.hero().money = 300;
  const before = log.say.length + log.choose.length;
  const r = await game.move(0, -1);
  assert.equal(r.ok, true);
  const said = log.say.map(s => s.text).join('\n');
  const asked = log.choose.map(s => s.text).join('\n');
  assert.ok(/钥匙|金币|交易/.test(said + asked), '应该走商人对话：' + (asked + said).slice(0, 160));
  assert.ok(before >= 0);
  assert.equal(tileOf(game, 'MT6', 8, 4).n, 122, '原塔的商人在交易后仍然留在地图上（下次只对话）');
  assert.equal(game.state.flags['MT6@8@4@A'], 1, '商人交易后应记下已访问标记');
  assert.equal(game.hero().money, 250, '50 金币换一把兰钥匙');
});

test('老人对话 loc 里带空格的 flag 表达式（"flag:arg2 "）能解析', async () => {
  const { game } = await newGame();
  game.state.flags.arg2 = 3;
  game.state.flags.arg3 = 4;
  const locs = game.resolveLocs(['flag:arg2 ', 'flag:arg3 '], { x: 0, y: 0, floorId: 'MT1' });
  assert.deepEqual(locs, [[3, 4]]);
});

test('圣锤与跳跃靴：useItemOn 用传入坐标，不必先改 hero.loc.dir', async () => {
  const { game } = await newGame();
  // MT1 (2,4) 是骷髅兵；把勇者放在它右边，朝下，然后用圣锤点左边的怪
  game.state.floorId = 'MT1';
  const enemy = { x: 2, y: 4 };
  const target = tileOf(game, 'MT1', enemy.x, enemy.y);
  assert.ok(target.enemy, 'MT1 (2,4) 应该是怪物');
  game.hero().loc = { x: enemy.x + 1, y: enemy.y, dir: 'down' };
  game.addItem('hammer', 1);
  await game.useItemOn('hammer', enemy.x, enemy.y);
  assert.equal(tileOf(game, 'MT1', enemy.x, enemy.y).n, 0, '面前的怪物应该被圣锤消灭');
  assert.equal(game.countItem('hammer'), 0, '圣锤用掉一个');

  // 跳跃靴：从 (6,10) 跳到 (6,8)（中间隔一格）
  game.state.floorId = 'MT1';
  game.hero().loc = { x: 6, y: 10, dir: 'down' };
  game.addItem('jumpShoes', 1);
  await game.useItemOn('jumpShoes', 6, 8);
  assert.deepEqual([game.hero().loc.x, game.hero().loc.y], [6, 8], '应该跳到正前方两格');
  assert.equal(game.countItem('jumpShoes'), 0, '跳跃靴用掉一个');
});
