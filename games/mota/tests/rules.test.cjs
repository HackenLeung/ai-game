'use strict';

// games/mota 规则层单测：战斗公式（对照 h5mota getDamageInfo）、临界、减伤、道具、商店、统计。
// 运行：cd F:\project\ai-game; node --test games/mota/tests/rules.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');

const D = require('../data.js');
const R = require('../rules.js');

/** 造一个起始勇士（1000/100/100），可覆盖任意字段 */
function hero(over) {
  const base = {
    hp: 1000,
    atk: 100,
    def: 100,
    mdef: 0,
    money: 0,
    exp: 0,
    keys: { yellowKey: 0, blueKey: 0, redKey: 0 },
    items: { constants: {}, tools: {}, equips: {} },
    flags: {}
  };
  return Object.assign(base, over || {});
}

/** 用真实怪物表算伤害 */
function dmg(id, h, opts) {
  return R.damage(id, h, Object.assign({ enemys: D.enemys }, opts || {}));
}

/** 造一只临时怪物 */
function mon(over) {
  return Object.assign({ id: 'test', name: '测试怪', hp: 100, atk: 0, def: 0, money: 0, exp: 0, special: 0 }, over || {});
}

// ---------------------------------------------------------------- 数据与特性

test('specials 与 data.js 完全一致（23 条）', () => {
  assert.deepEqual(R.specials, D.specials);
  assert.equal(Object.keys(R.specials).length, 23);
  assert.equal(R.specials[1].name, '先攻');
  assert.equal(R.specials[20].name, '无敌');
  assert.equal(R.specials[23].name, '重生');
});

test('defaultValues 与 data.js 的 values 一致', () => {
  Object.keys(D.values).forEach((key) => {
    assert.equal(R.defaultValues[key], D.values[key], 'values.' + key);
  });
});

test('hasSpecial 支持数字、数组、怪物 id 与空值', () => {
  assert.equal(R.hasSpecial(1, 1), true);
  assert.equal(R.hasSpecial(1, 2), false);
  assert.equal(R.hasSpecial([2, 3], 3), true);
  assert.equal(R.hasSpecial([2, 3], 1), false);
  assert.equal(R.hasSpecial([], 1), false);
  assert.equal(R.hasSpecial(null, 1), false);
  assert.equal(R.hasSpecial(undefined, 1), false);
  // 字符串是怪物 id（同 h5mota），要靠怪物表解析
  assert.equal(R.hasSpecial('evilBat', 2, D.enemys), true);
  assert.equal(R.hasSpecial('evilBat', 1, D.enemys), false);
  // 数据里 special 写成字符串数字也认
  assert.equal(R.hasSpecial('3', 3), true);
  // 参考数据异常：黑衣魔王的 special 是空数组，等于没有任何特性
  assert.equal(D.enemys.blackKing.special instanceof Array, true);
  for (let n = 1; n <= 23; n += 1) assert.equal(R.hasSpecial(D.enemys.blackKing.special, n), false);
});

test('specialText 给出中文说明：连击带次数、领域带范围、吸血/破甲/反击/净化带百分比', () => {
  assert.deepEqual(R.specialText(D.enemys.evilBat, hero(), null, D.enemys), [
    '怪物无视角色的防御',
    '怪物防御不小于角色攻击-1'
  ]);
  // 8 连击
  assert.deepEqual(R.specialText(D.enemys.redSwordsman, hero(), null, D.enemys), ['怪物每回合攻击8次']);
  // 领域：value 100、range 1、十字
  assert.deepEqual(R.specialText(D.enemys.brownWizard, hero(), null, D.enemys), [
    '经过怪物周围十字范围内1格时自动减生命100点'
  ]);
  // 阻击
  assert.deepEqual(R.specialText(D.enemys.skeletonPriest, hero(), null, D.enemys), [
    '经过怪物周围十字时自动减生命20点，同时怪物后退一格'
  ]);
  // 破甲 90%、反击 10%
  assert.deepEqual(R.specialText(mon({ special: 7 }), hero()), ['战斗前，怪物附加角色防御的90%作为伤害']);
  assert.deepEqual(R.specialText(mon({ special: 8 }), hero()), [
    '战斗时，怪物每回合附加角色攻击的10%作为伤害，无视角色防御'
  ]);
  // 净化 3 倍护盾 / 吸血 20%（附当前生命的估算值）
  assert.deepEqual(R.specialText(mon({ special: 9 }), hero()), ['战斗前，怪物附加角色护盾的3倍作为伤害']);
  assert.deepEqual(R.specialText(mon({ special: 11, value: 0.2 }), hero()), [
    '战斗前，怪物首先吸取角色的20%生命（约200点）作为伤害'
  ]);
  // 没有特性 → 空数组
  assert.deepEqual(R.specialText(D.enemys.greenSlime, hero()), []);
});

