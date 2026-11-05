/*!
 * 麻雀学堂 · 牌面绘制
 * 用 SVG 画真实麻将牌面：万（汉字）、筒（饼）、索（竹）、风、箭。
 * 只画牌面墨迹；牌身与立体感由 CSS 提供（.mj-tile）。
 */
(function (root) {
  'use strict';

  var NUM_CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var HONOR = ['东', '南', '西', '北', '中', '发', '白'];
  var SUIT_NAME = ['万', '筒', '索'];
  var INK = {
    red: '#b3352a',
    deep: '#8d2a20',
    blue: '#2b6ea8',
    deepBlue: '#17456f',
    green: '#2f7d4f',
    deepGreen: '#1d5735',
    black: '#2c2a25',
    teal: '#1f6b6b'
  };
  // 牌面可绘制区域：x 8..52，y 8..72
  var X0 = 8, X1 = 52, Y0 = 8, Y1 = 72;
  var px = function (t) { return X0 + (X1 - X0) * t; };
  var py = function (t) { return Y0 + (Y1 - Y0) * t; };

  /* ---------------- 筒（饼） ---------------- */
  var PIN_LAYOUT = {
    1: [[.5, .5]],
    2: [[.5, .26], [.5, .74]],
    3: [[.22, .2], [.5, .5], [.78, .8]],
    4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]],
    5: [[.24, .24], [.76, .24], [.5, .5], [.24, .76], [.76, .76]],
    6: [[.27, .18], [.73, .18], [.27, .5], [.73, .5], [.27, .82], [.73, .82]],
    7: [[.2, .15], [.5, .15], [.8, .15], [.28, .56], [.72, .56], [.28, .85], [.72, .85]],
    8: [[.28, .12], [.72, .12], [.28, .37], [.72, .37], [.28, .63], [.72, .63], [.28, .88], [.72, .88]],
    9: [[.22, .16], [.5, .16], [.78, .16], [.22, .5], [.5, .5], [.78, .5], [.22, .84], [.5, .84], [.78, .84]]
  };
  var PIN_RADIUS = { 1: 17, 2: 10, 3: 9, 4: 8.6, 5: 8, 6: 7.4, 7: 6.9, 8: 6.9, 9: 6.9 };

  function dot(cx, cy, r, ring, core, light) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + ring + '"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.58) + '" fill="' + (light || '#fffdf3') + '"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.36) + '" fill="' + core + '"/>' +
      '<circle cx="' + (cx - r * 0.24) + '" cy="' + (cy - r * 0.24) + '" r="' + (r * 0.13) + '" fill="#ffffff" opacity="0.75"/>';
  }

  function pinInk(n) {
    if (n === 1) {
      return dot(30, 40, 17, INK.blue, INK.red) +
        '<circle cx="30" cy="40" r="10.4" fill="none" stroke="' + INK.red + '" stroke-width="1.6"/>' +
        '<circle cx="30" cy="40" r="5.4" fill="' + INK.blue + '"/>';
    }
    var layout = PIN_LAYOUT[n];
    var r = PIN_RADIUS[n];
    var palette = [
      [INK.blue, INK.red],
      [INK.green, INK.deepGreen],
      [INK.red, INK.deep],
      [INK.green, INK.blue],
      [INK.red, INK.blue],
      [INK.blue, INK.deepBlue]
    ];
    return layout.map(function (point, i) {
      var pair = palette[i % palette.length];
      return dot(px(point[0]), py(point[1]), r, pair[0], pair[1]);
    }).join('');
  }

  /* ---------------- 索（竹） ---------------- */
  var SOU_LAYOUT = {
    2: [[.5, .25], [.5, .75]],
    3: [[.5, .2], [.26, .74], [.74, .74]],
    4: [[.28, .27], [.72, .27], [.28, .73], [.72, .73]],
    5: [[.24, .23], [.76, .23], [.5, .5], [.24, .77], [.76, .77]],
    6: [[.22, .25], [.5, .25], [.78, .25], [.22, .75], [.5, .75], [.78, .75]],
    7: [[.2, .18], [.5, .18], [.8, .18], [.3, .55], [.7, .55], [.3, .85], [.7, .85]],
    8: [[.18, .26], [.39, .26], [.61, .26], [.82, .26], [.18, .74], [.39, .74], [.61, .74], [.82, .74]],
    9: [[.21, .16], [.5, .16], [.79, .16], [.21, .5], [.5, .5], [.79, .5], [.21, .84], [.5, .84], [.79, .84]]
  };
  var SOU_SIZE = {
    2: [34, 9.5], 3: [32, 9], 4: [26, 9], 5: [16, 8],
    6: [26, 8], 7: [16, 7.6], 8: [24, 6.6], 9: [16, 7.2]
  };

  function stick(cx, cy, h, w, body, edge, cap) {
    var x = cx - w / 2, y = cy - h / 2;
    return '<g>' +
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (w / 2) + '" fill="' + body + '" stroke="' + edge + '" stroke-width="0.8"/>' +
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + (h * 0.22) + '" rx="' + (w / 2) + '" fill="' + cap + '"/>' +
      '<rect x="' + x + '" y="' + (y + h - h * 0.2) + '" width="' + w + '" height="' + (h * 0.2) + '" rx="' + (w / 2) + '" fill="' + cap + '"/>' +
      '<line x1="' + (x + 1.2) + '" y1="' + (y + h * 0.36) + '" x2="' + (x + w - 1.2) + '" y2="' + (y + h * 0.36) + '" stroke="#f2faf0" stroke-width="0.9" opacity="0.75"/>' +
      '<line x1="' + (x + 1.2) + '" y1="' + (y + h * 0.68) + '" x2="' + (x + w - 1.2) + '" y2="' + (y + h * 0.68) + '" stroke="#0f3d24" stroke-width="0.8" opacity="0.45"/>' +
      '</g>';
  }

  function sparrow() {
    // 1 索：一只停在竹枝上的雀
    return '<g transform="translate(30 41) scale(1.22) translate(-30 -41)">' +
      '<path d="M31 63c5-2 9-6 11-11" stroke="' + INK.deepGreen + '" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<path d="M42 52c3-1 6 0 8 2" stroke="' + INK.deepGreen + '" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<path d="M38 50c2-4 6-6 10-6" stroke="' + INK.green + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="27" cy="42" rx="12" ry="9.5" transform="rotate(-18 27 42)" fill="' + INK.green + '"/>' +
      '<path d="M20 36c6-2 12 0 15 5-4 3-10 3-15-5Z" fill="' + INK.deepGreen + '"/>' +
      '<circle cx="18" cy="32" r="6.4" fill="' + INK.green + '"/>' +
      '<path d="M12.4 30.4 7 33.2l5.6 1.6Z" fill="' + INK.red + '"/>' +
      '<circle cx="16.6" cy="30.6" r="1.5" fill="#fff8e6"/>' +
      '<circle cx="17" cy="30.6" r="0.8" fill="' + INK.black + '"/>' +
      '<path d="M22 46c4 1 7 3 9 6-4 1-8 0-11-2Z" fill="' + INK.red + '" opacity="0.9"/>' +
      '<path d="M30 22c2-2 5-2 7 0" stroke="' + INK.deepGreen + '" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
      '</g>';
  }

  function souInk(n) {
    if (n === 1) return sparrow();
    var layout = SOU_LAYOUT[n];
    var size = SOU_SIZE[n];
    return layout.map(function (p, i) {
      var center = (n === 5 && i === 2);
      var body = center ? INK.red : INK.green;
      var edge = center ? INK.deep : INK.deepGreen;
      var cap = center ? '#e8b0a4' : '#7cc08f';
      return stick(px(p[0]), py(p[1]), size[0], size[1], body, edge, cap);
    }).join('');
  }

  /* ---------------- 万（汉字） ---------------- */
  function manInk(n) {
    return '<text x="30" y="38" text-anchor="middle" font-size="32" font-weight="700" fill="' + INK.red + '" font-family="Songti SC, SimSun, STSong, serif">' + NUM_CN[n - 1] + '</text>' +
      '<text x="30" y="69" text-anchor="middle" font-size="26" font-weight="700" fill="' + INK.red + '" font-family="Songti SC, SimSun, STSong, serif">萬</text>';
  }

  /* ---------------- 风 / 箭 ---------------- */
  function honorInk(idx) {
    // idx 0..3 = 东南西北，4..6 = 中发白
    if (idx === 6) {
      return '<rect x="14" y="20" width="32" height="40" rx="2" fill="none" stroke="' + INK.teal + '" stroke-width="2.6"/>' +
        '<rect x="18.5" y="24.5" width="23" height="31" rx="1" fill="none" stroke="' + INK.teal + '" stroke-width="0.9" opacity="0.55"/>';
    }
    var chars = ['東', '南', '西', '北', '中', '發'];
    var colors = [INK.deepBlue, INK.deepBlue, INK.deepBlue, INK.deepBlue, INK.red, INK.green];
    return '<text x="30" y="57" text-anchor="middle" font-size="44" font-weight="700" fill="' + colors[idx] +
      '" font-family="Songti SC, SimSun, STSong, serif">' + chars[idx] + '</text>';
  }

  /* ---------------- 对外 ---------------- */
  function suitOf(id) {
    if (id < 9) return 'm';
    if (id < 18) return 'p';
    if (id < 27) return 's';
    return 'h';
  }
  function nameOf(id) {
    if (id < 27) return NUM_CN[id % 9] + SUIT_NAME[Math.floor(id / 9)];
    return HONOR[id - 27];
  }
  function faceInk(id) {
    if (id < 9) return manInk(id + 1);
    if (id < 18) return pinInk(id - 8);
    if (id < 27) return souInk(id - 17);
    return honorInk(id - 27);
  }
  function svg(id, extraClass) {
    return '<svg class="mj-face' + (extraClass ? ' ' + extraClass : '') + '" viewBox="0 0 60 80" aria-hidden="true" focusable="false">' + faceInk(id) + '</svg>';
  }
  function tile(id, options) {
    var opts = options || {};
    var tag = opts.button ? 'button' : 'div';
    var attrs = ' class="mj-tile' + (opts.className ? ' ' + opts.className : '') + '" data-tile="' + id + '"';
    if (opts.button) attrs += ' type="button"';
    else attrs += ' role="img"';
    attrs += ' aria-label="' + (opts.label || nameOf(id)) + '"';
    if (opts.button) attrs += ' aria-pressed="false"';
    if (opts.title) attrs += ' title="' + opts.title + '"';
    return '<' + tag + attrs + '>' + svg(id) + '</' + tag + '>';
  }
  function back(options) {
    var opts = options || {};
    return '<div class="mj-tile mj-tile-back' + (opts.className ? ' ' + opts.className : '') + '" aria-hidden="true"></div>';
  }

  var api = {
    NUM_CN: NUM_CN,
    HONOR: HONOR,
    SUIT_NAME: SUIT_NAME,
    INK: INK,
    suitOf: suitOf,
    name: nameOf,
    faceInk: faceInk,
    svg: svg,
    tile: tile,
    back: back,
    ALL: Array.from({ length: 34 }, function (_, i) { return i; })
  };

  root.MahjongTiles = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
