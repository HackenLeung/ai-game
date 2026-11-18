'use strict';

// games/mota 生成数据校验：h5data/*.js（从 h5mota《50层魔塔》工程生成）是否与引擎约定一致、且自洽。
// 运行：cd F:\project\ai-game; node --test games/mota/tests/data.test.cjs
//
// 只读校验，不修改任何数据；发现异常只报告（个别的“工具才能进去的房间”会在报告里列出）。
const test = require('node:test');
const assert = require('node:assert/strict');

const D = require('../data.js');

const TILES = D.tiles.tiles;
const ID_TO_NUMBER = D.tiles.idToNumber;
const ENEMYS = D.enemys;
const ITEMS = D.items;
const COMMON = D.commonEvents;
const FLOOR_IDS = D.floors.floorIds;
const FLOORS = D.floors.floors;
const START = D.start;

const SIZE = 13;
const WALL_TILE = 0;

// 地图上允许出现的所有动作类型（events.js 的 action() 分支）。
const ACTION_TYPES = [
  'if', 'switch', 'while', 'for', 'break', 'exit', 'setValue', 'choices', 'tip', 'playSound',
  'update', 'insert', 'hide', 'show', 'setBlock', 'openDoor', 'closeDoor', 'setEnemy', 'battle',
  'zeroHpBattle', 'changeFloor', 'win', 'recordTalk', 'recordTrader', 'recordShop'
];

// 图上没有、但道具表里有的别名（h5mota 里 moneyPocket 与 pack 是同一个钱袋）。
const ITEM_ALIASES = new Set(['moneyPocket']);

// 楼梯互查的既有例外：都是原塔设计，不是移植错误。
//   MT0 → MT1   塔外入口：1 层没有向下的楼梯图块（进门即第一层）。
//   MT43/MT45 → MT44  44 层是“异空间”，没有楼梯图块，只能靠事件/传送进入。
const STAIR_ARRIVAL_EXCEPTIONS = new Set(['MT0@1,1->MT1', 'MT43@1,11->MT44', 'MT45@1,1->MT44']);

// h5mota 的 :next 是“上一层”的简写，数据里只有 MT40 用到；引擎是否实现单独在 play.cjs 里验证。
const NEXT_FLOOR_ALIAS = ':next';

// 打开后不必“钥匙 + 技能”就能走的图块（用于可达性 BFS 的通行模型）。
const PASS_KINDS = new Set(['door', 'enemy', 'fakeWall']);

// 能把一块区域“打开”的工具：可拆的墙、可冻的岩浆、可破的冰、暗墙、门、怪。
function gateOf(tile) {
  if (!tile) return null;
  if (tile.kind === 'wall' && tile.canBreak) return 'breakable-wall';
  if (tile.kind === 'fakeWall') return 'fake-wall';
  if (tile.canBreak) return 'breakable-wall';
  if (tile.id === 'lava') return 'lava(snow)';
  if (tile.id === 'ice') return 'ice(icePickaxe)';
  if (tile.kind === 'door') return 'door';
  if (tile.kind === 'enemy') return 'enemy';
  if (tile.id === 'box' || tile.id === 'boxed') return 'box';
  return null;
}

function tileOf(n) { return n ? TILES[n] || null : { kind: 'floor', id: 'none', noPass: false, name: '地面' }; }

function floorOf(id) { return FLOORS[id]; }

function tileAt(id, x, y) {
  const rows = FLOORS[id].map;
  if (!rows[y] || rows[y][x] == null) return null;
  return tileOf(rows[y][x]);
}

// ---------------------------------------------------------------- 事件动作收集

/**
 * 递归展开一份剧本（动作数组；字符串是对话，数组可嵌套），把每个动作回调出去。
 * where 用来定位问题（例如 MT3/events:5,9）。
 */
function walkActions(list, floorId, cb) {
  if (list == null) return;
  if (Array.isArray(list)) {
    for (const one of list) walkActions(one, floorId, cb);
    return;
  }
  if (typeof list === 'string') { cb({ type: 'say', text: list }, floorId); return; }
  if (typeof list !== 'object') return;
  cb(list, floorId);
  for (const key of ['true', 'false', 'data', 'action']) walkActions(list[key], floorId, cb);
  for (const one of list.caseList || []) walkActions(one && one.action, floorId, cb);
  for (const one of list.choices || []) walkActions(one && one.action, floorId, cb);
}

