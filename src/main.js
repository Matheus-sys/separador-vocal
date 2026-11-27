import { Player } from './audio/player.js';
import { decodificar } from './audio/decodificar.js';
import { wavDe, mp3De, misturar, aplicarTomVelocidade, baixarBlob } from './audio/exportar.js';
import * as bib from './armazenamento/biblioteca.js';
import { MODELOS } from './separacao/modelos.js';
import { modeloEmCache } from './separacao/baixar.js';
import { desenharOnda, calcularPicos } from './ui/onda.js';
import { formatarTempo, formatarBytes, formatarDuracao } from './ui/formato.js';

const $ = (id) => document.getElementById(id);
const player = new Player();
const ROTULOS = {
  voz: { qualidade: 'Voz principal', leve: 'Voz' },
  backing: { qualidade: 'Backing vocal' },
  instrumental: { qualidade: 'Instrumental', leve: 'Instrumental' },
};
const CORES = { voz: '--voz', backing: '--backing', instrumental: '--instrumental' };
const ORDEM = ['voz', 'backing', 'instrumental'];

const estado = {
  webgpu: false,
  worker: null,
  separando: false,
  atual: null, // { id, nome, modeloId }
  picos: null,
};

// ---------- utilidades de tela ----------
let toastTimer;
function toast(msg, erro = false, ms = 5000) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('erro', erro);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

function mostrarEtapa(nome) {
  for (const e of ['arquivo', 'progresso', 'estudio']) $('etapa-' + e).hidden = e !== nome;
}

function nomeBase(nome) {
  return nome.replace(/\.[a-z0-9]{2,5}$/i, '').trim() || 'musica';
}

// ---------- capacidade do navegador ----------
async function detectar() {
  try {
    estado.webgpu = !!(navigator.gpu && (await navigator.gpu.requestAdapter()));
  } catch {
    estado.webgpu = false;
  }
  const radioQ = document.querySelector('input[name=modo][value=qualidade]');
  const radioL = document.querySelector('input[name=modo][value=leve]');
  if (!estado.webgpu) {
    radioQ.disabled = true;
    radioL.checked = true;
    $('selo-qualidade').textContent = 'indisponível aqui';
    const aviso = $('aviso-gpu');
    aviso.hidden = false;
    aviso.textContent =
      'Este navegador não liberou a placa de vídeo (WebGPU), então o modo Alta qualidade fica desligado. ' +
      'No Mac, use o Safari atualizado ou o Chrome. No Windows, use o Chrome ou o Edge atualizados.';
  }
  for (const m of Object.values(MODELOS)) {
    if (await modeloEmCache(m.arquivos, location.href)) {
      const desc = document.querySelector(`input[name=modo][value=${m.id}]`)?.closest('.modo')?.querySelector('.modo-desc');
      if (desc) desc.textContent = desc.textContent.replace(/Baixa .* na primeira vez\./, 'Modelo já baixado.');
    }
  }
}

function modoEscolhido() {
  return document.querySelector('input[name=modo]:checked').value;
}

// ---------- separação ----------
function novoWorker() {
  estado.worker?.terminate();
  estado.worker = new Worker(new URL('./separacao/worker.js', import.meta.url), { type: 'module' });
  return estado.worker;
}

function progresso(titulo, frac, detalhe) {
  $('prog-titulo').textContent = titulo;
  const barra = $('prog-barra');
  barra.classList.toggle('indeterminada', frac == null);
  $('prog-preench').style.width = frac == null ? '' : `${Math.round(frac * 100)}%`;
  barra.setAttribute('aria-valuenow', frac == null ? '' : String(Math.round(frac * 100)));
  $('prog-detalhe').textContent = detalhe || '';
}

