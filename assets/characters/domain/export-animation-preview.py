"""Offline 8-action, two-facing character preview; not a gameplay acceptance run."""
import json
import sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
candidate='--candidate' in sys.argv
record=json.loads((HERE/('asset-record-v2-candidate.json' if candidate else 'asset-record.json')).read_text(encoding='utf-8'))
body=Image.open(ROOT/record['bodyImage']).convert('RGBA')
prop=Image.open(ROOT/record['prop']['image']).convert('RGBA')
font=ImageFont.truetype(str(ROOT/'public/assets/fonts/press-start-2p.ttf'),8)
actions=record['actions'];frames=[]
for step in range(120):
    t=step/30;direction=0 if t<2 else 1;local=t%2
    canvas=Image.new('RGBA',(480,240),(20,23,37,255));draw=ImageDraw.Draw(canvas)
    for row,action in enumerate(actions):
        if action in ['deploy','collapse']:phase=min(3,int((local%(.25 if action=='deploy' else .35))/(.25 if action=='deploy' else .35)*4))
        else:phase=int(local*(3 if action=='idle' else 62/record.get('locomotion',{}).get('frameDistance',8)))%4
        index=(direction*8+row)*4+phase
        sprite=body.crop(((index%4)*64,(index//4)*64,(index%4+1)*64,(index//4+1)*64))
        sign=-1 if direction==0 else 1
        for dx,dy in [(10,44),(14,49),(9,54)]:
            sprite.alpha_composite(prop,(32+sign*dx-4,dy-5))
        panel=(row%4*120,row//4*120)
        canvas.alpha_composite(sprite.crop((12,24,52,64)).resize((80,80),Image.Resampling.NEAREST),(panel[0]+20,panel[1]+24))
        draw.text((panel[0]+5,panel[1]+7),action.upper()[:13],font=font,fill=(232,232,240,255))
        draw.text((panel[0]+48,panel[1]+108),'R' if direction==0 else 'L',font=font,fill=(87,230,255,255))
    frames.append(canvas.convert('RGB').quantize(colors=128,dither=Image.Dither.NONE))
durations=[[30,30,40][i%3] for i in range(120)]
frames[0].save(HERE/('warden-actions-v2-candidate.gif' if candidate else 'warden-actions.gif'),save_all=True,append_images=frames[1:],duration=durations,loop=0,disposal=2,optimize=False)
print(json.dumps({'sourceFrames':120,'durationMs':sum(durations),'directions':record['directions'],'actions':actions}))

# Direct pose comparison: old/new at their real distance-based base-speed cadence.
if not candidate and (HERE/'warden-body-sheet-v1.png').exists():
    old=Image.open(HERE/'warden-body-sheet-v1.png').convert('RGBA')
    comparison=[]
    for step in range(120):
        t=step/30
        canvas=Image.new('RGBA',(640,360),(20,23,37,255));draw=ImageDraw.Draw(canvas)
        for row,action_row in enumerate([1,3,5]):
            for col in range(4):
                revised=col%2==1;direction=col//2
                phase=int(t*62/(8 if revised else 7))%4
                index=(direction*8+action_row)*4+phase
                source=body if revised else old
                sprite=source.crop(((index%4)*64,(index//4)*64,(index%4+1)*64,(index//4+1)*64))
                sprite=sprite.crop((12,24,52,64)).resize((80,80),Image.Resampling.NEAREST)
                px=col*160;py=row*120
                draw.line((px+16,py+99,px+144,py+99),fill=(50,50,75,255))
                canvas.alpha_composite(sprite,(px+40,py+29))
                draw.text((px+8,py+8),('V2 ' if revised else 'V1 ')+('RIGHT' if direction==0 else 'LEFT'),font=font,fill=(87,230,255,255) if revised else (155,162,183,255))
                draw.text((px+8,py+110),actions[action_row].upper(),font=font,fill=(232,232,240,255))
        comparison.append(canvas.convert('RGB').quantize(colors=128,dither=Image.Dither.NONE))
    comparison[0].save(HERE/'warden-run-v2-comparison.gif',save_all=True,append_images=comparison[1:],duration=durations,loop=0,disposal=2,optimize=False)
