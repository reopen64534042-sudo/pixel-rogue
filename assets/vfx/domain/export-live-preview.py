"""Convert the browser-recorded production-renderer comparison to GIF/MP4; no game assets edited."""
import argparse
import hashlib
import json
from fractions import Fraction
from pathlib import Path

import av
from PIL import Image

parser=argparse.ArgumentParser()
parser.add_argument('--input',type=Path,default=Path(__file__).parent/'domain-hit-slash-void.webm')
parser.add_argument('--name',default='domain-hit-slash-void')
args=parser.parse_args()
if Path(args.name).name!=args.name or any(ch in args.name for ch in '/\\:'):
    raise ValueError('The export name must be a filename stem inside the art directory')
source=args.input.resolve()
target=Path(__file__).resolve().parent
frames=[]
with av.open(str(source)) as video:
    stream=video.streams.video[0]
    for frame in video.decode(stream):
        frames.append((float(frame.pts*frame.time_base),frame.to_image().convert('RGB')))
if len(frames)<2:
    raise ValueError('The browser recording must contain at least two frames')
start=frames[0][0]
frames=[(time-start,image) for time,image in frames]
duration=frames[-1][0]+1/30
count=round(duration*30)
selected=[];index=0
for n in range(count):
    time=n/30
    while index+1<len(frames) and frames[index+1][0]<=time:
        index+=1
    selected.append(frames[index][1])
gif_size=(720,330)
small=[frame.resize(gif_size,Image.Resampling.NEAREST) for frame in selected]
contact=Image.new('RGB',(720,330*min(9,len(small))))
for i in range(min(9,len(small))):
    contact.paste(small[round(i*(len(small)-1)/max(1,min(9,len(small))-1))],(0,i*330))
palette=contact.quantize(colors=128,dither=Image.Dither.NONE)
gif=[frame.quantize(palette=palette,dither=Image.Dither.NONE) for frame in small]
gif_path=target/f'{args.name}.gif'
gif[0].save(gif_path,save_all=True,append_images=gif[1:],duration=[[30,30,40][i%3] for i in range(count)],loop=0,disposal=1,optimize=True)
mp4_path=target/f'{args.name}.mp4'
with av.open(str(mp4_path),'w') as out:
    stream=out.add_stream('libx264',rate=30)
    stream.width,stream.height=selected[0].size
    stream.pix_fmt='yuv420p';stream.options={'crf':'18'}
    for n,image in enumerate(selected):
        frame=av.VideoFrame.from_image(image);frame.pts=n;frame.time_base=Fraction(1,30)
        for packet in stream.encode(frame):out.mux(packet)
    for packet in stream.encode():out.mux(packet)
record={'source':source.name,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
    'sourceFrames':len(frames),'exportFrames':count,'fps':30,'size':list(selected[0].size),'gifSize':list(gif_size),'duration':count/30,
    'files':[gif_path.name,mp4_path.name],
    'scope':'Controlled Phaser playback using production Core/renderer. High-HP targets, muted. Not natural combat acceptance.'}
(target/('continuous-preview-record.json' if args.name=='domain-continuous-void' else f'{args.name}-record.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(record))
