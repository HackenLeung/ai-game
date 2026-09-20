'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createServer } = require('./serve.cjs');
const { ROOT } = require('./site-files.cjs');
const browserTools = require('./browser-tools.cjs');
const output = path.join(ROOT, 'test-results');
const SAVE = 'youjian-library-v1';
const EMBER = 'ember-wilderness-save-v1';
const SWORD = 'wandering-sword-v1';
const ABYSS = 'abyss-echo-save-v1';
const TOTAL_GAMES = 3;

async function abyssFitsViewport(frame, label) {
  const layout = await frame.locator('body').evaluate(() => {
    const selectors = ['.main-nav', '#hand', '#end-turn', '.energy', '#battle-log', '#hud-hp', '#potions', '.map-nodes'];
    const controls = selectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(element => element.getClientRects().length).map(element => {
      const box = element.getBoundingClientRect();
      return { selector, top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height };
    }));
    return { width: innerWidth, height: innerHeight, pageHeight: document.documentElement.scrollHeight, pageWidth: document.documentElement.scrollWidth, controls };
  });
  assert.ok(layout.pageHeight <= layout.height + 1, `${label}: the game requires page scrolling`);
  assert.ok(layout.pageWidth <= layout.width + 1, `${label}: the game overflows horizontally`);
  for (const control of layout.controls) {
    assert.ok(control.height > 0 && control.top >= -1 && control.bottom <= layout.height + 1 && control.left >= -1 && control.right <= layout.width + 1, `${label}: ${control.selector} is outside the viewport`);
  }
}

async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }));
  assert.ok(dimensions.content <= dimensions.viewport + 1, `${label} overflows: ${JSON.stringify(dimensions)}`);
}

