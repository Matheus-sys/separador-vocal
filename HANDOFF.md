# HANDOFF: Ensaio Vocal (separador de voz para treino de canto)

> Documento de passagem de sessão, de 27/11/2026. Serve para continuar o projeto em outro computador,
> com outra pessoa ou com outra sessão de IA, sem depender do histórico do chat.
> **Projeto pessoal do Matheus**, sem relação com a CBB Asfaltos.

---

## 1. O que é e para quem

App web para **separar a voz do instrumental** de uma música e **treinar canto**. Foi pedido pela professora de
canto do Matheus, que quer usar com os alunos. Os apps online (vocalremover.org e outros) limitavam o uso. Aqui
**não há limite**: a separação roda **no navegador de quem usa** (placa de vídeo ou processador) e a música não
é enviada para servidor nenhum.

- **No ar:** https://matheus-sys.github.io/separador-vocal/
- **Repositório:** https://github.com/Matheus-sys/separador-vocal (público, conta pessoal `Matheus-sys`)
- **Público:** professora (usa **Mac**) e alunos (Windows, Mac e, para treinar, celular).

### Funcionalidades prontas
| Área | O que faz |
|---|---|
| Separação | Escolher o arquivo só prepara; **Separar** dispara. Dois modos: **Rápido** (MDX-Net 1/9703, voz + instrumental, ~1 min por música de 4 min, qualquer navegador) e **Melhor qualidade** (RoFormer, voz principal + backing + instrumental, ~3 min, WebGPU). O antigo **Leve** (Kim Vocal 2) saiu da tela (`oculto: true`), mas segue no catálogo para abrir músicas antigas |
| Mixer | Volume de 0 a 150%, Mudo e Solo por faixa; atalhos *Só instrumental*, *Voz baixinha de guia*, *Só a voz*, *Original* |
| Tom e velocidade | Tom ±12 semitons sem mudar a velocidade; velocidade de 50% a 125% sem mudar o tom (SoundTouch) |
| Loop A-B | Arrastar na forma de onda ou botões A/B; contagem 1-2-3-4 opcional |
| Exportar | Mixagem atual (MP3/WAV, com volumes, tom e velocidade), cada faixa em MP3, **projeto .zip**. **Tudo com botão Cancelar** |
| Biblioteca | "Minhas músicas" em IndexedDB; **ajustes salvos sozinhos** por música; seleção múltipla; baixar um projeto ou um pacote; apagar selecionadas; **Limpar tudo**; **Importar projeto** |
| Projeto .zip | `projeto.json` + um MP3 por faixa (192 kbps). Leva os ajustes. Importa pelo painel ou soltando o .zip na área inicial |
| Celular | Detecta celular e tablet: o modo Alta qualidade fica desligado (o iPhone fechava a aba) e o Leve fica experimental (até 12 MB). Importar projeto funciona no celular |
| Atalhos | `espaço` toca e pausa, `←` `→` 5 s, `A` `B` marcam o trecho, `L` liga e desliga a repetição |

---

## 2. Estado no momento do handoff

| Item | Situação |
|---|---|
| Separação, mixer, tom, velocidade, loop, exportação, biblioteca | ✅ No ar e testado |
| Correção do celular (crash no iPhone) | ✅ No ar (commit `15d3e01` + `08b47c9`) |
| **Exportar e importar projeto, Limpar tudo, seleção, botão Cancelar** | ✅ No ar e testado (ver §8) |
| Refinamento visual "profissional, sem cara de IA" | ✅ No ar (27/11, especialista de front-end): visual de "estúdio de ensaio", fader vertical, régua na onda, Archivo + IBM Plex Mono. Rodapé de créditos removido (créditos ficam em `TERCEIROS.md`) |
| Nome do .zip escolhido antes de baixar | ✅ No ar (diálogo "Nome do arquivo", ex.: `pacote_aluno_matheus`) |
| Modo Rápido + fluxo "escolher → modo → Separar" + DSP em worker paralelo | ✅ No ar (27/11). Manual em PDF atualizado (`ferramentas/manual/`) |
| Teste no Safari de verdade (Mac da professora / iPhone) | ⏳ Pendente: só foi testado no WebKit do Playwright, que no Windows não tem áudio |
| Ouvir a qualidade da separação numa música real | ⏳ Pendente (amostras em `_amostras/`, que só existem na máquina original) |