async function processarArquivo(arquivo) {
  if (estado.separando) return;
  const modeloId = modoEscolhido();
  const modelo = MODELOS[modeloId];
  mostrarEtapa('progresso');
  $('prog-nome').textContent = arquivo.name;
  progresso('Lendo a música…', null);
  let buf;
  try {
    buf = await arquivo.arrayBuffer();
  } catch {
    toast('Não consegui ler o arquivo.', true);
    mostrarEtapa('arquivo');
    return;
  }
  const id = await bib.idDoArquivo(buf, modeloId);
  try {
    const salva = await bib.abrirMusica(id);
    if (salva) {
      abrirNoEstudio(salva.faixas, { id, nome: salva.nome, modeloId }, salva.sr);
      toast('Essa música já estava separada. Abri da biblioteca.');
      return;
    }
  } catch {
    /* biblioteca indisponível: segue */
  }

  let canais;
  try {
    canais = await decodificar(buf);
  } catch (e) {
    toast(e.message, true);
    mostrarEtapa('arquivo');
    return;
  }
  const duracao = canais[0].length / 44100;
  estado.separando = true;
  const w = estado.worker || novoWorker();
  let t0 = 0, feitoInicial = 0;

  const resultado = await new Promise((resolve) => {
    estado.cancelar = () => {
      novoWorker();
      resolve(null);
    };
    w.onmessage = (ev) => {
      const m = ev.data;
      if (m.tipo === 'progresso') {
        if (m.etapa === 'baixando') {
          progresso(
            'Baixando o modelo (só na primeira vez)…',
            m.feito / m.total,
            `${formatarBytes(m.feito)} de ${formatarBytes(m.total)}`,
          );
        } else if (m.etapa === 'carregando') {
          progresso('Preparando o modelo…', null, 'Isso leva alguns segundos.');
        } else if (m.etapa === 'separando') {
          if (m.feito === 0 || !t0) {
            t0 = performance.now();
            feitoInicial = m.feito;
          }
          let det = `Parte ${m.feito} de ${m.total} · ${formatarDuracao(duracao)} de música`;
          if (m.feito > feitoInicial) {
            const porParte = (performance.now() - t0) / (m.feito - feitoInicial);
            const resta = (m.total - m.feito) * porParte;
            det += ` · falta ~${formatarDuracao(resta / 1000)}`;
          }
          if (m.ep === 'wasm') det += ' · sem placa de vídeo (mais lento)';
          progresso('Separando voz e instrumental…', m.feito / m.total, det);
        }
      } else if (m.tipo === 'pronto') {
        resolve(m);
      } else if (m.tipo === 'erro') {
        toast('Deu erro na separação: ' + m.mensagem, true, 10000);
        resolve(null);
      }
    };
    w.onerror = (e) => {
      toast('Deu erro na separação: ' + (e.message || 'o navegador interrompeu o processamento'), true, 10000);
      novoWorker();
      resolve(null);
    };
    w.postMessage({ tipo: 'separar', modeloId, canais, base: location.href }, canais.map((c) => c.buffer));
  });
  estado.separando = false;
  estado.cancelar = null;
  if (!resultado) {
    mostrarEtapa('arquivo');
    return;
  }
  const meta = { id, nome: nomeBase(arquivo.name), modeloId };
  abrirNoEstudio(resultado.faixas, meta, 44100);
  try {
    await bib.guardar({ ...meta, sr: 44100, faixas: resultado.faixas });
    await atualizarBiblioteca();
  } catch {
    toast('Separei, mas não deu para guardar na biblioteca (pouco espaço no navegador). Baixe as faixas se quiser manter.', true, 9000);
  }
  void modelo;
}

// ---------- estúdio ----------
function abrirNoEstudio(faixas, meta, sr) {
  const ordenadas = {};
  for (const k of ORDEM) if (faixas[k]) ordenadas[k] = faixas[k];
  estado.atual = meta;
  player.carregar(ordenadas, sr);
  $('nome-atual').textContent = meta.nome;
  $('t-total').textContent = formatarTempo(player.duracao);
  montarMixer();
  montarExportFaixas();
  atualizarLoopUI();
  estado.picos = null;
  mostrarEtapa('estudio');
  requestAnimationFrame(() => {
    estado.picos = calcularPicos(ordenadas, $('onda').clientWidth * devicePixelRatio);
    redesenhar();
  });
  document.title = `${meta.nome} · Ensaio Vocal`;
}

