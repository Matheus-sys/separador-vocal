// Arquivo de projeto do Ensaio Vocal: um .zip comum com projeto.json + uma faixa MP3 por stem.
// Um pacote com vários projetos é um zip com uma pasta por projeto.
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { mp3De, verificarCancelado } from '../audio/exportar.js';

export const FORMATO = 'ensaio-vocal';
export const VERSAO = 1;
const NOMES_FAIXA = ['voz', 'backing', 'instrumental'];
// O lamejs atrasa o áudio em 1105 amostras (576 do codificador + 529 do decodificador) e não grava
// o cabeçalho LAME que avisaria o navegador. A importação desconta esse atraso.
export const ATRASO_MP3 = 1105;

/** Nome de arquivo/pasta seguro em Windows, Mac e celular. */
export function nomeSeguro(nome) {
  const s = String(nome || 'musica')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return s || 'musica';
}

export function montarJson({ meta, ajustes }) {
  return {
    formato: FORMATO,
    versao: VERSAO,
    id: meta.id,
    nome: meta.nome,
    modeloId: meta.modeloId,
    sr: meta.sr,
    duracao: meta.duracao,
    faixas: meta.faixas,
    ajustes: ajustes || null,
    atrasoMp3: ATRASO_MP3,
    criado: meta.data || Date.now(),
    exportado: Date.now(),
  };
}

/**
 * Codifica as faixas de UM projeto em MP3 e devolve as entradas do zip (caminho → bytes).
 * progresso(fração 0..1) cobre só este projeto.
 */
export async function entradasDoProjeto({ meta, faixas, ajustes }, prefixo = '', progresso, sinal) {
  const nomes = Object.keys(faixas);
  const json = montarJson({ meta: { ...meta, faixas: nomes, duracao: faixas[nomes[0]][0].length / meta.sr }, ajustes });
  const ent = { [prefixo + 'projeto.json']: [strToU8(JSON.stringify(json, null, 2)), { level: 6 }] };
  for (let i = 0; i < nomes.length; i++) {
    verificarCancelado(sinal);
    const blob = await mp3De(faixas[nomes[i]], meta.sr, 192, (f) => progresso?.((i + f) / nomes.length), sinal);
    ent[prefixo + nomes[i] + '.mp3'] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
  }
  progresso?.(1);
  return ent;
}

/** Um projeto → zip. */
export async function exportarProjeto(projeto, progresso, sinal) {
  const ent = await entradasDoProjeto(projeto, '', progresso, sinal);
  verificarCancelado(sinal);
  return zipSync(ent);
}

/**
 * Vários projetos → um zip com uma pasta por projeto.
 * `carregadores` é uma lista de funções async que devolvem { meta, faixas, ajustes }:
 * carrega um de cada vez para não segurar todo o áudio na memória.
 */
export async function exportarPacote(carregadores, progresso, sinal) {
  const ent = {};
  const usados = new Set();
  for (let k = 0; k < carregadores.length; k++) {
    verificarCancelado(sinal);
    const proj = await carregadores[k]();
    let pasta = nomeSeguro(proj.meta.nome);
    for (let n = 2; usados.has(pasta.toLowerCase()); n++) pasta = `${nomeSeguro(proj.meta.nome)} (${n})`;
    usados.add(pasta.toLowerCase());
    Object.assign(ent, await entradasDoProjeto(proj, pasta + '/', (f) => progresso?.((k + f) / carregadores.length, k), sinal));
  }
  verificarCancelado(sinal);
  return zipSync(ent);
}

export function pareceZip(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}

