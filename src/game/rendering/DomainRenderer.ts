import type Phaser from 'phaser';
import type { GameCore } from '../core/GameCore';
import type { PixelPainter } from './PixelPainter';
import { isDomain, domainFieldRadius } from '../core/DomainSystem';
import { DOMAIN, domainXpNext, domainUpgrade } from '../data/domain';
import { DOMAIN_GLYPHS, DOMAIN_NUMBER_STYLES } from '../data/domainNumberArt';
import type { Enemy, FloatingText } from '../core/types';

export function preloadDomainArt(scene:Phaser.Scene) {
  for (const name of ['field','blackhole','impact']) scene.load.image(`domain-${name}`,`${import.meta.env.BASE_URL}assets/vfx/domain/${name}-128.png`);
}
function ring(p:PixelPainter,x:number,y:number,r:number,time:number,color='#8a5cff',alpha=.6) {
  p.globalAlpha=alpha;p.strokeStyle=color;
  for (let i=0;i<3;i++) {const a=time+i*Math.PI*2/3;p.beginPath();p.arc(x,y,r,a,a+Math.PI*.46);p.stroke();}
  p.globalAlpha=1;
}
function texture(p:PixelPainter,key:string,x:number,y:number,r:number,angle:number,alpha:number) {
  if (!p.hasTexture(key)) return;
  p.globalAlpha=alpha;p.spriteRot(key,x,y,angle,r/64);p.globalAlpha=1;
}
/** A short blade crosses the actual victim, with pointed ends and a crisp white impact. */
function incision(p:PixelPainter,x:number,y:number,angle:number,half:number,age:number,life:number) {
  const dx=Math.cos(angle),dy=Math.sin(angle),reach=Math.min(1,(age+.012)/.035);
  const start=-half,end=half*(-1+2*reach),middle=(start+end)/2;
  const fade=Math.min(1,(life-age)/.045);
  const blade=(width:number,color:string,alpha:number)=>p.polygon([
    x+dx*start,y+dy*start,x+dx*middle-dy*width,y+dy*middle+dx*width,
    x+dx*end,y+dy*end,x+dx*middle+dy*width,y+dy*middle-dx*width,
  ],color,alpha);
  blade(2.2,'#8a5cff',fade);
  blade(.8,'#e8e8f0',fade);
  if (age<.035) {
    p.globalAlpha=.85;p.fillStyle='#e8e8f0';
    p.fillRect(Math.round(x)-1,Math.round(y)-1,2,2);p.globalAlpha=1;
  }
}
/** Domain-local depth and information streams; drawn below actors and danger telegraphs. */
function voidRealm(p:PixelPainter,x:number,y:number,r:number,time:number,id:number,fade:number,age:number) {
  const reveal=1-(1-Math.min(1,age/.32))**3;
  r*=reveal;
  if (r<1) return;
  const disk:number[]=[];
  for (let i=0;i<48;i++) {const a=i*Math.PI/24;disk.push(x+Math.cos(a)*r,y+Math.sin(a)*r);}
  // This interior replaces the ordinary seal: deep black-blue space and one bright horizon.
  p.polygon(disk,'#050918',.96*fade);
  for (let layer=0;layer<3;layer++) {
    const radius=r*(.32+layer*.23),cx=x+r*.12,cy=y-r*.16;
    p.globalAlpha=(.18+layer*.06)*fade;p.strokeStyle=layer===2?'#57e6ff':'#647de0';p.beginPath();
    for (let i=0;i<=40;i++) {
      const a=i*Math.PI/20,px=cx+Math.cos(a)*radius,py=cy+Math.sin(a)*radius*.58;
      if (i===0) p.moveTo(px,py);else p.lineTo(px,py);
    }
    p.stroke();
  }
  for (let i=0;i<46;i++) {
    const a=i*2.39996+id+time*.018,dist=r*Math.sqrt((i+.5)/46)*.9;
    const sx=Math.round(x+Math.cos(a)*dist),sy=Math.round(y+Math.sin(a)*dist);
    p.globalAlpha=(.5+.3*Math.sin(time*1.6+i))*fade;
    p.fillStyle=i%5?'#9fe1ff':'#e8e8f0';p.fillRect(sx,sy,1,1);
    if (i%11===0) {p.globalAlpha=.35*fade;p.fillRect(sx-1,sy,3,1);p.fillRect(sx,sy-1,1,3);}
  }
  p.globalAlpha=.85*fade;p.strokeStyle='#57e6ff';p.beginPath();p.arc(x,y,r,0,Math.PI*2);p.stroke();
  ring(p,x,y,r*.98,-time*.12,'#e8e8f0',.9*fade);
  ring(p,x,y,r*.92,time*.1,'#57e6ff',.35*fade);
  p.globalAlpha=1;
}
export function drawDomainGround(c:GameCore,p:PixelPainter) {
  if (!isDomain(c)) return;
  const d=c.domain,t=c.time;
  if (d.deployment) ring(p,d.deployment.x,d.deployment.y,8+12*d.deployment.age/.25,-t*4,'#e8e8f0',.7);
  if (d.fields.length>=2) for (let i=0;i<d.fields.length-(d.fields.length===2?1:0);i++) {
    const a=d.fields[i],b=d.fields[(i+1)%d.fields.length];p.beam(a.x,a.y,b.x,b.y,1,'#8a5cff',d.collapse?.7:.25);
  }
  for (const f of d.fields) {
    const r=domainFieldRadius(c,f)*Math.min(1,f.age/.16);
    const fade=Math.min(1,(f.life-f.age)/.3);
    if (domainUpgrade(f.stats,'void')) {
      voidRealm(p,f.x,f.y,r,t,f.id,fade,f.age);
      continue;
    }
    texture(p,'domain-field',f.x,f.y,r,t*.15+f.id,.64*fade);
    ring(p,f.x,f.y,r,-t*.4+f.id,'#8a5cff',.55*fade);
    ring(p,f.x,f.y,r*.78,t*.7+f.id,'#b05cff',.35*fade);
    const count=Math.round(4*f.stats.M);
    for (let i=0;i<count;i++) {const a=i*6.283/count+t*.5+f.id,dist=r*(.85-((i*.31+t*.65)%1)*.75);
      const inner=Math.max(2,dist-5);
      p.beam(f.x+Math.cos(a)*dist,f.y+Math.sin(a)*dist,f.x+Math.cos(a)*inner,f.y+Math.sin(a)*inner,1,
        i%3?'#8a5cff':'#57e6ff',.45*fade);}
    p.globalAlpha=1;
  }
  const hole=(h:NonNullable<typeof d.blackHole>|NonNullable<typeof d.remnant>,remnant:boolean)=>{
    const r=h.stats.holeR,fade=Math.min(1,(h.life-h.age)/.15)*(remnant?.38:1);
    if (!remnant && domainUpgrade(h.stats,'void')) voidRealm(p,h.x,h.y,r,t,h.id,fade*.8,h.age);
    texture(p,'domain-blackhole',h.x,h.y,r,-t*.9,fade);
    ring(p,h.x,h.y,r,-t*1.1,'#b05cff',.6*fade);
    ring(p,h.x,h.y,r*.58,t*1.7,'#e8e8f0',.35*fade);
    const count=Math.round(8*h.stats.M);
    for (let i=0;i<count;i++) {const phase=(t*1.4+i/count)%1,a=i*2.39996+t*1.4;
      const outer=r*(1-phase),inner=Math.max(2,outer-6);
      p.beam(h.x+Math.cos(a)*outer,h.y+Math.sin(a)*outer,h.x+Math.cos(a+.1)*inner,h.y+Math.sin(a+.1)*inner,1,
        i%4?'#8a5cff':'#57e6ff',.5*fade);}
  };
  if (d.remnant) hole(d.remnant,true);
  if (d.blackHole) hole(d.blackHole,false);
  if (d.vortex) {const v=d.vortex;ring(p,v.x,v.y,DOMAIN.dashRadius,t*4,'#8a5cff',.5*(1-v.age/v.life));}
}
export function drawDomainOverloadBody(c:GameCore,p:PixelPainter,e:Enemy,x:number,y:number,w:number,h:number) {
  if ((e.domainStunUntil??0)<=c.time) return;
  // Keep the sprite legible beneath the cuts; the static cyan silhouette denotes overload.
  p.globalAlpha=.16;p.fillStyle='#9fe1ff';p.fillRect(x,y,w,h);
  p.globalAlpha=.4;p.fillStyle='#57e6ff';
  p.fillRect(x-1,y,1,h);p.fillRect(x+w,y,1,h);
  p.fillStyle='#e8e8f0';p.globalAlpha=.55;
  p.fillRect(x,y,Math.min(w,3),1);p.fillRect(x+w-Math.min(w,3),y,Math.min(w,3),1);
  p.globalAlpha=1;
}
export function drawDomainEffects(c:GameCore,p:PixelPainter) {
  if (!isDomain(c)) return;
  for (const e of c.domain.effects) {
    const progress=e.age/e.life,fade=1-progress,x=e.target&&!e.target.dead?e.target.x:e.x,y=e.target&&!e.target.dead?e.target.y:e.y;
    if (e.kind==='birth'||e.kind==='terminal') texture(p,'domain-impact',x,y,e.radius*(.5+progress*.55),0,fade);
    else if (e.kind==='voidExpansion') {
      const r=e.radius*(.25+.75*(1-(1-progress)**3));
      ring(p,x,y,r,-progress*.5,'#e8e8f0',fade);
      ring(p,x,y,r*.94,progress*.6,'#57e6ff',fade*.85);
      for (let i=0;i<12;i++) {
        const a=i*Math.PI/6,outer=r*(.95+.05*progress),inner=outer-4*fade;
        p.beam(x+Math.cos(a)*inner,y+Math.sin(a)*inner,x+Math.cos(a)*outer,y+Math.sin(a)*outer,1,'#9fe1ff',fade);
      }
    }
    else if (e.kind==='overload') {
      ring(p,x,y,e.radius*(1.25-progress*.25),0,'#57e6ff',fade*.7);
      for (let i=0;i<4;i++) {
        const a=Math.PI/4+i*Math.PI/2,r=e.radius;
        p.beam(x+Math.cos(a)*r*.5,y+Math.sin(a)*r*.5,x+Math.cos(a)*r,y+Math.sin(a)*r,1,'#e8e8f0',fade);
      }
    }
    else if (e.kind==='slash') {
      incision(p,x,y,e.angle??0,e.radius,e.age,e.life);
    } else ring(p,x,y,e.radius,e.age*4,e.kind==='siphon'?'#57e6ff':'#b05cff',fade);
  }
  if (c.domain.shield>0) ring(p,c.player.x,c.player.y-7,17,-c.time,'#b05cff',.65);
  for (const e of c.enemies) if (!e.dead && e.domainDamageAt!==undefined) {
    const age=c.time-e.domainDamageAt;
    if (age>=0 && age<.16) {
      const strength=1-age/.16;
      ring(p,e.x,e.y,e.r+2+age*12,-c.time*2,'#b05cff',strength*.65);
    }
  }
  for (const e of c.enemies) if (!e.dead && ((e.domainRootUntil??0)>c.time || (e.domainStunUntil??0)>c.time)) {
    if ((e.domainStunUntil??0)<=c.time) ring(p,e.x,e.y,e.r+4,c.time*2,'#8a5cff',.65);
    if ((e.domainStunUntil??0)>c.time) {
      const top=Math.round(e.y-e.r)-6;
      p.beam(e.x-7,top,e.x+7,top,2,'#57e6ff',.8);
      p.fillStyle='#e8e8f0';p.fillRect(Math.round(e.x)-3,top-3,1,3);p.fillRect(Math.round(e.x)+2,top-3,1,3);
      // Fixed corners read as sustained cognitive lock rather than rotating stun stars.
      for (const sign of [-1,1]) {
        const side=e.x+sign*(e.r+4);
        p.beam(side,e.y-5,side,e.y+5,1,'#9fe1ff',.95);
        p.beam(side,e.y-5,side-sign*3,e.y-5,1,'#e8e8f0',.95);
        p.beam(side,e.y+5,side-sign*3,e.y+5,1,'#e8e8f0',.95);
      }
    }
  }
  for (const e of c.enemies) if (!e.dead && !e.boss && (e.domainInfo??0)>0 && (e.domainStunUntil??0)<=c.time) {
    const load=e.domainInfo??0;
    // Information converges on each mind, then snaps into a stationary lock on success.
    for (let i=0;i<5;i++) {
      const a=i*Math.PI*2/5+e.seed,r=e.r+3+(1-load)*15;
      const ix=e.x+Math.cos(a)*r,iy=e.y+Math.sin(a)*r;
      p.beam(ix,iy,ix-Math.cos(a)*3,iy-Math.sin(a)*3,1,'#9fe1ff',.8);
      p.fillStyle='#e8e8f0';p.fillRect(Math.round(ix),Math.round(iy),1,1);
    }
  }
}
export function drawDomainResources(c:GameCore,p:PixelPainter) {
  if (!isDomain(c)) return;
  // Dash cells use y+12 in draw.ts; keep all three rows on a 5px vertical pitch.
  const d=c.domain,x=Math.round(c.player.x),y=Math.round(c.player.y)+17;
  for (let i=0;i<3;i++) {p.fillStyle=d.collapse?'#e8e8f0':i<d.fields.length?'#b05cff':'#32324b';p.fillRect(x-7+i*5,y,4,2);}
  const need=domainXpNext(d.level);p.fillStyle='#24243e';p.fillRect(x-13,y+5,26,2);
  p.fillStyle='#8a5cff';p.fillRect(x-13,y+5,Math.round(26*(need?d.xp/need:1)),2);
}

