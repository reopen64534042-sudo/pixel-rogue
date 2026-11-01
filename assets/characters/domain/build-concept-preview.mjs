/** Character concept/scale comparison only; not production animation frames. */
import { createHash } from 'node:crypto';
import { readFileSync,writeFileSync } from 'node:fs';
import { decodePng,encodePng } from '../../../scripts/lib/png.mjs';
import { loadPalette,hexToRgb } from '../../../scripts/lib/palette.mjs';

const here=new URL('./',import.meta.url),concepts=new URL('concepts/',here);
const palette=Object.fromEntries(loadPalette().map(p=>[p.key,p.hex]));
const paletteKeys=['ink0','ink1','steelDark','steelMid','bone','sand','pBrown','pBlueDk','pBlue','psiPurple','psiViolet','iceCyan'];
const colors=paletteKeys.map(k=>hexToRgb(palette[k]));
const specs=[['a-sealweaver','A','印契术师'],['b-boundary-warden','B','结界执律者'],['c-orbit-weaver','C','星环织域者']];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function bounds(image,threshold=1){
  let x0=image.width,y0=image.height,x1=-1,y1=-1,count=0,semi=0;
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
    const a=image.rgba[(y*image.width+x)*4+3];if(a>0&&a<255)semi++;
    if(a<threshold)continue;count++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
  }
  return {x:x0,y:y0,w:x1-x0+1,h:y1-y0+1,visiblePixels:count,semiPixels:semi};
}
const sources=specs.map(([key,label,name])=>{
  const bytes=readFileSync(new URL(`${key}-source.png`,concepts)),image=decodePng(bytes),visible=bounds(image,192);
  if(visible.w<1||visible.h<1||visible.visiblePixels===image.width*image.height)throw new Error(`Invalid character alpha: ${key}`);
  return {key,label,name,bytes,image,visible};
});
// All candidates share this scale; shape/pose differences are not normalized away.
const sharedScale=26/Math.max(...sources.map(s=>s.visible.h));
function sample(source,x0,y0,x1,y1){
  let alpha=0,red=0,green=0,blue=0;
  const area=(x1-x0)*(y1-y0);
  for(let y=Math.max(0,Math.floor(y0));y<Math.min(source.height,Math.ceil(y1));y++)
    for(let x=Math.max(0,Math.floor(x0));x<Math.min(source.width,Math.ceil(x1));x++){
      const weight=Math.max(0,Math.min(x1,x+1)-Math.max(x0,x))*Math.max(0,Math.min(y1,y+1)-Math.max(y0,y));
      const at=(y*source.width+x)*4,a=source.rgba[at+3]/255*weight;
      alpha+=a;red+=source.rgba[at]*a;green+=source.rgba[at+1]*a;blue+=source.rgba[at+2]*a;
    }
  return alpha>0?{alpha:alpha/area*255,rgb:[red/alpha,green/alpha,blue/alpha]}:null;
}
const processed=[];
for(const source of sources){
  const image={width:64,height:64,rgba:Buffer.alloc(64*64*4)},ox=32-source.image.width*sharedScale/2;
  const oy=59-(source.visible.y+source.visible.h)*sharedScale;
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const pixel=sample(source.image,(x-ox)/sharedScale,(y-oy)/sharedScale,(x+1-ox)/sharedScale,(y+1-oy)/sharedScale);
    if(!pixel||pixel.alpha<128)continue;
    let best=0,distance=Infinity;
    for(let i=0;i<colors.length;i++){
      const d=colors[i].reduce((n,c,j)=>n+(c-pixel.rgb[j])**2,0);
      if(d<distance){distance=d;best=i;}
    }
    image.rgba.set([...colors[best],255],(y*64+x)*4);
  }
  const before=bounds(image),dy=59-(before.y+before.h),shifted=Buffer.alloc(image.rgba.length);
  for(let y=0;y<64;y++)if(y+dy>=0&&y+dy<64)image.rgba.copy(shifted,(y+dy)*64*4,y*64*4,(y+1)*64*4);
  image.rgba=shifted;const visible=bounds(image);
  if(visible.visiblePixels<60||visible.semiPixels||visible.y+visible.h!==59||visible.x<=0||visible.x+visible.w>=64)
    throw new Error(`Invalid normalized concept: ${source.key}`);
  const bytes=encodePng(64,64,image.rgba);writeFileSync(new URL(`${source.key}-scale-check-64.png`,concepts),bytes);
  processed.push({...source,normalized:image,normalizedBounds:visible,normalizedHash:hash(bytes),footShift:dy});
}
function paint(buf,w,image,cx,top,width,height,opacity=1){
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const sx=Math.min(image.width-1,Math.floor(x*image.width/width)),sy=Math.min(image.height-1,Math.floor(y*image.height/height));
    const at=(sy*image.width+sx)*4,a=image.rgba[at+3]/255*opacity,xx=Math.round(cx-width/2+x),yy=top+y;
    if(!a||xx<0||xx>=w||yy<0||yy>=buf.length/4/w)continue;
    const to=(yy*w+xx)*4;for(let i=0;i<3;i++)buf[to+i]=Math.round(buf[to+i]*(1-a)+image.rgba[at+i]*a);buf[to+3]=255;
  }
}
function surface(w,h,grid=false){
  const buf=Buffer.alloc(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)buf.set(grid&&(x%16===0||y%16===0)?[34,38,58,255]:[20,23,37,255],(y*w+x)*4);
  return buf;
}
const letters={A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111']};
function label(buf,w,ch,x,y){letters[ch].forEach((row,yy)=>[...row].forEach((v,xx)=>{
  if(v==='1')for(let a=0;a<2;a++)for(let b=0;b<2;b++)buf.set([...hexToRgb(palette.bone),255],((y+yy*2+b)*w+x+xx*2+a)*4);
}));}
const contact=surface(720,440);
processed.forEach((item,i)=>{
  const cx=120+i*240;label(contact,720,item.label,i*240+12,12);
  paint(contact,720,item.image,cx,26,208,208);
  paint(contact,720,item.normalized,cx,242,192,192);
});
writeFileSync(new URL('character-concepts.png',here),encodePng(720,440,contact));
const stage=surface(480,270,true),field=decodePng(readFileSync(new URL('../../vfx/domain/prototype/field-128.png',here)));
processed.forEach((item,i)=>{
  const x=130+i*110;paint(stage,480,field,x,102,100,100,.25);label(stage,480,item.label,x-4,84);
  paint(stage,480,item.normalized,x,155-59,64,64);
});
writeFileSync(new URL('character-scale-1x.png',here),encodePng(480,270,stage));
const twice=surface(960,540);paint(twice,960,{width:480,height:270,rgba:stage},480,0,960,540);
writeFileSync(new URL('character-scale-2x.png',here),encodePng(960,540,twice));
const record={status:'B boundary warden selected; concepts retained; production frames described by asset-record.json',
  selection:{key:'b-boundary-warden',date:'2026-11-01',userResponse:'B · 结界执律者（半面具、三枚封印牌）'},
  generator:'built-in image_gen',model:null,randomSeed:null,
  sourceScale:sharedScale,sourceAlphaBoundsThreshold:192,outputAlphaThreshold:128,
  paletteSource:'src/game/data/palette.ts',paletteKeys,canvas:[64,64],anchor:[32,59],footOffsetY:5,
  note:'Premultiplied area sampling with one shared scale, per-candidate foot translation only. Concept comparison, not production frames.',
  candidates:processed.map(s=>({key:s.key,label:s.label,name:s.name,source:`concepts/${s.key}-source.png`,
    prompt:`concepts/${s.key}-prompt.txt`,sourceSize:[s.image.width,s.image.height],sourceHash:hash(s.bytes),
    sourceBounds:s.visible,scaleCheck:`concepts/${s.key}-scale-check-64.png`,outputBounds:s.normalizedBounds,
    outputHash:s.normalizedHash,footShift:s.footShift})),
  plannedAnimation:{directions:['right','left'],framesPerAction:4,
    actions:['idle','run','deploy','run-deploy','collapse','run-collapse','dash','hurt'],totalFrames:64,
    requirement:'select an approved game-scale seed before generating whole strips; actions follow real simulation and never change combat timing'}};
writeFileSync(new URL('generation.json',here),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({sharedScale,candidates:record.candidates.map(c=>({key:c.key,bounds:c.outputBounds})),plannedFrames:64},null,2));