function rotulo(k) {
  const m = estado.atual?.modeloId || 'qualidade';
  return ROTULOS[k][m] || ROTULOS[k].qualidade;
}

function montarMixer() {
  const mixer = $('mixer');
  mixer.innerHTML = '';
  for (const k of Object.keys(player.faixas)) {
    const linha = document.createElement('div');
    linha.className = 'faixa';
    linha.dataset.faixa = k;
    const idSlider = 'vol-' + k;
    linha.innerHTML = `
      <span class="cor" style="background: var(${CORES[k]})"></span>
      <label class="nome" for="${idSlider}">${rotulo(k)}</label>
      <span class="valor"></span>
      <div class="linha">
        <input type="range" id="${idSlider}" min="0" max="150" step="1" />
        <button class="chip" data-acao="mudo" aria-pressed="false" title="Silenciar">Mudo</button>
        <button class="chip" data-acao="solo" aria-pressed="false" title="Ouvir só esta">Solo</button>
      </div>`;
    const slider = linha.querySelector('input');
    slider.value = Math.round((player.volume[k] ?? 1) * 100);
    slider.addEventListener('input', () => {
      player.volume[k] = slider.value / 100;
      atualizarMixerUI();
    });
    linha.querySelector('[data-acao=mudo]').addEventListener('click', () => {
      player.mudo[k] = !player.mudo[k];
      atualizarMixerUI();
    });
    linha.querySelector('[data-acao=solo]').addEventListener('click', () => {
      player.solo[k] = !player.solo[k];
      atualizarMixerUI();
    });
    mixer.appendChild(linha);
  }
  atualizarMixerUI();
}

function atualizarMixerUI() {
  for (const linha of $('mixer').children) {
    const k = linha.dataset.faixa;
    linha.querySelector('input').value = Math.round(player.volume[k] * 100);
    linha.querySelector('.valor').textContent = `${Math.round(player.volume[k] * 100)}%`;
    linha.querySelector('[data-acao=mudo]').setAttribute('aria-pressed', String(!!player.mudo[k]));
    linha.querySelector('[data-acao=solo]').setAttribute('aria-pressed', String(!!player.solo[k]));
    linha.classList.toggle('silenciada', player._ganhoAlvo(k) === 0);
  }
}

function aplicarPredef(p) {
  const tem = (k) => k in player.faixas;
  for (const k of Object.keys(player.faixas)) {
    player.mudo[k] = false;
    player.solo[k] = false;
  }
  const v = { voz: 1, backing: 1, instrumental: 1 };
  if (p === 'karaoke') Object.assign(v, { voz: 0, backing: tem('backing') ? 1 : 0, instrumental: 1 });
  if (p === 'guia') Object.assign(v, { voz: 0.2, backing: 1, instrumental: 1 });
  if (p === 'voz') Object.assign(v, { voz: 1, backing: 1, instrumental: 0 });
  for (const k of Object.keys(player.faixas)) player.volume[k] = v[k];
  atualizarMixerUI();
}

// ---------- onda e loop ----------
function redesenhar() {
  if (!estado.picos || $('etapa-estudio').hidden) return;
  desenharOnda($('onda'), estado.picos, {
    progresso: player.posicao / player.duracao,
    loop: player.loop,
    duracao: player.duracao,
    cores: getComputedStyle(document.documentElement),
  });
}

function laco() {
  if (player.tocando) {
    $('t-atual').textContent = formatarTempo(player.posicao);
    redesenhar();
  }
  requestAnimationFrame(laco);
}

function atualizarPlayUI() {
  const ico = $('ico-play');
  ico.innerHTML = player.tocando ? '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
  $('btn-play').setAttribute('aria-label', player.tocando ? 'Pausar' : 'Tocar');
  $('t-atual').textContent = formatarTempo(player.posicao);
  redesenhar();
}

