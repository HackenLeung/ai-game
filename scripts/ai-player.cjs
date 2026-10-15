'use strict';
/**
 * AI 玩家（命令行）：让模型自己读游戏画面、做决定，再通过真实鼠标点击玩游戏。
 *
 * 用法：node scripts/ai-player.cjs --turns=40
 * 现场观看：node scripts/ai-player.cjs --headed --delay=1200 --turns=30
 * 录制视频：node scripts/ai-player.cjs --video --turns=40
 * jev 引擎：node scripts/ai-player.cjs --engine=jev --turns=20
 *
 * 需要本地预览已启动（npm start）。模型注册表、提示词与决策都在 scripts/ai-core.cjs，
 * 画面读取与动作计划在 hall/ai-observer.js，两处都与网页版 AI 面板共用。
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const browserTools = require('./browser-tools.cjs');
const core = require('./ai-core.cjs');
const observer = require('../hall/ai-observer.js');

const ROOT = path.resolve(__dirname, '..');
const OBSERVER_PATH = path.join(ROOT, 'hall', 'ai-observer.js');

function parseArgs(argv) {
  const options = {
    game: 'jihuan',
    url: 'http://127.0.0.1:4177',
    out: path.join(ROOT, 'test-results', 'ai-play'),
    turns: 40,
    delay: 600,
    headed: false,
    video: 'auto',
    screenshots: true,
    dry: false,
    history: core.RUNTIME.history,
    timeout: core.RUNTIME.timeout,
    engine: process.env.AI_ENGINE || 'chat',
    baseUrl: null,
    model: null,
  };
  const numbers = { turns: 'turns', delay: 'delay', history: 'history', timeout: 'timeout' };
  const strings = { game: 'game', url: 'url', out: 'out', model: 'model', engine: 'engine', 'base-url': 'baseUrl' };
  for (const raw of argv) {
    const [flag, ...rest] = raw.replace(/^--/, '').split('=');
    const value = rest.join('=');
    if (strings[flag]) options[strings[flag]] = value;
    else if (numbers[flag]) options[numbers[flag]] = Number(value);
    else if (flag === 'video') options.video = ['', 'true', 'on'].includes(value) ? true : ['false', 'off', 'none'].includes(value) ? false : 'auto';
    else if (['headed', 'screenshots', 'dry'].includes(flag)) options[flag] = value === 'true' || value === '';
  }
  if (!core.getModel(options.engine)) throw new Error(`配置里没有「${options.engine}」，可选：${core.listConfigs().map(item => item.id).join('、')}`);
  return options;
}

/** --engine 就是配置里的模型 id（预设是 chat、jev），可以在网页面板里增删改。 */
function configure(options) {
  const entry = core.getModel(options.engine);
  if (!entry) throw new Error(`配置里没有「${options.engine}」`);
  if (options.baseUrl) entry.baseUrl = options.baseUrl;
  if (options.model) entry.model = options.model;
  if (options.timeout) core.RUNTIME.timeout = options.timeout;
  return entry;
}

/* ── 读取画面：与网页版共用 hall/ai-observer.js ───────────────── */

async function observe(page) {
  const observation = await page.evaluate(() => window.AiObserver.readObservation());
  observation.recipes = await page.evaluate(() => window.AiObserver.scanCraftRecipes()).catch(() => observation.recipes);
  observation.inventory = await page.evaluate(() => window.AiObserver.scanUsableItems()).catch(() => observation.inventory);
  return observation;
}

/* ── 把决定变成真实的界面操作 ──────────────────────────────── */

async function showView(page, view) {
  if (await page.locator(`body[data-view="${view}"]`).count()) return { ok: true };
  const button = page.locator(`.nav-button[data-view="${view}"]`).first();
  if (!(await button.count())) return { ok: false, message: `界面上找不到「${view}」视图` };
  await button.click({ timeout: 4000 });
  await page.waitForSelector(`body[data-view="${view}"]`, { timeout: 5000 }).catch(() => {});
  return { ok: true };
}

async function press(page, selectors, label) {
  for (const selector of selectors) {
    const target = page.locator(selector).first();
    if (!(await target.count())) continue;
    if (await target.isDisabled().catch(() => false)) return { ok: false, message: `「${label}」现在不可用` };
    try {
      await target.click({ timeout: 4000 });
      return { ok: true };
    } catch (error) {
      // 场景动画或重绘可能让真实鼠标点击落空，退回在页面里触发一次点击事件。
      const triggered = await page.evaluate(selector => {
        const element = document.querySelector(selector);
        if (!element || element.disabled) return false;
        element.click();
        return true;
      }, selector).catch(() => false);
      if (triggered) return { ok: true, message: '（元素正在动画，已直接在页面上触发点击）' };
      return { ok: false, message: `点击「${label}」失败：${String(error.message).split('\n')[0]}` };
    }
  }
  return { ok: false, message: `界面上找不到「${label}」` };
}

