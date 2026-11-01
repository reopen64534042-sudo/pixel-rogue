/** Original code-native pixel glyphs and an offline domain damage-number painter. */
import { readFileSync } from 'node:fs';
import { loadPalette, hexToRgb } from '../../../scripts/lib/palette.mjs';

const palette=Object.fromEntries(loadPalette().map(p=>[p.key,hexToRgb(p.hex)]));
const combat=readFileSync(new URL('../../../src/game/core/CombatSystem.ts',import.meta.url),'utf8');
const ownedColor=name=>{
  const match=combat.match(new RegExp(`${name}\\s*=\\s*"(#[0-9a-fA-F]{6})"`));
  if(!match)throw new Error(`Missing owning text color: ${name}`);
  return hexToRgb(match[1]);
};
export const NUMBER_COLORS={ink:palette.ink0,shadow:palette.ink1,violet:palette.psiViolet,
  purple:palette.psiPurple,core:palette.bone,cyan:palette.iceCyan,
  trueCore:ownedColor('TRUE_DAMAGE_COLOR'),trueOutline:ownedColor('TRUE_DAMAGE_OUTLINE')};
export const DOMAIN_GLYPHS={
  '0':['01110','11011','10001','10101','10001','11011','01110'],
  '1':['00100','01100','10100','00100','00100','00100','11111'],
  '2':['01110','10001','00001','00010','00100','01000','11111'],
  '3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'],
  '5':['11111','10000','10000','11110','00001','00001','11110'],
  '6':['00110','01000','10000','11110','10001','10001','01110'],
  '7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'],
  '9':['01110','10001','10001','01111','00001','00010','01100'],
  '+':['00000','00100','00100','11111','00100','00100','00000'],
};
export const NUMBER_STYLES={
  collapse:{label:'普通坍缩',scale:2,outline:2,life:.68,rise:19,emblem:true},
  critical:{label:'暴击坍缩',scale:3,outline:3,life:.82,rise:17,emblem:true},
  slash:{label:'引力斩击',scale:1,outline:1,life:.32,rise:25,emblem:false},
  terminal:{label:'终末爆发',scale:2,outline:2,life:.48,rise:21,emblem:false},
};

function px(buf,w,x,y,color,alpha) {
  x=Math.round(x);y=Math.round(y);const h=buf.length/4/w;
  if(x<0||y<0||x>=w||y>=h||alpha<=0)return;
  const at=(y*w+x)*4,a=Math.min(1,alpha),old=buf[at+3]/255,out=a+old*(1-a);
  for(let k=0;k<3;k++)buf[at+k]=Math.round((color[k]*a+buf[at+k]*old*(1-a))/out);
  buf[at+3]=Math.round(out*255);
}
function points(text,scale,split=0) {
  const result=[];
  [...text].forEach((ch,i)=>(DOMAIN_GLYPHS[ch]??[]).forEach((row,y)=>[...row].forEach((v,x)=>{
    if(v==='1')for(let yy=0;yy<scale;yy++)for(let xx=0;xx<scale;xx++)
      result.push([i*6*scale+x*scale+xx+(y<3?split:y>3?-split:0),y*scale+yy]);
  })));
  return result;
}
function ink(buf,w,mask,x,y,color,alpha,radius=0) {
  const drawn=new Set();
  for(const [mx,my] of mask)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++) {
    if(dx*dx+dy*dy>radius*radius+radius)continue;
    const ax=mx+dx,ay=my+dy,key=ay*4096+ax;
    if(drawn.has(key))continue;
    drawn.add(key);px(buf,w,x+ax,y+ay,color,alpha);
  }
}
const textWidth=(s,scale)=>Math.max(0,(s.length*6-1)*scale);

export function paintDomainNumber(buf,w,{value,trueValue=0,kind='collapse',age=0,x,y,staticPose=false}) {
  if(!Number.isFinite(value)||value<0||!Number.isFinite(trueValue)||trueValue<0||(value===0&&trueValue===0))return null;
  const style=NUMBER_STYLES[kind];if(!style)throw new Error(`Unknown number style: ${kind}`);
  if(age<0||(!staticPose&&age>=style.life))return null;
  const main=value>0?String(Math.max(1,Math.round(value))):'',suffix=trueValue>0?`+${Math.max(1,Math.round(trueValue))}`:'';
  const baseScale=style.scale,pop=!staticPose&&age<.065&&kind!=='slash'?1:0,scale=baseScale+pop;
  const split=!staticPose&&age<.055?1:0;
  const alpha=staticPose?1:Math.min(1,Math.max(0,(style.life-age)/.18));
  const rise=staticPose?0:Math.max(0,age-.14)*style.rise;
  const mainWidth=textWidth(main,scale),trueWidth=textWidth(suffix,1),gap=suffix&&main?style.outline+4:0;
  const width=mainWidth+gap+trueWidth,left=Math.round(x-width/2),top=Math.round(y-rise-7*scale);
  const mask=points(main,scale,split);
  ink(buf,w,mask,left+1,top+2,NUMBER_COLORS.shadow,alpha,style.outline);
  ink(buf,w,mask,left,top,NUMBER_COLORS.ink,alpha,style.outline);
  ink(buf,w,mask,left,top,NUMBER_COLORS.violet,alpha,Math.max(0,style.outline-1));
  ink(buf,w,mask,left,top,kind==='slash'?NUMBER_COLORS.purple:NUMBER_COLORS.core,alpha,0);
  if(style.emblem&&main) {
    const ex=left-style.outline-6,ey=top+Math.floor(7*scale/2),r=kind==='critical'?4:3;
    for(let i=-r;i<=r;i++)for(const sign of [-1,1])
      px(buf,w,ex+i,ey+sign*(r-Math.abs(i)),NUMBER_COLORS.violet,alpha);
    px(buf,w,ex,ey,NUMBER_COLORS.cyan,alpha);
    for(let i=0;i<mainWidth;i++)if(i%5<3)px(buf,w,left+i,top+7*scale+3,NUMBER_COLORS.purple,.65*alpha);
  }
  if(kind==='critical'&&main) {
    for(let i=0;i<5;i++){
      px(buf,w,left-4-i,top-2-i,NUMBER_COLORS.cyan,alpha);
      px(buf,w,left+mainWidth+3+i,top+7*scale+i,NUMBER_COLORS.violet,alpha);
    }
  }
  if(suffix) {
    const maskTrue=points(suffix,1),tx=left+mainWidth+gap,ty=top+7*scale-8;
    ink(buf,w,maskTrue,tx+1,ty+1,NUMBER_COLORS.shadow,alpha,1);
    ink(buf,w,maskTrue,tx,ty,NUMBER_COLORS.trueOutline,alpha,1);
    ink(buf,w,maskTrue,tx,ty,NUMBER_COLORS.trueCore,alpha,0);
  }
  return {main,suffix,x:left,y:top,width,height:7*scale,alpha};
}
