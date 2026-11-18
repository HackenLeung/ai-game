'use strict';

// games/mota 结构通关（不是人类最优解）：用 engine 在“无敌模式”下自动爬塔，验证剧情链能走通。
// 运行：cd F:\project\ai-game; node games/mota/tests/play.cjs
//
// 走法是一条“结构路线”，只保证把关键剧情都走到：
//   1 层拿魔杖 → 3 层魔王开场（被打回 2 层 400/10/10）→ 一路爬到 35 层杀魔龙拿冰魔法
//   → 继续爬到 49 层打魔王 → 用魔杖飞回 26 层融冰救公主 → 飞到 24 层走时空通道到 50 层
//   → 50 层小偷 → 打 redKing 真身 → win(特性版-NE)
//
// 这里只用引擎的公开接口（move/useFly/useItem/useItemOn/start），不 patch engine，
// 也不改 data：数据和引擎里真缺东西时这个脚本应该红。
const Engine = require('../engine.js');
const Data = require('../data.js');

const MAX_STEPS = 20000;
const STEP_BUDGET_MS = 115000; // npm test 要求 120 秒内结束，留一点余量
const INVINCIBLE = { hp: 99999999, atk: 9999, def: 9999 };
const KEYS = ['yellowKey', 'blueKey', 'redKey', 'greenKey', 'steelKey', 'specialKey'];
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const VERBOSE = process.argv.includes('--verbose');

const startedAt = Date.now();
const log = []; // { kind, text }：say / tip / choose / key
const trace = []; // 关键节点

function note(kind, text) {
  log.push({ kind, text });
  if (VERBOSE) console.log(`  . ${kind} ${text}`);
}

function traceLine(text) {
  trace.push(text);
  if (VERBOSE) console.log('[trace] ' + text);
}

// ---------------------------------------------------------------- 测试用 UI

let uiWin = null;
const ui = {
  async say(payload) {
    const data = payload || {};
    note('say', (data.speaker ? '[' + data.speaker + '] ' : '') + String(data.text || '').slice(0, 120));
  },
  async choose(payload) {
    const data = payload || {};
    const choices = data.choices || [];
    // 选项永远选第一个可行项：开局就是“开启（特性版）”“开启（疯狂加血）”
    note('choose', String(data.text || '').slice(0, 60) + ' → ' + String(choices[0] || '(没有选项)'));
    return 0;
  },
  tip(text) { note('tip', String(text == null ? '' : text)); },
  update() { },
  async battle() { },
  async win(payload) { uiWin = payload || {}; note('win', JSON.stringify(payload || {})); },
  sound() { }
};

// ---------------------------------------------------------------- 引擎实例

const game = Engine.create({ saveKey: 'mota-play-structural', storage: null, ui });

const FLOOR_IDS = Data.floors.floorIds;
const indexOfFloor = id => FLOOR_IDS.indexOf(id);
let moves = 0;
let maxFloorSeen = 'MT1';
const battlesByFloor = {};
let zeroHpSeen = 0;
const blockedEdges = new Set(); // 'x,y>x2,y2'：撞上去走不通的方向，BFS 避开
const posHistory = []; // 最近若干步的落点，失败时打出来定位

function hero() { return game.state.hero; }
function where() { return Object.assign({ floorId: game.state.floorId }, hero().loc); }
function keyOf(x, y) { return x + ',' + y; }

function boost() {
  const h = hero();
  h.hp = INVINCIBLE.hp;
  h.atk = INVINCIBLE.atk;
  h.def = INVINCIBLE.def;
  if (!h.keys) h.keys = {};
  for (const id of KEYS) h.keys[id] = 99;
  game.state.flags['开启特性'] = 1;
  game.state.flags['addhp'] = 1;
  // 状态类负面效果清掉，免得“中毒/衰弱”把测试路线搅乱
  if (h.flags) { h.flags.poison = false; h.flags.weak = false; h.flags.curse = false; }
}

function passable(x, y, options) {
  if (x < 0 || y < 0 || x > 12 || y > 12) return false;
  const opts = options || {};
  const block = game.blockAt(x, y);
  const tile = block.tile;
  if (tile.kind === 'npc') return false; // NPC 挡路，但可以隔着它说话
  if (opts.avoidStairs && (tile.kind === 'stair' || tile.trigger === 'changeFloor')) return false;
  if (tile.kind === 'fakeWall' || tile.kind === 'door' || tile.kind === 'enemy') return true;
  if (!block.n) return true;
  return !tile.noPass;
}

