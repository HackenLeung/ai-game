'use strict';
// Use an isolated browser profile: these saves never replace a player's progress.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url'),R=require('./rules.js'),AI=require('./test-strategy.cjs');
const bundled=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||(fs.existsSync(bundled)?bundled:'playwright'));
const output=process.env.GAME_SCREENSHOT_DIR||path.join(os.tmpdir(),'wandering-sword-feedback'),url=process.env.GAME_URL||pathToFileURL(path.join(__dirname,'index.html')).href;
fs.mkdirSync(output,{recursive:true});
const SAVE='wandering-sword-v1',errors=[];
function seed(){const s=R.createState();Object.assign(s,{stage:49,level:8,gold:2000,style:'focus',discipline:'breaker',weapon:'wood',armor:'cloth',companion:''});s.bag={...s.bag,steel:1,vest:1,turtleCharm:1,hawkCharm:1,potion:1,qi:5,elixir:6,antidote:4,manual:2};s.skills={strike:3,sweep:3,heal:3,pierce:3,poison:3,ultimate:2};s.hp=R.maxHp(s)-90;s.mp=5;return s;}
const read=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE);
const close=async page=>{if(await page.locator('#modal').evaluate(el=>el.open))await page.keyboard.press('Escape');};
const shot=async(page,name)=>{if(await page.locator('#action-feedback').isVisible())await page.waitForTimeout(170);await page.screenshot({path:path.join(output,'feedback-'+name+'.png')});};
async function captureBattle(page){const snap=await page.evaluate(()=>{const {s,b}=window.__combat;return{s,b:{...b,obstacle:[...b.obstacle]}};});snap.b.obstacle=new Set(snap.b.obstacle);return snap;}
async function move(page,pos){
  await page.keyboard.press('0');await page.locator('#world').scrollIntoViewIfNeeded();
  const point=await page.locator('#world').evaluate((canvas,{x,y})=>{
    const box=canvas.getBoundingClientRect(),ratio=(box.height/760)/(box.width/1280),zoom=ratio>1.35?Math.min(1,1.52/ratio):1;
    return{x:box.left+(640+(x-y)*54*ratio*zoom)/1280*box.width,y:box.top+((210+(x+y)*28-380)*zoom+380)/760*box.height};
  },pos);await page.mouse.click(point.x,point.y);
  await page.waitForFunction(({x,y})=>window.__combat.b.player.x===x&&window.__combat.b.player.y===y,pos);
}
(async()=>{
  const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],...(process.env.BROWSER_PATH||fs.existsSync(edge)?{executablePath:process.env.BROWSER_PATH||edge}:{})});
  async function newPage(save,{mobile=false,reduced=false}={}){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},reducedMotion:reduced?'reduce':'no-preference',...(mobile?{isMobile:true,hasTouch:true}:{})});
    await context.addInitScript(({save,key})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(save));
      window.__feedbackEvents=[];let factory;
      Object.defineProperty(window,'createJianghuFeedback',{configurable:true,get:()=>factory,set:original=>{
        factory=options=>{const api=original(options);for(const name of ['hit','floating','ring','react','notice','announce','clear']){
          const fn=api[name];api[name]=(...args)=>{window.__feedbackEvents.push({name,args:structuredClone(args),at:performance.now()});return fn(...args);};
        }window.__feedbackAPI=api;return api;};
      }});
      let audioFactory;
      Object.defineProperty(window,'createJianghuAudio',{configurable:true,get:()=>audioFactory,set:original=>{
        audioFactory=options=>{const api=original(options),play=api.play;api.play=(kind,detail)=>{const played=play(kind,detail);if(played)window.__feedbackEvents.push({name:'sound',args:[kind],at:performance.now()});return played;};window.__audioAPI=api;return api;};
      }});
    },{save,key:SAVE});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
    await page.waitForFunction(()=>document.querySelector('#quest-progress').children.length>=14);
    await page.locator('#save-button').click();
    await page.evaluate(()=>{const original=JianghuRules.makeBattle;JianghuRules.makeBattle=(s,id,context)=>{const b=original(s,id,context);window.__combat={s,b};return b;};});
    return page;
  }
  try{
    const page=await newPage(seed());await page.keyboard.press('b');
    await page.locator('[data-item="steel"]').click();
    assert.match(await page.locator('#action-feedback').innerText(),/已装备 · 青锋剑/);
    assert.match(await page.locator('#action-feedback').innerText(),/攻击.*\+8/);
    assert.equal(await page.locator('[data-item-card="steel"]').evaluate(el=>el.classList.contains('is-equipped')),true);
    assert.equal((await read(page)).bag.steel,1);await shot(page,'equipment');
    await page.locator('[data-item="turtleCharm"]').click();assert.match(await page.locator('#action-feedback').innerText(),/气血上限.*\+30/);
    await page.locator('[data-item="hawkCharm"]').click();assert.match(await page.locator('#action-feedback').innerText(),/气血上限.*-30/);
    assert.equal((await read(page)).accessory,'hawkCharm');
    await page.locator('[data-filter="medicine"]').click();const before=await read(page);await page.locator('[data-item="potion"]').click();
    assert.match(await page.locator('#action-feedback').innerText(),/气血 \+60.*剩余 0/);
    assert.equal((await read(page)).hp,before.hp+60);assert.equal(await page.locator('[data-item="potion"]').count(),0);
    await shot(page,'last-medicine');assert.equal(await page.locator('#hp-value').evaluate(el=>el.closest('.stat').dataset.feedback),'heal');
    await page.locator('[data-item="qi"]').click();assert.match(await page.locator('#action-feedback').innerText(),/真气 \+40/);
    assert.equal(await page.locator('#action-feedback').getAttribute('data-tone'),'qi');
    assert.equal(await page.evaluate(()=>__feedbackEvents.filter(e=>e.name==='sound').length),0);
    await close(page);await page.locator('#sound-toggle').click();await page.waitForFunction(()=>__audioAPI.status.running);assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'),'true');
    await page.keyboard.press('b');await page.locator('[data-item="qi"]').click();
    assert.ok(await page.evaluate(()=>__feedbackEvents.some(e=>e.name==='sound'&&e.args[0]==='qi')));
    await close(page);await page.locator('#sound-toggle').click();
    await page.locator('[data-skill="heal"]').click();assert.match(await page.locator('#action-feedback').innerText(),/气血 \+30/);await shot(page,'world-heal');
    await page.keyboard.press('b');const full=await read(page);await page.locator('[data-item="elixir"]').click();
    assert.match(await page.locator('#toast').innerText(),/气血充盈/);assert.equal((await read(page)).bag.elixir,full.bag.elixir);
    assert.equal(await page.locator('#action-feedback').isVisible(),false);
    assert.equal(await page.evaluate(()=>__feedbackEvents.filter(e=>e.name==='floating').some(e=>e.args[1]==='+0')),false);
    await close(page);await page.reload();assert.equal((await read(page)).weapon,'steel');assert.equal((await read(page)).bag.potion,0);
    console.log('PASS equipment tradeoffs, last medicine, distinct HP/qi feedback, full-health rejection, mute and saved state');
    await page.context().close();

    const fighter=seed();fighter.weapon='steel';fighter.armor='robe';fighter.bag.robe=1;fighter.bag.potion=6;fighter.hp=R.maxHp(fighter)-50;
    const combat=await newPage(fighter);await combat.locator('#sound-toggle').click();await combat.waitForFunction(()=>__audioAPI.status.running);
    await combat.keyboard.press('t');await combat.locator('#arena-start').click();await combat.locator('#encounter-start').click();
    await combat.keyboard.press('b');await combat.locator('[data-item="qi"]').click();
    assert.match(await combat.locator('#scene-feedback').innerText(),/真气 \+40/);await shot(combat,'battle-qi');
    await combat.waitForFunction(()=>__combat.b.phase==='player');
    assert.equal(await combat.locator('[data-skill="potion"]').isEnabled(),false);await combat.keyboard.press('4');
    assert.match(await combat.locator('#toast').innerText(),/间隔一回合/);
    await combat.locator('[data-skill="guard"]').click();
    assert.match(await combat.locator('#scene-feedback').innerText(),/减伤 60%/);await shot(combat,'guard');
    await combat.waitForFunction(()=>__combat.b.phase==='player');
    await combat.locator('[data-skill="potion"]').click();assert.match(await combat.locator('#scene-feedback').innerText(),/气血 \+/);
    await shot(combat,'battle-medicine');
    let captured=false;
    for(let actions=0;actions<90;actions++){
      await combat.waitForFunction(()=>['player','won','lost'].includes(__combat.b.phase));const {s,b}=await captureBattle(combat);
      if(b.phase==='won'||b.phase==='lost')break;
      const a=AI.choose(s,b);if(R.distance(a.pos,b.player))await move(combat,a.pos);
      if(['won','lost'].includes((await captureBattle(combat)).b.phase))break;
      if(['qi','elixir','antidote'].includes(a.skill)){await combat.keyboard.press('b');await combat.locator('[data-item="'+a.skill+'"]').click();}
      else{await combat.locator('[data-skill="'+a.skill+'"]').click();if(a.id)await combat.locator('[data-enemy="'+a.id+'"]').click();}
      if(a.id&&!captured){await combat.waitForTimeout(65);await shot(combat,'hit');captured=true;}
      await combat.waitForFunction(round=>__combat.b.round>round||['won','lost'].includes(__combat.b.phase),b.round);
    }
    await combat.waitForFunction(()=>document.querySelector('#modal').open);
    assert.match(await combat.locator('#modal-title').innerText(),/· 胜$/);await shot(combat,'victory');
    const won=await read(combat);assert.equal(won.wins,fighter.wins+1);
    await combat.waitForTimeout(650);assert.equal((await read(combat)).wins,won.wins);
    const events=await combat.evaluate(()=>__feedbackEvents);
    assert.ok(events.some(e=>e.name==='sound'&&e.args[0]==='win'));assert.equal(await combat.evaluate(()=>__audioAPI.status.scene),won.location);
    assert.ok(events.some(e=>e.name==='hit'));assert.ok(events.some(e=>e.name==='react'&&e.args[1]==='hurt'));
    assert.ok(events.some(e=>e.name==='ring'&&e.args[1]==='guard'));
    assert.equal(events.some(e=>e.name==='floating'&&e.args[1]==='+0'),false);
    console.log('PASS real battle: qi, medicine cooldown, guard, hit/hurt effects, final impact, one victory reward and music restoration');
    await combat.context().close();

    for(const reduced of [false,true]){
      const mobile=await newPage(seed(),{mobile:true,reduced});await mobile.keyboard.press('b');await mobile.locator('[data-item="steel"]').click();await shot(mobile,reduced?'mobile-reduced':'mobile-equipment');
      const rect=await mobile.locator('#action-feedback').boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=390&&rect.y+rect.height<=844);
      await close(mobile);await mobile.locator('[data-skill="potion"]').click();await shot(mobile,reduced?'mobile-reduced-heal':'mobile-heal');
      assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      if(reduced){assert.equal(await mobile.locator('.feedback-pulse').first().evaluate(el=>getComputedStyle(el).animationName),'none');const actor=await mobile.evaluate(()=>{__feedbackAPI.react('test','hurt',{x:0,y:0},{x:20,y:20});return __feedbackAPI.actor('test');});assert.deepEqual(actor,{x:0,y:0,flash:false});}
      await mobile.context().close();
    }
    console.log('PASS mobile feedback bounds and reduced-motion results');
    assert.deepEqual(errors,[]);console.log('PASS no browser runtime errors');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
