import {readFileSync,writeFileSync} from 'node:fs';
const path='src/game/core/Simulation.ts';const source=readFileSync(path,'utf8');
const chunks=[['PlayerSystem','updatePlayer','  // ---- 玩家移动 ----','  // ---- 相机'],['AttackSystem','updateAttacks','  // ---- 自动攻击 ----','  // ---- 子弹 ----'],['ProjectileSystem','updateProjectiles','  // ---- 子弹 ----','  // ---- 波次推进'],['WaveSystem','updateWave','  // ---- 波次推进','  // ---- 敌人 AI ----'],['EnemySystem','updateEnemies','  // ---- 敌人 AI ----','  // ---- 宝石 & 药水 ----'],['ProgressionSystem','updateProgression','  // ---- 宝石 & 药水 ----','  // ---- 粒子 /'],['EffectsSystem','updateEffects','  // ---- 粒子 /',null]];
for(const [file,name,start,end] of chunks){
 const section=source.slice(source.indexOf(start),end?source.indexOf(end):source.lastIndexOf('}'));
 const content=`\nexport function ${name}(this:GameCore,dt:number){\n  const p=this.player;\n${section}\n}\n`;
 const target=`src/game/core/${file}.ts`;
 if(['WaveSystem','EnemySystem'].includes(file))writeFileSync(target,readFileSync(target,'utf8')+content);
 else writeFileSync(target,`import type {GameCore} from './GameCore';\nimport {WORLD,VIEW,clamp} from '../data/constants';\n`+content);
}
writeFileSync(path,`import type {GameCore} from './GameCore';\nimport {VIEW,WORLD,clamp} from '../data/constants';\n`+chunks.map(([file,name])=>`import {${name}} from './${file}';`).join('\n')+`\n/** Original update order is significant (projectiles → waves → AI → pickups). */\nexport function update(this:GameCore,dt:number){\nthis.time+=dt;\nupdatePlayer.call(this,dt);\nthis.cam.x=clamp(this.player.x-VIEW.w/2,0,WORLD.w-VIEW.w);\nthis.cam.y=clamp(this.player.y-VIEW.h/2,0,WORLD.h-VIEW.h);\nupdateAttacks.call(this,dt);\nif(updateProjectiles.call(this,dt))return;\nupdateWave.call(this,dt);\nif(updateEnemies.call(this,dt))return;\nupdateProgression.call(this,dt);\nupdateEffects.call(this,dt);\n}\n`);
// Extracted early returns now signal termination to the orchestrator.
for(const file of ['ProjectileSystem','EnemySystem']){const p=`src/game/core/${file}.ts`;writeFileSync(p,readFileSync(p,'utf8').replace(/if \(this.damagePlayer\((.*?)\)\) return;/g,'if (this.damagePlayer($1)) return true;'));}
