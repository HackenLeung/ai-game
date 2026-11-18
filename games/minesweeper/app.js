(function () {
  'use strict';

  var R = window.MinesweeperRules;
  var SAVE_KEY = 'minesweeper-save-v1';
  var RECORD_KEY = 'minesweeper-records-v1';
  var DEFAULT_CUSTOM = { rows: 16, cols: 16, mines: 40 };
  var LEVELS = ['beginner', 'intermediate', 'expert', 'custom'];
  var LEVEL_NAMES = { beginner: '初级', intermediate: '中级', expert: '高级', custom: '自定义' };

  function $(id) { return document.getElementById(id); }

  var dom = {
    stage: $('stage'),
    board: $('board'),
    boardCard: $('board-card'),
    boardScroll: $('board-scroll'),
    levelGroup: $('level-group'),
    customSummary: $('custom-summary'),
    minesLeft: $('mines-left'),
    timer: $('timer'),
    progress: $('progress'),
    bestValue: $('best-value'),
    status: $('board-status'),
    statusText: $('status-text'),
    scrollHint: $('scroll-hint'),
    result: $('result'),
    resultEyebrow: $('result-eyebrow'),
    resultTitle: $('result-title'),
    resultMeta: $('result-meta'),
    resultAgain: $('result-again'),
    resultInspect: $('result-inspect'),
    resultClose: $('result-close'),
    newGame: $('new-game'),
    helpBtn: $('help-btn'),
    recordsBtn: $('records-btn'),
    helpDialog: $('help-dialog'),
    recordsDialog: $('records-dialog'),
    recordsList: $('records-list'),
    recordsReset: $('records-reset'),
    customDialog: $('custom-dialog'),
    customForm: $('custom-form'),
    customRows: $('custom-rows'),
    customCols: $('custom-cols'),
    customMines: $('custom-mines'),
    customDensity: $('custom-density'),
    densityFill: $('density-fill'),
    customError: $('custom-error'),
    confirmDialog: $('confirm-dialog'),
    confirmTitle: $('confirm-title'),
    confirmText: $('confirm-text'),
    confirmOk: $('confirm-ok'),
    confirmCancel: $('confirm-cancel'),
    toast: $('toast')
  };

  var state = {
    game: null,
    level: 'beginner',
    config: { rows: 9, cols: 9, mines: 10 },
    customConfig: { rows: DEFAULT_CUSTOM.rows, cols: DEFAULT_CUSTOM.cols, mines: DEFAULT_CUSTOM.mines },
    elapsed: 0,
    running: false,
    startedAt: 0,
    timerId: 0,
    cells: [],
    focusIndex: 0,
    records: {},
    best: 0,
    resultTimer: 0,
    resultShown: false,
    lastLongPress: 0,
    toastTimer: 0,
    fitFrame: 0,
    confirmResolve: null,
    resetArmed: 0
  };

  /* ---------------- 存储 ---------------- */
  function readJSON(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) { return null; }
  }
  function writeJSON(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (error) { return false; }
  }
  function loadRecords() {
    var data = readJSON(RECORD_KEY);
    var records = {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) return records;
    Object.keys(data).forEach(function (key) {
      var value = Number(data[key]);
      if (key.length <= 48 && isFinite(value) && value > 0 && value < 359999000) records[key] = Math.round(value);
    });
    return records;
  }
  function recordKey(level, config) {
    return level === 'custom' ? 'custom:' + config.rows + 'x' + config.cols + 'x' + config.mines : level;
  }
  function keyConfig(key) {
    var match = /^custom:(\d+)x(\d+)x(\d+)$/.exec(key);
    if (!match) return null;
    try { return R.normalizeConfig({ rows: Number(match[1]), cols: Number(match[2]), mines: Number(match[3]) }); }
    catch (error) { return null; }
  }
  function bestFor(level, config) { return state.records[recordKey(level, config)] || 0; }
  function saveRecords() { return writeJSON(RECORD_KEY, state.records); }

  /* ---------------- 时间 ---------------- */
  function nowMs() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }
  function elapsedMs() {
    return state.elapsed + (state.running ? nowMs() - state.startedAt : 0);
  }
  function pad(value) { return value < 10 ? '0' + value : String(value); }
  function formatTime(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var minutes = Math.floor(total / 60);
    if (minutes < 60) return pad(minutes) + ':' + pad(total % 60);
    return Math.floor(minutes / 60) + ':' + pad(minutes % 60) + ':' + pad(total % 60);
  }
  function refreshClock() { dom.timer.textContent = formatTime(elapsedMs()); }
  function startTimer() {
    if (state.running) return;
    state.running = true;
    state.startedAt = nowMs();
    clearInterval(state.timerId);
    state.timerId = setInterval(refreshClock, 200);
    refreshClock();
  }
  function stopTimer() {
    if (!state.running) { refreshClock(); return; }
    var value = elapsedMs();
    state.running = false;
    state.elapsed = value;
    clearInterval(state.timerId);
    state.timerId = 0;
    refreshClock();
  }

  /* ---------------- 尺寸与文案 ---------------- */
  function dimsText(config) {
    return config.rows + ' × ' + config.cols + ' · ' + config.mines + ' 雷';
  }
  function updateCustomSummary() {
    dom.customSummary.textContent = dimsText(state.customConfig);
  }
  function updateLevelButtons() {
    Array.prototype.forEach.call(dom.levelGroup.querySelectorAll('[data-level]'), function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.level === state.level));
    });
  }

  /* ---------------- 绘制 ---------------- */
  function sprite(id, className) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    if (className) svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

  function renderCell(index) {
    var game = state.game;
    var cell = game.cells[index];
    var button = state.cells[index];
    if (!cell || !button) return;
    var row = Math.floor(index / game.cols) + 1;
    var col = index % game.cols + 1;
    var label = '第 ' + row + ' 行第 ' + col + ' 列';
    button.className = 'ms-cell';
    button.replaceChildren();

    if (cell.revealed) {
      button.classList.add('is-open');
      if (cell.mine) {
        button.classList.add('is-mine');
        if (index === game.exploded) button.classList.add('is-boom');
        button.appendChild(sprite('i-mine'));
        label += '，地雷';
      } else if (cell.adjacent > 0) {
        var number = document.createElement('span');
        number.className = 'ms-n' + cell.adjacent;
        number.textContent = String(cell.adjacent);
        button.appendChild(number);
        label += '，周围 ' + cell.adjacent + ' 颗雷';
      } else {
        button.classList.add('is-blank');
        label += '，空地';
      }
    } else if (cell.flagged) {
      button.classList.add('is-flag');
      button.appendChild(sprite('i-flag'));
      label += '，已插旗';
      if (game.status === 'lost' && !cell.mine) {
        button.classList.add('is-wrong');
        button.appendChild(sprite('i-x', 'ms-wrong-x'));
        label += '，标记错误';
      }
    } else {
      label += '，未翻开';
    }

    button.setAttribute('aria-label', label);
    button.tabIndex = index === state.focusIndex ? 0 : -1;
  }

  function renderCells(indexes) {
    for (var i = 0; i < indexes.length; i++) renderCell(indexes[i]);
  }
  function renderAllCells() {
    for (var i = 0; i < state.cells.length; i++) renderCell(i);
  }

  function buildBoard() {
    var fragment = document.createDocumentFragment();
    state.cells = [];
    for (var i = 0; i < state.game.cells.length; i++) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'ms-cell';
      button.dataset.index = String(i);
      fragment.appendChild(button);
      state.cells.push(button);
    }
    dom.board.style.setProperty('--cols', state.game.cols);
    dom.board.style.setProperty('--rows', state.game.rows);
    dom.board.setAttribute('aria-label', '雷区棋盘，' + state.game.rows + ' 行 ' + state.game.cols + ' 列');
    dom.board.replaceChildren(fragment);
    state.focusIndex = Math.min(state.focusIndex, state.game.cells.length - 1);
    renderAllCells();
  }

  function setFocusIndex(index, moveDomFocus) {
    if (!state.cells.length) return;
    var clamped = Math.max(0, Math.min(index, state.cells.length - 1));
    if (state.cells[state.focusIndex]) state.cells[state.focusIndex].tabIndex = -1;
    state.focusIndex = clamped;
    var next = state.cells[clamped];
    next.tabIndex = 0;
    if (moveDomFocus) next.focus({ preventScroll: false });
  }

  function moveFocus(deltaRow, deltaCol) {
    if (!state.game) return;
    var row = Math.floor(state.focusIndex / state.game.cols);
    var col = state.focusIndex % state.game.cols;
    row = Math.max(0, Math.min(state.game.rows - 1, row + deltaRow));
    col = Math.max(0, Math.min(state.game.cols - 1, col + deltaCol));
    setFocusIndex(row * state.game.cols + col, true);
  }

  /* ---------------- 状态展示 ---------------- */
  function renderStats() {
    var metrics = R.metrics(state.game);
    dom.minesLeft.textContent = String(metrics.remaining);
    dom.progress.textContent = Math.round(metrics.progress * 100) + '%';
    dom.timer.textContent = formatTime(elapsedMs());
    dom.bestValue.textContent = state.best > 0 ? formatTime(state.best) : '—';
    updateLevelButtons();
    updateCustomSummary();
  }

  function setStatus(text, tone) {
    dom.status.className = 'ms-status' + (tone ? ' is-' + tone : '');
    dom.statusText.textContent = text;
  }

  function updateStatus() {
    var game = state.game;
    if (!game) return;
    var metrics = R.metrics(game);
    if (game.status === 'ready') setStatus('点击任意格子开始', '');
    else if (game.status === 'playing') setStatus('进行中 · 已翻开 ' + metrics.opened + ' / ' + metrics.safe, 'playing');
    else if (game.status === 'won') setStatus('雷区清空 · 用时 ' + formatTime(elapsedMs()), 'won');
    else setStatus('踩到雷了 · 棋盘已标记所有地雷', 'lost');
  }

  function renderRecords() {
    var entries = R.PRESETS.map(function (preset) {
      return {
        name: preset.name,
        meta: dimsText(preset),
        time: state.records[preset.id] || 0,
        current: state.level === preset.id
      };
    });
    Object.keys(state.records).filter(function (key) { return key.indexOf('custom:') === 0; }).sort(function (a, b) {
      var first = keyConfig(a);
      var second = keyConfig(b);
      if (!first || !second) return a.localeCompare(b);
      return first.rows - second.rows || first.cols - second.cols || first.mines - second.mines;
    }).forEach(function (key) {
      var config = keyConfig(key);
      if (!config) return;
      entries.push({
        name: '自定义',
        meta: dimsText(config),
        time: state.records[key],
        current: state.level === 'custom' && recordKey('custom', state.config) === key
      });
    });
    dom.recordsList.replaceChildren();
    var hasRecord = entries.some(function (entry) { return entry.time > 0; });
    if (!hasRecord) {
      var empty = document.createElement('li');
      empty.className = 'ms-records-empty';
      empty.textContent = '还没有胜利记录，先清一片雷区吧。';
      dom.recordsList.appendChild(empty);
    } else {
      entries.forEach(function (entry) {
        var item = document.createElement('li');
        if (entry.current) item.classList.add('is-current');
        var name = document.createElement('span');
        name.className = 'ms-record-name';
        var title = document.createElement('b');
        title.textContent = entry.name;
        var meta = document.createElement('i');
        meta.textContent = entry.meta;
        name.append(title, meta);
        var time = document.createElement('strong');
        time.textContent = entry.time > 0 ? formatTime(entry.time) : '—';
        item.append(name, time);
        dom.recordsList.appendChild(item);
      });
    }
    dom.recordsReset.hidden = !hasRecord;
    dom.recordsReset.textContent = '清空成绩记录';
    clearTimeout(state.resetArmed);
    state.resetArmed = 0;
  }

  /* ---------------- 结算 ---------------- */
  function hideResult() {
    dom.result.hidden = true;
    state.resultShown = false;
  }

  function scheduleResult(callback, delay) {
    clearTimeout(state.resultTimer);
    state.resultTimer = setTimeout(callback, delay);
  }

  function showResult(result, restored) {
    var time = result.time;
    var metrics = R.metrics(state.game);
    dom.result.classList.toggle('is-lost', !result.won);
    dom.resultEyebrow.textContent = result.won ? 'FIELD CLEARED' : 'DETONATED';
    dom.resultTitle.textContent = result.won ? '雷区清空' : '踩到雷了';
    if (result.won) {
      var suffix = '';
      if (!restored && result.isRecord) suffix = ' · 新纪录';
      else if (state.best > 0) suffix = ' · 最佳 ' + formatTime(state.best);
      dom.resultMeta.textContent = '用时 ' + formatTime(time) + suffix;
    } else {
      dom.resultMeta.textContent = '用时 ' + formatTime(time) + ' · 已翻开 ' + Math.round(metrics.progress * 100) + '%';
    }
    dom.resultInspect.hidden = result.won;
    dom.result.hidden = false;
    state.resultShown = true;
    renderStats();
    dom.resultAgain.focus({ preventScroll: true });
    saveGame();
  }

  function buildResult(won) {
    var time = elapsedMs();
    var isRecord = false;
    if (won) {
      var key = recordKey(state.level, state.config);
      var previous = state.records[key] || 0;
      isRecord = !previous || time < previous;
      if (isRecord) {
        state.records[key] = Math.max(1, Math.round(time));
        if (!saveRecords()) toast('浏览器无法保存成绩记录');
      }
      state.best = bestFor(state.level, state.config);
      renderStats();
    }
    return { won: won, time: time, isRecord: isRecord };
  }

  /* ---------------- 对局 ---------------- */
  function startNewGame(config, level, options) {
    options = options || {};
    var size;
    try { size = R.normalizeConfig(config); }
    catch (error) { toast(error.message); return; }
    clearTimeout(state.resultTimer);
    clearTimeout(state.resetArmed);
    stopTimer();
    state.elapsed = 0;
    state.running = false;
    state.game = R.createGame(size);
    state.level = level;
    state.config = size;
    if (level === 'custom') state.customConfig = size;
    state.best = bestFor(level, size);
    state.focusIndex = 0;
    hideResult();
    buildBoard();
    renderStats();
    updateStatus();
    saveGame();
    fitBoard();
    if (options.focus) setFocusIndex(0, true);
  }

  function requestNewGame(config, level, title, text) {
    var active = state.game && !state.resultShown && (state.game.status === 'playing' || (state.game.status === 'ready' && state.game.flags > 0));
    if (!active) { startNewGame(config, level, { focus: true }); return; }
    askConfirm(title || '开始新的一局？', text || '当前进度会丢失，最佳成绩不会受影响。').then(function (confirmed) {
      if (confirmed) startNewGame(config, level, { focus: true });
    });
  }

  function saveGame() {
    if (!state.game) return false;
    return writeJSON(SAVE_KEY, {
      v: 1,
      level: state.level,
      config: state.config,
      custom: state.customConfig,
      elapsed: Math.round(elapsedMs()),
      savedAt: Date.now(),
      game: R.serialize(state.game)
    });
  }

  function restoreGame() {
    var data = readJSON(SAVE_KEY);
    if (!data || data.v !== 1 || LEVELS.indexOf(data.level) < 0) return false;
    var game = R.deserialize(data.game);
    if (!game) return false;
    if (!data.config || data.config.rows !== game.rows || data.config.cols !== game.cols || data.config.mines !== game.mines) return false;
    if (data.custom) {
      try { state.customConfig = R.normalizeConfig(data.custom); } catch (error) { /* 保留默认自定义尺寸 */ }
    } else if (data.level === 'custom') {
      state.customConfig = { rows: game.rows, cols: game.cols, mines: game.mines };
    }
    state.game = game;
    state.level = data.level;
    state.config = { rows: game.rows, cols: game.cols, mines: game.mines };
    var elapsed = Number(data.elapsed);
    state.elapsed = isFinite(elapsed) && elapsed > 0 ? Math.min(elapsed, 359999000) : 0;
    state.best = bestFor(state.level, state.config);
    state.focusIndex = 0;
    buildBoard();
    renderStats();
    fitBoard();
    if (game.status === 'playing') {
      startTimer();
      updateStatus();
    } else if (game.status === 'won' || game.status === 'lost') {
      updateStatus();
      showResult({ won: game.status === 'won', time: elapsedMs(), isRecord: false }, true);
    } else {
      updateStatus();
    }
    return true;
  }

  function afterAction(changed) {
    renderCells(changed);
    if (state.game.status === 'lost') {
      stopTimer();
      renderAllCells();
      var defeat = buildResult(false);
      scheduleResult(function () { showResult(defeat, false); }, 460);
    } else if (state.game.status === 'won') {
      stopTimer();
      var victory = buildResult(true);
      scheduleResult(function () { showResult(victory, false); }, 320);
    }
    renderStats();
    updateStatus();
    saveGame();
  }

  function revealAt(index) {
    var game = state.game;
    if (!game || (game.status !== 'ready' && game.status !== 'playing')) return;
    var wasReady = game.status === 'ready';
    var result = R.reveal(game, index);
    if (!result.changed.length) return;
    if (wasReady) startTimer();
    afterAction(result.changed);
  }

  function flagAt(index) {
    var game = state.game;
    if (!game || (game.status !== 'ready' && game.status !== 'playing')) return;
    if (R.toggleFlag(game, index)) {
      renderCell(index);
      renderStats();
      updateStatus();
      saveGame();
    }
  }

  function chordAt(index) {
    var game = state.game;
    if (!game || game.status !== 'playing') return;
    var result = R.chord(game, index);
    if (!result.changed.length) return;
    afterAction(result.changed);
  }

  /* ---------------- 自适应棋盘 ---------------- */
  function updateScrollHint() {
    var needed = dom.board.scrollWidth > dom.boardScroll.clientWidth + 2;
    dom.scrollHint.hidden = !needed;
  }

  function fitBoard() {
    if (!state.game || !state.cells.length) return;
    var mobile = window.matchMedia('(max-width: 760px)').matches;
    var cardPad = parseFloat(window.getComputedStyle(dom.boardCard).paddingLeft) || 13;
    var chrome = (cardPad + 1) * 2 + 4;
    var availableWidth = dom.stage.clientWidth - chrome;
    var availableHeight = Infinity;
    if (!mobile) {
      var statusHeight = dom.status.parentElement ? dom.status.parentElement.offsetHeight : 20;
      availableHeight = dom.stage.clientHeight - statusHeight - 16 - chrome;
    }
    var minCell = mobile ? 24 : 18;
    var maxCell = 48;
    function sizeFor(gapValue) {
      var byWidth = (availableWidth - gapValue * (state.game.cols - 1)) / state.game.cols;
      var byHeight = availableHeight === Infinity ? Infinity : (availableHeight - gapValue * (state.game.rows - 1)) / state.game.rows;
      return Math.min(byWidth, byHeight);
    }
    var gap = 3;
    var cell = Math.floor(sizeFor(gap));
    gap = cell >= 38 ? 4 : cell >= 30 ? 3 : 2;
    cell = Math.floor(sizeFor(gap));
    cell = Math.max(minCell, Math.min(maxCell, cell));
    document.documentElement.style.setProperty('--cell', cell + 'px');
    document.documentElement.style.setProperty('--gap', gap + 'px');
    updateScrollHint();
  }

  function scheduleFit() {
    if (state.fitFrame) return;
    state.fitFrame = window.requestAnimationFrame(function () {
      state.fitFrame = 0;
      fitBoard();
    });
  }

  /* ---------------- 提示与确认 ---------------- */
  function toast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add('is-visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () { dom.toast.classList.remove('is-visible'); }, 2400);
  }

  function askConfirm(title, text) {
    if (dom.confirmDialog.open) return Promise.resolve(false);
    return new Promise(function (resolve) {
      state.confirmResolve = resolve;
      dom.confirmTitle.textContent = title;
      dom.confirmText.textContent = text;
      if (!dom.confirmDialog.open) dom.confirmDialog.showModal();
      dom.confirmCancel.focus({ preventScroll: true });
    });
  }

  function finishConfirm(value) {
    if (dom.confirmDialog.open) dom.confirmDialog.close(value);
  }

  function openCustomDialog() {
    var config = state.customConfig;
    dom.customRows.value = String(config.rows);
    dom.customCols.value = String(config.cols);
    dom.customMines.value = String(config.mines);
    dom.customError.textContent = '';
    updateDensity();
    dom.customDialog.showModal();
    window.requestAnimationFrame(function () {
      dom.customRows.focus();
      dom.customRows.select();
    });
  }

  function updateDensity() {
    var rows = Number(dom.customRows.value);
    var cols = Number(dom.customCols.value);
    var mines = Number(dom.customMines.value);
    var total = rows * cols;
    var max = rows >= 5 && cols >= 5 ? R.maxMines(rows, cols) : 1;
    dom.customMines.max = String(max);
    var density = total > 0 ? (mines / total) * 100 : 0;
    var shown = isFinite(density) ? Math.max(0, Math.min(100, density)) : 0;
    dom.customDensity.textContent = isFinite(density) ? density.toFixed(1) + '%' : '—';
    dom.densityFill.style.width = shown + '%';
    dom.densityFill.classList.toggle('is-hot', density > 26);
    try {
      R.normalizeConfig({ rows: rows, cols: cols, mines: mines });
      dom.customError.textContent = '';
    } catch (error) {
      dom.customError.textContent = error.message;
    }
  }

  function closeDialog(button) {
    var dialog = button.closest('dialog');
    if (dialog) dialog.close();
  }

  /* ---------------- 事件 ---------------- */
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (button) {
    button.addEventListener('click', function () { closeDialog(button); });
  });

  [dom.helpDialog, dom.recordsDialog, dom.customDialog].forEach(function (dialog) {
    dialog.addEventListener('click', function (event) {
      if (event.target !== dialog) return;
      var rect = dialog.getBoundingClientRect();
      var inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) dialog.close();
    });
  });

  dom.levelGroup.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-level]');
    if (!button) return;
    var level = button.dataset.level;
    if (level === 'custom') { openCustomDialog(); return; }
    var preset = R.preset(level);
    if (!preset) return;
    requestNewGame(preset, level, '切换到' + LEVEL_NAMES[level] + '？', '会按「' + LEVEL_NAMES[level] + '」的尺寸重新开始，最佳成绩会保留。');
  });

  dom.newGame.addEventListener('click', function () {
    requestNewGame(state.config, state.level, '开始新的一局？', '会按当前尺寸重新开始，最佳成绩会保留。');
  });

  dom.helpBtn.addEventListener('click', function () { dom.helpDialog.showModal(); });
  dom.recordsBtn.addEventListener('click', function () {
    renderRecords();
    dom.recordsDialog.showModal();
  });

  dom.recordsDialog.addEventListener('close', function () {
    clearTimeout(state.resetArmed);
    state.resetArmed = 0;
    dom.recordsReset.textContent = '清空成绩记录';
  });

  dom.recordsReset.addEventListener('click', function () {
    if (!state.resetArmed) {
      dom.recordsReset.textContent = '再点一次确认清空';
      state.resetArmed = setTimeout(function () {
        state.resetArmed = 0;
        dom.recordsReset.textContent = '清空成绩记录';
      }, 3600);
      return;
    }
    clearTimeout(state.resetArmed);
    state.resetArmed = 0;
    state.records = {};
    state.best = 0;
    saveRecords();
    renderRecords();
    renderStats();
    toast('成绩记录已清空');
  });

  dom.customRows.addEventListener('input', updateDensity);
  dom.customCols.addEventListener('input', updateDensity);
  dom.customMines.addEventListener('input', updateDensity);

  dom.customForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var config;
    try {
      config = R.normalizeConfig({
        rows: Number(dom.customRows.value),
        cols: Number(dom.customCols.value),
        mines: Number(dom.customMines.value)
      });
    } catch (error) {
      dom.customError.textContent = error.message;
      return;
    }
    dom.customDialog.close();
    requestNewGame(config, 'custom', '开始新的自定义棋盘？', '当前进度会丢失，最佳成绩会保留。');
  });

  dom.confirmOk.addEventListener('click', function () { finishConfirm('ok'); });
  dom.confirmCancel.addEventListener('click', function () { finishConfirm('cancel'); });
  dom.confirmDialog.addEventListener('cancel', function (event) {
    event.preventDefault();
    finishConfirm('cancel');
  });
  dom.confirmDialog.addEventListener('close', function () {
    var resolve = state.confirmResolve;
    state.confirmResolve = null;
    if (resolve) resolve(dom.confirmDialog.returnValue === 'ok');
  });

  dom.resultAgain.addEventListener('click', function () {
    startNewGame(state.config, state.level, { focus: true });
  });
  dom.resultInspect.addEventListener('click', hideResult);
  dom.resultClose.addEventListener('click', hideResult);

  dom.board.addEventListener('click', function (event) {
    var button = event.target.closest('.ms-cell');
    if (!button) return;
    if (Date.now() - state.lastLongPress < 650) return;
    var index = Number(button.dataset.index);
    setFocusIndex(index, false);
    if (event.detail > 0 && lastPointerType !== 'mouse' && state.game && state.game.cells[index].revealed) {
      chordAt(index);
      return;
    }
    revealAt(index);
  });

  dom.board.addEventListener('contextmenu', function (event) {
    var button = event.target.closest('.ms-cell');
    event.preventDefault();
    if (!button) return;
    if (Date.now() - state.lastLongPress < 900) return;
    var index = Number(button.dataset.index);
    setFocusIndex(index, false);
    flagAt(index);
  });

  dom.board.addEventListener('dblclick', function (event) {
    var button = event.target.closest('.ms-cell');
    if (!button) return;
    chordAt(Number(button.dataset.index));
  });

  dom.board.addEventListener('mousedown', function (event) {
    if (event.button === 1) event.preventDefault();
  });

  var longPressTimer = 0;
  var lastPointerType = 'mouse';
  function cancelLongPress() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = 0; }
  }
  dom.board.addEventListener('pointerdown', function (event) {
    var button = event.target.closest('.ms-cell');
    if (!button) return;
    lastPointerType = event.pointerType || 'mouse';
    var index = Number(button.dataset.index);
    if (event.button === 1) {
      event.preventDefault();
      chordAt(index);
      return;
    }
    if (event.button !== 0 || event.pointerType === 'mouse') return;
    cancelLongPress();
    longPressTimer = setTimeout(function () {
      longPressTimer = 0;
      state.lastLongPress = Date.now();
      setFocusIndex(index, false);
      flagAt(index);
      if (navigator.vibrate) { try { navigator.vibrate(9); } catch (error) { /* 忽略不支持振动的环境 */ } }
    }, 430);
  });
  dom.board.addEventListener('pointerup', cancelLongPress);
  dom.board.addEventListener('pointercancel', cancelLongPress);
  dom.board.addEventListener('pointerleave', cancelLongPress);
  dom.boardScroll.addEventListener('scroll', cancelLongPress, { passive: true });

  dom.board.addEventListener('focusin', function (event) {
    var button = event.target.closest('.ms-cell');
    if (!button) return;
    var index = Number(button.dataset.index);
    if (index !== state.focusIndex) setFocusIndex(index, false);
  });

  dom.board.addEventListener('keydown', function (event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    var key = event.key;
    if (key === 'ArrowLeft') { event.preventDefault(); moveFocus(0, -1); }
    else if (key === 'ArrowRight') { event.preventDefault(); moveFocus(0, 1); }
    else if (key === 'ArrowUp') { event.preventDefault(); moveFocus(-1, 0); }
    else if (key === 'ArrowDown') { event.preventDefault(); moveFocus(1, 0); }
    else if (key === 'Home') { event.preventDefault(); moveFocus(0, -state.game.cols); }
    else if (key === 'End') { event.preventDefault(); moveFocus(0, state.game.cols); }
    else if (key === ' ' || key === 'Enter') { event.preventDefault(); revealAt(state.focusIndex); }
    else if (key === 'f' || key === 'F') { event.preventDefault(); flagAt(state.focusIndex); }
    else if (key === 'c' || key === 'C') { event.preventDefault(); chordAt(state.focusIndex); }
  });

  document.addEventListener('keydown', function (event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== 'r' && event.key !== 'R') return;
    var target = event.target;
    var tag = target && target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable)) return;
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault();
    dom.newGame.click();
  });

  window.addEventListener('resize', scheduleFit);
  window.addEventListener('orientationchange', scheduleFit);
  window.addEventListener('pagehide', saveGame);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') saveGame();
  });
  if (typeof ResizeObserver === 'function') new ResizeObserver(scheduleFit).observe(dom.stage);

  /* ---------------- 启动 ---------------- */
  state.records = loadRecords();
  updateCustomSummary();
  if (!restoreGame()) startNewGame(R.PRESETS[0], 'beginner', { focus: false });
})();
