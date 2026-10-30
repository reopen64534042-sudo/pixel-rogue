# 大剑跃击落地 VFX · 美术指导意见（v128）

## 1. 这包素材要解决什么

当前跃击/三段斩第三段的「0.24s 起手渐隐 + 落点预警 + 玩家坠击」已由代码完成；缺的是一张**落地冲击**的正式 VFX 素材，替代现在程序化绘制的扩散环。

目标不是把特效做得比平 A 更粗、更亮，而是让玩家一眼看出：

- 这是从上方砸下来的**坠击**，不是横扫；
- 落点有明确的**地面压缩 + 低空尘环 + 裂纹**；
- 它仍然属于大剑的金白像素风格，不抢角色、不盖住落点中心。

**推荐只做落地冲击这一张表**（5×2、10 帧）。完整的角色腾空/下落动画需要玩家精灵状态和另一套动作管线，成本远高于 VFX；本轮先把「砸地」的可读性做出来。

## 2. 现有风格基线（必须遵守）

参考：`docs/greatsword-slash-vfx.md`、`docs/art-assets.md`。

- 运行时画布 480×270，像素密度 1:1；最近邻采样，不抗锯齿。
- 现有大剑刀光只使用金白五色：
  - `#9b4b16` 暗锈（暗部）
  - `#f4a940` 金橙（中段）
  - `#ffd24a` 亮金
  - `#ffe8a3` 浅金
  - `#ffffff` 白热
- alpha 只有 0 / 255；不要半透明边缘、渐变、发光模糊。
- 普通横扫是「横向宽刃月牙」，重斩是更厚的白热刃面。**跃击不能再靠加厚刃面来区分**，否则会和重斩抢重量。
- 素材需要是**全向可用**的：落地冲击不分左右，不能烘焙朝向；风格靠色板、像素质感、明暗层级和地面关系保持一致。

## 3. 美术方向：用「运动几何」区分，不用「加粗」区分

### 3.1 三句话原则

1. **平 A 是横向的弧，跃击是垂直落下后向地面摊开的环。**
2. **重量交给尘土、裂纹和地面压缩，不交给更厚的金色刃面。**
3. **中心留白**：玩家落地时角色在中心，VFX 不能把角色和落点提示糊掉。

### 3.2 结构建议

- **中心**：1–2px 白热点 + 很短的垂直余势（像刚砸下），不要画成大光球。
- **地面**：扁平的椭圆尘环 + 2–4 条向外分叉的暗锈裂纹；环要贴地，不能画成正面爆炸的圆。
- **外圈**：1–2px 的金色火星、碎屑、少量浅金颗粒向外抛；颗粒要有大小差，但不能比角色像素还大。
- **高度差**：中心白热、外圈暗锈/金橙，形成「中心热、外围脏」的层级；不要整张表都亮金。
- **负空间**：环与环之间留空，不要把圆环填满；玩家、怪物和落点十字必须能透出来。

### 3.3 明确不要做

- 不要做比平 A/重斩更粗的白色描边或大面积白闪。
- 不要做整屏金色爆炸、满屏粒子、粗黑烟柱。
- 不要做对称的厚圆环 + 中心大光球（会像廉价爆炸，不像大剑砸地）。
- 不要做写实烟雾/火焰；保持 1–2px 的像素碎屑和短裂纹。
- 不要烘焙左/右朝向；落点 VFX 必须 360° 可用。
- 不要在素材里画角色、武器、UI、文字、落点十字（十字和预警圈由代码绘制，保证命中范围准确）。

## 4. 建议帧序（5 列 × 2 行，共 10 帧）

| 帧 | 内容 | 可读性重点 |
| --- | --- | --- |
| 0 | 接触帧：中心 1–2px 白热点，地面 2–3 个暗锈小尘点 | 读作「刚砸到」 |
| 1 | 中心白热收紧，扁椭圆尘环出现，2 条短裂纹 | 地面开始受力 |
| 2 | 尘环扩大到约 1/3 半径，金橙碎屑抛出，裂纹分叉 | 冲击方向向外 |
| 3–4 | 尘环到约 2/3 半径，暗锈尘点散开，火星开始下落 | 环要扁、要低 |
| 5–6 | 环到最大半径（约 58–68px），中心白热明显减弱，裂纹最长 | 峰值，但不加厚 |
| 7–8 | 尘环碎裂成 1–2px 颗粒，金色余烬上飘，裂纹变暗 | 收尾，不拖泥带水 |
| 9 | 只剩少量暗锈尘点和 1–2 个火星，接近透明 | 方便循环/消失 |