test('effectiveEnemy 克隆并覆盖，返回带 id 的对象且不改原数据', () => {
  const before = JSON.stringify(D.enemys.greenSlime);
  const enemy = R.effectiveEnemy('greenSlime', { greenSlime: { hp: 70, special: 1 } }, D.enemys);
  assert.equal(enemy.id, 'greenSlime');
  assert.equal(enemy.name, '绿色史来姆');
  assert.equal(enemy.hp, 70);
  assert.equal(enemy.special, 1);
  assert.equal(enemy.atk, 18); // 未覆盖的字段保持原值
  assert.equal(JSON.stringify(D.enemys.greenSlime), before);

  // 直接传对象也行
  const copy = R.effectiveEnemy(D.enemys.bat, {});
  assert.equal(copy.id, 'bat');
  assert.notEqual(copy, D.enemys.bat);

  // 没有对应 overrides 时等同原始数据
  assert.equal(R.effectiveEnemy('bat', { other: { hp: 1 } }, D.enemys).hp, 35);

  // 49 层“红魔三围 /10”之后还能被 50 层覆盖
  const half = R.effectiveEnemy('redKing', { redKing: { hp: 800, atk: 500, def: 100 } }, D.enemys);
  assert.deepEqual([half.hp, half.atk, half.def], [800, 500, 100]);
});

// ---------------------------------------------------------------- 战斗公式

test('起始属性 1000/100/100 打 1 层绿色史来姆（35/18/1）：伤害 0、1 回合', () => {
  const info = dmg('greenSlime', hero());
  assert.deepEqual(info, {
    damage: 0,
    turn: 1,
    mon_hp: 35,
    mon_atk: 18,
    mon_def: 1,
    per_damage: 0, // 18 - 100 → 0
    hero_per_damage: 99, // 100 - 1
    init_damage: 0,
    counterDamage: 0
  });
  assert.equal(R.canBattle('greenSlime', hero(), { enemys: D.enemys }), true);
});

test('中期手算：攻 120 / 防 60 打骷髅士兵（55/52/12）不破防不掉血', () => {
  const info = dmg('skeletonSoldier', hero({ atk: 120, def: 60 }));
  assert.equal(info.per_damage, 0); // 52 - 60 → 0
  assert.equal(info.hero_per_damage, 108); // 120 - 12
  assert.equal(info.turn, Math.ceil(55 / 108)); // 1 回合
  assert.equal(info.damage, 0);
});

test('中期手算：攻 130 / 防 50 打鬼战士（220/180/30）= 260', () => {
  // per = 180 - 50 = 130；per_hit = 130 - 30 = 100；turn = ceil(220/100) = 3
  // damage = 0 + (3-1)*130 + 0 = 260
  const info = dmg('ghostSkeleton', hero({ atk: 130, def: 50 }));
  assert.equal(info.per_damage, 130);
  assert.equal(info.hero_per_damage, 100);
  assert.equal(info.turn, 3);
  assert.equal(info.damage, 260);
});

test('护盾（mdef）在最后抵扣一次伤害', () => {
  const info = dmg('ghostSkeleton', hero({ atk: 130, def: 50, mdef: 60 }));
  assert.equal(info.damage, 260 - 60);
  // 扣到负数按 0 算（未开启负伤）
  assert.equal(dmg('ghostSkeleton', hero({ atk: 130, def: 50, mdef: 9999 })).damage, 0);
});

test('先攻(1) 多挨一回合', () => {
  const base = R.effectiveEnemy('ghostSkeleton', {}, D.enemys);
  const info = R.damage(Object.assign({}, base, { special: 1 }), hero({ atk: 130, def: 50 }));
  assert.equal(info.init_damage, 130);
  assert.equal(info.damage, 260 + 130);
});

