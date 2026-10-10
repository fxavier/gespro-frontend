import 'server-only';
import { createHmac } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStorage } from './porta';

/**
 * Adaptador S3 (produção). Config via env (`S3_BUCKET`, `S3_REGION`; `S3_ENDPOINT` e
 * `S3_FORCE_PATH_STYLE` para um S3 compatível, ex.: MinIO do perfil `full` — ADR-0017 §0);
 * credenciais via cadeia default do SDK (IAM role do App Runner) — ZERO
 * segredos no repo. O cliente S3 é preguiçoso e singleton por processo.
 */

const TTL_PUT_SEGUNDOS = 60;
const ALGORITMO = 'AWS4-HMAC-SHA256';

let clienteS3: S3Client | null = null;

function bucket(): string {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error('S3_BUCKET não definido (STORAGE_DRIVER=s3)');
  return b;
}

function cliente(): S3Client {
  if (clienteS3) return clienteS3;
  const region = process.env.S3_REGION;
  if (!region) throw new Error('S3_REGION não definido (STORAGE_DRIVER=s3)');
  const endpoint = process.env.S3_ENDPOINT || undefined;
  // Sem `credentials`: usa a cadeia default (IAM role / env / perfil).
  clienteS3 = new S3Client({
    region,
    endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  });
  return clienteS3;
}

/** URL do formulário POST: o bucket no endpoint configurado ou no endpoint regional da AWS. */
function urlDoBucket(b: string, region: string): string {
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) return `https://${b}.s3.${region}.amazonaws.com/`;
  const u = new URL(endpoint);
  if (process.env.S3_FORCE_PATH_STYLE === 'true') {
    return `${u.origin}${u.pathname.replace(/\/$/, '')}/${b}`;
  }
  return `${u.protocol}//${b}.${u.host}${u.pathname.replace(/\/$/, '')}/`;
}

function hmac(chave: Buffer | string, dados: string): Buffer {
  return createHmac('sha256', chave).update(dados, 'utf8').digest();
}

/**
 * Assina um upload por POST com política (SigV4 de POST, ADR-0017 §1). Ao contrário do PUT por
 * query-string, a política aceita `content-length-range`: o S3 recusa (400 EntityTooLarge) um
 * ficheiro acima de `maxBytes`. A key e o Content-Type ficam presos por igualdade exacta.
 */
async function assinarPost(key: string, contentType: string, maxBytes: number) {
  const region = process.env.S3_REGION!;
  const b = bucket();
  const cred = await cliente().config.credentials();
  const agora = new Date();
  const amzDate = agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dia = amzDate.slice(0, 8);
  const credencial = `${cred.accessKeyId}/${dia}/${region}/s3/aws4_request`;

  const fields: Record<string, string> = {
    bucket: b,
    key,
    'Content-Type': contentType,
    'X-Amz-Algorithm': ALGORITMO,
    'X-Amz-Credential': credencial,
    'X-Amz-Date': amzDate,
  };
  if (cred.sessionToken) fields['X-Amz-Security-Token'] = cred.sessionToken;

  const politica = {
    expiration: new Date(agora.getTime() + TTL_PUT_SEGUNDOS * 1000).toISOString(),
    conditions: [
      ...Object.entries(fields).map(([k, v]) => ({ [k]: v })),
      ['content-length-range', 0, maxBytes],
    ],
  };
  const politicaB64 = Buffer.from(JSON.stringify(politica), 'utf8').toString('base64');
  const kDate = hmac(`AWS4${cred.secretAccessKey}`, dia);
  const kSigning = hmac(hmac(hmac(kDate, region), 's3'), 'aws4_request');
  const assinatura = createHmac('sha256', kSigning).update(politicaB64, 'utf8').digest('hex');

  return {
    method: 'POST' as const,
    url: urlDoBucket(b, region),
    fields: { ...fields, Policy: politicaB64, 'X-Amz-Signature': assinatura },
    // Num POST multipart o Content-Type vai no formulário; o browser põe o do pedido.
    headers: {},
  };
}

export function criarS3Storage(): ObjectStorage {
  return {
    async presignPut(key, { contentType, maxBytes }) {
      return assinarPost(key, contentType, maxBytes);
    },

    async presignGet(key, ttlSegundos) {
      const comando = new GetObjectCommand({ Bucket: bucket(), Key: key });
      return getSignedUrl(cliente(), comando, { expiresIn: ttlSegundos });
    },

    async put(key, bytes, contentType) {
      await cliente().send(
        new PutObjectCommand({ Bucket: bucket(), Key: key, Body: bytes, ContentType: contentType }),
      );
    },

    async delete(key) {
      await cliente().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
    },
  };
}
