'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { ROOT, collectSiteFiles } = require('./site-files.cjs');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
async function createServer({ root = ROOT, ai = true } = {}) {
  const files = new Set(await collectSiteFiles(root));
  const core = ai ? require('./ai-core.cjs') : null;
  async function readJson(request, limit = 512 * 1024) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > limit) throw new Error('请求内容过大');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  }
  return http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Cache-Control', 'no-store');
    const sendJson = (status, payload) => {
      const body = Buffer.from(JSON.stringify(payload));
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.byteLength });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    // AI 游玩只在本地预览里提供；密钥留在服务端，浏览器只会拿到模型名称与是否配了密钥。
    if (core && request.url.split('?')[0].startsWith('/ai/')) {
      const route = request.url.split('?')[0];
      const allowed = {
        '/ai/models': ['GET', 'HEAD', 'POST', 'DELETE'],
        '/ai/probe': ['POST'],
        '/ai/decide': ['POST'],
      }[route];
      if (!allowed) { response.writeHead(404); response.end(); return; }
      if (!allowed.includes(request.method)) { response.writeHead(405, { Allow: allowed.join(', ') }); response.end(); return; }
      // 这些接口会读写本机配置并访问外部服务，只接受同源页面发起的 JSON 请求。
      const site = request.headers['sec-fetch-site'];
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        if (site && !['same-origin', 'none'].includes(site)) { response.writeHead(403); response.end('仅允许同源请求'); return; }
        if (!String(request.headers['content-type'] || '').includes('application/json')) { response.writeHead(415); response.end('仅接受 application/json'); return; }
      }
      try {
        if (route === '/ai/models' && ['GET', 'HEAD'].includes(request.method)) {
          // 探测要用带密钥的完整配置；回给浏览器的只有去掉密钥的版本。
          const configs = core.listConfigs();
          const models = core.publicModels();
          const probes = await Promise.all(configs.map(config => core.probe(config, 3000)));
          sendJson(200, {
            models: models.map((model, index) => ({
              ...model,
              available: probes[index].ok,
              modelCount: probes[index].count || 0,
              error: probes[index].error || '',
            })),
            configPath: core.CONFIG_PATH,
          });
          return;
        }
        const body = ['GET', 'HEAD'].includes(request.method) ? {} : await readJson(request);
        // 测试连接：只确认这个地址能不能列出模型，不落盘；密钥留空时沿用这条配置已保存的密钥。
        if (route === '/ai/probe') {
          const saved = body.id ? core.getModel(String(body.id)) : null;
          const baseUrl = String(body.baseUrl || '').trim().replace(/\/+$/, '');
          // 只有地址没改时才沿用已保存的密钥，免得把密钥顺手带到另一个地址上。
          const reuse = saved && saved.baseUrl.replace(/\/+$/, '') === baseUrl ? saved.apiKey : '';
          const entry = { baseUrl, model: '', engine: 'chat', apiKey: String(body.apiKey || reuse || '') };
          sendJson(200, { probe: await core.probe(entry, 8000) });
          return;
        }
        if (route === '/ai/models' && request.method === 'POST') { sendJson(200, { model: core.upsertModel(body) }); return; }
        if (route === '/ai/models' && request.method === 'DELETE') { sendJson(200, { removed: core.deleteModel(String(body.id || '')) }); return; }
        const observation = body.observation;
        if (!observation || typeof observation !== 'object') throw new Error('缺少画面数据');
        const decision = await core.decide(String(body.model || ''), observation, Array.isArray(body.history) ? body.history.slice(-core.RUNTIME.history) : []);
        sendJson(200, { decision });
      } catch (error) {
        // 上游原始错误直接回给页面，方便排查，不做静默回退。
        sendJson(error.httpStatus || 502, { error: String(error.message || error) });
      }
      return;
    }
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
