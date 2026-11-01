import type Phaser from 'phaser';
import type { GameCore } from '../../core/GameCore';
import type { PixelPainter } from '../PixelPainter';
import { isDomain } from '../../core/DomainSystem';

export const DOMAIN_CHARACTER={texture:'character-domain-warden',image:'assets/characters/domain-warden-64x64.png',
  seal:'character-domain-seal',sealImage:'assets/characters/domain-seal-8x10.png',runFrameDistance:8} as const;
export function registerDomainCharacter(textures:Phaser.Textures.TextureManager,body:HTMLImageElement,seal:HTMLImageElement) {
  if (body.naturalWidth!==256 || body.naturalHeight!==1024 || seal.naturalWidth!==8 || seal.naturalHeight!==10)
    throw new Error('Domain character dimensions must be 256x1024 and 8x10');
  if (!textures.exists(DOMAIN_CHARACTER.texture) && !textures.addSpriteSheet(DOMAIN_CHARACTER.texture,body,{frameWidth:64,frameHeight:64}))
    throw new Error('Cannot register Domain character');
  if (!textures.exists(DOMAIN_CHARACTER.seal) && !textures.addImage(DOMAIN_CHARACTER.seal,seal))
    throw new Error('Cannot register Domain seals');
}
/** Presentation only; every pose and orbit reads frozen simulation time. */
export class DomainCharacter {
  private player:GameCore['player']|null=null;
  private time=0;private x=0;private y=0;private left=false;private frame:number|null=null;
  private movedUntil=0;private gait=0;private active=false;
  reset() {this.player=null;this.frame=null;this.movedUntil=0;this.gait=0;this.left=false;this.active=false;}
  capture(c:GameCore) {
    if (!isDomain(c) || c.state==='start') {this.reset();return;}
    const p=c.player;
    if (p!==this.player || c.time<this.time) {this.reset();this.player=p;this.x=p.x;this.y=p.y;this.time=c.time;}
    const dt=Math.max(0,c.time-this.time),distance=Math.hypot(p.x-this.x,p.y-this.y);
    if (dt>0 && distance>.01) {
      this.movedUntil=c.time+.06;
      // Dashes use their own pose; their travel must not skip the running cycle.
      if (p.dashT<=0) this.gait=(this.gait+distance/DOMAIN_CHARACTER.runFrameDistance)%4;
    }
    if (Math.abs(p.x-this.x)>.01) this.left=p.x<this.x;
    else if (dt>0 && distance<=.01 && c.time>=this.movedUntil && c.domain.deployment) this.left=c.domain.deployment.x<p.x;
    const moving=c.time<this.movedUntil;
    let row=moving?1:0,index=Math.floor(moving?this.gait:c.time*3)%4;
    const d=c.domain;
    this.active=!!d.deployment || !!d.collapse;
    if (p.dashT>0) {row=6;index=Math.min(3,Math.floor((.16-p.dashT)/.16*4));}
    else if (d.hurtUntil>c.time) {row=7;index=Math.min(3,Math.floor((.25-(d.hurtUntil-c.time))/.25*4));}
    else if (d.collapse) {row=moving?5:4;index=moving?Math.floor(this.gait)%4:Math.min(3,Math.floor(d.collapse.age/.35*4));}
    else if (d.deployment) {row=moving?3:2;index=moving?Math.floor(this.gait)%4:Math.min(3,Math.floor(d.deployment.age/.25*4));}
    this.frame=(this.left?32:0)+row*4+index;this.time=c.time;this.x=p.x;this.y=p.y;
  }
  draw(p:PixelPainter,x:number,y:number):boolean {
    if (this.frame===null || !p.hasTexture(DOMAIN_CHARACTER.texture)) return false;
    const seal=(i:number)=>{
      const angle=this.time*(this.active?2.8:1.2)+i*Math.PI*2/3;
      if (p.hasTexture(DOMAIN_CHARACTER.seal)) p.spriteRot(DOMAIN_CHARACTER.seal,
        Math.round(x+Math.cos(angle)*(this.active?17:12)),Math.round(y-13+Math.sin(angle)*6),Math.sin(angle)*.25,1);
    };
    for (let i=0;i<3;i++) if (Math.sin(this.time*(this.active?2.8:1.2)+i*Math.PI*2/3)<0) seal(i);
    p.spriteFrame(DOMAIN_CHARACTER.texture,String(this.frame),{x:Math.round(x),y:Math.round(y)+5,
      originX:.5,originY:59/64,scaleX:1,scaleY:1,angle:0});
    for (let i=0;i<3;i++) if (Math.sin(this.time*(this.active?2.8:1.2)+i*Math.PI*2/3)>=0) seal(i);
    return true;
  }
}