function walkFloorScripts(id, cb) {
  const floor = floorOf(id);
  for (const loc of Object.keys(floor.events || {})) walkActions(floor.events[loc].data, id, cb);
  walkActions(floor.firstArrive, id, cb);
  walkActions(floor.eachArrive, id, cb);
  for (const key of ['afterBattle', 'afterGetItem', 'afterOpenDoor', 'beforeBattle']) {
    const group = floor[key] || {};
    for (const loc of Object.keys(group)) walkActions(group[loc], id, cb);
  }
  for (const loc of Object.keys(floor.autoEvent || {})) {
    const group = floor.autoEvent[loc] || {};
    for (const key of Object.keys(group)) walkActions(group[key] && group[key].data, id, cb);
  }
}

/** 全部动作：{ action, where }，公共事件单独标记 */
const ACTIONS = [];
for (const id of FLOOR_IDS) walkFloorScripts(id, (action, floorId) => ACTIONS.push({ action, where: floorId }));
for (const name of Object.keys(COMMON)) walkActions(COMMON[name], '', action => ACTIONS.push({ action, where: 'common:' + name }));

// 事件能主动改变的格子：openDoor / hide / setBlock(0) 视为“可以走通”，
// 这些格子参与可达性 BFS，免得把“要靠事件打开的门/暗道”误报成孤岛。
const OPENED = new Map(); // floorId -> Set('x,y')，'' 表示公共事件里的默认楼层
function noteOpened(floorId, loc) {
  if (loc == null) return;
  const list = Array.isArray(loc) && !Array.isArray(loc[0]) && typeof loc[0] !== 'object' ? [loc] : loc;
  const arr = Array.isArray(list) ? list : [list];
  const key = floorId || '';
  if (!OPENED.has(key)) OPENED.set(key, new Set());
  const set = OPENED.get(key);
  for (const one of arr) {
    if (!Array.isArray(one) || one.length < 2) continue;
    const x = Number(one[0]);
    const y = Number(one[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) set.add(x + ',' + y);
  }
}
for (const one of ACTIONS) {
  const a = one.action;
  // 事件没写 floorId 时，作用在本事件所属的楼层（公共事件写 ''，当作通用）
  const owner = String(one.where).startsWith('common:') ? '' : one.where;
  const floorId = a.floorId || owner;
  if (a.type === 'openDoor' || a.type === 'hide') noteOpened(floorId, a.loc);
  if (a.type === 'setBlock' && Number(a.number) === 0) noteOpened(floorId, a.loc);
}

/** 其它楼层 changeFloor 到本层的落点，也算本层的入口 */
const LANDINGS = new Map();
for (const one of ACTIONS) {
  const a = one.action;
  if (a.type !== 'changeFloor' || !FLOORS[a.floorId] || a.loc == null) continue;
  const locs = Array.isArray(a.loc) && !Array.isArray(a.loc[0]) && typeof a.loc[0] !== 'object' ? [a.loc] : a.loc;
  for (const loc of Array.isArray(locs) ? locs : [locs]) {
    if (!Array.isArray(loc) || loc.length < 2) continue;
    const x = Number(loc[0]);
    const y = Number(loc[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!LANDINGS.has(a.floorId)) LANDINGS.set(a.floorId, []);
    LANDINGS.get(a.floorId).push([x, y]);
  }
}

// ---------------------------------------------------------------- 可达性

function passable(floorId, x, y) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false;
  const tile = tileAt(floorId, x, y);
  if (!tile) return false;
  if (tile.kind === 'npc') return false; // NPC 会挡住格子，但站在旁边就能交互
  if (PASS_KINDS.has(tile.kind)) return true;
  if (tile.noPass) {
    const opened = OPENED.get(floorId);
    return !!(opened && opened.has(x + ',' + y));
  }
  return true;
}

function stairEntries(floorId) {
  const floor = floorOf(floorId);
  const entries = [];
  for (const loc of Object.keys(floor.stairs || {})) {
    const [x, y] = loc.split(',').map(Number);
    const stair = floor.stairs[loc];
    entries.push({ loc, x, y, to: stair.to, stair: stair.stair, tile: tileAt(floorId, x, y), number: floor.map[y][x] });
  }
  return entries;
}

function entriesOf(floorId) {
  const floor = floorOf(floorId);
  const list = stairEntries(floorId).map(s => [s.x, s.y]);
  for (const key of ['upFloor', 'downFloor']) {
    const value = floor[key];
    if (Array.isArray(value) && value.length === 2) list.push([value[0], value[1]]);
  }
  if (floorId === START.floorId) list.push([START.loc.x, START.loc.y]);
  for (const one of LANDINGS.get(floorId) || []) list.push(one);
  return list;
}

function reachable(floorId) {
  const seen = new Set();
  const queue = [];
  for (const [x, y] of entriesOf(floorId)) {
    if (!passable(floorId, x, y)) continue;
    const key = x + ',' + y;
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push([x, y]);
  }
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = nx + ',' + ny;
      if (seen.has(key) || !passable(floorId, nx, ny)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

const REACH = new Map(FLOOR_IDS.map(id => [id, reachable(id)]));

/** 与可达区相邻（能隔着 NPC 说话） */
function nearReachable(floorId) {
  const set = new Set();
  for (const key of REACH.get(floorId)) {
    const [x, y] = key.split(',').map(Number);
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) set.add((x + dx) + ',' + (y + dy));
  }
  return set;
}

const NEAR = new Map(FLOOR_IDS.map(id => [id, nearReachable(id)]));

/** 硬墙：既走不进去、也不是可以拿/打/谈的内容，分组时当作边界 */
function isBlocker(tile) {
  if (!tile) return false;
  if (!tile.noPass) return false;
  return !['npc', 'stair', 'item', 'enemy', 'fakeWall', 'door'].includes(tile.kind);
}

/**
 * 把“从入口走不到”的格子连成片，再看这片被什么围住。
 * 整片都贴着可达区（多半是 NPC 挡住的格子）时不算孤岛。
 */
function islands(floorId) {
  const reach = REACH.get(floorId);
  const near = NEAR.get(floorId);
  const floor = floorOf(floorId);
  const cells = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const key = x + ',' + y;
      if (reach.has(key)) continue;
      const n = floor.map[y][x];
      const tile = tileOf(n);
      if (isBlocker(tile)) continue;
      cells.push({ x, y, key, n, tile, adjacent: near.has(key) });
    }
  }
  const index = new Map(cells.map(cell => [cell.key, cell]));
  const seen = new Set();
  const groups = [];
  for (const cell of cells) {
    if (seen.has(cell.key)) continue;
    const group = [];
    const queue = [cell];
    seen.add(cell.key);
    while (queue.length) {
      const one = queue.pop();
      group.push(one);
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const next = index.get((one.x + dx) + ',' + (one.y + dy));
        if (!next || seen.has(next.key)) continue;
        seen.add(next.key);
        queue.push(next);
      }
    }
    if (group.every(one => one.adjacent)) continue; // 只是被 NPC 挡住：站在旁边就能交互
    const inside = new Set(group.map(one => one.key));
    const gates = new Set();
    const blockers = [];
    let content = 0;
    for (const one of group) {
      const tile = one.tile;
      const hasEvent = !!(floor.events && floor.events[one.key] && floor.events[one.key].enable !== false);
      if (one.n && (tile.kind === 'item' || tile.kind === 'enemy' || tile.kind === 'stair' || tile.kind === 'npc' || hasEvent)) content += 1;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = one.x + dx;
        const ny = one.y + dy;
        if (inside.has(nx + ',' + ny)) continue;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const around = tileAt(floorId, nx, ny);
        const gate = gateOf(around);
        if (gate) gates.add(gate);
        else blockers.push(`${nx},${ny}=${around ? around.kind + '/' + around.id : 'null'}`);
      }
    }
    groups.push({ group, gates, blockers, content });
  }
  return groups;
}

