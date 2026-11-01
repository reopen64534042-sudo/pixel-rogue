/** Shared production/preview pixel VFX. Pure geometry: no Core, DOM, textures, RNG or damage. */
export interface MonsterFxPainter {
  fillStyle: string; strokeStyle: string; globalAlpha: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  beam(x: number, y: number, x2: number, y2: number, width: number, color: string, alpha: number): void;
  polygon(points: readonly number[], color: string, alpha: number): void;
  beginPath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void; stroke(): void;
}
export type MonsterFxKind = "impact" | "muzzle" | "fire" | "frost" | "stone" | "lightning" | "web" | "slime" |
  "pulse" | "rift" | "dash" | "emerge" | "burrow" | "summon" | "guard" | "fire-ground" | "frost-ground" |
  "breath" | "spikes" | "marks" | "beam" | "gaze" | "lob-flight" | "aura" | "crystal" | "projectile";
export interface MonsterFxGeometry {
  x: number; y: number; radius: number; angle?: number; length?: number; width?: number;
  innerRadius?: number; seed?: number; time?: number; arc?: number; endX?: number; endY?: number; tint?: string;
}
type Colors = Readonly<Record<string, string>>;
const TAU = Math.PI * 2;
const sat = (n: number) => Math.max(0, Math.min(1, n));
const phase = (n: number) => n - Math.floor(n);
const noise = (n: number) => phase(Math.sin(n * 127.1 + 31.7) * 4375.13);

function ring(c: MonsterFxPainter, x: number, y: number, r: number, color: string, alpha: number, segments = 28, rotation = 0): void {
  c.globalAlpha = sat(alpha); c.strokeStyle = color; c.beginPath();
  for (let i = 0; i <= segments; i++) {
    const a = rotation + i / segments * TAU;
    const px = Math.round(x + Math.cos(a) * Math.max(1, r)), py = Math.round(y + Math.sin(a) * Math.max(1, r));
    if (i) c.lineTo(px, py); else c.moveTo(px, py);
  }
  c.stroke(); c.globalAlpha = 1;
}
function fleck(c: MonsterFxPainter, x: number, y: number, color: string, alpha: number, size = 2): void {
  c.fillStyle = color; c.globalAlpha = sat(alpha); c.fillRect(Math.round(x), Math.round(y), size, size); c.globalAlpha = 1;
}
function shard(c: MonsterFxPainter, x: number, y: number, length: number, width: number, angle: number, color: string, light: string, alpha: number): void {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  c.polygon([x - dy * width, y + dx * width, x + dx * length, y + dy * length, x + dy * width, y - dx * width, x - dx * 2, y - dy * 2], color, alpha);
  c.beam(x, y, x + dx * length * 0.85, y + dy * length * 0.85, 1, light, alpha * 0.85);
}
function arcBolt(c: MonsterFxPainter, x: number, y: number, x2: number, y2: number, seed: number, width: number, C: Colors, alpha: number): void {
  const dx = x2 - x, dy = y2 - y, d = Math.hypot(dx, dy) || 1;
  let px = x, py = y;
  for (let i = 1; i <= 8; i++) {
    const k = i / 8, bend = i === 8 ? 0 : (noise(i + seed * 17) - 0.5) * width;
    const nx = Math.round(x + dx * k - dy / d * bend), ny = Math.round(y + dy * k + dx / d * bend);
    c.beam(px, py, nx, ny, 3, C.psiViolet, alpha * 0.35);
    c.beam(px, py, nx, ny, 1, C.iceCyan, alpha);
    if (i % 3 === 0) c.beam(nx, ny, nx + dy / d * 5, ny - dx / d * 5, 1, C.bone, alpha * 0.8);
    px = nx; py = ny;
  }
}

export function monsterWarningCircle(c: MonsterFxPainter, x: number, y: number, r: number, progress: number, C: Colors, inner = 0, cold = false): void {
  const k = sat(progress), color = cold ? C.iceCyan : C.fireOrange;
  ring(c, x, y, r, C.danger, 0.64, 36);
  if (inner > 0) ring(c, x, y, inner, C.iceDeep, 0.8);
  ring(c, x, y, Math.max(inner + 1, r - (r - inner) * k), color, 0.38, 28);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU, dx = Math.cos(a), dy = Math.sin(a);
    c.beam(x + dx * (r - 3), y + dy * (r - 3), x + dx * (r + 3), y + dy * (r + 3), 1, color, 0.7);
    if (i < Math.ceil(k * 8)) fleck(c, x + dx * (r + 5), y + dy * (r + 5), color, 0.8, 1);
  }
}

