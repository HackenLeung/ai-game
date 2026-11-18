'use strict';
// 从 .cache/h5mota51 的工程文件生成 games/mota/h5data/*.js
// 用法：node games/mota/tools/port-h5mota.cjs
// 需要先运行 .cache/harvest-h5mota.cjs 采集参考数据（不会提交到仓库）。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.resolve(ROOT, '../../.cache/h5mota51');
const OUT = path.resolve(ROOT, 'h5data');

function loadVar(file) {
  const text = fs.readFileSync(path.join(SRC, file), 'utf8');
  const body = text.slice(text.indexOf('=') + 1).trim().replace(/;\s*$/, '');
  return vm.runInNewContext('(' + body + ')');
}

const rawMaps = loadVar('project/maps.js');
const rawEnemys = loadVar('project/enemys.js');
const rawItems = loadVar('project/items.js');
const rawIcons = loadVar('project/icons.js');
const rawData = loadVar('project/data.js');
const rawCommon = loadVar('project/events.js').commonEvent;

const floors = {};
const floorIds = rawData.main.floorIds;
for (const id of floorIds) {
  const ctx = { main: { floors: {} } };
  vm.runInNewContext(fs.readFileSync(path.join(SRC, `project/floors/${id}.js`), 'utf8'), ctx);
  floors[id] = ctx.main.floors[id];
}

const num = v => (v == null ? 0 : Number(v));
const isNum = v => v === '' || typeof v === 'number' || /^-?\d+(?:\.\d+)?$/.test(String(v).trim()) || String(v).trim().startsWith('0x');

// ---------- 图块表 ----------
const tiles = {
  0: { kind: 'floor', cls: 'terrains', id: 'none', noPass: false, name: '地面' },
  17: { kind: 'wall', cls: 'terrains', id: 'airwall', noPass: true, name: '空气墙', invisible: true }
};
const byId = {};
for (const [number, info] of Object.entries(rawMaps)) {
  const n = Number(number);
  const cls = info.cls || 'terrains';
  let kind = 'terrain';
  let noPass = info.noPass != null ? !!info.noPass : (info.canPass != null ? !info.canPass : cls !== 'items');
  if (cls === 'enemys' || cls === 'enemy48') kind = 'enemy';
  else if (cls === 'items') kind = 'item';
  else if (cls === 'npcs' || cls === 'npc48') kind = 'npc';
  else if (cls === 'animates') {
    if (info.doorInfo && /Door$/.test(info.id)) kind = 'door';
    else if (info.id === 'yellowWall') kind = 'wall';
    else if ((info.id || '').indexOf('fakeWall') === 0) kind = 'fakeWall';
    else if (info.id === 'unbreakableWall') kind = 'wall';
    else kind = 'animate';
  } else if (cls === 'autotile') kind = 'wall';
  else if (info.id === 'upFloor' || info.id === 'downFloor') kind = 'stair';

  const tile = {
    kind,
    cls,
    id: info.id,
    noPass,
    name: info.name || '',
    animate: info.animate || 0
  };
  if (info.doorInfo) tile.keys = info.doorInfo.keys || {};
  if (info.canBreak != null) tile.canBreak = !!info.canBreak;
  if (info.id === 'unbreakableWall') { tile.unbreakable = true; tile.noPass = true; }
  if (info.trigger) tile.trigger = info.trigger;
  if (info.cannotOut) tile.cannotOut = info.cannotOut;
  if (info.cannotIn) tile.cannotIn = info.cannotIn;
  if (info.event) tile.hasEvent = true;
  if (info.script) tile.script = true;
  if (info.outEvent) tile.hasOutEvent = true;
  if (info.id === 'upFloor' || info.id === 'downFloor') tile.noPass = false;
  // 渲染提示：原工程用插件把这几类图块画成看不见 / 画成普通黄墙
  if (['airwall', 'whiteWall2', 'flower', 'fire'].indexOf(info.id) >= 0) tile.invisible = true;
  if (info.id === 'unbreakableWall') tile.visual = 'yellowWall';
  // 默认触发器：怪物战斗、道具拾取（对齐 h5mota maps._addInfo）
  if (kind === 'enemy' && !tile.trigger) tile.trigger = 'battle';
  if (kind === 'item' && !tile.trigger) tile.trigger = 'getItem';
  if (kind === 'fakeWall' && !tile.trigger) tile.trigger = 'openDoor';
  tiles[n] = tile;
  if (info.id) {
    (byId[info.id] = byId[info.id] || []).push(n);
  }
}
const idToNumber = {};
for (const [id, list] of Object.entries(byId)) idToNumber[id] = list[0];
// 第二遍：图块自带的碰触事件 / 离开事件（规范化动作），解析 ID 需要 idToNumber
for (const [number, info] of Object.entries(rawMaps)) {
  const n = Number(number);
  const tile = tiles[n];
  if (!tile) continue;
  if (tile.hasEvent) {
    delete tile.hasEvent;
    const actions = normList(info.event);
    if (actions.length) tile.event = actions;
  }
  if (tile.hasOutEvent) {
    delete tile.hasOutEvent;
    const actions = normList(info.outEvent);
    if (actions.length) tile.outEvent = actions;
  }
}