async function perform(page, decision, observation) {
  const plan = observer.planAction(decision.action, decision.id, observation);
  if (!plan) return { ok: false, message: `不支持的动作 ${decision.action}` };
  for (const step of plan.steps) {
    if (step.type === 'view') {
      const view = await showView(page, step.view);
      if (!view.ok) return view;
    } else if (step.type === 'filter') {
      let found = false;
      for (const category of step.categories) {
        const switched = await press(page, [`[data-craft-filter="${category}"]`], `分类 ${category}`);
        if (!switched.ok) continue;
        if (await page.locator(`#recipe-grid [data-action="craft"][data-id="${step.target}"]`).count()) { found = true; break; }
      }
      if (!found) return { ok: false, message: `工坊里没有「${step.target}」这个配方` };
    } else {
      const result = await press(page, step.selectors, step.label);
      if (!result.ok) return result;
    }
  }
  return { ok: true, message: plan.note };
}

async function waitForProgress(page, timeout = 4000) {
  const signature = () => page.evaluate(() => {
    const head = document.querySelector('#journal-list .journal-entry p')?.textContent || '';
    const title = document.querySelector('#journal-list .journal-entry h3')?.textContent || '';
    return `${document.body.dataset.location}|${document.querySelector('#game-time')?.textContent}|${title}|${head}|${document.getElementById('game-dialog')?.open}`;
  });
  const start = await signature();
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await page.waitForTimeout(120);
    if ((await signature()) !== start) return true;
  }
  return false;
}

/* ── 主流程 ────────────────────────────────────────────────── */

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

/* ── 用逐步截图合成一段紧凑的延时回放 ────────────────────────── */

function findFfmpeg() {
  if (process.env.PLAYWRIGHT_FFMPEG && fs.existsSync(process.env.PLAYWRIGHT_FFMPEG)) {
    return { binary: process.env.PLAYWRIGHT_FFMPEG, full: true };
  }
  // 系统 ffmpeg 功能完整，优先使用；Playwright 自带的精简版只能编码 VP8，缺少 PNG 解码。
  const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  for (const folder of (process.env.PATH || '').split(path.delimiter)) {
    if (!folder) continue;
    const candidate = path.join(folder, name);
    if (fs.existsSync(candidate)) return { binary: candidate, full: true };
  }
  const roots = [
    path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright'),
    path.join(os.homedir(), '.cache', 'ms-playwright'),
    path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
  ];
  const candidates = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const folder of fs.readdirSync(root)) {
      if (!folder.startsWith('ffmpeg')) continue;
      const file = path.join(root, folder, process.platform === 'win32' ? 'ffmpeg-win64.exe' : process.platform === 'darwin' ? 'ffmpeg-mac' : 'ffmpeg-linux');
      if (fs.existsSync(file)) candidates.push(file);
    }
  }
  const binary = candidates.sort().pop();
  return binary ? { binary, full: false } : null;
}

