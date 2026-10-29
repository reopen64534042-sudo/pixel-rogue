# 太刀刀光动画素材

这组素材使用用户选定的青白色月牙刀光制作。刀光是纯表现资源，不参与近战命中判定。当前只准备素材和接入参数；战士职业尚未接入时，不替换现有可变张角的程序化刀光。

## 文件

| 文件 | 用途 |
| --- | --- |
| `assets/vfx/taidao-slash-source.png` | 用户选定的原图，保留作美术源文件 |
| `public/assets/vfx/taidao-slash-32.png` | 32×32 透明底静帧 |
| `public/assets/vfx/taidao-slash-32x32-10f.png` | 横向 10 帧精灵表，整体 320×32 |
| `public/assets/vfx/taidao-slash-32x32-10f.json` | 帧宽、高、帧率、锚点与源图处理参数 |
| `assets/vfx/taidao-slash-preview.gif` | 放大、放慢后的循环预览；不作为游戏运行资源 |
| `assets/vfx/taidao-slash-contact-sheet.png` | 10 帧并排检查图；不作为游戏运行资源 |

源图居中裁成 1000×1000，最近邻缩至 32×32；小于 128 的 alpha 归零，其余像素归入项目已有的 `iceDeep`、`iceCyan`、`bone`、`white` 四色。精灵表所有帧共享同一个 32×32 画布和中心锚点，不发生逐帧位置跳动。

## 播放

- 60 fps、10 帧、播放一次，总长约 167 ms，与现有近战刀光默认 160 ms 接近。
- 第 0–1 帧从上往下显现，第 2–4 帧完整显示，第 5–9 帧逐步消失；透明度已经烘焙在 PNG 内，不需要叠加额外淡入淡出补间。
- PNG 是透明底；GIF 的深色背景只用于预览。GIF 每帧 50 ms，故意放慢以便检查。
- 游戏内按 1× 原生像素显示。需要放大时只用整数倍缩放，并保持最近邻采样。

Phaser 加载示例，适合在战士太刀挥砍的表现层接入：

```ts
preload() {
  this.load.spritesheet("taidao-slash", "assets/vfx/taidao-slash-32x32-10f.png", {
    frameWidth: 32,
    frameHeight: 32,
  });
}

create() {
  this.anims.create({
    key: "taidao-slash-play",
    frames: this.anims.generateFrameNumbers("taidao-slash", { start: 0, end: 9 }),
    frameRate: 60,
    repeat: 0,
  });
}

showTaidaoSlash(x: number, y: number, rotation: number) {
  const effect = this.add.sprite(x, y, "taidao-slash")
    .setOrigin(0.5, 0.5)
    .setRotation(rotation);
  effect.play("taidao-slash-play");
  effect.once("animationcomplete", () => effect.destroy());
}
```

原图朝向以 PNG 为准；接入时按太刀出手角度校准 `rotation` 的固定偏移。现有 `MeleeSystem` 的 `slashes` 还用于其他张角与全向表现，接入时应只为太刀使用这张固定形状的精灵表。
