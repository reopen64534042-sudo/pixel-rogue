import { PALETTE_HEX as C } from "../../../data/palette";
import { MISSILE_VFX as FX } from "../../../data/missileVfx";
import type { MissileArcPose, MissileChargePose, MissileFlightPose, MissileImpactPose, MissileVfxCommand } from "./MissileVfxPlayer";

const TAU = Math.PI * 2;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
function line(out: MissileVfxCommand[], x: number, y: number, x2: number, y2: number, color: string, alpha: number, width = 1) {
  if (alpha <= 0) return;
  out.push({ kind: "line", x, y, x2, y2, color, alpha: Math.min(1, alpha), width });
}
function spark(out: MissileVfxCommand[], x: number, y: number, radius: number, alpha: number) {
  line(out, x - radius, y, x + radius, y, C.white, alpha);
  line(out, x, y - radius, x, y + radius, C.white, alpha);
}
/** Broken ring envelopes follow the authoritative burst radius and leave the center open. */
function ring(out: MissileVfxCommand[], x: number, y: number, radius: number, rotation: number,
  color: string, alpha: number, groups = 6) {
  if (radius <= 0 || alpha <= 0) return;
  for (let i = 0; i < groups; i++) {
    const start = rotation + i * TAU / groups, sweep = TAU / groups * 0.76;
    for (let n = 0; n < 3; n++) {
      const a = start + sweep * n / 3, b = start + sweep * (n + 1) / 3;
      line(out, Math.round(x + Math.cos(a) * radius), Math.round(y + Math.sin(a) * radius),
        Math.round(x + Math.cos(b) * radius), Math.round(y + Math.sin(b) * radius), color, alpha);
    }
  }
}

/** Compact electrical braces distinguish charged hardware before it reaches the target. */
export function ionFlightLook(out: MissileVfxCommand[], p: MissileFlightPose) {
  if (p.look !== "ion" || p.age < 0) return;
  const co = Math.cos(p.angle), si = Math.sin(p.angle), alpha = 0.76 + Math.sin(p.age * 22) * 0.1;
  const point = (x: number, y: number) => ({ x: p.x + co * x - si * y, y: p.y + si * x + co * y });
  for (const side of [-1, 1]) {
    const a = point(-5, side * 3), b = point(-1, side * 4), c = point(4, side * 2.5), d = point(6, side * 1.5);
    line(out, a.x, a.y, b.x, b.y, C.iceDeep, alpha);
    line(out, b.x, b.y, c.x, c.y, C.iceCyan, alpha);
    line(out, c.x, c.y, d.x, d.y, C.bone, alpha);
  }
  const nose = point(6.5, 0);
  spark(out, nose.x, nose.y, 0.8, 0.75);
}

/** Main ion impact expands outward; resonance has three inward lances and paired rings. */
export function ionImpactLook(out: MissileVfxCommand[], p: MissileImpactPose) {
  if (p.look !== "ion" || p.age < 0) return;
  const resonance = p.kind === "resonance", life = resonance ? FX.resonanceLife : FX.ionImpactLife;
  if (p.age >= life) return;
  const u = p.age / life, fade = clamp((1 - u) / 0.6);
  const r = p.radius * (0.22 + 0.78 * (1 - (1 - u) ** 3));
  ring(out, p.x, p.y, r, -Math.PI / 2, C.iceCyan, fade * 0.85, resonance ? 3 : 6);
  if (resonance) {
    ring(out, p.x, p.y, p.radius * (0.7 - u * 0.45), Math.PI / 2 + u, C.bone, fade * 0.65, 3);
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + i * TAU / 3;
      const outer = p.radius * (1 - u * 0.35), inner = p.radius * 0.18;
      const ax = p.x + Math.cos(a) * outer, ay = p.y + Math.sin(a) * outer;
      const bx = p.x + Math.cos(a + 0.22) * outer * 0.55, by = p.y + Math.sin(a + 0.22) * outer * 0.55;
      line(out, ax, ay, bx, by, C.iceCyan, fade * 0.9, 2);
      line(out, bx, by, p.x + Math.cos(a) * inner, p.y + Math.sin(a) * inner, C.white, fade * 0.85);
    }
    spark(out, p.x, p.y, 2.5 * clamp(1 - p.age / 0.1), clamp(1 - p.age / 0.1));
  } else {
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + 0.12, inner = r * 0.35;
      const bx = p.x + Math.cos(a + 0.12) * r * 0.65, by = p.y + Math.sin(a + 0.12) * r * 0.65;
      line(out, p.x + Math.cos(a) * inner, p.y + Math.sin(a) * inner, bx, by, C.bone, fade * 0.7);
      line(out, bx, by, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, C.iceCyan, fade * 0.9);
    }
    spark(out, p.x, p.y, 2 * clamp(1 - p.age / 0.075), clamp(1 - p.age / 0.075));
  }
}

