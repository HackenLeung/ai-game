(function (root, factory) {
  const catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else root.GameCatalog = catalog;
})(globalThis, function () {
  'use strict';
  // 新游戏放进 games/<id>/，再在这里登记；大厅与构建会自动接入。
  const games = [
    {
      id: 'fengyunjue',
      title: '逸剑风云决',
      subtitle: '问剑长歌',
      english: 'THE WANDERING SWORD',
      category: 'wuxia',
      categoryLabel: '武侠角色扮演',
      tags: ['像素武侠', '回合策略', '剧情探索'],
      aliases: '风云诀 风云决 逸剑 江湖 fengyunjue sword RPG',
      entry: 'games/fengyunjue/index.html',
      cover: 'assets/previews/fengyunjue.png',
      screenshot: 'assets/previews/fengyunjue-full.jpg',
      scene: '山水初逢 · 梧桐村',
      icon: 'sword',
      color: 'jade',
      description: '一人一剑，行过九地山河。在回合交锋与江湖奇遇中，写下你的侠客故事。',
      hero: '一封旧信，一次为他人拔剑。\n从梧桐村出发，赴一场有始有终的江湖之约。',
      facts: [['3', '章主线故事'], ['9', '张江湖地图'], ['49', '段主线任务']],
      highlights: ['探索三章江湖故事，结识同伴，选择自己的武学流派。', '先移动，再出招。利用破势、站位与同伴配合赢下交锋。', '主线之外还有九道悬赏、十二层剑冢与章节重游。'],
      controls: [['WASD / 方向键', '移动'], ['E', '与附近人物或地点交互'], ['B / K / J', '行囊 / 修行 / 江湖志'], ['M / T', '地图 / 历练'], ['1–9', '战斗招式'], ['?', '游戏内指南']],
      tip: '刚开始可以跟着右侧「当前指引」前进，初次体验推荐「游侠」难度。手机上也可以点击场景和操作按钮。',
      saveHelp: '在游戏内打开「游玩指南」，可以导出和导入存档。交锋以开战前和结算后为存档节点。',
      saveKey: 'wandering-sword-v1',
      readySelector: '#quest-guide'
    },
    {
      id: 'jihuan',
      title: '余烬',
      subtitle: '荒野生存手记',
      english: 'EMBER · A WILDERNESS JOURNAL',
      category: 'survival',
      categoryLabel: '生存冒险',
      tags: ['荒野生存', '收集制作', '文字冒险'],
      aliases: '饥荒 极幻 jihuan ember wilderness',
      entry: 'games/jihuan/index.html',
      cover: 'assets/previews/jihuan.png',
      screenshot: 'assets/previews/jihuan-full.jpg',
      scene: '荒野初醒 · 余烬营地',
      icon: 'flame',
      color: 'amber',
      description: '收集、制作、探索，守住最后一簇火。在昼夜与风雨之间，寻找回家的方向。',
      hero: '风穿过松林，余烬还在呼吸。\n收拾行囊，在天黑之前，给自己留一簇火。',
      facts: [['6', '片荒野区域'], ['7', '个生存夜晚'], ['1', '座归途信标']],
      highlights: ['在营地、松林、草地、石坡、湿地与遗迹中寻找生存物资。', '制作工具、烹饪食物、搭建营地，同时照顾饱食、理智和体温。', '建成归途信标，熬过七个夜晚并返回营地。通关后仍可自由生存。'],
      controls: [['1–4', '执行当前采集行动'], ['E', '生存页面'], ['C', '工坊'], ['M', '地图'], ['B', '行囊'], ['鼠标 / 触屏', '操作场景、物品与按钮']],
      tip: '先制作一把石斧。去草地准备食物，去松林准备木材。只有行动才会推进时间，不用着急。',
      saveHelp: '每次行动会自动存档。右上角「存档与设置」可以导出和导入存档。',
      saveKey: 'ember-wilderness-save-v1',
      readySelector: '#stat-hunger'
    },
    {
      id: 'abyss',
      title: '深渊回响',
      subtitle: '牌组构筑',
      english: 'ABYSS ECHO',
      category: 'deckbuilding',
      categoryLabel: '卡牌构筑',
      tags: ['牌组构筑', '随机地牢', '回合策略'],
      aliases: '杀戮尖塔 爬塔 卡牌 roguelike abyss echo deckbuilder slay',
      entry: 'games/abyss/index.html',
      cover: 'assets/previews/abyss.png',
      screenshot: 'assets/previews/abyss-full.jpg',
      scene: '回响航母 · 寂静甲板',
      icon: 'deck',
      color: 'abyss',
      description: '一座被遗弃的回响航母，一份残缺的亡灵协议。收集卡牌、组合心法，穿越十二个章节。',
      hero: '残骸在真空中缓慢旋转。\n舰载协议仍在运行，只是它们已经不再认识你。',
      facts: [['12', '章攀升路线'], ['101', '张可用卡牌'], ['88', '种敌人与首领']],
      highlights: ['十二个章节、共 180 层路线：从回响航母一路攀升到回响之源。', '三名可用角色：先驱守卫、腐生术士、心能行者，起始牌组与体系各不相同。', '每回合三点能量，先看敌人意图，再决定进攻还是防守；易伤、虚弱、中毒、灼烧互相牵制。', '地图包含普通战斗、精英、未知事件、维修站、补给舱、黑市与每章首领；进入新章节时核心会成长。'],
      controls: [['鼠标 / 触屏', '点击手牌出牌，再点敌人选择目标'], ['E', '结束回合'], ['1–3', '使用药水（第一次高亮，再按一次才使用）'], ['D / R', '牌组 / 图鉴'], ['?', '玩法说明'], ['Esc', '关闭弹窗']],
      tip: '先看清敌人头顶的意图数字。格挡会在下个回合开始时清空，所以防御要放在真正被打的那一回合。精英给遗物，值得冒险。',
      saveHelp: '选择节点、结束战斗与商店交易后自动保存。右上角「存档与设置」可以导出和导入存档。',
      saveKey: 'abyss-echo-save-v1',
      readySelector: '#hud-hp'
    },
    {
      id: 'mahjong',
      title: '麻雀学堂',
      subtitle: '广东牌算番、筹码与对局',
      english: 'MAHJONG TUTOR · CANTONESE',
      category: 'table',
      categoryLabel: '牌桌研习',
      tags: ['麻将教学', '算番结算', '筹码抓马', '四人对局', '听牌练习'],
      aliases: '麻将 麻雀 广东牌 香港牌 算番 算分 筹码 抓马 买马 对局 四人麻将 人机 摸打 吃碰杠胡 自摸 杠 拿牌 掷骰 开门 听牌 胡牌 花牌 鬼牌 mahjong tile cantonese',
      entry: 'games/mahjong/index.html',
      cover: 'assets/previews/mahjong.png',
      screenshot: 'assets/previews/mahjong-full.jpg',
      scene: '四方牌桌 · 算番与对局',
      icon: 'tile',
      color: 'jade',
      description: '从掷骰开门到番种结算，也能不算番直接记筹码；想真打就坐下，和三家电脑摸打碰杠吃胡。',
      hero: '四方牌墙围出一张桌子。\n先学会怎么拿牌，再坐下来打一局。',
      facts: [['7', '节入门课'], ['21', '个常见番种'], ['4', '人一桌']],
      highlights: [
        '分大小、两粒相加两种数法：输入骰子点数与座位，算出从谁家、第几墩开始拿牌。',
        '点牌即算：自动拆成四组一对，列出平胡、清一色、对对胡、三元四喜等番种，并算出自摸与出铳分别收多少。',
        '不算番也能记：自摸每家 2 个筹码，有鬼抓 4 张马、无鬼抓 6 张，中几只算几只；公杠、暗杠、放杠分开收。',
        '四人对局：先摇骰子，首局你坐东，和三家电脑打；默认 136 张鬼牌红中，可切白板 / 发财 / 无鬼，点牌先立起、再点出牌，吃碰杠胡都能用，赢家坐庄。',
        '支持鬼牌（红中 / 白板 / 发财）与花牌两种玩法，也可都不加；鬼牌按不能做眼、只能补顺子或刻子的规矩拆牌。',
        '练习模式随机出题：判断 14 张能否胡牌、13 张听哪些牌，答完显示拆解。'
      ],
      controls: [['鼠标 / 触屏', '选牌、切换分区'], ['牌墙', '点牌加入手牌，点手牌移除'], ['玩法', '算番/筹码页切换鬼牌 / 花牌 / 都不加；对局页右上角切鬼牌或无鬼'], ['筹码页', '选庄家、点马牌、填台面杠'], ['对局页', '点手牌出牌，按提示吃碰杠胡'], ['结算规则', '改起胡、封顶、底分与每番']],
      tip: '想打牌直接去「对局」页：点手牌出牌，能碰能吃能杠时手牌下方会出现按钮。只记筹码就去「筹码」页；想弄明白某手牌为什么值这些番，再去「算番」看拆牌。',
      saveHelp: '本作是练习工具，不需要存档，刷新后从头开始。',
      saveKey: 'mahjong-tutor-v1',
      readySelector: '#mj-lessons .mj-lesson'
    }
  ];
  const categories = [...new Map(games.map(game => [game.category, { id: game.category, label: game.categoryLabel, icon: game.icon }])).values()];
  return { games, categories, get: id => games.find(game => game.id === id) };
});
