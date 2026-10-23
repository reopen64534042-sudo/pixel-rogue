// One-time mechanical extraction from the protected original. Not a runtime/build dependency.
import ts from 'typescript';
import {readFileSync,writeFileSync} from 'node:fs';
const html=readFileSync('legacy/original.html','utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const ast=ts.createSourceFile('original.js',js,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).map(n=>[n.name.text,n.getText(ast)]));
const declarations=new Map();
for(const s of ast.statements) if(ts.isVariableStatement(s)) for(const d of s.declarationList.declarations) declarations.set(d.name.getText(ast),d.initializer?.getText(ast));
const write=(p,s)=>writeFileSync(p,s+'\n');
write('src/game/data/constants.ts',`export const W=480,H=270;\nexport const VIEW={w:W,h:H};\nexport const WORLD={w:1680,h:1232};\nexport const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));\nexport ${functions.get('fmtTime').replace('function fmtTime(t)','function fmtTime(t:number)')}`);
write('src/game/data/talents.ts',`import type {Talent} from '../core/types';\nexport const UPGRADES:Talent[]=${declarations.get('UPGRADES')};\n`+['TIERS','TIER_VAL','TIER_COLOR','RAMP','DMG_POOL'].map(n=>`export const ${n}=${declarations.get(n)};`).join('\n')+`\nexport const CAT_COLOR:Record<string,string>=${declarations.get('CAT_COLOR')};\nexport const CAT_ICO:Record<string,string>=${declarations.get('CAT_ICO')};`);
write('src/game/data/enemies.ts',`import type {EnemyConfig} from '../core/types';\nexport const ETYPES:Record<string,EnemyConfig>=${declarations.get('ETYPES')};`);
write('src/game/data/stats.ts','export '+functions.get('statBase'));
const groups={
 'TalentSystem':['tierWeights','pickTier','availTalents','canOffer','recompute','rollPicks','rollOne'],
 'EnemySystem':['spawnEnemy','nearestEnemy'],
 'CombatSystem':['hurtEnemy','killEnemy','addText','damagePlayer'],
 'Simulation':['update'],
 'WaveSystem':['waveQuota','startNextWave','cardsOfTier','enterRest'],
};
const sigs={tierWeights:'',pickTier:'w:number[]',availTalents:'t:number',canOffer:'u:Talent',recompute:'',rollPicks:'',rollOne:'exclude:string[]',spawnEnemy:'forceType?:string | null, elite=false',nearestEnemy:'x:number,y:number,maxD:number,exclude?:Enemy',hurtEnemy:'e:Enemy,dmg:number,kx=0,ky=0,opts:HitOptions={}',killEnemy:'e:Enemy,fromExplode?:boolean',addText:'x:number,y:number,s:string | number,c:string,big=false',damagePlayer:'dmg:number,opts:PlayerHitOptions={}',update:'dt:number',waveQuota:'n:number',startNextWave:'',cardsOfTier:'t:number',enterRest:''};
const fields=['state','player','enemies','bullets','gems','potions','parts','texts','meteors','bolts','cam','time','kills','spawnCd','shake','hurtFlash','pendingLevels','chainCd','wavePhase','waveN','quota','spawnedThisWave','dmgBy','ebullets','bpMode','swapUsedThisRest','slots','swTarget','swSel','keys'];
const methodNames=Object.values(groups).flat().concat(['resetGame','startGame','togglePause','toggleStats','gameOver','openLevelPanel','showRestBar','closeLevelPanelIfDone','renderCards','drawCards','buildStats','setSwTarget','swSelCount','renderSwInv']);
// Rewrite only identifier references, never strings, object keys, or property accesses.
function qualify(source,refs=[...fields,...methodNames]){
 const root=ts.createSourceFile('part.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);const edits=[];
 function visit(n){if(ts.isIdentifier(n)&&refs.includes(n.text)){
  const p=n.parent;
  if(!(ts.isPropertyAccessExpression(p)&&p.name===n)&&!(ts.isPropertyAssignment(p)&&p.name===n)&&!(ts.isVariableDeclaration(p)&&p.name===n)&&!(ts.isFunctionDeclaration(p)&&p.name===n)&&!(ts.isParameter(p)&&p.name===n)){
   edits.push([n.getStart(root),n.end,ts.isShorthandPropertyAssignment(p)?`${n.text}: this.${n.text}`:`this.${n.text}`]);
  }
 }ts.forEachChild(n,visit);}visit(root);
 for(const [start,end,value] of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+value+source.slice(end);
 return source;
}
const imports=`import type {GameCore} from './GameCore';\nimport type {Talent,Enemy,HitOptions,PlayerHitOptions} from './types';\nimport {WORLD,VIEW,clamp} from '../data/constants';\nimport {UPGRADES,RAMP,DMG_POOL} from '../data/talents';\nimport {ETYPES} from '../data/enemies';\nimport {statBase} from '../data/stats';\n`;
for(const [file,names] of Object.entries(groups)){
 const body=names.map(n=>{let src=functions.get(n);src=src.replace(new RegExp(`function ${n}\\([^)]*\\)`),`export function ${n}(this:GameCore${sigs[n]?', '+sigs[n]:''})`);return qualify(src).replaceAll('beep(', 'this.audio.beep(');}).join('\n\n');
 write(`src/game/core/${file}.ts`,imports+body);
}
const coreImports=Object.entries(groups).map(([file,names])=>`import {${names.join(',')}} from './${file}';`).join('\n');
const bindings=Object.values(groups).flat().map(n=>`${n}=${n}.bind(this);`).join('\n');
let reset=functions.get('resetGame');reset=reset.slice(0,reset.indexOf("  document.getElementById"))+'  this.view.reset();\n}';reset=qualify(reset).replace('function resetGame()','resetGame()');
write('src/game/core/GameCore.ts',`import type {Player,Enemy,Bullet,EnemyBullet,Gem,Particle,FloatingText,Meteor,Bolt,Point,DamageTotals,Mode,WavePhase,Panel,Slot,GameState,GameView} from './types';\nimport {silentView} from './types';\nimport {WORLD} from '../data/constants';\nimport {statBase} from '../data/stats';\nimport {AudioService} from '../../services/AudioService';\nimport {StorageService} from '../../services/StorageService';\n${coreImports}\nexport class GameCore {
state:Mode='start'; player!:Player;
enemies:Enemy[]=[]; bullets:Bullet[]=[]; ebullets:EnemyBullet[]=[]; gems:Gem[]=[]; potions:Point[]=[];
parts:Particle[]=[]; texts:FloatingText[]=[]; meteors:Meteor[]=[]; bolts:Bolt[]=[];
cam={x:0,y:0}; time=0; kills=0; spawnCd=1.2; shake=0; hurtFlash=0; pendingLevels=0; chainCd=0;
wavePhase:WavePhase='fight'; waveN=1; quota=15; spawnedThisWave=0;
dmgBy:DamageTotals={bullet:0,orbit:0,chain:0,meteor:0,explode:0,thorns:0,burn:0};
bpMode:Panel=null; swapUsedThisRest=false; slots:Slot[]=[]; swTarget=0; swSel:Record<string,number>={};
keys:Record<string,boolean>={}; view:GameView=silentView;
constructor(public audio=new AudioService(),public storage=new StorageService()){this.resetGame();}
${bindings}
${reset}
startGame(){this.resetGame();this.state='play';this.view.started();this.audio.beep(523,0.1);}
togglePause(){if(this.state==='play'){this.state='pause';this.view.paused(true);}else if(this.state==='pause'){this.state='play';this.view.paused(false);}}
toggleStats(){if(this.state==='play'){this.state='stats';this.view.stats(true);}else if(this.state==='stats'){this.state='play';this.view.stats(false);}}
get phase():GameState {if(this.state!=='play')return this.state;if(this.bpMode==='level')return 'levelup';if(this.wavePhase==='rest')return this.swTarget?'swap':'report';return 'play';}
step(dt:number){if(this.state==='play')this.update(dt);}
openLevelPanel(){this.view.level();}
showRestBar(){this.view.rest();}
gameOver(){if(this.state==='over')return;this.state='over';this.storage.append({d:Date.now(),t:Math.round(this.time),k:this.kills,lv:this.player.lvl,w:this.waveN,up:{...this.player.upCounts},dmg:{...this.dmgBy}});this.view.over();this.audio.beep(220,0.4,'sawtooth',0.09,-160);}
}`);
// DOM code remains in its own adapter. Callbacks use lexical this, referring to the UI adapter.
const uiNames=['renderCards','drawCards','buildStats','openLevelPanel','closeLevelPanelIfDone','showRestBar','setSwTarget','swSelCount','renderSwInv'];
let ui=uiNames.map(n=>{
 let src=qualify(functions.get(n),[...fields,...methodNames]).replace(new RegExp(`function ${n}\\([^)]*\\)`),`${n}(${n==='setSwTarget'?'t:number':''})`);
 // All runtime fields and rule methods belong to core, UI methods belong here.
 for(const ref of [...fields,...methodNames.filter(x=>!uiNames.includes(x))])src=src.replaceAll(`this.${ref}`,`this.core.${ref}`);
 return src;
}).join('\n');
let handlers=ast.statements.filter(s=>ts.isExpressionStatement(s)&&s.getText(ast).startsWith('document.getElementById')).map(s=>s.getText(ast)).join('\n');
handlers=qualify(handlers);
for(const ref of [...fields,...methodNames.filter(x=>!uiNames.includes(x))])handlers=handlers.replaceAll(`this.${ref}`,`this.core.${ref}`);
ui=ui.replaceAll('beep(', 'this.core.audio.beep(');handlers=handlers.replaceAll('beep(', 'this.core.audio.beep(');
const domFix=s=>s.replaceAll('document.getElementById(', 'element(').replaceAll("el.querySelector('.up')","elementWithin(el,'.up')").replaceAll("el.querySelector('.lv')","elementWithin(el,'.lv')");
write('src/ui/GameUI.ts',`import type {GameCore} from '../game/core/GameCore';\nimport {UPGRADES,TIERS,TIER_VAL,CAT_COLOR,CAT_ICO} from '../game/data/talents';\nimport {fmtTime} from '../game/data/constants';\nimport {element,elementWithin} from './dom';\nconst DMG_NAMES:Record<string,string>=${declarations.get('DMG_NAMES')};\nconst show=(id:string)=>element(id).classList.remove('hidden');\nconst hide=(id:string)=>element(id).classList.add('hidden');\nexport class GameUI {
constructor(public core:GameCore){
core.view={reset:()=>this.reset(),started:()=>{['ov-start','ov-over','ov-pause','ov-stats'].forEach(hide);},paused:p=>p?show('ov-pause'):hide('ov-pause'),stats:open=>{if(open){this.buildStats();show('ov-stats');}else hide('ov-stats');},level:()=>this.openLevelPanel(),rest:()=>this.showRestBar(),over:()=>{element('over-stats').innerHTML=\`存活时间 <span class="accent">\${fmtTime(core.time)}</span> ｜ 击杀 <span class="accent">\${core.kills}</span> ｜ 等级 <span class="accent">\${core.player.lvl}</span>\`;show('ov-over');}};
${domFix(handlers)}
}
reset(){['bottom-bar','bp-level','bp-rest','bp-swap'].forEach(hide);}
${domFix(ui)}
}`);
// Preserve all original pixel maps. Canvas is used once to create textures, never to draw the world.
let spriteCode=js.slice(js.indexOf('function makeSprite'),js.indexOf('// ---------- 游戏状态'));
spriteCode=spriteCode.replace('function makeSprite(map, palette)','function makeSprite(map:string[], palette:Record<string,string>)').replace("const g = c.getContext('2d');","const g = c.getContext('2d');\n  if(!g) throw new Error('Pixel texture context unavailable');").replace('const SPR = {};','export const SPR:Record<string,HTMLCanvasElement> = {};');
write('src/game/rendering/sprites.ts',spriteCode);
let render=functions.get('draw');
render=render.replace('function draw()', 'export function draw(this:GameCore,ctx:PixelPainter)');render=qualify(render,fields);
render=render.replaceAll('ctx.drawImage(', 'ctx.sprite(').replaceAll('ctx.save();','').replaceAll('ctx.scale(Z, Z);','').replaceAll('ctx.restore();','ctx.screen();');
// World positions are rendered through the actual Phaser camera. cx/cy still cull visible tiles.
render=render.replace(/ - cx/g,'').replace(/ - cy/g,'');
render=render.replaceAll('ctx.sprite(SPR.gemE,',"ctx.sprite('gemE',").replaceAll('ctx.sprite(SPR.gem,',"ctx.sprite('gem',").replaceAll('ctx.sprite(SPR.potion,',"ctx.sprite('potion',").replaceAll('ctx.sprite(SPR.player,',"ctx.sprite('player',").replaceAll('ctx.sprite(spr,','ctx.sprite(e.spr,');
render=render.replace("const spr = SPR[e.spr];","const spr = SPR[e.spr];");
write('src/game/rendering/draw.ts',`import type {GameCore} from '../core/GameCore';\nimport type {PixelPainter} from './PixelPainter';\nimport {W,H,VIEW,WORLD,fmtTime} from '../data/constants';\nimport {SPR} from './sprites';\n${functions.get('hash').replace('hash(x, y)','hash(x:number, y:number)')}\n${render}`);
// M0 artifact kept intact under legacy rather than left as unused production code.
write('legacy/canvas-baseline.js',readFileSync('src/canvas-baseline.js','utf8'));