test('2 连击 / 3 连击 / N 连击把每回合伤害翻倍', () => {
  const base = R.effectiveEnemy('ghostSkeleton', {}, D.enemys);
  const h = hero({ atk: 130, def: 50 }); // per 130，turn 3
  assert.equal(R.damage(Object.assign({}, base, { special: 4 }), h).damage, 2 * 2 * 130);
  assert.equal(R.damage(Object.assign({}, base, { special: 5 }), h).damage, 2 * 3 * 130);
  const n8 = R.damage(Object.assign({}, base, { special: 6, n: 8 }), h);
  assert.equal(n8.per_damage, 130 * 8);
  assert.equal(n8.damage, 2 * 130 * 8);
  // 不写 n 时按 4 连击
  assert.equal(R.damage(Object.assign({}, base, { special: 6 }), h).per_damage, 130 * 4);
});

test('魔攻(2) 无视防御：护盾堆到天上去也照打', () => {
  const h = hero({ hp: 5000, atk: 200, def: 500 });
  assert.equal(dmg('redBat', h).per_damage, 0); // 390 - 500 → 0
  const magic = R.damage(Object.assign({}, D.enemys.redBat, { special: 2 }), h);
  assert.equal(magic.per_damage, 390);
  assert.equal(magic.turn, 2);
  assert.equal(magic.damage, 390);
});

test('吸血(11)：先按当前生命吸一口，add 时还给怪物加血', () => {
  const h = hero({ hp: 1000, atk: 100, def: 0 });
  const bite = mon({ hp: 100, atk: 10, special: 11, value: 0.2 });
  const info = R.damage(bite, h);
  assert.equal(info.init_damage, 200); // floor(1000 * 0.2)
  assert.equal(info.turn, 1);
  assert.equal(info.damage, 200);

  const added = R.damage(Object.assign({}, bite, { add: true }), h);
  assert.equal(added.mon_hp, 300); // 100 + 200
  assert.equal(added.turn, 3);
  assert.equal(added.damage, 200 + 2 * 10);
});

test('破甲(7) 按防御百分比加战前伤害，defValue 优先', () => {
  const h = hero({ def: 100 });
  assert.equal(R.damage(mon({ special: 7 }), h).damage, 90); // floor(0.9 * 100)
  assert.equal(R.damage(mon({ special: 7, defValue: 0.5 }), h).damage, 50);
});

test('净化(9) 按护盾倍数加战前伤害（随后仍被护盾抵扣）', () => {
  const h = hero({ mdef: 50 });
  const info = R.damage(mon({ special: 9 }), h);
  assert.equal(info.init_damage, 150); // 3 * 50
  assert.equal(info.damage, 100); // 150 - 50
  assert.equal(R.damage(mon({ special: 9, n: 2 }), h).init_damage, 100);
});

test('反击(8) 每回合按攻击百分比加伤，atkValue 优先', () => {
  const h = hero({ atk: 100, def: 0 });
  const info = R.damage(mon({ hp: 300, atk: 50, special: 8 }), h);
  assert.equal(info.turn, 3);
  assert.equal(info.counterDamage, 10); // floor(0.1 * 100)
  assert.equal(info.damage, 2 * 50 + 3 * 10);
  assert.equal(R.damage(mon({ hp: 300, atk: 50, special: 8, atkValue: 0.5 }), h).counterDamage, 50);
});

test('仇恨(17) 与固伤(22) 在护盾之后加，且不受护盾抵消', () => {
  const h = hero({ mdef: 30 });
  const enraged = R.damage(mon({ special: 17 }), h, { hatred: 40 });
  assert.equal(enraged.damage, 40); // 0 - 30 → 0，再 +40
  assert.equal(R.damage(mon({ special: 22, damage: 25 }), h).damage, 25);
  assert.equal(R.damage(mon({ special: 17, special2: 0 }), h, { hatred: 40 }).damage, 40);
  const both = { id: 'both', hp: 100, atk: 0, def: 0, special: [17, 22], damage: 25 };
  assert.equal(R.damage(both, h, { hatred: 40 }).damage, 65);
});

test('坚固(3) 把怪物防御抬到攻击 - 1；模仿(10) 复制勇士攻防', () => {
  const sturdy = R.damage(mon({ hp: 10, special: 3 }), hero({ atk: 100 }));
  assert.equal(sturdy.mon_def, 99);
  assert.equal(sturdy.hero_per_damage, 1);

  const copy = R.damage(mon({ hp: 200, atk: 999, def: 999, special: 10 }), hero({ atk: 150, def: 100 }));
  assert.equal(copy.mon_atk, 150); // 复制的是勇士原始攻防
  assert.equal(copy.mon_def, 100);
  assert.equal(copy.damage, 3 * 50);
  // 技能翻倍发生在模仿之后：怪物攻防不变，但勇士一击更重
  const copySkill = R.damage(mon({ hp: 200, atk: 999, def: 999, special: 10 }), hero({ atk: 150, def: 100 }), { skill: 1 });
  assert.equal(copySkill.mon_atk, 150);
  assert.equal(copySkill.hero_per_damage, 200); // 300 - 100
  assert.equal(copySkill.turn, 1);
});

