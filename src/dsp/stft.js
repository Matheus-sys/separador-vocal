// STFT/iSTFT iguais ao torch.stft(center=True, pad_mode='reflect', janela Hann periódica, sem normalizar).
import { criarFFT } from './fft.js';

const cacheFFT = new Map();
function fftDe(n) {
  if (!cacheFFT.has(n)) cacheFFT.set(n, criarFFT(n));
  return cacheFFT.get(n);
}

export function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

function refletir(i, len) {
  // reflexão sem repetir a borda (numpy/torch 'reflect'), robusta para pedaço curto
  if (len === 1) return 0;
  const periodo = 2 * len - 2;
  i = ((i % periodo) + periodo) % periodo;
  return i < len ? i : periodo - i;
}

/**
 * x: Float32Array de um canal (tamanho L).
 * Devolve { re, im, bins, frames } com layout [bin][frame] (bins = nFft/2+1).
 */
export function stft(x, nFft, hop) {
  const L = x.length;
  const pad = nFft / 2;
  const frames = 1 + Math.floor(L / hop);
  const bins = nFft / 2 + 1;
  const w = hann(nFft);
  const fft = fftDe(nFft);
  const fr = new Float64Array(nFft), fi = new Float64Array(nFft);
  const or = new Float64Array(nFft), oi = new Float64Array(nFft);
  const re = new Float32Array(bins * frames), im = new Float32Array(bins * frames);
  for (let t = 0; t < frames; t++) {
    const ini = t * hop - pad;
    for (let n = 0; n < nFft; n++) {
      const idx = ini + n;
      const v = idx >= 0 && idx < L ? x[idx] : x[refletir(idx, L)];
      fr[n] = v * w[n];
      fi[n] = 0;
    }
    fft.direta(fr, fi, or, oi);
    for (let b = 0; b < bins; b++) {
      re[b * frames + t] = or[b];
      im[b * frames + t] = oi[b];
    }
  }
  return { re, im, bins, frames };
}

/** Inverso de stft(). re/im no layout [bin][frame]. Devolve Float32Array de tamanho `tamanho`. */
export function istft(re, im, nFft, hop, frames, tamanho) {
  const pad = nFft / 2;
  const bins = nFft / 2 + 1;
  const w = hann(nFft);
  const fft = fftDe(nFft);
  const total = nFft + hop * (frames - 1);
  const soma = new Float64Array(total);
  const env = new Float64Array(total);
  const sr = new Float64Array(nFft), si = new Float64Array(nFft);
  const or = new Float64Array(nFft), oi = new Float64Array(nFft);
  for (let t = 0; t < frames; t++) {
    for (let b = 0; b < bins; b++) {
      sr[b] = re[b * frames + t];
      si[b] = im[b * frames + t];
    }
    // espectro hermitiano; DC e Nyquist reais (como irfft)
    si[0] = 0; si[bins - 1] = 0;
    for (let b = bins; b < nFft; b++) {
      sr[b] = sr[nFft - b];
      si[b] = -si[nFft - b];
    }
    fft.inversa(sr, si, or, oi);
    const ini = t * hop;
    for (let n = 0; n < nFft; n++) {
      soma[ini + n] += or[n] * w[n];
      env[ini + n] += w[n] * w[n];
    }
  }
  const y = new Float32Array(tamanho);
  for (let i = 0; i < tamanho; i++) {
    const j = i + pad;
    if (j < total) y[i] = env[j] > 1e-11 ? soma[j] / env[j] : 0;
  }
  return y;
}

/**
 * STFT dos dois canais de uma vez: uma FFT complexa com L na parte real e R na imaginária
 * (metade das FFTs). X_L[k] = (Z[k] + conj Z[N-k]) / 2 ; X_R[k] = (Z[k] - conj Z[N-k]) / 2i.
 * Devolve [specL, specR] no mesmo formato de stft().
 */
export function stftEstereo(L, R, nFft, hop) {
  const n = L.length;
  const pad = nFft / 2;
  const frames = 1 + Math.floor(n / hop);
  const bins = nFft / 2 + 1;
  const w = hann(nFft);
  const fft = fftDe(nFft);
  const zr = new Float64Array(nFft), zi = new Float64Array(nFft);
  const or = new Float64Array(nFft), oi = new Float64Array(nFft);
  const lRe = new Float32Array(bins * frames), lIm = new Float32Array(bins * frames);
  const rRe = new Float32Array(bins * frames), rIm = new Float32Array(bins * frames);
  for (let t = 0; t < frames; t++) {
    const ini = t * hop - pad;
    for (let k = 0; k < nFft; k++) {
      const idx = ini + k;
      const j = idx >= 0 && idx < n ? idx : refletir(idx, n);
      zr[k] = L[j] * w[k];
      zi[k] = R[j] * w[k];
    }
    fft.direta(zr, zi, or, oi);
    for (let b = 0; b < bins; b++) {
      const m = b === 0 ? 0 : nFft - b;
      const ar = or[b], ai = oi[b], cr = or[m], ci = -oi[m]; // conj Z[N-k]
      const o = b * frames + t;
      lRe[o] = 0.5 * (ar + cr);
      lIm[o] = 0.5 * (ai + ci);
      // (a - c) / 2i = (ai - ci)/2 - i (ar - cr)/2
      rRe[o] = 0.5 * (ai - ci);
      rIm[o] = -0.5 * (ar - cr);
    }
  }
  return [
    { re: lRe, im: lIm, bins, frames },
    { re: rRe, im: rIm, bins, frames },
  ];
}

/** iSTFT dos dois canais de uma vez (uma FFT inversa: real = L, imaginária = R). */
export function istftEstereo(sL, sR, nFft, hop, frames, tamanho) {
  const pad = nFft / 2;
  const bins = nFft / 2 + 1;
  const w = hann(nFft);
  const fft = fftDe(nFft);
  const total = nFft + hop * (frames - 1);
  const somaL = new Float64Array(total), somaR = new Float64Array(total);
  const env = new Float64Array(total);
  const zr = new Float64Array(nFft), zi = new Float64Array(nFft);
  const or = new Float64Array(nFft), oi = new Float64Array(nFft);
  for (let t = 0; t < frames; t++) {
    // Z = X_L + i X_R, com cada espectro estendido de forma hermitiana (DC e Nyquist reais)
    for (let b = 0; b < nFft; b++) {
      const h = b < bins ? b : nFft - b;
      const o = h * frames + t;
      let lr = sL.re[o], li = b < bins ? sL.im[o] : -sL.im[o];
      let rr = sR.re[o], ri = b < bins ? sR.im[o] : -sR.im[o];
      if (h === 0 || h === bins - 1) { li = 0; ri = 0; }
      zr[b] = lr - ri;
      zi[b] = li + rr;
    }
    fft.inversa(zr, zi, or, oi);
    const ini = t * hop;
    for (let k = 0; k < nFft; k++) {
      somaL[ini + k] += or[k] * w[k];
      somaR[ini + k] += oi[k] * w[k];
      env[ini + k] += w[k] * w[k];
    }
  }
  const yL = new Float32Array(tamanho), yR = new Float32Array(tamanho);
  for (let i = 0; i < tamanho; i++) {
    const j = i + pad;
    if (j < total && env[j] > 1e-11) {
      yL[i] = somaL[j] / env[j];
      yR[i] = somaR[j] / env[j];
    }
  }
  return [yL, yR];
}
