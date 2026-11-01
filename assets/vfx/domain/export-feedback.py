"""Encode the offline sound/number preview with existing PyAV and Pillow."""
import hashlib
import json
import wave
from fractions import Fraction
from pathlib import Path

import av
import numpy as np
from PIL import Image

HERE=Path(__file__).resolve().parent
audio_root=HERE.parents[1]/'audio/domain'
record=json.loads((HERE/'feedback-record.json').read_text(encoding='utf-8'))
audio_manifest=json.loads((audio_root/'audio-manifest.json').read_text(encoding='utf-8'))
atlas=Image.open(HERE/record['preview']['atlasFile']).convert('RGB')
with wave.open(str(audio_root/'domain-cycle-demo.wav'),'rb') as wav:
    sr=wav.getframerate();channels=wav.getnchannels();samples=np.frombuffer(wav.readframes(wav.getnframes()),dtype='<i2').reshape(-1,channels).astype(np.float32)/32768
if sr!=48000 or channels!=2 or len(samples)!=297600:raise ValueError('Unexpected master audio geometry')
path=HERE/'domain-feedback-av.mp4'
with av.open(str(path),'w',options={'movflags':'+faststart'}) as output:
    video=output.add_stream('libx264',rate=30);video.width=960;video.height=540;video.pix_fmt='yuv420p'
    video.options={'crf':'16','preset':'medium','tune':'animation'}
    sound=output.add_stream('aac',rate=sr);sound.layout='stereo';sound.bit_rate=160000
    for index,item in enumerate(record['frames']):
        x,y,w,h=item['x'],item['y'],item['w'],item['h']
        image=atlas.crop((x,y,x+w,y+h)).resize((960,540),Image.Resampling.NEAREST)
        frame=av.VideoFrame.from_image(image);frame.pts=index;frame.time_base=Fraction(1,30)
        for packet in video.encode(frame):output.mux(packet)
        start=index*1600;chunk=np.ascontiguousarray(samples[start:start+1600].T)
        frame_audio=av.AudioFrame.from_ndarray(chunk,format='fltp',layout='stereo')
        frame_audio.sample_rate=sr;frame_audio.pts=start;frame_audio.time_base=Fraction(1,sr)
        for packet in sound.encode(frame_audio):output.mux(packet)
    for packet in video.encode():output.mux(packet)
    for packet in sound.encode():output.mux(packet)
with av.open(str(path)) as output:
    streams=[{'type':s.type,'codec':s.codec_context.name,'duration':float(s.duration*s.time_base) if s.duration else None} for s in output.streams]
    duration=output.duration/av.time_base
    if abs(duration-6.2)>.04:raise ValueError(f'AV duration mismatch: {duration}')
    if not any(s['type']=='audio' for s in streams):raise ValueError('Missing sound track')
number_meta=json.loads((HERE/'numbers/numbers.metadata.json').read_text(encoding='utf-8'))
number_atlas=Image.open(HERE/'numbers/number-motion-atlas.png').convert('RGB')
master=number_atlas.quantize(colors=128,dither=Image.Dither.NONE)
palette=Image.new('P',(1,1));palette.putpalette(master.getpalette());frames=[]
for item in number_meta['motion']['frames']:
    x,y,w,h=item['x'],item['y'],item['w'],item['h']
    frames.append(number_atlas.crop((x,y,x+w,y+h)).quantize(palette=palette,dither=Image.Dither.NONE).resize((w*3,h*3),Image.Resampling.NEAREST))
durations=[[30,30,40][i%3] for i in range(len(frames))]
number_gif=HERE/'numbers/number-motion-3x.gif'
frames[0].save(number_gif,save_all=True,append_images=frames[1:],duration=durations,loop=0,disposal=2,optimize=False)
with Image.open(number_gif) as gif:
    gif_duration=0
    for i in range(gif.n_frames):gif.seek(i);gif_duration+=gif.info.get('duration',0)
    if gif_duration!=3600:raise ValueError(f'Number GIF duration mismatch: {gif_duration}')
checks=[];hashes=set()
for cue in audio_manifest['clips']:
    file=audio_root/cue['file'];digest=hashlib.sha256(file.read_bytes()).hexdigest()
    if digest!=cue['sha256'] or digest in hashes:raise ValueError('Missing, changed, or duplicate SFX')
    hashes.add(digest)
    with wave.open(str(file),'rb') as source:
        values=np.frombuffer(source.readframes(source.getnframes()),dtype='<i2').astype(float).reshape(-1,2)/32767
        peak=float(np.max(np.abs(values)));dc=float(np.max(np.abs(np.mean(values,axis=0))))
        if source.getframerate()!=48000 or source.getsampwidth()!=2 or peak>=.99 or dc>.001:raise ValueError(f'Audio format/level invalid: {cue["id"]}')
        seam=float(np.max(np.abs(values[0]-values[-1])))
        adjacent=float(np.percentile(np.abs(np.diff(values,axis=0)),99.9))
        mono=float(np.sqrt(np.mean(values.mean(axis=1)**2))/np.sqrt(np.mean(values*values)))
        if cue['loop'] and seam>adjacent*1.5:raise ValueError(f'Unexpected loop discontinuity: {cue["id"]}')
        checks.append({'id':cue['id'],'peak':peak,'dc':dc,'monoRmsRatio':mono,
                       'loopBoundaryStep':seam if cue['loop'] else None,'adjacentStepP999':adjacent if cue['loop'] else None})
check_record={'status':'offline audiovisual draft; not runtime acceptance','video':{'file':path.name,'duration':duration,'size':[960,540],'streams':streams,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()},
              'numbersGif':{'file':'numbers/number-motion-3x.gif','sourceFrames':len(frames),'durationMs':gif_duration},
              'audio':{'uniqueClips':len(hashes),'talentsMapped':len(audio_manifest['talents']),'upgradesMapped':len(audio_manifest['weaponUpgrades']),
                       'minimumMonoRmsRatio':min(c['monoRmsRatio'] for c in checks),
                       'demoPeakDbfs':float(20*np.log10(np.max(np.abs(samples)))),
                       'checks':checks}}
(HERE/'feedback-validation.json').write_text(json.dumps(check_record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in check_record.items() if k!='audio'},ensure_ascii=False))
print(json.dumps({'audioClips':len(hashes),'talentsMapped':len(audio_manifest['talents']),'upgradesMapped':len(audio_manifest['weaponUpgrades'])}))
