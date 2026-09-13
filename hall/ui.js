(function () {
  'use strict';
  const paths = {
    gamepad: '<path d="M7 6h10c2 0 3 2 3.5 4l1 7c.4 3-2 4-4 2l-3-3h-5l-3 3c-2 2-4.4 1-4-2l1-7C4 8 5 6 7 6Z"/><path d="M7 9v5m-2.5-2.5h5"/><circle cx="16" cy="10" r=".75"/><circle cx="18" cy="13" r=".75"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    heart: '<path d="M20.8 4.7a5.6 5.6 0 0 0-7.9 0l-.9.9-.9-.9a5.6 5.6 0 0 0-7.9 7.9L12 21l8.8-8.4a5.6 5.6 0 0 0 0-7.9Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
    play: '<path d="m8 4 12 8-12 8Z"/>',
    shuffle: '<path d="m18 3 3 3-3 3m0 6 3 3-3 3M3 6h3c5 0 7 12 12 12h3M3 18h3c2.2 0 3.8-2.3 5.3-5M14 8.5C15.2 7 16.5 6 18 6h3"/>',
    leaf: '<path d="M20 3C9 1 2 8 6 17 15 21 23 13 20 3ZM3 21 16 8M8 16l-1-5M12 12h5"/>',
    sword: '<path d="m14 4 6-1-1 6L9 19l-4-4ZM3 13l8 8m-4-4-4 4"/>',
    flame: '<path d="M13 3c3 5-3 7-1 11 2-1 3-3 3-5 7 7 4 12-3 12-8 0-11-6-5-12 0 3 1 4 2 5-2-6 4-7 4-11Z"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
    fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    collapse: '<path d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 4h.01"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    book: '<path d="M3 4h6l3 2 3-2h6v15h-6l-3 2-3-2H3ZM12 6v15"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>'
  };
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.gamepad}</svg>`;
  const playUrl = id => `play.html?game=${encodeURIComponent(id)}`;
  let toastTimer;
  function toast(message) {
    const element = document.getElementById('toast');
    element.textContent = message;
    element.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('visible'), 4000);
  }
  const dialog = document.getElementById('info-dialog');
  function show(content) {
    document.getElementById('dialog-content').innerHTML = content;
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('dialog-open');
  }
  function showDetails(game, playing = false) {
    show(`<div class="detail-cover ${escape(game.color)}"><img src="${escape(game.cover)}" alt="${escape(game.scene)}"><span class="detail-badge">${icon(game.icon)}${escape(game.categoryLabel)}</span></div>
      <div class="detail-body"><p class="eyebrow">${escape(game.english)}</p><h2 id="dialog-title">${escape(game.title)}<span>${escape(game.subtitle)}</span></h2><p class="detail-intro">${escape(game.description)}</p>
      <div class="detail-facts">${game.facts.map(([number, label]) => `<div><strong>${escape(number)}</strong><span>${escape(label)}</span></div>`).join('')}</div>
      <h3>这个世界里，有些什么？</h3><ul class="highlight-list">${game.highlights.map(text => `<li>${icon('check')}<span>${escape(text)}</span></li>`).join('')}</ul>
      <h3>上手指南</h3><p class="detail-tip">${escape(game.tip)}</p><dl class="controls-list">${game.controls.map(([key, action]) => `<div><dt><kbd>${escape(key)}</kbd></dt><dd>${escape(action)}</dd></div>`).join('')}</dl>
      <div class="save-note">${icon('book')}<p>${escape(game.saveHelp)}<br>进度保存在当前浏览器；更换地址或设备前，请先导出存档。</p></div>
      <details class="screenshot-disclosure"><summary>${icon('monitor')}<span>看看完整游戏画面</span>${icon('chevron')}</summary><img src="${escape(game.screenshot)}" alt="${escape(game.title)}的完整游戏界面" loading="lazy"></details>
      <div class="detail-action">${playing ? `<button class="button primary" data-dismiss>${icon('play')}返回游戏</button>` : `<a class="button primary" href="${playUrl(game.id)}">${icon('play')}开始游玩</a>`}<span>无需下载 · 支持键鼠与触屏</span></div></div>`);
  }
  function showGuide() {
    show(`<div class="guide-body"><span class="guide-emblem">${icon('leaf')}</span><p class="eyebrow">MAKE YOURSELF AT HOME</p><h2 id="dialog-title">随时出发，也随时回来。</h2><p class="detail-intro">挑一个喜欢的小世界，点击「开始游玩」就能进入。收藏喜欢的游戏，下次在大厅里更快找到它。</p><h3>我的进度会保存吗？</h3><p>两款游戏都有本地存档。使用同一个浏览器、同一个地址打开，就能读取原有进度。隐私窗口和清理站点数据可能让存档消失。</p><h3>怎样带上原来的存档？</h3><ol><li>先打开原来的游戏，在游戏内导出存档文件。</li><li>从这个大厅进入对应游戏，再导入刚才的存档。</li></ol><p>逸剑风云决：打开「游玩指南」。<br>余烬：打开右上角「存档与设置」。</p><h3>可以在手机上玩吗？</h3><p>可以。两款游戏都提供触屏操作。游玩时可以通过顶部按钮查看操作说明，或尝试全屏模式。</p><div class="detail-action"><button class="button primary" data-dismiss>去挑一个游戏${icon('arrow')}</button></div></div>`);
  }
  dialog?.addEventListener('click', event => {
    if (event.target.closest('[data-dismiss]')) dialog.close();
    if (event.target === dialog) {
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    }
  });
  dialog?.addEventListener('close', () => document.body.classList.remove('dialog-open'));
  document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
  document.querySelectorAll('[data-guide]').forEach(element => element.addEventListener('click', showGuide));
  function relativeTime(timestamp) {
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    if (minutes < 1) return '刚刚玩过';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
    if (minutes < 10080) return `${Math.floor(minutes / 1440)} 天前`;
    return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(timestamp);
  }
  window.HallUI = { escape, icon, playUrl, toast, showDetails, showGuide, relativeTime };
})();
