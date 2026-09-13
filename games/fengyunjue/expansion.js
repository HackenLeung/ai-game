'use strict';

function expandJianghu(story) {
  const {quests,sites,locations,encounters,puzzles,clues,chapters}=story;
  const legacyQuestIds=quests.map(q=>q.id);
  const additions={};
  const add=(after,...entries)=>{additions[after]=entries;};
  const talk=(id,chapter,title,location,target,description,lines,rewards={xp:28})=>({id,chapter,title,kind:'talk',location,target,guide:description,objective:description,description,lines,reply:'记下此事，继续前行',rewards});
  const fight=(id,chapter,title,location,target,encounter,description,rewards={xp:65,gold:45})=>({id,chapter,title,kind:'battle',location,target,encounter,guide:`前往${title}`,objective:description,description,rewards});
  const puzzle=(id,chapter,title,location,target,puzzle,description)=>({id,chapter,title,kind:'puzzle',location,target,puzzle,guide:`查看${title}`,objective:description,description,rewards:{xp:35}});
  const investigate=(id,chapter,title,location,targets,description)=>({id,chapter,title,kind:'clues',location,targets,guide:'勘查下一条线索',objective:description,description,rewards:{xp:35}});
  const choose=(id,chapter,title,location,target,lines,choices)=>({id,chapter,title,kind:'choice',location,target,guide:`前往${title}`,objective:title,description:lines[0],lines,choices,rewards:{xp:25}});
  const site=(location,id,name,x,y,type,active,extra={})=>sites[location].push({id,name,x,y,type,active,title:type==='enemy'?'交锋':type==='npc'?'访谈':'勘查',color:'#a9b59b',...extra});
  const evidence=(id,entry,detail)=>clues[id]={title:'勘查记录',entry,lines:[entry,detail]};

  locations.marsh={name:'芦苇渡',region:'江南道 · 荒渡旧路',poem:'水浅藏舟，芦深隐客。',ambient:'水鸟惊起 · 芦风萧萧',safe:false,theme:'marsh',spawn:{x:11,y:21},note:'渡口的足迹、折箭与车辙，藏着山匪的布置。'};
  locations.ruins={name:'废窑密道',region:'平康城外 · 地下暗流',poem:'残窑无火，旧账有声。',ambient:'滴水空鸣 · 暗处有人',safe:false,theme:'ruins',spawn:{x:12,y:22},note:'机关会连动相邻符灯；守卫与药师各有弱点。'};
  locations.pass={name:'问心古道',region:'武当后山 · 松雪云阶',poem:'千阶不问名，一剑照其心。',ambient:'松雪落阶 · 石钟远响',safe:true,theme:'pass',spawn:{x:12,y:22},note:'照心剑客擅长蓄力，破势与守势是过关关键。'};
  sites.marsh=[];sites.ruins=[];sites.pass=[];
  add('medicine',
    talk('sword-foundation',0,'剑不只求快','village','swordsman','向莫问学习破势与应敌',['一味追求伤害，迟早会撞上铁盾。对手的架势也有极限；用「破岳剑」压垮它，就能打断蓄力，换来一回合的空隙。','伤药每战有携带上限，内功调息也有间隔。看对手下一步的意图，决定进攻、守势或走位。你可以在「修行」里随时调整出战流派。'],{xp:25,skill:'pierce'}),
    choose('first-style',0,'初定剑路','village','swordsman',['同一柄剑，可以有三种走法。选一条你现在想练的路；战斗外仍可在修行中免费更换。'],[
      {id:'swift',label:'疾风 · 以步法换取先机',description:'每回合移动 4 格，连续出剑积势更快；防御降低 2。',rewards:{style:'swift'}},
      {id:'iron',label:'磐石 · 守住再反击',description:'防御 +4、守势反击；移动只有 2 格。',rewards:{style:'iron'}},
      {id:'focus',label:'归元 · 以内息御剑',description:'每回合多回 3 真气、调息增强；攻击降低 3。',rewards:{style:'focus'}}]),
    investigate('river-tracks',0,'荒渡寻踪','marsh',['mudprint','broken-arrow','cart-rut'],'勘查渡口的脚印、折箭与车辙'),
    choose('river-plan',0,'渡口两路','marsh','ferryman',['三条线索已经凑齐：正路有人守，芦丛里也藏着弓手。渡翁指给你两条能够接近竹林的路。','走高处能避开毒雾，却要面对远射；沿渡口突入，敌人聚得近，盾手也会先迎上来。'],[
      {id:'ridge',label:'登上高坡，先破弓手',description:'接下来的山匪战改为弓手阵；获得 1 枚养气丹。',rewards:{items:{qi:1}}},
      {id:'ford',label:'穿过浅滩，正面破盾',description:'接下来的山匪战改为盾阵；获得 1 包金疮药。',rewards:{items:{potion:1}}}])
  );
  add('rescue',
    fight('antidote-cache',0,'雾中取药','marsh','venom-scout','venom','击败施毒斥候，取得镖师需要的解毒药',{xp:60,gold:40,items:{antidote:2},skill:'poison'}),
    fight('bridge-watch',0,'渡口守夜','marsh','bridge-raiders','bridge','守住渡头 6 回合；第 3、5 回合会出现援兵',{xp:75,gold:45,items:{ore:2}})
  );
  add('escort',talk('patients-return',0,'一盏归灯','village','doctor','把镖师送到药庐，听伤者证言',['伤口已经止血，他能活下来。你这一路带回来的，不只是一个镖师，还有镖队丢失的名册。','名册上有三个人仍困在平康。你若想救他们，光有一柄好剑还不够。认识同伴，备好解毒药，也多留心路边的委托。'],{xp:30,items:{potion:1},heal:true}));

  add('city-arrival',
    talk('smith-trade',1,'炉火识剑','city','smith','向唐铸请教兵刃与护身佩饰',['剑锋会钝，人的取舍不能钝。青鸢佩利于追击，玄龟佩能扛重击；没有一件佩饰适合所有战斗。','委托与秘境都能获得「侠义令」。把令牌和玄铁带给我，便可打造佩饰。先送你一枚旧佩，你可以在行囊里佩戴。'],{xp:25,items:{moonCharm:1,ore:2}}),
    puzzle('kiln-lamps',1,'废窑寻门','ruins','kiln-lock','lamps','将九盏符灯全部点亮，开启废窑密室')
  );
  add('city-clues',puzzle('name-the-spy',1,'灯下辨伪','city','barkeep','suspect','依据三条证言，辨认真正的密探'));
  add('city-spies',
    fight('night-breakout',1,'长街突围','ruins','tunnel-ambush','escape','在 9 回合内走到东侧出口；不必击败所有追兵',{xp:80,gold:55,items:{antidote:1}}),
    choose('merchant-deal',1,'市井一诺','city','merchant-agent',['密道尽头的行商也遭了盘剥。他愿意帮你，但眼下有人缺药，也有人急着运出证物。'],[
      {id:'medicine',label:'先为受伤脚夫备药',description:'获得金疮药与解毒药，侠义 +2。',rewards:{rep:2,items:{potion:2,antidote:2}}},
      {id:'evidence',label:'优先转运账目证物',description:'获得 3 枚侠义令，可去锻造佩饰。',rewards:{items:{merit:3}}}])
  );
  add('city-alliance',{id:'camp-outworks',chapter:1,title:'拔去外援',kind:'seals',location:'ruins',targets:['watchtower','alarm-lock','supply-guard'],guide:'处理下一处外援',objective:'夺哨台、封暗铃、截断补给',description:'寨主的援军来自废窑。夺下哨台并连续站稳三回合，解开暗铃机关，再截住补给队。',rewards:{xp:65,gold:70,items:{ore:2}}});
  add('winch',fight('prisoner-flight',1,'铁牢劫人','camp','prison-raider','prison','保护被救出的镖师，击退追来的盾卫与药师',{xp:85,gold:60,items:{merit:2}}));
  add('camp-chief',investigate('kiln-records',1,'灰烬里的名字','ruins',['burnt-page','wax-seal','hidden-register'],'查验残页、封蜡与暗格名册，还原灭口名单'));

  add('wudang-arrival',choose('temple-discipline',2,'剑外有心','temple','taoist',['清虚道长留下三门心诀。每次只能运用一门；战斗外可以在修行中更换，看看哪门更配你的剑路。'],[
    {id:'breaker',label:'摧坚 · 专破架势',description:'破势值 +8，破势后的攻击额外增强。',rewards:{discipline:'breaker'}},
    {id:'venom',label:'流芳 · 借花伤敌',description:'毒伤增强并延长一回合，适合边退边战。',rewards:{discipline:'venom'}},
    {id:'guardian',label:'守心 · 护己及人',description:'治疗与护送目标恢复增强，适合防守战。',rewards:{discipline:'guardian'}}]));
  add('steles',
    puzzle('star-array',2,'北斗连灯','pass','star-stele','stars','转动九宫符灯，使星位全部点亮'),
    fight('mirror-duel',2,'照心一剑','pass','mirror-swordsman','mirror','独自通过照心剑客的考验；此战没有同伴援护',{xp:100,items:{merit:2}}),
    talk('sword-oath',2,'不败之意','pass','old-monk','向守阶老人复盘这场试剑',['你刚才破开的，不只是对手的架势。敢于放弃一回合攻击，往往才能留下下一回合的机会。','谷中有药师、阵柱和护卫。药师会替人续命，阵柱会护住主将，追兵会越打越多。记住目标，别把每一场都打成站着换血。'],{xp:35,items:{qi:1},heal:true})
  );
  add('old-sword',
    investigate('valley-scouts',2,'入谷之前','pass',['raven-feather','poison-vial','array-map'],'勘查玄鸦的羽令、毒瓶与阵图'),
    choose('valley-route',2,'险路与正途','pass','mowen-pass',['阵图画着两条入谷路。断魂客守在正道，火阵封住侧谷。此刻的选择，会改变谷口之战。'],[
      {id:'cliff',label:'贴崖而行，穿过火阵',description:'谷口有间歇火地，获得青鸢佩。',rewards:{items:{hawkCharm:1}}},
      {id:'road',label:'走正道，正面破阵',description:'谷口增加护阵柱，获得玄龟佩。',rewards:{items:{turtleCharm:1}}}])
  );
  add('valley-ambush',fight('last-caravan',2,'最后的镖队','valley','caravan-raid','caravan','保护运送证人的镖车，撑过 7 回合援军攻势',{xp:105,gold:70,items:{elixir:1,merit:2}}));
  add('seals',fight('array-heart',2,'剑阵之心','valley','heart-keeper','heart','先摧毁护阵柱，再击败会呼叫援军的阵心守将',{xp:130,gold:85,items:{ore:3,merit:2}}));

  // Old numeric stages are translated by quest identity, so insertion never skips a saved objective.
  const expanded=quests.flatMap(q=>[q,...(additions[q.id]||[])]);
  quests.splice(0,quests.length,...expanded);
  const index=id=>quests.findIndex(q=>q.id===id);
  for(const list of Object.values(sites))for(const s of list){if(s.min!==undefined)s.min=index(legacyQuestIds[s.min]);if(s.max!==undefined)s.max=index(legacyQuestIds[s.max]);}
  for(let i=0;i<3;i++){chapters[i].from=quests.findIndex(q=>q.chapter===i);chapters[i].to=quests.findLastIndex(q=>q.chapter===i&&q.kind!=='free');}
  const unlocks={village:'letter',marsh:'river-tracks',bamboo:'bamboo-fight',city:'city-arrival',ruins:'kiln-lamps',camp:'camp-gate',temple:'wudang-arrival',pass:'star-array',valley:'valley-ambush'};
  for(const [id,q] of Object.entries(unlocks))locations[id].unlock=index(q);
  const main=id=>quests.find(q=>q.id===id);
  main('bamboo-fight').routes={choice:'river-plan',ridge:'ridgeBandits',ford:'fordBandits'};
  main('valley-ambush').routes={choice:'valley-route',cliff:'cliffAmbush',road:'wardAmbush'};
  chapters[0].description='在梧桐村学剑，往芦苇渡查寻足迹，选择破伏路线。夺回解药、守住渡口，护送负伤镖师回家。';
  chapters[1].description='平康查案、废窑解灯、长街突围。结识青霜后拔除外援、劫牢救人，直面黑风寨主并查清灭口名册。';
  chapters[2].description='武当修心、古道照剑，抉择入谷险路。护送最后的镖队，破阵柱、迎战玄鸦，带回真相再赴归乡之约。';
  main('escort').objective='护住林镖头，击退拦路追兵';
  main('escort').description='追兵盯上了负伤的林镖头。站到他身前吸引刀手，及时用「援救」替他恢复；镖师倒下同样会失败。';
  main('free-roam').description='主线已结。新开的九道悬赏、十二层剑冢与章节重游仍在等待。挑选流派、心诀与佩饰，挑战更强的对手。';
  main('free-roam').guide='前往挑战与悬赏';
  for(const q of quests){
    if(q.rewards.items?.manual)q.rewards.items.manual=1;
    if(q.rewards.items?.potion>1)q.rewards.items.potion=1;
    if(q.rewards.items?.qi>1)q.rewards.items.qi=1;
    if(q.rewards.xp)q.rewards.xp=Math.round(q.rewards.xp*.85);
  }

  site('marsh','mudprint','泥岸足迹',7,12,'sign','river-tracks');
  site('marsh','broken-arrow','芦丛折箭',17,11,'sign','river-tracks');
  site('marsh','cart-rut','渡口车辙',12,7,'sign','river-tracks');
  site('marsh','ferryman','老渡翁',9,15,'npc','river-plan');
  site('marsh','venom-scout','施毒斥候',14,9,'enemy','antidote-cache',{encounter:'venom'});
  site('marsh','bridge-raiders','渡头追兵',11,16,'enemy','bridge-watch',{encounter:'bridge'});
  site('marsh','marsh-spring','渡旁清泉',6,19,'spring',null,{feature:'heal'});
  site('marsh','marsh-exit','驿道',12,23,'exit',null,{feature:'map'});
  site('city','merchant-agent','行商周九',18,19,'npc','merchant-deal');
  site('ruins','kiln-lock','九灯石门',12,16,'mechanism','kiln-lamps',{puzzle:'lamps'});
  site('ruins','tunnel-ambush','暗道追兵',12,11,'enemy','night-breakout',{encounter:'escape'});
  site('ruins','watchtower','废窑哨台',7,10,'enemy','camp-outworks',{encounter:'outpost'});
  site('ruins','alarm-lock','连响暗铃',16,13,'mechanism','camp-outworks',{puzzle:'alarm'});
  site('ruins','supply-guard','补给护卫',12,6,'enemy','camp-outworks',{encounter:'supplies'});
  for(const [id,name,x,y]of[['burnt-page','半张残页',6,15],['wax-seal','赈灾封蜡',17,8],['hidden-register','夹墙名册',12,5]])site('ruins',id,name,x,y,'sign','kiln-records');
  site('ruins','ruins-spring','窑外清泉',6,20,'spring',null,{feature:'heal'});site('ruins','ruins-exit','地面驿道',12,23,'exit',null,{feature:'map'});
  site('camp','prison-raider','铁牢追兵',7,7,'enemy','prisoner-flight',{encounter:'prison'});
  site('pass','star-stele','北斗星碑',12,10,'stele','star-array',{puzzle:'stars'});
  site('pass','mirror-swordsman','照心剑客',12,7,'enemy','mirror-duel',{encounter:'mirror'});
  site('pass','old-monk','守阶老人',7,14,'npc','sword-oath');
  site('pass','mowen-pass','莫问',11,18,'npc','valley-route');
  for(const [id,name,x,y]of[['raven-feather','玄羽令',6,10],['poison-vial','空毒瓶',17,15],['array-map','剑阵残图',16,6]])site('pass',id,name,x,y,'sign','valley-scouts');
  site('pass','pass-spring','松雪灵泉',7,20,'spring',null,{feature:'heal'});site('pass','pass-exit','下山驿道',12,23,'exit',null,{feature:'map'});
  site('valley','caravan-raid','截镖追兵',10,16,'enemy','last-caravan',{encounter:'caravan'});
  site('valley','heart-keeper','阵心守将',12,7,'enemy','array-heart',{encounter:'heart'});
  evidence('mudprint','渡口足迹：泥中尽是厚底靴印，正路有持盾步卒。','靴印在石桥处停住，说明他们等着来人正面接近。破岳剑能有效破开盾势。');
  evidence('broken-arrow','折箭：箭羽朝向高坡，芦丛中有弓手设伏。','坡路虽然窄，至少没有毒雾。尽快靠近弓手，找机会破势，能打断他们的远射。');
  evidence('cart-rut','车辙：镖车已经驶入竹林，渡口没有被掳百姓。','不必在这里耗到筋疲力尽。选择一路接近，留些真气给林镖头。');
  evidence('burnt-page','残页：账款去处并非黑风寨，而是落霞谷。','寨主只收过一笔带路钱。最大的那笔账，被一个称作玄鸦的人抹去了名字。');
  evidence('wax-seal','封蜡：济民镖队的旧印被切去一半。','此蜡能对上宇文家的剑印。当年押送的真是赈灾账册，不是传言中的宝藏。');
  evidence('hidden-register','名册：清虚、莫问、陆家总镖头都在灭口名单上。','名单旁另有记号：清虚仍在武当。北上已经不能再迟。');
  evidence('raven-feather','玄羽令：近卫只听阵心号令，破柱后主将才会失去护体。','阵柱本身不会移动，但每根都会大幅削弱你对首领的伤害。先拆护阵，再找破势时机。');
  evidence('poison-vial','毒瓶：瓶底仍留黑色药渣，是能叠加的慢毒。','解毒散能清去毒性；守势减轻刀伤，却挡不住已侵入经脉的毒。');
  evidence('array-map','残图：侧谷每隔三个回合会有地火，正道多一根护阵柱。','火地提前一回合亮起；移出标记，或者改走另一条路。');
  puzzles.lamps={title:'九灯石门',kind:'lights',hint:'每触动一灯，它自己和上下左右的灯都会翻转。将九灯全部点亮即可开门。可重置，也可查看一步提示。',scramble:[0,4,8],success:'符灯连成一片，废窑石门缓缓敞开。'};
  puzzles.stars={title:'北斗连灯',kind:'lights',hint:'点亮九颗星位。每次拨动会翻转本格与四邻，先观察连动关系，再落下一手。',scramble:[1,3,4,7],success:'星位归齐，照心剑客走入庭中。'};
  puzzles.alarm={title:'连响暗铃',kind:'lights',hint:'点亮全部封印，使暗铃止响。拨动一个印记会影响相邻印记。',scramble:[0,2,4,6],success:'最后一道暗铃被封住，寨中已无法借此召援。'};
  puzzles.suspect={title:'灯下辨伪',hint:'回想线索簿：受伤的左手、镖师止血药、装着纸匣和兵刃的灰布车。谁最符合证言？',options:['右臂挂彩、运盐的灰衣商人','左手受伤、推灰布车的青衣客','左手受伤、提鱼篓的渔夫','穿青衣、挑绸缎的店铺伙计'],correct:1,success:'三条证言指向同一个人，追踪的方向终于明确。'};

  const enemy=(id,name,x,y,hp,attack,role='melee')=>[id,name,x,y,hp,attack,role];
  const encounter=(name,level,flavor,enemies,extra={})=>({name,level,flavor,enemies,...extra});
  Object.assign(encounters,{
    ridgeBandits:encounter('高坡破伏',2,'弓手分立两翼。疾风步法适合追击，守势也能帮你熬过接近的一回合。',[enemy('ridge-chief','持刀头目',5,3,150,18),enemy('ridge-bow1','高坡弓手',6,1,90,15,'ranged'),enemy('ridge-bow2','芦丛弓手',6,5,90,15,'ranged')]),
    fordBandits:encounter('浅滩破盾',2,'盾卫减伤很高，破岳剑能快速积累破势。架势破碎后，他会失去行动机会。',[enemy('ford-shield','渡口盾卫',5,3,170,18,'shield'),enemy('ford-blade','渡口刀手',5,4,100,16),enemy('ford-bow','渡口弓手',7,3,80,14,'ranged')]),
    venom:encounter('雾中取药',3,'毒师会叠加慢毒。毒伤越拖越重，解毒散与快速压制都能救命。',[enemy('v-poison','黑水毒师',6,3,180,16,'poison'),enemy('v-guard','护药刀手',5,1,125,18),enemy('v-healer','山匪药师',6,5,100,12,'healer')]),
    bridge:encounter('渡口守夜',3,'守住 6 回合即可，援兵会陆续到来。敌人尚远时，可以先恢复内息。',[enemy('bridge1','渡头刀手',5,2,140,18),enemy('bridge2','渡头弓手',6,5,110,15,'ranged')],{goal:'survive',limit:6,waves:[{round:3,enemies:[enemy('bridge3','渡头盾手',7,1,150,18,'shield')]},{round:5,enemies:[enemy('bridge4','追击刀手',7,5,140,20)]}]}),
    escape:encounter('长街突围',5,'在第 9 回合结束前，沿暗道穿过守卫走到金色出口。追兵会不断涌来，破势和走位比全歼更重要。',[enemy('escape1','暗道盾手',4,3,220,23,'shield'),enemy('escape2','巷口弩手',6,1,160,20,'ranged')],{goal:'escape',limit:9,exit:{x:7,y:6},waves:[{round:4,enemies:[enemy('escape3','追来的刀手',0,1,190,24)]},{round:6,enemies:[enemy('escape4','追来的毒师',0,6,170,19,'poison')]}]}),
    outpost:encounter('争夺哨台',5,'在中央金色阵位连续停留 3 回合，或清除守卫后占住阵位。敌人会设法逼你离开。',[enemy('outpost1','哨台统领',6,3,240,24,'boss'),enemy('outpost2','哨台弩手',6,1,160,20,'ranged')],{goal:'capture',capture:{x:4,y:3},limit:3,objective:'watchtower',reward:{xp:50,gold:35}}),
    supplies:encounter('断其粮道',5,'敌方药师会替最虚弱的同伙回血。先压制药师，避免消耗战。',[enemy('supply1','补给盾卫',5,3,250,23,'shield'),enemy('supply2','随军药师',7,3,180,15,'healer'),enemy('supply3','补给刀手',5,5,180,23)],{objective:'supply-guard',reward:{xp:50,gold:35}}),
    prison:encounter('铁牢劫人',6,'镖师撑不了太久。近战会优先袭击他；你可以挡路、破势，或使用援救。',[enemy('prison1','铁牢盾卫',5,4,240,25,'shield'),enemy('prison2','寨中药师',6,1,160,15,'healer'),enemy('prison3','追魂刀手',6,5,220,24)],{goal:'protect',ally:{name:'获救镖师',x:1,y:5,hp:175}}),
    mirror:encounter('照心一剑',7,'此战独自应对。剑客蓄力时可用破岳剑打断，或提前移出剑势范围。',[enemy('mirror','照心剑客',6,3,440,30,'boss')],{solo:true,training:true,pattern:'line'}),
    cliffAmbush:encounter('侧谷火阵',8,'火地每三回合轮转，亮起后下一回合爆发。别停在橙色地块上。',[enemy('duanhun','断魂客',6,3,440,31,'boss'),enemy('cliff-bow','火阵弓卫',6,1,220,23,'ranged'),enemy('cliff-poison','毒刃客',5,5,200,20,'poison')],{hazard:'fire'}),
    wardAmbush:encounter('正道破阵',8,'护阵柱存续时，断魂客所受伤害降低 65%。先清阵柱，再打主将。',[enemy('duanhun','断魂客',6,3,420,31,'boss'),enemy('ward-pillar','护阵柱',5,1,170,0,'totem'),enemy('ward-bow','护阵弓卫',6,5,220,23,'ranged')]),
    caravan:encounter('最后的镖队',8,'护住证人镖车 7 回合。你离追兵更近时，他们会转而攻击你。',[enemy('caravan1','劫镖刀手',6,3,210,27),enemy('caravan2','劫镖弓手',6,1,190,23,'ranged')],{goal:'protect',limit:7,ally:{name:'证人镖车',x:1,y:5,hp:220},waves:[{round:3,enemies:[enemy('caravan3','断后毒师',7,5,200,20,'poison')]},{round:5,enemies:[enemy('caravan4','追击盾手',7,1,240,27,'shield')]}]}),
    heart:encounter('剑阵之心',9,'两根阵柱共护主将。每破一柱都会打开一条走位路线；半血时他将召来亲卫。',[enemy('heart','阵心守将',6,3,470,32,'boss'),enemy('heart-pillar1','阳阵柱',5,1,175,0,'totem'),enemy('heart-pillar2','阴阵柱',5,5,175,0,'totem')],{reinforcements:true,pattern:'line'})
  });
  Object.assign(encounters.escort,{goal:'protect',ally:{name:'林镖头',x:1,y:5,hp:155},level:4});
  const rebalance={bandits:[2,1.65,1.25],escort:[4,1.7,1.45],spies:[5,1.65,1.5],gate:[6,1.65,1.5],chief:[6,1.7,1.5],trial:[7,1.8,1.6],ambush:[8,1.8,1.5],sealEast:[9,1.7,1.6],sealWest:[9,1.7,1.6],final:[9,1.8,1.45]};
  for(const[id,[level,hp,atk]]of Object.entries(rebalance)){encounters[id].level=level;encounters[id].enemies=encounters[id].enemies.map(e=>e.map((v,i)=>i===4?Math.round(v*hp):i===5?Math.round(v*atk):v));}
  encounters.chief.reinforcements=true;encounters.chief.pattern='line';encounters.final.reinforcements=true;encounters.final.hazard='fire';encounters.final.pattern='cross';
  encounters.final.enemies.push(enemy('final-pillar','风雷阵柱',4,1,180,0,'totem'));
  const contracts=[
    ['c1','芦荡除毒','venom',3,'毒雾封住渡口。拆散毒师与药师的配合。','fangCharm'],
    ['c2','一夜守渡','bridge',3,'守住渡口六回合，熬过两次援军。',''],
    ['c3','镖路不绝','escort',4,'把受伤镖师带回家，别只顾自己的气血。','jadeCharm'],
    ['c4','夺回哨塔','outpost',5,'守住阵位，阻止寨匪重新点起狼烟。',''],
    ['c5','密道追逃','escape',5,'赶在追兵合围前走到出口。','hawkCharm'],
    ['c6','药师的阴谋','supplies',6,'对方能治疗，就先切断治疗。',''],
    ['c7','无声的试剑','mirror',7,'独自与照心剑客再战。','breakCharm'],
    ['c8','最后一程','caravan',8,'护送证人穿过七回合围攻。',''],
    ['c9','重镇风雷','heart',9,'拆柱、压制、断援，完成最后一道悬赏。','emberCharm']
  ].map(([id,name,encounter,level,description,item],i)=>({id,name,encounter,level,description,need:i?`c${i}`:null,rewards:{xp:70+i*18,gold:90+i*20,items:{merit:2+(i>5?1:0),...(item?{[item]:1}:{ore:2})}}}));
  const blessings={edge:{name:'剑锋',description:'本次剑冢攻击 +7。'},breath:{name:'息流',description:'本次剑冢每回合回气 +2。'},shell:{name:'铁壁',description:'本次剑冢防御 +3。'},mercy:{name:'回春',description:'每场胜利恢复 25 气血。'},break:{name:'破军',description:'本次剑冢破势值 +8。'},supply:{name:'药囊',description:'本次剑冢每战额外使用一次药物。'}};
  const floors=['fordBandits','venom','bridge','outpost','supplies','mirror','escape','prison','cliffAmbush','caravan','heart','final'];
  Object.assign(story,{legacyQuestIds,contracts,blessings,floors,index});
  return story;
}
if(typeof module!=='undefined'&&module.exports)module.exports=expandJianghu;
