"""Offline design model, not the game runtime or an automated gameplay test.

Run from any directory with the existing Python/numpy/matplotlib environment.
Inputs from the repository are read-only. Outputs stay beside this script.
"""

from __future__ import annotations

import ast
import json
import math
import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.font_manager import FontProperties


OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
SEED = 20261101
RUNS = 100_000
FPS = 60
ATTR_SOURCE = (ROOT / "src/game/core/AttributeSystem.ts").read_text(encoding="utf-8")
BALANCE_SOURCE = (ROOT / "src/game/data/combatBalance.ts").read_text(encoding="utf-8")
BOSS_SOURCE = (ROOT / "src/game/data/boss.ts").read_text(encoding="utf-8")
RARITY_WEIGHTS = np.array(ast.literal_eval(re.search(
    r"RARITY_CHANCE[^=]*=\s*(\[.*?\])\s*;", ATTR_SOURCE, re.S
).group(1)), dtype=float)
RARITY_FACTORS = np.array(ast.literal_eval(re.search(
    r"RARITY_MUL\s*=\s*(\[.*?\])", ATTR_SOURCE
).group(1)), dtype=float)
ARMOR_K = float(re.search(r"armorK:\s*([\d.]+),", BALANCE_SOURCE).group(1))
BOSS_SLOW_MUL = float(re.search(r"slowEffectMul:\s*([\d.]+),", BOSS_SOURCE).group(1))
GRADES = {
    name: [int(math.floor(base * factor + 0.5)) for factor in RARITY_FACTORS]
    for name, base in (("conservative", 3), ("medium", 4), ("aggressive", 5))
}
POLICIES = {
    "normal": 1 / 6,
    "focus": 1 - (5 / 6) ** 2,
    "late_filtered_stress": 1 - (3 / 4) ** 2,
}


def stats(values: np.ndarray, cap: int) -> dict[str, float]:
    effective = np.minimum(values, cap)
    return {
        "mean": round(float(effective.mean()), 3),
        "p10": round(float(np.percentile(effective, 10)), 3),
        "p50": round(float(np.percentile(effective, 50)), 3),
        "p90": round(float(np.percentile(effective, 90)), 3),
        "cap_percent": round(float(np.mean(values >= cap) * 100), 3),
        "raw_mean": round(float(values.mean()), 3),
    }


