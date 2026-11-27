// Publica o site: testa, gera dist/ e envia para a branch gh-pages (GitHub Pages "deploy from branch").
// Uso: npm run publicar
import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, renameSync, mkdirSync, readdirSync, rmSync } from 'node:fs';

const run = (c, o = {}) => execSync(c, { stdio: 'inherit', ...o });
run('npx vitest run');
// arquivos locais de teste/modelo grande não podem ir para o site
const fora = ['public/_teste'];
const guardado = '.publicar-tmp';
mkdirSync(guardado, { recursive: true });
for (const f of fora) if (existsSync(f)) renameSync(f, `${guardado}/${f.replace(/\//g, '_')}`);
const grandes = existsSync('public/modelos') ? readdirSync('public/modelos').filter((f) => f.startsWith('duality_')) : [];
for (const f of grandes) renameSync(`public/modelos/${f}`, `${guardado}/${f}`);
try {
  run('npx vite build');
} finally {
  for (const f of fora) if (existsSync(`${guardado}/${f.replace(/\//g, '_')}`)) renameSync(`${guardado}/${f.replace(/\//g, '_')}`, f);
  for (const f of grandes) renameSync(`${guardado}/${f}`, `public/modelos/${f}`);
}
writeFileSync('dist/.nojekyll', '');
const rev = execSync('git rev-parse --short HEAD').toString().trim();
// o Vite limpa dist/ mas preserva dist/.git da publicação anterior
rmSync('dist/.git', { recursive: true, force: true });
run('git init -q', { cwd: 'dist' });
run('git checkout -q -b gh-pages', { cwd: 'dist' });
run('git add -A', { cwd: 'dist' });
run(`git -c user.name=matheus-sys -c user.email=62916731+matheus-sys@users.noreply.github.com commit -q -m "Publica ${rev}"`, { cwd: 'dist' });
const remoto = execSync('git remote get-url origin').toString().trim();
run(`git push -q -f ${remoto} gh-pages`, { cwd: 'dist' });
console.log('Publicado. O GitHub Pages atualiza em 1 ou 2 minutos.');
