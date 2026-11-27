// Catálogo de modelos de separação. Os arquivos são baixados uma vez e ficam guardados no navegador.

const HF_ROFORMER =
  'https://huggingface.co/musetric/mel-band-roformer-duality-kara2-student-onnx/resolve/48a53200678a45f88e21dc1af957f1e4b55ba5ae/';

export const MODELOS = {
  qualidade: {
    id: 'qualidade',
    nome: 'Alta qualidade',
    descricao: 'Voz principal, backing vocal e instrumental. Precisa de placa de vídeo (WebGPU).',
    tipo: 'roformer',
    precisaWebGPU: true,
    faixas: ['voz', 'backing', 'instrumental'],
    nFft: 2048,
    hop: 441,
    frames: 1100,
    arquivos: [
      {
        url: HF_ROFORMER + 'duality_kara2_student_core_t1100.onnx',
        nome: 'duality_kara2_student_core_t1100.onnx',
        bytes: 6230015,
        sha256: '86a884e0225233a7d77f88e60d9a7e2febdb0d386d19ddc9476fcf51ed858228',
      },
      {
        url: HF_ROFORMER + 'duality_kara2_student_core_t1100.onnx.data',
        nome: 'duality_kara2_student_core_t1100.onnx.data',
        bytes: 235400588,
        sha256: '176673d2446d8578976dd1a17ebca5fa0651dd23446967ff44fad5bf22c45d5c',
      },
    ],
    licenca: 'Apache-2.0 — Mel-Band RoFormer Duality + KARA 2 student (musetric)',
  },
  leve: {
    id: 'leve',
    nome: 'Leve / compatível',
    descricao: 'Voz e instrumental. Funciona em qualquer computador, mas é mais lento sem placa de vídeo.',
    tipo: 'mdx',
    precisaWebGPU: false,
    faixas: ['voz', 'instrumental'],
    nFft: 7680,
    hop: 1024,
    frames: 256,
    dimF: 3072,
    compensar: 1.009,
    // as bordas do MDX são ruins só no primeiro/último nFft/2 (o UVR descarta 3840 amostras de cada lado);
    // sobreposição pequena = menos pedaços (93 → ~74 numa música de 6:51) sem perder qualidade
    sobreposicao: 16384,
    borda: 3840, // nFft / 2
    arquivos: [
      {
        url: 'modelos/Kim_Vocal_2.onnx', // servido junto com o site
        nome: 'Kim_Vocal_2.onnx',
        bytes: 66759214,
        sha256: null,
      },
    ],
    licenca: 'UVR MDX-Net Kim Vocal 2 (Ultimate Vocal Remover)',
    // Não é mais oferecido na tela (27/11/2026): com placa de vídeo o "qualidade" é mais rápido e melhor;
    // sem placa, o "rapido" é ~3x mais rápido com SDR parecido. Fica no catálogo para abrir músicas e
    // projetos antigos feitos com ele.
    oculto: true,
  },
  rapido: {
    id: 'rapido',
    nome: 'Rápido',
    descricao: 'Voz e instrumental. O mais rápido; funciona em qualquer computador.',
    tipo: 'mdx',
    precisaWebGPU: false,
    faixas: ['voz', 'instrumental'],
    nFft: 6144,
    hop: 1024,
    frames: 256,
    dimF: 2048,
    compensar: 1.03,
    sobreposicao: 16384,
    borda: 3072, // nFft / 2
    arquivos: [
      {
        url: 'modelos/UVR_MDXNET_1_9703.onnx', // servido junto com o site
        nome: 'UVR_MDXNET_1_9703.onnx',
        bytes: 29704436,
        sha256: '229ad3bb96a037e89d8ed86732d6d3675856e6a07c3e3f02896eac01ec7ee4be',
      },
    ],
    licenca: 'UVR MDX-Net 1 (9703) (Ultimate Vocal Remover)',
  },
};

/** Tamanho do pedaço de áudio (em amostras) que o modelo processa de uma vez. */
export function tamanhoPedaco(m) {
  return m.hop * (m.frames - 1);
}
