/**
 * ORÁCULO (lacuna, issue #430, ADR-0017 §0 e §1) — a política de POST do driver S3 é imposta por
 * um servidor que fala MESMO a API S3 (MinIO efémero, Testcontainers; a mesma imagem do perfil
 * `full` do compose).
 *
 * Contrato (decidido pelo orquestrador):
 *   - o driver s3 lê `S3_ENDPOINT` e `S3_FORCE_PATH_STYLE` (os nomes que o `docker-compose.yml`
 *     já passa ao ERP no perfil `full`) — é o que torna o MinIO alcançável (ADR-0017 §0);
 *   - `presignPut(key, { contentType, maxBytes })` devolve `{ method: 'POST', url, fields }`;
 *     um formulário multipart com os `fields` e o ficheiro em último:
 *       · ficheiro ≤ maxBytes → aceite (2xx) e o objecto fica na key com o Content-Type;
 *       · ficheiro > maxBytes → RECUSADO pelo S3 (400 EntityTooLarge) e nada fica gravado;
 *       · `key` trocada no formulário → recusado (403) — a política prende a key exacta;
 *       · `Content-Type` trocado no formulário → recusado (403);
 *       · o tecto segue o `maxBytes` pedido (outra assinatura com tecto maior aceita mais).
 *
 * Credenciais do MinIO efémero criadas por este teste (não são segredos de ambiente nenhum).
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; um agente de
 * implementação que altere este ficheiro é BLOCKER.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  S3Client,
  CreateBucketCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

const skip = process.env.SKIP_INTEGRATION === 'true';

const IMAGEM_MINIO = 'minio/minio:RELEASE.2025-09-07T16-13-09Z';
const UTILIZADOR = 'oraculo430';
const SENHA = 'oraculo430-minio-efemero';
const BUCKET = 'gespro-uploads-430';
const REGIAO = 'us-east-1';
const CT = 'application/pdf';

type Qualquer = any;

let minio: StartedTestContainer | null = null;
let endpoint = '';
let admin: S3Client;

function bytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  b.set([37, 80, 68, 70]); // %PDF
  return b;
}

/** Monta o multipart: campos pela ordem, ficheiro em último (o S3 ignora o que vem depois). */
function formulario(fields: Record<string, string>, conteudo: Uint8Array, nome = 'doc.pdf'): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append('file', new Blob([conteudo], { type: CT }), nome);
  return fd;
}

function trocarCampo(fields: Record<string, string>, nome: string, valor: string): Record<string, string> {
  const k = Object.keys(fields).find((f) => f.toLowerCase() === nome.toLowerCase()) ?? nome;
  return { ...fields, [k]: valor };
}

async function existe(key: string): Promise<{ tamanho: number; tipo?: string } | null> {
  try {
    const h = await admin.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return { tamanho: Number(h.ContentLength), tipo: h.ContentType };
  } catch {
    return null;
  }
}

async function presign(key: string, maxBytes: number): Promise<Qualquer> {
  const { criarS3Storage } = await import('@/lib/storage/objeto/s3');
  return criarS3Storage().presignPut(key, { contentType: CT, maxBytes });
}

async function enviar(url: string, fd: FormData): Promise<{ status: number; corpo: string }> {
  const res = await fetch(url, { method: 'POST', body: fd });
  return { status: res.status, corpo: await res.text() };
}

describe.skipIf(skip)('#430 — política de POST imposta pelo S3 (MinIO efémero)', () => {
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
    await admin.send(new CreateBucketCommand({ Bucket: BUCKET }));

    // Antes do primeiro import do driver (o cliente S3 é singleton por processo).
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

  it('o driver assina um POST para o endpoint configurado (não a AWS)', async () => {
    const r = await presign('tenant/t430/fornecedor/f1/0-endpoint.pdf', 1024);
    expect(r.method, 'o driver s3 ainda assina um PUT').toBe('POST');
    expect(String(r.url).startsWith(endpoint), `URL ${r.url} não aponta para ${endpoint}`).toBe(true);
    expect(r.fields).toBeTypeOf('object');
  });

  it('ficheiro dentro do limite → aceite; o objecto fica na key com o Content-Type', async () => {
    const key = 'tenant/t430/fornecedor/f1/1-dentro.pdf';
    const r = await presign(key, 1024);
    expect(r.method).toBe('POST');
    const { status, corpo } = await enviar(r.url, formulario(r.fields, bytes(1024)));
    expect(status, corpo).toBeGreaterThanOrEqual(200);
    expect(status, corpo).toBeLessThan(300);
    expect(await existe(key)).toEqual({ tamanho: 1024, tipo: CT });
  });

  it('ficheiro acima do limite → o S3 recusa (400 EntityTooLarge) e nada fica gravado', async () => {
    const key = 'tenant/t430/fornecedor/f1/2-acima.pdf';
    const r = await presign(key, 1024);
    expect(r.method).toBe('POST');
    const { status, corpo } = await enviar(r.url, formulario(r.fields, bytes(1025)));
    expect(status, `o S3 aceitou 1025 bytes com tecto 1024: ${corpo}`).toBe(400);
    expect(corpo).toMatch(/EntityTooLarge/);
    expect(await existe(key), 'o objecto acima do limite ficou no bucket').toBeNull();
  });

  it('key trocada no formulário → recusado (a política prende a key exacta)', async () => {
    const key = 'tenant/t430/fornecedor/f1/3-assinada.pdf';
    const outra = 'tenant/t430/fornecedor/f1/3-outra.pdf';
    const r = await presign(key, 1024);
    expect(r.method).toBe('POST');
    const { status, corpo } = await enviar(
      r.url,
      formulario(trocarCampo(r.fields, 'key', outra), bytes(10)),
    );
    expect(status, corpo).toBe(403);
    expect(await existe(outra)).toBeNull();
    expect(await existe(key)).toBeNull();
  });

  it('Content-Type trocado no formulário → recusado', async () => {
    const key = 'tenant/t430/fornecedor/f1/4-tipo.pdf';
    const r = await presign(key, 1024);
    expect(r.method).toBe('POST');
    const { status, corpo } = await enviar(
      r.url,
      formulario(trocarCampo(r.fields, 'Content-Type', 'text/html'), bytes(10)),
    );
    expect(status, corpo).toBe(403);
    expect(await existe(key)).toBeNull();
  });

  it('o tecto segue o maxBytes pedido (2048 aceita 1500)', async () => {
    const key = 'tenant/t430/fornecedor/f1/5-tecto.pdf';
    const r = await presign(key, 2048);
    expect(r.method).toBe('POST');
    const { status, corpo } = await enviar(r.url, formulario(r.fields, bytes(1500)));
    expect(status, corpo).toBeGreaterThanOrEqual(200);
    expect(status, corpo).toBeLessThan(300);
    expect((await existe(key))?.tamanho).toBe(1500);
  });
});
