// Gera o PDF do manual a partir de manual.html (prints em img/, feitos por capturas.mjs).
// Uso: node ferramentas/manual/gerar-pdf.mjs [saida.pdf]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const saida = process.argv[2] || 'ferramentas/manual/Ensaio Vocal - Guia rapido.pdf';
const nav = await chromium.launch();
const p = await nav.newPage();
await p.goto(pathToFileURL(resolve('ferramentas/manual/manual.html')).href, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
const fontes = await p.evaluate(() => [document.fonts.check('16px Archivo'), document.fonts.check('16px "Plex Mono"')]);
console.log('fontes carregadas:', fontes);
await p.pdf({
  path: saida,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate:
    '<div style="width:100%;font:8px Segoe UI,sans-serif;color:#8a8276;padding:0 16mm;display:flex;justify-content:space-between"><span>Ensaio Vocal · guia rápido</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  margin: { top: '16mm', bottom: '18mm', left: '16mm', right: '16mm' },
});
console.log('PDF:', saida);
await nav.close();
