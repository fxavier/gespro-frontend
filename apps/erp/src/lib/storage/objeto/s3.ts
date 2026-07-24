import 'server-only';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStorage } from './porta';

/**
 * Adaptador S3 (produção). Config via env (`S3_BUCKET`, `S3_REGION`);
 * credenciais via cadeia default do SDK (IAM role do App Runner) — ZERO
 * segredos no repo. O cliente S3 é preguiçoso e singleton por processo.
 */

const TTL_PUT_SEGUNDOS = 60;

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
  // Sem `credentials`: usa a cadeia default (IAM role / env / perfil).
  clienteS3 = new S3Client({ region });
  return clienteS3;
}

export function criarS3Storage(): ObjectStorage {
  return {
    async presignPut(key, { contentType }) {
      const comando = new PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        ContentType: contentType,
      });
      const url = await getSignedUrl(cliente(), comando, {
        expiresIn: TTL_PUT_SEGUNDOS,
      });
      // Content-Type faz parte da assinatura: o cliente TEM de o reenviar.
      return { url, headers: { 'Content-Type': contentType } };
    },

    async presignGet(key, ttlSegundos) {
      const comando = new GetObjectCommand({ Bucket: bucket(), Key: key });
      return getSignedUrl(cliente(), comando, { expiresIn: ttlSegundos });
    },

    async delete(key) {
      await cliente().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
    },
  };
}