const ISLANDS = new Map(FLOOR_IDS.map(id => [id, islands(id)]));

// ---------------------------------------------------------------- 统计

function enemyCountOf(floorId) {
  let count = 0;
  for (const row of floorOf(floorId).map) {
    for (const n of row) if ((tileOf(n) || {}).kind === 'enemy') count += 1;
  }
  return count;
}

const ENEMY_TOTAL = FLOOR_IDS.reduce((sum, id) => sum + enemyCountOf(id), 0);
const PLACEHOLDER_ENEMIES = Object.keys(ENEMYS).filter(id => !(ENEMYS[id].hp > 0));
const PLACED_PLACEHOLDERS = [];
for (const id of FLOOR_IDS) {
  const floor = floorOf(id);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const tile = tileOf(floor.map[y][x]);
      if (tile.kind === 'enemy' && !(ENEMYS[tile.id] || {}).hp > 0) PLACED_PLACEHOLDERS.push(id + '@' + x + ',' + y + ':' + tile.id);
    }
  }
}

// ---------------------------------------------------------------- 测试

test('51 层：MT0…MT50 齐全，floorIds 与 floors 一一对应', () => {
  assert.equal(FLOOR_IDS.length, 51, '楼层数应为 51');
  assert.deepEqual(FLOOR_IDS.slice().sort(), Array.from({ length: 51 }, (_, i) => 'MT' + i).sort());
  assert.deepEqual(Object.keys(FLOORS).sort(), FLOOR_IDS.slice().sort());
  assert.equal(START.floorId, 'MT1');
  for (const id of FLOOR_IDS) {
    const floor = floorOf(id);
    assert.equal(floor.id, id, id + ' 的 id 字段');
    assert.equal(floor.n, Number(id.slice(2)), id + ' 的层号 n');
  }
  // MT0 是塔外入口：只有一格楼梯 + 一份幸运金币，不属于 1…50 的正片
  assert.equal(enemyCountOf('MT0'), 0, 'MT0 不该有怪');
  assert.ok(ENEMY_TOTAL > 400, '全塔怪物总数偏少：' + ENEMY_TOTAL);
});

