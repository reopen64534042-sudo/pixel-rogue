# 现有战斗内容覆盖清单

> 由 node scripts/audit-combat-contracts.mjs --write 从当前 TypeScript 源码生成；静态声明与接线检查，不是运行时或平衡验收。

共 75 个攻击声明、40 个明确分类的受击调用点、17 份怪物配置，对应 18 条图鉴；HP 扣除收口为 2 处。

## 1. 攻击声明目录

元素使模板的 type 在实际调用处由当前元素覆盖；离子弹头和真伤升级同样显式覆盖 type，form 与技能身份保持独立。领域生命压缩声明身份但不继承增伤。共享一个结算预算的附属束/脉冲/反应使用对应组的技能键，不额外拆分命中。

| 声明表 | 攻击 | 默认 type | form | skillId |
| --- | --- | --- | --- | --- |
| ENEMY_ATTACK_PROFILES | lob | fire | ranged | enemy:lob |
| ENEMY_ATTACK_PROFILES | thrust | physical | melee | enemy:thrust |
| ENEMY_ATTACK_PROFILES | tether | lightning | ranged | enemy:tether |
| ENEMY_ATTACK_PROFILES | stomp | physical | melee | enemy:stomp |
| ENEMY_ATTACK_PROFILES | gaze | lightning | ranged | enemy:gaze |
| ENEMY_ATTACK_PROFILES | collapse | lightning | ranged | enemy:collapse |
| ENEMY_ATTACK_PROFILES | sonic | physical | melee | enemy:sonic |
| BOSS_ATTACK_PROFILES | stomp | physical | melee | boss:stomp |
| BOSS_ATTACK_PROFILES | charge | physical | melee | boss:charge |
| BOSS_ATTACK_PROFILES | breath | fire | other | boss:breath |
| BOSS_ATTACK_PROFILES | nova | frost | other | boss:nova |
| BOSS_ATTACK_PROFILES | spikes | frost | other | boss:spikes |
| BOSS_ATTACK_PROFILES | marks | lightning | other | boss:marks |
| BOSS_ATTACK_PROFILES | chain | lightning | other | boss:chain |
| PLAYER_ATTACK_PROFILES | bullet | physical | ranged | charged:bullet |
| PLAYER_ATTACK_PROFILES | chargedBullet | physical | ranged | charged:special |
| PLAYER_ATTACK_PROFILES | fission | physical | ranged | charged:fission |
| PLAYER_ATTACK_PROFILES | counterShot | physical | ranged | charged:counter |
| PLAYER_ATTACK_PROFILES | trail | physical | ranged | charged:trail |
| PLAYER_ATTACK_PROFILES | reflect | physical | ranged | common:reflect |
| PLAYER_ATTACK_PROFILES | orbit | physical | other | common:orbit |
| PLAYER_ATTACK_PROFILES | warriorOrbit | physical | melee | warrior:orbit |
| PLAYER_ATTACK_PROFILES | meteor | fire | other | common:meteor |
| PLAYER_ATTACK_PROFILES | legacyLaser | physical | other | charged:legacyLaser |
| PLAYER_ATTACK_PROFILES | legacyMissile | physical | other | charged:legacyMissile |
| PLAYER_ATTACK_PROFILES | laserMain | physical | ranged | laser:main |
| PLAYER_ATTACK_PROFILES | laserAux | physical | ranged | laser:auxiliary |
| PLAYER_ATTACK_PROFILES | laserPulse | physical | ranged | laser:pulse |
| PLAYER_ATTACK_PROFILES | laserScatter | physical | ranged | laser:scatter |
| PLAYER_ATTACK_PROFILES | missileMain | physical | ranged | missile:main |
| PLAYER_ATTACK_PROFILES | missileSwarm | physical | ranged | missile:swarm |
| PLAYER_ATTACK_PROFILES | missileArc | lightning | ranged | missile:arc |
| PLAYER_ATTACK_PROFILES | missileDecode | true | ranged | missile:decode |
| PLAYER_ATTACK_PROFILES | missileResonance | lightning | ranged | missile:resonance |
| PLAYER_ATTACK_PROFILES | missileBurn | fire | ranged | missile:burn |
| PLAYER_ATTACK_PROFILES | mageBody | fire | other | mage:body |
| PLAYER_ATTACK_PROFILES | mageEcho | fire | other | mage:echo |
| PLAYER_ATTACK_PROFILES | magePrism | fire | other | mage:prism |
| PLAYER_ATTACK_PROFILES | mageRefract | fire | other | mage:refract |
| PLAYER_ATTACK_PROFILES | mageShadow | fire | other | mage:shadow |
| PLAYER_ATTACK_PROFILES | mageChain | lightning | other | mage:chain |
| PLAYER_ATTACK_PROFILES | mageReaction | fire | other | mage:reaction |
| PLAYER_ATTACK_PROFILES | mageReactionEcho | fire | other | mage:reactionEcho |
| PLAYER_ATTACK_PROFILES | mageBurn | fire | other | mage:burn |
| PLAYER_ATTACK_PROFILES | katanaSwing | physical | melee | katana:swing |
| PLAYER_ATTACK_PROFILES | greatswordSwing | physical | melee | greatsword:swing |
| PLAYER_ATTACK_PROFILES | warriorIai | physical | melee | warrior:iai |
| PLAYER_ATTACK_PROFILES | warriorTri | physical | melee | warrior:tri |
| PLAYER_ATTACK_PROFILES | warriorLeap | physical | melee | warrior:leap |
| PLAYER_ATTACK_PROFILES | warriorEcho | physical | melee | warrior:echo |
| PLAYER_ATTACK_PROFILES | warriorDash | physical | melee | warrior:dash |
| PLAYER_ATTACK_PROFILES | qi | physical | melee | warrior:qi |
| PLAYER_ATTACK_PROFILES | fissure | physical | melee | warrior:fissure |
| PLAYER_ATTACK_PROFILES | domainField | gravity | other | domain:field |
| PLAYER_ATTACK_PROFILES | domainHole | gravity | other | domain:hole |
| PLAYER_ATTACK_PROFILES | domainFieldSlash | gravity | other | domain:fieldSlash |
| PLAYER_ATTACK_PROFILES | domainHoleSlash | gravity | other | domain:holeSlash |
| PLAYER_ATTACK_PROFILES | domainTerminal | gravity | other | domain:terminal |
| PLAYER_ATTACK_PROFILES | domainBirth | gravity | other | domain:birth |
| PLAYER_ATTACK_PROFILES | domainTrue | true | other | domain:true |
| PLAYER_ATTACK_PROFILES | domainCompression | gravity | other | domain:compression |
| PLAYER_ATTACK_PROFILES | chain | lightning | other | common:chain |
| PLAYER_ATTACK_PROFILES | burn | fire | other | common:burn |
| PLAYER_ATTACK_PROFILES | ground | fire | other | common:ground |
| PLAYER_ATTACK_PROFILES | explode | fire | other | common:explode |
| PLAYER_ATTACK_PROFILES | shock | physical | melee | warrior:shieldShock |
| PLAYER_ATTACK_PROFILES | thorns | physical | other | warrior:thorns |
| HOSTILE_ATTACK_PROFILES | projectile | physical | ranged | enemy:projectile |
| HOSTILE_ATTACK_PROFILES | contact | physical | melee | enemy:contact |
| HOSTILE_ATTACK_PROFILES | chargeContact | physical | melee | enemy:chargeContact |
| HOSTILE_ATTACK_PROFILES | bomber | fire | other | enemy:bomber |
| HOSTILE_ATTACK_PROFILES | eliteNova | frost | other | enemy:eliteNova |
| HOSTILE_ATTACK_PROFILES | groundFire | fire | other | enemy:ground:fire |
| HOSTILE_ATTACK_PROFILES | groundFrost | frost | other | enemy:ground:frost |
| HOSTILE_ATTACK_PROFILES | groundLightning | lightning | other | enemy:ground:lightning |

