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
  ["..h..h..", "b.bbbb.b", "bbbbbbbb", ".brbbrb.", "..bbbb..", "........"],
  { h: "#e8e8f0", b: "#5c4dff", r: "#ff5b5b" },
);
SPR.shooter = makeSprite(
  ["p......p", "pp....pp", "pppppppp", ".pgkkgp.", "..pppp.."],
  { p: "#e04fd0", g: "#7dff5a", k: "#1a0a2a" },
);
/** 火囊虫：矮胖鼓胀轮廓 + 背部三道熔岩裂纹，与 slime 的圆球剪影区分 */
SPR.bomber = makeSprite(
  [
    "..rrrrrr..",
    ".rrrrrrrr.",
    "rtrrrrrrtr",
    "rtrrrrrrtr",
    "rkkrrrrkkr",
    "rrrrttrrrr",
    ".rrrrrrrr.",
    "..rr..rr..",
    ".rr....rr.",
  ],
  { r: "#b8332b", t: "#ff8a2b", k: "#1a0a0a" },
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
  { g: "#4dd44d", y: "#ffe14a", k: "#0a3d0a" },
);
/**
 * 精英·岩石巨兽：方形岩块 + 中部熔岩裂缝 + 不对称熔岩流（左 3 格主流、右 2 格渗漏且低一格）。
 * 配色与普通 brute 完全不同（岩石深棕 vs 浅绿），体型也更宽厚。
 */
SPR.brute_elite = makeSprite(
  [
    "....kkkkkkkk....",
    "..kkkkkkkkkkkk..",
    ".kkkkkkkkkkkkkk.",
    "kkkkkkkkkkkkkkkk",
    "kkkffkkkkkkffkkk",
    "kkkkkkkkkkkkkkkk",
    "kkkccmmnnmmcckkk",
    "kkkkkmkkkkkkkkkk",
    ".kkkkmkkkkjkkkk.",
    ".kkkkjkkkkjkkkk.",
    "..kkkk....kkkk..",
    "..kkkk....kkkk..",
    "..kkkk....kkkk..",
    "..dddd....dddd..",
  ],
  { k: "#4a2a2a", d: "#2a1616", f: "#ffd24a", m: "#ff6a2b", n: "#ffdd66", c: "#b83a12" },
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
/** 宝箱（#15）：木纹箱体 + 铁边 + 金色锁扣 */
SPR.box = makeSprite(
  [
    "..iiiiiiii..",
    ".iwwwwwwwwi.",
    ".iwddddddwi.",
    "iiwwwwwwwwii",
    "iwwwwffwwwwi",
    "iwwwwffwwwwi",
    "iwwddddddwwi",
    ".iwwwwwwwwi.",
    "..iiiiiiii..",
    "............",
  ],
  { i: "#c9cdd6", w: "#a8672f", d: "#6b3f19", f: "#ffc23d" },
);
