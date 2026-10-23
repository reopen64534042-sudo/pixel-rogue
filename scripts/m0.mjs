import { readFileSync, writeFileSync } from 'node:fs';
const original = readFileSync('legacy/original.html', 'utf8');
const css = original.match(/<style>([\s\S]*?)<\/style>/)[1];
const js = original.match(/<script>([\s\S]*?)<\/script>/)[1];
writeFileSync('src/styles/game.css', css);
writeFileSync('src/canvas-baseline.js', js);
writeFileSync('index.html', original.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<script>[\s\S]*?<\/script>/, '<script type="module" src="/src/main.ts"></script>'));
writeFileSync('src/main.ts', "import './styles/game.css';\nimport './canvas-baseline.js';\n");
