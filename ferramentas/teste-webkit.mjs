// Abre o site no WebKit (motor do Safari) e, se pedido, separa um arquivo no modo Leve.
// Uso: node ferramentas/teste-webkit.mjs <url> <screenshot.png> [iphone|mac] [arquivo.wav]
import { webkit, devices } from 'playwright';
const [url, shot, perfil = 'iphone', arquivo] = process.argv.slice(2);
const navegador = await webkit.launch();
const ctx = await navegador.newContext(perfil === 'iphone' ? { ...devices['iPhone 13'] } : { viewport: { width: 1366, height: 900 } });
const pagina = await ctx.newPage();
const logs = [];
pagina.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
pagina.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await pagina.goto(url, { waitUntil: 'load' });
await pagina.waitForTimeout(4000);
const estado = await pagina.evaluate(() => ({
  coi: self.crossOriginIsolated,
  gpu: !!navigator.gpu,
  qualidadeDesligada: document.querySelector('input[value=qualidade]')?.disabled,
  leveMarcado: document.querySelector('input[value=leve]')?.checked,
  selo: document.getElementById('selo-qualidade')?.textContent,
  aviso: document.getElementById('aviso-gpu')?.hidden === false ? document.getElementById('aviso-gpu').textContent : null,
  scrollLateral: document.documentElement.scrollWidth > innerWidth,
}));
console.log(JSON.stringify(estado, null, 1));
if (arquivo) {
  const t0 = Date.now();
  await pagina.setInputFiles('#arquivo', arquivo);
  // desde 27/11 escolher o arquivo só prepara; a separação começa no botão Separar
  await pagina.waitForFunction(() => !document.getElementById('btn-separar').disabled, null, { timeout: 60000 });
  await pagina.click('#btn-separar');
  const fim = await pagina.waitForFunction(() => !document.getElementById('etapa-estudio').hidden || !document.getElementById('etapa-arquivo').hidden, null, { timeout: 280000, polling: 500 }).then(() => 'ok', (e) => 'timeout: ' + e.message);
  const r = await pagina.evaluate(() => ({ estudio: !document.getElementById('etapa-estudio').hidden, faixas: [...document.querySelectorAll('#mixer .faixa .nome')].map((e) => e.textContent), toast: document.getElementById('toast').textContent, detalhe: document.getElementById('prog-detalhe').textContent }));
  console.log('separacao:', fim, Math.round((Date.now() - t0) / 1000) + 's', JSON.stringify(r));
  if (r.estudio) {
    await pagina.click('#btn-play');
    await pagina.waitForTimeout(2500);
    console.log('tocando:', await pagina.evaluate(() => document.getElementById('t-atual').textContent));
  }
}
console.log(logs.filter((l) => !/COOP\/COEP/.test(l)).join('\n'));
await pagina.screenshot({ path: shot, fullPage: true });
await navegador.close();
