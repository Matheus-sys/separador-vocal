# Benchmark (Fase 0 e validação), 27/11/2026

Máquina: notebook Intel Core i5-1235U, Intel Iris Xe (integrada), 16 GB de RAM, Windows 11, Chrome (Playwright).

## Velocidade por pedaço (só o modelo)

| Modelo | Pedaço de áudio | WebGPU (Iris Xe) | WASM, 12 threads | Python/ORT CPU nativo |
|---|---|---|---|---|
| RoFormer Duality KARA2 student (fp16) | 11,0 s | **4,4–4,6 s** | não medido | não medido |
| MDX-Net Kim Vocal 2 | 5,9 s | 3,5–3,8 s | 12,5–14,2 s | 7,3 s |

## Música inteira, ponta a ponta no app

"Era Eu", Melk Villar: 6 min 51 s, MP3 de 16 MB, modo Alta qualidade, WebGPU:

| Versão | Tempo total (decodificar + carregar o modelo do cache + separar) |
|---|---|
| Sem paralelizar CPU/GPU | 308 s |
| STFT/iSTFT em paralelo com a GPU | **242 s** (≈ 0,59 × a duração da música) |

Na primeira vez soma o download do modelo: 242 MB do Hugging Face.

Exportação com tom −2 e 85%, MP3 192 kbps, 6 min 51 s → 8 min 4 s: 45 s. A duração saiu exata (483,8 s = 411,2 / 0,85).

## Qualidade (SDR, MUSDB18 amostras de 7 s, 4 faixas de teste)

SDR da voz (dB), voz completa (principal + backing) contra a referência:

| Faixa | Kim Vocal 2 (Python ref.) | Kim Vocal 2 (navegador) | RoFormer student (navegador) | Kim + Inst HQ3 (média) |
|---|---|---|---|---|
| Al James | 10,79 | 10,82 | 10,09 | 10,81 |
| AM Contra | 12,55 | 12,64 | 12,31 | 12,56 |
| Angels In Amplifiers | 13,50 | — | 12,83 | 13,45 |
| Arise | 11,55 | — | 11,96 | 11,71 |

Leituras:
- O pipeline em JavaScript reproduz a referência em Python (diferença de 0,03 a 0,09 dB).
- A média dos dois modelos MDX não ganha nada (menos de 0,2 dB) e dobra o tempo, por isso ficou de fora.
- Nessas amostras o RoFormer empata com o Kim Vocal 2. **Ressalva**: o Kim Vocal 2 provavelmente foi treinado
  com o MUSDB, então esse teste o favorece; as amostras também são curtas e em AAC. O RoFormer foi mantido como
  "Alta qualidade" porque separa backing vocal, é mais rápido na GPU e é o mais forte em avaliações
  públicas. **A comparação de ouvido em música real ainda está pendente.**
- A normalização de pico (0,9) não muda nada, como esperado, porque o modelo trabalha com máscaras.

Perfil de volume da música real, média em dB a cada 20 s: o backing fica perto do silêncio nas estrofes
(−56/−63 dB) e aparece nos refrões; a voz principal e o instrumental ficam estáveis. É coerente, mas não substitui ouvir.
