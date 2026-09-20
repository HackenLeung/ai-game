// 深渊回响 · 战斗与流程引擎。随机数保存在存档中，同一存档可复现。
(function (root, factory) {
  const isModule = typeof module === 'object' && module.exports;
  const cards = isModule ? require('./data.js') : root.AbyssCards;
  const world = isModule ? require('./world.js') : root.AbyssWorld;
  const api = factory(cards, world);
  if (isModule) module.exports = api;
  else root.AbyssEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (cards, world) {
  'use strict';

  const VERSION = 1;
  const HAND_LIMIT = 10;
  const DRAW_BASE = 5;
  const DEFAULT_ENERGY = 3;
  const DECAY_STATUS = ['vulnerable', 'weak', 'frail', 'stun'];

  const clone = value => JSON.parse(JSON.stringify(value));
  const statusOf = (statuses, key) => (statuses && statuses[key]) || 0;

  // ---------- 随机数（状态保存在 state.rng 中，可随存档保存） ----------
  function nextRandom(state) {
    state.rng = (Math.imul(state.rng >>> 0, 1664525) + 1013904223) >>> 0;
    return state.rng / 4294967296;
  }
  function randomInt(state, max) { return Math.floor(nextRandom(state) * max); }
  function randomPick(state, list) { return list[randomInt(state, list.length)]; }
  function randomShuffle(state, list) {
    const copy = [...list];
    for (let index = copy.length - 1; index > 0; index--) {
      const swap = randomInt(state, index + 1);
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
  }
  // 供地图生成等外部流程使用，返回独立的随机序列。
  function createRng(seed) {
    const holder = { rng: (seed >>> 0) || 1 };
    return {
      next: () => nextRandom(holder),
      int: max => randomInt(holder, max),
      pick: list => randomPick(holder, list),
      shuffle: list => randomShuffle(holder, list),
      state: () => holder.rng,
    };
  }

  // ---------- 基础查询 ----------
  function modifiers(state) {
    const result = { flatDefense: 0, shopDiscount: 0 };
    for (const id of state.relics) {
      const relic = world.RELIC_MAP[id];
      if (!relic || !relic.modifiers) continue;
      for (const [key, value] of Object.entries(relic.modifiers)) result[key] = (result[key] || 0) + value;
    }
    return result;
  }
  const baseEnergy = state => {
    const character = cards.CHAR_MAP[state.character] || cards.CHARACTERS[0];
    // 每推进两章，核心的供能上限提升 1 点（不含第一章）。
    return character.energy + Math.floor(state.chapter / 2);
  };
  const aliveEnemies = battle => (battle ? battle.enemies.filter(enemy => !enemy.dead && enemy.hp > 0) : []);

  // ---------- 新游戏 ----------
  function newState(characterId = 'vanguard', seed = Date.now() % 2147483647) {
    const character = cards.CHAR_MAP[characterId] || cards.CHARACTERS[0];
    const state = {
      version: VERSION,
      seed: (seed >>> 0) || 1,
      rng: (seed >>> 0) || 1,
      uid: 0,
      character: character.id,
      hp: character.maxHp,
      maxHp: character.maxHp,
      gold: 99,
      deck: [],
      relics: [character.relic],
      potions: [],
      chapter: 1,
      floor: 0,
      map: [],
      pending: null,
      result: null,
      stats: { battles: 0, kills: 0, damage: 0, cards: 0, floors: 0, started: Date.now() },
      battle: null,
    };
    for (const id of character.deck) state.deck.push({ uid: nextUid(state, 'd'), id, upgraded: false });
    state.pending = { chapterIntro: 1 };
    state.map = world.createMap(state.chapter, createRng(state.seed + state.chapter * 977));
    return state;
  }

  // 进入新章节：核心在适应环境中变强，血量上限提升并恢复一部分。
  function chapterGrowth(state) {
    const bonus = 10 + state.chapter * 2;
    state.maxHp += bonus;
    state.hp = Math.min(state.maxHp, state.hp + Math.round(state.maxHp * 0.42));
    return bonus;
  }

  function nextUid(state, prefix) {
    state.uid = (state.uid || 0) + 1;
    return `${prefix}${state.uid}`;
  }

  function makeEnemy(state, id, scale) {
    const definition = world.ENEMY_MAP[id];
    const maxHp = Math.max(1, Math.round((definition.hp[0] + nextRandom(state) * (definition.hp[1] - definition.hp[0])) * (scale || 1)));
    return {
      uid: nextUid(state, 'e'), id: definition.id, name: definition.name, art: definition.art, kind: definition.kind,
      hp: maxHp, maxHp, block: 0, statuses: {}, intent: null, dead: false,
      lastMove: null, lastMoveRepeat: 0, phase: definition.phases || null, phaseDone: false, moves: definition.moves,
    };
  }

  // ---------- 战斗 ----------
  function startBattle(state, spec) {
    const battle = {
      kind: spec.kind,
      enemies: spec.enemies.map(id => makeEnemy(state, id, spec.hpScale || 1)),
      draw: [], hand: [], discard: [], exhaust: [],
      statuses: {}, energy: 0, maxEnergy: baseEnergy(state), block: 0,
      turn: 0, phase: 'player', log: [], attacksPlayed: 0, skillsPlayed: 0, powersPlayed: 0,
      finished: false, rewards: null, lastActor: null, goldTaken: false,
    };
    battle.draw = randomShuffle(state, state.deck.map(card => ({ ...card })));
    state.battle = battle;
    state.stats.battles += 1;
    battle.events = [];
    battle.log.push({ text: `遭遇战开始：${spec.enemies.map(id => world.ENEMY_MAP[id].name).join('、')}。`, kind: 'info' });
    runTriggers(state, 'battleStart');
    // 核心适应性：深层章节进入战斗时自带少量格挡。
    const standby = Math.floor((state.chapter - 1) / 2) * 4;
    if (standby > 0) gainBlock(state, standby, '核心适应');
    for (const enemy of aliveEnemies(battle)) pickIntent(state, enemy);
    if (!battle.finished) beginPlayerTurn(state);
    return battle;
  }

  function runTriggers(state, moment) {
    const battle = state.battle;
    if (!battle) return;
    for (const id of [...state.relics]) {
      const relic = world.RELIC_MAP[id];
      if (!relic || !relic.triggers) continue;
      for (const trigger of relic.triggers) {
        if (trigger.on !== moment) continue;
        if (trigger.firstTurn && battle.turn !== 1) continue;
        for (const effect of trigger.effects) {
          applyEffect(state, effect, { source: 'player', relic: relic.id });
          if (battle.finished) return;
        }
      }
    }
  }

  function intentDamage(state, enemy, move) {
    const parts = (move.effects || []).filter(effect => effect.type === 'damage' && (effect.target === 'player' || !effect.target));
    if (!parts.length) return null;
    return parts.map(part => {
      let damage = (part.value || 0) + statusOf(enemy.statuses, 'strength');
      if (statusOf(enemy.statuses, 'weak')) damage = Math.floor(damage * 0.75);
      if (statusOf(state.battle.statuses, 'vulnerable')) damage = Math.floor(damage * 1.5);
      damage = Math.max(0, damage - (modifiers(state).flatDefense || 0));
      return { value: damage, times: part.times || 1 };
    });
  }
  function pickIntent(state, enemy) {
    const moves = enemy.moves || [];
    if (!moves.length) { enemy.intent = null; return; }
    let move = randomPick(state, moves);
    let guard = 0;
    while (move.id === enemy.lastMove && moves.length > 1 && guard < 8) { move = randomPick(state, moves); guard += 1; }
    enemy.lastMoveRepeat = move.id === enemy.lastMove ? (enemy.lastMoveRepeat || 0) + 1 : 0;
    enemy.lastMove = move.id;
    enemy.intent = { id: move.id, name: move.name, intent: move.intent, damage: intentDamage(state, enemy, move) };
  }
  // 玩家回合内施加的虚弱、易伤等会改变敌人的预计伤害，出牌后重新计算意图数字。
  function refreshIntents(state) {
    for (const enemy of aliveEnemies(state.battle)) {
      const move = enemy.intent && (enemy.moves || []).find(item => item.id === enemy.intent.id);
      if (move) enemy.intent.damage = intentDamage(state, enemy, move);
    }
  }

  function beginPlayerTurn(state) {
    const battle = state.battle;
    if (!battle || battle.finished) return;
    const opening = battle.turn === 0;
    battle.turn += 1;
    battle.phase = 'player';
    battle.active = null;
    battle.attacksPlayed = 0;
    battle.skillsPlayed = 0;
    battle.powersPlayed = 0;
    mark(state, { kind: 'turnStart', turn: battle.turn });
    // 战斗开始时获得的格挡保留到首个回合；从第二回合起按规则清空。
    if (!opening) {
      const retain = statusOf(battle.statuses, 'blockRetain');
      battle.block = retain ? Math.min(battle.block, retain) : 0;
    }
    battle.energy = battle.maxEnergy + statusOf(battle.statuses, 'energyBonus');
    if (statusOf(battle.statuses, 'energyBonus')) loseHp(state, 4, '超载');
    if (statusOf(battle.statuses, 'poison')) {
      loseHp(state, statusOf(battle.statuses, 'poison'), '中毒');
      battle.statuses.poison -= 1;
      if (battle.statuses.poison <= 0) delete battle.statuses.poison;
    }
    if (battle.finished) return;
    runTriggers(state, 'turnStart');
    if (battle.finished) return;
    if (statusOf(battle.statuses, 'plating')) gainBlock(state, statusOf(battle.statuses, 'plating'), '装甲');
    if (statusOf(battle.statuses, 'plague')) {
      for (const enemy of aliveEnemies(battle)) addStatus(state, enemy, 'poison', statusOf(battle.statuses, 'plague'), '瘟疫');
    }
    const turret = statusOf(battle.statuses, 'turret');
    for (let index = 0; index < turret; index++) {
      const pool = aliveEnemies(battle);
      if (!pool.length) break;
      dealDamageToEnemy(state, pool[battle.turn % pool.length], turret, { label: '炮台' });
    }
    drawCards(state, DRAW_BASE + statusOf(battle.statuses, 'perception'));
    refreshIntents(state);
    battle.log.push({ text: `第 ${battle.turn} 回合开始。`, kind: 'turn' });
    checkEnd(state);
  }

  // 结束玩家回合。界面传入 resolve:false 以逐个播放敌人动作。
  function endPlayerTurn(state, options = {}) {
    const battle = state.battle;
    if (!battle || battle.finished || battle.phase !== 'player') return false;
    battle.phase = 'enemy';
    battle.active = null;
    battle.enemyOrder = aliveEnemies(battle).map(enemy => enemy.uid);
    mark(state, { kind: 'enemyTurn' });
    if (statusOf(battle.statuses, 'burn')) {
      loseHp(state, statusOf(battle.statuses, 'burn'), '灼烧');
      battle.statuses.burn -= 1;
      if (battle.statuses.burn <= 0) delete battle.statuses.burn;
    }
    if (battle.finished) return true;
    runTriggers(state, 'turnEnd');
    if (battle.finished) return true;
    if (statusOf(battle.statuses, 'regen')) {
      heal(state, statusOf(battle.statuses, 'regen'));
      battle.statuses.regen -= 1;
      if (battle.statuses.regen <= 0) delete battle.statuses.regen;
    }
    decayStatuses(battle.statuses);
    battle.discard = battle.discard.concat(battle.hand);
    battle.hand = [];
    if (checkEnd(state)) return true;
    if (options.resolve === false) return true;
    runEnemyTurn(state);
    return true;
  }
  // 直接推进到敌人回合结束（用于结算、测试与自动试跑）。
  function resolveEnemyTurn(state) {
    const battle = state.battle;
    if (!battle || battle.finished) return false;
    if (battle.phase !== 'enemy') return false;
    let guard = 0;
    while (battle.phase === 'enemy' && !battle.finished && guard < 200) { guard += 1; stepEnemyAction(state); }
    return true;
  }

  function decayStatuses(statuses) {
    for (const key of DECAY_STATUS) {
      if (!statuses[key]) continue;
      statuses[key] -= 1;
      if (statuses[key] <= 0) delete statuses[key];
    }
  }

  // 敌人回合按「一个敌人一个动作」推进，界面可以据此逐个播放。
  function stepEnemyAction(state) {
    const battle = state.battle;
    if (!battle || battle.finished || battle.phase !== 'enemy') return false;
    // 队列只在回合开始时初始化一次；空队列代表本回合所有敌人都已行动完毕。
    if (!Array.isArray(battle.enemyOrder)) battle.enemyOrder = aliveEnemies(battle).map(enemy => enemy.uid);
    const nextUid = battle.enemyOrder.shift();
    if (!nextUid) {
      battle.enemyOrder = null;
      for (const enemy of aliveEnemies(battle)) pickIntent(state, enemy);
      if (checkEnd(state)) return true;
      beginPlayerTurn(state);
      return true;
    }
    const enemy = battle.enemies.find(item => item.uid === nextUid);
    if (!enemy || enemy.dead || enemy.hp <= 0) return true;
    enemy.block = 0;
    battle.active = enemy.uid;
    if (statusOf(enemy.statuses, 'poison')) {
      dealDamageToEnemy(state, enemy, statusOf(enemy.statuses, 'poison'), { label: '中毒', direct: true, source: 'poison' });
      enemy.statuses.poison -= 1;
      if (enemy.statuses.poison <= 0) delete enemy.statuses.poison;
      if (enemy.dead) return true;
    }
    if (enemy.phase && !enemy.phaseDone && enemy.hp / enemy.maxHp <= enemy.phase.at) {
      enemy.phaseDone = true;
      if (enemy.phase.block) gainBlock(state, enemy.phase.block, '形态', enemy);
      if (enemy.phase.strength) addStatus(state, enemy, 'strength', enemy.phase.strength, enemy.phase.name);
      battle.log.push({ text: `${enemy.name} 进入「${enemy.phase.name}」。`, kind: 'danger' });
    }
    const move = (enemy.moves || []).find(item => item.id === (enemy.intent && enemy.intent.id)) || (enemy.moves || [])[0];
    if (move) {
      if (statusOf(enemy.statuses, 'stun')) {
        battle.log.push({ text: `${enemy.name} 处于眩晕，无法行动。`, kind: 'good' });
      } else {
        battle.log.push({ text: `${enemy.name} 使用「${move.name}」。`, kind: 'enemy' });
        battle.lastMove = move.name;
        battle.lastHit = 0;
        for (const effect of move.effects || []) {
          battle.lastActor = enemy.uid;
          applyEffect(state, effect, { source: 'enemy', actor: enemy });
          if (battle.finished) return true;
        }
      }
      if (statusOf(enemy.statuses, 'burn')) {
        dealDamageToEnemy(state, enemy, statusOf(enemy.statuses, 'burn'), { label: '灼烧', direct: true, source: 'burn' });
        enemy.statuses.burn -= 1;
        if (enemy.statuses.burn <= 0) delete enemy.statuses.burn;
      }
    }
    if (statusOf(enemy.statuses, 'enrage')) addStatus(state, enemy, 'strength', statusOf(enemy.statuses, 'enrage'), '狂暴');
    decayStatuses(enemy.statuses);
    checkEnd(state);
    return true;
  }

  function runEnemyTurn(state) {
    const battle = state.battle;
    if (!battle || battle.finished) return;
    battle.phase = 'enemy';
    battle.enemyOrder = aliveEnemies(battle).map(enemy => enemy.uid);
    let guard = 0;
    while (battle.phase === 'enemy' && !battle.finished && guard < 200) { guard += 1; stepEnemyAction(state); }
  }

  // ---------- 伤害、格挡、状态 ----------
  function attackDamage(state, base, options) {
    const battle = state.battle;
    const fromEnemy = options.source === 'enemy';
    const attackerStatuses = fromEnemy ? options.attacker.statuses : battle.statuses;
    let damage = base + statusOf(attackerStatuses, 'strength');
    if (!fromEnemy) damage += statusOf(attackerStatuses, 'focus') + statusOf(attackerStatuses, 'amplify');
    if (statusOf(attackerStatuses, 'weak')) damage = Math.floor(damage * 0.75);
    const targetStatuses = options.target === 'player' ? battle.statuses : options.target.statuses;
    if (statusOf(targetStatuses, 'vulnerable')) damage = Math.floor(damage * 1.5);
    if (options.target === 'player') damage = Math.max(0, damage - (modifiers(state).flatDefense || 0));
    return Math.max(0, damage);
  }

  function dealDamageToEnemy(state, enemy, amount, options = {}) {
    const battle = state.battle;
    if (!enemy || enemy.dead) return 0;
    let remaining = amount;
    if (!options.direct && !options.pierce && enemy.block > 0) {
      const absorbed = Math.min(enemy.block, remaining);
      enemy.block -= absorbed;
      remaining -= absorbed;
      if (absorbed > 0) battle.log.push({ text: `${enemy.name} 的格挡吸收了 ${absorbed} 点伤害。`, kind: 'block' });
    }
    if (remaining > 0) {
      enemy.hp -= remaining;
      if (options.source === 'player') state.stats.damage += remaining;
      battle.log.push({ text: `${enemy.name} 受到 ${remaining} 点伤害${options.label ? `（${options.label}）` : ''}。`, kind: 'damage' });
      mark(state, { kind: 'hit', uid: enemy.uid, value: remaining, at: 'enemy' });
      // 敌人身上的荆棘会反噬攻击者。
      const thorns = statusOf(enemy.statuses, 'thorns');
      if (thorns > 0 && options.source === 'player' && !battle.finished && state.hp > 0) {
        battle.log.push({ text: `${enemy.name} 的荆棘反弹 ${thorns} 点伤害。`, kind: 'hurt' });
        loseHp(state, thorns, '荆棘');
      }
    }
    if (enemy.hp <= 0) killEnemy(state, enemy);
    return remaining;
  }

  function killEnemy(state, enemy) {
    const battle = state.battle;
    if (enemy.dead) return;
    enemy.hp = 0;
    enemy.dead = true;
    enemy.intent = null;
    state.stats.kills += 1;
    battle.log.push({ text: `${enemy.name} 被摧毁。`, kind: 'good' });
    mark(state, { kind: 'kill', uid: enemy.uid });
    if (statusOf(battle.statuses, 'devour')) heal(state, statusOf(battle.statuses, 'devour'));
    if (statusOf(battle.statuses, 'soulEater')) {
      const gain = statusOf(battle.statuses, 'soulEater') * 4;
      state.maxHp += gain;
      state.hp = Math.min(state.maxHp, state.hp + gain);
      battle.log.push({ text: `噬魂让你永久获得 ${gain} 点最大生命。`, kind: 'good' });
    }
    runTriggers(state, 'kill');
    checkEnd(state);
  }

  // 界面动效事件：只追加不清理，由界面消费后截断。
  function mark(state, event) {
    if (!state.battle) return;
    if (!Array.isArray(state.battle.events)) state.battle.events = [];
    state.battle.events.push(event);
    while (state.battle.events.length > 60) state.battle.events.shift();
  }

  function damagePlayer(state, amount, options = {}) {
    const battle = state.battle;
    let remaining = Math.max(0, amount);
    if (!options.ignoreBlock && battle.block > 0) {
      const absorbed = Math.min(battle.block, remaining);
      battle.block -= absorbed;
      remaining -= absorbed;
      if (absorbed > 0) battle.log.push({ text: `格挡吸收了 ${absorbed} 点伤害。`, kind: 'block' });
    }
    if (remaining > 0) {
      if (statusOf(battle.statuses, 'undying') && state.hp - remaining < 1) {
        remaining = Math.max(0, state.hp - 1);
        battle.log.push({ text: '不朽护佑让你留住了最后一口气。', kind: 'good' });
      }
      state.hp = Math.max(0, state.hp - remaining);
      if (remaining > 0) {
        battle.log.push({ text: `你受到 ${remaining} 点伤害${options.label ? `（${options.label}）` : ''}。`, kind: 'hurt' });
        mark(state, { kind: 'hit', value: remaining, at: 'player', source: options.source || 'enemy' });
      }
    }
    if (options.source === 'enemy' && options.actor && !options.actor.dead) {
      const reflect = statusOf(battle.statuses, 'reflect');
      if (reflect > 0) {
        battle.log.push({ text: `反射对 ${options.actor.name} 造成 ${reflect} 点伤害。`, kind: 'damage' });
        dealDamageToEnemy(state, options.actor, reflect, { label: '反射' });
      }
    }
    if (state.hp <= 0) { battle.finished = true; battle.phase = 'lost'; state.result = 'defeat'; }
  }

  // 直接对玩家造成伤害而不触发反射（用于中毒、灼烧等持续效果）。
  function loseHp(state, amount, label) {
    state.hp = Math.max(0, state.hp - amount);
    if (state.battle) state.battle.log.push({ text: `你失去 ${amount} 点生命${label ? `（${label}）` : ''}。`, kind: 'hurt' });
    if (state.hp <= 0) { state.battle.finished = true; state.battle.phase = 'lost'; state.result = 'defeat'; }
  }

  function heal(state, amount) {
    const before = state.hp;
    state.hp = Math.min(state.maxHp, state.hp + amount);
    const healed = state.hp - before;
    if (state.battle && healed > 0) state.battle.log.push({ text: `你恢复了 ${healed} 点生命。`, kind: 'heal' });
    return healed;
  }

  function gainBlock(state, amount, label, enemy) {
    const battle = state.battle;
    const statuses = enemy ? enemy.statuses : battle.statuses;
    let value = amount + statusOf(statuses, 'dexterity');
    if (statusOf(statuses, 'frail')) value = Math.floor(value * 0.75);
    value = Math.max(0, value);
    if (enemy) enemy.block += value;
    else battle.block += value;
    if (value > 0) battle.log.push({ text: `${enemy ? enemy.name : '你'} 获得 ${value} 点格挡${label ? `（${label}）` : ''}。`, kind: 'block' });
    return value;
  }

  function addStatus(state, target, key, value, label) {
    const battle = state.battle;
    if (!battle || !target || !cards.STATUS[key]) return;
    const statuses = target === 'player' ? battle.statuses : target.statuses;
    statuses[key] = (statuses[key] || 0) + value;
    if (statuses[key] <= 0) delete statuses[key];
    const name = target === 'player' ? '你' : target.name;
    battle.log.push({ text: `${name} 获得 ${value} 层${cards.STATUS[key].name}${label ? `（${label}）` : ''}。`, kind: cards.NEGATIVE.includes(key) ? 'status' : 'good' });
  }

  function drawCards(state, count) {
    const battle = state.battle;
    if (!battle) return 0;
    let drawn = 0;
    for (let index = 0; index < count; index++) {
      if (battle.hand.length >= HAND_LIMIT) { battle.log.push({ text: '手牌已满，无法继续抽牌。', kind: 'info' }); break; }
      if (!battle.draw.length) {
        if (!battle.discard.length) break;
        battle.draw = randomShuffle(state, battle.draw.concat(battle.discard));
        battle.discard = [];
        battle.log.push({ text: '弃牌堆已洗回抽牌堆。', kind: 'info' });
      }
      battle.hand.push(battle.draw.shift());
      drawn += 1;
    }
    return drawn;
  }

  // ---------- 效果解析 ----------
  function applyEffect(state, effect, context) {
    const battle = state.battle;
    if (!battle) return;
    const target = context.target || null;
    const actor = context.actor || null;
    const fromEnemy = context.source === 'enemy';
    const aliveTarget = target && !target.dead ? target : null;
    const scaled = effect.x ? effect.value * (context.cost || 0) : effect.value;
    switch (effect.type) {
      case 'damage': {
        for (let round = 0; round < (effect.times || 1); round++) {
          if (fromEnemy) damagePlayer(state, attackDamage(state, scaled, { source: 'enemy', attacker: actor, target: 'player' }), { source: 'enemy', actor });
          else if (effect.target === 'all') for (const enemy of aliveEnemies(battle)) dealDamageToEnemy(state, enemy, attackDamage(state, scaled, { source: 'player', target: enemy }), { source: 'player', pierce: effect.pierce });
          else if (aliveTarget) dealDamageToEnemy(state, aliveTarget, attackDamage(state, scaled, { source: 'player', target: aliveTarget }), { source: 'player', pierce: effect.pierce });
          if (battle.finished) break;
        }
        break;
      }
      case 'damageRandom': {
        for (let round = 0; round < (effect.times || 1); round++) {
          const pool = aliveEnemies(battle);
          if (!pool.length) break;
          const enemy = pool[randomInt(state, pool.length)];
          dealDamageToEnemy(state, enemy, attackDamage(state, effect.value, { source: 'player', target: enemy }), { source: 'player' });
        }
        break;
      }
      case 'bonusIfAttacks': {
        if (!aliveTarget) break;
        const bonus = battle.attacksPlayed * effect.per;
        if (bonus > 0) dealDamageToEnemy(state, aliveTarget, attackDamage(state, bonus, { source: 'player', target: aliveTarget }), { source: 'player', label: '连击' });
        break;
      }
      case 'bonusIfGuarded': {
        if (!aliveTarget || aliveTarget.block <= 0) break;
        dealDamageToEnemy(state, aliveTarget, attackDamage(state, effect.value, { source: 'player', target: aliveTarget }), { source: 'player', label: '破甲' });
        break;
      }
      case 'bonusIfStatus': {
        const pool = effect.target === 'all' ? aliveEnemies(battle) : [aliveTarget];
        for (const enemy of pool) {
          if (!enemy || !statusOf(enemy.statuses, effect.status)) continue;
          dealDamageToEnemy(state, enemy, attackDamage(state, effect.value, { source: 'player', target: enemy }), { source: 'player', label: cards.STATUS[effect.status].name });
        }
        break;
      }
      case 'extraIfStatus': {
        if (!aliveTarget || !statusOf(aliveTarget.statuses, effect.status)) break;
        dealDamageToEnemy(state, aliveTarget, attackDamage(state, effect.value, { source: 'player', target: aliveTarget }), { source: 'player', label: '爆发' });
        break;
      }
      case 'damagePerStatus': {
        if (!aliveTarget) break;
        const bonus = Math.floor(statusOf(aliveTarget.statuses, effect.status) / effect.per) * effect.value;
        if (bonus > 0) dealDamageToEnemy(state, aliveTarget, attackDamage(state, bonus, { source: 'player', target: aliveTarget }), { source: 'player', label: cards.STATUS[effect.status].name });
        break;
      }
      case 'damagePerExhaust': {
        const stacks = battle.exhaust.length;
        if (!stacks) break;
        const pool = effect.target === 'all' ? aliveEnemies(battle) : [aliveTarget];
        for (const enemy of pool) {
          if (!enemy) continue;
          dealDamageToEnemy(state, enemy, attackDamage(state, stacks * effect.value, { source: 'player', target: enemy }), { source: 'player', label: '消耗' });
        }
        break;
      }
      case 'damageEqualToBlock': {
        if (!aliveTarget) break;
        dealDamageToEnemy(state, aliveTarget, attackDamage(state, battle.block, { source: 'player', target: aliveTarget }), { source: 'player', label: '格挡' });
        break;
      }
      case 'execute': {
        if (!aliveTarget || aliveTarget.dead) break;
        if (aliveTarget.hp / aliveTarget.maxHp < effect.ratio) killEnemy(state, aliveTarget);
        break;
      }
      case 'reap': {
        // 目标出牌时必定存活，此刻已死即为本次攻击所杀。
        if (!target || !target.dead) break;
        state.maxHp += effect.maxHp;
        state.hp += effect.maxHp;
        battle.log.push({ text: `收割者夺走了生命，你的最大生命 +${effect.maxHp}。`, kind: 'good' });
        break;
      }
      case 'block': {
        if (fromEnemy && actor) gainBlock(state, effect.value, null, actor);
        else gainBlock(state, effect.value);
        break;
      }
      case 'blockPerStatus': {
        const stacks = statusOf(battle.statuses, effect.status);
        if (stacks > 0) gainBlock(state, stacks * effect.value, cards.STATUS[effect.status].name);
        break;
      }
      case 'doubleBlock': {
        if (battle.block > 0) { battle.block *= 2; battle.log.push({ text: `格挡提高到 ${battle.block} 点。`, kind: 'block' }); }
        break;
      }
      case 'heal': {
        if (fromEnemy && actor) {
          const before = actor.hp;
          actor.hp = Math.min(actor.maxHp, actor.hp + effect.value);
          if (actor.hp > before) battle.log.push({ text: `${actor.name} 恢复了 ${actor.hp - before} 点生命。`, kind: 'heal' });
        } else heal(state, effect.value);
        break;
      }
      case 'loseHp': loseHp(state, effect.value, '代价'); break;
      case 'upgradeCard': {
        const target = state.deck.filter(card => !card.upgraded && cards.CARD_MAP[card.id].u);
        if (target.length) {
          const picked = target[randomInt(state, target.length)];
          picked.upgraded = true;
          if (battle) battle.log.push({ text: `「${cards.CARD_MAP[picked.id].name}」被升级。`, kind: 'good' });
        }
        break;
      }
      case 'energy': battle.energy += effect.value; battle.log.push({ text: `获得 ${effect.value} 点能量。`, kind: 'good' }); break;
      case 'draw': drawCards(state, effect.value); break;
      case 'drawTo': {
        const missing = Math.max(0, effect.value - battle.hand.length);
        if (missing) drawCards(state, missing);
        break;
      }
      case 'discardAll': {
        const count = battle.hand.length;
        battle.discard = battle.discard.concat(battle.hand);
        battle.hand = [];
        if (effect.blockEach && count) gainBlock(state, count * effect.blockEach, '护盾转换');
        break;
      }
      case 'exhaustRandom': {
        for (let index = 0; index < effect.count; index++) {
          if (!battle.hand.length) break;
          const [card] = battle.hand.splice(randomInt(state, battle.hand.length), 1);
          battle.exhaust.push(card);
          battle.log.push({ text: `「${cards.CARD_MAP[card.id].name}」被消耗。`, kind: 'info' });
        }
        break;
      }
      case 'multiplyStatus': {
        if (!aliveTarget) break;
        const stacks = statusOf(aliveTarget.statuses, effect.status);
        if (stacks > 0) addStatus(state, aliveTarget, effect.status, stacks, '疫病爆发');
        break;
      }
      case 'statusRandom': {
        if (!aliveTarget) break;
        addStatus(state, aliveTarget, randomPick(state, effect.statuses), effect.value);
        break;
      }
      case 'statusIfSkills': {
        if (!aliveTarget || battle.skillsPlayed <= 0) break;
        addStatus(state, aliveTarget, effect.status, effect.value);
        break;
      }
      case 'status': {
        const key = effect.status;
        if (effect.target === 'all') {
          if (fromEnemy) addStatus(state, 'player', key, effect.value);
          else for (const enemy of aliveEnemies(battle)) addStatus(state, enemy, key, effect.value);
        } else if (effect.target === 'self') {
          addStatus(state, fromEnemy ? (actor || 'player') : 'player', key, effect.value);
        } else if (effect.target === 'player' || fromEnemy) {
          addStatus(state, 'player', key, effect.value);
        } else if (aliveTarget) {
          addStatus(state, aliveTarget, key, effect.value);
        }
        break;
      }
      case 'purge': {
        for (const key of cards.NEGATIVE) {
          if (battle.statuses[key]) { delete battle.statuses[key]; battle.log.push({ text: `负面状态「${cards.STATUS[key].name}」被清除。`, kind: 'good' }); }
        }
        break;
      }
      case 'addCard': {
        for (let index = 0; index < effect.count; index++) {
          const entry = { uid: nextUid(state, 'x'), id: effect.card, upgraded: false };
          if (effect.destination === 'draw') battle.draw.splice(randomInt(state, battle.draw.length + 1), 0, entry);
          else if (battle.hand.length < HAND_LIMIT) battle.hand.push(entry);
          else battle.discard.push(entry);
        }
        battle.log.push({ text: `加入 ${effect.count} 张「${cards.CARD_MAP[effect.card].name}」。`, kind: 'good' });
        break;
      }
      case 'gainGold': state.gold += effect.value; if (battle) battle.log.push({ text: `获得 ${effect.value} 金币。`, kind: 'good' }); break;
      case 'spendGold': state.gold = Math.max(0, state.gold - effect.value); break;
      case 'maxHp': state.maxHp += effect.value; state.hp = Math.min(state.maxHp, state.hp + effect.value); break;
      case 'gainRelic': gainRandomRelic(state); break;
      case 'gainCard': {
        const id = rollCard(state, effect.rarity);
        state.deck.push({ uid: nextUid(state, 'r'), id, upgraded: false });
        if (battle) battle.log.push({ text: `卡组获得「${cards.CARD_MAP[id].name}」。`, kind: 'good' });
        break;
      }
      case 'gainPotion': {
        for (let index = 0; index < (effect.count || 1); index++) {
          if (state.potions.length >= 3) break;
          const potion = randomPick(state, world.POTIONS).id;
          state.potions.push(potion);
          if (battle) battle.log.push({ text: `获得药水「${world.POTION_MAP[potion].name}」。`, kind: 'good' });
        }
        break;
      }
      default: break;
    }
  }

  function checkEnd(state) {
    const battle = state.battle;
    if (!battle || battle.finished) return true;
    if (state.hp <= 0) {
      battle.finished = true;
      battle.phase = 'lost';
      state.result = 'defeat';
      return true;
    }
    if (!aliveEnemies(battle).length) {
      battle.finished = true;
      battle.phase = 'won';
      runTriggers(state, 'battleEnd');
      battle.rewards = rollRewards(state, battle.kind);
      return true;
    }
    return false;
  }

  // ---------- 奖励 ----------
  function rollCard(state, rarity) {
    const character = cards.CHAR_MAP[state.character];
    const pool = cards.rewardable(character.color, rarity);
    return randomPick(state, pool.length ? pool : cards.rewardable('neutral', rarity));
  }
  function threeCards(state, rareChance) {
    const picks = [];
    let guard = 0;
    // 深层章节的奖励质量更高，避免后期只能拿到無用卡牌。
    const chance = (rareChance || 0.05) + (state.chapter - 1) * 0.012;
    while (picks.length < 3 && guard < 80) {
      guard += 1;
      const roll = nextRandom(state);
      const rarity = roll < chance ? 'rare' : roll < chance + 0.3 ? 'uncommon' : 'common';
      const id = rollCard(state, rarity);
      if (!picks.includes(id)) picks.push(id);
    }
    return picks;
  }
  function rollRewards(state, kind) {
    const rewards = { gold: 0, cards: [], potion: null, relic: null };
    // 章节越深，金币奖励越高，保证后期的黑市购买力。
    const scale = 1 + (state.chapter - 1) * 0.22;
    const gold = value => Math.round(value * scale);
    if (kind === 'boss') {
      rewards.gold = gold(90 + randomInt(state, 30));
      rewards.relic = randomPick(state, world.BOSS_RELICS);
      rewards.cards = threeCards(state, 0.35);
    } else if (kind === 'elite') {
      rewards.gold = gold(55 + randomInt(state, 30));
      rewards.potion = nextRandom(state) < 0.6 ? randomPick(state, world.POTIONS).id : null;
      rewards.relic = randomPick(state, world.RELIC_POOL);
      rewards.cards = threeCards(state, 0.08);
    } else if (kind === 'weak') {
      rewards.gold = gold(16 + randomInt(state, 14));
      rewards.potion = nextRandom(state) < 0.25 ? randomPick(state, world.POTIONS).id : null;
      rewards.cards = threeCards(state, 0.03);
    } else {
      rewards.gold = gold(30 + randomInt(state, 26));
      rewards.potion = nextRandom(state) < 0.4 ? randomPick(state, world.POTIONS).id : null;
      rewards.cards = threeCards(state, 0.05);
    }
    return rewards;
  }
  function gainRandomRelic(state) {
    const pool = world.RELIC_POOL.filter(id => !state.relics.includes(id));
    if (!pool.length) return null;
    const picked = randomPick(state, pool);
    addRelic(state, picked);
    if (state.battle) state.battle.log.push({ text: `获得遗物「${world.RELIC_MAP[picked].name}」。`, kind: 'good' });
    return picked;
  }
  function applyRelicPickup(state, id) {
    const relic = world.RELIC_MAP[id];
    if (!relic || !relic.modifiers) return;
    if (relic.modifiers.gold) state.gold += relic.modifiers.gold;
    if (relic.modifiers.maxHp) { state.maxHp += relic.modifiers.maxHp; state.hp += relic.modifiers.maxHp; }
  }
  function addRelic(state, id) {
    if (!id || !world.RELIC_MAP[id] || state.relics.includes(id)) return false;
    state.relics.push(id);
    applyRelicPickup(state, id);
    return true;
  }
  function takeGold(state) {
    const rewards = state.battle && state.battle.rewards;
    if (!rewards || state.battle.goldTaken) return 0;
    state.battle.goldTaken = true;
    state.gold += rewards.gold;
    return rewards.gold;
  }
  function takeCardReward(state, cardId) {
    const rewards = state.battle && state.battle.rewards;
    if (!rewards || !rewards.cards.includes(cardId)) return false;
    state.deck.push({ uid: nextUid(state, 'w'), id: cardId, upgraded: false });
    rewards.cards = [];
    return true;
  }
  function takePotionReward(state) {
    const rewards = state.battle && state.battle.rewards;
    if (!rewards || !rewards.potion || state.potions.length >= 3) return false;
    state.potions.push(rewards.potion);
    rewards.potion = null;
    return true;
  }
  function takeRelicReward(state) {
    const rewards = state.battle && state.battle.rewards;
    if (!rewards || !rewards.relic) return false;
    addRelic(state, rewards.relic);
    rewards.relic = null;
    return true;
  }
  function skipRewards(state) {
    const rewards = state.battle && state.battle.rewards;
    if (!rewards) return;
    rewards.cards = [];
    rewards.potion = null;
    rewards.relic = null;
  }

  // ---------- 玩家操作 ----------
  function cardCost(state, card) {
    const definition = cards.card(card.id, card.upgraded);
    return definition.x ? state.battle.energy : definition.cost;
  }
  function canPlay(state, card) {
    const battle = state.battle;
    if (!battle || battle.phase !== 'player' || battle.finished) return false;
    const definition = cards.card(card.id, card.upgraded);
    if (definition.x ? battle.energy < 1 : battle.energy < definition.cost) return false;
    if (definition.target === 'enemy' && !aliveEnemies(battle).length) return false;
    return true;
  }
  function playCard(state, uid, targetUid) {
    const battle = state.battle;
    if (!battle || battle.phase !== 'player' || battle.finished) return false;
    const index = battle.hand.findIndex(card => card.uid === uid);
    if (index < 0) return false;
    const entry = battle.hand[index];
    const definition = cards.card(entry.id, entry.upgraded);
    const cost = definition.x ? battle.energy : definition.cost;
    if (definition.x ? cost < 1 : battle.energy < cost) return false;
    const pool = aliveEnemies(battle);
    let target = targetUid ? pool.find(enemy => enemy.uid === targetUid) : null;
    if (definition.target === 'enemy' && !target) target = pool[0];
    if (definition.target === 'enemy' && !target) return false;
    battle.energy -= cost;
    battle.hand.splice(index, 1);
    state.stats.cards += 1;
    battle.log.push({ text: `你打出「${definition.name}」。`, kind: 'player' });
    // 胜利后剩余效果照常结算（例如收割者的击杀奖励），只有玩家倒下才中止。
    for (const effect of definition.effects || []) {
      applyEffect(state, effect, { source: 'player', target, cost });
      if (state.result) break;
    }
    if (!battle.finished) {
      if (definition.type === 'attack') {
        battle.attacksPlayed += 1;
        if (statusOf(battle.statuses, 'resonance')) addStatus(state, 'player', 'focus', statusOf(battle.statuses, 'resonance'), '共鸣');
      } else if (definition.type === 'skill') {
        battle.skillsPlayed += 1;
        if (statusOf(battle.statuses, 'skillBlock')) gainBlock(state, statusOf(battle.statuses, 'skillBlock'), '战术大师');
      } else if (definition.type === 'power') {
        battle.powersPlayed += 1;
      }
    }
    if (definition.exhaust || definition.type === 'power') battle.exhaust.push(entry);
    else battle.discard.push(entry);
    refreshIntents(state);
    checkEnd(state);
    return true;
  }

  function usePotion(state, index, targetUid) {
    const id = state.potions[index];
    const potion = id && world.POTION_MAP[id];
    if (!potion) return false;
    const battle = state.battle;
    if (battle && !battle.finished) {
      const pool = aliveEnemies(battle);
      const target = (targetUid && pool.find(enemy => enemy.uid === targetUid)) || pool[0] || null;
      battle.log.push({ text: `你使用了「${potion.name}」。`, kind: 'player' });
      for (const effect of potion.effects) {
        applyEffect(state, effect, { source: 'player', target });
        if (battle.finished) break;
      }
      refreshIntents(state);
    } else {
      let used = false;
      for (const effect of potion.effects) {
        if (effect.type === 'heal') { heal(state, effect.value); used = true; }
        else if (effect.type === 'maxHp') { state.maxHp += effect.value; state.hp += effect.value; used = true; }
      }
      if (!used) return false;
    }
    state.potions.splice(index, 1);
    return true;
  }

  // ---------- 地图推进 ----------
  const nextNode = state => state.map[state.floor] || null;
  function enterNode(state) {
    if (state.result) return null;
    if (state.battle && !state.battle.finished) return null;
    state.battle = null;
    if (state.floor >= state.map.length) { finishChapter(state); return null; }
    state.floor += 1;
    state.stats.floors = Math.max(state.stats.floors, state.floor);
    const node = state.map[state.floor - 1];
    if (node.type === 'fight' || node.type === 'elite' || node.type === 'boss') startBattle(state, node.battle);
    return node;
  }
  function finishChapter(state) {
    state.battle = null;
    if (state.chapter >= world.CHAPTERS.length) { state.result = 'victory'; return true; }
    state.chapter += 1;
    state.floor = 0;
    state.map = world.createMap(state.chapter, createRng(state.seed + state.chapter * 977));
    const bonus = chapterGrowth(state);
    state.pending = { chapterIntro: state.chapter, growth: bonus };
    return true;
  }
  const restHeal = state => Math.round(state.maxHp * (0.32 + Math.min(state.chapter, 12) * 0.016));
  const restAtCamp = state => heal(state, restHeal(state));
  function smithCard(state, uid) {
    const card = state.deck.find(item => item.uid === uid);
    if (!card || card.upgraded || !cards.CARD_MAP[card.id].u) return false;
    card.upgraded = true;
    return true;
  }
  function removeCard(state, uid) {
    const index = state.deck.findIndex(item => item.uid === uid);
    if (index < 0 || state.deck.length <= 5) return false;
    state.deck.splice(index, 1);
    return true;
  }

  // ---------- 商店与事件 ----------
  function shopInventory(state) {
    const discount = modifiers(state).shopDiscount || 0;
    const price = value => Math.max(1, Math.round(value * (1 - discount)));
    const relics = world.RELIC_POOL.filter(id => !state.relics.includes(id));
    const relicPicks = [];
    for (let index = 0; index < 2 && relics.length; index++) {
      const picked = randomPick(state, relics);
      relics.splice(relics.indexOf(picked), 1);
      relicPicks.push(picked);
    }
    return {
      cards: threeCards(state, 0.1).map(id => ({ id, price: price(cards.CARD_MAP[id].rarity === 'rare' ? 145 : cards.CARD_MAP[id].rarity === 'uncommon' ? 105 : 62) })),
      relics: relicPicks.map(id => ({ id, price: price(150) })),
      potions: [randomPick(state, world.POTIONS).id, randomPick(state, world.POTIONS).id].map(id => ({ id, price: price(70) })),
      removePrice: price(75),
    };
  }
  function resolveEvent(state, optionIndex) {
    const node = state.map[state.floor - 1];
    const event = node && node.type === 'event' ? world.EVENT_MAP[node.event] : null;
    if (!event || !event.options[optionIndex]) return null;
    const option = event.options[optionIndex];
    // 事件效果在战斗外的轻量上下文中结算，避免依赖战斗状态。
    state.battle = {
      kind: 'event', enemies: [], draw: [], hand: [], discard: [], exhaust: [], statuses: {},
      energy: 0, maxEnergy: 0, block: 0, turn: 0, phase: 'event', log: [], attacksPlayed: 0,
      skillsPlayed: 0, powersPlayed: 0, finished: true, rewards: null, event: event.id,
    };
    for (const result of option.results) applyEffect(state, result, { source: 'event' });
    state.battle = null;
    state.pending = { eventResult: { event: event.id, label: option.label, log: option.log } };
    return option;
  }

  // ---------- 存档 ----------
  function serialize(state) { return JSON.stringify(state); }
  function deserialize(text) {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') return null;
      return migrate(parsed);
    } catch { return null; }
  }
  function migrate(state) {
    if (state.version === undefined || state.version > VERSION) return null;
    state.version = VERSION;
    if (!cards.CHAR_MAP[state.character]) state.character = cards.CHARACTERS[0].id;
    if (!Array.isArray(state.deck)) state.deck = [];
    if (!Array.isArray(state.relics)) state.relics = [];
    if (!Array.isArray(state.potions)) state.potions = [];
    if (!Array.isArray(state.map)) state.map = [];
    if (!Number.isFinite(state.rng)) state.rng = 1;
    if (!Number.isFinite(state.floor)) state.floor = 0;
    if (!Number.isFinite(state.chapter)) state.chapter = 1;
    if (!Number.isFinite(state.maxHp)) state.maxHp = cards.CHAR_MAP[state.character].maxHp;
    if (!Number.isFinite(state.hp)) state.hp = state.maxHp;
    if (state.result) state.hp = Math.min(state.hp, state.maxHp);
    else state.hp = Math.max(1, Math.min(state.hp, state.maxHp));
    if (!state.stats) state.stats = { battles: 0, kills: 0, damage: 0, cards: 0, floors: 0, started: Date.now() };
    if (!state.battle && !state.result && state.map.length && state.floor >= state.map.length) finishChapter(state);
    return state;
  }

  return {
    VERSION, HAND_LIMIT, DRAW_BASE, clone, statusOf, modifiers, aliveEnemies, nextNode, createRng, chapterGrowth, nextUid,
    baseEnergy, maxEnergyOf: baseEnergy,
    newState, startBattle, canPlay, cardCost, playCard, endPlayerTurn, resolveEnemyTurn, stepEnemyAction,
    usePotion, enterNode, finishChapter, restHeal, restAtCamp, smithCard, removeCard, shopInventory, resolveEvent,
    addRelic, gainRandomRelic, heal, loseHp, addStatus, gainBlock, damagePlayer, dealDamageToEnemy,
    drawCards, applyEffect, serialize, deserialize, takeGold, takeCardReward, takePotionReward,
    takeRelicReward, skipRewards, rollRewards, threeCards, pickIntent, intentDamage, refreshIntents,
  };
});