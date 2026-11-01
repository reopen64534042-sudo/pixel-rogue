import { readFileSync,writeFileSync } from 'node:fs';
import { decodePng,encodePng } from '../../../scripts/lib/png.mjs';
import { bounds,normalize,flip,crop } from './pixels.mjs';
const here=new URL('./',import.meta.url);
if(process.argv.includes('--canvas')){
  for(const direction of ['right','left']){
    const source=decodePng(readFileSync(new URL(`helper-${direction}-canvas.png`,here))),row=crop(source,0,384,1024,256);
    const rgba=Buffer.alloc(1024*1024*4);
    for(let i=0;i<4;i++)row.rgba.copy(rgba,i*row.rgba.length);
    writeFileSync(new URL(`${direction}-edit-canvas.png`,here),encodePng(1024,1024,rgba));
  }
}else{
  const source=decodePng(readFileSync(new URL('warden-body-seed-source-v1.png',here))),box=bounds(source,192);
  const right=normalize(source,24/box.h,32,59,64,box),left=flip(right);
  for(const [name,image] of [['right',right],['left',left]])
    writeFileSync(new URL(`warden-body-seed-${name}-64.png`,here),encodePng(64,64,image.rgba));
  console.log(JSON.stringify({source:[source.width,source.height],rightBounds:bounds(right),leftReferenceOnly:true}));
}
