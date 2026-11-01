"""Compare the old and repaired eight-pose walk at the same physical pace."""
from pathlib import Path
import json
import re
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "assets/characters/mage"
before = Image.open(ART / "mage-witch-before-walk.png").convert("RGBA")
after = Image.open(ROOT / "public/assets/characters/mage-witch-64x64.png").convert("RGBA")
character = (ROOT / "src/game/rendering/characters/MageCharacter.ts").read_text(encoding="utf-8")
stride = float(re.search(r"stride:\s*([\d.]+)", character).group(1))
scale, panel_w, panel_h = 4, 384, 216
count, cycles, speed = 64, 4, 62
duration_ms = round(cycles * stride / speed * 100) * 10
comparison, walking = [], []
for tick in range(count):
    step = tick // 2 % 8
    distance = tick / count * cycles * stride
    image = Image.new("RGB", (panel_w * 2, panel_h * 2), "#171d2d")
    draw = ImageDraw.Draw(image)
    for row, sheet in enumerate([before, after]):
        for direction in range(2):
            ox, oy = direction * panel_w, row * panel_h
            shift = (-1 if direction == 0 else 1) * distance * scale
            for x in range(-60, panel_w + 60, 60):
                px = ox + round((x + shift) % (panel_w + 60))
                if px < ox + panel_w:
                    draw.line((px, oy + 30, px, oy + panel_h), fill="#232e43")
            draw.line((ox, oy + 188, ox + panel_w, oy + 188), fill="#657895")
            draw.text((ox + 10, oy + 8), ("BEFORE" if row == 0 else "FIXED WALK") + (" / RIGHT" if direction == 0 else " / LEFT"), fill="#ffd24a")
            index = direction * 24 + 4 + step
            tile = sheet.crop((index % 4 * 64, index // 4 * 64, index % 4 * 64 + 64, index // 4 * 64 + 64))
            enlarged = tile.resize((256, 256), Image.Resampling.NEAREST)
            image.paste(enlarged, (ox + 192 - 32 * scale, oy + 188 - 59 * scale), enlarged)
            image.paste(tile, (ox + 24, oy + panel_h - 64), tile)
    comparison.append(image)
    walking.append(image.crop((0, panel_h, panel_w * 2, panel_h * 2)))
durations = [(round((i + 1) * duration_ms / count / 10) - round(i * duration_ms / count / 10)) * 10 for i in range(count)]
for name, frames in [("mage-witch-walk-comparison.gif", comparison), ("mage-witch-walk-preview.gif", walking)]:
    frames[0].save(ART / name, save_all=True, append_images=frames[1:], duration=durations, loop=0, disposal=2, optimize=False)
walking[4].save(ART / "mage-witch-walk-preview.png")
unchanged = []
for index in range(48):
    if index % 24 in range(4, 12):
        continue
    box = (index % 4 * 64, index // 4 * 64, index % 4 * 64 + 64, index // 4 * 64 + 64)
    if before.crop(box).tobytes() == after.crop(box).tobytes():
        unchanged.append(index)
print(json.dumps({"unchangedNonWalkFrames": len(unchanged), "totalNonWalkFrames": 32, "durationMs": duration_ms, "speedPxPerSecond": speed, "stridePx": stride}))