---

## 3. Stack

| Camada | Tecnologia | Versão | Por quê |
|---|---|---|---|
| Build e dev | **Vite** | 5.4.10 | Dev server com COOP/COEP; empacota o worker |
| Linguagem | **JavaScript puro (ESM)** sem framework | — | Pouca tela, sem dependências pesadas; fácil de manter |
| Testes | **Vitest** | 2.1.4 | 32 testes: FFT, STFT, pedaços, tom/velocidade, WAV, projeto |
| Inferência | **onnxruntime-web** (WebGPU e WASM) | **1.31.1** | Roda os modelos no navegador |
| Tom e velocidade | **soundtouchjs** | 0.1.30 (LGPL-2.1) | Time-stretch e pitch-shift em JS |
| MP3 | **@breezystack/lamejs** | 1.2.7 (LGPL-3.0) | Codificador MP3 em JS |
| Zip | **fflate** | 0.8.2 (MIT) | Ler e gravar o projeto .zip |
| Fontes | **@fontsource-variable/archivo** + **@fontsource/ibm-plex-mono** | 5.3.0 (OFL) | Títulos (grotesca técnica com eixo de largura) e números (visor tabular). Empacotadas pelo Vite, **sem CDN**, porque o app promete que nada sai do computador |
| Isolamento no Pages | **coi-serviceworker** | 0.1.7 (MIT) | O GitHub Pages não manda COOP/COEP; necessário para o WASM com várias threads |
| Teste em navegador | **Playwright** (Chromium via MCP + WebKit via `playwright` 1.49.1) | — | Testes ponta a ponta e o motor do Safari |
| Hospedagem | **GitHub Pages**, branch `gh-pages` (deploy from branch) | — | Grátis e estático |
| Referência DSP | Python + numpy + onnxruntime | 3.11 / 2.x / 1.29 | `ferramentas/mdx_ref.py` valida o pipeline e mede SDR |

### Modelos
| Modo | Modelo | Tamanho | Origem e licença | Entrada e saída |
|---|---|---|---|---|
| Alta qualidade | **Mel-Band RoFormer Duality + KARA 2 student** (fp16) | 6 MB `.onnx` + 235 MB `.onnx.data` | Hugging Face `musetric/mel-band-roformer-duality-kara2-student-onnx`, **revisão fixada `48a5320`**, SHA-256 conferido. Apache-2.0. **Não está no repo**: é baixado do HF | `stft_repr [1, 2050, 1100, 2]` → `masks [2, 2050, 1100, 2]` (máscara 0 = voz/mistura; 1 = backing/voz) |
| Leve | **MDX-Net Kim Vocal 2** | 67 MB | Ultimate Vocal Remover. **Está no repo** em `public/modelos/` (servido pelo Pages). Sem licença declarada no arquivo | `[1, 4, 3072, 256]` (L re, L im, R re, R im), saída = espectro da voz; `compensar 1.009` |

---

## 4. Arquitetura e arquivos

