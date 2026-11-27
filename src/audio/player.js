// Player de ensaio: várias faixas tocando juntas, cada uma com volume, mais tom, velocidade e loop A-B.
// A mistura das faixas é feita antes do SoundTouch, então as faixas nunca saem de sincronia.
import { SoundTouch, SimpleFilter } from 'soundtouchjs';

const BLOCO = 4096;

export class Player {
  constructor() {
    this.ctx = null;
    this.no = null;
    this.faixas = {}; // nome -> [L, R]
    this.volume = {}; // nome -> 0..1.5
    this.mudo = {};
    this.solo = {};
    this.ganhoAtual = {}; // suavização
    this.n = 0;
    this.sr = 44100;
    this.cabeca = 0; // amostra lida da fonte
    this.tocando = false;
    this.tom = 0;
    this.vel = 1;
    this.loop = { a: null, b: null, ativo: false };
    this.aoTerminar = null;
    this.aoMudar = null;
    this._st = new SoundTouch();
    this._filtro = new SimpleFilter(this._fonte(), this._st);
    this._tmp = new Float32Array(BLOCO * 2);
    this._historico = []; // [quadrosSaida, cabeca] para estimar a posição audível
    this._saida = 0;
  }

  get duracao() {
    return this.n / this.sr;
  }

