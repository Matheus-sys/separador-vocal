// Tutorial animado "Ver como": deixar o Chrome/Edge usar a placa de vídeo forte (NVIDIA/AMD) no Windows.
// É um "vídeo" feito de cenas em HTML: o cursor anda até o lugar certo, clica, e a legenda explica.
// Textos conferidos no Windows 11 em português (Sistema › Tela › Elementos gráficos › Preferência de GPU).

const ehEdge = /Edg\//.test(navigator.userAgent);
const NAVEGADOR = ehEdge ? 'Microsoft Edge' : 'Google Chrome';
const CAMINHO = ehEdge
  ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const icoNav = ehEdge
  ? '<span class="tp-ico tp-ico-edge"></span>'
  : '<span class="tp-ico tp-ico-chrome"></span>';

const janela = (titulo, lateral, conteudo) => `
  <div class="tp-janela">
    <div class="tp-barra"><span>${titulo}</span><span class="tp-ctrl">— ▢ ✕</span></div>
    <div class="tp-corpo">
      <nav class="tp-lateral">${lateral}</nav>
      <div class="tp-conteudo">${conteudo}</div>
    </div>
  </div>`;

const lateral = (ativo) =>
  ['Início', 'Sistema', 'Bluetooth e dispositivos', 'Rede e Internet', 'Personalização', 'Aplicativos', 'Contas']
    .map((n) => `<div class="tp-nav ${n === ativo ? 'ativo' : ''}" ${n === 'Sistema' ? 'data-alvo="sistema"' : ''}>${n}</div>`)
    .join('');

/**
 * Cada cena: html, legenda, e uma lista de "ações" (alvo para onde o cursor vai e se clica).
 */