/**
 * 从勇士脚下 BFS 到目标格。
 * options.avoidStairs：路过楼梯/传送阵不算路（免得半路被送上/送下楼层），目标本身除外。
 */
function bfs(goal, options) {
  const opts = options || {};
  const start = hero().loc;
  const startKey = keyOf(start.x, start.y);
  const prev = new Map([[startKey, null]]);
  const queue = [startKey];
  while (queue.length) {
    const current = queue.shift();
    const [x, y] = current.split(',').map(Number);
    if (current !== startKey && goal(x, y)) {
      const path = [];
      let node = current;
      while (node && node !== startKey) { path.push(node.split(',').map(Number)); node = prev.get(node); }
      return path.reverse();
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const next = keyOf(nx, ny);
      if (prev.has(next)) continue;
      if (blockedEdges.has(current + '>' + next)) continue;
      const isGoal = goal(nx, ny);
      if (!passable(nx, ny, { avoidStairs: opts.avoidStairs && !isGoal })) continue;
      prev.set(next, current);
      queue.push(next);
    }
  }
  return null;
}

/** 走一步（每次 move 前把无敌属性补满，避免被剧情改属性后意外死亡） */
async function move(dx, dy) {
  if (game.state.win || game.state.gameOver) return { ok: false, reason: 'done' };
  if (Date.now() - startedAt > STEP_BUDGET_MS) throw new Error('超过时间预算');
  if (moves >= MAX_STEPS) throw new Error('超过步数上限 ' + MAX_STEPS);
  boost();
  const before = {
    floor: game.state.floorId,
    battles: game.state.stats.battles,
    zeroHp: game.state.stats.zeroHp
  };
  const result = await game.move(dx, dy);
  moves += 1;
  posHistory.push(`${moves}:${game.state.floorId}(${game.state.hero.loc.x},${game.state.hero.loc.y})${result && result.ok === false ? '!' + result.reason : ''}`);
  if (posHistory.length > 40) posHistory.shift();
  if (game.state.stats.battles > before.battles) {
    battlesByFloor[before.floor] = (battlesByFloor[before.floor] || 0) + (game.state.stats.battles - before.battles);
  }
  if (game.state.stats.zeroHp > before.zeroHp) zeroHpSeen = game.state.stats.zeroHp;
  if (indexOfFloor(game.state.floorId) > indexOfFloor(maxFloorSeen)) maxFloorSeen = game.state.floorId;
  if (result && result.ok === false) {
    const h = hero().loc;
    blockedEdges.add(keyOf(h.x, h.y) + '>' + keyOf(h.x + dx, h.y + dy));
  }
  return result || { ok: false };
}

async function stepToward(goal) {
  // 只走不踩楼梯的路：半路被送上/送下楼层会让爬塔循环来回打转。
  const path = bfs(goal, { avoidStairs: true });
  if (!path || !path.length) return null;
  const [nx, ny] = path[0];
  const start = hero().loc;
  return move(nx - start.x, ny - start.y);
}

/**
 * 走到第一个满足 pred 的格子。返回 'arrived' | 'floor'（中途换了楼层）| 'blocked' | 'done'。
 */
async function walkCondition(pred, options) {
  const opts = options || {};
  const floorAtStart = game.state.floorId;
  let failures = 0;
  for (let i = 0; i < (opts.limit || 260); i++) {
    if (game.state.win || game.state.gameOver) return 'done';
    const here = hero().loc;
    if (pred(here.x, here.y)) return 'arrived';
    if (game.state.floorId !== floorAtStart) return 'floor';
    const result = await stepToward(pred);
    if (result === null) return 'blocked'; // 暂时到不了，由调用方决定换目标
    if (result.ok === false) failures += 1;
    if (failures > 12) return 'blocked';
  }
  return 'blocked';
}

async function walkTo(x, y, options) {
  return walkCondition((gx, gy) => gx === x && gy === y, options);
}

function stairsOf(floorId) {
  const floor = game.floorData(floorId);
  const list = [];
  for (const loc of Object.keys(floor.stairs || {})) {
    const [x, y] = loc.split(',').map(Number);
    list.push({ x, y, to: floor.stairs[loc].to, stair: floor.stairs[loc].stair });
  }
  return list;
}

function upStairOf(floorId) {
  const index = indexOfFloor(floorId);
  return stairsOf(floorId).find(one => indexOfFloor(one.to) > index) || null;
}


