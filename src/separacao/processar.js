// Monta a entrada do modelo a partir do áudio e reconstrói as faixas a partir da saída.
// Funções puras (sem ONNX), para poderem ser testadas no Node.
import { stftEstereo, istftEstereo } from '../dsp/stft.js';

/** RoFormer: entrada [1, 2050, T, 2] com layout (bin*2 + canal, frame, re/im). */
export function roformerEntrada(canais, nFft, hop) {
  const specs = stftEstereo(canais[0], canais[1], nFft, hop);
  const { bins, frames } = specs[0];
  const dados = new Float32Array(bins * 2 * frames * 2);
  for (let b = 0; b < bins; b++) {
    for (let c = 0; c < 2; c++) {
      const s = specs[c];
      const base = (b * 2 + c) * frames * 2;
      for (let t = 0; t < frames; t++) {
        dados[base + t * 2] = s.re[b * frames + t];
        dados[base + t * 2 + 1] = s.im[b * frames + t];
      }
    }
  }
  return { dados, specs, bins, frames };
}

/**
 * Aplica as máscaras complexas do RoFormer (saída [2, 2050, T, 2]).
 * máscara 0 = voz sobre a mistura; máscara 1 = backing sobre a voz.
 * Devolve { voz: [L,R], backing: [L,R] } no domínio do tempo.
 */
export function roformerSaida(specs, mascaras, nFft, hop, tamanho) {
  const { bins, frames } = specs[0];
  const plano = bins * 2 * frames * 2;
  const espV = [], espB = [];
  for (let c = 0; c < 2; c++) {
    const s = specs[c];
    const vRe = new Float32Array(bins * frames), vIm = new Float32Array(bins * frames);
    const bRe = new Float32Array(bins * frames), bIm = new Float32Array(bins * frames);
    for (let b = 0; b < bins; b++) {
      const base = (b * 2 + c) * frames * 2;
      for (let t = 0; t < frames; t++) {
        const k = b * frames + t, o = base + t * 2;
        const xr = s.re[k], xi = s.im[k];
        const m0r = mascaras[o], m0i = mascaras[o + 1];
        const vr = xr * m0r - xi * m0i, vi = xr * m0i + xi * m0r;
        const m1r = mascaras[plano + o], m1i = mascaras[plano + o + 1];
        vRe[k] = vr; vIm[k] = vi;
        bRe[k] = vr * m1r - vi * m1i; bIm[k] = vr * m1i + vi * m1r;
      }
    }
    espV.push({ re: vRe, im: vIm });
    espB.push({ re: bRe, im: bIm });
  }
  const voz = istftEstereo(espV[0], espV[1], nFft, hop, frames, tamanho);
  const backing = istftEstereo(espB[0], espB[1], nFft, hop, frames, tamanho);
  return { voz, backing };
}

/** MDX-Net: entrada [1, 4, dimF, T] com canais (L re, L im, R re, R im). */
export function mdxEntrada(canais, nFft, hop, dimF) {
  const specs = stftEstereo(canais[0], canais[1], nFft, hop);
  const { frames } = specs[0];
  const dados = new Float32Array(4 * dimF * frames);
  for (let c = 0; c < 2; c++) {
    const s = specs[c];
    for (let f = 0; f < dimF; f++) {
      const re = (c * 2) * dimF * frames + f * frames;
      const im = (c * 2 + 1) * dimF * frames + f * frames;
      for (let t = 0; t < frames; t++) {
        dados[re + t] = s.re[f * frames + t];
        dados[im + t] = s.im[f * frames + t];
      }
    }
  }
  return { dados, frames };
}

/** MDX-Net: a saída já é o espectro da voz. Devolve [L,R] no tempo. */
export function mdxSaida(saida, nFft, hop, dimF, frames, tamanho, compensar) {
  const bins = nFft / 2 + 1;
  const esp = [];
  for (let c = 0; c < 2; c++) {
    const re = new Float32Array(bins * frames), im = new Float32Array(bins * frames);
    const oRe = (c * 2) * dimF * frames, oIm = (c * 2 + 1) * dimF * frames;
    for (let f = 0; f < dimF; f++) {
      for (let t = 0; t < frames; t++) {
        re[f * frames + t] = saida[oRe + f * frames + t];
        im[f * frames + t] = saida[oIm + f * frames + t];
      }
    }
    esp.push({ re, im });
  }
  const voz = istftEstereo(esp[0], esp[1], nFft, hop, frames, tamanho);
  for (const y of voz) for (let i = 0; i < y.length; i++) y[i] *= compensar;
  return voz;
}
