/*! 麻雀学堂 · 界面 */
(function () {
  'use strict';

  var T = window.MahjongTiles;
  var R = window.MahjongRules;
  var D = window.MahjongData;

  var $ = function (id) { return document.getElementById(id); };
  var state = {
    hand: [],
    style: 'ghost',
    tab: 'learn',
    drill: { mode: 'win', hand: [], answer: null, revealed: false, right: 0, wrong: 0, streak: 0 }
  };

  function tileButton(id, className, label) {
    return '<button type="button" class="mj-tile ' + className + '" data-tile="' + id + '" aria-label="' +
      (label || T.name(id)) + '">' + T.svg(id) + '</button>';
  }

  /* ================= 标签切换 ================= */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.mj-tab'));
  function activate(name) {
    if (state.tab === 'match' && name !== 'match' && window.MahjongMatchUI) window.MahjongMatchUI.deactivate();
    state.tab = name;
    $('mj-style-field').hidden = name === 'match';
    tabs.forEach(function (tab) {
      var on = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      var panel = $('mj-panel-' + tab.dataset.tab);
      if (panel) panel.hidden = !on;
    });
    if (name === 'draw') renderDraw();
    if (name === 'chips') {
      renderChips();
      updateChipBadge();
    } else {
      renderScore();
    }
    if (name === 'match' && window.MahjongMatchUI) window.MahjongMatchUI.activate();
  }
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () { activate(tab.dataset.tab); });
    tab.addEventListener('keydown', function (event) {
      var index = tabs.indexOf(tab);
      if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') index = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = tabs.length - 1;
      else return;
      event.preventDefault();
      activate(tabs[index].dataset.tab);
      tabs[index].focus({ preventScroll: true });
    });
  });
  document.querySelectorAll('[data-go]').forEach(function (button) {
    button.addEventListener('click', function () {
      activate(button.dataset.go);
      $('tab-' + button.dataset.go).focus({ preventScroll: true });
      document.querySelector('.mj-tabs').scrollIntoView({ block: 'start' });
    });
  });

  /* ================= 课程 ================= */
  function renderLessons() {
    $('mj-lessons').innerHTML = D.lessons.map(function (lesson, i) {
      var tiles = lesson.tiles.length
        ? '<div class="mj-lesson-tiles">' + lesson.tiles.map(function (id) {
          return '<span class="mj-tile mj-tile-xs">' + T.svg(id) + '</span>';
        }).join('') + '</div>'
        : '';
      return '<details class="mj-lesson"' + (i === 0 ? ' open' : '') + '>' +
        '<summary>' +
        '<span class="mj-lesson-no">' + lesson.no + '</span>' +
        '<span class="mj-lesson-title">' + lesson.title + '</span>' +
        '<span class="mj-lesson-sum">' + lesson.summary + '</span>' +
        '</summary>' +
        '<div class="mj-lesson-body">' + lesson.body + tiles + '</div>' +
        '</details>';
    }).join('');

    $('mj-glossary').innerHTML = D.glossary.map(function (pair) {
      return '<div><dt>' + pair[0] + '</dt><dd>' + pair[1] + '</dd></div>';
    }).join('');
  }

  function renderFanTable() {
    $('mj-fan-table').innerHTML = D.fanTable.map(function (row) {
      return '<div class="mj-fan-item"><span class="n">' + row.name + '</span><span class="d">' + row.note + '</span><span class="v">' + row.fan + '</span></div>';
    }).join('');
  }

  /* ================= 拿牌 ================= */
  var PIPS = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]
  };
  function dieHTML(value) {
    var on = PIPS[value] || [];
    var cells = '';
    for (var i = 0; i < 9; i++) cells += '<i class="' + (on.indexOf(i) >= 0 ? '' : 'off') + '"></i>';
    return '<div class="mj-die" aria-label="' + value + ' 点">' + cells + '</div>';
  }

  function buildDice() {
    var opts = '';
    for (var i = 1; i <= 6; i++) opts += '<option value="' + i + '"' + (i === 3 ? ' selected' : '') + '>' + i + '</option>';
    $('mj-die1').innerHTML = opts;
    $('mj-die2').innerHTML = opts;
    var opts3 = '<option value="0">不掷</option>';
    for (var j = 1; j <= 6; j++) opts3 += '<option value="' + j + '">' + j + '</option>';
    $('mj-die3').innerHTML = opts3;
  }

  function renderDraw() {
    if (!$('mj-draw-steps')) return;
    var mode = $('mj-mode').value;
    var d1 = +$('mj-die1').value, d2 = +$('mj-die2').value, d3 = +$('mj-die3').value;
    var me = +$('mj-me').value, dealer = +$('mj-dealer').value;
    var info = R.openInfo({ mode: mode, d1: d1, d2: d2, d3: d3, me: me, dealer: dealer, stackMode: $('mj-stack-mode').value });
    var rel = ['我', '下家', '对家', '上家'];

    $('mj-die3').disabled = mode !== 'sum';
    $('mj-dice').innerHTML = mode === 'sum'
      ? dieHTML(d1) + dieHTML(d2) + (d3 ? dieHTML(d3) : '')
      : dieHTML(d1) + dieHTML(d2);
    $('mj-dice-label').textContent = mode === 'sum' ? '合计 ' + info.persons + ' 点' : '大 ' + info.big + ' · 小 ' + info.small;

    ['top', 'left', 'right', 'bottom'].forEach(function (where) {
      var offset = { bottom: 0, right: 1, top: 2, left: 3 }[where];
      var wind = (me + offset) % 4;
      var seat = document.querySelector('.mj-seat-' + where);
      if (!seat) return;
      seat.classList.toggle('is-open', wind === info.openWind);
      seat.classList.toggle('is-dealer', wind === dealer);
      seat.classList.toggle('is-me', wind === me);
      seat.querySelector('.mj-seat-name').textContent = rel[offset];
      var meta = R.WINDS[wind] + '位';
      if (wind === dealer) meta += ' · 庄';
      if (wind === me) meta += ' · 你';
      seat.querySelector('.mj-seat-meta').textContent = meta;
    });

    var openRel = rel[info.openOffset];
    var first;
    if (mode === 'sum') {
      first = '<strong>' + info.persons + ' 点</strong>：从庄家（' + R.WINDS[dealer] + '位）起，逆时针数 ' + info.persons +
        ' 位，落到<strong>' + openRel + '</strong>（' + info.openWindName + '位）。';
    } else {
      var rule = mode === 'smallPerson' ? '小数数人、大数数墩' : '大数数人、小数数墩';
      first = '<strong>大 ' + info.big + '、小 ' + info.small + '</strong>（' + rule + '）：用 ' + info.persons +
        ' 从庄家（' + R.WINDS[dealer] + '位）起逆时针数 ' + info.persons + ' 位，落到<strong>' + openRel + '</strong>（' + info.openWindName + '位）。';
    }

    var take;
    if ($('mj-stack-mode').value === 'same') {
      take = '从 <strong>' + openRel + '</strong>（' + info.openWindName + '位）牌墙<strong>右端</strong>数 <strong>' + info.stacks +
        ' 墩</strong>，<strong>从第 ' + info.stacks + ' 墩开始拿牌</strong>。';
    } else {
      take = '从 <strong>' + openRel + '</strong>（' + info.openWindName + '位）牌墙<strong>右端</strong>数 <strong>' + info.stacks +
        ' 墩</strong>，数到的那墩只作记号，<strong>从第 ' + info.startStack + ' 墩开始拿牌</strong>。';
    }
    if (info.wrapped) {
      take += '（已超过 17 墩，绕到 ' + info.wallOwnerName + '位的牌墙第 ' + info.wallStack + ' 墩。）';
    }

    var tail;
    if (state.style === 'flower') tail = '摸到花牌就摊出来，从<strong>牌尾</strong>补一张，直到手上没有花。';
    else if (state.style === 'ghost') tail = '这桌打<strong>鬼牌</strong>：摸到鬼牌不用补花，直接留在手里当万能牌。';
    else tail = '这桌没有花牌也没有鬼牌，摸到什么打什么。';

    $('mj-draw-steps').innerHTML =
      '<li class="mj-step">' + first + '</li>' +
      '<li class="mj-step">' + take + '</li>' +
      '<li class="mj-step">逆时针每人一次拿 <strong>4 张</strong>（2 墩），拿三轮，各 12 张。</li>' +
      '<li class="mj-step"><strong>跳牌</strong>：庄家再拿 2 张（共 14 张），其余三家各拿 1 张（各 13 张）。</li>' +
      '<li class="mj-step">' + tail + '</li>';
  }

  ['mj-mode', 'mj-die1', 'mj-die2', 'mj-die3', 'mj-me', 'mj-dealer', 'mj-stack-mode'].forEach(function (id) {
    $(id).addEventListener('change', renderDraw);
  });

  /* ================= 算番 ================= */
  var PICKER_ROWS = [
    { label: '万', ids: range(0, 9) },
    { label: '筒', ids: range(9, 18) },
    { label: '索', ids: range(18, 27) },
    { label: '风', ids: range(27, 31) },
    { label: '箭', ids: range(31, 34) }
  ];
  function range(a, b) { var out = []; for (var i = a; i < b; i++) out.push(i); return out; }

  function buildPicker() {
    $('mj-picker').innerHTML = PICKER_ROWS.map(function (row) {
      return '<div class="mj-picker-row"><span class="mj-picker-label">' + row.label + '</span>' +
        row.ids.map(function (id) { return tileButton(id, 'mj-tile-sm'); }).join('') + '</div>';
    }).join('');
  }

  function buildFlowerSelects() {
    var opts = '';
    for (var i = 0; i <= 8; i++) opts += '<option value="' + i + '">' + i + ' 张</option>';
    $('mj-flowers').innerHTML = opts;
    var opts2 = '';
    for (var j = 0; j <= 4; j++) opts2 += '<option value="' + j + '">' + j + ' 张</option>';
    $('mj-own-flowers').innerHTML = opts2;
  }

  function ghostId() {
    return state.style === 'ghost' ? +$('mj-ghost').value : -1;
  }

  function flags() {
    return {
      selfDraw: $('mj-f-selfdraw').checked,
      closed: $('mj-f-closed').checked,
      kongBloom: $('mj-f-kong').checked,
      lastTile: $('mj-f-last').checked,
      robbing: $('mj-f-robbing').checked,
      heaven: $('mj-f-heaven').checked,
      earth: $('mj-f-earth').checked,
      dealer: $('mj-f-dealer').checked,
      ownFlowerFan: $('mj-f-own-flower').checked,
      roundWind: +$('mj-round-wind').value,
      seatWind: +$('mj-seat-wind').value,
      flowers: state.style === 'flower' ? +$('mj-flowers').value : 0,
      ownFlowers: state.style === 'flower' ? +$('mj-own-flowers').value : 0,
      ghostId: ghostId()
    };
  }

  function settleRules() {
    return {
      minFan: +$('mj-min-fan').value,
      maxFan: +$('mj-max-fan').value,
      mode: $('mj-pay-mode').value,
      base: +$('mj-base').value || 0,
      perFan: +$('mj-per-fan').value || 0,
      dealerBonus: $('mj-dealer-bonus').checked
    };
  }

  function renderRack() {
    var rack = $('mj-rack');
    var count = $('mj-count');
    count.textContent = state.hand.length + ' / 14 张' + (state.hand.length === 15 ? '（含杠）' : '');
    if (!state.hand.length) {
      rack.innerHTML = '<span class="mj-rack-empty">点上面的牌，摆进手牌</span>';
      rack.classList.remove('is-win');
      return;
    }
    var gid = ghostId();
    rack.innerHTML = state.hand.map(function (id, index) {
      var isGhost = id === gid;
      return '<button type="button" class="mj-tile mj-tile-in-rack' + (isGhost ? ' mj-tile-ghost' : '') +
        '" data-index="' + index + '" aria-label="移除 ' + T.name(id) + (isGhost ? '（鬼牌）' : '') + '">' +
        T.svg(id) + '</button>';
    }).join('');
  }

  function addTile(id) {
    if (state.hand.length >= 15) return;
    state.hand.push(id);
    state.hand.sort(function (a, b) { return a - b; });
    renderRack();
    renderScore();
  }

  function renderLedger(result, fl, rules) {
    var ledger = $('mj-ledger');
    var seal = $('mj-seal');
    var sealText = $('mj-seal-text');
    var sealNote = $('mj-seal-note');
    var rack = $('mj-rack');
    seal.classList.remove('is-win', 'is-fail');
    rack.classList.remove('is-win');

    if (result.status === 'waiting') {
      sealText.textContent = '听';
      sealNote.textContent = '13 张，等一张';
      var waits = result.waits || [];
      var waitsHTML = waits.length
        ? waits.map(function (id) {
          return '<button type="button" class="mj-tile mj-tile-xs" data-wait="' + id + '" aria-label="加入 ' + T.name(id) + '">' + T.svg(id) + '</button>';
        }).join('')
        : '<span class="mj-rack-empty">这手牌还没成形，先把牌点齐</span>';
      ledger.innerHTML = '<h3>听牌 <span>13 张</span></h3>' +
        '<p class="mj-ledger-note" style="margin:0 0 10px;color:#6a5f4c">再摸到下面任意一张就能胡（点它可以加进手牌）：</p>' +
        '<div class="mj-split" style="margin-top:0">' + waitsHTML + '</div>' +
        '<p class="mj-ledger-note">听牌 ' + waits.length + ' 种' +
        (result.ghostId >= 0 ? '；已按鬼牌规则计算（鬼牌只能补顺子或刻子，不能做眼）' : '') + '</p>';
      return;
    }

    if (result.status === 'invalid') {
      sealText.textContent = '未成胡';
      seal.classList.add('is-fail');
      sealNote.textContent = result.reason || '还不成牌';
      ledger.innerHTML = '<h3>番种账本 <span>' + state.hand.length + ' 张</span></h3>' +
        '<p class="mj-ledger-empty">' + (result.reason || '这手牌拆不成「四组 + 一对」，检查一下是不是少点了牌，或者把杠点成了 4 张。') + '</p>';
      return;
    }

    var enough = result.fan >= rules.minFan;
    var capped = Math.min(result.fan, rules.maxFan);
    sealText.textContent = enough ? '胡' : '不够';
    seal.classList.add(enough ? 'is-win' : 'is-fail');
    if (enough) rack.classList.add('is-win');
    sealNote.textContent = enough
      ? '共 ' + result.fan + ' 番' + (result.fan > rules.maxFan ? '，按 ' + rules.maxFan + ' 番封顶' : '')
      : '够 ' + rules.minFan + ' 番才能胡，还差 ' + (rules.minFan - result.fan) + ' 番';

    var rows = result.patterns.map(function (p) {
      return '<div class="mj-fan-row"><span>' + p.name + '</span><span class="mj-dots"></span><span class="mj-fan-val">' + p.fan + ' 番</span></div>';
    }).join('');
    if (result.ghostCount > 0) {
      rows += '<div class="mj-fan-row"><span>鬼牌 ×' + result.ghostCount + '</span><span class="mj-dots"></span><span class="mj-fan-val">万能牌 · 不计番</span></div>';
    }

    var splitHTML = '';
    if (result.decomp) {
      splitHTML = '<p class="mj-ledger-note" style="margin:14px 0 6px;color:#6a5f4c">拆牌</p><div class="mj-split">';
      result.decomp.sets.forEach(function (set) {
        splitHTML += '<div class="mj-split-group">' + set.map(function (id) {
          return '<span class="mj-tile mj-tile-xs">' + T.svg(id) + '</span>';
        }).join('') + '</div>';
      });
      splitHTML += '<div class="mj-split-group">' + result.decomp.pair.map(function (id) {
        return '<span class="mj-tile mj-tile-xs">' + T.svg(id) + '</span>';
      }).join('') + '</div></div>';
    }

    var pay = R.settle(result.fan, fl, rules);
    var payHTML;
    if (!enough) {
      payHTML = '<div class="mj-pay-row"><span>未达起胡番数，不能胡</span><b>—</b></div>';
    } else if (pay.selfDraw) {
      payHTML = '<div class="mj-pay-row"><span>自摸：三家各付</span><b>' + pay.value + ' 分</b></div>' +
        '<div class="mj-pay-row"><span>收入合计</span><b>' + pay.total + ' 分</b></div>';
    } else {
      payHTML = '<div class="mj-pay-row"><span>出铳：放炮那家付</span><b>' + pay.value + ' 分</b></div>';
    }

    ledger.innerHTML = '<h3>番种账本 <span>上限 ' + (rules.maxFan === 99 ? '不封顶' : rules.maxFan + ' 番') + '</span></h3>' +
      rows +
      '<div class="mj-fan-total"><span>合计</span><b>' + result.fan + ' 番</b></div>' +
      '<div class="mj-fan-sub"><span>封顶后结算</span><b>' + capped + ' 番</b></div>' +
      splitHTML +
      '<p class="mj-ledger-note" style="margin:16px 0 6px;color:#6a5f4c">结算</p>' + payHTML +
      '<p class="mj-ledger-note">按「' + (pay.mode === 'double' ? '底分 × 2 的番数次方' : '底分 + 番数 × 每番') + '」计算' +
      (pay.dealer ? '，庄家已加半' : '') + '。</p>';
  }

  function renderScore() {
    if (!$('mj-ledger')) return;
    var fl = flags();
    var rules = settleRules();
    var result = R.analyze(state.hand, fl);
    renderLedger(result, fl, rules);
    var badge = $('mj-badge');
    var styleName = state.style === 'ghost' ? '鬼牌' : state.style === 'flower' ? '花牌' : '无花无鬼';
    badge.textContent = styleName + ' · ' + (rules.minFan === 0 ? '鸡胡' : rules.minFan + ' 番起胡') +
      ' · 封顶 ' + (rules.maxFan === 99 ? '不封顶' : rules.maxFan + ' 番');
  }

  function setStyle(style) {
    state.style = style;
    $('mj-style').value = style;
    $('mj-ghost-field').hidden = style !== 'ghost';
    $('mj-flower-field').hidden = style !== 'flower';
    $('mj-own-flower-field').hidden = style !== 'flower';
    $('mj-own-flower-check').hidden = style !== 'flower';
    $('mj-ghost-note').hidden = style !== 'ghost';
    if (style !== 'flower') {
      $('mj-flowers').value = '0';
      $('mj-own-flowers').value = '0';
    }
    if (chip.maTiles.length > maCap()) chip.maTiles = chip.maTiles.slice(0, maCap());
    renderRack();
    renderScore();
    renderDraw();
    renderChips();
    if (state.tab === 'match' && window.MahjongMatchUI) window.MahjongMatchUI.updateBadge();
  }

  $('mj-picker').addEventListener('click', function (event) {
    var btn = event.target.closest('button[data-tile]');
    if (!btn) return;
    addTile(+btn.dataset.tile);
  });

  $('mj-rack').addEventListener('click', function (event) {
    var btn = event.target.closest('button[data-index]');
    if (!btn) return;
    state.hand.splice(+btn.dataset.index, 1);
    renderRack();
    renderScore();
  });

  $('mj-ledger').addEventListener('click', function (event) {
    var btn = event.target.closest('button[data-wait]');
    if (!btn) return;
    addTile(+btn.dataset.wait);
  });

  $('mj-undo').addEventListener('click', function () {
    state.hand.pop();
    renderRack();
    renderScore();
  });
  $('mj-clear').addEventListener('click', function () {
    state.hand = [];
    renderRack();
    renderScore();
  });

  ['mj-ghost', 'mj-round-wind', 'mj-seat-wind', 'mj-flowers', 'mj-own-flowers',
    'mj-f-selfdraw', 'mj-f-closed', 'mj-f-kong', 'mj-f-last', 'mj-f-robbing',
    'mj-f-heaven', 'mj-f-earth', 'mj-f-dealer', 'mj-f-own-flower',
    'mj-min-fan', 'mj-max-fan', 'mj-pay-mode', 'mj-base', 'mj-per-fan', 'mj-dealer-bonus'
  ].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('change', function () { renderRack(); renderScore(); });
    if (el.type === 'number') el.addEventListener('input', renderScore);
  });

  /* ================= 筹码 ================= */
  var PLAYERS = ['我', '下家', '对家', '上家'];
  var NUM_TEXT = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var chip = {
    dealer: 0,
    winner: 0,
    method: 'self',
    discarder: 1,
    maTiles: [],
    kongs: [
      { exposed: 0, concealed: 0 },
      { exposed: 0, concealed: 0 },
      { exposed: 0, concealed: 0 },
      { exposed: 0, concealed: 0 }
    ],
    feedings: [
      { to: -1, count: 0 },
      { to: -1, count: 0 },
      { to: -1, count: 0 },
      { to: -1, count: 0 }
    ],
    totals: [0, 0, 0, 0],
    history: [],
    hands: 0,
    recorded: false,
    fresh: true
  };

  function maCap() {
    return state.style === 'ghost' ? 4 : 6;
  }

  function chipRules() {
    function num(id) { return Math.max(0, Math.round(+$(id).value || 0)); }
    return {
      selfDraw: num('mj-chip-pay-self'),
      perMa: num('mj-chip-pay-ma'),
      discard: num('mj-chip-pay-discard'),
      exposed: num('mj-chip-pay-exposed'),
      concealed: num('mj-chip-pay-concealed'),
      feeding: num('mj-chip-pay-feeding')
    };
  }

  function currentChipResult() {
    return R.settleChips({
      dealer: chip.dealer,
      winner: chip.winner,
      selfDraw: chip.method === 'self',
      discarder: chip.discarder,
      maTiles: chip.maTiles,
      kongs: chip.kongs.map(function (kong, player) {
        return { player: player, exposed: kong.exposed, concealed: kong.concealed };
      }),
      feedings: chip.feedings.map(function (feeding, from) {
        return { from: from, to: feeding.to, count: feeding.count };
      }),
      rules: chipRules()
    });
  }

  function randInt(n) { return Math.floor(Math.random() * n); }

  function pickOther(player) {
    var p;
    do { p = randInt(4); } while (p === player);
    return p;
  }

  function emptyKongs() {
    return PLAYERS.map(function () { return { exposed: 0, concealed: 0 }; });
  }

  function emptyFeedings() {
    return PLAYERS.map(function () { return { to: -1, count: 0 }; });
  }

  function drawMa(count) {
    var wall = [];
    for (var id = 0; id < 34; id++) for (var k = 0; k < 4; k++) wall.push(id);
    for (var i = wall.length - 1; i > 0; i--) {
      var j = randInt(i + 1);
      var tmp = wall[i];
      wall[i] = wall[j];
      wall[j] = tmp;
    }
    return wall.slice(0, count);
  }

  function simulateHand() {
    var winner = randInt(4);
    var selfDraw = Math.random() < 0.72;
    var kongs = emptyKongs();
    var feedings = emptyFeedings();
    var events = Math.random() < 0.45 ? 0 : Math.random() < 0.78 ? 1 : 2;
    for (var i = 0; i < events; i++) {
      var p = randInt(4);
      var roll = Math.random();
      if (roll < 0.52) {
        kongs[p].exposed++;
      } else if (roll < 0.82) {
        kongs[p].concealed++;
      } else {
        feedings[p].to = pickOther(p);
        feedings[p].count++;
      }
    }
    return {
      winner: winner,
      selfDraw: selfDraw,
      discarder: selfDraw ? (winner + 1) % 4 : pickOther(winner),
      maTiles: selfDraw ? drawMa(maCap()) : [],
      kongs: kongs,
      feedings: feedings
    };
  }

  function kongSummary(kongs, feedings) {
    var parts = [];
    PLAYERS.forEach(function (name, p) {
      if (kongs[p].exposed) parts.push(name + '公' + kongs[p].exposed);
      if (kongs[p].concealed) parts.push(name + '暗' + kongs[p].concealed);
      if (feedings[p].count > 0 && feedings[p].to >= 0) {
        parts.push(name + '放' + feedings[p].count + '→' + PLAYERS[feedings[p].to]);
      }
    });
    return parts.length ? parts.join(' · ') : '无杠';
  }

  function recordChipHand(result, meta) {
    chip.history.push({
      no: chip.hands + 1,
      dealer: chip.dealer,
      winner: meta.winner,
      selfDraw: !!meta.selfDraw,
      discarder: meta.discarder,
      maHits: result.maHits.length,
      maCount: (meta.maTiles || []).length,
      kongs: kongSummary(meta.kongs, meta.feedings),
      net: result.net.slice()
    });
    chip.totals = chip.totals.map(function (value, i) { return value + result.net[i]; });
    chip.hands++;
    chip.dealer = meta.winner;
  }

  function syncKongInputs() {
    Array.prototype.forEach.call(document.querySelectorAll('#mj-chip-kongs input'), function (el) {
      var p = +el.dataset.player;
      var key = el.dataset.kong;
      el.value = key === 'exposed' ? chip.kongs[p].exposed
        : key === 'concealed' ? chip.kongs[p].concealed
          : chip.feedings[p].count;
    });
    Array.prototype.forEach.call(document.querySelectorAll('#mj-chip-kongs select'), function (el) {
      el.value = String(chip.feedings[+el.dataset.player].to);
    });
  }

  function clampKong(el, value) {
    var out = Math.max(0, Math.min(4, Math.round(value || 0)));
    if (+el.value !== out) el.value = String(out);
    return out;
  }

  function resetChipHandInputs() {
    chip.winner = chip.dealer;
    chip.method = 'self';
    chip.discarder = (chip.winner + 1) % 4;
    chip.maTiles = [];
    chip.kongs = emptyKongs();
    chip.feedings = emptyFeedings();
    $('mj-chip-dealer').value = String(chip.dealer);
    $('mj-chip-winner').value = String(chip.winner);
    $('mj-chip-method').value = chip.method;
    $('mj-chip-discarder').value = String(chip.discarder);
    syncKongInputs();
  }

  function applySimulation(sim) {
    chip.winner = sim.winner;
    chip.method = sim.selfDraw ? 'self' : 'discard';
    chip.discarder = sim.discarder;
    chip.maTiles = sim.maTiles.slice();
    chip.kongs = sim.kongs.map(function (k) { return { exposed: k.exposed, concealed: k.concealed }; });
    chip.feedings = sim.feedings.map(function (f) { return { to: f.to, count: f.count }; });
    $('mj-chip-winner').value = String(chip.winner);
    $('mj-chip-method').value = chip.method;
    $('mj-chip-discarder').value = String(chip.discarder);
    syncKongInputs();
    chip.fresh = false;
    chip.recorded = false;
    $('mj-chip-status').textContent = '随机试算了一把，看看账本；满意就点「记下这局」。';
    renderChips();
  }

  function renderChipHistory() {
    var card = $('mj-chip-history-card');
    if (!card) return;
    card.hidden = chip.history.length === 0;
    $('mj-chip-history-count').textContent = chip.history.length ? chip.history.length + ' 把' : '';
    $('mj-chip-history').innerHTML = chip.history.map(function (h) {
      var net = h.net.map(function (value, i) {
        return PLAYERS[i] + (value > 0 ? '+' : '') + value;
      }).join('  ');
      var how = h.selfDraw
        ? '自摸 · 中 ' + h.maHits + '/' + h.maCount
        : '出铳 · ' + PLAYERS[h.discarder] + '放炮';
      return '<div class="mj-history-row">' +
        '<span class="mj-history-no">#' + h.no + '</span>' +
        '<span class="mj-history-who">' + PLAYERS[h.winner] + ' · ' + R.WINDS[R.windOf(h.winner, h.dealer)] + '位</span>' +
        '<span class="mj-history-how">' + how + '</span>' +
        '<span class="mj-history-kong">' + h.kongs + '</span>' +
        '<span class="mj-history-net">' + net + '</span>' +
        '</div>';
    }).join('');
  }

  function maText(info) {
    return info.numbers.map(function (n) { return NUM_TEXT[n - 1]; }).join('、') +
      ' + ' + info.honors.map(T.name).join('、');
  }

  function tileSpan(id) {
    return '<span class="mj-tile mj-tile-xs">' + T.svg(id) + '</span>';
  }

  function buildChips() {
    var options = PLAYERS.map(function (name, i) {
      return '<option value="' + i + '">' + name + '</option>';
    }).join('');
    ['mj-chip-dealer', 'mj-chip-winner', 'mj-chip-discarder'].forEach(function (id) {
      $(id).innerHTML = options;
    });
    $('mj-chip-dealer').value = String(chip.dealer);
    $('mj-chip-winner').value = String(chip.winner);
    $('mj-chip-discarder').value = String(chip.discarder);

    $('mj-chip-ma-picker').innerHTML = PICKER_ROWS.map(function (row) {
      return '<div class="mj-picker-row"><span class="mj-picker-label">' + row.label + '</span>' +
        row.ids.map(function (id) {
          return '<button type="button" class="mj-tile mj-tile-xs mj-ma-pick" data-ma-tile="' + id +
            '" aria-label="' + T.name(id) + '">' + T.svg(id) + '</button>';
        }).join('') + '</div>';
    }).join('');

    $('mj-chip-kongs').innerHTML = PLAYERS.map(function (name, p) {
      var feeders = '<option value="-1">不记</option>' + PLAYERS.map(function (other, q) {
        return q === p ? '' : '<option value="' + q + '">' + other + '</option>';
      }).join('');
      return '<div class="mj-kong-row">' +
        '<span class="mj-kong-who"><b>' + name + '</b><em data-kong-wind="' + p + '"></em></span>' +
        '<label class="mj-kong-cell"><span>公杠</span><input type="number" min="0" max="4" step="1" value="0" data-kong="exposed" data-player="' + p + '"></label>' +
        '<label class="mj-kong-cell"><span>暗杠</span><input type="number" min="0" max="4" step="1" value="0" data-kong="concealed" data-player="' + p + '"></label>' +
        '<label class="mj-kong-cell"><span>放杠给</span><select data-kong="feedTo" data-player="' + p + '">' + feeders + '</select></label>' +
        '<label class="mj-kong-cell"><span>放几杠</span><input type="number" min="0" max="4" step="1" value="0" data-kong="feeding" data-player="' + p + '"></label>' +
        '</div>';
    }).join('');
  }

  function renderChipSeats() {
    var seats = R.seatsOf(chip.dealer);
    var winnerWind = R.windOf(chip.winner, chip.dealer);
    $('mj-chip-seats').innerHTML = seats.map(function (seat) {
      var info = R.maInfo(seat.wind);
      var tags = [];
      if (seat.wind === 0) tags.push('庄');
      if (seat.wind === winnerWind) tags.push('胡');
      return '<div class="mj-chip-seat' + (seat.wind === winnerWind ? ' is-winner' : '') + '">' +
        '<span class="mj-chip-seat-name">' + PLAYERS[seat.player] + '</span>' +
        '<span class="mj-chip-seat-wind">' + seat.windName + '位' +
        (tags.length ? ' · ' + tags.join(' · ') : '') + '</span>' +
        '<span class="mj-chip-seat-ma">' + maText(info) + '</span>' +
        '</div>';
    }).join('');

    Array.prototype.forEach.call(document.querySelectorAll('[data-kong-wind]'), function (el) {
      var p = +el.getAttribute('data-kong-wind');
      var wind = R.windOf(p, chip.dealer);
      el.textContent = R.WINDS[wind] + '位' + (wind === 0 ? ' · 庄' : '');
    });
  }

  function renderChipMa(result) {
    var selfDraw = chip.method === 'self';
    var cap = maCap();
    if (chip.maTiles.length > cap) chip.maTiles = chip.maTiles.slice(0, cap);
    var wind = R.windOf(chip.winner, chip.dealer);
    var info = R.maInfo(wind);

    $('mj-chip-ma-card').hidden = !selfDraw;
    $('mj-chip-ma-cap').textContent = (state.style === 'ghost' ? '有鬼' : '无鬼') + ' · 抓 ' + cap + ' 张';
    $('mj-chip-ma-rule').textContent = '马跟座位走：这把赢家坐 ' + R.WINDS[wind] + '位，只算 ' + maText(info) + '。';
    $('mj-chip-ma-set').innerHTML = info.numbers.map(function (n) {
      var base = n - 1;
      return '<div class="mj-ma-group"><span class="mj-ma-label">' + NUM_TEXT[n - 1] + '</span>' +
        [base, base + 9, base + 18].map(tileSpan).join('') + '</div>';
    }).join('') + '<div class="mj-ma-group"><span class="mj-ma-label">字</span>' +
      info.honors.map(tileSpan).join('') + '</div>';

    var hits = result.maHits;
    $('mj-chip-ma-count').textContent = chip.maTiles.length + ' / ' + cap + ' 张' +
      (hits.length ? ' · 中 ' + hits.length + ' 只' : '');
    $('mj-chip-ma-drawn').innerHTML = chip.maTiles.length
      ? chip.maTiles.map(function (id, index) {
        var hit = R.maHits([id], wind).length > 0;
        return '<button type="button" class="mj-tile mj-tile-xs mj-ma-drawn-tile' + (hit ? ' is-hit' : '') +
          '" data-ma-index="' + index + '" aria-label="移除 ' + T.name(id) + (hit ? '（中马）' : '') + '">' +
          T.svg(id) + (hit ? '<i class="mj-ma-hit">中</i>' : '') + '</button>';
      }).join('')
      : '<span class="mj-rack-empty">点上面的牌，摆进这把抓到的马</span>';

    if (!selfDraw) {
      $('mj-chip-ma-hits').textContent = '出铳不抓马，这一笔只在胡牌时算。';
    } else if (!chip.maTiles.length) {
      $('mj-chip-ma-hits').textContent = '还没摆马牌。抓满 ' + cap + ' 张，账本会自动算中几只；点牌架上的牌可以拿走。';
    } else if (!hits.length) {
      $('mj-chip-ma-hits').textContent = '这 ' + chip.maTiles.length + ' 张都没中马。';
    } else {
      $('mj-chip-ma-hits').textContent = '中马 ' + hits.length + ' 只：' + hits.map(T.name).join('、') +
        (chip.maTiles.length < cap ? '（还差 ' + (cap - chip.maTiles.length) + ' 张没摆）' : '');
    }

    var full = chip.maTiles.length >= cap;
    var maCounts = {};
    chip.maTiles.forEach(function (tile) { maCounts[tile] = (maCounts[tile] || 0) + 1; });
    Array.prototype.forEach.call(document.querySelectorAll('#mj-chip-ma-picker button[data-ma-tile]'), function (btn) {
      btn.disabled = full || (maCounts[+btn.dataset.maTile] || 0) >= 4;
    });
  }

  function renderChipLedger(result) {
    var ledger = $('mj-chip-ledger');
    var maLine = result.selfDraw
      ? (result.maHits.length
        ? '中 ' + result.maHits.length + ' 只：' + result.maHits.map(T.name).join('、')
        : (chip.maTiles.length ? chip.maTiles.length + ' 张，没中' : '还没抓马'))
      : '出铳不抓马';

    var rows = result.transfers.map(function (t) {
      return '<div class="mj-pay-row"><span>' + PLAYERS[t.from] + ' → ' + PLAYERS[t.to] + ' · ' + t.reason + '</span>' +
        '<b>' + t.amount + '</b></div>';
    }).join('');

    var nets = PLAYERS.map(function (name, i) {
      var value = result.net[i];
      return '<div class="mj-chip-net-row"><span>' + name + '（' + R.WINDS[R.windOf(i, result.dealer)] + '）</span>' +
        '<b class="' + (value > 0 ? 'is-plus' : value < 0 ? 'is-minus' : '') + '">' +
        (value > 0 ? '+' : '') + value + '</b></div>';
    }).join('');

    var uncheckedFeed = chip.feedings.some(function (feeding) {
      return feeding.count > 0 && feeding.to < 0;
    });

    ledger.innerHTML = '<h3>筹码账本 <span>第 ' + (chip.hands + 1) + ' 把 · ' + PLAYERS[result.winner] + ' 胡</span></h3>' +
      '<div class="mj-pay-row"><span>胡法</span><b>' +
      (result.selfDraw ? '自摸 · 三家付' : '出铳 · ' + PLAYERS[chip.discarder] + '付') + '</b></div>' +
      '<div class="mj-pay-row"><span>赢家座位</span><b>' + PLAYERS[result.winner] + ' · ' + R.WINDS[result.winnerWind] + '位</b></div>' +
      '<div class="mj-pay-row"><span>马</span><b>' + maLine + '</b></div>' +
      '<p class="mj-ledger-note" style="margin:16px 0 6px;color:#6a5f4c">每一笔</p>' +
      (rows || '<div class="mj-pay-row"><span>这一把还没有收支</span><b>0</b></div>') +
      '<p class="mj-ledger-note" style="margin:16px 0 6px;color:#6a5f4c">本把净收支</p>' +
      nets +
      (uncheckedFeed ? '<p class="mj-ledger-note">有放杠没选「放杠给」，这笔暂不计账。</p>' : '') +
      '<p class="mj-ledger-note">不算番，只按筹码；点「记下这局」后赢家坐庄，下一把的座位和马跟着换。</p>';
  }

  function renderChipTotals() {
    var totalRows = PLAYERS.map(function (name, i) {
      var value = chip.totals[i];
      return '<div class="mj-chip-total-row"><span>' + name + '</span>' +
        '<b class="' + (value > 0 ? 'is-plus' : value < 0 ? 'is-minus' : '') + '">' +
        (value > 0 ? '+' : '') + value + '</b></div>';
    }).join('');
    $('mj-chip-totals').innerHTML = totalRows;
    $('mj-chip-hand-count').textContent = '第 ' + (chip.hands + 1) + ' 把';
    $('mj-chip-record').disabled = chip.recorded;
  }

  function updateChipBadge() {
    if (state.tab !== 'chips') return;
    var rules = chipRules();
    $('mj-badge').textContent = (state.style === 'ghost' ? '有鬼抓 ' + maCap() + ' 张' : '无鬼抓 ' + maCap() + ' 张') +
      ' · 自摸每家 ' + rules.selfDraw;
  }

  function renderChips() {
    if (!$('mj-chip-seats')) return;
    if (chip.maTiles.length > maCap()) chip.maTiles = chip.maTiles.slice(0, maCap());
    var result = currentChipResult();
    renderChipSeats();
    renderChipMa(result);
    if (chip.fresh) {
      $('mj-chip-ledger').innerHTML = '<h3>筹码账本 <span>第 ' + (chip.hands + 1) + ' 把</span></h3>' +
        '<p class="mj-ledger-empty">' +
        (chip.hands ? '上一把已经记进累计。' : '') +
        '选好这一把的庄家、胡法和杠，再点马牌，这里会列出每一笔。</p>';
    } else {
      renderChipLedger(result);
    }
    renderChipTotals();
    renderChipHistory();
    updateChipBadge();
  }

  function markChipDirty() {
    chip.recorded = false;
    chip.fresh = false;
    $('mj-chip-status').textContent = '';
  }

  $('mj-chip-dealer').addEventListener('change', function () {
    chip.dealer = +this.value;
    markChipDirty();
    renderChips();
  });
  $('mj-chip-winner').addEventListener('change', function () {
    chip.winner = +this.value;
    if (chip.discarder === chip.winner) chip.discarder = (chip.winner + 1) % 4;
    $('mj-chip-discarder').value = String(chip.discarder);
    markChipDirty();
    renderChips();
  });
  $('mj-chip-method').addEventListener('change', function () {
    chip.method = this.value;
    markChipDirty();
    renderChips();
  });
  $('mj-chip-discarder').addEventListener('change', function () {
    chip.discarder = +this.value;
    if (chip.discarder === chip.winner) {
      chip.discarder = (chip.winner + 1) % 4;
      this.value = String(chip.discarder);
    }
    markChipDirty();
    renderChips();
  });

  $('mj-chip-ma-picker').addEventListener('click', function (event) {
    var btn = event.target.closest('button[data-ma-tile]');
    if (!btn || chip.maTiles.length >= maCap()) return;
    var id = +btn.dataset.maTile;
    if (chip.maTiles.filter(function (tile) { return tile === id; }).length >= 4) return;
    chip.maTiles.push(id);
    markChipDirty();
    renderChips();
  });
  $('mj-chip-ma-drawn').addEventListener('click', function (event) {
    var btn = event.target.closest('button[data-ma-index]');
    if (!btn) return;
    chip.maTiles.splice(+btn.dataset.maIndex, 1);
    markChipDirty();
    renderChips();
  });
  $('mj-chip-ma-clear').addEventListener('click', function () {
    chip.maTiles = [];
    markChipDirty();
    renderChips();
  });

  $('mj-chip-kongs').addEventListener('input', function (event) {
    var el = event.target;
    var key = el.dataset.kong;
    var player = +el.dataset.player;
    if (!key) return;
    if (key === 'feedTo') chip.feedings[player].to = +el.value;
    else if (key === 'feeding') chip.feedings[player].count = clampKong(el, +el.value);
    else if (key === 'exposed') chip.kongs[player].exposed = clampKong(el, +el.value);
    else if (key === 'concealed') chip.kongs[player].concealed = clampKong(el, +el.value);
    markChipDirty();
    renderChips();
  });

  ['mj-chip-pay-self', 'mj-chip-pay-ma', 'mj-chip-pay-discard',
    'mj-chip-pay-exposed', 'mj-chip-pay-concealed', 'mj-chip-pay-feeding'].forEach(function (id) {
    $(id).addEventListener('input', renderChips);
  });

  $('mj-chip-record').addEventListener('click', function () {
    if (chip.recorded) return;
    var result = currentChipResult();
    recordChipHand(result, {
      winner: chip.winner,
      selfDraw: chip.method === 'self',
      discarder: chip.discarder,
      maTiles: chip.maTiles,
      kongs: chip.kongs,
      feedings: chip.feedings
    });
    chip.recorded = true;
    chip.fresh = true;
    resetChipHandInputs();
    $('mj-chip-status').textContent = '第 ' + chip.hands + ' 把已记入累计，下一把 ' + PLAYERS[chip.dealer] + ' 坐庄。';
    renderChips();
  });

  $('mj-chip-reset').addEventListener('click', function () {
    chip.totals = [0, 0, 0, 0];
    chip.history = [];
    chip.hands = 0;
    chip.dealer = 0;
    chip.recorded = true;
    chip.fresh = true;
    resetChipHandInputs();
    $('mj-chip-status').textContent = '累计筹码和记账记录已清空。';
    renderChips();
  });

  $('mj-chip-sim-one').addEventListener('click', function () {
    applySimulation(simulateHand());
  });

  $('mj-chip-sim-many').addEventListener('click', function () {
    var runs = 8;
    for (var i = 0; i < runs; i++) {
      var sim = simulateHand();
      var result = R.settleChips({
        dealer: chip.dealer,
        winner: sim.winner,
        selfDraw: sim.selfDraw,
        discarder: sim.discarder,
        maTiles: sim.maTiles,
        kongs: sim.kongs,
        feedings: sim.feedings,
        rules: chipRules()
      });
      recordChipHand(result, sim);
    }
    chip.recorded = true;
    chip.fresh = true;
    resetChipHandInputs();
    $('mj-chip-status').textContent = '随机试算了 ' + runs + ' 把，累计和记账记录已更新。';
    renderChips();
  });

  /* ================= 练习 ================= */
  function makeWinningHand() {
    for (var attempt = 0; attempt < 300; attempt++) {
      var c = new Array(34).fill(4), out = [], ok = true;
      for (var s = 0; s < 4; s++) {
        if (Math.random() < 0.55) {
          var base = Math.floor(Math.random() * 3) * 9 + Math.floor(Math.random() * 7);
          if (c[base] > 0 && c[base + 1] > 0 && c[base + 2] > 0) {
            c[base]--; c[base + 1]--; c[base + 2]--;
            out.push(base, base + 1, base + 2);
          } else { ok = false; break; }
        } else {
          var cands = [];
          for (var i = 0; i < 34; i++) if (c[i] >= 3) cands.push(i);
          if (!cands.length) { ok = false; break; }
          var t = cands[Math.floor(Math.random() * cands.length)];
          c[t] -= 3;
          out.push(t, t, t);
        }
      }
      if (!ok) continue;
      var pairs = [];
      for (var j = 0; j < 34; j++) if (c[j] >= 2) pairs.push(j);
      if (!pairs.length) continue;
      var p = pairs[Math.floor(Math.random() * pairs.length)];
      out.push(p, p);
      return out.sort(function (a, b) { return a - b; });
    }
    return [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 20, 20];
  }

  function draw14() {
    var wall = [];
    for (var id = 0; id < 34; id++) for (var k = 0; k < 4; k++) wall.push(id);
    for (var i = wall.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = wall[i]; wall[i] = wall[j]; wall[j] = tmp;
    }
    return wall.slice(0, 14).sort(function (a, b) { return a - b; });
  }

  function makeLosingHand() {
    for (var attempt = 0; attempt < 400; attempt++) {
      var hand = draw14();
      if (!R.isWin14(hand, -1)) return hand;
    }
    return draw14();
  }

  function renderDrillRack(hand) {
    $('mj-drill-rack').innerHTML = hand.map(function (id) {
      return '<span class="mj-tile mj-tile-sm">' + T.svg(id) + '</span>';
    }).join('');
  }

  function drillFeedback(ok, text, count) {
    var el = $('mj-drill-feedback');
    el.className = 'mj-drill-feedback ' + (ok ? 'is-ok' : 'is-bad');
    el.textContent = text;
    if (count === false) return;
    if (ok) { state.drill.right++; state.drill.streak++; }
    else { state.drill.wrong++; state.drill.streak = 0; }
    $('mj-stat-right').textContent = state.drill.right;
    $('mj-stat-wrong').textContent = state.drill.wrong;
    $('mj-stat-streak').textContent = state.drill.streak;
  }

  function detailOf(hand) {
    var r = R.analyze(hand, { ghostId: -1, selfDraw: false, closed: false, flowers: 0, ownFlowers: 0, roundWind: 0, seatWind: 0, ownFlowerFan: false });
    if (r.status === 'win' && r.decomp) {
      return '拆成：' + r.decomp.sets.map(function (set) {
        return set.map(function (id) { return T.name(id); }).join('');
      }).join(' · ') + ' + 眼 ' + T.name(r.decomp.pair[0]) + '。';
    }
    return '';
  }

  function newDrill() {
    state.drill.revealed = false;
    $('mj-drill-feedback').textContent = '';
    $('mj-drill-feedback').className = 'mj-drill-feedback';
    var type = $('mj-drill-type');
    var actions = $('mj-drill-actions');

    if (Math.random() < 0.5) {
      state.drill.mode = 'win';
      var isWin = Math.random() < 0.5;
      var hand = isWin ? makeWinningHand() : makeLosingHand();
      state.drill.hand = hand;
      state.drill.answer = R.isWin14(hand, -1);
      type.textContent = '判断胡牌 · 这副 14 张能胡吗？';
      renderDrillRack(hand);
      actions.innerHTML = '<button type="button" class="mj-btn mj-btn-primary" data-answer="1">能胡</button>' +
        '<button type="button" class="mj-btn" data-answer="0">不能胡</button>';
    } else {
      state.drill.mode = 'wait';
      var win = makeWinningHand();
      var copy = win.slice();
      copy.splice(Math.floor(Math.random() * 14), 1);
      state.drill.hand = copy;
      state.drill.answer = R.waitsOf(copy, -1);
      type.textContent = '听牌练习 · 这 13 张听哪些牌？（可多选）';
      renderDrillRack(copy);
      actions.innerHTML = '<div class="mj-picker" style="width:100%">' + PICKER_ROWS.map(function (row) {
        return '<div class="mj-picker-row"><span class="mj-picker-label">' + row.label + '</span>' +
          row.ids.map(function (id) {
            return '<button type="button" class="mj-tile mj-tile-xs mj-pick" data-pick-tile="' + id +
              '" aria-pressed="false" aria-label="' + T.name(id) + '">' + T.svg(id) + '</button>';
          }).join('') + '</div>';
      }).join('') + '</div>' +
        '<button type="button" class="mj-btn mj-btn-primary" id="mj-check-wait">提交听牌</button>';
    }
  }

  $('mj-drill-new').addEventListener('click', newDrill);
  $('mj-drill-answer').addEventListener('click', function () {
    if (state.drill.revealed) return;
    state.drill.revealed = true;
    if (state.drill.mode === 'win') {
      drillFeedback(true, state.drill.answer
        ? '能胡。' + detailOf(state.drill.hand)
        : '不能胡：这 14 张拆不出「四组 + 一对」，也不是七对或十三幺。', false);
    } else {
      drillFeedback(true, '听：' + state.drill.answer.map(T.name).join('、'), false);
    }
    $('mj-drill-feedback').className = 'mj-drill-feedback';
  });

  $('mj-drill-actions').addEventListener('click', function (event) {
    var pick = event.target.closest('.mj-pick');
    if (pick) {
      var on = pick.getAttribute('aria-pressed') === 'true';
      pick.setAttribute('aria-pressed', on ? 'false' : 'true');
      pick.classList.toggle('is-picked', !on);
      return;
    }
    if (event.target.closest('#mj-check-wait')) {
      var chosen = Array.prototype.slice.call(document.querySelectorAll('.mj-pick[aria-pressed="true"]'))
        .map(function (btn) { return +btn.dataset.pickTile; })
        .sort(function (a, b) { return a - b; });
      if (!chosen.length) { drillFeedback(false, '先点选你认为是听的牌。', false); return; }
      var answer = state.drill.answer.slice().sort(function (a, b) { return a - b; });
      var same = chosen.length === answer.length && chosen.every(function (v, i) { return v === answer[i]; });
      state.drill.revealed = true;
      drillFeedback(same, same ? '全对，听 ' + answer.map(T.name).join('、') : '不对。正确听牌：' + answer.map(T.name).join('、'));
      return;
    }
    var answerBtn = event.target.closest('button[data-answer]');
    if (answerBtn) {
      if (state.drill.revealed) return;
      state.drill.revealed = true;
      var picked = answerBtn.dataset.answer === '1';
      var correct = picked === state.drill.answer;
      drillFeedback(correct, (correct ? '答对了。' : '答错了。') +
        (state.drill.answer ? '这副牌能胡。' : '这副牌不能胡。') +
        (state.drill.answer ? detailOf(state.drill.hand) : ''));
    }
  });

  /* ================= 启动 ================= */
  $('mj-welcome-art').innerHTML = '<div class="mj-art-ring"></div><div class="mj-art-plinth"></div>' +
    [18, 32, 31].map(function (id) {
      return '<span class="mj-tile mj-art-tile">' + T.svg(id) + '</span>';
    }).join('') + '<p class="mj-art-caption">一索 · 发财 · 红中</p>';
  renderLessons();
  renderFanTable();
  buildDice();
  buildPicker();
  buildFlowerSelects();
  buildChips();
  $('mj-style').addEventListener('change', function () { setStyle($('mj-style').value); });
  setStyle('ghost');
  renderDraw();
  newDrill();
})();
