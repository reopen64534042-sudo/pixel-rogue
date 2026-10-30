# 居合回旋斩 VFX 素材

冰蓝色 360° 居合回旋斩：三道不对称月牙围绕透明中心展开，经过成环、亮度峰值、分离与碎片消散，共 10 帧。已接入场景资源加载，并提供可直接调用的 `PixelPainter` 绘制接口和标准 Phaser 图集；技能触发与伤害判定由招式实现控制。

## 文件与规格

| 文件 | 用途 |
| --- | --- |
| `public/assets/vfx/iai-spin-slash-64x64-10f.png` | 320×128 透明精灵表，5 列 × 2 行，每帧 64×64 |
| `public/assets/vfx/iai-spin-slash-64x64-10f.json` | 帧坐标、中心锚点、建议播放速度、来源、后处理参数与校验结果 |
| `public/assets/vfx/iai-spin-slash-64x64-10f.atlas.json` | 标准 Phaser / TexturePacker JSON Hash 图集，可直接交给 `load.atlas` |
| `src/game/rendering/vfx/iaiSpinSlash.ts` | 几何常量、纹理注册与按模拟进度绘制的接入接口 |
| `assets/vfx/iai-spin-slash-source.png` | 内置 `image_gen` 生成原图，仅作来源存档；不是四色运行资源 |
| `assets/vfx/iai-spin-slash-prompt.txt` | 所选原图对应的完整生成提示词 |
| `assets/vfx/iai-spin-slash-contact-sheet.png` | 透明底、最近邻 4× 放大的 5×2 检查图 |
| `assets/vfx/iai-spin-slash-preview.gif` | 深色底、每帧 60 ms 的放慢循环预览，不作为运行资源 |

帧按从左到右、从上到下编号 0–9；无间距、无边距。所有帧保持完整正方形画布，以 `(32, 32)` 为共同锚点，归一化 origin 为 `(0.5, 0.5)`。后处理对整张表使用同一套坐标映射，不逐帧按内容包围盒裁切、缩放或重新居中，保留同一圆环占位。

PNG 的不透明像素严格限定为 `#1a5f9e`、`#57e6ff`、`#d8f7ff`、`#ffffff`，alpha 只有 0 和 255；没有半透明边缘、背景色、棋盘格、标号或网格线。透明区的 RGB 值不计入色板。

## 来源与处理

风格参考为现有 `public/assets/vfx/taidao-slash-32x32-10f.png`，保留原素材。用户附带的伤害数字截图只作上下文，没有复制其中的 UI 或文字。

使用内置 `image_gen` 整表生成。初始提示词按 32×32 逻辑网格描述，但检查后发现 32×32 后处理会丢掉细尾和末帧火星，因此最终选用 64×64 单帧。所选源图实际尺寸为 1983×793；按像素中心最近邻采样为 320×128，alpha 小于 128 的像素归零，其余像素置为 255，再按 RGB 平方距离映射至指定四色，不抖色。未修改项目公共色板，也没有使用会逐帧重定尺寸的单图处理流程。

生成工具没有返回可记录的模型版本或 seed，元数据以 `null` 明示；完整提示词、原图及源文件和成品的 SHA-256 均已保留。元数据同时记录了风格参考图的 SHA-256。

## 本项目直接接入

`GameScene.create()` 已调用 `loadIaiSpinSlash()`，沿用现有 `loadImageElement()` 解码方式，随后由 `registerIaiSpinSlash()` 按行切取 10 个帧纹理。纹理名为 `iai-spin-slash-0` 至 `iai-spin-slash-9`，重复注册会复用已存在的纹理。源图尺寸不符或 Canvas 创建失败会报错；场景捕获非关键素材加载异常并在 DEV 下告警，绘制接口在纹理未就绪时返回 `false`。异步解码完成时场景已停止则不注册。

在 `src/game/rendering/draw.ts` 中目标招式对应的表现分支导入并调用：

