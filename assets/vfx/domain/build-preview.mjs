/** Offline art-direction prototype. No runtime integration or gameplay simulation. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { decodePng, encodePng } from '../../../scripts/lib/png.mjs';
import { loadPalette, hexToRgb } from '../../../scripts/lib/palette.mjs';
import { paintDomainNumber } from './domain-numbers.mjs';

const here = new URL('./', import.meta.url);
const feedback=process.argv.includes('--feedback');
const palette = Object.fromEntries(loadPalette().map(p => [p.key, p.hex]));
const keys = ['ink0','ink1','steelDark','psiPurple','psiViolet','iceCyan','bone','steelLight'];
const rgb = keys.map(k => hexToRgb(palette[k]));
const C = Object.fromEntries(Object.entries(palette).map(([k,v]) => [k,hexToRgb(v)]));
const W=480, H=270, FPS=30, DURATION=6.2, COUNT=Math.round(FPS*DURATION), COLS=12;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (path, bytes) => writeFileSync(new URL(path, here), bytes);
const json = (path, value) => save(path, JSON.stringify(value,null,2)+'\n');
const clamp = (n,a=0,b=1) => Math.max(a,Math.min(b,n));
const ease = u => 1-Math.pow(1-clamp(u),3);
mkdirSync(new URL('prototype/',here),{recursive:true});

function bounds(image) {
  let minX=image.width,minY=image.height,maxX=-1,maxY=-1,transparent=0,semi=0,opaque=0;
  for(let y=0;y<image.height;y++) for(let x=0;x<image.width;x++) {
    const a=image.rgba[(y*image.width+x)*4+3];
    if(!a) transparent++; else {
      if(a===255) opaque++; else semi++;
      minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y);
    }
  }
  return {visible:{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1},transparent,semi,opaque};
}

const sources = [];
const images = {};
for(const key of ['field','blackhole','impact']) {
  const path=`${key}-seed-v1.png`, bytes=readFileSync(new URL(path,here));
  const source=decodePng(bytes), sourceStats=bounds(source);
  if(!sourceStats.transparent || sourceStats.visible.w<1) throw new Error(`Invalid transparency/content: ${key}`);
  const image={width:128,height:128,rgba:Buffer.alloc(128*128*4)};
  // Same full-canvas transform and center for all seeds; no per-image bound fitting.
  for(let y=0;y<128;y++) for(let x=0;x<128;x++) {
    const sx=Math.min(source.width-1,Math.floor((x+0.5)*source.width/128));
    const sy=Math.min(source.height-1,Math.floor((y+0.5)*source.height/128));
    const at=(sy*source.width+sx)*4;
    if(source.rgba[at+3]<192) continue;
    let best=0, distance=Infinity;
    for(let k=0;k<rgb.length;k++) {
      const d=rgb[k].reduce((n,c,i)=>n+(c-source.rgba[at+i])**2,0);
      if(d<distance) {distance=d;best=k;}
    }
    image.rgba.set([...rgb[best],255],(y*128+x)*4);
  }
  const outBytes=encodePng(128,128,image.rgba), outPath=`prototype/${key}-128.png`;
  save(outPath,outBytes); images[key]=image;
  const processed=bounds(image);
  if(processed.semi || !processed.opaque || !processed.transparent) throw new Error(`Invalid normalized alpha: ${key}`);
  const center=[...image.rgba.subarray((64*128+64)*4,(64*128+64)*4+4)];
  if(key==='field' && center[3]!==0) throw new Error('Field center must remain transparent');
  if(key!=='field' && center[3]!==255) throw new Error('Black-hole core must remain opaque');
  if(processed.visible.x<=0||processed.visible.y<=0||processed.visible.x+processed.visible.w>=128||processed.visible.y+processed.visible.h>=128)
    throw new Error(`Prototype lacks padding: ${key}`);
  sources.push({key,source:path,sourceSize:[source.width,source.height],sourceSha256:hash(bytes),
    sourceAlpha:sourceStats,prototype:outPath,prototypeSha256:hash(outBytes),prototypeStats:processed,centerRgba:center,
    anchor:[64,64],referenceRadius:key==='field'?50:55,
    intent:key==='impact'?'edit':'generate',references:key==='impact'?['blackhole-seed-v1.png']:[],
    prompt:`${key==='blackhole'?'blackhole':key}-seed-v1-prompt.txt`});
}

function pixel(buf,w,x,y,color,alpha=1) {
  x=Math.round(x);y=Math.round(y); const h=buf.length/4/w;
  if(x<0||y<0||x>=w||y>=h||alpha<=0) return;
  const at=(y*w+x)*4, a=clamp(alpha);
  for(let i=0;i<3;i++) buf[at+i]=Math.round(buf[at+i]*(1-a)+color[i]*a);
  buf[at+3]=255;
}
function line(buf,w,x1,y1,x2,y2,color,alpha=1,size=1) {
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(x2-x1),Math.abs(y2-y1))));
  for(let i=0;i<=steps;i++) for(let q=0;q<size;q++)
    pixel(buf,w,x1+(x2-x1)*i/steps,y1+(y2-y1)*i/steps+q,color,alpha);
}
function ring(buf,w,cx,cy,r,color,alpha=1,phase=0,dash=0) {
  for(let i=0;i<Math.ceil(r*7);i++) {
    const a=i/(r*7)*Math.PI*2;
    if(dash && Math.floor((a+phase)*9)%3===0) continue;
    pixel(buf,w,cx+Math.cos(a)*r,cy+Math.sin(a)*r,color,alpha);
  }
}
function arc(buf,w,cx,cy,r,start,length,color,alpha=1) {
  const steps=Math.ceil(r*length*2);
  for(let i=0;i<=steps;i++) {
    const a=start+i/steps*length;
    pixel(buf,w,cx+Math.cos(a)*r,cy+Math.sin(a)*r,color,alpha);
  }
}
function drawImage(buf,w,image,cx,cy,scale=1,angle=0,alpha=1) {
  if(scale<=0.015||alpha<=0) return;
  const c=Math.cos(angle),s=Math.sin(angle),half=Math.ceil(92*scale);
  for(let y=Math.floor(cy-half);y<=cy+half;y++) for(let x=Math.floor(cx-half);x<=cx+half;x++) {
    const dx=x-cx,dy=y-cy;
    const sx=Math.round((dx*c+dy*s)/scale+64),sy=Math.round((-dx*s+dy*c)/scale+64);
    if(sx<0||sy<0||sx>=128||sy>=128) continue;
    const at=(sy*128+sx)*4;
    if(image.rgba[at+3]) pixel(buf,w,x,y,image.rgba.subarray(at,at+3),alpha);
  }
}
const digits={
  '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],
  '2':['111','001','111','100','111'],'3':['111','001','111','001','111'],
  '4':['101','101','111','001','001'],'5':['111','100','111','001','111'],
  '6':['111','100','111','101','111'],'7':['111','001','010','010','010'],
  '8':['111','101','111','101','111'],'9':['111','101','111','001','111'],
  '+':['000','010','111','010','000'],
};
function text(buf,w,value,x,y,color,scale=2,alpha=1) {
  [...value].forEach((ch,i)=>(digits[ch]??[]).forEach((row,yy)=>[...row].forEach((v,xx)=>{
    if(v==='1') for(let a=0;a<scale;a++) for(let b=0;b<scale;b++)
      pixel(buf,w,x+(i*4+xx)*scale+a,y+yy*scale+b,color,alpha);
  })));
}
const player=['  hhhh  ',' hhhhhh ',' heffeh ',' hhhhhh ','  aaaa  ',' aaaaaa ',' aaaaaa ','   aa   ','  a  a  ','  b  b  '];
const slime=['  ssss  ',' ssssss ',' skssks ','ssssssss','ssssssss','.ssssss.'];
const unitColors={h:C.pGold,e:C.ink1,f:hexToRgb(palette.sand),a:C.pBlue,b:C.pBrown,s:C.slimeMid,k:C.slimeDark};
function unit(buf,pattern,x,y,alpha=1) {
  pattern.forEach((row,yy)=>[...row].forEach((ch,xx)=>{if(unitColors[ch])pixel(buf,W,x-4+xx,y-5+yy,unitColors[ch],alpha);}));
}
const CENTER=[270,135], FIELD_POS=[[242,119],[298,119],[270,167]], LAND=[.25,1.15,2.05];
const START=[[221,101],[263,94],[318,112],[237,168],[300,172],[277,141]];
function stage(t) {
  if(t<.25)return 'deploy'; if(t<2.05)return 'hunt'; if(t<2.4)return 'collapse';
  if(t<2.64)return 'impact'; if(t<4.6)return 'blackhole'; if(t<4.82)return 'terminal';
  if(t<5.8)return 'remnant'; return 'clear';
}
const base=Buffer.alloc(W*H*4);
for(let y=0;y<H;y++) for(let x=0;x<W;x++) {
  const grid=x%16===0||y%16===0, tile=(Math.floor(x/16)+Math.floor(y/16))%2;
  base.set(grid?[34,38,58,255]:tile?[20,23,37,255]:[17,20,33,255],(y*W+x)*4);
}

function render(t) {
  const buf=Buffer.from(base),u=clamp((t-2.05)/.35),collapse=u*u*(3-2*u),bhAge=t-2.4;
  const enemy=START.map(([x,y],i)=>{
    const pre=[x-5*Math.min(t,2.05),y+Math.sin(i)*2*Math.min(t,2.05)];
    return t<2.05?pre:[pre[0]+(CENTER[0]+Math.cos(i*1.8)*13-pre[0])*collapse,
      pre[1]+(CENTER[1]+Math.sin(i*1.8)*11-pre[1])*collapse];
  });
  const current=FIELD_POS.map(([x,y])=>[x+(CENTER[0]-x)*collapse,y+(CENTER[1]-y)*collapse]);
  if(t>=LAND[1]&&t<2.4) {
    const n=t>=LAND[2]?3:2;
    for(let i=0;i<n-1;i++) line(buf,W,...current[i],...current[i+1],C.psiViolet,.7,1);
    if(n===3)line(buf,W,...current[2],...current[0],C.iceCyan,.8,1);
  }
  for(let i=0;i<3;i++) {
    const a=t-(LAND[i]-.25);
    if(a<0||t>=2.4)continue;
    const birth=ease(a/.25),shrink=t>=2.05?1-.94*collapse:1;
    drawImage(buf,W,images.field,...current[i],birth*shrink,.04*Math.sin(t*1.6+i),
      (t<2.05?.90:1)*(1-.25*collapse));
    if(t<2.05) {
      ring(buf,W,...current[i],50,C.psiViolet,.65);
      arc(buf,W,...current[i],49,-t*.5+i*2,.6,C.iceCyan,.75);
    }
  }
  // Every particle is a fixed indexed trajectory; there is no gameplay RNG.
  if(t>.25&&t<4.6) for(let i=0;i<28;i++) {
    if(t<2.05&&t<LAND[i%3])continue;
    const phase=(t*.8+i*.137)%1,a=i*2.399+t*.3;
    const origin=t<2.05?FIELD_POS[i%3]:CENTER;
    const r=(1-phase)*(t<2.05?45:60);
    line(buf,W,origin[0]+Math.cos(a)*r,origin[1]+Math.sin(a)*r,
      origin[0]+Math.cos(a)*(r-3),origin[1]+Math.sin(a)*(r-3),i%5?C.psiViolet:C.iceCyan,.65);
  }
  if(t>=2.4&&t<4.6) {
    drawImage(buf,W,images.blackhole,...CENTER,.9+.1*ease(bhAge/.12),bhAge*1.5,.95);
    ring(buf,W,...CENTER,55,C.psiViolet,.32,bhAge,1);
    arc(buf,W,...CENTER,25,bhAge*2,1.1,C.bone,.65);
    arc(buf,W,...CENTER,44,-bhAge*1.2,1.8,C.psiViolet,.7);
  }
  if(t>=4.6&&t<5.8) {
    const fade=1-(t-4.6)/1.2;
    drawImage(buf,W,images.field,...CENTER,.8,(t-4.6)*-.2,.32*fade);
  }
  if(t>=4.6&&t<4.82) {
    const v=(t-4.6)/.22;
    ring(buf,W,...CENTER,20+45*ease(v),C.iceCyan,(1-v)*.7);
  }
  // Existing player/slime pixel maps are used as size and layering references only.
  unit(buf,player,155,145);
  enemy.forEach(([x,y],i)=>{
    const alpha=t<4.65?1:clamp(1-(t-4.65)*6);
    const inField=t<2.05&&FIELD_POS.some(([fx,fy],q)=>t>=LAND[q]&&Math.hypot(x-fx,y-fy)<=50);
    const inHole=t>=2.4&&t<4.6&&Math.hypot(x-CENTER[0],y-CENTER[1])<=55;
    unit(buf,slime,x,y,alpha);
    // Binding anchors: movement restraint is represented without opaque chains.
    if(t>=2.05&&t<2.9) for(let q=0;q<4;q++) {
      const a=q*Math.PI/2+Math.PI/4,px=x+Math.cos(a)*9,py=y+Math.sin(a)*8;
      line(buf,W,px,py,px+Math.cos(a)*4,py+Math.sin(a)*4,C.psiViolet,.8,2);
      pixel(buf,W,px,py,C.iceCyan,.9);
    }
    // Inert preview-only timing, not live stun or hit events.
    if((inField&&(t-.25)%1.2<.14)||(inHole&&bhAge%.6<.14)) {
      for(let q=0;q<4;q++) {
        const a=q*Math.PI/2+t*.3;
        pixel(buf,W,x+Math.cos(a)*11,y+Math.sin(a)*8,C.iceCyan,.6);
      }
    }
    const slashAge=t<2.05?(t-.25)%.9:bhAge%.3;
    if(((t>1.15&&inField)||(t>2.7&&inHole))&&slashAge>=0&&slashAge<.09) {
      const a=i%2?.45:-.55,dx=Math.cos(a)*10,dy=Math.sin(a)*10;
      line(buf,W,x-dx,y-dy,x+dx,y+dy,C.psiPurple,.9,3);
      line(buf,W,x-dx,y-dy,x+dx,y+dy,C.bone,.95,1);
    }
  });
  if(bhAge>=0&&bhAge<.24) {
    const v=bhAge/.24;
    drawImage(buf,W,images.impact,...CENTER,1.02+.35*ease(v),-.15+v*.2,1-v*.85);
    ring(buf,W,...CENTER,55+20*ease(v),C.iceCyan,(1-v)*.7);
  }
  if(bhAge>=.02&&bhAge<.6) {
    const a=1-clamp((bhAge-.30)/.30),y=105-bhAge*12;
    if(feedback)paintDomainNumber(buf,W,{value:90,trueValue:12,kind:'collapse',age:bhAge,x:274,y:108});
    else {
      text(buf,W,'90',260,y+1,C.ink0,3,a); text(buf,W,'90',259,y,C.bone,3,a);
      text(buf,W,'+12',288,y+3,C.iceCyan,2,a);
    }
  }
  if(feedback&&t>=4.6&&t<5.08)
    paintDomainNumber(buf,W,{value:24,kind:'terminal',age:t-4.6,x:270,y:112});
  return buf;
}

const rows=Math.ceil(COUNT/COLS),atlasW=W*COLS,atlasH=H*rows;
const atlas=Buffer.alloc(atlasW*atlasH*4), frames=[];
for(let i=0;i<COUNT;i++) {
  const t=i/FPS, pixels=render(t),x=(i%COLS)*W,y=Math.floor(i/COLS)*H;
  for(let row=0;row<H;row++) pixels.copy(atlas,((y+row)*atlasW+x)*4,row*W*4,(row+1)*W*4);
  frames.push({index:i,time:t,x,y,w:W,h:H,stage:stage(t)});
}
const atlasPath=feedback?'prototype/timeline-feedback-atlas.png':'prototype/timeline-atlas.png';
const atlasBytes=encodePng(atlasW,atlasH,atlas); save(atlasPath,atlasBytes);
const contact=Buffer.alloc(480*160*4);
for(let i=0;i<480*160;i++)contact.set([20,23,37,255],i*4);
['field','blackhole','impact'].forEach((key,i)=>drawImage(contact,480,images[key],80+i*160,80,1,0,1));
save('prototype/contact-sheet.png',encodePng(480,160,contact));
const keyTimes=[.4,1.5,2.2,2.4333333333,3.3,4.95],story=Buffer.alloc(W*3*H*2*4);
keyTimes.forEach((t,i)=>{
  const pixels=render(t),x=(i%3)*W,y=Math.floor(i/3)*H;
  for(let row=0;row<H;row++) pixels.copy(story,((y+row)*W*3+x)*4,row*W*4,(row+1)*W*4);
  text(story,W*3,String(i+1),x+8,y+8,C.bone,2,1);
});
const storyboardPath=feedback?'prototype/storyboard-feedback.png':'prototype/storyboard.png';
save(storyboardPath,encodePng(W*3,H*2,story));
const clips=[
  ['field-deploy',6,.25,false,128],['field-loop',8,.64,true,128],
  ['triangle-close',4,.12,false,32],['collapse',8,.35,false,128],
  ['blackhole-birth',8,.24,false,160],['blackhole-loop',8,.64,true,128],
  ['terminal',6,.22,false,160],['remnant',6,.60,true,128],
  ['stun-lattice',6,.30,false,48],['slash',6,.18,false,48],
  ['binding-anchors',6,.35,false,48],['ward',6,.60,true,48],
  ['siphon-trail',6,.24,false,32],['dash-vortex',6,.60,false,64],
].map(([key,plannedFrames,duration,loop,frameSize])=>({key,plannedFrames,duration,loop,frameSize,
  status:'planned; not a generated or approved animation strip'}));
const record={status:feedback?'approved base VFX; new numbers/audio draft; not runtime integrated':'visual direction and seeds user-approved; animation strips pending; not runtime integrated',
  approval:{date:'2026-11-01',scope:'visual direction, three keyframe seeds and offline motion draft',userResponse:'可以，我非常满意'},
  generator:'built-in image_gen',model:null,randomSeed:null,sources,
  normalization:{target:[128,128],anchor:[64,64],method:'fixed full canvas nearest-neighbor',
    alphaThreshold:192,paletteKeys:keys,paletteSource:'src/game/data/palette.ts'},
  preview:{width:W,height:H,fps:FPS,duration:DURATION,frameCount:COUNT,atlas:[atlasW,atlasH],atlasFile:atlasPath,
    timeline:{deploy:[0,.25],fieldLand:[.25,1.15,2.05],collapse:[2.05,2.4],
      impact:[2.4,2.64],blackhole:[2.4,4.6],terminal:[4.6,4.82],remnant:[4.6,5.8]},
    note:'One composed spectacle cycle with L3 motifs, terminal and remnant examples. Not combat, CC, TTK or actual animation-strip playback. Damage labels are style examples.'},
  storyboard:{file:storyboardPath,times:keyTimes},plannedClips:clips,frames};
if(feedback)record.feedback={numbers:'numbers/numbers.metadata.json',audio:'../../audio/domain/audio-manifest.json',status:'not yet user-approved'};
json(feedback?'feedback-record.json':'source-record.json',record);
const template=readFileSync(new URL(feedback?'feedback-template.html':'preview-template.html',here),'utf8');
const packed={...record.preview,frames,atlas:'data:image/png;base64,'+atlasBytes.toString('base64'),
  seeds:sources.map(s=>({key:s.key,image:'data:image/png;base64,'+readFileSync(new URL(s.prototype,here)).toString('base64')}))};
if(feedback){
  const audioRoot=new URL('../../audio/domain/',here),audio=JSON.parse(readFileSync(new URL('audio-manifest.json',audioRoot),'utf8'));
  const wav=path=>'data:audio/wav;base64,'+readFileSync(new URL(path,audioRoot)).toString('base64');
  packed.audio={demo:wav(audio.demo.file),clips:audio.clips.map(c=>({id:c.id,label:c.label,group:c.group,duration:c.duration,loop:c.loop,src:wav(c.file)}))};
  packed.numbers={sheet:'data:image/png;base64,'+readFileSync(new URL('numbers/number-style-sheet.png',here)).toString('base64')};
}
save(feedback?'preview-feedback.html':'preview.html',template.replace('/*__DOMAIN_PREVIEW_DATA__*/',JSON.stringify(packed)));
console.log(JSON.stringify({sources:sources.map(s=>({key:s.key,size:s.sourceSize,alpha:s.sourceAlpha,
  prototype:s.prototypeStats})),preview:record.preview,plannedClips:clips.length},null,2));
