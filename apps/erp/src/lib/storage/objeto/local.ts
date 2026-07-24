import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ObjectStorage } from './porta';

/**
 * Adaptador LOCAL (dev/CI, sem rede). Grava os objetos no sistema de
 * ficheiros (`STORAGE_LOCAL_DIR` ou `.next/cache/uploads`) e devolve URLs de
 * uma rota interna (`/api/documentos/local/{key}`) que faz o papel do S3.
 * Nunca usar em produção (usar `s3`).
 */

const ROTA_LOCAL = '/api/documentos/local';

function baseDir(): string {
  return process.env.STORAGE_LOCAL_DIR ?? path.join(process.cwd(), '.next', 'cache', 'uploads');
}

/**
 * Resolve o caminho absoluto de uma key garantindo que NÃO escapa do base dir
 * (defesa contra traversal, mesmo que a key chegasse manipulada).
 */
export function caminhoSeguro(key: string): string {
  const base = path.resolve(baseDir());
  const alvo = path.resolve(base, key);
  if (alvo !== base && !alvo.startsWith(base + path.sep)) {
    throw new Error('Key fora do diretório base (traversal)');
  }
  return alvo;
}

/** Grava os bytes de um objeto + sidecar de content-type. */
export async function guardarObjetoLocal(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const alvo = caminhoSeguro(key);
  await fs.mkdir(path.dirname(alvo), { recursive: true });
  await fs.writeFile(alvo, bytes);
  await fs.writeFile(`${alvo}.ct`, contentType, 'utf8');
}

export interface ObjetoLocal {
  bytes: Buffer;
  contentType: string;
}

/** Lê um objeto local; devolve `null` se não existir. */
export async function lerObjetoLocal(key: string): Promise<ObjetoLocal | null> {
  const alvo = caminhoSeguro(key);
  try {
    const bytes = await fs.readFile(alvo);
    let contentType = 'application/octet-stream';
    try {
      contentType = (await fs.readFile(`${alvo}.ct`, 'utf8')).trim() || contentType;
    } catch {
      /* sidecar opcional */
    }
    return { bytes, contentType };
  } catch {
    return null;
  }
}

export function criarLocalStorage(): ObjectStorage {
  return {
    async presignPut(key, { contentType }) {
      return {
        url: `${ROTA_LOCAL}/${key}`,
        headers: { 'Content-Type': contentType },
      };
    },

    async presignGet(key) {
      return `${ROTA_LOCAL}/${key}`;
    },

    async delete(key) {
      const alvo = caminhoSeguro(key);
      await fs.rm(alvo, { force: true });
      await fs.rm(`${alvo}.ct`, { force: true });
    },
  };
}
