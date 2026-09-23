'use client';

/**
 * Tabela de buckets da projecção — CLIENT COMPONENT (colunas com `render`
 * não atravessam a fronteira RSC).
 *
 * A tabela é a FONTE da projecção; o gráfico é o resumo (R7.2) — nunca a
 * substitui. Saldos negativos são destacados sem depender só da cor (R6.2):
 * ícone de alerta + peso tipográfico, além do `text-destructive`.
 *
 * Dinheiro chega SERIALIZADO (`Decimal` → string, convenção da casa) e é
 * apresentado por `formatMZN`; datas por `format-date.ts` (fuso fixo
 * Africa/Maputo — um `toLocaleDateString` directo causaria falha de
 * hidratação silenciosa).
 */

import { TriangleAlert } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import type { Granularidade } from '@/lib/validations/tesouraria';

/** Bucket já serializado na fronteira SC→CC (`Decimal`→string, `Date`→ISO). */
export interface BucketSerializado {
  inicio: string;
  fim: string;
  entradas: string;
  saidas: string;
  saldoInicial: string;
  saldoFinal: string;
  /** N.º de ocorrências vencidas assinaladas neste bucket (R2.4). */
  vencidas: number;
}

function rotuloPeriodo(b: BucketSerializado, granularidade: Granularidade) {
  if (granularidade === 'DIARIA') return formatarData(b.inicio);
  return `${formatarData(b.inicio)} – ${formatarData(b.fim)}`;
}

const eNegativo = (valor: string) => valor.startsWith('-');

interface TabelaBucketsProps {
  buckets: BucketSerializado[];
  granularidade: Granularidade;
}

export function TabelaBuckets({ buckets, granularidade }: TabelaBucketsProps) {
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Período</TableHead>
            <TableHead className="text-right">Entradas</TableHead>
            <TableHead className="text-right">Saídas</TableHead>
            <TableHead className="text-right hidden md:table-cell">
              Saldo inicial
            </TableHead>
            <TableHead className="text-right">Saldo final</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {buckets.map((b) => {
            const negativo = eNegativo(b.saldoFinal);
            return (
              <TableRow
                key={b.inicio}
                className={cn(negativo && 'bg-destructive/5')}
              >
                <TableCell className="tabular-nums">
                  <span className="flex items-center gap-2">
                    {rotuloPeriodo(b, granularidade)}
                    {b.vencidas > 0 && (
                      <Badge variant="outline" className="text-warning">
                        {b.vencidas} em atraso
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums text-success">
                  {b.entradas === '0' ? '—' : `+${formatMZN(b.entradas)}`}
                </TableCell>
                <TableCell className="text-right tabular-nums text-destructive">
                  {b.saidas === '0' ? '—' : `−${formatMZN(b.saidas)}`}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground hidden md:table-cell">
                  {formatMZN(b.saldoInicial)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right tabular-nums',
                    negativo
                      ? 'font-bold text-destructive'
                      : 'font-medium',
                  )}
                >
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    {negativo && (
                      <>
                        <TriangleAlert
                          className="h-4 w-4"
                          aria-hidden="true"
                        />
                        <span className="sr-only">Saldo negativo:</span>
                      </>
                    )}
                    {formatMZN(b.saldoFinal)}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
