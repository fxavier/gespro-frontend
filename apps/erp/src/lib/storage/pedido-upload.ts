/**
 * Monta o pedido de upload a partir da assinatura devolvida por `POST /api/documentos/presign`
 * (issue #430). Client-safe: usado pelo `<UploadDocumento>`.
 *
 *   - `PUT` (driver local, #418): o ficheiro cru com os `requiredHeaders`;
 *   - `POST` (driver s3, ADR-0017 §1): multipart com os `uploadFields` assinados pela ordem
 *     recebida e o ficheiro em `file`, em último (o S3 ignora o que vem depois do ficheiro).
 *     Sem header Content-Type: o browser põe o do multipart, com o boundary.
 */

export interface AssinaturaUpload {
  uploadUrl: string;
  uploadMethod: string;
  uploadFields?: Record<string, string>;
  requiredHeaders: Record<string, string>;
}

export interface PedidoUpload {
  method: 'PUT' | 'POST';
  url: string;
  headers: Record<string, string>;
  body: Blob | FormData;
}

export function montarPedidoUpload(assinatura: AssinaturaUpload, file: Blob): PedidoUpload {
  const { uploadUrl, uploadMethod, uploadFields, requiredHeaders } = assinatura;
  if (uploadMethod === 'PUT') {
    return { method: 'PUT', url: uploadUrl, headers: requiredHeaders, body: file };
  }
  if (uploadMethod === 'POST') {
    const form = new FormData();
    for (const [k, v] of Object.entries(uploadFields ?? {})) form.append(k, v);
    form.append('file', file);
    const headers = Object.fromEntries(
      Object.entries(requiredHeaders).filter(([k]) => k.toLowerCase() !== 'content-type'),
    );
    return { method: 'POST', url: uploadUrl, headers, body: form };
  }
  throw new Error(`Método de upload desconhecido: ${uploadMethod}`);
}

/**
 * SHA-256 do ficheiro em base64 — vai no pedido de presign e, no driver s3, fica preso na
 * política do POST (#575: um bucket com Object Lock e retenção por omissão recusa escritas sem
 * checksum). Lê o ficheiro inteiro em memória; o tecto de upload é `MAX_DOCUMENTO_BYTES` (10 MB).
 * `undefined` fora de um contexto seguro (sem `crypto.subtle`): o driver local não precisa dele.
 */
export async function calcularSha256Base64(file: Blob): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return undefined;
  const digest = new Uint8Array(await subtle.digest('SHA-256', await file.arrayBuffer()));
  let binario = '';
  for (const b of digest) binario += String.fromCharCode(b);
  return btoa(binario);
}
