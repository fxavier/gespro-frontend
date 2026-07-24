/**
 * Adaptador `local` — round-trip do fluxo presign→PUT→download (camada de
 * storage, sem HTTP): deriva key → grava bytes → assina GET → lê de volta →
 * remove. Também valida a defesa contra path traversal.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { derivarKey } from '../key';

let dirTmp: string;

beforeAll(async () => {
  dirTmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gespro-storage-'));
  process.env.STORAGE_DRIVER = 'local';
  process.env.STORAGE_LOCAL_DIR = dirTmp;
});

afterAll(async () => {
  await fs.rm(dirTmp, { recursive: true, force: true });
});

describe('local storage — round-trip', () => {
  it('presign PUT/GET + gravação e leitura preservam bytes e content-type', async () => {
    const { criarLocalStorage, guardarObjetoLocal, lerObjetoLocal } = await import('../local');
    const storage = criarLocalStorage();

    const key = derivarKey({
      tenantId: 'tenant-abc',
      recurso: 'fornecedor',
      recursoId: 'f1',
      nome: 'Contrato Final.pdf',
    });
    expect(key.startsWith('tenant/tenant-abc/fornecedor/f1/')).toBe(true);

    // 1. presign PUT → aponta para a rota interna
    const put = await storage.presignPut(key, { contentType: 'application/pdf', maxBytes: 1000 });
    expect(put.url).toBe(`/api/documentos/local/${key}`);
    expect(put.headers['Content-Type']).toBe('application/pdf');

    // 2. "PUT" — grava os bytes (o que a rota interna faria)
    const bytes = new TextEncoder().encode('%PDF-1.7 conteudo');
    await guardarObjetoLocal(key, bytes, 'application/pdf');

    // 3. presign GET + leitura
    const getUrl = await storage.presignGet(key, 300);
    expect(getUrl).toBe(`/api/documentos/local/${key}`);
    const lido = await lerObjetoLocal(key);
    expect(lido).not.toBeNull();
    expect(new TextDecoder().decode(lido!.bytes)).toBe('%PDF-1.7 conteudo');
    expect(lido!.contentType).toBe('application/pdf');

    // 4. delete → some
    await storage.delete(key);
    expect(await lerObjetoLocal(key)).toBeNull();
  });

  it('caminhoSeguro rejeita traversal fora do base dir', async () => {
    const { caminhoSeguro } = await import('../local');
    expect(() => caminhoSeguro('../../etc/passwd')).toThrow();
    expect(() => caminhoSeguro('tenant/../../fora')).toThrow();
    // key legítima não lança
    expect(() => caminhoSeguro('tenant/t/fornecedor/f/uuid-x.pdf')).not.toThrow();
  });
});
