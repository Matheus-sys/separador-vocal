// Baixa o arquivo do modelo com progresso e guarda no Cache Storage do navegador.
const CACHE = 'separador-modelos-v1';

async function sha256Hex(buf) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function abrirCache() {
  try {
    return await caches.open(CACHE);
  } catch {
    return null; // navegação anônima ou cache bloqueado: baixa toda vez
  }
}

export async function modeloEmCache(arquivos, base) {
  const cache = await abrirCache();
  if (!cache) return false;
  for (const a of arquivos) {
    if (!(await cache.match(new URL(a.url, base).href))) return false;
  }
  return true;
}

/** Devolve Uint8Array do arquivo. onProgresso(bytesRecebidos) a cada bloco. */
export async function obterArquivo(arquivo, base, onProgresso) {
  const url = new URL(arquivo.url, base).href;
  const cache = await abrirCache();
  if (cache) {
    const r = await cache.match(url);
    if (r) {
      const b = new Uint8Array(await r.arrayBuffer());
      if (b.byteLength === arquivo.bytes) {
        onProgresso?.(b.byteLength);
        return b;
      }
      await cache.delete(url);
    }
  }
  const resp = await fetch(url, { mode: 'cors' });
  if (!resp.ok) throw new Error(`Falha ao baixar o modelo (${resp.status}) em ${url}`);
  const total = arquivo.bytes;
  const destino = new Uint8Array(total);
  const leitor = resp.body.getReader();
  let recebido = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    if (recebido + value.byteLength > total) throw new Error('O arquivo do modelo veio maior que o esperado.');
    destino.set(value, recebido);
    recebido += value.byteLength;
    onProgresso?.(recebido);
  }
  if (recebido !== total) throw new Error(`Download incompleto do modelo (${recebido} de ${total} bytes). Tente de novo.`);
  if (arquivo.sha256) {
    const h = await sha256Hex(destino);
    if (h !== arquivo.sha256) throw new Error('O arquivo do modelo veio corrompido (hash não confere). Tente de novo.');
  }
  if (cache) {
    try {
      await cache.put(url, new Response(destino, { headers: { 'Content-Type': 'application/octet-stream' } }));
    } catch {
      /* sem espaço: segue sem guardar */
    }
  }
  return destino;
}