## 2. 实际受击调用点

直接入口必须提供非可选的 type / form / skillId；表中的联合类型表示当前路径的合法变体。包装入口的兼容缺省不作为新增攻击的声明。

| 源码 | 入口 | type | form | skillId |
| --- | --- | --- | --- | --- |
| [src/game/core/HostileHazards.ts:25](../src/game/core/HostileHazards.ts) | damagePlayer | "physical" \| "gravity" \| "fire" \| "frost" \| "lightning" \| "true" | AttackForm | string |
| [src/game/core/BossSystem.ts:163](../src/game/core/BossSystem.ts) | damagePlayer | "physical" \| "fire" \| "frost" \| "lightning" | "melee" \| "other" | "boss:stomp" \| "boss:charge" \| "boss:breath" \| "boss:nova" \| "boss:spikes" \| "boss:marks" \| "boss:chain" |
| [src/game/core/DomainSystem.ts:207](../src/game/core/DomainSystem.ts) | hurtEnemy | "gravity" | "other" | "domain:field" \| "domain:hole" \| "domain:fieldSlash" \| "domain:holeSlash" \| "domain:terminal" |
| [src/game/core/DomainSystem.ts:288](../src/game/core/DomainSystem.ts) | hurtEnemy | "gravity" | "other" | "domain:birth" |
| [src/game/core/MissileCombat.ts:12](../src/game/core/MissileCombat.ts) | hurtEnemy | "physical" \| "gravity" \| "fire" \| "frost" \| "lightning" \| "true" | AttackForm | string |
| [src/game/core/MissileCombat.ts:107](../src/game/core/MissileCombat.ts) | hurtEnemy | "physical" \| "lightning" | "ranged" | "missile:main" \| "missile:swarm" |
| [src/game/core/MissileCombat.ts:193](../src/game/core/MissileCombat.ts) | hurtEnemy | "fire" | "ranged" | "missile:burn" |
| [src/game/core/LaserSystem.ts:132](../src/game/core/LaserSystem.ts) | hurtEnemy | "physical" | "ranged" | "laser:main" |
| [src/game/core/LaserSystem.ts:159](../src/game/core/LaserSystem.ts) | hurtEnemy | "physical" | "ranged" | "laser:auxiliary" |
| [src/game/core/LaserSystem.ts:232](../src/game/core/LaserSystem.ts) | hurtEnemy | "physical" | "ranged" | "laser:pulse" |
| [src/game/core/LaserSystem.ts:252](../src/game/core/LaserSystem.ts) | hurtEnemy | "physical" | "ranged" | "laser:scatter" |
| [src/game/core/EnemyBehaviors.ts:32](../src/game/core/EnemyBehaviors.ts) | damagePlayer | "physical" \| "fire" \| "lightning" | "ranged" \| "melee" | "enemy:lob" \| "enemy:thrust" \| "enemy:tether" \| "enemy:stomp" \| "enemy:gaze" \| "enemy:collapse" \| "enemy:sonic" |
| [src/game/core/ElementSystem.ts:158](../src/game/core/ElementSystem.ts) | hurtEnemy | MageElement | "other" | "mage:reaction" |
| [src/game/core/ElementSystem.ts:186](../src/game/core/ElementSystem.ts) | hurtEnemy | MageElement | "other" | "mage:reactionEcho" |
| [src/game/core/ElementSystem.ts:417](../src/game/core/ElementSystem.ts) | hurtEnemy | "lightning" | "other" | "mage:chain" |
| [src/game/core/ElementSystem.ts:881](../src/game/core/ElementSystem.ts) | applyEnemyDotDamage | "physical" \| "gravity" \| "fire" \| "frost" \| "lightning" \| "true" | "other" | "mage:burn" |
| [src/game/core/CombatSystem.ts:415](../src/game/core/CombatSystem.ts) | hurtEnemy | "lightning" | "other" | "common:chain" |
| [src/game/core/CombatSystem.ts:636](../src/game/core/CombatSystem.ts) | hurtEnemy | "fire" | "other" | "common:explode" |
| [src/game/core/CombatSystem.ts:814](../src/game/core/CombatSystem.ts) | hurtEnemy | "physical" | "melee" | "warrior:shieldShock" |
| [src/game/core/CombatSystem.ts:921](../src/game/core/CombatSystem.ts) | hurtEnemy | "physical" | "other" | "warrior:thorns" |
| [src/game/core/CombatSystem.ts:971](../src/game/core/CombatSystem.ts) | applyEnemyDotDamage | "physical" \| "gravity" \| "fire" \| "frost" \| "lightning" \| "true" | AttackForm | string |
| [src/game/core/MeleeSystem.ts:108](../src/game/core/MeleeSystem.ts) | hurtEnemy | "physical" \| "gravity" \| "fire" \| "frost" \| "lightning" \| "true" | AttackForm | string |
| [src/game/core/EnemySystem.ts:366](../src/game/core/EnemySystem.ts) | damagePlayer | "frost" | "other" | "enemy:eliteNova" |
| [src/game/core/EnemySystem.ts:482](../src/game/core/EnemySystem.ts) | damagePlayer | "fire" | "other" | "enemy:bomber" |
| [src/game/core/EnemySystem.ts:778](../src/game/core/EnemySystem.ts) | damagePlayer | "physical" | "melee" | "enemy:contact" \| "enemy:chargeContact" |
| [src/game/core/MageSystem.ts:140](../src/game/core/MageSystem.ts) | hurtEnemy | MageElement | "other" | "mage:body" |
| [src/game/core/MageSystem.ts:217](../src/game/core/MageSystem.ts) | hurtEnemy | MageElement | "other" | "mage:echo" |
| [src/game/core/MageSystem.ts:307](../src/game/core/MageSystem.ts) | hurtEnemy | MageElement | "other" | "mage:prism" |
| [src/game/core/MageSystem.ts:392](../src/game/core/MageSystem.ts) | hurtEnemy | MageElement | "other" | "mage:refract" |
| [src/game/core/MageSystem.ts:498](../src/game/core/MageSystem.ts) | hurtEnemy | MageElement | "other" | "mage:shadow" |
| [src/game/core/SpecialSystem.ts:83](../src/game/core/SpecialSystem.ts) | hurtEnemy | "physical" \| "true" | "other" | "charged:legacyLaser" |
| [src/game/core/SpecialSystem.ts:170](../src/game/core/SpecialSystem.ts) | hurtEnemy | "physical" | "other" | "charged:legacyMissile" |
| [src/game/core/WarriorSystem.ts:403](../src/game/core/WarriorSystem.ts) | hurtEnemy | "physical" | "melee" | "warrior:qi" \| "warrior:fissure" |
| [src/game/core/WarriorSystem.ts:467](../src/game/core/WarriorSystem.ts) | hurtEnemy | "physical" | "melee" | "warrior:dash" |
| [src/game/core/AttackSystem.ts:202](../src/game/core/AttackSystem.ts) | hurtEnemy | "physical" | "melee" \| "other" | "common:orbit" \| "warrior:orbit" |
| [src/game/core/AttackSystem.ts:297](../src/game/core/AttackSystem.ts) | hurtEnemy | "fire" | "other" | "common:meteor" |
| [src/game/core/ProjectileSystem.ts:101](../src/game/core/ProjectileSystem.ts) | hurtEnemy | "physical" \| "gravity" \| "fire" \| "frost" \| "lightning" \| "true" | AttackForm | string |
| [src/game/core/ProjectileSystem.ts:168](../src/game/core/ProjectileSystem.ts) | hurtEnemy | "physical" | "ranged" | "charged:trail" |
| [src/game/core/ProjectileSystem.ts:229](../src/game/core/ProjectileSystem.ts) | hurtEnemy | "physical" | "ranged" | "common:reflect" |
| [src/game/core/ProjectileSystem.ts:255](../src/game/core/ProjectileSystem.ts) | damagePlayer | "physical" \| "gravity" \| "fire" \| "frost" \| "lightning" \| "true" | AttackForm | string |

