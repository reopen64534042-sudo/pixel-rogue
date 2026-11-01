import { mkdirSync,writeFileSync } from 'node:fs';
import { encodePng } from '../../../scripts/lib/png.mjs';
import { DOMAIN_GLYPHS,NUMBER_COLORS,NUMBER_STYLES,paintDomainNumber } from './domain-numbers.mjs';
const here=new URL('./numbers/',import.meta.url);mkdirSync(here,{recursive:true});
const save=(name,data)=>writeFileSync(new URL(name,here),data);
const glyphs=Object.keys(DOMAIN_GLYPHS),cw=8,ch=12,mask=Buffer.alloc(glyphs.length*cw*ch*4),frames={};
glyphs.forEach((glyph,i)=>{
  DOMAIN_GLYPHS[glyph].forEach((row,y)=>[...row].forEach((v,x)=>{
    if(v==='1')mask.set([255,255,255,255],((y+2)*glyphs.length*cw+i*cw+x+1)*4);
  }));
  frames[glyph]={x:i*cw,y:0,w:cw,h:ch,advance:6,baseline:9};
});
save('domain-glyph-mask.png',encodePng(glyphs.length*cw,ch,mask));
const samples=[{kind:'collapse',value:90,trueValue:12},{kind:'critical',value:120,trueValue:12},
  {kind:'slash',value:21},{kind:'terminal',value:24}];
const W=480,H=112,sheet=Buffer.alloc(W*H*4);
for(let i=0;i<W*H;i++)sheet.set([20,23,37,255],i*4);
samples.forEach((sample,i)=>paintDomainNumber(sheet,W,{...sample,x:60+i*120,y:65,age:.16,staticPose:true}));
save('number-style-sheet.png',encodePng(W,H,sheet));
const big=Buffer.alloc(W*2*H*2*4);
for(let y=0;y<H*2;y++)for(let x=0;x<W*2;x++){
  const at=(Math.floor(y/2)*W+Math.floor(x/2))*4;
  sheet.copy(big,(y*W*2+x)*4,at,at+4);
}
save('number-style-sheet-2x.png',encodePng(W*2,H*2,big));
const count=108,cols=12,fw=320,fh=90,atlas=Buffer.alloc(fw*cols*fh*Math.ceil(count/cols)*4),timings=[];
for(let i=0;i<count;i++){
  const t=i/30,buf=Buffer.alloc(fw*fh*4);
  for(let p=0;p<fw*fh;p++)buf.set([20,23,37,255],p*4);
  const sample=samples[Math.min(samples.length-1,Math.floor(t/.9))],age=t%.9;
  paintDomainNumber(buf,fw,{...sample,age,x:160,y:54});
  const x=(i%cols)*fw,y=Math.floor(i/cols)*fh;
  for(let row=0;row<fh;row++)buf.copy(atlas,((y+row)*fw*cols+x)*4,row*fw*4,(row+1)*fw*4);
  timings.push({index:i,x,y,w:fw,h:fh,kind:sample.kind,time:t});
}
save('number-motion-atlas.png',encodePng(fw*cols,fh*Math.ceil(count/cols),atlas));
const meta={status:'dedicated number art draft; not runtime integrated',name:'裂界数字',glyphSize:[5,7],
  cell:[cw,ch],glyphFrames:frames,colors:NUMBER_COLORS,styles:NUMBER_STYLES,
  rule:'group main damage with a smaller true suffix; no damage calculation, proc or crit modification',
  colorOwnership:'world palette from palette.ts; true damage colors read from CombatSystem.ts',
  samples,sampleFormula:'D=20, H=500, V=150, criticalMultiplier=1.5; no other modifiers; critical affects 2D only',
  motion:{fps:30,duration:3.6,frames:timings}};
save('numbers.metadata.json',JSON.stringify(meta,null,2)+'\n');
console.log(JSON.stringify({glyphs:glyphs.length,styles:Object.keys(NUMBER_STYLES),motionFrames:count}));
