/**
 * games/mota/rules.js — 《50层魔塔》纯规则层
 *
 * 只做计算：战斗伤害、临界、减伤、道具效果、道具说明、祭坛价格、状态统计。
 * 不碰 DOM、不读 localStorage、不依赖其它模块（数值有内置默认值，调用方可覆盖）。
 *
 * 战斗逐行对照 .cache/h5mota51/project/functions.js 的 getEnemyInfo / getDamageInfo：
 * 模仿(10)、坚固(3)、技能二倍斩、十字架、屠龙匕、无敌(20)、吸血(11)、魔攻(2)、连击(4/5/6)、
 * 反击(8)、先攻(1)、破甲(7)、净化(9)、护盾抵扣、仇恨(17)、固伤(22) 的顺序与向下取整均保持一致。
 * 夹击(16)、领域(15)、阻击(18) 属于地图结算（engine 负责），不在 damage 里。
 *
 * 浏览器：window.MotaRules；Node：require('./rules.js')。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MotaRules = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ------------------------------------------------------------------ 常量

  /** 全塔数值，与 data.js 的 values 一致；ctx.values / opts.values 可覆盖 */
  const defaultValues = {
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

  /** 怪物特殊属性名与一句话说明（1–23），与 data.js 的 specials 逐字一致 */
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

  // ------------------------------------------------------------------ 小工具

  /** 一律转成有限数字（undefined / NaN → 0） */
  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function hasOwn(obj, key) {
    return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
  }

  /** 合并全塔数值：缺项用默认值 */
  function withValues(custom) {
    if (!custom) return defaultValues;
    const merged = {};
    Object.keys(defaultValues).forEach(function (key) { merged[key] = defaultValues[key]; });
    Object.keys(custom).forEach(function (key) { merged[key] = custom[key]; });
    return merged;
  }

  /** 本层倍率；未传按 1，0 层是 0 */
  function ratioOf(ratio) {
    if (ratio == null) return 1;
    const r = Number(ratio);
    return Number.isFinite(r) ? r : 1;
  }

  // ------------------------------------------------------------------ 特殊属性

  /**
   * 是否有某个特殊属性（同 h5mota core.enemys.hasSpecial）
   * special 可以是 number / number[] / 怪物 id 字符串 / 带 special 字段的对象。
   * 字符串形式要查怪物表，因此需要传入 enemys（同 h5mota 需要 core.material.enemys）。
   */
  function hasSpecial(special, n, enemys) {
    if (special == null) return false;
    if (Array.isArray(special)) {
      for (let i = 0; i < special.length; i += 1) {
        const item = special[i];
        if (item === n) return true;
        // 数据里可能写成字符串数字
        if (typeof item === 'string' && /^-?\d+$/.test(item) && Number(item) === n) return true;
      }
      return false;
    }
    if (typeof special === 'number') return special === n;
    if (typeof special === 'string') {
      const enemy = enemys && enemys[special];
      if (enemy) return hasSpecial(enemy.special, n, enemys);
      if (/^-?\d+$/.test(special)) return Number(special) === n;
      return false;
    }
    if (typeof special === 'object') return hasSpecial(special.special, n, enemys);
    return false;
  }

  /** 百分比文本用的取整（同 h5mota 的 Math.floor(100 * x)） */
  function percent(value) {
    return Math.floor(100 * num(value));
  }

  // 每种特殊属性的详细说明，参数为 (enemy, hero, values)
  const SPECIAL_TEXT = {
    1: function () { return '怪物首先攻击'; },
    2: function () { return '怪物无视角色的防御'; },
    3: function () { return '怪物防御不小于角色攻击-1'; },
    4: function () { return '怪物每回合攻击2次'; },
    5: function () { return '怪物每回合攻击3次'; },
    6: function (enemy) { return '怪物每回合攻击' + (num(enemy.n) || 4) + '次'; },
    7: function (enemy, hero, V) {
      return '战斗前，怪物附加角色防御的' + percent(enemy.defValue || V.breakArmor) + '%作为伤害';
    },
    8: function (enemy, hero, V) {
      return '战斗时，怪物每回合附加角色攻击的' + percent(enemy.atkValue || V.counterAttack) + '%作为伤害，无视角色防御';
    },
    9: function (enemy, hero, V) {
      return '战斗前，怪物附加角色护盾的' + (num(enemy.n) || num(V.purify)) + '倍作为伤害';
    },
    10: function () { return '怪物的攻防和角色攻防相等'; },
    11: function (enemy, hero) {
      let text = '战斗前，怪物首先吸取角色的' + percent(enemy.value) + '%生命';
      if (hero && hero.hp != null) text += '（约' + Math.floor(num(enemy.value) * num(hero.hp)) + '点）';
      text += '作为伤害';
      if (enemy.add) text += '，并把伤害数值加到自身生命上';
      return text;
    },
    12: function (enemy, hero, V) { return '战斗后，角色陷入中毒状态，每一步损失生命' + V.poisonDamage + '点'; },
    13: function (enemy, hero, V) {
      const weak = num(V.weakValue);
      const shown = weak >= 1 ? weak + '点' : parseInt(weak * 100, 10) + '%';
      return '战斗后，角色陷入衰弱状态，攻防暂时下降' + shown;
    },
    14: function () { return '战斗后，角色陷入诅咒状态，战斗无法获得金币和经验'; },
    15: function (enemy) {
      return '经过怪物周围' + (enemy.zoneSquare ? '九宫格' : '十字') + '范围内' + (num(enemy.range) || 1) +
        '格时自动减生命' + num(enemy.value) + '点';
    },
    16: function () { return '经过两只相同的怪物中间，角色生命值变成一半'; },
    17: function (enemy, hero, V) {
      return '战斗前，怪物附加之前积累的仇恨值作为伤害；战斗后，释放一半的仇恨值。（每杀死一个怪物获得' +
        num(V.hatred) + '点仇恨值）';
    },
    18: function (enemy) {
      return '经过怪物周围' + (enemy.zoneSquare ? '九宫格' : '十字') + '时自动减生命' + num(enemy.value) +
        '点，同时怪物后退一格';
    },
    19: function () { return '战斗后角色的生命值变成1'; },
    20: function () { return '角色无法打败怪物，除非拥有十字架'; },
    21: function (enemy) {
      return '战斗后角色永久下降' + num(enemy.atkValue) + '点攻击和' + num(enemy.defValue) + '点防御';
    },
    22: function (enemy) {
      return '战斗前，怪物对角色造成' + num(enemy.damage) + '点固定伤害，未开启负伤时无视角色护盾。';
    },
    23: function () { return '怪物被击败后，角色转换楼层则怪物将再次出现'; }
  };

  /**
   * 该怪物所有特殊属性的中文说明数组（顺序同 h5mota getSpecials）
   * hero 可选：给了生命值才能算出「吸血约 N 点」。
   */
  function specialText(enemy, hero, customValues, enemys) {
    if (typeof enemy === 'string') enemy = enemys && enemys[enemy];
    if (!enemy) return [];
    const V = withValues(customValues);
    const out = [];
    for (let n = 1; n <= 23; n += 1) {
      if (!hasSpecial(enemy.special, n, enemys)) continue;
      const build = SPECIAL_TEXT[n];
      if (build) out.push(build(enemy, hero, V));
    }
    return out;
  }

  // ------------------------------------------------------------------ 怪物数据

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).forEach(function (key) { out[key] = cloneValue(value[key]); });
      return out;
    }
    return value;
  }

  /**
   * 取一只怪物的当前数据：以基础数据为底，套上 overrides[id]（对应 setEnemy 的效果）。
   * overrides 形如 { redKing: { hp: 800, atk: 500, def: 100 } }；返回带 id 的新对象，不改入参。
   */
  function effectiveEnemy(idOrEnemy, overrides, enemys) {
    const isId = typeof idOrEnemy === 'string';
    const base = isId ? ((enemys && enemys[idOrEnemy]) || { id: idOrEnemy }) : (idOrEnemy || {});
    const id = base.id != null ? base.id : (isId ? idOrEnemy : '');
    const enemy = cloneValue(base);
    enemy.id = id;
    const patch = overrides && id != null ? overrides[id] : null;
    if (patch && typeof patch === 'object') {
      Object.keys(patch).forEach(function (key) { enemy[key] = cloneValue(patch[key]); });
    }
    return enemy;
  }

  function resolveEnemy(enemy, opts) {
    if (!enemy) return null;
    if (typeof enemy === 'string') {
      const table = opts && opts.enemys;
      return (table && table[enemy]) || null;
    }
    return enemy;
  }

  // ------------------------------------------------------------------ 战斗

  /** 勇士四维：负数一律按 0 计（同 h5mota getDamageInfo 开头） */
  function heroView(hero) {
    const h = hero || {};
    return {
      hp: Math.max(0, num(h.hp)),
      atk: Math.max(0, num(h.atk)),
      def: Math.max(0, num(h.def)),
      mdef: Math.max(0, num(h.mdef))
    };
  }

  /** opts 里的开关优先，否则看勇士身上的道具 */
  function optBool(opts, key, hero, itemId) {
    if (opts && typeof opts[key] === 'boolean') return opts[key];
    return hasItem(hero, itemId);
  }

  function hatredOf(opts, hero) {
    if (opts && opts.hatred != null) return num(opts.hatred);
    const flags = (hero && hero.flags) || {};
    return num(flags.hatred);
  }

  /**
   * 战斗伤害（照 h5mota getDamageInfo 移植）
   * 返回 null 表示不可战；否则
   * {damage, turn, mon_hp, mon_atk, mon_def, per_damage, hero_per_damage, init_damage, counterDamage}
   *
   * opts: {cross, knife, skill, hatred, addHp, values, enemys}
   *   cross / knife：是否持有十字架 / 屠龙匕（不传则看 hero.items）
   *   skill：1 表示开着二倍斩（不传则看 hero.flags.skill）
   *   hatred：当前仇恨值（不传则看 hero.flags.hatred）
   *   addHp：疯狂加血模式，最终伤害取负（负数表示回血）
   */
  function damage(enemy, hero, opts) {
    opts = opts || {};
    const e = resolveEnemy(enemy, opts);
    if (!e) return null;
    const raw = hero || {};
    const h = heroView(raw);
    const V = withValues(opts.values);
    const has = function (n) { return hasSpecial(e.special, n, opts.enemys); };

    // ---- 怪物四维：模仿、坚固在攻击力翻倍之前结算（同 getEnemyInfo）
    let mon_hp = num(e.hp);
    let mon_atk = num(e.atk);
    let mon_def = num(e.def);
    if (has(10)) {
      mon_atk = h.atk;
      mon_def = h.def;
    }
    if (has(3) && mon_def < h.atk - 1) mon_def = h.atk - 1;

    // ---- 勇士攻击力加成：二倍斩 → 十字架 → 屠龙匕
    let hero_atk = h.atk;
    const cross = optBool(opts, 'cross', raw, 'cross');
    const knife = optBool(opts, 'knife', raw, 'knife');
    const skill = opts.skill != null ? num(opts.skill) : num(raw.flags && raw.flags.skill);
    if (skill === 1) hero_atk *= 2;
    if (cross && (e.id === 'zombie' || e.id === 'zombieKnight' || e.id === 'vampire')) hero_atk *= 2;
    if (knife && e.id === 'magicDragon') hero_atk *= 2;

    // ---- 无敌：没有十字架打不到
    if (has(20) && !cross) return null;

    // ---- 战前伤害（可被护盾抵消）
    let init = 0;

    // 吸血：先按当前生命吸一口，add 时还给怪物加血
    if (has(11)) {
      const blood = Math.floor(h.hp * num(e.value)) || 0;
      if (e.add) mon_hp += blood;
      init += blood;
    }

    // 每回合伤害：魔攻无视防御，之后才是连击
    let per = mon_atk - h.def;
    if (has(2)) per = mon_atk;
    if (per < 0) per = 0;
    if (has(4)) per *= 2;
    if (has(5)) per *= 3;
    if (has(6)) per *= num(e.n) || 4;

    // 反击：按勇士的攻击次数计回合
    let counter = 0;
    if (has(8)) counter += Math.floor((e.atkValue || V.counterAttack) * hero_atk);

    if (has(1)) init += per;
    if (has(7)) init += Math.floor((e.defValue || V.breakArmor) * h.def);
    if (has(9)) init += Math.floor((num(e.n) || num(V.purify)) * h.mdef);

    // 勇士每回合伤害；打不动就是不可战
    const hero_per = Math.max(hero_atk - mon_def, 0);
    if (hero_per <= 0) return null;

    const turn = Math.ceil(mon_hp / hero_per);
    let total = init + (turn - 1) * per + turn * counter;
    total -= h.mdef;
    if (total < 0) total = 0;
    // 仇恨与固伤在护盾之后加
    if (has(17)) total += hatredOf(opts, raw);
    if (has(22)) total += num(e.damage);
    // 加血模式：伤害取负（0 仍写 0，避免 -0）
    if (opts.addHp) total = total === 0 ? 0 : -total;

    return {
      damage: Math.floor(total),
      turn: Math.floor(turn),
      mon_hp: Math.floor(mon_hp),
      mon_atk: Math.floor(mon_atk),
      mon_def: Math.floor(mon_def),
      per_damage: Math.floor(per),
      hero_per_damage: Math.floor(hero_per),
      init_damage: Math.floor(init),
      counterDamage: Math.floor(counter)
    };
  }

  /** 能不能打：算得出伤害，且伤害小于当前生命 */
  function canBattle(enemy, hero, opts) {
    const info = damage(enemy, hero, opts);
    if (!info) return false;
    return info.damage < num(hero && hero.hp);
  }

  /** 未破防时二分找「刚好破防」的攻击力（同 h5mota _nextCriticals_overAtk） */
  function breakAtk(enemy, hero, opts) {
    const heroAtk = heroView(hero).atk;
    let start = Math.floor(heroAtk) + 1;
    let end = Math.floor(num(enemy.hp)) + Math.floor(num(enemy.def));
    if (start > end) return null;
    while (start < end) {
      const mid = Math.floor((start + end) / 2);
      if (damage(enemy, Object.assign({}, hero, { atk: mid }), opts)) end = mid;
      else start = mid + 1;
    }
    if (!damage(enemy, Object.assign({}, hero, { atk: start }), opts)) return null;
    return start - heroAtk;
  }

  /**
   * 攻击临界表：从当前攻击出发，把这只怪打到更低伤害所需的攻击力
   * 返回 [[还需加多少攻, 减少多少伤害], ...]（同 h5mota _nextCriticals_useTurn）
   * 不可战时给出「还差多少攻击才能破防」；模仿 / 坚固没有临界。
   */
  function criticals(enemy, hero, n, opts) {
    opts = opts || {};
    const limit = n == null ? 5 : Math.max(1, Math.floor(num(n)));
    const e = resolveEnemy(enemy, opts);
    if (!e) return [];
    // 模仿、坚固：加攻没有意义，h5mota 直接不给临界
    if (hasSpecial(e.special, 10, opts.enemys) || hasSpecial(e.special, 3, opts.enemys)) return [];

    const raw = hero || {};
    const info = damage(e, raw, opts);
    if (!info) {
      const need = breakAtk(e, raw, opts);
      return need == null ? [] : [[need, 0]];
    }
    if (info.damage <= 0) return [[0, 0]];

    const hero_atk = heroView(raw).atk;
    const list = [];
    let pre = null;
    for (let t = info.turn - 1; t >= 1; t -= 1) {
      const nextAtk = Math.ceil(info.mon_hp / t) + info.mon_def;
      if (nextAtk <= hero_atk) break;
      if (nextAtk !== pre) {
        const nextInfo = damage(e, Object.assign({}, raw, { atk: nextAtk }), opts);
        if (!nextInfo) break;
        list.push([nextAtk - hero_atk, Math.floor(info.damage - nextInfo.damage)]);
        if (nextInfo.damage <= 0) break;
        pre = nextAtk;
      }
      if (list.length >= limit) break;
    }
    if (list.length === 0) list.push([0, 0]);
    return list;
  }

  /** 多加 k 点防御能少掉多少血（打不动返回 '???'，同 h5mota getDefDamage） */
  function defDamage(enemy, hero, k, opts) {
    const raw = hero || {};
    const add = k == null ? 1 : num(k);
    const now = damage(enemy, raw, opts);
    if (!now) return '???';
    const next = damage(enemy, Object.assign({}, raw, { def: num(raw.def) + add }), opts);
    if (!next) return '???';
    return now.damage - next.damage;
  }

  // ------------------------------------------------------------------ 道具数据

  // 宝石 / 血瓶：数值 × 本层倍率
  const GROWTH = {
    redGem: { field: 'atk', value: 'redGem', label: '攻击', kind: 'atk' },
    blueGem: { field: 'def', value: 'blueGem', label: '防御', kind: 'def' },
    greenGem: { field: 'mdef', value: 'greenGem', label: '护盾', kind: 'mdef' },
    redPotion: { field: 'hp', value: 'redPotion', label: '生命', kind: 'hp' },
    bluePotion: { field: 'hp', value: 'bluePotion', label: '生命', kind: 'hp' },
    yellowPotion: { field: 'hp', value: 'yellowPotion', label: '生命', kind: 'hp' },
    greenPotion: { field: 'hp', value: 'greenPotion', label: '生命', kind: 'hp' }
  };

  // 剑盾加值取自 h5mota items.js 的 itemEffect（不是 equip.value：本作 equip 只是摆设）
  const WEAPONS = { sword0: 0, sword1: 10, sword2: 20, sword3: 40, sword4: 50, sword5: 100 };
  const SHIELDS = { shield0: 0, shield1: 10, shield2: 20, shield3: 40, shield4: 50, shield5: 100 };

  const KEY_IDS = {
    yellowKey: '黄钥匙',
    blueKey: '蓝钥匙',
    redKey: '红钥匙',
    greenKey: '绿钥匙',
    steelKey: '铁门钥匙'
  };

  // 收集类工具：拾取时 items.tools + 1
  const TOOL_NAMES = {
    pickaxe: '镐',
    icePickaxe: '破冰镐',
    bomb: '炸弹',
    earthquake: '地震卷轴',
    bigKey: '魔法钥匙',
    centerFly: '瞬移',
    upFly: '向上传送',
    downFly: '向下传送',
    jumpShoes: '跳跃靴',
    hammer: '圣锤',
    superPotion: '圣水',
    poisonWine: '解毒药水',
    weakWine: '解衰药水',
    curseWine: '解咒药水',
    superWine: '万能药水'
  };

  // 常驻道具：拾取时 items.constants 置 1
  const CONSTANT_NAMES = {
    cross: '十字架',
    coin: '幸运金币',
    knife: '屠龙匕首',
    book: '游戏手册',
    wand: '备忘录',
    snow: '冰魔法',
    amulet: '护符',
    fly: '魔杖',
    skill1: '技能：二倍斩',
    I300: '帮助',
    I333: '新物品'
  };

  const ITEM_NAMES = Object.assign({
    redGem: '红宝石',
    blueGem: '蓝宝石',
    greenGem: '绿宝石',
    yellowGem: '黄宝石',
    redPotion: '红血瓶',
    bluePotion: '蓝血瓶',
    yellowPotion: '黄血瓶',
    greenPotion: '绿血瓶',
    sword0: '破旧的剑',
    sword1: '铁剑',
    sword2: '银剑',
    sword3: '骑士剑',
    sword4: '圣剑',
    sword5: '神圣剑',
    shield0: '破旧的盾',
    shield1: '铁盾',
    shield2: '银盾',
    shield3: '骑士盾',
    shield4: '圣盾',
    shield5: '神圣盾',
    pack: '钱袋',
    moneyPocket: '钱袋',
    centerFly3: '瞬移',
    lifeWand: '魔杖'
  }, KEY_IDS, TOOL_NAMES, CONSTANT_NAMES);

  function itemName(id) {
    return ITEM_NAMES[id] || String(id);
  }

  // ------------------------------------------------------------------ 勇士道具

  function ensureHero(hero) {
    ['hp', 'atk', 'def', 'mdef', 'money', 'exp'].forEach(function (key) {
      if (hero[key] == null) hero[key] = 0;
    });
    if (!hero.items) hero.items = {};
    ['constants', 'tools', 'equips'].forEach(function (key) {
      if (!hero.items[key]) hero.items[key] = {};
    });
    if (!hero.flags) hero.flags = {};
    return hero;
  }

  /** 某道具的持有数（钥匙可能记在 hero.keys，也可能记在 items.tools） */
  function itemCount(hero, id) {
    if (!hero || !id) return 0;
    if (hasOwn(KEY_IDS, id) && hero.keys && hero.keys[id] != null) return num(hero.keys[id]);
    const items = hero.items || {};
    const bags = ['constants', 'tools', 'equips'];
    for (let i = 0; i < bags.length; i += 1) {
      const bag = items[bags[i]];
      if (bag && bag[id] != null) return num(bag[id]);
    }
    return 0;
  }

  function hasItem(hero, id) {
    return itemCount(hero, id) > 0;
  }

  function gainKey(hero, id, n, log) {
    if (hero.keys) hero.keys[id] = num(hero.keys[id]) + n;
    else hero.items.tools[id] = num(hero.items.tools[id]) + n;
    log.push(KEY_IDS[id] + ' +' + n);
    return 'key';
  }

  function consumeTool(hero, id) {
    const left = num(hero.items.tools[id]) - 1;
    if (left > 0) hero.items.tools[id] = left;
    else delete hero.items.tools[id];
  }

  /** 圣水回血量：round(0.74 * (攻击 + 防御)) * 10 */
  function superPotionHp(hero) {
    return Math.round(0.74 * (num(hero.atk) + num(hero.def))) * 10;
  }

  // ------------------------------------------------------------------ 道具效果

  /**
   * 拾取一件道具（同 h5mota getItemEffect 里的 itemEffect）
   * 返回 kind 字符串；未知道具按「捡到但没效果」处理（h5mota 会吃掉图块）。
   */
  function pickupEffect(id, hero, ratio, V, log) {
    // 宝石 / 血瓶：× 本层倍率（0 层倍率 0，照样算捡到）
    if (hasOwn(GROWTH, id)) {
      const grow = GROWTH[id];
      const add = num(V[grow.value]) * ratio;
      hero[grow.field] = num(hero[grow.field]) + add;
      log.push(grow.label + ' +' + add);
      return grow.kind;
    }

    // 黄宝石：全属性提升（可选的加点由引擎再补一步）
    if (id === 'yellowGem') {
      hero.hp = num(hero.hp) + 1000;
      hero.atk = num(hero.atk) + 6;
      hero.def = num(hero.def) + 6;
      hero.mdef = num(hero.mdef) + 10;
      log.push('生命 +1000', '攻击 +6', '防御 +6', '护盾 +10');
      return 'use';
    }

    // 剑：加攻并记下当前武器
    if (hasOwn(WEAPONS, id)) {
      const add = WEAPONS[id];
      hero.atk = num(hero.atk) + add;
      hero.flags.nowWeapon = id;
      log.push('攻击 +' + add);
      return 'atk';
    }

    // 盾：加防并记下当前盾；神圣盾额外给护盾与魔法免疫
    if (hasOwn(SHIELDS, id)) {
      const add = SHIELDS[id];
      hero.def = num(hero.def) + add;
      hero.flags.nowShield = id;
      log.push('防御 +' + add);
      if (id === 'shield5') {
        hero.mdef = num(hero.mdef) + 100;
        hero.flags['魔法免疫'] = true;
        log.push('护盾 +100', '获得魔法免疫');
      }
      return 'def';
    }

    if (hasOwn(KEY_IDS, id)) return gainKey(hero, id, 1, log);

    // 钱袋
    if (id === 'pack' || id === 'moneyPocket') {
      hero.money = num(hero.money) + 500;
      log.push('金币 +500');
      return 'money';
    }

    // 三合一瞬移（h5mota：addItem('centerFly', 3)）
    if (id === 'centerFly3') {
      hero.items.tools.centerFly = num(hero.items.tools.centerFly) + 3;
      log.push('瞬移 +3');
      return 'tool';
    }

    // 魔杖：h5mota 的 lifeWand 用一次就变成 fly，这里直接当拿到魔杖
    if (id === 'lifeWand') {
      hero.items.constants.fly = 1;
      log.push('获得 魔杖');
      return 'constant';
    }

    if (hasOwn(TOOL_NAMES, id)) {
      hero.items.tools[id] = num(hero.items.tools[id]) + 1;
      log.push('获得 ' + TOOL_NAMES[id]);
      return 'tool';
    }

    if (hasOwn(CONSTANT_NAMES, id)) {
      hero.items.constants[id] = 1;
      log.push('获得 ' + CONSTANT_NAMES[id]);
      return 'constant';
    }

    // 道具表里没有的图块（例如 I301 这类占位 id）：捡起来但不产生效果
    log.push('获得 ' + itemName(id));
    return 'none';
  }

  /**
   * 从道具栏使用一件道具。地图类效果（炸怪、破墙、瞬移…）由引擎执行，
   * 这里只处理数值/状态并扣掉一件。返回 null 表示当前用不了。
   */
  function useEffect(id, hero, V, log) {
    if (id === 'superPotion') {
      if (num(hero.items.tools.superPotion) <= 0) return null;
      const hp = superPotionHp(hero);
      hero.hp = num(hero.hp) + hp;
      log.push('生命 +' + hp);
      consumeTool(hero, id);
      return 'hp';
    }

    const WINES = { poisonWine: ['poison', '中毒'], weakWine: ['weak', '衰弱'], curseWine: ['curse', '诅咒'] };
    if (hasOwn(WINES, id)) {
      if (num(hero.items.tools[id]) <= 0) return null;
      const pair = WINES[id];
      if (id === 'weakWine' && hero.flags.weak) {
        const v = num(V.weakValue);
        hero.atk = num(hero.atk) + v;
        hero.def = num(hero.def) + v;
      }
      delete hero.flags[pair[0]];
      log.push('解除' + pair[1]);
      consumeTool(hero, id);
      return 'use';
    }

    if (id === 'superWine') {
      if (num(hero.items.tools[id]) <= 0) return null;
      if (hero.flags.weak) {
        const v = num(V.weakValue);
        hero.atk = num(hero.atk) + v;
        hero.def = num(hero.def) + v;
      }
      ['poison', 'weak', 'curse'].forEach(function (flag) { delete hero.flags[flag]; });
      log.push('解除所有不良状态');
      consumeTool(hero, id);
      return 'use';
    }

    // 二倍斩：开 / 关
    if (id === 'skill1') {
      const on = num(hero.flags.skill) === 1;
      hero.flags.skill = on ? 0 : 1;
      hero.flags.skillName = on ? '无' : '二倍斩';
      log.push(on ? '关闭二倍斩' : '开启二倍斩');
      return 'use';
    }

    // 其余工具：引擎负责地图效果，这里只扣数量
    if (num(hero.items.tools[id]) > 0) {
      consumeTool(hero, id);
      log.push('使用 ' + itemName(id));
      return 'use';
    }
    return null;
  }

  /**
   * 道具效果：默认是「拾取」，ctx.use 为 true 时是「从道具栏使用」。
   * ctx = {hero, ratio = 1, values, enemys, use = false}
   * 返回 {log: string[], changed: boolean, kind}
   *   kind: 'atk' | 'def' | 'hp' | 'mdef' | 'key' | 'tool' | 'constant' | 'money' | 'use' | 'none'
   *   changed：true 表示这件道具被吃掉 / 生效了（引擎应当移除图块）
   * 直接修改 ctx.hero。
   */
  function itemEffect(id, ctx) {
    ctx = ctx || {};
    const log = [];
    const hero = ctx.hero;
    if (!hero || !id) return { log: log, changed: false, kind: 'none' };
    ensureHero(hero);
    const V = withValues(ctx.values);
    const ratio = ratioOf(ctx.ratio);
    const kind = ctx.use ? useEffect(id, hero, V, log) : pickupEffect(id, hero, ratio, V, log);
    return { log: log, changed: kind != null, kind: kind || 'none' };
  }

  // ------------------------------------------------------------------ 道具说明

  const TOOL_TEXT = {
    superPotion: '生命 +round(0.74*(攻击+防御))*10',
    yellowKey: '打开一扇黄门',
    blueKey: '打开一扇蓝门',
    redKey: '打开一扇红门',
    greenKey: '打开一扇绿门',
    steelKey: '打开一扇铁门',
    bigKey: '打开本层所有黄门',
    pickaxe: '破坏身边可破的墙',
    icePickaxe: '破坏面前的冰墙',
    bomb: '炸死身边生命低于 500 的敌人',
    earthquake: '破坏本层所有可破的墙',
    centerFly: '移到本层中心对称的位置',
    centerFly3: '可用 3 次瞬移到中心对称的位置',
    upFly: '传送到上一层同坐标',
    downFly: '传送到下一层同坐标',
    jumpShoes: '向前跳两格',
    hammer: '消灭面前的怪物',
    poisonWine: '解除中毒状态',
    weakWine: '解除衰弱状态',
    curseWine: '解除诅咒状态',
    superWine: '解除所有不良状态',
    skill1: '开关二倍斩（攻击翻倍）',
    cross: '对吸血鬼和兽人攻击力加倍',
    coin: '战后获得双倍金钱',
    knife: '对魔龙攻击力加倍',
    book: '察看敌人参数',
    wand: '自动记录谈话内容',
    snow: '冻结身边的熔岩',
    amulet: '持有时无视负面地形',
    fly: '飞往到过的楼层',
    yellowGem: '生命 +1000，攻击 +6，防御 +6，护盾 +10'
  };

  /**
   * 道具说明（工具条、地图悬浮提示都用它）。
   * ratio：本层倍率，血瓶/宝石这类会按层放大，传进来才是这一层真实的加量。
   */
  function toolText(id, customValues, ratio) {
    const V = withValues(customValues);
    if (hasOwn(TOOL_TEXT, id)) return TOOL_TEXT[id];
    if (hasOwn(WEAPONS, id)) return '攻击 +' + WEAPONS[id];
    if (hasOwn(SHIELDS, id)) return '防御 +' + SHIELDS[id] + (id === 'shield5' ? '，护盾 +100，魔法免疫' : '');
    if (hasOwn(GROWTH, id)) {
      const grow = GROWTH[id];
      return grow.label + ' +' + num(V[grow.value]) * ratioOf(ratio);
    }
    if (id === 'pack' || id === 'moneyPocket') return '金币 +500';
    return '';
  }

  // ------------------------------------------------------------------ 商店与统计

  /** 祭坛价格：times 为已经买过的次数（第一次 times=0 → 20） */
  function shopPrice(times) {
    const t = Math.max(0, Math.floor(num(times)));
    return 20 + 10 * (t + 1) * t;
  }

  /** 攻防和、钥匙总数、道具件数等统计（结局与状态栏用） */
  function heroStats(hero) {
    const h = hero || {};
    const atk = num(h.atk);
    const def = num(h.def);
    const keys = {
      yellowKey: itemCount(h, 'yellowKey'),
      blueKey: itemCount(h, 'blueKey'),
      redKey: itemCount(h, 'redKey'),
      greenKey: itemCount(h, 'greenKey'),
      steelKey: itemCount(h, 'steelKey')
    };
    const items = h.items || {};
    let toolCount = 0;
    let constantCount = 0;
    Object.keys(items.tools || {}).forEach(function (id) {
      if (!hasOwn(KEY_IDS, id)) toolCount += num(items.tools[id]);
    });
    Object.keys(items.constants || {}).forEach(function (id) {
      constantCount += num(items.constants[id]);
    });
    return {
      hp: num(h.hp),
      atk: atk,
      def: def,
      mdef: num(h.mdef),
      money: num(h.money),
      atkDefSum: atk + def,
      keys: keys,
      keyCount: keys.yellowKey + keys.blueKey + keys.redKey,
      toolCount: toolCount,
      constantCount: constantCount,
      itemCount: toolCount + constantCount
    };
  }

  return {
    specials: specials,
    defaultValues: defaultValues,
    hasSpecial: hasSpecial,
    specialText: specialText,
    effectiveEnemy: effectiveEnemy,
    damage: damage,
    canBattle: canBattle,
    criticals: criticals,
    defDamage: defDamage,
    itemEffect: itemEffect,
    toolText: toolText,
    shopPrice: shopPrice,
    heroStats: heroStats,
    // 引擎/手册也常用的小查询
    hasItem: hasItem,
    itemCount: itemCount,
    itemName: itemName,
    superPotionHp: superPotionHp
  };
});