export function monsterWarningLane(c: MonsterFxPainter, g: MonsterFxGeometry, progress: number, C: Colors, rounded = true): void {
  const a = g.angle ?? 0, dx = Math.cos(a), dy = Math.sin(a), length = g.length ?? g.radius, width = g.width ?? 20;
  const x2 = g.x + dx * length, y2 = g.y + dy * length, nx = -dy * width / 2, ny = dx * width / 2;
  c.polygon([g.x + nx, g.y + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, g.x - nx, g.y - ny], C.danger, 0.045);
  c.beam(g.x + nx, g.y + ny, x2 + nx, y2 + ny, 1, C.danger, 0.65);
  c.beam(g.x - nx, g.y - ny, x2 - nx, y2 - ny, 1, C.danger, 0.65);
  if (rounded) {
    c.strokeStyle = C.danger; c.globalAlpha = 0.65;
    c.beginPath(); c.arc(g.x, g.y, width / 2, a + Math.PI / 2, a + Math.PI * 1.5); c.stroke();
    c.beginPath(); c.arc(x2, y2, width / 2, a - Math.PI / 2, a + Math.PI / 2); c.stroke(); c.globalAlpha = 1;
  } else c.beam(x2 + nx, y2 + ny, x2 - nx, y2 - ny, 1, C.danger, 0.65);
  for (let d = 18; d < length; d += 28) {
    const x = g.x + dx * d, y = g.y + dy * d;
    c.beam(x - dx * 5 - dy * 3, y - dy * 5 + dx * 3, x, y, 1, C.fireOrange, 0.25 + sat(progress) * 0.45);
    c.beam(x - dx * 5 + dy * 3, y - dy * 5 - dx * 3, x, y, 1, C.fireOrange, 0.25 + sat(progress) * 0.45);
  }
}