function resolveNumber(value) {
  if (value == null) return 0;
  const s = String(value).trim();
  if (isNum(s)) return Number(s);
  if (idToNumber[s] != null) return idToNumber[s];
  return 0;
}

// ---------- 怪物表 ----------
const enemys = {};
for (const [id, e] of Object.entries(rawEnemys)) {
  enemys[id] = {
    id,
    name: e.name,
    hp: num(e.hp),
    atk: num(e.atk),
    def: num(e.def),
    money: num(e.money),
    exp: num(e.exp != null ? e.exp : e.experience),
    special: e.special == null ? 0 : e.special,
    notBomb: e.notBomb === false ? false : (e.bomb === false ? false : true)
  };
  if (e.value != null) enemys[id].value = e.value;
  if (e.range != null) enemys[id].range = e.range;
  if (e.zoneSquare != null) enemys[id].zoneSquare = e.zoneSquare;
  if (e.n != null) enemys[id].n = e.n;
  if (e.atkValue != null) enemys[id].atkValue = e.atkValue;
  if (e.defValue != null) enemys[id].defValue = e.defValue;
  if (e.bigImage) enemys[id].bigImage = e.bigImage;
}

// ---------- 道具表 ----------
const items = {};
for (const [id, it] of Object.entries(rawItems)) {
  items[id] = {
    id,
    name: it.name || id,
    text: (it.text || '').replace(/\$\{[^}]*\}/g, '…'),
    cls: it.cls || 'items'
  };
}

// ---------- 事件动作规整 ----------
function resolveTalkFunc(code) {
  if (/core\.setFlag\(f, true\)/.test(code)) return { type: 'recordTalk' };
  if (/core\.setFlag\(name, 1\)/.test(code)) return { type: 'recordTrader' };
  if (/区购买hp/.test(code)) return { type: 'recordShop', kind: 'hp' };
  if (/区购买atk/.test(code)) return { type: 'recordShop', kind: 'atk' };
  if (/区购买def/.test(code)) return { type: 'recordShop', kind: 'def' };
  const zero = code.match(/core\.status\.hero\.hp = 0;\s*core\.afterBattle\('([^']+)'/);
  if (zero) return { type: 'zeroHpBattle', enemy: zero[1] };
  return null;
}

function normList(list) {
  if (!list) return [];
  const arr = Array.isArray(list) ? list : [list];
  const out = [];
  for (const a of arr) {
    const one = normAction(a);
    if (one) out.push(one);
  }
  return out;
}

