# Ensaio Vocal

Separa a **voz** do **instrumental** de uma música para treinar canto, e deixa mexer no volume de cada parte,
no **tom**, na **velocidade** e repetir um **trecho**. Tudo roda **no navegador de quem usa**: a música não é
enviada para servidor nenhum e **não há limite de uso**.

**Site:** https://matheus-sys.github.io/separador-vocal/

## Como usar (para alunos)

1. Abra o link no **Chrome** ou no **Edge** (Windows) ou no **Safari atualizado** ou no **Chrome** (Mac).
2. Arraste uma música (MP3, WAV, M4A…) para a área indicada.
3. Escolher o arquivo **não** começa nada: aparece a *Música escolhida*. Escolha o modo (cada um mostra o tempo
   estimado para aquela música) e clique em **Separar**:
   - **Rápido**: voz e instrumental, em cerca de **1 minuto** para uma música de 4 minutos. Funciona em qualquer
     computador; é o modo para usar **na aula**. Na primeira vez baixa 30 MB.
   - **Melhor qualidade**: separa também o **backing vocal**, mais limpo, em cerca de **3 minutos**. Precisa de
     placa de vídeo. Na primeira vez baixa cerca de 240 MB.
4. Espere a separação. Pode usar outras abas, mas **não feche a aba do Ensaio Vocal**.
5. No estúdio:
   - **Faixas**: volume de 0 a 150%, **Mudo** e **Solo** para cada parte. Atalhos prontos: *Só instrumental*
     (karaokê), *Voz baixinha de guia*, *Só a voz*, *Original*.
   - **Tom**: sobe ou desce em semitons (±12) **sem mudar a velocidade**.
   - **Velocidade**: de 50% a 125% **sem mudar o tom**.
   - **Repetir trecho**: arraste na forma de onda para marcar o trecho, ou use os botões **A** e **B** durante
     a música. A opção *Contagem 1-2-3-4* toca quatro cliques antes de começar.
   - **Baixar**: a mixagem atual (com volumes, tom e velocidade) em MP3 ou WAV, ou cada faixa separada em MP3.
6. As músicas separadas ficam em **Minhas músicas** e abrem na hora, sem separar de novo. Os ajustes (volumes,
   tom, velocidade e trecho) ficam salvos em cada música.
7. **Levar para outro computador ou mandar para alguém**: em *Baixar → Projeto para reabrir depois (.zip)*, ou
   em *Minhas músicas*, marque uma ou várias e toque em *Baixar*. O .zip leva as faixas e os ajustes. Para abrir,
   solte o .zip no Ensaio Vocal (ou use *Importar projeto*). Também funciona no celular, para treinar.
   Dica para a professora: prepare o exercício (trecho, tom, velocidade) e mande o .zip para os alunos.
8. **Limpar**: em *Minhas músicas*, apague as selecionadas ou use *Limpar tudo*. Não dá para desfazer, então baixe o projeto antes, se quiser guardar.

Toda geração de arquivo tem um botão **Cancelar**.

Atalhos de teclado: `espaço` toca e pausa · `←` `→` voltam e avançam 5 s · `A` `B` marcam o trecho · `L` liga e desliga a repetição.

### Se algo não funcionar

| Sintoma | O que fazer |
|---|---|
| "Melhor qualidade" aparece como *indisponível aqui* | O navegador não liberou a placa de vídeo (WebGPU). Atualize o navegador ou use o modo Rápido. |
| Separação muito lenta | Use o modo Rápido. Sem placa de vídeo ele leva mais ou menos o tempo da própria música. |
| "Não deu para guardar na biblioteca" | O navegador está sem espaço. Apague músicas antigas em *Minhas músicas* ou baixe as faixas. |
| Janela anônima | Funciona, mas o modelo é baixado toda vez e a biblioteca some ao fechar. |

## Como funciona

- **Separação**: [ONNX Runtime Web](https://onnxruntime.ai) num Web Worker, com WebGPU (ou WASM multithread
  quando não há WebGPU). A música é cortada em pedaços com 25% de sobreposição e emendada com transição
  linear, sem clique na emenda. A STFT/iSTFT é feita em JavaScript (`src/dsp/`), com o mesmo resultado do `torch.stft`.
  A STFT do pedaço seguinte e a iSTFT do anterior rodam enquanto a placa de vídeo processa o atual.
- **Modelos**:
  - Alta qualidade: [Mel-Band RoFormer Duality + KARA 2 student](https://huggingface.co/musetric/mel-band-roformer-duality-kara2-student-onnx)
    (Apache-2.0), fixado na revisão `48a5320` e conferido por SHA-256. Gera de uma vez as máscaras da voz e do
    backing; voz principal = voz − backing; instrumental = mistura − voz.
  - Leve: MDX-Net **Kim Vocal 2** (Ultimate Vocal Remover), servido junto com o site.
- **Player**: as faixas são misturadas antes do [SoundTouch](https://github.com/cutterbl/SoundTouchJS) (tom e
  velocidade), então nunca saem de sincronia. O loop A-B é feito na leitura da fonte.
- **Biblioteca**: IndexedDB, com as faixas em 16 bits.
- **GitHub Pages** não permite configurar os cabeçalhos COOP/COEP, então o
  [`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker) ativa o isolamento (necessário para o WASM multithread).

## Desenvolvimento

```bash
npm install
npm run dev      # http://localhost:5199
npm test         # testes de FFT, STFT, emenda dos pedaços, tom/velocidade e mistura
npm run build    # gera dist/
npm run publicar # testa, gera e envia para a branch gh-pages (o site)
```

O modelo de alta qualidade vem do Hugging Face, e nada dele fica no repositório. O `Kim_Vocal_2.onnx` fica em
`public/modelos/`.

`ferramentas/mdx_ref.py` é a implementação de referência em numpy, usada para validar o pipeline e medir SDR.
Ver [BENCHMARK.md](BENCHMARK.md).

## Licenças

Código deste repositório: MIT. Componentes de terceiros: ver [TERCEIROS.md](TERCEIROS.md).
Use com músicas que você tem direito de usar para estudo.
