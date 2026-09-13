'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../hall/library.js');
const C = require('../hall/catalog.js');

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}

test('favorites and play history survive a reload without changing either game save', () => {
  const storage = memoryStorage();
  for (const game of C.games) storage.setItem(game.saveKey, `original-${game.id}`);
  let state = L.toggleFavorite(L.read(storage), 'fengyunjue');
  state = L.recordPlay(state, 'jihuan', 1000);
  state = L.recordPlay(state, 'jihuan', 2000);
  assert.equal(L.write(state, storage), true);
  const loaded = L.read(storage);
  assert.deepEqual(loaded.favorites, ['fengyunjue']);
  assert.deepEqual(loaded.recent.jihuan, { lastPlayed: 2000, plays: 2 });
  for (const game of C.games) assert.equal(storage.getItem(game.saveKey), `original-${game.id}`);
  assert.deepEqual(L.toggleFavorite(loaded, 'fengyunjue').favorites, []);
  assert.deepEqual(loaded.favorites, ['fengyunjue'], 'updates must not mutate previously read state');
});

test('malformed and unavailable storage never prevents browsing or changes game progress', () => {
  const storage = memoryStorage();
  for (const input of ['broken json', 'null', '[]', '{"version":99}', '{"version":1,"favorites":"bad","recent":null}']) {
    storage.setItem(L.KEY, input);
    assert.deepEqual(L.read(storage), L.empty());
  }
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(L.read(blocked), L.empty());
  assert.equal(L.write(L.empty(), blocked), false);
  assert.equal(L.write(L.empty(), null), false);
});

test('unknown game IDs and invalid history cannot leak into the library or player', () => {
  const raw = { version: 1, favorites: ['jihuan', 'jihuan', '../secret', '<img>', null], recent: { jihuan: { lastPlayed: 10, plays: 'bad' }, fengyunjue: { lastPlayed: -1, plays: 1 }, unknown: { lastPlayed: 30, plays: 1 } } };
  assert.deepEqual(L.normalize(raw), { version: 1, favorites: ['jihuan'], recent: { jihuan: { lastPlayed: 10, plays: 1 } } });
  assert.deepEqual(L.recordPlay(L.empty(), 'https://example.com'), L.empty());
  assert.deepEqual(L.toggleFavorite(L.empty(), '__proto__'), L.empty());
});

test('search combines title aliases, categories and favorite filters', () => {
  const state = L.toggleFavorite(L.empty(), 'fengyunjue');
  assert.deepEqual(L.select(state, { query: '风云诀' }).map(game => game.id), ['fengyunjue']);
  assert.deepEqual(L.select(state, { query: '  EMBER  生存  ' }).map(game => game.id), ['jihuan']);
  assert.equal(L.select(state, { query: '不存在的游戏' }).length, 0);
  assert.equal(L.select(state, { view: 'favorites', category: 'survival' }).length, 0);
  assert.deepEqual(L.select(state, { view: 'favorites' }).map(game => game.id), ['fengyunjue']);
});

test('recent history uses actual launch times and excludes games never launched', () => {
  let state = L.recordPlay(L.empty(), 'jihuan', 100);
  assert.deepEqual(L.select(state, { view: 'recent' }).map(game => game.id), ['jihuan']);
  state = L.recordPlay(state, 'fengyunjue', 200);
  assert.deepEqual(L.select(state, { view: 'recent' }).map(game => game.id), ['fengyunjue', 'jihuan']);
  state = L.recordPlay(state, 'jihuan', 300);
  assert.deepEqual(L.select(state, { view: 'recent' }).map(game => game.id), ['jihuan', 'fengyunjue']);
  assert.deepEqual(L.select(state, { view: 'recent', sort: 'name' }).map(game => game.id), ['fengyunjue', 'jihuan']);
  assert.equal(C.games[0].id, 'fengyunjue', 'sorting must not reorder the catalog');
});
