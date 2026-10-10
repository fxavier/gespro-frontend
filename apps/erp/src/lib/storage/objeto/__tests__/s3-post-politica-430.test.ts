/**
 * ORÁCULO (lacuna, issue #430, ADR-0017 §1) — o driver S3 impõe o tamanho máximo na própria
 * assinatura, por POST com política (`content-length-range`).
 *
 * Contrato (decidido pelo orquestrador — não se reabre):
 *   - `criarS3Storage().presignPut(key, { contentType, maxBytes })` deixa de assinar um PUT por
 *     query-string (que não suporta condição de tamanho) e devolve uma assinatura de POST:
 *       `{ method: 'POST', url, fields, headers }` — `fields` são os campos do formulário
 *       multipart (inclui `key`, `Content-Type`, `Policy`, `X-Amz-Algorithm`, `X-Amz-Credential`,
 *       `X-Amz-Date`, `X-Amz-Signature`; os nomes de campo do S3 são case-insensitive);
 *     `headers` não leva `Content-Type` (num POST multipart o browser põe o boundary).
 *   - A política (base64 em `Policy`) declara:
 *       · `["content-length-range", 0|1, maxBytes]` — o `maxBytes` RECEBIDO, não uma constante;
 *       · a key EXACTA (opção conservadora: `{ key }` ou `["eq", "$key", key]`; um `starts-with`
 *         deixaria o portador da assinatura escrever noutra key do prefixo);
 *       · o Content-Type exacto;
 *       · o bucket;
 *       · uma validade curta (expira no futuro, a menos de 10 minutos).
 *   - A política vai ASSINADA (SigV4 de POST: HMAC do `Policy` com a chave derivada do segredo,
 *     data, região e serviço `s3`) — uma política decorativa não impõe nada.
 *   - O driver local (PUT para `/api/documentos/local/{key}`, #418) fica igual.
 *
 * Credenciais FALSAS só deste teste (não são segredos). Nenhuma rede: assinar não fala com o S3.
 * A prova contra um servidor S3 real (MinIO) está em
 * `test/integration/s3-politica-post-minio-430.test.ts`.
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; um agente de
 * implementação que altere este ficheiro é BLOCKER.
 */
import { createHmac } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

const AKID = 'AKIAORACULO430TESTE';
const SEGREDO = 'segredo-falso-do-oraculo-430-nao-e-credencial';
const REGIAO = 'af-south-1';
const BUCKET = 'bucket-oraculo-430';

beforeAll(() => {
  process.env.S3_BUCKET = BUCKET;
  process.env.S3_REGION = REGIAO;
  process.env.AWS_ACCESS_KEY_ID = AKID;
  process.env.AWS_SECRET_ACCESS_KEY = SEGREDO;
  delete process.env.AWS_SESSION_TOKEN;
  delete process.env.AWS_PROFILE;
  delete process.env.S3_ENDPOINT;
  delete process.env.S3_FORCE_PATH_STYLE;
});

type Qualquer = any;

/** Lê um campo do formulário ignorando maiúsculas (o S3 trata os nomes assim). */
function campo(fields: Record<string, string> | undefined, nome: string): string | undefined {
  if (!fields) return undefined;
  const k = Object.keys(fields).find((f) => f.toLowerCase() === nome.toLowerCase());
  return k === undefined ? undefined : fields[k];
}

interface Politica {
  expiration: string;
  conditions: Array<Record<string, string> | [string, ...unknown[]]>;
}

function decodificarPolitica(fields: Record<string, string>): Politica {
  const b64 = campo(fields, 'Policy');
  expect(b64, 'falta o campo Policy no formulário assinado').toBeTypeOf('string');
  return JSON.parse(Buffer.from(b64!, 'base64').toString('utf8')) as Politica;
}

/** Valor de uma condição de igualdade (`{ nome: v }` ou `["eq", "$nome", v]`), case-insensitive. */
function condicaoIgual(p: Politica, nome: string): string[] {
  const alvo = nome.toLowerCase();
  const valores: string[] = [];
  for (const c of p.conditions) {
    if (Array.isArray(c)) {
      if (String(c[0]).toLowerCase() === 'eq' && String(c[1]).toLowerCase() === `$${alvo}`) {
        valores.push(String(c[2]));
      }
    } else {
      for (const [k, v] of Object.entries(c)) if (k.toLowerCase() === alvo) valores.push(String(v));
    }
  }
  return valores;
}

function startsWith(p: Politica, nome: string): unknown[] {
  return p.conditions.filter(
    (c) =>
      Array.isArray(c) &&
      String(c[0]).toLowerCase() === 'starts-with' &&
      String(c[1]).toLowerCase() === `$${nome.toLowerCase()}`,
  );
}

function intervaloTamanho(p: Politica): [number, number] | undefined {
  const c = p.conditions.find(
    (x) => Array.isArray(x) && String(x[0]).toLowerCase() === 'content-length-range',
  ) as [string, number, number] | undefined;
  return c ? [Number(c[1]), Number(c[2])] : undefined;
}

function hmac(chave: Buffer | string, dados: string): Buffer {
  return createHmac('sha256', chave).update(dados, 'utf8').digest();
}

const KEY = 'tenant/tenant-abc/fornecedor/ckxyz0000000000000000000/1700000000000-contrato.pdf';
const CT = 'application/pdf';
const DEZ_MB = 10 * 1024 * 1024;

async function assinar(maxBytes = DEZ_MB, key = KEY, contentType = CT): Promise<Qualquer> {
  const { criarS3Storage } = await import('../s3');
  return criarS3Storage().presignPut(key, { contentType, maxBytes });
}

