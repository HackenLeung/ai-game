// 深渊回响 · 敌人数据。12 章各自拥有普通敌人、精英与首领，遭遇池按章节自动组合。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AbyssEnemies = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 意图：attack 攻击、attackBlock 攻击并格挡、block 格挡、buff 强化、debuff 削弱、status 施加状态。
  // effects 使用与卡牌一致的效果语言：target 为 player（作用于玩家）或 self（作用于自己）。
  function e(id, name, chapter, kind, hp, art, moves, extra) {
    return { id, name, chapter, kind, hp, art, moves, ...extra };
  }
  const hit = (value, times) => (times ? { type: 'damage', value, times, target: 'player' } : { type: 'damage', value, target: 'player' });
  const shield = value => ({ type: 'block', value, target: 'self' });
  const selfBuff = (status, value) => ({ type: 'status', status, value, target: 'self' });
  const hex = (status, value) => ({ type: 'status', status, value, target: 'player' });
  const mend = value => ({ type: 'heal', value, target: 'self' });

  const ENEMIES = [
    // ============ 第一章 · 回响航母 ============
    e('scout-drone', '巡逻无人机', 1, 'normal', [17, 23], 'drone', [
      { id: 'scan', name: '扫描', intent: 'debuff', effects: [hex('vulnerable', 2)] },
      { id: 'shot', name: '点射', intent: 'attack', effects: [hit(6)] },
      { id: 'burst', name: '连射', intent: 'attack', effects: [hit(3, 2)] },
    ]),
    e('guard-mech', '守卫机兵', 1, 'normal', [28, 34], 'mech', [
      { id: 'guard', name: '举盾', intent: 'block', effects: [shield(9)] },
      { id: 'slam', name: '重击', intent: 'attack', effects: [hit(9)] },
      { id: 'bash', name: '盾击', intent: 'attackBlock', effects: [hit(5), shield(6)] },
    ]),
    e('worker-drone', '工程无人机', 1, 'normal', [25, 31], 'drone', [
      { id: 'weld', name: '焊接', intent: 'attack', effects: [hit(5)] },
      { id: 'polish', name: '加固', intent: 'buff', effects: [selfBuff('strength', 2)] },
      { id: 'scrap', name: '投掷零件', intent: 'attack', effects: [hit(6)] },
    ]),
    e('magnet-mite', '磁力虫群', 1, 'normal', [22, 28], 'mite', [
      { id: 'bite', name: '啃咬', intent: 'attack', effects: [hit(4)] },
      { id: 'coil', name: '盘绕', intent: 'block', effects: [shield(6)] },
      { id: 'spark', name: '放电', intent: 'attack', effects: [hit(5), hex('weak', 1)] },
    ]),
    e('scrap-crawler', '废铁爬虫', 1, 'normal', [22, 28], 'crawler', [
      { id: 'crush', name: '碾压', intent: 'attack', effects: [hit(8)] },
      { id: 'acid', name: '酸液', intent: 'status', effects: [hex('poison', 2)] },
      { id: 'hide', name: '缩壳', intent: 'block', effects: [shield(8)] },
    ]),
    e('pulse-turret', '脉冲炮塔', 1, 'normal', [25, 31], 'turret', [
      { id: 'charge', name: '充能', intent: 'buff', effects: [selfBuff('strength', 2)] },
      { id: 'pulse', name: '脉冲', intent: 'attack', effects: [hit(10)] },
      { id: 'sweep', name: '扫射', intent: 'attack', effects: [hit(4, 2)] },
    ]),
    e('void-mender', '虚空修补者', 1, 'elite', [56, 61], 'mender', [
      { id: 'patch', name: '缝合', intent: 'block', effects: [shield(13)] },
      { id: 'rend', name: '撕裂', intent: 'attack', effects: [hit(13)] },
      { id: 'unmake', name: '解构', intent: 'attack', effects: [hit(7, 2), hex('vulnerable', 2)] },
      { id: 'rebuild', name: '重构', intent: 'buff', effects: [selfBuff('strength', 2), shield(8)] },
    ]),
    e('hollow-knight', '空洞骑士', 1, 'elite', [64, 69], 'knight', [
      { id: 'stance', name: '架势', intent: 'block', effects: [shield(12), selfBuff('strength', 2)] },
      { id: 'cleave', name: '横扫', intent: 'attack', effects: [hit(14)] },
      { id: 'guard-break', name: '破盾', intent: 'attack', effects: [hit(9), hex('frail', 2)] },
      { id: 'charge-up', name: '冲锋', intent: 'attack', effects: [hit(5, 3)] },
    ]),
    e('echo-warden', '回响典狱长', 1, 'boss', [118, 118], 'warden', [
      { id: 'judge', name: '审判', intent: 'attack', effects: [hit(8, 2)] },
      { id: 'lockdown', name: '封锁', intent: 'attackBlock', effects: [hit(10), shield(12)] },
      { id: 'decree', name: '敕令', intent: 'debuff', effects: [hex('weak', 2), hex('vulnerable', 2)] },
      { id: 'overdrive', name: '过载', intent: 'buff', effects: [selfBuff('strength', 2), shield(10)] },
      { id: 'purge', name: '肃清', intent: 'attack', effects: [hit(6, 3)] },
    ], { phases: { at: 0.5, name: '暴走形态', block: 10, strength: 1 } }),

    // ============ 第二章 · 寂静墓园 ============
    e('bone-soldier', '骸骨士兵', 2, 'normal', [32, 37], 'skeleton', [
      { id: 'slash', name: '挥砍', intent: 'attack', effects: [hit(9)] },
      { id: 'shield', name: '骨盾', intent: 'block', effects: [shield(8), selfBuff('strength', 1)] },
      { id: 'throw', name: '投矛', intent: 'attack', effects: [hit(12)] },
    ]),
    e('zombie', '腐化僵尸', 2, 'normal', [30, 35], 'zombie', [
      { id: 'claw', name: '撕抓', intent: 'attack', effects: [hit(8)] },
      { id: 'bite', name: '啃噬', intent: 'attack', effects: [hit(6), mend(6)] },
      { id: 'howl', name: '嚎叫', intent: 'buff', effects: [selfBuff('strength', 3)] },
      { id: 'rot', name: '腐肉', intent: 'status', effects: [hex('poison', 4)] },
    ]),
    e('ghost', '凄厉幽魂', 2, 'normal', [27, 32], 'ghost', [
      { id: 'drain', name: '汲取', intent: 'attack', effects: [hit(7), mend(5)] },
      { id: 'fade', name: '虚化', intent: 'block', effects: [shield(10)] },
      { id: 'wail', name: '哀嚎', intent: 'debuff', effects: [hex('weak', 2)] },
    ]),
    e('plague-monk', '瘟疫僧侣', 2, 'normal', [25, 30], 'monk', [
      { id: 'chant', name: '低语祷告', intent: 'status', effects: [hex('poison', 5)] },
      { id: 'strike', name: '枯杖', intent: 'attack', effects: [hit(10)] },
      { id: 'ward', name: '护法', intent: 'block', effects: [shield(12)] },
    ]),
    e('corpse-cart', '尸骸拖车', 2, 'normal', [26, 31], 'cart', [
      { id: 'ram', name: '冲撞', intent: 'attack', effects: [hit(13)] },
      { id: 'dump', name: '倾泻', intent: 'status', effects: [hex('poison', 4), hex('frail', 2)] },
      { id: 'brace', name: '支挡', intent: 'block', effects: [shield(14)] },
    ]),
    e('flesh-amalgam', '血肉聚合体', 2, 'elite', [68, 73], 'amalgam', [
      { id: 'absorb', name: '吸收', intent: 'attack', effects: [hit(16), mend(10)] },
      { id: 'split', name: '分裂', intent: 'buff', effects: [selfBuff('strength', 4), shield(10)] },
      { id: 'smash', name: '重砸', intent: 'attack', effects: [hit(20)] },
      { id: 'ooze', name: '渗出', intent: 'status', effects: [hex('poison', 6)] },
    ]),
    e('bone-lord', '白骨领主', 2, 'elite', [77, 82], 'lord', [
      { id: 'command', name: '号令', intent: 'buff', effects: [selfBuff('strength', 3), shield(12)] },
      { id: 'cleave', name: '斩骨', intent: 'attack', effects: [hit(19)] },
      { id: 'rally', name: '召集', intent: 'block', effects: [shield(18), mend(8)] },
      { id: 'execute', name: '处决', intent: 'attack', effects: [hit(10, 2)] },
    ]),
    e('grave-queen', '墓园女王', 2, 'boss', [150, 150], 'queen', [
      { id: 'scepter', name: '权杖', intent: 'attack', effects: [hit(13, 2)] },
      { id: 'summon', name: '呼喚亡者', intent: 'block', effects: [shield(16), selfBuff('strength', 3)] },
      { id: 'curse', name: '诅咒', intent: 'status', effects: [hex('poison', 6), hex('vulnerable', 2)] },
      { id: 'wither', name: '枯萎', intent: 'debuff', effects: [hex('weak', 3), hex('frail', 3)] },
      { id: 'death-knell', name: '丧钟', intent: 'attack', effects: [hit(10, 3)] },
    ], { phases: { at: 0.5, name: '亡者真容', block: 12, strength: 3 } }),

    // ============ 第三章 · 深渊核心 ============
    e('rift-spawn', '裂隙幼体', 3, 'normal', [34, 39], 'spawn', [
      { id: 'lunge', name: '突刺', intent: 'attack', effects: [hit(11)] },
      { id: 'shift', name: '相位偏移', intent: 'block', effects: [shield(12)] },
      { id: 'gnaw', name: '啃噬', intent: 'attack', effects: [hit(7, 2)] },
    ]),
    e('star-leviathan', '星海利维坦', 3, 'normal', [38, 43], 'leviathan', [
      { id: 'swallow', name: '吞没', intent: 'attack', effects: [hit(15)] },
      { id: 'tide', name: '引力潮', intent: 'status', effects: [hex('frail', 3)] },
      { id: 'grow', name: '膨胀', intent: 'buff', effects: [selfBuff('strength', 3), shield(8)] },
    ]),
    e('echo-knight', '回响骑士', 3, 'normal', [32, 37], 'knight', [
      { id: 'slash', name: '斩击', intent: 'attack', effects: [hit(13)] },
      { id: 'parry', name: '格挡', intent: 'block', effects: [shield(12), selfBuff('strength', 2)] },
      { id: 'double', name: '双斩', intent: 'attack', effects: [hit(7, 2)] },
    ]),
    e('nanite-swarm', '纳米虫群', 3, 'normal', [40, 45], 'swarm', [
      { id: 'consume', name: '吞噬', intent: 'attack', effects: [hit(9)] },
      { id: 'repair', name: '重构', intent: 'buff', effects: [shield(10), mend(8)] },
      { id: 'infest', name: '侵蚀', intent: 'status', effects: [hex('poison', 5)] },
    ]),
    e('void-herald', '虚空先驱', 3, 'normal', [34, 39], 'herald', [
      { id: 'bolt', name: '虚空箭', intent: 'attack', effects: [hit(14)] },
      { id: 'mark', name: '印记', intent: 'debuff', effects: [hex('vulnerable', 3)] },
      { id: 'shield', name: '虚盾', intent: 'block', effects: [shield(15)] },
    ]),
    e('obsidian-golem', '黑曜石魔像', 3, 'elite', [80, 85], 'golem', [
      { id: 'fist', name: '巨拳', intent: 'attack', effects: [hit(24)] },
      { id: 'harden', name: '硬化', intent: 'block', effects: [shield(22), selfBuff('strength', 2)] },
      { id: 'quake', name: '震荡', intent: 'attack', effects: [hit(11, 2), hex('frail', 2)] },
    ]),
    e('abyss-weaver', '深渊织者', 3, 'elite', [89, 94], 'weaver', [
      { id: 'weave', name: '编织', intent: 'status', effects: [hex('poison', 7), hex('weak', 2)] },
      { id: 'pierce', name: '穿刺', intent: 'attack', effects: [hit(22)] },
      { id: 'cocoon', name: '茧化', intent: 'block', effects: [shield(20), mend(10)] },
    ]),
    e('abyss-heart', '深渊之心', 3, 'boss', [180, 180], 'heart', [
      { id: 'beat', name: '心跳', intent: 'attack', effects: [hit(15, 2)] },
      { id: 'drain', name: '汲取星海', intent: 'attack', effects: [hit(22), mend(14)] },
      { id: 'terror', name: '终焉低语', intent: 'debuff', effects: [hex('weak', 3), hex('vulnerable', 3)] },
      { id: 'sustain', name: '存续', intent: 'buff', effects: [selfBuff('strength', 4), shield(18)] },
      { id: 'collapse', name: '坍缩', intent: 'attack', effects: [hit(12, 3)] },
    ], { phases: { at: 0.5, name: '深渊显形', block: 15, strength: 4 } }),

    // ============ 第四章 · 熔火铸造厂 ============
    e('slag-hound', '熔渣猎犬', 4, 'normal', [42, 47], 'crawler', [
      { id: 'pounce', name: '扑咬', intent: 'attack', effects: [hit(13)] },
      { id: 'scorch', name: '灼息', intent: 'status', effects: [hex('burn', 4)] },
      { id: 'howl', name: '嘶吼', intent: 'buff', effects: [selfBuff('strength', 3)] },
    ]),
    e('forge-servitor', '锻造仆役', 4, 'normal', [42, 47], 'mech', [
      { id: 'hammer', name: '铁锤', intent: 'attack', effects: [hit(16)] },
      { id: 'temper', name: '淬火', intent: 'block', effects: [shield(16), selfBuff('strength', 2)] },
      { id: 'sparks', name: '溅射', intent: 'attack', effects: [hit(8, 2), hex('burn', 2)] },
    ]),
    e('magma-crawler', '熔岩爬虫', 4, 'normal', [47, 52], 'crawler', [
      { id: 'engulf', name: '熔流', intent: 'attack', effects: [hit(15)] },
      { id: 'harden', name: '结壳', intent: 'block', effects: [shield(14)] },
      { id: 'ignite', name: '点燃', intent: 'status', effects: [hex('burn', 5)] },
    ]),
    e('ember-wraith', '余烬怨灵', 4, 'normal', [48, 53], 'ghost', [
      { id: 'flare', name: '爆燃', intent: 'attack', effects: [hit(11), hex('burn', 2)] },
      { id: 'drift', name: '飘散', intent: 'block', effects: [shield(12)] },
      { id: 'drain', name: '吸热', intent: 'attack', effects: [hit(8), mend(8)] },
    ]),
    e('crucible-tyrant', '坩埚暴君', 4, 'elite', [92, 98], 'lord', [
      { id: 'pour', name: '倾炉', intent: 'attack', effects: [hit(26)] },
      { id: 'bath', name: '熔浴', intent: 'buff', effects: [selfBuff('strength', 4), shield(14)] },
      { id: 'splash', name: '飞溅', intent: 'attack', effects: [hit(12, 2), hex('burn', 4)] },
    ]),
    e('flame-overseer', '烈焰监工', 4, 'elite', [102, 108], 'turret', [
      { id: 'focus', name: '聚焦', intent: 'attack', effects: [hit(30)] },
      { id: 'vent', name: '排气', intent: 'status', effects: [hex('burn', 7)] },
      { id: 'sweep', name: '横扫', intent: 'attack', effects: [hit(10, 3)] },
    ]),
    e('forge-heart', '铸造之心', 4, 'boss', [210, 210], 'heart', [
      { id: 'piston', name: '活塞', intent: 'attack', effects: [hit(17, 2)] },
      { id: 'melt', name: '熔化', intent: 'status', effects: [hex('burn', 8), hex('vulnerable', 2)] },
      { id: 'anneal', name: '退火', intent: 'block', effects: [shield(24), mend(16)] },
      { id: 'burst', name: '爆炉', intent: 'attack', effects: [hit(14, 3)] },
    ], { phases: { at: 0.45, name: '炉心失控', block: 18, strength: 4 } }),

    // ============ 第五章 · 低温冷藏库 ============
    e('frost-drone', '霜冻无人机', 5, 'normal', [47, 52], 'drone', [
      { id: 'chill', name: '霜针', intent: 'attack', effects: [hit(14)] },
      { id: 'freeze', name: '冻结', intent: 'debuff', effects: [hex('frail', 3)] },
      { id: 'hail', name: '冰雹', intent: 'attack', effects: [hit(7, 3)] },
    ]),
    e('ice-stalker', '冰霜潜行者', 5, 'normal', [53, 58], 'spawn', [
      { id: 'ambush', name: '伏击', intent: 'attack', effects: [hit(20)] },
      { id: 'cloak', name: '隐身', intent: 'block', effects: [shield(18)] },
      { id: 'shred', name: '碎冰', intent: 'attack', effects: [hit(9, 2), hex('vulnerable', 2)] },
    ]),
    e('cryo-mech', '冷藏机兵', 5, 'normal', [53, 58], 'mech', [
      { id: 'slam', name: '重压', intent: 'attack', effects: [hit(19)] },
      { id: 'plate', name: '装甲', intent: 'block', effects: [shield(20), selfBuff('strength', 2)] },
      { id: 'coolant', name: '冷却液', intent: 'status', effects: [hex('weak', 3)] },
    ]),
    e('glacial-mite', '冰川虫群', 5, 'normal', [49, 54], 'mite', [
      { id: 'swarm', name: '集群', intent: 'attack', effects: [hit(6, 3)] },
      { id: 'shell', name: '冰壳', intent: 'block', effects: [shield(14)] },
      { id: 'numb', name: '冻麻', intent: 'debuff', effects: [hex('weak', 2), hex('frail', 2)] },
    ]),
    e('absolute-zero', '绝对零度', 5, 'elite', [104, 110], 'golem', [
      { id: 'shatter', name: '碎星', intent: 'attack', effects: [hit(30)] },
      { id: 'stillness', name: '凝滞', intent: 'block', effects: [shield(30), mend(14)] },
      { id: 'wave', name: '寒潮', intent: 'attack', effects: [hit(13, 2), hex('frail', 3)] },
    ]),
    e('cryo-warden', '霜狱典狱官', 5, 'elite', [114, 120], 'warden', [
      { id: 'lock', name: '锁链', intent: 'attack', effects: [hit(24), hex('weak', 2)] },
      { id: 'guard', name: '冰墙', intent: 'block', effects: [shield(26), selfBuff('strength', 3)] },
      { id: 'verdict', name: '裁决', intent: 'attack', effects: [hit(12, 3)] },
    ]),
    e('winter-core', '凛冬之核', 5, 'boss', [240, 240], 'heart', [
      { id: 'blizzard', name: '暴雪', intent: 'attack', effects: [hit(20, 2)] },
      { id: 'deepfreeze', name: '深冻', intent: 'debuff', effects: [hex('frail', 4), hex('weak', 3)] },
      { id: 'glacier', name: '冰川', intent: 'block', effects: [shield(30), selfBuff('strength', 3)] },
      { id: 'absolute', name: '绝对零度', intent: 'attack', effects: [hit(16, 3)] },
    ], { phases: { at: 0.45, name: '永冬降临', block: 20, strength: 5 } }),

    // ============ 第六章 · 孢子温床 ============
    e('spore-pod', '孢子荚', 6, 'normal', [53, 59], 'swarm', [
      { id: 'release', name: '释放孢子', intent: 'status', effects: [hex('poison', 7)] },
      { id: 'burst', name: '爆荚', intent: 'attack', effects: [hit(17)] },
      { id: 'swell', name: '膨胀', intent: 'block', effects: [shield(18), selfBuff('strength', 2)] },
    ]),
    e('mycelium-walker', '菌丝行者', 6, 'normal', [55, 61], 'zombie', [
      { id: 'lash', name: '菌鞭', intent: 'attack', effects: [hit(18)] },
      { id: 'root', name: '扎根', intent: 'buff', effects: [shield(16), mend(12)] },
      { id: 'spores', name: '播散', intent: 'status', effects: [hex('poison', 5), hex('weak', 2)] },
    ]),
    e('fungal-brute', '真菌蛮兵', 6, 'normal', [58, 64], 'amalgam', [
      { id: 'crush', name: '碾碎', intent: 'attack', effects: [hit(23)] },
      { id: 'thicken', name: '增厚', intent: 'block', effects: [shield(22)] },
      { id: 'infection', name: '感染', intent: 'status', effects: [hex('poison', 9)] },
    ]),
    e('toxic-swarm', '剧毒虫群', 6, 'normal', [50, 56], 'mite', [
      { id: 'sting', name: '毒刺', intent: 'attack', effects: [hit(8, 2), hex('poison', 2)] },
      { id: 'cloud', name: '毒云', intent: 'status', effects: [hex('poison', 6)] },
      { id: 'scatter', name: '散开', intent: 'block', effects: [shield(12)] },
    ]),
    e('brood-mother', '母巢', 6, 'elite', [116, 123], 'weaver', [
      { id: 'spawn', name: '产卵', intent: 'attack', effects: [hit(26)] },
      { id: 'brood', name: '孵化', intent: 'buff', effects: [selfBuff('strength', 4), shield(18)] },
      { id: 'venom', name: '毒液', intent: 'status', effects: [hex('poison', 12)] },
      { id: 'slam', name: '重压', intent: 'attack', effects: [hit(15, 2)] },
    ]),
    e('rot-titan', '腐烂巨像', 6, 'elite', [127, 134], 'golem', [
      { id: 'fist', name: '腐拳', intent: 'attack', effects: [hit(34)] },
      { id: 'decay', name: '腐朽', intent: 'status', effects: [hex('poison', 10), hex('frail', 3)] },
      { id: 'regrow', name: '再生', intent: 'block', effects: [shield(26), mend(20)] },
    ]),
    e('plague-root', '疫病之根', 6, 'boss', [266, 266], 'weaver', [
      { id: 'spread', name: '蔓延', intent: 'status', effects: [hex('poison', 10), hex('weak', 3)] },
      { id: 'constrict', name: '绞杀', intent: 'attack', effects: [hit(22, 2)] },
      { id: 'bloom', name: '盛放', intent: 'buff', effects: [selfBuff('strength', 5), shield(22)] },
      { id: 'consume', name: '吞噬', intent: 'attack', effects: [hit(30), mend(24)] },
    ], { phases: { at: 0.45, name: '孢子爆发', block: 22, strength: 5 } }),

    // ============ 第七章 · 镜像回廊 ============
    e('mirror-shade', '镜影', 7, 'normal', [59, 65], 'ghost', [
      { id: 'copy', name: '模仿', intent: 'attack', effects: [hit(19)] },
      { id: 'polish', name: '抛光', intent: 'block', effects: [shield(20)] },
      { id: 'reflect', name: '反射', intent: 'buff', effects: [selfBuff('thorns', 4)] },
    ]),
    e('glass-sentinel', '琉璃哨兵', 7, 'normal', [62, 68], 'knight', [
      { id: 'stab', name: '穿刺', intent: 'attack', effects: [hit(21)] },
      { id: 'facet', name: '切面', intent: 'block', effects: [shield(24), selfBuff('strength', 2)] },
      { id: 'splinter', name: '崩裂', intent: 'attack', effects: [hit(10, 2), hex('vulnerable', 2)] },
    ]),
    e('refraction', '折射体', 7, 'normal', [64, 70], 'swarm', [
      { id: 'bend', name: '偏折', intent: 'attack', effects: [hit(8, 3)] },
      { id: 'split', name: '分光', intent: 'buff', effects: [selfBuff('strength', 3), shield(12)] },
      { id: 'blind', name: '炫目', intent: 'debuff', effects: [hex('weak', 3)] },
    ]),
    e('echo-copy', '回响副本', 7, 'normal', [67, 73], 'drone', [
      { id: 'mimic', name: '复写', intent: 'attack', effects: [hit(17)] },
      { id: 'backup', name: '备份', intent: 'block', effects: [shield(18), mend(10)] },
      { id: 'overwrite', name: '覆写', intent: 'status', effects: [hex('vulnerable', 3)] },
    ]),
    e('perfect-reflection', '完美镜像', 7, 'elite', [128, 135], 'herald', [
      { id: 'mirror', name: '镜像', intent: 'attack', effects: [hit(30)] },
      { id: 'reverse', name: '逆转', intent: 'buff', effects: [selfBuff('thorns', 8), shield(20)] },
      { id: 'shatter', name: '碎镜', intent: 'attack', effects: [hit(14, 3)] },
    ]),
    e('prism-colossus', '棱镜巨像', 7, 'elite', [140, 147], 'golem', [
      { id: 'beam', name: '光束', intent: 'attack', effects: [hit(38)] },
      { id: 'refract', name: '折射', intent: 'block', effects: [shield(34), selfBuff('strength', 4)] },
      { id: 'scatter', name: '散射', intent: 'attack', effects: [hit(16, 2), hex('frail', 3)] },
    ]),
    e('mirror-sovereign', '镜之主宰', 7, 'boss', [292, 292], 'queen', [
      { id: 'edict', name: '镜谕', intent: 'attack', effects: [hit(24, 2)] },
      { id: 'duplicate', name: '复制', intent: 'buff', effects: [selfBuff('thorns', 10), shield(26)] },
      { id: 'invert', name: '倒错', intent: 'debuff', effects: [hex('weak', 4), hex('frail', 4)] },
      { id: 'shatter', name: '万镜同碎', intent: 'attack', effects: [hit(18, 3)] },
    ], { phases: { at: 0.45, name: '真身显现', block: 24, strength: 6 } }),

    // ============ 第八章 · 时序钟塔 ============
    e('time-larva', '时序幼体', 8, 'normal', [63, 70], 'spawn', [
      { id: 'tick', name: '滴答', intent: 'attack', effects: [hit(20)] },
      { id: 'rewind', name: '回溯', intent: 'block', effects: [shield(22), mend(14)] },
      { id: 'haste', name: '加速', intent: 'buff', effects: [selfBuff('enrage', 2)] },
    ]),
    e('clockwork-sentry', '发条哨兵', 8, 'normal', [68, 75], 'mech', [
      { id: 'gear', name: '齿轮', intent: 'attack', effects: [hit(24)] },
      { id: 'wind', name: '上弦', intent: 'buff', effects: [selfBuff('strength', 4)] },
      { id: 'barrage', name: '齐射', intent: 'attack', effects: [hit(11, 3)] },
    ]),
    e('chrono-thief', '时序窃贼', 8, 'normal', [65, 72], 'monk', [
      { id: 'steal', name: '窃时', intent: 'attack', effects: [hit(16), mend(16)] },
      { id: 'blur', name: '残影', intent: 'block', effects: [shield(20)] },
      { id: 'stall', name: '停滞', intent: 'debuff', effects: [hex('weak', 3), hex('vulnerable', 2)] },
    ]),
    e('pendulum-horror', '钟摆恐魔', 8, 'normal', [63, 70], 'cart', [
      { id: 'swing', name: '摆动', intent: 'attack', effects: [hit(13, 2)] },
      { id: 'crush', name: '重摆', intent: 'attack', effects: [hit(30)] },
      { id: 'still', name: '静止', intent: 'block', effects: [shield(26)] },
    ]),
    e('hourglass-tyrant', '沙漏暴君', 8, 'elite', [140, 148], 'lord', [
      { id: 'sand', name: '流沙', intent: 'attack', effects: [hit(38)] },
      { id: 'invert', name: '倒转', intent: 'buff', effects: [selfBuff('enrage', 4), shield(24)] },
      { id: 'bury', name: '掩埋', intent: 'attack', effects: [hit(17, 3)] },
    ]),
    e('second-hand', '秒针', 8, 'elite', [153, 161], 'weaver', [
      { id: 'sweep', name: '掠影', intent: 'attack', effects: [hit(15, 3)] },
      { id: 'cut', name: '截断', intent: 'debuff', effects: [hex('frail', 4), hex('weak', 3)] },
      { id: 'pause', name: '停顿', intent: 'block', effects: [shield(36), mend(18)] },
    ]),
    e('chronarch', '时之执政', 8, 'boss', [318, 318], 'warden', [
      { id: 'edict', name: '时序敕令', intent: 'attack', effects: [hit(26, 2)] },
      { id: 'loop', name: '循环', intent: 'buff', effects: [selfBuff('enrage', 5), shield(28)] },
      { id: 'age', name: '老化', intent: 'debuff', effects: [hex('weak', 4), hex('frail', 4)] },
      { id: 'final', name: '终末之钟', intent: 'attack', effects: [hit(20, 3)] },
    ], { phases: { at: 0.45, name: '时间倒流', block: 26, strength: 6 } }),

    // ============ 第九章 · 血月祭坛 ============
    e('blood-acolyte', '血月祭徒', 9, 'normal', [77, 85], 'monk', [
      { id: 'offer', name: '献祭', intent: 'attack', effects: [hit(23)] },
      { id: 'chant', name: '血祷', intent: 'buff', effects: [selfBuff('strength', 4)] },
      { id: 'ward', name: '血盾', intent: 'block', effects: [shield(24)] },
    ]),
    e('crimson-hound', '猩红猎犬', 9, 'normal', [83, 91], 'crawler', [
      { id: 'maul', name: '撕咬', intent: 'attack', effects: [hit(14, 2)] },
      { id: 'bloodlust', name: '嗜血', intent: 'attack', effects: [hit(18), mend(14)] },
      { id: 'bay', name: '长嗥', intent: 'buff', effects: [selfBuff('enrage', 3)] },
    ]),
    e('flesh-sculptor', '塑肉者', 9, 'normal', [71, 79], 'amalgam', [
      { id: 'reshape', name: '重塑', intent: 'attack', effects: [hit(27)] },
      { id: 'graft', name: '移植', intent: 'block', effects: [shield(30), mend(20)] },
      { id: 'carve', name: '雕琢', intent: 'debuff', effects: [hex('frail', 3), hex('vulnerable', 3)] },
    ]),
    e('moon-ghoul', '月噬食尸鬼', 9, 'normal', [74, 82], 'zombie', [
      { id: 'feast', name: '啃食', intent: 'attack', effects: [hit(20), mend(18)] },
      { id: 'frenzy', name: '狂乱', intent: 'attack', effects: [hit(10, 3)] },
      { id: 'howl', name: '月嚎', intent: 'status', effects: [hex('weak', 3)] },
    ]),
    e('blood-priest', '血祭司', 9, 'elite', [154, 163], 'lord', [
      { id: 'ritual', name: '血祭', intent: 'attack', effects: [hit(42)] },
      { id: 'bless', name: '血佑', intent: 'buff', effects: [selfBuff('strength', 6), mend(26)] },
      { id: 'drain', name: '汲取', intent: 'attack', effects: [hit(18, 2), mend(20)] },
    ]),
    e('scarlet-behemoth', '猩红巨兽', 9, 'elite', [168, 177], 'golem', [
      { id: 'rend', name: '撕裂', intent: 'attack', effects: [hit(46)] },
      { id: 'roar', name: '咆哮', intent: 'buff', effects: [selfBuff('enrage', 5), shield(26)] },
      { id: 'flurry', name: '狂击', intent: 'attack', effects: [hit(16, 3)] },
    ]),
    e('blood-moon', '血月', 9, 'boss', [346, 346], 'heart', [
      { id: 'eclipse', name: '月蚀', intent: 'attack', effects: [hit(28, 2)] },
      { id: 'tide', name: '血潮', intent: 'debuff', effects: [hex('weak', 4), hex('vulnerable', 4)] },
      { id: 'offer', name: '索取', intent: 'attack', effects: [hit(36), mend(30)] },
      { id: 'full', name: '满月', intent: 'buff', effects: [selfBuff('enrage', 6), shield(30)] },
    ], { phases: { at: 0.45, name: '血月当空', block: 28, strength: 7 } }),

    // ============ 第十章 · 星骸坟场 ============
    e('dead-star', '死星残骸', 10, 'normal', [80, 88], 'heart', [
      { id: 'collapse', name: '塌缩', intent: 'attack', effects: [hit(30)] },
      { id: 'gravity', name: '引力', intent: 'debuff', effects: [hex('frail', 4)] },
      { id: 'shell', name: '残壳', intent: 'block', effects: [shield(30)] },
    ]),
    e('gravity-wisp', '重力幽光', 10, 'normal', [92, 100], 'ghost', [
      { id: 'pull', name: '牵引', intent: 'attack', effects: [hit(16, 2)] },
      { id: 'crush', name: '挤压', intent: 'attack', effects: [hit(26)] },
      { id: 'warp', name: '扭曲', intent: 'block', effects: [shield(24), selfBuff('strength', 3)] },
    ]),
    e('comet-shard', '彗星碎片', 10, 'normal', [90, 98], 'swarm', [
      { id: 'impact', name: '撞击', intent: 'attack', effects: [hit(24)] },
      { id: 'trail', name: '尾迹', intent: 'status', effects: [hex('burn', 6)] },
      { id: 'split', name: '崩解', intent: 'attack', effects: [hit(12, 3)] },
    ]),
    e('nova-crawler', '新星爬虫', 10, 'normal', [83, 91], 'crawler', [
      { id: 'flare', name: '耀斑', intent: 'attack', effects: [hit(20, 2)] },
      { id: 'fuse', name: '聚变', intent: 'buff', effects: [selfBuff('strength', 5)] },
      { id: 'cool', name: '冷却', intent: 'block', effects: [shield(28), mend(16)] },
    ]),
    e('black-hole-spawn', '黑洞子体', 10, 'elite', [168, 178], 'spawn', [
      { id: 'devour', name: '吞噬', intent: 'attack', effects: [hit(48), mend(26)] },
      { id: 'singular', name: '奇点', intent: 'buff', effects: [selfBuff('strength', 6), shield(30)] },
      { id: 'spaghettify', name: '拉伸', intent: 'attack', effects: [hit(20, 3)] },
    ]),
    e('neutron-knight', '中子骑士', 10, 'elite', [183, 193], 'knight', [
      { id: 'lance', name: '中子枪', intent: 'attack', effects: [hit(52)] },
      { id: 'density', name: '致密', intent: 'block', effects: [shield(40), selfBuff('strength', 4)] },
      { id: 'pulse', name: '脉冲', intent: 'attack', effects: [hit(18, 3), hex('frail', 3)] },
    ]),
    e('dying-sun', '垂死恒星', 10, 'boss', [376, 376], 'heart', [
      { id: 'flare', name: '耀斑爆发', intent: 'attack', effects: [hit(30, 2)] },
      { id: 'gravity', name: '引力井', intent: 'debuff', effects: [hex('frail', 5), hex('weak', 4)] },
      { id: 'fuse', name: '聚变', intent: 'buff', effects: [selfBuff('enrage', 7), shield(34)] },
      { id: 'collapse', name: '坍缩', intent: 'attack', effects: [hit(22, 3)] },
    ], { phases: { at: 0.45, name: '超新星', block: 30, strength: 8 } }),

    // ============ 第十一章 · 虚无帷幕 ============
    e('null-shade', '虚无影', 11, 'normal', [92, 102], 'ghost', [
      { id: 'erase', name: '抹去', intent: 'attack', effects: [hit(32)] },
      { id: 'absence', name: '缺失', intent: 'debuff', effects: [hex('weak', 4)] },
      { id: 'fade', name: '消隐', intent: 'block', effects: [shield(32)] },
    ]),
    e('erasure', '抹除体', 11, 'normal', [104, 114], 'herald', [
      { id: 'unwrite', name: '删除', intent: 'attack', effects: [hit(25, 2)] },
      { id: 'void', name: '归零', intent: 'status', effects: [hex('vulnerable', 5)] },
      { id: 'still', name: '静默', intent: 'block', effects: [shield(34), selfBuff('strength', 4)] },
    ]),
    e('absence', '缺失', 11, 'normal', [92, 102], 'mite', [
      { id: 'gnaw', name: '蛀蚀', intent: 'attack', effects: [hit(13, 3)] },
      { id: 'hollow', name: '掏空', intent: 'attack', effects: [hit(28), mend(18)] },
      { id: 'thin', name: '稀薄', intent: 'debuff', effects: [hex('frail', 4)] },
    ]),
    e('un-being', '非存在', 11, 'normal', [93, 103], 'zombie', [
      { id: 'negate', name: '否定', intent: 'attack', effects: [hit(36)] },
      { id: 'recall', name: '召回', intent: 'block', effects: [shield(36), mend(22)] },
      { id: 'unmake', name: '解离', intent: 'attack', effects: [hit(17, 3)] },
    ]),
    e('the-unnamed', '无名者', 11, 'elite', [184, 194], 'lord', [
      { id: 'silence', name: '缄默', intent: 'debuff', effects: [hex('weak', 5), hex('frail', 5)] },
      { id: 'strike', name: '无面一击', intent: 'attack', effects: [hit(58)] },
      { id: 'veil', name: '帷幕', intent: 'block', effects: [shield(46), mend(30)] },
    ]),
    e('void-maw', '虚空之口', 11, 'elite', [201, 211], 'amalgam', [
      { id: 'swallow', name: '吞没', intent: 'attack', effects: [hit(44), mend(34)] },
      { id: 'chew', name: '咀嚼', intent: 'attack', effects: [hit(21, 3)] },
      { id: 'drool', name: '涎液', intent: 'status', effects: [hex('poison', 14)] },
    ]),
    e('oblivion', '湮灭', 11, 'boss', [408, 408], 'heart', [
      { id: 'unwrite', name: '抹消', intent: 'attack', effects: [hit(34, 2)] },
      { id: 'zero', name: '归零', intent: 'debuff', effects: [hex('weak', 5), hex('vulnerable', 5)] },
      { id: 'silence', name: '绝对静默', intent: 'attack', effects: [hit(26, 3)] },
      { id: 'endure', name: '不灭', intent: 'buff', effects: [selfBuff('enrage', 8), shield(40)] },
    ], { phases: { at: 0.4, name: '归于虚无', block: 34, strength: 9 } }),

    // ============ 第十二章 · 回响之源 ============
    e('origin-sentinel', '源点哨兵', 12, 'normal', [104, 114], 'mech', [
      { id: 'guard', name: '原始防御', intent: 'block', effects: [shield(40), selfBuff('strength', 4)] },
      { id: 'strike', name: '源点打击', intent: 'attack', effects: [hit(38)] },
      { id: 'sweep', name: '环扫', intent: 'attack', effects: [hit(19, 3)] },
    ]),
    e('chorus-echo', '合唱回响', 12, 'normal', [116, 126], 'swarm', [
      { id: 'chorus', name: '合唱', intent: 'attack', effects: [hit(16, 4)] },
      { id: 'harmony', name: '谐律', intent: 'buff', effects: [selfBuff('strength', 6)] },
      { id: 'discord', name: '走调', intent: 'debuff', effects: [hex('frail', 5)] },
    ]),
    e('prime-drone', '原初无人机', 12, 'normal', [99, 109], 'drone', [
      { id: 'beam', name: '原初光束', intent: 'attack', effects: [hit(42)] },
      { id: 'shield', name: '护罩', intent: 'block', effects: [shield(38)] },
      { id: 'swarm', name: '集群打击', intent: 'attack', effects: [hit(14, 3)] },
    ]),
    e('last-knight', '最后骑士', 12, 'normal', [116, 126], 'knight', [
      { id: 'oath', name: '誓约', intent: 'buff', effects: [selfBuff('enrage', 5), shield(30)] },
      { id: 'cleave', name: '终末斩', intent: 'attack', effects: [hit(46)] },
      { id: 'riposte', name: '反击', intent: 'attackBlock', effects: [hit(24), shield(24)] },
    ]),
    e('echo-prime', '原初回响', 12, 'elite', [200, 212], 'herald', [
      { id: 'replay', name: '重奏', intent: 'attack', effects: [hit(30, 3)] },
      { id: 'record', name: '刻录', intent: 'buff', effects: [selfBuff('thorns', 14), shield(36)] },
      { id: 'overwrite', name: '覆写', intent: 'debuff', effects: [hex('weak', 5), hex('vulnerable', 5)] },
    ]),
    e('final-warden', '终末守望者', 12, 'elite', [219, 231], 'warden', [
      { id: 'judge', name: '终审', intent: 'attack', effects: [hit(64)] },
      { id: 'bulwark', name: '终壁', intent: 'block', effects: [shield(52), mend(34)] },
      { id: 'verdict', name: '判决', intent: 'attack', effects: [hit(26, 3), hex('frail', 4)] },
    ]),
    e('echo-origin', '回响之源', 12, 'boss', [448, 448], 'heart', [
      { id: 'begin', name: '初始之音', intent: 'attack', effects: [hit(38, 2)] },
      { id: 'chorus', name: '万声齐鸣', intent: 'attack', effects: [hit(28, 3)] },
      { id: 'silence', name: '终末静默', intent: 'debuff', effects: [hex('weak', 6), hex('vulnerable', 6)] },
      { id: 'sustain', name: '自我延续', intent: 'buff', effects: [selfBuff('enrage', 10), shield(48)] },
      { id: 'omega', name: '欧米伽', intent: 'attack', effects: [hit(46, 3)] },
    ], { phases: { at: 0.55, name: '第一形态 · 回响', block: 30, strength: 8 }, phases2: null }),
  ];

  const ENEMY_MAP = {};
  for (const item of ENEMIES) ENEMY_MAP[item.id] = item;

  // 每章的普通、精英与首领名单。
  const BY_CHAPTER = {};
  for (const item of ENEMIES) {
    const bucket = (BY_CHAPTER[item.chapter] = BY_CHAPTER[item.chapter] || { normal: [], elite: [], boss: [] });
    bucket[item.kind].push(item.id);
  }

  // 遭遇池：单只、双只与同种组合，保证每层都有变化。
  // 前三章不出现三敌人组合，避免新手在第一章被围攻致死。
  function poolsFor(chapter) {
    const normals = (BY_CHAPTER[chapter] || { normal: [] }).normal;
    const pools = normals.map(id => [id]);
    for (let index = 0; index < normals.length; index++) {
      pools.push([normals[index], normals[(index + 1) % normals.length]]);
      if (chapter > 3) pools.push([normals[index], normals[index], normals[(index + 2) % normals.length]]);
    }
    if (chapter <= 3) pools.push([normals[0], normals[1]], [normals[2] || normals[0], normals[0]]);
    return pools;
  }
  const ENCOUNTERS = [];
  for (let chapter = 1; chapter <= 12; chapter++) {
    const bucket = BY_CHAPTER[chapter] || { normal: [], elite: [], boss: [] };
    ENCOUNTERS.push({ chapter, kind: 'normal', pool: poolsFor(chapter) });
    ENCOUNTERS.push({ chapter, kind: 'weak', pool: poolsFor(chapter).filter(pool => pool.length <= 2), hpScale: 0.84 });
    ENCOUNTERS.push({ chapter, kind: 'elite', pool: bucket.elite.map(id => [id]) });
    ENCOUNTERS.push({ chapter, kind: 'boss', pool: bucket.boss.map(id => [id]) });
  }

  return { ENEMIES, ENEMY_MAP, BY_CHAPTER, ENCOUNTERS, poolsFor };
});
