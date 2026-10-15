(function () {
  'use strict';
  // 网页版 AI 游玩：在同一个页面里读游戏 iframe 的画面，交给本地预览的 /ai/decide，
  // 再把决定翻译成真实点击。密钥只留在服务端，这里拿到的只是模型名称与决定。
  const O = globalThis.AiObserver, U = globalThis.HallUI, $ = id => document.getElementById(id);
  const frame = $('game-frame');
  const panel = $('ai-panel');
  if (!O || !U || !frame || !panel) return;

  const state = { running: false, stop: false, models: [], history: [], timer: 0, wake: null, abort: null, editing: '' };
  const log = $('ai-log');
  const gameId = new URLSearchParams(location.search).get('game') || '';
  const adapted = O.supports(gameId);

  function setStatus(text) { $('ai-status').textContent = text; }

  function addEntry(message) {
    const item = document.createElement('li');
    item.className = 'ai-entry';
    item.innerHTML = `<div class="ai-entry-head"><b>出错了</b></div><div class="ai-entry-choice">—</div><div class="ai-entry-note">${U.escape(message)}</div>`;
    item.classList.add('failed');
    log.prepend(item);
    while (log.children.length > 60) log.lastElementChild.remove();
    return item;
  }

  function gameDocument() {
    try { return frame.contentDocument; } catch { return null; }
  }

  function gameReady() {
    const doc = gameDocument();
    const game = globalThis.GameCatalog?.get(new URLSearchParams(location.search).get('game'));
    return Boolean(doc && (!game || doc.querySelector(game.readySelector)));
  }

  /* ── 与服务端对话 ───────────────────────────────────────── */

  async function loadModels(preferId = '') {
    let payload;
    try {
      const response = await fetch('ai/models', { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      payload = await response.json();
    } catch {
      // 构建产物或直接打开文件时没有本地服务，AI 游玩不可用。
      $('ai-note').textContent = 'AI 游玩需要本地预览提供模型接口：先运行 npm start（或 npm run preview），再从预览地址打开游戏。';
      return false;
    }
    state.models = payload.models || [];
    $('ai-config-path').textContent = payload.configPath ? `保存在 ${payload.configPath.split(/[\\/]/).pop()}` : '';
    const select = $('ai-model');
    const previous = select.value;
    select.innerHTML = state.models.map(model => `<option value="${U.escape(model.id)}"${model.available ? '' : ' disabled'}>${U.escape(model.label)}${model.available ? '' : '（未连接）'}</option>`).join('');
    const first = state.models.find(model => model.available);
    if (preferId && state.models.some(model => model.id === preferId)) select.value = preferId;
    else if (previous && state.models.some(model => model.id === previous && model.available)) select.value = previous;
    else if (first) select.value = first.id;
    if (!state.running) $('ai-run').disabled = !first || !adapted;
    $('ai-note').textContent = !adapted
      ? '这款游戏还没有接入 AI 游玩：画面读取与动作计划目前只为余烬写了适配。'
      : first
        ? 'AI 会读取真实画面并通过真实按钮操作游戏，随时可以接管或停止。'
        : '所有模型都没有连上：点下方「配置模型…」填好接口地址后测试连接。';
    if (!state.editing) fillConfigForm(select.value);
    return Boolean(first);
  }

  /* ── 配置模型与接口 ─────────────────────────────────────── */

  function currentModel() {
    return state.models.find(model => model.id === $('ai-model').value) || null;
  }

  function setConfigStatus(message, failed = false) {
    const status = $('ai-config-status');
    status.textContent = message;
    status.classList.toggle('failed', Boolean(failed));
  }

  function fillConfigForm(id) {
    const model = state.models.find(item => item.id === id);
    state.editing = model ? model.id : '';
    $('ai-cfg-label').value = model ? model.label : '';
    $('ai-cfg-url').value = model ? model.baseUrl : 'http://localhost:8080/v1';
    $('ai-cfg-model').value = model ? model.model : '';
    $('ai-cfg-key').value = '';
    $('ai-cfg-key').placeholder = model?.hasKey ? '已保存，留空则不修改' : '可留空';
    $('ai-cfg-engine').value = model ? model.engine : 'chat';
    $('ai-cfg-delete').disabled = !model;
    setConfigStatus(model ? `正在编辑「${model.label}」：${model.available ? `已连接，共 ${model.modelCount} 个模型` : model.error || '未连接'}` : '填好后先「测试连接」，再从模型名称下拉里选一个。');
  }

  function openConfig() {
    const panelBody = $('ai-config');
    panelBody.hidden = false;
    $('ai-config-toggle').setAttribute('aria-expanded', 'true');
    state.editing = '';
    fillConfigForm($('ai-model').value);
  }

  function closeConfig() {
    $('ai-config').hidden = true;
    $('ai-config-toggle').setAttribute('aria-expanded', 'false');
  }

  function configFields() {
    return {
      label: $('ai-cfg-label').value.trim(),
      baseUrl: $('ai-cfg-url').value.trim(),
      model: $('ai-cfg-model').value.trim(),
      apiKey: $('ai-cfg-key').value,
      engine: $('ai-cfg-engine').value,
    };
  }

  async function postJson(path, body, method = 'POST') {
    const response = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
    return payload;
  }

  async function testConnection() {
    const fields = configFields();
    if (!fields.baseUrl) { setConfigStatus('请先填写接口地址。', true); return; }
    setConfigStatus('正在测试连接…');
    try {
      const { probe } = await postJson('ai/probe', { id: state.editing || '', baseUrl: fields.baseUrl, apiKey: fields.apiKey });
      if (!probe.ok) { setConfigStatus(`连不上：${probe.error}`, true); return; }
      $('ai-cfg-model-list').innerHTML = probe.models.map(id => `<option value="${U.escape(id)}"></option>`).join('');
      const exact = probe.models.includes(fields.model);
      if (!fields.model && probe.models.length) $('ai-cfg-model').value = probe.models[0];
      setConfigStatus(`连接成功，共 ${probe.count} 个模型${exact || !fields.model ? '' : `；「${fields.model}」不在列表里，点输入框可以从列表中选择`}。`);
    } catch (error) {
      setConfigStatus(`连不上：${error.message}`, true);
    }
  }

  async function saveConfig() {
    const fields = configFields();
    if (!fields.baseUrl || !fields.model) { setConfigStatus('接口地址和模型名称都要填写。', true); return; }
    const updating = Boolean(state.editing);
    try {
      const { model } = await postJson('ai/models', { id: state.editing || '', ...fields });
      // 清掉编辑态，让 loadModels 把下拉切到刚保存的这条并回填表单。
      state.editing = '';
      const ready = await loadModels(model?.id || '');
      setConfigStatus(`${updating ? '已更新' : '已保存'}「${fields.label || fields.model}」。`);
      if (ready) setStatus('配置已保存。');
    } catch (error) {
      setConfigStatus(`保存失败：${error.message}`, true);
    }
  }

  async function deleteConfig() {
    const model = currentModel();
    if (!model) return;
    if (!confirm(`删除配置「${model.label}」？只删这条配置，不影响已经保存的游戏进度。`)) return;
    try {
      await postJson('ai/models', { id: model.id }, 'DELETE');
      state.editing = '';
      await loadModels();
      setConfigStatus(`已删除「${model.label}」。`);
    } catch (error) {
      setConfigStatus(`删除失败：${error.message}`, true);
    }
  }

  async function askDecision(model, observation) {
    if (!model) throw new Error('还没有选好模型，请等模型列表加载完成。');
    const response = await fetch('ai/decide', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, observation, history: state.history.slice(-8) }),
      signal: state.abort?.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `决策接口返回 ${response.status}`);
    return payload.decision;
  }

  /* ── 把决定点击到游戏里 ─────────────────────────────────── */

  function clickInGame(selectors) {
    const doc = gameDocument();
    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (!element) continue;
      if (element.disabled) return { ok: false, message: '这个按钮当前不可用' };
      element.click();
      return { ok: true };
    }
    return { ok: false, message: '界面上找不到要点的按钮' };
  }

  function showViewInGame(view) {
    const doc = gameDocument();
    if (doc.body.dataset.view === view) return { ok: true };
    const button = doc.querySelector(`.nav-button[data-view="${view}"]`);
    if (!button) return { ok: false, message: `找不到「${view}」视图` };
    button.click();
    return { ok: true };
  }

  function performInGame(decision, observation) {
    const plan = O.planAction(decision.action, decision.id, observation);
    if (!plan) return { ok: false, message: `不支持的动作 ${decision.action}` };
    for (const step of plan.steps) {
      if (step.type === 'view') {
        const result = showViewInGame(step.view);
        if (!result.ok) return result;
      } else if (step.type === 'filter') {
        const doc = gameDocument();
        let found = false;
        for (const category of step.categories) {
          const button = doc.querySelector(`[data-craft-filter="${category}"]`);
          if (!button) continue;
          button.click();
          if (doc.querySelector(`#recipe-grid [data-action="craft"][data-id="${step.target}"]`)) { found = true; break; }
        }
        if (!found) return { ok: false, message: '工坊里没有这个配方' };
      } else {
        const result = clickInGame(step.selectors);
        if (!result.ok) return result;
      }
    }
    return { ok: true, message: plan.note };
  }

  /* ── 主循环 ─────────────────────────────────────────────── */

  function renderJev(entry, decision) {
    const top = Object.entries(decision.probabilities || {}).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([key, value]) => `${U.escape(key)} ${(value * 100).toFixed(0)}%`).join('、');
    const meta = [`置信度 ${decision.confidence}`, `风险 ${decision.risk}`];
    if (top) meta.push(top);
    entry.querySelector('.ai-entry-meta').textContent = meta.join('｜');
  }

  async function runTurn(turn, model) {
    const doc = gameDocument();
    const observation = O.readObservation(doc);
    observation.recipes = O.scanCraftRecipes(doc);
    observation.inventory = O.scanUsableItems(doc, observation.inventory);
    if (observation.status !== 'playing' && !(observation.dialog?.choices || []).length) {
      return { done: true, status: observation.status };
    }
    const clock = `第 ${observation.clock.day} 天 ${observation.clock.time}`;
    const entry = document.createElement('li');
    entry.className = 'ai-entry';
    entry.innerHTML = `<div class="ai-entry-head"><b>第 ${turn} 步</b><span>${U.escape(clock)}</span></div><div class="ai-entry-choice">正在询问模型…</div><div class="ai-entry-meta"></div><div class="ai-entry-note"></div>`;
    log.prepend(entry);
    while (log.children.length > 60) log.lastElementChild.remove();
    let decision;
    try {
      decision = await askDecision(model, observation);
    } catch (error) {
      if (state.stop || error.name === 'AbortError') {
        entry.querySelector('.ai-entry-choice').textContent = '已停止';
        entry.classList.add('failed');
      }
      throw error;
    }
    const applied = performInGame(decision, observation);
    entry.querySelector('.ai-entry-choice').textContent = decision.key || `${decision.action} ${decision.id || ''}`.trim();
    if (decision.engine === 'jev') renderJev(entry, decision);
    else entry.querySelector('.ai-entry-meta').textContent = `${decision.engine} · ${decision.model}`;
    const note = applied.ok ? decision.thought || '已执行' : `没点中：${applied.message}`;
    entry.querySelector('.ai-entry-note').textContent = note;
    entry.classList.toggle('failed', !applied.ok);
    state.history.push(`第 ${turn} 步：${decision.key || `${decision.action} ${decision.id || ''}`} → ${note}`);
    if (state.history.length > 8) state.history.shift();
    return { done: false, decision, applied };
  }

  function delay(ms) {
    return new Promise(resolve => {
      state.wake = resolve;
      state.timer = setTimeout(resolve, ms);
    });
  }

  function halt() {
    state.stop = true;
    clearTimeout(state.timer);
    state.timer = 0;
    state.abort?.abort();
    state.wake?.();
    state.wake = null;
  }

  async function run() {
    const model = $('ai-model').value;
    if (!adapted) { setStatus('这款游戏还没有接入 AI 游玩。'); return; }
    if (!state.models.some(item => item.id === model && item.available)) { setStatus('还没有可用的模型，请等模型列表加载完成。'); return; }
    const turns = Math.max(1, Math.min(500, Number($('ai-turns').value) || 30));
    const stepDelay = Math.max(0, Math.min(5000, Number($('ai-delay').value) || 0));
    state.running = true;
    state.stop = false;
    state.history = [];
    log.innerHTML = '';
    $('ai-run').disabled = true;
    $('ai-stop').disabled = false;
    setStatus(`正在用「${$('ai-model').selectedOptions[0]?.textContent || model}」游玩…`);
    try {
      for (let turn = 1; turn <= turns && !state.stop; turn++) {
        const outcome = await runTurn(turn, model);
        if (outcome.done) {
          setStatus(outcome.status === 'won' ? '结局已达成，AI 停了下来。' : '这一局已经结束。');
          return;
        }
        if (stepDelay && !state.stop) await delay(stepDelay);
      }
      setStatus(state.stop ? '已停止，你可以随时接管。' : `已跑完 ${turns} 步，可以继续或接管。`);
    } catch (error) {
      if (state.stop) setStatus('已停止，你可以随时接管。');
      else {
        addEntry(error.message);
        setStatus('模型调用失败，请检查本地模型服务。');
      }
    } finally {
      state.running = false;
      clearTimeout(state.timer);
      state.timer = 0;
      state.wake = null;
      state.abort = null;
      $('ai-run').disabled = false;
      $('ai-stop').disabled = true;
    }
  }

  /* ── 面板开关 ───────────────────────────────────────────── */

  let prepared = false;
  async function openPanel() {
    panel.hidden = false;
    $('ai-toggle').setAttribute('aria-expanded', 'true');
    if (!adapted) { setStatus('这款游戏还没有接入 AI 游玩。'); return; }
    if (prepared) return;
    setStatus('正在检查可用的模型…');
    if (!state.running) $('ai-run').disabled = true;
    const ready = await loadModels();
    prepared = ready;
    setStatus(ready ? '选择一个模型，让 AI 替你玩。' : '没有连上可用的模型。');
  }

  function closePanel() {
    halt();
    panel.hidden = true;
    $('ai-toggle').setAttribute('aria-expanded', 'false');
  }

  $('ai-toggle').addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()));
  $('ai-close').addEventListener('click', closePanel);
  $('ai-config-toggle').addEventListener('click', () => ($('ai-config').hidden ? openConfig() : closeConfig()));
  $('ai-cfg-test').addEventListener('click', testConnection);
  $('ai-cfg-new').addEventListener('click', () => { state.editing = ''; $('ai-cfg-label').value = ''; $('ai-cfg-model').value = ''; $('ai-cfg-key').value = ''; $('ai-cfg-delete').disabled = true; setConfigStatus('填好后先「测试连接」，再从模型名称下拉里选一个。'); $('ai-cfg-label').focus(); });
  $('ai-cfg-delete').addEventListener('click', deleteConfig);
  $('ai-config').addEventListener('submit', event => { event.preventDefault(); saveConfig(); });
  $('ai-model').addEventListener('change', () => { if (!state.running) fillConfigForm($('ai-model').value); });
  $('ai-run').addEventListener('click', () => { state.abort = new AbortController(); if (!state.running && gameReady()) run(); else if (!gameReady()) setStatus('等游戏画面准备好再开始。'); });
  $('ai-stop').addEventListener('click', halt);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) closePanel(); });
  frame.addEventListener('load', () => { prepared = false; if (!panel.hidden && !state.running) openPanel(); });
  if (!adapted) {
    $('ai-toggle').title = '这款游戏还没有接入 AI 游玩';
    $('ai-note').textContent = '这款游戏还没有接入 AI 游玩：画面读取与动作计划目前只为余烬写了适配。';
  }
})();
