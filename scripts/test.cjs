'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./site-files.cjs');
const hallTests = fs.readdirSync(path.join(ROOT, 'tests')).filter(file => file.endsWith('.test.cjs')).map(file => `tests/${file}`);
const commands = [
  ['--test', ...hallTests, 'games/jihuan/tests/game.test.cjs', 'games/abyss/tests/engine.test.cjs', 'games/mahjong/tests/rules.test.cjs', 'games/mahjong/tests/match.test.cjs', 'games/minesweeper/tests/rules.test.cjs', 'games/mota/tests/rules.test.cjs', 'games/mota/tests/data.test.cjs', 'games/mota/tests/engine.test.cjs', 'games/mota/tests/stairs.test.cjs', 'games/mota/tests/route.test.cjs'],
  ['games/mota/tests/play.cjs'],
  ['games/fengyunjue/verify.cjs'],
  ['games/fengyunjue/test-strategy.cjs']
];
for (const args of commands) {
  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', windowsHide: true });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) { process.exitCode = result.status || 1; break; }
}
