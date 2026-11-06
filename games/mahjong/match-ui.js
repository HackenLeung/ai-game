/*! 麻雀学堂 · 对局界面 */
(function () {
  'use strict';

  var T = window.MahjongTiles;
  var M = window.MahjongMatch;
  var $ = function (id) { return document.getElementById(id); };
  var HUMAN = 0;
  var AI_DELAY = 650;

  var game = null;
  var timer = null;
  var rollTimer = null;
  var dice = null;
  var selected = null;
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

  function diceHTML() {
    if (!dice || !game) return '';
    var sum = dice.a + dice.b;
    var label = dice.rolling
      ? '摇骰子…'
      : M.NAMES[game.dealer] + ' 掷出 ' + dice.a + ' + ' + dice.b + ' = ' + sum + ' 点，庄家先出牌';
    return '<div class="mj-match-dice' + (dice.rolling ? ' is-rolling' : '') + '">' +
      '<div class="mj-dice">' + dieHTML(dice.a) + dieHTML(dice.b) + '</div>' +
      '<p>' + label + '</p></div>';
  }

  function rollDice() {
    clearInterval(rollTimer);
    rollTimer = null;
    clearTimeout(timer);
    selected = null;
    dice = {
      a: randDie(),
      b: randDie(),
      finalA: randDie(),
      finalB: randDie(),
      ticks: 0,
      rolling: true
    };
    render();
    continueRoll();
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
        dice.rolling = false;
        game.log.push(M.NAMES[game.dealer] + ' 掷骰 ' + dice.a + ' + ' + dice.b + ' = ' + (dice.a + dice.b));
        if (game.log.length > 80) game.log.shift();
        render();
        schedule();
        return;
      }
      dice.a = randDie();
      dice.b = randDie();
      render();
    }, 90);
  }

  function sign(n) {
    return (n > 0 ? '+' : '') + n;
  }

  function tileSpan(id, cls) {
    return '<span class="mj-tile ' + (cls || 'mj-tile-xs') + '" role="img" aria-label="' + T.name(id) + '">' + T.svg(id) + '</span>';
  }

  function backSpan() {
    return '<span class="mj-tile mj-match-back mj-tile-back"></span>';
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
    game = M.createGame({ dealer: dealer == null ? 0 : dealer, human: HUMAN });
    sessionApplied = false;
    rollDice();
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
      $('mj-badge').textContent = '对局 · 无鬼无花 · 不算番';
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

  function discardsHTML(tiles, player) {
    if (!tiles.length) return '<span class="mj-match-empty">还未出牌</span>';
    return tiles.map(function (tile, index) {
      var latest = game.lastDiscard && game.lastDiscard.player === player && index === tiles.length - 1 && game.lastDiscard.tile === tile;
      return tileSpan(tile, 'mj-tile-xs mj-match-discard' + (latest ? ' is-latest' : ''));
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
    return '<div class="mj-match-seat mj-match-' + position + (turn ? ' is-turn' : '') +
      (game.winner === player ? ' is-winner' : '') + '">' +
      '<div class="mj-match-seat-head"><i class="mj-match-avatar" aria-hidden="true">' + info.wind + '</i><b>' + info.name + '</b>' +
      '<span>' + info.wind + '位' + (info.isDealer ? ' · 庄' : '') + '</span>' +
      '<span class="mj-match-count">' + info.handCount + ' 张</span></div>' +
      '<div class="mj-match-backs">' + backs + '</div>' +
      '<div class="mj-match-melds">' + meldsHTML(info.melds) + '</div>' +
      '<div class="mj-match-discards" aria-label="' + info.name + '的弃牌">' + discardsHTML(info.discards, player) + '</div>' +
      '</div>';
  }

  function waitsText() {
    var waits = M.waitsFor(game, HUMAN);
    if (!waits.length) return '';
    return ' · 听 ' + waits.map(T.name).join('、');
  }

  function meHTML() {
    var info = M.seatInfo(game, HUMAN);
    var tiles = game.hands[HUMAN];
    var drawIndex = game.lastDrawIndex;
    var order = [];
    for (var i = 0; i < tiles.length; i++) {
      if (i !== drawIndex) order.push(i);
    }
    if (drawIndex >= 0 && drawIndex < tiles.length) order.push(drawIndex);
    var canDiscard = game.phase === 'discard' && game.turn === HUMAN && !(dice && dice.rolling);
    var hand = order.map(function (index) {
      var tile = tiles[index];
      var drawn = index === drawIndex;
      var picked = selected && selected.index === index;
      return '<button type="button" class="mj-tile mj-match-hand-tile' +
        (drawn ? ' is-drawn' : '') +
        (drawn && order.length > 1 ? ' is-separated' : '') +
        (picked ? ' is-selected' : '') +
        '" data-hand-index="' + index + '" aria-label="选择 ' + T.name(tile) + '（再点一次打出）"' +
        ' aria-pressed="' + (picked ? 'true' : 'false') + '"' +
        (canDiscard ? '' : ' disabled') + '>' + T.svg(tile) + '</button>';
    }).join('');
    var turn = game.phase !== 'over' && game.phase !== 'claim-human' && game.turn === HUMAN;
    return '<div class="mj-match-me' + (turn ? ' is-turn' : '') +
      (game.winner === HUMAN ? ' is-winner' : '') + '">' +
      '<div class="mj-match-seat-head"><i class="mj-match-avatar" aria-hidden="true">' + info.wind + '</i><b>我</b>' +
      '<span>' + info.wind + '位' + (info.isDealer ? ' · 庄' : '') + '</span>' +
      '<span class="mj-match-count">手牌 ' + tiles.length + ' 张' +
      (game.phase === 'over' ? '' : waitsText()) + '</span></div>' +
      '<div class="mj-match-melds">' + meldsHTML(info.melds) + '</div>' +
      '<p class="mj-match-me-status' + (canDiscard || game.phase === 'claim-human' ? ' is-ready' : '') + '"><span class="mj-live-dot" aria-hidden="true"></span>' + statusText() + '</p>' +
      '<div class="mj-match-hand" aria-label="我的手牌">' + hand + '</div>' +
      '<p class="mj-hand-scroll-note">左右滑动查看手牌</p>' +
      '<div class="mj-match-actions mj-match-me-actions" id="mj-match-actions">' + actionsHTML() + '</div>' +
      '<div class="mj-match-discards" aria-label="我的弃牌">' + discardsHTML(info.discards, HUMAN) + '</div>' +
      '</div>';
  }

  function resultText() {
    if (!game.winInfo) return '';
    if (game.winInfo.draw) return '流局';
    return M.NAMES[game.winner] + (game.winInfo.selfDraw ? ' 自摸' : ' 胡牌');
  }

  function centerHTML() {
    var turn = game.phase === 'over'
      ? '本局结束'
      : game.phase === 'claim-human'
        ? '等你决定'
        : M.NAMES[game.turn] + '（' + M.windName(game, game.turn) + '位）';
    var last = game.lastDiscard
      ? '<div class="mj-match-last"><span>' + M.NAMES[game.lastDiscard.player] + ' 打出</span>' +
      tileSpan(game.lastDiscard.tile) + '</div>'
      : '';
    var result = game.phase === 'over'
      ? '<div class="mj-match-result">' + resultText() + '</div>'
      : '';
    return diceHTML() +
      '<div class="mj-match-wall"><span>牌墙</span><b>' + game.wall.length + '</b><span>张</span></div>' +
      '<div class="mj-match-turn">' + turn + '</div>' + last + result;
  }

  function boardHTML() {
    return seatHTML(2, 'top') +
      seatHTML(3, 'left') +
      '<div class="mj-match-center">' + centerHTML() + '</div>' +
      seatHTML(1, 'right') +
      meHTML();
  }

  function statusText() {
    if (!game) return '';
    if (dice && dice.rolling) return '庄家摇骰子…';
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
        '，你可以' + kinds.join('、') + '，也可以过。';
    }
    if (game.turn === HUMAN) {
      return game.lastDraw != null
        ? '你的回合，摸到 ' + T.name(game.lastDraw) + '，点手牌打出。'
        : '你的回合，请点手牌打出。';
    }
    return '等待 ' + M.NAMES[game.turn] + ' 出牌…';
  }

  function actionsHTML() {
    if (!game) return '';
    if (dice && dice.rolling) {
      return '<span class="mj-match-hint">等庄家摇完骰子…</span>';
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
        self += '<span class="mj-match-hint">先选一张手牌</span>';
      }
      if (M.canSelfWin(game)) {
        self += '<button type="button" class="mj-btn mj-btn-primary" data-self="win">自摸胡</button>';
      }
      M.selfKongOptions(game).forEach(function (option, index) {
        self += '<button type="button" class="mj-btn" data-kong="' + index + '">' +
          (option.type === 'concealed' ? '暗杠 ' : '补杠 ') + T.name(option.tile) + '</button>';
      });
      return self || '<span class="mj-match-hint">点手牌出牌</span>';
    }
    return '<span class="mj-match-hint">等待 ' + M.NAMES[game.turn] + '…</span>';
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
    return game.log.slice(-12).reverse().map(function (text) {
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
    if (game.phase === 'over') applySession();
    board.innerHTML = boardHTML();
    var nextRack = board.querySelector('.mj-match-hand');
    if (nextRack) nextRack.scrollLeft = rackScroll;
    var focusTarget = focusIndex != null ? board.querySelector('[data-hand-index="' + focusIndex + '"]:not(:disabled)') :
      focusAction ? board.querySelector('[data-match="' + focusAction + '"]:not(:disabled)') : null;
    if (focusTarget) focusTarget.focus({ preventScroll: true });
    else if (hadBoardFocus) board.focus({ preventScroll: true });
    $('mj-match-status').textContent = statusText();
    $('mj-match-chips').innerHTML = chipsHTML();
    $('mj-match-log').innerHTML = logHTML();
    $('mj-match-hand-no').textContent = '第 ' +
      (session.hands + (game.phase === 'over' ? 0 : 1)) + ' 把';
    $('mj-match-next').textContent = game.phase === 'over' ? '再来一局' : '重开本局';
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

  function activate() {
    if (!game) {
      startHand(0);
      return;
    }
    render();
    continueRoll();
    schedule();
  }

  function deactivate() {
    clearTimeout(timer);
    clearInterval(rollTimer);
    rollTimer = null;
  }

  function discardSelected() {
    if (!isActive() || !game || !selected || game.phase !== 'discard' || game.turn !== HUMAN || (dice && dice.rolling)) return;
    var index = selected.index;
    selected = null;
    if (M.discard(game, index)) afterHuman();
  }

  function handleAction(button) {
    if (!game) return;
    if (button.dataset.match === 'next') {
      nextHand();
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
      if (M.declareSelfWin(game)) afterHuman();
      return;
    }
    if (button.dataset.kong != null) {
      selected = null;
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
      if (M.humanClaim(game, 'chi', tiles)) afterHuman();
      return;
    }
    if (button.dataset.claim) {
      if (M.humanClaim(game, button.dataset.claim)) afterHuman();
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
