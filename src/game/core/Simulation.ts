import { VIEW, WORLD, clamp } from "../data/constants";
import { updateAttacks } from "./AttackSystem";
import { updateEffects } from "./EffectsSystem";
import { updateEnemies } from "./EnemySystem";
import type { GameCore } from "./GameCore";
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
  updateMelee.call(this, dt);
  if (updateProjectiles.call(this, dt)) return;
  updateWave.call(this, dt);
  if (updateEnemies.call(this, dt)) return;
  updateProgression.call(this, dt);
  updateEffects.call(this, dt);
}
