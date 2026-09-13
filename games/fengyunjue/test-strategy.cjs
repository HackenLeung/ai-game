'use strict';
// Test-only player: chooses legal moves and actions, never changes combat outcomes.
const R=require('./rules.js');
const terminal=b=>['won','lost'].includes(b.phase);
const importance=e=>({totem:1.45,healer:1.5,poison:1.2,ranged:1.1})[e.role]||1;
const toGoal=(b,pos,goal)=>R.battlePath(b,pos,goal)?.length??R.distance(pos,goal)+18;
function choices(s,b){
  const spells=['strike','pierce','poison','sweep','ultimate'].filter(id=>s.skills[id]&&s.mp>=R.SKILLS[id].cost&&!b.cooldowns[id]);
  const positions=[{...b.player}];
  if(!b.moved)for(let x=0;x<b.width;x++)for(let y=0;y<b.height;y++){
    const route=R.battlePath(b,b.player,{x,y});if(route?.length&&route.length<=b.moveLimit)positions.push({x,y});
  }
  const goal=b.exit||b.capture,threat=pos=>R.living(b).reduce((sum,e)=>sum+(e.stunned||e.role==='totem'?0:Math.max(1,e.attack-R.battleDefense(s,b))*(R.distance(e,pos)<=(['ranged','poison','healer'].includes(e.role)?5:3)?.9:.08)),0);
  const near=pos=>Math.min(...R.living(b).map(e=>R.distance(pos,e)),20);
  const danger=pos=>[...b.fire,...R.living(b).flatMap(e=>e.charge||[])].some(p=>R.distance(p,pos)===0);
  function estimate(pos){
    const attack=Math.max(0,...R.living(b).map(e=>importance(e)*Math.max(0,60-R.distance(pos,e)*12)));
    return attack-threat(pos)*.9-(danger(pos)?100:0)-(goal?toGoal(b,pos,goal)*30:near(pos)*2)+(b.ally&&R.distance(pos,b.ally)<=3&&b.ally.hp<b.ally.maxHp-30?25:0);
  }
  positions.sort((a,c)=>estimate(c)-estimate(a));
  const shortlist=positions.slice(0,7);if(!shortlist.some(p=>R.distance(p,b.player)===0))shortlist.push({...b.player});
  const result=[];
  for(const pos of shortlist){
    for(const skill of['guard','heal','aid','potion','elixir','antidote','qi'])result.push({pos,skill});
    for(const skill of spells)for(const enemy of R.living(b))if(R.distance(pos,enemy)<=R.SKILLS[skill].range)result.push({pos,skill,id:enemy.id});
    if(b.exit&&R.distance(pos,b.exit)===0)result.push({pos,skill:'guard'});
  }
  return result;
}
function score(s,b,nextS,nextB,action){
  if(nextB.phase==='won')return 100000+nextS.hp+(nextB.ally?.hp||0);
  if(nextB.phase==='lost')return-100000;
  let value=(nextS.hp-s.hp)*1.13+(nextS.mp-s.mp)*.22+((nextB.ally?.hp||0)-(b.ally?.hp||0))*1.65;
  for(const enemy of b.enemies){
    const next=nextB.enemies.find(e=>e.id===enemy.id);
    value+=(enemy.hp-next.hp)*importance(enemy)+(enemy.hp>0&&next.hp<=0?22:0);
    value+=(enemy.poise-next.poise)*.2+(next.exposed&&!enemy.exposed?12:0);
    value+=(next.poison*next.poisonTurns*next.poisonPower-enemy.poison*enemy.poisonTurns*enemy.poisonPower)*.36;
  }
  value-=(nextB.poison*nextB.poisonTurns-b.poison*b.poisonTurns)*4;
  if(R.ITEMS[action.skill]?.category==='medicine')value-=action.skill==='elixir'?24:action.skill==='qi'?8:14;
  if(b.exit)value+=(toGoal(b,b.player,b.exit)-toGoal(nextB,nextB.player,b.exit))*38;
  if(b.capture)value+=(R.distance(b.player,b.capture)-R.distance(nextB.player,b.capture))*20+(nextB.captureTurns-b.captureTurns)*60;
  if(b.goal==='survive'||b.goal==='protect'&&b.limit)value+=12;
  if(nextB.ally&&R.distance(nextB.player,nextB.ally)>4)value-=9;
  const distance=Math.min(...R.living(nextB).map(e=>R.distance(nextB.player,e)),12);
  if(!b.exit&&!b.capture&&b.goal!=='survive')value-=distance*.6;
  return value;
}
function choose(s,b){
  let best=null;
  for(const action of choices(s,b)){
    const nextS=structuredClone(s),nextB=structuredClone(b);
    if(R.distance(action.pos,nextB.player)&&!R.moveInBattle(nextB,action.pos.x,action.pos.y))continue;
    if(nextB.phase!=='won'){
      const result=R.cast(nextS,nextB,action.skill,action.id);if(!result.ok)continue;
      R.support(nextS,nextB);
      for(const enemy of R.living(nextB)){if(terminal(nextB))break;R.enemyTurn(nextS,nextB,enemy.id);}
      if(!terminal(nextB))R.nextRound(nextS,nextB);
    }
    const value=score(s,b,nextS,nextB,action);
    if(!best||value>best.value)best={...action,value};
  }
  if(!best)throw new Error('No legal combat action');return best;
}
function run(s,id,context,limit=90){
  const b=R.makeBattle(s,id,context),actions=[];
  while(!terminal(b)&&b.round<=limit){
    const action=choose(s,b);actions.push(action.skill);
    if(R.distance(action.pos,b.player))R.moveInBattle(b,action.pos.x,action.pos.y);
    if(terminal(b))break;
    const result=R.cast(s,b,action.skill,action.id);if(!result.ok)throw new Error(result.message);
    R.support(s,b);for(const e of R.living(b)){if(terminal(b))break;R.enemyTurn(s,b,e.id);}if(!terminal(b))R.nextRound(s,b);
  }
  return{won:b.phase==='won',b,actions,rounds:b.round,hp:s.hp,mp:s.mp,medicines:b.medicineUsed};
}
function equip(s){
  for(const id of['wufeng','qingming','blacksteel','steel','wood'])if(s.bag[id]){R.useItem(s,id);break;}
  for(const id of['robe','armor','vest','cloth'])if(s.bag[id]){R.useItem(s,id);break;}
  while(s.bag.manual)R.useItem(s,'manual');
  for(const id of['pierce','strike','heal','poison','sweep','ultimate'])if(s.skills[id]<2)R.learn(s,id);
  for(const id of['pierce','heal','strike','ultimate','poison','sweep'])while(s.skills[id]&&s.skills[id]<3&&s.insight>=R.learnCost(s,id))R.learn(s,id);
  for(const id of['potion','qi','antidote'])while((s.bag[id]||0)<3&&s.gold>=R.ITEMS[id].price){s.gold-=R.ITEMS[id].price;s.bag[id]=(s.bag[id]||0)+1;}
  if(s.stage>=R.STORY.index('city-arrival'))while((s.bag.elixir||0)<2&&s.gold>=R.ITEMS.elixir.price){s.gold-=R.ITEMS.elixir.price;s.bag.elixir=(s.bag.elixir||0)+1;}
}
module.exports={choose,run,equip,terminal};
if(require.main===module){
  const s=R.createState();let fights=0,total=0;
  while(s.stage<R.terminal){
    const q=R.STORY.quests[s.stage];equip(s);
    const encounters=q.encounter?[R.encounterFor(s,q)]:q.targets?q.targets.map(id=>R.STORY.sites[q.location].find(p=>p.id===id)?.encounter).filter(Boolean):[];
    for(const id of encounters){
      s.hp=R.maxHp(s);s.mp=R.maxMp(s);const result=run(s,id);total+=result.rounds;fights++;
      console.log(`${result.won?'WIN':'LOSS'} ${q.id}/${id} level=${s.level} hp=${result.hp} rounds=${result.rounds} medicine=${result.medicines} actions=${[...new Set(result.actions)].join(',')}`);
      if(!result.won){console.log(result.b.reason,result.b.log);process.exitCode=1;break;}
      if(q.targets){R.reward(s,R.STORY.encounters[id].reward||{});R.recordObjective(s,R.STORY.encounters[id].objective);}
    }
    if(process.exitCode)break;
    if(q.targets){for(const id of q.targets)R.recordObjective(s,id);}
    else R.completeQuest(s,q.id,q.id==='first-style'?'focus':q.id==='river-plan'?'ford':q.id==='temple-discipline'?'breaker':q.id==='valley-route'?'road':q.choices?.[0].id);
  }
  console.log({fights,totalRounds:total,stage:s.stage,level:s.level,gold:s.gold});
}
