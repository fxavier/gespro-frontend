/**
 * Gerador de XLSX a partir de `Dataset` — usa a dependência `xlsx` já existente.
 *
 * Decisão de formato (ADR-0005, emendado pela #300): valores `decimal`/`currency`
 * com ≤ 15 dígitos significativos são escritos como NÚMERO com formato `#,##0.00`
 * (o Excel soma-os) — com até 15 dígitos o `double` devolve exactamente o
 * `Decimal.toString()`, logo não há perda. Acima disso ficam TEXTO lossless
 * (recusar > número errado). A conversão só acontece aqui, na escrita; o
 * `Dataset` continua a levar o `Decimal`. Colunas `integer` como número; datas em
 * ISO como texto; texto continua texto (nunca fórmula, #294).
 */
import * as XLSX from 'xlsx';
import { type Dataset, type Column, type CellValue, serializeCell } from './dataset';

/** Nome de folha válido no Excel (≤31 chars, sem `[]:*?/\`). */
function sheetName(nome: string): string {
  return (nome.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Folha1').slice(0, 31);
}

const FORMATO_DECIMAL = '#,##0.00';
/** Máximo de dígitos significativos que um `double` devolve sem alteração. */
const MAX_DIGITOS_EXACTOS = 15;

/** Número exacto para o `Decimal` serializado, ou `null` se não couber num `double`. */
function numeroExacto(s: string): number | null {
  const m = /^-?(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const digitos = (m[1]! + (m[2] ?? '')).replace(/^0+/, '').replace(/0+$/, '');
  return digitos.length <= MAX_DIGITOS_EXACTOS ? Number(s) : null;
}

type Celula = string | number | XLSX.CellObject;

function cell(value: CellValue, col: Column): Celula {
  const type = col.type ?? 'text';
  if (type === 'integer') {
    if (value === null || value === undefined || value === '') return '';
    return typeof value === 'number' ? Math.trunc(value) : Number(value.toString());
  }
  if (type === 'decimal' || type === 'currency') {
    const texto = serializeCell(value, type);
    const n = texto === '' ? null : numeroExacto(texto);
    return n === null ? texto : { t: 'n', v: n, z: FORMATO_DECIMAL };
  }
  // date/datetime/text/boolean → texto lossless
  return serializeCell(value, type);
}

export function toXlsx(ds: Dataset): Uint8Array {
  const aoa: Celula[][] = [];

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