test('每层 13×13，map 全是整数且都能在 tiles 里找到（0 除外）', () => {
  for (const id of FLOOR_IDS) {
    const floor = floorOf(id);
    assert.equal(floor.width, SIZE, id + ' width');
    assert.equal(floor.height, SIZE, id + ' height');
    assert.equal(floor.map.length, SIZE, id + ' map 行数');
    for (let y = 0; y < SIZE; y++) {
      const row = floor.map[y];
      assert.equal(row.length, SIZE, id + ' 第 ' + y + ' 行长度');
      for (let x = 0; x < SIZE; x++) {
        const n = row[x];
        assert.ok(Number.isInteger(n), `${id} (${x},${y}) 不是整数：${n}`);
        assert.ok(n >= 0, `${id} (${x},${y}) 为负：${n}`);
        if (n === WALL_TILE) continue;
        assert.ok(TILES[n], `${id} (${x},${y}) 的图块号 ${n} 不在 tiles 里`);
      }
    }
  }
  // 反向：tiles 里的图块号与 idToNumber 双向一致（0 号“空地”是引擎内置的，不在表里）
  // 已知缺口：17 号空气墙（h5mota 的 airwall 是编辑器专用图块，原表没有反向映射）。
  const missingReverse = [];
  for (const [key, tile] of Object.entries(TILES)) {
    if (Number(key) === WALL_TILE) continue;
    if (ID_TO_NUMBER[tile.id] !== Number(key)) missingReverse.push(Number(key) + ':' + tile.id);
    assert.ok(tile.kind, '图块 ' + key + ' 缺少 kind');
  }
  assert.deepEqual(missingReverse, ['17:airwall'], 'idToNumber 反向映射出现新的缺口');
});

