import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync } from 'node:fs';

// Os arquivos do motor ONNX ficam soltos em /ort/ (não empacotados): com o isolamento ativo o ONNX Runtime
// abre threads carregando o próprio script .mjs, e isso trava se ele estiver dentro do bundle do worker.
const ORT = ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'];
function copiarOrt() {
  return {
    name: 'copiar-ort',
    buildStart() {
      mkdirSync('public/ort', { recursive: true });
      for (const f of ORT) copyFileSync(`node_modules/onnxruntime-web/dist/${f}`, `public/ort/${f}`);
    },
  };
}

const isolamento = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };

export default defineConfig({
  base: './',
  plugins: [copiarOrt()],
  resolve: { conditions: ['onnxruntime-web-use-extern-wasm'] },
  worker: { format: 'es' },
  server: { headers: isolamento },
  preview: { headers: isolamento },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
});
