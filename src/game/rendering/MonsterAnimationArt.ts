/** Native pixel animation recipes. Frame zero is the approved original, padded without resampling. */
export const MONSTER_POSES = ["idle", "move-a", "move-b", "windup-a", "windup-b", "strike-a", "strike-b", "recover", "hurt", "channel-a", "channel-b", "break"] as const;
export type MonsterPose = typeof MONSTER_POSES[number];

export function monsterAnimationRows(rows: readonly string[], size: number, key: string, pose: MonsterPose): string[] {
  const cell = size + 8, pad = 4, center = (size - 1) / 2;
  const pixels = Array.from({ length: cell }, () => Array<string>(cell).fill("."));
  const moving = pose === "move-a" || pose === "move-b", stride = pose === "move-a" ? -1 : 1;
  const windup = pose === "windup-a" || pose === "windup-b", charge = pose === "windup-b" ? 2 : 1;
  const strike = pose === "strike-a" || pose === "strike-b", kick = pose === "strike-a" ? 2 : 1;
  const channel = pose === "channel-a" || pose === "channel-b", pulse = pose === "channel-a" ? -1 : 1;
  const goo = key === "slime" || key === "splitter" || key === "splitling";
  const eye = key === "shooter" || key === "shooter_elite";
  const bug = ["bomber", "lobber", "bulwark", "spinner", "burrower"].includes(key);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let color = rows[y][x];
    if (color === ".") continue;
    let px = x, py = y, pixelWidth = 1, pixelHeight = 1;
    if (pose === "idle") { /* Exact locked seed. */ }
    else if (goo) {
      const wide = windup ? 1.08 : strike ? 0.92 : moving ? 1 + stride * 0.045 : 1;
      const tall = windup ? 0.8 : strike ? 1.15 : moving ? 1 - stride * 0.07 : 1;
      px = center + (x - center) * wide;
      py = size * 0.76 + (y - size * 0.76) * tall;
      pixelWidth = wide > 1 ? 2 : 1;
      pixelHeight = tall > 1 ? 2 : 1;
      if (pose === "hurt") { px += y % 3 === 0 ? 1 : -1; py += 1; }
    } else if (key === "bat") {
      if (Math.abs(x - center) > size * 0.2) {
        py += moving ? stride * 2 : windup ? 2 : strike ? -2 : 0;
        px += windup ? (x < center ? 1 : -1) : strike ? (x < center ? -1 : 1) : 0;
      } else py += strike ? 1 : 0;
    } else if (key === "tether") {
      if (y > size * 0.5) px += Math.round(Math.sin(y * 1.1 + (channel ? pulse * 1.7 : moving ? stride : 0)) * (channel ? 2 : 1));
      else if (windup) py += charge;
      else if (strike || channel) py -= 1;
    } else if (eye) {
      if (color === "g" || color === "w") px += windup ? -1 : strike ? 1 : channel ? pulse : 0;
      if (y > size * 0.65) px += moving || channel ? Math.round(Math.sin(y + (moving ? stride : pulse))) : 0;
      py += windup ? charge : strike ? -1 : 0;
    } else if (bug) {
      const leg = Math.abs(x - center) > size * 0.28 && y > size * 0.4;
      if (leg && moving) { py += (x < center ? stride : -stride); px += y % 2 ? stride : 0; }
      if (key === "spinner" && leg && (windup || strike)) px += (x < center ? -1 : 1) * (windup ? -1 : 1);
      if (y < size * 0.6 && windup) py += charge;
      if (y >= size * 0.45 && strike) py -= kick;
      if (key === "bulwark" && pose === "break") color = color === "w" ? "m" : color === "h" ? "d" : color;
      if (key === "bomber" && windup && x > center) px += 1;
      if (pose === "hurt") px += x < center ? -1 : 1;
    } else {
      const hand = Math.abs(x - center) > size * 0.3;
      if (y > size * 0.65 && moving) { px += x < center ? stride : -stride; py += x < center ? -stride : stride; }
      if (hand && windup) py -= charge;
      if (hand && strike) py += kick;
      if (hand && channel) py += x < center ? pulse : -pulse;
      if (!hand && y < size * 0.4) { py += windup ? 1 : strike ? -1 : 0; if (strike) pixelHeight = 2; }
      if (key === "charger" && y < size * 0.35) py += windup ? 2 : strike ? -2 : 0;
      if (pose === "hurt") px += y < size / 2 ? -1 : 1;
    }
    if (pose === "recover") py += y < size * 0.5 ? 1 : 0;
    const ox = Math.round(px) + pad, oy = Math.round(py) + pad;
    for (let j = 0; j < pixelHeight; j++) for (let i = 0; i < pixelWidth; i++)
      if (oy + j >= 0 && oy + j < cell && ox + i >= 0 && ox + i < cell) pixels[oy + j][ox + i] = color;
  }
  return pixels.map(row => row.join(""));
}