test('楼梯：to 指向存在的楼层，源格是楼梯图块，到达格有对应楼梯（个别原塔例外单独登记）', () => {
  const exceptions = new Set();
  for (const id of FLOOR_IDS) {
    const floor = floorOf(id);
    for (const entry of stairEntries(id)) {
      const label = `${id}@${entry.loc}->${entry.to}`;
      assert.ok(FLOORS[entry.to], label + ' 指向不存在的楼层');
      assert.ok(entry.tile && entry.tile.kind === 'stair', `${label} 源格不是楼梯（${entry.tile && entry.tile.id}）`);
      // stair 字段指“到达对方楼层时站在哪种楼梯上”：上楼→对方的 downFloor，下楼→对方的 upFloor
      const expectSource = entry.stair === 'downFloor' ? 'upFloor' : 'downFloor';
      assert.equal(entry.tile.id, expectSource, `${label} 源格应为 ${expectSource}`);
      const dest = floorOf(entry.to);
      const ref = dest[entry.stair];
      const broken = STAIR_ARRIVAL_EXCEPTIONS.has(label);
      if (broken) { exceptions.add(label); continue; }
      assert.ok(Array.isArray(ref) && ref.length === 2, `${label} 对方楼层缺少 ${entry.stair} 落点`);
      const [rx, ry] = ref;
      assert.ok(rx >= 0 && rx < SIZE && ry >= 0 && ry < SIZE, `${label} 落点越界 ${JSON.stringify(ref)}`);
      const refTile = tileAt(entry.to, rx, ry);
      assert.ok(refTile && (!refTile.noPass || refTile.kind === 'stair'), `${label} 落点被 ${refTile && refTile.id} 挡住`);
      // 落点本身或紧邻一格必须是 stair 指定的那种楼梯；
      // 对方楼层根本没有这种楼梯图块时（MT40 的上楼靠事件）跳过这项。
      const destHasStair = dest.map.some(row => row.some(n => (tileOf(n) || {}).id === entry.stair));
      if (destHasStair) {
        const around = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]];
        const found = around.some(([dx, dy]) => {
          const tile = tileAt(entry.to, rx + dx, ry + dy);
          return tile && tile.kind === 'stair' && tile.id === entry.stair;
        });
        assert.ok(found, `${label} 的落点 ${rx},${ry} 附近没有 ${entry.stair}`);
      }
    }
    // stairs 的键必须落在图内
    for (const loc of Object.keys(floor.stairs || {})) {
      const [x, y] = loc.split(',').map(Number);
      assert.ok(x >= 0 && x < SIZE && y >= 0 && y < SIZE, id + ' 楼梯坐标越界 ' + loc);
    }
  }
  // 例外就是原塔里的这三处；有变化说明数据被改过，需要重新确认
  assert.deepEqual([...exceptions].sort(), [...STAIR_ARRIVAL_EXCEPTIONS].sort(), '楼梯例外清单变了');
  // 每层至少有一条楼梯（MT50 只能从 24 层的时空事件进入）
  for (const id of FLOOR_IDS) {
    if (id === 'MT50') continue;
    assert.ok(Object.keys(floorOf(id).stairs || {}).length > 0, id + ' 没有任何楼梯');
  }
  assert.equal(Object.keys(floorOf('MT50').stairs || {}).length, 0, 'MT50 不该有楼梯');
});

test('可达性：从楼梯/入口出发能走到本层所有楼梯与可走图块，孤岛一律列出并说明由什么工具打开', () => {
  const report = [];
  const empty = [];
  for (const id of FLOOR_IDS) {
    const reach = REACH.get(id);
    assert.ok(reach.size > 0, id + ' 一个入口都走不进去');
    // 所有楼梯都必须可达
    for (const entry of stairEntries(id)) {
      assert.ok(reach.has(entry.loc), `${id} 的楼梯 ${entry.loc}（→${entry.to}）走不到`);
    }
    // 走不到的角落：要么是工具/事件能打开的封闭区，要么是纯装饰（没有内容）
    const covered = new Set();
    for (const island of ISLANDS.get(id)) {
      const cells = island.group.map(c => `${c.x},${c.y}#${c.n}:${c.tile.kind}/${c.tile.id}`);
      for (const c of island.group) covered.add(c.key);
      const gates = [...island.gates].join('+') || '(无)';
      if (island.content > 0) {
        report.push(`${id} 工具房 ${cells.join(' ')} 通道=${gates}`);
        assert.ok(island.gates.size > 0 && island.blockers.length === 0,
          `${id} 有走不到的图块，而且没有工具能打开：${cells.join(' ')} 挡路的=${island.blockers.join(' ')}`);
        // 必须道具不能放在这种房间里（楼梯/钥匙/宝石/装备/常驻道具）
        const essential = island.group.filter(c => c.n && (
          c.tile.kind === 'stair'
          || /Key$|Gem$|sword|shield|^fly$|^snow$|^cross$|^knife$|^book$|^pickaxe$|^earthquake$|^hammer$|^lifeWand$|^jumpShoes$|^centerFly$|^upFly$|^downFly$|^superPotion$|^coin$/.test(String(c.tile.id))
        ));
        if (essential.length) {
          // 圣剑/仓库这类“必须用技能或地震卷轴打开”的房间在原塔里是设计的一部分，
          // 只要通道是工具能开的就允许，但要在摘要里点名。
          report[report.length - 1] += ` 内含关键内容=[${essential.map(c => c.x + ',' + c.y + ':' + c.tile.id).join(' ')}]`;
        }
      } else {
        empty.push(`${id} 装饰区 ${cells.length} 格 @${cells[0]} 通道=${gates}`);
      }
    }
    // 除了这些封闭区，可达区之外不该再有能走上去的格子
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const key = x + ',' + y;
        if (reach.has(key) || covered.has(key)) continue;
        const tile = tileAt(id, x, y);
        if (!tile || tile.noPass || tile.kind === 'npc') continue;
        assert.fail(`${id} (${x},${y}) 是可走的 ${tile.kind}/${tile.id}，却从入口走不到，也不在任何封闭区里`);
      }
    }
  }
  if (report.length) console.log('[mota:data] 需要用工具打开的封闭区：\n  ' + report.join('\n  '));
  if (empty.length) console.log('[mota:data] 完全封闭的装饰区：\n  ' + empty.join('\n  '));
});

