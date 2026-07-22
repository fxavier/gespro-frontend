/**
 * Gerador de CSV a partir de `Dataset` — puro e testável.
 *
 * - Separador `;` (padrão europeu; Excel pt-PT reconhece nativamente).
 * - BOM UTF-8 (`﻿`) para acentuação correcta no Excel.
 * - `Decimal` serializado lossless via `serializeCell` (ponto decimal).
 * - Escape RFC-4180 (aspas duplicadas, campos com `;`/aspas/quebras entre aspas).
 */
import { type Dataset, serializeCell } from './dataset';

function escape(cell: string): string {
  return /[";\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

export function toCsv(ds: Dataset): string {
  const linhas: string[] = [];

  // Metadados opcionais (cabeçalho de relatório), separados por linha em branco.
  if (ds.meta && ds.meta.length > 0) {
    for (const [k, v] of ds.meta) linhas.push(`${escape(k)};${escape(v)}`);
    linhas.push('');
  }

  linhas.push(ds.colunas.map((c) => escape(c.header)).join(';'));
  for (const linha of ds.linhas) {
    linhas.push(ds.colunas.map((c) => escape(serializeCell(linha[c.key], c.type))).join(';'));
  }

  return '﻿' + linhas.join('\r\n');
}
