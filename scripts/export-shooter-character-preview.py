"""Render layered scout assets and aiming examples; not gameplay acceptance evidence."""
from pathlib import Path
import json
import math
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "assets/characters/shooter"
record = json.loads((ART / "asset-record.json").read_text(encoding="utf-8"))
body_sheet = Image.open(ROOT / record["body"]["image"]).convert("RGBA")
old_body_sheet = Image.open(ROOT / record["body"]["run"]["previousImage"]).convert("RGBA")
body_frames = {frame["name"]: frame for frame in record["body"]["frames"]}
weapon_sheet = Image.open(ROOT / record["weapons"]["image"]).convert("RGBA")
weapons = ["CHARGED", "LASER", "MISSILE"]
crop = (44, 50, 88, 96)
scale = 5
cw, ch = (crop[2] - crop[0]) * scale, (crop[3] - crop[1]) * scale


def character(direction, action, frame, weapon, state, angle, legacy=False, output_scale=scale):
    if legacy:
        row = direction * 4 + action
        body = old_body_sheet.crop((frame * 64, row * 64, (frame + 1) * 64, (row + 1) * 64))
        lift = 0
    else:
        name = ("left" if direction else "right") + "-" + ["idle", "run", "brace", "dash"][action] + "-" + str(frame)
        info = body_frames[name]
        body = body_sheet.crop((info["x"], info["y"], info["x"] + 64, info["y"] + 64))
        lift = record["body"]["run"]["lift"][frame] if action == 1 else 0
    device = weapon_sheet.crop((state * 32, weapon * 24, (state + 1) * 32, (weapon + 1) * 24))
    if math.cos(angle) < 0:
        device = device.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    canvas = Image.new("RGBA", (128, 128))
    canvas.alpha_composite(body, (32, 26 - lift))
    layer = Image.new("RGBA", canvas.size)
    layer.alpha_composite(device, (64 - 17, 77 - 12))
    layer = layer.rotate(-math.degrees(angle), resample=Image.Resampling.NEAREST, center=(64, 77))
    canvas.alpha_composite(layer)
    return canvas.crop(crop).resize(((crop[2] - crop[0]) * output_scale,
                                   (crop[3] - crop[1]) * output_scale), Image.Resampling.NEAREST)


frames = []
for tick in range(60):
    time = tick * 0.05
    phase = int(time / 0.6)
    action = [0, 1, 2, 3, 0][min(4, phase)]
    rate = 3 if action == 0 else 10 if action == 1 else 8
    frame = int((time % 0.6) * 70 / record["body"]["run"]["distancePerFrame"]) % 8 if action == 1 else int((time % 0.6) * rate) % 4
    state = 1 if action == 2 else (2 if time < 2.7 else 3) if phase == 4 else 0
    image = Image.new("RGB", (cw * 2 + 24, (ch + 24) * 3 + 26), "#101521")
    draw = ImageDraw.Draw(image)
    draw.text((12, 7), "SCOUT C / LAYERED ASSET PREVIEW / 5x", fill="#e8e8f0")
    for weapon, label in enumerate(weapons):
        y = 27 + weapon * (ch + 24)
        draw.text((12, y), label, fill="#f4a940")
        for direction in range(2):
            a = math.sin(time * math.pi * 2 / 3) * 0.8
            angle = math.pi - a if direction else a
            sprite = character(direction, action, frame, weapon, state, angle)
            image.paste(sprite, (12 + direction * cw, y + 18), sprite)
    frames.append(image)
frames[0].save(ART / "shooter-c-animation-preview.gif", save_all=True,
               append_images=frames[1:], duration=50, loop=0, disposal=2, optimize=False)
frames[0].save(ART / "shooter-c-animation-preview.png")

aim = Image.new("RGB", (cw * 4, (ch + 20) * 2 + 26), "#101521")
draw = ImageDraw.Draw(aim)
draw.text((12, 7), "TWO BODY FACINGS / EIGHT WEAPON AIM EXAMPLES", fill="#e8e8f0")
for index in range(8):
    angle = index * math.pi / 4
    x, y = index % 4 * cw, 26 + index // 4 * (ch + 20)
    draw.text((x + 8, y), str(index * 45) + "deg", fill="#f4a940")
    sprite = character(1 if math.cos(angle) < -0.1 else 0, 2, 0, 1, 1, angle)
    aim.paste(sprite, (x, y + 18), sprite)
aim.save(ART / "shooter-c-aim-preview.png")

# Same speed and cycle duration in both panels: only the actual gait changes.
comparison = []
panel_width = 320
for tick in range(32):
    time = tick * 0.05
    before = int(time * 10) % 4
    after = int(time * 70 / record["body"]["run"]["distancePerFrame"]) % 8
    image = Image.new("RGB", (panel_width * 2 + 24, 430), "#101521")
    draw = ImageDraw.Draw(image)
    draw.text((12, 7), "RUN COMPARISON / SAME 70px/s / SAME 0.4s CYCLE", fill="#e8e8f0")
    for version, label in enumerate(("BEFORE: 4 FRAMES", "AFTER: 8 FRAMES + 1px LIFT")):
        start = 12 + version * panel_width
        draw.text((start, 29), label, fill="#f4a940")
        draw.text((start, 45), "2x MOVEMENT", fill="#8b8f9a")
        draw.line((start, 135, start + panel_width - 14, 135), fill="#30394b")
        sprite = character(0, 1, after if version else before, 0, 0, 0,
                           legacy=version == 0, output_scale=2)
        image.paste(sprite, (start + int(time * 70 * 2), 65), sprite)
        draw.text((start, 177), "5x POSE", fill="#8b8f9a")
        sprite = character(0, 1, after if version else before, 0, 0, 0,
                           legacy=version == 0)
        image.paste(sprite, (start + (panel_width - cw) // 2, 197), sprite)
    comparison.append(image)
comparison[0].save(ART / "shooter-c-run-comparison.gif", save_all=True,
                   append_images=comparison[1:], duration=50, loop=0, disposal=2, optimize=False)
comparison[0].save(ART / "shooter-c-run-comparison.png")
print(json.dumps({"frames": len(frames), "width": frames[0].width, "height": frames[0].height,
                  "path": str(ART / "shooter-c-animation-preview.gif")}))
