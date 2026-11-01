/** Offline art choreography, using the exact production pixel recipes. Not a gameplay simulator. */
export const MONSTER_PREVIEW_CARDS = [
  ["slime", "史莱姆 · 蓄力扑击", "impact", "minion"], ["bat", "蝙蝠 · 收翼扑击", "impact", "minion"],
  ["shooter", "射手 · 蓄能弹丸", "shot", "minion"], ["bomber", "火囊虫 · 引爆", "fire", "minion"],
  ["brute", "岩石兽 · 重拳", "impact", "minion"], ["splitter", "裂胶史莱姆 · 分裂", "slime", "minion"],
  ["splitling", "小史莱姆 · 跳扑", "impact", "minion"], ["charger", "角兽 · 冲锋撞地", "dash", "minion"],
  ["drummer", "战鼓手 · 鼓点光环", "aura", "minion"], ["spinner", "织网蛛 · 吐网", "web", "minion"],
  ["burrower", "掘地虫 · 破土", "emerge", "minion"], ["lobber", "熔岩投手 · 炮击火地", "lob", "minion"],
  ["bulwark", "晶甲虫 · 晶盾突进", "crystal", "minion"], ["tether", "缚电水母 · 电浆束", "beam", "minion"],
  ["brute_elite", "岩石巨兽 · 震地践踏", "stone", "elite"], ["shooter_elite", "飞行眼魔 · 凝视", "gaze", "elite"],
  ["shooter_elite", "飞行眼魔 · 重力塌缩", "rift", "elite"], ["shooter_elite", "飞行眼魔 · 闪烁", "blink", "elite"],
  ["drummer_elite", "战鼓祭司 · 音爆", "pulse", "elite"], ["drummer_elite", "战鼓祭司 · 强化光环", "aura", "elite"],
  ["brute_elite", "精英词缀 · 召唤", "summon", "elite"], ["shooter_elite", "精英词缀 · 冰霜新星", "frost", "elite"],
  ["drummer_elite", "精英词缀 · 分裂", "slime", "elite"],
];

export function renderMonsterPreview(p, card, time, C, fx, warningCircle, warningLane, box = { x: 0, y: 0, w: 208, h: 144 }, showWarnings = true) {
  const [key, , effect] = card;
  const u = ((time % 2.8) + 2.8) % 2.8 / 2.8, preparing = u < 0.3, active = u >= 0.3 && u < 0.78;
  const prep = u / 0.3, k = Math.max(0, Math.min(1, (u - 0.3) / 0.48));
  const lane = ["shot", "beam", "gaze", "lightning", "breath"].includes(effect);
  const x = box.x + (lane || effect === "lob" ? 45 : box.w / 2), y = box.y + Math.round(box.h * 0.52);
  const targetX = box.x + 139, targetY = y, seed = 7;
  // Keep the normalized art preview in step with the elite stomp nerf (110px -> 80px).
  const radius = key === "brute_elite" && effect === "stone" ? 27 : effect === "aura" ? 55 : 37;
  const geometry = { x, y, radius, seed, time, angle: 0, width: effect === "beam" ? 12 : 10, length: 125, arc: 1.1 };
  p.polygon([x - 17, y + 9, x, y + 4, x + 17, y + 9, x, y + 13], C.ink0, 0.35);
  if (effect === "aura") fx(p, "aura", 0, geometry, C);
  else if (showWarnings && preparing && !["impact", "shot", "slime", "blink", "summon"].includes(effect)) {
    if (lane) warningLane(p, geometry, prep, C);
    else warningCircle(p, effect === "lob" || effect === "rift" ? targetX : x, y, radius, prep, C, 0, effect === "frost");
  }
  if (effect === "crystal") fx(p, "guard", active ? k : 0, { x, y, radius: 21, angle: 0, arc: 2.1 }, C);
  if (effect === "lob" && preparing) fx(p, "lob-flight", prep, { ...geometry, endX: targetX, endY: targetY }, C);
  if (effect === "emerge" && preparing) fx(p, "burrow", 0, { ...geometry, radius: 12 }, C);
  if (effect === "blink" && preparing) fx(p, "rift", prep * 0.5, { ...geometry, x: x + 50, radius: 18 }, C);
  if (active) {
    if (effect === "shot") {
      fx(p, "muzzle", k, { ...geometry, radius: 12 }, C);
      fx(p, "projectile", 0, { ...geometry, x: x + 10 + k * 125, radius: 2 }, C);
    } else if (effect === "lob") {
      if (k < 0.55) fx(p, "fire", k / 0.55, { ...geometry, x: targetX }, C);
      fx(p, "fire-ground", k > 0.9 ? (k - 0.9) * 10 : 0, { ...geometry, x: targetX, radius: 18 }, C);
    } else if (effect === "blink") {
      fx(p, "rift", k, { ...geometry, radius: 18 }, C);
      fx(p, "rift", k * 0.7, { ...geometry, x: x + 50, radius: 18 }, C);
    } else if (effect === "web") fx(p, "web", 0, { ...geometry, time }, C);
    else if (effect === "dash") {
      fx(p, "dash", k, { ...geometry, x: x + k * 25, radius: 33 }, C);
      if (k > 0.5) fx(p, "stone", (k - 0.5) * 2, { ...geometry, x: x + 28, radius: 24 }, C);
    } else if (effect === "aura") fx(p, "pulse", k, { ...geometry, radius: 18 }, C);
    else if (effect === "rift") fx(p, effect, k, { ...geometry, x: targetX, radius: 35 }, C);
    else fx(p, effect, effect === "beam" || effect === "gaze" || effect === "breath" ? 0.15 : k,
      { ...geometry, radius: effect === "breath" ? 102 : radius }, C);
  }
  let pose = preparing ? prep < 0.55 ? 3 : 4 : active ? k < 0.25 ? 5 : k < 0.75 ? 6 : 7 : Math.floor(time * 7) % 2 ? 1 : 2;
  if (effect === "beam" && active) pose = Math.floor(time * 12) % 2 ? 9 : 10;
  if (effect === "crystal" && active && k > 0.6) pose = 11;
  if (key === "drummer" || effect === "aura") pose = Math.floor(time * 6) % 2 ? 3 : 6;
  const bodyX = x + (effect === "blink" && active ? 50 : effect === "dash" && active ? Math.round(k * 25) : 0);
  if (!(effect === "emerge" && preparing)) {
    p.body(key, pose, bodyX, y, 2);
  }
  if (active && effect === "slime" && k > 0.2) {
    p.body(key === "splitter" ? "splitling" : key === "drummer_elite" ? "drummer" : "splitling", 2, x - k * 25, y + 10, 1);
    p.body(key === "splitter" ? "splitling" : key === "drummer_elite" ? "drummer" : "splitling", 1, x + k * 25, y + 10, 1);
  }
}
