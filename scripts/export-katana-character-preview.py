"""Render an offline asset animation preview, not gameplay acceptance evidence."""
from pathlib import Path
import json
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "assets/characters/katana"
record = json.loads((ART / "asset-record.json").read_text(encoding="utf-8"))
sheet = Image.open(ROOT / record["image"]).convert("RGBA")
bounds = [frame["bounds"] for frame in record["frames"]]
left = min(box["minX"] for box in bounds) - 2
top = min(box["minY"] for box in bounds) - 2
right = max(box["maxX"] for box in bounds) + 3
bottom = max(box["maxY"] for box in bounds) + 3
scale = 6
cell_w, cell_h = (right - left) * scale, (bottom - top) * scale
width, row_h = cell_w * 2 + 24, cell_h + 25
labels = ["IDLE", "RUN", "ATTACK", "DASH"]
frames = []
for tick in range(48):
    time = tick * 0.05
    image = Image.new("RGB", (width, row_h * 4 + 24), "#101521")
    draw = ImageDraw.Draw(image)
    draw.text((12, 6), "RONIN C - ASSET PREVIEW / 6x / RIGHT + LEFT", fill="#e8e8f0")
    for action, label in enumerate(labels):
        draw.text((12, 27 + action * row_h), label, fill="#f4a940")
        if action == 0:
            frame = int(time * 3) % 4
        elif action == 1:
            frame = int(time * 10) % 4
        else:
            cycle, active = (0.4, 0.167) if action == 2 else (0.8, 0.16)
            progress = (time % cycle) / active
            if progress >= 1:
                frame = 0
                row = 0
            else:
                frame = min(3, int(progress * 4))
                if action == 2:
                    frame = [2, 2, 3, 0][frame]
                row = action
        if action < 2:
            row = action
        for direction in range(2):
            source_row = direction * 4 + row
            tile = sheet.crop((frame * 64 + left, source_row * 64 + top,
                               frame * 64 + right, source_row * 64 + bottom))
            tile = tile.resize((cell_w, cell_h), Image.Resampling.NEAREST)
            image.paste(tile, (12 + direction * cell_w, 42 + action * row_h), tile)
    frames.append(image)
frames[0].save(ART / "katana-c-animation-preview.gif", save_all=True,
               append_images=frames[1:], duration=50, loop=0, disposal=2, optimize=False)
frames[0].save(ART / "katana-c-animation-preview.png")
print(json.dumps({"frames": len(frames), "width": width, "height": row_h * 4 + 24,
                  "durationMs": 2400, "path": str(ART / "katana-c-animation-preview.gif")}))
