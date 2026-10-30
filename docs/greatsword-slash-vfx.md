# 大剑横扫与重斩动画（v120）

大剑使用金白色宽刃月牙，普通横扫从金色引刀、完整宽刃到碎屑消散；每第三下重斩切换为更厚的白热刃面与较大的金色碎屑。两组动画各 10 帧，5 列 × 2 行；另附左右镜像版本。已接入当前游戏的普通斩与重斩，不只是独立素材。

## 文件

| 路径 | 内容 |
| --- | --- |
| `public/assets/vfx/greatsword-sweep-96x96-10f.png` | 普通横扫，480×192，每帧 96×96 |
| `public/assets/vfx/greatsword-sweep-ccw-96x96-10f.png` | 普通横扫的逐帧水平镜像 |
| `public/assets/vfx/greatsword-heavy-144x144-10f.png` | 重斩，720×288，每帧 144×144 |
| `public/assets/vfx/greatsword-heavy-ccw-144x144-10f.png` | 重斩的逐帧水平镜像 |
| 同名 `.json` | 帧坐标、中心锚点、参考半径、色板、生成来源、处理参数及 SHA-256 |
| 同名 `.atlas.json` | 标准 Phaser / TexturePacker JSON Hash 图集 |
| `assets/vfx/greatsword-{sweep,heavy}-source.png` | 内置 image_gen 原图，各 1983×793，仅作源文件 |
| `assets/vfx/greatsword-{sweep,heavy}-prompt.txt` | 各自完整生成提示词 |
| `assets/vfx/greatsword-{sweep,heavy}-contact-sheet.png` | 透明底、最近邻 3× 放大检查图 |
| `assets/vfx/greatsword-combo-preview.gif` | 普通斩向右、普通斩向左、重斩向右的慢放展示，含玩家锚点标记；不是实机录像 |
| `scripts/build-greatsword-vfx.mjs` | 从保留原图重新生成运行 PNG、元数据及图集，不需要新增依赖 |
| `src/game/rendering/vfx/greatswordSlash.ts` | 运行时帧注册与绘制接口 |

## 美术与处理约定

- 风格参考为现有太刀刀光；普通斩由整张 10 帧表生成，重斩以普通斩原图为风格和形态参考另行整表生成。没有逐帧独立生成。
- 运行资源只含 `#9b4b16`、`#f4a940`、`#ffd24a`、`#ffe8a3`、`#ffffff`，alpha 只有 0 / 255；没有背景、抖色或半透明边缘。未修改公共调色板。
- 先以相同坐标映射采样各格到 64×64 逻辑画布，再执行 alpha 128 阈值与 RGB 平方距离量化；共同锚点周围预留 4 逻辑像素半径透明区，去除生成图落到玩家中心的碎屑。每组所有帧共用一个中心和径向包络缩放，不按单帧包围盒裁剪、缩放或重新居中。
- 普通斩最终锚点为 `(48,48)`，重斩为 `(72,72)`，归一化 origin 均为 `(0.5,0.5)`。包络分别控制在默认 45px / 67.5px 半径以内。装饰刀光不是命中蒙版，命中仍由原 130° 扇形与敌人身体半径决定。
- 默认攻击半径下以 1× 原生帧显示；后续射程加成按当前挥砍半径等比调整，继续使用游戏的最近邻采样，位置取整。不会随寿命额外膨胀刀光。
- 两组原图均通过内置 `image_gen` 生成；工具未返回模型版本与 seed，元数据明确记录为 `null`。提示词和源文件均保留，PNG 可通过 `node scripts/build-greatsword-vfx.mjs` 确定性重建。

## 游戏接入

`GameScene.create()` 异步加载 4 张表，`registerGreatswordSlash()` 校验尺寸并切取共 40 个独立帧纹理。纹理重复注册会复用；场景已停止时不注册。加载失败在 DEV 下告警，表现回退现有程序化同心弧。

`WarriorSystem.updateWarriorCombat()` 在已有第三下重斩判定处，把 `heavy: true` 透传给 `meleeSwing()`，随后保存在该次 `Slash` 记录。该字段只参与选图，不参与伤害、命中、范围、攻速或击退计算，也不会依赖后来变化的连击计数来回推本次动画。

`draw.ts` 对大剑调用 `drawGreatswordSlash(ctx, slash)`：进度为 `1 - life / max`，10 帧沿用现有 0.16 秒寿命；右半平面使用原表，左半平面使用镜像表，并相对 0 / π 基准方向旋转。锚点始终是本次出刀位置，无太刀的前方偏移。角度、半径与重斩状态均读取该次挥砍快照。

绘制接口只接管大剑标准扇形；跃击的 360° 刀光、其他旧近战卡、太刀和居合保留原有分支。剑气和斩浪路径继续使用原表现。纹理未就绪、数据无效或扇形不同则返回 `false`，继续绘制同心弧。绘制会恢复进入函数前的 alpha。

播放没有独立 RAF、定时器、Phaser tween 或动画监听，复用 `PixelPainter` 图片池；暂停和属性面板冻结模拟时帧号不推进，重开与清理沿用 `slashes` 生命周期。GIF 每帧 60ms，刻意慢放；游戏播放速度仍由模拟寿命控制。