```
index.html                     Página única (3 etapas: arquivo → progresso → estúdio) + painel da biblioteca
src/main.js                    Cola da tela: estados, eventos, exportar/importar, biblioteca, ajustes
src/estilo.css                 Visual (tokens em :root, tema claro/escuro por prefers-color-scheme)
src/separacao/
  worker.js                    Web Worker: baixa modelo, cria sessão ORT, pipeline em pedaços (CPU∥GPU)
  modelos.js                   Catálogo dos 2 modelos (URLs, hashes, nFft/hop/frames)
  baixar.js                    Download com progresso + Cache Storage + SHA-256
  processar.js                 Monta tensores e reconstrói faixas (RoFormer: máscaras; MDX: espectro)
  janelas.js                   Corte em pedaços com 25% de sobreposição e emenda ponderada
src/dsp/fft.js                 FFT de raiz mista (2/3/4/5/genérica), estilo kissfft; serve para 2048 e 7680
src/dsp/stft.js                STFT/iSTFT iguais ao torch.stft(center, reflect, Hann periódica)
src/audio/player.js            Player: mistura as faixas ANTES do SoundTouch (nunca dessincroniza), loop na leitura
src/audio/exportar.js          WAV, MP3 (lamejs), mistura, tom/velocidade offline, cancelamento (AbortSignal)
src/audio/decodificar.js       Decodifica para 44,1 kHz estéreo; WAV 44,1 kHz lido direto (sem Web Audio)
src/armazenamento/biblioteca.js  IndexedDB v2: armários `meta` (leve) e `musicas` (áudio Int16)
src/armazenamento/projeto.js   Formato .zip do projeto: exportar, pacote, ler, importar
src/ui/onda.js, formato.js     Forma de onda (canvas) e formatação
tests/*.test.js                Vitest
ferramentas/mdx_ref.py         Referência em numpy + SDR
ferramentas/teste-webkit.mjs   Abre o site no WebKit (perfil iPhone ou Mac) e separa um WAV
ferramentas/publicar.mjs       `npm run publicar`: testa, gera e força push do dist/ na gh-pages
vite.config.js                 Copia o motor ORT para public/ort/, condição extern-wasm, cabeçalhos COOP/COEP
BENCHMARK.md                   Medições de velocidade e SDR
TERCEIROS.md                   Licenças de terceiros
```

### Fluxo da separação
1. `decodificar()` → `[L, R]` Float32 a 44,1 kHz → transferido para o worker.
2. O worker normaliza o pico em 0,9 (não muda nada, porque o modelo trabalha com máscaras, mas fica alinhado à validação do modelo).
3. Pedaços: RoFormer 484.659 amostras (11 s, T=1100, hop 441); MDX 261.120 (5,9 s, T=256, hop 1024).
   Sobreposição de 25%, peso em rampa, normalizado pela soma dos pesos.
4. **Pipeline**: enquanto a GPU roda o pedaço k, a CPU faz a STFT do k+1 e a iSTFT do k−1. Isso reduziu o tempo de 308 s para 242 s numa música de 6:51.
5. RoFormer: voz = S·m0; backing = voz·m1; **voz principal = voz − backing**; **instrumental = mistura − voz**,
   calculados no lugar para economizar ~170 MB.
6. Resultado → tela → `bib.guardar()` (Int16) → estúdio.

### Formato do projeto (`projeto.json`, versão 1)
```json
{ "formato": "ensaio-vocal", "versao": 1, "id": "qualidade:<sha256 do arquivo, 12 bytes>",
  "nome": "...", "modeloId": "qualidade|leve", "sr": 44100, "duracao": 411.19,
  "faixas": ["voz","backing","instrumental"],
  "ajustes": { "volume": {...}, "mudo": {...}, "solo": {...}, "tom": -2, "vel": 0.85, "loop": {"a":60,"b":70,"ativo":true} },
  "atrasoMp3": 1105, "criado": 0, "exportado": 0 }
```
O pacote com vários projetos é um zip com uma pasta por projeto. O importador ignora `__MACOSX/` e `._*`.

---

## 5. Números de referência
Máquina: i5-1235U, Intel Iris Xe, 16 GB, Chrome.

