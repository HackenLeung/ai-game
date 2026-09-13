'use strict';

// Offline instruments and soundscapes. No audio context is created before a gesture.
globalThis.createJianghuAudio = function({createContext,onChange=()=>{},onError=()=>{}}={}) {
  const rest=null;
  const scenes={
    village:{title:'梧桐烟雨',description:'古琴疏弦 · 溪水与山鸟',root:50,bpm:68,instrument:'qin',space:.25,environment:'village',
      call:[12,rest,16,19,rest,16,14,rest,9,rest,12,14,16,rest,12,rest],answer:[19,rest,21,19,16,rest,14,12,9,rest,7,9,12,rest,rest,rest]},
    marsh:{title:'一苇渡江',description:'箫声浮水 · 芦风与水鸟',root:55,bpm:56,instrument:'flute',space:.38,environment:'marsh',
      call:[12,rest,rest,14,17,rest,19,rest,17,14,rest,12,10,rest,rest,rest],answer:[7,rest,10,12,rest,14,17,rest,14,rest,12,10,7,rest,rest,rest]},
    bamboo:{title:'竹影行歌',description:'笛音与拨弦 · 竹叶沙沙',root:57,bpm:78,instrument:'flute',space:.19,environment:'bamboo',
      call:[12,16,rest,19,21,rest,19,16,14,rest,12,14,9,rest,12,rest],answer:[19,rest,21,24,21,19,rest,16,14,16,12,rest,9,7,rest,rest]},
    city:{title:'灯市小调',description:'琵琶轻弹 · 街市与茶盏',root:53,bpm:100,instrument:'pipa',space:.12,environment:'city',
      call:[12,16,19,rest,21,19,16,14,12,rest,9,12,14,16,rest,19],answer:[21,24,21,19,16,rest,14,16,19,16,14,12,9,12,rest,rest]},
    ruins:{title:'残窑暗流',description:'低弦悬音 · 石室滴水',root:45,bpm:48,instrument:'qin',space:.65,environment:'ruins',
      call:[0,rest,rest,7,rest,rest,10,rest,12,rest,rest,10,7,rest,rest,rest],answer:[3,rest,rest,7,10,rest,rest,7,3,rest,0,rest,rest,rest,rest,rest]},
    camp:{title:'黑风夜行',description:'沉弦与寨鼓 · 山风篝火',root:46,bpm:84,instrument:'pipa',space:.22,environment:'camp',drums:'distant',
      call:[0,rest,7,10,12,rest,10,7,3,rest,7,rest,0,rest,rest,7],answer:[12,rest,15,12,10,7,rest,3,7,10,7,rest,0,rest,rest,rest]},
    temple:{title:'云外问道',description:'琴箫相和 · 悠远晨钟',root:48,bpm:52,instrument:'qin',space:.55,environment:'temple',
      call:[12,rest,rest,19,rest,16,rest,14,12,rest,9,rest,7,rest,rest,rest],answer:[16,rest,19,rest,21,rest,19,16,14,rest,12,rest,7,rest,rest,rest]},
    pass:{title:'雪阶照心',description:'空灵泛音 · 松风石磬',root:59,bpm:60,instrument:'bell',space:.6,environment:'pass',
      call:[0,rest,rest,7,rest,10,rest,12,rest,7,rest,3,0,rest,rest,rest],answer:[15,rest,12,rest,10,rest,7,rest,3,rest,7,rest,0,rest,rest,rest]},
    valley:{title:'落霞听雷',description:'长箫回旋 · 峡风远雷',root:50,bpm:72,instrument:'flute',space:.46,environment:'valley',
      call:[12,rest,15,19,rest,22,19,rest,17,15,rest,12,10,rest,7,rest],answer:[19,rest,22,24,22,rest,19,17,15,rest,12,10,7,rest,rest,rest]},
    battle:{title:'剑起风生',description:'急弦战鼓 · 交锋之曲',root:50,bpm:120,instrument:'pipa',space:.18,environment:'battle',drums:'battle',
      call:[0,7,12,7,15,12,10,7,0,7,10,12,15,rest,12,7],answer:[12,19,15,12,10,7,3,7,12,15,19,15,12,10,7,rest]},
    duel:{title:'以剑会友',description:'轻鼓快弦 · 切磋之曲',root:55,bpm:108,instrument:'qin',space:.22,environment:'battle',drums:'duel',
      call:[12,7,12,16,19,rest,16,14,12,9,7,9,12,rest,14,16],answer:[19,16,14,12,9,7,9,12,14,16,19,21,19,rest,12,rest]},
    boss:{title:'破阵惊锋',description:'重鼓低弦 · 首领之战',root:43,bpm:136,instrument:'pipa',space:.28,environment:'boss',drums:'boss',
      call:[12,0,7,12,15,7,12,19,17,12,10,7,12,7,3,7],answer:[19,12,22,19,17,15,12,10,12,7,15,12,10,7,0,rest]},
    final:{title:'一剑定风雷',description:'奔雷战鼓 · 终局决战',root:38,bpm:148,instrument:'pipa',space:.36,environment:'boss',drums:'final',
      call:[12,19,24,19,27,24,22,19,17,19,22,24,27,24,19,rest],answer:[24,27,31,27,29,27,24,22,19,22,24,19,15,19,12,rest]},
    tower:{title:'剑冢争鸣',description:'金石急弦 · 十二关试炼',root:47,bpm:126,instrument:'pipa',space:.46,environment:'ruins',drums:'tower',
      call:[0,7,12,rest,10,7,15,12,7,0,7,10,12,15,19,rest],answer:[19,15,12,7,10,12,15,19,22,19,15,12,10,7,0,rest]},
    towerRest:{title:'剑火未熄',description:'余弦渐静 · 篝火休整',root:47,bpm:48,instrument:'qin',space:.4,environment:'camp',
      call:[12,rest,rest,7,rest,10,rest,rest,7,rest,3,rest,0,rest,rest,rest],answer:[15,rest,rest,12,rest,10,rest,7,3,rest,7,rest,0,rest,rest,rest]}
  };
  const voices=new Set(),groups=new Set(),samples=new Map(),recent=new Map();
  const MAX_VOICES=112,EPS=.0001;
  let context,mix,master,compressor,background,noiseBuffer,impulse,fluteWave;
  let enabled=false,hidden=false,disposed=false,sceneId='village',intensity=0;
  let current,effects,timer=null,revision=0,restart=false,operation=Promise.resolve();
  const frequency=midi=>440*2**((midi-69)/12);
  const random=(min,max)=>min+Math.random()*(max-min);
  const shouldRun=()=>enabled&&!hidden&&!disposed;
  const status=()=>({enabled,running:shouldRun()&&context?.state==='running'&&timer!==null,scene:sceneId,title:scenes[sceneId].title,description:scenes[sceneId].description,contextState:context?.state||'uninitialized',voices:voices.size,groups:groups.size,schedulerActive:timer!==null});
  const changed=()=>onChange(status());
  function hold(param,at) {
    if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(at);
    else{const value=param.value;param.cancelScheduledValues(at);param.setValueAtTime(value,at);}
  }
  function ramp(param,to,duration) {const now=context.currentTime;hold(param,now);param.linearRampToValueAtTime(to,now+duration);}
  function initialize() {
    if(context)return;
    context=createContext?createContext():new(globalThis.AudioContext||globalThis.webkitAudioContext)({latencyHint:'interactive'});
    mix=context.createGain();background=context.createGain();master=context.createGain();compressor=context.createDynamicsCompressor();
    background.connect(mix);mix.connect(compressor);compressor.connect(master);master.connect(context.destination);master.gain.value=0;
    compressor.threshold.value=-12;compressor.knee.value=16;compressor.ratio.value=5;compressor.attack.value=.004;compressor.release.value=.2;
    noiseBuffer=context.createBuffer(1,Math.ceil(context.sampleRate*2.7),context.sampleRate);
    const noise=noiseBuffer.getChannelData(0);for(let i=0;i<noise.length;i++)noise[i]=Math.random()*2-1;
    impulse=context.createBuffer(2,Math.ceil(context.sampleRate*2.1),context.sampleRate);
    for(let ch=0;ch<2;ch++){const data=impulse.getChannelData(ch);let low=0;for(let i=0;i<data.length;i++){low=.55*low+.45*(Math.random()*2-1);data[i]=low*(1-i/data.length)**3;}}
    fluteWave=context.createPeriodicWave(new Float32Array(5),new Float32Array([0,1,.18,.065,.025]));
    context.addEventListener('statechange',()=>{
      if(context.state!=='running'){stopTimer();clearGroups();restart=true;}
      changed();
    });
  }
  function makeGroup(profile,isEffect=false) {
    const input=context.createGain(),output=context.createGain(),send=context.createGain(),room=context.createConvolver();
    room.buffer=impulse;send.gain.value=profile.space;input.connect(output);input.connect(send);send.connect(room);room.connect(output);output.connect(isEffect?mix:background);
    const group={input,output,nodes:[input,output,send,room],voices:new Set(),profile,isEffect,expires:Infinity};groups.add(group);return group;
  }
  function discardVoice(voice) {
    if(!voices.delete(voice))return;
    voice.group.voices.delete(voice);
    for(const source of voice.sources){source.onended=null;try{source.stop();}catch{}}
    for(const node of voice.nodes)node.disconnect();
  }
  function clearGroup(group) {
    if(!group||!groups.delete(group))return;
    for(const voice of [...group.voices])discardVoice(voice);
    for(const node of group.nodes)node.disconnect();
  }
  function clearGroups() {
    for(const group of [...groups])clearGroup(group);current=null;effects=null;recent.clear();
    if(background){background.gain.cancelScheduledValues(context.currentTime);background.gain.setValueAtTime(1,context.currentTime);}
  }
  function register(group,sources,nodes,start,duration) {
    const voice={group,sources,nodes,end:start+duration};voices.add(voice);group.voices.add(voice);
    sources[0].onended=()=>discardVoice(voice);
    for(const source of sources){source.start(start);if(Number.isFinite(duration))source.stop(start+duration);}
    return voice;
  }
  function available(group) {return groups.has(group)&&voices.size<MAX_VOICES;}
  function route(group,source,nodes,start,duration,volume,pan=0,attack=.008,sustain=false) {
    const gain=context.createGain(),position=context.createStereoPanner();position.pan.value=Math.max(-.85,Math.min(.85,pan));
    gain.gain.setValueAtTime(EPS,start);gain.gain.linearRampToValueAtTime(volume,start+Math.min(attack,duration*.25));
    if(sustain)gain.gain.linearRampToValueAtTime(volume*.8,start+duration*.64);
    gain.gain.exponentialRampToValueAtTime(EPS,start+duration);
    source.connect(gain);gain.connect(position);position.connect(group.input);nodes.push(gain,position);return gain;
  }
  function tone(group,hz,start,duration,volume=.05,{end=hz,type='sine',pan=0,attack=.008,vibrato=false}={}) {
    if(!available(group))return;
    const osc=context.createOscillator(),nodes=[osc],sources=[osc];osc.type=type;
    if(vibrato){osc.setPeriodicWave(fluteWave);const lfo=context.createOscillator(),depth=context.createGain();lfo.frequency.value=4.7;depth.gain.value=hz*.0035;lfo.connect(depth);depth.connect(osc.frequency);nodes.push(lfo,depth);sources.push(lfo);}
    osc.frequency.setValueAtTime(Math.max(22,hz),start);osc.frequency.exponentialRampToValueAtTime(Math.max(22,end),start+duration);
    route(group,osc,nodes,start,duration,volume,pan,attack,vibrato);register(group,sources,nodes,start,duration+.025);
  }
  function noise(group,from,to,start,duration,volume=.08,pan=0) {
    if(!available(group))return;
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),nodes=[source,filter];source.buffer=noiseBuffer;
    filter.type='bandpass';filter.Q.value=.65;filter.frequency.setValueAtTime(from,start);filter.frequency.exponentialRampToValueAtTime(to,start+duration);source.connect(filter);
    route(group,filter,nodes,start,duration,volume,pan,.012);register(group,[source],nodes,start,duration+.025);
  }
  function pluck(group,midi,start,volume=.16,instrument='qin',pan=0) {
    if(!available(group))return;
    if(!samples.has(instrument)){
      const rate=24000,period=Math.round(rate/110),buffer=context.createBuffer(1,rate*4,rate),data=buffer.getChannelData(0),bright=instrument==='pipa';
      let low=0,mean=0;for(let i=0;i<period;i++){const n=Math.random()*2-1;low=.55*low+.45*n;data[i]=(bright?n*.35:low*.4)+Math.sin(i/period*Math.PI*2)*.28+Math.sin(i/period*Math.PI*4)*.07;mean+=data[i];}
      for(let i=0;i<period;i++)data[i]-=mean/period;
      for(let i=period;i<data.length;i++)data[i]=(data[i-period]+data[i-period+1])*(bright?.496:.499);
      samples.set(instrument,{buffer,pitch:rate/period});
    }
    const sample=samples.get(instrument),source=context.createBufferSource(),filter=context.createBiquadFilter(),nodes=[source,filter],ratio=frequency(midi)/sample.pitch;
    source.buffer=sample.buffer;source.playbackRate.value=ratio;filter.type='lowpass';filter.frequency.value=instrument==='pipa'?5200:2400;filter.Q.value=.4;source.connect(filter);
    const duration=Math.min(2.8,3.9/ratio);route(group,filter,nodes,start,duration,volume,pan,.004);register(group,[source],nodes,start,duration+.02);
  }
  function bell(group,hz,start,volume=.06,duration=1.8,pan=0) {
    for(const [ratio,level,tail] of [[1,1,1],[2.756,.27,.56],[5.404,.075,.25]])tone(group,hz*ratio,start,duration*tail,volume*level,{pan,attack:.006});
  }
  function drum(group,start,strong=false,pan=0,volume=1) {
    tone(group,strong?108:160,start,strong?.34:.18,(strong?.15:.055)*volume,{end:strong?45:95,pan});
    noise(group,strong?620:1100,strong?180:720,start,.085,.085*volume,pan);
  }
  function bed(group,cutoff,volume,pan=0,rate=.13) {
    if(!available(group))return;
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain(),position=context.createStereoPanner(),lfo=context.createOscillator(),depth=context.createGain();
    source.buffer=noiseBuffer;source.loop=true;source.playbackRate.value=random(.72,1.1);filter.type='bandpass';filter.frequency.value=cutoff;filter.Q.value=.45;
    gain.gain.value=volume;position.pan.value=pan;lfo.frequency.value=rate;depth.gain.value=volume*.32;
    lfo.connect(depth);depth.connect(gain.gain);source.connect(filter);filter.connect(gain);gain.connect(position);position.connect(group.input);
    register(group,[source,lfo],[source,filter,gain,position,lfo,depth],context.currentTime+.01,Infinity);
  }
  function startEnvironment(group) {
    const env=group.profile.environment;
    if(['marsh','village'].includes(env))bed(group,env==='marsh'?1350:1900,.047,-.38,.22);
    if(['bamboo','village','temple','pass','valley'].includes(env))bed(group,env==='pass'?1700:620,env==='valley'?.045:.027,.4,.095);
    if(['camp','ruins','boss'].includes(env))bed(group,env==='ruins'?240:380,.037,-.15,.12);
    if(env==='city')bed(group,460,.026,0,.36);
    group.nextAmbient=context.currentTime+.65;
  }
  function environmental(group,start) {
    const env=group.profile.environment,pan=random(-.7,.7);
    if(['village','bamboo','marsh'].includes(env)){
      const bird=env==='marsh'?900:random(1500,2150);
      for(let i=0;i<3;i++)tone(group,bird*(i===1?1.25:1),start+i*.14,.105,.018,{end:bird*(i===1?1.05:1.45),pan});
      if(env==='bamboo')noise(group,2800,950,start+.5,.7,.028,-pan);
      return random(3.8,7.4);
    }
    if(env==='ruins'){
      const hz=random(660,1100);tone(group,hz,start,.11,.036,{end:hz*1.65,pan});tone(group,hz,start+.24,.19,.013,{pan:-pan});return random(1.8,3.7);
    }
    if(env==='temple'||env==='pass'){
      bell(group,env==='temple'?196:587.33,start,env==='temple'?.048:.021,env==='temple'?3.4:2.5,pan);return random(9,14);
    }
    if(env==='city'){
      tone(group,random(350,480),start,.06,.018,{end:180,type:'triangle',pan});bell(group,1174.66,start+.14,.009,.5,-pan);return random(2.3,4.2);
    }
    if(env==='camp'){
      for(let i=0;i<3;i++)noise(group,random(1400,2400),700,start+i*.17,.045,.024,pan);return random(1.4,3.2);
    }
    if(env==='valley'){
      noise(group,150,65,start,2.6,.15,pan);tone(group,48,start,2.5,.025,{end:32,attack:.3,pan});return random(11,17);
    }
    return 12;
  }
  function score(group,start,step) {
    const p=group.profile,index=step%16,phrase=Math.floor(step/16),note=(phrase%2?p.answer:p.call)[index],beat=60/p.bpm/2;
    if(note!==null){
      const midi=p.root+note,pan=Math.sin(step*.8)*.22,accent=index%4===0?1:.8;
      if(p.instrument==='flute')tone(group,frequency(midi),start,beat*2.6,.063*accent,{attack:.075,vibrato:true,pan});
      else if(p.instrument==='bell')bell(group,frequency(midi),start,.054*accent,1.7,pan);
      else pluck(group,midi,start,.3*accent,p.instrument,pan);
      // A quiet answer in the second phrase keeps the arrangement from looping flatly.
      if(phrase%4===3&&index%4===2)pluck(group,midi+12,start+beat*.5,.1,'qin',-pan);
    }
    if(step%8===0){
      const bass=p.root+([0,7,0,p.drums?3:7][Math.floor(step/8)%4]);
      pluck(group,bass-12,start,.24,'qin',-.24);
      if(!p.drums)pluck(group,bass+7,start+.035,.12,'qin',.26);
    }
    if(p.environment==='temple'&&step%16===8)tone(group,frequency(p.root+19),start,2.3,.025,{vibrato:true,attack:.18,pan:.35});
    if(p.drums){
      const heavy=['boss','final','tower'].includes(p.drums),distant=p.drums==='distant';
      if(step%(distant?8:4)===0)drum(group,start,true,-.16,distant?.35:p.drums==='duel'?.48:heavy?.85:.66);
      if(!distant&&step%4===2)drum(group,start,false,.2,heavy?.88:.58);
      if((heavy&&step%2===1)||(intensity>.45&&step%4===3))noise(group,2100,1400,start,.055,.025+intensity*.025,step%4===1?-.35:.35);
      if(p.drums==='final'&&step%16===0)bell(group,frequency(p.root+12),start,.044,1.5);
    }
  }
  function stopTimer(){if(timer!==null){clearInterval(timer);timer=null;}}
  function tick() {
    if(!shouldRun()||context.state!=='running')return;
    const now=context.currentTime;
    for(const voice of [...voices])if(voice.end<now-.06)discardVoice(voice);
    for(const group of [...groups])if(group.expires<=now)clearGroup(group);
    if(!current)return;
    const beat=60/current.profile.bpm/2;
    // A delayed browser frame skips missed beats instead of releasing a burst of notes.
    if(current.nextBeat<now-.15){const skipped=Math.ceil((now-current.nextBeat)/beat);current.step+=skipped;current.nextBeat+=skipped*beat;}
    while(current.nextBeat<now+.22){score(current,Math.max(now+.006,current.nextBeat),current.step++);current.nextBeat+=beat;}
    if(current.nextAmbient<now+.22){current.nextAmbient=Math.max(now+.01,current.nextAmbient);current.nextAmbient+=environmental(current,current.nextAmbient);}
  }
  function switchScene() {
    const now=context.currentTime,profile=scenes[sceneId],fade=profile.drums&&profile.drums!=='distant'?.48:1.15;
    if(current){ramp(current.output.gain,0,fade);current.expires=now+fade+.06;}
    // Rapid travel keeps only the outgoing and incoming soundscapes alive.
    for(const group of [...groups])if(!group.isEffect&&group!==current)clearGroup(group);
    current=makeGroup(profile);current.output.gain.setValueAtTime(0,now);current.output.gain.linearRampToValueAtTime(1,now+fade);
    current.step=0;current.nextBeat=now+.035;startEnvironment(current);tick();
  }
  function quiet() {
    stopTimer();restart=true;
    if(master&&context.state==='running')ramp(master.gain,0,.035);
  }
  function reconcile() {
    const token=++revision;
    operation=operation.catch(()=>{}).then(async()=>{
      try{
        if(shouldRun()){
          initialize();await context.resume();if(token!==revision||!shouldRun())return;
          if(restart){clearGroups();restart=false;}
          ramp(master.gain,.82,.08);
          if(!current)switchScene();
          if(timer===null)timer=setInterval(tick,90);
        }else if(context){
          if(context.state==='running')await new Promise(resolve=>setTimeout(resolve,45));
          if(token!==revision||shouldRun())return;
          clearGroups();if(context.state!=='closed')await context.suspend();
        }
        changed();
      }catch(error){if(token===revision){enabled=false;stopTimer();clearGroups();if(master)master.gain.value=0;changed();onError(error);}}
    });
    return operation;
  }
  function setEnabled(value) {
    if(disposed)return Promise.resolve();enabled=!!value;
    // Create synchronously in the trusted click; resume and cleanup remain serialized.
    if(enabled&&!context){try{initialize();}catch(error){enabled=false;changed();onError(error);return Promise.resolve();}}
    if(!shouldRun())quiet();changed();return reconcile();
  }
  function setHidden(value) {hidden=!!value;if(!shouldRun())quiet();return reconcile();}
  function setScene(id,{energy=0}={}) {
    const next=scenes[id]?id:'village';intensity=Math.max(0,Math.min(1,energy));
    if(next===sceneId)return;sceneId=next;
    if(shouldRun()&&context?.state==='running'&&!restart)switchScene();changed();
  }
  function duck(duration=.5) {
    const now=context.currentTime;hold(background.gain,now);background.gain.linearRampToValueAtTime(.54,now+.028);background.gain.setValueAtTime(.54,now+duration);background.gain.linearRampToValueAtTime(1,now+duration+.45);
  }
  function play(kind,{category='weapon',pan=0,role='',blocked=false,broken=false}={}) {
    if(!shouldRun()||context?.state!=='running'||restart)return false;
    const now=context.currentTime,last=recent.get(kind);
    if(last!==undefined&&now-last<(kind==='step'?.085:.065))return false;
    recent.set(kind,now);
    if(!effects)effects=makeGroup({space:.2},true);
    const g=effects,t=now+.006;
    // Reserve room for the current action even during a busy scene transition.
    for(const voice of [...voices]){if(voices.size<MAX_VOICES-28)break;if(Number.isFinite(voice.end))discardVoice(voice);}
    const n=(from,to,delay,duration,volume=.12,p=pan)=>noise(g,from,to,t+delay,duration,volume,p);
    const s=(hz,end,delay,duration,volume=.08,type='sine')=>tone(g,hz,t+delay,duration,volume,{end,type,pan});
    const chord=(notes,spacing=.11,volume=.08)=>notes.forEach((midi,i)=>bell(g,frequency(midi),t+i*spacing,volume,.65,pan));
    if(['strike','sweep','pierce','ultimate'].includes(kind)){
      if(kind==='strike'){n(2800,800,0,.14,.15);s(1600,1150,.045,.1,.038);s(125,64,.065,.13,.08);}
      if(kind==='sweep'){n(2600,550,0,.3,.19,-.55);n(1900,700,.12,.26,.14,.55);s(740,290,.065,.24,.048,'triangle');}
      if(kind==='pierce'){n(3800,1400,0,.12,.18);s(2100,1550,.025,.18,.043);drum(g,t+.055,true,pan,.95);}
      if(kind==='ultimate'){n(550,2400,0,.28,.15,-.3);for(let i=0;i<3;i++){n(3200,600,.14+i*.09,.23,.17,i%2?.55:-.55);s(880+i*160,440,.14+i*.09,.28,.038);}drum(g,t+.22,true,0,1.15);bell(g,587.33,t+.25,.063,1.2);}
      if(broken)bell(g,1760,t+.1,.035,.42);
      duck(kind==='ultimate'?.85:.22);
    }else if(kind==='poison'){
      n(2600,1250,0,.5,.095);s(420,180,.03,.24,.07);s(590,240,.14,.25,.05);duck(.25);
    }else if(['potion','elixir','antidote','qi','food'].includes(kind)){
      s(510,160,0,.065,.055,'triangle');n(750,410,.055,.14,.075);
      if(kind==='qi'){n(1300,2600,.09,.4,.045);chord([76,81,88],.1,.049);}
      else if(kind==='antidote'){n(2200,500,.1,.45,.068);chord([69,76],.17,.045);}
      else{for(let i=0;i<2;i++)s(300+i*90,460+i*70,.09+i*.11,.1,.04);chord(kind==='elixir'?[60,67,72,76]:[60,67,72],.1,kind==='food'?.032:.05);}
      duck(.5);
    }else if(['heal','aid','rest'].includes(kind)){
      n(600,1800,0,.6,.035);[60,67,72,76].forEach((midi,i)=>tone(g,frequency(midi),t+.07+i*.12,kind==='rest'?1.2:.72,.045,{attack:.09,vibrato:true,pan}));duck(.7);
    }else if(kind==='equip'){
      if(category==='armor'){n(600,1100,0,.21,.12);s(520,300,.09,.08,.05,'triangle');s(750,590,.17,.1,.034);}
      else if(category==='accessory'){bell(g,1046.5,t,.065,.7);bell(g,1567.98,t+.09,.035,.65);}
      else{n(3100,1500,0,.2,.11);bell(g,1318.5,t+.05,.046,.55);s(460,310,.03,.12,.035,'triangle');}
      duck(.25);
    }else if(kind==='manual'){n(1700,2600,0,.23,.075);chord([69,76,81],.12,.036);}
    else if(kind==='guard'||kind==='block'){s(230,170,0,.2,.08,'triangle');bell(g,620,t+.015,.052,.37);if(kind==='block')n(1900,700,0,.1,.13);}
    else if(kind==='hurt'){
      if(blocked){bell(g,760,t,.047,.27);n(1600,600,0,.09,.12);}
      else{s(135,48,0,.18,.13);n(role==='ranged'?3300:700,role==='ranged'?1000:280,0,role==='poison'?.32:.13,.13);}
      duck(.16);
    }else if(kind==='warn'){s(147,110,0,.24,.07,'triangle');s(147,98,.28,.28,.075,'triangle');bell(g,440,t,.03,.7);duck(.5);}
    else if(kind==='error'){s(220,160,0,.09,.038,'triangle');s(185,138,.105,.1,.027,'triangle');}
    else if(kind==='battleStart'){n(2600,800,0,.28,.15);drum(g,t+.08,true,0,.85);bell(g,880,t+.04,.04,.65);duck(.3);}
    else if(kind==='win'){[62,66,69,74,78].forEach((m,i)=>{pluck(g,m,t+i*.15,.36,'pipa',i*.15-.3);bell(g,frequency(m),t+i*.15,.045,.9);});duck(1.25);}
    else if(kind==='lose'){[57,52,45].forEach((m,i)=>pluck(g,m,t+i*.23,.38,'qin'));s(110,98,.16,.9,.025);duck(1.05);}
    else if(kind==='chest'){s(310,130,0,.09,.06,'triangle');[1318.5,1760,2093].forEach((f,i)=>bell(g,f,t+.075+i*.06,.034,.38,i*.3-.3));}
    else if(kind==='gather'){n(2200,1000,0,.17,.085);pluck(g,81,t+.06,.2,'qin');}
    else if(kind==='ore'){bell(g,880,t,.042,.4);n(1700,600,0,.1,.1);}
    else if(kind==='puzzle'){s(420,250,0,.09,.045,'triangle');}
    else if(kind==='solve'){chord([62,69,74,78],.12,.045);duck(.55);}
    else if(kind==='castLine'){n(2100,800,0,.22,.085);n(1200,400,.24,.18,.12);}
    else if(kind==='catch'){n(900,2100,0,.25,.14);s(460,850,.035,.12,.048);pluck(g,81,t+.13,.23,'qin');}
    else if(kind==='step'){n(600,240,0,.055,.07);s(140,95,0,.04,.024);}
    else if(kind==='turn')pluck(g,81,t,.17,'qin');
    return true;
  }
  async function dispose() {
    disposed=true;enabled=false;quiet();await reconcile();
    if(context&&context.state!=='closed')await context.close();
    samples.clear();changed();
  }
  return{setEnabled,setHidden,setScene,play,dispose,get status(){return status();}};
};
