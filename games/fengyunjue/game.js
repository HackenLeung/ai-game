'use strict';

const GameRules = typeof document === 'undefined' ? require('./rules.js') : JianghuRules;

if (typeof module !== 'undefined' && module.exports) module.exports = GameRules;

if (typeof document !== 'undefined') (() => {
  const R = GameRules, $ = id => document.getElementById(id);
  const canvas = $('world'), ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, SAVE_KEY = 'wandering-sword-v1';
  const modal = $('modal'), modalBody = $('modal-body'), tooltip = $('game-tooltip');
  let tooltipTarget = null, tooltipTimer, tooltipDescription = '';
  const escape = str => String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = id => `<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const numerals = ['零','一','二','三','四','五','六','七','八','九','十'];
  const numeral = n => numerals[n] || String(n);
  let state = R.createState(), loadMessage = '', storageAvailable = true, migrated = false;
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
      const raw=JSON.parse(saved),loaded=R.normalizeState(raw);
      if(loaded){state=loaded;migrated=raw.version<3;
        if(migrated&&!localStorage.getItem('wandering-sword-backup-v'+raw.version))localStorage.setItem('wandering-sword-backup-v'+raw.version,saved);
        loadMessage=migrated?'旧存档已接入问剑长歌，境界与物品保留；新挑战已加入历练。':'故地重游，已续上你的江湖行迹。';
      }else loadMessage='旧存档格式无法读取，请在指南中导入有效存档。';
    }
  } catch { storageAvailable=false;loadMessage='本地存档暂不可用，本次仍可正常游玩。'; }
  let battle = null, path = [], pending = null, walkClock = 0, previousTime = 0, elapsed = 0;
  let playerVisual = {x:state.x,y:state.y}, hover = null, activePanel = '', lastNearest = '';
  let toastTimer, loadMessageTimer, fishing = false, generation = 0;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FX=createJianghuFeedback({scene:$('scene-feedback'),notice:$('action-feedback'),reducedMotion:()=>reduceMotion});
  const audio=createJianghuAudio({onChange:renderSoundToggle,onError:()=>toast('声音暂时未能开启，请再点击右上角声音按钮。')});
  const view={scaleX:1,scaleY:1,cameraX:640};
  let viewportRatio=1, canvasDisplayScale=1;
  const STORY = R.STORY, QUESTS = STORY.quests, SITES = STORY.sites;
  const LOCATIONS = STORY.locations;
  const MAPS = {};
  const hash = (x,y=0) => {const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);};
  const iso = (x,y) => ({x:640+(x-y)*24,y:55+(x+y)*12});
  const fromIso = (x,y) => ({x:Math.round(((x-640)/24+(y-55)/12)/2),y:Math.round(((y-55)/12-(x-640)/24)/2)});
  const battleIso = (x,y) => ({x:640+(x-y)*54,y:210+(x+y)*28});
  const fromBattleIso = (x,y) => ({x:Math.round(((x-640)/54+(y-210)/28)/2),y:Math.round(((y-210)/28-(x-640)/54)/2)});
  function toast(text) {
    const el=$('toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);
    if(el.showPopover&&!el.matches(':popover-open'))el.showPopover();
    toastTimer=setTimeout(()=>{el.classList.remove('visible');if(el.hidePopover&&el.matches(':popover-open'))el.hidePopover();},3300);
  }
  function hideTooltip() {
    clearTimeout(tooltipTimer);
    if(tooltipTarget){
      if(tooltipDescription)tooltipTarget.setAttribute('aria-describedby',tooltipDescription);
      else tooltipTarget.removeAttribute('aria-describedby');
    }
    tooltipTarget=null;tooltipDescription='';
    if(tooltip.hidePopover&&tooltip.matches(':popover-open'))tooltip.hidePopover();
    tooltip.hidden=true;
  }
  function queueTooltip(target,delay=280) {
    hideTooltip();
    if(!target?.dataset.tooltip||(modal.open&&!modal.contains(target)))return;
    tooltipTarget=target;tooltipDescription=target.getAttribute('aria-describedby')||'';
    tooltipTimer=setTimeout(()=>{
      if(tooltipTarget!==target||!target.isConnected)return;
      const label=target.dataset.tooltip,split=label.indexOf('：');
      tooltip.replaceChildren();
      if(split>0){
        const heading=document.createElement('strong'),description=document.createElement('span');
        heading.textContent=label.slice(0,split);description.textContent=label.slice(split+1);tooltip.append(heading,description);
      }else tooltip.textContent=label;
      tooltip.hidden=false;
      if(tooltip.showPopover)tooltip.showPopover();
      const box=target.getBoundingClientRect(),tip=tooltip.getBoundingClientRect();
      const left=Math.max(12,Math.min(innerWidth-tip.width-12,box.left+(box.width-tip.width)/2));
      const top=box.top>=tip.height+20?box.top-tip.height-11:Math.min(innerHeight-tip.height-12,box.bottom+11);
      tooltip.style.left=left+'px';tooltip.style.top=Math.max(12,top)+'px';
      target.setAttribute('aria-describedby',[tooltipDescription,tooltip.id].filter(Boolean).join(' '));
    },delay);
  }
  function note(text, announce=false) {
    state.log.push(text);state.log=state.log.slice(-80);$('latest-log').textContent=text;
    if(announce)toast(text);
  }
  function playFeedback(kind,detail){if(audio.status.enabled)audio.play(kind,detail);}
  function renderSoundToggle() {
    const status=audio.status,button=$('sound-toggle'),label=status.enabled?'关闭音乐与音效':'开启音乐与音效';
    button.querySelector('use').setAttribute('href',status.enabled?'#i-sound':'#i-mute');
    button.setAttribute('aria-pressed',String(status.enabled));button.setAttribute('aria-label',label);
    button.dataset.tooltip=label+'：'+status.title+' · '+status.description;
    button.dataset.soundscape=status.scene;
  }
  function updateSoundscape() {
    const b=battle,id=b?b.encounter==='final'?'final':b.context.kind==='tower'?'tower':b.practice||b.training?'duel':b.enemies.some(e=>e.role==='boss')?'boss':'battle':state.expedition.active?'towerRest':state.location;
    audio.setScene(id,{energy:b?(b.enemies.some(e=>e.raged)?.65:0)+(state.hp/R.maxHp(state)<.3?.35:0):0});
  }
  function clearToast(){
    clearTimeout(toastTimer);clearTimeout(loadMessageTimer);const el=$('toast');el.classList.remove('visible');
    if(el.hidePopover&&el.matches(':popover-open'))el.hidePopover();
  }
  function actionNotice(data){clearToast();FX.notice(data);}
  function rejectedAction(message,element){
    FX.hideNotice();toast(message);FX.pulse(element||document.activeElement,'warn');playFeedback('error');
  }
  function statSnapshot(){
    return{hp:state.hp,mp:state.mp,attack:R.attack(state),defense:R.defense(state),maxHp:R.maxHp(state),maxMp:R.maxMp(state),move:R.moveLimit(state),insight:state.insight,poison:battle?.poison||0,allyHp:battle?.ally?.hp||0,allyPoison:battle?.ally?.poison||0};
  }
  function pulseVitals(before){
    if(before.hp!==state.hp)FX.pulse($('hp-value').closest('.stat'),state.hp>before.hp?'heal':'hurt');
    if(before.mp!==state.mp)FX.pulse($('mp-value').closest('.stat'),'qi');
  }
  function heroPoint(){return battle?battleIso(battle.player.x,battle.player.y):iso(playerVisual.x,playerVisual.y);}
  function recoveryFeedback(id,before,result={},inBattle=false){
    const b=battle,ally=id==='aid'&&b?.ally,target=ally?battleIso(ally.x,ally.y):heroPoint();
    const hp=ally?ally.hp-before.allyHp:state.hp-before.hp,mp=state.mp-before.mp;
    const cleansed=ally?before.allyPoison-ally.poison:before.poison-(b?.poison||0);
    const tone=id==='qi'?'qi':'heal',item=R.ITEMS[id],name=item?.name||R.SKILLS[id]?.name||'援救友方',details=[];
    if(hp>0){details.push('气血 +'+hp);FX.floating(target,'气血 +'+hp,'heal');}
    if(mp>0){details.push('真气 +'+mp);FX.floating(target,'真气 +'+mp,'qi');}
    if(cleansed>0){details.push('清除 '+cleansed+' 层毒');FX.floating(target,'清毒 '+cleansed,'poison');}
    if(item)details.push('剩余 '+(state.bag[id]||0)+' 份');
    FX.ring(target,tone);FX.announce(name,details.join(' · '),tone);pulseVitals(before);
    FX.pulse(document.querySelector('[data-skill="'+id+'"]'),tone);
    FX.pulse(modalBody.querySelector('[data-item-card="'+id+'"]'),tone);
    if(!inBattle)actionNotice({title:(item?'已服用 · ':'')+name,detail:details.join(' · '),tone,icon:id==='qi'?'wind':item?'flask':'heart'});
    playFeedback(id==='fish'?'food':id);
  }
  function itemFeedback(id,before,result){
    const item=R.ITEMS[id],gear=['weapon','armor','accessory'].includes(item.category);
    if(item.category==='medicine'){recoveryFeedback(id,before,result);return;}
    const after=statSnapshot(),details=[];
    if(gear){
      for(const [key,label] of [['attack','攻击'],['defense','防御'],['maxHp','气血上限'],['maxMp','真气上限'],['move','移动']]){
        if(before[key]!==after[key])details.push(label+' '+before[key]+' → '+after[key]+' ('+(after[key]>before[key]?'+':'')+(after[key]-before[key])+')');
      }
    }else if(id==='manual')details.push('悟性 +'+(after.insight-before.insight));
    actionNotice({title:(gear?'已装备 · ':'已参悟 · ')+item.name,detail:details.length?details.join(' · '):item.description,tone:'equip',icon:item.icon});
    FX.pulse(modalBody.querySelector('[data-item-card="'+id+'"]'),'equip');
    FX.pulse(document.querySelector('.portrait-frame'),'equip');pulseVitals(before);
    FX.ring(heroPoint(),'equip');playFeedback(gear?'equip':'manual',{category:item.category});
  }
  function actorSnapshot(b){
    return[{...b.player,id:'hero',hp:state.hp,poison:b.poison},...(b.ally?[{...b.ally,id:'ally'}]:[]),...b.enemies.map(e=>({...e}))];
  }
  function enemyFeedback(b,before,enemy,result){
    let hurt=false,guarded=false;
    for(const actor of actorSnapshot(b)){
      const prior=before.find(p=>p.id===actor.id);if(!prior)continue;
      const difference=actor.hp-prior.hp,point=battleIso(actor.x,actor.y),friendly=['hero','ally'].includes(actor.id);
      if(difference<0){
        const dot=actor.id===enemy.id&&prior.poison>0,tone=dot?'poison':friendly?'hurt':'hit';
        if(dot){FX.ring(point,'poison');FX.floating(point,'毒发 −'+(-difference),'poison');}
        else{
          const source=friendly?battleIso(enemy.x,enemy.y):battleIso(b.player.x,b.player.y),kind=friendly&&enemy.role==='ranged'?'arrow':friendly&&enemy.role==='poison'?'poison':'slash';
          FX.hit(point,{from:source,damage:-difference,tone,kind,label:friendly?b.guard&&actor.id==='hero'?'格挡':'':'反击'});
          FX.react(actor.id,'hurt',source,point);FX.react(friendly?enemy.id:'hero','strike',source,point);
        }
        if(friendly){hurt=true;if(actor.id==='hero'){guarded=!!b.guard;FX.pulse($('stage-shell'),'hurt');}}
      }else if(difference>0){FX.ring(point,'heal');FX.floating(point,'气血 +'+difference,'heal');}
    }
    if(result.telegraph){FX.announce(enemy.name+' · 蓄势','移出红格，或用破岳剑打断','warn',2200);FX.ring(battleIso(enemy.x,enemy.y),'warn');FX.pulse($('battle-banner'),'warn');playFeedback('warn');}
    else if(hurt)playFeedback('hurt',{role:enemy.role,blocked:guarded,pan:(enemy.x-enemy.y)/12});
  }
  function save(manual=false) {
    if(battle) {if(manual)toast('战斗结束后会自动保存。');return;}
    try {localStorage.setItem(SAVE_KEY,JSON.stringify(state));storageAvailable=true;$('save-status').textContent=manual?'问剑长歌 · 此刻行迹已存':'问剑长歌 · 江湖行迹已保存';if(manual)toast('已记下此刻的江湖。下次打开可继续。');}
    catch {storageAvailable=false;$('save-status').textContent='本地存档不可用';if(manual)toast('浏览器未能写入存档。请允许本站使用本地存储。');}
  }
  function addItem(id,count=1) {state.bag[id]=(state.bag[id]||0)+count;}
  function grant(xp,gold=0) {const levels=R.gain(state,xp,gold);if(levels)note(`境界提升至${numeral(state.level)}重，气血与真气全满，悟性 +${levels}。`,true);}
  function currentSites() {
    return SITES[state.location].filter(s=>(!s.active||s.active===QUESTS[state.stage].id)&&(s.min===undefined||state.stage>=s.min)&&(s.max===undefined||state.stage<=s.max)
      &&!state.herbs.includes(s.id)&&!state.opened.includes(s.id)&&!state.pickups.includes(s.id)
      &&!(state.progress[QUESTS[state.stage].id]||[]).includes(s.id));
  }
  function findSite(id) {return currentSites().find(s=>s.id===id);}
  function targetSite() {
    const q=QUESTS[state.stage];if(q.location!==state.location)return null;
    const id=q.targets?.find(id=>!(state.progress[q.id]||[]).includes(id))||q.target;
    return findSite(id);
  }
  function walkable(x,y) {return x>=1&&y>=1&&x<=23&&y<=23&&!MAPS[state.location].blocked.has(R.key(x,y));}
  function navigate(site) {
    if(battle||fishing)return;
    if(state.expedition.active){openTower();return;}
    if(!site){toast('这里的事已经办完，请按当前指引前往下一处。');return;}
    if(R.distance(state,site)<=1){path=[];pending=null;interact(site);return;}
    const route=R.findPath(state,site,walkable);
    if(route===null){toast('此路不通，换个方向试试。');return;}
    if((site.type==='npc'||site.type==='enemy')&&route.length)route.pop();
    path=route;pending=site;walkClock=0;
    if(!path.length){pending=null;interact(site);}
    else toast(`正前往${site.name}…`);
  }
  function travel(location) {
    if(state.expedition.active){openTower();return;}
    if(battle){toast('先结束眼前的战斗，再动身吧。');return;}
    if(!R.canTravel(state,location)){toast(`完成当前篇章后，才能前往${LOCATIONS[location]?.name||'此地'}。`);return;}
    if(fishing)return;
    closeModal();FX.clear();state.location=location;Object.assign(state,LOCATIONS[location].spawn);
    playerVisual={x:state.x,y:state.y};path=[];pending=null;hover=null;generation++;
    note(`来到${LOCATIONS[location].name}。${LOCATIONS[location].poem}`);
    renderHud();save();
  }
  function guide() {
    if(battle){battleGuide();return;}
    if(state.expedition.active){openTower();return;}
    if(state.stage===R.terminal){openArena();return;}
    if(fishing){toast('鱼儿即将上钩，再等一小会儿。');return;}
    const desired=QUESTS[state.stage].location;
    if(state.location!==desired)travel(desired);
    navigate(targetSite());
  }
  function nearSite() {const target=targetSite();return currentSites().filter(s=>R.distance(s,state)<=2).sort((a,b)=>Number(b.id===target?.id)-Number(a.id===target?.id)||R.distance(a,state)-R.distance(b,state))[0];}
  function siteVerb(site){return({enemy:'迎战',npc:'交谈',herb:'采集',stele:'参悟',mechanism:'解开机关',exit:'前往',chest:'打开',ore:'采集',crate:'拾取',fish:'垂钓',spring:'调息'})[site.type]||'查看';}
  function updatePrompt() {
    const near=!battle&&!state.expedition.active&&!path.length&&!modal.open&&!fishing?nearSite():null;
    $('interact-prompt').hidden=!near;
    if(near){const text=`${siteVerb(near)} · ${near.name}`;if($('interact-prompt').querySelector('span').textContent!==text)$('interact-prompt').querySelector('span').textContent=text;lastNearest=near.id;}else lastNearest='';
  }
  function renderHud() {
    updateSoundscape();
    const s=state,q=QUESTS[s.stage],chapter=STORY.chapters[q.chapter],location=LOCATIONS[s.location],b=battle,ex=s.expedition;
    $('hp-value').innerHTML=`${s.hp} <small>/ ${R.maxHp(s)}</small>`;$('mp-value').innerHTML=`${s.mp} <small>/ ${R.maxMp(s)}</small>`;
    $('hp-bar').style.width=`${s.hp/R.maxHp(s)*100}%`;$('mp-bar').style.width=`${s.mp/R.maxMp(s)*100}%`;
    $('gold-value').textContent=s.gold;$('level-badge').textContent=numeral(s.level);$('level-value').textContent=`${numeral(s.level)}重`;
    $('rank').textContent=s.stage===R.terminal?'侠心照江湖':s.stage>=STORY.index('wudang-arrival')?'名动一方':s.stage>=STORY.index('city-arrival')?'江湖新秀':'初出茅庐';
    $('chapter-number').textContent=['壹','贰','叁'][q.chapter];$('chapter-name').textContent=chapter.name;$('chapter-subtitle').textContent=chapter.subtitle;
    $('chapter-eyebrow').textContent=`第${numeral(q.chapter+1)}章 / 共三章${s.stage===R.terminal?' · 已完结':''}`;
    $('quest-chapter').textContent=ex.active?'剑冢 · 历练':`${numeral(q.chapter+1)}章 · ${s.stage===R.terminal?'完结':'主线'}`;
    $('companion-name').textContent=s.companion?`同行 · ${STORY.companions[s.companion].name}`:'独行江湖';$('xp-value').textContent=`修为 ${s.xp} / ${R.xpNeed(s)}`;
    $('build-summary').textContent=`${R.STYLES[s.style].name} · ${R.DISCIPLINES[s.discipline].name} · ${R.DIFFICULTIES[s.difficulty].name}`;
    $('potion-count').textContent=s.bag.potion||0;$('latest-log').textContent=s.log.at(-1);
    $('location-region').textContent=ex.active?'历练秘境 · 剑冢十二关':location.region;$('location-name').textContent=ex.active?`剑冢 · 第 ${ex.floor} 层`:location.name;$('location-poem').textContent=ex.active?'剑可归鞘，余势不息。':location.poem;
    $('ambient-text').textContent=b?'剑锋相接 · 凝神应战':ex.active?'余弦渐静 · 篝火休整':location.ambient;
    $('scene-status').innerHTML=`<span></span>${b?'交锋之中':ex.active?'剑冢休整':location.safe?'安全区域':'野外区域'}`;
    $('scene-status').classList.toggle('danger',!location.safe||!!b);document.body.classList.toggle('battle-mode',!!b);document.body.classList.toggle('low-health',!!b&&s.hp/R.maxHp(s)<=.25);$('battle-banner').hidden=!b;
    $('quest-title').textContent=b?b.name:ex.active?`剑冢第 ${ex.floor} 层 · ${STORY.encounters[STORY.floors[ex.floor-1]].name}`:q.title;
    $('quest-description').textContent=b?`每回合先移动至多 ${b.moveLimit} 格，再行动一次。敌人下方显示意图；金色地块是战斗目标。`:ex.active?'气血与真气延续到下一层。每胜一层选一项祝福，全程只有一次篝火休整；退出会结束本次挑战。':q.description;
    $('quest-objective').textContent=b?R.battleObjective(b):ex.active?(ex.choicePending?'选择祝福，准备下一层':'准备完毕即可进入下一层'):q.objective;
    $('quest-count').textContent=b?`${b.round} 回合`:ex.active?`${ex.floor} / 12`:q.targets?`${(s.progress[q.id]||[]).length} / ${q.targets.length}`:s.stage===R.terminal?'3 / 3':'0 / 1';
    $('quest-rewards').innerHTML=b?`<span>战斗提示</span><span>${b.fire.length?'橙色火地会在回合结束爆发':R.living(b).some(e=>e.charge)?'移出红格，或以破势打断蓄力':`守势回气 12 · 每回合回气 ${R.qiRegen(s,b)}`}</span>`:ex.active?`<span>已获祝福</span><span>${ex.blessings.map(id=>STORY.blessings[id].name).join(' · ')||'尚无祝福'}</span>`:`<span>任务奖励</span><span>${icon('scroll')}${rewardText(q.rewards)||'悬赏九道 · 剑冢十二层'}</span>`;
    const destination=targetSite(),danger=b?[...R.living(b).flatMap(e=>e.charge||[]),...b.fire]:[],unsafe=b&&danger.some(p=>R.distance(p,b.player)===0);
    $('quest-guide').querySelector('span').textContent=b?(b.phase==='player'?unsafe&&!b.moved?'移出危险区域':b.goal==='escape'?'向金色出口突围':b.goal==='capture'&&R.distance(b.player,b.capture)?'前往金色哨台':canAttackNearest()?`出剑 · ${R.SKILLS[b.selected].name}`:b.moved?'凝神守势':'移步寻找机会':'对手行动中…'):ex.active?'继续剑冢挑战':s.stage===R.terminal?'历练 · 悬赏与剑冢':destination&&R.distance(s,destination)<=2?`${siteVerb(destination)} · ${destination.name}`:q.guide;
    $('quest-guide').disabled=!!b&&b.phase!=='player';
    $('quest-progress').innerHTML=QUESTS.slice(chapter.from,chapter.to+1).map((_,index)=>{const i=chapter.from+index;return`<i class="${i<s.stage?'done':i===s.stage?'current':''}"></i>`;}).join('');
    $('quest-progress').setAttribute('aria-label',`第${q.chapter+1}章进度 ${Math.min(chapter.to-chapter.from+1,s.stage-chapter.from)} / ${chapter.to-chapter.from+1}`);
    $('stance-title').textContent=b?`第${numeral(b.round)}回合`:R.STYLES[s.style].name+'剑路';
    $('stance-subtitle').textContent=b?(b.phase==='player'?'先观其势，再出剑':'对手出招 · 静观其变'):`${R.ITEMS[s.weapon].name} · 攻 ${R.attack(s)} / 防 ${R.defense(s)}`;
    $('nearby-region').textContent=b?'意图 · 气血 · 架势':location.name;
    $('world-note').textContent=b?'破势使敌人停手一回合，接着乘虚追击。':location.note;
    $('battle-resources').hidden=!b;
    if(b){
      $('battle-resources').innerHTML=`<span>用药 ${b.medicineUsed}/${b.medicineMax}${b.medicineCooldown?' · 调息中':''}</span><span>剑势 ${'◆'.repeat(b.momentum)}${'◇'.repeat(3-b.momentum)}</span>${b.poison?`<strong>中毒 ${b.poison} 层 · 每回合 −${b.poison*4}</strong>`:''}${b.ally?`<strong>${b.ally.name} ${b.ally.hp}/${b.ally.maxHp}${b.ally.poison?' · 中毒':''}</strong>`:''}`;
      $('battle-banner').innerHTML=`${b.phase==='player'?'你的回合':'对手回合'} · 第 ${b.round} 回合<small><span class="battle-vitals">气血 ${s.hp}/${R.maxHp(s)} · 真气 ${s.mp} · 用药 ${b.medicineUsed}/${b.medicineMax}</span>${R.battleObjective(b)}<br>${b.phase==='player'?(b.moved?'已移动 · 再行动一次':`可移动 ${b.moveLimit} 格 · 红格避重击 / 金格为目标`):'静观敌势，等待下一回合'}</small>`;
      $('nearby-list').innerHTML=R.living(b).map(e=>`<button class="nearby-button enemy-card" data-enemy="${e.id}" ${b.phase==='player'?'':'disabled'}>${icon(e.role==='shield'?'shield':e.role==='ranged'?'wind':e.role==='poison'||e.role==='healer'?'leaf':'sword')}<span><strong>${e.name}${e.raged?' · 狂怒':''}</strong><em>${R.enemyIntent(s,b,e)}</em><i class="enemy-poise"><i style="width:${e.poiseMax?e.poise/e.poiseMax*100:100}%"></i></i></span><small>${e.hp}/${e.maxHp}<br>${e.poiseMax?`架势 ${e.poise}/${e.poiseMax}`:'护阵中'}</small></button>`).join('');
    }else{
      const places=currentSites().filter(p=>p.id===destination?.id||p.feature||p.travel);places.sort((a,b)=>Number(b.id===destination?.id)-Number(a.id===destination?.id));
      $('nearby-list').innerHTML=ex.active?'<button class="arena-entry" data-panel="arena"><span><strong>返回剑冢</strong><small>选择祝福、休整或继续挑战</small></span></button>':places.slice(0,5).map(p=>`<button class="nearby-button" data-site="${p.id}">${icon(p.type==='enemy'?'sword':p.feature==='heal'||p.feature==='clinic'?'leaf':p.feature==='shop'?'bag':'pin')}<span>${p.name}</span><small>${p.id===destination?.id?'当前任务':p.title||siteVerb(p)}</small>${icon('arrow')}</button>`).join('');
    }
    document.querySelectorAll('[data-skill]').forEach(button=>{
      const id=button.dataset.skill,spell=R.SKILLS[id],cool=b?.cooldowns[id]||0;
      button.classList.toggle('active',id==='move'?!!b?.selectingMove:!b?.selectingMove&&id===(b?.selected||'strike'));
      button.disabled=!!b&&b.phase!=='player'||!!spell&&!s.skills[id]||!!b&&(cool>0||!!spell&&s.mp<spell.cost||id==='potion'&&(!s.bag.potion||b.medicineUsed>=b.medicineMax||b.medicineCooldown>0))||id==='aid'&&(!b?.ally||b.cooldowns.aid>0||s.mp<18)||id==='move'&&(!b||b.moved);
      if(spell&&id!=='ultimate')button.querySelector('span').textContent=cool?`${spell.name} · ${cool}`:spell.name;
    });
    $('ultimate-label').textContent=!s.skills.ultimate?'武当绝学':b?.cooldowns.ultimate?`调息 ${b.cooldowns.ultimate}`:'剑归沧海';
    if(b?.finishing){$('battle-banner').textContent=b.phase==='won'?'胜负已定 · 战利品结算中':'此战已歇 · 整理行装';$('quest-guide').querySelector('span').textContent='战斗结算中…';}
    const mapButton=document.querySelector('.map-button');mapButton.querySelector('span').textContent=b?'暂避锋芒':ex.active?'剑冢休整':'江湖舆图';updatePrompt();
  }
  function rewardText(rewards={}) {
    return [rewards.gold?`${rewards.gold} 铜钱`:'',rewards.xp?`${rewards.xp} 修为`:'',...Object.entries(rewards.items||{}).map(([id,n])=>`${R.ITEMS[id].name}${n>1?' ×'+n:''}`),rewards.skill?R.SKILLS[rewards.skill].name:'',rewards.companion?`${STORY.companions[rewards.companion].name}同行`:''].filter(Boolean).join(' · ');
  }
  function completed(result) {
    if(!result.ok){if(result.message)toast(result.message);return;}
    if(result.partial)note(`已有 ${result.count} / ${result.total} 条进展，继续查看当前指引。`,true);
    else note(`完成「${result.quest.title}」。${rewardText(result.quest.rewards)}。`,true);
    if(result.levels)note(`境界提升至${numeral(state.level)}重，气血真气恢复，悟性 +${result.levels}。`);
    renderHud();save();if(result.chapterEnd)showChapterEnd(result.quest.chapter);
  }
  function completeQuest(id,choice) {completed(R.completeQuest(state,id,choice));}
  function showModal(title,body,eyebrow='江湖百事') {
    hideTooltip();
    const wasOpen=modal.open,sameView=wasOpen&&$('modal-title').textContent===title&&$('modal-eyebrow').textContent===eyebrow;
    const tabKey=()=>{const tab=modalBody.querySelector('.bag-tabs .active');return tab?.dataset.filter??tab?.dataset.trainingTab??'';};
    const oldTab=tabKey(),scrollTop=modalBody.scrollTop,focused=document.activeElement;
    const focusKey=modalBody.contains(focused)?[...focused.attributes].find(a=>a.name==='id'||a.name.startsWith('data-')):null;
    const focusSelector=focusKey?'['+focusKey.name+'="'+CSS.escape(focusKey.value)+'"]':null;
    $('modal-title').textContent=title;$('modal-eyebrow').textContent=eyebrow;modalBody.innerHTML=body;
    path=[];pending=null;if(!wasOpen)modal.showModal();
    if(sameView&&focusSelector){
      const nextFocus=modalBody.querySelector(focusSelector);
      (nextFocus&&!nextFocus.disabled?nextFocus:$('modal-title')).focus({preventScroll:true});
    }else if(!sameView)$('modal-title').focus({preventScroll:true});
    modalBody.scrollTop=sameView&&oldTab===tabKey()&&focused.id!=='dialogue-next'?scrollTop:0;
    updatePrompt();
  }
  function closeModal() {if(modal.open)modal.close();activePanel='';document.querySelectorAll('.nav-button').forEach(b=>b.classList.toggle('active',b.dataset.panel==='world'));updatePrompt();}
  function dialogue(site,lines,onDone,button='就此动身') {
    activePanel='dialogue';let index=0;
    function page() {
      showModal(site.name,`<canvas class="dialogue-portrait" width="96" height="110" id="dialogue-portrait"></canvas><div class="dialogue-name">${site.name}</div><div class="dialogue-role">${site.title||'江湖相逢'}</div><p class="dialogue-text">${lines[index]}</p><span class="dialogue-step">${index+1} / ${lines.length}</span><div class="modal-actions"><button class="primary-button" id="dialogue-next">${index<lines.length-1?'继续交谈':button}${icon('arrow')}</button></div>`,'一面之缘 · 一段故事');
      drawPortrait($('dialogue-portrait'),site.color||'#8f9c81',site.id);
      $('dialogue-next').onclick=()=>{if(index<lines.length-1){index++;page();}else{closeModal();onDone?.();renderHud();save();}};
    }page();
  }
  function interact(site) {
    if(!site||battle||modal.open||fishing)return;
    if(state.expedition.active){openTower();return;}
    const q=QUESTS[state.stage],isTarget=site.id===q.target,inGroup=q.targets?.includes(site.id);
    if(isTarget&&q.kind==='talk'){dialogue(site,q.lines,()=>completeQuest(q.id),q.reply);return;}
    if(isTarget&&q.kind==='choice'){openChoice(site,q);return;}
    if(isTarget&&q.kind==='battle'){openEncounter(R.encounterFor(state,q));return;}
    if(isTarget&&q.kind==='puzzle'){openPuzzle(site,q.puzzle);return;}
    if(inGroup){
      if((state.progress[q.id]||[]).includes(site.id)){toast('此处已经查明，请前往下一处目标。');return;}
      if(q.kind==='collect'){note(`采得${site.name}。`);completed(R.recordObjective(state,site.id));playFeedback('gather');return;}
      if(q.kind==='clues'){const clue=STORY.clues[site.id];dialogue(site,clue.lines,()=>{note(clue.entry);completed(R.recordObjective(state,site.id));},'记下线索');return;}
      if(site.encounter){openEncounter(site.encounter);return;}
      if(site.puzzle){openPuzzle(site,site.puzzle);return;}
    }
    if(site.travel){travel(site.travel);return;}
    if(site.feature==='map'){openMap();return;}
    if(site.feature==='shop'){openShop();return;}
    if(site.feature==='forge'){openForge();return;}
    if(site.feature==='party'){openParty();return;}
    if(site.feature==='arena'){openArena();return;}
    if(site.feature==='spar'){openEncounter('spar');return;}
    if(site.feature==='clinic'){openClinic(site);return;}
    if(site.feature==='jade'){openSide('jade');return;}
    if(site.feature==='crates'){openSide('cargo');return;}
    if(site.feature==='inn'){
      showModal(site.name,`<p class="modal-intro">一碗热茶，一宿好梦。花费 15 铜钱，恢复全部气血与真气。</p><div class="modal-actions"><button class="secondary-button" data-close>改日再来</button><button class="primary-button" id="rest" ${state.gold<15?'disabled':''}>歇脚 · 15 铜钱</button></div>`,'灯火可亲');
      $('rest').onclick=()=>{if(state.gold<15)return;state.gold-=15;state.hp=R.maxHp(state);state.mp=R.maxMp(state);closeModal();note('一夜好眠，气血与真气已尽数恢复。',true);renderHud();save();playFeedback('rest');};
    }else if(site.feature==='fish'){
      fishing=true;path=[];pending=null;const token=generation;toast('你甩下鱼线，静候溪中动静……');$('scene-message').textContent='静候鱼来';$('scene-message').hidden=false;playFeedback('castLine');
      setTimeout(()=>{if(token!==generation)return;fishing=false;$('scene-message').hidden=true;addItem('fish');grant(3);note('浮标一动，你钓起一尾溪中鲤！已收入行囊。',true);renderHud();save();playFeedback('catch');},2200);
    }else if(site.feature==='chest'){
      if(state.opened.includes(site.id))return;state.opened.push(site.id);if(site.id==='chest')state.chest=true;R.reward(state,site.loot);note(`打开${site.name}，获得${rewardText(site.loot)}。`,true);playFeedback('chest');renderHud();save();
    }else if(site.feature==='ore'||site.feature==='crate'){
      if(state.pickups.includes(site.id))return;state.pickups.push(site.id);addItem(site.feature==='ore'?'ore':'cargo',site.feature==='ore'?2:1);note(site.feature==='ore'?'采得玄铁矿 ×2，可带去平康城淬炼兵刃。':`拾得陆家镖货（${state.bag.cargo||0}/3），镖局伙计正在寻找它们。`,true);renderHud();save();playFeedback(site.feature==='ore'?'ore':'chest');
    }else if(site.feature==='heal'){healAt(site.name);}
    else if(site.puzzle){toast('留意当前指引，轮到此处时再参悟碑文。');}
    else if(site.type==='herb'){toast('这是青灵草。先向柳伯打听旧信，再替白芷采药。');}
    else dialogue(site,[site.blurb||'江湖路远，别忘了照顾自己。若有要紧的事，随时回来找我。'],null,'告辞');
  }
  function openEncounter(id,context={kind:'story'}) {
    if(battle)return;
    if(state.expedition.active&&context.kind!=='tower'){openTower();return;}
    const info=STORY.encounters[id],preview=R.makeBattle(state,id,context);
    showModal(info.name,`<p class="modal-intro">${info.flavor}</p><div class="objective-callout">${R.battleObjective(preview)}</div><div class="encounter-roster">${preview.enemies.map(e=>`<div>${icon(e.role==='ranged'?'wind':e.role==='shield'?'shield':e.role==='healer'||e.role==='poison'?'leaf':'sword')}<strong>${e.name}</strong><span>${R.roleNames[e.role]} · ${R.enemyIntent(state,preview,e)}</span><small>气血 ${e.hp}<br>攻击 ${e.attack}${e.poiseMax?` / 架势 ${e.poiseMax}`:''}</small></div>`).join('')}</div><p class="modal-intro encounter-tip">建议境界 ${numeral(info.scales||context.kind==='tower'?Math.max(info.level,state.level):info.level)}重 · 当前${numeral(state.level)}重 · ${R.DIFFICULTIES[state.difficulty].name}<br>${R.STYLES[state.style].name}剑路 · 移动 ${preview.moveLimit} 格 · 每战可用药 ${preview.medicineMax} 次${preview.solo?' · 独自试剑，无同伴援护':state.companion?' · '+STORY.companions[state.companion].name+'援护':''}<br>${context.kind==='tower'?'胜后保留气血与真气，选择祝福进入下一层。':context.kind==='contract'?'首次完成领取悬赏报酬，主线进度保留。':info.practice?'擂台对手随境界成长，切磋后会恢复气血真气。':'失败可休整后重试。胜利会接续当前目标。'}</p><div class="modal-actions"><button class="secondary-button" data-close>整顿行装</button><button class="secondary-button" data-panel="skills">查看修行</button><button class="primary-button" id="encounter-start" data-encounter="${id}">拔剑迎战${icon('sword')}</button></div>`,'观阵识敌 · 再定剑路');
    $('encounter-start').onclick=()=>startBattle(id,context);
  }

  function openChoice(site,q){
    showModal(q.title,`<p class="dialogue-name">${site.name}</p><div class="dialogue-lines">${q.lines.map(line=>`<p>${line}</p>`).join('')}</div><div class="story-choices">${q.choices.map(c=>`<button data-choice="${c.id}"><strong>${c.label}</strong><small>${c.description}</small>${icon('arrow')}</button>`).join('')}</div>`,'此刻的选择 · 亦是你的江湖');
    modalBody.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{closeModal();completeQuest(q.id,b.dataset.choice);});
  }
  function openPuzzle(site,id) {
    const puzzle=STORY.puzzles[id],questId=QUESTS[state.stage].id;let entered=[],solved=false;
    const finish=()=>{if(solved||QUESTS[state.stage].id!==questId)return;solved=true;closeModal();note(puzzle.success,true);const q=QUESTS[state.stage];completed(q.targets?R.recordObjective(state,site.id):R.completeQuest(state,q.id));playFeedback('solve');};
    if(puzzle.kind==='lights'){
      let cells=R.initialLights(puzzle),steps=0;
      const draw=()=>{
        showModal(puzzle.title,`<p class="puzzle-inscription">${puzzle.hint}</p><div class="puzzle-readout" id="puzzle-readout">已点亮 ${cells.filter(Boolean).length} / 9 · 已拨动 ${steps} 次</div><div class="lights-grid">${cells.map((lit,i)=>`<button data-light="${i}" class="${lit?'lit':''}" aria-pressed="${lit}" aria-label="第 ${i+1} 灯，${lit?'亮':'灭'}"><span>${lit?'✦':'◇'}</span><small>${i+1}</small></button>`).join('')}</div><div class="modal-actions"><button class="secondary-button" id="lights-reset">重置机关</button><button class="secondary-button" id="lights-hint">看看一步提示</button></div>`,'九宫相连 · 观其变化');
        modalBody.querySelectorAll('[data-light]').forEach(button=>button.onclick=()=>{cells=R.toggleLights(cells,Number(button.dataset.light));steps++;if(cells.every(Boolean))finish();else draw();});
        $('lights-reset').onclick=()=>{cells=R.initialLights(puzzle);steps=0;draw();};
        $('lights-hint').onclick=()=>{const solution=R.lightSolution(cells);if(solution?.length){$('puzzle-readout').textContent=`试着拨动第 ${solution[0]+1} 灯。当前局面最少还需 ${solution.length} 步。`;modalBody.querySelector(`[data-light="${solution[0]}"]`).classList.add('hint');}};
      };draw();return;
    }
    showModal(puzzle.title,`<p class="puzzle-inscription">${puzzle.hint}</p><div class="puzzle-readout" id="puzzle-readout">${puzzle.answer?'依碑文的先后顺序，触动三枚印记。':'想清楚后，再作回答。'}</div><div class="puzzle-options">${(puzzle.symbols||puzzle.options).map((label,i)=>`<button data-puzzle-option="${i}">${label}</button>`).join('')}</div><p class="modal-intro" style="margin-top:18px">答错可以重新参悟，不会消耗物品。</p>`,'观其意 · 解其势');
    modalBody.querySelectorAll('[data-puzzle-option]').forEach(button=>button.onclick=()=>{
      if(solved||QUESTS[state.stage].id!==questId)return;const n=Number(button.dataset.puzzleOption);let success=false;
      if(puzzle.answer){entered.push(puzzle.symbols[n]);if(entered.at(-1)!==puzzle.answer[entered.length-1]){entered=[];$('puzzle-readout').textContent='机括未合。再看看碑文，从第一枚印记重来。';playFeedback('error');return;}$('puzzle-readout').textContent=entered.join(' → ');success=entered.length===puzzle.answer.length;playFeedback('puzzle');}
      else success=n===puzzle.correct;
      if(!success){if(!puzzle.answer)$('puzzle-readout').textContent='证言还对不上，再看看江湖志的线索。';return;}finish();
    });
  }

  function healAt(name){if(state.expedition.active){openTower();return;}state.hp=R.maxHp(state);state.mp=R.maxMp(state);note(`在${name}调息，气血与真气已恢复。`,true);renderHud();save();playFeedback('rest');}
  function openClinic(site){
    showModal(site.name,`<p class="modal-intro">「救人不问来处。坐下歇一歇，我替你诊脉。」<br>免费恢复全部气血与真气。${site.id==='doctor'?'<br><br>白芷还需要两尾鲜鲤，为养伤的镖师炖汤。':''}</p><div class="modal-actions">${site.id==='doctor'?'<button class="secondary-button" id="fish-commission">看看鲜鲤委托</button>':''}<button class="primary-button" id="heal-free">请你诊治 · 免费</button></div>`,'山路虽远 · 莫忘珍重');
    $('heal-free').onclick=()=>{closeModal();healAt(site.name);};if($('fish-commission'))$('fish-commission').onclick=()=>openSide('fish');
  }
  const SIDE_QUESTS={
    fish:{title:'一碗暖汤',text:'白芷想给养伤的镖师炖一锅鱼汤。去梧桐村溪边钓两尾鲜鲤，再送回来。',item:'fish',count:2,location:'village',target:'fish',reward:{xp:35,gold:60,items:{potion:2},rep:1}},
    jade:{title:'故人的平安扣',text:'柳伯年轻时赠给故人的玉扣遗落在东岸。找到溪畔旧箱，将平安玉扣带给他。',item:'jade',count:1,location:'village',target:'chest',reward:{xp:40,items:{manual:1},rep:2}},
    cargo:{title:'失散的镖货',text:'三箱陆家镖货散落在平康城西南、东侧药铺旁与南门一带。集齐后交还镖局。',item:'cargo',count:3,location:'city',target:'crate1',reward:{xp:55,gold:110,items:{ore:3}}}
  };
  function openSide(id){
    const q=SIDE_QUESTS[id],done=state.sideDone.includes(id),enough=(state.bag[q.item]||0)>=q.count;
    showModal(q.title,`<p class="modal-intro">${q.text}</p><div class="side-progress">${done?'委托已完成':`${R.ITEMS[q.item].name} · ${state.bag[q.item]||0} / ${q.count}`}</div><p class="modal-intro">谢礼：${rewardText(q.reward)}</p><div class="modal-actions"><button class="secondary-button" data-close>暂且告辞</button>${done?'':`<button class="primary-button" id="side-action">${enough?'交付物品，完成委托':'前往寻找'}</button>`}</div>`,'江湖小事 · 亦有情义');
    if(!done)$('side-action').onclick=()=>{
      if((state.bag[q.item]||0)>=q.count){if(state.sideDone.includes(id))return;state.bag[q.item]-=q.count;state.sideDone.push(id);R.reward(state,q.reward);closeModal();note(`完成委托「${q.title}」，获得${rewardText(q.reward)}。`,true);renderHud();save();}
      else{closeModal();if(state.location!==q.location)travel(q.location);navigate(id==='cargo'?currentSites().find(p=>p.feature==='crate'):findSite(q.target));}
    };
  }
  function openForge(){
    if(battle){toast('交锋结束后再锻造。');return;}if(state.expedition.active){openTower();return;}if(!R.canTravel(state,'city')){toast('第二章到平康城后可向唐铸学习锻造。');return;}
    const level=state.refinement[state.weapon]||0,cost=(level+1)*65,ore=level+1;
    showModal('唐铸的铁匠铺',`<p class="modal-intro">「好剑也要经火。玄铁入锋，一重便多三分力。」<br>当前兵刃：<strong>${R.ITEMS[state.weapon].name}</strong> · 淬炼 ${level} / 3 重<br>现有玄铁 ${state.bag.ore||0} 块 · 盘缠 ${state.gold} 铜钱</p><div class="forge-preview">${icon('sword')}<strong>攻击 ${R.attack(state)} → ${R.attack(state)+(level<3?3:0)}</strong><span>淬炼保留在这柄兵刃上</span></div><div class="modal-actions"><button class="secondary-button" data-panel="bag">查看行囊</button><button class="primary-button" id="refine" ${level>=3||state.gold<cost||(state.bag.ore||0)<ore?'disabled':''}>${level>=3?'已淬炼至三重':`淬炼 · ${cost} 铜钱 / ${ore} 玄铁`}</button></div><h3 class="journal-subheading">护身佩饰 · 各有所长</h3><p class="modal-intro">现有侠义令 ${state.bag.merit||0} 枚。每件需要 3 枚侠义令、2 块玄铁与 120 铜钱。打造后在行囊装备。</p><div class="item-list">${Object.entries(R.ITEMS).filter(([,item])=>item.category==='accessory').map(([id,item])=>`<div class="item-card"><div class="item-top"><span class="item-icon">${icon(item.icon)}</span><strong>${item.name}</strong></div><p>${item.description}</p><button data-craft="${id}" ${state.bag[id]||state.gold<120||(state.bag.ore||0)<2||(state.bag.merit||0)<3?'disabled':''}>${state.bag[id]?'已持有':'打造佩饰'}</button></div>`).join('')}</div>`,'千锤百炼 · 锋自火中来');
    modalBody.querySelectorAll('[data-craft]').forEach(b=>b.onclick=()=>{const result=R.craft(state,b.dataset.craft);if(result.ok){note(result.message,true);renderHud();save();openForge();}else toast(result.message);});
    $('refine').onclick=()=>{const result=R.refine(state);if(result.ok){note(result.message,true);renderHud();save();openForge();}else toast(result.message);};
  }
  function openParty(){
    showModal('同行之人',`<p class="modal-intro">同伴从旁援护，无需额外操作。每次选择一位同行，战斗中不能更换。</p><div class="party-list">${Object.entries(STORY.companions).map(([id,p])=>{const unlocked=state.companions.includes(id);return`<div class="party-card"><canvas class="party-portrait" width="96" height="110" data-portrait="${id}"></canvas><div><h3>${p.name}</h3><span>${p.title}</span><p>${unlocked?p.description:id==='qingshuang'?'第二章「断镖疑云」后加入。':'第三章「松风旧事」后加入。'}</p></div><button class="secondary-button" data-companion="${id}" ${!unlocked||battle||state.expedition.active?'disabled':''}>${state.companion===id?'正在同行':unlocked?'邀请同行':'尚未结识'}</button></div>`;}).join('')}</div><div class="modal-actions"><button class="secondary-button" data-companion="" ${battle||state.expedition.active?'disabled':''}>独自行走</button></div>`,'江湖不独行');
    modalBody.querySelectorAll('[data-portrait]').forEach(c=>drawPortrait(c,STORY.companions[c.dataset.portrait].color,c.dataset.portrait));
    modalBody.querySelectorAll('[data-companion]').forEach(b=>b.onclick=()=>{if(battle||state.expedition.active)return;const id=b.dataset.companion;if(id&&!state.companions.includes(id))return;state.companion=id;note(id?`${STORY.companions[id].name}与你结伴而行。`:'你决定独自走一段江湖。',true);renderHud();save();openParty();});
  }
  function openArena() {
    if(battle){toast('先结束眼前的交锋，再接下一道历练。');return;}
    if(state.expedition.active){openTower();return;}
    const unlocked=state.stage>STORY.index('bamboo-fight');
    showModal('江湖历练',`<p class="modal-intro">${state.contracts.length} / 9 道悬赏完成 · 剑冢最高 ${state.expedition.best} / 12 层<br>悬赏依次解锁，每道只领取一次报酬；对手随你的境界成长。主线进度保留。</p><div class="challenge-entries"><button class="arena-entry" id="tower-open" ${!unlocked?'disabled':''}>${icon('compass')}<span><strong>十二层剑冢</strong><small>气血真气连续消耗 · 胜后选祝福 · 一次篝火休整</small></span>${icon('arrow')}</button><button class="arena-entry" id="arena-start">${icon('sword')}<span><strong>平康擂台</strong><small>随境界成长 · 可重复切磋 · 修为与铜钱</small></span>${icon('arrow')}</button></div>${!unlocked?'<p class="modal-intro">击败青竹径山匪后，悬赏与剑冢开放。</p>':''}<div class="contract-list">${STORY.contracts.map((c,i)=>{const done=state.contracts.includes(c.id),available=unlocked&&(!c.need||state.contracts.includes(c.need));return`<button class="contract-card ${done?'complete':''}" data-contract="${c.id}" ${done||!available?'disabled':''}><span class="contract-number">${String(i+1).padStart(2,'0')}</span><span><strong>${c.name}</strong><p>${c.description}</p><small>${done?'已领赏':available?`建议 ${c.level} 重 · ${rewardText(c.rewards)}`:'先完成上一道悬赏'}</small></span>${icon(done?'check':'arrow')}</button>`;}).join('')}</div><h3 class="journal-subheading">行路小事</h3><div class="side-list">${Object.entries(SIDE_QUESTS).map(([id,q])=>`<button data-side="${id}" ${!R.canTravel(state,q.location)?'disabled':''}><span>${q.title}</span><small>${state.sideDone.includes(id)?'已完成':LOCATIONS[q.location].name+' · 可接取'}</small>${icon('arrow')}</button>`).join('')}</div><div class="modal-actions"><button class="secondary-button" data-panel="skills">修行搭配</button><button class="secondary-button" data-panel="shop">补充伤药</button><button class="secondary-button" id="replay-open" ${state.stage!==R.terminal?'disabled':''}>${state.stage===R.terminal?'保留装备 · 重游章节':'通关后可重游章节'}</button></div>`,'问剑长歌 · 江湖未尽');
    $('arena-start').onclick=()=>openEncounter('arena');$('tower-open').onclick=openTower;$('replay-open').onclick=openReplay;
    modalBody.querySelectorAll('[data-contract]').forEach(b=>b.onclick=()=>{const c=STORY.contracts.find(c=>c.id===b.dataset.contract);if(!b.disabled)openEncounter(c.encounter,{kind:'contract',id:c.id});});
    modalBody.querySelectorAll('[data-side]').forEach(b=>b.onclick=()=>openSide(b.dataset.side));
  }
  function openTower() {
    if(battle){toast('剑冢休整在每层交锋结束后开放。');return;}
    const ex=state.expedition,unlocked=state.stage>STORY.index('bamboo-fight');
    let body=`<p class="modal-intro">十二场不同目标的交锋，从浅滩盾阵直到风雷终战。入冢时恢复状态，之后层间保留气血、真气与药品消耗。每层胜后可选一项祝福，同一祝福最多三重。<br>全程一次篝火：恢复六成气血与真气。升级只提升上限，不会在剑冢中自动补满。<br>建议先备好兵刃、解毒散与内功。完整登顶建议八重以上；每次最高层记录都会保留。</p><div class="tower-track">${STORY.floors.map((id,i)=>`<div class="${ex.active&&ex.floor===i+1?'current':i<ex.best?'cleared':''}"><small>第 ${i+1} 层</small><strong>${STORY.encounters[id].name}</strong><span>${ex.active&&ex.floor===i+1?'即将挑战':i<ex.best?'曾经通过':'待问剑'}</span></div>`).join('')}</div>`;
    if(!ex.active)body+=`<div class="objective-callout">最高记录 ${ex.best} / 12 层 · 当前${numeral(state.level)}重 · ${R.DIFFICULTIES[state.difficulty].name}</div><p class="modal-intro">开始后流派、难度与装备锁定至本次结束。可先在修行与行囊做好准备。</p><div class="modal-actions"><button class="secondary-button" data-panel="skills">调整修行</button><button class="secondary-button" data-panel="bag">整理行囊</button><button class="primary-button" id="tower-start" ${unlocked?'':'disabled'}>${unlocked?'入冢 · 从第一层开始':'击败青竹径山匪后开放'}</button></div>`;
    else{
      const counts=Object.keys(STORY.blessings).filter(id=>ex.blessings.includes(id)).map(id=>`${STORY.blessings[id].name} ×${ex.blessings.filter(v=>v===id).length}`);
      body+=`<div class="objective-callout">准备第 ${ex.floor} 层 · 气血 ${state.hp}/${R.maxHp(state)} · 真气 ${state.mp}/${R.maxMp(state)}</div><p class="modal-intro">已有祝福：${counts.join(' · ')||'无'}<br>篝火休整：${ex.rested?'已经使用':'还剩 1 次'} · 随时关闭此面板也会保留层间进度。</p>`;
      if(ex.choicePending)body+=`<h3 class="journal-subheading">取一份剑意，继续前行</h3><div class="build-grid">${Object.entries(STORY.blessings).map(([id,item])=>`<button class="build-card" data-blessing="${id}" ${ex.blessings.filter(v=>v===id).length>=3?'disabled':''}><strong>${item.name}</strong><p>${item.description}</p><small>已选 ${ex.blessings.filter(v=>v===id).length} / 3 重</small></button>`).join('')}</div>`;
      body+=`<div class="modal-actions"><button class="secondary-button" id="tower-abandon">离开剑冢</button><button class="secondary-button" id="tower-rest" ${ex.rested||state.hp===R.maxHp(state)&&state.mp===R.maxMp(state)?'disabled':''}>${ex.rested?'篝火已用尽':'篝火休整 · 仅一次'}</button><button class="primary-button" id="tower-continue" ${ex.choicePending?'disabled':''}>${ex.choicePending?'先选择一项祝福':`挑战第 ${ex.floor} 层`}${icon('arrow')}</button></div>`;
    }
    showModal('十二层剑冢',body,'踏入之后 · 余力皆有用');
    if($('tower-start'))$('tower-start').onclick=()=>{if(R.startExpedition(state).ok){note('踏入剑冢。气血真气已补满，后续十二层需珍惜余力。');renderHud();save();openTower();}};
    if($('tower-continue'))$('tower-continue').onclick=()=>{if(!ex.choicePending)openEncounter(STORY.floors[ex.floor-1],{kind:'tower',floor:ex.floor});};
    if($('tower-rest'))$('tower-rest').onclick=()=>{if(R.restExpedition(state)){note('围着篝火休整，恢复六成气血与真气。余路再无篝火。',true);renderHud();save();openTower();playFeedback('rest');}};
    modalBody.querySelectorAll('[data-blessing]').forEach(b=>b.onclick=()=>{if(R.chooseBlessing(state,b.dataset.blessing)){note(`选得「${STORY.blessings[b.dataset.blessing].name}」祝福。`,true);renderHud();save();openTower();}});
    if($('tower-abandon'))$('tower-abandon').onclick=()=>{showModal('离开剑冢',`<p class="modal-intro">结束本次挑战，已领报酬与最高 ${ex.best} 层记录保留。下次从第一层重新选择祝福。</p><div class="modal-actions"><button class="secondary-button" id="tower-stay">继续这一程</button><button class="primary-button" id="tower-leave">确认离开</button></div>`,'剑可收 · 来日再问');$('tower-stay').onclick=openTower;$('tower-leave').onclick=()=>{R.abandonExpedition(state);note('走出剑冢，历练报酬与最高层记录已保存。');renderHud();save();openArena();};};
  }
  function openReplay() {
    if(state.stage!==R.terminal||battle||state.expedition.active)return;
    showModal('保留修为 · 章节重游',`<p class="modal-intro">选择起点，重走加长后的章节。境界、招式、装备、同伴与悬赏记录保留；选择章节及其后续主线会重新开始，对手随境界增强。重游前的完整存档会另作本地备份。</p><div class="story-choices">${STORY.chapters.map((c,i)=>`<button data-replay="${i}"><strong>第${numeral(i+1)}章 · ${c.name}</strong><small>${c.to-c.from+1} 段任务 · ${c.description}</small></button>`).join('')}</div>`,'再入江湖 · 剑意犹新');
    modalBody.querySelectorAll('[data-replay]').forEach(b=>b.onclick=()=>{
      const index=Number(b.dataset.replay),chapter=STORY.chapters[index];
      showModal(`从「${chapter.name}」重游`, `<p class="modal-intro">保留现有境界与行囊，重新经历本章及后续章节。指南中可恢复这次重游之前的存档。</p><div class="modal-actions"><button class="secondary-button" data-close>暂不动身</button><button class="primary-button" id="confirm-replay">确认备份并重游</button></div>`,'故地重行');
      $('confirm-replay').onclick=()=>{try{localStorage.setItem('wandering-sword-before-replay',JSON.stringify(state));}catch{toast('本地备份失败，请先在指南导出存档再重游。');return;}if(R.replayChapter(state,index)){loadState(state);note(`保留修为，从「${chapter.name}」再入江湖。对手会随你的境界增强。`,true);save();}};
    });
  }
  function openShop() {
    if(battle){toast('战斗中无法购药，请使用行囊内的补给。');return;}if(state.expedition.active){openTower();return;}
    activePanel='shop';showModal('江湖行商',`<p class="modal-intro">「出门在外，伤药总得备上几包。」<br>你的盘缠：<strong>${state.gold}</strong> 铜钱</p><div class="item-list">${(state.stage>=STORY.index('city-arrival')?['potion','qi','elixir','antidote']:['potion','qi','antidote']).map(id=>{const item=R.ITEMS[id];return `<div class="item-card"><div class="item-top"><span class="item-icon">${icon(item.icon)}</span><div><strong>${item.name}</strong><small>持有 ${state.bag[id]||0}</small></div></div><p>${item.description}</p><button data-buy="${id}" ${state.gold<item.price?'disabled':''}>购入 · ${item.price} 铜钱</button></div>`;}).join('')}</div>`,'小本经营 · 童叟无欺');
    modalBody.querySelectorAll('[data-buy]').forEach(button=>button.onclick=()=>{const id=button.dataset.buy,item=R.ITEMS[id];if(state.gold<item.price)return;state.gold-=item.price;addItem(id);note(`购入${item.name} ×1，花费 ${item.price} 铜钱。`);renderHud();save();openShop();});
  }
  function openBag(filter='all') {
    activePanel='bag';
    const items=Object.entries(state.bag).filter(([id,count])=>count>0&&(filter==='all'||R.ITEMS[id].category===filter||(filter==='equipment'&&['weapon','armor','accessory'].includes(R.ITEMS[id].category))));
    showModal('行囊',`<p class="modal-intro">盘缠 <strong>${state.gold}</strong> 铜钱 · 攻击 ${R.attack(state)} · 防御 ${R.defense(state)}${battle?` · 用药 ${battle.medicineUsed}/${battle.medicineMax}，药物共用次数`:state.expedition.active?' · 剑冢途中仅可在战斗内用药，换装需离开剑冢':''}</p><div class="bag-tabs">${[['all','全部'],['medicine','丹药食物'],['equipment','兵刃护具'],['accessory','护身佩饰'],['misc','随身杂物']].map(([id,name])=>`<button data-filter="${id}" class="${id===filter?'active':''}">${name}</button>`).join('')}</div><div class="item-list">${items.length?items.map(([id,count])=>{const item=R.ITEMS[id],gear=['weapon','armor','accessory'].includes(item.category),canUse=item.category==='medicine'||id==='manual'||gear,equipped=id===state.weapon||id===state.armor||id===state.accessory;const disabled=equipped||!canUse||(battle&&(battle.phase!=='player'||item.category!=='medicine'||battle.medicineUsed>=battle.medicineMax||battle.medicineCooldown>0))||(!battle&&state.expedition.active);return `<div class="item-card"><div class="item-top"><span class="item-icon">${icon(item.icon)}</span><div><strong>${item.name}</strong><small>${gear?(equipped?'已装备':'可装备'):'持有 × '+count}${state.refinement[id]?' · 淬炼 '+state.refinement[id]+' 重':''}</small></div></div><p>${item.description}</p><button data-item="${id}" ${disabled?'disabled':''}>${equipped?'已装备':gear?'装备':id==='manual'?'参悟剑谱':canUse?'使用':'随身携带'}</button></div>`;}).join(''):'<p class="empty-state">此处暂时空空，去江湖中走走吧。</p>'}</div>`,'一剑随身 · 方寸江湖');
    modalBody.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>openBag(b.dataset.filter));
    modalBody.querySelectorAll('[data-item]').forEach(button=>{
      const id=button.dataset.item,card=button.closest('.item-card');card.dataset.itemCard=id;
      card.classList.toggle('is-equipped',[state.weapon,state.armor,state.accessory].includes(id));
      button.onclick=()=>{
        if(battle){closeModal();perform(id);return;}if(state.expedition.active)return;
        const before=statSnapshot(),result=R.useItem(state,id);
        if(result.ok){note(result.message);renderHud();save();openBag(filter);itemFeedback(id,before,result);}
        else rejectedAction(result.message,card);
      };
    });
  }
  function openSkills(tab='martial') {
    const locked=!!battle||state.expedition.active,preview=battle||R.makeBattle(state,'spar');activePanel='skills';
    const tabs=`<div class="bag-tabs"><button data-training-tab="martial" class="${tab==='martial'?'active':''}">武学修习</button><button data-training-tab="build" class="${tab==='build'?'active':''}">流派与心诀</button><button data-training-tab="difficulty" class="${tab==='difficulty'?'active':''}">难度与准备</button></div>`;
    let body=`<p class="modal-intro">${R.STYLES[state.style].name}剑路 · ${R.DISCIPLINES[state.discipline].name}心诀 · ${R.DIFFICULTIES[state.difficulty].name}<br>攻击 ${R.attack(state)} / 防御 ${R.defense(state)} / 移动 ${R.moveLimit(state)} 格 · 悟性 <strong>${state.insight}</strong>${locked?'<br>交锋与剑冢途中只能查看修行，结束后可调整。':''}</p>${tabs}`;
    if(tab==='martial')body+=`<p class="modal-intro">提高一重依次需要 1、2、3、4 点悟性。攻击招式每重提高 4 点基础伤害与 2 点破势；毒刃直伤按四成计算。内功每重多恢复 8 气血。剑谱可在行囊参悟。</p><div class="skill-list">${Object.entries(R.SKILLS).map(([id,skill])=>`<div class="skill-card"><span class="item-icon">${icon(skill.icon)}</span><div class="skill-copy"><h3>${skill.name}<small>${state.skills[id]?numeral(state.skills[id])+'重':'尚未习得'}</small></h3><p>${state.skills[id]?skill.description:({pierce:'第一章向莫问学习后习得。',poison:'第一章击败施毒斥候后习得。',ultimate:'第三章通过武当山门试剑后习得。'})[id]}</p><span>${skill.cost?'消耗 '+skill.cost+' 真气':'不消耗真气'}${state.skills[id]?' · '+(id==='heal'?'恢复 '+R.healing(state)+' 气血':'伤害 '+R.skillDamage(state,preview,id))+(skill.cooldown?` · 调息 ${skill.cooldown-1} 回合`:''):''}</span></div><button class="secondary-button" data-learn="${id}" ${state.insight<R.learnCost(state,id)||!state.skills[id]||state.skills[id]>=5||locked?'disabled':''}>${!state.skills[id]?'主线解锁':state.skills[id]>=5?'已臻圆满':`修习 · ${R.learnCost(state,id)} 悟性`}</button></div>`).join('')}</div>`;
    if(tab==='build')body+=`<h3 class="journal-subheading">剑路 · 可免费更换</h3><div class="build-grid">${Object.entries(R.STYLES).map(([id,item])=>`<button data-style="${id}" class="build-card ${state.style===id?'selected':''}" ${locked||state.stage<=STORY.index('first-style')&&!state.replays?'disabled':''}><strong>${item.name}</strong><p>${item.description}</p><small>${state.style===id?'正在运用':'改走这条剑路'}</small></button>`).join('')}</div><h3 class="journal-subheading">心诀 · 一次运用一门</h3><div class="build-grid">${Object.entries(R.DISCIPLINES).filter(([id])=>id!=='none').map(([id,item])=>`<button data-discipline="${id}" class="build-card ${state.discipline===id?'selected':''}" ${locked||state.stage<=STORY.index('temple-discipline')&&!state.replays?'disabled':''}><strong>${item.name}</strong><p>${item.description}</p><small>${state.discipline===id?'正在运用':state.stage<=STORY.index('temple-discipline')&&!state.replays?'第三章武当问剑后解锁':'运用这门心诀'}</small></button>`).join('')}</div><h3 class="journal-subheading">护身佩饰</h3><p class="modal-intro">${state.accessory?R.ITEMS[state.accessory].name+'：'+R.ITEMS[state.accessory].description:'尚未佩戴。完成悬赏可获佩饰，亦可用侠义令在铁匠铺打造。'}</p><div class="modal-actions"><button class="secondary-button" data-panel="bag">行囊换装</button><button class="secondary-button" data-panel="forge">前往锻造</button></div>`;
    if(tab==='difficulty')body+=`<div class="build-grid difficulty-grid">${Object.entries(R.DIFFICULTIES).map(([id,item])=>`<button data-difficulty="${id}" class="build-card ${state.difficulty===id?'selected':''}" ${locked?'disabled':''}><strong>${item.name}</strong><p>${item.description}</p><small>敌方气血 ${Math.round(item.hp*100)}% · 攻击 ${Math.round(item.attack*100)}%<br>每战基础用药 ${item.medicine} 次</small></button>`).join('')}</div><div class="combat-lessons"><p><strong>破势：</strong>击空黄色架势条可打断蓄力，使敌人停手一回合；下一回合追击有伤害加成。</p><p><strong>积势：</strong>普攻积累剑势，破岳剑与清风掠影会消耗它，增强伤害；破岳剑还会增强破势。</p><p><strong>取舍：</strong>毒刃适合持续消耗；药师能救同伙，阵柱能护首领，先挑准目标。</p><p><strong>护送：</strong>站到追兵前面吸引攻击，靠近友方三格内用援救；友方倒下也会败北。</p><p><strong>用药：</strong>药物共用次数，服下后需间隔一回合。内功回复与守势回气能补足空档。</p></div>`;
    showModal('修行',body,'剑路自选 · 胜负在心');
    modalBody.querySelectorAll('[data-training-tab]').forEach(b=>b.onclick=()=>openSkills(b.dataset.trainingTab));
    modalBody.querySelectorAll('[data-learn]').forEach(b=>b.onclick=()=>{if(locked)return;const id=b.dataset.learn,result=R.learn(state,id);if(result.ok){note(`${R.SKILLS[id].name}修至${numeral(state.skills[id])}重。`,true);renderHud();save();openSkills(tab);}});
    for(const field of['style','discipline','difficulty'])modalBody.querySelectorAll(`[data-${field}]`).forEach(b=>b.onclick=()=>{if(locked||b.disabled)return;state[field]=b.dataset[field];note('修行已调整，下一场交锋生效。',true);renderHud();save();openSkills(tab);});
  }

  function openJournal(chapter=QUESTS[state.stage].chapter) {
    const c=STORY.chapters[chapter],clueIds=QUESTS.filter(q=>q.kind==='clues').flatMap(q=>state.progress[q.id]||[]);activePanel='journal';
    showModal('江湖志',`<div class="bag-tabs">${STORY.chapters.map((item,i)=>`<button data-journal-chapter="${i}" class="${i===chapter?'active':''}">第${numeral(i+1)}章 · ${item.name}</button>`).join('')}</div><div class="journal-list">${QUESTS.slice(c.from,c.to+1).map((q,index)=>{const i=c.from+index;return`<div class="journal-entry ${i===state.stage?'current':i>state.stage?'locked':''}"><small>第 ${numeral(index+1)} 节 · ${i<state.stage?'已完成':i===state.stage?'当前主线':'尚未经历'}</small><h3>${q.title}</h3><p>${i<=state.stage?q.description:'前路故事，留待亲历。'}</p></div>`;}).join('')}</div>${clueIds.length?`<h3 class="journal-subheading">行路线索簿</h3><div class="clue-list">${clueIds.map(id=>`<p>${STORY.clues[id].entry}</p>`).join('')}</div>`:''}<h3 class="journal-subheading">行路闻记</h3><div class="journal-list">${state.log.slice(-12).reverse().map(line=>`<div class="journal-entry"><p>${escape(line)}</p></div>`).join('')}</div>`,'三章山水 · 记此一生');
    modalBody.querySelectorAll('[data-journal-chapter]').forEach(b=>b.onclick=()=>openJournal(Number(b.dataset.journalChapter)));
  }
  function openMap() {
    if(battle){showRetreat();return;}
    if(state.expedition.active){openTower();return;}
    const nodes=[['village',20,80],['marsh',50,80],['bamboo',80,80],['city',20,50],['ruins',50,50],['camp',80,50],['temple',20,20],['pass',50,20],['valley',80,20]];
    activePanel='map';showModal('江湖舆图',`<p class="modal-intro">九处山水，三章江湖。选择已开放的地点即可动身，主线进度不会因回访而重置。</p><div class="atlas-map"><svg viewBox="0 0 600 340" aria-hidden="true"><path d="M0 165q65-65 150-20t190-15 200 0 60 20M25 42l35-30 60 35 42-34 52 45M276 312l50-52 65 45 30-31 100 50" stroke="#77896a" stroke-width="2"/><path d="M230-10Q360 100 258 177T336 350" stroke="#537d7033" stroke-width="33"/><path d="M230-10Q360 100 258 177T336 350" stroke="#779c8855" stroke-width="2"/><path d="M108 258 300 231 492 258 492 85 300 68 108 85" stroke="#c0b77a" stroke-width="2" stroke-dasharray="5 8"/></svg><span class="atlas-caption">江湖舆图</span>${nodes.map(([id,x,y])=>{const loc=LOCATIONS[id],open=R.canTravel(state,id);return`<button class="atlas-node ${state.location===id?'current':''}" style="left:${x}%;top:${y}%" data-travel="${id}" ${open?'':'disabled'}>${icon(loc.safe?'mountain':'sword')}<span>${loc.name}<small>${state.location===id?'当前所在':open?loc.safe?'可休憩 · 可探访':'可探索 · 可历练':`第${numeral(QUESTS[loc.unlock].chapter+1)}章 · ${QUESTS[loc.unlock].title}`}</small></span></button>`;}).join('')}</div><div class="map-legend"><span>◇ 当前所在</span><span>··· 江湖路</span><span>灰色地点尚未开放</span></div>`,'千里江湖 · 始于足下');
    modalBody.querySelectorAll('[data-travel]').forEach(b=>b.onclick=()=>travel(b.dataset.travel));
  }
  function openHelp() {
    activePanel='help';showModal('游玩指南',`<div class="help-grid"><div><h3>三章江湖</h3><p>第一章：梧桐村、芦苇渡、青竹径，寻药护镖<br>第二章：平康城、废窑密道、黑风寨，查案突围<br>第三章：武当山、问心古道、落霞谷，问剑破阵<br>每次胜利后，右侧指引会接续下一目标</p></div><div><h3>行走与回合</h3><p><kbd>W A S D</kbd> / 方向键移动，<kbd>E</kbd>交互<br>战斗每回合先移动 2—5 格（视流派），再行动一次<br><kbd>1</kbd> 普攻 <kbd>2</kbd> 剑气 <kbd>3</kbd> 回血<br><kbd>4</kbd> 金疮药 <kbd>5</kbd> 防御 <kbd>6</kbd> 绝学<br><kbd>7</kbd> 破岳剑 <kbd>8</kbd> 毒刃 <kbd>9</kbd> 援救<br><kbd>0</kbd> 移步模式：避开人物遮挡选格<br>首领蓄力时，移动避开红格或破势打断</p></div><div><h3>修习与同行</h3><p><kbd>B</kbd> 行囊：装备兵刃、护具，服药<br><kbd>K</kbd> 修行：修习武学、选择流派与难度<br><kbd>P</kbd> 同伴：每次选择一位从旁援护<br><kbd>J</kbd> 江湖志 · <kbd>M</kbd> 九地舆图<br><kbd>T</kbd> 历练：九道悬赏、十二层剑冢<br>锻造兵刃与佩饰；侠义令来自悬赏及剑冢</p></div><div><h3>存档与恢复</h3><p>旧存档自动衔接当前主线，物品与境界保留<br>任务与探索自动保存，战斗在结束后保存<br>诊所与山泉免费恢复；剑冢内只有一次篝火<br>可导出存档备份，或导入另一处游玩的进度<br><kbd>Esc</kbd> 关闭面板 · 支持触屏</p></div></div><div class="save-tools"><button class="secondary-button" id="export-save">导出存档</button><button class="secondary-button" id="import-save" ${battle?'disabled':''}>导入存档</button><button class="secondary-button" id="recover-save" ${battle?'disabled':''}>恢复重游备份</button><input id="save-file" type="file" accept=".json,application/json" hidden></div><div class="new-game-row"><span>原创像素武侠同人游戏 · 三章九地 / 49 段主线<br>全本地画面与琴音，可离线游玩。</span><button class="secondary-button" id="new-game" ${battle?'disabled':''}>全新开局</button></div>`,'江湖路远 · 从容而行');
    $('recover-save').onclick=()=>{if(battle)return;let backup;try{backup=R.normalizeState(JSON.parse(localStorage.getItem('wandering-sword-before-replay')||localStorage.getItem('wandering-sword-before-new')));}catch{}if(!backup){toast('暂无重游前的备份。');return;}showModal('恢复江湖备份',`<p class="modal-intro">恢复至「${QUESTS[backup.stage].title}」，境界 ${backup.level} 重。当前进度可先通过指南导出。</p><div class="modal-actions"><button class="secondary-button" data-close>保留当前进度</button><button class="primary-button" id="confirm-recover">确认恢复</button></div>`);$('confirm-recover').onclick=()=>loadState(backup);};
    $('export-save').onclick=()=>{if(battle){toast('战斗结束后再导出当前进度。');return;}const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='逸剑风云决-江湖存档.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('存档已导出，可妥善保留。');};
    $('import-save').onclick=()=>$('save-file').click();$('save-file').onchange=async event=>{
      const file=event.target.files[0];if(!file)return;
      try{if(file.size>500000)throw new Error();const imported=R.normalizeState(JSON.parse((await file.text()).replace(/^\uFEFF/,'')));if(!imported)throw new Error();
        showModal('载入这段江湖',`<p class="modal-intro">存档进度：第${numeral(QUESTS[imported.stage].chapter+1)}章「${QUESTS[imported.stage].title}」<br>境界 ${numeral(imported.level)}重 · 铜钱 ${imported.gold}<br><br>确认后将以此存档继续。当前进度会留一份本地备份。</p><div class="modal-actions"><button class="secondary-button" data-close>保留当前进度</button><button class="primary-button" id="confirm-import">确认载入</button></div>`,'山水可续');
        $('confirm-import').onclick=()=>{try{localStorage.setItem('wandering-sword-before-import',JSON.stringify(state));}catch{}loadState(imported);toast('存档已载入，按当前指引继续即可。');};
      }catch{toast('这个文件不是有效的游戏存档，当前进度未改动。');}
    };
    $('new-game').onclick=()=>{if(battle)return;showModal('全新开局',`<p class="modal-intro">这会重置当前三章进度，从梧桐村的一封旧信重新开始。可以先在指南中导出存档。</p><div class="modal-actions"><button class="secondary-button" data-close>保留这段江湖</button><button class="primary-button" id="confirm-new">确认重新开始</button></div>`,'新的相逢');$('confirm-new').onclick=()=>{try{localStorage.setItem('wandering-sword-before-new',JSON.stringify(state));}catch{}loadState(R.createState());toast('一人，一剑。新的江湖，新的相逢。');};};
  }
  function loadState(next){generation++;fishing=false;battle=null;path=[];pending=null;FX.clear();state=next;if(!walkable(state.x,state.y))Object.assign(state,LOCATIONS[state.location].spawn);playerVisual={x:state.x,y:state.y};$('scene-message').hidden=true;closeModal();renderHud();save();}
  function openChapters(){
    showModal('三章行迹',`<p class="modal-intro">一封旧信串起的三段江湖。已经走过的地图可以回访，当前任务始终保留。</p><div class="chapter-cards">${STORY.chapters.map((c,i)=>{const finished=state.stage>c.to,started=state.stage>=c.from;return`<section class="chapter-card ${finished?'finished':started?'current':'locked'}"><span class="chapter-card-number">${['壹','贰','叁'][i]}</span><div><small>第${numeral(i+1)}章 · ${finished?'已完成':started?'正在经历':'尚未启程'}</small><h3>${c.name}</h3><p>${c.description}</p><button class="secondary-button" data-chapter-home="${c.home}" ${!started||battle?'disabled':''}>${finished?'回访故地':started?'继续当前主线':'完成前章后开启'}</button></div></section>`;}).join('')}</div>${state.stage===R.terminal?'<div class="modal-actions"><button class="primary-button" id="review-ending">重温结局</button></div>':''}`,'三章 · 九地 · 问剑长歌');
    modalBody.querySelectorAll('[data-chapter-home]').forEach(b=>b.onclick=()=>{const home=b.dataset.chapterHome;closeModal();if(home===STORY.chapters[QUESTS[state.stage].chapter].home&&state.stage!==R.terminal)guide();else travel(home);});if($('review-ending'))$('review-ending').onclick=showEnding;
  }
  function showChapterEnd(index){
    if(index===2){showEnding();return;}const chapter=STORY.chapters[index],next=STORY.chapters[index+1];
    showModal(`第${numeral(index+1)}章 · ${chapter.name} · 终`, `<div class="result-emblem">${index===0?'侠路初成':'风雨初定'}</div><p class="modal-intro" style="text-align:center">${index===0?'镖师已平安，故人的剑印终于有了下落。<br>陆青霜正在平康城等你，旧案才刚刚揭开。':'黑风寨已破，镖局旧案露出真相。<br>带着荐书登上武当山，去见清虚道长。'}<br><br>下一段旅程已经开启，当前进度已保存。</p><div class="next-chapter"><small>下一章</small><h3>第${numeral(index+2)}章 · ${next.name}</h3><p>${next.subtitle}</p></div><div class="modal-actions"><button class="secondary-button" data-close>稍作休整</button><button class="primary-button" id="chapter-continue">启程 · ${LOCATIONS[next.home].name}${icon('arrow')}</button></div>`,'青山之外 · 又是新程');
    $('chapter-continue').onclick=()=>{closeModal();guide();};
  }
  function showEnding() {
    const kind=state.rep>=8?'侠心照江湖':'一剑见山河';
    showModal('三章终 · 山水重逢',`<div class="result-emblem">${kind}</div><p class="modal-intro ending-story">旧案昭雪，玄鸦落败。父亲留下的账册与剑印，终于回到应在的人手中。<br>你从梧桐村出发，经平康城、黑风寨，问剑武当，再自落霞谷归来。<br><br>${state.choices.prisoner==='relief'?'获救的百姓记得你分给他们的赃银，沿途已有人替你留灯。':'陆家镖局把证物一一封存，当年被掩埋的真相终于有了见证。'}<br>${state.choices['valley-choice']==='save'?'林晚晴带着你救下的众人回到平康，把那一诺讲给后来者听。':'你和同伴带回了人质与完整供词，十六年的冤案就此落定。'}<br><br>此后拔剑，为的已不只是来处，更是眼前值得守护的人。</p><div class="result-rewards"><span>三章主线 · 全部完成</span><span>境界 ${numeral(state.level)}重</span><span>获胜 ${state.wins} 场</span><span>侠义 ${state.rep}</span></div><p class="modal-intro" style="text-align:center">九地均可回访；九道悬赏、十二层剑冢与章节重游已经开放。</p><div class="modal-actions"><button class="primary-button" data-close>山水未远，继续江湖${icon('arrow')}</button></div>`,'来处已明 · 前路由你');
  }
  function panel(name) {
    if(name==='world'){closeModal();return;}
    if(fishing){toast('收好鱼线，再翻阅行囊吧。');return;}
    const actions={bag:openBag,skills:openSkills,journal:openJournal,map:openMap,help:openHelp,party:openParty,chapters:openChapters,arena:openArena,forge:openForge,shop:openShop,tower:openTower};
    actions[name]?.();document.querySelectorAll('.nav-button').forEach(b=>b.classList.toggle('active',b.dataset.panel===name));
  }

  function startBattle(encounter='bandits',context={kind:'story'}) {
    if(battle)return;
    if(context.kind==='tower'){
      const ex=state.expedition;if(!ex.active||ex.choicePending||context.floor!==ex.floor||encounter!==STORY.floors[ex.floor-1])return;
    }else if(state.expedition.active){openTower();return;}
    if(context.kind==='contract'){
      const c=STORY.contracts.find(v=>v.id===context.id);if(!c||state.contracts.includes(c.id)||c.need&&!state.contracts.includes(c.need)||state.stage<=STORY.index('bamboo-fight'))return;
    }
    closeModal();path=[];pending=null;FX.clear();clearToast();save();battle=R.makeBattle(state,encounter,context);generation++;
    note(`「${battle.name}」开始。${R.battleObjective(battle)}。`);renderHud();FX.announce('拔剑迎战','先移步，再出招；留意敌方蓄力','equip',1700);playFeedback('battleStart');
  }
  function nearestEnemy() {return battle&&R.living(battle).sort((a,b)=>R.distance(a,battle.player)-R.distance(b,battle.player))[0];}
  function canAttackNearest() {const e=nearestEnemy();return e&&R.distance(e,battle.player)<=R.SKILLS[battle.selected].range;}
  function battleMove(x,y) {
    const b=battle;if(!b||!R.moveInBattle(b,x,y))return false;
    if(b.phase==='won')finishBattle(true);else renderHud();return true;
  }
  function battleGuide() {
    const b=battle;if(!b||b.phase!=='player')return;
    const danger=[...R.living(b).flatMap(e=>e.charge||[]),...b.fire],unsafe=p=>danger.some(c=>R.distance(c,p)===0);
    const goal=b.goal==='escape'?b.exit:b.goal==='capture'?b.capture:null;
    if(!b.moved&&(unsafe(b.player)||goal&&R.distance(goal,b.player)>0||!canAttackNearest()&&!goal)){
      const options=[];
      for(let x=0;x<b.width;x++)for(let y=0;y<b.height;y++){
        const point={x,y},route=R.battlePath(b,b.player,point);if(route?.length&&route.length<=b.moveLimit)options.push({...point,d:goal?R.distance(point,goal):Math.min(...R.living(b).map(e=>R.distance(e,point))),length:route.length,unsafe:unsafe(point)});
      }
      options.sort((a,c)=>Number(a.unsafe)-Number(c.unsafe)||a.d-c.d||a.length-c.length);
      if(options.length&&battleMove(options[0].x,options[0].y))return;
    }
    if(canAttackNearest()){perform(b.selected,nearestEnemy().id);return;}
    perform('guard');
  }
  function selectSkill(id) {
    if(battle){
      if(battle.phase!=='player')return;
      if(id==='move'){if(!battle.moved){battle.selectingMove=true;renderHud();toast('移步模式：点击亮起的空格，人物不会遮挡选格。');}return;}
      if(['strike','sweep','ultimate','pierce','poison'].includes(id)){
        if(!state.skills[id]){toast('推进主线后可习得这门招式。');return;}
        if(battle.cooldowns[id]>0){toast(`还需调息 ${battle.cooldowns[id]} 回合。`);return;}
        if(state.mp<R.SKILLS[id].cost){toast('真气不足，可服养气丹或凝神守势。');return;}
        battle.selected=id;battle.selectingMove=false;renderHud();toast(`${R.SKILLS[id].name}：点击 ${R.SKILLS[id].range} 格内的敌人。`);
      }else perform(id);
    }else{
      if(state.expedition.active&&['potion','heal'].includes(id)){toast('剑冢层间只能使用一次篝火休整，伤药与内功请留在交锋中使用。');return;}
      if(id==='potion'){const before=statSnapshot(),result=R.useItem(state,'potion');if(result.ok){note(result.message);renderHud();save();itemFeedback('potion',before,result);}else rejectedAction(result.message,document.querySelector('[data-skill="potion"]'));}
      else if(id==='heal'){
        if(state.hp===R.maxHp(state)){rejectedAction('气血充盈，心神安宁。',document.querySelector('[data-skill="heal"]'));return;}
        if(state.mp<R.SKILLS.heal.cost){rejectedAction('真气不足，可找白芷诊治或服用养气丹。',document.querySelector('[data-skill="heal"]'));return;}
        const before=statSnapshot();state.hp=Math.min(R.maxHp(state),state.hp+R.healing(state));state.mp-=R.SKILLS.heal.cost;
        note('凝神归元，恢复 '+(state.hp-before.hp)+' 气血。');renderHud();save();recoveryFeedback('heal',before);
      }else if(id==='guard')openHelp();else openSkills();
    }
  }
  function perform(skill,enemyId) {
    const b=battle;if(!b||b.finishing)return;const before=statSnapshot(),result=R.cast(state,b,skill,enemyId);
    if(!result.ok){rejectedAction(result.message,document.querySelector('[data-skill="'+skill+'"]'));return;}clearToast();note(result.message);b.log=result.message;
    if(result.targets){
      const from=battleIso(b.player.x,b.player.y),tone=skill==='poison'?'poison':skill==='ultimate'?'qi':'hit';
      for(const target of result.targets){
        const point=battleIso(target.x,target.y),defeated=b.enemies.find(e=>e.id===target.id)?.hp===0;
        FX.hit(point,{from,damage:target.damage,tone,kind:skill==='strike'||skill==='pierce'?'slash':skill,label:target.broken?'破势':defeated?'击败':''});
        FX.react(target.id,'hurt',from,point);FX.react('hero','strike',from,point);
        if(target.broken)FX.ring(point,'equip');
      }
      const total=result.targets.reduce((sum,t)=>sum+t.damage,0);
      FX.announce(R.SKILLS[skill].name,'命中 '+result.targets.length+' 人 · 伤害 '+total+(result.targets.some(t=>t.broken)?' · 架势击破':''),tone);
      playFeedback(skill,{broken:result.targets.some(t=>t.broken),pan:(result.targets[0].x-result.targets[0].y)/12});
    }else if(skill==='guard'){
      const point=heroPoint(),qi=state.mp-before.mp;FX.ring(point,'guard');FX.floating(point,'守势','guard');
      if(qi>0)FX.floating(point,'真气 +'+qi,'qi');
      FX.announce('凝神守势','本回合减伤 60%'+(qi>0?' · 真气 +'+qi:''),'guard');playFeedback('guard');
    }else recoveryFeedback(skill,before,result,true);
    const support=R.support(state,b);
    if(support){
      note(support.message);b.log=support.message;const target=support.target||b.player,point=battleIso(target.x,target.y);
      if(support.damage)FX.hit(point,{from:battleIso(b.player.x,b.player.y),damage:support.damage,tone:'qi',kind:'arrow',label:'援护'});
      else if(support.value>0){FX.ring(point,'heal');FX.floating(point,'援护 +'+support.value,'heal');}
    }
    const feedbackTone=skill==='qi'?'qi':['heal','aid'].includes(skill)||R.ITEMS[skill]?.category==='medicine'?'heal':skill==='poison'?'poison':'equip';
    renderHud();pulseVitals(before);FX.pulse(document.querySelector('[data-skill="'+skill+'"]'),feedbackTone);
    if(b.phase==='won'){finishBattle(true);return;}if(b.phase==='lost'){finishBattle(false);return;}enemySequence(b,generation);
  }
  async function enemySequence(b,token) {
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    await wait(260);
    for(const enemy of R.living(b)){
      while(modal.open&&battle===b&&token===generation)await wait(120);
      if(battle!==b||token!==generation)return;
      const before=statSnapshot(),actors=actorSnapshot(b),result=R.enemyTurn(state,b,enemy.id);
      if(result){note(result.message);b.log=result.message;renderHud();enemyFeedback(b,actors,enemy,result);pulseVitals(before);}
      if(b.phase==='won'||b.phase==='lost'){finishBattle(b.phase==='won');return;}
      await wait(300);
    }
    if(battle!==b||token!==generation)return;
    const beforeLog=b.log,before=statSnapshot();R.nextRound(state,b);if(b.log!==beforeLog)note(b.log);
    const lost=before.hp-state.hp,allyLost=b.ally?before.allyHp-b.ally.hp:0;
    if(lost>0){const point=heroPoint(),tone=before.poison?'poison':'hurt';FX.ring(point,tone);FX.floating(point,'损伤 −'+lost,tone);FX.pulse($('stage-shell'),'hurt');playFeedback('hurt');}
    if(allyLost>0){const point=battleIso(b.ally.x,b.ally.y);FX.ring(point,'poison');FX.floating(point,'毒发 −'+allyLost,'poison');}
    pulseVitals(before);
    if(b.phase==='won'||b.phase==='lost'){finishBattle(b.phase==='won');return;}
    if(b.cooldowns[b.selected]>0||state.mp<R.SKILLS[b.selected].cost)b.selected='strike';renderHud();FX.pulse($('battle-banner'),'qi');
  }
  function finishBattle(won) {
    const b=battle;if(!b||b.finishing)return;b.finishing=true;b.phase=won?'won':'lost';const token=generation;
    renderHud();FX.announce(won?'胜负已定':'暂且收剑',won?'此战有所得，稍后结算':'胜败寻常事，来日再战',won?'equip':'warn',800);
    // Leave the final impact on screen before opening the result, once per battle.
    setTimeout(()=>{if(battle===b&&generation===token)settleBattle(won);},reduceMotion?120:520);
  }
  function settleBattle(won) {
    const b=battle;if(!b)return;const info=STORY.encounters[b.encounter],q=QUESTS[state.stage],context=b.context;
    generation++;battle=null;FX.clear();path=[];pending=null;playFeedback(won?'win':'lose');
    if(won){
      state.wins++;
      if(context.kind==='tower'||context.kind==='contract'){
        const result=context.kind==='tower'?R.advanceExpedition(state):R.finishContract(state,context.id);
        if(result.ok){
          const tower=context.kind==='tower';note(tower?`剑冢第 ${result.floor} 层通过。${rewardText(result.rewards)}。`:`完成悬赏「${result.contract.name}」。${rewardText(result.rewards)}。`);
          showModal(`${b.name} · 胜`,`<div class="result-emblem">${tower?result.finished?'问剑十二层':'剑意再进':'侠名有声'}</div><p class="modal-intro" style="text-align:center">${b.reason}<br>${tower?result.finished?'你已登顶十二层剑冢！最高记录与本次报酬已保存。':`已通过第 ${result.floor} 层。气血 ${state.hp}/${R.maxHp(state)}，真气 ${state.mp}/${R.maxMp(state)}。<br>接下来选择一项祝福，准备下一场交锋。`:`悬赏报酬已收入行囊。${state.contracts.length===9?'九道悬赏全部完成！':'下一道悬赏已经开放。'}`}<br>主线进度保留。</p><div class="result-rewards">${rewardText(result.rewards).split(' · ').map(t=>`<span>${t}</span>`).join('')}</div><div class="modal-actions"><button class="secondary-button" data-close>暂且收剑</button><button class="primary-button" id="battle-return">${tower&&!result.finished?'选择祝福 · 继续剑冢':'返回江湖历练'}${icon('arrow')}</button></div>`,'此战有所得 · 前路有去处');
          $('battle-return').onclick=()=>tower&&!result.finished?openTower():openArena();
        }
        renderHud();save();return;
      }
      let rewards={},result;
      if(b.practice){rewards=b.encounter==='arena'?{xp:50+state.level*3,gold:40+state.level*3}:{xp:15,gold:10};R.reward(state,{...rewards,heal:true});}
      else if(R.encounterFor(state,q)===b.encounter){rewards=q.rewards;result=R.completeQuest(state,q.id);}
      else if(info.objective&&q.targets?.includes(info.objective)&&!(state.progress[q.id]||[]).includes(info.objective)){
        rewards=info.reward||{};R.reward(state,rewards);result=R.recordObjective(state,info.objective);
        if(result.ok&&!result.partial)rewards={xp:(rewards.xp||0)+(q.rewards.xp||0),gold:(rewards.gold||0)+(q.rewards.gold||0),items:q.rewards.items};
      }
      if(!state.cleared.includes(b.encounter))state.cleared.push(b.encounter);if(result)completed(result);
      const next=QUESTS[state.stage],target=next.targets?.find(id=>!(state.progress[next.id]||[]).includes(id)),nextText=target?(SITES[next.location].find(p=>p.id===target)?.name||next.objective):next.objective;
      note(`「${b.name}」获胜。${rewardText(rewards)}。下一步：${nextText}。`);
      showModal(`${b.name} · 胜`, `<div class="result-emblem">${b.encounter==='final'?'一剑定风雷':b.practice?'剑意渐明':'风停剑收'}</div><p class="modal-intro" style="text-align:center">${b.reason}<br>${b.practice?'切磋结束，气血与真气已恢复，主线进度保留。':'当前任务已更新，战利品已收入行囊。'}</p><div class="result-rewards">${rewardText(rewards).split(' · ').filter(Boolean).map(text=>`<span>${text}</span>`).join('')}</div><div class="next-chapter"><small>接下来 · ${LOCATIONS[next.location].name}</small><h3>${next.title}</h3><p>${nextText}</p></div><div class="modal-actions"><button class="secondary-button" data-panel="bag">整理装备</button><button class="secondary-button" data-close>稍作停留</button><button class="primary-button" id="battle-return">继续主线${icon('arrow')}</button></div>`,'此战有所得 · 前路有去处');
      $('battle-return').onclick=()=>{closeModal();guide();};
    }else{
      if(context.kind==='tower')R.abandonExpedition(state);
      state.hp=R.maxHp(state);state.mp=R.maxMp(state);
      if(!b.practice&&!b.training){state.location=STORY.chapters[q.chapter].home;Object.assign(state,LOCATIONS[state.location].spawn);playerVisual={x:state.x,y:state.y};}
      note(`「${b.name}」暂败。${b.reason}气血真气已恢复，任务进度保留。`);
      showModal('胜败寻常事',`<div class="result-emblem">来日再战</div><p class="modal-intro" style="text-align:center">${b.reason}<br>任务、装备与剩余物品保留，气血与真气已恢复。<br>${context.kind==='tower'?`本次剑冢已结束，最高 ${state.expedition.best} 层记录保留。`:'可调整流派、招式与护身佩饰再战。'}<br><br>${info.goal==='escape'?'突围的目标是走到金色出口，击败追兵不是必需的。':info.ally?'护送时站到追兵前面，用援救照顾友方。':info.goal==='capture'?'走到金色哨台并连续站稳，目标比全歼更重要。':'先压制药师与阵柱，看到蓄力后移动或用破岳剑打断。'}</p><div class="modal-actions"><button class="secondary-button" data-panel="skills">调整修行</button><button class="secondary-button" data-close>先行休整</button><button class="primary-button" id="retry-battle">${context.kind==='tower'?'重整剑冢':'再次挑战'}${icon('arrow')}</button></div>`,'留得青山 · 不负少年');
      $('retry-battle').onclick=()=>{closeModal();if(context.kind==='tower')openTower();else if(context.kind==='contract'||b.practice)openEncounter(b.encounter,context);else guide();};
    }
    renderHud();save();
  }
  function showRetreat() {
    if(!battle||battle.finishing)return;const b=battle,home=STORY.chapters[QUESTS[state.stage].chapter].home;
    showModal('暂避锋芒',`<p class="modal-intro">${b.context.kind==='tower'?'退出会结束本次剑冢挑战，已经获得的报酬与最高层记录保留。':`退回${LOCATIONS[home].name}，任务进度保留。`}消耗过的药品与真气不会返还，对手将在下次交锋时恢复。</p><div class="modal-actions"><button class="secondary-button" data-close>继续迎战</button><button class="primary-button" id="retreat">收剑退去</button></div>`,'进退皆是江湖');
    $('retreat').onclick=()=>{if(battle!==b)return;generation++;battle=null;FX.clear();if(b.context.kind==='tower')R.abandonExpedition(state);closeModal();travel(home);note(`你收剑退回${LOCATIONS[home].name}，决定整顿后再战。`,true);renderHud();save();};
  }

  // Pixel scenery is painted once; the animation loop only draws people, water glints and leaves.
  function poly(g,points,color,stroke) {
    g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(Math.round(x),Math.round(y)):g.moveTo(Math.round(x),Math.round(y)));g.closePath();
    if(color){g.fillStyle=color;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=1;g.stroke();}
  }
  function rect(g,x,y,w,h,color){g.fillStyle=color;g.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
  function ellipse(g,x,y,rx,ry,color){g.fillStyle=color;g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fill();}
  function tile(g,x,y,color,stroke,projection=iso,tw=24,th=12){const p=projection(x,y);poly(g,[[p.x,p.y-th],[p.x+tw,p.y],[p.x,p.y+th],[p.x-tw,p.y]],color,stroke);}
  function grass(g,x,y,scale=1) {
    const p=iso(x,y),tone=['#718357','#86955e','#566f46','#a0a370'][Math.floor(hash(x+7,y)*4)];
    for(let i=0;i<3;i++){let px=p.x+(hash(x*7+i,y)-.5)*28,py=p.y+(hash(x,y*7+i)-.5)*12;rect(g,px,py,2*scale,4*scale,tone);rect(g,px-2*scale,py+2*scale,2*scale,2*scale,tone);}
  }
  function pine(g,x,y,size=1,tone=0) {
    const p=iso(x,y),px=p.x,py=p.y,s=size;
    ellipse(g,px+7*s,py+4*s,22*s,10*s,'#263d303f');
    rect(g,px-3*s,py-51*s,6*s,53*s,'#555343');rect(g,px-1*s,py-44*s,3*s,44*s,'#75634b');
    const colors=tone?['#253e32','#365641','#4b6a47','#647d4f']:['#304e3c','#446743','#5f7c4b','#7e9258'];
    for(let layer=0;layer<4;layer++){
      const top=py-(103-layer*16)*s,width=(17+layer*8)*s,base=top+(35+layer*3)*s;
      poly(g,[[px,top],[px+8*s,top+13*s],[px+5*s,top+13*s],[px+width*.75,base-12*s],[px+width*.5,base-11*s],[px+width,base],[px+width*.5,base+1*s],[px+width*.6,base+5*s],[px+8*s,base+3*s],[px-4*s,base+7*s],[px-width,base+2*s],[px-width*.65,base-7*s],[px-width*.8,base-7*s],[px-7*s,top+15*s],[px-10*s,top+15*s]],colors[0]);
      poly(g,[[px,top+3*s],[px-9*s,top+21*s],[px-5*s,top+21*s],[px-width+5*s,base],[px-6*s,base-2*s],[px-2*s,base+3*s],[px+6*s,base-3*s],[px+width*.65,base-1*s],[px+9*s,top+22*s],[px+5*s,top+23*s]],colors[1]);
      poly(g,[[px,top+6*s],[px-5*s,top+20*s],[px-2*s,top+20*s],[px-width*.55,base-3*s],[px-5*s,base-6*s],[px,base-1*s],[px+2*s,top+21*s]],colors[2]);
      rect(g,px-7*s,base-5*s,7*s,2*s,colors[3]);
    }
  }
  function broadTree(g,x,y,size=1,autumn=false) {
    const p=iso(x,y),s=size;
    ellipse(g,p.x+8*s,p.y+2*s,30*s,12*s,'#26372b4d');
    poly(g,[[p.x-5*s,p.y],[p.x+5*s,p.y],[p.x+3*s,p.y-38*s],[p.x+20*s,p.y-69*s],[p.x+14*s,p.y-71*s],[p.x,p.y-48*s],[p.x-13*s,p.y-73*s],[p.x-17*s,p.y-68*s],[p.x-4*s,p.y-37*s]],'#605846');
    rect(g,p.x-2*s,p.y-42*s,3*s,40*s,'#8f7957');
    const colors=autumn==='red'?['#704d42','#a3614c','#c38058','#dfa66b']:autumn?['#86674c','#aa8257','#bf9d68','#ddbd86']:['#435940','#627347','#839058','#a5a368'];
    for(let i=0;i<28;i++){
      const a=hash(i+x,y)*Math.PI*2,r=hash(i+y,x)*37*s,px=p.x+Math.cos(a)*r,py=p.y-70*s+Math.sin(a)*r*.67;
      const size=(10+hash(i,x+y)*14)*s;
      rect(g,px-size/2,py-size/2,size,size*.75,colors[Math.floor(hash(i+91,x)*4)]);
      rect(g,px-size*.7,py-size*.15,size*1.1,size*.32,colors[Math.min(3,Math.floor(hash(i+91,x)*4)+1)]);
    }
  }
  function bamboo(g,x,y,size=1) {
    const p=iso(x,y),s=size;
    for(let j=-1;j<=1;j++){
      const px=p.x+j*11*s,h=(78+hash(x+j,y)*45)*s;
      rect(g,px,p.y-h,4*s,h,'#496743');rect(g,px+2*s,p.y-h,2*s,h,'#8a9c63');
      for(let q=1;q<6;q++){
        const py=p.y-q*h/6;rect(g,px-1*s,py,6*s,2*s,'#b0b27d');
        if(q<2)continue;
        const dir=(q+j)%2?1:-1;
        poly(g,[[px,py],[px+dir*25*s,py-13*s],[px+dir*12*s,py-9*s],[px+dir*27*s,py-2*s],[px+dir*13*s,py-4*s],[px+dir*17*s,py+5*s],[px,py+1*s]],q%2?'#637d49':'#839358');
        poly(g,[[px+dir*11*s,py-8*s],[px+dir*21*s,py-22*s],[px+dir*17*s,py-9*s]],'#a0a367');
      }
    }
  }
  function stone(g,x,y,size=1) {
    const p=iso(x,y),s=size;
    ellipse(g,p.x+2,p.y+2,17*s,8*s,'#30442f44');
    poly(g,[[p.x-17*s,p.y],[p.x-13*s,p.y-13*s],[p.x-4*s,p.y-20*s],[p.x+11*s,p.y-15*s],[p.x+18*s,p.y-3*s],[p.x+10*s,p.y+4*s],[p.x-8*s,p.y+6*s]],'#727c68');
    poly(g,[[p.x-17*s,p.y],[p.x-13*s,p.y-13*s],[p.x-4*s,p.y-20*s],[p.x+11*s,p.y-15*s],[p.x+4*s,p.y-3*s]],'#9b9d7d');
    poly(g,[[p.x-11*s,p.y-12*s],[p.x-3*s,p.y-17*s],[p.x+9*s,p.y-14*s],[p.x+1*s,p.y-8*s]],'#b2ac88');
    rect(g,p.x-8*s,p.y,8*s,3*s,'#7d885c');
  }
  function house(g,x,y,kind='home') {
    const p=iso(x,y),px=p.x,py=p.y,a=['inn','hall','fort'].includes(kind)?91:77,b=39,h=kind==='hall'?90:kind==='inn'?79:67;
    const roof=kind==='doctor'?['#656d57','#7f886a','#a1a084']:kind==='fort'?['#484b41','#626353','#88846a']:kind==='hall'?['#4d665e','#6c8677','#9ca990']:['#435b52','#5a7564','#7e9280'];
    ellipse(g,px+15,py+9,a+15,33,'#283a2d55');
    poly(g,[[px-a-8,py+4],[px,py+b+5],[px+a+8,py+2],[px+4,py-b-4]],'#a8a183');
    poly(g,[[px-a,py],[px,py+b],[px,py+b-h],[px-a,py-h]],'#ab9a72');
    poly(g,[[px,py+b],[px+a,py],[px+a,py-h],[px,py+b-h]],'#cec19a');
    poly(g,[[px-a,py],[px,py+b],[px,py+b-11],[px-a,py-11]],'#737b62');
    poly(g,[[px,py+b],[px+a,py],[px+a,py-11],[px,py+b-11]],'#91967b');
    for(let j=0;j<4;j++){
      const xx=px-a+j*(a/3),yy=py+(xx-(px-a))/a*b;
      rect(g,xx,yy-h,4,h-8,'#6a6248');
    }
    poly(g,[[px+18,py+b-15],[px+45,py+b-29],[px+45,py+b-h+10],[px+18,py+b-h+23]],'#4b4d39');
    poly(g,[[px+20,py+b-16],[px+32,py+b-22],[px+32,py+b-h+18],[px+20,py+b-h+24]],'#706346');
    rect(g,px+30,py+b-32,2,3,'#bfaf74');
    poly(g,[[px+54,py+b-h+7],[px+74,py+b-h-3],[px+74,py+b-h+20],[px+54,py+b-h+30]],'#526858');
    for(let j=0;j<3;j++)poly(g,[[px+58+j*6,py+b-h+8-j*3],[px+60+j*6,py+b-h+7-j*3],[px+60+j*6,py+b-h+23-j*3],[px+58+j*6,py+b-h+24-j*3]],'#b5aa7d');
    poly(g,[[px-a+17,py-h+21],[px-a+42,py-h+34],[px-a+42,py-h+52],[px-a+17,py-h+39]],'#58634c');
    for(let j=0;j<4;j++)rect(g,px-a+18+j*7,py-h+22+j*3,2,16,'#b8ad7a');
    // Roof ridge follows the village's diagonal, with raised tiled eaves.
    const ridgeA=[px-17,py-h-b-43],ridgeB=[px+a+7,py-h-47],eaveA=[px-a-18,py-h+6],eaveB=[px+12,py+b-h+7],end=[px+a+20,py-h+1];
    poly(g,[eaveA,ridgeA,ridgeB,eaveB],roof[0]);
    poly(g,[ridgeB,[px+a+13,py-h-29],end,eaveB],roof[1]);
    for(let i=0;i<9;i++){
      const t=i/9,ax=eaveA[0]+(ridgeA[0]-eaveA[0])*t,ay=eaveA[1]+(ridgeA[1]-eaveA[1])*t,bx=eaveB[0]+(ridgeB[0]-eaveB[0])*t,by=eaveB[1]+(ridgeB[1]-eaveB[1])*t;
      g.strokeStyle=i%2?roof[1]:roof[2];g.lineWidth=2;g.beginPath();g.moveTo(ax,ay);g.lineTo(bx,by);g.stroke();
      for(let j=1;j<13;j++){
        const u=j/13;rect(g,ax+(bx-ax)*u,ay+(by-ay)*u,2,4,roof[0]);
      }
    }
    g.strokeStyle=roof[2];g.lineWidth=5;g.beginPath();g.moveTo(ridgeA[0]-3,ridgeA[1]-5);g.lineTo(...ridgeA);g.lineTo(...ridgeB);g.lineTo(ridgeB[0]+7,ridgeB[1]-5);g.stroke();
    g.strokeStyle='#344c40';g.lineWidth=5;g.beginPath();g.moveTo(eaveA[0]-7,eaveA[1]-7);g.lineTo(...eaveA);g.lineTo(...eaveB);g.lineTo(...end);g.lineTo(end[0]+4,end[1]-6);g.stroke();
    if(kind==='inn'){
      rect(g,px+46,py-59,19,32,'#5b533c');rect(g,px+49,py-57,13,27,'#c9ba8b');g.fillStyle='#635837';g.font='11px serif';g.textAlign='center';g.fillText('客',px+55,py-45);g.fillText('栈',px+55,py-33);
      lantern(g,px+8,py-18);lantern(g,px+81,py-51);
    }else if(kind==='doctor'){
      rect(g,px+41,py-51,18,26,'#aba776');g.font='16px serif';g.textAlign='center';g.fillStyle='#475841';g.fillText('药',px+50,py-32);
      for(let i=0;i<3;i++){ellipse(g,px-53+i*18,py+11+i*4,9,5,'#786b46');ellipse(g,px-53+i*18,py+9+i*4,7,3,'#a6a471');}
    }else if(kind==='hall'||kind==='fort'){
      rect(g,px+8,py-h+22,44,20,'#414e3d');g.font='13px serif';g.textAlign='center';g.fillStyle='#dbc895';g.fillText(kind==='hall'?'武当':'黑风',px+30,py-h+37);
      lantern(g,px+9,py-19);lantern(g,px+82,py-52);
    }else lantern(g,px+13,py-12);
    for(let i=0;i<3;i++)poly(g,[[px+8-i*2,py+b+1+i*4],[px+46+i*2,py+b-18+i*4],[px+46+i*2,py+b-14+i*4],[px+8-i*2,py+b+5+i*4]],i%2?'#b6ac8a':'#93967b');
  }
  function lantern(g,x,y) {
    rect(g,x,y-11,2,10,'#454d35');rect(g,x-4,y-3,10,14,'#a26e42');rect(g,x-2,y-3,6,14,'#d0a465');rect(g,x-4,y-4,10,2,'#66603e');rect(g,x-3,y+10,8,2,'#6a623e');rect(g,x,y+12,2,6,'#b18c48');
  }
  function stall(g,x,y) {
    const p=iso(x,y);
    poly(g,[[p.x-37,p.y-5],[p.x+4,p.y+16],[p.x+47,p.y-6],[p.x+5,p.y-26]],'#a09367');
    rect(g,p.x-34,p.y-63,3,61,'#6b6043');rect(g,p.x+40,p.y-68,3,64,'#6b6043');rect(g,p.x+5,p.y-39,3,50,'#89784f');
    poly(g,[[p.x-45,p.y-60],[p.x-9,p.y-80],[p.x+54,p.y-50],[p.x+14,p.y-29]],'#9e9170');
    for(let i=0;i<6;i++)poly(g,[[p.x-43+i*14,p.y-59+i*6],[p.x-35+i*14,p.y-63+i*6],[p.x-1+i*14,p.y-78+i*6],[p.x-9+i*14,p.y-74+i*6]],i%2?'#b6a581':'#697c62');
    poly(g,[[p.x-45,p.y-60],[p.x+14,p.y-29],[p.x+14,p.y-21],[p.x-45,p.y-52]],'#7d8364');
    for(let i=0;i<5;i++){rect(g,p.x-25+i*12,p.y-13+Math.abs(i-2)*4,8,8,['#baa968','#849568','#a47757'][i%3]);}
    ellipse(g,p.x+44,p.y+12,8,5,'#746548');rect(g,p.x+37,p.y+1,14,11,'#84764f');ellipse(g,p.x+44,p.y+1,7,4,'#a09562');
  }
  function fence(g,x,y,length=4,direction='x') {
    let prev=null;
    for(let i=0;i<=length;i++){
      const p=iso(x+(direction==='x'?i:0),y+(direction==='y'?i:0));
      if(prev){for(const dy of[-8,-16]){g.strokeStyle='#8e8960';g.lineWidth=3;g.beginPath();g.moveTo(prev.x,prev.y+dy);g.lineTo(p.x,p.y+dy);g.stroke();g.strokeStyle='#bbb183';g.lineWidth=1;g.stroke();}}
      rect(g,p.x-2,p.y-22,4,23,'#7c7952');rect(g,p.x-1,p.y-22,2,20,'#b5aa78');prev=p;
    }
  }
  function flower(g,x,y,color='#d9c080') {const p=iso(x,y);rect(g,p.x,p.y-6,2,7,'#61754b');rect(g,p.x-2,p.y-9,6,4,color);rect(g,p.x,p.y-11,2,8,color);rect(g,p.x,p.y-8,2,2,'#8e8850');}
  function createMap(location) {
    const layer=document.createElement('canvas');layer.width=W;layer.height=H;
    const g=layer.getContext('2d');g.imageSmoothingEnabled=false;
    const village=location==='village',blocked=new Set(),objects=[];
    const palettes={
      village:{ground:['#83925f','#899763','#8b9764','#8e9968','#7c8e5d'],sky:['#6e8e79','#6b8e79','#365e51'],road:['#b9b084','#c0b68c','#bdb38a','#c5b890']},
      bamboo:{ground:['#788d5f','#809367','#7a8c60','#859566','#71855a'],sky:['#658872','#5e826a','#345b4c'],road:['#aaa27a','#b3ab80','#a9a079','#b8b187']},
      city:{ground:['#89907b','#969783','#8e947e','#a19e87'],sky:['#b4a486','#8e967c','#466558'],road:['#b5b099','#beb7a0','#a8a893','#c4bca5']},
      camp:{ground:['#7c7a60','#78795f','#858169','#8e866a'],sky:['#697b7a','#576e65','#354f45'],road:['#a49a76','#aea180','#a49a7b','#b2a785']},
      temple:{ground:['#8e9d7d','#8a9b7c','#98a387','#9ca88a'],sky:['#b0c4b0','#8fada0','#5a7f72'],road:['#b8bdab','#c6c9b7','#bdc4b0','#cdd0ba']},
      marsh:{ground:['#859777','#94a282','#7f9679','#a1ab87'],sky:['#acc1a4','#8aa58e','#466e62'],road:['#bdb087','#c6bc93','#b3aa7e','#c6b891']},
      ruins:{ground:['#747b73','#818377','#6d756c','#8a8b7b'],sky:['#758786','#556f69','#2c4a44'],road:['#aaa68d','#aaa88f','#939d87','#b6b39b']},
      pass:{ground:['#a0b59d','#b0c0a8','#97ae9b','#b4c0aa'],sky:['#c6d3c2','#a6bdb1','#6c9183'],road:['#c2c5ad','#d1d1b7','#c7cbb4','#dad9c2']},
      valley:{ground:['#98805e','#9b8969','#a28a65','#8d7c5f'],sky:['#c1a082','#a89078','#546956'],road:['#b5a17d','#bea888','#bca284','#c4b08e']}
    };
    const palette=palettes[location],colors=palette.ground;
    const isRoad=(x,y)=>village?((x>=10&&x<=12&&y>=7)||(y>=12&&y<=14&&x>=4)||(x>=13&&x<=15&&y>=7&&y<=13)):
      location==='bamboo'?(Math.abs(x-(11+Math.round(Math.sin(y*.3)*2)))<=1||(y>=16&&y<=17&&x>=5&&x<=11)):
      location==='city'?((x>=10&&x<=13)||(y>=12&&y<=15&&x>=4&&x<=21)||(y>=8&&y<=10&&x>=6&&x<=18)):
      location==='temple'?((x>=10&&x<=14&&y>=6)||(y>=11&&y<=14&&x>=5&&x<=20)||(y>=17&&y<=19&&x>=7&&x<=18)):
      location==='camp'?((x>=10&&x<=14)||(y>=13&&y<=15&&x>=5&&x<=20)||(y>=7&&y<=9&&x>=6&&x<=18)):
      location==='marsh'?((x>=10&&x<=12)||(y>=14&&y<=16&&x>=5&&x<=19)||(y>=9&&y<=11&&x>=6&&x<=18)):
      location==='ruins'?((x>=11&&x<=13)||(y>=12&&y<=14&&x>=5&&x<=19)||(y>=8&&y<=10&&x>=6&&x<=18)):
      location==='pass'?((x>=10&&x<=14)||(y>=11&&y<=14&&x>=5&&x<=19)):
      (Math.abs(x-(12+Math.round(Math.sin(y*.38)*3)))<=2||(y>=11&&y<=13&&x>=6&&x<=19));
    const sky=g.createLinearGradient(0,0,0,H);sky.addColorStop(0,palette.sky[0]);sky.addColorStop(.4,palette.sky[1]);sky.addColorStop(1,palette.sky[2]);g.fillStyle=sky;g.fillRect(0,0,W,H);
    for(let layer=0;layer<4;layer++){
      const points=[[-20,340]];
      for(let x=-20;x<W+80;x+=50)points.push([x,70+layer*39-Math.sin(x*.008+layer)*28-hash(x,layer)*50]);
      points.push([W+60,360]);poly(g,points,location==='valley'?['#baa082','#ab9072','#917e60','#786f53'][layer]:location==='camp'?['#79857a','#6b7b6a','#5c6a57','#4b5f4c'][layer]:['#94ac91','#799781','#64876e','#4d7059'][layer]);
    }
    for(let i=0;i<650;i++){
      const x=hash(i,4)*W,y=hash(i,8)*H;
      if(y>240)rect(g,x,y,6+hash(i,9)*27,1,['#71988840','#a7bb9740','#456f6055'][i%3]);
    }
    // Paint the landscape separately so wide views can keep the island in proportion.
    const backdrop=document.createElement('canvas');backdrop.width=W;backdrop.height=H;
    backdrop.getContext('2d').drawImage(layer,0,0);g.clearRect(0,0,W,H);
    // A shallow stone escarpment gives the island its miniature, raised silhouette.
    const left=iso(0,24),bottom=iso(24,24),right=iso(24,0);
    poly(g,[[left.x-24,left.y],[bottom.x,bottom.y+12],[bottom.x,bottom.y+55],[left.x-24,left.y+40]],'#586451');
    poly(g,[[bottom.x,bottom.y+12],[right.x+24,right.y],[right.x+24,right.y+36],[bottom.x,bottom.y+55]],'#6f7860');
    for(let i=0;i<70;i++){
      const t=i/70,px=left.x-24+(bottom.x-left.x+24)*t,py=left.y+(bottom.y-left.y+12)*t;
      rect(g,px,py+8+hash(i,5)*12,8+hash(i,8)*16,12+hash(i,6)*16,['#85856a','#777b5d','#495c48'][i%3]);
    }
    for(let sum=0;sum<49;sum++)for(let x=0;x<25;x++){
      const y=sum-x;if(y<0||y>24)continue;
      const p=iso(x,y),n=hash(x,y),stream=village?x>=17&&x<=19:location==='temple'||location==='ruins'||location==='pass'?false:location==='camp'?y===11||y===12:location==='marsh'?(x>=3&&x<=5)||(y>=17&&y<=18&&x>=15):x>=2&&x<=3;
      const bridge=village?y>=12&&y<=13:location==='camp'?x>=10&&x<=14:y>=15&&y<=17;
      const road=isRoad(x,y);
      if(stream&&!bridge){
        blocked.add(R.key(x,y));tile(g,x,y,(location==='camp'?['#455b50','#506356','#485e50','#596c57']:['#5f9584','#6d9f8b','#75a38d','#639781'])[Math.floor(n*4)]);
        rect(g,p.x-12,p.y,16,2,n>.5?'#a8bea16e':'#416e6033');
        if(hash(y,x)>.8){ellipse(g,p.x-5,p.y-3,4,2,'#8faa76');rect(g,p.x-6,p.y-5,3,2,'#c9c798');}
        continue;
      }
      if(stream&&bridge){
        tile(g,x,y,'#a5a387');for(let i=-2;i<=2;i++)rect(g,p.x-18+i*6,p.y+i*3,13,2,'#c0b99b');continue;
      }
      tile(g,x,y,road?palette.road[Math.floor(n*4)]:colors[Math.floor(n*colors.length)]);
      if(road){for(let i=0;i<5;i++)rect(g,p.x+(hash(x*5+i,y)-.5)*33,p.y+(hash(x,y*5+i)-.5)*12,2+hash(i,y)*4,1.5,i%2?'#a69e78':'#d0c29a');}
      else{if(n>.25)grass(g,x,y);if(n>.91)flower(g,x+.2,y,n>.96?'#d6c389':'#b4bb84');}
      if(x===0||y===0||x===24||y===24)blocked.add(R.key(x,y));
    }
    if(village){
      // Bridge railings, stepping stones and the edges of garden plots.
      for(const y of[11.7,13.5])fence(g,16.4,y,4,'x');
      const gardens=[{x:4,y:15},{x:5,y:17}];
      for(const garden of gardens)for(let i=0;i<4;i++)for(let j=0;j<2;j++){
        tile(g,garden.x+i*.6,garden.y+j*.6,'#796d4a',null,iso,13,6);
        const p=iso(garden.x+i*.6,garden.y+j*.6);rect(g,p.x,p.y-9,3,10,'#9ca66d');rect(g,p.x-4,p.y-7,4,3,'#4f7745');rect(g,p.x+3,p.y-5,4,3,'#b4b375');
      }
      const homes=[{x:9,y:7,kind:'home',foot:[7,10,4,7]},{x:5,y:12,kind:'doctor',foot:[3,6,9,12]},{x:14,y:6,kind:'inn',foot:[12,16,3,6]}];
      for(const home of homes){for(let x=home.foot[0];x<=home.foot[1];x++)for(let y=home.foot[2];y<=home.foot[3];y++)blocked.add(R.key(x,y));objects.push({...home,type:'house',depth:home.x+home.y+.8});}
      objects.push({x:15,y:12,type:'stall',depth:27.5});blocked.add('15,12');blocked.add('15,11');
      for(const f of[{x:7,y:8,length:3,direction:'x'},{x:3,y:14,length:4,direction:'y'},{x:7,y:17,length:2,direction:'y'},{x:9,y:22,length:5,direction:'x'}])objects.push({...f,type:'fence',depth:f.x+f.y+f.length*.4});
      const well=iso(10,14);ellipse(g,well.x,well.y+3,14,8,'#61705a');ellipse(g,well.x,well.y-5,14,8,'#acaa82');ellipse(g,well.x,well.y-6,9,4,'#3d5d4b');
      blocked.add('10,14');
    }else if(location==='bamboo'){
      for(let x=9;x<16;x++)for(let y=6;y<12;y++)tile(g,x,y,hash(x,y)>.5?'#a8a57d':'#b1aa82');
      objects.push({x:15,y:7,type:'tent',depth:22});blocked.add('15,7');blocked.add('15,6');
      const fire=iso(12,9);ellipse(g,fire.x,fire.y,11,6,'#696147');for(let i=0;i<6;i++)rect(g,fire.x-10+i*4,fire.y-4,4,5,'#b5a178');
    }else{
      const homes=location==='city'?[{x:6,y:6,kind:'inn',foot:[4,7,3,6]},{x:17,y:6,kind:'doctor',foot:[15,19,3,6]},{x:11,y:4,kind:'home',foot:[9,12,2,4]}]:location==='temple'?[{x:12,y:4,kind:'hall',foot:[10,14,2,4]},{x:5,y:5,kind:'home',foot:[3,6,3,5]}]:location==='camp'?[{x:12,y:4,kind:'fort',foot:[9,14,2,4]}]:[];
      for(const home of homes){for(let x=home.foot[0];x<=home.foot[1];x++)for(let y=home.foot[2];y<=home.foot[3];y++)blocked.add(R.key(x,y));objects.push({...home,type:'house',depth:home.x+home.y+.8});}
      if(location==='city'){
        for(const[x,y]of[[5,12],[18,12],[16,18]]){objects.push({x,y,type:'stall',depth:x+y});blocked.add(R.key(x,y));}
        for(const[x,y]of[[9,9],[14,8],[9,16],[14,17],[9,21],[14,21],[20,14]])objects.push({x,y,type:'lantern',depth:x+y+.5});
        objects.push({x:12,y:22,type:'gate',kind:'city',depth:34});
      }else if(location==='camp'){
        for(const[x,y]of[[5,5],[18,6],[18,19]]){objects.push({x,y,type:'tent',depth:x+y});blocked.add(R.key(x,y));}
        for(const[x,y]of[[6,16],[17,16],[9,6],[15,6]])objects.push({x,y,type:'banner',depth:x+y+.3});
        for(const f of[{x:5,y:20,length:4,direction:'x'},{x:15,y:20,length:5,direction:'x'},{x:20,y:6,length:9,direction:'y'}])objects.push({...f,type:'fence',depth:f.x+f.y+f.length*.4});
        objects.push({x:12,y:20,type:'gate',kind:'camp',depth:32});
      }else if(location==='temple'){
        objects.push({x:12,y:19,type:'gate',kind:'temple',depth:31});
        for(const[x,y]of[[9,8],[15,8],[8,15],[17,20]])objects.push({x,y,type:'censer',depth:x+y});
        for(const y of[10,16])for(let x=9;x<=15;x++)tile(g,x,y,'#c9cbbb','#a2ac9455');
      }else if(location==='marsh'){
        for(const f of[{x:7,y:17,length:7,direction:'x'},{x:8,y:19,length:5,direction:'x'}])objects.push({...f,type:'fence',depth:f.x+f.y+f.length*.4});
        objects.push({x:8,y:5,type:'tent',depth:13},{x:16,y:19,type:'lantern',depth:35});
      }else if(location==='ruins'){
        for(const[x,y]of[[5,5],[8,7],[17,4],[20,9],[17,18],[4,18]]){objects.push({x,y,type:'ruin',depth:x+y});blocked.add(R.key(x,y));}
        for(const[x,y]of[[10,15],[14,15],[10,8],[14,8]])objects.push({x,y,type:'lantern',depth:x+y});
      }else if(location==='pass'){
        objects.push({x:12,y:18,type:'gate',kind:'pass',depth:30});
        for(const y of[8,10,12,14,16,20])for(let x=9;x<=15;x++)tile(g,x,y,'#d1d4be','#afb99c55');
        for(const[x,y]of[[8,8],[16,8]])objects.push({x,y,type:'censer',depth:x+y});
      }else{
        for(const[x,y]of[[7,12],[18,13],[13,9],[12,5]]){
          const p=iso(x,y);ellipse(g,p.x,p.y,54,27,'#7d73574d');g.strokeStyle='#cab283';g.lineWidth=2;g.beginPath();g.ellipse(p.x,p.y,49,24,0,0,Math.PI*2);g.stroke();
          for(let i=0;i<8;i++){const a=i*Math.PI/4;rect(g,p.x+Math.cos(a)*39,p.y+Math.sin(a)*19,5,3,'#d2b68b');}
        }
        for(const[x,y]of[[9,4],[16,4],[5,11],[21,12]])objects.push({x,y,type:'ruin',depth:x+y});
      }
    }
    const sites=SITES[location];
    for(let x=1;x<24;x++)for(let y=1;y<24;y++){
      const n=hash(x+15,y+38),road=isRoad(x,y)||isRoad(x-1,y)||isRoad(x,y-1);
      if(blocked.has(R.key(x,y))||road||sites.some(s=>R.distance(s,{x,y})<3))continue;
      const edge=x<4||y<3||x>21||y>22;
      if(n<(edge?.79:location==='city'?.1:location==='temple'?.22:.35)){
        const type=location==='marsh'?'reeds':location==='ruins'?'stone':location==='bamboo'?'bamboo':location==='valley'?'maple':location==='city'?'tree':village&&n<.12?'tree':'pine';
        blocked.add(R.key(x,y));objects.push({x,y,type,size:.75+hash(x+7,y)*.5,tone:hash(y,x)>.6?1:0,depth:x+y+.2});
      }else if(n>.91){blocked.add(R.key(x,y));objects.push({x,y,type:'stone',size:.7+hash(y,x)*.5,depth:x+y});}
    }
    // Keep every interaction tile reachable, even beside a randomized tree cluster.
    for(const site of sites){blocked.delete(R.key(site.x,site.y));blocked.delete(R.key(site.x,site.y+1));}
    const start=LOCATIONS[location].spawn;blocked.delete(R.key(start.x,start.y));
    for(const site of sites){
      if(R.findPath(start,site,(x,y)=>x>=1&&y>=1&&x<=23&&y<=23&&!blocked.has(R.key(x,y)))===null){
        let x=start.x,y=start.y;
        while(x!==site.x||y!==site.y){if(x!==site.x)x+=Math.sign(site.x-x);else y+=Math.sign(site.y-y);blocked.delete(R.key(x,y));const o=objects.findIndex(o=>o.x===x&&o.y===y&&['pine','tree','maple','bamboo','stone','reeds'].includes(o.type));if(o>=0)objects.splice(o,1);}
      }
    }
    return {layer,backdrop,blocked,objects};
  }
  function drawObject(g,o) {
    if(o.type==='reeds'){const p=iso(o.x,o.y);for(let i=0;i<8;i++){const x=p.x+(i-4)*4,h=24+hash(i,o.x+o.y)*25;rect(g,x,p.y-h,2,h,'#667d57');rect(g,x-1,p.y-h-9,4,12,'#c8bd8a');}}
    if(o.type==='pine')pine(g,o.x,o.y,o.size,o.tone);
    if(o.type==='tree')broadTree(g,o.x,o.y,o.size,hash(o.x,o.y)>.5);
    if(o.type==='maple')broadTree(g,o.x,o.y,o.size,'red');
    if(o.type==='bamboo')bamboo(g,o.x,o.y,o.size);
    if(o.type==='stone')stone(g,o.x,o.y,o.size);
    if(o.type==='house')house(g,o.x,o.y,o.kind);
    if(o.type==='stall')stall(g,o.x,o.y);
    if(o.type==='fence')fence(g,o.x,o.y,o.length,o.direction);
    if(o.type==='lantern'){
      const p=iso(o.x,o.y);rect(g,p.x,p.y-64,4,65,'#605e45');rect(g,p.x-2,p.y-64,19,4,'#8c825e');lantern(g,p.x+15,p.y-52);ellipse(g,p.x+15,p.y-47,16,20,'#f2c97812');
    }
    if(o.type==='banner'){
      const p=iso(o.x,o.y);rect(g,p.x,p.y-83,4,85,'#706245');poly(g,[[p.x+4,p.y-80],[p.x+33,p.y-76],[p.x+29,p.y-52],[p.x+16,p.y-56],[p.x+4,p.y-48]],'#8f634c');g.font='15px serif';g.textAlign='center';g.fillStyle='#dbb987';g.fillText('寨',p.x+17,p.y-61);
    }
    if(o.type==='gate'){
      const p=iso(o.x,o.y),temple=o.kind==='temple'||o.kind==='pass';ellipse(g,p.x,p.y,70,18,'#253e2e25');
      for(const side of[-1,1]){rect(g,p.x+side*60-4,p.y-103,8,104,temple?'#b7b69b':'#84724d');rect(g,p.x+side*60-9,p.y-5,18,8,'#bbb496');}
      rect(g,p.x-72,p.y-109,144,11,temple?'#b9bda5':'#6e7051');poly(g,[[p.x-83,p.y-107],[p.x-63,p.y-127],[p.x+63,p.y-127],[p.x+83,p.y-107]],temple?'#566d5e':'#4d5c48');
      rect(g,p.x-24,p.y-99,48,23,'#465542');g.fillStyle='#dfc891';g.font='15px serif';g.textAlign='center';g.fillText(o.kind==='pass'?'问心':temple?'武当':o.kind==='camp'?'黑风寨':'平康',p.x,p.y-83);
      if(!temple){lantern(g,p.x-47,p.y-85);lantern(g,p.x+46,p.y-85);}
    }
    if(o.type==='censer'){
      const p=iso(o.x,o.y);rect(g,p.x-8,p.y-10,3,12,'#7c8368');rect(g,p.x+7,p.y-10,3,12,'#7c8368');ellipse(g,p.x,p.y-17,17,11,'#929b7b');ellipse(g,p.x,p.y-22,15,7,'#c3c6a6');rect(g,p.x-2,p.y-39,2,17,'#7c7251');
      for(let i=0;i<4;i++)ellipse(g,p.x+Math.sin(i)*3,p.y-44-i*6,3+i,3,'#dce2cb44');
    }
    if(o.type==='ruin'){
      const p=iso(o.x,o.y);poly(g,[[p.x-14,p.y],[p.x+16,p.y+4],[p.x+16,p.y-48],[p.x+5,p.y-61],[p.x-14,p.y-54]],'#82846e');rect(g,p.x-10,p.y-51,5,48,'#b1aa87');rect(g,p.x-17,p.y-3,38,8,'#8f9277');
    }
    if(o.type==='tent'){
      const p=iso(o.x,o.y);poly(g,[[p.x-54,p.y],[p.x,p.y-70],[p.x+55,p.y-12],[p.x+25,p.y+15]],'#a38a58');poly(g,[[p.x,p.y-70],[p.x+25,p.y+15],[p.x-54,p.y]],'#b9a171');poly(g,[[p.x-10,p.y-38],[p.x+10,p.y+11],[p.x-29,p.y+1]],'#4a5340');rect(g,p.x,p.y-80,3,18,'#6d6749');
    }
  }
  function drawPerson(g,px,py,color='#d6dac5',hero=false,time=0,scale=1,kind='') {
    const s=scale,step=hero&&path.length?Math.sin(time*13)*2:0;
    g.save();g.translate(Math.round(px),Math.round(py));g.scale(s,s);
    ellipse(g,1,1,10,4,'#263b3166');
    if(hero){ellipse(g,0,1,16,7,'#e7deb322');g.strokeStyle='#e4d9a5';g.lineWidth=1;g.beginPath();g.ellipse(0,1,15,6,0,0,Math.PI*2);g.stroke();}
    rect(g,-5,-6+step,4,8,'#333e35');rect(g,2,-6-step,4,8,'#333e35');
    rect(g,-6,-3+step,5,3,'#b7b396');rect(g,2,-3-step,5,3,'#b7b396');
    poly(g,[[-6,-27],[6,-27],[9,-8],[4,-4],[-2,-7],[-8,-5]],hero?'#d6d9bf':color);
    poly(g,[[-5,-27],[-1,-22],[-1,-7],[-8,-5]],hero?'#8aab9e':'#718470');
    rect(g,-6,-16,14,3,hero?'#497e75':'#706c4b');
    poly(g,[[-6,-25],[-9,-21],[-11,-12],[-7,-10],[-4,-20]],hero?'#d6dbc2':color);rect(g,-11,-12,4,4,'#cbb087');
    poly(g,[[5,-25],[9,-22],[10,-14],[6,-12],[3,-23]],hero?'#b6c5ac':color);rect(g,7,-15,4,4,'#dbc095');
    rect(g,-5,-37,11,12,'#d7b991');rect(g,-5,-37,2,10,'#b99776');
    rect(g,-5,-40,10,5,'#313d37');rect(g,-7,-37,4,10,'#313d37');rect(g,4,-37,3,11,'#313d37');
    rect(g,-2,-44,5,5,'#344139');rect(g,-4,-41,9,2,hero?'#a6bab1':'#666f51');
    rect(g,0,-31,2,2,'#4b4c39');rect(g,4,-31,1,2,'#4b4c39');rect(g,1,-27,3,1,'#a57f60');
    if(hero||kind==='swordsman'){
      poly(g,[[7,-29],[10,-31],[17,-6],[15,-4]],'#526c61');poly(g,[[8,-31],[10,-32],[13,-26],[11,-24]],'#c3ba87');
      rect(g,6,-35,3,6,'#7f7450');poly(g,[[-2,-38],[-1,-35],[-9,-29],[-17,-28],[-9,-32]],'#8fb4a5');
    }
    if(kind==='elder'){rect(g,-5,-41,11,5,'#b6b4a0');rect(g,-6,-37,3,9,'#c4c0aa');rect(g,-2,-27,6,5,'#d1cdb4');rect(g,13,-27,2,29,'#82734c');}
    if(kind==='doctor'){rect(g,-8,-38,3,15,'#313d37');rect(g,-7,-39,3,3,'#b1c68b');poly(g,[[4,-15],[9,-9],[7,-3],[2,-9]],'#7aa287');}
    if(kind==='enemy'){rect(g,-8,-37,17,4,'#a47750');rect(g,9,-25,3,17,'#aca889');rect(g,8,-12,6,2,'#655d3f');}
    g.restore();
  }
  function drawPortrait(target,color='#cbd6c0',kind='hero') {
    if(!target)return;const g=target.getContext('2d');g.imageSmoothingEnabled=false;
    rect(g,0,0,96,110,'#314c3d');
    for(let i=0;i<60;i++)rect(g,hash(i,2)*96,hash(i,9)*110,5+hash(i,1)*15,3+hash(i,6)*9,['#3f5c47','#506d4e','#67825a','#273e33'][i%4]);
    poly(g,[[4,110],[14,77],[31,67],[61,67],[86,84],[93,110]],color);
    poly(g,[[10,110],[23,78],[35,71],[43,110]],'#78968a');
    poly(g,[[48,77],[72,76],[80,110],[59,110]],'#a6bcab');
    rect(g,36,60,21,19,'#c2a07b');poly(g,[[32,71],[43,83],[55,69],[62,75],[46,96],[26,77]],'#e0e1ca');
    poly(g,[[27,27],[39,17],[63,22],[70,42],[63,65],[47,73],[30,61]],'#d9bb93');
    poly(g,[[27,28],[33,33],[33,55],[44,66],[47,73],[30,61]],'#b79677');
    poly(g,[[22,28],[26,13],[43,5],[61,11],[74,26],[74,67],[64,78],[60,59],[65,33],[55,29],[46,43],[37,28],[33,50],[24,65]],'#283d34');
    poly(g,[[27,23],[38,13],[56,14],[65,20],[42,17],[37,27],[30,36]],'#3e5144');
    rect(g,41,40,9,3,'#41483b');rect(g,58,39,7,3,'#41483b');rect(g,45,45,3,3,'#3d483b');rect(g,59,44,3,3,'#3d483b');
    rect(g,52,45,2,11,'#b69373');rect(g,48,61,10,2,'#ad8266');rect(g,51,58,6,2,'#e6c69a');
    poly(g,[[26,20],[28,26],[62,25],[68,29],[66,21]],'#90aca0');
    poly(g,[[27,24],[12,35],[3,38],[4,44],[22,35]],'#96b4a3');
    rect(g,45,3,14,8,'#273b31');rect(g,42,7,20,3,'#afb895');
    if(kind==='elder'){
      poly(g,[[26,18],[39,8],[62,13],[72,29],[61,25],[46,20],[32,33],[25,53]],'#afb09b');
      poly(g,[[35,58],[45,61],[56,58],[59,66],[47,84],[37,72]],'#cdceba');rect(g,42,7,20,3,'#636f57');
    }
    if(kind==='doctor'){rect(g,22,20,9,8,'#b9caa0');rect(g,24,18,4,13,'#dce0b4');poly(g,[[25,32],[29,36],[28,78],[22,87],[23,56]],'#2a3e35');}
    poly(g,[[77,110],[83,110],[70,65],[64,59],[61,61],[67,69]],'#6c7f6b');rect(g,59,57,10,4,'#b8aa72');
    rect(g,0,107,96,3,'#182e25');
  }

  const spriteCache=new Map();
  function scenerySprite(o) {
    const size=Math.round((o.size||1)*10)/10;
    const id=[o.type,size,o.tone,o.kind,o.length,o.direction,o.type==='tree'?hash(o.x,o.y)>.5:''].join('/');
    if(!spriteCache.has(id)){
      const c=document.createElement('canvas');c.width=o.type==='fence'?380:250;c.height=240;
      const g=c.getContext('2d'),p=iso(o.x,o.y);g.translate(100-p.x,215-p.y);drawObject(g,{...o,size});spriteCache.set(id,c);
    }
    return spriteCache.get(id);
  }
  function label(g,x,y,text,color='#e9e6c8',small=false) {
    const fontSize=Math.max(small?13:16,(small?11:12)/(canvasDisplayScale*view.scaleY));
    g.font=`${fontSize}px "Microsoft YaHei", sans-serif`;g.textAlign='center';g.textBaseline='middle';
    const width=g.measureText(text).width+16,height=fontSize+8;g.fillStyle='rgba(25,47,33,.83)';g.beginPath();g.roundRect(x-width/2,y-height/2,width,height,4);g.fill();
    g.strokeStyle='rgba(175,189,133,.25)';g.lineWidth=1;g.stroke();g.fillStyle=color;g.fillText(text,x,y+1);g.textBaseline='alphabetic';
  }
  function questMarker(g,x,y,time) {
    const yy=y+(reduceMotion?0:Math.sin(time*2.5)*2);
    poly(g,[[x,yy-12],[x+11,yy],[x,yy+12],[x-11,yy]],'#d3bc77','#f0e0a2');
    g.fillStyle='#48543a';g.font='bold 17px Georgia';g.textAlign='center';g.fillText('!',x,yy+6);
  }
  function drawSite(site,time) {
    const p=iso(site.x,site.y),g=ctx;
    if(site.type==='npc'||site.type==='enemy')drawPerson(g,p.x,p.y,site.color,false,time,1.25,site.type==='enemy'?'enemy':site.id);
    else if(site.type==='herb'){
      ellipse(g,p.x,p.y,13,6,'#c7d78524');
      for(let i=-1;i<=1;i++){
        rect(g,p.x+i*5,p.y-14-Math.abs(i)*4,2,15+Math.abs(i)*4,'#758e54');
        poly(g,[[p.x+i*5,p.y-5],[p.x+i*5-9,p.y-14],[p.x+i*5-6,p.y-17],[p.x+i*5,p.y-10]],'#bac487');
        poly(g,[[p.x+i*5+2,p.y-11],[p.x+i*5+8,p.y-20],[p.x+i*5+11,p.y-16]],'#d6d7a0');
      }
      const a=(Math.sin(time*2+site.x)+1)/2;g.globalAlpha=.4+a*.5;rect(g,p.x-12,p.y-24,3,3,'#e4e5ac');rect(g,p.x+11,p.y-30,2,5,'#e9dfb2');g.globalAlpha=1;
    }else if(site.type==='chest'||site.type==='crate'){
      poly(g,[[p.x-13,p.y-4],[p.x,p.y+3],[p.x+13,p.y-4],[p.x+13,p.y-17],[p.x,p.y-23],[p.x-13,p.y-16]],'#88744b');
      poly(g,[[p.x-13,p.y-16],[p.x,p.y-23],[p.x+13,p.y-17],[p.x,p.y-10]],'#b09b63');rect(g,p.x-1,p.y-10,3,8,'#d6c07d');
      if(site.type==='crate'){rect(g,p.x-13,p.y-16,26,3,'#d1b77c');rect(g,p.x-2,p.y-22,4,23,'#d1b77c');}
    }else if(site.type==='exit'||site.type==='sign'){
      rect(g,p.x-2,p.y-38,4,40,'#857951');poly(g,[[p.x-19,p.y-39],[p.x+15,p.y-39],[p.x+24,p.y-30],[p.x+15,p.y-21],[p.x-19,p.y-21]],'#b1a16d');
      g.font='10px serif';g.fillStyle='#515b3c';g.textAlign='center';g.fillText(site.name,p.x,p.y-26);
    }else if(site.type==='fish'){
      rect(g,p.x-9,p.y-5,21,6,'#8b805b');rect(g,p.x-7,p.y,3,9,'#726b47');rect(g,p.x+7,p.y,3,9,'#726b47');
      g.strokeStyle='#cac398';g.lineWidth=2;g.beginPath();g.moveTo(p.x+3,p.y-5);g.lineTo(p.x+33,p.y-38);g.stroke();g.strokeStyle='#ced6b477';g.lineWidth=1;g.beginPath();g.moveTo(p.x+33,p.y-38);g.lineTo(p.x+47,p.y+18);g.stroke();
    }else if(site.type==='spring'){
      ellipse(g,p.x,p.y,27,13,'#a5af87');ellipse(g,p.x,p.y-1,22,10,'#679c85');ellipse(g,p.x+1,p.y-2,12,5,'#a6c8aa');
    }else if(site.type==='ore'){
      stone(g,site.x,site.y,1.2);poly(g,[[p.x-5,p.y-8],[p.x-2,p.y-23],[p.x+6,p.y-29],[p.x+10,p.y-9]],'#a8bdb4');poly(g,[[p.x+9,p.y-4],[p.x+14,p.y-18],[p.x+20,p.y-13],[p.x+19,p.y-2]],'#d1d9c0');
    }else if(site.type==='stele'){
      ellipse(g,p.x,p.y+1,23,10,'#435b4555');poly(g,[[p.x-19,p.y-2],[p.x+18,p.y+5],[p.x+19,p.y-44],[p.x+6,p.y-57],[p.x-17,p.y-49]],'#879780');
      poly(g,[[p.x-14,p.y-45],[p.x+6,p.y-50],[p.x+12,p.y-41],[p.x+12,p.y-3],[p.x-14,p.y-8]],'#b7bea0');rect(g,p.x-21,p.y-3,43,7,'#a0aa8c');
      g.fillStyle='#445f50';g.textAlign='center';g.font='22px KaiTi,serif';g.fillText(site.id==='seal-north'?'玄':site.name[0],p.x,p.y-20);
      if((state.progress.steles||[]).includes(site.id)){g.strokeStyle='#d3d6a1';g.lineWidth=2;g.beginPath();g.ellipse(p.x,p.y,25,12,0,0,Math.PI*2);g.stroke();}
    }else if(site.type==='mechanism'){
      rect(g,p.x-19,p.y-13,38,16,'#8c8262');rect(g,p.x-15,p.y-36,4,30,'#c0af83');rect(g,p.x+13,p.y-36,4,33,'#c0af83');
      g.strokeStyle='#d0ba83';g.lineWidth=5;g.beginPath();g.arc(p.x,p.y-30,17,0,Math.PI*2);g.moveTo(p.x-16,p.y-30);g.lineTo(p.x+16,p.y-30);g.moveTo(p.x,p.y-47);g.lineTo(p.x,p.y-13);g.stroke();
    }
  }
  function drawWorld(time) {
    const map=MAPS[state.location];ctx.drawImage(map.layer,0,0);
    if(hover&&!modal.open&&walkable(hover.x,hover.y))tile(ctx,hover.x,hover.y,'#e3dfa32a','#d7d5988c');
    if(path.length){
      const target=path.at(-1),p=iso(target.x,target.y);
      ctx.strokeStyle='#e6dcaa';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(p.x,p.y,13,6,0,0,Math.PI*2);ctx.stroke();
      for(let i=2;i<path.length;i+=3){const dot=iso(path[i].x,path[i].y);ellipse(ctx,dot.x,dot.y,2,1.5,'#f1e4b183');}
    }
    const drawables=map.objects.map(o=>({depth:o.depth,object:o}));
    const sites=currentSites();
    for(const site of sites)drawables.push({depth:site.x+site.y+.8,site});
    drawables.push({depth:playerVisual.x+playerVisual.y+.9,player:true});
    drawables.sort((a,b)=>a.depth-b.depth);
    for(const item of drawables){
      if(item.object){const o=item.object,p=iso(o.x,o.y);if(o.x+o.y>state.x+state.y&&Math.abs(p.x-iso(playerVisual.x,playerVisual.y).x)<58&&Math.abs(p.y-iso(playerVisual.x,playerVisual.y).y)<90)ctx.globalAlpha=.55;ctx.drawImage(o.sprite,p.x-100,p.y-215);ctx.globalAlpha=1;}
      else if(item.site)drawSite(item.site,time);
      else{const p=iso(playerVisual.x,playerVisual.y);drawPerson(ctx,p.x,p.y,'#d5d9c0',true,time,1.45);}
    }
    for(const site of sites){
      const p=iso(site.x,site.y),target=targetSite()?.id===site.id;
      if(site.type==='npc')label(ctx,p.x,p.y-72,site.name,site.id==='elder'?'#e9d79e':'#e2e4c7');
      if(site.type==='enemy')label(ctx,p.x,p.y-72,site.name,'#f0c4a0');
      if(target){questMarker(ctx,p.x,p.y-(site.type==='npc'||site.type==='enemy'?110:43),time);}
      if(site.type==='herb'&&state.stage===1)label(ctx,p.x,p.y+20,'青灵草','#e2e5b3',true);
      if(hover&&Math.abs(hover.x-site.x)<=1&&Math.abs(hover.y-site.y)<=1&&!['npc','enemy','herb'].includes(site.type))label(ctx,p.x,p.y-59,site.name,'#e3d9ae',true);
    }
    const p=iso(playerVisual.x,playerVisual.y);label(ctx,p.x,p.y+25,'宇文逸','#f0e6b9',true);
    // A few warm rays and drifting leaves make the static painting feel alive.
    ctx.save();ctx.globalCompositeOperation='screen';
    const ray=ctx.createLinearGradient(170,0,500,620);ray.addColorStop(0,'#d7d6a114');ray.addColorStop(.8,'#e6d6a004');ray.addColorStop(1,'#e6d6a000');
    poly(ctx,[[130,0],[260,0],[660,660],[490,690]],ray);poly(ctx,[[350,0],[390,0],[780,590],[710,590]],ray);ctx.restore();
    if(!reduceMotion){
      for(let i=0;i<16;i++){
        const x=(hash(i,2)*W+time*(7+hash(i,4)*8))%(W+80)-40,y=(hash(i,6)*H+time*(3+hash(i,8)*5))%H;
        rect(ctx,x+Math.sin(time+i)*6,y,3+hash(i,3)*3,2,'#e3d4a073');
      }
      for(let i=0;i<3;i++){
        const x=(time*18+i*33+180)%(W+100)-50,y=68+i*12+Math.sin(time+i)*3;
        ctx.strokeStyle='#2e4d3b88';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x-5,y-2-Math.sin(time*4+i)*2);ctx.lineTo(x,y);ctx.lineTo(x+5,y-2-Math.sin(time*4+i)*2);ctx.stroke();
      }
    }
  }
  function drawBattle(time) {
    const b=battle,map=MAPS[state.location];
    const charged=new Set(R.living(b).flatMap(e=>(e.charge||[]).map(p=>R.key(p.x,p.y)))),fire=new Set(b.fire.map(p=>R.key(p.x,p.y)));
    const goal=b.exit||b.capture;
    ctx.save();ctx.setTransform(viewportRatio,0,0,1,W/2-640*viewportRatio,0);ctx.drawImage(map.layer,0,0);
    for(const o of map.objects){const p=iso(o.x,o.y);ctx.drawImage(o.sprite,p.x-100,p.y-215);}
    ctx.setTransform(1,0,0,1,0,0);rect(ctx,0,0,W,H,'#142d226e');ctx.restore();
    for(let sum=0;sum<b.width+b.height;sum++)for(let x=0;x<b.width;x++){
      const y=sum-x;if(y<0||y>=b.height)continue;
      let color=(x+y)%2?'#88956b':'#829167',stroke='#ced0a342';
      if(b.phase==='player'&&!b.moved){const route=R.battlePath(b,b.player,{x,y});if(route&&route.length<=b.moveLimit){color='#a5b48b';stroke='#d2e2ac99';}}
      if(hover&&hover.x===x&&hover.y===y){color='#c1c393';stroke='#f4e5b6';}
      if(goal&&R.distance(goal,{x,y})===0){color='#c2ad63';stroke='#ffeea4';}
      if(fire.has(R.key(x,y))){color='#b58b50';stroke='#f3cc77';}
      if(charged.has(R.key(x,y))){color='#af7061';stroke='#f1ba8e';}
      tile(ctx,x,y,color,stroke,battleIso,54,28);
      const p=battleIso(x,y);rect(ctx,p.x-15,p.y+8,5,2,'#647c4e77');rect(ctx,p.x+23,p.y-4,3,4,'#b7b78b44');
      if(charged.has(R.key(x,y))){ctx.strokeStyle='#ffd0a3';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x-9,p.y-4);ctx.lineTo(p.x+9,p.y+4);ctx.moveTo(p.x+9,p.y-4);ctx.lineTo(p.x-9,p.y+4);ctx.stroke();}
      if(goal&&R.distance(goal,{x,y})===0){label(ctx,p.x,p.y+8,b.exit?'出口':'哨台','#fff1bb',true);}
      if(fire.has(R.key(x,y)))label(ctx,p.x,p.y+9,'火','#ffedb0',true);
      if(b.obstacle.has(R.key(x,y))){
        poly(ctx,[[p.x-28,p.y],[p.x-24,p.y-23],[p.x+8,p.y-35],[p.x+30,p.y-16],[p.x+31,p.y+2],[p.x+6,p.y+10]],'#7b856d');
        poly(ctx,[[p.x-28,p.y],[p.x-24,p.y-23],[p.x+8,p.y-35],[p.x+22,p.y-24],[p.x-2,p.y-10]],'#a8ac85');
      }
    }
    const people=[...R.living(b).map(e=>({...e,enemy:true})),...(b.ally?[{...b.ally,friendly:true,color:'#aac6a7'}]:[]),{...b.player,hero:true}].sort((a,b)=>a.x+a.y-b.x-b.y);
    for(const person of people){
      const reaction=FX.actor(person.hero?'hero':person.friendly?'ally':person.id);
      ctx.save();ctx.translate(reaction.x,reaction.y);if(reaction.flash)ctx.filter='brightness(1.6)';
      const p=battleIso(person.x,person.y),reachable=person.enemy&&R.distance(person,b.player)<=R.SKILLS[b.selected].range;
      if(reachable&&b.phase==='player'){ctx.strokeStyle='#f2c390';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.y,29,13,0,0,Math.PI*2);ctx.stroke();}
      if(person.role==='totem'){
        ellipse(ctx,p.x,p.y,25,13,'#ead49e44');poly(ctx,[[p.x-17,p.y],[p.x+18,p.y+2],[p.x+18,p.y-67],[p.x,p.y-83],[p.x-17,p.y-69]],'#969680','#ddc68e');rect(ctx,p.x-3,p.y-65,6,43,'#e6d08b');label(ctx,p.x,p.y-42,'阵','#ffe6a5',true);
      }else drawPerson(ctx,p.x,p.y,person.color||'#d9dfbf',person.hero,time,person.hero?2.15:2,person.enemy?'enemy':'');
      if(person.role==='shield'){poly(ctx,[[p.x-27,p.y-48],[p.x-5,p.y-48],[p.x-6,p.y-22],[p.x-16,p.y-12],[p.x-28,p.y-25]],'#808674','#c6c3a1');}
      if(person.role==='ranged'){ctx.strokeStyle='#d0b581';ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x+14,p.y-40,23,-1.2,1.2);ctx.stroke();ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.x+23,p.y-61);ctx.lineTo(p.x+23,p.y-19);ctx.stroke();}
      const hp=person.hero?state.hp:person.hp,max=person.hero?R.maxHp(state):person.maxHp;
      rect(ctx,p.x-26,p.y-106,52,4,'#263b2c');rect(ctx,p.x-26,p.y-106,52*hp/max,4,person.hero||person.friendly?'#bad2a1':'#ce9c6d');
      if(person.enemy&&person.poiseMax){rect(ctx,p.x-26,p.y-98,52,3,'#263b2c');rect(ctx,p.x-26,p.y-98,52*person.poise/person.poiseMax,3,'#e0c37e');}
      if(person.exposed)label(ctx,p.x,p.y+26,'破势','#ffe0a0',true);
      if(person.poison||person.hero&&b.poison)label(ctx,p.x,p.y-145,'毒 ×'+(person.hero?b.poison:person.poison),'#dbb5ec',true);
      label(ctx,p.x,p.y-123,person.hero?'宇文逸':(person.friendly?'护送 · ':'')+person.name+(person.raged?' · 狂怒':''),person.hero?'#eae9be':person.raged?'#ffb29c':'#e9cba2',true);
      if(person.hero&&b.guard)label(ctx,p.x,p.y+24,'守势','#c1db9e',true);
      ctx.restore();
    }
  }
  function move(dx,dy) {
    if(modal.open||fishing)return;
    if(battle){battleMove(battle.player.x+dx,battle.player.y+dy);return;}
    if(state.expedition.active){openTower();return;}
    const x=state.x+dx,y=state.y+dy;
    if(!walkable(x,y))return;
    const route=R.findPath(state,{x,y},walkable);
    if(!route||route.length>2)return;
    path=route;pending=null;walkClock=.13;
  }
  function pointer(event) {
    const box=canvas.getBoundingClientRect(),x=(event.clientX-box.left)/box.width*W,y=(event.clientY-box.top)/box.height*H;
    return{x:(x-W/2)/view.scaleX+view.cameraX,y:(y-H/2)/view.scaleY+H/2};
  }
  canvas.addEventListener('pointermove',event=>{const p=pointer(event);hover=battle?fromBattleIso(p.x,p.y):fromIso(p.x,p.y);});
  canvas.addEventListener('pointerleave',()=>hover=null);
  canvas.addEventListener('pointerdown',event=>{
    if(modal.open||fishing)return;canvas.focus({preventScroll:true});const p=pointer(event);
    if(battle){
      if(battle.phase!=='player')return;
      if(battle.selectingMove){const tile=fromBattleIso(p.x,p.y);if(!battleMove(tile.x,tile.y))toast('请选择移动范围内的空格。');return;}
      const enemy=R.living(battle).find(e=>{const point=battleIso(e.x,e.y);return Math.abs(point.x-p.x)<32&&p.y>point.y-138&&p.y<point.y+16;});
      if(enemy){perform(battle.selected,enemy.id);return;}
      const tile=fromBattleIso(p.x,p.y);
      const tileEnemy=R.living(battle).find(e=>e.x===tile.x&&e.y===tile.y);
      if(tileEnemy){perform(battle.selected,tileEnemy.id);return;}
      if(battleMove(tile.x,tile.y)){playFeedback('step');}else toast(battle.moved?'本回合已移动，请出招、用药或防御。':`请选择 ${battle.moveLimit} 格内亮起的空地。`);return;
    }
    if(state.expedition.active){openTower();return;}
    const site=currentSites().filter(s=>{const point=iso(s.x,s.y),height=s.type==='npc'||s.type==='enemy'?91:45;return Math.abs(point.x-p.x)<31&&p.y>point.y-height&&p.y<point.y+17;}).sort((a,b)=>{const ap=iso(a.x,a.y),bp=iso(b.x,b.y);return Math.abs(ap.y-p.y-30)-Math.abs(bp.y-p.y-30);})[0];
    if(site){navigate(site);return;}
    const goal=fromIso(p.x,p.y);if(!walkable(goal.x,goal.y)){toast('前方有山石草木，换条路走走。');return;}
    const route=R.findPath(state,goal,walkable);if(route!==null){path=route;pending=null;walkClock=0;}
  });
  document.addEventListener('click',event=>{
    const panelButton=event.target.closest('[data-panel]');if(panelButton){event.preventDefault();panel(panelButton.dataset.panel);}
    const siteButton=event.target.closest('[data-site]');if(siteButton)navigate(findSite(siteButton.dataset.site));
    const enemyButton=event.target.closest('[data-enemy]');if(enemyButton&&battle)perform(battle.selected,enemyButton.dataset.enemy);
    const skillButton=event.target.closest('[data-skill]');if(skillButton)selectSkill(skillButton.dataset.skill);
    const moveButton=event.target.closest('[data-move]');if(moveButton)move(...moveButton.dataset.move.split(',').map(Number));
    if(event.target.closest('[data-close]'))closeModal();
  });
  const keyMoves={KeyW:[-1,-1],ArrowUp:[-1,-1],KeyS:[1,1],ArrowDown:[1,1],KeyA:[-1,1],ArrowLeft:[-1,1],KeyD:[1,-1],ArrowRight:[1,-1]};
  document.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.altKey||event.metaKey||event.isComposing)return;
    if(modal.open){if(event.key==='Escape'){event.preventDefault();closeModal();}return;}
    if(keyMoves[event.code]){if(event.target.closest('[role="region"][tabindex="0"]'))return;event.preventDefault();move(...keyMoves[event.code]);return;}
    if(event.repeat)return;
    if(event.code==='KeyE'){event.preventDefault();if(battle)battleGuide();else interact(nearSite());}
    if(event.code==='KeyB')panel('bag');if(event.code==='KeyK')panel('skills');if(event.code==='KeyJ')panel('journal');if(event.code==='KeyM')panel('map');if(event.code==='KeyP')panel('party');if(event.code==='KeyT')panel('arena');
    if(event.key==='?')panel('help');if(event.key==='0'){event.preventDefault();selectSkill('move');}
    const skill=['strike','sweep','heal','potion','guard','ultimate','pierce','poison','aid'][Number(event.key)-1];if(skill){event.preventDefault();selectSkill(skill);}
  });
  $('quest-guide').onclick=guide;$('save-button').onclick=()=>save(true);$('modal-close').onclick=closeModal;
  document.addEventListener('pointerover',event=>{
    if(event.pointerType==='touch')return;
    const target=event.target.closest('[data-tooltip]');
    if(target&&target!==tooltipTarget)queueTooltip(target);
  });
  document.addEventListener('pointerout',event=>{
    if(tooltipTarget&&!tooltipTarget.contains(event.relatedTarget))hideTooltip();
  });
  document.addEventListener('focusin',event=>{
    const target=event.target.closest('[data-tooltip]');
    if(target?.matches(':focus-visible'))queueTooltip(target,0);
  });
  document.addEventListener('focusout',hideTooltip);
  document.addEventListener('pointerdown',hideTooltip);
  document.addEventListener('keydown',hideTooltip);
  document.addEventListener('scroll',hideTooltip,true);
  window.addEventListener('resize',hideTooltip);
  $('interact-prompt').onclick=()=>interact(findSite(lastNearest));
  modal.addEventListener('click',event=>{if(event.target!==modal)return;const box=modal.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeModal();});
  modal.addEventListener('close',()=>{activePanel='';document.querySelectorAll('.nav-button').forEach(b=>b.classList.toggle('active',b.dataset.panel==='world'));updatePrompt();});
  window.addEventListener('pagehide',()=>{save();audio.setHidden(true);});
  window.addEventListener('pageshow',()=>audio.setHidden(document.hidden));
  document.addEventListener('visibilitychange',()=>audio.setHidden(document.hidden));
  $('sound-toggle').onclick=()=>{hideTooltip();audio.setEnabled(!audio.status.enabled);};
  renderSoundToggle();audio.setHidden(document.hidden);
  function frame(now) {
    const dt=Math.min((now-previousTime)/1000||0,.05);previousTime=now;elapsed+=dt;state.playTime+=dt;
    if(path.length&&!modal.open&&!battle&&!fishing){
      walkClock+=dt;
      if(walkClock>=.115){
        walkClock-=.115;const next=path.shift();state.x=next.x;state.y=next.y;
        if(!path.length){const destination=pending;pending=null;updatePrompt();if(destination)interact(destination);save();}
      }
    }
    playerVisual.x+=(state.x-playerVisual.x)*Math.min(1,dt*16);playerVisual.y+=(state.y-playerVisual.y)*Math.min(1,dt*16);
    const zoom=battle&&viewportRatio>1.35?Math.min(1,1.52/viewportRatio):1;
    view.scaleX=viewportRatio*zoom;view.scaleY=zoom;
    view.cameraX=viewportRatio>1.15&&!battle?R.clamp(iso(playerVisual.x,playerVisual.y).x,W/(2*view.scaleX),W-W/(2*view.scaleX)):W/2;
    ctx.drawImage(MAPS[state.location].backdrop,0,0);
    ctx.save();ctx.translate(W/2,H/2);ctx.scale(view.scaleX,view.scaleY);ctx.translate(-view.cameraX,-H/2);
    if(!battle){drawWorld(elapsed);if(!path.length)updatePrompt();}
    else drawBattle(elapsed);
    FX.update(dt);FX.draw(ctx);
    ctx.restore();
    requestAnimationFrame(frame);
  }
  for(const location of Object.keys(LOCATIONS))MAPS[location]=createMap(location);
  for(const map of Object.values(MAPS))for(const object of map.objects)object.sprite=scenerySprite(object);
  if(!walkable(state.x,state.y)){Object.assign(state,LOCATIONS[state.location].spawn);playerVisual={x:state.x,y:state.y};}
  new ResizeObserver(()=>{const box=canvas.getBoundingClientRect();if(box.width>0&&box.height>0){canvasDisplayScale=box.height/H;viewportRatio=canvasDisplayScale/(box.width/W);}}).observe(canvas);
  ctx.imageSmoothingEnabled=false;drawPortrait($('portrait'));renderHud();
  if(migrated)save();
  if(!storageAvailable)$('save-status').textContent='本地存档暂不可用';
  if(loadMessage)loadMessageTimer=setTimeout(()=>toast(loadMessage),450);
  requestAnimationFrame(frame);
})();
