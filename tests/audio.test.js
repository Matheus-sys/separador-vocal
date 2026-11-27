import { describe, it, expect } from 'vitest';
import { aplicarTomVelocidade, misturar, paraInt16 } from '../src/audio/exportar.js';
import { criarFFT } from '../src/dsp/fft.js';

const SR = 44100;
const seno = (f, seg) => Float32Array.from({ length: Math.round(SR * seg) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * f * i) / SR));

function frequenciaDominante(x) {
  const n = 16384, ini = Math.floor(x.length / 2 - n / 2);
  const re = new Float64Array(n), im = new Float64Array(n), oR = new Float64Array(n), oI = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = x[ini + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  criarFFT(n).direta(re, im, oR, oI);
  let best = 0, bi = 0;
  for (let k = 1; k < n / 2; k++) { const m = oR[k] ** 2 + oI[k] ** 2; if (m > best) { best = m; bi = k; } }
  return (bi * SR) / n;
}

describe('tom e velocidade (offline)', () => {
  it('+2 semitons leva 440 Hz para ~494 Hz sem mudar a duração', async () => {
    const x = seno(440, 3);
    const [L] = await aplicarTomVelocidade([x, x], 2, 1);
    expect(Math.abs(frequenciaDominante(L) - 493.9)).toBeLessThan(6);
    expect(Math.abs(L.length / x.length - 1)).toBeLessThan(0.05);
  });
  it('-12 semitons leva 880 Hz para 440 Hz', async () => {
    const x = seno(880, 3);
    const [L] = await aplicarTomVelocidade([x, x], -12, 1);
    expect(Math.abs(frequenciaDominante(L) - 440)).toBeLessThan(6);
  });
  it('70% de velocidade estica a duração sem mudar o tom', async () => {
    const x = seno(440, 3);
    const [L] = await aplicarTomVelocidade([x, x], 0, 0.7);
    expect(Math.abs(L.length / x.length - 1 / 0.7)).toBeLessThan(0.05);
    expect(Math.abs(frequenciaDominante(L) - 440)).toBeLessThan(6);
  });
  it('tom 0 e velocidade 100% devolve o mesmo áudio', async () => {
    const x = seno(440, 0.5);
    const r = await aplicarTomVelocidade([x, x], 0, 1);
    expect(r[0]).toBe(x);
  });
});

describe('mistura', () => {
  it('soma as faixas com os volumes e ignora faixa em zero', () => {
    const a = [Float32Array.of(1, 1), Float32Array.of(1, 1)];
    const b = [Float32Array.of(0.5, 0.5), Float32Array.of(0.5, 0.5)];
    const [L] = misturar({ voz: a, instrumental: b }, { voz: 0, instrumental: 2 });
    expect([...L]).toEqual([1, 1]);
  });
  it('converte para 16 bits sem estourar', () => {
    expect([...paraInt16(Float32Array.of(-2, -1, 0, 1, 2))]).toEqual([-32768, -32768, 0, 32767, 32767]);
  });
});
