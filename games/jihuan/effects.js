(function () {
  'use strict';

  const G = window.EmberGame;
  const scene = document.querySelector('.landscape-card');
  const canvas = document.querySelector('#weather-canvas');
  const layer = document.querySelector('#fx-layer');
  const context = canvas?.getContext('2d');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set();
  const numberFrames = new Set();
  const numberValues = new Map();
  let preferred = true;
  let world = null;
  let visible = true;
  let frame = 0;
  let lastFrame = 0;
  let canvasWidth = 1;
  let canvasHeight = 1;
  let particleSignature = '';
  let particles = [];
  let fireOrigin = { x: 0, y: 0 };
  let echoAnimation = null;
  let phaseAnimation = null;
  try { preferred = localStorage.getItem('ember-effects') !== 'off'; } catch { /* Keep effects local to this visit. */ }

  const enabled = () => preferred && !motionQuery.matches;
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const viewportContains = rect => rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  const canDraw = () => enabled() && context && world?.status === 'playing' && visible && !document.hidden && !document.querySelector('dialog[open]');

  function animate(element, frames, options, finished) {
    if (!enabled() || document.hidden || !element?.animate) { finished?.(); return null; }
    const animation = element.animate(frames, { ...options, fill: 'none' });
    animations.add(animation);
    if (animations.size > 64) animations.values().next().value.cancel();
    const clean = () => { animations.delete(animation); finished?.(); };
    animation.finished.then(clean, clean);
    return animation;
  }

  function flash(element) {
    if (!element || !enabled()) return;
    animate(element, [
      { transform: 'scale(1) rotate(0deg)', filter: 'brightness(1)' },
      { transform: 'scale(1.06) rotate(-2deg)', filter: 'brightness(1.45)', offset: .28 },
      { transform: 'scale(1) rotate(0deg)', filter: 'brightness(1)' },
    ], { duration: 520, easing: 'ease-out' });
  }

  function scenePoint(x, y) {
    const art = scene.querySelector('.landscape').getBoundingClientRect();
    const box = scene.getBoundingClientRect();
    const scale = Math.max(art.width / 1000, art.height / 390);
    return { x: art.left - box.left + (art.width - 1000 * scale) / 2 + x * scale, y: art.top - box.top + (art.height - 390 * scale) / 2 + y * scale };
  }

  function positionHotspots() {
    for (const hotspot of scene.querySelectorAll('.scene-hotspot')) {
      const point = scenePoint(Number(hotspot.dataset.x), Number(hotspot.dataset.y));
      hotspot.style.left = `${Math.max(35, Math.min(scene.clientWidth - 35, point.x))}px`;
      hotspot.style.top = `${Math.max(120, Math.min(scene.clientHeight - 85, point.y))}px`;
    }
    fireOrigin = scenePoint(610, 293);
  }

  function resize() {
    if (!context) return;
    const size = canvas.getBoundingClientRect();
    canvasWidth = Math.max(1, size.width); canvasHeight = Math.max(1, size.height);
    const density = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(canvasWidth * density); canvas.height = Math.round(canvasHeight * density);
    context.setTransform(density, 0, 0, density, 0, 0);
    positionHotspots();
    particleSignature = '';
    seedParticles();
  }

  function ember(burst = false) {
    return { kind: 'ember', x: fireOrigin.x + (Math.random() - .5) * 29, y: fireOrigin.y + 15, vx: (Math.random() - .3) * (burst ? 60 : 14), vy: -20 - Math.random() * (burst ? 85 : 35), age: 0, life: 1 + Math.random() * 2.4, size: .8 + Math.random() * 1.8, burst };
  }
  function raindrop(initial = false) {
    return { kind: 'rain', x: Math.random() * (canvasWidth + 100), y: initial ? Math.random() * canvasHeight : -25, vx: -65, vy: 320 + Math.random() * 190, length: 9 + Math.random() * 12, age: 0, life: 8 };
  }
  function leaf(initial = false) {
    return { kind: 'leaf', x: initial ? Math.random() * canvasWidth : -14, y: Math.random() * canvasHeight * .8, vx: 12 + Math.random() * 24, vy: 3 + Math.random() * 6, angle: Math.random() * 6.28, size: 1.7 + Math.random() * 1.8, age: 0, life: 40 };
  }
  function seedParticles() {
    if (!world || !context) return;
    const signature = `${world.weather}:${world.phase}:${world.location}:${world.fireFuel > 0}:${Math.round(canvasWidth)}`;
    if (signature === particleSignature) return;
    particleSignature = signature;
    particles = [];
    if (world.weather === 'rain') particles.push(...Array.from({ length: 48 }, () => raindrop(true)));
    else if (world.phase !== 'night') particles.push(...Array.from({ length: 7 }, () => leaf(true)));
    if (world.location === 'camp' && world.fireFuel > 0) {
      for (let i = 0; i < 16; i++) {
        const particle = ember(); particle.age = Math.random() * particle.life; particle.y += particle.vy * particle.age; particles.push(particle);
      }
    }
  }

  function draw(now) {
    frame = 0;
    if (!canDraw()) { lastFrame = 0; return; }
    frame = requestAnimationFrame(draw);
    if (lastFrame && now - lastFrame < 30) return;
    const dt = Math.min(.06, lastFrame ? (now - lastFrame) / 1000 : .033);
    lastFrame = now;
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    for (let index = particles.length - 1; index >= 0; index--) {
      let p = particles[index];
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.age > p.life || p.y > canvasHeight + 25 || p.x > canvasWidth + 40) {
        if (p.burst) { particles.splice(index, 1); continue; }
        p = particles[index] = p.kind === 'ember' ? ember() : p.kind === 'rain' ? raindrop() : leaf();
      }
      context.save();
      if (p.kind === 'ember') {
        context.globalCompositeOperation = 'lighter';
        context.globalAlpha = Math.max(0, Math.sin(Math.PI * p.age / p.life)) * .8;
        context.fillStyle = p.size > 1.7 ? '#f6b65f' : '#e58a42';
        context.fillRect(p.x, p.y, p.size, p.size * 1.5);
      } else if (p.kind === 'rain') {
        context.strokeStyle = '#d1d8c7'; context.globalAlpha = .2; context.lineWidth = .7;
        context.beginPath(); context.moveTo(p.x, p.y); context.lineTo(p.x - p.length * .18, p.y + p.length); context.stroke();
      } else {
        context.translate(p.x, p.y + Math.sin(p.age * 1.3 + p.angle) * 7); context.rotate(p.angle + p.age);
        context.globalAlpha = .36; context.fillStyle = '#c7a467';
        context.beginPath(); context.ellipse(0, 0, p.size * 1.8, p.size * .7, 0, 0, Math.PI * 2); context.fill();
      }
      context.restore();
    }
  }

  function updatePlayback() {
    document.body.classList.toggle('effects-off', !enabled());
    if (canDraw() && !frame) { lastFrame = 0; seedParticles(); frame = requestAnimationFrame(draw); }
    if (!canDraw()) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0; lastFrame = 0;
      if (!enabled()) context?.clearRect(0, 0, canvasWidth, canvasHeight);
    }
  }

  function settleNumbers() {
    for (const id of numberFrames) cancelAnimationFrame(id);
    numberFrames.clear();
    for (const [element, value] of numberValues) if (element.isConnected) element.textContent = String(Math.ceil(value));
    numberValues.clear();
  }

  function capture(state) {
    settleNumbers();
    return { health: state.health, hunger: state.hunger, sanity: state.sanity, temperature: G.temperature(state), phase: G.phase(state), day: G.day(state), nights: G.nights(state), location: state.location, inventory: { ...state.inventory }, logId: state.logId };
  }

  function sync(state) {
    world = { phase: G.phase(state), weather: state.weather, location: state.location, fireFuel: state.fireFuel, status: state.status };
    document.body.dataset.weather = state.weather;
    document.body.classList.toggle('in-danger', state.status === 'playing' && (state.health < 30 || !G.hasLight(state)));
    positionHotspots(); seedParticles(); updatePlayback();
  }

  function toggle() {
    preferred = !preferred;
    try { localStorage.setItem('ember-effects', preferred ? 'on' : 'off'); } catch { /* Optional preference. */ }
    if (!enabled()) {
      for (const animation of [...animations]) animation.cancel();
      settleNumbers();
      layer.replaceChildren();
      scene.style.setProperty('--look-x', '0'); scene.style.setProperty('--look-y', '0');
    }
    updatePlayback();
    return enabled();
  }

  function floatStat(id, previous, next) {
    const element = document.querySelector(`#stat-${id}`);
    if (!element) return;
    const box = element.getBoundingClientRect();
    const delta = Math.ceil(next) - Math.ceil(previous);
    if (!delta || !viewportContains(box)) return;
    const node = document.createElement('span');
    node.className = `stat-float${delta < 0 ? ' negative' : ''}`;
    node.textContent = `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;
    node.style.left = `${box.left + box.width / 2}px`; node.style.top = `${box.top - 3}px`;
    layer.append(node);
    animate(node, [{ opacity: 0, transform: 'translate(-50%, 5px) scale(.7)' }, { opacity: 1, transform: 'translate(-50%, -18px) scale(1.05)', offset: .22 }, { opacity: 0, transform: 'translate(-50%, -53px) scale(.95)' }], { duration: 1150, easing: 'ease-out' }, () => node.remove());
    const start = performance.now();
    numberValues.set(element, next);
    function tick(now) {
      if (!element.isConnected) { numberValues.delete(element); return; }
      if (!enabled()) { element.textContent = String(Math.ceil(next)); numberValues.delete(element); return; }
      const fraction = Math.min(1, (now - start) / 330);
      element.textContent = String(Math.ceil(previous + (next - previous) * (1 - Math.pow(1 - fraction, 3))));
      if (fraction < 1) {
        const id = requestAnimationFrame(time => { numberFrames.delete(id); tick(time); }); numberFrames.add(id);
      } else { element.textContent = String(Math.ceil(next)); numberValues.delete(element); }
    }
    const frameId = requestAnimationFrame(now => { numberFrames.delete(frameId); tick(now); }); numberFrames.add(frameId);
  }

  function flyLoot(item, amount, origin, index) {
    const target = document.querySelector(`[data-item="${item}"]`);
    let targetBox = target?.getBoundingClientRect();
    if (!viewportContains(targetBox)) targetBox = document.querySelector('.mobile-shortcuts [data-command="bag"]')?.getBoundingClientRect();
    let from = origin;
    if (!viewportContains(from)) from = document.querySelector('#inventory-grid')?.getBoundingClientRect();
    if (!viewportContains(from)) return;
    const x = from.left + from.width / 2;
    const y = from.top + Math.min(from.height / 2, 35) + index * 29;
    const hasTarget = viewportContains(targetBox);
    const tx = hasTarget ? targetBox.left + targetBox.width / 2 - x : 14;
    const ty = hasTarget ? targetBox.top + targetBox.height / 2 - y : -70;
    const node = document.createElement('span');
    node.className = 'loot-flight'; node.innerHTML = `${icon(G.ITEMS[item].icon)}<span>+${amount} ${G.ITEMS[item].name}</span>`;
    node.style.left = `${x}px`; node.style.top = `${y}px`;
    layer.append(node);
    animate(node, [
      { transform: 'translate(-50%, -50%) scale(.7) rotate(-9deg)', opacity: 0 },
      { transform: 'translate(-50%, calc(-50% - 28px)) scale(1) rotate(-3deg)', opacity: 1, offset: .2 },
      { transform: `translate(calc(-50% + ${tx * .5}px), calc(-50% + ${ty * .5 - 45}px)) scale(.9) rotate(5deg)`, opacity: 1, offset: .64 },
      { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(.25) rotate(12deg)`, opacity: 0 },
    ], { duration: 940, delay: index * 90, easing: 'cubic-bezier(.25,.6,.4,1)' }, () => { node.remove(); if (hasTarget && target?.isConnected) flash(target); });
  }

  function echo(title, symbol) {
    const element = document.querySelector('#action-echo');
    echoAnimation?.cancel();
    element.replaceChildren();
    const glyph = document.createElement('span'); glyph.innerHTML = icon(symbol);
    const label = document.createElement('span'); label.textContent = title;
    element.append(glyph, label);
    echoAnimation = animate(element, [{ opacity: 0, transform: 'translateY(8px) rotate(-3deg)' }, { opacity: 1, transform: 'translateY(0) rotate(-1deg)', offset: .16 }, { opacity: 1, transform: 'translateY(0) rotate(-1deg)', offset: .72 }, { opacity: 0, transform: 'translateY(-8px) rotate(1deg)' }], { duration: 1600, easing: 'ease-out' });
  }

  function phaseChange(next, dawn) {
    const element = document.querySelector('#phase-banner');
    const content = dawn ? ['又活过了一夜', '天亮了。你还有机会。', 'sun'] : next === 'night' ? ['黑夜，来了。', '守住火光，别让影子靠近。', 'moon'] : next === 'dusk' ? ['暮色正在逼近', '天黑之前，准备好你的火。', 'sun'] : ['晨光穿过了森林', '新的一天，新的选择。', 'sun'];
    phaseAnimation?.cancel();
    element.innerHTML = `${icon(content[2])}<strong>${content[0]}</strong><small>${content[1]}</small>`;
    phaseAnimation = animate(element, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)', offset: .18 }, { opacity: 1, transform: 'translateY(0)', offset: .77 }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 2600, easing: 'ease-out' });
  }

  function play(previous, state, action) {
    if (!enabled() || !previous || document.querySelector('dialog[open]')) return;
    for (const id of ['health', 'hunger', 'sanity']) floatStat(id, previous[id], state[id]);
    floatStat('temperature', previous.temperature, G.temperature(state));
    const gains = Object.keys(G.ITEMS).filter(id => (state.inventory[id] || 0) > (previous.inventory[id] || 0)).slice(0, 4);
    gains.forEach((id, index) => flyLoot(id, state.inventory[id] - (previous.inventory[id] || 0), action.origin, index));
    if (state.health < previous.health - 1) {
      const hit = document.createElement('span'); hit.className = 'screen-hit'; layer.append(hit);
      animate(hit, [{ opacity: 0 }, { opacity: .8, offset: .2 }, { opacity: 0 }], { duration: 750, easing: 'ease-out' }, () => hit.remove());
      const health = document.querySelector('#stat-health')?.closest('.stat-card');
      animate(health, [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 260 });
    }
    if (action.type === 'feedFire' || action.id === 'firepit') {
      particles.push(...Array.from({ length: 24 }, () => ember(true)));
      particles = particles.slice(-120);
      animate(scene.querySelector('.scene-firelight'), [{ opacity: 1, transform: 'scale(1.7)' }, { opacity: .5, transform: 'scale(1)' }], { duration: 1050, easing: 'ease-out' });
      echo('火光，重新旺了起来。', 'campfire');
    } else if (action.type === 'craft') {
      echo(`制成 · ${G.RECIPES.find(r => r.id === action.id)?.name || '新物品'}`, 'axe');
    } else if (action.type === 'travel') {
      animate(scene.querySelector('.landscape'), [{ opacity: .25, transform: 'scale(1.06) translateX(9px)' }, { opacity: 1, transform: 'scale(1) translateX(0)' }], { duration: 650, easing: 'ease-out' });
      echo(`抵达 · ${G.LOCATIONS[state.location].name}`, 'compass');
    } else if (action.type === 'gather') echo(G.ACTIONS[action.id].name, G.ACTIONS[action.id].icon);
    else if (action.type === 'use') echo(`${G.ITEMS[action.id].food ? '吃下' : '使用'} · ${G.ITEMS[action.id].name}`, G.ITEMS[action.id].icon);
    if (previous.nights < G.nights(state) || previous.phase !== G.phase(state)) phaseChange(G.phase(state), previous.nights < G.nights(state));
    if (state.logId !== previous.logId) {
      const entry = document.querySelector('.journal-entry:first-child');
      if (viewportContains(entry?.getBoundingClientRect())) animate(entry, [{ opacity: .15, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 450 });
    }
  }

  function enterView(id) {
    animate(document.querySelector(`#${id}-view`), [{ opacity: .35, transform: 'translateY(8px) rotate(-.3deg)' }, { opacity: 1, transform: 'translateY(0) rotate(0)' }], { duration: 240, easing: 'ease-out' });
  }

  document.addEventListener('pointerdown', event => {
    if (!enabled()) return;
    const button = event.target.closest('button');
    if (!button || button.disabled || button.closest('dialog')) return;
    const node = document.createElement('span'); node.className = 'click-burst';
    node.style.left = `${event.clientX - 4}px`; node.style.top = `${event.clientY - 4}px`; layer.append(node);
    animate(node, [{ opacity: .75, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(6)' }], { duration: 420, easing: 'ease-out' }, () => node.remove());
  });
  scene.addEventListener('pointermove', event => {
    if (!enabled() || event.pointerType !== 'mouse') return;
    const box = scene.getBoundingClientRect();
    scene.style.setProperty('--look-x', ((event.clientX - box.left) / box.width - .5).toFixed(3));
    scene.style.setProperty('--look-y', ((event.clientY - box.top) / box.height - .5).toFixed(3));
  });
  scene.addEventListener('pointerleave', () => { scene.style.setProperty('--look-x', '0'); scene.style.setProperty('--look-y', '0'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) settleNumbers(); updatePlayback(); });
  motionQuery.addEventListener('change', () => {
    if (!enabled()) { for (const animation of [...animations]) animation.cancel(); settleNumbers(); layer.replaceChildren(); }
    updatePlayback();
  });
  new ResizeObserver(resize).observe(scene);
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; updatePlayback(); }).observe(scene);
  new MutationObserver(updatePlayback).observe(document.querySelector('#game-dialog'), { attributes: true, attributeFilter: ['open'] });
  window.addEventListener('pagehide', () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    for (const animation of [...animations]) animation.cancel();
    settleNumbers();
  });
  window.addEventListener('pageshow', updatePlayback);
  resize(); updatePlayback();
  window.EmberEffects = { capture, sync, play, flash, enterView, toggle, enabled, preferred: () => preferred, reduced: () => motionQuery.matches };
})();
