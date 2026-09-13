'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4173);
const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/styles.css': ['styles.css', 'text/css'], '/game.js': ['game.js', 'text/javascript'], '/effects.js': ['effects.js', 'text/javascript'], '/app.js': ['app.js', 'text/javascript'] };
const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
  let pathname;
  try { pathname = new URL(request.url, 'http://localhost').pathname; } catch { response.writeHead(400); response.end(); return; }
  if (!Object.hasOwn(files, pathname)) { response.writeHead(404); response.end('Not found'); return; }
  const [file, type] = files[pathname];
  try {
    const body = await fs.readFile(path.join(root, file));
    response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(500); response.end('Unable to read game files'); }
});
server.on('error', error => { console.error(`无法启动预览：${error.message}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`余烬已准备好：http://127.0.0.1:${port}`));
