'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../game.js');

function fresh() { return G.createState(20260913); }
function resolve(s) {
  while (s.event && s.status === 'playing') {
    const event = G.EVENTS[s.event];
    const choice = event.choices.find(c => c.id === 'leave') || event.choices.find(c => c.id === 'run') || event.choices.find(c => !G.choiceReason(s, c));
    assert.equal(G.act(s, 'choose', choice.id).ok, true);
  }
}

test('new game has usable supplies, a three-hour fire, and deterministic random state', () => {
  const s = fresh();
  assert.equal(G.day(s), 1); assert.equal(G.clock(s), '08:00');
  assert.equal(G.phase(s), 'day'); assert.equal(s.fireFuel, 180);
  assert.equal(G.recipeReason(s, 'axe'), '');
  assert.deepEqual(fresh(), s);
});

test('gathering advances time, consumes food and fuel, and grants real inventory items', () => {
  const s = fresh();
  assert.equal(G.act(s, 'gather', 'branches').ok, true);
  assert.equal(G.clock(s), '08:45'); assert.equal(s.hunger, 75.75);
  assert.equal(s.fireFuel, 135); assert.equal(s.inventory.wood, 4); assert.equal(s.inventory.twig, 6);
});

test('invalid locations, unavailable actions, and missing materials do not change state', () => {
  const s = fresh();
  for (const [type, id] of [['gather', 'chop'], ['craft', 'spear'], ['travel', 'unknown'], ['use', 'medicine']]) {
    const before = JSON.stringify(s);
    assert.equal(G.act(s, type, id).ok, false);
    assert.equal(JSON.stringify(s), before);
  }
});

test('crafting consumes the listed materials once and cannot duplicate a unique tool', () => {
  const s = fresh();
  assert.equal(G.act(s, 'craft', 'axe').ok, true);
  assert.equal(s.inventory.axe, 1); assert.equal(s.inventory.twig, 2); assert.equal(s.inventory.flint, 0);
  assert.equal(s.durability.axe, 24);
  const before = JSON.stringify(s);
  assert.equal(G.act(s, 'craft', 'axe').ok, false);
  assert.equal(JSON.stringify(s), before);
});

test('tools break on their last use but the completed action still yields resources', () => {
  const s = fresh();
  s.location = 'forest'; s.inventory.axe = 1; s.durability.axe = 1;
  assert.equal(G.act(s, 'gather', 'chop').ok, true);
  assert.equal(s.inventory.wood, 6); assert.equal(s.inventory.axe, 0); assert.equal(s.durability.axe, 0);
  resolve(s);
  assert.match(G.actionReason(s, 'chop'), /石斧/);
});

test('cooking requires the camp, real fuel through completion, and raw ingredients', () => {
  const s = fresh();
  s.fireFuel = 14;
  let before = JSON.stringify(s);
  assert.equal(G.act(s, 'craft', 'cookedBerry').ok, false); assert.equal(JSON.stringify(s), before);
  s.fireFuel = 15;
  assert.equal(G.act(s, 'craft', 'cookedBerry').ok, true);
  assert.equal(s.inventory.berry, 2); assert.equal(s.inventory.cookedBerry, 1); assert.equal(s.fireFuel, 0);
  s.location = 'forest'; s.fireFuel = 900; before = JSON.stringify(s);
  assert.equal(G.act(s, 'craft', 'cookedBerry').ok, false); assert.equal(JSON.stringify(s), before);
});

test('food has its declared effects and eating does not exceed stat caps', () => {
  const s = fresh(); s.hunger = 40; s.health = 80;
  assert.equal(G.act(s, 'use', 'carrot').ok, true);
  assert.equal(s.inventory.carrot, 0); assert.equal(s.hunger, 55.75); assert.equal(s.health, 81);
  s.inventory.cookedMeat = 1; s.hunger = 98; s.health = 99; s.sanity = 99;
  G.act(s, 'use', 'cookedMeat');
  assert.equal(s.hunger, 99.75); assert.equal(s.health, 100); assert.equal(s.sanity, 100);
});