test('二倍斩(skill=1) 让勇士攻击翻倍', () => {
  const h = hero({ atk: 130, def: 50 });
  const info = dmg('ghostSkeleton', h, { skill: 1 });
  assert.equal(info.hero_per_damage, 260 - 30);
  assert.equal(info.turn, 1);
  assert.equal(info.damage, 0);
  // 也可以从 hero.flags.skill 读出来
  assert.equal(dmg('ghostSkeleton', hero({ atk: 130, def: 50, flags: { skill: 1 } })).turn, 1);
});

test('夹击(16) 与领域(15) 不在战斗伤害里，交给地图结算', () => {
  const white = dmg('whiteKing', hero({ hp: 5000, atk: 200, def: 100 }));
  // 450 - 100 = 350；ceil(230/100) = 3；damage = 2 * 350，没有被减半
  assert.equal(white.per_damage, 350);
  assert.equal(white.turn, 3);
  assert.equal(white.damage, 700);

  const wizard = dmg('brownWizard', hero({ hp: 5000, atk: 300, def: 100 }));
  // 领域 100 点不算进 damage：370 - 100 = 270；ceil(220/190) = 2
  assert.equal(wizard.per_damage, 270);
  assert.equal(wizard.damage, 270);
});

test('不可破防返回 null，且 canBattle 为 false', () => {
  assert.equal(dmg('steelRock', hero()), null); // 攻击 100 < 防御 315
  assert.equal(R.canBattle('steelRock', hero(), { enemys: D.enemys }), false);
  // 打得起但伤害超过生命：也不该出手
  const vampire = dmg('vampire', hero({ hp: 5000 }));
  assert.equal(vampire.damage, 1287);
  assert.equal(R.canBattle('vampire', hero(), { enemys: D.enemys }), false);
  assert.equal(R.canBattle('vampire', hero({ hp: 5000 }), { enemys: D.enemys }), true);
});

test('无敌(20)：没有十字架打不到，有十字架才可战', () => {
  const invincible = R.effectiveEnemy('rock', { rock: { special: 20 } }, D.enemys);
  assert.equal(R.damage(invincible, hero()), null);
  const withCross = R.damage(invincible, hero({ items: { constants: { cross: 1 }, tools: {}, equips: {} } }));
  assert.notEqual(withCross, null);
  assert.equal(withCross.damage, 0);
  // opts.cross 也能代表持有十字架
  assert.notEqual(R.damage(invincible, hero(), { cross: true }), null);
});

test('十字架让吸血鬼（444/199/66）攻击翻倍：1287 → 297', () => {
  const h = hero({ hp: 5000 });
  const plain = dmg('vampire', h);
  assert.equal(plain.hero_per_damage, 34); // 100 - 66
  assert.equal(plain.turn, 14); // ceil(444/34)
  assert.equal(plain.damage, 13 * 99); // 199 - 100 = 99

  const cross = dmg('vampire', h, { cross: true });
  assert.equal(cross.hero_per_damage, 134); // 200 - 66
  assert.equal(cross.turn, 4);
  assert.equal(cross.damage, 3 * 99);
  assert.equal(cross.damage, 297);
});

test('十字架同样作用于兽人 / 兽人武士，屠龙匕作用于魔龙', () => {
  const h = hero({ hp: 99999, atk: 100, def: 200 });
  assert.equal(dmg('zombie', h).hero_per_damage, 95);
  assert.equal(dmg('zombie', h, { cross: true }).hero_per_damage, 195);
  assert.equal(dmg('zombieKnight', h).hero_per_damage, 85);
  assert.equal(dmg('zombieKnight', h, { cross: true }).hero_per_damage, 185);

  const dragon = hero({ hp: 99999, atk: 300, def: 200 });
  assert.equal(dmg('magicDragon', dragon).hero_per_damage, 50);
  assert.equal(dmg('magicDragon', dragon, { knife: true }).hero_per_damage, 350);
  assert.equal(dmg('magicDragon', dragon, { knife: true }).damage, 4 * 400);
  // 屠龙匕对别的怪无效：还是 100 - 66
  assert.equal(dmg('vampire', h, { knife: true }).hero_per_damage, 34);
});

