"""Export the shared production VFX command stream to a pixel-crisp PNG/GIF contact sheet."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
data = json.loads((root / "output/monsters-v168/frames.json").read_text(encoding="utf-8"))
out = root / "docs/previews/monsters-v168"
out.mkdir(parents=True, exist_ok=True)
images = {key: Image.open(root / source["file"]).convert("RGBA") for key, source in data["sources"].items()}
font_path = Path("C:/Windows/Fonts/msyh.ttc")
font = ImageFont.truetype(str(font_path), 13) if font_path.is_file() else ImageFont.load_default()

def color(text, alpha):
    text = text.lstrip("#")
    return tuple(int(text[i:i+2], 16) for i in (0, 2, 4)) + (round(max(0, min(1, alpha)) * 255),)

base = Image.new("RGB", (data["width"], data["height"]), "#172030")
draw = ImageDraw.Draw(base)
cw, ch = data["cell"]
for i, card in enumerate(data["cards"]):
    x, y = i % data["cols"] * cw, i // data["cols"] * ch
    draw.rectangle((x, y, x+cw-1, y+ch-1), outline="#36445d")
    draw.text((x+8, y+4), card[1], font=font, fill="#d5deef")

def paint_commands(frame, commands):
    pen = ImageDraw.Draw(frame, "RGBA")
    for command in commands:
        op = command[0]
        if op == "body":
            _, key, index, x, y, scale = command
            source = data["sources"][key]
            if "frames" in source:
                rect = source["frames"][index]["frame"]
                sx, sy, w, h = rect["x"], rect["y"], rect["w"], rect["h"]
            else:
                w = h = source["size"]
                sx, sy = int(index) * w, 0
            sprite = images[key].crop((sx, sy, sx+w, sy+h))
            sprite = sprite.resize((w*scale, h*scale), Image.Resampling.NEAREST)
            frame.paste(sprite, (round(x-sprite.width/2), round(y-sprite.height/2)), sprite)
        elif op == "rect":
            _, x, y, w, h, fill, alpha = command
            pen.rectangle((round(x), round(y), round(x+w)-1, round(y+h)-1), fill=color(fill, alpha))
        elif op == "line":
            _, pts, width, fill, alpha = command
            points = [(round(pts[i]), round(pts[i+1])) for i in range(0, len(pts), 2)]
            pen.line(points, fill=color(fill, alpha), width=max(1, round(width)))
        elif op == "polygon":
            _, pts, fill, alpha = command
            pen.polygon([(round(pts[i]), round(pts[i+1])) for i in range(0, len(pts), 2)], fill=color(fill, alpha))
        else:
            raise ValueError(f"Unknown production draw command: {op}")
    return frame

result = []
for cards in data["frames"]:
    frame = base.copy()
    for i, commands in enumerate(cards):
        x, y = i % data["cols"] * cw, i // data["cols"] * ch
        bounds = (x, y, x+cw, y+ch)
        tile = paint_commands(base.crop(bounds), commands)
        tile.paste(base.crop((x, y, x+cw, y+22)), (0, 0))
        frame.paste(tile, (x, y))
    result.append(frame)

result[24].save(out / "contact-sheet.png")
indexed = [frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=192, dither=Image.Dither.NONE) for frame in result]
indexed[0].save(out / "all-attacks.gif", save_all=True, append_images=indexed[1:], duration=60, loop=0, disposal=2, optimize=False)
print(f"Exported {len(result)} frames / {len(data['cards'])} attack demonstrations to {out}")
