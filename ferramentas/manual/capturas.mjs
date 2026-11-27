// Tira os prints do manual a partir do app rodando em dev (npm run dev → http://localhost:5199).
// Uso: node ferramentas/manual/capturas.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:5199/';
const PASTA = 'ferramentas/manual/img';
const ZIP = 'public/_teste/projeto-era-eu.zip';
const WAV = 'public/_teste/t2_mix.wav';
mkdirSync(PASTA, { recursive: true });

const nav = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
const ctx = await nav.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2, colorScheme: 'light' });
// o navegador de captura não tem placa de vídeo; para os prints, a página se apresenta como um
// computador comum com WebGPU (o worker continua real e usa o modo Leve)
await ctx.addInitScript(() => {
  const falso = { requestAdapter: async () => ({}) };
  Object.defineProperty(Navigator.prototype, 'gpu', { get: () => falso, configurable: true });
});
const p = await ctx.newPage();
p.on('dialog', (d) => d.accept());
const foto = async (alvo, nome) => {
  const caminho = `${PASTA}/${nome}.png`;
  if (alvo === 'tela') await p.screenshot({ path: caminho });
  else await p.locator(alvo).first().screenshot({ path: caminho });
  console.log('ok', nome);
};
const espera = (ms) => p.waitForTimeout(ms);

await p.goto(URL, { waitUntil: 'load' });
await espera(2500);
await foto('tela', '01-inicio');

// escolher a música (só prepara) → print com o cartão "Música escolhida" e os modos → Separar
await p.setInputFiles('#arquivo', { name: 'Minha música.mp3', mimeType: 'audio/wav', buffer: (await import('node:fs')).readFileSync(WAV) });
await p.waitForFunction(() => !document.getElementById('btn-separar').disabled, null, { timeout: 60000 });
// estimativa como numa música de 4 min (o áudio de teste tem 7 s)
await p.evaluate(() => {
  document.getElementById('escolhida-info').textContent = '4:12 · 9 MB';
  document.getElementById('tempo-rapido').textContent = '≈ 1 min para esta música';
  document.getElementById('tempo-qualidade').textContent = '≈ 3 min para esta música';
});
await espera(300);
await foto('tela', '01-escolhida');
await p.click('#btn-separar');
await p.waitForFunction(() => /Parte 1 de/.test(document.getElementById('prog-detalhe').textContent), null, { timeout: 180000 });
// mostra o caso típico (com placa de vídeo): tira o aviso de "sem placa de vídeo" do texto
await p.evaluate(() => {
  document.getElementById('prog-detalhe').textContent = 'Parte 18 de 46 · 4 min de música · falta ~40 s';
  document.getElementById('prog-preench').style.width = '39%';
});
await foto('#etapa-progresso', '02-progresso');
await p.waitForFunction(() => !document.getElementById('etapa-estudio').hidden, null, { timeout: 180000 });

// abre um projeto pronto (Era Eu, já com ajustes: voz 20 %, tom −2, 85 %, trecho 1:00–1:10)
await p.click('#btn-nova');
await p.setInputFiles('#arquivo', ZIP);
await p.waitForFunction(() => /Era Eu/.test(document.getElementById('nome-atual').textContent) && !document.getElementById('etapa-estudio').hidden, null, { timeout: 180000 });
await espera(1500);
await p.evaluate(() => window.__ensaio.player.buscar(64));
await p.waitForFunction(() => document.getElementById('toast').hidden, null, { timeout: 15000 });
await espera(300);
await foto('tela', '03-estudio');
await foto('.deck', '04-onda-trecho');
await foto('.mesa', '05-faixas');
await foto('.ajustes', '06-tom-velocidade');
await foto('.baixar', '07-baixar');

// diálogo do nome do projeto
await p.click('#exp-projeto');
await espera(400);
await p.fill('#campo-nome', 'pacote_aluno_matheus');
await foto('#dlg-nome', '08-nome-arquivo');
await p.click('#dlg-nome-cancelar');

// Minhas músicas
await p.click('#btn-biblioteca');
await espera(600);
await p.locator('#lista-bib .marca').first().check();
await espera(200);
await foto('#biblioteca', '09-minhas-musicas');

await nav.close();
