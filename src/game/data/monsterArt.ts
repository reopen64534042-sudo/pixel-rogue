/** Editable native pixel originals. Color symbols reference the shared palette, never a second hex table. */
export const MONSTER_ART: Record<string, { size: number; rows: string[]; colors: Record<string, string> }> = {
  slime: { size: 16, colors: { k: "slimeDark", d: "slimeDark", m: "slimeMid", h: "slimeLite", w: "bone" }, rows: [
    ".....kkkkkk.....", "...kkhhhhmmkk...", "..khhhmmmmmmmk..", ".khhwmmmmmmmmmk.", ".khhmmmmmmmmmmk.",
    "khmmmmmmmmmmmmmk", "kmmkkmmmmkkmmmmk", "kmmkwmmmmkwmmmmk", "kmmmmmmmmmmmmmmk", "kmmmmmkmmmmmmmmk",
    ".kmmmmddddmmmmk.", ".kkmddddddddmkk.", "..kkkkkkkkkkkk..",
  ] },
  bat: { size: 16, colors: { k: "ink0", d: "pBlueDk", m: "psiViolet", h: "psiPurple", e: "danger", w: "bone" }, rows: [
    ".....k....k.....", "k...kmk..kmk...k", "kk..khmkkmhk..kk", "kmkkhmmmmmmhkkmk", "kmhhmmmmmmmmhhmk",
    "kmmmmmekkemmmmmk", ".kmmdmwwwwmdmmk.", "..kdkmmmmmmkdk..", "...k.kmmmmk.k...", "......kkkk......",
  ] },
  shooter: { size: 16, colors: { k: "ink0", d: "pBlueDk", m: "psiPurple", h: "psiViolet", g: "psiLime", w: "bone" }, rows: [
    "..k........k..", ".kmk......kmk.", ".khmk....kmhk.", "..khhkkkkhhk..", ".khhmmmmmmhhk.",
    "khmmkkkkkkmmhk", "kmmkggggggkmmk", "kmkggkwkgggkmk", "kmkggkkkgggkmk", "kmmkggggggkmmk",
    ".kmmkkkkkkmmk.", "..kmmmmmmmmk..", "...kkdkkdkk...", "....k....k....",
  ] },
  bomber: { size: 16, colors: { k: "stoneDark", d: "fireDeep", m: "fireOrange", h: "fireYellow", e: "ink0" }, rows: [
    ".......h......", "......hmh.....", "......k.......", "...kkkdkdkk...",
    "..kdmmhmmdk...", ".kdmmhhhmmdk..", "kdmmhmmmhmmmk.", "kdmmhmmmhmmmk.", "kdmmmmmmmmmmdk",
    "kdmmeemmeemmdk", ".kdmmmmmmmmdk.", "..kkdmmmmdkk..", ".kk..kkkk..kk.", ".k..........k.",
  ] },
  brute: { size: 16, colors: { k: "slimeDark", d: "slimeDark", m: "slimeMid", h: "slimeLite", e: "gold" }, rows: [
    "....kkkkkk....", "...khhmmmmk...", "..khhmmmmmmk..", "..khemmdmekk..", "..kmmmmmmmmk..",
    ".kkkmmddmmkkk.", "khmmkmmmmkmmmk", "khmmmdmmmdmmmk", "kmmmmdmmmdmmmk", "kmmkmmmmmmkmmk",
    ".kkkmddddmkkk.", "...kmmkkmmk...", "...kmmkkmmk...", "..kdddkkdddk..", "..kkkk..kkkk..",
  ] },
  splitter: { size: 16, colors: { k: "slimeDark", m: "slimeMid", h: "slimeLite", c: "iceCyan", e: "ink0" }, rows: [
    "..kkkk..kkkk..", ".khhmmkkhhmmk.", "khhmmmmhhmmmmk", "khmmmmmmmmmmmk", "kmmecmmecmmmmk",
    "kmmccmmccmmmmk", "kmmmmkkmmmmmmk", "kmmmkhhkmmmmmk", ".kmkmmmmkmmmk.", "..kkk..kkkkk..", "...k....kk....",
  ] },
  splitling: { size: 16, colors: { k: "slimeDark", m: "slimeMid", h: "slimeLite", c: "iceCyan" }, rows: [
    "..kkkk..", ".khhmmk.", "khhmmmmk", "kmkmmkmk", "kmmccmmk", ".kmmmmk.", "..kkkk..",
  ] },
  charger: { size: 16, colors: { k: "stoneDark", d: "fireDeep", m: "stoneRed", h: "fireOrange", e: "gold", w: "bone" }, rows: [
    "......w.......", ".....kwk......", ".....kwwk.....", "...kkmwwmkk...", "..khmmmmmmmk..", ".khmmmmmmmmmk.",
    "khmmemmdmemmmk", "kmmmmmmmmmmmmk", "kmmkmmmmmmkmmk", "kmmkmmddmmkmmk", ".kkkmmmmmmkkk.",
    "..kmkmmmkmk...", "..kmk...kmk...", "..kkk...kkk...",
  ] },
  drummer: { size: 16, colors: { k: "ink0", d: "pBlueDk", m: "psiPurple", h: "psiViolet", g: "gold", w: "bone", e: "psiLime" }, rows: [
    ".....kkk......", "....khmmk.....", "...khmmmmk....", "w..kekkek..w..", "kw.kmmmmk.wk..", "kmkkmmmkkkmk..",
    "kmhkkgggkkmk..", ".kmkgwwwgkmk..", "..kgwgggwgk...", "..kgwgggwgk...", "..kkgwwwgkk...",
    "..kmmgggmhk...", "...kmmhmmk....", "...kk..kk.....",
  ] },
  spinner: { size: 16, colors: { k: "ink0", d: "pBlueDk", m: "psiViolet", h: "psiPurple", e: "iceCyan" }, rows: [
    "k..k....k..k", "km..k..k..mk", ".kmkkkkkkmk.", "..khhmmmkk..", "kkkhhmmmmkkk", "kmkhhmmmkmkk",
    "..kmmmmmmk..", ".kkmeememkk.", "kmkkmmmmkkmk", "k..kkkkkk..k", "..kmk..kmk..", "..k......k..",
  ] },
  burrower: { size: 16, colors: { k: "ink2", d: "pBrown", m: "stoneRed", h: "sand", w: "bone", e: "gold" }, rows: [
    "....kkkkkk....", "...khmmmmdk...", "..khmmkmmmdk..", ".khmmmkmmmmdk.", ".kmmmdkdmmdmk.",
    "kkmmdkkkdmmdkk", "kwkmemmmemkmwk", "kwwkmmmmmkwwk", "kwkkkmmmkkkwwk",
    ".kwk.kkkk.kwk.", "..wk......kw..", "..w........w..",
  ] },
  lobber: { size: 16, colors: { k: "ink0", d: "fireDeep", m: "fireOrange", h: "fireYellow", b: "pBrown", e: "gold" }, rows: [
    ".....kkkk.....", "...kkddmdkk...", "..kdmhhhmdk...", ".kdmhhhhhmdk..", ".kmmhhhhhmmk..", "kddmhhhhhmmddk",
    "kddmmhhhmmdddk", ".kddmmhmmdddk.", "kbkkddmddkkbbk", "kbbkbbbbbkbbbk", ".kkbbebebbbkk.",
    "kbkkbbbbbbkkbk", "kk..kkkkkk..kk", ".k..........k.",
  ] },
  bulwark: { size: 16, colors: { k: "ink0", d: "pBlueDk", m: "iceDeep", h: "iceCyan", w: "bone", e: "gold" }, rows: [
    "....kkkkkk....", "...kmmddmdk...", "..kmmdkkdmdk..", ".kdmdkmmkdmdk.", "kdkddkmmkddkdk", "kdkhmhmmhmhkdk",
    ".kkhwhmmhwhkk.", "kkhwwhhwwwwhkk", "kmhwhwwwwhwhmk", "kmhhwwwwwwhhmk", ".kkhhwwwwhhkk.",
    "kdkkhhwwhhkkdk", "kk..khhhhk..kk", ".k..kekkek..k.", ".....kkkk.....",
  ] },
  tether: { size: 16, colors: { k: "ink0", d: "pBlueDk", m: "psiViolet", h: "psiPurple", c: "iceCyan", w: "bone" }, rows: [
    "....kkkkkk....", "...khhhcmmk...", "..khhmmccmmk..", ".khwmmmccmmmk.", "khhmmmcmmmmmmk", "kmmmccmmmmmmmk",
    ".kmmmccmmmmmk.", "..kkckkkkckk..", "...kc....ck...", "..kc..kc..ck..", "..ck..ck..kc..",
    "...kc..kc..ck.", "..kc..ck..kc..", "..ck...kc..ck.", "...k....k...k.",
  ] },
  brute_elite: { size: 24, colors: { k: "stoneDark", d: "pBrown", m: "steelDark", h: "steelMid", f: "fireOrange", g: "gold", w: "fireYellow" }, rows: [
    "......kkkkkkkk......", "....kkhhmmmmhhkk....", "...khhmmmmmmmmhhk...", "..khhmmkmmmmkmmmhhk..",
    ".kkmmmggmmmmggmmmkk.", "khhkkmmmmmmmmmmkkhhk", "khmmmmkkffffkkmmmmhk", "kmmmmmkfwffwkmmmmmmk",
    "kmmmkmkfffffkmkmmmmk", "kmmmkmkkfffkkmkmmmmk", "kmmmkmmkffkmmmkmmmmk", "kmmmkmmkffkmmmkmmmmk",
    ".kkkkmmkfkkmmmfkkkk.", "....kmmkfkkmmmfk....", "....kmmkfkkmmmfk....", "....kmmkk..kkmmk....",
    "...kdddmk..kmdddk...", "...kkkkkk..kkkkkk...",
  ] },
  shooter_elite: { size: 24, colors: { k: "ink0", d: "pBlueDk", m: "psiPurple", h: "psiViolet", w: "bone", g: "psiLime", e: "slimeDark" }, rows: [
    ".........kk.........", "....k...khhk...k....", "...kmk..khhk..kmk...", "..khmk..khhk..kmhk..", ".khhmmkkmmmmkkmmhhk.",
    "..khhmmmmmmmmmmhhk..", ".khmmkkkkkkkkmmmhk..", "khmkkwwggggwwkkmmhk.", "kmkwwwggggggwwwkmmk.",
    "kmkwwggeekggwwwkmmk.", "kmkwwggeekggwwwkmmk.", "kmkwwggeekggwwwkmmk.", "kmkwwwggggggwwwkmmk.",
    ".kmkkwwggggwwkkmmk..", "..kmmkkkkkkkkmmmk...", "...kkmmmmmmmmkkk....", "..khmkkmkkmkkmhk....", ".khmk.kmk.kmk.kmhk..",
    ".kmk..kmk.kmk..kmk..", "..kk...kk..kk..kk...",
  ] },
  drummer_elite: { size: 24, colors: { k: "ink0", d: "steelDark", m: "stoneDark", h: "stoneRed", g: "gold", w: "bone", e: "gold", r: "danger" }, rows: [
    "......g......g......", ".....kgg....ggk.....", ".....kggk..kggk.....", "......kggkkggk......", "......kgghhggk......",
    ".....khhgggmmhk.....", "....khhmmmmmmmhk....", ".w..khmkekkekmhk..w.", ".kw.kmmkmmmmkmmk.wk.", "..kghmmkkggkkmmhgk..",
    ".khdmmkkggggkkmmdhk.", "khhddkgwwwwwwgkddhhk", "khddkgwwggggwwgkddhk", "kddkgwwggrrggwwgkddk", "kmmkgwwggrrggwwgkmmk",
    ".kkmkgwwggggwwgkmkk.", "..khmkgwwwwwwgkmhk..", "..kmmmkggggggkmmmk..", "...kmmmmkkkkmmmmk...", "....kmmmk..kmmmk....",
    "....kkkkk..kkkkk....",
  ] },
};

/** Center the visible pixels, matching pixelize.mjs without resampling native art. */
export function monsterArtRows(key: string): string[] {
  const { rows, size, colors } = MONSTER_ART[key];
  let minX = size, minY = size, maxX = -1, maxY = -1;
  rows.forEach((row, y) => [...row].forEach((pixel, x) => {
    if (pixel === ".") return;
    if (!(pixel in colors)) throw new Error(`Unknown monster pixel: ${key}/${pixel}`);
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }));
  const w = maxX - minX + 1, h = maxY - minY + 1;
  if (w > size || h > size || maxX < 0) throw new Error(`Invalid monster dimensions: ${key}`);
  const left = Math.floor((size - w) / 2), top = Math.floor((size - h) / 2);
  return Array.from({ length: size }, (_, y) => y < top || y >= top + h ? ".".repeat(size) :
    ".".repeat(left) + rows[y - top + minY].padEnd(maxX + 1, ".").slice(minX, maxX + 1) + ".".repeat(size - left - w));
}
