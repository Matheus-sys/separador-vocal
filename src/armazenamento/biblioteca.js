// Biblioteca local (IndexedDB): guarda as músicas já separadas para abrir de novo sem processar.
// Dois "armários": `meta` (nome, duração… leve, usado para listar) e `musicas` (o áudio, em 16 bits).
// Listar NUNCA toca no áudio: com várias músicas guardadas isso estourava a memória do celular.
import { paraInt16 } from '../audio/exportar.js';

const BANCO = 'ensaio-vocal';
const AUDIO = 'musicas';
const META = 'meta';

function abrir() {
  return new Promise((res, rej) => {
    let req;
    try {
      req = indexedDB.open(BANCO, 2);
    } catch (e) {
      rej(e);
      return;
    }
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUDIO)) db.createObjectStore(AUDIO, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: 'id' });
        // versão 1 só tinha o armário de áudio: copia os dados leves (um registro por vez)
        if (ev.oldVersion === 1) {
          const tx = req.transaction;
          const meta = tx.objectStore(META);
          const cur = tx.objectStore(AUDIO).openCursor();
          cur.onsuccess = () => {
            const c = cur.result;
            if (!c) return;
            const { faixas, ...m } = c.value;
            m.faixas = Object.keys(faixas || {});
            meta.put(m);
            c.continue();
          };
        }
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
    req.onblocked = () => rej(new Error('Feche as outras abas do Ensaio Vocal e tente de novo.'));
  });
}

function transacao(lojas, modo, fn) {
  return abrir().then(
    (db) =>
      new Promise((res, rej) => {
        const tx = db.transaction(lojas, modo);
        const r = fn(tx);
        tx.oncomplete = () => {
          db.close();
          res(r?.result ?? r);
        };
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
  const meta = { id, nome, modeloId, sr, duracao: n / sr, data: Date.now(), bytes: Object.keys(faixas).length * n * 4, faixas: Object.keys(faixas) };
  await transacao([AUDIO, META], 'readwrite', (tx) => {
    tx.objectStore(AUDIO).put({ id, faixas: dados });
    tx.objectStore(META).put(meta);
  });
}

export async function listar() {
  try {
    const todos = await transacao([META], 'readonly', (tx) => tx.objectStore(META).getAll());
    return (todos || []).sort((a, b) => b.data - a.data);
  } catch {
    return [];
  }
}

export async function abrirMusica(id) {
  const [meta, reg] = await Promise.all([
    transacao([META], 'readonly', (tx) => tx.objectStore(META).get(id)),
    transacao([AUDIO], 'readonly', (tx) => tx.objectStore(AUDIO).get(id)),
  ]);
  if (!meta || !reg) return null;
  const faixas = {};
  for (const [k, [l, r]] of Object.entries(reg.faixas)) {
    faixas[k] = [l, r].map((b) => {
      const i16 = new Int16Array(b);
      const f = new Float32Array(i16.length);
      for (let i = 0; i < i16.length; i++) f[i] = i16[i] / 32768;
      return f;
    });
  }
  return { ...meta, faixas };
}

/** Só confere se existe, sem carregar o áudio. */
export async function existe(id) {
  try {
    return !!(await transacao([META], 'readonly', (tx) => tx.objectStore(META).getKey(id)));
  } catch {
    return false;
  }
}

export async function apagar(id) {
  await transacao([AUDIO, META], 'readwrite', (tx) => {
    tx.objectStore(AUDIO).delete(id);
    tx.objectStore(META).delete(id);
  });
}

export async function espacoUsado() {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usado: e.usage, cota: e.quota } : null;
  } catch {
    return null;
  }
}