test('addHp（疯狂加血模式）最终伤害取负', () => {
  const info = dmg('ghostSkeleton', hero({ atk: 130, def: 50 }), { addHp: true });
  assert.equal(info.damage, -260);
  // 本来 0 伤的战斗取负还是 0
  assert.equal(dmg('greenSlime', hero(), { addHp: true }).damage, 0);
});

// ---------------------------------------------------------------- 临界 / 减伤

test('criticals 给出打低伤害所需的攻击临界（鬼战士：+10 省 130，+120 省 260）', () => {
  const h = hero({ atk: 130, def: 50 });
  const list = R.criticals('ghostSkeleton', h, 5, { enemys: D.enemys });
  assert.deepEqual(list, [[10, 130], [120, 260]]);
  // 临界点确实成立
  assert.equal(dmg('ghostSkeleton', hero({ atk: 140, def: 50 })).damage, 130);
  assert.equal(dmg('ghostSkeleton', hero({ atk: 250, def: 50 })).damage, 0);
  // n 限制条数
  assert.deepEqual(R.criticals('ghostSkeleton', h, 1, { enemys: D.enemys }), [[10, 130]]);
});

test('criticals 单调：攻击越高伤害越低，加攻与减伤都不减少', () => {
  let lastAtk = 0;
  let lastSave = -1;
  for (const atk of [130, 150, 200, 260]) {
    const list = R.criticals('slimeMan', hero({ atk: atk, def: 50 }), 5, { enemys: D.enemys });
    list.forEach((pair) => {
      const need = pair[0];
      const save = pair[1];
      assert.ok(need > lastAtk, '加攻需求应递增：' + need);
      assert.ok(save >= lastSave, '减伤应递增：' + save);
      lastAtk = need;
      lastSave = save;
      // 加上这点攻击，伤害正好少掉 save
      const now = dmg('slimeMan', hero({ atk: atk, def: 50 })).damage;
      const after = dmg('slimeMan', hero({ atk: atk + need, def: 50 })).damage;
      assert.equal(now - after, save);
    });
    lastAtk = 0;
    lastSave = -1;
  }
});

test('criticals 边界：不可战时给「差多少攻破防」，模仿/坚固与零伤无临界', () => {
  // 攻击 100 vs 防御 315：需要 216 点攻击才破防
  assert.deepEqual(R.criticals('steelRock', hero(), 5, { enemys: D.enemys }), [[216, 0]]);
  assert.equal(dmg('steelRock', hero({ atk: 316 })).hero_per_damage, 1);
  // 坚固 / 模仿：加攻没意义
  assert.deepEqual(R.criticals(mon({ hp: 100, special: 3 }), hero(), 5), []);
  assert.deepEqual(R.criticals(mon({ hp: 100, special: 10 }), hero(), 5), []);
  // 已经 0 伤
  assert.deepEqual(R.criticals('greenSlime', hero(), 5, { enemys: D.enemys }), [[0, 0]]);
});

test('defDamage：多 k 点防御少掉的血 = (回合数-1)*k，不可战返回 ???', () => {
  const h = hero({ atk: 130, def: 50 }); // turn 3
  assert.equal(R.defDamage('ghostSkeleton', h, 1, { enemys: D.enemys }), 2);
  assert.equal(R.defDamage('ghostSkeleton', h, 10, { enemys: D.enemys }), 20);
  assert.equal(R.defDamage('steelRock', hero(), 1, { enemys: D.enemys }), '???');
});

// ---------------------------------------------------------------- 道具

