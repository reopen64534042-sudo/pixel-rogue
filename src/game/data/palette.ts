/**
 * 像素贴图调色板 —— 全项目唯一真源。
 *
 * 约束：
 * - 生成端（AI 模型）、后处理脚本、游戏内渲染都必须引用这一份数据。
 * - 禁止在别处另写一份 hex 表；`assets/palette.gpl` 由 `npm run palette:export` 生成。
 * - 改动后需重跑 `node scripts/gen-palette.mjs` 并同步 docs/art-assets.md 第 4 节。
 */
export interface PaletteEntry {
  /** 全局唯一键名，用于生成端与后处理引用 */
  key: string;
  /** #rrggbb 小写，必须能被 8-bit RGB 精确表示 */
  hex: string;
  /** 语义分组，用于导出 .gpl 与文档表格 */
  group: string;
  /** 用途说明，便于美术侧理解 */
  note: string;
}

/** 29 色 / 9 组。顺序即 .gpl 导出顺序。 */
export const PALETTE: readonly PaletteEntry[] = [
  { key: "ink0", hex: "#1a0a2a", group: "轮廓", note: "最深描边" },
  { key: "ink1", hex: "#22223a", group: "轮廓", note: "次级描边、眼窝" },
  { key: "ink2", hex: "#3a1a0a", group: "轮廓", note: "暖色系暗部" },
  { key: "white", hex: "#ffffff", group: "中性", note: "高光、受击反馈" },
  { key: "bone", hex: "#e8e8f0", group: "中性", note: "金属/骨白" },
  { key: "sand", hex: "#ffd9a0", group: "中性", note: "肤色" },
  { key: "steelLight", hex: "#c5c7cf", group: "中性", note: "导弹装甲亮面" },
  { key: "steelMid", hex: "#8b8f9a", group: "中性", note: "导弹装甲与烟尘" },
  { key: "steelDark", hex: "#4a5062", group: "中性", note: "导弹暗部与稀疏烟尘" },
  { key: "pGold", hex: "#f4a940", group: "玩家", note: "头盔" },
  { key: "pBlue", hex: "#3d6de0", group: "玩家", note: "披风" },
  { key: "pBlueDk", hex: "#1e3a8a", group: "玩家", note: "披风暗部" },
  { key: "pBrown", hex: "#5a3a20", group: "玩家", note: "靴" },
  { key: "slimeLite", hex: "#9dff9d", group: "史莱姆", note: "高光" },
  { key: "slimeMid", hex: "#4dd44d", group: "史莱姆", note: "主体" },
  { key: "slimeDark", hex: "#0a3d0a", group: "史莱姆", note: "暗部/眼" },
  { key: "psiPurple", hex: "#b05cff", group: "远程", note: "主体" },
  { key: "psiViolet", hex: "#8a5cff", group: "远程", note: "蝙蝠主体" },
  { key: "psiLime", hex: "#7dff5a", group: "远程", note: "荧光眼" },
  { key: "fireYellow", hex: "#ffe14a", group: "自爆", note: "引信" },
  { key: "fireOrange", hex: "#ff8c3a", group: "自爆", note: "主体" },
  { key: "fireDeep", hex: "#c2410c", group: "自爆", note: "暗部" },
  { key: "stoneRed", hex: "#c05050", group: "石魔", note: "主体" },
  { key: "stoneDark", hex: "#3a0d0d", group: "石魔", note: "暗部" },
  { key: "gold", hex: "#ffd24a", group: "石魔", note: "眼/纹样" },
  { key: "iceCyan", hex: "#57e6ff", group: "能量", note: "冰、护盾" },
  { key: "iceDeep", hex: "#1a9fd4", group: "能量", note: "宝石主体" },
  { key: "danger", hex: "#ff5b5b", group: "危险", note: "敌方血条、危险标记" },
  { key: "hpPink", hex: "#ff4d6d", group: "危险", note: "药水" },
];

/** key → hex 查询表。 */
export const PALETTE_HEX: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(PALETTE.map((entry) => [entry.key, entry.hex])),
);

/** 当前色板大小为硬性上限：后处理校验用它拦截模型溢色。 */
export const PALETTE_MAX_COLORS = PALETTE.length;
