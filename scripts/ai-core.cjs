'use strict';
/**
 * AI 游玩的大脑：模型配置、两种决策引擎。命令行脚本和本地预览服务共用这一份。
 *
 * - 自定义的接口与密钥保存在仓库根目录的 .ai-config.json（已被 Git 忽略），
 *   首次运行会用预设生成；密钥只留在文件与服务端，不下发给浏览器。
 * - 模型地址只能来自这份配置，浏览器不能直接指定任意上游。
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const observer = require('../hall/ai-observer.js');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = process.env.AI_CONFIG_PATH || path.join(ROOT, '.ai-config.json');
const ENGINES = ['chat', 'jev'];

/** 取本机网关的 bearer 令牌作为预设的初始值；只在首次生成配置时读一次。 */
function readLocalGatewayKey() {
  try {
    const file = path.join(os.homedir(), '.codex', 'config.toml');
    const match = fs.readFileSync(file, 'utf8').match(/experimental_bearer_token\s*=\s*"([^"]+)"/);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

function presets() {
  return [
    {
      id: 'chat',
      label: '对话模型 · deepseek-v4.1-flash',
      engine: 'chat',
      baseUrl: process.env.AI_BASE_URL || 'http://127.0.0.1:3425/v1',
      model: process.env.AI_MODEL || 'localhost/cn:deepseek-v4.1-flash',
      apiKey: process.env.AI_API_KEY || '',
    },
    {
      id: 'jev',
      label: '决策模型 · jev-latest',
      engine: 'jev',
      baseUrl: process.env.JEV_BASE_URL || 'http://127.0.0.1:8899/v1',
      model: process.env.JEV_MODEL || 'jev-latest',
      apiKey: process.env.JEV_API_KEY || process.env.AI_API_KEY || '',
    },
    {
      id: 'gateway',
      label: '本地网关 · 8080',
      engine: 'chat',
      baseUrl: 'http://localhost:8080/v1',
      model: 'cn:deepseek-v4.1-flash',
      apiKey: readLocalGatewayKey(),
    },
  ];
}

let cache = null;

function readConfig() {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (Array.isArray(parsed.models) && parsed.models.length) {
      cache = { version: 1, models: parsed.models };
      return cache;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      // 配置读不出来时先留一份副本，别让手改坏的文件被预设直接盖掉。
      try {
        fs.copyFileSync(CONFIG_PATH, `${CONFIG_PATH}.recovery`);
        console.warn(`模型配置读取失败（${error.message}），已备份为 ${path.basename(CONFIG_PATH)}.recovery，本次先用预设。`);
      } catch {
        console.warn(`模型配置读取失败（${error.message}），改用预设。`);
      }
    }
  }
  cache = { version: 1, models: presets() };
  writeConfig(cache);
  return cache;
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify({ version: 1, models: config.models }, null, 2)}\n`, { mode: 0o600 });
}

function slugify(value) {
  const slug = String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || `model-${Date.now().toString(36)}`;
}

function normalize(entry, models) {
  const engine = ENGINES.includes(entry.engine) ? entry.engine : 'chat';
  const baseUrl = String(entry.baseUrl || '').trim();
  const model = String(entry.model || '').trim();
  if (!baseUrl) throw new Error('请填写接口地址');
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`接口地址不是合法的 URL：${baseUrl}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('接口地址只支持 http 或 https');
  if (!model) throw new Error('请填写模型名称');
  const label = String(entry.label || '').trim() || model;
  let id = String(entry.id || '').trim();
  if (!id || !models.some(item => item.id === id)) {
    const base = slugify(id || model);
    id = base;
    let suffix = 2;
    while (models.some(item => item.id === id)) id = `${base}-${suffix++}`;
  }
  return { id, label, engine, baseUrl: baseUrl.replace(/\/+$/, ''), model, apiKey: String(entry.apiKey || '').trim() };
}

function listConfigs() {
  return readConfig().models;
}

/** 给浏览器看的版本：不带密钥，只说明有没有配。 */
function publicModels() {
  return listConfigs().map(({ apiKey, ...rest }) => ({ ...rest, hasKey: Boolean(apiKey) }));
}

function getModel(id) {
  return listConfigs().find(item => item.id === id) || null;
}

function upsertModel(entry) {
  const config = readConfig();
  const existing = entry.id ? config.models.find(item => item.id === entry.id) : null;
  const others = config.models.filter(item => item !== existing);
  const keepsKey = entry.apiKey === undefined || entry.apiKey === null || entry.apiKey === '';
  const normalized = normalize({ ...entry, apiKey: keepsKey ? existing?.apiKey || '' : entry.apiKey }, others);
  if (existing) config.models[config.models.indexOf(existing)] = normalized;
  else config.models.push(normalized);
  writeConfig(config);
  return { ...normalized, apiKey: undefined, hasKey: Boolean(normalized.apiKey) };
}

