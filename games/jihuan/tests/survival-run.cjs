'use strict';
const assert = require('node:assert/strict');
const G = require('../game.js');

// A reproducible player route. All supplies, buildings and elapsed time come from public actions.
module.exports = function playThrough(seed) {
  let state = G.createState(seed);
  const trace = [];
  let operations = 0;
  const stock = id => G.count(state, id);
  const totalFood = () => Object.keys(G.ITEMS).reduce((sum, id) => sum + (G.ITEMS[id].food && (G.ITEMS[id].food.health ?? 0) >= 0 ? G.ITEMS[id].food.hunger * stock(id) : 0), 0);
  const fail = message => `${message}\n${trace.slice(-25).join('\n')}\nInventory: ${JSON.stringify(state.inventory)}`;

  function raw(type, id) {
    if (state.status === 'won') return;
    assert.ok(++operations < 1800, fail('Player route exceeded its action budget'));
    trace.push(`D${G.day(state)} ${G.clock(state)} ${state.location} ${type}:${id || ''} hp=${state.health} hunger=${state.hunger}`);
    const result = G.act(state, type, id);
    assert.equal(result.ok, true, fail(result.message));
    assert.notEqual(state.status, 'dead', fail(state.endReason));
    while (state.event) {
      const choices = G.EVENTS[state.event].choices;
      const choice = choices.find(c => c.id === 'open') || choices.find(c => c.id === 'leave') || choices.find(c => c.id === 'distract' && !G.choiceReason(state, c)) || choices.find(c => c.id === 'fight' && !G.choiceReason(state, c)) || choices.find(c => c.id === 'run');
      raw('choose', choice.id);
    }
  }

  function eat(target = 70) {
    while (state.hunger < target && state.status === 'playing') {
      const id = ['stew', 'cookedMeat', 'cookedFish', 'cookedCarrot', 'cookedBerry', 'cookedMushroom', 'carrot', 'berry'].find(id => stock(id));
      if (!id) break;
      raw('use', id);
    }
  }

  function perform(type, id) {
    if (state.status !== 'playing') return;
    if (state.hunger < 45) eat();
    const minutes = type === 'travel' ? G.travelTime(state, id) : type === 'gather' ? G.ACTIONS[id].minutes : type === 'craft' ? G.RECIPES.find(r => r.id === id).minutes : 0;
    const time = G.minuteOfDay(state);
    const crossesNight = G.phase(state) === 'night' || time + minutes > 1200;
    if (crossesNight && (state.location !== 'camp' || type === 'travel')) {
      if (state.torchFuel < minutes + 10) {
        if (!stock('torch')) raw('craft', 'torch');
        if (state.hunger < 30) eat();
        raw('use', 'torch');
      }
    } else if (crossesNight && type !== 'feedFire') {
      while (state.fireFuel / G.fireRate(state) < minutes + 15 && stock('wood')) raw('feedFire');
    }
    raw(type, id);
  }

  const go = id => { if (state.location !== id && state.status === 'playing') perform('travel', id); };
  function collect(id, times) {
    for (let i = 0; i < times && state.status === 'playing' && !G.actionReason(state, id); i++) perform('gather', id);
  }
  function gatherFood() {
    go('meadow'); collect('carrots', 4); collect('fieldGrass', 2); go('camp');
  }
  function gatherWood() {
    go('forest'); collect('chop', 6); go('camp');
  }
  function gatherStone() {
    go('quarry'); collect('looseStones', 4); go('camp');
  }
  function rope(amount) {
    while (stock('rope') < amount && stock('grass') >= 3 && state.status === 'playing') perform('craft', 'rope');
  }
  function restToMorning() {
    eat(80);
    if (G.phase(state) === 'night' && state.structures.tent) {
      const duration = (1800 - G.minuteOfDay(state)) % 1440 || 1440;
      while (state.fireFuel / G.fireRate(state) < duration && stock('wood')) raw('feedFire');
      eat(65);
      if (!G.sleepReason(state)) { raw('sleep'); return; }
    }
    perform('gather', 'rest');
  }

  perform('craft', 'axe');
  gatherFood();
  gatherWood();

  for (let decisions = 0; decisions < 180 && state.status === 'playing'; decisions++) {
    go('camp');
    if (state.hunger < 55) eat();
    if (G.phase(state) === 'night') { restToMorning(); continue; }
    if (state.health < 70 || state.sanity < 45) { perform('gather', 'rest'); continue; }
    if (totalFood() + state.hunger < 170) { gatherFood(); continue; }
    if (!stock('axe')) {
      if (stock('flint') < 2) gatherStone();
      if (stock('twig') < 2) collect('branches', 2);
      perform('craft', 'axe'); continue;
    }
    if (stock('wood') < 16) { gatherWood(); continue; }
    if (!state.structures.firepit) {
      if (stock('stone') < 6) gatherStone();
      perform('craft', 'firepit'); continue;
    }
    if (stock('grass') < 14) { go('meadow'); collect('fieldGrass', 3); go('camp'); continue; }
    if (!state.structures.tent) { rope(2); perform('craft', 'tent'); continue; }
    if (!state.structures.beacon) {
      if (stock('relic') < 3 && (state.depleted.relicSearch || 0) < 2) {
        go('ruins'); collect('relicSearch', Math.min(2, 3 - stock('relic')));
        if (!stock('gold')) collect('inscriptions', 1);
        go('camp'); continue;
      }
      if (stock('stone') < 6) { gatherStone(); continue; }
      if (stock('relic') >= 3) { rope(2); perform('craft', 'beacon'); continue; }
    }
    // Reload periodically to exercise persistence during a real journey.
    if (decisions % 4 === 0) state = G.restore(JSON.stringify(state));
    restToMorning();
  }
  assert.equal(state.status, 'won', fail('The route did not reach the ending'));
  assert.ok(G.nights(state) >= 7); assert.ok(state.structures.beacon); assert.ok(state.health > 0);
  return { state, operations, trace };
};