function normAction(a) {
  if (a == null) return null;
  if (typeof a === 'string') return a;
  if (Array.isArray(a)) return normList(a);
  const t = a.type;
  if (!t || t === 'comment') return null;
  const out = { type: t };
  switch (t) {
    case 'setValue':
      out.name = a.name;
      out.value = a.value == null ? 0 : a.value;
      if (a.operator && a.operator !== 'set') out.operator = a.operator;
      return out;
    case 'if':
      out.condition = a.condition;
      out.true = normList(a.true);
      out.false = normList(a.false);
      return out;
    case 'switch':
      out.condition = a.condition;
      out.caseList = (a.caseList || []).map(c => ({ case: c.case, action: normList(c.action) }));
      return out;
    case 'choices':
      out.text = a.text || '';
      out.choices = (a.choices || []).map(c => {
        const one = { text: c.text == null ? '' : c.text, action: normList(c.action) };
        if (c.condition) one.condition = c.condition;
        return one;
      });
      return out;
    case 'while':
      out.condition = a.condition;
      out.data = normList(a.data);
      return out;
    case 'break':
      out.n = a.n || 1;
      return out;
    case 'exit':
      return out;
    case 'insert':
      out.name = a.name;
      out.args = a.args || [];
      return out;
    case 'hide':
      out.loc = a.loc;
      if (a.floorId) out.floorId = a.floorId;
      if (a.remove) out.remove = true;
      return out;
    case 'show':
      out.loc = a.loc;
      if (a.floorId) out.floorId = a.floorId;
      return out;
    case 'setBlock':
      out.number = resolveNumber(a.number);
      out.loc = a.loc;
      if (a.floorId) out.floorId = a.floorId;
      return out;
    case 'openDoor':
      out.loc = a.loc;
      return out;
    case 'closeDoor':
      out.id = a.id || 'yellowWall';
      out.number = resolveNumber(out.id);
      out.loc = a.loc;
      return out;
    case 'setEnemy':
      out.id = a.id;
      out.name = a.name;
      out.operator = a.operator || 'set';
      out.value = a.value;
      return out;
    case 'for':
      out.name = a.name;
      out.from = a.from;
      out.to = a.to;
      out.step = a.step || 1;
      out.data = normList(a.data);
      return out;
    case 'tip':
      out.text = a.text || '';
      return out;
    case 'playSound':
      out.name = a.name || '';
      return out;
    case 'win':
      out.reason = a.reason || '';
      return out;
    case 'function': {
      const converted = resolveTalkFunc(String(a.function || ''));
      return converted;
    }
    case 'waitAsync':
    case 'sleep':
    case 'update':
    case 'move':
    case 'setText':
    case 'previewUI':
    case 'clearMap':
    case 'setAttribute':
    case 'drawSelector':
    case 'fillRect':
    case 'setCurtain':
    case 'playBgm':
    case 'generateMove':
    case 'setBgFgBlock':
      return null;
    case 'battle':
      out.id = a.id;
      out.x = a.x; out.y = a.y;
      return out;
    case 'changeFloor':
      out.floorId = a.floorId; out.stair = a.stair; out.loc = a.loc;
      return out;
    case 'moveHero':
      out.steps = (a.steps || []).map(String);
      return out;
    case 'jumpHero':
      return null;
    default:
      process.stderr.write(`[port] 未知动作类型 ${t}，已丢弃\n`);
      return null;
  }
}

