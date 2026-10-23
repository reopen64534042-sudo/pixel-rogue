// Scoped cleanup of the newly extracted modules, using TypeScript's import organizer.
import ts from 'typescript';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
const files=readdirSync('src/game/core').filter(n=>n.endsWith('.ts')).map(n=>'src/game/core/'+n);
for(const file of files){
 const host={getScriptFileNames:()=>[file],getScriptVersion:()=> '0',getScriptSnapshot:name=>{try{return ts.ScriptSnapshot.fromString(readFileSync(name,'utf8'));}catch{return undefined;}},getCurrentDirectory:()=>process.cwd(),getCompilationSettings:()=>({module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,moduleResolution:ts.ModuleResolutionKind.Bundler}),getDefaultLibFileName:o=>ts.getDefaultLibFilePath(o),fileExists:ts.sys.fileExists,readFile:ts.sys.readFile,readDirectory:ts.sys.readDirectory};
 const service=ts.createLanguageService(host);
 const changes=service.organizeImports({type:'file',fileName:file},{},{});
 for(const change of changes){let text=readFileSync(change.fileName,'utf8');for(const edit of [...change.textChanges].sort((a,b)=>b.span.start-a.span.start))text=text.slice(0,edit.span.start)+edit.newText+text.slice(edit.span.start+edit.span.length);writeFileSync(change.fileName,text);}
 service.dispose();
}
for(const name of ['EffectsSystem','WaveSystem']){const file=`src/game/core/${name}.ts`;writeFileSync(file,readFileSync(file,'utf8').replace('  const p=this.player;\n',''));}