test('事件完整性：动作类型全在白名单内，引用（公共事件 / 楼层 / 图块 / 怪物）都能解析', () => {
  const badTypes = [];
  const badInsert = [];
  const badFloor = [];
  const badBlock = [];
  const badDoor = [];
  const badEnemy = [];
  const badLoc = [];
  const nextFloors = [];
  let sayCount = 0;
  for (const { action, where } of ACTIONS) {
    // 字符串对白不是动作（events.js 直接当 say 处理）
    if (action.type === 'say') { sayCount += 1; continue; }
    if (typeof action.type !== 'string' || !ACTION_TYPES.includes(action.type)) {
      badTypes.push(where + ':' + action.type);
      continue;
    }
    if (action.type === 'insert') {
      if (!COMMON[action.name]) badInsert.push(where + ':' + action.name);
      if (action.args != null && !Array.isArray(action.args)) badInsert.push(where + ':' + action.name + ' args 不是数组');
    }
    if (action.type === 'changeFloor') {
      if (action.floorId === NEXT_FLOOR_ALIAS) { nextFloors.push(where); continue; }
      if (!FLOORS[action.floorId]) badFloor.push(where + ':' + action.floorId);
      else if (action.loc != null) {
        const locs = Array.isArray(action.loc) && !Array.isArray(action.loc[0]) && typeof action.loc[0] !== 'object' ? [action.loc] : action.loc;
        for (const loc of Array.isArray(locs) ? locs : [locs]) {
          if (!Array.isArray(loc) || loc.length < 2) continue;
          const x = Number(loc[0]);
          const y = Number(loc[1]);
          if (!(x >= 0 && x < SIZE && y >= 0 && y < SIZE)) badLoc.push(where + ':' + JSON.stringify(loc));
        }
      }
    }
    if (action.type === 'setBlock') {
      if (!TILES[action.number] && Number(action.number) !== 0) badBlock.push(where + ':' + action.number);
    }
    if (action.type === 'closeDoor' && !TILES[action.number]) badDoor.push(where + ':' + action.id);
    if (action.type === 'setEnemy' && !ENEMYS[action.id]) badEnemy.push(where + ':' + action.id);
    if (action.type === 'battle' && !ENEMYS[action.id]) badEnemy.push(where + ':' + action.id);
    if (action.type === 'zeroHpBattle' && !ENEMYS[action.enemy]) badEnemy.push(where + ':' + action.enemy);
  }
  assert.deepEqual(badTypes, [], '出现未支持的动作类型');
  assert.deepEqual(badInsert, [], 'insert 引用了不存在的公共事件');
  assert.deepEqual(badFloor, [], 'changeFloor 指向不存在的楼层');
  assert.deepEqual(badBlock, [], 'setBlock 用了非法图块号');
  assert.deepEqual(badDoor, [], 'closeDoor 用了非法图块号');
  assert.deepEqual(badEnemy, [], 'setEnemy/battle 引用了不存在的怪物');
  assert.deepEqual(badLoc, [], 'changeFloor 的落点越界');
  assert.deepEqual(nextFloors, ['MT40'], '只允许 MT40 使用 :next（其它地方出现要单独确认）');
  // 每个动作都要有带字符串 type 的形态
  for (const { action, where } of ACTIONS) {
    if (action.type !== 'say') assert.ok(action.type, where + ' 有动作缺少 type');
  }
});