| Medida | Valor |
|---|---|
| RoFormer, 1 pedaço de 11 s, WebGPU | 4,4–4,6 s |
| MDX, 1 pedaço de 5,9 s | WebGPU 3,6 s · WASM com 12 threads 13 s · WebKit com 1 thread ~30 s |
| Música de 6:51, Alta qualidade, ponta a ponta | **242 s** |
| SDR voz no MUSDB (amostras de 7 s) | 10–13 dB nos dois modelos (detalhes e ressalvas no BENCHMARK.md) |
| Exportar projeto de 6:51 com 3 faixas | 123 s, 29,6 MB |
| Importar esse projeto | 15 s |
| Exportar a mixagem com tom −2 a 85% | 45 s |

---

## 6. Armadilhas já pagas (não repetir)

1. **Produção travava em "Preparando o modelo"** e o dev funcionava. O ORT empacotado dentro do worker abre as
   threads carregando o próprio bundle. Solução: `resolve.conditions: ['onnxruntime-web-use-extern-wasm']` +
   copiar `ort-wasm-simd-threaded.asyncify.{mjs,wasm}` para `public/ort/` (plugin no `vite.config.js`) +
   `ort.env.wasm.wasmPaths`, **só em produção** (`!import.meta.env.DEV`), porque no dev o Vite não deixa importar de `public/`.
   **Sempre teste o `dist/` servido num subcaminho** (`/separador-vocal/`), nunca só o `npm run dev`.
2. **iPhone: "Um problema ocorreu repetidamente".** O iOS 26 tem WebGPU, então o modo Alta qualidade aparecia
   ligado e estourava a memória (242 MB de modelo + ~1,2 GB de GPU). No celular e no tablet ele fica desligado. Ver `ehCelular()`.
3. **Listar a biblioteca carregava o áudio de todas as músicas.** O IndexedDB v2 separou `meta` de `musicas`
   (migração automática da v1 no `onupgradeneeded`). Listar **nunca** toca em `musicas`.
4. **Safari e celular: WASM com 1 thread e sem o coi-serviceworker** (`window.coi.shouldRegister` no `index.html`).
5. **"RangeError: Out of memory" intermitente no WebKit** era a memória do próprio Windows (o Chromium segurava a
   música inteira), e não bug do app. Antes de concluir alguma coisa, repita o teste com a máquina folgada.
6. **O WebKit do Playwright no Windows NÃO tem Web Audio** (nem `AudioContext` nem `OfflineAudioContext`). Por isso
   existe o leitor próprio de WAV. Tocar áudio e decodificar MP3 no Safari **só se testa num Mac ou iPhone de verdade**.
7. **Atraso do MP3 (lamejs) de 1105 amostras** (~25 ms), igual em todas as faixas. O lamejs não grava o cabeçalho LAME,
   então o navegador não desconta. O importador desconta `atrasoMp3` (padrão 1105). Validado por correlação cruzada.
8. **SoundTouch offline**: a saída começa alinhada, mas termina com o silêncio de esvaziamento. Corte em `round(n / vel)`.
9. **Licença do Musetric**: o repositório `musetric/musetric` **não tem licença declarada**. Só se leu o código para
   entender o layout dos dados; a implementação aqui é **própria**. Os **pesos** são Apache-2.0.
10. **MUSDB favorece o Kim Vocal 2** (provavelmente foi treinado com ele): o empate de SDR ali não prova que o RoFormer é igual. Ouça música real.
11. **GitHub**: o token do `gh auth login` por código de dispositivo **não tem o escopo `workflow`**, então não dá para enviar
    `.github/workflows/`. Por isso o deploy é pela branch `gh-pages` (`npm run publicar`) e não por Actions.
