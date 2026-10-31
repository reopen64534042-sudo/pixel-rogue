"""Render formal character clips and the existing leap timeline as offline previews."""
from pathlib import Path
import json
import re
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "assets/characters/greatsword"
record = json.loads((ART / "asset-record.json").read_text(encoding="utf-8"))
sheet = Image.open(ROOT / record["image"]).convert("RGBA")
size = record["frameSize"]
actions = record["actions"]
bounds = [frame["bounds"] for frame in record["frames"]]
left = max(0, min(box["minX"] for box in bounds) - 3)
top = max(0, min(box["minY"] for box in bounds) - 3)
right = min(size, max(box["maxX"] for box in bounds) + 4)
bottom = min(size, max(box["maxY"] for box in bounds) + 4)
scale = 5
cell_w, cell_h = (right - left) * scale, (bottom - top) * scale
width = 2 * cell_w + 24


def tile(direction, action, frame):
    row = direction * len(actions) + action
    return sheet.crop((frame * size + left, row * size + top,
                       frame * size + right, row * size + bottom)).resize(
                           (cell_w, cell_h), Image.Resampling.NEAREST)


def save(frames, name, duration):
    frames[0].save(ART / (name + ".gif"), save_all=True, append_images=frames[1:],
                   duration=duration, loop=0, disposal=2, optimize=False)
    frames[0].save(ART / (name + ".png"))


clips = []
for action, name in enumerate(actions):
    for step in range(8):
        frame = step // 2
        if name in ("attack", "heavy"):
            frame = [2, 2, 3, 0][frame]
        image = Image.new("RGB", (width, cell_h + 42), "#101521")
        draw = ImageDraw.Draw(image)
        draw.text((12, 7), "GREAT SWORD C / ASSET CLIPS / 5x / RIGHT + LEFT", fill="#e8e8f0")
        draw.text((12, 23), name.upper(), fill="#f4a940")
        for direction in range(2):
            sprite = tile(direction, action, frame)
            image.paste(sprite, (12 + direction * cell_w, 40), sprite)
        clips.append(image)
save(clips, "greatsword-c-animation-preview", 100)

balance = (ROOT / "src/game/data/warriorBalance.ts").read_text(encoding="utf-8")


def seconds(key):
    match = re.search(r"\b" + re.escape(key) + r"\s*:\s*([\d.]+)", balance)
    if match is None:
        raise ValueError("Missing leap duration: " + key)
    return float(match.group(1))


windup, fall, land = (seconds(key) for key in ("leapWindup", "leapFall", "leapImpactLife"))
leap_frames = []
leap_height = cell_h + (42 + 4) * scale + 42
for tick in range(round((windup + fall + land + 0.4) / 0.02)):
    time = tick * 0.02
    height, alpha = 0, 1
    if time < windup:
        action, progress = 5, time / windup
        height, alpha = round(10 * progress), 1 - 0.85 * progress
    elif time < windup + fall:
        action, progress = 6, (time - windup) / fall
        height, alpha = round(42 * (1 - progress * progress)), 0.25 + 0.75 * progress
    elif time < windup + fall + land:
        action, progress = 7, (time - windup - fall) / land
    else:
        action, progress = 0, (time - windup - fall - land) * 3 / 4
    frame = min(3, max(0, int(progress * 4)))
    image = Image.new("RGB", (width, leap_height), "#101521")
    draw = ImageDraw.Draw(image)
    draw.text((12, 7), "GREAT SWORD C / LEAP TIMELINE / 5x / RIGHT + LEFT", fill="#e8e8f0")
    draw.text((12, 23), actions[action].upper(), fill="#f4a940")
    ground_y = 40 + 42 * scale + (record["anchor"]["y"] - top) * scale
    draw.line((12, ground_y, width - 12, ground_y), fill="#30394b")
    for direction in range(2):
        sprite = tile(direction, action, frame)
        sprite.putalpha(sprite.getchannel("A").point(lambda value: round(value * alpha)))
        image.paste(sprite, (12 + direction * cell_w, 40 + (42 - height) * scale), sprite)
    leap_frames.append(image)
save(leap_frames, "greatsword-c-leap-preview", 20)
print(json.dumps({"clips": len(clips), "leapFrames": len(leap_frames), "width": width,
                  "windup": windup, "fall": fall, "land": land}))
