// Forma de onda: picos por coluna, parte tocada mais escura, trecho A-B destacado.

export function calcularPicos(faixas, colunas) {
  colunas = Math.max(50, Math.floor(colunas));
  const nomes = Object.keys(faixas);
  const n = faixas[nomes[0]][0].length;
  const picos = new Float32Array(colunas);
  const passo = n / colunas;
  // amostra esparsa para ser rápido mesmo em música longa
  const salto = Math.max(1, Math.floor(passo / 200));
  for (let c = 0; c < colunas; c++) {
    const ini = Math.floor(c * passo), fim = Math.min(n, Math.floor((c + 1) * passo));
    let mx = 0;
    for (let i = ini; i < fim; i += salto) {
      let s = 0;
      for (const k of nomes) s += faixas[k][0][i] + faixas[k][1][i];
      const a = Math.abs(s) * 0.5;
      if (a > mx) mx = a;
    }
    picos[c] = mx;
  }
  let max = 0;
  for (const p of picos) if (p > max) max = p;
  if (max > 0) for (let i = 0; i < colunas; i++) picos[i] /= max;
  return picos;
}

export function desenharOnda(canvas, picos, { progresso, loop, duracao, cores }) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  const cor = (v) => cores.getPropertyValue(v).trim();
  const temLoop = loop.a != null && loop.b != null && loop.b > loop.a;
  if (temLoop) {
    const x0 = (loop.a / duracao) * w, x1 = (loop.b / duracao) * w;
    g.fillStyle = cor('--acento-suave');
    g.fillRect(x0, 0, x1 - x0, h);
    g.fillStyle = cor('--acento');
    g.globalAlpha = loop.ativo ? 1 : 0.4;
    g.fillRect(x0, 0, 2 * dpr, h);
    g.fillRect(x1 - 2 * dpr, 0, 2 * dpr, h);
    g.globalAlpha = 1;
  }
  const meio = h / 2;
  const xp = progresso * w;
  const larg = w / picos.length;
  const barra = Math.max(1, larg * 0.7);
  for (let i = 0; i < picos.length; i++) {
    const x = i * larg;
    const a = Math.max(1 * dpr, picos[i] * (h * 0.46));
    g.fillStyle = x < xp ? cor('--onda-tocada') : cor('--onda');
    g.fillRect(x, meio - a, barra, a * 2);
  }
  g.fillStyle = cor('--acento');
  g.fillRect(Math.max(0, xp - dpr), 0, 2 * dpr, h);
}
