/**
 * ORÁCULO (lacuna, issue #430, ADR-0017 §1) — `POST /api/documentos/presign` diz ao cliente
 * COMO enviar: PUT (driver local, #418) ou POST multipart com política (driver s3).
 *
 * Contrato (decidido pelo orquestrador):
 *   - envelope `{ data }` (#189) ganha `uploadMethod: 'PUT' | 'POST'` e, no POST,
 *     `uploadFields: Record<string, string>` (os campos assinados do formulário);
 *   - STORAGE_DRIVER=s3 → `uploadMethod: 'POST'`; a política em `uploadFields.Policy` traz
 *     `content-length-range` com o tecto do servidor (`MAX_DOCUMENTO_BYTES`, 10 MB) — o limite deixa
 *     de depender só do Zod e do cliente — e prende a `key` devolvida em `data.key`;
 *     `requiredHeaders` não leva `Content-Type` (o multipart põe o seu);
 *   - STORAGE_DRIVER=local → `uploadMethod: 'PUT'`, `requiredHeaders['Content-Type']` como hoje.
 *
 * Credenciais FALSAS só deste teste (não são segredos). Assinar não fala com a rede.
 *
 * #643: sem `S3_ENDPOINT` o destino é a AWS real, que num bucket com Object Lock exige checksum —
 * o driver passa a recusar um presign sem ele. O pedido leva por isso o `checksumSha256` que o
 * cliente real (`pedido-upload.ts`) envia: SHA-256 em base64 de um ficheiro fixo.
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; um agente de
 * implementação que altere este ficheiro é BLOCKER.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  mocks.auth.mockReset();
  mocks.auth.mockResolvedValue({
    user: { id: 'u-430', tenantId: 'tenant-abc', permissions: ['fornecedores:editar'] },
  });
});

afterEach(() => {
  process.env = { ...ENV_ORIGINAL };
});

/** SHA-256 em base64 (32 bytes → 44 caracteres) de um ficheiro fixo, como o browser o calcula. */
const CHECKSUM = createHash('sha256').update(Buffer.from('ficheiro-do-oraculo-430')).digest('base64');

function pedido(): NextRequest {
  return new NextRequest('http://localhost:3000/api/documentos/presign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      recurso: 'fornecedor',
      recursoId: 'ckxyz0000000000000000000',
      nome: 'contrato.pdf',
      contentType: 'application/pdf',
      tamanho: 2048,
      checksumSha256: CHECKSUM,
    }),
  });
}

function campo(fields: Record<string, string> | undefined, nome: string): string | undefined {
  if (!fields) return undefined;
  const k = Object.keys(fields).find((f) => f.toLowerCase() === nome.toLowerCase());
  return k === undefined ? undefined : fields[k];
}

describe('#430 — presign com STORAGE_DRIVER=s3 devolve um POST com política', () => {
  beforeEach(() => {
    process.env.STORAGE_DRIVER = 's3';
    process.env.S3_BUCKET = 'bucket-oraculo-430';
    process.env.S3_REGION = 'af-south-1';
    process.env.AWS_ACCESS_KEY_ID = 'AKIAORACULO430TESTE';
    process.env.AWS_SECRET_ACCESS_KEY = 'segredo-falso-do-oraculo-430-nao-e-credencial';
    delete process.env.AWS_SESSION_TOKEN;
    delete process.env.AWS_PROFILE;
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_FORCE_PATH_STYLE;
  });

  it('uploadMethod POST + uploadFields com a política de 10 MB presa à key devolvida', async () => {
    const { POST } = await import('@/app/api/documentos/presign/route');
    const { MAX_DOCUMENTO_BYTES } = await import('@/lib/storage/documento-config');
    const res = await POST(pedido());
    expect(res.status).toBe(200);
    const { data } = await res.json();

    expect(data.uploadMethod, 'o presign não diz ao cliente que o envio é POST').toBe('POST');
    expect(data.uploadUrl).toBeTypeOf('string');
    expect(data.uploadFields, 'faltam os campos assinados do formulário').toBeTypeOf('object');
    expect(data.key.startsWith('tenant/tenant-abc/fornecedor/ckxyz0000000000000000000/')).toBe(true);
    expect(data.urlRef).toBe(`gestpro-storage:${data.key}`);
    expect(campo(data.uploadFields, 'key')).toBe(data.key);
    expect(campo(data.uploadFields, 'Content-Type')).toBe('application/pdf');

    const politica = JSON.parse(
      Buffer.from(campo(data.uploadFields, 'Policy')!, 'base64').toString('utf8'),
    ) as { conditions: unknown[] };
    const intervalo = politica.conditions.find(
      (c) => Array.isArray(c) && String(c[0]).toLowerCase() === 'content-length-range',
    ) as [string, number, number] | undefined;
    expect(intervalo, 'a política emitida pela rota não limita o tamanho').toBeDefined();
    expect(Number(intervalo![2])).toBe(MAX_DOCUMENTO_BYTES);
    expect(MAX_DOCUMENTO_BYTES).toBe(10 * 1024 * 1024);

    // O checksum do pedido segue para o formulário e fica preso na política (#575/#643).
    expect(campo(data.uploadFields, 'x-amz-checksum-algorithm')).toBe('SHA256');
    expect(campo(data.uploadFields, 'x-amz-checksum-sha256')).toBe(CHECKSUM);
    expect(politica.conditions).toContainEqual({ 'x-amz-checksum-algorithm': 'SHA256' });
    expect(politica.conditions).toContainEqual({ 'x-amz-checksum-sha256': CHECKSUM });

    const headers = (data.requiredHeaders ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('content-type');
  });
});

describe('#430 — presign com STORAGE_DRIVER=local continua PUT', () => {
  beforeEach(() => {
    process.env.STORAGE_DRIVER = 'local';
  });

  it('uploadMethod PUT, URL da rota local e Content-Type nos headers obrigatórios', async () => {
    const { POST } = await import('@/app/api/documentos/presign/route');
    const res = await POST(pedido());
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.uploadMethod, 'o presign local não declara o método PUT').toBe('PUT');
    expect(data.uploadUrl).toBe(`/api/documentos/local/${data.key}`);
    expect(data.requiredHeaders['Content-Type']).toBe('application/pdf');
    expect(data.uploadFields === undefined || Object.keys(data.uploadFields).length === 0).toBe(true);
  });
});
