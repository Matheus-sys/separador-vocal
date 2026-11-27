// Decodifica qualquer formato que o navegador entende (MP3, WAV, M4A/AAC, OGG, FLAC) para 44,1 kHz estéreo.
export async function decodificar(arrayBuffer, sr = 44100) {
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
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
