import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import {
  exportarProjeto, exportarPacote, lerArquivoProjeto, importarProjetos, nomeSeguro, igualarTamanho, pareceZip,
} from '../src/armazenamento/projeto.js';

const SR = 44100;
const seno = (f, seg) => Float32Array.from({ length: Math.round(SR * seg) }, (_, i) => 0.3 * Math.sin((2 * Math.PI * f * i) / SR));
const projeto = (nome, id, nFaixas = 3) => {
  const nomes = nFaixas === 3 ? ['voz', 'backing', 'instrumental'] : ['voz', 'instrumental'];
  const faixas = Object.fromEntries(nomes.map((k, i) => [k, [seno(220 * (i + 1), 2), seno(330 * (i + 1), 2)]]));
  return {
    meta: { id, nome, modeloId: nFaixas === 3 ? 'qualidade' : 'leve', sr: SR, data: 1700000000000 },
    faixas,
    ajustes: { volume: { voz: 0.2, backing: 1, instrumental: 1 }, mudo: {}, solo: {}, tom: -2, vel: 0.85, loop: { a: 0.5, b: 1.5, ativo: true } },
  };
};
// o Node não tem Web Audio: simula a decodificação devolvendo áudio com o tamanho certo + atraso de MP3
const decodificarFalso = async () => [new Float32Array(SR * 2 + 1105), new Float32Array(SR * 2 + 1105)];