```ts
import { drawIaiSpinSlash } from "./vfx/iaiSpinSlash";

// s.x / s.y 为特效中心，s.life / s.max 为模拟持有的剩余/初始寿命。
const drawn = drawIaiSpinSlash(ctx, s.x, s.y, 1 - s.life / s.max);
// drawn === false 时可继续执行原有程序化表现作为回退。
```

| 参数 / 返回值 | 约定 |
| --- | --- |
| `ctx` | 现有 `PixelPainter`，在正常 `begin()` / `draw()` 帧流程中调用 |
| `centerX`, `centerY` | 世界坐标；360° 刀光以该位置为中心，内部取整，不施加旧普通刀光的前方 22px 偏移 |
| `progress` | 已播放比例，范围 `[0, 1)`；0 为第 1 帧，0.9–小于 1 为第 10 帧 |
| `true` | 当前帧已绘制 |
| `false` | 纹理未加载、坐标或进度非有限数、进度小于 0 或大于等于 1，未绘制 |

绘制默认保持 64×64 原生大小、中心 origin、旋转 0，不额外按寿命放大或淡出；显现与碎裂已烘焙在帧中。接口新增可选 `scale`（默认 1），游戏内 L3 使用 **2× 整数放大**：素材原环外半径约 29px，2× 后约 58px，外缘对齐 52px 命中半径。函数临时使用 alpha 1，结束后恢复调用前的 `globalAlpha`，不会影响后续绘制。

寿命由调用方的模拟状态维护，暂停时保持 `progress` 不变，过期时停止调用并移除对应特效记录。接口不创建独立定时器、RAF、Phaser 动画或新监听，复用 `PixelPainter.spriteRot()` 图片池，不会自行跨越暂停或重开继续播放。可导入 `IAI_SPIN_SLASH.durationSeconds`（`10 / 60` 秒）作为建议初始寿命，也可按招式实际寿命传进度。

加载与绘制接口已就绪，现已接入「居合·极」L3 的 360° 旋斩：`WarriorSystem` 在 L3 旋斩时给刀光打 `spin` 标记，`draw.ts` 以玩家中心调用 `drawIaiSpinSlash(..., 2)`。普通太刀与居合 L1/L2 仍使用原来的顺/逆时针单向刀光；伤害、击退、命中范围、冷却与触发条件均未改变。

## 标准 Phaser 图集接入

在其他直接使用 Phaser Image/Sprite 的场景中，可在 `preload()` 调用：

```ts
this.load.atlas(
  "iai-spin-slash",
  "assets/vfx/iai-spin-slash-64x64-10f.png",
  "assets/vfx/iai-spin-slash-64x64-10f.atlas.json",
);
```

加载后以 `this.add.image(x, y, "iai-spin-slash", "iai-spin-slash-0").setOrigin(0.5)` 创建一次，再按模拟进度用 `setFrame("iai-spin-slash-" + frame)` 切换 0–9 帧，过期后隐藏或销毁。现有 `64x64-10f.json` 是来源与接入元数据，**不是** `load.atlas` 的输入；标准图集使用带 `.atlas.json` 的文件。资源 URL 相对站点入口解析，部署时保留 `assets/vfx/` 路径，WebGL 渲染保持最近邻过滤。

## 验证

60 fps / 约 167 ms 是沿用现有太刀动画的接入建议，未强制任何招式寿命。GIF 每帧 60 ms，仅用于慢放检查。

素材检查确认：320×128、10 个 64×64 帧、四色、二值 alpha、所有帧无不透明像素触及画布边界；第 5 帧白色像素最多，末帧保留 2 个火星像素。已经目视检查放大后的逐帧轮廓。游戏内速度、尺寸与玩家遮挡效果留待实际接入后确认。

接入模块通过 `npm run typecheck` 与 `npm run build`；构建保留超过 500 kB 的分包警告。未改变玩法、数值或既有测试断言，按项目规则未新增测试、未运行 Vitest / Playwright。编译与素材静态检查不代表游戏内招式效果验收；实际速度、尺寸与遮挡仍需在对应招式接入后确认。
