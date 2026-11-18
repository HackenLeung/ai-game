'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT } = require('./site-files.cjs');
const { games } = require('../hall/catalog.js');
const browserTools = require('./browser-tools.cjs');
(async () => {
  const { chromium, launch } = browserTools();
  const browser = await chromium.launch(launch);
  // 每款游戏进入一个可以代表玩法的画面，再截图。
  async function prepare(page, game) {
    if (game.id === 'abyss') {
      await page.locator('[data-action="start"][data-character="vanguard"]').click();
      // 开局会弹出章节介绍，先关闭再进入第一场战斗。
      await page.locator('[data-action="close"]').first().click();
      await page.locator('.map-node.current').click();
      await page.locator('#view-battle').waitFor();
      await page.locator('.enemy').first().waitFor();
    }
    if (game.id === 'mahjong') {
      await page.locator('.mj-tab[data-tab="match"]').click();
      await page.locator('#mj-match-status').filter({ hasText: '你的回合' }).waitFor();
    }
    if (game.id === 'minesweeper') {
      await page.locator('[data-level="custom"]').click();
      await page.locator('#custom-rows').fill('12');
      await page.locator('#custom-cols').fill('23');
      await page.locator('#custom-mines').fill('26');
      await page.locator('#custom-start').click();
      await page.waitForTimeout(150);
      await page.locator('#board .ms-cell').nth(149).click();
      await page.locator('#board .ms-cell:not(.is-open)').first().click({ button: 'right' });
      await page.locator('#board .ms-cell:not(.is-open)').last().click({ button: 'right' });
      await page.waitForTimeout(1100);
    }
    if (game.id === 'mota') {
      // 开场三连：开启 flash 特性 → 不开启疯狂加血 → 读完作者说明，再把勇者往前走两格。
      const clickChoice = async (index) => {
        const button = page.locator(`#dialog .choice[data-index="${index}"]`);
        if (await button.count()) {
          await button.first().click();
          await page.waitForTimeout(140);
        }
      };
      await clickChoice(0);
      await clickChoice(1);
      for (let i = 0; i < 16; i++) {
        if (!(await page.locator('#dialog[data-mode="say"]').count())) break;
        await page.keyboard.press('Space');
        await page.waitForTimeout(90);
      }
      for (const key of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown']) await page.keyboard.press(key);
      await page.waitForTimeout(160);
    }
  }
  async function cover(page, game, target) {
    if (game.id === 'fengyunjue') {
      const data = await page.locator('#world').evaluate(canvas => canvas.toDataURL('image/png').split(',')[1]);
      await fs.writeFile(target, Buffer.from(data, 'base64'));
      return;
    }
    if (game.id === 'mahjong') {
      await page.locator('#mj-match-board').screenshot({ path: target, animations: 'disabled' });
      return;
    }
    if (game.id === 'minesweeper') {
      await page.locator('#board-card').screenshot({ path: target, animations: 'disabled' });
      return;
    }
    if (game.id === 'mota') {
      // 封面按卡片的 1.86 比例排布：左侧属性，中央像素地图。
      await page.addStyleTag({ content: `
        .bar { display: none; }
        .shell { width: 1120px; height: 602px; padding: 0; margin: 0 auto; display: block; }
        .tower { width: 1120px; height: 602px; max-width: none; padding: 0 0 0 12px; box-sizing: border-box; margin: 0; gap: 22px; grid-template-columns: minmax(0, 1fr) 252px; align-items: stretch; }
        .stage { height: 602px; min-height: 0; grid-template-rows: auto minmax(0, 1fr); }
        .stage > :not(.stage-head):not(.board-slot) { display: none; }
        .deck { width: 252px; height: 602px; overflow: hidden; }
        .deck > :nth-child(n+7) { display: none; }
        #dialog, .log, .pad, .map-controls { display: none !important; }
      ` });
      await page.waitForTimeout(120);
      await page.locator('.tower').screenshot({ path: target, animations: 'disabled' });
      return;
    }
    const selector = game.id === 'abyss' ? '.view-battle' : '.landscape';
    if (game.id !== 'abyss') await page.addStyleTag({ content: '.landscape-card > :not(.landscape) { visibility: hidden !important; }' });
    await page.locator(selector).screenshot({ path: target, animations: 'disabled' });
  }
  try {
    await fs.mkdir(path.join(ROOT, 'assets/previews'), { recursive: true });
    for (const game of games.filter(item => !process.argv[2] || item.id === process.argv[2])) {
      // 魔塔默认就是深色的塔里，封面与大厅的深色精选位才对得上。
      const context = await browser.newContext({
        viewport: { width: 1600, height: 1100 },
        deviceScaleFactor: 1,
        colorScheme: game.id === 'mota' ? 'dark' : 'light',
        reducedMotion: 'reduce'
      });
      const page = await context.newPage();
      await page.goto(pathToFileURL(path.join(ROOT, game.entry)).href);
      await page.locator(game.readySelector).first().waitFor();
      await prepare(page, game);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: path.join(ROOT, game.screenshot), fullPage: true, type: 'jpeg', quality: 82, animations: 'disabled' });
      await cover(page, game, path.join(ROOT, game.cover));
      console.log(`已生成 ${game.title} 的实景封面与完整截图。`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
