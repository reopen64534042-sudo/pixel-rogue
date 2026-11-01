/** Developer art playback, using the real rule/render modules. Never included in the game entry. */
import Phaser from 'phaser';
import {GameCore} from '../../../src/game/core/GameCore.ts';
import {FixedClock} from '../../../src/game/core/FixedClock.ts';
import {DOMAIN_UNLOCK_LEVELS} from '../../../src/game/data/domain.ts';
import {PixelPainter} from '../../../src/game/rendering/PixelPainter.ts';
import {DomainNumbers,drawDomainGround,drawDomainEffects,drawDomainOverloadBody,preloadDomainArt} from '../../../src/game/rendering/DomainRenderer.ts';
import {DomainCharacter,DOMAIN_CHARACTER} from '../../../src/game/rendering/characters/DomainCharacter.ts';
import {SPR} from '../../../src/game/rendering/sprites.ts';
import {spriteEntry} from '../../../src/game/rendering/assetRegistry.ts';

if (!import.meta.env.DEV) throw new Error('The domain art playback is development-only.');
const panels=[],games=[];
let paused=false,speed=1;
const exportCanvas=document.createElement('canvas');exportCanvas.width=960;exportCanvas.height=440;
const exportContext=exportCanvas.getContext('2d');
let recording=null,recordTimer=null,disposing=false;
function compose(){
  if(!exportContext)return;
  exportContext.fillStyle='#0b0c14';exportContext.fillRect(0,0,960,440);exportContext.imageSmoothingEnabled=false;
  exportContext.fillStyle='#e8e8f0';exportContext.font='bold 18px system-ui';
  exportContext.fillText('每个目标反复受斩',16,27);exportContext.fillText('连斩 + 无量展开 / 停滞',496,27);
  games.forEach((game,i)=>{exportContext.drawImage(game.canvas,i*480,40,480,360);
    exportContext.fillStyle='#9fe1ff';exportContext.font='14px system-ui';exportContext.fillText(panels[i]?.output.textContent??'',i*480+16,425);});
}
function download(blob,name){
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function reset(panel){
  const c=panel.core;
  c.audio.muted=true;c.resetGame('mage',undefined,undefined,'domain');c.state='play';
  c.devSetDomainLevel(panel.level);c.texts=[];c.spawnCd=1000;c.domain.castCd=1000;c.player.crit=0;
  panel.x=c.player.x+65;panel.y=c.player.y;
  c.domain.deployment={x:panel.x,y:panel.y,age:0};
  for(let i=0;i<7;i++){
    const e=c.spawnEnemy(i%3===0?'shooter':i%3===1?'slime':'bat');
    const a=i*Math.PI*2/7;
    Object.assign(e,{x:panel.x+Math.cos(a)*37,y:panel.y+Math.sin(a)*32,hp:10000,maxhp:10000,speed:30,dmg:0,shootCd:.25});
  }
  panel.clock.reset();panel.character.reset();
}
function present(panel){
  const {core:c,painter:p}=panel;p.begin();panel.numbers.begin(c.texts);panel.character.capture(c);
  panel.cameras.main.setScroll(panel.x-120,panel.y-96);
  const x0=Math.floor((panel.x-120)/16)*16,y0=Math.floor((panel.y-96)/16)*16;
  for(let y=y0;y<y0+208;y+=16)for(let x=x0;x<x0+272;x+=16){p.fillStyle=(x/16+y/16)%2?'#1d2033':'#1a1c2c';p.fillRect(x,y,16,16);}
  drawDomainGround(c,p);
  for(const e of c.enemies){
    const entry=spriteEntry(e.spr);if(!entry||e.dead)continue;
    const x=Math.round(e.x-entry.w/2),y=Math.round(e.y-entry.h/2);
    p.sprite(entry.tex,x,y,entry.w,entry.h);drawDomainOverloadBody(c,p,e,x,y,entry.w,entry.h);
  }
  panel.character.draw(p,c.player.x,c.player.y);
  for(const b of c.ebullets){p.fillStyle='#ffb347';p.fillRect(b.x-1,b.y-1,2,2);}
  drawDomainEffects(c,p);
  for(const text of c.texts){
    if(panel.numbers.draw(p,text))continue;
    p.font=text.big?'12px monospace':'8px monospace';p.textAlign='center';p.fillStyle=text.c;p.globalAlpha=Math.min(1,text.life/.2);p.fillText(text.s,text.x,text.y);p.globalAlpha=1;
  }
  const locked=c.enemies.filter(e=>(e.domainStunUntil??0)>c.time).length;
  panel.output.textContent=`${c.time.toFixed(1)} 秒 · 每秒 10 轮连斩${c.domain.upgrades.includes('void')?` · 实际过载 ${locked}/${c.enemies.length}`:''}`;
}
for(const [id,level] of [['slash',DOMAIN_UNLOCK_LEVELS.slash],['void',DOMAIN_UNLOCK_LEVELS.void]]){
  document.getElementById(`${id}-title`).textContent=`Lv.${level} · ${id==='slash'?'每个目标反复受斩':'连斩 + 无量空处'}`;
  class DomainArtScene extends Phaser.Scene{
    core=new GameCore();clock=new FixedClock();character=new DomainCharacter();
    level=level;output=document.getElementById(`${id}-state`);
    preload(){
      preloadDomainArt(this);
      this.load.spritesheet(DOMAIN_CHARACTER.texture,`/assets/characters/domain-warden-64x64.png`,{frameWidth:64,frameHeight:64});
      this.load.image(DOMAIN_CHARACTER.seal,'/assets/characters/domain-seal-8x10.png');
    }
    create(){
      for(const [key,canvas]of Object.entries(SPR))this.textures.addCanvas(key,canvas);
      this.painter=new PixelPainter(this);this.numbers=new DomainNumbers(this);panels.push(this);reset(this);present(this);
      if(panels.length===2){document.getElementById('save').disabled=false;document.getElementById('record').disabled=false;}
      this.events.once('shutdown',()=>{this.numbers.dispose();this.core.audio.dispose();});
    }
    update(_time,delta){
      if(!this.painter)return;
      if(!paused){this.clock.advance(delta/1000*speed,dt=>this.core.step(dt));if(this.core.time>=3.2)reset(this);}
      else this.clock.reset();
      present(this);
    }
  }
  games.push(new Phaser.Game({type:Phaser.AUTO,width:240,height:180,parent:id,pixelArt:true,roundPixels:true,render:{preserveDrawingBuffer:true},backgroundColor:'#141725',scene:DomainArtScene,audio:{noAudio:true}}));
}
document.getElementById('pause').onclick=()=>{paused=!paused;document.getElementById('pause').textContent=paused?'继续':'暂停';};
document.getElementById('frame').onclick=()=>{paused=true;document.getElementById('pause').textContent='继续';for(const panel of panels){panel.core.step(1/60);present(panel);}};
document.getElementById('restart').onclick=()=>{for(const panel of panels){reset(panel);present(panel);}};
document.getElementById('speed').onchange=event=>{speed=Number(event.target.value);};
document.getElementById('save').onclick=()=>{compose();exportCanvas.toBlob(blob=>{if(blob)download(blob,'domain-hit-slash-void.png');},'image/png');};
document.getElementById('record').onclick=()=>{
  if(recording || panels.length<2)return;
  const button=document.getElementById('record');button.disabled=true;button.textContent='正在录制…';
  paused=false;speed=1;document.getElementById('speed').value='1';document.getElementById('pause').textContent='暂停';
  for(const panel of panels)reset(panel);
  const stream=exportCanvas.captureStream(30),chunks=[];
  const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp8')?'video/webm;codecs=vp8':'video/webm';
  recording=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3000000});
  recording.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
  recording.onstop=()=>{clearTimeout(recordTimer);games[0]?.events?.off(Phaser.Core.Events.POST_RENDER,compose);stream.getTracks().forEach(track=>track.stop());
    if(!disposing)download(new Blob(chunks,{type:'video/webm'}),'domain-hit-slash-void.webm');recording=null;
    if(!disposing){button.disabled=false;button.textContent='录制三秒对比';}};
  games[0].events.on(Phaser.Core.Events.POST_RENDER,compose);
  games[0].events.once(Phaser.Core.Events.POST_RENDER,()=>{recording.start();recordTimer=setTimeout(()=>{if(recording?.state==='recording')recording.stop();},3000);});
};
window.addEventListener('pagehide',()=>{disposing=true;clearTimeout(recordTimer);if(recording?.state==='recording')recording.stop();for(const game of games)game.destroy(true);},{once:true});
window.addEventListener('error',event=>{document.getElementById('error').textContent=event.message;});