/** Lê o zip e devolve [{ json, mp3s: { voz: Uint8Array, ... } }]. Lança erro com mensagem para o usuário. */
export function lerArquivoProjeto(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!pareceZip(b)) throw new Error('Esse arquivo não é um projeto do Ensaio Vocal (.zip).');
  let arquivos;
  try {
    arquivos = unzipSync(b);
  } catch {
    throw new Error('Não consegui abrir o .zip. O arquivo pode estar incompleto ou corrompido.');
  }
  // ignora lixo que o Mac coloca ao recompactar (__MACOSX/, ._arquivo)
  const caminhos = Object.keys(arquivos).filter((c) => !/(^|\/)(__MACOSX\/|\._)/.test(c));
  const jsons = caminhos.filter((c) => /(^|\/)projeto\.json$/.test(c));
  if (!jsons.length) throw new Error('Esse .zip não tem nenhum projeto do Ensaio Vocal (falta o projeto.json).');
  const projetos = [];
  for (const cj of jsons) {
    const prefixo = cj.slice(0, cj.length - 'projeto.json'.length);
    let json;
    try {
      json = JSON.parse(strFromU8(arquivos[cj]));
    } catch {
      throw new Error(`O projeto.json em "${prefixo || 'raiz'}" está ilegível.`);
    }
    if (json?.formato !== FORMATO) throw new Error('Esse .zip não é um projeto do Ensaio Vocal.');
    if (json.versao !== VERSAO) {
      throw new Error('Esse projeto foi feito numa versão mais nova do Ensaio Vocal. Atualize a página (Ctrl+F5) e tente de novo.');
    }
    if (!Array.isArray(json.faixas) || !json.faixas.length || !json.faixas.every((f) => NOMES_FAIXA.includes(f))) {
      throw new Error(`O projeto "${json.nome}" tem uma lista de faixas inválida.`);
    }
    if (!(json.sr > 0) || !(json.duracao > 0)) throw new Error(`O projeto "${json.nome}" não informa a duração.`);
    const mp3s = {};
    for (const f of json.faixas) {
      const dados = arquivos[prefixo + f + '.mp3'];
      if (!dados) throw new Error(`O projeto "${json.nome}" está sem a faixa ${f}.mp3.`);
      mp3s[f] = dados;
    }
    projetos.push({ json, mp3s });
  }
  return projetos;
}

/** Ajusta o tamanho (corta ou completa com silêncio) para todas as faixas ficarem iguais. */
export function igualarTamanho([L, R], n) {
  const ajusta = (c) => {
    if (c.length === n) return c;
    const o = new Float32Array(n);
    o.set(c.subarray(0, Math.min(n, c.length)));
    return o;
  };
  return [ajusta(L), ajusta(R)];
}

/**
 * Importa todos os projetos do arquivo.
 * dep = { decodificar(arrayBuffer) → [L,R], guardar(reg), existe(id) → bool, confirmarSubstituir(nome) → bool }
 * Devolve { importados: [id], pulados: [nome] }.
 */
export async function importarProjetos(bytes, dep, progresso, sinal) {
  const projetos = lerArquivoProjeto(bytes);
  const importados = [], pulados = [];
  for (let k = 0; k < projetos.length; k++) {
    verificarCancelado(sinal);
    const { json, mp3s } = projetos[k];
    if (await dep.existe(json.id)) {
      if (!(await dep.confirmarSubstituir(json.nome))) {
        pulados.push(json.nome);
        continue;
      }
    }
    const n = Math.round(json.duracao * json.sr);
    const faixas = {};
    for (let i = 0; i < json.faixas.length; i++) {
      verificarCancelado(sinal);
      const f = json.faixas[i];
      const m = mp3s[f];
      const canais = await dep.decodificar(m.buffer.slice(m.byteOffset, m.byteOffset + m.byteLength));
      const atraso = Number.isInteger(json.atrasoMp3) ? json.atrasoMp3 : ATRASO_MP3;
      faixas[f] = igualarTamanho(canais.map((c) => c.subarray(Math.min(atraso, c.length))), n);
      progresso?.((k + (i + 1) / json.faixas.length) / projetos.length);
    }
    verificarCancelado(sinal);
    await dep.guardar({ id: json.id, nome: json.nome, modeloId: json.modeloId, sr: json.sr, faixas, ajustes: json.ajustes, data: json.criado });
    importados.push(json.id);
  }
  return { importados, pulados, total: projetos.length };
}
