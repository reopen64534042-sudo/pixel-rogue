"""Encode the rendered concept timeline to GIF; no source art is repainted."""
import json
import sys
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
feedback = '--feedback' in sys.argv
record = json.loads((HERE / ('feedback-record.json' if feedback else 'source-record.json')).read_text(encoding='utf-8'))
atlas = Image.open(HERE / record['preview'].get('atlasFile', 'prototype/timeline-atlas.png')).convert('RGB')
prefix = 'domain-feedback' if feedback else 'domain-concept'
master = atlas.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
palette = master.getpalette()
fixed = Image.new('P', (1, 1))
fixed.putpalette(palette)
frames = []
for item in record['frames']:
    box = (item['x'], item['y'], item['x'] + item['w'], item['y'] + item['h'])
    frames.append(atlas.crop(box).quantize(palette=fixed, dither=Image.Dither.NONE))
durations = [[30, 30, 40][i % 3] for i in range(len(frames))]
for scale in (1, 2):
    scaled = frames if scale == 1 else [f.resize((480*scale, 270*scale), Image.Resampling.NEAREST) for f in frames]
    scaled[0].save(HERE / f'{prefix}-{scale}x.gif', save_all=True, append_images=scaled[1:],
                   duration=durations, loop=0, disposal=2, optimize=False)
outputs = []
for scale in (1, 2):
    path = HERE / f'{prefix}-{scale}x.gif'
    with Image.open(path) as result:
        duration = 0
        for index in range(result.n_frames):
            result.seek(index)
            duration += result.info.get('duration', 0)
        outputs.append({'file': path.name, 'frames': result.n_frames, 'duration_ms': duration, 'size': result.size})
        if duration != sum(durations):
            raise ValueError(f'Unexpected GIF duration: {duration}')
(HERE / ('gif-feedback-record.json' if feedback else 'gif-record.json')).write_text(json.dumps({'source_frames': len(frames), 'duration_ms': sum(durations), 'outputs': outputs}, indent=2) + '\n', encoding='utf-8')
print(json.dumps(outputs))