12. **O Vite preserva `dist/.git`** ao limpar `dist/`. O `publicar.mjs` apaga essa pasta antes de `git init`.
13. **Bash no Windows**: heredoc com aspas ou barras invertidas complexas quebra. Para editar código grande por script, grave o script num arquivo e rode.
14. **`decodeAudioData` precisa de cópia** (`buf.slice(0)`), porque ele "consome" o ArrayBuffer.
16. **Importar .zip de terceiros**: há limites em `LIMITES` (`projeto.js`). A importação só extrai `projeto.json` e
    `voz|backing|instrumental.mp3`, confere o tamanho declarado **antes** de descompactar (64 KB para o json, 60 MB por
    MP3, 600 MB no total), aceita `sr` de 8–192 kHz e duração de no máximo 30 min. Isso protege contra "bomba de zip"
    num arquivo recebido de outra pessoa. Apontado por revisão de segurança automática em 27/11.
17. **Medir velocidade com a máquina fria.** O notebook (i5-U, Iris Xe) reduz a velocidade da placa de vídeo depois de
    horas de carga: o mesmo modelo foi de 1,0 s para 2,1 s por pedaço. Compare modos sempre nas mesmas condições
    e rode o `bench.html` antes, como referência.
18. **Processamento de sinal fica em `dsp-worker.js`.** Na mesma thread do ONNX Runtime WebGPU ele não se sobrepunha à
    placa de vídeo, porque o ORT usa o JavaScript para despachar os comandos. Se o navegador não criar o worker interno, o mesmo
    cálculo roda no worker principal (código em `obterDsp()`).
19. **Notebook com duas placas (Intel + NVIDIA).** O navegador entrega a integrada se ninguém pedir a outra: na RTX 3050
    do Matheus, 8 min de música estimavam 12 min. O worker pede `powerPreference: 'high-performance'` e passa o adaptador para
    `ort.env.webgpu.adapter`; a tela mostra "Placa de vídeo em uso". Se o Chrome no Windows ainda pegar a Intel, o jeito é
    Configurações do Windows → Sistema → Tela → Elementos gráficos → Chrome → Alto desempenho.
15. **Pasta `public/_teste/`** (MUSDB, a música de teste, zip de teste) é local e está no `.gitignore`. O `publicar.mjs` a tira do build.

---

## 7. Como rodar no seu PC

```bash
git clone https://github.com/Matheus-sys/separador-vocal.git
cd separador-vocal
npm install
npm run dev        # http://localhost:5199 (COOP/COEP já configurados)
npm test           # 32 testes
npm run build && npx vite preview --port 5198   # produção local
```
- Requisitos: **Node 22**, Git, Chrome. ffmpeg e Python só para as ferramentas de medição.
- Primeira separação em Alta qualidade: baixa 242 MB do Hugging Face, que ficam no Cache Storage do navegador.
- Para o motor do Safari: `npx playwright install webkit`, depois `node ferramentas/teste-webkit.mjs <url> saida.png iphone|mac [arquivo.wav]`.
- Arquivos de teste (MUSDB 7 s): `https://zenodo.org/records/3270814/files/MUSDB18-7-STEMS.zip`. Extraia mistura e voz com
  ffmpeg (`-map 0:0` = mistura, `-map 0:4` = voz) para `public/_teste/tN_mix.wav` e `tN_voc.wav`. A página
  `teste-qualidade.html` (local, fora do git) mede o SDR. Recrie a partir do BENCHMARK.md se precisar.

## 8. Como foi validado (padrão a manter)
- **Vitest**: FFT contra DFT exata (até n=7680); STFT ida e volta; emenda dos pedaços sem clique; tom (440→494 Hz),
  velocidade (duração); WAV; projeto (ida e volta, pacote, recusas, `__MACOSX`, cancelar).
- **Chrome (Playwright)**: música real de 6:51 de ponta a ponta; tocar, pausar, loop; velocidade medida pelo relógio
  de áudio (1,213 em 120%); exportação com duração exata (483,8 s = 411,2 / 0,85); projeto: ajustes voltam depois de
  recarregar; Cancelar em projeto, faixa e mixagem; Limpar tudo; importar pelo painel e pela área inicial; reimportar
  pergunta antes de substituir; **alinhamento por correlação cruzada** (as 3 faixas com o mesmo deslocamento).
