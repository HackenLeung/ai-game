// 深渊回响 · 遗物、药水、章节、事件与地图生成。敌人数据见 enemies.js。
(function (root, factory) {
  const isModule = typeof module === 'object' && module.exports;
  const data = isModule ? require('./data.js') : root.AbyssCards;
  const enemies = isModule ? require('./enemies.js') : root.AbyssEnemies;
  const api = factory(data, enemies);
  if (isModule) module.exports = api;
  else root.AbyssWorld = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (cards, enemies) {
  'use strict';

  // 12 章，每章 15 层。章节越深，敌人强度与奖励同步提升。
  const CHAPTERS = [
    { id: 1, name: '回响航母', subtitle: 'THE ECHO CARRIER', floors: 15, intro: '残骸在真空中缓慢旋转。舰载协议仍在运行，只是它们已经不再认识你。' },
    { id: 2, name: '寂静墓园', subtitle: 'THE SILENT FIELD', floors: 15, intro: '越过星际的坟场，死去的东西在引力井里重新拼合。它们记得活人的味道。' },
    { id: 3, name: '深渊核心', subtitle: 'THE ABYSS CORE', floors: 15, intro: '回响的源头就在这里。它一直在等你，因为只有你能理解它的名字。' },
    { id: 4, name: '熔火铸造厂', subtitle: 'THE FORGE', floors: 15, intro: '炉火燃了不知多少年。传送带上还在吐出新铸的躯壳，热浪让人睁不开眼。' },
    { id: 5, name: '低温冷藏库', subtitle: 'CRYO VAULT', floors: 15, intro: '呼吸在面罩上结成霜花。冷库里整齐排列着数不清的休眠舱，大多数已经空了。' },
    { id: 6, name: '孢子温床', subtitle: 'SPORE BED', floors: 15, intro: '空气里有甜腻的腐烂味。墙壁在缓慢呼吸，脚下的地面比刚才更软。' },
    { id: 7, name: '镜像回廊', subtitle: 'MIRROR GALLERY', floors: 15, intro: '每一步都有另一个你同时抬脚。你开始怀疑，到底是谁在模仿谁。' },
    { id: 8, name: '时序钟塔', subtitle: 'CHRONO SPIRE', floors: 15, intro: '数以万计的钟同时走动，指针却指向不同的方向。这里的每一秒都在打折。' },
    { id: 9, name: '血月祭坛', subtitle: 'BLOOD MOON ALTAR', floors: 15, intro: '红色的光从穹顶漏下来。祭坛上没有文字，只有一层干透的、不属于你的血迹。' },
    { id: 10, name: '星骸坟场', subtitle: 'STAR GRAVEYARD', floors: 15, intro: '恒星的尸体悬浮在四周，还在缓慢放热。你听见引力在低声数着心跳。' },
    { id: 11, name: '虚无帷幕', subtitle: 'VEIL OF NOTHING', floors: 15, intro: '前方没有墙，也没有路。你走过去的每一步，都要先说服自己还存在着。' },
    { id: 12, name: '回响之源', subtitle: 'THE ORIGIN', floors: 15, intro: '所有的回响都从这里出发。门开着，因为里面的人一直知道你会来。' },
  ];

  const RELICS = [
    { id: 'vanguard-core', name: '先锋核心', char: true, rarity: 'basic', icon: 'core', text: '每场战斗的第 1 回合获得 1 点能量。', triggers: [{ on: 'turnStart', firstTurn: true, effects: [{ type: 'energy', value: 1 }] }] },
    { id: 'rot-core', name: '腐化核心', char: true, rarity: 'basic', icon: 'rot', text: '每场战斗开始时对所有敌人施加 3 层中毒。', triggers: [{ on: 'battleStart', effects: [{ type: 'status', status: 'poison', value: 3, target: 'all' }] }] },
    { id: 'resonance-crystal', name: '共鸣水晶', char: true, rarity: 'basic', icon: 'crystal', text: '每场战斗的第 1 回合获得 3 层敏锐。', triggers: [{ on: 'turnStart', firstTurn: true, effects: [{ type: 'status', status: 'focus', value: 3, target: 'self' }] }] },
    { id: 'burning-blood', name: '燃烧之血', rarity: 'common', icon: 'blood', text: '战斗结束后恢复 6 点生命。', triggers: [{ on: 'battleEnd', effects: [{ type: 'heal', value: 6 }] }] },
    { id: 'sheath', name: '磁力刀鞘', rarity: 'common', icon: 'blade', text: '每场战斗的第 1 回合抽 2 张牌。', triggers: [{ on: 'turnStart', firstTurn: true, effects: [{ type: 'draw', value: 2 }] }] },
    { id: 'titan-plate', name: '泰坦护板', rarity: 'common', icon: 'plate', text: '每场战斗开始时获得 6 点格挡。', triggers: [{ on: 'battleStart', effects: [{ type: 'block', value: 6 }] }] },
    { id: 'twin-battery', name: '双子电池', rarity: 'common', icon: 'battery', text: '每回合开始时获得 1 点格挡。', triggers: [{ on: 'turnStart', effects: [{ type: 'block', value: 1 }] }] },
    { id: 'nanoblade', name: '纳米刀刃', rarity: 'common', icon: 'blade', text: '每场战斗的第 1 回合获得 2 点力量。', triggers: [{ on: 'turnStart', firstTurn: true, effects: [{ type: 'status', status: 'strength', value: 2, target: 'self' }] }] },
    { id: 'abyss-rose', name: '深渊之刺', rarity: 'common', icon: 'rose', text: '每回合开始时对所有敌人造成 1 点伤害。', triggers: [{ on: 'turnStart', effects: [{ type: 'damage', value: 1, target: 'all' }] }] },
    { id: 'shield-generator', name: '护盾发生器', rarity: 'special', icon: 'shield', text: '每回合开始时获得 2 点格挡。', triggers: [{ on: 'turnStart', effects: [{ type: 'block', value: 2 }] }] },
    { id: 'exoskeleton', name: '外骨骼', rarity: 'uncommon', icon: 'exo', text: '每回合开始时获得 2 点迅捷。', triggers: [{ on: 'turnStart', effects: [{ type: 'status', status: 'dexterity', value: 2, target: 'self' }] }] },
    { id: 'data-core', name: '数据核心', rarity: 'uncommon', icon: 'crystal', text: '每回合额外抽 1 张牌。', triggers: [{ on: 'turnStart', effects: [{ type: 'draw', value: 1 }] }] },
    { id: 'overclock-core', name: '超频核心', rarity: 'uncommon', icon: 'core', text: '每回合开始时获得 1 点能量，但每回合结束失去 1 点生命。', triggers: [{ on: 'turnStart', effects: [{ type: 'energy', value: 1 }] }, { on: 'turnEnd', effects: [{ type: 'loseHp', value: 1 }] }] },
    { id: 'venom-sac', name: '毒囊', rarity: 'uncommon', icon: 'rot', text: '每回合开始时对所有敌人施加 1 层中毒。', triggers: [{ on: 'turnStart', effects: [{ type: 'status', status: 'poison', value: 1, target: 'all' }] }] },
    { id: 'thermal-core', name: '热能核心', rarity: 'uncommon', icon: 'flame', text: '每回合开始时对所有敌人施加 1 层灼烧。', triggers: [{ on: 'turnStart', effects: [{ type: 'status', status: 'burn', value: 1, target: 'all' }] }] },
    { id: 'soul-urn', name: '魂匣', rarity: 'uncommon', icon: 'urn', text: '每摧毁一个敌人恢复 3 点生命。', triggers: [{ on: 'kill', effects: [{ type: 'heal', value: 3 }] }] },
    { id: 'serrated-blade', name: '锯齿刃', rarity: 'uncommon', icon: 'blade', text: '每回合结束时，对所有敌人造成 2 点伤害。', triggers: [{ on: 'turnEnd', effects: [{ type: 'damage', value: 2, target: 'all' }] }] },
    { id: 'angel-idol', name: '天使像', rarity: 'uncommon', icon: 'idol', text: '每场战斗胜利后恢复 3 点生命。', triggers: [{ on: 'battleEnd', effects: [{ type: 'heal', value: 3 }] }] },
    { id: 'merchant-seal', name: '商人印记', rarity: 'uncommon', icon: 'coin', text: '获得时立即获得 120 金币；进入商店时商品价格降低 20%。', modifiers: { gold: 120, shopDiscount: 0.2 } },
    { id: 'void-orb', name: '虚空宝珠', rarity: 'uncommon', icon: 'orb', text: '获得时最大生命提高 6 点并恢复等量生命。', modifiers: { maxHp: 6 } },
    { id: 'berserk-chip', name: '狂暴芯片', rarity: 'rare', icon: 'chip', text: '每场战斗开始时获得 3 点力量，但失去 4 点生命。', triggers: [{ on: 'battleStart', effects: [{ type: 'status', status: 'strength', value: 3, target: 'self' }, { type: 'loseHp', value: 4 }] }] },
    { id: 'time-dilator', name: '时间减速器', rarity: 'rare', icon: 'clock', text: '战斗的第 1 回合获得 2 点能量。', triggers: [{ on: 'turnStart', firstTurn: true, effects: [{ type: 'energy', value: 2 }] }] },
    { id: 'guardian-drone', name: '守卫无人机', rarity: 'rare', icon: 'drone', text: '每回合开始时获得 1 点格挡；受到的伤害减少 1 点。', triggers: [{ on: 'turnStart', effects: [{ type: 'block', value: 1 }] }], modifiers: { flatDefense: 1 } },
    { id: 'soul-drinker', name: '噬魂者', rarity: 'rare', icon: 'skull', text: '每摧毁一个敌人获得 2 点最大生命，并恢复 2 点生命。', triggers: [{ on: 'kill', effects: [{ type: 'maxHp', value: 2 }, { type: 'heal', value: 2 }] }] },
    { id: 'chemical-core', name: '化学核心', rarity: 'rare', icon: 'rot', text: '每回合开始时对所有敌人施加 2 层中毒；自身每回合结束时失去 1 点生命。', triggers: [{ on: 'turnStart', effects: [{ type: 'status', status: 'poison', value: 2, target: 'all' }] }, { on: 'turnEnd', effects: [{ type: 'loseHp', value: 1 }] }] },
    { id: 'mainframe', name: '主控芯片', rarity: 'rare', icon: 'chip', text: '每回合开始时获得 1 点能量、抽 1 张牌。', triggers: [{ on: 'turnStart', effects: [{ type: 'energy', value: 1 }, { type: 'draw', value: 1 }] }] },
    { id: 'thorn-mail', name: '棘刺护甲', rarity: 'rare', icon: 'plate', text: '每场战斗开始时获得 6 层反射。', triggers: [{ on: 'battleStart', effects: [{ type: 'status', status: 'reflect', value: 6, target: 'self' }] }] },
    { id: 'phoenix-feather', name: '不死鸟之羽', rarity: 'rare', icon: 'flame', text: '每场战斗开始时获得 2 层再生。', triggers: [{ on: 'battleStart', effects: [{ type: 'status', status: 'regen', value: 2, target: 'self' }] }] },
    { id: 'blood-pact', name: '血之契约', rarity: 'rare', icon: 'blood', text: '最大生命提高 18 点，但每场战斗开始时失去 5 点生命。', triggers: [{ on: 'battleStart', effects: [{ type: 'loseHp', value: 5 }] }], modifiers: { maxHp: 18 } },
    { id: 'echo-heart', name: '回响之心', rarity: 'boss', icon: 'heart', text: '战斗开始时恢复 12 点生命。首领遗物。', triggers: [{ on: 'battleStart', effects: [{ type: 'heal', value: 12 }] }] },
    { id: 'abyss-seal', name: '深渊封印', rarity: 'boss', icon: 'seal', text: '每次战斗的第 1 回合获得 4 点力量与 4 点迅捷。首领遗物。', triggers: [{ on: 'turnStart', firstTurn: true, effects: [{ type: 'status', status: 'strength', value: 4, target: 'self' }, { type: 'status', status: 'dexterity', value: 4, target: 'self' }] }] },
    { id: 'origin-code', name: '起源编码', rarity: 'boss', icon: 'chip', text: '每回合开始时获得 1 点能量并抽 1 张牌。首领遗物。', triggers: [{ on: 'turnStart', effects: [{ type: 'energy', value: 1 }, { type: 'draw', value: 1 }] }] },
    { id: 'void-crown', name: '虚空冠冕', rarity: 'boss', icon: 'crown', text: '每场战斗开始时对所有敌人施加 3 层易伤；最大生命提高 10 点。', triggers: [{ on: 'battleStart', effects: [{ type: 'status', status: 'vulnerable', value: 3, target: 'all' }] }], modifiers: { maxHp: 10 } },
  ];
  const RELIC_MAP = {};
  for (const relic of RELICS) RELIC_MAP[relic.id] = relic;
  const RELIC_POOL = RELICS.filter(relic => !relic.char && relic.rarity !== 'special' && relic.rarity !== 'boss').map(relic => relic.id);
  const BOSS_RELICS = RELICS.filter(relic => relic.rarity === 'boss').map(relic => relic.id);

  const POTIONS = [
    { id: 'repair', name: '维修针剂', icon: 'flask', text: '恢复 25 点生命。', effects: [{ type: 'heal', value: 25 }] },
    { id: 'buffer', name: '缓冲凝胶', icon: 'flask', text: '获得 16 点格挡。', effects: [{ type: 'block', value: 16 }] },
    { id: 'rage', name: '狂暴血清', icon: 'flask', text: '获得 3 点力量。', effects: [{ type: 'status', status: 'strength', value: 3, target: 'self' }] },
    { id: 'focus', name: '专注注射', icon: 'flask', text: '获得 3 层敏锐。', effects: [{ type: 'status', status: 'focus', value: 3, target: 'self' }] },
    { id: 'venom', name: '剧毒喷雾', icon: 'flask', text: '对所有敌人施加 8 层中毒。', effects: [{ type: 'status', status: 'poison', value: 8, target: 'all' }] },
    { id: 'breaker', name: '破防装置', icon: 'flask', text: '对所有敌人施加 4 层易伤。', effects: [{ type: 'status', status: 'vulnerable', value: 4, target: 'all' }] },
    { id: 'capacity', name: '容量胶囊', icon: 'flask', text: '获得 2 点能量。', effects: [{ type: 'energy', value: 2 }] },
    { id: 'draw', name: '思维加速', icon: 'flask', text: '抽 3 张牌。', effects: [{ type: 'draw', value: 3 }] },
    { id: 'ether', name: '以太药剂', icon: 'flask', text: '最大生命提高 5 点，并恢复 5 点生命。', effects: [{ type: 'maxHp', value: 5 }, { type: 'heal', value: 5 }] },
    { id: 'flame', name: '燃烧瓶', icon: 'flask', text: '对所有敌人施加 6 层灼烧。', effects: [{ type: 'status', status: 'burn', value: 6, target: 'all' }] },
    { id: 'ward', name: '守护屏障', icon: 'flask', text: '获得 3 层装甲与 3 点迅捷。', effects: [{ type: 'status', status: 'plating', value: 3, target: 'self' }, { type: 'status', status: 'dexterity', value: 3, target: 'self' }] },
    { id: 'purge', name: '净化剂', icon: 'flask', text: '移除自身所有负面状态并恢复 10 点生命。', effects: [{ type: 'purge' }, { type: 'heal', value: 10 }] },
  ];
  const POTION_MAP = {};
  for (const potion of POTIONS) POTION_MAP[potion.id] = potion;

  const EVENTS = [
    {
      id: 'echo-pool', name: '回响之池', text: '一汪银色的液体静静地浮动，映出的不是你现在的样子。伸手触碰时，它低声说出了你的名字。',
      options: [
        { label: '饮下回响', log: '记忆像潮水一样涌回来。', results: [{ type: 'heal', value: 18 }] },
        { label: '研究液体', log: '你读懂了其中一段指令。', results: [{ type: 'gainCard', rarity: 'uncommon' }] },
        { label: '收集样本', log: '你装满了一整瓶。', results: [{ type: 'gainGold', value: 60 }] },
      ],
    },
    {
      id: 'dead-lab', name: '废弃实验室', text: '冷冻舱早已失效，只有一排排手术器械还在灯光下闪着冷光。铁锈和药水味混在一起。',
      options: [
        { label: '翻找药剂', log: '你找到一支还能用的针剂。', results: [{ type: 'gainPotion', count: 1 }] },
        { label: '改造身体', log: '疼痛之后，你感觉自己更结实了。', results: [{ type: 'maxHp', value: 8 }] },
        { label: '拆解设备', log: '把有用的零件拆下来。', results: [{ type: 'gainGold', value: 45 }, { type: 'loseHp', value: 5 }] },
      ],
    },
    {
      id: 'bone-altar', name: '白骨祭坛', text: '骨头堆成的台面上刻满了名字。有人留了半支蜡烛，火苗还在轻轻晃动。',
      options: [
        { label: '献上一部分血液', log: '祭坛收下了你的血，也给了回礼。', results: [{ type: 'loseHp', value: 10 }, { type: 'gainRelic' }] },
        { label: '拿走蜡烛', log: '你带走了那半支蜡烛。', results: [{ type: 'gainGold', value: 40 }] },
        { label: '什么都不做', log: '你退后几步，让烛火继续摇晃。', results: [{ type: 'heal', value: 5 }] },
      ],
    },
    {
      id: 'crash-zone', name: '坠毁残骸', text: '运输舱从中间裂开，货物散了一地。发动机还在冒烟，但没有危险的气味。',
      options: [
        { label: '搜索货箱', log: '你捡到一些有用的东西。', results: [{ type: 'gainGold', value: 50 }, { type: 'heal', value: 6 }] },
        { label: '拆下装甲板', log: '你用碎片加固了自己的护甲。', results: [{ type: 'maxHp', value: 6 }] },
        { label: '提取燃料', log: '燃料还能用一次。', results: [{ type: 'gainPotion', count: 2 }] },
      ],
    },
    {
      id: 'whisper-orb', name: '低语宝珠', text: '半透明的球体悬浮在碎石之上，许多声音在它内部同时说话，却都在说同一句话。',
      options: [
        { label: '聆听', log: '你听懂了一部分。', results: [{ type: 'gainCard', rarity: 'rare' }, { type: 'loseHp', value: 8 }] },
        { label: '打碎它', log: '碎片割伤了你，但声音停下了。', results: [{ type: 'loseHp', value: 4 }, { type: 'gainGold', value: 80 }] },
        { label: '带走它', log: '宝珠安静地留在你的背包里。', results: [{ type: 'gainRelic' }] },
      ],
    },
    {
      id: 'survivor', name: '幸存者', text: '一个人蜷缩在通风管道里，手里的枪早就没有能量了。他抬头看你，眼里有一点光。',
      options: [
        { label: '分给他一半口粮', log: '他塞给你一样东西作为回报。', results: [{ type: 'loseHp', value: 6 }, { type: 'gainCard', rarity: 'common' }] },
        { label: '问路', log: '他告诉你一条更安全的走廊。', results: [{ type: 'gainGold', value: 35 }, { type: 'heal', value: 8 }] },
        { label: '离开', log: '你没有回头。夜风很冷。', results: [{ type: 'gainGold', value: 55 }] },
      ],
    },
    {
      id: 'void-rift', name: '虚空裂隙', text: '空间在这里被撕开一道细缝。缝里面看不到尽头，只有另一种颜色的黑。',
      options: [
        { label: '伸手进去', log: '你带回了不属于这里的东西。', results: [{ type: 'gainRelic' }, { type: 'loseHp', value: 12 }] },
        { label: '投入金币', log: '金币消失了，换来一枚奇怪的碎片。', results: [{ type: 'spendGold', value: 50 }, { type: 'gainCard', rarity: 'uncommon' }] },
        { label: '绕行', log: '你选择另一条路。', results: [{ type: 'heal', value: 4 }] },
      ],
    },
    {
      id: 'repair-bay', name: '自动维修舱', text: '维修机械臂悬在半空，仍在等待一个需要修理的目标。它的指示灯是温和的绿色。',
      options: [
        { label: '接受维修', log: '机械臂仔细地修补了你的伤口。', results: [{ type: 'heal', value: 22 }] },
        { label: '更换模块', log: '你换上了一块新的处理模块。', results: [{ type: 'gainCard', rarity: 'common' }] },
        { label: '索取备用件', log: '备用件可以换钱。', results: [{ type: 'gainGold', value: 40 }] },
      ],
    },
    {
      id: 'ghost-vessel', name: '幽灵船', text: '一艘没有引擎的运输舰缓缓漂过舷窗。甲板上站着许多人影，他们安静地看向同一个方向。',
      options: [
        { label: '登上甲板', log: '他们让出一小块地方给你。', results: [{ type: 'gainCard', rarity: 'uncommon' }, { type: 'loseHp', value: 7 }] },
        { label: '打捞补给', log: '你从货舱搬回不少东西。', results: [{ type: 'gainGold', value: 70 }] },
        { label: '向船长致意', log: '船长的遗骸上有一枚徽章。', results: [{ type: 'gainPotion', count: 1 }] },
      ],
    },
    {
      id: 'bone-choir', name: '白骨唱诗班', text: '十二具骨架围成一圈，下颌开合却没有声音。你听到的旋律来自自己的骨头。',
      options: [
        { label: '加入合唱', log: '你唱完了一整段。骨头在震动中重组。', results: [{ type: 'maxHp', value: 10 }, { type: 'loseHp', value: 5 }] },
        { label: '打断仪式', log: '骨架散落一地，留下一些东西。', results: [{ type: 'gainGold', value: 60 }, { type: 'loseHp', value: 8 }] },
        { label: '静静旁观', log: '你听完了一整段，然后离开。', results: [{ type: 'gainPotion', count: 1 }] },
      ],
    },
    {
      id: 'core-fragment', name: '核心碎片', text: '一整块棱晶插在墙里，内部有东西在缓慢地转动，像一颗正在思考的心脏。',
      options: [
        { label: '取出棱晶', log: '棱晶灼伤了你的手，但力量留了下来。', results: [{ type: 'gainCard', rarity: 'rare' }, { type: 'loseHp', value: 10 }] },
        { label: '研究它', log: '你理解了它的结构，并加固了自己。', results: [{ type: 'maxHp', value: 12 }] },
        { label: '引爆它', log: '爆炸把附近的敌人都震碎了一部分。', results: [{ type: 'gainGold', value: 90 }] },
      ],
    },
    {
      id: 'final-transmission', name: '最后的通讯', text: '扩音器里传来一段断断续续的广播，反复念着一个坐标，和一个很久以前的名字。',
      options: [
        { label: '回应通讯', log: '有人接收到了你的信号。', results: [{ type: 'gainRelic' }] },
        { label: '记录坐标', log: '坐标指向几个还能用的物资箱。', results: [{ type: 'gainGold', value: 65 }, { type: 'gainPotion', count: 1 }] },
        { label: '关闭扩音器', log: '你终于得到了一点安静。', results: [{ type: 'heal', value: 14 }] },
      ],
    },
    {
      id: 'furnace-gate', name: '熔炉之门', text: '门缝里透出橘色的光，热得让人后退半步。门把手上结着一层冷却的金属壳。',
      options: [
        { label: '撬开门', log: '你从炉渣里扒出几块还能用的材料。', results: [{ type: 'gainGold', value: 85 }, { type: 'loseHp', value: 9 }] },
        { label: '在炉口锻造', log: '你把一件装备重新锻打了一遍。', results: [{ type: 'upgradeCard' }] },
        { label: '借火取暖', log: '暖意让僵硬的手指重新灵活起来。', results: [{ type: 'heal', value: 16 }, { type: 'gainPotion', count: 1 }] },
      ],
    },
    {
      id: 'cryo-pod', name: '休眠舱', text: '舱盖内侧结满霜花，里面的人已经停了很久。生命维持灯还在规律地闪。',
      options: [
        { label: '唤醒他', log: '他睁开眼，说了三个字，然后给你留下了东西。', results: [{ type: 'gainCard', rarity: 'rare' }] },
        { label: '拆下维生模块', log: '模块还能给你的核心供电。', results: [{ type: 'maxHp', value: 14 }] },
        { label: '让他继续睡', log: '你替他把舱盖关好。', results: [{ type: 'heal', value: 12 }, { type: 'gainGold', value: 40 }] },
      ],
    },
    {
      id: 'spore-bloom', name: '孢子盛放', text: '巨大的菌伞在你面前张开，落下细密的金色粉尘。呼吸一次，就有一瞬间的恍惚。',
      options: [
        { label: '吸一口', log: '世界变得鲜艳，疼痛也跟着消失了。', results: [{ type: 'heal', value: 30 }, { type: 'loseHp', value: 6 }] },
        { label: '采集孢子', log: '你把孢子装进密封罐，能做很多事。', results: [{ type: 'gainPotion', count: 2 }, { type: 'gainGold', value: 50 }] },
        { label: '烧掉它', log: '火焰烧穿了菌伞，留下一条通路。', results: [{ type: 'gainGold', value: 75 }] },
      ],
    },
    {
      id: 'mirror-self', name: '另一个你', text: '镜面里站着一个人，动作和你完全相同，只是伤口的位置正好相反。',
      options: [
        { label: '向它伸手', log: '镜面裂开，两只手叠在了一起。', results: [{ type: 'maxHp', value: 16 }, { type: 'loseHp', value: 10 }] },
        { label: '打碎镜面', log: '碎片割过脸颊，但里面掉出了东西。', results: [{ type: 'gainRelic' }, { type: 'loseHp', value: 8 }] },
        { label: '背对它离开', log: '脚步声在身后重叠了两次。', results: [{ type: 'gainGold', value: 95 }] },
      ],
    },
    {
      id: 'clock-stall', name: '停滞的钟表摊', text: '无数块表停在同一个时刻。摊主不在，秤上还放着没称完的秒。',
      options: [
        { label: '拿走一块表', log: '时间在你身上走得慢了一点。', results: [{ type: 'gainRelic' }] },
        { label: '拨回指针', log: '你回到了几分钟前，伤口还没裂开。', results: [{ type: 'heal', value: 26 }] },
        { label: '把表全部上弦', log: '整条走廊同时开始走动，抖落了不少零件。', results: [{ type: 'gainGold', value: 110 }] },
      ],
    },
    {
      id: 'blood-offering', name: '血月祭台', text: '台面是温的。凹槽里积着刚凝固不久的血，还倒映着上方那轮红肿的月亮。',
      options: [
        { label: '躺上台面', log: '月亮看着你，然后给了你力量。', results: [{ type: 'loseHp', value: 16 }, { type: 'gainCard', rarity: 'rare' }] },
        { label: '灌满容器', log: '你把血装进了随身容器。', results: [{ type: 'loseHp', value: 8 }, { type: 'gainPotion', count: 2 }] },
        { label: '砸掉祭台', log: '石块滚落，底下压着别人的收藏。', results: [{ type: 'gainGold', value: 100 }] },
      ],
    },
    {
      id: 'star-remnant', name: '恒星残骸', text: '一颗死去的恒星只剩下拳头大小，仍在缓慢发光。凑近一点，能听见心跳般的低频震动。',
      options: [
        { label: '握住它', log: '灼痛之后，你的核心变得致密。', results: [{ type: 'maxHp', value: 20 }, { type: 'loseHp', value: 12 }] },
        { label: '敲下碎片', log: '碎片能卖出很好的价钱。', results: [{ type: 'gainGold', value: 130 }] },
        { label: '让它继续燃烧', log: '你坐在旁边，看它慢慢变暗。', results: [{ type: 'heal', value: 30 }, { type: 'gainPotion', count: 1 }] },
      ],
    },
    {
      id: 'void-choir', name: '虚无合唱', text: '没有任何声音，却有一种明确的「正在被歌唱」的感觉。你的名字在缺失中被反复念到。',
      options: [
        { label: '跟着唱', log: '你唱出了自己的一部分，换回了力量。', results: [{ type: 'loseHp', value: 14 }, { type: 'gainRelic' }] },
        { label: '闭上听觉', log: '你屏蔽了合唱，头脑清醒了一些。', results: [{ type: 'heal', value: 24 }, { type: 'gainGold', value: 60 }] },
        { label: '记下旋律', log: '旋律被你刻进了核心，成为一段可用的代码。', results: [{ type: 'gainCard', rarity: 'rare' }] },
      ],
    },
    {
      id: 'origin-echo', name: '源初回响', text: '整条通道都在重复你走过的脚步声，只是快了一拍，像是有人在前面等你。',
      options: [
        { label: '跟上那个节拍', log: '你超越了自己的影子。', results: [{ type: 'gainCard', rarity: 'rare' }, { type: 'gainRelic' }] },
        { label: '停下脚步', log: '回响追上了你，然后穿过去继续往前。', results: [{ type: 'maxHp', value: 22 }, { type: 'heal', value: 20 }] },
        { label: '反向行走', log: '你从另一个方向抵达了同一处，手里多了些东西。', results: [{ type: 'gainGold', value: 150 }, { type: 'gainPotion', count: 2 }] },
      ],
    },
  ];
  const EVENT_MAP = {};
  for (const item of EVENTS) EVENT_MAP[item.id] = item;

  // 地图布局：12 章统一使用同一条 15 层骨架，前四层较弱，末层固定首领。
  const MAP_LAYOUT = [
    'fight', 'fight', null, 'event', 'elite', 'rest', null, 'treasure', 'fight', 'shop', 'event', null, 'elite', 'rest', 'boss',
  ];
  function choose(list, rng) { return list[rng.int(list.length)]; }
  function shuffle(list, rng) {
    const copy = [...list];
    for (let index = copy.length - 1; index > 0; index--) {
      const swap = rng.int(index + 1);
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
  }
  function battleFor(chapter, kind, rng) {
    const encounter = enemies.ENCOUNTERS.find(item => item.chapter === chapter && item.kind === kind)
      || enemies.ENCOUNTERS.find(item => item.kind === kind);
    const pool = encounter && encounter.pool.length ? encounter.pool : [['scout-drone']];
    return { kind, enemies: choose(pool, rng), hpScale: (encounter && encounter.hpScale) || 1 };
  }
  function createMap(chapter, rng) {
    const usedEvents = new Set();
    // 深层章节优先抽取新事件，避免反复看到同一批。
    const from = Math.min(EVENTS.length - 4, Math.max(0, (chapter - 1) * 1.6 - 2));
    return MAP_LAYOUT.map((fixed, index) => {
      const floor = index + 1;
      if (fixed === 'boss') return { floor, type: 'boss', battle: battleFor(chapter, 'boss', rng) };
      if (fixed === 'elite') return { floor, type: 'elite', battle: battleFor(chapter, 'elite', rng) };
      if (fixed === 'rest') return { floor, type: 'rest', options: ['heal', 'smith'] };
      if (fixed === 'treasure') return { floor, type: 'treasure' };
      if (fixed === 'shop') return { floor, type: 'shop' };
      if (fixed === 'event') {
        let pool = EVENTS.filter((item, order) => !usedEvents.has(item.id) && order >= from);
        if (!pool.length) pool = EVENTS.filter(item => !usedEvents.has(item.id));
        if (!pool.length) { usedEvents.clear(); pool = EVENTS; }
        const picked = choose(pool, rng);
        usedEvents.add(picked.id);
        return { floor, type: 'event', event: picked.id };
      }
      const kind = floor <= 4 ? 'weak' : 'normal';
      return { floor, type: 'fight', battle: battleFor(chapter, kind, rng) };
    });
  }

  function nodeLabel(node) {
    if (node.type === 'fight') return node.battle.kind === 'weak' ? '游荡者' : '敌群';
    if (node.type === 'elite') return '精英';
    if (node.type === 'event') return '未知';
    if (node.type === 'rest') return '维修站';
    if (node.type === 'treasure') return '补给舱';
    if (node.type === 'shop') return '黑市';
    if (node.type === 'boss') return '首领';
    return '未知';
  }
  function nodeIcon(node) {
    return { fight: 'claw', elite: 'skull', event: 'question', rest: 'wrench', treasure: 'chest', shop: 'coin', boss: 'crown' }[node.type];
  }

  return {
    CHAPTERS, RELICS, RELIC_MAP, RELIC_POOL, BOSS_RELICS, POTIONS, POTION_MAP, EVENTS, EVENT_MAP,
    MAP_LAYOUT, createMap, battleFor, nodeLabel, nodeIcon, shuffle, choose,
    ENEMIES: enemies.ENEMIES, ENEMY_MAP: enemies.ENEMY_MAP, byChapter: chapter => enemies.ENEMIES.filter(item => item.chapter === chapter),
  };
});
