/**
 * Gerador de CSV a partir de `Dataset` — puro e testável.
 *
 * - Separador `;` (padrão europeu; Excel pt-PT reconhece nativamente).
 * - BOM UTF-8 (`﻿`) para acentuação correcta no Excel.
 * - `Decimal` serializado lossless via `serializeCell` (ponto decimal).
 * - Escape RFC-4180 (aspas duplicadas, campos com `;`/aspas/quebras entre aspas).
 * - Texto neutralizado contra injecção de fórmulas (#294) antes do escape.
 */
import { type Dataset, serializeCell } from './dataset';

function escape(cell: string): string {
  return /[";\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/**
 * Prefixa `'` a uma célula de texto que comece por `=`, `+`, `-`, `@`, TAB ou CR,
 * para que o Excel/LibreOffice a leia como texto e não como fórmula (OWASP CSV
 * Injection). Só para texto: um negativo em coluna numérica não é fórmula.
 */
export function neutralizarFormula(celula: string): string {
  return /^[=+\-@\t\r]/.test(celula) ? `'${celula}` : celula;
}

/** Célula de texto pronta a escrever num CSV construído à mão: neutralizada e escapada. */
export function celulaTextoCsv(celula: string): string {
  return escape(neutralizarFormula(celula));
}

export function toCsv(ds: Dataset): string {
  const linhas: string[] = [];

  // Metadados opcionais (cabeçalho de relatório), separados por linha em branco.
  if (ds.meta && ds.meta.length > 0) {
    for (const [k, v] of ds.meta) linhas.push(`${celulaTextoCsv(k)};${celulaTextoCsv(v)}`);
    linhas.push('');
  }

  linhas.push(ds.colunas.map((c) => celulaTextoCsv(c.header)).join(';'));
  for (const linha of ds.linhas) {
    linhas.push(
      ds.colunas
        .map((c) => {
          const celula = serializeCell(linha[c.key], c.type);
          return (c.type ?? 'text') === 'text' ? celulaTextoCsv(celula) : escape(celula);
        })
        .join(';'),
    );
  }

  return '﻿' + linhas.join('\r\n');
}