function atualizarLoopUI() {
  const { a, b, ativo } = player.loop;
  $('v-a').textContent = a == null ? '—' : formatarTempo(a);
  $('v-b').textContent = b == null ? '—' : formatarTempo(b);
  $('btn-loop').setAttribute('aria-pressed', String(ativo));
  $('btn-loop').disabled = a == null || b == null;
  redesenhar();
}

function marcar(qual) {
  const t = player.posicao;
  player.loop[qual] = t;
  const { a, b } = player.loop;
  if (a != null && b != null && b < a) [player.loop.a, player.loop.b] = [b, a];
  if (player.loop.a != null && player.loop.b != null && player.loop.b - player.loop.a >= 0.3) player.loop.ativo = true;
  atualizarLoopUI();
}

async function alternarPlay() {
  if (player.tocando) player.pausar();
  else if ($('chk-contagem').checked) await player.contagemETocar(90, 4);
  else await player.tocar();
  atualizarPlayUI();
}

function ligarOnda() {
  const c = $('onda');
  let inicio = null, arrastou = false;
  const tempoDe = (ev) => {
    const r = c.getBoundingClientRect();
    return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * player.duracao;
  };
  c.addEventListener('pointerdown', (ev) => {
    c.setPointerCapture(ev.pointerId);
    inicio = tempoDe(ev);
    arrastou = false;
  });
  c.addEventListener('pointermove', (ev) => {
    if (inicio == null) return;
    const t = tempoDe(ev);
    if (Math.abs(t - inicio) > Math.max(0.25, player.duracao / 400)) arrastou = true;
    if (arrastou) {
      player.loop.a = Math.min(inicio, t);
      player.loop.b = Math.max(inicio, t);
      player.loop.ativo = true;
      atualizarLoopUI();
    }
  });
  c.addEventListener('pointerup', (ev) => {
    if (inicio == null) return;
    if (!arrastou) {
      player.buscar(tempoDe(ev));
    } else {
      player.buscar(player.loop.a);
    }
    inicio = null;
    atualizarPlayUI();
  });
  new ResizeObserver(() => {
    if (!player.n) return;
    estado.picos = calcularPicos(player.faixas, c.clientWidth * devicePixelRatio);
    redesenhar();
  }).observe(c);
}

// ---------- tom e velocidade ----------
function definirTom(v) {
  v = Math.max(-12, Math.min(12, v));
  $('tom').value = v;
  player.definirTom(v);
  $('v-tom').textContent = v === 0 ? 'original' : `${v > 0 ? '+' : ''}${v} ${Math.abs(v) === 1 ? 'semitom' : 'semitons'}`;
}
function definirVel(p) {
  p = Math.max(50, Math.min(125, p));
  $('vel').value = p;
  player.definirVelocidade(p / 100);
  $('v-vel').textContent = `${p}%`;
  document.querySelectorAll('[data-vel]').forEach((b) => b.classList.toggle('ativo', +b.dataset.vel === p));
}

// ---------- exportação ----------
function ganhosEfetivos() {
  const g = {};
  for (const k of Object.keys(player.faixas)) g[k] = player._ganhoAlvo(k);
  return g;
}

async function exportarMix(formato) {
  const st = $('exp-status');
  const botoes = document.querySelectorAll('.exportar button');
  botoes.forEach((b) => (b.disabled = true));
  try {
    st.textContent = 'Misturando…';
    await new Promise((r) => setTimeout(r, 30));
    let mix = misturar(player.faixas, ganhosEfetivos());
    const tom = player.tom, vel = player.vel;
    if (tom !== 0 || vel !== 1) {
      mix = await aplicarTomVelocidade(mix, tom, vel, (f) => (st.textContent = `Aplicando tom e velocidade… ${Math.round(f * 100)}%`));
    }
    let sufixo = ' - mixagem';
    if (tom) sufixo += ` (tom ${tom > 0 ? '+' : ''}${tom})`;
    if (vel !== 1) sufixo += ` (${Math.round(vel * 100)}%)`;
    const nome = estado.atual.nome + sufixo;
    if (formato === 'wav') baixarBlob(wavDe(mix, player.sr), nome + '.wav');
    else baixarBlob(await mp3De(mix, player.sr, 192, (f) => (st.textContent = `Gerando MP3… ${Math.round(f * 100)}%`)), nome + '.mp3');
    st.textContent = 'Pronto. O arquivo foi para a pasta de downloads.';
  } catch (e) {
    st.textContent = 'Não consegui gerar o arquivo: ' + e.message;
  } finally {
    botoes.forEach((b) => (b.disabled = false));
  }
}

