"""Export the shipped witch's five actions; offline asset preview, not gameplay."""
from pathlib import Path
import json
import re
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "assets/characters/mage"
record = json.loads((ART / "asset-record.json").read_text(encoding="utf-8"))
sheet = Image.open(ROOT / record["image"]).convert("RGBA")
bounds = [f["bounds"] for f in record["frames"]]
left = min(b["minX"] for b in bounds) - 2
top = min(b["minY"] for b in bounds) - 2
right = max(b["maxX"] for b in bounds) + 3
bottom = max(b["maxY"] for b in bounds) + 3
scale = 6
cell_w, cell_h = (right - left) * scale, (bottom - top) * scale
width, height = cell_w * 2 + 36, cell_h + 105
starts = [0, 4, 12, 16, 20]
labels = ["IDLE", "WALK (8 FRAMES)", "CHANT", "RELEASE", "DASH"]
frames = []
character = (ROOT / "src/game/rendering/characters/MageCharacter.ts").read_text(encoding="utf-8")
stride = float(re.search(r"stride:\s*([\d.]+)", character).group(1))
for tick in range(140):
    action = tick // 28
    time = tick % 28 * 0.05
    if action == 0:
        pose = int(time * 3) % 4
    elif action == 1:
        pose = 4 + int(time * 62 / stride * 8) % 8
    elif action == 2:
        pose = 12 + min(3, int((time % 0.7) / 0.45 * 4))
    else:
        duration = 0.18 if action == 3 else 0.16
        progress = (time % 0.7) / duration
        pose = starts[action] + min(3, int(progress * 4)) if progress < 1 else 0
    image = Image.new("RGB", (width, height), "#101521")
    draw = ImageDraw.Draw(image)
    draw.text((12, 8), "WITCH MAGE / SHIPPED ASSET PREVIEW / 6x + 1x", fill="#e8e8f0")
    draw.text((12, 27), labels[action], fill="#ffd24a")
    for direction in range(2):
        index = direction * 24 + pose
        sx, sy = index % 4 * 64, index // 4 * 64
        tile = sheet.crop((sx + left, sy + top, sx + right, sy + bottom))
        draw.text((18 + direction * cell_w, 46), "RIGHT" if direction == 0 else "LEFT", fill="#57e6ff")
        large = tile.resize((cell_w, cell_h), Image.Resampling.NEAREST)
        image.paste(large, (12 + direction * cell_w, 60), large)
        image.paste(tile, (20 + direction * cell_w, height - (bottom - top) - 5), tile)
    frames.append(image)
frames[0].save(ART / "mage-witch-animation-preview.gif", save_all=True, append_images=frames[1:], duration=50, loop=0, disposal=2, optimize=False)
frames[62].save(ART / "mage-witch-animation-preview.png")
with Image.open(ART / "mage-witch-animation-preview.gif") as preview:
    print(json.dumps({"sampledFrames": len(frames), "encodedFrames": preview.n_frames, "width": width, "height": height, "durationMs": 7000}))
