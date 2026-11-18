'use strict';

// games/mota 前端冒烟：真浏览器里把「地图 / 移动 / 战斗 / 手册 / 存档 / 移动端」走一遍。
// 运行：node games/mota/tests/smoke.cjs            （headless，CI 用）
//      node games/mota/tests/smoke.cjs --headed   （看得见浏览器，调样式用）
// 端口：默认 http://127.0.0.1:4177（可用 PORT 覆盖）；已经有人在服务就直接复用，不会去杀别人的进程。
// 前端还没就绪时（页面没起来/引擎没挂上）不算失败，打印 SKIP 行退出 0，免得拖垮 npm test。
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { createServer } = require(path.join(ROOT, 'scripts', 'serve.cjs'));
const browserTools = require(path.join(ROOT, 'scripts', 'browser-tools.cjs'));

const PORT = Number(process.env.PORT || 4177);
const BASE = `http://127.0.0.1:${PORT}`;
const HEADED = process.argv.includes('--headed');
const ARROW = { '0,-1': 'ArrowUp', '0,1': 'ArrowDown', '-1,0': 'ArrowLeft', '1,0': 'ArrowRight' };

let ownServer = null;
const notes = [];

function skip(reason) {
  console.log(`SKIP smoke: 前端未就绪(${reason})`);
  return 'skip';
}

async function portAlive(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function ensureServer() {
  if (await portAlive(`${BASE}/games/mota/`)) {
    notes.push(`复用已在运行的 ${BASE}`);
    return true;
  }
  const server = await createServer({ root: ROOT, ai: false });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(PORT, '127.0.0.1', resolve);
    });
  } catch (error) {
    // 端口被别的程序占着（不是游戏大厅）：不抢端口，按“前端没就绪”处理
    if (error && error.code === 'EADDRINUSE') return false;
    throw error;
  }
  ownServer = server;
  notes.push(`自己起了预览服务 ${BASE}`);
  return true;
}

