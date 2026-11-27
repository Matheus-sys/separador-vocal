// Biblioteca local (IndexedDB): guarda as músicas já separadas para abrir de novo sem processar.
// As faixas ficam em 16 bits para ocupar metade do espaço.
import { paraInt16 } from '../audio/exportar.js';

const BANCO = 'ensaio-vocal';
const LOJA = 'musicas';

function abrir() {
  return new Promise((res, rej) => {
    let req;
    try {
      req = indexedDB.open(BANCO, 1);
    } catch (e) {
      rej(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOJA)) {
        const s = db.createObjectStore(LOJA, { keyPath: 'id' });
        s.createIndex('data', 'data');
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function transacao(modo, fn) {
  return abrir().then(
    (db) =>
      new Promise((res, rej) => {
        const tx = db.transaction(LOJA, modo);
        const r = fn(tx.objectStore(LOJA));
        tx.oncomplete = () => res(r?.result ?? r);
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error || new Error('Sem espaço para guardar no navegador.'));
      }),
  );
}

export async function idDoArquivo(buf, modeloId) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return modeloId + ':' + [...new Uint8Array(h)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function guardar({ id, nome, modeloId, sr, faixas }) {
  const dados = {};
  for (const [k, [L, R]] of Object.entries(faixas)) dados[k] = [paraInt16(L).buffer, paraInt16(R).buffer];
  const n = faixas[Object.keys(faixas)[0]][0].length;
  const reg = { id, nome, modeloId, sr, duracao: n / sr, data: Date.now(), bytes: Object.keys(faixas).length * n * 4, faixas: dados };
  await transacao('readwrite', (s) => s.put(reg));
}

export async function listar() {
  try {
    const todos = await transacao('readonly', (s) => {
      const out = [];
      const req = s.openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (c) {
          const { faixas, ...meta } = c.value;
          meta.faixas = Object.keys(faixas);
          out.push(meta);
          c.continue();
        }
      };
      return out;
    });
    return todos.sort((a, b) => b.data - a.data);
  } catch {
    return [];
  }
}

export async function abrirMusica(id) {
  const reg = await transacao('readonly', (s) => s.get(id));
  if (!reg) return null;
  const faixas = {};
  for (const [k, [l, r]] of Object.entries(reg.faixas)) {
    faixas[k] = [l, r].map((b) => {
      const i16 = new Int16Array(b);
      const f = new Float32Array(i16.length);
      for (let i = 0; i < i16.length; i++) f[i] = i16[i] / 32768;
      return f;
    });
  }
  return { ...reg, faixas };
}

export async function apagar(id) {
  await transacao('readwrite', (s) => s.delete(id));
}

export async function espacoUsado() {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usado: e.usage, cota: e.quota } : null;
  } catch {
    return null;
  }
}
