/**
 * ORÁCULO (lacuna, issue #430, ADR-0017 §1) — o cliente de upload envia multipart quando o
 * driver o pede.
 *
 * Contrato (decidido pelo orquestrador; a forma do módulo é escolha do verificador, porque o
 * `upload-documento.tsx` é um componente cliente e o projecto `unit` não tem DOM):
 *   - módulo client-safe `src/lib/storage/pedido-upload.ts` (sem `server-only`), que exporta
 *     `montarPedidoUpload(assinatura, file)` → `{ method, url, headers, body }`, onde `assinatura`
 *     é o `data` do presign (`{ uploadUrl, uploadMethod, uploadFields?, requiredHeaders }`):
 *       · `uploadMethod: 'PUT'` (driver local, #418) → PUT para `uploadUrl`, `headers` =
 *         `requiredHeaders`, `body` = o próprio ficheiro — como hoje;
 *       · `uploadMethod: 'POST'` (driver s3) → POST para `uploadUrl` com `FormData`: todos os
 *         `uploadFields`, pela ordem recebida, e o ficheiro em `file` como ÚLTIMO campo (o S3 ignora
 *         campos depois do ficheiro); nenhum header `Content-Type` (o browser põe o boundary);
 *       · outro método → lança (recusar > enviar errado).
 *   - `upload-documento.tsx` usa este módulo e deixa de fixar `PUT` no XHR.
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; um agente de
 * implementação que altere este ficheiro é BLOCKER.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Qualquer = any;

// Import dinâmico por variável: o módulo ainda não existe e cada caso deve falhar sozinho.
const MODULO: string = '@/lib/storage/pedido-upload';
async function carregar(): Promise<Qualquer> {
  return import(/* @vite-ignore */ MODULO);
}

const FICHEIRO = () => new File([new Uint8Array([37, 80, 68, 70, 45, 49])], 'contrato.pdf', {
  type: 'application/pdf',
});

describe('#430 — montarPedidoUpload', () => {
  it('PUT (driver local): envia o ficheiro cru com os requiredHeaders', async () => {
    const { montarPedidoUpload } = await carregar();
    const file = FICHEIRO();
    const pedido = montarPedidoUpload(
      {
        uploadUrl: '/api/documentos/local/tenant/t/fornecedor/x/1-contrato.pdf',
        uploadMethod: 'PUT',
        requiredHeaders: { 'Content-Type': 'application/pdf' },
      },
      file,
    );
    expect(pedido.method).toBe('PUT');
    expect(pedido.url).toBe('/api/documentos/local/tenant/t/fornecedor/x/1-contrato.pdf');
    expect(pedido.headers).toEqual({ 'Content-Type': 'application/pdf' });
    expect(pedido.body).toBe(file);
  });

  it('POST (driver s3): FormData com os campos assinados pela ordem e o ficheiro em último', async () => {
    const { montarPedidoUpload } = await carregar();
    const file = FICHEIRO();
    const uploadFields = {
      bucket: 'gespro-uploads',
      key: 'tenant/t/fornecedor/x/1-contrato.pdf',
      'Content-Type': 'application/pdf',
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': 'AKIA/20261010/af-south-1/s3/aws4_request',
      'X-Amz-Date': '20261010T120000Z',
      Policy: 'eyJjb25kaXRpb25zIjpbXX0=',
      'X-Amz-Signature': 'a'.repeat(64),
    };
    const pedido = montarPedidoUpload(
      {
        uploadUrl: 'https://gespro-uploads.s3.af-south-1.amazonaws.com/',
        uploadMethod: 'POST',
        uploadFields,
        requiredHeaders: {},
      },
      file,
    );
    expect(pedido.method).toBe('POST');
    expect(pedido.url).toBe('https://gespro-uploads.s3.af-south-1.amazonaws.com/');
    expect(pedido.body).toBeInstanceOf(FormData);
    const entradas = [...(pedido.body as FormData).entries()];
    const nomes = entradas.map(([n]) => n);
    expect(nomes).toEqual([...Object.keys(uploadFields), 'file']);
    for (const [n, v] of entradas.slice(0, -1)) {
      expect(v).toBe(uploadFields[n as keyof typeof uploadFields]);
    }
    const [, enviado] = entradas.at(-1)!;
    expect(enviado).toBeInstanceOf(Blob);
    expect(new Uint8Array(await (enviado as Blob).arrayBuffer())).toEqual(
      new Uint8Array(await file.arrayBuffer()),
    );
    const headers = (pedido.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('content-type');
  });

  it('método desconhecido → lança (não adivinha)', async () => {
    const { montarPedidoUpload } = await carregar();
    expect(() =>
      montarPedidoUpload(
        { uploadUrl: '/x', uploadMethod: 'PATCH', requiredHeaders: {} },
        FICHEIRO(),
      ),
    ).toThrow();
  });
});

describe('#430 — o componente usa o pedido montado', () => {
  const RAIZ = resolve(__dirname, '../../..');
  const fonteComponente = () =>
    readFileSync(resolve(RAIZ, 'components/patterns/upload-documento.tsx'), 'utf-8');

  it('pedido-upload.ts é client-safe (não importa server-only)', () => {
    let fonte = '';
    try {
      fonte = readFileSync(resolve(RAIZ, 'lib/storage/pedido-upload.ts'), 'utf-8');
    } catch {
      /* ainda não existe */
    }
    expect(fonte, 'src/lib/storage/pedido-upload.ts não existe').not.toBe('');
    expect(fonte).not.toMatch(/['"]server-only['"]/);
  });

  it('upload-documento.tsx importa montarPedidoUpload e não fixa PUT no XHR', () => {
    const fonte = fonteComponente();
    expect(fonte).toMatch(/montarPedidoUpload/);
    expect(fonte).toMatch(/from\s+['"]@\/lib\/storage\/pedido-upload['"]/);
    expect(fonte, 'o XHR continua preso a PUT').not.toMatch(/\.open\(\s*['"]PUT['"]/);
  });
});
