// FFT complexa de raiz mista (2, 3, 4, 5 e genérica), no estilo do kissfft.
// Serve para qualquer tamanho; os modelos usam 2048 (RoFormer) e 7680 (MDX).

function fatorar(n) {
  const f = [];
  let p = 4;
  while (n > 1) {
    while (n % p !== 0) {
      if (p === 4) p = 2;
      else if (p === 2) p = 3;
      else p += 2;
      if (p * p > n) p = n;
    }
    n /= p;
    f.push(p);
  }
  return f;
}

export function criarFFT(n) {
  const fatores = fatorar(n);
  const twRe = new Float64Array(n);
  const twIm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (-2 * Math.PI * i) / n;
    twRe[i] = Math.cos(a);
    twIm[i] = Math.sin(a);
  }
  const maxP = Math.max(...fatores);
  const scRe = new Float64Array(maxP);
  const scIm = new Float64Array(maxP);
  const oRe = new Float64Array(n);
  const oIm = new Float64Array(n);

  function trabalhar(o, iRe, iIm, ini, passo, nivel, mTotal) {
    const p = fatores[nivel];
    const m = mTotal / p;
    if (m === 1) {
      for (let k = 0; k < p; k++) {
        oRe[o + k] = iRe[ini + k * passo];
        oIm[o + k] = iIm[ini + k * passo];
      }
    } else {
      for (let k = 0; k < p; k++) trabalhar(o + k * m, iRe, iIm, ini + k * passo, passo * p, nivel + 1, m);
    }
    borboleta(o, passo, p, m);
  }

  function borboleta(o, passo, p, m) {
    if (p === 2) {
      for (let u = 0; u < m; u++) {
        const a = o + u, b = a + m;
        const t = u * passo;
        const xr = oRe[b] * twRe[t] - oIm[b] * twIm[t];
        const xi = oRe[b] * twIm[t] + oIm[b] * twRe[t];
        oRe[b] = oRe[a] - xr; oIm[b] = oIm[a] - xi;
        oRe[a] += xr; oIm[a] += xi;
      }
      return;
    }
    if (p === 4) {
      for (let u = 0; u < m; u++) {
        const i0 = o + u, i1 = i0 + m, i2 = i1 + m, i3 = i2 + m;
        const t1 = u * passo, t2 = 2 * t1, t3 = 3 * t1;
        const ar = oRe[i0], ai = oIm[i0];
        const br = oRe[i1] * twRe[t1] - oIm[i1] * twIm[t1], bi = oRe[i1] * twIm[t1] + oIm[i1] * twRe[t1];
        const cr = oRe[i2] * twRe[t2] - oIm[i2] * twIm[t2], ci = oRe[i2] * twIm[t2] + oIm[i2] * twRe[t2];
        const dr = oRe[i3] * twRe[t3] - oIm[i3] * twIm[t3], di = oRe[i3] * twIm[t3] + oIm[i3] * twRe[t3];
        const s0r = ar + cr, s0i = ai + ci, s1r = ar - cr, s1i = ai - ci;
        const s2r = br + dr, s2i = bi + di, s3r = br - dr, s3i = bi - di;
        oRe[i0] = s0r + s2r; oIm[i0] = s0i + s2i;
        oRe[i2] = s0r - s2r; oIm[i2] = s0i - s2i;
        // direto: -j * s3
        oRe[i1] = s1r + s3i; oIm[i1] = s1i - s3r;
        oRe[i3] = s1r - s3i; oIm[i3] = s1i + s3r;
      }
      return;
    }
    // genérica (3, 5, ...)
    for (let u = 0; u < m; u++) {
      let k = o + u;
      for (let q = 0; q < p; q++) { scRe[q] = oRe[k]; scIm[q] = oIm[k]; k += m; }
      k = u;
      for (let q1 = 0; q1 < p; q1++) {
        let tw = 0;
        let sr = scRe[0], si = scIm[0];
        for (let q = 1; q < p; q++) {
          tw += passo * k;
          if (tw >= n) tw %= n;
          sr += scRe[q] * twRe[tw] - scIm[q] * twIm[tw];
          si += scRe[q] * twIm[tw] + scIm[q] * twRe[tw];
        }
        oRe[o + k] = sr; oIm[o + k] = si;
        k += m;
      }
    }
  }

  return {
    n,
    /** FFT direta. Escreve em outRe/outIm (tamanho n). */
    direta(inRe, inIm, outRe, outIm) {
      trabalhar(0, inRe, inIm, 0, 1, 0, n);
      outRe.set(oRe); outIm.set(oIm);
    },
    /** FFT inversa, já dividida por n. */
    inversa(inRe, inIm, outRe, outIm) {
      // conj(FFT(conj(x)))/n
      const cIm = new Float64Array(n);
      for (let i = 0; i < n; i++) cIm[i] = -inIm[i];
      trabalhar(0, inRe, cIm, 0, 1, 0, n);
      for (let i = 0; i < n; i++) { outRe[i] = oRe[i] / n; outIm[i] = -oIm[i] / n; }
    },
  };
}
