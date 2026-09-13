'use strict';

const JianghuStory = (() => {
  const chapters = [
    { name:'山水初逢', subtitle:'一封旧信，一次为他人拔剑。', from:0, to:6, home:'village', description:'走访梧桐村，为伤者寻药，击退竹林山匪，护送镖师回乡。旧信中的剑印，指向平康城的一桩旧案。' },
    { name:'平康风雨', subtitle:'灯火千家，暗流在市井之间。', from:7, to:15, home:'city', description:'入城寻访陆青霜，收集三条线索，追踪密探。夜袭黑风寨、解开断桥机关，查出劫镖背后的主使。' },
    { name:'剑照归途', subtitle:'问剑先问心，归来仍是少年。', from:16, to:25, home:'temple', description:'登武当、悟三碑，与师兄试剑。走入落霞谷，破除三处阵眼，迎战玄鸦，找回父辈留下的真相。' }
  ];
  const locations = {
    village:{name:'梧桐村',region:'江南道 · 炊烟人家',poem:'竹影摇风，炊烟待故人。',ambient:'风过竹林 · 鸟鸣山涧',safe:true,unlock:0,spawn:{x:11,y:17},theme:'village',note:'白芷免费诊治，溪畔可垂钓。'},
    bamboo:{name:'青竹径',region:'江南道 · 竹海幽径',poem:'一径入青竹，风声藏剑意。',ambient:'竹海听涛 · 行路当心',safe:false,unlock:3,spawn:{x:11,y:21},theme:'bamboo',note:'先救竹林中的伤者，再护送归村。'},
    city:{name:'平康城',region:'江南道 · 烟火重城',poem:'十里灯火，照不尽人心。',ambient:'街市人声 · 灯下旧闻',safe:true,unlock:7,spawn:{x:11,y:21},theme:'city',note:'城中可问线索、锻造兵刃、接取委托。'},
    camp:{name:'黑风寨',region:'苍梧山 · 山寨险关',poem:'风吹寨旗，刀光隐于夜。',ambient:'山风猎猎 · 寨鼓低鸣',safe:false,unlock:11,spawn:{x:12,y:22},theme:'camp',note:'解开绞盘机关，才能直取寨主。'},
    temple:{name:'武当山',region:'荆襄道 · 云外青山',poem:'松风不语，一剑问本心。',ambient:'晨钟松涛 · 云海无声',safe:true,unlock:16,spawn:{x:12,y:21},theme:'temple',note:'三座剑碑各有一问，答案就在碑文中。'},
    valley:{name:'落霞谷',region:'荆襄道 · 丹枫绝谷',poem:'落霞染剑，故人盼归途。',ambient:'枫叶如火 · 崖下风雷',safe:false,unlock:20,spawn:{x:12,y:22},theme:'valley',note:'破除三处阵眼，留意首领的蓄力区域。'}
  };
  const quests = [
    {id:'letter',chapter:0,title:'一封旧信',kind:'talk',location:'village',target:'elder',guide:'前往柳伯',objective:'向柳伯出示故人来信',description:'信纸上只写着「江南梧桐，故人相候」。去见村长柳伯，问问信中那枚剑印。',lines:['这枚剑印……你果然来了。信是十六年前留下的，写信的人，曾舍命护过这一村百姓。','旧事容我慢慢讲。村外的镖师遭了山匪，白芷正缺药救人。你先替她采三株青灵草，回来我便告诉你剑印的去处。'],reply:'先去救人',rewards:{xp:20,gold:30}},
    {id:'herbs',chapter:0,title:'山野寻药',kind:'collect',location:'village',targets:['herb1','herb2','herb3'],guide:'寻找下一株草药',objective:'采集三株青灵草',description:'青灵草分布在村北林边、东岸溪畔和南边菜圃。采齐后带回药庐。',rewards:{xp:15}},
    {id:'medicine',chapter:0,title:'药香故人',kind:'talk',location:'village',target:'doctor',guide:'将草药交给白芷',objective:'把三株青灵草送到药庐',description:'药已采齐，伤者还在等待。白芷似乎听到了青竹径上更不寻常的消息。',lines:['三株，一株不少。多谢你，有这些药，村中几个伤者就能熬过今晚。','还有一位姓林的镖头留在竹林里。那些山匪只搜文书，连银子都顾不上抢，绝非寻常劫道。','这些金疮药和养气丹你带上。清风掠影能伤及挨在一起的敌人；实在不支就先退回来，命比逞强重要。'],reply:'带药入竹林',rewards:{xp:30,items:{potion:3,qi:2},consume:{herb:3},heal:true}},
    {id:'bamboo-fight',chapter:0,title:'试剑青竹',kind:'battle',location:'bamboo',target:'bandits',encounter:'bandits',guide:'前往迎战山匪',objective:'击退堵路的三名山匪',description:'山匪在竹林中翻找散落的镖货。打通道路，才能找到失踪的林镖头。',rewards:{xp:90,gold:65,items:{steel:1,manual:1}}},
    {id:'rescue',chapter:0,title:'竹林救急',kind:'talk',location:'bamboo',target:'wounded',guide:'寻找林镖头',objective:'救起竹林深处的林镖头',description:'断裂的镖旗后传来呼救。林镖头伤势不轻，但紧紧护着一枚断裂的铜牌。',lines:['少侠……别碰那只黑匣。匪徒要找的，就是匣中那张旧镖单。','我护了半辈子镖，头一回知道一页纸也能引来这么多刀。你信上的剑印，我在平康城的陆家镖局见过。','我还能走。只求你陪我下山一程，村口还有他们的接应。'],reply:'替他包扎，护送下山',rewards:{xp:35,items:{seal:1,potion:2},rep:1}},
    {id:'escort',chapter:0,title:'风雨护镖',kind:'battle',location:'bamboo',target:'escort-ambush',encounter:'escort',guide:'护送至竹林出口',objective:'击败拦路的追风刀客',description:'山匪的追风刀客拦住了归路。弓手射程更远，先逼近他们，注意给自己留出用药的回合。',rewards:{xp:100,gold:80,items:{vest:1,qi:2}}},
    {id:'chapter-one-end',chapter:0,title:'故人剑印',kind:'talk',location:'village',target:'elder',guide:'回村报平安',objective:'将铜牌与镖师的消息告诉柳伯',description:'林镖头平安回村。柳伯终于拿出一封真正留给你的旧信，平康城的灯火在远方等你。',lines:['人救回来了，这一趟便不枉走。你手里那枚铜牌，属于十六年前的济民镖队。','写信的是你的父亲，宇文衡。当年镖队押送赈灾账册，却在落霞谷遭人灭口。他把你送出重围，便再也没有回来。','账册的一半，被托付给平康城陆家。去寻陆青霜吧，她也在查这桩案子。记住，剑为护人，切莫只为报仇。'],reply:'告别梧桐村，启程平康',chapterEnd:true,rewards:{xp:65,gold:100,items:{potion:3,manual:1},heal:true}},

    {id:'city-arrival',chapter:1,title:'平康来客',kind:'talk',location:'city',target:'qingshuang',guide:'拜访陆青霜',objective:'在平康城找到陆青霜',description:'城里到处是镖局失镖的传闻。桥边的青衣女子正向过往行商问话，她腰间也佩着半枚剑印。',lines:['你就是宇文逸？柳伯的信我收到了。这半枚剑印，我等了许多年。','陆家最近接到一趟旧镖，却在入城前被劫。黑风寨放话要银子，城里的买家却只问账册。','先别急着上山。去问客栈小二、药铺掌柜和城南的老乞者。人会说谎，三条不相识的线索却很难一起说谎。'],reply:'分头查访',rewards:{xp:45,gold:40}},
    {id:'city-clues',chapter:1,title:'市井听风',kind:'clues',location:'city',targets:['barkeep','apothecary','beggar'],guide:'走访下一位知情人',objective:'收集客栈、药铺、城南三条线索',description:'问话时留意青衣客、止血药和出城的车辙。得到的线索会记入江湖志。',rewards:{xp:50,gold:45}},
    {id:'city-spies',chapter:1,title:'夜市追踪',kind:'battle',location:'city',target:'spies',encounter:'spies',guide:'追踪青衣密探',objective:'截住准备出城的密探',description:'三条线索指向同一个人：青衣、左手有伤、夜间运货。你在城东拦住他，他却先拔出了刀。',rewards:{xp:110,gold:90,items:{manifest:1,ore:2,potion:2}}},
    {id:'city-alliance',chapter:1,title:'断镖疑云',kind:'talk',location:'city',target:'qingshuang',guide:'与陆青霜核对镖单',objective:'交出密探携带的旧镖单',description:'镖单上的落款竟是一位早已过世的总镖头。真镖、假货与赈灾账册，在此刻连成一线。',lines:['这是假镖单，盖的却是陆家的旧印。有人借黑风寨的手，逐个清除当年的知情者。','寨主厉无咎就是当年的领路人。账册在他手里，镖师周叔也被关在寨中。我们今夜就上山。','此后我与你同行。交战时，每两个回合我会用破风箭援护；你也可以在侠客面板里选择独行。'],reply:'结伴夜入黑风寨',rewards:{xp:55,companion:'qingshuang',items:{qi:2}}},
    {id:'camp-gate',chapter:1,title:'寨门夜袭',kind:'battle',location:'camp',target:'gate-guard',encounter:'gate',guide:'攻破黑风寨外哨',objective:'击败寨门守卫',description:'外哨有盾手与弓手。盾手皮厚，弓手射得远；同伴援护将在每两个回合自动发动。',rewards:{xp:125,gold:100,items:{armor:1,potion:3,ore:2}}},
    {id:'winch',chapter:1,title:'断桥机括',kind:'puzzle',location:'camp',target:'winch',puzzle:'winch',guide:'查看断桥绞盘',objective:'依石刻顺序打开绞盘机关',description:'内寨吊桥升起，绞盘上刻着水、风、山三印。旁边的石刻，是旧镖师留下的开桥口诀。',rewards:{xp:50}},
    {id:'camp-chief',chapter:1,title:'黑风寨主',kind:'battle',location:'camp',target:'camp-chief',encounter:'chief',guide:'迎战厉无咎',objective:'击败厉无咎与他的亲随',description:'厉无咎的刀势沉重。气血降至一半时他会狂怒，并蓄力横扫标记区域；看清预警，提前移步。',rewards:{xp:185,gold:160,items:{blacksteel:1,manual:2,ledger:1}}},
    {id:'prisoner',chapter:1,title:'镖局旧案',kind:'choice',location:'camp',target:'prisoner',guide:'解救被囚镖师',objective:'向周镖师查明账册去向',description:'周镖师认出了剑印。他的回答，会让十六年前那场劫镖露出真正的面目。',lines:['厉无咎只是看门的狗，真正买命的人叫玄鸦。他如今在落霞谷重布剑阵，想把所有证据一并烧掉。','另一半账册在武当清虚道长那里。你父亲当年送走的不是金银，而是被人侵吞的赈灾银名册。','寨中还有被掳的百姓和追回的赃银。少侠，这笔银子，你打算如何处置？'],choices:[{id:'relief',label:'将赃银分给被掳百姓',description:'侠义 +3，获得谢礼与伤药。',rewards:{rep:3,items:{potion:3,manual:1}}},{id:'evidence',label:'封存赃银，交还镖局作证',description:'侠义 +1，获得 100 铜钱办案盘缠。',rewards:{rep:1,gold:100}}],rewards:{xp:60}},
    {id:'chapter-two-end',chapter:1,title:'风雨暂歇',kind:'talk',location:'city',target:'qingshuang',guide:'回平康城整理线索',objective:'与陆青霜商定北上武当',description:'黑风寨已破，平康城恢复安宁。陆青霜准备好荐书，与你踏上通往武当的山路。',lines:['周叔安然回家了。那些被劫的镖货，也都送回失主手里。今夜，平康城终于能睡个安稳觉。','玄鸦与落霞谷，我会陪你查到底。这封荐书，清虚道长看过便知道我们的来意。','路上别忘了去铁匠铺。玄铁矿可以淬炼剑锋，武当的对手，比寨中刀客更懂剑。'],reply:'持荐书，登武当',chapterEnd:true,rewards:{xp:90,gold:140,items:{recommendation:1,ore:2,potion:3,qi:2},heal:true}},

    {id:'wudang-arrival',chapter:2,title:'问道武当',kind:'talk',location:'temple',target:'taoist',guide:'拜见清虚道长',objective:'向清虚道长递交荐书',description:'云海尽处是武当山门。清虚道长并不急着谈账册，他先问你，为什么拔剑。',lines:['宇文衡的孩子，终于长大了。账册我保管了十六年，却不敢轻易交给一颗只剩仇恨的心。','山中有三座剑碑，分别问仁、勇、智。你不必答得漂亮，只需想明白，手中之剑究竟要护住什么。','读过三碑，再与知客师兄试剑。那时，我会把你父亲留下的话原原本本地告诉你。'],reply:'入山问剑',rewards:{xp:65}},
    {id:'steles',chapter:2,title:'三碑问剑',kind:'steles',location:'temple',targets:['stele-ren','stele-yong','stele-zhi'],guide:'参悟下一座剑碑',objective:'参悟仁、勇、智三座剑碑',description:'仁者知所护，勇者知所为，智者知进退。仔细读碑文，再作选择；答错也可以重新参悟。',rewards:{xp:80,items:{manual:1}}},
    {id:'wudang-trial',chapter:2,title:'山门试剑',kind:'battle',location:'temple',target:'disciple',encounter:'trial',guide:'请知客师兄赐教',objective:'通过武当剑阵的试炼',description:'师兄与弟子将从两侧夹击。把握守势与走位，证明你已懂得三碑之意；胜后可学会绝学「剑归沧海」。',rewards:{xp:160,items:{robe:1,manual:1},skill:'ultimate',heal:true}},
    {id:'old-sword',chapter:2,title:'松风旧事',kind:'talk',location:'temple',target:'mowen',guide:'与莫问谈旧事',objective:'听莫问讲述父亲最后一战',description:'松下的游侠早已等候多时。曾在村中教你进退的莫问，原来亲历过那场旧案。',lines:['十六年前，我也在那支镖队里。你父亲本能突围，却回头救了落下的百姓。是他把你交到我手上。','玄鸦说世人只为利而动，你父亲偏要证明还有别的。他留下的最后一句话，是「别教这孩子只记得仇」。','我随你去落霞谷。青霜善于远袭，我擅守护；出战前，你可决定由谁从旁援护。此去不是寻死，是把人和真相都带回来。'],reply:'带着真相，走入落霞谷',rewards:{xp:70,companion:'mowen',items:{potion:3,qi:3},heal:true}},
    {id:'valley-ambush',chapter:2,title:'风起落霞',kind:'battle',location:'valley',target:'valley-ambush',encounter:'ambush',guide:'突破落霞谷伏兵',objective:'击败断魂客与谷口弓手',description:'山谷中的伏兵早已等候。断魂客会蓄力重击；先清理远处弓手，再与他周旋。',rewards:{xp:160,gold:130,items:{qingming:1,ore:3,potion:3}}},
    {id:'seals',chapter:2,title:'风雷三阵',kind:'seals',location:'valley',targets:['seal-east','seal-west','seal-north'],guide:'破除下一处阵眼',objective:'破解赤、青、玄三处阵眼',description:'两处阵眼有高手把守，玄阵则藏着机关。逐一破阵，崖顶的道路才会敞开。',rewards:{xp:95,gold:80,items:{qi:3,manual:1}}},
    {id:'valley-choice',chapter:2,title:'崖前抉择',kind:'choice',location:'valley',target:'hostage',guide:'救出崖前的人质',objective:'救下镖局传人，决定破敌之策',description:'阵眼已破，玄鸦仍以人质相挟。陆青霜示意你稳住对方，莫问则盯住了阵中残留的铁索。',lines:['我听到玄鸦说，最后的剑阵还藏着一道反噬。他的令牌就在刑台铁索旁，拿到它，就能削去阵法的威力。','可崖顶的账册也正被火盆烘着。少侠，救人和取证，你要先做哪一件？'],choices:[{id:'save',label:'先破铁索，护人周全',description:'侠义 +3；得到令牌，玄鸦气血降低 45。',rewards:{rep:3,items:{token:1,potion:2}}},{id:'proof',label:'让同伴救人，自己抢出账册',description:'侠义 +2；证据齐全，决战攻击 +7。',rewards:{rep:2,items:{testimony:1}}}],rewards:{xp:55}},
    {id:'final-battle',chapter:2,title:'玄鸦决战',kind:'battle',location:'valley',target:'xuanya',encounter:'final',guide:'直面玄鸦',objective:'击败玄鸦，终结落霞谷旧案',description:'风雷剑阵最后一次亮起。玄鸦会在半血后变招，蓄力区域中的重击尤其危险。留住真气，善用绝学与同伴援护。',rewards:{xp:280,gold:220,items:{wufeng:1,ledger:1}}},
    {id:'return-seal',chapter:2,title:'归还剑印',kind:'talk',location:'temple',target:'taoist',guide:'回武当交还账册',objective:'将证据与剑印交给清虚道长',description:'两半账册终于合拢，赈灾旧案得见天日。你已知道自己的来处，也有权选择今后的去路。',lines:['账册上的每一笔，都对应一个被侵吞的村庄。青霜会将证人与账册一同送官，再没有人能把这件事抹去。','这是你父亲的剑印。它不是什么号令江湖的宝物，只是镖师向受托之人许下的一诺。','仇怨到这里便够了。回梧桐村看看吧，柳伯留了灯，白芷温着药，活着的人还在等你。'],reply:'收好剑印，归乡',rewards:{xp:100,gold:160,heal:true}},
    {id:'homecoming',chapter:2,title:'山水重逢',kind:'talk',location:'village',target:'elder',guide:'返回梧桐村',objective:'向故人讲述这段江湖',description:'从一封旧信出发，带着完整的答案归来。三章江湖，在最初的炊烟里落笔。',lines:['你回来了。看你的眼睛，想必该问的，都已经问明白了。','青霜的信先到了：平康城正替镖队立碑，山里的百姓也都平安回了家。你父亲会为你高兴的。','从今往后，是留在村里，还是再走远路，都由你自己决定。门前的石桥还在，这里永远有你的一盏灯。'],reply:'将这一程，记入江湖',chapterEnd:true,rewards:{xp:100,gold:180,rep:2,heal:true}},
    {id:'free-roam',chapter:2,title:'江湖未远',kind:'free',location:'city',target:'board',guide:'查看自由历练',objective:'三章主线全部完成',description:'旧案已结，故人无恙。六处山水均可自由往来，还能完成委托、锻造兵刃，挑战平康擂台。',rewards:{}}
  ];
  const sites = {
    village:[
      {id:'elder',name:'柳伯',title:'村长',x:11,y:10,type:'npc',color:'#a8a387',feature:'jade'},
      {id:'doctor',name:'白芷',title:'药庐',x:6,y:14,type:'npc',color:'#c2d8bd',feature:'clinic'},
      {id:'merchant',name:'钱掌柜',title:'行商',x:14,y:14,type:'npc',color:'#b7946c',feature:'shop'},
      {id:'swordsman',name:'莫问',title:'游侠',x:10,y:20,type:'npc',color:'#769bab',feature:'spar'},
      {id:'inn',name:'云来客栈',title:'歇脚',x:14,y:8,type:'sign',feature:'inn'},
      {id:'herb1',name:'青灵草',x:4,y:7,type:'herb'},{id:'herb2',name:'青灵草',x:21,y:12,type:'herb'},{id:'herb3',name:'青灵草',x:7,y:20,type:'herb'},
      {id:'fish',name:'溪畔垂钓',title:'闲趣',x:16,y:18,type:'fish',feature:'fish'},
      {id:'chest',name:'溪畔旧箱',title:'拾遗',x:21,y:17,type:'chest',feature:'chest',loot:{gold:48,items:{jade:1}}},
      {id:'exit',name:'青竹径',title:'离村',x:22,y:13,type:'exit',travel:'bamboo'}
    ],
    bamboo:[
      {id:'bandits',name:'黑风寨山匪',title:'迎战',x:12,y:10,type:'enemy',color:'#b96c50',encounter:'bandits',min:3,max:3},
      {id:'wounded',name:'林镖头',title:'伤者',x:14,y:7,type:'npc',color:'#b69b76',min:4,max:4},
      {id:'escort-ambush',name:'追风刀客',title:'护镖',x:11,y:17,type:'enemy',color:'#b66c56',encounter:'escort',min:5,max:5},
      {id:'back',name:'梧桐村',title:'归村',x:11,y:22,type:'exit',travel:'village'},
      {id:'spring',name:'山间清泉',title:'调息',x:7,y:16,type:'spring',feature:'heal'},
      {id:'bamboo-ore',name:'溪石玄铁',x:20,y:16,type:'ore',feature:'ore'},
      {id:'bamboo-chest',name:'遗落镖箱',x:7,y:8,type:'chest',feature:'chest',loot:{gold:35,items:{potion:1,ore:1}}}
    ],
    city:[
      {id:'qingshuang',name:'陆青霜',title:'镖局传人',x:11,y:15,type:'npc',color:'#8eafba',blurb:'账册的事有了线索，随时来找我。',feature:'party'},
      {id:'barkeep',name:'店小二',title:'长风客栈',x:7,y:9,type:'npc',color:'#bba777',feature:'inn'},
      {id:'apothecary',name:'药铺掌柜',title:'济安堂',x:16,y:9,type:'npc',color:'#b9c79e',feature:'clinic'},
      {id:'beggar',name:'老乞者',title:'市井耳目',x:6,y:18,type:'npc',color:'#8e8c70',blurb:'这世间的事，站得低些，有时反而看得清。'},
      {id:'spies',name:'青衣密探',title:'追踪',x:17,y:17,type:'enemy',color:'#718f96',encounter:'spies',min:9,max:9},
      {id:'smith',name:'铁匠唐铸',title:'锻造',x:15,y:14,type:'npc',color:'#b98665',feature:'forge'},
      {id:'courier',name:'镖局伙计',title:'失货委托',x:7,y:14,type:'npc',color:'#c1af7c',feature:'crates'},
      {id:'crate1',name:'散落镖货',x:4,y:16,type:'crate',feature:'crate'},
      {id:'crate2',name:'散落镖货',x:18,y:10,type:'crate',feature:'crate'},
      {id:'crate3',name:'散落镖货',x:16,y:21,type:'crate',feature:'crate'},
      {id:'board',name:'平康擂台',title:'自由历练',x:12,y:18,type:'sign',feature:'arena'},
      {id:'city-shop',name:'行商孙九',title:'补给',x:18,y:14,type:'npc',color:'#b99d70',feature:'shop'},
      {id:'city-exit',name:'江湖驿站',x:11,y:23,type:'exit',feature:'map'}
    ],
    camp:[
      {id:'gate-guard',name:'黑风外哨',title:'寨门',x:12,y:18,type:'enemy',color:'#a97855',encounter:'gate',min:11,max:11},
      {id:'winch',name:'断桥绞盘',title:'机关',x:7,y:14,type:'mechanism',min:12,puzzle:'winch'},
      {id:'camp-chief',name:'厉无咎',title:'黑风寨主',x:12,y:8,type:'enemy',color:'#ae5f48',encounter:'chief',min:13,max:13},
      {id:'prisoner',name:'周镖师',title:'被囚镖师',x:7,y:7,type:'npc',color:'#b4a987',min:14,max:14},
      {id:'camp-spring',name:'寨外山泉',x:6,y:19,type:'spring',feature:'heal'},
      {id:'camp-chest',name:'寨中铁箱',x:17,y:9,type:'chest',feature:'chest',loot:{gold:85,items:{ore:2,qi:1}}},
      {id:'camp-ore',name:'玄铁矿脉',x:20,y:17,type:'ore',feature:'ore'},
      {id:'camp-exit',name:'返回平康城',x:12,y:23,type:'exit',travel:'city'}
    ],
    temple:[
      {id:'taoist',name:'清虚道长',title:'武当长老',x:12,y:8,type:'npc',color:'#bec9b6',feature:'heal'},
      {id:'stele-ren',name:'仁字剑碑',title:'问仁',x:7,y:12,type:'stele',puzzle:'ren'},
      {id:'stele-yong',name:'勇字剑碑',title:'问勇',x:16,y:10,type:'stele',puzzle:'yong'},
      {id:'stele-zhi',name:'智字剑碑',title:'问智',x:17,y:17,type:'stele',puzzle:'zhi'},
      {id:'disciple',name:'知客师兄',title:'试剑',x:12,y:15,type:'enemy',color:'#92adaf',encounter:'trial',min:18,max:18},
      {id:'mowen',name:'莫问',title:'故人',x:8,y:18,type:'npc',color:'#769bab',feature:'party'},
      {id:'temple-spring',name:'松间灵泉',x:20,y:16,type:'spring',feature:'heal'},
      {id:'temple-shop',name:'云游道人',title:'山中补给',x:18,y:12,type:'npc',color:'#bcc6a3',feature:'shop'},
      {id:'temple-chest',name:'松下藏经匣',x:5,y:9,type:'chest',feature:'chest',loot:{items:{manual:1,qi:2}}},
      {id:'temple-exit',name:'山门驿道',x:12,y:23,type:'exit',feature:'map'}
    ],
    valley:[
      {id:'valley-ambush',name:'断魂客',title:'谷口伏兵',x:12,y:18,type:'enemy',color:'#b78071',encounter:'ambush',min:20,max:20},
      {id:'seal-east',name:'赤阵剑卫',title:'赤阵',x:7,y:12,type:'enemy',color:'#c68764',encounter:'sealEast',min:21,max:21},
      {id:'seal-west',name:'青阵弓卫',title:'青阵',x:18,y:13,type:'enemy',color:'#7caaa2',encounter:'sealWest',min:21,max:21},
      {id:'seal-north',name:'玄阵机碑',title:'玄阵',x:13,y:9,type:'stele',puzzle:'seal',min:21},
      {id:'hostage',name:'林晚晴',title:'被掳传人',x:16,y:8,type:'npc',color:'#d1b08e',min:22,max:22},
      {id:'xuanya',name:'玄鸦',title:'风雷剑主',x:12,y:5,type:'enemy',color:'#8b6c84',encounter:'final',min:23,max:23},
      {id:'valley-spring',name:'枫间清泉',x:6,y:18,type:'spring',feature:'heal'},
      {id:'valley-ore',name:'赤岩玄铁',x:21,y:17,type:'ore',feature:'ore'},
      {id:'valley-chest',name:'崖边药箱',x:8,y:8,type:'chest',feature:'chest',loot:{items:{elixir:2,qi:3}}},
      {id:'valley-exit',name:'返回武当山',x:12,y:23,type:'exit',travel:'temple'}
    ]
  };
  const clues = {
    barkeep:{title:'客栈线索 · 夜半伤客',lines:['前日有个青衣客包了后院，左手一直缠着绷带。天没亮就走，还嘱咐我别替他叫车。','可他落下一张药单，明明写着上好的止血药。我看他那伤口，可不像被树枝划的。'],entry:'客栈：青衣客左手受伤，夜半离店，曾购买止血药。'},
    apothecary:{title:'药铺线索 · 刀伤药方',lines:['是有人来买过药，青衣，左手刀伤。他说运货时出了意外，却挑了只有走镖人才用的止血散。','临走前他向我问城东的偏门，怕是要趁夜出城。你若找他，留意那辆盖着灰布的板车。'],entry:'药铺：伤口来自刀刃，客人询问城东偏门与夜间出城路线。'},
    beggar:{title:'城南线索 · 灰篷板车',lines:['灰布板车？见过。车上响的是纸页和木匣，压下的车辙却偏偏很深，怕是还藏了兵刃。','车夫换了一身青衣，现下正往东边走。小兄弟，别站在那辆车的正前头，他袖子里有弩。'],entry:'城南：灰布车藏有兵刃，青衣车夫正向城东移动。'}
  };
  const puzzles = {
    winch:{title:'断桥机括',hint:'石刻：「先止流水，次借长风，终镇青山。」依次按下对应的印记。',symbols:['山','水','风'],answer:['水','风','山'],success:'水闸合，风轮起，镇石落下。吊桥缓缓放平，内寨道路已通。'},
    ren:{title:'仁字剑碑',hint:'碑文：「剑锋虽利，不及护人之心。强者有所不为，方能有所守。」若弱者受欺，当如何？',options:['避而不见，独善其身','止其刀锋，先护无辜','只问输赢，不问是非'],correct:1,success:'你在碑前收剑行礼。「仁」字剑意已明：先护无辜。'},
    yong:{title:'勇字剑碑',hint:'碑文：「勇非逞一时之快，义之所在，虽难亦往。」敌众我寡时，何为真正的勇？',options:['看清局势，仍不弃同伴','不顾他人，只争头功','只要有险，立即逃走'],correct:0,success:'你想起竹林里受伤的镖师。「勇」字剑意已明：不弃所护。'},
    zhi:{title:'智字剑碑',hint:'碑文：「知进知退，留力待时。锐气可敛，初心不可失。」对手蓄势待发，你应如何？',options:['留在原地，硬拼每一招','移步避锋，待隙再攻','弃去兵刃，任人摆布'],correct:1,success:'你看见虚实之间的一线空隙。「智」字剑意已明：知进知退。'},
    seal:{title:'玄阵机碑',hint:'碑文：「赤火熄，青风止，玄水归。」先后触动三枚阵印，令剑阵回归寂静。',symbols:['玄水','赤火','青风'],answer:['赤火','青风','玄水'],success:'最后一枚机括扣合，玄阵的风声终于停了。'}
  };
  const companions = {
    qingshuang:{name:'陆青霜',title:'破风箭 · 远袭援护',color:'#8eafba',description:'每两个回合射出一箭，对气血最低的敌人造成 18 + 境界 × 3 点伤害。'},
    mowen:{name:'莫问',title:'松风护剑 · 守护援护',color:'#769bab',description:'每回合第一次受击减伤 8 点；每两个回合恢复 18 + 境界 × 2 点气血。'}
  };
  const encounters = {
    bandits:{name:'试剑青竹',level:1,flavor:'山匪拔刀围来。先移动，再点击敌人出剑；每回合可用一次招式。',enemies:[['scout','持刀山匪',5,2,43,9],['thug','山匪喽啰',6,5,43,10],['chief','黑风寨头目',6,3,76,13]]},
    escort:{name:'风雨护镖',level:2,flavor:'林镖头已经退到安全的树后。追风刀客带着两名弓手，挡住最后一段归路。',enemies:[['escort-chief','追风刀客',5,3,105,14,'boss'],['bow1','竹林弓手',6,1,55,10,'ranged'],['bow2','竹林弓手',6,5,55,10,'ranged']]},
    spies:{name:'夜市追踪',level:2,flavor:'青衣密探掀翻货车，暗弩已对准街心。别让远处的弓弩持续消耗你。',enemies:[['spy','青衣密探',6,3,112,14,'ranged'],['spy-blade','短刀护卫',5,2,70,12],['spy-blade2','短刀护卫',5,5,70,12]]},
    gate:{name:'寨门夜袭',level:3,flavor:'寨鼓惊起。盾手压阵，弓手在后，陆青霜已经搭箭待发。',enemies:[['shield','寨门盾卫',5,3,115,14,'shield'],['gate-bow','寨楼弓手',6,1,75,12,'ranged'],['gate-blade','寨门刀手',6,5,85,14]]},
    chief:{name:'黑风寨主',level:4,flavor:'厉无咎的刀风卷起落叶。看见红色蓄力格时，移出那片区域，或凝神守势。',enemies:[['li','厉无咎',6,3,215,19,'boss'],['li-guard','寨主亲随',5,1,90,14],['li-guard2','寨主亲随',5,5,90,14]]},
    trial:{name:'山门试剑',level:4,flavor:'「请。」师兄剑出如松风。此战点到为止，胜负之后都会替你调息。',training:true,enemies:[['disciple','知客师兄',6,3,190,17,'boss'],['disciple2','武当弟子',5,1,95,13],['disciple3','武当弟子',5,5,95,13]]},
    ambush:{name:'风起落霞',level:5,flavor:'断魂客从枫林中现身，两支暗箭已先他而来。气血不足时，莫忘手中的伤药。',enemies:[['duanhun','断魂客',6,3,200,20,'boss'],['valley-bow1','落霞弓卫',6,1,95,14,'ranged'],['valley-bow2','落霞弓卫',5,5,95,14,'ranged']]},
    sealEast:{name:'赤阵问锋',level:5,flavor:'赤阵由两名剑卫守护。坚守的盾势会削弱伤害，先打没有盾的那人。',objective:'seal-east',reward:{xp:65,gold:50},enemies:[['red-shield','赤阵盾卫',5,3,150,18,'shield'],['red-sword','赤阵剑卫',6,4,145,17]]},
    sealWest:{name:'青阵破风',level:5,flavor:'青阵的弓手拉开了距离。移动与清风掠影的三格剑气，可以逼他们放弃远袭。',objective:'seal-west',reward:{xp:65,gold:50},enemies:[['blue-bow','青阵弓卫',6,2,135,17,'ranged'],['blue-sword','青阵剑卫',5,4,155,18]]},
    final:{name:'玄鸦决战',level:6,flavor:'「你父亲护不住的，你也护不住。」玄鸦剑锋一转，风雷阵最后一次轰鸣。',enemies:[['xuanya','玄鸦',6,3,355,23,'boss'],['raven1','玄衣剑卫',5,1,120,16],['raven2','玄衣弩卫',6,5,110,16,'ranged']]},
    spar:{name:'松下切磋',level:1,flavor:'莫问抬手相邀：「点到为止。先看看你的步法。」',practice:true,enemies:[['spar','莫问',5,3,95,10]]},
    arena:{name:'平康擂台',level:3,flavor:'鼓响三声，群侠登台。擂台对手会随你的境界成长，胜后获得修为与盘缠。',practice:true,scales:true,enemies:[['arena-master','擂台剑客',6,3,150,15,'boss'],['arena-bow','擂台弓客',6,1,90,12,'ranged'],['arena-fist','擂台拳客',5,5,100,13]]}
  };
  const data={chapters,locations,quests,sites,clues,puzzles,companions,encounters};
  return typeof module!=='undefined'&&module.exports?require('./expansion.js')(data):expandJianghu(data);
})();
if(typeof module!=='undefined'&&module.exports)module.exports=JianghuStory;