/** 本层还能做的事：事件格、道具、怪、NPC 旁边 */
function targetsOnFloor() {
  const floorId = game.state.floorId;
  const floor = game.floorData(floorId);
  const list = [];
  for (let y = 0; y < 13; y++) {
    for (let x = 0; x < 13; x++) {
      const block = game.blockAt(x, y);
      const tile = block.tile;
      const here = keyOf(x, y);
      const hasEvent = !!(floor.events && floor.events[here] && floor.events[here].enable !== false);
      const space = passable(x, y);
      if (!space) {
        // NPC：站到旁边就能说话（sweep 会再撞一下触发对话）
        if (tile.kind === 'npc') {
          for (const [dx, dy] of DIRS) if (passable(x + dx, y + dy)) list.push({ x: x + dx, y: y + dy, kind: 'talk', name: tile.id, npcX: x, npcY: y });
        }
        continue;
      }
      if (hasEvent) list.push({ x, y, kind: 'event' });
      if (tile.kind === 'item') list.push({ x, y, kind: 'item', name: tile.id });
      if (tile.kind === 'enemy') list.push({ x, y, kind: 'enemy', name: tile.id });
      // 楼梯不是 sweep 的目标：踩上去会换层，那是 climbTo 自己的事
    }
  }
  const start = hero().loc;
  const distance = (x, y) => Math.abs(x - start.x) + Math.abs(y - start.y);
  return list.sort((a, b) => distance(a.x, a.y) - distance(b.x, b.y));
}

/** 把这一层能做的事尽量做掉（打怪、拿东西、踩事件、和 NPC 说话），用来打开被事件锁住的路 */
async function sweep(floorId) {
  const start = game.state.floorId;
  let done = 0;
  for (const target of targetsOnFloor()) {
    if (game.state.floorId !== start) return;
    if (done > 40) break;
    const result = await walkTo(target.x, target.y, { limit: 60 });
    done += 1;
    if (result === 'floor' || game.state.floorId !== start) return;
    if (target.kind === 'talk') {
      // 站到旁边之后再撞一下，才会触发 NPC 的对话事件
      const here = hero().loc;
      const dx = target.npcX - here.x;
      const dy = target.npcY - here.y;
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        const bump = await move(dx, dy);
        if (bump && bump.ok === false) blockedEdges.add(keyOf(here.x, here.y) + '>' + keyOf(target.npcX, target.npcY));
        if (game.state.floorId !== start) return;
      }
    }
  }
  if (game.state.floorId !== floorId) return;
  // 事件把墙打开以后，可能又出现新的路：再扫一遍（最多两轮）
  if (done > 0) {
    for (const target of targetsOnFloor()) {
      if (game.state.floorId !== start) return;
      const result = await walkTo(target.x, target.y, { limit: 40 });
      if (result === 'floor' || game.state.floorId !== start) return;
    }
  }
}

/** 40 层：上楼靠 (6,7) 的队长剧情 + (6,1) 的 :next 事件，没有楼梯图块 */
async function eventExit40() {
  if (game.state.floorId !== 'MT40') return false;
  traceLine('MT40：走到 (6,7) 触发骑士队长剧情');
  await walkTo(6, 7, { limit: 120 });
  if (game.state.floorId !== 'MT40') return true;
  if (!game.state.flags['402']) {
    // 剧情没走到就再扫一遍本层
    await sweep('MT40');
    if (game.state.floorId !== 'MT40') return true;
  }
  if (!game.state.flags['402']) return false;
  traceLine('MT40：flag:402 已置位，走到新建的 (6,1) 上楼');
  await walkTo(6, 1, { limit: 120 });
  // 这一步会经事件 `changeFloor floorId:":next"` 直接进 41 层（引擎会把 :next 解析成下一层）
  return game.state.floorId !== 'MT40';
}

async function leaveFloorUpward(floorId) {
  const above = () => indexOfFloor(game.state.floorId) > indexOfFloor(floorId);
  const stair = upStairOf(floorId);
  if (stair) {
    for (let round = 0; round < 3; round++) {
      const result = await walkTo(stair.x, stair.y, { limit: 220 });
      if (result === 'floor' || game.state.floorId !== floorId) return above();
      // 楼梯还走不到：把本层能触发的剧情/怪都清一遍（机关、头目战会开路），再试
      await sweep(floorId);
      if (game.state.floorId !== floorId) return above();
    }
    const finalTry = await walkTo(stair.x, stair.y, { limit: 120 });
    if (finalTry === 'floor' || game.state.floorId !== floorId) return above();
  }
  if (await eventExit40()) return true;
  return false;
}

