(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 像素图标：24×24 viewBox，12×12 网格，每格 2 单位。
  // 无外部素材、无网络请求；每个图标在第一次用到时生成一个 <symbol>。
  // 字母：o 描边，a 主色，b 亮部，c 暗部，e 眼/高光，f 副色。
  // ---------------------------------------------------------------------------

  const OUT = '#131a26';
  const palettes = {
    hero: { o: OUT, a: '#f3cb73', b: '#f7dfa6', c: '#a8792f', e: '#f4d5b3', f: '#5b9ee4' },
    moss: { o: OUT, a: '#7fbd63', b: '#a9d47f', c: '#487a45', e: '#f4f0db', f: '#c9e8a4' },
    crimson: { o: OUT, a: '#ce6163', b: '#f69976', c: '#883e55', e: '#f4f0db', f: '#f7c1ad' },
    violet: { o: OUT, a: '#a282bd', b: '#c9a2d5', c: '#66528c', e: '#f2d174', f: '#d9bce6' },
    azure: { o: OUT, a: '#7b9fce', b: '#b6d3e8', c: '#4a628a', e: '#f2d174', f: '#9dc2e8' },
    bone: { o: OUT, a: '#d5d3bf', b: '#faf1d6', c: '#8f949a', e: '#6b7278', f: '#e9e7d6' },
    brass: { o: OUT, a: '#d0a85b', b: '#f5d584', c: '#8c644a', e: '#fff1c6', f: '#e8c878' },
    steel: { o: OUT, a: '#9aa8b6', b: '#cdd7e2', c: '#5d6b7c', e: '#e8eef5', f: '#b7c4d1' },
    ash: { o: OUT, a: '#5a6474', b: '#7d8798', c: '#333a48', e: '#c8d3e0', f: '#6c7686' },
    white: { o: OUT, a: '#e8eef5', b: '#ffffff', c: '#aab8c8', e: '#f3cb73', f: '#f7fbff' },
    brown: { o: OUT, a: '#8d6a4b', b: '#b98d63', c: '#5e4530', e: '#f4e6cd', f: '#c9a07a' },
    ember: { o: OUT, a: '#e0913f', b: '#f7b95c', c: '#8a4b2a', e: '#ffe9b8', f: '#f2a24f' },
    dark: { o: OUT, a: '#4b4256', b: '#6a5e77', c: '#2a2433', e: '#ec7670', f: '#5c4f6b' },
    thief: { o: OUT, a: '#3f4b5e', b: '#55657c', c: '#28313d', e: '#c3ceda', f: '#4a5a70' },
    blood: { o: OUT, a: '#9b3636', b: '#c24545', c: '#521a1a', e: '#f7b95c', f: '#b8493f' },
    holy: { o: OUT, a: '#cfe3e8', b: '#eaf7fa', c: '#7ea7b5', e: '#a3cb88', f: '#f2d174' },
    gold: { o: OUT, a: '#d0a85b', b: '#f5d584', c: '#8c644a', e: '#fff1c6', f: '#f3cb73' }
  };

  // 12 列；不足 12 列的补透明，超出的截断。
  const ART = {
    hero: [
      '....oooo....',
      '...obbbbo...',
      '..obaaaabo..',
      '..oaeaaeao..',
      '..obaaaabo..',
      '...oaaaao...',
      '..ffoaaoff..',
      '.ffoccccoff.',
      '.ffoccccoff.',
      '..ofccccfo..',
      '...occcco...',
      '...oo..oo...'
    ],
    slime: [
      '.....ooo....',
      '...ooaaaoo..',
      '..obbbbbbo..',
      '.obbaaaabbbo',
      '.obaeaaaeabo',
      '.oaaaaaaaaao',
      '.oaacccccaao',
      '..occcccco..',
      '...oooooo...'
    ],
    bat: [
      '.o........o.',
      '.oo......oo.',
      '.oao.oo.oao.',
      '.oaooaaooao.',
      '..oaaaaaao..',
      '..oeaaaaeo..',
      '..oaaaaaao..',
      '...oaaccco..',
      '....occco...',
      '.....ooo....'
    ],
    skeleton: [
      '....oooo....',
      '...obbbbo...',
      '..obbbbbbo..',
      '..oeeobeeo..',
      '..obbbbbbo..',
      '...obaabo...',
      '....obbo....',
      '..ooobbooo..',
      '.obbaaaaabbo',
      '.obbaaaaabbo',
      '..obcccccbo.',
      '...obboobbo.'
    ],
    orc: [
      '...oooooo...',
      '..obbbbbbo..',
      '..oaaaaaao..',
      '..oeaaaaeo..',
      '..oaaaaaao..',
      '..oaaeeaao..',
      '...oaaaao...',
      '..ooaaaaoo..',
      '.obaaaaaabo.',
      '.obaaaaaabo.',
      '..occaaccco.',
      '...oo..oo...'
    ],
    knight: [
      '....oooo....',
      '...obbbbo...',
      '..obbbbbbo..',
      '..ocbbbbco..',
      '..obeeeebo..',
      '..occcccco..',
      '..ooaaaaoo..',
      '.obaaaaaabo.',
      '.obaaaaaabo.',
      '.occaaaaacco',
      '..occcccco..',
      '...oo..oo...'
    ],
    guard: [
      '....oooo....',
      '...obbbbo...',
      '..obbbbbbo..',
      '..obbbbbbo..',
      '..oceeccco..',
      '..occcccco..',
      '.ffoaaaaoff.',
      '.ffoaaaaoff.',
      '.ffoaaaaoff.',
      '..occaaccco.',
      '..occcccco..',
      '...oo..oo...'
    ],
    mage: [
      '.....oo.....',
      '....obbo....',
      '...obbbbo...',
      '..obbbbbbo..',
      '..occcccco..',
      '...oaaaao...',
      '...oeaaeo...',
      '...oaaaao...',
      '..ofaaaafo..',
      '.offaaaaffo.',
      '..occcccco..',
      '...oo..oo...'
    ],
    ghost: [
      '...oooooo...',
      '..obbbbbbo..',
      '.obbbbbbbbo.',
      '.obbbbbbbbo.',
      '.obeeaaeeo..',
      '.obbbbbbbbo.',
      '.ocbbbbbbco.',
      '..occcccco..',
      '..oco..oco..',
      '..o......o..'
    ],
    golem: [
      '..oooooooo..',
      '..obbbbbbo..',
      '..obbbbbbo..',
      '..obeboebo..',
      '..obbbbbbo..',
      '.ooaaaaaaoo.',
      'obaaaaaaaabo',
      'obaaaaaaaabo',
      'obacccaccabo',
      '.occccccco..',
      '..occcccco..',
      '...oo..oo...'
    ],
    demon: [
      '.o........o.',
      '.oa......ao.',
      '.oao....oao.',
      '..oooooooo..',
      '..obbbbbbo..',
      '..oebbbbeo..',
      '..obbbbbbo..',
      '...obbbbo...',
      '..occcccco..',
      '.ocaaaaaaco.',
      '.ocaaaaaaco.',
      '..oo....oo..'
    ],
    dragon: [
      '.o........o.',
      '.oo......oo.',
      '.obo....obo.',
      '.obboooobbo.',
      '..obbbbbbo..',
      '..oebbbbeo..',
      '..obbbbbbo..',
      '...ocbbco...',
      '..occcccco..',
      '.ocaccaccao.',
      '.occccccco..',
      '..oo....oo..'
    ],
    king: [
      '..o......o..',
      '..oa.oo.ao..',
      '..oaaooaao..',
      '..ofbbbbfo..',
      '..obbbbbbo..',
      '..oaaaaaao..',
      '..oaeaaaeo..',
      '..oaaaaaao..',
      '..ooaaaaoo..',
      '.obaaaaaabo.',
      '.occaaaaacco',
      '..occcccco..'
    ],
    princess: [
      '...oooooo...',
      '..obbbbbbo..',
      '..obfbbfbo..',
      '..oaaaaaao..',
      '..oaeaaaeo..',
      '..oaaaaaao..',
      '...oaaaao...',
      '..ofaaaafo..',
      '.offaaaaffo.',
      '.offaaaaffo.',
      'offaaaaaaffo',
      'oooooooooooo'
    ],
    octopus: [
      '...oooooo...',
      '..obbbbbbo..',
      '.obbbbbbbbo.',
      '.obebbbbebo.',
      '.obbbbbbbbo.',
      '..obbbbbbo..',
      '.obo.obo.obo',
      'obo...o...obo',
      'o.....o.....o'
    ],
    child: [
      '...oooooo...',
      '..obbbbbbo..',
      '..oaaaaaao..',
      '..oaeaaaeo..',
      '..oaaaaaao..',
      '...oaaaao...',
      '..oaaaaaao..',
      '.obaaaaaabo.',
      '.obaaaaaabo.',
      '..occcccco..',
      '...oo..oo...'
    ],
    oldman: [
      '....oooo....',
      '...obbbbo...',
      '...obbbbo...',
      '...oeaaeo...',
      '...oaaaao...',
      '..oabbbbao..',
      '..oaaaaaao..',
      '.obaaeeaabo.',
      '.obaaaaaabo.',
      '.occaaaaacco',
      '..occcccco..',
      '...oo..oo...'
    ],
    trader: [
      '...oooooo...',
      '..obbbbbbo..',
      '..oaaaaaao..',
      '...oaaaao...',
      '...oeaaeo...',
      '..oaaaaaao..',
      '.obaaaaaabo.',
      '.obaaeeaabo.',
      '.obaaaaaabo.',
      '.occaaaaacco',
      '..occcccco..',
      '...oo..oo...'
    ],
    altar: [
      '....oooo....',
      '...obbbbo...',
      '..obbbbbbo..',
      '..obbbbbbo..',
      '..oeeeeeeo..',
      '.obboooobbo.',
      '.obaaaaaabo.',
      '.obaaaaaabo.',
      '.oooooooooo.',
      '..oooooooo..'
    ],
    potion: [
      '....oooo....',
      '....obbo....',
      '...oooooo...',
      '...obbbbo...',
      '..obaaaabo..',
      '..obaaaabo..',
      '..obaaaabo..',
      '..obaaaabo..',
      '..obaaaabo..',
      '...obbbbo...',
      '....oooo....'
    ],
    gem: [
      '.....oo.....',
      '....obbo....',
      '...obbbbo...',
      '..obbbbbbo..',
      '.obbaaaaabbo',
      '..obaaaaabo.',
      '...obaaaabo.',
      '....obaaabo.',
      '.....obabo..',
      '......obo...'
    ],
    coin: [
      '....oooo....',
      '..oobbbboo..',
      '.obbaaaabbo.',
      '.obaaeeaabo.',
      '.obaaeeaabo.',
      '.obaaaaaabo.',
      '.obbaaaabbo.',
      '..oobbbboo..',
      '....oooo....'
    ],
    key: [
      '..oooo......',
      '.obbbbo.....',
      '.oboobo.....',
      '.obbbbo.....',
      '..oooo......',
      '...obo......',
      '...obo......',
      '...obo......',
      '...oboo.....',
      '...obo......',
      '...oboo.....',
      '....oo......'
    ],
    sword: [
      '.....oo.....',
      '....obbo....',
      '....obbo....',
      '....obbo....',
      '....obbo....',
      '....obbo....',
      '..oobbbboo..',
      '....ocbo....',
      '....ocbo....',
      '....oooo....'
    ],
    shield: [
      '..oooooooo..',
      '..obbbbbbo..',
      '..obaaaabo..',
      '..obaaaabo..',
      '..obaaaabo..',
      '...obaaabo..',
      '...obaaabo..',
      '....obaabo..',
      '.....obbo...',
      '......oo....'
    ],
    book: [
      '..oooooooo..',
      '.obbbbbbbbo.',
      '.obaaaaaabo.',
      '.obaeeeeabo.',
      '.obaaaaaabo.',
      '.obaeeeeabo.',
      '.obaaaaaabo.',
      '.obbbbbbbbo.',
      '..oooooooo..'
    ],
    cross: [
      '.....oo.....',
      '....obbo....',
      '....obbo....',
      '..ooobbooo..',
      '.obbbbbbbbo.',
      '..ooobbooo..',
      '....obbo....',
      '....obbo....',
      '.....oo.....'
    ],
    bomb: [
      '......oo....',
      '.....oao....',
      '....o.......',
      '..oooo..e...',
      '.obbbbo.....',
      'obaaaabo....',
      'obaaaabo....',
      'obaaaabo....',
      '.obbbbo.....',
      '..oooo......'
    ],
    pickaxe: [
      '..ooooo.....',
      '.obbbbbbo...',
      '.obo...obo..',
      '.o......obo.',
      '........obo.',
      '.......obo..',
      '......obo...',
      '.....obo....',
      '....obo.....',
      '...obo......',
      '..obo.......',
      '.oo.........'
    ],
    snow: [
      '.....ee.....',
      '.e...ee...e.',
      '..e..ee..e..',
      '...e.ee.e...',
      '....eeee....',
      'eeeeeeeeeeee',
      '....eeee....',
      '...e.ee.e...',
      '..e..ee..e..',
      '.e...ee...e.',
      '.....ee.....'
    ],
    scroll: [
      '.oo......oo.',
      'obbo....obbo',
      'obboooooobbo',
      'obbbbbbbbbbo',
      '.obccccccbo.',
      '.obbbbbbbbo.',
      '.obccccccbo.',
      '.obbbbbbbbo.',
      'obboooooobbo',
      'obbo....obbo',
      '.oo......oo.'
    ],
    boots: [
      '..oo........',
      '.obbo.......',
      '.obbo.......',
      '.obbo.......',
      '.obbo.......',
      '.obbooo.....',
      '.obbbbbbo...',
      '.obbbbbbbo..',
      '.oooooooooo.',
      '..oooooooo..'
    ],
    hammer: [
      '..oooooooo..',
      '.obbbbbbbbo.',
      '.obaaaaaabo.',
      '.obbbbbbbbo.',
      '..ooobboo...',
      '....obbo....',
      '....obbo....',
      '....obbo....',
      '....oooo....'
    ],
    pack: [
      '...oooooo...',
      '..obbbbbbo..',
      '.obbaaaabbo.',
      '.obaaaaaabo.',
      '.obaeeeeabo.',
      '.obaaaaaabo.',
      '.obbaaaabbo.',
      '..obbbbbbo..',
      '...oooooo...'
    ],
    wand: [
      '.......oo...',
      '......obbo..',
      '.....obbo...',
      '....obbo....',
      '...obbo.....',
      '..obbo......',
      '.obbo.......',
      '.obo........',
      '.oo.........',
      'e...........'
    ],
    ring: [
      '....oooo....',
      '...obbbbo...',
      '..ob....bo..',
      '..ob.ee.bo..',
      '..ob.ee.bo..',
      '..ob....bo..',
      '...obbbbo...',
      '....oooo....'
    ],
    relic: [
      '....oooo....',
      '...obbbbo...',
      '..obaaaabo..',
      '..obaeebao..',
      '..obaeebao..',
      '..obaaaabo..',
      '...obbbbo...',
      '....oooo....'
    ],
    switch: [
      '..oooooooo..',
      '.obbbbbbbbo.',
      '.obaaaaaabo.',
      '.obaaeaaabo.',
      '.obaaaaaabo.',
      '.obbbbbbbbo.',
      '..oooooooo..'
    ],
    star: [
      '.....ee.....',
      '.....ee.....',
      '....eeee....',
      'eeeeeeeeeeee',
      '..eeeeeeee..',
      '...eeeeee...',
      '..eeeeeeee..',
      '..eee..eee..',
      '..ee....ee..'
    ],
    fire: [
      '.....o......',
      '....oao.....',
      '...oaaaao...',
      '..oaaaaaao..',
      '..oaeaeaao..',
      '.oaaaaaaaao.',
      '.oaeeeeeaao.',
      '..oeeeeeao..',
      '...oo..oo...'
    ],
    portal: [
      '....oooo....',
      '..ooeeeeoo..',
      '.oe......eo.',
      'oe..oooo..eo',
      'oe.obbbbo.eo',
      'oe.obbbbo.eo',
      'oe..oooo..eo',
      '.oe......eo.',
      '..ooeeeeoo..',
      '....oooo....'
    ]
  };

  // 怪物 → 造型 + 配色。族类相同、颜色不同，和原塔的怪物族谱对得上。
  const ENEMY_ART = {
    greenSlime: ['slime', 'moss'], redSlime: ['slime', 'crimson'], blackSlime: ['slime', 'ash'],
    slimelord: ['slime', 'violet'], goldSlime: ['slime', 'gold'], silverSlime: ['slime', 'steel'],
    goldHornSlime: ['slime', 'brass'], whiteHornSlime: ['slime', 'white'],
    bat: ['bat', 'violet'], bigBat: ['bat', 'azure'], redBat: ['bat', 'crimson'],
    evilBat: ['bat', 'dark'], vampire: ['bat', 'dark'],
    skeleton: ['skeleton', 'bone'], skeletonSoldier: ['skeleton', 'steel'],
    skeletonCaptain: ['skeleton', 'gold'], ghostSkeleton: ['skeleton', 'azure'],
    poisonSkeleton: ['skeleton', 'moss'], skeletonPriest: ['skeleton', 'violet'],
    skeletonKing: ['skeleton', 'white'], skeletonWizard: ['skeleton', 'azure'],
    redSkeletonCaption: ['skeleton', 'crimson'],
    zombie: ['orc', 'moss'], zombieKnight: ['orc', 'crimson'], poisonZombie: ['orc', 'violet'],
    rock: ['golem', 'ash'], steelRock: ['golem', 'steel'],
    slimeMan: ['ghost', 'azure'], whiteGhost: ['ghost', 'white'],
    bluePriest: ['mage', 'azure'], redPriest: ['mage', 'crimson'],
    brownWizard: ['mage', 'brown'], redWizard: ['mage', 'crimson'],
    grayPriest: ['mage', 'ash'], blackMagician: ['mage', 'dark'],
    yellowGuard: ['guard', 'brass'], blueGuard: ['guard', 'azure'],
    redGuard: ['guard', 'crimson'], steelGuard: ['guard', 'steel'],
    swordsman: ['knight', 'azure'], soldier: ['knight', 'steel'],
    redSwordsman: ['knight', 'crimson'], swordEmperor: ['knight', 'gold'],
    yellowKnight: ['knight', 'brass'], redKnight: ['knight', 'crimson'],
    darkKnight: ['knight', 'dark'], blueKnight: ['knight', 'azure'],
    greenKnight: ['knight', 'moss'],
    blackKing: ['king', 'dark'], yellowKing: ['king', 'brass'],
    greenKing: ['king', 'moss'], redKing: ['king', 'crimson'],
    whiteKing: ['king', 'white'],
    demon: ['demon', 'crimson'], demonPriest: ['demon', 'violet'],
    magicDragon: ['dragon', 'azure'], redWizardRepulse: ['mage', 'crimson'],
    octopus: ['octopus', 'violet'],
    angel: ['knight', 'white'], elemental: ['ghost', 'azure'],
    badPrincess: ['princess', 'crimson'], badFairy: ['princess', 'violet'],
    darkFairy: ['princess', 'dark'], badHero: ['hero', 'dark']
  };

  const ITEM_ART = {
    yellowKey: ['key', 'brass'], blueKey: ['key', 'azure'], redKey: ['key', 'crimson'],
    greenKey: ['key', 'moss'], steelKey: ['key', 'steel'], bigKey: ['key', 'gold'],
    redGem: ['gem', 'crimson'], blueGem: ['gem', 'azure'], greenGem: ['gem', 'moss'],
    yellowGem: ['gem', 'brass'],
    redPotion: ['potion', 'crimson'], bluePotion: ['potion', 'azure'],
    yellowPotion: ['potion', 'brass'], greenPotion: ['potion', 'moss'],
    superPotion: ['potion', 'holy'],
    sword0: ['sword', 'ash'], sword1: ['sword', 'steel'], sword2: ['sword', 'white'],
    sword3: ['sword', 'azure'], sword4: ['sword', 'gold'], sword5: ['sword', 'white'],
    shield0: ['shield', 'ash'], shield1: ['shield', 'steel'], shield2: ['shield', 'white'],
    shield3: ['shield', 'azure'], shield4: ['shield', 'gold'], shield5: ['shield', 'white'],
    book: ['book', 'brown'], fly: ['portal', 'violet'], coin: ['coin', 'gold'],
    snow: ['snow', 'holy'], cross: ['cross', 'gold'], knife: ['sword', 'blood'],
    amulet: ['ring', 'gold'], lifeWand: ['wand', 'violet'], skill1: ['sword', 'ember'],
    wand: ['scroll', 'brown'],
    pickaxe: ['pickaxe', 'steel'], icePickaxe: ['pickaxe', 'holy'],
    bomb: ['bomb', 'ash'], centerFly: ['portal', 'violet'], centerFly3: ['portal', 'violet'],
    upFly: ['portal', 'azure'], downFly: ['portal', 'crimson'],
    earthquake: ['scroll', 'brown'], poisonWine: ['potion', 'moss'],
    weakWine: ['potion', 'azure'], curseWine: ['potion', 'dark'],
    superWine: ['potion', 'white'], hammer: ['hammer', 'gold'],
    jumpShoes: ['boots', 'brown'], shoes: ['boots', 'steel'], moneyPocket: ['pack', 'brown'],
    pack: ['pack', 'brown']
  };

  const NPC_ART = {
    oldman: ['oldman', 'brown'], trader: ['trader', 'brass'], specialTrader: ['trader', 'gold'],
    thief: ['hero', 'thief'], king: ['king', 'gold'], princess: ['princess', 'white'],
    child: ['child', 'moss'], wood: ['altar', 'brown'],
    magician: ['mage', 'violet'], womanMagician: ['mage', 'white'],
    blueShop: ['altar', 'azure'], pinkShop: ['altar', 'crimson'],
    npc0: ['oldman', 'brown'], npc1: ['trader', 'brass'], npc2: ['child', 'moss'],
    npc3: ['mage', 'violet'], npc4: ['knight', 'steel']
  };

  const TILE_ART = {
    star: ['star', 'brass'], switch: ['switch', 'steel'], fire: ['fire', 'ember'],
    portal: ['portal', 'violet'], starPortal: ['portal', 'gold'],
    upPortal: ['portal', 'azure'], leftPortal: ['portal', 'violet'],
    downPortal: ['portal', 'crimson'], rightPortal: ['portal', 'violet'],
    crystalUp: ['gem', 'azure'], crystalBottom: ['gem', 'azure']
  };

  const defs = document.getElementById('sprite-defs');
  const host = defs ? (defs.querySelector('defs') || defs) : null;
  const made = new Map();

  function rowsOf(name) {
    const rows = ART[name] || ART.relic;
    return rows.map(row => (row + '............').slice(0, 12));
  }

  function build(key, art, paletteName) {
    const palette = palettes[paletteName] || palettes.steel;
    const rows = rowsOf(art);
    let body = '';
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      let x = 0;
      while (x < row.length) {
        const ch = row[x];
        const color = palette[ch];
        if (!color) { x += 1; continue; }
        let run = 1;
        while (x + run < row.length && row[x + run] === ch) run += 1;
        body += `<rect x="${x * 2}" y="${y * 2}" width="${run * 2}" height="2" fill="${color}"/>`;
        x += run;
      }
    }
    return `<symbol id="${key}" viewBox="0 0 24 24" shape-rendering="crispEdges"><g>${body}</g></symbol>`;
  }

  function ensure(key, art, paletteName) {
    if (!host) return false;
    if (made.has(key)) return true;
    host.insertAdjacentHTML('beforeend', build(key, art, paletteName));
    made.set(key, true);
    return true;
  }

  function use(art, paletteName, cls) {
    if (!ART[art]) return '';
    const key = `sp-${art}-${paletteName}`;
    if (!ensure(key, art, paletteName)) return '';
    return `<svg class="glyph pixel-sprite ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true"><use href="#${key}"/></svg>`;
  }

  function pick(table, id, fallback) {
    const pair = table[id] || fallback;
    if (!pair) return '';
    return use(pair[0], pair[1]);
  }

  // 按造型 + 配色直接取用（图标、手册、结局都走这里）。
  function art(name, paletteName, cls) {
    return use(name, paletteName || 'steel', cls);
  }

  const enemySvg = (id, fallback) => pick(ENEMY_ART, id, fallback || ['ghost', 'ash']);
  const itemSvg = (id) => pick(ITEM_ART, id, ['relic', 'steel']);
  const npcSvg = (id) => pick(NPC_ART, id, ['oldman', 'brown']);
  const tileSvg = (id) => pick(TILE_ART, id, null);

  // 页面里静态写着的 <use href="#sp-hero-hero"> 之类，在脚本加载时补齐 symbol。
  function ensureFromDom() {
    if (!host || typeof document === 'undefined') return;
    document.querySelectorAll('use[href^="#sp-"]').forEach((node) => {
      const id = node.getAttribute('href').slice(1);
      const m = /^sp-([a-z]+)-([a-z]+)$/.exec(id);
      if (m && ART[m[1]] && palettes[m[2]]) ensure(id, m[1], m[2]);
    });
  }
  ensureFromDom();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureFromDom);

  window.MotaSprites = {
    use, art, enemySvg, itemSvg, npcSvg, tileSvg,
    palettes, ENEMY_ART, ITEM_ART, NPC_ART, ART
  };
})();