- **Produção servida como no Pages** (`python -m http.server` num subcaminho + coi-serviceworker) e **site no ar**.
- **WebKit** perfis iPhone e Mac: aviso de celular, modo Leve separa, sem rolagem lateral.
- **Ainda não testado na tela**: o fluxo de **pacote com vários projetos** (o código do pacote tem teste unitário; o
  clique em "Baixar N projetos" não foi exercitado com 2 ou mais músicas reais).

---

## 9. Recomendações
1. **Testar no Mac da professora antes de mandar aos alunos** (Safari e Chrome): separar, tocar, exportar e importar.
2. **Ouvir** as faixas da música real e comparar os dois modos. Se o RoFormer student decepcionar, avaliar o "teacher"
   (`musetric/aname-mel-band-roformer-duality-onnx`, mais pesado e mais limpo).
3. **Exportação de projeto lenta** (123 s numa música de 6:51): mover a codificação MP3 para um Worker (hoje roda na
   thread principal com pausas). Alternativa: Opus/WebM via `MediaRecorder`/WebCodecs (mais rápido, mas o Safari é irregular).
4. **Licença do Kim Vocal 2**: se o app crescer, trocar por um modelo com licença clara ou pedir autorização.
5. **CI**: se quiser deploy automático, gerar um PAT clássico com escopo `workflow` e reativar o workflow de Pages
   (está no histórico do 1º commit, `.github/workflows/pages.yml`).
6. **Não** usar a conta `devcbbasfaltos` (é da CBB) neste repositório.

## 10. Publicar
```bash
# na máquina original as duas contas estão no gh; no seu PC basta logar a pessoal
gh auth switch --hostname github.com --user Matheus-sys   # se tiver mais de uma conta
git push origin main
npm run publicar          # testa, gera e força push do dist/ na branch gh-pages; o Pages atualiza em 1–2 min
gh auth switch --hostname github.com --user devcbbasfaltos # (só na máquina da CBB) volta para a conta da CBB
```
Conferir: `gh api repos/Matheus-sys/separador-vocal/pages/builds/latest --jq .status` → `built`.

## 11. Direção e próximos passos (em ordem)
1. ~~Refinamento visual~~ ✅ feito em 27/11. Linguagem visual atual, para manter:
   - superfícies planas com fio de 1 px, sem sombra; papel quente `#f2efe9` no claro e grafite `#141210` no escuro;
     acento coral (`#c4433b` claro, `#ef6a5f` escuro); cores das faixas: voz coral, backing âmbar, instrumental verde-azulado;
   - **Archivo** (títulos e rótulos condensados de equipamento) + **IBM Plex Mono** (toda leitura numérica) + system-ui no texto;
   - estúdio: relógio grande, onda com régua e etiquetas A/B; mixer como console (fader vertical = `range` girado
     com `transform`, Mudo/Solo de 44 px); tom e velocidade com leitura grande;
   - movimento só de 0,12 s, desligado por `prefers-reduced-motion`;
   - **não testado:** fader e `range` no Safari/WebKit real e no Firefox (`::-moz-range-progress`).
   - Capturas de referência: `_amostras/design/` (só na máquina original; fora do git).
2. **YouTube por link** (pedido 27/11): **não** pôr no site público. Exige servidor ou ajudante local com `yt-dlp`,
   o YouTube bloqueia servidores e baixar viola os termos de uso. Alternativa sugerida, se o Matheus quiser: um script
   **local, de uso pessoal**, que recebe o link, baixa o áudio e abre no Ensaio Vocal.
3. Teste real no Safari (Mac e iPhone).
4. Exportação de projeto em Worker (velocidade).
5. Talvez: compartilhar projeto por link (exigiria um servidor; hoje é só arquivo), e mostrar a letra da música.