// ---------- 楼层 ----------
function resolveFloorId(id) {
  if (id === ':next') return null; // 调用方按 order 处理
  return id;
}
const outFloors = {};
for (let i = 0; i < floorIds.length; i++) {
  const id = floorIds[i];
  const f = floors[id];
  const stairs = {};
  for (const [loc, info] of Object.entries(f.changeFloor || {})) {
    let to = info.floorId;
    if (to === ':next') to = floorIds[i + 1] || null;
    else if (to === ':before') to = floorIds[i - 1] || null;
    if (!to) continue;
    stairs[loc] = { to, stair: info.stair || 'upFloor' };
  }
  const events = {};
  for (const [loc, evRaw] of Object.entries(f.events || {})) {
    const ev = typeof evRaw === 'string' || Array.isArray(evRaw) ? { data: evRaw } : evRaw;
    events[loc] = {
      data: normList(ev.data),
      trigger: ev.trigger || 'action',
      enable: ev.enable !== false
    };
  }
  const afterBattle = {};
  for (const [loc, list] of Object.entries(f.afterBattle || {})) afterBattle[loc] = normList(list);
  const afterGetItem = {};
  for (const [loc, list] of Object.entries(f.afterGetItem || {})) afterGetItem[loc] = normList(list);
  const afterOpenDoor = {};
  for (const [loc, list] of Object.entries(f.afterOpenDoor || {})) afterOpenDoor[loc] = normList(list);
  const beforeBattle = {};
  for (const [loc, list] of Object.entries(f.beforeBattle || {})) beforeBattle[loc] = normList(list);
  const autoEvent = {};
  for (const [loc, group] of Object.entries(f.autoEvent || {})) {
    autoEvent[loc] = {};
    for (const [key, one] of Object.entries(group || {})) {
      if (!one) continue;
      autoEvent[loc][key] = {
        condition: one.condition,
        data: normList(one.data),
        priority: one.priority || 0,
        currentFloor: one.currentFloor !== false,
        delayExecute: !!one.delayExecute,
        multiExecute: !!one.multiExecute
      };
    }
  }
  let firstArrive = normList(f.firstArrive);
  if (id === 'MT1') firstArrive = normList(f.firstArrive);
  if (id === 'MT50') {
    // 结局榜单选择改为本地成绩单：保留开头对话 + 两个 setValue，再直接 win
    firstArrive = [];
  }
  outFloors[id] = {
    id,
    n: i,
    name: f.name || id,
    title: f.title || '',
    ratio: f.ratio == null ? 1 : f.ratio,
    width: f.width || 13,
    height: f.height || 13,
    map: (f.map || []).map(row => row.map(num)),
    upFloor: f.upFloor || null,
    downFloor: f.downFloor || null,
    canFlyTo: f.canFlyTo !== false,
    canFlyFrom: f.canFlyFrom !== false,
    bgm: f.bgm || '',
    stairs,
    events,
    firstArrive,
    eachArrive: normList(f.eachArrive),
    afterBattle,
    afterGetItem,
    afterOpenDoor,
    beforeBattle,
    autoEvent
  };
}
// ---------- 数据兼容修正 ----------
// MT10：原工程把战后剧情挂在 "6,1"（顶层走廊，实际不可达），而骷髅队长站在 (6,4)。
// 不修正的话，打死队长后 (6,7) 的机关门不会打开，玩家会被困死在埋伏房间里。
// 按 flash 版行为，把这段战后剧情挂到队长真正的坐标上。
if (outFloors.MT10 && outFloors.MT10.afterBattle['6,1']) {
  outFloors.MT10.afterBattle['6,4'] = outFloors.MT10.afterBattle['6,1'];
}
// MT50 专属：结局事件
outFloors.MT50.afterBattle['6,5'] = [
  '祝贺你顺利过关，此游戏为本人的第一个falsh作品。制作的比较简陋请谅解，再次谢谢你的使用。',
  { type: 'setValue', name: 'flag:versionType', value: 'flag:开启特性 ? "特性版" : "纯净版"' },
  { type: 'setValue', name: 'flag:endingType', value: 'flag:TE ? "TE" : "NE"' },
  { type: 'win', reason: '${flag:versionType}-${flag:endingType}' }
];

// ---------- 公共事件 ----------
const commonEvents = {};
for (const [name, list] of Object.entries(rawCommon)) {
  if (name === '游戏说明') continue; // 改为 UI 帮助页
  commonEvents[name] = normList(list);
}

// ---------- 输出 ----------
function writeModule(file, value, exportName) {
  const json = JSON.stringify(value, null, 0);
  const code = `(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else (root.H5Data = root.H5Data || {}).${exportName} = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return ${json};
});
`;
  fs.writeFileSync(path.join(OUT, file), code, 'utf8');
  return code.length;
}

fs.mkdirSync(OUT, { recursive: true });
const sizes = {};
sizes.tiles = writeModule('tiles.js', { tiles, idToNumber }, 'tiles');
sizes.enemys = writeModule('enemys.js', enemys, 'enemys');
sizes.items = writeModule('items.js', items, 'items');
sizes.floors = writeModule('floors.js', { floorIds, floors: outFloors, startFloor: 'MT1' }, 'floors');
sizes.common = writeModule('commonEvents.js', commonEvents, 'commonEvents');
// 图块名字反查（怪物/道具/门的 id → 数字），供运行时 setBlock 用
console.log('生成完成：', sizes);
console.log('楼层', Object.keys(outFloors).length, '事件总数',
  Object.values(outFloors).reduce((n, f) => n + Object.keys(f.events).length, 0),
  '公共事件', Object.keys(commonEvents).join('/'));
