// 深渊回响 · DOM 渲染与界面片段。所有动态文本都经过转义。
(function (root) {
  'use strict';
  const cards = root.AbyssCards;
  const world = root.AbyssWorld;

  const STATUS_KIND = key => (cards.NEGATIVE.includes(key) ? 'debuff' : 'buff');
  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function icon(name) { return `<svg class="icon"><use href="#i-${escape(name)}"/></svg>`; }

  function cardClass(card) {
    const definition = cards.card(card.id, card.upgraded);
    return `card ${definition.type}${card.upgraded ? ' upgraded' : ''}`;
  }
  const TYPE_ICON = { attack: 'sword', skill: 'skill', power: 'power', status: 'close' };
  const COLOR_ART = { core: 'shield', necrosis: 'skull', psi: 'power', neutral: 'bolt' };
  function cardHtml(card, options = {}) {
    const definition = cards.card(card.id, card.upgraded);
    const cost = definition.x ? 'X' : definition.cost;
    const classes = `${cardClass(card)}${options.small ? ' small' : ''}${options.locked ? ' locked' : ''}`;
    const data = options.tag ? ` data-${options.tag}="${escape(card.uid || '')}"` : '';
    const exhaust = definition.exhaust || definition.type === 'power';
    const aria = `${definition.name}，${cost} 费${cards.TYPE[definition.type]}：${definition.text}`;
    return `<button class="${classes}"${data} data-card="${escape(card.uid || '')}" aria-label="${escape(aria)}" title="${escape(definition.text)}">
      <span class="card-shell">
        <span class="card-head">
          <span class="card-cost">${escape(cost)}</span>
          <span class="card-name">${escape(definition.name)}</span>
        </span>
        <span class="card-art" aria-hidden="true">
          <svg viewBox="0 0 24 24"><use href="#i-${COLOR_ART[definition.color] || 'shield'}"/></svg>
          <span class="card-type-badge">${icon(TYPE_ICON[definition.type] || 'skill')}</span>
        </span>
        <span class="card-text">${escape(definition.text)}</span>
        <span class="card-foot">
          <span class="card-color">${escape(cards.COLORS[definition.color].name)}</span>
          <span class="card-gem" data-rarity="${escape(definition.rarity)}">${escape(cards.RARITY[definition.rarity])}${exhaust ? ' · <i class="card-exhaust">消耗</i>' : ''}</span>
        </span>
      </span>
      <span class="card-frame" aria-hidden="true"></span>
    </button>`;
  }

  function statusChips(statuses) {
    return Object.entries(statuses || {})
      .filter(([, value]) => value)
      .map(([key, value]) => {
        const status = cards.STATUS[key];
        if (!status) return '';
        return `<span class="chip ${STATUS_KIND(key)}" data-tip="${escape(status.text)}" title="${escape(`${status.name}：${status.text}`)}">${escape(status.name)} <b>${value}</b></span>`;
      }).join('');
  }

  function intentHtml(intent, stunned) {
    if (!intent) return '';
    if (stunned) return '<span class="intent status">眩晕<i>·无法行动</i></span>';
    const label = { attack: '攻击', block: '防御', attackBlock: '攻防', buff: '强化', debuff: '削弱', status: '状态' }[intent.intent] || '行动';
    const damages = (intent.damage || []).map(part => `${part.value}${part.times > 1 ? `×${part.times}` : ''}`).join('+');
    return `<span class="intent ${escape(intent.intent)}">${damages ? `<span class="num">${escape(damages)}</span>` : ''}${escape(intent.name)}<i>·${escape(label)}</i></span>`;
  }

  function enemyHtml(enemy, options = {}) {
    const percent = Math.max(0, Math.round((enemy.hp / enemy.maxHp) * 100));
    const stunned = !!(enemy.statuses && enemy.statuses.stun);
    const damage = (enemy.intent && enemy.intent.damage && !stunned) ? enemy.intent.damage.reduce((total, part) => total + part.value * part.times, 0) : 0;
    const label = enemy.dead ? '已被摧毁' : `${enemy.name}，生命 ${enemy.hp}/${enemy.maxHp}${enemy.block ? `，格挡 ${enemy.block}` : ''}${damage ? `，意图造成 ${damage} 点伤害` : ''}`;
    return `<button class="enemy${enemy.dead ? ' dead' : ''}${options.targetable ? ' targetable' : ''}" data-enemy="${escape(enemy.uid)}" aria-label="${escape(label)}"${options.targetable ? '' : ' disabled'}>
      <span class="enemy-art" aria-hidden="true" style="--phase:-${Date.now() % 4600}ms"><svg class="art"><use href="#a-${escape(enemy.art)}"/></svg></span>
      <span class="enemy-name">${escape(enemy.name)}</span>
      <span class="enemy-hpbar"><i style="width:${percent}%"></i><span>${enemy.hp} / ${enemy.maxHp}${enemy.block ? ` · 盾 ${enemy.block}` : ''}</span></span>
      <span class="enemy-badges">${statusChips(enemy.statuses)}</span>
      ${enemy.dead ? '' : intentHtml(enemy.intent, stunned)}
    </button>`;
  }

  function mapNodeHtml(node, index, floor, options = {}) {
    const state = options.done ? 'done' : node.floor === floor + 1 ? 'current' : node.floor <= floor ? 'done' : 'locked';
    const detail = node.type === 'fight' && node.battle
      ? node.battle.enemies.map(id => world.ENEMY_MAP[id].name).join(' · ')
      : node.type === 'event' ? world.EVENT_MAP[node.event].name : '';
    const disabled = state === 'current' ? '' : ' disabled';
    return `<li><button class="map-node ${node.type} ${state}" data-node="${node.floor}"${disabled} aria-label="第 ${node.floor} 层 ${world.nodeLabel(node)}">
      <span class="node-icon">${icon(world.nodeIcon(node))}</span>
      <span class="node-text"><strong>第 ${node.floor} 层 · ${escape(world.nodeLabel(node))}</strong><small>${escape(detail || (state === 'current' ? '点击进入' : state === 'done' ? '已经通过' : '尚未抵达'))}</small></span>
    </button></li>`;
  }

  function relicHtml(relic, owned) {
    return `<div class="relic${owned ? ' owned' : ''}" data-tip="${escape(relic.text)}">
      <span class="relic-icon">${icon(relic.icon)}</span>
      <div><strong>${escape(relic.name)}</strong><p>${escape(relic.text)}</p></div>
    </div>`;
  }

  function potionHtml(id, index, options = {}) {
    if (!id) return `<span class="potion empty" aria-hidden="true">${icon('flask')}</span>`;
    const potion = world.POTION_MAP[id];
    const selected = options.selected === index;
    return `<button class="potion${selected ? ' selected' : ''}" data-potion="${index}" title="${escape(`${potion.name}：${potion.text}`)}" aria-label="${escape(`使用${potion.name}：${potion.text}`)}" aria-pressed="${selected ? 'true' : 'false'}"${selected ? ' aria-describedby="potion-detail"' : ''}>${icon('flask')}</button>`;
  }

  // 高亮药水时展示的效果说明，由 app 写入独立的说明元素。
  function potionDetailHtml(id) {
    const potion = id && world.POTION_MAP[id];
    if (!potion) return '';
    return `<strong>${escape(potion.name)}</strong>${escape(potion.text)}<span class="potion-confirm">再点一次确认使用</span>`;
  }

  function playerStatusHtml(state) {
    const battle = state.battle;
    return `<span class="chip hp" title="生命">${icon('heart')}<b>${state.hp}</b> / ${state.maxHp}</span>
      <span class="chip block" title="格挡">${icon('shield')}<b>${battle ? battle.block : 0}</b></span>
      ${statusChips(battle ? battle.statuses : {})}`;
  }

  function chapterBannerHtml(chapter) {
    const info = world.CHAPTERS[chapter - 1];
    if (!info) return '';
    const progress = `${chapter} / ${world.CHAPTERS.length}`;
    return `<div class="chapter-banner"><span class="brand-mark">${icon('map')}</span><div><p class="chapter-index">第 ${progress} 章 · ${escape(info.subtitle)}</p><h3>${escape(info.name)}</h3><p>${escape(info.intro)}</p></div></div>`;
  }

  function logHtml(entries) {
    return entries.slice(-60).map(entry => `<p class="${escape(entry.kind || 'info')}">${escape(entry.text)}</p>`).join('');
  }

  root.AbyssUI = { escape, icon, cardHtml, cardClass, statusChips, enemyHtml, intentHtml, mapNodeHtml, relicHtml, potionHtml, potionDetailHtml, playerStatusHtml, chapterBannerHtml, logHtml, STATUS_KIND, TYPE_ICON, COLOR_ART };
})(typeof globalThis !== 'undefined' ? globalThis : this);
