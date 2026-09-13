'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { collectSiteFiles, ROOT } = require('../scripts/site-files.cjs');
const { createServer } = require('../scripts/serve.cjs');
const { games } = require('../hall/catalog.js');

test('both games and every local HTML asset are included in one publishable site', async () => {
  const files = await collectSiteFiles();
  const ids = games.map(game => game.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const game of games) {
    assert.match(game.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(game.entry, `games/${game.id}/index.html`);
    assert.ok(files.includes(game.cover)); assert.ok(files.includes(game.screenshot));
  }
  for (const relative of files.filter(file => file.endsWith('.html'))) {
    const html = await fs.readFile(path.join(ROOT, relative), 'utf8');
    for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      const reference = match[1];
      if (/^(?:[a-z]+:|#)/i.test(reference)) continue;
      const file = path.posix.normalize(path.posix.join(path.posix.dirname(relative), reference.split(/[?#]/)[0]));
      assert.ok(files.includes(file), `${relative} references missing asset ${file}`);
    }
  }
  assert.ok(files.every(file => !file.endsWith('.cjs') && !file.endsWith('.md') && !file.includes('/tests/') && !file.includes('/scripts/') && !file.includes('node_modules') && !file.includes('.playwright') && !file.endsWith('package.json')));
});

test('preview serves both games and assets while rejecting private paths and writes', async t => {
  const server = await createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const page of ['/', '/play.html?game=jihuan', '/games/fengyunjue/', '/games/jihuan/index.html', '/assets/previews/jihuan.png', '/hall/library.js']) {
    const response = await fetch(base + page);
    assert.equal(response.status, 200, page);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
  const head = await fetch(base + '/games/fengyunjue/game.js', { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  assert.ok(Number(head.headers.get('content-length')) > 0);
  assert.match(head.headers.get('content-type'), /javascript/);
  for (const route of ['/.git/config', '/package.json', '/scripts/serve.cjs', '/games/jihuan/tests/game.test.cjs', '/games/jihuan/package.json', '/games/jihuan/.playwright/desktop.png', '/%2e%2e%5cpackage.json', '/not-found.html']) {
    assert.equal((await fetch(base + route)).status, 404, route);
  }
  assert.equal((await fetch(base + '/%E0%A4%A')).status, 400);
  const post = await fetch(base + '/', { method: 'POST' });
  assert.equal(post.status, 405); assert.equal(post.headers.get('allow'), 'GET, HEAD');
});
