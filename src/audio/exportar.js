// Exportação: WAV (16 bits), MP3 (lamejs) e aplicação offline de tom/velocidade (SoundTouch).
import { SoundTouch, SimpleFilter } from 'soundtouchjs';
import { Mp3Encoder } from '@breezystack/lamejs';

export function paraInt16(f) {
  const o = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    o[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return o;
}

export function wavDe(canais, sr) {
  const n = canais[0].length, ch = canais.length;
  const buf = new ArrayBuffer(44 + n * ch * 2);
  const v = new DataView(buf);
  const txt = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  txt(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); txt(8, 'WAVE');
  txt(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  txt(36, 'data'); v.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, canais[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export async function mp3De(canais, sr, kbps = 192, onProgresso) {
  const enc = new Mp3Encoder(2, sr, kbps);
  const L = paraInt16(canais[0]), R = paraInt16(canais[1] || canais[0]);
  const partes = [];
  const bloco = 1152 * 20;
  for (let i = 0; i < L.length; i += bloco) {
    const m = enc.encodeBuffer(L.subarray(i, i + bloco), R.subarray(i, i + bloco));
    if (m.length) partes.push(new Uint8Array(m));
    if ((i / bloco) % 50 === 0) {
      onProgresso?.(i / L.length);
      await new Promise((r) => setTimeout(r, 0)); // não travar a tela
    }
  }
  const fim = enc.flush();
  if (fim.length) partes.push(new Uint8Array(fim));
  return new Blob(partes, { type: 'audio/mpeg' });
}

/** Mistura as faixas com os volumes informados. */
export function misturar(faixas, ganhos) {
  const nomes = Object.keys(faixas).filter((k) => (ganhos[k] ?? 0) > 0);
  const n = faixas[Object.keys(faixas)[0]][0].length;
  const out = [new Float32Array(n), new Float32Array(n)];
  for (const k of nomes) {
    const g = ganhos[k];
    for (let c = 0; c < 2; c++) {
      const s = faixas[k][c], o = out[c];
      for (let i = 0; i < n; i++) o[i] += s[i] * g;
    }
  }
  return out;
}

/** Aplica tom (semitons) e velocidade (1 = normal) no áudio inteiro, fora do tempo real. */
export async function aplicarTomVelocidade(canais, tom, vel, onProgresso) {
  if (tom === 0 && vel === 1) return canais;
  const [L, R] = canais;
  const n = L.length;
  const fonte = {
    // devolve 0,5 s de silêncio depois do fim para o SoundTouch esvaziar o que ficou guardado
    extract(alvo, quadros, pos) {
      const q = Math.max(0, Math.min(quadros, n + 22050 - pos));
      for (let i = 0; i < q; i++) {
        const j = pos + i;
        alvo[i * 2] = j < n ? L[j] : 0;
        alvo[i * 2 + 1] = j < n ? R[j] : 0;
      }
      return q;
    },
  };
  const st = new SoundTouch();
  st.tempo = vel;
  st.pitchSemitones = tom;
  const filtro = new SimpleFilter(fonte, st);
  const estimado = Math.ceil(n / vel) + 44100;
  const oL = new Float32Array(estimado), oR = new Float32Array(estimado);
  const tmp = new Float32Array(8192 * 2);
  let escrito = 0, voltas = 0;
  for (;;) {
    const q = filtro.extract(tmp, 8192);
    if (q === 0) break;
    const lim = Math.min(q, estimado - escrito);
    for (let i = 0; i < lim; i++) {
      oL[escrito + i] = tmp[i * 2];
      oR[escrito + i] = tmp[i * 2 + 1];
    }
    escrito += lim;
    if (++voltas % 40 === 0) {
      onProgresso?.(Math.min(1, filtro.sourcePosition / n));
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  // a saída começa alinhada; o que passa do tamanho esperado é o silêncio de esvaziamento
  const fim = Math.min(escrito, Math.round(n / vel));
  return [oL.subarray(0, fim), oR.subarray(0, fim)];
}

export function baixarBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