async function climbTo(targetId) {
  let guard = 0;
  const visits = {};
  while (indexOfFloor(game.state.floorId) < indexOfFloor(targetId)) {
    if (game.state.win || game.state.gameOver) throw new Error('提前结束：' + JSON.stringify(game.state.win || 'gameOver'));
    if (guard++ > 200) throw new Error('爬塔循环次数过多，卡在 ' + game.state.floorId);
    const floorId = game.state.floorId;
    visits[floorId] = (visits[floorId] || 0) + 1;
    if (visits[floorId] > 8) throw new Error('在 ' + floorId + ' 反复上下楼（' + visits[floorId] + ' 次），上楼路线不成立');
    traceLine('climb ' + floorId);
    const ok = await leaveFloorUpward(floorId);
    if (game.state.floorId !== floorId) continue; // 换了楼层（可能被送回下面），下一轮重新判断
    if (!ok) {
      throw new Error('在 ' + floorId + ' 找不到上楼的路（' + JSON.stringify(where()) + '）');
    }
  }
}

/** 其他楼层的原始图块（不看运行时改动） */
function floorTile(floorId, x, y) {
  const floor = game.data.floors.floors[floorId];
  if (!floor || !floor.map || !floor.map[y]) return null;
  const number = floor.map[y][x];
  return number ? game.tileInfo(number) : null;
}

/** 楼传会保留当前坐标，所以落地格必须“能站人” */
function landingOk(floorId, x, y) {
  const tile = floorTile(floorId, x, y);
  if (!tile) return true;
  if (tile.kind === 'npc' || tile.noPass) return false;
  return true;
}

async function flyTo(floorId) {
  if (game.state.floorId === floorId) return true;
  // engine 的楼传沿用了原塔语义：落在目标层的同一坐标。先走到一个“两边都能站”的格子。
  if (!landingOk(floorId, hero().loc.x, hero().loc.y)) {
    const moved = await walkCondition((x, y) => landingOk(floorId, x, y), { limit: 200 });
    if (moved !== 'arrived') {
      throw new Error('准备飞 ' + floorId + ' 时找不到可安全落地的坐标（' + JSON.stringify(where()) + '，结果 ' + moved + '）');
    }
  }
  const before = JSON.stringify(where());
  const ok = await game.useFly(floorId);
  if (!ok) throw new Error('魔杖飞不到 ' + floorId + '（' + before + '）');
  if (game.state.floorId !== floorId) throw new Error('魔杖没有把人送到 ' + floorId + '（' + before + ' → ' + JSON.stringify(where()) + '）');
  traceLine('fly → ' + floorId + ' 落点 ' + JSON.stringify(where()));
  return true;
}

function hasItem(id) { return game.hasItem(id); }

// ---------------------------------------------------------------- 关键节点断言

const seen = {
  mt3: null, mt26: false, mt32Battle: false, mt35Dragon: false, mt49King: false, mt50: false, win: null
};

async function missionPickFly() {
  if (hasItem('fly')) return;
  traceLine('MT1：先拿 (2,11) 的魔杖');
  const result = await walkTo(2, 11, { limit: 80 });
  if (result === 'blocked' && !hasItem('fly')) throw new Error('拿不到 1 层的魔杖');
  if (!hasItem('fly')) throw new Error('走到 (2,11) 也没拿到魔杖');
}

async function missionMt3() {
  await climbTo('MT3');
  traceLine('MT3：踩 (5,9) 的魔王开场');
  await walkTo(5, 9, { limit: 200 });
  const h = hero();
  if (game.state.floorId !== 'MT2') throw new Error('MT3 剧情后应该回到 MT2，实际在 ' + game.state.floorId);
  if (h.hp !== 400 || h.atk !== 10 || h.def !== 10) {
    throw new Error(`MT3 剧情后属性应为 400/10/10，实际 ${h.hp}/${h.atk}/${h.def}`);
  }
  seen.mt3 = {
    hp: h.hp, atk: h.atk, def: h.def, floor: game.state.floorId,
    'flag:魔法免疫': game.state.flags['魔法免疫'],
    'hero.flags.魔法免疫': !!(h.flags && h.flags['魔法免疫'])
  };
  traceLine('MT3 ✓ 回到 MT2，hp=400 atk=10 def=10');
  boost();
}

