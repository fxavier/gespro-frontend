import 'server-only';

/**
 * Porta de armazenamento de objetos (S3-like). Abstrai o backend concreto
 * atrás de três operações: assinar upload (PUT), assinar download (GET) e
 * remover. Adaptadores: `s3` (produção) e `local` (dev/CI, sem rede).
 *
 * NÃO confundir com `src/lib/storage/*-storage.ts`, que são stores de dados
 * mock (não object storage).
 */

export interface PresignPutResult {
  /** URL para onde o cliente faz o PUT do ficheiro. */
  url: string;
  /** Headers que o cliente TEM de enviar no PUT (ex.: Content-Type). */
  headers: Record<string, string>;
}

export interface ObjectStorage {
  /**
   * Assina um PUT de curta duração para `key`, ligado ao `contentType`
   * (o cliente tem de enviar o mesmo Content-Type). `maxBytes` é validado
   * a montante (rota de presign) e reforçado por lifecycle no bucket.
   */
  presignPut(
    key: string,
    opts: { contentType: string; maxBytes: number },
  ): Promise<PresignPutResult>;

  /** Assina um GET de curta duração (segundos) para `key`. */
  presignGet(key: string, ttlSegundos: number): Promise<string>;

  /** Remove o objeto `key` (idempotente). */
  delete(key: string): Promise<void>;
}
