/**
 * Issue #643 — contra a AWS real (sem `S3_ENDPOINT`) um bucket com Object Lock recusa um POST
 * sem checksum com 400 opaco. O driver s3 recusa ANTES de assinar, com `ValidationError` pt-PT
 * que o componente de upload mostra no campo. Com `S3_ENDPOINT` (MinIO) continua a assinar.
 *
 * O `S3Client` é dobrado: `credentials` conta as chamadas — assinar começa por lê-las, logo
 * zero chamadas prova que não houve assinatura. Credenciais falsas, nenhuma rede.
 */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const credenciais = vi.fn(async () => ({
  accessKeyId: 'AKIAFALSO643',
  secretAccessKey: 'segredo-falso-do-teste-643',
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    config = { credentials: credenciais };
  },
  PutObjectCommand: class {},
  GetObjectCommand: class {},
  DeleteObjectCommand: class {},
}));

const MENSAGEM =
  'O browser não conseguiu calcular o checksum do ficheiro. Abra a aplicação em HTTPS e tente de novo.';
const KEY = 'tenant/t-643/fornecedor/ckxyz0000000000000000000/1700000000000-contrato.pdf';
const OPCOES = { contentType: 'application/pdf', maxBytes: 10 * 1024 * 1024 };
const CHECKSUM = createHash('sha256').update('conteudo-643').digest('base64');

async function driver() {
  const { criarS3Storage } = await import('../s3');
  return criarS3Storage();
}

beforeEach(() => {
  vi.resetModules();
  credenciais.mockClear();
  process.env.S3_BUCKET = 'bucket-643';
  process.env.S3_REGION = 'af-south-1';
  delete process.env.S3_ENDPOINT;
  delete process.env.S3_FORCE_PATH_STYLE;
});

afterEach(() => {
  delete process.env.S3_ENDPOINT;
});

describe('#643 — driver s3 exige checksum na AWS real', () => {
  it('sem S3_ENDPOINT e sem checksum → ValidationError pt-PT, sem assinar', async () => {
    const s3 = await driver();
    // Importado depois do `resetModules`: a mesma instância de módulo que o driver vê.
    const { ValidationError } = await import('@/lib/errors');
    const erro = await s3.presignPut(KEY, OPCOES).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ValidationError);
    expect((erro as InstanceType<typeof ValidationError>).message).toBe(MENSAGEM);
    expect(credenciais).not.toHaveBeenCalled();
  });

  it('com S3_ENDPOINT (MinIO) e sem checksum → continua a assinar', async () => {
    process.env.S3_ENDPOINT = 'http://localhost:9000';
    const s3 = await driver();
    const r = await s3.presignPut(KEY, OPCOES);
    expect(r.method).toBe('POST');
    expect(r.fields?.['X-Amz-Signature']).toMatch(/^[0-9a-f]{64}$/);
    expect(credenciais).toHaveBeenCalledTimes(1);
  });

  it('sem S3_ENDPOINT e com checksum → assina com o checksum no formulário', async () => {
    const s3 = await driver();
    const r = await s3.presignPut(KEY, { ...OPCOES, checksumSha256: CHECKSUM });
    expect(r.method).toBe('POST');
    expect(r.fields?.['x-amz-checksum-sha256']).toBe(CHECKSUM);
    expect(r.fields?.['X-Amz-Signature']).toMatch(/^[0-9a-f]{64}$/);
  });
});
