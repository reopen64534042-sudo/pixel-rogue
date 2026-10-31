"""Offline artwork export from the real TypeScript player's recorded commands.
Uses existing Pillow. Does not run browser, GameCore, damage, or combat checks.
"""
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "output/laser-vfx-recording.json").read_text(encoding="utf-8"))
OUT = ROOT / "assets/vfx/laser"
ATLAS = Image.open(ROOT / "public/assets/vfx/laser/laser.atlas.png").convert("RGBA")
W, H = 480, 270
FONT = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 12)
SMALL = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 10)


def color(hex_value, alpha=1):
    return tuple(int(hex_value[i:i + 2], 16) for i in (1, 3, 5)) + (round(max(0, min(1, alpha)) * 255),)


def sprite_layer(cmd):
    clip = DATA["clips"][cmd["clip"]]
    name = clip["frames"][cmd["frame"]]
    r = DATA["atlas"]["frames"][name]["frame"]
    crop_x = max(0, min(r["w"], math.floor(cmd.get("cropX", 0))))
    width = max(0, min(r["w"] - crop_x, math.floor(cmd.get("cropWidth", r["w"] - crop_x))))
    if width == 0:
        return None, (0, 0)
    sprite = ATLAS.crop((r["x"] + crop_x, r["y"], r["x"] + crop_x + width, r["y"] + r["h"]))
    ax, ay = clip["anchor"]
    sx, sy, angle = cmd["scaleX"], cmd["scaleY"], cmd["angle"]
    co, si = math.cos(angle), math.sin(angle)
    corners = [(cmd["x"] + co * sx * (x - ax) - si * sy * (y - ay),
                cmd["y"] + si * sx * (x - ax) + co * sy * (y - ay))
               for x, y in [(0, 0), (width, 0), (0, r["h"]), (width, r["h"])]]
    left = math.floor(min(p[0] for p in corners)) - 1
    top = math.floor(min(p[1] for p in corners)) - 1
    right = math.ceil(max(p[0] for p in corners)) + 1
    bottom = math.ceil(max(p[1] for p in corners)) + 1
    a, b, d, e = co / sx, si / sx, -si / sy, co / sy
    c = ax + a * (left - cmd["x"]) + b * (top - cmd["y"])
    f = ay + d * (left - cmd["x"]) + e * (top - cmd["y"])
    result = sprite.transform((right - left, bottom - top), Image.Transform.AFFINE,
                              (a, b, c, d, e, f), resample=Image.Resampling.NEAREST)
    if cmd["alpha"] < 1:
        result.putalpha(result.getchannel("A").point(lambda v: round(v * cmd["alpha"])))
    return result, (left, top)


def panel(p):
    image = Image.new("RGBA", (W, H), "#151e2b")
    draw = ImageDraw.Draw(image)
    for x in range(0, W, 24):
        draw.line((x, 30, x, H), fill="#1e2c3b")
    for y in range(30, H, 24):
        draw.line((0, y, W, y), fill="#1e2c3b")
    seen = set()
    for t in p["targets"]:
        if t["id"] in seen:
            continue
        seen.add(t["id"])
        x, y = round(t["x"]), round(t["y"])
        draw.rectangle((x - 4, y - 4, x + 3, y + 3), fill="#4dd44d")
        draw.point((x - 2, y - 1), fill="#0a3d0a")
        draw.point((x + 2, y - 1), fill="#0a3d0a")
    rows = ["  hhhh  ", " hhhhhh ", " heffeh ", " hhhhhh ", "  aaaa  ",
            " aaaaaa ", " aaaaaa ", "   aa   ", "  a  a  ", "  b  b  "]
    colors = {"h": "#f4a940", "e": "#22223a", "f": "#ffd9a0", "a": "#3d6de0", "b": "#5a3a20"}
    px, py = round(p["player"]["x"]), round(p["player"]["y"])
    for y, row in enumerate(rows):
        for x, key in enumerate(row):
            if key in colors:
                draw.point((px - 4 + x, py - 5 + y), fill=colors[key])
    for cmd in p["commands"]:
        if cmd["kind"] == "sprite":
            sprite, position = sprite_layer(cmd)
            if sprite is not None:
                image.alpha_composite(sprite, position)
            continue
        layer = Image.new("RGBA", (W, H))
        painter = ImageDraw.Draw(layer)
        rgba = color(cmd["color"], cmd["alpha"])
        if cmd["kind"] == "beam":
            painter.line((round(cmd["x"]), round(cmd["y"]), round(cmd["x2"]), round(cmd["y2"])),
                         fill=rgba, width=max(1, round(cmd["width"])))
        elif cmd["kind"] == "arc":
            x, y, r = cmd["x"], cmd["y"], cmd["radius"]
            painter.arc((x - r, y - r, x + r, y + r),
                        math.degrees(cmd["start"]), math.degrees(cmd["end"]), fill=rgba, width=1)
        else:
            painter.point((round(cmd["x"]), round(cmd["y"])), fill=rgba)
        image = Image.alpha_composite(image, layer)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, W, 29), fill="#0b111b")
    draw.text((10, 2), p["title"], font=FONT, fill="#e8e8f0")
    draw.text((10, 18), f't={p["time"]:.3f}s  {p["phase"]}  u={p["u"]:.3f}  T={p["duration"]:.1f}s', font=SMALL, fill="#57e6ff")
    draw.rectangle((0, 250, W, H), fill="#0b111b")
    focus_text = " / ".join(f'{v:.2f}' for v in p.get("focus", [])) or "release snapshot"
    draw.text((10, 253), "focus=" + focus_text + "  / 离线素材展示", font=SMALL, fill="#8fa9bd")
    return image.convert("RGB")