## 本项目直接使用

合入本分支即可在「战士 → 大剑」的自动攻击中使用，无须再手动绑定事件、修改素材清单或运行生成脚本。`public/assets/vfx/` 中已包含可发布的最终资源；原图、提示词、GIF 和检查图只供美术维护，不需要运行时加载。

现有 `draw.ts` 已完成以下接线。其他使用同一绘制器的调用点可复用相同接口：

```ts
import { drawGreatswordSlash } from "./vfx/greatswordSlash";

// slash 来自本次攻击保存的 Slash 记录，ctx 是已开始本帧绘制的 PixelPainter。
if (slash.weapon === "greatsword" && drawGreatswordSlash(ctx, slash)) {
  // 当前帧已绘制，本次不再叠画程序化同心弧。
} else {
  // 沿用调用点原有的程序化近战表现。
}
```

| 输入 / 返回值 | 约定 |
| --- | --- |
| `slash.x / y` | 本次挥砍的世界坐标中心，不跟随后续玩家移动 |
| `slash.a` | 屏幕坐标方向弧度；0 向右，π/2 向下 |
| `slash.arc` | 当前大剑标准扇形；其他扇形返回 `false`，供原表现接管 |
| `slash.r` | 本次命中半径；默认普通 45px、重斩 67.5px |
| `slash.life / max` | 模拟持有的剩余 / 初始寿命；沿用 0.16 秒，不要另设动画时钟 |
| `slash.heavy` | 第三下重斩为 `true`；缺省为普通横扫 |
| `true` | 已画出本帧 |
| `false` | 资源未就绪、已过期、参数无效或扇形不匹配；应执行原表现回退 |

加载层只需使用本项目已有的 `GameScene.loadGreatswordSlashes()`。若迁入另一个使用 `PixelPainter` 的场景，可遍历 `GREATSWORD_SLASH_SHEETS`，分别解码 `sheet.image` 后调用 `registerGreatswordSlash(this.textures, image, sheet)`。必须在图像解码完成且场景仍活动时注册；重复调用会复用已存在的帧纹理。

## 标准 Phaser 图集使用

对不使用 `PixelPainter` 的 Phaser 项目，可直接消费标准 `.atlas.json`。下列 `preload()` 同时加载普通 / 重斩、右向 / 左向四张图集：

```ts
import { GREATSWORD_SLASH_SHEETS } from "./rendering/vfx/greatswordSlash";

preload() {
  for (const sheet of GREATSWORD_SLASH_SHEETS) {
    const key = sheet.prefix.slice(0, -1);
    this.load.atlas(key, sheet.image, sheet.image.replace(/\.png$/, ".atlas.json"));
  }
}
```

图集帧名为 `greatsword-sweep-0` 至 `greatsword-sweep-9`，另外三组依次为 `greatsword-sweep-ccw-*`、`greatsword-heavy-*`、`greatsword-heavy-ccw-*`。不带 `.atlas` 的 JSON 是来源与处理元数据，不能作为 `load.atlas` 输入。

为每个存活特效创建或复用一个 `Phaser.GameObjects.Image`，并在表现更新中按模拟进度设置帧：

```ts
// slash 是调用方维护的单次挥砍快照；view 是复用的 Phaser Image。
if (slash.life <= 0 || slash.max <= 0) {
  view.setVisible(false);
  return;
}
const angle = Math.atan2(Math.sin(slash.a), Math.cos(slash.a));
const rightHalf = angle >= -Math.PI / 2 && angle < Math.PI / 2;
const sheet = GREATSWORD_SLASH_SHEETS[(slash.heavy ? 2 : 0) + (rightHalf ? 0 : 1)];
const key = sheet.prefix.slice(0, -1);
const frame = Math.max(0, Math.min(9, Math.floor((1 - slash.life / slash.max) * 10)));
view.setTexture(key, `${sheet.prefix}${frame}`)
  .setOrigin(0.5)
  .setPosition(Math.round(slash.x), Math.round(slash.y))
  .setRotation(rightHalf ? angle : angle - Math.PI)
  .setScale(slash.r / sheet.radius)
  .setAlpha(1)
  .setVisible(true);
```

上例仅适用于大剑标准扇形，其他招式继续走其自身表现。项目配置需开启 `pixelArt: true` 或使用最近邻纹理过滤。过期后隐藏 / 回收特效，暂停时保持模拟进度不变，场景退出时由调用方统一销毁；部署时保留相对于站点入口的 `assets/vfx/` 路径。

## 验证边界

本次按项目约定执行 `npm run typecheck` 与 `npm run build`，并检查 PNG 的尺寸、色板、二值 alpha、镜像、边界、图集坐标与哈希，目视检查放大帧。没有新增或修改测试，没有运行 Vitest / Playwright，也未进行实机手感验收。

本次没有更改数值、伤害公式、命中扇形、RNG、重斩频率、冷却、震屏或既有招式的玩法行为；既有测试断言不需要因本次表现变更而更新。实际战斗中的尺寸、遮挡与高攻速观感仍需玩家确认。
