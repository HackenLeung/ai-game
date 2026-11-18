/*!
 * 静雷 · 规则引擎
 * 布雷、翻开、插旗、快速展开与存档转换，不依赖 DOM，可在 Node 中直接测试。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MinesweeperRules = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = 1;
  var STATUSES = { ready: 1, playing: 1, won: 1, lost: 1 };
  var PRESETS = [
    { id: 'beginner', name: '初级', rows: 9, cols: 9, mines: 10 },
    { id: 'intermediate', name: '中级', rows: 16, cols: 16, mines: 40 },
    { id: 'expert', name: '高级', rows: 16, cols: 30, mines: 99 }
  ];

  function preset(id) {
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].id === id) return { rows: PRESETS[i].rows, cols: PRESETS[i].cols, mines: PRESETS[i].mines };
    }
    return null;
  }

  function maxMines(rows, cols) {
    return Math.max(1, rows * cols - 9);
  }

  function normalizeConfig(config) {
    var rows = Number(config && config.rows);
    var cols = Number(config && config.cols);
    var mines = Number(config && config.mines);
    if (!isFinite(rows) || Math.floor(rows) !== rows || rows < 5 || rows > 30) throw new Error('行数需要在 5–30 之间');
    if (!isFinite(cols) || Math.floor(cols) !== cols || cols < 5 || cols > 40) throw new Error('列数需要在 5–40 之间');
    var limit = maxMines(rows, cols);
    if (!isFinite(mines) || Math.floor(mines) !== mines || mines < 1 || mines > limit) throw new Error('雷数需要在 1–' + limit + ' 之间');
    return { rows: rows, cols: cols, mines: mines };
  }

  function createGame(config) {
    var size = normalizeConfig(config);
    var total = size.rows * size.cols;
    var cells = new Array(total);
    for (var i = 0; i < total; i++) cells[i] = { mine: false, adjacent: 0, revealed: false, flagged: false };
    return {
      version: VERSION,
      rows: size.rows,
      cols: size.cols,
      mines: size.mines,
      cells: cells,
      seeded: false,
      status: 'ready',
      opened: 0,
      flags: 0,
      exploded: -1
    };
  }

  function coordinates(game, index) {
    return { row: Math.floor(index / game.cols), col: index % game.cols };
  }

  function indexAt(game, row, col) {
    if (row < 0 || row >= game.rows || col < 0 || col >= game.cols) return -1;
    return row * game.cols + col;
  }

  function neighbors(game, index) {
    return neighborIndexes(game.rows, game.cols, index);
  }

  function neighborIndexes(rows, cols, index) {
    var row = Math.floor(index / cols);
    var col = index % cols;
    var out = [];
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var r = row + dr;
        var c = col + dc;
        if (r >= 0 && r < rows && c >= 0 && c < cols) out.push(r * cols + c);
      }
    }
    return out;
  }

  function seed(game, safeIndex, random) {
    if (game.seeded) return false;
    if (!isFinite(safeIndex) || safeIndex < 0 || safeIndex >= game.cells.length) throw new Error('无效的起始格子');
    var rng = typeof random === 'function' ? random : Math.random;
    var safe = {};
    safe[safeIndex] = true;
    var around = neighbors(game, safeIndex);
    for (var i = 0; i < around.length; i++) safe[around[i]] = true;
    var candidates = [];
    for (var index = 0; index < game.cells.length; index++) if (!safe[index]) candidates.push(index);
    if (candidates.length < game.mines) {
      candidates = [];
      for (var open = 0; open < game.cells.length; open++) if (open !== safeIndex) candidates.push(open);
    }
    for (var pick = 0; pick < game.mines; pick++) {
      var range = candidates.length - pick;
      var choice = pick + Math.floor(rng() * range);
      var swap = candidates[pick];
      candidates[pick] = candidates[choice];
      candidates[choice] = swap;
      game.cells[candidates[pick]].mine = true;
    }
    for (var cell = 0; cell < game.cells.length; cell++) {
      if (game.cells[cell].mine) continue;
      var near = neighbors(game, cell);
      var count = 0;
      for (var n = 0; n < near.length; n++) if (game.cells[near[n]].mine) count++;
      game.cells[cell].adjacent = count;
    }
    game.seeded = true;
    return true;
  }

  function finishLoss(game, exploded) {
    game.status = 'lost';
    game.exploded = exploded;
    for (var i = 0; i < game.cells.length; i++) {
      var cell = game.cells[i];
      if (cell.mine && !cell.revealed && !cell.flagged) cell.revealed = true;
    }
  }

  function reveal(game, index) {
    var empty = { changed: [], hit: false };
    if (!game || (game.status !== 'ready' && game.status !== 'playing')) return empty;
    var target = game.cells[index];
    if (!target || target.revealed || target.flagged) return empty;
    if (!game.seeded) {
      seed(game, index, Math.random);
      game.status = 'playing';
    }
    if (target.mine) {
      finishLoss(game, index);
      return { changed: [index], hit: index };
    }
    var changed = [];
    var queue = [index];
    while (queue.length) {
      var current = queue.pop();
      var cell = game.cells[current];
      if (cell.revealed || cell.flagged) continue;
      cell.revealed = true;
      game.opened++;
      changed.push(current);
      if (cell.adjacent !== 0) continue;
      var near = neighbors(game, current);
      for (var n = 0; n < near.length; n++) {
        var next = game.cells[near[n]];
        if (!next.revealed && !next.flagged) queue.push(near[n]);
      }
    }
    if (game.opened === game.rows * game.cols - game.mines) {
      game.status = 'won';
      for (var i = 0; i < game.cells.length; i++) {
        var mine = game.cells[i];
        if (mine.mine && !mine.flagged) {
          mine.flagged = true;
          game.flags++;
          changed.push(i);
        }
      }
    }
    return { changed: changed, hit: false };
  }

  function toggleFlag(game, index) {
    if (!game || (game.status !== 'ready' && game.status !== 'playing')) return false;
    var cell = game.cells[index];
    if (!cell || cell.revealed) return false;
    if (cell.flagged) {
      cell.flagged = false;
      game.flags--;
      return true;
    }
    if (game.flags >= game.mines) return false;
    cell.flagged = true;
    game.flags++;
    return true;
  }

  function chord(game, index) {
    var empty = { changed: [], hit: false, matched: false };
    if (!game || game.status !== 'playing') return empty;
    var cell = game.cells[index];
    if (!cell || !cell.revealed || cell.adjacent === 0) return empty;
    var around = neighbors(game, index);
    var flags = 0;
    for (var i = 0; i < around.length; i++) if (game.cells[around[i]].flagged) flags++;
    if (flags !== cell.adjacent) return empty;
    var changed = [];
    var seen = {};
    var hit = false;
    for (var n = 0; n < around.length; n++) {
      var next = game.cells[around[n]];
      if (next.revealed || next.flagged) continue;
      var result = reveal(game, around[n]);
      for (var c = 0; c < result.changed.length; c++) {
        if (seen[result.changed[c]]) continue;
        seen[result.changed[c]] = true;
        changed.push(result.changed[c]);
      }
      if (result.hit !== false) hit = result.hit;
      if (game.status !== 'playing') break;
    }
    return { changed: changed, hit: hit, matched: true };
  }

  function remainingMines(game) {
    return Math.max(0, game.mines - game.flags);
  }

  function metrics(game) {
    var safe = game.rows * game.cols - game.mines;
    return {
      total: game.rows * game.cols,
      safe: safe,
      opened: game.opened,
      flags: game.flags,
      remaining: remainingMines(game),
      progress: safe > 0 ? game.opened / safe : 0,
      finished: game.status === 'won' || game.status === 'lost'
    };
  }

  function serialize(game) {
    return {
      v: VERSION,
      rows: game.rows,
      cols: game.cols,
      mines: game.mines,
      status: game.status,
      seeded: game.seeded,
      exploded: game.exploded,
      cells: game.cells.map(function (cell) {
        return (cell.mine ? '1' : '0') + cell.adjacent + (cell.revealed ? '1' : '0') + (cell.flagged ? '1' : '0');
      })
    };
  }

  function countAround(cells, rows, cols, index) {
    var near = neighborIndexes(rows, cols, index);
    var count = 0;
    for (var i = 0; i < near.length; i++) if (cells[near[i]].mine) count++;
    return count;
  }

  function deserialize(data) {
    if (!data || typeof data !== 'object' || data.v !== VERSION) return null;
    try { normalizeConfig(data); } catch (error) { return null; }
    if (!STATUSES[data.status] || typeof data.seeded !== 'boolean') return null;
    if (!Array.isArray(data.cells) || data.cells.length !== data.rows * data.cols) return null;
    var cells = [];
    var mineCount = 0;
    var flags = 0;
    var opened = 0;
    var revealedMines = 0;
    for (var i = 0; i < data.cells.length; i++) {
      var code = data.cells[i];
      if (typeof code !== 'string' || !/^[01][0-8][01][01]$/.test(code)) return null;
      var cell = { mine: code.charAt(0) === '1', adjacent: Number(code.charAt(1)), revealed: code.charAt(2) === '1', flagged: code.charAt(3) === '1' };
      if (cell.revealed && cell.flagged) return null;
      if (cell.mine) {
        mineCount++;
        if (cell.revealed) revealedMines++;
      } else if (cell.revealed) {
        opened++;
      }
      if (cell.flagged) flags++;
      cells.push(cell);
    }
    if (flags > data.mines) return null;
    if (data.status === 'ready' && (data.seeded || mineCount !== 0 || opened !== 0)) return null;
    if (data.status !== 'ready' && (!data.seeded || mineCount !== data.mines)) return null;
    if (data.status === 'won' && (opened !== data.rows * data.cols - data.mines || flags !== data.mines)) return null;
    if (data.status === 'lost' && revealedMines === 0) return null;
    if (data.status !== 'lost' && revealedMines > 0) return null;
    for (var j = 0; j < cells.length; j++) {
      if (!cells[j].mine && cells[j].adjacent !== countAround(cells, data.rows, data.cols, j)) return null;
    }
    return {
      version: VERSION,
      rows: data.rows,
      cols: data.cols,
      mines: data.mines,
      cells: cells,
      seeded: data.seeded,
      status: data.status,
      opened: opened,
      flags: flags,
      exploded: Number.isInteger(data.exploded) && data.exploded >= 0 && data.exploded < cells.length ? data.exploded : -1
    };
  }

  return {
    VERSION: VERSION,
    PRESETS: PRESETS,
    preset: preset,
    maxMines: maxMines,
    normalizeConfig: normalizeConfig,
    createGame: createGame,
    coordinates: coordinates,
    indexAt: indexAt,
    neighbors: neighbors,
    seed: seed,
    reveal: reveal,
    toggleFlag: toggleFlag,
    chord: chord,
    remainingMines: remainingMines,
    metrics: metrics,
    serialize: serialize,
    deserialize: deserialize
  };
});
