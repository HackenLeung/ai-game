(function (root, factory) {
  const events = factory();
  if (typeof module === 'object' && module.exports) module.exports = events;
  else root.MotaEvents = events;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_LOOP = 500;
  const MAX_DEPTH = 24;

  class BreakSignal { constructor(n) { this.n = n || 1; } }
  class ExitSignal { constructor() {} }

  // 执行一段剧本（动作数组）。字符串 = 一句对话。
  async function run(game, actions, ctx, depth) {
    if (!actions) return;
    ctx = ctx || {};
    if (ctx.x == null) ctx.x = game.hero().loc.x;
    if (ctx.y == null) ctx.y = game.hero().loc.y;
    if (ctx.floorId == null) ctx.floorId = game.state.floorId;
    ctx.vars = ctx.vars || {};
    ctx.temp = ctx.temp || {};
    depth = depth || 0;
    if (depth > MAX_DEPTH) return;
    const list = Array.isArray(actions) ? actions : [actions];
    const top = depth === 0;
    try {
      for (const raw of list) {
        if (raw == null) continue;
        if (typeof raw === 'string') {
          await game.say(game.interpolate(raw, ctx));
          continue;
        }
        await action(game, raw, ctx, depth);
        if (game.state.win || game.state.gameOver) return;
      }
    } catch (err) {
      // break / exit 只在最外层被吞掉；内层交给 while / for 处理
      if (top && (err instanceof BreakSignal || err instanceof ExitSignal)) return;
      throw err;
    }
  }

  async function action(game, a, ctx, depth) {
    switch (a.type) {
      case 'if': {
        const ok = !!game.evaluate(a.condition, ctx);
        await run(game, ok ? a.true : a.false, ctx, depth + 1);
        return;
      }
      case 'switch': {
        const value = game.evaluate(a.condition, ctx);
        let matched = null;
        let fallback = null;
        for (const c of a.caseList || []) {
          if (c.case === 'default') { fallback = c; continue; }
          let key;
          try { key = game.evaluate(c.case, ctx); } catch (e) { key = c.case; }
          if (matched == null && value == key) matched = c;
        }
        const chosen = matched || fallback;
        if (chosen) await run(game, chosen.action, ctx, depth + 1);
        return;
      }
      case 'while': {
        let i = 0;
        while (game.evaluate(a.condition, ctx) && i < MAX_LOOP) {
          i++;
          try {
            await run(game, a.data, ctx, depth + 1);
          } catch (err) {
            if (err instanceof BreakSignal) {
              if (err.n > 1) throw new BreakSignal(err.n - 1);
              break;
            }
            throw err;
          }
          if (game.state.win || game.state.gameOver) break;
        }
        return;
      }
      case 'for': {
        const from = Number(game.evaluate(a.from, ctx));
        const to = Number(game.evaluate(a.to, ctx));
        const step = Number(game.evaluate(a.step, ctx)) || 1;
        const key = a.name || 'temp:A';
        let i = 0;
        for (let v = from; step > 0 ? v <= to : v >= to; v += step) {
          if (i++ > MAX_LOOP) break;
          game.setTemp(key, v);
          try {
            await run(game, a.data, ctx, depth + 1);
          } catch (err) {
            if (err instanceof BreakSignal) {
              if (err.n > 1) throw new BreakSignal(err.n - 1);
              break;
            }
            throw err;
          }
          if (game.state.win || game.state.gameOver) break;
        }
        return;
      }
      case 'break':
        throw new BreakSignal(a.n || 1);
      case 'exit':
        throw new ExitSignal();
      case 'setValue': {
        const value = game.evaluate(a.value, ctx);
        game.setValue(a.name, value, a.operator || 'set');
        game.ui.update();
        return;
      }
      case 'choices': {
        const text = game.interpolate(a.text, ctx);
        const source = (a.choices || []).filter(c => !c.condition || game.evaluate(c.condition, ctx));
        const index = await game.choose(text, source.map(c => game.interpolate(c.text, ctx)));
        if (index >= 0 && source[index]) await run(game, source[index].action, ctx, depth + 1);
        return;
      }
      case 'tip':
        game.ui.tip(game.interpolate(a.text, ctx));
        return;
      case 'playSound':
        game.ui.sound(a.name);
        return;
      case 'update':
        game.ui.update();
        return;
      case 'insert':
        await game.runCommonEvent(a.name, a.args || [], ctx);
        return;
      case 'hide':
        game.hideBlocks(a.loc, ctx, a.floorId || ctx.floorId, !!a.remove);
        game.ui.update();
        return;
      case 'show':
        game.showBlocks(a.loc, ctx, a.floorId || ctx.floorId);
        game.ui.update();
        return;
      case 'setBlock':
        game.setBlocks(a.loc, a.number, ctx, a.floorId || ctx.floorId);
        game.ui.update();
        return;
      case 'openDoor':
        game.openDoorLocs(a.loc, ctx, a.floorId || ctx.floorId);
        game.ui.update();
        return;
      case 'closeDoor':
        game.closeDoorLocs(a.loc, a.number, ctx, a.floorId || ctx.floorId);
        game.ui.update();
        return;
      case 'setEnemy':
        game.setEnemyStat(a.id, a.name, a.operator, game.evaluate(a.value, ctx));
        return;
      case 'moveHero':
        await game.moveHeroSteps(a.steps || []);
        game.ui.update();
        return;
      case 'battle':
        await game.scriptBattle(a.id, ctx);
        return;
      case 'zeroHpBattle':
        await game.zeroHpBattle(a.enemy, ctx);
        return;
      case 'changeFloor':
        await game.changeFloorById(a.floorId, a.loc, ctx);
        return;
      case 'win':
        await game.doWin(game.interpolate(a.reason, ctx));
        return;
      case 'recordTalk': {
        const suffix = game.getFlag('arg4') ? '02' : '';
        game.setValue('flag:对话' + game.getFlag('arg1') + suffix, true, 'set');
        return;
      }
      case 'recordTrader': {
        const name = game.state.floorId + '@' + game.getFlag('arg2') + '@' + game.getFlag('arg3') + '@A';
        game.setValue('flag:' + name, 1, 'set');
        return;
      }
      case 'recordShop':
        game.recordShop(a.kind);
        return;
      case 'sleep':
      case 'waitAsync':
      case 'comment':
        return;
      default:
        // 未知动作：静默跳过，避免卡死事件流
        return;
    }
  }

  return { run };
});
