import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Static inventory/lint only: never imports game modules, runs the simulation, or changes data.
const root = path.resolve(import.meta.dirname, '..');
const write = process.argv.slice(2).includes('--write');
if (process.argv.slice(2).some(arg => arg !== '--write')) throw new Error('Usage: node scripts/audit-combat-contracts.mjs [--write]');
const configFile = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
if (!configFile) throw new Error('tsconfig.json not found');
const config = ts.readConfigFile(configFile, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
if (parsed.errors.length) throw new Error(parsed.errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const source = file => {
  const found = program.getSourceFile(path.join(root, file));
  if (!found) throw new Error(`Source not in TypeScript project: ${file}`);
  return found;
};
const location = node => {
  const file = node.getSourceFile();
  return { file: relative(file.fileName), line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 };
};
const errors = [];
const calls = [];
const hpWrites = [];
const optionsIndex = new Map([['hurtEnemy', 4], ['damagePlayer', 1], ['applyEnemyDotDamage', 3]]);
const required = ['type', 'form', 'skillId'];
for (const file of program.getSourceFiles()) {
  if (!relative(file.fileName).startsWith('src/')) continue;
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const name = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text
        : ts.isIdentifier(node.expression) ? node.expression.text : '';
      if (optionsIndex.has(name)) {
        const options = node.arguments[optionsIndex.get(name)];
        const type = options ? checker.getTypeAtLocation(options) : undefined;
        const fields = {};
        for (const field of required) {
          const symbol = type && checker.getPropertyOfType(type, field);
          const fieldType = symbol && checker.getTypeOfSymbolAtLocation(symbol, options);
          const members = fieldType?.isUnion() ? fieldType.types : fieldType ? [fieldType] : [];
          const invalid = members.some(member => member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Any | ts.TypeFlags.Unknown)) ||
            members.some(member => (member.flags & ts.TypeFlags.StringLiteral) && member.value.length === 0);
          if (!symbol || (symbol.flags & ts.SymbolFlags.Optional) || invalid) {
            fields[field] = 'MISSING';
          } else {
            fields[field] = checker.typeToString(fieldType);
          }
        }
        const at = location(node);
        const missing = required.filter(field => fields[field] === 'MISSING');
        if (missing.length) errors.push(`${at.file}:${at.line} ${name}: missing explicit ${missing.join(', ')}`);
        calls.push({ ...at, name, ...fields });
      }
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.MinusEqualsToken &&
      ts.isPropertyAccessExpression(node.left) && node.left.name.text === 'hp') {
      let owner = node.parent;
      while (owner && !ts.isFunctionDeclaration(owner)) owner = owner.parent;
      const at = location(node);
      const name = owner?.name?.text ?? '';
      const allowed = (at.file === 'src/game/core/EnemyDamageApplication.ts' && name === 'applyEnemyHpDamage') ||
        (at.file === 'src/game/core/CombatSystem.ts' && name === 'damagePlayer');
      if (!allowed) errors.push(`${at.file}:${at.line}: HP subtraction bypasses application layer`);
      hpWrites.push({ ...at, name });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
}

function unwrap(node) {
  while (node && (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node))) node = node.expression;
  return node;
}
function object(node, seen = new Set()) {
  node = unwrap(node);
  if (node && ts.isObjectLiteralExpression(node)) return node;
  if (node && ts.isIdentifier(node)) {
    let symbol = checker.getSymbolAtLocation(node);
    if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const declaration = symbol?.valueDeclaration;
    if (declaration && ts.isVariableDeclaration(declaration) && !seen.has(declaration)) {
      seen.add(declaration);
      return object(declaration.initializer, seen);
    }
  }
  throw new Error(`Cannot inventory non-static object: ${node?.getText() ?? 'missing'}`);
}
function properties(node) {
  const result = new Map();
  for (const property of object(node).properties) {
    if (!ts.isPropertyAssignment(property) || !property.name) throw new Error(`Unsupported object property: ${property.getText()}`);
    const name = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : undefined;
    if (!name) throw new Error(`Unsupported property name: ${property.name.getText()}`);
    result.set(name, property.initializer);
  }
  return result;
}
function variable(file, name) {
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const found = statement.declarationList.declarations.find(d => d.name.getText() === name);
    if (found) return found.initializer;
  }
  throw new Error(`Declaration not found: ${name}`);
}
function value(node, fallback = '0（缺省）') {
  if (!node) return fallback;
  node = unwrap(node);
  return ts.isStringLiteral(node) ? node.text : node.getText().replaceAll(/\s+/g, ' ');
}
const damageTypes = properties(variable(source('src/game/data/damageTypes.ts'), 'DAMAGE_TYPES'));
const resistanceTypes = [...damageTypes].filter(([, node]) => value(properties(node).get('mitigation')) === 'resistance').map(([key]) => key);
const profiles = [];
const profileFile = source('src/game/data/attackProfiles.ts');
for (const statement of profileFile.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (!declaration.name.getText().endsWith('_ATTACK_PROFILES')) continue;
    for (const [name, node] of properties(declaration.initializer)) {
      const fields = properties(node);
      const row = { table: declaration.name.getText(), name, ...location(node) };
      for (const field of required) {
        if (!fields.has(field)) errors.push(`${row.table}.${name}: missing ${field}`);
        row[field] = value(fields.get(field), 'MISSING');
      }
      profiles.push(row);
    }
  }
}
for (const row of profiles) {
  if (!damageTypes.has(row.type)) errors.push(`Unregistered profile type: ${row.table}.${row.name} -> ${row.type}`);
  if (!['melee', 'ranged', 'other'].includes(row.form)) errors.push(`Unknown profile form: ${row.table}.${row.name} -> ${row.form}`);
}
const monsters = [...properties(variable(source('src/game/data/enemies.ts'), 'ETYPES'))].map(([id, node]) => {
  const cfg = properties(node);
  const resistance = cfg.has('resistances') ? properties(cfg.get('resistances')) : new Map();
  return { id, hp: value(cfg.get('hp')), damage: value(cfg.get('dmg')),
    defense: value(cfg.get('defense')), tough: value(cfg.get('tough')),
    resistances: resistanceTypes.map(key => value(resistance.get(key))), ...location(object(node)) };
});
const enemyEntries = unwrap(variable(source('src/game/codex/codexData.ts'), 'ENEMY_ENTRIES'));
if (!ts.isArrayLiteralExpression(enemyEntries)) throw new Error('ENEMY_ENTRIES must be a static array for inventory');
const codex = enemyEntries.elements.map(node => {
  const entry = properties(node);
  return { name: value(entry.get('name')), link: value(entry.get('link'), ''),
    role: entry.has('boss') ? '首领' : entry.has('elite') ? '精英' : '普通/特殊/子体' };
});
for (const entry of codex) {
  if (!monsters.some(monster => monster.id === entry.link)) errors.push(`Codex points to unknown config: ${entry.name} -> ${entry.link}`);
}
const configsWithoutCodex = monsters.filter(monster => !codex.some(entry => entry.link === monster.id)).map(monster => monster.id);
const uniqueSkills = new Set();
for (const row of profiles) {
  if (!row.skillId || uniqueSkills.has(row.skillId)) errors.push(`Duplicate/empty skillId: ${row.skillId}`);
  uniqueSkills.add(row.skillId);
}
if (calls.length === 0 || profiles.length === 0 || monsters.length === 0) errors.push('Empty combat inventory');
const summary = { attackProfiles: profiles.length, classifiedCalls: calls.length, hpSubtractionSites: hpWrites.length,
  monsterConfigs: monsters.length, enemyCodexEntries: codex.length, configsWithoutCodex, resistanceTypes, errors };
