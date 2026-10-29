import { VIEW, WORLD, clamp } from "../data/constants";
import { updateAttacks } from "./AttackSystem";
import { updateEffects } from "./EffectsSystem";
import { updateEnemies } from "./EnemySystem";
import type { GameCore } from "./GameCore";
import { updateMageElements } from "./ElementSystem";
import { updateMageCasting } from "./MageSystem";
import { updateMelee } from "./MeleeSystem";
import { updatePlayer } from "./PlayerSystem";
import { updateProgression } from "./ProgressionSystem";
import { updateProjectiles } from "./ProjectileSystem";
import { updateWave } from "./WaveSystem";
/** Original update order is significant (projectiles → waves → AI → pickups). */
export function update(this: GameCore, dt: number) {
  this.time += dt;
  updatePlayer.call(this, dt);
  this.cam.x = clamp(this.player.x - VIEW.w / 2, 0, WORLD.w - VIEW.w);
  this.cam.y = clamp(this.player.y - VIEW.h / 2, 0, WORLD.h - VIEW.h);
  updateAttacks.call(this, dt);
  // S3 法师：施法状态机（射手路径直接返回）与元素印记推进。
  // 位置在自动攻击之后、弹丸之前——法阵伤害走 hurtEnemy，与弹丸伤害
  // 同属「本帧已结算的攻击」；元素 DoT 在这里推进，敌人死亡判定随后
  // 由 updateEnemies 的清理循环收掉（dead 标记）。
  updateMageCasting.call(this, dt);
  updateMageElements.call(this, dt);
  updateMelee.call(this, dt);
  if (updateProjectiles.call(this, dt)) return;
  updateWave.call(this, dt);
  if (updateEnemies.call(this, dt)) return;
  updateProgression.call(this, dt);
  updateEffects.call(this, dt);
}