async function exportarFaixa(k) {
  const st = $('exp-status');
  const botoes = document.querySelectorAll('.exportar button');
  botoes.forEach((b) => (b.disabled = true));
  try {
    const blob = await mp3De(player.faixas[k], player.sr, 192, (f) => (st.textContent = `Gerando MP3 de ${rotulo(k).toLowerCase()}… ${Math.round(f * 100)}%`));
    baixarBlob(blob, `${estado.atual.nome} - ${rotulo(k).toLowerCase()}.mp3`);
    st.textContent = 'Pronto. O arquivo foi para a pasta de downloads.';
  } catch (e) {
    st.textContent = 'Não consegui gerar o arquivo: ' + e.message;
  } finally {
    botoes.forEach((b) => (b.disabled = false));
  }
}

function montarExportFaixas() {
  const box = $('exp-faixas');
  box.innerHTML = '';
  for (const k of Object.keys(player.faixas)) {
    const b = document.createElement('button');
    b.className = 'btn-secundario';
    b.innerHTML = `<span class="bolinha" style="background: var(${CORES[k]})"></span> ${rotulo(k)}`;
    b.addEventListener('click', () => exportarFaixa(k));
    box.appendChild(b);
  }
}

// ---------- biblioteca ----------
async function atualizarBiblioteca() {
  const itens = await bib.listar();
  $('contador-bib').textContent = itens.length;
  const ul = $('lista-bib');
  ul.innerHTML = '';
  if (!itens.length) {
    ul.innerHTML = '<li class="vazia">Nenhuma música separada ainda.</li>';
  }
  for (const it of itens) {
    const li = document.createElement('li');
    const abrir = document.createElement('button');
    abrir.className = 'abrir';
    const strong = document.createElement('strong');
    strong.textContent = it.nome;
    const info = document.createElement('span');
    info.textContent = `${formatarTempo(it.duracao)} · ${MODELOS[it.modeloId]?.nome || it.modeloId} · ${new Date(it.data).toLocaleDateString('pt-BR')}`;
    abrir.append(strong, info);
    abrir.addEventListener('click', async () => {
      const m = await bib.abrirMusica(it.id);
      if (m) {
        abrirNoEstudio(m.faixas, { id: m.id, nome: m.nome, modeloId: m.modeloId }, m.sr);
        fecharBib();
      }
    });
    const del = document.createElement('button');
    del.className = 'btn-icone';
    del.setAttribute('aria-label', `Apagar ${it.nome}`);
    del.title = 'Apagar';
    del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z"/></svg>';
    del.addEventListener('click', async () => {
      if (!confirm(`Apagar "${it.nome}" da biblioteca?`)) return;
      await bib.apagar(it.id);
      atualizarBiblioteca();
    });
    li.append(abrir, del);
    ul.appendChild(li);
  }
  const e = await bib.espacoUsado();
  $('espaco').textContent = e ? `Espaço usado neste navegador (modelos + músicas): ${formatarBytes(e.usado)}.` : '';
}

function abrirBib() {
  $('biblioteca').hidden = false;
  $('btn-biblioteca').setAttribute('aria-expanded', 'true');
  atualizarBiblioteca();
  $('fechar-bib').focus();
}
function fecharBib() {
  $('biblioteca').hidden = true;
  $('btn-biblioteca').setAttribute('aria-expanded', 'false');
}

