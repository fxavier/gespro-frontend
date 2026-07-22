/**
 * Gerador de XLSX a partir de `Dataset` — usa a dependência `xlsx` já existente.
 *
 * Decisão de formato (ADR-0005): valores `decimal`/`currency` são escritos como
 * TEXTO (string lossless de `serializeCell`) e não como número de vírgula
 * flutuante — preserva a precisão exacta do `Prisma.Decimal` (requisito
 * inegociável do CLAUDE.md). Colunas `integer` são escritas como número (para
 * ordenação/soma nativas do Excel). Datas em ISO como texto (determinístico).
 */
import * as XLSX from 'xlsx';
import { type Dataset, type Column, type CellValue, serializeCell } from './dataset';

/** Nome de folha válido no Excel (≤31 chars, sem `[]:*?/\`). */
function sheetName(nome: string): string {
  return (nome.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Folha1').slice(0, 31);
}

function cell(value: CellValue, col: Column): string | number {
  const type = col.type ?? 'text';
  if (type === 'integer') {
    if (value === null || value === undefined || value === '') return '';
    return typeof value === 'number' ? Math.trunc(value) : Number(value.toString());
  }
  // decimal/currency/date/datetime/text/boolean → texto lossless
  return serializeCell(value, type);
}

export function toXlsx(ds: Dataset): Uint8Array {
  const aoa: (string | number)[][] = [];

  if (ds.meta && ds.meta.length > 0) {
    for (const [k, v] of ds.meta) aoa.push([k, v]);
    aoa.push([]);
  }

  aoa.push(ds.colunas.map((c) => c.header));
  for (const linha of ds.linhas) {
    aoa.push(ds.colunas.map((c) => cell(linha[c.key], c)));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName(ds.nome));

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Uint8Array(buf);
}

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