describe('arquivo de projeto', () => {
  it('exporta um zip com projeto.json e uma faixa MP3 por stem, e lê de volta', async () => {
    let ultimo = 0;
    const zip = await exportarProjeto(projeto('Era Eu', 'qualidade:abc'), (f) => (ultimo = f));
    expect(pareceZip(zip)).toBe(true);
    expect(ultimo).toBe(1);
    expect(Object.keys(unzipSync(zip)).sort()).toEqual(['backing.mp3', 'instrumental.mp3', 'projeto.json', 'voz.mp3']);
    const [p] = lerArquivoProjeto(zip);
    expect(p.json).toMatchObject({ formato: 'ensaio-vocal', versao: 1, id: 'qualidade:abc', nome: 'Era Eu', sr: SR, duracao: 2 });
    expect(p.json.ajustes.tom).toBe(-2);
    expect(p.json.ajustes.loop).toEqual({ a: 0.5, b: 1.5, ativo: true });
    // MP3 de verdade: começa com cabeçalho de quadro (0xFFE.) ou ID3
    for (const f of ['voz', 'backing', 'instrumental']) {
      const b = p.mp3s[f];
      expect(b.length).toBeGreaterThan(10000);
      expect(b[0] === 0xff || strFromU8(b.subarray(0, 3)) === 'ID3').toBe(true);
    }
  });

  it('pacote com vários projetos vira uma pasta por projeto (nomes repetidos não colidem)', async () => {
    const lista = [projeto('Era Eu', 'a'), projeto('Era Eu', 'b', 2), projeto('Outra: música?', 'c', 2)];
    const zip = await exportarPacote(lista.map((p) => async () => p));
    const pastas = [...new Set(Object.keys(unzipSync(zip)).map((c) => c.split('/')[0]))].sort();
    expect(pastas).toEqual(['Era Eu', 'Era Eu (2)', 'Outra música']);
    const lidos = lerArquivoProjeto(zip);
    expect(lidos.map((p) => p.json.id).sort()).toEqual(['a', 'b', 'c']);
    expect(lidos.find((p) => p.json.id === 'b').json.faixas).toEqual(['voz', 'instrumental']);
  });

  it('importa: iguala o tamanho das faixas e guarda com os ajustes', async () => {
    const zip = await exportarProjeto(projeto('Era Eu', 'x'));
    const guardados = [];
    const r = await importarProjetos(zip, {
      decodificar: decodificarFalso,
      existe: async () => false,
      confirmarSubstituir: async () => true,
      guardar: async (reg) => guardados.push(reg),
    });
    expect(r).toMatchObject({ importados: ['x'], pulados: [], total: 1 });
    const g = guardados[0];
    expect(g.ajustes.vel).toBe(0.85);
    // o atraso do MP3 (1105 amostras) é descontado: o decodificador falso devolve 2 s + 1105
    expect(lerArquivoProjeto(zip)[0].json.atrasoMp3).toBe(1105);
    for (const k of Object.keys(g.faixas)) expect(g.faixas[k][0].length).toBe(SR * 2);
  });

  it('projeto já existente: pergunta e pula se a pessoa não quiser substituir', async () => {
    const zip = await exportarProjeto(projeto('Era Eu', 'x', 2));
    const guardados = [];
    const r = await importarProjetos(zip, {
      decodificar: decodificarFalso, existe: async () => true, confirmarSubstituir: async () => false, guardar: async (g) => guardados.push(g),
    });
    expect(r.pulados).toEqual(['Era Eu']);
    expect(guardados).toHaveLength(0);
  });

  it('cancelar interrompe a exportação', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(exportarProjeto(projeto('Era Eu', 'x'), null, ctrl.signal)).rejects.toThrow(/Cancelado/);
  });

  it('recusa arquivo que não é zip, zip sem projeto, versão nova e faixa faltando', () => {
    expect(() => lerArquivoProjeto(strToU8('não sou zip'))).toThrow(/não é um projeto/);
    expect(() => lerArquivoProjeto(zipSync({ 'foto.jpg': strToU8('x') }))).toThrow(/falta o projeto.json/);
    const base = { formato: 'ensaio-vocal', versao: 1, id: 'y', nome: 'X', sr: SR, duracao: 2, faixas: ['voz', 'instrumental'] };
    expect(() => lerArquivoProjeto(zipSync({ 'projeto.json': strToU8(JSON.stringify({ ...base, versao: 9 })) }))).toThrow(/versão mais nova/);
    expect(() => lerArquivoProjeto(zipSync({ 'projeto.json': strToU8(JSON.stringify({ ...base, formato: 'outro' })) }))).toThrow(/não é um projeto/);
    expect(() => lerArquivoProjeto(zipSync({ 'projeto.json': strToU8(JSON.stringify(base)), 'voz.mp3': strToU8('x') }))).toThrow(/sem a faixa instrumental/);
  });

  it('recusa duração ou taxa absurdas e arquivo grande demais (zip bomb)', async () => {
    const base = { formato: 'ensaio-vocal', versao: 1, id: 'z', nome: 'X', sr: SR, duracao: 2, faixas: ['voz'] };
    const z = (j, extra = {}) => zipSync({ 'projeto.json': strToU8(JSON.stringify(j)), 'voz.mp3': strToU8('x'), ...extra });
    expect(() => lerArquivoProjeto(z({ ...base, duracao: 1e9 }))).toThrow(/duração inválida/);
    expect(() => lerArquivoProjeto(z({ ...base, sr: 1e9 }))).toThrow(/taxa de amostragem/);
    // 61 MB de zeros compactam em poucos KB: o tamanho declarado é recusado antes de descompactar
    const bomba = zipSync({ 'projeto.json': strToU8(JSON.stringify(base)), 'voz.mp3': [new Uint8Array(61 * 1024 * 1024), { level: 9 }] });
    expect(bomba.length).toBeLessThan(1024 * 1024);
    expect(() => lerArquivoProjeto(bomba)).toThrow(/grande demais/);
    // arquivos estranhos dentro do zip são ignorados (não descompactados)
    expect(lerArquivoProjeto(z(base, { 'video.mp4': new Uint8Array(10) }))).toHaveLength(1);
  });

  it('ignora o lixo que o Mac põe ao recompactar (__MACOSX)', async () => {
    const original = unzipSync(await exportarProjeto(projeto('Era Eu', 'm', 2)));
    const recompactado = zipSync({ ...Object.fromEntries(Object.entries(original).map(([k, v]) => ['Era Eu/' + k, v])), '__MACOSX/Era Eu/._projeto.json': strToU8('lixo') });
    expect(lerArquivoProjeto(recompactado)).toHaveLength(1);
  });

  it('utilidades', () => {
    expect(nomeSeguro('a/b\\c:d*e?"f<g>h|i')).toBe('a b c d e f g h i');
    expect(nomeSeguro('   ')).toBe('musica');
    const [L] = igualarTamanho([new Float32Array(5).fill(1), new Float32Array(5)], 8);
    expect([...L]).toEqual([1, 1, 1, 1, 1, 0, 0, 0]);
  });
});