## 3. 全部怪物基础防御

值来自 ETYPES 及其引用配置，尚未乘生成波次/精英/难度；缺省明确按 0 展示，工具不向配置写入中性字段。物理/引力共用护甲；抗性只列注册表中 resistance 策略类型。控制免疫/递减由独立系统拥有，不能由抗性数值推导。

| 类型 | 基础HP | 基础攻击 | 护甲 | 通用减伤 | fire | frost | lightning | 来源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lobber | 30 | 14 | 18 | 0（缺省） | 0.55 | -0.15 | 0（缺省） | [src/game/data/enemies.ts:4](../src/game/data/enemies.ts) |
| bulwark | 55 | 12 | 45 | 0（缺省） | -0.1 | 0.2 | 0（缺省） | [src/game/data/enemies.ts:6](../src/game/data/enemies.ts) |
| tether | 24 | 10 | 10 | 0（缺省） | 0（缺省） | -0.1 | 0.4 | [src/game/data/enemies.ts:8](../src/game/data/enemies.ts) |
| shooter_elite | 32 | 12 | 12 | 0（缺省） | 0.1 | 0.15 | 0.45 | [src/game/data/enemies.ts:10](../src/game/data/enemies.ts) |
| drummer_elite | 40 | 8 | 12 | 0（缺省） | 0.1 | 0（缺省） | 0.2 | [src/game/data/enemies.ts:13](../src/game/data/enemies.ts) |
| boss_three | 1600 | 24 | 60 | 0（缺省） | 0.1 | 0.1 | 0.1 | [src/game/data/boss.ts:4](../src/game/data/boss.ts) |
| slime | 19 | 10 | 25 | 0（缺省） | 0.15 | 0（缺省） | 0.05 | [src/game/data/enemies.ts:17](../src/game/data/enemies.ts) |
| bat | 13 | 8 | 10 | 0（缺省） | 0.15 | 0（缺省） | 0（缺省） | [src/game/data/enemies.ts:29](../src/game/data/enemies.ts) |
| brute | 65 | 18 | 60 | 0（缺省） | 0.3 | -0.2 | 0（缺省） | [src/game/data/enemies.ts:30](../src/game/data/enemies.ts) |
| shooter | 22 | 10 | 15 | 0（缺省） | 0.1 | 0.15 | 0.45 | [src/game/data/enemies.ts:43](../src/game/data/enemies.ts) |
| bomber | 16 | 20 | 18 | 0（缺省） | 0.55 | -0.2 | 0（缺省） | [src/game/data/enemies.ts:55](../src/game/data/enemies.ts) |
| splitter | 30 | 9 | 20 | 0（缺省） | 0.2 | -0.1 | 0（缺省） | [src/game/data/enemies.ts:67](../src/game/data/enemies.ts) |
| splitling | 12 | 5 | 10 | 0（缺省） | 0.2 | -0.1 | 0（缺省） | [src/game/data/enemies.ts:80](../src/game/data/enemies.ts) |
| charger | 44 | 14 | 30 | 0（缺省） | 0.15 | -0.15 | 0（缺省） | [src/game/data/enemies.ts:92](../src/game/data/enemies.ts) |
| drummer | 28 | 6 | 10 | 0（缺省） | 0.1 | 0（缺省） | 0.2 | [src/game/data/enemies.ts:104](../src/game/data/enemies.ts) |
| spinner | 26 | 8 | 12 | 0（缺省） | 0.2 | -0.1 | 0（缺省） | [src/game/data/enemies.ts:116](../src/game/data/enemies.ts) |
| burrower | 40 | 16 | 20 | 0（缺省） | 0.1 | 0.15 | 0（缺省） | [src/game/data/enemies.ts:128](../src/game/data/enemies.ts) |

