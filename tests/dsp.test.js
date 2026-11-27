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
  it('com borda descartada (MDX) a emenda continua exata e a borda não entra', () => {
    const total = 600000, tam = 261120, sob = 16384, borda = 3840;
    const x = Float32Array.from({ length: total }, (_, i) => Math.sin(i / 37));
    const inicios = planejarPedacos(total, tam, sob);
    const acc = criarAcumulador(total, 1);
    inicios.forEach((ini, k) => {
      const p = recortar(x, ini, tam);
      // simula o modelo errando nas pontas: lixo nas primeiras/últimas `borda` amostras
      for (let i = 0; i < borda; i++) { p[i] = 99; p[tam - 1 - i] = 99; }
      acc.somar(ini, [p], pesoPedaco(tam, sob, k === 0, k === inicios.length - 1, borda));
    });
    const [y] = acc.finalizar();
    let err = 0;
    for (let i = borda; i < total - tam; i++) err = Math.max(err, Math.abs(x[i] - y[i]));
    expect(err).toBeLessThan(1e-5);
  });
  it('música mais curta que um pedaço vira um pedaço só', () => {
    expect(planejarPedacos(500, 1000, 200)).toEqual([0]);
  });
});

describe('stft estéreo (2 canais numa FFT só)', async () => {
  const { stftEstereo, istftEstereo } = await import('../src/dsp/stft.js');
  for (const [nFft, hop, L] of [[2048, 441, 441 * 60], [6144, 1024, 1024 * 30], [7680, 1024, 1024 * 30]]) {
    it(`bate com a STFT de cada canal e volta exata (nFft=${nFft})`, () => {
      const a = Float32Array.from({ length: L }, () => Math.random() - 0.5);
      const b = Float32Array.from({ length: L }, () => Math.random() - 0.5);
      const [sa, sb] = stftEstereo(a, b, nFft, hop);
      const ra = stft(a, nFft, hop), rb = stft(b, nFft, hop);
      let err = 0;
      for (let i = 0; i < ra.re.length; i++) {
        err = Math.max(err, Math.abs(sa.re[i] - ra.re[i]), Math.abs(sa.im[i] - ra.im[i]), Math.abs(sb.re[i] - rb.re[i]), Math.abs(sb.im[i] - rb.im[i]));
      }
      expect(err).toBeLessThan(1e-3);
      const [ya, yb] = istftEstereo(sa, sb, nFft, hop, sa.frames, L);
      const ia = istft(ra.re, ra.im, nFft, hop, ra.frames, L);
      let e2 = 0;
      for (let i = 0; i < L; i++) e2 = Math.max(e2, Math.abs(ya[i] - a[i]), Math.abs(yb[i] - b[i]), Math.abs(ya[i] - ia[i]));
      expect(e2).toBeLessThan(1e-4);
    });
  }
});