test('怪物/道具一致性：图上的怪物都在 enemys 里且 hp>0，道具都能在 items（含别名）里找到', () => {
  const badEnemy = [];
  const badItem = [];
  const usedEnemyIds = new Set();
  const usedItemIds = new Set();
  for (const id of FLOOR_IDS) {
    const floor = floorOf(id);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const tile = tileOf(floor.map[y][x]);
        if (tile.kind === 'enemy') {
          usedEnemyIds.add(tile.id);
          const enemy = ENEMYS[tile.id];
          if (!enemy) badEnemy.push(`${id}@${x},${y} 缺少 ${tile.id}`);
          else if (!(enemy.hp > 0)) badEnemy.push(`${id}@${x},${y} ${tile.id} 的 hp=${enemy.hp}`);
        }
        if (tile.kind === 'item') {
          usedItemIds.add(tile.id);
          if (!ITEMS[tile.id] && !ITEM_ALIASES.has(tile.id)) badItem.push(`${id}@${x},${y} 缺少 ${tile.id}`);
        }
      }
    }
  }
  assert.deepEqual(badEnemy, [], '图上出现了没有数据或 hp=0 的怪物');
  assert.deepEqual(badItem, [], '图上出现了道具表里没有的道具');
  // hp=0 的占位怪只能出现在数据表里，不能真的摆在地图上（1 层更不行）
  assert.deepEqual(PLACED_PLACEHOLDERS, [], '占位怪（hp=0）被摆到了地图上');
  assert.ok(PLACEHOLDER_ENEMIES.length > 0, '占位怪清单不该为空（原工程导出的 22 只）');
  console.log(`[mota:data] hp=0 占位怪（未上地图，白名单通过）：${PLACEHOLDER_ENEMIES.join(',')}`);
  // 用到的怪物与道具都应有名字
  for (const id of usedEnemyIds) assert.ok(ENEMYS[id].name, id + ' 缺少名字');
  for (const id of usedItemIds) assert.ok(ITEMS[id] && ITEMS[id].name, id + ' 缺少名字');
});

