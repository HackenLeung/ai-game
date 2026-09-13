'use strict';
// Real Web Audio rendering and isolated browser saves; never touches a player's profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url'),R=require('./rules.js');
const bundled=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||(fs.existsSync(bundled)?bundled:'playwright'));
const url=process.env.GAME_URL||pathToFileURL(path.join(__dirname,'index.html')).href;
const output=process.env.GAME_SCREENSHOT_DIR||path.join(os.tmpdir(),'wandering-sword-audio');
const locations=['village','marsh','bamboo','city','ruins','camp','temple','pass','valley'];
const tracks=[...locations,'battle','duel','boss','final','tower','towerRest'];
const errors=[],SAVE='wandering-sword-v1';
function seed(stage=R.terminal){const s=R.createState();Object.assign(s,{stage,level:8,gold:2000,weapon:'steel',armor:'robe',companion:''});s.bag={...s.bag,steel:1,robe:1,potion:4,qi:4,elixir:3};s.hp=R.maxHp(s)-40;s.mp=R.maxMp(s)-40;return s;}
const close=async page=>{if(await page.locator('#modal').evaluate(el=>el.open))await page.keyboard.press('Escape');};
const snapshot=page=>page.evaluate(()=>__audio.status);
async function render(page,scene,stress=false,actions=[]){
  return page.evaluate(async({scene,stress,actions})=>{
    const rate=24000,length=actions.length?actions.length*2+2:18,offline=new OfflineAudioContext(2,rate*length,rate),intervals=new Map(),faults=[],notes=[],actionChecks=[];
    let nextTimer=0,state='running';
    const realSet=window.setInterval,realClear=window.clearInterval;
    window.setInterval=fn=>{intervals.set(++nextTimer,fn);return nextTimer;};window.clearInterval=id=>intervals.delete(id);
    const proxy=new Proxy(offline,{get(target,key){
      if(key==='state')return state;
      if(key==='resume')return async()=>{state='running';};
      if(key==='suspend')return async()=>{state='suspended';};
      if(key==='close')return async()=>{state='closed';};
      if(key==='addEventListener')return()=>{};
      if(key==='createBufferSource')return()=>{
        const source=target.createBufferSource(),start=source.start.bind(source);
        source.start=at=>{if(source.buffer?.duration===4)notes.push(['pluck',+at.toFixed(3),+source.playbackRate.value.toFixed(4)]);start(at);};return source;
      };
      if(key==='createOscillator')return()=>{
        const osc=target.createOscillator(),set=osc.frequency.setValueAtTime.bind(osc.frequency),start=osc.start.bind(osc);let hz=0;
        osc.frequency.setValueAtTime=(value,at)=>{hz=value;return set(value,at);};
        osc.start=at=>{if(osc.type==='custom')notes.push(['flute',+at.toFixed(3),+hz.toFixed(3)]);start(at);};return osc;
      };
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
    const engine=createJianghuAudio({createContext:()=>proxy,onError:e=>faults.push(e.message)});
    try{
      engine.setScene(scene,{energy:stress?1:0});await engine.setEnabled(true);
      let maxVoices=0,maxGroups=0;
      const suspension=[];
      for(let i=1;i<length*8;i++)suspension.push(offline.suspend(i/8).then(async()=>{
        try{
          if(actions.length&&i%16===0&&i/16<=actions.length){
            const [kind,detail]=actions[i/16-1],before=engine.status.voices,played=engine.play(kind,detail);
            actionChecks.push({kind,detail,played,added:engine.status.voices-before});
          }
          if(stress){
            if(i===24)engine.setScene('valley');if(i===25)engine.setScene('boss');if(i===26)engine.setScene('temple');if(i===28)engine.setScene('final',{energy:1});
            if(i%3===0&&i<70)engine.play(['ultimate','sweep','pierce','hurt','potion','qi','equip'][Math.floor(i/3)%7],{broken:true});
          }
          for(const fn of intervals.values())fn();
          maxVoices=Math.max(maxVoices,engine.status.voices);maxGroups=Math.max(maxGroups,engine.status.groups);
        }finally{await offline.resume();}
      }));
      const audio=await offline.startRendering();await Promise.all(suspension);
      const left=audio.getChannelData(0),right=audio.getChannelData(1),windows=[];let peak=0,sum=0,stereo=0,finite=true;
      for(let i=0;i<left.length;i++){const a=left[i],b=right[i];finite&&=Number.isFinite(a)&&Number.isFinite(b);peak=Math.max(peak,Math.abs(a),Math.abs(b));sum+=(a*a+b*b)/2;stereo+=(a-b)**2;}
      for(let s=1;s<length;s++){let energy=0;for(let i=s*rate;i<(s+1)*rate;i++)energy+=(left[i]**2+right[i]**2)/2;windows.push(Math.sqrt(energy/rate));}
      return{scene,peak,rms:Math.sqrt(sum/left.length),stereo:Math.sqrt(stereo/left.length),finite,windows,maxVoices,maxGroups,notes,faults,actionChecks};
    }finally{await engine.dispose();window.setInterval=realSet;window.clearInterval=realClear;}
  },{scene,stress,actions});
}
(async()=>{
  const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH||fs.existsSync(edge)?{executablePath:process.env.BROWSER_PATH||edge}:{})});
  async function newPage(save=seed(),mobile=false){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},...(mobile?{isMobile:true,hasTouch:true}:{})});
    await context.addInitScript(({save,key})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(save));
      window.__sounds=[];window.__contextCount=0;window.__intervals=new Set();
      const schedule=window.setInterval,cancel=window.clearInterval;
      // Browser security extensions may inject unrelated timers into local HTTP pages.
      window.setInterval=(...args)=>{const id=schedule(...args);if(new Error().stack.includes('/audio.js'))__intervals.add(id);return id;};window.clearInterval=id=>{__intervals.delete(id);return cancel(id);};
      let factory;
      Object.defineProperty(window,'createJianghuAudio',{configurable:true,get:()=>factory,set:original=>{
        factory=options=>{
          const api=original({...options,createContext:()=>{__contextCount++;const ctx=new AudioContext();window.__context=ctx;return ctx;}}),play=api.play;
          api.play=(kind,detail)=>{const ok=play(kind,detail);if(ok)__sounds.push({kind,detail});return ok;};window.__audio=api;return api;
        };
      }});
    },{save,key:SAVE});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>document.querySelector('#quest-progress').children.length>=14);return page;
  }
  async function enable(page){await close(page);await page.locator('#sound-toggle').click();await page.waitForFunction(()=>__audio.status.running);}
  try{
    const page=await newPage();
    assert.equal((await snapshot(page)).contextState,'uninitialized');assert.equal(await page.evaluate(()=>__contextCount),0);
    await enable(page);
    const traces=[];
    for(const location of locations){
      await page.keyboard.press('m');await page.locator('[data-travel="'+location+'"]').click();
      assert.equal((await snapshot(page)).scene,location);assert.equal(await page.locator('#sound-toggle').getAttribute('data-soundscape'),location);
      assert.ok((await snapshot(page)).groups<=2);traces.push((await snapshot(page)).title);
    }
    assert.equal(new Set(traces).size,9);await page.waitForTimeout(1300);assert.equal((await snapshot(page)).groups,1);
    await page.evaluate(()=>{for(let i=0;i<20;i++)document.querySelector('#sound-toggle').click();});
    await page.waitForFunction(()=>__audio.status.running&&__intervals.size===1).catch(async error=>{console.error('toggle state',await page.evaluate(()=>({status:__audio.status,intervals:[...__intervals],notice:document.querySelector('#toast').textContent})));throw error;});
    assert.equal(await page.evaluate(()=>__contextCount),1);
    await page.locator('#sound-toggle').click();await page.waitForFunction(()=>__audio.status.contextState==='suspended');
    assert.equal((await snapshot(page)).voices,0);assert.equal((await snapshot(page)).groups,0);assert.equal(await page.evaluate(()=>__intervals.size),0);
    assert.equal(await page.evaluate(()=>__audio.play('ultimate')),false);
    const paused=await page.evaluate(()=>__context.currentTime);await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>__context.currentTime),paused);
    await enable(page);assert.equal((await snapshot(page)).scene,'valley');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(()=>__audio.status.contextState==='suspended');assert.equal((await snapshot(page)).enabled,true);assert.equal((await snapshot(page)).voices,0);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(()=>__audio.status.running&&__intervals.size===1);
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
    await page.waitForFunction(()=>__audio.status.contextState==='suspended');
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
    await page.waitForFunction(()=>__audio.status.running&&__intervals.size===1);
    console.log('PASS nine map soundscapes, crossfade cleanup, rapid toggles, one context/timer, mute and background/page restoration');
    await page.keyboard.press('t');await page.locator('#arena-start').click();await page.locator('#encounter-start').click();
    assert.equal((await snapshot(page)).scene,'duel');await page.keyboard.press('m');await page.locator('#retreat').click();
    assert.equal((await snapshot(page)).scene,await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).location,SAVE));
    await page.keyboard.press('t');await page.locator('#tower-open').click();await page.locator('#tower-start').click();
    assert.equal((await snapshot(page)).scene,'towerRest');await page.locator('#tower-continue').click();await page.locator('#encounter-start').click();assert.equal((await snapshot(page)).scene,'tower');
    await page.keyboard.press('m');await page.locator('#retreat').click();assert.equal((await snapshot(page)).scene,await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).location,SAVE));
    await page.reload();assert.equal((await snapshot(page)).contextState,'uninitialized');assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'),'false');
    const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE);assert.equal(saved.version,3);assert.equal(saved.stage,R.terminal);assert.equal(saved.weapon,'steel');
    await page.context().close();
    for(const mode of ['battle','boss','final']){
      const q=R.STORY.quests.find(q=>{
        const encounter=R.STORY.encounters[q.encounter];if(q.kind!=='battle'||!encounter)return false;
        if(mode==='final')return q.encounter==='final';if(q.encounter==='final'||encounter.training||encounter.practice)return false;
        return encounter.enemies.some(e=>e[6]==='boss')===(mode==='boss');
      });
      const save=seed(R.STORY.quests.indexOf(q));save.location=q.location;Object.assign(save,R.STORY.locations[q.location].spawn);
      const p=await newPage(save);await enable(p);await p.locator('#quest-guide').click();await p.locator('#encounter-start').click();assert.equal((await snapshot(p)).scene,mode);
      await p.keyboard.press('m');await p.locator('#retreat').click();assert.notEqual((await snapshot(p)).scene,mode);await p.context().close();
    }
    const mobile=await newPage(seed(),true);await enable(mobile);await mobile.keyboard.press('b');await mobile.locator('[data-item="potion"]').click();
    assert.ok(await mobile.evaluate(()=>__sounds.some(e=>e.kind==='potion')));assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await mobile.context().close();
    console.log('PASS ordinary/boss/final battles, sparring, tower/rest, retreat, mobile gesture and save preservation');

    const renderContext=await browser.newContext(),renderPage=await renderContext.newPage();renderPage.on('pageerror',e=>errors.push(e.message));
    await renderPage.setContent('<button id="enable">试听</button>');await renderPage.addScriptTag({path:path.join(__dirname,'audio.js')});
    const reports=[];
    for(const scene of tracks){
      const report=await render(renderPage,scene);assert.deepEqual(report.faults,[]);assert.equal(report.finite,true);
      assert.ok(report.rms>.001&&report.peak<.9,`${scene}: rms ${report.rms}, peak ${report.peak}`);
      assert.ok(report.windows.every(rms=>rms>.0001),`${scene}: silent music window`);assert.ok(report.stereo>.0001);assert.ok(report.maxVoices<=112);
      reports.push(report);console.log(`PASS rendered ${scene}: RMS ${report.rms.toFixed(4)}, peak ${report.peak.toFixed(3)}, ${report.maxVoices} voices`);
    }
    // Check the scheduled instrumental phrases, not only random environmental noise.
    const phrases=reports.map(r=>JSON.stringify(r.notes));assert.equal(new Set(phrases).size,tracks.length);
    const stress=await render(renderPage,'boss',true);assert.deepEqual(stress.faults,[]);assert.ok(stress.peak<.9);assert.ok(stress.maxVoices<=112&&stress.maxGroups<=3);
    console.log(`PASS overlapping skills and rapid battle transitions: peak ${stress.peak.toFixed(3)}, ${stress.maxVoices} voices, ${stress.maxGroups} groups`);
    const actions=[...['strike','sweep','pierce','poison','ultimate','potion','elixir','antidote','qi','food','heal','aid','rest','guard','hurt','warn','error','battleStart','win','lose','gather','ore','chest','puzzle','solve','castLine','catch','step','manual'].map(kind=>[kind]),...['weapon','armor','accessory'].map(category=>['equip',{category}]),['hurt',{blocked:true}],['hurt',{role:'ranged'}],['hurt',{role:'poison'}]];
    const actionReport=await render(renderPage,'village',false,actions);assert.deepEqual(actionReport.faults,[]);assert.ok(actionReport.peak<.9);
    for(const check of actionReport.actionChecks)assert.ok(check.played&&check.added>0,`no voices for ${check.kind}`);
    assert.equal(actionReport.actionChecks.length,actions.length);
    assert.equal(new Set(actionReport.actionChecks.filter(c=>c.kind==='equip').map(c=>c.added)).size,3);
    console.log(`PASS ${actions.length} action sound variants, distinct equipment/medicine voices and no clipping`);
    fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'audio-render-report.json'),JSON.stringify({reports,stress,actionReport},null,2));
    await renderPage.evaluate(()=>{
      let first=true;window.__failures=0;window.__retry=createJianghuAudio({onError:()=>__failures++,createContext:()=>{
        const ctx=new AudioContext(),resume=ctx.resume.bind(ctx);ctx.resume=()=>{if(first){first=false;return Promise.reject(new Error('simulated blocked resume'));}return resume();};return ctx;
      }});document.querySelector('#enable').onclick=()=>__retry.setEnabled(true);
    });
    await renderPage.locator('#enable').click();await renderPage.waitForFunction(()=>__failures===1);assert.equal(await renderPage.evaluate(()=>__retry.status.enabled),false);
    await renderPage.locator('#enable').click();await renderPage.waitForFunction(()=>__retry.status.running);await renderPage.evaluate(()=>__retry.dispose());
    assert.equal(await renderPage.evaluate(()=>__retry.status.voices),0);await renderContext.close();
    assert.deepEqual(errors,[]);console.log('PASS recoverable audio startup failure, disposal and no browser errors');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
