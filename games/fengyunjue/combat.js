'use strict';

function createCombat(R) {
  const {STORY,ITEMS,SKILLS,DIFFICULTIES,DISCIPLINES,distance,key,findPath,maxHp,maxMp,charm,style}=R;
  const living=b=>b.enemies.filter(e=>e.hp>0);
  const blessing=(b,id)=>b.context.kind==='tower'?b.blessings.filter(v=>v===id).length:0;
  const encounterFor=(s,q)=>q.routes?.[s.choices[q.routes.choice]]||q.encounter;
  const moveLimit=(s)=>Math.max(1,style(s).move+(charm(s).move||0));
  const qiRegen=(s,b)=>Math.max(1,4+(style(s).qi||0)+(charm(s).qi||0)+blessing(b,'breath')*2);
  const battleAttack=(s,b)=>R.attack(s)+blessing(b,'edge')*7+(b.encounter==='final'&&s.bag.testimony?7:0);
  const battleDefense=(s,b)=>R.defense(s)+blessing(b,'shell')*3;
  const poisonPower=s=>5+(charm(s).poison||0)+(DISCIPLINES[s.discipline]?.poison||0);
  const roleNames={melee:'刀手',boss:'首领',ranged:'弓手',shield:'盾卫',poison:'毒师',healer:'药师',totem:'护阵柱'};
  function makeBattle(s,encounter='bandits',context={kind:'story'}) {
    if(typeof encounter==='boolean')encounter=encounter?'spar':'bandits';
    const info=STORY.encounters[encounter];if(!info)throw new Error(`Unknown encounter: ${encounter}`);
    const b={encounter,name:info.name,context:{kind:'story',...context},width:8,height:7,round:1,phase:'player',moved:false,selected:'strike',
      guard:false,practice:!!info.practice,training:!!info.training,solo:!!info.solo,player:{x:1,y:4},moveLimit:moveLimit(s),
      goal:info.goal||'defeat',limit:info.limit||0,exit:info.exit,capture:info.capture,captureTurns:0,ally:info.ally?{...info.ally,maxHp:info.ally.hp,poison:0,poisonTurns:0}:null,
      obstacle:new Set(['3,1','4,5']),cooldowns:{},medicineUsed:0,medicineCooldown:0,momentum:0,poison:0,poisonTurns:0,
      protected:false,supportRound:0,effects:[],fire:[],summoned:[],blessings:context.kind==='tower'?[...s.expedition.blessings]:[],log:info.flavor,reason:''};
    b.medicineMax=DIFFICULTIES[s.difficulty].medicine+(charm(s).medicine||0)+blessing(b,'supply');
    if(b.goal==='escape'){
      const corridor=new Set(['1,4','1,3','1,2','2,2','3,2','1,1','2,1','3,1','4,1','5,1','6,1','4,2','5,2','4,3','5,3','4,4','5,4','6,4','6,5','6,6','7,6','0,1']);
      b.obstacle=new Set();for(let x=0;x<b.width;x++)for(let y=0;y<b.height;y++)if(!corridor.has(key(x,y)))b.obstacle.add(key(x,y));
    }
    b.enemies=info.enemies.map(data=>makeEnemy(s,b,data));
    if(b.ally){const extra=Math.max(0,s.level-info.level);b.ally.hp+=extra*16;b.ally.maxHp=b.ally.hp;}
    return b;
  }
  function makeEnemy(s,b,[id,name,x,y,hp,attack,role='melee']) {
    const info=STORY.encounters[b.encounter],difficulty=DIFFICULTIES[s.difficulty];
    const scaled=info.scales||b.context.kind!=='story'||s.replays>0;
    const level=b.context.kind==='tower'?(s.expedition.level||s.level):s.level;
    const extra=scaled?Math.max(0,level-info.level):0;
    const factor=b.context.kind==='tower'?.88+b.context.floor*.035:b.context.kind==='contract'?1.08:s.replays?1+Math.min(5,s.replays-1)*.07:1;
    hp=Math.max(1,Math.round((hp+extra*(role==='boss'?42:24))*difficulty.hp*factor)-(id==='xuanya'&&s.bag.token?45:0));
    attack=Math.round((attack+extra*2.4)*difficulty.attack*factor);
    const poiseMax=({boss:70,shield:60,melee:44,ranged:38,poison:40,healer:36,totem:0})[role];
    return{id,name,x,y,hp,maxHp:hp,attack,role,poise:poiseMax,poiseMax,stunned:false,exposed:false,recoverRound:0,poison:0,poisonTurns:0,poisonPower:0,
      color:({boss:'#b36c67',ranged:'#899c91',poison:'#9b88b1',healer:'#9dbb86',totem:'#e0c589'})[role]||'#b18b68',raged:false,charge:null};
  }
  function battlePath(b,start,goal,exclude) {
    return findPath(start,goal,(x,y)=>!b.obstacle.has(key(x,y))&&!living(b).some(e=>e.id!==exclude&&e.x===x&&e.y===y)
      &&!(exclude&&b.player.x===x&&b.player.y===y)&&!(b.ally&&b.ally.x===x&&b.ally.y===y),b.width,b.height);
  }
  function moveInBattle(b,x,y) {
    if(b.phase!=='player'||b.moved||!Number.isInteger(x)||!Number.isInteger(y))return false;
    const path=battlePath(b,b.player,{x,y});if(!path?.length||path.length>b.moveLimit)return false;
    b.player={x,y};b.moved=true;b.selectingMove=false;checkOutcome(null,b);return true;
  }
  function checkOutcome(s,b,endRound=false) {
    if(b.phase==='won'||b.phase==='lost')return b.phase;
    if((s&&s.hp<=0)||(b.ally&&b.ally.hp<=0)){b.phase='lost';b.reason=b.ally?.hp<=0?`${b.ally.name}倒下了。`:'你的气血耗尽了。';return b.phase;}
    const clear=!living(b).length&&!STORY.encounters[b.encounter].waves?.some(w=>w.round>b.round);
    let won=false;
    if(b.goal==='escape')won=distance(b.player,b.exit)===0;
    else if(b.goal==='capture')won=b.captureTurns>=b.limit||(clear&&distance(b.player,b.capture)===0);
    else if(b.goal==='survive'||b.goal==='protect'&&b.limit)won=endRound&&b.round>=b.limit;
    else won=clear;
    if(won){b.phase='won';b.reason=b.goal==='escape'?'已冲出包围！':b.goal==='capture'?'哨台已被你夺下！':b.goal==='survive'||b.goal==='protect'&&b.limit?'援军赶到，守住了！':'对手已全部退去。';}
    else if(endRound&&b.goal==='escape'&&b.round>=b.limit){b.phase='lost';b.reason='追兵封住出口，突围时限已过。';}
    return b.phase;
  }
  function battleObjective(b) {
    if(b.goal==='escape')return`抵达金色出口 · 剩余 ${Math.max(0,b.limit-b.round+1)} 回合`;
    if(b.goal==='capture')return`占住金色哨台 · ${b.captureTurns} / ${b.limit} 回合`;
    if(b.ally)return`保护${b.ally.name} ${b.ally.hp}/${b.ally.maxHp}${b.limit?` · 守到第 ${b.limit} 回合`:` · 剩余 ${living(b).length} 人`}`;
    if(b.goal==='survive')return`守住阵地 · 第 ${b.round} / ${b.limit} 回合`;
    return`击退所有对手 · 剩余 ${living(b).length} 人`;
  }
  function enemyIntent(s,b,e) {
    if(e.stunned)return'破势 · 无法行动';
    if(e.charge)return'将重击红色区域';
    if(e.role==='totem')return'护阵 · 主将减伤 65%';
    if(e.role==='healer'&&b.round%2===0&&living(b).some(a=>a.hp<a.maxHp))return'将为伤者恢复气血';
    if(e.role==='boss'&&b.round%3===0)return'将蓄力，可破势打断';
    const target=enemyTarget(b,e);return`${e.role==='poison'?'施毒':e.role==='ranged'?'放箭':'进攻'} · ${target===b.player?'宇文逸':b.ally.name}${e.poison?` · 中毒 ${e.poison} 层`:''}`;
  }
  function damageEnemy(s,b,e,amount,ignoreShield=false,poise=0) {
    const ward=e.role==='boss'&&living(b).some(v=>v.role==='totem');
    const exposed=e.exposed?(s.discipline==='breaker'?1.5:1.3):1;
    const shield=e.role==='shield'&&!ignoreShield&&!e.exposed ? .55 : 1;
    const damage=Math.max(1,Math.round(amount*(ward?.35:1)*exposed*shield));
    e.hp=Math.max(0,e.hp-damage);let broken=false;
    if(e.hp>0&&e.poiseMax&&!e.exposed&&poise>0){
      e.poise=Math.max(0,e.poise-poise);
      if(e.poise===0){e.stunned=true;e.exposed=true;e.charge=null;broken=true;}
    }
    return{x:e.x,y:e.y,damage,broken,id:e.id};
  }
  function skillDamage(s,b,id) {
    return Math.max(1,Math.round((battleAttack(s,b)+(s.skills[id]-1)*4+(id==='ultimate'?28:id==='sweep'?8:id==='pierce'?5:0))*(id==='poison'?.4:1)
      +(['pierce','sweep'].includes(id)?b.momentum*5:0)));
  }
  function cast(s,b,skill,enemyId) {
    if(b.phase!=='player')return{ok:false,message:'请等待本回合结束。'};
    if(skill==='guard'){b.guard=true;b.momentum=Math.max(0,b.momentum-1);s.mp=Math.min(maxMp(s),s.mp+12);b.phase='enemy';return{ok:true,message:'凝神守势：本回合减伤 60%，恢复 12 真气。'};}
    if(ITEMS[skill]?.category==='medicine'){
      if(b.medicineUsed>=b.medicineMax)return{ok:false,message:`本战的 ${b.medicineMax} 次用药机会已耗尽，试试内功与守势。`};
      if(b.medicineCooldown)return{ok:false,message:'刚刚用过药，需间隔一回合才能再服。'};
      let result;
      if(skill==='antidote'){
        if(!s.bag.antidote)return{ok:false,message:'没有清心解毒散了。'};
        if(!b.poison&&s.hp>=maxHp(s))return{ok:false,message:'你未中毒，气血也已充盈。'};
        const value=Math.min(20,maxHp(s)-s.hp);s.hp+=value;s.bag.antidote--;b.poison=0;b.poisonTurns=0;result={ok:true,value,message:`清心解毒散：清除全部中毒，恢复 ${value} 气血。`};
      }else result=R.useItem(s,skill);
      if(result.ok){b.medicineUsed++;b.medicineCooldown=2;b.phase='enemy';}return result;
    }
    if(skill==='aid'){
      if(!b.ally)return{ok:false,message:'本战没有需要援救的友方。'};
      if(distance(b.player,b.ally)>3)return{ok:false,message:'援救距离为 3 格，请先靠近护送目标。'};
      if(b.cooldowns.aid)return{ok:false,message:'援救还需调息一回合。'};
      if(s.mp<18)return{ok:false,message:'援救需要 18 真气。'};
      if(b.ally.hp===b.ally.maxHp&&!b.ally.poison)return{ok:false,message:'护送目标状态良好。'};
      const value=Math.min(24+R.healing(s),b.ally.maxHp-b.ally.hp);b.ally.hp+=value;b.ally.poison=Math.max(0,b.ally.poison-1);s.mp-=18;b.cooldowns.aid=2;b.phase='enemy';
      return{ok:true,value,target:b.ally,message:`援救${b.ally.name}，恢复 ${value} 气血、清除一层毒。`};
    }
    const spell=SKILLS[skill];if(!spell||!s.skills[skill])return{ok:false,message:'这门招式尚未习得，推进主线后便可领悟。'};
    if(b.cooldowns[skill]>0)return{ok:false,message:`${spell.name}还需调息 ${b.cooldowns[skill]} 回合。`};
    if(s.mp<spell.cost)return{ok:false,message:'真气不足，可服养气丹或凝神守势。'};
    if(skill==='heal'){
      if(s.hp>=maxHp(s)&&!b.poison)return{ok:false,message:'气血充盈，无需调息。'};
      const value=Math.min(R.healing(s),maxHp(s)-s.hp);s.hp+=value;b.poison=Math.max(0,b.poison-1);s.mp-=spell.cost;b.cooldowns.heal=spell.cooldown;b.phase='enemy';
      return{ok:true,value,message:`凝神归元，恢复 ${value} 气血，清除一层中毒。`};
    }
    const enemy=living(b).find(e=>e.id===enemyId);if(!enemy)return{ok:false,message:'请点击敌人施展招式。'};
    if(distance(b.player,enemy)>spell.range)return{ok:false,message:`目标太远。${spell.name}射程 ${spell.range} 格，先移步靠近。`};
    const damage=skillDamage(s,b,skill),targets=skill==='sweep'?living(b).filter(e=>distance(e,enemy)<=1):skill==='ultimate'?living(b).filter(e=>distance(e,enemy)<=2):[enemy];
    const poise=Math.max(0,({strike:13,sweep:10,ultimate:24,pierce:43,poison:4})[skill]+(s.skills[skill]-1)*2+(charm(s).break||0)+(DISCIPLINES[s.discipline]?.break||0)+blessing(b,'break')*8+(skill==='pierce'?b.momentum*5:0));
    s.mp-=spell.cost;if(spell.cooldown)b.cooldowns[skill]=spell.cooldown;
    const hits=targets.map(e=>damageEnemy(s,b,e,damage,['pierce','ultimate','poison'].includes(skill),poise));
    if(skill==='poison'&&enemy.role!=='totem'&&enemy.hp>0){enemy.poison=Math.min(3,enemy.poison+2);enemy.poisonTurns=3+(s.discipline==='venom'?1:0);enemy.poisonPower=poisonPower(s);}
    if(skill==='strike')b.momentum=Math.min(3,b.momentum+(s.style==='swift'?2:1));else if(['sweep','pierce'].includes(skill))b.momentum=0;
    b.phase='enemy';checkOutcome(s,b);
    return{ok:true,damage,targets:hits,message:`${spell.name}命中${targets.map(e=>e.name).join('、')}，造成 ${hits.map(t=>t.damage).join(' / ')} 伤害${hits.some(t=>t.broken)?'；架势击破！':''}${skill==='poison'&&enemy.role!=='totem'?'；毒刃侵脉。':'。'}`};
  }
  function support(s,b) {
    if(b.solo||b.phase==='won'||b.phase==='lost'||b.supportRound===b.round||b.round%2||!s.companion)return null;b.supportRound=b.round;
    if(s.companion==='qingshuang'&&living(b).length){const target=living(b).sort((a,c)=>a.hp-c.hp)[0],hit=damageEnemy(s,b,target,12+s.level*2,true,0);checkOutcome(s,b);return{damage:hit.damage,target,message:`陆青霜援护，破风箭对${target.name}造成 ${hit.damage} 伤害。`};}
    if(s.companion==='mowen'){const value=Math.min(12+s.level*2,maxHp(s)-s.hp);s.hp+=value;return{value,message:`莫问运气护脉，恢复 ${value} 气血。`};}return null;
  }
  function enemyTarget(b,e){return b.ally&&e.role!=='boss'&&distance(e,b.ally)<distance(e,b.player)?b.ally:b.player;}
  function hurt(s,b,e,target,mult=1) {
    const player=target===b.player,protection=player&&!b.solo&&s.companion==='mowen'&&!b.protected?6:0;
    if(protection)b.protected=true;
    const damage=Math.max(1,Math.round((e.attack*(e.raged?1.25:1)*mult-(player?battleDefense(s,b)+protection:3))*(player&&b.guard?.4:1)));
    if(player)s.hp=Math.max(0,s.hp-damage);else target.hp=Math.max(0,target.hp-damage);
    return damage;
  }
  function spawn(s,b,data) {
    if(b.enemies.some(e=>e.id===data[0]))return false;
    const e=makeEnemy(s,b,data),options=[];
    for(let x=0;x<b.width;x++)for(let y=0;y<b.height;y++)if(!b.obstacle.has(key(x,y))&&!living(b).some(v=>v.x===x&&v.y===y)&&distance({x,y},b.player)>0&&(!b.ally||distance({x,y},b.ally)>0))options.push({x,y});
    options.sort((a,c)=>distance(a,e)-distance(c,e));if(!options.length)return false;Object.assign(e,options[0]);b.enemies.push(e);return true;
  }
  function enemyTurn(s,b,id) {
    if(b.phase!=='enemy')return null;
    const e=living(b).find(e=>e.id===id);if(!e||s.hp<=0)return null;let prefix='';
    if(e.poison){const hit=damageEnemy(s,b,e,e.poison*e.poisonPower,true);e.poisonTurns--;if(e.poisonTurns<=0)e.poison=0;prefix=`${e.name}毒发 ${hit.damage} 伤害。`;if(e.hp<=0){checkOutcome(s,b);return{damage:0,message:prefix+'毒发倒下。'};}}
    if(e.stunned){e.stunned=false;e.recoverRound=b.round+1;return{damage:0,message:prefix+`${e.name}架势已破，失去本回合行动；下回合仍可乘虚追击。`};}
    if(e.exposed&&b.round>=e.recoverRound){e.exposed=false;e.poise=e.poiseMax;}
    if(e.role==='totem')return{damage:0,message:prefix+`${e.name}维持护阵，主将减伤 65%。`};
    const info=STORY.encounters[b.encounter];
    if(e.role==='boss'&&!e.raged&&e.hp<=e.maxHp/2){
      e.raged=true;prefix+=`${e.name}变招，攻击增强！`;
      if(info.reinforcements&&!b.summoned.includes(e.id)){
        const base=info.enemies.find(data=>data[0]===e.id);
        b.summoned.push(e.id);spawn(s,b,[`${e.id}-guard`,'增援亲卫',7,5,Math.round(base[4]*.27),Math.round(base[5]*.7),'melee']);prefix+='一名亲卫赶来增援！';
      }
    }
    if(e.charge){
      const targets=[b.player,...(b.ally?[b.ally]:[])].filter(t=>e.charge.some(p=>distance(p,t)===0));e.charge=null;
      let damage=0;for(const target of targets)damage+=hurt(s,b,e,target,1.8);checkOutcome(s,b);
      return{damage,target:targets[0],message:prefix+(targets.length?`${e.name}重击命中${targets.map(t=>t===b.player?'你':t.name).join('、')}，造成 ${damage} 伤害。`:`你已避开剑势，${e.name}的重击落空！`)};
    }
    if(e.role==='boss'&&b.round%3===0){
      e.charge=[];for(let x=0;x<b.width;x++)for(let y=0;y<b.height;y++)if(info.pattern==='line'?y===b.player.y:info.pattern==='cross'?x===b.player.x||y===b.player.y:distance({x,y},b.player)<=1)e.charge.push({x,y});
      return{damage:0,telegraph:true,message:prefix+`${e.name}蓄势！下一回合重击红色区域，移动或破势可化解。`};
    }
    if(e.role==='healer'&&b.round%2===0){
      const target=living(b).filter(v=>v.role!=='totem'&&v.hp<v.maxHp).sort((a,c)=>a.hp/a.maxHp-c.hp/c.maxHp)[0];
      if(target){const value=Math.min(Math.round(target.maxHp*.15)+12,target.maxHp-target.hp);target.hp+=value;return{damage:0,message:prefix+`${e.name}替${target.name}恢复 ${value} 气血。`};}
    }
    const target=enemyTarget(b,e),range=['ranged','poison','healer'].includes(e.role)?3:1;
    if(distance(e,target)>range){
      const options=[];for(let x=0;x<b.width;x++)for(let y=0;y<b.height;y++){
        const d=distance({x,y},target);if(d<1||d>range)continue;const p=battlePath(b,e,{x,y},e.id);if(p)options.push(p);
      }
      options.sort((a,c)=>a.length-c.length);if(options.length){const p=options[0],step=p[Math.min(2,p.length)-1];if(step){e.x=step.x;e.y=step.y;}}
    }
    if(distance(e,target)<=range){
      const damage=hurt(s,b,e,target),who=target===b.player?'你':target.name;
      if(e.role==='poison'){const receiver=target===b.player?b:target;receiver.poison=Math.min(3,receiver.poison+1);receiver.poisonTurns=3;}
      let counter='';if(target===b.player&&b.guard&&s.style==='iron'&&range===1){const hit=damageEnemy(s,b,e,8+s.level*2,true);counter=`磐石反击 ${hit.damage} 伤害。`;}
      checkOutcome(s,b);return{damage,target,message:prefix+`${e.name}${e.role==='poison'?'施毒':e.role==='ranged'?'放箭':'出招'}，${who}受到 ${damage} 伤害。`+counter};
    }
    return{damage:0,message:prefix+`${e.name}向${target===b.player?'你':target.name}逼近。`};
  }
  function nextRound(s,b) {
    if(b.phase!=='enemy')return;
    const messages=[];
    for(const receiver of[b,...(b.ally?[b.ally]:[])])if(receiver.poison){
      const damage=receiver.poison*4;if(receiver===b)s.hp=Math.max(0,s.hp-damage);else receiver.hp=Math.max(0,receiver.hp-damage);
      receiver.poisonTurns--;if(receiver.poisonTurns<=0)receiver.poison=0;messages.push(`${receiver===b?'你':receiver.name}毒发，损失 ${damage} 气血。`);
    }
    if(b.fire.length){
      if(b.fire.some(p=>distance(p,b.player)===0)){const damage=Math.round((22+STORY.encounters[b.encounter].level*2)*DIFFICULTIES[s.difficulty].attack*(b.guard?.6:1));s.hp=Math.max(0,s.hp-damage);messages.push(`地火喷发，你损失 ${damage} 气血。`);}
      else messages.push('地火喷发，你已移出火地。');b.fire=[];
    }
    if(b.goal==='capture')b.captureTurns=distance(b.player,b.capture)===0?b.captureTurns+1:0;
    checkOutcome(s,b,true);if(['won','lost'].includes(b.phase)){b.log=messages.join('')+b.reason;return;}
    b.round++;b.phase='player';b.moved=false;b.selectingMove=false;b.guard=false;b.protected=false;s.mp=Math.min(maxMp(s),s.mp+qiRegen(s,b));
    for(const id of Object.keys(b.cooldowns))b.cooldowns[id]=Math.max(0,b.cooldowns[id]-1);b.medicineCooldown=Math.max(0,b.medicineCooldown-1);
    const info=STORY.encounters[b.encounter];
    for(const wave of info.waves||[])if(wave.round===b.round){for(const data of wave.enemies)spawn(s,b,data);messages.push(`第 ${b.round} 回合援军入场！`);}
    if(info.hazard==='fire'&&b.round%3===0){
      for(let x=0;x<b.width;x++)for(let y=0;y<b.height;y++)if((y===b.player.y||x===(b.round+2)%8)&&!b.obstacle.has(key(x,y))&&(!b.ally||distance({x,y},b.ally)>0))b.fire.push({x,y});
      messages.push('地火亮起：本回合结束会爆发，先移出橙色区域！');
    }
    if(messages.length)b.log=messages.join('');
  }
  return{makeBattle,encounterFor,living,battlePath,moveInBattle,cast,support,enemyTurn,nextRound,checkOutcome,battleObjective,enemyIntent,moveLimit,qiRegen,battleAttack,battleDefense,skillDamage,roleNames,blessing};
}
if(typeof module!=='undefined'&&module.exports)module.exports=createCombat;