const CENAS = [
  {
    legenda: 'Aperte juntas as teclas <b>Windows</b> e <b>I</b>. Abre a tela de <b>Configurações</b>.',
    html: `
      <div class="tp-area">
        <div class="tp-teclado">
          <span class="tp-tecla" data-alvo="win"><svg viewBox="0 0 16 16"><path d="M1 2.3 6.6 1.5v5.4H1zM7.4 1.4 15 .3v6.6H7.4zM1 7.7h5.6v5.4L1 12.3zM7.4 7.7H15v6.6l-7.6-1.1z"/></svg> Windows</span>
          <span class="tp-mais">+</span>
          <span class="tp-tecla" data-alvo="i">I</span>
        </div>
        <p class="tp-sub">Ou clique no menu Iniciar e escreva <b>Configurações</b>.</p>
      </div>`,
    acoes: [{ alvo: 'win', teclas: true }],
  },
  {
    legenda: 'Clique em <b>Sistema</b> (à esquerda) e depois em <b>Tela</b>.',
    html: janela(
      'Configurações',
      lateral('Sistema'),
      `<h4>Sistema</h4>
       <div class="tp-item" data-alvo="tela">Tela<small>Monitores, brilho, luz noturna</small></div>
       <div class="tp-item">Som<small>Volume, saída, entrada</small></div>
       <div class="tp-item">Notificações<small>Alertas de aplicativos e do sistema</small></div>
       <div class="tp-item">Energia e bateria<small>Suspensão, uso da bateria</small></div>`,
    ),
    acoes: [{ alvo: 'sistema' }, { alvo: 'tela' }],
  },
  {
    legenda: 'Desça a página até o fim e clique em <b>Elementos gráficos</b>.',
    html: janela(
      'Configurações',
      lateral('Sistema'),
      `<h4><span class="tp-cinza">Sistema ›</span> Tela</h4>
       <div class="tp-rolar">
         <div class="tp-item">Brilho</div>
         <div class="tp-item">HDR</div>
         <div class="tp-item">Luz noturna</div>
         <div class="tp-item">Escala</div>
         <div class="tp-item">Resolução da tela</div>
         <p class="tp-secao">Configurações relacionadas</p>
         <div class="tp-item">Vídeo avançado</div>
         <div class="tp-item" data-alvo="graficos">Elementos gráficos</div>
       </div>`,
    ),
    acoes: [{ alvo: 'graficos', rolar: true }],
  },
  {
    legenda: `Procure o <b>${NAVEGADOR}</b> na lista. <b>Se não estiver lá</b>, clique em <b>Adicionar aplicativo de área de trabalho</b>, cole o caminho abaixo no campo <b>Nome</b> e aperte <b>Enter</b>.`,
    html: janela(
      'Configurações',
      lateral('Sistema'),
      `<h4><span class="tp-cinza">Sistema › Tela ›</span> Elementos gráficos</h4>
       <p class="tp-secao">Configurações personalizadas para aplicativos</p>
       <div class="tp-item tp-adicionar">Adicionar um aplicativo
         <span class="tp-botao-azul" data-alvo="adicionar">Adicionar aplicativo de área de trabalho</span></div>
       <div class="tp-item tp-app">${'<span class="tp-ico tp-ico-gen"></span>'}Câmera<small>Microsoft Corporation</small></div>
       <div class="tp-item tp-app" data-alvo="nav">${icoNav}${NAVEGADOR}<small>${CAMINHO.replace(/\\/g, '\\<wbr>')}</small></div>`,
    ),
    acoes: [{ alvo: 'adicionar' }, { alvo: 'nav' }],
    copiar: true,
  },
  {
    legenda: `Clique no <b>${NAVEGADOR}</b>. Em <b>Preferência de GPU</b>, escolha <b>Alto desempenho</b> (é a NVIDIA ou AMD).`,
    html: janela(
      'Configurações',
      lateral('Sistema'),
      `<h4><span class="tp-cinza">Sistema › Tela ›</span> Elementos gráficos</h4>
       <div class="tp-item tp-app aberto">${icoNav}${NAVEGADOR}<small>${CAMINHO.replace(/\\/g, '\\<wbr>')}</small></div>
       <div class="tp-item tp-pref">Preferência de GPU
         <span class="tp-select" data-alvo="select"><span class="tp-valor">Permitir que o Windows decida (Economia de energia)</span> ⌄</span>
       </div>
       <div class="tp-lista">
         <div class="tp-opcao">Permitir que o Windows decida (Economia de energia)</div>
         <div class="tp-opcao">Economia de energia<small>Intel(R) UHD / Iris Xe Graphics</small></div>
         <div class="tp-opcao" data-alvo="alto">Alto desempenho<small>NVIDIA GeForce RTX… / AMD Radeon…</small></div>
       </div>`,
    ),
    acoes: [{ alvo: 'select', abrir: true }, { alvo: 'alto', escolher: true }],
  },
  {
    legenda: `<b>Feche o ${NAVEGADOR} inteiro</b> (todas as janelas) e abra o Ensaio Vocal de novo. Embaixo do botão Separar deve aparecer <b>nvidia</b> ou <b>amd</b>.`,
    html: `
      <div class="tp-area tp-final">
        <div class="tp-mini-app">
          <div class="tp-mini-botao">Separar</div>
          <div class="tp-mini-placa" data-alvo="placa">Placa de vídeo em uso: <b>nvidia ampere</b> <span class="tp-ok">✓</span></div>
        </div>
        <p class="tp-sub">Pronto! Agora a separação usa a placa de vídeo forte. Só precisa fazer isso <b>uma vez</b>.</p>
      </div>`,
    acoes: [{ alvo: 'placa', sem_clique: true }],
  },
];