test('raw food can kill a critically injured survivor and must not be followed by resurrection', () => {
  const s = fresh(); s.health = 4; s.inventory.mushroom = 1;
  G.act(s, 'use', 'mushroom');
  assert.equal(s.status, 'dead'); assert.equal(s.health, 0);
  assert.equal(G.act(s, 'gather', 'rest').ok, false);
});

test('the campfire never shields travel out of camp or the trip back', () => {
  for (const from of ['camp', 'forest']) {
    const s = fresh(); s.time = 1200; s.location = from; s.fireFuel = 900;
    G.act(s, 'travel', from === 'camp' ? 'forest' : 'camp');
    assert.equal(s.health, 86); assert.equal(s.sanity, 80);
    assert.equal(s.fireFuel, 840);
  }
});

test('a lit torch protects a night journey and expires according to elapsed time', () => {
  const s = fresh(); s.time = 1200; s.torchFuel = 65; s.fireFuel = 0;
  G.act(s, 'travel', 'forest');
  assert.equal(s.health, 100); assert.equal(s.torchFuel, 5);
  resolve(s);
  s.event = null;
  G.act(s, 'gather', 'forestBranches');
  assert.equal(s.torchFuel, 0); assert.ok(s.health < 100);
});

test('relighting the campfire protects the survivor before the stoking time elapses', () => {
  const s = fresh(); s.time = 1200; s.health = 1; s.fireFuel = 0;
  G.act(s, 'feedFire');
  assert.equal(s.status, 'playing'); assert.equal(s.health, 1); assert.equal(s.fireFuel, 110);
});

test('rain shortens exposed fires but does not shorten a stone firepit', () => {
  const s = fresh(); s.weather = 'rain'; s.fireFuel = 180;
  G.act(s, 'gather', 'grass');
  assert.equal(s.fireFuel, 112.5);
  const sheltered = fresh(); sheltered.weather = 'rain'; sheltered.structures.firepit = true;
  G.act(sheltered, 'gather', 'grass'); assert.equal(sheltered.fireFuel, 135);
});

test('hunger damage applies only to minutes actually spent starving', () => {
  const s = fresh(); s.hunger = 1.5; s.fireFuel = 0;
  G.act(s, 'travel', 'forest');
  assert.equal(s.hunger, 0); assert.equal(s.health, 94);
});

test('death interrupts an unfinished action without granting loot or rest healing', () => {
  for (const action of ['branches', 'rest']) {
    const s = fresh(); s.health = 1; s.hunger = 0;
    const wood = s.inventory.wood;
    G.act(s, 'gather', action);
    assert.equal(s.status, 'dead'); assert.equal(s.health, 0); assert.equal(s.inventory.wood, wood);
    assert.equal(s.time, 485);
  }
});

test('exhausted resources recover at 06:00, with a new weather forecast', () => {
  const s = fresh(); s.time = 1770; s.depleted.branches = 5; s.fireFuel = 800;
  assert.match(G.actionReason(s, 'branches'), /采尽/);
  G.act(s, 'gather', 'rest');
  assert.equal(G.nights(s), 1); assert.equal(G.actionReason(s, 'branches'), '');
  assert.ok(s.logs.some(log => log.title === '你又见到了太阳'));
});

test('event choices enforce supplies and block unrelated actions until resolved', () => {
  const s = fresh(); s.event = 'hound';
  for (const [type, id] of [['gather', 'grass'], ['craft', 'axe'], ['choose', 'fight'], ['choose', 'distract']]) {
    const before = JSON.stringify(s); assert.equal(G.act(s, type, id).ok, false); assert.equal(JSON.stringify(s), before);
  }
  assert.equal(G.act(s, 'choose', 'run').ok, true); assert.equal(s.event, null); assert.equal(s.health, 92); assert.equal(s.hunger, 72);
});