console.log(JSON.stringify(summary, null, 2));
if (errors.length) process.exitCode = 1;
else if (write) {
  const cell = text => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
  const table = (headers, rows) => [headers, headers.map(() => '---'), ...rows].map(row => `| ${row.map(cell).join(' | ')} |`).join('\n');
  const at = row => `[${row.file}:${row.line}](../${row.file})`;
  const report = [
    '# 现有战斗内容覆盖清单',
    '> 由 node scripts/audit-combat-contracts.mjs --write 从当前 TypeScript 源码生成；静态声明与接线检查，不是运行时或平衡验收。',
    `共 ${profiles.length} 个攻击声明、${calls.length} 个明确分类的受击调用点、${monsters.length} 份怪物配置，对应 ${codex.length} 条图鉴；HP 扣除收口为 ${hpWrites.length} 处。`,
    '## 1. 攻击声明目录',
    '元素使模板的 type 在实际调用处由当前元素覆盖；离子弹头和真伤升级同样显式覆盖 type，form 与技能身份保持独立。领域生命压缩声明身份但不继承增伤。共享一个结算预算的附属束/脉冲/反应使用对应组的技能键，不额外拆分命中。',
    table(['声明表', '攻击', '默认 type', 'form', 'skillId'], profiles.map(row => [row.table, row.name, row.type, row.form, row.skillId])),
    '## 2. 实际受击调用点',
    '直接入口必须提供非可选的 type / form / skillId；表中的联合类型表示当前路径的合法变体。包装入口的兼容缺省不作为新增攻击的声明。',
    table(['源码', '入口', 'type', 'form', 'skillId'], calls.map(row => [at(row), row.name, row.type, row.form, row.skillId])),
    '## 3. 全部怪物基础防御',
    '值来自 ETYPES 及其引用配置，尚未乘生成波次/精英/难度；缺省明确按 0 展示，工具不向配置写入中性字段。物理/引力共用护甲；抗性只列注册表中 resistance 策略类型。控制免疫/递减由独立系统拥有，不能由抗性数值推导。',
    table(['类型', '基础HP', '基础攻击', '护甲', '通用减伤', ...resistanceTypes, '来源'],
      monsters.map(row => [row.id, row.hp, row.damage, row.defense, row.tough, ...row.resistances, at(row)])),
    ...monsters.filter(monster => codex.filter(entry => entry.link === monster.id).length > 1).map(monster =>
      `${codex.filter(entry => entry.link === monster.id).map(entry => `${entry.name}（${entry.role}）`).join('、')} 共用 ${monster.id} 基础配置；生成修正单独应用，因此配置数与图鉴条目数不同。`),
    table(['图鉴', '角色', '配置'], codex.map(row => [row.name, row.role, row.link])),
    `无图鉴引用的配置：${configsWithoutCodex.length ? configsWithoutCodex.join('、') : '无'}。未来若为隐藏子体等故意省略，需在内容契约记录原因。`,
    '## 4. HP 应用收口',
    table(['源码', '函数'], hpWrites.map(row => [at(row), row.name])),
    '## 5. 保留的机制语义',
    '- 快照：弹丸按发射时，旧燃烧 DPS 按施加时而增伤按跳取，元素 DoT 按跳实时，导弹按齐射，领域按场/洞快照；不重排 RNG。',
    '- 触发：普通命中、连续 hit 与 dot 分开；各武器继续拥有暴击、吸血、XP 和派生共享预算，纯 DoT 不获得普通命中特效。',
    '- 防守：护甲/元素抗性/tough 在纯计算层；盾/闪避/无敌、最终难度与 Boss 状态在编排/应用层；控制规则独立。',
    '- 历史：连锁继承上一击已应用伤害、最高命中记录时点、领域主分量吸血与各调用侧死亡顺序保留；不借整理改平衡。',
    '- 本工具只检查实际入口的显式字段与 HP 扣除位置，不证明每项机制的运行时结果；编译与构建另行执行。',
  ].join('\n\n') + '\n';
  fs.writeFileSync(path.join(root, 'docs/combat-coverage.md'), report, 'utf8');
  console.log('Wrote docs/combat-coverage.md');
}
