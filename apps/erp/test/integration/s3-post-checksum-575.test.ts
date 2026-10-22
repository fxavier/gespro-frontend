/**
 * Prova (issue #575, pré-requisito do #638) — uploads directos do browser num bucket com Object
 * Lock e retenção por omissão.
 *
 * Com retenção por omissão, o S3 exige `Content-MD5` ou `x-amz-checksum-*` em TODAS as escritas.
 * A política POST do #430 não levava checksum → 400 em produção. Contrato:
 *   - `presignPut(key, { contentType, maxBytes, checksumSha256 })` (SHA-256 do ficheiro, base64,
 *     calculado no browser) devolve campos `x-amz-checksum-algorithm: SHA256` e
 *     `x-amz-checksum-sha256: <digest>`, presos na política por igualdade exacta;
 *   - o S3 verifica o digest contra os bytes recebidos: digest errado → recusado, nada gravado;
 *   - o `put()` do servidor (SDK v3, checksum automático) continua a gravar.
 *
 * MinIO efémero (Testcontainers), a mesma imagem do `s3-politica-post-minio-430`. Credenciais
 * criadas por este teste (não são segredos de ambiente nenhum).
 *
 * Limite do MinIO (RELEASE.2025-09-07, verificado ao escrever este teste): o POST Object NÃO
 * aplica a retenção por omissão do bucket nem exige checksum — um POST com a política antiga
 * devolve 204 e o objecto fica sem retenção (`GetObjectRetention` → NoSuchObjectLockConfiguration),
 * ao passo que o `put()` do SDK fica em GOVERNANCE. Por isso a recusa da política antiga (o 400 da
 * AWS) não é reproduzível aqui; o que se prova contra o MinIO é que a política nova é aceite, que
 * o checksum vai preso na política e que o servidor verifica o digest contra os bytes.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  S3Client,
  CreateBucketCommand,
  HeadObjectCommand,
  PutObjectLockConfigurationCommand,
} from '@aws-sdk/client-s3';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

const skip = process.env.SKIP_INTEGRATION === 'true';

const IMAGEM_MINIO = 'minio/minio:RELEASE.2025-09-07T16-13-09Z';
const UTILIZADOR = 'oraculo575';
const SENHA = 'oraculo575-minio-efemero';
const BUCKET = 'gespro-uploads-575';
const REGIAO = 'us-east-1';
const CT = 'application/pdf';
const MAX = 4096;

let minio: StartedTestContainer | null = null;
let endpoint = '';
let admin: S3Client;

function bytes(n: number, semente = 0): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i + semente) % 251;
  b.set([37, 80, 68, 70]); // %PDF
  return b;
}

function sha256(b: Uint8Array): string {
  return createHash('sha256').update(b).digest('base64');
}

function formulario(fields: Record<string, string>, conteudo: Uint8Array): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append('file', new Blob([conteudo as BlobPart], { type: CT }), 'doc.pdf');
  return fd;
}

async function presign(key: string, checksumSha256?: string) {
  const { criarS3Storage } = await import('@/lib/storage/objeto/s3');
  return criarS3Storage().presignPut(key, { contentType: CT, maxBytes: MAX, checksumSha256 });
}

async function enviar(url: string, fd: FormData): Promise<{ status: number; corpo: string }> {
  const res = await fetch(url, { method: 'POST', body: fd });
  return { status: res.status, corpo: await res.text() };
}

async function cabecalho(key: string) {
  try {
    return await admin.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch {
    return null;
  }
}

describe.skipIf(skip)('#575 — POST com checksum num bucket com Object Lock (MinIO efémero)', () => {
  beforeAll(async () => {
    minio = await new GenericContainer(IMAGEM_MINIO)
      .withCommand(['server', '/data'])
      .withEnvironment({ MINIO_ROOT_USER: UTILIZADOR, MINIO_ROOT_PASSWORD: SENHA })
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp('/minio/health/live', 9000))
      .start();
    endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;

    admin = new S3Client({
      region: REGIAO,
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: UTILIZADOR, secretAccessKey: SENHA },
    });
    await admin.send(new CreateBucketCommand({ Bucket: BUCKET, ObjectLockEnabledForBucket: true }));
    await admin.send(
      new PutObjectLockConfigurationCommand({
        Bucket: BUCKET,
        ObjectLockConfiguration: {
          ObjectLockEnabled: 'Enabled',
          Rule: { DefaultRetention: { Mode: 'GOVERNANCE', Days: 1 } },
        },
      }),
    );

    process.env.STORAGE_DRIVER = 's3';
    process.env.S3_BUCKET = BUCKET;
    process.env.S3_REGION = REGIAO;
    process.env.S3_ENDPOINT = endpoint;
    process.env.S3_FORCE_PATH_STYLE = 'true';
    process.env.AWS_ACCESS_KEY_ID = UTILIZADOR;
    process.env.AWS_SECRET_ACCESS_KEY = SENHA;
    delete process.env.AWS_SESSION_TOKEN;
    delete process.env.AWS_PROFILE;
  }, 120_000);

  afterAll(async () => {
    admin?.destroy();
    await minio?.stop();
  });

  it('a política nova prende o checksum por igualdade exacta', async () => {
    const digest = sha256(bytes(1024));
    const r = await presign('tenant/t575/fornecedor/f1/1-politica.pdf', digest);
    expect(r.fields?.['x-amz-checksum-algorithm']).toBe('SHA256');
    expect(r.fields?.['x-amz-checksum-sha256']).toBe(digest);
    const politica = JSON.parse(Buffer.from(r.fields!.Policy!, 'base64').toString('utf8')) as {
      conditions: unknown[];
    };
    expect(politica.conditions).toContainEqual({ 'x-amz-checksum-algorithm': 'SHA256' });
    expect(politica.conditions).toContainEqual({ 'x-amz-checksum-sha256': digest });
  });

  it('POST com o digest certo → aceite e gravado', async () => {
    const key = 'tenant/t575/fornecedor/f1/2-certo.pdf';
    const conteudo = bytes(1024);
    const r = await presign(key, sha256(conteudo));
    const { status, corpo } = await enviar(r.url, formulario(r.fields!, conteudo));
    expect(status, corpo).toBeGreaterThanOrEqual(200);
    expect(status, corpo).toBeLessThan(300);
    const h = await cabecalho(key);
    expect(h?.ContentLength).toBe(1024);
    expect(h?.ContentType).toBe(CT);
    // Retenção do objecto não se afirma aqui: o POST do MinIO ignora-a (ver cabeçalho).
  });

  it('digest errado (de outro conteúdo) → recusado e nada fica gravado', async () => {
    const key = 'tenant/t575/fornecedor/f1/3-errado.pdf';
    const r = await presign(key, sha256(bytes(1024, 7)));
    const { status, corpo } = await enviar(r.url, formulario(r.fields!, bytes(1024)));
    expect(status, `o S3 aceitou bytes que não batem com o digest: ${corpo}`).toBe(400);
    expect(await cabecalho(key)).toBeNull();
  });

  it('checksum trocado no formulário (fora da política) → recusado', async () => {
    const key = 'tenant/t575/fornecedor/f1/4-trocado.pdf';
    const assinado = bytes(1024);
    const outro = bytes(1024, 3);
    const r = await presign(key, sha256(assinado));
    const fields = { ...r.fields!, 'x-amz-checksum-sha256': sha256(outro) };
    const { status, corpo } = await enviar(r.url, formulario(fields, outro));
    expect(status, corpo).toBe(403);
    expect(await cabecalho(key)).toBeNull();
  });

  it('o put() do servidor continua a gravar no bucket com retenção', async () => {
    const key = 'tenant/t575/encerramento/e1/5-servidor.pdf';
    const { criarS3Storage } = await import('@/lib/storage/objeto/s3');
    await criarS3Storage().put(key, bytes(2048), CT);
    const h = await cabecalho(key);
    expect(h?.ContentLength).toBe(2048);
    expect(h?.ObjectLockMode).toBe('GOVERNANCE');
    expect(h?.ObjectLockRetainUntilDate?.getTime()).toBeGreaterThan(Date.now());
  });
});
