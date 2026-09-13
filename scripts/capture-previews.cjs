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
  try {
    await fs.mkdir(path.join(ROOT, 'assets/previews'), { recursive: true });
    for (const game of games) {
      const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.goto(pathToFileURL(path.join(ROOT, game.entry)).href);
      await page.locator(game.readySelector).waitFor();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: path.join(ROOT, game.screenshot), fullPage: true, type: 'jpeg', quality: 82, animations: 'disabled' });
      if (game.id === 'fengyunjue') {
        const data = await page.locator('#world').evaluate(canvas => canvas.toDataURL('image/png').split(',')[1]);
        await fs.writeFile(path.join(ROOT, game.cover), Buffer.from(data, 'base64'));
      } else {
        await page.addStyleTag({ content: '.landscape-card > :not(.landscape) { visibility: hidden !important; }' });
        await page.locator('.landscape').screenshot({ path: path.join(ROOT, game.cover), animations: 'disabled' });
      }
      console.log(`已生成 ${game.title} 的实景封面与完整截图。`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