test('宝石与血瓶按本层 ratio 生效；ratio=0（0 层）加 0 但仍算捡到', () => {
  const gems = {
    redGem: ['atk', 1],
    blueGem: ['def', 1],
    greenGem: ['mdef', 5],
    redPotion: ['hp', 50],
    bluePotion: ['hp', 200],
    yellowPotion: ['hp', 500],
    greenPotion: ['hp', 800]
  };
  Object.keys(gems).forEach((id) => {
    const field = gems[id][0];
    const base = gems[id][1];
    const h = hero();
    const before = h[field];
    const out = R.itemEffect(id, { hero: h, ratio: 3, values: D.values });
    assert.equal(out.changed, true, id);
    assert.equal(h[field] - before, base * 3, id);
    assert.equal(out.log.length, 1, id);
  });

  const zero = hero();
  const out0 = R.itemEffect('redGem', { hero: zero, ratio: 0, values: D.values });
  assert.equal(zero.atk, 100);
  assert.equal(out0.changed, true);
  assert.deepEqual(out0.log, ['攻击 +0']);
  assert.equal(out0.kind, 'atk');

  const noRatio = hero();
  R.itemEffect('redGem', { hero: noRatio, values: D.values });
  assert.equal(noRatio.atk, 101);
});

test('剑与盾按 itemEffect 加值并记录 flags.nowWeapon / nowShield', () => {
  const swords = { sword1: 10, sword2: 20, sword3: 40, sword4: 50, sword5: 100 };
  Object.keys(swords).forEach((id) => {
    const h = hero();
    const out = R.itemEffect(id, { hero: h, ratio: 1, values: D.values });
    assert.equal(h.atk, 100 + swords[id], id);
    assert.equal(h.flags.nowWeapon, id);
    assert.equal(out.kind, 'atk');
    assert.deepEqual(out.log, ['攻击 +' + swords[id]]);
  });

  const shields = { shield1: 10, shield2: 20, shield3: 40, shield4: 50, shield5: 100 };
  Object.keys(shields).forEach((id) => {
    const h = hero();
    const out = R.itemEffect(id, { hero: h, ratio: 1, values: D.values });
    if (id === 'shield5') {
      assert.equal(h.def, 100 + 100 + 0); // shield5 的 def 100
      return;
    }
    assert.equal(h.def, 100 + shields[id], id);
    assert.equal(h.flags.nowShield, id);
    assert.equal(h.mdef, 0, id);
    assert.equal(out.kind, 'def');
  });
});

test('神圣盾额外 +100 护盾并写入 flags.魔法免疫', () => {
  const h = hero();
  const out = R.itemEffect('shield5', { hero: h, ratio: 1, values: D.values });
  assert.equal(h.def, 200);
  assert.equal(h.mdef, 100);
  assert.equal(h.flags.nowShield, 'shield5');
  assert.equal(h.flags['魔法免疫'], true);
  assert.deepEqual(out.log, ['防御 +100', '护盾 +100', '获得魔法免疫']);
  assert.equal(out.kind, 'def');
});

test('黄宝石：全属性提升', () => {
  const h = hero();
  const out = R.itemEffect('yellowGem', { hero: h, ratio: 1, values: D.values });
  assert.deepEqual([h.hp, h.atk, h.def, h.mdef], [2000, 106, 106, 10]);
  assert.equal(out.changed, true);
  assert.equal(out.log.length, 4);
});

test('钥匙、钱袋与收集类工具进背包', () => {
  const h = hero();
  assert.equal(R.itemEffect('yellowKey', { hero: h, values: D.values }).kind, 'key');
  assert.equal(R.itemEffect('blueKey', { hero: h, values: D.values }).kind, 'key');
  assert.equal(R.itemEffect('redKey', { hero: h, values: D.values }).kind, 'key');
  assert.deepEqual(h.keys, { yellowKey: 1, blueKey: 1, redKey: 1 });

  // 没有 hero.keys 时退回 items.tools（兼容 h5mota 的钥匙存放方式）
  const bare = { hp: 100 };
  R.itemEffect('yellowKey', { hero: bare, values: D.values });
  assert.equal(bare.items.tools.yellowKey, 1);
  assert.equal(R.itemCount(bare, 'yellowKey'), 1);

  assert.equal(R.itemEffect('pack', { hero: h, values: D.values }).kind, 'money');
  assert.equal(h.money, 500);

  const tools = ['pickaxe', 'bomb', 'earthquake', 'bigKey', 'superPotion', 'upFly', 'downFly', 'jumpShoes', 'hammer', 'centerFly'];
  tools.forEach((id) => {
    const out = R.itemEffect(id, { hero: h, ratio: 1, values: D.values });
    assert.equal(out.kind, 'tool', id);
    assert.equal(h.items.tools[id], 1, id);
  });
  assert.equal(R.itemEffect('bomb', { hero: h, values: D.values }).changed, true);
  assert.equal(h.items.tools.bomb, 2);

  // 三合一瞬移一次给 3 个
  R.itemEffect('centerFly3', { hero: h, values: D.values });
  assert.equal(h.items.tools.centerFly, 4);
});

