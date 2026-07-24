import 'server-only';
import type { ObjectStorage } from './porta';
import { criarS3Storage } from './s3';
import { criarLocalStorage } from './local';

/**
 * Factory de storage de objetos, escolhido por `STORAGE_DRIVER`:
 *   - `s3`    → produção (bucket privado, presign real)
 *   - `local` → dev/CI (filesystem, sem rede) — default
 *
 * Instância memoizada por processo.
 */

export type StorageDriver = 's3' | 'local';

let instancia: ObjectStorage | null = null;

export function driverAtual(): StorageDriver {
  const d = process.env.STORAGE_DRIVER ?? 'local';
  if (d !== 's3' && d !== 'local') {
    throw new Error(`STORAGE_DRIVER inválido: "${d}" (usa "s3" ou "local")`);
  }
  return d;
}

export function getObjectStorage(): ObjectStorage {
  if (instancia) return instancia;
  instancia = driverAtual() === 's3' ? criarS3Storage() : criarLocalStorage();
  return instancia;
}

export type { ObjectStorage, PresignPutResult } from './porta';
export {
  derivarKey,
  sanitizarSegmento,
  prefixoTenant,
  keyParaUrlRef,
  urlRefParaKey,
  ESQUEMA_REF,
} from './key';
