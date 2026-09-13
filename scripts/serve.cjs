'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { ROOT, collectSiteFiles } = require('./site-files.cjs');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
async function createServer({ root = ROOT } = {}) {
  const files = new Set(await collectSiteFiles(root));
  return http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { response.writeHead(400); response.end('Bad request'); return; }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const relative = pathname.slice(1);
    if (!files.has(relative)) { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(request.method === 'HEAD' ? undefined : '没有找到这个页面，请返回游戏大厅。'); return; }
    try {
      const absolute = path.join(root, relative);
      // Recheck real paths so a replaced file cannot expose a path outside the site.
      const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(absolute)]);
      const within = path.relative(realRoot, realFile);
      if (within.startsWith('..') || path.isAbsolute(within)) { response.writeHead(404); response.end(); return; }
      const body = await fs.readFile(realFile);
      response.writeHead(200, { 'Content-Type': types[path.extname(relative)] || 'application/octet-stream', 'Content-Length': body.byteLength });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch { response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(request.method === 'HEAD' ? undefined : '无法读取游戏文件。'); }
  });
}
if (require.main === module) {
  (async () => {
    const port = Number(process.env.PORT || 4177);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须是 1–65535 之间的端口号。');
    const server = await createServer({ root: process.argv.includes('--dist') ? path.join(ROOT, 'dist') : ROOT });
    server.on('error', error => {
      console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用。请关闭已有预览，或设置 PORT 后重试。` : `预览启动失败：${error.message}`);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${port}`;
      console.log(`游间游戏大厅已准备好：${url}\n按 Ctrl+C 停止预览。`);
      if (process.argv.includes('--open')) {
        const command = process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
        const args = process.platform === 'win32' ? ['/d', '/c', 'start', '', url] : [url];
        const child = spawn(command, args, { windowsHide: true, stdio: 'ignore' });
        child.on('error', () => console.log(`请在浏览器中打开 ${url}`));
        child.unref();
      }
    });
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { createServer };