/** Art recipes use supplied collision geometry and never create their own damage zones. */
export function drawMonsterEffect(c: MonsterFxPainter, kind: MonsterFxKind, progress: number, g: MonsterFxGeometry, C: Colors): void {
  const k = sat(progress), fade = sat((1 - k) * 2), angle = g.angle ?? 0, seed = g.seed ?? 1;
  const x = Math.round(g.x), y = Math.round(g.y), r = Math.max(2, g.radius), time = g.time ?? k;
  if (kind === "projectile") {
    const dx = Math.cos(angle), dy = Math.sin(angle), color = g.tint ?? C.danger;
    for (let i = 3; i >= 1; i--) c.beam(x - dx * i * 3, y - dy * i * 3, x - dx * (i - 1) * 3,
      y - dy * (i - 1) * 3, Math.max(1, r * 2 - i), color, 0.12 + (3 - i) * 0.08);
    c.polygon([x + dx * 3, y + dy * 3, x - dy * r, y + dx * r, x - dx * 2, y - dy * 2, x + dy * r, y - dx * r], color, 0.9);
    fleck(c, x, y, C.bone, 0.65 + Math.sin(time * 18) * 0.15, 1);
  } else if (kind === "impact" || kind === "muzzle") {
    const color = kind === "muzzle" ? C.psiPurple : C.sand;
    for (let i = 0; i < 7; i++) {
      const a = angle + (i - 3) * 0.32, d = 2 + k * r;
      shard(c, x + Math.cos(a) * d, y + Math.sin(a) * d, (1 - k) * 5 + 1, 1, a, color, C.bone, fade);
    }
  } else if (kind === "fire" || kind === "fire-ground" || kind === "breath" || kind === "lob-flight") {
    if (kind === "lob-flight") {
      const tx = g.endX ?? x, ty = g.endY ?? y;
      const px = x + (tx - x) * k, py = y + (ty - y) * k - Math.sin(k * Math.PI) * Math.min(45, Math.hypot(tx - x, ty - y) * 0.25);
      for (let i = 3; i >= 0; i--) fleck(c, px - i * 2, py - i, i ? C.fireDeep : C.fireYellow, 1 - i * 0.2, i ? 2 : 3);
      ring(c, tx, ty, 3 + k * 3, C.fireDeep, 0.25);
    } else {
      const ground = kind === "fire-ground", breath = kind === "breath";
      const count = breath ? 22 : ground ? 9 : 16;
      for (let i = 0; i < count; i++) {
        const p = ground || breath ? phase(time * 1.9 + noise(i + seed)) : k;
        const a = breath ? angle + (noise(i + seed) - 0.5) * (g.arc ?? 1) * 0.92 : i / count * TAU + noise(i) * 0.2;
        const d = ground ? Math.sqrt(noise(i + seed)) * r * 0.8 : breath ? 10 + p * (r - 15) : r * (0.1 + k * 0.83);
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
        const height = ground ? 3 + (1 - p) * 8 : breath ? 4 + p * 9 : 2 + (1 - k) * 12;
        const opacity = ground || breath ? (1 - p) * 0.7 * fade : fade * 0.8;
        c.polygon([px - 3, py + 2, px - 2, py - height / 2, px + 1, py - height, px + 4, py], C.fireDeep, opacity * 0.8);
        shard(c, px, py, height, 2, -Math.PI / 2, C.fireOrange, C.fireYellow, opacity);
      }
      if (!breath) ring(c, x, y, ground ? r : r * (0.1 + k * 0.9), C.fireDeep, ground ? 0.45 : fade * 0.6);
    }
  } else if (kind === "frost" || kind === "frost-ground" || kind === "spikes") {
    const ground = kind === "frost-ground", spikes = kind === "spikes", inner = g.innerRadius ?? 0;
    const radius = ground ? r : inner + (r - inner) * Math.min(1, k * 2.8);
    ring(c, x, y, radius, C.iceDeep, ground ? 0.4 : fade * 0.7);
    if (spikes) {
      for (let i = -2; i <= 2; i++) {
        const height = (i ? 19 : 38) * Math.min(1, k * 6);
        shard(c, x + i * 7, y + Math.abs(i) * 2, height, i ? 3 : 6, -Math.PI / 2 + i * 0.06, C.iceDeep, C.iceCyan, fade);
      }
    } else for (let i = 0; i < 20; i++) {
      const a = i / 20 * TAU, d = ground ? Math.sqrt(noise(i + seed)) * r * 0.9 : radius;
      shard(c, x + Math.cos(a) * d, y + Math.sin(a) * d,
        ground ? 3 + noise(i) * 4 : 3 + (1 - k) * 7, 1.5, ground ? -Math.PI / 2 : a,
        C.iceDeep, C.iceCyan, ground ? 0.4 * fade : fade * 0.85);
    }
    if (inner > 0) ring(c, x, y, inner, C.iceCyan, fade * 0.5);
  } else if (kind === "stone" || kind === "emerge" || kind === "burrow" || kind === "dash") {
    const underground = kind === "burrow", dash = kind === "dash";
    const spread = underground ? r : r * (0.2 + k * 0.8);
    if (!dash) ring(c, x, y, spread, C.pBrown, underground ? 0.35 : fade * 0.6);
    for (let i = 0; i < (underground ? 6 : 12); i++) {
      const a = dash ? angle + Math.PI + (i % 3 - 1) * 0.4 : i / 12 * TAU + noise(i + seed) * 0.25;
      const d = underground ? noise(i) * r : spread * (0.35 + noise(i + seed) * 0.6);
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d - (underground ? 0 : Math.sin(k * Math.PI) * 8);
      if (kind === "stone") c.beam(x + Math.cos(a) * 6, y + Math.sin(a) * 6, px, py + 2, 1, C.ink2, fade * 0.6);
      shard(c, px, py, underground ? 2 : 3 + noise(i) * 4, 2, a - Math.PI / 2, C.pBrown, C.sand, underground ? 0.6 : fade * 0.7);
    }
  } else if (kind === "web") {
    ring(c, x, y, r, C.steelMid, 0.32);
    for (const scale of [0.36, 0.66, 0.9]) ring(c, x, y, r * scale, C.steelLight, 0.13, 8, time * 0.02);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      c.beam(x + Math.cos(a) * r * 0.28, y + Math.sin(a) * r * 0.28, x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95, 1, C.steelLight, 0.16);
      fleck(c, x + Math.cos(a) * r * 0.66, y + Math.sin(a) * r * 0.66, C.bone, 0.22, 1);
    }
  } else if (kind === "slime") {
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU, d = r * k * (0.5 + noise(i + seed) * 0.5);
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d - Math.sin(k * Math.PI) * 9;
      fleck(c, px, py, C.slimeDark, fade, 3); fleck(c, px, py, C.slimeLite, fade, 2);
    }
    ring(c, x, y + 2, r * k, C.slimeMid, fade * 0.4, 16);
  } else if (kind === "beam" || kind === "gaze" || kind === "lightning" || kind === "marks") {
    const length = g.length ?? r, dx = Math.cos(angle), dy = Math.sin(angle);
    if (kind === "marks") {
      arcBolt(c, x - 8, y - Math.max(65, r * 2.4), x, y, seed + Math.floor(k * 12), 12, C, fade);
      ring(c, x, y, r * Math.min(1, k * 3), C.iceCyan, fade * 0.6);
      for (let i = 0; i < 10; i++) shard(c, x, y, r * (0.2 + k * 0.8), 1, i / 10 * TAU, C.psiViolet, C.fireYellow, fade * 0.6);
    } else {
      const endX = x + dx * length, endY = y + dy * length, width = g.width ?? 12;
      c.beam(x, y, endX, endY, Math.max(2, width * 0.5), kind === "gaze" ? C.psiLime : C.iceDeep, fade * 0.18);
      for (const side of [-1, 1]) arcBolt(c, x - dy * side * 2, y + dx * side * 2, endX, endY, seed + Math.floor(time * 22) + side, width * 0.6, C, fade * 0.8);
      for (let i = 0; i < 5; i++) {
        const d = phase(time * 1.8 + i / 5) * length;
        fleck(c, x + dx * d, y + dy * d, C.bone, fade * 0.8, 1);
      }
    }
  } else if (kind === "pulse" || kind === "aura") {
    const aura = kind === "aura", radius = aura ? r * phase(time * 0.7 + seed * 0.01) : r * k;
    ring(c, x, y, radius, C.gold, aura ? 0.12 : fade * 0.65, 32);
    if (!aura) ring(c, x, y, Math.max(1, radius - 4), C.pGold, fade * 0.35);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      fleck(c, x + Math.cos(a) * radius, y + Math.sin(a) * radius, C.gold, aura ? 0.2 : fade, 1);
    }
  } else if (kind === "rift" || kind === "summon") {
    const summoning = kind === "summon", radius = r * (summoning ? 0.6 + k * 0.4 : 1 - k * 0.65);
    ring(c, x, y, radius, C.psiViolet, fade * 0.7, summoning ? 6 : 20, k * 1.8);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU + k * 1.5, d = r * (summoning ? k : 1 - k);
      fleck(c, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, i % 3 ? C.psiPurple : C.bone, fade * 0.7, i % 3 ? 2 : 1);
    }
    if (!summoning) {
      c.polygon([x, y - radius * 0.65, x + radius * 0.7, y, x, y + radius * 0.65, x - radius * 0.7, y], C.ink0, fade * 0.65);
      c.beam(x - radius * 0.5, y, x + radius * 0.5, y, 1, C.psiPurple, fade);
    }
  } else if (kind === "guard" || kind === "crystal") {
    const guard = kind === "guard", arc = g.arc ?? Math.PI * 2 / 3;
    for (let i = 0; i < 5; i++) {
      const a = guard ? angle - arc / 2 + i / 4 * arc : angle + (i - 2) * 0.18;
      const d = guard ? r : r * k;
      shard(c, x + Math.cos(a) * d, y + Math.sin(a) * d, guard ? 3 : 6 * (1 - k) + 2,
        guard ? 1.5 : 2, a, C.iceDeep, C.iceCyan, guard ? 0.25 + (1 - k) * 0.6 : fade);
    }
  }
  c.globalAlpha = 1;
}