function buildTimelapse(frames, output) {
  if (frames < 2) return null;
  const ffmpeg = findFfmpeg();
  if (!ffmpeg || !ffmpeg.full) return null;
  const folder = path.dirname(output);
  const input = path.join(folder, 'turn-%03d.png').replace(/\\/g, '/');
  const target = output.replace(/\\/g, '/');
  execFileSync(ffmpeg.binary, [
    '-y', '-loglevel', 'error', '-start_number', '1', '-framerate', '1', '-i', input,
    '-vf', 'scale=1280:-2,fps=12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '30', target.replace(/\.webm$/, '.mp4'),
  ], { stdio: 'pipe' });
  const finished = output.replace(/\.webm$/, '.mp4');
  return fs.existsSync(finished) ? finished : null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const entry = configure(options);
  const catalog = require('../hall/catalog.js');
  const game = catalog.get(options.game);
  if (!game) throw new Error(`目录里没有游戏「${options.game}」，可选：${catalog.games.map(item => item.id).join('、')}`);
  const out = ensureDirectory(options.out);
  const { chromium, launch } = browserTools();
  const browser = await chromium.launch({ ...launch, headless: !options.headed });
  const viewport = { width: 1440, height: 960 };
  let context;
  try {
    context = await browser.newContext({ viewport, ...(options.video === true ? { recordVideo: { dir: out, size: { width: 1280, height: 800 } } } : {}) });
  } catch (error) {
    if (options.video !== true) throw error;
    console.warn(`无法录制视频（${error.message}），改为只保存截图与延时回放。`);
    options.video = 'auto';
    context = await browser.newContext({ viewport });
  }
  await context.addInitScript({ path: OBSERVER_PATH });
  const page = await context.newPage();
  const transcript = [];
  const history = [];
  const videoPath = options.video ? path.join(out, 'run.webm') : null;
  let interrupted = false;
  let failures = 0;
  const result = { game: game.id, engine: options.engine, model: entry.model, turns: 0, status: 'playing', nights: '0', actions: [] };
  const flush = () => {
    const video = videoPath && fs.existsSync(videoPath) ? videoPath : null;
    const timelapse = ['timelapse.mp4', 'timelapse.webm'].map(name => path.join(out, name)).find(file => fs.existsSync(file)) || null;
    fs.writeFileSync(path.join(out, 'summary.json'), `${JSON.stringify(result, null, 2)}\n`);
    fs.writeFileSync(path.join(out, 'transcript.md'), renderTranscript(result, transcript, out, video, timelapse));
  };
  const stop = () => { interrupted = true; console.log('\n收到中断信号，正在保存这一次的游玩记录……'); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    await page.goto(new URL(game.entry, `${options.url.replace(/\/+$/, '')}/`).href, { waitUntil: 'load' });
    await page.waitForSelector(game.readySelector, { timeout: 15000 });
    console.log(`AI 开始游玩《${game.title} · ${game.subtitle}》，引擎 ${options.engine}，模型 ${entry.model}，最多 ${options.turns} 步。\n`);

    for (let turn = 1; turn <= options.turns; turn++) {
      if (interrupted) break;
      const observation = await observe(page);
      const frame = core.renderObservation(observation);
      if (options.dry) { console.log(`── 第 ${turn} 步 ──\n${frame}\n`); break; }
      if (observation.status !== 'playing' && !(observation.dialog?.choices || []).length) {
        result.status = observation.status;
        break;
      }
      let decision;
      try {
        decision = await core.decide(options.engine, observation, history);
      } catch (error) {
        failures += 1;
        console.warn(`[${String(turn).padStart(2, '0')}] 模型没能给出决定：${error.message}（连续失败 ${failures} 次）`);
        if (failures >= 3) { console.warn('连续多次无法决策，提前结束这一局。'); break; }
        history.push(`第 ${turn} 步：模型未能给出决定，已跳过`);
        if (history.length > options.history) history.shift();
        result.turns = turn;
        flush();
        continue;
      }
      failures = 0;
      const applied = await perform(page, decision, observation);
      await waitForProgress(page);
      if (options.delay) await page.waitForTimeout(options.delay);

      const after = await observe(page);
      const newest = after.journal[0];
      const note = applied.ok ? (newest ? `${newest.title}：${newest.text}` : '（画面已更新）') : `动作无效：${applied.message}`;
      history.push(`第 ${turn} 步：${decision.key || `${decision.action} ${decision.id || ''}`} → ${note}`);
      if (history.length > options.history) history.shift();
      result.turns = turn;
      result.status = after.status;
      result.nights = after.guide.nights;
      result.actions.push({ turn, ...decision, ok: applied.ok, note });

      const label = decision.key || `${decision.action}${decision.id ? ` ${decision.id}` : ''}`;
      console.log(`[${String(turn).padStart(2, '0')}] 第 ${after.clock.day} 天 ${after.clock.time} ｜ ${label} ｜ ${decision.thought}`);
      console.log(`     ${applied.ok ? '✓' : '✗'} ${note}`);
      transcript.push({ turn, frame, decision, note, ok: applied.ok, clock: after.clock, stats: after.stats, status: after.status });
      if (options.screenshots) await page.screenshot({ path: path.join(out, `turn-${String(turn).padStart(3, '0')}.png`) });
      flush();
      if (after.status !== 'playing') break;
    }
  } finally {
    result.nights = result.nights || '0';
    await page.screenshot({ path: path.join(out, 'final.png') }).catch(() => {});
    const video = options.video === true ? page.video() : null;
    await context.close();
    if (videoPath && video) await video.saveAs(videoPath).catch(error => console.warn(`视频保存失败：${error.message}`));
    if (options.screenshots && transcript.length) {
      try {
        const timelapse = buildTimelapse(transcript.length, path.join(out, 'timelapse.webm'));
        if (timelapse) console.log(`已生成紧凑的延时回放：${path.relative(ROOT, timelapse)}`);
      } catch (error) {
        console.warn(`生成延时回放失败：${String(error.message).split('\n')[0]}`);
      }
    }
    await browser.close();
    flush();
  }

  const statusText = { playing: '仍未结束', won: '找到归途，通关成功', dead: '旅程结束' }[result.status] || result.status;
  console.log(`\n共 ${result.turns} 步 · 熬过 ${result.nights} / 7 夜 · ${statusText}`);
  console.log(`过程记录：${path.relative(ROOT, path.join(out, 'transcript.md'))}`);
  return result;
}

