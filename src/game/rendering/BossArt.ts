import { BOSS_FX_ATLAS } from "./BossGeneratedAssets";
import type Phaser from "phaser";
import { BOSS_ATLAS, BOSS_PORTRAIT } from "./BossAnimation";
import { registerSprite } from "./assetRegistry";

export function preloadBossArt(scene: Phaser.Scene, baseUrl = import.meta.env.BASE_URL): void {
  const base = baseUrl.replace(/\/$/, "") + "/assets/";
  scene.load.atlas(BOSS_ATLAS, base + "boss-three/boss.atlas.png", base + "boss-three/boss.atlas.json");
  scene.load.atlas(BOSS_FX_ATLAS, base + "boss-three/boss-fx.atlas.png", base + "boss-three/boss-fx.atlas.json");
  scene.load.image(BOSS_PORTRAIT, base + "sprites/boss_three.png");
}

export function registerBossPortrait(scene: Phaser.Scene): void {
  if (!scene.textures.exists(BOSS_PORTRAIT)) return;
  const image = scene.textures.get(BOSS_PORTRAIT).getSourceImage();
  if (!(image instanceof HTMLImageElement)) return;
  const key = registerSprite("boss_three", image);
  if (!scene.textures.exists(key)) scene.textures.addImage(key, image);
}
