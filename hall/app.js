(function () {
  'use strict';
  const C = GameCatalog, L = GameLibrary, U = HallUI, $ = id => document.getElementById(id);
  const { escape: esc, icon, playUrl } = U;
  let state = L.read(), view = 'discover', category = 'all', featuredId = C.games[0].id;
  let memoryOnly = false;
  const views = { discover: ['发现游戏', '全部游戏'], favorites: ['我的收藏', '留给下次的快乐'], recent: ['最近游玩', '走过的小世界'] };
  const sortOptions = [...document.querySelectorAll('[data-sort]')];
  function syncSort() {
    const selected = sortOptions.find(option => option.dataset.sort === $('sort').value) || sortOptions[0];
    $('sort-label').textContent = selected.firstElementChild.textContent;
    $('sort-trigger').setAttribute('aria-label', `游戏排序：${$('sort-label').textContent}`);
    sortOptions.forEach(option => option.setAttribute('aria-selected', String(option === selected)));
  }
  function closeSort(restoreFocus = false) {
    $('sort-menu').hidden = true;
    $('sort-trigger').setAttribute('aria-expanded', 'false');
    if (restoreFocus) $('sort-trigger').focus({ preventScroll: true });
  }
  function openSort() {
    $('sort-menu').hidden = false;
    $('sort-trigger').setAttribute('aria-expanded', 'true');
    (sortOptions.find(option => option.dataset.sort === $('sort').value) || sortOptions[0]).focus({ preventScroll: true });
  }
  function currentState() { return memoryOnly ? state : L.read(); }
  function updateState(next) {
    state = next;
    memoryOnly = !L.write(state);
    if (memoryOnly) U.toast('浏览器暂时无法保存大厅记录，本次仍可正常游玩。');
  }
  function favoriteButton(game, extraClass = '') {
    const selected = state.favorites.includes(game.id);
    return `<button class="favorite-button icon-button ${extraClass}${selected ? ' selected' : ''}" data-favorite="${esc(game.id)}" aria-label="${selected ? '取消收藏' : '收藏'}${esc(game.title)}" aria-pressed="${selected}">${icon('heart')}</button>`;
  }
  function renderFeatured() {
    const game = C.get(featuredId);
    $('featured').className = `featured ${game.color}`;
    $('featured').innerHTML = `<img class="hero-image" src="${esc(game.cover)}" alt="${esc(game.scene)}" fetchpriority="high"><div class="hero-shade"></div><span class="scene-caption">${icon('monitor')}游戏实景 · ${esc(game.scene)}</span><div class="featured-content"><div class="feature-label"><span></span>值得走进的小世界 <span class="label-line"></span> EDITOR’S PICK</div><p class="hero-english">${esc(game.english)}</p><h2>${esc(game.title)}</h2><p class="hero-subtitle">${esc(game.subtitle)}</p><p class="hero-description">${esc(game.hero).replace(/\n/g, '<br>')}</p><div class="hero-actions"><a class="button hero-play" href="${playUrl(game.id)}">${icon('play')}${state.recent[game.id] ? '继续游玩' : '开始游玩'}${icon('arrow')}</a><button class="hero-detail" data-detail="${esc(game.id)}">了解游戏<span>↗</span></button></div></div><div class="featured-bottom"><div class="feature-tabs" role="group" aria-label="切换精选游戏">${C.games.map((item, index) => `<button class="feature-tab ${item.id === game.id ? 'active' : ''}" data-feature="${esc(item.id)}" aria-label="推荐：${esc(item.title)}" aria-pressed="${item.id === game.id}"><span class="feature-tab-number">${String(index + 1).padStart(2, '0')}</span><span>${esc(item.subtitle)}</span><i></i></button>`).join('')}</div><span class="featured-note">一点闲暇，一段新故事。</span></div>`;
  }
  function card(game) {
    const recent = state.recent[game.id];
    return `<article class="game-card ${esc(game.color)}" data-game="${esc(game.id)}"><div class="card-visual"><button class="card-preview" data-detail="${esc(game.id)}" aria-label="了解${esc(game.title)}"><img src="${esc(game.cover)}" alt="${esc(game.scene)}" loading="lazy"><span class="preview-hint">看看这个世界${icon('arrow')}</span></button><span class="card-category">${icon(game.icon)}${esc(game.categoryLabel)}</span>${favoriteButton(game)}</div><div class="card-body"><div class="card-title-row"><h3><button data-detail="${esc(game.id)}">${esc(game.title)}</button></h3><span class="game-availability"><i></i>即点即玩</span></div><p class="card-subtitle">${esc(game.subtitle)}</p><p class="card-description">${esc(game.description)}</p><div class="card-tags">${game.tags.map(tag => `<span>${esc(tag)}</span>`).join('')}</div><div class="card-footer"><span>${icon(recent ? 'clock' : 'monitor')}${recent ? esc(U.relativeTime(recent.lastPlayed)) : '键鼠 / 触屏'}</span><a href="${playUrl(game.id)}" class="card-play" aria-label="${recent ? '继续游玩' : '开始游玩'}${esc(game.title)}">${recent ? '继续游玩' : '开始游玩'}${icon('arrow')}</a></div></div></article>`;
  }
  function renderRecent() {
    const recent = L.select(state, { view: 'recent' });
    if (!recent.length) {
      $('recent-content').innerHTML = `<div class="recent-empty"><div class="journey-art" aria-hidden="true"><span class="journey-orbit"></span><span class="journey-sun">✳</span><span class="journey-icon">${icon('gamepad')}</span><span class="journey-dot"></span></div><h3>第一段冒险，从这里开始</h3><p>玩过的游戏会留在这里，<br>下次回来，一键接着玩。</p><span class="empty-trail">LET THE STORY BEGIN <span>↗</span></span></div>`;
      return;
    }
    $('recent-content').innerHTML = recent.slice(0, 3).map(game => `<a class="recent-game" href="${playUrl(game.id)}"><img src="${esc(game.cover)}" alt=""><span><strong>${esc(game.title)}</strong><small>${esc(U.relativeTime(state.recent[game.id].lastPlayed))}</small></span>${icon('play')}</a>`).join('') + `<a class="recent-all" href="#recent">查看游玩记录${icon('arrow')}</a>`;
  }
  function renderLibrary() {
    const query = $('search').value;
    $('clear-search').hidden = !query;
    $('search-shortcut').hidden = !!query;
    syncSort();
    const filtered = L.select(state, { view, category, query, sort: $('sort').value });
    $('page-title').innerHTML = `${esc(views[view][0])}<span class="heading-dot">.</span>`;
    $('library-title').textContent = query.trim() ? '搜索结果' : category !== 'all' ? C.categories.find(item => item.id === category).label : views[view][1];
    $('result-count').textContent = `${filtered.length} 款游戏`;
    $('game-grid').innerHTML = filtered.map(card).join('');
    $('empty-state').hidden = filtered.length > 0;
    $('featured').hidden = view !== 'discover' || !!query.trim() || category !== 'all';
    $('welcome-strip').hidden = $('featured').hidden;
    const emptyCopy = view === 'favorites' && !query && category === 'all' ? ['先收藏一个喜欢的世界', '点击游戏封面上的爱心，把想玩的游戏留在这里。'] : view === 'recent' && !query && category === 'all' ? ['你的冒险还没有开始', '选一个游戏出发吧，游玩记录会出现在这里。'] : ['没有找到相关游戏', '换个关键词，或者看看其他小世界。'];
    $('empty-title').textContent = emptyCopy[0];
    $('empty-description').textContent = emptyCopy[1];
    $('favorite-count').textContent = state.favorites.length;
    document.querySelectorAll('[data-view]').forEach(link => {
      link.classList.toggle('active', link.dataset.view === view);
      if (link.dataset.view === view) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-category]').forEach(button => { const active = button.dataset.category === category; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    renderRecent();
  }
  function setView(next) {
    view = Object.hasOwn(views, next) ? next : 'discover';
    closeSort();
    category = 'all'; $('search').value = ''; $('sort').value = 'default';
    renderLibrary();
  }
  $('all-count').textContent = C.games.length;
  $('catalog-count').textContent = String(C.games.length).padStart(2, '0');
  $('side-categories').innerHTML = C.categories.map(item => `<button class="nav-item category-nav" data-category="${esc(item.id)}">${icon(item.icon)}<span>${esc(item.label)}</span></button>`).join('');
  $('category-filters').innerHTML = `<button class="filter-pill active" data-category="all" aria-pressed="true">全部<span>${C.games.length}</span></button>` + C.categories.map(item => `<button class="filter-pill" data-category="${esc(item.id)}" aria-pressed="false">${esc(item.label)}</button>`).join('');
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-detail], [data-favorite], [data-feature], [data-category], [data-view]');
    if (!button) return;
    if (button.dataset.detail) U.showDetails(C.get(button.dataset.detail));
    else if (button.dataset.favorite) {
      const id = button.dataset.favorite;
      updateState(L.toggleFavorite(currentState(), id));
      renderLibrary();
      (document.querySelector(`[data-favorite="${id}"]`) || document.querySelector(`[data-view="${view}"]`))?.focus({ preventScroll: true });
      if (!memoryOnly) U.toast(state.favorites.includes(id) ? '已收藏，留给下次的快乐。' : '已取消收藏');
    } else if (button.dataset.feature) {
      featuredId = button.dataset.feature; renderFeatured();
      document.querySelector(`[data-feature="${featuredId}"]`)?.focus({ preventScroll: true });
    } else if (button.dataset.category) {
      category = button.dataset.category; renderLibrary();
      if (button.classList.contains('category-nav')) $('library').scrollIntoView({ block: 'start' });
    } else if (button.dataset.view) setView(button.dataset.view);
  });
  $('search').addEventListener('input', renderLibrary);
  $('clear-search').addEventListener('click', () => { $('search').value = ''; renderLibrary(); $('search').focus(); });
  $('search').addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('search').value) { event.preventDefault(); $('search').value = ''; renderLibrary(); }
  });
  $('sort').addEventListener('change', renderLibrary);
  $('sort-trigger').addEventListener('click', () => { if ($('sort-menu').hidden) openSort(); else closeSort(true); });
  $('sort-trigger').addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openSort(); }
  });
  $('sort-menu').addEventListener('click', event => {
    const option = event.target.closest('[data-sort]');
    if (!option) return;
    $('sort').value = option.dataset.sort;
    closeSort(true);
    $('sort').dispatchEvent(new Event('change', { bubbles: true }));
  });
  $('sort-menu').addEventListener('keydown', event => {
    const index = Math.max(0, sortOptions.indexOf(document.activeElement));
    const next = { ArrowDown: (index + 1) % sortOptions.length, ArrowUp: (index + sortOptions.length - 1) % sortOptions.length, Home: 0, End: sortOptions.length - 1 }[event.key];
    if (next !== undefined) { event.preventDefault(); sortOptions[next].focus(); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSort(true); }
    else if (event.key === 'Tab') closeSort(true);
  });
  document.addEventListener('pointerdown', event => { if (!$('sort-control').contains(event.target)) closeSort(); });
  document.addEventListener('focusin', event => { if (!$('sort-control').contains(event.target)) closeSort(); });
  $('random-play').addEventListener('click', () => { location.href = playUrl(C.games[Math.floor(Math.random() * C.games.length)].id); });
  $('reset-filters').addEventListener('click', () => { location.hash = 'discover'; setView('discover'); });
  window.addEventListener('hashchange', () => setView(location.hash.slice(1)));
  window.addEventListener('storage', event => { if (event.key === L.KEY || event.key === null) { memoryOnly = false; state = L.read(); renderFeatured(); renderLibrary(); } });
  window.addEventListener('pageshow', () => { state = currentState(); renderFeatured(); renderLibrary(); });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !$('info-dialog').open && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) && !event.target.isContentEditable) { event.preventDefault(); closeSort(); $('search').focus(); }
  });
  renderFeatured(); setView(location.hash.slice(1));
})();