def sheet(panels, columns):
    image = Image.new("RGB", (W * columns, H * math.ceil(len(panels) / columns)), "#0b111b")
    for i, p in enumerate(panels):
        image.paste(panel(p), (i % columns * W, i // columns * H))
    return image


frames = [sheet(p, 2) for p in DATA["frames"]]
durations = [round((i + 1) * 1000 / DATA["fps"] / 10) * 10 - round(i * 1000 / DATA["fps"] / 10) * 10
             for i in range(len(frames))]
frames[0].save(OUT / "full-cycle-1x.gif", save_all=True, append_images=frames[1:], duration=durations, loop=0, disposal=2)
focus_frames = [sheet(p, 3) for p in DATA["focusFrames"]]
focus_frames[0].save(OUT / "focus-feedback-1x.gif", save_all=True, append_images=focus_frames[1:], duration=durations, loop=0, disposal=2)
sheet(DATA["focusComparison"][:9], 3).save(OUT / "focus-width-comparison.png")
detail = Image.new("RGB", (3 * 256, 284), "#0b111b")
for i, pose in enumerate(DATA["focusComparison"][:3]):
    target = pose["targets"][0]
    x, y = round(target["x"]), round(target["y"])
    crop = panel(pose).crop((x - 16, y - 16, x + 16, y + 16))
    detail.paste(crop.resize((256, 256), Image.Resampling.NEAREST), (i * 256, 28))
    ImageDraw.Draw(detail).text((i * 256 + 12, 5), f'focus={pose["focus"][0]:.1f} / u=0.40 / 8x', font=FONT, fill="#e8e8f0")
detail.save(OUT / "focus-hit-detail-8x.png")
sheet(DATA["overlap"], 3).save(OUT / "short-recharge-inspection.png")
# Boundary-focused quarter speed, from late channel through full 0.24s release.
slow = [sheet(panels, 2) for panels in DATA["slowFrames"]]
slow_durations = [round((i + 1) * 1000 / 30 / 10) * 10 - round(i * 1000 / 30 / 10) * 10 for i in range(len(slow))]
slow[0].save(OUT / "release-025x.gif", save_all=True, append_images=slow[1:], duration=slow_durations, loop=0, disposal=2)
sheet(DATA["contact"], 3).save(OUT / "collapse-frame-inspection.png")
sheet(DATA["gold"], 3).save(OUT / "meltdown-frame-inspection.png")
sheet([p for pair in DATA["coverage"] for p in pair], 4).save(OUT / "scenario-inspection.png")
frames[26].save(OUT / "full-cycle-poster.png")
(OUT / "preview-record.json").write_text(json.dumps({
    "source": "real LaserVfxPlayer + production atlas, recorded by build-laser-vfx-preview.mjs",
    "originalSpeed": {"fps": 30, "frames": len(frames), "durationMs": sum(durations), "gif": "full-cycle-1x.gif"},
    "slow": {"speed": 0.25, "gif": "release-025x.gif", "sampling": "uniform 120Hz source, 30fps playback", "frames": len(slow)},
    "focus": {"gif": "focus-feedback-1x.gif", "durationMs": sum(durations), "fixedU": 0.4,
              "states": [0, 0.5, 1], "comparison": "focus-width-comparison.png", "overlap": "short-recharge-inspection.png"},
    "scope": "offline art rendering only; Pillow rasterization differs from Phaser; no gameplay, damage or browser acceptance",
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"gif": str(OUT / "full-cycle-1x.gif"), "frames": len(frames), "durationMs": sum(durations)}))