test('常驻道具进 items.constants', () => {
  const ids = ['cross', 'coin', 'knife', 'book', 'wand', 'snow', 'fly', 'skill1', 'I300'];
  const h = hero();
  ids.forEach((id) => {
    const out = R.itemEffect(id, { hero: h, ratio: 1, values: D.values });
    assert.equal(out.kind, 'constant', id);
    assert.equal(h.items.constants[id], 1, id);
  });
  // 魔杖类 lifeWand 直接变成 fly
  const other = hero();
  R.itemEffect('lifeWand', { hero: other, values: D.values });
  assert.equal(other.items.constants.fly, 1);
  assert.equal(R.hasItem(other, 'fly'), true);
});

test('圣水：拾取进背包，使用时按 round(0.74*(攻+防))*10 回血', () => {
  const h = hero();
  R.itemEffect('superPotion', { hero: h, values: D.values });
  assert.equal(h.items.tools.superPotion, 1);
  assert.equal(h.hp, 1000); // 拾取时不回血

  const out = R.itemEffect('superPotion', { hero: h, values: D.values, use: true });
  assert.equal(out.kind, 'hp');
  assert.equal(h.hp, 1000 + Math.round(0.74 * (100 + 100)) * 10);
  assert.equal(h.hp, 2480);
  assert.equal(h.items.tools.superPotion, undefined);
  // 没有圣水时用不了
  assert.equal(R.itemEffect('superPotion', { hero: h, values: D.values, use: true }).changed, false);
});

test('药水解除状态，二倍斩开关', () => {
  const h = hero();
  R.itemEffect('poisonWine', { hero: h, values: D.values });
  R.itemEffect('weakWine', { hero: h, values: D.values });
  R.itemEffect('curseWine', { hero: h, values: D.values });
  R.itemEffect('superWine', { hero: h, values: D.values });
  h.flags.poison = true;
  h.flags.weak = true;
  h.flags.curse = true;

  assert.equal(R.itemEffect('poisonWine', { hero: h, values: D.values, use: true }).kind, 'use');
  assert.equal(h.flags.poison, undefined);
  assert.equal(h.flags.weak, true);
  assert.equal(h.items.tools.poisonWine, undefined);

  R.itemEffect('superWine', { hero: h, values: D.values, use: true });
  assert.deepEqual([h.flags.weak, h.flags.curse], [undefined, undefined]);

  R.itemEffect('skill1', { hero: h, values: D.values });
  assert.equal(R.itemEffect('skill1', { hero: h, values: D.values, use: true }).kind, 'use');
  assert.equal(h.flags.skill, 1);
  R.itemEffect('skill1', { hero: h, values: D.values, use: true });
  assert.equal(h.flags.skill, 0);
});

test('解衰药水把衰弱扣掉的攻防补回来', () => {
  const h = hero();
  h.items.tools.weakWine = 1;
  h.atk -= D.values.weakValue;
  h.def -= D.values.weakValue;
  h.flags.weak = true;
  const out = R.itemEffect('weakWine', { hero: h, values: D.values, use: true });
  assert.equal(out.kind, 'use');
  assert.equal(h.atk, 100);
  assert.equal(h.def, 100);
  assert.equal(h.flags.weak, undefined);
});

test('未知道具（图块里有、道具表里没有）当作捡到但没有效果', () => {
  const h = hero();
  const out = R.itemEffect('I301', { hero: h, ratio: 1, values: D.values });
  assert.equal(out.kind, 'none');
  assert.equal(out.changed, true);
  assert.deepEqual(out.log, ['获得 I301']);
});

// ---------------------------------------------------------------- 其它

test('toolText 给出工具条说明', () => {
  assert.equal(R.toolText('superPotion', D.values), '生命 +round(0.74*(攻击+防御))*10');
  assert.equal(R.toolText('bomb'), '炸死身边生命低于 500 的敌人');
  assert.equal(R.toolText('yellowKey'), '打开一扇黄门');
  assert.equal(R.toolText('shield5'), '防御 +100，护盾 +100，魔法免疫');
  assert.equal(R.toolText('redGem', D.values), '攻击 +1');
  assert.equal(R.toolText('cross'), '对吸血鬼和兽人攻击力加倍');
  // 工具类都要有说明
  ['pickaxe', 'bomb', 'earthquake', 'bigKey', 'centerFly', 'upFly', 'downFly',
    'jumpShoes', 'hammer', 'poisonWine', 'weakWine', 'curseWine', 'superWine', 'skill1'].forEach((id) => {
    assert.ok(R.toolText(id, D.values).length > 0, id);
  });
});