describe('#430 — s3: presignPut assina um POST com política', () => {
  it('devolve method POST, url do bucket e os campos do formulário (não um PUT por query-string)', async () => {
    const r = await assinar();
    expect(r.method, 'o driver s3 ainda assina um PUT (sem condição de tamanho)').toBe('POST');
    expect(r.url).toBeTypeOf('string');
    expect(r.url).toContain(BUCKET);
    // A assinatura vai nos campos do formulário, não na query-string do URL.
    expect(r.url).not.toMatch(/X-Amz-Signature=/i);
    expect(r.fields, 'faltam os campos do formulário POST').toBeTypeOf('object');
    expect(campo(r.fields, 'key')).toBe(KEY);
    expect(campo(r.fields, 'Content-Type')).toBe(CT);
    expect(campo(r.fields, 'X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(campo(r.fields, 'X-Amz-Credential')).toMatch(
      new RegExp(`^${AKID}/\\d{8}/${REGIAO}/s3/aws4_request$`),
    );
    expect(campo(r.fields, 'X-Amz-Date')).toMatch(/^\d{8}T\d{6}Z$/);
    expect(campo(r.fields, 'X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    // Num POST multipart o Content-Type é campo do formulário, nunca header do pedido.
    const headers = (r.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('content-type');
  });

  it('a política impõe content-length-range com o maxBytes recebido (10 MB)', async () => {
    const r = await assinar(DEZ_MB);
    expect(r.method).toBe('POST');
    const p = decodificarPolitica(r.fields);
    const intervalo = intervaloTamanho(p);
    expect(intervalo, 'a política não tem content-length-range — o S3 aceita qualquer tamanho').toBeDefined();
    expect([0, 1]).toContain(intervalo![0]);
    expect(intervalo![1]).toBe(DEZ_MB);
  });

  it('o limite segue o maxBytes pedido, não uma constante (2 MB → 2 MB)', async () => {
    const dois = 2 * 1024 * 1024;
    const r = await assinar(dois);
    expect(r.method).toBe('POST');
    expect(intervaloTamanho(decodificarPolitica(r.fields))?.[1]).toBe(dois);
  });

  it('a política fixa a key exacta, o Content-Type exacto e o bucket', async () => {
    const r = await assinar();
    expect(r.method).toBe('POST');
    const p = decodificarPolitica(r.fields);
    expect(condicaoIgual(p, 'key'), 'a key não está presa na política').toEqual([KEY]);
    expect(startsWith(p, 'key'), 'starts-with na key abre o prefixo inteiro').toHaveLength(0);
    expect(condicaoIgual(p, 'Content-Type')).toEqual([CT]);
    expect(startsWith(p, 'Content-Type')).toHaveLength(0);
    expect(condicaoIgual(p, 'bucket')).toEqual([BUCKET]);
  });

  it('a política tem validade curta (futuro, menos de 10 minutos)', async () => {
    const antes = Date.now();
    const r = await assinar();
    expect(r.method).toBe('POST');
    const exp = Date.parse(decodificarPolitica(r.fields).expiration);
    expect(Number.isNaN(exp)).toBe(false);
    expect(exp).toBeGreaterThan(antes);
    expect(exp - antes).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  it('a política está assinada (SigV4 de POST) com a credencial do processo', async () => {
    const r = await assinar();
    expect(r.method).toBe('POST');
    const politicaB64 = campo(r.fields, 'Policy')!;
    const credencial = campo(r.fields, 'X-Amz-Credential')!;
    const [, data, regiao, servico] = credencial.split('/');
    expect(servico).toBe('s3');
    const kDate = hmac(`AWS4${SEGREDO}`, data!);
    const kRegion = hmac(kDate, regiao!);
    const kService = hmac(kRegion, servico!);
    const kSigning = hmac(kService, 'aws4_request');
    const esperado = createHmac('sha256', kSigning).update(politicaB64, 'utf8').digest('hex');
    expect(campo(r.fields, 'X-Amz-Signature'), 'a assinatura não cobre a política').toBe(esperado);
    // E os campos de assinatura estão também presos na política (como o S3 exige).
    const p = decodificarPolitica(r.fields);
    expect(condicaoIgual(p, 'X-Amz-Credential')).toEqual([credencial]);
    expect(condicaoIgual(p, 'X-Amz-Algorithm')).toEqual(['AWS4-HMAC-SHA256']);
    expect(condicaoIgual(p, 'X-Amz-Date')).toEqual([campo(r.fields, 'X-Amz-Date')]);
  });

  it('cada key tem a sua política (outra key → outra condição de key)', async () => {
    const outra = 'tenant/tenant-abc/fornecedor/ckxyz0000000000000000000/1700000000001-outro.pdf';
    const r = await assinar(DEZ_MB, outra, 'image/png');
    expect(r.method).toBe('POST');
    const p = decodificarPolitica(r.fields);
    expect(condicaoIgual(p, 'key')).toEqual([outra]);
    expect(condicaoIgual(p, 'Content-Type')).toEqual(['image/png']);
    expect(campo(r.fields, 'key')).toBe(outra);
  });
});

describe('#430 — local: o PUT do #418 fica igual', () => {
  it('presignPut local continua a ser PUT para a rota local com o Content-Type no header', async () => {
    const { criarLocalStorage } = await import('../local');
    const r = (await criarLocalStorage().presignPut(KEY, {
      contentType: CT,
      maxBytes: DEZ_MB,
    })) as Qualquer;
    expect(r.method ?? 'PUT').toBe('PUT');
    expect(r.url).toBe(`/api/documentos/local/${KEY}`);
    expect(r.headers).toEqual({ 'Content-Type': CT });
    expect(r.fields === undefined || Object.keys(r.fields).length === 0).toBe(true);
  });
});
