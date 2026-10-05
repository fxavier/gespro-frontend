/**
 * ORÁCULO P5-v (run exercicio-followups, issue #365, ADR-0035 §8) — `put` do lado do servidor
 * na porta de armazenamento de objetos.
 *
 * Contrato (decidido pelo orquestrador):
 *   `ObjectStorage.put(key: string, bytes: Uint8Array, contentType: string): Promise<void>`
 *   - adaptador `local`: grava em `STORAGE_LOCAL_DIR`; o objecto lê-se de volta pelo leitor
 *     local existente (`lerObjetoLocal`) e o `presignGet` aponta para a rota local; uma key
 *     fora do directório base é recusada (a mesma defesa do `caminhoSeguro`);
 *   - adaptador `s3`: um `PutObjectCommand` com Bucket/Key/Body/ContentType (cliente S3 dobrado);
 *   - `RECURSOS_DOCUMENTO` ganha `encerramento`, e a key derivada fica sob o prefixo do tenant.
 *
 * Escrito pelo autor do oráculo antes da implementação. NUNCA `vitest -u`; um agente de
 * implementação que altere este ficheiro é BLOCKER.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const original = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  class S3ClientDobrado {
    send = mocks.send;
  }
  return { ...original, S3Client: S3ClientDobrado };
});

type ComPut = { put?: (key: string, bytes: Uint8Array, contentType: string) => Promise<void> };

let dirTmp: string;

beforeAll(async () => {
  dirTmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gespro-put-'));
  process.env.STORAGE_LOCAL_DIR = dirTmp;
});

afterAll(async () => {
  await fs.rm(dirTmp, { recursive: true, force: true });
});

beforeEach(() => {
  mocks.send.mockReset();
  mocks.send.mockResolvedValue({});
});

const PDF = new TextEncoder().encode('%PDF-1.7 balanço arquivado');

describe('local — put', () => {
  it('a porta local expõe put', async () => {
    const { criarLocalStorage } = await import('../local');
    const storage = criarLocalStorage() as unknown as ComPut;
    expect(typeof storage.put, 'ObjectStorage local tem put').toBe('function');
  });

  it('put grava os bytes e o content-type; lê-se de volta e o presignGet aponta para a rota local', async () => {
    const { criarLocalStorage, lerObjetoLocal } = await import('../local');
    const storage = criarLocalStorage();
    const key = 'tenant/tenant-abc/encerramento/enc1/balanco.pdf';

    await (storage as unknown as Required<ComPut>).put(key, PDF, 'application/pdf');

    const lido = await lerObjetoLocal(key);
    expect(lido, 'objecto existe depois do put').not.toBeNull();
    expect(new Uint8Array(lido!.bytes)).toEqual(PDF);
    expect(lido!.contentType).toBe('application/pdf');
    // gravou no directório configurado
    await expect(fs.stat(path.join(dirTmp, key))).resolves.toBeTruthy();
    expect(await storage.presignGet(key, 300)).toBe(`/api/documentos/local/${key}`);
  });

  it('put substitui um objecto já existente na mesma key', async () => {
    const { criarLocalStorage, lerObjetoLocal } = await import('../local');
    const storage = criarLocalStorage() as unknown as Required<ComPut>;
    const key = 'tenant/tenant-abc/encerramento/enc1/dre.pdf';
    await storage.put(key, new TextEncoder().encode('%PDF-1 primeira'), 'application/pdf');
    await storage.put(key, new TextEncoder().encode('%PDF-1 segunda'), 'application/pdf');
    const lido = await lerObjetoLocal(key);
    expect(new TextDecoder().decode(lido!.bytes)).toBe('%PDF-1 segunda');
  });

  it('put recusa uma key fora do directório base (traversal) e não escreve nada fora', async () => {
    const { criarLocalStorage } = await import('../local');
    const storage = criarLocalStorage() as unknown as Required<ComPut>;
    expect(typeof storage.put).toBe('function');
    await expect(storage.put('../../fora-do-base.pdf', PDF, 'application/pdf')).rejects.toThrow();
    await expect(fs.stat(path.resolve(dirTmp, '../../fora-do-base.pdf'))).rejects.toThrow();
  });
});

describe('s3 — put', () => {
  it('put envia um PutObjectCommand com Bucket, Key, Body e ContentType', async () => {
    process.env.S3_BUCKET = 'bucket-oraculo';
    process.env.S3_REGION = 'af-south-1';
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { criarS3Storage } = await import('../s3');
    const storage = criarS3Storage() as unknown as ComPut;
    expect(typeof storage.put, 'ObjectStorage s3 tem put').toBe('function');

    const key = 'tenant/tenant-abc/encerramento/enc1/balancete.pdf';
    await storage.put!(key, PDF, 'application/pdf');

    expect(mocks.send).toHaveBeenCalledTimes(1);
    const comando = mocks.send.mock.calls[0]![0] as InstanceType<typeof PutObjectCommand>;
    expect(comando).toBeInstanceOf(PutObjectCommand);
    expect(comando.input.Bucket).toBe('bucket-oraculo');
    expect(comando.input.Key).toBe(key);
    expect(comando.input.ContentType).toBe('application/pdf');
    expect(new Uint8Array(comando.input.Body as Uint8Array)).toEqual(PDF);
  });

  it('um erro do S3 propaga-se (quem arquiva decide o que fazer)', async () => {
    process.env.S3_BUCKET = 'bucket-oraculo';
    process.env.S3_REGION = 'af-south-1';
    mocks.send.mockRejectedValue(new Error('S3 indisponível'));
    const { criarS3Storage } = await import('../s3');
    const storage = criarS3Storage() as unknown as ComPut;
    expect(typeof storage.put).toBe('function');
    await expect(storage.put!('tenant/t/encerramento/e/x.pdf', PDF, 'application/pdf')).rejects.toThrow();
  });
});

describe('recurso `encerramento`', () => {
  it('RECURSOS_DOCUMENTO inclui encerramento e a key fica sob o prefixo do tenant', async () => {
    const { RECURSOS_DOCUMENTO } = await import('@/lib/storage/documento-config');
    expect(RECURSOS_DOCUMENTO as readonly string[]).toContain('encerramento');
    // e a key de um encerramento fica sob o prefixo do tenant, no recurso encerramento
    const { derivarKey, prefixoTenant } = await import('../key');
    const key = derivarKey({
      tenantId: 'tenant-abc',
      recurso: 'encerramento' as Parameters<typeof derivarKey>[0]['recurso'],
      recursoId: 'enc1',
      nome: 'balanco.pdf',
    });
    expect(key.startsWith(prefixoTenant('tenant-abc'))).toBe(true);
    expect(key.startsWith('tenant/tenant-abc/encerramento/enc1/')).toBe(true);
  });
});
