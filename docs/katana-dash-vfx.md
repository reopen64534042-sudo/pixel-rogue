# 太刀「疾冲」动画（v123）

这组动画用于战士太刀的入场天赋「疾冲」。冲刺时，青白色月牙刃头在前方展开，后方跟随窄刃痕、两道气流和三段淡角色残影；冲刺结束时，刃头断成碎片，路径由起点向终点收缩消散。效果绘制在玩家下层，保留角色与脚下资源条的可读性。

## 本项目直接使用

本 PR 已完成资源加载、冲刺中与结束时的表现接线。合入后，选择「战士 → 太刀」、取得「疾冲」，使用冲刺键（默认空格）即可触发；不需要额外注册事件、修改素材清单或运行生成脚本。未取得疾冲时保留普通冲刺。

发布资源已放在 `public/assets/vfx/`，构建时自动复制到 `dist/assets/vfx/`；部署时保留该相对路径。原图、提示词、逐帧图和 GIF 放在 `assets/vfx/`，供美术维护，不需要运行时加载。没有新增依赖。

## 技能依据与时序

- 天赋归属以 `data/talents/warrior.ts` 为准：「疾冲」是太刀专属，大剑对应「跃击」。本次没有更改天赋归属。
- `PlayerSystem` 的普通冲刺为 0.16 秒；学习疾冲后距离额外 ×1.3。冲刺进行中，从 `warriorDashFromX/Y` 到当前玩家位置绘制，不预画完整目的地。
- `WarriorSystem.warriorDashDamage` 在结束帧，对起点到终点的线段结算一次路径伤害；当前配置为基准挥砍的 100%，命中口径为线段距离 ≤12px 加敌人半径。本次沿用所有规则。
- 冲刺中的前 5 帧形成刃头，后半程保持完整刃面。结束时使用后 5 帧，在路径寿命前 42%（约 0.176 秒）内碎裂；路径沿用现有 0.42 秒寿命。
- 活动路径和结束路径分别读取真实坐标及已有模拟进度。暂停、属性面板冻结时不推进；重开沿用现有冲刺起点和 `warriorQi` 的重置。没有额外 RAF、定时器或 tween。

## 交付文件

| 路径 | 内容 |
| --- | --- |
| `public/assets/vfx/katana-dash-32x32-10f.png` | 160×64 透明精灵表，5×2 共 10 帧，单帧 32×32 |
| 同名 `.json` | 帧坐标、锚点、分段时序、来源、处理参数、像素统计与 SHA-256 |
| 同名 `.atlas.json` | 标准 Phaser / TexturePacker JSON Hash 图集 |
| `assets/vfx/katana-dash-source.png` | 内置 image_gen 生成原图，仅供美术维护 |
| `assets/vfx/katana-dash-prompt.txt` | 原图的完整生成提示词 |
| `assets/vfx/katana-dash-contact-sheet.png` | 透明底、最近邻 5× 放大逐帧图 |
| `assets/vfx/katana-dash-preview.gif` | 横向与斜向慢放演示，包含移动和结束消散；不是实机录像 |
| `assets/vfx/katana-dash-preview-still.png` | 慢放演示的突进峰值静帧 |
| `scripts/build-katana-dash-vfx.mjs` | 从原图重建运行资源、元数据、图集和逐帧图 |
| `scripts/preview-katana-dash-vfx.mjs` | 复用实际绘制函数，用离线像素绘制器重建 GIF 与静帧 |

源图通过内置 `image_gen` 生成。工具没有返回模型版本与 seed，元数据明确记为 `null`。整表共用一个采样网格与中心锚点 `(16,16)`，不逐帧裁切或重定中心。最近邻缩小、alpha 128 阈值和 RGB 平方距离量化后，运行 PNG 只含 `#1a5f9e`、`#57e6ff`、`#d8f7ff`、`#ffffff` 四色，alpha 仅为 0 / 255。没有修改公共调色板或普通挥砍素材。

## 游戏接入

`GameScene.create()` 异步加载精灵表，`registerKatanaDash()` 校验尺寸后注册 `katana-dash-0` 至 `katana-dash-9`。重复注册复用纹理；解码完成时场景已停止则不注册。加载失败在 DEV 下告警，绘制退回程序化前向弧，路径仍可读。

