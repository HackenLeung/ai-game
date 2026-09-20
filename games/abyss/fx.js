// 深渊回响 · 战斗动效层：伤害数字、受击震动、出牌拖影、状态飘字与屏幕冲击。
(function (root) {
  'use strict';
  const stage = () => document.querySelector('.battle-top');
  // 减少动态时保留信息性反馈（伤害数字、提示），只去掉位移、震动与飞牌。
  let reduced = false;
  function setReduced(value) { reduced = !!value; }
  const layer = () => {
    let element = document.getElementById('fx-layer');
    if (!element) {
      element = document.createElement('div');
      element.id = 'fx-layer';
      element.className = 'fx-layer';
      element.setAttribute('aria-hidden', 'true');
      (document.querySelector('.app-shell') || document.body).appendChild(element);
    }
    return element;
  };

  function alive(element) {
    return element && element.isConnected && element.getBoundingClientRect().width >= 0;
  }
  function spawn(html, x, y, className) {
    const node = document.createElement('div');
    node.className = className;
    node.innerHTML = html;
    node.style.left = `${Math.round(x)}px`;
    node.style.top = `${Math.round(y)}px`;
    layer().appendChild(node);
    return node;
  }
  function centerOf(target, fallback) {
    if (target && target.getBoundingClientRect) {
      const box = target.getBoundingClientRect();
      if (box.width || box.height) return { x: box.left + box.width / 2, y: box.top + box.height * 0.42 };
    }
    const host = stage();
    if (host) {
      const box = host.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    }
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  // 伤害 / 治疗 / 格挡飘字
  function number(target, value, kind = 'damage') {
    if (!value) return null;
    const point = centerOf(target);
    const node = spawn(`<b>${Math.abs(value)}</b>`, point.x, point.y, `fx-number fx-${kind}${reduced ? ' fx-static' : ''}`);
    node.style.setProperty('--drift', `${(Math.random() * 34 - 17).toFixed(0)}px`);
    setTimeout(() => node.remove(), reduced ? 700 : 1100);
    return node;
  }
  // 关键字飘字，例如「格挡」「中毒」「易伤」
  function label(target, text, kind = 'status') {
    const point = centerOf(target);
    const node = spawn(`<b>${text}</b>`, point.x, point.y - 12, `fx-label fx-${kind}${reduced ? ' fx-static' : ''}`);
    setTimeout(() => node.remove(), reduced ? 800 : 1200);
    return node;
  }

  // 受击：目标震动 + 白色闪白
  function hit(target, options = {}) {
    if (!alive(target)) return;
    target.classList.remove('is-hit', 'is-crit');
    void target.offsetWidth;
    target.classList.add(options.heavy ? 'is-crit' : 'is-hit');
    setTimeout(() => target.classList.remove('is-hit', 'is-crit'), 420);
    if (options.shake !== false && !reduced) {
      document.body.classList.remove('shake-screen');
      void document.body.offsetWidth;
      document.body.classList.add('shake-screen');
      setTimeout(() => document.body.classList.remove('shake-screen'), 320);
    }
  }
  // 攻击命中特效：斩击斜线
  function slash(target) {
    if (reduced) return;
    const point = centerOf(target);
    const node = spawn('', point.x, point.y, 'fx-slash');
    node.style.setProperty('--angle', `${-28 + Math.random() * 56}deg`);
    setTimeout(() => node.remove(), 460);
  }
  // 治疗 / 增益上升光粒
  function rise(target, kind = 'heal') {
    if (reduced) return;
    const point = centerOf(target);
    for (let index = 0; index < 5; index++) {
      const node = spawn('', point.x + (index - 2) * 12, point.y + 10, `fx-spark fx-${kind}`);
      node.style.animationDelay = `${index * 60}ms`;
      setTimeout(() => node.remove(), 1000 + index * 60);
    }
  }
  // 死亡爆散
  function burst(target) {
    if (reduced) return;
    const point = centerOf(target);
    for (let index = 0; index < 10; index++) {
      const node = spawn('', point.x, point.y, 'fx-shard');
      const angle = (index / 10) * Math.PI * 2;
      node.style.setProperty('--dx', `${(Math.cos(angle) * (40 + Math.random() * 30)).toFixed(0)}px`);
      node.style.setProperty('--dy', `${(Math.sin(angle) * (36 + Math.random() * 26)).toFixed(0)}px`);
      setTimeout(() => node.remove(), 700);
    }
  }
  // 出牌：手牌位置飞向目标
  function playCard(fromElement, toElement, cardName) {
    if (reduced || !alive(fromElement)) return;
    const from = centerOf(fromElement);
    const to = toElement && alive(toElement) ? centerOf(toElement) : centerOf(stage());
    const node = spawn(`<span>${cardName}</span>`, from.x, from.y, 'fx-card');
    node.style.setProperty('--dx', `${(to.x - from.x).toFixed(0)}px`);
    node.style.setProperty('--dy', `${(to.y - from.y).toFixed(0)}px`);
    setTimeout(() => node.remove(), 520);
  }
  // 出牌时把手牌「留影」到动效层，这样手牌重建也不会打断离场动画。
  function removeCardFromHand(uid) {
    const element = document.querySelector(`#hand .card[data-card="${uid}"]`);
    if (element) {
      const box = element.getBoundingClientRect();
      const ghost = element.cloneNode(true);
      ghost.classList.add('card-ghost');
      ghost.removeAttribute('data-card');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.tabIndex = -1;
      ghost.style.left = `${Math.round(box.left)}px`;
      ghost.style.top = `${Math.round(box.top)}px`;
      ghost.style.width = `${Math.round(box.width)}px`;
      ghost.style.height = `${Math.round(box.height)}px`;
      layer().appendChild(ghost);
      setTimeout(() => ghost.remove(), 320);
    }
    const live = document.querySelector(`#hand .card[data-card="${uid}"]`);
    if (live) live.classList.add('card-leaving');
  }
  // 抽牌动画
  function drawFrom(anchor) {
    if (reduced) return;
    const point = anchor && alive(anchor) ? centerOf(anchor) : centerOf(stage());
    const node = spawn('', point.x - 40, point.y, 'fx-draw');
    setTimeout(() => node.remove(), 520);
  }
  // 敌人行动前的蓄力提示
  function telegraph(target) {
    if (!alive(target)) return null;
    target.classList.add('is-acting');
    return () => target.classList.remove('is-acting');
  }
  function floatText(text, kind = 'info') {
    const point = centerOf(stage());
    const node = spawn(`<b>${text}</b>`, point.x, point.y - 40, `fx-banner fx-${kind}${reduced ? ' fx-static' : ''}`);
    setTimeout(() => node.remove(), reduced ? 900 : 1400);
    return node;
  }
  function screenFlash() {
    if (reduced) return;
    const element = document.createElement('div');
    element.className = 'fx-screen-flash';
    document.body.appendChild(element);
    setTimeout(() => element.remove(), 440);
  }

  root.AbyssFX = {
    setReduced, number, label, hit, slash, rise, burst, playCard, removeCardFromHand, drawFrom,
    telegraph, floatText, screenFlash,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
