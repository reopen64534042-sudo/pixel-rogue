# 太刀刀光动画素材

这组素材使用用户选定的青白色月牙刀光制作。右侧原图为顺时针挥刀，左侧镜像图为逆时针挥刀；按攻击方向旋转对应的精灵表并把中心放在角色前方，播放一次后销毁。刀光是纯表现资源，不参与近战命中判定。当前只准备素材和接入参数；战士职业尚未接入时，不替换现有可变张角的程序化刀光。

## 文件

| 文件 | 用途 |
| --- | --- |
| `assets/vfx/taidao-slash-source.png` | 用户选定的原图，保留作美术源文件 |
| `public/assets/vfx/taidao-slash-32.png` / `taidao-slash-ccw-32.png` | 顺时针 / 逆时针 32×32 透明底静帧 |
| `public/assets/vfx/taidao-slash-32x32-10f.png` / `taidao-slash-ccw-32x32-10f.png` | 顺时针 / 逆时针横向 10 帧精灵表，各 320×32 |
| `public/assets/vfx/taidao-slash-32x32-10f.json` / `taidao-slash-ccw-32x32-10f.json` | 各自的帧参数、基准方向、旋转偏移与源图处理参数 |
| `assets/vfx/taidao-slash-preview.gif` / `taidao-slash-ccw-preview.gif` | 放大、放慢后的单方向循环预览；不作为游戏运行资源 |
| `assets/vfx/taidao-slash-contact-sheet.png` / `taidao-slash-ccw-contact-sheet.png` | 各方向 10 帧并排检查图；不作为游戏运行资源 |

源图居中裁成 1000×1000，最近邻缩至 32×32；小于 128 的 alpha 归零，其余像素归入项目已有的 `iceDeep`、`iceCyan`、`bone`、`white` 四色。逆时针图由顺时针的每帧水平镜像得到，沿顶部到下部的显现顺序保持不变，因此左侧出刀的运动方向相反。所有帧共享同一个 32×32 画布和中心锚点，不发生逐帧位置跳动。

## 播放

- 60 fps、10 帧、播放一次，总长约 167 ms，与现有近战刀光默认 160 ms 接近。
- 第 0–1 帧显现，第 2–4 帧完整显示，第 5–9 帧逐步消失；透明度已经烘焙在 PNG 内，不需要叠加额外淡入淡出补间。
- 顺时针图负责角色右半圆（`-π/2 ≤ angle < π/2`），基准方向为右侧 `0`；逆时针图负责左半圆（其余 180°），基准方向为左侧 `π`。`angle` 取屏幕坐标下的弧度角。正上归右半圆，正下归左半圆，边界不会同时选中两张图。
- 刀光中心为 `player + 22 × (cos(angle), sin(angle))`；顺时针精灵旋转 `angle`，逆时针精灵旋转 `angle - π`。月牙开口始终朝向角色。
- PNG 是透明底；GIF 的深色背景只用于预览。GIF 每帧 50 ms，故意放慢以便检查。
- 游戏内按 1× 原生像素显示。需要放大时只用整数倍缩放，并保持最近邻采样。

Phaser 加载示例，适合在战士太刀挥砍的表现层接入：

```ts
preload() {
  this.load.spritesheet("taidao-slash", "assets/vfx/taidao-slash-32x32-10f.png", {
    frameWidth: 32,
    frameHeight: 32,
  });
  this.load.spritesheet("taidao-slash-ccw", "assets/vfx/taidao-slash-ccw-32x32-10f.png", {
    frameWidth: 32,
    frameHeight: 32,
  });
}

create() {
  for (const key of ["taidao-slash", "taidao-slash-ccw"]) {
    this.anims.create({
      key: `${key}-play`,
      frames: this.anims.generateFrameNumbers(key, { start: 0, end: 9 }),
      frameRate: 60,
      repeat: 0,
    });
  }
}

showTaidaoSlash(playerX: number, playerY: number, attackAngle: number) {
  const angle = Math.atan2(Math.sin(attackAngle), Math.cos(attackAngle));
  const rightHalf = angle >= -Math.PI / 2 && angle < Math.PI / 2;
  const key = rightHalf ? "taidao-slash" : "taidao-slash-ccw";
  const baseAngle = rightHalf ? 0 : Math.PI;
  const x = Math.round(playerX + Math.cos(angle) * 22);
  const y = Math.round(playerY + Math.sin(angle) * 22);
  const effect = this.add.sprite(x, y, key)
    .setOrigin(0.5, 0.5)
    .setRotation(angle - baseAngle);
  effect.play(`${key}-play`);
  effect.once("animationcomplete", () => effect.destroy());
}
```

现有 `MeleeSystem` 的 `slashes` 还用于其他张角与全向表现，接入时应只为太刀使用这张固定形状的精灵表。浏览器临时预览位于被 Git 忽略的 `output/vfx-preview.html`，不属于交付素材。