function deleteModel(id) {
  const config = readConfig();
  const index = config.models.findIndex(item => item.id === id);
  if (index < 0) throw new Error(`没有这个模型「${id}」`);
  if (config.models.length <= 1) throw new Error('至少要保留一个模型');
  const [removed] = config.models.splice(index, 1);
  writeConfig(config);
  return { id: removed.id, label: removed.label };
}

/* ── 与上游对话 ────────────────────────────────────────────── */

const RUNTIME = { timeout: 120000, maxTokens: 2000, tokenCeiling: 16000, jevRisk: 0.6, history: 8 };

function endpoint(baseUrl, suffix) {
  return `${String(baseUrl).replace(/\/+$/, '')}/${suffix}`;
}

async function callUpstream(config, pathname, body, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(endpoint(config.baseUrl, pathname), {
      method: body === undefined ? 'GET' : 'POST',
      headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`模型接口返回 ${response.status}：${text.slice(0, 300)}`);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`模型接口返回的不是 JSON：${text.slice(0, 300)}`);
    }
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`模型接口超过 ${Math.round(timeout / 1000)} 秒没有响应`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** 只做「有没有模型」这一件事：读一次 /models 并回传模型名列表。 */
async function probe(entry, timeout = 8000) {
  try {
    const payload = await callUpstream(entry, 'models', undefined, timeout);
    const list = payload.data || payload.models || [];
    const ids = list.map(item => (typeof item === 'string' ? item : item?.id)).filter(Boolean);
    return { ok: true, count: ids.length, models: ids.slice(0, 300) };
  } catch (error) {
    return { ok: false, error: String(error.message || error) };
  }
}

const SYSTEM_PROMPT = `你正在亲自游玩中文荒野生存游戏《余烬》，通过点击游戏按钮来操作。
通关目标：① 在旧日遗迹（ruins）找到 3 枚古老碎片；② 备齐材料在营地（camp）建造「归途信标」；③ 熬过 7 个夜晚后待在营地。
生存规则：每小时消耗 3 饱食，饱食为 0 后每小时损失 12 生命；黑暗中每小时损失 14 生命与 10 理智，营火只照亮营地，夜里出门要先点燃火把；体感低于 5°C 每小时损失 4 生命（斗篷和火光可以御寒）；黑暗、湿地和遗迹会损耗理智，理智低于 20 会持续掉血；生肉和生蘑菇有代价，最好在营火旁烤熟再吃；工具会自动消耗耐久；每天清晨 06:00 各地资源恢复；查看地图、行囊、工坊不消耗时间，只有采集、制作、移动、进食才会推进时间。
行动策略要点：先制作石斧（需要树枝×2、燧石×2），再去松林伐木、去草地找食物；营火燃料归零前记得添柴；入夜前回到营地或备好火把；理智低时休息或吃熟食。
效率提醒：任何一次行动都会推进时间，请让每一步都有价值。建好「避风帐篷」后，夜里用 sleep 一次睡到 06:00，比反复添柴、歇息省下大量时间；「石头篝火」能让木材烧得更久，值得早建；营火已经够烧到清晨时就不要再添柴；夜里没有照明不要外出，留在营地做低耗时的准备；白天优先一次行动拿够关键物资（木材、食物、遗迹碎片）。
你只能输出一个 JSON 对象，不要输出解释文字或代码块：
{"thought":"一句话说明你的判断","action":"动作类型","id":"对应 id"}
action 只能取以下值：
- "gather"（执行当前地点的采集/休息类动作，id 用【当前地点的动作】里的 id）
- "feedFire"（营地添柴，无需 id）
- "sleep"（营地入睡，需要帐篷且是夜晚，无需 id）
- "use"（使用或食用行囊物品，id 只能用【行囊】里带 [use id=…] 的 id，没标的物品吃不了）
- "craft"（制作或建造，id 用【当前可制作/建造】里的 id）
- "travel"（移动，id 用【可前往】里的地点 id）
- "choose"（弹窗事件选项，id 用【弹窗选项】里的 id）
- "wait"（不做任何事，仅在确实无事可做时使用）
如果【弹窗】存在，你只能选择 "choose"，因为其他操作会被弹窗挡住。
必须从上面给出的 id 里选择，不能编造。`;

const ACTIONS = ['gather', 'travel', 'craft', 'use', 'feedFire', 'sleep', 'choose', 'wait'];

/* ── 对话引擎：模型直接输出动作 JSON ───────────────────────── */