def growth_model() -> tuple[list[dict], dict]:
    """Same samples for each grade, fixed offer pool; not a full run economy."""
    result = []
    plot_data = {}
    for selections in (40, 60, 80):
        rng = np.random.default_rng(SEED + selections)
        levels = np.floor(np.linspace(1, 42, selections)).astype(int)
        offer_draw = rng.random((selections, RUNS))
        rarity_draw = rng.random((selections, RUNS))
        rarities = np.empty((selections, RUNS), dtype=np.int8)
        for i, level in enumerate(levels):
            weights = RARITY_WEIGHTS[min(len(RARITY_WEIGHTS) - 1, level // 5)]
            rarities[i] = np.searchsorted(np.cumsum(weights / weights.sum()), rarity_draw[i])
        for policy, probability in POLICIES.items():
            offered = offer_draw < probability
            for grade, gains in GRADES.items():
                for boosted in (False, True):
                    rarity_indices = np.minimum(3, rarities + int(boosted))
                    steps = np.array(gains)[rarity_indices] * offered
                    raw = 100 + steps.sum(axis=0)
                    for cap in (150, 175, 200, 225):
                        result.append({
                            "selections": selections, "policy": policy,
                            "grade": grade, "all_selected_boosted": boosted,
                            "cap": cap, **stats(raw, cap),
                        })
                    if selections == 60 and grade == "medium" and not boosted:
                        progression = 100 + steps.cumsum(axis=0)
                        plot_data[policy] = {
                            "x": list(range(1, selections + 1)),
                            "mean": progression.mean(axis=1).tolist(),
                            "p10": np.percentile(progression, 10, axis=1).tolist(),
                            "p90": np.percentile(progression, 90, axis=1).tolist(),
                        }
    return result, plot_data


def frame(seconds: float) -> int:
    return int(math.floor(seconds * FPS + 0.5))


def cc_frames(seconds: float) -> int:
    """Round positive control durations up to a step, ignoring float noise."""
    return max(0, math.ceil(seconds * FPS - 1e-9))


def cycle_schedule(cast_interval: float, bh_life: float, seconds: int = 150) -> dict:
    """60 Hz schedule: deployment, fields, lock, collapse, and black holes."""
    count = seconds * FPS
    interval = max(frame(0.25), frame(cast_interval))
    deploy_frames = frame(0.25)
    collapse_frames = frame(0.35)
    lock_frames = frame(2.5)
    fields = []
    deploying_until = None
    collapse_until = None
    bh_until = -1
    next_cast = 0
    lock_until = 0
    field_active = np.zeros(count, dtype=bool)
    bh_active = np.zeros(count, dtype=bool)
    collapse_starts = np.zeros(count, dtype=bool)
    bh_starts = np.zeros(count, dtype=bool)
    field_any_during_collapse = np.zeros(count, dtype=bool)
    bh_start_list = []
    for tick in range(count):
        if collapse_until is not None and tick >= collapse_until:
            fields.clear()
            collapse_until = None
            bh_until = tick + frame(bh_life)
            bh_starts[tick] = True
            bh_start_list.append(tick / FPS)
        if collapse_until is None:
            fields = [expiry for expiry in fields if expiry > tick]
        if deploying_until is not None and tick >= deploying_until:
            fields.append(tick + frame(3.0))
            fields = fields[-3:]
            deploying_until = None
        if (collapse_until is None and deploying_until is None
                and len(fields) == 3 and tick >= lock_until):
            collapse_starts[tick] = True
            collapse_until = tick + collapse_frames
            lock_until = tick + lock_frames
        if (collapse_until is None and deploying_until is None and tick >= next_cast):
            deploying_until = tick + deploy_frames
            next_cast = tick + interval
        field_active[tick] = bool(fields) and collapse_until is None
        field_any_during_collapse[tick] = bool(fields)
        bh_active[tick] = tick < bh_until
    return {
        "field": field_active, "field_with_collapse": field_any_during_collapse,
        "bh": bh_active, "collapse": collapse_starts, "bh_start": bh_starts,
        "bh_start_seconds": bh_start_list,
    }


SCHEDULES = {
    "base": cycle_schedule(0.9, 1.0),
    "fast_base": cycle_schedule(0.36, 1.0),
    "fast_full": cycle_schedule(0.36, 2.2),
}


def cc_requests(schedule: dict, domain: int, cc_cap: float, creature: str,
                include_stun: bool = True, include_root: bool = True,
                field_pulses_during_collapse: bool = False,
                entry_tick: int = 0) -> tuple[np.ndarray, np.ndarray]:
    size = len(schedule["field"])
    stun = np.zeros(size)
    root = np.zeros(size)
    m = domain / 100
    category_mul = 0 if creature == "boss" else 0.5 if creature == "elite" else 1
    fields = schedule["field_with_collapse"] if field_pulses_during_collapse else schedule["field"]
    next_field_pulse = 0
    next_bh_pulse = 0
    for tick in range(size):
        eligible = tick >= entry_tick
        if include_stun and eligible and fields[tick] and tick >= next_field_pulse:
            amount = 0.6 if tick == entry_tick or not fields[tick - 1] else 0.4
            stun[tick] = max(stun[tick], min(amount * m, cc_cap) * category_mul)
            next_field_pulse = tick + frame(1.2)
        if include_stun and schedule["bh_start"][tick]:
            if eligible:
                stun[tick] = max(stun[tick], min(0.6 * m, cc_cap) * category_mul)
            next_bh_pulse = tick + frame(0.6)
        elif include_stun and schedule["bh"][tick] and tick >= next_bh_pulse:
            if eligible:
                stun[tick] = max(stun[tick], min(0.2 * m, cc_cap) * category_mul)
            next_bh_pulse = tick + frame(0.6)
        if include_root and eligible and schedule["collapse"][tick]:
            root[tick] = min(1.0 * m, cc_cap) * category_mul
    return stun, root


def control_model(schedule_name: str, domain: int, slow_cap: float, cc_cap: float,
                  creature: str, include_stun: bool = True, include_root: bool = True,
                  field_pulses_during_collapse: bool = False,
                  third_fraction: float = 0.0,
                  entry_seconds: float | None = None,
                  observation_seconds: float | None = None) -> dict:
    """Immortal target inside all active effects; continuous exposure stress case."""
    schedule = SCHEDULES[schedule_name]
    requests_stun, requests_root = cc_requests(
        schedule, domain, cc_cap, creature, include_stun, include_root,
        field_pulses_during_collapse, frame(entry_seconds or 0),
    )
    size = len(schedule["field"])
    active_stun = np.zeros(size, dtype=bool)
    active_root = np.zeros(size, dtype=bool)
    resistance = 0
    reset_at = -1
    immune_until = -1
    stun_until = -1
    root_until = -1
    successful = 0
    blocked = 0
    root_successes = 0
    for tick, (stun, root) in enumerate(zip(requests_stun, requests_root)):
        if immune_until >= 0 and tick >= immune_until:
            resistance = 0
            immune_until = -1
            reset_at = -1
        if immune_until < 0 and reset_at >= 0 and tick >= reset_at:
            resistance = 0
            reset_at = -1
        if max(stun, root) > 0:
            if tick < immune_until:
                blocked += 1
            elif resistance >= 2:
                if third_fraction > 0:
                    stun_until = max(stun_until, tick + cc_frames(stun * third_fraction))
                    root_until = max(root_until, tick + cc_frames(root * third_fraction))
                    immune_until = max(tick, stun_until, root_until) + frame(2.0)
                    successful += 1
                    root_successes += int(root > 0)
                else:
                    immune_until = tick + frame(2.0)
                    blocked += 1
            else:
                scale = 1 if resistance == 0 else 0.5
                stun_until = max(stun_until, tick + cc_frames(stun * scale))
                root_until = max(root_until, tick + cc_frames(root * scale))
                resistance += 1
                reset_at = tick + frame(3.0)
                successful += 1
                root_successes += int(root > 0)
        active_stun[tick] = tick < stun_until
        active_root[tick] = tick < root_until
    hard_cc = active_stun | active_root
    m = domain / 100
    full = schedule_name == "fast_full"
    field_slow = min((0.35 if full else 0.30) * m, slow_cap)
    bh_slow = min((0.60 if full else 0.50) * m, slow_cap)
    slow = np.maximum(schedule["field"] * field_slow, schedule["bh"] * bh_slow)
    if creature == "boss":
        slow *= BOSS_SLOW_MUL
    movement = (~hard_cc) * (1 - slow)
    start = frame(30 if entry_seconds is None else entry_seconds)
    stop = size if observation_seconds is None else start + frame(observation_seconds)
    observed = slice(start, stop)
    return {
        "schedule": schedule_name, "domain": domain, "slow_cap": slow_cap,
        "cc_cap": cc_cap, "creature": creature, "stun_enabled": include_stun,
        "root_enabled": include_root,
        "field_pulses_during_collapse": field_pulses_during_collapse,
        "third_fraction": third_fraction,
        "entry_seconds": entry_seconds, "observation_seconds": observation_seconds,
        "stun_percent": round(float(active_stun[observed].mean() * 100), 3),
        "root_percent": round(float(active_root[observed].mean() * 100), 3),
        "hard_cc_percent": round(float(hard_cc[observed].mean() * 100), 3),
        "can_attack_percent": round(float((~active_stun[observed]).mean() * 100), 3),
        "self_movement_percent_of_base": round(float(movement[observed].mean() * 100), 3),
        "mean_slow_percent": round(float(slow[observed].mean() * 100), 3),
        "successful_requests": successful, "blocked_requests": blocked,
        "root_successes": root_successes,
    }


def damage_rows() -> list[dict]:
    result = []
    d = 20
    hp = 500
    for armor in (0, 25, 60):
        mitigation = ARMOR_K / (ARMOR_K + armor)
        for domain in (100, 125, 150, 175, 200, 225):
            m = domain / 100
            main = 2 * d * m * mitigation
            true_damage = 0.4 * d * m
            compression = min(0.04 * hp, d) * m * mitigation
            dot = 0.12 * d * 5 * m * mitigation
            result.append({
                "domain": domain, "armor": armor, "attack": d, "hp": hp,
                "main": main, "true": true_damage, "compression": compression,
                "formation": main + true_damage + compression,
                "basic_total": main + true_damage + compression + dot,
                "normal_pull": 40 * m, "max_collapse_distance": 40 * 1.6 * 1.25 * 1.5 * 1.2 * m * 0.35,
                "one_target_shield_pct": min(0.06 * m, 0.15) * 100,
                "one_target_siphon_pct_before_lifesteal": min(0.012 * m, 0.05) * 100,
            })
    return result


def setup_plot() -> None:
    font = Path("C:/Windows/Fonts/msyh.ttc")
    if font.exists():
        matplotlib.font_manager.fontManager.addfont(str(font))
        plt.rcParams["font.family"] = FontProperties(fname=str(font)).get_name()
    plt.rcParams.update({"axes.unicode_minus": False, "font.size": 11, "figure.dpi": 150})


def plots(progression: dict, controls: list[dict]) -> None:
    setup_plot()
    fig, ax = plt.subplots(figsize=(10, 5.4))
    for policy, label, color in (("normal", "遇到就选，不刷新", "#3564ad"),
                                  ("focus", "未出现时刷新一次", "#ad5635")):
        data = progression[policy]
        x = np.array(data["x"])
        ax.plot(x, data["mean"], label=label, color=color, linewidth=2)
        ax.fill_between(x, data["p10"], data["p90"], alpha=0.14, color=color)
    ax.axhline(200, color="#444444", linestyle="--", linewidth=1, label="候选上限 200")
    ax.set(xlabel="累计属性选择次数（假设角色等级 1→42）", ylabel="领域值（尚未夹紧到上限）",
           title="60 次选择场景：+4 / +6 / +8 / +12，100,000 组抽取\n阴影为 10%—90% 分位区间，未计宝箱品质祝福")
    ax.legend(loc="upper left")
    ax.grid(alpha=0.18)
    fig.tight_layout()
    fig.savefig(OUT / "growth.png", bbox_inches="tight")
    plt.close(fig)

    fig, axes = plt.subplots(2, 2, figsize=(11.5, 8.2))
    for ax, creature, title in ((axes[0, 0], "normal", "普通怪：不能自主移动的时间"),
                                (axes[0, 1], "elite", "精英：不能自主移动的时间")):
        for cap, color in ((0.8, "#3564ad"), (1.2, "#ad5635"), (1.5, "#328469")):
            rows = [r for r in controls if r["schedule"] == "fast_full"
                    and r["creature"] == creature and r["cc_cap"] == cap
                    and r["slow_cap"] == 0.75 and r["stun_enabled"] and r["root_enabled"]
                    and not r["field_pulses_during_collapse"]]
            ax.plot([r["domain"] for r in rows], [r["hard_cc_percent"] for r in rows],
                    marker="o", color=color, label=f"单次硬控上限 {cap:.1f}s")
        ax.set(title=title, xlabel="领域值", ylabel="硬控时间占比（%）", ylim=(0, 100))
        ax.legend(fontsize=8)
        ax.grid(alpha=0.18)
    for ax, creature, title in ((axes[1, 0], "normal", "普通怪：计入减速和硬控后的自主移动"),
                                (axes[1, 1], "boss", "Boss：只计减速，仍可完整出招")):
        for cap, color in ((0.65, "#3564ad"), (0.75, "#ad5635"), (0.85, "#328469")):
            rows = [r for r in controls if r["schedule"] == "fast_full"
                    and r["creature"] == creature and r["cc_cap"] == 1.2
                    and r["slow_cap"] == cap and r["stun_enabled"] and r["root_enabled"]
                    and not r["field_pulses_during_collapse"]]
            ax.plot([r["domain"] for r in rows], [r["self_movement_percent_of_base"] for r in rows],
                    marker="o", color=color, label=f"领域减速上限 {cap:.0%}")
        ax.set(title=title, xlabel="领域值", ylabel="等效自主移速 / 基础移速（%）", ylim=(0, 100))
        ax.legend(fontsize=8)
        ax.grid(alpha=0.18)
    fig.suptitle("持续留在领域内的控场模型：最高攻速、最长黑洞、无量空处＋禁锢\n原递减规则（第三次直接免疫），60 Hz，150 秒，舍弃前 30 秒\n不模拟真实走位、击杀与外力牵引；假设其他目标供满续时", fontsize=11)
    fig.tight_layout(rect=(0, 0, 1, 0.93))
    fig.savefig(OUT / "control.png", bbox_inches="tight")
    plt.close(fig)


def report(data: dict) -> None:
    lines = [
        "# 领域值参数离线模拟 · 2026-11-01", "",
        "本报告评估设计参数，不是已实现武器的实机验收。没有修改运行时、敌人平衡、正式属性表或测试。", "",
        "## 首版参数（用户已确认，尚未接入运行时）", "",
        "| 项目 | 首版确认值 |", "|---|---|",
        "| 白/绿/紫/金领域值 | +4 / +6 / +8 / +12（白档 4 按现有品质倍率取整） |",
        "| 领域值累计上限 | 200，基础为 100，最高独立倍率 ×2 |",
        "| 领域武器最终减速上限 | 75%；Boss 再按现有 0.5 效果倍率，单来源最高 37.5% |",
        "| 单次领域硬控上限 | 普通怪 1.2 秒，精英再乘 0.5 为最多 0.6 秒，Boss 免疫 |", "",
        "用户随后已接受递减规则：100% → 50% → 25%，第三次控制后立即阻止后续申请，到第三次及已存在领域硬控结束后再留足 2 秒免疫，免疫结束清零；主设计第 8.4 节已同步。下文保留原规则与候选的模拟数据/图表作对照，不代表武器已经实现或试玩。", "",
        "## 模型与输入", "",
        f"- 随机种子 {SEED}；每个选择预算 {RUNS:,} 条抽取轨迹，比较 216 组成长参数。",
        "- 40/60/80 次属性消费是预算敏感性场景，不是实际一局必得次数；每组内假设角色等级随选择从 1 均匀升至 42。",
        "- 使用当前 AttributeSystem 的等级品质概率与 1/1.5/2.1/2.9 倍率，整数加点按 JS Math.round 的正数规则取整。",
        "- 六种输出属性中有一种领域值；普通策略不刷新，出现即选；专刷策略未出现时刷新整个面板一次，出现仍必选。其余选择去向不模拟。",
        "- 主表未计宝箱品质祝福与其他属性满额后缩小候选池；额外输出全部领域选择获 +1 品质、四种输出候选的压力场景。",
        "- 150 秒 / 60 Hz 控制时间线，舍弃前 30 秒；三个施法/黑洞场景，扫描领域值、减速上限、硬控上限与敌人类别，共 945 组。",
        "- 目标不死亡、持续位于所有生效范围内。满配 2.2 秒黑洞假设其他目标提供全部击杀续时；不模拟真实走位、几何、敌人 AI、击杀、完整抽卡或净牵引位移。",
        "- 硬控时长向上对齐到固定步；忽略浮点噪声，不把精确百分比当成实机承诺。另比较 36 组收拢期脉冲敏感性、72 组递减候选和 96 组新目标前三秒接触。", "",
        "## 品质梯度比较", "",
        "固定 60 次属性选择、领域值上限 200；均值已夹紧上限。", "",
        "| 梯度 | 策略 | 平均领域值 | 10%–90%区间 | 到顶比例 |",
        "|---|---|---:|---|---:|",
    ]
    for row in data["growth"]:
        if (row["selections"] == 60 and row["cap"] == 200
                and row["policy"] in ("normal", "focus") and not row["all_selected_boosted"]):
            grade = "/".join(map(str, GRADES[row["grade"]]))
            policy = "遇到就选" if row["policy"] == "normal" else "专门刷新"
            lines.append(f"| +{grade} | {policy} | {row['mean']:.1f} | {row['p10']:.0f}–{row['p90']:.0f} | {row['cap_percent']:.1f}% |")
    lines += ["", "+4 档让普通选择保持成长空间，专门投入的长局构筑大多能到顶；+5 档明显提前封顶。+3 档可作为偏保守的替代方案，当前不需要先砍独立乘区覆盖范围。", "",
              "![领域值成长分布](growth.png)", "", "## 上限敏感性", "",
              "+4 档、60 次选择、专门刷新、无品质祝福。", "",
              "| 上限 | 平均领域值 | 到顶比例 |", "|---|---:|---:|"]
    for row in data["growth"]:
        if (row["selections"] == 60 and row["grade"] == "medium"
                and row["policy"] == "focus" and not row["all_selected_boosted"]):
            lines.append(f"| {row['cap']} | {row['mean']:.1f} | {row['cap_percent']:.1f}% |")
    lines += ["", "## 控制上限比较", "",
              "最高攻速、最长黑洞、持续覆盖，沿用原第三次直接免疫的递减。自主移速比只反映减速和硬控，不包含向心牵引；不能当成敌人的实际净移动速度。", "",
              "| 单次硬控上限 | V=200 普通怪硬控时间占比 |",
              "|---|---:|"]
    for row in data["control"]:
        if (row["schedule"] == "fast_full" and row["domain"] == 200
                and row["slow_cap"] == 0.75 and row["creature"] == "normal"):
            lines.append(f"| {row['cc_cap']:.1f} 秒 | {row['hard_cc_percent']:.1f}% |")
    lines += ["", "| 减速上限 | 普通怪等效自主移速比 | Boss 等效自主移速比 |", "|---|---:|---:|"]
    for cap in (0.65, 0.75, 0.85):
        selected = {r["creature"]: r for r in data["control"] if r["schedule"] == "fast_full"
                    and r["domain"] == 200 and r["cc_cap"] == 1.2 and r["slow_cap"] == cap}
        lines.append(f"| {cap:.0%} | {selected['normal']['self_movement_percent_of_base']:.1f}% | {selected['boss']['self_movement_percent_of_base']:.1f}% |")
    lines += ["", "75% 保留普通怪 25% 的未硬控时自主移速下限，Boss 对单次减速保留至少 62.5%；时间线中实际平均仍取决于覆盖。1.2 秒硬控上限能保留基础定身，精英半效与共享免疫继续生效。", "",
              "![控制参数比较](control.png)", "", "## 额外发现：眩晕与禁锢争抢递减次数", "",
              "基础施法周期中，前两次领域眩晕可能先用掉完整/半效次数，收拢时的定身成为第三次而完全被挡。目标持续覆盖的本模型中，原规则的基础节奏定身占比为 0；这不是所有真实敌人都必然出现的结论。", "",
              "| 节奏 | 领域值 | 第三次规则 | 总硬控占比 | 定身占比 | 可攻击时间 |", "|---|---:|---|---:|---:|---:|"]
    for row in data["cc_rule_comparison"]:
        if row["domain"] in (100, 200) and row["creature"] == "normal" and row["stun_enabled"] and row["root_enabled"]:
            name = "基础" if row["schedule"] == "base" else "最高攻速/最长黑洞"
            rule = "直接免疫" if row["third_fraction"] == 0 else "25%后留足2秒免疫"
            lines.append(f"| {name} | {row['domain']} | {rule} | {row['hard_cc_percent']:.1f}% | {row['root_percent']:.1f}% | {row['can_attack_percent']:.1f}% |")
    lines += ["", "该递减方案已获用户确认采用：给禁锢留下有限收益，完整免疫间隔会压低部分长时覆盖场景的总硬控占比；这些仍是离线模型结果，实际表现待实现与试玩。", "",
              "### 新目标前三秒的相位敏感性", "",
              "V=200，12 个入场相位（0–2.2 秒间隔），不是随机真实敌群。短接触并非总会随候选规则下降。", "",
              "| 节奏/普通怪 | 第三次规则 | 平均硬控占比 | 相位最大硬控占比 |", "|---|---|---:|---:|"]
    for schedule in ("base", "fast_full"):
        for third in (0.0, 0.25):
            selected = [r["hard_cc_percent"] for r in data["short_exposures"]
                        if r["schedule"] == schedule and r["creature"] == "normal"
                        and r["third_fraction"] == third]
            name = "基础" if schedule == "base" else "最高攻速/最长黑洞"
            rule = "直接免疫" if third == 0 else "25%后留足2秒免疫"
            lines.append(f"| {name} | {rule} | {np.mean(selected):.1f}% | {max(selected):.1f}% |")
    lines += ["", "因此该候选是改善控制配合的取舍，不是所有场景的纯削控；不能仅用长时平均认定普通波次已平衡。", "",
              "## 复算与证据边界", "",
              "- 从仓库目录运行：`python docs/simulations/domain-value-20261101/simulate.py`；复用现有 Python、NumPy 与 Matplotlib，不安装依赖。",
              "- `results.json` 保存全部参数组合、预算敏感性、伤害公式与短接触场景；脚本生成本报告和两张图。",
              "- +4 领域点在 V=100 时提供 4% 的允许伤害增长，V=150 时为约 2.67%；另有控制/生存收益。作为比较，+2 攻击在 D=20 时为 10% 的攻击力增长，不能把两者当成完全等价的总收益。",
              "- 这些输出用于选择首版参数，无法证明清场效率、Boss 击杀时间、自然构筑分布、游戏帧时间或最终平衡。", ""]
    (OUT / "README.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    growth, progression = growth_model()
    controls = []
    for schedule in SCHEDULES:
        for domain in (100, 125, 150, 175, 200, 225, 250):
            for slow_cap in (0.65, 0.75, 0.85):
                for cc_cap in (0.8, 1.0, 1.2, 1.5, 2.0):
                    for creature in ("normal", "elite", "boss"):
                        controls.append(control_model(schedule, domain, slow_cap, cc_cap, creature))
    sensitivity = [
        control_model("fast_full", domain, 0.75, 1.2, creature, stun, root, during)
        for domain in (100, 150, 200) for creature in ("normal", "elite")
        for stun, root in ((True, False), (False, True), (True, True)) for during in (False, True)
    ]
    cc_rule_comparison = [
        control_model(schedule, domain, 0.75, 1.2, creature, stun, root,
                      third_fraction=third)
        for schedule in ("base", "fast_full") for domain in (100, 150, 200)
        for creature in ("normal", "elite")
        for stun, root in ((True, False), (False, True), (True, True))
        for third in (0.0, 0.25)
    ]
    short_exposures = [
        control_model(schedule, 200, 0.75, 1.2, creature, third_fraction=third,
                      entry_seconds=30 + phase / 5, observation_seconds=3)
        for schedule in ("base", "fast_full") for creature in ("normal", "elite")
        for third in (0.0, 0.25) for phase in range(12)
    ]
    schedule_results = {}
    for name, schedule in SCHEDULES.items():
        starts = np.array(schedule["bh_start_seconds"])
        schedule_results[name] = {
            "first_bh": starts[0], "median_cycle": float(np.median(np.diff(starts))),
            "bh_uptime_after_warmup": float(schedule["bh"][frame(30):].mean()),
        }
    data = {
        "meta": {
            "seed": SEED, "runs_per_budget": RUNS, "fps": FPS,
            "source_revision": "e3ea358 + current domain design draft (2026-11-01)",
            "rarity_weights": RARITY_WEIGHTS.tolist(),
            "grades": GRADES, "policies": POLICIES,
            "assumptions": [
                "40/60/80 attribute consumptions are sensitivity budgets, not observed run totals.",
                "Character level rises linearly from 1 to 42 across each budget.",
                "Always select domain value when offered; other selections are unspecified.",
                "Main pool has six output attributes; stress pool assumes four from the start.",
                "All-selected-boosted case is an upper sensitivity, not actual chest frequencies.",
                "Control target is immortal, never exits active effect coverage, and never dodges.",
                "Full 2.2s black hole assumes maximum allowed kill extension every cycle.",
                "No enemy AI, geometry, combat deaths, natural build RNG, or runtime implementation.",
                "Field stun pulses during collapse are compared as an explicit ambiguity.",
            ],
        },
        "growth": growth, "growth_progression": progression, "control": controls,
        "control_sensitivity": sensitivity, "schedule": schedule_results,
        "cc_rule_comparison": cc_rule_comparison, "short_exposures": short_exposures,
        "damage": damage_rows(),
    }
    (OUT / "results.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    plots(progression, controls)
    report(data)
    print(json.dumps({"schedule": schedule_results, "growth_cases": len(growth),
                      "control_cases": len(controls), "sensitivity_cases": len(sensitivity),
                      "cc_rule_comparison_cases": len(cc_rule_comparison),
                      "short_exposure_cases": len(short_exposures)}, indent=2))


if __name__ == "__main__":
    main()
