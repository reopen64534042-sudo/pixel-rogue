function makeSprite(map: string[], palette: Record<string, string>) {
  const h = map.length,
    w = map[0].length;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) throw new Error("Pixel texture context unavailable");
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = map[y][x];
      if (ch === "." || ch === " ") continue;
      g.fillStyle = palette[ch];
      g.fillRect(x, y, 1, 1);
    }
  return c;
}
export const SPR: Record<string, HTMLCanvasElement> = {};
SPR.player = makeSprite(
  [
    "  hhhh  ",
    " hhhhhh ",
    " heffeh ",
    " hhhhhh ",
    "  aaaa  ",
    " aaaaaa ",
    " aaaaaa ",
    "   aa   ",
    "  a  a  ",
    "  b  b  ",
  ],
  { h: "#f4a940", e: "#22223a", f: "#ffd9a0", a: "#3d6de0", b: "#5a3a20" },
);
SPR.slime = makeSprite(
  ["  ssss  ", " ssssss ", " skssks ", "ssssssss", "ssssssss", ".ssssss."],
  { s: "#4dd44d", k: "#0a3d0a" },
);
SPR.bat = makeSprite(
  ["b......b", "bb....bb", "bbbbbbbb", ".brbbrb.", "..bbbb..", "........"],
  { b: "#8a5cff", r: "#ff5b5b" },
);
SPR.shooter = makeSprite(
  ["p......p", "pp....pp", "pppppppp", ".pgkkgp.", "..pppp.."],
  { p: "#b05cff", g: "#7dff5a", k: "#1a0a2a" },
);
SPR.bomber = makeSprite(
  [
    "..oooo..",
    ".oooooo.",
    "ookookoo",
    "oooooooo",
    "oooooooo",
    ".oooooo.",
    "..o..o..",
  ],
  { o: "#ff8c3a", k: "#3a1a0a" },
);
SPR.brute = makeSprite(
  [
    "..gggggg..",
    ".gggggggg.",
    ".gykggkyg.",
    ".gggggggg.",
    "..gggggg..",
    ".gggggggg.",
    "gggggggggg",
    "gggggggggg",
    "g.gggggg.g",
    "..gg..gg..",
    "..gg..gg..",
    ".gg....gg.",
  ],
  { g: "#c05050", y: "#ffe14a", k: "#3a0d0d" },
);
SPR.gem = makeSprite([".ggg.", "gGGGg", "gGGGg", ".gGg.", "..g.."], {
  g: "#1a9fd4",
  G: "#7deeff",
});
SPR.gemE = makeSprite([".yyy.", "yYYYy", "yYYYy", ".yYy.", "..y.."], {
  y: "#ffd24a",
  Y: "#fff3b0",
});
SPR.potion = makeSprite([".www.", "w...w", "wrrrw", "wrrrw", ".rrr."], {
  w: "#e8e8f0",
  r: "#ff4d6d",
});
