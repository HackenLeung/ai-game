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

async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }));
  assert.ok(dimensions.content <= dimensions.viewport + 1, `${label} overflows: ${JSON.stringify(dimensions)}`);
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
    assert.equal(await page.locator('.game-card').count(), 2);
    assert.equal(await page.locator('#featured .hero-image').evaluate(image => image.complete && image.naturalWidth > 0), true);
    await noOverflow(page, 'desktop hall');
    await page.screenshot({ path: path.join(output, 'hall-desktop.png'), fullPage: true });

    await page.keyboard.press('/');
    assert.equal(await page.locator('#search').evaluate(input => document.activeElement === input), true);
    await page.locator('#search').fill('风云诀');
    assert.equal(await page.locator('.game-card').count(), 1);
    assert.equal(await page.locator('.game-card').getAttribute('data-game'), 'fengyunjue');
    await page.locator('#search').fill('不存在的世界');
    assert.equal(await page.locator('#empty-state').isVisible(), true);
    await page.locator('#reset-filters').click();
    assert.equal(await page.locator('.game-card').count(), 2);
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

    await page.getByRole('link', { name: '开始游玩逸剑风云决', exact: true }).click();
    let sword = await gameFrame(page);
    await sword.locator('#world').waitFor();
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
    assert.equal(Object.keys(history.recent).length, 2);
    assert.ok(history.recent.fengyunjue.plays >= 2);
    console.log('PASS 逸剑背包、手动存档、重载续玩及两款游戏存档隔离');

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
    await mobileContext.close();
    console.log('PASS 320–1440 像素布局、手机收藏以及两款游戏触屏操作');

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

    const offline = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const offlinePage = await offline.newPage();
    watch(offlinePage);
    await offlinePage.goto(pathToFileURL(path.join(root, 'index.html')).href);
    assert.equal(await offlinePage.locator('.game-card').count(), 2);
    await offlinePage.getByRole('link', { name: '开始游玩余烬', exact: true }).click();
    const offlineFrame = await gameFrame(offlinePage);
    await offlineFrame.getByRole('button', { name: '工坊', exact: true }).click();
    await offlineFrame.locator('[data-action="craft"][data-id="axe"]').click();
    assert.equal((await readSave(offlineFrame, EMBER)).inventory.axe, 1);
    await offline.close();
    await page.goto(base);
    await page.getByRole('button', { name: '随便玩一个', exact: true }).click();
    await gameFrame(page);
    assert.match(page.url(), /play\.html\?game=(?:fengyunjue|jihuan)$/);
    console.log('PASS 子目录部署、直接打开 HTML、随机游玩');
    assert.deepEqual(errors, [], 'browser console and runtime must remain clean');
    console.log(`浏览器验证全部通过。截图：${output}`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
