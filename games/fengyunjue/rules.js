'use strict';

const JianghuRules = (() => {
  const STORY=typeof module!=='undefined'&&module.exports?require('./story.js'):JianghuStory;
  const ITEMS={
    potion:{name:'金疮药',category:'medicine',icon:'flask',description:'止血生肌。恢复 60 点气血。',price:24,heal:60},
    elixir:{name:'九花玉露丸',category:'medicine',icon:'flask',description:'山中灵药。恢复 125 点气血。',price:48,heal:125},
    qi:{name:'养气丹',category:'medicine',icon:'leaf',description:'一缕清气入丹田。恢复 40 点真气。',price:20},
    herb:{name:'青灵草',category:'misc',icon:'leaf',description:'生于溪边的草药，白芷正在寻找它。'},
    fish:{name:'溪中鲤',category:'medicine',icon:'heart',description:'食用恢复 25 点气血，也可交给白芷炖汤。',heal:25},
    wood:{name:'旧木剑',category:'weapon',icon:'sword',description:'伴你出门的木剑，剑身已被磨得温润。攻击 +0。',attack:0},
    steel:{name:'青锋剑',category:'weapon',icon:'sword',description:'锋芒如秋水，是山匪掳来的失物。攻击 +8。',attack:8},
    blacksteel:{name:'玄铁长剑',category:'weapon',icon:'sword',description:'黑风寨宝库中的玄铁剑。攻击 +17。',attack:17},
    qingming:{name:'青冥剑',category:'weapon',icon:'sword',description:'剑光澄明，破风无声。攻击 +25。',attack:25},
    wufeng:{name:'无锋古剑',category:'weapon',icon:'sword',description:'历尽江湖，重剑藏锋。攻击 +32。',attack:32},
    cloth:{name:'旅人布衣',category:'armor',icon:'shield',description:'少年出门时的旧衣，尚无额外防护。',defense:0},
    vest:{name:'镖师护衣',category:'armor',icon:'shield',description:'林镖头赠你的护衣。受到的伤害降低 2 点。',defense:2},
    armor:{name:'护心软甲',category:'armor',icon:'shield',description:'内缝铁片的软甲。受到的伤害降低 5 点。',defense:5},
    robe:{name:'流云道衣',category:'armor',icon:'shield',description:'武当赠予的护身道衣。受到的伤害降低 8 点。',defense:8},
    letter:{name:'故人来信',category:'misc',icon:'scroll',description:'「江南梧桐，故人相候。」落款处是一枚镖队剑印。'},
    manual:{name:'无名剑谱',category:'misc',icon:'scroll',description:'参悟后获得 1 点悟性，可在武学面板修习招式。'},
    jade:{name:'平安玉扣',category:'misc',icon:'compass',description:'旧箱里的玉扣。柳伯一直在寻找这件故人物品。'},
    ore:{name:'玄铁矿',category:'misc',icon:'shield',description:'可交给平康城唐铁匠，淬炼手中兵刃。'},
    seal:{name:'半枚剑印',category:'misc',icon:'compass',description:'济民镖队的旧印，林镖头以性命相护。'},
    manifest:{name:'伪造镖单',category:'misc',icon:'scroll',description:'青衣密探携带的镖单，竟盖着陆家旧印。'},
    ledger:{name:'赈灾账册',category:'misc',icon:'scroll',description:'记下十六年前被侵吞赈灾款的名册，是追查旧案的证据。'},
    recommendation:{name:'武当荐书',category:'misc',icon:'scroll',description:'陆青霜写给清虚道长的信。'},
    token:{name:'风雷阵令',category:'misc',icon:'compass',description:'林晚晴交给你的令牌。玄鸦决战时，其气血降低 45。'},
    testimony:{name:'完整供词',category:'misc',icon:'scroll',description:'众人证言合拢，使你剑心更坚。决战时攻击额外 +7。'},
    cargo:{name:'陆家镖货',category:'misc',icon:'bag',description:'散落在城中的镖货。集齐三箱可交给镖局伙计。'},
    antidote:{name:'清心解毒散',category:'medicine',icon:'leaf',description:'清除全部中毒，并恢复 20 点气血。',price:32},
    merit:{name:'侠义令',category:'misc',icon:'compass',description:'悬赏与剑冢所得，可用来打造不同流派的佩饰。'},
    moonCharm:{name:'明月佩',category:'accessory',icon:'compass',description:'每回合额外恢复 2 真气，攻击降低 2。',qi:2,attack:-2},
    hawkCharm:{name:'青鸢佩',category:'accessory',icon:'wind',description:'移动上限 +1，防御降低 2。',move:1,defense:-2},
    turtleCharm:{name:'玄龟佩',category:'accessory',icon:'shield',description:'气血上限 +30，防御 +3，攻击降低 4。',hp:30,defense:3,attack:-4},
    fangCharm:{name:'蛇牙佩',category:'accessory',icon:'leaf',description:'毒伤每层 +3，破势效果降低 4。',poison:3,break:-4},
    jadeCharm:{name:'白玉佩',category:'accessory',icon:'heart',description:'治疗效果 +12，每战多用一次药，攻击降低 4。',heal:12,medicine:1,attack:-4},
    breakCharm:{name:'碎岳佩',category:'accessory',icon:'sword',description:'每次攻击破势值 +9，内息回复降低 1。',break:9,qi:-1},
    emberCharm:{name:'赤焰佩',category:'accessory',icon:'sword',description:'攻击 +9，防御降低 3。',attack:9,defense:-3}
  };
  const SKILLS={
    strike:{name:'流云剑法',icon:'sword',cost:0,range:2,description:'剑随意走，行云流水。攻击两格内的单个敌人。'},
    sweep:{name:'清风掠影',icon:'wind',cost:18,range:3,description:'攻击三格内的目标，以及与其相邻的敌人。'},
    heal:{name:'凝神归元',icon:'leaf',cost:22,range:0,cooldown:3,description:'恢复自身气血并清除一层中毒，施展后需调息两回合。'},
    ultimate:{name:'剑归沧海',icon:'sword',cost:36,range:4,cooldown:4,description:'攻击目标两格内的敌人，无视盾势；需要调息三回合。'},
    pierce:{name:'破岳剑',icon:'sword',cost:16,range:2,cooldown:2,description:'无视盾势，造成大量破势。破势可打断蓄力，让敌人停手一回合。'},
    poison:{name:'飞花毒刃',icon:'leaf',cost:14,range:3,cooldown:2,description:'直伤较低，附两层毒（最多三层、持续三回合）。心诀与佩饰可增强毒伤；阵柱不会中毒。'}
  };
  const STYLES={balanced:{name:'中正',description:'攻守均衡，移动 3 格。',move:3},swift:{name:'疾风',description:'移动 4 格，普攻积势更快；防御 -2。',move:4,defense:-2,attack:1},iron:{name:'磐石',description:'防御 +4，守势受近战时反击；移动 2 格。',move:2,defense:4,attack:-1},focus:{name:'归元',description:'每回合额外回复 3 真气，治疗 +8；攻击 -3。',move:3,qi:3,heal:8,attack:-3}};
  const DISCIPLINES={none:{name:'初学',description:'武当问剑后可选择心诀。'},breaker:{name:'摧坚',description:'破势值 +8，破势后的伤害更高。',break:8},venom:{name:'流芳',description:'毒伤每层 +3，持续时间 +1。',poison:3},guardian:{name:'守心',description:'自身与护送目标的治疗 +14。',heal:14}};
  const DIFFICULTIES={story:{name:'游侠',hp:.85,attack:.8,medicine:4,description:'熟悉玩法，保留全部战斗机制。'},adventure:{name:'险境',hp:1,attack:1,medicine:3,description:'推荐；需要搭配招式、合理走位与用药。'},heroic:{name:'宗师',hp:1.2,attack:1.18,medicine:2,description:'适合熟悉机制后挑战，容错更低。'}};
  const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y),key=(x,y)=>`${x},${y}`,clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  const charm=s=>ITEMS[s.accessory]||{},style=s=>STYLES[s.style]||STYLES.balanced;
  const maxHp=s=>130+(s.level-1)*19+(charm(s).hp||0),maxMp=s=>65+(s.level-1)*6,xpNeed=s=>s.level*90;
  const attack=s=>22+(s.level-1)*3+ITEMS[s.weapon].attack+(s.refinement[s.weapon]||0)*3+(charm(s).attack||0)+(style(s).attack||0);
  const defense=s=>(ITEMS[s.armor]?.defense||0)+(charm(s).defense||0)+(style(s).defense||0);
  const healing=s=>36+(s.skills.heal-1)*8+(charm(s).heal||0)+(style(s).heal||0)+(DISCIPLINES[s.discipline]?.heal||0);
  const learnCost=(s,id)=>Math.max(1,s.skills[id]||1);
  const terminal=STORY.quests.length-1;
  function createState(){return{version:3,name:'宇文逸',level:1,xp:0,gold:128,hp:130,mp:65,stage:0,insight:1,
    location:'village',x:11,y:17,weapon:'wood',armor:'cloth',bag:{wood:1,cloth:1,letter:1,potion:2,qi:1},
    skills:{strike:1,sweep:1,heal:1,ultimate:0,pierce:0,poison:0},herbs:[],chest:false,wins:0,playTime:0,rep:0,
    style:'balanced',discipline:'none',difficulty:'adventure',accessory:'',contracts:[],replays:0,expedition:{active:false,floor:0,best:0,blessings:[],choicePending:false,rested:false},
    progress:{},opened:[],pickups:[],choices:{},companions:[],companion:'',refinement:{},sideDone:[],cleared:[],
    log:['你循着一封旧信来到梧桐村。去找柳伯，问一问信中往事吧。']};}
  const canTravel=(s,location)=>!!STORY.locations[location]&&s.stage>=STORY.locations[location].unlock;
  function normalizeState(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||![1,2,3].includes(raw.version))return null;
    const s=createState(),legacy=raw.version===1;
    for(const[field,lo,hi]of[['level',1,30],['xp',0,100000],['gold',0,999999],['stage',0,legacy?5:raw.version===2?26:terminal],['insight',0,99],['wins',0,9999],['playTime',0,9999999],['rep',0,99],['replays',0,99]])if(Number.isFinite(raw[field]))s[field]=clamp(Math.floor(raw[field]),lo,hi);
    if(legacy)s.stage=s.stage===4?6:s.stage===5?7:s.stage;
    if(raw.version<3)s.stage=STORY.index(STORY.legacyQuestIds[s.stage]);
    s.style=Object.hasOwn(STYLES,raw.style)?raw.style:'balanced';s.discipline=Object.hasOwn(DISCIPLINES,raw.discipline)?raw.discipline:'none';s.difficulty=Object.hasOwn(DIFFICULTIES,raw.difficulty)?raw.difficulty:'adventure';
    s.hp=Number.isFinite(raw.hp)?clamp(Math.floor(raw.hp),1,maxHp(s)):maxHp(s);s.mp=Number.isFinite(raw.mp)?clamp(Math.floor(raw.mp),0,maxMp(s)):maxMp(s);
    s.location=canTravel(s,raw.location)?raw.location:'village';
    s.x=Number.isFinite(raw.x)?clamp(Math.round(raw.x),1,23):STORY.locations[s.location].spawn.x;s.y=Number.isFinite(raw.y)?clamp(Math.round(raw.y),1,23):STORY.locations[s.location].spawn.y;
    s.bag={wood:1,cloth:1};for(const id of Object.keys(ITEMS))if(raw.bag&&Number.isFinite(raw.bag[id])&&raw.bag[id]>=0)s.bag[id]=clamp(Math.floor(raw.bag[id]),0,9999);
    s.bag.wood=1;s.bag.cloth=1;
    s.weapon=ITEMS[raw.weapon]?.category==='weapon'&&s.bag[raw.weapon]?raw.weapon:'wood';s.armor=ITEMS[raw.armor]?.category==='armor'&&s.bag[raw.armor]?raw.armor:'cloth';
    s.accessory=ITEMS[raw.accessory]?.category==='accessory'&&s.bag[raw.accessory]?raw.accessory:'';
    s.hp=Number.isFinite(raw.hp)?clamp(Math.floor(raw.hp),1,maxHp(s)):maxHp(s);
    for(const id of Object.keys(SKILLS))if(raw.skills&&Number.isFinite(raw.skills[id]))s.skills[id]=clamp(Math.floor(raw.skills[id]),['ultimate','pierce','poison'].includes(id)?0:1,5);
    if(s.stage>STORY.index('wudang-trial'))s.skills.ultimate=Math.max(1,s.skills.ultimate);
    if(s.stage>STORY.index('sword-foundation'))s.skills.pierce=Math.max(1,s.skills.pierce);
    if(s.stage>STORY.index('antidote-cache'))s.skills.poison=Math.max(1,s.skills.poison);
    for(const q of STORY.quests){
      const data=raw.progress?.[q.id];if(q.targets&&Array.isArray(data))s.progress[q.id]=[...new Set(data.filter(id=>q.targets.includes(id)))];
      if(q.choices&&q.choices.some(c=>c.id===raw.choices?.[q.id]))s.choices[q.id]=raw.choices[q.id];
    }
    if(legacy)s.progress.herbs=Array.isArray(raw.herbs)?[...new Set(raw.herbs.filter(id=>STORY.quests[1].targets.includes(id)))]:[];
    if(s.stage>1)s.progress.herbs=[...STORY.quests[1].targets];s.herbs=s.progress.herbs||[];
    if(s.stage===1&&s.herbs.length===3)s.stage=2;
    if(s.stage===2)s.bag.herb=Math.max(s.bag.herb||0,3);
    for(const q of STORY.quests.slice(0,s.stage)){if(q.targets)s.progress[q.id]=[...q.targets];if(q.encounter)s.cleared.push(q.encounter);}
    if(Array.isArray(raw.cleared))s.cleared=[...new Set([...s.cleared,...raw.cleared.filter(id=>Object.hasOwn(STORY.encounters,id))])];
    const allSites=Object.values(STORY.sites).flat();
    s.opened=Array.isArray(raw.opened)?[...new Set(raw.opened.filter(id=>allSites.some(p=>p.id===id&&p.feature==='chest')))]:[];
    if(raw.chest&&!s.opened.includes('chest'))s.opened.push('chest');s.chest=s.opened.includes('chest');
    s.pickups=Array.isArray(raw.pickups)?[...new Set(raw.pickups.filter(id=>allSites.some(p=>p.id===id&&['ore','crate'].includes(p.feature))))]:[];
    s.sideDone=Array.isArray(raw.sideDone)?[...new Set(raw.sideDone.filter(id=>['fish','jade','cargo'].includes(id)))]:[];
    s.companions=Array.isArray(raw.companions)?[...new Set(raw.companions.filter(id=>Object.hasOwn(STORY.companions,id)))]:[];
    if(s.stage>STORY.index('city-alliance')&&!s.companions.includes('qingshuang'))s.companions.push('qingshuang');if(s.stage>STORY.index('old-sword')&&!s.companions.includes('mowen'))s.companions.push('mowen');
    s.companion=s.companions.includes(raw.companion)?raw.companion:raw.companion===''?'':s.companions[0]||'';
    for(const id of Object.keys(ITEMS))if(ITEMS[id].category==='weapon'&&Number.isFinite(raw.refinement?.[id]))s.refinement[id]=clamp(Math.floor(raw.refinement[id]),0,3);
    s.contracts=Array.isArray(raw.contracts)?[...new Set(raw.contracts.filter(id=>STORY.contracts.some(c=>c.id===id)))]:[];
    const ex=raw.expedition;
    if(ex&&typeof ex==='object'){
      s.expedition.best=Number.isFinite(ex.best)?clamp(Math.floor(ex.best),0,12):0;
      if(ex.active===true&&s.stage>STORY.index('bamboo-fight')&&Number.isInteger(ex.floor)&&ex.floor>=1&&ex.floor<=12){s.expedition={active:true,floor:ex.floor,best:s.expedition.best,blessings:Array.isArray(ex.blessings)?ex.blessings.filter(id=>Object.hasOwn(STORY.blessings,id)).slice(0,11):[],choicePending:!!ex.choicePending,rested:!!ex.rested,level:Number.isFinite(ex.level)?clamp(Math.floor(ex.level),1,30):s.level};}
    }
    if(Array.isArray(raw.log))s.log=raw.log.filter(x=>typeof x==='string').map(x=>x.slice(0,250)).slice(-80);if(!s.log.length)s.log=createState().log;
    return s;
  }
  function findPath(start,goal,isWalkable,width=25,height=25){
    const queue=[{x:start.x,y:start.y}],seen=new Map([[key(start.x,start.y),null]]);
    for(let i=0;i<queue.length;i++){
      const current=queue[i];if(current.x===goal.x&&current.y===goal.y){const path=[];let next=current;while(seen.get(key(next.x,next.y))){path.unshift(next);next=seen.get(key(next.x,next.y));}return path;}
      for(const[dx,dy]of[[0,-1],[1,0],[0,1],[-1,0]]){const x=current.x+dx,y=current.y+dy;if(x<0||y<0||x>=width||y>=height||seen.has(key(x,y))||!isWalkable(x,y))continue;seen.set(key(x,y),current);queue.push({x,y});}
    }return null;
  }
  function gain(s,xp,gold=0){s.gold+=gold;s.xp+=xp;let levels=0;while(s.xp>=xpNeed(s)&&s.level<30){s.xp-=xpNeed(s);s.level++;s.insight++;levels++;}if(levels&&!s.expedition.active){s.hp=maxHp(s);s.mp=maxMp(s);}return levels;}
  function reward(s,r={}){
    for(const[id,n]of Object.entries(r.items||{}))s.bag[id]=(s.bag[id]||0)+n;
    for(const[id,n]of Object.entries(r.consume||{}))s.bag[id]-=n;
    if(r.rep)s.rep+=r.rep;
    if(r.companion&&!s.companions.includes(r.companion)){s.companions.push(r.companion);if(!s.companion)s.companion=r.companion;}
    if(r.skill)s.skills[r.skill]=Math.max(1,s.skills[r.skill]);
    if(r.style&&STYLES[r.style])s.style=r.style;if(r.discipline&&DISCIPLINES[r.discipline])s.discipline=r.discipline;
    const levels=gain(s,r.xp||0,r.gold||0);if(r.heal){s.hp=maxHp(s);s.mp=maxMp(s);}return levels;
  }
  function completeQuest(s,id,choiceId){
    const q=STORY.quests[s.stage];if(!q||q.id!==id||q.kind==='free')return{ok:false};
    if(q.targets&&(s.progress[q.id]||[]).length<q.targets.length)return{ok:false};
    const choice=q.choices?.find(c=>c.id===choiceId);if(q.choices&&!choice)return{ok:false};
    for(const[item,n]of Object.entries(q.rewards.consume||{}))if((s.bag[item]||0)<n)return{ok:false,message:`还缺少${ITEMS[item].name}，请先备齐。`};
    if(choice)s.choices[q.id]=choice.id;
    const levels=reward(s,q.rewards)+(choice?reward(s,choice.rewards):0);
    if(q.encounter&&!s.cleared.includes(q.encounter))s.cleared.push(q.encounter);
    s.stage++;return{ok:true,levels,quest:q,chapterEnd:!!q.chapterEnd};
  }
  function recordObjective(s,id){
    const q=STORY.quests[s.stage];if(!q.targets?.includes(id))return{ok:false};
    const list=s.progress[q.id]||=[];if(list.includes(id))return{ok:false};list.push(id);
    if(q.id==='herbs'){s.herbs=[...list];s.bag.herb=(s.bag.herb||0)+1;}
    if(list.length===q.targets.length)return completeQuest(s,q.id);
    return{ok:true,partial:true,count:list.length,total:q.targets.length};
  }
  function useItem(s,id){
    if(!s.bag[id]||!ITEMS[id])return{ok:false,message:'行囊中已没有这件物品。'};const item=ITEMS[id];
    if(item.heal){if(s.hp>=maxHp(s))return{ok:false,message:'气血充盈，暂时无需服用。'};const value=Math.min(item.heal,maxHp(s)-s.hp);s.hp+=value;s.bag[id]--;return{ok:true,value,message:`使用${item.name}，恢复 ${value} 点气血。`};}
    if(id==='qi'){if(s.mp>=maxMp(s))return{ok:false,message:'真气充盈，暂时无需服用。'};const value=Math.min(40,maxMp(s)-s.mp);s.mp+=value;s.bag.qi--;return{ok:true,value,message:`服下养气丹，恢复 ${value} 点真气。`};}
    if(id==='manual'){s.bag.manual--;s.insight++;return{ok:true,message:'参悟无名剑谱，悟性 +1。'};}
    if(['weapon','armor','accessory'].includes(item.category)){s[item.category]=id;s.hp=Math.min(s.hp,maxHp(s));return{ok:true,message:`已装备${item.name}。`};}
    return{ok:false,message:item.description};
  }
  function refine(s){const rank=s.refinement[s.weapon]||0,cost=(rank+1)*65,ore=rank+1;if(rank>=3)return{ok:false,message:'这柄兵刃已淬炼至三重。'};if(s.gold<cost||(s.bag.ore||0)<ore)return{ok:false,message:`需要 ${cost} 铜钱和 ${ore} 块玄铁矿。`};s.gold-=cost;s.bag.ore-=ore;s.refinement[s.weapon]=rank+1;return{ok:true,message:`${ITEMS[s.weapon].name}淬炼至 ${rank+1} 重，攻击再加 3。`};}

  function learn(s,id){
    if(!SKILLS[id]||!s.skills[id]||s.skills[id]>=5||s.insight<learnCost(s,id))return{ok:false,message:'悟性不足或招式尚未解锁。'};
    s.insight-=learnCost(s,id);s.skills[id]++;return{ok:true};
  }
  function craft(s,id){
    if(!['moonCharm','hawkCharm','turtleCharm','fangCharm','jadeCharm','breakCharm','emberCharm'].includes(id))return{ok:false};
    if(s.bag[id])return{ok:false,message:'这件佩饰已经在行囊中了。'};
    if(s.gold<120||(s.bag.ore||0)<2||(s.bag.merit||0)<3)return{ok:false,message:'打造需要 120 铜钱、2 块玄铁和 3 枚侠义令。'};
    s.gold-=120;s.bag.ore-=2;s.bag.merit-=3;s.bag[id]=1;return{ok:true,message:ITEMS[id].name+'已收入行囊，可以佩戴。'};
  }
  function finishContract(s,id){
    const contract=STORY.contracts.find(c=>c.id===id);
    if(!contract||s.contracts.includes(id)||(contract.need&&!s.contracts.includes(contract.need)))return{ok:false};
    s.contracts.push(id);const levels=reward(s,contract.rewards);return{ok:true,contract,levels,rewards:contract.rewards};
  }
  function startExpedition(s){
    if(s.expedition.active||s.stage<=STORY.index('bamboo-fight'))return{ok:false};
    s.expedition={active:true,floor:1,best:s.expedition.best,blessings:[],choicePending:false,rested:false,level:s.level};
    s.hp=maxHp(s);s.mp=maxMp(s);return{ok:true};
  }
  function advanceExpedition(s){
    const ex=s.expedition;if(!ex.active||ex.choicePending)return{ok:false};
    const floor=ex.floor,rewards={xp:40+floor*12,gold:35+floor*5,items:{merit:floor%3===0?2:1,...(floor===12?{emberCharm:1}:{})}};
    const levels=reward(s,rewards);ex.best=Math.max(ex.best,floor);
    s.hp=Math.min(maxHp(s),s.hp+ex.blessings.filter(id=>id==='mercy').length*25);
    if(floor===12){ex.active=false;ex.floor=0;ex.choicePending=false;ex.blessings=[];ex.rested=false;delete ex.level;}else{ex.floor++;ex.choicePending=true;}
    return{ok:true,floor,finished:floor===12,rewards,levels};
  }
  function chooseBlessing(s,id){
    const ex=s.expedition;if(!ex.active||!ex.choicePending||!STORY.blessings[id]||ex.blessings.filter(v=>v===id).length>=3)return false;
    ex.blessings.push(id);ex.choicePending=false;return true;
  }
  function restExpedition(s){
    const ex=s.expedition;if(!ex.active||ex.rested||s.hp>=maxHp(s)&&s.mp>=maxMp(s))return false;
    ex.rested=true;s.hp=Math.min(maxHp(s),s.hp+Math.ceil(maxHp(s)*.6));s.mp=Math.min(maxMp(s),s.mp+Math.ceil(maxMp(s)*.6));return true;
  }
  function abandonExpedition(s){s.expedition={active:false,floor:0,best:s.expedition.best,blessings:[],choicePending:false,rested:false};}
  function replayChapter(s,index){
    const chapter=STORY.chapters[index];if(!chapter||s.stage!==terminal||s.expedition.active)return false;
    for(const q of STORY.quests.slice(chapter.from)){delete s.progress[q.id];delete s.choices[q.id];}
    s.stage=chapter.from;s.herbs=s.progress.herbs||[];s.replays++;s.location=chapter.home;Object.assign(s,STORY.locations[s.location].spawn);
    s.hp=maxHp(s);s.mp=maxMp(s);return true;
  }
  function toggleLights(cells,index){
    const next=[...cells],x=index%3,y=Math.floor(index/3);
    for(const[dx,dy]of[[0,0],[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<3&&ny<3)next[ny*3+nx]=!next[ny*3+nx];}
    return next;
  }
  const initialLights=puzzle=>puzzle.scramble.reduce((cells,index)=>toggleLights(cells,index),Array(9).fill(true));
  function lightSolution(cells){
    let best=null;
    for(let mask=0;mask<512;mask++){let next=cells,moves=[];for(let i=0;i<9;i++)if(mask&(1<<i)){next=toggleLights(next,i);moves.push(i);}if(next.every(Boolean)&&(!best||moves.length<best.length))best=moves;}
    return best;
  }
  const api={STORY,ITEMS,SKILLS,STYLES,DISCIPLINES,DIFFICULTIES,terminal,distance,key,clamp,charm,style,healing,learnCost,learn,craft,
    createState,normalizeState,maxHp,maxMp,xpNeed,attack,defense,canTravel,findPath,gain,reward,completeQuest,recordObjective,useItem,refine,
    finishContract,startExpedition,advanceExpedition,chooseBlessing,restExpedition,abandonExpedition,replayChapter,toggleLights,initialLights,lightSolution};
  Object.assign(api,typeof module!=='undefined'&&module.exports?require('./combat.js')(api):createCombat(api));
  return api;
})();
if(typeof module!=='undefined'&&module.exports)module.exports=JianghuRules;
