(function () {
  'use strict';

  const G = window.EmberGame;
  const effects = window.EmberEffects;
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const icon = (id, extra = '') => `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const duration = minutes => {
    minutes = Math.max(0, Math.floor(minutes));
    if (minutes < 60) return `${minutes} 分钟`;
    return `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分` : ''}`;
  };
  const pad = value => String(value).padStart(2, '0');
  const dialog = $('#game-dialog');
  const tips = [
    '不要等到黑夜降临，才想起寻找木材。',
    '食物烤熟后更管饱。生蘑菇的代价，往往不止难吃。',
    '营地的火照不到远方。夜间赶路，记得点燃火把。',
    '风语草地的胡萝卜，能让一趟远行变得值得。',
    '工具会磨损。出发之前，看一眼行囊里的耐久。',
    '雨会让露天篝火烧得更快。用石块为它围一个家。',
    '有时，一朵野花比一块金矿更能安慰疲惫的心。',
    '资源会在清晨 06:00 恢复。给这片土地一点时间。',
    '睡到天亮之前，先吃饱，再把足够的木材放进火里。',
    '七夜之后，回到点亮信标的营地。会有人回应你的光。',
  ];
  let state;
  let view = 'explore';
  let craftFilter = 'tools';
  let inventoryFilter = 'all';
  let selectedItem = 'berry';
  let selectedLocation = 'camp';
  let journalExpanded = false;
  let modalMode = null;
  let endingDismissed = false;
  let pendingImport = null;
  let soundOn = false;
  let audioContext = null;
  let toastTimer;
  let saveWorks = true;
  let preserveUnreadableSave = false;
  let warnedAboutSave = false;
  let initialNotice = '';

  try {
    const saved = localStorage.getItem(G.SAVE_KEY);
    if (saved) {
      try { state = G.restore(saved); }
      catch (error) {
        try { localStorage.setItem(`${G.SAVE_KEY}-recovery`, saved); }
        catch { preserveUnreadableSave = true; saveWorks = false; }
        initialNotice = preserveUnreadableSave ? '旧存档无法读取，原文件已保留；这段新旅程请通过「存档」导出备份。' : '旧存档无法读取，已保留恢复副本并开启新的旅程。可通过「存档」重新导入有效存档。';
      }
    }
    soundOn = localStorage.getItem('ember-sound') === 'on';
  } catch { saveWorks = false; }
  state ||= G.createState();
  selectedLocation = state.location;

  function toast(message, error = false) {
    if (!message) return;
    clearTimeout(toastTimer);
    $('#toast-region').innerHTML = `<div class="toast${error ? ' error' : ''}">${icon(error ? 'help' : 'check')}<span>${escape(message)}</span></div>`;
    $('#toast-region').setAttribute('aria-live', dialog.open ? 'off' : 'polite');
    document.querySelectorAll('.dialog-toast').forEach(note => note.remove());
    if (dialog.open) {
      const note = document.createElement('p'); note.className = 'dialog-toast'; note.setAttribute('role', 'status'); note.textContent = message; $('#dialog-content').append(note);
    }
    toastTimer = setTimeout(() => { $('#toast-region').innerHTML = ''; document.querySelectorAll('.dialog-toast').forEach(note => note.remove()); }, error ? 5500 : 2900);
  }

  function save() {
    try {
      if (preserveUnreadableSave) throw new Error('The unreadable save could not be backed up');
      localStorage.setItem(G.SAVE_KEY, JSON.stringify(state));
      saveWorks = true;
    } catch {
      saveWorks = false;
      if (!warnedAboutSave) { toast('浏览器暂时无法保存进度，请用右上角「存档」导出备份。', true); warnedAboutSave = true; }
    }
    const label = $('#save-status');
    label.classList.toggle('failed', !saveWorks);
    label.innerHTML = `<span></span>${saveWorks ? '已自动保存' : '暂未保存'}`;
    label.title = saveWorks ? '每次行动都会保存在当前浏览器，关闭页面后可以继续' : '请导出存档，避免进度丢失';
  }

  function playSound(kind = 'action', id = '') {
    if (!soundOn) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audioContext ||= new Audio();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      const start = audioContext.currentTime;
      const noiseLength = kind === 'travel' ? .38 : kind === 'feedFire' ? .24 : .13;
      const buffer = audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate * noiseLength), audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const noise = audioContext.createBufferSource(); noise.buffer = buffer;
      const filter = audioContext.createBiquadFilter(); filter.type = 'bandpass';
      filter.frequency.value = kind === 'feedFire' ? 2500 : kind === 'travel' ? 370 : id === 'chop' || id === 'mining' ? 500 : 1600;
      filter.Q.value = .8;
      const gain = audioContext.createGain(); gain.gain.setValueAtTime(.045, start); gain.gain.exponentialRampToValueAtTime(.0001, start + noiseLength);
      noise.connect(filter); filter.connect(gain); gain.connect(audioContext.destination); noise.start(start);
      noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
      if (kind === 'craft' || kind === 'use' || id === 'chop' || kind === 'action') {
        const oscillator = audioContext.createOscillator(); const tone = audioContext.createGain();
        oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(id === 'chop' ? 170 : kind === 'craft' ? 660 : 390, start);
        oscillator.frequency.exponentialRampToValueAtTime(id === 'chop' ? 70 : kind === 'craft' ? 880 : 260, start + .15);
        tone.gain.setValueAtTime(.0001, start); tone.gain.exponentialRampToValueAtTime(.035, start + .008); tone.gain.exponentialRampToValueAtTime(.0001, start + .21);
        oscillator.connect(tone); tone.connect(audioContext.destination); oscillator.start(start); oscillator.stop(start + .22);
        oscillator.onended = () => { oscillator.disconnect(); tone.disconnect(); };
      }
    } catch { /* Audio is optional; a browser audio restriction must not interrupt play. */ }
  }

  function renderTimeAndStats() {
    const phase = G.phase(state);
    const now = G.minuteOfDay(state);
    const phaseName = { day: '白昼', dusk: '黄昏', night: '黑夜' }[phase];
    const until = phase === 'day' ? 1020 - now : phase === 'dusk' ? 1200 - now : now < 360 ? 360 - now : 1800 - now;
    document.body.dataset.phase = phase;
    document.body.dataset.location = state.location;
    for (const key of ['tent', 'firepit', 'beacon']) document.body.classList.toggle(`has-${key}`, state.structures[key]);
    document.body.classList.toggle('fire-out', state.fireFuel <= 0);
    $('#day-number').textContent = pad(G.day(state));
    $('#game-time').textContent = G.clock(state);
    $('#clock-weather').innerHTML = `${icon(G.WEATHER[state.weather].icon)}${G.WEATHER[state.weather].name} · ${G.WEATHER[state.weather].temperature}°C`;
    $('#time-marker').style.left = `${((now - 360 + 1440) % 1440) / 1440 * 100}%`;
    $('#phase-label').textContent = `${phaseName} · 还有 ${duration(until)}`;
    $('#world-hint').textContent = state.status === 'dead' ? '这一次的故事已经写完。翻阅手记，或开启新的旅程。' : state.status === 'won' ? '远方回应了你的光。你终于找到了回家的方向。' : !G.hasLight(state) ? '你正置身黑暗。下一次行动前，尽快点燃火把。' : state.hunger < 25 ? '饥饿正在逼近。点击行囊里的食物，给自己一点力气。' : state.endless ? '你选择留下。荒野不会因为你活下来，就变得温柔。' : '行动才会推进时间。天黑之前，备好食物和火。';
    const temp = G.temperature(state);
    const stats = [
      { id: 'health', name: '生命', icon: 'heart', value: Math.ceil(state.health), max: '/ 100', color: '#b96c51', fill: state.health, label: state.health >= 75 ? '还撑得住' : state.health >= 35 ? '身上的伤得处理了' : '生命垂危，尽快治疗', title: '生命归零，旅程就会结束。休息、熟食和草药可以恢复生命。', critical: state.health < 30 },
      { id: 'hunger', name: '饱食', icon: 'stomach', value: Math.ceil(state.hunger), max: '/ 100', color: '#c3a457', fill: state.hunger, label: state.hunger >= 65 ? '暂时不必挨饿' : state.hunger >= 25 ? '该找下一顿饭了' : '饥饿正在耗尽力气', title: '每小时消耗 3 饱食，归零后每小时损失 12 生命。点击行囊里的食物进食。', critical: state.hunger < 25 },
      { id: 'sanity', name: '理智', icon: 'brain', value: Math.ceil(state.sanity), max: '/ 100', color: '#9e8da2', fill: state.sanity, label: state.sanity >= 65 ? '头脑尚且清醒' : state.sanity >= 25 ? '树影似乎在动' : '那些低语越来越近了', title: '黑暗和危险探索会降低理智，低于 20 会持续损失生命。火光、野花和休息可以恢复理智。', critical: state.sanity < 25 },
      { id: 'temperature', name: '体感', icon: 'thermometer', value: temp, max: '°C', color: '#86a294', fill: Math.max(5, Math.min(100, (temp + 5) / 40 * 100)), label: temp >= 20 ? '火边还有温度' : temp >= 5 ? '有点冷，还能忍' : '寒冷正在伤害你', title: '体感受天气、昼夜、火光和斗篷影响。低于 5°C，每小时损失 4 生命。', critical: temp < 5 },
    ];
    $('#status-grid').innerHTML = stats.map(stat => `<div class="stat-card${stat.critical ? ' critical' : ''}" style="--stat-color:${stat.color};--stat-value:${stat.fill}%" title="${stat.title}"><span class="stat-icon">${icon(stat.icon)}</span><div class="stat-body"><div class="stat-top"><span class="stat-name">${stat.name}</span><span class="stat-value"><b id="stat-${stat.id}">${stat.value}</b><small>${stat.max}</small></span></div><div class="stat-track" role="meter" aria-label="${stat.name}" aria-valuenow="${stat.value}" aria-valuemin="${stat.id === 'temperature' ? '-20' : '0'}" aria-valuemax="${stat.id === 'temperature' ? '60' : '100'}"><span></span></div><div class="stat-label">${stat.label}</div></div></div>`).join('');
  }

  function renderScene() {
    const location = G.LOCATIONS[state.location];
    $('#location-name').textContent = location.name;
    $('#location-subtitle').textContent = location.subtitle;
    $('#scene-description').textContent = location.description;
    $('#scene-title').textContent = `${location.name}：${location.description}`;
    const tag = $('#location-tag');
    tag.classList.toggle('danger', location.risk === '危险');
    tag.innerHTML = `${icon(location.risk === '危险' ? 'eye' : 'leaf')}${location.risk === '安稳' ? '一隅安稳' : location.risk === '留心' ? '保持警觉' : '危险地带'}`;
    const names = { camp: 'THE WOODLAND CAMP · 01', forest: 'THE WHISPERING PINES · 02', meadow: 'THE WINDSWEPT MEADOW · 03', quarry: 'THE SILENT QUARRY · 04', marsh: 'THE MISTY MARSH · 05', ruins: 'THE FORGOTTEN RUINS · 06' };
    $('#scene-coordinates').textContent = names[state.location];
    const here = state.location === 'camp';
    const flame = state.fireFuel > 0;
    const playable = state.status === 'playing' && !state.event;
    const canFeed = here && G.count(state, 'wood') > 0 && state.fireFuel < 900 && playable;
    const fire = $('#fire-strip');
    fire.classList.toggle('out', !flame);
    const fireText = flame ? `还可燃烧 ${duration(state.fireFuel / G.fireRate(state))}` : '添一根木材，就能重新燃起';
    const sleepReason = G.sleepReason(state);
    const coordinates = { forest: [[560, 221], [463, 281]], meadow: [[605, 257], [432, 286]], quarry: [[411, 261], [565, 252]], marsh: [[392, 274], [620, 274]], ruins: [[531, 274], [437, 219]] };
    const hotspots = here ? [
      { type: 'feedFire', id: '', label: flame ? '添柴' : '生火', x: 613, y: 269, hint: '木材 ×1 · 10 分钟', disabled: !canFeed },
      { type: 'gather', id: 'rest', label: '歇一会儿', x: 435, y: 262, hint: '休息 2 小时，恢复生命与理智', disabled: !playable },
    ] : location.actions.slice(0, 2).map((id, index) => ({ type: 'gather', id, label: G.ACTIONS[id].name, x: coordinates[state.location][index][0], y: coordinates[state.location][index][1], hint: G.actionReason(state, id) || `${G.ACTIONS[id].reward} · ${duration(G.ACTIONS[id].minutes)}`, disabled: !playable || !!G.actionReason(state, id) }));
    $('#scene-hotspots').innerHTML = hotspots.map(hotspot => `<button class="scene-hotspot" data-hotspot="true" data-action="${hotspot.type}" data-id="${hotspot.id}" data-x="${hotspot.x}" data-y="${hotspot.y}" style="left:${hotspot.x / 10}%;top:${hotspot.y / 3.9}%" ${hotspot.disabled ? 'disabled' : ''} aria-label="场景：${hotspot.label}" title="${escape(hotspot.hint)}"><span class="hotspot-dot" aria-hidden="true"></span><span class="hotspot-label">${hotspot.label}</span><small>${escape(hotspot.hint)}</small></button>`).join('');
    fire.innerHTML = `${icon('campfire')}<div class="fire-info"><div class="fire-title">${here ? flame ? '营火正在燃烧' : '营火已经熄灭' : '营地的火光'}<span>${fireText}</span></div><div class="fire-track"><span style="width:${Math.min(100, state.fireFuel / 960 * 100)}%"></span></div></div><span class="fire-description">${state.torchFuel > 0 ? `随身火把 · ${duration(state.torchFuel)}` : state.weather === 'rain' && !state.structures.firepit ? '雨水让木材燃烧得更快' : here ? '火光之内，暂得安宁。' : '营火只会照亮营地'}</span>${here ? `<button class="small-button" data-action="feedFire" ${canFeed ? '' : 'disabled'} title="消耗木材 ×1、10 分钟，增加 ${state.structures.firepit ? '2.5' : '2'} 小时燃料">${icon('wood')}添柴 <span>+${state.structures.firepit ? '2.5' : '2'}h</span></button>${state.structures.tent && G.phase(state) === 'night' ? `<button class="small-button sleep-button" data-action="sleep" title="${escape(sleepReason || '消耗时间到早晨 06:00，恢复 25 生命、25 理智')}" ${sleepReason || !playable ? 'disabled' : ''}>${icon('rest')}入睡</button>` : ''}` : `<button class="small-button" data-action="travel" data-id="camp" ${playable ? '' : 'disabled'} title="返回营地，耗时 ${duration(G.travelTime(state, 'camp'))}">${icon('tent')}返回营地 · ${duration(G.travelTime(state, 'camp'))}</button>`}`;
  }

  function renderActions() {
    $('#action-grid').innerHTML = G.LOCATIONS[state.location].actions.map((id, index) => {
      const action = G.ACTIONS[id];
      const reason = G.actionReason(state, id);
      const disabled = !!reason || state.status !== 'playing' || !!state.event;
      const reward = action.rest && state.structures.tent ? '生命 +20 · 理智 +20' : action.reward;
      return `<button class="action-card" data-action="gather" data-id="${id}" ${disabled ? 'disabled' : ''} title="${escape(reason || `${action.description} ${action.limit ? `今日剩余 ${Math.max(0, action.limit - (state.depleted[id] || 0))} 次，清晨恢复。` : ''}`)}"><span class="action-icon">${icon(action.icon)}</span><span class="action-content"><span class="action-title"><strong>${action.name}</strong><span class="action-time">${icon('clock')}${duration(action.minutes)}</span></span><span class="action-description">${action.description}</span><span class="action-bottom"><span class="action-reward">${escape(reason || reward)}</span><span class="action-shortcut">${disabled ? icon('lock') : `<kbd>${index + 1}</kbd>${icon('arrow')}`}</span></span></span></button>`;
    }).join('');
  }

  function renderCrafting() {
    const filters = [{ id: 'tools', label: '工具', icon: 'axe' }, { id: 'survival', label: '生存', icon: 'grass' }, { id: 'food', label: '烹饪', icon: 'bowl' }, { id: 'camp', label: '营地', icon: 'tent' }];
    $('#craft-filters').innerHTML = filters.map(f => `<button class="filter-button${craftFilter === f.id ? ' active' : ''}" data-craft-filter="${f.id}" aria-pressed="${craftFilter === f.id}">${icon(f.icon)}${f.label}</button>`).join('');
    $('#recipe-grid').innerHTML = G.RECIPES.filter(r => r.category === craftFilter).map(recipe => {
      const reason = G.recipeReason(state, recipe);
      const finished = (recipe.structure && state.structures[recipe.structure]) || (recipe.unique && G.count(state, recipe.output));
      const disabled = !!reason || state.status !== 'playing' || !!state.event;
      const label = finished ? '已完成' : recipe.structure ? '建造' : recipe.fire ? '烹饪' : '制作';
      const footer = finished ? (recipe.structure ? '已建造在营地' : '已装备在行囊') : reason.startsWith('还缺') ? '需要更多材料' : reason || (recipe.fire ? '需要营火' : recipe.structure ? '建造于营地' : '材料已备齐');
      return `<article class="recipe-card${!disabled ? ' available' : ''}"><div class="recipe-head">${icon(recipe.icon)}<div><h3>${recipe.name}</h3><div class="action-time">${icon('clock')}${duration(recipe.minutes)}</div></div></div><p>${recipe.description}</p><div class="recipe-costs">${Object.entries(recipe.cost).map(([id, amount]) => `<span class="cost-chip${G.count(state, id) < amount ? ' missing' : ''}">${icon(G.ITEMS[id].icon)}${G.ITEMS[id].name} ${G.count(state, id)}/${amount}</span>`).join('')}</div><div class="recipe-footer"><span class="recipe-reason">${escape(footer)}</span><button class="small-button" data-action="craft" data-id="${recipe.id}" title="${escape(reason || `${label}${recipe.name}，耗时${duration(recipe.minutes)}`)}" ${disabled ? 'disabled' : ''}>${finished ? icon('check') : ''}${label}</button></div></article>`;
    }).join('');
  }

  function renderMap() {
    $('#map-locations').innerHTML = Object.entries(G.LOCATIONS).map(([id, location]) => `<button class="map-location${state.location === id ? ' current' : ''}${selectedLocation === id ? ' selected' : ''}" style="left:${location.x}%;top:${location.y}%" data-location="${id}" aria-label="${location.name}${state.location === id ? '，你在这里' : ''}" aria-pressed="${selectedLocation === id}" title="${location.name} · ${location.risk}"><span class="map-pin">${icon(location.icon)}</span><span>${location.short}${state.location === id ? ' · 此处' : ''}</span></button>`).join('');
    const location = G.LOCATIONS[selectedLocation];
    const here = selectedLocation === state.location;
    const travelMinutes = G.travelTime(state, selectedLocation);
    const nightWarning = !here && G.phase(state) === 'night' && state.torchFuel < travelMinutes;
    const origin = G.LOCATIONS[state.location];
    const x1 = origin.x * 8, y1 = origin.y * 3.2, x2 = location.x * 8, y2 = location.y * 3.2;
    $('#map-route-path').setAttribute('d', here ? '' : `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 - 27} ${x2} ${y2}`);
    $('#map-detail').innerHTML = `<div><h3>${location.name}<span>${location.risk} · ${state.visited[selectedLocation] ? '已踏足' : '未探索'}</span></h3><p>${location.subtitle}</p>${nightWarning ? '<p class="map-warning">夜间赶路需要随身照明。你的火把不足以支撑全程，途中可能受伤。</p>' : ''}</div><button class="small-button" data-action="travel" data-id="${selectedLocation}" ${here || state.status !== 'playing' || state.event ? 'disabled' : ''}>${icon(here ? 'check' : 'compass')}${here ? '你在这里' : `前往 · ${duration(travelMinutes)}`}</button>`;
  }

  function renderGuide() {
    const guide = G.getGuide(state);
    const next = guide.steps.find(step => !step.done);
    const labels = { 'craft:tools': '去制作石斧', food: '去寻找食物', fire: '查看营地篝火', map: '查看世界地图', 'craft:camp': '查看营地蓝图', rest: '回到营火旁休整', return: '查看返营路线' };
    $('#guide-card').innerHTML = `<div class="guide-eyebrow"><span>${icon('compass')}生存指引</span><span>已熬过 <b>${G.nights(state)}</b> / 7 夜</span></div><h2>${guide.title}</h2><p class="guide-description">${guide.description}</p><ol class="guide-steps">${guide.steps.map(step => `<li class="${step.done ? 'done' : ''}"><span class="step-check" aria-label="${step.done ? '已完成' : '未完成'}">${step.done ? icon('check') : ''}</span><button data-guide="${step.target}">${step.label}</button></li>`).join('')}</ol><button class="guide-button" data-guide="${next?.target || 'map'}">${next ? labels[next.target] : '准备好了，继续探索'}${icon('arrow')}</button>`;
  }

  function renderInventory() {
    const allItems = Object.keys(G.ITEMS).filter(id => G.count(state, id) > 0);
    const filters = [{ id: 'all', label: '全部' }, { id: 'food', label: '食物' }, { id: 'material', label: '材料' }, { id: 'tool', label: '装备' }];
    $('#inventory-count').textContent = `${allItems.length} 种物品`;
    $('#inventory-filters').innerHTML = filters.map(f => `<button class="${inventoryFilter === f.id ? 'active' : ''}" data-inventory-filter="${f.id}" aria-pressed="${inventoryFilter === f.id}">${f.label}</button>`).join('');
    const items = allItems.filter(id => inventoryFilter === 'all' || G.ITEMS[id].category === inventoryFilter || (inventoryFilter === 'tool' && G.ITEMS[id].category === 'survival'));
    if (!items.includes(selectedItem)) selectedItem = items[0] || null;
    $('#inventory-grid').innerHTML = items.length ? items.map(id => {
      const item = G.ITEMS[id];
      return `<button class="inventory-item ${item.category}${selectedItem === id ? ' selected' : ''}" data-item="${id}" data-id="${id}" aria-label="${item.name}，${G.count(state, id)} 个${item.durability ? `，耐久 ${state.durability[id]}/${item.durability}` : ''}" aria-pressed="${selectedItem === id}" title="${item.name}：${item.description}">${icon(item.icon)}<span>${item.name}</span><b>${G.count(state, id)}</b>${item.durability ? `<i class="tool-durability" style="--durability:${state.durability[id] / item.durability * 100}%"></i>` : ''}</button>`;
    }).join('') + Array.from({ length: Math.max(0, Math.max(12, Math.ceil(items.length / 4) * 4) - items.length) }, () => '<span class="inventory-empty-slot" aria-hidden="true"></span>').join('') : '<p class="empty-inventory">这里还空着。<br>荒野会带来新的收获。</p>';
    const item = G.ITEMS[selectedItem];
    if (!item) $('#item-detail').innerHTML = '<p>采集、制作和奇遇获得的物品，都会放进你的行囊。</p>';
    else {
      let action = '';
      const usable = state.status === 'playing' && !state.event && !(item.use === 'torch' && state.torchFuel >= 175);
      if (item.food || item.use) {
        const label = item.food ? `食用 · +${item.food.hunger} 饱食` : item.use === 'flower' ? '闻一闻 · +6 理智' : item.use === 'medicine' ? '涂抹 · +25 生命' : state.torchFuel >= 175 ? '火把已点燃' : state.torchFuel > 0 ? '换新 · 3 小时' : '点燃 · 3 小时';
        action = `<button class="small-button" data-action="use" data-id="${selectedItem}" ${usable ? '' : 'disabled'} title="消耗 1 个${item.name}，耗时 5 分钟">${label}</button>`;
      } else action = `<small>${item.durability ? `耐久 ${state.durability[selectedItem]} / ${item.durability} · 自动使用` : selectedItem === 'coat' ? '已自动穿戴' : selectedItem === 'trap' ? '在草地布置' : '用于制作'}</small>`;
      $('#item-detail').innerHTML = `<div class="item-detail-top"><h3>${item.name}</h3>${action}</div><p class="${item.food?.health < 0 ? 'item-warning' : ''}">${item.description}</p>`;
    }
    $('#inventory-hint').textContent = state.torchFuel > 0 ? `火把正在燃烧 · 剩余 ${duration(state.torchFuel)}` : '点击物品查看用途，选择食物即可进食。';
  }

  function renderJournal() {
    const logs = state.logs.slice(-(journalExpanded ? 100 : 4)).reverse();
    $('#journal-list').innerHTML = logs.map(entry => `<article class="journal-entry ${entry.kind}"><time>${G.clock(entry)}<span>第 ${G.day(entry)} 天</span></time><div class="journal-content"><h3>${escape(entry.title)}</h3><p>${escape(entry.text)}</p></div></article>`).join('');
    $('#journal-toggle').innerHTML = `${journalExpanded ? '收起记录' : `展开记录（${state.logs.length}）`}${icon('chevron')}`;
    $('#journal-toggle').setAttribute('aria-expanded', String(journalExpanded));
  }

  function renderView() {
    document.body.dataset.view = view;
    for (const id of ['explore', 'craft', 'map']) $(`#${id}-view`).hidden = id !== view;
    document.querySelectorAll('.nav-button').forEach(button => {
      const selected = button.dataset.view === view;
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    const titles = { explore: '你打算怎么活下去？', craft: '能做的，都在这里。', map: '看看哪儿还有生路。' };
    $('#activity-title').innerHTML = `<span class="heading-dash"></span>${titles[view]}`;
    $('#activity-meta').innerHTML = view === 'explore' ? `行动才会推动时间 ${icon('clock')}` : view === 'craft' ? '每一件小物，都有用处' : `已探索 ${Object.keys(state.visited).length} / 6 处`;
  }

  function render() {
    renderTimeAndStats(); renderScene(); renderActions(); renderCrafting(); renderMap(); renderGuide(); renderInventory(); renderJournal(); renderView();
    const tipIndex = Math.floor(state.stats.actions / 4) % tips.length;
    $('#field-tip').textContent = tips[tipIndex]; $('#tip-number').textContent = pad(tipIndex + 1);
    $('#sound-button').innerHTML = icon(soundOn ? 'sound' : 'muted');
    $('#sound-button').setAttribute('aria-label', soundOn ? '关闭音效' : '开启音效');
    $('#sound-button').setAttribute('aria-pressed', String(soundOn));
    $('#sound-button').title = soundOn ? '关闭音效' : '开启音效';
    effects?.sync(state);
    presentPending();
  }

  function setView(next, scroll = false) {
    const changed = view !== next;
    view = next;
    renderView();
    if (changed) effects?.enterView(next);
    if (scroll) $('.activity-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function perform(type, id, trigger) {
    const focused = document.activeElement;
    const source = trigger || $(`.action-card[data-action="${CSS.escape(type)}"][data-id="${CSS.escape(id || '')}"]`) || focused;
    const restoreFocus = source === focused && focused?.dataset?.action === type;
    const sourceKind = source?.classList?.contains('scene-hotspot') ? '.scene-hotspot' : source?.classList?.contains('action-card') ? '.action-card' : '.small-button';
    const origin = source?.getBoundingClientRect?.();
    const previous = effects?.capture(state);
    const result = G.act(state, type, id);
    if (!result.ok) { toast(result.message, true); return; }
    if (type === 'choose') { dialog.close(); modalMode = null; }
    if (type === 'travel' && state.status === 'playing') { selectedLocation = state.location; view = 'explore'; }
    if (type === 'craft') {
      const recipe = G.RECIPES.find(r => r.id === id);
      if (recipe?.output) { selectedItem = recipe.output; inventoryFilter = 'all'; }
    }
    save(); render(); playSound(type, id);
    effects?.play(previous, state, { type, id, origin });
    if (!dialog.open && result.message) toast(result.message);
    if (restoreFocus && !dialog.open) {
      const selector = `${sourceKind}[data-action="${CSS.escape(type)}"]${id ? `[data-id="${CSS.escape(id)}"]` : ''}`;
      const nextButton = $(selector);
      if (nextButton && !nextButton.disabled) nextButton.focus({ preventScroll: true });
    }
  }

  function guideTo(target) {
    if (target.startsWith('craft:')) {
      craftFilter = target.split(':')[1]; renderCrafting(); setView('craft', true);
    } else if (target === 'food') {
      if (state.location === 'camp' && !G.actionReason(state, 'berries')) {
        setView('explore', true); $('[data-action="gather"][data-id="berries"]').focus({ preventScroll: true });
      } else { selectedLocation = 'meadow'; renderMap(); setView('map', true); }
    } else if (target === 'fire' || target === 'return' || target === 'rest') {
      if (state.location !== 'camp' || target === 'return') { selectedLocation = 'camp'; renderMap(); setView('map', true); }
      else if (target === 'rest') { setView('explore', true); $('[data-action="gather"][data-id="rest"]').focus({ preventScroll: true }); }
      else { $('#fire-strip').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('[data-action="feedFire"]').focus({ preventScroll: true }); }
    } else { selectedLocation = G.nights(state) >= 1 && !state.visited.ruins ? 'ruins' : state.location; renderMap(); setView('map', true); }
  }

  function dialogHeader(eyebrow, title, closable = true) {
    return `${closable ? `<button class="icon-button dialog-close" data-command="close" aria-label="关闭窗口">${icon('close')}</button>` : ''}<div class="eyebrow">${eyebrow}</div><h2 id="dialog-title">${title}</h2>`;
  }

  function openDialog(mode) {
    modalMode = mode;
    let html = '';
    if (mode === 'help') {
      html = `<div class="dialog-inner">${dialogHeader('A SMALL GUIDE TO STAYING ALIVE', '写给初来者')}<p class="dialog-intro">你不必着急，荒野会等待你的选择。<br>只要火还在，就还有下一个故事。</p><div class="help-grid"><div class="help-item">${icon('clock')}<h3>每一步，都算数</h3><p>采集、制作、移动和进食才会推进时间。查看地图、行囊和手册不会消耗时间。06:00 天亮，17:00 黄昏，20:00 入夜。</p></div><div class="help-item">${icon('campfire')}<h3>别让火光离开你</h3><p>黑暗中每小时损失 14 生命与 10 理智。营火只保护营地，夜间出门先点燃行囊里的火把。下雨时，石头篝火更可靠。</p></div><div class="help-item">${icon('bowl')}<h3>认真吃每一顿饭</h3><p>每小时消耗 3 饱食，饿到零会持续受伤。点击行囊里的食物，再点击「食用」。工坊可以烤熟食物，生肉和生蘑菇有代价。</p></div><div class="help-item">${icon('axe')}<h3>带着工具去远方</h3><p>石斧伐木，石镐采矿，长矛狩猎。工具自动使用并消耗耐久。每天清晨 06:00，各地的采集资源恢复。</p></div><div class="help-item">${icon('flower')}<h3>也要照顾自己的心</h3><p>黑暗、湿地和遗迹会损耗理智。火边歇息、闻一朵野花，或吃一顿热饭。理智低于 20，身体也会受到伤害。</p></div><div class="help-item">${icon('tent')}<h3>把营地过成一个家</h3><p>帐篷让休息更有效。夜里备足食物和营火燃料，就能一觉睡到天亮。体感低于 5°C 时，斗篷和火光能帮你御寒。</p></div></div><div class="help-goal">${icon('beacon')} <strong>找到归途：</strong>探索旧日遗迹，收集 3 枚古老碎片，备齐材料，在营地建造「归途信标」。<strong>熬过七个夜晚后回到营地</strong>，就能迎来结局。之后也可以继续自由生存。</div><div class="help-shortcuts">快捷键 <kbd>1</kbd>—<kbd>4</kbd> 当前行动 <kbd>E</kbd> 生存 <kbd>C</kbd> 工坊 <kbd>M</kbd> 地图 <kbd>B</kbd> 行囊</div><button class="primary-button full" data-command="close">让故事继续 ${icon('arrow')}</button></div>`;
    } else if (mode === 'save') {
      html = `<div class="dialog-inner">${dialogHeader('KEEP A LITTLE PIECE OF YOUR JOURNEY', '把故事，好好收起来')}<p class="dialog-intro">${saveWorks ? '每一次行动都已自动保存。下次用同一浏览器打开这个地址，就能接着走。' : '当前浏览器无法自动保存。请导出一份存档，保住这段旅程。'}</p><div class="save-summary">${icon('book')}<div><strong>第 ${G.day(state)} 天 · ${G.clock(state)} · ${G.LOCATIONS[state.location].name}</strong><p>已熬过 ${G.nights(state)} 夜 · 行动 ${state.stats.actions} 次 · ${state.status === 'dead' ? '旅程结束' : state.status === 'won' ? '找到归途' : '故事仍在继续'}</p></div></div><div class="save-options"><button class="save-option" data-command="export">${icon('download')}<span><strong>导出存档</strong><small>下载一份旅程备份，也可以带到其他浏览器继续。</small></span></button><button class="save-option" data-command="import">${icon('upload')}<span><strong>导入存档</strong><small>选择之前保存的 JSON 文件，读取后会先显示旅程信息。</small></span></button><button class="save-option" data-command="sound">${icon(soundOn ? 'sound' : 'muted')}<span><strong>行动音效 · ${soundOn ? '已开启' : '已关闭'}</strong><small>轻微的提示音，陪伴每一次采集与制作。</small></span></button><button class="save-option danger" data-command="reset">${icon('reset')}<span><strong>重新开始一段旅程</strong><small>确认后替换当前进度，建议先导出存档。</small></span></button></div><p class="save-note">存档属于当前浏览器与打开地址。清理浏览器数据、移动文件或切换打开方式前，请先导出备份。</p></div>`;
    } else if (mode === 'reset') {
      html = `<div class="dialog-inner">${dialogHeader('EVERY ENDING IS A NEW BEGINNING', '再点起一簇新的火？')}<p class="dialog-intro">当前第 ${G.day(state)} 天的旅程将被替换。还想保留这段故事，可以先导出存档。</p><div class="dialog-actions"><button class="text-button" data-command="export">先导出存档</button><button class="text-button" data-command="close">留在这里</button><button class="primary-button danger-button" data-command="restart-now">开启新旅程</button></div></div>`;
    } else if (mode === 'import-confirm') {
      html = `<div class="dialog-inner">${dialogHeader('A FAMILIAR PATH THROUGH THE WOODS', '接着这段故事走下去？')}<p class="dialog-intro">即将载入：第 ${G.day(pendingImport)} 天 · ${G.clock(pendingImport)} · ${G.LOCATIONS[pendingImport.location].name}。<br>已熬过 ${G.nights(pendingImport)} 夜，行动 ${pendingImport.stats.actions} 次。载入后会替换当前进度。</p><div class="dialog-actions"><button class="text-button" data-command="close">取消</button><button class="primary-button" data-command="import-confirm">载入旅程 ${icon('arrow')}</button></div></div>`;
    } else if (mode === 'event') {
      const event = G.EVENTS[state.event];
      html = `<div class="dialog-inner"><div class="dialog-icon">${icon(event.icon)}</div>${dialogHeader(event.eyebrow, event.title, false)}<p class="event-story">${escape(event.text)}</p><div class="event-choices">${event.choices.map(choice => { const reason = G.choiceReason(state, choice); return `<button class="event-choice" data-action="choose" data-id="${choice.id}" title="${escape(reason || choice.hint)}" ${reason ? 'disabled' : ''}><span><strong>${choice.label}</strong><small>${choice.hint}${reason ? ` · ${escape(reason)}` : ''}</small></span>${icon('arrow')}</button>`; }).join('')}</div></div>`;
    } else if (mode === 'ending') {
      const won = state.status === 'won';
      html = `<div class="dialog-inner ending-inner"><div class="dialog-icon">${icon(won ? 'beacon' : 'leaf')}</div>${dialogHeader(won ? 'THERE IS ALWAYS A LIGHT SOMEWHERE' : 'THE FOREST WILL REMEMBER', won ? '天亮以后，我们回家。' : '荒野，记住了你的名字。', false)}<p class="ending-story">${won ? '信标的光穿过薄雾，远处终于有了回应。<br>那些饥饿、寒冷与漫长的黑夜，<br>都成了你能够讲述的故事。' : escape(state.endReason)}</p><div class="ending-stats"><div><b>${G.nights(state)}</b><small>熬过的夜晚</small></div><div><b>${state.stats.actions}</b><small>做出的选择</small></div><div><b>${Object.keys(state.visited).length}</b><small>踏足的地方</small></div></div><div class="dialog-actions"><button class="text-button" data-command="${won ? 'continue' : 'read-ending'}">${won ? '留下来，继续生存' : '翻阅最后的手记'}</button><button class="primary-button" data-command="restart-now">${won ? '另一段旅程' : '再点起一簇火'} ${icon('arrow')}</button></div><p class="ending-quote">${won ? '归途从不遥远，它就藏在每一次坚持里。' : '只要重新开始，就不算真正的结束。'}</p></div>`;
    }
    $('#dialog-content').innerHTML = html;
    if (mode === 'save' && effects) {
      const setting = document.createElement('button'); setting.className = 'save-option'; setting.dataset.command = 'effects';
      setting.setAttribute('aria-pressed', String(effects.preferred()));
      setting.innerHTML = `${icon('wind')}<span><strong>氛围动效 · ${effects.enabled() ? '已开启' : '已关闭'}</strong><small>${effects.reduced() ? '正在遵循系统的减少动态效果设置。' : '火星、雨幕、物品入袋与行动反馈，可随时关闭。'}</small></span>`;
      $('#dialog-content .save-options').insertBefore(setting, $('#dialog-content .save-option.danger'));
    }
    if (!dialog.open) dialog.showModal();
    const first = dialog.querySelector('button:not(:disabled)');
    if (first) first.focus({ preventScroll: true });
  }

  function presentPending() {
    if (modalMode && !['event', 'ending'].includes(modalMode)) return;
    if (state.event) openDialog('event');
    else if (state.status !== 'playing' && !endingDismissed) openDialog('ending');
  }

  function closeModal() {
    if (modalMode === 'event') return;
    dialog.close(); modalMode = null; pendingImport = null;
    presentPending();
  }

  function exportSave() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `余烬-第${G.day(state)}天-${G.clock(state).replace(':', '')}.json`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('存档已导出。把这段旅程，好好收起来。');
  }

  function startNewGame() {
    preserveUnreadableSave = false;
    state = G.createState(); endingDismissed = false; selectedItem = 'berry'; inventoryFilter = 'all'; selectedLocation = 'camp'; craftFilter = 'tools'; journalExpanded = false; view = 'explore';
    dialog.close(); modalMode = null; pendingImport = null;
    save(); render(); toast('新的旅程开始了。火还在，希望也还在。');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function command(name) {
    if (name === 'help' || name === 'save' || name === 'reset') openDialog(name);
    else if (name === 'close') closeModal();
    else if (name === 'sound') {
      soundOn = !soundOn;
      try { localStorage.setItem('ember-sound', soundOn ? 'on' : 'off'); } catch { /* The choice still applies for this visit. */ }
      render(); if (modalMode === 'save') openDialog('save'); playSound();
    } else if (name === 'journal') { journalExpanded = !journalExpanded; renderJournal(); }
    else if (name === 'effects' && effects) { effects.toggle(); render(); if (modalMode === 'save') openDialog('save'); }
    else if (name === 'export') exportSave();
    else if (name === 'import') { $('#import-file').value = ''; $('#import-file').click(); }
    else if (name === 'import-confirm' && pendingImport) {
      preserveUnreadableSave = false;
      state = pendingImport; pendingImport = null; endingDismissed = false; view = 'explore'; selectedLocation = state.location; inventoryFilter = 'all';
      dialog.close(); modalMode = null; save(); render(); toast('存档已载入。你又回到了这片森林。');
    } else if (name === 'restart-now') startNewGame();
    else if (name === 'continue' && state.status === 'won') {
      state.endless = true; state.status = 'playing'; endingDismissed = false; dialog.close(); modalMode = null; save(); render(); toast('你决定留下来。新的日子，还在前面。');
    } else if (name === 'read-ending') {
      endingDismissed = true; dialog.close(); modalMode = null; journalExpanded = true; renderJournal(); $('.journal-panel').scrollIntoView({ behavior: 'smooth' });
    } else if (name === 'bag') { $('.inventory-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (name === 'actions') setView('explore', true);
    else if (name === 'mobile-map') setView('map', true);
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('button, a[data-view]');
    if (!button || button.disabled) return;
    if (button.dataset.view) { event.preventDefault(); setView(button.dataset.view, window.innerWidth <= 760); }
    else if (button.dataset.action) perform(button.dataset.action, button.dataset.id, button);
    else if (button.dataset.craftFilter) { craftFilter = button.dataset.craftFilter; renderCrafting(); effects?.enterView('craft'); }
    else if (button.dataset.inventoryFilter) { inventoryFilter = button.dataset.inventoryFilter; renderInventory(); }
    else if (button.dataset.item) { selectedItem = button.dataset.item; renderInventory(); effects?.flash($(`[data-item="${CSS.escape(selectedItem)}"]`)); }
    else if (button.dataset.location) { selectedLocation = button.dataset.location; renderMap(); }
    else if (button.dataset.guide) guideTo(button.dataset.guide);
    else if (button.dataset.command) command(button.dataset.command);
  });

  document.addEventListener('keydown', event => {
    if (dialog.open || event.repeat || event.ctrlKey || event.metaKey || event.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable) return;
    if (/^[1-4]$/.test(event.key) && view === 'explore') { event.preventDefault(); perform('gather', G.LOCATIONS[state.location].actions[Number(event.key) - 1]); }
    else if (['e', 'c', 'm', 'b'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      const key = event.key.toLowerCase();
      if (key === 'b') command('bag'); else setView({ e: 'explore', c: 'craft', m: 'map' }[key], true);
    }
  });

  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (!['event', 'ending'].includes(modalMode)) closeModal();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog || ['event', 'ending'].includes(modalMode)) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeModal();
  });

  $('#import-file').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) { toast('这个文件太大了，请选择小于 1 MB 的游戏存档。', true); return; }
    try {
      pendingImport = G.restore(await file.text());
      openDialog('import-confirm');
    } catch (error) { toast(error.message || '无法读取这份存档', true); }
  });

  render(); save();
  if (initialNotice) toast(initialNotice, true);
})();