async function missionDragon35() {
  await climbTo('MT35');
  traceLine('MT35：打 (6,7) 的魔龙，再拿 (6,6) 的冰魔法');
  await walkTo(6, 7, { limit: 160 });
  if (!battlesByFloor.MT35) throw new Error('MT35 没打上魔龙（battles=0）');
  await walkTo(6, 6, { limit: 120 });
  if (!hasItem('snow')) throw new Error('MT35 没拿到冰魔法');
  seen.mt35Dragon = true;
  traceLine('MT35 ✓ 魔龙已处理，拿到冰魔法');
}

async function missionClimb49() {
  await climbTo('MT49');
  if (zeroHpSeen > 0) seen.zeroHp = zeroHpSeen;
}

async function missionKing49() {
  // 32 层骑士队长剧情：正常战斗（无敌状态下必胜）或 zeroHp 二选一
  seen.mt32Battle = !!battlesByFloor.MT32 || zeroHpSeen > 0;
  if (!seen.mt32Battle) throw new Error('32 层骑士队长剧情没有发生（battlesByFloor.MT32=0）');
  traceLine('MT32 ✓ 骑士队长剧情（' + (zeroHpSeen ? 'zeroHp=' + zeroHpSeen : '正常战斗') + '）');
  traceLine('MT49：踩 (6,6) 让魔王现身，再去 (6,3) 打魔王');
  await walkTo(6, 6, { limit: 200 });
  await walkTo(6, 3, { limit: 200 });
  const tile = game.blockAt(6, 3).tile;
  const stillRedKing = tile && tile.kind === 'enemy' && tile.id === 'redKing';
  if (stillRedKing) {
    await sweep('MT49');
  }
  if (!battlesByFloor.MT49) throw new Error('MT49 没打上魔王');
  seen.mt49King = true;
  traceLine('MT49 ✓ 魔王');
}

async function missionPrincess26() {
  await flyTo('MT26');
  traceLine('MT26：站到 (6,8)，用冰魔法融 (6,7) 的岩浆，再和洋娃娃说话');
  const result = await walkTo(6, 8, { limit: 200 });
  if (result === 'blocked') throw new Error('MT26 走不到 (6,8)：' + JSON.stringify(where()));
  boost();
  const armed = await game.useItem('snow');
  if (!armed || armed.ok === false) throw new Error('冰魔法用不了');
  const used = await game.useItemOn('snow', 6, 7);
  if (!used || used.ok === false) throw new Error('冰魔法融不掉岩浆');
  if (game.blockAt(6, 7).n) throw new Error('(6,7) 还是 ' + game.blockAt(6, 7).tile.id);
  await walkTo(6, 7, { limit: 60 });
  await move(0, -1); // 撞洋娃娃
  if (!game.state.flags['营救公主']) throw new Error('没能触发 flag:营救公主');
  seen.mt26 = true;
  traceLine('MT26 ✓ flag:营救公主 已置位');
}

async function missionFinal() {
  await flyTo('MT24');
  traceLine('MT24：走 (6,2) 的时空通道去 50 层');
  await walkTo(6, 2, { limit: 200 });
  if (game.state.floorId !== 'MT50') {
    // 时空通道是踩上去触发的；没触发就再踩一次
    await walkTo(6, 3, { limit: 60 });
    await walkTo(6, 2, { limit: 60 });
  }
  if (game.state.floorId !== 'MT50') throw new Error('MT24 的时空通道没有把勇士送到 MT50（现在 ' + game.state.floorId + '）');
  seen.mt50 = true;
  traceLine('MT50：先和 (6,5) 的小偷说话，再打 redKing 真身');
  await walkTo(6, 6, { limit: 80 });
  await move(0, -1); // 小偷剧情：魔王现身
  if (game.state.win) return;
  const block = game.blockAt(6, 5);
  if (!block.enemy) throw new Error('MT50 (6,5) 没有变成魔王：' + block.tile.id);
  await move(0, -1); // 打 redKing
  for (let i = 0; i < 6 && !game.state.win; i++) {
    await move(0, -1);
  }
  if (!game.state.win) throw new Error('打完 redKing 也没有 win：' + JSON.stringify(where()));
}

// ---------------------------------------------------------------- 主流程

async function main() {
  await game.start();
  boost();
  traceLine('开局：' + JSON.stringify(where()) + ' keys=' + JSON.stringify(hero().keys));
  console.log(`[play] 起点 MT1 (6,11)，开局选项已自动选择（特性版 + 疯狂加血）`);

  await missionPickFly();
  traceLine('✓ 魔杖');
  await missionMt3();
  await missionDragon35();
  await missionClimb49();
  await missionKing49();
  await missionPrincess26();
  await missionFinal();
}

