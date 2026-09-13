'use strict';

// Presentation only. Nothing here changes a turn, an item, or the saved game.
globalThis.createJianghuFeedback = function ({scene, notice, reducedMotion}) {
  const colors={hit:'#ffe0a1',hurt:'#f3ab95',heal:'#c1efae',qi:'#a8e4df',poison:'#dec0f0',guard:'#d8dfa8',equip:'#e9cd91',warn:'#eec08f'};
  let effects=[],reactions=new Map(),sceneTimer,noticeTimer;
  const pulses=new Map();
  const reduced=()=>reducedMotion();
  function add(effect) {
    effects.push({age:0,duration:1,...effect});
    if(effects.length>64)effects.splice(0,effects.length-64);
  }
  function floating(point,text,tone='hit') {
    if(!text)return;
    const stacked=effects.filter(e=>e.kind==='text'&&e.age<.4&&Math.abs(e.x-point.x)<20&&Math.abs(e.y-point.y)<50).length;
    add({kind:'text',...point,y:point.y-65-stacked*28,text:String(text),tone,duration:1.25});
  }
  function ring(point,tone='heal') {add({kind:'ring',...point,tone,duration:.9});}
  function hit(point,{from=point,damage,tone='hit',kind='slash',label=''}={}) {
    add({kind,...point,from,tone,duration:.5});
    floating(point,(label?label+' ':'')+(damage>0?'−'+damage:''),tone);
  }
  function react(id,kind,from,to) {
    if(!id||reduced())return;
    const dx=(to?.x||0)-(from?.x||0),dy=(to?.y||0)-(from?.y||0),length=Math.hypot(dx,dy)||1;
    reactions.set(id,{kind,age:0,duration:.27,dx:dx/length,dy:dy/length});
  }
  function actor(id) {
    const r=reactions.get(id);if(!r||reduced())return{x:0,y:0,flash:false};
    const t=r.age/r.duration,swing=Math.sin(Math.PI*t),distance=r.kind==='strike'?15:8;
    return{x:r.dx*swing*distance,y:r.dy*swing*distance,flash:r.kind==='hurt'&&t<.3};
  }
  function update(dt) {
    for(const e of effects)e.age+=dt;
    effects=effects.filter(e=>e.age<e.duration);
    for(const [id,r] of reactions){r.age+=dt;if(r.age>=r.duration)reactions.delete(id);}
  }
  function draw(ctx) {
    for(const e of effects){
      const t=e.age/e.duration,color=colors[e.tone]||colors.hit;
      ctx.save();ctx.globalAlpha=Math.min(1,(1-t)*3);ctx.strokeStyle=color;ctx.fillStyle=color;
      if(e.kind==='text'){
        const rise=reduced()?0:Math.min(1,t*1.8)*39;
        ctx.font='600 '+(e.tone==='hurt'?25:27)+'px "Microsoft YaHei", sans-serif';
        ctx.textAlign='center';ctx.lineJoin='round';ctx.lineWidth=5;
        ctx.strokeStyle='#13281e';ctx.strokeText(e.text,e.x,e.y-rise);ctx.fillText(e.text,e.x,e.y-rise);
      }else if(reduced()){
        // Reduced motion keeps the result legible without a slash, flash or shake.
        ctx.globalAlpha=.5*(1-t);ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(e.x,e.y-5,32,14,0,0,Math.PI*2);ctx.stroke();
      }else if(e.kind==='ring'){
        const radius=25+t*38;
        ctx.globalAlpha=(1-t)*.8;ctx.lineWidth=3*(1-t)+1;
        ctx.beginPath();ctx.ellipse(e.x,e.y-7,radius,radius*.4,0,0,Math.PI*2);ctx.stroke();
        ctx.beginPath();ctx.ellipse(e.x,e.y-9,radius*.7,radius*.24,0,0,Math.PI*2);ctx.stroke();
        for(let i=0;i<9;i++){
          const phase=i*2.4,x=e.x+Math.sin(phase+t*2)*28,y=e.y-15-t*85-(i%3)*12;
          ctx.fillRect(x,y,3,6);
        }
        if(e.tone==='guard'){
          ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(e.x,e.y-84);ctx.lineTo(e.x+29,e.y-72);ctx.lineTo(e.x+22,e.y-39);
          ctx.lineTo(e.x,e.y-22);ctx.lineTo(e.x-22,e.y-39);ctx.lineTo(e.x-29,e.y-72);ctx.closePath();ctx.stroke();
        }
      }else{
        const impactY=e.y-46;
        if(e.kind==='arrow'||e.kind==='poison'){
          const travel=Math.min(1,t*3.5),sx=e.from.x,sy=e.from.y-48,x=sx+(e.x-sx)*travel,y=sy+(impactY-sy)*travel;
          ctx.lineWidth=e.kind==='poison'?4:2;ctx.beginPath();ctx.moveTo(sx+(x-sx)*.75,sy+(y-sy)*.75);ctx.lineTo(x,y);ctx.stroke();
          ctx.beginPath();ctx.arc(x,y,e.kind==='poison'?4:2,0,Math.PI*2);ctx.fill();
        }else{
          const wide=e.kind==='ultimate'?1.6:e.kind==='sweep'?1.35:1,reach=48*wide;
          ctx.globalAlpha=Math.max(0,1-t*1.2);ctx.lineWidth=6*(1-t)+1;
          ctx.beginPath();ctx.moveTo(e.x-reach,impactY+30*wide);
          ctx.quadraticCurveTo(e.x+5,impactY-12,e.x+reach,impactY-35*wide);ctx.stroke();
          ctx.strokeStyle='#fff5d6';ctx.lineWidth=2;
          ctx.beginPath();ctx.moveTo(e.x-reach+8,impactY+32*wide);ctx.lineTo(e.x+reach-10,impactY-29*wide);ctx.stroke();
          if(e.kind==='sweep'||e.kind==='ultimate'){
            ctx.strokeStyle=color;ctx.lineWidth=4*(1-t);ctx.beginPath();ctx.ellipse(e.x,impactY,reach+15,29, -.3,Math.PI*.9,Math.PI*2.2);ctx.stroke();
          }
        }
        ctx.globalAlpha=(1-t)*.9;ctx.fillStyle=color;
        for(let i=0;i<8;i++){const angle=i*Math.PI/4+.3,d=10+t*53;ctx.fillRect(e.x+Math.cos(angle)*d,impactY+Math.sin(angle)*d*.65,3+(i%2),3);}
      }
      ctx.restore();
    }
  }
  function pulse(el,tone='equip') {
    if(!el)return;
    clearTimeout(pulses.get(el));el.classList.remove('feedback-pulse');
    el.dataset.feedback=tone;void el.offsetWidth;el.classList.add('feedback-pulse');
    pulses.set(el,setTimeout(()=>{el.classList.remove('feedback-pulse');delete el.dataset.feedback;pulses.delete(el);},850));
  }
  function makeIcon(name) {
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS(svg.namespaceURI,'use');
    svg.setAttribute('aria-hidden','true');use.setAttribute('href','#i-'+name);svg.append(use);return svg;
  }
  function showNotice({title,detail='',tone='equip',icon='check'}) {
    clearTimeout(noticeTimer);notice.dataset.tone=tone;notice.replaceChildren();
    const mark=document.createElement('span'),copy=document.createElement('span'),heading=document.createElement('strong'),line=document.createElement('span');
    mark.className='feedback-notice-icon';mark.append(makeIcon(icon));copy.className='feedback-notice-copy';
    heading.textContent=title;line.textContent=detail;copy.append(heading,line);notice.append(mark,copy);
    notice.hidden=false;if(notice.showPopover&&!notice.matches(':popover-open'))notice.showPopover();
    noticeTimer=setTimeout(hideNotice,2700);
  }
  function hideNotice() {
    clearTimeout(noticeTimer);if(notice.hidePopover&&notice.matches(':popover-open'))notice.hidePopover();notice.hidden=true;
  }
  function announce(title,detail='',tone='hit',duration=1500) {
    clearTimeout(sceneTimer);scene.dataset.tone=tone;scene.replaceChildren();
    const heading=document.createElement('strong'),line=document.createElement('span');heading.textContent=title;line.textContent=detail;
    scene.append(heading,line);scene.hidden=false;sceneTimer=setTimeout(()=>scene.hidden=true,duration);
  }
  function clear() {
    effects=[];reactions.clear();clearTimeout(sceneTimer);scene.hidden=true;hideNotice();
    for(const [el,timer] of pulses){clearTimeout(timer);el.classList.remove('feedback-pulse');delete el.dataset.feedback;}pulses.clear();
  }
  return{floating,ring,hit,react,actor,update,draw,pulse,notice:showNotice,hideNotice,announce,clear};
};
