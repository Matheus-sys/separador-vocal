// Worker auxiliar só de processamento de sinal (STFT/iSTFT).
// Roda em paralelo com o worker que usa a placa de vídeo: enquanto o modelo processa o pedaço k,
// este prepara o k+1 e finaliza o k-1. Sem ele, os dois disputavam a mesma thread.
import { roformerEntrada, roformerSaida, mdxEntrada, mdxSaida } from './processar.js';

const specsGuardados = new Map(); // RoFormer: o espectro da mistura é usado de novo na saída

self.onmessage = (ev) => {
  const m = ev.data;
  try {
    const { modelo } = m;
    if (m.op === 'preparar') {
      if (modelo.tipo === 'roformer') {
        const { dados, specs, bins, frames } = roformerEntrada(m.pedaco, modelo.nFft, modelo.hop);
        specsGuardados.set(m.k, specs);
        self.postMessage({ id: m.id, dados, dims: [1, bins * 2, frames, 2] }, [dados.buffer]);
      } else {
        const { dados, frames } = mdxEntrada(m.pedaco, modelo.nFft, modelo.hop, modelo.dimF);
        self.postMessage({ id: m.id, dados, dims: [1, 4, modelo.dimF, frames], frames }, [dados.buffer]);
      }
    } else if (m.op === 'finalizar') {
      if (modelo.tipo === 'roformer') {
        const specs = specsGuardados.get(m.k);
        specsGuardados.delete(m.k);
        const { voz, backing } = roformerSaida(specs, m.saida, modelo.nFft, modelo.hop, m.tam);
        self.postMessage({ id: m.id, voz, backing }, [...voz, ...backing].map((a) => a.buffer));
      } else {
        const voz = mdxSaida(m.saida, modelo.nFft, modelo.hop, modelo.dimF, m.frames, m.tam, modelo.compensar);
        self.postMessage({ id: m.id, voz }, voz.map((a) => a.buffer));
      }
    }
  } catch (e) {
    self.postMessage({ id: m.id, erro: e?.message || String(e) });
  }
};