节奏建议：前 3 帧快（落地冲击），中段 3 帧展开，后 4 帧衰减；不要全程等速。

## 5. 规格

| 项 | 建议值 |
| --- | --- |
| 布局 | 5 列 × 2 行，10 帧 |
| 单帧 | 144×144 px（与现有 heavy 表一致） |
| 总图 | 720×288 px |
| 锚点 | 单帧中心 (72,72)，归一化 origin (0.5,0.5) |
| 参考半径 | 约 67.5px（与 heavy 表一致；实际命中半径 58.5px，素材可略大） |
| 背景 | 透明 |
| alpha | 仅 0 / 255 |
| 色板 | 仅上述五色；不要新增灰蓝烟雾 |
| 输出 | 一张 5×2 PNG + 可选的逐帧检查图/慢放 GIF；源图另存 |

## 6. 给 GPT Image 的提示词（可直接发送）

```text
Create a top-down 3/4 pixel-art VFX sprite sheet for a heavy greatsword ground-slam landing.

Layout: exactly 5 columns x 2 rows = 10 frames, each frame 144x144 px, total image 720x288 px, transparent background. Frames read left-to-right, top-to-bottom. Each frame is centered on the impact point at (72,72); keep the impact point fixed in every frame. The effect must be omnidirectional and usable from any camera angle: no left/right facing, no directional bias.

Style: 1:1 pixel art at 480x270 game resolution, crisp nearest-neighbor pixels, no anti-aliasing, no gradients, no soft glow, no motion blur. Limited palette only: #9b4b16 dark rust, #f4a940 amber, #ffd24a gold, #ffe8a3 pale gold, #ffffff white-hot. Binary alpha only (fully opaque or fully transparent). Use 1px details and a clear value hierarchy.

Content: a greatsword leap landing impact, NOT a horizontal slash. Frame 0: a tiny 1-2px white-hot contact point at the center with 2-3 small dark-rust dust pixels on the ground. Frames 1-4: a low, flattened elliptical dust ring expands outward along the ground, short dark-rust ground cracks fork outward, small amber/gold debris and 2-4 sparks. Frames 5-7: the flat ring reaches its widest radius (about 58-68 px), the center white core shrinks, cracks are longest, dust breaks into 1-2px particles. Frames 8-9: residual dark-rust dust and 1-2 rising gold embers fade out; no full-screen flash.

Motion language: vertical drop -> ground compression -> wide, low radial shockwave. The weight comes from dust, cracks and ground contact, NOT from thick outlines or a big gold disc. Keep the center readable and leave negative space between rings and particles. The effect should look like a controlled, heavy ground slam, not a generic explosion.

Do NOT include: a character, a weapon, UI, text, a landing crosshair, a huge white flash, thick white outlines, a filled gold circle, thick smoke columns, realistic fire, or symmetrical cartoon explosion rings. Do not make the effect heavier or thicker than a normal greatsword slash; distinguish it through motion and ground interaction.
```

## 7. 接入与验收

- 按现有 `scripts/build-greatsword-vfx.mjs` 的同款流程处理：alpha 128 二值化、五色量化、中心锚点、共同径向包络、中心 4px 透明区（避免盖住玩家）。
- 运行时建议命名：`greatsword-leap-impact-144x144-10f.png`，texture prefix `greatsword-leap-impact-`。
- 绘制接口按 `Slash`/VFX 快照驱动，进度 = `1 - life / max`；不要新增独立 RAF 或定时器。
- 验收：
  - 1× 与 2× 放大都能读出「白热中心 → 扁尘环 → 裂纹/碎屑」。
  - 落点中心不遮挡玩家；环外缘与 58.5px 命中半径对齐。
  - 与现有 `greatsword-sweep`/`greatsword-heavy` 并排不出现风格断层。
  - 从四个方向看都不出现明显朝向错误（全向素材）。
  - 不出现半透明像素、溢色、超过五色的颜色。

## 8. 一句话给美术

「平 A 已经是厚金月牙；跃击不要再做一把更厚的金月牙。把它做成一次**从上方砸进地面的白热点 + 扁平尘环 + 暗锈裂纹**，中心留给角色，重量交给地面。」
