import type { GameCore } from "../game/core/GameCore";
import {
  UPGRADES,
  TIERS,
  TIER_VAL,
  CAT_COLOR,
  CAT_ICO,
} from "../game/data/talents";
import { fmtTime } from "../game/data/constants";
import { element, elementWithin } from "./dom";
const DMG_NAMES: Record<string, string> = {
  bullet: "🏹魔弹",
  orbit: "🗡️飞刃",
  chain: "🌩️闪电",
  meteor: "☄️陨星",
  explode: "💣爆炸",
  thorns: "🌵荆棘",
  burn: "♨️灼烧",
};
const show = (id: string) => element(id).classList.remove("hidden");
const hide = (id: string) => element(id).classList.add("hidden");
export class GameUI {
  constructor(public core: GameCore) {
    core.view = {
      reset: () => this.reset(),
      started: () => {
        ["ov-start", "ov-over", "ov-pause", "ov-stats"].forEach(hide);
      },
      paused: (p) => (p ? show("ov-pause") : hide("ov-pause")),
      stats: (open) => {
        if (open) {
          this.buildStats();
          show("ov-stats");
        } else hide("ov-stats");
      },
      level: () => this.openLevelPanel(),
      rest: () => this.showRestBar(),
      over: () => {
        element("over-stats").innerHTML =
          `存活时间 <span class="accent">${fmtTime(core.time)}</span> ｜ 击杀 <span class="accent">${core.kills}</span> ｜ 等级 <span class="accent">${core.player.lvl}</span>`;
        show("ov-over");
        if (core.storage.lastError) {
          const warning = document.createElement("p");
          warning.textContent = "战绩未保存：" + core.storage.lastError;
          element("over-stats").append(warning);
        }
      },
    };
    element("btn-start").onclick = () => this.core.startGame();
    element("btn-retry").onclick = () => this.core.startGame();
    element("btn-resume").onclick = () => this.core.togglePause();
    element("btn-statclose").onclick = () => this.core.toggleStats();
    element("btn-pause").onclick = () => {
      element("btn-pause").blur();
      this.core.togglePause();
    };
    element("bp-swapbtn").onclick = () => {
      if (!this.core.openSwap()) return;
      element("sw-hint").textContent = "置换: 先选目标稀有度（每波限 1 次）";
      element("bp-swap").classList.remove("hidden");
      this.renderSwInv();
    };
    element("sw-r1").onclick = () => this.setSwTarget(1);
    element("sw-r2").onclick = () => this.setSwTarget(2);
    element("sw-r3").onclick = () => this.setSwTarget(3);
    element("sw-melt").onclick = () => {
      const output = this.core.melt();
      if (output)
        element("sw-hint").textContent =
          "🔥 熔出: " + output.ico + " " + output.n;
    };
    element("bp-next").onclick = () => {
      if (!this.core.startNextWave()) return;
      element("bottom-bar").classList.add("hidden");
    };
    (element("btn-start") as HTMLButtonElement).disabled = false;
    element("btn-start").removeAttribute("aria-busy");
  }
  reset() {
    ["bottom-bar", "bp-level", "bp-rest", "bp-swap"].forEach(hide);
  }
  choose(index: number) {
    this.core.chooseSlot(index);
  }
  dispose() {
    this.core.view = {
      reset() {},
      started() {},
      paused() {},
      stats() {},
      level() {},
      rest() {},
      over() {},
    };
    for (const node of document.querySelectorAll<HTMLElement>(
      "#stage button, #bp-cards .card, #sw-inv span, #talent-list",
    ))
      node.onclick = null;
  }
  drawCards() {
    const box = element("bp-cards");
    box.innerHTML = "";
    this.core.slots.forEach((s, i) => {
      const u = s.u;
      const lv = this.core.player.upCounts[u.n] || 0;
      const el = document.createElement("div");
      el.className = "card r" + u.t + (u.mech && lv === 0 ? " new" : "");
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `${u.n}，${TIERS[u.t]}，${u.d}`);
      el.onkeydown = (event) => {
        if (event.target === el && ["Enter", " "].includes(event.key)) {
          event.preventDefault();
          this.choose(i);
        }
      };
      el.innerHTML = `<div class="tier">${TIERS[u.t]}</div>
      <div class="cat" style="color:${CAT_COLOR[u.cat]}">${CAT_ICO[u.cat]} ${u.cat}</div>
      <div class="ico">${u.ico}</div><div class="nm">${u.n}${u.mech && lv === 0 ? " ✦NEW" : ""}</div>
      <div class="ds">${u.d}</div><div class="up"></div><div class="lv"></div>`;
      elementWithin(el, ".up").textContent = u.pv(this.core.player); // 动态数值预览
      elementWithin(el, ".lv").textContent = `Lv.${lv} → ${lv + 1}`;
      if (!s.used) {
        // 每张卡独立刷新 1 次（阻止冒泡，避免误触发"选卡"）
        const rb = document.createElement("button");
        rb.className = "refr";
        rb.textContent = "🔄";
        rb.setAttribute("aria-label", `刷新第 ${i + 1} 张卡片（限一次）`);
        rb.onclick = (e) => {
          e.stopPropagation();
          this.core.refreshSlot(i);
        };
        el.appendChild(rb);
      }
      el.onclick = () => {
        this.choose(i);
      };
      box.appendChild(el);
    });
  }
  buildStats() {
    const p = this.core.player;
    const rows = [
      ["❤️ 生命", `${Math.ceil(p.hp)} / ${p.maxhp}`],
      ["📘 下级所需经验", p.xpNext],
      ["🌊 当前波次", this.core.waveN + "（配额 " + this.core.quota + "）"],
      ["⚔️ 伤害", p.damage.toFixed(1)],
      [
        "⚡ 攻速",
        (p.fireRate * (1 + p.haste * 0.1)).toFixed(2) +
          " /秒" +
          (p.haste ? ` (狂热 +${p.haste * 10}%)` : ""),
      ],
      [
        "💥 暴击率 / 暴伤",
        (p.crit * 100).toFixed(0) + "% / ×" + p.critMul.toFixed(1),
      ],
      ["🔱 弹道数 / 穿透", `${p.multishot} / ${p.pierce}`],
      ["🌐 施法范围", "×" + p.area.toFixed(2)],
      ["🪃 弹射次数", p.ricochet || "—"],
      ["👟 移动速度", Math.round(p.speed)],
      ["🧲 拾取范围", Math.round(p.magnet)],
      ["✨ 生命回复", p.regen ? p.regen.toFixed(1) + " /秒" : "—"],
      ["🦷 吸血", p.lifesteal ? (p.lifesteal * 100).toFixed(1) + "%" : "—"],
      ["🌵 荆棘反伤", p.thorns || "—"],
      ["🛡️ 护盾", p.shieldMax ? `${p.shield} / ${p.shieldMax}` : "—"],
      ["❄️ 冰冻减速", p.slow ? (p.slow * 100).toFixed(0) + "%" : "—"],
      ["♨️ 灼烧", p.burn ? "Lv." + p.burn : "—"],
      ["🌩️ 闪电链", p.chain ? "Lv." + p.chain : "—"],
      [
        "☄️ 陨星",
        p.meteor
          ? "每 " + Math.max(2.2, 4.6 - p.meteor * 0.4).toFixed(1) + " 秒"
          : "—",
      ],
      ["💣 击杀爆炸", p.explode ? "Lv." + p.explode : "—"],
      [
        "💨 冲刺",
        p.dashLv
          ? `充能 ${p.dashCharges}/${1 + p.dashChargeLv} · 冷却 ${p.dashMax.toFixed(1)}s (空格)`
          : "未学习",
      ],
      ["🌀 闪避", p.dodge ? (p.dodge * 100).toFixed(0) + "%" : "—"],
      [
        "🥋 减伤",
        p.tough ? (Math.min(0.6, p.tough) * 100).toFixed(0) + "%" : "—",
      ],
      ["😡 战意", p.rageLv ? "受伤后攻速 +" + p.rageLv * 20 + "% (3秒)" : "—"],
      ["🧱 壁垒", p.barrierLv ? "每波 " + p.barrierLv + " 层临时护盾" : "—"],
      ["🏅 不屈", p.nd ? "每波一次免死" : "—"],
      ["🍀 幸运", p.luck ? "Lv." + p.luck : "—"],
    ];
    element("stat-grid").innerHTML = rows
      .map(
        (r) =>
          `<div class="row"><span class="k">${r[0]}</span><span class="v">${r[1]}</span></div>`,
      )
      .join("");
    const tl = element("talent-list");
    const learned = Object.entries(p.upCounts);
    tl.innerHTML = learned.length
      ? learned
          .map(([n, lv]) => {
            const u = UPGRADES.find((u) => u.n === n)!;
            return `<span data-n="${n}" style="cursor:pointer">${u.ico} [${u.cat}] ${n} Lv.${lv}</span>`;
          })
          .join("")
      : "<span>还没学任何天赋</span>";
    tl.onclick = (e) => {
      const sp =
        e.target instanceof Element
          ? e.target.closest<HTMLElement>("span[data-n]")
          : null;
      if (!sp) return;
      const u = UPGRADES.find((u) => u.n === sp.dataset.n)!;
      const lv = p.upCounts[u.n];
      element("talent-desc").textContent =
        `${u.ico} ${u.n} Lv.${lv}：${u.d}${lv > 0 ? "（每级: " + u.pv(p) + "）" : ""}`;
    };
  }
  openLevelPanel() {
    if (this.core.bpMode !== "level") {
      this.closeLevelPanelIfDone();
      return;
    }
    this.drawCards();
    element("bp-level").classList.remove("hidden");
    element("bp-rest").classList.add("hidden");
    element("bottom-bar").classList.remove("hidden");
  }
  closeLevelPanelIfDone() {
    if (this.core.pendingLevels > 0) return;
    element("bp-level").classList.add("hidden");
    if (this.core.wavePhase !== "rest")
      element("bottom-bar").classList.add("hidden");
  }
  showRestBar() {
    // 伤害统计: 合计突出 + 按占比降序
    const damage = this.core.waveDamage();
    const total = Object.values(damage).reduce((a, b) => a + b, 0);
    const items = Object.keys(DMG_NAMES)
      .map((k) => ({
        k,
        v: damage[k as keyof typeof damage] || 0,
      }))
      .filter((x) => x.v > 0.5);
    items.sort((a, b) => b.v - a.v);
    let html = `<span class="tot">合计 ${Math.round(total)}</span>`;
    for (const it of items)
      html += `<span class="it">${DMG_NAMES[it.k]} <b>${Math.round(it.v)}</b> (${((it.v / total) * 100).toFixed(0)}%)</span>`;
    if (total < 0.5) html = '<span class="it">本波没有造成伤害</span>';
    element("bp-report").innerHTML = html;
    // 置换入口: 本波没用过 且 存在可换的目标档位
    const can =
      !this.core.swapUsedThisRest &&
      ((this.core.cardsOfTier(0) >= 2 && this.core.availTalents(1).length) ||
        (this.core.cardsOfTier(1) >= 2 && this.core.availTalents(2).length) ||
        (this.core.cardsOfTier(2) >= 2 && this.core.availTalents(3).length));
    element("bp-swapbtn").style.display = can ? "" : "none";
    element("bp-swap").classList.add("hidden");
    element("bp-level").classList.add("hidden");
    element("bp-rest").classList.remove("hidden");
    element("bottom-bar").classList.remove("hidden");
  }
  setSwTarget(t: number) {
    if (!this.core.setSwapTarget(t)) {
      element("sw-hint").textContent = `${TIERS[t - 1]}卡不足 2 张！`;
      return;
    }
    element("sw-hint").textContent =
      `投入 2 张${TIERS[t - 1]}卡 → 随机熔出 1 张${TIERS[t]}卡（点击下方库存选卡）`;
    this.renderSwInv();
  }
  swSelCount() {
    return this.core.selectedCount();
  }
  renderSwInv() {
    const inv = element("sw-inv");
    const entries = Object.entries(this.core.player.upCounts).sort(
      ([a], [b]) =>
        TIER_VAL[UPGRADES.find((u) => u.n === a)!.t] -
        TIER_VAL[UPGRADES.find((u) => u.n === b)!.t],
    );
    inv.innerHTML = entries.length
      ? entries
          .map(([n, lv]) => {
            const u = UPGRADES.find((u) => u.n === n)!;
            const sel = this.core.swSel[n] || 0;
            return `<span class="t${u.t}${sel ? " sel" : ""}" data-n="${n}" data-t="${u.t}">${u.ico} ${n} Lv.${lv}${sel ? ` (选${sel})` : ""}</span>`;
          })
          .join("")
      : "<span>无库存</span>";
    [...inv.querySelectorAll<HTMLElement>("span[data-n]")].forEach((sp) => {
      sp.onclick = () => {
        const n = sp.dataset.n!;
        const u = UPGRADES.find((x) => x.n === n)!;
        if (!this.core.swTarget) {
          element("sw-hint").textContent = "先选择目标稀有度！";
          return;
        }
        if (u.t !== this.core.swTarget - 1) {
          element("sw-hint").textContent =
            `只能投入 ${TIERS[this.core.swTarget - 1]}卡！`;
          return;
        }
        this.core.selectMaterial(n);
        this.renderSwInv();
      };
    });
    const mb = element("sw-melt") as HTMLButtonElement;
    mb.textContent = `🔥 熔 炼 (${this.swSelCount()}/2)`;
    mb.disabled = !(
      this.core.swTarget &&
      this.swSelCount() === 2 &&
      this.core.availTalents(this.core.swTarget).length
    );
    mb.style.opacity = mb.disabled ? "0.4" : "1";
  }
}
