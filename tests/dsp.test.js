import { describe, it, expect } from 'vitest';
import { criarFFT } from '../src/dsp/fft.js';
import { stft, istft } from '../src/dsp/stft.js';
import { planejarPedacos, pesoPedaco, recortar, criarAcumulador } from '../src/separacao/janelas.js';

function dftIngenua(re, im) {
  const n = re.length, oR = new Float64Array(n), oI = new Float64Array(n);
  for (let k = 0; k < n; k++) for (let t = 0; t < n; t++) {
    const a = (-2 * Math.PI * k * t) / n;
    oR[k] += re[t] * Math.cos(a) - im[t] * Math.sin(a);
    oI[k] += re[t] * Math.sin(a) + im[t] * Math.cos(a);
  }
  return [oR, oI];
}

describe('fft', () => {
  for (const n of [2, 3, 4, 5, 8, 12, 30, 60, 256, 2048, 7680]) {
    it(`bate com a DFT ingênua em n=${n}`, () => {
      const re = Float64Array.from({ length: n }, () => Math.random() - 0.5);
      const im = Float64Array.from({ length: n }, () => Math.random() - 0.5);
      const f = criarFFT(n), oR = new Float64Array(n), oI = new Float64Array(n);
      f.direta(re, im, oR, oI);
      const [eR, eI] = dftIngenua(re, im);
      let err = 0;
      for (let i = 0; i < n; i++) err = Math.max(err, Math.abs(oR[i] - eR[i]), Math.abs(oI[i] - eI[i]));
      expect(err).toBeLessThan(1e-6 * n);
      const bR = new Float64Array(n), bI = new Float64Array(n);
      f.inversa(oR, oI, bR, bI);
      for (let i = 0; i < n; i++) expect(Math.abs(bR[i] - re[i])).toBeLessThan(1e-9);
    });
  }
});

describe('stft', () => {
  for (const [nFft, hop, L] of [[2048, 441, 441 * 99], [7680, 1024, 1024 * 40], [2048, 441, 30000]]) {
    it(`ida e volta reconstroi o sinal (nFft=${nFft})`, () => {
      const x = Float32Array.from({ length: L }, () => Math.random() - 0.5);
      const s = stft(x, nFft, hop);
      expect(s.frames).toBe(1 + Math.floor(L / hop));
      const y = istft(s.re, s.im, nFft, hop, s.frames, L);
      let err = 0;
      for (let i = 0; i < L; i++) err = Math.max(err, Math.abs(x[i] - y[i]));
      expect(err).toBeLessThan(1e-4);
    });
  }
});

describe('pedaços', () => {
  it('juntar pedaços sem processar devolve o original, sem emenda', () => {
    const total = 100003, tam = 9000, sob = 2000;
    const x = Float32Array.from({ length: total }, (_, i) => Math.sin(i / 50));
    const inicios = planejarPedacos(total, tam, sob);
    expect(inicios[inicios.length - 1] + tam).toBeGreaterThanOrEqual(total);
    const acc = criarAcumulador(total, 1);
    inicios.forEach((ini, k) => acc.somar(ini, [recortar(x, ini, tam)], pesoPedaco(tam, sob, k === 0, k === inicios.length - 1)));
    const [y] = acc.finalizar();
    let err = 0;
    for (let i = 0; i < total; i++) err = Math.max(err, Math.abs(x[i] - y[i]));
    expect(err).toBeLessThan(1e-5);
  });
  it('música mais curta que um pedaço vira um pedaço só', () => {
    expect(planejarPedacos(500, 1000, 200)).toEqual([0]);
  });
});