test('sleep requires a tent, nighttime, enough food and enough fuel', () => {
  const s = fresh(); s.time = 1200;
  assert.match(G.sleepReason(s), /帐篷/);
  s.structures.tent = true; assert.match(G.sleepReason(s), /燃烧/);
  s.fireFuel = 700; s.hunger = 20; assert.match(G.sleepReason(s), /吃饱/);
  s.hunger = 80; s.health = 30; s.sanity = 30;
  assert.equal(G.act(s, 'sleep').ok, true);
  assert.equal(G.clock(s), '06:00'); assert.equal(G.nights(s), 1); assert.equal(s.hunger, 50); assert.equal(s.health, 55);
});

test('seven nights alone do not win; a beacon and a return to camp are required', () => {
  const s = fresh(); s.time = 10320; s.fireFuel = 900;
  G.act(s, 'gather', 'rest');
  assert.equal(G.nights(s), 7); assert.equal(s.status, 'playing');
  s.structures.beacon = true; s.location = 'forest';
  G.act(s, 'gather', 'forestBranches'); resolve(s); assert.equal(s.status, 'playing');
  G.act(s, 'travel', 'camp'); assert.equal(s.status, 'won');
  assert.equal(G.restore(JSON.stringify(s)).status, 'won');
});

test('the seventh dawn triggers the ending at camp, and endless play can continue', () => {
  const s = fresh(); s.time = 10320; s.fireFuel = 900; s.structures.beacon = true;
  G.act(s, 'gather', 'rest'); assert.equal(s.time, 10440); assert.equal(s.status, 'won');
  s.status = 'playing'; s.endless = true;
  assert.equal(G.act(s, 'gather', 'branches').ok, true); assert.equal(s.status, 'playing');
});

test('a save round trip preserves the journey, tools, choices and inventory', () => {
  const s = fresh(); G.act(s, 'craft', 'axe'); s.event = 'rabbit';
  const restored = G.restore(JSON.stringify(s));
  for (const key of ['time', 'health', 'hunger', 'sanity', 'fireFuel', 'seed', 'event']) assert.equal(restored[key], s[key]);
  for (const id of Object.keys(s.inventory)) assert.equal(restored.inventory[id], s.inventory[id]);
  assert.equal(restored.durability.axe, 24);
  assert.deepEqual(restored.logs, s.logs);
});

test('invalid or foreign saves cannot create malformed or impossible runtime states', () => {
  assert.throws(() => G.restore('not json'), /JSON/);
  for (const change of [s => { s.version = 99; }, s => { s.location = '__proto__'; }, s => { s.hunger = NaN; }, s => { s.fireFuel = -5; }, s => { s.inventory.wood = -3; }, s => { s.event = 'unknown'; }, s => { s.health = 0; }, s => { s.inventory.axe = 1; s.durability.axe = 0; }, s => { s.status = 'won'; }]) {
    const s = fresh(); change(s); assert.throws(() => G.restore(s));
  }
});

test('imported logs are bounded strings, and unknown object keys are ignored', () => {
  const s = fresh(); s.admin = true; s.inventory.cheat = 100; s.logs[0].text = '<img src=x onerror=alert(1)>';
  const restored = G.restore(JSON.stringify(s));
  assert.equal(restored.admin, undefined); assert.equal(restored.inventory.cheat, undefined);
  assert.equal(restored.logs[0].text, s.logs[0].text);
});

test('a fading torch can be replaced before a long night journey', () => {
  const s = fresh(); s.time = 1200; s.location = 'forest'; s.fireFuel = 0; s.torchFuel = 20; s.inventory.torch = 1;
  assert.equal(G.act(s, 'use', 'torch').ok, true);
  assert.equal(s.torchFuel, 175); assert.equal(s.inventory.torch, 0); assert.equal(s.health, 100);
});

test('a player can gather every supply, build the camp and reach the seven-night ending', () => {
  const playThrough = require('./survival-run.cjs');
  for (const seed of [20260913, 314159, 42]) {
    const { state, operations } = playThrough(seed);
    assert.ok(state.structures.firepit && state.structures.tent && state.structures.beacon);
    assert.ok(operations < 1800);
    assert.ok(G.restore(JSON.stringify(state)));
  }
});