岩石兽（普通/特殊/子体）、岩石巨兽（精英） 共用 brute 基础配置；生成修正单独应用，因此配置数与图鉴条目数不同。

| 图鉴 | 角色 | 配置 |
| --- | --- | --- |
| 熔岩投手 | 普通/特殊/子体 | lobber |
| 晶甲虫 | 普通/特殊/子体 | bulwark |
| 缚电水母 | 普通/特殊/子体 | tether |
| 飞行眼魔 | 精英 | shooter_elite |
| 战鼓祭司 | 精英 | drummer_elite |
| 三首巨兽 | 首领 | boss_three |
| 史莱姆 | 普通/特殊/子体 | slime |
| 蝙蝠 | 普通/特殊/子体 | bat |
| 岩石兽 | 普通/特殊/子体 | brute |
| 射手 | 普通/特殊/子体 | shooter |
| 火囊虫 | 普通/特殊/子体 | bomber |
| 裂胶史莱姆 | 普通/特殊/子体 | splitter |
| 小史莱姆 | 普通/特殊/子体 | splitling |
| 角兽 | 普通/特殊/子体 | charger |
| 战鼓手 | 普通/特殊/子体 | drummer |
| 织网蛛 | 普通/特殊/子体 | spinner |
| 掘地虫 | 普通/特殊/子体 | burrower |
| 岩石巨兽 | 精英 | brute |

