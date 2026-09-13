'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const catalog = require('../hall/catalog.js');
const ROOT = path.resolve(__dirname, '..');
const ignored = new Set(['node_modules', 'tests', 'scripts', 'dist', 'build', 'test-results']);
const extensions = new Set(['.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2', '.mp3', '.ogg', '.wav']);
async function collectSiteFiles(root = ROOT) {
  const files = ['index.html', 'play.html', 'favicon.svg'];
  async function walk(relative) {
    for (const item of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
      if (item.name.startsWith('.') || ignored.has(item.name)) continue;
      const next = `${relative}/${item.name}`;
      if (item.isDirectory()) await walk(next);
      else if (item.isFile() && extensions.has(path.extname(item.name)) && !/^package(?:-lock)?\.json$/.test(item.name) && !/\.(?:test|spec)\.js$/.test(item.name)) files.push(next);
    }
  }
  for (const folder of ['hall', 'assets', ...catalog.games.map(game => `games/${game.id}`)]) await walk(folder);
  for (const game of catalog.games) {
    for (const required of [game.entry, game.cover, game.screenshot]) {
      if (!files.includes(required)) throw new Error(`缺少游戏文件：${required}`);
    }
  }
  return files.sort();
}
module.exports = { ROOT, collectSiteFiles };