function parseDecision(raw) {
  const cleaned = String(raw).replace(/```[a-z]*/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`无法从回复里找到 JSON：${cleaned.slice(0, 120)}`);
  const data = JSON.parse(cleaned.slice(start, end + 1));
  const action = String(data.action || '').trim();
  if (!ACTIONS.includes(action)) throw new Error(`模型给出了未知动作「${action}」`);
  return { action, id: data.id == null ? '' : String(data.id).trim(), thought: String(data.thought || '').replace(/\s+/g, ' ').trim() };
}

async function decideChat(config, observation, history = []) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  messages.push({ role: 'user', content: `${history.length ? `【你的最近行动】\n${history.join('\n')}\n\n` : ''}【当前画面】\n${observer.renderObservation(observation)}\n\n请输出你的下一步行动 JSON。` });
  let budget = RUNTIME.maxTokens;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let payload;
    try {
      payload = await callUpstream(config, 'chat/completions', {
        model: config.model, messages, max_tokens: budget, temperature: 0.7, response_format: { type: 'json_object' },
      }, RUNTIME.timeout);
    } catch (error) {
      messages.push({ role: 'user', content: `上一次请求失败：${error.message}。请只输出一个合法 JSON 对象。` });
      continue;
    }
    const choice = payload.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content === 'string' && content.trim()) {
      try {
        return { ...parseDecision(content), engine: 'chat', model: config.model };
      } catch (error) {
        messages.push({ role: 'user', content: `上一次回复无法使用：${error.message}。请只输出一个合法 JSON 对象，例如 {"thought":"先砍柴","action":"gather","id":"chop"}。` });
        continue;
      }
    }
    // 推理型模型可能把额度全部用在思考上，导致正文为空；此时提高额度重试。
    if (choice?.finish_reason === 'length' && budget < RUNTIME.tokenCeiling) {
      budget = Math.min(budget * 3, RUNTIME.tokenCeiling);
      continue;
    }
    messages.push({ role: 'user', content: '上一次回复没有正文。请只输出一个合法 JSON 对象。' });
  }
  throw new Error('模型连续多次没有给出可用的动作 JSON');
}

/* ── jev 引擎：枚举候选，问 choice 与 noul ───────────────── */

async function askJev(config, content, criteria) {
  const payload = await callUpstream(config, 'chat/completions', {
    model: config.model,
    messages: [{ role: 'user', content }],
    questions: {
      move: { type: 'choice', instructions: '这一回合做什么最合理', criteria },
      risk: { type: 'noul', instructions: '这个动作是否可能直接导致失败或不可逆损失' },
    },
  }, RUNTIME.timeout);
  const answers = payload.answers || payload.choices?.[0]?.message?.answers;
  if (!answers) throw new Error('接口没有返回 answers（这个模型可能不支持 choice / noul 问题）');
  const move = answers.move || {};
  const risk = Number(answers.risk?.noul ?? answers.risk?.value ?? 0);
  return {
    key: String(move.choice || ''),
    confidence: Number(move.confidence ?? 0),
    probabilities: move.probabilities || {},
    risk: Number.isFinite(risk) ? risk : 0,
  };
}

async function decideJev(config, observation, history = []) {
  const options = observer.enumerateOptions(observation);
  if (!options.length) throw new Error('这一回合没有可执行的动作，无法询问模型');
  const criteria = {};
  for (const option of options) criteria[option.key] = observer.describeOption(option, observation);
  const lines = [];
  if (history.length) lines.push(`【你的最近行动】\n${history.join('\n')}`, '');
  lines.push('你是《余烬》荒野生存游戏里的决策模型，只能从候选动作里选一个执行。', '');
  lines.push(observer.renderObservation(observation), '');
  lines.push('【候选动作】', ...options.map(option => `  ${option.key} —— ${criteria[option.key]}`));
  const ask = async extra => {
    if (extra) lines.push('', extra);
    return askJev(config, lines.join('\n'), criteria);
  };
  const first = await ask('');
  if (!options.some(option => option.key === first.key)) {
    throw new Error(`模型选择了不在候选里的动作「${first.key}」，候选：${options.map(option => option.key).join('、')}`);
  }
  let picked = first;
  let rerolled = false;
  if (first.risk >= RUNTIME.jevRisk && first.key !== 'wait:') {
    const again = await ask('上次选择风险很高，请重选');
    if (options.some(option => option.key === again.key)) { picked = again; rerolled = true; }
  }
  const chosen = options.find(option => option.key === picked.key);
  return {
    action: chosen.action,
    id: chosen.id,
    key: picked.key,
    confidence: picked.confidence,
    risk: picked.risk,
    probabilities: picked.probabilities,
    candidates: options.map(option => ({ key: option.key, description: criteria[option.key], locked: option.locked })),
    thought: `${picked.key}（置信度 ${picked.confidence}，风险 ${picked.risk}）`,
    rerolled,
    engine: 'jev',
    model: config.model,
  };
}

async function decide(modelId, observation, history = []) {
  const config = getModel(modelId);
  if (!config) throw new Error(`没有这个模型「${modelId}」，可选：${listConfigs().map(item => item.id).join('、')}`);
  return config.engine === 'jev' ? decideJev(config, observation, history) : decideChat(config, observation, history);
}

module.exports = {
  ROOT, CONFIG_PATH, ACTIONS, ENGINES, SYSTEM_PROMPT, RUNTIME,
  listConfigs, publicModels, getModel, upsertModel, deleteModel, probe, presets,
  decide, decideChat, decideJev, parseDecision, renderObservation: observer.renderObservation,
};
