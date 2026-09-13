'use strict';
const assert=require('node:assert/strict');
const R=require('./game.js'),S=R.STORY;
let checks=0,failures=0;
function check(name,fn){try{fn();checks++;console.log('PASS '+name);}catch(error){failures++;console.error('FAIL '+name+'\n'+error.stack);}}
function hero(level=8){const s=R.createState();s.level=level;s.stage=R.terminal;s.hp=R.maxHp(s);s.mp=R.maxMp(s);s.skills={strike:3,sweep:3,heal:3,ultimate:2,pierce:3,poison:2};return s;}
function endTurn(s,b){for(const e of R.living(b)){if(b.phase!=='enemy')break;R.enemyTurn(s,b,e.id);}R.nextRound(s,b);}

check('49 ordered main stages, 9 maps, 3 chapters and every target are reachable by progression',()=>{
  assert.equal(R.terminal,49);assert.equal(Object.keys(S.locations).length,9);assert.equal(S.chapters.length,3);
  assert.equal(new Set(S.quests.map(q=>q.id)).size,S.quests.length);
  for(const [stage,q]of S.quests.entries()){
    assert.ok(S.locations[q.location].unlock<=stage,q.id);
    if(q.kind==='free')continue;
    assert.ok(stage>=S.chapters[q.chapter].from&&stage<=S.chapters[q.chapter].to);
    for(const id of q.targets||[q.target]){const site=S.sites[q.location].find(s=>s.id===id);assert.ok(site,q.id+'/'+id);assert.ok((site.min??0)<=stage&&(site.max??R.terminal)>=stage);assert.ok(!site.active||site.active===q.id);}
    if(q.encounter)assert.ok(S.encounters[q.encounter]);if(q.puzzle)assert.ok(S.puzzles[q.puzzle]);
    for(const c of[q,...q.choices||[]])for(const id of Object.keys(c.rewards.items||{}))assert.ok(R.ITEMS[id],id);
  }
});
check('battle rosters, roles, waves and subgroup rewards reference valid content',()=>{
  for(const[id,info]of Object.entries(S.encounters)){
    const units=[...info.enemies,...(info.waves||[]).flatMap(w=>w.enemies)];assert.equal(new Set(units.map(e=>e[0])).size,units.length,id);
    for(const e of units){assert.ok(e[2]>=0&&e[2]<8&&e[3]>=0&&e[3]<7);assert.ok(e[4]>0&&e[5]>=0);assert.ok(R.roleNames[e[6]||'melee']);}
    if(info.objective)assert.ok(S.quests.some(q=>q.targets?.includes(info.objective)));
    const b=R.makeBattle(hero(),id);assert.ok(!b.obstacle.has(R.key(b.player.x,b.player.y)));
    for(const e of b.enemies)assert.ok(!b.obstacle.has(R.key(e.x,e.y)),id+'/'+e.id);
  }
});
check('all nine-lamp puzzles require real interaction and have valid solutions',()=>{
  for(const p of Object.values(S.puzzles).filter(p=>p.kind==='lights')){
    const initial=R.initialLights(p);assert.ok(!initial.every(Boolean));const solution=R.lightSolution(initial);assert.ok(solution.length>=3);
    assert.ok(solution.reduce((cells,i)=>R.toggleLights(cells,i),initial).every(Boolean));
    assert.deepEqual(R.toggleLights(R.toggleLights(initial,4),4),initial);
  }
});
check('legacy v1 saves keep items and map each old objective by identity',()=>{
  for(const[old,id]of[[0,'letter'],[1,'herbs'],[2,'medicine'],[3,'bamboo-fight'],[4,'chapter-one-end'],[5,'city-arrival']]){
    const raw={...R.createState(),version:1,stage:old,level:4,gold:918,weapon:'steel',bag:{wood:1,steel:1,potion:17,manual:2,jade:1},chest:true,herbs:old===1?['herb1']:[]};
    const s=R.normalizeState(raw);assert.equal(S.quests[s.stage].id,id);assert.equal(s.version,3);assert.equal(s.gold,918);assert.equal(s.bag.potion,17);assert.equal(s.weapon,'steel');assert.ok(s.opened.includes('chest'));
  }
});
check('every v2 stage migrates without restarting a completed chapter or losing gear',()=>{
  for(const[stage,id]of S.legacyQuestIds.entries()){
    const s=R.normalizeState({...R.createState(),version:2,stage,level:9,bag:{wufeng:1,robe:1,potion:8},weapon:'wufeng',armor:'robe'});
    assert.equal(S.quests[s.stage].id,id);assert.equal(s.weapon,'wufeng');assert.equal(s.armor,'robe');assert.equal(s.bag.potion,8);
    if(stage===26){assert.equal(s.stage,49);assert.ok(s.skills.pierce&&s.skills.poison&&s.skills.ultimate);assert.equal(s.companions.length,2);}
  }
});
check('save validation bounds values and preserves a partial multi-target objective',()=>{
  assert.equal(R.normalizeState(null),null);assert.equal(R.normalizeState({version:99}),null);
  const s=R.normalizeState({...hero(),stage:S.index('camp-outworks'),location:'ruins',progress:{'camp-outworks':['watchtower','fake','watchtower']},gold:1e20,bag:{wood:1,potion:-1,unknown:99,turtleCharm:1},accessory:'turtleCharm',hp:1e10});
  assert.equal(s.gold,999999);assert.equal(s.bag.unknown,undefined);assert.equal(s.bag.potion,undefined);assert.equal(s.hp,R.maxHp(s));assert.deepEqual(s.progress['camp-outworks'],['watchtower']);
  assert.deepEqual(R.normalizeState(JSON.parse(JSON.stringify(s))),s);
});
check('quest rewards, consumable requirements and grouped objectives are idempotent',()=>{
  const s=R.createState();assert.equal(R.completeQuest(s,'herbs').ok,false);R.completeQuest(s,'letter');const gold=s.gold;assert.equal(R.completeQuest(s,'letter').ok,false);assert.equal(s.gold,gold);
  assert.equal(R.completeQuest(s,'herbs').ok,false);assert.equal(R.recordObjective(s,'herb1').partial,true);assert.equal(R.recordObjective(s,'herb1').ok,false);
  R.recordObjective(s,'herb2');R.recordObjective(s,'herb3');assert.equal(s.bag.herb,3);R.completeQuest(s,'medicine');assert.equal(s.bag.herb,0);assert.equal(R.completeQuest(s,'medicine').ok,false);
});
check('all 49 story rewards reach three chapter endings and persist all choices',()=>{
  const s=R.createState();let endings=0;
  while(s.stage<R.terminal){const q=S.quests[s.stage];let result;if(q.targets)for(const id of q.targets)result=R.recordObjective(s,id);else result=R.completeQuest(s,q.id,q.choices?.[0].id);assert.ok(result.ok,q.id);if(result.chapterEnd)endings++;}
  assert.equal(endings,3);assert.equal(s.skills.pierce,1);assert.equal(s.skills.poison,1);assert.equal(s.skills.ultimate,1);assert.equal(s.companions.length,2);assert.equal(s.bag.wufeng,1);
  const reloaded=R.normalizeState(s);assert.equal(reloaded.stage,49);assert.deepEqual(reloaded.progress,s.progress);assert.deepEqual(reloaded.choices,s.choices);assert.equal(R.completeQuest(s,'free-roam').ok,false);
});
check('route decisions select different encounters and migrate old unspecified routes safely',()=>{
  const s=hero(),q=S.quests[S.index('bamboo-fight')];assert.equal(R.encounterFor(s,q),'bandits');s.choices['river-plan']='ridge';assert.equal(R.encounterFor(s,q),'ridgeBandits');s.choices['river-plan']='ford';assert.equal(R.encounterFor(s,q),'fordBandits');
  s.choices['valley-route']='cliff';assert.equal(R.encounterFor(s,S.quests[S.index('valley-ambush')]),'cliffAmbush');
});
check('travel gates follow quest identifiers after the inserted stages',()=>{
  const s=R.createState();for(const[id,location]of Object.entries(S.locations)){s.stage=Math.max(0,location.unlock-1);if(location.unlock)assert.equal(R.canTravel(s,id),false);s.stage=location.unlock;assert.equal(R.canTravel(s,id),true);}assert.equal(R.canTravel(s,'unknown'),false);
});
check('pathfinding never crosses blocked cells and reports an unreachable destination',()=>{
  const blocked=new Set(['1,0','1,1','1,2']),path=R.findPath({x:0,y:0},{x:2,y:0},(x,y)=>!blocked.has(R.key(x,y)),4,4);assert.equal(path.length,8);assert.deepEqual(path.at(-1),{x:2,y:0});assert.equal(R.findPath({x:0,y:0},{x:2,y:0},()=>false,4,4),null);
});
check('equipment and accessories have real tradeoffs and do not delete old equipment',()=>{
  const s=R.createState(),attack=R.attack(s);s.bag.steel=1;R.useItem(s,'steel');assert.equal(R.attack(s),attack+8);assert.equal(s.bag.wood,1);
  s.bag.turtleCharm=1;R.useItem(s,'turtleCharm');assert.equal(R.maxHp(s),160);assert.equal(R.defense(s),3);assert.equal(R.attack(s),attack+4);s.hp=160;s.bag.hawkCharm=1;R.useItem(s,'hawkCharm');assert.equal(s.hp,130);assert.equal(R.moveLimit(s),4);assert.equal(R.defense(s),-2);
});
check('refining and crafting spend affordable costs once and store upgrades on each weapon',()=>{
  const s=R.createState();s.gold=510;s.bag.ore=8;s.bag.merit=3;s.bag.steel=1;R.useItem(s,'steel');const atk=R.attack(s);
  for(let i=0;i<3;i++)assert.ok(R.refine(s).ok);assert.equal(R.attack(s),atk+9);assert.equal(R.refine(s).ok,false);assert.ok(R.craft(s,'moonCharm').ok);assert.equal(s.gold,0);assert.equal(s.bag.merit,0);assert.equal(s.bag.ore,0);assert.equal(R.craft(s,'moonCharm').ok,false);R.useItem(s,'wood');assert.equal(R.attack(s),22);
});
check('training becomes progressively more expensive and cannot buy locked skills',()=>{
  const s=R.createState();s.insight=10;for(let rank=1;rank<5;rank++){assert.equal(R.learnCost(s,'strike'),rank);assert.ok(R.learn(s,'strike').ok);}assert.equal(s.insight,0);assert.equal(s.skills.strike,5);assert.equal(R.learn(s,'ultimate').ok,false);assert.equal(R.learn(s,'strike').ok,false);
});
check('level ups restore a normal adventurer while keeping medicine and manuals finite',()=>{
  const s=R.createState();s.hp=12;s.mp=1;assert.equal(R.gain(s,270,65),2);assert.equal(s.level,3);assert.equal(s.xp,0);assert.equal(s.hp,R.maxHp(s));assert.equal(s.mp,R.maxMp(s));assert.equal(s.gold,193);
  assert.equal(R.useItem(s,'potion').ok,false);s.hp=R.maxHp(s)-10;assert.equal(R.useItem(s,'potion').value,10);s.bag.manual=1;R.useItem(s,'manual');assert.equal(R.useItem(s,'manual').ok,false);
});
check('styles, difficulty and blessings change move, resource and enemy budgets',()=>{
  const s=hero();s.style='swift';assert.equal(R.makeBattle(s).moveLimit,4);s.style='iron';assert.equal(R.makeBattle(s).moveLimit,2);s.style='focus';const ordinary=R.makeBattle(s);assert.equal(R.qiRegen(s,ordinary),7);
  s.difficulty='heroic';const hard=R.makeBattle(s);assert.ok(hard.enemies[0].hp>ordinary.enemies[0].hp);assert.ok(hard.enemies[0].attack>ordinary.enemies[0].attack);assert.equal(hard.medicineMax,2);
  s.expedition.blessings=['edge','breath','supply'];const tower=R.makeBattle(s,'fordBandits',{kind:'tower',floor:1});assert.equal(R.qiRegen(s,tower),9);assert.equal(tower.medicineMax,3);assert.equal(R.battleAttack(s,tower),R.attack(s)+7);
});
check('a turn allows one legal movement followed by one action; rejected moves spend nothing',()=>{
  const s=R.createState(),b=R.makeBattle(s);assert.equal(R.moveInBattle(b,3,1),false);assert.equal(R.moveInBattle(b,7,6),false);assert.equal(R.moveInBattle(b,2,4),true);assert.equal(R.moveInBattle(b,2,3),false);
  const round=b.round;R.nextRound(s,b);assert.equal(b.round,round);R.cast(s,b,'guard');assert.equal(R.cast(s,b,'guard').ok,false);R.nextRound(s,b);assert.equal(b.moved,false);
});
check('out-of-range spells, missing qi and unlearned skills spend neither resources nor action',()=>{
  const s=R.createState(),b=R.makeBattle(s);const mp=s.mp;assert.equal(R.cast(s,b,'strike',b.enemies[0].id).ok,false);assert.equal(R.cast(s,b,'pierce',b.enemies[0].id).ok,false);assert.equal(s.mp,mp);assert.equal(b.phase,'player');b.player={x:4,y:3};s.mp=1;assert.equal(R.cast(s,b,'sweep',b.enemies[0].id).ok,false);assert.equal(s.mp,1);
});
check('area attacks affect only the advertised radius; skill ranks no longer add nine damage',()=>{
  const s=hero(),b=R.makeBattle(s,'fordBandits');b.player={x:4,y:3};b.enemies[1].x=5;b.enemies[1].y=4;b.enemies[2].x=7;b.enemies[2].y=6;const hp=b.enemies[2].hp;const hit=R.cast(s,b,'sweep',b.enemies[0].id);assert.equal(hit.targets.length,2);assert.equal(b.enemies[2].hp,hp);
  const next=R.makeBattle(s),base=R.skillDamage(s,next,'strike');s.skills.strike++;assert.equal(R.skillDamage(s,next,'strike')-base,4);
});
check('piercing breaks a charged enemy, cancels the hit and exposes one follow-up turn',()=>{
  const s=hero(),b=R.makeBattle(s,'mirror'),e=b.enemies[0];b.player={x:4,y:3};e.poise=5;e.charge=[{...b.player}];const hit=R.cast(s,b,'pierce',e.id);assert.ok(hit.targets[0].broken);assert.equal(e.charge,null);const hp=s.hp;R.enemyTurn(s,b,e.id);assert.equal(s.hp,hp);assert.ok(e.exposed);R.nextRound(s,b);
  const base=R.skillDamage(s,b,'strike'),follow=R.cast(s,b,'strike',e.id);assert.ok(follow.targets[0].damage>base);R.enemyTurn(s,b,e.id);assert.equal(e.exposed,false);assert.equal(e.poise,e.poiseMax);
});
check('a living totem protects its boss while poison cannot be applied to the totem',()=>{
  const s=hero(),b=R.makeBattle(s,'heart');b.player={x:4,y:3};const base=R.skillDamage(s,b,'strike'),hit=R.cast(s,b,'strike','heart');assert.equal(hit.targets[0].damage,Math.round(base*.35));
  const c=R.makeBattle(s,'heart');c.player={x:4,y:1};R.cast(s,c,'poison','heart-pillar1');assert.equal(c.enemies.find(e=>e.id==='heart-pillar1').poison,0);
});
check('poison ticks, stacks and can finish the final opponent before it acts',()=>{
  const s=hero(),b=R.makeBattle(s,'spar');b.player={x:3,y:3};const e=b.enemies[0];R.cast(s,b,'poison',e.id);assert.equal(e.poison,2);const hp=e.hp;R.enemyTurn(s,b,e.id);assert.ok(e.hp<hp);assert.equal(e.poisonTurns,2);
  R.nextRound(s,b);R.cast(s,b,'guard');e.hp=1;R.enemyTurn(s,b,e.id);assert.equal(e.hp,0);assert.equal(b.phase,'won');
});
check('medicine has a shared cap, cooldown and no charge for ineffective use',()=>{
  const s=hero(),b=R.makeBattle(s);s.bag.potion=9;s.bag.qi=9;assert.equal(R.cast(s,b,'potion').ok,false);assert.equal(b.medicineUsed,0);
  for(let i=0;i<3;i++){s.hp=20;assert.ok(R.cast(s,b,'potion').ok);R.nextRound(s,b);assert.equal(R.cast(s,b,'qi').ok,false);R.cast(s,b,'guard');R.nextRound(s,b);}
  assert.equal(b.medicineUsed,3);s.hp=10;assert.equal(R.cast(s,b,'potion').ok,false);assert.equal(s.bag.potion,6);
});
check('antidote removes all poison and healing has two intervening cooldown turns',()=>{
  const s=hero(),b=R.makeBattle(s);s.bag.antidote=1;b.poison=3;b.poisonTurns=3;s.hp=30;assert.ok(R.cast(s,b,'antidote').ok);assert.equal(b.poison,0);assert.equal(s.bag.antidote,0);R.nextRound(s,b);assert.ok(R.cast(s,b,'heal').ok);
  for(let i=0;i<2;i++){R.nextRound(s,b);assert.equal(R.cast(s,b,'heal').ok,false);R.cast(s,b,'guard');}R.nextRound(s,b);assert.ok(R.cast(s,b,'heal').ok);
});
check('guard recovers qi, reduces damage and allows the iron style to counterattack',()=>{
  const s=R.createState();s.style='iron';s.mp=0;const b=R.makeBattle(s,'spar'),e=b.enemies[0];e.x=2;e.y=4;const hp=e.hp;R.cast(s,b,'guard');assert.equal(s.mp,12);const hit=R.enemyTurn(s,b,e.id);assert.ok(hit.damage<e.attack);assert.ok(e.hp<hp);R.nextRound(s,b);assert.equal(s.mp,16);assert.equal(b.guard,false);
});
check('an escort can die independently of the hero and ends the battle',()=>{
  const s=hero(),b=R.makeBattle(s,'prison'),e=b.enemies[0];b.player={x:6,y:0};e.x=2;e.y=5;e.attack=300;b.ally.hp=1;const hp=s.hp;R.cast(s,b,'guard');R.enemyTurn(s,b,e.id);assert.equal(b.phase,'lost');assert.equal(b.ally.hp,0);assert.equal(s.hp,hp);assert.equal(R.cast(s,b,'aid').ok,false);
});
check('aid has range, resource and cooldown costs and treats the escort poison',()=>{
  const s=hero(),b=R.makeBattle(s,'escort');b.ally.hp=20;b.ally.poison=2;b.ally.poisonTurns=3;b.player={x:6,y:0};assert.equal(R.cast(s,b,'aid').ok,false);b.player={x:1,y:4};const mp=s.mp;assert.ok(R.cast(s,b,'aid').ok);assert.ok(b.ally.hp>20);assert.equal(b.ally.poison,1);assert.equal(s.mp,mp-18);R.nextRound(s,b);assert.equal(R.cast(s,b,'aid').ok,false);
});
check('survival requires six complete rounds even after clearing early waves',()=>{
  const s=hero(),b=R.makeBattle(s,'bridge');for(let round=1;round<=6;round++){for(const e of b.enemies)e.hp=0;R.cast(s,b,'guard');R.nextRound(s,b);assert.equal(b.phase,round===6?'won':'player');}assert.equal(b.round,6);assert.ok(b.enemies.some(e=>e.id==='bridge3'));assert.ok(b.enemies.some(e=>e.id==='bridge4'));
});
check('capture tracks consecutive rounds and resets when leaving the marked tile',()=>{
  const s=hero(),b=R.makeBattle(s,'outpost');b.player={...b.capture};for(let i=0;i<2;i++){R.cast(s,b,'guard');R.nextRound(s,b);}assert.equal(b.captureTurns,2);R.moveInBattle(b,4,4);R.cast(s,b,'guard');R.nextRound(s,b);assert.equal(b.captureTurns,0);R.moveInBattle(b,4,3);for(let i=0;i<3;i++){R.cast(s,b,'guard');R.nextRound(s,b);}assert.equal(b.phase,'won');
});
check('escape is a navigable corridor, killing everyone is insufficient, and movement can win',()=>{
  const s=hero(),b=R.makeBattle(s,'escape');for(const e of b.enemies)e.hp=0;const path=R.battlePath(b,b.player,b.exit);assert.ok(path.length>R.distance(b.player,b.exit));R.checkOutcome(s,b);assert.equal(b.phase,'player');b.player={x:6,y:6};assert.ok(R.moveInBattle(b,7,6));assert.equal(b.phase,'won');assert.equal(R.cast(s,b,'guard').ok,false);
  const c=R.makeBattle(s,'escape');c.round=9;R.cast(s,c,'guard');R.nextRound(s,c);assert.equal(c.phase,'lost');assert.match(c.reason,/时限/);
});
check('healers restore allies, bosses telegraph and reinforcements occupy valid unique tiles',()=>{
  const s=hero(),b=R.makeBattle(s,'venom');b.round=2;b.enemies[0].hp=40;R.cast(s,b,'guard');R.enemyTurn(s,b,'v-healer');assert.ok(b.enemies[0].hp>40);
  const c=R.makeBattle(s,'chief'),boss=c.enemies[0];boss.hp=Math.floor(boss.maxHp/2);c.round=3;R.cast(s,c,'guard');const result=R.enemyTurn(s,c,boss.id);assert.ok(result.telegraph);assert.ok(boss.raged);assert.equal(c.summoned.length,1);
  const positions=[R.key(c.player.x,c.player.y),...R.living(c).map(e=>R.key(e.x,e.y))];assert.equal(new Set(positions).size,positions.length);for(const e of R.living(c))assert.ok(!c.obstacle.has(R.key(e.x,e.y)));
});
check('fire is telegraphed before a player action and can be avoided',()=>{
  const s=hero(),b=R.makeBattle(s,'cliffAmbush');b.round=2;R.cast(s,b,'guard');R.nextRound(s,b);assert.ok(b.fire.length);assert.ok(b.fire.some(p=>R.distance(p,b.player)===0));
  let safe;for(let x=0;x<8;x++)for(let y=0;y<7;y++){const route=R.battlePath(b,b.player,{x,y});if(route?.length&&route.length<=b.moveLimit&&!b.fire.some(p=>p.x===x&&p.y===y))safe={x,y};}
  assert.ok(safe);R.moveInBattle(b,safe.x,safe.y);const hp=s.hp;R.cast(s,b,'guard');R.nextRound(s,b);assert.equal(s.hp,hp);assert.equal(b.fire.length,0);
});
check('companions can finish an encounter but cannot intervene in a solo duel',()=>{
  const s=hero();s.companion='qingshuang';const b=R.makeBattle(s,'spar');b.round=2;b.enemies[0].hp=1;b.phase='enemy';assert.ok(R.support(s,b).damage);assert.equal(b.phase,'won');assert.equal(R.support(s,b),null);const c=R.makeBattle(s,'mirror');c.round=2;assert.equal(R.support(s,c),null);
});
check('contracts unlock in order, scale to the player and cannot award rewards twice',()=>{
  const s=hero(),stage=s.stage;assert.equal(R.finishContract(s,'c2').ok,false);const base=R.makeBattle(s,'venom'),hard=R.makeBattle(s,'venom',{kind:'contract',id:'c1'});assert.ok(hard.enemies[0].maxHp>base.enemies[0].maxHp);assert.ok(R.finishContract(s,'c1').ok);const gold=s.gold;assert.equal(R.finishContract(s,'c1').ok,false);assert.equal(s.gold,gold);assert.equal(s.stage,stage);assert.ok(R.finishContract(s,'c2').ok);
});
check('expedition victory carries depleted resources through a level up and saves pending choices',()=>{
  const s=hero();assert.ok(R.startExpedition(s).ok);s.hp=37;s.mp=2;s.xp=R.xpNeed(s)-1;const result=R.advanceExpedition(s);assert.ok(result.levels);assert.equal(s.hp,37);assert.equal(s.mp,2);assert.equal(s.expedition.floor,2);assert.equal(s.expedition.best,1);assert.equal(R.advanceExpedition(s).ok,false);
  const restored=R.normalizeState(JSON.parse(JSON.stringify(s)));assert.equal(restored.expedition.choicePending,true);assert.equal(restored.hp,37);assert.ok(R.chooseBlessing(restored,'edge'));assert.equal(R.chooseBlessing(restored,'edge'),false);assert.deepEqual(restored.expedition.blessings,['edge']);
});
check('one expedition rest, twelve floors, one reward per floor and persistent best record',()=>{
  const s=hero();R.startExpedition(s);assert.equal(R.restExpedition(s),false);s.hp=1;s.mp=0;assert.ok(R.restExpedition(s));assert.equal(R.restExpedition(s),false);
  for(let floor=1;floor<=12;floor++){const result=R.advanceExpedition(s);assert.equal(result.floor,floor);if(floor<12){const id=Object.keys(S.blessings).find(id=>s.expedition.blessings.filter(v=>v===id).length<3);assert.ok(R.chooseBlessing(s,id));}}
  assert.equal(s.expedition.active,false);assert.equal(s.expedition.best,12);assert.equal(R.advanceExpedition(s).ok,false);assert.deepEqual(R.normalizeState(s).expedition,s.expedition);R.abandonExpedition(s);assert.equal(s.expedition.best,12);
});
check('chapter replay preserves possessions and resets only the selected and following main stages',()=>{
  const s=hero();s.bag.wufeng=1;s.weapon='wufeng';s.contracts=['c1'];s.progress['city-clues']=['barkeep'];s.choices['river-plan']='ridge';s.expedition.best=4;assert.ok(R.replayChapter(s,1));assert.equal(s.stage,S.index('city-arrival'));assert.equal(s.weapon,'wufeng');assert.equal(s.level,8);assert.equal(s.expedition.best,4);assert.equal(s.choices['river-plan'],'ridge');assert.equal(s.progress['city-clues'],undefined);assert.deepEqual(s.contracts,['c1']);assert.equal(s.replays,1);assert.equal(R.replayChapter(s,0),false);
});
console.log(`\n${checks} rule checks passed; ${failures} failed.`);if(failures)process.exitCode=1;
