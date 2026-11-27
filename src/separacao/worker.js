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

// Notebook com duas placas (Intel + NVIDIA/AMD): sem pedir, o navegador entrega a integrada, que é
// várias vezes mais lenta. Pede a de alto desempenho e entrega ao ONNX Runtime.
let adaptador; // undefined = ainda não pediu; null = não tem
let nomePlaca = '';
async function obterAdaptador() {
  if (adaptador !== undefined) return adaptador;
  adaptador = null;
  try {
    if (navigator.gpu) {
      adaptador =
        (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })) || (await navigator.gpu.requestAdapter());
    }
  } catch {
    adaptador = null;
  }
  if (adaptador) {
    let info = adaptador.info;
    if (!info && adaptador.requestAdapterInfo) info = await adaptador.requestAdapterInfo().catch(() => null);
    nomePlaca = [info?.vendor, info?.architecture, info?.description].filter(Boolean).join(' ').trim();
  }
  return adaptador;
}

async function temWebGPU() {
  return !!(await obterAdaptador());
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
    throw new Error('Este computador/navegador não tem WebGPU. Use o modo "Rápido".');
  }
  const ep = gpu ? 'webgpu' : 'wasm';
  if (gpu && adaptador) ort.env.webgpu.adapter = adaptador; // vale só antes da 1ª sessão (o worker é reaproveitado)
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

// Worker de DSP: um só, reaproveitado entre músicas. Se o navegador não deixar criar worker dentro
// de worker, faz o mesmo cálculo aqui mesmo (mais lento, mas funciona).
let dspWorker = null;
let dspSeq = 0;
const dspPendentes = new Map();
function obterDsp() {
  if (dspWorker === null) {
    try {
      dspWorker = new Worker(new URL('./dsp-worker.js', import.meta.url), { type: 'module' });
      dspWorker.onmessage = (ev) => {
        const r = dspPendentes.get(ev.data.id);
        dspPendentes.delete(ev.data.id);
        if (!r) return;
        if (ev.data.erro) r.reject(new Error(ev.data.erro));
        else r.resolve(ev.data);
      };
      dspWorker.onerror = (e) => {
        for (const r of dspPendentes.values()) r.reject(new Error(e.message || 'falha no processamento de sinal'));
        dspPendentes.clear();
      };
    } catch {
      dspWorker = false;
    }
  }
  if (dspWorker) {
    return {
      pedir: (msg, transf) =>
        new Promise((resolve, reject) => {
          const id = ++dspSeq;
          dspPendentes.set(id, { resolve, reject });
          dspWorker.postMessage({ ...msg, id }, transf);
        }),
    };
  }
  const specs = new Map();
  return {
    pedir: async (m) => {
      const md = m.modelo;
      if (m.op === 'preparar') {
        if (md.tipo === 'roformer') {
          const r = roformerEntrada(m.pedaco, md.nFft, md.hop);
          specs.set(m.k, r.specs);
          return { dados: r.dados, dims: [1, r.bins * 2, r.frames, 2] };
        }
        const r = mdxEntrada(m.pedaco, md.nFft, md.hop, md.dimF);
        return { dados: r.dados, dims: [1, 4, md.dimF, r.frames], frames: r.frames };
      }
      if (md.tipo === 'roformer') {
        const sp = specs.get(m.k);
        specs.delete(m.k);
        return roformerSaida(sp, m.saida, md.nFft, md.hop, m.tam);
      }
      return { voz: mdxSaida(m.saida, md.nFft, md.hop, md.dimF, m.frames, m.tam, md.compensar) };
    },
  };
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
  const sob = modelo.sobreposicao ?? Math.round(tam / 4);
  const inicios = planejarPedacos(total, tam, sob);
  const accVoz = criarAcumulador(total, 2);
  const accBack = modelo.tipo === 'roformer' ? criarAcumulador(total, 2) : null;
  enviar({ tipo: 'progresso', etapa: 'separando', feito: 0, total: inicios.length, ep, placa: nomePlaca });

  // Preparação (STFT) e finalização (iSTFT) rodam num SEGUNDO worker (dsp-worker.js), em paralelo
  // com a placa de vídeo: enquanto o modelo roda o pedaço k, ele prepara o k+1 e finaliza o k-1.
  // (Na mesma thread os dois disputavam o JavaScript e quase não se sobrepunham.)
  const dsp = obterDsp();
  const infoModelo = { tipo: modelo.tipo, nFft: modelo.nFft, hop: modelo.hop, dimF: modelo.dimF, compensar: modelo.compensar };
  const preparar = (k) => {
    const pedaco = canais.map((c) => recortar(c, inicios[k], tam));
    if (escala !== 1) for (const p of pedaco) for (let i = 0; i < p.length; i++) p[i] *= escala;
    return dsp.pedir({ op: 'preparar', k, modelo: infoModelo, pedaco }, pedaco.map((a) => a.buffer));
  };
  const rodar = async (dados, dims) => {
    const r = await sessao.run({ [sessao.inputNames[0]]: new ort.Tensor('float32', dados, dims) });
    const t = r[sessao.outputNames[0]];
    let saida = await t.getData();
    // só dá para transferir um buffer inteiro: se a saída for um pedaço de buffer maior, copia
    if (saida.byteOffset !== 0 || saida.byteLength !== saida.buffer.byteLength) saida = saida.slice();
    t.dispose?.();
    return saida;
  };
  const somar = (k, res) => {
    const peso = pesoPedaco(tam, sob, k === 0, k === inicios.length - 1, modelo.borda || 0);
    accVoz.somar(inicios[k], res.voz, peso);
    if (accBack) accBack.somar(inicios[k], res.backing, peso);
  };

  const finalizacoes = [];
  const tempos = { espera: 0, gpu: 0 }; // diagnóstico: espera pelo DSP × tempo do modelo
  let proximo = preparar(0);
  for (let k = 0; k < inicios.length; k++) {
    const t0 = performance.now();
    const { dados, dims, frames } = await proximo;
    const t1 = performance.now();
    if (k + 1 < inicios.length) proximo = preparar(k + 1);
    const saida = await rodar(dados, dims);
    tempos.espera += t1 - t0;
    tempos.gpu += performance.now() - t1;
    finalizacoes.push(
      dsp.pedir({ op: 'finalizar', k, modelo: infoModelo, saida, frames, tam }, [saida.buffer]).then((res) => somar(k, res)),
    );
    enviar({ tipo: 'progresso', etapa: 'separando', feito: k + 1, total: inicios.length, ep, tempos, placa: nomePlaca });
  }
  await Promise.all(finalizacoes);

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