function describeDecision(decision) {
  return decision.key || `${decision.action}${decision.id ? ` ${decision.id}` : ''}`;
}

function probabilityLines(decision, heading) {
  const entries = Object.entries(decision.probabilities || {});
  if (!entries.length) return [];
  entries.sort((a, b) => b[1] - a[1]);
  return [`${heading}：${entries.map(([key, value]) => `${key} ${(value * 100).toFixed(0)}%`).join('、')}`];
}

function renderTranscript(result, transcript, out, videoPath, timelapsePath) {
  const jev = result.engine === 'jev';
  const lines = [
    `# AI 游玩记录 · ${result.game}`,
    '',
    `- 引擎：\`${result.engine || 'chat'}\``,
    `- 模型：\`${result.model}\``,
    `- 步数：${result.turns}`,
    `- 结果：${result.status}（熬过 ${result.nights} / 7 夜）`,
    timelapsePath ? `- 延时回放：\`${path.basename(timelapsePath)}\`` : '',
    videoPath ? `- 完整录像：\`${path.basename(videoPath)}\`` : '',
    '',
    jev ? '| 步 | 时间 | 状态 | 选择 | 置信度 | 风险 | 结果 |' : '| 步 | 时间 | 状态 | 动作 | 理由 | 结果 |',
    jev ? '| --- | --- | --- | --- | --- | --- | --- |' : '| --- | --- | --- | --- | --- | --- |',
  ].filter(Boolean);
  for (const entry of transcript) {
    const stats = entry.stats.map(stat => `${stat.name} ${stat.value}`).join(' ');
    if (jev) {
      lines.push(`| ${entry.turn} | 第 ${entry.clock.day} 天 ${entry.clock.time} | ${stats} | \`${describeDecision(entry.decision)}\` | ${entry.decision.confidence ?? ''} | ${entry.decision.risk ?? ''} | ${entry.ok ? '' : '✗ '}${entry.note} |`);
    } else {
      lines.push(`| ${entry.turn} | 第 ${entry.clock.day} 天 ${entry.clock.time} | ${stats} | \`${describeDecision(entry.decision)}\` | ${entry.decision.thought} | ${entry.ok ? '' : '✗ '}${entry.note} |`);
    }
  }
  lines.push('', '## 逐步画面', '');
  for (const entry of transcript) {
    lines.push(`### 第 ${entry.turn} 步`);
    lines.push('', '```text', entry.frame, '```', '');
    if (jev) {
      lines.push(`选择：\`${describeDecision(entry.decision)}\`｜置信度 ${entry.decision.confidence ?? '—'}｜风险 ${entry.decision.risk ?? '—'}`, '');
      lines.push(...probabilityLines(entry.decision, '概率分布'), '');
      if (entry.decision.candidates?.length) {
        lines.push('候选：', ...entry.decision.candidates.map(candidate => `- \`${candidate.key}\` — ${candidate.description}`), '');
      }
    } else {
      lines.push(`决定：\`${describeDecision(entry.decision)}\` — ${entry.decision.thought}`, '');
    }
    lines.push(`结果：${entry.note}`, '');
    if (fs.existsSync(path.join(out, `turn-${String(entry.turn).padStart(3, '0')}.png`))) lines.push(`![第 ${entry.turn} 步](./turn-${String(entry.turn).padStart(3, '0')}.png)`, '');
  }
  return `${lines.join('\n')}\n`;
}

if (require.main === module) {
  main().then(() => { process.exitCode = 0; }).catch(error => {
    console.error(`AI 游玩失败：${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, configure, observe, perform, buildTimelapse, renderTranscript, OBSERVER_PATH };