async function emberFitsViewport(frame, label) {
  const layout = await frame.locator('body').evaluate(() => {
    const selectors = ['.main-nav', '#status-grid', '#fire-strip', '#action-grid .action-card', '#craft-filters', '#map-detail', '.inventory-heading', '#item-detail'];
    const controls = selectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(element => element.getClientRects().length).map(element => {
      const box = element.getBoundingClientRect();
      return { selector, top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height };
    }));
    return { width: innerWidth, height: innerHeight, pageHeight: document.documentElement.scrollHeight, pageWidth: document.documentElement.scrollWidth, controls };
  });
  assert.ok(layout.pageHeight <= layout.height + 1, `${label}: the game requires page scrolling`);
  assert.ok(layout.pageWidth <= layout.width + 1, `${label}: the game overflows horizontally`);
  for (const control of layout.controls) {
    assert.ok(control.height > 0 && control.top >= -1 && control.bottom <= layout.height + 1 && control.left >= -1 && control.right <= layout.width + 1, `${label}: ${control.selector} is outside the viewport`);
  }
}
async function swordFitsViewport(frame, label) {
  const layout = await frame.locator('body').evaluate(() => {
    const selectors = ['.main-nav', '#world', '.action-dock .hotkey', '#hp-value', '#mp-value', '#quest-guide', '.surroundings-panel', '.app-footer'];
    const controls = selectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(element => element.getClientRects().length).map(element => {
      const box = element.getBoundingClientRect();
      return { selector, top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height };
    }));
    return { width: innerWidth, height: innerHeight, pageHeight: document.documentElement.scrollHeight, pageWidth: document.documentElement.scrollWidth, controls };
  });
  assert.ok(layout.pageHeight <= layout.height + 1, `${label}: the game requires page scrolling`);
  assert.ok(layout.pageWidth <= layout.width + 1, `${label}: the game overflows horizontally`);
  assert.equal(layout.controls.filter(control => control.selector === '.action-dock .hotkey').length, 10, `${label}: all ten shortcuts remain visible`);
  for (const control of layout.controls) {
    assert.ok(control.height > 0 && control.top >= -1 && control.bottom <= layout.height + 1 && control.left >= -1 && control.right <= layout.width + 1, `${label}: ${control.selector} is outside the viewport`);
  }
}
async function gameFrame(page) {
  await page.locator('#game-frame').waitFor({ state: 'visible', timeout: 15000 });
  return page.frameLocator('#game-frame');
}
async function readSave(frame, key) {
  return frame.locator('body').evaluate((_, key) => JSON.parse(localStorage.getItem(key)), key);
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const root = process.argv.includes('--dist') ? path.join(ROOT, 'dist') : ROOT;
  const server = await createServer({ root });
  // Exercise the complete site under a subdirectory, as on project static hosting.
  const handle = server.listeners('request')[0];
  server.removeAllListeners('request');
  server.on('request', (request, response) => {
    if (request.url.startsWith('/collection/')) request.url = request.url.slice('/collection'.length);
    handle(request, response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/collection/`;
  const { chromium, launch } = browserTools();
  let browser;
  const errors = [];
  const watch = page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  };
  try {
    browser = await chromium.launch(launch);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    watch(page);
    await page.goto(base);
    assert.equal(await page.locator('.game-card').count(), TOTAL_GAMES);
    assert.equal(await page.locator('#featured .hero-image').evaluate(image => image.complete && image.naturalWidth > 0), true);
    await noOverflow(page, 'desktop hall');
    await page.screenshot({ path: path.join(output, 'hall-desktop.png'), fullPage: true });

    await page.keyboard.press('/');
    assert.equal(await page.locator('#search').evaluate(input => document.activeElement === input), true);
    await page.locator('#search').fill('风云诀');
    assert.equal(await page.locator('.game-card').count(), 1);
    assert.equal(await page.locator('.game-card').getAttribute('data-game'), 'fengyunjue');
    await page.locator('#search').fill('爬塔');
    assert.equal(await page.locator('.game-card').getAttribute('data-game'), 'abyss');
    await page.locator('#search').fill('不存在的世界');
    assert.equal(await page.locator('#empty-state').isVisible(), true);
    await page.locator('#reset-filters').click();
    assert.equal(await page.locator('.game-card').count(), TOTAL_GAMES);
    await page.locator('#category-filters [data-category="survival"]').click();
    assert.equal(await page.locator('.game-card').getAttribute('data-game'), 'jihuan');
    assert.equal(await page.locator('#featured').isVisible(), false);
    await page.locator('#category-filters [data-category="all"]').click();

    await page.getByRole('button', { name: '收藏逸剑风云决', exact: true }).click();
    await page.locator('[data-view="favorites"]').click();
    assert.equal(await page.locator('.game-card').count(), 1);
    await page.getByRole('button', { name: '取消收藏逸剑风云决', exact: true }).click();
    assert.equal(await page.locator('#empty-title').textContent(), '先收藏一个喜欢的世界');
    await page.locator('#reset-filters').click();
    await page.getByRole('button', { name: '收藏余烬', exact: true }).click();
    await page.reload();
    assert.equal(await page.getByRole('button', { name: '取消收藏余烬', exact: true }).getAttribute('aria-pressed'), 'true');
    console.log('PASS 搜索、别名、分类、空状态、收藏及刷新恢复');

    const other = await context.newPage();
    await other.goto(base);
    await other.getByRole('button', { name: '取消收藏余烬', exact: true }).click();
    await page.getByRole('button', { name: '收藏余烬', exact: true }).waitFor();
    await other.close();
    await page.getByRole('button', { name: '收藏余烬', exact: true }).click();
    await page.locator('[data-feature="jihuan"]').click();
    assert.equal(await page.locator('#featured h2').textContent(), '余烬');
    await page.locator('.game-card[data-game="jihuan"] .card-preview').click();
    await page.locator('#info-dialog[open]').waitFor();
    assert.match(await page.locator('#dialog-title').textContent(), /余烬/);
    await page.locator('.screenshot-disclosure summary').click();
    await page.locator('.screenshot-disclosure img').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => { const image = document.querySelector('.screenshot-disclosure img'); return image.complete && image.naturalWidth > 0; });
    assert.equal(await page.locator('.screenshot-disclosure img').evaluate(image => image.complete && image.naturalWidth > 0), true);
    await page.screenshot({ path: path.join(output, 'game-details.png'), fullPage: true });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#info-dialog').evaluate(dialog => dialog.open), false);

    await page.getByRole('link', { name: '开始游玩余烬', exact: true }).click();
    let ember = await gameFrame(page);
    for (const size of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(size);
      for (const view of ['生存', '工坊', '地图']) {
        await ember.getByRole('button', { name: view, exact: true }).first().click();
        await emberFitsViewport(ember, `${size.width}×${size.height} ${view}`);
      }
    }
    await page.setViewportSize({ width: 1440, height: 1050 });
    console.log('PASS 余烬桌面同屏操作，工坊和地图原位切换，行囊使用按钮始终可见');

    await ember.getByRole('button', { name: '工坊', exact: true }).click();
    await ember.locator('[data-action="craft"][data-id="axe"]').click();
    assert.equal((await readSave(ember, EMBER)).inventory.axe, 1);
    await page.getByRole('button', { name: '查看游戏操作说明', exact: true }).click();
    await page.getByRole('button', { name: '返回游戏', exact: true }).click();
    assert.equal(await page.locator('#info-dialog').evaluate(dialog => dialog.open), false);
    if (await page.evaluate(() => document.fullscreenEnabled)) {
      await page.getByRole('button', { name: '进入全屏', exact: true }).click();
      await page.waitForFunction(() => !!document.fullscreenElement);
      await page.getByRole('button', { name: '查看游戏操作说明', exact: true }).click();
      await page.getByRole('button', { name: '返回游戏', exact: true }).click();
      await page.getByRole('button', { name: '退出全屏', exact: true }).click();
      await page.waitForFunction(() => !document.fullscreenElement);
    }
    await page.getByRole('link', { name: '返回大厅', exact: true }).click();
    await page.locator('.recent-game').waitFor();
    assert.equal(await page.locator('.recent-game').count(), 1);
    assert.equal(await page.locator('.recent-game strong').textContent(), '余烬');
    await page.getByRole('link', { name: '继续游玩余烬', exact: true }).click();
    ember = await gameFrame(page);
    assert.equal((await readSave(ember, EMBER)).inventory.axe, 1);
    await page.screenshot({ path: path.join(output, 'ember-player-desktop.png'), fullPage: true });
    await page.getByRole('link', { name: '返回大厅', exact: true }).click();
    console.log('PASS 余烬真实制作、全屏、返回大厅、最近游玩与存档续玩');

    await page.getByRole('link', { name: '开始游玩深渊回响', exact: true }).click();
    const abyss = await gameFrame(page);
    await abyss.locator('#overlay-body [data-character]').first().waitFor();
    await abyss.locator('[data-character="vanguard"]').click();
    await abyss.locator('.map-node').first().waitFor();
    assert.equal(await abyss.locator('.map-node').count(), 15, '每章 15 层');
    await abyss.locator('[data-action="close"]').first().click();
    for (const size of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(size);
      await abyssFitsViewport(abyss, `${size.width}×${size.height} 深渊地图`);
    }
    await page.setViewportSize({ width: 1440, height: 1050 });
    await abyss.locator('.map-node.current').click();
    await abyss.locator('#enemies .enemy').first().waitFor();
    const before = await abyss.locator('#enemies .enemy').first().getAttribute('aria-label');
    const playable = abyss.locator('#hand .card:not(.unplayable)');
    assert.ok(await playable.count() > 0, '首回合至少有一张可以打出的牌');
    const handBefore = await abyss.locator('#hand .card').count();
    await playable.first().click();
    // 多敌人战斗时第一次点击只是选中卡牌，需要再点一名敌人确认目标。
    if (await abyss.locator('#hand .card.selected').count()) {
      await abyss.locator('#enemies .enemy:not(.dead)').first().click();
    }
    // 出牌后手牌减少一张，日志记录这次出牌。
    await page.waitForFunction(() => document.querySelector('#game-frame').contentDocument.querySelector('#battle-log').textContent.includes('你打出'));
    assert.equal(await abyss.locator('#hand .card').count(), handBefore - 1, '出牌后手牌减少一张');
    assert.ok(await readSave(abyss, ABYSS).then(save => save.stats.cards) >= 1);
    // 结束回合：敌人逐个行动，期间按钮禁用并显示提示。
    await abyss.locator('#end-turn').click();
    const acting = await page.waitForFunction(() => {
      const frame = document.querySelector('#game-frame').contentDocument;
      return frame.querySelector('.enemy.is-acting') || frame.querySelector('.fx-banner') || frame.getElementById('end-turn').disabled;
    }, null, { timeout: 5000 }).then(() => true).catch(() => false);
    assert.ok(acting, '敌人回合会播放行动提示或锁定按钮');
    await page.waitForFunction(() => document.querySelector('#game-frame').contentDocument.querySelector('#battle-log').textContent.includes('第 2 回合开始'));
    assert.equal(await abyss.locator('#end-turn').isDisabled(), false, '敌人回合结束后可以继续操作');
    const save = await readSave(abyss, ABYSS);
    assert.equal(save.version, 1);
    assert.ok(save.hp > 0 && save.hp <= save.maxHp);
    assert.equal(save.map.length, 15);
    assert.ok(save.stats.cards >= 1, '出牌会写入统计');
    assert.equal(save.battle.turn >= 2, true, '回合会推进');
    assert.ok(before !== null && before.length > 0);
    await page.setViewportSize({ width: 1024, height: 768 });
    await abyssFitsViewport(abyss, '1024×768 深渊战斗');
    await page.setViewportSize({ width: 1440, height: 1050 });
    await abyss.locator('[data-panel="deck"]').click();
    assert.equal(await abyss.locator('#overlay-body .card').count(), save.deck.length);
    await abyss.locator('#overlay-close').click();
    await abyss.locator('[data-panel="help"]').click();
    assert.match(await abyss.locator('#overlay-body').textContent(), /玩法说明/);
    await abyss.locator('#overlay-close').click();
    await page.screenshot({ path: path.join(output, 'abyss-player-desktop.png'), fullPage: true });
    await page.reload();
    const reloaded = await gameFrame(page);
    const resumed = await readSave(reloaded, ABYSS);
    assert.equal(resumed.floor, save.floor, '刷新后从同一层继续');
    assert.equal((await readSave(reloaded, EMBER)).inventory.axe, 1, '深渊回响不会覆盖余烬进度');
    assert.equal((await readSave(reloaded, SWORD)), null, '未游玩过的游戏不会产生存档');
    await page.getByRole('link', { name: '返回大厅', exact: true }).click();
    console.log('PASS 深渊回响地图、战斗、牌组、存档续玩与进度隔离');

    await page.getByRole('link', { name: '开始游玩逸剑风云决', exact: true }).click();
    let sword = await gameFrame(page);
    await sword.locator('#world').waitFor();
    for (const size of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(size);
      await swordFitsViewport(sword, `${size.width}×${size.height} 逸剑`);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await sword.locator('#nearby-list').focus();
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => document.querySelector('#game-frame').contentDocument.getElementById('nearby-list').scrollTop > 0);
    await page.setViewportSize({ width: 1280, height: 650 });
    assert.equal(await sword.locator('body').evaluate(() => document.documentElement.scrollHeight > innerHeight), true, 'short windows retain page scrolling');
    await sword.locator('#quest-guide').click();
    await sword.locator('#dialogue-next').waitFor();
    while (await sword.locator('#dialogue-next').isVisible()) await sword.locator('#dialogue-next').click();
    assert.equal((await readSave(sword, SWORD)).stage, 1, 'the quest guide remains usable in a short window');
    await page.setViewportSize({ width: 1440, height: 1050 });
    console.log('PASS 逸剑桌面同屏操作、十个快捷键、列表键盘滚动与矮窗口任务指引');
    await sword.locator('.main-nav [data-panel="bag"]').click();
    await sword.locator('#modal[open]').waitFor();
    await sword.locator('#modal-close').click();
    await sword.locator('#save-button').click();
    const firstSave = await readSave(sword, SWORD);
    assert.equal(firstSave.version, 3);
    assert.ok(firstSave.hp > 0);
    await page.screenshot({ path: path.join(output, 'sword-player-desktop.png'), fullPage: true });
    await page.reload();
    sword = await gameFrame(page);
    const loadedSave = await readSave(sword, SWORD);
    assert.equal(loadedSave.stage, firstSave.stage);
    assert.deepEqual(loadedSave.bag, firstSave.bag);
    assert.equal((await readSave(sword, EMBER)).inventory.axe, 1, 'playing Sword must preserve Ember progress');
    await page.getByRole('link', { name: '返回大厅', exact: true }).click();
    await page.locator('[data-view="recent"]').click();
    assert.equal(await page.locator('.game-card').first().getAttribute('data-game'), 'fengyunjue');
    const history = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE);
    assert.deepEqual(history.favorites, ['jihuan']);
    assert.equal(Object.keys(history.recent).length, TOTAL_GAMES);
    assert.ok(history.recent.fengyunjue.plays >= 2);
    console.log('PASS 逸剑背包、手动存档、重载续玩及三款游戏存档隔离');

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const mobile = await mobileContext.newPage();
    watch(mobile);
    await mobile.goto(base);
    for (const width of [320, 390, 768, 1024, 1440]) {
      await mobile.setViewportSize({ width, height: 844 });
      await noOverflow(mobile, `hall width ${width}`);
    }
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.screenshot({ path: path.join(output, 'hall-mobile.png'), fullPage: true });
    await mobile.getByRole('button', { name: '游玩指南', exact: true }).click();
    await mobile.getByRole('button', { name: '去挑一个游戏', exact: true }).click();
    await mobile.getByRole('button', { name: '收藏余烬', exact: true }).click();
    await mobile.locator('[data-view="favorites"]').click();
    assert.equal(await mobile.locator('.game-card').count(), 1);
    await mobile.getByRole('link', { name: '开始游玩余烬', exact: true }).click();
    const mobileEmber = await gameFrame(mobile);
    await mobileEmber.getByRole('button', { name: '工坊', exact: true }).click();
    await mobileEmber.locator('[data-action="craft"][data-id="axe"]').click();
    assert.equal((await readSave(mobileEmber, EMBER)).inventory.axe, 1);
    await noOverflow(mobile, 'mobile player shell');
    assert.equal(await mobileEmber.locator('body').evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await mobile.screenshot({ path: path.join(output, 'ember-player-mobile.png'), fullPage: true });
    await mobile.getByRole('link', { name: '返回大厅', exact: true }).click();
    await mobile.getByRole('link', { name: '开始游玩逸剑风云决', exact: true }).click();
    const mobileSword = await gameFrame(mobile);
    await mobileSword.locator('#save-button').click();
    assert.equal((await readSave(mobileSword, SWORD)).version, 3);
    assert.equal(await mobileSword.locator('body').evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await mobile.screenshot({ path: path.join(output, 'sword-player-mobile.png'), fullPage: true });
    await mobile.getByRole('link', { name: '返回大厅', exact: true }).click();
    await mobile.getByRole('link', { name: '开始游玩深渊回响', exact: true }).click();
    const mobileAbyss = await gameFrame(mobile);
    await mobileAbyss.locator('[data-character="psion"]').click();
    await mobileAbyss.locator('[data-action="close"]').first().click();
    await mobileAbyss.locator('.map-node.current').click();
    await mobileAbyss.locator('#enemies .enemy').first().waitFor();
    assert.equal(await mobileAbyss.locator('body').evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    for (const width of [320, 390]) {
      await mobile.setViewportSize({ width, height: 844 });
      await abyssFitsViewport(mobileAbyss, `${width}×844 深渊战斗`);
    }
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.screenshot({ path: path.join(output, 'abyss-player-mobile.png'), fullPage: true });
    await mobileContext.close();
    console.log('PASS 320–1440 像素布局、手机收藏以及三款游戏触屏操作');

    const blockedContext = await browser.newContext();
    await blockedContext.addInitScript(() => Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('Storage unavailable'); } }));
    const blocked = await blockedContext.newPage();
    watch(blocked);
    await blocked.goto(base);
    await blocked.getByRole('button', { name: '收藏余烬', exact: true }).click();
    assert.equal(await blocked.getByRole('button', { name: '取消收藏余烬', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.match(await blocked.locator('#toast').textContent(), /暂时无法保存/);
    await blocked.locator('[data-view="favorites"]').click();
    assert.equal(await blocked.locator('.game-card').count(), 1);
    await blockedContext.close();

    const invalid = await context.newPage();
    await invalid.goto(base + 'play.html?game=' + encodeURIComponent('../../README.md'));
    await invalid.getByRole('heading', { name: '这个小世界还未开放' }).waitFor();
    assert.equal(await invalid.locator('#game-frame').getAttribute('src'), null);
    const errorContext = await browser.newContext();
    const missing = await errorContext.newPage();
    await missing.route('**/games/jihuan/index.html', route => route.fulfill({ status: 404, contentType: 'text/html', body: '<h1>Missing game</h1>' }));
    await missing.goto(base + 'play.html?game=jihuan');
    await missing.getByRole('heading', { name: '游戏暂时没有打开' }).waitFor();
    assert.equal(await missing.evaluate(key => localStorage.getItem(key), SAVE), null, 'failed loads are not played games');
    await errorContext.close();
    await invalid.close();
    console.log('PASS 禁用存储、非法游戏地址、加载失败与失败记录保护');

    // 完整动效：在不使用减少动态的环境里验证出牌与敌人回合的动画元素。
    const motionContext = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'no-preference' });
    const motion = await motionContext.newPage();
    watch(motion);
    await motion.goto(base + 'play.html?game=abyss');
    const motionFrame = await gameFrame(motion);
    await motionFrame.locator('#overlay-body [data-character]').first().waitFor();
    await motionFrame.locator('[data-character="vanguard"]').click();
    await motionFrame.locator('[data-action="close"]').first().click();
    await motionFrame.locator('.map-node.current').click();
    await motionFrame.locator('#enemies .enemy').first().waitFor();
    const attack = motionFrame.locator('#hand .card.attack:not(.unplayable)');
    assert.ok(await attack.count() > 0, '首回合有可以打出的攻击牌');
    const motionHandBefore = await motionFrame.locator('#hand .card').count();
    // 多敌人时第一次点击只是选中卡牌，还要再点一名敌人确认目标才算打出。
    await attack.first().click();
    if (await motionFrame.locator('#hand .card.selected').count()) {
      await motionFrame.locator('#enemies .enemy:not(.dead)').first().click();
    }
    // 先等出牌真正生效，再采样：特效元素存在时间很短。
    await motion.waitForFunction(expected => document.querySelector('#game-frame').contentDocument.querySelectorAll('#hand .card').length === expected, motionHandBefore - 1);
    const effects = await motion.evaluate(() => {
      const frame = document.querySelector('#game-frame').contentDocument;
      return {
        flyingCards: frame.querySelectorAll('.fx-card').length,
        numbers: frame.querySelectorAll('.fx-number').length,
        slashes: frame.querySelectorAll('.fx-slash').length,
        hits: frame.querySelectorAll('.enemy.is-hit, .enemy.is-crit').length,
      };
    });
    assert.ok(effects.flyingCards > 0, `出牌会播放飞牌：${JSON.stringify(effects)}`);
    assert.ok(effects.numbers > 0, `出牌会显示伤害数字：${JSON.stringify(effects)}`);
    assert.ok(effects.slashes > 0, `攻击命中会播放斩击：${JSON.stringify(effects)}`);
    assert.ok(effects.hits > 0, `敌人受击会播放震动：${JSON.stringify(effects)}`);
    await motion.waitForTimeout(700);
    await motionFrame.locator('#end-turn').click();
    // 结束回合后立刻采样阶段提示与队列状态。
    const turnEffects = await motion.evaluate(() => {
      const frame = document.querySelector('#game-frame').contentDocument;
      return { banners: frame.querySelectorAll('.fx-banner').length, disabled: frame.getElementById('end-turn').disabled };
    });
    assert.ok(turnEffects.banners > 0 || turnEffects.disabled, `敌人回合会显示阶段提示：${JSON.stringify(turnEffects)}`);
    const lunging = await motion.waitForFunction(() => document.querySelector('#game-frame').contentDocument.querySelectorAll('.enemy.is-acting').length > 0, null, { timeout: 8000 }).then(() => true).catch(() => false);
    assert.ok(lunging, '敌人行动时会进入蓄力状态');
    await motion.waitForFunction(() => !document.querySelector('#game-frame').contentDocument.getElementById('end-turn').disabled, null, { timeout: 20000 });
    await motion.screenshot({ path: path.join(output, 'abyss-fx.png'), fullPage: true });
    await motionContext.close();
    console.log('PASS 深渊回响出牌动效、伤害数字、受击震动与敌人逐行动画');

    const offline = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const offlinePage = await offline.newPage();
    watch(offlinePage);
    await offlinePage.goto(pathToFileURL(path.join(root, 'index.html')).href);
    assert.equal(await offlinePage.locator('.game-card').count(), TOTAL_GAMES);
    await offlinePage.getByRole('link', { name: '开始游玩余烬', exact: true }).click();
    const offlineFrame = await gameFrame(offlinePage);
    await offlineFrame.getByRole('button', { name: '工坊', exact: true }).click();
    await offlineFrame.locator('[data-action="craft"][data-id="axe"]').click();
    assert.equal((await readSave(offlineFrame, EMBER)).inventory.axe, 1);
    await offline.close();
    await page.goto(base);
    await page.getByRole('button', { name: '随便玩一个', exact: true }).click();
    await gameFrame(page);
    assert.match(page.url(), /play\.html\?game=(?:fengyunjue|jihuan|abyss)$/);
    console.log('PASS 子目录部署、直接打开 HTML、随机游玩');
    assert.deepEqual(errors, [], 'browser console and runtime must remain clean');
    console.log(`浏览器验证全部通过。截图：${output}`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
