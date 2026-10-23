import type { GameCore } from "./GameCore";

export function updateEffects(this: GameCore, dt: number) {
  // ---- 粒子 / 飘字 / 闪电 ----
  for (let i = this.parts.length - 1; i >= 0; i--) {
    const q = this.parts[i];
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.life -= dt;
    if (q.life <= 0) this.parts.splice(i, 1);
  }
  for (let i = this.texts.length - 1; i >= 0; i--) {
    const t = this.texts[i];
    t.y += t.vy * dt;
    t.life -= dt;
    if (t.life <= 0) this.texts.splice(i, 1);
  }
  for (let i = this.bolts.length - 1; i >= 0; i--) {
    this.bolts[i].life -= dt;
    if (this.bolts[i].life <= 0) this.bolts.splice(i, 1);
  }

  this.shake = Math.max(0, this.shake - dt * 14);
  this.hurtFlash = Math.max(0, this.hurtFlash - dt);
}
