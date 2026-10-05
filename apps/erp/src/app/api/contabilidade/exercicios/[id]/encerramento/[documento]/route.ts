/**
 * GET /api/contabilidade/exercicios/[id]/encerramento/[documento] — descarrega um dos PDF
 * arquivados no encerramento EM VIGOR do exercício (ADR-0035 §8, issue #365).
 * `documento` ∈ balanco | dre | balancete (outro ⇒ 404).
 *
 * `withApi`, permissão `financas:exportar`. 302 para um URL assinado de 300 s da key. 404 —
 * nunca 403 — para outro tenant, sem encerramento em vigor (nunca encerrado, ou reaberto) e
 * documento por arquivar. A key reafirma-se sob o prefixo do tenant antes de assinar.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { NotFoundError } from '@/lib/errors';
import { getObjectStorage } from '@/lib/storage/objeto';
import {
  DOCUMENTOS_ARQUIVO_ENCERRAMENTO,
  keyArquivoEncerramento,
  type DocumentoArquivoEncerramento,
} from '@/server/services/financas/encerramento-exercicio.service';

export const runtime = 'nodejs';

const TTL_SEGUNDOS = 300;

export const GET = withApi(
  async (req: NextRequest, api) => {
    const exercicioId = String(api.params.id ?? '');
    const documento = String(api.params.documento ?? '');
    if (!(DOCUMENTOS_ARQUIVO_ENCERRAMENTO as readonly string[]).includes(documento)) {
      throw new NotFoundError('Documento desconhecido');
    }
    const key = await keyArquivoEncerramento(
      exercicioId,
      documento as DocumentoArquivoEncerramento,
      { tenantId: api.tenantId, userId: api.userId },
    );
    const assinado = await getObjectStorage().presignGet(key, TTL_SEGUNDOS);
    // s3 devolve URL absoluta; o adaptador local um caminho, resolvido contra a origem do pedido.
    const destino = /^https?:\/\//i.test(assinado) ? assinado : new URL(assinado, req.nextUrl.origin).toString();
    return NextResponse.redirect(destino, 302);
  },
  { permission: 'financas:exportar' },
);
