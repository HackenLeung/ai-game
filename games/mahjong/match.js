/*!
 * 麻雀学堂 · 对局引擎
 * 136 张、无鬼无花：摸打、碰杠吃胡与筹码结算，不依赖 DOM。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.MahjongMatch = factory(root.MahjongRules);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (R) {
  'use strict';

  var NAMES = ['我', '下家', '对家', '上家'];
  var PLAYERS = 4;
  var CHIP = {
    selfDraw: 2,
    discard: 2,
    exposed: 1,   // 公杠（补杠）每家
    concealed: 2, // 暗杠每家
    feeding: 3    // 放杠那家
  };

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function buildWall() {
    var wall = [];
    for (var id = 0; id < 34; id++) for (var k = 0; k < 4; k++) wall.push(id);
    return shuffle(wall);
  }

  function sortHand(hand) {
    hand.sort(function (a, b) { return a - b; });
  }

  function counts(hand) {
    var c = new Array(34).fill(0);
    for (var i = 0; i < hand.length; i++) c[hand[i]]++;
    return c;
  }

  function removeTiles(hand, tile, count) {
    for (var i = 0; i < count; i++) {
      var index = hand.indexOf(tile);
      if (index < 0) return false;
      hand.splice(index, 1);
    }
    sortHand(hand);
    return true;
  }

  function nextPlayer(player) {
    return (player + 1) % PLAYERS;
  }

  function distance(from, to) {
    return (to - from + PLAYERS) % PLAYERS;
  }

  function log(state, text) {
    state.log.push(text);
    if (state.log.length > 80) state.log.shift();
  }

  function createGame(options) {
    options = options || {};
    var dealer = options.dealer == null ? 0 : options.dealer;
    var human = options.human == null ? 0 : options.human;
    var state = {
      dealer: dealer,
      human: human,
      wall: buildWall(),
      hands: [[], [], [], []],
      melds: [[], [], [], []],
      discards: [[], [], [], []],
      chips: [0, 0, 0, 0],
      turn: dealer,
      phase: 'discard',
      lastDraw: null,
      lastDrawIndex: -1,
      lastDiscard: null,
      claims: [],
      pending: [],
      winner: null,
      winInfo: null,
      nextDealer: dealer,
      log: []
    };

    for (var round = 0; round < 13; round++) {
      for (var p = 0; p < PLAYERS; p++) state.hands[p].push(state.wall.pop());
    }
    var dealerTile = state.wall.pop();
    state.hands[dealer].push(dealerTile);
    state.hands.forEach(sortHand);
    state.lastDraw = dealerTile;
    state.lastDrawIndex = state.hands[dealer].lastIndexOf(dealerTile);
    log(state, '开局：' + NAMES[dealer] + '坐庄先出牌');
    return state;
  }

  function fullTiles(state, player, extra) {
    var tiles = state.hands[player].slice();
    if (extra != null) tiles.push(extra);
    state.melds[player].forEach(function (meld) {
      tiles = tiles.concat(meld.type === 'kong' ? meld.tiles.slice(0, 3) : meld.tiles);
    });
    return tiles;
  }

  function canWin(state, player, extra) {
    var tiles = fullTiles(state, player, extra);
    return tiles.length === 14 && R.isWin14(tiles, -1);
  }

  function canSelfWin(state) {
    return state.phase === 'discard' &&
      state.lastDraw != null &&
      canWin(state, state.turn, null);
  }

  function selfKongOptions(state) {
    if (state.phase !== 'discard' || state.lastDraw == null) return [];
    var player = state.turn;
    var c = counts(state.hands[player]);
    var out = [];
    for (var id = 0; id < 34; id++) {
      if (c[id] === 4) out.push({ type: 'concealed', tile: id });
    }
    state.melds[player].forEach(function (meld, index) {
      if (meld.type === 'pong' && c[meld.tiles[0]] >= 1) {
        out.push({ type: 'added', tile: meld.tiles[0], meldIndex: index });
      }
    });
    return out;
  }

  function chiCombos(hand, tile) {
    if (tile >= 27) return [];
    var c = counts(hand);
    var base = Math.floor(tile / 9) * 9;
    var combos = [];
    [[-2, -1], [-1, 1], [1, 2]].forEach(function (pair) {
      var a = tile + pair[0];
      var b = tile + pair[1];
      if (a < base || a >= base + 9 || b < base || b >= base + 9) return;
      if (c[a] > 0 && c[b] > 0) combos.push([a, b].sort(function (x, y) { return x - y; }));
    });
    return combos;
  }

  function claimOptions(state, player, tile) {
    var c = counts(state.hands[player]);
    return {
      hu: canWin(state, player, tile),
      gang: c[tile] >= 3,
      peng: c[tile] >= 2,
      chi: player === nextPlayer(state.lastDiscard.player) ? chiCombos(state.hands[player], tile) : []
    };
  }

  function computeClaims(state) {
    var discard = state.lastDiscard;
    var claims = [];
    for (var p = 0; p < PLAYERS; p++) {
      if (p === discard.player) continue;
      var options = claimOptions(state, p, discard.tile);
      if (options.hu) claims.push({ player: p, type: 'hu', priority: 3 });
      if (options.gang) claims.push({ player: p, type: 'gang', priority: 2 });
      if (options.peng) claims.push({ player: p, type: 'peng', priority: 1 });
      options.chi.forEach(function (combo) {
        claims.push({
          player: p,
          type: 'chi',
          priority: 0,
          tiles: combo.concat(discard.tile).sort(function (a, b) { return a - b; })
        });
      });
    }
    claims.sort(function (a, b) {
      return b.priority - a.priority ||
        distance(discard.player, a.player) - distance(discard.player, b.player);
    });
    state.claims = claims;
  }

  function endDraw(state) {
    state.phase = 'over';
    state.winner = null;
    state.winInfo = { draw: true, tile: null, selfDraw: false, discarder: null };
    state.nextDealer = state.dealer;
    log(state, '牌墙摸完，流局');
  }

  function drawTile(state, replacement) {
    if (!state.wall.length) {
      endDraw(state);
      return null;
    }
    var player = state.turn;
    var tile = state.wall.pop();
    state.hands[player].push(tile);
    sortHand(state.hands[player]);
    state.lastDraw = tile;
    state.lastDrawIndex = state.hands[player].lastIndexOf(tile);
    state.phase = 'discard';
    log(state, NAMES[player] + (replacement ? ' 杠后补牌' : ' 摸牌'));
    return tile;
  }

  function pay(state, from, to, amount, reason) {
    state.chips[from] -= amount;
    state.chips[to] += amount;
    log(state, NAMES[from] + ' 付 ' + amount + ' 给 ' + NAMES[to] + '（' + reason + '）');
  }

  function settleWin(state, winner, selfDraw) {
    if (selfDraw) {
      for (var p = 0; p < PLAYERS; p++) {
        if (p !== winner) pay(state, p, winner, CHIP.selfDraw, '自摸');
      }
    } else {
      pay(state, state.lastDiscard.player, winner, CHIP.discard, '出铳');
    }
    state.phase = 'over';
    state.winner = winner;
    state.winInfo = {
      selfDraw: selfDraw,
      discarder: selfDraw ? null : state.lastDiscard.player,
      tile: selfDraw ? state.lastDraw : state.lastDiscard.tile
    };
    state.nextDealer = winner;
    log(state, NAMES[winner] + (selfDraw
      ? ' 自摸胡'
      : ' 胡了' + NAMES[state.lastDiscard.player] + '的牌'));
  }

  function declareSelfWin(state) {
    if (!canSelfWin(state)) return false;
    settleWin(state, state.turn, true);
    return true;
  }

  function applyClaim(state, claim) {
    var player = claim.player;
    var discard = state.lastDiscard;
    var pile = state.discards[discard.player];
    if (pile.length && pile[pile.length - 1] === discard.tile) pile.pop();
    state.pending = [];
    state.claims = [];

    if (claim.type === 'hu') {
      settleWin(state, player, false);
      return;
    }

    if (claim.type === 'peng') {
      removeTiles(state.hands[player], discard.tile, 2);
      state.melds[player].push({
        type: 'peng',
        tiles: [discard.tile, discard.tile, discard.tile],
        from: discard.player
      });
      state.turn = player;
      state.phase = 'discard';
      state.lastDraw = null;
      state.lastDrawIndex = -1;
      log(state, NAMES[player] + ' 碰 ' + R.name(discard.tile));
      return;
    }

    if (claim.type === 'gang') {
      removeTiles(state.hands[player], discard.tile, 3);
      state.melds[player].push({
        type: 'kong',
        open: true,
        tiles: [discard.tile, discard.tile, discard.tile, discard.tile],
        from: discard.player
      });
      state.turn = player;
      state.lastDraw = null;
      state.lastDrawIndex = -1;
      pay(state, discard.player, player, CHIP.feeding, '放杠');
      log(state, NAMES[player] + ' 杠 ' + R.name(discard.tile));
      drawTile(state, true);
      return;
    }

    if (claim.type === 'chi') {
      var needed = claim.tiles.slice();
      needed.splice(needed.indexOf(discard.tile), 1);
      needed.forEach(function (tile) { removeTiles(state.hands[player], tile, 1); });
      state.melds[player].push({
        type: 'chi',
        tiles: claim.tiles.slice(),
        from: discard.player
      });
      state.turn = player;
      state.phase = 'discard';
      state.lastDraw = null;
      state.lastDrawIndex = -1;
      log(state, NAMES[player] + ' 吃 ' + claim.tiles.map(R.name).join(''));
    }
  }

  function resolve(state) {
    if (state.phase === 'over') return;
    if (!state.claims.length) {
      state.turn = nextPlayer(state.lastDiscard.player);
      state.pending = [];
      state.phase = 'discard';
      drawTile(state, false);
      return;
    }
    var top = state.claims[0];
    if (top.player === state.human) {
      state.pending = state.claims.filter(function (claim) { return claim.player === state.human; });
      state.phase = 'claim-human';
      return;
    }
    applyClaim(state, top);
  }

  function discard(state, index) {
    if (state.phase !== 'discard') return false;
    var player = state.turn;
    if (!Number.isInteger(index) || index < 0 || index >= state.hands[player].length) return false;
    var tile = state.hands[player][index];
    state.hands[player].splice(index, 1);
    sortHand(state.hands[player]);
    state.discards[player].push(tile);
    state.lastDiscard = { tile: tile, player: player };
    state.lastDraw = null;
    state.lastDrawIndex = -1;
    state.phase = 'claim';
    log(state, NAMES[player] + ' 打出 ' + R.name(tile));
    computeClaims(state);
    resolve(state);
    return true;
  }

  function humanClaim(state, type, tiles) {
    if (state.phase !== 'claim-human') return false;
    var claim = state.pending.find(function (option) {
      if (option.type !== type) return false;
      if (type === 'chi' && tiles) return option.tiles.join(',') === tiles.join(',');
      return true;
    });
    if (!claim) return false;
    applyClaim(state, claim);
    return true;
  }

  function humanPass(state) {
    if (state.phase !== 'claim-human') return false;
    state.claims = state.claims.filter(function (claim) { return claim.player !== state.human; });
    state.pending = [];
    state.phase = 'claim';
    resolve(state);
    return true;
  }

  function applySelfKong(state, option) {
    if (!option || state.phase !== 'discard' || state.lastDraw == null) return false;
    var player = state.turn;
    if (option.type === 'concealed') {
      if (counts(state.hands[player])[option.tile] < 4) return false;
      removeTiles(state.hands[player], option.tile, 4);
      state.melds[player].push({
        type: 'kong',
        concealed: true,
        tiles: [option.tile, option.tile, option.tile, option.tile]
      });
      for (var p = 0; p < PLAYERS; p++) {
        if (p !== player) pay(state, p, player, CHIP.concealed, '暗杠');
      }
      log(state, NAMES[player] + ' 暗杠 ' + R.name(option.tile));
    } else if (option.type === 'added') {
      var meld = state.melds[player][option.meldIndex];
      if (!meld || meld.type !== 'pong') return false;
      if (!removeTiles(state.hands[player], option.tile, 1)) return false;
      meld.type = 'kong';
      meld.tiles.push(option.tile);
      for (var q = 0; q < PLAYERS; q++) {
        if (q !== player) pay(state, q, player, CHIP.exposed, '公杠');
      }
      log(state, NAMES[player] + ' 补杠 ' + R.name(option.tile));
    } else {
      return false;
    }
    state.lastDraw = null;
    state.lastDrawIndex = -1;
    drawTile(state, true);
    return true;
  }

  function tileScore(hand, tile) {
    var c = counts(hand);
    var score = c[tile] * 5;
    if (tile < 27) {
      var base = Math.floor(tile / 9) * 9;
      for (var d = -2; d <= 2; d++) {
        if (!d) continue;
        var t = tile + d;
        if (t < base || t >= base + 9) continue;
        if (c[t] > 0) score += Math.abs(d) === 1 ? 2 : 1;
      }
      var n = tile % 9;
      if (n === 0 || n === 8) score -= 1;
    } else if (c[tile] === 1) {
      score -= 2;
    }
    return score;
  }

  function chooseDiscardIndex(state, player) {
    player = player == null ? state.turn : player;
    var hand = state.hands[player];
    var best = 0;
    var bestScore = Infinity;
    for (var i = 0; i < hand.length; i++) {
      var score = tileScore(hand, hand[i]);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  function aiKong(state) {
    var options = selfKongOptions(state);
    return options.length ? options[0] : null;
  }

  function waitsFor(state, player) {
    var tiles = state.hands[player].slice();
    state.melds[player].forEach(function (meld) {
      tiles = tiles.concat(meld.type === 'kong' ? meld.tiles.slice(0, 3) : meld.tiles);
    });
    if (tiles.length !== 13) return [];
    return R.waitsOf(tiles, -1);
  }

  function seatInfo(state, player) {
    return {
      player: player,
      name: NAMES[player],
      wind: R.WINDS[R.windOf(player, state.dealer)],
      isDealer: player === state.dealer,
      handCount: state.hands[player].length,
      melds: state.melds[player],
      discards: state.discards[player]
    };
  }

  return {
    NAMES: NAMES,
    CHIP: CHIP,
    createGame: createGame,
    canWin: canWin,
    canSelfWin: canSelfWin,
    selfKongOptions: selfKongOptions,
    declareSelfWin: declareSelfWin,
    applySelfKong: applySelfKong,
    discard: discard,
    humanClaim: humanClaim,
    humanPass: humanPass,
    chooseDiscardIndex: chooseDiscardIndex,
    aiKong: aiKong,
    waitsFor: waitsFor,
    seatInfo: seatInfo,
    windName: function (state, player) {
      return R.WINDS[R.windOf(player, state.dealer)];
    }
  };
});
