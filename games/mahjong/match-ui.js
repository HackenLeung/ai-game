/*! 麻雀学堂 · 对局界面 */
(function () {
  'use strict';

  var T = window.MahjongTiles;
  var M = window.MahjongMatch;
  var R = window.MahjongRules;
  var $ = function (id) { return document.getElementById(id); };
  var HUMAN = 0;
  var AI_DELAY = 1100;
  var DRAW_FLASH_MS = 1200;

  var game = null;
  var timer = null;
  var rollTimer = null;
  var drawFlashTimer = null;
  var dice = null;
  var selected = null;
  var hint = null;
  var handMerged = false;
  var drawFlash = { key: '', until: 0 };
  var sessionApplied = false;
  var session = { chips: [0, 0, 0, 0], hands: 0 };

  function isActive() {
    return !$('mj-panel-match').hidden && !document.hidden;
  }

  var PIPS = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8]
  };

  function randDie() {
    return Math.floor(Math.random() * 6) + 1;
  }

  function dieHTML(value) {
    var on = PIPS[value] || [];
    var cells = '';
    for (var i = 0; i < 9; i++) cells += '<i class="' + (on.indexOf(i) >= 0 ? '' : 'off') + '"></i>';
    return '<div class="mj-die" aria-label="' + value + ' 点">' + cells + '</div>';
  }

  function modeText(mode) {
    return mode === 'sum' ? '相加：点数既数人，也数墩'
      : mode === 'smallPerson' ? '小数数人 · 大数数墩'
        : '大数数人 · 小数数墩';
  }

  function readSettings() {
    var style = $('mj-match-style');
    return {
      mode: $('mj-mode').value,
      stackMode: $('mj-stack-mode').value,
      style: style ? style.value : 'ghost'
    };
  }

  function syncSettingsUI() {
    var mode = $('mj-match-mode');
    var stack = $('mj-match-stack');
    if (!mode || !stack) return;
    mode.value = $('mj-mode').value;
    stack.value = $('mj-stack-mode').value;
    var style = $('mj-match-style');
    var selectedStyle = style ? style.value : 'ghost';
    var activeStyle = game && game.style ? game.style : selectedStyle;
    var selectedMode = mode.value;
    var selectedStack = stack.value;
    var activeMode = game && game.mode ? game.mode : selectedMode;
    var activeStack = game && game.stackMode ? game.stackMode : selectedStack;
    var note = $('mj-match-rule-note');
    var tag = $('mj-match-style-tag');
    if (tag) tag.textContent = '136 张 · ' + M.styleLabel(activeStyle);
    if (note) {
      note.textContent = '本局用「' + modeText(activeMode) + '」，' +
        (activeStack === 'same' ? '从数到的那一墩开始拿' : '从数到的下一墩开始拿') +
        '；' + M.styleLabel(activeStyle) +
        (activeStyle === 'none' ? '' : '（不能碰杠、不能做眼）') +
        (selectedStyle !== activeStyle ? '；下一局改打 ' + M.styleLabel(selectedStyle) : '') +
        (selectedMode !== activeMode || selectedStack !== activeStack ? '；骰子设置下一局生效' : '') +
        '。改动从下一局或「重开本局」生效。';
    }
  }

  function applySettingsFromMatch() {
    if (!game) return;
    $('mj-mode').value = $('mj-match-mode').value;
    $('mj-stack-mode').value = $('mj-match-stack').value;
    $('mj-mode').dispatchEvent(new Event('change'));
    render();
  }

  function diceHTML() {
    if (!dice || !game) return '';
    var mode = game.mode;
    var sum = dice.a + dice.b + (mode === 'sum' ? dice.c : 0);
    var extra = mode === 'sum' ? dieHTML(dice.c) : '';
    var label = dice.rolling
      ? '摇骰子…'
      : M.NAMES[game.dealer] + ' 掷出 ' + dice.a + ' + ' + dice.b +
        (mode === 'sum' ? ' + ' + dice.c : '') + ' = ' + sum + ' 点';
    var detail = dice.rolling ? modeText(mode) : diceDetail();
    return '<div class="mj-match-dice' + (dice.rolling ? ' is-rolling' : '') + '">' +
      '<div class="mj-dice">' + dieHTML(dice.a) + dieHTML(dice.b) + extra + '</div>' +
      '<div class="mj-match-dice-copy"><p>' + label + '</p><span>' + detail + '</span></div>' +
      '</div>';
  }

  function sign(n) {
    return (n > 0 ? '+' : '') + n;
  }

  function isGhostTile(id) {
    return game && game.ghostId != null && game.ghostId >= 0 && id === game.ghostId;
  }

  function tileSpan(id, cls) {
    return '<span class="mj-tile ' + (cls || 'mj-tile-xs') +
      (isGhostTile(id) ? ' mj-tile-ghost' : '') +
      '" role="img" aria-label="' + T.name(id) + (isGhostTile(id) ? '（鬼牌）' : '') + '">' +
      T.svg(id) + '</span>';
  }

  function backSpan(cls) {
    return '<span class="mj-tile mj-match-back mj-tile-back ' + (cls || '') +
      '" aria-hidden="true"></span>';
  }

  function windName(player) {
    return R.WINDS[R.windOf(player, game.dealer)];
  }

  function relName(player) {
    return ['你', '下家', '对家', '上家'][(player - HUMAN + 4) % 4];
  }

  function slotShort(slot) {
    if (!slot) return '';
    return windName(slot.owner) + '位牌墙第 ' + slot.stack + ' 墩' + (slot.layer === 0 ? '上层' : '下层');
  }

  function diceDetail() {
    if (!game || !game.open) return '';
    if (game.mode === 'sum') return '合计数 ' + game.open.persons + '：既用来数人，也用来数墩。';
    if (game.mode === 'smallPerson') {
      return '小数 ' + game.open.small + ' 数人，大数 ' + game.open.big + ' 数墩。';
    }
    return '大数 ' + game.open.big + ' 数人，小数 ' + game.open.small + ' 数墩。';
  }

  function applySession() {
    if (!game || sessionApplied) return;
    session.chips = session.chips.map(function (value, i) { return value + game.chips[i]; });
    session.hands++;
    sessionApplied = true;
  }

  function startHand(dealer) {
    clearTimeout(timer);
    clearInterval(rollTimer);
    rollTimer = null;
    if (game && game.phase === 'over') applySession();
    clearTimeout(drawFlashTimer);
    drawFlashTimer = null;
    drawFlash = { key: '', until: 0 };
    var settings = readSettings();
    syncSettingsUI();
    var finalA = randDie();
    var finalB = randDie();
    var finalC = settings.mode === 'sum' ? randDie() : 0;
    game = M.createGame({
      dealer: dealer == null ? 0 : dealer,
      human: HUMAN,
      dice: { a: finalA, b: finalB, c: finalC },
      mode: settings.mode,
      stackMode: settings.stackMode,
      style: settings.style
    });
    sessionApplied = false;
    selected = null;
    hint = null;
    handMerged = false;
    dice = {
      a: randDie(),
      b: randDie(),
      c: settings.mode === 'sum' ? randDie() : 0,
      finalA: finalA,
      finalB: finalB,
      finalC: finalC,
      ticks: 0,
      rolling: true
    };
    render();
    continueRoll();
  }

  function nextHand() {
    if (!game) {
      startHand(0);
      return;
    }
    startHand(game.phase === 'over' ? game.nextDealer : game.dealer);
  }

  function resetSession() {
    clearTimeout(timer);
    session = { chips: [0, 0, 0, 0], hands: 0 };
    game = null;
    startHand(0);
  }

  function updateBadge() {
    var tab = document.querySelector('.mj-tab[data-tab="match"]');
    if (tab && tab.getAttribute('aria-selected') === 'true') {
      var style = $('mj-match-style');
      var styleValue = game && game.style ? game.style : (style ? style.value : 'ghost');
      $('mj-badge').textContent = '对局 · ' + M.styleLabel(styleValue) +
        ' · 骰子开门 · 中河弃牌';
    }
  }

  function meldsHTML(melds) {
    if (!melds.length) return '';
    return melds.map(function (meld) {
      var label = meld.type === 'kong' ? (meld.concealed ? '暗杠' : '杠') :
        meld.type === 'peng' ? '碰' : '吃';
      return '<div class="mj-match-meld"><span class="mj-match-meld-label">' + label + '</span>' +
        meld.tiles.map(function (tile) { return tileSpan(tile); }).join('') + '</div>';
    }).join('');
  }

  function seatHTML(player, position) {
    var info = M.seatInfo(game, player);
    var backs = '';
    if (game.phase === 'over' && game.winner === player) {
      backs = game.hands[player].map(function (tile) { return tileSpan(tile); }).join('');
    } else {
      for (var i = 0; i < info.handCount; i++) backs += backSpan();
    }
    var turn = game.phase !== 'over' && game.phase !== 'claim-human' && game.turn === player;
    var drew = game.lastDraw != null && game.lastDrawPlayer === player &&
      game.lastDrawSlot && game.lastDrawSlot.owner === player;
    return '<div class="mj-match-seat mj-match-' + position + (turn ? ' is-turn' : '') +
      (game.winner === player ? ' is-winner' : '') + '">' +
      '<div class="mj-match-seat-head"><i class="mj-match-avatar" aria-hidden="true">' + info.wind + '</i><b>' + info.name + '</b>' +
      '<span>' + info.wind + '位' + (info.isDealer ? ' · 庄' : '') + '</span>' +
      '<span class="mj-match-count">' + info.handCount + ' 张</span></div>' +
      '<div class="mj-match-backs">' + backs + '</div>' +
      '<div class="mj-match-melds">' + meldsHTML(info.melds) + '</div>' +
      (drew ? '<p class="mj-match-seat-draw">' + (game.drawCount === 0 ? '起手 ' : '刚摸 ') +
        slotShort(game.lastDrawSlot) + '</p>' : '') +
      '</div>';
  }

  function waitsText() {
    var waits = M.waitsFor(game, HUMAN);
    if (!waits.length) return '';
    return ' · 听 ' + waits.map(T.name).join('、');
  }

  function suitGroup(tile) {
    if (tile < 27) return Math.floor(tile / 9);
    return tile < 31 ? 3 : 4;
  }

  function handOrder() {
    var tiles = game.hands[HUMAN];
    var drawIndex = game.lastDrawPlayer === HUMAN ? game.lastDrawIndex : -1;
    var order = [];
    if (handMerged || drawIndex < 0 || drawIndex >= tiles.length) {
      for (var i = 0; i < tiles.length; i++) order.push(i);
      return order;
    }
    for (var j = 0; j < tiles.length; j++) {
      if (j !== drawIndex) order.push(j);
    }
    order.push(drawIndex);
    return order;
  }

  function meHTML() {
    var info = M.seatInfo(game, HUMAN);
    var tiles = game.hands[HUMAN];
    var drawIndex = game.lastDrawPlayer === HUMAN ? game.lastDrawIndex : -1;
    var order = handOrder();
    var canDiscard = game.phase === 'discard' && game.turn === HUMAN && !(dice && dice.rolling);
    var prevGroup = null;
    var hand = order.map(function (index) {
      var tile = tiles[index];
      var drawn = index === drawIndex;
      var picked = selected && selected.index === index;
      var group = suitGroup(tile);
      var suitStart = prevGroup != null && group !== prevGroup ? ' is-suit-start' : '';
      prevGroup = group;
      var hinted = hint && hint.index === index;
      var ghost = isGhostTile(tile);
      return '<button type="button" class="mj-tile mj-match-hand-tile' +
        (ghost ? ' mj-tile-ghost' : '') +
        (drawn ? ' is-drawn' : '') +
        (drawn && !handMerged && order.length > 1 ? ' is-separated' : '') +
        (picked ? ' is-selected' : '') +
        (hinted ? ' is-hint' : '') +
        suitStart +
        '" data-hand-index="' + index + '" aria-label="选择 ' + T.name(tile) +
        (ghost ? '（鬼牌）' : '') +
        (hinted ? '（提示先打这张）' : '') + '（再点一次打出）"' +
        ' aria-pressed="' + (picked ? 'true' : 'false') + '"' +
        (canDiscard ? '' : ' disabled') + '>' +
        (drawn && !handMerged ? '<span class="mj-draw-tag">' +
          (game.drawCount === 0 ? '跳' : '摸') + '</span>' : '') +
        T.svg(tile) + '</button>';
    }).join('');
    var turn = game.phase !== 'over' && game.phase !== 'claim-human' && game.turn === HUMAN;
    return '<div class="mj-match-me' + (turn ? ' is-turn' : '') +
      (game.winner === HUMAN ? ' is-winner' : '') + '">' +
      '<div class="mj-match-seat-head"><i class="mj-match-avatar" aria-hidden="true">' + info.wind + '</i><b>我</b>' +
      '<span>' + info.wind + '位' + (info.isDealer ? ' · 庄' : '') + '</span>' +
      '<span class="mj-match-count">手牌 ' + tiles.length + ' 张' +
      (game.phase === 'over' ? '' : waitsText()) + '</span>' +
      '<span class="mj-match-hand-tools"><button type="button" class="mj-btn" data-match="sort" aria-pressed="' +
      (handMerged ? 'true' : 'false') + '" title="把刚摸到的牌并回顺子；再点一次分开">' +
      (handMerged ? '摸牌分开放' : '整理手牌') + '</button></span></div>' +
      '<div class="mj-match-melds">' + meldsHTML(info.melds) + '</div>' +
      '<p class="mj-match-me-status' + (canDiscard || game.phase === 'claim-human' ? ' is-ready' : '') + '"><span class="mj-live-dot" aria-hidden="true"></span>' + statusText() + '</p>' +
      '<div class="mj-match-me-play">' +
      '<div class="mj-match-hand" aria-label="我的手牌">' + hand + '</div>' +
      '<div class="mj-match-actions mj-match-me-actions" id="mj-match-actions">' + actionsHTML() + '</div>' +
      '</div>' +
      '<p class="mj-hand-scroll-note">左右滑动查看手牌</p>' +
      '</div>';
  }

  function resultText() {
    if (!game.winInfo) return '';
    if (game.winInfo.draw) return '流局';
    return M.NAMES[game.winner] + (game.winInfo.selfDraw ? ' 自摸' : ' 胡牌');
  }

  function wallSideHTML(owner, position) {
    var wind = windName(owner);
    var breakOwner = game.deal ? game.deal.breakOwner : -1;
    var breakStack = game.deal ? game.deal.breakStack : -1;
    var next = game.wall.length ? game.wall[game.wall.length - 1] : null;
    var last = game.lastDrawSlot;
    var byStack = {};
    game.wallSlots.forEach(function (slot) {
      if (slot.owner !== owner) return;
      (byStack[slot.stack] = byStack[slot.stack] || []).push(slot);
    });
    var stacks = [];
    for (var s = 1; s <= 17; s++) {
      var classes = 'mj-wall-stack';
      if (owner === breakOwner && s === breakStack) classes += ' is-break';
      if (next && next.owner === owner && next.stack === s) classes += ' is-next';
      if (last && last.owner === owner && last.stack === s) classes += ' is-last';
      var slots = byStack[s] || [];
      var isTail = slots.some(function (slot) { return slot.tail && !slot.taken; });
      if (isTail) classes += ' is-tail';
      var bars = slots.map(function (slot) {
        return '<i class="mj-wall-tile' + (slot.taken ? ' is-taken' : '') + '"></i>';
      }).join('');
      stacks.push('<span class="' + classes + '" title="' + wind + '位牌墙 第 ' + s + ' 墩' +
        (isTail ? ' · 尾牌' : '') + '">' + bars + '</span>');
    }
    if (position === 'bottom' || position === 'left') stacks.reverse();
    return '<div class="mj-wall-side mj-wall-' + position + '" aria-label="' + wind + '位牌墙">' +
      stacks.join('') + '</div>';
  }

  function drawKey() {
    if (!game || game.lastDrawPlayer == null || !game.lastDrawSlot) return '';
    var slot = game.lastDrawSlot;
    return [game.lastDrawPlayer, slot.owner, slot.stack, slot.layer, slot.tile, game.drawCount].join(':');
  }

  function drawBannerHTML() {
    if (!game || game.lastDrawPlayer == null || !game.lastDrawSlot) {
      return '<div class="mj-draw-banner is-idle"><span>摸牌顺序：从开门墩起，先上层后下层，沿牌墙逆时针摸。</span></div>';
    }
    var player = game.lastDrawPlayer;
    var slot = game.lastDrawSlot;
    var isHuman = player === HUMAN;
    var isJump = game.drawCount === 0;
    var fresh = drawFlash.until > Date.now();
    var face = isHuman ? tileSpan(game.lastDraw, 'mj-tile-sm') : backSpan('mj-tile-sm');
    var copy = isHuman
      ? '你 ' + (isJump ? '起手跳牌拿到 ' : '摸到 ') + T.name(game.lastDraw)
      : M.NAMES[player] + (isJump ? ' 起手跳牌' : ' 摸牌');
    return '<div class="mj-draw-banner' + (fresh ? ' is-new' : '') + (isHuman ? ' is-human' : '') + '">' +
      '<span class="mj-draw-banner-tag">' + (isJump ? '起手跳牌' : '摸牌') + '</span>' +
      face +
      '<span class="mj-draw-banner-copy"><b>' + copy + '</b>' +
      '<span>' + M.slotText(game, slot) + ' · 已入手牌</span></span></div>';
  }

  function centerHTML() {
    var next = game.wall.length ? game.wall[game.wall.length - 1] : null;
    var turn = game.phase === 'over'
      ? '本局结束'
      : game.phase === 'claim-human'
        ? '等你决定'
        : M.NAMES[game.turn] + '（' + windName(game.turn) + '位）';
    var result = game.phase === 'over'
      ? '<div class="mj-match-result">' + resultText() + '</div>'
      : '';
    var breakText = game.deal
      ? '开门 ' + relName(game.deal.breakOwner) + '（' + windName(game.deal.breakOwner) + '位）第 ' +
        game.deal.breakStack + ' 墩'
      : '';
    return '<div class="mj-match-center-top">' + diceHTML() + drawBannerHTML() + '</div>' +
      '<div class="mj-wall-ring">' +
      wallSideHTML(2, 'top') + wallSideHTML(3, 'left') +
      '<div class="mj-wall-core">' +
      '<div class="mj-core-river">' + riverHTML() + '</div>' +
      '<div class="mj-core-mini">' +
      '<div class="mj-match-wall"><span>牌墙</span><b>' + game.wall.length + '</b><span>张</span></div>' +
      (breakText ? '<span class="mj-match-wall-sub">' + breakText + '</span>' : '') +
      '<span class="mj-match-wall-sub">' + (next ? '下一摸：' + M.slotText(game, next) : '牌墙已摸完') + '</span>' +
      '</div>' +
      '</div>' +
      wallSideHTML(1, 'right') + wallSideHTML(0, 'bottom') +
      '</div>' +
      '<div class="mj-match-center-foot">' +
      '<span class="mj-match-turn">' + turn + '</span>' +
      '<span>牌墙 ' + game.wall.length + ' 张</span>' +
      (breakText ? '<span>' + breakText + '</span>' : '') +
      '<span>' + (next ? '下一摸 ' + M.slotText(game, next) : '牌墙已摸完') + '</span>' +
      '</div>' +
      '<span class="mj-wall-legend">亮 = 未摸 · 暗 = 已摸走 · 金框 = 开门 · 浅青 = 尾牌</span>' +
      result;
  }

  function riverZoneHTML(player, position) {
    var tiles = game.discards[player];
    var latest = game.lastDiscard && game.lastDiscard.player === player && tiles.length
      ? tiles.length - 1 : -1;
    var body = tiles.length
      ? tiles.map(function (tile, index) {
        return tileSpan(tile, 'mj-tile-xs mj-match-discard' + (index === latest ? ' is-latest' : ''));
      }).join('')
      : '<span class="mj-river-empty">—</span>';
    return '<div class="mj-river-zone mj-river-' + position + (tiles.length ? '' : ' is-empty') +
      '" aria-label="' + M.NAMES[player] + '的弃牌">' +
      '<span class="mj-river-label">' + M.NAMES[player] + ' · ' + windName(player) + '位 · ' + tiles.length + ' 张</span>' +
      '<div class="mj-river-tiles">' + body + '</div></div>';
  }

  function riverHTML() {
    var total = 0;
    game.discards.forEach(function (tiles) { total += tiles.length; });
    return '<div class="mj-match-river" aria-label="牌桌中央牌河">' +
      riverZoneHTML(2, 'top') + riverZoneHTML(3, 'left') +
      '<div class="mj-river-center"><b>' + total + '</b><span>张弃牌</span>' +
      '<em>亮框 = 刚打出的牌</em></div>' +
      riverZoneHTML(1, 'right') + riverZoneHTML(0, 'bottom') +
      '</div>';
  }

  function boardHTML() {
    return seatHTML(2, 'top') +
      seatHTML(3, 'left') +
      '<div class="mj-match-center">' + centerHTML() + '</div>' +
      seatHTML(1, 'right') +
      '<div class="mj-match-river-wrap">' + riverHTML() + '</div>' +
      meHTML();
  }

  function statusText() {
    if (!game) return '';
    if (dice && dice.rolling) return '庄家摇骰子… 数法：' + modeText(game.mode) + '。';
    if (selected && game.phase === 'discard' && game.turn === HUMAN) {
      return '已选中 ' + T.name(selected.tile) + '，点「打出」或再点一次牌面。';
    }
    if (game.phase === 'over') {
      if (game.winner == null) return '流局，牌墙摸完。';
      return M.NAMES[game.winner] + (game.winInfo.selfDraw
        ? ' 自摸胡！'
        : ' 胡了 ' + M.NAMES[game.winInfo.discarder] + ' 的牌！');
    }
    if (game.phase === 'claim-human') {
      var kinds = [];
      var seenKinds = {};
      game.pending.forEach(function (claim) {
        if (seenKinds[claim.type]) return;
        seenKinds[claim.type] = true;
        kinds.push(claim.type === 'hu' ? '胡' : claim.type === 'gang' ? '杠' : claim.type === 'peng' ? '碰' : '吃');
      });
      if (!kinds.length) kinds.push('吃碰杠胡');
      return M.NAMES[game.lastDiscard.player] + ' 打出 ' + T.name(game.lastDiscard.tile) +
        '（牌河亮框），你可以' + kinds.join('、') + '；优先级：胡 > 杠/碰 > 吃，也可以过。';
    }
    if (game.turn === HUMAN) {
      if (game.lastDraw != null && game.lastDrawPlayer === HUMAN) {
        return game.drawCount === 0
          ? '你的回合：起手 14 张，跳牌拿到 ' + T.name(game.lastDraw) + '（' +
            slotShort(game.lastDrawSlot) + '），点手牌打出。'
          : '你的回合：摸到 ' + T.name(game.lastDraw) + '（' + slotShort(game.lastDrawSlot) + '），点手牌打出。';
      }
      return '你的回合：请点手牌打出。';
    }
    return '等待 ' + M.NAMES[game.turn] + ' 出牌…' +
      (game.lastDraw != null && game.lastDrawPlayer === game.turn && game.lastDrawSlot
        ? (game.drawCount === 0 ? '（跳牌 ' : '（刚摸 ') + slotShort(game.lastDrawSlot) + '）' : '');
  }

  function tipText() {
    if (!game) return '';
    if (dice && dice.rolling) {
      return '骰子只做两件事：先数人决定谁家开门，再数墩决定从哪一墩开始拿。摇完会在中间标出来。';
    }
    if (game.phase === 'over') return '牌局结束后，赢家坐庄；点「再来一局」继续。';
    if (game.phase === 'claim-human') {
      return '先看能不能胡；不能胡再考虑碰、杠、吃。吃只能吃上家，碰杠不限来源。点「过」就放弃这次。';
    }
    if (game.turn === HUMAN) {
      if (selected) return '已经选中一张牌。拿不准时点「提示」，会按牌效率给出建议和原因。';
      return '摸到的牌单独摆在最右边。先看它能不能和手里的牌连成搭子，再决定打哪张；点「提示」可以看推荐。';
    }
    if (game.lastDrawSlot) {
      return '电脑刚摸的是 ' + M.slotText(game, game.lastDrawSlot) + '。看中间牌河，亮框就是刚打出的牌。';
    }
    return '牌河在桌子中间：上=对家，左=上家，右=下家，下=你。牌墙上的金框是开门位置，亮色是下一张要摸的墩。';
  }

  function tipHTML() {
    if (!hint) return '<p class="mj-match-tip">' + tipText() + '</p>';
    var extra = hint.options.slice(1).map(function (option) {
      return '<li>备选 ' + T.name(option.tile) + '：' + option.reason + '</li>';
    }).join('');
    return '<div class="mj-match-tip is-hint"><b>建议先打 ' + T.name(hint.tile) + '</b>' +
      '<p>' + hint.reason + '</p>' +
      (extra ? '<ul>' + extra + '</ul>' : '') + '</div>';
  }

  function actionsHTML() {
    if (!game) return '';
    if (dice && dice.rolling) {
      return '<span class="mj-match-hint">等庄家摇完骰子，再按点数开门发牌…</span>';
    }
    if (game.phase === 'over') {
      return '<button type="button" class="mj-btn mj-btn-primary" data-match="next">再来一局</button>';
    }
    if (game.phase === 'claim-human') {
      var html = '';
      var seen = {};
      game.pending.forEach(function (claim) {
        if (claim.type === 'chi') {
          html += '<button type="button" class="mj-btn mj-match-claim" data-claim="chi" data-tiles="' +
            claim.tiles.join(',') + '" aria-label="吃 ' + claim.tiles.map(T.name).join('、') + '">吃 ' +
            claim.tiles.map(function (tile) { return tileSpan(tile); }).join('') + '</button>';
        } else if (!seen[claim.type]) {
          seen[claim.type] = true;
          var label = claim.type === 'hu' ? '胡' : claim.type === 'gang' ? '杠' : '碰';
          html += '<button type="button" class="mj-btn ' +
            (claim.type === 'hu' ? 'mj-btn-primary' : '') + '" data-claim="' + claim.type + '">' +
            label + '</button>';
        }
      });
      if (!html) return '<span class="mj-match-hint">等待其他家…</span>';
      return html + '<button type="button" class="mj-btn mj-btn-ghost" data-claim="pass">过</button>';
    }
    if (game.turn === HUMAN && game.phase === 'discard') {
      var self = '<button type="button" class="mj-btn mj-btn-primary" data-match="discard"' +
        (selected ? '' : ' disabled') + '>打出' + (selected ? ' ' + T.name(selected.tile) : '') + '</button>';
      if (selected) {
        self += '<button type="button" class="mj-btn mj-btn-ghost" data-match="cancel">取消</button>';
      } else {
        self += '<span class="mj-match-hint">先选一张手牌，或点「提示」</span>';
      }
      self += '<button type="button" class="mj-btn mj-btn-ghost" data-match="hint" title="按牌效率推荐一张，并说明原因">提示</button>';
      if (M.canSelfWin(game)) {
        self += '<button type="button" class="mj-btn mj-btn-primary" data-self="win">自摸胡</button>';
      }
      M.selfKongOptions(game).forEach(function (option, index) {
        self += '<button type="button" class="mj-btn" data-kong="' + index + '">' +
          (option.type === 'concealed' ? '暗杠 ' : '补杠 ') + T.name(option.tile) + '</button>';
      });
      return self;
    }
    return '<span class="mj-match-hint">等待 ' + M.NAMES[game.turn] + '…</span>';
  }

  function openStepsHTML() {
    if (!game || !game.open || !game.deal) return '';
    if (dice && dice.rolling) {
      return '<li class="mj-match-steps-wait">摇骰中，摇完会在这里拆解每一步…</li>';
    }
    var o = game.open;
    var d = game.roll;
    var deal = game.deal;
    var diceText = game.mode === 'sum'
      ? d.a + ' + ' + d.b + ' + ' + d.c + ' = ' + d.total
      : d.a + ' + ' + d.b + ' = ' + d.total;
    var countText = game.mode === 'sum'
      ? '合计数 ' + o.persons + ' 既用来数人，也用来数墩'
      : game.mode === 'smallPerson'
        ? '小数 ' + o.small + ' 数人，大数 ' + o.big + ' 数墩'
        : '大数 ' + o.big + ' 数人，小数 ' + o.small + ' 数墩';
    var openSeat = relName(o.openWind) + '（' + windName(o.openWind) + '位）';
    var wallSeat = relName(deal.breakOwner) + '（' + windName(deal.breakOwner) + '位）';
    var takeText;
    if (deal.wrapped) {
      takeText = '从' + openSeat + '牌墙右端数 ' + o.stacks + ' 墩；超过 17 墩，绕到' +
        wallSeat + '第 ' + deal.breakStack + ' 墩，从这一墩开始拿。';
    } else if (game.stackMode === 'same') {
      takeText = '从' + wallSeat + '牌墙右端数 ' + o.stacks + ' 墩，从数到的那一墩（第 ' +
        deal.breakStack + ' 墩）开始拿。';
    } else {
      takeText = '从' + wallSeat + '牌墙右端数 ' + o.stacks + ' 墩，数到的那一墩只作记号；从下一墩（第 ' +
        deal.breakStack + ' 墩）开始拿。';
    }
    var next = game.wall.length ? game.wall[game.wall.length - 1] : null;
    return '<li><i>1</i><span><b>摇骰</b>' + M.NAMES[game.dealer] + ' 掷出 ' + diceText + ' 点；' + countText + '。</span></li>' +
      '<li><i>2</i><span><b>数人</b>从庄家算第 1 位，逆时针数 ' + o.persons + ' 位 → ' + openSeat + '开门。</span></li>' +
      '<li><i>3</i><span><b>数墩</b>' + takeText + '</span></li>' +
      '<li><i>4</i><span><b>发牌</b>从开门墩起，先上层后下层、沿逆时针绕四道牌墙；每家拿 4 张（2 墩），拿 3 轮，各 12 张。</span></li>' +
      '<li><i>5</i><span><b>跳牌</b>庄家再拿 2 张（第 1、3 墩上层），其余三家各拿第 2、4、5 墩上层：庄家 14 张，其他各 13 张；这五墩剩下的 5 张下层牌留到牌墙尾。</span></li>' +
      '<li class="is-now"><i>6</i><span><b>现在</b>牌墙剩 ' + game.wall.length + ' 张；' +
      (next ? '下一张从 ' + M.slotText(game, next) + ' 摸。' : '牌墙已摸完。') + '</span></li>';
  }

  function chipsHTML() {
    return M.NAMES.map(function (name, player) {
      var now = game.chips[player];
      var total = session.chips[player];
      return '<div class="mj-match-chip-row"><span>' + name + '</span>' +
        '<b class="' + (now > 0 ? 'is-plus' : now < 0 ? 'is-minus' : '') + '">' + sign(now) + '</b>' +
        '<em>累计 ' + sign(total) + '</em></div>';
    }).join('');
  }

  function logHTML() {
    return game.log.slice(-3).reverse().map(function (text) {
      return '<p>' + text + '</p>';
    }).join('');
  }

  function render() {
    if (!game) return;
    var board = $('mj-match-board');
    var active = document.activeElement;
    var hadBoardFocus = board.contains(active);
    var focusIndex = board.contains(active) && active.dataset ? active.dataset.handIndex : null;
    var focusAction = board.contains(active) && active.dataset ? active.dataset.match : null;
    var rack = board.querySelector('.mj-match-hand');
    var rackScroll = rack ? rack.scrollLeft : 0;
    if (selected && (game.phase !== 'discard' || game.turn !== HUMAN ||
      selected.index >= game.hands[HUMAN].length ||
      game.hands[HUMAN][selected.index] !== selected.tile)) {
      selected = null;
    }
    if (hint && (game.phase !== 'discard' || game.turn !== HUMAN ||
      hint.index >= game.hands[HUMAN].length ||
      game.hands[HUMAN][hint.index] !== hint.tile)) {
      hint = null;
    }
    if (game.phase === 'over') applySession();
    var flashKey = drawKey();
    if (flashKey && flashKey !== drawFlash.key) {
      drawFlash.key = flashKey;
      drawFlash.until = Date.now() + DRAW_FLASH_MS;
      clearTimeout(drawFlashTimer);
      drawFlashTimer = setTimeout(function () {
        drawFlash.until = 0;
        render();
      }, DRAW_FLASH_MS + 20);
    } else if (!flashKey) {
      drawFlash.key = '';
      drawFlash.until = 0;
      clearTimeout(drawFlashTimer);
      drawFlashTimer = null;
    }
    board.innerHTML = boardHTML();
    var nextRack = board.querySelector('.mj-match-hand');
    if (nextRack) nextRack.scrollLeft = rackScroll;
    var focusTarget = focusIndex != null ? board.querySelector('[data-hand-index="' + focusIndex + '"]:not(:disabled)') :
      focusAction ? board.querySelector('[data-match="' + focusAction + '"]:not(:disabled)') : null;
    if (focusTarget) focusTarget.focus({ preventScroll: true });
    else if (hadBoardFocus) board.focus({ preventScroll: true });
    $('mj-match-status').textContent = statusText();
    $('mj-match-tip').innerHTML = tipHTML();
    $('mj-match-chips').innerHTML = chipsHTML();
    $('mj-match-log').innerHTML = logHTML();
    $('mj-match-open').innerHTML = openStepsHTML();
    $('mj-match-hand-no').textContent = '第 ' +
      (session.hands + (game.phase === 'over' ? 0 : 1)) + ' 把';
    $('mj-match-next').textContent = game.phase === 'over' ? '再来一局' : '重开本局';
    syncSettingsUI();
    updateBadge();
  }

  function schedule() {
    clearTimeout(timer);
    if (!isActive()) return;
    if (!game || game.phase === 'over' || game.phase === 'claim-human') return;
    if (dice && dice.rolling) return;
    if (game.turn === HUMAN) return;
    timer = setTimeout(aiStep, AI_DELAY);
  }

  function afterHuman() {
    render();
    if (!game || game.phase === 'over' || game.phase === 'claim-human') return;
    if (game.turn !== HUMAN) schedule();
  }

  function aiStep() {
    if (!isActive()) return;
    if (!game || game.phase === 'over' || game.phase === 'claim-human' || game.turn === HUMAN) return;
    if (dice && dice.rolling) return;
    if (game.phase !== 'discard') return;
    if (M.canSelfWin(game)) {
      M.declareSelfWin(game);
      render();
      return;
    }
    var kong = M.aiKong(game);
    if (kong) {
      M.applySelfKong(game, kong);
      render();
      schedule();
      return;
    }
    M.discard(game, M.chooseDiscardIndex(game));
    render();
    if (game.phase === 'claim-human') return;
    schedule();
  }

  function continueRoll() {
    if (!dice || !dice.rolling || rollTimer || !isActive()) return;
    rollTimer = setInterval(function () {
      if (!isActive()) { deactivate(); return; }
      dice.ticks++;
      if (dice.ticks >= 10) {
        clearInterval(rollTimer);
        rollTimer = null;
        dice.a = dice.finalA;
        dice.b = dice.finalB;
        dice.c = dice.finalC;
        dice.rolling = false;
        render();
        schedule();
        return;
      }
      dice.a = randDie();
      dice.b = randDie();
      if (game.mode === 'sum') dice.c = randDie();
      render();
    }, 90);
  }

  function activate() {
    if (!game) {
      startHand(0);
      return;
    }
    syncSettingsUI();
    render();
    continueRoll();
    schedule();
  }

  function deactivate() {
    clearTimeout(timer);
    clearInterval(rollTimer);
    clearTimeout(drawFlashTimer);
    drawFlashTimer = null;
    rollTimer = null;
  }

  function discardSelected() {
    if (!isActive() || !game || !selected || game.phase !== 'discard' || game.turn !== HUMAN || (dice && dice.rolling)) return;
    var index = selected.index;
    selected = null;
    hint = null;
    if (M.discard(game, index)) afterHuman();
  }

  function handleAction(button) {
    if (!game) return;
    if (button.dataset.match === 'next') {
      nextHand();
      return;
    }
    if (button.dataset.match === 'sort') {
      handMerged = !handMerged;
      render();
      return;
    }
    if (button.dataset.match === 'hint') {
      hint = M.handHint(game, HUMAN);
      render();
      return;
    }
    if (button.dataset.match === 'cancel') {
      selected = null;
      render();
      return;
    }
    if (button.dataset.match === 'discard') {
      discardSelected();
      return;
    }
    if (button.dataset.self === 'win') {
      selected = null;
      hint = null;
      if (M.declareSelfWin(game)) afterHuman();
      return;
    }
    if (button.dataset.kong != null) {
      selected = null;
      hint = null;
      var options = M.selfKongOptions(game);
      var option = options[+button.dataset.kong];
      if (option && M.applySelfKong(game, option)) afterHuman();
      return;
    }
    if (button.dataset.claim === 'pass') {
      if (M.humanPass(game)) afterHuman();
      return;
    }
    if (button.dataset.claim === 'chi') {
      var tiles = button.dataset.tiles.split(',').map(Number);
      if (M.humanClaim(game, 'chi', tiles)) { hint = null; afterHuman(); }
      return;
    }
    if (button.dataset.claim) {
      if (M.humanClaim(game, button.dataset.claim)) { hint = null; afterHuman(); }
    }
  }

  $('mj-match-board').addEventListener('click', function (event) {
    if (!game) return;
    var hand = event.target.closest('button[data-hand-index]');
    if (hand) {
      if (game.phase !== 'discard' || game.turn !== HUMAN || (dice && dice.rolling)) return;
      var index = +hand.dataset.handIndex;
      if (selected && selected.index === index) {
        discardSelected();
        return;
      }
      selected = { index: index, tile: game.hands[HUMAN][index] };
      render();
      return;
    }
    var button = event.target.closest('button');
    if (button) handleAction(button);
  });

  ['mj-match-mode', 'mj-match-stack', 'mj-match-style'].forEach(function (id) {
    var select = $(id);
    if (select) select.addEventListener('change', applySettingsFromMatch);
  });

  $('mj-match-next').addEventListener('click', nextHand);
  $('mj-match-reset').addEventListener('click', resetSession);

  $('mj-match-board').tabIndex = -1;
  $('mj-match-board').setAttribute('aria-label', '四人麻将牌桌');
  $('mj-match-board').addEventListener('keydown', function (event) {
    if (!isActive()) return;
    if (event.key === 'Escape' && selected) {
      event.preventDefault();
      selected = null;
      render();
      return;
    }
    if ((event.key === 'h' || event.key === 'H') && game && game.phase === 'discard' &&
      game.turn === HUMAN && !(dice && dice.rolling)) {
      event.preventDefault();
      hint = M.handHint(game, HUMAN);
      render();
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) < 0) return;
    var tiles = Array.prototype.slice.call(this.querySelectorAll('.mj-match-hand-tile:not(:disabled)'));
    if (!tiles.length || (event.target !== this && !event.target.matches('[data-hand-index]'))) return;
    event.preventDefault();
    var current = tiles.indexOf(document.activeElement);
    var index = event.key === 'Home' ? 0 : event.key === 'End' ? tiles.length - 1 :
      current < 0 ? 0 : (current + (event.key === 'ArrowLeft' ? tiles.length - 1 : 1)) % tiles.length;
    tiles[index].focus({ preventScroll: true });
    tiles[index].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) deactivate();
    else if (!$('mj-panel-match').hidden) activate();
  });

  window.MahjongMatchUI = {
    activate: activate,
    deactivate: deactivate,
    updateBadge: updateBadge
  };
})();