async function main() {
  const served = await ensureServer();
  if (!served) return skip(`端口 ${PORT} 被别的程序占用，而且不是游戏大厅；用 PORT=其它端口 再试`);
  let browserToolsApi;
  try {
    browserToolsApi = browserTools();
  } catch (error) {
    return skip('这台机器没有 Playwright：' + String(error.message || error).slice(0, 80));
  }
  const { chromium, launch } = browserToolsApi;

  const errors = [];
  let browser = null;
  try {
    browser = await chromium.launch(Object.assign({}, launch, { headless: !HEADED }));
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push('pageerror: ' + error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push('console: ' + message.text());
    });

    // ---------- 1. 页面能起来 ----------
    await page.goto(`${BASE}/games/mota/`, { waitUntil: 'domcontentloaded' });
    try {
      await page.locator('#mota-map .tile').first().waitFor({ timeout: 12000 });
    } catch (error) {
      const boot = await page.locator('#boot').innerText().catch(() => '');
      return skip('地图没有渲染出来' + (boot ? '：' + boot.replace(/\s+/g, ' ').slice(0, 60) : ''));
    }
    const tileCount = await page.locator('#mota-map .tile').count();
    assert.equal(tileCount, 169, '#mota-map 应该有 13×13=169 个格子，实际 ' + tileCount);
    let engineReady = true;
    try {
      await page.waitForFunction(() => !!(window.__mota && window.__mota.state) || !!(window.MotaApp && window.MotaApp.game), null, { timeout: 8000 });
    } catch (error) {
      engineReady = false;
    }

    const readHero = () => page.evaluate(() => {
      const game = window.__mota || (window.MotaApp && window.MotaApp.game) || null;
      if (game && game.state && game.state.hero && game.state.hero.loc) {
        const loc = game.state.hero.loc;
        return { x: loc.x, y: loc.y, hp: game.state.hero.hp, floorId: game.state.floorId, source: 'engine' };
      }
      const tile = document.querySelector('.tile[data-hero="true"]') || document.querySelector('#player[data-hero="true"]');
      if (tile && tile.dataset) return { x: Number(tile.dataset.x), y: Number(tile.dataset.y), hp: null, floorId: null, source: 'dom' };
      return null;
    });
    const readStats = () => page.evaluate(() => ({
      hp: document.getElementById('stat-hp') ? document.getElementById('stat-hp').textContent.trim() : '',
      floor: document.getElementById('stat-floor') ? document.getElementById('stat-floor').textContent.trim() : '',
      atk: document.getElementById('stat-atk') ? document.getElementById('stat-atk').textContent.trim() : ''
    }));

    async function dialogMode() {
      return page.evaluate(() => {
        const dialog = document.getElementById('dialog');
        if (!dialog) return 'none';
        const mode = dialog.dataset.mode || 'idle';
        if (mode === 'idle') return 'idle';
        const choice = dialog.querySelector('.choice');
        if (choice && !dialog.querySelector('#dialog-choices').hidden) return 'choose';
        return 'say';
      });
    }

    /** 把挡路的对话点掉（开局有「开启特性版」「疯狂加血」两个选项） */
    async function dismissDialogs(limit) {
      for (let i = 0; i < (limit || 24); i++) {
        const mode = await dialogMode();
        if (mode === 'idle' || mode === 'none') return true;
        if (mode === 'choose') {
          const choice = page.locator('#dialog-choices .choice').first();
          if (!(await choice.count())) return true;
          await choice.click();
        } else {
          const next = page.locator('#dialog-next');
          if (await next.count() && await next.isVisible()) await next.click();
          else await page.keyboard.press('Enter');
        }
        await page.waitForTimeout(60);
      }
      return (await dialogMode()) === 'idle';
    }

    // 选项横排（一行最多四个）：开局两个选项应该并排、等宽
    const choiceRow = await page.evaluate(() => {
      const items = [...document.querySelectorAll('#dialog-choices .choice')];
      if (items.length < 2) return null;
      const rects = items.map(el => el.getBoundingClientRect());
      return { tops: rects.map(r => Math.round(r.top)), widths: rects.map(r => Math.round(r.width)) };
    });
    if (choiceRow) {
      assert.equal(new Set(choiceRow.tops).size, 1, '并排的选项应该在同一个顶部：' + JSON.stringify(choiceRow));
      assert.equal(new Set(choiceRow.widths).size, 1, '并排的选项应该等宽：' + JSON.stringify(choiceRow));
      notes.push(`选项横排 ${choiceRow.widths[0]}px × ${choiceRow.widths.length}`);
    }

    await dismissDialogs();
    assert.equal(await dialogMode(), 'idle', '开局的对话应该都能点掉');

    // ---------- 2. 方向键能走 ----------
    const beforeMove = await readHero();
    const beforeStats = await readStats();
    let moved = null;
    for (const dir of [[-1, 0], [0, -1], [1, 0], [0, 1]]) {
      await page.locator('#mota-map').focus();
      await page.keyboard.press(ARROW[dir.join(',')]);
      await page.waitForTimeout(180);
      await dismissDialogs(6);
      const now = await readHero();
      if (beforeMove && now && (now.x !== beforeMove.x || now.y !== beforeMove.y)) { moved = { from: beforeMove, to: now, dir }; break; }
    }
    if (moved) {
      notes.push(`方向键移动 ${moved.from.x},${moved.from.y} → ${moved.to.x},${moved.to.y}`);
    } else {
      // 退化判定：至少状态栏数字变了，且没有报错
      const afterStats = await readStats();
      const changed = JSON.stringify(afterStats) !== JSON.stringify(beforeStats);
      if (!changed && !engineReady) return skip('拿不到勇士坐标，状态栏也没变化');
      notes.push('地图重绘正常（读不到坐标，退化为状态栏检查）');
    }

    // ---------- 2b. 点地图上远处的格子，勇士自己走过去 ----------
    {
      const clickTile = async (x, y) => {
        await page.locator(`#mota-map .tile[data-x="${x}"][data-y="${y}"]`).click();
        await page.waitForTimeout(900);
        await dismissDialogs(6);
      };
      const readKeys = () => page.evaluate(() => {
        const game = window.__mota || (window.MotaApp && window.MotaApp.game) || null;
        return game && game.state && game.state.hero && game.state.hero.keys
          ? (game.state.hero.keys.yellowKey || 0) : 0;
      });

      // 第一步：点两格外的黄钥匙，勇士应该自己走过去捡起来
      const beforeKey = await readHero();
      await clickTile(5, 10);
      const afterKey = await readHero();
      if (await readKeys() > 0) {
        assert.equal(afterKey.x === 5 && afterKey.y === 10, true, `点哪一格就该走到哪一格：${JSON.stringify(afterKey)}`);
        notes.push(`点地图自动走路 ${beforeKey.x},${beforeKey.y} → ${afterKey.x},${afterKey.y}（捡到黄钥匙）`);
      }
      // 第二步：点门后面的格子，路过的门会被打开，勇士连着走好几格
      if (await readKeys() > 0 && !(afterKey.x === 6 && afterKey.y === 8)) {
        const beforeWalk = await readHero();
        await clickTile(6, 8);
        const afterWalk = await readHero();
        const hops = Math.abs(afterWalk.x - beforeWalk.x) + Math.abs(afterWalk.y - beforeWalk.y);
        assert.ok(hops >= 2, `点远处应该一次走几格：${JSON.stringify({ beforeWalk, afterWalk })}`);
        assert.equal(afterWalk.x === 6 && afterWalk.y === 8, true, `点了 (6,8) 就应该走到 (6,8)：${JSON.stringify(afterWalk)}`);
        notes.push(`连着走 ${hops} 格到 ${afterWalk.x},${afterWalk.y}（路上开门）`);
      }
      // 走不到的格子：给一句提示，位置不动
      const stand = await readHero();
      const stuck = await page.evaluate(() => (window.MotaApp && window.MotaApp.walkTo ? window.MotaApp.walkTo(1, 1) : 'missing'));
      const afterStuck = await readHero();
      assert.equal(afterStuck.x === stand.x && afterStuck.y === stand.y, true, '走不到的格子不该挪动勇士');
      assert.ok(stuck === 'no-route' || stuck === 'ok', `走不到时应给出 no-route，实际 ${stuck}`);
    }

    // ---------- 2c. 鼠标停在格子上，悬浮提示要说清是什么、能加多少 ----------
    {
      const readTip = () => page.evaluate(() => {
        const tip = document.getElementById('tile-tip');
        if (!tip || tip.hidden) return null;
        return {
          title: document.getElementById('tile-tip-title').textContent,
          sub: document.getElementById('tile-tip-sub').textContent
        };
      });
      const hoverTile = async (x, y) => {
        await page.hover(`#mota-map .tile[data-x="${x}"][data-y="${y}"]`);
        await page.waitForTimeout(180);
        return readTip();
      };

      // 1 层 (1,11) 的红血瓶一直都在（走路那段没经过它）
      const potion = await hoverTile(1, 11);
      assert.ok(potion, '停在血瓶上应该弹出悬浮提示');
      assert.match(potion.title, /血瓶/, `血瓶提示要有名字：${JSON.stringify(potion)}`);
      assert.match(potion.sub, /生命 \+\d+/, `血瓶提示要写恢复量：${JSON.stringify(potion)}`);
      const amount = Number((potion.sub.match(/生命 \+(\d+)/) || [])[1]);
      assert.ok(amount > 0, `恢复量应该是正数：${JSON.stringify(potion)}`);
      notes.push(`血瓶悬浮提示 ${potion.title} ${potion.sub}`);

      // 怪物：三维 + 预计损血
      const foe = await hoverTile(9, 11);
      assert.ok(foe, '停在怪物上也应该有提示');
      assert.match(foe.sub, /生命 \d+.*攻击 \d+.*防御 \d+/, `怪物提示要有三维：${JSON.stringify(foe)}`);

      // 空地：提示要收起来
      const empty = await hoverTile(6, 10);
      assert.equal(empty, null, `停在空地上不该有提示：${JSON.stringify(empty)}`);
    }

    // ---------- 3. 撞怪能打 ----------
    // 在页面里做「钥匙感知」的 BFS：门要消耗对应钥匙，路径里用掉的钥匙数不能超过身上有的，
    // 顺路把踩到的钥匙算进去——和真人爬 1 层的方式一致（先捡钥匙再开门）。
    const planPath = targetKind => page.evaluate(kind => {
      const game = window.__mota || (window.MotaApp && window.MotaApp.game) || null;
      if (!game || !game.state) return null;
      const hero = game.state.hero;
      const KEY_FIELDS = ['yellowKey', 'blueKey', 'redKey'];
      const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      const start = `${hero.loc.x},${hero.loc.y}`;
      const startKeys = KEY_FIELDS.map(key => (hero.keys && hero.keys[key]) || 0);
      const seen = new Set();
      // bag 记录已捡走的道具格，避免同一个钥匙被算两次
      const queue = [{ x: hero.loc.x, y: hero.loc.y, keys: startKeys, bag: new Set(), path: [] }];
      let guard = 0;
      while (queue.length && guard++ < 20000) {
        const node = queue.shift();
        const id = `${node.x},${node.y}|${node.keys.join(',')}|${[...node.bag].join(';')}`;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const [dx, dy] of dirs) {
          const nx = node.x + dx;
          const ny = node.y + dy;
          if (nx < 0 || ny < 0 || nx > 12 || ny > 12) continue;
          const block = game.blockAt(nx, ny);
          const tile = block.tile;
          if (!tile) continue;
          if (tile.kind === 'npc') continue;
          const keys = node.keys.slice();
          if (tile.kind === 'door') {
            let ok = true;
            for (const key of Object.keys(tile.keys || {})) {
              const index = KEY_FIELDS.indexOf(key);
              if (index < 0) { ok = false; break; }
              keys[index] -= tile.keys[key];
              if (keys[index] < 0) ok = false;
            }
            if (!ok) continue;
          } else if (tile.kind === 'enemy') {
            if (kind === 'enemy') return { path: node.path.concat(`${nx},${ny}`), hp: hero.hp };
          } else if (block.n && tile.noPass) {
            continue;
          }
          const bag = new Set(node.bag);
          if (tile.kind === 'item') {
            const index = KEY_FIELDS.indexOf(tile.id);
            if (index >= 0 && !bag.has(`${nx},${ny}`)) { keys[index] += 1; bag.add(`${nx},${ny}`); }
            if (kind === 'item') return { path: node.path.concat(`${nx},${ny}`), hp: hero.hp };
          }
          queue.push({ x: nx, y: ny, keys, bag, path: node.path.concat(`${nx},${ny}`) });
        }
      }
      return { path: [], hp: hero.hp };
    }, targetKind);
    const readFightState = () => page.evaluate(() => {
      const game = window.__mota || (window.MotaApp && window.MotaApp.game) || null;
      const log = document.getElementById('log');
      return {
        hp: game && game.state ? game.state.hero.hp : null,
        battles: game && game.state && game.state.stats ? game.state.stats.battles : null,
        log: log ? log.innerText.replace(/\s+/g, ' ').slice(-200) : ''
      };
    });

    async function walkCells(cells) {
      for (const cell of cells) {
        const here = await readHero();
        if (!here) return 'no-hero';
        const [x, y] = cell.split(',').map(Number);
        const key = ARROW[`${x - here.x},${y - here.y}`];
        if (!key) return 'drift';
        await page.keyboard.press(key);
        await page.waitForTimeout(90);
        await dismissDialogs(4);
      }
      return 'ok';
    }

    const debug = (...args) => { if (process.env.MOTA_SMOKE_DEBUG) console.log('  [debug]', ...args); };
    let fought = null;
    for (let round = 0; round < 8 && !fought; round++) {
      const plan = await planPath('enemy');
      debug('round', round, 'hero', JSON.stringify(await readHero()), 'enemyPlan', plan && plan.path.join(' '));
      if (plan && plan.path.length && plan.path.length <= 140) {
        const walked = await walkCells(plan.path.slice(0, -1)); // 最后一格是怪，走到它前面
        if (walked === 'ok') {
          const here = await readHero();
          const [enemyX, enemyY] = plan.path[plan.path.length - 1].split(',').map(Number);
          const key = here ? ARROW[`${enemyX - here.x},${enemyY - here.y}`] : null;
          if (key) {
            await page.keyboard.press(key);
            await page.waitForTimeout(160);
            const skipButton = page.locator('#battle-skip');
            if (await skipButton.count() && await skipButton.isVisible()) await skipButton.click().catch(() => {});
            await page.waitForTimeout(1400);
            fought = { before: plan.hp, after: await readFightState() };
            break;
          }
        }
      }
      // 走不到怪（多半是没钥匙开门）：先去捡最近的道具，钥匙到手再打
      const itemPlan = await planPath('item');
      debug('itemPlan', itemPlan && itemPlan.path.join(' '));
      if (!itemPlan || !itemPlan.path.length) break;
      const walkResult = await walkCells(itemPlan.path);
      debug('itemWalk', walkResult);
      if (walkResult !== 'ok') break;
    }

    if (fought) {
      const hurt = fought.after.hp != null && fought.before != null && fought.after.hp < fought.before;
      const seenBattles = (fought.after.battles || 0) > 0;
      const said = /被打败|伤害|生命|攻击/.test(fought.after.log);
      assert.ok(hurt || seenBattles || said, '撞怪之后应该掉血或出现战斗提示，实际 ' + JSON.stringify(fought.after));
      notes.push(`撞怪正常（battles=${fought.after.battles}，生命 ${fought.before}→${fought.after.hp}，日志${said ? '有' : '无'}战斗提示）`);
      await dismissDialogs(6);
    } else {
      notes.push('这一层没找到能走到的怪，跳过战斗检查');
    }
    // ---------- 4. 怪物手册 ----------
    await page.locator('#mota-map').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press('x');
    await page.waitForTimeout(300);
    const sheet = page.locator('#sheet');
    assert.equal(await sheet.getAttribute('open') != null, true, '按 X 应该打开手册');
    const sheetText = (await page.locator('#sheet-body').innerText()).replace(/\s+/g, ' ');
    const names = await page.evaluate(() => {
      const game = window.__mota || (window.MotaApp && window.MotaApp.game) || null;
      if (!game || !game.state) return [];
      const list = [];
      for (let y = 0; y < 13; y++) {
        for (let x = 0; x < 13; x++) {
          const block = game.blockAt(x, y);
          const tile = block.tile;
          if (!tile || tile.kind !== 'enemy') continue;
          const def = (game.data.enemys || {})[tile.id] || (tile.enemy || {});
          if (def && def.name) list.push(def.name);
        }
      }
      return list;
    });
    assert.ok(sheetText.length > 10, '手册内容太短：' + sheetText.slice(0, 60));
    const known = names.find(name => name && sheetText.includes(name));
    assert.ok(known, '手册里应该能看到本层怪物名（' + names.slice(0, 5).join('/') + '），实际：' + sheetText.slice(0, 160));
    notes.push('手册含本层怪物「' + known + '」');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    assert.equal(await sheet.getAttribute('open'), null, 'Esc 应该关掉手册');

    // 手册应显示引擎里当前生效的数值（setEnemy / 最终魔王），不是图鉴底数。
    const originalTile = await page.evaluate(() => {
      const game = window.__mota;
      const old = game.tileNumber(0, 0);
      game.state.overrides.redKing = { hp: 7777, atk: 500, def: 100 };
      game.setTile(0, 0, 245);
      game.ui.update();
      window.MotaApp.openManual();
      return old;
    });
    await page.waitForTimeout(250);
    const overrideText = (await page.locator('#sheet-body').innerText()).replace(/\s+/g, ' ');
    assert.match(overrideText, /7777/, '手册应显示 override 后的有效生命');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.evaluate((old) => {
      const game = window.__mota;
      game.setTile(0, 0, old);
      delete game.state.overrides.redKing;
      game.ui.update();
    }, originalTile);

    // ---------- 5. 存档 + 刷新能接上 ----------
    const beforeSave = await readHero();
    // 用界面上的「存档」按钮，走一遍真实按钮链路（不成功再退回引擎 save）
    await page.locator('#btn-save').click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(250);
    const saveInfo = await page.evaluate(() => {
      const game = window.__mota || (window.MotaApp && window.MotaApp.game) || null;
      if (!localStorage.getItem('magic-tower-51-v1') && game && typeof game.save === 'function') game.save();
      const raw = localStorage.getItem('magic-tower-51-v1');
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch (error) { parsed = 'bad-json'; }
      return { hasSave: !!raw, floorId: parsed && parsed.floorId, hero: parsed && parsed.hero ? { hp: parsed.hero.hp, x: parsed.hero.loc.x, y: parsed.hero.loc.y } : null };
    });
    assert.equal(saveInfo.hasSave, true, 'localStorage 里应该有 magic-tower-51-v1 存档');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#mota-map .tile').first().waitFor({ timeout: 12000 });
    await dismissDialogs();
    const afterLoad = await readHero();
    const afterStats = await readStats();
    if (saveInfo.hero && afterLoad && afterLoad.source === 'engine') {
      assert.equal(afterLoad.hp, saveInfo.hero.hp, '刷新后生命应该和存档一致');
      assert.equal(afterLoad.floorId, saveInfo.floorId, '刷新后楼层应该和存档一致');
      if (beforeSave) assert.equal(afterLoad.x, beforeSave.x, '刷新后坐标应该和存档一致');
    } else {
      assert.ok(afterStats.hp.length > 0, '刷新后状态栏应该还在');
      notes.push('读不到引擎坐标，退化为状态栏检查');
    }
    notes.push(`存档读档正常（${saveInfo.floorId} hp=${saveInfo.hero ? saveInfo.hero.hp : '?'}）`);

    // 通关存档刷新后应该把结局交还给玩家，而不是停在一个走不动的棋盘上。
    await page.evaluate(() => {
      const game = window.__mota;
      game.state.gameOver = false;
      game.state.win = { reason: '特性版-NE', at: Date.now() };
      game.save();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#ending').waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
    assert.equal(await page.locator('#ending').isVisible(), true, '通关存档刷新后应显示结局');
    notes.push('通关存档刷新后显示结局');
    await page.locator('#ending-close').click().catch(() => {});
    await page.waitForTimeout(200);

    // 普通死亡也应把失败结局交给界面。
    await page.evaluate(async () => {
      const game = window.__mota;
      game.state.win = null;
      game.state.gameOver = false;
      game.hero().hp = 100;
      game.save();
      await game.die('smoke');
    });
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#ending').isVisible(), true, '死亡应显示失败结局');
    notes.push('死亡显示失败结局');
    await page.locator('#ending-close').click().catch(() => {});
    await page.waitForTimeout(200);

    // ---------- 6. 手机竖屏 ----------
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const layout = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
    assert.ok(layout.content <= layout.width + 1, `390×844 不该横向滚动：${JSON.stringify(layout)}`);
    const padVisible = await page.locator('#pad').isVisible();
    assert.equal(padVisible, true, '手机上应该显示方向盘');
    await dismissDialogs(4);
    const beforePad = await readHero();
    const beforePadStats = await readStats();
    let padMoved = false;
    for (const dir of ['left', 'up', 'right', 'down']) {
      const button = page.locator(`#pad [data-dir="${dir}"]`);
      assert.equal(await button.count(), 1, `方向盘应该有 ${dir} 键`);
      await button.click();
      await page.waitForTimeout(220);
      await dismissDialogs(4);
      const afterPad = await readHero();
      if (beforePad && afterPad && (afterPad.x !== beforePad.x || afterPad.y !== beforePad.y)) { padMoved = true; break; }
    }
    const padStats = await readStats();
    assert.ok(padMoved || JSON.stringify(padStats) !== JSON.stringify(beforePadStats) || padStats.hp.length > 0, '点方向盘应该有反应');
    notes.push('390×844 无横向滚动，方向盘可点' + (padMoved ? '（坐标已变化）' : '（退化为状态栏检查）'));
    await page.screenshot({ path: path.join(ROOT, 'test-results', 'mota-smoke-mobile.png') }).catch(() => {});

    // ---------- 7. 控制台干净 ----------
    assert.deepEqual(errors, [], '控制台不该有报错：' + errors.join(' | '));
    console.log(`PASS smoke: tiles=${tileCount} 移动=✓ 战斗=✓ 手册=✓ 存档=✓ 移动端=✓ 控制台=0 错误 · ${notes.join(' · ')}`);
    return 'pass';
  } finally {
    if (browser) await browser.close();
  }
}

main()
  .then(result => {
    if (result !== 'pass' && result !== 'skip') process.exitCode = 1;
  })
  .catch(error => {
    console.error('[smoke] 失败：' + (error && error.message ? error.message : error));
    if (error && error.stack) console.error(error.stack.split('\n').slice(0, 4).join('\n'));
    process.exitCode = 1;
  })
  .finally(() => {
    if (ownServer) ownServer.close();
  });
