/*!
 * 麻雀学堂 · 规则引擎
 * 广东牌（旧章口径）胡牌判断、听牌计算、番种结算，支持鬼牌（百搭）。
 * 不依赖 DOM，可在 Node 中直接测试。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MahjongRules = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var NUM_CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var SUIT_NAME = ['万', '筒', '索'];
  var HONOR = ['东', '南', '西', '北', '中', '发', '白'];
  var WINDS = ['东', '南', '西', '北'];
  var ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  var GREEN_IDS = [19, 20, 21, 23, 25, 32];

  function name(id) {
    if (id < 27) return NUM_CN[id % 9] + SUIT_NAME[Math.floor(id / 9)];
    return HONOR[id - 27];
  }
  function countsOf(hand) {
    var c = new Array(34).fill(0);
    for (var i = 0; i < hand.length; i++) c[hand[i]]++;
    return c;
  }
  function empty(c) {
    for (var i = 0; i < 34; i++) if (c[i] !== 0) return false;
    return true;
  }

  /* ---------------- 普通牌型 ---------------- */
  function walk(c, sets, out, pair) {
    if (sets.length === 4) {
      if (empty(c)) out.push({ sets: sets.map(function (s) { return s.slice(); }), pair: pair.slice() });
      return;
    }
    var i = 0;
    while (i < 34 && c[i] === 0) i++;
    if (i === 34) return;
    if (c[i] >= 3) {
      c[i] -= 3;
      sets.push([i, i, i]);
      walk(c, sets, out, pair);
      sets.pop();
      c[i] += 3;
    }
    if (i < 27 && (i % 9) <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      sets.push([i, i + 1, i + 2]);
      walk(c, sets, out, pair);
      sets.pop();
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
  }
  function decompose(c0) {
    var out = [];
    for (var p = 0; p < 34; p++) {
      if (c0[p] < 2) continue;
      var c = c0.slice();
      c[p] -= 2;
      walk(c, [], out, [p, p]);
      if (out.length > 400) break;
    }
    return out;
  }

  /* ---------------- 鬼牌牌型 ---------------- */
  // 鬼牌只能补进顺子或刻子；不能做眼、不能碰杠。
  function walkGhost(c, ghosts, sets, out, pair) {
    if (sets.length === 4) {
      if (empty(c) && ghosts === 0) out.push({ sets: sets.map(function (s) { return s.slice(); }), pair: pair.slice() });
      return;
    }
    var i = 0;
    while (i < 34 && c[i] === 0) i++;
    if (i === 34) return;

    // 刻子：用 1~3 张真牌，其余用鬼
    var maxReal = Math.min(3, c[i]);
    for (var use = maxReal; use >= 1; use--) {
      var need = 3 - use;
      if (need > ghosts) continue;
      c[i] -= use; ghosts -= need;
      sets.push([i, i, i]);
      walkGhost(c, ghosts, sets, out, pair);
      sets.pop();
      c[i] += use; ghosts += need;
    }

    // 顺子：以 i 为其中一张，另外两张可以是真牌或鬼
    if (i < 27) {
      var suit = Math.floor(i / 9), num = i % 9;
      for (var start = num - 2; start <= num; start++) {
        if (start < 0 || start > 6) continue;
        var t0 = suit * 9 + start, t1 = t0 + 1, t2 = t0 + 2;
        var pos = i === t0 ? 0 : (i === t1 ? 1 : 2);
        var others = pos === 0 ? [t1, t2] : (pos === 1 ? [t0, t2] : [t0, t1]);
        for (var mask = 0; mask < 4; mask++) {
          var ghostA = (mask & 1) === 1, ghostB = (mask & 2) === 2;
          if (!ghostA && c[others[0]] === 0) continue;
          if (!ghostB && c[others[1]] === 0) continue;
          var g = (ghostA ? 1 : 0) + (ghostB ? 1 : 0);
          if (g > ghosts) continue;
          c[i]--;
          if (!ghostA) c[others[0]]--;
          if (!ghostB) c[others[1]]--;
          ghosts -= g;
          sets.push([t0, t1, t2]);
          walkGhost(c, ghosts, sets, out, pair);
          sets.pop();
          ghosts += g;
          if (!ghostA) c[others[0]]++;
          if (!ghostB) c[others[1]]++;
          c[i]++;
        }
      }
    }
  }
  function decomposeGhosts(c0, ghosts) {
    var out = [];
    for (var p = 0; p < 34; p++) {
      if (c0[p] < 2) continue;
      var c = c0.slice();
      c[p] -= 2;
      walkGhost(c, ghosts, [], out, [p, p]);
      if (out.length > 400) break;
    }
    return out;
  }

  /* ---------------- 特殊牌型 ---------------- */
  function isSevenPairs(c) {
    var pairs = 0;
    for (var i = 0; i < 34; i++) {
      if (c[i] % 2 !== 0) return false;
      pairs += c[i] / 2;
    }
    return pairs === 7;
  }
  function isThirteenOrphans(c) {
    var total = 0, dup = 0;
    for (var i = 0; i < 34; i++) total += c[i];
    if (total !== 14) return false;
    for (var k = 0; k < ORPHANS.length; k++) {
      var v = c[ORPHANS[k]];
      if (v < 1) return false;
      if (v > 1) dup += v - 1;
    }
    for (var j = 0; j < 34; j++) if (ORPHANS.indexOf(j) < 0 && c[j] > 0) return false;
    return dup === 1;
  }
  function isNineGates(c) {
    for (var s = 0; s < 3; s++) {
      var base = [3, 1, 1, 1, 1, 1, 1, 1, 3];
      var extra = 0, ok = true;
      for (var n = 0; n < 9; n++) {
        var v = c[s * 9 + n];
        if (v < base[n]) { ok = false; break; }
        extra += v - base[n];
      }
      if (!ok || extra !== 1) continue;
      var othersZero = true;
      for (var s2 = 0; s2 < 3; s2++) {
        if (s2 === s) continue;
        for (var n2 = 0; n2 < 9; n2++) if (c[s2 * 9 + n2] > 0) othersZero = false;
      }
      for (var h = 27; h < 34; h++) if (c[h] > 0) othersZero = false;
      if (othersZero) return true;
    }
    return false;
  }

  function splitGhost(hand, ghostId) {
    if (ghostId == null || ghostId < 0) return { ghosts: 0, rest: hand.slice() };
    var ghosts = 0, rest = [];
    for (var i = 0; i < hand.length; i++) {
      if (hand[i] === ghostId) ghosts++; else rest.push(hand[i]);
    }
    return { ghosts: ghosts, rest: rest };
  }

  function isWin14(hand, ghostId) {
    if (hand.length !== 14) return false;
    var split = splitGhost(hand, ghostId);
    var c = countsOf(split.rest);
    if (split.ghosts === 0) {
      if (isThirteenOrphans(c) || isSevenPairs(c)) return true;
      return decompose(c).length > 0;
    }
    return decomposeGhosts(c, split.ghosts).length > 0;
  }
  function waitsOf(hand13, ghostId) {
    var waits = [];
    for (var id = 0; id < 34; id++) {
      if (isWin14(hand13.concat([id]), ghostId)) waits.push(id);
    }
    return waits;
  }

  /* ---------------- 番种 ---------------- */
  var PATTERNS = {
    pinghu: { name: '平胡', fan: 1 },
    closed: { name: '门前清', fan: 1 },
    selfDraw: { name: '自摸', fan: 1 },
    allPungs: { name: '对对胡', fan: 3 },
    mixedSuit: { name: '混一色', fan: 3 },
    pureSuit: { name: '清一色', fan: 6 },
    smallDragons: { name: '小三元', fan: 3 },
    bigDragons: { name: '大三元', fan: 8 },
    smallWinds: { name: '小四喜', fan: 6 },
    bigWinds: { name: '大四喜', fan: 10 },
    allHonors: { name: '字一色', fan: 10 },
    mixedOrphan: { name: '混幺九', fan: 10 },
    sevenPairs: { name: '七对', fan: 3 },
    thirteen: { name: '十三幺', fan: 13 },
    green: { name: '绿一色', fan: 10 },
    nineGates: { name: '九莲宝灯', fan: 13 },
    kongBloom: { name: '杠上开花', fan: 1 },
    lastTile: { name: '海底捞月', fan: 1 },
    robbing: { name: '抢杠', fan: 1 },
    heaven: { name: '天胡', fan: 13 },
    earth: { name: '地胡', fan: 13 }
  };

  function situational(flags) {
    var list = [];
    if (flags.heaven) list.push(PATTERNS.heaven);
    if (flags.earth) list.push(PATTERNS.earth);
    if (flags.selfDraw && !flags.heaven && !flags.earth) list.push(PATTERNS.selfDraw);
    if (flags.closed && !flags.selfDraw && !flags.heaven && !flags.earth) list.push(PATTERNS.closed);
    if (flags.kongBloom) list.push(PATTERNS.kongBloom);
    if (flags.lastTile) list.push(PATTERNS.lastTile);
    if (flags.robbing) list.push(PATTERNS.robbing);
    if (flags.flowers > 0) list.push({ name: '花牌', fan: flags.flowers });
    if (flags.ownFlowerFan && flags.ownFlowers > 0) list.push({ name: '正花', fan: flags.ownFlowers });
    return list;
  }

  function scoreDecomposition(d, flags) {
    var sets = d.sets, pair = d.pair;
    var all = [];
    sets.forEach(function (s) { all = all.concat(s); });
    all = all.concat(pair);

    var suitCount = [0, 0, 0], honors = 0;
    all.forEach(function (t) {
      if (t < 27) suitCount[Math.floor(t / 9)]++;
      else honors++;
    });
    var suitsUsed = suitCount.filter(function (v) { return v > 0; }).length;
    var allHonors = honors === all.length;
    var pure = suitsUsed === 1 && honors === 0;
    var mixed = suitsUsed === 1 && honors > 0;
    var allPungs = sets.every(function (s) { return s[0] === s[1]; });
    var allChows = sets.every(function (s) { return s[0] !== s[1]; });
    var pairHonor = pair[0] >= 27;
    var dragonPungs = sets.filter(function (s) { return s[0] === s[1] && s[0] >= 31; }).length;
    var windPungs = sets.filter(function (s) { return s[0] === s[1] && s[0] >= 27 && s[0] <= 30; });
    var windIds = windPungs.map(function (s) { return s[0]; });
    var allTerminalHonor = all.every(function (t) { return t >= 27 || t % 9 === 0 || t % 9 === 8; });
    var green = all.every(function (t) { return GREEN_IDS.indexOf(t) >= 0; });

    var list = [];
    var skipAllPungs = false;

    if (allHonors) { list.push(PATTERNS.allHonors); skipAllPungs = true; }
    if (pure && !green) list.push(PATTERNS.pureSuit);
    if (mixed && !allHonors && !green) list.push(PATTERNS.mixedSuit);
    if (allTerminalHonor && !allHonors) { list.push(PATTERNS.mixedOrphan); skipAllPungs = true; }
    if (green) list.push(PATTERNS.green);
    if (allPungs && !skipAllPungs && !green) list.push(PATTERNS.allPungs);
    if (allChows && !pairHonor && !green) list.push(PATTERNS.pinghu);

    if (dragonPungs === 3) list.push(PATTERNS.bigDragons);
    else if (dragonPungs === 2 && pairHonor && pair[0] >= 31) list.push(PATTERNS.smallDragons);

    if (windPungs.length === 4) list.push(PATTERNS.bigWinds);
    else if (windPungs.length === 3 && pair[0] >= 27 && pair[0] <= 30) list.push(PATTERNS.smallWinds);

    var windFan = 0;
    windIds.forEach(function (id) {
      var rel = id - 27;
      if (rel === flags.roundWind || rel === flags.seatWind) windFan++;
    });
    for (var i = 0; i < windFan; i++) list.push({ name: '番子（风）', fan: 1 });

    return { patterns: list, fan: list.reduce(function (a, b) { return a + b.fan; }, 0) };
  }

  function analyze14(hand, flags) {
    var ghostId = flags.ghostId == null ? -1 : flags.ghostId;
    var split = splitGhost(hand, ghostId);
    var c = countsOf(split.rest);
    var candidates = [];
    var seen = {};

    if (split.ghosts === 0) {
      if (isThirteenOrphans(c)) candidates.push({ patterns: [PATTERNS.thirteen], special: '十三幺' });
      if (isSevenPairs(c)) candidates.push({ patterns: [PATTERNS.sevenPairs], special: '七对' });
      if (isNineGates(c)) candidates.push({ patterns: [PATTERNS.nineGates], special: '九莲宝灯' });
    }
    var decomps = split.ghosts > 0 ? decomposeGhosts(c, split.ghosts) : decompose(c);
    decomps.forEach(function (d) {
      var key = JSON.stringify(d);
      if (seen[key]) return;
      seen[key] = true;
      var r = scoreDecomposition(d, flags);
      candidates.push({ patterns: r.patterns, decomp: d });
    });

    if (!candidates.length) return { ok: false };

    candidates.forEach(function (cand) {
      cand.patterns = cand.patterns.concat(situational(flags));
      cand.fan = cand.patterns.reduce(function (a, b) { return a + b.fan; }, 0);
    });
    candidates.sort(function (a, b) { return b.fan - a.fan; });
    var best = candidates[0];
    best.ok = true;
    best.ghostCount = split.ghosts;
    best.ghostId = ghostId;
    return best;
  }

  function analyze(hand, flags) {
    var ghostId = flags.ghostId == null ? -1 : flags.ghostId;
    if (hand.length === 13) return { status: 'waiting', waits: waitsOf(hand, ghostId), ghostId: ghostId };
    if (hand.length === 14) {
      var r = analyze14(hand, flags);
      return r.ok ? Object.assign({ status: 'win' }, r) : { status: 'invalid' };
    }
    if (hand.length === 15) {
      var c = countsOf(hand), best = null;
      for (var id = 0; id < 34; id++) {
        if (id === ghostId || c[id] < 4) continue;
        var copy = hand.slice();
        copy.splice(copy.indexOf(id), 1);
        var r13 = analyze14(copy, flags);
        if (r13.ok && (!best || r13.fan > best.fan)) { best = r13; best.kongId = id; }
      }
      return best ? Object.assign({ status: 'win', hadKong: true }, best) : { status: 'invalid' };
    }
    return {
      status: 'invalid',
      reason: hand.length === 0 ? '先点几张牌，再从下面看结果' :
        (hand.length < 13 ? '还差 ' + (13 - hand.length) + ' 张才成手牌' : '最多 15 张（含杠）')
    };
  }

  /* ---------------- 结算 ---------------- */
  function settle(fan, flags, rules) {
    var capped = Math.min(fan, rules.maxFan);
    var value = rules.mode === 'double'
      ? rules.base * Math.pow(2, capped)
      : rules.base + capped * rules.perFan;
    var dealer = !!(flags.dealer && rules.dealerBonus);
    if (dealer) value = Math.ceil(value * 1.5);
    var selfDraw = !!(flags.selfDraw || flags.heaven || flags.earth);
    return {
      capped: capped,
      value: value,
      selfDraw: selfDraw,
      total: selfDraw ? value * 3 : value,
      mode: rules.mode,
      dealer: dealer
    };
  }

  /* ---------------- 筹码（不算番） ---------------- */
  var MA_CONFIG = [
    { wind: 0, numbers: [1, 5, 9], honors: [27, 31] }, // 东、中
    { wind: 1, numbers: [2, 6], honors: [28, 32] },    // 南、发
    { wind: 2, numbers: [3, 7], honors: [29, 33] },    // 西、白
    { wind: 3, numbers: [4, 8], honors: [30] }         // 北
  ];

  var CHIP_RULES = {
    selfDraw: 2,
    perMa: 1,
    discard: 2,
    exposed: 1,
    concealed: 2,
    feeding: 3
  };

  function windOf(player, dealer) {
    return ((player - dealer) % 4 + 4) % 4;
  }

  function maSet(wind) {
    var cfg = MA_CONFIG[wind] || MA_CONFIG[0];
    var out = [];
    cfg.numbers.forEach(function (n) {
      var base = n - 1;
      out.push(base, base + 9, base + 18);
    });
    return out.concat(cfg.honors);
  }

  function maInfo(wind) {
    var cfg = MA_CONFIG[wind] || MA_CONFIG[0];
    return {
      wind: wind,
      numbers: cfg.numbers.slice(),
      honors: cfg.honors.slice(),
      tiles: maSet(wind)
    };
  }

  function maHits(tiles, wind) {
    var set = maSet(wind);
    return (tiles || []).filter(function (t) { return set.indexOf(t) >= 0; });
  }

  function seatsOf(dealer) {
    var out = [];
    for (var player = 0; player < 4; player++) {
      var wind = windOf(player, dealer);
      out.push({ player: player, wind: wind, windName: WINDS[wind], ma: maSet(wind) });
    }
    return out;
  }

  function settleChips(input) {
    input = input || {};
    var dealer = input.dealer || 0;
    var winner = input.winner == null ? dealer : input.winner;
    var selfDraw = !!input.selfDraw;
    var rules = Object.assign({}, CHIP_RULES, input.rules || {});
    var winnerWind = windOf(winner, dealer);
    var hits = maHits(input.maTiles || [], winnerWind);
    var transfers = [];

    function pay(from, to, amount, reason) {
      amount = Math.round(amount);
      if (!amount || from === to || from == null || to == null) return;
      if (from < 0 || from > 3 || to < 0 || to > 3) return;
      transfers.push({ from: from, to: to, amount: amount, reason: reason });
    }

    if (selfDraw) {
      for (var p = 0; p < 4; p++) {
        if (p === winner) continue;
        pay(p, winner, rules.selfDraw, '自摸');
        if (hits.length) pay(p, winner, hits.length * rules.perMa, '中马 ×' + hits.length);
      }
    } else {
      var discarder = input.discarder == null ? winner : input.discarder;
      pay(discarder, winner, rules.discard, '出铳');
    }

    (input.kongs || []).forEach(function (kong, index) {
      if (!kong) return;
      var player = kong.player == null ? index : kong.player;
      var exposed = Math.max(0, kong.exposed || 0);
      var concealed = Math.max(0, kong.concealed || 0);
      for (var q = 0; q < 4; q++) {
        if (q === player) continue;
        if (exposed) pay(q, player, exposed * rules.exposed, '公杠 ×' + exposed);
        if (concealed) pay(q, player, concealed * rules.concealed, '暗杠 ×' + concealed);
      }
    });

    (input.feedings || []).forEach(function (feeding, index) {
      if (!feeding || feeding.to == null || feeding.to < 0) return;
      var from = feeding.from == null ? index : feeding.from;
      if (from < 0 || from > 3 || from === feeding.to) return;
      var count = Math.max(0, feeding.count || 0);
      pay(from, feeding.to, count * rules.feeding, '放杠 ×' + count);
    });

    var net = [0, 0, 0, 0];
    var winnerGain = 0;
    transfers.forEach(function (t) {
      net[t.from] -= t.amount;
      net[t.to] += t.amount;
      if (t.to === winner) winnerGain += t.amount;
    });

    return {
      dealer: dealer,
      winner: winner,
      winnerWind: winnerWind,
      selfDraw: selfDraw,
      maSet: maSet(winnerWind),
      maTiles: (input.maTiles || []).slice(),
      maHits: hits,
      transfers: transfers,
      net: net,
      winnerGain: winnerGain
    };
  }

  /* ---------------- 掷骰开门 ---------------- */
  function openInfo(input) {
    var d1 = input.d1, d2 = input.d2, d3 = input.d3 || 0;
    var big = Math.max(d1, d2), small = Math.min(d1, d2);
    var persons, stacks, label;
    if (input.mode === 'sum') {
      persons = d1 + d2 + d3;
      stacks = persons;
      label = persons + ' 点';
    } else if (input.mode === 'smallPerson') {
      persons = small; stacks = big;
      label = '小 ' + small + ' · 大 ' + big;
    } else {
      persons = big; stacks = small;
      label = '大 ' + big + ' · 小 ' + small;
    }
    var openWind = (input.dealer + persons - 1) % 4;
    var startStack = stacks + (input.stackMode === 'same' ? 0 : 1);
    var owner = openWind, remain = startStack, wrapped = false;
    while (remain > 17) {
      remain -= 17;
      owner = (owner + 3) % 4; // 牌墙绕到上一家的墙尾
      wrapped = true;
    }
    return {
      persons: persons,
      stacks: stacks,
      startStack: startStack,
      openWind: openWind,
      openWindName: WINDS[openWind],
      openOffset: (openWind - input.me + 4) % 4,
      wallOwner: owner,
      wallOwnerName: WINDS[owner],
      wallStack: remain,
      wrapped: wrapped,
      big: big,
      small: small,
      label: label
    };
  }

  return {
    WINDS: WINDS,
    PATTERNS: PATTERNS,
    name: name,
    counts: countsOf,
    isWin14: isWin14,
    waitsOf: waitsOf,
    analyze: analyze,
    settle: settle,
    settleChips: settleChips,
    maSet: maSet,
    maInfo: maInfo,
    maHits: maHits,
    seatsOf: seatsOf,
    windOf: windOf,
    openInfo: openInfo
  };
});
