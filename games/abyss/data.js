// 深渊回响 · 卡牌与状态数据。规则逻辑见 engine.js，敌人与关卡见 world.js。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AbyssCards = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;
  const SAVE_KEY = 'abyss-echo-save-v1';

  // 状态：name 显示名，kind 决定图标颜色，text 用于悬浮说明。
  const STATUS = {
    strength: { name: '力量', kind: 'buff', text: '每层使攻击伤害 +1。' },
    dexterity: { name: '迅捷', kind: 'buff', text: '每层使获得的格挡 +1。' },
    focus: { name: '敏锐', kind: 'buff', text: '每层使攻击伤害 +1，不会自然消失。' },
    plating: { name: '装甲', kind: 'buff', text: '每回合开始时获得等量格挡。' },
    perception: { name: '感知', kind: 'buff', text: '每回合额外抽等量张牌。' },
    amplify: { name: '增幅', kind: 'buff', text: '每张攻击牌额外造成等量伤害。' },
    reflect: { name: '反射', kind: 'buff', text: '受到攻击时对攻击者反弹等量伤害。' },
    thorns: { name: '荆棘', kind: 'buff', text: '受到攻击时对攻击者反弹等量伤害，由敌人或遗物提供。' },
    enrage: { name: '狂暴', kind: 'buff', text: '每回合结束时获得等量力量。' },
    devour: { name: '吞噬', kind: 'buff', text: '摧毁敌人时恢复等量生命。' },
    turret: { name: '炮台', kind: 'buff', text: '每回合开始时对随机敌人造成等量伤害。' },
    skillBlock: { name: '连线', kind: 'buff', text: '每打出技能牌获得等量格挡。' },
    resonance: { name: '共鸣', kind: 'buff', text: '每打出攻击牌获得等量敏锐。' },
    plague: { name: '瘟疫', kind: 'buff', text: '每回合开始时对所有敌人施加等量中毒。' },
    blockRetain: { name: '护壁', kind: 'buff', text: '回合结束时保留等量格挡。' },
    undying: { name: '不死', kind: 'buff', text: '持续期间生命不会低于 1 点。' },
    regen: { name: '再生', kind: 'buff', text: '每回合结束时恢复等量生命，并减少 1 层。' },
    energyBonus: { name: '超载', kind: 'buff', text: '每回合开始时额外获得等量能量，代价是失去生命。' },
    soulEater: { name: '噬魂', kind: 'buff', text: '每摧毁一个敌人，永久获得额外最大生命。' },
    poison: { name: '中毒', kind: 'debuff', text: '回合开始时按层数失去生命，随后减少 1 层。' },
    burn: { name: '灼烧', kind: 'debuff', text: '回合结束时按层数失去生命，随后减少 1 层。' },
    vulnerable: { name: '易伤', kind: 'debuff', text: '受到的攻击伤害提高 50%。' },
    weak: { name: '虚弱', kind: 'debuff', text: '造成的攻击伤害降低 25%。' },
    frail: { name: '脆弱', kind: 'debuff', text: '获得的格挡降低 25%。' },
    stun: { name: '眩晕', kind: 'debuff', text: '无法行动，回合结束时减少 1 层。' },
  };
  const NEGATIVE = ['poison', 'burn', 'vulnerable', 'weak', 'frail', 'stun'];

  const COLORS = {
    core: { id: 'core', name: '舰核', text: '维修、护盾与精准打击。' },
    necrosis: { id: 'necrosis', name: '死域', text: '中毒、亡灵与以血换力。' },
    psi: { id: 'psi', name: '心能', text: '抽牌、敏锐与精神干扰。' },
    neutral: { id: 'neutral', name: '通用', text: '任何来源都可能出现的部件。' },
  };

  const RARITY = { basic: '基础', common: '普通', uncommon: '罕见', rare: '稀有', special: '衍生' };
  const TYPE = { attack: '攻击', skill: '技能', power: '能力', status: '状态' };

  // 卡牌：cost 为费用，target 为 'enemy' | 'all' | 'none'，u 为升级后的覆盖字段。
  const CARDS = [
    // ---------- 基础 ----------
    { id: 'plasma-strike', name: '等离子刀', type: 'attack', rarity: 'basic', color: 'core', cost: 1, target: 'enemy', text: '造成 6 点伤害。', effects: [{ type: 'damage', value: 6 }], u: { name: '等离子刀+', text: '造成 9 点伤害。', effects: [{ type: 'damage', value: 9 }] } },
    { id: 'phase-barrier', name: '相位屏障', type: 'skill', rarity: 'basic', color: 'core', cost: 1, target: 'none', text: '获得 5 点格挡。', effects: [{ type: 'block', value: 5 }], u: { name: '相位屏障+', text: '获得 8 点格挡。', effects: [{ type: 'block', value: 8 }] } },
    { id: 'charge', name: '冲锋突进', type: 'attack', rarity: 'basic', color: 'core', cost: 1, target: 'enemy', text: '造成 8 点伤害，获得 4 点格挡。', effects: [{ type: 'damage', value: 8 }, { type: 'block', value: 4 }], u: { name: '冲锋突进+', text: '造成 10 点伤害，获得 6 点格挡。', effects: [{ type: 'damage', value: 10 }, { type: 'block', value: 6 }] } },
    { id: 'corrosive-touch', name: '腐蚀之触', type: 'attack', rarity: 'basic', color: 'necrosis', cost: 0, target: 'enemy', text: '造成 3 点伤害，施加 2 层中毒。', effects: [{ type: 'damage', value: 3 }, { type: 'status', status: 'poison', value: 2 }], u: { name: '腐蚀之触+', text: '造成 4 点伤害，施加 3 层中毒。', effects: [{ type: 'damage', value: 4 }, { type: 'status', status: 'poison', value: 3 }] } },
    { id: 'summon-horde', name: '尸群召唤', type: 'skill', rarity: 'basic', color: 'necrosis', cost: 1, target: 'none', text: '将 2 张「残骸」加入手牌。', effects: [{ type: 'addCard', card: 'wreck', count: 2, destination: 'hand' }], u: { name: '尸群召唤+', text: '将 3 张「残骸」加入手牌。', effects: [{ type: 'addCard', card: 'wreck', count: 3, destination: 'hand' }] } },
    { id: 'psi-bolt', name: '心能冲击', type: 'attack', rarity: 'basic', color: 'psi', cost: 1, target: 'enemy', text: '造成 9 点伤害，抽 1 张牌。', effects: [{ type: 'damage', value: 9 }, { type: 'draw', value: 1 }], u: { name: '心能冲击+', text: '造成 12 点伤害，抽 1 张牌。', effects: [{ type: 'damage', value: 12 }, { type: 'draw', value: 1 }] } },
    { id: 'mind-link', name: '精神链接', type: 'skill', rarity: 'basic', color: 'psi', cost: 0, target: 'enemy', text: '施加 1 层易伤，抽 1 张牌。', effects: [{ type: 'status', status: 'vulnerable', value: 1 }, { type: 'draw', value: 1 }], u: { name: '精神链接+', text: '施加 2 层易伤，抽 1 张牌。', effects: [{ type: 'status', status: 'vulnerable', value: 2 }, { type: 'draw', value: 1 }] } },

    // ---------- 舰核 · 普通 ----------
    { id: 'pulse-wave', name: '震荡脉冲', type: 'attack', rarity: 'common', color: 'core', cost: 1, target: 'enemy', text: '造成 5 点伤害。本回合每打出过一张攻击牌，额外造成 2 点。', effects: [{ type: 'damage', value: 5 }, { type: 'bonusIfAttacks', per: 2 }], u: { name: '震荡脉冲+', text: '造成 6 点伤害。本回合每打出过一张攻击牌，额外造成 3 点。', effects: [{ type: 'damage', value: 6 }, { type: 'bonusIfAttacks', per: 3 }] } },
    { id: 'emergency-shield', name: '应急护罩', type: 'skill', rarity: 'common', color: 'core', cost: 1, target: 'none', text: '获得 7 点格挡，抽 1 张牌。', effects: [{ type: 'block', value: 7 }, { type: 'draw', value: 1 }], u: { name: '应急护罩+', text: '获得 9 点格挡，抽 1 张牌。', effects: [{ type: 'block', value: 9 }, { type: 'draw', value: 1 }] } },
    { id: 'barrage', name: '弹幕齐射', type: 'attack', rarity: 'common', color: 'core', cost: 1, target: 'enemy', text: '造成 3 点伤害，3 次。', effects: [{ type: 'damage', value: 3, times: 3 }], u: { name: '弹幕齐射+', text: '造成 4 点伤害，3 次。', effects: [{ type: 'damage', value: 4, times: 3 }] } },
    { id: 'armor-piercer', name: '破甲弹', type: 'attack', rarity: 'common', color: 'core', cost: 1, target: 'enemy', text: '造成 7 点伤害。若目标有格挡，额外造成 7 点。', effects: [{ type: 'damage', value: 7 }, { type: 'bonusIfGuarded', value: 7 }], u: { name: '破甲弹+', text: '造成 9 点伤害。若目标有格挡，额外造成 9 点。', effects: [{ type: 'damage', value: 9 }, { type: 'bonusIfGuarded', value: 9 }] } },
    { id: 'dual-strike', name: '双持斩', type: 'attack', rarity: 'common', color: 'core', cost: 1, target: 'enemy', text: '造成 5 点伤害，2 次。', effects: [{ type: 'damage', value: 5, times: 2 }], u: { name: '双持斩+', text: '造成 7 点伤害，2 次。', effects: [{ type: 'damage', value: 7, times: 2 }] } },
    { id: 'scan', name: '弱点扫描', type: 'skill', rarity: 'common', color: 'core', cost: 0, target: 'enemy', text: '施加 2 层易伤。', effects: [{ type: 'status', status: 'vulnerable', value: 2 }], u: { name: '弱点扫描+', text: '施加 3 层易伤。', effects: [{ type: 'status', status: 'vulnerable', value: 3 }] } },
    { id: 'overdrive-strike', name: '超载打击', type: 'attack', rarity: 'common', color: 'core', cost: 1, target: 'enemy', text: '造成 13 点伤害，失去 4 点生命。', effects: [{ type: 'damage', value: 13 }, { type: 'loseHp', value: 4 }], u: { name: '超载打击+', text: '造成 17 点伤害，失去 3 点生命。', effects: [{ type: 'damage', value: 17 }, { type: 'loseHp', value: 3 }] } },
    { id: 'multi-lock', name: '多重锁定', type: 'attack', rarity: 'common', color: 'core', cost: 2, target: 'all', text: '对所有敌人造成 10 点伤害。', effects: [{ type: 'damage', value: 10, target: 'all' }], u: { name: '多重锁定+', text: '对所有敌人造成 14 点伤害。', effects: [{ type: 'damage', value: 14, target: 'all' }] } },
    { id: 'field-repair', name: '战场维修', type: 'skill', rarity: 'common', color: 'core', cost: 1, target: 'none', exhaust: true, text: '恢复 9 点生命。消耗。', effects: [{ type: 'heal', value: 9 }], u: { name: '战场维修+', text: '恢复 13 点生命。消耗。', effects: [{ type: 'heal', value: 13 }] } },
    { id: 'iron-will', name: '意志坚定', type: 'skill', rarity: 'common', color: 'core', cost: 0, target: 'none', text: '获得 4 点格挡，抽 1 张牌。', effects: [{ type: 'block', value: 4 }, { type: 'draw', value: 1 }], u: { name: '意志坚定+', text: '获得 6 点格挡，抽 1 张牌。', effects: [{ type: 'block', value: 6 }, { type: 'draw', value: 1 }] } },
    { id: 'plunder', name: '掠夺', type: 'skill', rarity: 'common', color: 'core', cost: 1, target: 'none', exhaust: true, text: '获得 14 金币，抽 1 张牌。消耗。', effects: [{ type: 'gainGold', value: 14 }, { type: 'draw', value: 1 }], u: { name: '掠夺+', text: '获得 22 金币，抽 1 张牌。消耗。', effects: [{ type: 'gainGold', value: 22 }, { type: 'draw', value: 1 }] } },

    // ---------- 舰核 · 罕见 ----------
    { id: 'tactical-sim', name: '战术推演', type: 'skill', rarity: 'uncommon', color: 'core', cost: 1, target: 'none', text: '抽 2 张牌。', effects: [{ type: 'draw', value: 2 }], u: { name: '战术推演+', cost: 0, text: '抽 2 张牌。', effects: [{ type: 'draw', value: 2 }] } },
    { id: 'siphon', name: '能量虹吸', type: 'skill', rarity: 'uncommon', color: 'core', cost: 1, target: 'none', text: '抽 2 张牌，获得 1 点能量。', effects: [{ type: 'draw', value: 2 }, { type: 'energy', value: 1 }], u: { name: '能量虹吸+', text: '抽 3 张牌，获得 1 点能量。', effects: [{ type: 'draw', value: 3 }, { type: 'energy', value: 1 }] } },
    { id: 'plated', name: '强化装甲', type: 'power', rarity: 'uncommon', color: 'core', cost: 1, target: 'none', text: '每回合开始时获得 3 点格挡。', effects: [{ type: 'status', status: 'plating', value: 3, target: 'self' }], u: { name: '强化装甲+', text: '每回合开始时获得 5 点格挡。', effects: [{ type: 'status', status: 'plating', value: 5, target: 'self' }] } },
    { id: 'combat-instinct', name: '战斗直觉', type: 'power', rarity: 'uncommon', color: 'core', cost: 1, target: 'none', text: '每回合额外抽 1 张牌。', effects: [{ type: 'status', status: 'perception', value: 1, target: 'self' }], u: { name: '战斗直觉+', cost: 0, text: '每回合额外抽 1 张牌。', effects: [{ type: 'status', status: 'perception', value: 1, target: 'self' }] } },
    { id: 'reflect-shield', name: '反射护盾', type: 'power', rarity: 'uncommon', color: 'core', cost: 2, target: 'none', text: '受到攻击时对攻击者造成 4 点伤害。', effects: [{ type: 'status', status: 'reflect', value: 4, target: 'self' }], u: { name: '反射护盾+', text: '受到攻击时对攻击者造成 7 点伤害。', effects: [{ type: 'status', status: 'reflect', value: 7, target: 'self' }] } },
    { id: 'calibrate', name: '精密校准', type: 'skill', rarity: 'uncommon', color: 'core', cost: 1, target: 'enemy', text: '施加 2 层易伤与 2 层虚弱。', effects: [{ type: 'status', status: 'vulnerable', value: 2 }, { type: 'status', status: 'weak', value: 2 }], u: { name: '精密校准+', text: '施加 3 层易伤与 3 层虚弱。', effects: [{ type: 'status', status: 'vulnerable', value: 3 }, { type: 'status', status: 'weak', value: 3 }] } },
    { id: 'lethal-boost', name: '致命强化', type: 'power', rarity: 'uncommon', color: 'core', cost: 1, target: 'none', text: '每张攻击牌额外造成 2 点伤害。', effects: [{ type: 'status', status: 'amplify', value: 2, target: 'self' }], u: { name: '致命强化+', text: '每张攻击牌额外造成 3 点伤害。', effects: [{ type: 'status', status: 'amplify', value: 3, target: 'self' }] } },
    { id: 'cluster', name: '集束炸弹', type: 'attack', rarity: 'uncommon', color: 'core', cost: 2, target: 'enemy', text: '造成 7 点伤害，2 次，施加 1 层易伤。', effects: [{ type: 'damage', value: 7, times: 2 }, { type: 'status', status: 'vulnerable', value: 1 }], u: { name: '集束炸弹+', text: '造成 9 点伤害，2 次，施加 2 层易伤。', effects: [{ type: 'damage', value: 9, times: 2 }, { type: 'status', status: 'vulnerable', value: 2 }] } },
    { id: 'bastion', name: '铁壁', type: 'skill', rarity: 'uncommon', color: 'core', cost: 2, target: 'none', text: '获得 16 点格挡。', effects: [{ type: 'block', value: 16 }], u: { name: '铁壁+', text: '获得 22 点格挡。', effects: [{ type: 'block', value: 22 }] } },
    { id: 'energy-bulwark', name: '能量护壁', type: 'power', rarity: 'uncommon', color: 'core', cost: 2, target: 'none', text: '回合结束时保留 6 点格挡。', effects: [{ type: 'status', status: 'blockRetain', value: 6, target: 'self' }], u: { name: '能量护壁+', text: '回合结束时保留 9 点格挡。', effects: [{ type: 'status', status: 'blockRetain', value: 9, target: 'self' }] } },
    { id: 'counter', name: '应急反制', type: 'skill', rarity: 'uncommon', color: 'core', cost: 1, target: 'none', text: '获得 9 点格挡，对随机敌人造成 5 点伤害。', effects: [{ type: 'block', value: 9 }, { type: 'damageRandom', value: 5, times: 1 }], u: { name: '应急反制+', text: '获得 12 点格挡，对随机敌人造成 8 点伤害。', effects: [{ type: 'block', value: 12 }, { type: 'damageRandom', value: 8, times: 1 }] } },
    { id: 'shield-convert', name: '护盾转换', type: 'skill', rarity: 'uncommon', color: 'core', cost: 1, target: 'none', text: '弃掉所有手牌，每弃 1 张获得 3 点格挡。', effects: [{ type: 'discardAll', blockEach: 3 }], u: { name: '护盾转换+', text: '弃掉所有手牌，每弃 1 张获得 4 点格挡。', effects: [{ type: 'discardAll', blockEach: 4 }] } },
    { id: 'tactician', name: '战术大师', type: 'power', rarity: 'uncommon', color: 'core', cost: 0, target: 'none', text: '每打出技能牌获得 2 点格挡。', effects: [{ type: 'status', status: 'skillBlock', value: 2, target: 'self' }], u: { name: '战术大师+', text: '每打出技能牌获得 3 点格挡。', effects: [{ type: 'status', status: 'skillBlock', value: 3, target: 'self' }] } },
    { id: 'sustained', name: '持续火力', type: 'power', rarity: 'uncommon', color: 'core', cost: 1, target: 'none', text: '每回合开始时对随机敌人造成 4 点伤害。', effects: [{ type: 'status', status: 'turret', value: 4, target: 'self' }], u: { name: '持续火力+', text: '每回合开始时对随机敌人造成 6 点伤害。', effects: [{ type: 'status', status: 'turret', value: 6, target: 'self' }] } },
    { id: 'purify', name: '净化', type: 'skill', rarity: 'uncommon', color: 'core', cost: 1, target: 'none', text: '移除自身所有负面状态，抽 1 张牌。', effects: [{ type: 'purge' }, { type: 'draw', value: 1 }], u: { name: '净化+', text: '移除自身所有负面状态，恢复 5 点生命，抽 1 张牌。', effects: [{ type: 'purge' }, { type: 'heal', value: 5 }, { type: 'draw', value: 1 }] } },

    // ---------- 舰核 · 稀有 ----------
    { id: 'annihilate', name: '湮灭炮', type: 'attack', rarity: 'rare', color: 'core', cost: 3, target: 'enemy', text: '造成 32 点伤害。', effects: [{ type: 'damage', value: 32 }], u: { name: '湮灭炮+', text: '造成 42 点伤害。', effects: [{ type: 'damage', value: 42 }] } },
    { id: 'execute', name: '处决程序', type: 'attack', rarity: 'rare', color: 'core', cost: 2, target: 'enemy', text: '造成 12 点伤害。若目标生命低于 25%，直接将其摧毁。', effects: [{ type: 'damage', value: 12 }, { type: 'execute', ratio: 0.25 }], u: { name: '处决程序+', text: '造成 16 点伤害。若目标生命低于 35%，直接将其摧毁。', effects: [{ type: 'damage', value: 16 }, { type: 'execute', ratio: 0.35 }] } },
    { id: 'shield-echo', name: '护盾回响', type: 'skill', rarity: 'rare', color: 'core', cost: 1, target: 'none', text: '使当前格挡翻倍。', effects: [{ type: 'doubleBlock' }], u: { name: '护盾回响+', cost: 0, text: '使当前格挡翻倍。', effects: [{ type: 'doubleBlock' }] } },
    { id: 'blast', name: '力场爆破', type: 'attack', rarity: 'rare', color: 'core', cost: 1, target: 'enemy', text: '造成等同于当前格挡的伤害。', effects: [{ type: 'damageEqualToBlock' }], u: { name: '力场爆破+', cost: 0, text: '造成等同于当前格挡的伤害。', effects: [{ type: 'damageEqualToBlock' }] } },
    { id: 'time-warp', name: '时间扭曲', type: 'skill', rarity: 'rare', color: 'core', cost: 2, target: 'none', exhaust: true, text: '抽 4 张牌，获得 2 点能量。消耗。', effects: [{ type: 'draw', value: 4 }, { type: 'energy', value: 2 }], u: { name: '时间扭曲+', text: '抽 5 张牌，获得 3 点能量。消耗。', effects: [{ type: 'draw', value: 5 }, { type: 'energy', value: 3 }] } },
    { id: 'perfect-calc', name: '完美计算', type: 'skill', rarity: 'rare', color: 'core', cost: 1, target: 'none', exhaust: true, text: '将手牌抽至 9 张。消耗。', effects: [{ type: 'drawTo', value: 9 }], u: { name: '完美计算+', cost: 0, text: '将手牌抽至 9 张。消耗。', effects: [{ type: 'drawTo', value: 9 }] } },
    { id: 'overclock', name: '过载', type: 'skill', rarity: 'rare', color: 'core', cost: 0, target: 'none', text: '获得 2 点能量，失去 6 点生命。', effects: [{ type: 'energy', value: 2 }, { type: 'loseHp', value: 6 }], u: { name: '过载+', text: '获得 3 点能量，失去 5 点生命。', effects: [{ type: 'energy', value: 3 }, { type: 'loseHp', value: 5 }] } },
    { id: 'guardian-protocol', name: '守护协议', type: 'power', rarity: 'rare', color: 'core', cost: 2, target: 'none', text: '每回合开始时获得 6 点格挡，并获得 2 点迅捷。', effects: [{ type: 'status', status: 'plating', value: 6, target: 'self' }, { type: 'status', status: 'dexterity', value: 2, target: 'self' }], u: { name: '守护协议+', text: '每回合开始时获得 8 点格挡，并获得 3 点迅捷。', effects: [{ type: 'status', status: 'plating', value: 8, target: 'self' }, { type: 'status', status: 'dexterity', value: 3, target: 'self' }] } },

    // ---------- 死域 · 普通 ----------
    { id: 'corrupt-land', name: '腐化之地', type: 'skill', rarity: 'common', color: 'necrosis', cost: 1, target: 'all', text: '对所有敌人施加 3 层中毒。', effects: [{ type: 'status', status: 'poison', value: 3, target: 'all' }], u: { name: '腐化之地+', text: '对所有敌人施加 5 层中毒。', effects: [{ type: 'status', status: 'poison', value: 5, target: 'all' }] } },
    { id: 'death-nova', name: '死亡新星', type: 'attack', rarity: 'common', color: 'necrosis', cost: 2, target: 'all', text: '对所有敌人造成 8 点伤害。对中毒的敌人额外造成 5 点。', effects: [{ type: 'damage', value: 8, target: 'all' }, { type: 'bonusIfStatus', status: 'poison', value: 5, target: 'all' }], u: { name: '死亡新星+', text: '对所有敌人造成 10 点伤害。对中毒的敌人额外造成 7 点。', effects: [{ type: 'damage', value: 10, target: 'all' }, { type: 'bonusIfStatus', status: 'poison', value: 7, target: 'all' }] } },
    { id: 'soul-drain', name: '灵魂汲取', type: 'attack', rarity: 'common', color: 'necrosis', cost: 2, target: 'enemy', text: '造成 11 点伤害，恢复 6 点生命。', effects: [{ type: 'damage', value: 11 }, { type: 'heal', value: 6 }], u: { name: '灵魂汲取+', text: '造成 15 点伤害，恢复 9 点生命。', effects: [{ type: 'damage', value: 15 }, { type: 'heal', value: 9 }] } },
    { id: 'plague-burst', name: '疫病爆发', type: 'skill', rarity: 'common', color: 'necrosis', cost: 1, target: 'enemy', text: '使目标的中毒层数翻倍。', effects: [{ type: 'multiplyStatus', status: 'poison' }], u: { name: '疫病爆发+', cost: 0, text: '使目标的中毒层数翻倍。', effects: [{ type: 'multiplyStatus', status: 'poison' }] } },
    { id: 'bone-armor', name: '骸骨护甲', type: 'skill', rarity: 'common', color: 'necrosis', cost: 1, target: 'none', text: '获得 11 点格挡，自身获得 2 层中毒。', effects: [{ type: 'block', value: 11 }, { type: 'status', status: 'poison', value: 2, target: 'self' }], u: { name: '骸骨护甲+', text: '获得 15 点格挡，自身获得 1 层中毒。', effects: [{ type: 'block', value: 15 }, { type: 'status', status: 'poison', value: 1, target: 'self' }] } },
    { id: 'life-leech', name: '掠夺生命', type: 'attack', rarity: 'common', color: 'necrosis', cost: 1, target: 'enemy', text: '造成 6 点伤害，恢复 4 点生命。', effects: [{ type: 'damage', value: 6 }, { type: 'heal', value: 4 }], u: { name: '掠夺生命+', text: '造成 8 点伤害，恢复 6 点生命。', effects: [{ type: 'damage', value: 8 }, { type: 'heal', value: 6 }] } },
    { id: 'bone-hurl', name: '腐骨投掷', type: 'attack', rarity: 'common', color: 'necrosis', cost: 1, target: 'enemy', text: '造成 5 点伤害，2 次，施加 1 层中毒。', effects: [{ type: 'damage', value: 5, times: 2 }, { type: 'status', status: 'poison', value: 1 }], u: { name: '腐骨投掷+', text: '造成 6 点伤害，2 次，施加 2 层中毒。', effects: [{ type: 'damage', value: 6, times: 2 }, { type: 'status', status: 'poison', value: 2 }] } },
    { id: 'sacrifice', name: '献祭', type: 'skill', rarity: 'common', color: 'necrosis', cost: 0, target: 'none', text: '失去 7 点生命，获得 2 点能量。', effects: [{ type: 'loseHp', value: 7 }, { type: 'energy', value: 2 }], u: { name: '献祭+', text: '失去 4 点生命，获得 2 点能量。', effects: [{ type: 'loseHp', value: 4 }, { type: 'energy', value: 2 }] } },
    { id: 'corpse-blast', name: '尸爆', type: 'attack', rarity: 'common', color: 'necrosis', cost: 1, target: 'enemy', text: '造成 4 点伤害。若目标处于中毒状态，改为造成 13 点伤害。', effects: [{ type: 'damage', value: 4 }, { type: 'extraIfStatus', status: 'poison', value: 9 }], u: { name: '尸爆+', text: '造成 5 点伤害。若目标处于中毒状态，改为造成 18 点伤害。', effects: [{ type: 'damage', value: 5 }, { type: 'extraIfStatus', status: 'poison', value: 13 }] } },
    { id: 'ghosts', name: '幽魂群', type: 'attack', rarity: 'common', color: 'necrosis', cost: 1, target: 'enemy', text: '造成 2 点伤害，4 次。', effects: [{ type: 'damage', value: 2, times: 4 }], u: { name: '幽魂群+', text: '造成 3 点伤害，4 次。', effects: [{ type: 'damage', value: 3, times: 4 }] } },
    { id: 'flesh-offering', name: '血肉供奉', type: 'skill', rarity: 'common', color: 'necrosis', cost: 1, target: 'none', text: '获得 8 点格挡，获得 2 点力量。', effects: [{ type: 'block', value: 8 }, { type: 'status', status: 'strength', value: 2, target: 'self' }], u: { name: '血肉供奉+', text: '获得 10 点格挡，获得 3 点力量。', effects: [{ type: 'block', value: 10 }, { type: 'status', status: 'strength', value: 3, target: 'self' }] } },

    // ---------- 死域 · 罕见 ----------
    { id: 'undead-pact', name: '亡灵契约', type: 'power', rarity: 'uncommon', color: 'necrosis', cost: 2, target: 'none', text: '每摧毁一个敌人恢复 5 点生命。', effects: [{ type: 'status', status: 'devour', value: 5, target: 'self' }], u: { name: '亡灵契约+', text: '每摧毁一个敌人恢复 8 点生命。', effects: [{ type: 'status', status: 'devour', value: 8, target: 'self' }] } },
    { id: 'corrupt-convert', name: '腐化转化', type: 'skill', rarity: 'uncommon', color: 'necrosis', cost: 1, target: 'none', text: '每层中毒获得 2 点格挡。', effects: [{ type: 'blockPerStatus', status: 'poison', value: 2 }], u: { name: '腐化转化+', text: '每层中毒获得 3 点格挡。', effects: [{ type: 'blockPerStatus', status: 'poison', value: 3 }] } },
    { id: 'plague-bearer', name: '瘟疫使者', type: 'power', rarity: 'uncommon', color: 'necrosis', cost: 2, target: 'none', text: '每回合开始时对所有敌人施加 2 层中毒。', effects: [{ type: 'status', status: 'plague', value: 2, target: 'self' }], u: { name: '瘟疫使者+', text: '每回合开始时对所有敌人施加 3 层中毒。', effects: [{ type: 'status', status: 'plague', value: 3, target: 'self' }] } },
    { id: 'dead-march', name: '亡者行军', type: 'attack', rarity: 'uncommon', color: 'necrosis', cost: 2, target: 'all', text: '消耗牌堆每有 1 张牌，对所有敌人造成 4 点伤害。', effects: [{ type: 'damagePerExhaust', value: 4, target: 'all' }], u: { name: '亡者行军+', text: '消耗牌堆每有 1 张牌，对所有敌人造成 6 点伤害。', effects: [{ type: 'damagePerExhaust', value: 6, target: 'all' }] } },
    { id: 'carrion-feast', name: '腐肉盛宴', type: 'attack', rarity: 'uncommon', color: 'necrosis', cost: 2, target: 'enemy', text: '造成 10 点伤害。目标每有 3 层中毒，额外造成 4 点伤害。', effects: [{ type: 'damage', value: 10 }, { type: 'damagePerStatus', status: 'poison', per: 3, value: 4 }], u: { name: '腐肉盛宴+', text: '造成 13 点伤害。目标每有 3 层中毒，额外造成 5 点伤害。', effects: [{ type: 'damage', value: 13 }, { type: 'damagePerStatus', status: 'poison', per: 3, value: 5 }] } },
    { id: 'putrid-miasma', name: '瘴气', type: 'skill', rarity: 'uncommon', color: 'necrosis', cost: 1, target: 'all', text: '对所有敌人施加 2 层中毒与 2 层虚弱。', effects: [{ type: 'status', status: 'poison', value: 2, target: 'all' }, { type: 'status', status: 'weak', value: 2, target: 'all' }], u: { name: '瘴气+', text: '对所有敌人施加 3 层中毒与 3 层虚弱。', effects: [{ type: 'status', status: 'poison', value: 3, target: 'all' }, { type: 'status', status: 'weak', value: 3, target: 'all' }] } },
    { id: 'bone-wall', name: '骸骨壁垒', type: 'skill', rarity: 'uncommon', color: 'necrosis', cost: 2, target: 'none', text: '获得 14 点格挡，随机消耗 1 张手牌。', effects: [{ type: 'block', value: 14 }, { type: 'exhaustRandom', count: 1 }], u: { name: '骸骨壁垒+', text: '获得 20 点格挡，随机消耗 1 张手牌。', effects: [{ type: 'block', value: 20 }, { type: 'exhaustRandom', count: 1 }] } },
    { id: 'soul-harvest', name: '灵魂收割', type: 'attack', rarity: 'uncommon', color: 'necrosis', cost: 1, target: 'all', text: '对所有敌人造成 6 点伤害，恢复 3 点生命。', effects: [{ type: 'damage', value: 6, target: 'all' }, { type: 'heal', value: 3 }], u: { name: '灵魂收割+', text: '对所有敌人造成 9 点伤害，恢复 5 点生命。', effects: [{ type: 'damage', value: 9, target: 'all' }, { type: 'heal', value: 5 }] } },

    // ---------- 死域 · 稀有 ----------
    { id: 'plague-typhoon', name: '疫病风暴', type: 'skill', rarity: 'rare', color: 'necrosis', cost: 2, target: 'all', text: '对所有敌人施加 6 层中毒并抽 1 张牌。', effects: [{ type: 'status', status: 'poison', value: 6, target: 'all' }, { type: 'draw', value: 1 }], u: { name: '疫病风暴+', text: '对所有敌人施加 9 层中毒并抽 2 张牌。', effects: [{ type: 'status', status: 'poison', value: 9, target: 'all' }, { type: 'draw', value: 2 }] } },
    { id: 'undying', name: '不朽护佑', type: 'skill', rarity: 'rare', color: 'necrosis', cost: 2, target: 'none', exhaust: true, text: '获得 2 层不死：生命不会低于 1 点。消耗。', effects: [{ type: 'status', status: 'undying', value: 2, target: 'self' }], u: { name: '不朽护佑+', text: '获得 3 层不死，恢复 10 点生命。消耗。', effects: [{ type: 'status', status: 'undying', value: 3, target: 'self' }, { type: 'heal', value: 10 }] } },
    { id: 'reaper', name: '收割者', type: 'attack', rarity: 'rare', color: 'necrosis', cost: 2, target: 'enemy', text: '造成 9 点伤害。若本次攻击摧毁目标，永久获得 3 点最大生命。', effects: [{ type: 'damage', value: 9 }, { type: 'reap', maxHp: 3 }], u: { name: '收割者+', text: '造成 13 点伤害。若本次攻击摧毁目标，永久获得 5 点最大生命。', effects: [{ type: 'damage', value: 13 }, { type: 'reap', maxHp: 5 }] } },
    { id: 'carrion-cloud', name: '腐尸云', type: 'power', rarity: 'rare', color: 'necrosis', cost: 2, target: 'none', text: '每回合开始时对所有敌人施加 1 层中毒，并对随机敌人造成 3 点伤害。', effects: [{ type: 'status', status: 'plague', value: 1, target: 'self' }, { type: 'status', status: 'turret', value: 3, target: 'self' }], u: { name: '腐尸云+', text: '每回合开始时对所有敌人施加 2 层中毒，并对随机敌人造成 4 点伤害。', effects: [{ type: 'status', status: 'plague', value: 2, target: 'self' }, { type: 'status', status: 'turret', value: 4, target: 'self' }] } },

    // ---------- 心能 · 普通 ----------
    { id: 'psy-focus', name: '灵能聚焦', type: 'skill', rarity: 'common', color: 'psi', cost: 1, target: 'none', text: '获得 3 层敏锐。', effects: [{ type: 'status', status: 'focus', value: 3, target: 'self' }], u: { name: '灵能聚焦+', text: '获得 4 层敏锐。', effects: [{ type: 'status', status: 'focus', value: 4, target: 'self' }] } },
    { id: 'mind-rend', name: '意志撕裂', type: 'attack', rarity: 'common', color: 'psi', cost: 2, target: 'enemy', text: '造成 14 点伤害。若本回合打出过技能牌，施加 2 层易伤。', effects: [{ type: 'damage', value: 14 }, { type: 'statusIfSkills', status: 'vulnerable', value: 2 }], u: { name: '意志撕裂+', text: '造成 18 点伤害。若本回合打出过技能牌，施加 3 层易伤。', effects: [{ type: 'damage', value: 18 }, { type: 'statusIfSkills', status: 'vulnerable', value: 3 }] } },
    { id: 'precognition', name: '预知', type: 'skill', rarity: 'common', color: 'psi', cost: 1, target: 'none', text: '抽 2 张牌，获得 1 层敏锐。', effects: [{ type: 'draw', value: 2 }, { type: 'status', status: 'focus', value: 1, target: 'self' }], u: { name: '预知+', text: '抽 3 张牌，获得 1 层敏锐。', effects: [{ type: 'draw', value: 3 }, { type: 'status', status: 'focus', value: 1, target: 'self' }] } },
    { id: 'telekinesis', name: '念力护盾', type: 'skill', rarity: 'common', color: 'psi', cost: 1, target: 'none', text: '获得 8 点格挡，获得 1 层敏锐。', effects: [{ type: 'block', value: 8 }, { type: 'status', status: 'focus', value: 1, target: 'self' }], u: { name: '念力护盾+', text: '获得 11 点格挡，获得 2 层敏锐。', effects: [{ type: 'block', value: 11 }, { type: 'status', status: 'focus', value: 2, target: 'self' }] } },
    { id: 'chaos-bolt', name: '混乱冲击', type: 'attack', rarity: 'common', color: 'psi', cost: 0, target: 'enemy', text: '造成 5 点伤害，随机施加 2 层 易伤、虚弱或中毒。', effects: [{ type: 'damage', value: 5 }, { type: 'statusRandom', value: 2, statuses: ['vulnerable', 'weak', 'poison'] }], u: { name: '混乱冲击+', text: '造成 7 点伤害，随机施加 3 层 易伤、虚弱或中毒。', effects: [{ type: 'damage', value: 7 }, { type: 'statusRandom', value: 3, statuses: ['vulnerable', 'weak', 'poison'] }] } },
    { id: 'psionic-scream', name: '心灵尖啸', type: 'attack', rarity: 'common', color: 'psi', cost: 2, target: 'all', text: '对所有敌人造成 7 点伤害，施加 2 层虚弱。', effects: [{ type: 'damage', value: 7, target: 'all' }, { type: 'status', status: 'weak', value: 2, target: 'all' }], u: { name: '心灵尖啸+', text: '对所有敌人造成 9 点伤害，施加 3 层虚弱。', effects: [{ type: 'damage', value: 9, target: 'all' }, { type: 'status', status: 'weak', value: 3, target: 'all' }] } },
    { id: 'shadow-step', name: '幽影步', type: 'skill', rarity: 'common', color: 'psi', cost: 1, target: 'none', text: '获得 4 点格挡，抽 2 张牌。', effects: [{ type: 'block', value: 4 }, { type: 'draw', value: 2 }], u: { name: '幽影步+', text: '获得 6 点格挡，抽 2 张牌。', effects: [{ type: 'block', value: 6 }, { type: 'draw', value: 2 }] } },
    { id: 'mind-burst', name: '心灵爆发', type: 'attack', rarity: 'common', color: 'psi', cost: 1, target: 'enemy', x: true, text: '消耗所有能量。每点能量造成 6 点伤害。', effects: [{ type: 'damage', value: 6, x: true }], u: { name: '心灵爆发+', text: '消耗所有能量。每点能量造成 8 点伤害。', effects: [{ type: 'damage', value: 8, x: true }] } },
    { id: 'psychic-barrier', name: '心灵屏障', type: 'skill', rarity: 'common', color: 'psi', cost: 1, target: 'none', text: '获得 5 点格挡，每层敏锐再获得 2 点格挡。', effects: [{ type: 'block', value: 5 }, { type: 'blockPerStatus', status: 'focus', value: 2 }], u: { name: '心灵屏障+', text: '获得 7 点格挡，每层敏锐再获得 3 点格挡。', effects: [{ type: 'block', value: 7 }, { type: 'blockPerStatus', status: 'focus', value: 3 }] } },

    // ---------- 心能 · 罕见 ----------
    { id: 'resonance', name: '意识共鸣', type: 'power', rarity: 'uncommon', color: 'psi', cost: 2, target: 'none', text: '每打出攻击牌获得 1 层敏锐。', effects: [{ type: 'status', status: 'resonance', value: 1, target: 'self' }], u: { name: '意识共鸣+', text: '每打出攻击牌获得 1 层敏锐，每打出技能牌获得 2 点格挡。', effects: [{ type: 'status', status: 'resonance', value: 1, target: 'self' }, { type: 'status', status: 'skillBlock', value: 2, target: 'self' }] } },
    { id: 'void-echo', name: '虚空回响', type: 'attack', rarity: 'uncommon', color: 'psi', cost: 2, target: 'enemy', text: '造成 10 点伤害，再对随机敌人造成 6 点伤害，2 次。', effects: [{ type: 'damage', value: 10 }, { type: 'damageRandom', value: 6, times: 2 }], u: { name: '虚空回响+', text: '造成 13 点伤害，再对随机敌人造成 8 点伤害，3 次。', effects: [{ type: 'damage', value: 13 }, { type: 'damageRandom', value: 8, times: 3 }] } },
    { id: 'mind-control', name: '心灵控制', type: 'skill', rarity: 'uncommon', color: 'psi', cost: 2, target: 'enemy', exhaust: true, text: '使目标眩晕 1 回合。消耗。', effects: [{ type: 'status', status: 'stun', value: 1 }], u: { name: '心灵控制+', cost: 1, text: '使目标眩晕 1 回合。消耗。', effects: [{ type: 'status', status: 'stun', value: 1 }] } },
    { id: 'thought-seize', name: '夺念', type: 'attack', rarity: 'uncommon', color: 'psi', cost: 1, target: 'enemy', text: '造成 8 点伤害。每层敏锐额外造成 2 点。', effects: [{ type: 'damage', value: 8 }, { type: 'damagePerStatus', status: 'focus', per: 1, value: 2 }], u: { name: '夺念+', text: '造成 10 点伤害。每层敏锐额外造成 3 点。', effects: [{ type: 'damage', value: 10 }, { type: 'damagePerStatus', status: 'focus', per: 1, value: 3 }] } },
    { id: 'astral-shift', name: '星体转移', type: 'skill', rarity: 'uncommon', color: 'psi', cost: 1, target: 'none', text: '获得 3 层敏锐与 3 点迅捷。', effects: [{ type: 'status', status: 'focus', value: 3, target: 'self' }, { type: 'status', status: 'dexterity', value: 3, target: 'self' }], u: { name: '星体转移+', text: '获得 4 层敏锐与 4 点迅捷。', effects: [{ type: 'status', status: 'focus', value: 4, target: 'self' }, { type: 'status', status: 'dexterity', value: 4, target: 'self' }] } },
    { id: 'psi-storm', name: '灵能风暴', type: 'attack', rarity: 'uncommon', color: 'psi', cost: 2, target: 'all', text: '对所有敌人造成 3 点伤害，3 次。', effects: [{ type: 'damage', value: 3, times: 3, target: 'all' }], u: { name: '灵能风暴+', text: '对所有敌人造成 4 点伤害，4 次。', effects: [{ type: 'damage', value: 4, times: 4, target: 'all' }] } },

    // ---------- 心能 · 稀有 ----------
    { id: 'mind-overload', name: '心智过载', type: 'attack', rarity: 'rare', color: 'psi', cost: 2, target: 'enemy', text: '造成 6 点伤害，4 次，获得 1 点能量。', effects: [{ type: 'damage', value: 6, times: 4 }, { type: 'energy', value: 1 }], u: { name: '心智过载+', text: '造成 8 点伤害，4 次，获得 2 点能量。', effects: [{ type: 'damage', value: 8, times: 4 }, { type: 'energy', value: 2 }] } },
    { id: 'hive-mind', name: '群体意识', type: 'power', rarity: 'rare', color: 'psi', cost: 2, target: 'none', text: '每回合额外抽 1 张牌，每打出攻击牌获得 1 层敏锐。', effects: [{ type: 'status', status: 'perception', value: 1, target: 'self' }, { type: 'status', status: 'resonance', value: 1, target: 'self' }], u: { name: '群体意识+', text: '每回合额外抽 2 张牌，每打出攻击牌获得 1 层敏锐。', effects: [{ type: 'status', status: 'perception', value: 2, target: 'self' }, { type: 'status', status: 'resonance', value: 1, target: 'self' }] } },
    { id: 'singularity', name: '奇点', type: 'attack', rarity: 'rare', color: 'psi', cost: 3, target: 'all', text: '对所有敌人造成 20 点伤害，施加 2 层虚弱与 2 层易伤。', effects: [{ type: 'damage', value: 20, target: 'all' }, { type: 'status', status: 'weak', value: 2, target: 'all' }, { type: 'status', status: 'vulnerable', value: 2, target: 'all' }], u: { name: '奇点+', text: '对所有敌人造成 26 点伤害，施加 3 层虚弱与 3 层易伤。', effects: [{ type: 'damage', value: 26, target: 'all' }, { type: 'status', status: 'weak', value: 3, target: 'all' }, { type: 'status', status: 'vulnerable', value: 3, target: 'all' }] } },

    // ---------- 衍生 ----------
    { id: 'wreck', name: '残骸', type: 'attack', rarity: 'special', color: 'neutral', cost: 0, target: 'enemy', exhaust: true, text: '造成 4 点伤害，抽 1 张牌。消耗。', effects: [{ type: 'damage', value: 4 }, { type: 'draw', value: 1 }], u: { name: '残骸+', text: '造成 6 点伤害，抽 1 张牌。消耗。', effects: [{ type: 'damage', value: 6 }, { type: 'draw', value: 1 }] } },
    { id: 'spark', name: '星火', type: 'attack', rarity: 'special', color: 'neutral', cost: 0, target: 'enemy', exhaust: true, text: '造成 9 点伤害。消耗。', effects: [{ type: 'damage', value: 9 }], u: { name: '星火+', text: '造成 12 点伤害。消耗。', effects: [{ type: 'damage', value: 12 }] } },
    { id: 'echo-shard', name: '回响碎片', type: 'skill', rarity: 'special', color: 'neutral', cost: 0, target: 'none', exhaust: true, text: '获得 6 点格挡，抽 1 张牌。消耗。', effects: [{ type: 'block', value: 6 }, { type: 'draw', value: 1 }], u: { name: '回响碎片+', text: '获得 9 点格挡，抽 1 张牌。消耗。', effects: [{ type: 'block', value: 9 }, { type: 'draw', value: 1 }] } },

    // ---------- 深层篇章 · 通用高强度卡（12 章流程中的主力） ----------
    { id: 'singular-strike', name: '奇点打击', type: 'attack', rarity: 'uncommon', color: 'core', cost: 2, target: 'enemy', text: '造成 18 点伤害。本回合每打出过一张攻击牌，额外造成 4 点。', effects: [{ type: 'damage', value: 18 }, { type: 'bonusIfAttacks', per: 4 }], u: { name: '奇点打击+', text: '造成 24 点伤害。本回合每打出过一张攻击牌，额外造成 5 点。', effects: [{ type: 'damage', value: 24 }, { type: 'bonusIfAttacks', per: 5 }] } },
    { id: 'plasma-lance', name: '等离子长矛', type: 'attack', rarity: 'uncommon', color: 'core', cost: 2, target: 'enemy', text: '造成 24 点伤害，无视格挡。', effects: [{ type: 'damage', value: 24, pierce: true }], u: { name: '等离子长矛+', text: '造成 32 点伤害，无视格挡。', effects: [{ type: 'damage', value: 32, pierce: true }] } },
    { id: 'orbital-barrage', name: '轨道轰炸', type: 'attack', rarity: 'rare', color: 'core', cost: 3, target: 'all', text: '对所有敌人造成 26 点伤害。', effects: [{ type: 'damage', value: 26, target: 'all' }], u: { name: '轨道轰炸+', text: '对所有敌人造成 34 点伤害。', effects: [{ type: 'damage', value: 34, target: 'all' }] } },
    { id: 'aegis-field', name: '神盾力场', type: 'skill', rarity: 'rare', color: 'core', cost: 2, target: 'none', text: '获得 30 点格挡，并使当前格挡翻倍。', effects: [{ type: 'block', value: 30 }, { type: 'doubleBlock' }], u: { name: '神盾力场+', text: '获得 40 点格挡，并使当前格挡翻倍。', effects: [{ type: 'block', value: 40 }, { type: 'doubleBlock' }] } },
    { id: 'nanite-repair', name: '纳米修复', type: 'skill', rarity: 'uncommon', color: 'core', cost: 2, target: 'none', text: '恢复 24 点生命，获得 3 层再生。', effects: [{ type: 'heal', value: 24 }, { type: 'status', status: 'regen', value: 3, target: 'self' }], u: { name: '纳米修复+', text: '恢复 34 点生命，获得 4 层再生。', effects: [{ type: 'heal', value: 34 }, { type: 'status', status: 'regen', value: 4, target: 'self' }] } },
    { id: 'overload-cascade', name: '过载连锁', type: 'attack', rarity: 'rare', color: 'core', cost: 1, target: 'all', text: '对所有敌人造成 12 点伤害，3 次。', effects: [{ type: 'damage', value: 12, times: 3, target: 'all' }], u: { name: '过载连锁+', text: '对所有敌人造成 16 点伤害，3 次。', effects: [{ type: 'damage', value: 16, times: 3, target: 'all' }] } },
    { id: 'plague-vector', name: '瘟疫载体', type: 'skill', rarity: 'uncommon', color: 'necrosis', cost: 2, target: 'all', text: '对所有敌人施加 12 层中毒，恢复 8 点生命。', effects: [{ type: 'status', status: 'poison', value: 12, target: 'all' }, { type: 'heal', value: 8 }], u: { name: '瘟疫载体+', text: '对所有敌人施加 18 层中毒，恢复 12 点生命。', effects: [{ type: 'status', status: 'poison', value: 18, target: 'all' }, { type: 'heal', value: 12 }] } },
    { id: 'soul-rend', name: '裂魂', type: 'attack', rarity: 'rare', color: 'necrosis', cost: 2, target: 'enemy', text: '造成 20 点伤害。目标每有 2 层中毒，额外造成 5 点伤害。', effects: [{ type: 'damage', value: 20 }, { type: 'damagePerStatus', status: 'poison', per: 2, value: 5 }], u: { name: '裂魂+', text: '造成 26 点伤害。目标每有 2 层中毒，额外造成 7 点伤害。', effects: [{ type: 'damage', value: 26 }, { type: 'damagePerStatus', status: 'poison', per: 2, value: 7 }] } },
    { id: 'grave-tide', name: '墓潮', type: 'attack', rarity: 'uncommon', color: 'necrosis', cost: 3, target: 'all', text: '对所有敌人造成 22 点伤害，并施加 4 层中毒。', effects: [{ type: 'damage', value: 22, target: 'all' }, { type: 'status', status: 'poison', value: 4, target: 'all' }], u: { name: '墓潮+', text: '对所有敌人造成 28 点伤害，并施加 6 层中毒。', effects: [{ type: 'damage', value: 28, target: 'all' }, { type: 'status', status: 'poison', value: 6, target: 'all' }] } },
    { id: 'psi-lance', name: '灵能投射', type: 'attack', rarity: 'uncommon', color: 'psi', cost: 2, target: 'enemy', text: '造成 16 点伤害。每层敏锐额外造成 4 点。', effects: [{ type: 'damage', value: 16 }, { type: 'damagePerStatus', status: 'focus', per: 1, value: 4 }], u: { name: '灵能投射+', text: '造成 22 点伤害。每层敏锐额外造成 5 点。', effects: [{ type: 'damage', value: 22 }, { type: 'damagePerStatus', status: 'focus', per: 1, value: 5 }] } },
    { id: 'time-loop', name: '时间循环', type: 'skill', rarity: 'rare', color: 'psi', cost: 2, target: 'none', exhaust: true, text: '抽 6 张牌，获得 3 点能量。消耗。', effects: [{ type: 'draw', value: 6 }, { type: 'energy', value: 3 }], u: { name: '时间循环+', text: '抽 8 张牌，获得 4 点能量。消耗。', effects: [{ type: 'draw', value: 8 }, { type: 'energy', value: 4 }] } },
    { id: 'void-siphon', name: '虚空汲取', type: 'attack', rarity: 'uncommon', color: 'psi', cost: 2, target: 'all', text: '对所有敌人造成 14 点伤害，并抽 2 张牌。', effects: [{ type: 'damage', value: 14, target: 'all' }, { type: 'draw', value: 2 }], u: { name: '虚空汲取+', text: '对所有敌人造成 19 点伤害，并抽 3 张牌。', effects: [{ type: 'damage', value: 19, target: 'all' }, { type: 'draw', value: 3 }] } },
    { id: 'thorn-barrier', name: '荆棘壁垒', type: 'power', rarity: 'uncommon', color: 'core', cost: 2, target: 'none', text: '每回合开始时获得 8 点格挡与 4 层反射。', effects: [{ type: 'status', status: 'plating', value: 8, target: 'self' }, { type: 'status', status: 'reflect', value: 4, target: 'self' }], u: { name: '荆棘壁垒+', text: '每回合开始时获得 12 点格挡与 6 层反射。', effects: [{ type: 'status', status: 'plating', value: 12, target: 'self' }, { type: 'status', status: 'reflect', value: 6, target: 'self' }] } },
    { id: 'overcharge', name: '超载核心', type: 'power', rarity: 'rare', color: 'core', cost: 3, target: 'none', text: '每回合开始时获得 2 点能量，但失去 4 点生命。', effects: [{ type: 'status', status: 'energyBonus', value: 2, target: 'self' }], u: { name: '超载核心+', text: '每回合开始时获得 3 点能量，但失去 4 点生命。', effects: [{ type: 'status', status: 'energyBonus', value: 3, target: 'self' }] } },
    { id: 'gene-splice', name: '基因拼接', type: 'power', rarity: 'rare', color: 'necrosis', cost: 2, target: 'none', text: '每摧毁一个敌人，永久获得 4 点最大生命并恢复 6 点生命。', effects: [{ type: 'status', status: 'devour', value: 6, target: 'self' }, { type: 'status', status: 'soulEater', value: 1, target: 'self' }], u: { name: '基因拼接+', text: '每摧毁一个敌人，永久获得 6 点最大生命并恢复 8 点生命。', effects: [{ type: 'status', status: 'devour', value: 8, target: 'self' }, { type: 'status', status: 'soulEater', value: 1, target: 'self' }] } },
    { id: 'mind-over-matter', name: '以念御物', type: 'power', rarity: 'rare', color: 'psi', cost: 2, target: 'none', text: '每回合开始时获得 3 层敏锐与 6 点格挡。', effects: [{ type: 'status', status: 'focus', value: 3, target: 'self' }, { type: 'status', status: 'plating', value: 6, target: 'self' }], u: { name: '以念御物+', text: '每回合开始时获得 4 层敏锐与 9 点格挡。', effects: [{ type: 'status', status: 'focus', value: 4, target: 'self' }, { type: 'status', status: 'plating', value: 9, target: 'self' }] } },
  ];

  const CARD_MAP = {};
  for (const card of CARDS) CARD_MAP[card.id] = card;

  function card(id, upgraded = false) {
    const base = CARD_MAP[id];
    if (!base) throw new Error(`未知卡牌：${id}`);
    if (!upgraded || !base.u) return { ...base, upgraded: false };
    return { ...base, ...base.u, upgraded: true, id: base.id, u: base.u };
  }

  // 角色：起始生命、起始牌组、特色体系与起始遗物。
  const CHARACTERS = [
    {
      id: 'vanguard', name: '先驱守卫', title: 'VANGUARD', color: 'core', maxHp: 90, energy: 3,
      relic: 'vanguard-core',
      deck: ['plasma-strike', 'plasma-strike', 'plasma-strike', 'plasma-strike', 'charge', 'barrage', 'phase-barrier', 'phase-barrier', 'phase-barrier', 'phase-barrier'],
      text: '舰核模块的正统使用者。格挡、精准打击与稳定的输出节奏。',
      tip: '先用「相位屏障」积累格挡，再用「冲锋突进」与「力场爆破」把防御变成伤害。',
    },
    {
      id: 'necrotic', name: '腐生术士', title: 'NECROTECH', color: 'necrosis', maxHp: 84, energy: 3,
      relic: 'rot-core',
      deck: ['plasma-strike', 'plasma-strike', 'plasma-strike', 'corrosive-touch', 'corrosive-touch', 'corrupt-land', 'summon-horde', 'phase-barrier', 'phase-barrier', 'phase-barrier'],
      text: '从亡灵协议里苏醒的技术。用中毒与生命换取压制力。',
      tip: '中毒在敌人回合开始时结算，先叠加层数再防守；「疫病爆发」能让层数瞬间翻倍。',
    },
    {
      id: 'psion', name: '心能行者', title: 'PSION', color: 'psi', maxHp: 80, energy: 3,
      relic: 'resonance-crystal',
      deck: ['plasma-strike', 'plasma-strike', 'plasma-strike', 'psi-bolt', 'psi-bolt', 'mind-link', 'telekinesis', 'phase-barrier', 'phase-barrier', 'phase-barrier'],
      text: '能把念头变成武器的人。抽牌、敏锐与精神干扰。',
      tip: '敏锐不会消失，越早叠加收益越高；配合大量抽牌能在一回合内打出整副牌。',
    },
  ];
  const CHAR_MAP = {};
  for (const character of CHARACTERS) CHAR_MAP[character.id] = character;

  // 奖励池：基础与衍生卡不进入战斗奖励。
  const REWARD_POOL = {};
  for (const card of CARDS) {
    if (card.rarity === 'basic' || card.rarity === 'special') continue;
    const key = `${card.color}:${card.rarity}`;
    (REWARD_POOL[key] = REWARD_POOL[key] || []).push(card.id);
  }
  function rewardable(color, rarity) {
    return [...(REWARD_POOL[`${color}:${rarity}`] || []), ...(REWARD_POOL[`neutral:${rarity}`] || [])];
  }

  return { VERSION, SAVE_KEY, STATUS, NEGATIVE, COLORS, RARITY, TYPE, CARDS, CARD_MAP, card, CHARACTERS, CHAR_MAP, REWARD_POOL, rewardable };
});
