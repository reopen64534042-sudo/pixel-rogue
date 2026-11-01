import { loadPalette,hexToRgb } from '../../../scripts/lib/palette.mjs';
export const paletteKeys=['ink0','ink1','steelDark','steelMid','bone','sand','pBrown','pBlueDk','pBlue','psiPurple','psiViolet','iceCyan'];
const palette=Object.fromEntries(loadPalette().map(p=>[p.key,hexToRgb(p.hex)]));
export const colors=paletteKeys.map(key=>palette[key]);
function lab(rgb){
  const [r,g,b]=rgb.map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});
  const f=v=>v>.008856?Math.cbrt(v):7.787*v+16/116;
  const x=f((r*.4124564+g*.3575761+b*.1804375)/.95047),y=f(r*.2126729+g*.7151522+b*.072175),z=f((r*.0193339+g*.119192+b*.9503041)/1.08883);
  return [116*y-16,500*(x-y),200*(y-z)];
}
const colorLab=colors.map(lab);
export function bounds(image,threshold=128){
  let x0=image.width,y0=image.height,x1=-1,y1=-1,count=0;
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(image.rgba[(y*image.width+x)*4+3]>=threshold){
    x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);count++;
  }
  return {x:x0,y:y0,w:x1-x0+1,h:y1-y0+1,count};
}
export function normalize(source,scale,anchorX=32,anchorY=59,frameSize=64,bodyBounds=bounds(source)){
  const image={width:frameSize,height:frameSize,rgba:Buffer.alloc(frameSize*frameSize*4)};
  const ox=anchorX-(bodyBounds.x+bodyBounds.w/2)*scale,oy=anchorY-(bodyBounds.y+bodyBounds.h)*scale;
  for(let y=0;y<frameSize;y++)for(let x=0;x<frameSize;x++){
    const x0=(x-ox)/scale,y0=(y-oy)/scale,x1=(x+1-ox)/scale,y1=(y+1-oy)/scale;
    let a=0,r=0,g=0,b=0;
    for(let sy=Math.max(0,Math.floor(y0));sy<Math.min(source.height,Math.ceil(y1));sy++)
      for(let sx=Math.max(0,Math.floor(x0));sx<Math.min(source.width,Math.ceil(x1));sx++){
        const weight=Math.max(0,Math.min(x1,sx+1)-Math.max(x0,sx))*Math.max(0,Math.min(y1,sy+1)-Math.max(y0,sy));
        const at=(sy*source.width+sx)*4,alpha=source.rgba[at+3]/255*weight;
        a+=alpha;r+=source.rgba[at]*alpha;g+=source.rgba[at+1]*alpha;b+=source.rgba[at+2]*alpha;
      }
    if(a/((x1-x0)*(y1-y0))<.5)continue;
    const value=lab([r/a,g/a,b/a]);let best=colors[0],distance=Infinity;
    colorLab.forEach((color,index)=>{const d=color.reduce((n,c,i)=>n+(c-value[i])**2,0);if(d<distance){distance=d;best=colors[index];}});
    image.rgba.set([...best,255],(y*frameSize+x)*4);
  }
  return image;
}
export function flip(source){
  const rgba=Buffer.alloc(source.rgba.length);
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){
    const at=(y*source.width+x)*4;
    source.rgba.copy(rgba,(y*source.width+source.width-1-x)*4,at,at+4);
  }
  return {...source,rgba};
}
export function crop(source,x,y,w,h){
  const rgba=Buffer.alloc(w*h*4);
  for(let row=0;row<h;row++)source.rgba.copy(rgba,row*w*4,((y+row)*source.width+x)*4,((y+row)*source.width+x+w)*4);
  return {width:w,height:h,rgba};
}