  _garantirContexto() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ sampleRate: this.sr, latencyHint: 'playback' });
    this.no = this.ctx.createScriptProcessor(BLOCO, 0, 2);
    this.no.onaudioprocess = (e) => this._processar(e);
    this.no.connect(this.ctx.destination);
  }

  carregar(faixas, sr = 44100) {
    this.pausar();
    if (this.ctx && this.ctx.sampleRate !== sr) {
      this.ctx.close();
      this.ctx = null;
    }
    this.sr = sr;
    this.faixas = faixas;
    this.n = faixas[Object.keys(faixas)[0]][0].length;
    for (const k of Object.keys(faixas)) {
      this.volume[k] ??= 1;
      this.mudo[k] = false;
      this.solo[k] = false;
      this.ganhoAtual[k] = this._ganhoAlvo(k);
    }
    this.cabeca = 0;
    this.loop = { a: null, b: null, ativo: false };
    this._limpar();
  }

  _ganhoAlvo(k) {
    const algumSolo = Object.values(this.solo).some(Boolean);
    if (this.mudo[k]) return 0;
    if (algumSolo && !this.solo[k]) return 0;
    return this.volume[k] ?? 1;
  }

  _fonte() {
    return {
      extract: (alvo, quadros) => this._lerMistura(alvo, quadros),
    };
  }

  // Lê `quadros` amostras intercaladas (L,R) a partir da cabeça, respeitando o loop.
  _lerMistura(alvo, quadros) {
    alvo.fill(0, 0, quadros * 2);
    const nomes = Object.keys(this.faixas);
    let escrito = 0;
    while (escrito < quadros) {
      let fim = this.n;
      const { a, b, ativo } = this.loop;
      const temLoop = ativo && a != null && b != null && b > a;
      if (temLoop) {
        const ia = Math.round(a * this.sr), ib = Math.round(b * this.sr);
        if (this.cabeca >= ib || this.cabeca < ia) this.cabeca = ia;
        fim = ib;
      }
      if (this.cabeca >= this.n) break;
      const q = Math.min(quadros - escrito, fim - this.cabeca);
      if (q <= 0) break;
      for (const k of nomes) {
        const alvoG = this._ganhoAlvo(k);
        const g0 = this.ganhoAtual[k] ?? alvoG;
        if (g0 === 0 && alvoG === 0) continue;
        const [L, R] = this.faixas[k];
        const passo = (alvoG - g0) / q;
        let g = g0;
        for (let i = 0; i < q; i++) {
          const j = this.cabeca + i;
          alvo[(escrito + i) * 2] += L[j] * g;
          alvo[(escrito + i) * 2 + 1] += R[j] * g;
          g += passo;
        }
        this.ganhoAtual[k] = alvoG;
      }
      this.cabeca += q;
      escrito += q;
      if (!temLoop) break;
    }
    return escrito;
  }

  _bypass() {
    return this.tom === 0 && Math.abs(this.vel - 1) < 1e-6;
  }

  _processar(e) {
    const L = e.outputBuffer.getChannelData(0);
    const R = e.outputBuffer.getChannelData(1);
    if (!this.tocando) {
      L.fill(0);
      R.fill(0);
      return;
    }
    const antes = this.cabeca;
    let q;
    if (this._bypass()) q = this._lerMistura(this._tmp, BLOCO);
    else q = this._filtro.extract(this._tmp, BLOCO);
    for (let i = 0; i < BLOCO; i++) {
      L[i] = i < q ? this._tmp[i * 2] : 0;
      R[i] = i < q ? this._tmp[i * 2 + 1] : 0;
    }
    this._saida += BLOCO;
    this._historico.push([this._saida, this.cabeca, antes]);
    if (this._historico.length > 64) this._historico.shift();
    if (q === 0 && this.cabeca >= this.n) {
      this.tocando = false;
      this.cabeca = 0;
      this._limpar();
      queueMicrotask(() => this.aoTerminar?.());
    }
  }

  _limpar() {
    this._st.clear();
    this._filtro.clear();
    this._historico = [];
  }

  /** Posição (s) aproximada do que está saindo na caixa de som. */
  get posicao() {
    if (!this.tocando || !this.ctx) return this.cabeca / this.sr;
    // atraso do buffer de áudio + o que o SoundTouch ainda guarda
    const atrasoQuadros = this._bypass() ? BLOCO : BLOCO * this.vel * 2;
    let p = this.cabeca - atrasoQuadros;
    const { a, b, ativo } = this.loop;
    if (ativo && a != null && b != null && b > a) {
      const ia = a * this.sr, ib = b * this.sr;
      if (p < ia) p = ib - (ia - p);
      if (p < ia) p = ia;
    }
    return Math.max(0, p) / this.sr;
  }

  async tocar() {
    if (!this.n) return;
    this._garantirContexto();
    if (this.ctx.state !== 'running') await this.ctx.resume();
    if (this.cabeca >= this.n) this.cabeca = 0;
    this.tocando = true;
    this.aoMudar?.();
  }

  pausar() {
    if (!this.tocando) return;
    const pos = this.posicao;
    this.tocando = false;
    this.cabeca = Math.round(pos * this.sr);
    this._limpar();
    this.aoMudar?.();
  }

  buscar(seg) {
    this.cabeca = Math.max(0, Math.min(this.n - 1, Math.round(seg * this.sr)));
    this._limpar();
    this.aoMudar?.();
  }

  definirTom(semitons) {
    this.tom = semitons;
    this._st.pitchSemitones = semitons;
    this._limpar();
  }

  definirVelocidade(v) {
    this.vel = v;
    this._st.tempo = v;
    this._limpar();
  }

  /** Toca "1, 2, 3, 4" de clique antes de começar. */
  async contagemETocar(bpm = 90, batidas = 4) {
    this._garantirContexto();
    if (this.ctx.state !== 'running') await this.ctx.resume();
    const t0 = this.ctx.currentTime + 0.1;
    const intervalo = 60 / bpm;
    for (let i = 0; i < batidas; i++) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.frequency.value = i === 0 ? 1500 : 1000;
      g.gain.setValueAtTime(0.0001, t0 + i * intervalo);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + i * intervalo + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * intervalo + 0.08);
      o.connect(g).connect(this.ctx.destination);
      o.start(t0 + i * intervalo);
      o.stop(t0 + i * intervalo + 0.1);
    }
    await new Promise((r) => setTimeout(r, (0.1 + batidas * intervalo) * 1000 - 120));
    await this.tocar();
  }
}