// ---------- ligações ----------
function ligar() {
  const input = $('arquivo');
  const soltar = $('soltar');
  input.addEventListener('change', () => {
    if (input.files[0]) processarArquivo(input.files[0]);
    input.value = '';
  });
  soltar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  ['dragenter', 'dragover'].forEach((t) =>
    soltar.addEventListener(t, (e) => {
      e.preventDefault();
      soltar.classList.add('arrastando');
    }),
  );
  ['dragleave', 'drop'].forEach((t) => soltar.addEventListener(t, () => soltar.classList.remove('arrastando')));
  soltar.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) processarArquivo(f);
  });
  // soltar em qualquer lugar da página também funciona
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files[0];
    if (f && !estado.separando && f.type.startsWith('audio')) {
      player.pausar();
      processarArquivo(f);
    }
  });

  $('btn-cancelar').addEventListener('click', () => estado.cancelar?.());
  $('btn-nova').addEventListener('click', () => {
    player.pausar();
    atualizarPlayUI();
    mostrarEtapa('arquivo');
    document.title = 'Ensaio Vocal';
  });
  $('btn-play').addEventListener('click', alternarPlay);
  $('btn-voltar').addEventListener('click', () => { player.buscar(player.posicao - 5); atualizarPlayUI(); });
  $('btn-avancar').addEventListener('click', () => { player.buscar(player.posicao + 5); atualizarPlayUI(); });
  $('btn-a').addEventListener('click', () => marcar('a'));
  $('btn-b').addEventListener('click', () => marcar('b'));
  $('btn-loop').addEventListener('click', () => {
    player.loop.ativo = !player.loop.ativo;
    atualizarLoopUI();
  });
  $('btn-limpar-loop').addEventListener('click', () => {
    player.loop = { a: null, b: null, ativo: false };
    atualizarLoopUI();
  });
  document.querySelectorAll('[data-predef]').forEach((b) => b.addEventListener('click', () => aplicarPredef(b.dataset.predef)));
  $('tom').addEventListener('input', () => definirTom(+$('tom').value));
  $('tom-menos').addEventListener('click', () => definirTom(player.tom - 1));
  $('tom-mais').addEventListener('click', () => definirTom(player.tom + 1));
  $('vel').addEventListener('input', () => definirVel(+$('vel').value));
  document.querySelectorAll('[data-vel]').forEach((b) => b.addEventListener('click', () => definirVel(+b.dataset.vel)));
  $('btn-zerar').addEventListener('click', () => { definirTom(0); definirVel(100); });
  $('exp-mix-mp3').addEventListener('click', () => exportarMix('mp3'));
  $('exp-mix-wav').addEventListener('click', () => exportarMix('wav'));
  $('btn-biblioteca').addEventListener('click', () => ($('biblioteca').hidden ? abrirBib() : fecharBib()));
  $('fechar-bib').addEventListener('click', fecharBib);

  player.aoTerminar = () => atualizarPlayUI();
  player.aoMudar = () => atualizarPlayUI();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('biblioteca').hidden) return fecharBib();
    if ($('etapa-estudio').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    const alvo = e.target;
    const emCampo = alvo instanceof HTMLInputElement && alvo.type !== 'checkbox';
    if (e.key === ' ' && !(alvo instanceof HTMLButtonElement)) {
      e.preventDefault();
      alternarPlay();
    } else if (emCampo) {
      return;
    } else if (e.key === 'ArrowLeft') {
      player.buscar(player.posicao - 5); atualizarPlayUI();
    } else if (e.key === 'ArrowRight') {
      player.buscar(player.posicao + 5); atualizarPlayUI();
    } else if (e.key === 'a' || e.key === 'A') marcar('a');
    else if (e.key === 'b' || e.key === 'B') marcar('b');
    else if (e.key === 'l' || e.key === 'L') {
      if (player.loop.a != null && player.loop.b != null) { player.loop.ativo = !player.loop.ativo; atualizarLoopUI(); }
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (estado.separando) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  ligarOnda();
}

if (import.meta.env.DEV) window.__ensaio = { player, estado, abrirNoEstudio };

ligar();
detectar();
atualizarBiblioteca();
requestAnimationFrame(laco);
