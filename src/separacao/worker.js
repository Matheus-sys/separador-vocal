// Web Worker: roda a separação fora da tela, para a página não travar.
import * as ort from 'onnxruntime-web/webgpu';
import { MODELOS, tamanhoPedaco } from './modelos.js';
import { obterArquivo } from './baixar.js';
import { planejarPedacos, pesoPedaco, recortar, criarAcumulador } from './janelas.js';
import { roformerEntrada, roformerSaida, mdxEntrada, mdxSaida } from './processar.js';

ort.env.logLevel = 'error';
// Safari (Mac e iPhone) e celulares: o WebAssembly com várias threads reserva memória compartilhada
// grande e o WebKit recusa ("RangeError: Out of memory"). Nesses casos, uma thread só.
const UA = navigator.userAgent || '';
const ehSafari = /Safari/.test(UA) && !/Chrome|Chromium|CriOS|FxiOS|Edg|Android/.test(UA);
const ehMovel = /iPhone|iPad|iPod|Android|Mobile/.test(UA);
ort.env.wasm.numThreads =
  self.crossOriginIsolated && !ehSafari && !ehMovel ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)) : 1;

let sessaoAtual = null; // { id, sessao, ep }

const enviar = (m, t) => self.postMessage(m, t || []);

async function temWebGPU() {
  try {
    return !!(navigator.gpu && (await navigator.gpu.requestAdapter()));
  } catch {
    return false;
  }
}

async function carregarSessao(modelo, base) {
  if (sessaoAtual?.id === modelo.id) return sessaoAtual;
  if (sessaoAtual) {
    await sessaoAtual.sessao.release?.();
    sessaoAtual = null;
  }
  const total = modelo.arquivos.reduce((s, a) => s + a.bytes, 0);
  const recebidos = modelo.arquivos.map(() => 0);
  const buffers = [];
  for (let i = 0; i < modelo.arquivos.length; i++) {
    buffers.push(
      await obterArquivo(modelo.arquivos[i], base, (n) => {
        recebidos[i] = n;
        enviar({ tipo: 'progresso', etapa: 'baixando', feito: recebidos.reduce((a, b) => a + b, 0), total });
      }),
    );
  }
  enviar({ tipo: 'progresso', etapa: 'carregando', feito: 0, total: 1 });
  const gpu = await temWebGPU();
  if (modelo.precisaWebGPU && !gpu) {
    throw new Error('Este computador/navegador não tem WebGPU. Use o modo "Leve / compatível".');
  }
  const ep = gpu ? 'webgpu' : 'wasm';
  const opcoes = {
    executionProviders: ep === 'webgpu' ? [{ name: 'webgpu', storageBufferCacheMode: 'simple' }] : ['wasm'],
    graphOptimizationLevel: 'all',
  };
  if (buffers.length > 1) {
    opcoes.externalData = modelo.arquivos.slice(1).map((a, i) => ({ path: a.nome, data: buffers[i + 1] }));
  }
  let sessao;
  try {
    sessao = await ort.InferenceSession.create(buffers[0], opcoes);
  } catch (e) {
    if (ep === 'webgpu' && !modelo.precisaWebGPU) {
      sessao = await ort.InferenceSession.create(buffers[0], { executionProviders: ['wasm'] });
    } else throw e;
  }
  sessaoAtual = { id: modelo.id, sessao, ep };
  return sessaoAtual;
}

