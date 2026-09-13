'use strict';
const { chromium } = require(process.env.EMBER_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const G = require('../game.js');
const root = path.resolve(__dirname, '..');

(async () => {
  await fs.mkdir(path.join(root, '.playwright'), { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.EMBER_BROWSER_PATH ? { executablePath: process.env.EMBER_BROWSER_PATH } : {}) });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await page.locator('.scene-hotspot').first().waitFor();
    assert.equal(await page.evaluate(() => window.EmberEffects.enabled()), true);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(root, '.playwright', 'survival-desktop.png'), fullPage: true });
    const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('ember-wilderness-save-v1')));
    const opening = await read();

    const scene = page.locator('.landscape-card');
    const sceneBox = await scene.boundingBox();
    await page.mouse.move(sceneBox.x + sceneBox.width * .8, sceneBox.y + 110);
    assert.notEqual(await scene.evaluate(element => element.style.getPropertyValue('--look-x')), '0');
    assert.equal((await read()).time, opening.time, 'hovering must not advance the game');

    await page.locator('.action-card[data-id="branches"]').click();
    assert.equal((await read()).time, opening.time + 45);
    assert.equal((await read()).inventory.wood, opening.inventory.wood + 1);
    assert.ok(await page.locator('.loot-flight').count() > 0, 'gathered items should visibly fly into the bag');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(root, '.playwright', 'survival-gather.png') });
    await page.waitForTimeout(1150);
    assert.equal(await page.locator('#fx-layer > *').count(), 0, 'finished feedback must be removed');

    const beforeFire = await read();
    await page.getByRole('button', { name: '场景：添柴', exact: true }).click();
    const afterFire = await read();
    assert.equal(afterFire.time, beforeFire.time + 10);
    assert.equal(afterFire.inventory.wood, beforeFire.inventory.wood - 1);
    assert.ok(afterFire.fireFuel > beforeFire.fireFuel);
    assert.match(await page.locator('#action-echo').textContent(), /火光/);

    const beforeRapid = await read();
    await page.locator('.action-card[data-id="grass"]').click();
    await page.locator('.action-card[data-id="grass"]').click();
    await page.locator('.action-card[data-id="berries"]').click();
    const afterRapid = await read();
    assert.equal(afterRapid.time, beforeRapid.time + 150);
    assert.equal(afterRapid.inventory.grass, beforeRapid.inventory.grass + 6);
    assert.equal(afterRapid.inventory.berry, beforeRapid.inventory.berry + 2);
    await page.waitForTimeout(1400);
    assert.equal(Number(await page.locator('#stat-hunger').textContent()), Math.ceil(afterRapid.hunger));
    assert.equal(await page.locator('#fx-layer > *').count(), 0);

    // Changing the system motion preference mid-feedback must settle the real stat value.
    await page.locator('.action-card[data-id="grass"]').click();
    const beforeReduced = await read();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(60);
    assert.equal(await page.evaluate(() => window.EmberEffects.enabled()), false);
    assert.equal(Number(await page.locator('#stat-hunger').textContent()), Math.ceil(beforeReduced.hunger));
    assert.equal(await page.locator('#fx-layer > *').count(), 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // Prepare the edge of dusk through ordinary actions, then exercise the actual transition.
    const twilight = G.createState(123);
    G.act(twilight, 'gather', 'rest'); G.act(twilight, 'gather', 'rest');
    G.act(twilight, 'gather', 'rest'); G.act(twilight, 'gather', 'rest');
    assert.equal(G.clock(twilight), '16:00');
    await page.getByRole('button', { name: '存档与设置', exact: true }).click();
    await page.locator('#import-file').setInputFiles({ name: 'dusk.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(twilight)) });
    await page.locator('[data-command="import-confirm"]').click();
    await page.locator('.action-card[data-id="berries"]').click();
    assert.equal(await page.locator('body').getAttribute('data-phase'), 'dusk');
    assert.match(await page.locator('#phase-banner').textContent(), /暮色/);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(root, '.playwright', 'survival-dusk.png') });
    await page.locator('.action-card[data-id="rest"]').click();
    await page.locator('.action-card[data-id="berries"]').click();
    assert.equal(await page.locator('body').getAttribute('data-phase'), 'night');
    assert.match(await page.locator('#phase-banner').textContent(), /黑夜/);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(root, '.playwright', 'survival-night.png') });

    const healthBeforeDark = (await read()).health;
    await page.locator('.action-card[data-id="branches"]').click();
    assert.ok((await read()).health < healthBeforeDark);
    assert.ok(await page.locator('.screen-hit').count());
    assert.equal(await page.locator('body').evaluate(element => element.classList.contains('in-danger')), true);

    await page.getByRole('button', { name: '存档与设置', exact: true }).click();
    await page.locator('[data-command="effects"]').click();
    assert.equal(await page.evaluate(() => window.EmberEffects.enabled()), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('ember-effects')), 'off');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '场景：生火', exact: true }).click();
    assert.equal(await page.locator('#fx-layer > *').count(), 0);
    const offState = await read();
    assert.equal(Number(await page.locator('#stat-health').textContent()), Math.ceil(offState.health));
    await page.reload();
    assert.equal(await page.evaluate(() => window.EmberEffects.enabled()), false);

    // Canvas weather and hotspot positions at phone size, with all real controls intact.
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
    const mobile = await mobileContext.newPage(); mobile.on('pageerror', error => errors.push(error.message));
    await mobile.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await mobile.locator('.scene-hotspot').first().waitFor();
    await mobile.getByRole('button', { name: '场景：添柴', exact: true }).tap();
    assert.equal(await mobile.evaluate(() => JSON.parse(localStorage.getItem('ember-wilderness-save-v1')).time), 490);
    await mobile.waitForTimeout(350);
    const mobileScene = mobile.locator('.landscape-card');
    await mobileScene.screenshot({ path: path.join(root, '.playwright', 'survival-mobile-scene.png') });
    for (const width of [360, 390, 520, 760, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
    }

    await page.setViewportSize({ width: 1440, height: 1100 });
    const rainy = G.createState(42); rainy.weather = 'rain';
    await page.getByRole('button', { name: '存档与设置', exact: true }).click();
    await page.locator('[data-command="effects"]').click();
    await page.locator('#import-file').setInputFiles({ name: 'rain-visual-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rainy)) });
    await page.locator('[data-command="import-confirm"]').click();
    assert.equal(await page.locator('body').getAttribute('data-weather'), 'rain');
    await page.waitForTimeout(200);
    const firstFrame = await page.locator('#weather-canvas').evaluate(element => element.toDataURL());
    await page.waitForTimeout(150);
    assert.notEqual(await page.locator('#weather-canvas').evaluate(element => element.toDataURL()), firstFrame);
    await scene.screenshot({ path: path.join(root, '.playwright', 'survival-rain.png') });
    const savedTime = (await read()).time;
    await page.waitForTimeout(500);
    assert.equal((await read()).time, savedTime, 'ambient effects must never tick the simulation');
    assert.deepEqual(errors, []);
    console.log('Effects smoke passed: actual gathering feedback, scene hotspots, fire stoking, rapid actions, settled stat counters, dusk/night transitions, damage, motion settings/reload, phone taps, rain animation, and idle time isolation.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