const DURACAO = 6500; // ms por cena (quando está tocando)
const reduzido = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function criarTutorialPlaca(dialogo) {
  const palco = dialogo.querySelector('.tp-palco');
  const legenda = dialogo.querySelector('.tp-legenda');
  const pontos = dialogo.querySelector('.tp-pontos');
  const barra = dialogo.querySelector('.tp-progresso span');
  const btnPlay = dialogo.querySelector('[data-tp=play]');
  const btnAnt = dialogo.querySelector('[data-tp=anterior]');
  const btnProx = dialogo.querySelector('[data-tp=proximo]');
  const copiar = dialogo.querySelector('.tp-copiar');
  const campoCaminho = dialogo.querySelector('.tp-caminho');
  campoCaminho.textContent = CAMINHO;

  let cena = 0, tocando = !reduzido(), timers = [], inicio = 0, raf = 0;

  pontos.innerHTML = CENAS.map((_, i) => `<button type="button" aria-label="Passo ${i + 1}"></button>`).join('');
  pontos.querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => ir(i)));

  const limpar = () => {
    timers.forEach(clearTimeout);
    timers = [];
    cancelAnimationFrame(raf);
  };
  const depois = (ms, fn) => timers.push(setTimeout(fn, reduzido() ? 0 : ms));

  function cursorPara(el, cursor) {
    const p = palco.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    cursor.style.transform = `translate(${r.left - p.left + Math.min(r.width * 0.5, 120)}px, ${r.top - p.top + r.height * 0.55}px)`;
  }

  function animar() {
    const c = CENAS[cena];
    const cursor = palco.querySelector('.tp-cursor');
    let t = 500;
    for (const a of c.acoes) {
      depois(t, () => {
        const el = palco.querySelector(`[data-alvo="${a.alvo}"]`);
        if (!el) return;
        if (a.rolar) palco.querySelector('.tp-rolar')?.classList.add('rolado');
        if (a.teclas) {
          palco.querySelectorAll('.tp-tecla').forEach((k) => k.classList.add('apertada'));
          return;
        }
        depois(a.rolar ? 700 : 0, () => {
          cursorPara(el, cursor);
          if (a.sem_clique) {
            depois(900, () => el.classList.add('destaque'));
            return;
          }
          depois(900, () => {
            el.classList.add('clicado', 'destaque');
            cursor.classList.add('clique');
            depois(350, () => cursor.classList.remove('clique'));
            if (a.abrir) palco.querySelector('.tp-lista')?.classList.add('aberta');
            if (a.escolher) {
              depois(500, () => {
                palco.querySelector('.tp-lista')?.classList.remove('aberta');
                const v = palco.querySelector('.tp-valor');
                if (v) v.textContent = 'Alto desempenho';
                palco.querySelector('.tp-select')?.classList.add('escolhido');
              });
            }
          });
        });
      });
      t += a.rolar ? 2600 : 1900;
    }
  }

  function progresso() {
    if (!tocando) return;
    const f = Math.min(1, (performance.now() - inicio) / DURACAO);
    barra.style.width = `${((cena + f) / CENAS.length) * 100}%`;
    if (f >= 1) {
      if (cena < CENAS.length - 1) ir(cena + 1);
      else pausar();
      return;
    }
    raf = requestAnimationFrame(progresso);
  }

  function ir(i) {
    limpar();
    cena = Math.max(0, Math.min(CENAS.length - 1, i));
    const c = CENAS[cena];
    palco.innerHTML = `${c.html}<svg class="tp-cursor" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 2l7 19 2.6-7.6L20 11z"/></svg>`;
    legenda.innerHTML = `<span class="tp-num">${cena + 1}/${CENAS.length}</span> ${c.legenda}`;
    copiar.hidden = !c.copiar;
    pontos.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-current', String(k === cena)));
    btnAnt.disabled = cena === 0;
    btnProx.disabled = cena === CENAS.length - 1;
    barra.style.width = `${(cena / CENAS.length) * 100}%`;
    requestAnimationFrame(() => {
      palco.querySelector('.tp-cursor').style.transform = `translate(${palco.clientWidth * 0.82}px, ${palco.clientHeight * 0.78}px)`;
      animar();
    });
    inicio = performance.now();
    if (tocando) raf = requestAnimationFrame(progresso);
  }

  function pausar() {
    tocando = false;
    cancelAnimationFrame(raf);
    btnPlay.textContent = 'Reproduzir';
    btnPlay.setAttribute('aria-label', 'Reproduzir');
  }
  function tocar() {
    tocando = true;
    btnPlay.textContent = 'Pausar';
    btnPlay.setAttribute('aria-label', 'Pausar');
    if (cena === CENAS.length - 1) ir(0);
    else {
      inicio = performance.now() - (parseFloat(barra.style.width) / 100 * CENAS.length - cena) * DURACAO;
      raf = requestAnimationFrame(progresso);
    }
  }

  btnPlay.addEventListener('click', () => (tocando ? pausar() : tocar()));
  btnAnt.addEventListener('click', () => ir(cena - 1));
  btnProx.addEventListener('click', () => ir(cena + 1));
  dialogo.querySelector('[data-tp=repetir]').addEventListener('click', () => {
    tocando = true;
    btnPlay.textContent = 'Pausar';
    ir(cena);
  });
  copiar.querySelector('button').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(CAMINHO);
      copiar.querySelector('button').textContent = 'Copiado ✓';
      setTimeout(() => (copiar.querySelector('button').textContent = 'Copiar caminho'), 2500);
    } catch {
      const sel = window.getSelection();
      const r = document.createRange();
      r.selectNodeContents(campoCaminho);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  });
  dialogo.addEventListener('close', () => {
    limpar();
    pausar();
  });

  return {
    abrir() {
      tocando = !reduzido();
      btnPlay.textContent = tocando ? 'Pausar' : 'Reproduzir';
      dialogo.showModal();
      ir(0);
    },
  };
}
