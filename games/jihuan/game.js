(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EmberGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;
  const SAVE_KEY = 'ember-wilderness-save-v1';
  const ITEMS = {
    wood: { name: '木材', icon: 'wood', category: 'material', description: '篝火的燃料，也是搭建营地的基础。每根可燃烧 2 小时。' },
    twig: { name: '树枝', icon: 'twig', category: 'material', description: '干燥而结实，适合制作工具。' },
    grass: { name: '干草', icon: 'grass', category: 'material', description: '可以搓成绳索，也可以引燃火把。' },
    stone: { name: '石块', icon: 'stone', category: 'material', description: '用来围起篝火，挡住荒野的风雨。' },
    flint: { name: '燧石', icon: 'flint', category: 'material', description: '锋利的石片，制作石斧和石镐的材料。' },
    rope: { name: '草绳', icon: 'rope', category: 'material', description: '把零散的东西，和活下去的希望系在一起。' },
    gold: { name: '金矿', icon: 'gold', category: 'material', description: '传导旧日信号的关键材料。可在乱石坡开采。' },
    relic: { name: '古老碎片', icon: 'relic', category: 'material', description: '从旧日遗迹中找到的发光碎片。信标需要 3 枚。' },
    berry: { name: '浆果', icon: 'berry', category: 'food', food: { hunger: 12 }, description: '一小捧酸甜的野果。烤熟后更能填饱肚子。' },
    carrot: { name: '胡萝卜', icon: 'carrot', category: 'food', food: { hunger: 16, health: 1 }, description: '带着泥土的清香，可以直接吃。' },
    mushroom: { name: '蘑菇', icon: 'mushroom', category: 'food', food: { hunger: 10, health: -5, sanity: -6 }, description: '生吃会损失 5 生命和 6 理智。最好先烤熟。' },
    meat: { name: '生肉', icon: 'meat', category: 'food', food: { hunger: 14, health: -3, sanity: -4 }, description: '生吃会损失 3 生命和 4 理智。火能让它变得美味。' },
    fish: { name: '鲜鱼', icon: 'fish', category: 'food', food: { hunger: 14, health: -2, sanity: -3 }, description: '生吃会损失 2 生命和 3 理智。适合架在火上。' },
    cookedBerry: { name: '烤浆果', icon: 'berry', category: 'food', food: { hunger: 18, health: 1 }, description: '温热的果汁带来一点安慰。' },
    cookedCarrot: { name: '烤胡萝卜', icon: 'carrot', category: 'food', food: { hunger: 22, health: 3 }, description: '外皮微焦，里面又软又甜。' },
    cookedMushroom: { name: '烤蘑菇', icon: 'mushroom', category: 'food', food: { hunger: 18, sanity: 4 }, description: '烤熟之后，终于可以放心吃了。' },
    cookedMeat: { name: '烤肉', icon: 'meat', category: 'food', food: { hunger: 28, health: 8, sanity: 3 }, description: '一顿像样的饭，让人重新有了力气。' },
    cookedFish: { name: '烤鱼', icon: 'fish', category: 'food', food: { hunger: 28, health: 8 }, description: '鱼皮酥脆，足以抵抗很长一段时间的饥饿。' },
    stew: { name: '荒野炖锅', icon: 'bowl', category: 'food', food: { hunger: 55, health: 18, sanity: 10 }, description: '肉、蔬菜和蘑菇煮成的一锅热汤。活着真好。' },
    flower: { name: '野花', icon: 'flower', category: 'survival', use: 'flower', description: '闻一闻，消耗 1 朵，恢复 6 理智。' },
    medicine: { name: '草药膏', icon: 'medicine', category: 'survival', use: 'medicine', description: '涂抹后恢复 25 生命。' },
    axe: { name: '石斧', icon: 'axe', category: 'tool', durability: 24, description: '用于砍伐松树，每次可获得 3 木材。耐久 24 次。' },
    pickaxe: { name: '石镐', icon: 'pickaxe', category: 'tool', durability: 20, description: '用于开采石块和金矿。耐久 20 次。' },
    spear: { name: '长矛', icon: 'spear', category: 'tool', durability: 18, description: '用于狩猎、捕鱼，也能在遇到野兽时保护你。耐久 18 次。' },
    torch: { name: '火把', icon: 'flame', category: 'survival', use: 'torch', description: '点击点燃，提供 3 小时随身照明。可提前换新，旧火把的剩余时间不叠加。' },
    trap: { name: '捕兽陷阱', icon: 'trap', category: 'survival', description: '在风语草地捕捉野兔，一次获得 3 生肉，使用后消耗。' },
    coat: { name: '草编斗篷', icon: 'coat', category: 'tool', description: '制作后自动穿戴，体感温度提高 8°C。' },
  };

  const RECIPES = [
    { id: 'axe', name: '石斧', icon: 'axe', category: 'tools', cost: { twig: 2, flint: 2 }, minutes: 30, description: '把森林，变成可以燃烧的希望。', output: 'axe', unique: true },
    { id: 'pickaxe', name: '石镐', icon: 'pickaxe', category: 'tools', cost: { twig: 2, flint: 3 }, minutes: 45, description: '敲开石头，找到藏在里面的东西。', output: 'pickaxe', unique: true },
    { id: 'spear', name: '长矛', icon: 'spear', category: 'tools', cost: { twig: 3, flint: 1, rope: 1 }, minutes: 45, description: '荒野不会手下留情。你也不必。', output: 'spear', unique: true },
    { id: 'rope', name: '草绳', icon: 'rope', category: 'survival', cost: { grass: 3 }, minutes: 15, description: '三束干草，搓成一根结实的绳子。', output: 'rope' },
    { id: 'torch', name: '火把', icon: 'flame', category: 'survival', cost: { grass: 3, twig: 2 }, minutes: 15, description: '一束随身的火光，照亮 3 小时。', output: 'torch' },
    { id: 'trap', name: '捕兽陷阱', icon: 'trap', category: 'survival', cost: { grass: 4, twig: 2 }, minutes: 30, description: '带去草地，换回一顿丰盛的晚餐。', output: 'trap' },
    { id: 'medicine', name: '草药膏', icon: 'medicine', category: 'survival', cost: { flower: 2, mushroom: 1, grass: 2 }, minutes: 20, description: '恢复 25 生命。伤口总会慢慢愈合。', output: 'medicine' },
    { id: 'coat', name: '草编斗篷', icon: 'coat', category: 'survival', cost: { grass: 8, rope: 3 }, minutes: 60, description: '自动穿戴，体感温度提高 8°C。', output: 'coat', unique: true },
    { id: 'cookedBerry', name: '烤浆果', icon: 'berry', category: 'food', cost: { berry: 1 }, minutes: 15, description: '饱食 +18 · 生命 +1', output: 'cookedBerry', fire: true },
    { id: 'cookedCarrot', name: '烤胡萝卜', icon: 'carrot', category: 'food', cost: { carrot: 1 }, minutes: 15, description: '饱食 +22 · 生命 +3', output: 'cookedCarrot', fire: true },
    { id: 'cookedMeat', name: '烤肉', icon: 'meat', category: 'food', cost: { meat: 1 }, minutes: 20, description: '饱食 +28 · 生命 +8 · 理智 +3', output: 'cookedMeat', fire: true },
    { id: 'cookedMushroom', name: '烤蘑菇', icon: 'mushroom', category: 'food', cost: { mushroom: 1 }, minutes: 15, description: '饱食 +18 · 理智 +4', output: 'cookedMushroom', fire: true },
    { id: 'cookedFish', name: '烤鱼', icon: 'fish', category: 'food', cost: { fish: 1 }, minutes: 20, description: '饱食 +28 · 生命 +8', output: 'cookedFish', fire: true },
    { id: 'stew', name: '荒野炖锅', icon: 'bowl', category: 'food', cost: { meat: 1, carrot: 1, mushroom: 1 }, minutes: 45, description: '饱食 +55 · 生命 +18 · 理智 +10', output: 'stew', fire: true },
    { id: 'firepit', name: '石头篝火', icon: 'campfire', category: 'camp', cost: { stone: 6, wood: 2 }, minutes: 45, description: '不再怕雨。木材燃烧时间延长至 2.5 小时，附带 4 小时燃料。', structure: 'firepit' },
    { id: 'tent', name: '避风帐篷', icon: 'tent', category: 'camp', cost: { wood: 6, rope: 2, grass: 8 }, minutes: 90, description: '休息时额外恢复 12 生命、10 理智，并可一觉睡到天亮。', structure: 'tent' },
    { id: 'beacon', name: '归途信标', icon: 'beacon', category: 'camp', cost: { relic: 3, wood: 8, stone: 6, rope: 2, gold: 1 }, minutes: 90, description: '熬过七夜后，回到营地，让微光为你指引归途。', structure: 'beacon' },
  ];

  const LOCATIONS = {
    camp: { name: '林间营地', short: '营地', subtitle: '森林深处，尚有一处可以安心停留的地方。', description: '风穿过松林，余烬在灰白的木柴间轻轻呼吸。至少此刻，火光还站在你这一边。', icon: 'tent', risk: '安稳', x: 42, y: 57, travel: 0, actions: ['branches', 'berries', 'grass', 'rest'] },
    forest: { name: '低语松林', short: '松林', subtitle: '林间有木材、蘑菇，还有未曾露面的访客。', description: '高大的松树把天空切成细碎的形状。你听见枯枝断裂的声音，却没有感觉到风。', icon: 'tree', risk: '留心', x: 26, y: 25, travel: 60, actions: ['chop', 'mushrooms', 'hunt', 'forestBranches'] },
    meadow: { name: '风语草地', short: '草地', subtitle: '低伏的草浪里，藏着野兔与甜美的根茎。', description: '草尖被风压低，又倔强地直起身来。几只野兔消失在远处，空气里有泥土和野花的味道。', icon: 'grass', risk: '安稳', x: 72, y: 28, travel: 60, actions: ['fieldGrass', 'carrots', 'trapping', 'flowers'] },
    quarry: { name: '寂静石坡', short: '石坡', subtitle: '破碎的岩层之下，是石块、燧石与金矿。', description: '脚下的石子滑向山坡。这里几乎没有生命的声音，只有山风，在岩石的缝隙里吹着口哨。', icon: 'mountain', risk: '留心', x: 16, y: 70, travel: 90, actions: ['looseStones', 'mining', 'goldMining', 'survey'] },
    marsh: { name: '迷雾湿地', short: '湿地', subtitle: '潮湿的雾气里，有鱼，也有难以辨认的影子。', description: '水面倒映着一张陌生的脸。等涟漪散去，你才认出那是自己。脚下的淤泥似乎比刚才更深了一点。', icon: 'water', risk: '危险', x: 70, y: 76, travel: 120, actions: ['reeds', 'marshMushrooms', 'fishing', 'sunkenRelic'] },
    ruins: { name: '旧日遗迹', short: '遗迹', subtitle: '失落的石门后，微弱的信号仍在等待回答。', description: '苔藓爬满了破碎的石门。某种古老的东西在废墟深处闪烁，像一颗不愿熄灭的星。', icon: 'ruins', risk: '危险', x: 85, y: 53, travel: 120, actions: ['relicSearch', 'inscriptions', 'ruinScraps', 'listen'] },
  };

  const ACTIONS = {
    branches: { name: '拾取枯枝', icon: 'twig', description: '林地上散落着昨夜的风留下的礼物。', minutes: 45, limit: 5, reward: '木材 ×1 · 树枝 ×2', loot: { wood: 1, twig: 2 }, narrative: '你拨开松针，捡起几根干燥的枯枝。它们会在夜里发出好听的噼啪声。' },
    berries: { name: '采摘浆果', icon: 'berry', description: '红色的果实，在灌木间闪着微光。', minutes: 60, limit: 3, reward: '浆果 ×2', loot: { berry: 2 }, narrative: '你小心避开尖刺，把饱满的浆果装进口袋。' },
    grass: { name: '收集干草', icon: 'grass', description: '柔韧的干草，可以编织许多东西。', minutes: 45, limit: 4, reward: '干草 ×3', loot: { grass: 3 }, narrative: '你割下一小束干草，抖去泥土，仔细捆好。' },
    rest: { name: '歇息片刻', icon: 'rest', description: '坐下来，让紧绷的神经慢慢松开。', minutes: 120, reward: '生命 +8 · 理智 +10', rest: true },
    chop: { name: '砍伐松树', icon: 'axe', description: '选一棵枯树，给夜晚多添一点底气。', minutes: 60, limit: 6, tool: 'axe', reward: '木材 ×3 · 树枝 ×1', loot: { wood: 3, twig: 1 }, narrative: '石斧一下下落在树干上。松树轰然倒下，惊起远处几只黑鸟。' },
    mushrooms: { name: '翻找林间', icon: 'mushroom', description: '腐木的阴影里，蘑菇悄悄长大。', minutes: 60, limit: 3, reward: '蘑菇 ×2', loot: { mushroom: 2 }, narrative: '一簇蘑菇躲在倒下的树干后。你决定先把它们带回火边。' },
    hunt: { name: '追踪足迹', icon: 'spear', description: '泥地上的蹄印，还没有被雨冲走。', minutes: 90, limit: 3, tool: 'spear', reward: '生肉 ×2 · 生命 −3', loot: { meat: 2 }, health: -3, narrative: '漫长的追逐结束了。你擦去手背上的血，收好今天的猎获。' },
    forestBranches: { name: '捡拾落枝', icon: 'wood', description: '即使没有斧子，森林也会有所馈赠。', minutes: 45, limit: 4, reward: '木材 ×1 · 树枝 ×2', loot: { wood: 1, twig: 2 }, narrative: '你沿着林间小径收集落枝，尽量不去惊动树后的影子。' },
    fieldGrass: { name: '割取长草', icon: 'grass', description: '金黄的长草一直延伸到天边。', minutes: 60, limit: 4, reward: '干草 ×5', loot: { grass: 5 }, narrative: '草叶摩擦着你的手掌。很快，脚边就堆起了一捆干草。' },
    carrots: { name: '挖掘根茎', icon: 'carrot', description: '松软的泥土下，藏着一顿好饭。', minutes: 60, limit: 4, reward: '胡萝卜 ×3', loot: { carrot: 3 }, narrative: '你顺着绿色的叶片挖下去，拔出几根沉甸甸的胡萝卜。' },
    trapping: { name: '布置陷阱', icon: 'trap', description: '在兔子常走的路上，耐心等候。', minutes: 120, limit: 3, consume: 'trap', reward: '生肉 ×3 · 消耗陷阱', loot: { meat: 3 }, narrative: '等待终于有了回报。陷阱已经损坏，但今晚可以吃得丰盛一些。' },
    flowers: { name: '采集野花', icon: 'flower', description: '有些美好，荒野还没有夺走。', minutes: 45, limit: 3, reward: '野花 ×2 · 理智 +4', loot: { flower: 2 }, sanity: 4, narrative: '你摘下两朵野花。淡淡的香气，让你想起一个已经模糊的春天。' },
    looseStones: { name: '拾取碎石', icon: 'stone', description: '在碎石间寻找适合打磨的石片。', minutes: 60, limit: 4, reward: '石块 ×2 · 燧石 ×1', loot: { stone: 2, flint: 1 }, narrative: '你翻过冰凉的石块，挑出几片边缘锋利的燧石。' },
    mining: { name: '开采岩石', icon: 'pickaxe', description: '用石镐敲开厚重的岩层。', minutes: 90, limit: 6, tool: 'pickaxe', reward: '石块 ×4 · 燧石 ×2', loot: { stone: 4, flint: 2 }, narrative: '石镐敲击岩壁的声音，在空旷的山坡上回荡。' },
    goldMining: { name: '寻找金矿', icon: 'gold', description: '岩层里，那一抹金色不像是错觉。', minutes: 90, limit: 3, tool: 'pickaxe', reward: '金矿 ×1 · 石块 ×2', loot: { gold: 1, stone: 2 }, narrative: '你敲下一块金色的矿石。它在掌心沉甸甸的，仿佛藏着某种承诺。' },
    survey: { name: '勘察石坡', icon: 'compass', description: '沿着旧路牌，看看山风吹来的方向。', minutes: 60, limit: 2, reward: '燧石 ×2 · 可能触发奇遇', loot: { flint: 2 }, eventChance: 0.5, narrative: '碎石下露出一段被遗忘的小路。你收起沿途找到的石片。' },
    reeds: { name: '收割芦苇', icon: 'grass', description: '避开泥潭，采集岸边的柔韧芦苇。', minutes: 60, limit: 4, reward: '干草 ×4 · 蘑菇 ×1 · 生命 −2', loot: { grass: 4, mushroom: 1 }, health: -2, narrative: '锋利的芦苇划破了皮肤。你把采下的芦苇扎好，迅速离开泥潭。' },
    marshMushrooms: { name: '采集湿地菇', icon: 'mushroom', description: '潮湿的空气，让它们长得格外茂盛。', minutes: 60, limit: 3, reward: '蘑菇 ×3 · 理智 −2', loot: { mushroom: 3 }, sanity: -2, narrative: '你把湿漉漉的蘑菇放进口袋。身后的水面泛起一圈没有来由的涟漪。' },
    fishing: { name: '浅滩捕鱼', icon: 'fish', description: '握稳长矛，等水里的影子靠近。', minutes: 90, limit: 3, tool: 'spear', reward: '鲜鱼 ×2', loot: { fish: 2 }, narrative: '水花溅湿了衣袖。你提起长矛，收获了两条银色的小鱼。' },
    sunkenRelic: { name: '打捞沉物', icon: 'relic', description: '水底似乎有一道不属于这里的光。', minutes: 90, limit: 2, reward: '古老碎片 ×1 · 生命 −6 · 理智 −8', loot: { relic: 1 }, health: -6, sanity: -8, narrative: '你把手伸进冰冷的泥水，摸到一枚温热的碎片。耳边忽然响起了低语。' },
    relicSearch: { name: '搜寻遗迹', icon: 'relic', description: '走进石门深处，寻找归途的线索。', minutes: 120, limit: 2, reward: '古老碎片 ×1 · 石块 ×2 · 生命 −5 · 理智 −6', loot: { relic: 1, stone: 2 }, health: -5, sanity: -6, narrative: '你从坍塌的石台上取下一枚发光碎片。废墟深处，仿佛有人轻轻叹了一口气。' },
    inscriptions: { name: '辨认碑文', icon: 'book', description: '石碑上残存着某个旅人的告诫。', minutes: 60, limit: 2, reward: '金矿 ×1 · 理智 −3', loot: { gold: 1 }, sanity: -3, narrative: '「七次长夜之后，让碎片重新发光。」你默念碑文，捡起石碑旁的金矿。' },
    ruinScraps: { name: '翻找残骸', icon: 'flint', description: '从废墟中找出仍然能用的东西。', minutes: 60, limit: 3, reward: '燧石 ×2 · 树枝 ×2', loot: { flint: 2, twig: 2 }, narrative: '旧世界留下的东西不多。你挑出还算完整的材料，装进行囊。' },
    listen: { name: '聆听回声', icon: 'moon', description: '闭上眼，试着分辨风声里的讯息。', minutes: 30, limit: 1, reward: '理智 +8', sanity: 8, narrative: '你终于听清了：那不是呼唤，只是风。这让你莫名安心了一些。' },
  };

  const EVENTS = {
    traveler: { title: '树下的陌生人', eyebrow: '林间奇遇', icon: 'compass', text: '一个披着旧斗篷的人坐在树下。他没有抬头，只把一小包草药推到你面前。\n「两把浆果，」他说，「换一个明天。」', choices: [
      { id: 'trade', label: '用浆果交换', hint: '浆果 −2 · 草药膏 +1', cost: { berry: 2 }, loot: { medicine: 1 }, result: '你把浆果放在树根旁。再抬起头时，那里只剩下一件破旧的斗篷。' },
      { id: 'leave', label: '点头致意，继续赶路', hint: '理智 +2', sanity: 2, result: '你向陌生人点点头。能在荒野里见到另一个人，总归是件好事。' },
    ] },
    cache: { title: '被遗忘的行囊', eyebrow: '意外发现', icon: 'bag', text: '一只破旧的行囊挂在低矮的树枝上。布料已经被雨水浸透，搭扣却仍然系得很紧。\n不远处，似乎有东西在盯着你。', choices: [
      { id: 'open', label: '解开搭扣', hint: '草绳 +1 · 燧石 +2 · 理智 −3', loot: { rope: 1, flint: 2 }, sanity: -3, result: '行囊里只有几件朴素的工具。它的主人，大概已经不需要它们了。' },
      { id: 'leave', label: '让它留在原处', hint: '理智 +3', sanity: 3, result: '你没有碰那个行囊。远处的注视感，也慢慢消失了。' },
    ] },
    rabbit: { title: '草丛里的小生命', eyebrow: '荒野相逢', icon: 'rabbit', text: '一只野兔被荆棘缠住了后腿。它没有挣扎，只是用黑亮的眼睛看着你。\n你的肚子，在这个时候不合时宜地响了。', choices: [
      { id: 'save', label: '解开荆棘，喂它浆果', hint: '浆果 −1 · 理智 +12', cost: { berry: 1 }, sanity: 12, result: '野兔在草丛边停了一下，回头看了看你，然后消失了。有些选择，不必问值不值得。' },
      { id: 'hunt', label: '收下荒野的馈赠', hint: '生肉 +2 · 理智 −6', loot: { meat: 2 }, sanity: -6, result: '你把猎获收好。在这里，活下去有时是一件很沉重的事。' },
      { id: 'leave', label: '轻轻绕过', hint: '不改变状态', result: '你放轻脚步，离开了这片草丛。' },
    ] },
    hound: { title: '黑暗中的眼睛', eyebrow: '危险迫近', icon: 'eye', text: '低沉的咆哮让你停下脚步。一头瘦削的猎犬从阴影里走出来，目光始终没有离开你的喉咙。\n现在，必须做出选择。', choices: [
      { id: 'fight', label: '握紧长矛，迎上去', hint: '需要长矛 · 生命 −6 · 生肉 +2', tool: 'spear', health: -6, loot: { meat: 2 }, result: '你握紧长矛，等它扑过来的那一刻。战斗很快结束了，只有手臂上的伤口还在发烫。' },
      { id: 'distract', label: '丢下生肉引开它', hint: '生肉 −1', cost: { meat: 1 }, result: '猎犬扑向地上的肉。你趁机跑开，一次也没有回头。' },
      { id: 'run', label: '转身逃离', hint: '生命 −8 · 饱食 −6', health: -8, hunger: -6, result: '荆棘撕开了衣袖，你终于甩掉了身后的喘息。至少，你还活着。' },
    ] },
  };

  const WEATHER = { clear: { name: '晴', icon: 'sun', temperature: 18 }, cloudy: { name: '多云', icon: 'cloud', temperature: 15 }, rain: { name: '小雨', icon: 'rain', temperature: 12 } };
  const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
  const day = s => Math.floor(s.time / 1440) + 1;
  const minuteOfDay = s => s.time % 1440;
  const nights = s => Math.max(0, Math.floor((s.time - 360) / 1440));
  const phase = s => minuteOfDay(s) >= 360 && minuteOfDay(s) < 1020 ? 'day' : minuteOfDay(s) >= 1020 && minuteOfDay(s) < 1200 ? 'dusk' : 'night';
  const clock = s => `${String(Math.floor(minuteOfDay(s) / 60)).padStart(2, '0')}:${String(Math.floor(minuteOfDay(s) % 60)).padStart(2, '0')}`;
  const count = (s, item) => s.inventory[item] || 0;
  const hasCampfire = s => s.location === 'camp' && s.fireFuel > 0;
  const hasLight = s => phase(s) !== 'night' || hasCampfire(s) || s.torchFuel > 0;
  const fireRate = s => s.weather === 'rain' && !s.structures.firepit ? 1.5 : 1;
  const temperature = s => WEATHER[s.weather].temperature - (phase(s) === 'night' ? 12 : phase(s) === 'dusk' ? 5 : 0) + (hasCampfire(s) ? 10 : 0) + (count(s, 'coat') ? 8 : 0) + (s.torchFuel > 0 ? 3 : 0);

  function random(s) {
    let x = s.seed >>> 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    s.seed = x >>> 0;
    return s.seed / 4294967296;
  }

  function addLog(s, text, kind = 'story', title = '') {
    s.logs.push({ id: ++s.logId, time: s.time, text, kind, title });
    if (s.logs.length > 100) s.logs.shift();
  }

  function createState(seed = Date.now() % 4294967295) {
    const s = {
      version: VERSION, seed: (seed >>> 0) || 1, time: 480, location: 'camp',
      health: 100, hunger: 78, sanity: 90, weather: 'clear',
      fireFuel: 180, torchFuel: 0,
      inventory: { wood: 3, twig: 4, grass: 4, flint: 2, stone: 2, berry: 3, carrot: 1 },
      durability: {}, structures: { firepit: false, tent: false, beacon: false },
      visited: { camp: true }, depleted: {}, flags: {},
      stats: { actions: 0, gathered: 0, crafted: 0, cooked: 0, encounters: 0 },
      event: null, status: 'playing', endless: false, endReason: '', logId: 0, logs: [],
    };
    addLog(s, '你在一堆尚有余温的灰烬旁醒来。没有来路，只有口袋里的一点补给，和一片沉默的森林。', 'story', '故事，从余烬开始');
    addLog(s, '篝火还能燃烧 3 小时。先制作一把石斧，再为第一个夜晚准备食物与木材。', 'tip', '给初来者的一句话');
    return s;
  }

  function addItems(s, loot) {
    for (const [id, amount] of Object.entries(loot || {})) s.inventory[id] = count(s, id) + amount;
  }
  function pay(s, cost) {
    for (const [id, amount] of Object.entries(cost || {})) s.inventory[id] -= amount;
  }
  function missing(s, cost) {
    return Object.entries(cost || {}).filter(([id, n]) => count(s, id) < n).map(([id, n]) => `${ITEMS[id].name} ${count(s, id)}/${n}`);
  }
  function applyEffects(s, effects) {
    for (const key of ['health', 'hunger', 'sanity']) if (effects[key]) s[key] = clamp(s[key] + effects[key]);
  }
  function wearTool(s, id) {
    if (!ITEMS[id]?.durability) return;
    s.durability[id] = Math.max(0, (s.durability[id] || 0) - 1);
    if (!s.durability[id]) {
      s.inventory[id] = 0;
      addLog(s, `${ITEMS[id].name}终于承受不住，碎裂在你手中。需要再制作一把了。`, 'warning', '工具损坏');
    }
  }
  function die(s, reason) {
    s.health = 0; s.status = 'dead'; s.event = null; s.endReason = reason;
    addLog(s, reason, 'danger', '最后一页');
  }
  function checkVictory(s) {
    if (s.status === 'playing' && !s.endless && nights(s) >= 7 && s.structures.beacon && s.location === 'camp') {
      s.status = 'won'; s.event = null;
      addLog(s, '信标的光穿过了薄雾。远处，终于有另一束光回应。七个漫长的夜晚之后，你找到了回家的方向。', 'success', '天亮以后');
    }
  }

  function advance(s, minutes) {
    let remaining = minutes;
    while (remaining > 0 && s.status === 'playing') {
      const step = Math.min(5, remaining);
      const oldPhase = phase(s);
      const oldNights = nights(s);
      const lit = hasLight(s);
      const warm = temperature(s);
      const starvingMinutes = Math.max(0, step - s.hunger / (3 / 60));
      s.hunger = clamp(s.hunger - step * 3 / 60);
      if (starvingMinutes > 0) s.health -= starvingMinutes * 12 / 60;
      if (!lit) { s.health -= step * 14 / 60; s.sanity -= step * 10 / 60; }
      else if (hasCampfire(s)) s.sanity += step * 1.5 / 60;
      else if (oldPhase === 'dusk') s.sanity -= step * 0.5 / 60;
      if (warm < 5) s.health -= step * 4 / 60;
      if (s.sanity < 20) s.health -= step * 2 / 60;
      s.fireFuel = Math.max(0, s.fireFuel - step * fireRate(s));
      s.torchFuel = Math.max(0, s.torchFuel - step);
      s.time += step; remaining -= step;
      s.sanity = clamp(s.sanity);
      if (s.health <= 0) {
        die(s, !lit ? '你失去了最后的光。黑暗悄然合拢，森林收起了你的脚步声。' : s.hunger <= 0 ? '饥饿耗尽了最后的力气。你靠在树边，做了一个关于热汤的梦。' : warm < 5 ? '寒意越过了衣襟。你蜷缩着睡去，再也没有等到太阳升起。' : '你的伤势太重了。这片荒野，留下了又一个无人讲述的故事。');
        break;
      }
      if (phase(s) !== oldPhase) {
        if (phase(s) === 'dusk') addLog(s, '最后一缕日光落在树梢。夜晚将在 20:00 到来，记得回营添柴，或点燃随身火把。', 'warning', '暮色渐深');
        if (phase(s) === 'night') addLog(s, hasLight(s) ? '森林隐入黑暗。你靠近火光，听见远处传来一声悠长的嚎叫。' : '夜色已经降临，而你身边没有光。黑暗正在伤害你，尽快点燃火把或回营生火。', hasLight(s) ? 'story' : 'danger', '长夜来临');
      }
      if (nights(s) > oldNights) {
        const roll = random(s);
        s.weather = roll < 0.52 ? 'clear' : roll < 0.8 ? 'cloudy' : 'rain';
        s.depleted = {};
        s.sanity = clamp(s.sanity + 4);
        addLog(s, `你熬过了第 ${nights(s)} 个夜晚。天光一点点漫过森林，今天${s.weather === 'rain' ? '有雨，注意保暖，露天篝火会消耗得更快' : s.weather === 'cloudy' ? '云层低垂，风里带着凉意' : '是个晴天，正适合出门寻找补给'}。`, 'success', '你又见到了太阳');
      }
      if (s.hunger < 25 && s.flags.hungerDay !== day(s)) {
        s.flags.hungerDay = day(s);
        addLog(s, '饥饿感变得越来越清晰。点击行囊里的食物可以进食，烤熟后通常更划算。', 'warning', '肚子在提醒你');
      }
      if (!s.fireFuel && !s.flags.fireOut) {
        s.flags.fireOut = true;
        addLog(s, '营地最后一簇火苗熄灭了。回到营地，添一根木材就能重新引燃余烬。', 'warning', '只剩灰烬');
      }
    }
    for (const key of ['health', 'hunger', 'sanity']) s[key] = Math.round(clamp(s[key]) * 100) / 100;
  }

  function actionReason(s, id) {
    const action = ACTIONS[id];
    if (!action || !LOCATIONS[s.location].actions.includes(id)) return '这个地方无法进行此行动';
    if (action.limit && (s.depleted[id] || 0) >= action.limit) return '这里的资源暂时采尽了，明天 06:00 恢复';
    if (action.tool && !count(s, action.tool)) return `需要先制作${ITEMS[action.tool].name}`;
    if (action.consume && !count(s, action.consume)) return `需要${ITEMS[action.consume].name}`;
    return '';
  }
  function recipeReason(s, recipeOrId) {
    const r = typeof recipeOrId === 'string' ? RECIPES.find(r => r.id === recipeOrId) : recipeOrId;
    if (!r) return '未知的配方';
    if (r.structure && s.structures[r.structure]) return '已经建造';
    if (r.unique && count(s, r.output)) return '已经拥有';
    if ((r.structure || r.fire) && s.location !== 'camp') return '需要回到林间营地';
    if (r.fire && s.fireFuel < r.minutes * fireRate(s)) return '需要让营火至少燃烧到烹饪结束';
    const lack = missing(s, r.cost);
    return lack.length ? `还缺材料：${lack.join('、')}` : '';
  }
  function choiceReason(s, choice) {
    if (choice.tool && !count(s, choice.tool)) return `需要${ITEMS[choice.tool].name}`;
    const lack = missing(s, choice.cost);
    return lack.length ? `材料不足：${lack.join('、')}` : '';
  }
  function travelTime(s, target) {
    if (target === s.location) return 0;
    if (target === 'camp') return LOCATIONS[s.location].travel;
    if (s.location === 'camp') return LOCATIONS[target]?.travel || 0;
    return Math.max(LOCATIONS[s.location].travel, LOCATIONS[target]?.travel || 0);
  }
  function sleepReason(s) {
    if (s.location !== 'camp') return '需要回到营地';
    if (!s.structures.tent) return '需要先建造避风帐篷';
    if (phase(s) !== 'night') return '夜晚 20:00 后可以入睡';
    const duration = (1800 - minuteOfDay(s)) % 1440 || 1440;
    if (s.fireFuel < duration * fireRate(s)) return `需要足够燃烧到清晨的木材（约 ${Math.ceil(duration * fireRate(s) / 60)} 小时燃料）`;
    if (s.hunger <= duration * 3 / 60 + 5) return '先吃饱一些，才能安心睡到天亮';
    return '';
  }

  function maybeEvent(s, chance = 0.16) {
    if (s.status !== 'playing' || s.event || s.location === 'camp' || random(s) >= chance) return;
    const candidates = phase(s) === 'night' ? ['hound', 'cache'] : s.location === 'meadow' ? ['rabbit', 'traveler', 'cache'] : ['cache', 'traveler', 'hound'];
    s.event = candidates[Math.floor(random(s) * candidates.length)];
    s.stats.encounters++;
  }

  function act(s, type, id) {
    if (s.status !== 'playing') return { ok: false, message: '这一段旅程已经结束' };
    if (s.event && type !== 'choose') return { ok: false, message: '先决定如何面对眼前的奇遇' };
    let message = '';
    if (type === 'gather') {
      const reason = actionReason(s, id);
      if (reason) return { ok: false, message: reason };
      const a = ACTIONS[id];
      if (a.consume) s.inventory[a.consume]--;
      advance(s, a.minutes);
      if (s.status === 'playing') {
        s.depleted[id] = (s.depleted[id] || 0) + 1;
        if (a.tool) wearTool(s, a.tool);
        if (a.rest) {
          const health = 8 + (s.structures.tent ? 12 : 0);
          const sanity = 10 + (s.structures.tent ? 10 : 0);
          applyEffects(s, { health, sanity });
          message = `歇息片刻，生命 +${health}，理智 +${sanity}`;
          addLog(s, s.structures.tent ? '你在帐篷里睡了一个安稳的短觉。醒来时，觉得自己又能走很远的路了。' : '你坐在倒下的树干上，慢慢调整呼吸。森林没有那么可怕了。', 'heal', '稍作休整');
        } else {
          addItems(s, a.loot); applyEffects(s, a);
          const loot = Object.entries(a.loot || {}).map(([item, n]) => `${ITEMS[item].name} ×${n}`).join('、');
          message = loot ? `获得${loot}` : a.reward;
          addLog(s, `${a.narrative}${loot ? ` 获得${loot}。` : ''}`, 'gather', a.name);
          s.stats.gathered += Object.values(a.loot || {}).reduce((a, b) => a + b, 0);
          if (s.health <= 0) die(s, '最后一次冒险耗尽了你的力气。荒野很大，而这一次，你没能走出去。');
          else maybeEvent(s, a.eventChance ?? 0.14);
        }
      }
    } else if (type === 'craft') {
      const r = RECIPES.find(recipe => recipe.id === id);
      const reason = recipeReason(s, r);
      if (reason) return { ok: false, message: reason };
      pay(s, r.cost); advance(s, r.minutes);
      if (s.status === 'playing') {
        if (r.structure) {
          s.structures[r.structure] = true;
          if (r.structure === 'firepit') { s.fireFuel = Math.min(960, s.fireFuel + 240); s.flags.fireOut = false; }
        } else {
          addItems(s, { [r.output]: 1 });
          if (ITEMS[r.output].durability) s.durability[r.output] = ITEMS[r.output].durability;
        }
        s.stats.crafted++;
        if (r.fire) s.stats.cooked++;
        if (id === 'axe') s.flags.madeAxe = true;
        message = `${r.structure ? '建成' : '制成'}${r.name}`;
        addLog(s, r.id === 'beacon' ? '你把碎片嵌入信标。一缕温暖的光缓缓升起。熬过七个夜晚后，回到这里，它就能指引你回家。' : `${r.name}${r.structure ? '已经建好。营地又多了一点家的样子。' : r.fire ? '做好了。食物的香气让冰冷的荒野变得亲切了一点。' : '已经做好，收进了你的行囊。'}`, 'craft', message);
      }
    } else if (type === 'travel') {
      if (!LOCATIONS[id] || id === s.location) return { ok: false, message: '你已经在这里了' };
      const destination = LOCATIONS[id];
      const duration = travelTime(s, id);
      // The campfire stays in camp. It must not protect a traveler during the journey.
      const origin = s.location;
      s.location = origin === 'camp' ? id : origin;
      advance(s, duration);
      if (s.status === 'playing') {
        s.location = id; s.visited[id] = true;
        message = `抵达${destination.name}`;
        addLog(s, destination.description, 'travel', message);
        maybeEvent(s, 0.12);
      }
    } else if (type === 'feedFire') {
      if (s.location !== 'camp') return { ok: false, message: '需要回到营地才能添柴' };
      if (!count(s, 'wood')) return { ok: false, message: '需要 1 根木材，可以在营地拾取枯枝' };
      if (s.fireFuel >= 900) return { ok: false, message: '篝火燃料已经充足，留些木材在行囊里吧' };
      s.inventory.wood--;
      const wasOut = s.fireFuel <= 0;
      s.fireFuel = Math.min(960, s.fireFuel + (s.structures.firepit ? 150 : 120));
      s.flags.fireOut = false;
      advance(s, 10);
      message = wasOut ? '余烬重新燃起了火光' : '给篝火添了一根木材';
      if (s.status === 'playing') addLog(s, wasOut ? '你拨开灰烬，把干燥的木材放好。一小簇火苗试探着抬起头，然后亮了起来。' : '木材落进火里，溅起几颗细小的火星。这个夜晚，又多了一点把握。', 'fire', message);
    } else if (type === 'use') {
      const item = ITEMS[id];
      if (!item || !count(s, id)) return { ok: false, message: '行囊里没有这件物品' };
      if (!item.food && !item.use) return { ok: false, message: item.description };
      if (item.use === 'torch' && s.torchFuel >= 175) return { ok: false, message: '手中的火把刚刚点燃，无需换新' };
      s.inventory[id]--;
      if (item.food) {
        applyEffects(s, item.food);
        message = `吃掉${item.name}，饱食 +${item.food.hunger}`;
        addLog(s, `${item.food.health < 0 ? '生食的滋味并不好受。' : '你慢慢吃完了食物。'}${item.description} 饱食 +${item.food.hunger}${item.food.health ? `，生命 ${item.food.health > 0 ? '+' : ''}${item.food.health}` : ''}${item.food.sanity ? `，理智 ${item.food.sanity > 0 ? '+' : ''}${item.food.sanity}` : ''}。`, item.food.health < 0 ? 'warning' : 'food', `吃掉${item.name}`);
      } else if (item.use === 'torch') {
        s.torchFuel = 180; message = '火把已点燃，提供随身照明';
        addLog(s, '火把亮起来了。你握住这束小小的光，黑暗向后退了一步。', 'fire', '随身的火光');
      } else {
        applyEffects(s, item.use === 'flower' ? { sanity: 6 } : { health: 25 });
        message = item.use === 'flower' ? '花香让你平静了一些，理智 +6' : '伤口得到处理，生命 +25';
        addLog(s, message, 'heal', `使用${item.name}`);
      }
      if (s.health <= 0) die(s, '这顿生食让本就虚弱的身体再也无法支撑。你的旅程，停在了这里。');
      else advance(s, 5);
    } else if (type === 'sleep') {
      const reason = sleepReason(s);
      if (reason) return { ok: false, message: reason };
      advance(s, (1800 - minuteOfDay(s)) % 1440 || 1440);
      if (s.status === 'playing') {
        applyEffects(s, { health: 25, sanity: 25 });
        message = '一夜安眠，生命 +25，理智 +25';
        addLog(s, '你在温暖的帐篷里睡到天亮。醒来时，火还在，世界也还在。', 'heal', '睡到天亮');
      }
    } else if (type === 'choose') {
      const event = EVENTS[s.event];
      const choice = event?.choices.find(c => c.id === id);
      if (!choice) return { ok: false, message: '请选择当前奇遇中的选项' };
      const reason = choiceReason(s, choice);
      if (reason) return { ok: false, message: reason };
      pay(s, choice.cost); addItems(s, choice.loot); applyEffects(s, choice);
      if (choice.tool) wearTool(s, choice.tool);
      addLog(s, choice.result, 'event', event.title);
      s.event = null; message = '你做出了自己的选择';
      if (s.health <= 0) die(s, '你倒在了荒野的荆棘之间。这一次，运气没有站在你这边。');
    } else return { ok: false, message: '未知的行动' };
    s.stats.actions++;
    checkVictory(s);
    return { ok: true, message, ended: s.status !== 'playing' };
  }

  function getGuide(s) {
    if (nights(s) < 1) {
      const food = Object.entries(s.inventory).reduce((n, [id, amount]) => n + (ITEMS[id]?.food ? amount : 0), 0);
      return { title: '熬过第一个夜晚', description: '天黑之前，给自己留下一点余地。', steps: [
        { label: '制作一把石斧', done: !!s.flags.madeAxe, target: 'craft:tools' },
        { label: '备好 6 份食物', done: food >= 6, target: 'food' },
        { label: '让篝火能燃烧 6 小时', done: s.fireFuel / fireRate(s) >= 360, target: 'fire' },
      ] };
    }
    if (!s.structures.beacon) return { title: '寻找回家的方向', description: '旧日遗迹的光，或许是一条线索。', steps: [
      { label: '踏入旧日遗迹', done: !!s.visited.ruins, target: 'map' },
      { label: '收集 3 枚古老碎片', done: count(s, 'relic') >= 3, target: 'map' },
      { label: '在营地建造归途信标', done: false, target: 'craft:camp' },
    ] };
    return { title: s.endless ? '把这里，过成生活' : '守住最后的微光', description: s.endless ? '归途已在身后。荒野里仍有新的故事。' : '信标已亮起，再坚持到第七个夜晚之后。', steps: [
      { label: '建造归途信标', done: true, target: 'craft:camp' },
      { label: `熬过七个夜晚（${Math.min(nights(s), 7)}/7）`, done: nights(s) >= 7, target: 'rest' },
      { label: '回到林间营地', done: s.location === 'camp', target: 'return' },
    ] };
  }

  function restore(raw) {
    let data;
    try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { throw new Error('存档不是有效的 JSON 文件'); }
    const invalid = () => { throw new Error('存档不完整或版本不兼容，请选择这个游戏导出的存档'); };
    if (!data || data.version !== VERSION || !Object.hasOwn(LOCATIONS, data.location) || !Object.hasOwn(WEATHER, data.weather)) return invalid();
    const finite = (x, min, max) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
    if (!finite(data.time, 480, 52560000) || !Number.isInteger(data.time) || !finite(data.seed, 1, 4294967295) || !Number.isInteger(data.seed)) return invalid();
    for (const key of ['health', 'hunger', 'sanity']) if (!finite(data[key], 0, 100)) return invalid();
    if (!finite(data.fireFuel, 0, 960) || !finite(data.torchFuel, 0, 180) || !['playing', 'dead', 'won'].includes(data.status)) return invalid();
    if (!data.inventory || !data.structures || !data.durability || !data.stats || !Array.isArray(data.logs)) return invalid();
    if ((data.status === 'dead') !== (data.health === 0) || (data.event !== null && !Object.hasOwn(EVENTS, data.event))) return invalid();
    const s = createState(data.seed);
    for (const key of ['time', 'location', 'health', 'hunger', 'sanity', 'weather', 'fireFuel', 'torchFuel', 'status', 'event']) s[key] = data[key];
    s.endless = data.endless === true;
    s.endReason = typeof data.endReason === 'string' ? data.endReason.slice(0, 400) : '';
    s.inventory = {};
    for (const id of Object.keys(ITEMS)) {
      const amount = data.inventory[id] ?? 0;
      if (!finite(amount, 0, 100000) || !Number.isInteger(amount)) return invalid();
      s.inventory[id] = amount;
      if (ITEMS[id].durability && amount) {
        if (amount !== 1 || !Number.isInteger(data.durability[id]) || !finite(data.durability[id], 1, ITEMS[id].durability)) return invalid();
        s.durability[id] = data.durability[id];
      }
    }
    for (const id of Object.keys(s.structures)) {
      if (typeof data.structures[id] !== 'boolean') return invalid();
      s.structures[id] = data.structures[id];
    }
    for (const id of Object.keys(s.stats)) {
      if (!Number.isInteger(data.stats[id]) || !finite(data.stats[id], 0, 100000000)) return invalid();
      s.stats[id] = data.stats[id];
    }
    s.visited = { camp: true, [s.location]: true };
    for (const id of Object.keys(LOCATIONS)) if (data.visited?.[id] === true) s.visited[id] = true;
    s.depleted = {};
    for (const id of Object.keys(ACTIONS)) {
      const n = data.depleted?.[id] ?? 0;
      if (!Number.isInteger(n) || !finite(n, 0, 100000000)) return invalid();
      if (n) s.depleted[id] = n;
    }
    s.flags = {};
    for (const id of ['madeAxe', 'fireOut']) s.flags[id] = data.flags?.[id] === true;
    if (Number.isInteger(data.flags?.hungerDay)) s.flags.hungerDay = data.flags.hungerDay;
    const logKinds = ['story', 'tip', 'warning', 'danger', 'success', 'gather', 'heal', 'craft', 'travel', 'fire', 'food', 'event'];
    s.logs = data.logs.slice(-100).map((entry, index) => {
      if (!entry || typeof entry.text !== 'string' || !finite(entry.time, 0, s.time) || !logKinds.includes(entry.kind)) return invalid();
      return { id: index + 1, time: entry.time, text: entry.text.slice(0, 800), title: typeof entry.title === 'string' ? entry.title.slice(0, 80) : '', kind: entry.kind };
    });
    s.logId = s.logs.length;
    if (s.status !== 'playing') s.event = null;
    if (s.status === 'won' && (!s.structures.beacon || nights(s) < 7 || s.location !== 'camp')) return invalid();
    return s;
  }

  return { VERSION, SAVE_KEY, ITEMS, RECIPES, ACTIONS, LOCATIONS, EVENTS, WEATHER, createState, restore, act, day, nights, phase, clock, count, minuteOfDay, temperature, fireRate, hasLight, hasCampfire, actionReason, recipeReason, choiceReason, travelTime, sleepReason, getGuide };
});