test('shopPrice：20 / 40 / 80 / 140，且严格递增', () => {
  assert.equal(R.shopPrice(0), 20);
  assert.equal(R.shopPrice(1), 40);
  assert.equal(R.shopPrice(2), 80);
  assert.equal(R.shopPrice(3), 140);
  for (let t = 0; t < 20; t += 1) assert.ok(R.shopPrice(t + 1) > R.shopPrice(t));
});

test('heroStats：攻防和、钥匙总数、道具件数', () => {
  const h = hero();
  h.keys = { yellowKey: 2, blueKey: 1, redKey: 0 };
  h.items.tools = { pickaxe: 1, bomb: 2, bigKey: 1 };
  h.items.constants = { cross: 1, book: 1 };
  const stats = R.heroStats(h);
  assert.equal(stats.atkDefSum, 200);
  assert.equal(stats.keyCount, 3);
  assert.deepEqual(stats.keys, { yellowKey: 2, blueKey: 1, redKey: 0, greenKey: 0, steelKey: 0 });
  assert.equal(stats.toolCount, 4); // 钥匙不算工具
  assert.equal(stats.constantCount, 2);
  assert.equal(stats.itemCount, 6);
  assert.equal(stats.hp, 1000);
});

test('整表扫一遍：data.js 的 65 只怪都不会算崩', () => {
  const ids = Object.keys(D.enemys);
  assert.ok(ids.length >= 60);
  ids.forEach((id) => {
    const info = R.damage(id, hero({ hp: 99999, atk: 300, def: 200 }), { enemys: D.enemys });
    if (info) {
      assert.ok(Number.isFinite(info.damage) && info.damage >= 0, id);
      assert.ok(Number.isFinite(info.turn) && info.turn >= 0, id);
      assert.ok(info.hero_per_damage > 0, id);
    } else {
      assert.equal(info, null, id);
    }
    assert.ok(Array.isArray(R.criticals(id, hero({ hp: 99999, atk: 300, def: 200 }), 5, { enemys: D.enemys })), id);
    assert.ok(Array.isArray(R.specialText(id, hero(), null, D.enemys)), id);
  });
});

test('纯函数：同一个勇士算两遍结果不变，也不会往 opts 里塞东西', () => {
  const h = hero({ atk: 130, def: 50 });
  const snapshot = JSON.stringify(h);
  const opts = { enemys: D.enemys };
  const first = R.damage('ghostSkeleton', h, opts);
  const second = R.damage('ghostSkeleton', h, opts);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(h), snapshot);
  assert.deepEqual(Object.keys(opts), ['enemys']);
  // 怪物对象也不会被改写（坚固 / 模仿 只在内部生效）
  const sturdy = R.effectiveEnemy('ghostSkeleton', { ghostSkeleton: { special: 3 } }, D.enemys);
  const before = JSON.stringify(sturdy);
  R.damage(sturdy, h);
  assert.equal(JSON.stringify(sturdy), before);
});

test('UMD：浏览器里挂到 globalThis.MotaRules，不依赖 module', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, '..', 'rules.js'), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.equal(typeof sandbox.MotaRules, 'object');
  const browserRules = sandbox.MotaRules;
  assert.equal(browserRules.shopPrice(0), 20);
  // 浏览器模式没有怪物表，直接传怪物对象也照样能算
  const info = browserRules.damage({ id: 'greenSlime', hp: 35, atk: 18, def: 1, special: 0 }, { hp: 1000, atk: 100, def: 100, mdef: 0 });
  assert.equal(info.damage, 0);
  assert.equal(info.turn, 1);
});

test('整表扫一遍：每只怪的特殊属性都能给出说明文字', () => {
  Object.keys(D.enemys).forEach((id) => {
    const enemy = D.enemys[id];
    const texts = R.specialText(enemy, hero(), D.values, D.enemys);
    let expected = 0;
    for (let n = 1; n <= 23; n += 1) if (R.hasSpecial(enemy.special, n, D.enemys)) expected += 1;
    assert.equal(texts.length, expected, id);
    texts.forEach((text) => assert.equal(typeof text, 'string', id));
  });
});
