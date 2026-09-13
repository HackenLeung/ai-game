(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./catalog.js'));
  else root.GameLibrary = factory(root.GameCatalog);
})(globalThis, function (catalog) {
  'use strict';
  const KEY = 'youjian-library-v1';
  const validId = id => typeof id === 'string' && !!catalog.get(id);
  const empty = () => ({ version: 1, favorites: [], recent: {} });
  function normalize(raw) {
    const state = empty();
    if (!raw || typeof raw !== 'object' || raw.version !== 1) return state;
    if (Array.isArray(raw.favorites)) state.favorites = [...new Set(raw.favorites.filter(validId))];
    for (const game of catalog.games) {
      const item = raw.recent?.[game.id];
      if (item && Number.isSafeInteger(item.lastPlayed) && item.lastPlayed > 0) {
        state.recent[game.id] = { lastPlayed: item.lastPlayed, plays: Number.isSafeInteger(item.plays) && item.plays > 0 ? item.plays : 1 };
      }
    }
    return state;
  }
  function storage() { try { return globalThis.localStorage; } catch { return null; } }
  function read(source = storage()) {
    try { return normalize(JSON.parse(source?.getItem(KEY) || 'null')); } catch { return empty(); }
  }
  function write(state, destination = storage()) {
    try { if (!destination) return false; destination.setItem(KEY, JSON.stringify(normalize(state))); return true; } catch { return false; }
  }
  function toggleFavorite(state, id) {
    const next = normalize(state);
    if (validId(id)) next.favorites = next.favorites.includes(id) ? next.favorites.filter(value => value !== id) : [...next.favorites, id];
    return next;
  }
  function recordPlay(state, id, now = Date.now()) {
    const next = normalize(state);
    if (validId(id) && Number.isSafeInteger(now) && now > 0) next.recent[id] = { lastPlayed: now, plays: Math.min((next.recent[id]?.plays || 0) + 1, Number.MAX_SAFE_INTEGER) };
    return next;
  }
  function select(state, { view = 'discover', category = 'all', query = '', sort = 'default' } = {}) {
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const selected = catalog.games.filter(game => {
      if (view === 'favorites' && !state.favorites.includes(game.id)) return false;
      if (view === 'recent' && !state.recent[game.id]) return false;
      if (category !== 'all' && game.category !== category) return false;
      const text = [game.title, game.subtitle, game.categoryLabel, game.description, game.aliases, ...game.tags].join(' ').toLocaleLowerCase();
      return words.every(word => text.includes(word));
    });
    if (sort === 'recent' || (view === 'recent' && sort === 'default')) selected.sort((a, b) => (state.recent[b.id]?.lastPlayed || 0) - (state.recent[a.id]?.lastPlayed || 0));
    else if (sort === 'name') selected.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
    return selected;
  }
  return { KEY, empty, normalize, read, write, toggleFavorite, recordPlay, select };
});
