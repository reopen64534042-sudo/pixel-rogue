"""Export the JS preview renderer's frames with existing Pillow; no source-art edits."""
import json
import sys
from pathlib import Path
from PIL import Image

manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
frames = []
for filename in manifest["files"]:
    with Image.open(filename) as frame:
        frames.append(frame.convert("RGB").resize((960, 540), Image.Resampling.NEAREST).quantize(colors=256, dither=Image.Dither.NONE))
durations = [(round((i + 1) * 100 / manifest["fps"]) - round(i * 100 / manifest["fps"])) * 10 for i in range(len(frames))]
frames[0].save(manifest["output"], save_all=True, append_images=frames[1:], duration=durations, loop=0, disposal=2, optimize=False)
print(f"Mage VFX GIF: {len(frames)} frames, 960x540, offline preview")
