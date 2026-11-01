/** Approved B warden: shared-scale, foot-anchored 64-frame body + separate seal prop. */
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {decodePng,encodePng} from './lib/png.mjs';
import {bounds,normalize,crop,paletteKeys} from '../assets/characters/domain/pixels.mjs';
const root=new URL('../',import.meta.url),art=new URL('assets/characters/domain/',root),out=new URL('public/assets/characters/',root);
mkdirSync(out,{recursive:true});
const actions=['idle','run','deploy','run-deploy','collapse','run-collapse','dash','hurt'];
const directions=['right','left'],size=64,anchor=[32,59];
const candidate=process.argv.includes('--candidate');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function bands(source,horizontal,within,expected){
  const span=horizontal?source.width:source.height,across=horizontal?source.height:source.width,runs=[];
  let start=-1;
  for(let at=0;at<=span;at++){
    let count=0;
    if(at<span)for(let other=0;other<across;other++){
      if(within&&(other<within.start||other>within.end))continue;
      const x=horizontal?at:other,y=horizontal?other:at;
      if(source.rgba[(y*source.width+x)*4+3]>=128)count++;
    }
    if(count>=3){if(start<0)start=at;}else if(start>=0){runs.push({start,end:at-1});start=-1;}
  }
  if(runs.length<expected)throw new Error(`Too few separated content bands: ${runs.length}/${expected}`);
  const gaps=runs.slice(1).map((r,i)=>({after:i,size:r.start-runs[i].end-1}));
  const cuts=new Set(gaps.sort((a,b)=>b.size-a.size).slice(0,expected-1).map(g=>g.after)),merged=[];
  for(let i=0;i<runs.length;i++)if(i===0||cuts.has(i-1))merged.push({...runs[i]});else merged.at(-1).end=runs[i].end;
  return merged;
}
const sheets=[];
for(const direction of directions)for(const group of ['base','skills']){
  const file=`warden-${direction}-${group}-source.png`,bytes=readFileSync(new URL(file,art)),image=decodePng(bytes);
  const rows=bands(image,false,null,4),cells=[];
  rows.forEach((row,r)=>bands(image,true,row,4).forEach((column,c)=>{
    const region={x:Math.max(0,column.start-2),y:Math.max(0,row.start-2),
      w:Math.min(image.width,column.end+3)-Math.max(0,column.start-2),
      h:Math.min(image.height,row.end+3)-Math.max(0,row.start-2)};
    const cell=crop(image,region.x,region.y,region.w,region.h),box=bounds(cell);
    if(box.count<200)throw new Error(`Empty/suspicious source pose: ${file}/${r}/${c}`);
    cells.push({cell,box,region,row:r,column:c});
  }));
  sheets.push({file,direction,group,image,sourceHash:hash(bytes),cells});
}
const reference=sheets[0],scale=24/reference.cells[0].box.h,referenceCell=reference.image.width/4;
const atlas=Buffer.alloc(256*1024*4),frames=[];
for(const sheet of sheets)for(const pose of sheet.cells){
  const sourceScale=scale*referenceCell/(sheet.image.width/4),box=pose.box;
  const bandStart=Math.floor(box.y+box.h*.75);let fx0=Infinity,fx1=-Infinity;
  for(let y=bandStart;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++)if(pose.cell.rgba[(y*pose.cell.width+x)*4+3]>=128){fx0=Math.min(fx0,x);fx1=Math.max(fx1,x);}
  if(!Number.isFinite(fx0))throw new Error('Missing foot band');
  const foot={x:(fx0+fx1+1)/2,y:box.y+box.h};
  const image=normalize(pose.cell,sourceScale,32,59,64,{x:foot.x,w:0,y:0,h:foot.y});
  const actionRow=pose.row+(sheet.group==='skills'?4:0),row=actionRow+(sheet.direction==='left'?8:0);
  const index=row*4+pose.column,visible=bounds(image);
  if(visible.count<70||visible.h<14||visible.h>32||visible.x<=0||visible.x+visible.w>=64||visible.y<=0||visible.y+visible.h!==59)
    throw new Error(`Bad normalized pose ${index}: ${JSON.stringify(visible)}`);
  for(let y=0;y<size;y++)image.rgba.copy(atlas,((row*size+y)*256+pose.column*size)*4,y*size*4,(y+1)*size*4);
  frames.push({index,direction:sheet.direction,action:actions[actionRow],phase:pose.column,
    bounds:visible,source:sheet.file,region:pose.region,sourceScale,foot,sha256:hash(image.rgba)});
}
frames.sort((a,b)=>a.index-b.index);
if(frames.length!==64||new Set(frames.map(f=>f.index)).size!==64)throw new Error('Expected exactly 64 frame slots');
// Replace locomotion only. The rest of the approved sheet is rebuilt unchanged.
function headCenter(image,box=bounds(image)){
  let sum=0,count=0;
  for(let y=box.y;y<box.y+box.h*.32;y++)for(let x=box.x;x<box.x+box.w;x++)
    if(image.rgba[(y*image.width+x)*4+3]>=128){sum+=x+.5;count++;}
  if(!count)throw new Error('Missing head anchor');
  return sum/count;
}
const motionSources=directions.map(direction=>{
  const file=`warden-${direction}-run-v2-source.png`,bytes=readFileSync(new URL(file,art)),image=decodePng(bytes);
  const cells=[];
  bands(image,false,null,4).forEach((row,r)=>bands(image,true,row,4).forEach((column,c)=>{
    const region={x:Math.max(0,column.start-2),y:Math.max(0,row.start-2),
      w:Math.min(image.width,column.end+3)-Math.max(0,column.start-2),h:Math.min(image.height,row.end+3)-Math.max(0,row.start-2)};
    const cell=crop(image,region.x,region.y,region.w,region.h);cells.push({row:r,column:c,region,cell,box:bounds(cell)});
  }));
  return {file,direction,image,cells,sourceHash:hash(bytes)};
});
const motionScale=24/motionSources[0].cells[0].box.h,motionWidth=motionSources[0].image.width;
const replaced=[];
for(const sheet of motionSources){
  const idle=crop({width:256,height:1024,rgba:atlas},0,(sheet.direction==='left'?8:0)*64,64,64);
  const targetHeadX=headCenter(idle),sourceScale=motionScale*motionWidth/sheet.image.width;
  for(const pose of sheet.cells.filter(p=>p.row>0)){
    const actionRow=[1,3,5][pose.row-1],row=actionRow+(sheet.direction==='left'?8:0),index=row*4+pose.column;
    const sourceHeadX=headCenter(pose.cell,pose.box),footY=pose.box.y+pose.box.h;
    const image=normalize(pose.cell,sourceScale,targetHeadX,59,64,{x:sourceHeadX,w:0,y:0,h:footY}),visible=bounds(image);
    if(visible.count<70||visible.h<18||visible.h>30||visible.x<=0||visible.x+visible.w>=64||visible.y+visible.h!==59)
      throw new Error(`Bad v2 locomotion ${index}: ${JSON.stringify(visible)}`);
    const previousHash=frames[index].sha256;
    for(let y=0;y<64;y++)image.rgba.copy(atlas,((row*64+y)*256+pose.column*64)*4,y*64*4,(y+1)*64*4);
    frames[index]={index,direction:sheet.direction,action:actions[actionRow],phase:pose.column,bounds:visible,
      source:sheet.file,region:pose.region,sourceScale,headAnchor:{sourceX:sourceHeadX,targetX:targetHeadX},
      foot:{y:footY},sha256:hash(image.rgba),previousHash};replaced.push(index);
  }
}
if(replaced.length!==24)throw new Error('Expected exactly 24 locomotion replacements');
const bodyBytes=encodePng(256,1024,atlas);
const bodyImage=candidate?'assets/characters/domain/warden-body-sheet-v2-candidate.png':'public/assets/characters/domain-warden-64x64.png';
writeFileSync(new URL(bodyImage,root),bodyBytes);
if(!candidate)writeFileSync(new URL('warden-body-sheet.png',art),bodyBytes);
const seed=crop({width:256,height:1024,rgba:atlas},0,0,64,64);
if(!candidate)writeFileSync(new URL('warden-production-seed-64.png',art),encodePng(64,64,seed.rgba));
const propBytes=readFileSync(new URL('warden-seal-prop-source.png',art)),propSource=decodePng(propBytes),propBox=bounds(propSource,192);
const square=normalize(propSource,6/propBox.h,5,8,10,propBox),prop=crop(square,1,0,8,10),propPNG=encodePng(8,10,prop.rgba);
writeFileSync(new URL('domain-seal-8x10.png',out),propPNG);writeFileSync(new URL('warden-seal-8x10.png',art),propPNG);
const contact=Buffer.alloc(320*320*4);
for(let i=0;i<320*320;i++)contact.set([20,23,37,255],i*4);
for(const frame of frames){
  const row=Math.floor(frame.index/4),column=frame.index%4,body=crop({width:256,height:1024,rgba:atlas},column*64,row*64,64,64);
  const tile=crop(body,12,24,40,40),cx=(column+(frame.direction==='left'?4:0))*40,cy=(row%8)*40;
  for(let y=0;y<40;y++)for(let x=0;x<40;x++){
    const at=(y*40+x)*4;if(tile.rgba[at+3])tile.rgba.copy(contact,((cy+y)*320+cx+x)*4,at,at+4);
  }
}
const big=Buffer.alloc(1280*1280*4);
for(let y=0;y<1280;y++)for(let x=0;x<1280;x++){
  const at=(Math.floor(y/4)*320+Math.floor(x/4))*4;contact.copy(big,(y*1280+x)*4,at,at+4);
}
writeFileSync(new URL(candidate?'warden-contact-v2-candidate-4x.png':'warden-contact-4x.png',art),encodePng(1280,1280,big));
const record={status:'B character body/prop assets completed; runtime wired; natural gameplay acceptance pending',selected:'b-boundary-warden',
  selectionDate:'2026-11-01',selectionResponse:'B · 结界执律者（半面具、三枚封印牌）',
  canvas:[64,64],columns:4,rows:16,anchor,footOffsetY:5,directions,actions,frameCount:64,
  paletteKeys,alpha:'0/255',bodyImage,bodyHash:hash(bodyBytes),
  locomotion:{revision:2,replaced,unchangedFrames:40,frameDistance:8,sharedScale:motionScale,
    anchor:'Stable upper-body X, bottom Y=59; no per-frame scaling',
    sources:motionSources.map(s=>({file:s.file,size:[s.image.width,s.image.height],sha256:s.sourceHash}))},
  sourceReferenceScale:scale,sources:sheets.map(s=>({file:s.file,size:[s.image.width,s.image.height],sha256:s.sourceHash})),
  prop:{image:'public/assets/characters/domain-seal-8x10.png',size:[8,10],anchor:[4,5],count:3,
    source:'warden-seal-prop-source.png',sourceHash:hash(propBytes),sha256:hash(propPNG),bounds:bounds(prop)},
  generator:'built-in image_gen',model:null,randomSeed:null,
  note:'Whole 16-frame source sheets, one common reference scale across sheets, foot-band X and bottom Y translations only; no runtime image mirroring or combat changes.',frames};
writeFileSync(new URL(candidate?'asset-record-v2-candidate.json':'asset-record.json',art),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({frames:64,body:[256,1024],scale,heights:[Math.min(...frames.map(f=>f.bounds.h)),Math.max(...frames.map(f=>f.bounds.h))],prop:record.prop.bounds}));
