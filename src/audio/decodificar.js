// Decodifica qualquer formato que o navegador entende (MP3, WAV, M4A/AAC, OGG, FLAC) para 44,1 kHz estéreo.
// WAV de 44,1 kHz é lido direto (não depende da Web Audio API).

/** Lê WAV PCM 16/24 bits ou float 32 a 44,1 kHz. Devolve null se o formato não for esse. */
export function lerWav(buf, sr = 44100) {
  const v = new DataView(buf);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (buf.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let o = 12, fmt = null;
  while (o + 8 <= buf.byteLength) {
    const id = tag(o), tam = v.getUint32(o + 4, true);
    if (id === 'fmt ') {
      fmt = { formato: v.getUint16(o + 8, true), canais: v.getUint16(o + 10, true), taxa: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
    } else if (id === 'data' && fmt) {
      const { formato, canais, taxa, bits } = fmt;
      const pcm = formato === 1 || formato === 0xfffe;
      const flt = formato === 3;
      if (taxa !== sr || !(pcm && (bits === 16 || bits === 24)) && !(flt && bits === 32)) return null;
      const bytes = bits / 8, quadros = Math.floor(Math.min(tam, buf.byteLength - o - 8) / (bytes * canais));
      const L = new Float32Array(quadros), R = new Float32Array(quadros);
      let p = o + 8;
      for (let i = 0; i < quadros; i++) {
        for (let c = 0; c < canais; c++) {
          let s;
          if (flt) s = v.getFloat32(p, true);
          else if (bits === 16) s = v.getInt16(p, true) / 32768;
          else s = ((v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getInt8(p + 2) << 16))) / 8388608;
          if (c === 0) L[i] = s;
          else if (c === 1) R[i] = s;
          p += bytes;
        }
        if (canais === 1) R[i] = L[i];
      }
      return [L, R];
    }
    o += 8 + tam + (tam % 2);
  }
  return null;
}

export async function decodificar(arrayBuffer, sr = 44100) {
  const wav = lerWav(arrayBuffer, sr);
  if (wav) return wav;
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AC) throw new Error('Este navegador não tem suporte a áudio. Use o Chrome, o Edge ou o Safari atualizados.');
  const tmp = new AC(2, 1, sr);
  let buf;
  try {
    buf = await tmp.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    throw new Error('Não consegui abrir esse arquivo de áudio. Tente MP3, WAV ou M4A.');
  }
  if (buf.sampleRate === sr && buf.numberOfChannels === 2) {
    return [buf.getChannelData(0).slice(), buf.getChannelData(1).slice()];
  }
  // reamostra e converte para estéreo
  const frames = Math.ceil(buf.duration * sr);
  const ctx = new AC(2, frames, sr);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
  const r = await ctx.startRendering();
  return [r.getChannelData(0).slice(), r.getChannelData(1).slice()];
}