function reportFailure(error) {
  console.error('[play] 失败：' + (error && error.message ? error.message : error));
  console.error('[play] 位置：' + JSON.stringify(where()));
  console.error('[play] 步数：' + moves + '  battles=' + JSON.stringify(battlesByFloor) + ' zeroHp=' + zeroHpSeen);
  console.error('[play] 最近 40 步落点：' + posHistory.join(' '));
  console.error('[play] talkEnergy=' + game.state.talkEnergy + ' armed=' + game.armed);
  console.error('[play] 最近日志：');
  for (const one of log.slice(-30)) console.error('  ' + one.kind.padEnd(6) + ' ' + one.text);
  const floorId = game.state.floorId;
  const up = upStairOf(floorId);
  console.error('[play] 本层楼梯：' + JSON.stringify(stairsOf(floorId)) + ' 上楼目标=' + JSON.stringify(up));
  if (up) {
    const path = bfs((x, y) => x === up.x && y === up.y);
    console.error('[play] 到上楼楼梯的路径：' + (path ? path.length + ' 步' : '走不到'));
  }
  console.error('[play] 本层运行时地图（勇士 @ ' + hero().loc.x + ',' + hero().loc.y + '）：');
  for (let y = 0; y < 13; y++) {
    const row = [];
    for (let x = 0; x < 13; x++) {
      const block = game.blockAt(x, y);
      const mark = (x === hero().loc.x && y === hero().loc.y) ? '**' : '';
      row.push(mark + String(block.n || 0).padStart(3) + (passable(x, y) ? ' ' : '#'));
    }
    console.error('  y' + String(y).padStart(2) + ' ' + row.join(''));
  }
}

(async () => {
  try {
    await main();
    const reason = `${game.state.flags.versionType || '?'}-${game.state.flags.endingType || '?'}`;
    // 关键节点复核
    const problems = [];
    for (const floorId of ['MT3', 'MT26', 'MT32', 'MT35', 'MT49']) {
      // 32 层可能只是路过；visited 记录经过的层
      if (game.state.visited.indexOf(floorId) < 0) problems.push('没去过 ' + floorId);
    }
    if (!seen.mt3) problems.push('MT3 剧情没验证');
    if (!seen.mt26) problems.push('MT26 救公主没验证');
    if (!seen.mt32Battle) problems.push('MT32 骑士队长没验证');
    if (!seen.mt35Dragon) problems.push('MT35 魔龙没验证');
    if (!seen.mt49King) problems.push('MT49 魔王没验证');
    if (!seen.mt50) problems.push('没进 MT50');
    if (!game.state.win) problems.push('没有 win');
    if (!uiWin) problems.push('没有回调到 ui.win（前端结算弹层收不到）');
    if (game.state.visited.length < 50) problems.push('只到过 ' + game.state.visited.length + ' 层');
    if (String(game.state.flags.versionType) !== '特性版') problems.push('versionType=' + game.state.flags.versionType);
    if (String(game.state.flags.endingType) !== 'NE') problems.push('endingType=' + game.state.flags.endingType);
    // sanity check（不钉死具体数字，规则微调时不该红）
    // 只做量级 sanity check：规则/数值微调时不该因为这个红
    if (moves < 400 || moves > 6000) problems.push('步数 ' + moves + ' 不在 400~6000 的合理区间');
    if (game.state.stats.battles < 60) problems.push('战斗次数 ' + game.state.stats.battles + ' 少于 60');
    if (problems.length) throw new Error('收尾检查未通过：' + problems.join('；'));

    traceLine(`通关：${reason} 步数=${moves} 战斗=${game.state.stats.battles} 最高层=${maxFloorSeen}`);
    console.log(`PASS play: floors=${FLOOR_IDS.length} steps=${moves} battles=${game.state.stats.battles} win=${reason}`);
    console.log(`[play] 到过的楼层 ${game.state.visited.length}/${FLOOR_IDS.length} · 关键点 MT3 ${JSON.stringify(seen.mt3)} · zeroHp=${zeroHpSeen} · 战斗分布 ${JSON.stringify(battlesByFloor)}`);
    if (VERBOSE) console.log(trace.join('\n'));
  } catch (error) {
    reportFailure(error);
    process.exitCode = 1;
  }
})();
