'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createServer } = require('./serve.cjs');
const { ROOT } = require('./site-files.cjs');
const browserTools = require('./browser-tools.cjs');

(async () => {
  const output = path.join(ROOT, 'test-results', 'mahjong-modern');
  await fs.mkdir(output, { recursive: true });
  const server = await createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const { chromium, launch } = browserTools();
  let browser;
  const errors = [];
  const tabs = ['learn', 'draw', 'score', 'chips', 'match', 'drill'];
  async function fits(page, label) {
    const layout = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
    assert.ok(layout.content <= layout.width + 1, `${label}: horizontal overflow ${JSON.stringify(layout)}`);
  }
  async function readableOnHover(button, label) {
    await button.hover();
    const colors = await button.evaluate(element => {
      const rgba = value => value.match(/[\d.]+/g).map(Number);
      const board = element.closest('.mj-match-board');
      // Use the brightest felt color as a conservative backdrop for the gradient.
      const felt = getComputedStyle(board).getPropertyValue('--felt-2').trim().slice(1);
      let background = [0, 2, 4].map(index => parseInt(felt.slice(index, index + 2), 16));
      const layers = [];
      for (let node = element; node && node !== board; node = node.parentElement) {
        layers.unshift(rgba(getComputedStyle(node).backgroundColor));
      }
      for (const layer of layers) {
        const alpha = layer.length === 4 ? layer[3] : 1;
        background = background.map((channel, index) => channel * (1 - alpha) + layer[index] * alpha);
      }
      return { foreground: rgba(getComputedStyle(element).color).slice(0, 3), background };
    });
    const luminance = channels => channels.map(value => {
      const s = value / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
    const text = luminance(colors.foreground), background = luminance(colors.background);
    const contrast = (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05);
    assert.ok(contrast >= 4.5, `${label}: hover text contrast is ${contrast.toFixed(2)}:1`);
  }
  try {
    browser = await chromium.launch(launch);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${url}/games/mahjong/`);
    await page.locator('#mj-lessons .mj-lesson').first().waitFor();
    await page.screenshot({ path: path.join(output, 'learn-desktop.png'), fullPage: true });
    await page.locator('#mj-lessons .mj-lesson').first().click();
    const lessonModal = page.locator('#mj-lesson-modal');
    await lessonModal.waitFor({ state: 'visible' });
    assert.ok((await page.locator('#mj-lesson-modal-body').innerText()).length > 20, 'lesson modal renders content');
    await page.screenshot({ path: path.join(output, 'lesson-modal-desktop.png') });
    await page.locator('#mj-lesson-modal-close').click();
    await lessonModal.waitFor({ state: 'hidden' });
    await page.locator('#mj-lessons .mj-lesson').first().click();
    await lessonModal.waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await lessonModal.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('mj-lesson')), true, 'lesson modal restores focus');
    await page.locator('[data-go="score"]').click();
    const firstSuit = await page.locator('#mj-picker .mj-picker-row').first().boundingBox();
    const lastSuitTile = await page.locator('#mj-picker .mj-picker-row').nth(2).locator('.mj-tile').last().boundingBox();
    await page.screenshot({ path: path.join(output, 'suits-desktop.png'), clip: {
      x: firstSuit.x, y: firstSuit.y, width: lastSuitTile.x + lastSuitTile.width - firstSuit.x + 8,
      height: lastSuitTile.y + lastSuitTile.height - firstSuit.y + 8
    } });
    for (const tile of [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4]) {
      await page.locator(`#mj-picker [data-tile="${tile}"]`).click();
    }
    assert.equal(await page.locator('#mj-rack .mj-tile').count(), 14);
    assert.equal(await page.locator('#mj-seal-text').textContent(), '胡');
    await page.screenshot({ path: path.join(output, 'score-desktop.png'), fullPage: true });
    await page.locator('#tab-score').focus();
    await page.keyboard.press('Home');
    assert.equal(await page.locator('#tab-learn').getAttribute('aria-selected'), 'true');
    await page.locator('[data-go="match"]').click();
    await page.locator('#mj-match-status').filter({ hasText: '你的回合' }).waitFor();
    assert.equal(await page.locator('#mj-match-board .mj-match-hand-tile').count(), 14);
    assert.equal(await page.locator('#mj-style-field').isVisible(), false);
    assert.equal(await page.locator('[data-match="discard"]').isDisabled(), true);
    await page.locator('.mj-match-hand-tile').first().focus();
    await page.keyboard.press('ArrowRight');
    const focusedIndex = await page.evaluate(() => document.activeElement.dataset.handIndex);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.mj-match-hand-tile.is-selected').count(), 1);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.handIndex), focusedIndex, 'selection retains keyboard focus');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.mj-match-hand-tile.is-selected').count(), 0);
    assert.equal(await page.locator('[data-match="discard"]').isDisabled(), true);
    await page.keyboard.press('Enter');
    await readableOnHover(page.locator('[data-match="discard"]'), '打出');
    await readableOnHover(page.locator('[data-match="cancel"]'), '取消');
    await page.mouse.move(0, 0);
    await page.screenshot({ path: path.join(output, 'match-desktop.png'), fullPage: true });
    if (process.argv.includes('--update-previews')) {
      await page.screenshot({ path: path.join(ROOT, 'assets/previews/mahjong-full.jpg'), fullPage: true, type: 'jpeg', quality: 85, animations: 'disabled' });
      await page.locator('#mj-match-board').screenshot({ path: path.join(ROOT, 'assets/previews/mahjong.png'), animations: 'disabled' });
    }
    await page.locator('[data-match="discard"]').click();
    assert.equal(await page.locator('.mj-match-hand-tile').count(), 13, 'explicit discard removes exactly one tile');
    await page.locator('#tab-score').click();
    const pausedLog = await page.locator('#mj-match-log').textContent();
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('#mj-match-log').textContent(), pausedLog, 'computer players pause in other sections');
    await page.locator('#tab-match').click();
    await page.waitForFunction(log => document.getElementById('mj-match-log').textContent !== log, pausedLog);
    await page.locator('#mj-match-next').click();
    await page.locator('#mj-match-status').filter({ hasText: '你的回合' }).waitFor();
    await page.locator('.mj-match-hand-tile').first().focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.mj-match-hand-tile').count(), 13, 'pressing Enter twice still discards exactly one tile');
    console.log('Desktop: score, keyboard selection/cancel, explicit discard, pause/resume passed.');

    for (const width of [320, 390, 650, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const tab of tabs) {
        await page.locator(`#tab-${tab}`).click();
        await fits(page, `${width}px ${tab}`);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#tab-learn').click();
    await page.screenshot({ path: path.join(output, 'learn-mobile.png'), fullPage: true });
    await page.locator('#tab-score').click();
    await page.locator('#mj-picker').screenshot({ path: path.join(output, 'suits-mobile.png') });
    await page.locator('#tab-match').click();
    await page.locator('#mj-match-next').click();
    await page.locator('#tab-learn').click();
    const pausedDice = await page.locator('#mj-match-status').textContent();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('#mj-match-status').textContent(), pausedDice, 'dice animation pauses when leaving the table');
    await page.locator('#tab-match').click();
    await page.locator('#mj-match-status').filter({ hasText: '你的回合' }).waitFor();
    const rack = page.locator('.mj-match-hand');
    const scrollable = await rack.evaluate(element => element.scrollWidth > element.clientWidth);
    assert.ok(scrollable, 'mobile hand scrolls within the table');
    await page.locator('.mj-match-hand-tile').last().click();
    const before = await rack.evaluate(element => element.scrollLeft);
    assert.ok(before > 0, 'last tile can be selected by scrolling');
    await page.locator('[data-match="cancel"]').click();
    const after = await rack.evaluate(element => element.scrollLeft);
    assert.ok(Math.abs(before - after) < 2, 'cancel preserves mobile hand position');
    await page.screenshot({ path: path.join(output, 'match-mobile.png'), fullPage: true });
    assert.deepEqual(errors, [], 'no browser runtime errors');
    // Verify the same game also loads through the hall player iframe.
    await page.goto(`${url}/play.html?game=mahjong`);
    const frame = page.frameLocator('#game-frame');
    await frame.locator('#mj-lessons .mj-lesson').first().waitFor();
    await frame.locator('[data-go="match"]').click();
    await frame.locator('#mj-match-status').filter({ hasText: '你的回合' }).waitFor();
    assert.deepEqual(errors, []);

    // Create actual claim states so hover checks cover each action button.
    await page.goto(`${url}/games/mahjong/`);
    await page.evaluate(() => {
      const createGame = window.MahjongMatch.createGame;
      window.MahjongMatch.createGame = options => (window.hoverGame = createGame(options));
    });
    await page.locator('#tab-match').click();
    await page.locator('#mj-match-status').filter({ hasText: '你的回合' }).waitFor();
    async function claimState(humanHand, tile) {
      await page.evaluate(({ humanHand, tile }) => {
        window.MahjongMatchUI.deactivate();
        const game = window.hoverGame;
        game.hands = [humanHand,
          [3, 4, 5, 6, 7, 8, 12, 13, 14, 21, 22, 23, 33],
          [3, 4, 5, 6, 7, 8, 12, 13, 14, 21, 22, 23, 33],
          [tile, 3, 5, 8, 12, 14, 17, 21, 24, 26, 28, 29, 30, 33]];
        game.turn = 3;
        game.phase = 'discard';
        game.lastDraw = tile;
        game.lastDrawIndex = 0;
        game.discards = [[], [], [], []];
        game.melds = [[], [], [], []];
        game.claims = [];
        game.pending = [];
        window.MahjongMatch.discard(game, 0);
        window.MahjongMatchUI.activate();
      }, { humanHand, tile });
    }
    const cases = [
      { hand: [0, 2, 3, 9, 10, 11, 18, 19, 20, 27, 28, 29, 30], tile: 1, actions: ['chi', 'pass'] },
      { hand: [0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 27, 27, 32], tile: 27, actions: ['peng', 'gang', 'pass'] },
      { hand: [0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 27, 27, 32], tile: 32, actions: ['hu', 'pass'] }
    ];
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const scenario of cases) {
        await claimState(scenario.hand, scenario.tile);
        for (const action of scenario.actions) {
          const buttons = page.locator(`[data-claim="${action}"]`);
          assert.ok(await buttons.count(), `${action} claim is available`);
          for (let index = 0; index < await buttons.count(); index++) {
            await readableOnHover(buttons.nth(index), `${width}px ${action}`);
          }
        }
        await fits(page, `${width}px claim buttons`);
      }
    }
    assert.deepEqual(errors, []);
    console.log('Hover contrast passed for discard, cancel, chi, peng, gang, hu, and pass on desktop/mobile.');
    console.log('All six sections fit 320–1440px; mobile hand, hall iframe, and runtime checks passed.');
    console.log(`Screenshots: ${output}`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
