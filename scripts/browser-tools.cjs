'use strict';
const fs = require('node:fs');
const path = require('node:path');
function browserTools() {
  let chromium;
  try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
  catch { throw new Error('浏览器验证需要 Playwright：npm install --no-save playwright，然后 npx playwright install chromium。也可设置 PLAYWRIGHT_MODULE 指向已有安装。'); }
  let executablePath = process.env.BROWSER_PATH;
  if (!executablePath && process.platform === 'win32') {
    executablePath = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean).map(folder => path.join(folder, 'Microsoft/Edge/Application/msedge.exe')).find(file => fs.existsSync(file));
  }
  return { chromium, launch: { headless: true, ...(executablePath ? { executablePath } : {}) } };
}
module.exports = browserTools;
