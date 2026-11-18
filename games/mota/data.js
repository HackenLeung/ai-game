(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.MotaData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // h5data 是 tools/port-h5mota.cjs 从 h5mota《50层魔塔》工程生成的数据。
  // Node 下用 require，浏览器下由 index.html 依次加载 h5data/*.js 挂到 H5Data 上。
  let h5;
  if (typeof module === 'object' && module.exports) {
    h5 = {
      tiles: require('./h5data/tiles.js'),
      enemys: require('./h5data/enemys.js'),
      items: require('./h5data/items.js'),
      floors: require('./h5data/floors.js'),
      commonEvents: require('./h5data/commonEvents.js')
    };
  } else {
    h5 = globalThis.H5Data || {};
  }

  // 全塔属性（对齐 h5mota project/data.js 的 values）
  const values = {
    lavaDamage: 100,
    poisonDamage: 10,
    weakValue: 20,
    redGem: 1,
    blueGem: 1,
    greenGem: 5,
    redPotion: 50,
    bluePotion: 200,
    yellowPotion: 500,
    greenPotion: 800,
    breakArmor: 0.9,
    counterAttack: 0.1,
    purify: 3,
    hatred: 2
  };

  // 起始状态：1 层 (6,11)，生命 1000 / 攻击 100 / 防御 100 / 金币 0，无钥匙，带一份“帮助”
  const start = {
    floorId: 'MT1',
    hp: 1000,
    atk: 100,
    def: 100,
    mdef: 0,
    money: 0,
    exp: 0,
    keys: { yellowKey: 0, blueKey: 0, redKey: 0 },
    constants: { I300: 1 },
    loc: { x: 6, y: 11, dir: 'down' }
  };

  // 怪物特殊属性（数字见 enemys.js 的 special 字段）
  const specials = {
    1: { name: '先攻', text: '怪物首先攻击' },
    2: { name: '魔攻', text: '怪物的伤害无视角色防御' },
    3: { name: '坚固', text: '怪物防御不小于角色攻击 - 1' },
    4: { name: '2连击', text: '怪物每回合攻击 2 次' },
    5: { name: '3连击', text: '怪物每回合攻击 3 次' },
    6: { name: 'N连击', text: '怪物每回合攻击 N 次' },
    7: { name: '破甲', text: '战斗前额外造成角色防御 90% 的伤害' },
    8: { name: '反击', text: '每回合额外造成角色攻击 10% 的伤害，无视防御' },
    9: { name: '净化', text: '战斗前额外造成角色护盾 3 倍的伤害' },
    10: { name: '模仿', text: '怪物的攻防与角色相同' },
    11: { name: '吸血', text: '战斗前吸取角色的生命' },
    12: { name: '中毒', text: '战斗后中毒，每走一步损失生命' },
    13: { name: '衰弱', text: '战斗后攻防暂时下降' },
    14: { name: '诅咒', text: '战斗后无法获得金币和经验' },
    15: { name: '领域', text: '经过怪物周围时自动损失生命' },
    16: { name: '夹击', text: '经过两只相同怪物中间时生命减半' },
    17: { name: '仇恨', text: '战斗前附加累积的仇恨值作为伤害' },
    18: { name: '阻击', text: '经过怪物周围时损失生命，并被怪物后退一格' },
    19: { name: '自爆', text: '战斗后角色生命变成 1' },
    20: { name: '无敌', text: '没有十字架时无法击败' },
    21: { name: '退化', text: '战斗后角色永久下降攻防' },
    22: { name: '固伤', text: '战斗前额外造成固定伤害' },
    23: { name: '重生', text: '怪物被击败后，转换楼层时再次出现' }
  };

  // 道具（名称、说明、分类）来自 h5mota items.js；具体效果在 rules.js 里实现。
  const items = h5.items || {};

  return {
    title: '50层魔塔',
    subtitle: '51层 · 经典复刻',
    version: '51-v1',
    values,
    start,
    specials,
    tiles: h5.tiles || {},
    enemys: h5.enemys || {},
    items,
    floors: h5.floors || { floorIds: [], floors: {}, startFloor: 'MT1' },
    commonEvents: h5.commonEvents || {}
  };
});