/** Paint each value once; sprite pool reuses cached two-frame split/settled textures. */
export class DomainNumbers {
  private cache=new Map<string,string>();
  private sequence=0;
  constructor(private scene:Phaser.Scene) {}
  dispose() {for (const key of this.cache.values()) this.scene.textures.remove(key);this.cache.clear();}
  begin(texts:readonly FloatingText[]) {
    if (this.cache.size<=256) return;
    const active=new Set(texts.filter(t=>t.domainDmg).map(t=>this.keyFor(t)));
    for (const [value,key] of this.cache) if (!active.has(value)) {this.scene.textures.remove(key);this.cache.delete(value);}
  }
  private keyFor(t:FloatingText) {
    const kind=t.domainDmg==='collapse'&&t.critDmg?'critical':t.domainDmg;
    const suffix=(t.domainTrue??0)>0?`+${Math.max(1,Math.round(t.domainTrue!))}`:'';
    return `${kind}:${t.s}:${suffix}`;
  }
  draw(p:PixelPainter,t:FloatingText):boolean {
    if (!t.domainDmg) return false;
    const kind=t.domainDmg==='collapse'&&t.critDmg?'critical':t.domainDmg;
    const style=DOMAIN_NUMBER_STYLES[kind],trueText=(t.domainTrue??0)>0?`+${Math.max(1,Math.round(t.domainTrue!))}`:'';
    const value=t.s,key=`${kind}:${value}:${trueText}`;
    let textureKey=this.cache.get(key);
    if (!textureKey) {
      textureKey=`domain-number-${this.sequence++}`;
      const pad=style.outline+4,width=Math.max(1,value.length*6*style.scale+trueText.length*6+pad*2+(style.emblem?8:0)),height=7*style.scale+pad*2+2;
      const canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=height;
      const ctx=canvas.getContext('2d');if (!ctx) return false;
      const paint=(text:string,x:number,y:number,scale:number,core:string,outline:string,split:boolean)=>{
        const pixels:{x:number;y:number}[]=[];
        for (const [i,ch] of [...text].entries()) {
          const glyph=DOMAIN_GLYPHS[ch as keyof typeof DOMAIN_GLYPHS];if (!glyph) continue;
          for (let row=0;row<7;row++) for (let col=0;col<5;col++) if (glyph[row][col]==='1')
            pixels.push({x:x+i*6*scale+col*scale+(split?(row<3?-1:1):0),y:y+row*scale});
        }
        for (const [radius,color] of [[scale>1?style.outline:1,'#1a0a2a'],[1,outline]] as const) {
          ctx.fillStyle=color;for (const pos of pixels) ctx.fillRect(pos.x-radius,pos.y-radius,scale+radius*2,scale+radius*2);
        }
        ctx.fillStyle=core;for (const pos of pixels) ctx.fillRect(pos.x,pos.y,scale,scale);
      };
      for (let frame=0;frame<2;frame++) {
        const x=frame*width+pad+(style.emblem?8:0);
        paint(value,x,pad,style.scale,'#e8e8f0',kind==='critical'?'#b05cff':'#8a5cff',frame===0);
        if (trueText) paint(trueText,x+value.length*6*style.scale+2,pad+7*style.scale-7,1,'#eaf7ff','#38bdf8',false);
        if (style.emblem) {ctx.fillStyle='#8a5cff';ctx.fillRect(frame*width+pad,pad+3*style.scale,4,4);}
      }
      const registered=this.scene.textures.addCanvas(textureKey,canvas);
      if (!registered) return false;
      registered.add('0',0,0,0,width,height);registered.add('1',0,width,0,width,height);
      this.cache.set(key,textureKey);
    }
    const life=t.domainMaxLife??style.life,age=life-t.life,frame=age<.08?'0':'1';
    const scale=1+(age<.1?.1*(1-age/.1):0);
    p.globalAlpha=Math.min(1,t.life/.18);
    p.spriteFrame(textureKey,frame,{x:Math.round(t.x),y:Math.round(t.y),originX:.5,originY:.5,scaleX:scale,scaleY:scale,angle:0});
    p.globalAlpha=1;return true;
  }
}
