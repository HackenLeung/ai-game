'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url'),R=require('./rules.js'),AI=require('./test-strategy.cjs');
const bundled=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||(fs.existsSync(bundled)?bundled:'playwright'));
const output=process.env.GAME_SCREENSHOT_DIR||path.join(os.tmpdir(),'wandering-sword-check');fs.mkdirSync(output,{recursive:true});
const url=process.env.GAME_URL||pathToFileURL(path.join(__dirname,'index.html')).href;
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',SAVE='wandering-sword-v1';
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE);
const close=async page=>{if(await page.locator('#modal').evaluate(d=>d.open))await page.keyboard.press('Escape');};
const waitStage=(page,stage)=>page.waitForFunction(({key,stage})=>JSON.parse(localStorage.getItem(key))?.stage===stage,{key:SAVE,stage},{timeout:25000});
async function observe(page){
  await page.evaluate(()=>{
    if(window.__observingRules)return;window.__observingRules=true;
    const original=JianghuRules.makeBattle;
    JianghuRules.makeBattle=function(s,id,context){const b=original(s,id,context);window.__observedCombat={s,b};return b;};
  });
}
async function snapshot(page){const result=await page.evaluate(()=>{const {s,b}=window.__observedCombat;return{s,b:{...b,obstacle:[...b.obstacle]}};});result.b.obstacle=new Set(result.b.obstacle);return result;}
async function dialogue(page){await page.waitForSelector('#dialogue-next',{timeout:25000});while(await page.locator('#dialogue-next').isVisible())await page.locator('#dialogue-next').click();}
async function go(page,location){await close(page);const s=await saved(page);if(s.location===location)return;await page.keyboard.press('m');await page.locator(`[data-travel="${location}"]`).click();await page.waitForFunction(name=>document.querySelector('#location-name').textContent===name,R.STORY.locations[location].name);await page.waitForTimeout(180);}
async function tapWorld(page,x,y){
  await page.locator('#world').scrollIntoViewIfNeeded();await page.waitForTimeout(210);
  const point=await page.locator('#world').evaluate((canvas,{x,y})=>{
    const box=canvas.getBoundingClientRect(),s=JSON.parse(localStorage.getItem('wandering-sword-v1'));
    const ratio=Math.max(1,(box.height/760)/(box.width/1280)),center=ratio>1.15?Math.min(1280-1280/(2*ratio),Math.max(1280/(2*ratio),640+(s.x-s.y)*24)):640;
    return{x:box.left+((640+(x-y)*24-center)*ratio+640)/1280*box.width,y:box.top+(55+(x+y)*12-16)/760*box.height};
  },{x,y});await page.mouse.click(point.x,point.y);
}
async function moveBattle(page,x,y){
  await page.keyboard.press('0');await page.locator('#world').scrollIntoViewIfNeeded();await page.waitForTimeout(30);
  const point=await page.locator('#world').evaluate((canvas,{x,y})=>{
    const box=canvas.getBoundingClientRect(),ratio=Math.max(1,(box.height/760)/(box.width/1280)),zoom=ratio>1.35?Math.min(1,1.52/ratio):1;
    return{x:box.left+(640+(x-y)*54*ratio*zoom)/1280*box.width,y:box.top+(((210+(x+y)*28)-380)*zoom+380)/760*box.height};
  },{x,y});await page.mouse.click(point.x,point.y);
  await page.waitForFunction(({x,y})=>window.__observedCombat.b.player.x===x&&window.__observedCombat.b.player.y===y,{x,y},{timeout:3500});
}
async function prepare(page,{stock=3,heal=true}={}){
  await close(page);let s=await saved(page);assert.equal(s.expedition.active,false);
  await page.keyboard.press('b');
  for(const list of[['wufeng','qingming','blacksteel','steel','wood'],['robe','armor','vest','cloth']])for(const id of list)if(s.bag[id]){const b=page.locator(`[data-item="${id}"]`);if(await b.isEnabled())await b.click();break;}
  while(await page.locator('[data-item="manual"]').isVisible())await page.locator('[data-item="manual"]').click();
  await close(page);await page.keyboard.press('k');
  for(const id of['pierce','strike','heal','poison','sweep','ultimate']){s=await saved(page);if(s.skills[id]&&s.skills[id]<2&&await page.locator(`[data-learn="${id}"]`).isEnabled())await page.locator(`[data-learn="${id}"]`).click();}
  for(const id of['pierce','heal','strike','ultimate','poison','sweep'])for(let i=0;i<4;i++){s=await saved(page);if(!s.skills[id]||s.skills[id]>=3||!await page.locator(`[data-learn="${id}"]`).isEnabled())break;await page.locator(`[data-learn="${id}"]`).click();}
  await close(page);await page.keyboard.press('t');await page.locator('#modal [data-panel="shop"]').click();
  for(const id of['potion','qi','antidote','elixir']){
    const b=page.locator(`[data-buy="${id}"]`);if(!await b.count())continue;let s=await saved(page),want=id==='elixir'?Math.max(2,stock-1):stock;
    while((s.bag[id]||0)<want&&await b.isEnabled()){await b.click();s=await saved(page);}
  }
  await close(page);s=await saved(page);
  if(heal&&(s.hp<R.maxHp(s)||s.mp<R.maxMp(s))){
    let site=R.STORY.sites[s.location].find(p=>['heal','clinic'].includes(p.feature));
    if(!site){await go(page,'village');site=R.STORY.sites.village.find(p=>p.feature==='clinic');}
    await tapWorld(page,site.x,site.y);
    if(site.feature==='clinic'){await page.waitForSelector('#heal-free',{timeout:25000});await page.locator('#heal-free').click();}
    await page.waitForFunction(()=>{const s=JSON.parse(localStorage.getItem('wandering-sword-v1'));return s.hp===JianghuRules.maxHp(s)&&s.mp===JianghuRules.maxMp(s);},{},{timeout:25000});
  }
  await close(page);
}
async function battle(page,label,{capture=false}={}){
  await page.waitForSelector('#encounter-start',{timeout:25000});await page.locator('#encounter-start').click();await page.waitForSelector('#battle-banner:not([hidden])');
  if(capture)await page.screenshot({path:path.join(output,label+'-battle.png'),fullPage:true});
  let recorded=false,turns=0;
  for(;turns<95;turns++){
    await page.waitForFunction(()=>document.querySelector('#modal').open||window.__observedCombat.b.phase==='player',{},{timeout:10000});
    if(await page.locator('#modal').evaluate(d=>d.open))break;
    const {s,b}=await snapshot(page),action=AI.choose(s,b);
    if(capture&&!recorded&&(b.fire.length||R.living(b).some(e=>e.charge))){await page.screenshot({path:path.join(output,label+'-telegraph.png'),fullPage:true});recorded=true;}
    if(R.distance(action.pos,b.player))await moveBattle(page,action.pos.x,action.pos.y);
    if(await page.locator('#modal').evaluate(d=>d.open))break;
    if(['elixir','qi','antidote'].includes(action.skill)){await page.keyboard.press('b');await page.locator(`[data-item="${action.skill}"]`).click();}
    else{await page.locator(`[data-skill="${action.skill}"]`).click();if(action.id)await page.locator(`[data-enemy="${action.id}"]`).click();}
    await page.waitForFunction(round=>['won','lost'].includes(window.__observedCombat.b.phase)||window.__observedCombat.b.round>round,b.round,{timeout:10000});
  }
  await page.waitForFunction(()=>document.querySelector('#modal').open,{},{timeout:10000});
  const title=await page.locator('#modal-title').innerText();
  if(!title.endsWith('· 胜')){const snap=await snapshot(page);console.error('BATTLE FAILURE',label,{title,round:snap.b.round,hp:snap.s.hp,ally:snap.b.ally,reason:snap.b.reason,log:snap.s.log.slice(-8)});}
  assert.match(title,/· 胜$/);assert.ok(await page.locator('#battle-return').isVisible());
  console.log(`PASS UI ${label}; ${turns+1} actions; stage ${(await saved(page)).stage}`);return snapshot(page);
}
async function solve(page,puzzleId){
  const puzzle=R.STORY.puzzles[puzzleId];
  if(puzzle.kind==='lights'){
    await page.waitForSelector('[data-light]');assert.equal(await page.locator('[data-light]').count(),9);
    await page.locator('#lights-hint').click();assert.match(await page.locator('#puzzle-readout').innerText(),/最少还需/);
    for(const i of R.lightSolution(R.initialLights(puzzle)))await page.locator(`[data-light="${i}"]`).click();
  }else{
    await page.waitForSelector('[data-puzzle-option]');if(puzzle.answer){for(const value of puzzle.answer)await page.locator(`[data-puzzle-option="${puzzle.symbols.indexOf(value)}"]`).click();}
    else{const before=await saved(page);await page.locator(`[data-puzzle-option="${(puzzle.correct+1)%puzzle.options.length}"]`).click();assert.equal((await saved(page)).stage,before.stage);await page.locator(`[data-puzzle-option="${puzzle.correct}"]`).click();}
  }
}
async function walkthrough(page){
  const visited=new Set(),battleIds=[];
  for(let step=0;step<90;step++){
    let s=await saved(page);if(s.stage===R.terminal)break;
    const q=R.STORY.quests[s.stage],id=q.targets?.find(id=>!(s.progress[q.id]||[]).includes(id))||q.target,site=R.STORY.sites[q.location].find(p=>p.id===id);
    await go(page,q.location);if(!visited.has(q.location)){visited.add(q.location);await page.screenshot({path:path.join(output,q.location+'-expanded.png'),fullPage:true});}
    if(q.kind==='battle'||site.encounter&&q.targets?.includes(site.id))await prepare(page);
    await close(page);await page.locator('#quest-guide').click();
    if(q.kind==='talk'||q.kind==='clues')await dialogue(page);
    else if(q.kind==='choice'){
      await page.waitForSelector('[data-choice]');const choice=({'first-style':'focus','river-plan':'ford','temple-discipline':'breaker','valley-route':'road'})[q.id]||q.choices[0].id;
      await page.locator(`[data-choice="${choice}"]`).click();
    }else if(q.kind==='battle'||site.encounter&&q.targets?.includes(site.id)){
      const encounter=q.kind==='battle'?R.encounterFor(s,q):site.encounter;battleIds.push(encounter);await battle(page,encounter,{capture:['fordBandits','escape','prison','heart','final'].includes(encounter)});
    }else if(q.kind==='puzzle'||site.puzzle)await solve(page,q.puzzle||site.puzzle);
    else await page.waitForFunction(({stage,id})=>{const s=JSON.parse(localStorage.getItem('wandering-sword-v1'));return s.stage>stage||(s.progress[JianghuRules.STORY.quests[stage].id]||[]).includes(id);},{stage:s.stage,id},{timeout:25000});
    const after=await saved(page);assert.ok(after.stage>s.stage||(after.progress[q.id]||[]).length>(s.progress[q.id]||[]).length,`no progress after ${q.id}/${id}`);await close(page);
  }
  const end=await saved(page);assert.equal(end.stage,49);assert.equal(visited.size,9);assert.equal(battleIds.length,19);assert.equal(end.wins,19);assert.ok(end.bag.wufeng);
  fs.writeFileSync(path.join(output,'expanded-walkthrough-save.json'),JSON.stringify(end,null,2));
  console.log('PASS all 49 main stages, 19 battles, nine maps, three chapters and homecoming through UI');return end;
}
async function challenges(page){
  for(const c of R.STORY.contracts){
    await prepare(page);await page.keyboard.press('t');await page.locator(`[data-contract="${c.id}"]`).click();const before=await saved(page);await battle(page,c.id);const after=await saved(page);assert.equal(after.stage,before.stage);assert.equal(after.contracts.length,before.contracts.length+1);await close(page);await page.keyboard.press('t');assert.equal(await page.locator(`[data-contract="${c.id}"]`).isEnabled(),false);await close(page);
  }
  console.log('PASS nine bounties in order; rewards once; main progress preserved');
  await prepare(page,{stock:8});await page.keyboard.press('t');await page.locator('#tower-open').click();await page.locator('#tower-start').click();
  const blessings=['edge','shell','breath','mercy','break','edge','shell','breath','edge','mercy','shell'];
  for(let floor=1;floor<=12;floor++){
    let s=await saved(page);assert.equal(s.expedition.floor,floor);
    if(floor>1){await page.locator(`[data-blessing="${blessings[floor-2]}"]`).click();s=await saved(page);assert.equal(s.expedition.blessings.length,floor-1);}
    if(!s.expedition.rested&&(s.hp<R.maxHp(s)*.6||s.mp<R.maxMp(s)*.18)){await page.locator('#tower-rest').click();assert.equal((await saved(page)).expedition.rested,true);}
    await page.locator('#tower-continue').click();await battle(page,'tower-'+floor,{capture:floor===12});
    const cleared=await saved(page);assert.equal(cleared.expedition.best,floor);
    if(floor===1){
      await page.reload();await page.waitForSelector('#quest-guide');await observe(page);const reloaded=await saved(page);assert.equal(reloaded.expedition.floor,2);assert.equal(reloaded.expedition.choicePending,true);assert.equal(reloaded.hp,cleared.hp);assert.equal(reloaded.mp,cleared.mp);
      await page.keyboard.press('m');assert.match(await page.locator('#modal-title').innerText(),/剑冢/);await close(page);await page.keyboard.press('b');assert.equal(await page.locator('[data-item="potion"]').isEnabled(),false);await close(page);await page.locator('#quest-guide').click();
    }else if(floor<12)await page.locator('#battle-return').click();
  }
  const end=await saved(page);assert.equal(end.expedition.active,false);assert.equal(end.expedition.best,12);assert.equal(end.stage,49);fs.writeFileSync(path.join(output,'expanded-challenges-save.json'),JSON.stringify(end,null,2));
  console.log('PASS all twelve expedition floors, saved continuation, eleven blessings, resource carry and final reward');return end;
}
async function extras(page){
  await go(page,'village');await tapWorld(page,21,17);await page.waitForFunction(()=>JSON.parse(localStorage.getItem('wandering-sword-v1')).opened.includes('chest'),{},{timeout:25000});
  await tapWorld(page,11,10);await page.waitForSelector('#side-action',{timeout:25000});await page.locator('#side-action').click();assert.ok((await saved(page)).sideDone.includes('jade'));
  for(let i=1;i<=2;i++){await tapWorld(page,16,18);await page.waitForFunction(i=>JSON.parse(localStorage.getItem('wandering-sword-v1')).bag.fish>=i,i,{timeout:25000});}
  await tapWorld(page,6,14);await page.waitForSelector('#fish-commission',{timeout:25000});await page.locator('#fish-commission').click();await page.locator('#side-action').click();assert.ok((await saved(page)).sideDone.includes('fish'));
  await go(page,'city');for(const id of['crate1','crate2','crate3']){const site=R.STORY.sites.city.find(p=>p.id===id);await tapWorld(page,site.x,site.y);await page.waitForFunction(id=>JSON.parse(localStorage.getItem('wandering-sword-v1')).pickups.includes(id),id,{timeout:25000});}
  await tapWorld(page,7,14);await page.waitForSelector('#side-action',{timeout:25000});await page.locator('#side-action').click();assert.ok((await saved(page)).sideDone.includes('cargo'));
  await page.keyboard.press('k');await page.locator('[data-training-tab="build"]').click();await page.locator('[data-style="swift"]').click();assert.equal((await saved(page)).style,'swift');await page.locator('[data-style="focus"]').click();await page.locator('[data-discipline="venom"]').click();assert.equal((await saved(page)).discipline,'venom');await page.locator('[data-discipline="breaker"]').click();await page.locator('[data-training-tab="difficulty"]').click();await page.locator('[data-difficulty="heroic"]').click();assert.equal((await saved(page)).difficulty,'heroic');await page.locator('[data-difficulty="adventure"]').click();await page.locator('[data-training-tab="build"]').click();await page.locator('#modal [data-panel="forge"]').click();
  let s=await saved(page);const item=['breakCharm','jadeCharm','emberCharm','turtleCharm'].find(id=>!s.bag[id]);if(item){await page.locator(`[data-craft="${item}"]`).click();assert.equal((await saved(page)).bag[item],1);assert.equal(await page.locator(`[data-craft="${item}"]`).isEnabled(),false);}
  if(await page.locator('#refine').isEnabled()){const before=await saved(page);await page.locator('#refine').click();assert.equal((await saved(page)).refinement[before.weapon],(before.refinement[before.weapon]||0)+1);}
  await close(page);await page.keyboard.press('b');await page.locator('[data-filter="accessory"]').click();if(item){await page.locator(`[data-item="${item}"]`).click();assert.equal((await saved(page)).accessory,item);}await close(page);
  await page.keyboard.press('?');const download=page.waitForEvent('download');await page.locator('#export-save').click();const file=await download,exportPath=path.join(output,'exported-expanded-save.json');await file.saveAs(exportPath);assert.equal(JSON.parse(fs.readFileSync(exportPath,'utf8')).stage,49);
  await page.locator('#save-file').setInputFiles(exportPath);await page.waitForSelector('#confirm-import');await page.locator('#confirm-import').click();assert.equal((await saved(page)).stage,49);
  await page.keyboard.press('t');await page.locator('#replay-open').click();await page.locator('[data-replay="1"]').click();const before=await saved(page);await page.locator('#confirm-replay').click();const replay=await saved(page);assert.equal(replay.stage,14);assert.equal(replay.level,before.level);assert.deepEqual(replay.bag,before.bag);assert.equal(replay.replays,before.replays+1);await page.locator('#quest-guide').click();await dialogue(page);assert.equal((await saved(page)).stage,15);
  await page.keyboard.press('?');await page.locator('#recover-save').click();await page.locator('#confirm-recover').click();assert.equal((await saved(page)).stage,49);assert.equal((await saved(page)).weapon,before.weapon);
  console.log('PASS all side quests, style/discipline/difficulty, forging/accessory, export/import and confirmed chapter replay with backup recovery');
}
function ready(stage=R.terminal){const s=R.createState();s.stage=stage;s.level=8;s.gold=2400;s.weapon='qingming';s.armor='robe';s.style='focus';s.discipline='breaker';s.bag={...s.bag,qingming:1,robe:1,potion:6,qi:6,elixir:5,antidote:5};s.skills={strike:3,sweep:3,heal:3,pierce:3,poison:2,ultimate:2};s.companions=['qingshuang','mowen'];s.companion='qingshuang';s.hp=R.maxHp(s);s.mp=R.maxMp(s);return s;}
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH||fs.existsSync(edge)?{executablePath:process.env.BROWSER_PATH||edge}:{})});
  const errors=[];let lastPage;
  async function newPage(seed,mobile=false,fast=true){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},deviceScaleFactor:1,...(mobile?{isMobile:true,hasTouch:true}:{})});
    if(seed)await context.addInitScript(seed=>{if(!localStorage.getItem('wandering-sword-v1'))localStorage.setItem('wandering-sword-v1',JSON.stringify(seed));},seed);
    if(fast)await context.addInitScript(()=>{const timeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>timeout(fn,[260,300].includes(ms)?15:ms,...args);});
    const page=await context.newPage();lastPage=page;page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>document.querySelector('#quest-progress').children.length>=14);await page.locator('#save-button').click();await observe(page);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);return page;
  }
  try{
    const flags=process.argv.slice(2);let end;
    if(!flags.length||flags.includes('--campaign-only')){const p=await newPage();end=await walkthrough(p);if(!flags.includes('--campaign-only')){await challenges(p);await extras(p);}await p.context().close();}
    if(flags.includes('--extras-only')||flags.includes('--challenges-only')){const file=path.join(output,'expanded-walkthrough-save.json'),p=await newPage(fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):ready());if(flags.includes('--challenges-only'))await challenges(p);else await extras(p);await p.context().close();}
    if(!flags.length||flags.includes('--mobile-only')){
      const seed=ready(R.STORY.index('last-caravan'));seed.location='valley';const p=await newPage(seed,true);await p.screenshot({path:path.join(output,'mobile-expanded.png'),fullPage:true});await p.locator('#quest-guide').click();await battle(p,'mobile-caravan',{capture:true});assert.equal((await saved(p)).stage,R.STORY.index('seals'));await close(p);await p.keyboard.press('k');await p.locator('[data-training-tab="build"]').click();await p.screenshot({path:path.join(output,'mobile-build.png'),fullPage:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await close(p);await p.keyboard.press('m');assert.equal(await p.locator('[data-travel]').count(),9);await p.screenshot({path:path.join(output,'mobile-nine-maps.png'),fullPage:true});await p.context().close();console.log('PASS mobile battle movement, escort UI, ten action buttons, build panel and nine-map atlas');
    }
    if(!flags.length||flags.includes('--legacy-only')){
      const old={...ready(),version:1,stage:3,location:'bamboo',level:4,weapon:'steel',armor:'vest',bag:{wood:1,cloth:1,steel:1,vest:1,potion:7,qi:4,antidote:2},skills:{strike:3,sweep:2,heal:2,ultimate:0},style:undefined,discipline:undefined};old.hp=R.maxHp(old);old.mp=R.maxMp(old);
      const p=await newPage(old);assert.equal((await saved(p)).stage,7);await p.locator('#quest-guide').click();await battle(p,'legacy-bandits');assert.equal((await saved(p)).stage,8);await p.locator('#battle-return').click();await dialogue(p);assert.equal((await saved(p)).stage,9);await p.context().close();
      const done={...ready(),version:2,stage:26};const v=await newPage(done);assert.equal((await saved(v)).stage,49);assert.equal((await saved(v)).bag.potion,6);await v.locator('#quest-guide').click();assert.equal(await v.locator('[data-contract]').count(),9);assert.equal(await v.locator('#tower-open').isEnabled(),true);await v.context().close();
      const weak={...R.createState(),stage:7,location:'bamboo',hp:1,mp:0,bag:{wood:1,cloth:1}};const f=await newPage(weak,false,false);await f.locator('#quest-guide').click();await f.locator('#encounter-start').click();await f.locator('#quest-guide').click();await f.locator('[data-skill="guard"]').click();await f.waitForSelector('#retry-battle',{timeout:15000});assert.equal((await saved(f)).stage,7);assert.equal((await saved(f)).hp,R.maxHp(await saved(f)));await f.locator('#retry-battle').click();await f.waitForSelector('#encounter-start',{timeout:25000});await f.locator('#encounter-start').click();await f.locator('[data-skill="guard"]').click();await f.keyboard.press('m');await f.locator('#retreat').click();const retreat=await saved(f);await f.waitForTimeout(1500);assert.equal((await saved(f)).hp,retreat.hp);assert.equal((await saved(f)).stage,7);await f.context().close();console.log('PASS v1 battle-to-next-quest, v2 completed-save challenges, defeat/retry and stale-turn cancellation after retreat');
    }
    if(!flags.length||flags.includes('--branches-only')){
      const s=ready(R.STORY.index('valley-ambush'));s.choices['valley-route']='cliff';const p=await newPage(s);await p.locator('#quest-guide').click();assert.equal(await p.locator('#encounter-start').getAttribute('data-encounter'),'cliffAmbush');await battle(p,'cliff-route',{capture:true});assert.equal((await saved(p)).stage,R.STORY.index('last-caravan'));await p.context().close();
      const r=ready(7);r.level=2;r.weapon='wood';r.armor='cloth';r.companion='';r.companions=[];r.skills={strike:2,sweep:1,heal:2,pierce:1,poison:0,ultimate:0};r.choices['river-plan']='ridge';r.hp=R.maxHp(r);r.mp=R.maxMp(r);const q=await newPage(r);await q.locator('#quest-guide').click();assert.equal(await q.locator('#encounter-start').getAttribute('data-encounter'),'ridgeBandits');await battle(q,'ridge-route');assert.equal((await saved(q)).stage,8);await q.context().close();console.log('PASS both alternate route battles and their next main quests');
    }
    if(!flags.length||flags.includes('--expedition-only')){
      const seed=ready();seed.hp=1;seed.mp=0;seed.companion='';seed.expedition={active:true,floor:8,best:7,blessings:['edge','edge','shell','shell','breath','break'],choicePending:false,rested:false,level:8};
      const p=await newPage(seed);await p.keyboard.press('k');await p.locator('[data-training-tab="build"]').click();assert.equal(await p.locator('[data-style="swift"]').isEnabled(),false);await close(p);await p.keyboard.press('b');assert.equal(await p.locator('[data-item="elixir"]').isEnabled(),false);await close(p);await p.keyboard.press('m');assert.equal(await p.locator('#tower-continue').isEnabled(),true);
      await p.locator('#tower-continue').click();await p.locator('#encounter-start').click();await p.locator('#quest-guide').click();await p.locator('[data-skill="guard"]').click();await p.waitForSelector('#retry-battle',{timeout:10000});let after=await saved(p);assert.equal(after.expedition.active,false);assert.equal(after.expedition.best,7);assert.equal(after.stage,49);assert.equal(after.hp,R.maxHp(after));
      await p.locator('#retry-battle').click();await p.locator('#tower-start').click();assert.equal((await saved(p)).expedition.floor,1);assert.equal(await p.locator('#tower-rest').isEnabled(),false);
      await p.locator('#tower-abandon').click();await p.locator('#tower-stay').click();assert.equal((await saved(p)).expedition.active,true);await p.locator('#tower-abandon').click();await p.locator('#tower-leave').click();after=await saved(p);assert.equal(after.expedition.active,false);assert.equal(after.expedition.best,7);assert.equal(after.stage,49);await p.context().close();
      console.log('PASS expedition defeat, saved best, restart, no free healing/build changes, unused full-health campfire, cancel/confirm abandonment');
    }
    assert.deepEqual(errors,[]);console.log('PASS no browser runtime errors; screenshots and saves: '+output);
  }catch(error){if(lastPage&&!lastPage.isClosed()){await lastPage.screenshot({path:path.join(output,'browser-failure.png'),fullPage:true}).catch(()=>{});console.error('LAST UI',await lastPage.locator('#modal-title').innerText().catch(()=>''),await saved(lastPage).catch(()=>null));}console.error('ERRORS',errors);throw error;}
  finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