`draw.ts` 只在太刀学习疾冲后的实际冲刺中增加表现，并用 `warriorQi` 里的 `kind: "dash"` 记录播放结束效果。普通冲刺、普通挥砍、居合、剑气和跃击沿用各自逻辑。

```ts
import { drawKatanaDash } from "./vfx/katanaDash";

drawKatanaDash(ctx, {
  x1: fromX, y1: fromY,
  x2: toX, y2: toY,
  phase: "release", // 冲刺过程中用 "rush"
  progress: 1 - remaining / lifetime,
});
```

`progress` 为当前阶段已播放比例 `[0,1)`。方向取实际线段的 `atan2`，八向与任意斜向共用一张表；刃头固定原生尺寸，只旋转，不随路径长度拉伸。路径从真实起点展开，撞墙造成的短距离不会被补成长走廊；零位移不画刀光。函数复用现有 `PixelPainter` 的图像与 Graphics 池，结束后恢复进入时的透明度和填充色。

| 输入 / 返回值 | 接入约定 |
| --- | --- |
| `x1 / y1` | 该次冲刺实际起点，整段播放保持固定 |
| `x2 / y2` | `rush` 阶段为玩家当前世界坐标，`release` 阶段为结算时固定终点 |
| `phase: "rush"` | 冲刺进行中；进度使用 `1 - player.dashT / KATANA_DASH.rushDurationSeconds` |
| `phase: "release"` | 冲刺结束后；进度使用已有 `warriorQi` 记录的 `1 - t / max` |
| `progress` | 阶段进度 `[0,1)`；暂停时保持不变；结束后停止调用 |
| 返回 `true` | 已绘制当前帧，包含资源未就绪时的程序化回退，不要再叠画旧路径 |
| 返回 `false` | 坐标/进度无效、进度超出范围，或线段短于 0.5px；没有绘制 |

本项目已在原来的 `warriorQi` 绘制分支跳过太刀疾冲，避免重复叠画旧版光束。其他采用 `PixelPainter` 的场景可在图像解码且场景仍活动时调用 `registerKatanaDash(textures, image)`，随后复用以上绘制接口。切场景与重开时由调用方清理对应的起点和寿命记录。

## 标准 Phaser 图集接入

不使用 `PixelPainter` 时，可直接加载标准图集：

```ts
preload() {
  this.load.atlas(
    "katana-dash",
    "assets/vfx/katana-dash-32x32-10f.png",
    "assets/vfx/katana-dash-32x32-10f.atlas.json",
  );
}
```

为存活刀光创建或复用一个 Phaser Image，以下代码按同一阶段进度选择刃头帧；可变长度路径另按实际起终点绘制，不要把 32×32 刃头拉伸成整条路径。

```ts
const release = phase === "release";
if (progress < 0 || progress >= 1 || (release && progress >= 0.42)) {
  view.setVisible(false);
} else {
  const frame = release
    ? 5 + Math.min(4, Math.floor(progress / 0.42 * 5))
    : Math.min(4, Math.floor(progress * 8));
  view.setTexture("katana-dash", `katana-dash-${frame}`)
    .setOrigin(0.5)
    .setPosition(Math.round(toX), Math.round(toY))
    .setRotation(Math.atan2(toY - fromY, toX - fromX))
    .setScale(1)
    .setAlpha(1)
    .setVisible(true);
}
```

保持最近邻采样，暂停时冻结调用方模拟进度，结束后隐藏或回收 Image。不带 `.atlas` 的 JSON 是来源和时序记录，不是 `load.atlas` 输入。

## 重建与验证边界

```powershell
node scripts/build-katana-dash-vfx.mjs
node scripts/preview-katana-dash-vfx.mjs
```

不新增依赖。运行资源可直接发布，无须在启动游戏前执行脚本。预览脚本复用项目现有 TypeScript 编译器导入实际表现函数，再离线绘制为 GIF；GIF 每帧 50ms，刻意放慢用于观察，并未启动浏览器或游戏。

本次执行 `npm run typecheck` 与 `npm run build`，并静态检查素材尺寸、二值 alpha、色板、边界、逐帧像素与 GIF 解码。按项目 2026-10-29 标准，不新增或修改测试，不运行 Vitest / Playwright。编译通过和离线预览不代表实机玩法验收，战斗中的遮挡、速度与手感留待实际试玩确认。
