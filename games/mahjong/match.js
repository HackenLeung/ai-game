/*!
 * 麻雀学堂 · 对局引擎
 * 136 张、可选鬼牌：掷骰开门、摸打、碰杠吃胡与筹码结算，不依赖 DOM。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.MahjongMatch = factory(root.MahjongRules);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (R) {
  'use strict';

  var NAMES = ['我', '下家', '对家', '上家'];
  var PLAYERS = 4;
  var GHOST_IDS = { ghost: 31, ghostWhite: 33, ghostGreen: 32 };
  var GHOST_NAMES = { 31: '红中', 33: '白板', 32: '发财' };
  var CHIP = {
    selfDraw: 2,
    discard: 2,
    exposed: 1,   // 公杠（补杠）每家
    concealed: 2, // 暗杠每家
    feeding: 3    // 放杠那家
  };

  function ghostIdFor(style) {
    return GHOST_IDS[style] == null ? -1 : GHOST_IDS[style];
  }

  function styleLabel(style) {
    var ghostId = ghostIdFor(style);
    return ghostId < 0 ? '无鬼无花' : '鬼牌 · ' + (GHOST_NAMES[ghostId] || R.name(ghostId));
  }

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

  function randDie() {
    return Math.floor(Math.random() * 6) + 1;
  }

  function slotText(state, slot) {
    if (!slot) return '';
    var wind = R.WINDS[R.windOf(slot.owner, state.dealer)];
    return wind + '位牌墙第 ' + slot.stack + ' 墩' + (slot.layer === 0 ? '上层' : '下层');
  }

  function buildWallRing(open, tiles) {
    // 四道牌墙按「开门 → 上家 → 对家 → 下家」的取牌顺序首尾相接。
    var sequence = [
      open.openWind,
      (open.openWind + 3) % 4,
      (open.openWind + 2) % 4,
      (open.openWind + 1) % 4
    ];
    var ring = [];
    sequence.forEach(function (owner) {
      for (var stack = 1; stack <= 17; stack++) {
        for (var layer = 0; layer < 2; layer++) {
          ring.push({ owner: owner, stack: stack, layer: layer, tile: null, taken: false });
        }
      }
    });
    // 每面墙从右端数墩；超过 17 墩时 openInfo 已经给出绕到哪一面、第几墩。
    var ownerIndex = sequence.indexOf(open.wallOwner);
    var start = ownerIndex * 34 + (open.wallStack - 1) * 2;
    ring = ring.slice(start).concat(ring.slice(0, start));
    ring.forEach(function (slot, index) { slot.tile = tiles[index]; });
    return ring;
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

  function dealFromRing(state, ring, open) {
    var dealer = state.dealer;
    var deck = ring.slice();
    var cursor = 0;
    var deal = {
      breakOwner: ring[0].owner,
      breakStack: ring[0].stack,
      startStack: open.startStack,
      stacks: open.stacks,
      wallOwner: open.wallOwner,
      wallStack: open.wallStack,
      wrapped: open.wrapped,
      jumpTiles: []
    };

    function take(player) {
      var slot = deck[cursor++];
      slot.taken = true;
      state.hands[player].push(slot.tile);
      return slot;
    }

    for (var round = 0; round < 3; round++) {
      for (var i = 0; i < PLAYERS; i++) {
        var player = (dealer + i) % PLAYERS;
        for (var j = 0; j < 4; j++) take(player);
      }
    }

    // 跳牌：庄家拿第 1、3 墩上层，其余三家依次拿第 2、4、5 墩上层；
    // 这五墩剩下的下层牌留到牌墙尾，最后才摸到。
    var jump = deck.slice(cursor, cursor + 10);
    var dealerSlots = [jump[0], jump[4]];
    dealerSlots.forEach(function (slot) {
      slot.taken = true;
      state.hands[dealer].push(slot.tile);
    });
    var otherSlots = [jump[2], jump[6], jump[8]];
    for (var k = 0; k < 3; k++) {
      var next = (dealer + 1 + k) % PLAYERS;
      otherSlots[k].taken = true;
      state.hands[next].push(otherSlots[k].tile);
    }
    cursor += 10;

    var tail = [jump[1], jump[3], jump[5], jump[7], jump[9]];
    tail.forEach(function (slot) { slot.tail = true; });
    state.wall = deck.slice(cursor).concat(tail).reverse();
    state.hands.forEach(sortHand);

    state.lastDraw = dealerSlots[1].tile;
    state.lastDrawIndex = state.hands[dealer].lastIndexOf(state.lastDraw);
    state.lastDrawPlayer = dealer;
    state.lastDrawSlot = dealerSlots[1];
    deal.jumpTiles = dealerSlots.map(function (slot) {
      return { owner: slot.owner, stack: slot.stack, layer: slot.layer, tile: slot.tile };
    });
    state.deal = deal;
  }

  function createGame(options) {
    options = options || {};
    var dealer = options.dealer == null ? 0 : options.dealer;
    var human = options.human == null ? 0 : options.human;
    var mode = options.mode === 'smallPerson' || options.mode === 'sum' ? options.mode : 'bigPerson';
    var stackMode = options.stackMode === 'same' ? 'same' : 'next';
    var style = ghostIdFor(options.style) >= 0 ? options.style : 'none';
    var ghostId = ghostIdFor(style);
    var input = options.dice || {};
    var d1 = input.a == null ? randDie() : input.a;
    var d2 = input.b == null ? randDie() : input.b;
    var d3 = mode === 'sum' ? (input.c == null ? randDie() : input.c) : 0;
    var open = R.openInfo({
      mode: mode,
      d1: d1,
      d2: d2,
      d3: d3,
      dealer: dealer,
      me: human >= 0 ? human : dealer,
      stackMode: stackMode
    });
    var ring = buildWallRing(open, buildWall());
    var state = {
      dealer: dealer,
      human: human,
      mode: mode,
      stackMode: stackMode,
      style: style,
      ghostId: ghostId,
      roll: {
        a: d1,
        b: d2,
        c: d3,
        mode: mode,
        stackMode: stackMode,
        total: mode === 'sum' ? d1 + d2 + d3 : d1 + d2
      },
      open: open,
      deal: null,
      wallSlots: ring,
      wall: [],
      hands: [[], [], [], []],
      melds: [[], [], [], []],
      discards: [[], [], [], []],
      chips: [0, 0, 0, 0],
      turn: dealer,
      phase: 'discard',
      lastDraw: null,
      lastDrawIndex: -1,
      lastDrawPlayer: null,
      lastDrawSlot: null,
      drawCount: 0,
      lastDiscard: null,
      claims: [],
      pending: [],
      winner: null,
      winInfo: null,
      nextDealer: dealer,
      log: []
    };

    dealFromRing(state, ring, open);

    var dealerWind = R.WINDS[R.windOf(dealer, dealer)];
    var diceLabel = mode === 'sum'
      ? d1 + ' + ' + d2 + ' + ' + d3 + ' = ' + (d1 + d2 + d3)
      : d1 + ' + ' + d2 + ' = ' + (d1 + d2);
    log(state, '开局：' + NAMES[dealer] + ' 坐庄（' + dealerWind + '位），掷骰 ' + diceLabel + ' 点');
    log(state, '数人：从庄家算第 1 位，逆时针数 ' + open.persons + ' 位 → ' +
      R.WINDS[R.windOf(open.openWind, dealer)] + '位开门');
    var startOwner = open.wrapped ? open.wallOwner : open.openWind;
    var startStack = open.wrapped ? open.wallStack : open.startStack;
    log(state, '数墩：从' + R.WINDS[R.windOf(open.openWind, dealer)] + '位牌墙右端起数 ' + open.stacks +
      ' 墩' + (open.wrapped
        ? '（超过 17 墩，绕到' + R.WINDS[R.windOf(open.wallOwner, dealer)] + '位第 ' + open.wallStack + ' 墩）'
        : '') + '，从' + R.WINDS[R.windOf(startOwner, dealer)] + '位第 ' + startStack + ' 墩开始拿');
    log(state, '发牌：庄家起逆时针每家 4 张 × 3 轮；庄家跳牌 2 张，其余三家各 1 张');
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
    return tiles.length === 14 && R.isWin14(tiles, state.ghostId);
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
      if (state.ghostId >= 0 && id === state.ghostId) continue;
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
    var ghostDiscard = state.ghostId >= 0 && tile === state.ghostId;
    return {
      hu: canWin(state, player, tile),
      gang: !ghostDiscard && c[tile] >= 3,
      peng: !ghostDiscard && c[tile] >= 2,
      chi: !ghostDiscard && player === nextPlayer(state.lastDiscard.player)
        ? chiCombos(state.hands[player], tile) : []
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
    var slot = state.wall.pop();
    slot.taken = true;
    var tile = slot.tile;
    state.hands[player].push(tile);
    sortHand(state.hands[player]);
    state.lastDraw = tile;
    state.lastDrawIndex = state.hands[player].lastIndexOf(tile);
    state.lastDrawPlayer = player;
    state.lastDrawSlot = slot;
    state.drawCount++;
    state.phase = 'discard';
    var reveal = state.human < 0 || player === state.human;
    log(state, NAMES[player] + (replacement ? ' 杠后补牌' : ' 摸牌') +
      (reveal ? ' ' + R.name(tile) : '') + '（' + slotText(state, slot) + '）');
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
      state.lastDiscard = null;
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
      state.lastDrawPlayer = null;
      state.lastDrawSlot = null;
      state.lastDiscard = null;
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
      state.lastDiscard = null;
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
      state.lastDrawPlayer = null;
      state.lastDrawSlot = null;
      state.lastDiscard = null;
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
    state.lastDrawPlayer = null;
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
      if (state.ghostId >= 0 && option.tile === state.ghostId) return false;
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

  function tileScore(hand, tile, ghostId) {
    if (ghostId != null && ghostId >= 0 && tile === ghostId) return 100;
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
      var score = tileScore(hand, hand[i], state.ghostId);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  function hintReason(hand, tile, ghostId) {
    if (ghostId != null && ghostId >= 0 && tile === ghostId) {
      return '鬼牌是万能牌，能补顺子或刻子；不能碰杠、不能做眼，先留在手里。';
    }
    var c = counts(hand);
    var copies = c[tile];
    if (copies >= 3) return '手里已有 ' + copies + ' 张' + R.name(tile) + '，是刻子或杠的材料，先留着。';
    if (copies === 2) return '对子：可以留作将牌，也可以等别人打出后碰。';
    if (tile >= 31) return '单张箭牌，除非做三元牌，否则通常先打。';
    if (tile >= 27) return '单张风牌，成刻才有价值，通常先打。';
    var base = Math.floor(tile / 9) * 9;
    var near = [];
    for (var d = -2; d <= 2; d++) {
      if (!d) continue;
      var t = tile + d;
      if (t >= base && t < base + 9 && c[t] > 0) near.push(t);
    }
    if (near.length) {
      return '和 ' + near.map(R.name).join('、') + ' 能连成搭子，还有进张，先留着。';
    }
    var n = tile % 9;
    if (n === 0 || n === 8) return '孤张边张，只能等一边的牌，适合先打。';
    return '孤张：和手里其他牌搭不上，先打它腾出位置。';
  }

  function handHint(state, player) {
    player = player == null ? state.human : player;
    if (state.phase !== 'discard' || state.turn !== player) return null;
    var hand = state.hands[player];
    if (!hand.length) return null;
    var seen = {};
    var options = [];
    hand.forEach(function (tile, index) {
      if (seen[tile]) return;
      seen[tile] = true;
      options.push({
        tile: tile,
        index: index,
        score: tileScore(hand, tile, state.ghostId),
        reason: hintReason(hand, tile, state.ghostId)
      });
    });
    options.sort(function (a, b) {
      return a.score - b.score || b.tile - a.tile;
    });
    return {
      tile: options[0].tile,
      index: options[0].index,
      reason: options[0].reason,
      options: options.slice(0, 3)
    };
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
    return R.waitsOf(tiles, state.ghostId);
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
    GHOST_IDS: GHOST_IDS,
    ghostIdFor: ghostIdFor,
    styleLabel: styleLabel,
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
    handHint: handHint,
    aiKong: aiKong,
    waitsFor: waitsFor,
    seatInfo: seatInfo,
    slotText: function (state, slot) { return slotText(state, slot); },
    windName: function (state, player) {
      return R.WINDS[R.windOf(player, state.dealer)];
    }
  };
});