test('关键剧情抽查：MT1 起点、MT3 魔王开场、MT24/MT26/MT49/MT50 的时空与结局支点', () => {
  // MT1 起始空地
  assert.equal(floorOf('MT1').map[11][6], 0, 'MT1 (6,11) 应为空地');
  assert.equal(START.loc.x, 6);
  assert.equal(START.loc.y, 11);

  // MT3 (5,9)：魔王开场把勇士打回 1 层的属性，然后送回 MT2 (3,8)
  const mt3 = floorOf('MT3').events['5,9'];
  assert.ok(mt3 && mt3.data, 'MT3 (5,9) 应该有事件');
  const mt3Actions = [];
  walkActions(mt3.data, 'MT3', a => mt3Actions.push(a));
  const setValue = name => mt3Actions.filter(a => a.type === 'setValue' && a.name === name).map(a => String(a.value));
  assert.ok(setValue('status:hp').includes('400'), 'MT3 事件应把 hp 设为 400');
  assert.ok(setValue('status:atk').includes('10'), 'MT3 事件应把 atk 设为 10');
  assert.ok(setValue('status:def').includes('10'), 'MT3 事件应把 def 设为 10');
  assert.ok(setValue('flag:魔法免疫').includes('false'), 'MT3 事件应关掉魔法免疫');
  const mt3Change = mt3Actions.filter(a => a.type === 'changeFloor');
  assert.equal(mt3Change.length, 1);
  assert.equal(mt3Change[0].floorId, 'MT2');
  assert.deepEqual(mt3Change[0].loc, [3, 8]);

  // MT26：和洋娃娃说话 → flag:营救公主，同时打开 24 层的暗道
  const mt26 = floorOf('MT26').events['6,6'];
  assert.ok(mt26, 'MT26 (6,6) 应该有洋娃娃事件');
  const mt26Actions = [];
  walkActions(mt26.data, 'MT26', a => mt26Actions.push(a));
  assert.ok(mt26Actions.some(a => a.type === 'setValue' && String(a.value) === 'true' && a.name === 'flag:营救公主'),
    'MT26 事件应设置 flag:营救公主');
  assert.ok(mt26Actions.some(a => a.type === 'setBlock' && a.floorId === 'MT24' && a.number === 0),
    'MT26 事件应在 MT24 上打通道路');

  // MT24 (6,2)：有公主旗标时穿越到 MT50 (6,7)
  const mt24 = floorOf('MT24').events['6,2'];
  assert.ok(mt24, 'MT24 (6,2) 应该有穿越事件');
  const mt24Actions = [];
  walkActions(mt24.data, 'MT24', a => mt24Actions.push(a));
  const mt24Change = mt24Actions.filter(a => a.type === 'changeFloor');
  assert.equal(mt24Change.length, 1);
  assert.equal(mt24Change[0].floorId, 'MT50');
  assert.deepEqual(mt24Change[0].loc, [6, 7]);
  assert.ok(/flag:营救公主/.test(JSON.stringify(mt24Actions.find(a => a.type === 'if').condition)), '穿越条件应是 flag:营救公主');

  // MT50 (6,5)：魔王真身 5000/1580/190 + setBlock，并且战后判 NE/TE 与特性版
  const mt50 = floorOf('MT50').events['6,5'];
  assert.ok(mt50, 'MT50 (6,5) 应该有魔王现身事件');
  const mt50Actions = [];
  walkActions(mt50.data, 'MT50', a => mt50Actions.push(a));
  const stats = {};
  for (const a of mt50Actions) if (a.type === 'setEnemy' && a.id === 'redKing') stats[a.name] = String(a.value);
  assert.deepEqual(stats, { hp: '5000', atk: '1580', def: '190' });
  assert.ok(mt50Actions.some(a => a.type === 'setBlock' && a.number === 245), 'MT50 事件应把魔王摆回地图');
  const mt50After = floorOf('MT50').afterBattle['6,5'];
  assert.ok(Array.isArray(mt50After) && mt50After.length, 'MT50 战后事件缺失');
  const mt50AfterActions = [];
  walkActions(mt50After, 'MT50', a => mt50AfterActions.push(a));
  const endingNames = mt50AfterActions.filter(a => a.type === 'setValue').map(a => a.name);
  assert.ok(endingNames.includes('flag:versionType'), '战后应写 flag:versionType');
  assert.ok(endingNames.includes('flag:endingType'), '战后应写 flag:endingType');
  assert.ok(mt50AfterActions.some(a => a.type === 'win'), '战后应触发 win');

  // MT49 (1,1) 的 autoEvent 用 whiteKing 的站位判断魔王是否被封印
  const mt49Auto = JSON.stringify(floorOf('MT49').autoEvent);
  assert.ok(/whiteKing/.test(mt49Auto), 'MT49 autoEvent 条件里应出现 whiteKing');
  const mt49 = floorOf('MT49').events['6,6'];
  assert.ok(mt49, 'MT49 (6,6) 应该有魔王事件');
  const mt49Actions = [];
  walkActions(mt49.data, 'MT49', a => mt49Actions.push(a));
  assert.ok(mt49Actions.some(a => a.type === 'setBlock' && a.number === 245), 'MT49 应摆出魔王');

  // 7 个公共事件
  const required = ['商店', '对话', '商人', '加点事件', '回收钥匙商店', '记事本', '关于游戏'];
  for (const name of required) assert.ok(Array.isArray(COMMON[name]) && COMMON[name].length, '缺少公共事件 ' + name);
  assert.deepEqual(Object.keys(COMMON).sort(), required.slice().sort());
});

test('汇总：楼层数、动作总数、公共事件数、怪物数（一行摘要）', () => {
  const actTotal = ACTIONS.filter(one => one.action.type !== 'say').length;
  const sayTotal = ACTIONS.length - actTotal;
  const commonTotal = Object.keys(COMMON).length;
  console.log(`[mota:data] 楼层 ${FLOOR_IDS.length} · 事件动作 ${actTotal}（另有 ${sayTotal} 句对白） · 公共事件 ${commonTotal} · 怪物 ${ENEMY_TOTAL}`);
  assert.equal(FLOOR_IDS.length, 51);
  assert.ok(actTotal > 500, '动作总数看起来太少了：' + actTotal);
  assert.ok(sayTotal > 100, '对白总数看起来太少了：' + sayTotal);
  assert.equal(commonTotal, 7);
  assert.ok(ENEMY_TOTAL > 300, '怪物合计看起来太少了：' + ENEMY_TOTAL);
  // 每层怪物数一起打出来，方便对照原塔
  const perFloor = FLOOR_IDS.map(id => id.slice(2) + ':' + enemyCountOf(id));
  console.log('[mota:data] 每层怪物数 ' + perFloor.join(' '));
});
