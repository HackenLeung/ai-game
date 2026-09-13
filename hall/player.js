(function () {
  'use strict';
  const U = HallUI, L = GameLibrary, $ = id => document.getElementById(id);
  const game = GameCatalog.get(new URLSearchParams(location.search).get('game'));
  const frame = $('game-frame');
  let deadline, recorded = false;
  function failure(title, description, retry = false) {
    clearTimeout(deadline);
    frame.hidden = true;
    $('player-state').hidden = false;
    $('player-state').innerHTML = `${U.icon('gamepad')}<h1>${U.escape(title)}</h1><p>${U.escape(description)}</p><div class="error-actions">${retry ? '<button class="button" id="retry-game">重新进入</button>' : ''}<a class="button" href="index.html">返回大厅${U.icon('arrow')}</a></div>`;
    $('retry-game')?.addEventListener('click', () => location.reload());
  }
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($('player-shell').requestFullscreen && document.fullscreenEnabled) await $('player-shell').requestFullscreen();
      else U.toast('当前浏览器暂不支持全屏，可以使用浏览器的全屏功能。');
    } catch { U.toast('暂时无法进入全屏，请再试一次或使用浏览器全屏。'); }
  });
  document.addEventListener('fullscreenchange', () => {
    const fullscreen = !!document.fullscreenElement;
    $('fullscreen').innerHTML = `${U.icon(fullscreen ? 'collapse' : 'fullscreen')}<span class="tool-label">${fullscreen ? '退出全屏' : '全屏游玩'}</span>`;
    $('fullscreen').setAttribute('aria-label', fullscreen ? '退出全屏' : '进入全屏');
    $('fullscreen').setAttribute('aria-pressed', String(fullscreen));
  });
  if (!game) {
    document.title = '没有找到游戏 · 游间';
    $('player-title').textContent = '没有找到游戏';
    failure('这个小世界还未开放', '游戏地址可能不完整，回到大厅挑选一个游戏吧。');
    return;
  }
  document.title = `${game.title} · 游间`;
  $('player-title').textContent = game.title;
  $('player-subtitle').textContent = game.subtitle;
  $('player-help').disabled = false;
  $('player-help').addEventListener('click', () => U.showDetails(game, true));
  frame.title = `${game.title} · ${game.subtitle}`;
  frame.addEventListener('load', () => {
    // load also fires for a 404 document. Verify the game's actual ready element.
    try {
      const document = frame.contentDocument;
      if (!document) {
        if (location.protocol !== 'file:') { failure('游戏暂时没有打开', '请重新进入游戏；如果仍未打开，请检查本地预览是否在运行。', true); return; }
        // Browsers may isolate file:// documents; the iframe is still playable.
      } else if (!document.querySelector(game.readySelector)) {
        failure('游戏暂时没有打开', '游戏文件可能不完整，请重新进入或返回大厅。', true); return;
      }
    } catch {
      if (location.protocol !== 'file:') { failure('游戏暂时没有打开', '请重新进入游戏，或返回大厅选择其他游戏。', true); return; }
    }
    clearTimeout(deadline);
    $('player-state').hidden = true;
    frame.hidden = false;
    if (!recorded) {
      recorded = true;
      if (!L.write(L.recordPlay(L.read(), game.id))) U.toast('浏览器暂时无法保存游玩记录。游戏存档可在游戏内导出。');
    }
    frame.focus({ preventScroll: true });
  });
  frame.addEventListener('error', () => failure('游戏暂时没有打开', '请检查游戏文件是否完整，再试一次。', true));
  deadline = setTimeout(() => failure('这个世界准备得有点久', '请重新进入游戏，或返回大厅再试一次。', true), 20000);
  // Catalog lookup is the only source of iframe URLs. Query strings cannot load arbitrary pages.
  frame.src = game.entry;
})();