async function separar({ modeloId, canais, base, normalizar = true }) {
  // produção: motor solto em /ort/ (ver vite.config.js). No dev o Vite não deixa importar de public/.
  if (!import.meta.env.DEV) ort.env.wasm.wasmPaths = new URL('ort/', base).href;
  const modelo = MODELOS[modeloId];
  // o modelo foi validado com a música normalizada no pico 0,9; volta à escala original no fim
  let pico = 0;
  for (const c of canais) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > pico) pico = a; }
  const escala = normalizar && pico > 1e-6 ? 0.9 / pico : 1;
  const { sessao, ep } = await carregarSessao(modelo, base);
  const total = canais[0].length;
  const tam = tamanhoPedaco(modelo);
  const sob = Math.round(tam / 4);
  const inicios = planejarPedacos(total, tam, sob);
  const accVoz = criarAcumulador(total, 2);
  const accBack = modelo.tipo === 'roformer' ? criarAcumulador(total, 2) : null;
  enviar({ tipo: 'progresso', etapa: 'separando', feito: 0, total: inicios.length, ep });

  // Preparação (STFT) e finalização (iSTFT) rodam no processador enquanto a placa de vídeo
  // processa o pedaço atual: o pedaço k+1 é preparado e o k-1 finalizado durante o run(k).
  const preparar = (k) => {
    const ini = inicios[k];
    const pedaco = canais.map((c) => recortar(c, ini, tam));
    if (escala !== 1) for (const p of pedaco) for (let i = 0; i < p.length; i++) p[i] *= escala;
    const peso = pesoPedaco(tam, sob, k === 0, k === inicios.length - 1);
    if (modelo.tipo === 'roformer') {
      const { dados, specs, bins, frames } = roformerEntrada(pedaco, modelo.nFft, modelo.hop);
      return { ini, peso, specs, entrada: new ort.Tensor('float32', dados, [1, bins * 2, frames, 2]) };
    }
    const { dados, frames } = mdxEntrada(pedaco, modelo.nFft, modelo.hop, modelo.dimF);
    return { ini, peso, frames, entrada: new ort.Tensor('float32', dados, [1, 4, modelo.dimF, frames]) };
  };
  const finalizar = (p, saida) => {
    if (modelo.tipo === 'roformer') {
      const { voz, backing } = roformerSaida(p.specs, saida, modelo.nFft, modelo.hop, tam);
      accVoz.somar(p.ini, voz, p.peso);
      accBack.somar(p.ini, backing, p.peso);
    } else {
      accVoz.somar(p.ini, mdxSaida(saida, modelo.nFft, modelo.hop, modelo.dimF, p.frames, tam, modelo.compensar), p.peso);
    }
  };
  const rodar = async (p) => {
    const r = await sessao.run({ [sessao.inputNames[0]]: p.entrada });
    const t = r[sessao.outputNames[0]];
    const dados = await t.getData();
    t.dispose?.();
    return dados;
  };

  let proximo = preparar(0);
  let pendente = null; // [pedaço, saída] esperando finalização
  for (let k = 0; k < inicios.length; k++) {
    const atual = proximo;
    const execucao = rodar(atual);
    // deixa o ORT despachar o trabalho para a GPU antes de ocupar o processador
    await new Promise((r) => setTimeout(r, 0));
    if (pendente) {
      finalizar(...pendente);
      pendente = null;
    }
    proximo = k + 1 < inicios.length ? preparar(k + 1) : null;
    pendente = [atual, await execucao];
    atual.entrada = null;
    enviar({ tipo: 'progresso', etapa: 'separando', feito: k + 1, total: inicios.length, ep });
  }
  if (pendente) finalizar(...pendente);

  const vozTotal = accVoz.finalizar();
  if (escala !== 1) for (const v of vozTotal) for (let i = 0; i < v.length; i++) v[i] /= escala;
  // calcula no lugar (sem cópias novas) para economizar memória:
  // instrumental = mistura − voz, gravado por cima da mistura
  for (let i = 0; i < canais.length; i++) {
    const c = canais[i], v = vozTotal[i];
    for (let j = 0; j < total; j++) c[j] -= v[j];
  }
  const faixas = { instrumental: canais };
  if (accBack) {
    const backing = accBack.finalizar();
    if (escala !== 1) for (const v of backing) for (let i = 0; i < v.length; i++) v[i] /= escala;
    faixas.backing = backing;
    // voz principal = voz − backing, gravado por cima da voz
    for (let i = 0; i < vozTotal.length; i++) {
      const v = vozTotal[i], b = backing[i];
      for (let j = 0; j < total; j++) v[j] -= b[j];
    }
    faixas.voz = vozTotal;
  } else {
    faixas.voz = vozTotal;
  }
  const transf = Object.values(faixas).flat().map((a) => a.buffer);
  enviar({ tipo: 'pronto', faixas, ep }, transf);
}

self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.tipo === 'separar') await separar(m);
    else if (m.tipo === 'capacidade') enviar({ tipo: 'capacidade', webgpu: await temWebGPU(), coi: self.crossOriginIsolated });
  } catch (e) {
    enviar({ tipo: 'erro', mensagem: e?.message || String(e) });
  }
};
