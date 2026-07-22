/**
 * Infraestrutura central de exportação (camada G/plataforma).
 *
 * Uso exclusivo por Route Handlers (`withApi`) — NUNCA por Server Actions
 * (exportação não é mutação). Ver `src/app/api/export/[modulo]/route.ts`.
 */
export {
  type Column,
  type ColumnType,
  type Dataset,
  type Row,
  type CellValue,
  type DecimalLike,
  serializeCell,
  displayCell,
  safeFilename,
} from './dataset';
export { toCsv } from './csv';
export { toXlsx, XLSX_CONTENT_TYPE } from './xlsx';

import { type Dataset, safeFilename } from './dataset';
import { toCsv } from './csv';
import { toXlsx, XLSX_CONTENT_TYPE } from './xlsx';

export type FormatoExport = 'csv' | 'xlsx';

export function isFormatoExport(v: string | null | undefined): v is FormatoExport {
  return v === 'csv' || v === 'xlsx';
}

/**
 * Constrói uma `Response` de download a partir de um `Dataset`.
 * Nomeação e content-type correctos por formato (Requisito 1.2).
 */
export function exportResponse(ds: Dataset, formato: FormatoExport): Response {
  const base = safeFilename(ds.nome);

  if (formato === 'csv') {
    return new Response(toCsv(ds), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${base}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const body = toXlsx(ds);
  return new Response(body as unknown as BodyInit, {
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${base}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
