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

const PASSOS_REGUA = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

function rotuloTempo(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
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
  const fonte = `500 ${10 * dpr}px "IBM Plex Mono", ui-monospace, monospace`;
  // faixa de baixo: régua de tempo; o resto é a onda
  const regua = Math.round(18 * dpr);
  const ah = h - regua;
  const meio = ah / 2;
  const temLoop = loop.a != null && loop.b != null && loop.b > loop.a && duracao > 0;
  let x0 = 0, x1 = 0;
  if (temLoop) {
    x0 = (loop.a / duracao) * w;
    x1 = (loop.b / duracao) * w;
    g.globalAlpha = loop.ativo ? 1 : 0.55;
    g.fillStyle = cor('--loop-fundo');
    g.fillRect(x0, 0, x1 - x0, ah);
    g.globalAlpha = 1;
  }

  // linha central
  g.fillStyle = cor('--onda-eixo');
  g.fillRect(0, Math.round(meio), w, Math.max(1, Math.round(dpr)));

  const xp = progresso * w;
  const larg = w / picos.length;
  const barra = Math.max(1, larg * 0.62);
  const cOnda = cor('--onda'), cTocada = cor('--onda-tocada');
  for (let i = 0; i < picos.length; i++) {
    const x = i * larg;
    const a = Math.max(1 * dpr, picos[i] * (ah * 0.44));
    g.fillStyle = x < xp ? cTocada : cOnda;
    g.fillRect(x, meio - a, barra, a * 2);
  }

  // régua de tempo
  if (duracao > 0) {
    g.fillStyle = cor('--regua-fundo');
    g.fillRect(0, ah, w, regua);
    g.fillStyle = cor('--borda');
    g.fillRect(0, ah, w, Math.max(1, Math.round(dpr)));
    const cabem = Math.max(1, Math.floor(w / (64 * dpr)));
    const passo = PASSOS_REGUA.find((p) => duracao / p <= cabem) || 1200;
    g.font = fonte;
    g.textBaseline = 'middle';
    const cTexto = cor('--texto-3');
    for (let t = 0; t <= duracao; t += passo) {
      const x = Math.round((t / duracao) * w);
      g.fillStyle = cor('--borda-forte');
      g.fillRect(x, ah, Math.max(1, Math.round(dpr)), 5 * dpr);
      if (t > 0 && x < w - 30 * dpr) {
        g.fillStyle = cTexto;
        g.fillText(rotuloTempo(t), x + 4 * dpr, ah + regua / 2 + 1 * dpr);
      }
    }
  }

  // bordas do trecho A-B com etiquetas
  if (temLoop) {
    const ac = cor('--acento');
    g.globalAlpha = loop.ativo ? 1 : 0.5;
    g.fillStyle = ac;
    g.fillRect(x0, 0, 2 * dpr, ah);
    g.fillRect(x1 - 2 * dpr, 0, 2 * dpr, ah);
    const et = 14 * dpr;
    // trecho estreito: as etiquetas vão para fora (A à esquerda, B à direita)
    const estreito = x1 - x0 < et * 2 + 2 * dpr;
    const xa = estreito ? Math.max(0, x0 - et + 2 * dpr) : x0;
    const xb = estreito ? Math.min(x1 - 2 * dpr, w - et) : x1 - et;
    g.fillRect(xa, 0, et, et);
    g.fillRect(xb, 0, et, et);
    g.fillStyle = cor('--sobre-acento');
    g.font = `600 ${10 * dpr}px "IBM Plex Mono", ui-monospace, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('A', xa + et / 2, et / 2 + 0.5 * dpr);
    g.fillText('B', xb + et / 2, et / 2 + 0.5 * dpr);
    g.textAlign = 'start';
    g.globalAlpha = 1;
  }

  // cursor de reprodução
  g.fillStyle = cor('--cursor');
  const xc = Math.max(0, Math.min(w - 2 * dpr, xp - dpr));
  g.fillRect(xc, 0, 2 * dpr, ah);
  g.beginPath();
  g.moveTo(xc - 4 * dpr, 0);
  g.lineTo(xc + 6 * dpr, 0);
  g.lineTo(xc + 1 * dpr, 6 * dpr);
  g.closePath();
  g.fill();
}