/** Every visible link uses real endpoints. No decorative branches invent extra hit targets. */
export function ionArcLook(out: MissileVfxCommand[], arc: MissileArcPose) {
  if (arc.age < 0 || arc.age >= FX.arcLife) return;
  const dx = arc.x2 - arc.x, dy = arc.y2 - arc.y, length = Math.hypot(dx, dy);
  if (length <= 0) return;
  const delay = arc.relay ? FX.relayReveal : 0, age = Math.max(0, arc.age - delay);
  const fade = clamp((FX.arcLife - arc.age) / 0.2), rise = clamp(age / 0.018);
  const seed = Math.round(arc.x * 3 + arc.y * 5 + arc.x2 * 7 + arc.y2 * 11);
  const pieces = Math.max(3, Math.ceil(length / 7)), points: { x: number; y: number }[] = [];
  for (let i = 0; i <= pieces; i++) {
    const t = i / pieces;
    const bend = i === 0 || i === pieces ? 0 : Math.sin(i * 2.4 + Math.floor(age * 24) * 1.7 + seed * 0.01) * (arc.relay ? 1.25 : 1.8);
    points.push({ x: arc.x + dx * t - dy / length * bend, y: arc.y + dy * t + dx / length * bend });
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    line(out, a.x, a.y, b.x, b.y, C.iceDeep, fade * 0.38, 3);
    line(out, a.x, a.y, b.x, b.y, C.iceCyan, fade * (0.24 + rise * 0.6), 2);
    line(out, a.x, a.y, b.x, b.y, C.white, fade * rise * (arc.relay ? 0.8 : 0.95));
  }
  const head = clamp(age / 0.13) * pieces, index = Math.min(pieces - 1, Math.floor(head)), t = head - index;
  const a = points[index], b = points[index + 1];
  spark(out, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 1.5, clamp(1 - age / 0.22));
  // Hit spark is immediate even when a relay's bright material reveals a little later.
  spark(out, arc.x2, arc.y2, 2, clamp(1 - arc.age / 0.13));
}

/** Three open sectors communicate the actual charge count; a short pulse marks each gain. */
export function ionChargeLook(out: MissileVfxCommand[], p: MissileChargePose) {
  if (p.count <= 0 || p.remaining <= 0) return;
  const pulse = clamp(1 - p.age / FX.chargePulseLife), fade = clamp(p.remaining / 0.8);
  const radius = p.radius + 5 + pulse;
  for (let i = 0; i < 3; i++) {
    const active = i < p.count, start = -Math.PI / 2 + i * TAU / 3, sweep = TAU / 3 * 0.6;
    for (let n = 0; n < 3; n++) {
      const a = start + sweep * n / 3, b = start + sweep * (n + 1) / 3;
      line(out, p.x + Math.cos(a) * radius, p.y + Math.sin(a) * radius,
        p.x + Math.cos(b) * radius, p.y + Math.sin(b) * radius,
        active ? C.iceCyan : C.iceDeep, fade * (active ? 0.55 + pulse * 0.3 : 0.16));
    }
    if (active && pulse > 0) {
      const a = start + sweep / 2;
      spark(out, p.x + Math.cos(a) * radius, p.y + Math.sin(a) * radius, 1, pulse * 0.8);
    }
  }
}
