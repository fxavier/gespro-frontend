import 'server-only';

/**
 * Porta de armazenamento de objetos (S3-like). Abstrai o backend concreto
 * atrás de quatro operações: assinar upload (PUT ou POST), assinar download (GET),
 * gravar do lado do servidor (`put`) e remover. Adaptadores: `s3` (produção) e `local` (dev/CI, sem rede).
 *
 * NÃO confundir com `src/lib/storage/*-storage.ts`, que são stores de dados
 * mock (não object storage).
 */

export interface PresignPutResult {
  /**
   * Como o cliente envia: `PUT` do ficheiro cru (driver local, #418) ou `POST` multipart com
   * política (driver s3, ADR-0017 §1 — o S3 impõe `maxBytes`). Omisso = `PUT`.
   */
  method?: 'PUT' | 'POST';
  /** URL para onde o cliente envia o ficheiro. */
  url: string;
  /** Só no POST: campos assinados do formulário, a enviar por esta ordem antes do ficheiro. */
  fields?: Record<string, string>;
  /** Headers que o cliente TEM de enviar (ex.: Content-Type no PUT). */
  headers: Record<string, string>;
}

export interface ObjectStorage {
  /**
   * Assina um upload de curta duração para `key`, ligado ao `contentType`
   * (o cliente tem de enviar o mesmo Content-Type). `maxBytes` é validado
   * a montante (rota de presign) e, no driver s3, imposto pela política do POST.
   */
  presignPut(
    key: string,
    opts: { contentType: string; maxBytes: number },
  ): Promise<PresignPutResult>;

  /** Assina um GET de curta duração (segundos) para `key`. */
  presignGet(key: string, ttlSegundos: number): Promise<string>;

  /**
   * Grava `bytes` em `key` do lado do servidor (documentos gerados pelo produto, ex.: os PDF
   * arquivados no encerramento — ADR-0035 §8). Substitui um objecto já existente. Um erro do
   * backend propaga-se: quem grava decide o que fazer com ele.
   */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;

  /** Remove o objeto `key` (idempotente). */
  delete(key: string): Promise<void>;
}