无图鉴引用的配置：无。未来若为隐藏子体等故意省略，需在内容契约记录原因。

## 4. HP 应用收口

| 源码 | 函数 |
| --- | --- |
| [src/game/core/EnemyDamageApplication.ts:13](../src/game/core/EnemyDamageApplication.ts) | applyEnemyHpDamage |
| [src/game/core/CombatSystem.ts:874](../src/game/core/CombatSystem.ts) | damagePlayer |

## 5. 保留的机制语义

- 快照：弹丸按发射时，旧燃烧 DPS 按施加时而增伤按跳取，元素 DoT 按跳实时，导弹按齐射，领域按场/洞快照；不重排 RNG。

- 触发：普通命中、连续 hit 与 dot 分开；各武器继续拥有暴击、吸血、XP 和派生共享预算，纯 DoT 不获得普通命中特效。

- 防守：护甲/元素抗性/tough 在纯计算层；盾/闪避/无敌、最终难度与 Boss 状态在编排/应用层；控制规则独立。

- 历史：连锁继承上一击已应用伤害、最高命中记录时点、领域主分量吸血与各调用侧死亡顺序保留；不借整理改平衡。

- 本工具只检查实际入口的显式字段与 HP 扣除位置，不证明每项机制的运行时结果；编译与构建另行执行。
