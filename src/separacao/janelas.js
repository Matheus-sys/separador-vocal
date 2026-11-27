// Corta a música em pedaços sobrepostos e junta de volta com transição suave (sem clique na emenda).

/** Planeja os pedaços: devolve lista de inícios (em amostras). */
export function planejarPedacos(total, tamanho, sobreposicao) {
  const passo = tamanho - sobreposicao;
  if (total <= tamanho) return [0];
  const n = Math.ceil((total - sobreposicao) / passo);
  return Array.from({ length: n }, (_, k) => k * passo);
}

/** Peso de cada amostra dentro do pedaço: rampa nas bordas internas, 1 no meio. */
export function pesoPedaco(tamanho, sobreposicao, primeiro, ultimo) {
  const w = new Float32Array(tamanho).fill(1);
  if (sobreposicao <= 0) return w;
  for (let i = 0; i < sobreposicao && i < tamanho; i++) {
    const r = (i + 0.5) / sobreposicao;
    if (!primeiro) w[i] = Math.min(w[i], r);
    if (!ultimo) w[tamanho - 1 - i] = Math.min(w[tamanho - 1 - i], r);
  }
  return w;
}

/** Copia um trecho de canal (com zeros depois do fim). */
export function recortar(canal, inicio, tamanho) {
  const out = new Float32Array(tamanho);
  const fim = Math.min(canal.length, inicio + tamanho);
  if (fim > inicio) out.set(canal.subarray(inicio, fim));
  return out;
}

/** Acumulador de saída com soma ponderada e normalização no final. */
export function criarAcumulador(total, canais) {
  const dados = Array.from({ length: canais }, () => new Float32Array(total));
  const pesos = new Float32Array(total);
  return {
    somar(inicio, pedacos, peso) {
      const fim = Math.min(total, inicio + peso.length);
      for (let c = 0; c < canais; c++) {
        const d = dados[c], p = pedacos[c];
        for (let i = inicio; i < fim; i++) d[i] += p[i - inicio] * peso[i - inicio];
      }
      for (let i = inicio; i < fim; i++) pesos[i] += peso[i - inicio];
    },
    finalizar() {
      for (let c = 0; c < canais; c++) {
        const d = dados[c];
        for (let i = 0; i < total; i++) d[i] = pesos[i] > 0 ? d[i] / pesos[i] : 0;
      }
      return dados;
    },
  };
}
